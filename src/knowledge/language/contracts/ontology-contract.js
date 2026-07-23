/* ============================================================
   ONTOLOGY-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 4-7)

   PURPOSE: fix the payload shape for `kind: 'ontology'` — the one asset per
   `domainType` that answers "what kind of thing is this document, and how
   does it fit the organization." Evidenced by NOR-Specification.md §D
   (Business Ontology) — see Knowledge-Asset-Specification.md §3.3 for the
   worked example.

   RESPONSIBILITY: typedef + structural validator only.

   DEPENDENCIES: none.

   NON-GOALS: `approvalChainRef` is a bare KnowledgeItem id reference, never
   an embedded copy of that item's payload — this file does not resolve or
   validate the reference exists; that is a consumer's (e.g.
   knowledge-service.js#getKnowledge) concern.

   FUTURE EVOLUTION: js/v2/reasoning/knowledge-gap-engine.js reads a
   domainType's Approved Ontology to know what "complete" looks like for
   that domain (stakeholders/dependencies present) — this shape should not
   need to change to accommodate that.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} OntologyStakeholder
 * @property {string} role
 * @property {string} function
 */

/**
 * @typedef {Object} OntologyEntry
 * @property {string} intent               - one sentence — what this document type accomplishes
 * @property {string} trigger               - what real-world condition causes one to be created
 * @property {OntologyStakeholder[]} stakeholders
 * @property {string|null} [approvalChainRef] - KnowledgeItem id of a kind:'approval_chain' asset
 * @property {string} [supportingDocuments]
 * @property {string} [budgetImpact]
 * @property {string[]} [dependencies]
 */

export function isOntologyEntry(p) {
  return !!p && typeof p === 'object'
    && typeof p.intent === 'string' && p.intent.length > 0
    && typeof p.trigger === 'string' && p.trigger.length > 0
    && Array.isArray(p.stakeholders)
    && p.stakeholders.every((s) => s && typeof s.role === 'string' && typeof s.function === 'string');
}
