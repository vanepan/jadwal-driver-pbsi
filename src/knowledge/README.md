# knowledge/ — Knowledge Platform Core (Phase 3 contracts / Phase 9 first acquisition)

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
  to, and a registry holding it — `nor` (real) plus 11 inactive placeholders
  (Phase 9, see `connectors/README.md`).
- Define the acquisition layer (`acquisition/`, Phase 9) that sits between
  a Connector and the Repository — Source, Batch, Extraction Context/Error,
  Normalization, Acquisition Session/Result, and Import Report — and the
  one generic engine (`acquisition/acquisition-engine.js`) that writes every
  connector's Draft output to the repository, idempotently.
- Define the explainability contract (provenance, corroboration,
  preference rationale) every Approved item must satisfy.
- Define the review/approval workflow contract that structurally enforces
  "teach once, learn forever" — no path from Draft/Candidate to Approved is
  automatic.
- Define the `KnowledgeHealthReport` metrics shape (types only).
- Define the dependency-graph contract for `relationship`-kind items.
- `repository/` (Phase 5) is real — `MemoryRepository` enforces append-only
  versioning and legal lifecycle transitions; `NullRepository` stays the
  default backend. `builder/` (Phase 4) orchestration is real
  (`runPipeline`, `runIncremental`/`runFull`); metrics/explainability/
  review-workflow/dependency-graph engines remain locked
  `NOT_IMPLEMENTED` interfaces.

## Dependencies

- `nor-connector.js` (Phase 9) reads V1 **read-only**, through
  `js/petty-cash/petty-cash-store.js` getters and
  `js/petty-cash/nor-document-engine.js#buildNorViewModel` — the first real
  exercise of the read-only seam Phase 3 reserved. It self-registers and is
  never eagerly imported by this barrel (see `index.js`'s own header) —
  activating it is always a deliberate act by the caller.
- May be depended on by `js/v2/ai-foundation/`.
- Must never depend on `js/v2/ai-foundation/` or any AI/LLM code, in either
  direction, at any phase.

## Non-goals (still true as of Phase 9)

- No metric is computed — `metrics/knowledge-metrics-engine.js` returns
  `NOT_IMPLEMENTED`.
- No review UI, no real approval, no real corroboration count — every
  acquired item lands as `lifecycleState: 'draft'`, never auto-approved.
- No document is parsed or mined beyond structural ViewModel fingerprints.
  No AI, no LLM, no document generation exists anywhere in this tree.
- NOR-specific code is confined to the connector seam
  (`connectors/nor-connector.js`, `builder/stages/nor-acquisition-stage.js`)
  — `acquisition/acquisition-engine.js` and every core contract remain
  domain-agnostic.

## Future evolution

Phase 10+: a review-queue UI, real metric computation, activating one or
more of the 11 placeholder connectors, and (independently) a first real AI
adapter under `ai-foundation/`. This document does not commit to *when* —
only to the fact that the shapes above must not need to change to
accommodate that work.
