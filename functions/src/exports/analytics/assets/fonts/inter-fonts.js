'use strict';

/* ============================================================
   INTER-FONTS.JS — self-hosted Inter @font-face (base64 inlined)

   The approved design uses Inter at weights 100/300/400/500/600
   (+ italic 400). ADR-001/§10 require the font to be SELF-HOSTED
   and embedded at render time — never fetched from Google Fonts
   (offline-safe, cold-start-safe, deterministic, private).

   This module reads the Inter .woff2 files that sit next to it and
   emits @font-face rules with the binaries inlined as data: URIs,
   so headless Chrome has the font locally with zero network. The
   renderer additionally awaits document.fonts.ready before paging.

   ── ONE-TIME SETUP ──────────────────────────────────────────
   Drop these six files into this directory (see README.md):
     inter-latin-100-normal.woff2   (Thin)
     inter-latin-300-normal.woff2   (Light)
     inter-latin-400-normal.woff2   (Regular)
     inter-latin-500-normal.woff2   (Medium)
     inter-latin-600-normal.woff2   (SemiBold)
     inter-latin-400-italic.woff2   (Italic)
   Source: @fontsource/inter (npm) or rsms.me/inter. The filenames
   above match @fontsource/inter so they can be copied verbatim.

   If a file is missing it is skipped (Chromium falls back to
   system-ui). hasInterFonts() reports whether ANY face loaded, so
   the POC/verification can assert real Inter is embedded.
   ============================================================ */

const fs = require('fs');
const path = require('path');

/** filename → [weight, style]. Order = cascade order in the output. */
const FACES = [
  ['inter-latin-100-normal.woff2', 100, 'normal'],
  ['inter-latin-300-normal.woff2', 300, 'normal'],
  ['inter-latin-400-normal.woff2', 400, 'normal'],
  ['inter-latin-500-normal.woff2', 500, 'normal'],
  ['inter-latin-600-normal.woff2', 600, 'normal'],
  ['inter-latin-400-italic.woff2', 400, 'italic'],
];

let _cssCache = null;
let _countCache = 0;

function _build() {
  if (_cssCache !== null) return;
  const out = [];
  for (const [file, weight, style] of FACES) {
    const fp = path.join(__dirname, file);
    let buf;
    try {
      if (!fs.existsSync(fp)) continue;
      buf = fs.readFileSync(fp);
    } catch {
      continue;
    }
    const b64 = buf.toString('base64');
    out.push(
      `@font-face{font-family:'Inter';font-style:${style};font-weight:${weight};` +
      `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`
    );
  }
  _countCache = out.length;
  _cssCache = out.join('\n');
}

/** @returns {string} concatenated @font-face rules (may be empty). */
function interFontFaceCss() {
  _build();
  return _cssCache;
}

/** @returns {boolean} true when at least one Inter face was embedded. */
function hasInterFonts() {
  _build();
  return _countCache > 0;
}

/** @returns {number} how many of the six Inter faces are embedded. */
function interFaceCount() {
  _build();
  return _countCache;
}

module.exports = { interFontFaceCss, hasInterFonts, interFaceCount };
