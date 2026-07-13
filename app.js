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
    alert(mode === "missed"
      ? "Nothing to review — you have no questions whose last answer was wrong. Nice."
      : "No questions available.");
    return;
  }
  lastMode = mode;
  quiz = { qs, i: 0, correct: 0, byDomain: {}, mode, checked: false, selection: new Set() };
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

  const box = document.getElementById("q-options");
  box.innerHTML = "";
  quiz.order.forEach((origIdx, pos) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.dataset.idx = origIdx;
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String.fromCharCode(65 + pos) + ".";
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
  renderQuestion();
}

function quitQuiz() {
  stopTimer();
  const answered = Object.values(quiz.byDomain).reduce((s, [, t]) => s + t, 0);
  if (answered > 0) finishQuiz(true);
  else { quiz = null; goHome(); }
}

function finishQuiz(partial) {
  stopTimer();
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
  document.getElementById("r-score").textContent = `${pct}%`;
  const modeName = { quick: "Quick quiz", mock: "Mock exam", domain: "Domain practice", missed: "Review missed" }[quiz.mode];
  document.getElementById("r-sub").textContent =
    `${quiz.correct} of ${answered} correct — ${modeName}${partial ? " (ended early)" : ""}` +
    (quiz.mode === "mock" ? (pct >= 70 ? " · At the typical ~70% passing bar. Keep going!" : " · The typical passing bar is ~70%.") : "");

  const rows = Object.entries(quiz.byDomain)
    .sort((a, b) => a[0] - b[0])
    .map(([d, [c, t]]) =>
      `<tr><td>${DOMAINS[d]}</td><td class="num">${c}/${t}</td><td class="num">${Math.round((c / t) * 100)}%</td></tr>`)
    .join("");
  document.getElementById("r-table").innerHTML =
    `<tr><th>Domain</th><th>Correct</th><th>Accuracy</th></tr>${rows}`;
  document.getElementById("r-again").hidden = quiz.mode === "domain";
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
  renderDashboard();
  show("view-home");
}

function allTimeStats() {
  let c = 0, w = 0, seen = 0;
  for (const at of Object.values(store.attempts)) {
    c += at.c; w += at.w; seen += 1;
  }
  return { c, w, seen, answered: c + w };
}

function renderDashboard() {
  const s = allTimeStats();
  const acc = s.answered ? Math.round((s.c / s.answered) * 100) : null;
  const last = store.sessions[store.sessions.length - 1];
  const lastPct = last ? Math.round((last.correct / last.total) * 100) : null;
  const missedCount = BANK.filter((q) => store.attempts[q.id] && store.attempts[q.id].last === 0).length;

  const tiles = [
    { label: "Questions covered", value: `${s.seen}`, sub: `of ${BANK.length} in the bank` },
    { label: "Overall accuracy", value: acc === null ? "—" : `${acc}%`, sub: `${s.c} right · ${s.w} wrong` },
    { label: "Sessions completed", value: `${store.sessions.length}`, sub: last ? `last: ${new Date(last.d).toLocaleDateString()}` : "none yet" },
    { label: "Last session score", value: lastPct === null ? "—" : `${lastPct}%`, sub: last ? `${last.correct}/${last.total} correct` : "start a quiz" },
  ];
  document.getElementById("stat-tiles").innerHTML = tiles.map((t) =>
    `<div class="card stat"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`
  ).join("");

  document.getElementById("missed-desc").textContent = missedCount
    ? `Retry the ${missedCount} question${missedCount === 1 ? "" : "s"} you last answered incorrectly.`
    : "Retry every question you last answered incorrectly.";
  document.getElementById("missed-btn").disabled = missedCount === 0;
  document.getElementById("bank-note").textContent =
    `${BANK.length} questions across 5 domains. Progress lives in this browser's local storage.`;

  renderLineChart();
  renderBarChart();
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
    } catch (e) {
      alert("That file doesn't look like an exported progress file.");
    }
    input.value = "";
  };
  reader.readAsText(file);
}

function resetProgress() {
  if (!confirm("Delete all progress (attempts and session history)? This cannot be undone.")) return;
  store = { attempts: {}, sessions: [] };
  saveStore();
  renderDashboard();
}

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
  renderDashboard();
})();
