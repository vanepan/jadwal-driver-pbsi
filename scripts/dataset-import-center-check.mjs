/* dataset-import-center-check.mjs — Node check for Phase 1 "Operational
   Engine Hardening" AND Phase 2 "Autonomous Learning Pipeline":
   js/v2/ui/dataset-import-center.js's exported reviewReasons()/
   archiveDuplicateWarning() (promoted from a closure to module scope so
   other workspaces can reuse the real exception logic instead of
   re-deriving a narrower one), the Advanced-Metadata-button-suppression
   behavior it drives, and (Phase 2) cascadeFromApproved()/
   findReusableContentFacts() — the "approval cascades immediately" and
   "duplicate -> archive via fact reuse" decisions, also promoted to
   module scope for the same reason.

   This file was previously only covered indirectly (batch-performance-
   check.mjs for throughput, the puppeteer DOM check for "renders without
   a fatal error") — no prior script exercised reviewReasons()/render()
   output directly. No OCR, no AI, no production writes (memory
   repository only, no Firebase touch — dataset-import-center.js only
   lazily import()s file-storage-engine.js inside the real upload path,
   never at module load).
   Run: node scripts/dataset-import-center-check.mjs   (exit 0 = pass) */

import { setActiveRepository } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { resetConnectorRegistry } from '../js/v2/knowledge/registry/connector-registry.js';
import { resetDatasetRegistry } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import { resetImportReportLog } from '../js/v2/knowledge/acquisition/acquisition-engine.js';
import { resetManualImportQueue } from '../js/v2/knowledge/acquisition/manual-import-queue-store.js';
import { resetImportSessionRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-session-repository.js';
import { resetArchiveRepository } from '../js/v2/organizational-memory/repository/archive-repository.js';
import { DATASET_TYPE } from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';
import { IMPORT_SESSION_KIND, IMPORT_SESSION_STATE, PIPELINE_STAGE } from '../js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  createImportSession, attachParsedContent, attachManualEntryFacts, attachInferenceResult,
  submitImportSessionForReview, approveImportSession, markKnowledgeImported, markArchived, getImportSession,
} from '../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import { AUTO_POPULATE_CONFIDENCE_THRESHOLD } from '../js/v2/knowledge/datasets/import-session/metadata-inference-engine.js';
import { makeStoredFileRecord } from '../js/v2/file-storage/contracts/file-storage-contract.js';
import { createBatch, recordBatchItem } from '../js/v2/knowledge/datasets/import-session/import-batch-engine.js';
import {
  createDatasetImportController, reviewReasons, archiveDuplicateWarning,
  cascadeFromApproved, findReusableContentFacts, effectiveStage, computeBatchCounters,
} from '../js/v2/ui/dataset-import-center.js';

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
resetArchiveRepository();

console.log('\n[reviewReasons — a genuinely clean (terminal) session has no reasons]');
// Phase 2, Decision 4 — PENDING_REVIEW is no longer "clean": it always
// means a human decision is still outstanding (see the next block). The
// only truly clean fixture is one that has nothing left to decide.
const cleanSession = {
  state: IMPORT_SESSION_STATE.ARCHIVED, confidence: 0.95, confidenceRationale: null,
  validationWarnings: [], validationErrors: [], documentHash: null, domainType: 'nor',
  kind: IMPORT_SESSION_KIND.JSON, manualEntryFacts: null, parsedContent: { a: 1 },
  archiveRecordId: 'archive-record:fixture',
};
check('an Archived session with no warnings/errors has zero reasons', reviewReasons(cleanSession).length === 0);

console.log('\n[reviewReasons — Phase 2: PENDING_DECISION]');
const pendingReviewSession = { ...cleanSession, state: IMPORT_SESSION_STATE.PENDING_REVIEW, archiveRecordId: null };
check('a Pending Review session is always flagged PENDING_DECISION — a human decision is genuinely outstanding', reviewReasons(pendingReviewSession).some((r) => r.code === 'PENDING_DECISION'));

console.log('\n[reviewReasons — Phase 2: ARCHIVE_PENDING]');
const stuckKnowledgeImported = { ...cleanSession, state: IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, archiveRecordId: null };
check('Knowledge Imported with no archiveRecordId means the auto-cascade\'s doArchive() genuinely failed — flagged ARCHIVE_PENDING', reviewReasons(stuckKnowledgeImported).some((r) => r.code === 'ARCHIVE_PENDING'));
const successfullyArchived = { ...stuckKnowledgeImported, state: IMPORT_SESSION_STATE.ARCHIVED, archiveRecordId: 'archive-record:fixture-2' };
check('once archiveRecordId is set (state Archived), ARCHIVE_PENDING no longer fires', reviewReasons(successfullyArchived).every((r) => r.code !== 'ARCHIVE_PENDING'));

console.log('\n[reviewReasons — LOW_CONFIDENCE]');
const lowConfidenceSession = { ...cleanSession, confidence: AUTO_POPULATE_CONFIDENCE_THRESHOLD - 0.1 };
const lowConfReasons = reviewReasons(lowConfidenceSession);
check('a session below the auto-populate threshold is flagged LOW_CONFIDENCE', lowConfReasons.some((r) => r.code === 'LOW_CONFIDENCE'));

console.log('\n[reviewReasons — DUPLICATE_AMBIGUITY (within-session warning)]');
const dupWarningSession = { ...cleanSession, validationWarnings: [{ code: 'DUPLICATE_FILENAME', message: 'same filename as another session' }] };
check('a DUPLICATE_FILENAME warning is surfaced as DUPLICATE_AMBIGUITY', reviewReasons(dupWarningSession).some((r) => r.code === 'DUPLICATE_AMBIGUITY'));

console.log('\n[reviewReasons — UNSUPPORTED_FORMAT]');
const unsupportedSession = { ...cleanSession, validationErrors: [{ code: 'UNSUPPORTED_FORMAT', message: 'not a supported format' }] };
check('an UNSUPPORTED_FORMAT error is surfaced', reviewReasons(unsupportedSession).some((r) => r.code === 'UNSUPPORTED_FORMAT'));

console.log('\n[reviewReasons — Phase 1 new code: MISSING_CONTENT_FACTS]');
const approvedNoFacts = { ...cleanSession, state: IMPORT_SESSION_STATE.APPROVED, kind: IMPORT_SESSION_KIND.PDF, parsedContent: null, manualEntryFacts: null };
check('an Approved PDF session with no facts yet is flagged MISSING_CONTENT_FACTS', reviewReasons(approvedNoFacts).some((r) => r.code === 'MISSING_CONTENT_FACTS'));
const approvedWithFacts = { ...approvedNoFacts, manualEntryFacts: { value: 'filled in' } };
check('the same session is clean once facts are attached', reviewReasons(approvedWithFacts).every((r) => r.code !== 'MISSING_CONTENT_FACTS'));
// Phase 2.5 Part 6 — full autonomy means MISSING_CONTENT_FACTS now ALSO
// fires at Pending Review (not only Approved): a fully-evidenced file
// auto-completes, so a facts-less file left at Pending Review is genuinely
// waiting on a human fact and must surface honestly.
const pendingNoFacts = { ...approvedNoFacts, state: IMPORT_SESSION_STATE.PENDING_REVIEW };
check('MISSING_CONTENT_FACTS now fires at Pending Review too (Part 6 — facts-less files never auto-complete)', reviewReasons(pendingNoFacts).some((r) => r.code === 'MISSING_CONTENT_FACTS'));
const uploadedNoFacts = { ...approvedNoFacts, state: IMPORT_SESSION_STATE.UPLOADED };
check('MISSING_CONTENT_FACTS does NOT fire pre-submission (Uploaded) — the gate is submission-onward', reviewReasons(uploadedNoFacts).every((r) => r.code !== 'MISSING_CONTENT_FACTS'));

console.log('\n[archiveDuplicateWarning — no documentHash short-circuits to null]');
check('a session with no documentHash never produces a warning (nothing to compare)', archiveDuplicateWarning({ documentHash: null, domainType: 'nor' }) === null);

console.log('\n[cascadeFromApproved — Phase 2, Decision 4: real engine flow, both possible outcomes]');
{
  const withFacts = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'cascade-with-facts.json',
    mimeType: 'application/json', sizeBytes: 10, kind: IMPORT_SESSION_KIND.JSON,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  attachParsedContent(withFacts.data.id, { value: 'real parsed content' });
  submitImportSessionForReview(withFacts.data.id);
  approveImportSession(withFacts.data.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'fixture' });
  const cascaded = cascadeFromApproved(withFacts.data.id);
  const afterCascade = getImportSession(withFacts.data.id);
  check('a session with real content facts cascades straight to Archived — no separate click needed', cascaded === true && afterCascade.ok && afterCascade.data.state === IMPORT_SESSION_STATE.ARCHIVED);

  const withoutFacts = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'cascade-no-facts.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  submitImportSessionForReview(withoutFacts.data.id);
  approveImportSession(withoutFacts.data.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'fixture' });
  const notCascaded = cascadeFromApproved(withoutFacts.data.id);
  const afterNoCascade = getImportSession(withoutFacts.data.id);
  check('a session with NO content facts anywhere correctly stays at Approved — never fabricates content to force the cascade', notCascaded === false && afterNoCascade.ok && afterNoCascade.data.state === IMPORT_SESSION_STATE.APPROVED);
  check('...and that honest stall is exactly what reviewReasons flags as MISSING_CONTENT_FACTS', reviewReasons(afterNoCascade.data).some((r) => r.code === 'MISSING_CONTENT_FACTS'));
}

console.log('\n[findReusableContentFacts — Phase 2, Decision 3: duplicate -> Archive via honest fact reuse]');
{
  const original = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'original.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  attachManualEntryFacts(original.data.id, { value: 'a real fact a human typed', documentNumber: 'DOC-1', senderOrigin: '', notes: '' });

  const duplicate = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'original-copy.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });

  const storedFileRecord = { ...makeStoredFileRecord({ sha256: 'a'.repeat(64), originalFilename: 'original.pdf', mimeType: 'application/pdf', sizeBytes: 10, storagePath: 'sarpras-intelligence/nor/aaaa' }), linkedSessionIds: [original.data.id, duplicate.data.id] };
  const reused = findReusableContentFacts(storedFileRecord, duplicate.data.id);
  check('a confirmed duplicate finds its sibling\'s real, human-verified facts', reused !== null && reused.manualEntryFacts.value === 'a real fact a human typed');

  const orphanRecord = { ...makeStoredFileRecord({ sha256: 'b'.repeat(64), originalFilename: 'never-verified.pdf', mimeType: 'application/pdf', sizeBytes: 10, storagePath: 'sarpras-intelligence/nor/bbbb' }), linkedSessionIds: [duplicate.data.id] };
  check('a duplicate with no sibling that has real facts honestly returns null — never fabricates content', findReusableContentFacts(orphanRecord, duplicate.data.id) === null);

  check('a StoredFileRecord with no entry at all also returns null (defensive)', findReusableContentFacts(null, duplicate.data.id) === null);
}

console.log('\n[Real render() — Advanced Metadata button only appears when reviewReasons() is non-empty]');
const controller = createDatasetImportController({});

const cleanCreated = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'phase1-clean-session.json',
  mimeType: 'application/json', sizeBytes: 42, kind: IMPORT_SESSION_KIND.JSON,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
attachInferenceResult(cleanCreated.data.id, { confidence: 0.95, confidenceRationale: null });
// JSON kind's own parsedContent is what satisfies hasContentFacts() — attach
// it the same way processOneFile's real JSON path does, BEFORE submitting.
attachParsedContent(cleanCreated.data.id, { value: 'real parsed JSON content' });
submitImportSessionForReview(cleanCreated.data.id);
approveImportSession(cleanCreated.data.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Clean fixture for Phase 1 button-suppression check.' });

const needsAttentionCreated = createImportSession({
  domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'phase1-needs-attention-session.pdf',
  mimeType: 'application/pdf', sizeBytes: 99, kind: IMPORT_SESSION_KIND.PDF,
  knowledgeKind: 'document_fact', uploadedBy: 'evan',
});
attachInferenceResult(needsAttentionCreated.data.id, { confidence: 0.2, confidenceRationale: null });

const html = controller.render();
function rowFor(html_, filename) {
  const rows = html_.split('<li class="wlk-row"');
  return rows.find((r) => r.includes(filename)) || '';
}
const cleanRow = rowFor(html, 'phase1-clean-session.json');
const needsAttentionRow = rowFor(html, 'phase1-needs-attention-session.pdf');
check('both fixture sessions actually rendered into the queue', cleanRow.length > 0 && needsAttentionRow.length > 0);
check('the clean, high-confidence session\'s row has NO Advanced Metadata button', !cleanRow.includes('Advanced Metadata'));
check('the low-confidence session\'s row DOES show an Advanced Metadata button', needsAttentionRow.includes('Advanced Metadata'));

console.log('\n[Real onClick() — Phase 2: clicking "Setujui" cascades all the way to Archived, driving the actual controller]');
{
  const manualApproveController = createDatasetImportController({});
  const manualCreated = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'manual-approve-cascade.json',
    mimeType: 'application/json', sizeBytes: 12, kind: IMPORT_SESSION_KIND.JSON,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  attachInferenceResult(manualCreated.data.id, { confidence: 0.7, confidenceRationale: null }); // below AUTO_IMPORT, above AUTO_POPULATE — lands on Pending Review, needs a human decision
  attachParsedContent(manualCreated.data.id, { value: 'real parsed content' });
  submitImportSessionForReview(manualCreated.data.id);
  const beforeClick = getImportSession(manualCreated.data.id);
  check('setup: session genuinely sits at Pending Review before any click', beforeClick.ok && beforeClick.data.state === IMPORT_SESSION_STATE.PENDING_REVIEW);

  const handled = manualApproveController.onClick({ dataset: { act: 'dic-approve', id: manualCreated.data.id } }, () => {});
  const afterClick = getImportSession(manualCreated.data.id);
  check('onClick("dic-approve") reports it handled the click', handled === true);
  check('ONE click on "Setujui" reaches Archived directly — no separate "Impor sebagai Knowledge"/"Arsipkan" click required', afterClick.ok && afterClick.data.state === IMPORT_SESSION_STATE.ARCHIVED);

  const renderedAfter = manualApproveController.render();
  check('the now-Archived session has nothing left to show a manual next-action button for', !rowFor(renderedAfter, 'manual-approve-cascade.json').includes('data-act="dic-import"') && !rowFor(renderedAfter, 'manual-approve-cascade.json').includes('data-act="dic-archive"'));
}

console.log('\n[Phase 2 Follow-up — the SAME persisted stage renders in the right vocabulary per presentation mode]');
{
  const modeController = createDatasetImportController({});
  // A freshly created session sits at pipelineStage CLASSIFICATION and has
  // no reviewReasons -> it shows in the workspace's Live Activity with a
  // stage badge.
  createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'mode-vocab-fixture.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  // Default mode is Normal (localStorage unavailable under Node -> 'normal').
  const normalHtml = modeController.render();
  check('in Normal mode, a CLASSIFICATION-stage session shows the friendly phase "Uploading"', normalHtml.includes('dic-stage-badge">Uploading') && !normalHtml.includes('dic-stage-badge">Classification'));

  // Toggle to Developer via the real controller click handler.
  const modeHandled = modeController.onClick({ dataset: { act: 'dic-mode', id: 'developer' }, closest: () => null }, () => {});
  const devHtml = modeController.render();
  check('onClick("dic-mode","developer") is handled', modeHandled === true);
  check('in Developer mode, the SAME session shows the detailed stage "Classification"', devHtml.includes('dic-stage-badge">Classification') && !devHtml.includes('dic-stage-badge">Uploading'));
}

console.log('\n[Phase 2.5 Part 1 — metadata editor keystroke must NOT trigger a re-render]');
{
  // The scroll/focus/caret loss was caused by a full workspace innerHTML
  // rebuild on every keystroke. The fix: a field/fact keystroke updates
  // state ONLY, never calls rerender — so the focused <input> node is never
  // destroyed. This verifies that mechanism directly (no browser needed).
  const editController = createDatasetImportController({});
  const lowConf = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'metadata-editor.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  attachInferenceResult(lowConf.data.id, { confidence: 0.2, confidenceRationale: null }); // low -> has reviewReasons -> Advanced Metadata available
  // Open the Advanced Metadata panel (this legitimately DOES render).
  editController.onClick({ dataset: { act: 'dic-advanced-open', id: lowConf.data.id }, closest: () => null }, () => {});

  let rerenders = 0;
  const rerenderSpy = () => { rerenders += 1; };
  // A minimal DOM-less event whose target resolves the adv-fact selector.
  const factEvent = { target: { id: '', closest: (sel) => (sel.includes('dic-adv-fact') ? { dataset: { field: 'value' }, value: 'typed by a human' } : null) } };
  const handled = editController.onInput(factEvent, rerenderSpy);
  check('a content-fact keystroke is handled by the controller', handled === true);
  check('a content-fact keystroke triggers ZERO re-renders (form node never rebuilt -> focus/caret/scroll preserved)', rerenders === 0);

  const fieldEvent = { target: { id: '', closest: (sel) => (sel.includes('dic-adv-field') ? { dataset: { field: 'datasetType' }, value: 'historical' } : null) } };
  editController.onInput(fieldEvent, rerenderSpy);
  check('a metadata-field keystroke also triggers ZERO re-renders', rerenders === 0);
}

console.log('\n[Phase 2.5 Part 4 — effectiveStage never falls behind the authoritative state]');
check('an Archived session with a MISSING pipelineStage still resolves to COMPLETED (never "Uploading")', effectiveStage({ state: IMPORT_SESSION_STATE.ARCHIVED }) === PIPELINE_STAGE.COMPLETED);
check('an Archived session with a STALE CLASSIFICATION pipelineStage still resolves to COMPLETED', effectiveStage({ state: IMPORT_SESSION_STATE.ARCHIVED, pipelineStage: PIPELINE_STAGE.CLASSIFICATION }) === PIPELINE_STAGE.COMPLETED);
check('a Knowledge-Imported session floors at KNOWLEDGE_EXTRACTION even if pipelineStage is behind', effectiveStage({ state: IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, pipelineStage: PIPELINE_STAGE.CLASSIFICATION }) === PIPELINE_STAGE.KNOWLEDGE_EXTRACTION);
check('a persisted pipelineStage AHEAD of the state floor is respected', effectiveStage({ state: IMPORT_SESSION_STATE.UPLOADED, pipelineStage: PIPELINE_STAGE.POLICY_VALIDATION }) === PIPELINE_STAGE.POLICY_VALIDATION);

console.log('\n[Phase 2.5 Part 5 — batch counters computed from persisted sessions]');
{
  const batch = createBatch({ createdBy: 'evan', domainType: 'nor', totalFiles: 4 });
  const batchId = batch.data.id;
  // s1: archived (completed)
  const s1 = createImportSession({ domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'c1.json', mimeType: 'application/json', sizeBytes: 10, kind: IMPORT_SESSION_KIND.JSON, knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId });
  attachParsedContent(s1.data.id, { value: 'x' });
  submitImportSessionForReview(s1.data.id);
  approveImportSession(s1.data.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'f' });
  markKnowledgeImported(s1.data.id);
  markArchived(s1.data.id, 'archive:c1');
  recordBatchItem(batchId, s1.data.id, { imported: true, knowledgeProduced: true });
  // s2: pending review, PDF no facts -> waiting review (MISSING_CONTENT_FACTS)
  const s2 = createImportSession({ domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'w1.pdf', mimeType: 'application/pdf', sizeBytes: 10, kind: IMPORT_SESSION_KIND.PDF, knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId });
  submitImportSessionForReview(s2.data.id);
  recordBatchItem(batchId, s2.data.id, { imported: true });
  // (2 files never got a session — not started)
  const p = { batchId, total: 4, items: [] };
  const counters = computeBatchCounters(p);
  check('counters.total reflects the persisted batch total (4)', counters.total === 4);
  check('one archived session is counted as Completed', counters.completed === 1);
  check('one facts-less pending PDF is counted as Waiting Review', counters.waitingReview === 1);
  check('the 2 not-yet-started files roll into Uploading (X / total)', counters.uploading === 2);
  check('every counter is a real number, never fabricated/animated', [counters.processing, counters.knowledgeExtraction, counters.learning, counters.failed].every((n) => typeof n === 'number'));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
