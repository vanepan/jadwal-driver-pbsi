/* semantic-diff-engine-check.mjs — Node check for Phase 11, Sprint 11.4
   (Human Learning Intelligence): semantic-diff-engine.js#classifySemanticDiff.

   Proves the classification against the sprint's OWN four documented
   examples verbatim (opening phrase, quantity correction, paragraph
   rejected, new organizational pattern), plus the closing-phrase/wording/
   full-rewrite branches and the template-vs-pattern knowledge lookup —
   using only real, deterministic token math, never a fabricated number.
   Run: node scripts/semantic-diff-engine-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate } from '../src/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../src/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../src/knowledge/review/review-workflow-engine.js';
import { classifySemanticDiff } from '../src/document-intelligence/composer/semantic-diff-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

function now() { return new Date().toISOString(); }

function makePatternItem(sourceRef, kind, payload) {
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'sdetest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'sdetest', kind,
    payload, confidence: 0.8, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'sdetest', sourceRef, capturedAt: now() }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now(), updatedAt: now(),
  });
  repoCreate(item);
  promoteToCandidate(item.id);
  submitForReview(item.id);
  approve(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Seed data for semantic-diff-engine check.' });
  return item.id;
}

console.log('\n[Sprint 11.4\'s own example 1 — opening phrase preference]');
{
  const r = classifySemanticDiff({ field: 'openingLine', before: 'Pengajuan Pembelian', after: 'Permohonan Pembelian', editKind: 'edit', isPatternField: false });
  check('classified as opening_phrase', r.diffNature === 'opening_phrase');
  check('category is fact (not pattern-sourced)', r.category === 'fact');
  check('label mentions the opening-phrase concept', r.label.includes('frasa pembuka'));
}

console.log('\n[Sprint 11.4\'s own example 2 — quantity correction]');
{
  const r = classifySemanticDiff({ field: 'quantity', before: '20 kursi', after: '24 kursi', editKind: 'edit', isPatternField: false });
  check('classified as quantity_correction', r.diffNature === 'quantity_correction');
  check('label mentions kuantitas', r.label.includes('kuantitas'));
}

console.log('\n[Sprint 11.4\'s own example 3 — paragraph rejected (deletion of a pattern-sourced section)]');
{
  const r = classifySemanticDiff({ field: 'pattern:knowledge:nor:x:1', before: 'Kalimat penutup baku yang cukup panjang.', after: '', editKind: 'delete', isPatternField: true });
  check('classified as structural', r.category === 'structural');
  check('label is exactly "Paragraf ditolak"', r.label === 'Paragraf ditolak');
}

console.log('\n[Sprint 11.4\'s own example 4 — insert paragraph reads as a new organizational pattern]');
{
  const r = classifySemanticDiff({ field: 'pattern:knowledge:nor:x:2', before: '', after: 'Kalimat pembuka baru yang diusulkan reviewer untuk dokumen ini.', editKind: 'edit', isPatternField: true });
  check('classified as structural new_content', r.category === 'structural' && r.diffNature === 'new_content');
  check('label reads "Pola organisasi baru diusulkan"', r.label === 'Pola organisasi baru diusulkan');
}

console.log('\n[closing_phrase — a single trailing token differs, everything else identical]');
{
  const r = classifySemanticDiff({ field: 'closingLine', before: 'Demikian surat ini kami sampaikan untuk maklum', after: 'Demikian surat ini kami sampaikan untuk diketahui', editKind: 'edit', isPatternField: false });
  check('classified as closing_phrase', r.diffNature === 'closing_phrase');
}

console.log('\n[wording_change — a single mid-sentence token swapped, not at either edge]');
{
  const r = classifySemanticDiff({ field: 'subject', before: 'Permohonan pengadaan meja untuk ruang rapat utama', after: 'Permohonan pengadaan kursi untuk ruang rapat utama', editKind: 'edit', isPatternField: false });
  check('classified as wording_change', r.diffNature === 'wording_change');
}

console.log('\n[full_rewrite — more than half the tokens changed]');
{
  // Exactly 50% changed, with a common trailing run — the boundary is
  // inclusive-of-tweak, exclusive-of-rewrite (>50%, not >=50%), and the
  // change is entirely a leading run, so this correctly reads as an
  // opening-phrase preference, not a rewrite.
  const r = classifySemanticDiff({ field: 'subject', before: 'Satu dua tiga empat', after: 'Lima enam tiga empat', editKind: 'edit', isPatternField: false });
  check('exactly 50% changed (boundary) stays below the rewrite threshold', r.diffNature !== 'full_rewrite');
  check('and — being a pure leading run — reads as opening_phrase', r.diffNature === 'opening_phrase');

  const r2 = classifySemanticDiff({ field: 'subject', before: 'Satu dua tiga', after: 'Sembilan delapan tiga', editKind: 'edit', isPatternField: false });
  check('2 of 3 tokens changed (66%, over the threshold) classifies as full_rewrite', r2.diffNature === 'full_rewrite');
}

console.log('\n[category resolution — template_pattern citation vs. an ordinary approved pattern]');
{
  const templateId = makePatternItem('tpl-1', 'template_pattern', { template: 'Nota Organisasi resmi lengkap.', granularity: 'template' });
  const rTemplate = classifySemanticDiff({ field: `pattern:${templateId}`, before: 'Nota Organisasi resmi lengkap.', after: 'Nota Organisasi resmi direvisi.', editKind: 'edit', isPatternField: true });
  check('a template_pattern citation classifies as category "template"', rTemplate.category === 'template');

  const patternId = makePatternItem('pat-1', 'sentence_pattern', { template: 'Bersama ini kami sampaikan permohonan.', granularity: 'sentence' });
  const rPattern = classifySemanticDiff({ field: `pattern:${patternId}`, before: 'Bersama ini kami sampaikan permohonan.', after: 'Bersama ini kami ajukan permohonan.', editKind: 'edit', isPatternField: true });
  check('a sentence_pattern citation classifies as category "pattern" (not "template")', rPattern.category === 'pattern');
}

console.log('\n[an unresolvable pattern citation still classifies honestly, never throws]');
{
  const r = classifySemanticDiff({ field: 'pattern:knowledge:nor:does-not-exist:1', before: 'Teks lama.', after: 'Teks baru direvisi total.', editKind: 'edit', isPatternField: true });
  check('falls back to category "pattern" (never crashes, never "unresolved")', r.category === 'pattern');
}

console.log('\n[identical before/after — no diff to classify]');
{
  const r = classifySemanticDiff({ field: 'quantity', before: '20 kursi', after: '20 kursi', editKind: 'edit', isPatternField: false });
  check('diffNature is null for a true no-op', r.diffNature === null);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
