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
  findReusableContentFacts, effectiveStage, computeBatchCounters, consensusExplanation,
  isoWeekKey, computeAutonomyTrend, contentFactsGapMessage, isReanalyzing, getLastSweepStatus,
} from '../js/v2/ui/dataset-import-center.js';
import { setPresentationMode } from '../js/v2/ui/shared/workspace-list-kit.js';
import { list as listLearningEvents, resetLearningRepository } from '../js/v2/learning/repository/learning-repository.js';

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
resetLearningRepository();

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

  // Phase 8 (Experience Architecture, Part 1/2) — both the Smart Import
  // Feed's "Selesai" group and Grouped Exceptions collapse by default now
  // (real UI change: "the feed should naturally become cleaner over time").
  // A real user expands them by clicking; simulate exactly that before
  // asserting on row content, the same way every other click-driven
  // assertion in this file already does.
  // The parked fixture is a PDF with no content facts AND low confidence —
  // reviewReasons() pushes MISSING_CONTENT_FACTS first (verified directly),
  // so that is the real group it lands in, not LOW_CONFIDENCE.
  controller.onClick({ dataset: { act: 'dic-feed-toggle' }, closest: () => null }, () => {});
  controller.onClick({ dataset: { act: 'dic-queue-bucket-toggle', id: 'exc:MISSING_CONTENT_FACTS' }, closest: () => null }, () => {});
  const html = controller.render();
  const rowFor = (h, filename) => (h.split('<li class="wlk-row').find((r) => r.includes(filename)) || '');
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

  // Phase 8 (Experience Architecture, Part 1) — a completed row now DOES
  // offer one real, new button: Pin (Smart Import Feed). This is not a
  // lifecycle decision — pinning changes nothing about the document, only
  // whether its OWN feed notification survives "Bersihkan Semua"/auto-
  // expire — so the original assertion's actual intent (no LIFECYCLE
  // action remains once a document is done) is re-stated precisely instead
  // of the accidentally-broader "no button of any kind".
  check('a completed row offers no LIFECYCLE action — there is nothing left to decide (Pin is feed-only, not lifecycle)',
    !completedRow.includes('data-act="dic-approve"') && !completedRow.includes('data-act="dic-import"')
    && !completedRow.includes('data-act="dic-archive"') && !completedRow.includes('data-act="dic-submit"')
    && !completedRow.includes('data-act="dic-reject"') && completedRow.includes('data-act="dic-feed-pin"'));
  check('a parked row DOES offer the one thing a human can genuinely supply (metadata & facts)',
    parkedRow.includes('data-act="dic-advanced-open"'));
  check('...and the one genuine human decision at this layer (reject)',
    parkedRow.includes('data-act="dic-reject"'));
}

console.log('\n[render() — the same persisted stage, two vocabularies]');
{
  const modeController = createDatasetImportController({});
  const fresh = newPdfSession('mode-vocab-fixture.pdf');
  // Phase 8 (Experience Architecture, Part 2) — a freshly-created session is
  // in-flight (Progressive Queue's "Preparing" bucket), collapsed by
  // default; expand it, same as a real user click, before reading its badge.
  modeController.onClick({ dataset: { act: 'dic-queue-bucket-toggle', id: 'preparing' }, closest: () => null }, () => {});

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

console.log('\n[Phase 8 (Experience Architecture, Part 3/6) — ONE action resolves MANY documents]');
{
  // A real LOW_CONFIDENCE group needs sessions whose FIRST reviewReasons()
  // code is actually LOW_CONFIDENCE — a PDF with no facts reports
  // MISSING_CONTENT_FACTS first (asserted directly above), so this group can
  // only ever be built from sessions that already HAVE content facts (a JSON
  // file's real parsed content) but a confidence score below the threshold.
  const fieldEditEvent = (field, value) => ({ target: { id: '', closest: (sel) => (sel.includes('dic-adv-field') ? { dataset: { field }, value } : null) } });

  const primary = newJsonSession('group-primary.json');
  const siblingA = newJsonSession('group-sibling-a.json');
  const siblingB = newJsonSession('group-sibling-b.json');
  const outsider = newPdfSession('group-outsider.pdf'); // different first reason (MISSING_CONTENT_FACTS) — must NEVER be touched
  [primary, siblingA, siblingB].forEach((id) => {
    attachInferenceResult(id, { confidence: AUTO_POPULATE_CONFIDENCE_THRESHOLD - 0.1, confidenceRationale: null });
    advanceSession(id);
  });
  markAwaitingEvidence(outsider);

  check('setup: all three group sessions are parked with LOW_CONFIDENCE as their ONLY, FIRST reason',
    [primary, siblingA, siblingB].every((id) => {
      const reasons = reviewReasons(getImportSession(id).data);
      return reasons.length === 1 && reasons[0].code === 'LOW_CONFIDENCE';
    }));
  check('setup: the outsider reports a DIFFERENT first reason (MISSING_CONTENT_FACTS) — not part of any LOW_CONFIDENCE group',
    reviewReasons(getImportSession(outsider).data)[0].code === 'MISSING_CONTENT_FACTS');

  const groupController = createDatasetImportController({});
  groupController.onClick({ dataset: { act: 'dic-feed-toggle' }, closest: () => null }, () => {});
  groupController.onClick({ dataset: { act: 'dic-queue-bucket-toggle', id: 'exc:LOW_CONFIDENCE' }, closest: () => null }, () => {});
  // The Advanced Metadata panel renders inside the Session Detail view
  // (renderSessionDetail), reached by opening the row (dic-session-row),
  // not inline in the queue row itself — dic-advanced-open only sets which
  // session's editor is active within that detail view.
  groupController.onClick({ dataset: { act: 'dic-session-row', id: primary }, closest: () => null }, () => {});
  groupController.onClick({ dataset: { act: 'dic-advanced-open', id: primary }, closest: () => null }, () => {});
  const panelHtml = groupController.render();
  check('the Advanced Metadata panel offers the group-apply checkbox, naming the REAL sibling count (2)',
    panelHtml.includes('data-act="dic-adv-apply-group"') && panelHtml.includes('2 dokumen lain'));

  // Leave the checkbox UNCHECKED and save: siblings must be left untouched —
  // proves the broadcast is opt-in, not automatic, before proving it works.
  groupController.onInput(fieldEditEvent('datasetType', 'historical'), () => {});
  groupController.onClick({ dataset: { act: 'dic-advanced-save', id: primary }, closest: () => null }, () => {});
  check('unchecked group-apply: the primary session alone was corrected',
    getImportSession(primary).data.datasetType === 'historical' && getImportSession(primary).data.metadataConfirmedBy === 'evan');
  check('unchecked group-apply: BOTH siblings are untouched — no broadcast without an explicit human opt-in',
    getImportSession(siblingA).data.datasetType === DATASET_TYPE.OFFICIAL && !getImportSession(siblingA).data.metadataConfirmedBy
    && getImportSession(siblingB).data.datasetType === DATASET_TYPE.OFFICIAL && !getImportSession(siblingB).data.metadataConfirmedBy);
  check('unchecked group-apply: siblingA still reports LOW_CONFIDENCE (nothing resolved it)',
    reviewReasons(getImportSession(siblingA).data).some((r) => r.code === 'LOW_CONFIDENCE'));

  // Now open siblingA's OWN edit (siblingA + siblingB are still a real
  // LOW_CONFIDENCE group of two — the primary already cleared out of it),
  // tick the box, and save: THIS is "one action, many documents".
  groupController.onClick({ dataset: { act: 'dic-session-row', id: siblingA }, closest: () => null }, () => {});
  groupController.onClick({ dataset: { act: 'dic-advanced-open', id: siblingA }, closest: () => null }, () => {});
  const soloPanelHtml = groupController.render();
  check('siblingA + siblingB alone still form a real group of 2 (1 other sibling)',
    soloPanelHtml.includes('data-act="dic-adv-apply-group"') && soloPanelHtml.includes('1 dokumen lain'));
  groupController.onInput(fieldEditEvent('knowledgeKind', 'document_fact'), () => {});
  groupController.onClick({ dataset: { act: 'dic-adv-apply-group' }, closest: () => null }, () => {});
  groupController.onClick({ dataset: { act: 'dic-advanced-save', id: siblingA }, closest: () => null }, () => {});

  check('ONE save (siblingA) resolved siblingB too — both now human-confirmed',
    getImportSession(siblingA).data.metadataConfirmedBy === 'evan' && getImportSession(siblingB).data.metadataConfirmedBy === 'evan');
  check('neither siblingA nor siblingB reports LOW_CONFIDENCE any more',
    !reviewReasons(getImportSession(siblingA).data).some((r) => r.code === 'LOW_CONFIDENCE')
    && !reviewReasons(getImportSession(siblingB).data).some((r) => r.code === 'LOW_CONFIDENCE'));
  check('the primary session (corrected earlier, NOT part of this second broadcast) kept ITS OWN correction, untouched by this second save',
    getImportSession(primary).data.datasetType === 'historical');
  check('the outsider (a genuinely different exception) was never touched by either broadcast',
    getImportSession(outsider).data.datasetType === DATASET_TYPE.OFFICIAL && !getImportSession(outsider).data.metadataConfirmedBy);

  // Every one of these corrections — the solo one AND the two broadcast ones
  // — must still be a REAL, individually-audited Learning correction. A
  // batch UI action is a loop over the same real single-document write, not
  // a new, unaudited bulk primitive.
  const allCorrections = listLearningEvents({}).data || [];
  const correctionFor = (id) => allCorrections.filter((e) => e.targetKey === id && e.kind === 'correction');
  check('the primary session\'s solo correction was recorded as a real, audited Learning event',
    correctionFor(primary).length === 1);
  check('BOTH broadcast targets got their OWN, individually-audited Learning correction (no shared/batched event)',
    correctionFor(siblingA).length === 1 && correctionFor(siblingB).length === 1);
  check('the broadcast corrections are traceable to the ONE human action that produced them (sourceDocumentId)',
    correctionFor(siblingA)[0].sourceDocumentId === siblingA && correctionFor(siblingB)[0].sourceDocumentId === siblingB);
}

console.log('\n[Phase 8 (Experience Architecture, Part 4) — Consensus Experience]');
{
  // A REAL confidenceRationale.signals shape, mirroring exactly what
  // import-confidence-engine.js#computeImportConfidence persists — the
  // historicalSimilarity signal is only ever available:true when
  // Pattern Discovery found a real precedent among Approved Knowledge
  // (see that engine's own header).
  const baseSignals = [
    { id: 'metadataCompleteness', label: 'Kelengkapan Metadata', weight: 0.25, subScore: 1, available: true, rationale: 'Resolusi 3 bidang klasifikasi: 1 / 1 / 1.' },
  ];
  const withHistory = [...baseSignals, { id: 'historicalSimilarity', label: 'Kemiripan Historis', weight: 0.15, subScore: 1, available: true, rationale: 'Pattern Discovery: dukungan historis 3 untuk pola yang cocok (dibatasi pada 3).' }];
  const withoutHistory = [...baseSignals, { id: 'historicalSimilarity', label: 'Kemiripan Historis', weight: null, subScore: null, available: false, rationale: 'Belum ada preseden historis yang cocok — tidak ada bukti historis (netral).' }];

  const consensusSession = newJsonSession('consensus-real.json');
  attachInferenceResult(consensusSession, { confidence: 0.95, confidenceRationale: { level: 'high', domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, knowledgeKind: 'document_fact', signals: withHistory } });
  advanceSession(consensusSession);

  const plainAutoSession = newJsonSession('consensus-plain.json');
  attachInferenceResult(plainAutoSession, { confidence: 0.95, confidenceRationale: { level: 'high', domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, knowledgeKind: 'document_fact', signals: withoutHistory } });
  advanceSession(plainAutoSession);

  const noRationaleSession = newJsonSession('consensus-none.json');
  advanceSession(noRationaleSession); // no attachInferenceResult call at all — defensive path

  check('consensusExplanation() returns a real explanation when historicalSimilarity is a genuine Approved-Knowledge match',
    typeof consensusExplanation(getImportSession(consensusSession).data) === 'string'
    && consensusExplanation(getImportSession(consensusSession).data).length > 0);
  check('consensusExplanation() is null when historicalSimilarity was NOT available — never claims consensus for an ordinary auto-fill',
    consensusExplanation(getImportSession(plainAutoSession).data) === null);
  check('consensusExplanation() is null (never throws) for a session with no confidenceRationale at all',
    consensusExplanation(getImportSession(noRationaleSession).data) === null);

  const consensusController = createDatasetImportController({});
  consensusController.onClick({ dataset: { act: 'dic-feed-toggle' }, closest: () => null }, () => {});
  const feedHtml = consensusController.render();
  const rowFor = (h, filename) => (h.split('<li class="wlk-row').find((r) => r.includes(filename)) || '');
  const consensusRowHtml = rowFor(feedHtml, 'consensus-real.json');
  const plainRowHtml = rowFor(feedHtml, 'consensus-plain.json');
  check('the ROW for a real consensus match shows a compact tag, NOT a repeated full sentence (avoids the "Ready Ready Ready" noise Part 2 already fixed)',
    consensusRowHtml.includes('otomatis (pola organisasi)') && !consensusRowHtml.includes('Metadata dokumen ini terisi otomatis'));
  check('the ROW for an ordinary auto-fill (no historical precedent) shows the plain tag only, no consensus claim',
    plainRowHtml.includes('· otomatis') && !plainRowHtml.includes('pola organisasi'));

  consensusController.onClick({ dataset: { act: 'dic-session-row', id: consensusSession }, closest: () => null }, () => {});
  const detailWithConsensus = consensusController.render();
  check('opening the DETAIL view of a real-consensus document shows the full, plain-language explanation naming approved organizational knowledge',
    detailWithConsensus.includes('Konsensus Organisasi') && detailWithConsensus.includes('disetujui sebelumnya sebagai pengetahuan organisasi'));

  consensusController.onClick({ dataset: { act: 'dic-session-row', id: consensusSession }, closest: () => null }, () => {}); // close it
  consensusController.onClick({ dataset: { act: 'dic-session-row', id: plainAutoSession }, closest: () => null }, () => {});
  const detailPlain = consensusController.render();
  check('opening the DETAIL view of an ORDINARY auto-fill shows NO Konsensus Organisasi section — nothing fabricated',
    !detailPlain.includes('Konsensus Organisasi'));
}

console.log('\n[Phase 8 (Experience Architecture, Part 5) — Progressive Question Reduction, made visible]');
{
  check('isoWeekKey: a Monday maps to itself', isoWeekKey('2026-06-01T09:00:00.000Z') === '2026-06-01'); // a real Monday
  check('isoWeekKey: a Sunday maps back to that same week\'s Monday', isoWeekKey('2026-06-07T23:00:00.000Z') === '2026-06-01');
  check('isoWeekKey: an invalid timestamp returns null (defensive, never throws)', isoWeekKey('not-a-date') === null);
  check('isoWeekKey: a missing timestamp returns null', isoWeekKey(undefined) === null);

  // Hand-built, session-SHAPED fixtures (state/createdAt/autoImported only)
  // — computeAutonomyTrend() is a pure aggregation, independently testable
  // without backdating a real repository record (createdAt is set once,
  // internally, at real creation time and cannot be overridden through the
  // public engine API).
  const fixtures = [
    // Week of 2026-06-01: 1 of 4 autonomous (25%)
    { state: IMPORT_SESSION_STATE.ARCHIVED, createdAt: '2026-06-01T08:00:00.000Z', autoImported: true },
    { state: IMPORT_SESSION_STATE.ARCHIVED, createdAt: '2026-06-02T08:00:00.000Z', autoImported: false },
    { state: IMPORT_SESSION_STATE.CANCELLED, createdAt: '2026-06-03T08:00:00.000Z', autoImported: false },
    { state: IMPORT_SESSION_STATE.FAILED, createdAt: '2026-06-04T08:00:00.000Z', autoImported: false },
    // Week of 2026-06-08: 3 of 4 autonomous (75%) — real progress
    { state: IMPORT_SESSION_STATE.ARCHIVED, createdAt: '2026-06-08T08:00:00.000Z', autoImported: true },
    { state: IMPORT_SESSION_STATE.ARCHIVED, createdAt: '2026-06-09T08:00:00.000Z', autoImported: true },
    { state: IMPORT_SESSION_STATE.ARCHIVED, createdAt: '2026-06-10T08:00:00.000Z', autoImported: true },
    { state: IMPORT_SESSION_STATE.ARCHIVED, createdAt: '2026-06-11T08:00:00.000Z', autoImported: false },
    // Still mid-pipeline — must NOT count in any week (hasn't earned its outcome yet)
    { state: IMPORT_SESSION_STATE.CLASSIFICATION, createdAt: '2026-06-09T08:00:00.000Z', autoImported: false },
  ];
  const trend = computeAutonomyTrend(fixtures);
  check('computeAutonomyTrend: exactly 2 real weeks found (the non-terminal fixture contributes to neither)',
    trend.length === 2);
  check('computeAutonomyTrend: weeks are sorted OLDEST first',
    trend[0].weekStart === '2026-06-01' && trend[1].weekStart === '2026-06-08');
  check('computeAutonomyTrend: week 1 rate is a real 25% (1 of 4)',
    trend[0].total === 4 && trend[0].autonomous === 1 && trend[0].rate === 25);
  check('computeAutonomyTrend: week 2 rate is a real 75% (3 of 4) — genuinely fewer questions',
    trend[1].total === 4 && trend[1].autonomous === 3 && trend[1].rate === 75);

  const singleWeekTrend = computeAutonomyTrend(fixtures.slice(0, 2));
  check('computeAutonomyTrend: a single week still reports its own real rate (the RENDERER, not this function, hides it until there is something to compare)',
    singleWeekTrend.length === 1 && singleWeekTrend[0].total === 2);

  // Every REAL session this whole suite has created so far shares ONE
  // real week (they were all created just now) — so the live workspace
  // render must show NO trend section at all: an honest silence, never a
  // fabricated one-point "trend".
  const liveController = createDatasetImportController({});
  const liveHtml = liveController.render();
  check('render(): with only ONE real week of history so far, the trend section stays silent (never a fabricated single-point trend)',
    !liveHtml.includes('Semakin Sedikit Pertanyaan'));
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

console.log('\n[V2, Part A2 (production feedback) — contentFactsGapMessage() names the REAL reason, never one generic sentence]');
{
  const pdfSession = { kind: IMPORT_SESSION_KIND.PDF };
  check('PDF gets the honest "no reader at all" message (never confused with a docx that just failed)', contentFactsGapMessage(pdfSession).includes('PDF') && contentFactsGapMessage(pdfSession).includes('OCR'));

  const neverProcessedDocx = { kind: IMPORT_SESSION_KIND.DOCX, extractionSuggestion: null };
  check('a docx with extractionSuggestion:null (predates the feature, not yet swept) says so specifically, not "belum ada fakta konten"', contentFactsGapMessage(neverProcessedDocx).includes('Belum pernah diproses'));

  const ranButFoundNothing = { kind: IMPORT_SESSION_KIND.DOCX, extractionSuggestion: { value: '', documentNumber: '', senderOrigin: '', parserVersion: 1 } };
  check('a docx the parser genuinely read but found no recognizable fields in says THAT, distinctly', contentFactsGapMessage(ranButFoundNothing).includes('tidak menemukan pola'));

  const partialFound = { kind: IMPORT_SESSION_KIND.DOCX, extractionSuggestion: { value: 'x', documentNumber: '', senderOrigin: '', parserVersion: 1 } };
  check('a docx with SOME fields found reports the real fraction (1/3), not a blanket "no facts" statement', contentFactsGapMessage(partialFound).includes('1/3'));

  const jsonNoContent = { kind: IMPORT_SESSION_KIND.JSON };
  check('JSON gets its own distinct message (never conflated with the docx parser messages)', contentFactsGapMessage(jsonNoContent).includes('JSON'));
}

console.log('\n[V2, Part A2 (production feedback) — isReanalyzing()/getLastSweepStatus() give the UI something real to observe]');
{
  check('isReanalyzing() is a real boolean (false when nothing is running in this fresh process)', isReanalyzing() === false);
  check('getLastSweepStatus() is honestly null before any sweep has ever run in this process', getLastSweepStatus() === null);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
