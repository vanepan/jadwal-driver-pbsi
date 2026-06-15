/* ============================================================
   DRIVER-TEMPLATE.JS (client) — registers 'analytics-driver'

   Like the POC template, the client template does not build HTML
   — the HTML is built server-side from the DriverReportModel. Its
   build() wraps the already-projected report model into the render
   envelope the PuppeteerBackend ships to the Cloud Function.

   The `data` passed to build() IS the DriverReportModel produced by
   model/driver-report-model.js.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(reportModel) {
  return {
    __analyticsExport: true,
    payload: {
      templateId: 'analytics-driver',
      model: reportModel || {},
    },
  };
}

register('analytics-driver', {
  build,
  filename: () => `Laporan-Analitik-Pengemudi-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Laporan Analitik Pengemudi', label: 'Laporan Analitik Pengemudi' },
});
