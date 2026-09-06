# src/intelligence/corpus — NOR & Memorandum Corpus Acquisition Foundation (V2, Phase 5.x.1)

> Status: **dormant, feature-flagged off, no UI, not deployed.** The Null
> backend is active by default, so every call returns `NOT_IMPLEMENTED`
> until a real backend is registered. No OpenAI call, no knowledge write,
> no numbering, no V1 coupling. See
> `docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_CORPUS.md`.

## What this is

The safe, auditable **foundation** for later ingesting historical PBSI NOR
/ Nota Organisasi / Memorandum documents and extracting organizational
writing + document-layout knowledge from them.

This is **not** the AI-learning / RAG phase. It builds the contracts and
the server boundary; it does not render PDFs, call a model, or promote
anything.

## The three layers (never collapsed)

```
HISTORICAL CORPUS            a CorpusDocument — the ingested source file.
      │                      Evidence. Preserved, never rewritten.
      ▼
EXTRACTED OBSERVATIONS       a CorpusObservation — one thing a document was
      │                      observed to do (a phrase, a structural
      │                      convention, a page-layout fact). Still evidence.
      │                      lifecycleState starts 'observed'.
      ▼  (human review only — no code path does this)
HUMAN-APPROVED RULES         only an observation a human explicitly moves to
                             'approved' may ever become authoritative context.
```

`observedValue` is historical evidence — **not** `preferredValue`, **not**
`approvedValue`, **not** an organizational rule. `confidence` measures
extraction/classification certainty, **not** organizational authority: an
observation can be `confidence: 0.99` and still `lifecycleState: 'observed'`.

## Layout

```
corpus/
  contracts/
    corpus-document-contract.js       CorpusDocument: documentId (= corpus_<checksum>),
                                      documentType (NOR | NOTA_ORGANISASI | MEMORANDUM |
                                      LEGACY | UNKNOWN), documentEra (separate axis),
                                      ingestionStatus vs analysisStatus (separate
                                      lifecycles), pageCount null-when-unknown,
                                      classification default 'restricted'
    corpus-observation-contract.js    CorpusObservation: modality text|structure|visual,
                                      >= 1 provenance required, normalizedValue ALWAYS null,
                                      approval fields present iff lifecycleState 'approved'
    corpus-provenance-contract.js     CorpusProvenance + CorpusRegion — every observation
                                      traces to sourceDocumentId (+ page + region);
                                      geometry is nullable ("unknown"), never fabricated
    observation-lifecycle-contract.js observed → candidate → approved | rejected → deprecated;
                                      APPROVED is human-gated (mirrors
                                      src/knowledge/contracts/lifecycle-contract.js)
    corpus-store-contract.js          the backend interface + CorpusResult envelope
  corpus-observation-record.js        pure helpers: observationIdFrom,
                                      makeObservationFromExtraction, mergeObservationOccurrence
                                      (evidence accumulates, lifecycle NEVER moves),
                                      advanceObservationLifecycle (human gate enforced —
                                      NOT reachable through the store this phase)
  backends/
    null-corpus-backend.js            the inert default — NOT_IMPLEMENTED
    memory-corpus-backend.js          in-process; real checksum dedup, real analysis-status
                                      graph, evidence accumulation; used by tests + DISABLED mode
    callable-corpus-backend.js        thin adapter over the (staged) intelligenceCorpus function
  corpus-store.js                     THE facade — backend registry + events + 6 delegating methods
```

## Storage / server boundary

The persistence is server-owned, mirroring every prior Intelligence phase:

| RTDB node | Writer | Reader |
|---|---|---|
| `/intelligence_corpus_documents/{documentId}` | `intelligenceCorpus` Cloud Function (Admin SDK) — `.write: false` | owner (`ownerId === auth.uid`) + admin/developer |
| `/intelligence_corpus_observations/{observationId}` | same | same |

The browser **cannot** write authoritative corpus records. The CJS server
side (`functions/src/intelligence/corpusContract.js` + `corpusStore.js` +
`intelligenceCorpus.js`) keeps its own contract mirror and never imports
this tree.

**STAGED, not live (Phase 5.x.1 §20):** `intelligenceCorpus.js` is
authored but **not** wired into `functions/index.js`; the two rule blocks
are in `database.rules.json` but **not** deployed. Wiring + the
`firebase deploy --only database` is a Phase 5.x.2 change with its own
review.

## Dependency direction

`src/intelligence/corpus/` may read `src/knowledge/` /
`src/organizational-memory/` / `src/file-storage/` (read-only); none of
them may import it. Nothing outside `src/intelligence/` imports this tree;
the only `js/` composition root remains `js/intelligence-backend-wiring.js`.

## Relationship to existing modules

- **`src/organizational-memory/` ArchiveRecord** records a *V1 Petty Cash
  NOR that already exists in production*. A **CorpusDocument** is an
  *uploaded historical file* that predates / sits outside that store. Both
  carry a content hash and a "duplicate of" relationship; they are
  different axes over (sometimes) the same paper.
- **`src/knowledge/` KnowledgeItem** is an approved organizational fact. A
  CorpusObservation is not one and does not become one automatically —
  human approval is required, and no code path performs it this phase.
- **`src/file-storage/` StoredFileRecord** (`file:<sha256>`) is the
  preserved original bytes. `CorpusDocument.sourceFileId` points at it.

## Verification

- `node scripts/intelligence-corpus-contract-check.mjs` — contract validity + the mandatory separations
- `node scripts/intelligence-corpus-store-check.mjs` — facade + Memory backend behaviour
- `node scripts/intelligence-corpus-check.cjs` — CJS⇄ESM drift + server store + callable auth matrix + security scan
