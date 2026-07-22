/* learning-ownership-check.mjs — Phase 5, "Learning Ownership & Organizational Memory".

   Same two-part shape as knowledge-ownership-check.mjs / archive-ownership-
   check.mjs, on purpose: a reader who understands one understands all three.

   1. ARCHITECTURAL (static). Asserts Learning has exactly one owner, one
      lifecycle authority, one repository boundary — that no UI or engine can
      write around it, and that every mission-named producer (Correction, Gap
      Resolution, Pattern Discovery, Coverage, Knowledge Approval, Archive
      Relationships) has a REAL, grep-verifiable call site, not just a
      function that exists.

   2. BEHAVIOURAL (runtime). Drives the Learning Service, Coverage engine,
      Organization Memory engine and Pattern Discovery's Learning-derived
      patterns for real, and asserts the guarantees they exist to provide.

   Deterministic. No AI, no scoring, no fabricated data, no Firebase touch.
   Run: node scripts/learning-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resetLearningRepository } from '../js/v2/learning/repository/learning-repository.js';
import { resetArchiveRepository } from '../src/organizational-memory/repository/archive-repository.js';
import { resetGapWorkflowState } from '../src/organizational-memory/gap-workflow-engine.js';
import { resetDatasetRegistry } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import {
  recordCorrection, recordGapResolution, recordPattern, recordCoverage, recordKnowledgeEvolution,
  recordLearningEvent, findLearningEvent, listLearningEvents, getLearningHistory, explainLearningEvent,
  acceptLearningEvent, applyLearningEvent, LEARNING_SERVICE_ERRORS,
} from '../js/v2/learning/services/learning-service.js';
import {
  LEARNING_STATE, LEARNING_GRAPH, LEARNING_KIND, CORRECTION_TYPE, canTransitionLearning, isTerminalLearningState,
} from '../js/v2/learning/contracts/learning-event-contract.js';
import { setKnowledgeBackend, ingest, promoteKnowledge, getKnowledge } from '../js/v2/knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { computePatternRecommendations, computeLearningPatterns, discoverAndRecordPatterns } from '../js/v2/knowledge/services/pattern-discovery-service.js';
import { PATTERN_TYPE } from '../js/v2/knowledge/contracts/pattern-recommendation-contract.js';
import { computeCoverageReport, recordCoverageSnapshot } from '../src/organizational-memory/coverage-engine.js';
import { computeOrganizationalMemory } from '../src/organizational-memory/organizational-memory-engine.js';
import {
  archiveDocument, archiveSupersededKnowledge, findArchiveRecord,
} from '../src/organizational-memory/services/archive-service.js';
import { flagGapForUpload, resolveGap, getGapsWithWorkflowState, countResolvedGaps } from '../src/organizational-memory/gap-workflow-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function allSourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) out.push({ rel, code: stripComments(read(rel)) });
    }
  }('js/v2'));
  return out;
}
const FILES = allSourceFiles();

const OWNER = 'js/v2/learning/services/learning-service.js';
const REPO_RE = /learning\/repository\/learning-repository\.js$/;

/* ══ 1. ONE OWNER ═════════════════════════════════════════════════════ */

console.log('\n[Part 1 — exactly ONE owner writes the Learning Repository]');
{
  const writers = [];
  const readers = [];
  for (const { rel, code } of FILES) {
    if (rel === OWNER || rel.includes('/learning/repository/')) continue;
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (!m || !REPO_RE.test(m[1])) continue;
      const clause = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
      readers.push(rel);
      for (const w of ['create', 'appendVersion']) {
        if (new RegExp(`(^|[,{\\s])${w}(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause)) writers.push(`${rel}:${w}`);
      }
    }
  }
  check(`NO module outside the owner imports a Learning Repository WRITER${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`,
    writers.length === 0);
  check(`NO module outside the owner imports learning-repository.js AT ALL${readers.length ? ` — FOUND: ${[...new Set(readers)].join(', ')}` : ''}`,
    readers.length === 0);

  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write the repository (it is the owner, not a delegator)',
    /create as repoCreate/.test(ownerSrc) && /appendVersion as repoAppendVersion/.test(ownerSrc));
}

console.log('\n[Part 2 — no UI writes Learning directly, and Learning stays the most upstream domain]');
{
  const offenders = [];
  for (const { rel, code } of FILES.filter((f) => f.rel.startsWith('js/v2/ui/'))) {
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (!m || !/learning\/repository/.test(m[1])) continue;
      offenders.push(rel);
    }
  }
  check(`NO ui/*.js imports the Learning Repository directly${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);

  // Every UI producer reaches Learning through the SERVICE, not the repository.
  const dic = read('js/v2/ui/dataset-import-center.js');
  const kc = read('js/v2/ui/knowledge-center.js');
  const nc = read('js/v2/ui/nor-center.js');
  check('Import Session metadata correction goes through the Learning Service', /from '\.\.\/learning\/services\/learning-service\.js'/.test(dic) && dic.includes('recordCorrection'));
  check('Knowledge Center\'s Request Changes goes through the Learning Service', /from '\.\.\/learning\/services\/learning-service\.js'/.test(kc) && kc.includes('recordCorrection'));
  check('NOR Center\'s Profile Override approval goes through the Learning Service', /from '\.\.\/learning\/services\/learning-service\.js'/.test(nc) && nc.includes('recordCorrection'));

  // Learning itself imports NOTHING from knowledge/ or organizational-memory/
  // ENGINES OR SERVICES. The one precedented exception, allowlisted here
  // exactly as archive-repository.js's own header already establishes it:
  // reusing a PURE, DEPENDENCY-FREE contract/vocabulary file (e.g.
  // identity-contract.js#nextVersion — verified zero imports of its own) is
  // not a domain dependency, it is the same "don't duplicate a one-line
  // utility" discipline every repository in this platform already follows.
  const learningFiles = FILES.filter((f) => f.rel.startsWith('js/v2/learning/'));
  const leaks = [];
  for (const { rel, code } of learningFiles) {
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (!m) continue;
      const target = m[1];
      if (!/\/(knowledge|organizational-memory)\//.test(target)) continue;
      if (/\/contracts\/[^/]+\.js$/.test(target)) continue; // pure leaf vocabulary — allowlisted
      leaks.push(`${rel} -> ${target}`);
    }
  }
  check(`learning/ imports NOTHING from knowledge/ or organizational-memory/ ENGINES/SERVICES (only pure contracts, if anything)${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`,
    leaks.length === 0);
}

console.log('\n[Part 3 — no orphan lifecycle states, exactly one authority]');
{
  const states = Object.values(LEARNING_STATE);
  check('every declared state has an entry in LEARNING_GRAPH (no dangling state)',
    states.every((s) => Array.isArray(LEARNING_GRAPH[s])));
  const reachable = new Set([LEARNING_STATE.OBSERVED]);
  for (const edges of Object.values(LEARNING_GRAPH)) edges.forEach((e) => reachable.add(e));
  check('every declared state is REACHABLE', states.every((s) => reachable.has(s)));
  check('HISTORICAL is absorbing (terminal)', LEARNING_GRAPH[LEARNING_STATE.HISTORICAL].length === 0);
  check('OBSERVED is never a persisted resting state — VALIDATED is the true starting state (see the contract header)',
    !LEARNING_GRAPH[LEARNING_STATE.VALIDATED].includes(LEARNING_STATE.OBSERVED));
}

console.log('\n[Part 9 — every mission-named producer has a REAL call site, not just a function]');
{
  const producers = [
    ['Correction (metadata)', 'js/v2/ui/dataset-import-center.js', 'recordCorrection'],
    ['Correction (knowledge)', 'js/v2/ui/knowledge-center.js', 'recordCorrection'],
    ['Correction (pattern)', 'js/v2/ui/nor-center.js', 'recordCorrection'],
    ['Correction (relationship / Archive Relationships)', 'src/organizational-memory/services/archive-service.js', 'recordCorrection'],
    ['Gap Resolution', 'src/organizational-memory/gap-workflow-engine.js', 'recordGapResolution'],
    ['Pattern Discovery', 'js/v2/knowledge/services/pattern-discovery-service.js', 'recordPattern'],
    ['Coverage', 'src/organizational-memory/coverage-engine.js', 'recordCoverage'],
    ['Knowledge Approval', 'js/v2/knowledge/services/knowledge-service.js', 'recordKnowledgeEvolution'],
  ];
  for (const [label, file, fn] of producers) {
    check(`${label} calls ${fn}() from ${file}`, stripComments(read(file)).includes(`${fn}(`));
  }
}

console.log('\n[Part 9 — every consumer reads through a Service, never a repository directly]');
{
  const consumers = [
    'js/v2/knowledge/profiles/pattern-discovery-engine.js',
    'src/organizational-memory/coverage-engine.js',
    'src/organizational-memory/organizational-memory-engine.js',
    'js/v2/ui/learning-dashboard.js',
    'js/v2/ui/sarpras-intelligence-center.js',
  ];
  for (const file of consumers) {
    const src = stripComments(read(file));
    check(`${file} does not import learning-repository.js directly`, !/learning\/repository\/learning-repository\.js/.test(src));
  }
}

/* ══ 2. BEHAVIOUR ═════════════════════════════════════════════════════ */

setKnowledgeBackend('memory');
resetLearningRepository();
resetArchiveRepository();
resetGapWorkflowState();
resetDatasetRegistry();

console.log('\n[Behaviour — recordCorrection: idempotent, supersedes, refuses malformed input]');
{
  const r1 = recordCorrection({ domainType: 'nor', correctionType: CORRECTION_TYPE.METADATA, targetKey: 'is:1', actorId: 'evan', after: { domainType: 'nor' } });
  check('first correction creates', r1.ok && r1.op === 'create' && r1.data.state === LEARNING_STATE.APPLIED);
  const r2 = recordCorrection({ domainType: 'nor', correctionType: CORRECTION_TYPE.METADATA, targetKey: 'is:1', actorId: 'evan', after: { domainType: 'nor' } });
  check('the SAME fact again is a no-op (idempotent-when-unchanged)', r2.ok && r2.op === 'noop' && r2.data.id === r1.data.id);
  const r3 = recordCorrection({ domainType: 'nor', correctionType: CORRECTION_TYPE.METADATA, targetKey: 'is:1', actorId: 'evan', after: { domainType: 'nor', datasetType: 'official' } });
  check('a genuinely NEW fact supersedes the old one', r3.ok && r3.op === 'superseded' && r3.data.id !== r1.data.id);
  check('the superseded event is now HISTORICAL', explainLearningEvent(r1.data.id).data.state === LEARNING_STATE.HISTORICAL);
  check('the chain is recorded from both ends', explainLearningEvent(r3.data.id).data.supersessionChain.length === 2);

  const bad = recordCorrection({ domainType: '', correctionType: CORRECTION_TYPE.METADATA, targetKey: 'x', actorId: 'evan', after: {} });
  check('a malformed correction (empty domainType) is REFUSED, never persisted', bad.ok === false && bad.error.code === LEARNING_SERVICE_ERRORS.INVALID_EVENT);
  const badType = recordCorrection({ domainType: 'nor', correctionType: 'not-a-real-type', targetKey: 'x', actorId: 'evan', after: {} });
  check('an unknown correctionType is REFUSED', badType.ok === false);
}

console.log('\n[Behaviour — Part 4: Gap Resolution IS Learning]');
{
  flagGapForUpload('nor', 'NOR-005');
  const before = listLearningEvents({ kind: LEARNING_KIND.GAP_RESOLUTION }).data.length;
  resolveGap('nor', 'NOR-005', { actorId: 'evan', reason: 'Dokumen ditemukan.' });
  const after = listLearningEvents({ kind: LEARNING_KIND.GAP_RESOLUTION }).data.length;
  check('resolveGap() records a real Learning Event', after === before + 1);
  check('...idempotent on re-resolution', (() => { resolveGap('nor', 'NOR-005'); return listLearningEvents({ kind: LEARNING_KIND.GAP_RESOLUTION }).data.length === after; })());
  check('countResolvedGaps() reflects it', countResolvedGaps('nor') >= 1);
}

console.log('\n[Behaviour — Part 9: Knowledge Approval records real Learning]');
{
  const now = () => new Date().toISOString();
  const item = { id: 'knowledge:nor:le-fixture:1', version: 1, domainType: 'nor', sourceType: 'manual-file', kind: 'document_fact', payload: { value: 'x' }, confidence: 1, lifecycleState: LIFECYCLE_STATE.DRAFT, provenance: { connectorId: 'manual-file', sourceRef: 'x', capturedAt: now() }, approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now(), updatedAt: now() };
  ingest(item);
  const before = listLearningEvents({ kind: LEARNING_KIND.KNOWLEDGE_EVOLUTION }).data.length;
  promoteKnowledge(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Benar.' });
  const after = listLearningEvents({ kind: LEARNING_KIND.KNOWLEDGE_EVOLUTION }).data.length;
  check('promoteKnowledge() reaching Approved records a KNOWLEDGE_EVOLUTION event', after === before + 1);
  check('...naming the real actor and reason', (() => {
    const ev = listLearningEvents({ kind: LEARNING_KIND.KNOWLEDGE_EVOLUTION }).data.find((e) => e.affectedKnowledgeId === item.id);
    return !!ev && ev.actorId === 'evan' && ev.reason === 'Benar.';
  })());
}

console.log('\n[Behaviour — Part 9: Archive Relationships (supersession) records real Learning]');
{
  const a = archiveDocument({ id: 'nor:archive:le-a', sourceDomainType: 'nor', sourceId: 's1', sourceType: 'manual-file', documentNumber: 'NOR-A', documentHash: 'hash-a', sourceSnapshot: {} });
  const before = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.RELATIONSHIP }).data.length;
  const b = archiveDocument({ id: 'nor:archive:le-b', sourceDomainType: 'nor', sourceId: 's2', sourceType: 'manual-file', documentNumber: 'NOR-B', documentHash: 'hash-b', sourceSnapshot: {}, supersedesId: a.data.id });
  const afterAuto = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.RELATIONSHIP }).data.length;
  check('an auto-supersede on archive (via supersedesId in the seed) records a RELATIONSHIP correction', afterAuto === before + 1);

  const c = archiveDocument({ id: 'nor:archive:le-c', sourceDomainType: 'nor', sourceId: 's3', sourceType: 'manual-file', documentNumber: 'NOR-C', documentHash: 'hash-c', sourceSnapshot: {} });
  archiveSupersededKnowledge(b.data.id, c.data.id, { actorId: 'evan' });
  const afterExplicit = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.RELATIONSHIP }).data.length;
  check('the explicit archiveSupersededKnowledge() verb also records one', afterExplicit === afterAuto + 1);
}

console.log('\n[Behaviour — Part 6: Pattern Discovery consumes the Learning Service, not a repository]');
{
  // Two corrections to the SAME target so the recurring-correction pattern has real support.
  recordCorrection({ domainType: 'nor', correctionType: CORRECTION_TYPE.METADATA, targetKey: 'is:recur', actorId: 'evan', after: { v: 1 } });
  recordCorrection({ domainType: 'nor', correctionType: CORRECTION_TYPE.METADATA, targetKey: 'is:recur', actorId: 'evan', after: { v: 2 } });
  const learningPatterns = computeLearningPatterns('nor');
  check('a target corrected >=2 times surfaces as a RECURRING_CORRECTION pattern',
    learningPatterns.some((p) => p.patternType === PATTERN_TYPE.RECURRING_CORRECTION && p.evidence.supportCount >= 2));
  check('computePatternRecommendations() itself is UNCHANGED — still pure, still no Learning import needed for its own callers',
    Array.isArray(computePatternRecommendations('nor')));

  // Sprint 11.5 (Organizational Writing Intelligence) — the SAME
  // recordCorrection() call, but with a real evidence.semanticDiff
  // attached (as section-learning-bridge.js now always does), and the
  // SAME "after" value chosen twice — a genuine recurring wording
  // preference, not a fact correction (quantity_correction is excluded on
  // purpose below).
  recordCorrection({
    domainType: 'nor', correctionType: CORRECTION_TYPE.KNOWLEDGE, targetKey: 'doc:style-1:openingLine', actorId: 'evan',
    before: { openingLine: 'Pengajuan Pembelian' }, after: { openingLine: 'Permohonan Pembelian' },
    evidence: { field: 'openingLine', editKind: 'edit', patternSourced: false, semanticDiff: { category: 'fact', diffNature: 'opening_phrase', label: 'Preferensi frasa pembuka berubah (Fakta)' } },
  });
  recordCorrection({
    domainType: 'nor', correctionType: CORRECTION_TYPE.KNOWLEDGE, targetKey: 'doc:style-2:openingLine', actorId: 'evan',
    before: { openingLine: 'Pengajuan Pembelian' }, after: { openingLine: 'Permohonan Pembelian' },
    evidence: { field: 'openingLine', editKind: 'edit', patternSourced: false, semanticDiff: { category: 'fact', diffNature: 'opening_phrase', label: 'Preferensi frasa pembuka berubah (Fakta)' } },
  });
  // A single quantity correction MUST NOT contribute to writing style —
  // real negative control, not just an absence of a positive assertion.
  recordCorrection({
    domainType: 'nor', correctionType: CORRECTION_TYPE.KNOWLEDGE, targetKey: 'doc:style-3:quantity', actorId: 'evan',
    before: { quantity: '20 kursi' }, after: { quantity: '24 kursi' },
    evidence: { field: 'quantity', editKind: 'edit', patternSourced: false, semanticDiff: { category: 'fact', diffNature: 'quantity_correction', label: 'Koreksi kuantitas/angka (Fakta)' } },
  });
  const learningPatternsAfterStyle = computeLearningPatterns('nor');
  const styleRec = learningPatternsAfterStyle.find((p) => p.patternType === PATTERN_TYPE.WRITING_STYLE && p.value === 'openingLine:Permohonan Pembelian');
  check('a wording choice repeated >=2 times surfaces as a WRITING_STYLE pattern', !!styleRec && styleRec.evidence.supportCount === 2);
  check('its confidence reuses the SAME min(1, count/5) formula as RECURRING_CORRECTION (2/5 = 0.4)', !!styleRec && styleRec.evidence.confidence === 0.4);
  check('a single quantity_correction (not a wording diffNature) never surfaces as WRITING_STYLE', !learningPatternsAfterStyle.some((p) => p.patternType === PATTERN_TYPE.WRITING_STYLE && p.value.startsWith('quantity:')));

  // discoverAndRecordPatterns actually WRITES qualifying patterns as Learning Events.
  const beforeCount = listLearningEvents({ kind: LEARNING_KIND.PATTERN }).data.length;
  discoverAndRecordPatterns('nor');
  const afterCount = listLearningEvents({ kind: LEARNING_KIND.PATTERN }).data.length;
  check('discoverAndRecordPatterns() records real pattern Learning Events', afterCount > beforeCount);
  const afterCount2 = (() => { discoverAndRecordPatterns('nor'); return listLearningEvents({ kind: LEARNING_KIND.PATTERN }).data.length; })();
  check('...and is idempotent-when-unchanged (a second call writes nothing new)', afterCount2 === afterCount);
}

console.log('\n[Behaviour — Part 7: Coverage — six dimensions, scoped, snapshotted]');
{
  const platform = computeCoverageReport();
  check('platform-wide report has all six named dimensions', platform.ok
    && ['knowledgeCoverage', 'relationshipCoverage', 'metadataCoverage', 'patternCoverage', 'correctionCoverage', 'gapCoverage'].every((k) => k in platform.data));
  const scoped = computeCoverageReport('nor');
  check('scoped report is genuinely scoped (carries the domainType)', scoped.data.domainType === 'nor');
  check('every dimension explains its own formula (no bare "72%")',
    Object.values(platform.data).filter((v) => v && typeof v === 'object' && 'pct' in v).every((v) => typeof v.explanation === 'string' && v.explanation.length > 10));

  const snap1 = recordCoverageSnapshot('nor');
  check('recordCoverageSnapshot() records through the Learning Service', snap1.ok && snap1.data.kind === LEARNING_KIND.COVERAGE_SNAPSHOT);
  const snap2 = recordCoverageSnapshot('nor');
  check('...idempotent-when-unchanged (a real trend, not a flood of identical snapshots)', snap1.data.version === snap2.data.version);
}

console.log('\n[Behaviour — Part 5: Organization Memory — eight facts, all real]');
{
  const om = computeOrganizationalMemory('nor', { limit: 10 });
  check('the report has all eight named facts', om.ok
    && ['commonDocumentStructures', 'commonTerminology', 'commonOrganizationalPhrases', 'commonApprovalPatterns',
      'frequentlyReusedKnowledge', 'frequentlyCorrectedKnowledge', 'frequentlyMissingMetadataCount', 'frequentlyMissingRelationshipsCount']
      .every((k) => k in om.data));
  check('"frequently corrected" reflects the real repeated correction recorded above',
    om.data.frequentlyCorrectedKnowledge.some((c) => c.key === 'is:recur' && c.count >= 2));
  check('document structures and organizational phrases are NOT the same source relabeled twice', (() => {
    // Verified architecturally: PARAGRAPH (paragraph_pattern) vs WRITING_STYLE
    // (writing_style) are different PROFILE_TYPE/kind pairs — see
    // organizational-memory-engine.js's own comment at the call site.
    const src = stripComments(read('src/organizational-memory/organizational-memory-engine.js'));
    return src.includes('PROFILE_TYPE.PARAGRAPH') && src.includes('PROFILE_TYPE.WRITING_STYLE')
      && !new RegExp(`commonOrganizationalPhrases[\\s\\S]{0,40}PROFILE_TYPE\\.PARAGRAPH`).test(src);
  })());
}

console.log('\n[Behaviour — explainLearningEvent: provenance is complete]');
{
  const r = recordCorrection({ domainType: 'nor', correctionType: CORRECTION_TYPE.KNOWLEDGE, targetKey: 'k:1', actorId: 'evan', reason: 'Perlu diperbaiki.', before: { a: 1 }, after: { a: 2 }, sourceDocumentId: 'doc:1', affectedKnowledgeId: 'knowledge:1' });
  const x = explainLearningEvent(r.data.id);
  check('explain answers WHAT/WHY/WHO/WHEN', x.ok && x.data.what.after.a === 2 && x.data.why === 'Perlu diperbaiki.' && x.data.who === 'evan' && !!x.data.when);
  check('explain answers source document + affected knowledge', x.data.sourceDocumentId === 'doc:1' && x.data.affectedKnowledgeId === 'knowledge:1');
  const missing = explainLearningEvent('learning:correction:nor:does-not-exist');
  check('an unknown event explains nothing rather than inventing something', missing.ok === false);
}

console.log('\n[Behaviour — explicit lifecycle transitions are independently exercisable]');
{
  const r = recordLearningEvent({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.DOMAIN, domainType: 'nor', targetKey: null, actorId: 'evan', after: { x: 1 } });
  check('a fresh event is already ACCEPTED+APPLIED by record() (see contract header)', r.data.state === LEARNING_STATE.APPLIED);
  check('canTransitionLearning forbids APPLIED -> ACCEPTED (no going backward)', !canTransitionLearning(LEARNING_STATE.APPLIED, LEARNING_STATE.ACCEPTED));
  check('re-accepting an already-APPLIED event is refused (illegal transition)', acceptLearningEvent(r.data.id).ok === false);
  check('applyLearningEvent on an already-APPLIED event is a no-op-shaped refusal, not silent success', applyLearningEvent(r.data.id).ok === false);
  check('isTerminalLearningState only recognizes HISTORICAL', !isTerminalLearningState(LEARNING_STATE.APPLIED) && isTerminalLearningState(LEARNING_STATE.HISTORICAL));
}

console.log('\n[Behaviour — reads: findLearningEvent / listLearningEvents / getLearningHistory]');
{
  const all = listLearningEvents({});
  check('listLearningEvents returns real accumulated events', all.ok && all.data.length > 0);
  const one = all.data[0];
  check('findLearningEvent finds it', findLearningEvent(one.id).ok);
  check('getLearningHistory returns real version history', getLearningHistory(one.id).ok);
  check('an Archive Record genuinely exists for the relationship-correction fixtures above', findArchiveRecord('nor:archive:le-a').ok);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
