// ---------------------------------------------------------------------------
// SEO configuration — THE single place that knows the site's public URL.
//
// The site's canonical home is the custom domain below; the Netlify subdomain
// (gcpcloudengineering.netlify.app) still resolves but redirects here. If the
// domain ever changes again, change SITE_URL here and re-run:
//
//   node tools/build-pages.mjs
//
// That regenerates sitemap.xml, robots.txt, the /domains/ and /study-guide/
// pages, and the canonical/Open-Graph block in index.html — so the new
// domain propagates everywhere from this one edit. Nothing else in the repo
// should hardcode the site's URL.
// ---------------------------------------------------------------------------

export const SITE_URL = "https://cloudaceprep.com";
export const SITE_NAME = "GCP ACE Practice";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/icons/icon-512.png`;
