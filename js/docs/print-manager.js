/* ============================================================
   PRINT-MANAGER.JS — Print a real PDF blob (deterministic)

   The source is an already-paginated PDF, so the browser print
   path can only scale-to-page — it cannot re-paginate. This is
   why printing the generated PDF is consistent across platforms,
   unlike printing an HTML iframe.

   iOS Safari note: iframe.print() of a PDF is unreliable, so we
   fall back to opening the PDF in a new tab where the user prints
   via the native viewer. The DocumentViewer also offers Download
   and Share, which are the most reliable iOS paths.
   ============================================================ */

'use strict';

/**
 * Print a PDF blob. Uses a hidden iframe where possible, falls back
 * to a new tab (iOS). Object URL is revoked after the attempt.
 *
 * @param {Blob} blob — application/pdf
 */
export function printPdfBlob(blob) {
  const url = URL.createObjectURL(blob);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    setTimeout(() => {
      URL.revokeObjectURL(url);
      frame.remove();
    }, 1000);
  };

  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      cleanup();
    } catch {
      window.open(url, '_blank', 'noopener');
      cleanup();
    }
  };
  frame.onerror = () => {
    window.open(url, '_blank', 'noopener');
    cleanup();
  };

  document.body.appendChild(frame);
  frame.src = url;
}
