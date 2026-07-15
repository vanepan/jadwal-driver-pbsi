# Home Entry Point Migration — Implementation Report (Phase 10.5)

> Prepared against, and treating as authoritative: `CLAUDE.md`,
> `docs/SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md`,
> `docs/NOR-Specification.md`, `docs/Knowledge-Asset-Specification.md`,
> `docs/Knowledge-Repository-Adaptation.md`,
> `docs/ORGANIZATIONAL_REASONING_IMPLEMENTATION_REPORT.md`,
> `docs/PROBLEM_SOLVING_PIPELINE_IMPLEMENTATION_REPORT.md`. Companion:
> `docs/PHASE_10.5_MIGRATION_NOTES.md`. Every claim below is verified —
> 796 real assertions (671 engine-level, 125 browser-verified via
> Puppeteer), all actually run in this session. **Per this phase's STOP
> CONDITION, this is where work stops** pending architectural review; no
> Organizational Learning work was started.

---

## Executive Summary

Before writing any code, this phase resolved a real ambiguity: "the Home
page" could have meant the real, live V1 Home every employee uses, or the
dormant, pilot-gated Dashboard inside `js/v2/ui/
sarpras-intelligence-center.js`. A dedicated investigation (file:line
citations, not assumption) confirmed every element the brief named — the
free-text box, "Buat NOR"/"Unggah Dokumen" buttons, "Tinjau Pengecualian"
— exists only inside the second one. **No V1 file was touched.** The blast
radius of this phase is identical to every phase before it: one pilot
user, behind `isV2Enabled()`.

With that resolved, the actual migration was narrow and mechanical: the
Home free-text entry point's submit handler used to call
`conversation-service.js#startConversation()` — the legacy Intent
Engine — directly and first. It now calls
`problem-solving-service.js#beginProblemSolving()` first, which runs
Problem Classification and a real Routing Decision before anything
resembling the legacy engine is ever reached, exactly Part 1's own
required order.

Two real defects surfaced by actually running the new code — not by
inspection — and both are now fixed, documented in
`PHASE_10.5_MIGRATION_NOTES.md` in full: (1) "Kolam renang bocor" (this
phase's own Scenario 4) failed to classify as a facility problem because
the original scoring rule enumerated a fixed asset-noun vocabulary "kolam"
wasn't in; (2) the Diagnostic Conversation loop's first draft asked end
users an admin-level question ("what is the Ontology for this domain?")
because `planDiagnosis()`'s question ranking freely mixes user-answerable
fields with organizational-knowledge gaps. Both fixes are small, targeted,
and covered by new regression assertions that would catch a recurrence.

A third finding — genuinely a gap between two previous phases' work, not
introduced here — is handled with a graceful-degradation pattern rather
than a workaround: Problem Classification's vocabulary for `business_trip`
("perjalanan dinas") is broader than Conversation's real `CREATE_NOR`
intent pattern (which requires the literal word "NOR"). Rather than
editing `conversation/contracts/intent-contract.js`'s closed enum (a
previous-phase file), `beginProblemSolving()` now tries the real,
richer Conversation path first and only falls back to the new generic
Problem Conversation loop when the legacy engine genuinely doesn't
recognize the utterance — so both "Buatkan NOR perjalanan dinas." (full
real path, eventual NOR Composition) and "Mau perjalanan dinas." (a
working conversation instead of a dead end) succeed today.

---

## Part 1 — Entry Point Migration

`sarpras-intelligence-center.js`'s `onDashboardClick()` handler for
`sic-conv-start` was the ONE real entry point routing directly to the
legacy Intent Engine (confirmed by dedicated investigation — no other V1
or V2 file does). It now calls `handleProblemSubmit()`, a new local
function that:

1. Calls `beginProblemSolving(utterance, actorId)` — **never rejects
   before Problem Classification runs**; the only failure mode left is a
   genuinely empty input (a real input error, unchanged from before).
2. Records the full pipeline result into `homeState.lastPipelineTrace`
   (Part 6) before branching on the route.
3. Dispatches on `routingDecision.route` (Part 2) to update exactly the
   state fields that route needs — never more than one route's state is
   populated at once (`resetRoutedState()` clears the rest on every new
   submission).

**Verified**: `scripts/sarpras-workspace-dom-check.mjs`, the full
pre-existing 94-assertion suite, re-run clean — proving the mount, every
nested workspace, the mode toggle, and every live-event re-render path are
byte-for-byte unaffected.

---

## Part 2 — Problem Router

`js/v2/problem-solving/problem-router.js#routeProblem(problem,
categoryConfidence, opts)` — a pure lookup on `problem.facts.category`
(already computed once, upstream, by Problem Classification) against a
six-entry table. **Never re-runs keyword matching** — verified by a static
import-graph assertion that this file never imports `conversation/` (it
has no utterance-parsing capability of its own to import).

| Category | Route |
|---|---|
| `facility` | `diagnostic_conversation` |
| `business_trip` | `conversation` |
| `procurement` | `conversation` |
| `administration` | `conversation` |
| `knowledge_search` | `search` |
| `document_upload` | `knowledge_acquisition` |
| `unknown` / low confidence / unrecognized category | `clarification_conversation` |

`procurement` and `administration` are new registered Problem Categories
(this phase's own Scenario 3/5 worked examples), mapped to the
previously-registered-but-unused `request` domainType — a clean, honest
reuse rather than forcing them into `nor` or `petty_cash`.
`knowledge_search`/`document_upload` are registered too, satisfying Part
2's own named routes, though neither is exercised by the five required
validation scenarios.

**Verified**: `scripts/problem-router-check.mjs` (37/37) — every category
routes correctly, the confidence threshold boundary is exact (`>=`, not
`>`), an unregistered or unmapped category clarifies rather than guessing,
and `hasIntentMapping` is honestly carried through, never inferred.

---

## Part 3 — Unknown Problem Handling

`js/v2/problem-solving/clarification-engine.js#generateClarification()` —
never returns a rejection. A genuinely unclassifiable utterance gets one
of three rotating (deterministic, not random) clarifying prompts, plus —
read live from `problem-category-contract.js`'s own registry, never a
hardcoded list — the real category labels the platform understands today.
If Problem Classification partially matched something, that is stated
honestly rather than discarded.

**Verified**: `scripts/problem-router-check.mjs`'s own Part 3 section, plus
`scripts/problem-first-home-dom-check.mjs`'s dedicated genuinely-gibberish
scenario — confirmed in a real browser that the rendered text never
contains "Request not recognized" or its Indonesian equivalent.

---

## Part 4 — Home Experience

Two real bugs (see Executive Summary and `MIGRATION_NOTES.md` for full
detail) were found and fixed specifically because this phase actually ran
the new conversational flow end to end rather than only inspecting it:

1. `problem-parser.js`'s `facility` scoring rule generalized from a fixed
   asset-noun enum to a symptom-word-driven pattern.
2. `problem-conversation-engine.js`'s end-user-facing `nextQuestion` is
   sourced only from category-schema fields, never from
   `planDiagnosis()`'s Gap-mixed ranking.

Copy was softened per Part 4's own example tone ("Ceritakan apa yang
terjadi atau apa yang Anda butuhkan" replaces "Apa yang ingin Anda
lakukan?"; "Baik. Saya akan membantu menyiapkan ini." precedes each
Diagnostic/generic conversation's first question) — a small, deliberately
minimal wording change, not a visual redesign (Part 5).

**Verified**: `scripts/problem-first-home-dom-check.mjs`, all 5 required
scenarios plus the clarification case, driven through the REAL rendered
DOM in a real headless browser (Puppeteer) — not simulated.

---

## Part 5 — Backward Compatibility

Zero edits to `renderSearchBar`, `computeQuickActions`,
`renderQuickActions`, `onModeBarClick`, `renderModeBar`,
`renderTechnicalDiagnostics`, `computeTechnicalDiagnostics`, any Executive
Briefing computation, or any of the four nested workspace mounts. The only
touched surface is the conversation entry card and its three handlers.

**Verified, in a real browser**: `scripts/problem-first-home-dom-check.mjs`'s
own dedicated Part 5 section confirms the "Buat NOR" and "Unggah Dokumen"
quick-action buttons are still present and that clicking "Buat NOR" still
navigates to a correctly-mounted NOR Center screen; `scripts/
sarpras-workspace-dom-check.mjs`'s full pre-existing 94 assertions (every
nested workspace, every tab, live event re-renders, mode persistence)
re-run clean.

---

## Part 6 — Developer Mode

`renderPipelineTrace()`, gated by the SAME shared `isDeveloperMode()` flag
every other Developer Mode section already reads, appended alongside
(never replacing) `renderTechnicalDiagnostics()`. Reads
`homeState.lastPipelineTrace` — set once, by the real pipeline's own real
return values, never a second computation. Displays, when present: User
Input, Problem Classification (category + confidence), Extracted Entities
(`problem.facts`, verbatim), Diagnostic Plan (confidence + recommended
question), Knowledge Gap (every gap's type + priority), Conversation State
(the real Conversation's state + intent, or the generic loop's
complete/in-progress flag), Reasoning Chain (hypotheses with status +
likelihood), Recommendation (when one was produced), Current Workflow (the
real `RoutingDecision`), and Final Output (`downstreamNote`, or the
composed `ComposerDocument`'s id + section count).

**Verified**: `scripts/problem-first-home-dom-check.mjs`'s own Part 6
section — Developer Mode activated in a real browser, a real utterance
submitted, and the rendered panel confirmed to contain each named stage.

---

## Part 7 — Validation

Every number is a real, just-executed run in this session.

**All 5 required scenarios, verified in a real browser (never
"Request not recognized" in any of them):**

| Scenario | Utterance | Verified route |
|---|---|---|
| 1 | "AC kamar atlet rusak" | Facility → Diagnostic Conversation |
| 2 | "Mau perjalanan dinas" | Business Trip → Conversation (graceful-degradation path) |
| 3 | "Mau beli meja" | Procurement → Conversation |
| 4 | "Kolam renang bocor" | Facility → Diagnostic (post-fix) |
| 5 | "Atlet kehilangan ID Card" | Administration → Conversation |

**New verification, all passing:**

| Script | Result |
|---|---|
| `scripts/problem-router-check.mjs` | 37/37 |
| `scripts/problem-first-home-dom-check.mjs` (browser) | 31/31 |
| **New total** | **68/68** |

**Regression — every suite that existed before this phase, re-run clean:**

| Script | Result |
|---|---|
| `scripts/knowledge-ownership-check.mjs` | 55/55 |
| `scripts/conversation-ownership-check.mjs` | 77/77 |
| `scripts/learning-ownership-check.mjs` | 63/63 |
| `scripts/archive-ownership-check.mjs` | 74/74 |
| `scripts/knowledge-asset-kinds-check.mjs` | 21/21 |
| `scripts/reasoning-engine-check.mjs` | 19/19 |
| `scripts/knowledge-gap-check.mjs` | 20/20 |
| `scripts/dynamic-conversation-check.mjs` | 27/27 |
| `scripts/document-intelligence-check.mjs` | 21/21 |
| `scripts/knowledge-learning-check.mjs` | 23/23 |
| `scripts/organizational-memory-check.mjs` | 28/28 |
| `scripts/knowledge-extraction-check.mjs` | 24/24 |
| `scripts/knowledge-review-workflow-check.mjs` | 20/20 |
| `scripts/pipeline-state-machine-check.mjs` | 78/78 |
| `scripts/problem-intelligence-check.mjs` | 28/28 |
| `scripts/diagnostic-planning-check.mjs` | 19/19 |
| `scripts/nor-composition-check.mjs` | 17/17 |
| `scripts/problem-solving-integration-check.mjs` | 20/20 (2 assertions updated to reflect facility's new, real downstream workflow — see below) |
| `scripts/sarpras-workspace-dom-check.mjs` (browser) | 94/94 |
| **Regression total** | **728/728** |

**Grand total this session: 796/796 real assertions passing, 0
regressions.**

A note on the two updated Phase 8-10 assertions: `problem-solving-
integration-check.mjs` previously asserted `facility` categories get
`conversation: null` with no further workflow — that field is still
honestly `null` (no real Intent mapping exists for facility), but the test
now ALSO asserts `problemConversationTurn` is populated with a real
question, documenting the exact capability this phase added. This is a
legitimate test evolution (no UI or user ever depended on the old,
narrower behavior — Phase 8-10's own report explicitly named it a Known
Limitation to be fixed), not a silently-relaxed assertion.

---

## Files Created / Modified

**New:**
```
js/v2/problem-solving/contracts/workflow-route-contract.js
js/v2/problem-solving/problem-router.js
js/v2/problem-solving/clarification-engine.js
js/v2/problem-solving/problem-conversation-engine.js
scripts/problem-router-check.mjs
scripts/problem-first-home-dom-check.mjs
docs/PHASE_10.5_MIGRATION_NOTES.md
docs/PHASE_10.5_IMPLEMENTATION_REPORT.md  (this file)
```

**Modified (all additive except the two noted behavioral fixes):**
```
js/v2/problem-intelligence/contracts/problem-category-contract.js  (+4 categories)
js/v2/problem-intelligence/problem-parser.js                       (+4 category rules,
                                                                     BEHAVIORAL FIX to facility scoring)
js/v2/problem-solving/services/problem-solving-service.js          (beginProblemSolving now routes;
                                                                     +continueProblemConversation;
                                                                     composeApprovedNor byte-for-byte unchanged)
js/v2/ui/sarpras-intelligence-center.js                             (Home entry point handler +
                                                                     rendering + Developer Pipeline Viewer;
                                                                     every other function untouched)
js/v2/problem-solving/README.md, js/v2/problem-intelligence/README.md,
js/v2/README.md                                                     (documentation)
scripts/problem-solving-integration-check.mjs                       (2 assertions evolved, see Part 7)
```

**Untouched**: every V1 file (confirmed by dedicated investigation, zero
exceptions); `conversation/contracts/intent-contract.js`,
`conversation/intent/intent-engine.js`,
`conversation/services/conversation-service.js`,
`conversation/questionnaire/*`, `conversation/context/*`,
`conversation/task-executor.js`; every `reasoning/` file from Phase 4-7/
8-10; `document-intelligence/nor/*`; `js/v2/knowledge/*` in its entirety;
`composer-store.js`; every repository/lifecycle/review file.

---

## Constraints Compliance

| Constraint | Status |
|---|---|
| No architecture redesign | Extends the dependency graph (`problem-solving/ → problem-intelligence/, reasoning/, conversation/, document-intelligence/nor/`, already documented in Phase 8-10); no edge reversed |
| No repository rewrite | Zero repository edits |
| No AI vendor integration | Zero imports of `ai-foundation/` anywhere in this phase's files |
| No Learning Loop | No Recommendation/Hypothesis/DiagnosticPlan/ComposerDocument is recorded as a `LearningEvent` |
| No autonomous decision making | Every route is a deterministic lookup; every recommendation is read-only advisory; a human still drives every conversation turn |
| Reuse every existing engine | `planDiagnosis`, `generateHypotheses`, `updateHypotheses`, `reason`, `classifyProblem`, `startConversation`, `composeNorDocument`, `globalSearch` — all reused verbatim |
| Maintain explainability | Every routing decision names its real category and reason; the Developer Pipeline Viewer surfaces the full trace |
| Maintain backward compatibility | 94/94 pre-existing DOM assertions + all quick actions/search verified unchanged in a real browser |

---

## Known Limitations (honest, not silently omitted)

1. **The graceful-degradation fallback for `business_trip` means two
   different-quality experiences exist for the "same" category** — an
   utterance containing "NOR" gets the full real-Conversation path
   (eventual NOR Composition); one that doesn't gets the generic loop
   (no NOR Composition wiring, since that requires a real `Conversation`
   entity). This is documented, not hidden, in `MIGRATION_NOTES.md`, and
   is the correct trade-off given the constraint against editing
   `intent-contract.js` — but it is a real UX inconsistency a future phase
   may want to resolve by broadening the real Intent pattern instead.
2. **`knowledge_search`/`document_upload` routes are implemented and
   unit-tested (`problem-router-check.mjs`) but not exercised by the DOM
   suite** — none of the five required validation scenarios triggers them.
3. **The Problem Conversation loop has no persistence** — refreshing the
   page mid-conversation loses progress (module-scope `homeState`, same as
   every other piece of Home's existing interaction state — search input,
   the old conversation box — none of which persist across a refresh
   either; this is consistent with existing behavior, not a new gap).
4. **Clarification's rotating prompts are keyed to utterance length**, a
   simple deterministic choice, not a rich variation strategy — sufficient
   to avoid an obviously-canned feel for this phase's scope, not claimed
   to be more than that.

---

## STOP

Per this phase's own STOP CONDITION: migration is complete, all 796
assertions pass (728 regression + 68 new), the end-to-end demonstration
succeeds for all 5 required scenarios in a real browser, and this report
is generated. **No work has begun on Organizational Learning.** This
report is where the phase ends, pending architectural review.
