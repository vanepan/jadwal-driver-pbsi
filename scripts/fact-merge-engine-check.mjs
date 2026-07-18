/* fact-merge-engine-check.mjs — Node check for V2, Part A2 (Parser
   Versioning + Background Re-Analysis)'s ONE genuinely new piece of
   business logic: the field-level conflict-resolution policy
   (js/v2/knowledge/datasets/import-session/fact-merge-engine.js). Proves
   the hard rule the user's own requirements named explicitly: never
   duplicate/discard, never overwrite a human-set field, only enrich when
   there's strictly better evidence.
   Run: node scripts/fact-merge-engine-check.mjs   (exit 0 = pass) */

import { mergeExtractedFacts } from '../js/v2/knowledge/datasets/import-session/fact-merge-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const freshExtraction = (over = {}) => ({
  value: 'Realisasi Petty Cash', documentNumber: '113/Nota Organisasi/Sarpras/V/2026', senderOrigin: 'Plt. Kabid Sarpras',
  confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 1 },
  ...over,
});

console.log('\n[empty-field fill — a pre-Mammoth session (no factsProvenance at all) gets fully populated]');
{
  const r = mergeExtractedFacts({ value: '', documentNumber: '', senderOrigin: '', notes: '' }, null, freshExtraction());
  check('all three fields filled from the fresh extraction', r.merged.value === 'Realisasi Petty Cash' && r.merged.documentNumber === '113/Nota Organisasi/Sarpras/V/2026' && r.merged.senderOrigin === 'Plt. Kabid Sarpras');
  check('changed is true', r.changed === true);
  check('changedFields lists exactly the three mergeable fields', r.changedFields.sort().join(',') === 'documentNumber,senderOrigin,value');
  check('notes is preserved untouched (never a merge target)', r.merged.notes === '');
}

console.log('\n[higher-confidence overwrite — auto-extraction v1 upgraded by v2-equivalent evidence]');
{
  const existing = { value: 'x', documentNumber: '', senderOrigin: 'Guess', notes: '' };
  const provenance = { source: 'auto-extraction', confidencePerField: { value: 0.4, senderOrigin: 0.3 } };
  const r = mergeExtractedFacts(existing, provenance, freshExtraction({ confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 1 } }));
  check('a low-confidence auto-extracted value is overwritten by strictly higher confidence', r.merged.value === 'Realisasi Petty Cash');
  check('a low-confidence auto-extracted senderOrigin is overwritten by strictly higher confidence', r.merged.senderOrigin === 'Plt. Kabid Sarpras');
  check('the empty documentNumber is filled too', r.merged.documentNumber === '113/Nota Organisasi/Sarpras/V/2026');
}

console.log('\n[equal-or-lower confidence — honest no-op, never a fabricated "improvement"]');
{
  const existing = { value: 'Already correct', documentNumber: '113/Nota Organisasi/Sarpras/V/2026', senderOrigin: 'Plt. Kabid Sarpras', notes: '' };
  const provenance = { source: 'auto-extraction', confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 1 } };
  const r = mergeExtractedFacts(existing, provenance, freshExtraction());
  check('nothing changes when the new extraction is no better than what is already recorded', r.changed === false);
  check('every field is preserved exactly as it was', r.merged.value === 'Already correct' && r.merged.documentNumber === '113/Nota Organisasi/Sarpras/V/2026' && r.merged.senderOrigin === 'Plt. Kabid Sarpras');
}

console.log('\n[the ONE hard rule — a human-set field is NEVER overwritten, no matter the new confidence]');
{
  const existing = { value: 'Manusia mengetik ini dengan sengaja', documentNumber: '', senderOrigin: '', notes: 'Catatan manusia' };
  const provenance = { source: 'human', confidencePerField: null };
  const r = mergeExtractedFacts(existing, provenance, freshExtraction());
  check('a human-typed value is preserved verbatim even though extraction found a different one at confidence 1', r.merged.value === 'Manusia mengetik ini dengan sengaja');
  check('value is NOT in changedFields', !r.changedFields.includes('value'));
  check('an empty field on an otherwise-human session can still be filled (the rule protects SET fields, not the whole record)', r.merged.documentNumber === '113/Nota Organisasi/Sarpras/V/2026' && r.changedFields.includes('documentNumber'));
}

console.log('\n[never invents — a field the new extraction also could not find stays exactly as-is]');
{
  const existing = { value: '', documentNumber: 'DOC-1', senderOrigin: '', notes: '' };
  const r = mergeExtractedFacts(existing, { source: 'human', confidencePerField: null }, freshExtraction({ senderOrigin: '', confidencePerField: { value: 1, documentNumber: 1, senderOrigin: 0 } }));
  check('a field neither the old nor the new run found stays empty, never fabricated', r.merged.senderOrigin === '');
  check('senderOrigin is not reported as changed', !r.changedFields.includes('senderOrigin'));
}

console.log('\n[determinism]');
{
  const a = mergeExtractedFacts({ value: '', documentNumber: '', senderOrigin: '', notes: '' }, null, freshExtraction());
  const b = mergeExtractedFacts({ value: '', documentNumber: '', senderOrigin: '', notes: '' }, null, freshExtraction());
  check('same input -> identical result', JSON.stringify(a) === JSON.stringify(b));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
