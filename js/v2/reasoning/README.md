# js/v2/reasoning — Organizational Reasoning Foundation (Phase 4-7)

> Status: architecture-and-engine-real, same posture `conversation/` had
> before Phase 6 gave it a real implementation with no UI caller yet. Built,
> tested (`scripts/reasoning-engine-check.mjs`, `scripts/knowledge-gap-check.mjs`,
> `scripts/diagnostic-planning-check.mjs`), and REACHABLE, but no UI mounts
> it directly — `conversation/dynamic-conversation-engine.js` (Phase 4-7,
> Part 4) and `problem-solving/services/problem-solving-service.js`
> (Phase 8-10, Part 4) are its real callers so far. See
> `js/v2/dormant-subsystems.js` for how a built-but-unwired capability is
> declared, not silently rendered as a zero.

## What this is

Reasoning is the layer that answers the two questions
`SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md` (§3.1, §7) found no home
for anywhere in this platform: **Diagnosis** ("what does the evidence
actually support?") and the general form of **Reasoning** ("what applies
here, and does anything conflict?") — distinct from `document-intelligence/
nor/nor-recommender.js`'s own deliberately narrow, NOR-only statistical
rollups, which this tree does not replace or duplicate.

No AI. No LLM. No probabilistic guessing anywhere in this tree — every
number is plain arithmetic over already-real, already-Approved fields (a
rule's own `confidence`, a conflict count). `ai-foundation/` remains the
only place a future LLM adapter could ever plug in, and nothing here
depends on it (Architecture Assessment §7, constraint #3).

## Layout

```
js/v2/reasoning/
  contracts/
    problem-contract.js            Problem — the one input shape (domainType, description, facts)
    rule-application-contract.js   RuleApplication — one candidate rule's applicability verdict
    recommendation-contract.js     Recommendation — the one output shape; NEVER valid with zero citations
    knowledge-gap-contract.js      KnowledgeGap — Part 3's six gap types; reuses
                                    knowledge/language/contracts/question-tree-contract.js for
                                    `recommendedQuestion`, never redefines it
    hypothesis-contract.js         Phase 8-10 — Hypothesis: one candidate cause, cite-or-abstain
                                    (zero evidenceRefs is structurally invalid, same discipline as
                                    Recommendation), HYPOTHESIS_STATUS (candidate/confirmed/ruled_out)
    diagnostic-plan-contract.js    Phase 8-10 — DiagnosticPlan: hypotheses + missingInformation
                                    (KnowledgeGap[], reused verbatim) + one recommendedNextQuestion

  rule-applicability-engine.js     PURE — isApplicable(rule, problem): a rule/policy payload MAY
                                    carry `appliesWhen: {field: value}`; absent, it is a domain-wide
                                    rule. A convention layered ON payload, never a schema change.
  conflict-detection-engine.js     Reuses the EXISTING, real `conflicts_with` relationship type
                                    (knowledge/contracts/dependency-graph-contract.js) — introduces
                                    no new relationship type, no new storage.
  reasoning-engine.js               reason(problem) — Knowledge Lookup -> Applicable Rules ->
                                    (prioritize by carried-through confidence) -> conflict check ->
                                    Recommendation, cited, confidence-scored, explained. Cite-or-abstain:
                                    zero applicable Approved knowledge returns NO_APPLICABLE_KNOWLEDGE,
                                    never a guess.
  knowledge-gap-engine.js           detectKnowledgeGaps(domainType) — compares a domainType's own
                                    Approved `kind:'ontology'` asset (the checklist) against what is
                                    actually Approved; every mismatch is one KnowledgeGap. A DIFFERENT
                                    concept from organizational-memory/gap-detection-engine.js's
                                    ArchiveGap (a missing NOR NUMBER) — see that contract's own header.
  hypothesis-engine.js              Phase 8-10 — generateHypotheses(problem)/updateHypotheses(): PURE,
                                    cite-or-abstain candidate-cause scoring by plain keyword overlap
                                    against the Problem's own facts — never a model call.
  diagnostic-planning-engine.js     Phase 8-10 — planDiagnosis(problem, candidateFields): composes
                                    knowledge-gap-engine.js + hypothesis-engine.js into ONE
                                    DiagnosticPlan, plus a SELF-CONTAINED hypothesis-discrimination
                                    question ranker (deliberately NOT importing conversation/'s
                                    prioritizeQuestions() — a different ranking criterion, and
                                    reasoning/ must never depend on conversation/).

  services/
    reasoning-service.js            the intended single import surface — reason / detectKnowledgeGaps /
                                    reasonWithGaps / planDiagnosis / generateHypotheses /
                                    updateHypotheses (Phase 8-10, purely additive exports). Holds no
                                    repository of its own: every output here is computed fresh every
                                    call from whatever is Approved right now, never persisted.
```

## Dependency direction (binding — extends js/v2/README.md's graph)

```
reasoning/   ──depends on──>  knowledge/ (read-only, through services/ only — never a repository,
                               never an engine that itself owns writes)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/ & conversation/
             ──never depend on──>  reasoning/
conversation/ ──depends on──>  reasoning/ (Part 4 — dynamic-conversation-engine.js is reasoning/'s
                               one real caller)
problem-intelligence/ ──depends on──>  reasoning/ (Phase 8-10 — CONTRACT ONLY, problem-contract.js;
                               problem-intelligence/ never imports a reasoning/ ENGINE, and no
                               reasoning/ engine ever imports problem-intelligence/ back — a Problem
                               flows in as a plain function argument, not an import, the identical
                               "shared contract, no engine-to-engine cycle" shape conversation/ has
                               with knowledge/)
problem-solving/      ──depends on──>  reasoning/ (Phase 8-10 — the integration layer)
ui/          ──may depend on──>  reasoning/ (not exercised this phase — no UI caller exists yet,
                               same "architecture-only" precedent as Phase 6's conversation/)
```

This is a strict extension: no edge that existed before this phase changes
direction. Reasoning sits downstream of `knowledge/`, exactly where
`conversation/` already sits, and upstream of nothing — nothing under
`knowledge/`, `organizational-memory/`, `learning/`, or
`document-intelligence/` may ever import `reasoning/` (checked by
`scripts/reasoning-engine-check.mjs`, not by discipline alone).

## What this tree does NOT do (true as of Phase 4-7)

- Never writes to the Knowledge Repository, never auto-promotes anything —
  a Recommendation and a KnowledgeGap are both read-only advisory output.
  Acting on either still goes through the same, unmodified
  `knowledge-service.js#promoteKnowledge` human gate every other
  KnowledgeItem does.
- Never generates NOR — `reasoning/` itself contains no document logic;
  `document-intelligence/nor/nor-composer.js` (Phase 8-10, a sibling
  domain) is what composes a draft, and only from an already-complete
  Conversation's genuinely known facts, never from `reasoning/` directly.
- Never implements a Learning Loop — a Recommendation is not recorded as a
  `LearningEvent` by this tree; that remains explicitly out of scope for
  this phase (see the phase's own constraints).
- Never picks a winner between conflicting rules — a detected conflict
  always lowers a Recommendation's confidence and is surfaced verbatim.
- Never calls an AI/LLM provider — see "What this is," above.

## Future evolution

A future phase may record a promoted Recommendation as a `LearningEvent`
(mirroring how Knowledge Approval already is, per `learning/services/
learning-service.js`) — explicitly deferred, not started here. A future
`ai-foundation` adapter could supply one more piece of cited evidence
inside a rule's own knowledge context — never a replacement for the
citation discipline `recommendation-contract.js#isRecommendation` enforces.
