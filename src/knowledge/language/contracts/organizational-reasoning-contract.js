/* ============================================================
   ORGANIZATIONAL-REASONING-CONTRACT.JS — Knowledge Language Foundation
   (V2, Phase 4-7)

   PURPOSE: fix the payload shape for `kind: 'organizational_reasoning'` —
   the payload contract for the "Reasoning"/"Diagnosis" capability
   SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md (§3.1, §7) found had no
   home anywhere in this platform. This file fixes the SHAPE only; the
   engine that produces and consumes it lives in js/v2/reasoning/ (Phase
   4-7's own new domain) and is what actually implements the three
   non-negotiable constraints that Architecture Assessment §7 named:
   cite-or-abstain, diagnosis-is-never-a-decision, deterministic-until-a-
   real-AI-adapter-is-a-separate-later-decision.

   RESPONSIBILITY: typedef + a DELIBERATELY STRICTER structural validator
   than every sibling contract in this directory — `evidenceRefs` must be
   a non-empty array. An organizational-reasoning claim with zero cited
   evidence is exactly the failure mode CLAUDE.md Principle 7 ("never
   invent business rules") exists to prevent, so this file makes it
   structurally invalid, not merely low-confidence.

   DEPENDENCIES: none.

   NON-GOALS: does not compute confidence, does not resolve `evidenceRefs`
   into real records (see reasoning/reasoning-engine.js and
   knowledge/services/confidence-service.js for that), does not decide
   whether a claim is Approved — that remains the existing, unmodified
   review workflow (knowledge-service.js#promoteKnowledge).

   FUTURE EVOLUTION: Knowledge-Asset-Specification.md §11 anticipates that,
   should a real ai-foundation adapter ever be implemented, its output
   would be cited as ONE MORE piece of evidence inside `evidenceRefs`,
   never as a replacement for this validator's citation discipline — no
   reshape anticipated.
   ============================================================ */

'use strict';

export const REASONING_STATUS = Object.freeze({
  INFERRED: 'inferred',
  EVIDENCED: 'evidenced',
  CONFIRMED_BY_HUMAN: 'confirmed-by-human',
});

/**
 * @typedef {Object} OrganizationalReasoningEntry
 * @property {string} claim                   - one sentence — the reasoning being recorded
 * @property {string[]} evidenceRefs           - KnowledgeItem/ArchiveRecord/LearningEvent ids — MANDATORY, non-empty
 * @property {string[]} [ruledOutAlternatives] - what else was considered and why it was rejected
 * @property {string} [confidenceBasis]        - human-readable justification for the item's numeric `confidence`
 * @property {string} [status]                 - one of REASONING_STATUS
 */

/**
 * Structural validity check. Deliberately stricter than every other
 * language-contract validator in this directory (see header) — a claim
 * with no `evidenceRefs` fails validation outright rather than merely
 * receiving a low confidence.
 * @param {*} p
 * @returns {boolean}
 */
export function isOrganizationalReasoningEntry(p) {
  return !!p && typeof p === 'object'
    && typeof p.claim === 'string' && p.claim.length > 0
    && Array.isArray(p.evidenceRefs) && p.evidenceRefs.length > 0
    && p.evidenceRefs.every((id) => typeof id === 'string' && id.length > 0)
    && (p.status === undefined || Object.values(REASONING_STATUS).includes(p.status));
}
