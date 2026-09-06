/* ============================================================
   intelligence-corpus-contract-check.mjs — NOR & Memorandum Corpus
   Acquisition Foundation (V2, Phase 5.x.1)

   PURE node test (no browser, no Firebase, no network). Proves the
   Phase 5.x.1 CONTRACTS and the mandatory separations (§18):

     • CorpusDocument — valid; invalid documentType → UNKNOWN; invalid era
       → UNKNOWN with confidence < 1; invalid analysisStatus rejected;
       pageCount null when unknown (never fabricated); deterministic id
       from checksum (dedup identity, §12)
     • CorpusProvenance — required sourceDocumentId; region with every
       coordinate null ("unknown") accepted; fabricated coords not required
     • CorpusObservation — text / terminology / structural / visual shapes;
       >= 1 provenance REQUIRED; normalizedValue ALWAYS null; confidence
       bounds; occurrenceCount; lifecycle starts 'observed'
     • Observation lifecycle graph — observed → candidate → approved is
       human-gated; a single anomalous doc cannot flip evidence
     • SEPARATIONS — observed ≠ approved; candidate ≠ approved; confidence
       ≠ authority; documentType ≠ organizational rule; historical ≠ current
     • advanceObservationLifecycle — no automatic path to 'approved'
     • the corpus store facade is DORMANT (Null backend, NOT_IMPLEMENTED)

   Run:  node scripts/intelligence-corpus-contract-check.mjs   (exit 0 = pass)
   ============================================================ */

import {
  CORPUS_DOCUMENT_SCHEMA, CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA,
  CORPUS_INGESTION_STATUS, CORPUS_ANALYSIS_STATUS, CORPUS_ANALYSIS_STATUS_GRAPH,
  CORPUS_CLASSIFICATION, CORPUS_DOCUMENT_FIELDS,
  canAnalysisTransition, canIngestionTransition, corpusDocumentIdFromChecksum,
  makeCorpusDocument, isCorpusDocument,
} from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import {
  CORPUS_PROVENANCE_SCHEMA, EXTRACTION_METHOD, COORDINATE_SPACE, UNKNOWN_REGION,
  makeCorpusRegion, isCorpusRegion, makeCorpusProvenance, isCorpusProvenance, isCorpusProvenanceList,
} from '../src/intelligence/corpus/contracts/corpus-provenance-contract.js';
import {
  CORPUS_OBSERVATION_SCHEMA, OBSERVATION_MODALITY, OBSERVATION_CATEGORY, CORPUS_OBSERVATION_FIELDS,
  makeCorpusObservation, isCorpusObservation, isCorpusObservationList,
} from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import {
  OBSERVATION_LIFECYCLE, OBSERVATION_LIFECYCLE_GRAPH, OBSERVATION_HUMAN_GATED_STATES,
  canObservationTransition, isObservationHumanGated,
} from '../src/intelligence/corpus/contracts/observation-lifecycle-contract.js';
import {
  CORPUS_STORE_ERRORS, CORPUS_STORE_CONTRACT, isCorpusBackend,
} from '../src/intelligence/corpus/contracts/corpus-store-contract.js';
import {
  observationIdFrom, makeObservationFromExtraction, mergeObservationOccurrence,
  advanceObservationLifecycle, CORPUS_AUDIT_EVENTS,
} from '../src/intelligence/corpus/corpus-observation-record.js';
import * as store from '../src/intelligence/corpus/corpus-store.js';
import { isKnowledgeItem } from '../src/knowledge/contracts/knowledge-item-contract.js';
import { isArchiveRecord } from '../src/organizational-memory/contracts/archive-record-contract.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-03T00:00:00.000Z';
const prov1 = (over = {}) => makeCorpusProvenance({
  sourceDocumentId: 'corpus_abc', sourceFileId: 'file:' + '0'.repeat(64),
  pageNumber: 1, extractionMethod: EXTRACTION_METHOD.TEXT_LAYER, extractedAt: AT, confidence: 0.9, ...over,
});

/* ════════════════════════════════════════════════════════════════════════ */

section('CorpusDocument contract (§4, §5, §11, §12, §18)');
check(CORPUS_DOCUMENT_SCHEMA === 'corpus-document@1', `schema is ${CORPUS_DOCUMENT_SCHEMA}`);
check(Object.values(CORPUS_DOCUMENT_TYPE).join(',') === 'NOR,NOTA_ORGANISASI,MEMORANDUM,LEGACY,UNKNOWN',
  'documentType vocabulary preserves the historical distinctions (§4, §17)');
const d1 = makeCorpusDocument({
  checksum: 'deadbeef01', documentType: CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, documentEra: CORPUS_DOCUMENT_ERA.HISTORICAL,
  eraConfidence: 0.8, typeConfidence: 0.9, title: 'Nota Organisasi Sarpras 113', pageCount: 2, language: 'id',
  originalFilename: 'NOR-113.pdf', sourcePath: 'Petty Cash Center/uploads/NOR-113.pdf', createdAt: AT,
});
check(isCorpusDocument(d1) && Object.isFrozen(d1), 'makeCorpusDocument() → a valid frozen CorpusDocument');
check(d1.documentId === corpusDocumentIdFromChecksum('deadbeef01') && d1.documentId === 'corpus_deadbeef01',
  'documentId is deterministic from the content checksum (§12 dedup identity)');
check(CORPUS_DOCUMENT_FIELDS.every((f) => f in d1), 'every canonical field is present');
check(d1.classification === CORPUS_CLASSIFICATION.RESTRICTED, 'classification defaults to RESTRICTED (§13 — corpus is controlled data)');
check(d1.ingestionStatus === CORPUS_INGESTION_STATUS.PENDING && d1.analysisStatus === CORPUS_ANALYSIS_STATUS.PENDING,
  'ingestionStatus and analysisStatus are SEPARATE lifecycles, both start pending (§11)');

section('CorpusDocument — ambiguity is preserved, certainty is never fabricated (§4, §5, §17)');
const unknownDoc = makeCorpusDocument({ checksum: 'memo362', documentType: 'Memo', documentEra: 'jadul', eraConfidence: 1, title: 'Memo Sarpras 362' });
check(unknownDoc.documentType === CORPUS_DOCUMENT_TYPE.UNKNOWN, 'an unrecognised documentType ("Memo") → UNKNOWN, never silently coerced to NOR');
check(unknownDoc.documentEra === CORPUS_DOCUMENT_ERA.UNKNOWN, 'an unrecognised era → UNKNOWN');
check(unknownDoc.eraConfidence < 1, 'an UNKNOWN era can NEVER carry full certainty — eraConfidence clamped below 1 (§5)');
check(isCorpusDocument(unknownDoc), 'the UNKNOWN/uncertain document is still a valid CorpusDocument (ambiguity preserved, not rejected)');
check(isCorpusDocument({ ...unknownDoc, documentEra: 'unknown', eraConfidence: 1 }) === false,
  'the validator REJECTS an UNKNOWN era claiming confidence 1 (§5 invariant enforced)');
const noPages = makeCorpusDocument({ checksum: 'x1', pageCount: 0 });
check(noPages.pageCount === null, 'pageCount 0 / unknown → null, never a fabricated count (§16)');
check(makeCorpusDocument({ checksum: 'x2', pageCount: 'lots' }).pageCount === null, 'a non-numeric pageCount → null');
check(isCorpusDocument({ ...d1, analysisStatus: 'sideways' }) === false, 'an invalid analysisStatus is rejected');
check(isCorpusDocument({ ...d1, checksum: '' }) === false, 'a CorpusDocument with no checksum is invalid (§12 needs the dedup key)');

section('analysis + ingestion lifecycle graphs (§11)');
check(canAnalysisTransition(CORPUS_ANALYSIS_STATUS.PENDING, CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED), 'pending → text_extracted is legal');
check(canAnalysisTransition(CORPUS_ANALYSIS_STATUS.PENDING, CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED),
  'pending → visual_analyzed is legal (visual analysis need not wait for structure — §16)');
check(!canAnalysisTransition(CORPUS_ANALYSIS_STATUS.COMPLETED, CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED), 'completed → text_extracted is NOT legal');
check(canAnalysisTransition(CORPUS_ANALYSIS_STATUS.FAILED, CORPUS_ANALYSIS_STATUS.PENDING), 'failed → pending (retry) is legal');
check(canIngestionTransition(CORPUS_INGESTION_STATUS.RECEIVED, CORPUS_INGESTION_STATUS.STORED)
  && !canIngestionTransition(CORPUS_INGESTION_STATUS.DUPLICATE, CORPUS_INGESTION_STATUS.STORED),
  'ingestion graph: received → stored legal; a duplicate is terminal');
check(Object.keys(CORPUS_ANALYSIS_STATUS_GRAPH).length === Object.values(CORPUS_ANALYSIS_STATUS).length, 'every analysis state has a graph entry');

section('CorpusProvenance contract (§6, §16) — every observation traces to source');
check(CORPUS_PROVENANCE_SCHEMA === 'corpus-provenance@1', `schema is ${CORPUS_PROVENANCE_SCHEMA}`);
const p = prov1();
check(isCorpusProvenance(p) && Object.isFrozen(p), 'makeCorpusProvenance() → a valid frozen record');
check(isCorpusProvenance({ ...p, sourceDocumentId: '' }) === false, 'provenance with NO sourceDocumentId is invalid (§6 — untraceable observation)');
check(isCorpusRegion(UNKNOWN_REGION) && UNKNOWN_REGION.x === null && UNKNOWN_REGION.coordinateSpace === COORDINATE_SPACE.UNKNOWN,
  'UNKNOWN_REGION is a valid region with every coordinate null (§16 — no fabricated geometry)');
const pv = makeCorpusProvenance({ sourceDocumentId: 'corpus_abc', extractionMethod: EXTRACTION_METHOD.VISUAL_ANALYSIS, extractedAt: AT,
  region: { x: 400, y: 60, width: 150, height: 40, coordinateSpace: COORDINATE_SPACE.PDF_POINTS } });
check(isCorpusProvenance(pv) && pv.region.coordinateSpace === 'pdf_points', 'a visual observation may carry a real page region + coordinateSpace');
const pvNoCoords = makeCorpusRegion({ coordinateSpace: COORDINATE_SPACE.PIXELS });
check(pvNoCoords.coordinateSpace === COORDINATE_SPACE.UNKNOWN, 'a coordinateSpace with NO coordinates is forced back to "unknown" (no false claim of geometry)');
check(makeCorpusProvenance({ sourceDocumentId: 'x', confidence: 5 }).confidence === 1
  && makeCorpusProvenance({ sourceDocumentId: 'x', confidence: -1 }).confidence === 0, 'provenance confidence is clamped to 0..1');
check(isCorpusProvenanceList([p]) && !isCorpusProvenanceList([]), 'isCorpusProvenanceList requires >= 1 valid entry');

section('CorpusObservation contract — text / terminology / structural / visual (§7, §8)');
check(CORPUS_OBSERVATION_SCHEMA === 'corpus-observation@1', `schema is ${CORPUS_OBSERVATION_SCHEMA}`);
const term = makeCorpusObservation({
  observationId: 'obs_1', documentId: 'corpus_abc', category: OBSERVATION_CATEGORY.RECIPIENT_CONVENTION,
  key: 'recipient_label', observedValue: 'Kepada Yth.', provenance: [prov1()], confidence: 0.97, createdAt: AT,
});
check(isCorpusObservation(term) && Object.isFrozen(term), 'a terminology observation is valid + frozen');
check(term.modality === OBSERVATION_MODALITY.TEXT && term.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED,
  'default modality is TEXT; lifecycleState starts "observed"');
check(term.normalizedValue === null, 'normalizedValue is ALWAYS null at this layer (§7 — normalisation is separate)');
check(CORPUS_OBSERVATION_FIELDS.every((f) => f in term), 'every canonical observation field is present');

const layout = makeCorpusObservation({
  observationId: 'obs_2', documentId: 'corpus_abc', category: OBSERVATION_CATEGORY.LAYOUT, key: 'signature_block',
  observation: { anchor: 'bottom-right', alignment: 'right', relativePagePosition: { x: 0.72, y: 0.88 } },
  provenance: [makeCorpusProvenance({ sourceDocumentId: 'corpus_abc', pageNumber: 1, extractionMethod: EXTRACTION_METHOD.VISUAL_ANALYSIS,
    extractedAt: AT, region: { x: 360, y: 40, width: 180, height: 90, coordinateSpace: COORDINATE_SPACE.PDF_POINTS } })],
  confidence: 0.6, createdAt: AT,
});
check(isCorpusObservation(layout) && layout.modality === OBSERVATION_MODALITY.VISUAL,
  'a layout observation defaults to VISUAL modality and carries a structured `observation` payload the text layer cannot express (§8)');
check(layout.observedValue === null, 'a pure-visual observation may have observedValue null');

const struct = makeCorpusObservation({
  observationId: 'obs_3', documentId: 'corpus_abc', category: OBSERVATION_CATEGORY.STRUCTURE, key: 'meta_block_order',
  observation: { fields: ['No', 'Kepada', 'Dari', 'Perihal', 'Lampiran'] }, provenance: [prov1()], confidence: 0.8, createdAt: AT,
});
check(isCorpusObservation(struct) && struct.modality === OBSERVATION_MODALITY.STRUCTURE, 'a structure observation defaults to STRUCTURE modality');

check(isCorpusObservation({ ...term, provenance: [] }) === false, 'an observation with ZERO provenance is invalid (§6)');
check(isCorpusObservation({ ...term, normalizedValue: 'Kepada Yth.' }) === false, 'an observation with a non-null normalizedValue is invalid (§7)');
check(isCorpusObservation({ ...term, occurrenceCount: 0 }) === false, 'occurrenceCount must be >= 1');
check(isCorpusObservationList([term, layout, struct]), 'isCorpusObservationList accepts the batch');

section('THE MANDATORY SEPARATIONS (§9, §10, §18)');
// observed != approved ; confidence != authority
check(term.confidence === 0.97 && term.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED,
  'confidence 0.97 with lifecycleState "observed" — high extraction confidence is NOT organizational approval (confidence ≠ authority)');
check(term.approvedBy === null && term.approvedAt === null && term.preferenceRationale === null,
  'an "observed" observation carries NO approval fields (observed ≠ approved)');
const fakeApproved = makeCorpusObservation({ ...term, lifecycleState: OBSERVATION_LIFECYCLE.APPROVED });
check(fakeApproved.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED || !isCorpusObservation(fakeApproved),
  'you cannot conjure an "approved" observation by just setting the field — approval fields would be missing, so it is invalid or forced back to observed');
// candidate != approved
check(OBSERVATION_LIFECYCLE.CANDIDATE !== OBSERVATION_LIFECYCLE.APPROVED
  && !OBSERVATION_HUMAN_GATED_STATES.includes(OBSERVATION_LIFECYCLE.CANDIDATE), 'candidate is NOT a human-gated / authoritative state (candidate ≠ approved)');
// documentType != organizational rule
check(isKnowledgeItem(d1) === false, 'a CorpusDocument is NOT a KnowledgeItem — a document type is not an organizational rule');
check(isKnowledgeItem(term) === false, 'a CorpusObservation is NOT a KnowledgeItem — an observation is not an approved rule');
check(isArchiveRecord(d1) === false, 'a CorpusDocument is NOT an ArchiveRecord — a corpus upload is a different axis from a V1 NOR record');
// historical != current
check(CORPUS_DOCUMENT_ERA.HISTORICAL !== CORPUS_DOCUMENT_ERA.CURRENT
  && d1.documentEra === CORPUS_DOCUMENT_ERA.HISTORICAL, 'documentEra keeps "what was historically used" distinct from "what is currently preferred" (historical ≠ current)');

section('observation lifecycle graph + human gate (§9, §15)');
check(Object.values(OBSERVATION_LIFECYCLE).join(',') === 'observed,candidate,approved,rejected,deprecated', 'lifecycle states');
check(canObservationTransition('observed', 'candidate') && !canObservationTransition('observed', 'approved'),
  'observed → candidate legal; observed → approved is NOT (must pass through candidate + review)');
check(canObservationTransition('candidate', 'approved'), 'candidate → approved is a legal edge…');
check(isObservationHumanGated('approved') && OBSERVATION_HUMAN_GATED_STATES.length === 1, '…but "approved" is the one human-gated state — nothing enters it automatically');
check(canObservationTransition('rejected', 'observed') && canObservationTransition('candidate', 'observed'),
  'a rejected / candidate observation can be re-opened for more evidence (a single anomaly never wins by default)');
check(OBSERVATION_LIFECYCLE_GRAPH.deprecated.includes('approved'), 'deprecated → approved (revive) is legal');

section('advanceObservationLifecycle — NO automatic path to approved (§15)');
const cand = advanceObservationLifecycle(term, OBSERVATION_LIFECYCLE.CANDIDATE, { actorId: 'evan', at: AT });
check(cand.next && cand.next.lifecycleState === 'candidate', 'observed → candidate advances with just an actor');
const autoApprove = advanceObservationLifecycle(cand.next, OBSERVATION_LIFECYCLE.APPROVED, { actorId: 'evan', at: AT });
check(autoApprove.error === 'HUMAN_APPROVAL_REQUIRED', 'candidate → approved WITHOUT humanApproved + a written rationale → HUMAN_APPROVAL_REQUIRED');
const half = advanceObservationLifecycle(cand.next, OBSERVATION_LIFECYCLE.APPROVED, { actorId: 'evan', at: AT, humanApproved: true });
check(half.error === 'HUMAN_APPROVAL_REQUIRED', 'humanApproved:true but NO preferenceRationale → still refused');
const realApprove = advanceObservationLifecycle(cand.next, OBSERVATION_LIFECYCLE.APPROVED, {
  actorId: 'evan', at: AT, humanApproved: true, preferenceRationale: 'Konsisten di 27 NOR historis; disepakati sebagai konvensi baku.',
});
check(realApprove.next && realApprove.next.lifecycleState === 'approved'
  && realApprove.next.approvedBy === 'evan' && realApprove.next.preferenceRationale.length > 0,
  'candidate → approved SUCCEEDS only with an explicit human actor + a human-written rationale');
check(isCorpusObservation(realApprove.next), 'the approved observation is contract-valid (approval fields now populated)');
const skip = advanceObservationLifecycle(term, OBSERVATION_LIFECYCLE.APPROVED, { actorId: 'evan', at: AT, humanApproved: true, preferenceRationale: 'x' });
check(skip.error === 'ILLEGAL_TRANSITION', 'observed → approved directly is ILLEGAL_TRANSITION even with a human — the graph forbids the skip');

section('evidence accumulation NEVER promotes (§9, §15)');
const o1 = makeObservationFromExtraction({ documentId: 'corpus_abc', category: OBSERVATION_CATEGORY.RECIPIENT_CONVENTION,
  key: 'recipient_label', observedValue: 'Kepada Yth.', provenance: prov1({ extractedAt: AT }), confidence: 0.5, at: AT });
const o2 = makeObservationFromExtraction({ documentId: 'corpus_abc', category: OBSERVATION_CATEGORY.RECIPIENT_CONVENTION,
  key: 'recipient_label', observedValue: 'Kepada Yth.', provenance: prov1({ extractedAt: '2026-09-03T01:00:00.000Z' }), confidence: 0.9, at: AT });
check(o1.observationId === o2.observationId && o1.observationId === observationIdFrom('corpus_abc', OBSERVATION_CATEGORY.RECIPIENT_CONVENTION, 'recipient_label'),
  'observationIdFrom is deterministic — the same (doc, category, key) merges, does not duplicate (§12)');
const merged = mergeObservationOccurrence(o1, o2);
check(merged.changed && merged.next.occurrenceCount === 2 && merged.next.provenance.length === 2,
  'merging a second sighting bumps occurrenceCount + appends provenance');
check(merged.next.confidence === 0.9, 'merged confidence is the max of the two');
check(merged.next.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED, 'more evidence NEVER changes the lifecycle state — still "observed"');

section('corpus store facade — DORMANT (Null backend)');
check(store.getActiveCorpusBackendId() === 'null', 'the Null corpus backend is active by default');
check(CORPUS_STORE_CONTRACT.methods.join(',') === 'ingestDocument,getDocument,listDocuments,getObservations,recordObservation,setAnalysisStatus',
  'the backend method set is exactly the six §14 methods — NO approve/promote method');
check(isCorpusBackend(store) === false, 'the facade namespace is not itself a "backend"');
const ni = store.ingestDocument({ doc: { checksum: 'z' } });
check(ni.ok === false && ni.error.code === CORPUS_STORE_ERRORS.NOT_IMPLEMENTED, 'ingestDocument under the Null backend → NOT_IMPLEMENTED');
check(store.recordObservation({ observation: {} }).error.code === CORPUS_STORE_ERRORS.NOT_IMPLEMENTED, 'recordObservation under the Null backend → NOT_IMPLEMENTED');
check(typeof store.setAnalysisStatus === 'function' && !('approveObservation' in store) && !('promoteObservation' in store),
  'the facade exposes NO approve/promote entry point (§15 — no PDF → AI → approved rule path)');
check(Object.values(CORPUS_AUDIT_EVENTS).every((v) => typeof v === 'string'), 'CORPUS_AUDIT_EVENTS is a plain metadata vocabulary');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
