/* Regenerate the inlined Sarpras logo data module for the PDF report header.

   Why inline (not an fs read of a .png): the analytics report is rendered
   server-side by Cloud Functions. A binary asset read at runtime is fragile —
   it must be packaged into the deployed artifact AND __dirname must resolve. A
   base64 string in a .js module is plain code, so it is ALWAYS in the artifact:
   no fs, no path resolution, no network, offline + cold-start safe.

   Run:  node scripts/gen-logo-data.mjs
   Source asset: icons/icon-512.png  →  functions/.../assets/logos/sarpras-logo-data.js
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'icons', 'icon-512.png');
const OUT = join(root, 'functions', 'src', 'exports', 'analytics', 'assets', 'logos', 'sarpras-logo-data.js');

const b64 = readFileSync(SRC).toString('base64');
const file =
`'use strict';

/* ============================================================
   SARPRAS-LOGO-DATA.JS — generated, do not edit by hand.

   The Sarpras Operations mark inlined as a base64 PNG data: URI so
   the analytics report header is GUARANTEED to be inside the deployed
   Cloud Functions artifact (it is JS code, not a packaged binary).
   No runtime fs read, no path resolution, no network, no external
   URL — offline-safe and cold-start-safe.

   Source: icons/icon-512.png (regenerate: node scripts/gen-logo-data.mjs)
   ============================================================ */

const SARPRAS_LOGO_DATA_URL = 'data:image/png;base64,${b64}';

module.exports = { SARPRAS_LOGO_DATA_URL };
`;

writeFileSync(OUT, file);
console.log(`Wrote ${OUT}\n  source: ${SRC}\n  base64 length: ${b64.length}  dataURL length: ${b64.length + 22}`);
