/* ============================================================
   CORPUS-PROVENANCE-CONTRACT.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   PURPOSE: fix the shape of ONE provenance record — the traceable link
   from an extracted observation back to the exact place in a source
   document it came from (Phase 5.x.1 §6). "Every extracted observation
   MUST be traceable to the source." Richer than
   src/knowledge/contracts/explainability-contract.js's Provenance
   (connectorId / sourceRef / capturedAt) because a corpus observation
   can be spatially anchored to a page region, and a visual observation
   has no text `sourceRef` at all.

   RESPONSIBILITY: EXTRACTION_METHOD, COORDINATE_SPACE, CorpusRegion +
   makeCorpusRegion / isCorpusRegion / UNKNOWN_REGION, CorpusProvenance +
   makeCorpusProvenance / isCorpusProvenance / isCorpusProvenanceList.

   DEPENDENCIES: none.

   NON-GOALS: does not render a page, does not compute coordinates, does
   not decide extraction confidence. Pixel-perfect geometry is NOT
   required — a source that cannot supply coordinates yields
   UNKNOWN_REGION (every field null), never a fabricated measurement
   (§6, §16).

   FUTURE EVOLUTION: a page-level visual analyzer (PDF → render page →
   visual analysis → layout observations) attaches CorpusProvenance with
   a real `region` + coordinateSpace; this contract already supports that
   pipeline unchanged.
   ============================================================ */

'use strict';

export const CORPUS_PROVENANCE_SCHEMA = 'corpus-provenance@1';

/** How the observation was pulled out of the source. `text_layer` = the
 *  PDF/DOCX already carried selectable text; `ocr` = pixels were read;
 *  `structure_parse` = a document tree (DOCX XML, tagged PDF) was walked;
 *  `visual_analysis` = a rendered page image was analysed; `manual` = a
 *  human recorded it; `unknown` = not recorded (never guessed). */
export const EXTRACTION_METHOD = Object.freeze({
  TEXT_LAYER: 'text_layer',
  OCR: 'ocr',
  STRUCTURE_PARSE: 'structure_parse',
  VISUAL_ANALYSIS: 'visual_analysis',
  MANUAL: 'manual',
  UNKNOWN: 'unknown',
});

/** The units `region`'s x/y/width/height are expressed in. `unknown` is
 *  the honest default when the source cannot support geometry. */
export const COORDINATE_SPACE = Object.freeze({
  PDF_POINTS: 'pdf_points',   // 72 per inch, origin bottom-left (PDF native)
  PIXELS: 'pixels',           // rendered raster, origin top-left
  NORMALIZED: 'normalized',   // 0..1 fraction of page width/height
  UNKNOWN: 'unknown',
});

/**
 * A rectangular region on a page. EVERY numeric field is nullable — null
 * means "genuinely unknown", never 0, never a placeholder (§6, §16).
 * @typedef {Object} CorpusRegion
 * @property {number|null} x
 * @property {number|null} y
 * @property {number|null} width
 * @property {number|null} height
 * @property {string} coordinateSpace  - COORDINATE_SPACE.*
 */

/** The canonical "no geometry available" region. */
export const UNKNOWN_REGION = Object.freeze({
  x: null, y: null, width: null, height: null, coordinateSpace: COORDINATE_SPACE.UNKNOWN,
});

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Build a CorpusRegion, coercing anything non-finite to null. If NO
 * coordinate is present the coordinateSpace is forced to `unknown` — a
 * space label without any coordinates would be a false claim of geometry.
 * @param {Partial<CorpusRegion>} seed
 * @returns {CorpusRegion}
 */
export function makeCorpusRegion({ x, y, width, height, coordinateSpace } = {}) {
  const cx = num(x); const cy = num(y); const cw = num(width); const ch = num(height);
  const hasAny = cx !== null || cy !== null || cw !== null || ch !== null;
  const space = Object.values(COORDINATE_SPACE).includes(coordinateSpace)
    ? coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  return Object.freeze({
    x: cx, y: cy, width: cw, height: ch,
    coordinateSpace: hasAny ? space : COORDINATE_SPACE.UNKNOWN,
  });
}

/** Structural check for a CorpusRegion. */
export function isCorpusRegion(r) {
  if (!r || typeof r !== 'object') return false;
  for (const k of ['x', 'y', 'width', 'height']) {
    if (!(k in r)) return false;
    if (r[k] !== null && !(typeof r[k] === 'number' && Number.isFinite(r[k]))) return false;
  }
  return Object.values(COORDINATE_SPACE).includes(r.coordinateSpace);
}

/**
 * One provenance record backing one observation.
 * @typedef {Object} CorpusProvenance
 * @property {string} schema
 * @property {string} sourceDocumentId - the CorpusDocument.documentId (required, non-empty)
 * @property {string|null} sourceFileId - the preserved-original StoredFileRecord id (`file:<sha256>`), if any
 * @property {number|null} pageNumber  - 1-based page; null = whole-document / not page-anchored
 * @property {CorpusRegion|null} region - spatial anchor; null = not spatially anchored
 * @property {string} extractionMethod - EXTRACTION_METHOD.*
 * @property {string} extractedAt      - ISO 8601
 * @property {number} confidence       - 0..1, EXTRACTION/localisation confidence — NOT organizational authority (§10)
 */

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * @param {Object} seed
 * @returns {CorpusProvenance}
 */
export function makeCorpusProvenance({
  sourceDocumentId,
  sourceFileId = null,
  pageNumber = null,
  region = null,
  extractionMethod = EXTRACTION_METHOD.UNKNOWN,
  extractedAt = new Date().toISOString(),
  confidence = 0,
} = {}) {
  const pn = Number(pageNumber);
  return Object.freeze({
    schema: CORPUS_PROVENANCE_SCHEMA,
    sourceDocumentId: sourceDocumentId ? String(sourceDocumentId) : '',
    sourceFileId: sourceFileId == null ? null : String(sourceFileId),
    pageNumber: Number.isInteger(pn) && pn >= 1 ? pn : null,
    region: region == null ? null : makeCorpusRegion(region),
    extractionMethod: Object.values(EXTRACTION_METHOD).includes(extractionMethod)
      ? extractionMethod : EXTRACTION_METHOD.UNKNOWN,
    extractedAt: String(extractedAt),
    confidence: clamp01(confidence),
  });
}

/** Structural check — the one hard requirement is a non-empty
 *  sourceDocumentId (an observation with no traceable origin is invalid,
 *  §6). Geometry may be entirely absent. */
export function isCorpusProvenance(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.schema !== CORPUS_PROVENANCE_SCHEMA) return false;
  if (typeof p.sourceDocumentId !== 'string' || !p.sourceDocumentId) return false;
  if (p.sourceFileId !== null && typeof p.sourceFileId !== 'string') return false;
  if (p.pageNumber !== null && !(Number.isInteger(p.pageNumber) && p.pageNumber >= 1)) return false;
  if (p.region !== null && !isCorpusRegion(p.region)) return false;
  if (!Object.values(EXTRACTION_METHOD).includes(p.extractionMethod)) return false;
  if (typeof p.extractedAt !== 'string' || !p.extractedAt) return false;
  if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) return false;
  return true;
}

/** @param {*} list @returns {boolean} — non-empty, every entry valid. */
export function isCorpusProvenanceList(list) {
  return Array.isArray(list) && list.length >= 1 && list.every(isCorpusProvenance);
}
