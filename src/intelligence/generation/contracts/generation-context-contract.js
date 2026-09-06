/* ============================================================
   GENERATION-CONTEXT-CONTRACT.JS — Certified Retrieval → NOR Generation
   (V2, Phase 6)

   PURPOSE: fix the shape of ONE Generation Context — the structured,
   deterministic, machine-readable object the NOR generator consumes to know:

     • which generation MODE it is running in (legacy | intelligence),
     • whether it is ALLOWED to proceed at all (the certification gate),
     • which APPROVED organizational wording rules bind which generation slot,
     • which APPROVED visual template (or deterministic fallback) the renderer
       must use,
     • what fell back to a deterministic default, and why,
     • which unresolved conflicts blocked it,
     • the exact snapshot ids retained for audit (§18, §22).

   THE BOUNDARY (Phase 6 §1, §5, §7, §17):

       Certified Retrieval is the AUTHORITY boundary.
       NOR Generation is the CONSUMER.
       The generator may NOT promote evidence into authority, may NOT approve,
       may NOT resolve a conflict, may NOT infer a convention from confidence
       or frequency.

   This contract is PURE over a Phase 5.x.7 `nor-retrieval-context@1` result.
   It adds NO retrieval, NO resolution, NO ranking, NO storage, NO model call.
   Given the same retrieval context + mode it produces a byte-identical
   Generation Context (everything sorted; no object-iteration-order
   dependence — §23, §24).

   RESPONSIBILITY: GENERATION_CONTEXT_SCHEMA, GENERATION_MODE,
   GENERATION_GATE_OUTCOME (+ set), GENERATION_STATUS (+ set),
   GENERATION_STYLE_SLOT (+ set), STYLE_SLOT_CATEGORY_MAP, STYLE_SLOT_SOURCE,
   VISUAL_BINDING_SOURCE, makeGenerationContext / isGenerationContext,
   makeGenerationStyleContext, makeVisualBinding.

   DEPENDENCIES: ../../retrieval/contracts/nor-retrieval-contract.js
   (RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
   RETRIEVAL_DOCUMENT_TYPES, STYLE_RULE_CATEGORIES, VISUAL_REGION_KIND —
   reused, NOT redefined). PURE — no I/O, no DOM, no Firebase, no secret,
   no model.

   CJS mirror: functions/src/intelligence/generationContextContract.js —
   drift-guarded by scripts/intelligence-nor-generation-check.cjs.
   ============================================================ */

'use strict';

import {
  RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
  RETRIEVAL_DOCUMENT_TYPES, STYLE_RULE_CATEGORIES,
} from '../../retrieval/contracts/nor-retrieval-contract.js';

export const GENERATION_CONTEXT_SCHEMA = 'intelligence-generation-context@1';

/** §4 — explicit generation modes. NEVER implicitly detected. `legacy` is
 *  the default and the ONLY reachable mode while the feature flag is OFF;
 *  `intelligence` is opt-in (config.generation.certifiedRetrieval === true
 *  AND the master flag ON). */
export const GENERATION_MODE = Object.freeze({
  LEGACY: 'legacy',
  INTELLIGENCE: 'intelligence',
});
const MODE_VALUES = Object.freeze(Object.values(GENERATION_MODE));
export function isGenerationMode(m) { return MODE_VALUES.includes(m); }

/** §6 — the deterministic certification-gate outcomes. */
export const GENERATION_GATE_OUTCOME = Object.freeze({
  ALLOWED: 'GENERATION_ALLOWED',
  ALLOWED_WITH_FALLBACK: 'GENERATION_ALLOWED_WITH_FALLBACK',
  BLOCKED_CONFLICT: 'GENERATION_BLOCKED_CONFLICT',
  BLOCKED_UNAVAILABLE: 'GENERATION_BLOCKED_UNAVAILABLE',
  BLOCKED_INCOMPLETE: 'GENERATION_BLOCKED_INCOMPLETE',
});
const GATE_VALUES = Object.freeze(Object.values(GENERATION_GATE_OUTCOME));
export function isGenerationGateOutcome(o) { return GATE_VALUES.includes(o); }
const BLOCKED_OUTCOMES = Object.freeze([
  GENERATION_GATE_OUTCOME.BLOCKED_CONFLICT,
  GENERATION_GATE_OUTCOME.BLOCKED_UNAVAILABLE,
  GENERATION_GATE_OUTCOME.BLOCKED_INCOMPLETE,
]);
export function isBlockedGateOutcome(o) { return BLOCKED_OUTCOMES.includes(o); }

/** §9, §37 — the generation STATUS carried onto the draft/response. A
 *  `blocked_*` status is a visible WARNING, never ordinary metadata. */
export const GENERATION_STATUS = Object.freeze({
  GENERATED: 'generated',                       // ALLOWED
  GENERATED_WITH_FALLBACK: 'generated_with_fallback', // ALLOWED_WITH_FALLBACK
  BLOCKED_CONFLICT: 'blocked_conflict',
  BLOCKED_UNAVAILABLE: 'blocked_unavailable',
  BLOCKED_INCOMPLETE: 'blocked_incomplete',
});
const STATUS_VALUES = Object.freeze(Object.values(GENERATION_STATUS));
export function isGenerationStatus(s) { return STATUS_VALUES.includes(s); }

const GATE_TO_STATUS = Object.freeze({
  [GENERATION_GATE_OUTCOME.ALLOWED]: GENERATION_STATUS.GENERATED,
  [GENERATION_GATE_OUTCOME.ALLOWED_WITH_FALLBACK]: GENERATION_STATUS.GENERATED_WITH_FALLBACK,
  [GENERATION_GATE_OUTCOME.BLOCKED_CONFLICT]: GENERATION_STATUS.BLOCKED_CONFLICT,
  [GENERATION_GATE_OUTCOME.BLOCKED_UNAVAILABLE]: GENERATION_STATUS.BLOCKED_UNAVAILABLE,
  [GENERATION_GATE_OUTCOME.BLOCKED_INCOMPLETE]: GENERATION_STATUS.BLOCKED_INCOMPLETE,
});
export function generationStatusForGate(outcome) {
  return GATE_TO_STATUS[outcome] || GENERATION_STATUS.BLOCKED_INCOMPLETE;
}

/** §12 — the named generation slots a Style Guide rule may bind. A rule
 *  only applies if its category maps to a slot HERE — no rule is ever
 *  applied globally merely because it exists. The literal deterministic
 *  wording for each slot lives in the renderer / assembler (js/docs
 *  templates + nor-draft-assembler.js), never here — this contract only
 *  NAMES the slot and records which source filled it. */
export const GENERATION_STYLE_SLOT = Object.freeze({
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
  TERMINOLOGY: 'terminology',        // a LIST slot — many approved term rules may apply
});
const SLOT_VALUES = Object.freeze(Object.values(GENERATION_STYLE_SLOT));
export function isGenerationStyleSlot(s) { return SLOT_VALUES.includes(s); }
export const GENERATION_STYLE_SLOT_LIST = SLOT_VALUES;

/** §12 — the deterministic slot ← Style Guide category map. Every value is a
 *  real STYLE_RULE_CATEGORIES member (validated on load). `TERMINOLOGY`
 *  aggregates three language categories into ONE list slot. Nothing here is
 *  inferred at runtime. */
export const STYLE_SLOT_CATEGORY_MAP = Object.freeze({
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

/** Slots that carry ONE value (a rule OR a deterministic default). The
 *  TERMINOLOGY slot is the only list slot — it is absent from this set. */
export const SINGLE_VALUE_SLOTS = Object.freeze(
  SLOT_VALUES.filter((s) => s !== GENERATION_STYLE_SLOT.TERMINOLOGY),
);

/* Fail fast on a broken map — a category that is not a real Style Guide
   category is a build-time bug, not a runtime surprise. */
for (const cats of Object.values(STYLE_SLOT_CATEGORY_MAP)) {
  for (const c of cats) {
    if (!STYLE_RULE_CATEGORIES.includes(c)) {
      throw new Error(`generation-context-contract: "${c}" is not a STYLE_RULE_CATEGORIES member.`);
    }
  }
}

/** §8, §12, §25 — where a resolved generation slot value came from.
 *   • certified_style_rule  — an APPROVED Phase 5.x.5 rule (the only authority)
 *   • deterministic_default — certification is `certified` but no approved
 *                             rule exists for this slot; the established
 *                             convention is used and nothing approved is
 *                             overridden (NOT a "fallback").
 *   • deterministic_fallback — certification was NOT `certified` for this
 *                             domain (a `missing`); the established
 *                             convention is used and a visible warning is
 *                             raised (§37). */
export const STYLE_SLOT_SOURCE = Object.freeze({
  CERTIFIED_STYLE_RULE: 'certified_style_rule',
  DETERMINISTIC_DEFAULT: 'deterministic_default',
  DETERMINISTIC_FALLBACK: 'deterministic_fallback',
});
const STYLE_SOURCE_VALUES = Object.freeze(Object.values(STYLE_SLOT_SOURCE));
export function isStyleSlotSource(s) { return STYLE_SOURCE_VALUES.includes(s); }

/** §13, §14, §15 — where the resolved visual layout came from.
 *   • approved_template      — an APPROVED Phase 5.x.6 Visual Template
 *   • deterministic_fallback — no approved template; the existing
 *                             deterministic renderer default is used
 *                             (Phase 6 hybrid policy BLOCKS on this for NOR;
 *                             the value exists for cross-type / future doc
 *                             types the renderer already supports). */
export const VISUAL_BINDING_SOURCE = Object.freeze({
  APPROVED_TEMPLATE: 'approved_template',
  DETERMINISTIC_FALLBACK: 'deterministic_fallback',
});
const VISUAL_SOURCE_VALUES = Object.freeze(Object.values(VISUAL_BINDING_SOURCE));
export function isVisualBindingSource(s) { return VISUAL_SOURCE_VALUES.includes(s); }

/* ── small pure helpers (house discipline — mirrors the sibling contracts) ── */
function str(v) { return v == null ? '' : String(v); }
function strList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean))].sort());
}
function intOrNull(v) { return Number.isInteger(v) ? v : null; }
function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/**
 * @typedef {Object} GenerationStyleSlot
 * @property {string} slot          - GENERATION_STYLE_SLOT.*
 * @property {string} source        - STYLE_SLOT_SOURCE.*
 * @property {string|null} ruleId   - set iff source === 'certified_style_rule'
 * @property {number|null} version
 * @property {string|null} category
 * @property {string|null} key
 * @property {string|null} documentType
 * @property {boolean} viaCrossType - the rule resolved via a `cross_type` fallback (§16 — recorded, never a rejection reason)
 * @property {string|null} value    - the verbatim approved wording, when source is a rule
 * @property {string|null} reason   - why a deterministic default/fallback was used
 */
export function makeGenerationStyleSlot(seed = {}) {
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

/**
 * @typedef {Object} GenerationStyleContext
 * @property {Object.<string,GenerationStyleSlot>} slots  - single-value slots keyed by GENERATION_STYLE_SLOT
 * @property {GenerationStyleSlot[]} terminology          - the list slot (may be [])
 * @property {string[]} certifiedRuleIds                  - every approved ruleId that bound a slot
 * @property {Array<{slot:string,reason:string}>} fallbacks - slots that used a deterministic FALLBACK (not default)
 */
export function makeGenerationStyleContext(seed = {}) {
  const s = isPlainObject(seed) ? seed : {};
  const rawSlots = isPlainObject(s.slots) ? s.slots : {};
  const slots = {};
  for (const key of SINGLE_VALUE_SLOTS) {
    if (rawSlots[key]) slots[key] = makeGenerationStyleSlot({ ...rawSlots[key], slot: key });
  }
  const terminology = (Array.isArray(s.terminology) ? s.terminology : [])
    .map((t) => makeGenerationStyleSlot({ ...t, slot: GENERATION_STYLE_SLOT.TERMINOLOGY }))
    .sort((a, b) => (str(a.key) < str(b.key) ? -1 : str(a.key) > str(b.key) ? 1 : 0));
  const certifiedRuleIds = strList([
    ...Object.values(slots).filter((x) => x.ruleId).map((x) => x.ruleId),
    ...terminology.filter((x) => x.ruleId).map((x) => x.ruleId),
  ]);
  const fallbacks = [
    ...Object.values(slots),
    ...terminology,
  ].filter((x) => x.source === STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK)
    .map((x) => Object.freeze({ slot: x.slot, reason: x.reason || 'deterministic fallback' }))
    .sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  return Object.freeze({
    slots: Object.freeze(slots),
    terminology: Object.freeze(terminology),
    certifiedRuleIds,
    fallbacks: Object.freeze(fallbacks),
  });
}

/**
 * @typedef {Object} VisualBinding
 * @property {string} source            - VISUAL_BINDING_SOURCE.*
 * @property {string|null} templateId
 * @property {number|null} templateVersion
 * @property {string|null} variant
 * @property {boolean} viaCrossType
 * @property {Object|null} pageModel     - copied verbatim from the approved template; NEVER fabricated (§14)
 * @property {Object[]} regions          - copied verbatim (may be [])
 * @property {Object|null} typography
 * @property {Object|null} spacing
 * @property {Object|null} structuralRules
 * @property {string|null} reason        - why a deterministic fallback was chosen
 */
export function makeVisualBinding(seed = {}) {
  const s = isPlainObject(seed) ? seed : {};
  const source = isVisualBindingSource(s.source) ? s.source : VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK;
  const isApproved = source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE;
  return Object.freeze({
    source,
    templateId: isApproved && s.templateId != null ? String(s.templateId) : null,
    templateVersion: isApproved ? intOrNull(s.templateVersion) : null,
    variant: isApproved && s.variant != null ? String(s.variant) : null,
    viaCrossType: s.viaCrossType === true,
    // §14/§32 — geometry is passed THROUGH untouched (nulls stay null); the
    // renderer decides what a null means. This contract never invents A4,
    // margins, coordinates, fonts or spacing.
    pageModel: isApproved && isPlainObject(s.pageModel) ? Object.freeze({ ...s.pageModel }) : null,
    regions: isApproved && Array.isArray(s.regions)
      ? Object.freeze(s.regions.map((r) => Object.freeze({ ...r })))
      : Object.freeze([]),
    typography: isApproved && isPlainObject(s.typography) ? Object.freeze({ ...s.typography }) : null,
    spacing: isApproved && isPlainObject(s.spacing) ? Object.freeze({ ...s.spacing }) : null,
    structuralRules: isApproved && isPlainObject(s.structuralRules) ? Object.freeze({ ...s.structuralRules }) : null,
    reason: !isApproved && s.reason != null ? String(s.reason) : null,
  });
}

/**
 * @typedef {Object} GenerationContext
 * @property {string} schema
 * @property {string} mode                 - GENERATION_MODE.*
 * @property {string} gate                 - GENERATION_GATE_OUTCOME.*
 * @property {string} status               - GENERATION_STATUS.*
 * @property {boolean} blocked             - true iff no authoritative draft may be assembled
 * @property {string[]} reasons            - human-readable, deterministic order
 * @property {string} generatedAt
 * @property {Object} retrieval            - { certification, styleGuideStatus, visualTemplateStatus, documentType, retrievedAt }
 * @property {GenerationStyleContext} style
 * @property {VisualBinding} visual
 * @property {Array<{area:string,slot?:string,reason:string}>} fallbacks
 * @property {Object} conflicts            - { styleGuide:[{category,key,documentType,competingRuleIds}], visualTemplate:[{documentType,competingTemplateIds}] } — refs ONLY (§18, §33)
 * @property {Object} snapshot             - { styleRuleIds:[], visualTemplateIds:[], styleGuideSchema, visualTemplateSchema }
 * @property {string} note
 */
export function makeGenerationContext(seed = {}) {
  const s = isPlainObject(seed) ? seed : {};

  const mode = isGenerationMode(s.mode) ? s.mode : GENERATION_MODE.LEGACY;
  const gate = isGenerationGateOutcome(s.gate) ? s.gate : GENERATION_GATE_OUTCOME.BLOCKED_INCOMPLETE;
  const status = isGenerationStatus(s.status) ? s.status : generationStatusForGate(gate);
  const blocked = isBlockedGateOutcome(gate);

  const r = isPlainObject(s.retrieval) ? s.retrieval : {};
  const retrieval = Object.freeze({
    certification: Object.values(RETRIEVAL_CERTIFICATION_STATUS).includes(r.certification)
      ? r.certification : RETRIEVAL_CERTIFICATION_STATUS.INCOMPLETE,
    styleGuideStatus: Object.values(RETRIEVAL_DOMAIN_STATUS).includes(r.styleGuideStatus)
      ? r.styleGuideStatus : RETRIEVAL_DOMAIN_STATUS.MISSING,
    visualTemplateStatus: Object.values(RETRIEVAL_DOMAIN_STATUS).includes(r.visualTemplateStatus)
      ? r.visualTemplateStatus : RETRIEVAL_DOMAIN_STATUS.MISSING,
    documentType: RETRIEVAL_DOCUMENT_TYPES.includes(r.documentType) ? r.documentType : str(r.documentType),
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
    mode,
    gate,
    status,
    blocked,
    reasons: strList(s.reasons),
    generatedAt: str(s.generatedAt) || new Date().toISOString(),
    retrieval,
    style,
    visual,
    fallbacks: Object.freeze(fallbacks),
    conflicts,
    snapshot,
    note: 'Certified retrieval is the authority boundary. Generation is the consumer. '
      + 'The generator never promotes evidence into authority, never approves, never resolves a conflict.',
  });
}

export function isGenerationContext(x) {
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
  // §7, §14 — a slot value that claims a rule MUST carry a ruleId; a
  // non-rule slot MUST NOT. A blocked context MUST bind no certified rule.
  const allSlots = [...Object.values(x.style.slots), ...x.style.terminology];
  for (const sl of allSlots) {
    if (!isPlainObject(sl)) return false;
    if (sl.source === STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE) {
      if (!sl.ruleId) return false;
      if (x.blocked) return false; // §9 — a blocked generation applies NO authority
    } else if (sl.ruleId) {
      return false;
    }
  }
  if (x.blocked && x.visual.source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE) return false;
  return true;
}

export {
  RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS, RETRIEVAL_DOCUMENT_TYPES, STYLE_RULE_CATEGORIES,
};
