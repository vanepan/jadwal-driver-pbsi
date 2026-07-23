# knowledge/builder/ — Knowledge Builder Foundation (Phase 4 core / Phase 9 stage)

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
- `stage-registry.js` — process-wide Stage directory. Empty by default; one
  real Stage exists (`stages/nor-acquisition-stage.js`, id `acquire-nor`,
  wrapping `acquisition/acquisition-engine.js`'s `runAcquisition('nor', …)`)
  but is only registered when `stages/index.js` is explicitly imported —
  see Dependencies below.
- `builder-orchestrator.js` — **genuinely implemented**: `runPipeline()`
  sequences a pipeline's stages, honors cancellation, drives the state
  machine, and emits events. This is real control-flow, not a stub —
  running a pipeline with zero registered stages is a true, honestly
  reported outcome ("0 stages, 0 items"), not a placeholder success.
- `knowledge-builder.js` — the public `runIncremental()` / `runFull()`
  entry points, building a Pipeline from whatever is currently registered.

## Dependencies

`contracts/`, `stage-registry.js`, `builder-orchestrator.js`, and
`knowledge-builder.js` are self-contained and V1-free — importing
`builder/index.js` never loads a real Stage. `stages/nor-acquisition-stage.js`
is the one file with a real dependency chain (via `connectors/nor-connector.js`
→ `js/petty-cash/*` → `js/firebase.js`'s CDN-hosted SDK), which is why it —
and its `stages/index.js` bootstrap — is **not** re-exported by
`builder/index.js` or `knowledge/index.js`. A caller that wants NOR acquired
imports `knowledge/builder/stages/index.js` explicitly.

## Non-goals

- No extraction, parsing, OCR, or NLP anywhere in this tree — NOR's
  extraction logic lives in `connectors/nor-connector.js`, not here.
- Only one stage exists (`acquire-nor`) — `stage-registry.js` stays empty
  for any caller that hasn't explicitly imported `stages/index.js`, and
  `runIncremental()`/`runFull()` still truthfully report "0 stages, 0
  items" in that case.
- No persistence logic of its own — `acquire-nor`'s `run()` delegates to
  `acquisition/acquisition-engine.js`, which is the only module that talks
  to the repository.

## Future evolution

Additional Stages follow `nor-acquisition-stage.js`'s pattern: wrap
`acquisition-engine.runAcquisition(connectorId, …)` for a newly-activated
connector and register under `stages/index.js`. Placeholder connectors
deliberately get no stage until they're activated — see
`connectors/README.md`'s note on why `builder-orchestrator.runPipeline`
would otherwise fail the whole run on the first `NOT_IMPLEMENTED` stage.
