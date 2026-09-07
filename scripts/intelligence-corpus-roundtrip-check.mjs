/* ============================================================
   intelligence-corpus-roundtrip-check.mjs — Corpus Observation
   RTDB round-trip contract (V2, Phase C4E.2 regression)

   PURE node test — no browser, no Firebase, no network, no model,
   no JVM emulator. A tiny in-memory stand-in reproduces the ONE RTDB
   write semantic that caused the defect: a present-but-`null` key is a
   delete, so it is simply ABSENT on read (and a container that empties
   is itself absent).

   The invariant under regression (Phase C4E.2):

     Every observation successfully persisted by the corpus store MUST
     rehydrate into an object that satisfies isCorpusObservation() — and
     stay usable by groupObservations() / buildWritingMemory().

   The defect: a structure-parsed observation stores provenance with
   sourceFileId / pageNumber / region = null. RTDB drops those keys.
   The stored entry keeps its `corpus-provenance@1` schema tag, so
   makeCorpusObservation() trusted it and skipped normalisation →
   isCorpusProvenance() → isCorpusObservation() rejected it →
   groupObservations() silently dropped the whole persisted corpus →
   Writing Memory emitted 0 entries.

   The fix: corpusStore.rehydrateObservation() now re-runs each stored
   provenance entry through makeCorpusProvenance() before the observation
   is rebuilt, restoring the omitted optional fields to null.

   Real (NOT mocked): makeCorpusObservation, isCorpusObservation,
   isCorpusProvenance, corpusStore.recordObservation / listObservations /
   rehydrateObservation, groupObservations, buildWritingMemory.

   Run:  node scripts/intelligence-corpus-roundtrip-check.mjs   (exit 0 = pass)
   ============================================================ */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/* the DEPLOYED CJS store + contract (where the fix lives) */
const corpusStore = require('../functions/src/intelligence/corpusStore.js');
const {
  makeCorpusObservation, isCorpusObservation, isCorpusProvenance,
  OBSERVATION_CATEGORY, EXTRACTION_METHOD, CORPUS_DOCUMENT_TYPE,
} = require('../functions/src/intelligence/corpusContract.js');

/* the DEPLOYED ESM analysis closure (what production actually runs) */
const { groupObservations } = await import(
  '../functions/src/intelligence/corpus-esm/analysis/candidate-grouping.js'
);
const { buildWritingMemory } = await import(
  '../functions/src/intelligence/corpus-esm/writing-memory/writing-memory-builder.js'
);
const { makeCorpusDocument } = await import(
  '../functions/src/intelligence/corpus-esm/contracts/corpus-document-contract.js'
);

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-07T00:00:00.000Z';

/* ── faithful in-memory stand-in for the admin RTDB write+read ──────────
   The ONLY behaviour it models beyond a plain key/value map is RTDB's
   null semantics: JSON has no `undefined` (already stripped upstream by
   sanitizeForRtdb), every `null` leaf is a delete so its key is absent
   on read, and an object/array that becomes empty is itself absent. */
function stripLikeRtdb(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) {
    const out = v.map(stripLikeRtdb).filter((x) => x !== undefined);
    return out.length ? out : undefined;
  }
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      const w = stripLikeRtdb(v[k]);
      if (w !== undefined) out[k] = w;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

function makeFakeRtdb() {
  const store = Object.create(null); // "collection/id" -> plain value
  const norm = (p) => String(p || '').replace(/^\/+|\/+$/g, '');
  const snapshot = (val) => ({
    val: () => (val === undefined ? null : val),
    forEach: (cb) => {
      if (val && typeof val === 'object') {
        for (const k of Object.keys(val)) cb({ key: k, val: () => val[k] });
      }
    },
  });
  const refFor = (path) => ({
    path,
    once: async () => snapshot(store[path]),
    set: async (value) => { store[path] = stripLikeRtdb(value); },
    orderByChild: (field) => ({
      equalTo: (needle) => ({
        once: async () => {
          const prefix = `${path}/`;
          const matched = {};
          for (const key of Object.keys(store)) {
            if (key.startsWith(prefix) && key.indexOf('/', prefix.length) === -1) {
              const row = store[key];
              if (row && row[field] === needle) matched[key.slice(prefix.length)] = row;
            }
          }
          return snapshot(Object.keys(matched).length ? matched : undefined);
        },
      }),
    }),
  });
  return {
    ref: (path) => refFor(norm(path)),
    _raw: (path) => store[norm(path)],
    _keys: () => Object.keys(store),
  };
}

const provSeed = (documentId, over = {}) => ({
  sourceDocumentId: documentId,
  // the exact shape the structure-parse path produces — all optional:
  sourceFileId: over.sourceFileId !== undefined ? over.sourceFileId : null,
  pageNumber: over.pageNumber !== undefined ? over.pageNumber : null,
  region: over.region !== undefined ? over.region : null,
  extractionMethod: EXTRACTION_METHOD.STRUCTURE_PARSE,
  extractedAt: AT,
  confidence: 0.9,
});

async function seedDoc(db, checksum, sourceDate, documentType = CORPUS_DOCUMENT_TYPE.NOR) {
  const r = await corpusStore.ingestDocument(db, {
    seed: { checksum, documentType, typeConfidence: 0.9, sourceDate, title: `doc ${checksum}` },
    ownerId: 'evan', now: AT,
  });
  if (!r.ok) throw new Error(`ingestDocument failed: ${JSON.stringify(r)}`);
  return r.data.document.documentId; // corpus_<checksum>
}

async function persistObs(db, documentId, over = {}) {
  const r = await corpusStore.recordObservation(db, {
    seed: {
      documentId,
      category: over.category || OBSERVATION_CATEGORY.OPENING_PATTERN,
      key: over.key || 'opening_salutation',
      observedValue: over.observedValue !== undefined ? over.observedValue : 'Dengan hormat,',
      confidence: 0.9,
      provenance: over.provenance || [provSeed(documentId)],
    },
    ownerId: 'evan', now: AT,
  });
  if (!r.ok) throw new Error(`recordObservation failed: ${JSON.stringify(r)}`);
  return r.data.observation.observationId;
}

/* ════════════════════════════════════════════════════════════════════════ */

section('1 — persist → RTDB round-trip → rehydrateObservation keeps the contract');
{
  const db = makeFakeRtdb();
  const docId = await seedDoc(db, 'rt_one', '2026-02-01');
  const obsId = await persistObs(db, docId);

  // the observation the store BUILT (pre-write) is valid — sanity, and it
  // proves the fixture starts from a legitimately valid observation.
  const built = makeCorpusObservation({
    observationId: obsId, documentId: docId,
    category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'opening_salutation',
    observedValue: 'Dengan hormat,', modality: 'text',
    provenance: [provSeed(docId)], confidence: 0.9, occurrenceCount: 1,
    lifecycleState: 'observed', createdAt: AT, updatedAt: AT,
  });
  check(isCorpusObservation(built), 'the observation is valid BEFORE it is persisted');

  // what actually sits in "RTDB" after the write:
  const raw = db._raw(`intelligence_corpus_observations/${obsId}`);
  check(!!raw && raw.schema === 'corpus-observation@1', 'a record was persisted');
  const rawProv = Array.isArray(raw.provenance) ? raw.provenance : Object.values(raw.provenance || {});
  check(
    rawProv.length === 1
      && !('sourceFileId' in rawProv[0]) && !('pageNumber' in rawProv[0]) && !('region' in rawProv[0]),
    'the stored provenance entry LOST its null sourceFileId / pageNumber / region (RTDB strip reproduced)',
  );
  check(rawProv[0].schema === 'corpus-provenance@1', '…but it kept the `corpus-provenance@1` schema tag (why the shortcut mis-trusted it)');
  check(!isCorpusProvenance(rawProv[0]), 'the stripped entry on its own FAILS isCorpusProvenance() — the condition the fix must survive');

  // read it back the way every intelligence callable does:
  const list = await corpusStore.listObservations(db, docId);
  check(list.ok && list.data.length === 1, 'listObservations returns the persisted observation');
  const rt = list.data[0];

  check(isCorpusProvenance(rt.provenance[0]) === true, 'rehydrated provenance[0] → isCorpusProvenance() === true');
  check(isCorpusObservation(rt) === true, 'rehydrated observation → isCorpusObservation() === true  (THE INVARIANT)');

  // the round-trip restored the omitted fields to null — it did NOT invent data
  check(rt.provenance[0].sourceFileId === null && rt.provenance[0].pageNumber === null && rt.provenance[0].region === null,
    'the omitted optional fields came back as exactly null (not undefined, not fabricated)');
  check(rt.provenance[0].sourceDocumentId === docId
    && rt.provenance[0].extractionMethod === EXTRACTION_METHOD.STRUCTURE_PARSE
    && rt.provenance[0].extractedAt === AT
    && rt.provenance[0].confidence === 0.9,
    'every value that WAS stored survived the round-trip unchanged');
  check(rt.observationId === obsId && rt.documentId === docId && rt.observedValue === 'Dengan hormat,'
    && rt.lifecycleState === 'observed',
    'the observation identity / value / lifecycle survived the round-trip');
}

section('2 — a partially-stripped provenance keeps the fields that WERE stored');
{
  const db = makeFakeRtdb();
  const docId = await seedDoc(db, 'rt_partial', '2026-02-01');
  // pageNumber IS set (survives RTDB); sourceFileId / region are null (stripped)
  const obsId = await persistObs(db, docId, { provenance: [provSeed(docId, { pageNumber: 3 })] });
  const raw = db._raw(`intelligence_corpus_observations/${obsId}`);
  const rawProv = Array.isArray(raw.provenance) ? raw.provenance : Object.values(raw.provenance || {});
  check(rawProv[0].pageNumber === 3 && !('sourceFileId' in rawProv[0]) && !('region' in rawProv[0]),
    'stored: pageNumber 3 kept, sourceFileId + region dropped');

  const list = await corpusStore.listObservations(db, docId);
  const rt = list.data[0];
  check(isCorpusObservation(rt) === true, 'rehydrated observation is valid');
  check(rt.provenance[0].pageNumber === 3, 'the real pageNumber (3) was preserved — not flattened to null');
  check(rt.provenance[0].sourceFileId === null && rt.provenance[0].region === null, 'the genuinely-absent fields are null');
}

section('3 — rehydrated observation is retained by real groupObservations()');
{
  const db = makeFakeRtdb();
  const docId = await seedDoc(db, 'rt_group', '2026-02-01');
  const obsId = await persistObs(db, docId);
  const list = await corpusStore.listObservations(db, docId);
  const rt = list.data[0];

  const groups = groupObservations([rt]);
  check(groups.length === 1, 'groupObservations() produced one group (the observation was NOT dropped)');
  const g0 = groups[0] || { members: [], documentIds: [] };
  check(g0.members.length === 1 && g0.members[0] && g0.members[0].observationId === obsId,
    'the rehydrated observation is the group member');
  check(g0.documentIds.includes(docId), 'the group carries the source documentId');

  // contrast: the RAW stored record (no rehydrate) is silently dropped
  const rawStored = db._raw(`intelligence_corpus_observations/${obsId}`);
  check(groupObservations([rawStored]).length === 0,
    'the un-rehydrated stored record IS dropped by groupObservations() — rehydrate is load-bearing');
}

section('4 — 3 NOR docs + round-tripped observations → real buildWritingMemory() emits ≥ 1 entry');
{
  const db = makeFakeRtdb();
  const CFG = {
    candidateMinDocuments: 3,
    temporal: {
      historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01',
      minCurrentDocuments: 2, minHistoricalDocuments: 1, conflictMinorityRatio: 0.34,
    },
  };
  const specs = [
    { checksum: 'rt_wm_1', sourceDate: '2026-01-05' },
    { checksum: 'rt_wm_2', sourceDate: '2026-02-05' },
    { checksum: 'rt_wm_3', sourceDate: '2026-03-05' },
  ];
  const docs = [];
  const roundTripped = [];
  const rawStored = [];
  for (const s of specs) {
    const docId = await seedDoc(db, s.checksum, s.sourceDate);
    const obsId = await persistObs(db, docId, {
      category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'opening_salutation', observedValue: 'Dengan hormat,',
    });
    const list = await corpusStore.listObservations(db, docId);
    roundTripped.push(list.data[0]);
    rawStored.push(db._raw(`intelligence_corpus_observations/${obsId}`));
    docs.push(makeCorpusDocument({
      documentId: docId, checksum: s.checksum, ownerId: 'evan',
      documentType: CORPUS_DOCUMENT_TYPE.NOR, sourceDate: s.sourceDate, createdAt: AT,
    }));
  }

  check(roundTripped.every(isCorpusObservation), 'all 3 round-tripped observations are valid');

  const report = buildWritingMemory({ documents: docs, observations: roundTripped, approvedRules: [] }, CFG, { at: AT });
  check(report.entries.length >= 1, `buildWritingMemory() emitted ${report.entries.length} entry(ies) (≥ 1 required)`);
  const entry = report.entries.find((e) => e.value === 'Dengan hormat,');
  check(!!entry, 'an entry carries the verbatim observed value "Dengan hormat,"');
  check(!!entry && entry.evidence && entry.evidence.documentCount >= 3,
    'the entry is evidence-backed by all 3 documents');
  check(!!entry && entry.authorityState !== 'approved',
    'the entry is observed/candidate — never approved (§8 unchanged)');

  // contrast: the same call with the un-rehydrated stored records emits nothing
  const brokenReport = buildWritingMemory(
    { documents: docs, observations: rawStored, approvedRules: [] }, CFG, { at: AT },
  );
  check(brokenReport.entries.length === 0,
    'the un-rehydrated stored records → 0 entries — confirms the round-trip fix is what enables emission');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
