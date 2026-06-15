'use strict';

/* ============================================================
   PUPPETEER-RENDERER.JS — HTML → A4 PDF Buffer

   The single low-level render step. Takes a complete HTML
   document (built by report-document.js, fonts already inlined)
   and returns an application/pdf Buffer.

   Rendering guarantees enforced here:
     • A4 sizing      — preferCSSPageSize honours @page{size:A4},
                        with format:'A4' as an explicit fallback.
     • Font loading   — wait for document.fonts.ready before pdf().
     • printBackground — true (the design relies on background fills:
                        bars, status strips, badges).
     • page breaks    — driven by CSS (.a4 break-after:page); pdf()
                        emits one page per .a4.

   A fresh page is used per render and always closed; the browser
   instance is shared/warm via chromium.js.
   ============================================================ */

const logger = require('firebase-functions/logger');
const { getBrowser } = require('./chromium');

/**
 * Render an HTML document string to an A4 PDF.
 * @param {string} html  - complete HTML document
 * @returns {Promise<Buffer>} application/pdf
 */
async function renderHtmlToPdf(html) {
  if (!html || typeof html !== 'string') {
    throw new Error('renderHtmlToPdf: html string required');
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // No external resources are fetched (fonts are inlined), but use a
    // deterministic wait and emulate 'screen' so background colours render
    // exactly as the approved prototype (Chrome's print emulation would
    // otherwise alter some defaults).
    await page.emulateMediaType('screen');
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Block until embedded @font-face faces are parsed and ready, so the
    // weight-100 hero never falls back to a system font in the snapshot.
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: 'A4',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    logger.info('[renderer] pdf generated', { bytes: pdf.length });
    return pdf;
  } finally {
    try { await page.close(); } catch { /* ignore */ }
  }
}

module.exports = { renderHtmlToPdf };
