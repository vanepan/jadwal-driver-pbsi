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

// SS15 — v1.28.11's incident (see js/config.js's changelog entry for that
// version) root-caused a REAL production hang: pdfmake's internal
// DocMeasure/extendTableWidths mutates the table `widths:` array it's given,
// and if that throws (there it was a frozen array; in general it can be any
// internal pdfmake exception — bad image data, an invalid font reference, a
// malformed table), it throws deep inside getBlob()'s async measurement
// pipeline, AFTER this function's synchronous try/catch has already
// returned — so neither resolve() nor reject() below is ever called and the
// Promise hangs forever. That release fixed only the ONE trigger site
// (templates/nor.js's frozen arrays); this exporter itself had no general
// safeguard, so any OTHER pdfmake-internal throw in any template reproduces
// the identical permanent hang. A bounded timeout guarantees this Promise
// always eventually settles either way, so every awaiter up the chain
// (doc-engine.js, callers' try/catch/finally) actually runs instead of
// hanging with the loading state stuck forever.
const PDF_EXPORT_TIMEOUT_MS = 30000;

class PdfmakeBackend {
  /** @returns {Promise<Blob>} real application/pdf blob */
  async exportToPdf(definition) {
    const pdfMake = await _loadPdfMake();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Pembuatan PDF melebihi batas waktu (30 detik). Coba lagi.'));
      }, PDF_EXPORT_TIMEOUT_MS);
      const settleResolve = (blob) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(blob);
      };
      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      try {
        pdfMake.createPdf(definition).getBlob(blob => settleResolve(blob));
      } catch (err) {
        settleReject(err);
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
