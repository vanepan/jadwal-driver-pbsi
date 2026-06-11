/* ============================================================
   PDF-EXPORTER.JS — Pluggable PDF backend (Hybrid C-now / D-later)

   Stable interface:  exportToPdf(definition, opts) → Promise<Blob>

   ┌─ PdfmakeBackend   (default, client-side) — built now
   └─ PuppeteerBackend (server-side)          — D-later seam (stub)

   Everything above this module (DocumentEngine, DocumentViewer,
   PrintManager) deals only in Blobs, so the backend can be
   swapped by config without touching templates or UI.

   NOTE ON "definition" dialect:
   For PdfmakeBackend, `definition` IS a pdfmake docDefinition.
   A future PuppeteerBackend would accept the same abstract model
   via its own adapter — the interface (Blob in/out) is unchanged.
   ============================================================ */

'use strict';

const PDFMAKE_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js';
const PDFMAKE_VFS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js';

/* ── pdfmake lazy loader (once per session) ─────────────────── */

let _pdfMakePromise = null;

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function _loadPdfMake() {
  if (window.pdfMake && window.pdfMake.vfs) return Promise.resolve(window.pdfMake);
  if (_pdfMakePromise) return _pdfMakePromise;

  _pdfMakePromise = _loadScript(PDFMAKE_JS)
    .then(() => _loadScript(PDFMAKE_VFS))
    .then(() => {
      if (!window.pdfMake) throw new Error('pdfmake global missing after load');
      // Some builds expose fonts under window.pdfFonts instead of pdfMake.vfs
      if (!window.pdfMake.vfs && window.pdfFonts?.pdfMake?.vfs) {
        window.pdfMake.vfs = window.pdfFonts.pdfMake.vfs;
      }
      if (!window.pdfMake.vfs) throw new Error('pdfmake VFS fonts not initialised');
      return window.pdfMake;
    });
  return _pdfMakePromise;
}

/* ── Backends ───────────────────────────────────────────────── */

class PdfmakeBackend {
  /** @returns {Promise<Blob>} real application/pdf blob */
  async exportToPdf(definition) {
    const pdfMake = await _loadPdfMake();
    return new Promise((resolve, reject) => {
      try {
        pdfMake.createPdf(definition).getBlob(blob => resolve(blob));
      } catch (err) {
        reject(err);
      }
    });
  }
}

class PuppeteerBackend {
  /* D-later: implement against a Cloud Function that renders HTML
     (derived from the same abstract model) via headless Chrome.
     Templates, viewer, print, and callers stay untouched. */
  async exportToPdf() {
    throw new Error('PuppeteerBackend not implemented — D-later seam');
  }
}

const BACKENDS = { pdfmake: PdfmakeBackend, puppeteer: PuppeteerBackend };

/** Default backend; flip to swap the whole engine to server-side later. */
export const DEFAULT_BACKEND = 'pdfmake';

const _instances = new Map();

/** Return (memoised) backend instance by name. */
export function getExporter(name = DEFAULT_BACKEND) {
  const Backend = BACKENDS[name];
  if (!Backend) throw new Error(`Unknown PDF backend: ${name}`);
  if (!_instances.has(name)) _instances.set(name, new Backend());
  return _instances.get(name);
}
