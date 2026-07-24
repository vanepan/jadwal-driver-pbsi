/* gudang-ui-check.mjs — Gudang V1.28.0 Experience Layer (UI verification).

   Authorized by: Doc 2 (Product Experience Blueprint), Doc 4 Art.V (UI
   Discipline) — Experience brief's own "Final Verification" checklist:
   no duplicated ownership, no business logic inside UI, no architectural
   drift, no unnecessary abstraction, visual consistency with the
   existing Sarpras Operations application.

   Static source-scanning only (same technique as gudang-ownership-
   check.mjs) — this file never imports js/gudang/ui/*.js itself (those
   need a browser: auth.js, DOM). Runtime rendering is instead proven by
   scripts/gudang-ui-smoke.mjs (real headless-Chromium render of every
   screen). Deterministic. No live Firebase, no AI.

   Run: node scripts/gudang-ui-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function allUiFiles() {
  return fs.readdirSync(path.join(ROOT, 'js/gudang/ui'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ rel: `js/gudang/ui/${f}`, code: stripComments(read(`js/gudang/ui/${f}`)) }));
}
const UI_FILES = allUiFiles();

/* ── Part A — UI owns no persistence (Doc 4 Art.V: "UI only orchestrates") ── */
console.log('\n[Part A — UI owns no persistence: no direct Firebase writes, no hardcoded RTDB paths]');
{
  for (const { rel, code } of UI_FILES) {
    check(`${rel} never calls storeFirebaseData/runNodeTransaction directly`, !code.includes('storeFirebaseData') && !code.includes('runNodeTransaction'));
    check(`${rel} never imports firebase.js directly (repositories/engines only)`, !/from ['"].*firebase\.js['"]/.test(code));
    check(`${rel} never hardcodes a "gudang/..." RTDB path literal`, !/['"`]gudang\//.test(code));
  }
}

/* ── Part B — UI never computes what an engine already owns ────────────── */
console.log('\n[Part B — UI never re-implements analytics/stock/movement computation]');
{
  const forbiddenPatterns = [
    { name: 'deriveQuantity reimplementation', re: /quantityDelta\s*\)\s*=>\s*sum/i },
    { name: 'a second MOVEMENT_TYPE/MOVEMENT_REASON enum', re: /const\s+MOVEMENT_(TYPE|REASON)\s*=\s*(Object\.freeze\()?\{/ },
    { name: 'a second ASSET_STATUS/ASSET_EVENT_TYPE enum', re: /const\s+ASSET_(STATUS|EVENT_TYPE)\s*=\s*(Object\.freeze\()?\{/ },
    { name: 'a restock/forecast threshold decision (e.g. "daysRemaining <")', re: /daysRemaining\s*[<>]=?/ },
  ];
  for (const { rel, code } of UI_FILES) {
    for (const { name, re } of forbiddenPatterns) {
      check(`${rel} does not contain ${name}`, !re.test(code));
    }
  }

  // Every screen that shows a computed figure actually imports it from the
  // engine layer, rather than deriving it locally — spot-checked per screen.
  const mustImportFrom = {
    'js/gudang/ui/gudang-home.js': ['../analytics/analytics-engine.js', '../audit/movement-history-view.js'],
    'js/gudang/ui/gudang-analytics.js': ['../analytics/analytics-engine.js', '../analytics/quiet-intelligence-engine.js'],
    'js/gudang/ui/gudang-goods-out.js': ['../consumable/goods-out-engine.js'],
    'js/gudang/ui/gudang-goods-in.js': ['../consumable/goods-in-engine.js'],
    'js/gudang/ui/gudang-stock-opname.js': ['../consumable/stock-opname-engine.js'],
    'js/gudang/ui/gudang-movement-history.js': ['../audit/movement-history-view.js'],
    'js/gudang/ui/gudang-item-detail.js': ['../asset/asset-lifecycle-engine.js', '../analytics/analytics-engine.js'],
  };
  for (const [rel, deps] of Object.entries(mustImportFrom)) {
    const code = read(rel);
    for (const dep of deps) check(`${rel} imports its computation from ${dep} (never reimplements it)`, code.includes(dep));
  }
}

/* ── Part C — Visual consistency: same token system as engineering.css ── */
console.log('\n[Part C — Visual consistency: gudang.css reuses the existing design language]');
{
  check('gudang.css exists at repo root (same convention as engineering.css/petty-cash.css)', exists('gudang.css'));
  const css = read('gudang.css');
  check('everything is scoped under .gud-root (never leaks into the rest of the platform)', /^\.gud-root\s*\{/m.test(css));
  check('has a [data-theme="dark"] .gud-root block (same dark-mode mechanism as .eng-root)', /:root\[data-theme="dark"\]\s*\.gud-root/.test(css));
  // Token VALUES copied verbatim from engineering.css (Experience brief:
  // "Reuse existing visual language" — not just similar names, the same
  // literal accent/palette, so Gudang reads as Engineering's sibling.
  const eng = read('engineering.css');
  const accentLine = eng.match(/--accent:#[0-9a-f]{6};/i)?.[0];
  check('the --accent color is copied verbatim from engineering.css (not a new brand identity)', !!accentLine && css.includes(accentLine));
  check('reuses --shadow-sm/--shadow-md/--shadow-lg (same elevation system, not invented)', css.includes('--shadow-sm') && css.includes('--shadow-md') && css.includes('--shadow-lg'));
  check('reuses --font-display/--font-sans/--font-mono (same typography roles)', css.includes('--font-display') && css.includes('--font-sans') && css.includes('--font-mono'));
  check('entry animation matches the app-wide "fade up" signature (gudFadeUp, same shape as engFadeUp/anFadeUp/vsm8-view-in)', /@keyframes gudFadeUp\{from\{opacity:0;transform:translateY\(9px\)/.test(css));
  check('respects prefers-reduced-motion (same discipline as every other module)', css.includes('prefers-reduced-motion'));
  check('index.html links gudang.css in the module-stylesheet block (after engineering.css, matching MODULE_DEFS order)', /engineering\.css[^\n]*\n\s*<link rel="stylesheet" href="gudang\.css/.test(read('index.html')));
}

/* ── Part D — No unnecessary abstraction: one file per screen, no dead exports ── */
console.log('\n[Part D — No unnecessary abstraction]');
{
  const expectedFiles = [
    'gudang-atoms.js', 'gudang-center.js', 'gudang-home.js', 'gudang-search-overlay.js',
    'gudang-goods-out.js', 'gudang-goods-in.js', 'gudang-movement-history.js',
    'gudang-stock-opname.js', 'gudang-analytics.js', 'gudang-item-detail.js',
    // Phase 10 (Experience Completion): contextual catalog creation
    // (Add Item/Location/Asset Unit — no Add-Department; Phase 10.1 makes
    // "department" the real Bidang roster from User Management instead)
    // closes the gap where nothing in Phases 1-9 ever populated the
    // catalog from the UI.
    'gudang-catalog.js',
  ];
  const actual = fs.readdirSync(path.join(ROOT, 'js/gudang/ui')).filter((f) => f.endsWith('.js')).sort();
  check(`js/gudang/ui/ has exactly the ${expectedFiles.length} files this phase needs — one per screen, no speculative extras`, JSON.stringify(actual) === JSON.stringify([...expectedFiles].sort()));

  // Every screen file's render function is actually imported by gudang-center.js
  // (proving no orphaned/dead screen module was left behind mid-build).
  const centerCode = read('js/gudang/ui/gudang-center.js');
  for (const f of expectedFiles) {
    if (f === 'gudang-center.js' || f === 'gudang-atoms.js') continue;
    check(`gudang-center.js imports from ${f} (no orphaned screen module)`, centerCode.includes(`./${f}`));
  }
}

/* ── Part E — Wiring integrity (static source checks) ───────────────────── */
console.log('\n[Part E — Wiring integrity: app.js/index.html actually mount Gudang]');
{
  const appJs = read('js/app.js');
  check('app.js statically imports mountGudang/setGudangScreen/setGudangSearch from gudang-center.js', /import\s*\{[\s\S]{0,120}mountGudang[\s\S]{0,120}\}\s*from ['"]\.\/gudang\/ui\/gudang-center\.js['"]/.test(appJs));
  check('app.js does NOT import openGudangSearch (Phase 10: removed as dead code — zero call sites)', !/mountGudang[\s\S]{0,200}openGudangSearch/.test(appJs));
  check('every v2NavGud* sidebar button has a real click listener (Phase 10: this was the actual UAT bug — screens existed but were unreachable)',
    ['v2NavGudHome', 'v2NavGudGoodsOut', 'v2NavGudGoodsIn', 'v2NavGudHistory', 'v2NavGudOpname', 'v2NavGudAnalytics']
      .every((id) => new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener\\('click'`).test(appJs)));
  check('setWorkspace() actually toggles #v2GudangWorkspace visible (Phase 10.1: the real blank-screen bug — Gudang was never added to this toggle, so the host stayed at its initial display:none no matter what navGudang() did)',
    /const isGudang\s*=\s*name === 'gudang'/.test(appJs)
    && /getElementById\('v2GudangWorkspace'\)/.test(appJs)
    && /gudangWs\.style\.display\s*=\s*isGudang/.test(appJs));
  check('initV2GudangWorkspace() is defined and injects a .gud-root host', /function initV2GudangWorkspace[\s\S]{0,300}gud-root/.test(appJs));
  check('initV2GudangWorkspace() is actually called in the startup sequence', /initV2GudangWorkspace\(\);/.test(appJs));
  check('v2PanelGudangNav is declared and included in the panel-clearing array', appJs.includes('v2PanelGudangNav') && /\[.*v2PanelGudangNav.*\]/.test(appJs));
  check('a "gudang" search adapter is registered (Doc 2 §05: search is the product)', /registerSearchAdapter\(\{\s*id:\s*'gudang'/.test(appJs));
  check('canAccessModule has a real, non-dev-only "gudang" case', /case 'gudang':\s*return false;/.test(appJs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
