/* ============================================================
   OVERTIME-EXPORT-RUNNER.JS — one export dispatcher, shared by the
   Report Builder AND Report History screens (Sprint 8)

   Both "export this snapshot now" (Reports) and "regenerate this old
   report" (Report History) end up needing the exact same
   format -> exporter dispatch. Factored out once so neither screen
   duplicates it.
   ============================================================ */

'use strict';

import { downloadCsv } from './overtime-atoms.js';
import { buildOvertimeReportModel } from '../../exports/analytics/model/overtime-report-model.js';
import { exportOvertimeReport } from '../../exports/analytics/analytics-export-client.js';
import { exportOvertimeExcel } from '../overtime-excel-exporter.js';

/**
 * @param {'pdf'|'excel'|'csv'|'print'} format
 * @param {Object} snapshot - svc.getReportSnapshot() output
 * @param {{ generatedBy?:string, appVersion?:string }} [meta]
 */
export async function runOvertimeExport(format, snapshot, meta = {}) {
  if (format === 'excel') {
    const reportModel = buildOvertimeReportModel(snapshot, meta);
    await exportOvertimeExcel(reportModel);
    return;
  }
  if (format === 'csv') {
    // Same canonical two-section shape as PDF/Excel (date-grouped detail
    // with subtotals + grand total, then the alphabetical recap + Total
    // Keseluruhan) — CSV is one flat file, so the two sections run
    // sequentially with a blank-row separator instead of side-by-side.
    const model = buildOvertimeReportModel(snapshot, meta);
    const rows = [];
    rows.push([model.meta.detailTitle]);
    rows.push(['No', 'Hari, Tanggal', 'Nama', 'Bidang', 'Rincian', 'Total']);
    model.dateGroups.forEach(g => {
      g.rows.forEach((r, i) => {
        rows.push([r.no, i === 0 ? g.dateLabel : '', r.employeeName, r.unitName, r.amount, i === 0 ? g.subtotal : '']);
      });
    });
    rows.push(['', '', '', '', 'TOTAL KESELURUHAN', model.detailGrandTotal]);
    rows.push([]);
    rows.push([model.meta.recapTitle]);
    rows.push(['No', 'Nama', 'Jumlah Hari', 'Jumlah Lemburan', 'Bidang']);
    model.recapRows.forEach(r => rows.push([r.no, r.name, r.days, r.amount, r.unitName]));
    rows.push(['', 'Total Keseluruhan', '', model.recapGrandTotal, '']);

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`laporan-overtime-${stamp}.csv`, rows[0], rows.slice(1));
    return;
  }
  // 'pdf' and 'print' both just open the PDF viewer — Print's "Cetak" button
  // is inherited for free from document-viewer.js once the viewer is open.
  await exportOvertimeReport(snapshot, meta);
}
