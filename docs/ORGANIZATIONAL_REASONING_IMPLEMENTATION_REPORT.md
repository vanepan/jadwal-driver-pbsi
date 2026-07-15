# Organizational Reasoning — Implementation Report (Phase 4-7)

> Prepared against, and treating as authoritative: `CLAUDE.md`,
> `docs/SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md`,
> `docs/NOR-Specification.md`, `docs/Knowledge-Asset-Specification.md`,
> `docs/Knowledge-Repository-Adaptation.md`. This report documents what was
> actually built, actually run, and actually verified — no claim below is
> unverified. **Per the phase's own STOP CONDITION, this is where work
> stops** pending architectural review; no NOR generation, no Learning
> Loop, and no AI/LLM integration was implemented or started.

---

## Executive Summary

Before writing any new engine, this phase re-verified — by reading the real
code, not by assumption — what the platform already had. That verification
changed the shape of the work substantially from a literal reading of the
phase brief: the "Knowledge Acquisition Engine" pipeline (Connector →
Extraction → Confidence → Builder → Draft Repository) already existed in
full (`knowledge/acquisition/acquisition-engine.js`,
`knowledge/services/knowledge-service.js`, `knowledge/services/
confidence-service.js`), and a real, tested Conversation layer
(`conversation/questionnaire/*`) already computed missing facts and
resolved what it honestly could. Rebuilding either would have been exactly
the "fifth reimplementation of things that already exist" the platform's
own founding audit warned against.

What genuinely did not exist — verified the same way, by reading
`organizational-memory/gap-detection-engine.js` (which only detects a
missing NOR *number*, never missing *knowledge*) and every conversation/
file (which asks a static, per-intent schema, never a confidence-weighted,
gap-aware one) — were exactly two things:

1. **A general-purpose Reasoning capability** that looks up Approved
   Business Rules, checks whether they apply, detects when two applicable
   rules conflict, and produces an evidence-cited, confidence-scored,
   explainable Recommendation. Nothing in this platform did this before
   this phase.
2. **A domain-wide Knowledge Gap detector** — missing entities, approvals,
   context, evidence, business constraints, and reasoning — as opposed to
   the existing Archive Gap concept (a missing document *number*).

Both were built as one new domain, `js/v2/reasoning/`, following this
codebase's own twelve-phase-proven convention exactly (contracts-first,
one pure engine per concern, a stateless services/ facade, real README,
real ownership/regression verification) — and both are wired into the
*existing*, unmodified Conversation layer through one new, additive file
(`conversation/dynamic-conversation-engine.js`) rather than a parallel
conversation system. **Zero existing files' behavior changed.** Four files
were edited, and every edit was strictly additive (new registry entries,
new documentation rows, new dependency-graph lines) — verified by re-running
every regression suite that existed before this phase, all still green.

---

## Part 1 — Knowledge Acquisition Engine (extension, not a rebuild)

**Finding**: the acquisition pipeline the phase brief describes
(Document Upload → Connector → Knowledge Extraction → Evidence Extraction →
Confidence Assignment → Knowledge Asset Builder → Draft Repository) already
runs, end to end, through `acquisition-engine.js#runAcquisition()` →
`knowledge-service.js#ingest()` → the repository — verified by reading
both files directly. `Knowledge-Repository-Adaptation.md`'s own conclusion
held under direct code inspection: the repository never inspects `payload`,
so a new `kind` requires zero repository or acquisition-engine changes.

**What was actually built** (`Knowledge-Asset-Specification.md`'s
already-approved design, made real):

- Five new `kind` registrations in `knowledge/registry/kind-registry.js`
  (`rendering_rule`, `workflow`, `ontology`, `organizational_reasoning`,
  `question_tree`) — purely additive; every one of the 20 pre-existing
  kinds remains registered unchanged.
- Five new payload-shape contracts under `knowledge/language/contracts/`,
  each mirroring `pattern-contract.js`'s exact convention (typedef + one
  structural validator, zero logic). `organizational-reasoning-contract.js`
  is deliberately the one validator in the directory that **rejects an
  empty `evidenceRefs`** — an uncited reasoning claim is structurally
  invalid, not merely low-confidence (the cite-or-abstain discipline made
  literal).
- One frozen example per new shape added to `knowledge/language/examples.js`,
  and the new files documented in that directory's own README table — the
  exact housekeeping this phase's own predecessor report flagged as
  necessary to avoid documentation drift.
- **Provenance for human-authored knowledge was already solved**:
  `knowledge/connectors/manual-file-connector.js` and
  `source-weight-contract.js`'s registered `'manual-file'` weight (0.95)
  already answer `Knowledge-Repository-Adaptation.md`'s Open Question 2 —
  no new connector was needed or built.

**Verified**: `scripts/knowledge-asset-kinds-check.mjs` (21/21) — registry
additivity, all five validators (including the stricter rejection), and a
real end-to-end `ingest() → list() → promoteKnowledge()` round-trip for a
brand-new kind through the **unmodified** repository and review workflow.

---

## Part 2 — Organizational Reasoning Engine (`js/v2/reasoning/`)

The genuinely new capability. Built as its own domain because it is
downstream of `knowledge/` and upstream of `conversation/`, exactly filling
the gap `SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md` (§3.1, §7) named
and already designed three binding constraints for:

1. **Cite-or-abstain**: `reasoning-engine.js#reason(problem)` returns
   `NO_APPLICABLE_KNOWLEDGE` — never a guess — when no Approved rule/policy
   applies. `recommendation-contract.js#isRecommendation()` structurally
   requires at least one citation.
2. **Diagnosis is never a Decision**: no file under `reasoning/` imports
   anything that writes to the Knowledge Repository. A Recommendation is
   read-only advisory output; acting on it still goes through the same,
   unmodified `knowledge-service.js#promoteKnowledge` human gate.
3. **Deterministic until a real AI adapter is a separate decision**: no
   file under `reasoning/` imports `ai-foundation/`. Every number
   (confidence, conflict penalty) is plain, documented arithmetic over
   already-real fields.

**How applicability and conflict detection work** (both reuse existing
mechanisms rather than inventing new ones):

- A rule/policy's payload may carry an `appliesWhen: {field: value}`
  convention (layered *on* the existing opaque `payload`, not a schema
  change — the same pattern `Knowledge-Asset-Specification.md` used for
  `evidenceRefs`). Absent, a rule is domain-wide.
- Conflicts reuse the **existing**, real `conflicts_with` relationship type
  (`dependency-graph-contract.js`, real since Phase 3) — no new
  relationship type, no new storage. A detected conflict is never silently
  resolved; it halves the affected confidence and is surfaced verbatim.

**Verified**: `scripts/reasoning-engine-check.mjs` (19/19) — static
dependency-direction checks (reasoning/ never imports `ai-foundation/` or
`conversation/`; nothing upstream imports `reasoning/` except the one
documented Part 4 caller) plus behavioral drives of cite-or-abstain,
`appliesWhen` matching in both directions, and a real conflict scenario
proving the confidence penalty and the honest `confidenceBasis` string.

---

## Part 3 — Knowledge Gap Detection

Built as a sibling engine inside `reasoning/` (`knowledge-gap-engine.js`),
because Part 4's own flow (`Reasoning Engine → Knowledge Gap Detection`)
ties them tightly, and both share the identical "read-only advisory,
never invents an expectation" posture.

**Deliberately not the same thing as `organizational-memory/
gap-detection-engine.js`** — verified by reading that file directly: it
detects a missing *NOR number* in a numbering sequence, nothing else. This
phase's Knowledge Gap is domain-wide: it reads a domainType's own Approved
`kind: 'ontology'` asset as the checklist (stakeholders, an approval-chain
reference, dependencies) and reports every mismatch between what the
Ontology names and what is actually Approved, across all six named
categories (missing entity/approval/context/evidence/business
constraint/reasoning). With no Ontology recorded at all, it reports exactly
one gap (`missing_context`, critical) rather than guessing what
"complete" means for an unrecorded domain.

**Verified**: `scripts/knowledge-gap-check.mjs` (20/20) — a full,
progressive drive proving every one of the six gap types fires under its
real condition and clears, one at a time, as real Approved Knowledge
(seeded through the unmodified `knowledge-service.js`) is added: from 5
open gaps down to exactly 1, in six honestly-verified steps.

---

## Part 4 — Dynamic Conversation Engine

**Design decision, and why**: rather than build a second, parallel
conversation system, this phase adds exactly one new pure engine
(`conversation/dynamic-conversation-engine.js`) plus one new stateless
service (`conversation/services/dynamic-conversation-service.js`) that
*compose* the existing, real Conversation flow —
`questionnaire-engine.js`'s still-missing schema Questions,
`conversation-service.js`'s own accumulated `explainability.questionsAsked`/
`questionsSkipped` (already real question history — no new field invented),
and `reasoning-service.js`'s freshly-detected Gaps. **Zero edits** to
`questionnaire-engine.js`, `question-optimizer.js`, `context-builder.js`,
`task-executor.js`, `intent-engine.js`, `conversation-service.js`, or
`conversation-repository.js`.

What this adds, concretely:

- **Priority tagging**: a schema field marked `optimizable: false`
  (intent-contract.js's own vocabulary for "can never be honestly
  fabricated") is asked at CRITICAL priority; a detected Gap's own
  `priority` (critical/high/normal) carries straight through — the two
  vocabularies were designed to share the same three values.
- **One question at a time**: `selectNextQuestion()` returns exactly the
  single highest-priority unanswered question, never a form.
- **Confidence, plainly computed**: `known / (known + outstanding)`, where
  `outstanding` includes both remaining schema questions *and* remaining
  Knowledge Gaps — so a Conversation is never reported "confident" purely
  because its narrow per-intent form is filled, if the platform's broader
  organizational knowledge for that domain is still genuinely thin.
- **Deduplication**: proven at the engine level with a caller-supplied
  history set. Honestly scoped: schema-field dedup is fully wired
  end-to-end (it reuses Conversation's own real state); gap-question dedup
  across turns is verified at the pure-engine level but has no persistence
  wired into Conversation yet — see Known Limitations.

**Verified**: `scripts/dynamic-conversation-check.mjs` (27/27) — a static
check that zero new Conversation Repository writers were added, direct
engine-level tests of priority/dedup/confidence arithmetic, and a full
integration drive: a real `startConversation("Buatkan NOR perjalanan
dinas.")` begins at low confidence with a CRITICAL next question, and
answering every real schema fact through the **unmodified**
`continueConversation()` genuinely raises confidence past the default
0.75 threshold.

---

## Part 5 — Integration

- `js/v2/README.md` updated additively: the new `reasoning/` entry, the new
  `conversation/` files, and the new dependency-graph edges
  (`reasoning/ → knowledge/`, `conversation/ → reasoning/`, and the
  never-reverse rules), plus two new lines in "what this tree still does
  NOT do" (no UI caller yet; no Learning Loop wiring for a Recommendation).
- **No `dormant-subsystems.js` entry was added**, and this was a deliberate
  decision, not an oversight: that register exists for a built capability a
  UI *already reads as a misleading zero* (its own two real entries,
  `correction-log` and `composer-timeline`, both have real UI readers
  today). Nothing built this phase has a UI reader yet at all — the exact
  same "architecture-only, no UI caller" posture `conversation/` itself
  shipped with in Phase 6, which needed no entry either. Adding one now
  would misrepresent the register's own stated purpose.
- Feature gating required no change: everything new lives under `js/v2/`,
  already gated end-to-end by `isV2Enabled()`.

---

## Part 6 — Validation

Every number below is a real, just-executed `node scripts/*.mjs` run in
this session — not a projection.

**New verification, all passing:**

| Script | Result |
|---|---|
| `scripts/knowledge-asset-kinds-check.mjs` | 21/21 |
| `scripts/reasoning-engine-check.mjs` | 19/19 |
| `scripts/knowledge-gap-check.mjs` | 20/20 |
| `scripts/dynamic-conversation-check.mjs` | 27/27 |
| **New total** | **87/87** |

**Regression — every pre-existing suite touched by this phase's one
modified pre-existing file (`kind-registry.js`) or its transitive
consumers, re-run clean:**

| Script | Result |
|---|---|
| `scripts/knowledge-ownership-check.mjs` | 55/55 |
| `scripts/conversation-ownership-check.mjs` | 77/77 |
| `scripts/learning-ownership-check.mjs` | 63/63 |
| `scripts/archive-ownership-check.mjs` | 74/74 |
| `scripts/knowledge-learning-check.mjs` | 23/23 |
| `scripts/organizational-memory-check.mjs` | 28/28 |
| `scripts/document-intelligence-check.mjs` | 21/21 |
| `scripts/knowledge-extraction-check.mjs` | 24/24 |
| `scripts/knowledge-review-workflow-check.mjs` | 20/20 |
| `scripts/pipeline-state-machine-check.mjs` | 78/78 |
| **Regression total** | **463/463, zero regressions** |

- **Architecture consistency**: confirmed by the static import-graph
  assertions embedded in `reasoning-engine-check.mjs` and
  `dynamic-conversation-check.mjs` (never a manual claim).
- **Repository compatibility**: proven, not assumed — a real new-kind item
  round-tripped through `create → list → promote` with zero repository
  code touched.
- **Reasoning explainability**: every `Recommendation` in the test suite
  carries a non-empty `explanation` array composed from the existing,
  unmodified `explainability-service.js#explain()`.
- **Backward compatibility / regression risk**: verified above — 463/463.
- **Performance impact**: negligible and unmeasured formally — every new
  computation is O(n) over an in-memory list already read by existing
  code paths (`listKnowledge`), no new I/O, no new persistence layer.

---

## Files Created / Modified

**New:**
```
js/v2/knowledge/language/contracts/rendering-rule-contract.js
js/v2/knowledge/language/contracts/workflow-contract.js
js/v2/knowledge/language/contracts/ontology-contract.js
js/v2/knowledge/language/contracts/organizational-reasoning-contract.js
js/v2/knowledge/language/contracts/question-tree-contract.js
js/v2/reasoning/README.md
js/v2/reasoning/contracts/problem-contract.js
js/v2/reasoning/contracts/rule-application-contract.js
js/v2/reasoning/contracts/recommendation-contract.js
js/v2/reasoning/contracts/knowledge-gap-contract.js
js/v2/reasoning/rule-applicability-engine.js
js/v2/reasoning/conflict-detection-engine.js
js/v2/reasoning/reasoning-engine.js
js/v2/reasoning/knowledge-gap-engine.js
js/v2/reasoning/services/reasoning-service.js
js/v2/conversation/contracts/dynamic-question-contract.js
js/v2/conversation/dynamic-conversation-engine.js
js/v2/conversation/services/dynamic-conversation-service.js
scripts/knowledge-asset-kinds-check.mjs
scripts/reasoning-engine-check.mjs
scripts/knowledge-gap-check.mjs
scripts/dynamic-conversation-check.mjs
docs/ORGANIZATIONAL_REASONING_IMPLEMENTATION_REPORT.md  (this file)
```

**Modified (all strictly additive):**
```
js/v2/knowledge/registry/kind-registry.js      (+5 registerKind() calls)
js/v2/knowledge/language/examples.js           (+5 example constants)
js/v2/knowledge/language/README.md             (+5 table rows)
js/v2/README.md                                (+reasoning/ entry, +graph edges, +2 disclosure lines)
```

**Untouched**: every existing engine, contract, service, and UI file in
`js/v2/` — including every file the phase's constraints explicitly named
as off-limits (repository, lifecycle, review workflow, `ai-foundation/`,
`document-intelligence/nor/`).

---

## Constraints Compliance

| Constraint | Status |
|---|---|
| Incremental implementation only | Two new domains added the same way `learning/` and `conversation/` were — no rewrite anywhere |
| No repository rewrite | Zero edits to any repository file; proven compatible instead |
| No architecture redesign | Extends the existing dependency graph; no edge reversed |
| No breaking changes | 463/463 pre-existing assertions still pass |
| No production regressions | Same evidence |
| No NOR generation | `document-intelligence/nor/` untouched; `reasoning/` never imports it |
| No Learning Loop implementation | A Recommendation is never recorded as a `LearningEvent` — explicitly noted as deferred, not built |
| No AI model specific implementation | Zero imports of `ai-foundation/` anywhere in `reasoning/` or the new `conversation/` files |
| Model-agnostic | Every computation is plain, documented arithmetic — no model call anywhere |

---

## Known Limitations (honest, not silently omitted)

1. **Gap-question dedup has no cross-turn persistence yet.** The dedup
   *mechanism* is real and tested (`prioritizeQuestions()` correctly
   excludes anything in a supplied history set), but nothing currently
   writes a gap's id into Conversation's own history once it has been
   shown to a human — because doing so would require either a new field
   on Conversation (an edit to `conversation-contract.js`/
   `conversation-service.js`, which this phase deliberately avoided) or a
   caller-side (future UI) in-session set. This is a real, scoped gap, not
   a bug: it is the correct boundary between "the engine capability" (this
   phase's mandate) and "the chat surface" (explicitly out of scope, same
   as Phase 6's own conversation/ shipped with no UI).
2. **`reasoning/` and the two new `conversation/` files have no UI caller.**
   Consistent with `conversation/`'s own Phase 6 precedent, and explicitly
   why no `dormant-subsystems.js` entry was added (see Part 5).
3. **Rule applicability is intentionally simple** (`appliesWhen` exact-match
   only) — no range/comparison operators, no nested conditions. This
   matches the phase's "model-agnostic," deterministic mandate; a richer
   condition language is a future, separate decision, not silently
   foreclosed by this shape (the contract's `payload` remains opaque).
4. **No content was seeded.** Every check script seeds its own throwaway
   fixtures and none persist (in-memory backend, fresh per process) — this
   phase built capability, not Organizational Knowledge content, per this
   platform's own established phase boundary (`js/v2/README.md`'s "Future
   evolution" section).

---

## STOP

Per this phase's own STOP CONDITION: all six parts and their deliverables
are complete and verified above. **No work has begun on NOR Generation or
a Learning Loop.** This report is where the phase ends, pending
architectural review.
