/* ============================================================
   intelligence-curation-check.mjs — Human Curation Workspace
   (V2, Phase 5.x.8)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the PURE projection layer (src/intelligence/curation/
   curation-view.js) and the PURE state machine
   (src/intelligence/console/curation-workspace-controller.js) against the
   REAL Style Guide + Visual Template Memory backends (full lifecycle,
   immutable audit, optimistic concurrency, deterministic conflicts).

   Covers Phase 5.x.8 §29/§30:
     NAVIGATION  tab state; the workspace is inert until load(); an
                 un-queryable subsystem is `unavailable`, never "0 proposals"
     LIST        proposed style rules + visual templates appear; filters are
                 deterministic; empty state vs unavailable state; conflict flag
     STYLE REV.  evidence + temporal + provenance + predecessor render;
                 authority is a LABEL, not a confidence number
     VISUAL REV. page model + regions render; UNKNOWN geometry is honest
                 ("Geometry unavailable"), never a fabricated A4
     CONFLICTS   both sides shown; recommendedWinner === null; the conflict
                 stays unresolved until an explicit human action
     APPROVAL    an explicit confirmation; a non-empty rationale is REQUIRED;
                 the server owns actor / timestamp / authority / version
     REJECTION   works; the record is retained
     SUPERSESSION explicit; approving a superseding proposal auto-deprecates
                 the predecessor; the old version stays immutable
     CONCURRENCY a stale expectedVersion is detected → "reload before
                 deciding"; NO silent overwrite
     AUDIT       approve / reject / deprecate create an audit event; the
                 actor is server-derived
     SECURITY    a client authority field cannot be forged through the store
     STATIC      the view + controller are pure (no fetch / firebase / DOM /
                 storage / OpenAI); no automatic authority

   Run:  node scripts/intelligence-curation-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-04T00:00:00.000Z';

/* ── modules under test ────────────────────────────────────────────── */
const view = await import('../src/intelligence/curation/curation-view.js');
const { createCurationWorkspaceController } = await import('../src/intelligence/console/curation-workspace-controller.js');
const { CURATION_TAB, CURATION_DOMAIN_STATE, CURATION_PROPOSAL_KIND } =
  await import('../src/intelligence/curation/contracts/curation-contract.js');

/* ── real Style Guide Memory backend ───────────────────────────────── */
const sgStore = await import('../src/intelligence/corpus/style-guide/style-guide-store.js');
const { makeStyleGuideProposalFromMemory } = await import('../src/intelligence/corpus/style-guide/style-guide-proposal.js');

/* ── real Visual Template Memory backend ───────────────────────────── */
const vtStore = await import('../src/intelligence/corpus/visual-template/visual-template-store.js');
const vtContract = await import('../src/intelligence/corpus/visual-template/contracts/visual-template-contract.js');

/* ── fixture helpers ──────────────────────────────────────────────── */
const styleMem = (over = {}) => ({
  memoryId: over.memoryId || `mem_${over.value || 'x'}_${over.documentType || 'NOR'}`,
  category: over.category || 'recipient_convention',
  key: over.key || 'recipient_label',
  value: over.value || 'Yth.',
  normalizedValue: (over.value || 'Yth.').toLowerCase(),
  documentType: over.documentType || 'NOR',
  temporalStatus: over.temporalStatus || 'current_evidence',
  conventionEra: over.conventionEra || 'current',
  confidence: over.confidence == null ? 0.9 : over.confidence,
  sourceObservationIds: over.sourceObservationIds || ['obs_1', 'obs_2'],
  sourceDocumentIds: over.sourceDocumentIds || ['corpus_a', 'corpus_b', 'corpus_c'],
  evidence: {
    occurrenceCount: over.occ == null ? 7 : over.occ,
    documentCount: over.docs == null ? 3 : over.docs,
    documentTypeDistribution: over.dist || { NOR: 3 },
    oldestSourceDate: '2026-01-01', latestSourceDate: '2026-03-01',
    recentDocumentCount: 3, historicalDocumentCount: 0, conflictingDocumentCount: 0,
    approvedRulePresent: false, approvedRuleMatches: false,
  },
});

/** a visual pattern whose geometry is deliberately UNKNOWN (null dims) */
const visualPatternUnknownGeom = (over = {}) => ({
  patternId: over.patternId || 'pat_unknown',
  documentType: over.documentType || vtContract.VISUAL_TEMPLATE_DOCUMENT_TYPE.NOR,
  variant: over.variant || 'header-block-a',
  sourceDocumentIds: over.sourceDocumentIds || ['corpus_v1', 'corpus_v2'],
  sourceObservationIds: over.sourceObservationIds || ['vobs_1', 'vobs_2'],
  pageModel: vtContract.makeTemplatePageModel({}),        // no width/height ⇒ unknown
  regions: [vtContract.makeTemplateRegion({ kind: 'header', sourceObservationIds: ['vobs_1'], sourceDocumentIds: ['corpus_v1'] })],
  typography: vtContract.makeTemplateTypography({}),
  spacing: vtContract.makeTemplateSpacing({}),
  structuralRules: vtContract.makeTemplateStructuralRules({}),
  evidence: { documentCount: 2, observationCount: 2, pageCount: 2, regionKinds: ['header'], coordinateSpaces: [], geometryKnown: false },
  temporalEvidence: { temporalStatus: 'current_evidence', conventionEra: 'current', oldestSourceDate: '2026-01-01', latestSourceDate: '2026-03-01', recentDocumentCount: 2, historicalDocumentCount: 0, transitionalDocumentCount: 0, undatedDocumentCount: 0 },
  confidence: 0.7,
});
/** a visual pattern whose geometry IS known (A4 pt) */
const visualPatternKnownGeom = (over = {}) => ({
  ...visualPatternUnknownGeom(over),
  patternId: over.patternId || 'pat_known',
  variant: over.variant || 'header-block-b',
  pageModel: vtContract.makeTemplatePageModel({ width: 595.32, height: 841.92, coordinateSpace: 'pdf_points', pageNumber: 1 }),
  evidence: { documentCount: 2, observationCount: 2, pageCount: 2, regionKinds: ['header'], coordinateSpaces: ['pdf_points'], geometryKnown: true },
});

function useMemoryStyleBackend() {
  sgStore.resetStyleGuideStore();
  sgStore.resetMemoryStyleGuideBackend();
  sgStore.registerStyleGuideBackend(sgStore.memoryStyleGuideBackend);
  sgStore.setActiveStyleGuideBackend(sgStore.MEMORY_STYLE_GUIDE_BACKEND_ID);
}
function useMemoryVisualBackend() {
  vtStore.resetVisualTemplateStore();
  vtStore.resetMemoryVisualTemplateBackend();
  vtStore.registerVisualTemplateBackend(vtStore.memoryVisualTemplateBackend);
  vtStore.setActiveVisualTemplateBackend(vtStore.MEMORY_VISUAL_TEMPLATE_BACKEND_ID);
}

/** adapt a store facade (module fns) to the { list,get,approve,reject,deprecate,history } the controller wants */
const styleFacade = {
  list: (f) => sgStore.listStyleRules(f),
  get: (id) => sgStore.getStyleRule(id),
  approve: (id, ctx) => sgStore.approveStyleRule(id, ctx),
  reject: (id, ctx) => sgStore.rejectStyleRule(id, ctx),
  deprecate: (id, ctx) => sgStore.deprecateStyleRule(id, ctx),
  history: (id) => sgStore.getStyleRuleHistory(id),
};
const visualFacade = {
  list: (f) => vtStore.listVisualTemplates(f),
  get: (id) => vtStore.getVisualTemplate(id),
  approve: (id, ctx) => vtStore.approveVisualTemplate(id, ctx),
  reject: (id, ctx) => vtStore.rejectVisualTemplate(id, ctx),
  deprecate: (id, ctx) => vtStore.deprecateVisualTemplate(id, ctx),
  history: (id) => vtStore.getVisualTemplateHistoryChain(id),
};
/** a backend that is DOWN — every op returns NO_BACKEND_CONFIGURED */
const downFacade = {
  list: () => ({ ok: false, data: null, error: { code: 'NO_BACKEND_CONFIGURED', message: 'down' } }),
  get: () => ({ ok: false, data: null, error: { code: 'NO_BACKEND_CONFIGURED', message: 'down' } }),
  approve: () => ({ ok: false, data: null, error: { code: 'NO_BACKEND_CONFIGURED', message: 'down' } }),
  reject: () => ({ ok: false, data: null, error: { code: 'NO_BACKEND_CONFIGURED', message: 'down' } }),
  deprecate: () => ({ ok: false, data: null, error: { code: 'NO_BACKEND_CONFIGURED', message: 'down' } }),
  history: () => ({ ok: false, data: null, error: { code: 'NO_BACKEND_CONFIGURED', message: 'down' } }),
};

/* ════════════════════════════════════════════════════════════════════ */

section('curation-view — dashboard is COUNTS over canonical data, unavailable ≠ 0');
{
  useMemoryStyleBackend();
  useMemoryVisualBackend();
  // 2 proposed style rules (one a conflict pair), 1 approved
  sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.' }), actorId: 'evan', now: AT });
  sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Kepada Yth.', memoryId: 'mem_kep' }), actorId: 'evan', now: AT });
  const cP = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ category: 'closing_pattern', key: 'closing', value: 'Hormat kami', memoryId: 'mem_close' }), actorId: 'evan', now: AT }).data;
  sgStore.approveStyleRule(cP.ruleId, { actorId: 'evan', rationale: 'dipakai konsisten', at: AT });
  vtStore.proposeVisualTemplateFromEvidence({ pattern: visualPatternUnknownGeom(), actorId: 'evan', now: AT });

  const rules = sgStore.listStyleRules().data;
  const templates = vtStore.listVisualTemplates().data;
  const dash = view.buildCurationDashboard({ styleRules: rules, visualTemplates: templates });
  check(dash.styleGuide.available === true && dash.styleGuide.proposed === 2 && dash.styleGuide.approved === 1, 'dashboard: 2 proposed + 1 approved style rule, counted from records');
  check(dash.visualTemplate.available === true && dash.visualTemplate.proposed === 1, 'dashboard: 1 proposed visual template');
  check(dash.awaitingReview === 3, 'dashboard: awaitingReview = proposed style + proposed visual');
  const dashDown = view.buildCurationDashboard({ styleRules: null, visualTemplates: templates });
  check(dashDown.styleGuide.available === false && dashDown.styleGuide.proposed === 0, 'a null (un-queryable) domain → available:false, NOT a fabricated 0-count claim');
}

section('curation-view — proposal rows: authority is a LABEL, evidence confidence is a SEPARATE number (§5)');
{
  const rules = sgStore.listStyleRules().data;
  const rows = view.buildStyleProposalRows(rules, { status: 'proposed' });
  check(rows.length === 2 && rows.every((r) => r.status === 'proposed'), 'buildStyleProposalRows(status:proposed) → the review queue only');
  const r0 = rows[0];
  check(r0.authorityLabel === 'Proposed' && typeof r0.evidenceConfidence === 'string', 'a row carries authorityLabel "Proposed" AND a separate evidenceConfidence string');
  check(r0.evidenceConfidence === '0.90' && !/%/.test(r0.evidenceConfidence), 'evidence confidence renders as "0.90" — never a "%" authority claim');
  check(typeof r0.evidenceCount === 'number' && typeof r0.sourceDocumentCount === 'number' && r0.temporalContext === 'Current evidence', 'a row exposes evidence count, source-document count, and a temporal-context label');
  const allRows = view.buildStyleProposalRows(rules);
  check(allRows.some((r) => r.status === 'approved'), 'with no status filter the approved rule is also listed (history / audit surfaces need it)');
}

section('curation-view — filters are deterministic and only over real fields (§6)');
{
  const rules = sgStore.listStyleRules().data;
  const rows = view.buildStyleProposalRows(rules);
  const onlyNor = view.filterCurationRows(rows, { documentType: 'NOR' });
  check(onlyNor.length === rows.length, 'documentType:NOR filter keeps the NOR rows');
  const onlyClosing = view.filterCurationRows(rows, { category: 'closing_pattern' });
  check(onlyClosing.length === 1 && onlyClosing[0].category === 'closing_pattern', 'category filter narrows to closing_pattern');
  const bogus = view.filterCurationRows(rows, { nonsenseKey: 'x' });
  check(bogus.length === rows.length, 'an unknown filter key is ignored (never silently transforms the set)');
  const fv = view.availableFilterValues(rows);
  check(fv.category.includes('recipient_convention') && fv.category.includes('closing_pattern') && fv.status.includes('proposed'), 'availableFilterValues offers only values present in the rows');
}

section('curation-view — visual review: UNKNOWN geometry is honest, never a fabricated A4 (§9)');
{
  const templates = vtStore.listVisualTemplates().data;
  const t0 = templates[0];
  const rev = view.buildVisualTemplateReview(templates, t0.templateId);
  check(rev && rev.template.pageModel.known === false && /unavailable/i.test(rev.template.pageModel.note), 'a template with null page dimensions → pageModel.known=false, note "Geometry unavailable"');
  check(!JSON.stringify(rev.template.pageModel).includes('595') && !/a4/i.test(JSON.stringify(rev.template.pageModel)), 'no A4 / 595 / 842 dimension was invented for unknown geometry');
  check(Array.isArray(rev.template.regions) && rev.template.regions[0].kind === 'header', 'regions render with their kind');
  check(rev.template.regions[0].geometry.known === false, 'an unknown region geometry is also reported honestly');
  check(rev.evidence.geometryKnown === false && Array.isArray(rev.evidence.sourceDocumentIds) && rev.evidence.sourceDocumentIds.length >= 1, 'visual evidence is traceable (source document ids) and honest about geometryKnown');

  // a KNOWN-geometry pattern renders real numbers
  useMemoryVisualBackend();
  vtStore.proposeVisualTemplateFromEvidence({ pattern: visualPatternKnownGeom(), actorId: 'evan', now: AT });
  const kt = vtStore.listVisualTemplates().data[0];
  const kRev = view.buildVisualTemplateReview([kt], kt.templateId);
  check(kRev.template.pageModel.known === true && kRev.template.pageModel.width === 595.32 && kRev.template.pageModel.coordinateSpace === 'pdf_points', 'a KNOWN geometry renders the real width + explicit coordinate space');
}

section('curation-view — conflict view shows BOTH sides and NEVER a recommended winner (§11)');
{
  useMemoryStyleBackend();
  const pA = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.', occ: 9, docs: 4 }), actorId: 'evan', now: AT }).data;
  const pB = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Kepada Yth.', memoryId: 'mem_kep', occ: 4, docs: 2 }), actorId: 'evan', now: AT }).data;
  sgStore.approveStyleRule(pA.ruleId, { actorId: 'evan', rationale: 'sering', at: AT });
  sgStore.approveStyleRule(pB.ruleId, { actorId: 'evan', rationale: 'juga', at: AT, acknowledgeConflict: true });
  const cv = view.buildConflictView({ styleRules: sgStore.listStyleRules().data, visualTemplates: null });
  check(cv.styleGuide.length === 1 && cv.styleGuide[0].sides.length === 2, 'one style-guide conflict with two sides');
  check(cv.styleGuide[0].recommendedWinner === null && cv.styleGuide[0].resolutionRequiresHuman === true, 'the conflict carries recommendedWinner=null and resolutionRequiresHuman=true');
  const c = cv.styleGuide[0];
  const highFreqSide = c.sides.find((s) => /Yth\./.test(s.value) && !/Kepada/.test(s.value));
  check(highFreqSide && highFreqSide.evidence && highFreqSide.evidence.occurrenceCount === 9, 'each side carries its OWN evidence (occurrence 9 vs 4) for the human to weigh');
  check(!JSON.stringify(cv).toLowerCase().includes('recommend') || /recommendedwinner":null/i.test(JSON.stringify(cv).replace(/\s/g, '')), 'nothing in the conflict projection nominates a winner');
}

section('controller — inert until load(); tab is deterministic UI state');
{
  useMemoryStyleBackend();
  useMemoryVisualBackend();
  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  let s = ctl.getState();
  check(s.ready === false && s.tab === CURATION_TAB.OVERVIEW && s.dashboard === null && s.rows.styleRules.length === 0, 'before load(): not ready, no dashboard, no rows');
  ctl.setTab(CURATION_TAB.STYLE_RULES);
  check(ctl.getState().tab === CURATION_TAB.STYLE_RULES, 'setTab updates the tab');
  ctl.setTab('bogus');
  check(ctl.getState().tab === CURATION_TAB.STYLE_RULES, 'setTab rejects an unknown tab');
  await ctl.load();
  s = ctl.getState();
  check(s.ready === true && s.domains.styleGuide === CURATION_DOMAIN_STATE.EMPTY && s.domains.visualTemplate === CURATION_DOMAIN_STATE.EMPTY, 'load() with an empty (but reachable) store → domains EMPTY, not unavailable');
  check(s.loadError === null, 'an empty store is not a load error');
}

section('controller — an un-queryable subsystem is `unavailable`, never "0 proposals" (§21)');
{
  const ctl = createCurationWorkspaceController({ styleGuide: downFacade, visualTemplate: downFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  const s = ctl.getState();
  check(s.domains.styleGuide === CURATION_DOMAIN_STATE.UNAVAILABLE && s.domains.visualTemplate === CURATION_DOMAIN_STATE.UNAVAILABLE, 'both domains report UNAVAILABLE');
  check(s.loadError && /not available/i.test(s.loadError), 'a top-level loadError is set (both domains down)');
  check(s.dashboard && s.dashboard.styleGuide.available === false, 'the dashboard marks the domain unavailable rather than claiming 0');
  const mixed = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: downFacade, actor: { userId: 'evan', role: 'admin' } });
  await mixed.load();
  check(mixed.getState().loadError === null && mixed.getState().domains.visualTemplate === CURATION_DOMAIN_STATE.UNAVAILABLE, 'one domain down is NOT a total load failure — the other still works');
}

section('controller — LIST: proposed rules + templates appear; filters flow through');
{
  useMemoryStyleBackend();
  useMemoryVisualBackend();
  sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.' }), actorId: 'evan', now: AT });
  sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ category: 'closing_pattern', key: 'closing', value: 'Hormat kami', memoryId: 'mem_c' }), actorId: 'evan', now: AT });
  vtStore.proposeVisualTemplateFromEvidence({ pattern: visualPatternUnknownGeom(), actorId: 'evan', now: AT });
  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  let s = ctl.getState();
  check(s.rows.styleRules.length === 2 && s.rows.visualTemplates.length === 1, 'rows: 2 style + 1 visual');
  check(s.visibleRows.styleRules.length === 2, 'with no filter, visibleRows === rows');
  ctl.setFilter('category', 'closing_pattern');
  s = ctl.getState();
  check(s.visibleRows.styleRules.length === 1 && s.visibleRows.styleRules[0].category === 'closing_pattern', 'setFilter(category) narrows visibleRows deterministically');
  ctl.resetFilters();
  check(ctl.getState().visibleRows.styleRules.length === 2, 'resetFilters restores the full set');
}

section('controller — STYLE REVIEW: evidence + temporal + provenance render; select() re-reads for freshness');
{
  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  const id = ctl.getState().rows.styleRules.find((r) => r.category === 'recipient_convention').id;
  await ctl.select(CURATION_PROPOSAL_KIND.STYLE_RULE, id);
  const d = ctl.getState().detail;
  check(d && d.id === id && d.proposed.authorityLabel === 'Proposed', 'detail projection built for the selected rule');
  check(d.evidence.sourceMemoryIds.length >= 1 && d.evidence.sourceObservationIds.length >= 1 && d.evidence.sourceDocumentIds.length >= 1, 'provenance: source memory / observation / document ids all present (§10)');
  check(d.evidence.temporal.contextLabel === 'Current evidence' && typeof d.evidence.temporal.recentDocumentCount === 'number', 'temporal context + dated counts render (§7)');
  check(typeof d.expectedVersion === 'number' && d.expectedVersion === 1, 'select() captured the expectedVersion for optimistic concurrency');
  check(d.decision.canApprove === true && d.decision.canReject === true && d.decision.canSupersede === false, 'a plain proposal offers Approve + Reject, not Supersede');
}

section('controller — APPROVAL: explicit confirm; non-empty rationale REQUIRED; server owns authority (§12, §16)');
{
  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  const id = ctl.getState().rows.styleRules.find((r) => r.category === 'recipient_convention').id;
  await ctl.select(CURATION_PROPOSAL_KIND.STYLE_RULE, id);
  ctl.beginDecision('approve');
  check(ctl.getState().decision && ctl.getState().decision.kind === 'approve', 'beginDecision(approve) opens the confirm panel');
  await ctl.confirmDecision();
  check(ctl.getState().decision && /rationale is required/i.test(ctl.getState().decision.error), 'confirm with an empty rationale is REFUSED, no store call');
  check(sgStore.getStyleRule(id).data.status === 'proposed', 'the rule is still proposed after the refused confirm');
  ctl.setRationale('   ');
  await ctl.confirmDecision();
  check(sgStore.getStyleRule(id).data.status === 'proposed', 'a whitespace rationale is also refused');
  ctl.setRationale('Disetujui: bentuk yang dipakai pada NOR periode berjalan.');
  await ctl.confirmDecision();
  const after = sgStore.getStyleRule(id).data;
  check(after.status === 'approved' && after.authorityState === 'authoritative', 'a real rationale → proposed → approved');
  check(after.approvedBy === 'evan' && after.approvedAt === AT || (after.approvedBy === 'evan' && typeof after.approvedAt === 'string'), 'approvedBy is the actor; approvedAt is server-set (the client never supplies it)');
  check(after.auditTrail.some((e) => e.event === 'STYLE_RULE_APPROVED' && e.actorId === 'evan'), 'an audit event records the server-derived actor (§24)');
  const s = ctl.getState();
  check(s.lastOutcome && s.lastOutcome.action === 'approve' && s.lastOutcome.status === 'approved', 'the controller surfaces visible success feedback (§18)');
  check(s.decision === null && s.detail.proposed.status === 'approved', 'the confirm panel closes and the detail refreshes to the approved state');
}

section('controller — REJECTION: works, record retained, reason preserved (§13)');
{
  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  const id = ctl.getState().rows.styleRules.find((r) => r.category === 'closing_pattern').id;
  await ctl.select(CURATION_PROPOSAL_KIND.STYLE_RULE, id);
  ctl.beginDecision('reject');
  ctl.setRationale('Bukan bentuk yang dipakai PBSI.');
  await ctl.confirmDecision();
  const rec = sgStore.getStyleRule(id).data;
  check(rec.status === 'rejected' && rec.rejectedBy === 'evan', 'the rule is rejected, actor recorded');
  check(rec.auditTrail.some((e) => e.event === 'STYLE_RULE_REJECTED' && e.detail.reason === 'Bukan bentuk yang dipakai PBSI.'), 'the reject reason is preserved in the audit trail');
  check(sgStore.getStyleRule(id).ok, 'the rejected rule is RETAINED (not deleted)');
}

section('controller — SUPERSESSION: explicit; predecessor auto-deprecated; old version immutable (§14)');
{
  useMemoryStyleBackend();
  useMemoryVisualBackend();
  const v1p = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.', memoryId: 'mem_v1' }), actorId: 'evan', now: AT }).data;
  const v1 = sgStore.approveStyleRule(v1p.ruleId, { actorId: 'evan', rationale: 'bentuk lama', at: AT }).data;
  const v2p = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Kepada Yth.', memoryId: 'mem_v2' }), actorId: 'evan', now: AT, supersedesRuleId: v1.ruleId }).data;

  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  await ctl.select(CURATION_PROPOSAL_KIND.STYLE_RULE, v2p.ruleId);
  const d = ctl.getState().detail;
  check(d.decision.canSupersede === true && d.decision.canApprove === false, 'a proposal that links a predecessor offers "Supersede / Approve", not a bare "Approve"');
  check(d.predecessor && d.predecessor.id === v1.ruleId && d.predecessor.value === 'Yth.' && Array.isArray(d.predecessor.approvalHistory), 'the predecessor rule + its approval history render (§7)');
  ctl.beginDecision('supersede');
  await ctl.confirmDecision();
  check(/rationale is required/i.test(ctl.getState().decision.error), 'supersession also requires an explicit rationale');
  ctl.setRationale('Bentuk berjalan menggantikan bentuk lama.');
  await ctl.confirmDecision();
  const v2 = sgStore.getStyleRule(v2p.ruleId).data;
  const v1After = sgStore.getStyleRule(v1.ruleId).data;
  check(v2.status === 'approved' && v2.supersedesRuleId === v1.ruleId && v2.version === 2, 'v2 is approved, version 2, links v1');
  check(v1After.status === 'deprecated' && v1After.supersededByRuleId === v2.ruleId, 'v1 was AUTO-deprecated and links forward to v2');
  check(v1After.value === 'Yth.' && v1After.rationale === 'bentuk lama' && v1After.approvedBy === 'evan', 'v1 content + approval metadata is UNCHANGED (immutable)');
}

section('controller — CONCURRENCY: a stale expectedVersion is detected, NO silent overwrite (§19)');
{
  useMemoryStyleBackend();
  const p = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.', memoryId: 'mem_cc' }), actorId: 'evan', now: AT }).data;

  // reviewer A opens it at version 1
  const ctlA = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'a', role: 'admin' } });
  await ctlA.load();
  await ctlA.select(CURATION_PROPOSAL_KIND.STYLE_RULE, p.ruleId);
  const staleVersion = ctlA.getState().detail.expectedVersion;

  // reviewer B rejects it out from under A (bumps its lifecycle)
  sgStore.rejectStyleRule(p.ruleId, { actorId: 'b', reason: 'no', at: AT });

  // A tries to approve at the stale expectedVersion
  ctlA.beginDecision('approve');
  ctlA.setRationale('approve at a stale view');
  await ctlA.confirmDecision();
  const dec = ctlA.getState().decision;
  check(dec && dec.staleError && /reload/i.test(dec.staleError), 'A gets a "reload before deciding" message, NOT a silent overwrite');
  check(sgStore.getStyleRule(p.ruleId).data.status === 'rejected', "A's stale approve did NOT overwrite B's rejection");
  await ctlA.reload();
  check(ctlA.getState().detail.proposed.status === 'rejected' && ctlA.getState().detail.decision.canApprove === false, 'after reload A sees the true (rejected) state and can no longer approve');
}

section('controller — CONFLICT-BLOCKED approval fails closed, offers an explicit acknowledge path (§11, §12)');
{
  useMemoryStyleBackend();
  const pA = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.', memoryId: 'mem_ca' }), actorId: 'evan', now: AT }).data;
  const pB = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Kepada Yth.', memoryId: 'mem_cb' }), actorId: 'evan', now: AT }).data;
  sgStore.approveStyleRule(pA.ruleId, { actorId: 'evan', rationale: 'a', at: AT });

  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  await ctl.select(CURATION_PROPOSAL_KIND.STYLE_RULE, pB.ruleId);
  ctl.beginDecision('approve');
  ctl.setRationale('approve the competing value too');
  await ctl.confirmDecision();
  let dec = ctl.getState().decision;
  check(dec && dec.conflictBlocked === true && /competing authoritative/i.test(dec.error), 'approving a competing value FAILS CLOSED with a conflict-blocked message');
  check(sgStore.getStyleRule(pB.ruleId).data.status === 'proposed', 'the competing value stays proposed — nothing was force-approved');
  // the human explicitly chooses to keep both
  ctl.setAcknowledgeConflict(true);
  await ctl.confirmDecision();
  check(sgStore.getStyleRule(pB.ruleId).data.status === 'approved', 'with an explicit acknowledge the human can deliberately keep both');
  const res = view.buildConflictView({ styleRules: sgStore.listStyleRules().data, visualTemplates: null });
  check(res.styleGuide.length === 1 && res.styleGuide[0].recommendedWinner === null, 'the resulting conflict is surfaced with NO recommended winner');
}

section('controller — read ops (load / select / reload) mutate nothing');
{
  useMemoryStyleBackend();
  const p = sgStore.proposeStyleRuleFromMemory({ memory: styleMem({ value: 'Yth.', memoryId: 'mem_ro' }), actorId: 'evan', now: AT }).data;
  const before = JSON.stringify(sgStore.listStyleRules().data);
  const ctl = createCurationWorkspaceController({ styleGuide: styleFacade, visualTemplate: visualFacade, actor: { userId: 'evan', role: 'admin' } });
  await ctl.load();
  await ctl.select(CURATION_PROPOSAL_KIND.STYLE_RULE, p.ruleId);
  ctl.setTab(CURATION_TAB.CONFLICTS);
  await ctl.reload();
  check(JSON.stringify(sgStore.listStyleRules().data) === before, 'load / select / setTab / reload left the store byte-identical');
}

section('static — the view + controller are PURE; no automatic authority (§26, §31)');
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const f of ['src/intelligence/curation/curation-view.js', 'src/intelligence/curation/contracts/curation-contract.js', 'src/intelligence/console/curation-workspace-controller.js']) {
    const blob = strip(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|from\s+['"][^'"]*firebase|\blocalStorage\.|\bsessionStorage\.|\bdocument\.|\bwindow\./.test(blob), `${f}: no network / firebase / storage / DOM / window`);
    check(!/api\.openai\.com|sk-[A-Za-z0-9]{6}|OPENAI_API_KEY|embedding|retrieveNorContext|generateNor|pettycash|petty_cash/i.test(blob), `${f}: no OpenAI / embeddings / RAG / NOR-generator / Petty Cash coupling`);
    check(!/feature_flags|setIntelligenceConfig/.test(blob), `${f}: never touches the feature flag`);
  }
  const ctlBlob = strip(fs.readFileSync(path.join(ROOT, 'src/intelligence/console/curation-workspace-controller.js'), 'utf8'));
  check(/confirmDecision/.test(ctlBlob) && !/setInterval|setTimeout/.test(ctlBlob), 'the controller mutates ONLY via confirmDecision() and schedules nothing automatic');
  check(/rationale\)\.trim\(\)/.test(ctlBlob) || /String\(dec\.rationale[\s\S]{0,40}\.trim\(\)/.test(ctlBlob), 'confirmDecision() enforces a non-empty rationale before any store call');
  check(!/approvedBy|authorityState\s*[:=]|approvedAt\s*[:=]/.test(ctlBlob.replace(/\/\/[^\n]*/g, '')), 'the controller never sets approvedBy / approvedAt / authorityState — the server owns them (§16)');
}

sgStore.resetStyleGuideStore();
vtStore.resetVisualTemplateStore();
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
