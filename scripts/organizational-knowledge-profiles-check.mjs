/* organizational-knowledge-profiles-check.mjs — Node check for V2.0.12.5
   "Organizational Knowledge Profiles": the Profile contract
   (PROFILE_TYPE, ProfileEntry/Profile structural validators,
   isProfileEligiblePayload), the seven new kind-registry entries
   (recipient/signatory/cc/approval_chain/attachment/department/
   document_category), and the single generic profile-engine.js that
   serves all ten PROFILE_TYPEs (buildProfile). Entirely deterministic
   — no AI, no LLM, no production writes (memory repository only).
   Run: node scripts/organizational-knowledge-profiles-check.mjs   (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate } from '../src/knowledge/repository/knowledge-repository.js';
import { hasKind, listKinds } from '../src/knowledge/registry/kind-registry.js';
import { isEvidence, isEvidenceList } from '../src/knowledge/contracts/evidence-contract.js';
import {
  PROFILE_TYPE, PROFILE_VALUE_FIELD, isProfile, isProfileEntry, isProfileEligiblePayload,
} from '../src/knowledge/contracts/profile-contract.js';
import { buildProfile, listProfileTypes, PROFILE_KIND_MAP } from '../src/knowledge/services/profile-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

function makeItem(domainType, sourceType, sourceRef, kind, payload, confidence = 1, lifecycleState = LIFECYCLE_STATE.APPROVED) {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType, sourceRef }),
    version: 1, domainType, sourceType, kind, payload, confidence,
    lifecycleState,
    provenance: Object.freeze({ connectorId: sourceType, sourceRef, capturedAt: now }),
    approvedBy: lifecycleState === LIFECYCLE_STATE.APPROVED ? 'reviewer-1' : null,
    approvedAt: lifecycleState === LIFECYCLE_STATE.APPROVED ? now : null,
    preferenceRationale: lifecycleState === LIFECYCLE_STATE.APPROVED ? 'test fixture' : null,
    createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  return item;
}

console.log('\n[kind-registry — seven new profile kinds]');
check('hasKind("recipient")', hasKind('recipient'));
check('hasKind("signatory")', hasKind('signatory'));
check('hasKind("cc")', hasKind('cc'));
check('hasKind("approval_chain")', hasKind('approval_chain'));
check('hasKind("attachment")', hasKind('attachment'));
check('hasKind("department")', hasKind('department'));
check('hasKind("document_category")', hasKind('document_category'));
check('listKinds() includes every PROFILE_KIND_MAP target kind', Object.values(PROFILE_KIND_MAP).every((k) => listKinds().some((entry) => entry.id === k)));

console.log('\n[Profile contract — isProfileEligiblePayload]');
check('accepts a payload with a non-empty "value" field', isProfileEligiblePayload({ value: 'Pak Budi' }));
check('rejects a payload missing "value"', !isProfileEligiblePayload({ name: 'Pak Budi' }));
check('rejects an empty-string "value"', !isProfileEligiblePayload({ value: '' }));
check(`PROFILE_VALUE_FIELD is "value"`, PROFILE_VALUE_FIELD === 'value');

console.log('\n[Profile contract — isProfileEntry / isProfile structural validators]');
const validEntry = { value: 'Pak Budi', sampleCount: 2, frequency: 0.67, confidence: 0.9, evidence: [{ itemId: 'nor:oktest:a', kind: 'source', weight: 0.9, rationale: 'ok' }] };
check('isProfileEntry accepts a well-formed entry', isProfileEntry(validEntry));
check('isProfileEntry rejects frequency outside [0,1]', !isProfileEntry({ ...validEntry, frequency: 1.5 }));
check('isProfileEntry rejects a non-Evidence-list evidence field', !isProfileEntry({ ...validEntry, evidence: [{ bogus: true }] }));
const validProfile = {
  schema: 'knowledge-profile@1', profileType: PROFILE_TYPE.RECIPIENT, domainType: 'nor',
  entries: [validEntry], sampleCount: 3, confidence: 0.8, frequency: 0.5, provenance: validEntry.evidence,
  computedAt: new Date().toISOString(),
};
check('isProfile accepts a well-formed Profile', isProfile(validProfile));
check('isProfile rejects an unregistered profileType', !isProfile({ ...validProfile, profileType: 'bogus' }));
check('isProfile rejects a non-array entries field', !isProfile({ ...validProfile, entries: 'nope' }));

console.log('\n[listProfileTypes — all ten roadmap-named types]');
check('listProfileTypes() returns exactly the ten PROFILE_TYPE values', listProfileTypes().length === 10
  && Object.values(PROFILE_TYPE).every((t) => listProfileTypes().includes(t)));

console.log('\n[profile-engine — fixture: 2x "Pak Budi", 1x "Bu Sari", 1 ineligible, 1 other-kind, 1 other-domain]');
makeItem('nor', 'nor', 'rcp-1', 'recipient', { value: 'Pak Budi' }, 0.9);
makeItem('nor', 'nor', 'rcp-2', 'recipient', { value: 'Pak Budi' }, 0.7);
makeItem('nor', 'nor', 'rcp-3', 'recipient', { value: 'Bu Sari' }, 1.0);
makeItem('nor', 'nor', 'rcp-4', 'recipient', { note: 'no value field' }, 1.0); // ineligible
makeItem('nor', 'nor', 'sig-1', 'signatory', { value: 'Pak Direktur' }, 1.0); // other kind, same domain (counts toward coverage denominator)
makeItem('engineering', 'nor', 'rcp-5', 'recipient', { value: 'Someone Else' }, 1.0); // other domain

const result = buildProfile('nor', PROFILE_TYPE.RECIPIENT);
check('buildProfile("nor", RECIPIENT) succeeds', result.ok === true);
check('itemsConsidered counts all 4 nor/recipient items (including the ineligible one)', result.itemsConsidered === 4);
check('ineligibleCount is exactly 1', result.ineligibleCount === 1);
check('profile.sampleCount is 3 (the 3 eligible items)', result.profile.sampleCount === 3);
check('profile.entries has exactly 2 distinct values', result.profile.entries.length === 2);
check('the top entry (most frequent) is "Pak Budi" with sampleCount 2', result.profile.entries[0].value === 'Pak Budi' && result.profile.entries[0].sampleCount === 2);
check('"Pak Budi" entry frequency is 2/3 (0.67)', result.profile.entries[0].frequency === 0.67);
check('"Pak Budi" entry confidence is mean(0.9, 0.7) = 0.8', result.profile.entries[0].confidence === 0.8);
check('the second entry is "Bu Sari" with sampleCount 1', result.profile.entries[1].value === 'Bu Sari' && result.profile.entries[1].sampleCount === 1);
check('profile.confidence is mean(0.9, 0.7, 1.0) = 0.87', result.profile.confidence === 0.87);
check('profile.frequency is 3 eligible / 5 total nor-domain approved items (recipient+signatory) = 0.6', result.profile.frequency === 0.6);
check('every entry.evidence item satisfies isEvidence', result.profile.entries.every((e) => e.evidence.every(isEvidence)));
check('profile.provenance is a valid Evidence list with 3 entries (one per eligible item)', isEvidenceList(result.profile.provenance) && result.profile.provenance.length === 3);
check('the computed profile satisfies isProfile() end to end', isProfile(result.profile));

console.log('\n[profile-engine — error paths]');
const unknownType = buildProfile('nor', 'not-a-real-type');
check('an unregistered profileType returns ok:false / UNKNOWN_PROFILE_TYPE', unknownType.ok === false && unknownType.error.code === 'UNKNOWN_PROFILE_TYPE');
const noPopulation = buildProfile('petty_cash', PROFILE_TYPE.DEPARTMENT);
check('a domainType/profileType with zero Approved items returns ok:false / NO_POPULATION', noPopulation.ok === false && noPopulation.error.code === 'NO_POPULATION' && noPopulation.profile === null);

console.log('\n[profile-engine — Draft/Candidate items are never counted]');
makeItem('nor', 'nor', 'rcp-draft', 'recipient', { value: 'Should Not Count' }, 1.0, LIFECYCLE_STATE.DRAFT);
const afterDraft = buildProfile('nor', PROFILE_TYPE.RECIPIENT);
check('a Draft-lifecycle item never enters the profile population', afterDraft.ok === true
  && !afterDraft.profile.entries.some((e) => e.value === 'Should Not Count'));

console.log('\n[Dormancy — structural import scan]');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const jsRoot = path.join(repoRoot, 'js');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
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

const allJsFiles = walk(jsRoot);
const v2Root = path.join(jsRoot, 'v2');
const knowledgeRoot = path.join(repoRoot, 'src', 'knowledge');
const ALLOWED_V2_IMPORTERS = new Set([
  path.join(jsRoot, 'config', 'feature-gates.js'),
  path.join(jsRoot, 'config', 'module-loader-registry.js'),
]);

const outsideV2Violations = [];
for (const file of allJsFiles) {
  if (file.startsWith(v2Root)) continue;
  for (const spec of importSpecifiers(file)) {
    const resolved = path.resolve(path.dirname(file), spec);
    if (resolved.startsWith(v2Root) && !ALLOWED_V2_IMPORTERS.has(file)) outsideV2Violations.push(file);
  }
}
check('no file outside the gated chain imports from js/v2/', outsideV2Violations.length === 0);

const aiFoundationViolations = [];
const knowledgeFiles = walk(knowledgeRoot);
for (const file of knowledgeFiles) {
  for (const spec of importSpecifiers(file)) {
    if (spec.includes('ai-foundation')) aiFoundationViolations.push(file);
  }
}
check('src/knowledge/ never imports js/v2/ai-foundation/', aiFoundationViolations.length === 0);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
