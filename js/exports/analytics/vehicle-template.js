/* ============================================================
   VEHICLE-TEMPLATE.JS (client) — registers 'analytics-vehicle'

   Like the Driver template, build() only wraps the already-projected
   VehicleReportModel into the render envelope; the HTML is built
   server-side by the SAME components as the Driver report.

   The `data` passed to build() IS the VehicleReportModel produced by
   model/vehicle-report-model.js.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(reportModel) {
  return {
    __analyticsExport: true,
    payload: {
      templateId: 'analytics-vehicle',
      model: reportModel || {},
    },
  };
}

register('analytics-vehicle', {
  build,
  filename: () => `Laporan-Analitik-Armada-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Laporan Analitik Armada', label: 'Laporan Analitik Armada' },
});
