/* ============================================================
   NOR-EXCEL-EXPORTER.JS — XLSX workbooks (3-sheet, styled)

   Real .xlsx output (never CSV). Uses xlsx-js-style — the
   style-capable SheetJS fork — lazy-loaded from CDN once per
   session, mirroring the pdfmake loader in js/docs/pdf-exporter.js.

   Workbook structure (both the NOR export and the expense-list
   export share it, scoped differently):
     Sheet 1 — Rincian Pengeluaran   (line items, currency, borders)
     Sheet 2 — Ringkasan NOR         (balances, terbilang, signers)
     Sheet 3 — Audit Trail           (user · action · timestamp)

   Features: bold maroon headers, Rp currency formatting, autofit
   columns, thin table borders.
   ============================================================ */

'use strict';

import {
  getSettings, getActiveCycle, getNors, getAudit, getExpenseById,
} from './petty-cash-store.js';
import { activeExpenses, recordNorExport } from './petty-cash-service.js';
import {
  fmtShort, fmtLong, terbilangCap, unitDisplay, splitList, AUDIT_LABEL, todayISO,
  REIMBURSE_ITEMS, isReimburseExpense,
} from './petty-cash-config.js';

const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
let _xlsxPromise = null;

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
function loadXLSX() {
  if (window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = _loadScript(XLSX_SRC).then(() => {
    if (!window.XLSX) throw new Error('XLSX global missing after load');
    return window.XLSX;
  });
  return _xlsxPromise;
}

/* ── Style tokens ────────────────────────────────────────────────── */
const MAROON = '9A1B2D';
const FILL_HEAD = { fgColor: { rgb: MAROON } };
const FILL_TINT = { fgColor: { rgb: 'F0E2E4' } };
const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'B0B0B0' } },
  bottom: { style: 'thin', color: { rgb: 'B0B0B0' } },
  left: { style: 'thin', color: { rgb: 'B0B0B0' } },
  right: { style: 'thin', color: { rgb: 'B0B0B0' } },
};
const RP_FMT = '"Rp" #,##0';

const S = {
  title: { font: { bold: true, sz: 15 }, alignment: { horizontal: 'center' } },
  sub: { alignment: { horizontal: 'center' } },
  head: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: FILL_HEAD, alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER_THIN },
  cell: { border: BORDER_THIN, alignment: { vertical: 'center' } },
  cellC: { border: BORDER_THIN, alignment: { horizontal: 'center', vertical: 'center' } },
  money: { border: BORDER_THIN, alignment: { horizontal: 'right' }, numFmt: RP_FMT },
  total: { font: { bold: true }, fill: FILL_TINT, border: BORDER_THIN, alignment: { horizontal: 'right' } },
  totalMoney: { font: { bold: true }, fill: FILL_TINT, border: BORDER_THIN, alignment: { horizontal: 'right' }, numFmt: RP_FMT },
  key: { font: { bold: true } },
};

/* Cell factory: text / number with a style. */
const T = (v, s) => ({ v: v == null ? '' : v, t: 's', s: s || S.cell });
const N = (v, s) => ({ v: Number(v || 0), t: 'n', s: s || S.money });

/** Build a worksheet from an array-of-rows (each cell = {v,t,s} or string). */
function sheetFromAOA(XLSX, aoa, colWidths, merges) {
  const norm = aoa.map(row => row.map(c => (c && typeof c === 'object' && 't' in c) ? c : T(c, { alignment: {} })));
  const ws = XLSX.utils.aoa_to_sheet(norm.map(r => r.map(c => c.v)));
  // Re-attach cell objects (styles/types) after aoa_to_sheet flattened values.
  norm.forEach((row, r) => row.forEach((c, col) => {
    const addr = XLSX.utils.encode_cell({ r, c: col });
    ws[addr] = { v: c.v, t: c.t || 's', s: c.s };
  }));
  if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
  if (merges) ws['!merges'] = merges;
  return ws;
}

/* ── Sheet 1: Rincian Pengeluaran ────────────────────────────────── */
/* Explicit reimbursement component columns (BBM · Tol · Parkir · Lembur ·
   Others) sit between Keterangan and Biaya. Only reimbursement rows populate
   them; every other expense leaves them blank. Biaya (Rp) remains the single
   total — components are not re-summed. (v1.17.4.1) */
function rincianSheet(XLSX, rows, title) {
  const reimburseHeads = REIMBURSE_ITEMS.map(it => it.label);
  const header = [
    'No', 'Ref', 'Tanggal', 'Unit', 'Kategori', 'Rincian', 'Keterangan',
    ...reimburseHeads, 'Biaya (Rp)', 'Status',
  ];
  const lastCol = header.length - 1;
  const aoa = [
    [T('PENGURUS BESAR PBSI', S.title)],
    [T('Bidang Sarana dan Prasarana', S.sub)],
    [T(title, { font: { bold: true, sz: 13 }, alignment: { horizontal: 'center' } })],
    [],
    header.map(h => T(h, S.head)),
  ];
  let total = 0;
  rows.forEach((e, i) => {
    total += e.amount || 0;
    const rd = (isReimburseExpense(e) && e.reimbursementDetail) ? e.reimbursementDetail : null;
    const reimburseCells = REIMBURSE_ITEMS.map(it =>
      rd ? N(Number(rd[it.key]) || 0, S.money) : T('', S.cell));
    aoa.push([
      T(i + 1, S.cellC), T(e.refNumber, S.cell), T(fmtShort(e.expenseDate || e.date), S.cellC),
      T(unitDisplay(e), S.cell), T(e.category, S.cell), T(e.description, S.cell),
      T(e.notes || '—', S.cell), ...reimburseCells, N(e.amount, S.money),
      T(e.status === 'locked' ? 'Termasuk NOR' : e.status === 'archived' ? 'Arsip' : 'Tersedia', S.cellC),
    ]);
  });
  aoa.push([
    T('TOTAL', S.total), T('', S.total), T('', S.total), T('', S.total), T('', S.total),
    T('', S.total), T('', S.total), ...REIMBURSE_ITEMS.map(() => T('', S.total)),
    N(total, S.totalMoney), T('', S.total),
  ]);
  const widths = [5, 14, 13, 16, 18, 34, 18, ...REIMBURSE_ITEMS.map(() => 12), 15, 13];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
  ];
  return sheetFromAOA(XLSX, aoa, widths, merges);
}

/* ── Sheet 2: Ringkasan NOR ──────────────────────────────────────── */
function ringkasanSheet(XLSX, summary) {
  const aoa = [
    [T('RINGKASAN NOTA ORGANISASI', S.title)],
    [],
    [T('Nomor NOR', S.key), T(summary.norNumber || '-', S.cell)],
    [T('Tanggal NOR', S.key), T(summary.norDate ? fmtLong(summary.norDate) : '-', S.cell)],
    [T('Perihal', S.key), T(summary.subject || '-', S.cell)],
    [],
    [T('Dana Awal', S.key), N(summary.opening, S.money)],
    [T('Dana Terealisasi', S.key), N(summary.realized, S.money)],
    [T('Sisa Dana', S.key), N(summary.remaining, S.money)],
    [T('Terbilang', S.key), T(terbilangCap(summary.remaining), S.cell)],
    [],
    [T('Kepada Yth.', S.key), T(splitList(summary.recipients).join(', '), S.cell)],
    [T('Tembusan', S.key), T(splitList(summary.cc).join(', '), S.cell)],
    [],
    [T('Penandatangan', S.head), T('Nama', S.head), T('Jabatan', S.head)],
    ...(summary.signatories || []).map(s => [T(s.label, S.cell), T(s.name, S.cell), T(s.position, S.cell)]),
  ];
  return sheetFromAOA(XLSX, aoa, [22, 28, 28], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]);
}

/* ── Sheet 3: Audit Trail ────────────────────────────────────────── */
function auditSheet(XLSX, entries) {
  const aoa = [
    [T('AUDIT TRAIL', S.title)],
    [],
    [T('Waktu', S.head), T('User', S.head), T('Aksi', S.head), T('Keterangan', S.head)],
    ...entries.map(a => [
      T(new Date(a.timestamp).toLocaleString('id-ID'), S.cell),
      T(a.user || '-', S.cell),
      T(a.label || AUDIT_LABEL[a.action] || a.action, S.cell),
      T(a.note || '', S.cell),
    ]),
  ];
  return sheetFromAOA(XLSX, aoa, [22, 22, 26, 44], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]);
}

function download(XLSX, wb, filename) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
}

/* ── Public: NOR workbook ────────────────────────────────────────── */
export async function exportNorExcel(nor) {
  const XLSX = await loadXLSX();
  const settings = getSettings();
  const rows = (nor.items || []).map(it => {
    // Reimbursement detail is resolved live from the source expense (the snapshot
    // never stored it) so the component columns can populate. Read-only — the
    // amount/total still come from the snapshot. (v1.17.4.1)
    const exp = it.expenseId ? getExpenseById(it.expenseId) : null;
    return {
      refNumber: it.refNumber || '-', expenseDate: it.expenseDate || it.date,
      unit: it.unit, category: it.category || '-', description: it.description || it.desc,
      notes: it.keterangan || it.ket, amount: it.amount, status: 'locked',
      reimbursementDetail: (exp && isReimburseExpense(exp)) ? exp.reimbursementDetail : null,
    };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, rincianSheet(XLSX, rows, 'NOTA ORGANISASI REALISASI PETTY CASH'), 'Rincian Pengeluaran');
  XLSX.utils.book_append_sheet(wb, ringkasanSheet(XLSX, {
    norNumber: nor.norNumber, norDate: nor.norDate, subject: nor.subject,
    opening: nor.openingBalance, realized: nor.realizedAmount, remaining: nor.remainingBalance,
    recipients: settings.recipients, cc: settings.ccRecipients,
    signatories: (settings.signatories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
  }), 'Ringkasan NOR');
  const auditEntries = getAudit().filter(a =>
    (a.entityType === 'nor' && a.entityId === nor.id) ||
    (a.entityType === 'expense' && (nor.expenseIds || []).includes(a.entityId)),
  ).sort((a, b) => a.timestamp - b.timestamp);
  XLSX.utils.book_append_sheet(wb, auditSheet(XLSX, auditEntries), 'Audit Trail');

  const fn = `NOR-${String(nor.norNumber || '').replace(/[^a-z0-9]/gi, '-')}.xlsx`;
  download(XLSX, wb, fn);
  try { await recordNorExport(nor.id, 'Excel'); } catch (e) { /* best-effort */ }
  return fn;
}

/* ── Public: current-cycle expense workbook ──────────────────────── */
export async function exportExpensesExcel() {
  const XLSX = await loadXLSX();
  const settings = getSettings();
  const cycle = getActiveCycle();
  const rows = activeExpenses();
  const realized = rows.reduce((a, e) => a + (e.amount || 0), 0);
  const opening = cycle ? cycle.openingBalance : settings.openingBalance;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, rincianSheet(XLSX, rows, `LAPORAN PETTY CASH — SIKLUS #${cycle ? cycle.cycleNumber : '-'}`), 'Rincian Pengeluaran');
  XLSX.utils.book_append_sheet(wb, ringkasanSheet(XLSX, {
    norNumber: `Siklus #${cycle ? cycle.cycleNumber : '-'}`,
    norDate: todayISO(),
    subject: `Laporan realisasi petty cash siklus berjalan (per ${fmtLong(todayISO())})`,
    opening, realized, remaining: opening - realized,
    recipients: settings.recipients, cc: settings.ccRecipients,
    signatories: (settings.signatories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
  }), 'Ringkasan NOR');
  XLSX.utils.book_append_sheet(wb, auditSheet(XLSX, getAudit().slice().sort((a, b) => a.timestamp - b.timestamp)), 'Audit Trail');

  const fn = `Laporan-PettyCash-Siklus-${cycle ? cycle.cycleNumber : 'NA'}.xlsx`;
  download(XLSX, wb, fn);
  return fn;
}
