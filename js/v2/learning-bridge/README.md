# learning-bridge/ — Universal Learning Engine, Body Pull Adapter (Phase 12.6.6)

## Why this domain exists, separate from both `body/` and `learning/`

`js/v2/body/README.md`'s dependency graph forbids `learning/` (among
others) from ever depending on `body/`. `js/v2/learning/services/
learning-service.js`'s own header states Learning "depends on nothing
above it." Both rules are correct and neither should be weakened — but
Body's experience (`BodyEvent`: `ENTITY_OBSERVED`/`STATE_CHANGED`/
`RELATIONSHIP_OBSERVED`/`SENSE_FAILED`) accumulates independently via a
**pull**-based sensing cycle, structurally unlike every other domain that
feeds Learning today by pushing at its own call site. Something has to see
both `body/` and `learning/` to bridge that gap. Nothing inside either
domain is allowed to be that thing — so this is a new, separate,
cross-cutting domain, mirroring `problem-solving/`'s exact precedent as
"the ONE layer allowed to see all."

## Layout

```
learning-bridge/
  adapters/
    body-signal-adapter.js           PURE: BodyEvent -> LearningSignal seed.
                                      Imports only body/contracts/body-event-
                                      contract.js (a bare, zero-dependency
                                      contract leaf — vocabulary, not an
                                      engine; same reuse precedent
                                      identity-contract.js#nextVersion and
                                      warning-contract.js already establish).
  services/
    body-learning-bridge-service.js  IMPURE: the one orchestrator. Reads
                                      body/repository/body-event-repository.js
                                      #list() (read-only, never append()),
                                      maps each event, calls
                                      learning/services/learning-signal-
                                      service.js#emitLearningSignal() — the
                                      SAME entry point any other domain
                                      would call directly.
```

## Dependency direction (binding, extends js/v2/README.md's graph)

```
learning-bridge/  ──depends on──>  body/ (read-only: body-event-repository.js's
                    list() only — never append())
learning-bridge/  ──depends on──>  learning/ (via learning-signal-service.js#
                    emitLearningSignal() only — never learning-repository.js)
body/ & learning/ ──never depend on──>  learning-bridge/
```

Strict extension of the existing graph — no existing edge changes
direction.

## What this domain does NOT do (true as of Phase 12.6)

- No scheduler, no cron trigger, no live caller anywhere in this phase.
  `pullBodyEventsAsSignals()` is structurally complete and fully tested
  against fixture `BodyEvent`s, but nothing calls it outside
  `scripts/learning-bridge-check.mjs` — the same "structurally complete,
  deferred live wiring" precedent `js/v2/body/context/
  body-context-builder.js` already sets.
- No write path into `body/`, anywhere — this domain only ever calls
  `body-event-repository.js#list()`, never `append()`.
- No second Learning ledger — every mapped signal terminates in the
  existing, unmodified `recordLearningEvent()` via `emitLearningSignal()`.
- No UI, no AI, no ML.
