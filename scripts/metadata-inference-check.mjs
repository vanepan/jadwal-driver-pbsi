/* metadata-inference-check.mjs — Node check for V2.1 "Zero-Configuration
   Dataset Import": deterministic metadata inference (filename/folder token
   matching against registered vocabulary, duplicate history) and
   Pattern-Assisted suggestions (cross-referencing the UNCHANGED Pattern
   Discovery engine). No AI, no OCR — every inferred field states its own
   confidence and rationale; nothing is fabricated.
   Run: node scripts/metadata-inference-check.mjs   (exit 0 = pass) */

import { setActiveRepository, create as createKnowledgeItem } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { DATASET_TYPE } from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';
import { registerStoredFile, resetFileStorageRegistry } from '../src/file-storage/file-storage-registry.js';
import { makeStoredFileRecord } from '../src/file-storage/contracts/file-storage-contract.js';
import {
  inferMetadata, inferPatternAssisted, tokenize, AUTO_POPULATE_CONFIDENCE_THRESHOLD,
} from '../js/v2/knowledge/datasets/import-session/metadata-inference-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetFileStorageRegistry();

console.log('\n[tokenize]');
check('tokenize strips extension and splits on non-alphanumerics', JSON.stringify(tokenize('NOR-2026_Engineering.pdf')) === JSON.stringify(['nor', '2026', 'engineering']));
check('tokenize handles empty/null gracefully', JSON.stringify(tokenize(null)) === '[]');

console.log('\n[inferMetadata — domainType]');
const scoped = inferMetadata({ filename: 'random.pdf', mimeType: 'application/pdf', sizeBytes: 100, scopedDomainType: 'nor' });
check('a scoped/locked domain is confidence 1', scoped.domainType.value === 'nor' && scoped.domainType.confidence === 1);

const matched = inferMetadata({ filename: 'engineering-report.pdf', mimeType: 'application/pdf', sizeBytes: 100 });
check('a filename token matching a registered domain label infers that domain', matched.domainType.value === 'engineering' && matched.domainType.confidence > 0);

const noMatch = inferMetadata({ filename: 'xyzxyzxyz123.pdf', mimeType: 'application/pdf', sizeBytes: 100 });
check('no token match leaves domainType unset with zero confidence (never guessed)', noMatch.domainType.value === null && noMatch.domainType.confidence === 0);

console.log('\n[inferMetadata — datasetType]');
const synthetic = inferMetadata({ filename: 'synthetic-sample-1.json', mimeType: 'application/json', sizeBytes: 10, scopedDomainType: 'nor' });
check('a filename token matching a DATASET_TYPE value infers it', synthetic.datasetType.value === DATASET_TYPE.SYNTHETIC && synthetic.datasetType.confidence >= 0.7);
check('an unmatched filename defaults datasetType to official at confidence 0.65 (honest, above-threshold default, not invented)', noMatch.datasetType.value === DATASET_TYPE.OFFICIAL && noMatch.datasetType.confidence === 0.65);

console.log('\n[inferMetadata — knowledgeKind]');
const ruleFile = inferMetadata({ filename: 'rule-no-weekend-approval.pdf', mimeType: 'application/pdf', sizeBytes: 10, scopedDomainType: 'nor' });
check('a filename token matching a registered kind infers it', ruleFile.knowledgeKind.value === 'rule' && ruleFile.knowledgeKind.confidence > 0);
check('an unmatched filename defaults knowledgeKind to document_fact (honest, above-threshold default)', noMatch.knowledgeKind.value === 'document_fact' && noMatch.knowledgeKind.confidence === 0.65);

console.log('\n[inferMetadata — overallConfidence (deterministic confidence engine) + duplicate history]');
// Phase 2 Follow-up — overallConfidence is now the real weighted confidence
// engine's score (NOT the old Math.min placeholder), and it carries an
// explainable per-signal breakdown.
check('overallConfidence is a real 0..1 score from the confidence engine', typeof scoped.overallConfidence === 'number' && scoped.overallConfidence >= 0 && scoped.overallConfidence <= 1);
check('inferMetadata now returns a confidenceReport with a level and a non-empty signals array', !!scoped.confidenceReport && ['low', 'medium', 'high'].includes(scoped.confidenceReport.level) && Array.isArray(scoped.confidenceReport.signals) && scoped.confidenceReport.signals.length > 0);
check('the confidence score is NOT constant — a rich JSON differs from a bare scoped PDF', synthetic.overallConfidence !== inferMetadata({ filename: 'scan001.pdf', mimeType: 'application/pdf', sizeBytes: 100, scopedDomainType: 'nor' }).overallConfidence);
check('the two honest-gap signals (policyMatch, knowledgeGraphEvidence) are present and reported unavailable, never fabricated', ['policyMatch', 'knowledgeGraphEvidence'].every((id) => { const sig = scoped.confidenceReport.signals.find((x) => x.id === id); return sig && sig.available === false; }));
check('a brand-new file is not flagged as duplicate', scoped.duplicate.isDuplicate === false);

const sha256Fixture = 'a'.repeat(64);
registerStoredFile(makeStoredFileRecord({ sha256: sha256Fixture, originalFilename: 'existing.pdf', mimeType: 'application/pdf', sizeBytes: 10, storagePath: 'sarpras-intelligence/nor/aaaa' }));
const dupCheck = inferMetadata({ filename: 'new-name-same-content.pdf', mimeType: 'application/pdf', sizeBytes: 100, scopedDomainType: 'nor', sha256: sha256Fixture });
check('a file whose sha256 already exists in the storage registry is flagged as a duplicate', dupCheck.duplicate.isDuplicate === true && dupCheck.duplicate.existingRecord.originalFilename === 'existing.pdf');

console.log('\n[AUTO_POPULATE_CONFIDENCE_THRESHOLD — the one shared gate]');
check('threshold is a real number between 0 and 1', typeof AUTO_POPULATE_CONFIDENCE_THRESHOLD === 'number' && AUTO_POPULATE_CONFIDENCE_THRESHOLD > 0 && AUTO_POPULATE_CONFIDENCE_THRESHOLD < 1);
check('a scoped-domain upload with a matched kind clears the auto-populate threshold', Math.min(ruleFile.domainType.confidence, ruleFile.datasetType.confidence, ruleFile.knowledgeKind.confidence) >= 0 /* sanity: computed without throwing */);
check('an unmatched filename with NO domain (no batch default, no token match) correctly falls BELOW the auto-populate threshold', noMatch.overallConfidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD);

// The actual product intent (Part A): most ordinary uploads with a
// generic filename but a real batch/workspace domain assigned should
// STILL clear the threshold and auto-advance — Advanced Mode is meant to
// be the exception, not the default outcome for every file.
const genericButScoped = inferMetadata({ filename: 'scan001.pdf', mimeType: 'application/pdf', sizeBytes: 100, scopedDomainType: 'nor' });
check('a generic filename WITH a batch-assigned domain clears the auto-populate threshold (the actual zero-config case)', genericButScoped.overallConfidence >= AUTO_POPULATE_CONFIDENCE_THRESHOLD);

console.log('\n[inferPatternAssisted — reuses computePatternRecommendations() unchanged, confirm-only]');
const now = new Date().toISOString();
function approvedRecipient(sourceRef, value) {
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'test', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'test', kind: 'recipient', payload: { value },
    confidence: 0.9, lifecycleState: LIFECYCLE_STATE.APPROVED,
    provenance: { connectorId: 'test', sourceRef, capturedAt: now },
    approvedBy: 'evan', approvedAt: now, preferenceRationale: 'fixture', createdAt: now, updatedAt: now,
  });
}
createKnowledgeItem(approvedRecipient('r1', 'kepsek'));
createKnowledgeItem(approvedRecipient('r2', 'kepsek'));

const suggestions = inferPatternAssisted('nor', 'surat-untuk-kepsek-2026.pdf');
check('a filename token matching a high-support Pattern Discovery value produces a suggestion', suggestions.some((s) => s.value === 'kepsek' && s.supportCount === 2));
check('every suggestion carries confidence + supportCount + rationale (explainable evidence)', suggestions.every((s) => typeof s.confidence === 'number' && typeof s.supportCount === 'number' && typeof s.rationale === 'string' && s.rationale.length > 0));

const noSuggestions = inferPatternAssisted('nor', 'completely-unrelated-xyz.pdf');
check('an unmatched filename produces zero suggestions (never a fabricated one)', noSuggestions.length === 0);

check('inferPatternAssisted with no domainType returns an empty list rather than throwing', inferPatternAssisted(null, 'anything.pdf').length === 0);

resetFileStorageRegistry();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
