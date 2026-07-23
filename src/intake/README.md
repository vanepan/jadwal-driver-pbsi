# src/intake — Intake Domain (Problem Intelligence + Problem Solving, Phase 8-10 / Phase 10.5)

> Merged during Phase 1 Repository Refoundation, Increment 2: the former
> `js/v2/problem-intelligence/` and `js/v2/problem-solving/` trees are now a
> single physical domain, `src/intake/`, per the approved repository mapping
> ("There must be a single Intake domain"). This is a pure relocation — no
> logic, contracts, or behaviour changed. The two sub-responsibilities below
> retain their own original import-ownership rules (enforced by
> `scripts/problem-intelligence-check.mjs` / `scripts/problem-router-check.mjs`
> / `scripts/problem-solving-integration-check.mjs` against explicit file
> lists, not by directory boundary alone, now that they share a folder).
>
> Status: real, tested. As of Phase 10.5, REACHED FROM A REAL UI:
> `src/ui/sarpras-intelligence-center.js`'s own Home free-text entry point
> calls `problem-solving-service.js#beginProblemSolving()` on every
> submission — `classifyProblem()` is no longer only engine-to-engine.

## What this is

Two layers, threaded together, that turn one natural-language utterance into
a routed, possibly-composed outcome — CLAUDE.md's Thinking Model's Problem
step, before Observation, before Diagnosis.

**Problem Intelligence** (`problem-parser.js`, `problem-context-builder.js`,
`contracts/problem-category-contract.js`,
`services/problem-classification-service.js`) turns an utterance into a
structured, canonical `Problem` (`reasoning/contracts/problem-contract.js` —
reused, not redefined) — never a chatbot turn, never a generated response.
No AI, no LLM, no probabilistic guessing: deterministic keyword/pattern
classification, mirroring `conversation/intent/intent-engine.js`'s exact
scoring formula and honesty discipline (a field the utterance does not
answer is simply absent, never filled with an invented value).

**Not the same thing as `conversation/`'s Intent.** Intent answers "what
PLATFORM ACTION does a human want" (a small, closed, six-value enum of
operations this platform can execute). Problem Category answers "what KIND
OF ORGANIZATIONAL PROBLEM is this" — a broader, growing, REGISTERED taxonomy
(`contracts/problem-category-contract.js`) that exists before any platform
action is decided. The two are related by an explicit, honest mapping table
living in the Problem Solving layer (`services/problem-solving-service.js`'s
`CATEGORY_TO_INTENT`) — not merged into one enum, not conflated.

**Problem Solving** (`problem-router.js`, `clarification-engine.js`,
`problem-conversation-engine.js`, `contracts/workflow-route-contract.js`,
`services/problem-solving-service.js`) is the one place this phase's full
pipeline — `Problem → Problem Intelligence → Diagnostic Planning →
Conversation → Reasoning → Decision Support → NOR Composition` — is actually
threaded together, without a single edit to any file any of the domains it
composes already owned. It is the "sees every domain, owns none of them"
integration layer.

**Honestly incomplete by design, not by oversight.** Only ONE of the two
worked problem categories (`business_trip`) has a real downstream
Conversation Intent to map to (`CREATE_NOR`) — `facility` does not, because
no `FACILITY_ISSUE` intent exists in `conversation/`'s closed INTENT enum,
and extending that enum was judged out of scope (see
`services/problem-solving-service.js`'s own header). A `facility` problem
still gets a complete, real `DiagnosticPlan` — Problem Intelligence and
Diagnostic Planning are genuinely domain-agnostic — it simply has nowhere
further to go yet, and this file says so explicitly rather than fabricating
a path.

## Layout

```
src/intake/
  contracts/
    problem-category-contract.js   [Problem Intelligence] registry (Map-backed, mirrors
                                    kind-registry.js) of Problem Categories, each with a
                                    defaultDomainType (registry-backed) and a fieldSchema
                                    (RequiredFact-shaped, reused from intent-contract.js's
                                    convention, not its code). Bootstrap: 'facility' ->
                                    'engineering', 'business_trip' -> 'nor', 'unknown'
                                    fallback. "Extensible Problem Types" = a data call.
    workflow-route-contract.js     [Problem Solving] Phase 10.5 — WORKFLOW_ROUTE (six named
                                    routes) + RoutingDecision, always traceable to the Problem
                                    Model's own facts.category

  problem-parser.js                [Problem Intelligence] PURE — parseProblem(utterance):
                                    identical scoring formula to intent-engine.js (+1/keyword,
                                    +2/pattern, confidence=score/max). Entity extraction is
                                    literal substring matching; an unanswered field is simply
                                    absent from extractedFacts, never a fabricated "Unknown".
  problem-context-builder.js       [Problem Intelligence] PURE — buildProblemContext(domainType):
                                    a SEPARATE composition from conversation/context/
                                    context-builder.js (importing that file would create a
                                    backwards, upstream-depends-on-downstream edge) — a second,
                                    independent consumer of the SAME underlying read-only
                                    services, never a reimplementation of what they compute.
  nor-numbering-context.js         [Problem Intelligence, Sprint 11.1] lazy numbering-suggestion
                                    lookup, called only from problem-solving-service.js.
  problem-router.js                [Problem Solving] Phase 10.5, Part 2 — routeProblem(problem,
                                    confidence, opts): a PLAIN LOOKUP on the already-classified
                                    category, never a second round of keyword matching. Never
                                    imports conversation/.
  clarification-engine.js          [Problem Solving] Phase 10.5, Part 3 — generateClarification():
                                    NEVER a rejection, always a real question + the REAL
                                    registered category list.
  problem-conversation-engine.js   [Problem Solving] Phase 10.5, Parts 2/4 — the generic,
                                    category-agnostic, STATELESS turn loop (Diagnostic for
                                    'facility', plain fallback for any category with no real
                                    Intent mapping) built entirely from reasoning-service.js's
                                    own exports.
  services/
    problem-classification-service.js  [Problem Intelligence] the intended single import
                                    surface — classifyProblem / classifyProblemWithContext.
                                    Builds a real Problem via reasoning/contracts/
                                    problem-contract.js#makeProblem (contract import only —
                                    never calls into reasoning/'s engines).
    problem-solving-service.js     [Problem Solving] beginProblemSolving(utterance, actorId) —
                                    calls problem-router.js for EVERY category; a category with
                                    a real Intent mapping tries the REAL Conversation first and
                                    gracefully degrades to the generic loop otherwise. Never
                                    edits conversation/'s own files to close that gap.
                                    continueProblemConversation(state) — thin pass-through to
                                    problem-conversation-engine.js, one import surface for the
                                    UI. composeApprovedNor(conversationId).
```

## Dependency direction (binding — extends js/v2/README.md's graph)

```
[Problem Intelligence half]  ──depends on──>  knowledge/, organizational-memory/ (read-only,
                              services only) and reasoning/'s CONTRACTS ONLY
                              (problem-contract.js — never reasoning/'s engines or services)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/ & conversation/ &
                              reasoning/  ──never depend on──>  intake/

[Problem Solving half]       ──depends on──>  the Problem Intelligence half (same folder now),
                              reasoning/, conversation/, document-intelligence/nor/ (the one
                              layer allowed to see all of them)
reasoning/ & conversation/ & document-intelligence/  ──never depend on──>  intake/
```

Note the asymmetry with `reasoning/`: the Problem Intelligence half imports
`reasoning/`'s Problem *contract* (a zero-dependency shape file), but
`reasoning/`'s own engines never import anything from `intake/` back — a
`Problem` object flows from this domain into
`reasoning/diagnostic-planning-engine.js` as a plain function argument,
never an import. This is the same "shared contract, no engine-to-engine
cycle" shape `conversation/` already has with `knowledge/`.

## What this tree does NOT do

- No AI, no LLM — see "What this is," above.
- The Problem Intelligence half never decides what platform action to take
  — that mapping lives in the Problem Solving half.
- The Problem Intelligence half never asks a follow-up question — that is
  Diagnostic Planning's job (`reasoning/diagnostic-planning-engine.js`).
- A field the utterance does not answer is never guessed — it is simply
  absent from the classified Problem's `facts`.
- The Problem Solving half never invents a category->intent mapping beyond
  the one, explicit, documented entry that exists today.
- The Problem Solving half never composes a NOR from anything but an
  already-READY/COMPLETED Conversation's real, gathered facts.
