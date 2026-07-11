# GCP Associate Cloud Engineer — Practice App

A self-contained practice-exam app for the **Google Cloud Associate Cloud Engineer (ACE)**
certification. It ships with **553 original questions** written to match the
[official exam guide](https://services.google.com/fh/files/misc/associate_cloud_engineer_exam_guide_english.pdf),
gives you an **explanation after every answer** (why the right answer is right *and*
why the tempting wrong ones are wrong), and **tracks your progress over time** so you
can see whether you're improving.

---

## Quick start

**No installation is required.** The app is plain HTML/CSS/JavaScript with zero
libraries and zero build step.

### Option 1 — just open it
Double-click `index.html` (or right-click → Open with → your browser). Done.

### Option 2 — serve it with uv (if you prefer a local web server)
There are no Python dependencies either — `uv sync` just creates the project venv,
and Python's built-in web server does the hosting:

```powershell
uv sync
uv run python -m http.server 8000
```

Then open <http://localhost:8000>.

> Why offer both? Opening the file directly is simplest. Serving over `http://localhost`
> is useful if your browser restricts `file://` pages, or if you want to use the app
> from another device on your network.

---

## What's inside

```
index.html          App shell, styling, view layout
app.js              All application logic (quiz engine, progress tracking, charts)
auth.js             Firebase Authentication + Firestore cloud sync (ES module)
firebase-config.js  YOUR Firebase project config goes here (placeholders until then)
firestore.rules     Firestore security rules — paste into the Firebase console
netlify.toml        Netlify config (static site, no build step)
data/
  domain1-a.js      Domain 1: Setting up a cloud solution environment  (110 q)
  domain1-b.js
  domain2-a.js      Domain 2: Planning & configuring a cloud solution  (100 q)
  domain2-b.js
  domain3-a.js      Domain 3: Deploying & implementing a cloud solution (125 q)
  domain3-b.js
  domain3-c.js
  domain4-a.js      Domain 4: Ensuring successful operation             (110 q)
  domain4-b.js
  domain5-a.js      Domain 5: Configuring access & security             (108 q)
  domain5-b.js
pyproject.toml      Only so `uv sync` / `uv run` work; no dependencies
```

The per-domain question counts mirror the official exam weighting
(~20% / 18% / 22% / 20% / 20%).

---

## Study modes

| Mode | What it does |
|---|---|
| **Quick quiz** | 10 questions from all domains. Good for a daily rep. |
| **Mock exam** | 50 questions in the real exam's domain proportions, with a **120-minute countdown timer** (auto-submits at zero). The real exam passing bar is roughly 70%. |
| **Domain practice** | 20 questions from a single domain you pick — drill your weak areas. |
| **Review missed** | Rebuilds a quiz from every question you *last answered incorrectly* (up to 30 at a time). Clear this list regularly. |

### How each question works
1. Read the question, click an answer (or several — multi-select questions say
   *"Select all answers that apply"*; there are 34 of them, like the real exam).
2. Click **Check answer** (or press **Enter**; keys **1–9** select options).
3. You immediately see whether you were right, which option was correct, and a
   short explanation covering the reasoning and the traps in the wrong options.
4. **Next** moves on. **End session** saves what you've answered so far and exits.

### How questions are chosen (spaced practice)
The app deliberately does *not* pick uniformly at random:

1. **Unseen questions first** — so you cover the whole bank fastest,
2. then **questions you last got wrong** — so mistakes come back around,
3. then previously-correct questions, **oldest first** — light spaced repetition.

The 553-question bank at 10–50 questions per session gives you weeks of
non-repeating practice.

---

## Accounts & cloud sync (optional)

The app has two modes:

- **Guest mode** (default, zero setup): progress is stored in the browser's
  localStorage only.
- **Signed in**: users create an account (email + password) and their progress is
  stored in **Cloud Firestore on GCP**, synced automatically after every answer
  (debounced), and available from any device. When a guest signs in, local progress
  is **merged** into their cloud copy, so nothing is lost.

How it works: the static site uses **Firebase Authentication** for accounts and
writes one Firestore document per user (`users/{uid}`). The security rules in
`firestore.rules` guarantee a user can only read/write their own document. There is
no server of your own — the browser talks to GCP directly.

At ~10 users/day this fits entirely in the **free tier** (Firestore free quota:
50k reads / 20k writes per day; Firebase Auth is free at this scale). No billing
account is required.

---

## Deploying (Netlify + GCP)

### Part 1 — GCP/Firebase setup (one-time, ~10 minutes, all clicking)

1. Go to <https://console.firebase.google.com> → **Add project**. Name it (e.g.
   `ace-practice`). You can disable Google Analytics. *(This creates a normal GCP
   project — you'll see it in the GCP console too.)*
2. **Build → Authentication → Get started** → Sign-in method → enable
   **Email/Password** → Save.
3. **Build → Firestore Database → Create database** → choose a region near you
   (e.g. `europe-west3` or `us-central1`) → **production mode** → Create.
4. Firestore → **Rules** tab → replace the contents with the contents of
   `firestore.rules` from this repo → **Publish**.
5. Project settings (gear icon) → **Your apps** → click the **`</>` (Web)** icon →
   register the app (no Firebase Hosting needed) → copy the `firebaseConfig` object
   it shows you → paste those values into `firebase-config.js` in this repo.
6. **Authentication → Settings → Authorized domains**: `localhost` is pre-added;
   after Part 2, come back and **add your Netlify domain** (e.g.
   `your-site.netlify.app`).

### Part 2 — Netlify

- Easiest: push this repo to GitHub, then in Netlify: **Add new site → Import from
  Git** → pick the repo → build command: *(leave empty)* → publish directory: `.`
  → Deploy. (Or drag-and-drop the project folder onto Netlify for a one-off deploy.)
- Then do step 6 above (authorized domains) with the URL Netlify gives you.

### Testing locally with cloud sync

Firebase Auth does not work from `file://` pages, so when testing accounts locally,
serve over localhost:

```powershell
uv run python -m http.server 8000    # then open http://localhost:8000
```

(Guest mode still works fine from `file://`.)

### Where to see your users' data in GCP

- Users: Firebase console → Authentication → Users.
- Progress: Firebase console → Firestore Database → `users` collection (one
  document per user; the `data` field holds their progress as JSON). The same data
  is visible in the GCP console under **Firestore**.

---

## Progress tracking

In guest mode everything is stored in your **browser's localStorage** (key
`gcp-ace-progress-v1`); signed in, it also syncs to Firestore as described above.

The dashboard shows:

- **Stat tiles** — questions covered (of 553), overall accuracy, sessions completed,
  last session score.
- **Score by session** (line chart) — your last 20 session scores, so you can see
  the trend. Hover any point for date/mode/score. The list below it shows your five
  most recent sessions.
- **Accuracy by domain** (bar chart) — all-time accuracy per exam domain. Hover a
  bar for detail including how much of that domain you've covered. **This is your
  study compass**: the shortest bar is the domain to drill next.

### Keeping / moving your progress
Because progress lives in the browser:

- **Export progress** downloads a JSON snapshot (back it up, or move to another
  browser/machine).
- **Import progress** restores a snapshot.
- **Reset progress** wipes everything (asks for confirmation).
- Clearing your browser's site data will also erase progress — export first if in doubt.

---

## About the questions

- All questions are **original**, written for this app and modeled on the topic list
  and question style of the official exam guide, Google Cloud documentation, and the
  style of well-known community practice material. They are **not** exam dumps —
  using real leaked questions violates Google's certification terms.
- Every question stores: `id`, `domain` (1–5), `topic`, question text `q`, options
  `o` (correct answer(s) authored first — the app shuffles display order every time),
  answer index `a` (a number, or an array for multi-select), and explanation `x`.
- Cloud products evolve. Questions were written against Google Cloud as of mid-2026;
  if something changed since, trust the current official docs.

### Adding your own questions
Append objects to any file in `data/` (or add a new file and a `<script>` tag in
`index.html`):

```js
{id:"d2-101",domain:2,topic:"My topic",
q:"The question text?",
o:["Correct answer written first",
"Wrong but plausible",
"Wrong",
"Wrong"],
a:0,                       // or [0,1] for multi-select
x:"Why the answer is right and the others are wrong."}
```

Keep `id` unique. The app picks everything else up automatically, including the
dashboard totals.

---

## Exam facts worth knowing (2026)

- **50–60 questions, 120 minutes**, multiple choice + multiple select.
- Passing score is not published; ~70% is the commonly cited bar — aim for
  consistent **80%+ on mock exams** here before booking.
- Domains: setting up the environment (~20%), planning & configuring (~18%),
  deploying & implementing (~22%), ensuring successful operation (~20%),
  access & security (~20%).
- Google recommends 6+ months hands-on experience; pair this app with the free tier
  / Cloud Skills Boost labs — the exam heavily rewards having actually typed
  `gcloud` commands.

Sources: [Official ACE certification page](https://cloud.google.com/learn/certification/cloud-engineer) ·
[Official exam guide (PDF)](https://services.google.com/fh/files/misc/associate_cloud_engineer_exam_guide_english.pdf)

Good luck with the exam! 🎓
