# GCP Associate Cloud Engineer — Practice App

A self-contained practice-exam app for the **Google Cloud Associate Cloud Engineer (ACE)**
certification. It ships with **658 original questions** written to match the
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

## Using it on your phone

The live site is fully responsive — open https://cloudaceprep.com on your
phone, sign in, and your progress follows you between devices (that's the Firestore sync).

To make it feel like a native app, install it to your home screen:

- **Android (Chrome)**: open the site → ⋮ menu → **Add to Home screen** (or "Install app").
- **iPhone (Safari)**: open the site → Share button → **Add to Home Screen**.

It then launches full-screen with its own icon (`manifest.webmanifest` + `icons/`), no
browser bars. Mobile-specific touches in the CSS: 44px+ tap targets for answer options
and the Check/Next buttons, full-width action buttons on narrow screens, no sticky hover
states on touch screens, 16px inputs so iOS doesn't zoom when you tap the login fields,
and safe-area padding for notched phones.

---

## What's inside

```
index.html          App shell, styling, view layout
app.js              All application logic (quiz engine, progress tracking, charts)
auth.js             Firebase Authentication + Firestore cloud sync (ES module)
firebase-config.js  Firebase web-app config for project ace-practice-91738 (not secret)
firestore.rules     Firestore security rules (the DEPLOYED version — keep in sync)
ads-config.js       AdSense/affiliate config — every value ships empty, see "Advertising" below
ads.js              AdSense loader + consent gate — inert while ads-config.js is empty
ads.txt             Generated from ads-config.js; placeholder until ADSENSE_CLIENT is set
netlify.toml        Netlify config (static site, no build step)
manifest.webmanifest  Web-app manifest so phones can "Add to Home Screen"
icons/              App icons (SVG + PNGs generated for the manifest / iOS)
data/
  domain1-a.js      Domain 1: Setting up a cloud solution environment  (130 q total)
  domain1-b.js
  domain2-a.js      Domain 2: Planning & configuring a cloud solution  (118 q total)
  domain2-b.js
  domain3-a.js      Domain 3: Deploying & implementing a cloud solution (147 q total)
  domain3-b.js
  domain3-c.js
  domain4-a.js      Domain 4: Ensuring successful operation             (130 q total)
  domain4-b.js
  domain5-a.js      Domain 5: Configuring access & security             (128 q total)
  domain5-b.js
  scenarios-a.js    100 exam-style scenario questions (verbose business
  scenarios-b.js    context, written to mimic the real exam's tone) spread
  scenarios-c.js    across all five domains — mixed into every mode
pyproject.toml      Only so `uv sync` / `uv run` work; no dependencies
seo.config.mjs      THE single place the site's public base URL lives (see "SEO & crawlable pages" below)
tools/
  build-pages.mjs   Generates the static SEO pages listed below — run manually, see below
styles/
  pages.css         Shared stylesheet for the generated /study-guide/ and /domains/ pages
study-guide/index.html   Generated: "what's on the exam" page (format, cost, FAQ, links to every domain)
domains/<slug>/index.html  Generated: one real study page per exam domain, with sample questions
about/index.html    Generated: what this site is, and that questions are original (not dumps)
privacy/index.html  Generated: cookies, AdSense, Firebase/Firestore, Gemini chat, opt-outs
contact/index.html  Generated: contact email (TODO placeholder — fill in before going live)
sitemap.xml         Generated: lists every indexable URL for search engines
robots.txt          Generated: allows crawling, points crawlers at sitemap.xml
```

The per-domain question counts mirror the official exam weighting
(~20% / 18% / 22% / 20% / 20%).

---

## SEO & crawlable pages

The interactive app in `index.html` renders everything client-side from JS, which
search engines can't meaningfully index — 658 questions and explanations that never
become real URLs. To fix that, a handful of **static, hand-written, human-readable
pages** exist alongside the app:

- `/study-guide/` — what's actually on the exam: format, cost, passing score, and a
  breakdown of the five domains, each linking onward.
- `/domains/<slug>/` — one page per exam domain (5 total) with real prose about what
  that domain covers and its common traps, plus **8 sample questions with full
  explanations** rendered as plain static HTML (not injected by JS, so crawlers and
  no-JS readers see them immediately).

These are a deliberately small, curated sample — not the whole 658-question bank —
so the pages read as a genuine study resource rather than a thin doorway page or a
free scrape of the entire question bank. `sitemap.xml` and `robots.txt` at the repo
root point crawlers at all of it, and the homepage links to every page from a "Free
study guides" card so there's a real link path in, not just a sitemap entry.

### Regenerating these pages

They're **generated by a script, not hand-maintained**, because keeping 5 domain
pages' sample-question sections in sync with `data/*.js` by hand would drift. The
project is still zero-build for the app itself — this is a one-off tool a human runs,
like `admin/stats.js`:

```
node tools/build-pages.mjs
```

This reads `data/*.js` (read-only — it never modifies them) to pull sample questions,
regenerates all 5 `domains/<slug>/index.html` pages, `study-guide/index.html`,
`sitemap.xml`, and `robots.txt`, and rewrites only the block between
`<!-- SEO:START -->` / `<!-- SEO:END -->` inside `index.html`'s `<head>` (title, meta
description, canonical, Open Graph/Twitter tags, JSON-LD) — nothing else in
`index.html` is touched. Re-run it whenever:

- the question bank changes enough that you want fresher sample questions,
- you edit the domain prose or FAQ copy inside `tools/build-pages.mjs`, or
- **the site gets a custom domain** — see below.

### Changing the site's URL (e.g. adding a custom domain)

The site's public base URL is **hardcoded in exactly one place**: `SITE_URL` in
`seo.config.mjs` at the repo root. Every generated file (canonical tags, Open Graph
URLs, JSON-LD, sitemap, robots.txt) is derived from it. To change domains:

1. Add the custom domain in Netlify (Site configuration → Domain management) and
   point DNS at it.
2. Edit `SITE_URL` in `seo.config.mjs`.
3. Run `node tools/build-pages.mjs` and commit the result.

The site currently serves from **cloudaceprep.com** (registered at names.co.uk, DNS
delegated to Netlify). `www.cloudaceprep.com` 301-redirects to the apex automatically.

The old `gcpcloudengineering.netlify.app` subdomain does **not** redirect — it keeps
serving the site with a `200`. Duplicate content is handled by the canonical tag
(every page points at `cloudaceprep.com`), so search engines consolidate correctly and
old links keep working. If you ever want a hard redirect instead, add to `netlify.toml`:

```toml
[[redirects]]
  from = "https://gcpcloudengineering.netlify.app/*"
  to = "https://cloudaceprep.com/:splat"
  status = 301
  force = true
```

---

## Analytics

The site has a **GA4 (Google Analytics 4)** integration wired the same way as ads —
inert until you turn it on, no third-party requests until then.

- **`analytics-config.js`** — master config (same pattern as `firebase-config.js` /
  `ads-config.js`): `GA4_MEASUREMENT_ID`, e.g. `"G-XXXXXXXXXX"`. **Ships empty.**
- **`analytics.js`** — loader + its own consent gate, loaded on every page. Does nothing —
  no `gtag.js` request, no cookie, no banner — unless `GA4_MEASUREMENT_ID` is non-empty and
  the visitor has explicitly accepted the on-site consent notice. Independent of `ads.js`'s
  consent banner by design: today only this one can ever fire, since AdSense isn't configured.
  When you do turn ads on, merge the two banners into one so a visitor is never asked twice —
  that's a deliberate TODO, not an oversight.
- Custom events fire via a global `window.trackEvent(name, params)` (always defined, always a
  safe no-op until analytics is active): `quiz_start` in `startQuiz()`, `quiz_complete` in
  `finishQuiz()` (`app.js`), and `signup` after a successful sign-up (`auth.js`).

### Turning analytics on

1. Create a GA4 property at [analytics.google.com](https://analytics.google.com) for
   `cloudaceprep.com`, get its Measurement ID.
2. Set `GA4_MEASUREMENT_ID` in `analytics-config.js`.
3. Redeploy — no build step needed, this file is loaded directly.

## Advertising, consent & policy pages

The site is wired for **Google AdSense** but AdSense has **not been applied for / approved
yet**, and there is no publisher ID anywhere in the repo. Everything below describes what's
built and what's still required before ads can actually run.

### Files involved

- **`ads-config.js`** — the master config, loaded as a plain `<script>` on every page (same
  pattern as `firebase-config.js`): `ADSENSE_CLIENT` (the `ca-pub-…` ID) and per-placement
  `SLOTS` IDs. **Every value ships empty.** These are public-facing IDs, not secrets — safe to
  commit once filled in.
- **`ads.js`** — the loader + consent gate, also loaded on every page. Reads `ads-config.js`
  and does **absolutely nothing** — no script request to Google, no ad `<div>` insertion, no
  consent banner — unless `ADSENSE_CLIENT` is non-empty, the visitor has explicitly accepted
  the on-site consent notice, and the page isn't running as an installed PWA
  (`display-mode: standalone` — ads inside a home-screen install perform poorly and are a
  policy grey area, so they're suppressed there unconditionally).
- **`ads.txt`** — regenerated by `tools/build-pages.mjs` from `ads-config.js`, so the publisher
  ID only has to be typed in one place. While `ADSENSE_CLIENT` is empty it's a placeholder
  comment; once filled in, re-running the build script writes the standard
  `google.com, pub-<id>, DIRECT, f08c47fec0942fa0` line.
- **`about/`, `privacy/`, `contact/`** — generated static pages (same pipeline as
  `domains/*`/`study-guide/`), templates live in `tools/build-pages.mjs`. AdSense reviewers
  check for exactly these three; `about/` also states plainly that every question is original
  and this is not an exam-dump site.

### Ad placements (and why)

| Placement | Where | Rule |
|---|---|---|
| Home screen | `#home-ad-slot`, below "Free study guides", above the export/reset footer tools | One unit, below the fold, never above the hero CTA or mode cards. |
| Quiz screen | `#quiz-ad-slot`, below the Check/Next buttons | **Only appears after an answer is checked** — feedback is on screen and options are already locked. Ad-free for the entire time a question is in progress; app.js re-hides it on every `renderQuestion()` and reveals it in `checkAnswer()`. |
| Results screen | `#results-promo-slot` (the pre-existing reserved slot) | Revealed when `finishQuiz()` runs — the single highest-intent moment on the site. |
| `domains/*`, `study-guide/` | One `.ad-slot[data-ad-name="contentPage"]` per page, between two content sections | This is the real ad inventory: static, crawlable, in-content — never adjacent to the quiz's answer options, so there's no accidental-click risk. |

All slots start as empty `<div class="ad-slot">` elements, and `.ad-slot:empty { display: none }`
collapses them to zero height — identical to the existing `.promo-slot` trick. `ads.js` only ever
inserts an `<ins class="adsbygoogle">` into a slot once config + consent + (for quiz/results)
visibility all line up; the moment it does, `.ad-slot ins.adsbygoogle { min-height: 250px }`
reserves the space immediately, before the creative itself loads, to keep CLS low.

### Consent — what's built vs. what's still required

`ads.js` ships a lightweight **accept/decline gate**: on first visit (only once `ADSENSE_CLIENT`
is non-empty) it shows a banner; nothing ad-related loads until the visitor clicks **Accept**,
and the choice is remembered in `localStorage`. A "Cookie preferences" control appears in the
footer (also only once ads are configured) so a visitor can change their mind. `privacy/index.html`
discloses all of this.

**This is not a Google-certified CMP.** Google requires an IAB-registered, Google-certified
Consent Management Platform to legally serve *personalized* ads to EEA/UK visitors. Before
enabling personalized ads for that traffic, pick one:

1. A hosted, Google-certified CMP (e.g. a CMP partner from Google's certified list — several
   have free tiers for low-traffic sites) whose snippet you add via a `<script>` tag — the one
   piece of "a third-party script" this zero-dependency site would need to accept.
2. Serve **non-personalized ads only** to EEA/UK traffic (still requires disclosure and a
   functioning opt-out, which the gate above already provides) — no certified CMP required for
   non-personalized-only serving, but you lose most of the RPM.
3. Geo-block ad serving to the EEA/UK entirely and run AdSense elsewhere.

Whichever you choose, `privacy/index.html` should be updated to match before going live.

### Turning ads on

1. Apply for AdSense with the live site (`about/`, `privacy/`, `contact/` already exist, which
   reviewers check for).
2. Once approved, set `ADSENSE_CLIENT` in `ads-config.js` to your `ca-pub-…` ID.
3. Create one ad unit per placement in the AdSense dashboard and paste each slot ID into
   `ads-config.js`'s `SLOTS` — placements with an empty slot ID simply never render, so you can
   turn units on one at a time.
4. Decide on the EEA/UK consent approach above and update `privacy/index.html` accordingly.
5. Run `node tools/build-pages.mjs` (regenerates `ads.txt` from the new `ADSENSE_CLIENT`) and
   redeploy.

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

The 658-question bank at 10–50 questions per session gives you weeks of
non-repeating practice. 100 of the questions are written in the real exam's
verbose scenario style — several sentences of business context with constraints
like "minimize cost" or "following Google-recommended practices" — so the mocks
read like the actual test.

---

## Live deployment — the full picture

> This section documents the ACTUAL deployed setup (July 2026), so future-you knows
> exactly what exists, where, and how to change it.

### URLs & consoles

| What | Where |
|---|---|
| **Live site** | <https://cloudaceprep.com> (old: <https://gcpcloudengineering.netlify.app>, redirects) |
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
| Authorized domains | `localhost`, `ace-practice-91738.firebaseapp.com`, `ace-practice-91738.web.app`, `gcpcloudengineering.netlify.app`, `cloudaceprep.com` |
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

It prints one row per user — questions covered (of 658), total answers, overall
accuracy, session count, last score, last-5-score trend, last active time — plus a
per-domain accuracy line for each user. Example:

```
┌─────────┬──────────────────┬─────────┬──────────┬──────────┬────────────┬───────────────┐
│  Email  │ Covered (of 658) │ Answers │ Accuracy │ Sessions │ Last score │ Last 5 scores │
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

- **Stat tiles** — questions covered (of 658), overall accuracy, sessions completed,
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
