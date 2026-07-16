/* ============================================================
   OVERTIME-REPORTS-VIEW.JS — Report Builder screen (Sprint 8)

   Filters (period × scope) -> svc.getReportSnapshot() preview -> export
   as PDF/Excel/CSV/Print. Every export logs to Report History
   (svc.logReportGenerated) — success AND failure, never a silent
   error (Sprint 10's error-handling audit target, satisfied from the
   start rather than retrofitted).
   ============================================================ */

'use strict';

import * as svc from '../overtime-service.js';
import { esc, rp, todayISO } from './overtime-atoms.js';
import { runOvertimeExport } from './overtime-export-runner.js';
import { APP_VERSION } from '../../config.js';

const PERIOD_TABS = [
  { key: 'day', label: 'Harian' },
  { key: 'week', label: 'Mingguan' },
  { key: 'month', label: 'Bulanan' },
  { key: 'year', label: 'Tahunan' },
];
const SCOPE_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'unit', label: 'Per Unit' },
  { key: 'employee', label: 'Per Karyawan' },
];

function tabRow(actName, tabs, activeKey) {
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">${tabs.map(t => `
    <button data-act="${actName}" data-id="${t.key}" type="button"
      style="border:1px solid ${t.key === activeKey ? 'var(--primary)' : 'var(--border)'};background:${t.key === activeKey ? 'var(--primary-tint)' : 'var(--card)'};color:${t.key === activeKey ? 'var(--primary-text)' : 'var(--text)'};border-radius:8px;padding:6px 12px;font-size:12px;font-weight:${t.key === activeKey ? '700' : '600'};cursor:pointer">${t.label}</button>`).join('')}</div>`;
}

function refDateField(state) {
  const period = state.reportPeriod || 'month';
  const raw = state.reportRefDate || todayISO();
  const type = period === 'year' ? 'number' : period === 'month' ? 'month' : 'date';
  let value;
  if (period === 'year') value = /^\d{4}/.test(raw) ? raw.slice(0, 4) : todayISO().slice(0, 4);
  else if (period === 'month') value = /^\d{4}-\d{2}/.test(raw) ? raw.slice(0, 7) : todayISO().slice(0, 7);
  else value = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : todayISO();
  // Live-updating (drives the preview below) — handled by a dedicated
  // `input:reportRefDate` case in onInput, same convention as entryDate.
  return `<input data-act="input:reportRefDate" type="${type}" value="${esc(value)}"
    style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">`;
}

function scopeSelector(state, units, employees) {
  if (state.reportScope === 'unit') {
    return `<select data-act="input:reportUnitId" style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">
      <option value="">— Pilih Unit —</option>
      ${units.map(u => `<option value="${u.id}" ${state.reportUnitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
    </select>`;
  }
  if (state.reportScope === 'employee') {
    return `<select data-act="input:reportEmployeeId" style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">
      <option value="">— Pilih Karyawan —</option>
      ${employees.map(e => `<option value="${e.id}" ${state.reportEmployeeId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
    </select>`;
  }
  return '';
}

function previewTable(title, headers, rows, toCells, emptyLabel) {
  const body = rows.length
    ? rows.map(r => `<tr>${toCells(r).map((c, i) => `<td style="padding:7px 10px;border-top:1px solid var(--border);font-size:12.5px;text-align:${i === 0 ? 'left' : 'right'}">${c}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" style="padding:12px 10px;font-size:12px;color:var(--muted)">${esc(emptyLabel)}</td></tr>`;
  return `
    <div style="flex:1;min-width:300px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;overflow-x:auto">
      <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:8px">${esc(title)}</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${headers.map((h, i) => `<th style="padding:6px 10px;font-size:10.5px;font-weight:700;color:var(--muted);text-align:${i === 0 ? 'left' : 'right'};text-transform:uppercase">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/** Builds the snapshot for the CURRENT filter state — the one call this
    screen's render and every export action share (never one call per
    button). */
function buildSnapshot(state) {
  return svc.getReportSnapshot({
    period: state.reportPeriod || 'month',
    refDate: state.reportRefDate || todayISO(),
    unitId: state.reportScope === 'unit' ? (state.reportUnitId || null) : null,
    employeeId: state.reportScope === 'employee' ? (state.reportEmployeeId || null) : null,
  });
}

export function renderReportsScreen(state) {
  const units = svc.listActiveUnits();
  const employees = svc.listActiveEmployees();
  const snapshot = buildSnapshot(state);

  // Published for the console-reachable window.exportOvertimeReport() hook.
  if (typeof window !== 'undefined') window._lastOvertimeReportSnapshot = snapshot;

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Laporan</h2>
      <div style="font-size:13px;color:var(--muted)">Susun laporan overtime per periode dan cakupan, lalu ekspor.</div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">Periode</div>
        ${tabRow('setReportPeriod', PERIOD_TABS, state.reportPeriod || 'month')}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">Cakupan</div>
        ${tabRow('setReportScope', SCOPE_TABS, state.reportScope || 'all')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${refDateField(state)}
        ${scopeSelector(state, units, employees)}
      </div>
      <div style="font-size:12px;color:var(--muted)">${esc(snapshot.periodLabel)} · ${esc(snapshot.dateRangeStart)} s.d. ${esc(snapshot.dateRangeEnd)} · ${esc(snapshot.scope.label)}</div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      ${[
        { label: 'Total Entri', value: snapshot.kpis.totalRecords },
        { label: 'Total Nominal', value: rp(snapshot.kpis.totalAmount) },
        { label: 'Rata-rata / Hari', value: rp(snapshot.kpis.avgPerDay) },
        { label: 'Unit Terlibat', value: snapshot.kpis.unitCount },
        { label: 'Karyawan Terlibat', value: snapshot.kpis.employeeCount },
      ].map(k => `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;flex:1;min-width:130px">
        <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase">${esc(k.label)}</div>
        <div style="font-size:19px;font-weight:800;margin-top:4px">${esc(String(k.value))}</div>
      </div>`).join('')}
    </div>

    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px">
      ${previewTable('Per Unit', ['Unit', 'Hari', 'Pegawai', 'Nominal'], snapshot.unitRows, r => [esc(r.name), r.count, r.employeeCount, esc(rp(r.amount))], 'Tidak ada data unit pada periode ini.')}
      ${previewTable('Per Karyawan', ['Karyawan', 'Hari', 'Nominal'], snapshot.employeeRows, r => [esc(r.name), r.count, esc(rp(r.amount))], 'Tidak ada data karyawan pada periode ini.')}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">
      <button data-act="exportReportPdf" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer">Export PDF</button>
      <button data-act="exportReportExcel" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer">Export Excel</button>
      <button data-act="exportReportCsv" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer">Export CSV</button>
      <button data-act="exportReportPrint" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer">Print</button>
    </div>`;
}

async function logResult(state, format, snapshot, status, extra = {}) {
  try {
    await svc.logReportGenerated({
      format, period: snapshot.period, periodLabel: snapshot.periodLabel,
      dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
      scope: snapshot.scope, status, appVersion: APP_VERSION, ...extra,
    });
  } catch (_) { /* history logging must never mask the original export result */ }
}

const FORMAT_LABEL = { pdf: 'PDF', excel: 'Excel', csv: 'CSV', print: 'Print' };

async function runAndLog(state, format, toast) {
  const snapshot = buildSnapshot(state);
  const t0 = Date.now();
  try {
    await runOvertimeExport(format, snapshot, { appVersion: APP_VERSION });
    await logResult(state, format, snapshot, 'success', { durationMs: Date.now() - t0 });
    if (format !== 'pdf' && format !== 'print') toast(`Laporan ${FORMAT_LABEL[format]} diunduh.`);
  } catch (err) {
    await logResult(state, format, snapshot, 'failed', { error: err.message || String(err), durationMs: Date.now() - t0 });
    toast(err.message || `Gagal membuat laporan ${FORMAT_LABEL[format]}.`);
  }
}

export const reportsActions = {
  setReportPeriod({ id, setState }) { setState({ reportPeriod: id }); },
  setReportScope({ id, setState }) { setState({ reportScope: id }); },

  exportReportPdf({ state, toast }) { return runAndLog(state, 'pdf', toast); },
  exportReportPrint({ state, toast }) { return runAndLog(state, 'print', toast); },
  exportReportExcel({ state, toast }) { return runAndLog(state, 'excel', toast); },
  exportReportCsv({ state, toast }) { return runAndLog(state, 'csv', toast); },
};
