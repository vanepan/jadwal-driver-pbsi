/* ============================================================
   OVERTIME-ARCHIVE-VIEW.JS — Archive screen (Sprint 9)

   Modeled on petty-cash's own archivedExpenses()/archiveExpense()
   pattern (immutable period-record snapshots) rather than the
   js/v2/organizational-memory archive engine, which is built for
   knowledge/document provenance (duplicate/hash detection) — a
   different shape of problem than "browse frozen monthly snapshots."

   Search/filter by month, Preview (frozen summary rankings), Download
   (regenerate-on-demand from the linked report-history entry — never
   fetches stored bytes, no Firebase Storage is used anywhere in this
   app).
   ============================================================ */

'use strict';

import * as svc from '../overtime-service.js';
import { esc, fmtDateTime, fmtMonth, rp, emptyState } from './overtime-atoms.js';
import { topUnits, topEmployees } from '../overtime-analytics-engine.js';
import { runOvertimeExport } from './overtime-export-runner.js';

function archiveCard(archive, expanded, units, employees) {
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:800;color:var(--text)">${esc(fmtMonth(archive.yyyyMM))} <span style="font-size:11px;font-weight:700;color:var(--muted)">v${archive.version}</span></div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Diarsipkan ${esc(fmtDateTime(archive.archivedAt))} oleh ${esc(archive.archivedBy || '—')} · ${archive.recordCount} entri</div>
        </div>
        <div style="display:flex;gap:6px">
          <button data-act="toggleArchivePreview" data-id="${esc(archive.yyyyMM)}" type="button" style="border:1px solid var(--border);background:var(--card2);color:var(--text);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer">${expanded ? 'Tutup' : 'Preview'}</button>
          <button data-act="downloadArchiveReport" data-id="${esc(archive.yyyyMM)}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer">Download Laporan</button>
        </div>
      </div>
      ${expanded ? archivePreview(archive, units, employees) : ''}
    </div>`;
}

function archivePreview(archive, units, employees) {
  const tu = topUnits(archive.summary, units, employees, 10);
  const te = topEmployees(archive.summary, employees, 10);
  const rankTable = (title, rows, extraCol) => `
    <div style="flex:1;min-width:220px">
      <div style="font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:6px">${esc(title)}</div>
      ${rows.length ? rows.map(r => `
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-top:1px solid var(--border)">
          <span>${esc(r.name)}${extraCol ? ` <span style="color:var(--muted)">· ${r.employeeCount} pegawai</span>` : ''}</span>
          <span style="font-weight:700">${esc(rp(r.amount))}</span>
        </div>`).join('') : `<div style="font-size:12px;color:var(--muted)">Tidak ada data.</div>`}
    </div>`;

  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px;font-style:italic">Arsip — data historis (dibekukan saat Closing, tidak berubah meski master data berubah kemudian).</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="background:var(--card2);border-radius:10px;padding:10px 14px;flex:1;min-width:120px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Total Entri</div>
          <div style="font-size:17px;font-weight:800">${archive.summary.totalRecords}</div>
        </div>
        <div style="background:var(--card2);border-radius:10px;padding:10px 14px;flex:1;min-width:120px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Total Nominal</div>
          <div style="font-size:17px;font-weight:800">${esc(rp(archive.summary.totalAmount))}</div>
        </div>
        <div style="background:var(--card2);border-radius:10px;padding:10px 14px;flex:1;min-width:120px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Peringatan Saat Closing</div>
          <div style="font-size:17px;font-weight:800">${(archive.validationWarningsAtClose || []).length}</div>
        </div>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${rankTable('Per Unit', tu, true)}
        ${rankTable('Per Karyawan', te, false)}
      </div>
    </div>`;
}

export function renderArchiveScreen(state) {
  const all = svc.listArchives();
  const q = (state.archiveSearchQuery || '').trim().toLowerCase();
  const rows = q ? all.filter(a => fmtMonth(a.yyyyMM).toLowerCase().includes(q) || a.yyyyMM.includes(q)) : all;
  // Fetched once per render (not once per card) — only actually used by
  // whichever single card is expanded.
  const units = svc.listUnits();
  const employees = svc.listEmployees();

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Arsip</h2>
      <div style="font-size:13px;color:var(--muted)">Arsip beku setiap periode yang telah ditutup.</div>
    </div>
    <input data-act="input:archiveSearchQuery" type="text" placeholder="Cari bulan/tahun… (mis. Juli 2026 atau 2026-07)" value="${esc(state.archiveSearchQuery || '')}"
      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;margin-bottom:14px">
    <div style="display:flex;flex-direction:column;gap:12px">
      ${rows.length ? rows.map(a => archiveCard(a, state.archiveExpandedMonth === a.yyyyMM, units, employees)).join('') : emptyState('Belum ada arsip', 'Arsip muncul di sini setelah sebuah periode ditutup (Monthly Closing).')}
    </div>`;
}

export const archiveActions = {
  toggleArchivePreview({ id, state, setState }) {
    setState({ archiveExpandedMonth: state.archiveExpandedMonth === id ? null : id });
  },

  async downloadArchiveReport({ id, toast }) {
    const archive = svc.getArchiveSnapshot(id);
    const linked = archive && archive.reportRef && archive.reportRef.historyEntryId
      ? svc.regenerateReportFromHistory(archive.reportRef.historyEntryId)
      : null;
    // No linked report (e.g. Closing's report generation failed at the
    // time) — fall back to building a fresh snapshot for that month.
    const format = linked ? (linked.entry.format || 'pdf') : 'pdf';
    const snapshot = linked ? linked.snapshot : svc.getReportSnapshot({ period: 'month', refDate: `${id}-01` });
    try {
      await runOvertimeExport(format, snapshot);
      await svc.logReportGenerated({
        format, period: snapshot.period, periodLabel: snapshot.periodLabel,
        dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
        scope: snapshot.scope, status: 'success', source: 'manual',
      });
    } catch (err) {
      await svc.logReportGenerated({
        format, period: snapshot.period, periodLabel: snapshot.periodLabel,
        dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
        scope: snapshot.scope, status: 'failed', source: 'manual', error: err.message || String(err),
      });
      toast(err.message || 'Gagal mengunduh laporan arsip.');
    }
  },
};
