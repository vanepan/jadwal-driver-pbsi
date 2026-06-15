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
  /* Server-side render via headless Chrome in a Cloud Function
     (exportAnalyticsReport). Templates/viewer/print/callers stay
     untouched — this backend speaks the same Blob-out interface.

     The "definition" for this backend is the Analytics Export
     envelope produced by the client report template:
       { __analyticsExport:true, payload:{ templateId, model } }
     The Cloud Function returns { base64, contentType }, which we
     wrap back into a Blob so everything above stays Blob-only.

     firebase.js is imported lazily so this module stays free of a
     hard Firebase dependency (and avoids load-order coupling). */
  async exportToPdf(definition) {
    const payload = definition && definition.__analyticsExport
      ? definition.payload
      : definition;
    if (!payload || !payload.templateId) {
      throw new Error('PuppeteerBackend: definition.payload.templateId required');
    }

    const { callRenderAnalyticsExport } = await import('../firebase.js');
    const res = await callRenderAnalyticsExport(payload);
    if (!res || !res.base64) {
      throw new Error('Render server tidak mengembalikan PDF.');
    }
    return _base64ToBlob(res.base64, res.contentType || 'application/pdf');
  }
}

/** Decode a base64 string into a Blob without inflating to a data: URL. */
function _base64ToBlob(base64, contentType) {
  const byteChars = atob(base64);
  const len = byteChars.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: contentType || 'application/pdf' });
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
