/* ============================================================
   COMPLETE-TEMPLATE.JS (client) — registers 'analytics-complete'

   Like the other report templates, build() only wraps the
   already-projected CompleteReportModel into the render envelope; the
   5-page HTML is built server-side (report/reports/complete-report.js)
   reusing all existing zone/body components.

   The `data` passed to build() IS the CompleteReportModel produced by
   model/complete-report-model.js.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(reportModel) {
  return {
    __analyticsExport: true,
    payload: {
      templateId: 'analytics-complete',
      model: reportModel || {},
    },
  };
}

register('analytics-complete', {
  build,
  filename: () => `Laporan-Analitik-Lengkap-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Laporan Analitik Lengkap', label: 'Laporan Analitik Lengkap' },
});
