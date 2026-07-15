# js/v2/problem-solving — Problem Solving Pipeline Integration (Phase 8-10 / Phase 10.5)

> Status: real, tested, and — as of Phase 10.5 — REAL-UI-MOUNTED for the
> first time in this tree's history. `js/v2/ui/sarpras-intelligence-center.js`'s
> own Home entry point now calls `beginProblemSolving()`/
> `continueProblemConversation()`/`composeApprovedNor()` directly — the
> first time any `js/v2/` engine domain has a live UI caller, still fully
> contained behind the existing `isV2Enabled()` pilot gate (role:'admin',
> username:'evan'). Verified in a real browser:
> `scripts/problem-first-home-dom-check.mjs`,
> `scripts/sarpras-workspace-dom-check.mjs` (pre-existing, re-run clean),
> plus pure-engine `scripts/problem-router-check.mjs` and
> `scripts/problem-solving-integration-check.mjs`.

## What this is

The one place this phase's full pipeline —
`Problem → Problem Intelligence → Diagnostic Planning → Conversation →
Reasoning → Decision Support → NOR Composition` — is actually threaded
together, without a single edit to any file any of the five domains it
composes already owned. This is the "sees every domain, owns none of them"
layer `js/v2/README.md` already reserves for `ui/`; it exists as plain
service code, not UI, because this phase's own brief is explicit that
engineering is the deliverable.

**Honestly incomplete by design, not by oversight.** Only ONE of this
phase's two worked problem categories (`business_trip`) has a real
downstream Conversation Intent to map to (`CREATE_NOR`) — `facility` does
not, because no `FACILITY_ISSUE` intent exists in `conversation/`'s closed,
previous-phase `INTENT` enum, and extending that enum was judged out of
scope for this phase (see `services/problem-solving-service.js`'s own
header). A `facility` problem still gets a complete, real
`DiagnosticPlan` — Problem Intelligence and Diagnostic Planning are
genuinely domain-agnostic — it simply has nowhere further to go yet, and
this file says so explicitly rather than fabricating a path.

## Layout

```
js/v2/problem-solving/
  contracts/
    workflow-route-contract.js   Phase 10.5 — WORKFLOW_ROUTE (six named routes) + RoutingDecision,
                                 always traceable to the Problem Model's own facts.category
  problem-router.js               Phase 10.5, Part 2 — routeProblem(problem, confidence, opts): a
                                 PLAIN LOOKUP on the already-classified category, never a second
                                 round of keyword matching. Never imports conversation/.
  clarification-engine.js         Phase 10.5, Part 3 — generateClarification(): NEVER a rejection,
                                 always a real question + the REAL registered category list.
  problem-conversation-engine.js  Phase 10.5, Parts 2/4 — the generic, category-agnostic,
                                 STATELESS turn loop (Diagnostic for 'facility', plain fallback for
                                 any category with no real Intent mapping) built entirely from
                                 Phase 8-10's own reasoning-service.js exports. Fixed a real bug,
                                 found by running it: `nextQuestion` is sourced ONLY from the
                                 category's own schema fields, never from planDiagnosis()'s
                                 Gap-driven recommendedNextQuestion (which mixed in admin-facing
                                 questions like "what is the Ontology for this domain?").
  services/
    problem-solving-service.js   beginProblemSolving(utterance, actorId) — Phase 10.5: now calls
                                 problem-router.js for EVERY category, not just one; a category
                                 with a real Intent mapping tries the REAL Conversation first and
                                 gracefully degrades to the generic loop if the (narrower) legacy
                                 Intent Engine doesn't recognize the same utterance Problem
                                 Classification already did (a real, found-by-testing gap between
                                 the two taxonomies — see MIGRATION_NOTES). Never edits
                                 conversation/'s own files to close that gap.
                                 continueProblemConversation(state) — Phase 10.5 — thin pass-through
                                 to problem-conversation-engine.js, one import surface for the UI.
                                 composeApprovedNor(conversationId) — UNCHANGED since Phase 8-10.
```

## Dependency direction (binding — extends js/v2/README.md's graph)

```
problem-solving/  ──depends on──>  problem-intelligence/, reasoning/, conversation/,
                    document-intelligence/nor/ (the one layer allowed to see all four)
problem-intelligence/ & reasoning/ & conversation/ & document-intelligence/
                   ──never depend on──>  problem-solving/
```

## What this tree does NOT do (true as of Phase 8-10)

- Never invents a category->intent mapping beyond the one, explicit,
  documented entry that exists today.
- Never composes a NOR from anything but an already-READY/COMPLETED
  Conversation's real, gathered facts.
- No UI — a future chat/workspace surface is explicitly out of scope for
  this phase, same precedent as every prior new domain.
