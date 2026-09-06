# V2 — Sarpras Intelligence Phase 5.x.1: NOR & Memorandum Corpus Acquisition Foundation

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Production feature flag `/feature_flags/intelligence/enabled` remains
**absent → OFF**. Zero OpenAI calls. Zero production corpus mutations. No V1
change. No Phase 5 Registry change. No data migration.

Follows Phase 5 (Canonical NOR Registry & Human Publication, commit `f23b097`).
Built on prior V2 phases 0 → 5.

---

## 1. Purpose

Establish a **safe, auditable foundation** for later ingesting historical
PBSI **NOR / Nota Organisasi / Memorandum** documents and extracting
organizational **writing** and **document-layout** knowledge from them.

This phase is **not** the AI-learning / RAG implementation. It does not:

- train model weights
- send a corpus to OpenAI
- render PDFs or run a visual analyzer
- promote any extracted observation into an authoritative organizational rule
- change V1 NOR generation, the Phase 5 Registry, or NOR numbering

It builds the **contracts** and the **server boundary** so those later
sub-phases have a stable, human-gated structure to build on.

The physical corpus this exists to eventually serve already sits in the
repo as a **design-reference bundle** (`Petty Cash Center/uploads/`): two
signed NOR PDFs, one `.docx`, and **"Memo Sarpras 362"** — a differently
named predecessor instrument whose relationship to "Nota Organisasi
Sarpras" is genuinely unknown (NOR-Specification.md, evidence-base note +
§D.7). Phase 5.x.1 is designed to record that ambiguity, not resolve it.

---

## 2. The three layers (never collapsed)

```
HISTORICAL CORPUS            a CorpusDocument — the ingested source file.
      │                      EVIDENCE. Preserved, never rewritten.
      ▼   extraction (a later sub-phase)
EXTRACTED OBSERVATIONS       a CorpusObservation — one thing a document was
      │                      observed to do: a turn of phrase (§7), a
      │                      structural convention, or a page-layout fact
      │                      plain text cannot express (§8). Still evidence.
      │                      lifecycleState starts 'observed'.
      ▼   HUMAN REVIEW ONLY — there is no code path that does this
HUMAN-APPROVED RULES         only an observation a human explicitly moves to
                             'approved' (with a written rationale) may ever
                             become authoritative context for Intelligence.
```

### The corpus is evidence. Extracted observations are not automatically organizational rules. Only human-approved knowledge may become authoritative context.

That sentence is the whole phase. It is enforced structurally, not by
convention (see §7).

---

## 3. Architecture

Mirrors every prior Intelligence phase: a pure ESM foundation under
`src/intelligence/`, a CJS mirror + server boundary under
`functions/src/intelligence/`, a pluggable backend so the store swap is a
registry selection.

### 3.1 ESM foundation — `src/intelligence/corpus/`

| File | Role |
|---|---|
| `contracts/corpus-document-contract.js` | `CorpusDocument` + vocabularies + the two status graphs + `corpusDocumentIdFromChecksum` |
| `contracts/corpus-observation-contract.js` | `CorpusObservation` + `OBSERVATION_MODALITY` / `OBSERVATION_CATEGORY` |
| `contracts/corpus-provenance-contract.js` | `CorpusProvenance` + `CorpusRegion` + `EXTRACTION_METHOD` / `COORDINATE_SPACE` |
| `contracts/observation-lifecycle-contract.js` | `observed → candidate → approved \| rejected → deprecated`; `approved` human-gated |
| `contracts/corpus-store-contract.js` | backend interface + `CorpusResult` envelope + `CORPUS_STORE_ERRORS` |
| `corpus-observation-record.js` | pure helpers: `observationIdFrom`, `makeObservationFromExtraction`, `mergeObservationOccurrence`, `advanceObservationLifecycle` |
| `backends/null-corpus-backend.js` | inert default — every method `NOT_IMPLEMENTED` |
| `backends/memory-corpus-backend.js` | in-process; real checksum dedup, real analysis graph, evidence accumulation |
| `backends/callable-corpus-backend.js` | thin adapter over the (staged) `intelligenceCorpus` function |
| `corpus-store.js` | THE facade — backend registry + events + the six delegating methods |
| `README.md` | the tree's own doc |

Re-exported from `src/intelligence/index.js` (the single import surface).
**Dormant:** the Null backend is active by default, so every call returns
`NOT_IMPLEMENTED`. The only `js/` module allowed to import
`src/intelligence/` is still `js/intelligence-backend-wiring.js`
(`intelligence-foundation-check.mjs` still passes).

### 3.2 Server boundary — `functions/src/intelligence/` (CJS)

| File | Role |
|---|---|
| `corpusContract.js` | byte-parity CJS mirror of the ESM contracts |
| `corpusStore.js` | server-owned persistence over an injected `db` (Admin SDK) — `isSafeCorpusId` / `sanitizeForRtdb` / `rehydrate*` / `orderByChild('ownerId')`, mirrors `norDraftStore.js` |
| `intelligenceCorpus.js` | HTTPS callable v2, region `asia-southeast1`, **NO secret** — auth → `canUseIntelligence(auth.token)` → owner = `auth.uid` → op switch → `{ ok, data, error }` envelope, `logger.info` metadata-only |

### 3.3 Storage nodes (STAGED — see §8)

| Node | Writer | Reader |
|---|---|---|
| `/intelligence_corpus_documents/{documentId}` | `intelligenceCorpus` (Admin SDK) — `.write: false` | owner (`ownerId === auth.uid`) + admin/developer/adminEquivalent |
| `/intelligence_corpus_observations/{observationId}` | same | same |

`documentId = corpus_<checksum>` (deterministic — a re-ingest of the same
bytes finds the same record). Rule blocks mirror
`/intelligence_nor_registry` byte-for-byte.

---

## 4. Corpus contract (final shape)

```
CorpusDocument {
  schema:           'corpus-document@1'
  documentId:       'corpus_<checksum>'          // deterministic — dedup identity (§12)
  sourceFileId:     string|null                  // preserved-original StoredFileRecord id (file:<sha256>)
  checksum:         string                       // content hash of the ORIGINAL bytes (required)

  documentType:     NOR | NOTA_ORGANISASI | MEMORANDUM | LEGACY | UNKNOWN
  typeConfidence:   0..1                          // classification confidence — NOT authority
  documentEra:      historical | current | transitional | unknown   // SEPARATE axis from type
  eraConfidence:    0..1                          // < 1 by construction when era is 'unknown' (§5)

  title, source, sourcePath, originalFilename, mimeType, language, sourceDate   // sourceDate = the doc's OWN date, never inferred from filename
  pageCount:        number|null                   // null = unknown; NEVER fabricated

  ingestionStatus:  pending | received | stored | duplicate | failed          // the FILE's journey
  analysisStatus:   pending | text_extracted | structure_extracted | visual_analyzed | completed | failed   // EXTRACTION progress — a THIRD, separate axis from organizational approval

  ownerId:          string|null                   // set server-side from auth.uid
  tenantId:         string|null                   // reserved owner/tenant boundary
  duplicateOfId:    string|null                   // a byte-identical re-arrival's earlier documentId

  createdAt, analyzedAt
  provenance:       { ingestedBy, ingestedAt, method, note }   // where the DOCUMENT came from
  classification:   public | internal | restricted             // DEFAULT 'restricted' — corpus is controlled org data
}
```

`documentType` deliberately keeps **NOR**, **Nota Organisasi**,
**Memorandum**, and **legacy/predecessor** distinct — the system must
eventually learn *what was historically used* vs *what is currently
preferred*, so it must not normalise them away (§4, §17). An
unclassifiable document is **`UNKNOWN`** with a confidence `< 1`; the
ambiguity is preserved, not rejected.

---

## 5. Observation contract (final shape)

```
CorpusObservation {
  schema:           'corpus-observation@1'
  observationId:    'obs_<doc>__<category>__<key>'   // deterministic — same evidence MERGES, doesn't duplicate
  documentId:       string                            // the CorpusDocument (required)

  category:         terminology | opening_pattern | closing_pattern | recipient_convention |
                    subject_convention | date_convention | attachment_convention | copy_convention |
                    signature_wording | body_structure | formal_tone | preferred_phrase |
                    organizational_term | structure | layout
  modality:         text | structure | visual          // the axis that separates §7 from §8
  key:              string                             // stable slug: 'recipient_label', 'signature_block', …

  observedValue:    string|null                        // HISTORICAL EVIDENCE — not preferredValue, not approvedValue
  normalizedValue:  null                               // ALWAYS null at this layer (§7 — normalisation is separate)
  observation:      object|null                        // opaque payload for structure/visual, e.g.
                                                       // { anchor:'bottom-right', alignment:'right', relativePagePosition:{x,y} }

  provenance:       CorpusProvenance[]                  // >= 1 REQUIRED (§6)
  confidence:       0..1                               // EXTRACTION/classification confidence — NOT authority (§10)
  occurrenceCount:  >= 1                               // how many times this exact value was seen

  lifecycleState:   observed | candidate | approved | rejected | deprecated   // starts 'observed'
  approvedBy:       string|null   \
  approvedAt:       string|null    >  present IFF lifecycleState === 'approved'
  preferenceRationale: string|null /  — human-written at approval, NEVER auto-generated

  createdAt, updatedAt
}
```

### How the separations are enforced (not just documented)

| Separation (§18) | Mechanism |
|---|---|
| `observed` ≠ `approved` | `isCorpusObservation` **rejects** any non-approved record carrying `approvedBy`/`approvedAt`/`preferenceRationale`; `makeCorpusObservation` strips them. You cannot fake an approved observation by setting a string. |
| `candidate` ≠ `approved` | `candidate` is not in `OBSERVATION_HUMAN_GATED_STATES`; only `approved` is authoritative. |
| `confidence` ≠ `authority` | `confidence` and `lifecycleState` are independent fields. A `confidence: 0.99` observation is still `lifecycleState: 'observed'`. The store persists **only** `observed`. |
| `documentType` ≠ organizational rule | `isKnowledgeItem(corpusDocument) === false`; `isKnowledgeItem(corpusObservation) === false`. Different schemas. |
| `historical` ≠ `current` | `documentEra` is a first-class field, separate from `documentType`. |
| processing state ≠ approval state | `analysisStatus` (a document field, §11) and `lifecycleState` (an observation field, §9) are different axes on different records. |

---

## 6. Provenance model — every observation traces to source (§6, §16)

```
CorpusProvenance {
  schema:            'corpus-provenance@1'
  sourceDocumentId:  string          // the CorpusDocument — REQUIRED, non-empty. An untraceable observation is invalid.
  sourceFileId:      string|null     // the preserved-original StoredFileRecord id
  pageNumber:        number|null     // 1-based; null = whole-document / not page-anchored
  region:            CorpusRegion|null
  extractionMethod:  text_layer | ocr | structure_parse | visual_analysis | manual | unknown
  extractedAt:       ISO 8601
  confidence:        0..1            // extraction/localisation confidence — NOT authority
}

CorpusRegion {
  x, y, width, height:  number|null           // null = UNKNOWN. Never 0, never a placeholder.
  coordinateSpace:      pdf_points | pixels | normalized | unknown
}
```

- `isCorpusObservation` requires `provenance.length >= 1` — an observation
  with no traceable origin is structurally invalid.
- `UNKNOWN_REGION` (every coordinate `null`, `coordinateSpace: 'unknown'`)
  is a valid region. A source that cannot supply geometry yields it —
  **no fabricated measurements** (§16).
- A `coordinateSpace` supplied with **no** coordinates is forced back to
  `'unknown'` — the contract will not let a record make a false claim of
  geometry.
- `mergeObservationOccurrence` accumulates a repeated sighting: it appends
  provenance, bumps `occurrenceCount`, and takes `confidence = max(...)`.
  It **never** touches `lifecycleState` — more evidence never promotes an
  observation (§9, §15).

---

## 7. Visual-analysis readiness (§16)

The contract already supports the future pipeline without a redesign:

```
PDF  →  render page  →  visual analysis  →  layout observations
```

- `OBSERVATION_MODALITY.VISUAL` + `OBSERVATION_CATEGORY.LAYOUT` classify a
  page-geometry observation.
- The `observation` field carries an opaque structured payload
  (`{ anchor, alignment, relativePagePosition, … }`) that plain text
  cannot express — logo placement, header geometry, margins, the
  No./Kepada/Dari/Perihal/Lampiran block position, signature-block
  position/alignment, line/paragraph spacing, page-break behaviour.
- `CorpusProvenance.region` (with a real `coordinateSpace`) anchors the
  observation to a page rectangle; `pageNumber` names the page.
- `CORPUS_ANALYSIS_STATUS` includes `visual_analyzed`, and the graph
  allows `pending → visual_analyzed` directly — a visual analyzer need
  **not** wait for a structure parser.

A later visual analyzer produces `CorpusObservation`s against this exact
contract and records them through `recordObservation` — no contract
change.

---

## 8. Security model

| Concern | How |
|---|---|
| Browser cannot write authoritative corpus records | RTDB `.write: false` on both nodes; the `intelligenceCorpus` Cloud Function (Admin SDK) is the only writer |
| Owner / tenant boundary | `ownerId` is **always** `request.auth.uid` server-side; per-record `.read` is `data.ownerId === auth.uid` (+ admin/developer/adminEquivalent). Cross-owner `get`/`observations`/`recordObservation`/`setAnalysisStatus` → a `FORBIDDEN` envelope |
| Who may use it at all | `canUseIntelligence(auth.token)` — the **same** effective-admin boundary (`role === 'admin' \|\| adminEquivalent === true`) as every other Intelligence callable (Phase 3C). NO new permission id, NO per-user grant |
| No client injection | the callable strips `ownerId` / `documentId` / `tenantId` / `ingestionStatus` / `analysisStatus` from an `ingest` payload, and `ownerId` / `lifecycleState` / `approvedBy` / `approvedAt` / `preferenceRationale` from a `recordObservation` payload. The client supplies **classification metadata only** |
| No secret | `intelligenceCorpus` is a region-pinned `onCall` with **no** `secrets:` binding. Static scan (`intelligence-corpus-check.cjs`) asserts no `sk-`, `OPENAI_API_KEY`, `api.openai.com`, or `process.env` in the three server files |
| No promotion path | there is **no** store method and **no** callable op that moves an observation toward `approved`. `advanceObservationLifecycle` (the pure helper) is not reachable through the store, and requires `humanApproved: true` + a written `preferenceRationale` |
| Audit | `logger.info` is annotated `METADATA ONLY` — never the observed text, a rationale, a body, a token, or a secret |
| Sensitivity | `CorpusDocument.classification` defaults to `restricted` — historical organizational documents are treated as controlled data |

### STAGED — not live

Per §20 this phase does **not** deploy:

- `intelligenceCorpus.js` is authored but **NOT** wired into
  `functions/index.js`.
- The two `database.rules.json` blocks ship in the repo but are **NOT**
  deployed.

Wiring `intelligenceCorpus` into `functions/index.js` **and** running
`firebase deploy --only database` is the first step of **Phase 5.x.2**,
with its own review (consistent with the project's "stage infra/security
changes behind their own review" discipline).

---

## 9. Human approval requirement (§9, §15)

```
ingested document
      ↓
observations (lifecycleState: 'observed')
      ↓   grouping of repeated evidence (a later sub-phase)
candidate convention
      ↓   HUMAN REVIEW — explicit actor + written preferenceRationale
approved preferred convention   ← ONLY this may become authoritative context
```

There is **no** code path `PDF → AI → approved rule`. Proven by:

- the corpus store's method set is exactly
  `ingestDocument / getDocument / listDocuments / getObservations /
  recordObservation / setAnalysisStatus` — no `approve` / `promote`.
- the callable's op set is `ingest / get / list / observations /
  recordObservation / setAnalysisStatus` — `approve` → `invalid-argument`.
- `recordObservation` (store **and** callable) forces `lifecycleState:
  'observed'` and strips injected approval fields.
- `advanceObservationLifecycle` refuses a move into `approved` unless
  `humanApproved === true` **and** `actorId` **and** a non-empty,
  human-written `preferenceRationale` are all present; and the graph
  forbids `observed → approved` outright (must pass through `candidate`).

A single anomalous document cannot override repeated evidence: an
observation is grouped by meaning (`observationIdFrom`), `occurrenceCount`
counts the corroboration, and only a human, seeing that count, may
approve.

---

## 10. Relationship to existing modules

| Module | Relationship |
|---|---|
| **Phase 5 NOR Registry** (`src/intelligence/nor-registry/`) | **Untouched.** The Registry is the canonical lifecycle record of an AI-*produced* NOR. The corpus is *historical input*. No shared node, no shared code, no import. |
| **Organizational Memory** (`src/organizational-memory/` `ArchiveRecord`) | Different axis. An `ArchiveRecord` is the organizational record of a **V1 Petty Cash NOR that already exists in production** (it snapshots that record's fields). A `CorpusDocument` is an **uploaded historical file** that predates / sits outside the V1 store. Both carry a content hash and a "duplicate of" notion; `isArchiveRecord(corpusDocument) === false`. |
| **Knowledge Platform** (`src/knowledge/` `KnowledgeItem`) | Downstream target. A `CorpusObservation` is **not** a `KnowledgeItem` and does **not** become one automatically. `observation-lifecycle-contract.js` mirrors the shape of `knowledge/contracts/lifecycle-contract.js` (states + graph + human-gated set) so a future promotion step is natural — but this phase builds no such step. |
| **File Storage** (`src/file-storage/` `StoredFileRecord`) | The preserved original bytes (`file:<sha256>`). `CorpusDocument.sourceFileId` points at it. This phase does not upload anything. |
| **V1 NOR generation** (`js/petty-cash/**`, `generateNor()`) | **Untouched.** No import, no call, no reference. Static scan enforced. |

---

## 11. Intentionally deferred (later sub-phases)

- production RAG retrieval; a vector database
- OpenAI ingestion / analysis calls
- PDF rendering + the visual analyzer itself
- the extraction engines (text / structure / visual → observations)
- grouping repeated observations into candidate conventions
- the human review workspace that walks `candidate → approved`
- automatic knowledge promotion / style-guide generation / template replacement
- wiring `intelligenceCorpus` into `functions/index.js` + deploying the rules (Phase 5.x.2)
- any UI
- a `corpus-retrieval.js` that reads **only** `approved` observations as authoritative context

---

## 12. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-corpus-contract-check.mjs` | contract validity + the mandatory separations (§18) + lifecycle human gate + evidence accumulation + dormant facade |
| `node scripts/intelligence-corpus-store-check.mjs` | facade + Memory backend: checksum dedup, analysis graph, `recordObservation` always `observed`, no approve method |
| `node scripts/intelligence-corpus-check.cjs` | CJS⇄ESM drift parity, server `corpusStore` over a fake db, the `intelligenceCorpus` callable auth/authz/ownership/no-injection matrix, static secret/V1/knowledge/feature-flag scan, `functions/index.js` staging assertion, rules-block assertions |

All three pass. All 20 `scripts/intelligence-*` checks pass. V1 + Knowledge
+ Organizational Memory + NOR + Petty Cash + permission/role regression
green (one pre-existing, unrelated failure: `rtdb-hardening-phases-2to7-check.mjs`
cannot `JSON.parse` the `//`-commented `database.rules.json` — fails
identically on a pristine tree).

---

## 13. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `/feature_flags/intelligence/enabled` still absent → OFF.
- Zero OpenAI calls. Zero production corpus mutations.
- `intelligenceCorpus` NOT in `functions/index.js`; corpus rule blocks NOT deployed.
- `git diff --stat`: `database.rules.json` (+25), `src/intelligence/index.js` (+16). 17 new files.
