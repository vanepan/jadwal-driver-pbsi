/* ============================================================
   PRINT-MANAGER.JS — Print the PDF that is actually on screen

   The DocumentViewer already shows the export in a full-size,
   visible iframe whose `src` is the PDF blob URL. That frame is
   loaded and painted by the browser's native PDF plugin, so it is
   the ONLY reliable thing to print: calling print() on its own
   contentWindow captures the real, paginated pages.

   ROOT CAUSE THIS REPLACES (v1.16.4.3): the previous implementation
   spun up a SEPARATE iframe sized width:0/height:0/visibility:hidden
   and printed that. A native PDF plugin never lays out or paints in
   a zero-size / hidden frame, so window.print() captured an empty
   document — the print preview (and output) came out blank even
   though the visible preview, thumbnail and download all worked.

   iOS Safari note: programmatic iframe printing of a PDF is
   unreliable, so we fall back to opening the SAME PDF blob URL in a
   new tab (a real PDF, never about:blank) where the user prints via
   the native viewer. Download and Share remain the best iOS paths.
   ============================================================ */

'use strict';

/**
 * Print the PDF rendered inside an already-displayed, loaded iframe.
 * This is the exact document the viewer is showing — no second source,
 * no hidden/empty frame.
 *
 * @param {HTMLIFrameElement} frame — the visible iframe whose src is the PDF
 * @param {string} [fallbackUrl] — blob/object URL opened in a new tab if the
 *        in-frame print is blocked (e.g. iOS Safari)
 * @returns {boolean} true if the in-frame print dialog was invoked
 */
export function printPdfFromFrame(frame, fallbackUrl) {
  try {
    if (!frame || !frame.contentWindow) throw new Error('print frame unavailable');
    // Focus first — Chrome/Edge require the target window focused for print().
    frame.contentWindow.focus();
    frame.contentWindow.print();
    return true;
  } catch (err) {
    // Blocked context (commonly iOS Safari): open the real PDF in a new tab so
    // it can be printed from the native viewer. Never an empty/about:blank window.
    if (fallbackUrl) {
      window.open(fallbackUrl, '_blank', 'noopener');
      return false;
    }
    console.warn('[PrintManager] print failed and no fallback URL available:', err);
    return false;
  }
}
