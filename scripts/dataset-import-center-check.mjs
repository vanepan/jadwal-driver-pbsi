/* dataset-import-center-check.mjs — Node check for Phase 1 "Operational
   Engine Hardening": js/v2/ui/dataset-import-center.js's exported
   reviewReasons()/archiveDuplicateWarning() (promoted from a closure to
   module scope so other workspaces can reuse the real exception logic
   instead of re-deriving a narrower one) and the Advanced-Metadata-
   button-suppression behavior it now drives — a clean, non-exceptional
   session must not render a button the engine had no reason to need.

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
import { IMPORT_SESSION_KIND, IMPORT_SESSION_STATE } from '../js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  createImportSession, attachParsedContent, attachInferenceResult,
  submitImportSessionForReview, approveImportSession,
} from '../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import { AUTO_POPULATE_CONFIDENCE_THRESHOLD } from '../js/v2/knowledge/datasets/import-session/metadata-inference-engine.js';
import { createDatasetImportController, reviewReasons, archiveDuplicateWarning } from '../js/v2/ui/dataset-import-center.js';

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

console.log('\n[reviewReasons — a clean session has no reasons]');
const cleanSession = {
  state: IMPORT_SESSION_STATE.PENDING_REVIEW, confidence: 0.95, confidenceRationale: null,
  validationWarnings: [], validationErrors: [], documentHash: null, domainType: 'nor',
  kind: IMPORT_SESSION_KIND.JSON, manualEntryFacts: null, parsedContent: { a: 1 },
};
check('a high-confidence session with no warnings/errors has zero reasons', reviewReasons(cleanSession).length === 0);

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
const pendingNoFacts = { ...approvedNoFacts, state: IMPORT_SESSION_STATE.PENDING_REVIEW };
check('MISSING_CONTENT_FACTS only fires at Approved, not earlier states (that gate does not exist yet)', pendingNoFacts.state !== IMPORT_SESSION_STATE.APPROVED && reviewReasons(pendingNoFacts).every((r) => r.code !== 'MISSING_CONTENT_FACTS'));

console.log('\n[archiveDuplicateWarning — no documentHash short-circuits to null]');
check('a session with no documentHash never produces a warning (nothing to compare)', archiveDuplicateWarning({ documentHash: null, domainType: 'nor' }) === null);

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

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
