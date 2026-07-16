/* ============================================================
   OVERTIME-EXCEL-EXPORTER.JS — XLSX workbook, canonical layout
   (UX Refinement — replaces Sprint 8's Ringkasan/Rincian/Audit Trail
   3-sheet structure)

   Mirrors js/petty-cash/nor-excel-exporter.js's structure and style
   tokens (bold header row, Rp currency numFmt, autofit column widths,
   thin borders, merged cells for grouped rows) — each module owns its
   own Excel exporter in this codebase (no shared workbook builder
   exists to import). Excel is if anything the MORE natural home for
   exact fidelity to the source spreadsheet, since it's the same format.

   Sheet 1 — "Data Pengajuan"   (date-grouped detail, merged Hari/Total
                                  cells matching the source sheet's
                                  merged-cell layout exactly, grand total)
   Sheet 2 — "Rekapitulasi"     (alphabetical per-employee recap,
                                  Total Keseluruhan)

   The prior Audit Trail sheet is dropped — it wasn't part of the
   canonical layout; audit stays reachable via the module's existing
   Audit Trail elsewhere in the app.
   ============================================================ */

'use strict';

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

/* ── Style tokens (matches nor-excel-exporter.js's palette) ───────── */
const MAROON = '9A1B2D';
const FILL_HEAD = { fgColor: { rgb: MAROON } };
// FIX 18 — was a light pink/red tint ('F0E2E4'), which read too close to
// an alert/error colour once seen alongside the equivalent PDF bug; now
// the same neutral light-gray fill the module's own overtime.css uses for
// its page background ('--bg: #f3f2ef'), NOT a distinct accent color —
// elegant, unmistakably "Sarpras Operations", never reads as an error
// state. Used for both per-date subtotal cells and the Grand Total row.
const FILL_TINT = { fgColor: { rgb: 'F3F2EF' } };
const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: 'B0B0B0' } },
  bottom: { style: 'thin', color: { rgb: 'B0B0B0' } },
  left: { style: 'thin', color: { rgb: 'B0B0B0' } },
  right: { style: 'thin', color: { rgb: 'B0B0B0' } },
};
// FIX 18 — "border atas maroon PBSI": a heavier maroon top rule, reserved
// for the Grand Total row ONLY (not per-date subtotals), mirroring the
// PDF template's own heavier top rule for the same row.
const BORDER_TOTAL = { ...BORDER_THIN, top: { style: 'medium', color: { rgb: MAROON } } };
const RP_FMT = '"Rp" #,##0';

const S = {
  title: { font: { bold: true, sz: 15 }, alignment: { horizontal: 'center' } },
  sub: { alignment: { horizontal: 'center' } },
  sectionTitle: { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } },
  head: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: FILL_HEAD, alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER_THIN },
  cell: { border: BORDER_THIN, alignment: { vertical: 'center' } },
  cellC: { border: BORDER_THIN, alignment: { horizontal: 'center', vertical: 'center' } },
  money: { border: BORDER_THIN, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: RP_FMT },
  // Per-date SUBTOTAL cells (dataPengajuanSheet) — thin border, unchanged.
  total: { font: { bold: true }, fill: FILL_TINT, border: BORDER_THIN, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: RP_FMT },
  // FIX 6/18 — the Grand Total ROW's own label cells ("TOTAL KESELURUHAN"/
  // "Total Keseluruhan"), separated from the per-date subtotal style above
  // so ONLY this row gets the heavier maroon top rule — a partial-width
  // thick border (just the amount cell) would look broken.
  totalRow: { font: { bold: true }, fill: FILL_TINT, border: BORDER_TOTAL, alignment: { horizontal: 'right', vertical: 'center' } },
  // Grand Total ROW's own NUMBER cell: bigger, maroon-accented figure, same
  // neutral fill + heavier top rule as its label — reads as the sheet's
  // headline number without ever looking like an alert/error state.
  totalAmount: { font: { bold: true, sz: 12, color: { rgb: MAROON } }, fill: FILL_TINT, border: BORDER_TOTAL, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: RP_FMT },
};

const T = (v, s) => ({ v: v == null ? '' : v, t: 's', s: s || S.cell });
const N = (v, s) => ({ v: Number(v || 0), t: 'n', s: s || S.money });

/** @param {number[]} [tallRowIdx] - 0-based row indices to render at FIX 4/6's
    "sedikit lebih proporsional" height (header + grand total rows). */
function sheetFromAOA(XLSX, aoa, colWidths, merges, tallRowIdx) {
  const norm = aoa.map(row => row.map(c => (c && typeof c === 'object' && 't' in c) ? c : T(c, { alignment: {} })));
  const ws = XLSX.utils.aoa_to_sheet(norm.map(r => r.map(c => c.v)));
  norm.forEach((row, r) => row.forEach((c, col) => {
    const addr = XLSX.utils.encode_cell({ r, c: col });
    ws[addr] = { v: c.v, t: c.t || 's', s: c.s };
  }));
  if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
  if (merges) ws['!merges'] = merges;
  if (tallRowIdx && tallRowIdx.length) {
    const rowsMeta = [];
    tallRowIdx.forEach(r => { rowsMeta[r] = { hpx: 22 }; });
    ws['!rows'] = rowsMeta;
  }
  return ws;
}

/* Report-model rows already carry formatted "Rp1.234" strings (built by
   overtime-report-model.js) — unrp() recovers the raw number so Excel gets
   a real numeric currency cell (numFmt), not a formatted string. */
function unrp(formatted) {
  return Number(String(formatted).replace(/[^\d-]/g, '')) || 0;
}

/* ── Sheet 1: Data Pengajuan — date-grouped, merged Hari/Total cells ── */
function dataPengajuanSheet(XLSX, vm) {
  const title = (vm.meta && vm.meta.detailTitle) || 'DATA PENGAJUAN LEMBUR';
  const aoa = [
    [T('PENGURUS BESAR PBSI', S.title)],
    [T('Bidang Sarana dan Prasarana', S.sub)],
    [T(title, S.sectionTitle)],
    [],
    [T('No', S.head), T('Hari, Tanggal', S.head), T('Nama', S.head), T('Unit', S.head), T('Rincian', S.head), T('Total', S.head)],
  ];
  const headerRow = aoa.length - 1;
  const merges = [];
  const groups = vm.dateGroups || [];

  if (!groups.length) {
    aoa.push([T('Tidak ada entri pada periode ini.'), T(''), T(''), T(''), T(''), T('')]);
  } else {
    groups.forEach(g => {
      const startRow = aoa.length;
      g.rows.forEach((r, i) => {
        aoa.push([
          T(r.no, S.cellC),
          i === 0 ? T(g.dateLabel, S.cell) : T('', S.cell),
          T(r.employeeName, S.cell),
          T(r.unitName, S.cell),
          N(unrp(r.amount), S.money),
          i === 0 ? N(unrp(g.subtotal), S.total) : T('', S.cell),
        ]);
      });
      if (g.rows.length > 1) {
        const endRow = aoa.length - 1;
        merges.push({ s: { r: startRow, c: 1 }, e: { r: endRow, c: 1 } }); // Hari, Tanggal
        merges.push({ s: { r: startRow, c: 5 }, e: { r: endRow, c: 5 } }); // Total (subtotal)
      }
    });
    aoa.push([
      T('TOTAL KESELURUHAN', S.totalRow), T('', S.totalRow), T('', S.totalRow), T('', S.totalRow), T('', S.totalRow),
      N(unrp(vm.detailGrandTotal), S.totalAmount),
    ]);
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 4 } });
  }

  return sheetFromAOA(XLSX, aoa, [6, 24, 24, 16, 14, 16], merges, [headerRow, aoa.length - 1]);
}

/* ── Sheet 2: Rekapitulasi — alphabetical, Total Keseluruhan ─────── */
function rekapitulasiSheet(XLSX, vm) {
  const title = (vm.meta && vm.meta.recapTitle) || 'Rekapitulasi Lembur';
  const aoa = [
    [T('PENGURUS BESAR PBSI', S.title)],
    [T('Bidang Sarana dan Prasarana', S.sub)],
    [T(title, S.sectionTitle)],
    [],
    [T('No', S.head), T('Nama', S.head), T('Jumlah Hari', S.head), T('Jumlah Lemburan', S.head), T('Unit', S.head)],
  ];
  const headerRow = aoa.length - 1;
  const rows = vm.recapRows || [];
  if (!rows.length) {
    aoa.push([T('Tidak ada data karyawan pada periode ini.'), T(''), T(''), T(''), T('')]);
  } else {
    rows.forEach(r => aoa.push([
      T(r.no, S.cellC), T(r.name, S.cell), T(r.days, S.cellC), N(unrp(r.amount), S.money), T(r.unitName, S.cell),
    ]));
    aoa.push([T('Total Keseluruhan', S.totalRow), T('', S.totalRow), T('', S.totalRow), N(unrp(vm.recapGrandTotal), S.totalAmount), T('', S.totalRow)]);
  }
  return sheetFromAOA(XLSX, aoa, [6, 26, 12, 18, 20], undefined, [headerRow, aoa.length - 1]);
}

/**
 * @param {Object} reportModel - overtime-report-model.js's buildOvertimeReportModel() output
 * @returns {Promise<void>} triggers a browser download
 */
export async function exportOvertimeExcel(reportModel) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, dataPengajuanSheet(XLSX, reportModel), 'Data Pengajuan');
  XLSX.utils.book_append_sheet(wb, rekapitulasiSheet(XLSX, reportModel), 'Rekapitulasi');

  // "Rekap Lembur {Scope} - {yyyy-MM}.xlsx" (Production Polish FIX 3) —
  // computed once in overtime-report-model.js, shared with the PDF/CSV
  // exporters so all three formats name a file the same way.
  const filename = (reportModel.meta && reportModel.meta.excelFilename) || 'Rekap Lembur Sarpras.xlsx';
  XLSX.writeFile(wb, filename);
}
