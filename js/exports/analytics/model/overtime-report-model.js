/* ============================================================
   OVERTIME-REPORT-MODEL.JS — OvertimeReportSnapshot → canonical
   administrative-layout projection (UX Refinement)

   Client-side projection for the Overtime PDF/Excel report. Reads
   svc.getReportSnapshot()'s already-computed snapshot and reshapes it
   into the EXACT two-section structure of the org's real payroll
   spreadsheet ("DATA PENGAJUAN LEMBUR TIM/KARYAWAN SARPRAS PBSI" +
   "Rekapitulasi Lembur Staf Sarpras") — this is the canonical
   administrative layout, not a generic KPI-card report (that was the
   Sprint 8 shape; superseded here per explicit instruction: "Prinsip
   export WAJIB mengikuti spreadsheet tersebut").

   No analytics computation happens here — date-grouping/subtotal/
   sort-order are pure PROJECTION of svc.getReportSnapshot()'s already-
   computed detailRecords/employeeRows, matching every other model in
   this directory's "pure projection, no analytics math" contract. This
   file has zero Firebase dependency (only takes a plain snapshot
   object), so — unlike overtime-service.js — it IS directly
   Node-testable.
   ============================================================ */

'use strict';

import { longDateID, shortDateID } from '../format/dates.js';

function rp(n) { return 'Rp' + Number(Math.round(Number(n) || 0)).toLocaleString('id-ID'); }

/** English weekday, matching the canonical spreadsheet's exact date-header
    format ("Friday, 3 April 2026") — a deliberate exception to this app's
    Indonesian-first convention, kept for fidelity to the source document. */
function englishDateLabel(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`;
}

/** "April 2026" / "2026" style title matching the canonical sheet's
    "Periode [x]" header — derived from the resolved date range, not the
    Report Builder's own internal periodLabel string (e.g. "Bulanan —
    2026-04"), which is fine as on-screen chrome but not a title.
    Title-case here; the detail section's ALL-CAPS look (matching its own
    fully-uppercase title) is applied by the caller, not baked in here —
    the recap title in the source sheet is normal case ("Rekapitulasi...
    Periode April 2026"), only the detail title is all-caps. */
function buildPeriodTitle(period, dateRangeStart, dateRangeLabel) {
  if (!dateRangeStart) return dateRangeLabel || '—';
  const d = new Date(`${dateRangeStart}T00:00:00`);
  if (period === 'year') return String(d.getFullYear());
  if (period === 'month') return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  return dateRangeLabel || '—';
}

/** Section A — "DATA PENGAJUAN LEMBUR...": groups detailRecords by date,
    with a running "No" sequence across the whole report and a per-date
    subtotal, closed by a grand total (per the brief: "dikelompokkan
    berdasarkan tanggal - subtotal setiap tanggal - total keseluruhan"). */
function buildDateGroups(detailRecords) {
  const byDate = new Map();
  (detailRecords || []).forEach(r => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  let runningNo = 0;
  let grandTotalRaw = 0;
  const groups = [...byDate.keys()].sort().map(date => {
    const records = byDate.get(date);
    const subtotalRaw = records.reduce((sum, r) => sum + (r.amount || 0), 0);
    grandTotalRaw += subtotalRaw;
    const rows = records.map(r => {
      runningNo += 1;
      return { no: runningNo, employeeName: r.employeeName, unitName: r.unitName, amount: rp(r.amount) };
    });
    return { date, dateLabel: englishDateLabel(date), rows, subtotal: rp(subtotalRaw) };
  });

  return { groups, grandTotal: rp(grandTotalRaw), isEmpty: groups.length === 0 };
}

/** Section B — "Rekapitulasi Lembur Staf Sarpras": sorted ALPHABETICALLY
    by name (payroll-lookup convention — the sheet's own row order is not
    amount-ranked), closed by "Total Keseluruhan". Adds a "Jumlah Hari"
    column beyond the sheet's literal 3 columns (Nama/Jumlah Lemburan/
    Bidang) per the brief's own "Minimal tampilkan" wording. */
function buildRecapRows(employeeRows) {
  const sorted = [...(employeeRows || [])].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  let grandTotalRaw = 0;
  const rows = sorted.map((r, i) => {
    grandTotalRaw += r.amount || 0;
    return { no: i + 1, name: r.name, days: r.count, amount: rp(r.amount), unitName: r.unitName || '—' };
  });
  return { rows, grandTotal: rp(grandTotalRaw), isEmpty: rows.length === 0 };
}

/* ── Filenames (Production Polish FIX 3) — "Nama Laporan + Scope +
   Periode", never a UUID or a raw timestamp. Computed ONCE here (the one
   place every exporter — PDF/Excel/CSV — already reads its view model
   from) so the three formats can never drift onto different naming
   schemes. PDF gets the human period ("Juli 2026" — read once, opened
   once); Excel/CSV get the sortable period ("2026-07" — so a folder of
   monthly recaps sorts correctly by filename), matching the two example
   conventions given for this fix. ── */

/** Strips characters illegal in Windows/macOS filenames; keeps spaces and
    the report's own punctuation ("Sarpras", "16 Juli 2026") readable. */
function safeFilenamePart(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

/** "Sarpras" for the org-wide report, else the bare unit/employee name —
    reuses the already-composed scope.label ("Unit: X" / "Karyawan: X")
    instead of re-deriving from ids, keeping this file's zero-Firebase-
    dependency, pure-projection contract. */
function filenameScope(scope) {
  if (!scope || scope.type === 'all') return 'Sarpras';
  const label = scope.label || '';
  const sep = label.indexOf(': ');
  return (sep >= 0 ? label.slice(sep + 2) : label) || 'Sarpras';
}

/** "Juli 2026" / "2026" / "16 Juli 2026" / "13 - 19 Juli 2026". */
function filenamePeriodHuman(period, dateRangeStart, dateRangeEnd, periodTitle) {
  if (period === 'month' || period === 'year' || !dateRangeStart) return periodTitle;
  if (dateRangeStart === dateRangeEnd) return longDateID(`${dateRangeStart}T00:00:00`);
  return `${new Date(`${dateRangeStart}T00:00:00`).getDate()} - ${longDateID(`${dateRangeEnd}T00:00:00`)}`;
}

/** "2026-07" / "2026" / "2026-07-16" / "2026-07-13_2026-07-19". */
function filenamePeriodSortable(period, dateRangeStart, dateRangeEnd) {
  if (!dateRangeStart) return '';
  if (period === 'year') return dateRangeStart.slice(0, 4);
  if (period === 'month') return dateRangeStart.slice(0, 7);
  if (dateRangeStart === dateRangeEnd) return dateRangeStart;
  return `${dateRangeStart}_${dateRangeEnd}`;
}

/* ── Scope-aware titles (Production Polish Round 2 FIX 17) — the report
   title must reflect an active unit/employee filter instead of always
   reading as an org-wide report. Both reuse filenameScope()'s already-
   derived bare scope name ("Sarpras" / unit name / employee name). ── */

/** "TIM/KARYAWAN SARPRAS PBSI" (all scope, unchanged) / "ENGINEERING"
    (unit) / "AHMAD" (employee) — the detail title's SUBJECT. */
function titleSubject(scope) {
  if (!scope || scope.type === 'all') return 'TIM/KARYAWAN SARPRAS PBSI';
  return filenameScope(scope).toUpperCase();
}

/** "Staf Sarpras" (all) / "Staf Engineering" (unit) / "Ahmad" (employee —
    "Staf" doesn't read naturally in front of one person's own name). */
function recapSubject(scope) {
  if (!scope || scope.type === 'all') return 'Staf Sarpras';
  if (scope.type === 'unit') return `Staf ${filenameScope(scope)}`;
  return filenameScope(scope);
}

/**
 * @param {Object} snapshot - svc.getReportSnapshot() output (must include detailRecords/employeeRows)
 * @param {{ generatedBy?:string, appVersion?:string, generatedAt?:number }} [meta]
 * @returns {Object} OvertimeReportModel — { meta, filters, dateGroups, detailGrandTotal, recapRows, recapGrandTotal, generatedAt, generatedBy, appVersion }
 */
export function buildOvertimeReportModel(snapshot, meta = {}) {
  const s = snapshot || {};
  const generatedAt = meta.generatedAt || Date.now();
  const periodLabel = s.periodLabel || '';
  const dateRangeLabel = s.dateRangeStart && s.dateRangeEnd ? `${s.dateRangeStart} s.d. ${s.dateRangeEnd}` : '—';
  const periodTitle = buildPeriodTitle(s.period, s.dateRangeStart, dateRangeLabel);

  const detail = buildDateGroups(s.detailRecords);
  const recap = buildRecapRows(s.employeeRows);

  const scopePart = safeFilenamePart(filenameScope(s.scope));
  const periodHumanPart = safeFilenamePart(filenamePeriodHuman(s.period, s.dateRangeStart, s.dateRangeEnd, periodTitle));
  const periodSortablePart = safeFilenamePart(filenamePeriodSortable(s.period, s.dateRangeStart, s.dateRangeEnd)) || periodHumanPart;

  return {
    meta: {
      org: 'Bidang Sarana dan Prasarana',
      orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
      detailTitle: `DATA PENGAJUAN LEMBUR ${titleSubject(s.scope)} PERIODE ${periodTitle.toUpperCase()}`,
      recapTitle: `Rekapitulasi Lembur ${recapSubject(s.scope)} Periode ${periodTitle}`,
      dateLabel: longDateID(generatedAt),
      filterLine: `Periode: ${periodLabel || '—'} · Cakupan: ${(s.scope && s.scope.label) || 'Semua Unit & Karyawan'}`,
      versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
      pdfFilename: `Laporan Lembur ${scopePart} - ${periodHumanPart}.pdf`,
      excelFilename: `Rekap Lembur ${scopePart} - ${periodSortablePart}.xlsx`,
      csvFilename: `Rekap Lembur ${scopePart} - ${periodSortablePart}.csv`,
    },
    filters: {
      periodLabel: periodLabel || '—',
      scopeLabel: (s.scope && s.scope.label) || 'Semua Unit & Karyawan',
      dateRangeLabel,
    },
    dateGroups: detail.groups,
    detailGrandTotal: detail.grandTotal,
    detailIsEmpty: detail.isEmpty,
    recapRows: recap.rows,
    recapGrandTotal: recap.grandTotal,
    recapIsEmpty: recap.isEmpty,
    generatedAt: longDateID(generatedAt),
    generatedBy: meta.generatedBy || '—',
    appVersion: meta.appVersion || '—',
  };
}
