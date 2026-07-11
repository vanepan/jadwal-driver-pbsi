# document-intelligence/nor/ — NOR Intelligence Runtime (Phase 8 contracts / V2.0.6, Phase 9.5)

## Purpose

**NOR is not the platform. Knowledge is.** This directory exists only
because NOR is the architecture doc's chosen first, narrowest, best-bounded
pilot (§4.4) — it specializes Document Intelligence's generic contracts to
`domainType: 'nor'`, and nothing here defines a concept that couldn't, in
principle, be re-derived for any other domainType.

## Responsibility

- `contracts/nor-session-contract.js` — NorPromptSession, NorContext
  (thin, fixed-domainType wrappers over
  `document-intelligence/contracts/document-context-contract.js`).
- `contracts/nor-draft-contract.js` — NorDraft, NorValidation, NorReview,
  NorPreview (wrappers over `document-draft-contract.js`; NorPreview
  documents reuse of the EXISTING `buildNorViewModel`
  (`js/petty-cash/nor-document-engine.js`) rather than defining a new
  renderer).
- `contracts/nor-knowledge-contract.js` — NorKnowledgeRequest/Response, the
  shape of a query into Knowledge scoped to `domainType: 'nor'`.
- `nor-generator-contract.js` — NorGenerator shape + the standard
  `NOR_PIPELINE` instance (uses Document Intelligence's generic step
  vocabulary, fixed to `domainType: 'nor'`). Its own `proposeNorFields`
  stays a locked `NOT_IMPLEMENTED` stub by design — shape lock only, see
  its header.
- `nor-analyzer.js` / `nor-generator.js` / `nor-validator.js` /
  `nor-explainer.js` / `nor-recommender.js` (V2.0.6, Phase 9.5) — the five
  REAL pipeline steps, registered into `../registry/step-registry.js` for
  `domainType: 'nor'`. See `document-intelligence/README.md` for the full
  table of what each does.

## Dependencies

`document-intelligence/contracts/*`, `../registry/*`,
`knowledge/repository/knowledge-repository.js`,
`knowledge/services/explainability-service.js`. Cites, but does not
import, `js/petty-cash/nor-document-engine.js` and `js/docs/templates/nor*.js`
— the existing renderer this pilot feeds suggestions toward, never
replaces or calls.

## Non-goals

- Does not generate, render, or write a NOR document — `petty-cash-service.js#generateNor()`
  and `buildNorViewModel` remain the only things that do.
- Does not implement AI — every suggestion is a statistical rollup over
  Approved Knowledge (Jaccard-free, just counts/averages), never a
  generated or inferred sentence.
- Never proposes business-specific content (`norNumber`, `subject`,
  signatory names) — only structural cardinalities a population of
  Approved items can honestly support.

## Real since V2.0.6 (Phase 9.5)

`nor-generator.js#computeNorStructuralStats()` queries Approved
`domainType:'nor', kind:'structure'` Knowledge (the connector activated in
V2.0.2) and averages signatory/item counts across them —
`proposeNorFields()`'s real body, registered as the `draft` step rather
than replacing the contract file's locked stub.
