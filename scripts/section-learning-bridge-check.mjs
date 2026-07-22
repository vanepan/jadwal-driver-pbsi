/* section-learning-bridge-check.mjs — Node check for Phase 11 Course
   Correction, Workstream 3: section-learning-bridge.js#recordSectionEdit,
   the ONE place a human's inline edit to a Live Document Workspace
   section becomes structured learning automatically.

   Covers the two signals documented in that file's own header (always
   record an audit Correction; only ALSO propose a pattern Correction for
   a genuine text edit, never a deletion, of a pattern-sourced section) —
   and specifically regression-guards the payload-shape bug found and
   fixed while writing this check: an early version diffed/corrected
   under the ComposerDocument's OWN field id (`pattern:<knowledgeId>`)
   instead of the cited KnowledgeItem's real payload key (`template`),
   which would have silently discarded a pattern's `slots`/`granularity`
   payload the moment any such Correction was ever approved. Also proves
   submitCorrection's own safety property holds through this bridge: an
   Approved pattern is NEVER mutated in place, only a linked Candidate is
   minted for the ordinary review queue.
   Run: node scripts/section-learning-bridge-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate, getById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../js/v2/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';
import { listKnowledge } from '../js/v2/knowledge/services/knowledge-service.js';
import { resetLearningRepository } from '../js/v2/learning/repository/learning-repository.js';
import { listLearningEvents, LEARNING_KIND, CORRECTION_TYPE } from '../js/v2/learning/services/learning-service.js';
import { recordSectionEdit } from '../src/document-intelligence/composer/section-learning-bridge.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetLearningRepository();

function now() { return new Date().toISOString(); }

function makePatternItem(sourceRef, payload, { approved } = { approved: true }) {
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'slbtest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'slbtest', kind: 'sentence_pattern',
    payload, confidence: 0.8, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'slbtest', sourceRef, capturedAt: now() }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now(), updatedAt: now(),
  });
  repoCreate(item);
  if (approved) {
    promoteToCandidate(item.id);
    submitForReview(item.id);
    approve(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Seed data for section-learning-bridge check.' });
  }
  return item.id;
}

console.log('\n[Signal 1 — always records the audit Correction]');
{
  const before = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const result = recordSectionEdit({
    documentId: 'doc:slb-1', domainType: 'nor', field: 'quantity', before: '20', after: '24', actorId: 'evan',
  });
  check('recordSectionEdit succeeds for a plain (non-pattern) field edit', result.ok === true);
  check('editKind is "edit" (both before/after non-empty)', result.editKind === 'edit');
  check('correctionRecorded is true', result.correctionRecorded === true);
  check('patternCorrectionSubmitted is false (no pattern is cited by a plain fact field)', result.patternCorrectionSubmitted === false);
  const after = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  check('exactly one new Correction event was recorded', after === before + 1);
  const events = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data;
  const ev = events.find((e) => e.targetKey === 'doc:slb-1:quantity');
  check('the recorded event carries the real before/after fact and a null affectedKnowledgeId', !!ev
    && ev.after.quantity === '24' && ev.before.quantity === '20' && ev.affectedKnowledgeId === null
    && ev.correctionType === CORRECTION_TYPE.KNOWLEDGE);
}

console.log('\n[Sprint 11.3 — a pattern/template edit is tagged CORRECTION_TYPE.PATTERN, never the generic KNOWLEDGE catch-all]');
{
  const patternId = makePatternItem('type-tag-1', { template: 'Kalimat contoh.', granularity: 'sentence' }, { approved: false });
  promoteToCandidate(patternId);
  const field = `pattern:${patternId}`;
  recordSectionEdit({
    documentId: 'doc:slb-6', domainType: 'nor', field, before: 'Kalimat contoh.', after: 'Kalimat contoh direvisi.', actorId: 'evan',
  });
  const ev = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.find((e) => e.targetKey === `doc:slb-6:${field}`);
  check('a template/pattern-sourced edit is tagged CORRECTION_TYPE.PATTERN (highest-weight learning signal), not KNOWLEDGE', !!ev && ev.correctionType === CORRECTION_TYPE.PATTERN);
}

console.log('\n[Signal 2 — deletion of a pattern-sourced section is audit-only, never a pattern Correction]');
{
  const patternId = makePatternItem('del-1', { template: 'Kalimat penutup baku.', granularity: 'sentence' });
  const versionBeforeDelete = getById(patternId).data.version; // already > 1: promoteToCandidate/submitForReview/approve each bump it
  const field = `pattern:${patternId}`;
  const before = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const result = recordSectionEdit({
    documentId: 'doc:slb-2', domainType: 'nor', field, before: 'Kalimat penutup baku.', after: '', actorId: 'evan',
  });
  check('a cleared value is detected as editKind "delete"', result.editKind === 'delete');
  check('correctionRecorded is true (the audit entry still fires)', result.correctionRecorded === true);
  check('patternCorrectionSubmitted is false — a deletion never proposes a pattern Correction', result.patternCorrectionSubmitted === false);
  const after = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  check('exactly one Correction event recorded (audit only)', after === before + 1);
  check('the cited pattern item itself is completely untouched (no new version, same template)', getById(patternId).data.payload.template === 'Kalimat penutup baku.'
    && getById(patternId).data.version === versionBeforeDelete);
}

console.log('\n[Signal 2 — a genuine text edit to an APPROVED pattern-sourced section mints a linked Candidate, never mutates the Approved item]');
{
  const patternId = makePatternItem('edit-approved-1', { template: 'Bersama ini kami sampaikan permohonan pengadaan {{quantity}} {{item}}.', granularity: 'sentence', slots: ['quantity', 'item'] });
  const field = `pattern:${patternId}`;
  const resolvedBefore = 'Bersama ini kami sampaikan permohonan pengadaan 20 kursi.';
  const resolvedAfter = 'Bersama ini kami sampaikan permohonan pengadaan 24 kursi.';
  const versionBeforeEdit = getById(patternId).data.version; // already > 1: promoteToCandidate/submitForReview/approve each bump it
  const itemsBefore = listKnowledge({ domainType: 'nor' }).data.length;

  const result = recordSectionEdit({
    documentId: 'doc:slb-3', domainType: 'nor', field, before: resolvedBefore, after: resolvedAfter, actorId: 'evan',
  });
  check('recordSectionEdit succeeds', result.ok === true && result.editKind === 'edit');
  check('correctionRecorded (signal 1) is true', result.correctionRecorded === true);
  check('patternCorrectionSubmitted (signal 2) is true for a genuine edit', result.patternCorrectionSubmitted === true);

  check('the Approved pattern item itself is NEVER mutated in place (submitCorrection safety property)', getById(patternId).data.version === versionBeforeEdit
    && getById(patternId).data.payload.template === 'Bersama ini kami sampaikan permohonan pengadaan {{quantity}} {{item}}.'
    && getById(patternId).data.lifecycleState === LIFECYCLE_STATE.APPROVED);

  const itemsAfter = listKnowledge({ domainType: 'nor' }).data;
  check('a brand-new item was minted (Candidate generation, not an in-place edit)', itemsAfter.length > itemsBefore);
  const candidate = itemsAfter.find((i) => i.lifecycleState === LIFECYCLE_STATE.CANDIDATE && i.payload && i.payload.template === resolvedAfter);
  check('the new Candidate carries the reviewer\'s edited text as its template', !!candidate);
  check('REGRESSION GUARD: the new Candidate preserves the pattern\'s OTHER payload keys (slots/granularity) — never collapsed to a bare {field: text} shape', !!candidate
    && candidate.payload.granularity === 'sentence' && Array.isArray(candidate.payload.slots) && candidate.payload.slots.includes('quantity') && candidate.payload.slots.includes('item'));
  check('REGRESSION GUARD: the Candidate is a well-formed PatternEntry (has .template, matches isPatternEntry\'s own contract)', !!candidate && typeof candidate.payload?.template === 'string');
}

console.log('\n[Signal 2 — a genuine text edit to a still-mutable (Candidate) pattern updates it in place]');
{
  const patternId = makePatternItem('edit-mutable-1', { template: 'Draf kalimat lama.', granularity: 'sentence' }, { approved: false });
  promoteToCandidate(patternId); // Candidate, still mutable — no submitForReview/approve
  const versionBeforeEdit = getById(patternId).data.version;
  const field = `pattern:${patternId}`;

  const result = recordSectionEdit({
    documentId: 'doc:slb-4', domainType: 'nor', field, before: 'Draf kalimat lama.', after: 'Draf kalimat baru.', actorId: 'evan',
  });
  check('recordSectionEdit succeeds against a mutable Candidate', result.ok === true && result.patternCorrectionSubmitted === true);
  const updated = getById(patternId).data;
  check('the Candidate is updated IN PLACE (mutable-state fast path, no new item)', updated.payload.template === 'Draf kalimat baru.' && updated.version === versionBeforeEdit + 1);
  check('lifecycleState stays Candidate (a content edit never moves the lifecycle)', updated.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
}

console.log('\n[Signal 2 — a pattern citation that no longer resolves is not a hard error]');
{
  const field = 'pattern:knowledge:nor:does-not-exist:1';
  const result = recordSectionEdit({
    documentId: 'doc:slb-5', domainType: 'nor', field, before: 'Teks lama.', after: 'Teks baru.', actorId: 'evan',
  });
  check('recordSectionEdit still succeeds (signal 1 fires regardless)', result.ok === true);
  check('patternCorrectionSubmitted is honestly false (nothing to correct)', result.patternCorrectionSubmitted === false);
  check('no error is surfaced for an unresolvable citation (not a reviewer-facing failure)', result.error === null);
}

console.log('\n[Sprint 11.4 — recordSectionEdit attaches a real semantic-diff classification, never duplicated math]');
{
  const result = recordSectionEdit({
    documentId: 'doc:slb-7', domainType: 'nor', field: 'quantity', before: '20 kursi', after: '24 kursi', actorId: 'evan',
  });
  check('the return value carries semanticDiff', result.semanticDiff && result.semanticDiff.diffNature === 'quantity_correction');
  const ev = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.find((e) => e.targetKey === 'doc:slb-7:quantity');
  check('the SAME classification is persisted on the LearningEvent\'s evidence (one computation, one fact)', !!ev
    && ev.evidence.semanticDiff.diffNature === 'quantity_correction' && ev.evidence.semanticDiff.category === 'fact');
  check('the human-readable label is folded into the audit reason, visible without new UI', ev.reason.includes(ev.evidence.semanticDiff.label));
}

console.log('\n[No-op guard — identical before/after records nothing]');
{
  const before = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  // recordSectionEdit itself has no before===after guard (that lives in
  // review-workspace.js#onFocusOut, the ONE caller, per that handler's own
  // early return) — this only proves the underlying recordCorrection() call
  // is idempotent-when-unchanged if ever called twice with the same fact.
  recordSectionEdit({ documentId: 'doc:slb-1', domainType: 'nor', field: 'quantity', before: '20', after: '24', actorId: 'evan' });
  const after = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  check('repeating the exact same correction is idempotent (no duplicate audit event)', after === before);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
