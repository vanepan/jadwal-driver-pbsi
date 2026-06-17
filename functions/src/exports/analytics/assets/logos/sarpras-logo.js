'use strict';

/* ============================================================
   SARPRAS-LOGO.JS — Sarpras Operations mark for the report header

   The analytics report header (Zone A) carries the Sarpras
   Operations logo in its CENTER column. Puppeteer renders the
   report server-side, so the mark is inlined as a base64 data: URI
   (see sarpras-logo-data.js, generated from icons/icon-512.png).

   Why inlined-in-JS instead of an fs read of a .png file:
   a binary asset read at runtime requires the file to be packaged
   into the deployed Cloud Functions artifact AND __dirname to
   resolve to it — neither is guaranteed. Earlier the .png was NOT
   present at runtime, so the read returned null and the centre
   column rendered empty. A base64 string in a JS module is plain
   code: ALWAYS in the artifact, with no fs, no path resolution, no
   network, and no external URL. Offline-safe and cold-start-safe.

   hasSarprasLogo() reports whether a non-empty data URI is present;
   the header renders a "SARPRAS OPERATIONS" text wordmark fallback
   when it is not.
   ============================================================ */

const { SARPRAS_LOGO_DATA_URL } = require('./sarpras-logo-data');

const _url = (typeof SARPRAS_LOGO_DATA_URL === 'string' && SARPRAS_LOGO_DATA_URL.startsWith('data:image'))
  ? SARPRAS_LOGO_DATA_URL
  : null;

/** @returns {string|null} the logo as a base64 data: URI, or null when absent. */
function sarprasLogoDataUrl() {
  return _url;
}

/** @returns {boolean} true when a usable logo data URI is present. */
function hasSarprasLogo() {
  return _url != null;
}

module.exports = { sarprasLogoDataUrl, hasSarprasLogo };
