/* evidence-first-ingestion-check.mjs — Node check for the V2, Part B1
   (Evidence-First Ingestion) architecture correction: dataset-import-
   center.js#processOneFile no longer parks a document at Awaiting Evidence
   the instant this ONE document's own text fails to answer senderOrigin —
   it first asks whether the organization's own archived history already
   knows the answer (content-fact-consensus-engine.js), and only asks a
   human once that evidence is genuinely exhausted or inconclusive.

   processOneFile() itself takes a browser `File` and, once it has a real
   sha256, dynamically imports file-storage-engine.js — which transitively
   imports js/firebase.js's real `https://` CDN import, unsupported by
   Node's module loader (see project memory: "Firebase-coupled testing
   limits" — no *-store/*-service.js is Node-testable without a browser).
   So, following the SAME established, honest pattern this codebase already
   uses for exactly this constraint (see import-batch-concurrency-check.mjs's
   own "faithful replica of processOneFile's real engine calls"), this file
   drives the REAL production engines — computeFieldConsensus,
   archiveImportedKnowledge/listArchive, createImportSession,
   attachConsensusSuggestion/attachExtractionSuggestion/attachManualEntryFacts/
   attachFactsProvenance, advanceSession — in the EXACT sequence
   processOneFile's own evidence-resolution block now uses, proving the
   real decision logic end to end without needing a live browser upload.
   The message/render layer (contentFactsGapMessage, the Advanced Metadata
   panel's per-field hints, the renamed button/labels) IS exercised through
   the real, unmodified controller — no replica needed there.
   Run: node scripts/evidence-first-ingestion-check.mjs   (exit 0 = pass) */

import { setActiveRepository } from '../src/knowledge/repository/knowledge-repository.js';
import { resetConnectorRegistry } from '../src/knowledge/registry/connector-registry.js';
import { resetDatasetRegistry } from '../src/knowledge/datasets/registry/dataset-registry.js';
import { resetImportReportLog } from '../src/knowledge/acquisition/acquisition-engine.js';
import { resetManualImportQueue } from '../src/knowledge/acquisition/manual-import-queue-store.js';
import { resetImportSessionRepository } from '../src/knowledge/datasets/import-session/repository/import-session-repository.js';
import { resetImportBatchRepository } from '../src/knowledge/datasets/import-session/repository/import-batch-repository.js';
import { resetArchiveRepository } from '../src/organizational-memory/repository/archive-repository.js';
import { resetLearningRepository } from '../src/learning/repository/learning-repository.js';
import { DATASET_TYPE } from '../src/knowledge/datasets/contracts/dataset-contract.js';
import { IMPORT_SESSION_KIND, IMPORT_SESSION_STATE } from '../src/knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  createImportSession, attachExtractionSuggestion, attachConsensusSuggestion,
  attachManualEntryFacts, attachFactsProvenance, attachInferenceResult, getImportSession,
} from '../src/knowledge/datasets/import-session/import-session-engine.js';
import { isContentFactsComplete } from '../src/knowledge/datasets/import-session/content-fact-extraction-engine.js';
import { computeFieldConsensus } from '../src/knowledge/datasets/import-session/content-fact-consensus-engine.js';
import { AUTO_POPULATE_CONFIDENCE_THRESHOLD } from '../src/knowledge/datasets/import-session/metadata-inference-engine.js';
import { advanceSession } from '../src/knowledge/datasets/import-session/pipeline-scheduler.js';
import { archiveImportedKnowledge, listArchive as archiveList } from '../src/organizational-memory/services/archive-service.js';
import { computeDocumentHash } from '../src/organizational-memory/index.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import {
  createDatasetImportController, contentFactsGapMessage,
} from '../src/ui/dataset-import-center.js';
import { setPresentationMode } from '../src/ui/shared/workspace-list-kit.js';

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
// createDatasetImportController (imported below) self-registers the REAL
// doArchive() at module load (same as the real app) — never stubbed here,
// so a session that autonomously resolves can be proven to reach the REAL
// terminal ARCHIVED state, not merely "further than Uploaded".

let _archiveSeq = 0;
/** A minimal, REAL ArchiveRecord — same call this project's own doArchive()
 *  uses, seeding organizational memory a prior import genuinely produced. */
function seedArchivedDocument(domainType, senderOrigin) {
  _archiveSeq += 1;
  const sourceId = `seed-session-${_archiveSeq}`;
  const result = archiveImportedKnowledge({
    id: generateKnowledgeId({ domainType, sourceType: 'manual-file', sourceRef: `archive:${sourceId}` }),
    sourceDomainType: domainType,
    sourceId,
    sourceType: 'manual-file',
    documentNumber: `${_archiveSeq}/Nota Organisasi/Sarpras/I/2026`,
    senderOrigin,
    documentHash: computeDocumentHash({ filename: `seed-${_archiveSeq}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 100 + _archiveSeq }),
    sourceSnapshot: { senderOrigin },
    hasOriginalFile: false,
    fileRef: null,
    importSessionId: sourceId,
    knowledgeItemId: null,
    datasetId: null,
    archivedBy: 'evan',
  });
  if (!result.ok) throw new Error(`seedArchivedDocument failed: ${result.error && result.error.message}`);
  return result.data;
}

/** A faithful replica of dataset-import-center.js#processOneFile's real
 *  evidence-resolution block (see this file's own header for exactly why a
 *  browser `File` can't be driven under Node) — same functions, same order,
 *  same merge arithmetic as the real code: content-fact-consensus-engine.js
 *  is only ever consulted when extraction left senderOrigin unresolved, and
 *  only ever WRITTEN when the pure engine itself reports `eligible`. */
function resolveSenderOriginLikeProcessOneFile(domainType, contentFacts) {
  if (contentFacts && contentFacts.confidencePerField.senderOrigin) return { contentFacts, consensusResult: null };
  const priorArchived = archiveList({ sourceDomainType: domainType });
  const priorSenderOrigins = priorArchived.ok ? priorArchived.data.map((r) => r.senderOrigin) : [];
  const consensusResult = computeFieldConsensus(priorSenderOrigins);
  if (!consensusResult.eligible) return { contentFacts, consensusResult };
  const base = contentFacts || {
    value: '', senderOrigin: '', documentNumber: '',
    confidencePerField: { value: 0, senderOrigin: 0, documentNumber: 0 },
    basisPerField: { value: '', senderOrigin: '', documentNumber: '' },
    overallConfidence: 0, parserVersion: null,
  };
  const foundCount = [base.value, base.documentNumber].filter(Boolean).length + 1;
  return {
    consensusResult,
    contentFacts: {
      ...base,
      senderOrigin: consensusResult.value,
      confidencePerField: { ...base.confidencePerField, senderOrigin: consensusResult.confidence },
      basisPerField: { ...base.basisPerField, senderOrigin: consensusResult.rationale },
      overallConfidence: Math.round((foundCount / 3) * 100) / 100,
    },
  };
}

/** Drives a session through the exact real write sequence processOneFile()
 *  uses once contentFacts/consensusResult are decided, ending with the
 *  exact same advanceSession() hand-off. Real engine calls throughout —
 *  nothing about the WRITE PATH is simulated, only the browser File→bytes
 *  step that precedes it. */
function runSessionLikeProcessOneFile({
  domainType, filename, kind, extractedContentFacts, consensusResult, finalContentFacts,
}) {
  const created = createImportSession({
    domainType, datasetType: DATASET_TYPE.OFFICIAL, filename,
    mimeType: kind === IMPORT_SESSION_KIND.PDF ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 500, kind, knowledgeKind: 'document_fact', uploadedBy: 'evan', batchId: null,
  });
  const sessionId = created.data.id;
  attachInferenceResult(sessionId, { confidence: 1, confidenceRationale: { level: 'high', signals: [] } });
  if (consensusResult) attachConsensusSuggestion(sessionId, { senderOrigin: consensusResult, computedAt: new Date().toISOString() });
  if (finalContentFacts) {
    attachExtractionSuggestion(sessionId, {
      value: finalContentFacts.value, documentNumber: finalContentFacts.documentNumber, senderOrigin: finalContentFacts.senderOrigin,
      confidencePerField: finalContentFacts.confidencePerField, basisPerField: finalContentFacts.basisPerField,
      parserVersion: finalContentFacts.parserVersion, extractedAt: new Date().toISOString(),
    });
    if (isContentFactsComplete(finalContentFacts.confidencePerField) && finalContentFacts.overallConfidence >= AUTO_POPULATE_CONFIDENCE_THRESHOLD) {
      attachManualEntryFacts(sessionId, { value: finalContentFacts.value, documentNumber: finalContentFacts.documentNumber, senderOrigin: finalContentFacts.senderOrigin, notes: '' });
      attachFactsProvenance(sessionId, {
        source: (consensusResult && consensusResult.eligible) ? 'evidence-resolution' : 'auto-extraction',
        contentParserVersion: finalContentFacts.parserVersion, metadataParserVersion: 1,
        confidencePerField: finalContentFacts.confidencePerField, recordedAt: new Date().toISOString(),
      });
    }
  }
  advanceSession(sessionId);
  return sessionId;
}

console.log('\n[computeFieldConsensus is fed REAL archived senderOrigin values, not a mock]');
{
  for (let i = 0; i < 3; i += 1) seedArchivedDocument('nor', 'Kabid Sarana dan Prasarana');
  const listed = archiveList({ sourceDomainType: 'nor' });
  check('3 real ArchiveRecords now exist for domain "nor"', listed.ok && listed.data.length === 3);
  const consensus = computeFieldConsensus(listed.data.map((r) => r.senderOrigin));
  check('consensus is eligible from real archived evidence alone', consensus.eligible === true);
  check('resolves to the real, unanimous archived value', consensus.value === 'Kabid Sarana dan Prasarana');
}

console.log('\n[THE CORE CLAIM — a document whose OWN text never answers senderOrigin still completes autonomously, from organizational memory alone]');
{
  // Extraction found documentNumber and value from the document's own
  // text (a real, ordinary partial-extraction outcome), but NOT
  // senderOrigin — the exact "2 of 3 fields found" gap that used to force
  // Awaiting Evidence unconditionally.
  const extracted = {
    value: 'Realisasi Petty Cash Pertanggal 1 Januari 2026 Bidang Sarana dan Prasarana',
    documentNumber: '400/Nota Organisasi/Sarpras/I/2026',
    senderOrigin: '',
    confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 0 },
    basisPerField: { value: 'x', documentNumber: 'x', senderOrigin: '' },
    overallConfidence: 0.67,
    parserVersion: 1,
  };
  const { contentFacts, consensusResult } = resolveSenderOriginLikeProcessOneFile('nor', extracted);
  check('the consensus step resolved senderOrigin from archived history alone', contentFacts.senderOrigin === 'Kabid Sarana dan Prasarana');
  check('the resolved field carries a real, non-fabricated confidence (the real agreement fraction)', contentFacts.confidencePerField.senderOrigin > 0 && contentFacts.confidencePerField.senderOrigin <= 1);
  check('isContentFactsComplete now reports true — every field has SOME resolution', isContentFactsComplete(contentFacts.confidencePerField));

  const sessionId = runSessionLikeProcessOneFile({
    domainType: 'nor', filename: 'auto-resolved.docx', kind: IMPORT_SESSION_KIND.DOCX,
    extractedContentFacts: extracted, consensusResult, finalContentFacts: contentFacts,
  });
  const after = getImportSession(sessionId).data;
  check('THE CORE CLAIM: the session reached the REAL terminal ARCHIVED state with ZERO human clicks (Upload -> coffee -> Knowledge)', after.state === IMPORT_SESSION_STATE.ARCHIVED);
  check('the scheduler\'s own honest autonomy flag agrees — this was genuinely unattended', after.autoImported === true);
  check('manualEntryFacts.senderOrigin was written from consensus, never left blank', after.manualEntryFacts && after.manualEntryFacts.senderOrigin === 'Kabid Sarana dan Prasarana');
  check('provenance honestly says "evidence-resolution", never claims "human" for a fact nobody typed', after.factsProvenance.source === 'evidence-resolution');
  check('the consensus attempt itself was recorded for full traceability (Source: Consensus, per-field, as the brief requires)', after.consensusSuggestion && after.consensusSuggestion.senderOrigin.eligible === true);
}

console.log('\n[A GENUINE DISAGREEMENT (e.g. a real leadership transition) correctly REFUSES to guess]');
{
  resetArchiveRepository();
  seedArchivedDocument('nor', 'Kabid Sarana dan Prasarana');
  seedArchivedDocument('nor', 'Kabid Sarana dan Prasarana');
  seedArchivedDocument('nor', 'Kabid Sarana dan Prasarana');
  seedArchivedDocument('nor', 'Plt. Kabid Sarana dan Prasarana');
  seedArchivedDocument('nor', 'Plt. Kabid Sarana dan Prasarana');
  seedArchivedDocument('nor', 'Plt. Kabid Sarana dan Prasarana');

  const extracted = {
    value: 'x', documentNumber: 'y', senderOrigin: '',
    confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 0 },
    basisPerField: { value: 'x', documentNumber: 'y', senderOrigin: '' },
    overallConfidence: 0.67, parserVersion: 1,
  };
  const { contentFacts, consensusResult } = resolveSenderOriginLikeProcessOneFile('nor', extracted);
  check('a real 50/50 split correctly stays ineligible — never a coin-flip guess', consensusResult.eligible === false);
  check('senderOrigin stays genuinely unresolved (contentFacts unchanged by an ineligible attempt)', contentFacts.senderOrigin === '');
  check('isContentFactsComplete correctly still reports false', isContentFactsComplete(contentFacts.confidencePerField) === false);

  const sessionId = runSessionLikeProcessOneFile({
    domainType: 'nor', filename: 'genuinely-ambiguous.docx', kind: IMPORT_SESSION_KIND.DOCX,
    extractedContentFacts: extracted, consensusResult, finalContentFacts: contentFacts,
  });
  const after = getImportSession(sessionId).data;
  check('the session honestly parks — no manualEntryFacts were fabricated', !after.manualEntryFacts);
  check('the inconclusive consensus attempt is STILL recorded (never silent) — this is what makes the gap message honest', after.consensusSuggestion && after.consensusSuggestion.senderOrigin.eligible === false);

  const gapMessage = contentFactsGapMessage(after);
  check('the human-facing message explains that similar documents were compared and genuinely disagreed — never "missing metadata"', gapMessage.includes('dokumen sejenis') && (gapMessage.includes('beragam') || gapMessage.includes('kecocokan')));
}

console.log('\n[insufficient history (fewer than MIN_CONSENSUS_SUPPORT) never pretends to be consensus]');
{
  resetArchiveRepository();
  seedArchivedDocument('nor', 'Kabid Sarana dan Prasarana');
  const extracted = {
    value: 'x', documentNumber: 'y', senderOrigin: '',
    confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 0 },
    basisPerField: { value: 'x', documentNumber: 'y', senderOrigin: '' },
    overallConfidence: 0.67, parserVersion: 1,
  };
  const { consensusResult } = resolveSenderOriginLikeProcessOneFile('nor', extracted);
  check('one prior document, even if unanimous with itself, is never treated as consensus', consensusResult.eligible === false);
  check('the rationale honestly says there is not enough history yet', consensusResult.rationale.includes('Baru') || consensusResult.rationale.includes('belum cukup'));
}

console.log('\n[the Advanced Metadata panel surfaces the REAL per-field provenance, never a blanket "not found"]');
{
  resetArchiveRepository();
  seedArchivedDocument('nor', 'A');
  seedArchivedDocument('nor', 'A');
  seedArchivedDocument('nor', 'B'); // 2/3 = 0.67 agreement — real disagreement, genuinely ineligible

  const created = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: 'panel-test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 200, kind: IMPORT_SESSION_KIND.DOCX, knowledgeKind: 'document_fact', uploadedBy: 'evan',
  });
  const sessionId = created.data.id;
  attachInferenceResult(sessionId, { confidence: 1, confidenceRationale: { level: 'high', signals: [] } });
  attachExtractionSuggestion(sessionId, {
    value: 'x', documentNumber: 'y', senderOrigin: '',
    confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 0 },
    basisPerField: { value: 'x', documentNumber: 'y', senderOrigin: '' },
    parserVersion: 1, extractedAt: new Date().toISOString(),
  });
  const listed = archiveList({ sourceDomainType: 'nor' });
  const consensus = computeFieldConsensus(listed.data.map((r) => r.senderOrigin));
  attachConsensusSuggestion(sessionId, { senderOrigin: consensus, computedAt: new Date().toISOString() });
  advanceSession(sessionId);

  const controller = createDatasetImportController({});
  controller.onClick({ dataset: { act: 'dic-session-row', id: sessionId }, closest: () => null }, () => {});
  controller.onClick({ dataset: { act: 'dic-advanced-open', id: sessionId }, closest: () => null }, () => {});
  const html = controller.render();
  check('the panel is titled around the human TASK, never the internal term "Advanced Metadata"', html.includes('Tinjau Dokumen Ini') && !html.includes('Advanced Metadata'));
  check('the senderOrigin field shows the REAL consensus rationale (what was compared, and why it was inconclusive), not a bare "belum ditemukan"', html.includes(consensus.rationale));
  check('the button offered to the human names the real task, never "Lengkapi Metadata & Fakta"', html.includes('Tinjau Dokumen Ini') && !html.includes('Lengkapi Metadata'));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
