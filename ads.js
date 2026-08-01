"use strict";
// ---------------------------------------------------------------------------
// AdSense loader + lightweight consent gate.
//
// Loaded on every page (index.html and the generated domains/*, study-guide/,
// about/, privacy/, contact/ pages) right after ads-config.js. Does nothing
// at all — no script request, no DOM insertion, no banner — unless ALL of:
//
//   1. window.ADS_CONFIG.ADSENSE_CLIENT (ads-config.js) is a non-empty string
//   2. the visitor has explicitly clicked "Accept" on the on-site consent
//      notice below (stored in localStorage; declining or not deciding yet
//      both mean "no ads")
//   3. the page isn't running as an installed PWA (display-mode: standalone)
//      — ads inside a standalone install perform poorly and are a policy
//      grey area, so they're suppressed there unconditionally
//
// IMPORTANT — what this is NOT: a certified Consent Management Platform.
// Google requires an IAB-registered, Google-certified CMP to legally serve
// *personalized* ads to EEA/UK visitors. This file is a simple accept/decline
// gate that withholds ad loading until a choice is stored locally — it is
// useful (it stops any ad request before consent, and lets a visitor opt
// out), but it does not satisfy the EEA CMP requirement by itself. See
// privacy/index.html and README.md for what a real launch still needs.
// ---------------------------------------------------------------------------

(function () {
  var CONSENT_KEY = "gcp-ace-consent-v1";
  var cfg = window.ADS_CONFIG || {};
  var clientId = String(cfg.ADSENSE_CLIENT || "").trim();
  var slots = cfg.SLOTS || {};

  function getConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setConsent(ads) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ ads: ads, ts: Date.now() }));
    } catch (e) { /* localStorage unavailable (private mode etc.) — fail quiet, no ads */ }
  }

  function isStandalonePWA() {
    return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function adsEligible() {
    if (!clientId || isStandalonePWA()) return false;
    var c = getConsent();
    return !!(c && c.ads === true);
  }

  var scriptRequested = false;
  function loadAdSenseScript() {
    if (scriptRequested || document.getElementById("adsbygoogle-loader")) return;
    scriptRequested = true;
    var s = document.createElement("script");
    s.id = "adsbygoogle-loader";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(clientId);
    document.head.appendChild(s);
  }

  // Fills one .ad-slot element with an <ins class="adsbygoogle"> unit, if (and
  // only if) it has a data-ad-name that maps to a non-empty slot ID in
  // ADS_CONFIG.SLOTS. Safe to call more than once per element — a
  // data-filled flag makes it a no-op after the first successful fill, so
  // toggling an element's `hidden` attribute never re-requests an ad.
  function fillSlot(el) {
    if (!el || el.dataset.filled) return;
    var name = el.dataset.adName;
    var slotId = name && slots[name];
    if (!slotId) return; // this placement has no ad unit configured yet
    el.dataset.filled = "1";

    var label = document.createElement("div");
    label.className = "ad-label";
    label.textContent = "Advertisement";

    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.dataset.adClient = clientId;
    ins.dataset.adSlot = slotId;
    ins.dataset.adFormat = "auto";
    ins.dataset.fullWidthResponsive = "true";

    el.append(label, ins);
    loadAdSenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense push failed:", e);
    }
  }

  // Called by app.js when a slot that lives inside a hidden SPA view (the
  // quiz feedback area, the results screen) becomes visible. Filling lazily
  // — only at the moment a slot is actually shown — means no ad is ever
  // requested for a unit the visitor hasn't reached yet (e.g. the quiz-ad
  // slot while a question is still in progress).
  function reveal(el) {
    if (!adsEligible() || !el) return;
    fillSlot(el);
  }

  // Fills every eligible ad slot that's part of the page's default, visible
  // state (home screen ad, in-content placements on the static pages). Slots
  // that start out inside a hidden element are left alone until `reveal()`
  // is called for them explicitly.
  function activateVisibleSlots() {
    if (!adsEligible()) return;
    var candidates = document.querySelectorAll(".ad-slot[data-ad-name]");
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.offsetParent === null && el !== document.body) continue; // hidden ancestor — defer to reveal()
      fillSlot(el);
    }
  }

  // ---- consent banner ----------------------------------------------------

  function removeBanner() {
    var el = document.getElementById("ads-consent-banner");
    if (el) el.remove();
  }

  function showBanner() {
    if (!clientId) return; // nothing to ask consent for yet
    removeBanner();
    var banner = document.createElement("div");
    banner.className = "consent-banner";
    banner.id = "ads-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie and ad consent");
    banner.innerHTML =
      '<p>This site can show ads to keep practice free. Accepting allows Google AdSense to set ' +
      "cookies for ad personalization; declining keeps ads off. See our " +
      '<a href="/privacy/">privacy policy</a> for details.</p>' +
      '<div class="consent-actions">' +
      '<button type="button" id="consent-decline">Necessary only</button>' +
      '<button type="button" class="primary" id="consent-accept">Accept</button>' +
      "</div>";
    document.body.appendChild(banner);
    document.getElementById("consent-accept").onclick = function () {
      setConsent(true);
      removeBanner();
      activateVisibleSlots();
    };
    document.getElementById("consent-decline").onclick = function () {
      setConsent(false);
      removeBanner();
    };
  }

  function init() {
    if (!clientId) return; // master switch off — no banner, no ads, no requests
    if (!getConsent()) showBanner();
    activateVisibleSlots();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Small public API:
  // - AdsBridge.reveal(el): app.js calls this when a hidden-view ad slot
  //   (quiz feedback, results) becomes visible.
  // - adsConsent.openPreferences(): wired up by the footer's "Cookie
  //   preferences" control (only rendered when ads are configured — see the
  //   loop below) so a visitor can change their mind later.
  window.AdsBridge = { reveal: reveal };
  window.adsConsent = {
    openPreferences: showBanner,
    accept: function () { setConsent(true); removeBanner(); activateVisibleSlots(); },
    decline: function () { setConsent(false); removeBanner(); },
  };

  // Populate the footer's cookie-preferences control, but only when there's
  // actually something to manage — keeps the footer identical to today's
  // when ADSENSE_CLIENT is empty.
  function wireFooterControl() {
    var slot = document.getElementById("cookie-prefs-slot");
    if (!slot || !clientId) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link-btn";
    btn.textContent = "Cookie preferences";
    btn.onclick = showBanner;
    slot.append(" · ", btn);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireFooterControl);
  } else {
    wireFooterControl();
  }
})();
