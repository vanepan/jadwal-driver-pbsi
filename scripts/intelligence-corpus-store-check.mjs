/* ============================================================
   intelligence-corpus-store-check.mjs — NOR & Memorandum Corpus
   Acquisition Foundation (V2, Phase 5.x.1)

   PURE node integration test for the corpus store facade over the
   in-memory backend. No browser, no Firebase, no network.

   Proves the ingestion interface (§14) + the safety invariants:
     • ingestDocument — get-or-create by content checksum (§12): a
       byte-identical re-ingest returns the EXISTING document
       ({ duplicate: true }), never a second logical row, never an
       overwrite
     • getDocument / listDocuments — owner-scoped
     • setAnalysisStatus — graph-validated (§11); an illegal move →
       ILLEGAL_TRANSITION
     • recordObservation — every observation persists lifecycleState
       'observed'; a caller CANNOT slip an 'approved' one past the store;
       recording the same (doc, category, key) twice MERGES the evidence
       without changing the lifecycle (§9, §15)
     • getObservations — by document
     • there is NO store method that approves / promotes an observation
     • the Null backend is silent (NOT_IMPLEMENTED)

   Run:  node scripts/intelligence-corpus-store-check.mjs   (exit 0 = pass)
   ============================================================ */

import * as store from '../src/intelligence/corpus/corpus-store.js';
import {
  memoryCorpusBackend, resetMemoryCorpusBackend,
} from '../src/intelligence/corpus/backends/memory-corpus-backend.js';
import {
  CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA, CORPUS_INGESTION_STATUS, CORPUS_ANALYSIS_STATUS,
} from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import { OBSERVATION_CATEGORY } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import { OBSERVATION_LIFECYCLE } from '../src/intelligence/corpus/contracts/observation-lifecycle-contract.js';
import { EXTRACTION_METHOD } from '../src/intelligence/corpus/contracts/corpus-provenance-contract.js';
import { CORPUS_STORE_ERRORS } from '../src/intelligence/corpus/contracts/corpus-store-contract.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-03T00:00:00.000Z';

function useMemory() {
  store.resetCorpusStore();
  store.registerCorpusBackend(memoryCorpusBackend);
  store.setActiveCorpusBackend('memory');
  resetMemoryCorpusBackend();
}

const docSeed = (over = {}) => ({
  checksum: over.checksum || 'sha_nor113',
  documentType: over.documentType || CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI,
  documentEra: over.documentEra || CORPUS_DOCUMENT_ERA.HISTORICAL,
  eraConfidence: 0.75,
  typeConfidence: 0.9,
  title: over.title || 'Nota Organisasi Sarpras 113',
  originalFilename: over.originalFilename || 'NOR-113.pdf',
  sourcePath: 'Petty Cash Center/uploads/NOR-113.pdf',
  pageCount: 2,
  language: 'id',
  ...over,
});

const obsSeed = (documentId, over = {}) => ({
  documentId,
  category: over.category || OBSERVATION_CATEGORY.RECIPIENT_CONVENTION,
  key: over.key || 'recipient_label',
  observedValue: over.observedValue !== undefined ? over.observedValue : 'Kepada Yth.',
  observation: over.observation || null,
  confidence: over.confidence != null ? over.confidence : 0.8,
  provenance: over.provenance || [{
    sourceDocumentId: documentId, pageNumber: 1, extractionMethod: EXTRACTION_METHOD.TEXT_LAYER, extractedAt: AT, confidence: 0.9,
  }],
});

/* ════════════════════════════════════════════════════════════════════════ */

section('ingestDocument — get-or-create by checksum (§12)');
useMemory();
const i1 = store.ingestDocument({ doc: docSeed(), ownerId: 'evan', now: AT });
check(i1.ok && i1.data.duplicate === false, 'first ingest → ok, duplicate: false');
const doc = i1.data.document;
check(doc.documentId === 'corpus_sha_nor113' && doc.ownerId === 'evan', 'documentId is derived from the checksum; ownerId is the caller');
check(doc.ingestionStatus === CORPUS_INGESTION_STATUS.RECEIVED, 'no sourceFileId yet → ingestionStatus "received"');
check(doc.analysisStatus === CORPUS_ANALYSIS_STATUS.PENDING, 'analysisStatus starts "pending" (separate lifecycle)');
check(doc.provenance.ingestedBy === 'evan' && doc.provenance.ingestedAt === AT, 'document provenance records who/when');

const i2 = store.ingestDocument({ doc: docSeed({ title: 'DIFFERENT TITLE, SAME BYTES' }), ownerId: 'evan', now: '2026-09-03T09:00:00.000Z' });
check(i2.ok && i2.data.duplicate === true, 'a re-ingest of the SAME checksum → duplicate: true (§12)');
check(i2.data.document.documentId === doc.documentId && i2.data.document.title === 'Nota Organisasi Sarpras 113',
  'the ORIGINAL document is returned unchanged — the re-ingest did NOT overwrite it');
check(store.listDocuments({ ownerId: 'evan' }).data.length === 1, 'still exactly ONE logical corpus document (no uncontrolled duplicate)');

const iStored = store.ingestDocument({ doc: docSeed({ checksum: 'sha_nor120', sourceFileId: 'file:' + 'a'.repeat(64) }), ownerId: 'evan', now: AT });
check(iStored.ok && iStored.data.document.ingestionStatus === CORPUS_INGESTION_STATUS.STORED,
  'an ingest WITH a sourceFileId → ingestionStatus "stored"');
check(store.ingestDocument({ doc: { checksum: '' }, ownerId: 'evan' }).error.code === CORPUS_STORE_ERRORS.INVALID_RECORD,
  'an ingest with no checksum → INVALID_RECORD (the dedup key is mandatory)');

section('getDocument / listDocuments — owner-scoped');
useMemory();
store.ingestDocument({ doc: docSeed({ checksum: 'a1' }), ownerId: 'evan', now: AT });
store.ingestDocument({ doc: docSeed({ checksum: 'a2' }), ownerId: 'evan', now: AT });
store.ingestDocument({ doc: docSeed({ checksum: 'b1' }), ownerId: 'mallory', now: AT });
check(store.getDocument('corpus_a1').ok === true, 'getDocument returns a stored document');
check(store.getDocument('corpus_ghost').error.code === CORPUS_STORE_ERRORS.NOT_FOUND, 'getDocument on an unknown id → NOT_FOUND');
check(store.listDocuments({ ownerId: 'evan' }).data.length === 2 && store.listDocuments({ ownerId: 'mallory' }).data.length === 1,
  'listDocuments is filtered by ownerId');

section('setAnalysisStatus — graph-validated (§11)');
useMemory();
const a0 = store.ingestDocument({ doc: docSeed({ checksum: 'anz' }), ownerId: 'evan', now: AT }).data.document;
const badMove = store.setAnalysisStatus(a0.documentId, { to: CORPUS_ANALYSIS_STATUS.COMPLETED, actorId: 'evan', at: AT });
check(!badMove.ok && badMove.error.code === CORPUS_STORE_ERRORS.ILLEGAL_TRANSITION,
  'pending → completed (skipping every extraction stage) → ILLEGAL_TRANSITION');
const s1 = store.setAnalysisStatus(a0.documentId, { to: CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED, actorId: 'evan', at: '2026-09-03T02:00:00.000Z' });
check(s1.ok && s1.data.analysisStatus === 'text_extracted' && s1.data.analyzedAt === '2026-09-03T02:00:00.000Z',
  'pending → text_extracted advances + stamps analyzedAt');
const s2 = store.setAnalysisStatus(a0.documentId, { to: CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED, actorId: 'evan', at: AT });
check(s2.ok && s2.data.analysisStatus === 'visual_analyzed', 'text_extracted → visual_analyzed is legal (order not forced — §16)');
check(store.getDocument(a0.documentId).data.ingestionStatus === CORPUS_INGESTION_STATUS.RECEIVED,
  'advancing analysisStatus did NOT touch ingestionStatus (separate lifecycles — §11)');

section('recordObservation — always "observed", evidence accumulates (§9, §15)');
useMemory();
const rd = store.ingestDocument({ doc: docSeed({ checksum: 'obsdoc' }), ownerId: 'evan', now: AT }).data.document;
const r1 = store.recordObservation({ observation: obsSeed(rd.documentId), ownerId: 'evan', now: AT });
check(r1.ok && r1.data.merged === false, 'first recordObservation → merged: false');
check(r1.data.observation.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED, 'the persisted observation is "observed"');
check(r1.data.observation.occurrenceCount === 1, 'occurrenceCount starts at 1');

// a caller tries to inject an approved observation
const sneaky = store.recordObservation({
  observation: { ...obsSeed(rd.documentId, { key: 'closing_phrase', category: OBSERVATION_CATEGORY.CLOSING_PATTERN, observedValue: 'Atas perhatiannya diucapkan terima kasih.' }),
    lifecycleState: 'approved', approvedBy: 'evan', approvedAt: AT, preferenceRationale: 'tamper' },
  ownerId: 'evan', now: AT,
});
check(sneaky.ok && sneaky.data.observation.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED,
  'a caller CANNOT persist an "approved" observation through the store — it is forced back to "observed"');
check(sneaky.data.observation.approvedBy === null && sneaky.data.observation.preferenceRationale === null,
  'the injected approval fields are stripped');

// same (doc, category, key) again → merge, lifecycle unchanged
const r2 = store.recordObservation({
  observation: obsSeed(rd.documentId, { confidence: 0.95, provenance: [{ sourceDocumentId: rd.documentId, pageNumber: 2, extractionMethod: EXTRACTION_METHOD.TEXT_LAYER, extractedAt: '2026-09-03T03:00:00.000Z', confidence: 0.95 }] }),
  ownerId: 'evan', now: '2026-09-03T03:00:00.000Z',
});
check(r2.ok && r2.data.merged === true && r2.data.observation.occurrenceCount === 2,
  'recording the same convention again MERGES → occurrenceCount 2');
check(r2.data.observation.provenance.length === 2 && r2.data.observation.confidence === 0.95,
  'provenance appended, confidence = max');
check(r2.data.observation.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED, 'accumulated evidence is STILL "observed" — no auto-promotion (§9, §15)');

const rMissing = store.recordObservation({ observation: obsSeed(rd.documentId, { provenance: [] }), ownerId: 'evan', now: AT });
check(!rMissing.ok && rMissing.error.code === CORPUS_STORE_ERRORS.INVALID_RECORD, 'an observation with ZERO provenance is refused (§6)');
const rNoDoc = store.recordObservation({ observation: obsSeed('corpus_nonexistent'), ownerId: 'evan', now: AT });
check(!rNoDoc.ok && rNoDoc.error.code === CORPUS_STORE_ERRORS.NOT_FOUND, 'an observation for an unknown document → NOT_FOUND');

section('getObservations — by document');
const go = store.getObservations(rd.documentId);
check(go.ok && go.data.length === 2, 'getObservations returns every observation mined from the document (2 distinct keys)');
check(store.getObservations('corpus_ghost').error.code === CORPUS_STORE_ERRORS.NOT_FOUND, 'getObservations on an unknown document → NOT_FOUND');

section('no approve/promote path exists (§15)');
const methods = Object.keys(store).filter((k) => typeof store[k] === 'function');
check(!methods.some((m) => /approve|promote|publish|certif/i.test(m)),
  `the corpus store exposes NO approve/promote/publish method (${methods.join(', ')})`);

section('the Null backend is silent');
store.resetCorpusStore();
check(store.getActiveCorpusBackendId() === 'null', 'reset restores the Null backend');
check(store.ingestDocument({ doc: docSeed() }).error.code === CORPUS_STORE_ERRORS.NOT_IMPLEMENTED, 'Null backend ingest → NOT_IMPLEMENTED (dormant)');
check(store.getObservations('x').error.code === CORPUS_STORE_ERRORS.NOT_IMPLEMENTED, 'Null backend getObservations → NOT_IMPLEMENTED');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
