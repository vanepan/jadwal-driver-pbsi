/* import-session-check.mjs — Node check for V2.1 "Knowledge Acquisition
   Operational Readiness": the Import Session lifecycle (Uploaded ->
   Pending Review -> Approved -> Knowledge Imported -> Archived, plus the
   Pending Review -> Uploaded reject edge), Dataset Validation, and the
   manual-verification bridge (manual-file-connector.js) reusing
   dataset-import-service.js#importDataset() completely unchanged. No
   OCR, no AI, no production writes (memory repository only).
   Run: node scripts/import-session-check.mjs   (exit 0 = pass) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setActiveRepository, getById as getKnowledgeItemById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { resetConnectorRegistry } from '../js/v2/knowledge/registry/connector-registry.js';
import { resetDatasetRegistry } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import { resetImportReportLog } from '../js/v2/knowledge/acquisition/acquisition-engine.js';
import { resetManualImportQueue } from '../js/v2/knowledge/acquisition/manual-import-queue-store.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { getSourceWeight } from '../js/v2/knowledge/contracts/source-weight-contract.js';
import { DATASET_TYPE } from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';

import {
  IMPORT_SESSION_STATE, canTransitionImportSession, isValidImportDecision, IMPORT_SESSION_KIND, PIPELINE_STAGE,
} from '../js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js';
import { resetImportSessionRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-session-repository.js';
import { validateImportSession, IMPORT_VALIDATION_ERRORS } from '../js/v2/knowledge/datasets/import-session/import-validation-engine.js';
import {
  createImportSession, attachManualEntryFacts, attachDocumentHash, submitImportSessionForReview,
  approveImportSession, rejectImportSession, markKnowledgeImported, markArchived, getImportSession,
  updateSessionMetadata, hasContentFacts,
  attachFactsProvenance, attachExtractionSuggestion, isFactsStale, listReanalysisCandidates, attachFileStorage,
} from '../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import { normalizeImportSessionRecord } from '../js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js';
import { CURRENT_CONTENT_PARSER_VERSION } from '../js/v2/knowledge/datasets/import-session/parser-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetConnectorRegistry();
resetDatasetRegistry();
resetImportSessionRepository();
resetManualImportQueue();
resetImportReportLog();

console.log('\n[Transition legality — IMPORT_SESSION_GRAPH]');
check('uploaded -> pending_review is legal', canTransitionImportSession(IMPORT_SESSION_STATE.UPLOADED, IMPORT_SESSION_STATE.PENDING_REVIEW));
check('pending_review -> approved is legal', canTransitionImportSession(IMPORT_SESSION_STATE.PENDING_REVIEW, IMPORT_SESSION_STATE.APPROVED));
check('pending_review -> uploaded (reject edge) is legal', canTransitionImportSession(IMPORT_SESSION_STATE.PENDING_REVIEW, IMPORT_SESSION_STATE.UPLOADED));
check('approved -> knowledge_imported is legal', canTransitionImportSession(IMPORT_SESSION_STATE.APPROVED, IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED));
check('knowledge_imported -> archived is legal', canTransitionImportSession(IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, IMPORT_SESSION_STATE.ARCHIVED));
check('archived -> anything is illegal (terminal)', !canTransitionImportSession(IMPORT_SESSION_STATE.ARCHIVED, IMPORT_SESSION_STATE.APPROVED));
check('uploaded -> approved (skipping review) is illegal', !canTransitionImportSession(IMPORT_SESSION_STATE.UPLOADED, IMPORT_SESSION_STATE.APPROVED));

console.log('\n[isValidImportDecision — human gate on Approved]');
check('a decision into approved without preferenceRationale is invalid', !isValidImportDecision({ toState: IMPORT_SESSION_STATE.APPROVED, approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: null }, IMPORT_SESSION_STATE.PENDING_REVIEW));
check('a decision into approved with preferenceRationale is valid', isValidImportDecision({ toState: IMPORT_SESSION_STATE.APPROVED, approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Reviewed against the source document.' }, IMPORT_SESSION_STATE.PENDING_REVIEW));

console.log('\n[Dataset Validation — the five rules]');
const badFormatSession = { id: 'x', domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'a.txt', mimeType: 'text/plain', kind: IMPORT_SESSION_KIND.PDF, manualEntryFacts: { a: 1 }, parsedContent: null, documentHash: null };
const badFormat = validateImportSession(badFormatSession);
check('unsupported format is flagged', !badFormat.ok && badFormat.errors.some((e) => e.code === IMPORT_VALIDATION_ERRORS.UNSUPPORTED_FORMAT));

const missingFactsSession = { id: 'y', domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'b.pdf', mimeType: 'application/pdf', kind: IMPORT_SESSION_KIND.PDF, manualEntryFacts: null, parsedContent: null, documentHash: null };
const missingFacts = validateImportSession(missingFactsSession);
// V2.1 Decision 2: missing content facts no longer BLOCK Pending Review
// (that would make zero-config bulk upload impossible) — they surface as
// a real, non-fatal warning instead. The actual gate moved to
// markKnowledgeImported() — see the dedicated check further down.
check('missing manual-entry facts is a non-blocking warning, not an error (zero-config upload)', missingFacts.ok && missingFacts.warnings.some((w) => w.code === 'NO_CONTENT_FACTS'));

const domainMismatchSession = { id: 'z', domainType: 'not-a-real-domain', datasetType: DATASET_TYPE.OFFICIAL, filename: 'c.pdf', mimeType: 'application/pdf', kind: IMPORT_SESSION_KIND.PDF, manualEntryFacts: { a: 1 }, parsedContent: null, documentHash: null };
const domainMismatch = validateImportSession(domainMismatchSession);
check('an unregistered domainType is flagged', !domainMismatch.ok && domainMismatch.errors.some((e) => e.code === IMPORT_VALIDATION_ERRORS.DOMAIN_MISMATCH));

const scopedSession = { id: 'w', domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'd.pdf', mimeType: 'application/pdf', kind: IMPORT_SESSION_KIND.PDF, manualEntryFacts: { a: 1 }, parsedContent: null, documentHash: null };
const scopedMismatch = validateImportSession(scopedSession, { expectedDomainType: 'engineering' });
check('an upload scoped to a different domainType than expected is flagged', !scopedMismatch.ok && scopedMismatch.errors.some((e) => e.code === IMPORT_VALIDATION_ERRORS.DOMAIN_MISMATCH));

console.log('\n[Happy path — Uploaded -> Pending Review -> Approved -> Knowledge Imported -> Archived]');
const created = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'nor-2026-001.pdf',
  mimeType: 'application/pdf', sizeBytes: 12345, kind: IMPORT_SESSION_KIND.PDF,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
check('createImportSession succeeds at state Uploaded', created.ok && created.data.state === IMPORT_SESSION_STATE.UPLOADED);
const sessionId = created.data.id;

// Phase 2 Follow-up — pipelineStage is the persisted, source-of-truth
// progress marker, seeded at creation and advanced by the SAME transition
// writes (zero new writes).
check('a created session is seeded at pipelineStage CLASSIFICATION (already fingerprinted+dedup-checked+classified)', created.data.pipelineStage === PIPELINE_STAGE.CLASSIFICATION);

attachManualEntryFacts(sessionId, { value: 'Kepala Sekolah', documentNumber: 'NOR-2026-001', senderOrigin: 'Sarpras' });
attachDocumentHash(sessionId, 'fnv1a-test-hash');

const submitted = submitImportSessionForReview(sessionId);
check('submitImportSessionForReview succeeds once facts are attached', submitted.ok && submitted.data.state === IMPORT_SESSION_STATE.PENDING_REVIEW);
check('reaching Pending Review advances pipelineStage to POLICY_VALIDATION (folded into the existing write)', submitted.data.pipelineStage === PIPELINE_STAGE.POLICY_VALIDATION);

const decision = { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Verified against the source PDF by hand.' };
const approved = approveImportSession(sessionId, decision);
check('approveImportSession succeeds with a valid ImportDecision', approved.ok && approved.data.state === IMPORT_SESSION_STATE.APPROVED);

const imported = markKnowledgeImported(sessionId);
check('markKnowledgeImported succeeds', imported.ok && imported.data.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED);
check('markKnowledgeImported advances pipelineStage to KNOWLEDGE_EXTRACTION', imported.data.pipelineStage === PIPELINE_STAGE.KNOWLEDGE_EXTRACTION);

const expectedKnowledgeId = generateKnowledgeId({ domainType: 'nor', sourceType: 'manual-file', sourceRef: sessionId });
check('markKnowledgeImported records the deterministic knowledgeItemId', imported.data.knowledgeItemId === expectedKnowledgeId);
const knowledgeItem = getKnowledgeItemById(expectedKnowledgeId);
check('a real Draft KnowledgeItem now exists at that id', knowledgeItem.ok && knowledgeItem.data.lifecycleState === 'draft');
check('the KnowledgeItem sourceType is "manual-file"', knowledgeItem.data.sourceType === 'manual-file');
check('the KnowledgeItem payload carries the human-typed facts', knowledgeItem.data.payload.value === 'Kepala Sekolah');
check('the manual-file source weight is registered at 0.95', getSourceWeight('manual-file').weight === 0.95);

const archived = markArchived(sessionId, 'archive:test:1');
check('markArchived succeeds and records the reference', archived.ok && archived.data.state === IMPORT_SESSION_STATE.ARCHIVED && archived.data.archiveRecordId === 'archive:test:1');
check('markArchived advances pipelineStage to COMPLETED (terminal)', archived.data.pipelineStage === PIPELINE_STAGE.COMPLETED);

console.log('\n[V2.1 Decision 2 — content-fact gate relocated to markKnowledgeImported]');
const zeroConfigSession = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'zero-config.pdf',
  mimeType: 'application/pdf', sizeBytes: 100, kind: IMPORT_SESSION_KIND.PDF,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
const zcId = zeroConfigSession.data.id;
const zcSubmitted = submitImportSessionForReview(zcId);
check('a session with zero manual facts still reaches Pending Review (zero-config upload)', zcSubmitted.ok && zcSubmitted.data.state === IMPORT_SESSION_STATE.PENDING_REVIEW);
const zcApproved = approveImportSession(zcId, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Approved on metadata alone for this test.' });
check('it can even reach Approved without content facts', zcApproved.ok && zcApproved.data.state === IMPORT_SESSION_STATE.APPROVED);
const zcBlocked = markKnowledgeImported(zcId);
check('markKnowledgeImported correctly BLOCKS without content facts', zcBlocked.ok === false && zcBlocked.error.code === 'MISSING_CONTENT_FACTS');
attachManualEntryFacts(zcId, { value: 'Filled in via Advanced Metadata.' });
const zcRetry = markKnowledgeImported(zcId);
check('after Advanced Metadata fills the facts, markKnowledgeImported succeeds', zcRetry.ok && zcRetry.data.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED);

console.log('\n[Phase 1 — hasContentFacts() exported and matches markKnowledgeImported\'s own gate]');
check('hasContentFacts is false for a PDF session with no facts yet (same session that was blocked above)', hasContentFacts({ kind: IMPORT_SESSION_KIND.PDF, manualEntryFacts: null, parsedContent: null }) === false);
check('hasContentFacts is true once manualEntryFacts exists (mirrors the successful retry above)', hasContentFacts({ kind: IMPORT_SESSION_KIND.PDF, manualEntryFacts: { value: 'x' }, parsedContent: null }) === true);
check('hasContentFacts for a JSON-kind session checks parsedContent, not manualEntryFacts', hasContentFacts({ kind: IMPORT_SESSION_KIND.JSON, manualEntryFacts: null, parsedContent: { a: 1 } }) === true);
check('hasContentFacts is false for a JSON-kind session with an empty parsedContent object', hasContentFacts({ kind: IMPORT_SESSION_KIND.JSON, manualEntryFacts: null, parsedContent: {} }) === false);

console.log('\n[Reject edge — Pending Review -> Uploaded]');
const created2 = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'nor-2026-002.pdf',
  mimeType: 'application/pdf', sizeBytes: 999, kind: IMPORT_SESSION_KIND.PDF,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
attachManualEntryFacts(created2.data.id, { value: 'placeholder' });
submitImportSessionForReview(created2.data.id);
const rejected = rejectImportSession(created2.data.id, { approverId: 'evan', decidedAt: new Date().toISOString() });
check('rejectImportSession sends the session back to Uploaded', rejected.ok && rejected.data.state === IMPORT_SESSION_STATE.UPLOADED);
check('a rejected session can be re-submitted after revision', canTransitionImportSession(IMPORT_SESSION_STATE.UPLOADED, IMPORT_SESSION_STATE.PENDING_REVIEW));

console.log('\n[V2.1 Advanced Metadata — updateSessionMetadata]');
const created4 = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'ambiguous.pdf',
  mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
const metaUpdated = updateSessionMetadata(created4.data.id, { knowledgeKind: 'rule', datasetType: DATASET_TYPE.CORRECTION });
check('updateSessionMetadata patches only the fields supplied', metaUpdated.ok && metaUpdated.data.knowledgeKind === 'rule' && metaUpdated.data.datasetType === DATASET_TYPE.CORRECTION && metaUpdated.data.domainType === 'nor');

console.log('\n[Duplicate detection among sessions]');
const created3 = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'nor-2026-001.pdf',
  mimeType: 'application/pdf', sizeBytes: 12345, kind: IMPORT_SESSION_KIND.PDF,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
const dupCheck = validateImportSession({ ...created3.data, manualEntryFacts: { value: 'x' } });
check('a second session with the same filename produces a DUPLICATE_FILENAME warning', dupCheck.warnings.some((w) => w.code === 'DUPLICATE_FILENAME'));

console.log('\n[Reuse discipline — import-session-engine.js never imports organizational-memory]');
const __dirname = dirname(fileURLToPath(import.meta.url));
function hasOrgMemoryImport(relPath) {
  const source = readFileSync(join(__dirname, relPath), 'utf8');
  return source.split('\n').some((line) => /^\s*import\b.*organizational-memory/.test(line));
}
check('import-session-engine.js has no organizational-memory import statement', !hasOrgMemoryImport('../js/v2/knowledge/datasets/import-session/import-session-engine.js'));
check('import-validation-engine.js has no organizational-memory import statement', !hasOrgMemoryImport('../js/v2/knowledge/datasets/import-session/import-validation-engine.js'));

console.log('\n[V2, Part A1 — factsProvenance / extractionSuggestion (Intelligent Ingestion)]');
const created5 = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'auto-extracted.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 500,
  kind: IMPORT_SESSION_KIND.DOCX, knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
check('a freshly-created session has no factsProvenance/extractionSuggestion yet', created5.data.factsProvenance === null && created5.data.extractionSuggestion === null);
const suggestion = {
  value: 'Realisasi Petty Cash', documentNumber: '', senderOrigin: 'Kabid Sarpras',
  confidencePerField: { value: 1, documentNumber: 0, senderOrigin: 1 },
  basisPerField: { value: 'x', documentNumber: 'not found', senderOrigin: 'x' },
  parserVersion: 1, extractedAt: new Date().toISOString(),
};
const suggested = attachExtractionSuggestion(created5.data.id, suggestion);
check('attachExtractionSuggestion persists the suggestion without touching manualEntryFacts', suggested.ok && suggested.data.extractionSuggestion.senderOrigin === 'Kabid Sarpras' && suggested.data.manualEntryFacts === null);
check('a low-confidence suggestion alone does NOT satisfy hasContentFacts (never a silent partial gate-pass)', hasContentFacts(suggested.data) === false);
const provenanced = attachFactsProvenance(created5.data.id, { source: 'auto-extraction', contentParserVersion: 1, metadataParserVersion: 1, confidencePerField: suggestion.confidencePerField, recordedAt: new Date().toISOString() });
check('attachFactsProvenance persists source/versions independently of manualEntryFacts', provenanced.ok && provenanced.data.factsProvenance.source === 'auto-extraction' && provenanced.data.factsProvenance.contentParserVersion === 1);
attachManualEntryFacts(created5.data.id, { value: suggestion.value, documentNumber: '', senderOrigin: suggestion.senderOrigin, notes: '' });
const promoted = getImportSession(created5.data.id);
check('once promoted to manualEntryFacts (2/3 fields), hasContentFacts is true — the actual gate only ever reads manualEntryFacts', promoted.ok && hasContentFacts(promoted.data) === true);
check('extractionSuggestion is untouched by the promotion (still the full original suggestion, incl. the field that was never found)', promoted.data.extractionSuggestion.documentNumber === '');

console.log('\n[V2, Part A2 — isFactsStale / listReanalysisCandidates (Background Re-Analysis)]');
const pdfSession = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'never-relevant.pdf',
  mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF, knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
check('a PDF session is never a re-analysis candidate (no content parser for PDF at any version)', isFactsStale(pdfSession.data) === false);

const noStorageSession = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'not-yet-uploaded.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 10, kind: IMPORT_SESSION_KIND.DOCX, knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
check('a docx session with no storagePath yet is not a candidate (nothing to re-fetch)', isFactsStale(noStorageSession.data) === false);

// Deliverable 7, concretely: a session that predates this feature entirely
// — created, uploaded, even fully processed to Knowledge Imported — with
// NO factsProvenance field at all (exactly what every real session
// uploaded before this Part A2 release looks like; no migration script
// ever touches it, per parser-registry.js's own "absence IS version 0"
// design).
const preFeatureSession = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'uploaded-before-mammoth-existed.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 500, kind: IMPORT_SESSION_KIND.DOCX, knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
attachManualEntryFacts(preFeatureSession.data.id, { value: 'Manually typed before Part A1 ever existed.' });
const withStorage = getImportSession(preFeatureSession.data.id).data;
check('a pre-feature session (factsProvenance === null) is correctly flagged stale — but not yet, since it has no storagePath', isFactsStale(withStorage) === false);
// Simulate the real post-upload state via attachFileStorage — the real
// mutator processOneFile() itself calls once the Storage upload resolves.
attachFileStorage(preFeatureSession.data.id, { sha256: 'deadbeef', storagePath: 'sarpras-intelligence/deadbeef', fileStorageId: 'file:1' });
const preFeatureWithStorage = getImportSession(preFeatureSession.data.id).data;
check('once it has a real storagePath, a pre-feature .docx session IS a re-analysis candidate — no re-upload, no migration script, absence alone made it eligible', isFactsStale(preFeatureWithStorage) === true);
check('listReanalysisCandidates() includes this exact session', listReanalysisCandidates().some((s) => s.id === preFeatureSession.data.id));

const currentVersionSession = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'already-current.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 10, kind: IMPORT_SESSION_KIND.DOCX, knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
attachFileStorage(currentVersionSession.data.id, { sha256: 'cafe', storagePath: 'sarpras-intelligence/cafe', fileStorageId: 'file:2' });
attachFactsProvenance(currentVersionSession.data.id, { source: 'auto-extraction', contentParserVersion: CURRENT_CONTENT_PARSER_VERSION, metadataParserVersion: 1, confidencePerField: { value: 1 }, recordedAt: new Date().toISOString() });
check('a session already stamped at the CURRENT content parser version is not a candidate', isFactsStale(getImportSession(currentVersionSession.data.id).data) === false);
check('listReanalysisCandidates() does NOT include the already-current session', !listReanalysisCandidates().some((s) => s.id === currentVersionSession.data.id));

console.log('\n[V2, Part A1 — RTDB round-trip normalization for the two new fields]');
check('a record with no factsProvenance/extractionSuggestion keys at all (pre-feature session) normalizes to null, not undefined/crash', (() => {
  const stripped = { id: 'x', version: 1 }; // simulates RTDB dropping absent keys entirely
  const n = normalizeImportSessionRecord(stripped);
  return n.factsProvenance === null && n.extractionSuggestion === null;
})());

resetConnectorRegistry();
resetDatasetRegistry();
resetImportSessionRepository();
resetManualImportQueue();
resetImportReportLog();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
