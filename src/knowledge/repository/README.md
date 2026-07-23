# knowledge/repository/ — Knowledge Repository Foundation (Phase 5, dormant)

## Purpose

Read, Write, Version, Snapshot, Rollback, Search, Identity/Dependency/
History/Metrics/Review lookup — the eleven Repository capabilities, behind
one interface any backend can implement.

## Responsibility

- `contracts/repository-contract.js` — the Repository interface + `RepositoryResult` envelope.
- `implementations/null-repository.js` — the true no-op: every method
  answers `NO_BACKEND_CONFIGURED`, never a fabricated empty result.
- `implementations/memory-repository.js` — a REAL, correct, non-durable
  Map-backed reference implementation. Enforces append-only versioning and
  legal lifecycle transitions for real. Not a production backend (no
  durability across a process restart) but not fake either — every
  operation that succeeds genuinely happened.
- `repository-registry.js` — process-wide directory + active selection,
  bootstrapped with both implementations, **`null` active by default**
  (see that file's header for why Memory is not the default).
- `knowledge-repository.js` — the public facade every other Knowledge
  module now calls through (Phase 3's original per-method stubs were
  replaced with real delegation to the active repository, once one existed
  to delegate to).

Wired consumers, now real end-to-end when `memory` is made active:
`knowledge/lifecycle/lifecycle-engine.js`, `knowledge/review/
review-workflow-engine.js`, `knowledge/metrics/knowledge-metrics-engine.js`,
`knowledge/explainability/knowledge-explainability-engine.js`, and
`knowledge/dependency-graph/knowledge-dependency-graph-engine.js` all now
delegate through this facade instead of throwing `NOT_IMPLEMENTED` — Phase
5's repository existing is exactly the trigger each of those files'
own Phase 3/4 "Future evolution" notes named.

## Dependencies

Self-contained within `knowledge/`. No Firebase, IndexedDB, SQLite, or
Vector DB — per the master prompt's explicit Phase 5 constraint.

## Non-goals

- No durable backend. `MemoryRepository`'s data is gone on process restart
  — callers needing persistence must wait for a future real backend.
- No real search index — `search()` is a naive substring scan.
- No identity generation — `create()` requires the caller to supply `id`
  (the canonical id format is still open, see `identity-contract.js`).

## Future evolution

A Firebase-backed repository implements the same
`contracts/repository-contract.js` interface and registers alongside Null
and Memory; every wired consumer above needs zero changes to use it once
`setActiveRepository('firebase')` is called.
