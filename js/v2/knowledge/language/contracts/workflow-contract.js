/* ============================================================
   WORKFLOW-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 4-7)

   PURPOSE: fix the payload shape for `kind: 'workflow'` — the ORDERED human
   process a document moves through, distinct from `kind: 'approval_chain'`
   (already registered, kind-registry.js), which captures only the static
   list of required signers, never the sequence or what each step means.
   Evidenced by NOR-Specification.md §D.4 — see
   Knowledge-Asset-Specification.md §3.2 for the worked example.

   RESPONSIBILITY: typedef + structural validator only.

   DEPENDENCIES: none.

   NON-GOALS: does not enforce or execute a workflow — this is a recorded
   organizational fact for a Reasoning/Explainability consumer to read, not
   a state machine (contrast with knowledge/contracts/lifecycle-contract.js,
   which IS an enforced state machine, for a different concern).

   FUTURE EVOLUTION: js/v2/reasoning/rule-applicability-engine.js may read
   Approved `workflow` assets to explain a Recommendation's procedural
   context; this shape should not need to change to accommodate that.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} WorkflowStep
 * @property {number} order         - 1-based
 * @property {string} actor         - a ROLE, never a personal name (e.g. 'Staf Sarana dan Prasarana')
 * @property {string} action        - e.g. 'compile-ledger' | 'submit' | 'countersign' | 'disburse'
 * @property {string} [evidenceOfCompletion] - honest note on how this step's completion was/would be observed
 */

/**
 * @typedef {Object} WorkflowEntry
 * @property {string} name          - e.g. 'nor-approval-sequence'
 * @property {WorkflowStep[]} steps
 * @property {string[]} [openQuestions] - carried verbatim from the source spec's own Unknown markers, never silently resolved
 */

export function isWorkflowEntry(p) {
  return !!p && typeof p === 'object'
    && typeof p.name === 'string' && p.name.length > 0
    && Array.isArray(p.steps) && p.steps.length > 0
    && p.steps.every((s) => s && typeof s === 'object'
      && typeof s.order === 'number'
      && typeof s.actor === 'string' && s.actor.length > 0
      && typeof s.action === 'string' && s.action.length > 0);
}
