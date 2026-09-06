/* ============================================================
   STYLE-GUIDE-PROPOSAL.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   PURPOSE: the ONE deterministic transformation

     Organizational Writing Memory candidate  →  Style Guide PROPOSAL

   This is the ONLY allowed upstream integration (Phase 5.x.5 §13, §26):

     Writing Memory (EVIDENCE) → Style Guide proposal → human review →
     approve / reject → authoritative Style Guide

   HARD BOUNDARIES (§13, §22):
     • every proposal is `status: 'proposed'` — NEVER `approved`
     • `rationale` is ALWAYS null — the system NEVER fabricates an approval
       rationale (AI-written rationale is not human approval — §10)
     • `approvedBy` / `approvedAt` are ALWAYS null
     • the source memory id, the source observation / document ids, the
       document-type distribution, and the temporal evidence are all
       preserved (§11, §13, §24.H)
     • frequency / confidence / `candidate` status / `current` evidence
       are carried as EVIDENCE — none of them changes `status` (§22)
     • pure, deterministic: the same Writing Memory entry + ctx ⇒
       byte-identical proposal

   RESPONSIBILITY: makeStyleGuideProposalFromMemory(memory, ctx),
   buildStyleGuideProposals({ report | memories }, ctx),
   makeSupersedingProposal(oldApprovedRule, memory, ctx).

   DEPENDENCIES: ./contracts/style-guide-contract.js,
   ../writing-memory/contracts/writing-memory-contract.js (isWritingMemory
   — a loose guard, not a hard requirement). PURE.
   ============================================================ */

'use strict';

import {
  STYLE_GUIDE_SCOPE, STYLE_RULE_STATUS, STYLE_GUIDE_AUDIT_EVENTS,
  isStyleRuleCategory, makeStyleRule, makeStyleRuleAuditEntry, styleRuleIdFrom,
} from './contracts/style-guide-contract.js';

export const STYLE_GUIDE_PROPOSAL_SET_SCHEMA = 'style-guide-proposal-set@1';

function pickMemoryFields(memory) {
  const m = memory && typeof memory === 'object' ? memory : {};
  const ev = m.evidence && typeof m.evidence === 'object' ? m.evidence : {};
  return { m, ev };
}

/**
 * Turn ONE Writing Memory entry into a `proposed` StyleRule. Returns `null`
 * when the entry is not a usable language convention (missing id / value,
 * or a non-language category) — so a batch caller simply skips it.
 *
 * @param {object} memory  a WritingMemory entry (Phase 5.x.4)
 * @param {object} [ctx]
 * @param {string} [ctx.at]                ISO timestamp — pinnable for determinism
 * @param {string|null} [ctx.actorId]      the proposer; the PURE helper leaves it null unless a
 *                                         trusted caller (the server) injects the verified uid
 * @param {string} [ctx.scope]             STYLE_GUIDE_SCOPE.* (default 'organization')
 * @param {string|null} [ctx.supersedesRuleId]  set only by makeSupersedingProposal (§15)
 * @param {number} [ctx.version]           supersession-chain position (default 1)
 * @returns {import('./contracts/style-guide-contract.js').StyleRule|null}
 */
export function makeStyleGuideProposalFromMemory(memory, ctx = {}) {
  const { m, ev } = pickMemoryFields(memory);
  const memoryId = m.memoryId == null ? '' : String(m.memoryId);
  const category = m.category;
  const value = m.value == null ? '' : String(m.value);

  if (!memoryId) return null;
  if (!isStyleRuleCategory(category)) return null; // §5 — language conventions only (layout/structure OUT)
  if (!value) return null;                          // §11 — need recoverable wording
  const sourceObservationIds = Array.isArray(m.sourceObservationIds) ? m.sourceObservationIds : [];
  const sourceDocumentIds = Array.isArray(m.sourceDocumentIds) ? m.sourceDocumentIds : [];
  if (sourceObservationIds.length < 1 || sourceDocumentIds.length < 1) return null; // §11 — evidence-backed only

  const when = ctx.at || new Date().toISOString();
  const actorId = ctx.actorId == null ? null : String(ctx.actorId);
  const scope = ctx.scope || STYLE_GUIDE_SCOPE.ORGANIZATION;
  const version = Number.isInteger(ctx.version) && ctx.version >= 1 ? ctx.version : 1;
  const supersedesRuleId = ctx.supersedesRuleId == null ? null : String(ctx.supersedesRuleId);

  return makeStyleRule({
    scope,
    category,
    key: m.key,
    value,
    normalizedValue: m.normalizedValue == null ? null : String(m.normalizedValue),
    documentType: m.documentType,
    status: STYLE_RULE_STATUS.PROPOSED, // §13 — ALWAYS proposed, never approved
    rationale: null,                    // §10, §13 — NEVER fabricated
    sourceMemoryIds: [memoryId],
    sourceObservationIds,
    sourceDocumentIds,
    evidence: {
      occurrenceCount: ev.occurrenceCount,
      documentCount: ev.documentCount,
      // §13, §24.H — the per-type distribution is preserved, never collapsed
      documentTypeDistribution: ev.documentTypeDistribution,
      pageNumbers: [],        // Writing Memory does not carry page geometry — honest empty
      extractionMethods: [],
    },
    temporalEvidence: {
      // §7 — consumed as evidence, NOT authority
      temporalStatus: m.temporalStatus,
      conventionEra: m.conventionEra,
      oldestSourceDate: ev.oldestSourceDate,
      latestSourceDate: ev.latestSourceDate,
      recentDocumentCount: ev.recentDocumentCount,
      historicalDocumentCount: ev.historicalDocumentCount,
      conflictingDocumentCount: ev.conflictingDocumentCount,
      approvedRulePresent: ev.approvedRulePresent,
      approvedRuleMatches: ev.approvedRuleMatches,
    },
    confidence: m.confidence, // §22 — carried, never authority
    version,
    supersedesRuleId,
    supersededByRuleId: null,
    createdAt: when,
    createdBy: actorId, // §13 — no approvedBy / approvedAt assigned
    auditTrail: [
      makeStyleRuleAuditEntry({
        event: STYLE_GUIDE_AUDIT_EVENTS.PROPOSED,
        at: when,
        actorId,
        fromStatus: null,
        toStatus: STYLE_RULE_STATUS.PROPOSED,
        version,
        detail: { sourceMemoryId: memoryId, fromWritingMemory: true, supersedesRuleId },
      }),
    ],
  });
}

/**
 * Batch: every Writing Memory candidate/observed entry → a `proposed`
 * StyleRule. Also carries the report's conflicts through as
 * `proposalConflicts` — competing values for the same slot, each side kept
 * (§12), so a human reviewer sees the competing proposals side by side and
 * nothing is chosen by frequency.
 *
 * @param {{ report?: object, memories?: object[] }} input
 * @param {object} [ctx]  same as makeStyleGuideProposalFromMemory's ctx (minus supersedes/version)
 * @returns {{ schema: string, generatedAt: string, proposals: object[], proposalConflicts: object[] }}
 */
export function buildStyleGuideProposals(input = {}, ctx = {}) {
  const report = input && typeof input.report === 'object' ? input.report : null;
  const memories = Array.isArray(input.memories)
    ? input.memories
    : (report && Array.isArray(report.entries) ? report.entries : []);
  const at = ctx.at || new Date().toISOString();

  const proposals = memories
    .map((mem) => makeStyleGuideProposalFromMemory(mem, { ...ctx, at, supersedesRuleId: null, version: 1 }))
    .filter(Boolean);
  // de-dup by ruleId (two identical slot values collapse to one proposal — deterministic)
  const seen = new Set();
  const uniqueProposals = proposals.filter((p) => {
    if (seen.has(p.ruleId)) return false;
    seen.add(p.ruleId);
    return true;
  }).sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));

  const proposalConflicts = [];
  const reportConflicts = report && Array.isArray(report.conflicts) ? report.conflicts : [];
  for (const c of reportConflicts) {
    if (!c || !Array.isArray(c.sides) || c.sides.length < 2) continue;
    const scope = ctx.scope || STYLE_GUIDE_SCOPE.ORGANIZATION;
    const documentType = c.documentType;
    const sides = c.sides.map((sd) => Object.freeze({
      ruleId: (isStyleRuleCategory(c.category) && sd && sd.value)
        ? styleRuleIdFrom(scope, c.category, c.key, documentType, sd.value)
        : null,
      value: sd && sd.value != null ? String(sd.value) : '',
      normalizedValue: sd && sd.normalizedValue != null ? String(sd.normalizedValue) : null,
      temporalStatus: sd && sd.temporalStatus != null ? String(sd.temporalStatus) : null,
      conventionEra: sd && sd.conventionEra != null ? String(sd.conventionEra) : null,
      evidence: sd && sd.evidence && typeof sd.evidence === 'object' ? Object.freeze({ ...sd.evidence }) : Object.freeze({}),
    })).sort((a, b) => ((a.normalizedValue || '') < (b.normalizedValue || '') ? -1 : 1));
    proposalConflicts.push(Object.freeze({
      scope,
      category: c.category,
      key: c.key,
      documentType,
      sides: Object.freeze(sides),
      note: 'Competing values are in recent use for this slot — BOTH are proposed. A human must decide; the Style Guide never chooses by frequency (§12).',
    }));
  }
  proposalConflicts.sort((a, b) => {
    const ka = `${a.documentType}|${a.category}|${a.key}`;
    const kb = `${b.documentType}|${b.category}|${b.key}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return Object.freeze({
    schema: STYLE_GUIDE_PROPOSAL_SET_SCHEMA,
    generatedAt: at,
    proposals: Object.freeze(uniqueProposals),
    proposalConflicts: Object.freeze(proposalConflicts),
  });
}

/**
 * Build a proposal that will SUPERSEDE an existing approved rule (§15). The
 * new value comes from a fresh Writing Memory entry for the SAME slot
 * (scope + category + key + documentType). The old rule is NOT mutated
 * here — it is deprecated only when the new proposal is approved (see
 * style-guide-authority.markDeprecated / the store).
 *
 * @returns {{ proposal: object }|{ error: string }}
 */
export function makeSupersedingProposal(oldApprovedRule, memory, ctx = {}) {
  const old = oldApprovedRule && typeof oldApprovedRule === 'object' ? oldApprovedRule : {};
  if (old.status !== STYLE_RULE_STATUS.APPROVED) return { error: 'NOT_APPROVED' };
  const { m } = pickMemoryFields(memory);
  if (m.category !== old.category || String(m.key || '') !== String(old.key || '') || m.documentType !== old.documentType) {
    return { error: 'SLOT_MISMATCH' };
  }
  const proposal = makeStyleGuideProposalFromMemory(memory, {
    ...ctx,
    scope: old.scope,
    supersedesRuleId: old.ruleId,
    version: (Number.isInteger(old.version) && old.version >= 1 ? old.version : 1) + 1,
  });
  if (!proposal) return { error: 'INVALID_MEMORY' };
  if (proposal.ruleId === old.ruleId) return { error: 'SAME_VALUE' }; // a supersede must change the value
  return { proposal };
}
