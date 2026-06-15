/* ============================================================
   BIDANG-TEMPLATE.JS (client) — registers 'analytics-bidang'

   Like the Driver/Vehicle templates, build() only wraps the
   already-projected BidangReportModel into the render envelope; the
   HTML is built server-side reusing the single-report composer (with
   the BidangStatusStrip in Zone C).

   The `data` passed to build() IS the BidangReportModel produced by
   model/bidang-report-model.js.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(reportModel) {
  return {
    __analyticsExport: true,
    payload: {
      templateId: 'analytics-bidang',
      model: reportModel || {},
    },
  };
}

register('analytics-bidang', {
  build,
  filename: () => `Laporan-Analitik-Bidang-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Laporan Analitik Bidang', label: 'Laporan Analitik Bidang' },
});
