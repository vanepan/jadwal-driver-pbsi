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
  // v1.17.0 — Dispatch Intelligence Analytics. CLIENT-side blob (pdfmake / xlsx),
  // not the server doc-engine pipeline (different model). Deliberately excluded
  // from EXPORT_REPORT_ORDER so they don't appear in the operational Analytics
  // dropdown — the Dispatch Analytics dashboard owns its own export buttons and
  // resolves these by id.
  'dispatch-analytics-pdf': {
    id: 'dispatch-analytics-pdf',
    title: 'Dispatch Analytics (PDF)',
    description: 'Dashboard eksekutif Dispatch Intelligence sebagai PDF.',
    icon: ICONS.complete,
    template: 'dispatch-analytics',
    run: (meta = {}) => window.exportDispatchAnalyticsPdf(meta),
  },
  'dispatch-analytics-excel': {
    id: 'dispatch-analytics-excel',
    title: 'Dispatch Analytics (Excel)',
    description: 'Dashboard eksekutif Dispatch Intelligence sebagai workbook .xlsx.',
    icon: ICONS.complete,
    template: 'dispatch-analytics',
    run: (meta = {}) => window.exportDispatchAnalyticsExcel(meta),
  },
  // v1.17.1 — Recommendation Accuracy Engine. Same CLIENT-side blob pipeline
  // (pdfmake / xlsx) as Dispatch Analytics; also excluded from EXPORT_REPORT_ORDER
  // so it stays out of the operational Analytics dropdown — the Dispatch Analytics
  // dashboard owns the buttons and resolves these by id.
  'recommendation-accuracy-pdf': {
    id: 'recommendation-accuracy-pdf',
    title: 'Recommendation Accuracy (PDF)',
    description: 'Akurasi rekomendasi Dispatch Intelligence sebagai PDF.',
    icon: ICONS.complete,
    template: 'recommendation-accuracy',
    run: (meta = {}) => window.exportRecommendationAccuracyPdf(meta),
  },
  'recommendation-accuracy-excel': {
    id: 'recommendation-accuracy-excel',
    title: 'Recommendation Accuracy (Excel)',
    description: 'Akurasi rekomendasi Dispatch Intelligence sebagai workbook .xlsx.',
    icon: ICONS.complete,
    template: 'recommendation-accuracy',
    run: (meta = {}) => window.exportRecommendationAccuracyExcel(meta),
  },
  // v1.17.5 — Decision Replay & Explainable AI. Same CLIENT-side blob pipeline
  // (pdfmake / xlsx) as the analytics exports; excluded from EXPORT_REPORT_ORDER
  // so it stays out of the operational Analytics dropdown — the Decision Replay
  // drawer owns its own Export buttons and resolves these by id. No CSV.
  'decision-replay-pdf': {
    id: 'decision-replay-pdf',
    title: 'Decision Replay (PDF)',
    description: 'Replay keputusan Dispatch Intelligence sebagai PDF.',
    icon: ICONS.complete,
    template: 'decision-replay',
    run: (meta = {}) => window.exportDecisionReplayPdf(meta),
  },
  'decision-replay-excel': {
    id: 'decision-replay-excel',
    title: 'Decision Replay (Excel)',
    description: 'Replay keputusan Dispatch Intelligence sebagai workbook .xlsx.',
    icon: ICONS.complete,
    template: 'decision-replay',
    run: (meta = {}) => window.exportDecisionReplayExcel(meta),
  },
  // v1.17.6 — Driver Wellness Intelligence. Same CLIENT-side blob pipeline
  // (pdfmake / xlsx) as the analytics exports; excluded from EXPORT_REPORT_ORDER
  // so it stays out of the operational Analytics dropdown — the Driver Wellness
  // dashboard owns its own export buttons and resolves these by id. No CSV.
  'driver-wellness-pdf': {
    id: 'driver-wellness-pdf',
    title: 'Driver Wellness (PDF)',
    description: 'Dashboard kesehatan & keberlanjutan driver sebagai PDF.',
    icon: ICONS.driver,
    template: 'driver-wellness',
    run: (meta = {}) => window.exportDriverWellnessPdf(meta),
  },
  'driver-wellness-excel': {
    id: 'driver-wellness-excel',
    title: 'Driver Wellness (Excel)',
    description: 'Dashboard kesehatan & keberlanjutan driver sebagai workbook .xlsx.',
    icon: ICONS.driver,
    template: 'driver-wellness',
    run: (meta = {}) => window.exportDriverWellnessExcel(meta),
  },
  // v1.18.8 — Executive Analytics Report. The printable executive briefing that
  // AGGREGATES the sibling module outputs. Same CLIENT-side blob pipeline
  // (pdfmake / xlsx) as the analytics exports; excluded from EXPORT_REPORT_ORDER
  // so it stays out of the operational Analytics dropdown — the Executive
  // Analytics dashboard owns its own export buttons and resolves these by id.
  'executive-dashboard-pdf': {
    id: 'executive-dashboard-pdf',
    title: 'Executive Analytics (PDF)',
    description: 'Laporan eksekutif lintas modul sebagai PDF.',
    icon: ICONS.complete,
    template: 'executive-dashboard',
    run: (meta = {}) => window.exportExecutiveDashboardPdf(meta),
  },
  'executive-dashboard-excel': {
    id: 'executive-dashboard-excel',
    title: 'Executive Analytics (Excel)',
    description: 'Laporan eksekutif lintas modul — satu worksheet per modul.',
    icon: ICONS.complete,
    template: 'executive-dashboard',
    run: (meta = {}) => window.exportExecutiveDashboardExcel(meta),
  },
  // v1.20.2 — Engineering Analytics. Same CLIENT-side blob pipeline (pdfmake /
  // xlsx) as the sibling module dashboards; excluded from EXPORT_REPORT_ORDER so
  // it stays out of the operational Analytics dropdown — the Engineering Analytics
  // section owns its own export buttons and resolves these by id.
  'engineering-analytics-pdf': {
    id: 'engineering-analytics-pdf',
    title: 'Engineering Analytics (PDF)',
    description: 'Ringkasan operasional Engineering sebagai PDF.',
    icon: ICONS.complete,
    template: 'engineering-analytics',
    run: (meta = {}) => window.exportEngineeringAnalyticsPdf(meta),
  },
  'engineering-analytics-excel': {
    id: 'engineering-analytics-excel',
    title: 'Engineering Analytics (Excel)',
    description: 'Ringkasan operasional Engineering sebagai workbook .xlsx.',
    icon: ICONS.complete,
    template: 'engineering-analytics',
    run: (meta = {}) => window.exportEngineeringAnalyticsExcel(meta),
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

/* ── Lazy-loaded handler modules (v1.20.8, Objective 2/3) ──────────────────
   Every report's `run()` above delegates to a `window.export*()` hook that
   these modules attach as a side effect of being imported. They used to be
   static top-level imports in js/app.js, downloaded on every boot regardless
   of role. Converted to dynamic import(), following the exact map-of-loaders
   + cache idiom already proven by js/workspace/widget-registry.js's
   GROUP_LOADERS/loadGroup() — loaded once, on first actual export attempt,
   not before. Covers every EXPORT_REPORTS entry except 'engineeringanalytics'
   (still statically imported in app.js — a separate, not-yet-converted
   bundle; unaffected by this change). */
const EXPORT_MODULE_LOADERS = [
  () => import('./analytics/analytics-export-client.js'),
  () => import('./analytics/dispatch-analytics-export.js'),
  () => import('./analytics/recommendation-accuracy-export.js'),
  () => import('./analytics/decision-replay-export.js'),
  () => import('./analytics/driver-wellness-export.js'),
  () => import('./analytics/executive-dashboard-export.js'),
];
let _exportModulesPromise = null;
function ensureExportModulesLoaded() {
  if (!_exportModulesPromise) {
    _exportModulesPromise = Promise.all(EXPORT_MODULE_LOADERS.map((load) => load()));
  }
  return _exportModulesPromise;
}

/**
 * Run a report by id through its registered handler.
 * @param {string} id
 * @param {Object} [meta] optional overrides merged into the export meta.
 * @returns {Promise<{blob:Blob,filename:string}>}
 */
export async function runExportReport(id, meta = {}) {
  const report = getExportReport(id);
  if (!report) {
    throw new Error(`runExportReport: unknown report id "${id}".`);
  }
  await ensureExportModulesLoaded();
  return report.run(meta);
}
