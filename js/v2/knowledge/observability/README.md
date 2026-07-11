# knowledge/observability/ — Knowledge Observability (V2.0.2.1, Phase 9.1)

## Purpose

Platform capabilities for watching the Knowledge Platform work — no UI, no
dashboards. This directory holds the cross-cutting shapes (Progress,
Warning, Conflict Report, Import Statistics, Incremental Cursor) that don't
belong to one existing engine. Events live next to what emits them instead:

| Event family | Contract | Emitted by |
|---|---|---|
| Acquisition Events | `acquisition/contracts/event-contract.js` | `acquisition/acquisition-engine.js` via `opts.onEvent` (per-call, mirrors `builder-orchestrator.js`) |
| Repository Events | `repository/contracts/event-contract.js` | `repository/knowledge-repository.js` via `registerRepositoryListener()` (process-wide, mirrors V1's `petty-cash-store.js#registerChangeListener`) |
| Lifecycle Events | `lifecycle/contracts/event-contract.js` | `lifecycle/lifecycle-engine.js#requestTransition()` via `registerLifecycleListener()` |

A Repository Event is a storage fact ("item X now has version N"); a
Lifecycle Event is its business meaning ("item X moved candidate ->
approved") — not every `appendVersion()` is a lifecycle transition (e.g.
re-acquiring unchanged content keeps the same `lifecycleState`), so these
are deliberately separate, not one event wearing two names.

## What's here

- `contracts/progress-contract.js` — `ProgressReport`, advanced once per
  item inside `acquisition-engine.js`'s write loop; carried as the
  `detail.progress` of every `item_written`/`item_skipped` Acquisition
  Event.
- `contracts/warning-contract.js` — `KnowledgeWarning`. Real producer:
  `connectors/nor-connector.js` now maps each eligible NOR record
  independently and emits a Warning (never fails the whole fetch) for one
  that throws — extending `contracts/connector-contract.js#ConnectorResult`
  with an additive `warnings` field.
- `contracts/conflict-report-contract.js` — `KnowledgeConflictReport`,
  reusing `contracts/dependency-graph-contract.js#RELATIONSHIP_TYPE.CONFLICTS_WITH`.
  Shape only — Conflict *Detection* is V2.0.3 scope, Conflict *Resolution*
  is V2.0.4 scope; this module has no detection or resolution logic.
- `contracts/import-statistics-contract.js` — `KnowledgeImportStatistics`,
  a pure aggregator over `acquisition-engine.js#listImportReports()`'s
  in-memory log of every run's `KnowledgeImportReport`.
- `contracts/incremental-cursor-contract.js` — `IncrementalCursor`,
  interoperable with (not a duplicate of) `builder/contracts/
  context-contract.js#IndexWatermark` via `toWatermark()`/`fromWatermark()`.
  Persisted by `acquisition/cursor-store.js` (a process-wide Map — the same
  non-durable singleton idiom every registry in this tree already uses,
  not a new persistence strategy). `acquisition-engine.js#runAcquisition`
  advances a connector's cursor on every successful run;
  `runAcquisitionIncremental(connectorId)` reads it back automatically.

## Dependencies

Pure — no V1 dependency anywhere in this directory. Safe to re-export from
`knowledge/index.js` (unlike `connectors/` or `builder/stages/`).

## Non-goals

- No UI, no dashboard, no persistence beyond the existing in-memory
  singleton idiom.
- No conflict detection or resolution algorithm.
- No metrics computation of its own — `contracts/metrics-contract.js` and
  `metrics/knowledge-metrics-engine.js` (whole-repository, point-in-time
  health) are unchanged and un-duplicated; Import Statistics is a
  per-connector, per-run rollup, a different question.
