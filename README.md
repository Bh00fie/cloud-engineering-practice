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
firebase-config.js  Firebase web-app config for project ace-practice-91738 (not secret)
firestore.rules     Firestore security rules (the DEPLOYED version — keep in sync)
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

## Live deployment — the full picture

> This section documents the ACTUAL deployed setup (July 2026), so future-you knows
> exactly what exists, where, and how to change it.

### URLs & consoles

| What | Where |
|---|---|
| **Live site** | <https://gcpcloudengineering.netlify.app> |
| GitHub repo (deploy source) | <https://github.com/Bh00fie/cloud-engineering-practice> |
| Netlify dashboard | <https://app.netlify.com> (site: gcpcloudengineering) |
| Firebase console (project home) | <https://console.firebase.google.com/project/ace-practice-91738> |
| Users (accounts) | <https://console.firebase.google.com/project/ace-practice-91738/authentication/users> |
| Progress data (Firestore) | <https://console.firebase.google.com/project/ace-practice-91738/firestore> |
| Security rules | <https://console.firebase.google.com/project/ace-practice-91738/firestore/rules> |
| Same project in the GCP console | <https://console.cloud.google.com/home/dashboard?project=ace-practice-91738> |

### Architecture

```
Browser (static app from Netlify)
   │
   ├── Firebase Authentication ──► sign-up / sign-in (email+password)
   │        (Identity Toolkit API)      one identity per user (uid)
   │
   └── Cloud Firestore ──────────► users/{uid} document
            (europe-west3)             { email, updated, data: "<JSON progress>" }
```

- **No custom server.** The browser talks to GCP directly with the Firebase JS SDK
  (v11, loaded from Google's CDN in `auth.js`).
- **Hosting**: Netlify serves the repo as-is (no build step; `netlify.toml` sets
  publish dir `.` and security headers). Every `git push` to `main` auto-redeploys.
- **Data flow**: progress is always written to localStorage first; when signed in,
  `auth.js` also writes the whole store to Firestore, debounced 2.5s, and flushes
  when the tab is hidden/closed. On sign-in, the cloud copy and any local (guest)
  progress are **merged** (per-question: the record with more answers wins;
  sessions are unioned and deduped), then pushed back up.
- **Sign-out** clears the device copy; the cloud keeps everything.

### GCP project details

| Item | Value |
|---|---|
| Project ID | `ace-practice-91738` |
| Owner | `abhinandanthour2001@gmail.com` |
| Billing | **None linked** — runs on the free tier and cannot incur charges |
| Firestore | Native mode, **default** database, location `europe-west3` (Frankfurt) |
| Auth provider | Email/Password (plain Firebase Auth, NOT paid Identity Platform) |
| Authorized domains | `localhost`, `ace-practice-91738.firebaseapp.com`, `ace-practice-91738.web.app`, `gcpcloudengineering.netlify.app` |
| Enabled APIs | `firebase`, `firestore`, `identitytoolkit`, `firebaserules` |
| Web app ID | `1:268816140963:web:26990f0347902dc38d0d16` |

The web config in `firebase-config.js` (apiKey etc.) is **not a secret** — it only
identifies the project to Google's SDK. Real protection comes from the security
rules and from Auth. Keeping the repo private is fine but not security-relevant.

### How it was set up (so you can reproduce or repair it)

All of this was done from the CLI/REST with `gcloud` credentials — the console
equivalents are in parentheses:

1. `gcloud projects create ace-practice-91738` (console: New project)
2. `gcloud services enable firebase.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com firebaserules.googleapis.com`
3. `POST https://firebase.googleapis.com/v1beta1/projects/ace-practice-91738:addFirebase`
   (console: "Add Firebase to GCP project"). *Gotcha: fails with a bare 403 until
   the Google account has accepted the Firebase Terms of Service once at
   console.firebase.google.com.*
4. `gcloud firestore databases create --location=europe-west3`
5. `POST .../projects/ace-practice-91738/webApps` to register the web app, then
   `GET .../webApps/{appId}/config` → values pasted into `firebase-config.js`
6. Email/Password enabled **in the console** (Authentication → Get started →
   Email/Password). *Gotcha: the API route (`identityPlatform:initializeAuth`)
   activates paid Identity Platform and demands billing — the console button gives
   you the free tier.*
7. Rules deployed via the Firebase Rules API (create ruleset from
   `firestore.rules`, point the `cloud.firestore` release at it)
8. Netlify domain added to authorized domains via
   `PATCH .../admin/v2/projects/ace-practice-91738/config?updateMask=authorizedDomains`
   (console: Authentication → Settings → Authorized domains)

It was verified end-to-end with REST tests: sign-up, Firestore write/read as the
owner, anonymous read **denied**, cross-user read **denied**; test users/doc deleted
afterward.

### Security rules (deployed)

`firestore.rules` in this repo is the deployed version. In plain words:

- A signed-in user can read/delete only `users/{their own uid}`.
- Creates/updates additionally require the document to carry a string `data` field
  (the app's JSON payload) — malformed writes are rejected.
- Every other path in the database is denied for everyone.

**To change rules**: edit `firestore.rules`, then paste it into the
[Rules console](https://console.firebase.google.com/project/ace-practice-91738/firestore/rules)
and Publish (or redeploy via API/CLI). *The repo file does nothing by itself —
rules must be published to take effect.*

### Seeing stats of your users (admin)

Run the admin script from this repo (requires `gcloud auth login` as the project
owner — nobody else can do this, and app users can never read each other's data):

```powershell
node admin/stats.js
```

It prints one row per user — questions covered (of 553), total answers, overall
accuracy, session count, last score, last-5-score trend, last active time — plus a
per-domain accuracy line for each user. Example:

```
┌─────────┬──────────────────┬─────────┬──────────┬──────────┬────────────┬───────────────┐
│  Email  │ Covered (of 553) │ Answers │ Accuracy │ Sessions │ Last score │ Last 5 scores │
├─────────┼──────────────────┼─────────┼──────────┼──────────┼────────────┼───────────────┤
│ ana@…   │       212        │   340   │   78%    │    19    │ 84% (mock) │ 70% → … → 84% │
└─────────┴──────────────────┴─────────┴──────────┴──────────┴────────────┴───────────────┘
ana@…  →  Setup: 81% (70) · Planning: 74% (61) · Deploying: 77% (90) · …
```

Why this works for you but not for users: the script calls the Firestore REST API
with your Google identity, which is authorized by **IAM** (you're project owner) —
security rules only govern the client SDK used by the browser app. The raw data is
also always visible in the [Firestore console](https://console.firebase.google.com/project/ace-practice-91738/firestore).

### Routine operations

- **Deploy an app change**: edit files → commit → `git push` → Netlify rebuilds
  (~30s). Nothing to do on the GCP side.
- **See who signed up**: Authentication → Users (you can disable, delete, or
  reset-password from the ⋮ menu per user).
- **Inspect someone's progress**: Firestore → `users` → click their uid — the
  `data` field is the same JSON the Export button produces in the app.
- **Delete a user completely**: delete them in Authentication **and** delete their
  `users/{uid}` document in Firestore (two separate stores).
- **Add another domain later** (e.g. a custom domain on Netlify): add it under
  Authentication → Settings → Authorized domains, or sign-in will fail there with
  `auth/unauthorized-domain`.
- **Local development with accounts**: Firebase Auth doesn't run from `file://`
  pages — serve with `uv run python -m http.server 8000` and use
  <http://localhost:8000> (localhost is an authorized domain). Guest mode works
  from `file://` regardless.

### Costs & limits (why this stays at $0)

- No billing account is linked to `ace-practice-91738`, so it **cannot** charge you;
  if a quota were ever exceeded, requests would fail rather than bill.
- Free daily Firestore quota: 50k reads, 20k writes, 20k deletes, 1 GiB stored.
  A heavy user generates ~100–200 writes/day (debounced), so ~10 users/day uses
  well under 5% of quota. Firebase Auth is free for this scale (tens of thousands
  of users).
- Each user's whole progress lives in ONE document (max ~1 MiB; actual size tens of
  KB — sessions are capped at 300 in the merge logic).

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `auth/unauthorized-domain` on sign-in | The site's domain isn't in Authentication → Settings → Authorized domains — add it. |
| Account box doesn't appear at all | `firebase-config.js` still has placeholders, or `auth.js` failed to load (check browser console). |
| Sign-in works but progress doesn't sync | Check browser console for Firestore errors; verify the rules release is the repo version. |
| Password-reset email missing | Check spam — it comes from `noreply@ace-practice-91738.firebaseapp.com`. |
| `gcloud` commands fail with `invalid_grant` | Login expired — run `gcloud auth login`. |
| Firebase REST APIs return 403 with quota-project message | Add header `x-goog-user-project: ace-practice-91738` to the request. |

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
