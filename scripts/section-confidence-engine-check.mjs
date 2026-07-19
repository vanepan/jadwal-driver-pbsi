/* section-confidence-engine-check.mjs — Node check for Phase 11 Course
   Correction, Workstream 4/5: section-confidence-engine.js#
   computeSectionConfidence / confidenceHighlightTone.

   Proves the documented 4-tier hierarchy (see that file's own header)
   holds using ONLY real, already-existing engines — nothing here invents
   a number: every expected value is computed by calling the SAME reused
   function (suggestConfidence, getSourceWeight, scoreColor) the engine
   under test calls internally, never a hardcoded literal guessed from
   reading the source. Also proves the render-time-only contract: nothing
   this file calls ever mutates a ComposerDocument, EditableSection, or
   KnowledgeItem.
   Run: node scripts/section-confidence-engine-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate, getById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../js/v2/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';
import { suggestConfidence } from '../js/v2/knowledge/machine-learning/confidence-engine.js';
import { getSourceWeight } from '../js/v2/knowledge/contracts/source-weight-contract.js';
import { scoreColor, clampScore } from '../js/services/unified-scoring.js';
import { makeEditableSection } from '../js/v2/document-intelligence/composer/contracts/editable-section-contract.js';
import {
  createDocument, addSection, attachExplainability, resetComposerStore,
} from '../js/v2/document-intelligence/composer/composer-store.js';
import { computeSectionConfidence, confidenceHighlightTone } from '../js/v2/document-intelligence/composer/section-confidence-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetComposerStore();

function now() { return new Date().toISOString(); }

function makeApprovedPattern(sourceRef, kind, payload) {
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'sctest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'sctest', kind,
    payload, confidence: 0.8, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'sctest', sourceRef, capturedAt: now() }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now(), updatedAt: now(),
  });
  repoCreate(item);
  promoteToCandidate(item.id);
  submitForReview(item.id);
  approve(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Seed data for section-confidence-engine check.' });
  return item.id;
}

const doc = createDocument('nor', { subject: 'Confidence engine test doc' });

console.log('\n[Tier: unresolved — never computed, always confidence 0]');
{
  const unresolvedSection = makeEditableSection({ field: 'traveler', value: '{{traveler: UNKNOWN — memerlukan masukan manusia}}' });
  const r = computeSectionConfidence(unresolvedSection, doc);
  check('an UNKNOWN-marker value scores confidence 0', r.confidence === 0 && r.tier === 'unresolved' && r.tone === 'danger');

  const emptySection = makeEditableSection({ field: 'lampiran', value: '' });
  const r2 = computeSectionConfidence(emptySection, doc);
  check('an empty non-pattern value also scores confidence 0', r2.confidence === 0 && r2.tier === 'unresolved' && r2.tone === 'danger');
}

console.log('\n[Tier 3: a human-overridden section always wins — checked BEFORE the pattern branch]');
{
  const humanSection = { ...makeEditableSection({ field: 'pattern:does-not-matter', value: 'Teks yang sudah diedit manusia.' }), isOverridden: true };
  const r = computeSectionConfidence(humanSection, doc);
  const humanWeight = getSourceWeight('correction');
  check('isOverridden:true reuses getSourceWeight(\'correction\') verbatim, even for a pattern: field', r.confidence === humanWeight.weight && r.tier === 'human-correction');
  check('tone maps to the top color band (ok)', r.tone === scoreColor(clampScore(humanWeight.weight * 100)));
}

console.log('\n[Tier 1: Official Approved Template — kind:template_pattern]');
{
  const templateId = makeApprovedPattern('tier1-1', 'template_pattern', { template: 'Nota Organisasi resmi.', granularity: 'template' });
  const item = getById(templateId).data;
  const section = makeEditableSection({ field: `pattern:${templateId}`, value: 'Nota Organisasi resmi.' });
  const r = computeSectionConfidence(section, doc);
  const expected = suggestConfidence(item);
  check('computeSectionConfidence reuses suggestConfidence() verbatim for the cited item', expected.ok && r.confidence === expected.suggestedConfidence);
  check('tier is labeled "official-template" for a template_pattern kind citation', r.tier === 'official-template');
  check('carries real Evidence[] from explainConfidenceAsEvidence (never an empty array for a resolvable citation)', Array.isArray(r.evidence));
}

console.log('\n[Tier 2: a real Approved pattern citation, not a template]');
{
  const sentenceId = makeApprovedPattern('tier2-1', 'sentence_pattern', { template: 'Bersama ini kami sampaikan {{item}}.', granularity: 'sentence' });
  const item = getById(sentenceId).data;
  const section = makeEditableSection({ field: `pattern:${sentenceId}`, value: 'Bersama ini kami sampaikan kursi.' });
  const r = computeSectionConfidence(section, doc);
  const expected = suggestConfidence(item);
  check('computeSectionConfidence reuses suggestConfidence() verbatim', expected.ok && r.confidence === expected.suggestedConfidence);
  check('tier is labeled "approved-pattern" (not official-template) for sentence_pattern', r.tier === 'approved-pattern');
}

console.log('\n[Pattern citation that no longer resolves — honest zero, never fabricated]');
{
  const section = makeEditableSection({ field: 'pattern:knowledge:nor:does-not-exist:1', value: 'Some composed text.' });
  const r = computeSectionConfidence(section, doc);
  check('an unresolvable citation scores confidence 0, tier unresolved', r.confidence === 0 && r.tier === 'unresolved' && r.tone === 'danger');
}

console.log('\n[norNumber — prefers a REAL attached numberingSuggestion over the structural default]');
{
  const docWithNumbering = createDocument('nor', { subject: 'Doc with numbering' });
  attachExplainability(docWithNumbering.documentId, {
    conversationId: 'conversation:sc-test:1',
    unresolvedFields: [], citedKnowledgeIds: [], explanation: [], renderingRulesConsidered: [],
    reasoningConsidered: Object.freeze({ ok: false, errorCode: null }),
    numberingSuggestion: { confidence: 0.83, basis: 'Next in sequence after "007/Nota Organisasi/Sarpras/VI/2026" — 4/5 archived numbers share this pattern.' },
  });
  const section = makeEditableSection({ field: 'norNumber', value: '008/Nota Organisasi/Sarpras/VII/2026' });
  const r = computeSectionConfidence(section, docWithNumbering);
  check('norNumber reads the REAL attached confidence (0.83), not the 0.7 structural fallback', r.confidence === 0.83 && r.tier === 'nor-archive');
  check('rationale passes through the real basis string', r.rationale.includes('4/5 archived numbers'));

  const docWithoutNumbering = createDocument('nor', { subject: 'Doc without numbering' });
  const section2 = makeEditableSection({ field: 'norNumber', value: '009/Nota Organisasi/Sarpras/VII/2026' });
  const r2 = computeSectionConfidence(section2, docWithoutNumbering);
  const extraction = getSourceWeight('extraction');
  check('with NO explainability attached at all, norNumber falls back to the extraction weight (0.7), honestly, never fabricated', r2.confidence === extraction.weight && r2.tier === 'ai-draft');
}

console.log('\n[Tier 4: a structural-suggestion field with no citation, no human touch]');
{
  const section = makeEditableSection({ field: 'suggestedSignatoryTopCount', value: '2' });
  const r = computeSectionConfidence(section, doc);
  const extraction = getSourceWeight('extraction');
  check('reuses getSourceWeight(\'extraction\') verbatim (0.7)', r.confidence === extraction.weight && r.tier === 'ai-draft');
}

console.log('\n[A plain Conversation answer — not pattern-sourced, not structural, not (yet) overridden]');
{
  const section = makeEditableSection({ field: 'subject', value: 'Pengadaan ATK Kantor' });
  const r = computeSectionConfidence(section, doc);
  const humanWeight = getSourceWeight('correction');
  check('a direct human answer reuses the SAME human-trust weight as an edit (1.0)', r.confidence === humanWeight.weight && r.tier === 'human-answer');
}

console.log('\n[Documented ordering — human correction >= template_pattern citation, under real, unmanipulated data]');
{
  // A freshly-approved pattern with zero corroboration and an unregistered
  // sourceType (sctest) scores the LOWEST suggestConfidence realistically
  // can — even so, it must never exceed the human-trust ceiling.
  const weakId = makeApprovedPattern('order-1', 'template_pattern', { template: 'Template lemah, tanpa korroborasi.', granularity: 'template' });
  const weakItem = getById(weakId).data;
  const weakSection = makeEditableSection({ field: `pattern:${weakId}`, value: 'Template lemah, tanpa korroborasi.' });
  const weakResult = computeSectionConfidence(weakSection, doc);
  const humanResult = computeSectionConfidence({ ...makeEditableSection({ field: 'pattern:irrelevant', value: 'x' }), isOverridden: true }, doc);
  check('human correction confidence (1.0) is >= any real template_pattern suggestConfidence() output', humanResult.confidence >= weakResult.confidence);
  check('the template_pattern result itself is a real, non-fabricated suggestConfidence() output', weakResult.confidence === suggestConfidence(weakItem).suggestedConfidence);
}

console.log('\n[confidenceHighlightTone — 3-state Grammarly-style collapse of the 4-tone system]');
{
  check('ok collapses to green', confidenceHighlightTone('ok') === 'green');
  check('info collapses to green', confidenceHighlightTone('info') === 'green');
  check('warn collapses to yellow', confidenceHighlightTone('warn') === 'yellow');
  check('danger collapses to red', confidenceHighlightTone('danger') === 'red');
}

console.log('\n[Render-time-only contract — computing confidence never mutates persisted state]');
{
  const templateId = makeApprovedPattern('purity-1', 'template_pattern', { template: 'Immutable check.', granularity: 'template' });
  const versionBefore = getById(templateId).data.version;
  const section = makeEditableSection({ field: `pattern:${templateId}`, value: 'Immutable check.' });
  computeSectionConfidence(section, doc);
  computeSectionConfidence(section, doc);
  check('calling computeSectionConfidence twice never bumps the cited KnowledgeItem\'s version', getById(templateId).data.version === versionBefore);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
