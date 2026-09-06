'use strict';

/* ============================================================
   functions/src/intelligence/corpusContract.js — Phase 5.x.1

   The CJS mirror of the ESM corpus contracts
   (src/intelligence/corpus/contracts/*.js +
   src/intelligence/corpus/corpus-observation-record.js). Kept byte-for-
   behaviour with the ESM side — scripts/intelligence-corpus-check.cjs
   asserts drift parity (schemas, enums, field lists, graphs, and that
   makeCorpusDocument / makeCorpusObservation produce identical output).

   The Functions runtime is CJS and must NEVER import from src/ (see
   scripts/intelligence-foundation-check.mjs). This file is the whole
   contract the server store + callable need, dependency-free.

   Combines, in ONE file (same discipline as norRegistryContract.js):
     • corpus-provenance-contract.js
     • observation-lifecycle-contract.js
     • corpus-document-contract.js
     • corpus-observation-contract.js
     • corpus-store-contract.js  (envelope + errors + method list)
     • corpus-observation-record.js  (observationIdFrom, CORPUS_AUDIT_EVENTS,
       mergeObservationOccurrence)
   ============================================================ */

/* ── schemas ───────────────────────────────────────────────────────── */
const CORPUS_PROVENANCE_SCHEMA = 'corpus-provenance@1';
const OBSERVATION_LIFECYCLE_SCHEMA = 'corpus-observation-lifecycle@1';
const CORPUS_DOCUMENT_SCHEMA = 'corpus-document@1';
const CORPUS_OBSERVATION_SCHEMA = 'corpus-observation@1';
const CORPUS_STORE_SCHEMA = 'corpus-store@1';

/* ── provenance vocab ──────────────────────────────────────────────── */
const EXTRACTION_METHOD = Object.freeze({
  TEXT_LAYER: 'text_layer',
  OCR: 'ocr',
  STRUCTURE_PARSE: 'structure_parse',
  VISUAL_ANALYSIS: 'visual_analysis',
  MANUAL: 'manual',
  UNKNOWN: 'unknown',
});
const COORDINATE_SPACE = Object.freeze({
  PDF_POINTS: 'pdf_points',
  PIXELS: 'pixels',
  NORMALIZED: 'normalized',
  UNKNOWN: 'unknown',
});
const UNKNOWN_REGION = Object.freeze({
  x: null, y: null, width: null, height: null, coordinateSpace: COORDINATE_SPACE.UNKNOWN,
});

/* ── observation lifecycle ─────────────────────────────────────────── */
const OBSERVATION_LIFECYCLE = Object.freeze({
  OBSERVED: 'observed',
  CANDIDATE: 'candidate',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DEPRECATED: 'deprecated',
});
const OBSERVATION_LIFECYCLE_GRAPH = Object.freeze({
  [OBSERVATION_LIFECYCLE.OBSERVED]: Object.freeze([OBSERVATION_LIFECYCLE.CANDIDATE, OBSERVATION_LIFECYCLE.REJECTED]),
  [OBSERVATION_LIFECYCLE.CANDIDATE]: Object.freeze([OBSERVATION_LIFECYCLE.APPROVED, OBSERVATION_LIFECYCLE.REJECTED, OBSERVATION_LIFECYCLE.OBSERVED]),
  [OBSERVATION_LIFECYCLE.APPROVED]: Object.freeze([OBSERVATION_LIFECYCLE.DEPRECATED]),
  [OBSERVATION_LIFECYCLE.REJECTED]: Object.freeze([OBSERVATION_LIFECYCLE.OBSERVED]),
  [OBSERVATION_LIFECYCLE.DEPRECATED]: Object.freeze([OBSERVATION_LIFECYCLE.APPROVED]),
});
const OBSERVATION_HUMAN_GATED_STATES = Object.freeze([OBSERVATION_LIFECYCLE.APPROVED]);
function canObservationTransition(from, to) {
  const r = OBSERVATION_LIFECYCLE_GRAPH[from];
  return Array.isArray(r) && r.includes(to);
}
function isObservationHumanGated(to) {
  return OBSERVATION_HUMAN_GATED_STATES.includes(to);
}
function isObservationLifecycleState(s) {
  return Object.values(OBSERVATION_LIFECYCLE).includes(s);
}

/* ── document vocab ────────────────────────────────────────────────── */
const CORPUS_DOCUMENT_TYPE = Object.freeze({
  NOR: 'NOR',
  NOTA_ORGANISASI: 'NOTA_ORGANISASI',
  MEMORANDUM: 'MEMORANDUM',
  LEGACY: 'LEGACY',
  UNKNOWN: 'UNKNOWN',
});
const CORPUS_DOCUMENT_ERA = Object.freeze({
  HISTORICAL: 'historical',
  CURRENT: 'current',
  TRANSITIONAL: 'transitional',
  UNKNOWN: 'unknown',
});
const CORPUS_INGESTION_STATUS = Object.freeze({
  PENDING: 'pending',
  RECEIVED: 'received',
  STORED: 'stored',
  DUPLICATE: 'duplicate',
  FAILED: 'failed',
});
const CORPUS_INGESTION_STATUS_GRAPH = Object.freeze({
  [CORPUS_INGESTION_STATUS.PENDING]: Object.freeze([CORPUS_INGESTION_STATUS.RECEIVED, CORPUS_INGESTION_STATUS.DUPLICATE, CORPUS_INGESTION_STATUS.FAILED]),
  [CORPUS_INGESTION_STATUS.RECEIVED]: Object.freeze([CORPUS_INGESTION_STATUS.STORED, CORPUS_INGESTION_STATUS.FAILED]),
  [CORPUS_INGESTION_STATUS.STORED]: Object.freeze([CORPUS_INGESTION_STATUS.FAILED]),
  [CORPUS_INGESTION_STATUS.DUPLICATE]: Object.freeze([]),
  [CORPUS_INGESTION_STATUS.FAILED]: Object.freeze([CORPUS_INGESTION_STATUS.PENDING]),
});
function canIngestionTransition(from, to) {
  const r = CORPUS_INGESTION_STATUS_GRAPH[from];
  return Array.isArray(r) && r.includes(to);
}
const CORPUS_ANALYSIS_STATUS = Object.freeze({
  PENDING: 'pending',
  TEXT_EXTRACTED: 'text_extracted',
  STRUCTURE_EXTRACTED: 'structure_extracted',
  VISUAL_ANALYZED: 'visual_analyzed',
  COMPLETED: 'completed',
  FAILED: 'failed',
});
const CORPUS_ANALYSIS_STATUS_GRAPH = Object.freeze({
  [CORPUS_ANALYSIS_STATUS.PENDING]: Object.freeze([CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED, CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED, CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED, CORPUS_ANALYSIS_STATUS.FAILED]),
  [CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED]: Object.freeze([CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED, CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED, CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.FAILED]),
  [CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED]: Object.freeze([CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED, CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.FAILED]),
  [CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED]: Object.freeze([CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.FAILED]),
  [CORPUS_ANALYSIS_STATUS.COMPLETED]: Object.freeze([CORPUS_ANALYSIS_STATUS.PENDING, CORPUS_ANALYSIS_STATUS.FAILED]),
  [CORPUS_ANALYSIS_STATUS.FAILED]: Object.freeze([CORPUS_ANALYSIS_STATUS.PENDING]),
});
function canAnalysisTransition(from, to) {
  const r = CORPUS_ANALYSIS_STATUS_GRAPH[from];
  return Array.isArray(r) && r.includes(to);
}
const CORPUS_CLASSIFICATION = Object.freeze({
  PUBLIC: 'public',
  INTERNAL: 'internal',
  RESTRICTED: 'restricted',
});

/* ── observation vocab ─────────────────────────────────────────────── */
const OBSERVATION_MODALITY = Object.freeze({
  TEXT: 'text',
  STRUCTURE: 'structure',
  VISUAL: 'visual',
});
const OBSERVATION_CATEGORY = Object.freeze({
  TERMINOLOGY: 'terminology',
  OPENING_PATTERN: 'opening_pattern',
  CLOSING_PATTERN: 'closing_pattern',
  RECIPIENT_CONVENTION: 'recipient_convention',
  SUBJECT_CONVENTION: 'subject_convention',
  DATE_CONVENTION: 'date_convention',
  ATTACHMENT_CONVENTION: 'attachment_convention',
  COPY_CONVENTION: 'copy_convention',
  SIGNATURE_WORDING: 'signature_wording',
  BODY_STRUCTURE: 'body_structure',
  FORMAL_TONE: 'formal_tone',
  PREFERRED_PHRASE: 'preferred_phrase',
  ORGANIZATIONAL_TERM: 'organizational_term',
  STRUCTURE: 'structure',
  LAYOUT: 'layout',
});
const OBSERVATION_CATEGORY_LIST = Object.freeze(Object.values(OBSERVATION_CATEGORY));
const OBSERVATION_CATEGORY_DEFAULT_MODALITY = Object.freeze({
  [OBSERVATION_CATEGORY.LAYOUT]: OBSERVATION_MODALITY.VISUAL,
  [OBSERVATION_CATEGORY.STRUCTURE]: OBSERVATION_MODALITY.STRUCTURE,
  [OBSERVATION_CATEGORY.BODY_STRUCTURE]: OBSERVATION_MODALITY.STRUCTURE,
});

/* ── store envelope + errors ───────────────────────────────────────── */
const CORPUS_STORE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  DUPLICATE_DOCUMENT: 'DUPLICATE_DOCUMENT',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});
function corpusSuccess(data) {
  return Object.freeze({ ok: true, data: data === undefined ? null : data, error: null });
}
function corpusFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}
const CORPUS_STORE_CONTRACT = Object.freeze({
  schema: CORPUS_STORE_SCHEMA,
  methods: Object.freeze(['ingestDocument', 'getDocument', 'listDocuments', 'getObservations', 'recordObservation', 'setAnalysisStatus']),
  errorCodes: CORPUS_STORE_ERRORS,
});

/* ── audit vocab ───────────────────────────────────────────────────── */
const CORPUS_AUDIT_EVENTS = Object.freeze({
  DOCUMENT_INGESTED: 'CORPUS_DOCUMENT_INGESTED',
  DOCUMENT_DUPLICATE: 'CORPUS_DOCUMENT_DUPLICATE',
  OBSERVATION_RECORDED: 'CORPUS_OBSERVATION_RECORDED',
  OBSERVATION_MERGED: 'CORPUS_OBSERVATION_MERGED',
  ANALYSIS_ADVANCED: 'CORPUS_ANALYSIS_ADVANCED',
  OBSERVATION_LIFECYCLE_CHANGED: 'CORPUS_OBSERVATION_LIFECYCLE_CHANGED',
});

/* ── helpers ───────────────────────────────────────────────────────── */
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function str(v) { return v == null ? null : String(v); }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

/* ── deterministic ids ─────────────────────────────────────────────── */
function corpusDocumentIdFromChecksum(checksum) {
  const raw = checksum == null ? '' : String(checksum);
  const safe = raw.replace(/[.$#[\]/\s\x00-\x1f\x7f]/g, '_');
  return `corpus_${safe}`;
}
function slug(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[.$#[\]/\s\x00-\x1f\x7f]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}
function observationIdFrom(documentId, category, key) {
  return `obs_${slug(documentId)}__${slug(category)}__${slug(key)}`;
}

/* ── region + provenance ───────────────────────────────────────────── */
function makeCorpusRegion(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const cx = num(s.x); const cy = num(s.y); const cw = num(s.width); const ch = num(s.height);
  const hasAny = cx !== null || cy !== null || cw !== null || ch !== null;
  const space = Object.values(COORDINATE_SPACE).includes(s.coordinateSpace) ? s.coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  return Object.freeze({ x: cx, y: cy, width: cw, height: ch, coordinateSpace: hasAny ? space : COORDINATE_SPACE.UNKNOWN });
}
function isCorpusRegion(r) {
  if (!r || typeof r !== 'object') return false;
  for (const k of ['x', 'y', 'width', 'height']) {
    if (!(k in r)) return false;
    if (r[k] !== null && !(typeof r[k] === 'number' && Number.isFinite(r[k]))) return false;
  }
  return Object.values(COORDINATE_SPACE).includes(r.coordinateSpace);
}
function makeCorpusProvenance(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const pn = Number(s.pageNumber);
  return Object.freeze({
    schema: CORPUS_PROVENANCE_SCHEMA,
    sourceDocumentId: s.sourceDocumentId ? String(s.sourceDocumentId) : '',
    sourceFileId: s.sourceFileId == null ? null : String(s.sourceFileId),
    pageNumber: Number.isInteger(pn) && pn >= 1 ? pn : null,
    region: s.region == null ? null : makeCorpusRegion(s.region),
    extractionMethod: Object.values(EXTRACTION_METHOD).includes(s.extractionMethod) ? s.extractionMethod : EXTRACTION_METHOD.UNKNOWN,
    extractedAt: String(s.extractedAt || new Date().toISOString()),
    confidence: clamp01(s.confidence),
  });
}
function isCorpusProvenance(p) {
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
function isCorpusProvenanceList(list) {
  return Array.isArray(list) && list.length >= 1 && list.every(isCorpusProvenance);
}

/* ── document ──────────────────────────────────────────────────────── */
const CORPUS_DOCUMENT_FIELDS = Object.freeze([
  'schema', 'documentId', 'sourceFileId', 'checksum',
  'documentType', 'typeConfidence', 'documentEra', 'eraConfidence',
  'title', 'source', 'sourcePath', 'originalFilename', 'mimeType',
  'pageCount', 'language', 'sourceDate',
  'ingestionStatus', 'analysisStatus',
  'ownerId', 'tenantId', 'duplicateOfId',
  'createdAt', 'analyzedAt', 'provenance', 'classification',
]);
function makeCorpusDocument(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const cs = String(s.checksum || '');
  const resolvedId = s.documentId || corpusDocumentIdFromChecksum(cs);
  const type = Object.values(CORPUS_DOCUMENT_TYPE).includes(s.documentType) ? s.documentType : CORPUS_DOCUMENT_TYPE.UNKNOWN;
  const era = Object.values(CORPUS_DOCUMENT_ERA).includes(s.documentEra) ? s.documentEra : CORPUS_DOCUMENT_ERA.UNKNOWN;
  let eraConf = clamp01(s.eraConfidence);
  if (era === CORPUS_DOCUMENT_ERA.UNKNOWN && eraConf >= 1) eraConf = 0.99;
  const pc = Number(s.pageCount);
  const createdAt = String(s.createdAt || new Date().toISOString());
  const prov = s.provenance && typeof s.provenance === 'object' && !Array.isArray(s.provenance) ? s.provenance : {};
  return Object.freeze({
    schema: CORPUS_DOCUMENT_SCHEMA,
    documentId: resolvedId,
    sourceFileId: str(s.sourceFileId),
    checksum: cs,
    documentType: type,
    typeConfidence: clamp01(s.typeConfidence),
    documentEra: era,
    eraConfidence: eraConf,
    title: String(s.title || ''),
    source: str(s.source),
    sourcePath: str(s.sourcePath),
    originalFilename: str(s.originalFilename),
    mimeType: str(s.mimeType),
    pageCount: Number.isInteger(pc) && pc >= 1 ? pc : null,
    language: str(s.language),
    sourceDate: str(s.sourceDate),
    ingestionStatus: Object.values(CORPUS_INGESTION_STATUS).includes(s.ingestionStatus) ? s.ingestionStatus : CORPUS_INGESTION_STATUS.PENDING,
    analysisStatus: Object.values(CORPUS_ANALYSIS_STATUS).includes(s.analysisStatus) ? s.analysisStatus : CORPUS_ANALYSIS_STATUS.PENDING,
    ownerId: str(s.ownerId),
    tenantId: str(s.tenantId),
    duplicateOfId: str(s.duplicateOfId),
    createdAt,
    analyzedAt: s.analyzedAt == null ? null : String(s.analyzedAt),
    provenance: Object.freeze({
      ingestedBy: prov.ingestedBy == null ? null : String(prov.ingestedBy),
      ingestedAt: String(prov.ingestedAt || createdAt),
      method: str(prov.method) || 'upload',
      note: prov.note == null ? null : String(prov.note),
    }),
    classification: Object.values(CORPUS_CLASSIFICATION).includes(s.classification) ? s.classification : CORPUS_CLASSIFICATION.RESTRICTED,
  });
}
function isCorpusDocument(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.schema !== CORPUS_DOCUMENT_SCHEMA) return false;
  if (typeof d.documentId !== 'string' || !d.documentId) return false;
  if (typeof d.checksum !== 'string' || !d.checksum) return false;
  if (!Object.values(CORPUS_DOCUMENT_TYPE).includes(d.documentType)) return false;
  if (!Object.values(CORPUS_DOCUMENT_ERA).includes(d.documentEra)) return false;
  if (typeof d.typeConfidence !== 'number' || d.typeConfidence < 0 || d.typeConfidence > 1) return false;
  if (typeof d.eraConfidence !== 'number' || d.eraConfidence < 0 || d.eraConfidence > 1) return false;
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

/* ── observation ───────────────────────────────────────────────────── */
const CORPUS_OBSERVATION_FIELDS = Object.freeze([
  'schema', 'observationId', 'documentId', 'category', 'modality', 'key',
  'observedValue', 'normalizedValue', 'observation',
  'provenance', 'confidence', 'occurrenceCount',
  'lifecycleState', 'approvedBy', 'approvedAt', 'preferenceRationale',
  'createdAt', 'updatedAt',
]);
function makeCorpusObservation(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const cat = OBSERVATION_CATEGORY_LIST.includes(s.category) ? s.category : String(s.category || '');
  const mod = Object.values(OBSERVATION_MODALITY).includes(s.modality)
    ? s.modality
    : (OBSERVATION_CATEGORY_DEFAULT_MODALITY[cat] || OBSERVATION_MODALITY.TEXT);
  const state = isObservationLifecycleState(s.lifecycleState) ? s.lifecycleState : OBSERVATION_LIFECYCLE.OBSERVED;
  const isApproved = state === OBSERVATION_LIFECYCLE.APPROVED;
  const oc = Number(s.occurrenceCount);
  const provList = (Array.isArray(s.provenance) ? s.provenance : [])
    .map((p) => (p && p.schema === CORPUS_PROVENANCE_SCHEMA ? p : makeCorpusProvenance(p || {})));
  const created = String(s.createdAt || new Date().toISOString());
  return Object.freeze({
    schema: CORPUS_OBSERVATION_SCHEMA,
    observationId: String(s.observationId || ''),
    documentId: s.documentId ? String(s.documentId) : '',
    category: cat,
    modality: mod,
    key: String(s.key || ''),
    observedValue: s.observedValue == null ? null : String(s.observedValue),
    normalizedValue: null,
    observation: s.observation && typeof s.observation === 'object' && !Array.isArray(s.observation) ? s.observation : null,
    provenance: Object.freeze(provList),
    confidence: clamp01(s.confidence),
    occurrenceCount: Number.isInteger(oc) && oc >= 1 ? oc : 1,
    lifecycleState: state,
    approvedBy: isApproved && s.approvedBy ? String(s.approvedBy) : null,
    approvedAt: isApproved && s.approvedAt ? String(s.approvedAt) : null,
    preferenceRationale: isApproved && typeof s.preferenceRationale === 'string' && s.preferenceRationale.trim() ? s.preferenceRationale : null,
    createdAt: created,
    updatedAt: s.updatedAt == null ? created : String(s.updatedAt),
  });
}
function isCorpusObservation(o) {
  if (!o || typeof o !== 'object') return false;
  if (o.schema !== CORPUS_OBSERVATION_SCHEMA) return false;
  if (typeof o.observationId !== 'string' || !o.observationId) return false;
  if (typeof o.documentId !== 'string' || !o.documentId) return false;
  if (!OBSERVATION_CATEGORY_LIST.includes(o.category)) return false;
  if (!Object.values(OBSERVATION_MODALITY).includes(o.modality)) return false;
  if (typeof o.key !== 'string' || !o.key) return false;
  if (o.observedValue !== null && typeof o.observedValue !== 'string') return false;
  if (o.normalizedValue !== null) return false;
  if (o.observation !== null && (typeof o.observation !== 'object' || Array.isArray(o.observation))) return false;
  if (!isCorpusProvenanceList(o.provenance)) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (!Number.isInteger(o.occurrenceCount) || o.occurrenceCount < 1) return false;
  if (!isObservationLifecycleState(o.lifecycleState)) return false;
  if (o.lifecycleState === OBSERVATION_LIFECYCLE.APPROVED) {
    if (typeof o.approvedBy !== 'string' || !o.approvedBy) return false;
    if (typeof o.approvedAt !== 'string' || !o.approvedAt) return false;
    if (typeof o.preferenceRationale !== 'string' || !o.preferenceRationale.trim()) return false;
  } else if (o.approvedBy !== null || o.approvedAt !== null || o.preferenceRationale !== null) {
    return false;
  }
  if (typeof o.createdAt !== 'string' || !o.createdAt) return false;
  if (typeof o.updatedAt !== 'string' || !o.updatedAt) return false;
  return CORPUS_OBSERVATION_FIELDS.every((f) => f in o);
}
function isCorpusObservationList(list) {
  return Array.isArray(list) && list.every(isCorpusObservation);
}

/* ── evidence accumulation (mirror of corpus-observation-record.js) ── */
function provKey(p) {
  return [
    p && p.sourceDocumentId, p && p.sourceFileId, p && p.pageNumber,
    p && p.region && `${p.region.x},${p.region.y},${p.region.width},${p.region.height},${p.region.coordinateSpace}`,
    p && p.extractionMethod, p && p.extractedAt,
  ].join('|');
}
function mergeObservationOccurrence(existing, incoming) {
  if (!isCorpusObservation(existing)) return { next: incoming, changed: true };
  const seen = new Set(existing.provenance.map(provKey));
  const addedProv = (incoming && Array.isArray(incoming.provenance) ? incoming.provenance : []).filter((p) => !seen.has(provKey(p)));
  const mergedProv = existing.provenance.concat(addedProv);
  const nextCount = existing.occurrenceCount + (incoming && incoming.occurrenceCount ? incoming.occurrenceCount : 1);
  const nextConf = Math.max(existing.confidence, (incoming && incoming.confidence) || 0);
  const changed = addedProv.length > 0 || nextCount !== existing.occurrenceCount || nextConf !== existing.confidence;
  if (!changed) return { next: existing, changed: false };
  const next = makeCorpusObservation(Object.assign({}, existing, {
    provenance: mergedProv,
    occurrenceCount: nextCount,
    confidence: nextConf,
    updatedAt: (incoming && (incoming.updatedAt || incoming.createdAt)) || new Date().toISOString(),
  }));
  return { next, changed: true };
}

module.exports = {
  // schemas
  CORPUS_PROVENANCE_SCHEMA, OBSERVATION_LIFECYCLE_SCHEMA, CORPUS_DOCUMENT_SCHEMA,
  CORPUS_OBSERVATION_SCHEMA, CORPUS_STORE_SCHEMA,
  // provenance
  EXTRACTION_METHOD, COORDINATE_SPACE, UNKNOWN_REGION,
  makeCorpusRegion, isCorpusRegion, makeCorpusProvenance, isCorpusProvenance, isCorpusProvenanceList,
  // lifecycle
  OBSERVATION_LIFECYCLE, OBSERVATION_LIFECYCLE_GRAPH, OBSERVATION_HUMAN_GATED_STATES,
  canObservationTransition, isObservationHumanGated, isObservationLifecycleState,
  // document
  CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA, CORPUS_CLASSIFICATION,
  CORPUS_INGESTION_STATUS, CORPUS_INGESTION_STATUS_GRAPH, canIngestionTransition,
  CORPUS_ANALYSIS_STATUS, CORPUS_ANALYSIS_STATUS_GRAPH, canAnalysisTransition,
  CORPUS_DOCUMENT_FIELDS, corpusDocumentIdFromChecksum, makeCorpusDocument, isCorpusDocument,
  // observation
  OBSERVATION_MODALITY, OBSERVATION_CATEGORY, OBSERVATION_CATEGORY_LIST,
  OBSERVATION_CATEGORY_DEFAULT_MODALITY, CORPUS_OBSERVATION_FIELDS,
  makeCorpusObservation, isCorpusObservation, isCorpusObservationList,
  observationIdFrom, mergeObservationOccurrence,
  // store envelope
  CORPUS_STORE_ERRORS, corpusSuccess, corpusFailure, CORPUS_STORE_CONTRACT,
  // audit
  CORPUS_AUDIT_EVENTS,
};
