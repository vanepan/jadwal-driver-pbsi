/* gudang-bulk-check.mjs — Gudang v1.29.4, Warehouse Bulk Operations
   Framework.

   Same check()/read() harness as scripts/gudang-selection-check.mjs. Parts:
     A. Executor core       — partial success (never stops at first
                             error), validate collects EVERY failure up
                             front, prepare() failure fails every id with
                             one shared reason, concurrency never exceeds
                             the configured limit, groupFailuresByReason
                             groups+sorts, toHumanReason prefers a
                             repository-style .message over a raw string.
     B. Movement contract    — v1.29.4's purpose/notes amendment is
                             additive: nullable, never required, old
                             (pre-amendment) records with the keys simply
                             absent still satisfy isMovement().
     C. Operation modules     — each bulk-*.js module imports cleanly in
                             plain Node (no top-level Firebase/DOM touch —
                             same "Node-importable" discipline every
                             other Gudang repository/engine file already
                             follows) and exports the expected shape.
     D. Architecture          — bulk-executor.js is genuinely PURE (zero
                             imports at all); the brief's full DO NOT
                             MODIFY surface (Selection/Search/Filter/
                             Timeline/Forecast/Inventory Engines, Vehicle
                             Module, Firebase Structure/rules,
                             Authentication) shows no trace of the bulk
                             framework; gudang-center.js/gudang-home.js
                             are wired without duplicating dispatch logic.

   Deterministic. No live Firebase, no AI, no real network/CDN loads
   (bulk-export.js's lazy XLSX/pdfmake loaders are never invoked here).
   Run: node scripts/gudang-bulk-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBulkOperation, groupFailuresByReason, toHumanReason, DEFAULT_CONCURRENCY } from '../js/gudang/bulk/bulk-executor.js';
import { makeMovement, isMovement, MOVEMENT_TYPE, MOVEMENT_REASON } from '../js/gudang/contracts/movement-contract.js';
import { createBulkGoodsOutForm } from '../js/gudang/bulk/bulk-goods-out.js';
import { createBulkArchiveOperation } from '../js/gudang/bulk/bulk-archive.js';
import { createBulkEditForm, bulkEditHasAnyField } from '../js/gudang/bulk/bulk-edit.js';
import * as BulkExport from '../js/gudang/bulk/bulk-export.js';
import { renderBulkModal, openBulkModal } from '../js/gudang/ui/gudang-bulk-ui.js';
import { createSelectionState, selectAll } from '../js/gudang/selection/selection-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Part A — Executor core ───────────────────────────────────────────── */
console.log('\n[Part A — bulk-executor.js: partial success, validate-collects-all, concurrency, grouping]');
{
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const r1 = await runBulkOperation(ids, {
    execute: async (id) => (id === 'c' ? { ok: false, reason: 'Gagal khusus' } : { ok: true }),
  });
  check('partial success: 4 succeed, 1 fails, never stops early', r1.success.length === 4 && r1.failed.length === 1 && r1.failed[0].id === 'c');
  check('result reports total = every id passed in', r1.total === 5);
  check('durationMs is a real non-negative number', typeof r1.durationMs === 'number' && r1.durationMs >= 0);

  const r2 = await runBulkOperation(ids, {
    validate: async (id) => (id === 'a' || id === 'b' ? { ok: false, reason: 'Tidak valid' } : { ok: true }),
    execute: async () => ({ ok: true }),
  });
  check('validate() runs for EVERY id before any execute (collects both invalid ids, never stops at the first)', r2.failed.length === 2 && r2.success.length === 3);
  check('invalid ids never reach execute() (their failure reason is the validate reason, not an execute error)', r2.failed.every((f) => f.reason === 'Tidak valid'));

  const err = new Error('boom');
  const r3 = await runBulkOperation(['x', 'y'], { execute: async (id) => { if (id === 'x') throw err; return { ok: true }; } });
  check('a thrown exception during execute() is caught and reported as a failure, not left uncaught', r3.failed.length === 1 && r3.failed[0].id === 'x' && r3.failed[0].reason === 'boom');

  const r4 = await runBulkOperation(['a', 'b', 'c'], {
    prepare: async () => { throw new Error('Bidang tidak ditemukan.'); },
    execute: async () => ({ ok: true }),
  });
  check('a prepare() failure fails EVERY id with the shared reason (never a partial/confusing per-id error for one shared cause)', r4.failed.length === 3 && r4.success.length === 0 && r4.failed.every((f) => f.reason === 'Bidang tidak ditemukan.'));

  let maxConcurrent = 0; let inFlight = 0;
  const many = Array.from({ length: 20 }, (_, i) => `id-${i}`);
  await runBulkOperation(many, {
    concurrency: 3,
    execute: async () => {
      inFlight++; maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true };
    },
  });
  check('concurrency is genuinely bounded — never more than the configured limit runs at once', maxConcurrent <= 3);
  check('DEFAULT_CONCURRENCY is a small, deliberately conservative number (never "process hundreds simultaneously")', DEFAULT_CONCURRENCY >= 1 && DEFAULT_CONCURRENCY <= 10);

  let progressTicks = [];
  await runBulkOperation(['a', 'b', 'c'], {
    execute: async () => ({ ok: true }),
    onProgress: (p) => progressTicks.push(p.processed),
  });
  check('onProgress fires at least once per completed id, ending at total', progressTicks.length >= 3 && progressTicks[progressTicks.length - 1] === 3);

  const grouped = groupFailuresByReason([
    { id: '1', reason: 'A' }, { id: '2', reason: 'B' }, { id: '3', reason: 'A' }, { id: '4', reason: 'A' },
  ]);
  check('groupFailuresByReason groups identical reasons together (never "100 identical dialogs")', grouped.length === 2);
  check('groups are sorted by count, descending (the most common failure surfaces first)', grouped[0].reason === 'A' && grouped[0].count === 3);

  check('toHumanReason prefers a repository-style {message} over a raw exception', toHumanReason({ message: 'Item tidak ditemukan.' }) === 'Item tidak ditemukan.');
  check('toHumanReason never returns a raw exception with no message (never displays a raw exception)', toHumanReason(new Error()) !== '' && typeof toHumanReason(new Error()) === 'string');
  check('toHumanReason falls back to a plain Indonesian message for a totally unknown throw value', toHumanReason(undefined).length > 0);
}

/* ── Part B — Movement contract amendment ────────────────────────────── */
console.log('\n[Part B — movement-contract.js: purpose/notes are additive, nullable, never required]');
{
  const base = { movementId: 'mv-1', itemId: 'item-1', type: MOVEMENT_TYPE.GOODS_OUT, quantityDelta: -5, reason: MOVEMENT_REASON.ISSUE, actorId: 'u1' };
  const withoutPurposeNotes = makeMovement(base);
  check('makeMovement() without purpose/notes still succeeds (never required)', withoutPurposeNotes.purpose === null && withoutPurposeNotes.notes === null);
  const withPurposeNotes = makeMovement({ ...base, purpose: 'Rapat bulanan', notes: 'Catatan tambahan' });
  check('makeMovement() accepts purpose/notes when provided', withPurposeNotes.purpose === 'Rapat bulanan' && withPurposeNotes.notes === 'Catatan tambahan');
  check('empty-string purpose/notes normalize to null (same "nothing here" convention as price/locationId)', makeMovement({ ...base, purpose: '', notes: '' }).purpose === null);

  let threw = false;
  try { makeMovement({ ...base, purpose: 123 }); } catch (_) { threw = true; }
  check('makeMovement() rejects a non-string purpose', threw);

  check('isMovement() accepts a fresh movement with real purpose/notes', isMovement(withPurposeNotes));
  check('isMovement() accepts a movement with purpose/notes explicitly null', isMovement(withoutPurposeNotes));
  const legacyRecord = { ...withoutPurposeNotes };
  delete legacyRecord.purpose; delete legacyRecord.notes;
  check('isMovement() accepts an OLDER record where purpose/notes are entirely ABSENT (undefined) — Firebase never stored a key that never existed, pre-v1.29.4 records must still validate', isMovement(legacyRecord));
}

/* ── Part C — Operation modules import cleanly, expected shape ───────── */
console.log('\n[Part C — bulk-*.js modules: Node-importable, expected exports]');
{
  check('createBulkGoodsOutForm() returns the documented shape', (() => {
    const f = createBulkGoodsOutForm();
    return f.departmentId === null && typeof f.quantities === 'object' && typeof f.purpose === 'string';
  })());

  const archiveOp = createBulkArchiveOperation({ data: { items: [{ itemId: 'i1', active: true }, { itemId: 'i2', active: false }] } });
  const vActive = await archiveOp.validate('i1');
  const vAlready = await archiveOp.validate('i2');
  const vMissing = await archiveOp.validate('i3');
  check('bulk-archive.js validate(): an active item is valid', vActive.ok === true);
  check('bulk-archive.js validate(): an already-archived item is rejected with a clear reason (not silently re-archived)', vAlready.ok === false && /diarsipkan/i.test(vAlready.reason));
  check('bulk-archive.js validate(): a missing item is rejected', vMissing.ok === false);

  const editForm = createBulkEditForm();
  check('createBulkEditForm() starts with every field opted OUT', !bulkEditHasAnyField(editForm));
  editForm.applyCategory = true;
  check('bulkEditHasAnyField() becomes true once any one field is opted in', bulkEditHasAnyField(editForm));

  check('bulk-export.js exports the three format downloaders', typeof BulkExport.downloadBulkExportCsv === 'function' && typeof BulkExport.downloadBulkExportExcel === 'function' && typeof BulkExport.downloadBulkExportPdf === 'function');
  check('bulk-export.js exports createBulkExportOperation', typeof BulkExport.createBulkExportOperation === 'function');
}

/* ── Part D — Architecture: PURE executor, Do Not Modify untouched ───── */
console.log('\n[Part D — Architecture: bulk-executor.js is PURE; DO NOT MODIFY surface shows no trace of Bulk Operations]');
{
  const executorCode = read('js/gudang/bulk/bulk-executor.js');
  check('bulk-executor.js imports NOTHING (zero knowledge of Goods Out/Archive/Edit/Export — genuinely generic)', !/^import /m.test(executorCode));
  check('bulk-executor.js never IMPORTS firebase.js (a doc-comment mentioning the filename in prose is fine)', !/from ['"][^'"]*firebase\.js['"]/.test(executorCode));
  check('bulk-executor.js never touches window/document/localStorage', !/\b(window|document|localStorage)\./.test(executorCode));

  for (const rel of [
    'js/gudang/bulk/bulk-goods-out.js', 'js/gudang/bulk/bulk-archive.js',
    'js/gudang/bulk/bulk-edit.js', 'js/gudang/bulk/bulk-export.js',
  ]) {
    const code = read(rel);
    check(`${rel} imports firebase.js only lazily (through a repository, never directly)`, !/from ['"]\.\.\/\.\.\/firebase\.js['"]/.test(code) && !/from ['"]\.\.\/firebase\.js['"]/.test(code));
  }

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js wires the bulk modal into its render() dispatch', centerCode.includes("st.modal.kind === 'bulk'") && centerCode.includes('renderBulkModal'));
  check('gudang-center.js routes gud-bulk- acts to bulkHandlers (click and input)', /act\.startsWith\('gud-bulk-'\)[\s\S]{0,40}bulkHandlers\.onClick/.test(centerCode) && /ds\.act\.startsWith\('gud-bulk-'\)[\s\S]{0,40}bulkHandlers\.onInput/.test(centerCode));
  check('gudang-center.js guards Escape against dismissing a running bulk operation ("No global cancellation")', /Escape[\s\S]{0,20}st\.modal[\s\S]{0,20}!isBulkOperationRunning\(st\)/.test(centerCode));
  check('gudang-center.js guards the scrim click against dismissing a running bulk operation', centerCode.includes('!isBulkOperationRunning(st)'));

  const homeCode = read('js/gudang/ui/gudang-home.js');
  check('gudang-home.js renders the four bulk action triggers in the Selection Mode bar', ['gud-bulk-open-goodsout', 'gud-bulk-open-archive', 'gud-bulk-open-edit', 'gud-bulk-open-export'].every((act) => homeCode.includes(act)));

  for (const rel of [
    'js/gudang/selection/selection-engine.js', 'js/gudang/filters/filter-engine.js',
    'js/gudang/search/search-resolver.js', 'js/gudang/analytics/analytics-engine.js',
    'js/gudang/ui/gudang-item-detail.js', 'js/vehicles-store.js', 'database.rules.json', 'js/auth.js',
  ]) {
    const code = read(rel);
    check(`${rel} (Do Not Modify) shows no trace of the Bulk Operations Framework`, !code.includes('bulk-executor') && !code.includes('bulk-goods-out') && !code.includes('bulk-archive') && !code.includes('bulk-edit') && !code.includes('bulk-export') && !code.includes('gudang-bulk-ui'));
  }

  // The Selection Engine's own file must be BYTE-IDENTICAL in its public
  // surface — Bulk only ever calls selectedIds()/clearSelection() on it,
  // confirmed by checking the bulk UI never imports anything else from it.
  const bulkUiCode = read('js/gudang/ui/gudang-bulk-ui.js');
  check('gudang-bulk-ui.js imports ONLY selectedIds/clearSelection from the frozen Selection Engine (never a mutator like toggleSelect/selectAll)', /from ['"]\.\.\/selection\/selection-engine\.js['"]/.test(bulkUiCode) && (bulkUiCode.match(/from ['"]\.\.\/selection\/selection-engine\.js['"]/g) || []).length === 1 && /import \{ selectedIds, clearSelection \}/.test(bulkUiCode));
}

/* ── Part E — Live render sweep: every op x every step, real HTML ────── */
console.log('\n[Part E — renderBulkModal: every operation through every reachable step, no template-literal crashes]');
{
  const FIXTURE_ITEMS = [
    { itemId: 'i1', name: 'Kertas A4', itemType: 'consumable', category: 'atk', defaultLocationId: 'loc1', active: true, aliases: [], metadata: {} },
    { itemId: 'i2', name: 'Stapler', itemType: 'consumable', category: 'atk', defaultLocationId: 'loc1', active: true, aliases: [], metadata: {} },
  ];
  const FIXTURE_LOCATIONS = [{ locationId: 'loc1', name: 'Gudang Utama' }];
  const FIXTURE_DEPARTMENTS = [{ departmentId: 'dep1', name: 'Bidang Umum' }];
  function makeSt() {
    const selection = createSelectionState();
    selectAll(selection, ['i1', 'i2']);
    return { data: { items: FIXTURE_ITEMS, locations: FIXTURE_LOCATIONS, departments: FIXTURE_DEPARTMENTS }, selection };
  }
  const c = { actorId: 'tester' };

  for (const op of ['goodsOut', 'archive', 'edit', 'export']) {
    let threw = null;
    try {
      const st = makeSt();
      openBulkModal(st, op);
      let html = renderBulkModal(st, c);
      check(`${op}: initial step (${st.modal.step}) renders a non-empty string`, typeof html === 'string' && html.length > 0);

      if (op === 'goodsOut') {
        st.modal.form.departmentId = 'dep1';
        st.modal.form.quantities = { i1: '5', i2: '3' };
        html = renderBulkModal(st, c);
        check('goodsOut: form step (department picked) renders a qty input per item', html.includes('gud-bulk-qty'));
        st.modal.step = 'confirm';
        html = renderBulkModal(st, c);
        check('goodsOut: confirm step shows the picked department name', html.includes('Bidang Umum'));
      } else if (op === 'edit') {
        st.modal.form.applyCategory = true; st.modal.form.category = 'Kebersihan';
        html = renderBulkModal(st, c);
        check('edit: form step (Category enabled) renders the category input', html.includes('gud-bulk-edit-category'));
        st.modal.step = 'confirm';
        html = renderBulkModal(st, c);
        check('edit: confirm step renders the change list', html.includes('gud-bulk-change-list'));
      } else if (op === 'export') {
        st.modal.form.format = 'excel';
        st.modal.step = 'confirm';
        html = renderBulkModal(st, c);
        check('export: confirm step renders without throwing', html.includes('Ekspor'));
      } else if (op === 'archive') {
        check('archive: opens directly at the confirm step (no form step to fill in)', st.modal.step === 'confirm');
      }

      st.modal.step = 'progress';
      st.modal.progress = { processed: 1, total: 2 };
      html = renderBulkModal(st, c);
      check(`${op}: progress step renders a percentage-width fill bar`, html.includes('gud-bulk-progress-fill') && /width:50%/.test(html));

      st.modal.step = 'summary';
      st.modal.results = { success: ['i1', 'i2'], failed: [], skipped: [], total: 2, durationMs: 120 };
      html = renderBulkModal(st, c);
      check(`${op}: summary step (all success) renders cleanly, no "Lihat Detail" for zero failures`, html.includes('Selesai') && !html.includes('gud-bulk-toggle-details'));

      st.modal.results = { success: ['i1'], failed: [{ id: 'i2', reason: 'Contoh gagal' }], skipped: [], total: 2, durationMs: 80 };
      st.modal.showDetails = true;
      html = renderBulkModal(st, c);
      check(`${op}: summary step with a failure + details expanded renders the grouped fail list`, html.includes('gud-bulk-fail-group') && html.includes('Contoh gagal'));
      check(`${op}: summary step with a failure renders the Retry Failed button`, html.includes('gud-bulk-retry-failed'));
    } catch (err) {
      threw = err;
    }
    check(`${op}: the entire render sweep threw no exception`, threw === null);
    if (threw) console.log('    ', threw.stack || threw);
  }
}

/* ── Part E — Performance Baseline (v1.29.11, Warehouse Core LTS) ──────── */
console.log('\n[Part E — bulk-executor.js pipeline overhead, synthetic ids, no real Firebase]');
{
  // Measures the EXECUTOR's own orchestration cost (validate-all + worker-pool
  // scheduling), isolated from real Firebase write latency by using a
  // synchronous no-op execute() — this app doesn't control Firebase latency,
  // so that isn't what's being baselined here. Informational only, no
  // pass/fail threshold (the brief: "no optimization unless measurable" cuts
  // both ways — this documents a number, it doesn't invent a performance gate).
  const ids200 = Array.from({ length: 200 }, (_, i) => `id-${i}`);
  const t0 = performance.now();
  await runBulkOperation(ids200, { execute: async () => ({ ok: true }) });
  const elapsedMs = performance.now() - t0;
  console.log(`  runBulkOperation(): 200 synthetic ids, no-op execute, concurrency=${DEFAULT_CONCURRENCY}: ${elapsedMs.toFixed(1)}ms`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
