/* ============================================================
   CORPUS-DOCUMENT-CONTRACT.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   PURPOSE: fix the canonical shape of ONE ingested historical source
   document — a NOR, a Nota Organisasi, a Memorandum, or a
   legacy/predecessor instrument (Phase 5.x.1 §4). This is the HISTORICAL
   CORPUS layer — evidence, not knowledge. Distinct from:

     • src/organizational-memory/contracts/archive-record-contract.js's
       ArchiveRecord — that is the organizational record of a V1 Petty
       Cash NOR that ALREADY EXISTS in production (it snapshots that
       record's fields). A CorpusDocument is an UPLOADED historical file
       that predates / sits outside the V1 store.
     • src/knowledge/contracts/knowledge-item-contract.js's KnowledgeItem
       — that is an approved organizational fact. A CorpusDocument never
       becomes a KnowledgeItem; observations mined FROM it might, only
       after human approval.

   TWO INDEPENDENT LIFECYCLES, NEVER OVERLOADED (§11):
     ingestionStatus  — how far the FILE got: received → stored → …
     analysisStatus   — how far EXTRACTION got: pending → text_extracted
                        → structure_extracted → visual_analyzed → completed
   Neither means "organizationally approved" — that is the observation
   lifecycle (observation-lifecycle-contract.js), a third, separate axis.

   RESPONSIBILITY: the vocabularies + the two status graphs + CorpusDocument
   typedef + makeCorpusDocument / isCorpusDocument / CORPUS_DOCUMENT_FIELDS
   + corpusDocumentIdFromChecksum (dedup identity — §12).

   DEPENDENCIES: none.

   NON-GOALS: does not store, hash, render, or classify anything. Does not
   infer an era from a filename (§5). Preserves ambiguity rather than
   forcing a type (§4, §17) — an uncertain document is UNKNOWN with a
   confidence < 1, never silently normalised to NOR.
   ============================================================ */

'use strict';

export const CORPUS_DOCUMENT_SCHEMA = 'corpus-document@1';

/* ── document type (§4, §17) — historical terminology is PRESERVED, not
      collapsed. "Memorandum" and "Nota Organisasi" are NOT assumed to be
      the same instrument; a document we cannot place is UNKNOWN. ──────── */
export const CORPUS_DOCUMENT_TYPE = Object.freeze({
  NOR: 'NOR',
  NOTA_ORGANISASI: 'NOTA_ORGANISASI',
  MEMORANDUM: 'MEMORANDUM',
  LEGACY: 'LEGACY',        // a predecessor/superseded instrument, kind known-to-differ
  UNKNOWN: 'UNKNOWN',
});

export const CORPUS_DOCUMENT_TYPE_DEFS = Object.freeze([
  Object.freeze({ id: CORPUS_DOCUMENT_TYPE.NOR, label: 'NOR (Nota Organisasi Realisasi)' }),
  Object.freeze({ id: CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, label: 'Nota Organisasi' }),
  Object.freeze({ id: CORPUS_DOCUMENT_TYPE.MEMORANDUM, label: 'Memorandum' }),
  Object.freeze({ id: CORPUS_DOCUMENT_TYPE.LEGACY, label: 'Legacy / predecessor instrument' }),
  Object.freeze({ id: CORPUS_DOCUMENT_TYPE.UNKNOWN, label: 'Unknown / unclassified' }),
]);

/* ── era / versioning (§5) — SEPARATE from type. Whether a document
      reflects historical vs current organizational practice. ─────────── */
export const CORPUS_DOCUMENT_ERA = Object.freeze({
  HISTORICAL: 'historical',
  CURRENT: 'current',
  TRANSITIONAL: 'transitional',
  UNKNOWN: 'unknown',
});

export const CORPUS_DOCUMENT_ERA_DEFS = Object.freeze([
  Object.freeze({ id: CORPUS_DOCUMENT_ERA.HISTORICAL, label: 'Historical' }),
  Object.freeze({ id: CORPUS_DOCUMENT_ERA.CURRENT, label: 'Current' }),
  Object.freeze({ id: CORPUS_DOCUMENT_ERA.TRANSITIONAL, label: 'Transitional' }),
  Object.freeze({ id: CORPUS_DOCUMENT_ERA.UNKNOWN, label: 'Unknown' }),
]);

/* ── ingestion lifecycle — the FILE's journey into the corpus (§2, §12) ─ */
export const CORPUS_INGESTION_STATUS = Object.freeze({
  PENDING: 'pending',       // an ingest was requested, nothing persisted yet
  RECEIVED: 'received',      // a logical CorpusDocument row exists; original bytes not yet linked
  STORED: 'stored',         // the preserved original (sourceFileId) is linked
  DUPLICATE: 'duplicate',    // byte-identical to a document already in the corpus (§12) — kept, not counted
  FAILED: 'failed',
});

export const CORPUS_INGESTION_STATUS_GRAPH = Object.freeze({
  [CORPUS_INGESTION_STATUS.PENDING]: Object.freeze([
    CORPUS_INGESTION_STATUS.RECEIVED, CORPUS_INGESTION_STATUS.DUPLICATE, CORPUS_INGESTION_STATUS.FAILED,
  ]),
  [CORPUS_INGESTION_STATUS.RECEIVED]: Object.freeze([
    CORPUS_INGESTION_STATUS.STORED, CORPUS_INGESTION_STATUS.FAILED,
  ]),
  [CORPUS_INGESTION_STATUS.STORED]: Object.freeze([
    CORPUS_INGESTION_STATUS.FAILED,
  ]),
  [CORPUS_INGESTION_STATUS.DUPLICATE]: Object.freeze([]),
  [CORPUS_INGESTION_STATUS.FAILED]: Object.freeze([
    CORPUS_INGESTION_STATUS.PENDING,
  ]),
});

export function canIngestionTransition(from, to) {
  const reachable = CORPUS_INGESTION_STATUS_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/* ── analysis lifecycle — how far EXTRACTION has progressed (§11, §16).
      Deliberately NOT strictly linear: a visual analyzer may run before a
      structure parser. Every stage may fail; failure may retry. ──────── */
export const CORPUS_ANALYSIS_STATUS = Object.freeze({
  PENDING: 'pending',
  TEXT_EXTRACTED: 'text_extracted',
  STRUCTURE_EXTRACTED: 'structure_extracted',
  VISUAL_ANALYZED: 'visual_analyzed',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const CORPUS_ANALYSIS_STATUS_GRAPH = Object.freeze({
  [CORPUS_ANALYSIS_STATUS.PENDING]: Object.freeze([
    CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED, CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED,
    CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED, CORPUS_ANALYSIS_STATUS.FAILED,
  ]),
  [CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED]: Object.freeze([
    CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED, CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED,
    CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.FAILED,
  ]),
  [CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED]: Object.freeze([
    CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED, CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.FAILED,
  ]),
  [CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED]: Object.freeze([
    CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.FAILED,
  ]),
  [CORPUS_ANALYSIS_STATUS.COMPLETED]: Object.freeze([
    CORPUS_ANALYSIS_STATUS.PENDING, CORPUS_ANALYSIS_STATUS.FAILED, // re-analysis
  ]),
  [CORPUS_ANALYSIS_STATUS.FAILED]: Object.freeze([
    CORPUS_ANALYSIS_STATUS.PENDING,
  ]),
});

export function canAnalysisTransition(from, to) {
  const reachable = CORPUS_ANALYSIS_STATUS_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/* ── data classification (§13) — historical organizational documents may
      carry sensitive information; the corpus defaults to the most
      protective class. Mirrors the vocabulary of
      src/intelligence/contracts/data-classification-contract.js without
      importing it (a contract stays dependency-free). ────────────────── */
export const CORPUS_CLASSIFICATION = Object.freeze({
  PUBLIC: 'public',
  INTERNAL: 'internal',
  RESTRICTED: 'restricted',
});

/* ── deterministic identity (§12) — the SAME source content yields the
      SAME logical document id, so a re-ingest is detectable and cannot
      create an uncontrolled duplicate. ─────────────────────────────── */
export function corpusDocumentIdFromChecksum(checksum) {
  const raw = checksum == null ? '' : String(checksum);
  const safe = raw.replace(/[.$#[\]/\s\x00-\x1f\x7f]/g, '_');
  return `corpus_${safe}`;
}

export const CORPUS_DOCUMENT_FIELDS = Object.freeze([
  'schema', 'documentId', 'sourceFileId', 'checksum',
  'documentType', 'typeConfidence', 'documentEra', 'eraConfidence',
  'title', 'source', 'sourcePath', 'originalFilename', 'mimeType',
  'pageCount', 'language', 'sourceDate',
  'ingestionStatus', 'analysisStatus',
  'ownerId', 'tenantId', 'duplicateOfId',
  'createdAt', 'analyzedAt', 'provenance', 'classification',
]);

/**
 * @typedef {Object} CorpusDocument
 * @property {string} schema
 * @property {string} documentId       - deterministic: corpusDocumentIdFromChecksum(checksum)
 * @property {string|null} sourceFileId - preserved-original StoredFileRecord id (`file:<sha256>`); null until stored
 * @property {string} checksum         - content hash of the ORIGINAL bytes (sha256 hex preferred; any non-empty string accepted)
 * @property {string} documentType     - CORPUS_DOCUMENT_TYPE.* (UNKNOWN when unsure)
 * @property {number} typeConfidence   - 0..1, classification confidence — NOT authority
 * @property {string} documentEra      - CORPUS_DOCUMENT_ERA.* (separate axis from type)
 * @property {number} eraConfidence    - 0..1; when era is UNKNOWN this is < 1 by construction (§5)
 * @property {string} title
 * @property {string|null} source      - human label for where it came from
 * @property {string|null} sourcePath  - original path / reference (§12)
 * @property {string|null} originalFilename
 * @property {string|null} mimeType
 * @property {number|null} pageCount   - null = unknown; never fabricated
 * @property {string|null} language    - e.g. 'id'; null = undetermined
 * @property {string|null} sourceDate  - the document's OWN stated date, if known; never inferred from filename (§5)
 * @property {string} ingestionStatus  - CORPUS_INGESTION_STATUS.*
 * @property {string} analysisStatus   - CORPUS_ANALYSIS_STATUS.* (separate lifecycle — §11)
 * @property {string|null} ownerId     - set server-side from the verified uid
 * @property {string|null} tenantId    - reserved owner/tenant boundary (§13)
 * @property {string|null} duplicateOfId - if a byte-identical re-arrival, the earlier documentId (§12)
 * @property {string} createdAt        - ISO 8601
 * @property {string|null} analyzedAt  - ISO 8601; null until analysis advances
 * @property {{ingestedBy: string|null, ingestedAt: string, method: string, note: string|null}} provenance
 * @property {string} classification   - CORPUS_CLASSIFICATION.* (default 'restricted')
 */

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function str(v) { return v == null ? null : String(v); }

/**
 * @param {Object} seed
 * @returns {CorpusDocument}
 */
export function makeCorpusDocument({
  documentId,
  sourceFileId = null,
  checksum = '',
  documentType = CORPUS_DOCUMENT_TYPE.UNKNOWN,
  typeConfidence = 0,
  documentEra = CORPUS_DOCUMENT_ERA.UNKNOWN,
  eraConfidence = 0,
  title = '',
  source = null,
  sourcePath = null,
  originalFilename = null,
  mimeType = null,
  pageCount = null,
  language = null,
  sourceDate = null,
  ingestionStatus = CORPUS_INGESTION_STATUS.PENDING,
  analysisStatus = CORPUS_ANALYSIS_STATUS.PENDING,
  ownerId = null,
  tenantId = null,
  duplicateOfId = null,
  createdAt = new Date().toISOString(),
  analyzedAt = null,
  provenance = {},
  classification = CORPUS_CLASSIFICATION.RESTRICTED,
} = {}) {
  const cs = String(checksum || '');
  const resolvedId = documentId || corpusDocumentIdFromChecksum(cs);
  const type = Object.values(CORPUS_DOCUMENT_TYPE).includes(documentType)
    ? documentType : CORPUS_DOCUMENT_TYPE.UNKNOWN;
  const era = Object.values(CORPUS_DOCUMENT_ERA).includes(documentEra)
    ? documentEra : CORPUS_DOCUMENT_ERA.UNKNOWN;
  let eraConf = clamp01(eraConfidence);
  // §5 — "If era classification is uncertain: era = unknown, confidence < 1."
  // Encode it: an UNKNOWN era can never carry full certainty.
  if (era === CORPUS_DOCUMENT_ERA.UNKNOWN && eraConf >= 1) eraConf = 0.99;
  const pc = Number(pageCount);
  const prov = provenance && typeof provenance === 'object' && !Array.isArray(provenance) ? provenance : {};

  return Object.freeze({
    schema: CORPUS_DOCUMENT_SCHEMA,
    documentId: resolvedId,
    sourceFileId: str(sourceFileId),
    checksum: cs,
    documentType: type,
    typeConfidence: clamp01(typeConfidence),
    documentEra: era,
    eraConfidence: eraConf,
    title: String(title || ''),
    source: str(source),
    sourcePath: str(sourcePath),
    originalFilename: str(originalFilename),
    mimeType: str(mimeType),
    pageCount: Number.isInteger(pc) && pc >= 1 ? pc : null,
    language: str(language),
    sourceDate: str(sourceDate),
    ingestionStatus: Object.values(CORPUS_INGESTION_STATUS).includes(ingestionStatus)
      ? ingestionStatus : CORPUS_INGESTION_STATUS.PENDING,
    analysisStatus: Object.values(CORPUS_ANALYSIS_STATUS).includes(analysisStatus)
      ? analysisStatus : CORPUS_ANALYSIS_STATUS.PENDING,
    ownerId: str(ownerId),
    tenantId: str(tenantId),
    duplicateOfId: str(duplicateOfId),
    createdAt: String(createdAt),
    analyzedAt: analyzedAt == null ? null : String(analyzedAt),
    provenance: Object.freeze({
      ingestedBy: prov.ingestedBy == null ? null : String(prov.ingestedBy),
      ingestedAt: String(prov.ingestedAt || createdAt),
      method: str(prov.method) || 'upload',
      note: prov.note == null ? null : String(prov.note),
    }),
    classification: Object.values(CORPUS_CLASSIFICATION).includes(classification)
      ? classification : CORPUS_CLASSIFICATION.RESTRICTED,
  });
}

/**
 * Structural check. Confirms every field is present and of the right
 * rough shape, the vocabularies are registered values, and the §5
 * era-certainty invariant holds. Does NOT check business validity or
 * whether the checksum really matches any bytes.
 * @param {*} d
 * @returns {boolean}
 */
export function isCorpusDocument(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.schema !== CORPUS_DOCUMENT_SCHEMA) return false;
  if (typeof d.documentId !== 'string' || !d.documentId) return false;
  if (typeof d.checksum !== 'string' || !d.checksum) return false;
  if (!Object.values(CORPUS_DOCUMENT_TYPE).includes(d.documentType)) return false;
  if (!Object.values(CORPUS_DOCUMENT_ERA).includes(d.documentEra)) return false;
  if (typeof d.typeConfidence !== 'number' || d.typeConfidence < 0 || d.typeConfidence > 1) return false;
  if (typeof d.eraConfidence !== 'number' || d.eraConfidence < 0 || d.eraConfidence > 1) return false;
  // §5 — an UNKNOWN era must not claim full certainty.
  if (d.documentEra === CORPUS_DOCUMENT_ERA.UNKNOWN && d.eraConfidence >= 1) return false;
  if (d.pageCount !== null && !(Number.isInteger(d.pageCount) && d.pageCount >= 1)) return false;
  if (!Object.values(CORPUS_INGESTION_STATUS).includes(d.ingestionStatus)) return false;
  if (!Object.values(CORPUS_ANALYSIS_STATUS).includes(d.analysisStatus)) return false;
  if (!Object.values(CORPUS_CLASSIFICATION).includes(d.classification)) return false;
  if (typeof d.createdAt !== 'string' || !d.createdAt) return false;
  if (d.analyzedAt !== null && typeof d.analyzedAt !== 'string') return false;
  if (!d.provenance || typeof d.provenance !== 'object') return false;
  if (typeof d.provenance.ingestedAt !== 'string' || !d.provenance.ingestedAt) return false;
  return CORPUS_DOCUMENT_FIELDS.every((f) => f in d);
}
