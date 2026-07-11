# js/v2 — V2 Architecture Foundation (Phase 3)

> Status: **dormant scaffold**. No file under `js/v2/` is imported by anything
> outside this tree. No runtime behavior anywhere in the application changes
> as a result of this directory existing. This is architecture only — see
> `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` for the audit and the ten
> binding decisions this scaffold implements the shape of.

## What this is

The frozen V2 architecture proposal decided that **V2 is not an AI project —
V2 is a Knowledge Platform**, with AI as one replaceable, optional client of
that platform. This directory is the schema-and-contract-only Phase 3
foundation for that platform. It defines *shapes* (JSDoc typedefs, frozen
enums, registry interfaces, stub functions that return `NOT_IMPLEMENTED`) so
that Phase 4+ can build real connectors, a real repository, and real
providers against a stable contract — without redesigning it.

Nothing in this directory computes, persists, calls an LLM, parses a
document, or changes any existing engine's behavior. Every "engine" file here
is a locked interface, not an implementation.

## Layout

```
js/v2/
  knowledge/        THE PLATFORM CORE. Domain-agnostic. See knowledge/README.md.
    contracts/         typedefs + frozen shape constants — no logic
    registry/          domainType / kind / connector registries — vocabulary only
    repository/        empty repository skeleton — NOT_IMPLEMENTED
    lifecycle/         the 5-state transition graph + a pure guard check
    builder/           empty builder skeleton — NOT_IMPLEMENTED
    metrics/           empty KnowledgeHealthReport computer — NOT_IMPLEMENTED
    explainability/    empty provenance/corroboration describer — NOT_IMPLEMENTED
    review/            empty Draft→Candidate→Pending Review→Approved workflow — NOT_IMPLEMENTED
    dependency-graph/  empty relationship-graph accessor — NOT_IMPLEMENTED
    connectors/        README only — zero connectors implemented

  ai-foundation/     ADAPTER LAYER ONLY. May depend on knowledge/. See ai-foundation/README.md.
    contracts/         the Adapter contract (mirrors js/prediction/prediction-provider.js)
    registry/          adapter registry (mirrors js/prediction/prediction-provider.js's registry)
    adapters/          claude / openai / local-model — all NOT_IMPLEMENTED stubs

  document-intelligence/  first CONSUMER of knowledge/ (Phase 7). See document-intelligence/README.md.
    contracts/         Analyzer/Classifier/Intent/Structure, Context/Session, Draft/Validation/Explanation/Recommendation, Pipeline
    registry/          analyzer registry — empty
    nor/               the NOR pilot (Phase 8) — see document-intelligence/nor/README.md

  index.js           dormant barrel — a structural no-op proving nothing auto-runs
```

## Dependency direction (binding, from §4.1 of the architecture doc)

```
ai-foundation/  ──depends on──>  knowledge/
knowledge/      ──never depends on──>  ai-foundation/ or any AI/LLM code
knowledge/      ──depends on──>  V1, read-only, through *-store.js getters or a ctx-shaped handoff
V1 (js/app.js, any *-store.js, any engine)  ──never depends on──>  js/v2/*
```

- `knowledge/` must be fully buildable, queryable, and reviewable with **zero**
  AI providers registered, forever — not just at Phase 3.
- Nothing outside `js/v2/` may import from `js/v2/`. This is the dormancy
  rule: it is enforced by convention right now (Phase 3 — nothing wires it in)
  and should be enforced by lint/CI once Phase 4 starts writing real callers.
- `domainType` and `kind` are registry-backed values (see
  `knowledge/registry/`), never a hardcoded switch inside repository or
  lifecycle code — adding a new domain must never require touching
  `knowledge/repository/` or `knowledge/lifecycle/`.

## What Phase 3 explicitly does NOT do

See each module's own README/header for its own non-goals. Platform-wide:

- No real connector reads any V1 data yet.
- No repository persists anything (in-memory or otherwise) — the repository
  skeleton's methods return `NOT_IMPLEMENTED` results, they do not fake success.
- No LLM/AI provider is called — every adapter is a stub, exactly like
  `js/prediction/python-provider.js` today.
- No existing engine, store, or `app.js` is modified or reads from `js/v2/`.
- No UI exists for review, metrics, or anything else in this tree.
- No document is parsed, extracted, indexed, or mined.

## Future evolution (Phase 4+, not started)

Real connector implementations (Documents connector piloted against NOR per
the architecture doc's §4.4), a real repository (in-memory or Firebase-backed
via a provider adapter, mirroring `js/engineering/providers/`), real metric
computation, a review-queue UI, a first real AI adapter, state-machine and
module-registry generalization, and reconciling this third explainability
surface with the two that already exist (`js/prediction/explainability.js`,
`js/services/dispatch-presentation.js`). None of this is in scope now.
