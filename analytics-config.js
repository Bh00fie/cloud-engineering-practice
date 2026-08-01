// ---------------------------------------------------------------------------
// Analytics configuration — same pattern as firebase-config.js / ads-config.js:
// a public-facing ID, safe to commit once filled in, loaded before
// analytics.js on every page.
//
// CURRENT STATE: GA4_MEASUREMENT_ID is empty. Until it's set, analytics.js
// does nothing at all — no script request, no cookies, no consent banner.
//
// TO GO LIVE:
//   1. Create a GA4 property (analytics.google.com), get its Measurement ID
//      ("G-XXXXXXXXXX").
//   2. Set GA4_MEASUREMENT_ID below.
//   3. Redeploy (no build step needed — this file is loaded directly).
// ---------------------------------------------------------------------------
window.ANALYTICS_CONFIG = {
  // e.g. "G-XXXXXXXXXX". Leave "" to keep analytics off — this is the master
  // switch: every analytics-related script and the consent banner stay
  // inert while it's empty.
  GA4_MEASUREMENT_ID: "",
};
