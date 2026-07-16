/* ============================================================
   OVERTIME-REPORT-HISTORY-VIEW.JS — Report History screen (Sprint 8)

   Metadata-only history (svc.listReportHistory()) — mirrors
   js/exports/export-history.js's convention: never the PDF/blob
   itself. "Regenerate" re-derives the snapshot fresh from the stored
   filters and re-runs the same export dispatcher the Report Builder
   uses (overtime-export-runner.js) — never fetches stored bytes,
   since no Firebase Storage is used anywhere in this app.
   ============================================================ */

'use strict';

import * as svc from '../overtime-service.js';
import { esc, fmtDateTime, emptyState } from './overtime-atoms.js';
import { runOvertimeExport } from './overtime-export-runner.js';

const FORMAT_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'pdf', label: 'PDF' },
  { key: 'excel', label: 'Excel' },
  { key: 'csv', label: 'CSV' },
  { key: 'print', label: 'Print' },
];
const FORMAT_LABEL = { pdf: 'PDF', excel: 'Excel', csv: 'CSV', print: 'Print' };
const STATUS_TONE = { success: 'var(--green)', failed: 'var(--primary)' };

function row(entry) {
  return `
    <tr>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12px;white-space:nowrap">${esc(fmtDateTime(entry.generatedAt))}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12px;font-weight:700">${esc(FORMAT_LABEL[entry.format] || entry.format)}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12px">${esc(entry.periodLabel || '—')}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12px">${esc((entry.scope && entry.scope.label) || '—')}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12px;color:${STATUS_TONE[entry.status] || 'var(--text)'}">${esc(entry.status === 'success' ? 'Berhasil' : 'Gagal')}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12px">${esc(entry.generatedBy || '—')}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);text-align:right">
        <button data-act="regenerateReport" data-id="${esc(entry.id)}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">Regenerate</button>
      </td>
    </tr>`;
}

export function renderReportHistoryScreen(state) {
  const all = svc.listReportHistory();
  const filter = state.historyFormatFilter || 'all';
  const rows = filter === 'all' ? all : all.filter(e => e.format === filter);

  const tabs = FORMAT_FILTERS.map(t => `
    <button data-act="setHistoryFormatFilter" data-id="${t.key}" type="button"
      style="border:1px solid ${t.key === filter ? 'var(--primary)' : 'var(--border)'};background:${t.key === filter ? 'var(--primary-tint)' : 'var(--card)'};color:${t.key === filter ? 'var(--primary-text)' : 'var(--text)'};border-radius:8px;padding:6px 12px;font-size:12px;font-weight:${t.key === filter ? '700' : '600'};cursor:pointer">${t.label}</button>`).join('');

  const body = rows.length
    ? `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            ${['Waktu', 'Format', 'Periode', 'Cakupan', 'Status', 'Oleh', ''].map(h => `<th style="padding:8px 10px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;text-align:left">${esc(h)}</th>`).join('')}
          </tr></thead>
          <tbody>${rows.map(row).join('')}</tbody>
        </table>
      </div>`
    : emptyState('Belum ada riwayat laporan', 'Laporan yang diekspor dari Report Builder akan tercatat di sini.');

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Riwayat Laporan</h2>
      <div style="font-size:13px;color:var(--muted)">Riwayat laporan yang pernah diekspor — dapat dibuat ulang kapan saja.</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${tabs}</div>
    ${body}`;
}

export const reportHistoryActions = {
  setHistoryFormatFilter({ id, setState }) { setState({ historyFormatFilter: id }); },

  async regenerateReport({ id, toast }) {
    let entry, snapshot;
    try {
      ({ entry, snapshot } = svc.regenerateReportFromHistory(id));
    } catch (err) {
      // No valid entry/snapshot to log against — nothing to record.
      toast(err.message || 'Gagal membuat ulang laporan.');
      return;
    }
    try {
      await runOvertimeExport(entry.format, snapshot);
      await svc.logReportGenerated({
        format: entry.format, period: snapshot.period, periodLabel: snapshot.periodLabel,
        dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
        scope: snapshot.scope, status: 'success', source: 'manual',
      });
      if (entry.format === 'excel' || entry.format === 'csv') toast(`Laporan ${FORMAT_LABEL[entry.format]} dibuat ulang.`);
    } catch (err) {
      // Never a silent failure — logged just like every other export path.
      await svc.logReportGenerated({
        format: entry.format, period: snapshot.period, periodLabel: snapshot.periodLabel,
        dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
        scope: snapshot.scope, status: 'failed', source: 'manual', error: err.message || String(err),
      });
      toast(err.message || 'Gagal membuat ulang laporan.');
    }
  },
};
