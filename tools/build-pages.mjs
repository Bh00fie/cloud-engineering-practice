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
//   topics/<slug>/index.html    (one per topic cluster — see TOPICS below)
//   topics/index.html           (hub page listing all topics)
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
const SAMPLES_PER_TOPIC = 6;
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
// 2b. Topic content — one page per cluster of related q.topic values, real
//     prose written once and reused every build. Clusters exist so a page has
//     enough underlying questions to be substantial (some raw q.topic values
//     have as few as 5 questions on their own — too thin to carry a page).
//     matchTopics must match the `topic` field in data/*.js exactly.
// ---------------------------------------------------------------------------

const TOPICS = [
  {
    slug: "iam-roles-and-permissions",
    title: "IAM Roles & Permissions",
    matchTopics: ["IAM", "IAM basics"],
    primaryDomain: 5,
    relatedDomains: [1, 5],
    metaDescription:
      "GCP IAM roles explained for the ACE exam: basic vs predefined vs custom roles, policy inheritance, and the exam's most-tested IAM traps — plus free sample questions.",
    intro: [
      `IAM shows up more than any other subject on the ACE exam, once you count how often it
       resurfaces inside questions that are nominally about something else. Start with the
       three role types: <strong>basic roles</strong> (Owner, Editor, Viewer — broad, legacy,
       almost never the right answer once security is in scope), <strong>predefined roles</strong>
       (service-scoped, Google-maintained, usually the correct choice), and
       <strong>custom roles</strong> (built from individual permissions when no predefined role
       fits, at the cost of maintaining them yourself as APIs evolve).`,
      `The mechanic the exam leans on hardest is that <strong>IAM policy is additive and
       inherits downward</strong>: a project's effective policy is the union of everything set
       directly on it plus everything set on its folders and organization above it, and there is
       no way to revoke an inherited grant at a lower level — only deny policies (a separate,
       newer mechanism) can restrict what an inherited grant allows. Grant a role on a folder and
       every project under it inherits it automatically; that's usually presented as a feature in
       the question, not a trap, but it means broad grants placed high in the hierarchy are hard
       to walk back later.`,
      `Principals are the "who": user accounts, service accounts, Google groups, and
       Workspace/Cloud Identity domains, plus special identifiers like
       <code>allAuthenticatedUsers</code>. Granting a role to a <strong>group</strong> rather than
       individually to each member is the answer whenever a question is about managing access at
       scale — membership changes then handle themselves with a full audit trail, instead of
       someone having to remember to revoke access when a person changes teams.`,
    ],
    tips: [
      "Basic roles (Owner/Editor/Viewer) are almost always the wrong answer once a question mentions least privilege or security — predefined is the usual correct choice.",
      "IAM is additive and inherits downward; you cannot remove a grant made at a higher level from underneath it, only add a deny policy on top.",
      "Grant roles to a Google group instead of individual users whenever a question is really about managing access at scale, not about a single one-off grant.",
    ],
  },
  {
    slug: "service-accounts-and-identity",
    title: "Service Accounts & Identity",
    matchTopics: ["Service accounts", "Cloud Identity"],
    primaryDomain: 5,
    relatedDomains: [1, 5],
    metaDescription:
      "Service accounts and Cloud Identity for the GCP ACE exam: key management, impersonation, and workforce identity — the exam's favorite security traps, with free sample questions.",
    intro: [
      `Service accounts are identities for <strong>workloads</strong>, not people — a VM, a
       Cloud Run service, or a CI pipeline authenticates as one instead of borrowing a human's
       credentials. They can hold IAM roles exactly like a user account, and the exam's central
       question about them is almost always the same shape: how does this workload get
       credentials, and is that the safest way to do it.`,
      `The safest way, in nearly every scenario the exam poses, is to <strong>attach</strong> the
       service account to the resource that needs it (a Compute Engine instance, a Cloud Run
       revision) rather than generate and download a long-lived JSON key. Downloaded keys are a
       recurring trap: they don't expire on their own, they're easy to leak into source control or
       a laptop, and rotating them is a manual, easy-to-forget process. When impersonation is on
       the table instead — one identity temporarily acting as a service account via
       <code>roles/iam.serviceAccountTokenCreator</code> — that's the modern, short-lived-credential
       alternative the exam wants you to recognize as the better answer.`,
      `<strong>Cloud Identity</strong> is the separate, adjacent idea of managing the humans:
       it provisions corporate identities (and is what creates an Organization node in the resource
       hierarchy) without requiring a paid Google Workspace subscription, and it can federate with
       an existing identity provider via SAML SSO and directory sync so a company's existing AD
       accounts authenticate into Google Cloud without duplicate identity management.`,
    ],
    tips: [
      "Attaching a service account to the resource that uses it beats downloading a JSON key almost every time a question is framed around security — key leakage is the implied risk.",
      "Impersonation (roles/iam.serviceAccountTokenCreator) issues short-lived credentials without ever distributing a key file — recognize it as the more modern answer.",
      "Cloud Identity creates an Organization and manages people; it doesn't require Google Workspace, and it's what federates an existing on-prem AD via SAML/directory sync.",
    ],
  },
  {
    slug: "billing-pricing-and-cost-management",
    title: "Billing, Pricing & Cost Management",
    matchTopics: ["Billing", "Pricing", "Quotas"],
    primaryDomain: 1,
    relatedDomains: [1, 4],
    metaDescription:
      "GCP billing, pricing, and quotas for the ACE exam: budgets vs budget caps, committed vs sustained use discounts, and billing export to BigQuery — plus free sample questions.",
    intro: [
      `A project links to exactly <strong>one billing account</strong> at a time, and changing
       that link needs both Project Billing Manager on the project and Billing Account User on
       the account — a two-sided permission the exam likes to test directly. One billing account
       can fund many projects, which is the normal setup for an organization: central finance
       owns billing, individual teams own their projects.`,
      `The single most-repeated trap in this topic is that a <strong>budget alert doesn't cap
       spending</strong>. Budgets are set on a billing account with percentage thresholds that
       trigger email notifications to billing admins/users, and optionally a Pub/Sub message you
       could wire up to automate a response yourself — but nothing about a budget alert, by
       itself, stops a service from running or a bill from growing. If a question wants spend
       actually capped, the answer involves quotas, a programmed response to the Pub/Sub
       notification, or simply not provisioning more than intended in the first place.`,
      `On discounts, keep <strong>sustained use</strong> and <strong>committed use</strong>
       straight: sustained use discounts apply automatically to steady month-long Compute Engine
       usage with no commitment required, while committed use discounts need a 1- or 3-year
       up-front commitment in exchange for a deeper discount. For visibility into what's actually
       being spent, Billing export to BigQuery writes detailed line-item usage and cost data
       (including labels) somewhere finance can run SQL against it or connect a BI tool like
       Looker Studio.`,
    ],
    tips: [
      "A budget alert is a notification, not a spending cap — nothing about it stops a service or reduces the bill by itself.",
      "Sustained use discounts are automatic for steady month-long usage; committed use discounts require a 1- or 3-year up-front commitment for a deeper rate. Don't swap these.",
      "Moving a project to a different billing account needs Billing Account User on the account AND Project Billing Manager on the project — one alone isn't enough.",
    ],
  },
  {
    slug: "google-kubernetes-engine-gke",
    title: "Google Kubernetes Engine (GKE)",
    matchTopics: ["GKE", "GKE ops"],
    primaryDomain: 3,
    relatedDomains: [2, 3, 4],
    metaDescription:
      "GKE for the GCP ACE exam: zonal vs regional clusters, Autopilot vs Standard, Deployments vs Services, and day-2 operations — plus free sample questions with explanations.",
    intro: [
      `Creating a cluster is <code>gcloud container clusters create</code>; the flag that
       matters most conceptually is <code>--region</code> versus the zonal default —
       <code>--region</code> makes a regional (multi-zone) cluster where <code>--num-nodes</code>
       applies <em>per zone</em>, which is a common source of "why do I have more nodes than I
       asked for" confusion in scenario questions. Once the cluster exists,
       <code>gcloud container clusters get-credentials</code> writes its endpoint and auth config
       into your local kubeconfig so <code>kubectl</code> can talk to it — logging in again
       doesn't add a cluster context, and it's a frequent wrong-answer distractor.`,
      `<strong>Autopilot vs Standard</strong> is the exam's other core GKE decision: Autopilot is
       fully managed Kubernetes where Google operates the nodes and you pay per pod, trading some
       control for zero node management; Standard leaves node pool sizing, upgrades, and
       maintenance to you in exchange for more control. "Minimize operational overhead" in a GKE
       question usually points to Autopilot the same way it points to Cloud Run in a broader
       compute-choice question.`,
      `On the workload side, know what each object is for without needing deep YAML mastery:
       <strong>Deployments</strong> manage ReplicaSets to keep a desired replica count running and
       orchestrate rolling updates/rollbacks; <strong>Services</strong> give pods stable
       networking, where <code>type: LoadBalancer</code> specifically provisions a Google Cloud
       passthrough load balancer with an external IP (Layer 4) — for HTTP(S) routing you'd reach
       for an Ingress instead, and the exam tests that L4-vs-L7 distinction directly.`,
    ],
    tips: [
      "--region creates a regional cluster where --num-nodes applies per zone, not total — a common source of \"more nodes than expected\" scenario questions.",
      "\"Minimize ops overhead / no node management\" in a GKE question points to Autopilot over Standard the same way it points to Cloud Run over Compute Engine elsewhere.",
      "A Service of type LoadBalancer is Layer 4 with an external IP; Ingress is Layer 7 HTTP(S) routing. The exam tests this exact distinction more than once.",
    ],
  },
  {
    slug: "gcloud-cli-commands",
    title: "gcloud CLI Commands",
    matchTopics: ["gcloud"],
    primaryDomain: 1,
    relatedDomains: [1, 3],
    metaDescription:
      "The gcloud CLI commands most tested on the GCP ACE exam: config, auth, impersonation, and the difference between gcloud, Cloud Shell, and the Console — free sample questions.",
    intro: [
      `The ACE exam expects you to recognize what a <code>gcloud</code> command does when you
       see it, not memorize every flag. <code>gcloud config list</code> prints the active
       configuration's properties — account, project, default region/zone — which is different
       from <code>gcloud projects list</code> (enumerates every project you can at least
       <code>resourcemanager.projects.get</code> on) and different again from
       <code>gcloud projects describe</code> (metadata for one specific project). Mixing these
       three up is one of the exam's most common wrong-answer patterns.`,
      `On authentication, <code>gcloud auth login</code> opens a browser flow to authenticate
       your own Google identity for interactive CLI use; the related but distinct
       <code>gcloud auth application-default login</code> sets up Application Default Credentials
       for code and client libraries running on your machine — the exam expects you to know these
       are two different credential stores serving two different purposes, not the same command
       twice.`,
      `For workloads that shouldn't use a downloaded key,
       <strong>impersonation</strong> (<code>gcloud config set auth/impersonate_service_account</code>
       or the <code>--impersonate-service-account</code> flag, backed by
       <code>roles/iam.serviceAccountTokenCreator</code>) issues short-lived credentials on demand
       instead of a long-lived file that can leak. Beyond the CLI itself, know when each tool is
       the right one: the <strong>Console</strong> for one-off exploratory changes, <strong>Cloud
       Shell</strong> for a preconfigured browser shell with the SDK and common tools already
       installed, and a local <code>gcloud</code> install (or Terraform on top of it) for anything
       repeatable.`,
    ],
    tips: [
      "gcloud config list shows CLI settings (account, project, region/zone); gcloud projects list enumerates projects you can access — don't confuse the two.",
      "gcloud auth login authenticates you for interactive CLI use; gcloud auth application-default login sets up ADC for code/client libraries — two separate credential stores.",
      "Impersonation via roles/iam.serviceAccountTokenCreator issues short-lived credentials with no key file to leak — recognize it as the safer alternative whenever a scenario mentions automation or a workload.",
    ],
  },
  {
    slug: "choosing-the-right-compute-option",
    title: "Choosing the Right Compute Option",
    matchTopics: ["Compute choice"],
    primaryDomain: 2,
    relatedDomains: [2],
    metaDescription:
      "Compute Engine vs GKE vs Cloud Run vs App Engine vs Cloud Functions for the GCP ACE exam — the decision framework the exam actually tests, plus free sample questions.",
    intro: [
      `This is a pure decision-framework topic, and the exam rewards recognizing the scenario's
       keywords over knowing every product's feature list. <strong>Compute Engine</strong> is the
       answer whenever you see full OS control, custom agents, specialized hardware, or a
       lift-and-shift migration — you own the operating system, with everything that implies.
       <strong>Serverless platforms</strong> (Cloud Run, Cloud Functions, App Engine standard)
       abstract the OS away entirely; whenever a scenario says "minimize operational overhead" or
       "no infrastructure to manage," the answer is one of these three, not Compute Engine or GKE.`,
      `Within serverless, the differentiator is trigger shape: <strong>Cloud Run</strong> runs
       containers that scale from zero based on request load with no infrastructure to manage —
       the general-purpose serverless answer for anything that fits in a container.
       <strong>Cloud Functions</strong> is the textbook choice for event-driven, short-lived,
       per-object work (a Cloud Storage upload invoking a function directly via Eventarc is the
       classic exam scenario); polling for events instead of reacting to them directly is a
       frequent wrong-answer setup.`,
      `Between the two container-orchestration options, <strong>GKE Autopilot</strong> is full
       Kubernetes with Google operating the nodes (you pay per pod, keep the K8s API surface),
       <strong>GKE Standard</strong> leaves node management to you for more control, and
       <strong>Cloud Run</strong> hides Kubernetes entirely for teams that just want a container to
       run — reach for GKE specifically when a scenario needs Kubernetes-native features
       (custom schedulers, specific networking/CRDs), and Cloud Run when it just needs "run this
       container."`,
    ],
    tips: [
      "\"Minimize ops overhead / no infrastructure to manage\" points to Cloud Run, Cloud Functions, or App Engine — never Compute Engine or GKE Standard.",
      "Event-driven, short-lived, per-object triggers (e.g. a Cloud Storage upload) point to Cloud Functions via Eventarc, not a polling loop on a VM.",
      "Reach for GKE specifically when a scenario needs Kubernetes-native features; reach for Cloud Run when it just needs to run a container without touching K8s at all.",
    ],
  },
  {
    slug: "compute-engine-deployment-and-operations",
    title: "Compute Engine Deployment & Operations",
    matchTopics: ["Compute Engine", "Compute ops"],
    primaryDomain: 3,
    relatedDomains: [2, 3, 4],
    metaDescription:
      "Compute Engine on the GCP ACE exam: instance templates, managed instance groups, startup scripts, and day-2 operations like machine-type changes — free sample questions.",
    intro: [
      `<code>gcloud compute instances create</code> is the canonical way to create a VM, with
       <code>--machine-type</code> and <code>--zone</code> setting shape and placement (omitting
       <code>--zone</code> falls back to your configured default, which the exam likes to use as a
       "why did this land in the wrong place" trap). For repeatable, scalable deployment, an
       <strong>instance template</strong> plus a <strong>managed instance group (MIG)</strong> is
       the pattern to reach for — MIGs are how you get autoscaling, autohealing, and rolling
       updates, and almost any "deploy this at scale" scenario resolves to "create a template,
       then a MIG from it," not manually creating individual instances.`,
      `Bootstrapping runs through the <code>startup-script</code> metadata key, which Compute
       Engine executes on every boot (not just the first) — the standard way to configure a fresh
       instance without baking a fully custom image, though a custom image is the better answer
       when the setup is heavy enough that repeating it at every boot would be wasteful.`,
      `On day-2 operations: changing a <strong>running</strong> instance's machine type normally
       requires stopping it first for most machine-type changes, which is a common "why did this
       fail" setup in scenario questions. Remote access splits by OS —
       <code>gcloud compute ssh</code> manages keys and connects (through IAP tunneling when
       configured for internal-only VMs) for Linux, while <code>reset-windows-password</code>
       creates or resets a local Windows account and returns a password for RDP, since SSH isn't
       the default Windows path and no password is emailed automatically.`,
    ],
    tips: [
      "\"Deploy/scale automatically\" almost always resolves to an instance template + managed instance group, not manually creating individual Compute Engine instances.",
      "Changing a running instance's machine type normally requires stopping it first — a frequent \"why did this fail\" setup in operations scenarios.",
      "startup-script runs on every boot, which makes it right for lightweight bootstrap and wrong (too repetitive/slow) for heavy setup — that's when a custom image is the better answer instead.",
    ],
  },
  {
    slug: "cloud-monitoring-logging-and-audit-logs",
    title: "Cloud Monitoring, Logging & Audit Logs",
    matchTopics: ["Monitoring", "Logging", "Audit logs"],
    primaryDomain: 4,
    relatedDomains: [4, 5],
    metaDescription:
      "Cloud Monitoring, Cloud Logging, and audit logs for the GCP ACE exam: alerting policies, log sinks, and the admin-vs-data-access log distinction — free sample questions.",
    intro: [
      `An <strong>alerting policy</strong> evaluates a metric condition over a duration and
       fires to a notification channel — but it only reaches a human if a channel (email, SMS,
       Pub/Sub) is actually attached. Dashboards visualize metrics but don't page anyone; log
       sinks archive logs but don't alert; budgets are a completely separate system. A frequent
       exam trap: an alerting policy exists and looks correctly configured, but there's no
       notification channel attached, so it fires silently and nobody finds out.`,
      `On what's actually visible: the hypervisor can see CPU and network externally without any
       extra setup, but it can't see inside the guest — memory percentage, disk usage, swap, and
       application-level metrics all require installing the <strong>Ops Agent</strong> on the
       instance. This is a recurring "why don't I see this metric" scenario. For events that
       aren't a built-in metric at all, a <strong>log-based metric</strong> turns a pattern in your
       logs into something you can alert on the same way.`,
      `Logs Explorer's query language filters by resource, severity, label, text, and time — a
       container's own filesystem is ephemeral and not a substitute for centralized logging. Log
       <strong>sinks</strong> route logs at ingestion time to GCS/BigQuery/Pub/Sub or another log
       bucket for long-term retention (Logging's own default buckets keep most logs for roughly
       30 days). For <strong>audit logs</strong> specifically: Admin Activity logs are always on
       and cannot be disabled; Data Access logs (except for BigQuery, which is always on) are off
       by default and have to be enabled deliberately — a distinction the exam tests directly.`,
    ],
    tips: [
      "An alerting policy without an attached notification channel fires silently — always check that a channel (email, SMS, Pub/Sub) actually exists on the policy.",
      "CPU and network are visible without extra setup; memory, disk, swap, and app-level metrics need the Ops Agent installed on the instance.",
      "Admin Activity audit logs are always on and can't be turned off; Data Access audit logs (except BigQuery) are off by default and must be enabled deliberately.",
    ],
  },
  {
    slug: "vpc-networking-and-load-balancing",
    title: "VPC Networking & Load Balancing",
    matchTopics: ["Networking", "Load balancing"],
    primaryDomain: 3,
    relatedDomains: [2, 3],
    metaDescription:
      "VPC networking and load balancer types for the GCP ACE exam: firewall rule defaults, VPC peering pitfalls, and picking the right LB — plus free sample questions.",
    intro: [
      `VPC firewall rules <strong>default-deny ingress and default-allow egress</strong>; a
       missing ingress rule, not a broken application, is the exam's most common explanation for
       why a connection "fails" in a scenario question. Rules are evaluated by priority, matched
       on source ranges and target tags, and — like IAM — this is a topic where knowing the
       default behavior matters more than memorizing every parameter.`,
      `<strong>VPC Peering</strong> (and most hybrid-connectivity setups) breaks or blackholes
       traffic when the two sides have overlapping IP ranges, so planning non-overlapping RFC 1918
       space up front is the correct move whenever a question mentions connecting VPCs or an
       on-prem network. <strong>Cloud NAT</strong> is outbound-only — it lets private instances
       reach the internet without a public IP, but it does not accept inbound connections, which is
       a frequent wrong-answer trap when a question actually needs inbound access.`,
      `On load balancers, match the layer to the need: the <strong>global external Application
       Load Balancer</strong> is Layer 7 — one anycast IP worldwide, TLS termination, URL routing,
       CDN integration, cross-region failover. A <strong>passthrough Network Load Balancer</strong>
       is Layer 4, regional, handles arbitrary TCP/UDP, and preserves the original source IP,
       unlike the HTTP(S)-only ALB. An <strong>internal Application Load Balancer</strong> gives you
       the same L7 routing but scoped to private RFC 1918 addresses inside your VPC — the answer
       whenever a scenario needs HTTP routing that should never be reachable from the public
       internet.`,
    ],
    tips: [
      "VPC firewalls default-deny ingress and default-allow egress — a missing ingress rule is the most common reason a scenario says a connection \"fails.\"",
      "VPC Peering fails or blackholes with overlapping IP ranges; plan non-overlapping RFC 1918 space before connecting VPCs or hybrid networks.",
      "Cloud NAT is outbound-only — it never accepts inbound connections, which trips up questions that actually need something reachable from outside.",
    ],
  },
  {
    slug: "choosing-a-database",
    title: "Choosing a Database on Google Cloud",
    matchTopics: ["Database choice", "Cloud SQL"],
    primaryDomain: 2,
    relatedDomains: [2, 3],
    metaDescription:
      "Cloud SQL vs Spanner vs Firestore vs Bigtable vs BigQuery for the GCP ACE exam — the exact decision framework the exam tests, plus free sample questions with explanations.",
    intro: [
      `This is one of the exam's cleanest decision-framework topics because each database has a
       genuinely distinct sweet spot. <strong>Cloud SQL</strong> is managed MySQL/PostgreSQL/SQL
       Server for conventional relational workloads at single-region scale — read replicas scale
       reads, but writes stay bound to the primary. <strong>Cloud Spanner</strong> is the answer
       whenever a scenario needs <em>both</em> horizontal scale <em>and</em> strong relational
       consistency across regions at once — that specific combination is Spanner's entire reason
       to exist, and no other Google Cloud database offers it.`,
      `<strong>Firestore</strong> is the serverless NoSQL document database built for mobile/web
       apps — client SDKs, live listeners, offline persistence — while <strong>Bigtable</strong>
       is the wide-column NoSQL store built for massive throughput and low-latency key-based
       access, with time-series and IoT data as its flagship use case; it has no client-side sync
       and is a poor fit for anything mobile-facing. <strong>BigQuery</strong> rounds this out as
       the answer for analytics over huge datasets with SQL — it's not meant to be an
       application's transactional backend at all.`,
      `<strong>Cloud SQL</strong> deserves its own operational detail beyond the choice itself:
       automated backups and point-in-time recovery are how you protect it day to day, and it
       supports high-availability configuration (a standby in a different zone) for scenarios that
       specifically call out failover or uptime requirements — a separate consideration from which
       database engine to pick in the first place.`,
    ],
    tips: [
      "Spanner is the answer whenever a scenario needs BOTH horizontal scale AND strong relational consistency across regions — that exact combination is unique to it.",
      "Bigtable is for massive-throughput, low-latency, key-based access (time series, IoT); Firestore is for mobile/web apps that need client sync and offline support. Don't swap them.",
      "BigQuery is for SQL analytics over large datasets, not as an application's transactional backend — a scenario asking for both should point you elsewhere.",
    ],
  },
  {
    slug: "resource-hierarchy-projects-and-apis",
    title: "Resource Hierarchy, Projects & APIs",
    matchTopics: ["Resource hierarchy", "Projects", "APIs"],
    primaryDomain: 1,
    relatedDomains: [1],
    metaDescription:
      "GCP resource hierarchy, project lifecycle, and enabling APIs for the ACE exam — the structural fundamentals every other domain builds on, plus free sample questions.",
    intro: [
      `Every resource in Google Cloud sits inside a strict hierarchy: an
       <strong>organization</strong> at the root, optional <strong>folders</strong> beneath it
       (folders can nest inside folders), <strong>projects</strong> inside folders or directly
       under the organization, and individual <strong>resources</strong> — VMs, buckets,
       databases — inside projects. IAM policies set higher in the tree are inherited downward,
       which makes a Finance folder with a policy on it a genuinely effective way to manage access
       centrally across every project underneath, automatically, without touching each project
       individually.`,
      `<strong>Project lifecycle</strong> has two facts the exam tests constantly: the
       <strong>project ID</strong> is chosen once at creation and is immutable forever, while the
       <strong>project name</strong> is just a mutable display label — and the <strong>project
       number</strong> is a third, separate identifier Google assigns automatically. A deleted
       project enters a roughly 30-day pending-deletion state during which someone with the right
       permissions can run <code>gcloud projects undelete</code> or use the console to restore it;
       after that window, it's gone for good and its ID can never be reused by anyone.`,
      `Before using a Google Cloud service in a project, its <strong>API</strong> has to be
       enabled — a step that's easy to forget when reading a scenario and a common reason a
       described setup "doesn't work" until you notice the API was never turned on. This is also
       the domain where <strong>Cloud Identity</strong> and Google Workspace decisions get made
       (see the Service Accounts & Identity topic for the identity side of that), and where billing
       accounts first get linked to a project.`,
    ],
    tips: [
      "Memorize the hierarchy direction: Organization → Folder → Project → Resource, with IAM inheriting downward only, never upward.",
      "Project ID is permanent and chosen once; project name is a mutable label; project number is auto-assigned. A lot of wrong answers hinge on confusing these three.",
      "A deleted project is recoverable for about 30 days via gcloud projects undelete — after that window it's gone permanently and the ID can never be reused.",
    ],
  },
  {
    slug: "cloud-storage-classes-access-and-security",
    title: "Cloud Storage: Classes, Access & Security",
    matchTopics: ["Storage", "Storage ops", "Cloud Storage", "Storage security"],
    primaryDomain: 2,
    relatedDomains: [2, 3, 4, 5],
    metaDescription:
      "Cloud Storage for the GCP ACE exam: storage classes, versioning, lifecycle rules, and access control — the difference between Storage, Persistent Disk, and Filestore.",
    intro: [
      `First, tell the storage products apart: <strong>Cloud Storage</strong> is object storage
       (buckets, HTTP access) for unstructured data; <strong>Persistent Disk</strong> (or
       Hyperdisk) is a block device attached to a single VM, read-write, at a time; and
       <strong>Filestore</strong> is managed NFS that many clients can mount simultaneously with
       POSIX semantics. A scenario needing shared, simultaneous read-write access from multiple
       instances is describing Filestore, not a Persistent Disk — PD's read-write mode is single
       attachment only.`,
      `<strong>Storage classes</strong> (Standard, Nearline, Coldline, Archive) come up
       constantly, and the differentiator the exam actually tests is <strong>access frequency and
       minimum storage duration</strong>, not just raw price — Archive is cheapest per GB but has
       the longest minimum storage duration and the highest retrieval cost, so it's wrong for
       anything accessed even occasionally. <strong>Multi-region</strong> and
       <strong>dual-region</strong> buckets replicate across geographically separated locations
       for higher availability against a regional failure; <strong>versioning</strong> preserves
       prior object generations on overwrite or delete (an "undo" mechanism, usually paired with a
       lifecycle rule to expire old versions and control the extra storage cost it creates).`,
      `On access control, prefer <strong>uniform bucket-level access</strong> and IAM over legacy
       per-object ACLs whenever a question is framed around simplifying or auditing permissions —
       ACLs are the older, more granular but harder-to-audit mechanism. For encryption, Google
       encrypts data at rest by default at no extra cost; Cloud KMS with customer-managed encryption
       keys (CMEK) is the answer when a scenario specifically needs you to control key rotation and
       revocation yourself (see the Data Protection topic for the full CMEK-vs-CSEK breakdown).`,
    ],
    tips: [
      "Shared, simultaneous read-write access from multiple instances is Filestore, not Persistent Disk — PD read-write mode attaches to exactly one instance.",
      "Storage class differences are about access frequency and minimum storage duration, not just \"how cheap\" — Archive has the longest minimum duration and highest retrieval cost.",
      "Prefer uniform bucket-level access (IAM) over legacy per-object ACLs whenever a question is about simplifying or auditing bucket permissions.",
    ],
  },
  {
    slug: "serverless-compute-cloud-run-and-app-engine",
    title: "Serverless Compute: Cloud Run & App Engine",
    matchTopics: ["Cloud Run", "App Engine", "Serverless ops"],
    primaryDomain: 3,
    relatedDomains: [2, 3, 4],
    metaDescription:
      "Cloud Run and App Engine on the GCP ACE exam: deploying, traffic splitting, and each project's one-app-per-project rule — plus free sample questions with explanations.",
    intro: [
      `Each project hosts <strong>exactly one App Engine app</strong>, in one region chosen at
       creation that can never be changed afterward — needing "another" App Engine app for
       something is a signal that a scenario actually needs a second project, not a second app
       inside the same one. Inside that single app, work is organized into services, each with
       versions, which is how App Engine supports multiple components without multiple apps.`,
      `<code>gcloud run deploy</code> creates or updates a Cloud Run service, and
       <code>--allow-unauthenticated</code> grants <code>run.invoker</code> to
       <code>allUsers</code> — a flag the exam likes to test because it's the exact mechanism by
       which a service becomes publicly reachable versus staying IAM-gated. Cloud Run and App
       Engine are genuinely different products (not two names for the same thing), and neither is
       the same as Cloud Functions, even though all three get grouped under "serverless."`,
      `Cloud Run's <strong>revision model</strong> is worth knowing in operational depth: prior
       revisions are kept, so traffic management can flip back to an older one instantly with no
       rebuild required, and traffic can be split by percentage across revisions natively — with
       tags for direct per-revision URLs, that's canary and blue/green deployment without any
       extra infrastructure. Deleting the service itself breaks its URL permanently; containers
       are immutable and ephemeral by design, which is why configuration belongs in environment
       variables or Secret Manager, not baked into the image.`,
    ],
    tips: [
      "Each project has exactly one App Engine app in one immutable region — needing \"another app\" almost always means the scenario needs a second project.",
      "--allow-unauthenticated on gcloud run deploy grants run.invoker to allUsers — recognize it as the exact flag that makes a Cloud Run service publicly reachable.",
      "Cloud Run keeps prior revisions and splits traffic by percentage natively — instant rollback and canary deployment need no extra infrastructure beyond that.",
    ],
  },
  {
    slug: "data-protection-encryption-and-secret-manager",
    title: "Data Protection: Encryption & Secret Manager",
    matchTopics: ["Encryption", "Secret Manager"],
    primaryDomain: 5,
    relatedDomains: [3, 5],
    metaDescription:
      "Encryption and Secret Manager on the GCP ACE exam: default encryption vs CMEK vs CSEK, and why secrets don't belong in code — plus free sample questions.",
    intro: [
      `Google Cloud encrypts data at rest <strong>by default, universally, at no extra cost</strong> —
       a fact the exam expects you to know so you don't overcomplicate a scenario that doesn't
       actually need customer-managed keys. When a scenario does need more control,
       <strong>CMEK</strong> (customer-managed encryption keys, via Cloud KMS) gives you rotation,
       revocation, and IAM control over the key itself while Google still stores and uses it;
       <strong>CSEK</strong> (customer-supplied encryption keys) goes further — Google never
       stores your key at all, which means maximal control but also maximal operational burden:
       lose the key, and the data is unrecoverable.`,
      `<strong>Secret Manager</strong> exists because secrets — API keys, database passwords,
       tokens — don't belong in container images, config files, or a Git repository: images and
       repos both leak secrets to anyone with read access, and Git history keeps old commits around
       even after a secret is "removed" from the latest one. Secret Manager instead provides
       versioned, IAM-controlled, audit-logged secret storage with native integration into Cloud
       Run and GKE, so a workload can bind a secret at runtime (e.g. via <code>--set-secrets</code>
       on Cloud Run) without the value ever appearing in a config file or the image itself.`,
      `Put together, this topic is really about recognizing when the <strong>default</strong> is
       already sufficient (most scenarios) versus when a specific requirement — regulatory,
       contractual, "we must control our own keys" — pushes you toward CMEK or, rarely, the
       heavier CSEK. The exam rewards not over-engineering a security answer just as much as it
       rewards catching a genuine gap.`,
    ],
    tips: [
      "Default encryption at rest is universal and free — don't reach for CMEK or CSEK unless the scenario specifically calls for customer control over the keys.",
      "CMEK = you control rotation/revocation/IAM on the key, Google still stores it; CSEK = you supply and hold the key entirely, so losing it means losing the data.",
      "Secrets belong in Secret Manager, bound at runtime — never in a container image, a config file, or committed to a Git repository, even one that's since had the secret \"removed.\"",
    ],
  },
  {
    slug: "infrastructure-as-code-and-cloud-shell",
    title: "Infrastructure as Code & Cloud Shell",
    matchTopics: ["IaC", "Cloud Shell"],
    primaryDomain: 1,
    relatedDomains: [1, 3],
    metaDescription:
      "Cloud Shell and infrastructure-as-code basics for the GCP ACE exam: what's ephemeral, what persists, and when to reach for Terraform — plus free sample questions.",
    intro: [
      `<strong>Cloud Shell</strong> is a free, browser-based shell with the Cloud SDK,
       <code>kubectl</code>, Terraform, and most common tools preinstalled — genuinely useful for
       interactive admin work without setting up a local environment. The exam-relevant detail is
       what persists and what doesn't: Cloud Shell provisions an <strong>ephemeral VM per
       session</strong>, but mounts a <strong>persistent 5 GB <code>$HOME</code></strong>, so files,
       scripts, and configs saved there survive between sessions while anything installed
       <em>outside</em> <code>$HOME</code> does not. Sessions also end after roughly 20 minutes of
       inactivity and are subject to weekly usage limits, which makes Cloud Shell wrong for
       long-running jobs — those belong on a VM, Cloud Build, or another durable compute option.`,
      `Cloud Shell also includes a full graphical code editor over your persistent
       <code>$HOME</code>, plus a <strong>Web Preview</strong> feature that proxies a port from
       the Cloud Shell VM to your browser — useful for quickly checking a locally-running web app
       without deploying it anywhere first.`,
      `On <strong>infrastructure as code</strong> more broadly: the exam doesn't expect deep
       Terraform authorship, but it does expect you to recognize IaC as the right answer whenever a
       scenario is about repeatable, version-controlled infrastructure changes rather than manual
       console clicks — the same instinct that favors instance templates + managed instance groups
       over hand-created VMs, or Deployment Manager/Terraform over a one-off gcloud command typed
       once and never recorded anywhere.`,
    ],
    tips: [
      "Cloud Shell's VM is ephemeral per session, but $HOME (5 GB) persists — anything installed outside $HOME is gone at the next session.",
      "Cloud Shell sessions end after ~20 minutes idle and have weekly usage limits — wrong tool for long-running jobs; use a VM, Cloud Build, or another durable option instead.",
      "\"Repeatable\" or \"version-controlled\" infrastructure changes point toward IaC (Terraform/Deployment Manager) over manual console clicks or one-off commands.",
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
  <div class="footer-links">
    <a href="${depth}">${esc(SITE_NAME)}</a> — free practice questions and explanations for the
    Google Cloud Associate Cloud Engineer exam. Not affiliated with Google.
  </div>
  <p><a href="/about/">About</a> · <a href="/privacy/">Privacy</a> · <a href="/contact/">Contact</a><span id="cookie-prefs-slot"></span></p>
</footer>
<!-- Analytics + ad config/loaders — both inert (no script requests, no
     cookies, no DOM insertion) while their respective config values are
     empty, which is the committed default. -->
<script defer src="${depth}analytics-config.js"></script>
<script defer src="${depth}analytics.js"></script>
<script defer src="${depth}ads-config.js"></script>
<script defer src="${depth}ads.js"></script>
</body>
</html>
`;

// One in-content ad placement per generated content page — inserted between
// two natural sections (never inside a card that looks like navigation/UI).
// Collapses to nothing (see .ad-slot:empty in styles/pages.css) unless a
// publisher ID, a "contentPage" slot ID, and visitor consent are all present.
const CONTENT_AD_SLOT = `<div class="ad-slot" data-ad-name="contentPage"></div>`;

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

function topicQuizJsonLd(topic, samples) {
  return {
    "@context": "https://schema.org",
    "@type": "Quiz",
    name: `GCP ACE: ${topic.title} — sample questions`,
    about: { "@type": "Thing", name: `Google Cloud Associate Cloud Engineer exam — ${topic.title}` },
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

  const relatedTopics = TOPICS.filter((t) => t.relatedDomains.includes(domain.num));
  const relatedTopicsBlock = relatedTopics.length === 0 ? "" : `
  <h2>Related topics</h2>
  <p>Deeper, focused pages on specific subjects that show up in Domain ${domain.num}:</p>
  <div class="domain-grid">
    ${relatedTopics.map((t) => `<a href="../../topics/${t.slug}/"><strong>Topic</strong>${esc(t.title)}</a>`).join("\n      ")}
  </div>
`;

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

  ${CONTENT_AD_SLOT}

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
${relatedTopicsBlock}`;
  return head + body + FOOTER("../../");
}

function buildTopicPage(topic, samples) {
  const canonicalPath = `/topics/${topic.slug}/`;
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Study guide", url: `${SITE_URL}/study-guide/` },
    { name: "Topics", url: `${SITE_URL}/topics/` },
    { name: topic.title, url: `${SITE_URL}${canonicalPath}` },
  ]);
  const jsonLd = [breadcrumb, topicQuizJsonLd(topic, samples)];
  const head = pageHead({
    title: `${topic.title} — GCP ACE Exam Guide`,
    description: topic.metaDescription,
    canonicalPath,
    jsonLd,
    rootRelPrefix: "../../",
  });

  const relatedDomainLinks = topic.relatedDomains
    .map((num) => DOMAINS.find((d) => d.num === num))
    .filter(Boolean)
    .map((d) => `<a href="../../domains/${d.slug}/"><strong>Domain ${d.num}</strong>${esc(d.title)}</a>`)
    .join("\n      ");

  const otherTopics = TOPICS.filter((t) => t.slug !== topic.slug)
    .map((t) => `<a href="../${t.slug}/"><strong>Topic</strong>${esc(t.title)}</a>`)
    .join("\n      ");

  const body = `
  <p class="crumbs"><a href="../../">${esc(SITE_NAME)}</a> / <a href="../../study-guide/">Study guide</a> / <a href="../../topics/">Topics</a> / ${esc(topic.title)}</p>
  <h1>${esc(topic.title)}</h1>
  <p class="lede">What actually gets tested on the Google Cloud Associate Cloud Engineer exam,
  the traps to know, and ${samples.length} free sample questions with full explanations.</p>

  ${topic.intro.map((p) => `<p>${p.trim().replace(/\s+/g, " ")}</p>`).join("\n  ")}

  <div class="card">
    <h3>Exam tips for this topic</h3>
    <ul>
      ${topic.tips.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ul>
  </div>

  ${CONTENT_AD_SLOT}

  <h2>Sample questions — ${esc(topic.title)}</h2>
  <p>These ${samples.length} questions are drawn from our full bank of 658 to show the style and
  depth you'll get in the app. Each comes with the full explanation you'd see after answering
  in a real practice session.</p>
${samples.map(renderQuestionCard).join("\n")}

  <div class="card" style="text-align:center">
    <h3>Practice this for real</h3>
    <p>The app has dozens more questions on this and every other topic, with instant scoring,
    spaced repetition of what you get wrong, and progress tracking across sessions.</p>
    <a class="cta" href="../../?domain=${topic.primaryDomain}#view-home">Start practicing →</a>
  </div>

  <h2>This topic shows up in</h2>
  <div class="domain-grid">
    ${relatedDomainLinks}
  </div>

  <h2>Other topics</h2>
  <div class="domain-grid">
    ${otherTopics}
  </div>
`;
  return head + body + FOOTER("../../");
}

function buildTopicsIndexPage() {
  const canonicalPath = `/topics/`;
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Study guide", url: `${SITE_URL}/study-guide/` },
    { name: "Topics", url: `${SITE_URL}${canonicalPath}` },
  ]);
  const head = pageHead({
    title: "GCP ACE Exam Topics — IAM, GKE, Networking, gcloud & More",
    description:
      "Focused study pages for the topics most tested on the Google Cloud Associate Cloud Engineer exam: IAM, GKE, networking, databases, gcloud, and more — free sample questions on each.",
    canonicalPath,
    jsonLd: [breadcrumb],
    rootRelPrefix: "../",
  });

  const rows = TOPICS.map((t) => {
    const domainNames = t.relatedDomains
      .map((num) => DOMAINS.find((d) => d.num === num))
      .filter(Boolean)
      .map((d) => `Domain ${d.num}`)
      .join(", ");
    return `<tr><td><a href="${t.slug}/">${esc(t.title)}</a></td><td>${esc(domainNames)}</td></tr>`;
  }).join("\n      ");

  const grid = TOPICS.map(
    (t) => `<a href="${t.slug}/"><strong>Topic</strong>${esc(t.title)}</a>`
  ).join("\n      ");

  const body = `
  <p class="crumbs"><a href="../">${esc(SITE_NAME)}</a> / <a href="../study-guide/">Study guide</a> / Topics</p>
  <h1>GCP ACE Exam Topics</h1>
  <p class="lede">The exam guide breaks the ACE exam into five broad domains — these pages go
  narrower, into the specific subjects (IAM, GKE, networking, databases, gcloud, and more) that
  come up again and again across those domains, each with real explanations and sample questions.</p>

  ${CONTENT_AD_SLOT}

  <table>
    <tr><th>Topic</th><th>Shows up in</th></tr>
    ${rows}
  </table>
  <div class="domain-grid">
    ${grid}
  </div>

  <div class="card" style="text-align:center;margin-top:24px">
    <h3>Ready to practice?</h3>
    <p>658 original questions, four study modes, and free progress tracking — no sign-up required to start.</p>
    <a class="cta" href="../">Start practicing free →</a>
  </div>
`;
  return head + body + FOOTER("../");
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

  ${CONTENT_AD_SLOT}

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

  <h2>Study by topic instead</h2>
  <p>Prefer to go narrower than a full domain? The
  <a href="../topics/">topics index</a> breaks the exam into ${TOPICS.length} focused subjects —
  IAM, GKE, networking, databases, gcloud, and more — each with its own page.</p>

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
// 3b. About / Privacy / Contact — required for AdSense review, and honest
//     regardless of whether the AdSense application is ever approved.
// ---------------------------------------------------------------------------

function buildAboutPage() {
  const canonicalPath = "/about/";
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "About", url: `${SITE_URL}${canonicalPath}` },
  ]);
  const head = pageHead({
    title: `About — ${SITE_NAME}`,
    description: "About GCP ACE Practice: a free, independent Associate Cloud Engineer practice tool with original questions — not exam dumps.",
    canonicalPath,
    jsonLd: breadcrumb,
    rootRelPrefix: "../",
  });
  const body = `
  <p class="crumbs"><a href="../">${esc(SITE_NAME)}</a> / About</p>
  <h1>About ${esc(SITE_NAME)}</h1>
  <p class="lede">A free, independent study tool for the Google Cloud Associate Cloud Engineer exam.</p>

  <h2>What this is</h2>
  <p>${esc(SITE_NAME)} is a self-contained practice app: 658 multiple-choice and multiple-select
  questions across the exam's five official domains, each with a full written explanation, a
  120-minute mock exam that mirrors the real exam's domain weighting, and free progress tracking.
  There's no paywall and no account requirement to start practicing.</p>

  <h2>About the questions</h2>
  <p><strong>Every question on this site is original</strong> — written for this app, modeled on
  the topic list in Google's own
  <a href="https://services.google.com/fh/files/misc/associate_cloud_engineer_exam_guide_english.pdf">official exam guide</a>
  and on publicly available Google Cloud documentation. They are <strong>not exam dumps</strong>:
  nothing here reproduces real, leaked, or "actual" exam questions, which would violate the
  certification's terms and defeat the point of studying in the first place. The goal is to build
  the same understanding the real exam tests, not to memorize its answer key.</p>

  <h2>Who runs this</h2>
  <p>${esc(SITE_NAME)} is an independent project and is not affiliated with, endorsed by, or
  sponsored by Google. "Google Cloud" and "Associate Cloud Engineer" are trademarks of Google LLC;
  they're used here only to describe what this site helps you study for.</p>

  <div class="card" style="text-align:center">
    <h3>Questions or found a mistake?</h3>
    <p>See the <a href="../contact/">Contact page</a> — corrections to questions are always welcome.</p>
  </div>
`;
  return head + body + FOOTER("../");
}

function buildContactPage() {
  const canonicalPath = "/contact/";
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Contact", url: `${SITE_URL}${canonicalPath}` },
  ]);
  const head = pageHead({
    title: `Contact — ${SITE_NAME}`,
    description: "Get in touch about GCP ACE Practice: question corrections, feedback, or privacy requests.",
    canonicalPath,
    jsonLd: breadcrumb,
    rootRelPrefix: "../",
  });
  // TODO(owner): replace the placeholder address below with a real inbox
  // before going live with ads — AdSense reviewers check that this resolves
  // to something real, and visitors need a way to reach you for privacy
  // requests (see privacy/index.html).
  const body = `
  <p class="crumbs"><a href="../">${esc(SITE_NAME)}</a> / Contact</p>
  <h1>Contact</h1>
  <p class="lede">Questions, corrections to a practice question, or a privacy request — all welcome.</p>

  <div class="card">
    <h3>Email</h3>
    <p><a href="mailto:TODO-owner-email@example.com">TODO-owner-email@example.com</a></p>
    <p style="color:var(--ink-3);font-size:13px">
      <strong>TODO (site owner):</strong> replace this placeholder with a real inbox before
      submitting the AdSense application — reviewers check that a contact address actually works.
    </p>
  </div>

  <div class="card">
    <h3>Found a wrong or outdated question?</h3>
    <p>Cloud products change; if a question is out of date or you think an answer is wrong, include
    the question text (or its topic) in your email and it'll be reviewed.</p>
  </div>

  <div class="card">
    <h3>Privacy requests</h3>
    <p>To access, export, or delete data associated with an account, see the
    <a href="../privacy/">privacy policy</a> for the quickest self-service options (in-app
    export/delete), or email the address above.</p>
  </div>
`;
  return head + body + FOOTER("../");
}

function buildPrivacyPage() {
  const canonicalPath = "/privacy/";
  const breadcrumb = breadcrumbJsonLd([
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Privacy", url: `${SITE_URL}${canonicalPath}` },
  ]);
  const head = pageHead({
    title: `Privacy Policy — ${SITE_NAME}`,
    description: "Privacy policy for GCP ACE Practice: cookies, Google AdSense, Firebase Authentication and Firestore data, the Gemini-powered chat feature, and opt-out options.",
    canonicalPath,
    jsonLd: breadcrumb,
    rootRelPrefix: "../",
  });
  const body = `
  <p class="crumbs"><a href="../">${esc(SITE_NAME)}</a> / Privacy</p>
  <h1>Privacy Policy</h1>
  <p class="lede">Last updated ${BUILD_DATE}. Plain-language summary: this site stores your quiz
  progress, optionally syncs it to the cloud if you create an account, and may show ads to keep
  the app free. Details below.</p>

  <h2>What's stored, and where</h2>
  <p><strong>Progress data (guest mode).</strong> If you never create an account, your quiz
  history — which questions you've seen, right/wrong counts, session scores — is stored only in
  your browser's <code>localStorage</code>. It never leaves your device. Clearing your browser's
  site data deletes it; the "Export progress" button on the home screen lets you back it up
  yourself first.</p>
  <p><strong>Account data (signed in).</strong> Creating an account uses
  <strong>Firebase Authentication</strong> (Google) for email/password sign-in, and your progress
  additionally syncs to <strong>Cloud Firestore</strong> (also Google), scoped to your account by
  server-side security rules so only you can read or write it. We store your email address and the
  same progress data described above — nothing else. Signing out clears the local copy on that
  device; the cloud copy remains until you request deletion (see Contact).</p>
  <p><strong>Chat feature.</strong> The in-quiz "Ask" chat sends your typed question (and the text
  of the practice question you're viewing, so it can answer in context) to Google's
  <strong>Gemini API</strong> via a server-side proxy — your message isn't tied to your account or
  stored by this site beyond the current session in your browser tab.</p>
  <p><strong>Analytics.</strong> This site does not currently run any separate analytics or
  tracking script beyond what's described above.</p>

  <h2>Cookies and similar technology</h2>
  <p>Firebase Authentication uses cookies/local storage to keep you signed in. If ads are active
  on this site (see below), Google AdSense and its partners may set cookies to serve and measure
  ads, including for personalization. A consent notice governs whether those ad cookies are set —
  see "Ads and consent" below.</p>

  <h2>Ads and consent</h2>
  <p>${esc(SITE_NAME)} may display ads served by <strong>Google AdSense</strong>. When active,
  AdSense and its advertising partners can use cookies and similar technology (including the
  DoubleClick/Google Ads cookie) to serve ads and measure their performance, and — if you consent —
  to personalize which ads you see based on your visits to this and other sites.</p>
  <p>Before any ad cookie is set, this site shows an on-site notice where you can
  <strong>Accept</strong> or choose <strong>Necessary only</strong>; your choice is remembered in
  your browser (localStorage) and no ad script loads until you accept. You can change your mind
  any time via the "Cookie preferences" link in the footer.</p>
  <p>You can also control ad personalization directly with Google at
  <a href="https://adssettings.google.com/">adssettings.google.com</a>, and general opt-outs are
  available through the <a href="https://optout.networkadvertising.org/">Network Advertising
  Initiative</a> and <a href="https://optout.aboutads.info/">DAA WebChoices</a> tools. Most
  browsers also let you block third-party cookies entirely.</p>
  <p style="color:var(--ink-2)"><strong>Note on the EEA/UK:</strong> the on-site notice above is a
  simple accept/decline gate, not a certified Consent Management Platform (CMP). If personalized
  advertising to EEA/UK visitors is ever enabled, it will go through a Google-certified CMP as
  required by Google's EU user consent policy and the IAB Transparency & Consent Framework — until
  then, ad personalization for those visitors is not enabled regardless of the on-site choice
  above.</p>

  <h2>Your choices</h2>
  <ul>
    <li>Practice fully anonymously — an account is never required.</li>
    <li>Export or delete your local progress any time from the home screen.</li>
    <li>Decline ad cookies via the consent notice or "Cookie preferences" in the footer.</li>
    <li>Request deletion of your cloud account data — see <a href="../contact/">Contact</a>.</li>
  </ul>

  <h2>Children's privacy</h2>
  <p>This site is intended for adults studying for a professional certification and is not
  directed at children under 13.</p>

  <h2>Changes to this policy</h2>
  <p>If what this site collects or how ads are configured changes, this page will be updated and
  the "last updated" date above will change.</p>

  <h2>Contact</h2>
  <p>Questions about this policy or a privacy request — see <a href="../contact/">Contact</a>.</p>
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
    { loc: `${SITE_URL}/topics/`, priority: "0.7" },
    ...TOPICS.map((t) => ({ loc: `${SITE_URL}/topics/${t.slug}/`, priority: "0.7" })),
    { loc: `${SITE_URL}/about/`, priority: "0.4" },
    { loc: `${SITE_URL}/privacy/`, priority: "0.3" },
    { loc: `${SITE_URL}/contact/`, priority: "0.3" },
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
// 4b. ads.txt — regenerated from ads-config.js so the publisher ID only ever
//     needs to be entered in one place. Meaningless (and harmless) until the
//     AdSense application is approved and ADSENSE_CLIENT is filled in.
// ---------------------------------------------------------------------------

function loadAdsConfig() {
  const file = path.join(ROOT, "ads-config.js");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: "ads-config.js" });
  return sandbox.window.ADS_CONFIG || { ADSENSE_CLIENT: "" };
}

function buildAdsTxt(adsConfig) {
  const clientId = String(adsConfig.ADSENSE_CLIENT || "").trim();
  if (!clientId) {
    return `# ads.txt — placeholder.
#
# ${SITE_NAME} has not yet been approved for Google AdSense, so there is no
# publisher ID to declare. This file exists so the URL resolves (some ad
# systems treat a missing ads.txt as a red flag) but currently authorizes no
# sellers.
#
# Once AdSense approves the site: fill in ADSENSE_CLIENT in ads-config.js and
# re-run \`node tools/build-pages.mjs\` — it will regenerate this file with
# the standard line:
#   google.com, pub-<your-id>, DIRECT, f08c47fec0942fa0
`;
  }
  const pubId = clientId.replace(/^ca-/, "");
  return `# ads.txt — authorizes Google AdSense to sell ad inventory on ${SITE_URL}
# Generated from ads-config.js by tools/build-pages.mjs — edit ADSENSE_CLIENT
# there, not this file directly.
google.com, ${pubId}, DIRECT, f08c47fec0942fa0
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

  for (const topic of TOPICS) {
    const pool = bank.filter((q) => topic.matchTopics.includes(q.topic));
    if (pool.length === 0) {
      console.error(`Topic "${topic.title}" matched 0 questions — matchTopics ${JSON.stringify(topic.matchTopics)} may be stale against data/*.js. Aborting.`);
      process.exit(1);
    }
    const samples = pickSamples(pool, SAMPLES_PER_TOPIC);
    write(`topics/${topic.slug}/index.html`, buildTopicPage(topic, samples));
  }
  write("topics/index.html", buildTopicsIndexPage());

  write("study-guide/index.html", buildStudyGuidePage());
  write("about/index.html", buildAboutPage());
  write("privacy/index.html", buildPrivacyPage());
  write("contact/index.html", buildContactPage());
  write("sitemap.xml", buildSitemap());
  write("robots.txt", buildRobots());
  write("ads.txt", buildAdsTxt(loadAdsConfig()));
  patchIndexHtml();

  console.log(`\nDone. Loaded ${bank.length} questions, sampled ${SAMPLES_PER_DOMAIN} per domain, ${SAMPLES_PER_TOPIC} per topic (${TOPICS.length} topics).`);
}

main();
