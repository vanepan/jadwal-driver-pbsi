/* ============================================================
   GUDANG-BULK-UI.JS — Warehouse Bulk Operations UI (v1.29.4)

   ONE modal shell, ONE state machine (form -> confirm -> progress ->
   summary), reused across all four operations (Goods Out/Archive/Edit/
   Export) — "follow existing design language, no new design language"
   (brief, Visual Design) means reusing .gud-modal-box/.gud-btn/.gud-field/
   .gud-flow-error/.gud-picker-list/.gud-line-row exactly as gudang-
   catalog.js and gudang-item-detail.js's own confirm-modal already do,
   not inventing a second modal family.

   st.modal shape: { kind:'bulk', op:'goodsOut'|'archive'|'edit'|'export',
   step:'form'|'confirm'|'progress'|'summary', ids:string[], form:object|
   null, progress:{processed,total}|null, results:{success,failed,
   skipped,total,durationMs}|null, showDetails:boolean }.

   `ids` starts as selectedIds(st.selection) at open time and NEVER reads
   st.selection again after that — the Single Source of Truth rule (brief:
   "Every Bulk Operation receives selectedIds ONLY") is honored by reading
   it exactly once, at the door, then treating `ids` as this run's own
   plain array for its whole lifecycle (including Retry Failed, which
   narrows `ids` to the previous run's failed ids — never re-reads
   selection). st.selection itself is only ever cleared (once, on
   completion), never inspected mid-flow.

   AFTER COMPLETION (brief's own list): refreshCatalog() alone already
   busts analytics/forecast/history caches (gudang-center.js's own
   refreshCatalog — see v1.29.2-era comments there) and any open drawer
   re-reads st.data.items on its own next render (the same mechanism
   gudang-catalog.js#confirmEditItem already relies on) — so "refresh
   analytics/forecasts/drawer" needed NO new code, only calling the one
   existing refresh function. Search/filter/scroll are untouched by every
   function in this file, which is what keeps them exactly as they were
   (the same "absence of code is the correct behavior" reasoning the
   Selection Engine's own persistence already relied on).
   ============================================================ */

'use strict';

import { esc, icon, fmtQty } from './gudang-atoms.js';
import { selectedIds, clearSelection } from '../selection/selection-engine.js';
import { runBulkOperation, groupFailuresByReason } from '../bulk/bulk-executor.js';
import { createBulkGoodsOutForm, createBulkGoodsOutOperation } from '../bulk/bulk-goods-out.js';
import { createBulkArchiveOperation } from '../bulk/bulk-archive.js';
import { createBulkEditForm, createBulkEditOperation, bulkEditHasAnyField } from '../bulk/bulk-edit.js';
import { createBulkExportOperation, downloadBulkExportCsv, downloadBulkExportExcel, downloadBulkExportPdf } from '../bulk/bulk-export.js';

const OP_LABEL = { goodsOut: 'Goods Out', archive: 'Arsipkan', edit: 'Edit', export: 'Ekspor' };
const OP_TOAST_VERB = { goodsOut: 'dikeluarkan', archive: 'diarsipkan', edit: 'diperbarui', export: 'diekspor' };
const EXPORT_FORMAT_LABEL = { csv: 'CSV', excel: 'Excel', pdf: 'PDF' };

function nameFor(st, id) {
  const item = st.data.items.find((i) => i.itemId === id);
  return item ? item.name : id;
}

/** Whether a bulk run is mid-execution — the one state Escape/scrim-click/
 *  the modal's own close button must never dismiss (brief: "No global
 *  cancellation"). Exported so gudang-center.js's global Escape handler
 *  and scrim-click handler can both guard against it without duplicating
 *  the shape check. */
export function isBulkOperationRunning(st) {
  return !!(st.modal && st.modal.kind === 'bulk' && st.modal.step === 'progress');
}

/* ── open a fresh bulk modal for one operation ───────────────────────── */
export function openBulkModal(st, op) {
  const ids = selectedIds(st.selection);
  if (!ids.length) return;
  const base = { kind: 'bulk', op, ids, progress: null, results: null, showDetails: false };
  if (op === 'goodsOut') st.modal = { ...base, step: 'form', form: createBulkGoodsOutForm() };
  else if (op === 'archive') st.modal = { ...base, step: 'confirm', form: null };
  else if (op === 'edit') st.modal = { ...base, step: 'form', form: createBulkEditForm() };
  else if (op === 'export') st.modal = { ...base, step: 'form', form: { format: null } };
}

/* ── form validity (gates the "Lanjut" button) ───────────────────────── */
function formIsValid(m) {
  if (m.op === 'goodsOut') {
    if (!m.form.departmentId) return false;
    return m.ids.every((id) => {
      const q = Number(m.form.quantities[id]);
      return !!m.form.quantities[id] && Number.isFinite(q) && q > 0;
    });
  }
  if (m.op === 'edit') return bulkEditHasAnyField(m.form);
  return true;
}

/* ── render: modal shell ──────────────────────────────────────────────── */
export function renderBulkModal(st, c) {
  const m = st.modal;
  const running = m.step === 'progress';
  const title = m.op === 'export' && m.form.format ? `Ekspor (${EXPORT_FORMAT_LABEL[m.form.format]})` : OP_LABEL[m.op];

  let body;
  if (m.step === 'form') body = renderFormStep(st, m);
  else if (m.step === 'confirm') body = renderConfirmStep(st, m);
  else if (m.step === 'progress') body = renderProgressStep(m);
  else body = renderSummaryStep(st, m);

  return `<div class="gud-scrim -open -center" data-act="gud-scrim">
    <div class="gud-modal-box -bulk">
      <div class="gud-modal-head">
        <div>
          <div class="gud-modal-kicker">GUDANG · BULK</div>
          <h2 class="gud-modal-title">${esc(title)}</h2>
        </div>
        ${running ? '' : `<button type="button" class="gud-icon-btn" data-act="gud-bulk-close" aria-label="Tutup" title="Tutup">${icon('close', { size: 16 })}</button>`}
      </div>
      <div class="gud-modal-body">${body}</div>
      ${renderFoot(m)}
    </div>
  </div>`;
}

function renderFoot(m) {
  if (m.step === 'progress') {
    return `<div class="gud-modal-foot"><span class="gud-modal-hint">Mohon tunggu, jangan tutup jendela ini…</span></div>`;
  }
  if (m.step === 'summary') {
    const hasFailed = m.results && m.results.failed.length > 0;
    return `<div class="gud-modal-foot">
      <span class="gud-modal-hint"></span>
      <div class="gud-modal-actions">
        ${hasFailed ? `<button type="button" class="gud-btn -ghost" data-act="gud-bulk-retry-failed">Coba Lagi yang Gagal (${m.results.failed.length})</button>` : ''}
        <button type="button" class="gud-btn -primary" data-act="gud-bulk-close">Selesai</button>
      </div>
    </div>`;
  }
  if (m.step === 'confirm') {
    const isArchive = m.op === 'archive';
    return `<div class="gud-modal-foot">
      <span class="gud-modal-hint">Esc untuk batal</span>
      <div class="gud-modal-actions">
        <button type="button" class="gud-btn -ghost" data-act="${isArchive ? 'gud-bulk-close' : 'gud-bulk-back'}">${isArchive ? 'Batal' : 'Kembali'}</button>
        <button type="button" class="gud-btn ${isArchive ? '-danger' : '-primary'}" data-act="gud-bulk-execute">${icon('check', { size: 14 })} Jalankan</button>
      </div>
    </div>`;
  }
  // form
  const valid = formIsValid(m);
  return `<div class="gud-modal-foot">
    <span class="gud-modal-hint">Esc untuk batal</span>
    <div class="gud-modal-actions">
      <button type="button" class="gud-btn -ghost" data-act="gud-bulk-close">Batal</button>
      ${m.op === 'export' ? '' : `<button type="button" class="gud-btn -primary" data-act="gud-bulk-next" ${valid ? '' : 'disabled'}>Lanjut</button>`}
    </div>
  </div>`;
}

/* ── render: form step (per op) ──────────────────────────────────────── */
function renderFormStep(st, m) {
  if (m.op === 'goodsOut') return renderGoodsOutForm(st, m);
  if (m.op === 'edit') return renderEditForm(m);
  if (m.op === 'export') return renderExportForm(m);
  return '';
}

function renderGoodsOutForm(st, m) {
  const f = m.form;
  const dept = st.data.departments.find((d) => d.departmentId === f.departmentId);
  if (!dept) {
    const q = f.departmentQuery.trim().toLowerCase();
    const matches = q ? st.data.departments.filter((d) => d.name.toLowerCase().includes(q)) : st.data.departments;
    return `
      <p class="gud-muted">${fmtQty(m.ids.length)} item dipilih.</p>
      <div class="gud-field gud-mt"><span>Bidang</span>
        <input class="gud-input" data-act="gud-bulk-dept-query" value="${esc(f.departmentQuery)}" placeholder="Cari bidang…" autocomplete="off" autofocus />
      </div>
      ${matches.length
        ? `<div class="gud-picker-list gud-mt">${matches.map((d) => `<button type="button" class="gud-picker-row" data-act="gud-bulk-dept-pick" data-id="${esc(d.departmentId)}">${esc(d.name)}</button>`).join('')}</div>`
        : `<div class="gud-muted gud-mt">${st.data.departments.length === 0 ? 'Belum ada bidang terdaftar di Manajemen User.' : 'Tidak ada bidang yang cocok.'}</div>`}
    `;
  }
  return `
    <div class="gud-flow-dept">${icon('users', { size: 14, tone: 'text-faint' })} <span>${esc(dept.name)}</span>
      <button type="button" class="gud-link-btn" data-act="gud-bulk-dept-clear">Ganti</button></div>
    <div class="gud-field gud-mt"><span>Tujuan <span class="gud-opt">(opsional)</span></span>
      <input class="gud-input" data-act="gud-bulk-purpose" value="${esc(f.purpose)}" placeholder="mis. Kebutuhan rapat bulanan" autocomplete="off" /></div>
    <div class="gud-field gud-mt"><span>Catatan <span class="gud-opt">(opsional)</span></span>
      <input class="gud-input" data-act="gud-bulk-notes" value="${esc(f.notes)}" placeholder="Catatan tambahan…" autocomplete="off" /></div>
    <div class="gud-field-secondary-label gud-mt">Jumlah per item</div>
    <div class="gud-line-list gud-mt">${m.ids.map((id) => `
      <div class="gud-line-row">
        <span class="gud-line-name">${esc(nameFor(st, id))}</span>
        <input class="gud-input gud-bulk-qty-input" data-act="gud-bulk-qty" data-id="${esc(id)}" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(f.quantities[id] || '')}" placeholder="0" />
      </div>`).join('')}</div>
  `;
}

function renderEditForm(m) {
  const f = m.form;
  return `
    <p class="gud-muted">${fmtQty(m.ids.length)} item dipilih. Pilih field yang ingin diubah:</p>
    <div class="gud-bulk-edit-row gud-mt">
      <label class="gud-check-row"><input type="checkbox" data-act="gud-bulk-edit-toggle" data-field="category" ${f.applyCategory ? 'checked' : ''} /> Kategori</label>
      ${f.applyCategory ? `<input class="gud-input" data-act="gud-bulk-edit-category" value="${esc(f.category)}" placeholder="mis. ATK" autocomplete="off" />` : ''}
    </div>
    <div class="gud-bulk-edit-row">
      <label class="gud-check-row"><input type="checkbox" data-act="gud-bulk-edit-toggle" data-field="location" ${f.applyLocation ? 'checked' : ''} /> Lokasi</label>
      ${f.applyLocation ? `<input class="gud-input" data-act="gud-bulk-edit-location" value="${esc(f.locationName)}" placeholder="mis. Gudang Utama" autocomplete="off" />` : ''}
    </div>
    <div class="gud-bulk-edit-row">
      <label class="gud-check-row"><input type="checkbox" data-act="gud-bulk-edit-toggle" data-field="clearAliases" ${f.applyClearAliases ? 'checked' : ''} /> Hapus Semua Alias</label>
      <span class="gud-opt">(alias harus unik antar item — bulk-edit hanya bisa mengosongkan, bukan menyamakan)</span>
    </div>
    <div class="gud-bulk-edit-row">
      <label class="gud-check-row"><input type="checkbox" data-act="gud-bulk-edit-toggle" data-field="minimumStock" ${f.applyMinimumStock ? 'checked' : ''} /> Stok Minimum</label>
      ${f.applyMinimumStock ? `<input class="gud-input" data-act="gud-bulk-edit-minstock" type="text" inputmode="numeric" value="${esc(f.minimumStock)}" placeholder="mis. 10" autocomplete="off" />` : ''}
    </div>
  `;
}

function renderExportForm(m) {
  return `
    <p class="gud-muted">${fmtQty(m.ids.length)} item dipilih. Pilih format:</p>
    <div class="gud-bulk-export-formats gud-mt">
      <button type="button" class="gud-btn" data-act="gud-bulk-export-pick" data-val="excel">Excel</button>
      <button type="button" class="gud-btn" data-act="gud-bulk-export-pick" data-val="csv">CSV</button>
      <button type="button" class="gud-btn" data-act="gud-bulk-export-pick" data-val="pdf">PDF</button>
    </div>
  `;
}

/* ── render: confirm step (Phase 5 — Operation / Item Count / Impact) ──── */
function renderConfirmStep(st, m) {
  const title = m.op === 'export' ? `Ekspor (${EXPORT_FORMAT_LABEL[m.form.format]})` : OP_LABEL[m.op];
  const impact = m.op === 'archive' ? { text: 'Tindakan ini tidak dapat dibatalkan.', tone: 'danger' }
    : m.op === 'goodsOut' ? { text: 'Stok akan diperbarui.', tone: 'info' }
    : m.op === 'edit' ? { text: 'Data item yang dipilih akan diperbarui.', tone: 'info' }
    : { text: 'Berkas akan diunduh ke perangkat Anda.', tone: 'info' };
  return `
    <div class="gud-bulk-confirm-head">
      <div class="gud-bulk-confirm-op">${esc(title)}</div>
      <div class="gud-bulk-confirm-count">${fmtQty(m.ids.length)} Item</div>
    </div>
    ${confirmDetail(st, m)}
    <div class="gud-bulk-impact" data-tone="${impact.tone}">${esc(impact.text)}</div>
  `;
}

function confirmDetail(st, m) {
  if (m.op === 'goodsOut') {
    const dept = st.data.departments.find((d) => d.departmentId === m.form.departmentId);
    return `<div class="gud-mt">
      <div class="gud-kv"><span class="gud-kv-k">Bidang</span><span class="gud-kv-v">${esc(dept ? dept.name : '-')}</span></div>
      ${m.form.purpose.trim() ? `<div class="gud-kv"><span class="gud-kv-k">Tujuan</span><span class="gud-kv-v">${esc(m.form.purpose.trim())}</span></div>` : ''}
      ${m.form.notes.trim() ? `<div class="gud-kv"><span class="gud-kv-k">Catatan</span><span class="gud-kv-v">${esc(m.form.notes.trim())}</span></div>` : ''}
    </div>`;
  }
  if (m.op === 'edit') {
    const changes = [];
    if (m.form.applyCategory) changes.push(`Kategori → "${m.form.category.trim() || '(kosong)'}"`);
    if (m.form.applyLocation) changes.push(`Lokasi → "${m.form.locationName.trim() || '(kosong)'}"`);
    if (m.form.applyClearAliases) changes.push('Semua alias akan dihapus');
    if (m.form.applyMinimumStock) changes.push(`Stok Minimum → ${m.form.minimumStock.trim() || '(kosong)'}`);
    return `<ul class="gud-bulk-change-list gud-mt">${changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  }
  return '';
}

/* ── render: progress step (Phase 6) ─────────────────────────────────── */
function renderProgressStep(m) {
  const p = m.progress || { processed: 0, total: m.ids.length };
  const pct = p.total ? Math.round((p.processed / p.total) * 100) : 0;
  const label = p.processed === 0 ? 'Menyiapkan…' : p.processed >= p.total ? 'Menyelesaikan…' : 'Memproses…';
  return `
    <div class="gud-bulk-progress-label">${esc(label)}</div>
    <div class="gud-bulk-progress-bar"><div class="gud-bulk-progress-fill" style="width:${pct}%"></div></div>
    <div class="gud-bulk-progress-count">${fmtQty(p.processed)} / ${fmtQty(p.total)}</div>
  `;
}

/* ── render: summary step (Phase 7) ──────────────────────────────────── */
function renderSummaryStep(st, m) {
  const r = m.results;
  const allOk = r.failed.length === 0;
  return `
    <div class="gud-bulk-summary-head">
      ${icon('check-circle', { size: 28, tone: allOk ? 'c-green' : 'text-faint' })}
      <div class="gud-empty-t">Selesai</div>
    </div>
    <div class="gud-bulk-summary-stats">
      <div class="gud-bulk-stat"><span class="gud-bulk-stat-n" data-tone="ok">${fmtQty(r.success.length)}</span><span>Berhasil</span></div>
      ${r.failed.length ? `<div class="gud-bulk-stat"><span class="gud-bulk-stat-n" data-tone="crit">${fmtQty(r.failed.length)}</span><span>Gagal</span></div>` : ''}
      <div class="gud-bulk-stat"><span class="gud-bulk-stat-n">${(r.durationMs / 1000).toFixed(1)}d</span><span>Durasi</span></div>
    </div>
    ${r.failed.length ? `
      <button type="button" class="gud-link-btn gud-mt" data-act="gud-bulk-toggle-details">${m.showDetails ? 'Sembunyikan' : 'Lihat'} Detail</button>
      ${m.showDetails ? `<div class="gud-bulk-fail-list gud-mt">${groupFailuresByReason(r.failed).map((g) => `
        <div class="gud-bulk-fail-group">
          <div class="gud-bulk-fail-reason">${esc(g.reason)} <span class="gud-pill" data-pill="crit">${g.count}</span></div>
          <div class="gud-bulk-fail-items">${g.ids.map((id) => esc(nameFor(st, id))).join(', ')}</div>
        </div>`).join('')}</div>` : ''}
    ` : ''}
  `;
}

/* ── handlers ─────────────────────────────────────────────────────────── */
export const bulkHandlers = {
  onClick(st, act, el, c, render, refreshCatalog, showToast) {
    const m = st.modal;
    switch (act) {
      case 'gud-bulk-open-goodsout': openBulkModal(st, 'goodsOut'); render(); break;
      case 'gud-bulk-open-archive': openBulkModal(st, 'archive'); render(); break;
      case 'gud-bulk-open-edit': openBulkModal(st, 'edit'); render(); break;
      case 'gud-bulk-open-export': openBulkModal(st, 'export'); render(); break;
      case 'gud-bulk-close': if (!isBulkOperationRunning(st)) { st.modal = null; render(); } break;
      case 'gud-bulk-dept-pick': m.form.departmentId = el.dataset.id; m.form.departmentQuery = ''; render(); break;
      case 'gud-bulk-dept-clear': m.form.departmentId = null; render(); break;
      case 'gud-bulk-export-pick': m.form.format = el.dataset.val; m.step = 'confirm'; render(); break;
      case 'gud-bulk-edit-toggle': {
        const field = el.dataset.field;
        if (field === 'category') m.form.applyCategory = el.checked;
        else if (field === 'location') m.form.applyLocation = el.checked;
        else if (field === 'clearAliases') m.form.applyClearAliases = el.checked;
        else if (field === 'minimumStock') m.form.applyMinimumStock = el.checked;
        render(); break;
      }
      case 'gud-bulk-next': if (formIsValid(m)) { m.step = 'confirm'; render(); } break;
      case 'gud-bulk-back': m.step = 'form'; render(); break;
      case 'gud-bulk-execute': runOperation(st, c, render, refreshCatalog, showToast); break;
      case 'gud-bulk-retry-failed': {
        if (!m.results || !m.results.failed.length) return;
        m.ids = m.results.failed.map((f) => f.id);
        m.results = null; m.progress = null; m.showDetails = false;
        runOperation(st, c, render, refreshCatalog, showToast);
        break;
      }
      case 'gud-bulk-toggle-details': m.showDetails = !m.showDetails; render(); break;
      default: break;
    }
  },
  onInput(st, act, t, render) {
    const m = st.modal;
    if (!m) return;
    switch (act) {
      case 'gud-bulk-dept-query': m.form.departmentQuery = t.value; render(); break;
      case 'gud-bulk-purpose': m.form.purpose = t.value; break;
      case 'gud-bulk-notes': m.form.notes = t.value; break;
      case 'gud-bulk-qty': m.form.quantities[t.dataset.id] = t.value; render(); break;
      case 'gud-bulk-edit-category': m.form.category = t.value; break;
      case 'gud-bulk-edit-location': m.form.locationName = t.value; break;
      case 'gud-bulk-edit-minstock': m.form.minimumStock = t.value; break;
      default: break;
    }
  },
};

/** Execute (Phase 6/7): transitions to 'progress', drives bulk-executor.js
 *  with a live onProgress -> render() tick, then to 'summary', then the
 *  shared post-completion refresh (see file header). */
async function runOperation(st, c, render, refreshCatalog, showToast) {
  const m = st.modal;
  if (!m || m.kind !== 'bulk') return;
  m.step = 'progress';
  m.progress = { processed: 0, total: m.ids.length };
  render();

  let op;
  let exportRows = null;
  if (m.op === 'goodsOut') op = createBulkGoodsOutOperation(st, m.form, c.actorId);
  else if (m.op === 'archive') op = createBulkArchiveOperation(st);
  else if (m.op === 'edit') op = createBulkEditOperation(st, m.form);
  else { exportRows = []; op = createBulkExportOperation(st, exportRows); }

  const results = await runBulkOperation(m.ids, {
    prepare: op.prepare ? op.prepare.bind(op) : undefined,
    validate: op.validate ? op.validate.bind(op) : undefined,
    execute: op.execute.bind(op),
    onProgress: (p) => { m.progress = p; render(); },
  });

  if (op.finalizeStock) await op.finalizeStock();

  if (m.op === 'export' && exportRows.length) {
    try {
      if (m.form.format === 'csv') downloadBulkExportCsv(exportRows);
      else if (m.form.format === 'excel') await downloadBulkExportExcel(exportRows);
      else if (m.form.format === 'pdf') await downloadBulkExportPdf(exportRows);
    } catch (err) {
      // The file itself failed to build/download — every "successful" row
      // is retroactively not actually delivered; report it as one grouped
      // failure rather than a silent no-op download.
      results.failed.push(...results.success.map((id) => ({ id, reason: err.message || 'Gagal membuat berkas ekspor.' })));
      results.success.length = 0;
    }
  }

  m.results = results;
  m.step = 'summary';
  render();

  // Export changes nothing server-side — no catalog/analytics refresh needed.
  if (m.op !== 'export') await refreshCatalog();
  if (results.success.length || results.failed.length) clearSelection(st.selection);
  render();

  if (showToast) {
    const verb = OP_TOAST_VERB[m.op];
    const msg = results.failed.length
      ? `${results.success.length} item ${verb}, ${results.failed.length} gagal.`
      : `${results.success.length} item ${verb}.`;
    showToast(msg);
  }
}
