/* ============================================================
   EXAMPLES.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: documentation-only. One frozen example payload per language
   contract, so a future connector author has a concrete instance to copy
   rather than inferring shape from JSDoc alone.

   RESPONSIBILITY: data only. Every example uses obviously-fake, clearly
   illustrative content — none of it is real PBSI vocabulary or a real NOR
   fact, precisely because no connector exists yet to have learned one.

   DEPENDENCIES: none.

   NON-GOALS: never imported by runtime code, never asserted against by
   anything other than a future test file. Not a fixture for a real test
   suite yet (Phase 3.5 has none) — just a readable reference.

   FUTURE EVOLUTION: Phase 4+ tests for each contract's validator function
   can import these as known-good fixtures.
   ============================================================ */

'use strict';

export const EXAMPLE_VOCABULARY_ENTRY = Object.freeze({
  term: 'Nota Organisasi',
  definition: 'A short internal memo authorizing an operational expense.',
  synonyms: Object.freeze([Object.freeze({ term: 'NO', weight: 0.9 })]),
  aliases: Object.freeze([Object.freeze({ term: 'Nota Ops', reason: 'common shorthand' })]),
});

export const EXAMPLE_TAG = Object.freeze({ label: 'finance' });

export const EXAMPLE_CATEGORY = Object.freeze({ id: 'ops-docs', label: 'Operational Documents' });

export const EXAMPLE_PATTERN_ENTRY = Object.freeze({
  template: 'Sehubungan dengan {{activityName}}, dengan ini kami mengajukan {{requestType}}.',
  slots: Object.freeze([
    Object.freeze({ name: 'activityName', type: 'string' }),
    Object.freeze({ name: 'requestType', type: 'string' }),
  ]),
  granularity: 'sentence',
});

export const EXAMPLE_KNOWLEDGE_SOURCE = Object.freeze({
  id: 'nor-template-code-v3',
  sourceType: 'templates',
  label: 'NOR pdfmake template (js/docs/templates/nor.js)',
  uri: 'js/docs/templates/nor.js',
});

export const EXAMPLE_REFERENCE = Object.freeze({
  targetId: 'nor-template-code-v3',
  targetKind: 'knowledge_source',
  note: 'this pattern was mined from the NOR template code',
});

export const EXAMPLE_METADATA = Object.freeze({ ingestionBatch: 'example-batch-1', reviewedByHuman: false });

export const EXAMPLE_POLICY_ENTRY = Object.freeze({
  policyId: 'ambulance-detection',
  description: 'Vehicles tagged as ambulance are excluded from standard capacity scoring.',
  configRef: 'js/config/dispatch-policy-config.js',
});

export const EXAMPLE_STATISTIC_ENTRY = Object.freeze({
  label: 'Average NOR line count',
  value: 14,
  unit: 'lines',
  computedAt: '2026-01-01T00:00:00.000Z',
});
