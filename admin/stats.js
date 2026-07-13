// ---------------------------------------------------------------------------
// Admin: per-user stats for the ACE practice app (project owner only).
//
// Usage:  node admin/stats.js
//
// Reads every users/{uid} document from Firestore via the REST API using your
// gcloud credentials (run `gcloud auth login` first if expired). Firestore
// SECURITY RULES do not apply here — REST calls with your Google identity are
// authorized by IAM (you are project owner), which is exactly why app users
// can't do this from the browser but you can from your machine.
// ---------------------------------------------------------------------------
"use strict";
const { execSync } = require("child_process");

const PROJECT = "ace-practice-91738";
const DOMAINS = { 1: "Setup", 2: "Planning", 3: "Deploying", 4: "Operations", 5: "Security" };

function token() {
  try {
    return execSync("gcloud auth print-access-token", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    console.error("Could not get gcloud credentials. Run: gcloud auth login");
    process.exit(1);
  }
}

async function listUsers(tok) {
  const docs = [];
  let pageToken = "";
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users?pageSize=300` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
    const body = await res.json();
    docs.push(...(body.documents || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}

function analyze(doc) {
  const f = doc.fields || {};
  const email = f.email?.stringValue || "(no email)";
  const updated = Number(f.updated?.integerValue || 0);
  let store = { attempts: {}, sessions: [] };
  try { store = JSON.parse(f.data?.stringValue || "{}"); } catch (e) { /* ignore */ }
  const attempts = store.attempts || {};
  const sessions = store.sessions || [];

  let c = 0, w = 0;
  const perDomain = {};
  for (const [qid, at] of Object.entries(attempts)) {
    c += at.c; w += at.w;
    const d = qid.match(/^d(\d)-/)?.[1];
    if (d) {
      perDomain[d] = perDomain[d] || { c: 0, t: 0 };
      perDomain[d].c += at.c;
      perDomain[d].t += at.c + at.w;
    }
  }
  const last = sessions[sessions.length - 1];
  const recent = sessions.slice(-5);
  const trend = recent.map((s) => Math.round((s.correct / s.total) * 100) + "%").join(" → ");

  return {
    email,
    covered: Object.keys(attempts).length,
    answered: c + w,
    accuracy: c + w ? Math.round((c / (c + w)) * 100) : 0,
    sessions: sessions.length,
    lastScore: last ? `${Math.round((last.correct / last.total) * 100)}% (${last.mode})` : "—",
    lastActive: updated ? new Date(updated).toISOString().slice(0, 16).replace("T", " ") : "—",
    trend: trend || "—",
    perDomain,
  };
}

(async () => {
  const docs = await listUsers(token());
  if (!docs.length) {
    console.log("No user progress documents yet.");
    return;
  }
  const rows = docs.map(analyze).sort((a, b) => b.answered - a.answered);

  console.log(`\n${rows.length} user(s) — project ${PROJECT}\n`);
  console.table(rows.map((r) => ({
    Email: r.email,
    "Covered (of 658)": r.covered,
    Answers: r.answered,
    "Accuracy": r.accuracy + "%",
    Sessions: r.sessions,
    "Last score": r.lastScore,
    "Last 5 scores": r.trend,
    "Last active (UTC)": r.lastActive,
  })));

  for (const r of rows) {
    const parts = Object.entries(r.perDomain)
      .sort()
      .map(([d, v]) => `${DOMAINS[d]}: ${v.t ? Math.round((v.c / v.t) * 100) : 0}% (${v.t})`);
    if (parts.length) console.log(`${r.email}  →  ${parts.join(" · ")}`);
  }
  console.log();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
