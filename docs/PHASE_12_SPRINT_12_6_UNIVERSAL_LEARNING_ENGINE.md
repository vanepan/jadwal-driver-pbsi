# Phase 12 — Sprint 12.6: Universal Learning Engine

**Status:** Implemented, regression-tested, NOT committed.
**Version:** unchanged (`1.27.1`).
**Builds on:** `js/v2/learning/` (Phase 5) as an additive extension, and
`js/v2/body/` (Phase 12.5) as a read-only bridge target — a genuinely new
sibling domain, `js/v2/learning-bridge/`, mediates between them.
**Scope:** additive only. Zero behavior change to any of the 14 existing
`learning-service.js` call sites. One amended contract file (`+1` enum
value). No V1 changes. No UI. No live wiring into Reasoning/Problem-Solving.
No scheduler for the Body bridge. No AI/ML calls anywhere in this tree.

---

## Why this sprint

Every domain in `js/v2/` generates experience — a Knowledge correction, a
Composer edit, a Body state change, a Reasoning recommendation — but until
this sprint those experiences were isolated: six domains had bespoke,
one-off call patterns into Learning; three (Reasoning, Problem Solving,
Body) had none at all. The brief asked for "learning as infrastructure" —
one universal capability every domain, present or future, can plug into
without writing its own learning mechanism.

The architectural review that preceded this sprint (produced and approved
before any code was written) found something the brief's own framing had
not accounted for: **this codebase already has a working `js/v2/learning/`
domain (Phase 5)** — including an already-generic `recordLearningEvent(seed)`
entry point every producer funnels through. A from-scratch "Learning
Engine" would have duplicated it, directly violating the brief's own "never
duplicate learning" philosophy. Everything built in this sprint is
additive: it extends what exists, fills the real, confirmed gaps, and
invents nothing that already works.

---

## What already existed, and what was genuinely missing

Verified by reading the real files, not assumed:

- `recordLearningEvent(seed)` was already a generic, working write path.
- Idempotency/supersession was already real: keyed by a caller-chosen
  `targetKey` + deep-equality of `after` and `evidence`.
- `explainLearningEvent(id)` already answered most of "explainability" —
  what/why/who/when, a cycle-safe supersession chain, lifecycle history.
- **`LEARNING_KIND` was a closed, hardcoded 5-value enum** — unlike
  `domainType`/`kind`/`entityType` elsewhere in this platform, it was not
  registry-backed. This was the core reason nothing was "pluggable."
- **No confidence field or computation existed on `LearningEvent` at all.**
- **Reasoning**: explicitly, pre-existingly documented as deferred —
  `reasoning/README.md` states outright that a Recommendation is never
  recorded as a LearningEvent, "explicitly out of scope."
- **Problem Solving / Problem Intelligence**: zero learning-service.js
  reference anywhere — a real, previously-unflagged gap.
- **Body Intelligence**: zero import of `learning/` by design — `body/`
  and `learning/` are mutually forbidden from importing each other's
  engines. Body's experience already accumulates independently via a
  pull-based sensing cycle, exposed through a confirmed-generic,
  safe-to-call read function.
- **Conversation** had already chosen a stated design philosophy worth
  respecting: `conversation/README.md` says a Conversation's real side
  effects are recorded by the domain that already owns that recording, at
  its own call site — push, not pull. Nothing in this sprint contradicts
  that; `conversation/` was not touched.

One documentation bug was also found and fixed as part of this sprint's
docs work: `js/v2/README.md`'s dependency graph granted
`conversation/, reasoning/, problem-intelligence/` a `may depend on body/`
edge, then three lines later listed the same three domains inside a
blanket `never depend on body/` line — a direct self-contradiction left
over from Phase 12.5's own README edit. `body/README.md`'s more specific
version was always correct; `js/v2/README.md` now matches it.

---

## The one load-bearing design decision

`learning/`'s own header states it "depends on nothing above it," and
`scripts/learning-ownership-check.mjs` **already mechanically enforces**
that nothing under `js/v2/learning/` imports a `knowledge/` or
`organizational-memory/` engine. `body/README.md` separately forbids
`learning/` from ever depending on `body/`. A single domain that both
extended `learning/`'s vocabulary *and* read `body/`'s telemetry could not
legally exist inside `learning/`'s current invariants without weakening
them — so this sprint shipped **two pieces**, not one:

- **Piece A**, additive, inside `js/v2/learning/` — pure vocabulary and
  pure computation only, zero new imports of any producer domain's engine.
- **Piece B**, a new, separate cross-cutting domain, `js/v2/learning-bridge/`
  — mirrors `problem-solving/`'s existing precedent as "the ONE layer
  allowed to see all," positioned as a peer, not nested inside either
  domain it bridges.

---

## What was built, by sprint

### 12.6.1 — Vocabulary

Six new contract files (`learning-scope`, `learning-signal`,
`learning-confidence`, `learning-recommendation`, `learning-lineage`, plus
the amended `learning-event-contract.js`) and two new registries
(`learning-signal-type-registry.js`, `learning-source-weight-registry.js`),
all mirroring this platform's exact conventions (`SCHEMA` consts, frozen
fields lists, `is<Thing>()` validators, Map-based registries with
register/get/has/list). `LEARNING_KIND` gained exactly one additive value,
`OBSERVATION` — surgical: `LEARNING_STATE`/`LEARNING_GRAPH` are keyed by
state not kind, `isLearningEvent()`'s kind check is a pure membership test
that silently widens, and none of the 14 existing call sites reference it.
`LearningScope` (`{domainType, entityType, entityId, signalType}` +
`scopeKey()`) is the one shared key every later engine agrees on for "same
thing," closing a gap prior North Star audits explicitly flagged
("KnowledgeItem has no type/entity-scoping field"). The signal-type
registry bootstraps the mission's own 8 named future-discovery categories
(repeated corrections, user behavior, operational habits, workflow
outcomes, recurring relationships, recurring document structures, implicit
business rules, emerging knowledge) as honest, dormant vocabulary —
registration is optional, enriching metadata, never a hard gate.

### 12.6.2 — Confidence

`learning-confidence-engine.js#computeSignalConfidence()` cites and
extends `knowledge/machine-learning/confidence-engine.js#suggestConfidence`'s
exact documented formula (`sourceWeight*0.6 + min(1,corroboration/3)*0.4`)
— reused as **arithmetic**, not as code (that file is a `knowledge/`
engine, not a bare contract leaf; `scripts/learning-ownership-check.mjs`
already fails any `learning/` file that imports one). Adds one new,
documented term that formula never needed: a contradiction penalty
(`- min(1,contradiction/3)*0.3`). A new `learning-source-weight-registry.js`
uses a **different id space** from Knowledge's own registry
(`human-correction=1.0`, `document-edit=0.9`, `pattern-discovery=0.7`,
`reasoning-outcome=0.8` reserved, `sensor-observation=0.6`, default `0.5`).
Confidence is observational metadata, never a persistence gate — every
structurally-valid signal is recorded regardless of its computed
confidence, the literal implementation of "never lose experience."

### 12.6.3 — Similarity + Conflict Detection

`learning-signal-similarity-engine.js` **reimplements** (not imports)
`knowledge/learning/similarity-detection-engine.js`'s ~10-line Jaccard
formula, for the same mechanical reason as the confidence engine — the
existing ownership check would fail the import. Used only as non-blocking,
informational dedup-candidate surfacing; the primary dedup defense for
identically-scoped signals remains `record()`'s own existing
`targetKey`+deep-equality no-op path, untouched.
`learning-conflict-detection-engine.js` is fresh, `LearningScope`-shaped —
exact-match on `scopeKey()`, exact-match on contradictory `after` values —
mirroring `archive-relationship-engine.js`'s bucket-then-pairwise *shape*
only (that engine's own code is hardcoded to ArchiveRecord's fields and
not reusable).

### 12.6.4 — The `emitLearningSignal` Pipeline

`learning-signal-service.js#emitLearningSignal(seed)` — the one new,
generalized entry point, threading Observe→Normalize→Validate→Merge→
Dedup→Conflict→Confidence→Persist→Explain together. Its **one and only
write** is the platform's existing, completely unmodified
`recordLearningEvent()` — verified by direct source inspection (exactly
one occurrence of the token, no other write-shaped token anywhere in the
file). "Merge" is deliberately *realized*, not duplicated: `record()`'s own
existing `targetKey`-based supersession chain **is** this pipeline's Merge
step, reused rather than re-implemented.

A real bug was found and fixed during this sprint's own testing, not
discovered later: the first implementation stuffed the freshly-computed
`confidence` object (which carries a `computedAt` timestamp) into the
persisted `evidence` field — since `evidence` differs on every call purely
from the timestamp, this silently broke `record()`'s own
`sameFact(current.evidence, evidence)` no-op check, meaning an *identical*
re-emitted signal would never be recognized as a no-op. Fixed by keeping
confidence/conflicts/dedup-candidates in the function's **return value**
only, never in the persisted row — which is in fact more consistent with
`LearningConfidence`'s own contract ("recomputed fresh... never itself
versioned") than the original design was.

### 12.6.5 — Recommendation, Outcome, Lineage

`learning-recommendation-engine.js#computeRecommendations()` — pure,
stateless, four deterministic rules, each citing only real, already-persisted
events (cite-or-abstain, same discipline `reasoning/`'s own Recommendation
enforces): `PROMOTE_TO_RULE` (a fact recurring across ≥N independent
entities), `FLAG_ANOMALY` (a minority disagreeing with an established
group consensus), `FLAG_FOR_REVIEW` (repeated touches on the same
`affectedKnowledgeId`), `MERGE_CANDIDATE` (similar facts across different
scopes). `LearningRecommendation` is explicitly disambiguated from
`reasoning/`'s own `Recommendation` (cites Approved KnowledgeItems,
answers "what should be done about *this* Problem, right now") — Learning's
version answers "based on repeated observation, what should a human
consider doing to the platform's own knowledge," a standing, scope-level
judgment. "Learning Rule" deliberately has **no separate contract** —
Knowledge's own `kind-registry.js` already registers `'rule'`; a standalone
`LearningRule` would be a third home for "what is a rule." It is instead
`recommendationType: 'promote_to_rule'`, pointing at Knowledge's existing
mechanism, never defining a competing one.

`learning-outcome-service.js#recordLearningOutcome()` is a thin wrapper
over `emitLearningSignal()` (the same pattern `recordCorrection`/
`recordGapResolution` already are) — the natural future home for
Reasoning's already-deferred "Recommendation → LearningEvent" wiring,
designed now, not wired live. A second real bug was found and fixed here:
the initial implementation let the outcome's `targetKey` default to the
recommendation's entity scope, meaning two *different* recommendations for
the *same* entity would collide and silently supersede each other's
outcomes. Fixed by scoping the outcome's `targetKey` to
`outcome:<recommendationId>` specifically.

`learning-lineage-engine.js#traceLineage(eventId)` — disambiguated from
Learning History (already real: `getLearningHistory`, answers "what
changed on this one row") by answering "where did this ultimately come
from and what did it become" across the whole pipeline. Explicitly
**composes** `explainLearningEvent()`'s existing cycle-safe chain walk
rather than re-implementing one.

### 12.6.6 — The Body Pull Adapter

`js/v2/learning-bridge/` — the one sprint that imports `body/`, living
entirely outside `learning/`. `adapters/body-signal-adapter.js` is a pure
mapping from `BodyEvent` to a `LearningSignal` seed (all 4 `BodyEvent`
types: `ENTITY_OBSERVED`, `STATE_CHANGED`, `RELATIONSHIP_OBSERVED`,
`SENSE_FAILED`). `services/body-learning-bridge-service.js#
pullBodyEventsAsSignals()` is the one impure orchestrator — reads
`body-event-repository.js#list()` (read-only, never `append()`), maps each
event, calls the same `emitLearningSignal()` any other domain would call
directly.

The plan's own risk analysis was verified directly, not just assumed:
`body-sensing-service.js` only emits `STATE_CHANGED` when `observedState`
actually differs, so the bridge only ever sees genuinely-changed events —
`record()`'s own dedup is a redundant second safety net for this producer,
not the primary defense. The load-bearing detail the plan flagged —
scoping by `(entityType, entityId, signalType)`, not the raw `BodyEvent`
id — turned out to already be `emitLearningSignal`'s own default
`targetKey` behavior (`scopeKey(signal.scope)`), so no special-casing was
needed in the adapter at all. Verified end-to-end: a repeated state change
for the same entity supersedes (exactly 2 rows: 1 historical + 1 current),
never accumulates unboundedly.

### 12.6.7 — Ownership + Documentation

`scripts/learning-signal-ownership-check.mjs` — same two-part
static-then-behavioral shape as `body-ownership-check.mjs`, asserting: no
new file imports a producer domain's engine; `learning-bridge/` imports
only `body-event-repository.js`'s `list`/`getForEntity`, never `append`;
`learning-signal-service.js` contains exactly one repository-touching call;
`learning-outcome-service.js` and `body-learning-bridge-service.js` both
route through `emitLearningSignal` only; nothing outside `learning/` or
`learning-bridge/` imports any Phase 12.6 file yet (dormancy); and — rather
than duplicating assertions — the **existing**
`scripts/learning-ownership-check.mjs` is re-run unmodified as a subprocess,
so its own 14-producer-callsite regression gate stays the single source of
truth for "nothing pre-existing broke."

`js/v2/README.md` was extended with `learning-bridge/`'s two new
dependency-graph edges and the self-contradiction fix noted above.

**A third real bug was found and fixed during this sprint's own final
regression pass, not before**: `scripts/body-ownership-check.mjs` (Phase
12.5's own ownership check) asserted "nothing outside `body/` imports
`body/`" — true when written, now stale, since `learning-bridge/` is a
deliberate, approved exception. Fixed by narrowing that one assertion to
allowlist `js/v2/learning-bridge/` by name (mirroring the allowlist-by-name
discipline this codebase already uses elsewhere), with a comment pointing
at `learning-signal-ownership-check.mjs` as the authority on exactly what
the bridge may import. `body-ownership-check.mjs` went from 14/15 to
15/15 after the fix.

---

## Regression

| Check | Result |
| --- | --- |
| `scripts/learning-signal-vocabulary-check.mjs` (new — 12.6.1) | **37/37 pass** |
| `scripts/learning-confidence-check.mjs` (new — 12.6.2) | **12/12 pass** |
| `scripts/learning-signal-dedup-check.mjs` (new — 12.6.3) | **13/13 pass** |
| `scripts/learning-signal-pipeline-check.mjs` (new — 12.6.4) | **21/21 pass** |
| `scripts/learning-recommendation-lineage-check.mjs` (new — 12.6.5) | **22/22 pass** |
| `scripts/learning-bridge-check.mjs` (new — 12.6.6) | **17/17 pass** |
| `scripts/learning-signal-ownership-check.mjs` (new — 12.6.7) | **10/10 pass** |
| **New total** | **132/132 pass** |
| `scripts/learning-ownership-check.mjs` (pre-existing, regression) | **66/66 pass, unchanged** |
| `scripts/knowledge-ownership-check.mjs` (pre-existing, regression) | **56/56 pass, unchanged** |
| `scripts/archive-ownership-check.mjs` (pre-existing, regression) | **74/74 pass, unchanged** |
| `scripts/conversation-ownership-check.mjs` (pre-existing, regression) | **80/80 pass, unchanged** |
| `scripts/body-ownership-check.mjs` (Phase 12.5, updated — see above) | **15/15 pass** (was 14/15 before the narrowing fix) |
| `scripts/body-foundation-check.mjs` / `body-repository-check.mjs` / `body-sensors-check.mjs` / `body-graph-check.mjs` / `body-health-check.mjs` / `body-context-check.mjs` (Phase 12.5, regression) | **169/169 pass, unchanged** |

Three real bugs were found and fixed by this sprint's own tests — not
discovered later, not left as known issues: the confidence-timestamp
idempotency break (12.6.4), the outcome `targetKey` collision (12.6.5),
and the stale `body-ownership-check.mjs` assertion (12.6.7). All three are
fixed in the code delivered here.

---

## What this is NOT (honest scope)

- **No edits to `learning-service.js`, `learning-repository.js`, or any of
  the 14 existing `learning/` call sites.** Verified, not just claimed —
  `scripts/learning-ownership-check.mjs` (unmodified) is re-run as part of
  the new ownership check's own regression gate.
- **No new persisted ledger.** Every write in this entire sprint
  terminates in the existing, unmodified `recordLearningEvent()`.
- **No V1 changes, no UI.**
- **No live wiring into Reasoning or Problem-Solving.** The seam
  (`emitLearningSignal(seed)`, callable directly with a plain seed, zero
  registry required) exists; nothing calls it from either domain.
- **No scheduler or cron trigger for the Body bridge.**
  `pullBodyEventsAsSignals()` is structurally complete and fully tested
  against fixture `BodyEvent`s, callable only from its own check script in
  this phase — the same "structurally complete, deferred live wiring"
  precedent `body-context-builder.js` already set in Phase 12.5.
- **No AI/ML calls or scoring anywhere.** Every formula in this tree is
  documented, deterministic arithmetic — the same honesty bar
  `suggestConfidence`'s own header sets for itself.
- **`computeRecommendations()`'s `MERGE_CANDIDATE` rule is O(N²)** over a
  domainType-scoped event pool — documented as a known, accepted
  limitation in the engine's own header (acceptable at this phase's
  zero-live-producer data volumes; a real future producer would need the
  same exact-key-bucket discipline `archive-relationship-engine.js`
  already uses instead).
- **The Knowledge/Policy entity-sensor question from Phase 12.5 remains
  open** — this sprint does not touch it.

---

## Files

**New — inside `js/v2/learning/`** (additive, 12 new files):
- `contracts/{learning-scope,learning-signal,learning-confidence,learning-recommendation,learning-lineage}-contract.js`
- `registry/{learning-signal-type,learning-source-weight}-registry.js`
- `learning-confidence-engine.js`, `learning-signal-similarity-engine.js`, `learning-conflict-detection-engine.js`, `learning-recommendation-engine.js`, `learning-lineage-engine.js`
- `services/learning-signal-service.js`, `services/learning-outcome-service.js`

**New domain — `js/v2/learning-bridge/`** (3 files):
- `README.md`, `adapters/body-signal-adapter.js`, `services/body-learning-bridge-service.js`

**Modified:**
- `js/v2/learning/contracts/learning-event-contract.js` — `+1` additive `LEARNING_KIND.OBSERVATION` value
- `js/v2/README.md` — `learning-bridge/`'s Layout + dependency-graph entries, the self-contradiction fix, `learning/`'s Layout entry extended
- `scripts/body-ownership-check.mjs` — Part 4 narrowed to allowlist `js/v2/learning-bridge/` by name (a stale Phase 12.5 assertion this sprint's own existence made incorrect)

**New — check scripts (7 files, 132 assertions):**
- `scripts/learning-signal-vocabulary-check.mjs`, `scripts/learning-confidence-check.mjs`, `scripts/learning-signal-dedup-check.mjs`, `scripts/learning-signal-pipeline-check.mjs`, `scripts/learning-recommendation-lineage-check.mjs`, `scripts/learning-bridge-check.mjs`, `scripts/learning-signal-ownership-check.mjs`

**New — this document:**
- `docs/PHASE_12_SPRINT_12_6_UNIVERSAL_LEARNING_ENGINE.md`
