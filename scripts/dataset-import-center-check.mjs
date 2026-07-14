/* dataset-import-center-check.mjs — Node check for js/v2/ui/dataset-import-center.js's
   exported, module-scope logic: reviewReasons(), archiveDuplicateWarning(),
   findReusableContentFacts(), effectiveStage(), computeBatchCounters(), and
   the real render()/onClick() output they drive.

   PHASE 2.6 REWRITE. This file previously asserted, at length, the exact
   behaviours this milestone was called to remove — that a Pending Review
   session is "always flagged PENDING_DECISION", that clicking "Setujui"
   cascades to Archived, that a CLASSIFICATION-stage session displays the
   badge "Uploading". Those assertions were faithful to the old code and are
   false of the new state machine, so they are replaced rather than patched.
   The behaviours they were protecting (never fabricate content; never show a
   button with nothing to decide; never let a stage badge outrun the truth)
   are all still asserted here — against the lifecycle that now exists.

   No OCR, no AI, no production writes (memory repository only, no Firebase
   touch — dataset-import-center.js only lazily import()s file-storage-engine.js
   inside the real upload path, never at module load).
   Run: node scripts/dataset-import-center-check.mjs   (exit 0 = pass) */

import { setActiveRepository } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { resetConnectorRegistry } from '../js/v2/knowledge/registry/connector-registry.js';
import { resetDatasetRegistry } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import { resetImportReportLog } from '../js/v2/knowledge/acquisition/acquisition-engine.js';
import { resetManualImportQueue } from '../js/v2/knowledge/acquisition/manual-import-queue-store.js';
import { resetImportSessionRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-session-repository.js';
import { resetImportBatchRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-batch-repository.js';
import { resetArchiveRepository } from '../js/v2/organizational-memory/repository/archive-repository.js';
import { DATASET_TYPE } from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';
import {
  IMPORT_SESSION_KIND, IMPORT_SESSION_STATE, PIPELINE_STAGE,
} from '../js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  createImportSession, attachParsedContent, attachManualEntryFacts, attachInferenceResult,
  updateSessionMetadata, getImportSession, markAwaitingEvidence,
} from '../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import { advanceSession } from '../js/v2/knowledge/datasets/import-session/pipeline-scheduler.js';
import { AUTO_POPULATE_CONFIDENCE_THRESHOLD } from '../js/v2/knowledge/datasets/import-session/metadata-inference-engine.js';
import { makeStoredFileRecord } from '../js/v2/file-storage/contracts/file-storage-contract.js';
import { createBatch, recordBatchItem } from '../js/v2/knowledge/datasets/import-session/import-batch-engine.js';
import {
  createDatasetImportController, reviewReasons, archiveDuplicateWarning,
  findReusableContentFacts, effectiveStage, computeBatchCounters,
} from '../js/v2/ui/dataset-import-center.js';
import { setPresentationMode } from '../js/v2/ui/shared/workspace-list-kit.js';

// isDeveloperMode()/setPresentationMode() read/write real localStorage; Node
// has none, so a minimal in-memory stub lets this script exercise the
// Normal/Developer toggle exactly like a browser would.
if (typeof globalThis.localStorage === 'undefined') {
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
}

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetConnectorRegistry();
resetDatasetRegistry();
resetImportSessionRepository();
resetImportBatchRepository();
resetManualImportQueue();
resetImportReportLog();
resetArchiveRepository();

/** A JSON session whose real parsed content satisfies hasContentFacts(). */
function newJsonSession(filename, batchId = null) {
  const created = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename,
    mimeType: 'application/json', sizeBytes: 20, kind: IMPORT_SESSION_KIND.JSON,
    knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId,
  });
  attachParsedContent(created.data.id, { value: 'real parsed content' });
  return created.data.id;
}

/** A PDF session — the format that can NEVER derive its own facts. */
function newPdfSession(filename, batchId = null) {
  const created = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename,
    mimeType: 'application/pdf', sizeBytes: 30, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId,
  });
  return created.data.id;
}

console.log('\n[reviewReasons — the ONE gate: only a scheduler-parked session needs a human]');
{
  // A session mid-pipeline is the ENGINE's business, not a person's. The old
  // logic re-derived "is this stuck?" from state+facts here in the view, so a
  // file still being processed (no content facts YET) was announced as
  // needing attention while the engine was actively working on it.
  const inFlight = newPdfSession('in-flight.pdf');
  check('a session still moving through the pipeline reports NO reasons (it belongs to the engine)',
    reviewReasons(getImportSession(inFlight).data).length === 0);

  markAwaitingEvidence(inFlight);
  const parked = getImportSession(inFlight).data;
  check('the SAME session, once the scheduler parks it at AWAITING_EVIDENCE, reports MISSING_CONTENT_FACTS',
    reviewReasons(parked).some((r) => r.code === 'MISSING_CONTENT_FACTS'));
}

console.log('\n[reviewReasons — terminal states]');
{
  const completed = newJsonSession('completed.json');
  advanceSession(completed);
  const done = getImportSession(completed).data;
  check('setup: a fully-evidenced JSON file reaches Archived with no human input at all', done.state === IMPORT_SESSION_STATE.ARCHIVED);
  check('an Archived (Completed) session has zero reasons — nothing to review', reviewReasons(done).length === 0);

  // Phase 2.6 — a cancelled session used to be flagged BATCH_CANCELLED, which
  // meant cancelling a batch FILLED the attention queue with documents whose
  // fate the operator had just decided. Cancelling should empty the queue.
  const cancelled = { ...done, state: IMPORT_SESSION_STATE.CANCELLED, pipelineStage: PIPELINE_STAGE.CANCELLED };
  check('a Cancelled session has zero reasons — the operator already decided; it is not an exception',
    reviewReasons(cancelled).length === 0);

  const failed = {
    ...done,
    state: IMPORT_SESSION_STATE.FAILED,
    pipelineStage: PIPELINE_STAGE.FAILED,
    failureReason: 'Format "unsupported" tidak didukung.',
    validationErrors: [{ code: 'UNSUPPORTED_FORMAT', message: 'not supported' }],
  };
  const failedReasons = reviewReasons(failed);
  check('a Failed session IS an exception — surfaced with its REAL recorded reason, never a fabricated one',
    failedReasons.some((r) => r.code === 'UNSUPPORTED_FORMAT') && failedReasons[0].message.includes('tidak didukung'));
}

console.log('\n[reviewReasons — LOW_CONFIDENCE clears once a human confirms the metadata]');
{
  const lowConf = newPdfSession('low-confidence.pdf');
  attachInferenceResult(lowConf, { confidence: AUTO_POPULATE_CONFIDENCE_THRESHOLD - 0.1, confidenceRationale: null });
  advanceSession(lowConf); // scheduler parks it: metadata is not trustworthy
  const parked = getImportSession(lowConf).data;
  check('a below-threshold session is parked at AWAITING_EVIDENCE by the scheduler', parked.pipelineStage === PIPELINE_STAGE.AWAITING_EVIDENCE);
  check('...and flagged LOW_CONFIDENCE', reviewReasons(parked).some((r) => r.code === 'LOW_CONFIDENCE'));

  // THE BUG: `confidence` is the score the INFERENCE achieved and never
  // changes. So a session a human had fully corrected by hand kept reporting
  // "confidence too low" forever and could never leave the attention queue.
  updateSessionMetadata(lowConf, { domainType: 'nor', confirmedBy: 'evan' });
  const confirmed = getImportSession(lowConf).data;
  check('once a human CONFIRMS the metadata, LOW_CONFIDENCE no longer fires (a human beats a guess)',
    !reviewReasons(confirmed).some((r) => r.code === 'LOW_CONFIDENCE'));
  check('...but the honest MISSING_CONTENT_FACTS reason remains — a PDF still has no facts',
    reviewReasons(confirmed).some((r) => r.code === 'MISSING_CONTENT_FACTS'));
}

console.log('\n[reviewReasons — DUPLICATE_AMBIGUITY]');
{
  const dup = newPdfSession('dup.pdf');
  markAwaitingEvidence(dup);
  const s = { ...getImportSession(dup).data, validationWarnings: [{ code: 'DUPLICATE_FILENAME', message: 'same filename as another session' }] };
  check('a DUPLICATE_FILENAME warning on a parked session is surfaced as DUPLICATE_AMBIGUITY',
    reviewReasons(s).some((r) => r.code === 'DUPLICATE_AMBIGUITY'));
}

console.log('\n[archiveDuplicateWarning]');
check('a session with no documentHash never produces a warning (nothing to compare)',
  archiveDuplicateWarning({ documentHash: null, domainType: 'nor' }) === null);

console.log('\n[findReusableContentFacts — a confirmed duplicate may honestly reuse a sibling\'s verified facts]');
{
  const original = newPdfSession('original.pdf');
  attachManualEntryFacts(original, { value: 'a real fact a human typed', documentNumber: 'DOC-1', senderOrigin: '', notes: '' });
  const duplicate = newPdfSession('original-copy.pdf');

  const storedFileRecord = {
    ...makeStoredFileRecord({ sha256: 'a'.repeat(64), originalFilename: 'original.pdf', mimeType: 'application/pdf', sizeBytes: 10, storagePath: 'sarpras-intelligence/nor/aaaa' }),
    linkedSessionIds: [original, duplicate],
  };
  const reused = findReusableContentFacts(storedFileRecord, duplicate);
  check('a confirmed duplicate finds its sibling\'s real, human-verified facts',
    reused !== null && reused.manualEntryFacts.value === 'a real fact a human typed');

  const orphanRecord = {
    ...makeStoredFileRecord({ sha256: 'b'.repeat(64), originalFilename: 'never-verified.pdf', mimeType: 'application/pdf', sizeBytes: 10, storagePath: 'sarpras-intelligence/nor/bbbb' }),
    linkedSessionIds: [duplicate],
  };
  check('a duplicate with no sibling that has real facts honestly returns null — never fabricates content',
    findReusableContentFacts(orphanRecord, duplicate) === null);
  check('a StoredFileRecord with no entry at all also returns null (defensive)',
    findReusableContentFacts(null, duplicate) === null);
}

console.log('\n[render() — PART 4: no redundant approval buttons anywhere, ever]');
{
  const controller = createDatasetImportController({});

  const completed = newJsonSession('render-completed.json');
  attachInferenceResult(completed, { confidence: 0.95, confidenceRationale: null });
  advanceSession(completed);

  const parked = newPdfSession('render-parked.pdf');
  attachInferenceResult(parked, { confidence: 0.2, confidenceRationale: null });
  advanceSession(parked);

  const html = controller.render();
  const rowFor = (h, filename) => (h.split('<li class="wlk-row"').find((r) => r.includes(filename)) || '');
  const completedRow = rowFor(html, 'render-completed.json');
  const parkedRow = rowFor(html, 'render-parked.pdf');
  check('both fixture sessions actually rendered', completedRow.length > 0 && parkedRow.length > 0);

  // THE HEADLINE ASSERTION of Part 4. These four actions asked a human to
  // press buttons whose entire job was to invoke engine calls the engine was
  // already capable of making — and "Setujui" + "Impor sebagai Knowledge"
  // could BOTH appear for the same document: two approvals, one process.
  check('render() emits NO "Setujui" (dic-approve) action anywhere', !html.includes('data-act="dic-approve"'));
  check('render() emits NO "Impor sebagai Knowledge" (dic-import) action anywhere', !html.includes('data-act="dic-import"'));
  check('render() emits NO "Arsipkan" (dic-archive) action anywhere', !html.includes('data-act="dic-archive"'));
  check('render() emits NO "Ajukan untuk Review" (dic-submit) action anywhere', !html.includes('data-act="dic-submit"'));

  check('a completed row offers no human action at all — there is nothing left to decide',
    !completedRow.includes('<button'));
  check('a parked row DOES offer the one thing a human can genuinely supply (metadata & facts)',
    parkedRow.includes('data-act="dic-advanced-open"'));
  check('...and the one genuine human decision at this layer (reject)',
    parkedRow.includes('data-act="dic-reject"'));
}

console.log('\n[render() — the same persisted stage, two vocabularies]');
{
  const modeController = createDatasetImportController({});
  const fresh = newPdfSession('mode-vocab-fixture.pdf');

  setPresentationMode('normal');
  const normalHtml = modeController.render();
  // Phase 2.6 — a freshly-created session is at CLASSIFICATION, which now
  // honestly reads "Preparing". It used to read "Uploading" — a label for a
  // step it had already finished, which is exactly why the badge never cleared.
  check('in Normal mode, a CLASSIFICATION-stage session reads "Preparing" (NOT "Uploading")',
    normalHtml.includes('dic-stage-badge">Preparing') && !normalHtml.includes('dic-stage-badge">Uploading'));

  setPresentationMode('developer');
  const devHtml = modeController.render();
  check('in Developer mode, the SAME session reads the raw stage "Classification"',
    devHtml.includes('dic-stage-badge">Classification'));
  setPresentationMode('normal');
  void fresh;
}

console.log('\n[Advanced Metadata — keystrokes must NOT trigger a re-render]');
{
  const editController = createDatasetImportController({});
  const lowConf = newPdfSession('metadata-editor.pdf');
  attachInferenceResult(lowConf, { confidence: 0.2, confidenceRationale: null });
  advanceSession(lowConf);
  editController.onClick({ dataset: { act: 'dic-advanced-open', id: lowConf }, closest: () => null }, () => {});

  let rerenders = 0;
  const rerenderSpy = () => { rerenders += 1; };
  const factEvent = { target: { id: '', closest: (sel) => (sel.includes('dic-adv-fact') ? { dataset: { field: 'value' }, value: 'typed by a human' } : null) } };
  check('a content-fact keystroke is handled by the controller', editController.onInput(factEvent, rerenderSpy) === true);
  check('a content-fact keystroke triggers ZERO re-renders (focus/caret/scroll preserved)', rerenders === 0);

  const fieldEvent = { target: { id: '', closest: (sel) => (sel.includes('dic-adv-field') ? { dataset: { field: 'datasetType' }, value: 'historical' } : null) } };
  editController.onInput(fieldEvent, rerenderSpy);
  check('a metadata-field keystroke also triggers ZERO re-renders', rerenders === 0);
}

console.log('\n[effectiveStage — the badge can never outrun, or lag behind, the truth]');
check('an Archived session with a MISSING pipelineStage still resolves to COMPLETED',
  effectiveStage({ state: IMPORT_SESSION_STATE.ARCHIVED }) === PIPELINE_STAGE.COMPLETED);
check('an Archived session with a STALE CLASSIFICATION pipelineStage still resolves to COMPLETED',
  effectiveStage({ state: IMPORT_SESSION_STATE.ARCHIVED, pipelineStage: PIPELINE_STAGE.CLASSIFICATION }) === PIPELINE_STAGE.COMPLETED);
check('a Knowledge-Imported session floors at KNOWLEDGE_EXTRACTION even if pipelineStage is behind',
  effectiveStage({ state: IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, pipelineStage: PIPELINE_STAGE.CLASSIFICATION }) === PIPELINE_STAGE.KNOWLEDGE_EXTRACTION);
check('a persisted pipelineStage AHEAD of the state floor is respected',
  effectiveStage({ state: IMPORT_SESSION_STATE.UPLOADED, pipelineStage: PIPELINE_STAGE.POLICY_VALIDATION }) === PIPELINE_STAGE.POLICY_VALIDATION);
// Phase 2.6 — off-ramps are NOT ladder positions and must never be max()'d
// against one, or a session resting off the ladder gets dragged back onto it.
check('an AWAITING_EVIDENCE session reports the off-ramp, not a ladder position',
  effectiveStage({ state: IMPORT_SESSION_STATE.UPLOADED, pipelineStage: PIPELINE_STAGE.AWAITING_EVIDENCE }) === PIPELINE_STAGE.AWAITING_EVIDENCE);
check('a CANCELLED state fixes the stage outright, even with a stale CLASSIFICATION annotation',
  effectiveStage({ state: IMPORT_SESSION_STATE.CANCELLED, pipelineStage: PIPELINE_STAGE.CLASSIFICATION }) === PIPELINE_STAGE.CANCELLED);
check('a FAILED state fixes the stage outright — a dead document never displays as climbing',
  effectiveStage({ state: IMPORT_SESSION_STATE.FAILED, pipelineStage: PIPELINE_STAGE.UPLOADING }) === PIPELINE_STAGE.FAILED);

console.log('\n[computeBatchCounters — every counter is a real read of a persisted session]');
{
  const batch = createBatch({ createdBy: 'evan', domainType: 'nor', totalFiles: 4 });
  const batchId = batch.data.id;

  const done = newJsonSession('c1.json', batchId);
  advanceSession(done);
  recordBatchItem(batchId, done, { imported: true, knowledgeProduced: true });

  const waiting = newPdfSession('w1.pdf', batchId);
  advanceSession(waiting); // parks at AWAITING_EVIDENCE — a PDF has no facts
  recordBatchItem(batchId, waiting, { imported: true });

  // (2 files never got a session — not started)
  const counters = computeBatchCounters({ batchId, total: 4, items: [] });
  check('counters.total reflects the persisted batch total (4)', counters.total === 4);
  check('the fully-evidenced JSON file is counted as Completed', counters.completed === 1);
  check('the facts-less PDF is counted as Awaiting Evidence', counters.waitingReview === 1);
  check('the 2 not-yet-started files roll into Preparing (X / total)', counters.preparing === 2);
  check('every counter is a real number, never fabricated/animated',
    [counters.uploading, counters.processing, counters.knowledgeExtraction, counters.failed, counters.cancelled].every((n) => typeof n === 'number'));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
