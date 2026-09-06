# V2 — Sarpras Intelligence Phase 5.x.4: Organizational Writing Memory

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Zero OpenAI calls. Zero production corpus mutations. No V1 change. No NOR
Registry change. No `database.rules.json` change. No new RTDB node. No
`functions/index.js` change.

Builds on Phase 5.x.1 (Corpus Acquisition Foundation), 5.x.2 (Corpus
Ingestion & Document Analysis), and 5.x.3 (Historical vs Current Convention).

> **Organizational Writing Memory describes observed and reviewed evidence
> about PBSI writing patterns. It does not automatically constitute
> organizational policy.**

---

## 1. Purpose

A structured, retrievable **Layer 3** in the chain:

```
Historical Corpus → CorpusDocument → Document Analysis → CorpusObservation →
Historical/Current Interpretation → ORGANIZATIONAL WRITING MEMORY →
Human Review → Approved Organizational Rule → (future) RAG / Generator
```

It summarises *how PBSI documents are actually written* — terminology,
openings, closings, recipient/subject/date/attachment/copy conventions,
signature wording, recurring body structures, formal-tone patterns — as
**evidence-backed entries**, without pretending any pattern is policy.

**The key boundary: `OBSERVATION ≠ MEMORARY ≠ AUTHORITY`.** A phrase can be
observed, become a candidate memory, be corroborated by recent documents,
and conflict with an existing rule — none of that alone makes it an
official PBSI rule. Human approval remains the authority boundary.

---

## 2. Architecture

### 2.1 ESM writing-memory layer — `src/intelligence/corpus/writing-memory/` (pure, dormant)

| File | Role |
|---|---|
| `contracts/writing-memory-contract.js` | `WRITING_MEMORY_CATEGORIES` (the **language** subset of `OBSERVATION_CATEGORY` — `structure` / `layout` are OUT, §4), `WRITING_AUTHORITY_STATE` + `PRODUCIBLE_AUTHORITY_STATES` (`['observed','candidate']` — §8), `DOCUMENT_TYPE_SCOPE` (real types + `cross_type`), `WRITING_MEMORY_EVIDENCE_FIELDS`, `memoryIdFrom`, `makeWritingMemory` / `isWritingMemory`, `makeWritingMemoryConflict`, `makeWritingMemoryReport` / `isWritingMemoryReport` |
| `writing-memory-builder.js` | `buildWritingMemory({ observations, documents, approvedRules }, config, { at })` — the ONE deterministic transformation |
| `writing-memory-query.js` | pure, read-only retrieval: `queryWritingMemory(report, filter)` + named helpers (`getWritingConventionsForType`, `getCurrentEvidence`, `getHistoricalOnly`, `getPreferredTerminology`, `getRecipientConventions`, `getSubjectConventions`, `getConflicts`, `getPossibleDrift`, `getAligned`) |

Re-exported from `src/intelligence/index.js`.

### 2.2 Server — `functions/src/intelligence/intelligenceCorpus.js` (CJS, STAGED, read-only)

One new op, `writingMemory` — read-only: gathers the caller's **own**
corpus (`listByOwner` + `listObservations` by the verified `uid`),
sanitises the client config (temporal windows + `candidateMinDocuments`
only) and `approvedRules` (to `{category,key,value,ruleId}`), hands them to
an **injected** builder. Returns the report **after stripping any entry
that is not `observed` / `candidate`** (defence in depth — §8, §23). The
builder is `null` by default → `WRITING_MEMORY_UNAVAILABLE`, nothing
written. `intelligenceCorpus` is **NOT** wired into `functions/index.js`.

### 2.3 Storage

**None.** Per §22 this phase ships a pure builder; a persistent derived
store is not required. No RTDB node, no `database.rules.json` change.

---

## 3. Memory contract

```
WritingMemory {
  schema:              'writing-memory@1'
  memoryId:            'mem_<scope>__<category>__<keySlug>__<fnv1a(normalisedValue)>'   // deterministic — §24
  category:            WRITING_MEMORY_CATEGORIES   // language only — §4
  key:                 string                      // the observation `key` slug
  value:               string                      // the VERBATIM observed wording — §6 (non-empty; required — §5/§6)
  normalizedValue:     string|null                 // a SEPARATE analytical field — §6
  documentType:        DOCUMENT_TYPE_SCOPE.*        // a real type, or 'cross_type' — §11/§12
  temporalStatus:      CONVENTION_STATUS.*          // consumed from Phase 5.x.3 — §7
  conventionEra:       TEMPORAL_CLASSIFICATION.*    // historical | current | transitional | unknown
  evidence: {                                       // transparent — no black-box score — §19
    documentCount, recentDocumentCount, historicalDocumentCount, transitionalDocumentCount, undatedDocumentCount,
    occurrenceCount, oldestSourceDate, latestSourceDate, temporalSpreadDays,
    documentTypeDistribution: { NOR: n, MEMORANDUM: n, LEGACY: n, ... },   // NEVER collapsed — §13
    conflictingDocumentCount, approvedRulePresent, approvedRuleMatches,
  }
  confidence:          0..1                         // observation confidence — NOT authority — §18
  authorityState:      'observed' | 'candidate'     // NEVER 'approved' — §8
  sourceObservationIds: string[]  (>= 1 — §5)
  sourceDocumentIds:    string[]  (>= 1 — §5)
  createdAt, updatedAt
}
```

`isWritingMemory` **rejects** an entry with zero evidence, no verbatim
`value`, or an `authorityState` of `approved` (or anything outside
`observed` / `candidate`). `makeWritingMemory` coerces a stray `approved`
to `observed`.

`WritingMemoryReport` = `{ schema, generatedAt, temporalConfigured,
entries[], conflicts[], drift[], summary }`. `summary.approved` is always
`0`. Every `drift` finding carries `ruleUnchanged: true`.

---

## 4. Evidence model (§5, §6, §19)

- **Evidence-backed or not persisted (§5):** an entry requires ≥ 1
  `sourceObservationId` and ≥ 1 `sourceDocumentId`. "Which documents
  demonstrated this?" is always answerable.
- **Verbatim wording preserved (§6):** `value` is the
  lexicographically-first *distinct raw* `observedValue` among the source
  observations (deterministic, input-order independent). `normalizedValue`
  is a separate field. The full set of raw forms is recoverable via
  `sourceObservationIds`.
- **Transparent components (§19):** no `styleScore` / `memoryScore` /
  `authorityScore`. `confidence` is the max source-observation confidence
  and is explicitly *not* authority (§18) — an entry can be
  `confidence: 0.99, authorityState: 'observed'`.

---

## 5. Temporal integration (§7, §15)

The builder **consumes** the Phase 5.x.3 analyzer (`analyzeConventionTemporal`)
— it never re-derives temporal logic. It runs the analyzer:

- **once for the full writing-observation set** → the type-agnostic
  `ConventionTemporalEntry` per group, plus `conflicts` and `drift`;
- **once per document-type slice** (NOR, NOTA_ORGANISASI, MEMORANDUM,
  LEGACY, UNKNOWN) → the temporal placement *within that type*.

Each `WritingMemory` entry's `temporalStatus` / `conventionEra` / dated
counts come straight from the matching temporal entry:

| `temporalStatus` | meaning |
|---|---|
| `historical_only` | dated evidence, all historical, none recent |
| `current_evidence` | ≥ `minCurrentDocuments` distinct recent documents |
| `transitional` | (era) evidence spans the windows |
| `conflicting` | recent documents disagree among themselves |
| `possible_drift` | this value *is* an approved rule but recent corpus favours another |
| `aligned` | an approved rule for this slot matches this value + it has current evidence |
| `insufficient_evidence` | no configured windows, no dated evidence, or too little |

`unknown` / `insufficient_evidence` are first-class — with no configured
windows every entry is `insufficient_evidence` / `unknown` (§15).

---

## 6. Document-type scope (§11, §12, §13)

Primary grouping is `(category, key, normalisedValue, documentType)` — so
a Memorandum phrase produces a `MEMORANDUM`-scoped entry, **never** a NOR
convention. A LEGACY-only opening keeps `documentType: 'LEGACY'`.

When the same `(category, key, value)` appears in **≥ 2 real document
types**, an additional **`cross_type`** entry is produced, carrying the
full per-type `documentTypeDistribution` (e.g. `{ NOR: 8, MEMORANDUM: 5,
LEGACY: 12 }` — never one number, §13). It is explicitly scoped
`cross_type` so it is never mistaken for a single-type rule.

---

## 7. Conflict handling (§14)

When a `(category, key)` slot has ≥ 2 distinct values in recent use, the
report adds a `WritingMemoryConflict` for that scope with **both sides
kept in full** — each side carries its own `memoryId`, verbatim `value`,
`temporalStatus`, `conventionEra`, and `evidence`. Nothing is chosen,
merged, or normalised into one "best" phrase. Conflicts are emitted per
real type *and* `cross_type`.

---

## 8. Candidate generation (§9)

`authorityState = 'candidate'` when a group's `documentCount >=
config.candidateMinDocuments` (the existing Phase 5.x.2 threshold, default
3); otherwise `'observed'`. `candidate` means *strong enough evidence for
a human to review* — **not** "official PBSI standard", and **not**
"current" (an entry can be `candidate` + `insufficient_evidence` +
`unknown`). This phase **never** produces `approved` — no code path, and
`makeWritingMemory` / `isWritingMemory` enforce it.

---

## 9. Approved-rule integration & drift (§10, §16, §17)

`approvedRules` — pointers to **already-existing** human-approved
conventions (`{category, key, value, ruleId}`) — are passed straight to
the Phase 5.x.3 analyzer as **read-only** reference. They are:

- used to set an entry's `temporalStatus` to `aligned` / `possible_drift`
  and its `evidence.approvedRulePresent` / `approvedRuleMatches`;
- surfaced in `report.drift[]` (the analyzer's `DriftFinding`s, passed
  through with `ruleUnchanged: true` forced);
- **never** copied into a `WritingMemory` entry as if approved here — the
  drifting/aligned entry stays `observed` / `candidate`;
- **never** replaced, modified, deleted, deprecated, or superseded.

A `possible_drift` finding carries the approved rule (echoed as
`{category,key,value,ruleId}` — hostile fields dropped), the competing
recent evidence, and `ruleUnchanged: true`.

---

## 10. Retrieval interface (§20, §21)

`writing-memory-query.js` — pure functions over a `WritingMemoryReport`:

- `queryWritingMemory(report, { category, documentType, temporalStatus, conventionEra, authorityState, key, candidatesOnly, approvedRulePresent })` → a new array, sorted by `memoryId`, entries are the frozen originals (provenance intact)
- `getWritingConventionsForType(report, 'NOR')` → NOR + `cross_type` scope only (never leaks a Memorandum-only entry)
- `getCurrentEvidence`, `getHistoricalOnly`, `getPreferredTerminology`, `getRecipientConventions`, `getSubjectConventions`, `getConflicts`, `getPossibleDrift`, `getAligned`

Deterministic, read-only, scope-aware, provenance-preserving. **Not
connected to the NOR generator.** No RAG. No OpenAI. This is the interface
a later phase will consume.

---

## 11. Security (§23)

- **Authorization** — `canUseIntelligence(auth.token)` (`role === 'admin'
  || adminEquivalent === true`), unchanged. No new permission.
- **Owner isolation** — `writingMemory` gathers corpus data **only** for
  the verified `request.auth.uid`. Verified: alice's build sees exactly
  her 4 documents; bob's sees exactly his 1.
- **No client trust** — a client-supplied `documents` / `observations` /
  `entries` / `ownerId` / `authorityState` is ignored; the server builds
  the corpus itself. Config is sanitised to the temporal windows +
  `candidateMinDocuments`; `approvedRules` to `{category,key,value,ruleId}`.
- **Never `approved`** — even a hostile injected builder returning an
  `approved` entry with `approvedBy` is stripped server-side before the
  response.
- **Read-only** — the `writingMemory` branch calls **no** `corpusStore`
  write method (statically asserted); the database is byte-identical
  after a call.
- **No secret / model / outbound HTTP / V1 / knowledge / feature-flag**
  coupling (statically scanned). The ESM writing-memory tree imports only
  the corpus + temporal contracts, the temporal analyzer, and the
  analysis config.

---

## 12. Idempotency & determinism (§10, §24)

Same observations + same config ⇒ **byte-identical** `WritingMemoryReport`
(verified: input-order reversed → identical; run twice → identical).
`memoryId` is `mem_<scope>__<category>__<keySlug>__<fnv1a(normValue)>` —
stable, no duplicates. `at` is pinnable.

---

## 13. Non-goals / deferred

- wiring `intelligenceCorpus` into `functions/index.js` + `firebase
  deploy` — a later step with its own review
- any persistent writing-memory store or new RTDB node (§22)
- production RAG integration; sending writing memory to a model (§21)
- wiring writing memory into NOR generation / making the model
  automatically consult it (§21)
- creating / modifying a human-approved rule, a KnowledgeItem, a template,
  the NOR generator, the NOR Registry, or a published NOR
- visual/layout memory (that is the future template/style system — §4)
- any production UI (§27)

---

## 14. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-corpus-writing-memory-check.mjs` | fixtures A–I (§25); contract (evidence-backed, verbatim, never `approved`); §4 category filtering (layout/structure OUT); document-type scope + `cross_type` distribution; conflicts kept both sides; approved-rule aligned/drift with `ruleUnchanged`; confidence ≠ authority; unconfigured → unknown/insufficient; determinism; retrieval (category / documentType / temporal filters, provenance retained); source observations untouched; 0 `approved` anywhere |
| `node scripts/intelligence-corpus-writing-memory-check.cjs` | `writingMemory` op auth/authz/op; fail-safe `WRITING_MEMORY_UNAVAILABLE` (0 writes); owner isolation (only the caller's corpus; client-supplied corpus/owner/entries ignored); read-only (DB byte-identical); a hostile injected `approved` entry is stripped; end-to-end `possible_drift` with the real builder; static secret/model/HTTP/V1/knowledge/flag scan; the branch calls no write; `functions/index.js` staging assertion |

Both pass. All 28 `scripts/intelligence-*` checks pass. Knowledge +
Organizational Memory + Document Intelligence + NOR + Petty Cash +
permission/role + RTDB-functions + V1-domain regression green. One
pre-existing, unrelated failure: `rtdb-hardening-phases-2to7-check.mjs`
(cannot `JSON.parse` the `//`-commented `database.rules.json`; identical
on a pristine tree; not touched — §26).

---

## 15. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `/feature_flags/intelligence/enabled` still absent → OFF.
- Zero OpenAI calls. Zero production corpus mutations. Zero automatic
  approvals. Zero knowledge promotions.
- `intelligenceCorpus` NOT in `functions/index.js`. `database.rules.json`
  **unchanged** by 5.x.4. `functions/index.js` unchanged.
- `git diff --stat` (over the uncommitted 5.x.1–5.x.4 working tree):
  `database.rules.json` (+25, from 5.x.1), `src/intelligence/index.js`
  (+84). Phase 5.x.4 adds 3 ESM writing-memory modules + 2 check scripts +
  this doc (~1,200 lines) and ~50 lines to the STAGED
  `intelligenceCorpus.js`.
