// ---------------------------------------------------------------------------
// AdSense + affiliate configuration — mirrors the firebase-config.js pattern:
// everything below is a public-facing ID (not a secret), safe to commit once
// filled in. It's loaded as a plain <script> before ads.js on every page.
//
// CURRENT STATE: every value is empty. Until ADSENSE_CLIENT is filled in,
// ads.js (also loaded on every page) intentionally does nothing at all — no
// AdSense script is requested, no ad markup is inserted, and the consent
// banner never appears. The site behaves exactly as it does today.
//
// TO GO LIVE, once the AdSense application is approved:
//   1. Set ADSENSE_CLIENT to the "ca-pub-XXXXXXXXXXXXXXXX" value AdSense gives you.
//   2. Create an ad unit per placement below in the AdSense dashboard and
//      paste each unit's slot ID into SLOTS.
//   3. Re-run `node tools/build-pages.mjs` — it regenerates ads.txt from
//      ADSENSE_CLIENT so the two stay in sync.
//   4. Redeploy.
// See README.md ("Turning ads on") and privacy/index.html for the full
// walkthrough, including what still requires a Google-certified CMP.
// ---------------------------------------------------------------------------
window.ADS_CONFIG = {
  // Your AdSense publisher ID, e.g. "ca-pub-1234567890123456". Leave "" until
  // the AdSense application is approved — this is the master switch: every
  // ad-related script and DOM node on the site stays inert while it's empty.
  ADSENSE_CLIENT: "ca-pub-9122089286210192",

  // Per-placement ad unit slot IDs from the AdSense dashboard. A placement
  // left "" simply never renders, even once ADSENSE_CLIENT is filled in —
  // so units can be turned on one at a time. MVP: results only; the other
  // three light up the same way the moment their slot IDs exist.
  SLOTS: {
    home: "",              // home screen, below the fold, one unit
    quizFeedback: "",      // quiz screen, only after an answer is checked
    results: "9764657993", // results screen — the reserved #results-promo-slot ("Side by side" unit)
    contentPage: "",       // domains/* and study-guide/ in-content placement
  },

  // Optional affiliate program IDs. Not read by any code yet — present so a
  // future promo-slot pass has one place to put an ID rather than hardcoding
  // it into index.html.
  AFFILIATE: {
    // example: amazon: "yourtag-20"
  },
};
