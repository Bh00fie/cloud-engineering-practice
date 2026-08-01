#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Build script for the site's crawlable SEO pages.
//
// WHY THIS EXISTS: the app itself is deliberately zero-build (plain HTML/JS,
// no bundler). But its 658 questions live only inside JS arrays that never
// become real URLs, so Google has nothing to index. This script generates a
// small set of genuinely-useful, human-readable STATIC pages — a study guide
// and one page per exam domain with real prose plus a curated sample of
// questions rendered as plain HTML — and writes them to disk as ordinary
// files that get committed like any other source file. It is NOT part of the
// site's runtime and Netlify does not run it; a human runs it manually
// whenever domain content changes or the site's base URL changes.
//
// USAGE
//   node tools/build-pages.mjs
//
// WHAT IT WRITES
//   domains/<slug>/index.html   (one per exam domain, 5 total)
//   study-guide/index.html
//   sitemap.xml
//   robots.txt
//   index.html                 (only the block between the
//                               <!-- SEO:START --> / <!-- SEO:END --> markers
//                               in <head> is replaced — nothing else in the
//                               file is touched)
//
// It reads (never writes) data/*.js to pull a handful of sample questions per
// domain — see pickSamples() for the selection rule. It intentionally does
// NOT dump the whole 658-question bank onto these pages (thin/duplicate
// content risk, and it would hand competitors the full bank for scraping).
//
// The site's base URL lives in ONE place: seo.config.mjs at the repo root.
// Change it there, re-run this script, and every generated file (plus the
// index.html marker block) picks up the new domain.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "../seo.config.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAMPLES_PER_DOMAIN = 8;
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 1. Load the question bank the same way index.html does (script tags in
//    order), but in a Node vm sandbox instead of a browser, so we never fork
//    the data format and never touch the files in data/.
// ---------------------------------------------------------------------------

function loadBank() {
  const dataDir = path.join(ROOT, "data");
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".js")).sort();
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(dataDir, f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox.window.QUESTION_BANK || [];
}

// One question per distinct topic, round-robin, sorted for determinism so
// re-running the script without data changes produces an identical diff.
function pickSamples(questions, n) {
  const byTopic = new Map();
  for (const q of questions) {
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q);
  }
  const topics = [...byTopic.keys()].sort();
  for (const t of topics) byTopic.get(t).sort((a, b) => a.id.localeCompare(b.id));
  const picked = [];
  let round = 0;
  while (picked.length < n) {
    const before = picked.length;
    for (const t of topics) {
      const arr = byTopic.get(t);
      if (arr[round]) picked.push(arr[round]);
      if (picked.length >= n) break;
    }
    if (picked.length === before) break; // ran out of questions entirely
    round++;
  }
  return picked.slice(0, n);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------------
// 2. Domain content — real prose, written once, reused every build.
// ---------------------------------------------------------------------------

const DOMAINS = [
  {
    num: 1,
    slug: "setting-up-a-cloud-solution-environment",
    title: "Setting Up a Cloud Solution Environment",
    weight: "~20%",
    metaDescription:
      "ACE exam Domain 1 study guide: resource hierarchy, projects, billing, Cloud Identity, and the gcloud CLI — plus 8 free sample questions with explanations.",
    intro: [
      `This is the exam's "GCP fundamentals" domain, and it's usually the easiest to pick up
       fast because it's about structure rather than services. Before you can deploy anything,
       you need somewhere to put it — and Google Cloud's answer is a strict hierarchy:
       an <strong>organization</strong> at the root, optional <strong>folders</strong> under it
       (folders can nest inside folders), <strong>projects</strong> inside folders or directly
       under the organization, and individual <strong>resources</strong> — VMs, buckets,
       databases — inside projects. IAM policies set higher in the tree are inherited
       downward, which is the single most-tested idea in this domain: put a policy on a
       folder and every project under it inherits it automatically.`,
      `Expect questions on <strong>project lifecycle</strong> (project IDs are chosen once and
       are immutable forever; a deleted project sits in a ~30-day recoverable state before
       it's gone for good and its ID can never be reused), on <strong>billing</strong> (a
       billing account can fund many projects; budgets and budget alerts don't cap spend by
       themselves — they only notify), and on <strong>Cloud Identity</strong> versus a
       Google Workspace account for managing users who don't need Gmail or Docs.`,
      `The other recurring theme is tooling: knowing what the <strong>Cloud SDK</strong>
       (<code>gcloud</code>, <code>gsutil</code>, <code>bq</code>) does versus the Console
       versus Cloud Shell, how to enable APIs a project needs before using a service, and
       the difference between a user account and a service account from day one — you'll
       see service accounts again in much more depth in Domain 5.`,
    ],
    tips: [
      "Memorize the hierarchy direction: Organization → Folder → Project → Resource — and that IAM inherits downward, never upward.",
      "Project ID is permanent; project name is not. A lot of wrong answers hinge on this exact distinction.",
      "A billing budget alert is a notification, not a spending cap — nothing stops the bill just because a budget was configured.",
    ],
  },
  {
    num: 2,
    slug: "planning-and-configuring-a-cloud-solution",
    title: "Planning & Configuring a Cloud Solution",
    weight: "~18%",
    metaDescription:
      "ACE exam Domain 2 study guide: choosing the right compute, storage, database, and networking service on Google Cloud — plus 8 free sample questions.",
    intro: [
      `Domain 2 is where the exam checks whether you can pick the <em>right</em> Google Cloud
       product for a scenario, not just recite what each one does. The classic
       decision is <strong>compute</strong>: Compute Engine when you need full control over
       the OS or specialized hardware, Google Kubernetes Engine (GKE) for containerized
       workloads that need orchestration at scale, Cloud Run for stateless containers that
       should scale to zero, and App Engine for a fully managed platform where you'd rather
       never think about infrastructure. Every mock question that says "minimize operational
       overhead" or "no infrastructure to manage" is steering you toward Cloud Run or App
       Engine, not Compute Engine.`,
      `The second recurring decision is <strong>storage and databases</strong>: Cloud SQL for
       managed MySQL/PostgreSQL/SQL Server at moderate scale, Cloud Spanner when you need
       horizontal scale <em>with</em> strong relational consistency across regions, Firestore
       for a serverless NoSQL document store behind mobile/web apps, Bigtable for
       high-throughput low-latency NoSQL at massive scale (time-series, IoT), and BigQuery
       for analytics over huge datasets with SQL. Cloud Storage rounds this out for object
       storage, and its <strong>storage classes</strong> (Standard, Nearline, Coldline,
       Archive) come up constantly — the differentiator is retrieval frequency and minimum
       storage duration, not just price.`,
      `Finally, expect network <strong>planning</strong> questions: when a VPC needs custom
       subnet ranges versus auto mode, when Cloud VPN is enough versus when Dedicated
       Interconnect is justified, and how VPC Peering or Shared VPC fit a multi-project
       setup. These are planning-stage questions — Domain 3 tests actually building the
       thing you planned here.`,
    ],
    tips: [
      "\"Minimize ops overhead / no servers to manage\" in a question almost always points to Cloud Run or App Engine over Compute Engine or GKE.",
      "Cloud Spanner is the answer whenever a question needs both horizontal scale AND strong (relational) consistency across regions — that combination is Spanner's whole reason to exist.",
      "Storage class questions are about access pattern and minimum duration, not just \"how cheap\" — Archive is cheapest per GB but has the longest minimum storage duration and highest retrieval cost.",
    ],
  },
  {
    num: 3,
    slug: "deploying-and-implementing-a-cloud-solution",
    title: "Deploying & Implementing a Cloud Solution",
    weight: "~22%",
    metaDescription:
      "ACE exam Domain 3 study guide, the exam's largest domain: deploying Compute Engine, GKE, Cloud Run, and data services — plus 8 free sample questions.",
    intro: [
      `Domain 3 carries the most weight on the real exam, and it's where planning turns into
       actual <code>gcloud</code> commands and console clicks. For <strong>Compute
       Engine</strong>, know instance templates and managed instance groups (MIGs) cold —
       MIGs are how you get autoscaling, autohealing, and rolling updates, and a huge share
       of "how do you deploy this at scale" questions resolve to "create an instance template,
       then a MIG from it." Custom images versus startup scripts versus baked containers is
       another recurring choice.`,
      `For <strong>GKE</strong>, expect questions on cluster types (zonal vs regional, and the
       tradeoffs of Autopilot vs Standard), deploying workloads (Deployments, Services,
       and how a LoadBalancer-type Service gets you an external IP), and node pool
       management — resizing, upgrading, and taints/tolerations at a conceptual level. You
       won't need deep Kubernetes YAML mastery for ACE, but you do need to recognize what
       each object is for.`,
      `Data-service deployment shows up too: creating a Cloud SQL instance with the right
       machine type and high-availability configuration, setting up a GCS bucket with the
       right location and access controls, and loading data into BigQuery. Round it out with
       <strong>networking implementation</strong> — firewall rules (source ranges, target
       tags, priority and the implied-deny-all default), HTTP(S) load balancers, and Cloud
       DNS record types. This domain rewards hands-on lab time more than any other; reading
       alone won't cement it.`,
    ],
    tips: [
      "If a scenario says \"scale automatically\" or \"replace unhealthy instances automatically,\" the answer is almost always a managed instance group, not a bare Compute Engine instance.",
      "VPC firewall rules default-deny ingress and default-allow egress; a missing firewall rule, not a broken app, is the most common reason a wrong answer says a connection \"fails.\"",
      "Know the difference between a GKE Service of type LoadBalancer (external IP, L4) and an Ingress (HTTP(S) routing, L7) — the exam tests exactly this distinction.",
    ],
  },
  {
    num: 4,
    slug: "ensuring-successful-operation",
    title: "Ensuring Successful Operation",
    weight: "~20%",
    metaDescription:
      "ACE exam Domain 4 study guide: Cloud Monitoring and Logging, managing compute and storage resources, and cost control — plus 8 free sample questions.",
    intro: [
      `Domain 4 is about keeping a deployed system healthy, visible, and affordable —
       the "day 2" operations work. <strong>Cloud Monitoring</strong> and
       <strong>Cloud Logging</strong> are the backbone: know how to build an alerting
       policy on a metric threshold, set up an uptime check, and use log-based metrics
       to alert on something that isn't a built-in metric. A recurring trap is
       confusing "an alert exists" with "someone gets notified" — alerting policies need a
       notification channel to actually reach a human.`,
      `Expect questions on <strong>managing compute resources</strong> day-to-day: resizing a
       managed instance group manually versus letting an autoscaler do it, changing a
       running instance's machine type (it has to be stopped first for most machine type
       changes), and live migration versus instance restart during host maintenance. For
       <strong>storage and databases</strong>, know snapshot scheduling for persistent disks,
       Cloud SQL automated backups and point-in-time recovery, and object lifecycle rules
       that transition or delete GCS objects automatically by age.`,
      `Cost questions are common here too: reading a billing export, acting on
       Recommender's rightsizing suggestions, and knowing that committed use discounts and
       sustained use discounts are different mechanisms (one requires a commitment up
       front, the other applies automatically to steady usage within a month). Finally,
       patch management via OS Config and basic maintenance windows round out the domain.`,
    ],
    tips: [
      "An alerting policy without a notification channel fires silently — always check that a channel (email, SMS, Pub/Sub) is actually attached.",
      "Changing a running Compute Engine instance's machine type normally requires stopping it first; that's a common \"why did this fail\" wrong-answer setup.",
      "Sustained use discounts apply automatically to steady month-long usage; committed use discounts require you to commit to 1 or 3 years up front for a deeper discount — don't mix these up.",
    ],
  },
  {
    num: 5,
    slug: "configuring-access-and-security",
    title: "Configuring Access and Security",
    weight: "~20%",
    metaDescription:
      "ACE exam Domain 5 study guide: IAM roles, service accounts, org policies, and data protection on Google Cloud — plus 8 free sample questions with explanations.",
    intro: [
      `Domain 5 is IAM in depth, and IAM is arguably the single most-tested subject across
       the <em>whole</em> exam once you count how often it resurfaces in other domains.
       Know the three role types cold: <strong>basic roles</strong> (Owner, Editor, Viewer —
       broad, legacy, generally discouraged in production), <strong>predefined roles</strong>
       (service-specific, Google-maintained, the usual right answer), and
       <strong>custom roles</strong> (when you need a permission set no predefined role
       matches, at the cost of maintaining it yourself). The principle of least privilege is
       the thread running through nearly every correct answer in this domain.`,
      `<strong>Service accounts</strong> get their own deep dive here: they're identities for
       workloads rather than people, they can be granted roles just like a user, and
       attaching a service account to a Compute Engine instance is almost always preferable
       to distributing a downloaded JSON key — key management (rotation, and never
       committing a key to source control) is a frequent exam trap. Understand
       impersonation and short-lived credentials as the modern alternative to long-lived
       keys.`,
      `Beyond IAM proper, expect <strong>organization policies</strong> (constraints applied
       at the org/folder/project level — e.g., restricting VM external IPs or which regions
       resources can be created in) and basic <strong>data protection</strong>: Google
       encrypts data at rest by default, Cloud KMS is how you manage your own encryption
       keys (customer-managed encryption keys, CMEK) when default encryption isn't enough,
       and Cloud Audit Logs record who did what, when — Admin Activity logs are on and
       cannot be disabled; Data Access logs mostly have to be turned on deliberately.`,
    ],
    tips: [
      "Predefined roles are the default correct answer whenever one fits; basic roles (Owner/Editor/Viewer) are almost always the wrong, over-broad choice in a security-focused question.",
      "Prefer attaching a service account to the resource that needs it over downloading and distributing a long-lived JSON key — key-handling questions test exactly this instinct.",
      "Admin Activity audit logs are always on and can't be turned off; Data Access audit logs (except for BigQuery) are off by default and must be enabled — a frequently-tested distinction.",
    ],
  },
];

// ---------------------------------------------------------------------------
// 3. Templates
// ---------------------------------------------------------------------------

function pageHead({ title, description, canonicalPath, jsonLd, rootRelPrefix = "../../" }) {
  const canonical = `${SITE_URL}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:image" content="${DEFAULT_OG_IMAGE}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="theme-color" content="#f9f9f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${rootRelPrefix}icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${rootRelPrefix}styles/pages.css">
${(Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<nav class="site-nav"><a href="${rootRelPrefix}">${esc(SITE_NAME)}</a> · <a href="${rootRelPrefix}study-guide/">Study guide</a></nav>
<div class="wrap">`;
}

const FOOTER = (depth) => `</div>
<footer class="site-footer">
  <a href="${depth}">${esc(SITE_NAME)}</a> — free practice questions and explanations for the
  Google Cloud Associate Cloud Engineer exam. Not affiliated with Google.
</footer>
</body>
</html>
`;

function renderQuestionCard(q) {
  const correctSet = new Set(Array.isArray(q.a) ? q.a : [q.a]);
  const opts = q.o
    .map((text, i) => {
      const isCorrect = correctSet.has(i);
      return `<li${isCorrect ? ' class="correct"' : ""}>${esc(text)}${isCorrect ? '<span class="tag">Correct</span>' : ""}</li>`;
    })
    .join("\n      ");
  return `  <div class="card q-card">
    <span class="topic">${esc(q.topic)}</span>
    <p class="qtext">${esc(q.q)}</p>
    <ul class="opts">
      ${opts}
    </ul>
    <div class="explain"><strong>Why:</strong> ${esc(q.x)}</div>
  </div>`;
}

function domainQuizJsonLd(domain, samples) {
  return {
    "@context": "https://schema.org",
    "@type": "Quiz",
    name: `GCP ACE Domain ${domain.num}: ${domain.title} — sample questions`,
    about: { "@type": "Thing", name: `Google Cloud Associate Cloud Engineer exam — ${domain.title}` },
    educationalAlignment: {
      "@type": "AlignmentObject",
      alignmentType: "educationalSubject",
      targetName: "Google Cloud Associate Cloud Engineer certification",
    },
    hasPart: samples.map((q) => ({
      "@type": "Question",
      name: q.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${q.o[Array.isArray(q.a) ? q.a[0] : q.a]} — ${q.x}`,
      },
    })),
  };
}

function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

function buildDomainPage(domain, samples) {
  const canonicalPath = `/domains/${domain.slug}/`;
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Study guide", url: `${SITE_URL}/study-guide/` },
    { name: `Domain ${domain.num}`, url: `${SITE_URL}${canonicalPath}` },
  ]);
  const jsonLd = [breadcrumb, domainQuizJsonLd(domain, samples)];
  const head = pageHead({
    title: `GCP ACE Domain ${domain.num}: ${domain.title}`,
    description: domain.metaDescription,
    canonicalPath,
    jsonLd,
    rootRelPrefix: "../../",
  });

  const otherDomains = DOMAINS.filter((d) => d.num !== domain.num)
    .map((d) => `<a href="../${d.slug}/"><strong>Domain ${d.num}</strong>${esc(d.title)}</a>`)
    .join("\n      ");

  const body = `
  <p class="crumbs"><a href="../../">${esc(SITE_NAME)}</a> / <a href="../../study-guide/">Study guide</a> / Domain ${domain.num}</p>
  <h1>GCP ACE Domain ${domain.num}: ${esc(domain.title)}</h1>
  <p class="lede">Roughly ${domain.weight} of the Google Cloud Associate Cloud Engineer exam. What it
  actually covers, the traps to know, and ${samples.length} free sample questions with full explanations.</p>

  ${domain.intro.map((p) => `<p>${p.trim().replace(/\s+/g, " ")}</p>`).join("\n  ")}

  <div class="card">
    <h3>Exam tips for this domain</h3>
    <ul>
      ${domain.tips.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ul>
  </div>

  <h2>Sample questions — Domain ${domain.num}</h2>
  <p>These ${samples.length} questions are drawn from our full bank of 658 to show the style and
  depth you'll get in the app. Each comes with the full explanation you'd see after answering
  in a real practice session.</p>
${samples.map(renderQuestionCard).join("\n")}

  <div class="card" style="text-align:center">
    <h3>Practice this domain for real</h3>
    <p>The app has dozens more Domain ${domain.num} questions with instant scoring, spaced
    repetition of what you get wrong, and progress tracking across sessions.</p>
    <a class="cta" href="../../?domain=${domain.num}#view-home">Start Domain ${domain.num} practice →</a>
  </div>

  <h2>Other exam domains</h2>
  <div class="domain-grid">
    ${otherDomains}
  </div>
`;
  return head + body + FOOTER("../../");
}

function buildStudyGuidePage() {
  const canonicalPath = `/study-guide/`;
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Study guide", url: `${SITE_URL}${canonicalPath}` },
  ]);
  const courseLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: "Google Cloud Associate Cloud Engineer (ACE) Study Guide",
    description:
      "A free breakdown of everything on the Google Cloud Associate Cloud Engineer exam: format, cost, passing score, and the five exam domains.",
    provider: { "@type": "Organization", name: SITE_NAME, sameAs: SITE_URL },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: "PT20H",
    },
  };
  const faqs = [
    ["How many questions are on the ACE exam?", "50–60 multiple-choice and multiple-select questions, in 120 minutes."],
    ["What's the passing score?", "Google doesn't publish an exact cut score. ~70% is the commonly cited bar — aim for consistent 80%+ on mock exams before booking."],
    ["How much does the exam cost?", "$125 USD (plus tax where applicable), the same fee for retakes — there's no discounted retake rate."],
    ["How long is the certification valid?", "3 years from the date you pass. A shorter, cheaper renewal exam is available starting 180 days before expiry."],
    ["What are the five exam domains?", "Setting up a cloud solution environment (~20%), planning & configuring a cloud solution (~18%), deploying & implementing a cloud solution (~22%), ensuring successful operation (~20%), and configuring access & security (~20%)."],
    ["Is prior hands-on experience required?", "Not formally required, but Google recommends 6+ months of hands-on Google Cloud experience — the exam rewards having actually run gcloud commands, not just read about them."],
  ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  const jsonLd = [breadcrumb, courseLd, faqLd];
  const head = pageHead({
    title: "Google Cloud ACE Exam Study Guide 2026 — Domains, Format & Tips",
    description:
      "What's actually on the Google Cloud Associate Cloud Engineer exam: format, cost, passing score, and a breakdown of all five domains with links to free sample questions.",
    canonicalPath,
    jsonLd,
    rootRelPrefix: "../",
  });

  const domainRows = DOMAINS.map(
    (d) => `<tr><td>Domain ${d.num}</td><td><a href="../domains/${d.slug}/">${esc(d.title)}</a></td><td>${d.weight}</td></tr>`
  ).join("\n      ");

  const domainGrid = DOMAINS.map(
    (d) => `<a href="../domains/${d.slug}/"><strong>Domain ${d.num} · ${d.weight}</strong>${esc(d.title)}</a>`
  ).join("\n      ");

  const body = `
  <p class="crumbs"><a href="../">${esc(SITE_NAME)}</a> / Study guide</p>
  <h1>Google Cloud Associate Cloud Engineer (ACE) Exam — Study Guide</h1>
  <p class="lede">What's actually on the exam, in plain terms — format, cost, the five domains,
  and where to start. Every domain links to a page with real sample questions and explanations.</p>

  <h2>Exam format at a glance</h2>
  <table>
    <tr><th>Length</th><td>50–60 questions, 120 minutes</td></tr>
    <tr><th>Question types</th><td>Multiple choice and multiple select</td></tr>
    <tr><th>Cost</th><td>$125 USD (same fee for retakes)</td></tr>
    <tr><th>Passing bar</th><td>Not published; ~70% is the commonly cited target</td></tr>
    <tr><th>Validity</th><td>3 years, with a shorter renewal exam available near expiry</td></tr>
    <tr><th>Delivery</th><td>Remote-proctored online or at a test center</td></tr>
  </table>

  <h2>The five exam domains</h2>
  <p>Each domain below links to a dedicated page with real study content and free sample
  questions with explanations — not just a list of topics.</p>
  <table>
    <tr><th>Domain</th><th>Covers</th><th>Weight</th></tr>
    ${domainRows}
  </table>
  <div class="domain-grid">
    ${domainGrid}
  </div>

  <h2>Frequently asked questions</h2>
  <dl class="faq">
    ${faqs.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("\n    ")}
  </dl>

  <div class="card" style="text-align:center;margin-top:24px">
    <h3>Ready to practice?</h3>
    <p>658 original questions, four study modes, and free progress tracking — no sign-up required to start.</p>
    <a class="cta" href="../">Start practicing free →</a>
  </div>
`;
  return head + body + FOOTER("../");
}

// ---------------------------------------------------------------------------
// 4. Sitemap + robots.txt
// ---------------------------------------------------------------------------

function buildSitemap() {
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0" },
    { loc: `${SITE_URL}/study-guide/`, priority: "0.9" },
    ...DOMAINS.map((d) => ({ loc: `${SITE_URL}/domains/${d.slug}/`, priority: "0.8" })),
  ];
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${BUILD_DATE}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function buildRobots() {
  return `# ${SITE_NAME} — ${SITE_URL}
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /netlify/
Disallow: /tools/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

// ---------------------------------------------------------------------------
// 5. Patch the SEO marker block in the root index.html
// ---------------------------------------------------------------------------

function buildHomeSeoBlock() {
  const title = "Free GCP Associate Cloud Engineer (ACE) Practice Exam – 658 Questions";
  const description =
    "658 original Associate Cloud Engineer (ACE) practice questions with full explanations, a 120-minute mock exam, and free progress tracking. No sign-up required to start.";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any (runs in a web browser)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "658 original practice questions across all 5 ACE exam domains",
      "Written explanation after every answer",
      "120-minute timed mock exam matching the real exam's domain weighting",
      "Per-domain practice and a review-missed mode with spaced repetition",
      "Progress tracking with charts, synced to the cloud when signed in",
    ],
  };
  return `<!-- SEO:START — regenerated by tools/build-pages.mjs from seo.config.mjs, do not hand-edit -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE_URL}/">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:image" content="${DEFAULT_OG_IMAGE}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<!-- SEO:END -->`;
}

function patchIndexHtml() {
  const file = path.join(ROOT, "index.html");
  const src = fs.readFileSync(file, "utf8");
  const marker = /<!-- SEO:START.*?SEO:END -->/s;
  if (!marker.test(src)) {
    console.warn("WARNING: index.html has no <!-- SEO:START -->/<!-- SEO:END --> markers — skipping patch. " +
      "Add the markers once (see README) and re-run.");
    return;
  }
  const patched = src.replace(marker, buildHomeSeoBlock());
  fs.writeFileSync(file, patched);
  console.log("Patched index.html SEO block.");
}

// ---------------------------------------------------------------------------
// 6. Run
// ---------------------------------------------------------------------------

function write(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log("Wrote", relPath);
}

function main() {
  const bank = loadBank();
  if (bank.length === 0) {
    console.error("No questions loaded from data/*.js — aborting so we don't overwrite pages with empty content.");
    process.exit(1);
  }

  for (const domain of DOMAINS) {
    const pool = bank.filter((q) => q.domain === domain.num);
    const samples = pickSamples(pool, SAMPLES_PER_DOMAIN);
    write(`domains/${domain.slug}/index.html`, buildDomainPage(domain, samples));
  }

  write("study-guide/index.html", buildStudyGuidePage());
  write("sitemap.xml", buildSitemap());
  write("robots.txt", buildRobots());
  patchIndexHtml();

  console.log(`\nDone. Loaded ${bank.length} questions, sampled ${SAMPLES_PER_DOMAIN} per domain.`);
}

main();
