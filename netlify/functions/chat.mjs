// ---------------------------------------------------------------------------
// Chat proxy: forwards the in-app "explain this GCP term" chat to Gemini.
//
// The Gemini API key lives ONLY in the Netlify environment variable
// GEMINI_API_KEY (Site configuration → Environment variables). It is never
// shipped to the browser — the client calls /api/chat and this function adds
// the key server-side. Local testing: `netlify dev` with the var in .env.
// ---------------------------------------------------------------------------

const MODEL = "gemini-2.5-flash";

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
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ error: "Chat is not configured (missing GEMINI_API_KEY)." }, { status: 500 });
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
