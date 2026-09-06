'use strict';

/* ============================================================
   functions/src/intelligence/generationContextContract.js — Phase 6

   The CJS mirror of the ESM Certified-Retrieval → NOR-Generation boundary:
     src/intelligence/generation/contracts/generation-context-contract.js
     src/intelligence/generation/generation-fallbacks.js
     src/intelligence/generation/certification-gate.js
     src/intelligence/generation/style-slot-resolver.js
     src/intelligence/generation/visual-template-binding.js
     src/intelligence/generation/build-generation-context.js

   The Functions runtime is CJS and must NEVER import from src/. This file
   is the whole generation-context contract + gate + deterministic
   projections + composer. It COMPOSES the sibling CJS retrieval contract
   (norRetrievalContract.js) and reuses the CJS Style Guide category
   vocabulary (styleGuideContract.js). It adds NO retrieval, NO resolution,
   NO ranking, NO storage, NO model call.

   Kept byte-for-behaviour with the ESM side —
   scripts/intelligence-nor-generation-check.cjs asserts drift parity
   (schemas, enums, and that buildGenerationContext produces identical
   output on the same retrieval context + mode).
   ============================================================ */

const rc = require('./norRetrievalContract');
const sgc = require('./styleGuideContract');

const GENERATION_CONTEXT_SCHEMA = 'intelligence-generation-context@1';

const GENERATION_MODE = Object.freeze({ LEGACY: 'legacy', INTELLIGENCE: 'intelligence' });
const MODE_VALUES = Object.freeze(Object.values(GENERATION_MODE));
function isGenerationMode(m) { return MODE_VALUES.includes(m); }

const GENERATION_GATE_OUTCOME = Object.freeze({
  ALLOWED: 'GENERATION_ALLOWED',
  ALLOWED_WITH_FALLBACK: 'GENERATION_ALLOWED_WITH_FALLBACK',
  BLOCKED_CONFLICT: 'GENERATION_BLOCKED_CONFLICT',
  BLOCKED_UNAVAILABLE: 'GENERATION_BLOCKED_UNAVAILABLE',
  BLOCKED_INCOMPLETE: 'GENERATION_BLOCKED_INCOMPLETE',
});
const GATE_VALUES = Object.freeze(Object.values(GENERATION_GATE_OUTCOME));
function isGenerationGateOutcome(o) { return GATE_VALUES.includes(o); }
const BLOCKED_OUTCOMES = Object.freeze([
  GENERATION_GATE_OUTCOME.BLOCKED_CONFLICT,
  GENERATION_GATE_OUTCOME.BLOCKED_UNAVAILABLE,
  GENERATION_GATE_OUTCOME.BLOCKED_INCOMPLETE,
]);
function isBlockedGateOutcome(o) { return BLOCKED_OUTCOMES.includes(o); }

const GENERATION_STATUS = Object.freeze({
  GENERATED: 'generated',
  GENERATED_WITH_FALLBACK: 'generated_with_fallback',
  BLOCKED_CONFLICT: 'blocked_conflict',
  BLOCKED_UNAVAILABLE: 'blocked_unavailable',
  BLOCKED_INCOMPLETE: 'blocked_incomplete',
});
const STATUS_VALUES = Object.freeze(Object.values(GENERATION_STATUS));
function isGenerationStatus(s) { return STATUS_VALUES.includes(s); }
const GATE_TO_STATUS = Object.freeze({
  [GENERATION_GATE_OUTCOME.ALLOWED]: GENERATION_STATUS.GENERATED,
  [GENERATION_GATE_OUTCOME.ALLOWED_WITH_FALLBACK]: GENERATION_STATUS.GENERATED_WITH_FALLBACK,
  [GENERATION_GATE_OUTCOME.BLOCKED_CONFLICT]: GENERATION_STATUS.BLOCKED_CONFLICT,
  [GENERATION_GATE_OUTCOME.BLOCKED_UNAVAILABLE]: GENERATION_STATUS.BLOCKED_UNAVAILABLE,
  [GENERATION_GATE_OUTCOME.BLOCKED_INCOMPLETE]: GENERATION_STATUS.BLOCKED_INCOMPLETE,
});
function generationStatusForGate(o) { return GATE_TO_STATUS[o] || GENERATION_STATUS.BLOCKED_INCOMPLETE; }

const GENERATION_STYLE_SLOT = Object.freeze({
  OPENING: 'opening',
  CLOSING: 'closing',
  RECIPIENT_LABEL: 'recipient_label',
  SUBJECT_LABEL: 'subject_label',
  DATE_FORMAT: 'date_format',
  ATTACHMENT_LABEL: 'attachment_label',
  COPY_LABEL: 'copy_label',
  SIGNATURE_LABEL: 'signature_label',
  BODY_STRUCTURE: 'body_structure',
  FORMAL_TONE: 'formal_tone',
  TERMINOLOGY: 'terminology',
});
const SLOT_VALUES = Object.freeze(Object.values(GENERATION_STYLE_SLOT));
function isGenerationStyleSlot(s) { return SLOT_VALUES.includes(s); }

const STYLE_SLOT_CATEGORY_MAP = Object.freeze({
  [GENERATION_STYLE_SLOT.OPENING]: Object.freeze(['opening_pattern']),
  [GENERATION_STYLE_SLOT.CLOSING]: Object.freeze(['closing_pattern']),
  [GENERATION_STYLE_SLOT.RECIPIENT_LABEL]: Object.freeze(['recipient_convention']),
  [GENERATION_STYLE_SLOT.SUBJECT_LABEL]: Object.freeze(['subject_convention']),
  [GENERATION_STYLE_SLOT.DATE_FORMAT]: Object.freeze(['date_convention']),
  [GENERATION_STYLE_SLOT.ATTACHMENT_LABEL]: Object.freeze(['attachment_convention']),
  [GENERATION_STYLE_SLOT.COPY_LABEL]: Object.freeze(['copy_convention']),
  [GENERATION_STYLE_SLOT.SIGNATURE_LABEL]: Object.freeze(['signature_wording']),
  [GENERATION_STYLE_SLOT.BODY_STRUCTURE]: Object.freeze(['body_structure']),
  [GENERATION_STYLE_SLOT.FORMAL_TONE]: Object.freeze(['formal_tone']),
  [GENERATION_STYLE_SLOT.TERMINOLOGY]: Object.freeze(['terminology', 'organizational_term', 'preferred_phrase']),
});
const SINGLE_VALUE_SLOTS = Object.freeze(SLOT_VALUES.filter((s) => s !== GENERATION_STYLE_SLOT.TERMINOLOGY));

for (const cats of Object.values(STYLE_SLOT_CATEGORY_MAP)) {
  for (const c of cats) {
    if (!sgc.STYLE_RULE_CATEGORIES.includes(c)) {
      throw new Error(`generationContextContract(cjs): "${c}" is not a STYLE_RULE_CATEGORIES member.`);
    }
  }
}

const STYLE_SLOT_SOURCE = Object.freeze({
  CERTIFIED_STYLE_RULE: 'certified_style_rule',
  DETERMINISTIC_DEFAULT: 'deterministic_default',
  DETERMINISTIC_FALLBACK: 'deterministic_fallback',
});
const STYLE_SOURCE_VALUES = Object.freeze(Object.values(STYLE_SLOT_SOURCE));
function isStyleSlotSource(s) { return STYLE_SOURCE_VALUES.includes(s); }

const VISUAL_BINDING_SOURCE = Object.freeze({
  APPROVED_TEMPLATE: 'approved_template',
  DETERMINISTIC_FALLBACK: 'deterministic_fallback',
});
const VISUAL_SOURCE_VALUES = Object.freeze(Object.values(VISUAL_BINDING_SOURCE));
function isVisualBindingSource(s) { return VISUAL_SOURCE_VALUES.includes(s); }

/* ── deterministic fallback reason strings (mirror generation-fallbacks.js) ── */
const STYLE_SLOT_RENDERER_SOURCE = Object.freeze({
  [GENERATION_STYLE_SLOT.OPENING]: 'js/docs/templates/nor.js#opening',
  [GENERATION_STYLE_SLOT.CLOSING]: 'js/docs/templates/nor.js#closing',
  [GENERATION_STYLE_SLOT.RECIPIENT_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.SUBJECT_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.DATE_FORMAT]: 'js/docs/templates/nor.js#dateLong',
  [GENERATION_STYLE_SLOT.ATTACHMENT_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.COPY_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.SIGNATURE_LABEL]: 'js/docs/doc-theme.js#signatureBlock',
  [GENERATION_STYLE_SLOT.BODY_STRUCTURE]: 'src/intelligence/service/nor-draft-assembler.js#templateBody',
  [GENERATION_STYLE_SLOT.FORMAL_TONE]: 'src/intelligence/service/nor-draft-assembler.js#modelBody',
  [GENERATION_STYLE_SLOT.TERMINOLOGY]: '(none — absence of a term rule imposes no constraint)',
});
const SLOT_LABEL = Object.freeze({
  [GENERATION_STYLE_SLOT.OPENING]: 'opening salutation',
  [GENERATION_STYLE_SLOT.CLOSING]: 'closing sentence',
  [GENERATION_STYLE_SLOT.RECIPIENT_LABEL]: 'recipient label',
  [GENERATION_STYLE_SLOT.SUBJECT_LABEL]: 'subject label',
  [GENERATION_STYLE_SLOT.DATE_FORMAT]: 'date convention',
  [GENERATION_STYLE_SLOT.ATTACHMENT_LABEL]: 'attachment label',
  [GENERATION_STYLE_SLOT.COPY_LABEL]: 'copy / tembusan label',
  [GENERATION_STYLE_SLOT.SIGNATURE_LABEL]: 'signature wording',
  [GENERATION_STYLE_SLOT.BODY_STRUCTURE]: 'body structure',
  [GENERATION_STYLE_SLOT.FORMAL_TONE]: 'formal tone',
  [GENERATION_STYLE_SLOT.TERMINOLOGY]: 'organizational terminology',
});
function styleFallbackReason(slot, kind) {
  const label = SLOT_LABEL[slot] || String(slot || 'slot');
  const owner = STYLE_SLOT_RENDERER_SOURCE[slot] || 'the deterministic renderer';
  if (kind === STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT) {
    return `No approved Style Guide rule for the ${label}; used the established `
      + `deterministic NOR convention (${owner}). Certified organizational context `
      + `carries no rule that this overrides.`;
  }
  return `The Style Guide could not certify a ${label} rule; fell back to the `
    + `established deterministic NOR convention (${owner}). This output is not `
    + `certified for the ${label}.`;
}
const STYLE_SLOT_DEFAULT_REASON = Object.freeze(Object.fromEntries(
  SLOT_VALUES.map((s) => [s, styleFallbackReason(s, STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT)]),
));
const STYLE_SLOT_FALLBACK_REASON = Object.freeze(Object.fromEntries(
  SLOT_VALUES.map((s) => [s, styleFallbackReason(s, STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK)]),
));
const VISUAL_RENDERER_SOURCE = 'js/docs/design-system/document-design-system.js#nor@v1';
function visualFallbackReason() {
  return `No approved Visual Template for this document type; the established `
    + `deterministic NOR layout (${VISUAL_RENDERER_SOURCE}) is the only safe `
    + `renderer. The official document's physical layout is not certified.`;
}

/* ── helpers ───────────────────────────────────────────────────────── */
function str(v) { return v == null ? '' : String(v); }
function strList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean))].sort());
}
function intOrNull(v) { return Number.isInteger(v) ? v : null; }
function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function makeGenerationStyleSlot(seed) {
  const s = isPlainObject(seed) ? seed : {};
  const slot = isGenerationStyleSlot(s.slot) ? s.slot : null;
  const source = isStyleSlotSource(s.source) ? s.source : STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK;
  const isRule = source === STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE;
  return Object.freeze({
    slot,
    source,
    ruleId: isRule && s.ruleId != null ? String(s.ruleId) : null,
    version: isRule ? intOrNull(s.version) : null,
    category: s.category != null ? String(s.category) : null,
    key: s.key != null ? String(s.key) : null,
    documentType: s.documentType != null ? String(s.documentType) : null,
    viaCrossType: s.viaCrossType === true,
    value: isRule && s.value != null ? String(s.value) : null,
    reason: !isRule && s.reason != null ? String(s.reason) : null,
  });
}

function makeGenerationStyleContext(seed) {
  const s = isPlainObject(seed) ? seed : {};
  const rawSlots = isPlainObject(s.slots) ? s.slots : {};
  const slots = {};
  for (const key of SINGLE_VALUE_SLOTS) {
    if (rawSlots[key]) slots[key] = makeGenerationStyleSlot(Object.assign({}, rawSlots[key], { slot: key }));
  }
  const terminology = (Array.isArray(s.terminology) ? s.terminology : [])
    .map((t) => makeGenerationStyleSlot(Object.assign({}, t, { slot: GENERATION_STYLE_SLOT.TERMINOLOGY })))
    .sort((a, b) => (str(a.key) < str(b.key) ? -1 : str(a.key) > str(b.key) ? 1 : 0));
  const certifiedRuleIds = strList([]
    .concat(Object.values(slots).filter((x) => x.ruleId).map((x) => x.ruleId))
    .concat(terminology.filter((x) => x.ruleId).map((x) => x.ruleId)));
  const fallbacks = []
    .concat(Object.values(slots), terminology)
    .filter((x) => x.source === STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK)
    .map((x) => Object.freeze({ slot: x.slot, reason: x.reason || 'deterministic fallback' }))
    .sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  return Object.freeze({
    slots: Object.freeze(slots),
    terminology: Object.freeze(terminology),
    certifiedRuleIds,
    fallbacks: Object.freeze(fallbacks),
  });
}

function makeVisualBinding(seed) {
  const s = isPlainObject(seed) ? seed : {};
  const source = isVisualBindingSource(s.source) ? s.source : VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK;
  const isApproved = source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE;
  return Object.freeze({
    source,
    templateId: isApproved && s.templateId != null ? String(s.templateId) : null,
    templateVersion: isApproved ? intOrNull(s.templateVersion) : null,
    variant: isApproved && s.variant != null ? String(s.variant) : null,
    viaCrossType: s.viaCrossType === true,
    pageModel: isApproved && isPlainObject(s.pageModel) ? Object.freeze(Object.assign({}, s.pageModel)) : null,
    regions: isApproved && Array.isArray(s.regions)
      ? Object.freeze(s.regions.map((r) => Object.freeze(Object.assign({}, r)))) : Object.freeze([]),
    typography: isApproved && isPlainObject(s.typography) ? Object.freeze(Object.assign({}, s.typography)) : null,
    spacing: isApproved && isPlainObject(s.spacing) ? Object.freeze(Object.assign({}, s.spacing)) : null,
    structuralRules: isApproved && isPlainObject(s.structuralRules) ? Object.freeze(Object.assign({}, s.structuralRules)) : null,
    reason: !isApproved && s.reason != null ? String(s.reason) : null,
  });
}

function makeGenerationContext(seed) {
  const s = isPlainObject(seed) ? seed : {};
  const mode = isGenerationMode(s.mode) ? s.mode : GENERATION_MODE.LEGACY;
  const gate = isGenerationGateOutcome(s.gate) ? s.gate : GENERATION_GATE_OUTCOME.BLOCKED_INCOMPLETE;
  const status = isGenerationStatus(s.status) ? s.status : generationStatusForGate(gate);
  const blocked = isBlockedGateOutcome(gate);

  const r = isPlainObject(s.retrieval) ? s.retrieval : {};
  const retrieval = Object.freeze({
    certification: Object.values(rc.RETRIEVAL_CERTIFICATION_STATUS).includes(r.certification)
      ? r.certification : rc.RETRIEVAL_CERTIFICATION_STATUS.INCOMPLETE,
    styleGuideStatus: Object.values(rc.RETRIEVAL_DOMAIN_STATUS).includes(r.styleGuideStatus)
      ? r.styleGuideStatus : rc.RETRIEVAL_DOMAIN_STATUS.MISSING,
    visualTemplateStatus: Object.values(rc.RETRIEVAL_DOMAIN_STATUS).includes(r.visualTemplateStatus)
      ? r.visualTemplateStatus : rc.RETRIEVAL_DOMAIN_STATUS.MISSING,
    documentType: rc.RETRIEVAL_DOCUMENT_TYPES.includes(r.documentType) ? r.documentType : str(r.documentType),
    retrievedAt: str(r.retrievedAt) || null,
  });

  const style = makeGenerationStyleContext(s.style || {});
  const visual = makeVisualBinding(s.visual || {});

  const fallbacks = (Array.isArray(s.fallbacks) ? s.fallbacks : [])
    .filter(isPlainObject)
    .map((f) => Object.freeze({
      area: f.area === 'visual' ? 'visual' : 'style',
      slot: f.slot != null ? String(f.slot) : null,
      reason: str(f.reason) || 'deterministic fallback',
    }))
    .sort((a, b) => {
      const ka = `${a.area}|${a.slot || ''}`;
      const kb = `${b.area}|${b.slot || ''}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  const cf = isPlainObject(s.conflicts) ? s.conflicts : {};
  const conflicts = Object.freeze({
    styleGuide: Object.freeze((Array.isArray(cf.styleGuide) ? cf.styleGuide : []).map((x) => Object.freeze({
      category: str(x.category),
      key: x.key == null ? null : String(x.key),
      documentType: str(x.documentType),
      competingRuleIds: strList(x.competingRuleIds),
    })).sort((a, b) => {
      const ka = `${a.category}|${a.key || ''}|${a.documentType}`;
      const kb = `${b.category}|${b.key || ''}|${b.documentType}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })),
    visualTemplate: Object.freeze((Array.isArray(cf.visualTemplate) ? cf.visualTemplate : []).map((x) => Object.freeze({
      documentType: str(x.documentType),
      competingTemplateIds: strList(x.competingTemplateIds),
    })).sort((a, b) => (a.documentType < b.documentType ? -1 : a.documentType > b.documentType ? 1 : 0))),
  });

  const sn = isPlainObject(s.snapshot) ? s.snapshot : {};
  const snapshot = Object.freeze({
    styleRuleIds: strList(sn.styleRuleIds),
    visualTemplateIds: strList(sn.visualTemplateIds),
    styleGuideSchema: 'pbsi-nor-style-guide@1',
    visualTemplateSchema: 'pbsi-visual-template@1',
    retrievalSchema: 'nor-retrieval-context@1',
  });

  return Object.freeze({
    schema: GENERATION_CONTEXT_SCHEMA,
    mode, gate, status, blocked,
    reasons: strList(s.reasons),
    generatedAt: str(s.generatedAt) || new Date().toISOString(),
    retrieval, style, visual,
    fallbacks: Object.freeze(fallbacks),
    conflicts, snapshot,
    note: 'Certified retrieval is the authority boundary. Generation is the consumer. '
      + 'The generator never promotes evidence into authority, never approves, never resolves a conflict.',
  });
}

function isGenerationContext(x) {
  if (!isPlainObject(x)) return false;
  if (x.schema !== GENERATION_CONTEXT_SCHEMA) return false;
  if (!isGenerationMode(x.mode)) return false;
  if (!isGenerationGateOutcome(x.gate)) return false;
  if (!isGenerationStatus(x.status)) return false;
  if (typeof x.blocked !== 'boolean') return false;
  if (x.blocked !== isBlockedGateOutcome(x.gate)) return false;
  if (!Array.isArray(x.reasons)) return false;
  if (!isPlainObject(x.retrieval)) return false;
  if (!isPlainObject(x.style) || !isPlainObject(x.style.slots) || !Array.isArray(x.style.terminology)) return false;
  if (!isPlainObject(x.visual) || !isVisualBindingSource(x.visual.source)) return false;
  if (!Array.isArray(x.fallbacks)) return false;
  if (!isPlainObject(x.conflicts) || !Array.isArray(x.conflicts.styleGuide) || !Array.isArray(x.conflicts.visualTemplate)) return false;
  if (!isPlainObject(x.snapshot) || !Array.isArray(x.snapshot.styleRuleIds) || !Array.isArray(x.snapshot.visualTemplateIds)) return false;
  const allSlots = [].concat(Object.values(x.style.slots), x.style.terminology);
  for (const sl of allSlots) {
    if (!isPlainObject(sl)) return false;
    if (sl.source === STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE) {
      if (!sl.ruleId) return false;
      if (x.blocked) return false;
    } else if (sl.ruleId) {
      return false;
    }
  }
  if (x.blocked && x.visual.source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE) return false;
  return true;
}

/* ── certification gate (mirror of certification-gate.js) ─────────── */
const C = rc.RETRIEVAL_CERTIFICATION_STATUS;
const D = rc.RETRIEVAL_DOMAIN_STATUS;
const G = GENERATION_GATE_OUTCOME;

function gateDecision(outcome, reasons, flags) {
  const deduped = [...new Set(reasons.map(String))];
  return Object.freeze({
    outcome,
    status: generationStatusForGate(outcome),
    blocked: isBlockedGateOutcome(outcome),
    reasons: Object.freeze(deduped),
    styleAuthorityUsable: flags.styleAuthorityUsable === true,
    visualAuthorityUsable: flags.visualAuthorityUsable === true,
    styleFallback: flags.styleFallback === true,
    visualFallback: flags.visualFallback === true,
  });
}

function evaluateGenerationContext(retrievalContext) {
  const reasons = [];
  if (!rc.isNorRetrievalContext(retrievalContext)) {
    return gateDecision(G.BLOCKED_INCOMPLETE, [
      'The certified retrieval context is missing or malformed; generation cannot proceed.',
    ], { styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false });
  }
  const cert = retrievalContext.certification || {};
  const certStatus = cert.status;
  const sgStatus = cert.styleGuide && typeof cert.styleGuide.status === 'string' ? cert.styleGuide.status : null;
  const vtStatus = cert.visualTemplate && typeof cert.visualTemplate.status === 'string' ? cert.visualTemplate.status : null;
  for (const r of Array.isArray(cert.reasons) ? cert.reasons : []) reasons.push(String(r));

  if (certStatus === C.UNAVAILABLE || sgStatus === D.UNAVAILABLE || vtStatus === D.UNAVAILABLE) {
    reasons.push('Certified organizational context was unavailable — a required authority subsystem could not be queried.');
    return gateDecision(G.BLOCKED_UNAVAILABLE, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
    });
  }
  if (certStatus === C.CONFLICT || sgStatus === D.CONFLICT || vtStatus === D.CONFLICT) {
    reasons.push('Generation blocked: an organizational convention is currently conflicting. No side was chosen.');
    return gateDecision(G.BLOCKED_CONFLICT, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
    });
  }
  if (vtStatus === D.MISSING) {
    reasons.push('Generation blocked: no approved Visual Template exists for this document type. '
      + 'The official layout must be approved by a human before Intelligence generation.');
    return gateDecision(G.BLOCKED_INCOMPLETE, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: true,
    });
  }
  if (sgStatus === D.MISSING) {
    reasons.push('No approved Style Guide rule exists for one or more wording slots; '
      + 'the established deterministic NOR wording was used. This output is not certified for those slots.');
    return gateDecision(G.ALLOWED_WITH_FALLBACK, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: true, styleFallback: true, visualFallback: false,
    });
  }
  if (sgStatus === D.RESOLVED && vtStatus === D.RESOLVED) {
    if (certStatus !== C.CERTIFIED) {
      reasons.push('Retrieval domains resolved but overall certification is not `certified`; generation blocked.');
      return gateDecision(G.BLOCKED_INCOMPLETE, reasons, {
        styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
      });
    }
    reasons.push('Every authoritative component resolved from approved organizational sources without conflict.');
    return gateDecision(G.ALLOWED, reasons, {
      styleAuthorityUsable: true, visualAuthorityUsable: true, styleFallback: false, visualFallback: false,
    });
  }
  reasons.push('The certified retrieval context is incomplete in a way that has no safe deterministic default; generation blocked.');
  return gateDecision(G.BLOCKED_INCOMPLETE, reasons, {
    styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
  });
}

/* ── style-slot resolver (mirror of style-slot-resolver.js) ───────── */
const CATEGORY_TO_SLOT = Object.freeze((() => {
  const out = {};
  for (const [slot, cats] of Object.entries(STYLE_SLOT_CATEGORY_MAP)) {
    for (const c of cats) out[c] = slot;
  }
  return out;
})());
function sortByKey(a, b) {
  const ka = String(a.key == null ? '' : a.key);
  const kb = String(b.key == null ? '' : b.key);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
function resolveStyleSlots(retrievalContext, gd) {
  const g = gd || {};
  const usable = g.styleAuthorityUsable === true;
  const fallbackMode = g.styleFallback === true;
  const contextRules = (retrievalContext && retrievalContext.styleGuide && Array.isArray(retrievalContext.styleGuide.rules))
    ? retrievalContext.styleGuide.rules : [];
  const resolved = usable
    ? contextRules.filter((r) => r && r.outcome === 'resolved' && r.rule && r.rule.ruleId)
    : [];
  const bySlot = new Map();
  for (const r of resolved) {
    const slot = CATEGORY_TO_SLOT[r.category];
    if (!slot) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(r);
  }
  const slots = {};
  for (const slot of SINGLE_VALUE_SLOTS) {
    const hits = (bySlot.get(slot) || []).slice().sort(sortByKey);
    if (hits.length) {
      const r = hits[0];
      slots[slot] = {
        slot, source: STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE,
        ruleId: r.rule.ruleId, version: Number.isInteger(r.rule.version) ? r.rule.version : null,
        category: r.category, key: r.key, documentType: r.documentType,
        viaCrossType: r.viaCrossType === true, value: r.rule.value,
      };
    } else if (fallbackMode) {
      slots[slot] = { slot, source: STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK, reason: STYLE_SLOT_FALLBACK_REASON[slot] };
    } else {
      slots[slot] = { slot, source: STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT, reason: STYLE_SLOT_DEFAULT_REASON[slot] };
    }
  }
  const terminology = (bySlot.get(GENERATION_STYLE_SLOT.TERMINOLOGY) || [])
    .slice().sort(sortByKey)
    .map((r) => ({
      slot: GENERATION_STYLE_SLOT.TERMINOLOGY, source: STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE,
      ruleId: r.rule.ruleId, version: Number.isInteger(r.rule.version) ? r.rule.version : null,
      category: r.category, key: r.key, documentType: r.documentType,
      viaCrossType: r.viaCrossType === true, value: r.rule.value,
    }));
  return makeGenerationStyleContext({ slots, terminology });
}

/* ── visual-template binding (mirror of visual-template-binding.js) ─ */
function bindVisualTemplate(retrievalContext, gd) {
  const g = gd || {};
  const usable = g.visualAuthorityUsable === true;
  const vt = retrievalContext && retrievalContext.visualTemplate ? retrievalContext.visualTemplate : null;
  const tpl = usable && vt && vt.outcome === 'resolved' && vt.template && vt.template.templateId ? vt.template : null;
  if (!tpl) {
    return makeVisualBinding({ source: VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK, reason: visualFallbackReason() });
  }
  return makeVisualBinding({
    source: VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE,
    templateId: tpl.templateId,
    templateVersion: Number.isInteger(tpl.templateVersion) ? tpl.templateVersion : null,
    variant: tpl.variant || null,
    viaCrossType: vt.viaCrossType === true,
    pageModel: tpl.pageModel || null,
    regions: Array.isArray(tpl.regions) ? tpl.regions : [],
    typography: tpl.typography || null,
    spacing: tpl.spacing || null,
    structuralRules: tpl.structuralRules || null,
  });
}

/* ── composer (mirror of build-generation-context.js) ─────────────── */
function retrievalSummary(ctx) {
  const cert = (ctx && ctx.certification) || {};
  return {
    certification: cert.status || null,
    styleGuideStatus: (cert.styleGuide && cert.styleGuide.status) || null,
    visualTemplateStatus: (cert.visualTemplate && cert.visualTemplate.status) || null,
    documentType: (ctx && ctx.request && ctx.request.documentType) || null,
    retrievedAt: (ctx && ctx.generatedAt) || null,
  };
}
function conflictRefs(ctx) {
  const cf = (ctx && ctx.conflicts) || {};
  return {
    styleGuide: (Array.isArray(cf.styleGuide) ? cf.styleGuide : []).map((x) => ({
      category: x.category, key: x.key == null ? null : x.key,
      documentType: x.documentType, competingRuleIds: x.competingRuleIds || [],
    })),
    visualTemplate: (Array.isArray(cf.visualTemplate) ? cf.visualTemplate : []).map((x) => ({
      documentType: x.documentType, competingTemplateIds: x.competingTemplateIds || [],
    })),
  };
}
function buildGenerationContext(retrievalContext, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const at = o.at || new Date().toISOString();
  const mode = isGenerationMode(o.mode) ? o.mode : GENERATION_MODE.INTELLIGENCE;

  const gate = evaluateGenerationContext(retrievalContext);
  const valid = rc.isNorRetrievalContext(retrievalContext);
  const blocked = isBlockedGateOutcome(gate.outcome);

  const style = resolveStyleSlots(valid ? retrievalContext : {}, blocked
    ? { styleAuthorityUsable: false, styleFallback: true } : gate);
  const visual = bindVisualTemplate(valid ? retrievalContext : {}, blocked
    ? { visualAuthorityUsable: false } : gate);

  const fallbacks = [];
  if (!blocked) {
    for (const f of style.fallbacks) fallbacks.push({ area: 'style', slot: f.slot, reason: f.reason });
    if (gate.visualFallback && visual.reason) fallbacks.push({ area: 'visual', slot: null, reason: visual.reason });
  }

  const snapshotIds = valid && retrievalContext.supportingEvidence
    ? {
      styleRuleIds: (retrievalContext.supportingEvidence.styleGuide
        && retrievalContext.supportingEvidence.styleGuide.ruleIds) || [],
      visualTemplateIds: (retrievalContext.supportingEvidence.visualTemplate
        && retrievalContext.supportingEvidence.visualTemplate.templateIds) || [],
    }
    : { styleRuleIds: [], visualTemplateIds: [] };

  return makeGenerationContext({
    mode,
    gate: gate.outcome,
    status: gate.status,
    reasons: gate.reasons,
    generatedAt: at,
    retrieval: retrievalSummary(valid ? retrievalContext : {}),
    style,
    visual,
    fallbacks,
    conflicts: conflictRefs(valid ? retrievalContext : {}),
    snapshot: snapshotIds,
  });
}

module.exports = {
  GENERATION_CONTEXT_SCHEMA,
  GENERATION_MODE, isGenerationMode,
  GENERATION_GATE_OUTCOME, isGenerationGateOutcome, isBlockedGateOutcome,
  GENERATION_STATUS, isGenerationStatus, generationStatusForGate,
  GENERATION_STYLE_SLOT, isGenerationStyleSlot, STYLE_SLOT_CATEGORY_MAP, SINGLE_VALUE_SLOTS,
  STYLE_SLOT_SOURCE, isStyleSlotSource, VISUAL_BINDING_SOURCE, isVisualBindingSource,
  STYLE_SLOT_DEFAULT_REASON, STYLE_SLOT_FALLBACK_REASON, visualFallbackReason,
  makeGenerationStyleSlot, makeGenerationStyleContext, makeVisualBinding,
  makeGenerationContext, isGenerationContext,
  evaluateGenerationContext, resolveStyleSlots, bindVisualTemplate, buildGenerationContext,
};
