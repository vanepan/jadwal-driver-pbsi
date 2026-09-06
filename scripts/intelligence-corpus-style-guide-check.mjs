/* ============================================================
   intelligence-corpus-style-guide-check.mjs — PBSI NOR Style Guide
   (V2, Phase 5.x.5)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the Style Guide contract, proposal builder, authority
   helpers, retrieval + effective-rule resolver, and the Memory backend's
   full lifecycle.

   Fixtures (Phase 5.x.5 §24):
     A  a Writing Memory candidate becomes PROPOSED, NOT APPROVED
     B  an authorized human approves it with a rationale
     C  client-supplied approvedBy / approvedAt / authorityState / version
        are ignored — authority is server-derived
     D  two conflicting rules → resolver returns `conflict`, never a
        frequency pick
     E  approved v1 is superseded by approved v2; v1 stays immutable /
        auditable / queryable
     F  historical evidence proposes a rule but does NOT auto-approve it
     G  current evidence proposes a rule but does NOT auto-approve it
     H  a cross-document-type candidate preserves its document-type
        distribution

   Plus §23: contract validity (evidence-backed, verbatim value, never
   auto-`approved`, derived authorityState); proposal (source ids +
   evidence + temporal preserved, no fabricated rationale); approval
   (rationale required, actor required, no silent mutation of approved);
   state machine (rejected/deprecated terminal, no approved→approved);
   conflicts (both sides kept, resolver fails closed, no frequency vote);
   retrieval (effective = approved only; proposed/rejected/deprecated
   excluded; history on request); no-automatic-authority (§22).

   Run:  node scripts/intelligence-corpus-style-guide-check.mjs   (exit 0 = pass)
   ============================================================ */

import { makeCorpusObservation, OBSERVATION_CATEGORY } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import { makeCorpusDocument, CORPUS_DOCUMENT_TYPE } from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import { buildWritingMemory } from '../src/intelligence/corpus/writing-memory/writing-memory-builder.js';
import {
  STYLE_GUIDE_SCHEMA, STYLE_RULE_SCHEMA, STYLE_RULE_STATUS, STYLE_RULE_STATUS_GRAPH,
  STYLE_AUTHORITY_STATE, STYLE_GUIDE_SCOPE, STYLE_RULE_CATEGORIES, STYLE_GUIDE_AUDIT_EVENTS,
  STYLE_RULE_EVIDENCE_FIELDS, STYLE_RULE_TEMPORAL_FIELDS,
  makeStyleRule, isStyleRule, styleRuleIdFrom, canStyleRuleTransition, authorityStateForStatus,
} from '../src/intelligence/corpus/style-guide/contracts/style-guide-contract.js';
import {
  makeStyleGuideProposalFromMemory, buildStyleGuideProposals, makeSupersedingProposal,
} from '../src/intelligence/corpus/style-guide/style-guide-proposal.js';
import {
  markApproved, markRejected, markDeprecated,
} from '../src/intelligence/corpus/style-guide/style-guide-authority.js';
import {
  getEffectiveStyleGuide, queryStyleGuide, getProposedStyleRules, getEffectiveRulesForType,
  resolveEffectiveRule, findStyleGuideConflicts, getSupersessionChain,
} from '../src/intelligence/corpus/style-guide/style-guide-query.js';
import {
  listStyleRules, getStyleRule, proposeStyleRuleFromMemory, approveStyleRule, rejectStyleRule,
  deprecateStyleRule, resolveStyleRule, getStyleRuleHistory,
  registerStyleGuideBackend, setActiveStyleGuideBackend, resetStyleGuideStore,
  memoryStyleGuideBackend, resetMemoryStyleGuideBackend, MEMORY_STYLE_GUIDE_BACKEND_ID,
} from '../src/intelligence/corpus/style-guide/style-guide-store.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-04T00:00:00.000Z';
let _n = 0;
const obs = (documentId, value, key = 'recipient_label', category = OBSERVATION_CATEGORY.RECIPIENT_CONVENTION) => makeCorpusObservation({
  observationId: `obs_${documentId}__${category}__${key}__${++_n}`,
  documentId, category, key, observedValue: value, modality: 'text',
  provenance: [{ sourceDocumentId: documentId, sourceFileId: null, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.85 }],
  confidence: 0.85, occurrenceCount: 1, lifecycleState: 'observed', createdAt: AT, updatedAt: AT,
});
const doc = (id, sourceDate, documentType = CORPUS_DOCUMENT_TYPE.NOR) => makeCorpusDocument({
  checksum: id.padEnd(64, '0'), documentId: `corpus_${id}`, ownerId: 'evan', sourceDate, documentType, createdAt: AT,
});
const CFG = { candidateMinDocuments: 3, temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2, minHistoricalDocuments: 1, conflictMinorityRatio: 0.34 } };
const wm = (documents, observations, cfg = CFG, approvedRules = []) => buildWritingMemory({ documents, observations, approvedRules }, cfg, { at: AT });
const entryByValue = (report, value, scope) => report.entries.find((e) => e.value === value && (!scope || e.documentType === scope));

function useMemoryBackend() {
  resetStyleGuideStore();
  resetMemoryStyleGuideBackend();
  registerStyleGuideBackend(memoryStyleGuideBackend);
  setActiveStyleGuideBackend(MEMORY_STYLE_GUIDE_BACKEND_ID);
}

/* ════════════════════════════════════════════════════════════════════════ */

section('contract — StyleRule shape + hard boundaries (§4, §8, §11, §22)');
{
  const memReport = wm(
    [doc('c1', '2026-01-01'), doc('c2', '2026-02-01'), doc('c3', '2026-03-01')],
    [1, 2, 3].map((i) => obs(`corpus_c${i}`, 'Yth.')),
  );
  const mem = entryByValue(memReport, 'Yth.');
  const p = makeStyleGuideProposalFromMemory(mem, { at: AT, actorId: 'evan' });
  check(isStyleRule(p) && p.schema === STYLE_RULE_SCHEMA && p.styleGuideSchema === STYLE_GUIDE_SCHEMA && Object.isFrozen(p), 'makeStyleGuideProposalFromMemory → a valid frozen StyleRule');
  check(p.status === STYLE_RULE_STATUS.PROPOSED && p.authorityState === STYLE_AUTHORITY_STATE.PROPOSED, 'a fresh proposal is status=proposed, authorityState=proposed');
  check(p.rationale === null && p.approvedBy === null && p.approvedAt === null, 'a proposal has NO rationale / approvedBy / approvedAt (§13)');
  check(STYLE_RULE_EVIDENCE_FIELDS.every((f) => f in p.evidence) && STYLE_RULE_TEMPORAL_FIELDS.every((f) => f in p.temporalEvidence), 'every transparent evidence + temporal component is present (§11, §7)');
  check(p.sourceMemoryIds.length === 1 && p.sourceObservationIds.length >= 1 && p.sourceDocumentIds.length >= 1, 'evidence-backed: >= 1 source memory / observation / document id (§11)');
  check(!isStyleRule({ ...p, sourceMemoryIds: [] }) && !isStyleRule({ ...p, sourceObservationIds: [] }) && !isStyleRule({ ...p, sourceDocumentIds: [] }), 'a StyleRule with NO evidence is invalid — no manual-rule type this phase (§11)');
  check(!isStyleRule({ ...p, value: '' }), 'a StyleRule with no verbatim value is invalid (§11)');
  check(makeStyleRule({ ...p, authorityState: 'authoritative' }).authorityState === STYLE_AUTHORITY_STATE.PROPOSED, 'a client-supplied authorityState is IGNORED — it is derived from status (§4, §9)');
  check(makeStyleRule({ ...p, status: 'approved' }).authorityState === STYLE_AUTHORITY_STATE.AUTHORITATIVE && authorityStateForStatus('approved') === 'authoritative', 'authorityState follows status: approved ⇒ authoritative');
  check(!isStyleRule({ ...p, status: 'approved' }), 'isStyleRule REJECTS a status=approved record with no rationale / approvedBy (§9, §10)');
  check(STYLE_RULE_CATEGORIES.length === 13 && !STYLE_RULE_CATEGORIES.includes('layout') && !STYLE_RULE_CATEGORIES.includes('structure'), 'the category set is the Writing Memory language subset — layout / structure are OUT (§5)');
  check(p.ruleId === styleRuleIdFrom('organization', 'recipient_convention', 'recipient_label', 'NOR', 'Yth.'), 'ruleId is deterministic from (scope, category, key, documentType, value) (§13)');
}

section('proposal — provenance, evidence + temporal preserved; NEVER approved; no fabricated rationale (§10, §13)');
{
  const report = wm(
    [doc('p1', '2022-01-01'), doc('p2', '2023-01-01'), doc('p3', '2024-06-01')],
    [1, 2, 3].map((i) => obs(`corpus_p${i}`, 'Nota Organisasi', 'term_nota', OBSERVATION_CATEGORY.ORGANIZATIONAL_TERM)),
  );
  const mem = entryByValue(report, 'Nota Organisasi');
  const p = makeStyleGuideProposalFromMemory(mem, { at: AT, actorId: 'evan' });
  check(p.sourceMemoryIds[0] === mem.memoryId, 'the source memory id is preserved');
  check(JSON.stringify([...p.sourceObservationIds].sort()) === JSON.stringify([...mem.sourceObservationIds].sort()), 'the source observation ids are preserved');
  check(JSON.stringify([...p.sourceDocumentIds].sort()) === JSON.stringify([...mem.sourceDocumentIds].sort()), 'the source document ids are preserved');
  check(p.temporalEvidence.temporalStatus === mem.temporalStatus && p.temporalEvidence.conventionEra === mem.conventionEra, 'the temporal evidence (status + era) is carried through (§7)');
  check(p.evidence.documentCount === mem.evidence.documentCount && p.evidence.occurrenceCount === mem.evidence.occurrenceCount, 'occurrence / document counts are carried through');
  check(p.confidence === mem.confidence && p.status === 'proposed', 'confidence is carried but does NOT change status (§22)');
  check(p.rationale === null, 'the proposal builder NEVER fabricates a rationale (§10, §13)');
  check(p.auditTrail.length === 1 && p.auditTrail[0].event === STYLE_GUIDE_AUDIT_EVENTS.PROPOSED && p.auditTrail[0].detail.fromWritingMemory === true, 'the first audit entry is STYLE_RULE_PROPOSED, tagged fromWritingMemory');
  check(makeStyleGuideProposalFromMemory({ ...mem, category: 'layout' }, { at: AT }) === null, 'a non-language category yields NO proposal (§5)');
  check(makeStyleGuideProposalFromMemory({ ...mem, memoryId: '' }, { at: AT }) === null, 'a memory with no id yields NO proposal');
}

section('A + F + G — evidence proposes, NEVER auto-approves (§22, §24.A/F/G)');
{
  // F — historical
  const histReport = wm(
    [doc('f1', '2022-01-01'), doc('f2', '2023-01-01'), doc('f3', '2024-01-01')],
    [1, 2, 3].map((i) => obs(`corpus_f${i}`, 'Bersama ini', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN)),
  );
  const fMem = entryByValue(histReport, 'Bersama ini');
  const fP = makeStyleGuideProposalFromMemory(fMem, { at: AT, actorId: 'evan' });
  check(fMem.authorityState === 'candidate' && fP.status === 'proposed' && fP.authorityState !== 'authoritative', 'F: a historical candidate → PROPOSED, never authoritative (§24.F)');
  check(fP.temporalEvidence.conventionEra === 'historical' && fP.temporalEvidence.temporalStatus === 'historical_only', 'F: the historical era / historical_only status is recorded as EVIDENCE only (§7)');

  // G — current
  const curReport = wm(
    [doc('g1', '2026-01-05'), doc('g2', '2026-02-05'), doc('g3', '2026-03-05')],
    [1, 2, 3].map((i) => obs(`corpus_g${i}`, 'Dengan hormat,', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN)),
  );
  const gMem = entryByValue(curReport, 'Dengan hormat,');
  const gP = makeStyleGuideProposalFromMemory(gMem, { at: AT, actorId: 'evan' });
  check(gMem.temporalStatus === 'current_evidence' && gP.status === 'proposed' && gP.authorityState !== 'authoritative', 'G: a current-evidence candidate → PROPOSED, never authoritative (§24.G, §22)');

  // A — via the store: propose does not approve
  useMemoryBackend();
  const r = proposeStyleRuleFromMemory({ memory: gMem, actorId: 'evan', now: AT });
  check(r.ok && r.data.status === 'proposed' && r.data.authorityState === 'proposed', 'A: proposeStyleRuleFromMemory persists status=proposed (§24.A)');
  check(getEffectiveStyleGuide(listStyleRules().data).length === 0, 'A: the effective (approved-only) Style Guide is still EMPTY (§20, §22)');
  check(getProposedStyleRules(listStyleRules().data).length === 1, 'A: the proposal IS in the review queue');
}

section('B + C — human approval; server owns the authority metadata (§9, §10, §24.B/C)');
{
  useMemoryBackend();
  const report = wm(
    [doc('b1', '2026-01-01'), doc('b2', '2026-02-01'), doc('b3', '2026-03-01')],
    [1, 2, 3].map((i) => obs(`corpus_b${i}`, 'Yth.')),
  );
  const mem = entryByValue(report, 'Yth.');
  const proposed = proposeStyleRuleFromMemory({ memory: mem, actorId: 'evan', now: AT }).data;

  // C — a hostile client payload. The pure builder reads ONLY ctx.version /
  // ctx.actorId / ctx.at — a `version` / `authorityState` / `approvedBy`
  // riding on the Writing Memory entry is never honoured (§9, §24.C). The
  // callable equivalent (data.version / data.authorityState never read) is
  // asserted in the .cjs check.
  const hostile = makeStyleRule({
    ...proposed,
    status: 'proposed',
    authorityState: 'authoritative',
    approvedBy: 'fake-user',
    approvedAt: 'fake-time',
    rationale: 'client says approved',
  });
  check(hostile.authorityState === 'proposed' && hostile.approvedBy === null && hostile.approvedAt === null && hostile.rationale === null, 'C: client approvedBy / approvedAt / authorityState / rationale are stripped while status is proposed (§9, §24.C)');
  const fromHostileMem = makeStyleGuideProposalFromMemory({ ...mem, version: 999, authorityState: 'approved', approvedBy: 'fake' }, { at: AT, actorId: 'evan' });
  check(fromHostileMem.version === 1 && fromHostileMem.status === 'proposed' && fromHostileMem.approvedBy === null, 'C: a `version` / `authorityState` / `approvedBy` on the source memory is IGNORED — the builder reads only ctx (§9)');

  // B — a real approval
  const noRationale = approveStyleRule(proposed.ruleId, { actorId: 'evan', rationale: '   ', at: AT });
  check(!noRationale.ok && noRationale.error.code === 'RATIONALE_REQUIRED', 'B: an empty / whitespace rationale is REJECTED (§10)');
  const ok = approveStyleRule(proposed.ruleId, {
    actorId: 'evan',
    rationale: 'Disetujui karena digunakan secara konsisten pada dokumen NOR periode berjalan.',
    at: AT,
  });
  check(ok.ok && ok.data.status === 'approved' && ok.data.authorityState === 'authoritative', 'B: proposed → approved with an authorized actor + rationale (§24.B)');
  check(ok.data.approvedBy === 'evan' && ok.data.approvedAt === AT, 'B: approvedBy / approvedAt are SERVER-derived (the actor + timestamp passed in), not client values (§9)');
  check(ok.data.rationale.startsWith('Disetujui karena'), 'B: the human rationale is stored verbatim');
  check(ok.data.auditTrail.some((e) => e.event === 'STYLE_RULE_APPROVED' && e.actorId === 'evan'), 'B: an STYLE_RULE_APPROVED audit entry records the actor');
  check(getEffectiveStyleGuide(listStyleRules().data).length === 1, 'B: the rule is now in the effective Style Guide');
}

section('state machine — no silent mutation of approved; rejected / deprecated terminal (§8)');
{
  check(JSON.stringify(STYLE_RULE_STATUS_GRAPH.proposed) === JSON.stringify(['approved', 'rejected']), 'proposed → { approved, rejected }');
  check(JSON.stringify(STYLE_RULE_STATUS_GRAPH.approved) === JSON.stringify(['deprecated']), 'approved → { deprecated } ONLY — no approved→approved content mutation (§8)');
  check(STYLE_RULE_STATUS_GRAPH.rejected.length === 0 && STYLE_RULE_STATUS_GRAPH.deprecated.length === 0, 'rejected + deprecated are TERMINAL (fail closed — §14, §21)');
  check(!canStyleRuleTransition('rejected', 'approved'), 'a rejected rule can NEVER be approved (§14)');
  check(!canStyleRuleTransition('deprecated', 'approved'), 'a deprecated rule can NEVER become active again (§8)');

  useMemoryBackend();
  const report = wm([doc('s1', '2026-01-01'), doc('s2', '2026-02-01'), doc('s3', '2026-03-01')], [1, 2, 3].map((i) => obs(`corpus_s${i}`, 'Yth.')));
  const mem = entryByValue(report, 'Yth.');
  const p = proposeStyleRuleFromMemory({ memory: mem, actorId: 'evan', now: AT }).data;
  const approved = approveStyleRule(p.ruleId, { actorId: 'evan', rationale: 'ok', at: AT }).data;
  const reApprove = approveStyleRule(p.ruleId, { actorId: 'evan', rationale: 'again', at: AT });
  check(!reApprove.ok && reApprove.error.code === 'ILLEGAL_TRANSITION', 'approving an already-approved rule is refused (no approved→approved)');
  const editViaMake = markApproved(approved, { actorId: 'evan', rationale: 'x', at: AT });
  check(editViaMake.error === 'ILLEGAL_TRANSITION', 'the pure markApproved refuses to re-approve an approved rule');
  const rej = rejectStyleRule(p.ruleId, { actorId: 'evan', reason: 'nope', at: AT });
  check(!rej.ok && rej.error.code === 'ILLEGAL_TRANSITION', 'an approved rule cannot be rejected');
  // a fresh proposal for a decided slot value is refused (must supersede)
  const again = proposeStyleRuleFromMemory({ memory: mem, actorId: 'evan', now: AT });
  check(!again.ok && again.error.code === 'RULE_EXISTS', 'a re-proposal of an already-decided slot value is refused — a changed value must SUPERSEDE (§8, §15)');
}

section('reject / deprecate — actor + reason preserved; retained (§8, §10)');
{
  useMemoryBackend();
  const report = wm([doc('r1', '2026-01-01'), doc('r2', '2026-02-01'), doc('r3', '2026-03-01')], [1, 2, 3].map((i) => obs(`corpus_r${i}`, 'Kepada Yth.')));
  const mem = entryByValue(report, 'Kepada Yth.');
  const p = proposeStyleRuleFromMemory({ memory: mem, actorId: 'evan', now: AT }).data;
  const noReason = rejectStyleRule(p.ruleId, { actorId: 'evan', reason: '  ', at: AT });
  check(!noReason.ok && noReason.error.code === 'REASON_REQUIRED', 'reject without a reason is refused (§10)');
  const rej = rejectStyleRule(p.ruleId, { actorId: 'evan', reason: 'Bukan bentuk yang digunakan PBSI.', at: AT }).data;
  check(rej.status === 'rejected' && rej.authorityState === 'not_authoritative' && rej.rejectedBy === 'evan', 'reject records status + actor');
  check(rej.auditTrail.some((e) => e.event === 'STYLE_RULE_REJECTED' && e.detail.reason === 'Bukan bentuk yang digunakan PBSI.'), 'the reject reason is preserved in the audit trail');
  check(getStyleRule(p.ruleId).ok, 'the rejected rule is RETAINED (not deleted — §8)');
  check(getEffectiveStyleGuide(listStyleRules().data).length === 0 && queryStyleGuide(listStyleRules().data, { status: 'rejected' }).length === 1, 'rejected rules are excluded from the effective set but queryable (§20)');
}

section('D — conflicting rules: resolver returns `conflict`, NEVER a frequency pick (§12, §21, §22, §24.D)');
{
  useMemoryBackend();
  // "Yth." — 4 documents ;  "Kepada Yth." — 2 documents.  Frequency favours "Yth."
  const report = wm(
    [doc('d1', '2026-01-01'), doc('d2', '2026-02-01'), doc('d3', '2026-03-01'), doc('d4', '2026-04-01'), doc('d5', '2026-05-01'), doc('d6', '2026-06-01')],
    [
      obs('corpus_d1', 'Yth.'), obs('corpus_d2', 'Yth.'), obs('corpus_d3', 'Yth.'), obs('corpus_d4', 'Yth.'),
      obs('corpus_d5', 'Kepada Yth.'), obs('corpus_d6', 'Kepada Yth.'),
    ],
    { candidateMinDocuments: 2, temporal: { ...CFG.temporal, minCurrentDocuments: 2 } },
  );
  const memA = entryByValue(report, 'Yth.', 'NOR');
  const memB = entryByValue(report, 'Kepada Yth.', 'NOR');
  const pA = proposeStyleRuleFromMemory({ memory: memA, actorId: 'evan', now: AT }).data;
  const pB = proposeStyleRuleFromMemory({ memory: memB, actorId: 'evan', now: AT }).data;
  check(pA && pB && pA.ruleId !== pB.ruleId, 'both competing values become SEPARATE proposals (§12)');

  const approveA = approveStyleRule(pA.ruleId, { actorId: 'evan', rationale: 'frequent', at: AT });
  check(approveA.ok, 'the first (more frequent) value is approved');
  const approveB = approveStyleRule(pB.ruleId, { actorId: 'evan', rationale: 'also seen', at: AT });
  check(!approveB.ok && approveB.error.code === 'CONFLICT_UNRESOLVED', 'approving a SECOND competing value fails CLOSED unless superseded or explicitly acknowledged (§14, §21)');

  const approveBAck = approveStyleRule(pB.ruleId, { actorId: 'evan', rationale: 'intentional coexistence', at: AT, acknowledgeConflict: true });
  check(approveBAck.ok, '…with an explicit acknowledgeConflict, both approved rules can coexist');

  const res = resolveStyleRule({ scope: 'organization', category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' });
  check(res.data.outcome === 'conflict' && res.data.rule === null, 'D: resolveEffectiveRule returns `conflict` with NO chosen rule (§21)');
  check(res.data.competingRuleIds.length === 2 && res.data.competingRuleIds.includes(pA.ruleId) && res.data.competingRuleIds.includes(pB.ruleId), 'D: both competing rule ids are exposed');
  check(res.data.competing.every((c) => 'evidence' in c && 'temporalEvidence' in c), 'D: the competing evidence is exposed for the human to decide');
  const cf = findStyleGuideConflicts(listStyleRules().data).find((c) => c.status === 'approved');
  check(cf && cf.sides.length === 2, 'findStyleGuideConflicts surfaces the approved-slot conflict');
  // direct resolver test — never picks by frequency even without the ack path
  const twoApproved = [
    makeStyleRule({ ...pA, status: 'approved', rationale: 'a', approvedBy: 'x', approvedAt: AT }),
    makeStyleRule({ ...pB, status: 'approved', rationale: 'b', approvedBy: 'x', approvedAt: AT }),
  ];
  const r2 = resolveEffectiveRule(twoApproved, { category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' });
  check(r2.outcome === 'conflict', 'resolveEffectiveRule on two approved values → conflict (pure, no frequency vote — §22)');
}

section('E — approved v1 superseded by approved v2; v1 immutable + auditable (§15, §24.E)');
{
  useMemoryBackend();
  const r1 = wm([doc('e1', '2026-01-01'), doc('e2', '2026-02-01'), doc('e3', '2026-03-01')], [1, 2, 3].map((i) => obs(`corpus_e${i}`, 'Yth.')));
  const memV1 = entryByValue(r1, 'Yth.');
  const v1proposed = proposeStyleRuleFromMemory({ memory: memV1, actorId: 'evan', now: AT }).data;
  const v1 = approveStyleRule(v1proposed.ruleId, { actorId: 'evan', rationale: 'bentuk lama', at: AT }).data;
  const v1Snapshot = JSON.stringify(v1);

  // v2 — a new value for the same slot, from a fresh WM entry
  const r2 = wm([doc('e4', '2026-04-01'), doc('e5', '2026-05-01'), doc('e6', '2026-06-01')], [1, 2, 3].map((i) => obs(`corpus_e${i + 3}`, 'Kepada Yth.')));
  const memV2 = entryByValue(r2, 'Kepada Yth.');
  const sup = makeSupersedingProposal(v1, memV2, { at: AT, actorId: 'evan' });
  check(sup.proposal && sup.proposal.supersedesRuleId === v1.ruleId && sup.proposal.version === 2, 'makeSupersedingProposal links v2.supersedesRuleId = v1.ruleId, version 2 (§15)');
  check(makeSupersedingProposal(v1, { ...memV2, category: 'closing_pattern' }, { at: AT }).error === 'SLOT_MISMATCH', 'a superseding proposal for a different slot is refused');

  const v2proposed = proposeStyleRuleFromMemory({ memory: memV2, actorId: 'evan', now: AT, supersedesRuleId: v1.ruleId }).data;
  const v2 = approveStyleRule(v2proposed.ruleId, { actorId: 'evan', rationale: 'bentuk berjalan', at: AT }).data;
  check(v2.status === 'approved' && v2.version === 2 && v2.supersedesRuleId === v1.ruleId, 'E: v2 is approved, version 2, supersedes v1');

  const v1After = getStyleRule(v1.ruleId).data;
  check(v1After.status === 'deprecated' && v1After.supersededByRuleId === v2.ruleId, 'E: v1 was AUTO-deprecated and links forward to v2 (§15)');
  check(v1After.value === v1.value && v1After.rationale === v1.rationale && v1After.approvedBy === v1.approvedBy && v1After.approvedAt === v1.approvedAt, 'E: v1 content / approval metadata is UNCHANGED (immutable — §15)');
  check(v1After.auditTrail.some((e) => e.event === 'STYLE_RULE_PROPOSED') && v1After.auditTrail.some((e) => e.event === 'STYLE_RULE_APPROVED') && v1After.auditTrail.some((e) => e.event === 'STYLE_RULE_DEPRECATED'), 'E: v1 audit trail is append-only and complete (proposed → approved → deprecated)');

  const eff = getEffectiveStyleGuide(listStyleRules().data);
  check(eff.length === 1 && eff[0].ruleId === v2.ruleId, 'E: the effective Style Guide now returns ONLY v2');
  const resolved = resolveStyleRule({ category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' });
  check(resolved.data.outcome === 'resolved' && resolved.data.rule.ruleId === v2.ruleId, 'E: the resolver cleanly resolves to v2 (a linear supersession chain is NOT a conflict)');

  const chain = getStyleRuleHistory(v2.ruleId).data;
  check(chain.length === 2 && chain[0].ruleId === v1.ruleId && chain[1].ruleId === v2.ruleId, 'E: getStyleRuleHistory returns the full chain oldest → newest, v1 still queryable (§15)');
  const v1Snapshot2 = JSON.stringify(getSupersessionChain(listStyleRules().data, v1.ruleId).find((r) => r.ruleId === v1.ruleId));
  check(v1Snapshot2 && JSON.parse(v1Snapshot2).value === 'Yth.', 'E: v1 is still fully reconstructable from history');
  void v1Snapshot;
}

section('H — cross-document-type candidate preserves its document-type distribution (§13, §24.H)');
{
  const report = wm(
    [doc('h1', '2026-01-01', 'NOR'), doc('h2', '2026-02-01', 'NOR'), doc('h3', '2026-01-15', 'MEMORANDUM'), doc('h4', '2026-02-15', 'MEMORANDUM'), doc('h5', '2026-03-01', 'MEMORANDUM')],
    [obs('corpus_h1', 'Dengan hormat,', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN), obs('corpus_h2', 'Dengan hormat,', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN),
      obs('corpus_h3', 'Dengan hormat,', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN), obs('corpus_h4', 'Dengan hormat,', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN), obs('corpus_h5', 'Dengan hormat,', 'opening', OBSERVATION_CATEGORY.OPENING_PATTERN)],
  );
  const crossMem = report.entries.find((e) => e.documentType === 'cross_type' && e.value === 'Dengan hormat,');
  check(crossMem, 'a cross_type Writing Memory entry exists');
  const p = makeStyleGuideProposalFromMemory(crossMem, { at: AT, actorId: 'evan' });
  check(p.documentType === 'cross_type', 'H: the proposal keeps documentType = cross_type (never silently generalised to NOR — §6)');
  check(p.evidence.documentTypeDistribution.NOR === 2 && p.evidence.documentTypeDistribution.MEMORANDUM === 3, 'H: the per-type distribution { NOR: 2, MEMORANDUM: 3 } is preserved, never collapsed (§13, §24.H)');
  const norProposal = makeStyleGuideProposalFromMemory(entryByValue(report, 'Dengan hormat,', 'NOR'), { at: AT });
  check(norProposal && norProposal.documentType === 'NOR' && !('MEMORANDUM' in norProposal.evidence.documentTypeDistribution), 'H: the NOR-scoped proposal counts ONLY NOR documents');
}

section('retrieval — effective = approved only; scope-aware; deterministic (§20)');
{
  useMemoryBackend();
  const report = wm(
    [doc('q1', '2026-01-01', 'NOR'), doc('q2', '2026-02-01', 'NOR'), doc('q3', '2026-03-01', 'NOR'), doc('q4', '2026-01-05', 'MEMORANDUM'), doc('q5', '2026-02-05', 'MEMORANDUM'), doc('q6', '2026-03-05', 'MEMORANDUM')],
    [
      obs('corpus_q1', 'Yth.'), obs('corpus_q2', 'Yth.'), obs('corpus_q3', 'Yth.'),
      obs('corpus_q4', 'Kepada,'), obs('corpus_q5', 'Kepada,'), obs('corpus_q6', 'Kepada,'),
    ],
  );
  const norMem = entryByValue(report, 'Yth.', 'NOR');
  const memoMem = entryByValue(report, 'Kepada,', 'MEMORANDUM');
  const norRule = approveStyleRule(proposeStyleRuleFromMemory({ memory: norMem, actorId: 'evan', now: AT }).data.ruleId, { actorId: 'evan', rationale: 'nor form', at: AT }).data;
  const memoProposed = proposeStyleRuleFromMemory({ memory: memoMem, actorId: 'evan', now: AT }).data; // left proposed

  const all = listStyleRules().data;
  const eff = getEffectiveStyleGuide(all);
  check(eff.length === 1 && eff[0].ruleId === norRule.ruleId, 'the default effective set is APPROVED only — the proposed MEMORANDUM rule is excluded (§20)');
  check(getEffectiveStyleGuide(all, { status: 'proposed' }) && getEffectiveStyleGuide(all, { documentType: 'MEMORANDUM' }).length === 0, 'getEffectiveStyleGuide never returns a non-approved rule even when filtered');
  check(getProposedStyleRules(all).length === 1 && getProposedStyleRules(all)[0].ruleId === memoProposed.ruleId, 'getProposedStyleRules returns the review queue');
  check(getEffectiveRulesForType(all, 'NOR').length === 1 && getEffectiveRulesForType(all, 'MEMORANDUM').length === 0, 'getEffectiveRulesForType is scope-aware — a NOR query never leaks a MEMORANDUM rule');
  const missing = resolveEffectiveRule(all, { category: 'closing_pattern', key: 'closing', documentType: 'NOR' });
  check(missing.outcome === 'missing' && missing.rule === null, 'resolveEffectiveRule for an unknown slot → `missing` (distinct from conflict — §21)');
  const q1 = JSON.stringify(queryStyleGuide(all, { category: 'recipient_convention' }));
  const q2 = JSON.stringify(queryStyleGuide(all, { category: 'recipient_convention' }));
  check(q1 === q2, 'queryStyleGuide is deterministic (sorted by ruleId)');
}

section('determinism — same memory + ctx ⇒ byte-identical proposal (§13)');
{
  const report = wm([doc('z1', '2026-01-01'), doc('z2', '2026-02-01'), doc('z3', '2026-03-01')], [1, 2, 3].map((i) => obs(`corpus_z${i}`, 'Yth.')));
  const mem = entryByValue(report, 'Yth.');
  const p1 = makeStyleGuideProposalFromMemory(mem, { at: AT, actorId: 'evan' });
  const p2 = makeStyleGuideProposalFromMemory(mem, { at: AT, actorId: 'evan' });
  check(JSON.stringify(p1) === JSON.stringify(p2), 'two runs → byte-identical proposal');
  const set1 = buildStyleGuideProposals({ report }, { at: AT, actorId: 'evan' });
  const set2 = buildStyleGuideProposals({ report: wm([doc('z3', '2026-03-01'), doc('z1', '2026-01-01'), doc('z2', '2026-02-01')], [obs('corpus_z3', 'Yth.'), obs('corpus_z1', 'Yth.'), obs('corpus_z2', 'Yth.')]) }, { at: AT, actorId: 'evan' });
  check(set1.proposals.length === set2.proposals.length && set1.proposals[0].ruleId === set2.proposals[0].ruleId, 'buildStyleGuideProposals is input-order independent');
}

section('safety — the whole store contains no `authoritative` proposed rule, no fabricated rationale');
{
  useMemoryBackend();
  const report = wm([doc('x1', '2026-01-01'), doc('x2', '2026-02-01'), doc('x3', '2026-03-01')], [1, 2, 3].map((i) => obs(`corpus_x${i}`, 'Yth.')));
  const mem = entryByValue(report, 'Yth.');
  proposeStyleRuleFromMemory({ memory: mem, actorId: 'evan', now: AT });
  const asJson = JSON.stringify(listStyleRules().data);
  check(!/"status":"approved"/.test(asJson), 'no approved rule exists from a bare propose (§22)');
  check(!/"authorityState":"authoritative"/.test(asJson), 'no authoritative rule exists from a bare propose (§22)');
  check(!/"rationale":"[^"]/.test(asJson), 'no rationale text on a proposed rule (§10, §13)');
}

resetStyleGuideStore();
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
