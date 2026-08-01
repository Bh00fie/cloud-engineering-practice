// ---------------------------------------------------------------------------
// AdSense + affiliate configuration — mirrors the firebase-config.js pattern:
// everything below is a public-facing ID (not a secret), safe to commit once
// filled in. It's loaded as a plain <script> before ads.js on every page.
//
// CURRENT STATE: ADSENSE_CLIENT is live. Placements activate independently —
// a SLOTS entry left "" simply never renders, even with ADSENSE_CLIENT set,
// so units are being turned on one at a time as their ad-unit IDs arrive.
//
// TO ADD ANOTHER PLACEMENT:
//   1. Create the ad unit for that placement in the AdSense dashboard.
//   2. Paste its slot ID into SLOTS below.
//   3. Re-run `node tools/build-pages.mjs` — regenerates ads.txt so it stays
//      in sync with ADSENSE_CLIENT.
//   4. Redeploy.
// See README.md ("Turning ads on") and privacy/index.html for the full
// walkthrough, including what still requires a Google-certified CMP.
// ---------------------------------------------------------------------------
window.ADS_CONFIG = {
  // Your AdSense publisher ID, e.g. "ca-pub-1234567890123456". Leave "" to
  // switch every ad-related script and DOM node on the site off at once.
  ADSENSE_CLIENT: "ca-pub-9122089286210192",

  // Per-placement ad unit slot IDs from the AdSense dashboard. A placement
  // left "" simply never renders, even once ADSENSE_CLIENT is filled in —
  // so units can be turned on one at a time.
  SLOTS: {
    home: "4484411154",    // home screen, below the fold ("frontpage" unit)
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
