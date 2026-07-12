/* pattern-discovery-check.mjs — Node check for V2.1 "Pattern Discovery
   Foundation": deterministic statistical evidence over Approved Knowledge,
   never written anywhere, never auto-applied to an Organizational
   Profile. No AI, no machine learning model — every category is either a
   direct reframing of profile-engine.js's already-computed ProfileEntry
   output, or a small deterministic aggregation over repository data.
   Run: node scripts/pattern-discovery-check.mjs   (exit 0 = pass) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setActiveRepository, create as createKnowledgeItem } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { PROFILE_TYPE } from '../js/v2/knowledge/contracts/profile-contract.js';
import { buildProfile } from '../js/v2/knowledge/profiles/profile-engine.js';
import { suggestConfidence } from '../js/v2/knowledge/machine-learning/confidence-engine.js';
import { RELATIONSHIP_TYPE } from '../js/v2/knowledge/contracts/dependency-graph-contract.js';
import { PATTERN_TYPE, isCandidateRecommendation } from '../js/v2/knowledge/contracts/pattern-recommendation-contract.js';
import { computePatternRecommendations } from '../js/v2/knowledge/profiles/pattern-discovery-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

const now = new Date().toISOString();
function approvedItem({ sourceRef, kind, payload, sourceType = 'test' }) {
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType, sourceRef }),
    version: 1, domainType: 'nor', sourceType, kind, payload,
    confidence: 0.8, lifecycleState: LIFECYCLE_STATE.APPROVED,
    provenance: { connectorId: sourceType, sourceRef, capturedAt: now },
    approvedBy: 'evan', approvedAt: now, preferenceRationale: 'test fixture', createdAt: now, updatedAt: now,
  });
}

console.log('\n[Fixture — Approved recipient + rule + relationship items]');
createKnowledgeItem(approvedItem({ sourceRef: 'rec-1', kind: 'recipient', payload: { value: 'Kepala Sekolah' } }));
createKnowledgeItem(approvedItem({ sourceRef: 'rec-2', kind: 'recipient', payload: { value: 'Kepala Sekolah' } }));
createKnowledgeItem(approvedItem({ sourceRef: 'rule-1', kind: 'rule', payload: { value: 'no-weekend-approval' } }));
const relA = approvedItem({ sourceRef: 'rel-1', kind: 'relationship', payload: { fromId: 'a', toId: 'b', type: RELATIONSHIP_TYPE.CORROBORATES } });
const relB = approvedItem({ sourceRef: 'rel-2', kind: 'relationship', payload: { fromId: 'c', toId: 'd', type: RELATIONSHIP_TYPE.CORROBORATES } });
createKnowledgeItem(relA);
createKnowledgeItem(relB);

const recommendations = computePatternRecommendations('nor');
check('computePatternRecommendations returns a non-empty list', recommendations.length > 0);
check('every recommendation satisfies isCandidateRecommendation', recommendations.every(isCandidateRecommendation));

console.log('\n[Profile-derived categories — zero drift from buildProfile()\'s own output]');
const recipientProfile = buildProfile('nor', PROFILE_TYPE.RECIPIENT);
const recipientRecs = recommendations.filter((r) => r.patternType === PROFILE_TYPE.RECIPIENT);
check('recipient recommendations match buildProfile() entry count exactly', recipientProfile.ok && recipientRecs.length === recipientProfile.profile.entries.length);
const kepsekEntry = recipientProfile.profile.entries.find((e) => e.value === 'Kepala Sekolah');
const kepsekRec = recipientRecs.find((r) => r.value === 'Kepala Sekolah');
check('a recipient recommendation carries the exact same supportCount/confidence as its ProfileEntry', kepsekRec.evidence.supportCount === kepsekEntry.sampleCount && kepsekRec.evidence.confidence === kepsekEntry.confidence);
check('a recipient recommendation\'s affectedDocumentIds match the ProfileEntry\'s evidence itemIds', JSON.stringify([...kepsekRec.evidence.affectedDocumentIds].sort()) === JSON.stringify(kepsekEntry.evidence.map((e) => e.itemId).sort()));

console.log('\n[Rule confidence — matches suggestConfidence() exactly]');
const ruleItemId = generateKnowledgeId({ domainType: 'nor', sourceType: 'test', sourceRef: 'rule-1' });
const ruleRec = recommendations.find((r) => r.patternType === PATTERN_TYPE.RULE_CONFIDENCE && r.value === ruleItemId);
const directSuggestion = suggestConfidence(approvedItem({ sourceRef: 'rule-1', kind: 'rule', payload: { value: 'no-weekend-approval' } }));
check('a rule_confidence recommendation exists for the fixture rule item', !!ruleRec);
check('its confidence matches suggestConfidence()\'s own formula exactly', ruleRec.evidence.confidence === directSuggestion.suggestedConfidence);

console.log('\n[Relationship confidence — grouped by type, averaged]');
const relRec = recommendations.find((r) => r.patternType === PATTERN_TYPE.RELATIONSHIP_CONFIDENCE && r.value === RELATIONSHIP_TYPE.CORROBORATES);
check('a relationship_confidence recommendation exists for "corroborates"', !!relRec);
check('its supportCount matches the 2 fixture relationships', relRec.evidence.supportCount === 2);
check('its confidence is the mean of the 2 relationship items\' own confidence (0.8)', relRec.evidence.confidence === 0.8);

console.log('\n[Never writes — the engine only reads]');
const __dirname = dirname(fileURLToPath(import.meta.url));
const engineSource = readFileSync(join(__dirname, '../js/v2/knowledge/profiles/pattern-discovery-engine.js'), 'utf8');
check('pattern-discovery-engine.js never calls create(', !/\bcreate\(/.test(engineSource.replace(/makeCandidateRecommendation/g, '')));
check('pattern-discovery-engine.js never calls appendVersion(', !engineSource.includes('appendVersion('));
check('pattern-discovery-engine.js has no organizational-memory import statement', !engineSource.split('\n').some((line) => /^\s*import\b.*organizational-memory/.test(line)));

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
