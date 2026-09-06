/* ============================================================
   intelligence-retrieval-check.mjs — Certified Retrieval Integration
   (V2, Phase 5.x.7)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the certified retrieval contract + the retrieveNorContext
   composer over synthetic approved Style Guide rules (Phase 5.x.5) and
   approved Visual Templates (Phase 5.x.6).

   Fixtures (Phase 5.x.7 §30):
     A  approved Style Guide + approved Visual Template   → certified
     B  approved Style Guide + missing Visual Template    → incomplete
     C  missing Style Guide + approved Visual Template    → incomplete
     D  Style Guide conflict                              → conflict
     E  Visual Template conflict                          → conflict
     F  both domains conflict                             → conflict, both conflict sets exposed
     G  only a Writing Memory candidate (proposed rule)   → not certified
     H  only historical corpus evidence (nothing approved)→ not certified
     I  proposed Style rule + approved Visual Template    → not certified for Style Guide
     J  approved v1 superseded by approved v2             → v2 effective, v1 not
     K  deprecated template, no active approved           → missing (not deprecated-as-effective)
     L  unavailable subsystem                             → unavailable (not empty)
     M  same request repeated                             → byte-identical
     N  client forges scope / authority                   → server ignores

   Plus §14 (authority ≠ confidence), §16 (documentType mandatory +
   cross-type fallback), §19 (read-only), §25 (no hidden ranking).

   Run:  node scripts/intelligence-retrieval-check.mjs   (exit 0 = pass)
   ============================================================ */

import { makeStyleGuideProposalFromMemory } from '../src/intelligence/corpus/style-guide/style-guide-proposal.js';
import { markApproved as sgApprove, markDeprecated as sgDeprecate } from '../src/intelligence/corpus/style-guide/style-guide-authority.js';
import { makeVisualTemplateProposalFromPattern } from '../src/intelligence/corpus/visual-template/visual-template-proposal.js';
import { markApproved as vtApprove, markDeprecated as vtDeprecate } from '../src/intelligence/corpus/visual-template/visual-template-authority.js';
import {
  NOR_RETRIEVAL_CONTEXT_SCHEMA, RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
  makeNorRetrievalRequest, isNorRetrievalContext,
} from '../src/intelligence/retrieval/contracts/nor-retrieval-contract.js';
import { retrieveNorContext } from '../src/intelligence/retrieval/nor-context-retrieval.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-04T00:00:00.000Z';
const C = RETRIEVAL_CERTIFICATION_STATUS;
const D = RETRIEVAL_DOMAIN_STATUS;

let _m = 0;
function styleMemory(value, { category = 'recipient_convention', key = 'recipient_label', documentType = 'NOR', era = 'current', status = 'current_evidence', confidence = 0.9 } = {}) {
  return {
    memoryId: `mem_${++_m}`, category, key, value, normalizedValue: value.toLowerCase(),
    documentType, temporalStatus: status, conventionEra: era,
    evidence: {
      occurrenceCount: 6, documentCount: 4, documentTypeDistribution: { [documentType === 'cross_type' ? 'NOR' : documentType]: 4 },
      oldestSourceDate: '2026-01-01', latestSourceDate: '2026-03-01',
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

const ctx = (styleRules, visualTemplates, req = { documentType: 'NOR' }) => retrieveNorContext({ styleRules, visualTemplates }, req, { at: AT });

/* ════════════════════════════════════════════════════════════════════════ */

section('contract — the retrieval request is server-shaped (§20, §21, §16)');
{
  const r = makeNorRetrievalRequest({ documentType: 'NOR', scope: 'attacker-tenant', categories: ['recipient_convention', 'not_a_category'], regionKinds: ['logo', 'bogus'] });
  check(r.scope === 'organization', 'a client-supplied scope is normalised to `organization` (§20, §21)');
  check(Array.isArray(r.categories) && r.categories.length === 1 && r.categories[0] === 'recipient_convention', 'unknown categories are dropped; valid ones kept + sorted (§17)');
  check(Array.isArray(r.regionKinds) && r.regionKinds.length === 1 && r.regionKinds[0] === 'logo', 'unknown region kinds are dropped (§18)');
  check(makeNorRetrievalRequest({ documentType: 'NOT_A_TYPE' }).documentType === '', 'an invalid documentType is not accepted (§16)');
}

section('§16 — documentType is mandatory');
{
  const c = ctx([approvedStyleRule('Yth.')], [approvedTemplate()], { });
  check(c.certification.status === C.INCOMPLETE && c.certification.reasons.some((x) => /documentType is required/.test(x)), 'no documentType → incomplete with an explicit reason (§16)');
  check(c.styleGuide.status === D.MISSING && c.visualTemplate.status === D.MISSING, '…both domains report missing, not resolved');
}

section('A — approved Style Guide + approved Visual Template → certified (§30.A)');
{
  const c = ctx([approvedStyleRule('Yth.')], [approvedTemplate()]);
  check(isNorRetrievalContext(c) && c.schema === NOR_RETRIEVAL_CONTEXT_SCHEMA && Object.isFrozen(c), 'a valid frozen NorRetrievalContext');
  check(c.certification.status === C.CERTIFIED, 'A: certification.status === certified (§30.A)');
  check(c.certification.styleGuide.status === D.RESOLVED && c.certification.visualTemplate.status === D.RESOLVED, 'A: both domain statuses resolved');
  check(c.styleGuide.rules.length === 1 && c.styleGuide.rules[0].outcome === 'resolved' && c.styleGuide.rules[0].rule.value === 'Yth.', 'A: the approved rule is returned');
  check(c.visualTemplate.outcome === 'resolved' && c.visualTemplate.template != null, 'A: the approved template is returned');
  check(c.certification.reasons.some((x) => /resolved from approved organizational sources without conflict/.test(x)), 'A: a positive certification reason is recorded (§11)');
}

section('§14 — authority is not confidence');
{
  const c = ctx([approvedStyleRule('Yth.', { confidence: 0.99 })], [approvedTemplate()]);
  const sr = c.styleGuide.rules[0];
  check(sr.rule.authorityState === 'authoritative' && !('confidence' in sr.rule), 'the rule carries authorityState="authoritative" and NO confidence field (§14)');
  check(sr.supportingEvidence.evidence.confidence === 0.99, '…confidence lives in supportingEvidence.evidence, clearly separated (§14)');
}

section('B + C — one domain missing → incomplete (§30.B/C)');
{
  const b = ctx([approvedStyleRule('Yth.')], []);
  check(b.certification.status === C.INCOMPLETE && b.certification.styleGuide.status === D.RESOLVED && b.certification.visualTemplate.status === D.MISSING, 'B: approved Style Guide + missing Visual Template → incomplete (§30.B)');
  check(b.visualTemplate.outcome === 'missing' && b.visualTemplate.template === null, 'B: the visual template is explicitly missing, not fabricated (§6)');
  const cc = ctx([], [approvedTemplate()], { documentType: 'NOR', categories: ['recipient_convention'] });
  check(cc.certification.status === C.INCOMPLETE && cc.certification.styleGuide.status === D.MISSING && cc.certification.visualTemplate.status === D.RESOLVED, 'C: missing Style Guide + approved Visual Template → incomplete (§30.C)');
}

section('D — Style Guide conflict → conflict (§8, §30.D)');
{
  // two approved rules for the SAME slot, different value
  const r1 = approvedStyleRule('Yth.');
  const r2 = approvedStyleRule('Kepada');
  const c = ctx([r1, r2], [approvedTemplate()]);
  check(c.certification.status === C.CONFLICT, 'D: certification.status === conflict (§30.D)');
  check(c.certification.styleGuide.status === D.CONFLICT && c.certification.visualTemplate.status === D.RESOLVED, 'D: style domain conflict; visual domain resolved (§10)');
  check(c.styleGuide.rules.some((x) => x.outcome === 'conflict' && x.rule === null && x.competingRuleIds.length === 2), 'D: the conflicted slot returns NO rule + both competing ids (§25)');
  check(c.conflicts.styleGuide.length === 1 && c.conflicts.styleGuide[0].competing.length === 2, 'D: conflicts.styleGuide exposes both competing rules with evidence (§8)');
  check(!JSON.stringify(c).includes('"winner"') && !/"chosen"/.test(JSON.stringify(c)), 'D: no automatic winner is chosen (§25)');
}

section('E — Visual Template conflict → conflict (§9, §30.E)');
{
  const t1 = approvedTemplate({ variant: 'a4-logo-left' });
  const t2 = approvedTemplate({ variant: 'a4-logo-center' });
  const c = ctx([approvedStyleRule('Yth.')], [t1, t2]);
  check(c.certification.status === C.CONFLICT && c.certification.visualTemplate.status === D.CONFLICT && c.certification.styleGuide.status === D.RESOLVED, 'E: visual domain conflict; style domain resolved (§10)');
  check(c.visualTemplate.outcome === 'conflict' && c.visualTemplate.template === null && c.visualTemplate.competingTemplateIds.length === 2, 'E: the conflicted template returns NO template + both competing ids');
  check(c.conflicts.visualTemplate.length === 1 && c.conflicts.visualTemplate[0].competing.every((x) => 'pageModel' in x && 'templateId' in x && 'templateVersion' in x), 'E: conflicts.visualTemplate exposes template IDs, versions, variants, page models, evidence (§9)');
}

section('F — both domains conflict → conflict with BOTH conflict sets (§10, §30.F)');
{
  const c = ctx(
    [approvedStyleRule('Yth.'), approvedStyleRule('Kepada')],
    [approvedTemplate({ variant: 'v-a' }), approvedTemplate({ variant: 'v-b' })],
  );
  check(c.certification.status === C.CONFLICT, 'F: certification.status === conflict');
  check(c.certification.styleGuide.status === D.CONFLICT && c.certification.visualTemplate.status === D.CONFLICT, 'F: BOTH domain statuses are conflict — neither hides the other (§10)');
  check(c.conflicts.styleGuide.length === 1 && c.conflicts.visualTemplate.length === 1, 'F: both domain conflict sets are exposed (§30.F)');
}

section('G + H + I — evidence / proposals never certify (§11, §22, §30.G/H/I)');
{
  const g = ctx([proposedStyleRule('Yth.')], [approvedTemplate()]);
  check(g.certification.status !== C.CERTIFIED && g.certification.styleGuide.status === D.MISSING, 'G: only a Writing Memory candidate (proposed rule) → NOT certified; style missing (§30.G)');
  check(g.styleGuide.rules.every((r) => r.rule == null || r.rule.authorityState === 'authoritative'), 'G: a proposed rule never appears as an effective rule (§2, §22)');

  const h = ctx([], []);
  check(h.certification.status === C.INCOMPLETE && h.styleGuide.status === D.MISSING && h.visualTemplate.status === D.MISSING, 'H: only historical corpus evidence (nothing approved) → NOT certified (§30.H)');
  check(h.styleGuide.status !== D.UNAVAILABLE && h.visualTemplate.status !== D.UNAVAILABLE, 'H: `missing` (queried, nothing approved) is NOT `unavailable` (§23)');

  const i = ctx([proposedStyleRule('Yth.'), approvedStyleRule('Yth.', { category: 'closing_pattern', key: 'closing' })], [approvedTemplate()], { documentType: 'NOR', categories: ['recipient_convention'] });
  check(i.certification.status === C.INCOMPLETE && i.certification.styleGuide.status === D.MISSING, 'I: a proposed rule for the requested category + an approved template → not certified for Style Guide (§30.I)');
}

section('J — approved v1 superseded by approved v2 → v2 effective, v1 not (§15, §30.J)');
{
  const v1 = approvedStyleRule('Yth.');
  // v2: a superseding approved rule for the SAME slot, different value
  const v2seed = makeStyleGuideProposalFromMemory(styleMemory('Kepada Yth.'), { at: AT, actorId: 'evan', supersedesRuleId: v1.ruleId, version: v1.version + 1 });
  const v2 = sgApprove(v2seed, { actorId: 'evan', rationale: 'bentuk berjalan', at: AT }).next;
  const v1dep = sgDeprecate(v1, { actorId: 'evan', reason: `superseded by ${v2.ruleId}`, at: AT, supersededByRuleId: v2.ruleId }).next;
  const c = ctx([v1dep, v2], [approvedTemplate()]);
  check(c.certification.status === C.CERTIFIED, 'J: certified — a linear supersession chain is NOT a conflict (§25)');
  check(c.styleGuide.rules.length === 1 && c.styleGuide.rules[0].rule.value === 'Kepada Yth.' && c.styleGuide.rules[0].rule.version === 2, 'J: v2 is the effective rule');
  check(!JSON.stringify(c.styleGuide.rules).includes(v1dep.ruleId), 'J: v1 (deprecated) does NOT appear as an effective rule — historical only (§15)');
}

section('K — deprecated template, no active approved → missing, not deprecated-as-effective (§6, §30.K)');
{
  const t1 = approvedTemplate({ variant: 'old-a4' });
  const t1dep = vtDeprecate(t1, { actorId: 'evan', reason: 'retired', at: AT }).next;
  const c = ctx([approvedStyleRule('Yth.')], [t1dep]);
  check(c.certification.visualTemplate.status === D.MISSING && c.visualTemplate.outcome === 'missing' && c.visualTemplate.template === null, 'K: a deprecated template is NOT returned as effective — the domain is `missing` (§6, §30.K)');
  check(c.certification.status === C.INCOMPLETE, 'K: certification is incomplete (no approved template), NOT certified with the deprecated one');
}

section('L — unavailable subsystem → unavailable, not empty (§22, §23, §30.L)');
{
  const l1 = ctx(null, [approvedTemplate()]);
  check(l1.certification.status === C.UNAVAILABLE && l1.certification.styleGuide.status === D.UNAVAILABLE, 'L: styleRules === null → styleGuide unavailable → certification unavailable (§30.L)');
  check(l1.certification.reasons.some((x) => /could not be queried/.test(x)), 'L: an explicit "could not be queried" reason is recorded');
  const l2 = ctx([approvedStyleRule('Yth.')], null);
  check(l2.certification.status === C.UNAVAILABLE && l2.certification.visualTemplate.status === D.UNAVAILABLE, 'L: visualTemplates === null → visualTemplate unavailable → certification unavailable');
  check(l2.certification.status !== C.INCOMPLETE, 'L: unavailable is NOT collapsed to incomplete (§22)');
}

section('§16 — cross-type fallback (exact type wins; cross_type only when exact missing)');
{
  const exact = approvedStyleRule('Yth.', { documentType: 'NOR' });
  const cross = approvedStyleRule('Kepada', { documentType: 'cross_type' });
  const both = ctx([exact, cross], [approvedTemplate()], { documentType: 'NOR', slots: [{ category: 'recipient_convention', key: 'recipient_label' }] });
  check(both.styleGuide.rules[0].rule.value === 'Yth.' && both.styleGuide.rules[0].viaCrossType === false, 'an exact-NOR approved rule wins over a cross_type rule for the same slot (§16)');
  const onlyCross = ctx([cross], [approvedTemplate()], { documentType: 'NOR', slots: [{ category: 'recipient_convention', key: 'recipient_label' }] });
  check(onlyCross.styleGuide.rules[0].outcome === 'resolved' && onlyCross.styleGuide.rules[0].rule.value === 'Kepada' && onlyCross.styleGuide.rules[0].viaCrossType === true, 'a cross_type rule IS used when no exact-type rule exists — tagged viaCrossType (§16)');
}

section('§18 — visual region filtering is a projection, not a certification change');
{
  const full = ctx([approvedStyleRule('Yth.')], [approvedTemplate()], { documentType: 'NOR' });
  const filtered = ctx([approvedStyleRule('Yth.')], [approvedTemplate()], { documentType: 'NOR', regionKinds: ['logo'] });
  check(full.certification.status === filtered.certification.status && full.certification.status === C.CERTIFIED, 'region filtering does NOT change certification');
  check(filtered.visualTemplate.template.regions.length === 1 && filtered.visualTemplate.template.regions[0].kind === 'logo', 'the returned template regions are projected to the requested kinds (§18)');
  check(full.visualTemplate.template.regions.length === 2, '…the unfiltered request keeps all regions');
}

section('M + N — determinism + client cannot forge authority (§24, §30.M/N)');
{
  const styleRules = [approvedStyleRule('Yth.'), approvedStyleRule('Demikian', { category: 'closing_pattern', key: 'closing' })];
  const templates = [approvedTemplate()];
  const m1 = ctx([...styleRules], [...templates], { documentType: 'NOR' });
  const m2 = ctx([...styleRules].reverse(), [...templates], { documentType: 'NOR' });
  const m3 = ctx([...styleRules], [...templates], { documentType: 'NOR' });
  check(JSON.stringify(m1) === JSON.stringify(m2), 'M: reversing the rule-set order → byte-identical context (§24)');
  check(JSON.stringify(m1) === JSON.stringify(m3), 'M: running twice → byte-identical context (§30.M)');

  const forged = retrieveNorContext(
    { styleRules, visualTemplates: templates },
    { documentType: 'NOR', scope: 'attacker', authorityState: 'authoritative', approvedBy: 'attacker', version: 999, sourceDocumentIds: ['forged'] },
    { at: AT },
  );
  check(forged.request.scope === 'organization', 'N: a forged request.scope is ignored — organization only (§20, §21, §30.N)');
  check(forged.styleGuide.rules.every((r) => r.rule == null || (r.rule.authorityState === 'authoritative' && r.rule.approvedBy === 'evan')), 'N: forged authorityState / approvedBy / version have no effect — authority comes only from the approved records (§30.N)');
  check(!JSON.stringify(forged).includes('"forged"') && !JSON.stringify(forged.request).includes('attacker'), 'N: forged source ids / tenant strings do not appear anywhere in the result');
}

section('safety — read-only; provenance preserved; no full corpus copy');
{
  const styleRules = [approvedStyleRule('Yth.')];
  const templates = [approvedTemplate()];
  const before = JSON.stringify({ styleRules, templates });
  const c = ctx(styleRules, templates, { documentType: 'NOR' });
  check(JSON.stringify({ styleRules, templates }) === before, 'the input rule sets are UNTOUCHED (read-only — §19)');
  const sr = c.styleGuide.rules[0];
  check(sr.supportingEvidence.sourceMemoryIds.length >= 1 && sr.supportingEvidence.sourceObservationIds.length >= 1 && sr.supportingEvidence.sourceDocumentIds.length >= 1, 'provenance (memory / observation / document ids) is preserved for the approved rule (§12, §13)');
  check(sr.supportingEvidence.temporalEvidence && 'conventionEra' in sr.supportingEvidence.temporalEvidence, 'temporal evidence is preserved (§15)');
  check(c.supportingEvidence.styleGuide.ruleIds.length === 1 && c.supportingEvidence.visualTemplate.templateIds.length === 1, 'the aggregate supportingEvidence rollup lists the rule + template ids used');
  check(!/"body"\s*:\s*"/.test(JSON.stringify(c)) && !/"documentText"/.test(JSON.stringify(c)), 'no document body text / giant context string is emitted (§26)');
  check(c.provenance.note === 'Retrieval may certify approved organizational context. Retrieval must never manufacture authority.', 'the provenance carries the certification principle (§34)');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
