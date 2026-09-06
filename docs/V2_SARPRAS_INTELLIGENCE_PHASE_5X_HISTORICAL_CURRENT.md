# V2 — Sarpras Intelligence Phase 5.x.3: Historical vs Current Convention

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Zero OpenAI calls. Zero production corpus mutations. No V1 change. No NOR
Registry change. No `database.rules.json` change. No new RTDB node. No
`functions/index.js` change.

Builds on Phase 5.x.1 (Corpus Acquisition Foundation) and Phase 5.x.2
(Corpus Ingestion & Document Analysis).

> **Corpus evidence does not automatically become organizational authority.**
> A historical document is evidence. It is not automatically a current rule.
> A convention that appears repeatedly in old documents does not, by itself,
> become "currently required" — and it never reaches the NOR generator
> without human review.

---

## 1. Purpose

A **read-only temporal interpretation layer** over corpus observations. It
answers two *separate* questions and refuses to guess when it cannot:

- **Where does the EVIDENCE for this convention sit in time?**
  `historical | current | transitional | unknown`
- **Does this observed convention look like the CURRENT convention, and how
  does it relate to an approved rule if one exists?**
  `aligned | historical_only | current_evidence | conflicting | possible_drift | insufficient_evidence`

It exists specifically to prevent this failure mode:

```
Historical Corpus → AI sees an old document → AI assumes it is current PBSI
policy → the NOR generator confidently reproduces an obsolete convention.
```

The layer is a derived analytical **view**. It never rewrites an
observation, never moves a lifecycle state, never creates an approval,
never modifies an approved rule, never writes a KnowledgeItem / template /
the Registry, and never calls a model.

---

## 2. Architecture

### 2.1 ESM temporal layer — `src/intelligence/corpus/temporal/` (pure, dormant)

| File | Role |
|---|---|
| `contracts/temporal-contract.js` | `TEMPORAL_CLASSIFICATION` (reuses the four `CORPUS_DOCUMENT_ERA` labels), `CONVENTION_STATUS` (the 6-item drift + applicability vocabulary), `TEMPORAL_EVIDENCE_FIELDS`, and the builders/validators for `ConventionTemporalEntry`, `ConventionConflict`, `DriftFinding`, `ConventionTemporalReport` |
| `temporal-windows.js` | `resolveTemporalWindows(config)` → the effective evidence windows (or "unconfigured"); `bucketSourceDate(sourceDate, windows)` → `historical \| current \| transitional \| unknown`. Reads **only** a canonical ISO `sourceDate` — never "now", never an upload/ingestion/filename/fs date |
| `convention-evidence.js` | `buildConventionEvidence({ observations, documents }, windows)` — groups observations the SAME way Phase 5.x.2 `groupObservations` does (`category \| key \| normalised value`), enriched with the temporal bucket of each contributing document's `sourceDate`: dated/undated counts, per-bucket counts, oldest/latest `sourceDate`, temporal spread. Links (`observationIds`, `documentIds`) preserved |
| `convention-currentness.js` | `classifyConventionEra(group, windows)` and `classifyConventionStatus(group, slotSiblings, config, windows, approvedRule?)` — pure, transparent classifiers; every result carries a human-readable `basis` |
| `temporal-input.js` | `buildTemporalInput(...)` assembles `{ observations, documents }`; `sanitizeApprovedRules(list)` strips a client-supplied rule to `{ category, key, value, ruleId }` — every other field (`approvedBy`, `authority`, `currentness`, …) is dropped |
| `convention-temporal-analyzer.js` | `analyzeConventionTemporal({ observations, documents, approvedRules }, config, { at })` → the `ConventionTemporalReport` (DATA ONLY) |

Re-exported from `src/intelligence/index.js`.

### 2.2 Config — `src/intelligence/corpus/corpus-analysis-config.js` (schema `@2`)

An **additive** `temporal` block on `DEFAULT_CORPUS_ANALYSIS_CONFIG`:

```
temporal: {
  historicalCutoff: null,        // ISO date; strictly before → historical evidence
  currentWindowStart: null,      // ISO date; on/after → current evidence
  transitionalOverlapDays: 0,    // widen the transitional band
  minCurrentDocuments: 2,        // distinct current-window docs required for `current_evidence`
  minHistoricalDocuments: 1,     // distinct historical-window docs required for `historical_only`
  conflictMinorityRatio: 0.34,   // a competing recent value holding >= this share → `conflicting`
}
```

Explicit, versionable (`@2`), deterministic. **When BOTH boundary dates
are null the windows are "unconfigured" and every convention is
`unknown` / `insufficient_evidence`.** If only the @1 `eraCutoverDate` is
set, both boundaries are derived from it (± the transitional band) — one
operator setting keeps working.

### 2.3 Server — `functions/src/intelligence/intelligenceCorpus.js` (CJS, STAGED, read-only)

Two new ops on the existing callable, both **read-only**:

- `temporalView` — gathers the caller's **own** corpus documents +
  observations server-side (`listByOwner` + `listObservations` by the
  verified `uid`), sanitises the client-supplied temporal `config` (to
  the windows block only) and `approvedRules` (to `{category,key,value,ruleId}`),
  and hands them to an **injected** temporal analyzer. Returns the report.
- `driftCheck` — the same, focused on one supplied `approvedRule`; returns
  only the `drift` findings.

The analyzer runner is `null` by default → both ops fail safe with
`TEMPORAL_UNAVAILABLE` and **mutate nothing**. Wiring it (running the pure
ESM analyzer inside the Function) is a Phase 5.x.3 **deploy** step with
its own review. `intelligenceCorpus` is **NOT** wired into
`functions/index.js`.

---

## 3. Document era vs convention applicability (§5)

| | Question | Where it lives | Set by |
|---|---|---|---|
| **documentEra** / `eraConfidence` | "When does this DOCUMENT belong?" | a field on `CorpusDocument` | Phase 5.x.2 `document-era-classifier` |
| **conventionEra** | "Where does the EVIDENCE for this convention sit?" | a field on `ConventionTemporalEntry` (derived) | Phase 5.x.3 `classifyConventionEra` — from the buckets of every document the convention was observed in |
| **conventionStatus** | "Does it look current? Does it drift from an approved rule?" | a field on `ConventionTemporalEntry` (derived) | Phase 5.x.3 `classifyConventionStatus` |

These are never conflated. `document.documentEra → observation.current` is
**not** done. A 2022 document is historical; a phrase in it can *also*
appear in 2026 documents and therefore have `current_evidence` — the two
answers are computed independently, and the evidence bag shows **both**
the historical and the current support.

---

## 4. Temporal model — how each label is determined

### conventionEra (evidence placement)
- windows unconfigured, or the convention has **0 dated documents** → `unknown`
- all dated documents in the current bucket → `current`
- all in the historical bucket → `historical`
- only transitional, or spanning buckets → `transitional`

### conventionStatus (currentness / drift) — evidence-based, in order
1. windows unconfigured, or 0 dated documents in the slot → `insufficient_evidence`
2. **conflicting** — within the current window the (category,key) slot has
   ≥ 2 distinct values, the slot total ≥ `minCurrentDocuments`, and the
   smallest value's share ≥ `conflictMinorityRatio`
3. a competing recent value exists but the slot total < `minCurrentDocuments`
   → `insufficient_evidence` (too little recent evidence to call either)
4. **current_evidence** — this value alone has ≥ `minCurrentDocuments`
   distinct current-window documents (→ `aligned` if an approved rule for
   this slot matches this value)
5. **possible_drift** — this value *is* an approved rule, but ≥
   `minCurrentDocuments` recent documents use a *different* value while
   this one has fewer
6. **historical_only** — 0 current-window documents and ≥
   `minHistoricalDocuments` historical ones (the `basis` notes a possible
   replacement if a sibling value has current evidence)
7. otherwise → `insufficient_evidence`

**Frequency alone is never enough** (§9). Historical frequency alone is
insufficient. There is no model-confidence input at all.

---

## 5. Multi-document corroboration (§7)

Every `ConventionTemporalEntry.evidence` bag carries the transparent
components — no black-box score (§13):

```
documentCount           datedDocumentCount        undatedDocumentCount
historicalDocumentCount  currentDocumentCount      transitionalDocumentCount
oldestSourceDate         latestSourceDate          temporalSpreadDays
recentDocumentCount      conflictingDocumentCount
approvedRulePresent      approvedRuleMatches
```

Recent evidence matters: `current_evidence` needs recent *distinct
documents*, not raw frequency. Conflicting evidence is never hidden — it
is surfaced as `conflictingDocumentCount` and as a `ConventionConflict`
entry.

---

## 6. Conflict handling (§8)

When a (category, key) slot has ≥ 2 distinct values that both have recent
evidence, the report adds a `ConventionConflict` with **both sides kept in
full** — each side is its own `ConventionTemporalEntry` with its own
evidence and its own `basis`. Nothing is overwritten, deleted, or merged
into one "best" phrase. Example:

```
opening_pattern | opening_salutation
  "Dengan hormat,"          historical: 12 docs   current: 1 doc    → historical_only
  "Sehubungan dengan ..."   historical: 0 docs    current: 4 docs   → current_evidence
  (a human decides — the corpus does not)
```

---

## 7. Drift detection (§11) — read-only, authority-preserving

`analyzeConventionTemporal` accepts `approvedRules` — pointers to
**already-existing** human-approved conventions, each `{ category, key,
value, ruleId }`. For each it produces a `DriftFinding`:

- `status` — one of the six `CONVENTION_STATUS` values relative to recent
  corpus evidence
- `approvedConventionEvidence` — the temporal entry for the approved value,
  if the corpus has any
- `competingEvidence` — recent corpus entries for a *different* value in
  the same slot
- **`ruleUnchanged: true` — ALWAYS.** This layer reads the approved rule
  and never creates, modifies, deprecates, or overwrites it.

`possible_drift` means *a human should look* — it never triggers an
automatic replacement.

---

## 8. `unknown` / `insufficient_evidence` are first-class (§15)

The layer returns `unknown` / `insufficient_evidence` — never a forced
guess — when: no configured windows, no canonical `sourceDate` on any
document, conflicting evidence below the threshold, too few recent
documents, or an ambiguous spread. `undatedDocumentCount` is reported
honestly; an undated document is **never** assigned a bucket.

---

## 9. Source-date safety (§14)

The temporal layer reads **only** `CorpusDocument.sourceDate` (the
canonical, content-derived date from Phase 5.x.2). It never reads an
upload date, an ingestion / `createdAt` / `analyzedAt` timestamp, a
filename, or a filesystem timestamp. Test fixtures F and G prove this: a
"NOR_2026_…" filename over a 2022-dated document → classified as 2022; an
old document ingested today → stays historical, never becomes current.

---

## 10. Approved-rule interaction (§10)

- An approved rule, when supplied, is a **read-only** comparison input.
- This phase does **not** automatically create an approved rule, does
  **not** modify one, and does **not** overwrite one from corpus
  evidence.
- Corpus evidence may *identify* corroboration (`aligned`), conflict
  (`conflicting`), staleness (`historical_only`), or a possible
  replacement (`possible_drift`) — a human decides.

---

## 11. Observation-lifecycle safety (§16)

- The layer emits its analytical entries with `conventionEra` /
  `conventionStatus` on a **separate derived object**, never on the
  `CorpusObservation`.
- No code path here performs `observed → approved` or `candidate →
  approved`.
- No code path here creates `approvedBy` / `approvedAt` /
  `preferenceRationale` (verified: the serialised report contains none of
  those keys).
- Source observations are read and left byte-identical (still
  `lifecycleState: 'observed'`).

---

## 12. Security (§19)

- **Authorization** — `canUseIntelligence(auth.token)` (`role === 'admin'
  || adminEquivalent === true`), unchanged. No new permission.
- **Owner isolation** — `temporalView` / `driftCheck` gather corpus data
  **only** for the verified `request.auth.uid`. Another user's documents
  and observations are never visible (verified: alice's view sees exactly
  her 5 documents; bob's sees exactly his 1).
- **No client trust** — the client cannot supply the corpus, an
  `ownerId`, a pre-computed `view`, an authority, or a currentness. A
  `documents` / `observations` / `view` field on `request.data` is
  ignored; the server builds the corpus itself. The temporal `config` is
  sanitised to the windows block; `approvedRules` are sanitised to
  `{category,key,value,ruleId}`.
- **Read-only** — the temporal branch calls **no** `corpusStore` write
  method (statically asserted). The database is byte-identical after a
  `temporalView` / `driftCheck` call.
- **No secret / model / outbound HTTP / V1 / knowledge / feature-flag**
  coupling in the temporal server code (statically scanned).
- `logger.info` is METADATA ONLY.

---

## 13. Non-goals / deferred

- wiring `intelligenceCorpus` into `functions/index.js` + `firebase
  deploy` (running the pure analyzer inside the Function) — Phase 5.x.3
  deploy step
- any persistent derived temporal-analysis store or new RTDB node (a pure
  layer is sufficient today — §20)
- creating or modifying a human-approved rule, a KnowledgeItem, a
  template, the NOR generator, the NOR Registry, or a published NOR (§17)
- feeding the temporal view into the NOR generator (that consumption
  happens only *after* human review promotes a convention)
- any UI
- any OpenAI use (§18 — a deterministic layer decides that 2022 is older
  than 2026)

---

## 14. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-corpus-temporal-check.mjs` | fixtures A–H (§21); windows configured vs unconfigured; `unknown`/`insufficient` first-class; document era ≠ convention applicability; determinism (input-order-independent, byte-identical); no lifecycle move / no approval created; links preserved; `sanitizeApprovedRules` / `buildTemporalInput` |
| `node scripts/intelligence-corpus-temporal-check.cjs` | `temporalView` / `driftCheck` auth+authz+op; fail-safe `TEMPORAL_UNAVAILABLE` (0 writes); owner isolation (only the caller's corpus, client-supplied corpus/owner/view ignored); read-only (DB byte-identical); approved rule sanitised + never persisted; end-to-end `possible_drift` with the real analyzer injected; static secret/model/HTTP/V1/knowledge/flag scan; `functions/index.js` staging assertion |

Both pass. All 26 `scripts/intelligence-*` checks pass. Knowledge +
Organizational Memory + Document Intelligence + NOR + Petty Cash +
permission/role + RTDB-functions + V1-domain regression green. One
pre-existing, unrelated failure: `rtdb-hardening-phases-2to7-check.mjs`
cannot `JSON.parse` the `//`-commented `database.rules.json` (identical on
a pristine tree; not touched — §23).

---

## 15. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `/feature_flags/intelligence/enabled` still absent → OFF.
- Zero OpenAI calls. Zero production corpus mutations.
- `intelligenceCorpus` NOT in `functions/index.js`. `database.rules.json`
  **unchanged** by 5.x.3 (no new node). `functions/index.js` unchanged.
- `git diff --stat` (over the uncommitted 5.x.1 + 5.x.2 + 5.x.3 working
  tree): `database.rules.json` (+25, from 5.x.1), `src/intelligence/index.js`
  (+68). Phase 5.x.3 adds 6 ESM temporal modules + 2 check scripts + this
  doc (~1,400 lines) and ~180 lines to the STAGED `intelligenceCorpus.js`.
