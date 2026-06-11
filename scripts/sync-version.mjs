/* Single-source version propagation.

   config.js (APP_VERSION) is the ONE source of truth. This script
   derives the two artifacts that cannot import the ES module:

     • service-worker.js  → SW_VERSION constant (drives CACHE_NAME, so
                            the SW bytes change every release → update
                            is detected by the browser)
     • version.json       → deployed-version oracle fetched by pwa.js

   Run before every deploy:  node scripts/sync-version.mjs
   (Idempotent — safe to run repeatedly.)
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'js', 'config.js');
const SW     = path.join(ROOT, 'service-worker.js');
const VJSON  = path.join(ROOT, 'version.json');

const config = fs.readFileSync(CONFIG, 'utf8');
const m = config.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!m) { console.error('Could not find APP_VERSION in js/config.js'); process.exit(1); }
const version = m[1];

// 1) Stamp SW_VERSION (preserve any trailing comment on the line)
let sw = fs.readFileSync(SW, 'utf8');
const before = sw.match(/const SW_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
sw = sw.replace(/(const SW_VERSION\s*=\s*['"])[^'"]+(['"])/, `$1${version}$2`);
fs.writeFileSync(SW, sw);

// 2) Write version.json oracle
fs.writeFileSync(VJSON, JSON.stringify({ version }, null, 2) + '\n');

console.log(`APP_VERSION (source) : ${version}`);
console.log(`service-worker.js    : SW_VERSION ${before} → ${version}`);
console.log(`version.json         : { "version": "${version}" }`);
console.log('Done. CACHE_NAME is now sarpras-cache-v' + version);
