/* ============================================================
   EXPORT-REGISTRY.JS — single source of truth for every report
   export in the platform (v1.12.1A — Export Registry Foundation).

   This registry is intentionally UI-agnostic. It only describes
   *what* reports exist and *how* to run them; it does not own any
   PDF rendering, analytics calculation, Cloud Function, or
   template code. Each handler delegates to the already-validated
   window.export*Analytics() pipeline, so behavior is identical to
   the previous hardcoded dropdown mapping.

   Consumers (current + planned):
     • Analytics Export dropdown   (app.js — runAnalyticsExport)
     • Export Center               (planned)
     • Export History              (planned)
     • Scheduled Exports           (planned)
     • Report Archive              (planned)

   Adding a new report = add one entry here. Nothing else needs to
   know the id→title→handler mapping.
   ============================================================ */

'use strict';

/* Inline SVG icons (24×24, currentColor stroke) for use by future
   card/list UIs (Export Center, History). The current dropdown is
   text-only and does not render these — kept here so every consumer
   can share one icon definition per report. */
const ICONS = {
  driver:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  vehicle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bidang:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  complete:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>',
};

/**
 * @typedef {Object} ExportReport
 * @property {string}   id           Stable key (used by UI data-report, history records, schedules).
 * @property {string}   title        Human label (Indonesian) shown in menus/cards.
 * @property {string}   description  One-line summary for card/tooltip UIs.
 * @property {string}   icon         Inline SVG markup (currentColor) for card/list UIs.
 * @property {string}   template     doc-engine template id this report renders through.
 * @property {(meta?:Object)=>Promise<{blob:Blob,filename:string}>} run
 *           Export handler. Delegates to the validated window.export*Analytics()
 *           pipeline, which reads the live analytics model + export meta that
 *           refreshAnalyticsDisplay() publishes. Optional `meta` is merged on top.
 */

/** @type {Record<string, ExportReport>} */
export const EXPORT_REPORTS = {
  driver: {
    id: 'driver',
    title: 'Laporan Pengemudi',
    description: 'Analitik kinerja per pengemudi: aktivitas, kontribusi, dan sorotan.',
    icon: ICONS.driver,
    template: 'analytics-driver',
    run: (meta = {}) => window.exportDriverAnalytics(meta),
  },
  vehicle: {
    id: 'vehicle',
    title: 'Laporan Armada',
    description: 'Analitik utilisasi armada: penggunaan kendaraan dan kontributor utama.',
    icon: ICONS.vehicle,
    template: 'analytics-vehicle',
    run: (meta = {}) => window.exportVehicleAnalytics(meta),
  },
  bidang: {
    id: 'bidang',
    title: 'Laporan Bidang',
    description: 'Analitik per bidang: status terpenuhi/menunggu dan jarak tempuh.',
    icon: ICONS.bidang,
    template: 'analytics-bidang',
    run: (meta = {}) => window.exportBidangAnalytics(meta),
  },
  complete: {
    id: 'complete',
    title: 'Laporan Lengkap',
    description: 'Laporan gabungan 5 halaman: seluruh dimensi + Health Score.',
    icon: ICONS.complete,
    template: 'analytics-complete',
    run: (meta = {}) => window.exportCompleteAnalytics(meta),
  },
};

/** Stable display/menu order for every consumer. */
export const EXPORT_REPORT_ORDER = ['driver', 'vehicle', 'bidang', 'complete'];

/**
 * Look up a single report definition.
 * @param {string} id
 * @returns {ExportReport|null}
 */
export function getExportReport(id) {
  return EXPORT_REPORTS[id] || null;
}

/**
 * All report definitions in stable display order.
 * @returns {ExportReport[]}
 */
export function listExportReports() {
  return EXPORT_REPORT_ORDER
    .map((id) => EXPORT_REPORTS[id])
    .filter(Boolean);
}

/**
 * Run a report by id through its registered handler.
 * @param {string} id
 * @param {Object} [meta] optional overrides merged into the export meta.
 * @returns {Promise<{blob:Blob,filename:string}>}
 */
export function runExportReport(id, meta = {}) {
  const report = getExportReport(id);
  if (!report) {
    return Promise.reject(new Error(`runExportReport: unknown report id "${id}".`));
  }
  return report.run(meta);
}
