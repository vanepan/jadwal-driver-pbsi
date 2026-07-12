/* profile-override-check.mjs — Node check for V2.1 "Organizational
   Profiles, Editable Layer": Profile Overrides reuse the real, unmodified
   KnowledgeItem lifecycle (Draft -> Candidate -> Pending Review ->
   Approved) for their own draft -> review -> approve gate, and
   getEffectiveProfile() merges an Approved override onto
   profile-engine.js#buildProfile()'s computed output ONLY at render time
   — Organizational Profiles are updated only after human approval, never
   automatically. No production writes (memory repository only).
   Run: node scripts/profile-override-check.mjs   (exit 0 = pass) */

import { setActiveRepository, create as createKnowledgeItem } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { PROFILE_TYPE } from '../js/v2/knowledge/contracts/profile-contract.js';

import { resetProfileOverrideRepository, list as listOverridesRaw } from '../js/v2/knowledge/profiles/overrides/repository/profile-override-repository.js';
import {
  PROFILE_OVERRIDE_TYPE, STANDALONE_OVERRIDE_TYPES, OVERRIDE_ACTION, isOverlayType, isStandaloneType,
} from '../js/v2/knowledge/profiles/overrides/contracts/profile-override-contract.js';
import {
  createOverrideDraft, promoteOverrideToCandidate, submitOverrideForReview, approveOverride, rejectOverride,
} from '../js/v2/knowledge/profiles/overrides/profile-override-engine.js';
import { getEffectiveProfile, listApprovedOverrides } from '../js/v2/knowledge/profiles/overrides/profile-override-merge-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetProfileOverrideRepository();

console.log('\n[Override type set]');
check('PROFILE_OVERRIDE_TYPE includes all ten existing PROFILE_TYPE values', Object.values(PROFILE_TYPE).every((t) => Object.values(PROFILE_OVERRIDE_TYPE).includes(t)));
check('PROFILE_OVERRIDE_TYPE adds exactly 4 new standalone types', STANDALONE_OVERRIDE_TYPES.length === 4);
check('isOverlayType is true for RECIPIENT, false for BUSINESS_RULE', isOverlayType(PROFILE_TYPE.RECIPIENT) && !isOverlayType(PROFILE_OVERRIDE_TYPE.BUSINESS_RULE));
check('isStandaloneType is true for BUSINESS_RULE, false for RECIPIENT', isStandaloneType(PROFILE_OVERRIDE_TYPE.BUSINESS_RULE) && !isStandaloneType(PROFILE_TYPE.RECIPIENT));

console.log('\n[Repository reuse — canTransition/nextVersion, same as every other repository]');
const draft = createOverrideDraft({
  domainType: 'nor', overrideType: PROFILE_TYPE.RECIPIENT, key: 'Kepala Sekolah',
  action: OVERRIDE_ACTION.PIN, payload: { rationale: 'Most frequent recipient in practice.' }, authoredBy: 'evan',
});
check('createOverrideDraft succeeds at lifecycleState draft', draft.ok && draft.data.lifecycleState === LIFECYCLE_STATE.DRAFT);
check('createOverrideDraft rejects a duplicate id (append-only, not overwrite)', createOverrideDraft({
  domainType: 'nor', overrideType: PROFILE_TYPE.RECIPIENT, key: 'Kepala Sekolah',
  action: OVERRIDE_ACTION.PIN, payload: {}, authoredBy: 'evan',
}).ok === false);

console.log('\n[Draft -> Candidate -> Pending Review -> Approved, reusing isValidReviewDecision unchanged]');
const overrideId = draft.data.id;
const candidate = promoteOverrideToCandidate(overrideId);
check('promoteOverrideToCandidate succeeds', candidate.ok && candidate.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
const submitted = submitOverrideForReview(overrideId);
check('submitOverrideForReview succeeds from Candidate', submitted.ok && submitted.data.lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW);
const approvedWithoutRationale = approveOverride(overrideId, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: null });
check('approveOverride rejects a decision without preferenceRationale', approvedWithoutRationale.ok === false);
const approved = approveOverride(overrideId, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Confirmed by hand against three real NORs.' });
check('approveOverride succeeds with a valid ReviewDecision', approved.ok && approved.data.lifecycleState === LIFECYCLE_STATE.APPROVED);

console.log('\n[Reject path — Pending Review -> Candidate]');
const draft2 = createOverrideDraft({ domainType: 'nor', overrideType: PROFILE_TYPE.SIGNATORY, key: 'Test Signatory', action: OVERRIDE_ACTION.PIN, payload: {}, authoredBy: 'evan' });
promoteOverrideToCandidate(draft2.data.id);
submitOverrideForReview(draft2.data.id);
const rejected = rejectOverride(draft2.data.id, { approverId: 'evan', decidedAt: new Date().toISOString() });
check('rejectOverride sends the override back to Candidate', rejected.ok && rejected.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);

console.log('\n[getEffectiveProfile — merges buildProfile() with Approved overrides, never persists]');
const now = new Date().toISOString();
function makeApprovedRecipientItem(sourceRef, value) {
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'test', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'test', kind: 'recipient',
    payload: { value }, confidence: 0.9, lifecycleState: LIFECYCLE_STATE.APPROVED,
    provenance: { connectorId: 'test', sourceRef, capturedAt: now },
    approvedBy: 'evan', approvedAt: now, preferenceRationale: 'test fixture', createdAt: now, updatedAt: now,
  });
}
createKnowledgeItem(makeApprovedRecipientItem('r1', 'Wakil Kepala Sekolah'));
createKnowledgeItem(makeApprovedRecipientItem('r2', 'Wakil Kepala Sekolah'));

// The RECIPIENT override created and approved earlier in this script
// ("Kepala Sekolah", PIN) should now surface — this is the "after
// approval" state; buildProfile()'s own un-overridden output is already
// covered by profile-engine.js's existing check script.
const withOverride = getEffectiveProfile('nor', PROFILE_TYPE.RECIPIENT);
check('after approval, the PINned "Kepala Sekolah" override is force-included', withOverride.ok && withOverride.profile.entries.some((e) => e.value === 'Kepala Sekolah'));
check('the PINned entry is sorted to the top', withOverride.profile.entries[0].value === 'Kepala Sekolah');
check('overridesApplied reflects the one Approved override', withOverride.overridesApplied === 1);
check('the real computed entry ("Wakil Kepala Sekolah") is still present, unmodified', withOverride.profile.entries.some((e) => e.value === 'Wakil Kepala Sekolah' && e.sampleCount === 2));

check('getEffectiveProfile refuses a standalone type (no baseline to overlay)', getEffectiveProfile('nor', PROFILE_OVERRIDE_TYPE.BUSINESS_RULE).ok === false);

console.log('\n[Standalone types — CRUD-only, no baseline]');
const ruleDraft = createOverrideDraft({
  domainType: 'nor', overrideType: PROFILE_OVERRIDE_TYPE.BUSINESS_RULE, key: 'no-weekend-approval',
  action: OVERRIDE_ACTION.DEFINE, payload: { condition: 'approvedAt is a weekend', action: 'flag for re-review', rationale: 'Weekend approvals are rare and worth a second look.', active: true },
  authoredBy: 'evan',
});
promoteOverrideToCandidate(ruleDraft.data.id);
submitOverrideForReview(ruleDraft.data.id);
approveOverride(ruleDraft.data.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Approved as a real operational rule.' });
const rules = listApprovedOverrides('nor', PROFILE_OVERRIDE_TYPE.BUSINESS_RULE);
check('listApprovedOverrides returns the one Approved Business Rule', rules.ok && rules.overrides.length === 1 && rules.overrides[0].key === 'no-weekend-approval');
check('listApprovedOverrides refuses an overlay type (has a baseline, use getEffectiveProfile)', listApprovedOverrides('nor', PROFILE_TYPE.RECIPIENT).ok === false);

resetProfileOverrideRepository();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
