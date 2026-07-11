# document-intelligence/ — Document Intelligence Runtime (Phase 7 core / V2.0.6, Phase 9.5)

## What's real now

- `document-intelligence-engine.js#runPipeline(pipeline, context)` — real,
  reusing `knowledge/builder/builder-orchestrator.js`'s sequencing pattern
  (and its event shape, `BUILDER_EVENT_TYPE`/`makeBuilderEvent`, imported
  directly rather than re-invented) exactly as this file's own Phase 7 stub
  header said to do once a working orchestrator was wanted.
- `registry/step-registry.js` — real, mirrors
  `knowledge/builder/stage-registry.js`, keyed by `${domainType}:${step}`.
- `registry/document-registry.js` — real: `nor-analyzer` is registered.
- `session-store.js` — the real `DocumentSession` store
  `contracts/document-context-contract.js`'s own header deferred to "once
  a real Analyzer/Generator exists."
- `knowledge/services/trace-service.js` — "Knowledge Trace": a composition
  of three already-real capabilities (`explain`, `getKnowledgeEvolution`,
  `getDependencies`), not a new computation.

## The NOR pilot (`nor/`)

Five real steps, each registered against `step-registry.js` for
`domainType: 'nor'`:

| Step | File | What it does |
|---|---|---|
| analyze | `nor-analyzer.js` | Classifies as `nor` (confidence 1 — fixed by construction) and names the real ViewModel sections. |
| draft | `nor-generator.js` | Proposes **structural suggestions only** (signatory/item-count typical values) from Approved `nor`/`structure` Knowledge. |
| validate | `nor-validator.js` | Mirrors `petty-cash-service.js#generateNor()`'s two guard clauses as a read-only, advisory precheck. |
| explain | `nor-explainer.js` | Reuses `explainability-service.js#explain` for every cited knowledge id. |
| recommend | `nor-recommender.js` | Reuses the same stats `nor-generator.js` computed — never recomputed twice. |

**What Draft Composition deliberately never does**: propose `norNumber`,
`subject`, recipients, or any other field whose correct value is
genuinely business-specific data this platform has no statistical basis
to invent. That would be a fake implementation. What's honestly
inferable from a population of Approved structural facts is
*cardinalities* — a human still fills in and reviews everything else.

**The existing NOR/Document Engine is never touched or replaced.**
`nor-generator.js` never calls `buildNorViewModel` or
`petty-cash-service.js#generateNor()` — it only reads Approved Knowledge
and proposes suggestions a human takes into the *existing*, unchanged NOR
flow.

nor-generator-contract.js's own `proposeNorFields` stub is left untouched
(it's a shape lock, not an implementation site — see its header); the real
implementation lives in `nor-generator.js` instead, registered as the
pipeline's `draft` step.

## Dependency direction

`document-intelligence/` may read `knowledge/`, never the reverse — this
was already the rule (Phase 7), unchanged. `nor/index.js` is still an
explicit opt-in surface, not re-exported by `document-intelligence/index.js`
— importing it is the deliberate act that registers the NOR pilot's
steps, same convention as `knowledge/connectors/index.js` and
`knowledge/builder/stages/index.js`. Unlike `knowledge/connectors/nor-connector.js`,
none of `document-intelligence/nor/`'s new files import any V1/Firebase
module — they only read the Knowledge repository — so this barrel carries
no dormancy risk beyond "don't auto-register a domain pilot nobody asked
for."

## Non-goals

- No AI, no LLM, no prompt interpretation — see V2.0.7 for why that's a
  separate, later decision.
- No document is rendered — `js/docs/*` remains the only renderer.
- No production integration — nothing outside `js/v2/` calls any of this.
