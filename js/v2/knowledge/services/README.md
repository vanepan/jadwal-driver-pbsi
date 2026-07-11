# knowledge/services/ — Knowledge Services (Phase 6, dormant)

## Purpose

The clean, public-facing façade layer over Phase 3–5's engines and
repository — one focused module per concern, so a future UI or Document
Intelligence consumer never reaches past `knowledge/services/` into an
engine or the repository directly.

## Responsibility

Fourteen services: the original eleven named in the master prompt's Phase 6
list — Review, Metrics, Explainability, Dependency Graph, Health,
Versioning, Lifecycle, Source Weight, Validation, Identity, Registry — plus
three added in V2.0.12: Confidence, Statistics, Knowledge Graph. Every one
of them is **pure delegation/composition** — no service computes anything
an underlying engine, contract, or registry doesn't already compute. Where
two services both need the same underlying call (e.g. `review-service.js`
and `versioning-service.js` both expose a `rollback`), the barrel
(`index.js`) namespaces them (`review.rollback` vs. `versioning.rollback`)
rather than picking a winner.

`knowledge-graph-service.js` intentionally contains no traversal logic
itself — the BFS loop lives in
`dependency-graph/knowledge-graph-engine.js`, keeping every file in this
directory zero-logic re-export, with no carve-out even for multi-hop reads.

## Dependencies

Only modules already built in Phases 3–5 (`knowledge/contracts/`,
`knowledge/language/`, `knowledge/registry/`, `knowledge/repository/`,
`knowledge/lifecycle/`, `knowledge/review/`, `knowledge/metrics/`,
`knowledge/explainability/`, `knowledge/dependency-graph/`,
`knowledge/builder/stage-registry.js`). `registry-service.js` deliberately
does NOT import `js/v2/ai-foundation/` — Knowledge must never depend on
ai-foundation, in either direction, at any phase.

## Non-goals

- No new business logic anywhere in this directory — if a service needs
  logic an engine doesn't already have, that logic belongs in the engine,
  not the service.
- No authorization/role check (`review-service.js`'s `approve`/`reject`
  still carry the open approver-authority question from
  `contracts/review-contract.js`).
- No caching — every call recomputes/re-reads from the live repository.

## Future evolution

This is the layer a review-queue UI, a health dashboard, and Document
Intelligence (Phase 7+) are all expected to import from — none of them
should ever need to import an engine or the repository facade directly.
