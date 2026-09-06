/* ============================================================
   EXTRACTION-RESULT-CONTRACT.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: fix the shape an extraction adapter returns — text + optional
   page-aware structure, with the EXTRACTION METHOD and per-unit
   confidence attached so downstream provenance is honest (§8, §16).

   THE HONESTY RULES (§8, §17), encoded here:
     • `method` must be one of EXTRACTION_METHOD (text_layer | ocr |
       structure_parse | manual | unknown). A PDF whose text could not be
       read reports `method: 'unknown'` and `ok: false` — it does NOT
       claim `text_layer` just because the file is a PDF.
     • coordinates NEVER appear without a coordinateSpace. A block with no
       reliable geometry carries `region: null`.
     • `pageCount` is `null` when genuinely unknown — never fabricated.

   RESPONSIBILITY: EXTRACTION_METHOD (re-exported from the provenance
   contract), TextBlock / ExtractedPage / StructNode / ExtractionResult
   typedefs + builders + validators.

   DEPENDENCIES: ../../contracts/corpus-provenance-contract.js
   (EXTRACTION_METHOD, COORDINATE_SPACE, makeCorpusRegion, isCorpusRegion).

   NON-GOALS: does not extract anything; does not classify; does not build
   observations.
   ============================================================ */

'use strict';

import {
  EXTRACTION_METHOD, COORDINATE_SPACE, makeCorpusRegion, isCorpusRegion,
} from '../../contracts/corpus-provenance-contract.js';

export { EXTRACTION_METHOD, COORDINATE_SPACE };

export const EXTRACTION_RESULT_SCHEMA = 'corpus-extraction-result@1';

export const EXTRACTION_ERRORS = Object.freeze({
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  PARSER_UNAVAILABLE: 'PARSER_UNAVAILABLE',
  NO_TEXT_LAYER: 'NO_TEXT_LAYER',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  MALFORMED_DOCUMENT: 'MALFORMED_DOCUMENT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/** A structural role a block/paragraph was recognised as. Advisory — the
 *  structure observer decides observation categories, this is a hint. */
export const BLOCK_ROLE = Object.freeze({
  TITLE: 'title',
  DATELINE: 'dateline',
  REFERENCE: 'reference',        // "No. .../..."
  META_LABEL: 'meta_label',      // "Kepada Yth.", "Dari", "Perihal", "Lampiran", "Tembusan"
  OPENING: 'opening',            // "Dengan hormat,"
  BODY: 'body',
  CLOSING: 'closing',
  SIGNATURE: 'signature',
  ATTACHMENT: 'attachment',
  COPY: 'copy',                  // "Tembusan"
  FOOTER: 'footer',
  HEADER: 'header',
  PAGE_NUMBER: 'page_number',
  TABLE: 'table',
  HEADING: 'heading',
  UNKNOWN: 'unknown',
});

function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }

/**
 * @typedef {Object} TextBlock
 * @property {string} text
 * @property {import('../../contracts/corpus-provenance-contract.js').CorpusRegion|null} region
 * @property {string} role   - BLOCK_ROLE.*
 * @property {number} order  - reading order within its page (0-based)
 */
export function makeTextBlock({ text = '', region = null, role = BLOCK_ROLE.UNKNOWN, order = 0 } = {}) {
  return Object.freeze({
    text: String(text),
    region: region == null ? null : makeCorpusRegion(region),
    role: Object.values(BLOCK_ROLE).includes(role) ? role : BLOCK_ROLE.UNKNOWN,
    order: Number.isInteger(order) && order >= 0 ? order : 0,
  });
}
export function isTextBlock(b) {
  return !!b && typeof b === 'object'
    && typeof b.text === 'string'
    && (b.region === null || isCorpusRegion(b.region))
    && Object.values(BLOCK_ROLE).includes(b.role)
    && Number.isInteger(b.order) && b.order >= 0;
}

/**
 * @typedef {Object} ExtractedPage
 * @property {number} pageNumber          - 1-based
 * @property {string} text
 * @property {TextBlock[]} blocks
 * @property {number|null} width          - page width; null = unknown
 * @property {number|null} height
 * @property {string} coordinateSpace     - COORDINATE_SPACE.* (unknown when no geometry)
 */
export function makeExtractedPage({ pageNumber, text = '', blocks = [], width = null, height = null, coordinateSpace } = {}) {
  const pn = Number(pageNumber);
  const w = Number(width); const h = Number(height);
  const hasGeom = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
  return Object.freeze({
    pageNumber: Number.isInteger(pn) && pn >= 1 ? pn : 1,
    text: String(text),
    blocks: Object.freeze((Array.isArray(blocks) ? blocks : []).map((b) => (isTextBlock(b) ? b : makeTextBlock(b)))),
    width: hasGeom ? w : null,
    height: hasGeom ? h : null,
    coordinateSpace: hasGeom && Object.values(COORDINATE_SPACE).includes(coordinateSpace)
      ? coordinateSpace : (hasGeom ? COORDINATE_SPACE.PDF_POINTS : COORDINATE_SPACE.UNKNOWN),
  });
}
export function isExtractedPage(p) {
  return !!p && typeof p === 'object'
    && Number.isInteger(p.pageNumber) && p.pageNumber >= 1
    && typeof p.text === 'string'
    && Array.isArray(p.blocks) && p.blocks.every(isTextBlock)
    && (p.width === null || (typeof p.width === 'number' && p.width > 0))
    && (p.height === null || (typeof p.height === 'number' && p.height > 0))
    && Object.values(COORDINATE_SPACE).includes(p.coordinateSpace);
}

/**
 * @typedef {Object} StructNode
 * @property {string} type   - 'paragraph' | 'heading' | 'table' | 'list' | 'header' | 'footer'
 * @property {number} level  - heading level, or 0
 * @property {string} text
 */
export function makeStructNode({ type = 'paragraph', level = 0, text = '' } = {}) {
  return Object.freeze({ type: String(type), level: Number.isInteger(level) && level >= 0 ? level : 0, text: String(text) });
}

/**
 * @typedef {Object} ExtractionResult
 * @property {string} schema
 * @property {boolean} ok
 * @property {string} method             - EXTRACTION_METHOD.*
 * @property {number|null} pageCount     - null = unknown; never fabricated
 * @property {ExtractedPage[]} pages
 * @property {string} text               - the concatenated plain text (may be '')
 * @property {StructNode[]} structure    - document tree where the format allows it (DOCX); [] otherwise
 * @property {number} confidence         - 0..1, extraction confidence
 * @property {{code: string, message: string}|null} error
 * @property {Object} meta               - adapter metadata (producer, creationDateRaw, …) — NOT document facts
 */
export function makeExtractionResult({
  ok = false, method = EXTRACTION_METHOD.UNKNOWN, pageCount = null, pages = [], text = '',
  structure = [], confidence = 0, error = null, meta = {},
} = {}) {
  const pc = Number(pageCount);
  const pageList = (Array.isArray(pages) ? pages : []).map((p) => (isExtractedPage(p) ? p : makeExtractedPage(p)));
  return Object.freeze({
    schema: EXTRACTION_RESULT_SCHEMA,
    ok: ok === true,
    method: Object.values(EXTRACTION_METHOD).includes(method) ? method : EXTRACTION_METHOD.UNKNOWN,
    pageCount: Number.isInteger(pc) && pc >= 1 ? pc : (pageList.length ? pageList.length : null),
    pages: Object.freeze(pageList),
    // an explicit '' means "no text" — only synthesise from pages when text is genuinely absent
    text: String(text != null ? text : pageList.map((p) => p.text).join('\n\n')),
    structure: Object.freeze((Array.isArray(structure) ? structure : []).map((n) => makeStructNode(n))),
    confidence: clamp01(confidence),
    error: error == null ? null : Object.freeze({ code: String(error.code || 'EXTRACTION_FAILED'), message: String(error.message || '') }),
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? Object.freeze({ ...meta }) : Object.freeze({}),
  });
}

export function extractionSuccess(fields) { return makeExtractionResult({ ...fields, ok: true, error: null }); }
export function extractionFailure(code, message, fields = {}) {
  return makeExtractionResult({ ...fields, ok: false, error: { code, message } });
}

export function isExtractionResult(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== EXTRACTION_RESULT_SCHEMA) return false;
  if (typeof r.ok !== 'boolean') return false;
  if (!Object.values(EXTRACTION_METHOD).includes(r.method)) return false;
  if (r.pageCount !== null && !(Number.isInteger(r.pageCount) && r.pageCount >= 1)) return false;
  if (!Array.isArray(r.pages) || !r.pages.every(isExtractedPage)) return false;
  if (typeof r.text !== 'string') return false;
  if (!Array.isArray(r.structure)) return false;
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) return false;
  if (r.error !== null && (typeof r.error !== 'object' || typeof r.error.code !== 'string')) return false;
  // §17 — a failed extraction must not present a text layer as fact.
  if (r.ok === false && r.method === EXTRACTION_METHOD.TEXT_LAYER && r.text.trim().length > 0) return false;
  return true;
}
