/* knowledge-ownership-check.mjs — Phase 3, "Knowledge Ownership & Governance".

   TWO KINDS OF CHECK LIVE HERE, and both are necessary.

   1. ARCHITECTURAL (static). Reads the source and asserts the ownership rules
      hold — that Knowledge has exactly one owner, that no UI or engine writes
      it directly, that there is no second lifecycle authority, and that no
      subsystem has readers without writers. These are the rules that decay
      silently: nothing breaks when someone adds a sixth writer, so nothing
      tells you. Now something does.

   2. BEHAVIOURAL (runtime). Drives the Knowledge Service for real and asserts
      the guarantees it exists to provide — above all that no engine can call
      knowledge Approved, and that a human can.

   Deterministic, no AI, no fabricated data, no Firebase touch.
   Run: node scripts/knowledge-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setKnowledgeBackend, ingest, createDraft, updateDraft, mergeKnowledge,
  promoteKnowledge, requestChanges, rejectKnowledge, archiveKnowledge, restoreKnowledge,
  submitKnowledgeForReview, promoteToCandidate,
  getKnowledge, listKnowledge, explainKnowledge,
  KNOWLEDGE_SERVICE_ERRORS,
} from '../src/knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE, LIFECYCLE_GRAPH } from '../src/knowledge/contracts/lifecycle-contract.js';
import { DORMANT } from '../js/v2/dormant-subsystems.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every .js file under a given root, as {relPath, code} with comments stripped. */
function allSourceFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) out.push({ rel, code: stripComments(read(rel)) });
    }
  }(root));
  return out;
}
// organizational-memory/, document-intelligence/, conversation/, reasoning/,
// learning/, workspace/, and ui/ all moved to src/ during Phase 1 Repository
// Refoundation — scan both roots so this stays a real assertion instead of
// silently losing sight of every domain that has moved out of js/v2/.
const FILES = [...allSourceFiles('js/v2'), ...allSourceFiles('src')];

/** Which files import `names` from a module whose path matches `modRe`? */
function importersOf(modRe, names) {
  const hits = [];
  for (const { rel, code } of FILES) {
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (!m || !modRe.test(m[1])) continue;
      const clause = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
      for (const n of names) {
        // Match the IMPORTED name (left of `as`), not the local alias.
        const re = new RegExp(`(^|[,{\\s])${n}(\\s+as\\s+\\w+)?\\s*(,|$)`);
        if (re.test(clause)) hits.push({ rel, name: n });
      }
    }
  }
  return hits;
}

/* ══════════════════════════════════════════════════════════════════════
   1. ARCHITECTURE — Knowledge has exactly ONE owner
   ══════════════════════════════════════════════════════════════════════ */

const OWNER = 'src/knowledge/services/knowledge-service.js';
const MECHANISM = 'src/knowledge/lifecycle/lifecycle-engine.js';
const REPO_RE = /repository\/knowledge-repository\.js$/;
const WRITERS = ['create', 'appendVersion', 'rollback'];

console.log('\n[Part 1/3 — exactly ONE owner writes the Knowledge Repository]');
{
  const writers = importersOf(REPO_RE, WRITERS);
  const offenders = writers.filter((w) => w.rel !== OWNER && w.rel !== MECHANISM);
  check(
    `NO module outside the owner imports a repository WRITER${offenders.length ? ` — FOUND: ${offenders.map((o) => `${o.rel}:${o.name}`).join(', ')}` : ''}`,
    offenders.length === 0,
  );
  check('the owner itself DOES import them (it is the writer, not a delegator)',
    writers.some((w) => w.rel === OWNER && w.name === 'create')
    && writers.some((w) => w.rel === OWNER && w.name === 'appendVersion')
    && writers.some((w) => w.rel === OWNER && w.name === 'rollback'));
  check('the lifecycle engine is the owner\'s delegated transition mechanism (appendVersion only)',
    writers.some((w) => w.rel === MECHANISM && w.name === 'appendVersion')
    && !writers.some((w) => w.rel === MECHANISM && w.name === 'create'));

  // The audit found FIVE writers. Name each one, so a regression is legible.
  const FORMER_WRITERS = [
    'src/knowledge/acquisition/acquisition-engine.js',
    'src/knowledge/extraction/extraction-write-helper.js',
    'src/knowledge/datasets/import-session/knowledge-rehydration-engine.js',
    'src/knowledge/learning/correction-pipeline-engine.js',
    'src/knowledge/review/review-workflow-engine.js',
    'src/knowledge/promotion/promotion-engine.js',
  ];
  for (const f of FORMER_WRITERS) {
    check(`${f.replace('src/knowledge/', '')} is now a CLIENT, not a writer`,
      !writers.some((w) => w.rel === f));
  }
}

console.log('\n[Part 2 — exactly ONE lifecycle authority]');
{
  const transitioners = importersOf(/lifecycle\/lifecycle-engine\.js$/, ['requestTransition']);
  const offenders = transitioners.filter((t) => t.rel !== OWNER);
  check(
    `requestTransition has exactly ONE caller — the owner${offenders.length ? ` — LEAKED TO: ${offenders.map((o) => o.rel).join(', ')}` : ''}`,
    offenders.length === 0 && transitioners.length === 1,
  );
  // The audit's B1: the services barrel used to hand out `lifecycle.requestTransition`.
  const lifecycleService = stripComments(read('src/knowledge/services/lifecycle-service.js'));
  check('lifecycle-service.js (re-exported by the services barrel) no longer leaks requestTransition',
    !/\brequestTransition\b/.test(lifecycleService));
  check('...but still exposes validateTransition, a pure predicate that mutates nothing',
    /\bvalidateTransition\b/.test(lifecycleService));
}

console.log('\n[Part 3 — no UI imports a Knowledge mutator, and none reads the repository directly]');
{
  // Scoped to the KNOWLEDGE domain's modules on purpose. `create` is a common
  // verb: dataset-import-center.js legitimately imports `create as archiveCreate`
  // from organizational-memory/ — that is an ARCHIVE write, a real dual-owner
  // finding from the Phase 2.6 audit, but it belongs to the Archive domain and
  // is explicitly deferred (see the Phase 3 report's technical debt). Flagging
  // it here would be a false positive that trains people to ignore the check.
  const KNOWLEDGE_MODULE_RE = /knowledge-repository\.js$|knowledge-service\.js$|lifecycle-engine\.js$/;
  const MUTATORS = [...WRITERS, 'requestTransition'];
  const uiOffenders = [];
  for (const { rel, code } of FILES.filter((f) => f.rel.startsWith('src/ui/'))) {
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const from = b.match(/from\s*'([^']*)'/);
      if (!from || !KNOWLEDGE_MODULE_RE.test(from[1])) continue;
      const clause = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
      for (const m of MUTATORS) {
        if (new RegExp(`(^|[,{\\s])${m}(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause)) uiOffenders.push(`${rel}:${m}`);
      }
    }
  }
  check(`NO ui/*.js imports a Knowledge mutator${uiOffenders.length ? ` — FOUND: ${uiOffenders.join(', ')}` : ''}`, uiOffenders.length === 0);

  const repoImporters = [];
  for (const { rel, code } of FILES) {
    if (rel === OWNER || rel === MECHANISM || rel.includes('/repository/')) continue;
    if (/from\s*'[^']*repository\/knowledge-repository\.js'/.test(code)) repoImporters.push(rel);
  }
  check(`NO module outside the owner imports knowledge-repository.js AT ALL${repoImporters.length ? ` — FOUND: ${repoImporters.join(', ')}` : ''}`,
    repoImporters.length === 0);

  // The governance UI must exist — its ABSENCE was the Phase 2.6 finding.
  const kc = read('src/ui/knowledge-center.js');
  check('Knowledge Center wires the human governance actions (approve / request changes / reject / archive)',
    kc.includes('data-act="kc-gov-approve"') && kc.includes('data-act="kc-gov-changes"')
    && kc.includes('data-act="kc-gov-reject"') && kc.includes('data-act="kc-gov-archive"'));
  check('...and reaches them ONLY through the Knowledge Service',
    /from '[^']*\/knowledge\/services\/knowledge-service\.js'/.test(kc));
  check('Knowledge Center surfaces Drafts rather than hiding them (Part 5)',
    /renderLifecycleDistribution/.test(kc));
  check('Knowledge Center explains WHY each item exists (Part 6)',
    /renderProvenance/.test(kc) && kc.includes('explainKnowledge'));
}

console.log('\n[Part 4 — no orphan lifecycle states]');
{
  const states = Object.values(LIFECYCLE_STATE);
  const reachable = new Set([LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE]);
  for (const [, edges] of Object.entries(LIFECYCLE_GRAPH)) edges.forEach((e) => reachable.add(e));
  check('every declared lifecycle state is reachable in LIFECYCLE_GRAPH',
    states.every((s) => reachable.has(s)));
  check('every lifecycle state has an entry in the graph (no dangling state)',
    states.every((s) => Array.isArray(LIFECYCLE_GRAPH[s])));
}

console.log('\n[Part 8 — no subsystem has readers without writers]');
{
  // gap-workflow was DORMANT at the start of this phase. It has been ACTIVATED,
  // so it must NOT appear in the register — and must have real callers.
  const gapWriters = importersOf(/gap-workflow-engine\.js$|organizational-memory\/index\.js$/, ['flagGapForUpload', 'resolveGap']);
  check('gap-workflow is ACTIVATED — flagGapForUpload/resolveGap now have real callers',
    gapWriters.some((w) => w.rel.startsWith('src/ui/')));
  check('...and is therefore NOT listed as dormant', !DORMANT.some((d) => d.id === 'gap-workflow'));

  // The genuinely-deferred subsystem must be DECLARED, and must SAY SO
  // wherever it is displayed — a dormant subsystem may never render a bare 0.
  check('the correction log is declared DORMANT with a reason and a planned phase', (() => {
    const d = DORMANT.find((x) => x.id === 'correction-log');
    return !!d && !!d.reason && !!d.plannedPhase && !!d.displayNote;
  })());

  // Phase 10, Sprint 10.3 — 'composer-timeline' was ACTIVATED (editSection
  // now has a real caller: ui/review-workspace.js's Document Editor),
  // mirroring the exact 'gap-workflow' precedent above: it must NOT appear
  // in the register, and must have a real caller outside composer-store.js
  // itself.
  const composerWriters = importersOf(/composer-store\.js$/, ['editSection']);
  check('composer-timeline is ACTIVATED — editSection now has a real caller',
    composerWriters.some((w) => w.rel.startsWith('src/ui/')));
  check('...and is therefore NOT listed as dormant', !DORMANT.some((d) => d.id === 'composer-timeline'));

  const ld = read('src/ui/learning-dashboard.js');
  const sic = read('src/ui/sarpras-intelligence-center.js');
  const nc = read('src/ui/nor-center.js');
  check('Learning Dashboard tells the truth about the dormant correction log (no bare zero)',
    ld.includes("dormantNote('correction-log')"));
  check('the Executive Briefing tells the truth about it too — it used to report a permanent, confident 0',
    sic.includes("dormantNote('correction-log')"));
  check('NOR Center no longer claims the Composer is dormant (retired call site)',
    !nc.includes("dormantNote('composer-timeline')"));
}

/* ══════════════════════════════════════════════════════════════════════
   2. BEHAVIOUR — the guarantees the owner exists to provide
   ══════════════════════════════════════════════════════════════════════ */

setKnowledgeBackend('memory');
const now = () => new Date().toISOString();
let seq = 0;
function mkItem(state, over = {}) {
  seq += 1;
  const t = now();
  return {
    id: `knowledge:nor:fixture:${seq}`,
    version: 1,
    domainType: 'nor',
    sourceType: 'manual-file',
    kind: 'document_fact',
    payload: { value: 'a real fact', normalization: { normalizerId: 'manual-file-normalizer', notes: 'human-typed' } },
    confidence: 1,
    lifecycleState: state,
    provenance: { connectorId: 'manual-file', sourceRef: 'import-session:nor:demo', capturedAt: t },
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: t, updatedAt: t,
    ...over,
  };
}
const stateOf = (id) => getKnowledge(id).data.lifecycleState;

console.log('\n[Behaviour — THE HUMAN GATE: no engine may call knowledge Approved]');
{
  const approved = ingest(mkItem(LIFECYCLE_STATE.APPROVED));
  check('ingest() REFUSES an item pre-stamped "approved" — the gate is enforced where knowledge ENTERS',
    approved.ok === false && approved.error.code === KNOWLEDGE_SERVICE_ERRORS.NOT_INGESTABLE);

  const deprecated = ingest(mkItem(LIFECYCLE_STATE.DEPRECATED));
  check('...and one pre-stamped "deprecated" — retiring knowledge is a decision, not an ingest',
    deprecated.ok === false && deprecated.error.code === KNOWLEDGE_SERVICE_ERRORS.NOT_INGESTABLE);

  const draft = ingest(mkItem(LIFECYCLE_STATE.DRAFT));
  check('a Draft ingests normally', draft.ok === true && draft.op === 'create');
  const again = mergeKnowledge({ ...draft.data, payload: { value: 'updated' } });
  check('mergeKnowledge is idempotent by id — a second write appends, never duplicates',
    again.ok === true && again.op === 'append');
}

console.log('\n[Behaviour — a HUMAN can promote a Draft all the way to Approved]');
{
  const item = mkItem(LIFECYCLE_STATE.DRAFT);
  ingest(item);
  check('setup: the pipeline produced a Draft', stateOf(item.id) === LIFECYCLE_STATE.DRAFT);

  const noRationale = promoteKnowledge(item.id, { approverId: 'evan', decidedAt: now() });
  check('approving WITHOUT a rationale is refused — an audit trail that says nothing is not an audit trail',
    noRationale.ok === false && noRationale.error.code === KNOWLEDGE_SERVICE_ERRORS.INVALID_REVIEW_DECISION);

  const ok = promoteKnowledge(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Benar bagi organisasi.' });
  check('ONE approval walks Draft -> Candidate -> Pending Review -> Approved (no three-click ritual)',
    ok.ok === true && stateOf(item.id) === LIFECYCLE_STATE.APPROVED);
  check('...and records who decided, and why', (() => {
    const s = getKnowledge(item.id).data;
    return s.approvedBy === 'evan' && s.preferenceRationale === 'Benar bagi organisasi.';
  })());

  // THE POINT OF THE WHOLE PHASE: approved knowledge is finally visible to the
  // consumers that only ever read APPROVED (pattern-discovery-engine.js:70,
  // knowledge-metrics-engine.js:45, index-engine.js:34). Before Phase 3 nothing
  // could reach this state through the UI, so all three read permanently empty.
  const approvedList = listKnowledge({ lifecycleState: LIFECYCLE_STATE.APPROVED });
  check('APPROVED knowledge now exists — Pattern Discovery / Coverage / the index are no longer starved',
    approvedList.ok && approvedList.data.some((i) => i.id === item.id));
}

console.log('\n[Behaviour — Approved knowledge is immutable, and may only be superseded]');
{
  const item = mkItem(LIFECYCLE_STATE.DRAFT);
  ingest(item);
  promoteKnowledge(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'ok' });

  const edit = updateDraft(item.id, { payload: { value: 'quietly rewritten' } });
  check('updateDraft REFUSES to edit Approved knowledge in place',
    edit.ok === false && edit.error.code === KNOWLEDGE_SERVICE_ERRORS.IMMUTABLE_STATE);

  const rejected = rejectKnowledge(item.id, { actorId: 'evan' });
  check('rejectKnowledge REFUSES Approved knowledge — retiring it is an archive, not a rejection',
    rejected.ok === false && rejected.error.code === KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION);

  const archived = archiveKnowledge(item.id, { actorId: 'evan', reason: 'Digantikan dokumen baru.' });
  check('archiveKnowledge retires it (supersession), preserving history',
    archived.ok === true && stateOf(item.id) === LIFECYCLE_STATE.DEPRECATED);

  const restored = restoreKnowledge(item.id, 1, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Dipulihkan.' });
  check('restoreKnowledge can bring a prior version back as current (append-only, never a rewrite)',
    restored.ok === true);
}

console.log('\n[Behaviour — content edits may never move the lifecycle]');
{
  const item = mkItem(LIFECYCLE_STATE.DRAFT);
  ingest(item);
  const sneak = updateDraft(item.id, { payload: { value: 'x' }, lifecycleState: LIFECYCLE_STATE.APPROVED });
  check('updateDraft REFUSES a patch carrying lifecycleState — a content edit cannot smuggle an approval',
    sneak.ok === false && sneak.error.code === KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION);
  check('...and the item is untouched', stateOf(item.id) === LIFECYCLE_STATE.DRAFT);
}

console.log('\n[Behaviour — Request Changes keeps knowledge alive; Reject does not]');
{
  const a = mkItem(LIFECYCLE_STATE.DRAFT);
  ingest(a);
  promoteToCandidate(a.id);
  submitKnowledgeForReview(a.id);
  check('setup: a Candidate submitted for review sits at Pending Review', stateOf(a.id) === LIFECYCLE_STATE.PENDING_REVIEW);
  const changes = requestChanges(a.id, { approverId: 'evan', decidedAt: now() });
  check('Request Changes sends it back to Candidate — it stays alive and reworkable',
    changes.ok === true && stateOf(a.id) === LIFECYCLE_STATE.CANDIDATE);

  const b = mkItem(LIFECYCLE_STATE.DRAFT);
  ingest(b);
  const rej = rejectKnowledge(b.id, { actorId: 'evan', reason: 'Tidak relevan.' });
  check('Reject retires never-accepted knowledge to Deprecated',
    rej.ok === true && stateOf(b.id) === LIFECYCLE_STATE.DEPRECATED);
  check('...with the human\'s real recorded reason', getKnowledge(b.id).data.preferenceRationale === 'Tidak relevan.');
}

console.log('\n[Behaviour — Part 6: every item can explain why it exists]');
{
  const item = mkItem(LIFECYCLE_STATE.DRAFT);
  ingest(item);
  updateDraft(item.id, { payload: { value: 'corrected by a human', normalization: item.payload.normalization } });
  promoteKnowledge(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Terverifikasi.' });

  const x = explainKnowledge(item.id);
  check('explainKnowledge returns a full provenance record', x.ok === true);
  check('...naming the ORIGIN Import Session (a bare ref — the Service never imports that domain)',
    x.data.importSessionId === 'import-session:nor:demo');
  check('...the extraction rationale actually recorded by the connector',
    !!x.data.extractionRationale && x.data.extractionRationale.normalizerId === 'manual-file-normalizer');
  check('...the confidence', x.data.confidence === 1);
  check('...the manual edits, read back out of real version history', x.data.manualEdits.length === 1);
  check('...and the full approval history, ending in the human decision', (() => {
    const last = x.data.approvalHistory[x.data.approvalHistory.length - 1];
    return last.toState === LIFECYCLE_STATE.APPROVED && last.by === 'evan' && last.rationale === 'Terverifikasi.';
  })());

  const missing = explainKnowledge('knowledge:nor:does-not-exist');
  check('an unknown item explains nothing rather than inventing something', missing.ok === false);
}

console.log('\n[Behaviour — createDraft is idempotent (the rehydration projection depends on it)]');
{
  const item = mkItem(LIFECYCLE_STATE.DRAFT);
  const first = createDraft(item);
  const second = createDraft({ ...item, payload: { value: 'should not overwrite' } });
  check('createDraft returns the EXISTING item rather than rewriting it',
    first.ok && second.ok && second.data.payload.value === 'a real fact' && second.data.version === 1);
  check('createDraft refuses a non-Draft item', createDraft(mkItem(LIFECYCLE_STATE.CANDIDATE)).ok === false);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
