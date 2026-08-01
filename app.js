"use strict";

// ---------------------------------------------------------------------------
// Question bank & constants
// ---------------------------------------------------------------------------

const BANK = window.QUESTION_BANK || [];

const DOMAINS = {
  1: "Setting up a cloud solution environment",
  2: "Planning & configuring a cloud solution",
  3: "Deploying & implementing a cloud solution",
  4: "Ensuring successful operation",
  5: "Configuring access & security",
};

// Official exam-guide weighting (20/17.5/25/20/17.5) applied to a 50-question mock.
const MOCK_MIX = { 1: 10, 2: 9, 3: 12, 4: 10, 5: 9 };

const STORE_KEY = "gcp-ace-progress-v1";
const QUIZ_RESUME_KEY = "gcp-ace-quiz-inprogress-v1";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === "object" && s.attempts && Array.isArray(s.sessions)) return s;
    }
  } catch (e) { /* corrupted store — start fresh */ }
  return { attempts: {}, sessions: [] };
}

let store = loadStore();

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  // Push to Firestore when a user is signed in (auth.js installs window.cloudSync).
  if (window.cloudSync) window.cloudSync.scheduleSave(store);
}

// ---------------------------------------------------------------------------
// Quiz-in-progress persistence — without this, `quiz` (below) is memory-only,
// so a refresh, crash, or accidental back-navigation mid-mock-exam loses the
// entire session with nothing recorded. Stores just enough to rehydrate:
// question IDs (not full question objects — those are looked up again from
// BANK by id, so a bank edit that removes a question fails safely rather
// than resurrecting stale data), position, running score, and the mock
// timer's absolute end time.
// ---------------------------------------------------------------------------

function saveQuizProgress() {
  if (!quiz) return;
  try {
    localStorage.setItem(QUIZ_RESUME_KEY, JSON.stringify({
      mode: quiz.mode,
      qIds: quiz.qs.map((q) => q.id),
      i: quiz.i,
      correct: quiz.correct,
      byDomain: quiz.byDomain,
      timerEndsAt: quiz.mode === "mock" ? timerEndsAt : null,
      savedAt: Date.now(),
    }));
  } catch (e) { /* localStorage unavailable (quota, private mode) — resume just won't be offered */ }
}

function clearQuizProgress() {
  try { localStorage.removeItem(QUIZ_RESUME_KEY); } catch (e) { /* ignore */ }
}

function loadQuizProgress() {
  try {
    const raw = localStorage.getItem(QUIZ_RESUME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Rehydrates saved question IDs against the live bank. Returns null (and
// clears the stale snapshot) if the shape is wrong or any question no longer
// exists — e.g. data/*.js was edited between the save and the resume.
function rehydrateQuizProgress(saved) {
  if (!saved || !Array.isArray(saved.qIds) || typeof saved.i !== "number") { clearQuizProgress(); return null; }
  const qs = saved.qIds.map((id) => BANK.find((q) => q.id === id)).filter(Boolean);
  if (qs.length !== saved.qIds.length || saved.i < 0 || saved.i >= qs.length) { clearQuizProgress(); return null; }
  return qs;
}

// ---------------------------------------------------------------------------
// Cloud sync bridge (used by auth.js; harmless when Firebase isn't configured)
// ---------------------------------------------------------------------------

// Merge two progress stores without losing data: for each question keep the
// attempt record with more answers (newest timestamp breaks ties); sessions
// are unioned and deduped by their start timestamp.
function mergeStores(a, b) {
  const out = { attempts: {}, sessions: [] };
  const ids = new Set([...Object.keys(a.attempts), ...Object.keys(b.attempts)]);
  for (const id of ids) {
    const x = a.attempts[id], y = b.attempts[id];
    if (x && y) {
      const nx = x.c + x.w, ny = y.c + y.w;
      out.attempts[id] = ny > nx || (ny === nx && (y.t || 0) > (x.t || 0)) ? y : x;
    } else {
      out.attempts[id] = x || y;
    }
  }
  const seen = new Set();
  out.sessions = [...a.sessions, ...b.sessions]
    .filter((s) => (seen.has(s.d) ? false : (seen.add(s.d), true)))
    .sort((x, y) => (x.d < y.d ? -1 : 1))
    .slice(-300);
  return out;
}

window.cloudBridge = {
  getStore: () => store,
  // Called on sign-in with the user's cloud copy: merge with whatever was done
  // locally (e.g., as a guest), persist, and re-render.
  applyRemote(remote) {
    store = mergeStores(store, remote || { attempts: {}, sessions: [] });
    saveStore();
    renderDashboard();
    return store;
  },
  // Called on sign-out: the cloud keeps the data; this device forgets it.
  clearLocal() {
    store = { attempts: {}, sessions: [] };
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    renderDashboard();
  },
};

// ---------------------------------------------------------------------------
// Question selection: unseen first, then previously-missed, then oldest-seen
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions(n, domain) {
  const pool = BANK.filter((q) => !domain || q.domain === domain);
  const unseen = [], missed = [], seen = [];
  for (const q of pool) {
    const at = store.attempts[q.id];
    if (!at) unseen.push(q);
    else if (at.last === 0) missed.push(q);
    else seen.push(q);
  }
  seen.sort((a, b) => (store.attempts[a.id].t || 0) - (store.attempts[b.id].t || 0));
  const ordered = shuffle(unseen).concat(shuffle(missed), seen);
  return shuffle(ordered.slice(0, n));
}

function buildQuizSet(mode) {
  if (mode === "quick") return pickQuestions(10);
  if (mode === "domain") {
    const d = Number(document.getElementById("domain-select").value);
    return pickQuestions(20, d);
  }
  if (mode === "missed") {
    const qs = BANK.filter((q) => store.attempts[q.id] && store.attempts[q.id].last === 0);
    return shuffle(qs).slice(0, 30);
  }
  if (mode === "mock") {
    let qs = [];
    for (const [d, count] of Object.entries(MOCK_MIX)) {
      qs = qs.concat(pickQuestions(count, Number(d)));
    }
    return shuffle(qs);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Quiz state machine
// ---------------------------------------------------------------------------

let quiz = null;       // { qs, i, correct, byDomain, mode, checked, selection }
let lastMode = "quick";
let timerHandle = null;
let timerEndsAt = null;

function startQuiz(mode) {
  const qs = buildQuizSet(mode);
  if (qs.length === 0) {
    showToast(mode === "missed"
      ? "Nothing to review — you have no questions whose last answer was wrong. Nice."
      : "No questions available.");
    return;
  }
  layoutAuthForHome();
  lastMode = mode;
  quiz = { qs, i: 0, correct: 0, byDomain: {}, mode, checked: false, selection: new Set() };
  window.trackEvent?.("quiz_start", { mode, question_count: qs.length });
  resetChat();
  show("view-quiz");
  const timerEl = document.getElementById("timer");
  if (mode === "mock") {
    timerEndsAt = Date.now() + 120 * 60 * 1000;
    timerEl.hidden = false;
    tickTimer();
    timerHandle = setInterval(tickTimer, 1000);
  } else {
    timerEl.hidden = true;
  }
  saveQuizProgress(); // after timerEndsAt is set above, so a mock's first snapshot has the real deadline
  renderQuestion();
}

function tickTimer() {
  const left = Math.max(0, timerEndsAt - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const el = document.getElementById("timer");
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", left < 10 * 60 * 1000);
  if (left <= 0) {
    stopTimer();
    finishQuiz();
  }
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

function currentQ() { return quiz.qs[quiz.i]; }
function isMulti(q) { return Array.isArray(q.a); }

function renderQuestion() {
  const q = currentQ();
  quiz.checked = false;
  quiz.selection = new Set();
  // Display options in random order (bank stores the correct answer first).
  quiz.order = shuffle(q.o.map((_, i) => i));

  document.getElementById("q-counter").textContent = `Question ${quiz.i + 1} of ${quiz.qs.length}`;
  document.getElementById("q-domain").textContent = DOMAINS[q.domain];
  document.getElementById("q-progress").style.width = `${(quiz.i / quiz.qs.length) * 100}%`;
  document.getElementById("q-text").textContent = q.q;
  document.getElementById("q-multinote").hidden = !isMulti(q);
  document.getElementById("q-feedback").hidden = true;
  document.getElementById("q-check").hidden = false;
  document.getElementById("q-check").disabled = true;
  document.getElementById("q-next").hidden = true;
  // Footer ad slot: sits below the Check/Next buttons, outside the question
  // card, so it's visually separated from every clickable option — shown for
  // the whole question now, not just after checking. AdsBridge.reveal() only
  // ever inserts the <ins> once (fillSlot's dataset.filled guard), so this
  // doesn't request a fresh ad per question, just keeps the same one visible.
  const quizAdSlot = document.getElementById("quiz-ad-slot");
  if (quizAdSlot) {
    quizAdSlot.hidden = false;
    window.AdsBridge?.reveal(quizAdSlot);
  }

  const box = document.getElementById("q-options");
  box.innerHTML = "";
  quiz.order.forEach((origIdx, pos) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.dataset.idx = origIdx;
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String.fromCharCode(65 + pos);
    const body = document.createElement("span");
    body.textContent = q.o[origIdx];
    b.append(key, body);
    b.onclick = () => toggleOption(origIdx);
    box.appendChild(b);
  });
}

function toggleOption(idx) {
  if (quiz.checked) return;
  const q = currentQ();
  if (isMulti(q)) {
    if (quiz.selection.has(idx)) quiz.selection.delete(idx);
    else quiz.selection.add(idx);
  } else {
    quiz.selection = new Set([idx]);
  }
  document.querySelectorAll("#q-options .opt").forEach((el) => {
    el.classList.toggle("selected", quiz.selection.has(Number(el.dataset.idx)));
  });
  document.getElementById("q-check").disabled = quiz.selection.size === 0;
}

function checkAnswer() {
  if (quiz.checked || quiz.selection.size === 0) return;
  quiz.checked = true;
  const q = currentQ();
  const correctSet = new Set(isMulti(q) ? q.a : [q.a]);
  const picked = quiz.selection;
  const ok = picked.size === correctSet.size && [...picked].every((i) => correctSet.has(i));

  document.querySelectorAll("#q-options .opt").forEach((el) => {
    const idx = Number(el.dataset.idx);
    el.classList.add("locked");
    el.classList.remove("selected");
    if (correctSet.has(idx)) el.classList.add("correct");
    else if (picked.has(idx)) el.classList.add("wrong");
  });

  const fb = document.getElementById("q-feedback");
  fb.hidden = false;
  fb.className = "feedback " + (ok ? "ok" : "no");
  const letters = [...correctSet]
    .map((i) => quiz.order.indexOf(i))
    .sort((a, b) => a - b)
    .map((pos) => String.fromCharCode(65 + pos))
    .join(", ");
  document.getElementById("q-verdict").textContent = ok
    ? "Correct"
    : `Incorrect — the answer is ${letters}`;
  document.getElementById("q-explanation").textContent = q.x;

  // Record the attempt
  const at = store.attempts[q.id] || { c: 0, w: 0, last: 1, t: 0 };
  if (ok) at.c += 1; else at.w += 1;
  at.last = ok ? 1 : 0;
  at.t = Date.now();
  store.attempts[q.id] = at;
  saveStore();

  if (ok) quiz.correct += 1;
  const bd = quiz.byDomain[q.domain] || [0, 0];
  bd[0] += ok ? 1 : 0;
  bd[1] += 1;
  quiz.byDomain[q.domain] = bd;

  document.getElementById("q-check").hidden = true;
  const next = document.getElementById("q-next");
  next.hidden = false;
  next.textContent = quiz.i === quiz.qs.length - 1 ? "Finish" : "Next";
  next.focus();
}

function nextQuestion() {
  if (quiz.i === quiz.qs.length - 1) { finishQuiz(); return; }
  quiz.i += 1;
  // Saved at question boundaries only (here and in startQuiz), never mid-
  // feedback — so a resumed quiz always lands on a clean, unanswered
  // question rather than reconstructing a half-answered, ambiguous one.
  saveQuizProgress();
  renderQuestion();
}

function quitQuiz() {
  stopTimer();
  const answered = Object.values(quiz.byDomain).reduce((s, [, t]) => s + t, 0);
  if (answered > 0) finishQuiz(true);
  else { clearQuizProgress(); quiz = null; goHome(); }
}

// Accuracy band shared by the score ring and the per-domain breakdown bars —
// keeps "good/warn/bad" meaning consistent everywhere on the results screen.
function bandOf(pct) {
  if (pct >= 80) return "good";
  if (pct >= 50) return "warn";
  return "bad";
}

function scoreLabel(pct, mode, answered) {
  if (!answered) return "No questions answered";
  if (mode === "mock") {
    if (pct >= 70) return pct >= 90 ? "Excellent — well past the passing bar" : "Solid — at the typical passing bar";
    return "Keep practicing — below the typical ~70% passing bar";
  }
  if (pct >= 90) return "Excellent";
  if (pct >= 75) return "Great work";
  if (pct >= 50) return "Getting there";
  return "Keep practicing";
}

function setScoreRing(pct) {
  const ring = document.getElementById("r-ring");
  const circumference = 2 * Math.PI * 52;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference * (1 - pct / 100)}`;
  ring.classList.remove("band-good", "band-warn", "band-bad");
  ring.classList.add(`band-${bandOf(pct)}`);
}

const FLAG_ICON = `<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M5 17V3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 4.2l8.5 2.1c1 .25 1 1.65 0 1.9L5 10.3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/></svg>`;

// Set alongside the breakdown so the "Practice weakest domain" button (in the
// results actions row) knows which domain to jump into.
let lastWeakestDomain = null;

function renderResultsBreakdown(byDomain, mode) {
  const rows = Object.entries(byDomain)
    .map(([d, [c, t]]) => ({ d: Number(d), c, t, pct: Math.round((c / t) * 100) }))
    .sort((a, b) => a.pct - b.pct || a.d - b.d);

  lastWeakestDomain = (mode === "domain" || rows.length === 0 || rows[0].pct === 100) ? null : rows[0];
  const cta = document.getElementById("r-weakest-cta");
  cta.hidden = !lastWeakestDomain;
  if (lastWeakestDomain) {
    cta.textContent = `Practice Domain ${lastWeakestDomain.d}: ${DOMAINS[lastWeakestDomain.d]}`;
  }

  document.getElementById("r-breakdown").innerHTML = rows.map((row) => {
    const isWeak = lastWeakestDomain && row.d === lastWeakestDomain.d;
    const band = bandOf(row.pct);
    return `<div class="domain-bar-row">
      <div class="domain-bar-head">
        <span class="domain-bar-name">${row.d}. ${DOMAINS[row.d]}${isWeak ? `<span class="domain-flag">${FLAG_ICON}Focus here</span>` : ""}</span>
        <span class="domain-bar-value">${row.c}/${row.t} · ${row.pct}%</span>
      </div>
      <div class="domain-bar-track"><div class="domain-bar-fill band-${band}" style="width:${row.pct}%"></div></div>
    </div>`;
  }).join("");
}

function practiceWeakestDomain() {
  if (!lastWeakestDomain) return;
  document.getElementById("domain-select").value = String(lastWeakestDomain.d);
  startQuiz("domain");
}

function finishQuiz(partial) {
  stopTimer();
  clearQuizProgress(); // this session is concluding one way or another — no resume snapshot should outlive it
  const answered = Object.values(quiz.byDomain).reduce((s, [, t]) => s + t, 0);
  if (answered > 0) {
    store.sessions.push({
      d: new Date().toISOString(),
      mode: quiz.mode,
      total: answered,
      correct: quiz.correct,
      byDomain: quiz.byDomain,
    });
    saveStore();
  }
  const pct = answered ? Math.round((quiz.correct / answered) * 100) : 0;
  const modeName = { quick: "Quick quiz", mock: "Mock exam", domain: "Domain practice", missed: "Review missed" }[quiz.mode];
  window.trackEvent?.("quiz_complete", { mode: quiz.mode, score_pct: pct, question_count: answered, partial: !!partial });

  document.getElementById("r-score").textContent = `${pct}%`;
  document.getElementById("r-score-label").textContent = scoreLabel(pct, quiz.mode, answered);
  setScoreRing(answered ? pct : 0);
  document.getElementById("r-sub").textContent =
    `${quiz.correct} of ${answered} correct — ${modeName}${partial ? " (ended early)" : ""}`;

  renderResultsBreakdown(quiz.byDomain, quiz.mode);
  document.getElementById("r-again").hidden = quiz.mode === "domain";
  layoutAuthForResults();

  // Results is the highest-intent moment for the reserved promo slot — see
  // the placement note on #results-promo-slot in index.html. It's inside a
  // hidden view until now, so it was never eligible for activateVisibleSlots()
  // at page load; reveal it here instead. No-op whenever ads aren't
  // configured/consented.
  window.AdsBridge?.reveal(document.getElementById("results-promo-slot"));

  quiz = null;
  show("view-results");
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function show(id) {
  for (const v of ["view-home", "view-quiz", "view-results"]) {
    document.getElementById(v).hidden = v !== id;
  }
  window.scrollTo(0, 0);
}

function goHome() {
  layoutAuthForHome();
  renderDashboard();
  // renderDashboard() -> renderResumeBanner() can auto-finish and show an
  // overdue mock exam's results (timer expired while the tab was closed).
  // Don't clobber that with view-home right after — check whether it
  // already switched the view before asserting our own.
  if (document.getElementById("view-results").hidden) show("view-home");
}

// ---------------------------------------------------------------------------
// Account form placement — one #auth-card DOM node is shuttled between a
// compact header affordance (default) and an expanded slot on the results
// screen, so a stranger sees the sign-in form only after they have a score
// worth saving. auth.js only ever manipulates element IDs, not their parent,
// so moving the node is safe regardless of which slot it currently lives in.
// ---------------------------------------------------------------------------

function toggleAccountForm(btn) {
  const form = document.getElementById("account-form");
  const open = form.classList.toggle("expanded");
  btn.setAttribute("aria-expanded", String(open));
}

function layoutAuthForHome() {
  const card = document.getElementById("auth-card");
  const target = document.getElementById("account-bar-header");
  if (card && target && card.parentElement !== target) target.appendChild(card);
  const saveCard = document.getElementById("r-save-card");
  if (saveCard) saveCard.hidden = true;
  const heading = document.getElementById("account-form-heading");
  if (heading) heading.textContent = "Save your progress";
}

function layoutAuthForResults() {
  const card = document.getElementById("auth-card");
  const saveCard = document.getElementById("r-save-card");
  if (!card || card.hidden) { if (saveCard) saveCard.hidden = true; return; } // Firebase not configured — guest mode only
  const signedIn = document.getElementById("auth-signedin");
  if (signedIn && !signedIn.hidden) { if (saveCard) saveCard.hidden = true; return; } // already signed in — nothing to prompt
  const target = document.getElementById("r-save-card-inner");
  if (target && card.parentElement !== target) target.appendChild(card);
  document.getElementById("account-form")?.classList.add("expanded");
  const heading = document.getElementById("account-form-heading");
  if (heading) heading.textContent = "Save this result";
  if (saveCard) saveCard.hidden = false;
}

function allTimeStats() {
  let c = 0, w = 0, seen = 0;
  for (const at of Object.values(store.attempts)) {
    c += at.c; w += at.w; seen += 1;
  }
  return { c, w, seen, answered: c + w };
}

// Small monochrome stat-tile icons (inline SVG, no icon library) — purely
// decorative reinforcement of each tile's meaning, never the only indicator.
const TILE_ICONS = {
  covered: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 4.5h8a2 2 0 0 1 2 2V16H6a2 2 0 0 1-2-2V4.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 6.5h1a1 1 0 0 1 1 1V16h-2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  accuracy: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="0.9" fill="currentColor"/></svg>`,
  sessions: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 8h13M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  last: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3l1.9 4 4.3.5-3.2 3 .9 4.3L10 12.7 6.1 14.8l.9-4.3-3.2-3 4.3-.5L10 3Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
};

const RESUME_MODE_NAMES = { quick: "Quick quiz", mock: "Mock exam", domain: "Domain practice", missed: "Review missed" };

// Shows/hides the "resume your quiz" card on the home screen. Called from
// renderDashboard(), so it runs on every fresh load and every return to
// view-home — the two moments a stale in-progress quiz needs to surface.
function renderResumeBanner() {
  const card = document.getElementById("resume-card");
  const saved = loadQuizProgress();
  const qs = saved && rehydrateQuizProgress(saved);
  if (!saved || !qs) { card.hidden = true; return; }

  // A mock exam whose timer already expired while the tab was closed gets
  // auto-finished (and recorded) rather than offered as "resumable" with a
  // dead clock. This runs quietly — no banner flash before it resolves.
  if (saved.mode === "mock" && saved.timerEndsAt && saved.timerEndsAt <= Date.now()) {
    quiz = { qs, i: saved.i, correct: saved.correct, byDomain: saved.byDomain, mode: saved.mode, checked: false, selection: new Set() };
    finishQuiz(true);
    return;
  }

  const answered = Object.values(saved.byDomain).reduce((s, [, t]) => s + t, 0);
  let sub = `${RESUME_MODE_NAMES[saved.mode]} · question ${saved.i + 1} of ${qs.length}` +
    (answered ? ` · ${saved.correct}/${answered} correct so far` : "");
  if (saved.mode === "mock" && saved.timerEndsAt) {
    const minsLeft = Math.max(0, Math.floor((saved.timerEndsAt - Date.now()) / 60000));
    sub += ` · ${minsLeft} min left`;
  }
  document.getElementById("resume-sub").textContent = sub;
  card.hidden = false;
}

function resumeQuiz() {
  const saved = loadQuizProgress();
  const qs = saved && rehydrateQuizProgress(saved);
  if (!saved || !qs) { document.getElementById("resume-card").hidden = true; return; }

  layoutAuthForHome();
  lastMode = saved.mode;
  quiz = { qs, i: saved.i, correct: saved.correct, byDomain: saved.byDomain, mode: saved.mode, checked: false, selection: new Set() };
  resetChat();
  show("view-quiz");
  const timerEl = document.getElementById("timer");
  if (saved.mode === "mock" && saved.timerEndsAt) {
    timerEndsAt = saved.timerEndsAt;
    timerEl.hidden = false;
    tickTimer();
    timerHandle = setInterval(tickTimer, 1000);
  } else {
    timerEl.hidden = true;
  }
  renderQuestion();
}

function discardQuizProgress() {
  clearQuizProgress();
  document.getElementById("resume-card").hidden = true;
  showToast("Discarded — starting fresh next time.");
}

function renderDashboard() {
  renderResumeBanner();
  const isFirstRun = store.sessions.length === 0;
  document.getElementById("hero-firstrun").hidden = !isFirstRun;
  document.getElementById("stat-tiles-heading").hidden = isFirstRun;
  document.getElementById("stat-tiles").hidden = isFirstRun;
  document.getElementById("charts-row").hidden = isFirstRun;

  if (!isFirstRun) {
    const s = allTimeStats();
    const acc = s.answered ? Math.round((s.c / s.answered) * 100) : null;
    const last = store.sessions[store.sessions.length - 1];
    const lastPct = last ? Math.round((last.correct / last.total) * 100) : null;

    const tiles = [
      { icon: TILE_ICONS.covered, label: "Questions covered", value: `${s.seen}`, sub: `of ${BANK.length} in the bank` },
      { icon: TILE_ICONS.accuracy, label: "Overall accuracy", value: acc === null ? "—" : `${acc}%`, sub: `${s.c} right · ${s.w} wrong` },
      { icon: TILE_ICONS.sessions, label: "Sessions completed", value: `${store.sessions.length}`, sub: last ? `last: ${new Date(last.d).toLocaleDateString()}` : "none yet" },
      { icon: TILE_ICONS.last, label: "Last session score", value: lastPct === null ? "—" : `${lastPct}%`, sub: last ? `${last.correct}/${last.total} correct` : "start a quiz" },
    ];
    document.getElementById("stat-tiles").innerHTML = tiles.map((t) =>
      `<div class="card stat"><div class="stat-icon">${t.icon}</div><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`
    ).join("");

    renderLineChart();
    renderBarChart();
  }

  const missedCount = BANK.filter((q) => store.attempts[q.id] && store.attempts[q.id].last === 0).length;
  document.getElementById("missed-desc").textContent = missedCount
    ? `Retry the ${missedCount} question${missedCount === 1 ? "" : "s"} you last answered incorrectly.`
    : "Retry every question you last answered incorrectly.";
  document.getElementById("missed-btn").disabled = missedCount === 0;
  document.getElementById("bank-note").textContent =
    `${BANK.length} questions across 5 domains. Progress lives in this browser's local storage.`;
}

// ---------------------------------------------------------------------------
// Charts (inline SVG, no libraries)
// ---------------------------------------------------------------------------

const MODE_NAMES = { quick: "Quick", mock: "Mock", domain: "Domain", missed: "Missed" };

let sessionFilter = "all"; // which quiz mode the "Score by session" chart shows

const tooltip = () => document.getElementById("tooltip");

function showTip(evt, html) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = "block";
  t.style.left = `${evt.clientX + 12}px`;
  t.style.top = `${evt.clientY - 10}px`;
}
function hideTip() { tooltip().style.display = "none"; }

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderLineChart() {
  const host = document.getElementById("line-chart");
  const pool = sessionFilter === "all"
    ? store.sessions
    : store.sessions.filter((s) => s.mode === sessionFilter);
  const sessions = pool.slice(-20);
  const listEl = document.getElementById("sessions-list");
  listEl.innerHTML = pool.slice(-5).reverse().map((s) => {
    const pct = Math.round((s.correct / s.total) * 100);
    const name = MODE_NAMES[s.mode] || s.mode;
    return `<div><span>${new Date(s.d).toLocaleDateString()} · ${name}</span><span>${s.correct}/${s.total} (${pct}%)</span></div>`;
  }).join("");

  if (sessions.length < 2) {
    const what = sessionFilter === "all" ? "sessions" : `${MODE_NAMES[sessionFilter]} sessions`;
    host.innerHTML = `<div class="chart-empty">Complete two ${what} to see your trend.</div>`;
    return;
  }

  const W = 420, H = 190, padL = 34, padR = 44, padT = 12, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const pts = sessions.map((s, i) => ({
    x: padL + (sessions.length === 1 ? iw / 2 : (i / (sessions.length - 1)) * iw),
    y: padT + ih - (Math.round((s.correct / s.total) * 100) / 100) * ih,
    pct: Math.round((s.correct / s.total) * 100),
    s,
  }));

  const grid = [0, 25, 50, 75, 100].map((v) => {
    const y = padT + ih - (v / 100) * ih;
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${css("--grid")}" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${css("--ink-3")}">${v}</text>`;
  }).join("");

  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const dots = pts.map((p, i) =>
    `<circle cx="${p.x}" cy="${p.y}" r="${i === pts.length - 1 ? 5 : 4}" fill="${css("--accent")}"
       stroke="${css("--surface-1")}" stroke-width="2" data-i="${i}" style="cursor:default"/>`
  ).join("");

  host.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Session scores over time">
      ${grid}
      <path d="${path}" fill="none" stroke="${css("--accent")}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <text x="${last.x + 9}" y="${last.y + 4}" font-size="11" font-weight="600" fill="${css("--ink-1")}">${last.pct}%</text>
      <text x="${padL}" y="${H - 6}" font-size="10" fill="${css("--ink-3")}">older</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="10" fill="${css("--ink-3")}">recent</text>
    </svg>`;

  host.querySelectorAll("circle").forEach((c) => {
    const p = pts[Number(c.dataset.i)];
    const name = MODE_NAMES[p.s.mode] || p.s.mode;
    c.addEventListener("mousemove", (e) =>
      showTip(e, `${new Date(p.s.d).toLocaleDateString()} · ${name}<br>${p.s.correct}/${p.s.total} — ${p.pct}%`));
    c.addEventListener("mouseleave", hideTip);
  });
}

function renderBarChart() {
  const host = document.getElementById("bar-chart");
  const rows = [];
  for (let d = 1; d <= 5; d++) {
    let c = 0, t = 0, seen = 0, total = 0;
    for (const q of BANK) {
      if (q.domain !== d) continue;
      total += 1;
      const at = store.attempts[q.id];
      if (at) { c += at.c; t += at.c + at.w; seen += 1; }
    }
    rows.push({ d, c, t, seen, total, pct: t ? Math.round((c / t) * 100) : null });
  }
  if (rows.every((r) => r.t === 0)) {
    host.innerHTML = `<div class="chart-empty">Answer some questions to see per-domain accuracy.</div>`;
    return;
  }

  const W = 420, rowH = 38, padL = 8, padR = 46, labelH = 14;
  const H = rows.length * rowH + 6;
  const iw = W - padL - padR;
  const bars = rows.map((r, i) => {
    const y = i * rowH;
    const pct = r.pct ?? 0;
    const w = Math.max((pct / 100) * iw, r.pct === null ? 0 : 2);
    const barY = y + labelH + 4;
    const bh = 12;
    const label = `${r.d}. ${DOMAINS[r.d]}`;
    const value = r.pct === null ? "—" : `${r.pct}%`;
    // 4px rounded data end, square at the baseline
    const shape = r.pct === null ? "" :
      `<path d="M${padL},${barY} h${Math.max(w - 4, 0)} a4,4 0 0 1 4,4 v${bh - 8} a4,4 0 0 1 -4,4 h-${Math.max(w - 4, 0)} z"
         fill="${css("--accent")}" data-d="${r.d}"/>`;
    return `<text x="${padL}" y="${y + labelH - 2}" font-size="11" fill="${css("--ink-2")}">${label}</text>
      <line x1="${padL}" y1="${barY - 1}" x2="${padL}" y2="${barY + bh + 1}" stroke="${css("--baseline")}" stroke-width="1"/>
      <rect x="${padL}" y="${barY}" width="${iw}" height="${bh}" fill="${css("--grid")}" opacity="0.5" rx="4" data-d="${r.d}"/>
      ${shape}
      <text x="${padL + Math.max(w, 2) + 6}" y="${barY + bh - 2}" font-size="11" font-weight="600" fill="${css("--ink-1")}">${value}</text>`;
  }).join("");

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Accuracy by exam domain">${bars}</svg>`;

  host.querySelectorAll("[data-d]").forEach((el) => {
    const r = rows[Number(el.dataset.d) - 1];
    el.addEventListener("mousemove", (e) =>
      showTip(e, `${DOMAINS[r.d]}<br>${r.pct === null ? "not attempted yet" : `${r.pct}% over ${r.t} answers`}<br>${r.seen}/${r.total} questions covered`));
    el.addEventListener("mouseleave", hideTip);
  });
}

// ---------------------------------------------------------------------------
// Term-explainer chatbot (Gemini via the /api/chat Netlify function)
// ---------------------------------------------------------------------------

let chatHistory = []; // [{role: "user"|"model", text}] — cleared per quiz

function chatAppend(role, text) {
  const log = document.getElementById("chat-log");
  log.hidden = false;
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function resetChat() {
  chatHistory = [];
  const log = document.getElementById("chat-log");
  log.innerHTML = "";
  log.hidden = true;
}

async function sendChat(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const send = document.getElementById("chat-send");
  const text = input.value.trim();
  if (!text || send.disabled) return;

  input.value = "";
  send.disabled = true;
  chatAppend("user", text);
  chatHistory.push({ role: "user", text });
  const pending = chatAppend("bot thinking", "Thinking…");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatHistory.slice(-10),
        question: quiz ? currentQ().q : "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.reply) throw new Error(data.error || "The chatbot had a problem answering. Try again.");
    pending.className = "chat-msg bot";
    pending.textContent = data.reply;
    chatHistory.push({ role: "model", text: data.reply });
  } catch (err) {
    pending.className = "chat-msg bot error";
    pending.textContent = err.message === "Failed to fetch"
      ? "Couldn't reach the chatbot — check your connection."
      : err.message;
    chatHistory.pop(); // let the user retry the same question
  } finally {
    send.disabled = false;
    document.getElementById("chat-log").scrollTop = document.getElementById("chat-log").scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Progress export / import / reset
// ---------------------------------------------------------------------------

function exportProgress() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gcp-ace-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      if (!s || typeof s !== "object" || !s.attempts || !Array.isArray(s.sessions)) throw new Error("bad shape");
      store = s;
      saveStore();
      renderDashboard();
      showToast("Progress imported.");
    } catch (e) {
      showToast("That file doesn't look like an exported progress file.", { type: "error" });
    }
    input.value = "";
  };
  reader.readAsText(file);
}

// Reset uses an inline confirm row instead of the OS confirm() dialog — see
// #reset-confirm in index.html — so it doesn't feel like a jarring native
// popup on mobile.
function askResetProgress() {
  document.getElementById("reset-btn").hidden = true;
  document.getElementById("reset-confirm").hidden = false;
}

function cancelResetProgress() {
  document.getElementById("reset-btn").hidden = false;
  document.getElementById("reset-confirm").hidden = true;
}

function confirmResetProgress() {
  store = { attempts: {}, sessions: [] };
  saveStore();
  cancelResetProgress();
  renderDashboard();
  showToast("Progress reset.");
}

// ---------------------------------------------------------------------------
// Lightweight toast (replaces alert() for non-blocking notices) — aria-live
// region announced to screen readers, auto-dismisses, respects reduced motion
// via the global transition-duration override in index.html's <style>.
// ---------------------------------------------------------------------------

function showToast(message, opts) {
  const type = (opts && opts.type) || "info";
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("role", "status");
    document.body.appendChild(region);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 4200);
}
window.showToast = showToast;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(function init() {
  document.getElementById("session-filter").onchange = (e) => {
    sessionFilter = e.target.value;
    renderLineChart();
  };
  const sel = document.getElementById("domain-select");
  sel.innerHTML = Object.entries(DOMAINS)
    .map(([d, name]) => `<option value="${d}">${d}. ${name}</option>`)
    .join("");

  // Deep-link support: the static /domains/<slug>/ study-guide pages link
  // back here with ?domain=N so "Practice this domain" lands on the right
  // pre-selected mode instead of a generic homepage. Purely cosmetic —
  // falls through quietly if the param is absent or invalid.
  const domainParam = Number(new URLSearchParams(location.search).get("domain"));
  if (domainParam >= 1 && domainParam <= 5) {
    sel.value = String(domainParam);
    document.getElementById("domain-select")?.closest(".mode-card")?.scrollIntoView({ block: "center" });
  }

  document.getElementById("chat-form").addEventListener("submit", sendChat);
  document.addEventListener("keydown", (e) => {
    if (!quiz || document.getElementById("view-quiz").hidden) return;
    // Don't hijack keys while the user is typing in the chatbot.
    if (e.target.closest && e.target.closest("#chat-form")) return;
    if (e.key === "Enter") {
      if (!quiz.checked && !document.getElementById("q-check").disabled) checkAnswer();
    } else if (!quiz.checked && e.key >= "1" && e.key <= "9") {
      const pos = Number(e.key) - 1;
      if (pos < quiz.order.length) toggleOption(quiz.order[pos]);
    }
  });

  // Header "Save progress" popover: close on outside click or Escape. Only
  // acts while the account card is in its header slot (not on the results
  // screen, where the form is meant to stay open inline).
  document.addEventListener("click", (e) => {
    const card = document.getElementById("auth-card");
    const bar = document.getElementById("account-bar-header");
    if (!card || card.parentElement !== bar) return;
    const form = document.getElementById("account-form");
    if (form && form.classList.contains("expanded") && !bar.contains(e.target)) {
      form.classList.remove("expanded");
      document.getElementById("account-toggle-btn")?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const form = document.getElementById("account-form");
    if (form && form.classList.contains("expanded")) {
      form.classList.remove("expanded");
      document.getElementById("account-toggle-btn")?.setAttribute("aria-expanded", "false");
      document.getElementById("account-toggle-btn")?.focus();
    }
  });

  layoutAuthForHome();
  renderDashboard();
})();
