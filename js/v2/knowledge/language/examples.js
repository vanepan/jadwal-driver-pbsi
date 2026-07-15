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

/* ── Phase 4-7 (Organizational Reasoning) additions ──────────────────
   Five new shapes NOR-Specification.md's real findings proved missing —
   see Knowledge-Asset-Specification.md §3. Every example below cites the
   real report section it was drawn from; none is invented illustration. */

export const EXAMPLE_RENDERING_RULE_ENTRY = Object.freeze({
  property: 'pageBreak',
  scope: 'ledgerSection',
  rule: 'The itemized ledger always starts on a new page, unconditionally, regardless of how short the cover letter is.',
  observedIn: Object.freeze(['NOR-Specification.md §A.3', 'js/docs/templates/nor.js (pageBreak: "before")']),
});

export const EXAMPLE_WORKFLOW_ENTRY = Object.freeze({
  name: 'nor-approval-sequence',
  steps: Object.freeze([
    Object.freeze({ order: 1, actor: 'Staf Sarana dan Prasarana', action: 'compile-ledger', evidenceOfCompletion: 'printed name, "Dibuat Oleh"' }),
    Object.freeze({ order: 2, actor: 'Plt. Kabid Sarpras', action: 'submit-and-approve-recap', evidenceOfCompletion: 'printed name, both pages' }),
    Object.freeze({ order: 3, actor: 'Wakil Ketua Umum III + Sekretaris Jenderal', action: 'countersign', evidenceOfCompletion: 'ink signature (observed in one real sample)' }),
    Object.freeze({ order: 4, actor: 'Wakil Bendahara', action: 'disburse', evidenceOfCompletion: 'unknown — no ink observed in either sample' }),
  ]),
  openQuestions: Object.freeze(['Whether disbursement is confirmed by a separate bank record rather than this document (NOR-Specification.md §D.4)']),
});

export const EXAMPLE_ONTOLOGY_ENTRY = Object.freeze({
  intent: 'Report actual expenditure of a discretionary operating float, and formally request its replenishment.',
  trigger: 'The operating float has been substantially spent down and needs replenishing.',
  stakeholders: Object.freeze([
    Object.freeze({ role: 'Plt. Kabid Sarana dan Prasarana', function: 'Originator/submitter' }),
    Object.freeze({ role: 'Wakil Ketua Umum III', function: 'Approver' }),
  ]),
  approvalChainRef: null,
  supportingDocuments: 'ledger (same file, page 2+)',
  budgetImpact: 'reports cycle-level realized spend only; never year-to-date or against-annual-budget',
  dependencies: Object.freeze(['an active Petty Cash cycle', 'already-recorded, available-status expenses']),
});

export const EXAMPLE_ORGANIZATIONAL_REASONING_ENTRY = Object.freeze({
  claim: 'The NOR exists to convert a month of small, individually-immaterial petty-cash movements into one auditable, three-signatory instrument — a standard cash-float control pattern, not bureaucratic formality for its own sake.',
  evidenceRefs: Object.freeze(['nor:document:113', 'nor:document:120']),
  ruledOutAlternatives: Object.freeze([]),
  confidenceBasis: 'Consistent with observed ~99.9% float utilization in both real samples and the fixed three-role sign-off chain.',
  status: 'inferred',
});

export const EXAMPLE_QUESTION_TREE_ENTRY = Object.freeze({
  question: 'Why is the float sized at exactly Rp 15.000.000?',
  raisedBy: 'document-structural-analysis',
  status: 'open',
  answerRef: null,
});
