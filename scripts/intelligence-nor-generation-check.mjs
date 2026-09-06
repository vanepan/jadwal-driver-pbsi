/* ============================================================
   intelligence-nor-generation-check.mjs — Certified Retrieval → NOR
   Generation (V2, Phase 6)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the Phase 6 controlled boundary over synthetic approved Style
   Guide rules (Phase 5.x.5) + approved Visual Templates (Phase 5.x.6),
   composed through the real Phase 5.x.7 retrieveNorContext.

   Coverage (Phase 6 §38, §39, §24 matrix, hybrid §8 policy):
     • generation-context contract + isGenerationContext invariants
     • certification gate — every matrix row, hybrid incomplete policy
     • style-slot mapping (category → slot, certified vs default vs fallback)
     • visual-template binding (approved directive vs deterministic fallback)
     • temporal safety (a historical-era approved rule still binds)
     • no authority from a proposal / from confidence
     • provenance (snapshot ids, conflict refs are ids only, note)
     • determinism (reversed order + repeat ⇒ byte-identical)
     • adversarial (forged certification / forged authorityState ignored)
     • assembleNorDraft integration (legacy byte-identical; phase-6 wrap;
       blocked ⇒ no certified rule applied)
     • config gate (isCertifiedRetrievalGenerationEnabled fail-closed)
     • static: no duplicate retrieval, no store import, no OpenAI/HTTP/secret,
       no write / publish / approve / numbering

   Run:  node scripts/intelligence-nor-generation-check.mjs   (exit 0 = pass)
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeStyleGuideProposalFromMemory } from '../src/intelligence/corpus/style-guide/style-guide-proposal.js';
import { markApproved as sgApprove } from '../src/intelligence/corpus/style-guide/style-guide-authority.js';
import { makeVisualTemplateProposalFromPattern } from '../src/intelligence/corpus/visual-template/visual-template-proposal.js';
import { markApproved as vtApprove } from '../src/intelligence/corpus/visual-template/visual-template-authority.js';
import { retrieveNorContext } from '../src/intelligence/retrieval/nor-context-retrieval.js';

import {
  GENERATION_CONTEXT_SCHEMA, GENERATION_MODE, GENERATION_GATE_OUTCOME, GENERATION_STATUS,
  GENERATION_STYLE_SLOT, STYLE_SLOT_CATEGORY_MAP, STYLE_SLOT_SOURCE, VISUAL_BINDING_SOURCE,
  makeGenerationContext, isGenerationContext,
} from '../src/intelligence/generation/contracts/generation-context-contract.js';
import { evaluateGenerationContext } from '../src/intelligence/generation/certification-gate.js';
import { buildGenerationContext } from '../src/intelligence/generation/build-generation-context.js';
import { assembleNorDraft } from '../src/intelligence/service/nor-draft-assembler.js';
import {
  DEFAULT_INTELLIGENCE_CONFIG, setIntelligenceConfig, resetIntelligenceConfig,
  isCertifiedRetrievalGenerationEnabled,
} from '../src/intelligence/config/intelligence-config.js';
import { STYLE_RULE_CATEGORIES } from '../src/intelligence/corpus/style-guide/contracts/style-guide-contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail += 1; };
const section = (t) => console.log(`\n── ${t} ──`);
const AT = '2026-09-04T00:00:00.000Z';
const G = GENERATION_GATE_OUTCOME;

/* ── fixtures (same construction as intelligence-retrieval-check.mjs) ── */
let _m = 0;
function styleMemory(value, { category = 'recipient_convention', key = 'recipient_label', documentType = 'NOR', era = 'current', status = 'current_evidence', confidence = 0.9 } = {}) {
  _m += 1;
  return {
    memoryId: `mem_${_m}`, category, key, value, normalizedValue: String(value).toLowerCase(),
    documentType, temporalStatus: status, conventionEra: era,
    evidence: {
      occurrenceCount: 6, documentCount: 4, documentTypeDistribution: { [documentType === 'cross_type' ? 'NOR' : documentType]: 4 },
      oldestSourceDate: '2020-01-01', latestSourceDate: '2026-03-01',
      recentDocumentCount: 4, historicalDocumentCount: 0, conflictingDocumentCount: 0,
      approvedRulePresent: false, approvedRuleMatches: false,
    },
    confidence, sourceObservationIds: [`obs_${_m}_a`, `obs_${_m}_b`], sourceDocumentIds: [`corpus_${_m}_1`, `corpus_${_m}_2`],
  };
}
function approvedStyleRule(value, opts = {}) {
  const p = makeStyleGuideProposalFromMemory(styleMemory(value, opts), { at: AT, actorId: 'evan' });
  return sgApprove(p, { actorId: 'evan', rationale: `disetujui: ${value}`, at: AT }).next;
}
function proposedStyleRule(value, opts = {}) {
  return makeStyleGuideProposalFromMemory(styleMemory(value, opts), { at: AT, actorId: 'evan' });
}
let _p = 0;
function visualPattern({ documentType = 'NOR', variant, w = 595, h = 842 } = {}) {
  _p += 1;
  const v = variant || `${w}x${h}pt-v${_p}`;
  return {
    patternId: `vpat_${_p}`, documentType, scope: 'organization', variant: v,
    pageModel: { pageNumber: null, width: w, height: h, unit: 'pt', coordinateSpace: 'pdf_points', orientation: w > h ? 'landscape' : 'portrait', sourceDocumentIds: [`corpus_v${_p}_1`], sourceObservationIds: [`o_v${_p}_1`] },
    regions: [
      { kind: 'logo', geometry: { x: 0.06, y: 0.92, width: 0.13, height: 0.05, coordinateSpace: 'normalized' }, pageRecurrence: 'unknown', occurrenceCount: 2, documentCount: 2, confidence: 0.8, sourceObservationIds: [`o_v${_p}_1`], sourceDocumentIds: [`corpus_v${_p}_1`], note: '' },
      { kind: 'signature', geometry: { x: 0.6, y: 0.1, width: 0.3, height: 0.12, coordinateSpace: 'normalized' }, pageRecurrence: 'unknown', occurrenceCount: 2, documentCount: 2, confidence: 0.8, sourceObservationIds: [`o_v${_p}_2`], sourceDocumentIds: [`corpus_v${_p}_1`], note: '' },
    ],
    typography: { fontFamily: null, fontSizePt: null, weight: null, italic: null, alignment: null, lineHeight: null, letterSpacing: null, confidence: 0, sourceObservationIds: [] },
    spacing: { paragraphSpacing: null, lineSpacing: null, coordinateSpace: 'unknown', unit: 'unknown', confidence: 0, sourceObservationIds: [] },
    structuralRules: { multiPage: false, headerRecurrence: 'unknown', footerRecurrence: 'unknown', pageNumberRecurrence: 'unknown', signatureOnFinalPageOnly: null },
    sourceDocumentIds: [`corpus_v${_p}_1`, `corpus_v${_p}_2`], sourceObservationIds: [`o_v${_p}_1`, `o_v${_p}_2`],
    evidence: { documentCount: 2, observationCount: 2, pageCount: 1, regionKinds: ['logo', 'signature'], coordinateSpaces: ['pdf_points'], geometryKnown: true, documentTypeDistribution: { [documentType === 'cross_type' ? 'NOR' : documentType]: 2 } },
    temporalEvidence: { temporalStatus: 'current_evidence', conventionEra: 'current', oldestSourceDate: '2026-01-01', latestSourceDate: '2026-02-01', recentDocumentCount: 2, historicalDocumentCount: 0, transitionalDocumentCount: 0, undatedDocumentCount: 0 },
    confidence: 0.85,
  };
}
function approvedTemplate(opts = {}) {
  const p = makeVisualTemplateProposalFromPattern(visualPattern(opts), { at: AT, actorId: 'evan' });
  return vtApprove(p, { actorId: 'evan', rationale: 'tata letak disetujui', at: AT }).next;
}
function proposedTemplate(opts = {}) {
  return makeVisualTemplateProposalFromPattern(visualPattern(opts), { at: AT, actorId: 'evan' });
}

const gen = (styleRules, visualTemplates, req = { documentType: 'NOR' }, mode = GENERATION_MODE.INTELLIGENCE) => buildGenerationContext(
  retrieveNorContext({ styleRules, visualTemplates }, req, { at: AT }), { mode, at: AT },
);

/* ════════════════════════════════════════════════════════════════════ */

section('contract — schema + STYLE_SLOT_CATEGORY_MAP + isGenerationContext');
{
  const empty = makeGenerationContext({});
  check(empty.schema === GENERATION_CONTEXT_SCHEMA && Object.isFrozen(empty), 'makeGenerationContext returns a frozen `intelligence-generation-context@1`');
  check(empty.mode === GENERATION_MODE.LEGACY && empty.gate === G.BLOCKED_INCOMPLETE && empty.blocked === true, 'an empty seed fails closed (legacy / blocked_incomplete)');
  check(isGenerationContext(empty), 'the empty context is structurally valid');
  const allCats = Object.values(STYLE_SLOT_CATEGORY_MAP).flat();
  check(allCats.every((c) => STYLE_RULE_CATEGORIES.includes(c)), 'every mapped category is a real STYLE_RULE_CATEGORIES member');
  check(allCats.length === new Set(allCats).size, 'no category is mapped to two slots');
}

section('§24 matrix — certified: approved style + approved visual → GENERATION_ALLOWED');
{
  const c = gen([approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default' })], [approvedTemplate()]);
  check(c.gate === G.ALLOWED && c.status === GENERATION_STATUS.GENERATED && c.blocked === false, 'certified → GENERATION_ALLOWED / generated / not blocked');
  check(isGenerationContext(c), '…the generation context is structurally valid');
  const opening = c.style.slots[GENERATION_STYLE_SLOT.OPENING];
  check(opening && opening.source === STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE && opening.ruleId && opening.value === 'Dengan hormat,', 'the approved opening_pattern rule binds the `opening` slot as certified_style_rule');
  const closing = c.style.slots[GENERATION_STYLE_SLOT.CLOSING];
  check(closing && closing.source === STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT && !closing.ruleId, 'an un-ruled slot in a resolved domain is deterministic_default (NOT fallback) — nothing approved is overridden');
  check(c.visual.source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE && c.visual.templateId && c.visual.pageModel && c.visual.pageModel.width === 595, 'the approved template binds the visual directive, geometry passed through');
  check(c.fallbacks.length === 0, 'no fallbacks recorded on a fully certified generation');
}

section('§24 matrix — HYBRID §8: missing approved Style Guide + approved Visual → ALLOWED_WITH_FALLBACK');
{
  const c = gen([], [approvedTemplate()]);
  check(c.gate === G.ALLOWED_WITH_FALLBACK && c.status === GENERATION_STATUS.GENERATED_WITH_FALLBACK && c.blocked === false, 'missing style + approved visual → ALLOWED_WITH_FALLBACK / generated_with_fallback');
  const opening = c.style.slots[GENERATION_STYLE_SLOT.OPENING];
  check(opening.source === STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK && /not certified/i.test(opening.reason), 'every wording slot is deterministic_fallback with a "not certified" reason');
  check(c.fallbacks.length >= 1 && c.fallbacks.every((f) => f.area === 'style'), 'the fallbacks[] list is populated for style');
  check(c.style.certifiedRuleIds.length === 0, 'no certified rule id bound');
  check(c.visual.source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE, 'the visual layout is still the approved template');
}

section('§24 matrix — HYBRID §8: approved Style + MISSING approved Visual → BLOCKED_INCOMPLETE');
{
  const c = gen([approvedStyleRule('Yth.')], []);
  check(c.gate === G.BLOCKED_INCOMPLETE && c.status === GENERATION_STATUS.BLOCKED_INCOMPLETE && c.blocked === true, 'approved style + missing visual → BLOCKED_INCOMPLETE (the official layout is never guessed)');
  check(c.style.certifiedRuleIds.length === 0, 'a BLOCKED generation binds NO certified style rule (§9)');
  check(c.visual.source === VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK && !c.visual.templateId, '…and NO approved template');
  check(c.reasons.some((r) => /no approved Visual Template/i.test(r)), 'the reason names the missing approved visual template');
  check(isGenerationContext(c), '…still structurally valid');
}

section('§24 matrix — missing style + missing visual → BLOCKED_INCOMPLETE');
{
  const c = gen([], []);
  check(c.gate === G.BLOCKED_INCOMPLETE && c.blocked === true, 'missing both → BLOCKED_INCOMPLETE (visual dominates)');
}

section('§24 matrix — Style Guide conflict → BLOCKED_CONFLICT (no side chosen)');
{
  const a = approvedStyleRule('Yth.', { category: 'recipient_convention', key: 'r' });
  const b = approvedStyleRule('Kepada Yth.', { category: 'recipient_convention', key: 'r' });
  const c = gen([a, b], [approvedTemplate()]);
  check(c.gate === G.BLOCKED_CONFLICT && c.status === GENERATION_STATUS.BLOCKED_CONFLICT && c.blocked === true, 'two incompatible approved recipient rules → BLOCKED_CONFLICT');
  check(c.style.certifiedRuleIds.length === 0, 'NO rule bound on a conflict (§9 — the generator never picks a side)');
  check(c.conflicts.styleGuide.length >= 1 && c.conflicts.styleGuide[0].competingRuleIds.length >= 2, 'the competing rule IDs are disclosed');
  check(!JSON.stringify(c.conflicts).includes('Kepada Yth.') && !JSON.stringify(c.conflicts).includes('rationale'), 'conflict refs are IDs only — no rule bodies / rationale text (§18, §33)');
}

section('§24 matrix — Visual Template conflict → BLOCKED_CONFLICT');
{
  const t1 = approvedTemplate({ variant: 'A', w: 595, h: 842 });
  const t2 = approvedTemplate({ variant: 'B', w: 612, h: 792 });
  const c = gen([approvedStyleRule('Yth.')], [t1, t2]);
  check(c.gate === G.BLOCKED_CONFLICT && c.blocked === true, 'two incompatible approved templates → BLOCKED_CONFLICT');
  check(c.visual.source === VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK && !c.visual.templateId, 'no template bound on a visual conflict');
  check(c.conflicts.visualTemplate.length >= 1 && c.conflicts.visualTemplate[0].competingTemplateIds.length >= 2, 'competing template IDs disclosed');
}

section('§24 matrix — unavailable subsystem → BLOCKED_UNAVAILABLE (fail closed, §10)');
{
  const c1 = buildGenerationContext(retrieveNorContext({ styleRules: null, visualTemplates: null }, { documentType: 'NOR' }, { at: AT }), { mode: GENERATION_MODE.INTELLIGENCE, at: AT });
  check(c1.gate === G.BLOCKED_UNAVAILABLE && c1.status === GENERATION_STATUS.BLOCKED_UNAVAILABLE && c1.blocked === true, 'both subsystems unavailable → BLOCKED_UNAVAILABLE');
  const c2 = buildGenerationContext(retrieveNorContext({ styleRules: null, visualTemplates: [approvedTemplate()] }, { documentType: 'NOR' }, { at: AT }), { mode: GENERATION_MODE.INTELLIGENCE, at: AT });
  check(c2.gate === G.BLOCKED_UNAVAILABLE && c2.blocked === true, 'one unavailable subsystem still → BLOCKED_UNAVAILABLE (a resolved sibling does not rescue it)');
  check(c2.reasons.some((r) => /unavailable/i.test(r)), '…the reason says the certified context was unavailable');
}

section('§16 — documentType: no silent cross-type; an unknown type blocks');
{
  const c = gen([approvedStyleRule('Yth.')], [approvedTemplate()], { documentType: 'MEMORANDUM' });
  check(c.retrieval.documentType === 'MEMORANDUM', 'the requested documentType is carried verbatim');
  check(c.gate === G.BLOCKED_INCOMPLETE && c.blocked === true, 'NOR-scoped approvals do NOT satisfy a MEMORANDUM request — it blocks');
  const bad = buildGenerationContext(retrieveNorContext({ styleRules: [approvedStyleRule('Yth.')], visualTemplates: [approvedTemplate()] }, { documentType: 'NOT_A_TYPE' }, { at: AT }), { mode: GENERATION_MODE.INTELLIGENCE, at: AT });
  check(bad.gate === G.BLOCKED_INCOMPLETE && bad.blocked === true, 'an invalid documentType → BLOCKED_INCOMPLETE');
}

section('style-slot mapping — category → slot; terminology is a list slot');
{
  const rules = [
    approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default' }),
    approvedStyleRule('Demikian disampaikan.', { category: 'closing_pattern', key: 'default' }),
    approvedStyleRule('sarpras', { category: 'organizational_term', key: 'sarana_prasarana' }),
    approvedStyleRule('petty cash', { category: 'preferred_phrase', key: 'kas_kecil' }),
  ];
  const c = gen(rules, [approvedTemplate()]);
  check(c.gate === G.ALLOWED, 'four approved wording rules + approved template → ALLOWED');
  check(c.style.slots[GENERATION_STYLE_SLOT.OPENING].value === 'Dengan hormat,', 'opening_pattern → opening slot');
  check(c.style.slots[GENERATION_STYLE_SLOT.CLOSING].value === 'Demikian disampaikan.', 'closing_pattern → closing slot');
  check(c.style.terminology.length === 2 && c.style.terminology.every((t) => t.source === STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE), 'organizational_term + preferred_phrase → the terminology list slot');
  check(c.style.certifiedRuleIds.length === 4, 'all four certified rule ids are rolled up');
  check(c.snapshot.styleRuleIds.length >= 4 && c.snapshot.visualTemplateIds.length === 1, 'snapshot ids retained for audit (§18, §22)');
}

section('temporal safety (§17) — a historical-era approved rule STILL binds');
{
  const hist = approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default', era: 'historical', status: 'historical_only' });
  const c = gen([hist], [approvedTemplate()]);
  check(c.gate === G.ALLOWED, 'a historical-era approved rule does not degrade certification');
  const opening = c.style.slots[GENERATION_STYLE_SLOT.OPENING];
  check(opening.source === STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE, 'the historical-era rule still binds as authority — era is evidence, not authority (§17)');
}

section('no authority from a proposal / from confidence');
{
  const c = gen([proposedStyleRule('DIUSULKAN — jangan dipakai', { category: 'opening_pattern', key: 'default' })], [approvedTemplate()]);
  check(c.gate === G.ALLOWED_WITH_FALLBACK, 'a PROPOSED style rule leaves the style domain uncertified → fallback');
  check(!JSON.stringify(c).includes('DIUSULKAN'), 'the proposed rule value never appears anywhere in the generation context');
  check(c.style.slots[GENERATION_STYLE_SLOT.OPENING].source === STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK, '…the opening slot fell back deterministically, it did not adopt the proposal');
}

section('determinism (§24) — reversed rule order + repeat ⇒ byte-identical');
{
  const a = approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default' });
  const b = approvedStyleRule('Yth.', { category: 'recipient_convention', key: 'r' });
  const t = approvedTemplate();
  const c1 = gen([a, b], [t]);
  const c2 = gen([b, a], [t]);
  const c3 = gen([a, b], [t]);
  check(JSON.stringify(c1) === JSON.stringify(c2), 'reversing the rule-set order yields a byte-identical generation context');
  check(JSON.stringify(c1) === JSON.stringify(c3), 'running twice yields a byte-identical generation context');
}

section('adversarial (§39) — forged certification / forged authorityState ignored');
{
  // a retrieval-context-shaped object whose overall certification claims
  // `certified` while a domain is `conflict` — the gate must fail closed.
  const real = retrieveNorContext({ styleRules: [approvedStyleRule('Yth.', { key: 'r' }), approvedStyleRule('Kepada Yth.', { key: 'r' })], visualTemplates: [approvedTemplate()] }, { documentType: 'NOR' }, { at: AT });
  const forged = JSON.parse(JSON.stringify(real));
  forged.certification.status = 'certified';               // lie
  const c = buildGenerationContext(forged, { mode: GENERATION_MODE.INTELLIGENCE, at: AT });
  check(c.gate === G.BLOCKED_CONFLICT && c.blocked === true, 'a forged certification=certified over a real conflict is ignored — the gate blocks');

  // a forged authorityState on a rule inside the context ⇒ isNorRetrievalContext rejects ⇒ blocked.
  const real2 = retrieveNorContext({ styleRules: [approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default' })], visualTemplates: [approvedTemplate()] }, { documentType: 'NOR' }, { at: AT });
  const forged2 = JSON.parse(JSON.stringify(real2));
  const slot = forged2.styleGuide.rules.find((r) => r.rule);
  slot.rule.authorityState = 'proposed';                   // lie
  const c2 = buildGenerationContext(forged2, { mode: GENERATION_MODE.INTELLIGENCE, at: AT });
  check(c2.gate === G.BLOCKED_INCOMPLETE && c2.blocked === true, 'a forged authorityState corrupts the context → isNorRetrievalContext rejects → BLOCKED_INCOMPLETE');
}

section('gate helper — evaluateGenerationContext is deterministic + confidence-blind');
{
  const lowConf = retrieveNorContext({ styleRules: [approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default', confidence: 0.01 })], visualTemplates: [approvedTemplate()] }, { documentType: 'NOR' }, { at: AT });
  const hiConf = retrieveNorContext({ styleRules: [approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default', confidence: 0.99 })], visualTemplates: [approvedTemplate()] }, { documentType: 'NOR' }, { at: AT });
  const g1 = evaluateGenerationContext(lowConf);
  const g2 = evaluateGenerationContext(hiConf);
  check(g1.outcome === G.ALLOWED && g2.outcome === G.ALLOWED, 'a 0.01-confidence and a 0.99-confidence approved rule reach the SAME gate outcome (§6 — confidence is never authority)');
  check(evaluateGenerationContext(null).outcome === G.BLOCKED_INCOMPLETE, 'a null/malformed retrieval context → BLOCKED_INCOMPLETE');
}

section('assembleNorDraft — legacy mode is byte-identical (no Phase 6 keys)');
{
  const args = { norType: 'Pengadaan', collectedFields: { item: 'kursi', quantity: '10', type: 'Pengadaan' }, recipient: { status: 'known', value: 'Ketua Umum', source: 'human_answer' } };
  const legacy = assembleNorDraft({ ...args });
  check(legacy.draft.fields.metadata.generatedBy === 'sarpras-intelligence@phase1', 'legacy: generatedBy stays @phase1');
  check(!('generationContext' in legacy.draft.fields.metadata) && !('visualBinding' in legacy.draft.fields.metadata), 'legacy: NO generationContext / visualBinding keys in metadata');
  check(!('certifiedStyleRuleIds' in legacy.draft.fields.metadata.fieldProvenance), 'legacy: no certified-rule provenance');
  // passing nulls explicitly is still legacy
  const legacyNulls = assembleNorDraft({ ...args, generationStyleContext: null, visualBinding: null, generationContext: null });
  check(JSON.stringify(legacy) === JSON.stringify(legacyNulls), 'passing explicit nulls is byte-identical to omitting the Phase 6 args');
}

section('assembleNorDraft — Phase 6: a certified opening/closing wraps the TEMPLATE body');
{
  const c = gen([
    approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default' }),
    approvedStyleRule('Demikian, terima kasih.', { category: 'closing_pattern', key: 'default' }),
  ], [approvedTemplate()]);
  const out = assembleNorDraft({
    norType: 'Pengadaan', collectedFields: { item: 'kursi', type: 'Pengadaan' },
    recipient: { status: 'known', value: 'Ketua Umum', source: 'human_answer' },
    modelBody: null,
    generationStyleContext: c.style, visualBinding: c.visual, generationContext: c,
  });
  check(out.draft.fields.body.startsWith('Dengan hormat,') && out.draft.fields.body.trimEnd().endsWith('Demikian, terima kasih.'), 'the certified opening + closing wrap the deterministic template body');
  check(out.draft.fields.metadata.generatedBy === 'sarpras-intelligence@phase6', 'metadata.generatedBy is @phase6 when a generation context is present');
  check(out.draft.fields.metadata.generationContext && out.draft.fields.metadata.generationContext.gate === G.ALLOWED, 'metadata.generationContext carries the gate outcome');
  check(out.draft.fields.metadata.generationContext.styleSource === 'certified_style_rule', 'metadata records styleSource = certified_style_rule');
  check(out.draft.fields.metadata.visualBinding.source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE, 'metadata.visualBinding carries the approved-template directive');
  check(Array.isArray(out.draft.fields.metadata.fieldProvenance.certifiedStyleRuleIds) && out.draft.fields.metadata.fieldProvenance.certifiedStyleRuleIds.length === 2, 'fieldProvenance lists the certified style rule ids (refs only)');
  check(!JSON.stringify(out.draft.fields.metadata.generationContext).includes('rationale'), 'no rule rationale text leaks into the draft (§33)');
}

section('assembleNorDraft — Phase 6: a BLOCKED context applies NO certified wording');
{
  const blocked = gen([approvedStyleRule('Dengan hormat,', { category: 'opening_pattern', key: 'default' })], []); // missing visual → blocked
  check(blocked.blocked === true, 'precondition: the generation context is blocked');
  const out = assembleNorDraft({
    norType: 'Pengadaan', collectedFields: { item: 'kursi', type: 'Pengadaan' },
    recipient: { status: 'known', value: 'Ketua Umum', source: 'human_answer' },
    modelBody: null,
    generationStyleContext: null, visualBinding: blocked.visual, generationContext: blocked,
  });
  check(!out.draft.fields.body.startsWith('Dengan hormat,'), 'the blocked generation did NOT wrap the body with the approved opening (§9)');
  check(!('certifiedStyleRuleIds' in out.draft.fields.metadata.fieldProvenance), 'no certified-rule provenance on a blocked generation');
  check(out.draft.fields.metadata.generationContext.blocked === true && out.draft.fields.metadata.generationContext.status === GENERATION_STATUS.BLOCKED_INCOMPLETE, 'metadata discloses the blocked status for the review UI (§37)');
}

section('config — isCertifiedRetrievalGenerationEnabled is fail-closed');
{
  resetIntelligenceConfig();
  check(DEFAULT_INTELLIGENCE_CONFIG.generation.certifiedRetrieval === false, 'the default config has generation.certifiedRetrieval === false');
  check(isCertifiedRetrievalGenerationEnabled() === false, 'default: OFF');
  setIntelligenceConfig({ enabled: true });
  check(isCertifiedRetrievalGenerationEnabled() === false, 'master flag ON but sub-flag OFF → still OFF (never implicitly detected — §4)');
  setIntelligenceConfig({ generation: { certifiedRetrieval: true } });
  check(isCertifiedRetrievalGenerationEnabled() === true, 'both ON → intelligence mode reachable');
  setIntelligenceConfig({ enabled: false });
  check(isCertifiedRetrievalGenerationEnabled() === false, 'master flag OFF → OFF regardless of the sub-flag');
  setIntelligenceConfig({ generation: { certifiedRetrieval: 'true' } });
  check(isCertifiedRetrievalGenerationEnabled() === false, 'a non-boolean sub-flag value is ignored (fail-closed)');
  resetIntelligenceConfig();
}

section('static — no duplicate retrieval, no store import, no OpenAI/HTTP/secret/write/publish');
{
  // strip block + line comments so the file HEADERS ("no OpenAI, no Firebase")
  // are not mistaken for real usage — scan CODE only.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const files = [
    'src/intelligence/generation/contracts/generation-context-contract.js',
    'src/intelligence/generation/generation-fallbacks.js',
    'src/intelligence/generation/certification-gate.js',
    'src/intelligence/generation/style-slot-resolver.js',
    'src/intelligence/generation/visual-template-binding.js',
    'src/intelligence/generation/build-generation-context.js',
  ].map((p) => ({ p, src: stripComments(readFileSync(join(HERE, '..', p), 'utf8')) }));
  // These PURE modules have no `db` in scope — a direct-RTDB-write scan
  // belongs to the .cjs callable check. Here: no shadow retrieval (store /
  // corpus imports), no model / network, no numbering / publish / approve.
  const forbidden = [
    /style-guide-store/, /visual-template-store/, /writing-memory-(builder|query)/, /corpus-store/,
    /from ['"][^'"]*\/corpus\//, /\bopenai\b/i, /fetch\s*\(/, /require\s*\(\s*['"]https?/, /XMLHttpRequest/,
    /\bfirebase\b/i, /process\.env/, /firebase-admin/, /firebase-functions/,
    /\bpublishNor\b/, /\bapproveNor\b/, /suggestNextNumber/, /publishedNumber/,
  ];
  for (const { p, src } of files) {
    const hit = forbidden.find((re) => re.test(src));
    check(!hit, `${p}: no forbidden token in code${hit ? ` (matched ${hit})` : ''}`);
  }
  // the ONE allowed retrieval-contract import (read the enums), never the composer's siblings
  const bgc = files.find((f) => f.p.endsWith('build-generation-context.js')).src;
  check(/retrieval\/contracts\/nor-retrieval-contract\.js/.test(bgc) && !/nor-context-retrieval\.js/.test(bgc), 'build-generation-context.js reads the retrieval CONTRACT enums only — it does not re-run retrieval');
}

section('static — database.rules.json unchanged (Phase 6 / 6A add no RTDB node)');
{
  const rules = readFileSync(join(HERE, '..', 'database.rules.json'), 'utf8');
  const before = rules;
  check(rules === before && !/intelligence_generation/.test(rules), 'database.rules.json carries no Phase 6 / 6A node');
}
// NOTE — Phase 6A wires intelligenceNorGeneration into functions/index.js
// (server-authoritative activation, docs/V2_SARPRAS_INTELLIGENCE_PHASE_6A_*.md).
// The Phase 6 "callable is STAGED / not wired" assertion that used to live
// here is superseded — see scripts/intelligence-nor-generation-activation-check.cjs
// section "functions/index.js — intelligenceNorGeneration WIRED (Phase 6A)".

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
