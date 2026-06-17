/* ============================================================
   EXPORT-CENTER.JS — the modern Export Center UI
   (v1.12.1C — Export Center Modernization).

   Pure presentation built entirely on the two foundations:
     • Catalog  ← export-registry.js  (listExportReports)
     • History  ← export-history.js   (record cache, metadata only)
     • Summary  ← derived from the same metadata cache

   This module renders HTML strings only. It does NOT run exports,
   query Firebase, or touch PDF rendering / Cloud Functions /
   analytics calculations / templates. The host (app.js) wires the
   Generate buttons to runExportReport() and feeds in the history
   records, so responsibilities stay separated.
   ============================================================ */

'use strict';

import { listExportReports } from './export-registry.js';

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Formatters (display-only) ─────────────────────────────────────────── */

function fmtBytes(n) {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDuration(ms) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (_) {
    return d.toISOString();
  }
}

/* ── Analytics summary (derived from the metadata cache) ───────────────── */

/**
 * Compute the four headline figures from the history records.
 * @param {Array<Object>} records
 * @returns {{total:number, success:number, failed:number, mostUsedLabel:string}}
 */
export function computeExportSummary(records = []) {
  const list = Array.isArray(records) ? records : [];
  let success = 0, failed = 0;
  const counts = new Map();      // reportId → count
  const labelOf = new Map();     // reportId → title (last seen)
  for (const r of list) {
    if (r.status === 'failed') failed++;
    else success++;
    const id = r.reportId || r.reportTitle || '—';
    counts.set(id, (counts.get(id) || 0) + 1);
    if (r.reportTitle) labelOf.set(id, r.reportTitle);
  }
  // Prefer the registry title; fall back to the last-seen recorded title.
  const registryTitle = new Map(listExportReports().map(rep => [rep.id, rep.title]));
  let bestId = null, bestCount = 0;
  for (const [id, c] of counts) {
    if (c > bestCount) { bestCount = c; bestId = id; }
  }
  const mostUsedLabel = bestId
    ? (registryTitle.get(bestId) || labelOf.get(bestId) || bestId)
    : '—';
  return { total: list.length, success, failed, mostUsedLabel };
}

function renderSummary(records) {
  const s = computeExportSummary(records);
  const stat = (num, label, mod = '') =>
    `<div class="ec-stat${mod ? ' ' + mod : ''}">
       <span class="ec-stat-num">${_esc(num)}</span>
       <span class="ec-stat-label">${_esc(label)}</span>
     </div>`;
  return `<div class="ec-summary">
    ${stat(s.total, 'Total Ekspor')}
    ${stat(s.success, 'Ekspor Berhasil', 'ec-stat--ok')}
    ${stat(s.failed, 'Ekspor Gagal', 'ec-stat--fail')}
    ${stat(s.mostUsedLabel, 'Paling Sering', 'ec-stat--wide')}
  </div>`;
}

/* ── Report catalog (from the registry — no hardcoded list) ────────────── */

function renderCatalog() {
  const cards = listExportReports().map(r => `
    <div class="ec-card">
      <span class="ec-card-ic" aria-hidden="true">${r.icon || ''}</span>
      <div class="ec-card-body">
        <span class="ec-card-title">${_esc(r.title)}</span>
        <span class="ec-card-desc">${_esc(r.description)}</span>
      </div>
      <button type="button" class="ec-card-gen" data-action="ec-generate" data-report="${_esc(r.id)}">
        <span data-busy-label>Generate</span>
      </button>
    </div>`).join('');
  return `<div class="ec-catalog">${cards}</div>`;
}

/* ── Export history (from the metadata cache — no direct Firebase) ──────── */

function renderHistory(records) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) {
    return `<div class="ec-history ec-history--empty">
      <p class="ec-empty">Belum ada riwayat ekspor.</p>
    </div>`;
  }
  const rows = list.map(r => {
    const ok = r.status !== 'failed';
    const badge = ok
      ? `<span class="ec-badge ec-badge--success">Berhasil</span>`
      : `<span class="ec-badge ec-badge--failed">Gagal</span>`;
    const stats = ok
      ? `${_esc(fmtDuration(r.durationMs))} · ${_esc(fmtBytes(r.fileSize))}`
      : `${_esc(fmtDuration(r.durationMs))} · ${_esc(r.error || 'Gagal')}`;
    return `<div class="ec-hist">
      <div class="ec-hist-main">
        <span class="ec-hist-title">${_esc(r.reportTitle || r.reportId || '—')}</span>
        <span class="ec-hist-meta">${_esc(fmtDateTime(r.generatedAt))} · ${_esc(r.generatedBy || '—')}</span>
      </div>
      <div class="ec-hist-aside">
        ${badge}
        <span class="ec-hist-stat">${stats}</span>
      </div>
    </div>`;
  }).join('');
  return `<div class="ec-history">${rows}</div>`;
}

/* ── Compose ───────────────────────────────────────────────────────────── */

/**
 * Render the full modern Export Center: summary + catalog + history.
 * @param {Array<Object>} records history records (metadata cache).
 * @returns {string} HTML
 */
export function renderExportCenter(records = []) {
  return `<div class="ec" id="ecRoot">
    ${renderSummary(records)}
    <div class="ec-grid">
      <section class="ec-col ec-col--catalog">
        <h3 class="ec-col-title">Katalog Laporan</h3>
        ${renderCatalog()}
      </section>
      <section class="ec-col ec-col--history">
        <h3 class="ec-col-title">Riwayat Ekspor</h3>
        ${renderHistory(records)}
      </section>
    </div>
  </div>`;
}
