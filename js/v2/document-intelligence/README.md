# document-intelligence/ — Document Intelligence Foundation (Phase 7, dormant)

## Purpose

The first CONSUMER of the Knowledge Platform (per the architecture doc's
layering — a peer to Analytics/Prediction/Recommendation/Executive
Intelligence, not a new core). Reminder embedded in every file here: **NOR
is not the platform, Knowledge is** — this directory is domain-agnostic;
NOR-specific work is scoped under `document-intelligence/nor/` (Phase 8).

## Responsibility

- `contracts/document-analysis-contract.js` — Analyzer, Classifier, Intent,
  Structure (describing an EXISTING document — never generating one).
- `contracts/document-context-contract.js` — Context, Session, and its own
  small state machine (deliberately distinct from the Knowledge lifecycle).
- `contracts/document-draft-contract.js` — Draft, Validation, Explanation,
  Recommendation (a proposed document as DATA, never a rendered artifact).
- `contracts/document-pipeline-contract.js` — Pipeline as an ordered step
  list, mirroring `knowledge/builder/contracts/pipeline-contract.js`'s
  Stage pattern.
- `registry/document-registry.js` — empty Analyzer registry.
- `document-intelligence-engine.js` — a `NOT_IMPLEMENTED` stub (unlike the
  Knowledge Builder's real orchestrator, Phase 7 is explicitly
  architecture-only — no working control-flow yet).

## Dependencies

May read `js/v2/knowledge/` (via `knowledge/services/`, once a real
consumer needs to) — one-way, same as `ai-foundation/`'s relationship to
`knowledge/`. Must never be depended on BY `knowledge/`. Reuses (by
reference, not by import) the existing V1 Document Engine's proven
pipeline: domain module → view-model builder → template function →
renderer (`js/reimbursement.js` is the audit's cited reference
implementation) — Document Intelligence's job is to describe and
recommend, never to re-render.

## Non-goals

- No document generation, no NOR generation, no templates, no PDF/Excel/
  HTML rendering — that remains the existing Document Engine's job
  (`js/docs/doc-engine.js`), reused, never duplicated.
- No analyzer is implemented or registered.
- No AI/LLM call — any future analyzer wanting one goes through
  `js/v2/ai-foundation/`, never calls a provider directly.

## Future evolution

Phase 8 (NOR Intelligence) is the first pilot — see
`document-intelligence/nor/README.md`.
