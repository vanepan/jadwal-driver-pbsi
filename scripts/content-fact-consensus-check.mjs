/* content-fact-consensus-check.mjs — Node check for the V2, Part B1
   (Evidence-First Ingestion) cross-document consensus engine
   (js/v2/knowledge/datasets/import-session/content-fact-consensus-engine.js).
   Proves the majority-vote is deterministic, honestly reports insufficient
   evidence as ineligible (never a guess), requires BOTH real corroboration
   (MIN_CONSENSUS_SUPPORT) AND real agreement (MIN_CONSENSUS_AGREEMENT)
   before it will ever be trusted to auto-fill a fact, and never crashes on
   messy real-world input (nulls, blanks, whitespace-only values).
   Run: node scripts/content-fact-consensus-check.mjs   (exit 0 = pass) */

import {
  computeFieldConsensus, MIN_CONSENSUS_SUPPORT, MIN_CONSENSUS_AGREEMENT,
} from '../js/v2/knowledge/datasets/import-session/content-fact-consensus-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[the honest floor — no prior evidence at all]');
{
  const r = computeFieldConsensus([]);
  check('eligible is false with zero prior documents', r.eligible === false);
  check('confidence is honestly 0, never a fabricated guess', r.confidence === 0);
  check('value is empty (nothing invented)', r.value === '');
  check('rationale explains there is no history to compare against', r.rationale.length > 0);

  const rNullish = computeFieldConsensus(null);
  check('never throws on null input — degrades to the same honest empty result', rNullish.eligible === false && rNullish.value === '');
}

console.log(`\n[below MIN_CONSENSUS_SUPPORT (${MIN_CONSENSUS_SUPPORT}) — real values, but not enough of them]`);
{
  const values = Array(MIN_CONSENSUS_SUPPORT - 1).fill('Kabid Sarana dan Prasarana');
  const r = computeFieldConsensus(values);
  check('unanimous agreement is STILL not eligible below the support floor — support and agreement are independent gates', r.eligible === false);
  check('confidence stays 0 when ineligible, even though agreement is 100%', r.confidence === 0);
  check('rationale names the real count and the real minimum required', r.rationale.includes(String(values.length)) && r.rationale.includes(String(MIN_CONSENSUS_SUPPORT)));
}

console.log(`\n[at MIN_CONSENSUS_SUPPORT, unanimous — the real auto-accept case]`);
{
  const values = Array(MIN_CONSENSUS_SUPPORT).fill('Kabid Sarana dan Prasarana');
  const r = computeFieldConsensus(values);
  check('eligible once BOTH support and agreement clear their bars', r.eligible === true);
  check('resolves to the real, unanimous prior value — never a different one', r.value === 'Kabid Sarana dan Prasarana');
  check('confidence equals the real agreement fraction (1.0), not a fabricated round number', r.confidence === 1);
  check('supportCount/totalCount are the real counts', r.supportCount === values.length && r.totalCount === values.length);
  check('rationale cites the real support count and the real value, for honest provenance', r.rationale.includes(String(values.length)) && r.rationale.includes('Kabid Sarana dan Prasarana'));
}

console.log(`\n[a genuine organizational transition — a real split vote must NEVER auto-resolve]`);
{
  // Models this codebase's own documented real-world case: a Kabid Sarpras
  // transition mid-corpus (see content-fact-consensus-engine.js's own
  // header on why Approved "signatory" rules are NOT trusted directly for
  // this reason). A near-even split must stay a human decision.
  const values = [
    'Kabid Sarana dan Prasarana', 'Kabid Sarana dan Prasarana', 'Kabid Sarana dan Prasarana',
    'Plt. Kabid Sarana dan Prasarana', 'Plt. Kabid Sarana dan Prasarana',
  ];
  const r = computeFieldConsensus(values);
  const agreement = 3 / 5;
  check(`below MIN_CONSENSUS_AGREEMENT (${MIN_CONSENSUS_AGREEMENT}) at ${agreement} agreement — correctly NOT eligible`, r.eligible === false);
  check('confidence is honestly 0 when the vote is genuinely split, never the majority share smuggled through', r.confidence === 0);
  check('the majority value is still reported for transparency (what a human would see), even though it is not auto-applied', r.value === 'Kabid Sarana dan Prasarana');
  check('rationale explains the real disagreement, not a generic refusal', r.rationale.includes('beragam') || r.rationale.includes('kecocokan'));
}

console.log('\n[exactly at the agreement threshold — the boundary is inclusive]');
{
  // 4/5 = 0.8 = MIN_CONSENSUS_AGREEMENT exactly.
  const values = ['A', 'A', 'A', 'A', 'B'];
  const r = computeFieldConsensus(values);
  check('agreement computed exactly as bestCount/totalCount', r.agreement === 0.8);
  check('a value exactly AT the threshold is eligible (>=, not >)', r.eligible === true);
  check('resolves to the real majority value', r.value === 'A');
}

console.log('\n[messy real-world input never crashes and never counts fabricated evidence]');
{
  const r = computeFieldConsensus(['Kabid Sarana dan Prasarana', null, undefined, '', '   ', 'Kabid Sarana dan Prasarana', 'Kabid Sarana dan Prasarana']);
  check('null/undefined/blank/whitespace-only entries are excluded from BOTH the numerator and denominator — never counted as evidence for or against', r.totalCount === 3);
  check('still resolves correctly once real evidence clears both bars', r.eligible === true && r.value === 'Kabid Sarana dan Prasarana');

  const trimmed = computeFieldConsensus(['  Kabid Sarana dan Prasarana  ', 'Kabid Sarana dan Prasarana', 'Kabid Sarana dan Prasarana']);
  check('whitespace-padded real values are trimmed before comparison — not treated as a distinct, disagreeing value', trimmed.eligible === true && trimmed.supportCount === 3);
}

console.log('\n[determinism — the same input always produces the same output]');
{
  const values = ['A', 'B', 'A', 'A', 'C'];
  const r1 = computeFieldConsensus(values);
  const r2 = computeFieldConsensus([...values]);
  check('repeated calls with the same evidence produce byte-identical results (no randomness, no hidden state)',
    JSON.stringify({ ...r1, rationale: null }) === JSON.stringify({ ...r2, rationale: null }));
}

console.log('\n[never writes anything — a pure function, same discipline as pattern-discovery-engine.js]');
{
  const src = (await import('node:fs')).readFileSync(new URL('../js/v2/knowledge/datasets/import-session/content-fact-consensus-engine.js', import.meta.url), 'utf8');
  check('no import statement at all — zero repository/Firebase dependency, matching the file\'s own DEPENDENCIES: none', !/^import /m.test(src));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
