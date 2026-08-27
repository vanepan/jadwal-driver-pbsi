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
    'js/gudang/ui/gudang-home.js': ['../analytics/analytics-engine.js', '../repository/stock-repository.js'],
    'js/gudang/ui/gudang-analytics.js': ['../analytics/analytics-engine.js', '../analytics/quiet-intelligence-engine.js'],
    'js/gudang/ui/gudang-goods-out.js': ['../consumable/goods-out-engine.js'],
    'js/gudang/ui/gudang-goods-in.js': ['../consumable/goods-in-engine.js'],
    'js/gudang/ui/gudang-stock-opname.js': ['../consumable/stock-opname-engine.js'],
    'js/gudang/ui/gudang-movement-history.js': ['../audit/movement-history-view.js'],
    'js/gudang/ui/gudang-item-detail.js': ['../asset/asset-lifecycle-engine.js', '../analytics/analytics-engine.js'],
    // v1.29.7 (Warehouse Dashboard): every Overview/Health/Low Stock/
    // Category/Location/Forecast Summary figure is composed by dashboard-
    // engine.js, never derived inline in the screen file.
    'js/gudang/ui/gudang-dashboard.js': ['../dashboard/dashboard-engine.js'],
    // v1.29.8 (Inventory Intelligence Engine): every Dead Stock/Slow-Fast
    // Moving/Reorder/Overstock/Velocity/Consumption Pattern/Category-
    // Location Activity figure is composed by intelligence-engine.js.
    'js/gudang/ui/gudang-intelligence.js': ['../intelligence/intelligence-engine.js'],
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
  // v1.29.9 root-cause regression guard: a comment that describes a
  // wildcard-prefix list with an asterisk immediately touching the next
  // slash (e.g. two class-name fragments joined "*<slash>") closes a CSS
  // comment early wherever it appears, even as plain prose — this exact
  // bug silently dropped .gud-insight-card{}'s base rule in v1.29.8 (only
  // its :hover/:focus-visible variants survived), so the browser fell
  // back to native <button> chrome instead. Simulates the real CSS
  // tokenizer's comment state machine char-by-char — a stray */ found
  // OUTSIDE an open comment proves some earlier comment closed too soon.
  {
    let inComment = false; let strays = 0;
    for (let i = 0; i < css.length; i++) {
      if (!inComment && css[i] === '/' && css[i + 1] === '*') { inComment = true; i++; continue; }
      if (inComment && css[i] === '*' && css[i + 1] === '/') { inComment = false; i++; continue; }
      if (!inComment && css[i] === '*' && css[i + 1] === '/') strays++;
    }
    check('gudang.css has no stray */ outside a comment (proves no comment closed early and corrupted the rule after it — the actual root cause of the v1.29.8 Insight Card outline bug)', strays === 0 && !inComment);
  }
  // v1.29.9 (Part G — Responsive Audit): .gud-card is placed as a grid
  // item inside .gud-grid.-2/-3 on Dashboard/Intelligence — without
  // min-width:0, a grid item's default min-width:auto floors it at its
  // content's min-content size (a long item name, a long category
  // label), which can push the whole card past its track and the PAGE
  // into horizontal scroll on mobile even though every descendant
  // already declares its own min-width:0/overflow:hidden. Confirmed via
  // a real 375px render with a long item name: without this rule the
  // card measured 46px past the viewport edge; with it, zero overflow.
  check('.gud-card declares min-width:0 (prevents grid-item content from forcing horizontal overflow on narrow viewports)', /\.gud-card\{[^}]*min-width:0/.test(css));
  check('everything is scoped under .gud-root (never leaks into the rest of the platform)', /^\.gud-root\s*\{/m.test(css));
  check('has a [data-theme="dark"] .gud-root block (same dark-mode mechanism as .eng-root)', /:root\[data-theme="dark"\]\s*\.gud-root/.test(css));
  // Experience brief: "Reuse existing visual language" — Gudang must read
  // as Engineering's sibling, not a new brand identity. Phase 12 (V1 Final
  // QA) update: this used to assert a literal `--accent:#hex;` copied
  // verbatim between the two module files. "V1 Redesign Phase 1b" retired
  // that local literal from BOTH engineering.css and gudang.css onto the
  // single canonical platform.css `--accent` token — so the sibling
  // guarantee is now stronger (one shared source, no divergence possible).
  // Assert the current architecture: gudang.css declares no local --accent
  // literal of its own (inherits the platform token), exactly like
  // engineering.css.
  const eng = read('engineering.css');
  const localAccentLiteral = /--accent\s*:\s*#[0-9a-f]{3,8}\b/i;
  check('gudang.css does not hardcode its own --accent literal (inherits the canonical platform.css token, same as engineering.css)',
    !localAccentLiteral.test(css) && !localAccentLiteral.test(eng));
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
    // Phase 10.3 (Item Visual Identity): photo upload/display plumbing
    // shared by gudang-catalog.js (Add/Edit Item) and gudang-home.js
    // (catalog card thumbnail) — not a screen itself, so it is imported by
    // those two files rather than by gudang-center.js directly (checked
    // separately below, not via the loop every screen file goes through).
    'gudang-item-image.js',
    // v1.29.4 (Warehouse Bulk Operations Framework): the shared modal UI
    // (form/confirm/progress/summary) for Bulk Goods Out/Archive/Edit/
    // Export — not a screen either (no gud-goto entry, rendered as a
    // st.modal layer exactly like gudang-catalog.js's own modal), so it
    // is exempt from the "every screen file is imported by gudang-
    // center.js's render() switch" loop below the same way gudang-
    // catalog.js already is (checked separately, via its own render
    // dispatch branch instead).
    'gudang-bulk-ui.js',
    // v1.29.5 (Warehouse Upload Experience): shared quick-replace
    // orchestration (Card/Drawer drag&drop/paste) + the session-overlay
    // renderer the Add/Edit Item dialog also consumes — not a screen
    // either; the loop below already confirms it via a plain import-
    // string check, same as every other non-screen file here.
    'gudang-photo-upload.js',
    // v1.29.6 (Warehouse Activity Timeline): the timeline's own render +
    // filter/search/load-more handlers, mounted INSIDE the Item Detail
    // drawer (brief: "Do NOT create another page/modal") — not a screen
    // either; same import-string check as every other non-screen file.
    'gudang-timeline.js',
    // v1.29.7 (Warehouse Dashboard): the new module landing screen — a
    // real screen (has its own gud-goto entry, 'dashboard'), so it goes
    // through the same orphan-check loop below as every other screen file.
    'gudang-dashboard.js',
    // v1.29.8 (Inventory Intelligence Engine): a real screen (its own
    // gud-goto entry, 'intelligence') — same orphan-check loop.
    'gudang-intelligence.js',
  ];
  const actual = fs.readdirSync(path.join(ROOT, 'js/gudang/ui')).filter((f) => f.endsWith('.js')).sort();
  check(`js/gudang/ui/ has exactly the ${expectedFiles.length} files this phase needs — one per screen, no speculative extras`, JSON.stringify(actual) === JSON.stringify([...expectedFiles].sort()));

  // Every screen file's render function is actually imported by gudang-center.js
  // (proving no orphaned/dead screen module was left behind mid-build).
  const centerCode = read('js/gudang/ui/gudang-center.js');
  for (const f of expectedFiles) {
    if (f === 'gudang-center.js' || f === 'gudang-atoms.js' || f === 'gudang-item-image.js') continue;
    check(`gudang-center.js imports from ${f} (no orphaned screen module)`, centerCode.includes(`./${f}`));
  }
  const homeCode = read('js/gudang/ui/gudang-home.js');
  const catalogCode = read('js/gudang/ui/gudang-catalog.js');
  check('gudang-item-image.js is actually imported (by gudang-home.js and/or gudang-catalog.js), not orphaned',
    homeCode.includes('./gudang-item-image.js') || catalogCode.includes('./gudang-item-image.js'));
}

/* ── Part E — Wiring integrity (static source checks) ───────────────────── */
console.log('\n[Part E — Wiring integrity: app.js/index.html actually mount Gudang]');
{
  const appJs = read('js/app.js');
  check('app.js statically imports mountGudang/setGudangScreen/setGudangSearch from gudang-center.js', /import\s*\{[\s\S]{0,120}mountGudang[\s\S]{0,120}\}\s*from ['"]\.\/gudang\/ui\/gudang-center\.js['"]/.test(appJs));
  // v1.29.0: openGudangSearch() is no longer dead code — the search Clear
  // (X) button's click handler now reuses it to refocus #v2SearchInput
  // without re-triggering Recent Searches (Feature 6's focus-when-empty
  // behavior would otherwise immediately reopen what the click just
  // closed). Confirms it's imported from gudang-center.js and actually
  // called from the clear button's handler, not just present in an import list.
  check('app.js imports openGudangSearch from gudang-center.js', /import\s*\{[\s\S]{0,200}openGudangSearch[\s\S]{0,200}\}\s*from ['"]\.\/gudang\/ui\/gudang-center\.js['"]/.test(appJs));
  check('the search Clear (X) button handler actually calls openGudangSearch() to keep focus in the field', /v2SearchClear\.addEventListener\('click'[\s\S]{0,400}openGudangSearch\(\)/.test(appJs));
  check('every v2NavGud* sidebar button has a real click listener (Phase 10: this was the actual UAT bug — screens existed but were unreachable)',
    ['v2NavGudDashboard', 'v2NavGudHome', 'v2NavGudGoodsOut', 'v2NavGudGoodsIn', 'v2NavGudHistory', 'v2NavGudOpname', 'v2NavGudAnalytics', 'v2NavGudIntelligence']
      .every((id) => new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener\\('click'`).test(appJs)));
  check('setWorkspace() actually toggles #v2GudangWorkspace visible (Phase 10.1: the real blank-screen bug — Gudang was never added to this toggle, so the host stayed at its initial display:none no matter what navGudang() did)',
    /const isGudang\s*=\s*name === 'gudang'/.test(appJs)
    && /getElementById\('v2GudangWorkspace'\)/.test(appJs)
    && /gudangWs\.style\.display\s*=\s*isGudang/.test(appJs));
  check('initV2GudangWorkspace() is defined and injects a .gud-root host', /function initV2GudangWorkspace[\s\S]{0,300}gud-root/.test(appJs));
  check('initV2GudangWorkspace() is actually called in the startup sequence', /initV2GudangWorkspace\(\);/.test(appJs));
  check('v2PanelGudangNav is declared and included in the panel-clearing array', appJs.includes('v2PanelGudangNav') && /\[.*v2PanelGudangNav.*\]/.test(appJs));
  check('a "gudang" search adapter is registered (Doc 2 §05: search is the product)', /registerSearchAdapter\(\{\s*id:\s*'gudang'/.test(appJs));
  // Phase 12 (V1 Final QA) update: pre-v1.30.5 this was a literal
  // `case 'gudang': return false;` switch arm. The Permission Runtime
  // Migration (v1.30.5) replaced canAccessModule()'s switch with a
  // data-driven MODULE_PERMISSIONS lookup — `gudang` now maps to a real
  // permission and resolves through can(). Assert the current mechanism:
  // a real, named permission gate (only admin's BASE_GRANTS holds
  // warehouse.view today), never world-open.
  check('canAccessModule gates "gudang" through a real MODULE_PERMISSIONS entry (warehouse.view), not world-open',
    /MODULE_PERMISSIONS\s*=\s*Object\.freeze\(\{[\s\S]*?gudang:\s*'warehouse\.view'/.test(appJs)
    && /const permission = MODULE_PERMISSIONS\[name\];\s*return permission \? can\(permission\) : false;/.test(appJs));
}

/* ── Part F — Design System Program Phase 10 (Canonical Drawer Migration):
   Item/Asset Detail no longer hand-rolls its own scrim/focus-on-open/
   role="dialog" — it renders through js/components/drawer.js, which
   already owns all of that (verified end-to-end, including a real
   Puppeteer focus/role/focus-trap/safe-area run, by
   drawer-consolidation-check.mjs and the new
   gudang-drawer-migration-check.mjs — this Part only confirms Gudang's
   OWN side of the wiring: that it actually calls into the canonical shell
   instead of a parallel implementation). ────────────────────────────── */
console.log('\n[Part F — Item/Asset Detail drawer routes through the canonical drawer shell (Phase 10)]');
{
  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js imports openDrawer/closeDrawer/refreshDrawerBody from the canonical shell',
    /import\s*\{\s*openDrawer,\s*closeDrawer,\s*refreshDrawerBody\s*\}\s*from\s*['"]\.\.\/\.\.\/components\/drawer\.js['"]/.test(centerCode));
  check('syncGudangDetailDrawer() opens a NEW record via openDrawer(), not a hand-rolled scrim',
    /function syncGudangDetailDrawer[\s\S]{0,900}openDrawer\(\{/.test(centerCode));
  check('syncGudangDetailDrawer() refreshes the SAME open record via refreshDrawerBody() (preserves scroll/focus instead of a full close/reopen)',
    /function syncGudangDetailDrawer[\s\S]{0,900}refreshDrawerBody\(body\)/.test(centerCode));
  check('syncGudangDetailDrawer() closes via closeDrawer() when st.detail is cleared',
    /function syncGudangDetailDrawer[\s\S]{0,400}closeDrawer\(\)/.test(centerCode));
  check('render() calls syncGudangDetailDrawer() on every pass — every st.detail mutation (gud-open-item, gud-open-asset, resolveSearchIntent, Escape, scrim-adjacent closes) eventually flows through the same sync point, not one focus call per open site',
    /host\.innerHTML = `[\s\S]{0,200}`;[\s\S]{0,200}syncGudangDetailDrawer\(c\);/.test(centerCode));
  check('the drawer overlay\'s onClose callback nulls st.detail and re-renders (keeps Gudang state in sync when the canonical shell closes itself — backdrop click, Escape, X button)',
    /onClose:\s*\(\)\s*=>\s*\{\s*st\.detail = null;\s*render\(\);\s*\}/.test(centerCode));

  const detailCode = read('js/gudang/ui/gudang-item-detail.js');
  check('gudang-item-detail.js no longer defines its own drawerShell() (the old .gud-scrim/.gud-drawer/role=dialog hand-roll)',
    !/function drawerShell/.test(detailCode));
  check('renderItemDetail/renderAssetDetail now return { title, body } for the canonical shell to consume, not a full HTML shell string',
    /return \{ title: item\.name, body \};/.test(detailCode) && /return \{ title: item \? item\.name : asset\.identity, body \};/.test(detailCode));

  const drawerCode = read('js/components/drawer.js');
  check('the canonical shell itself still declares role="dialog" aria-modal="true" with a dynamic aria-label (the guarantee Gudang now inherits instead of re-declaring)',
    /<aside class="drawer" role="dialog" aria-modal="true" aria-label="\$\{esc\(title\)\}">/.test(drawerCode));
  check('the canonical shell still moves focus to its own close button on open (the guarantee Gudang now inherits instead of a manual focusDrawerOnOpen())',
    /const first = overlay\.querySelector\('\.drawer__close'\);\s*if \(first\) first\.focus\(\);/.test(drawerCode));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
