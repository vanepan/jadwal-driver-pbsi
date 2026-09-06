/* ============================================================
   NOR-CONTEXT-RETRIEVAL.JS — Certified Retrieval Integration
   (V2, Phase 5.x.7)

   PURPOSE: the ONE certified, read-only retrieval gateway that a FUTURE
   NOR generator will consume:

     Corpus → Writing Memory → Style Guide ─┐
                                            ├─▶  CERTIFIED RETRIEVAL  ─▶  (future) NOR generator
                            Visual Templates ┘

   It COMPOSES the Phase 5.x.5 Style Guide resolver and the Phase 5.x.6
   Visual Template resolver into ONE structured result. It adds NO new
   resolution logic, NO ranking, NO storage. It is PURE over the two rule
   sets it is handed (the server callable gathers them from the existing
   stores).

   HARD BOUNDARIES (§5, §6, §19, §22, §25):
     • APPROVED rules / templates ONLY reach the authoritative sections.
       Proposed / rejected / deprecated NEVER appear as effective.
     • It NEVER reconstructs a Style rule from Writing Memory, NEVER
       promotes a candidate, NEVER infers approval, NEVER majority-votes.
     • It FAILS CLOSED: a conflict is a `conflict`, a gap is `incomplete`,
       an un-queryable subsystem is `unavailable` — these are NEVER
       collapsed to `[]` or to each other (§22, §23).
     • It is READ-ONLY — it mutates nothing.
     • Deterministic: same rule sets + same request ⇒ byte-identical result
       (everything sorted; no object-iteration-order dependence — §24).

   `styleRules` / `visualTemplates` are `StyleRule[]` / `VisualTemplate[]`,
   or `null` when the subsystem could not be queried (⇒ that domain is
   `unavailable`). `[]` means "queried OK, nothing approved exists" (⇒
   `missing`).

   RESPONSIBILITY: retrieveNorContext({ styleRules, visualTemplates },
   request, { at }).

   DEPENDENCIES: ./contracts/nor-retrieval-contract.js,
   ../corpus/style-guide/style-guide-query.js (resolveEffectiveRule,
   findStyleGuideConflicts, queryStyleGuide),
   ../corpus/visual-template/visual-template-query.js
   (resolveEffectiveTemplate, findVisualTemplateConflicts,
   queryVisualTemplates). PURE.
   ============================================================ */

'use strict';

import {
  NOR_RETRIEVAL_CONTEXT_SCHEMA, RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
  isRetrievalDocumentType, makeNorRetrievalRequest, makeNorRetrievalContext,
} from './contracts/nor-retrieval-contract.js';
import {
  STYLE_GUIDE_SCOPE, STYLE_RULE_STATUS, DOCUMENT_TYPE_SCOPE,
} from '../corpus/style-guide/contracts/style-guide-contract.js';
import {
  resolveEffectiveRule, findStyleGuideConflicts, queryStyleGuide,
} from '../corpus/style-guide/style-guide-query.js';
import {
  VISUAL_TEMPLATE_STATUS, VISUAL_TEMPLATE_DOCUMENT_TYPE,
} from '../corpus/visual-template/contracts/visual-template-contract.js';
import {
  resolveEffectiveTemplate, findVisualTemplateConflicts, queryVisualTemplates,
} from '../corpus/visual-template/visual-template-query.js';

const D = RETRIEVAL_DOMAIN_STATUS;
const C = RETRIEVAL_CERTIFICATION_STATUS;

function styleRuleSupport(rule) {
  if (!rule) return null;
  return {
    sourceMemoryIds: rule.sourceMemoryIds,
    sourceObservationIds: rule.sourceObservationIds,
    sourceDocumentIds: rule.sourceDocumentIds,
    temporalEvidence: rule.temporalEvidence,
    evidence: rule.evidence,
    confidence: rule.confidence,
  };
}
function templateSupport(t) {
  if (!t) return null;
  return {
    sourceObservationIds: t.sourceObservationIds,
    sourceDocumentIds: t.sourceDocumentIds,
    temporalEvidence: t.temporalEvidence,
    evidence: t.evidence,
    confidence: t.confidence,
  };
}

/**
 * Resolve ONE Style Guide slot for `documentType`, with an explicit
 * cross-type fallback (§16): the exact document type is tried first; only
 * when it is `missing` is `cross_type` consulted. An exact-type conflict
 * is NEVER hidden by a clean cross_type resolution, and vice-versa.
 */
function resolveStyleSlot(approvedRules, scope, category, key, documentType) {
  const exact = resolveEffectiveRule(approvedRules, { scope, category, key, documentType });
  if (exact.outcome === 'resolved' || exact.outcome === 'conflict') {
    return { ...exact, category, key, documentType, viaCrossType: false };
  }
  const cross = resolveEffectiveRule(approvedRules, { scope, category, key, documentType: DOCUMENT_TYPE_SCOPE.CROSS_TYPE });
  if (cross.outcome === 'resolved' || cross.outcome === 'conflict') {
    return { ...cross, category, key, documentType, viaCrossType: true };
  }
  return { ...exact, category, key, documentType, viaCrossType: false }; // missing
}

/** Build the list of (category, key) slots this request targets. */
function planStyleSlots(approvedRules, request, documentType) {
  const scope = STYLE_GUIDE_SCOPE.ORGANIZATION;
  const relevant = approvedRules.filter((r) => r.documentType === documentType || r.documentType === DOCUMENT_TYPE_SCOPE.CROSS_TYPE);

  // explicit (category,key) targets always win
  if (request.slots.length) {
    return request.slots.map((s) => ({ category: s.category, key: s.key, explicit: true }));
  }

  // enumerate distinct (category, key) among the relevant approved rules
  const seen = new Map(); // `${cat}|${key}` -> {category,key}
  for (const r of relevant) {
    const k = `${r.category}|${r.key}`;
    if (!seen.has(k)) seen.set(k, { category: r.category, key: r.key });
  }
  let slots = [...seen.values()];

  if (request.categories !== 'all') {
    const wanted = new Set(request.categories);
    slots = slots.filter((s) => wanted.has(s.category));
    // a requested category with NO approved key is a real gap → a synthetic missing slot
    for (const cat of request.categories) {
      if (!slots.some((s) => s.category === cat)) slots.push({ category: cat, key: null, synthetic: true });
    }
  }

  return slots.sort((a, b) => {
    const ka = `${a.category}|${a.key || ''}`;
    const kb = `${b.category}|${b.key || ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function domainStatusFrom(outcomes) {
  if (outcomes.some((o) => o === 'conflict')) return D.CONFLICT;
  if (!outcomes.length) return D.MISSING;
  if (outcomes.every((o) => o === 'resolved')) return D.RESOLVED;
  if (outcomes.some((o) => o === 'missing')) return D.MISSING; // §7 — a partial gap is still "incomplete"
  return D.RESOLVED;
}

/**
 * @param {{ styleRules: object[]|null, visualTemplates: object[]|null }} sources
 * @param {object} rawRequest
 * @param {{ at?: string }} [opts]
 * @returns {import('./contracts/nor-retrieval-contract.js').NorRetrievalContext}
 */
export function retrieveNorContext(sources = {}, rawRequest = {}, opts = {}) {
  const at = opts.at || new Date().toISOString();
  const request = makeNorRetrievalRequest(rawRequest);
  const scope = STYLE_GUIDE_SCOPE.ORGANIZATION;
  const reasons = [];

  const styleRules = Array.isArray(sources.styleRules) ? sources.styleRules : null;
  const visualTemplates = Array.isArray(sources.visualTemplates) ? sources.visualTemplates : null;

  /* ── §16 — a valid documentType is mandatory ── */
  if (!isRetrievalDocumentType(request.documentType)) {
    return makeNorRetrievalContext({
      generatedAt: at,
      request,
      certification: {
        status: C.INCOMPLETE,
        styleGuide: { status: D.MISSING },
        visualTemplate: { status: D.MISSING },
        reasons: ['documentType is required for deterministic retrieval (§16).'],
      },
      styleGuide: { status: D.MISSING, rules: [] },
      visualTemplate: { status: D.MISSING, outcome: 'missing', template: null },
      supportingEvidence: {},
      conflicts: { styleGuide: [], visualTemplate: [] },
      provenance: {
        styleRuleCount: styleRules ? styleRules.length : 0,
        visualTemplateCount: visualTemplates ? visualTemplates.length : 0,
        approvedStyleRuleCount: 0,
        approvedVisualTemplateCount: 0,
      },
    });
  }
  const documentType = request.documentType;

  /* ── STYLE GUIDE domain ────────────────────────────────────────────── */
  let sgDomain;
  let sgSlots = [];
  let sgConflicts = [];
  let approvedStyleRuleCount = 0;
  const seRuleIds = [];
  const seMemoryIds = [];
  const seStyleObsIds = [];
  const seStyleDocIds = [];

  if (styleRules === null) {
    sgDomain = D.UNAVAILABLE;
    reasons.push('The Style Guide subsystem could not be queried (§22).');
  } else {
    const approved = queryStyleGuide(styleRules, { status: STYLE_RULE_STATUS.APPROVED });
    approvedStyleRuleCount = approved.length;
    const plan = planStyleSlots(approved, request, documentType);

    for (const p of plan) {
      if (p.synthetic || !p.key) {
        sgSlots.push({
          scope, category: p.category, key: null, documentType,
          outcome: 'missing', viaCrossType: false, rule: null, competingRuleIds: [], supportingEvidence: null,
        });
        continue;
      }
      const r = resolveStyleSlot(approved, scope, p.category, p.key, documentType);
      const rule = r.rule
        ? {
          ruleId: r.rule.ruleId, value: r.rule.value, normalizedValue: r.rule.normalizedValue,
          version: r.rule.version, approvedAt: r.rule.approvedAt, approvedBy: r.rule.approvedBy, rationale: r.rule.rationale,
        }
        : null;
      if (rule) {
        seRuleIds.push(rule.ruleId);
        for (const id of r.rule.sourceMemoryIds || []) seMemoryIds.push(id);
        for (const id of r.rule.sourceObservationIds || []) seStyleObsIds.push(id);
        for (const id of r.rule.sourceDocumentIds || []) seStyleDocIds.push(id);
      }
      sgSlots.push({
        scope, category: p.category, key: p.key, documentType,
        outcome: r.outcome, viaCrossType: r.viaCrossType, rule,
        competingRuleIds: r.competingRuleIds || [],
        supportingEvidence: rule ? styleRuleSupport(r.rule) : null,
      });
    }

    // §8/§10 — every approved-slot conflict for this documentType (+ cross_type)
    sgConflicts = findStyleGuideConflicts(styleRules)
      .filter((c) => c.status === STYLE_RULE_STATUS.APPROVED && (c.documentType === documentType || c.documentType === DOCUMENT_TYPE_SCOPE.CROSS_TYPE))
      .map((c) => ({
        scope: c.scope, category: c.category, key: c.key, documentType: c.documentType,
        competingRuleIds: c.competingRuleIds,
        competing: (c.sides || []).map((s) => ({
          ruleId: s.ruleId, value: s.value, normalizedValue: s.normalizedValue,
          version: s.version, evidence: s.evidence, temporalEvidence: s.temporalEvidence,
        })),
      }));

    sgDomain = domainStatusFrom(sgSlots.map((s) => s.outcome));
    if (sgDomain === D.CONFLICT) reasons.push('Multiple incompatible approved Style Guide rules exist for a requested slot (§8).');
    else if (sgDomain === D.MISSING) reasons.push('An approved Style Guide rule was requested but does not exist (§7).');
  }

  /* ── VISUAL TEMPLATE domain ────────────────────────────────────────── */
  let vtDomain;
  let vtResult = { status: D.MISSING, outcome: 'missing', viaCrossType: false, template: null, competingTemplateIds: [], supportingEvidence: null };
  let vtConflicts = [];
  let approvedVisualTemplateCount = 0;
  const seTemplateIds = [];
  const seVtObsIds = [];
  const seVtDocIds = [];

  if (visualTemplates === null) {
    vtDomain = D.UNAVAILABLE;
    reasons.push('The Visual Template subsystem could not be queried (§22).');
  } else {
    const approvedT = queryVisualTemplates(visualTemplates, { status: VISUAL_TEMPLATE_STATUS.APPROVED });
    approvedVisualTemplateCount = approvedT.length;

    let res = resolveEffectiveTemplate(approvedT, { scope, documentType });
    let viaCrossType = false;
    if (res.outcome === 'missing') {
      const cross = resolveEffectiveTemplate(approvedT, { scope, documentType: VISUAL_TEMPLATE_DOCUMENT_TYPE.CROSS_TYPE });
      if (cross.outcome === 'resolved' || cross.outcome === 'conflict') { res = cross; viaCrossType = true; }
    }

    const t = res.template;
    if (t) {
      seTemplateIds.push(t.templateId);
      for (const id of t.sourceObservationIds || []) seVtObsIds.push(id);
      for (const id of t.sourceDocumentIds || []) seVtDocIds.push(id);
    }

    // §18 — project regions to requested kinds (does NOT change certification)
    let regions = t ? t.regions : [];
    if (t && request.regionKinds !== 'all') {
      const wanted = new Set(request.regionKinds);
      regions = t.regions.filter((r) => wanted.has(r.kind));
    }

    vtResult = {
      status: res.outcome === 'resolved' ? D.RESOLVED : res.outcome === 'conflict' ? D.CONFLICT : D.MISSING,
      outcome: res.outcome,
      viaCrossType,
      template: t ? {
        templateId: t.templateId, variant: t.variant, templateVersion: t.templateVersion,
        approvedAt: t.approvedAt, approvedBy: t.approvedBy, rationale: t.rationale, documentType: t.documentType,
        pageModel: t.pageModel, regions, structuralRules: t.structuralRules,
        typography: t.typography, spacing: t.spacing,
      } : null,
      competingTemplateIds: res.competingTemplateIds || [],
      supportingEvidence: templateSupport(t),
    };

    vtConflicts = findVisualTemplateConflicts(visualTemplates)
      .filter((c) => c.status === VISUAL_TEMPLATE_STATUS.APPROVED && (c.documentType === documentType || c.documentType === VISUAL_TEMPLATE_DOCUMENT_TYPE.CROSS_TYPE))
      .map((c) => ({
        scope: c.scope, documentType: c.documentType,
        competingTemplateIds: c.competingTemplateIds,
        competing: (c.sides || []).map((s) => ({
          templateId: s.templateId, variant: s.variant, templateVersion: s.templateVersion,
          pageModel: s.pageModel, evidence: s.evidence, temporalEvidence: s.temporalEvidence,
        })),
      }));

    vtDomain = vtResult.status;
    if (vtDomain === D.CONFLICT) reasons.push('Multiple incompatible approved Visual Templates exist for this document type (§9).');
    else if (vtDomain === D.MISSING) reasons.push('No approved Visual Template exists for this document type (§6).');
  }

  /* ── CERTIFICATION (§7, §10, §11) — fail closed ─────────────────────── */
  let certStatus;
  if (sgDomain === D.UNAVAILABLE || vtDomain === D.UNAVAILABLE) {
    certStatus = C.UNAVAILABLE;
  } else if (sgDomain === D.CONFLICT || vtDomain === D.CONFLICT) {
    certStatus = C.CONFLICT;
  } else if (sgDomain === D.RESOLVED && vtDomain === D.RESOLVED) {
    certStatus = C.CERTIFIED;
  } else {
    certStatus = C.INCOMPLETE;
  }
  if (certStatus === C.CERTIFIED && reasons.length === 0) {
    reasons.push('Every requested authoritative component resolved from approved organizational sources without conflict (§11).');
  }

  return makeNorRetrievalContext({
    generatedAt: at,
    request,
    certification: {
      status: certStatus,
      styleGuide: { status: sgDomain },
      visualTemplate: { status: vtDomain },
      reasons,
    },
    styleGuide: { status: sgDomain, rules: sgSlots },
    visualTemplate: vtResult,
    supportingEvidence: {
      styleGuide: { ruleIds: seRuleIds, sourceMemoryIds: seMemoryIds, sourceObservationIds: seStyleObsIds, sourceDocumentIds: seStyleDocIds },
      visualTemplate: { templateIds: seTemplateIds, sourceObservationIds: seVtObsIds, sourceDocumentIds: seVtDocIds },
    },
    conflicts: { styleGuide: sgConflicts, visualTemplate: vtConflicts },
    provenance: {
      styleRuleCount: styleRules ? styleRules.length : 0,
      approvedStyleRuleCount,
      visualTemplateCount: visualTemplates ? visualTemplates.length : 0,
      approvedVisualTemplateCount,
    },
  });
}

export { NOR_RETRIEVAL_CONTEXT_SCHEMA };
