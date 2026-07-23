/* organizational-profile-builder-check.mjs — Node check for V2.0.14.5
   "Organizational Profile Builder": buildAllProfiles() fans out over
   every PROFILE_TYPE (V2.0.12.5's profile-engine.js) for one domainType
   in a single call — pure composition, no new aggregation math, no
   hardcoded rules. Entirely deterministic — no AI, no LLM, no
   production writes (memory repository only).
   Run: node scripts/organizational-profile-builder-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate } from '../src/knowledge/repository/knowledge-repository.js';
import { PROFILE_TYPE } from '../src/knowledge/contracts/profile-contract.js';
import { buildAllProfiles, listProfileTypes } from '../src/knowledge/services/profile-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

function makeItem(domainType, sourceRef, kind, value, confidence = 1) {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType: 'pbtest', sourceRef }),
    version: 1, domainType, sourceType: 'pbtest', kind, payload: { value }, confidence,
    lifecycleState: LIFECYCLE_STATE.APPROVED,
    provenance: Object.freeze({ connectorId: 'pbtest', sourceRef, capturedAt: now }),
    approvedBy: 'reviewer-1', approvedAt: now, preferenceRationale: 'test fixture', createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  return item;
}

console.log('\n[Fixture — populate RECIPIENT and SIGNATORY, leave the other 8 empty]');
makeItem('sop', 'r1', 'recipient', 'Pak Budi');
makeItem('sop', 'r2', 'recipient', 'Pak Budi');
makeItem('sop', 's1', 'signatory', 'Pak Direktur');

console.log('\n[buildAllProfiles — fans out over every PROFILE_TYPE]');
const result = buildAllProfiles('sop');
check('profileTypesAttempted equals the full PROFILE_TYPE count (10)', result.profileTypesAttempted === listProfileTypes().length && result.profileTypesAttempted === 10);
check('profileTypesComputed is exactly 2 (RECIPIENT and SIGNATORY have data)', result.profileTypesComputed === 2);
check('every PROFILE_TYPE key is present in the result, even the empty ones', Object.values(PROFILE_TYPE).every((t) => t in result.profiles));
check('RECIPIENT profile succeeded with sampleCount 2', result.profiles[PROFILE_TYPE.RECIPIENT].ok === true && result.profiles[PROFILE_TYPE.RECIPIENT].profile.sampleCount === 2);
check('SIGNATORY profile succeeded with sampleCount 1', result.profiles[PROFILE_TYPE.SIGNATORY].ok === true && result.profiles[PROFILE_TYPE.SIGNATORY].profile.sampleCount === 1);
check('VOCABULARY profile (no data) reports ok:false / NO_POPULATION, not a crash', result.profiles[PROFILE_TYPE.VOCABULARY].ok === false
  && result.profiles[PROFILE_TYPE.VOCABULARY].error.code === 'NO_POPULATION');
check('a domainType with zero Approved items anywhere still returns all 10 keys, all failed', (() => {
  const empty = buildAllProfiles('petty_cash');
  return Object.values(PROFILE_TYPE).every((t) => t in empty.profiles) && empty.profileTypesComputed === 0;
})());

console.log('\n[buildAllProfiles reflects newly Approved knowledge automatically — no stale cache]');
makeItem('sop', 'r3', 'recipient', 'Bu Sari');
const after = buildAllProfiles('sop');
check('a freshly Approved item is picked up on the very next call, with no cache to invalidate', after.profiles[PROFILE_TYPE.RECIPIENT].profile.sampleCount === 3);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
