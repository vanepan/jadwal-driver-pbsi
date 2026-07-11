# knowledge/builder/ — Knowledge Builder Foundation (Phase 4, dormant)

## Purpose

Turns registered connector output into Draft `KnowledgeItem`s and hands
them to the repository — the ingestion half of the platform. Phase 4 locks
the orchestration architecture; no extraction/parsing/NLP logic exists
anywhere in this tree.

## Responsibility

- `contracts/pipeline-contract.js` — the Stage shape (mirrors the
  provider-contract pattern), Pipeline as an ordered stage-id list.
- `contracts/context-contract.js` — BuilderContext (watermarks, mode,
  cancellation token, event sink) every Stage receives.
- `contracts/state-contract.js` — the Builder's own small run-state machine
  (idle/running/completed/failed/cancelled — distinct from the Knowledge
  lifecycle), Progress, BuilderEvent.
- `contracts/error-contract.js` — BuilderError, RecoveryPoint (resume-from
  watermark shape), and a real (not stubbed) CancellationToken — plumbing,
  not business logic.
- `stage-registry.js` — process-wide Stage directory, empty until Phase 4+
  registers real stages.
- `builder-orchestrator.js` — **genuinely implemented**: `runPipeline()`
  sequences a pipeline's stages, honors cancellation, drives the state
  machine, and emits events. This is real control-flow, not a stub —
  running a pipeline with zero registered stages is a true, honestly
  reported outcome ("0 stages, 0 items"), not a placeholder success.
- `knowledge-builder.js` — the public `runIncremental()` / `runFull()`
  entry points, building a Pipeline from whatever is currently registered.

## Dependencies

Everything above is self-contained within `knowledge/builder/`. No V1
import exists yet — a real Stage (Phase 4+) will wrap one connector's
`fetch()`, at which point that stage file imports the connector, not this
orchestration layer.

## Non-goals

- No extraction, parsing, OCR, or NLP anywhere in this tree.
- No stage is registered — `runIncremental()`/`runFull()` today complete
  immediately having processed zero items, truthfully.
- No persistence — a stage that writes to the repository does so inside
  its own `run()`, once one exists.

## Future evolution

Phase 4+ implements real Stages (e.g. "fetch from connector X, validate
against `KnowledgeItem` contract, hand off to repository") and registers
them; `builder-orchestrator.js`'s loop does not change to run them.
