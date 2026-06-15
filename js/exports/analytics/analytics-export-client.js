/* ============================================================
   ANALYTICS-EXPORT-CLIENT.JS — client trigger for the Phase A
   Analytics Export foundation.

   Drives the full approved pipeline:
     Browser → DocumentEngine → PuppeteerBackend → Cloud Function
     → Puppeteer → PDF Blob → DocumentViewer

   Phase A exposes only the foundation proof-of-concept. It is
   intentionally NOT wired to any UI button yet (Driver Analytics
   and the Export Center wiring come later). For verification it
   is reachable from the console as window.exportAnalyticsPoc().
   ============================================================ */

'use strict';

import * as DocumentEngine from '../../docs/doc-engine.js';
import './poc-template.js';    // self-registers 'analytics-export-poc'
import './driver-template.js';  // self-registers 'analytics-driver'
import './vehicle-template.js'; // self-registers 'analytics-vehicle'
import './bidang-template.js';   // self-registers 'analytics-bidang'
import './complete-template.js'; // self-registers 'analytics-complete'
import { buildDriverReportModel } from './model/driver-report-model.js';
import { buildVehicleReportModel } from './model/vehicle-report-model.js';
import { buildBidangReportModel } from './model/bidang-report-model.js';
import { buildCompleteReportModel } from './model/complete-report-model.js';

/**
 * Generate the A4 foundation POC via the Puppeteer backend and open it
 * in the shared DocumentViewer.
 * @param {Object} [model] optional overrides (periodLabel, dateLabel, …)
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportAnalyticsPoc(model = {}) {
  return DocumentEngine.generateAndOpen('analytics-export-poc', model, {
    backend: 'puppeteer',
    cache: false, // always re-render during foundation verification
    viewer: { title: 'Analytics Export — A4 Foundation POC' },
  });
}

/**
 * Project an AnalyticsModel into the Driver report, render it server-side
 * via headless Chrome, and open it in the shared DocumentViewer.
 * The full pipeline: AnalyticsModel → DriverReportModel (here) →
 * DocumentEngine → PuppeteerBackend → Cloud Function → PDF Blob → Viewer.
 *
 * @param {import('../../analytics/analytics-types.js').AnalyticsModel} analyticsModel
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string} }} [meta]
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportDriverAnalytics(analyticsModel, meta = {}) {
  if (!analyticsModel || !analyticsModel.kpis) {
    throw new Error('exportDriverAnalytics: AnalyticsModel required.');
  }
  const reportModel = buildDriverReportModel(analyticsModel, meta);
  return DocumentEngine.generateAndOpen('analytics-driver', reportModel, {
    backend: 'puppeteer',
    cache: false,
    viewer: { title: 'Laporan Analitik Pengemudi' },
  });
}

/**
 * Project an AnalyticsModel into the Vehicle report, render it server-side
 * via headless Chrome, and open it in the shared DocumentViewer. Same
 * pipeline as the Driver export — only the projection differs.
 *
 * @param {import('../../analytics/analytics-types.js').AnalyticsModel} analyticsModel
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string} }} [meta]
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportVehicleAnalytics(analyticsModel, meta = {}) {
  if (!analyticsModel || !analyticsModel.kpis) {
    throw new Error('exportVehicleAnalytics: AnalyticsModel required.');
  }
  const reportModel = buildVehicleReportModel(analyticsModel, meta);
  return DocumentEngine.generateAndOpen('analytics-vehicle', reportModel, {
    backend: 'puppeteer',
    cache: false,
    viewer: { title: 'Laporan Analitik Armada' },
  });
}

/**
 * Project an AnalyticsModel into the Bidang report, render it server-side
 * via headless Chrome, and open it in the shared DocumentViewer. Same
 * pipeline as the Driver/Vehicle exports — only the projection differs
 * (Zone C is the fulfilled/waiting status strip). `meta.bidangKm` carries
 * the app's per-bidang distance aggregation (Sprint 7C).
 *
 * @param {import('../../analytics/analytics-types.js').AnalyticsModel} analyticsModel
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string},
 *           bidangKm?:Object.<string,number> }} [meta]
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportBidangAnalytics(analyticsModel, meta = {}) {
  if (!analyticsModel || !analyticsModel.render) {
    throw new Error('exportBidangAnalytics: AnalyticsModel required.');
  }
  const reportModel = buildBidangReportModel(analyticsModel, meta);
  return DocumentEngine.generateAndOpen('analytics-bidang', reportModel, {
    backend: 'puppeteer',
    cache: false,
    viewer: { title: 'Laporan Analitik Bidang' },
  });
}

/**
 * Project an AnalyticsModel into the 5-page Complete report, render it
 * server-side via headless Chrome, and open it in the shared
 * DocumentViewer. Same pipeline as the single reports; the projection
 * aggregates all dimensions + Health Score. `meta.bidangKm` /
 * `meta.dateRangeKey` carry the app's per-bidang distance + period key.
 *
 * @param {import('../../analytics/analytics-types.js').AnalyticsModel} analyticsModel
 * @param {Object} [meta]
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportCompleteAnalytics(analyticsModel, meta = {}) {
  if (!analyticsModel || !analyticsModel.kpis) {
    throw new Error('exportCompleteAnalytics: AnalyticsModel required.');
  }
  const reportModel = buildCompleteReportModel(analyticsModel, meta);
  return DocumentEngine.generateAndOpen('analytics-complete', reportModel, {
    backend: 'puppeteer',
    cache: false,
    viewer: { title: 'Laporan Analitik Lengkap' },
  });
}

// Console-reachable verification hooks (Phase A/B). The Driver hook reads
// the live model that app.js exposes for export.
if (typeof window !== 'undefined') {
  window.exportAnalyticsPoc = exportAnalyticsPoc;
  window.exportDriverAnalytics = (meta = {}) => {
    const m = window._lastAnalyticsFullModel;
    if (!m) throw new Error('Buka tab Analytics dulu agar model tersedia.');
    return exportDriverAnalytics(m, { ...(window._analyticsExportMeta || {}), ...meta });
  };
  window.exportVehicleAnalytics = (meta = {}) => {
    const m = window._lastAnalyticsFullModel;
    if (!m) throw new Error('Buka tab Analytics dulu agar model tersedia.');
    return exportVehicleAnalytics(m, { ...(window._analyticsExportMeta || {}), ...meta });
  };
  window.exportBidangAnalytics = (meta = {}) => {
    const m = window._lastAnalyticsFullModel;
    if (!m) throw new Error('Buka tab Analytics dulu agar model tersedia.');
    return exportBidangAnalytics(m, { ...(window._analyticsExportMeta || {}), ...meta });
  };
  window.exportCompleteAnalytics = (meta = {}) => {
    const m = window._lastAnalyticsFullModel;
    if (!m) throw new Error('Buka tab Analytics dulu agar model tersedia.');
    return exportCompleteAnalytics(m, { ...(window._analyticsExportMeta || {}), ...meta });
  };
}
