'use strict';

/* ============================================================
   exports/analytics/index.js — Analytics Export render callable

   exportAnalyticsReport({ templateId, model }) → { base64, contentType }

   The server side of the approved Analytics Export pipeline
   (IMPLEMENTATION_ARCHITECTURE.md §7). Receives a report model
   from the browser (via DocumentEngine's PuppeteerBackend),
   builds the approved HTML, renders it through headless Chrome,
   and returns the PDF as base64 for the client to wrap in a Blob
   and show in the existing DocumentViewer.

   Phase A scope: templateId 'poc' only — the foundation proof.
   Driver/Vehicle/Bidang/Complete are added in Phase B–E behind
   the same callable + the same contract.

   Auth: a real Firebase Auth session is required (same gate as
   the push/publishEvent callables). Analytics is admin-surfaced;
   the function itself stays role-agnostic for now and is tightened
   when wired to the admin UI in a later phase.

   Resources: 1 GiB / 120 s — headless Chrome needs the headroom;
   concurrency capped so a single warm instance isn't oversubscribed
   by parallel Chrome pages.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../../config/constants');
const { buildReportHtml } = require('./report/report-document');
const { renderHtmlToPdf } = require('./render/puppeteer-renderer');

const ALLOWED_TEMPLATES = new Set([
  'poc', 'analytics-driver', 'analytics-vehicle', 'analytics-bidang', 'analytics-complete',
]);

const exportAnalyticsReport = onCall(
  // 2 GiB: @sparticuz/chromium decompresses Chromium into in-memory /tmp
  // (counts against memory) on top of the Chrome process + 5-page render.
  { region: REGION, memory: '2GiB', timeoutSeconds: 120, concurrency: 2 },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Sesi tidak valid.');
    }

    const data = request.data || {};
    const templateId = String(data.templateId || 'poc');
    const model = data.model && typeof data.model === 'object' ? data.model : {};

    if (!ALLOWED_TEMPLATES.has(templateId)) {
      throw new HttpsError('invalid-argument', `templateId tidak dikenal: ${templateId}`);
    }

    let html;
    try {
      html = buildReportHtml(templateId, model);
    } catch (err) {
      logger.error('[analytics-export] build failed', { templateId, error: err.message });
      throw new HttpsError('invalid-argument', 'Gagal menyusun dokumen.');
    }

    try {
      const buffer = await renderHtmlToPdf(html);
      logger.info('[analytics-export] rendered', {
        templateId, uid: request.auth.uid, bytes: buffer.length,
      });
      return {
        // page.pdf() returns a Uint8Array (puppeteer-core 24.x); its
        // .toString('base64') yields comma-joined decimals, not base64.
        // Wrap in a Node Buffer so the client's atob() receives real base64.
        base64: Buffer.from(buffer).toString('base64'),
        contentType: 'application/pdf',
        templateId,
      };
    } catch (err) {
      logger.error('[analytics-export] render failed', { templateId, error: err.message });
      throw new HttpsError('internal', 'Gagal merender PDF.');
    }
  }
);

module.exports = { exportAnalyticsReport };
