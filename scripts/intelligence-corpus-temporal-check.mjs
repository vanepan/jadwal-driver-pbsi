/* ============================================================
   intelligence-corpus-temporal-check.mjs — Historical vs Current
   Convention (V2, Phase 5.x.3)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the temporal interpretation layer over corpus observations.

   Fixtures (Phase 5.x.3 §21):
     A  historical only            → historical_only
     B  current evidence           → current_evidence
     C  historical → current       → A = historical_only, B = current_evidence
     D  conflict                   → conflicting / insufficient (BOTH thresholds tested)
     E  unknown date               → unknown / insufficient_evidence
     F  filename trap              → sourceDate wins, classified by the DOCUMENT date
     G  upload-date trap           → an old doc uploaded today does NOT become current
     H  approved-rule conflict     → possible_drift; the approved rule is UNCHANGED

   Plus: document era vs convention applicability are DISTINCT (§5);
   `unknown`/`insufficient` are first-class (§15); determinism (§13);
   no lifecycle move / no approval created (§16); links preserved (§12).

   Run:  node scripts/intelligence-corpus-temporal-check.mjs   (exit 0 = pass)
   ============================================================ */

import { makeCorpusObservation, OBSERVATION_CATEGORY } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import { makeCorpusDocument, CORPUS_DOCUMENT_ERA } from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import {
  TEMPORAL_CLASSIFICATION, CONVENTION_STATUS, TEMPORAL_EVIDENCE_FIELDS,
  isConventionTemporalReport, isConventionTemporalEntry, isDriftFinding,
} from '../src/intelligence/corpus/temporal/contracts/temporal-contract.js';
import { resolveTemporalWindows, bucketSourceDate } from '../src/intelligence/corpus/temporal/temporal-windows.js';
import { analyzeConventionTemporal } from '../src/intelligence/corpus/temporal/convention-temporal-analyzer.js';
import { buildTemporalInput, sanitizeApprovedRules } from '../src/intelligence/corpus/temporal/temporal-input.js';
import { classifyDocumentEra } from '../src/intelligence/corpus/ingestion/classify/document-era-classifier.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-04T00:00:00.000Z';
let _n = 0;
const obs = (documentId, value, key = 'opening_salutation', category = OBSERVATION_CATEGORY.OPENING_PATTERN) => makeCorpusObservation({
  observationId: `obs_${documentId}__${category}__${key}__${++_n}`,
  documentId, category, key, observedValue: value, modality: 'text',
  provenance: [{ sourceDocumentId: documentId, sourceFileId: `file:${'0'.repeat(64)}`, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.8 }],
  confidence: 0.8, occurrenceCount: 1, lifecycleState: 'observed', createdAt: AT, updatedAt: AT,
});
const doc = (id, sourceDate, over = {}) => makeCorpusDocument({
  checksum: id.padEnd(64, '0'), documentId: `corpus_${id}`, ownerId: 'evan', sourceDate,
  createdAt: over.createdAt || AT, ...over,
});
const WIN = { temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2, minHistoricalDocuments: 1, conflictMinorityRatio: 0.34 } };
const analyze = (documents, observations, cfg = WIN, approvedRules = []) =>
  analyzeConventionTemporal({ documents, observations, approvedRules }, cfg, { at: AT });
const conv = (r, value) => r.conventions.find((c) => c.observedValue === value);

/* ════════════════════════════════════════════════════════════════════════ */

section('temporal windows — configured vs unconfigured (§6, §14, §15)');
{
  const unconfigured = resolveTemporalWindows({ temporal: {} });
  check(unconfigured.configured === false && unconfigured.source === 'unconfigured', 'no boundary dates → windows are UNCONFIGURED');
  check(bucketSourceDate('2022-01-01', unconfigured) === TEMPORAL_CLASSIFICATION.UNKNOWN, 'every date buckets `unknown` when unconfigured (nothing guessed)');
  const configured = resolveTemporalWindows(WIN);
  check(configured.configured && bucketSourceDate('2022-06-01', configured) === TEMPORAL_CLASSIFICATION.HISTORICAL
    && bucketSourceDate('2026-06-01', configured) === TEMPORAL_CLASSIFICATION.CURRENT
    && bucketSourceDate('2025-06-01', configured) === TEMPORAL_CLASSIFICATION.TRANSITIONAL, 'configured windows bucket historical / transitional / current by the DOCUMENT date');
  check(bucketSourceDate(null, configured) === TEMPORAL_CLASSIFICATION.UNKNOWN, 'a null sourceDate always buckets `unknown` (§14)');
  const fromCutover = resolveTemporalWindows({ eraCutoverDate: '2025-07-01', transitionalWindowDays: 90, temporal: {} });
  check(fromCutover.configured && fromCutover.source === 'era_cutover_fallback', 'a lone @1 eraCutoverDate is a valid fallback source for the windows');
}

section('A — historical only → historical_only (§21.A)');
{
  const r = analyze(
    [doc('a1', '2022-05-01'), doc('a2', '2023-06-01')],
    [obs('corpus_a1', 'Dengan hormat,'), obs('corpus_a2', 'Dengan hormat,')],
  );
  check(isConventionTemporalReport(r) && r.temporalConfigured, 'report is valid + temporalConfigured');
  const c = conv(r, 'Dengan hormat,');
  check(c && c.conventionStatus === CONVENTION_STATUS.HISTORICAL_ONLY, 'status = historical_only');
  check(c.conventionEra === TEMPORAL_CLASSIFICATION.HISTORICAL, 'conventionEra = historical (where the EVIDENCE sits)');
  check(c.evidence.historicalDocumentCount === 2 && c.evidence.currentDocumentCount === 0, 'evidence: 2 historical, 0 current documents');
  check(/historical/i.test(c.basis) && /NOT currently required|not currently/i.test(c.basis), 'basis says "observed historically, NOT currently required" (§1)');
}

section('B — current evidence → current_evidence (§21.B)');
{
  const r = analyze(
    [doc('b1', '2026-02-01'), doc('b2', '2026-03-01'), doc('b3', '2026-04-01')],
    [obs('corpus_b1', 'Dengan hormat,'), obs('corpus_b2', 'Dengan hormat,'), obs('corpus_b3', 'Dengan hormat,')],
  );
  const c = conv(r, 'Dengan hormat,');
  check(c.conventionStatus === CONVENTION_STATUS.CURRENT_EVIDENCE && c.conventionEra === TEMPORAL_CLASSIFICATION.CURRENT, 'status = current_evidence, era = current');
  check(c.evidence.currentDocumentCount === 3 && c.evidence.recentDocumentCount === 3, 'evidence: 3 distinct current-window documents');
  check(/evidence, not an approved rule|not an approved/i.test(c.basis), 'basis is explicit that this is still evidence, not an approved rule (§17)');
  // frequency alone is not enough — 3 current docs but minCurrentDocuments raised to 5
  const r2 = analyze(
    [doc('b1', '2026-02-01'), doc('b2', '2026-03-01'), doc('b3', '2026-04-01')],
    [obs('corpus_b1', 'Dengan hormat,'), obs('corpus_b2', 'Dengan hormat,'), obs('corpus_b3', 'Dengan hormat,')],
    { temporal: { ...WIN.temporal, minCurrentDocuments: 5 } },
  );
  check(conv(r2, 'Dengan hormat,').conventionStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE, 'below the configured minCurrentDocuments floor → insufficient_evidence (frequency alone is not enough — §9)');
}

section('C — historical → current replacement (§21.C)');
{
  const r = analyze(
    [doc('c1', '2022-01-01'), doc('c2', '2023-01-01'), doc('c3', '2026-06-01')],
    [obs('corpus_c1', 'A opening'), obs('corpus_c2', 'A opening'), obs('corpus_c3', 'B opening')],
    { temporal: { ...WIN.temporal, minCurrentDocuments: 1 } },
  );
  check(conv(r, 'A opening').conventionStatus === CONVENTION_STATUS.HISTORICAL_ONLY, 'A → historical_only');
  check(conv(r, 'B opening').conventionStatus === CONVENTION_STATUS.CURRENT_EVIDENCE, 'B → current_evidence');
  check(conv(r, 'A opening').conventionEra === TEMPORAL_CLASSIFICATION.HISTORICAL && conv(r, 'B opening').conventionEra === TEMPORAL_CLASSIFICATION.CURRENT, 'eras: A historical, B current');
  check(/replacement/i.test(conv(r, 'A opening').basis), "A's basis notes a possible replacement — for a human to confirm (§8, §11)");
  check(r.conventions.length === 2, 'BOTH conventions are kept — the old one is NOT deleted or merged away (§8)');
}

section('D — conflict: threshold decides conflicting vs insufficient (§21.D)');
{
  const docs = [doc('d1', '2025-06-01'), doc('d2', '2026-02-01'), doc('d3', '2026-03-01')];
  const obss = [obs('corpus_d1', 'A opening'), obs('corpus_d2', 'A opening'), obs('corpus_d3', 'B opening')];
  const rLow = analyze(docs, obss, { temporal: { ...WIN.temporal, minCurrentDocuments: 1 } });
  check(conv(rLow, 'A opening').conventionStatus === CONVENTION_STATUS.CONFLICTING && conv(rLow, 'B opening').conventionStatus === CONVENTION_STATUS.CONFLICTING,
    'minCurrentDocuments=1: recent window has both A and B → BOTH conflicting');
  check(rLow.conflicts.length === 1 && rLow.conflicts[0].sides.length === 2 && rLow.conflicts[0].sides.map((s) => s.observedValue).sort().join('|') === 'A opening|B opening',
    'a ConventionConflict entry keeps BOTH sides in full (§8)');
  const rHigh = analyze(docs, obss, { temporal: { ...WIN.temporal, minCurrentDocuments: 3 } });
  check(conv(rHigh, 'A opening').conventionStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE && conv(rHigh, 'B opening').conventionStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    'minCurrentDocuments=3: too little recent evidence → BOTH insufficient_evidence (not arbitrarily picked — §21.D)');
  check(!conv(rHigh, 'A opening').basis.includes('best') && !conv(rHigh, 'B opening').basis.includes('best'), 'no "best phrase" is chosen (§8)');
}

section('E — unknown date → unknown / insufficient_evidence (§21.E, §15)');
{
  const r = analyze([doc('e1', null), doc('e2', null)], [obs('corpus_e1', 'Dengan hormat,'), obs('corpus_e2', 'Dengan hormat,')]);
  const c = conv(r, 'Dengan hormat,');
  check(c.conventionEra === TEMPORAL_CLASSIFICATION.UNKNOWN && c.conventionStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE, 'no sourceDate on any document → unknown era, insufficient_evidence status');
  check(c.evidence.datedDocumentCount === 0 && c.evidence.undatedDocumentCount === 2 && c.evidence.documentCount === 2, 'evidence counts undated documents honestly, never buckets them (§14)');
}

section('F — filename trap: sourceDate wins (§21.F)');
{
  // the document object's own sourceDate is 2022; a filename saying "NOR_2026" is NOT part of the temporal input
  const r = analyze(
    [doc('f1', '2022-03-01', { originalFilename: 'NOR_2026_Sarpras_final.docx' }), doc('f2', '2022-09-01', { originalFilename: 'NOR_2026_v2.docx' })],
    [obs('corpus_f1', 'Dengan hormat,'), obs('corpus_f2', 'Dengan hormat,')],
  );
  const c = conv(r, 'Dengan hormat,');
  check(c.conventionEra === TEMPORAL_CLASSIFICATION.HISTORICAL && c.conventionStatus === CONVENTION_STATUS.HISTORICAL_ONLY, 'classified by the DOCUMENT sourceDate (2022) — the "2026" filename is ignored');
  check(c.evidence.oldestSourceDate === '2022-03-01' && c.evidence.latestSourceDate === '2022-09-01', 'evidence dates come from sourceDate, not the filename');
}

section('G — upload-date trap: an old doc uploaded today does NOT become current (§21.G)');
{
  // sourceDate is old (2022); createdAt (ingestion) is "today"
  const r = analyze(
    [doc('g1', '2022-05-01', { createdAt: AT }), doc('g2', '2022-08-01', { createdAt: AT })],
    [obs('corpus_g1', 'Dengan hormat,'), obs('corpus_g2', 'Dengan hormat,')],
  );
  const c = conv(r, 'Dengan hormat,');
  check(c.conventionEra === TEMPORAL_CLASSIFICATION.HISTORICAL && c.conventionStatus === CONVENTION_STATUS.HISTORICAL_ONLY,
    'the ingestion/createdAt date (today) is NEVER used — a 2022 document stays historical');
  check(c.evidence.currentDocumentCount === 0, 'zero current-window documents despite being uploaded today');
}

section('H — approved-rule conflict → possible_drift; the rule is UNCHANGED (§21.H, §10, §11)');
{
  const approvedRule = { category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'opening_salutation', value: 'A opening', ruleId: 'rule_1',
    // hostile extra fields — must be dropped
    approvedBy: 'someHuman', approvedAt: '2020-01-01', authority: 'CURRENT_POLICY', currentness: 'current' };
  const r = analyze(
    [doc('h1', '2022-01-01'), doc('h2', '2026-02-01'), doc('h3', '2026-03-01'), doc('h4', '2026-04-01')],
    [obs('corpus_h1', 'A opening'), obs('corpus_h2', 'B opening'), obs('corpus_h3', 'B opening'), obs('corpus_h4', 'B opening')],
    { temporal: { ...WIN.temporal, minCurrentDocuments: 2 } },
    [approvedRule],
  );
  check(r.drift.length === 1 && isDriftFinding(r.drift[0]), 'one DriftFinding is produced');
  const d = r.drift[0];
  check(d.status === CONVENTION_STATUS.POSSIBLE_DRIFT, 'status = possible_drift (recent corpus favours a different value)');
  check(d.ruleUnchanged === true, 'ruleUnchanged === true — the approved rule is NOT modified (§10, §11)');
  check(d.approvedRule.value === 'A opening' && d.approvedRule.ruleId === 'rule_1'
    && !('approvedBy' in d.approvedRule) && !('authority' in d.approvedRule) && !('currentness' in d.approvedRule),
    'the approved rule is echoed with ONLY {category,key,value,ruleId} — approvedBy / authority / currentness were dropped (§19)');
  check(d.competingEvidence.length >= 1 && d.competingEvidence[0].observedValue === 'B opening', 'the competing recent evidence (B) is exposed');
  check(conv(r, 'A opening').conventionStatus === CONVENTION_STATUS.POSSIBLE_DRIFT, 'the convention entry for the approved value also reads possible_drift');
  // when the approved value DOES have current evidence and nothing competes → aligned
  const r2 = analyze(
    [doc('h1', '2026-01-05'), doc('h2', '2026-02-05'), doc('h3', '2026-03-05')],
    [obs('corpus_h1', 'A opening'), obs('corpus_h2', 'A opening'), obs('corpus_h3', 'A opening')],
    { temporal: { ...WIN.temporal, minCurrentDocuments: 2 } },
    [{ category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'opening_salutation', value: 'A opening' }],
  );
  check(r2.drift[0].status === CONVENTION_STATUS.ALIGNED && conv(r2, 'A opening').conventionStatus === CONVENTION_STATUS.ALIGNED, 'approved value + current evidence + no competitor → aligned');
}

section('document era ≠ convention applicability (§5)');
{
  // a 2022 document is historical; a phrase in it can ALSO appear in 2026 docs.
  const docs = [doc('x1', '2022-01-01'), doc('x2', '2026-02-01'), doc('x3', '2026-03-01')];
  const obss = [obs('corpus_x1', 'Dengan hormat,'), obs('corpus_x2', 'Dengan hormat,'), obs('corpus_x3', 'Dengan hormat,')];
  const r = analyze(docs, obss);
  const c = conv(r, 'Dengan hormat,');
  check(classifyDocumentEra({ sourceDate: '2022-01-01', text: 'x' }, { eraCutoverDate: '2026-01-01' }).documentEra === CORPUS_DOCUMENT_ERA.HISTORICAL,
    'the 2022 DOCUMENT is historical (Phase 5.x.2 document-era classifier)');
  check(c.conventionStatus === CONVENTION_STATUS.CURRENT_EVIDENCE,
    '…but the CONVENTION has current_evidence (it also appears in 2026 documents) — the two questions are answered separately (§5)');
  check(c.evidence.historicalDocumentCount === 1 && c.evidence.currentDocumentCount === 2, 'the evidence bag shows BOTH the historical and the current support — nothing hidden (§7)');
}

section('unconfigured windows → everything unknown / insufficient (§6, §15)');
{
  const r = analyze([doc('u1', '2022-01-01'), doc('u2', '2026-01-01')], [obs('corpus_u1', 'X'), obs('corpus_u2', 'X')], { temporal: {} });
  check(r.temporalConfigured === false, 'temporalConfigured === false');
  check(r.conventions.every((c) => c.conventionEra === TEMPORAL_CLASSIFICATION.UNKNOWN && c.conventionStatus === CONVENTION_STATUS.INSUFFICIENT_EVIDENCE),
    'every convention is unknown / insufficient_evidence — no chronology is guessed even though sourceDates exist');
  check(r.drift.length === 0 && r.conflicts.length === 0, 'no drift / conflict findings without configured windows');
}

section('determinism — same corpus + same config ⇒ identical report (§13)');
{
  const docs = [doc('z1', '2022-01-01'), doc('z2', '2026-02-01'), doc('z3', '2026-03-01'), doc('z4', '2024-06-01')];
  const obss = [obs('corpus_z1', 'A opening'), obs('corpus_z2', 'A opening'), obs('corpus_z3', 'B opening'), obs('corpus_z4', 'A opening')];
  const a = analyze(docs, obss);
  const b = analyze([...docs].reverse(), [...obss].reverse());
  check(JSON.stringify(a.conventions) === JSON.stringify(b.conventions) && JSON.stringify(a.conflicts) === JSON.stringify(b.conflicts),
    'reversing the input order yields a byte-identical report (deterministic ordering by groupKey)');
  const c = analyze(docs, obss);
  check(JSON.stringify(a) === JSON.stringify(c), 'two runs with pinned `at` produce an identical report');
}

section('safety — no lifecycle move, no approval, links preserved (§3, §12, §16)');
{
  const o1 = obs('corpus_s1', 'Dengan hormat,');
  const r = analyze([doc('s1', '2022-01-01'), doc('s2', '2023-01-01')], [o1, obs('corpus_s2', 'Dengan hormat,')]);
  const c = conv(r, 'Dengan hormat,');
  check(TEMPORAL_EVIDENCE_FIELDS.every((f) => f in c.evidence), 'every temporal-evidence component is present (transparent, not a black-box score — §13)');
  check(c.observationIds.includes(o1.observationId) && c.documentIds.includes('corpus_s1'), 'the entry links back to the source observationIds + documentIds (§12)');
  check(o1.lifecycleState === 'observed', 'the source observation is UNTOUCHED — still lifecycleState "observed" (analysis is a view, not a mutation — §3, §16)');
  const asJson = JSON.stringify(r);
  check(!/"approvedBy"/.test(asJson) && !/"approvedAt"/.test(asJson) && !/"preferenceRationale"/.test(asJson), 'the report contains NO approvedBy / approvedAt / preferenceRationale — nothing was approved (§16)');
  check(isConventionTemporalEntry(c), 'the entry satisfies its contract');
}

section('helpers — buildTemporalInput + sanitizeApprovedRules');
{
  const input = buildTemporalInput({ documents: [doc('p1', '2022-01-01'), doc('p1', '2022-01-01')], observationsByDocument: { corpus_p1: [obs('corpus_p1', 'X')] } });
  check(input.documents.length === 1 && input.observations.length === 1, 'buildTemporalInput de-dups documents + observations');
  const rules = sanitizeApprovedRules([{ category: 'a', key: 'b', value: 'c', ruleId: 'r', approvedBy: 'x', authority: 'y' }, { junk: true }]);
  check(rules.length === 1 && Object.keys(rules[0]).sort().join(',') === 'category,key,ruleId,value', 'sanitizeApprovedRules keeps ONLY {category,key,value,ruleId}');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
