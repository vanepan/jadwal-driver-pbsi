/* ============================================================
   VISUAL-TEMPLATE-PROPOSAL.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: the ONE deterministic transformation

     Visual Pattern (observed structure)  →  Visual Template CANDIDATE

   This is the only allowed upstream integration for authority creation
   (Phase 5.x.6 §13, §27):

     Visual Evidence → aggregation → pattern → PROPOSAL → human review →
     approve / reject → authoritative Visual Template

   HARD BOUNDARIES (§13, §21):
     • every proposal is `status: 'proposed'` — NEVER `approved`
     • `rationale` is ALWAYS null — the system NEVER fabricates an approval
       rationale (§11)
     • `approvedBy` / `approvedAt` are ALWAYS null
     • the source document / observation ids, page model, regions,
       geometry, evidence and temporal evidence are all preserved (§4, §13)
     • frequency / confidence / `current` evidence are carried as EVIDENCE —
       none of them changes `status` (§0, §21)
     • pure, deterministic

   RESPONSIBILITY: makeVisualTemplateProposalFromPattern(pattern, ctx),
   buildVisualTemplateProposals({ report | patterns }, ctx),
   makeSupersedingVisualTemplateProposal(oldApprovedTemplate, pattern, ctx).

   DEPENDENCIES: ./contracts/visual-template-contract.js. PURE.
   ============================================================ */

'use strict';

import {
  VISUAL_TEMPLATE_SCOPE, VISUAL_TEMPLATE_STATUS, VISUAL_TEMPLATE_AUDIT_EVENTS,
  VISUAL_TEMPLATE_DOCUMENT_TYPE, visualTemplateIdFrom,
  makeVisualTemplate, makeVisualTemplateAuditEntry,
} from './contracts/visual-template-contract.js';

export const VISUAL_TEMPLATE_PROPOSAL_SET_SCHEMA = 'visual-template-proposal-set@1';

const DOC_TYPE_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_DOCUMENT_TYPE));

/**
 * Turn ONE visual pattern into a `proposed` VisualTemplate. Returns `null`
 * when the pattern is not usable (no id / no variant / no evidence).
 *
 * @param {object} pattern  a VisualPattern (from visual-evidence-aggregator.js)
 * @param {object} [ctx]  { at, actorId?, scope?, supersedesTemplateId?, version? }
 * @returns {import('./contracts/visual-template-contract.js').VisualTemplate|null}
 */
export function makeVisualTemplateProposalFromPattern(pattern, ctx = {}) {
  const p = pattern && typeof pattern === 'object' ? pattern : {};
  const variant = p.variant == null ? '' : String(p.variant);
  const sourceDocumentIds = Array.isArray(p.sourceDocumentIds) ? p.sourceDocumentIds : [];
  const sourceObservationIds = Array.isArray(p.sourceObservationIds) ? p.sourceObservationIds : [];

  if (!variant) return null;
  if (!DOC_TYPE_VALUES.includes(p.documentType)) return null;
  if (sourceDocumentIds.length < 1 || sourceObservationIds.length < 1) return null; // §13 — evidence-backed only

  const when = ctx.at || new Date().toISOString();
  const actorId = ctx.actorId == null ? null : String(ctx.actorId);
  const scope = ctx.scope || VISUAL_TEMPLATE_SCOPE.ORGANIZATION;
  const version = Number.isInteger(ctx.version) && ctx.version >= 1 ? ctx.version : 1;
  const supersedesTemplateId = ctx.supersedesTemplateId == null ? null : String(ctx.supersedesTemplateId);

  return makeVisualTemplate({
    scope,
    documentType: p.documentType,
    variant,
    status: VISUAL_TEMPLATE_STATUS.PROPOSED, // §13 — ALWAYS proposed
    rationale: null,                          // §11, §13 — NEVER fabricated
    pageModel: p.pageModel,
    regions: p.regions,
    typography: p.typography,
    spacing: p.spacing,
    structuralRules: p.structuralRules,
    sourceDocumentIds,
    sourceObservationIds,
    evidence: p.evidence,
    temporalEvidence: p.temporalEvidence, // §9 — evidence, not authority
    confidence: p.confidence,              // §0 — carried, never authority
    templateVersion: version,
    supersedesTemplateId,
    supersededByTemplateId: null,
    createdAt: when,
    createdBy: actorId, // §13 — no approvedBy / approvedAt assigned
    auditTrail: [
      makeVisualTemplateAuditEntry({
        event: VISUAL_TEMPLATE_AUDIT_EVENTS.PROPOSED,
        at: when,
        actorId,
        fromStatus: null,
        toStatus: VISUAL_TEMPLATE_STATUS.PROPOSED,
        version,
        detail: {
          patternId: p.patternId == null ? null : String(p.patternId),
          fromVisualEvidence: true,
          supersedesTemplateId,
        },
      }),
    ],
  });
}

/**
 * Batch: every pattern → a `proposed` VisualTemplate. Carries the report's
 * conflicts through as `proposalConflicts` — competing layouts for the
 * same slot, each side kept (§20, §21), so a human reviewer sees the
 * variants side by side and nothing is chosen by frequency.
 *
 * @param {{ report?: object, patterns?: object[] }} input
 * @param {object} [ctx]
 * @returns {{ schema, generatedAt, proposals: object[], proposalConflicts: object[] }}
 */
export function buildVisualTemplateProposals(input = {}, ctx = {}) {
  const report = input && typeof input.report === 'object' ? input.report : null;
  const patterns = Array.isArray(input.patterns)
    ? input.patterns
    : (report && Array.isArray(report.patterns) ? report.patterns : []);
  const at = ctx.at || new Date().toISOString();

  const proposals = patterns
    .map((pat) => makeVisualTemplateProposalFromPattern(pat, { ...ctx, at, supersedesTemplateId: null, version: 1 }))
    .filter(Boolean);
  const seen = new Set();
  const uniqueProposals = proposals.filter((t) => {
    if (seen.has(t.templateId)) return false;
    seen.add(t.templateId);
    return true;
  }).sort((a, b) => (a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0));

  const proposalConflicts = [];
  const reportConflicts = report && Array.isArray(report.patternConflicts) ? report.patternConflicts : [];
  for (const c of reportConflicts) {
    if (!c || !Array.isArray(c.sides) || c.sides.length < 2) continue;
    const scope = ctx.scope || VISUAL_TEMPLATE_SCOPE.ORGANIZATION;
    proposalConflicts.push(Object.freeze({
      scope,
      documentType: c.documentType,
      sides: Object.freeze(c.sides.map((sd) => Object.freeze({
        templateId: sd && sd.variant ? visualTemplateIdFrom(scope, c.documentType, sd.variant) : null,
        patternId: sd && sd.patternId != null ? String(sd.patternId) : null,
        variant: sd && sd.variant != null ? String(sd.variant) : '',
        pageModel: sd && sd.pageModel ? sd.pageModel : null,
        regions: sd && Array.isArray(sd.regions) ? sd.regions : [],
        evidence: sd && sd.evidence ? sd.evidence : Object.freeze({}),
        temporalEvidence: sd && sd.temporalEvidence ? sd.temporalEvidence : Object.freeze({}),
      })).sort((a, b) => (a.variant < b.variant ? -1 : 1))),
      note: 'Competing visual layouts for this document type — BOTH are proposed. A human must decide; the Visual Template System never chooses by frequency (§20, §21).',
    }));
  }
  proposalConflicts.sort((a, b) => {
    const ka = `${a.scope}|${a.documentType}`;
    const kb = `${b.scope}|${b.documentType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return Object.freeze({
    schema: VISUAL_TEMPLATE_PROPOSAL_SET_SCHEMA,
    generatedAt: at,
    proposals: Object.freeze(uniqueProposals),
    proposalConflicts: Object.freeze(proposalConflicts),
  });
}

/**
 * Build a proposal that will SUPERSEDE an existing approved template (§12).
 * The new layout comes from a fresh pattern for the SAME slot (scope +
 * documentType). The old template is NOT mutated here — it is deprecated
 * only when the new proposal is approved.
 *
 * @returns {{ proposal: object }|{ error: string }}
 */
export function makeSupersedingVisualTemplateProposal(oldApprovedTemplate, pattern, ctx = {}) {
  const old = oldApprovedTemplate && typeof oldApprovedTemplate === 'object' ? oldApprovedTemplate : {};
  if (old.status !== VISUAL_TEMPLATE_STATUS.APPROVED) return { error: 'NOT_APPROVED' };
  const p = pattern && typeof pattern === 'object' ? pattern : {};
  if (p.documentType !== old.documentType) return { error: 'SLOT_MISMATCH' };
  const proposal = makeVisualTemplateProposalFromPattern(pattern, {
    ...ctx,
    scope: old.scope,
    supersedesTemplateId: old.templateId,
    version: (Number.isInteger(old.templateVersion) && old.templateVersion >= 1 ? old.templateVersion : 1) + 1,
  });
  if (!proposal) return { error: 'INVALID_PATTERN' };
  if (proposal.templateId === old.templateId) return { error: 'SAME_LAYOUT' }; // a supersede must change the layout
  return { proposal };
}
