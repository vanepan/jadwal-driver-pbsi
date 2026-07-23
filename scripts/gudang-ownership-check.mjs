/* gudang-ownership-check.mjs — Gudang V1.28.0, Phase 1 (Foundation).

   Authorized by: Doc 4 Art.II/IV (authority hierarchy; engine ownership) —
   Phase 1 brief, Part 9 "Architecture Verification".

   Same two-part shape as scripts/body-ownership-check.mjs /
   scripts/knowledge-ownership-check.mjs, on purpose.

   1. ARCHITECTURAL (static, source-scanning). Asserts, straight from the
      Phase 1 brief's Part 9 checklist:
        - every domain the registry claims hasFoundation has EXACTLY one
          repository writing to its RTDB path;
        - no circular ownership (repository/ never imports projection/,
          audit/, search/, or settings/);
        - Stock has no write path outside stock-repository.js, and
          saveProjection() has exactly one legitimate caller
          (projection/stock-projection-engine.js);
        - Search and Audit own no persistence (no storeFirebaseData /
          runNodeTransaction / firebase.js import anywhere under search/ or
          audit/);
        - Audit reads ONLY Movement + Asset History (Doc 3 Ch.11 — nothing
          else);
        - Projection reads ONLY Movement (Doc 3 Ch.05);
        - every RTDB path used anywhere under js/gudang/ is one of the seven
          declared in config/gudang-paths.js (no undeclared persistence);
        - seams stay dormant: no supplier/NOR/QR/barcode/NFC implementation
          file exists, and MOVEMENT_TYPE.FUTURE_RESERVATION is never branched
          on outside its own contract;
        - none of the STRICTLY FORBIDDEN Phase-1 workflows exist as files
          (Goods In/Out, Stock Opname, Forecast, Recommendation, dashboards,
          charts, CRUD screens).

   2. BEHAVIOURAL (runtime). Every file under js/gudang/ really does
      import() cleanly under plain Node — proving the whole foundation has
      zero transitive Firebase dependency at load time (same proof
      js/engineering/providers/firebase-adapter.js relies on).

   Deterministic. No V1 UI, no live Firebase, no AI.
   Run: node scripts/gudang-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function allSourceFiles(dir) {
  const out = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(r);
      else if (entry.name.endsWith('.js')) out.push({ rel: r, code: stripComments(read(r)), raw: read(r) });
    }
  }(dir));
  return out;
}

function importTargets(code) {
  const blocks = code.match(/import\s*(?:\{[^}]*\}|[\w*\s,]+)\s*from\s*'[^']*'|^import\s*'[^']*'/gms) || [];
  return blocks.map((b) => {
    const m = b.match(/from\s*'([^']*)'/) || b.match(/^import\s*'([^']*)'/);
    return { block: b, target: m ? m[1] : null };
  }).filter((x) => x.target);
}

function resolveRelative(fromRel, target) {
  if (!target.startsWith('.')) return target;
  const fromDir = path.posix.dirname(fromRel);
  return path.posix.normalize(path.posix.join(fromDir, target));
}

function importsNamed(clause, name) {
  return new RegExp(`(^|[,{\\s])${name}(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause);
}

const GUDANG_FILES = allSourceFiles('js/gudang');
const byRel = new Map(GUDANG_FILES.map((f) => [f.rel, f]));

console.log('\n[Part 1 — every domain\'s RTDB path is written by exactly one repository]');
{
  const EXPECTED_OWNER = {
    items: 'js/gudang/repository/item-repository.js',
    movements: 'js/gudang/repository/movement-repository.js',
    assets: 'js/gudang/repository/asset-repository.js',
    assetHistory: 'js/gudang/repository/asset-history-repository.js',
    locations: 'js/gudang/repository/location-repository.js',
    departments: 'js/gudang/repository/department-repository.js',
    stock: 'js/gudang/repository/stock-repository.js',
  };
  for (const [key, owner] of Object.entries(EXPECTED_OWNER)) {
    const needle = `GUDANG_PATHS.${key}`;
    const writers = GUDANG_FILES.filter((f) =>
      (f.code.includes('storeFirebaseData') || f.code.includes('runNodeTransaction')) && f.code.includes(needle)
    ).map((f) => f.rel);
    check(`GUDANG_PATHS.${key} is written only by ${owner}${writers.length === 1 && writers[0] === owner ? '' : ` — FOUND: ${writers.join(', ') || '(nobody)'}`}`,
      writers.length === 1 && writers[0] === owner);
  }
}

console.log('\n[Part 2 — no circular ownership: repository/ never imports upward]');
{
  const FORBIDDEN_DIRS = ['projection/', 'audit/', 'search/', 'settings/'];
  const offenders = [];
  for (const { rel, code } of GUDANG_FILES) {
    if (!rel.startsWith('js/gudang/repository/')) continue;
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (FORBIDDEN_DIRS.some((d) => resolved.includes(`/gudang/${d}`))) offenders.push(`${rel} -> ${resolved}`);
    }
  }
  check(`NO repository/ file imports projection/, audit/, search/, or settings/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 3 — Stock has no write path outside its own repository]');
{
  const OWNER = 'js/gudang/repository/stock-repository.js';
  const writers = [];
  for (const { rel, code } of GUDANG_FILES) {
    if (rel === OWNER) continue;
    for (const { block, target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!/gudang\/repository\/stock-repository\.js$/.test(resolved)) continue;
      const clause = (block.match(/\{([^}]*)\}/) || [])[1] || '';
      if (importsNamed(clause, 'saveProjection')) writers.push(rel);
    }
  }
  const stockOk = writers.length === 1 && writers[0] === 'js/gudang/projection/stock-projection-engine.js';
  check(`saveProjection() has exactly ONE legitimate caller (projection/stock-projection-engine.js)${stockOk ? '' : ` — FOUND: ${writers.join(', ') || '(nobody)'}`}`, stockOk);
}

console.log('\n[Part 4 — Search owns no persistence]');
{
  const search = byRel.get('js/gudang/search/search-resolver.js');
  const noWrites = search && !search.code.includes('storeFirebaseData') && !search.code.includes('runNodeTransaction');
  const noDirectFirebase = search && !importTargets(search.code).some((t) => t.target.includes('firebase.js'));
  check('search-resolver.js contains no storeFirebaseData/runNodeTransaction call', !!noWrites);
  check('search-resolver.js never imports firebase.js directly (repositories only)', !!noDirectFirebase);
}

console.log('\n[Part 5 — Audit owns no persistence, and reads ONLY Movement + Asset History]');
{
  const audit = byRel.get('js/gudang/audit/audit-view.js');
  const noWrites = audit && !audit.code.includes('storeFirebaseData') && !audit.code.includes('runNodeTransaction');
  const noDirectFirebase = audit && !importTargets(audit.code).some((t) => t.target.includes('firebase.js'));
  const repoImports = audit ? importTargets(audit.code)
    .map((t) => resolveRelative('js/gudang/audit/audit-view.js', t.target))
    .filter((r) => r.includes('/gudang/repository/')) : [];
  const onlyMovementAndHistory = repoImports.every((r) => /movement-repository\.js$|asset-history-repository\.js$|repository-result\.js$/.test(r));
  check('audit-view.js contains no storeFirebaseData/runNodeTransaction call', !!noWrites);
  check('audit-view.js never imports firebase.js directly (repositories only)', !!noDirectFirebase);
  check(`audit-view.js imports ONLY movement-repository.js + asset-history-repository.js (+ repository-result.js)${onlyMovementAndHistory ? '' : ` — FOUND: ${repoImports.join(', ')}`}`, onlyMovementAndHistory);
}

console.log('\n[Part 6 — Projection derives ONLY from Movement]');
{
  const projection = byRel.get('js/gudang/projection/stock-projection-engine.js');
  const repoImports = projection ? importTargets(projection.code)
    .map((t) => resolveRelative('js/gudang/projection/stock-projection-engine.js', t.target))
    .filter((r) => r.includes('/gudang/repository/')) : [];
  const onlyMovementAndStock = repoImports.every((r) => /movement-repository\.js$|stock-repository\.js$/.test(r));
  const noAssetOrItemOrLocationOrDept = !repoImports.some((r) => /item-repository\.js$|asset-repository\.js$|asset-history-repository\.js$|location-repository\.js$|department-repository\.js$/.test(r));
  check(`stock-projection-engine.js's only repository imports are movement-repository.js / stock-repository.js${onlyMovementAndStock ? '' : ` — FOUND: ${repoImports.join(', ')}`}`, onlyMovementAndStock);
  check('stock-projection-engine.js never imports Item/Asset/Location/Department repositories', noAssetOrItemOrLocationOrDept);
}

console.log('\n[Part 7 — no hardcoded RTDB path literal outside gudang-paths.js]');
{
  const offenders = [];
  for (const { rel, code } of GUDANG_FILES) {
    if (rel === 'js/gudang/config/gudang-paths.js') continue;
    if (/['"`]gudang\//.test(code)) offenders.push(rel);
  }
  check(`NO file hardcodes a literal "gudang/..." path string — every repository references GUDANG_PATHS instead${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 8 — future seams remain dormant]');
{
  const forbiddenFiles = GUDANG_FILES.filter((f) =>
    /supplier|\bnor[-.]|qr-|barcode|nfc/i.test(path.basename(f.rel))
  ).map((f) => f.rel);
  check(`NO supplier/NOR/QR/barcode/NFC implementation file exists under js/gudang/${forbiddenFiles.length ? ` — FOUND: ${forbiddenFiles.join(', ')}` : ''}`, forbiddenFiles.length === 0);

  const reservationBranches = GUDANG_FILES.filter((f) =>
    f.rel !== 'js/gudang/contracts/movement-contract.js' && f.code.includes('FUTURE_RESERVATION')
  ).map((f) => f.rel);
  check(`MOVEMENT_TYPE.FUTURE_RESERVATION is never branched on outside its own contract (reserved vocabulary only)${reservationBranches.length ? ` — FOUND: ${reservationBranches.join(', ')}` : ''}`, reservationBranches.length === 0);
}

console.log('\n[Part 9 — STRICTLY FORBIDDEN Phase 1 workflows do not exist as files]');
{
  const forbidden = /goods-?in|goods-?out|stock-?opname|forecast|recommendation|dashboard|chart|crud/i;
  const offenders = GUDANG_FILES.filter((f) => forbidden.test(path.basename(f.rel))).map((f) => f.rel);
  check(`NO file under js/gudang/ implements a forbidden Phase-1 workflow${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 10 — BEHAVIOURAL: every js/gudang/ file imports cleanly under plain Node]');
{
  for (const { rel } of GUDANG_FILES) {
    try {
      await import(pathToFileURL(path.join(ROOT, rel)));
      check(`${rel} imports cleanly (no Firebase credentials required at load time)`, true);
    } catch (err) {
      check(`${rel} imports cleanly — FAILED: ${err.message}`, false);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
