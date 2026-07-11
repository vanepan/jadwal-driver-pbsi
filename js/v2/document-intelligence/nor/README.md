# document-intelligence/nor/ — NOR Intelligence Foundation (Phase 8, dormant)

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
  vocabulary, fixed to `domainType: 'nor'`).

## Dependencies

`document-intelligence/contracts/*` only. Cites, but does not import,
`js/petty-cash/nor-document-engine.js` and `js/docs/templates/nor*.js` — the
existing renderer this pilot will eventually feed, never replace.

## Non-goals

- Does not generate a NOR document.
- Does not implement AI, templates, or PDF rendering.
- No NorGenerator is implemented or registered — `proposeNorFields()` is a
  `NOT_IMPLEMENTED` stub.

## Future evolution

A real pilot implementation (beyond this architecture-only phase) reads
Approved `domainType: 'nor'` Knowledge (template_pattern/vocabulary items,
once a Documents connector exists — still unimplemented, see
`knowledge/connectors/README.md`) and proposes field values a human reviews
before they reach the unchanged existing `buildNorViewModel` renderer.
