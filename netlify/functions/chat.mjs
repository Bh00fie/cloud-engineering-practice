// ---------------------------------------------------------------------------
// Chat proxy: forwards the in-app "explain this GCP term" chat to Gemini.
//
// The Gemini API key lives ONLY in the Netlify environment variable
// GEMINI_API_KEY (Site configuration → Environment variables). It is never
// shipped to the browser — the client calls /api/chat and this function adds
// the key server-side. Local testing: `netlify dev` with the var in .env.
// ---------------------------------------------------------------------------

const MODEL = "gemini-2.5-flash";

// --- Abuse controls -------------------------------------------------------
// /api/chat is a public endpoint that spends money on every call, so it needs
// to reject anything that isn't the app itself. Two cheap layers:
//
//   1. Origin allowlist — stops drive-by scanners and anyone curling the
//      endpoint directly. Headers are spoofable, so this is a speed bump for
//      a determined attacker, not a wall; it removes the opportunistic 99%.
//   2. Per-IP rate limit — bounds what a determined caller can spend.
//
// The limiter lives in module scope, so it persists across invocations that
// share a warm instance but NOT across instances. That makes it a best-effort
// ceiling rather than a strict global quota — the hard backstop is a billing
// budget alert on the Google Cloud project holding the key.
const ALLOWED_HOSTS = [
  "cloudaceprep.com",
  "www.cloudaceprep.com",
  "gcpcloudengineering.netlify.app",
  "localhost",
  "127.0.0.1",
];

const RATE_LIMIT = 15;            // requests per IP per window
const RATE_WINDOW_MS = 60 * 1000; // one minute
const hits = new Map();           // ip -> number[] (timestamps)

function hostAllowed(value) {
  if (!value) return false;
  try {
    return ALLOWED_HOSTS.includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function clientIp(req) {
  return req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
}

// Returns true when this IP is over budget. Also prunes expired entries so the
// Map can't grow without bound on a long-lived instance.
function rateLimited(ip) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  for (const [key, times] of hits) {
    const live = times.filter((t) => t > cutoff);
    if (live.length) hits.set(key, live);
    else hits.delete(key);
  }
  const mine = hits.get(ip) || [];
  if (mine.length >= RATE_LIMIT) return true;
  mine.push(now);
  hits.set(ip, mine);
  return false;
}

const SYSTEM_PROMPT = `You are a study helper embedded in a Google Cloud
Associate Cloud Engineer (ACE) practice-exam app. Explain Google Cloud (GCP)
terms, services, and concepts in plain language for someone preparing for the
ACE exam.

Rules:
- Keep answers short: two to five sentences, plain text only, no markdown.
- The user may be looking at a practice question right now. You may clarify
  any term or service it mentions, but NEVER state or hint at which answer
  option is correct.
- If asked something unrelated to Google Cloud or general IT, briefly steer
  the conversation back to GCP topics.`;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Browsers always send Origin on a cross-origin POST and same-origin fetch
  // from the app; fall back to Referer for older clients that omit it.
  if (!hostAllowed(req.headers.get("origin")) && !hostAllowed(req.headers.get("referer"))) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  if (rateLimited(clientIp(req))) {
    return Response.json(
      { error: "You're sending messages too quickly — wait a moment and try again." },
      { status: 429 },
    );
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return Response.json({ error: "Chat is not configured (missing GEMINI_API_KEY / GOOGLE_API_KEY)." }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  // Don't trust the client: cap history length and per-message size.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-10)
    .filter((m) => m && (m.role === "user" || m.role === "model") && typeof m.text === "string")
    .map((m) => ({ role: m.role, parts: [{ text: m.text.slice(0, 1000) }] }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 2000) : "";

  const system = SYSTEM_PROMPT +
    (question ? `\n\nThe practice question the user is currently viewing:\n${question}` : "");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
          // ACE-term explanations don't need extended thinking; disabling it
          // keeps responses fast and cheap on the free tier.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Gemini ${res.status}: ${detail}`);
    const friendly = res.status === 429
      ? "The chatbot is rate-limited right now — try again in a minute."
      : "The chatbot had a problem answering. Try again.";
    return Response.json({ error: friendly }, { status: 502 });
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
  if (!reply) {
    return Response.json({ error: "The chatbot had a problem answering. Try again." }, { status: 502 });
  }
  return Response.json({ reply });
};

export const config = { path: "/api/chat" };
