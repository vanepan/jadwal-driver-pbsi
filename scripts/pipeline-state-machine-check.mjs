/* pipeline-state-machine-check.mjs — Phase 2.6, "Pipeline State Machine &
   Autonomous Completion Hardening".

   Regression coverage for the defects this milestone root-caused, each named
   after the thing that was actually broken rather than the code that fixes it:

     1. batch cancellation                  (incl. the RTDB round-trip that
                                             silently ate the cancel write)
     2. terminal-state guarantee            (no session rests anywhere but
                                             Completed / Cancelled / Failed /
                                             Pending Human Evidence)
     3. automatic knowledge creation        (no "Impor sebagai Knowledge" click)
     4. the DatasetSpec self-heal           (THE reason autonomous import died
                                             after every refresh)
     5. pipeline-stage synchronization      (no stale "Uploading")
     6. completed-status propagation
     7. queue completion / resumption sweep (orphaned sessions get adopted)
     8. idempotence + O(N) convergence      (a settled sweep writes nothing)

   Deterministic, no AI, no fabricated data, no Firebase touch (memory
   repository only — RTDB behaviour is SIMULATED faithfully, see the round-trip
   block, rather than reached over a network).
   Run: node scripts/pipeline-state-machine-check.mjs   (exit 0 = pass) */

import { setActiveRepository, list as knowledgeList } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { resetConnectorRegistry } from '../js/v2/knowledge/registry/connector-registry.js';
import { resetDatasetRegistry, hasDataset } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import { resetImportReportLog } from '../js/v2/knowledge/acquisition/acquisition-engine.js';
import { resetManualImportQueue } from '../js/v2/knowledge/acquisition/manual-import-queue-store.js';
import { resetImportSessionRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-session-repository.js';
import { resetImportBatchRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-batch-repository.js';
import { resetArchiveRepository, list as archiveList } from '../src/organizational-memory/repository/archive-repository.js';
import { DATASET_TYPE } from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';
import {
  IMPORT_SESSION_STATE, IMPORT_SESSION_KIND, PIPELINE_STAGE, PIPELINE_STAGE_ORDER,
  IMPORT_SESSION_GRAPH, IMPORT_SESSION_TERMINAL_STATES, isTerminalImportSessionState,
  isOffRampStage, normalizeImportSessionRecord,
} from '../js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  BATCH_STATUS, isImportBatchRecord, makeImportBatchRecord, normalizeImportBatchRecord,
} from '../js/v2/knowledge/datasets/import-session/contracts/import-batch-contract.js';
import {
  createImportSession, attachParsedContent, attachManualEntryFacts, attachInferenceResult,
  getImportSession, listImportSessions, markUploading, updateSessionMetadata, ensureDatasetForSession,
} from '../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import {
  createBatch, getBatch, cancelBatch, completeBatch, recordBatchItem,
} from '../js/v2/knowledge/datasets/import-session/import-batch-engine.js';
import {
  advanceSession, sweepPipeline, cancelImportBatch, discardImportSession, PIPELINE_OUTCOME,
} from '../js/v2/knowledge/datasets/import-session/pipeline-scheduler.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Importing the UI module registers the real archiver with the scheduler (the
// one cross-layer seam — see dataset-import-center.js#registerArchiver).
import { effectiveStage, reviewReasons } from '../js/v2/ui/dataset-import-center.js';

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

function newJson(filename, batchId = null) {
  const c = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename,
    mimeType: 'application/json', sizeBytes: 20, kind: IMPORT_SESSION_KIND.JSON,
    knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId,
  });
  attachParsedContent(c.data.id, { value: `content of ${filename}` });
  return c.data.id;
}
function newPdf(filename, batchId = null) {
  const c = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename,
    mimeType: 'application/pdf', sizeBytes: 30, kind: IMPORT_SESSION_KIND.PDF,
    knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId,
  });
  return c.data.id;
}
const stateOf = (id) => getImportSession(id).data.state;
const stageOf = (id) => getImportSession(id).data.pipelineStage;

/* ══ 1. THE STATE MACHINE ITSELF ═══════════════════════════════════════ */

console.log('\n[Part 2 — the graph has real terminal off-ramps, and they absorb]');
check('CANCELLED and FAILED are declared terminal states', IMPORT_SESSION_TERMINAL_STATES.includes(IMPORT_SESSION_STATE.CANCELLED)
  && IMPORT_SESSION_TERMINAL_STATES.includes(IMPORT_SESSION_STATE.FAILED)
  && IMPORT_SESSION_TERMINAL_STATES.includes(IMPORT_SESSION_STATE.ARCHIVED));
check('every terminal state is ABSORBING (no out-edges) — this is what makes the sweep converge',
  IMPORT_SESSION_TERMINAL_STATES.every((s) => IMPORT_SESSION_GRAPH[s].length === 0));
check('every non-terminal state has an escape to CANCELLED or FAILED — no state is a dead end',
  Object.entries(IMPORT_SESSION_GRAPH)
    .filter(([s]) => !isTerminalImportSessionState(s))
    .every(([, edges]) => edges.includes(IMPORT_SESSION_STATE.CANCELLED) || edges.includes(IMPORT_SESSION_STATE.FAILED)));
check('KNOWLEDGE_IMPORTED deliberately has NO cancel edge — completed work is never destroyed',
  !IMPORT_SESSION_GRAPH[IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED].includes(IMPORT_SESSION_STATE.CANCELLED));
check('the ladder contains the real Uploading stage (it did not exist before Phase 2.6)',
  PIPELINE_STAGE_ORDER.includes(PIPELINE_STAGE.UPLOADING));
check('the off-ramps are NOT on the ladder (they are exits from it, not positions on it)',
  !PIPELINE_STAGE_ORDER.includes(PIPELINE_STAGE.AWAITING_EVIDENCE)
  && !PIPELINE_STAGE_ORDER.includes(PIPELINE_STAGE.CANCELLED)
  && !PIPELINE_STAGE_ORDER.includes(PIPELINE_STAGE.FAILED));

/* ══ 2. AUTOMATIC KNOWLEDGE CREATION ═══════════════════════════════════ */

console.log('\n[Part 3 — deterministic evidence completes the pipeline with ZERO human input]');
{
  const id = newJson('auto-complete.json');
  const before = knowledgeList({}).data.length;
  const outcome = advanceSession(id);

  check('advanceSession reports COMPLETED', outcome.ok && outcome.outcome === PIPELINE_OUTCOME.COMPLETED);
  check('the session reached Archived — no Setujui, no Impor sebagai Knowledge, no Arsipkan',
    stateOf(id) === IMPORT_SESSION_STATE.ARCHIVED);
  check('the persisted pipelineStage reached COMPLETED', stageOf(id) === PIPELINE_STAGE.COMPLETED);

  const s = getImportSession(id).data;
  check('a REAL KnowledgeItem was created (not a flag flipped)', knowledgeList({}).data.length === before + 1 && !!s.knowledgeItemId);
  check('the KnowledgeItem lands as DRAFT — the human governance gate is intact, just moved to Knowledge Center',
    knowledgeList({}).data.find((k) => k.id === s.knowledgeItemId).lifecycleState === 'draft');
  check('a REAL ArchiveRecord was written', !!s.archiveRecordId && archiveList({}).data.some((r) => r.id === s.archiveRecordId));
  check('the session records that it was imported automatically', s.autoImported === true);
  check('approval was recorded for audit (who/why) even though no human clicked', !!s.approvedBy && !!s.preferenceRationale);
}

console.log('\n[Part 3 — evidence the engine genuinely LACKS is never fabricated]');
{
  const id = newPdf('no-facts.pdf');
  const outcome = advanceSession(id);
  check('a PDF with no human-typed fact parks at Pending Human Evidence', outcome.outcome === PIPELINE_OUTCOME.AWAITING_EVIDENCE);
  check('...recorded in the PERSISTED stage, so every surface reads the same conclusion',
    stageOf(id) === PIPELINE_STAGE.AWAITING_EVIDENCE);
  check('...and no Knowledge was invented for it', !getImportSession(id).data.knowledgeItemId);

  // The human supplies the ONE thing the engine cannot: a fact.
  attachManualEntryFacts(id, { value: 'a real fact a human read from the page', documentNumber: 'DOC-9' });
  const resumed = advanceSession(id);
  check('the moment the human supplies the fact, the pipeline resumes and finishes ITSELF',
    resumed.outcome === PIPELINE_OUTCOME.COMPLETED && stateOf(id) === IMPORT_SESSION_STATE.ARCHIVED);
}

/* ══ 3. THE DATASETSPEC SELF-HEAL — the root cause of Parts 3 AND 4 ════ */

console.log('\n[Part 3/4 ROOT CAUSE — a rehydrated session whose in-memory DatasetSpec is gone]');
{
  const id = newJson('after-refresh.json');
  const datasetId = getImportSession(id).data.datasetId;
  check('setup: the session owns a registered DatasetSpec', hasDataset(datasetId));

  // THE BUG, reproduced exactly. Import Sessions are RTDB-persisted and come
  // back after a refresh; the dataset registry is a plain in-memory Map and
  // does NOT. So markKnowledgeImported() called importDataset(), which could
  // not resolve the spec, returned DATASET_NOT_FOUND, and the session parked
  // at Approved — surfacing an "Impor sebagai Knowledge" button that invoked
  // the same failing path and so could NEVER succeed, however many times it
  // was clicked. Both reported defects, one dead registry entry.
  resetDatasetRegistry();
  check('after a "refresh", the DatasetSpec is gone (the session survives, its spec does not)', !hasDataset(datasetId));

  const outcome = advanceSession(id);
  check('the pipeline SELF-HEALS the spec from the session and completes anyway',
    outcome.ok && outcome.outcome === PIPELINE_OUTCOME.COMPLETED && stateOf(id) === IMPORT_SESSION_STATE.ARCHIVED);
  check('...the spec was deterministically re-derived, never guessed', hasDataset(datasetId));

  const s = getImportSession(id).data;
  check('ensureDatasetForSession is idempotent (re-running it is a cheap no-op)',
    ensureDatasetForSession(s) === datasetId && hasDataset(datasetId));
}

/* ══ 4. BATCH CANCELLATION ═════════════════════════════════════════════ */

console.log('\n[Part 1 ROOT CAUSE — the RTDB round-trip that silently ate the cancel write]');
{
  // RTDB stores NEITHER an empty array NOR a null — both keys are simply
  // ABSENT from the snapshot it returns. Simulate that faithfully.
  const fresh = makeImportBatchRecord({ id: 'import-batch:nor:fixture', createdBy: 'evan', domainType: 'nor', totalFiles: 3 });
  const asRtdbReturnsIt = JSON.parse(JSON.stringify(fresh, (k, v) => {
    if (v === null) return undefined;
    if (Array.isArray(v) && v.length === 0) return undefined;
    return v;
  }));
  check('a fresh batch round-tripped through RTDB comes back with sessionIds MISSING (not empty)',
    !('sessionIds' in asRtdbReturnsIt) && !('finishedAt' in asRtdbReturnsIt));
  check('...so it FAILS structural validation — which is why cancelBatch()\'s write silently vanished',
    isImportBatchRecord(asRtdbReturnsIt) === false);
  check('normalizeImportBatchRecord restores the declared shape, and validation passes again',
    isImportBatchRecord(normalizeImportBatchRecord(asRtdbReturnsIt)) === true);
  check('normalization restores an ABSENT key to its default without inventing data',
    normalizeImportBatchRecord(asRtdbReturnsIt).sessionIds.length === 0
    && normalizeImportBatchRecord(asRtdbReturnsIt).finishedAt === null
    && normalizeImportBatchRecord(asRtdbReturnsIt).totalFiles === 3);

  // The same hole existed on the session side.
  const session = normalizeImportSessionRecord({ id: 'x', version: 1, domainType: 'nor', filename: 'f.pdf', mimeType: 'application/pdf', state: 'uploaded', datasetId: 'd' });
  check('an Import Session round-trip also re-establishes its arrays (validationErrors/Warnings)',
    Array.isArray(session.validationErrors) && Array.isArray(session.validationWarnings) && session.pipelineAttempts === 0);
}

console.log('\n[Part 1 — cancelling a batch cancels its unfinished WORK, not just a status field]');
{
  const batch = createBatch({ createdBy: 'evan', domainType: 'nor', totalFiles: 4 });
  const batchId = batch.data.id;

  const completed = newJson('batch-done.json', batchId);
  advanceSession(completed); // reaches Archived BEFORE the cancel
  recordBatchItem(batchId, completed, { imported: true, knowledgeProduced: true });

  const queued1 = newPdf('batch-queued-1.pdf', batchId);
  const queued2 = newPdf('batch-queued-2.pdf', batchId);
  recordBatchItem(batchId, queued1, { imported: true });
  // queued2 is a STRAGGLER: created, but never recorded onto the batch record
  // (the exact shape of a file in flight when the cancel lands).

  const result = cancelImportBatch(batchId);
  check('cancelImportBatch succeeds', result.ok === true);
  check('the batch record is really Cancelled', getBatch(batchId).data.status === BATCH_STATUS.CANCELLED);
  check('a queued session becomes CANCELLED (terminal) — not left looking like live work',
    stateOf(queued1) === IMPORT_SESSION_STATE.CANCELLED);
  check('a STRAGGLER never recorded onto the batch is cancelled too ("mostly cancelled" is not cancelled)',
    stateOf(queued2) === IMPORT_SESSION_STATE.CANCELLED);
  check('the already-Archived session is UNTOUCHED — completed work survives a cancel',
    stateOf(completed) === IMPORT_SESSION_STATE.ARCHIVED);
  check('partial progress is preserved: its KnowledgeItem and ArchiveRecord still exist',
    !!getImportSession(completed).data.knowledgeItemId && !!getImportSession(completed).data.archiveRecordId);
  check('cancelled sessions carry a real, honest reason', !!getImportSession(queued1).data.failureReason);

  // Idempotence — cancel is reachable from the progress panel, the recovery
  // banner, the worker's settle, and another tab, in any order.
  const again = cancelImportBatch(batchId);
  check('cancelling an already-cancelled batch is a SUCCESSFUL no-op (idempotent)', again.ok === true);
  check('cancelBatch() itself is idempotent', cancelBatch(batchId).ok === true);
  check('a cancelled batch can never be flipped to Completed by a late worker settle',
    completeBatch(batchId).data.status === BATCH_STATUS.CANCELLED);

  // Refresh-survival: the scheduler must never resurrect a cancelled session.
  sweepPipeline();
  check('a sweep AFTER cancellation never resurrects a cancelled session (CANCELLED is absorbing)',
    stateOf(queued1) === IMPORT_SESSION_STATE.CANCELLED && stateOf(queued2) === IMPORT_SESSION_STATE.CANCELLED);
}

console.log('\n[Part 1 — a session whose batch is cancelled mid-flight is caught by the scheduler]');
{
  const batch = createBatch({ createdBy: 'evan', domainType: 'nor', totalFiles: 1 });
  const batchId = batch.data.id;
  const inFlight = newPdf('mid-flight.pdf', batchId);
  cancelBatch(batchId); // only the RECORD is cancelled — the session is untouched
  check('setup: the session is still non-terminal after a bare cancelBatch()', !isTerminalImportSessionState(stateOf(inFlight)));

  const outcome = advanceSession(inFlight);
  check('the scheduler reads the PERSISTED batch status and cancels the session itself',
    outcome.outcome === PIPELINE_OUTCOME.CANCELLED && stateOf(inFlight) === IMPORT_SESSION_STATE.CANCELLED);
}

/* ══ 5. STAGE SYNCHRONIZATION — no stale "Uploading" ═══════════════════ */

console.log('\n[Part 2 — no stale Uploading badge can survive]');
{
  const id = newJson('stage-sync.json');
  markUploading(id);
  check('markUploading writes a REAL uploading stage (the only honest one)', stageOf(id) === PIPELINE_STAGE.UPLOADING);

  advanceSession(id);
  check('once the pipeline completes, the persisted stage is COMPLETED — the Uploading marker is gone',
    stageOf(id) === PIPELINE_STAGE.COMPLETED);
  check('and effectiveStage() (what every UI surface reads) agrees',
    effectiveStage(getImportSession(id).data) === PIPELINE_STAGE.COMPLETED);

  // The defect: a document whose downstream processing had plainly happened,
  // still displaying "Uploading". Impossible now from either direction — a
  // terminal state pins the stage, and a parked session reports its off-ramp.
  const all = listImportSessions({}).data;
  const liars = all.filter((s) => isTerminalImportSessionState(s.state) && effectiveStage(s) === PIPELINE_STAGE.UPLOADING);
  check('NO terminal session anywhere in the repository displays "Uploading"', liars.length === 0);
}

/* ══ 6. TERMINAL-STATE GUARANTEE + THE SWEEP ══════════════════════════ */

console.log('\n[Part 5 — every session reaches a terminal state, or an honest Pending Human Evidence]');
{
  // A fleet of orphans, exactly as a refresh mid-batch would leave them: real
  // sessions, mid-pipeline, with nobody driving them. Before Phase 2.6 nothing
  // in the system would ever look at them again.
  const orphans = [
    newJson('orphan-1.json'), newJson('orphan-2.json'),
    newPdf('orphan-3.pdf'), newPdf('orphan-4.pdf'),
  ];
  attachInferenceResult(orphans[3], { confidence: 0.1, confidenceRationale: null }); // low-confidence metadata
  markUploading(orphans[0]); // interrupted mid-upload — its File handle died with the tab

  const summary = sweepPipeline();
  check('the sweep adopts the orphans nobody was driving', summary.swept >= 4);
  check('the two fully-evidenced JSON files completed on their own', summary.completed >= 2);
  check('a session interrupted MID-UPLOAD still reaches a terminal state (the lost File handle does not strand it)',
    stateOf(orphans[0]) === IMPORT_SESSION_STATE.ARCHIVED);

  const allSessions = listImportSessions({}).data;
  const resting = allSessions.every((s) => isTerminalImportSessionState(s.state) || isOffRampStage(effectiveStage(s)));
  check('THE GUARANTEE: after one sweep, EVERY session rests in Completed / Cancelled / Failed / Pending Human Evidence',
    resting === true);
  check('...and nothing is left in a permanent Preparing / Uploading / Processing / Extraction state',
    allSessions.every((s) => ![PIPELINE_STAGE.PREPARING, PIPELINE_STAGE.UPLOADING, PIPELINE_STAGE.POLICY_VALIDATION,
      PIPELINE_STAGE.KNOWLEDGE_EXTRACTION, PIPELINE_STAGE.CLASSIFICATION].includes(effectiveStage(s))));

  // Convergence: the sweep runs on every repository change, so a sweep that
  // keeps writing would feed itself forever. A settled system must write NOTHING.
  const versionsBefore = allSessions.reduce((n, s) => n + s.version, 0);
  const second = sweepPipeline();
  const versionsAfter = listImportSessions({}).data.reduce((n, s) => n + s.version, 0);
  check('a SECOND sweep over a settled system performs ZERO writes (idempotent — the event loop terminates)',
    versionsAfter === versionsBefore);
  check('...and completes no new work', second.completed === 0 && second.cancelled === 0);
}

console.log('\n[Part 5 — an unsupported format is a real, terminal FAILURE, not an eternal retry]');
{
  const c = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'scan.tiff',
    mimeType: 'image/tiff', sizeBytes: 10, kind: 'unsupported',
    knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  const id = c.data.id;
  const outcome = advanceSession(id);
  check('an unsupported format terminates as FAILED (it never becomes supported by retrying)',
    outcome.outcome === PIPELINE_OUTCOME.FAILED && stateOf(id) === IMPORT_SESSION_STATE.FAILED);
  check('...with a real recorded reason, never a fabricated one',
    getImportSession(id).data.failureReason.includes('unsupported'));
  check('...and it does NOT sit under an "Uploading" badge forever', effectiveStage(getImportSession(id).data) === PIPELINE_STAGE.FAILED);

  const versionBefore = getImportSession(id).data.version;
  const again = advanceSession(id);
  check('re-advancing a FAILED session is a stable no-op — same outcome, and ZERO new writes',
    again.outcome === PIPELINE_OUTCOME.FAILED && getImportSession(id).data.version === versionBefore);
}

/* ══ 7. LOW-CONFIDENCE RECOVERY ═══════════════════════════════════════ */

console.log('\n[Part 3 — a human-corrected low-confidence session can actually finish]');
{
  const id = newJson('low-conf-recover.json');
  attachInferenceResult(id, { confidence: 0.1, confidenceRationale: null });
  advanceSession(id);
  check('a low-confidence session parks for a human (its metadata is genuinely untrustworthy)',
    stageOf(id) === PIPELINE_STAGE.AWAITING_EVIDENCE);

  // THE LATENT BUG: `confidence` never changes, so before Phase 2.6 this
  // session was permanently un-completable — the low-confidence gate could
  // never be satisfied, no matter what the human did.
  updateSessionMetadata(id, { domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, knowledgeKind: 'document_fact', confirmedBy: 'evan' });
  const outcome = advanceSession(id);
  check('once a human confirms the metadata, the session completes (the gate is satisfiable at all)',
    outcome.outcome === PIPELINE_OUTCOME.COMPLETED && stateOf(id) === IMPORT_SESSION_STATE.ARCHIVED);
}

/* ══ 8. CROSS-WORKSPACE / COMPLETED-STATUS PROPAGATION ════════════════ */

console.log('\n[Part 5 — THE INVISIBILITY GUARD: a parked session is never visible NOWHERE]');
{
  // The failure mode this whole milestone exists to eliminate: a session that
  // is off the ladder (so it is excluded from "Aktivitas Langsung") AND has no
  // review reason (so it is excluded from "Perlu Perhatian") is waiting
  // forever, for nobody, in a queue no human ever looks at. Every parked
  // session must therefore give a human something to read — no exceptions.
  const all = listImportSessions({}).data;
  const parked = all.filter((s) => !isTerminalImportSessionState(s.state) && isOffRampStage(effectiveStage(s)));
  check('setup: the repository really does contain parked sessions to test', parked.length > 0);
  check('EVERY parked session surfaces at least one reason a human can read',
    parked.every((s) => reviewReasons(s).length > 0));
  check('every parked session is therefore reachable in the Perlu Perhatian queue',
    parked.every((s) => reviewReasons(s).some((r) => typeof r.message === 'string' && r.message.length > 0)));
}

console.log('\n[Part 6 — one completion propagates to every workspace, from ONE persisted truth]');
{
  const id = newJson('propagation.json');
  const knowledgeBefore = knowledgeList({}).data.length;
  const archiveBefore = archiveList({}).data.length;
  advanceSession(id);
  const s = getImportSession(id).data;

  // Each workspace reads a DIFFERENT repository, but all of them are downstream
  // of this ONE session write — there is no duplicated status cache anywhere.
  check('Dataset Import Center sees Completed (Import Session repository)', s.state === IMPORT_SESSION_STATE.ARCHIVED);
  check('Archive Center sees a new ArchiveRecord (Archive repository)', archiveList({}).data.length === archiveBefore + 1);
  check('Knowledge Center sees a new Draft KnowledgeItem (Knowledge repository)', knowledgeList({}).data.length === knowledgeBefore + 1);
  check('Learning Dashboard sees it too — same KnowledgeItem, no second counter',
    knowledgeList({}).data.some((k) => k.id === s.knowledgeItemId));
  check('the session links all three together, so no workspace has to re-derive status',
    !!s.knowledgeItemId && !!s.archiveRecordId && !!s.datasetId);
}

/* ══ 9. THE HUMAN'S "NO" MUST SURVIVE THE SCHEDULER ═══════════════════ */

console.log('\n[HARDENING — "Tolak" is terminal, and no sweep can overturn it]');
{
  // The old dic-reject called rejectImportSession(), which was broken in BOTH
  // reachable cases: from Pending Review it bounced the session to Uploaded and
  // the next sweep drove it straight back (the scheduler overruling the human),
  // and from Uploaded it failed outright with INVALID_IMPORT_DECISION (the
  // button doing nothing at all). A "no" the engine overturns is not a no.
  const parkedAtPendingReview = newPdf('reject-a.pdf');
  advanceSession(parkedAtPendingReview);
  check('setup: a facts-less PDF is parked at Pending Review', stateOf(parkedAtPendingReview) === IMPORT_SESSION_STATE.PENDING_REVIEW);
  discardImportSession(parkedAtPendingReview, { actor: 'evan' });
  check('a human rejection is TERMINAL (Cancelled), not a bounce back to Uploaded',
    stateOf(parkedAtPendingReview) === IMPORT_SESSION_STATE.CANCELLED);
  sweepPipeline();
  check('...and the next sweep does NOT resurrect it — the scheduler cannot overrule a human',
    stateOf(parkedAtPendingReview) === IMPORT_SESSION_STATE.CANCELLED);
  check('...it leaves the attention queue entirely', reviewReasons(getImportSession(parkedAtPendingReview).data).length === 0);

  // The case that previously did NOTHING AT ALL (Uploaded -> Uploaded is not a
  // legal edge, so rejectImportSession failed silently).
  const parkedAtUploaded = newJson('reject-b.json');
  attachInferenceResult(parkedAtUploaded, { confidence: 0.1, confidenceRationale: null });
  advanceSession(parkedAtUploaded);
  check('setup: a low-confidence session is parked at Uploaded', stateOf(parkedAtUploaded) === IMPORT_SESSION_STATE.UPLOADED);
  const discarded = discardImportSession(parkedAtUploaded, { actor: 'evan' });
  check('rejecting from Uploaded now actually WORKS (it used to fail with INVALID_IMPORT_DECISION)',
    discarded.ok && stateOf(parkedAtUploaded) === IMPORT_SESSION_STATE.CANCELLED);
  check('...and records that a HUMAN decided, not a cancelled batch',
    getImportSession(parkedAtUploaded).data.failureReason.includes('Ditolak oleh evan'));

  // A fully-evidenced session a human declines must NOT be auto-imported anyway.
  const evidenced = newJson('reject-c.json');
  discardImportSession(evidenced, { actor: 'evan' });
  sweepPipeline();
  check('a human can reject a FULLY-EVIDENCED document and the pipeline respects it (no auto-import)',
    stateOf(evidenced) === IMPORT_SESSION_STATE.CANCELLED && !getImportSession(evidenced).data.knowledgeItemId);
}

/* ══ 10. ARCHITECTURAL GUARD — the invariant, enforced by the test ════ */

console.log('\n[HARDENING — no UI module may import a lifecycle mutator]');
{
  // The claim "the scheduler is the only driver" is worth nothing if the next
  // person can quietly reintroduce a second one. This asserts it structurally,
  // so a regression fails the suite rather than the pipeline.
  const MUTATORS = [
    'submitImportSessionForReview', 'approveImportSession', 'rejectImportSession',
    'markKnowledgeImported', 'markArchived', 'markUploading', 'markAwaitingEvidence',
    'cancelImportSession', 'failImportSession', 'recordPipelineAttempt', 'markAutoImported',
  ];
  const uiDir = path.join(ROOT, 'js/v2/ui');
  const uiFiles = fs.readdirSync(uiDir).filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const file of uiFiles) {
    const src = fs.readFileSync(path.join(uiDir, file), 'utf8');
    // Only look at real import statements, not prose in comments.
    const importBlocks = src.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const block of importBlocks) {
      for (const m of MUTATORS) {
        if (new RegExp(`\\b${m}\\b`).test(block)) offenders.push(`${file} imports ${m}`);
      }
    }
  }
  check(`NO ui/*.js file imports any of the ${MUTATORS.length} lifecycle mutators${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);

  // And the scheduler really is the only caller of them across ALL of js/v2.
  const engineDir = path.join(ROOT, 'js/v2/knowledge/datasets/import-session');
  const schedulerSrc = fs.readFileSync(path.join(engineDir, 'pipeline-scheduler.js'), 'utf8');
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const transitions = ['submitImportSessionForReview', 'approveImportSession', 'markKnowledgeImported', 'markArchived', 'cancelImportSession', 'failImportSession', 'markAwaitingEvidence'];
  check('the scheduler calls every lifecycle transition itself (it is the driver, not a delegator)',
    transitions.every((t) => new RegExp(`${t}\\(`).test(stripComments(schedulerSrc))));

  // The service facade must not hand out the primitives.
  const serviceSrc = stripComments(fs.readFileSync(path.join(ROOT, 'js/v2/knowledge/services/import-session-service.js'), 'utf8'));
  const leaked = MUTATORS.filter((m) => new RegExp(`\\b${m}\\b`).test(serviceSrc));
  check(`the service facade re-exports NO lifecycle primitive${leaked.length ? ` — LEAKED: ${leaked.join(', ')}` : ''}`, leaked.length === 0);
  check('the service facade does NOT re-export the unsafe bare cancelBatch', !/\bcancelBatch\b/.test(serviceSrc));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
