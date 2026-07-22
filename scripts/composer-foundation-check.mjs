/* composer-foundation-check.mjs — Node check for V2.0.15 "Live Editable
   Composer Foundation": the shared Diff Model (computeDiff, reused by
   V2.0.16), ComposerDocument/EditableSection/FieldOverride/
   SuggestionPlaceholder/ComposerRevision/ComposerSession contracts, and
   composer-store.js's real in-memory store (createDocument/editSection/
   getRevisionHistory/getComposerTimeline). Nothing is generated — every
   value here is human-supplied. No AI, no LLM, no production writes.

   Phase 10, Sprint 10.1 — extended (not duplicated into a second script)
   with checks for composer-document-repository.js: the cache-level
   round-trip a Review Workspace depends on, and the new
   COMPOSER_DOCUMENT_STATUS_DRAFT / listAllDocuments() this sprint added.
   The live RTDB sync path itself (initComposerDocumentSync) is NOT
   exercised here — js/firebase.js's top-level `https://` import is not
   Node-loadable (see composer-document-repository.js's own header); that
   path is verified via the smoke-boot.mjs puppeteer harness or manual
   browser testing instead, never claimed as covered by this suite.
   Run: node scripts/composer-foundation-check.mjs   (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CHANGE_TYPE, isDiff } from '../js/v2/knowledge/learning/contracts/diff-contract.js';
import { computeDiff } from '../js/v2/knowledge/learning/diff-engine.js';

import { isEditableSection } from '../src/document-intelligence/composer/contracts/editable-section-contract.js';
import { isComposerDocument, COMPOSER_DOCUMENT_STATUS_DRAFT } from '../src/document-intelligence/composer/contracts/composer-document-contract.js';
import { isComposerRevision } from '../src/document-intelligence/composer/contracts/composer-revision-contract.js';
import { isFieldOverride } from '../src/document-intelligence/composer/contracts/field-override-contract.js';
import { SUGGESTION_STATUS, makeSuggestionPlaceholder, isSuggestionPlaceholder } from '../src/document-intelligence/composer/contracts/suggestion-placeholder-contract.js';
import { startComposerSession, DOCUMENT_SESSION_STATE, canTransitionDocumentSession } from '../src/document-intelligence/composer/contracts/composer-session-contract.js';
import {
  createDocument, getDocument, editSection, addSection, getRevisionHistory, getComposerTimeline, listAllDocuments,
  attachExplainability, getExplainability, transitionStatus, getReviewHistory, resetComposerStore, COMPOSER_STORE_ERRORS,
} from '../src/document-intelligence/composer/composer-store.js';
import { getRecord, putRecord, listRecords } from '../src/document-intelligence/composer/composer-document-repository.js';
import { explainDocument, NOR_EXPLAINABILITY_ERRORS } from '../src/document-intelligence/nor/nor-explainability-service.js';
import { COMPOSER_REVIEW_STATE } from '../src/document-intelligence/composer/contracts/composer-review-contract.js';
import { computeReviewMetrics } from '../src/document-intelligence/composer/review-metrics-service.js';
import { recordSatisfactionRating, listSatisfactionRatings, resetSatisfactionLog } from '../src/document-intelligence/composer/satisfaction-log.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetComposerStore();

console.log('\n[Diff Model — shared computeDiff, reused by V2.0.16]');
const diff1 = computeDiff({ subject: 'A', total: 100 }, { subject: 'B', total: 100 });
check('computeDiff detects one MODIFIED field only', diff1.fieldsChanged === 1 && diff1.entries[0].field === 'subject' && diff1.entries[0].changeType === CHANGE_TYPE.MODIFIED);
const diff2 = computeDiff({ subject: 'A' }, { subject: 'A', note: 'new' });
check('computeDiff detects an ADDED field', diff2.entries.some((e) => e.field === 'note' && e.changeType === CHANGE_TYPE.ADDED));
const diff3 = computeDiff({ subject: 'A', note: 'old' }, { subject: 'A' });
check('computeDiff detects a REMOVED field', diff3.entries.some((e) => e.field === 'note' && e.changeType === CHANGE_TYPE.REMOVED));
const diffNone = computeDiff({ a: 1 }, { a: 1 });
check('computeDiff reports zero entries when nothing changed', diffNone.fieldsChanged === 0);
check('every computed Diff satisfies isDiff()', [diff1, diff2, diff3, diffNone].every(isDiff));

console.log('\n[Suggestion Placeholder — always EMPTY this milestone]');
const placeholder = makeSuggestionPlaceholder('subject');
check('makeSuggestionPlaceholder always produces status EMPTY', placeholder.status === SUGGESTION_STATUS.EMPTY);
check('a placeholder carries no fabricated suggestion (suggestedValue null, citedEvidence [])', placeholder.suggestedValue === null && placeholder.citedEvidence.length === 0);
check('isSuggestionPlaceholder accepts a well-formed placeholder', isSuggestionPlaceholder(placeholder));

console.log('\n[Composer Session — reuses DOCUMENT_SESSION_STATE unchanged]');
const session = startComposerSession('doc-1');
check('a new ComposerSession starts in DRAFTING (matches DocumentSession reuse)', session.state === DOCUMENT_SESSION_STATE.DRAFTING);
check('canTransitionDocumentSession(DRAFTING, REVIEWING) is legal, reused unchanged', canTransitionDocumentSession(DOCUMENT_SESSION_STATE.DRAFTING, DOCUMENT_SESSION_STATE.REVIEWING));

console.log('\n[Composer store — createDocument, real EditableSections, initial revision]');
const doc = createDocument('nor', { subject: 'Pengadaan ATK', total: 500000 });
check('createDocument produces a valid ComposerDocument', isComposerDocument(doc));
check('the document has one EditableSection per field', doc.sections.length === 2 && doc.sections.every(isEditableSection));
check('no section starts overridden', doc.sections.every((s) => s.isOverridden === false));
const initialHistory = getRevisionHistory(doc.documentId);
check('the initial revision exists, version 1, with a null diff (nothing to compare against yet)', initialHistory.length === 1
  && initialHistory[0].version === 1 && initialHistory[0].diff === null && isComposerRevision(initialHistory[0]));

console.log('\n[Composer store — editSection produces a Field Override + a new traceable Revision]');
const editResult = editSection(doc.documentId, 'subject', 'Pengadaan ATK Kantor', 'evan');
check('editSection succeeds', editResult.ok === true);
check('the returned FieldOverride is valid and records before/after', isFieldOverride(editResult.override)
  && editResult.override.originalValue === 'Pengadaan ATK' && editResult.override.overrideValue === 'Pengadaan ATK Kantor');
check('the updated document bumps version to 2 and marks the section overridden', editResult.document.version === 2
  && editResult.document.sections.find((s) => s.field === 'subject').isOverridden === true);
check('the new revision carries a real Diff with exactly 1 changed field', isComposerRevision(editResult.revision)
  && editResult.revision.diff.fieldsChanged === 1 && editResult.revision.diff.entries[0].field === 'subject');
const historyAfterEdit = getRevisionHistory(doc.documentId);
check('Composer History now has 2 append-only revisions (never overwritten)', historyAfterEdit.length === 2
  && historyAfterEdit[0].version === 1 && historyAfterEdit[1].version === 2);
check('getDocument reflects the edit', getDocument(doc.documentId).version === 2);

console.log('\n[Phase 11 Course Correction, Workstream 1 — addSection() for genuinely new fields]');
const versionBeforeAdd = getDocument(doc.documentId).version;
const addResult = addSection(doc.documentId, 'kepadaYth', 'Kepala Bidang Sarpras', 'evan');
check('addSection succeeds for a field that does not yet exist', addResult.ok === true);
check('the new section is created isOverridden:true (a human authored it directly)', addResult.document.sections.find((s) => s.field === 'kepadaYth').isOverridden === true
  && addResult.document.sections.find((s) => s.field === 'kepadaYth').value === 'Kepala Bidang Sarpras');
check('addSection bumps the document version', addResult.document.version === versionBeforeAdd + 1);
check('addSection records a real Diff with the new field as ADDED', addResult.revision.diff.entries.some((e) => e.field === 'kepadaYth' && e.changeType === CHANGE_TYPE.ADDED));
check('getDocument reflects the newly added section', getDocument(doc.documentId).sections.some((s) => s.field === 'kepadaYth'));
const addDuplicate = addSection(doc.documentId, 'kepadaYth', 'Someone Else', 'evan');
check('addSection on a field that already exists returns FIELD_ALREADY_EXISTS (use editSection instead)', addDuplicate.ok === false && addDuplicate.error.code === COMPOSER_STORE_ERRORS.FIELD_ALREADY_EXISTS);
const addUnknownDoc = addSection('never-created', 'x', 'y', 'evan');
check('addSection on an unknown documentId returns NOT_FOUND', addUnknownDoc.ok === false && addUnknownDoc.error.code === COMPOSER_STORE_ERRORS.NOT_FOUND);

console.log('\n[Composer store — error paths]');
const notFound = editSection('never-created', 'subject', 'x', 'evan');
check('editSection on an unknown documentId returns NOT_FOUND', notFound.ok === false && notFound.error.code === COMPOSER_STORE_ERRORS.NOT_FOUND);
const unknownField = editSection(doc.documentId, 'not-a-real-field', 'x', 'evan');
check('editSection on an unknown field returns UNKNOWN_FIELD', unknownField.ok === false && unknownField.error.code === COMPOSER_STORE_ERRORS.UNKNOWN_FIELD);

console.log('\n[Composer Timeline — chronological, scoped by domainType]');
createDocument('nor', { subject: 'Second Doc' });
const timeline = getComposerTimeline('nor');
check('getComposerTimeline lists both nor documents, oldest first', timeline.length === 2 && timeline[0].documentId === doc.documentId);
check('getComposerTimeline scoped to an unrelated domainType is empty', getComposerTimeline('petty_cash').length === 0);

console.log('\n[Phase 10, Sprint 10.1 — status field, defaulted to draft]');
check('a newly created ComposerDocument defaults to status draft', doc.status === COMPOSER_DOCUMENT_STATUS_DRAFT);
check('isComposerDocument requires a non-empty status string', isComposerDocument(doc) && !isComposerDocument({ ...doc, status: '' }));

console.log('\n[Phase 10, Sprint 10.1 — listAllDocuments, cross-domain, newest first]');
createDocument('memorandum', { subject: 'Cross-domain doc' });
const all = listAllDocuments();
check('listAllDocuments includes documents from every domainType', all.some((d) => d.domainType === 'nor') && all.some((d) => d.domainType === 'memorandum'));
check('listAllDocuments sorts newest-updated first', all[0].updatedAt >= all[all.length - 1].updatedAt);

console.log('\n[Phase 10, Sprint 10.1 — composer-document-repository.js cache round-trip]');
const recordBefore = getRecord(doc.documentId);
check('getRecord returns the same document+revisions composer-store.js just wrote', recordBefore
  && recordBefore.document.documentId === doc.documentId && recordBefore.revisions.length === getRevisionHistory(doc.documentId).length);
// Simulates what applyRemoteSnapshot() does on a real RTDB round-trip
// (JSON stringify/parse strips nothing extra beyond what RTDB itself
// strips — the null/empty-array stripping is exercised directly below).
const rehydrated = JSON.parse(JSON.stringify(recordBefore));
const recordCountBefore = listRecords().length;
putRecord(`${doc.documentId}:rehydrated-copy`, rehydrated.document, rehydrated.revisions);
check('a JSON round-tripped record is still a valid ComposerDocument after putRecord', isComposerDocument(getRecord(`${doc.documentId}:rehydrated-copy`).document));
check('listRecords grows by exactly one new record', listRecords().length === recordCountBefore + 1);

console.log('\n[Phase 10, Sprint 10.2 — attachExplainability/getExplainability]');
check('a freshly created document has no explainability attached yet', getExplainability(doc.documentId) === null);
const attachResult = attachExplainability(doc.documentId, {
  conversationId: 'conversation:test:1',
  unresolvedFields: ['traveler'],
  citedKnowledgeIds: ['nor.rendering_rule.does-not-exist'],
  explanation: [{ citedKnowledgeId: 'nor.rendering_rule.does-not-exist', kind: 'rendering_rule', statement: 'Test statement.' }],
  renderingRulesConsidered: [],
  reasoningConsidered: Object.freeze({
    ok: true, claim: 'Test claim', citedRuleIds: ['nor.rule.does-not-exist'], confidence: 0.8, confidenceBasis: 'test', conflicts: [],
  }),
});
check('attachExplainability succeeds for a real documentId', attachResult.ok === true);
check('attachExplainability on an unknown documentId returns NOT_FOUND', attachExplainability('never-created', {}).error.code === COMPOSER_STORE_ERRORS.NOT_FOUND);
check('getExplainability now returns the attached bundle', getExplainability(doc.documentId).conversationId === 'conversation:test:1');
editSection(doc.documentId, 'total', 600000, 'evan');
check('a subsequent editSection() (putRecord without explainability) PRESERVES the previously attached bundle', getExplainability(doc.documentId) !== null && getExplainability(doc.documentId).conversationId === 'conversation:test:1');

console.log('\n[Phase 10, Sprint 10.2 — nor-explainability-service.js#explainDocument]');
const noExplain = createDocument('nor', { subject: 'No explainability attached' });
const noExplainResult = explainDocument(noExplain.documentId);
check('explainDocument on a document with none attached returns NO_EXPLAINABILITY honestly (never fabricated)', noExplainResult.ok === false && noExplainResult.error.code === NOR_EXPLAINABILITY_ERRORS.NO_EXPLAINABILITY);
const explainResult = explainDocument(doc.documentId);
check('explainDocument succeeds once explainability is attached', explainResult.ok === true);
check('retrievedKnowledge reports an unresolvable citedKnowledgeId honestly (available:false, never fabricated content)', explainResult.data.retrievedKnowledge.length === 1 && explainResult.data.retrievedKnowledge[0].available === false);
check('appliedRules resolves citedRuleIds (falls back to the raw id when unresolvable)', explainResult.data.appliedRules.length === 1 && explainResult.data.appliedRules[0].id === 'nor.rule.does-not-exist');
check('confidence/confidenceBasis/reasoningClaim pass through from reasoningConsidered', explainResult.data.confidence === 0.8 && explainResult.data.confidenceBasis === 'test' && explainResult.data.reasoningClaim === 'Test claim');
check('unknownFacts passes through unresolvedFields verbatim', explainResult.data.unknownFacts.length === 1 && explainResult.data.unknownFacts[0] === 'traveler');
check('conversationId passes through as a bare id string (ui/ resolves it, this service never touches conversation/)', explainResult.data.conversationId === 'conversation:test:1');

console.log('\n[Phase 10, Sprint 10.4 — transitionStatus / review workflow]');
const reviewDoc = createDocument('nor', { subject: 'Pengadaan Proyektor Ruang Rapat' });
check('a new document starts in DRAFT', reviewDoc.status === COMPOSER_REVIEW_STATE.DRAFT);
const illegalJump = transitionStatus(reviewDoc.documentId, COMPOSER_REVIEW_STATE.APPROVED, { actorId: 'evan', rationale: 'skip ahead' });
check('an illegal jump (draft -> approved, skipping in_review) is refused', illegalJump.ok === false && illegalJump.error.code === COMPOSER_STORE_ERRORS.ILLEGAL_TRANSITION);
const toReview = transitionStatus(reviewDoc.documentId, COMPOSER_REVIEW_STATE.IN_REVIEW, { actorId: 'evan' });
check('draft -> in_review succeeds with no rationale required', toReview.ok === true && toReview.document.status === COMPOSER_REVIEW_STATE.IN_REVIEW);
const approveNoRationale = transitionStatus(reviewDoc.documentId, COMPOSER_REVIEW_STATE.APPROVED, { actorId: 'evan' });
check('in_review -> approved WITHOUT a rationale is refused ("No automatic approval", enforced by the store itself, not just the UI)', approveNoRationale.ok === false && approveNoRationale.error.code === COMPOSER_STORE_ERRORS.RATIONALE_REQUIRED);
check('a refused transition leaves the document status unchanged', getDocument(reviewDoc.documentId).status === COMPOSER_REVIEW_STATE.IN_REVIEW);
const versionBeforeApproval = getDocument(reviewDoc.documentId).version;
const approveWithRationale = transitionStatus(reviewDoc.documentId, COMPOSER_REVIEW_STATE.APPROVED, { actorId: 'evan', rationale: 'Sesuai kebutuhan operasional, disetujui.' });
check('in_review -> approved WITH a real rationale succeeds', approveWithRationale.ok === true && approveWithRationale.document.status === COMPOSER_REVIEW_STATE.APPROVED);
check('a status-only transition does NOT bump the document version (a separate axis from content edits)', getDocument(reviewDoc.documentId).version === versionBeforeApproval);
check('a status-only transition does NOT create a new ComposerRevision', getRevisionHistory(reviewDoc.documentId).length === 1);
const reviewHistory = getReviewHistory(reviewDoc.documentId);
check('getReviewHistory records both real transitions, oldest first', reviewHistory.length === 2
  && reviewHistory[0].toState === COMPOSER_REVIEW_STATE.IN_REVIEW && reviewHistory[1].toState === COMPOSER_REVIEW_STATE.APPROVED
  && reviewHistory[1].preferenceRationale === 'Sesuai kebutuhan operasional, disetujui.');
const publishAttempt = transitionStatus(reviewDoc.documentId, COMPOSER_REVIEW_STATE.PUBLISHED, { actorId: 'evan' });
check('approved -> published is a legal transition in the contract (no UI button yet — that\'s Sprint 10.6)', publishAttempt.ok === true);
const rejectedIsTerminal = transitionStatus(reviewDoc.documentId, COMPOSER_REVIEW_STATE.IN_REVIEW, { actorId: 'evan' });
check('published is terminal — no further transition is legal', rejectedIsTerminal.ok === false && rejectedIsTerminal.error.code === COMPOSER_STORE_ERRORS.ILLEGAL_TRANSITION);
const unknownDocTransition = transitionStatus('never-created', COMPOSER_REVIEW_STATE.IN_REVIEW, { actorId: 'evan' });
check('transitionStatus on an unknown documentId returns NOT_FOUND', unknownDocTransition.ok === false && unknownDocTransition.error.code === COMPOSER_STORE_ERRORS.NOT_FOUND);

console.log('\n[Phase 10, Sprint 10.7 — satisfaction-log.js]');
resetSatisfactionLog();
const ratingResult = recordSatisfactionRating({ documentId: reviewDoc.documentId, rating: 4, actorId: 'evan' });
check('recordSatisfactionRating succeeds for a valid rating', ratingResult.ok === true && ratingResult.data.rating === 4);
const invalidRating = recordSatisfactionRating({ documentId: reviewDoc.documentId, rating: 9, actorId: 'evan' });
check('recordSatisfactionRating refuses an out-of-range rating (never silently clamps)', invalidRating.ok === false);
check('listSatisfactionRatings scoped to one document returns only that document\'s rating', listSatisfactionRatings(reviewDoc.documentId).length === 1);
check('listSatisfactionRatings with no id returns every rating', listSatisfactionRatings().length === 1);

console.log('\n[Phase 10, Sprint 10.7 — review-metrics-service.js#computeReviewMetrics]');
const metricsBefore = computeReviewMetrics();
check('computeReviewMetrics succeeds', metricsBefore.ok === true);
check('totalDocuments matches listAllDocuments() count', metricsBefore.data.totalDocuments === listAllDocuments().length);
check('statusDistribution accounts for every document (counts sum to totalDocuments)', Object.values(metricsBefore.data.statusDistribution).reduce((a, b) => a + b, 0) === metricsBefore.data.totalDocuments);
check('approvalRate is a real fraction between 0 and 1 once documents are decided', metricsBefore.data.approvalRate === null || (metricsBefore.data.approvalRate >= 0 && metricsBefore.data.approvalRate <= 1));
check('avgManualEditsPerDocument reflects the real edits made earlier in this run (> 0 — this run genuinely called editSection)', metricsBefore.data.avgManualEditsPerDocument > 0);
check('topCorrectedFields includes "subject" (the real field editSection() touched earlier in this run)', metricsBefore.data.topCorrectedFields.some((f) => f.field === 'subject'));
check('avgSatisfactionRating reflects the real rating recorded above (4)', metricsBefore.data.avgSatisfactionRating === 4);
check('satisfactionRatingCount matches the real count', metricsBefore.data.satisfactionRatingCount === 1);
// reviewDoc was driven draft -> in_review -> approved -> published earlier
// in this run (Sprint 10.4 section) — a real, measurable review duration.
check('avgReviewDurationMs is a real, non-negative number (a document in this run was genuinely driven through in_review -> approved)', metricsBefore.data.avgReviewDurationMs !== null && metricsBefore.data.avgReviewDurationMs >= 0);
resetSatisfactionLog();

console.log('\n[Dormancy — Composer is document-intelligence-only, never imported by knowledge/]');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(repoRoot, 'js', 'v2', 'knowledge');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}
function importSpecifiers(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const specifiers = [];
  const re = /(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specifiers.push(m[1]);
  return specifiers;
}
const violations = [];
for (const file of walk(knowledgeRoot)) {
  for (const spec of importSpecifiers(file)) {
    if (spec.includes('document-intelligence')) violations.push(file);
  }
}
check('no file under js/v2/knowledge/ imports document-intelligence/ (one-way dependency preserved)', violations.length === 0);

resetComposerStore();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
