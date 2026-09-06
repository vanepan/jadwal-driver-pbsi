'use strict';

/* ============================================================
   functions/src/intelligence/norRetrievalContract.js — Phase 5.x.7

   The CJS mirror of the ESM Certified Retrieval gateway
   (src/intelligence/retrieval/contracts/nor-retrieval-contract.js +
   src/intelligence/retrieval/nor-context-retrieval.js). Kept
   byte-for-behaviour with the ESM side —
   scripts/intelligence-retrieval-check.cjs asserts drift parity (schemas,
   enums, and that retrieveNorContext produces identical output on the
   same rule sets + request).

   The Functions runtime is CJS and must NEVER import from src/. This file
   is the whole retrieval contract + composition logic. It COMPOSES the
   sibling CJS Style Guide + Visual Template contracts (styleGuideContract.js
   / visualTemplateContract.js) — it adds NO resolution logic, NO ranking,
   NO storage.
   ============================================================ */

const sg = require('./styleGuideContract');
const vt = require('./visualTemplateContract');

/* ── schemas + enums ───────────────────────────────────────────────── */
const NOR_RETRIEVAL_CONTEXT_SCHEMA = 'nor-retrieval-context@1';
const NOR_RETRIEVAL_REQUEST_SCHEMA = 'nor-retrieval-request@1';

const RETRIEVAL_CERTIFICATION_STATUS = Object.freeze({
  CERTIFIED: 'certified', INCOMPLETE: 'incomplete', CONFLICT: 'conflict', UNAVAILABLE: 'unavailable',
});
const CERT_STATUS_VALUES = Object.freeze(Object.values(RETRIEVAL_CERTIFICATION_STATUS));
const RETRIEVAL_DOMAIN_STATUS = Object.freeze({
  RESOLVED: 'resolved', CONFLICT: 'conflict', MISSING: 'missing', UNAVAILABLE: 'unavailable',
});
const DOMAIN_STATUS_VALUES = Object.freeze(Object.values(RETRIEVAL_DOMAIN_STATUS));

const RETRIEVAL_DOCUMENT_TYPES = Object.freeze([
  vt.VISUAL_TEMPLATE_DOCUMENT_TYPE.NOR,
  vt.VISUAL_TEMPLATE_DOCUMENT_TYPE.NOTA_ORGANISASI,
  vt.VISUAL_TEMPLATE_DOCUMENT_TYPE.MEMORANDUM,
  vt.VISUAL_TEMPLATE_DOCUMENT_TYPE.LEGACY,
  vt.VISUAL_TEMPLATE_DOCUMENT_TYPE.UNKNOWN,
]);
function isRetrievalDocumentType(t) { return RETRIEVAL_DOCUMENT_TYPES.includes(t); }

const D = RETRIEVAL_DOMAIN_STATUS;
const C = RETRIEVAL_CERTIFICATION_STATUS;
const STYLE_SCOPE = sg.STYLE_GUIDE_SCOPE.ORGANIZATION;

/* ── helpers ───────────────────────────────────────────────────────── */
function str(v) { return v == null ? '' : String(v); }
function strList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean))].sort());
}
function clamp01OrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : null;
}

function makeNorRetrievalRequest(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const documentType = isRetrievalDocumentType(s.documentType) ? s.documentType : '';

  let categories = 'all';
  if (Array.isArray(s.categories)) {
    const list = [...new Set(s.categories.map(String).filter(sg.isStyleRuleCategory))].sort();
    categories = list.length ? Object.freeze(list) : 'all';
  } else if (typeof s.categories === 'string' && s.categories !== 'all' && sg.isStyleRuleCategory(s.categories)) {
    categories = Object.freeze([s.categories]);
  }

  const slots = Object.freeze(
    (Array.isArray(s.slots) ? s.slots : [])
      .filter((x) => x && typeof x === 'object' && sg.isStyleRuleCategory(x.category) && str(x.key).trim())
      .map((x) => Object.freeze({ category: String(x.category), key: String(x.key) }))
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  );

  let regionKinds = 'all';
  if (Array.isArray(s.regionKinds)) {
    const list = [...new Set(s.regionKinds.map(String).filter(vt.isVisualRegionKind))].sort();
    regionKinds = list.length ? Object.freeze(list) : 'all';
  } else if (typeof s.regionKinds === 'string' && s.regionKinds !== 'all' && vt.isVisualRegionKind(s.regionKinds)) {
    regionKinds = Object.freeze([s.regionKinds]);
  }

  return Object.freeze({
    schema: NOR_RETRIEVAL_REQUEST_SCHEMA,
    documentType,
    scope: STYLE_SCOPE,
    categories,
    slots,
    regionKinds,
    includeSupportingEvidence: s.includeSupportingEvidence !== false,
  });
}

function isNorRetrievalRequest(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== NOR_RETRIEVAL_REQUEST_SCHEMA) return false;
  if (r.scope !== STYLE_SCOPE) return false;
  if (!(r.categories === 'all' || Array.isArray(r.categories))) return false;
  if (!(r.regionKinds === 'all' || Array.isArray(r.regionKinds))) return false;
  if (!Array.isArray(r.slots)) return false;
  if (typeof r.includeSupportingEvidence !== 'boolean') return false;
  return true;
}

function makeSupportingEvidence(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const te = s.temporalEvidence && typeof s.temporalEvidence === 'object' ? s.temporalEvidence : null;
  const ev = s.evidence && typeof s.evidence === 'object' ? s.evidence : null;
  return Object.freeze({
    sourceMemoryIds: strList(s.sourceMemoryIds),
    sourceObservationIds: strList(s.sourceObservationIds),
    sourceDocumentIds: strList(s.sourceDocumentIds),
    temporalEvidence: te ? Object.freeze(Object.assign({}, te)) : null,
    evidence: ev ? Object.freeze(Object.assign({}, ev, { confidence: clamp01OrNull(ev.confidence != null ? ev.confidence : s.confidence) }))
      : (s.confidence != null ? Object.freeze({ confidence: clamp01OrNull(s.confidence) }) : null),
  });
}

function makeNorRetrievalContext(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const request = isNorRetrievalRequest(s.request) ? s.request : makeNorRetrievalRequest(s.request || {});
  const domain = (v) => (DOMAIN_STATUS_VALUES.includes(v) ? v : D.MISSING);

  const c = s.certification && typeof s.certification === 'object' ? s.certification : {};
  const certification = Object.freeze({
    status: CERT_STATUS_VALUES.includes(c.status) ? c.status : C.INCOMPLETE,
    styleGuide: Object.freeze({ status: domain(c.styleGuide && c.styleGuide.status) }),
    visualTemplate: Object.freeze({ status: domain(c.visualTemplate && c.visualTemplate.status) }),
    reasons: strList(c.reasons),
  });

  const sgIn = s.styleGuide && typeof s.styleGuide === 'object' ? s.styleGuide : {};
  const styleRules = (Array.isArray(sgIn.rules) ? sgIn.rules : []).map((r) => Object.freeze({
    scope: str(r.scope) || STYLE_SCOPE,
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
      authorityState: 'authoritative',
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

  const vtIn = s.visualTemplate && typeof s.visualTemplate === 'object' ? s.visualTemplate : {};
  const visualTemplate = Object.freeze({
    status: domain(vtIn.status),
    outcome: ['resolved', 'conflict', 'missing'].includes(vtIn.outcome) ? vtIn.outcome : 'missing',
    viaCrossType: vtIn.viaCrossType === true,
    template: vtIn.template && typeof vtIn.template === 'object' ? Object.freeze({
      templateId: str(vtIn.template.templateId),
      variant: str(vtIn.template.variant),
      templateVersion: Number.isInteger(vtIn.template.templateVersion) ? vtIn.template.templateVersion : 1,
      authorityState: 'authoritative',
      approvedAt: vtIn.template.approvedAt == null ? null : String(vtIn.template.approvedAt),
      approvedBy: vtIn.template.approvedBy == null ? null : String(vtIn.template.approvedBy),
      rationale: vtIn.template.rationale == null ? null : String(vtIn.template.rationale),
      documentType: str(vtIn.template.documentType),
      pageModel: vtIn.template.pageModel && typeof vtIn.template.pageModel === 'object' ? Object.freeze(Object.assign({}, vtIn.template.pageModel)) : null,
      regions: Object.freeze((Array.isArray(vtIn.template.regions) ? vtIn.template.regions : []).map((rg) => Object.freeze(Object.assign({}, rg)))),
      structuralRules: vtIn.template.structuralRules && typeof vtIn.template.structuralRules === 'object' ? Object.freeze(Object.assign({}, vtIn.template.structuralRules)) : null,
      typography: vtIn.template.typography && typeof vtIn.template.typography === 'object' ? Object.freeze(Object.assign({}, vtIn.template.typography)) : null,
      spacing: vtIn.template.spacing && typeof vtIn.template.spacing === 'object' ? Object.freeze(Object.assign({}, vtIn.template.spacing)) : null,
    }) : null,
    competingTemplateIds: strList(vtIn.competingTemplateIds),
    supportingEvidence: request.includeSupportingEvidence && vtIn.supportingEvidence ? makeSupportingEvidence(vtIn.supportingEvidence) : null,
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
      scope: str(x.scope) || STYLE_SCOPE,
      category: str(x.category),
      key: x.key == null ? null : String(x.key),
      documentType: str(x.documentType),
      competingRuleIds: strList(x.competingRuleIds),
      competing: Object.freeze((Array.isArray(x.competing) ? x.competing : []).map((y) => Object.freeze(Object.assign({}, y)))),
    }))),
    visualTemplate: Object.freeze((Array.isArray(cf.visualTemplate) ? cf.visualTemplate : []).map((x) => Object.freeze({
      scope: str(x.scope) || STYLE_SCOPE,
      documentType: str(x.documentType),
      competingTemplateIds: strList(x.competingTemplateIds),
      competing: Object.freeze((Array.isArray(x.competing) ? x.competing : []).map((y) => Object.freeze(Object.assign({}, y)))),
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
    styleGuide: Object.freeze({ status: domain(sgIn.status), rules: Object.freeze(styleRules) }),
    visualTemplate,
    supportingEvidence,
    conflicts,
    provenance,
  });
}

function isNorRetrievalContext(x) {
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
  if (!x.styleGuide.rules.every((r) => r.rule == null || r.rule.authorityState === 'authoritative')) return false;
  if (x.visualTemplate.template != null && x.visualTemplate.template.authorityState !== 'authoritative') return false;
  return true;
}

/* ── composition logic (mirror of nor-context-retrieval.js) ───────── */
const DOC_CROSS_TYPE = sg.DOCUMENT_TYPE_SCOPE.CROSS_TYPE;
const VT_CROSS_TYPE = vt.VISUAL_TEMPLATE_DOCUMENT_TYPE.CROSS_TYPE;

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

function resolveStyleSlot(approvedRules, scope, category, key, documentType) {
  const exact = sg.resolveEffectiveRule(approvedRules, { scope, category, key, documentType });
  if (exact.outcome === 'resolved' || exact.outcome === 'conflict') {
    return Object.assign({}, exact, { category, key, documentType, viaCrossType: false });
  }
  const cross = sg.resolveEffectiveRule(approvedRules, { scope, category, key, documentType: DOC_CROSS_TYPE });
  if (cross.outcome === 'resolved' || cross.outcome === 'conflict') {
    return Object.assign({}, cross, { category, key, documentType, viaCrossType: true });
  }
  return Object.assign({}, exact, { category, key, documentType, viaCrossType: false });
}

function planStyleSlots(approvedRules, request, documentType) {
  const relevant = approvedRules.filter((r) => r.documentType === documentType || r.documentType === DOC_CROSS_TYPE);
  if (request.slots.length) {
    return request.slots.map((s) => ({ category: s.category, key: s.key, explicit: true }));
  }
  const seen = new Map();
  for (const r of relevant) {
    const k = `${r.category}|${r.key}`;
    if (!seen.has(k)) seen.set(k, { category: r.category, key: r.key });
  }
  let slots = [...seen.values()];
  if (request.categories !== 'all') {
    const wanted = new Set(request.categories);
    slots = slots.filter((s) => wanted.has(s.category));
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
  if (outcomes.some((o) => o === 'missing')) return D.MISSING;
  return D.RESOLVED;
}

function retrieveNorContext(sources, rawRequest, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const at = o.at || new Date().toISOString();
  const request = makeNorRetrievalRequest(rawRequest);
  const scope = STYLE_SCOPE;
  const reasons = [];

  const src = sources && typeof sources === 'object' ? sources : {};
  const styleRules = Array.isArray(src.styleRules) ? src.styleRules : null;
  const visualTemplates = Array.isArray(src.visualTemplates) ? src.visualTemplates : null;

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

  let sgDomain;
  const sgSlots = [];
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
    const approved = sg.queryStyleGuide(styleRules, { status: sg.STYLE_RULE_STATUS.APPROVED });
    approvedStyleRuleCount = approved.length;
    const plan = planStyleSlots(approved, request, documentType);

    for (const p of plan) {
      if (p.synthetic || !p.key) {
        sgSlots.push({ scope, category: p.category, key: null, documentType, outcome: 'missing', viaCrossType: false, rule: null, competingRuleIds: [], supportingEvidence: null });
        continue;
      }
      const r = resolveStyleSlot(approved, scope, p.category, p.key, documentType);
      const rule = r.rule ? {
        ruleId: r.rule.ruleId, value: r.rule.value, normalizedValue: r.rule.normalizedValue,
        version: r.rule.version, approvedAt: r.rule.approvedAt, approvedBy: r.rule.approvedBy, rationale: r.rule.rationale,
      } : null;
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

    sgConflicts = sg.findStyleGuideConflicts(styleRules)
      .filter((c) => c.status === sg.STYLE_RULE_STATUS.APPROVED && (c.documentType === documentType || c.documentType === DOC_CROSS_TYPE))
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
    const approvedT = vt.queryVisualTemplates(visualTemplates, { status: vt.VISUAL_TEMPLATE_STATUS.APPROVED });
    approvedVisualTemplateCount = approvedT.length;

    let res = vt.resolveEffectiveTemplate(approvedT, { scope, documentType });
    let viaCrossType = false;
    if (res.outcome === 'missing') {
      const cross = vt.resolveEffectiveTemplate(approvedT, { scope, documentType: VT_CROSS_TYPE });
      if (cross.outcome === 'resolved' || cross.outcome === 'conflict') { res = cross; viaCrossType = true; }
    }

    const t = res.template;
    if (t) {
      seTemplateIds.push(t.templateId);
      for (const id of t.sourceObservationIds || []) seVtObsIds.push(id);
      for (const id of t.sourceDocumentIds || []) seVtDocIds.push(id);
    }

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

    vtConflicts = vt.findVisualTemplateConflicts(visualTemplates)
      .filter((c) => c.status === vt.VISUAL_TEMPLATE_STATUS.APPROVED && (c.documentType === documentType || c.documentType === VT_CROSS_TYPE))
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

  let certStatus;
  if (sgDomain === D.UNAVAILABLE || vtDomain === D.UNAVAILABLE) certStatus = C.UNAVAILABLE;
  else if (sgDomain === D.CONFLICT || vtDomain === D.CONFLICT) certStatus = C.CONFLICT;
  else if (sgDomain === D.RESOLVED && vtDomain === D.RESOLVED) certStatus = C.CERTIFIED;
  else certStatus = C.INCOMPLETE;
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

module.exports = {
  NOR_RETRIEVAL_CONTEXT_SCHEMA, NOR_RETRIEVAL_REQUEST_SCHEMA,
  RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
  RETRIEVAL_DOCUMENT_TYPES, isRetrievalDocumentType,
  makeNorRetrievalRequest, isNorRetrievalRequest,
  makeNorRetrievalContext, isNorRetrievalContext,
  retrieveNorContext,
};
