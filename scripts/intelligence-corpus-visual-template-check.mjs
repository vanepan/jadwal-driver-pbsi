/* ============================================================
   intelligence-corpus-visual-template-check.mjs — PBSI Visual Template
   System (V2, Phase 5.x.6)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the Visual Template contract, evidence aggregator, proposal
   builder, authority helpers, retrieval + effective-template resolver,
   and the Memory backend's full lifecycle.

   Fixtures (Phase 5.x.6 §28):
     A  two documents, identical page geometry           → one candidate
     B  two documents, coords within tolerance           → same candidate
     C  two documents, materially different geometry     → two candidates
     D  historical layout + current layout               → both preserved + temporal evidence
     E  Memorandum layout differs from NOR               → document-type separation
     F  logo placement conflict                          → conflict, no automatic choice
     G  proposed template                                → NOT authoritative
     H  human approval                                   → approved, server actor/timestamp
     I  client forge attempt                             → server ignores/rejects
     J  approved v1 + proposed v2 → v2 approval          → v1 deprecated, immutable, queryable
     K  two approved conflicting templates               → resolver `conflict`
     L  missing geometry                                 → unknown / null, never fabricated

   Plus §23/§30: contract validity (geometry deterministic, coord spaces
   explicit, never auto-`approved`, derived authorityState); state machine
   (rejected/deprecated terminal, no approved→approved); retrieval
   (effective = approved only); determinism.

   Run:  node scripts/intelligence-corpus-visual-template-check.mjs   (exit 0 = pass)
   ============================================================ */

import { makeCorpusObservation } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import { makeCorpusDocument, CORPUS_DOCUMENT_TYPE } from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import {
  VISUAL_TEMPLATE_SCHEMA, VISUAL_TEMPLATE_SYSTEM_SCHEMA, VISUAL_TEMPLATE_STATUS, VISUAL_TEMPLATE_STATUS_GRAPH,
  VISUAL_AUTHORITY_STATE, VISUAL_TEMPLATE_SCOPE, VISUAL_REGION_KIND, COORDINATE_SPACE,
  makeVisualTemplate, isVisualTemplate, visualTemplateIdFrom, canVisualTemplateTransition, authorityStateForStatus,
  makeTemplatePageModel, isTemplatePageModel,
} from '../src/intelligence/corpus/visual-template/contracts/visual-template-contract.js';
import { aggregateVisualEvidence } from '../src/intelligence/corpus/visual-template/visual-evidence-aggregator.js';
import {
  makeVisualTemplateProposalFromPattern, buildVisualTemplateProposals, makeSupersedingVisualTemplateProposal,
} from '../src/intelligence/corpus/visual-template/visual-template-proposal.js';
import {
  markApproved, markRejected, markDeprecated,
} from '../src/intelligence/corpus/visual-template/visual-template-authority.js';
import {
  getEffectiveVisualTemplates, queryVisualTemplates, getProposedVisualTemplates,
  resolveEffectiveTemplate, findVisualTemplateConflicts, getVisualTemplateHistory,
} from '../src/intelligence/corpus/visual-template/visual-template-query.js';
import {
  listVisualTemplates, getVisualTemplate, proposeVisualTemplateFromEvidence, approveVisualTemplate, rejectVisualTemplate,
  deprecateVisualTemplate, resolveVisualTemplate, getVisualTemplateHistoryChain,
  registerVisualTemplateBackend, setActiveVisualTemplateBackend, resetVisualTemplateStore,
  memoryVisualTemplateBackend, resetMemoryVisualTemplateBackend, MEMORY_VISUAL_TEMPLATE_BACKEND_ID,
} from '../src/intelligence/corpus/visual-template/visual-template-store.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-04T00:00:00.000Z';
let _n = 0;
const doc = (id, sourceDate, documentType = CORPUS_DOCUMENT_TYPE.NOR) => makeCorpusDocument({
  checksum: id.padEnd(64, '0'), documentId: `corpus_${id}`, ownerId: 'evan', sourceDate, documentType, createdAt: AT,
});
const pageObs = (docId, w, h, page = 1, space = 'pdf_points') => makeCorpusObservation({
  observationId: `o_pg_${docId}_${page}_${++_n}`,
  documentId: docId, category: 'layout', modality: 'visual', key: 'page_geometry',
  observedValue: `${w}x${h} ${space}`,
  observation: { width: w, height: h, coordinateSpace: space, orientation: w > h ? 'landscape' : 'portrait' },
  provenance: [{ sourceDocumentId: docId, sourceFileId: null, pageNumber: page, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.9 }],
  confidence: 0.9, createdAt: AT, updatedAt: AT,
});
const blockObs = (docId, role, x, y, w, h, page = 1, space = 'pdf_points') => makeCorpusObservation({
  observationId: `o_bl_${docId}_${role}_${page}_${++_n}`,
  documentId: docId, category: 'layout', modality: 'visual', key: `block_${role}`,
  observation: { role, order: 0 },
  provenance: [{ sourceDocumentId: docId, sourceFileId: null, pageNumber: page, region: { x, y, width: w, height: h, coordinateSpace: space }, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.8 }],
  confidence: 0.8, createdAt: AT, updatedAt: AT,
});
const CFG = {
  geometryTolerance: { pageRelativeDecimals: 2, pageSizeTolerancePt: 6, minDocumentsForPattern: 2, minDocumentsForRecurrence: 2 },
  temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2, minHistoricalDocuments: 1 },
};
const agg = (documents, observations, cfg = CFG) => aggregateVisualEvidence({ documents, observations }, cfg, { at: AT });

function useMemoryBackend() {
  resetVisualTemplateStore();
  resetMemoryVisualTemplateBackend();
  registerVisualTemplateBackend(memoryVisualTemplateBackend);
  setActiveVisualTemplateBackend(MEMORY_VISUAL_TEMPLATE_BACKEND_ID);
}

/* ════════════════════════════════════════════════════════════════════════ */

section('contract — VisualTemplate shape + hard boundaries (§5, §7, §11, §13)');
{
  const rep = agg(
    [doc('c1', '2026-01-01'), doc('c2', '2026-02-01')],
    [pageObs('corpus_c1', 595, 842), blockObs('corpus_c1', 'logo', 40, 780, 80, 40), pageObs('corpus_c2', 595, 842), blockObs('corpus_c2', 'logo', 41, 779, 80, 41)],
  );
  const p = makeVisualTemplateProposalFromPattern(rep.patterns[0], { at: AT, actorId: 'evan' });
  check(isVisualTemplate(p) && p.schema === VISUAL_TEMPLATE_SCHEMA && p.visualTemplateSystemSchema === VISUAL_TEMPLATE_SYSTEM_SCHEMA && Object.isFrozen(p), 'makeVisualTemplateProposalFromPattern → a valid frozen VisualTemplate');
  check(p.status === VISUAL_TEMPLATE_STATUS.PROPOSED && p.authorityState === VISUAL_AUTHORITY_STATE.PROPOSED, 'a fresh proposal is status=proposed, authorityState=proposed');
  check(p.rationale === null && p.approvedBy === null && p.approvedAt === null, 'a proposal has NO rationale / approvedBy / approvedAt (§13)');
  check(p.sourceDocumentIds.length >= 1 && p.sourceObservationIds.length >= 1, 'evidence-backed: >= 1 source document / observation id (§13)');
  check(!isVisualTemplate({ ...p, sourceDocumentIds: [] }) && !isVisualTemplate({ ...p, sourceObservationIds: [] }), 'a VisualTemplate with NO evidence is invalid (§13)');
  check(!isVisualTemplate({ ...p, variant: '' }), 'a VisualTemplate with no variant label is invalid (§7)');
  check(makeVisualTemplate({ ...p, authorityState: 'authoritative' }).authorityState === VISUAL_AUTHORITY_STATE.PROPOSED, 'a client-supplied authorityState is IGNORED — it is derived from status (§11)');
  check(makeVisualTemplate({ ...p, status: 'approved' }).authorityState === VISUAL_AUTHORITY_STATE.AUTHORITATIVE && authorityStateForStatus('approved') === 'authoritative', 'authorityState follows status: approved ⇒ authoritative');
  check(!isVisualTemplate({ ...p, status: 'approved' }), 'isVisualTemplate REJECTS a status=approved record with no rationale / approvedBy (§11)');
  check(p.pageModel.coordinateSpace === COORDINATE_SPACE.PDF_POINTS && p.pageModel.width === 595 && p.pageModel.unit === 'pt', 'the page model carries an EXPLICIT coordinate space + real dimensions (§5, §6)');
  check(p.templateId === visualTemplateIdFrom('organization', 'NOR', p.variant), 'templateId is deterministic from (scope, documentType, geometry fingerprint / variant) (§7)');
}

section('L — missing geometry → unknown / null, never fabricated (§6, §28.L)');
{
  const noGeom = makeTemplatePageModel({ sourceDocumentIds: ['corpus_x'], sourceObservationIds: ['o1'] });
  check(noGeom.width === null && noGeom.height === null && noGeom.coordinateSpace === 'unknown' && noGeom.orientation === 'unknown' && noGeom.unit === 'unknown', 'a page model with no extracted size is all-null / unknown — never "assume A4" (§6, §28.L)');
  check(isTemplatePageModel(noGeom), '…and it is still a structurally valid page model');
  check(!isTemplatePageModel({ ...noGeom, coordinateSpace: 'pdf_points' }), 'a coordinate space with NO coordinate is a false geometry claim → invalid (§6)');
  // a pattern from block observations with NO page_geometry
  const rep = agg(
    [doc('l1', '2026-01-01'), doc('l2', '2026-02-01')],
    [blockObs('corpus_l1', 'title', 100, 700, 400, 40), blockObs('corpus_l2', 'title', 100, 700, 400, 40)],
  );
  const pat = rep.patterns[0];
  check(pat && pat.evidence.geometryKnown === false, 'a pattern with no page geometry is geometryKnown:false');
  check(pat.pageModel.width === null && pat.regions.every((r) => r.geometry.x === null), 'no coordinate is fabricated — the region geometry stays unknown without a page to normalise against (§3, §6)');
}

section('A + B + C — pattern grouping under tolerance (§14, §28.A/B/C)');
{
  // A — identical
  const A = agg(
    [doc('a1', '2026-01-01'), doc('a2', '2026-02-01')],
    [pageObs('corpus_a1', 595, 842), blockObs('corpus_a1', 'logo', 40, 780, 80, 40), pageObs('corpus_a2', 595, 842), blockObs('corpus_a2', 'logo', 40, 780, 80, 40)],
  );
  check(A.patterns.length === 1, 'A: two documents with IDENTICAL geometry → ONE visual candidate (§28.A)');
  check(A.patterns[0].evidence.documentCount === 2, 'A: the candidate cites both source documents');

  // B — within tolerance (logo shifted 4pt on a 595pt page ⇒ < 1% ⇒ same 2-decimal fraction)
  const B = agg(
    [doc('b1', '2026-01-01'), doc('b2', '2026-02-01')],
    [pageObs('corpus_b1', 595, 842), blockObs('corpus_b1', 'logo', 40, 780, 80, 40), pageObs('corpus_b2', 595, 842), blockObs('corpus_b2', 'logo', 44, 782, 80, 40)],
  );
  check(B.patterns.length === 1, 'B: coordinates within the documented tolerance (1%-of-page grid) → the SAME candidate (§14, §28.B)');

  // C — materially different (logo top-left vs logo far-right; and different page size)
  const C = agg(
    [doc('c1', '2026-01-01'), doc('c2', '2026-02-01'), doc('c3', '2026-03-01'), doc('c4', '2026-04-01')],
    [
      pageObs('corpus_c1', 595, 842), blockObs('corpus_c1', 'logo', 40, 780, 80, 40),
      pageObs('corpus_c2', 595, 842), blockObs('corpus_c2', 'logo', 40, 780, 80, 40),
      pageObs('corpus_c3', 595, 842), blockObs('corpus_c3', 'logo', 460, 780, 80, 40),
      pageObs('corpus_c4', 595, 842), blockObs('corpus_c4', 'logo', 460, 780, 80, 40),
    ],
  );
  check(C.patterns.length === 2, 'C: materially different geometry → TWO candidates (§28.C)');
  check(C.patterns[0].variant !== C.patterns[1].variant, 'C: the two candidates carry distinct variant labels');
}

section('D — historical + current layout: both preserved with temporal evidence (§9, §28.D)');
{
  const rep = agg(
    [doc('d1', '2020-01-01'), doc('d2', '2021-01-01'), doc('d3', '2026-01-01'), doc('d4', '2026-02-01')],
    [
      pageObs('corpus_d1', 612, 792), pageObs('corpus_d2', 612, 792), // Letter — historical
      pageObs('corpus_d3', 595, 842), pageObs('corpus_d4', 595, 842), // A4 — current
    ],
  );
  check(rep.patterns.length === 2, 'D: two layouts → two patterns, both preserved (never merged — §20, §28.D)');
  const historical = rep.patterns.find((p) => p.temporalEvidence.conventionEra === 'historical');
  const current = rep.patterns.find((p) => p.temporalEvidence.conventionEra === 'current');
  check(historical && historical.temporalEvidence.temporalStatus === 'historical_only' && historical.temporalEvidence.historicalDocumentCount === 2, 'D: the older layout carries historical temporal EVIDENCE');
  check(current && current.temporalEvidence.temporalStatus === 'current_evidence' && current.temporalEvidence.recentDocumentCount === 2, 'D: the newer layout carries current temporal EVIDENCE');
  // temporal is evidence, not authority — proposals stay proposed
  const p = makeVisualTemplateProposalFromPattern(current, { at: AT, actorId: 'evan' });
  check(p.status === 'proposed' && p.authorityState !== 'authoritative', 'D: `current` temporal evidence does NOT make the proposal authoritative (§9, §0)');
}

section('E — Memorandum layout differs from NOR: document-type separation (§8, §28.E)');
{
  const rep = agg(
    [doc('e1', '2026-01-01', 'NOR'), doc('e2', '2026-02-01', 'NOR'), doc('e3', '2026-01-15', 'MEMORANDUM'), doc('e4', '2026-02-15', 'MEMORANDUM')],
    [
      pageObs('corpus_e1', 595, 842), blockObs('corpus_e1', 'title', 100, 760, 400, 30),
      pageObs('corpus_e2', 595, 842), blockObs('corpus_e2', 'title', 100, 760, 400, 30),
      pageObs('corpus_e3', 595, 842), blockObs('corpus_e3', 'title', 100, 700, 400, 30),
      pageObs('corpus_e4', 595, 842), blockObs('corpus_e4', 'title', 100, 700, 400, 30),
    ],
  );
  const nor = rep.patterns.find((p) => p.documentType === 'NOR');
  const memo = rep.patterns.find((p) => p.documentType === 'MEMORANDUM');
  check(nor && memo, 'E: a NOR-scoped AND a MEMORANDUM-scoped pattern are produced — never merged (§8, §28.E)');
  check(nor.sourceDocumentIds.every((d) => d.startsWith('corpus_e1') || d.startsWith('corpus_e2')) && !nor.sourceDocumentIds.includes('corpus_e3'), 'E: the NOR pattern cites ONLY NOR documents');
  const p = makeVisualTemplateProposalFromPattern(memo, { at: AT });
  check(p.documentType === 'MEMORANDUM', 'E: the MEMORANDUM proposal keeps documentType = MEMORANDUM (never silently a NOR template — §8)');
}

section('F + K — logo conflict → resolver `conflict`, NEVER a frequency pick (§21, §28.F/K)');
{
  useMemoryBackend();
  // "logo left" — 3 docs ; "logo center" — 2 docs. Frequency favours "left".
  const rep = agg(
    [doc('f1', '2026-01-01'), doc('f2', '2026-02-01'), doc('f3', '2026-03-01'), doc('f4', '2026-04-01'), doc('f5', '2026-05-01')],
    [
      pageObs('corpus_f1', 595, 842), blockObs('corpus_f1', 'logo', 40, 780, 80, 40),
      pageObs('corpus_f2', 595, 842), blockObs('corpus_f2', 'logo', 40, 780, 80, 40),
      pageObs('corpus_f3', 595, 842), blockObs('corpus_f3', 'logo', 40, 780, 80, 40),
      pageObs('corpus_f4', 595, 842), blockObs('corpus_f4', 'logo', 258, 780, 80, 40),
      pageObs('corpus_f5', 595, 842), blockObs('corpus_f5', 'logo', 258, 780, 80, 40),
    ],
  );
  check(rep.patterns.length === 2 && rep.patternConflicts.length === 1, 'F: two logo layouts → two patterns + ONE patternConflict (§20)');
  const left = rep.patterns.reduce((a, b) => (a.evidence.documentCount >= b.evidence.documentCount ? a : b));
  const center = rep.patterns.find((p) => p !== left);
  const pL = proposeVisualTemplateFromEvidence({ pattern: left, actorId: 'evan', now: AT }).data;
  const pC = proposeVisualTemplateFromEvidence({ pattern: center, actorId: 'evan', now: AT }).data;
  check(pL && pC && pL.templateId !== pC.templateId, 'F: both competing layouts become SEPARATE proposals (§20)');
  const okL = approveVisualTemplate(pL.templateId, { actorId: 'evan', rationale: 'more frequent', at: AT });
  check(okL.ok, 'F: the first (more frequent) layout is approved');
  const clash = approveVisualTemplate(pC.templateId, { actorId: 'evan', rationale: 'also seen', at: AT });
  check(!clash.ok && clash.error.code === 'CONFLICT_UNRESOLVED', 'K: approving a SECOND competing layout fails CLOSED — CONFLICT_UNRESOLVED (§21, §28.K)');
  const okC = approveVisualTemplate(pC.templateId, { actorId: 'evan', rationale: 'intentional coexistence', at: AT, acknowledgeConflict: true });
  check(okC.ok, '…with an explicit acknowledgeConflict both approved templates can coexist');
  const res = resolveVisualTemplate({ scope: 'organization', documentType: 'NOR' });
  check(res.data.outcome === 'conflict' && res.data.template === null && res.data.competingTemplateIds.length === 2, 'K: resolveEffectiveTemplate returns `conflict` with NO chosen template (never a frequency pick — §21, §28.F)');
  check(res.data.competing.every((c) => 'pageModel' in c && 'evidence' in c), 'K: the competing evidence is exposed for the human to decide');
  const directTwo = [
    makeVisualTemplate({ ...pL, status: 'approved', rationale: 'a', approvedBy: 'x', approvedAt: AT }),
    makeVisualTemplate({ ...pC, status: 'approved', rationale: 'b', approvedBy: 'x', approvedAt: AT }),
  ];
  check(resolveEffectiveTemplate(directTwo, { documentType: 'NOR' }).outcome === 'conflict', 'the pure resolver on two approved layouts → conflict (no frequency vote — §21)');
}

section('G + H + I — proposed ≠ authoritative; human approval; forged fields ignored (§11, §28.G/H/I)');
{
  useMemoryBackend();
  const rep = agg(
    [doc('g1', '2026-01-01'), doc('g2', '2026-02-01')],
    [pageObs('corpus_g1', 595, 842), blockObs('corpus_g1', 'signature', 350, 100, 200, 80), pageObs('corpus_g2', 595, 842), blockObs('corpus_g2', 'signature', 350, 100, 200, 80)],
  );
  const proposed = proposeVisualTemplateFromEvidence({ pattern: rep.patterns[0], actorId: 'evan', now: AT }).data;
  check(proposed.status === 'proposed' && proposed.authorityState === 'proposed', 'G: a proposed template is NOT authoritative (§28.G)');
  check(getEffectiveVisualTemplates(listVisualTemplates().data).length === 0, 'G: the effective (approved-only) set is EMPTY (§22)');

  // I — hostile forge on the pure record
  const hostile = makeVisualTemplate({
    ...proposed, status: 'proposed', authorityState: 'authoritative', approvedBy: 'fake-user', approvedAt: 'fake-time',
    rationale: 'client says approved',
  });
  check(hostile.authorityState === 'proposed' && hostile.approvedBy === null && hostile.approvedAt === null && hostile.rationale === null, 'I: client approvedBy / approvedAt / authorityState / rationale are stripped on a proposed record (§11, §28.I)');
  const fromHostilePattern = makeVisualTemplateProposalFromPattern({ ...rep.patterns[0], templateVersion: 999, authorityState: 'approved' }, { at: AT, actorId: 'evan' });
  check(fromHostilePattern.templateVersion === 1 && fromHostilePattern.status === 'proposed', 'I: a `templateVersion` / `authorityState` on the pattern is IGNORED — the builder reads only ctx (§11)');

  // H — real approval
  const noRat = approveVisualTemplate(proposed.templateId, { actorId: 'evan', rationale: '   ', at: AT });
  check(!noRat.ok && noRat.error.code === 'RATIONALE_REQUIRED', 'H: an empty / whitespace rationale is REJECTED (§11)');
  const ok = approveVisualTemplate(proposed.templateId, { actorId: 'evan', rationale: 'Disetujui sebagai tata letak NOR periode berjalan.', at: AT });
  check(ok.ok && ok.data.status === 'approved' && ok.data.authorityState === 'authoritative', 'H: proposed → approved with an authorized actor + rationale (§28.H)');
  check(ok.data.approvedBy === 'evan' && ok.data.approvedAt === AT, 'H: approvedBy / approvedAt are SERVER-derived (§11, §28.H)');
  check(ok.data.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_APPROVED' && e.actorId === 'evan'), 'H: a VISUAL_TEMPLATE_APPROVED audit entry records the actor');
  check(getEffectiveVisualTemplates(listVisualTemplates().data).length === 1, 'H: the template is now in the effective set');
}

section('state machine — no silent mutation of approved; rejected / deprecated terminal (§10)');
{
  check(JSON.stringify(VISUAL_TEMPLATE_STATUS_GRAPH.proposed) === JSON.stringify(['approved', 'rejected']), 'proposed → { approved, rejected }');
  check(JSON.stringify(VISUAL_TEMPLATE_STATUS_GRAPH.approved) === JSON.stringify(['deprecated']), 'approved → { deprecated } ONLY — no approved→approved (§10)');
  check(VISUAL_TEMPLATE_STATUS_GRAPH.rejected.length === 0 && VISUAL_TEMPLATE_STATUS_GRAPH.deprecated.length === 0, 'rejected + deprecated are TERMINAL (§10)');
  check(!canVisualTemplateTransition('rejected', 'approved') && !canVisualTemplateTransition('deprecated', 'approved'), 'a rejected / deprecated template can NEVER be (re)approved (§10)');

  useMemoryBackend();
  const rep = agg([doc('s1', '2026-01-01'), doc('s2', '2026-02-01')], [pageObs('corpus_s1', 595, 842), pageObs('corpus_s2', 595, 842)]);
  const p = proposeVisualTemplateFromEvidence({ pattern: rep.patterns[0], actorId: 'evan', now: AT }).data;
  const approved = approveVisualTemplate(p.templateId, { actorId: 'evan', rationale: 'ok', at: AT }).data;
  check(!approveVisualTemplate(p.templateId, { actorId: 'evan', rationale: 'again', at: AT }).ok, 'approving an already-approved template is refused');
  check(markApproved(approved, { actorId: 'evan', rationale: 'x', at: AT }).error === 'ILLEGAL_TRANSITION', 'the pure markApproved refuses to re-approve an approved template');
  check(!rejectVisualTemplate(p.templateId, { actorId: 'evan', reason: 'nope', at: AT }).ok, 'an approved template cannot be rejected');
  const again = proposeVisualTemplateFromEvidence({ pattern: rep.patterns[0], actorId: 'evan', now: AT });
  check(!again.ok && again.error.code === 'TEMPLATE_EXISTS', 'a re-proposal of an already-decided slot layout is refused — a changed layout must SUPERSEDE (§10, §12)');
}

section('reject / deprecate — actor + reason preserved; retained (§10)');
{
  useMemoryBackend();
  const rep = agg([doc('r1', '2026-01-01'), doc('r2', '2026-02-01')], [pageObs('corpus_r1', 420, 595), pageObs('corpus_r2', 420, 595)]);
  const p = proposeVisualTemplateFromEvidence({ pattern: rep.patterns[0], actorId: 'evan', now: AT }).data;
  check(!rejectVisualTemplate(p.templateId, { actorId: 'evan', reason: '  ', at: AT }).ok, 'reject without a reason is refused (§10)');
  const rej = rejectVisualTemplate(p.templateId, { actorId: 'evan', reason: 'Ukuran A5 bukan format NOR PBSI.', at: AT }).data;
  check(rej.status === 'rejected' && rej.authorityState === 'not_authoritative' && rej.rejectedBy === 'evan', 'reject records status + actor');
  check(rej.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_REJECTED' && e.detail.reason === 'Ukuran A5 bukan format NOR PBSI.'), 'the reject reason is preserved in the audit trail');
  check(getVisualTemplate(p.templateId).ok && queryVisualTemplates(listVisualTemplates().data, { status: 'rejected' }).length === 1, 'the rejected template is RETAINED + queryable, excluded from the effective set (§10, §22)');
}

section('J — approved v1 superseded by approved v2; v1 immutable + auditable (§12, §28.J)');
{
  useMemoryBackend();
  const r1 = agg([doc('j1', '2026-01-01'), doc('j2', '2026-02-01')], [pageObs('corpus_j1', 612, 792), pageObs('corpus_j2', 612, 792)]);
  const v1p = proposeVisualTemplateFromEvidence({ pattern: r1.patterns[0], actorId: 'evan', now: AT }).data;
  const v1 = approveVisualTemplate(v1p.templateId, { actorId: 'evan', rationale: 'tata letak lama (Letter)', at: AT }).data;
  const v1Snapshot = JSON.stringify(v1);

  const r2 = agg([doc('j3', '2026-04-01'), doc('j4', '2026-05-01')], [pageObs('corpus_j3', 595, 842), pageObs('corpus_j4', 595, 842)]);
  const sup = makeSupersedingVisualTemplateProposal(v1, r2.patterns[0], { at: AT, actorId: 'evan' });
  check(sup.proposal && sup.proposal.supersedesTemplateId === v1.templateId && sup.proposal.templateVersion === 2, 'makeSupersedingVisualTemplateProposal links v2.supersedesTemplateId = v1, version 2 (§12)');
  check(makeSupersedingVisualTemplateProposal(v1, { ...r2.patterns[0], documentType: 'MEMORANDUM' }, { at: AT }).error === 'SLOT_MISMATCH', 'a superseding proposal for a different slot is refused');

  const v2p = proposeVisualTemplateFromEvidence({ pattern: r2.patterns[0], actorId: 'evan', now: AT, supersedesTemplateId: v1.templateId }).data;
  const v2 = approveVisualTemplate(v2p.templateId, { actorId: 'evan', rationale: 'tata letak A4 berjalan', at: AT }).data;
  check(v2.status === 'approved' && v2.templateVersion === 2 && v2.supersedesTemplateId === v1.templateId, 'J: v2 is approved, version 2, supersedes v1');

  const v1After = getVisualTemplate(v1.templateId).data;
  check(v1After.status === 'deprecated' && v1After.supersededByTemplateId === v2.templateId, 'J: v1 was AUTO-deprecated and links forward to v2 (§12, §28.J)');
  check(v1After.variant === v1.variant && v1After.rationale === v1.rationale && v1After.approvedBy === v1.approvedBy && v1After.approvedAt === v1.approvedAt, 'J: v1 content + approval metadata is UNCHANGED (immutable — §12)');
  check(v1After.auditTrail[0].event === 'VISUAL_TEMPLATE_PROPOSED' && v1After.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_APPROVED') && v1After.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_DEPRECATED'), 'J: v1 audit trail is append-only + complete');

  const eff = getEffectiveVisualTemplates(listVisualTemplates().data);
  check(eff.length === 1 && eff[0].templateId === v2.templateId, 'J: the effective set now returns ONLY v2');
  check(resolveVisualTemplate({ documentType: 'NOR' }).data.outcome === 'resolved' && resolveVisualTemplate({ documentType: 'NOR' }).data.template.templateId === v2.templateId, 'J: the resolver cleanly resolves to v2 (a supersession chain is NOT a conflict)');
  const chain = getVisualTemplateHistoryChain(v2.templateId).data;
  check(chain.length === 2 && chain[0].templateId === v1.templateId && chain[1].templateId === v2.templateId, 'J: history returns the full chain oldest → newest — v1 still queryable (§12)');
  check(JSON.parse(JSON.stringify(getVisualTemplateHistory(listVisualTemplates().data, v1.templateId).find((t) => t.templateId === v1.templateId))).variant === v1.variant, 'J: v1 is still fully reconstructable from history');
  void v1Snapshot;
}

section('retrieval — effective = approved only; scope-aware; deterministic (§22)');
{
  useMemoryBackend();
  const rep = agg(
    [doc('q1', '2026-01-01', 'NOR'), doc('q2', '2026-02-01', 'NOR'), doc('q3', '2026-01-05', 'MEMORANDUM'), doc('q4', '2026-02-05', 'MEMORANDUM')],
    [
      pageObs('corpus_q1', 595, 842), pageObs('corpus_q2', 595, 842),
      pageObs('corpus_q3', 595, 842), blockObs('corpus_q3', 'header', 40, 800, 500, 30), pageObs('corpus_q4', 595, 842), blockObs('corpus_q4', 'header', 40, 800, 500, 30),
    ],
  );
  const norPat = rep.patterns.find((p) => p.documentType === 'NOR');
  const memoPat = rep.patterns.find((p) => p.documentType === 'MEMORANDUM');
  const norT = approveVisualTemplate(proposeVisualTemplateFromEvidence({ pattern: norPat, actorId: 'evan', now: AT }).data.templateId, { actorId: 'evan', rationale: 'nor', at: AT }).data;
  const memoProposed = proposeVisualTemplateFromEvidence({ pattern: memoPat, actorId: 'evan', now: AT }).data;

  const all = listVisualTemplates().data;
  check(getEffectiveVisualTemplates(all).length === 1 && getEffectiveVisualTemplates(all)[0].templateId === norT.templateId, 'the default effective set is APPROVED only — the proposed MEMORANDUM template is excluded (§22)');
  check(getEffectiveVisualTemplates(all, { documentType: 'MEMORANDUM' }).length === 0, 'getEffectiveVisualTemplates never returns a non-approved template even when filtered by type');
  check(getProposedVisualTemplates(all).length === 1 && getProposedVisualTemplates(all)[0].templateId === memoProposed.templateId, 'getProposedVisualTemplates returns the review queue');
  check(resolveEffectiveTemplate(all, { documentType: 'MEMORANDUM' }).outcome === 'missing', 'resolveEffectiveTemplate for a slot with only a proposed template → `missing` (§21)');
  check(JSON.stringify(queryVisualTemplates(all, { documentType: 'NOR' })) === JSON.stringify(queryVisualTemplates(all, { documentType: 'NOR' })), 'queryVisualTemplates is deterministic');
}

section('determinism — same evidence + config ⇒ byte-identical (§0)');
{
  const docs = [doc('z1', '2026-01-01'), doc('z2', '2026-02-01'), doc('z3', '2026-03-01')];
  const obs = [pageObs('corpus_z1', 595, 842), blockObs('corpus_z1', 'logo', 40, 780, 80, 40), pageObs('corpus_z2', 595, 842), blockObs('corpus_z2', 'logo', 40, 780, 80, 40), pageObs('corpus_z3', 595, 842), blockObs('corpus_z3', 'logo', 40, 780, 80, 40)];
  const r1 = agg(docs, obs);
  const r2 = agg([...docs].reverse(), [...obs].reverse());
  const r3 = agg(docs, obs);
  check(JSON.stringify(r1) === JSON.stringify(r2), 'reversing the input order → byte-identical report');
  check(JSON.stringify(r1) === JSON.stringify(r3), 'running twice → byte-identical report');
  const set1 = buildVisualTemplateProposals({ report: r1 }, { at: AT, actorId: 'evan' });
  check(set1.proposals.length === r1.patterns.length && new Set(set1.proposals.map((p) => p.templateId)).size === set1.proposals.length, 'buildVisualTemplateProposals is deterministic + de-duped');
}

section('safety — no `authoritative` proposed template; no fabricated rationale / geometry');
{
  useMemoryBackend();
  const rep = agg([doc('x1', '2026-01-01'), doc('x2', '2026-02-01')], [pageObs('corpus_x1', 595, 842), pageObs('corpus_x2', 595, 842)]);
  proposeVisualTemplateFromEvidence({ pattern: rep.patterns[0], actorId: 'evan', now: AT });
  const asJson = JSON.stringify(listVisualTemplates().data);
  check(!/"status":"approved"/.test(asJson) && !/"authorityState":"authoritative"/.test(asJson), 'no approved / authoritative template exists from a bare propose (§0)');
  check(!/"rationale":"[^"]/.test(asJson), 'no rationale text on a proposed template (§11, §13)');
}

resetVisualTemplateStore();
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
