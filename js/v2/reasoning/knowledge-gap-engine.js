/* ============================================================
   KNOWLEDGE-GAP-ENGINE.JS — Organizational Reasoning Foundation
   (V2, Phase 4-7, Part 3)

   PURPOSE: "Knowledge Gap Detection" — a domainType-wide check for missing
   entities, missing approvals, missing context, missing evidence, missing
   business constraints and missing reasoning. A DIFFERENT concept from
   organizational-memory/gap-detection-engine.js's ArchiveGap (a missing
   NOR NUMBER in a numbering sequence, verified by direct read of that
   file) — this engine never touches ArchiveRecord or numbering-engine.js.
   See contracts/knowledge-gap-contract.js's header for why the shared
   vocabulary word is deliberate and the concepts are not conflated.

   HOW A GAP IS DETECTED. The domainType's own Approved `kind: 'ontology'`
   asset (knowledge/language/contracts/ontology-contract.js) is the
   checklist: it names the stakeholders, the approval-chain reference, and
   the dependencies a COMPLETE domain picture would have real Knowledge
   backing for. Every mismatch between what the Ontology names and what is
   actually Approved is one Gap — never an invented expectation the
   Ontology itself doesn't state. With no Approved Ontology at all, the
   engine reports exactly one gap (missing_context, critical) rather than
   guessing what "complete" should mean for an unrecorded domain.

   NORTH STAR GAP CLOSURE — OPTIONAL NOR TYPE SCOPING. See
   docs/NOR_TYPE_DOMAIN_MODEL.md. Every Approved-kind lookup below now
   passes through one more, deliberately narrow filter: a KnowledgeItem
   whose own `payload.norType` is present must match the Problem's norType
   to count as real coverage — the same "opaque payload convention" as
   rule-applicability-engine.js's own `appliesWhen`. An item with NO
   `payload.norType` is treated as generic (applies regardless), so every
   existing seeded item — none of which carries this field yet — behaves
   exactly as before. Passing no norType at all (the default) disables the
   filter entirely, byte-identical to this file's pre-existing behavior.

   RESPONSIBILITY: `detectKnowledgeGaps(domainType, norType)`.

   DEPENDENCIES (read-only — reasoning/ may depend on knowledge/, never the
   reverse): knowledge/services/knowledge-service.js, contracts/
   knowledge-gap-contract.js, knowledge/language/contracts/
   question-tree-contract.js.

   NON-GOALS: never writes anything — a detected Gap is read-only advisory
   output, exactly like a Recommendation (reasoning-engine.js). Never
   auto-creates the missing Knowledge it detects.
   ============================================================ */

'use strict';

import { listKnowledge, LIFECYCLE_STATE } from '../knowledge/services/knowledge-service.js';
import { GAP_TYPE, GAP_PRIORITY, makeKnowledgeGap } from './contracts/knowledge-gap-contract.js';
import { QUESTION_TREE_STATUS } from '../knowledge/language/contracts/question-tree-contract.js';

function recommendedQuestion(question) {
  return Object.freeze({
    question, raisedBy: 'knowledge-gap-engine', status: QUESTION_TREE_STATUS.OPEN, answerRef: null,
  });
}

function matchesNorType(item, norType) {
  if (!norType) return true;
  const itemNorType = item.payload && item.payload.norType;
  return !itemNorType || itemNorType === norType;
}

function approvedOfKind(domainType, kind, norType) {
  const result = listKnowledge({ domainType, kind, lifecycleState: LIFECYCLE_STATE.APPROVED });
  const items = result.ok ? result.data : [];
  return items.filter((item) => matchesNorType(item, norType));
}

/**
 * @param {string} domainType
 * @param {string|null} [norType] - optional NOR Type scoping (see header); omit to check every Approved item regardless of NOR Type, exactly like before this parameter existed.
 * @returns {import('./contracts/knowledge-gap-contract.js').KnowledgeGap[]}
 */
export function detectKnowledgeGaps(domainType, norType = null) {
  const ontologies = approvedOfKind(domainType, 'ontology', norType);
  if (!ontologies.length) {
    return [makeKnowledgeGap({
      domainType,
      gapType: GAP_TYPE.MISSING_CONTEXT,
      field: 'ontology',
      reason: `No Approved Ontology exists for domainType "${domainType}"${norType ? ` (NOR Type "${norType}")` : ''} — without it, no other gap in this domain can be checked against a real expectation.`,
      priority: GAP_PRIORITY.CRITICAL,
      confidence: 1,
      recommendedQuestion: recommendedQuestion(`What is the Ontology for "${domainType}"${norType ? ` / "${norType}"` : ''} — intent, trigger, stakeholders, dependencies?`),
    })];
  }

  const gaps = [];
  const ontology = ontologies[0].payload;

  // missing_entity — a stakeholder role the Ontology names with no
  // corresponding Approved signatory/recipient/cc/approval_chain knowledge.
  const roleKnowledge = [
    ...approvedOfKind(domainType, 'signatory', norType),
    ...approvedOfKind(domainType, 'recipient', norType),
    ...approvedOfKind(domainType, 'cc', norType),
  ];
  for (const stakeholder of (ontology.stakeholders || [])) {
    const backed = roleKnowledge.some((item) => item.payload && (
      item.payload.role === stakeholder.role || item.payload.position === stakeholder.role
    ));
    if (!backed) {
      gaps.push(makeKnowledgeGap({
        domainType,
        gapType: GAP_TYPE.MISSING_ENTITY,
        field: stakeholder.role,
        reason: `Ontology names stakeholder role "${stakeholder.role}" but no Approved signatory/recipient/cc Knowledge Asset backs it.`,
        priority: GAP_PRIORITY.HIGH,
        confidence: 0.8,
        recommendedQuestion: recommendedQuestion(`Who currently holds the "${stakeholder.role}" role for "${domainType}"?`),
      }));
    }
  }

  // missing_approval — the Ontology's own approvalChainRef is either
  // absent or does not resolve to a real Approved approval_chain item.
  if (ontology.approvalChainRef) {
    const chains = approvedOfKind(domainType, 'approval_chain', norType);
    const found = chains.some((c) => c.id === ontology.approvalChainRef);
    if (!found) {
      gaps.push(makeKnowledgeGap({
        domainType,
        gapType: GAP_TYPE.MISSING_APPROVAL,
        field: 'approvalChainRef',
        reason: `Ontology references approval_chain "${ontology.approvalChainRef}", but no Approved Knowledge Asset with that id exists.`,
        priority: GAP_PRIORITY.CRITICAL,
        confidence: 0.9,
        recommendedQuestion: recommendedQuestion(`What is the current, real approval chain for "${domainType}"?`),
      }));
    }
  } else {
    gaps.push(makeKnowledgeGap({
      domainType,
      gapType: GAP_TYPE.MISSING_APPROVAL,
      field: 'approvalChainRef',
      reason: `Ontology for "${domainType}" names no approvalChainRef at all.`,
      priority: GAP_PRIORITY.HIGH,
      confidence: 0.7,
      recommendedQuestion: recommendedQuestion(`Which Approved approval_chain governs "${domainType}"?`),
    }));
  }

  // missing_business_constraint — nothing for the Reasoning Engine to ever
  // cite for this domain.
  const rules = [...approvedOfKind(domainType, 'rule', norType), ...approvedOfKind(domainType, 'policy', norType)];
  if (!rules.length) {
    gaps.push(makeKnowledgeGap({
      domainType,
      gapType: GAP_TYPE.MISSING_BUSINESS_CONSTRAINT,
      field: 'rule',
      reason: `No Approved rule or policy Knowledge Asset exists for "${domainType}" — the Reasoning Engine has nothing to apply for this domain.`,
      priority: GAP_PRIORITY.HIGH,
      confidence: 0.9,
      recommendedQuestion: recommendedQuestion(`What business rules genuinely govern "${domainType}"?`),
    }));
  }

  // missing_reasoning — nothing explaining WHY this domain's process works
  // the way it does (the exact gap Architecture Assessment §3.1 named).
  const reasoningAssets = approvedOfKind(domainType, 'organizational_reasoning', norType);
  if (!reasoningAssets.length) {
    gaps.push(makeKnowledgeGap({
      domainType,
      gapType: GAP_TYPE.MISSING_REASONING,
      field: 'organizational_reasoning',
      reason: `No Approved organizational_reasoning asset exists for "${domainType}" — the platform can describe this domain's structure but not yet why it exists in this form.`,
      priority: GAP_PRIORITY.NORMAL,
      confidence: 0.6,
      recommendedQuestion: recommendedQuestion(`Why does "${domainType}" exist in its current form — what organizational problem triggered it?`),
    }));
  }

  // missing_evidence — a recorded reasoning claim too weakly evidenced to
  // be trusted as-is; a real, lower-confidence finding, not a fabricated one.
  for (const asset of reasoningAssets) {
    const refs = (asset.payload && asset.payload.evidenceRefs) || [];
    if (refs.length < 2 && asset.payload.status !== 'confirmed-by-human') {
      gaps.push(makeKnowledgeGap({
        domainType,
        gapType: GAP_TYPE.MISSING_EVIDENCE,
        field: asset.id,
        reason: `Organizational reasoning "${asset.id}" is backed by only ${refs.length} cited evidence reference(s) and is not yet human-confirmed.`,
        priority: GAP_PRIORITY.NORMAL,
        confidence: 0.5,
        recommendedQuestion: recommendedQuestion(`Can a human confirm or add evidence to reasoning claim "${asset.id}"?`),
      }));
    }
  }

  return gaps;
}
