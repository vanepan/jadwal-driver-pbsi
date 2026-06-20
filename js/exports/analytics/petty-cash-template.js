/* ============================================================
   PETTY-CASH-TEMPLATE.JS (client) — registers 'analytics-petty-cash'

   Like the other analytics templates, the HTML is built server-side from
   the PettyCashReportModel. build() wraps the projected model in the render
   envelope the PuppeteerBackend ships to the Cloud Function.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(reportModel) {
  return {
    __analyticsExport: true,
    payload: { templateId: 'analytics-petty-cash', model: reportModel || {} },
  };
}

register('analytics-petty-cash', {
  build,
  filename: () => `Laporan-Analitik-Petty-Cash-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Laporan Analitik Petty Cash', label: 'Laporan Analitik Petty Cash' },
});
