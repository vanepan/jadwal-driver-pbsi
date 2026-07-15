/* knowledge-gap-check.mjs — Phase 4-7, Part 3 ("Knowledge Gap Detection").

   A dedicated, progressive drive of detectKnowledgeGaps() proving all six
   named gap types (missing_entity, missing_approval, missing_context,
   missing_evidence, missing_business_constraint, missing_reasoning) fire
   when their real condition holds, and clear — one at a time, honestly —
   as real Approved Knowledge is added. Never a canned fixture: every step
   seeds a genuine KnowledgeItem through the SAME, unmodified
   knowledge-service.js the rest of the platform uses.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/knowledge-gap-check.mjs   (exit 0 = pass) */

import {
  setKnowledgeBackend, ingest, promoteKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { detectKnowledgeGaps } from '../js/v2/reasoning/services/reasoning-service.js';
import { GAP_TYPE } from '../js/v2/reasoning/contracts/knowledge-gap-contract.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

setKnowledgeBackend('memory');
const DOMAIN = 'request';

function seedApproved({ kind, payload, sourceRef, id }) {
  const now = new Date().toISOString();
  const resolvedId = id || generateKnowledgeId({ domainType: DOMAIN, sourceType: 'manual-file', sourceRef });
  const item = Object.freeze({
    id: resolvedId, version: 1, domainType: DOMAIN, sourceType: 'manual-file', kind, payload, confidence: 0.8,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'manual-file', sourceRef: sourceRef || resolvedId, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  const ingested = ingest(item);
  if (!ingested.ok) throw new Error(`seed failed for ${resolvedId}: ${JSON.stringify(ingested.error)}`);
  const promoted = promoteKnowledge(resolvedId, { approverId: 'evan', decidedAt: now, preferenceRationale: 'seeded for knowledge-gap-check.mjs' });
  if (!promoted.ok) throw new Error(`promote failed for ${resolvedId}: ${JSON.stringify(promoted.error)}`);
  return promoted.data.id;
}

function gapTypesOf(gaps) { return gaps.map((g) => g.gapType).sort(); }

console.log('\n[Step 0 — no Ontology at all: exactly one CRITICAL missing_context gap]');
{
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('exactly one gap', gaps.length === 1);
  check('gapType is missing_context', gaps[0].gapType === GAP_TYPE.MISSING_CONTEXT);
  check('priority is critical', gaps[0].priority === 'critical');
}

const APPROVAL_CHAIN_ID = generateKnowledgeId({ domainType: DOMAIN, sourceType: 'manual-file', sourceRef: 'the-chain' });

console.log('\n[Step 1 — seed an Ontology naming 2 stakeholders + an unresolved approvalChainRef: 5 gaps]');
{
  seedApproved({
    kind: 'ontology',
    payload: {
      intent: 'Request organizational approval for an action.',
      trigger: 'A staff member needs authorization before proceeding.',
      stakeholders: [
        { role: 'Requester', function: 'submits the request' },
        { role: 'Approver', function: 'approves the request' },
      ],
      approvalChainRef: APPROVAL_CHAIN_ID,
      dependencies: [],
    },
    sourceRef: 'the-ontology',
  });
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('5 gaps: 2x missing_entity + missing_approval + missing_business_constraint + missing_reasoning',
    gaps.length === 5);
  check('missing_entity fired for BOTH "Requester" and "Approver"',
    gaps.filter((g) => g.gapType === GAP_TYPE.MISSING_ENTITY).map((g) => g.field).sort().join(',') === 'Approver,Requester');
  check('missing_approval fired (ref points to a non-existent item)',
    gaps.some((g) => g.gapType === GAP_TYPE.MISSING_APPROVAL));
  check('missing_business_constraint fired (no rule/policy yet)',
    gaps.some((g) => g.gapType === GAP_TYPE.MISSING_BUSINESS_CONSTRAINT));
  check('missing_reasoning fired (no organizational_reasoning yet)',
    gaps.some((g) => g.gapType === GAP_TYPE.MISSING_REASONING));
  check('missing_context did NOT fire (an Ontology now exists)',
    !gaps.some((g) => g.gapType === GAP_TYPE.MISSING_CONTEXT));
}

console.log('\n[Step 2 — back "Requester" with a real signatory: missing_entity for Requester clears]');
{
  seedApproved({ kind: 'signatory', payload: { role: 'Requester', name: 'Someone' }, sourceRef: 'requester-signatory' });
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('4 gaps now', gaps.length === 4);
  check('only "Approver" still missing_entity', gapTypesOf(gaps).filter((t) => t === GAP_TYPE.MISSING_ENTITY).length === 1
    && gaps.find((g) => g.gapType === GAP_TYPE.MISSING_ENTITY).field === 'Approver');
}

console.log('\n[Step 3 — resolve the approval_chain reference for real: missing_approval clears]');
{
  seedApproved({ kind: 'approval_chain', payload: { steps: ['Requester', 'Approver'] }, id: APPROVAL_CHAIN_ID, sourceRef: 'the-chain' });
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('3 gaps now', gaps.length === 3);
  check('missing_approval no longer present', !gaps.some((g) => g.gapType === GAP_TYPE.MISSING_APPROVAL));
}

console.log('\n[Step 4 — add a real rule: missing_business_constraint clears]');
{
  seedApproved({ kind: 'rule', payload: { statement: 'A request must name a specific approver.' }, sourceRef: 'the-rule' });
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('2 gaps now', gaps.length === 2);
  check('missing_business_constraint no longer present', !gaps.some((g) => g.gapType === GAP_TYPE.MISSING_BUSINESS_CONSTRAINT));
}

console.log('\n[Step 5 — add a thinly-evidenced organizational_reasoning asset: missing_reasoning clears, missing_evidence appears]');
{
  const reasoningId = seedApproved({
    kind: 'organizational_reasoning',
    payload: { claim: 'Requests exist to create an auditable authorization trail.', evidenceRefs: ['some-doc-1'], status: 'inferred' },
    sourceRef: 'the-reasoning',
  });
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('still 2 gaps (missing_reasoning replaced 1-for-1 by missing_evidence)', gaps.length === 2);
  check('missing_reasoning no longer present', !gaps.some((g) => g.gapType === GAP_TYPE.MISSING_REASONING));
  check('missing_evidence now present, pointing at the thinly-evidenced asset',
    gaps.some((g) => g.gapType === GAP_TYPE.MISSING_EVIDENCE && g.field === reasoningId));
}

console.log('\n[Step 6 — back "Approver" too: only missing_evidence remains]');
{
  seedApproved({ kind: 'recipient', payload: { role: 'Approver', name: 'Someone Else' }, sourceRef: 'approver-recipient' });
  const gaps = detectKnowledgeGaps(DOMAIN);
  check('exactly 1 gap remains', gaps.length === 1);
  check('it is missing_evidence', gaps[0].gapType === GAP_TYPE.MISSING_EVIDENCE);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
