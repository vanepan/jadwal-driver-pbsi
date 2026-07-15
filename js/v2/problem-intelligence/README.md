# js/v2/problem-intelligence — Problem Intelligence Foundation (Phase 8-10)

> Status: real, tested (`scripts/problem-intelligence-check.mjs`,
> `scripts/problem-router-check.mjs`). As of Phase 10.5, REACHED FROM A
> REAL UI: `js/v2/ui/sarpras-intelligence-center.js`'s own Home free-text
> entry point calls `problem-solving-service.js#beginProblemSolving()` on
> every submission — `classifyProblem()` is no longer only
> engine-to-engine.
>
> Phase 10.5 additions (bootstrap, all additive): `procurement` and
> `administration` categories (this phase's own Scenario 3/5 worked
> examples), plus `knowledge_search`/`document_upload` (Part 2's own named
> routes). Also fixed a real classification bug found by running Scenario 4
> ("Kolam renang bocor") — the original `facility` rule enumerated a fixed
> asset-noun keyword list that "kolam" wasn't in, diluting the one real
> symptom-word signal below the confidence threshold. `problem-parser.js`'s
> `facility` rule now scores on symptom words alone plus a GENERALIZED
> "some word(s), then a symptom" pattern, never an unboundable asset enum.

## What this is

The layer CLAUDE.md's Thinking Model places first: Problem, before
Observation, before Diagnosis. Turns one natural-language utterance into a
structured, canonical `Problem` (`reasoning/contracts/problem-contract.js`
— reused, not redefined) — never a chatbot turn, never a generated
response. No AI, no LLM, no probabilistic guessing: deterministic
keyword/pattern classification, mirroring `conversation/intent/
intent-engine.js`'s exact scoring formula and honesty discipline (a field
the utterance does not answer is simply absent, never filled with an
invented value).

**Not the same thing as `conversation/`'s Intent.** Intent answers "what
PLATFORM ACTION does a human want" (a small, closed, six-value enum of
operations this platform can execute). Problem Category answers "what KIND
OF ORGANIZATIONAL PROBLEM is this" — a broader, growing, REGISTERED
taxonomy (`contracts/problem-category-contract.js`) that exists before any
platform action is decided. The two are related by an explicit, honest
mapping table living in the Integration layer
(`problem-solving/services/problem-solving-service.js`'s
`CATEGORY_TO_INTENT`) — not merged into one enum, not conflated.

## Layout

```
js/v2/problem-intelligence/
  contracts/
    problem-category-contract.js   registry (Map-backed, mirrors kind-registry.js) of Problem
                                    Categories, each with a defaultDomainType (registry-backed)
                                    and a fieldSchema (RequiredFact-shaped, reused from
                                    intent-contract.js's convention, not its code). Bootstrap:
                                    'facility' -> 'engineering', 'business_trip' -> 'nor',
                                    'unknown' fallback. "Extensible Problem Types" = a data call.

  problem-parser.js                PURE — parseProblem(utterance): identical scoring formula to
                                    intent-engine.js (+1/keyword, +2/pattern, confidence=score/max).
                                    Entity extraction is literal substring matching; an unanswered
                                    field is simply absent from extractedFacts, never a fabricated
                                    "Unknown" string.
  problem-context-builder.js       PURE — buildProblemContext(domainType): a SEPARATE composition
                                    from conversation/context/context-builder.js (importing that
                                    file would create a backwards, upstream-depends-on-downstream
                                    edge) — a second, independent consumer of the SAME underlying
                                    read-only services, never a reimplementation of what they compute.
  services/
    problem-classification-service.js  the intended single import surface — classifyProblem /
                                    classifyProblemWithContext. Builds a real Problem via
                                    reasoning/contracts/problem-contract.js#makeProblem (contract
                                    import only — never calls into reasoning/'s engines).
```

## Dependency direction (binding — extends js/v2/README.md's graph)

```
problem-intelligence/  ──depends on──>  knowledge/, organizational-memory/ (read-only, services
                        only) and reasoning/'s CONTRACTS ONLY (problem-contract.js — never
                        reasoning/'s engines or services)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/ & conversation/ &
                        reasoning/  ──never depend on──>  problem-intelligence/
problem-solving/        ──depends on──>  problem-intelligence/ (Phase 8-10, Part 4 — the
                        integration layer is the one real caller)
```

Note the asymmetry with `reasoning/`: `problem-intelligence/` imports
`reasoning/`'s Problem *contract* (a zero-dependency shape file), but
`reasoning/`'s own engines never import anything from
`problem-intelligence/` back — a `Problem` object flows from this domain
into `reasoning/diagnostic-planning-engine.js` as a plain function
argument, never an import. This is the same "shared contract, no
engine-to-engine cycle" shape `conversation/` already has with
`knowledge/`.

## What this tree does NOT do (true as of Phase 8-10)

- No AI, no LLM — see "What this is," above.
- Never decides what platform action to take — that mapping (when one
  exists at all) lives in `problem-solving/`, one layer downstream.
- Never asks a follow-up question — that is Diagnostic Planning's job
  (`reasoning/diagnostic-planning-engine.js`), one layer downstream.
- A field the utterance does not answer is never guessed — it is simply
  absent from the classified Problem's `facts`.
