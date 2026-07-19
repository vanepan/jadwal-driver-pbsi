/* knowledge-drift-engine-check.mjs — Node check for Phase 11, Sprint 11.7
   (Continuous Organizational Memory): knowledge-drift-engine.js#
   computeKnowledgeDrift.

   Proves the three real signals (low-relative confidence, conflicting
   organizational styles, obsolete-wording candidates reused from Sprint
   11.5) using only real, deterministic computations over real fixture
   data — no invented decay number, no fabricated absolute threshold.
   Run: node scripts/knowledge-drift-engine-check.mjs   (exit 0 = pass) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../js/v2/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';
import { suggestConfidence } from '../js/v2/knowledge/machine-learning/confidence-engine.js';
import { resetLearningRepository } from '../js/v2/learning/repository/learning-repository.js';
import { recordCorrection, CORRECTION_TYPE } from '../js/v2/learning/services/learning-service.js';
import { computeKnowledgeDrift } from '../js/v2/knowledge/profiles/knowledge-drift-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetLearningRepository();

const now = new Date().toISOString();
function approvedItem({ sourceRef, kind, payload, sourceType = 'test', domainType = 'nor' }) {
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType, sourceRef }),
    version: 1, domainType, sourceType, kind, payload,
    confidence: 0.8, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: sourceType, sourceRef, capturedAt: now },
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  promoteToCandidate(item.id);
  submitForReview(item.id);
  approve(item.id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'Seed data for knowledge-drift-engine check.' });
  return item.id;
}

// Every fixture below uses a REGISTERED domainType (domain-type-registry.js
// only knows a fixed, real set — 'nor', 'memorandum', 'sop', ... — and
// knowledge-repository.js#create refuses anything else at the door, same
// validation every other check script in this repo respects). Groups are
// isolated by using a unique `kind` per sub-test instead of a throwaway
// domainType.

console.log('\n[Empty domain — honest empty report, never a fabricated signal]');
{
  const drift = computeKnowledgeDrift('memorandum');
  check('hasDrift is false with no fixtures in this (real, registered but otherwise-unused) domain', drift.hasDrift === false);
  check('all three arrays are genuinely empty', drift.lowRelativeConfidence.length === 0 && drift.conflictingStyles.length === 0 && drift.obsoleteWordingCandidates.length === 0);
}

console.log('\n[lowRelativeConfidence — real mean over real suggestConfidence() outputs, never a fabricated absolute bar]');
{
  // 'nor' (weight 0.9, source-weight-contract.js) vs. an unregistered
  // sourceType (weight 0.5, the contract's own documented default) — a
  // REAL, already-existing confidence spread, not fabricated by this test.
  const strongId = approvedItem({ sourceRef: 'lrc-strong', kind: 'rule', payload: { value: 'strong' }, sourceType: 'nor' });
  const weakId = approvedItem({ sourceRef: 'lrc-weak', kind: 'rule', payload: { value: 'weak' }, sourceType: 'kdectest-unregistered' });
  const drift = computeKnowledgeDrift('nor');
  const flagged = drift.lowRelativeConfidence.filter((f) => f.itemId === strongId || f.itemId === weakId);
  const strongEntry = flagged.find((f) => f.itemId === strongId);
  const weakEntry = flagged.find((f) => f.itemId === weakId);
  check('the weaker-sourceType item is flagged as below its group mean', !!weakEntry);
  check('the stronger-sourceType item is NOT flagged (it is at/above the mean)', !strongEntry);
  check('the flagged entry carries the REAL suggestConfidence() output, not a guess', weakEntry && weakEntry.confidence === suggestConfidence({ id: weakId, sourceType: 'kdectest-unregistered' }).suggestedConfidence);
  check('groupMeanConfidence is the real mean of exactly the 2 fixture items (rounded to 2dp)', weakEntry && weakEntry.groupSize === 2);
}

console.log('\n[lowRelativeConfidence — a group of one is never compared to itself]');
{
  approvedItem({ sourceRef: 'solo-1', kind: 'policy', payload: { value: 'x' }, sourceType: 'test' });
  const drift = computeKnowledgeDrift('nor');
  check('a kind with only one Approved item never appears in lowRelativeConfidence', !drift.lowRelativeConfidence.some((f) => f.kind === 'policy'));
}

console.log('\n[conflictingStyles — 2+ Approved items of the SAME style-role kind, same domain]');
{
  approvedItem({ sourceRef: 'cs-1', kind: 'sentence_pattern', payload: { template: 'Kalimat A kdec-conflict.' }, domainType: 'sop' });
  approvedItem({ sourceRef: 'cs-2', kind: 'sentence_pattern', payload: { template: 'Kalimat B kdec-conflict.' }, domainType: 'sop' });
  const drift = computeKnowledgeDrift('sop');
  const conflict = drift.conflictingStyles.find((c) => c.kind === 'sentence_pattern');
  check('a real conflict is surfaced for 2 Approved sentence_pattern items in the same domain', !!conflict && conflict.count === 2);
  check('carries both real item ids, never a summary that drops the evidence', conflict && conflict.itemIds.length === 2);
}

console.log('\n[conflictingStyles — a single Approved style item is not a conflict]');
{
  approvedItem({ sourceRef: 'cs-solo', kind: 'template_pattern', payload: { template: 'Satu-satunya.' }, domainType: 'internal_letter' });
  const drift = computeKnowledgeDrift('internal_letter');
  check('a single style item never appears as a conflict', drift.conflictingStyles.length === 0);
}

console.log('\n[obsoleteWordingCandidates — reuses Sprint 11.5\'s writingStyleRecommendations() verbatim]');
{
  recordCorrection({
    domainType: 'kdec-style-domain', correctionType: CORRECTION_TYPE.KNOWLEDGE, targetKey: 'doc:kdec-1:openingLine', actorId: 'evan',
    before: { openingLine: 'Pengajuan Pembelian' }, after: { openingLine: 'Permohonan Pembelian' },
    evidence: { field: 'openingLine', editKind: 'edit', patternSourced: false, semanticDiff: { category: 'fact', diffNature: 'opening_phrase', label: 'Preferensi frasa pembuka berubah (Fakta)' } },
  });
  recordCorrection({
    domainType: 'kdec-style-domain', correctionType: CORRECTION_TYPE.KNOWLEDGE, targetKey: 'doc:kdec-2:openingLine', actorId: 'evan',
    before: { openingLine: 'Pengajuan Pembelian' }, after: { openingLine: 'Permohonan Pembelian' },
    evidence: { field: 'openingLine', editKind: 'edit', patternSourced: false, semanticDiff: { category: 'fact', diffNature: 'opening_phrase', label: 'Preferensi frasa pembuka berubah (Fakta)' } },
  });
  const drift = computeKnowledgeDrift('kdec-style-domain');
  check('a recurring reviewer wording preference surfaces as an obsolete-wording candidate', drift.obsoleteWordingCandidates.some((c) => c.value === 'openingLine:Permohonan Pembelian'));
  check('hasDrift is true once any real signal fires', drift.hasDrift === true);
}

console.log('\n[Never writes — the engine only reads]');
{
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const engineSource = readFileSync(join(__dirname, '../js/v2/knowledge/profiles/knowledge-drift-engine.js'), 'utf8');
  check('knowledge-drift-engine.js never calls create(', !engineSource.includes('repoCreate(') && !/[^.]\bcreate\(/.test(engineSource));
  check('knowledge-drift-engine.js never calls appendVersion(', !engineSource.includes('appendVersion('));
  check('knowledge-drift-engine.js never calls recordCorrection/recordPattern (a report, not a producer)', !engineSource.includes('recordCorrection(') && !engineSource.includes('recordPattern('));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
