/* ============================================================
   DOC-ENGINE.JS — Orchestrator (single entry point for callers)

   const doc = await DocumentEngine.generate('reimbursement', data);
   DocumentEngine.open(doc);   // shows the reusable viewer

   Caches generated blobs per (templateId + data) so re-opening
   the same document is instant. Backend-agnostic: returns a Blob.
   ============================================================ */

'use strict';

import { getTemplate }            from './template-registry.js';
import { getExporter }            from './pdf-exporter.js';
import { showViewer, closeViewer } from './document-viewer.js';

const _cache = new Map();   // key → { blob, filename, definition }

/**
 * Build the document definition + render a real PDF blob.
 *
 * @param {string} templateId
 * @param {object} data
 * @param {{ backend?:string, cache?:boolean }} [opts]
 * @returns {Promise<{blob:Blob, filename:string, definition:object}>}
 */
export async function generate(templateId, data, opts = {}) {
  const useCache = opts.cache !== false;
  const key = useCache ? `${templateId}::${_stableKey(data)}` : null;

  if (key && _cache.has(key)) return _cache.get(key);

  const tpl        = getTemplate(templateId);
  const definition = tpl.build(data || {}, { ...opts });
  const exporter   = getExporter(opts.backend);
  const blob       = await exporter.exportToPdf(definition);

  const filename = (tpl.filename ? tpl.filename(data || {}) : `${templateId}.pdf`);
  const result   = { blob, filename, definition };

  if (key) _cache.set(key, result);
  return result;
}

/** Open a generated document in the reusable viewer. */
export function open(doc, meta = {}) {
  return showViewer(doc.blob, doc.filename, meta);
}

/** Convenience: generate then open in one call. */
export async function generateAndOpen(templateId, data, opts = {}) {
  const doc = await generate(templateId, data, opts);
  open(doc, opts.viewer || {});
  return doc;
}

export { closeViewer };

/** Drop cached blobs (e.g. after a data mutation). */
export function clearCache() { _cache.clear(); }

/* ── Internals ──────────────────────────────────────────────── */

/** Stable cache key from data — order-insensitive, shallow-safe. */
function _stableKey(data) {
  if (data == null) return 'null';
  if (typeof data !== 'object') return String(data);
  try {
    return JSON.stringify(data, Object.keys(data).sort());
  } catch {
    return String(data.id ?? Math.random());
  }
}
