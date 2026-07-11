# knowledge/ — Knowledge Platform Core (Phase 3, dormant)

## Purpose

The durable, domain-agnostic core of the V2 Knowledge Platform. Everything
PBSI learns — vocabulary, structure, business rules, corrections, approved
organizational decisions — is represented as one shape (`KnowledgeItem`,
see `contracts/knowledge-item-contract.js`) regardless of which domain
(NOR, Memorandum, SOP, Engineering, Petty Cash, Executive Intelligence, …)
or which source (a document, a config file, a human correction, …) produced
it. AI is a client of this core, never a dependency of it.

## Responsibility

- Define the `KnowledgeItem` shape and the registries (`domainType`, `kind`)
  that parameterize it without hardcoding any domain into the core.
- Define the payload shape of every `kind` (Vocabulary, Terminology,
  Sentence/Paragraph/Template/Structure Pattern, Policy, Statistic, ...) in
  `language/` — the platform's internal vocabulary (Phase 3.5).
- Define the five-state lifecycle (Draft → Candidate → Pending Review →
  Approved → Deprecated) as data, plus a pure transition guard.
- Define the connector contract that every future knowledge source conforms
  to, and an empty registry for them.
- Define the explainability contract (provenance, corroboration,
  preference rationale) every Approved item must satisfy.
- Define the review/approval workflow contract that structurally enforces
  "teach once, learn forever" — no path from Draft/Candidate to Approved is
  automatic.
- Define the `KnowledgeHealthReport` metrics shape (types only).
- Define the dependency-graph contract for `relationship`-kind items.
- Provide empty skeletons (repository, builder, lifecycle engine, metrics
  engine, explainability engine, review workflow engine, dependency-graph
  engine) whose methods are locked interfaces returning `NOT_IMPLEMENTED` —
  not fake success, not partial behavior.

## Dependencies

- May reference V1 **read-only**, through `*-store.js` getters or a
  `ctx`-shaped handoff, once real connectors exist (Phase 4+). Phase 3 has
  no real connectors, so no file in this tree imports any V1 module yet.
- May be depended on by `js/v2/ai-foundation/`.
- Must never depend on `js/v2/ai-foundation/` or any AI/LLM code, in either
  direction, at any phase.

## Non-goals (Phase 3)

- No connector reads real V1 data.
- No repository persists anything — `repository/knowledge-repository.js`'s
  methods return `NOT_IMPLEMENTED` results.
- No metric is computed — `metrics/knowledge-metrics-engine.js` returns
  `NOT_IMPLEMENTED`.
- No review UI, no real approval, no real corroboration count.
- No document is parsed or mined. No domain-specific code (no `nor-*.js`)
  exists anywhere in this tree — domain specificity is data (registry
  entries) and, later, connector implementations, never core logic.

## Future evolution

Phase 4+: implement the Documents connector (NOR pilot, per the
architecture doc's §4.4), a real (in-memory, then Firebase-backed)
repository, real lifecycle persistence, real metric computation, a review
queue UI, and incremental-indexing watermarks in the builder. This document
does not commit to *when* — only to the fact that the shapes above must not
need to change to accommodate that work.
