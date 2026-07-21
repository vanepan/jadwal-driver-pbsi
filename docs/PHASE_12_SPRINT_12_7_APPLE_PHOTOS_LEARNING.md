# Phase 12 — Sprint 12.7: Apple Photos Learning (Recognition)

**Status:** Implemented, regression-tested, **NOT committed**.
**Version:** unchanged (`1.27.1`).
**Builds on:** the full `js/v2/` platform — `knowledge/`, `organizational-
memory/`, `body/` (Phase 12.5), `learning/` + `learning-bridge/` (Phase
12.6) — read as a cross-cutting peer, mirroring `problem-solving/`'s
"sees everyone" precedent, never nested inside any one of them.
**Scope:** one new, mostly-dormant cross-cutting domain, `js/v2/
recognition/` (28 files, ~2,220 lines), plus six small, additive,
backward-compatible changes to existing files (one new services-facade
export in `knowledge/`, five doc/observability hardening edits — see
Sprint 12.7.0). Zero behavior change to any of the 15 pre-existing
`learning-service.js` call sites, zero behavior change to any existing
document/entity engine. No UI. No live wiring into `conversation/`,
`reasoning/`, or `problem-intelligence/`. No LLM/AI/NLP/OCR anywhere in
this tree.

An architectural review (produced and approved before any code was
written — see this repository's own prior turn) reverse-engineered the
entire existing platform first: every clustering/similarity/duplicate/
relationship/explainability engine already in this codebase, the exact
registry/repository/service conventions every domain already follows, and
the two immediately-preceding phases (Body Intelligence, Universal
Learning Engine). That review is the reason this sprint reads as mostly
*connective tissue* rather than new invention — see §1.

---

## 1. What this sprint actually is (restated, because the brief invited a
    different mental model)

The brief's own framing ("Apple Photos Learning") suggested a largely new
capability. The reverse-engineering review found the opposite: this
platform already had real, working, tested prior art for almost
everything the brief asked for — exact-hash duplicate detection (twice),
Jaccard similarity (real and wired), single-linkage clustering (built,
dormant), two structurally-identical relationship-graph engines, and a
confidence/explainability formula reused three times running. The one
capability confirmed **genuinely absent** by direct audit was autonomous
content classification (Sprint 12.7.2). Everything else this sprint built
is a **generalization and connection** of what already existed, not a
parallel reimplementation — consistent with this codebase's own
twelve-phase-running "never duplicate" discipline.

Three honesty corrections came out of doing the work, in the same spirit
as Sprint 12.5's own correction about "Phase 11 Executive Intelligence"
not being a real, separate subsystem:

1. **"Semantic Clustering" (the brief's own Sprint 12.7.3 name) was
   renamed to "Structural Clustering"** (this sprint's real 12.7.4).
   Nothing in this tree performs natural-language/semantic analysis —
   every grouping is a deterministic threshold over a registered
   similarity strategy, preserving `js/v2/README.md`'s standing "No
   AI/LLM/OCR/NLP anywhere in this tree" invariant, which the brief's own
   "THIS IS NOT" section already independently demanded.
2. **The relationship-graph engine (Sprint 12.7.5) shipped simpler than
   originally sketched.** The approved architecture proposed a
   "node-resolver + edge-source callback" abstraction to keep it
   domain-agnostic. In practice, the cross-domain capability comes
   entirely from `RecognitionRelationship`'s own `fromScopeKey`/
   `toScopeKey` fields (which may already name scopes of any
   domainType/entityType) — the engine simply reads Recognition's own
   repository, the exact same pattern both of this platform's
   pre-existing graph engines already use for *their* storage. A
   callback-injected edge source would have added indirection with no
   real capability gained. Disclosed here, not silently substituted.
3. **A real, pre-existing bug was found in `learning/services/
   learning-service.js#record()`** (Sprint 12.7.6's own tests found it,
   not assumed): its synchronous return value is stale on `supersedesId`
   immediately after a supersession — the correct value is written to the
   repository a moment later and is correct on any subsequent read. This
   affects all 15 producers now calling `emitLearningSignal`/
   `recordLearningEvent`, not something this sprint introduced. Per this
   phase's own standing "zero edits to `learning-service.js`" discipline
   (mirrored from Phase 12.6, which held the same line through its own
   three real bug fixes elsewhere), **this was deliberately NOT patched**
   — Recognition's own check verifies correctness via re-fetch instead,
   and the underlying storage is confirmed correct. Named here as a real,
   scoped, future fix opportunity for whoever eventually revisits
   `learning-service.js` itself.

---

## 2. The one load-bearing design decision

Every existing domain is either purely editorial and single-owner
(Knowledge, Organizational Memory, Learning) or a pure, zero-write read
model (Body). Recognition is neither in isolation: its outputs are
durable, versioned, evidence-carrying facts exactly like Knowledge's
(editorial), but producing them requires reading across domains it does
not own — the same shape `problem-solving/` already solved. Recognition
is therefore a new, top-level peer at `problem-solving/`'s tier: depends
on `knowledge/`, `organizational-memory/`, `body/`, `document-
intelligence/` (read-only, services-only) and on `learning/` (may call
`emitLearningSignal()` directly, as a normal 15th producer — no bridge
domain required, unlike Body, because Recognition carries none of Body's
"must stay a pure zero-write peer" constraint). Nothing those domains own
may ever depend back on Recognition. Full graph in `js/v2/README.md` and
`js/v2/recognition/README.md`.

A Recognition finding is never a Decision — it answers "these things
*appear* related," never "therefore do X." Recognition has no
`lifecycle/` directory and invents no second human-gate; anything that
should become current, actionable truth still goes through Knowledge's
existing, unmodified, human-gated review workflow.

---

## 3. What was built, by sprint

### 12.7.0 — Import Pipeline Observability Hardening

Audited both existing import pipelines (Connector Acquisition,
`knowledge/acquisition/` + `knowledge/builder/`; Manual File Import,
`knowledge/datasets/import-session/` + `file-storage/` +
`ui/dataset-import-center.js`) against all eleven brief dimensions
(worker lifecycle, telemetry, realtime sync, dashboard accuracy, ETA,
throughput, uploaded bytes, knowledge-extraction visibility, evidence
visibility, worker utilization, concurrency, batch statistics). Finding:
nearly everything already existed, comprehensively, in
`performance-collector.js` + three RTDB-backed repositories +
`pipeline-scheduler.js`'s sweep telemetry. Three real, scoped gaps closed:

1. **Terminology disambiguation** (doc-only): this codebase already calls
   three unrelated things "worker" — a real browser Worker
   (`file-storage/worker-runtime.js`), an event-driven scheduler sweep
   (`pipeline-scheduler.js#sweepPipeline`, dashboarded as "Worker
   Health"), and a concurrent upload-pool async function
   (`ui/dataset-import-center.js#worker()`). Cross-referencing header
   comments added to all three, zero behavior change.
2. **Live worker-pool occupancy** (small, additive): `st.batchProgress`
   gained a real `busy` counter, incremented/decremented around
   `processOneFile()` (decrement in a path that runs on both success and
   failure, so a thrown error never leaves it stuck high), surfaced in
   the existing Developer-Mode progress line. Previously only the fixed
   `concurrency` *setting* was ever shown, never how many workers were
   actually busy right now.
3. **Recognition's future trigger point**: `organizational-memory/
   services/archive-service.js` gained `registerArchiveObserver(fn)` — an
   injected-callback pattern mirroring `pipeline-scheduler.js#
   registerArchiver` exactly, fired synchronously after every real Archive
   write. `archive-repository.js` is a plain in-memory Map (no RTDB), so
   no debounced cross-tab listener was needed — every one of the file's 8
   write functions now routes through two new internal wrappers
   (`writeCreate`/`writeAppendVersion`) so the notification is
   *exhaustive*, not best-effort. Zero live callers registered this
   sprint (dormant, by design).

**Regression:** `scripts/import-pipeline-observability-check.mjs` (new,
28/28) + zero change across `archive-ownership-check.mjs` (74/74),
`batch-performance-check.mjs` (28/28), `dataset-import-center-check.mjs`
(78/78), `import-batch-concurrency-check.mjs` (15/15),
`pipeline-state-machine-check.mjs` (78/78), `worker-runtime-check.mjs`
(7/7), `official-nor-archive-check.mjs` (11/11).

### 12.7.1 — Recognition Foundation

Stood up `js/v2/recognition/` — contracts, registries, repository,
service — mirroring Body Intelligence's own Foundation sprint structure
exactly. `RecognitionRecord` is the one envelope every finding is stored
as (`RECORD_TYPE`: signature/cluster/relationship/classification/
recommendation), the same domain-agnostic-envelope-with-discriminant-
field shape `KnowledgeItem` already established. Three genuine reuses,
not reinvention: `RecognitionScope` mirrors `LearningScope` in spirit and
field-naming but is kept a separate contract (forcing Recognition through
a field literally named `signalType` would have been an awkward,
ill-fitting import); `Evidence` and `RecommendationEvidence` are imported
directly from `knowledge/contracts/` as precedented pure leaves —
Recognition becomes, over the sprints below, the first real producer of
`Evidence`'s `STATISTIC` and `RELATIONSHIP` kinds and of
`RecommendationEvidence` itself, all three previously registered with
zero producers anywhere in this codebase.

**Regression:** `scripts/recognition-foundation-check.mjs` (new, 62/62 at
the time, later 63/63 after Sprint 12.7.5's additive registry entry —
see below) + zero change across `body-ownership-check.mjs` (15/15),
`learning-ownership-check.mjs` (66/66), `knowledge-ownership-check.mjs`
(56/56), `archive-ownership-check.mjs` (74/74),
`conversation-ownership-check.mjs` (80/80).

### 12.7.2 — Autonomous Classification

The one genuinely new capability. `classification-suggestion-engine.js#
suggestClassification(signals)` — pure, cite-or-abstain (mirrors
`reasoning-engine.js`'s `NO_APPLICABLE_KNOWLEDGE` discipline exactly):
suggests `domainType`/`kind`/NOR-Type from **already-registered**
vocabulary only, grouping corroborating signals by candidate before
scoring, never inventing a category. `classification-service.js` persists
only a real suggestion — an honest abstention is never written, the same
restraint `reasoning-engine.js`'s own no-applicable-knowledge path takes.

**Regression:** `scripts/recognition-classification-check.mjs` (new,
15/15) + `recognition-foundation-check.mjs`, `knowledge-ownership-check.mjs`
unchanged.

### 12.7.3 — Similarity Discovery

Generalized this platform's three independent similarity/duplicate
primitives into one dispatchable, never-throws Similarity Strategy
Registry (mirrors `js/prediction/prediction-provider.js`'s exact shape),
duplicating none of them: `'exact-hash'` (wraps the existing hash
mechanisms), `'field-overlap'` (delegates to
`knowledge/learning/similarity-detection-engine.js#computeSimilarity` —
cross-checked byte-identical against calling that engine directly), and
two genuinely new strategies sharing one pure Jaccard-over-sets primitive,
`'structural-shape'` and `'metadata-shape'`. One small, additive,
precedented change to `knowledge/`: a new `knowledge/services/
similarity-service.js` (pure delegation, mirrors `statistics-service.js`'s
own role) so Recognition's cross-domain dependency on `knowledge/` stays
"services-only," never a raw engine import.

**Regression:** `scripts/recognition-similarity-check.mjs` (new, 17/17,
including an exact-value cross-check against the real engine) + zero
change across `knowledge-ownership-check.mjs`, `learning-ownership-
check.mjs`, `dataset-import-center-check.mjs`.

### 12.7.4 — Structural Clustering (renamed — see §1)

`structural-clustering-engine.js#clusterScopes()` — single-linkage
clustering (join the first cluster where any member scores above
threshold via Sprint 12.7.3's dispatch, else start a new singleton),
mirroring `knowledge/machine-learning/clustering-engine.js#clusterItems`'s
exact algorithm shape without importing it (that engine takes
`KnowledgeItem[]` specifically; Recognition's own, more general
`{scopeKey, value}` input made citing the shape more honest than forcing
an adapter). Singleton "clusters" are excluded — no corroboration for one
item, the same rule `pattern-mining-engine.js` already enforces.
`clustering-service.js` persists real clusters with a deterministic id
from sorted membership, so re-deriving the identical cluster reconciles
via append rather than duplicating — and is this platform's first real
producer of `Evidence`'s `STATISTIC` kind.

**Regression:** `scripts/recognition-clustering-check.mjs` (new, 15/15) +
`recognition-similarity-check.mjs`, `recognition-foundation-check.mjs`
unchanged.

### 12.7.5 — Relationship Discovery

`recognition-graph-engine.js` — `getNeighbors`/`getSubgraph`/
`getGraphStats`, the **third** occurrence of this exact shape in this
codebase (after `knowledge/dependency-graph/knowledge-graph-engine.js`
and `body/graph/entity-relationship-graph-engine.js`), and per this
platform's own documented discipline ("a third copy is the trigger to
generalize, not clone a fourth time"), built genuinely node-type-agnostic
— proven, not just claimed, by a test constructing one graph spanning a
`nor` scope, a `vehicle` scope, and an `archive` scope together, something
neither predecessor engine can do. `relationship-discovery-engine.js`
discovers relationships from real Cluster co-membership only, and
assigns **only** the honest `CO_CLUSTERED` label (a new, additive
registry entry) — never one of the five richer, semantically-named types
(`SAME_VENDOR` etc.), because asserting a specific cause from a bare
structural match would be exactly the "invent business rules" fabrication
this platform's own discipline forbids. `graph-service.js` persists
discovered relationships with a symmetric, deterministic id.

A **stale assertion was found and fixed in this sprint's own regression
gate**, the same class of self-correction Sprint 12.6.7 performed once
already: `recognition-foundation-check.mjs`'s "exactly 5 relationship
types" assertion (written in Sprint 12.7.1, before `CO_CLUSTERED`
existed) was narrowed to "exactly 6," with a comment explaining why —
not silently left to rot.

**Regression:** `scripts/recognition-graph-check.mjs` (new, 18/18,
including a real-cycle termination proof and a bounded-maxHops proof) +
`recognition-foundation-check.mjs` fixed to 63/63, `knowledge-ownership-
check.mjs`/`learning-ownership-check.mjs` unchanged.

### 12.7.6 — Continuous Learning Refinement

Activated two Learning Signal categories Phase 12.6.1 bootstrapped as
honest, dormant vocabulary and named almost verbatim what this phase
produces: `document_structure_recurrence` and
`entity_relationship_recurrence`. `learning-emission-service.js#
emitRecognitionLearningSignal()` calls `emitLearningSignal()` directly —
**no bridge domain needed**, unlike Body, because Recognition is already
editorial and carries none of Body's zero-write-peer constraint; this is
the 15th ordinary producer of an already-generic entry point, not a 16th
bespoke mechanism. `sourceType: 'pattern-discovery'` reuses an existing,
bootstrapped Learning source-weight entry rather than inventing a new
one. `targetKey` is scoped to the RecognitionRecord's own id, so a
repeated observation of the *same* finding supersedes its own prior
signal (verified: exactly 1 historical + 1 current row), while two
different findings in the same domainType never collide. **Not
auto-invoked** from `clustering-service.js`/`graph-service.js` — real,
tested, directly callable, but whether Recognition should live-wire into
Learning automatically is Open Question 2 (§5), the same "structurally
complete, zero live callers" precedent Body's own bridge shipped under.

This is also where the pre-existing `learning-service.js` staleness (§1,
item 3) was found, disclosed, and deliberately left unpatched.

A **second stale assertion was found and fixed**, again mirroring Sprint
12.6.7's own precedent: `learning-signal-ownership-check.mjs`'s dormancy
scan ("nothing outside `learning/`/`learning-bridge/` imports the new
Phase 12.6 files") was narrowed to allowlist `js/v2/recognition/` by
name, with a comment pointing at `recognition-learning-emission-
check.mjs` as the authority on exactly what Recognition may import from
`learning/` — plus a new explicit positive check confirming Recognition's
own emission service imports only `emitLearningSignal`, mirroring the
scrutiny already given to `body-learning-bridge-service.js`.

**Regression:** `scripts/recognition-learning-emission-check.mjs` (new,
17/17) + `learning-signal-ownership-check.mjs` fixed to 11/11 (was 9/10),
`learning-ownership-check.mjs` (66/66), `body-ownership-check.mjs`
(15/15) unchanged.

### 12.7.7 — Production Validation

`scripts/recognition-ownership-check.mjs` (new, 12/12) — the same
two-part static-then-behavioral shape as `body-ownership-check.mjs`:
statically proves `recognition-repository.js`'s writers have exactly one
caller, no unlisted cross-domain import exists anywhere under
`recognition/` (an explicit allowlist of every precedented exception:
two contract leaves, one services-facade import, three vocabulary-only
registry reads, one `learning/` producer call), and nothing outside
`recognition/` imports it yet; behaviorally proves all 26 real
`recognition/` files import cleanly in plain Node with zero transitive
Firebase/V1 dependency (a genuine, checkable contrast to Body, whose 3
real sensors are *expected* to fail that same test) and that every prior
`recognition-*-check.mjs` still passes unmodified.

A full, repository-wide sweep of all 178 `scripts/*.mjs` (not a sample —
every script, the same methodology Sprint 11.12's own closing audit
used) was then run twice: once with a flawed pass/fail heuristic (a
first-pass bug in the sweep tooling itself, not the codebase — corrected
immediately), and once using each script's own documented exit-code
convention (`exit 0 = pass`). Final result: **172/178 pass, 6 fail — and
all 6 are byte-identical, by name and by failing-assertion-count, to the
six pre-existing failures Sprint 11.12's own closing audit already
documented and individually triaged as unrelated**:
`sarpras-home-experience-check.mjs` (13/14), `sarpras-workspace-
completion-check.mjs` (58/59), `learning-dashboard-today-check.mjs`
(4/6), `knowledge-acquisition-dom-check.mjs` (11/12),
`maintenance-intelligence-check.mjs`, `unified-scoring-dom-check.mjs`
(8/10). Re-verified by direct dependency grep (not assumed): none of the
six import anything this phase touched, except `sarpras-workspace-
completion-check.mjs`'s own pre-existing static `.includes()` string
checks against `dataset-import-center.js` — all of which target exact
string literals this phase's edits never touched, confirmed line-by-line.

**Zero regressions introduced by Phase 12.7, across all 8 sprints,
verified against the full repository, not a subset.**

---

## 4. Regression summary

| Check | Result |
|---|---|
| `scripts/import-pipeline-observability-check.mjs` (new — 12.7.0) | **28/28** |
| `scripts/recognition-foundation-check.mjs` (new — 12.7.1, later updated) | **63/63** |
| `scripts/recognition-classification-check.mjs` (new — 12.7.2) | **15/15** |
| `scripts/recognition-similarity-check.mjs` (new — 12.7.3) | **17/17** |
| `scripts/recognition-clustering-check.mjs` (new — 12.7.4) | **15/15** |
| `scripts/recognition-graph-check.mjs` (new — 12.7.5) | **18/18** |
| `scripts/recognition-learning-emission-check.mjs` (new — 12.7.6) | **17/17** |
| `scripts/recognition-ownership-check.mjs` (new — 12.7.7) | **12/12** |
| **New total** | **185/185** |
| `scripts/learning-signal-ownership-check.mjs` (updated — narrowed + 1 new check) | **11/11** (was 9/10 before the fix) |
| Full repository sweep, all 178 `scripts/*.mjs` | **172/178** — the 6 non-passing are the exact pre-existing failures Sprint 11.12 already documented; zero new regressions |

Three real, disclosed findings this sprint's own tests produced (not
assumed, not discovered later): a stale relationship-type-count assertion
(12.7.5), a stale learning-import dormancy assertion (12.7.6), and a
pre-existing staleness in `learning-service.js#record()`'s return value
(12.7.6, deliberately left unpatched — see §1).

---

## 5. What this is NOT (honest scope)

- **No cross-domain read has actually happened against real data.** The
  dependency edges into `knowledge/`, `organizational-memory/`, `body/`
  are legal and proven zero-Firebase-coupled, but every sprint exercised
  them only against synthetic fixtures. Assembling real
  `ClassificationSignal`s/signatures from real upstream engines (e.g.
  `metadata-inference-engine.js`'s real filename tokens) is a named,
  concrete future extension, not attempted here.
- **No UI, no live caller, anywhere.** Verified behaviorally
  (`recognition-ownership-check.mjs`), not just claimed.
- **`emitRecognitionLearningSignal()` is real but not auto-invoked** from
  `clustering-service.js`/`graph-service.js`.
- **Relationship Discovery only ever assigns `CO_CLUSTERED`**, never one
  of the five richer, semantically-named types — those await a
  more-evidenced producer or a human's confirmation.
- **The two pre-existing, node-type-specific graph engines were not
  migrated** onto the new generic one — a real, separate, future
  opportunity.
- **`learning-service.js#record()`'s stale-return-value bug was found and
  disclosed, not fixed** — per this phase's own standing discipline.
- **No LLM/AI/NLP anywhere in this tree**, now or ever.

## 6. Open questions (unchanged from the approved architecture review, now sharper)

1. Should Recognition ship fully dormant (this is what actually
   shipped — verified, not just intended) or should Sprint 12.7.6's
   emission service be wired live from a real Archive observer
   (Sprint 12.7.0's `registerArchiveObserver`, dormant and ready)?
2. Should `knowledge/observability/`'s Pipeline-A-scoped contracts and
   `performance-collector.js`'s Pipeline-B reality ever be unified?
3. Should the two pre-existing graph engines eventually migrate onto
   `recognition-graph-engine.js`?
4. Who has approval authority over a Recognition Recommendation once one
   is produced — the existing Knowledge-review role, or a new one?

---

## Files

**New domain — `js/v2/recognition/`** (28 files, ~2,220 lines):
- `contracts/{recognition-scope,recognition-record,recognition-signature,recognition-confidence,recognition-cluster,recognition-relationship,recognition-classification}-contract.js`
- `registry/{recognition-signature-type,recognition-relationship-type,recognition-recommendation-type}-registry.js`
- `repository/contracts/repository-contract.js`, `repository/implementations/{memory,null}-repository.js`, `repository/repository-registry.js`, `repository/recognition-repository.js`
- `classification/classification-suggestion-engine.js`
- `similarity/similarity-strategy-registry.js`
- `clustering/structural-clustering-engine.js`
- `graph/{recognition-graph-engine,relationship-discovery-engine}.js`
- `services/{recognition,classification,similarity,clustering,graph,learning-emission}-service.js`, `services/index.js`
- `index.js`, `README.md`

**New — `js/v2/knowledge/services/similarity-service.js`** (services-facade addition for Recognition's cross-domain dependency).

**Modified (small, additive, backward-compatible):**
- `js/v2/file-storage/worker-runtime.js`, `js/v2/knowledge/datasets/import-session/pipeline-scheduler.js`, `js/v2/ui/dataset-import-center.js` — "worker" terminology disambiguation + live occupancy counter (12.7.0)
- `js/v2/organizational-memory/services/archive-service.js` — `registerArchiveObserver` (12.7.0)
- `js/v2/knowledge/services/index.js` — `similarity` namespace added (12.7.3)
- `js/v2/README.md` — `recognition/`'s Layout + dependency-graph entries
- `scripts/learning-signal-ownership-check.mjs` — narrowed dormancy assertion + 1 new positive check (12.7.6, a stale-assertion fix, same class as Phase 12.6.7's own)

**New — check scripts (8 files, 185 assertions):**
- `scripts/import-pipeline-observability-check.mjs`, `scripts/recognition-foundation-check.mjs`, `scripts/recognition-classification-check.mjs`, `scripts/recognition-similarity-check.mjs`, `scripts/recognition-clustering-check.mjs`, `scripts/recognition-graph-check.mjs`, `scripts/recognition-learning-emission-check.mjs`, `scripts/recognition-ownership-check.mjs`

**New — this document:**
- `docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md`

Per this project's own standing discipline (every prior phase report):
nothing in this session was committed or pushed.
