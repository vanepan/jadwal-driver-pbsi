/* ============================================================
   intelligence-corpus-writing-memory-check.mjs — Organizational Writing
   Memory (V2, Phase 5.x.4)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the writing-memory contract, builder, and retrieval layer.

   Fixtures (Phase 5.x.4 §25):
     A  historical NOR terminology     → historical_only, era historical
     B  current NOR terminology        → current_evidence, era current
     C  NOR vs Memorandum, same phrase → document-type distribution preserved
     D  legacy wording                 → scope LEGACY, historical (NOT a current rule)
     E  current conflict               → both values kept, conflict entry
     F  approved rule aligned          → aligned; ruleUnchanged
     G  approved rule drift            → possible_drift; ruleUnchanged; rule NOT copied in
     H  unknown dates                  → insufficient_evidence / unknown
     I  repeated generation            → byte-identical output, stable IDs

   Plus: contract validation; §4 category filtering (layout/structure OUT);
   §5 evidence-backed (no evidence ⇒ not emitted); §6 verbatim wording;
   §8 NEVER `approved`; §18 confidence ≠ authority; §19 no black-box score;
   §20 retrieval (category / documentType / temporal / conflict filters,
   provenance retained).

   Run:  node scripts/intelligence-corpus-writing-memory-check.mjs   (exit 0 = pass)
   ============================================================ */

import { makeCorpusObservation, OBSERVATION_CATEGORY } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import { makeCorpusDocument, CORPUS_DOCUMENT_TYPE } from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import { CONVENTION_STATUS, TEMPORAL_CLASSIFICATION } from '../src/intelligence/corpus/temporal/contracts/temporal-contract.js';
import {
  WRITING_MEMORY_SCHEMA, WRITING_MEMORY_CATEGORIES, WRITING_AUTHORITY_STATE, PRODUCIBLE_AUTHORITY_STATES,
  DOCUMENT_TYPE_SCOPE, WRITING_MEMORY_EVIDENCE_FIELDS,
  makeWritingMemory, isWritingMemory, isWritingMemoryReport, memoryIdFrom,
} from '../src/intelligence/corpus/writing-memory/contracts/writing-memory-contract.js';
import { buildWritingMemory } from '../src/intelligence/corpus/writing-memory/writing-memory-builder.js';
import {
  queryWritingMemory, getWritingConventionsForType, getCurrentEvidence, getHistoricalOnly,
  getPreferredTerminology, getConflicts, getPossibleDrift, getAligned,
} from '../src/intelligence/corpus/writing-memory/writing-memory-query.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-04T00:00:00.000Z';
let _n = 0;
const obs = (documentId, value, key = 'opening_salutation', category = OBSERVATION_CATEGORY.OPENING_PATTERN, over = {}) => makeCorpusObservation({
  observationId: `obs_${documentId}__${category}__${key}__${++_n}`,
  documentId, category, key, observedValue: value, modality: 'text',
  provenance: [{ sourceDocumentId: documentId, sourceFileId: `file:${'0'.repeat(64)}`, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: over.confidence != null ? over.confidence : 0.85 }],
  confidence: over.confidence != null ? over.confidence : 0.85,
  occurrenceCount: over.occurrenceCount != null ? over.occurrenceCount : 1,
  lifecycleState: over.lifecycleState || 'observed', createdAt: AT, updatedAt: AT,
});
const doc = (id, sourceDate, documentType = CORPUS_DOCUMENT_TYPE.NOR) => makeCorpusDocument({
  checksum: id.padEnd(64, '0'), documentId: `corpus_${id}`, ownerId: 'evan', sourceDate, documentType, createdAt: AT,
});
const CFG = { candidateMinDocuments: 3, temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2, minHistoricalDocuments: 1, conflictMinorityRatio: 0.34 } };
const build = (documents, observations, cfg = CFG, approvedRules = []) => buildWritingMemory({ documents, observations, approvedRules }, cfg, { at: AT });
const entryFor = (r, value, scope) => r.entries.find((e) => e.value === value && (!scope || e.documentType === scope));

/* ════════════════════════════════════════════════════════════════════════ */

section('contract — WritingMemory shape + hard boundaries (§3, §5, §8)');
{
  const m = makeWritingMemory({
    memoryId: memoryIdFrom('NOR', 'opening_pattern', 'opening_salutation', 'Dengan hormat,'),
    category: 'opening_pattern', key: 'opening_salutation', value: 'Dengan hormat,', normalizedValue: 'dengan hormat,',
    documentType: 'NOR', temporalStatus: CONVENTION_STATUS.CURRENT_EVIDENCE, conventionEra: TEMPORAL_CLASSIFICATION.CURRENT,
    evidence: { documentCount: 4, recentDocumentCount: 4, occurrenceCount: 6, documentTypeDistribution: { NOR: 4 } },
    confidence: 0.95, authorityState: 'candidate', sourceObservationIds: ['obs_1'], sourceDocumentIds: ['corpus_1'], createdAt: AT,
  });
  check(isWritingMemory(m) && m.schema === WRITING_MEMORY_SCHEMA && Object.isFrozen(m), 'makeWritingMemory → a valid frozen WritingMemory');
  check(WRITING_MEMORY_EVIDENCE_FIELDS.every((f) => f in m.evidence), 'every transparent evidence component is present (no black-box score — §19)');
  check(!isWritingMemory({ ...m, sourceObservationIds: [] }) && !isWritingMemory({ ...m, sourceDocumentIds: [] }), 'a WritingMemory with NO evidence is invalid (§5)');
  check(!isWritingMemory({ ...m, value: '' }), 'a WritingMemory with no verbatim `value` is invalid (§6)');
  check(makeWritingMemory({ ...m, authorityState: 'approved' }).authorityState === 'observed', 'authorityState "approved" is COERCED away — this layer never produces it (§8)');
  check(!isWritingMemory({ ...m, authorityState: 'approved' }), 'isWritingMemory rejects an "approved" entry (§8)');
  check(PRODUCIBLE_AUTHORITY_STATES.join(',') === 'observed,candidate', 'the producible authority states are exactly observed + candidate');
  check(!WRITING_MEMORY_CATEGORIES.includes('layout') && !WRITING_MEMORY_CATEGORIES.includes('structure') && WRITING_MEMORY_CATEGORIES.length === 13, 'the category set is the LANGUAGE subset — layout / structure are OUT (§4)');
}

section('§4 — layout / structure observations are IGNORED by the builder');
{
  const r = build(
    [doc('l1', '2026-01-01'), doc('l2', '2026-02-01'), doc('l3', '2026-03-01')],
    [
      obs('corpus_l1', 'Dengan hormat,'), obs('corpus_l2', 'Dengan hormat,'), obs('corpus_l3', 'Dengan hormat,'),
      obs('corpus_l1', '596x842', 'page_geometry', 'layout'), obs('corpus_l2', 'meta_block_order', 'block_order', 'structure'),
    ],
  );
  check(r.entries.length === 1 && r.entries[0].category === 'opening_pattern', 'only the language observation produced an entry — the layout + structure observations were dropped (§4)');
}

section('A — historical NOR terminology (§25.A)');
{
  const r = build(
    [doc('a1', '2022-01-01'), doc('a2', '2023-01-01'), doc('a3', '2024-06-01')],
    [1, 2, 3].map((i) => obs(`corpus_a${i}`, 'Nota Organisasi', 'term_nota', 'organizational_term')),
  );
  const e = entryFor(r, 'Nota Organisasi');
  check(isWritingMemoryReport(r) && e && isWritingMemory(e), 'a valid report + entry');
  check(e.documentType === 'NOR' && e.temporalStatus === CONVENTION_STATUS.HISTORICAL_ONLY && e.conventionEra === TEMPORAL_CLASSIFICATION.HISTORICAL, 'scope NOR; temporalStatus historical_only; era historical');
  check(e.authorityState === WRITING_AUTHORITY_STATE.CANDIDATE, '3 documents → candidate (strong enough for a human to review — NOT an official standard, §9)');
  check(e.evidence.documentTypeDistribution.NOR === 3 && e.evidence.historicalDocumentCount === 3 && e.evidence.recentDocumentCount === 0, 'evidence: 3 NOR historical documents');
}

section('B — current NOR terminology (§25.B)');
{
  const r = build([doc('b1', '2026-01-05'), doc('b2', '2026-02-05'), doc('b3', '2026-03-05')], [1, 2, 3].map((i) => obs(`corpus_b${i}`, 'Dengan hormat,')));
  const e = entryFor(r, 'Dengan hormat,');
  check(e.temporalStatus === CONVENTION_STATUS.CURRENT_EVIDENCE && e.conventionEra === TEMPORAL_CLASSIFICATION.CURRENT, 'temporalStatus current_evidence; era current');
  check(e.authorityState === WRITING_AUTHORITY_STATE.CANDIDATE && e.authorityState !== WRITING_AUTHORITY_STATE.APPROVED, 'candidate — NEVER approved (§8)');
}

section('C — NOR vs Memorandum: document-type distribution preserved (§13, §25.C)');
{
  const r = build(
    [doc('c1', '2026-01-01', 'NOR'), doc('c2', '2026-02-01', 'NOR'), doc('c3', '2026-01-15', 'MEMORANDUM'), doc('c4', '2026-02-15', 'MEMORANDUM')],
    [obs('corpus_c1', 'Dengan hormat,'), obs('corpus_c2', 'Dengan hormat,'), obs('corpus_c3', 'Dengan hormat,'), obs('corpus_c4', 'Dengan hormat,')],
  );
  const nor = entryFor(r, 'Dengan hormat,', 'NOR');
  const memo = entryFor(r, 'Dengan hormat,', 'MEMORANDUM');
  const cross = entryFor(r, 'Dengan hormat,', DOCUMENT_TYPE_SCOPE.CROSS_TYPE);
  check(nor && memo && cross, 'a NOR-scoped, a MEMORANDUM-scoped, AND a cross_type entry are produced (scope retained — §11, §12)');
  check(nor.evidence.documentTypeDistribution.NOR === 2 && !('MEMORANDUM' in nor.evidence.documentTypeDistribution), 'the NOR-scoped entry counts ONLY NOR documents');
  check(cross.evidence.documentTypeDistribution.NOR === 2 && cross.evidence.documentTypeDistribution.MEMORANDUM === 2, 'the cross_type entry keeps the per-type distribution — NEVER collapsed into one number (§13)');
  check(cross.documentType === 'cross_type', 'the cross_type entry is clearly scoped `cross_type`, not silently generalised to NOR');
}

section('D — legacy wording is NOT a current rule (§12, §25.D)');
{
  const r = build(
    [doc('d1', '2019-01-01', 'LEGACY'), doc('d2', '2020-01-01', 'LEGACY'), doc('d3', '2021-01-01', 'LEGACY')],
    [1, 2, 3].map((i) => obs(`corpus_d${i}`, 'Bersama surat ini')),
  );
  const e = entryFor(r, 'Bersama surat ini');
  check(e.documentType === 'LEGACY', 'scope stays LEGACY — never generalised to a universal PBSI convention (§12)');
  check(e.temporalStatus === CONVENTION_STATUS.HISTORICAL_ONLY && e.conventionEra === TEMPORAL_CLASSIFICATION.HISTORICAL, 'historical_only / historical — legacy/historical evidence, not a current rule');
  check(e.authorityState !== WRITING_AUTHORITY_STATE.APPROVED, 'authorityState is observed/candidate — never approved');
}

section('E — current conflict: both values kept (§14, §25.E)');
{
  const r = build(
    [doc('e1', '2026-01-01'), doc('e2', '2026-02-01'), doc('e3', '2026-03-01'), doc('e4', '2026-04-01')],
    [obs('corpus_e1', 'Sehubungan dengan hal tersebut'), obs('corpus_e2', 'Sehubungan dengan hal tersebut'), obs('corpus_e3', 'Dengan hormat,'), obs('corpus_e4', 'Dengan hormat,')],
    { candidateMinDocuments: 2, temporal: { ...CFG.temporal, minCurrentDocuments: 2 } },
  );
  check(r.entries.filter((x) => x.category === 'opening_pattern' && x.documentType === 'NOR').length === 2, 'BOTH competing openings are retained as separate entries (§14) — neither is chosen');
  check(r.entries.every((x) => x.temporalStatus === CONVENTION_STATUS.CONFLICTING), 'both entries are temporalStatus conflicting');
  const conflicts = getConflicts(r);
  check(conflicts.length >= 1 && conflicts[0].sides.length === 2, 'a WritingMemoryConflict keeps both sides in full (§14)');
  check(conflicts[0].sides.map((s) => s.value).sort().join(' | ') === 'Dengan hormat, | Sehubungan dengan hal tersebut', 'both verbatim values are exposed side by side');
  check(!JSON.stringify(r).includes('"best"'), 'no "best" phrase is chosen');
}

section('F — approved rule aligned; rule unchanged (§16, §25.F)');
{
  const r = build(
    [doc('f1', '2026-01-01'), doc('f2', '2026-02-01'), doc('f3', '2026-03-01')],
    [1, 2, 3].map((i) => obs(`corpus_f${i}`, 'Demikian disampaikan', 'closing', 'closing_pattern')),
    CFG, [{ category: 'closing_pattern', key: 'closing', value: 'Demikian disampaikan', ruleId: 'rule_c' }],
  );
  const e = entryFor(r, 'Demikian disampaikan');
  check(e.temporalStatus === CONVENTION_STATUS.ALIGNED, 'the entry reads aligned');
  check(e.authorityState !== WRITING_AUTHORITY_STATE.APPROVED, 'the aligned entry is STILL observed/candidate — the approved rule was NOT copied in as if approved here (§8, §16)');
  check(e.evidence.approvedRulePresent === true && e.evidence.approvedRuleMatches === true, 'evidence records that an approved rule is present and matches');
  check(r.drift.length === 1 && r.drift[0].status === CONVENTION_STATUS.ALIGNED && r.drift[0].ruleUnchanged === true, 'a drift finding: aligned, ruleUnchanged true (§17)');
}

section('G — approved rule drift; rule unchanged, not copied (§16, §17, §25.G)');
{
  const approvedRule = { category: 'closing_pattern', key: 'closing', value: 'Demikian disampaikan', ruleId: 'rule_c', approvedBy: 'HUMAN', approvedAt: '2020-01-01', authorityState: 'approved' };
  const r = build(
    [doc('g1', '2022-01-01'), doc('g2', '2026-01-01'), doc('g3', '2026-02-01'), doc('g4', '2026-03-01')],
    [
      obs('corpus_g1', 'Demikian disampaikan', 'closing', 'closing_pattern'),
      obs('corpus_g2', 'Demikian kami sampaikan', 'closing', 'closing_pattern'),
      obs('corpus_g3', 'Demikian kami sampaikan', 'closing', 'closing_pattern'),
      obs('corpus_g4', 'Demikian kami sampaikan', 'closing', 'closing_pattern'),
    ],
    CFG, [approvedRule],
  );
  const recent = entryFor(r, 'Demikian kami sampaikan');
  const approved = entryFor(r, 'Demikian disampaikan');
  check(recent && recent.temporalStatus === CONVENTION_STATUS.CURRENT_EVIDENCE, 'the recent value has current_evidence');
  check(approved && approved.temporalStatus === CONVENTION_STATUS.POSSIBLE_DRIFT, 'the approved value reads possible_drift');
  check(r.drift.length === 1 && r.drift[0].status === CONVENTION_STATUS.POSSIBLE_DRIFT && r.drift[0].ruleUnchanged === true, 'drift finding: possible_drift, ruleUnchanged true (§17)');
  check(r.drift[0].approvedRule.value === 'Demikian disampaikan' && r.drift[0].approvedRule.ruleId === 'rule_c'
    && !('approvedBy' in r.drift[0].approvedRule) && !('authorityState' in r.drift[0].approvedRule),
    'the approved rule is echoed with ONLY {category,key,value,ruleId} — approvedBy / authorityState dropped (§23)');
  check(r.entries.every((e) => e.authorityState !== 'approved'), 'NO entry is `approved` — the drifting rule was not turned into an approved memory entry (§8)');
  check(getPossibleDrift(r).length === 1, 'getPossibleDrift retrieval helper surfaces the finding');
}

section('H — unknown dates → insufficient_evidence / unknown (§15, §25.H)');
{
  const r = build([doc('h1', null), doc('h2', null), doc('h3', null)], [1, 2, 3].map((i) => obs(`corpus_h${i}`, 'Dengan hormat,')));
  const e = entryFor(r, 'Dengan hormat,');
  check(e.temporalStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE && e.conventionEra === TEMPORAL_CLASSIFICATION.UNKNOWN, 'no sourceDate → insufficient_evidence / unknown — not guessed (§15)');
  check(e.evidence.undatedDocumentCount === 3 && e.evidence.recentDocumentCount === 0 && e.evidence.historicalDocumentCount === 0, 'evidence counts the undated documents honestly, never buckets them (§15)');
  check(e.authorityState === WRITING_AUTHORITY_STATE.CANDIDATE, 'still `candidate` (3 documents is enough corroboration for review) — candidate ≠ current, candidate ≠ approved (§9, §18)');
}

section('I — repeated generation is byte-identical; IDs stable (§10, §24)');
{
  const docs = [doc('i1', '2022-01-01'), doc('i2', '2026-02-01'), doc('i3', '2026-03-01'), doc('i4', '2026-04-01', 'MEMORANDUM')];
  const obss = [obs('corpus_i1', 'X phrase'), obs('corpus_i2', 'X phrase'), obs('corpus_i3', 'X phrase'), obs('corpus_i4', 'X phrase')];
  const r1 = build(docs, obss);
  const r2 = build([...docs].reverse(), [...obss].reverse());
  const r3 = build(docs, obss);
  check(JSON.stringify(r1) === JSON.stringify(r2), 'reversing the input order → byte-identical report');
  check(JSON.stringify(r1) === JSON.stringify(r3), 'running twice → byte-identical report');
  check(r1.entries.map((e) => e.memoryId).join(',') === r2.entries.map((e) => e.memoryId).join(','), 'memoryIds are stable + order-independent');
  check(new Set(r1.entries.map((e) => e.memoryId)).size === r1.entries.length, 'no duplicate memoryIds (idempotent — §24)');
}

section('§18 — confidence ≠ authority');
{
  const r = build(
    [doc('k1', '2019-01-01'), doc('k2', '2020-01-01')],
    [obs('corpus_k1', 'Old phrase', 'x', 'preferred_phrase', { confidence: 0.99 }), obs('corpus_k2', 'Old phrase', 'x', 'preferred_phrase', { confidence: 0.98 })],
  );
  const e = entryFor(r, 'Old phrase');
  check(e.confidence >= 0.98 && e.authorityState === WRITING_AUTHORITY_STATE.OBSERVED, 'confidence ~0.99 but authorityState "observed" — high confidence a pattern EXISTS is not authority (§18)');
  check(e.temporalStatus === CONVENTION_STATUS.HISTORICAL_ONLY, '…and it is historical_only, not a current rule');
}

section('§20 — retrieval interface (deterministic, scope-aware, provenance-preserving)');
{
  const r = build(
    [doc('q1', '2022-01-01', 'NOR'), doc('q2', '2026-01-01', 'NOR'), doc('q3', '2026-02-01', 'NOR'), doc('q4', '2026-01-05', 'MEMORANDUM'), doc('q5', '2026-02-05', 'MEMORANDUM'), doc('q6', '2026-03-05', 'MEMORANDUM')],
    [
      obs('corpus_q1', 'Kepada Yth.', 'recipient_label', 'recipient_convention'),
      obs('corpus_q2', 'Kepada Yth.', 'recipient_label', 'recipient_convention'),
      obs('corpus_q3', 'Kepada Yth.', 'recipient_label', 'recipient_convention'),
      obs('corpus_q4', 'Yang terhormat', 'recipient_label', 'recipient_convention'),
      obs('corpus_q5', 'Yang terhormat', 'recipient_label', 'recipient_convention'),
      obs('corpus_q6', 'Yang terhormat', 'recipient_label', 'recipient_convention'),
    ],
  );
  const norConv = getWritingConventionsForType(r, 'NOR');
  check(norConv.length >= 1 && norConv.every((e) => e.documentType === 'NOR' || e.documentType === 'cross_type'), 'getWritingConventionsForType("NOR") → NOR + cross_type scope only (scope-aware)');
  check(!norConv.some((e) => e.documentType === 'MEMORANDUM'), '…never leaks a MEMORANDUM-only entry into a NOR query');
  const currentRecipients = queryWritingMemory(r, { category: 'recipient_convention', temporalStatus: CONVENTION_STATUS.CURRENT_EVIDENCE });
  check(currentRecipients.length >= 1 && currentRecipients.every((e) => e.category === 'recipient_convention' && e.temporalStatus === 'current_evidence'), 'category + temporal filtering works');
  check(currentRecipients.every((e) => e.sourceObservationIds.length >= 1 && e.sourceDocumentIds.length >= 1), 'every retrieved entry retains its provenance (sourceObservationIds + sourceDocumentIds)');
  const q1 = queryWritingMemory(r, { category: 'recipient_convention' });
  const q2 = queryWritingMemory(r, { category: 'recipient_convention' });
  check(JSON.stringify(q1) === JSON.stringify(q2) && q1.map((e) => e.memoryId).join(',') === [...q1].sort((a, b) => (a.memoryId < b.memoryId ? -1 : 1)).map((e) => e.memoryId).join(','), 'retrieval is deterministic + sorted by memoryId');
  check(getPreferredTerminology(r).every((e) => ['terminology', 'organizational_term', 'preferred_phrase'].includes(e.category)), 'getPreferredTerminology filters to the terminology categories');
  check(getHistoricalOnly(r).every((e) => e.temporalStatus === 'historical_only') && getCurrentEvidence(r).every((e) => e.temporalStatus === 'current_evidence') && getAligned(r).every((e) => e.temporalStatus === 'aligned'), 'temporal-status helpers filter correctly');
}

section('unconfigured windows → everything insufficient / unknown (§15)');
{
  const r = build([doc('z1', '2022-01-01'), doc('z2', '2026-01-01')], [obs('corpus_z1', 'Z'), obs('corpus_z2', 'Z')], { temporal: {} });
  check(r.temporalConfigured === false && r.entries.every((e) => e.temporalStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE && e.conventionEra === TEMPORAL_CLASSIFICATION.UNKNOWN),
    'no configured windows → every entry insufficient_evidence / unknown (no chronology guessed)');
}

section('safety — source observations untouched; no approval anywhere (§3, §8)');
{
  const o = obs('corpus_s1', 'Dengan hormat,');
  const r = build([doc('s1', '2026-01-01'), doc('s2', '2026-02-01'), doc('s3', '2026-03-01')], [o, obs('corpus_s2', 'Dengan hormat,'), obs('corpus_s3', 'Dengan hormat,')]);
  check(o.lifecycleState === 'observed' && Object.isFrozen(o), 'the source observation is UNTOUCHED (a view, not a mutation — §3)');
  const asJson = JSON.stringify(r);
  check(!/"authorityState":"approved"/.test(asJson) && !/"approvedBy"/.test(asJson) && !/"approvedAt"/.test(asJson) && !/"preferenceRationale"/.test(asJson),
    'the whole report contains NO approved authorityState / approvedBy / approvedAt / preferenceRationale (§8)');
  check(r.summary.approved === 0 && r.summary.candidate + r.summary.observed === r.summary.total, 'the summary confirms 0 approved entries');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
