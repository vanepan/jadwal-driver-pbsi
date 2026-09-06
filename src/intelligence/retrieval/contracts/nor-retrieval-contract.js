/* ============================================================
   NOR-RETRIEVAL-CONTRACT.JS — Certified Retrieval Integration
   (V2, Phase 5.x.7)

   PURPOSE: fix the shape of ONE certified NOR retrieval context — the
   structured, deterministic, read-only result a FUTURE NOR generator will
   consume to know what approved organizational rules it is allowed to
   trust.

   THE CERTIFICATION BOUNDARY (Phase 5.x.7 §1, §11):

       Retrieval may certify approved organizational context.
       Retrieval must never manufacture authority.

   A `certified` context means: EVERY authoritative component requested by
   this retrieval resolved from APPROVED organizational sources (Phase
   5.x.5 Style Guide rules + Phase 5.x.6 Visual Templates) WITHOUT an
   unresolved conflict. It is a statement about the STATE OF APPROVED
   ORGANIZATIONAL KNOWLEDGE — never a prediction, never a best-effort
   guess.

   The gateway NEVER turns Writing Memory, corpus evidence, historical
   documents, confidence, frequency, recency, a proposed rule, a proposed
   template, or any model output into authority (§14, §22, §25).

   RESPONSIBILITY: NOR_RETRIEVAL_CONTEXT_SCHEMA,
   RETRIEVAL_CERTIFICATION_STATUS (+ set), RETRIEVAL_DOMAIN_STATUS (+ set),
   makeNorRetrievalRequest / isNorRetrievalRequest,
   makeNorRetrievalContext / isNorRetrievalContext.

   DEPENDENCIES: ../../corpus/style-guide/contracts/style-guide-contract.js
   (STYLE_GUIDE_SCOPE, STYLE_RULE_CATEGORIES, isStyleRuleCategory,
   DOCUMENT_TYPE_SCOPE — reused, NOT redefined),
   ../../corpus/visual-template/contracts/visual-template-contract.js
   (VISUAL_TEMPLATE_DOCUMENT_TYPE, VISUAL_REGION_KIND, isVisualRegionKind
   — reused). PURE — no I/O, no DOM, no Firebase, no secret, no model.
   ============================================================ */

'use strict';

import {
  STYLE_GUIDE_SCOPE, STYLE_RULE_CATEGORIES, isStyleRuleCategory, DOCUMENT_TYPE_SCOPE,
} from '../../corpus/style-guide/contracts/style-guide-contract.js';
import {
  VISUAL_TEMPLATE_DOCUMENT_TYPE, VISUAL_REGION_KIND, isVisualRegionKind,
} from '../../corpus/visual-template/contracts/visual-template-contract.js';

export const NOR_RETRIEVAL_CONTEXT_SCHEMA = 'nor-retrieval-context@1';
export const NOR_RETRIEVAL_REQUEST_SCHEMA = 'nor-retrieval-request@1';

/** §7 — the certification states. Exactly four; each is materially
 *  different and MUST NOT be silently collapsed (§22, §23). */
export const RETRIEVAL_CERTIFICATION_STATUS = Object.freeze({
  CERTIFIED: 'certified',     // every requested authoritative component resolved, no conflict
  INCOMPLETE: 'incomplete',   // some requested authoritative information does not exist (a domain is `missing`)
  CONFLICT: 'conflict',       // multiple incompatible approved rules/templates exist (a domain is `conflict`)
  UNAVAILABLE: 'unavailable', // a required authoritative subsystem could not be queried
});
const CERT_STATUS_VALUES = Object.freeze(Object.values(RETRIEVAL_CERTIFICATION_STATUS));

/** §10 — the per-domain states. `missing` (queried OK, nothing approved
 *  exists — the §23 "resolved-empty" case) is distinct from `unavailable`
 *  (could not query). */
export const RETRIEVAL_DOMAIN_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  CONFLICT: 'conflict',
  MISSING: 'missing',
  UNAVAILABLE: 'unavailable',
});
const DOMAIN_STATUS_VALUES = Object.freeze(Object.values(RETRIEVAL_DOMAIN_STATUS));

/** §16 — the document types deterministic retrieval accepts. Reused from
 *  the Style Guide / Visual Template contracts (the real corpus types).
 *  `cross_type` is NOT a request type — it is a rule SCOPE the gateway may
 *  fall back to (§16). */
export const RETRIEVAL_DOCUMENT_TYPES = Object.freeze([
  VISUAL_TEMPLATE_DOCUMENT_TYPE.NOR,
  VISUAL_TEMPLATE_DOCUMENT_TYPE.NOTA_ORGANISASI,
  VISUAL_TEMPLATE_DOCUMENT_TYPE.MEMORANDUM,
  VISUAL_TEMPLATE_DOCUMENT_TYPE.LEGACY,
  VISUAL_TEMPLATE_DOCUMENT_TYPE.UNKNOWN,
]);
export function isRetrievalDocumentType(t) { return RETRIEVAL_DOCUMENT_TYPES.includes(t); }

export { STYLE_RULE_CATEGORIES, VISUAL_REGION_KIND, DOCUMENT_TYPE_SCOPE };

/* ── small pure helpers ────────────────────────────────────────────── */
function str(v) { return v == null ? '' : String(v); }
function strList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean))].sort());
}
function clamp01OrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : null;
}

/**
 * @typedef {Object} NorRetrievalRequest
 * @property {string} schema
 * @property {string} documentType         - RETRIEVAL_DOCUMENT_TYPES.* (mandatory — §16)
 * @property {string} scope                - STYLE_GUIDE_SCOPE.* ('organization' — server-forced; a client value is normalised away — §20/§21)
 * @property {string} categories           - 'all' or a sorted distinct list projected to a string[] (§17)
 * @property {Array<{category:string,key:string}>} slots  - explicit (category,key) targets (§17); [] when only `categories` given
 * @property {string} regionKinds          - 'all' or a sorted distinct VISUAL_REGION_KIND list (§18)
 * @property {boolean} includeSupportingEvidence
 */
export function makeNorRetrievalRequest(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const documentType = isRetrievalDocumentType(s.documentType) ? s.documentType : '';

  // §17 — categories: 'all' | string[] (validated to STYLE_RULE_CATEGORIES)
  let categories = 'all';
  if (Array.isArray(s.categories)) {
    const list = [...new Set(s.categories.map(String).filter(isStyleRuleCategory))].sort();
    categories = list.length ? Object.freeze(list) : 'all';
  } else if (typeof s.categories === 'string' && s.categories !== 'all' && isStyleRuleCategory(s.categories)) {
    categories = Object.freeze([s.categories]);
  }

  // explicit (category,key) slots — only kept when the category is valid
  const slots = Object.freeze(
    (Array.isArray(s.slots) ? s.slots : [])
      .filter((x) => x && typeof x === 'object' && isStyleRuleCategory(x.category) && str(x.key).trim())
      .map((x) => Object.freeze({ category: String(x.category), key: String(x.key) }))
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  );

  // §18 — regionKinds: 'all' | string[] (validated to VISUAL_REGION_KIND)
  let regionKinds = 'all';
  if (Array.isArray(s.regionKinds)) {
    const list = [...new Set(s.regionKinds.map(String).filter(isVisualRegionKind))].sort();
    regionKinds = list.length ? Object.freeze(list) : 'all';
  } else if (typeof s.regionKinds === 'string' && s.regionKinds !== 'all' && isVisualRegionKind(s.regionKinds)) {
    regionKinds = Object.freeze([s.regionKinds]);
  }

  return Object.freeze({
    schema: NOR_RETRIEVAL_REQUEST_SCHEMA,
    documentType,
    // §20/§21 — scope is organization-wide; a client value never widens it.
    scope: STYLE_GUIDE_SCOPE.ORGANIZATION,
    categories,
    slots,
    regionKinds,
    includeSupportingEvidence: s.includeSupportingEvidence !== false,
  });
}

export function isNorRetrievalRequest(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== NOR_RETRIEVAL_REQUEST_SCHEMA) return false;
  if (r.scope !== STYLE_GUIDE_SCOPE.ORGANIZATION) return false;
  if (!(r.categories === 'all' || Array.isArray(r.categories))) return false;
  if (!(r.regionKinds === 'all' || Array.isArray(r.regionKinds))) return false;
  if (!Array.isArray(r.slots)) return false;
  if (typeof r.includeSupportingEvidence !== 'boolean') return false;
  return true;
}

/** Compact, ID-first supporting evidence (§12) — never a full corpus
 *  document, never private body text. `confidence` lives HERE, clearly
 *  separated from `authorityState` (§14). */
function makeSupportingEvidence(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const te = s.temporalEvidence && typeof s.temporalEvidence === 'object' ? s.temporalEvidence : null;
  const ev = s.evidence && typeof s.evidence === 'object' ? s.evidence : null;
  return Object.freeze({
    sourceMemoryIds: strList(s.sourceMemoryIds),
    sourceObservationIds: strList(s.sourceObservationIds),
    sourceDocumentIds: strList(s.sourceDocumentIds),
    temporalEvidence: te ? Object.freeze({ ...te }) : null,
    evidence: ev ? Object.freeze({ ...ev, confidence: clamp01OrNull(ev.confidence != null ? ev.confidence : s.confidence) }) : (s.confidence != null ? Object.freeze({ confidence: clamp01OrNull(s.confidence) }) : null),
  });
}

/**
 * @typedef {Object} NorRetrievalContext
 * @property {string} schema
 * @property {string} generatedAt
 * @property {NorRetrievalRequest} request
 * @property {Object} certification   - { status, styleGuide:{status}, visualTemplate:{status}, reasons: string[] }
 * @property {Object} styleGuide      - { status, rules: StyleSlotResult[] }
 * @property {Object} visualTemplate  - { status, outcome, template, competingTemplateIds, supportingEvidence }
 * @property {Object} supportingEvidence
 * @property {Object} conflicts       - { styleGuide: [...], visualTemplate: [...] }
 * @property {Object} provenance
 */
export function makeNorRetrievalContext(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const request = isNorRetrievalRequest(s.request) ? s.request : makeNorRetrievalRequest(s.request || {});

  const domain = (v) => (DOMAIN_STATUS_VALUES.includes(v) ? v : RETRIEVAL_DOMAIN_STATUS.MISSING);
  const c = s.certification && typeof s.certification === 'object' ? s.certification : {};
  const certification = Object.freeze({
    status: CERT_STATUS_VALUES.includes(c.status) ? c.status : RETRIEVAL_CERTIFICATION_STATUS.INCOMPLETE,
    styleGuide: Object.freeze({ status: domain(c.styleGuide && c.styleGuide.status) }),
    visualTemplate: Object.freeze({ status: domain(c.visualTemplate && c.visualTemplate.status) }),
    reasons: strList(c.reasons),
  });

  const sg = s.styleGuide && typeof s.styleGuide === 'object' ? s.styleGuide : {};
  const styleRules = (Array.isArray(sg.rules) ? sg.rules : []).map((r) => Object.freeze({
    scope: str(r.scope) || STYLE_GUIDE_SCOPE.ORGANIZATION,
    category: str(r.category),
    key: r.key == null ? null : String(r.key),
    documentType: str(r.documentType),
    outcome: ['resolved', 'conflict', 'missing'].includes(r.outcome) ? r.outcome : 'missing',
    viaCrossType: r.viaCrossType === true,
    rule: r.rule && typeof r.rule === 'object' ? Object.freeze({
      ruleId: str(r.rule.ruleId),
      value: str(r.rule.value),
      normalizedValue: r.rule.normalizedValue == null ? null : String(r.rule.normalizedValue),
      version: Number.isInteger(r.rule.version) ? r.rule.version : 1,
      authorityState: 'authoritative', // §14 — only ever approved rules reach here
      approvedAt: r.rule.approvedAt == null ? null : String(r.rule.approvedAt),
      approvedBy: r.rule.approvedBy == null ? null : String(r.rule.approvedBy),
      rationale: r.rule.rationale == null ? null : String(r.rule.rationale),
    }) : null,
    competingRuleIds: strList(r.competingRuleIds),
    supportingEvidence: request.includeSupportingEvidence && r.supportingEvidence ? makeSupportingEvidence(r.supportingEvidence) : null,
  }));
  styleRules.sort((a, b) => {
    const ka = `${a.category}|${a.key || ''}`;
    const kb = `${b.category}|${b.key || ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const vt = s.visualTemplate && typeof s.visualTemplate === 'object' ? s.visualTemplate : {};
  const visualTemplate = Object.freeze({
    status: domain(vt.status),
    outcome: ['resolved', 'conflict', 'missing'].includes(vt.outcome) ? vt.outcome : 'missing',
    viaCrossType: vt.viaCrossType === true,
    template: vt.template && typeof vt.template === 'object' ? Object.freeze({
      templateId: str(vt.template.templateId),
      variant: str(vt.template.variant),
      templateVersion: Number.isInteger(vt.template.templateVersion) ? vt.template.templateVersion : 1,
      authorityState: 'authoritative', // §14
      approvedAt: vt.template.approvedAt == null ? null : String(vt.template.approvedAt),
      approvedBy: vt.template.approvedBy == null ? null : String(vt.template.approvedBy),
      rationale: vt.template.rationale == null ? null : String(vt.template.rationale),
      documentType: str(vt.template.documentType),
      pageModel: vt.template.pageModel && typeof vt.template.pageModel === 'object' ? Object.freeze({ ...vt.template.pageModel }) : null,
      regions: Object.freeze((Array.isArray(vt.template.regions) ? vt.template.regions : []).map((rg) => Object.freeze({ ...rg }))),
      structuralRules: vt.template.structuralRules && typeof vt.template.structuralRules === 'object' ? Object.freeze({ ...vt.template.structuralRules }) : null,
      typography: vt.template.typography && typeof vt.template.typography === 'object' ? Object.freeze({ ...vt.template.typography }) : null,
      spacing: vt.template.spacing && typeof vt.template.spacing === 'object' ? Object.freeze({ ...vt.template.spacing }) : null,
    }) : null,
    competingTemplateIds: strList(vt.competingTemplateIds),
    supportingEvidence: request.includeSupportingEvidence && vt.supportingEvidence ? makeSupportingEvidence(vt.supportingEvidence) : null,
  });

  const se = s.supportingEvidence && typeof s.supportingEvidence === 'object' ? s.supportingEvidence : {};
  const seSg = se.styleGuide && typeof se.styleGuide === 'object' ? se.styleGuide : {};
  const seVt = se.visualTemplate && typeof se.visualTemplate === 'object' ? se.visualTemplate : {};
  const supportingEvidence = Object.freeze({
    styleGuide: Object.freeze({
      ruleIds: strList(seSg.ruleIds),
      sourceMemoryIds: strList(seSg.sourceMemoryIds),
      sourceObservationIds: strList(seSg.sourceObservationIds),
      sourceDocumentIds: strList(seSg.sourceDocumentIds),
    }),
    visualTemplate: Object.freeze({
      templateIds: strList(seVt.templateIds),
      sourceObservationIds: strList(seVt.sourceObservationIds),
      sourceDocumentIds: strList(seVt.sourceDocumentIds),
    }),
  });

  const cf = s.conflicts && typeof s.conflicts === 'object' ? s.conflicts : {};
  const conflicts = Object.freeze({
    styleGuide: Object.freeze((Array.isArray(cf.styleGuide) ? cf.styleGuide : []).map((x) => Object.freeze({
      scope: str(x.scope) || STYLE_GUIDE_SCOPE.ORGANIZATION,
      category: str(x.category),
      key: x.key == null ? null : String(x.key),
      documentType: str(x.documentType),
      competingRuleIds: strList(x.competingRuleIds),
      competing: Object.freeze((Array.isArray(x.competing) ? x.competing : []).map((y) => Object.freeze({ ...y }))),
    }))),
    visualTemplate: Object.freeze((Array.isArray(cf.visualTemplate) ? cf.visualTemplate : []).map((x) => Object.freeze({
      scope: str(x.scope) || STYLE_GUIDE_SCOPE.ORGANIZATION,
      documentType: str(x.documentType),
      competingTemplateIds: strList(x.competingTemplateIds),
      competing: Object.freeze((Array.isArray(x.competing) ? x.competing : []).map((y) => Object.freeze({ ...y }))),
    }))),
  });

  const pv = s.provenance && typeof s.provenance === 'object' ? s.provenance : {};
  const provenance = Object.freeze({
    styleGuideSchema: 'pbsi-nor-style-guide@1',
    visualTemplateSchema: 'pbsi-visual-template@1',
    styleRuleCount: Number.isInteger(pv.styleRuleCount) ? pv.styleRuleCount : 0,
    approvedStyleRuleCount: Number.isInteger(pv.approvedStyleRuleCount) ? pv.approvedStyleRuleCount : 0,
    visualTemplateCount: Number.isInteger(pv.visualTemplateCount) ? pv.visualTemplateCount : 0,
    approvedVisualTemplateCount: Number.isInteger(pv.approvedVisualTemplateCount) ? pv.approvedVisualTemplateCount : 0,
    note: 'Retrieval may certify approved organizational context. Retrieval must never manufacture authority.',
  });

  return Object.freeze({
    schema: NOR_RETRIEVAL_CONTEXT_SCHEMA,
    generatedAt: str(s.generatedAt) || new Date().toISOString(),
    request,
    certification,
    styleGuide: Object.freeze({ status: domain(sg.status), rules: Object.freeze(styleRules) }),
    visualTemplate,
    supportingEvidence,
    conflicts,
    provenance,
  });
}

export function isNorRetrievalContext(x) {
  if (!x || typeof x !== 'object') return false;
  if (x.schema !== NOR_RETRIEVAL_CONTEXT_SCHEMA) return false;
  if (!isNorRetrievalRequest(x.request)) return false;
  if (!x.certification || !CERT_STATUS_VALUES.includes(x.certification.status)) return false;
  if (!x.certification.styleGuide || !DOMAIN_STATUS_VALUES.includes(x.certification.styleGuide.status)) return false;
  if (!x.certification.visualTemplate || !DOMAIN_STATUS_VALUES.includes(x.certification.visualTemplate.status)) return false;
  if (!Array.isArray(x.certification.reasons)) return false;
  if (!x.styleGuide || !DOMAIN_STATUS_VALUES.includes(x.styleGuide.status) || !Array.isArray(x.styleGuide.rules)) return false;
  if (!x.visualTemplate || !DOMAIN_STATUS_VALUES.includes(x.visualTemplate.status)) return false;
  if (!x.conflicts || !Array.isArray(x.conflicts.styleGuide) || !Array.isArray(x.conflicts.visualTemplate)) return false;
  if (!x.provenance || typeof x.provenance !== 'object') return false;
  // §14 — a rule/template that reached the context is ALWAYS authoritative.
  if (!x.styleGuide.rules.every((r) => r.rule == null || r.rule.authorityState === 'authoritative')) return false;
  if (x.visualTemplate.template != null && x.visualTemplate.template.authorityState !== 'authoritative') return false;
  return true;
}
