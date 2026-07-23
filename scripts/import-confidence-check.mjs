/* import-confidence-check.mjs — Node check for the Phase 2 Follow-up
   deterministic confidence engine (js/v2/knowledge/datasets/import-session/
   import-confidence-engine.js). Proves the engine is: deterministic (same
   input -> same score), never constant across differing inputs, fully
   explainable (every signal carries a rationale), honest (the two gap
   signals are always reported unavailable, never fabricated), and correctly
   uses the availability rule (absence of evidence is neutral, not a
   punitive zero). Pure — no Firebase, no repository, no AI.
   Run: node scripts/import-confidence-check.mjs   (exit 0 = pass) */

import { computeImportConfidence } from '../src/knowledge/datasets/import-session/import-confidence-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

// A rich, high-evidence JSON: filename matched, all fields resolved,
// duplicate, parseable content with expected keys, historical precedent.
const rich = {
  filenameMatch: { domainType: 0.9, datasetType: 0.8, knowledgeKind: 0.7 },
  fieldResolution: { domainType: 1, datasetType: 1, knowledgeKind: 1 },
  isDuplicate: true,
  kind: 'json',
  parsedContent: { value: 'real', documentNumber: 'DOC-1' },
  historicalSupport: 5,
  approvedOverrideCount: 0,
};
// A bare scoped PDF: no filename match, only-default classification, unique,
// no content, no history.
const bare = {
  filenameMatch: { domainType: 0, datasetType: 0, knowledgeKind: 0 },
  fieldResolution: { domainType: 1, datasetType: 0.65, knowledgeKind: 0.65 },
  isDuplicate: false,
  kind: 'pdf',
  parsedContent: null,
  historicalSupport: 0,
  approvedOverrideCount: 0,
};

console.log('\n[determinism]');
const a = computeImportConfidence(rich);
const b = computeImportConfidence(rich);
check('same input -> identical score (deterministic)', a.score === b.score);
check('same input -> identical signal array length', a.signals.length === b.signals.length);

console.log('\n[never constant]');
check('a rich JSON and a bare PDF produce DIFFERENT scores', computeImportConfidence(rich).score !== computeImportConfidence(bare).score);
check('flipping duplicate on the same file changes the score', computeImportConfidence(bare).score !== computeImportConfidence({ ...bare, isDuplicate: true }).score);
check('a strong rich file scores high, a bare file scores lower', computeImportConfidence(rich).score > computeImportConfidence(bare).score);

console.log('\n[byte-identical duplicate is a strong positive signal]');
const uniquePdf = computeImportConfidence(bare);
const dupPdf = computeImportConfidence({ ...bare, isDuplicate: true });
check('a confirmed duplicate scores strictly higher than the same file as a unique upload', dupPdf.score > uniquePdf.score);
check('the duplicateConfidence signal is available:true only when isDuplicate', dupPdf.signals.find((s) => s.id === 'duplicateConfidence').available === true && uniquePdf.signals.find((s) => s.id === 'duplicateConfidence').available === false);

console.log('\n[availability rule — absence of evidence is neutral, not a punitive zero]');
// A generic scoped PDF must still clear a reasonable bar off metadata alone
// (its unresolved filename/history signals are unavailable, not scored 0).
check('a sensible-default scoped PDF still scores >= 0.6 (defaults are honest, not penalized)', computeImportConfidence(bare).score >= 0.6);
check('filenameSimilarity is unavailable (not 0) when no token matched', computeImportConfidence(bare).signals.find((s) => s.id === 'filenameSimilarity').available === false);
check('historicalSimilarity is unavailable (not 0) when there is no precedent', computeImportConfidence(bare).signals.find((s) => s.id === 'historicalSimilarity').available === false);
check('documentStructure/contentFacts are unavailable for a PDF (no content parsed)', ['documentStructure', 'contentFacts'].every((id) => computeImportConfidence(bare).signals.find((s) => s.id === id).available === false));

console.log('\n[JSON-only signals genuinely engage for JSON]');
const jsonSig = computeImportConfidence(rich).signals;
check('documentStructure is available and scored for a parseable JSON', jsonSig.find((s) => s.id === 'documentStructure').available === true && jsonSig.find((s) => s.id === 'documentStructure').subScore > 0);
check('contentFacts is available and scored for a JSON with real content', jsonSig.find((s) => s.id === 'contentFacts').available === true && jsonSig.find((s) => s.id === 'contentFacts').subScore === 1);
check('an empty JSON object scores structure low but does not throw', computeImportConfidence({ ...rich, parsedContent: {} }).signals.find((s) => s.id === 'documentStructure').subScore < 0.8);

console.log('\n[explainability — every signal carries a rationale]');
check('every signal has a non-empty rationale string', computeImportConfidence(rich).signals.every((s) => typeof s.rationale === 'string' && s.rationale.length > 0));
check('every signal has an id and a label', computeImportConfidence(rich).signals.every((s) => s.id && s.label));

console.log('\n[honest gaps — never fabricated]');
const gapSignals = computeImportConfidence({ ...bare, approvedOverrideCount: 3 }).signals;
check('policyMatch is always available:false (no conflict engine) but reflects the real override count in its rationale', (() => { const s = gapSignals.find((x) => x.id === 'policyMatch'); return s.available === false && s.rationale.includes('3'); })());
check('knowledgeGraphEvidence is always available:false (item not in graph at upload)', gapSignals.find((s) => s.id === 'knowledgeGraphEvidence').available === false);
check('neither honest-gap signal ever contributes a numeric subScore', gapSignals.filter((s) => ['policyMatch', 'knowledgeGraphEvidence'].includes(s.id)).every((s) => s.subScore === null));

console.log('\n[level bands]');
check('a strong rich file lands at level "high"', computeImportConfidence(rich).level === 'high');
check('level is always one of low/medium/high', ['low', 'medium', 'high'].includes(computeImportConfidence(bare).level));

console.log('\n[V2, Part A1 — real .docx extraction evidence, not the old blanket PDF/DOCX gap]');
const docxRead = computeImportConfidence({ ...bare, kind: 'docx', contentExtraction: { ran: true, overallConfidence: 1 } });
const docxPartial = computeImportConfidence({ ...bare, kind: 'docx', contentExtraction: { ran: true, overallConfidence: 0.33 } });
const docxUnread = computeImportConfidence({ ...bare, kind: 'docx', contentExtraction: null });
check('a fully-extracted docx reports documentStructure/contentFacts as available (real evidence now exists)', ['documentStructure', 'contentFacts'].every((id) => docxRead.signals.find((s) => s.id === id).available === true));
check('a fully-extracted docx scores those two signals at full confidence', ['documentStructure', 'contentFacts'].every((id) => docxRead.signals.find((s) => s.id === id).subScore === 1));
check('a partially-extracted docx (1/3 fields) scores those two signals proportionally, not 0 or 1', ['documentStructure', 'contentFacts'].every((id) => { const s = docxPartial.signals.find((x) => x.id === id).subScore; return s > 0 && s < 1; }));
check('a docx that never got read (Mammoth failed) stays unavailable, same honest gap as PDF', ['documentStructure', 'contentFacts'].every((id) => docxUnread.signals.find((s) => s.id === id).available === false));
check('a PDF (still no reader at all) stays unavailable exactly as before this feature', ['documentStructure', 'contentFacts'].every((id) => computeImportConfidence(bare).signals.find((s) => s.id === id).available === false));
check('a fully-extracted docx scores strictly higher than the same file unread', docxRead.score > docxUnread.score);
check('an unread docx and a PDF score identically (both are the same honest "no content evidence" gap)', docxUnread.score === computeImportConfidence(bare).score);

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
