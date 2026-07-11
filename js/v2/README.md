# js/v2 — V2 Architecture Foundation (Phase 3 contracts / Phase 9 first acquisition)

> Status: **dormant to the rest of the app**. No file under `js/v2/` is
> imported by anything outside this tree, and nothing here runs
> automatically. As of Phase 9 (V2.0.2), the Knowledge Platform can do real
> work when deliberately invoked — one real connector (`nor`) acquires
> Draft Knowledge from live NOR records — but no runtime behavior anywhere
> *else* in the application changes as a result of this directory existing,
> and no AI/LLM code exists anywhere in this tree. See
> `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` for the audit and the ten
> binding decisions this scaffold implements the shape of.

## What this is

The frozen V2 architecture proposal decided that **V2 is not an AI project —
V2 is a Knowledge Platform**, with AI as one replaceable, optional client of
that platform. Phase 3 built the schema-and-contract foundation for that
platform (JSDoc typedefs, frozen enums, registry interfaces). Phase 9
(V2.0.2) built the first real vertical slice on top of it — one connector
(`nor`), a generic acquisition engine, and a real Builder Stage — without
redesigning any Phase 3 shape.

Nothing in this directory calls an LLM, renders a document, or changes any
*existing* (V1) engine's behavior. Contracts stay locked interfaces;
`repository/`, `builder/`, `acquisition/`, and `connectors/` now contain
real, working logic (not `NOT_IMPLEMENTED` stubs) — `metrics/`,
`explainability/`, `review/`, and `dependency-graph/` still do.

## Layout

```
js/v2/
  knowledge/        THE PLATFORM CORE. Domain-agnostic. See knowledge/README.md.
    contracts/         typedefs + frozen shape constants — no logic
    registry/          domainType / kind / connector registries — vocabulary only
    repository/        real (Phase 5): MemoryRepository + NullRepository default
    lifecycle/         the 5-state transition graph + a pure guard check
    builder/           real orchestrator (Phase 4) + 1 real Stage, acquire-nor (Phase 9,
                       stages/ — explicit opt-in, not re-exported by builder/index.js)
    metrics/           empty KnowledgeHealthReport computer — NOT_IMPLEMENTED
    explainability/    empty provenance/corroboration describer — NOT_IMPLEMENTED
    review/            empty Draft→Candidate→Pending Review→Approved workflow — NOT_IMPLEMENTED
    dependency-graph/  empty relationship-graph accessor — NOT_IMPLEMENTED
    connectors/        1 real connector (nor) + 11 inactive placeholders (Phase 9)
    acquisition/       Connector -> Repository orchestration: Source, Batch, Session,
                       Extraction/Normalization contracts, acquisition-engine.js (Phase 9)

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

## What this tree still does NOT do (true as of Phase 9)

See each module's own README/header for its own non-goals. Platform-wide:

- No LLM/AI provider is called — every adapter under `ai-foundation/` is
  still a stub, exactly like `js/prediction/python-provider.js` today.
- No existing engine, store, or `app.js` is modified, and nothing outside
  `js/v2/` reads from it — the dormancy rule holds. `nor-connector.js`
  reads V1 read-only; it never writes back.
- No UI exists for review, metrics, or anything else in this tree.
- No document is rendered, and no document is parsed beyond a structural
  ViewModel fingerprint — no PDF/HTML is ever read as a knowledge source.
- Nothing is auto-approved — every acquired item is `lifecycleState: 'draft'`.

## Future evolution (Phase 10+, not started)

A review-queue UI, real metric computation, activating one or more of the
11 placeholder connectors (following `nor-connector.js`'s pattern), a first
real AI adapter, and reconciling this third explainability surface with the
two that already exist (`js/prediction/explainability.js`,
`js/services/dispatch-presentation.js`). None of this is in scope now.
