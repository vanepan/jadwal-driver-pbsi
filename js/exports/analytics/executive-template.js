/* ============================================================
   EXECUTIVE-TEMPLATE.JS (client) — registers 'analytics-executive'

   HTML built server-side from the ExecutiveReportModel. build() wraps the
   projected model in the render envelope shipped to the Cloud Function.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(reportModel) {
  return {
    __analyticsExport: true,
    payload: { templateId: 'analytics-executive', model: reportModel || {} },
  };
}

register('analytics-executive', {
  build,
  filename: () => `Laporan-Eksekutif-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Laporan Eksekutif Operasional', label: 'Laporan Eksekutif Operasional' },
});
