/* knowledge-asset-kinds-check.mjs — Phase 4-7, Part 1 ("Knowledge
   Acquisition Engine").

   Verifies the ONLY claim Knowledge-Repository-Adaptation.md made about
   this extension: five new `kind` registrations plus five new payload
   contracts require ZERO repository code changes.

   1. REGISTRY. The five new kinds are registered, alongside (not instead
      of) every kind that existed before this phase.
   2. CONTRACTS. Each new payload shape's structural validator accepts its
      own example (knowledge/language/examples.js) and rejects an
      obviously-malformed object — including organizational-reasoning-
      contract.js's deliberately STRICTER empty-evidenceRefs rejection.
   3. REPOSITORY COMPATIBILITY (behavioural). A real KnowledgeItem of a
      brand-new kind can be created, listed, filtered, searched and
      lifecycle-transitioned through the EXISTING, unmodified
      knowledge-service.js / memory-repository.js — proving the "payload
      stays opaque to the core" promise held under a real, new-kind test.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/knowledge-asset-kinds-check.mjs   (exit 0 = pass) */

import { hasKind, listKinds } from '../js/v2/knowledge/registry/kind-registry.js';
import { isRenderingRuleEntry } from '../js/v2/knowledge/language/contracts/rendering-rule-contract.js';
import { isWorkflowEntry } from '../js/v2/knowledge/language/contracts/workflow-contract.js';
import { isOntologyEntry } from '../js/v2/knowledge/language/contracts/ontology-contract.js';
import { isOrganizationalReasoningEntry } from '../js/v2/knowledge/language/contracts/organizational-reasoning-contract.js';
import { isQuestionTreeEntry } from '../js/v2/knowledge/language/contracts/question-tree-contract.js';
import {
  EXAMPLE_RENDERING_RULE_ENTRY, EXAMPLE_WORKFLOW_ENTRY, EXAMPLE_ONTOLOGY_ENTRY,
  EXAMPLE_ORGANIZATIONAL_REASONING_ENTRY, EXAMPLE_QUESTION_TREE_ENTRY,
} from '../js/v2/knowledge/language/examples.js';
import {
  setKnowledgeBackend, ingest, listKnowledge, promoteKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[Part 1 — five new kinds are registered, additively]');
{
  const NEW_KINDS = ['rendering_rule', 'workflow', 'ontology', 'organizational_reasoning', 'question_tree'];
  for (const k of NEW_KINDS) check(`hasKind('${k}')`, hasKind(k));

  const PRE_EXISTING_KINDS = [
    'vocabulary', 'terminology', 'structure', 'writing_style', 'sentence_pattern',
    'paragraph_pattern', 'template_pattern', 'relationship', 'rule', 'correction',
    'statistic', 'policy', 'recipient', 'signatory', 'cc', 'approval_chain',
    'attachment', 'department', 'document_category', 'document_fact',
  ];
  check('every kind that existed before this phase is STILL registered (purely additive)',
    PRE_EXISTING_KINDS.every((k) => hasKind(k)));
  check('listKinds() grew by exactly 5', listKinds().length === PRE_EXISTING_KINDS.length + NEW_KINDS.length);
}

console.log('\n[Part 1 — each new payload shape validates its own example, rejects malformed input]');
{
  check('isRenderingRuleEntry accepts EXAMPLE_RENDERING_RULE_ENTRY', isRenderingRuleEntry(EXAMPLE_RENDERING_RULE_ENTRY));
  check('isRenderingRuleEntry rejects {}', !isRenderingRuleEntry({}));

  check('isWorkflowEntry accepts EXAMPLE_WORKFLOW_ENTRY', isWorkflowEntry(EXAMPLE_WORKFLOW_ENTRY));
  check('isWorkflowEntry rejects a step missing "actor"', !isWorkflowEntry({ name: 'x', steps: [{ order: 1, action: 'y' }] }));

  check('isOntologyEntry accepts EXAMPLE_ONTOLOGY_ENTRY', isOntologyEntry(EXAMPLE_ONTOLOGY_ENTRY));
  check('isOntologyEntry rejects a stakeholder missing "function"', !isOntologyEntry({ intent: 'x', trigger: 'y', stakeholders: [{ role: 'z' }] }));

  check('isOrganizationalReasoningEntry accepts EXAMPLE_ORGANIZATIONAL_REASONING_ENTRY', isOrganizationalReasoningEntry(EXAMPLE_ORGANIZATIONAL_REASONING_ENTRY));
  check('isOrganizationalReasoningEntry REJECTS an empty evidenceRefs (the deliberately stricter validator)',
    !isOrganizationalReasoningEntry({ claim: 'x', evidenceRefs: [] }));
  check('isOrganizationalReasoningEntry rejects a claim with NO evidenceRefs field at all',
    !isOrganizationalReasoningEntry({ claim: 'x' }));

  check('isQuestionTreeEntry accepts EXAMPLE_QUESTION_TREE_ENTRY', isQuestionTreeEntry(EXAMPLE_QUESTION_TREE_ENTRY));
  check('isQuestionTreeEntry rejects an unrecognized status', !isQuestionTreeEntry({ question: 'x', raisedBy: 'y', status: 'maybe' }));
}

console.log('\n[Part 1 — the EXISTING, unmodified repository accepts a new-kind item with zero code changes]');
{
  setKnowledgeBackend('memory');
  const id = generateKnowledgeId({ domainType: 'nor', sourceType: 'manual-file', sourceRef: 'kinds-check-1' });
  const now = new Date().toISOString();
  const item = Object.freeze({
    id, version: 1, domainType: 'nor', sourceType: 'manual-file', kind: 'organizational_reasoning',
    payload: EXAMPLE_ORGANIZATIONAL_REASONING_ENTRY, confidence: 0.6, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'manual-file', sourceRef: 'kinds-check-1', capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });

  const ingested = ingest(item);
  check('ingest() accepts a Draft item of the new kind "organizational_reasoning"', ingested.ok && ingested.op === 'create');

  const listed = listKnowledge({ domainType: 'nor', kind: 'organizational_reasoning' });
  check('listKnowledge({kind}) filters correctly on the new kind', listed.ok && listed.data.some((i) => i.id === id));

  const promoted = promoteKnowledge(id, {
    approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Verified against real NOR evidence.',
  });
  check('promoteKnowledge() (the SAME, unmodified human-gated workflow) reaches Approved for the new kind',
    promoted.ok && promoted.data.lifecycleState === LIFECYCLE_STATE.APPROVED);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
