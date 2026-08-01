"use strict";
// ---------------------------------------------------------------------------
// GA4 loader + consent gate.
//
// Loaded on every page right after analytics-config.js. Does nothing at all
// — no script request, no cookie, no banner — unless BOTH of:
//   1. window.ANALYTICS_CONFIG.GA4_MEASUREMENT_ID (analytics-config.js) is a
//      non-empty string
//   2. the visitor has explicitly clicked "Accept" on the on-site consent
//      notice below (stored in localStorage; declining or not deciding yet
//      both mean "no analytics")
//
// Independent of ads.js's consent banner by design: AdSense isn't configured
// yet, so today only this module's banner can ever show. Once
// ADS_CONFIG.ADSENSE_CLIENT (ads-config.js) is set, the two banners should be
// merged into one so a visitor is never asked twice — do that as part of
// turning ads on for real, not here.
// ---------------------------------------------------------------------------

(function () {
  var CONSENT_KEY = "gcp-ace-analytics-consent-v1";
  var cfg = window.ANALYTICS_CONFIG || {};
  var gaId = String(cfg.GA4_MEASUREMENT_ID || "").trim();

  function getConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setConsent(analytics) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: analytics, ts: Date.now() }));
    } catch (e) { /* localStorage unavailable (private mode etc.) — fail quiet, no analytics */ }
  }

  var scriptRequested = false;
  function loadGtag() {
    if (scriptRequested) return;
    scriptRequested = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gaId);
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    // This module only ever fires post opt-in for plain analytics, never for
    // ad targeting, so keep Google Signals / ad personalization off here
    // regardless of what ads.js is separately configured to do.
    window.gtag("config", gaId, { allow_google_signals: false, anonymize_ip: true });
  }

  function activate() {
    var c = getConsent();
    if (gaId && c && c.analytics === true) loadGtag();
  }

  // Called from app.js/auth.js at a handful of points (quiz_start,
  // quiz_complete, signup). Always defined, always safe to call — a no-op
  // until analytics is configured and consented to.
  window.trackEvent = function (name, params) {
    if (!gaId || !scriptRequested || typeof window.gtag !== "function") return;
    window.gtag("event", name, params || {});
  };

  // ---- consent banner ----------------------------------------------------

  function removeBanner() {
    var el = document.getElementById("analytics-consent-banner");
    if (el) el.remove();
  }

  function showBanner() {
    if (!gaId) return; // nothing to ask consent for yet
    removeBanner();
    var banner = document.createElement("div");
    banner.className = "consent-banner";
    banner.id = "analytics-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Analytics cookie consent");
    banner.innerHTML =
      "<p>This site uses analytics to see which pages and quiz modes people " +
      "actually use, so it can be improved. Accepting sets a Google Analytics " +
      'cookie; declining keeps it off. See our <a href="/privacy/">privacy policy</a> ' +
      "for details.</p>" +
      '<div class="consent-actions">' +
      '<button type="button" id="analytics-consent-decline">Necessary only</button>' +
      '<button type="button" class="primary" id="analytics-consent-accept">Accept</button>' +
      "</div>";
    document.body.appendChild(banner);
    document.getElementById("analytics-consent-accept").onclick = function () {
      setConsent(true);
      removeBanner();
      activate();
    };
    document.getElementById("analytics-consent-decline").onclick = function () {
      setConsent(false);
      removeBanner();
    };
  }

  function init() {
    if (!gaId) return; // master switch off — no banner, no script, no cookie
    var c = getConsent();
    if (!c) showBanner();
    else activate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.analyticsConsent = {
    openPreferences: showBanner,
    accept: function () { setConsent(true); removeBanner(); activate(); },
    decline: function () { setConsent(false); removeBanner(); },
  };
})();
