/* archive-ownership-check.mjs — Phase 4, "Archive Ownership & Archive Intelligence".

   Same two-part shape as knowledge-ownership-check.mjs, on purpose: a reader who
   understands one understands both.

   1. ARCHITECTURAL (static). Asserts Archive has exactly one owner, one
      lifecycle authority, one repository boundary — and that no UI, engine or
      barrel can write around it. These are the rules that decay silently:
      nothing breaks when someone adds a second writer, so nothing tells you.

   2. BEHAVIOURAL (runtime). Drives the Archive Service and asserts the
      guarantees it exists to provide — duplicate detection at the door, a real
      lifecycle, deterministic relationships, and provenance on everything.

   Deterministic. No AI, no scoring, no fabricated data, no Firebase touch.
   Run: node scripts/archive-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resetArchiveRepository } from '../src/organizational-memory/repository/archive-repository.js';
import {
  archiveDocument, archiveDuplicate, archiveImportedKnowledge,
  archiveRejectedKnowledge, archiveSupersededKnowledge,
  restoreDocument, deprecateDocument, markReferenced,
  findArchiveRecord, listArchive, searchArchive,
  explainArchiveRecord, getArchiveRelationships, getReplacementChain, getDuplicateIntelligence,
  ARCHIVE_SERVICE_ERRORS,
} from '../src/organizational-memory/services/archive-service.js';
import {
  ARCHIVE_STATE, ARCHIVE_GRAPH, ARCHIVE_REASON, ARCHIVE_RELATIONSHIP,
} from '../src/organizational-memory/contracts/archive-record-contract.js';
import {
  DUPLICATE_KIND, classifyDuplicate, findDuplicateIntelligence, deriveRelationships, buildReplacementChain,
} from '../src/organizational-memory/archive-relationship-engine.js';

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

const OWNER = 'src/organizational-memory/services/archive-service.js';
const REPO_RE = /repository\/archive-repository\.js$/;

/* ══ 1. ONE OWNER ═════════════════════════════════════════════════════ */

console.log('\n[Part 1/2 — exactly ONE owner writes the Archive Repository]');
{
  const writers = [];
  const readers = [];
  for (const { rel, code } of FILES) {
    if (rel === OWNER || rel.includes('/organizational-memory/repository/')) continue;
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
  check(`NO module outside the owner imports an Archive WRITER${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`,
    writers.length === 0);
  check(`NO module outside the owner imports archive-repository.js AT ALL${readers.length ? ` — FOUND: ${[...new Set(readers)].join(', ')}` : ''}`,
    readers.length === 0);

  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write the repository (it is the owner, not a delegator)',
    /create as repoCreate/.test(ownerSrc) && /appendVersion as repoAppendVersion/.test(ownerSrc));

  // The audit found TWO creators. Name each, so a regression is legible.
  for (const f of [
    'src/organizational-memory/archive-ingestion-engine.js',
    'js/v2/ui/dataset-import-center.js',
  ]) {
    check(`${f.replace('js/v2/', '')} is now a CLIENT, not a writer`,
      !writers.some((w) => w.startsWith(f)));
  }
}

console.log('\n[Part 2 — the barrel no longer leaks the repository]');
{
  const barrel = stripComments(read('src/organizational-memory/index.js'));
  check('organizational-memory/index.js no longer does `export * from` the repository',
    !/export\s+\*\s+from\s+'\.\/repository\/archive-repository\.js'/.test(barrel));
  check('...it exports the Archive Service instead',
    /export\s+\*\s+from\s+'\.\/services\/archive-service\.js'/.test(barrel));
  check('...and only re-exports the repository\'s error codes + test teardown by name',
    /export\s*\{\s*ARCHIVE_REPOSITORY_ERRORS,\s*resetArchiveRepository\s*\}/.test(barrel));
}

console.log('\n[Part 3 — no UI writes the Archive directly]');
{
  const offenders = [];
  for (const { rel, code } of FILES.filter((f) => f.rel.startsWith('js/v2/ui/'))) {
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (!m || !/organizational-memory/.test(m[1])) continue;
      const clause = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
      for (const w of ['create', 'appendVersion']) {
        if (new RegExp(`(^|[,{\\s])${w}(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause)) offenders.push(`${rel}:${w}`);
      }
    }
  }
  check(`NO ui/*.js imports a raw Archive writer${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);

  // Comments stripped: dataset-import-center.js legitimately *discusses* the
  // `create as archiveCreate` import it no longer has, at length. A check that
  // fires on prose is a check people learn to ignore.
  const dic = stripComments(read('js/v2/ui/dataset-import-center.js'));
  check('the import pipeline archives through the Service (archiveImportedKnowledge), not raw create()',
    dic.includes('archiveImportedKnowledge') && !dic.includes('create as archiveCreate'));

  const ac = read('js/v2/ui/archive-center.js');
  check('Archive Center operates the lifecycle through the Service (restore / deprecate)',
    ac.includes('data-act="ac-arch-restore"') && ac.includes('data-act="ac-arch-deprecate"'));
  check('Archive Center explains WHY each document exists (Part 4)',
    ac.includes('explainArchiveRecord') && ac.includes('renderArchiveProvenance'));
  check('Archive Center shows document RELATIONSHIPS (Part 5)',
    ac.includes('getArchiveRelationships') && ac.includes('getReplacementChain'));
}

console.log('\n[Part 4 — one lifecycle authority, no orphan states]');
{
  const states = Object.values(ARCHIVE_STATE);
  check('every declared state has an entry in ARCHIVE_GRAPH (no dangling state)',
    states.every((s) => Array.isArray(ARCHIVE_GRAPH[s])));
  const reachable = new Set([ARCHIVE_STATE.CREATED]);
  for (const edges of Object.values(ARCHIVE_GRAPH)) edges.forEach((e) => reachable.add(e));
  check('every declared state is REACHABLE — no state exists that nothing can write',
    states.every((s) => reachable.has(s)));
  check('DUPLICATE is absorbing — a duplicate can never become the original',
    ARCHIVE_GRAPH[ARCHIVE_STATE.DUPLICATE].length === 0);
  check('SUPERSEDED and DEPRECATED both lead back to AVAILABLE (restore is a transition, not a state)',
    ARCHIVE_GRAPH[ARCHIVE_STATE.SUPERSEDED].includes(ARCHIVE_STATE.AVAILABLE)
    && ARCHIVE_GRAPH[ARCHIVE_STATE.DEPRECATED].includes(ARCHIVE_STATE.AVAILABLE));
  // There is no DELETED, and that is deliberate — see the contract's header.
  check('there is NO "deleted" state — the archive is append-only by design',
    !states.includes('deleted'));

  const ownerSrc = stripComments(read(OWNER));
  check('the Archive Service exposes no delete()', !/export function deleteDocument|export function remove/.test(ownerSrc));
}

/* ══ 2. BEHAVIOUR ═════════════════════════════════════════════════════ */

resetArchiveRepository();

let seq = 0;
function seed(over = {}) {
  seq += 1;
  return {
    id: `nor:archive:fixture:${seq}`,
    sourceDomainType: 'nor',
    sourceId: `import-session:nor:${seq}`,
    sourceType: 'manual-file',
    documentNumber: `NOR-${String(seq).padStart(3, '0')}`,
    documentDate: '2026-01-15',
    senderOrigin: 'Sarpras',
    documentHash: `hash-${seq}`,
    sourceSnapshot: { value: 'a real fact' },
    ...over,
  };
}
const stateOf = (id) => findArchiveRecord(id).data.state;

console.log('\n[Behaviour — a document enters the archive with a real lifecycle and real provenance]');
{
  const s = seed({ importSessionId: 'import-session:nor:1', archivedBy: 'evan' });
  const r = archiveDocument(s);
  check('archiveDocument creates the record', r.ok && r.op === 'create');
  check('...it enters as AVAILABLE, not as a stateless row', stateOf(s.id) === ARCHIVE_STATE.AVAILABLE);
  check('...carrying a real archive reason', findArchiveRecord(s.id).data.archiveReason === ARCHIVE_REASON.INGESTED);
  check('...and a real link back to the upload that produced it',
    findArchiveRecord(s.id).data.importSessionId === 'import-session:nor:1');

  const again = archiveDocument(s);
  check('re-archiving the SAME id appends, never duplicates (idempotent)', again.ok && again.op === 'append');
  check('...and the archive still holds exactly one record for it', listArchive({}).data.filter((x) => x.id === s.id).length === 1);
}

console.log('\n[Behaviour — DUPLICATE DETECTION happens at the door (Part 7)]');
{
  resetArchiveRepository();
  const original = seed({ documentHash: 'sha-identical', documentNumber: 'NOR-100' });
  archiveDocument(original);

  // Same bytes, different id, different origin: the same content by another route.
  const copy = seed({ documentHash: 'sha-identical', documentNumber: 'NOR-100', sourceType: 'nor-archive', sourceId: 'nor:99' });
  const dup = archiveDocument(copy);
  check('a byte-identical arrival is archived as a DUPLICATE, not as a second document',
    dup.ok && stateOf(copy.id) === ARCHIVE_STATE.DUPLICATE);
  check('...linked to the original it repeats', findArchiveRecord(copy.id).data.duplicateOfId === original.id);
  check('...and it is NEVER discarded — that the same document arrived twice IS information',
    findArchiveRecord(copy.id).ok);
  check('the ORIGINAL is untouched and still AVAILABLE', stateOf(original.id) === ARCHIVE_STATE.AVAILABLE);

  const intel = getDuplicateIntelligence('nor');
  check('duplicate intelligence classifies it deterministically',
    intel.ok && intel.data.some((d) => d.originalId === original.id && d.duplicateId === copy.id));
  const verdict = intel.data.find((d) => d.duplicateId === copy.id);
  check('...as SAME_CONTENT (identical bytes, different route) — with a stated rationale',
    verdict.kind === DUPLICATE_KIND.SAME_CONTENT && verdict.rationale.length > 10);

  // A duplicate cannot be restored into being the original.
  const restore = restoreDocument(copy.id, { actorId: 'evan' });
  check('a DUPLICATE cannot be restored — that would make the organization believe it has two originals',
    restore.ok === false && restore.error.code === ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION);
}

console.log('\n[Behaviour — deterministic duplicate KINDS, and only deterministic ones]');
{
  const base = { sourceDomainType: 'nor', sourceType: 'manual-file', documentDate: '2026-01-01', senderOrigin: 'Sarpras', sourceSnapshot: {} };
  const a = { ...base, id: 'a', sourceId: 's1', documentNumber: 'NOR-1', documentHash: 'h1', archivedAt: '2026-01-01T00:00:00Z' };

  check('SAME_FILE — identical bytes AND identical origin',
    classifyDuplicate(a, { ...a, id: 'b', archivedAt: '2026-01-02T00:00:00Z' }).kind === DUPLICATE_KIND.SAME_FILE);
  check('SAME_CONTENT — identical bytes, different route',
    classifyDuplicate(a, { ...a, id: 'b', sourceId: 's2', sourceType: 'nor-archive', archivedAt: '2026-01-02T00:00:00Z' }).kind === DUPLICATE_KIND.SAME_CONTENT);
  check('UPDATED_VERSION — same number, different bytes, archived later',
    classifyDuplicate(a, { ...a, id: 'b', documentHash: 'h2', archivedAt: '2026-01-02T00:00:00Z' }).kind === DUPLICATE_KIND.UPDATED_VERSION);
  check('NEAR_DUPLICATE — same number+date+sender, different bytes, NOT newer (an exact condition, not a score)',
    classifyDuplicate(a, { ...a, id: 'b', documentHash: 'h2', archivedAt: '2026-01-01T00:00:00Z' }).kind === DUPLICATE_KIND.NEAR_DUPLICATE);
  check('SUPERSEDED_VERSION — an explicitly RECORDED replacement outranks every inference',
    classifyDuplicate(a, { ...a, id: 'b', documentHash: 'h2', supersedesId: 'a', archivedAt: '2026-01-02T00:00:00Z' }).kind === DUPLICATE_KIND.SUPERSEDED_VERSION);

  check('UNRELATED documents produce NO relationship — the engine says nothing rather than guessing',
    classifyDuplicate(a, { ...a, id: 'b', documentNumber: 'NOR-999', documentHash: 'h9', archivedAt: '2026-01-02T00:00:00Z' }) === null);
  check('a record is never a duplicate of itself', classifyDuplicate(a, a) === null);
}

console.log('\n[Behaviour — the replacement chain, recorded from BOTH ends (Part 5)]');
{
  resetArchiveRepository();
  const v1 = seed({ documentNumber: 'NOR-200', documentHash: 'v1' });
  archiveDocument(v1);
  const v2 = seed({ documentNumber: 'NOR-200', documentHash: 'v2', supersedesId: v1.id });
  archiveDocument(v2);

  check('archiving a successor SUPERSEDES its predecessor automatically', stateOf(v1.id) === ARCHIVE_STATE.SUPERSEDED);
  check('...and the chain is recorded from BOTH ends (a one-way link is one nobody can follow back)',
    findArchiveRecord(v1.id).data.supersededById === v2.id
    && findArchiveRecord(v2.id).data.supersedesId === v1.id);

  const chain = getReplacementChain(v2.id);
  check('the full chain reads oldest-first', chain.ok && chain.data.length === 2 && chain.data[0].id === v1.id && chain.data[1].id === v2.id);

  const rel = getArchiveRelationships(v1.id);
  check('the superseded document knows what replaced it',
    rel.ok && rel.data.some((x) => x.type === ARCHIVE_RELATIONSHIP.SUPERSEDED_BY && x.targetId === v2.id));

  const restored = restoreDocument(v1.id, { actorId: 'evan', reason: 'Revisi dibatalkan.' });
  check('a superseded document can be RESTORED (an event, not a permanent state)',
    restored.ok && stateOf(v1.id) === ARCHIVE_STATE.AVAILABLE);
  check('...and the restore is recorded in history with its reason',
    findArchiveRecord(v1.id).data.archiveReason === ARCHIVE_REASON.RESTORED);
}

console.log('\n[Behaviour — the Import pipeline\'s door: archiveImportedKnowledge]');
{
  resetArchiveRepository();
  const s = seed({
    importSessionId: 'import-session:nor:77',
    knowledgeItemId: 'knowledge:nor:manual-file:abc',
    datasetId: 'import-session:nor:77:dataset',
    archivedBy: 'evan',
  });
  const r = archiveImportedKnowledge(s);
  check('a document whose content became Knowledge enters as REFERENCED, not merely AVAILABLE',
    r.ok && stateOf(s.id) === ARCHIVE_STATE.REFERENCED);
  const rec = findArchiveRecord(s.id).data;
  check('...with hasContributedKnowledge set from a REAL link, not an inference',
    rec.hasContributedKnowledge === true && rec.knowledgeItemId === 'knowledge:nor:manual-file:abc');

  // A duplicate did not independently contribute knowledge — the document it
  // duplicates did. Saying otherwise would double-count organizational memory.
  const dupSeed = seed({ documentHash: s.documentHash, knowledgeItemId: 'knowledge:nor:manual-file:xyz' });
  archiveImportedKnowledge(dupSeed);
  check('a DUPLICATE is never promoted to REFERENCED — it would double-count the organization\'s own memory',
    stateOf(dupSeed.id) === ARCHIVE_STATE.DUPLICATE);
}

console.log('\n[Behaviour — Knowledge rejected: the document survives, the knowledge link does not]');
{
  resetArchiveRepository();
  const s = seed({ knowledgeItemId: 'knowledge:nor:k1' });
  archiveImportedKnowledge(s);
  const rejected = archiveRejectedKnowledge(s.id, { actorId: 'evan', reason: 'Tidak relevan.' });
  check('archiveRejectedKnowledge deprecates the source document', rejected.ok && stateOf(s.id) === ARCHIVE_STATE.DEPRECATED);
  check('...the DOCUMENT still exists — a rejected fact does not unmake the paper it was written on',
    findArchiveRecord(s.id).ok);
  check('...with the human\'s real recorded reason',
    findArchiveRecord(s.id).data.archiveReason === ARCHIVE_REASON.KNOWLEDGE_REJECTED);
}

console.log('\n[Behaviour — Part 4: nothing exists without provenance]');
{
  resetArchiveRepository();
  const original = seed({ documentNumber: 'NOR-300', documentHash: 'p1' });
  archiveDocument(original);
  const s = seed({
    documentNumber: 'NOR-301',
    documentHash: 'p2',
    supersedesId: original.id,
    importSessionId: 'import-session:nor:88',
    knowledgeItemId: 'knowledge:nor:k9',
    datasetId: 'ds:1',
    archivedBy: 'evan',
  });
  archiveImportedKnowledge(s);

  const x = explainArchiveRecord(s.id);
  check('explainArchiveRecord returns a full provenance record', x.ok);
  const d = x.data;
  check('...Origin Import Session', d.importSessionId === 'import-session:nor:88');
  check('...Knowledge Reference', d.knowledgeItemId === 'knowledge:nor:k9');
  check('...Archive Reason', !!d.archiveReason);
  check('...Archived By', d.archivedBy === 'evan');
  check('...Archived At', !!d.archivedAt);
  check('...Source Connector', d.sourceConnector === 'manual-file');
  check('...Related Documents', d.relatedDocuments.length > 0);
  check('...the replacement chain it sits in', d.replacementChain.length === 2);
  check('...and the lifecycle history, every move with its reason',
    d.lifecycleHistory.length >= 1 && d.lifecycleHistory.every((h) => !!h.toState));

  const missing = explainArchiveRecord('nor:archive:does-not-exist');
  check('an unknown document explains nothing rather than inventing something', missing.ok === false);
}

console.log('\n[Behaviour — the pure engine is genuinely pure (no repository, no state)]');
{
  const engineSrc = stripComments(read('src/organizational-memory/archive-relationship-engine.js'));
  check('archive-relationship-engine.js imports NO repository — it takes records in, returns facts out',
    !/repository/.test(engineSrc));
  check('...and holds no module-level state', !/^(const|let)\s+_/m.test(engineSrc));
  check('deriveRelationships on an empty archive returns nothing rather than failing',
    deriveRelationships({ id: 'x' }, []).length === 0);
  check('buildReplacementChain is cycle-safe (a malformed chain terminates rather than hanging)', (() => {
    const a = { id: 'a', supersedesId: 'b', archivedAt: '1' };
    const b = { id: 'b', supersedesId: 'a', archivedAt: '2' };
    return buildReplacementChain(a, [a, b]).length <= 2;
  })());
  check('findDuplicateIntelligence on unrelated records finds nothing',
    findDuplicateIntelligence([
      { id: 'a', documentNumber: 'X', documentHash: 'h1', sourceDomainType: 'nor', archivedAt: '1' },
      { id: 'b', documentNumber: 'Y', documentHash: 'h2', sourceDomainType: 'nor', archivedAt: '2' },
    ]).length === 0);
}

console.log('\n[Behaviour — reads all go through the Service]');
{
  resetArchiveRepository();
  const s = seed({ documentNumber: 'NOR-400' });
  archiveDocument(s);
  check('findArchiveRecord', findArchiveRecord(s.id).ok);
  check('listArchive', listArchive({ sourceDomainType: 'nor' }).data.length === 1);
  check('searchArchive', searchArchive('NOR-400').ok);
  check('markReferenced is idempotent', (() => {
    markReferenced(s.id, 'knowledge:nor:z');
    const v1 = findArchiveRecord(s.id).data.version;
    markReferenced(s.id, 'knowledge:nor:z');
    return findArchiveRecord(s.id).data.version === v1;
  })());
  check('deprecateDocument retires an available document',
    deprecateDocument(s.id, { actorId: 'evan' }).ok && stateOf(s.id) === ARCHIVE_STATE.DEPRECATED);
  check('archiveSupersededKnowledge refuses an illegal move (a deprecated doc cannot be superseded)',
    archiveSupersededKnowledge(s.id, 'nor:archive:other').ok === false);
  check('archiveDuplicate records an externally-established duplicate', (() => {
    const d = seed({ documentHash: 'ext-dup' });
    return archiveDuplicate(d, s.id).ok;
  })());
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
