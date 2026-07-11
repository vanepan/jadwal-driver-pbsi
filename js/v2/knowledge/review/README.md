# knowledge/review/ — Knowledge Review Workflow (Phase 5 core / V2.0.3, Phase 9.2)

## What's real since Phase 5 (not rebuilt)

`review-workflow-engine.js` already implements the Approval Pipeline and
Rejection Pipeline in full: `submitForReview()`, `approve()`, `reject()`,
`rollback()`, each validated against `contracts/review-contract.js#isValidReviewDecision`
and performed through `lifecycle/lifecycle-engine.js`. V2.0.3 builds ON
this, never around or instead of it.

## What V2.0.3 added

- **Review Queue / Candidate Queue** (`review-queue-engine.js`) —
  implements the queue `contracts/review-contract.js`'s own header
  explicitly deferred ("does not implement a queue"). Wraps
  `repository.list({lifecycleState})` into real `ReviewQueueEntry` objects
  (the SAME typedef serves both queues — it was never scoped to Pending
  Review specifically), oldest-first, annotated with Conflict Detection.
- **Conflict Detection** (`conflict-detection-engine.js`) — `detectConflicts(items)`:
  flags when more than one *distinct payload* is simultaneously un-settled
  (Candidate or Pending Review) for the same domainType+kind. Two items
  with different `sourceRef` are NOT inherently conflicting — every source
  record is its own legitimate fact; a conflict is specifically competing
  *answers* for the same slot. Reuses `observability/contracts/
  conflict-report-contract.js` (V2.0.2.1) for the report shape — "Conflict
  Reporting" and "Conflict Detection" stay two different milestones'
  concerns, not duplicated vocabulary.
- **Review Session** (`contracts/session-contract.js` + `review-session-engine.js`) —
  mirrors `acquisition/contracts/session-contract.js`'s
  start/complete shape, applied to a human reviewer instead of a
  connector. `review-session-engine.js` wraps the real
  `submitForReview`/`approve`/`reject` primitives, adding session/event/
  history bookkeeping around calls that were already real.
- **Review Events** (`contracts/event-contract.js`) — `session_started`,
  `decision_recorded`, `session_completed`, `conflict_flagged`. Distinct
  from `lifecycle/contracts/event-contract.js`'s `LifecycleEvent` (which
  still fires for every transition, review-driven or not) — a Review Event
  is about the SESSION, not the state machine.
- **Review History** (`review-history.js`) — an audit log of
  `PromotionRecord`s across items (who approved/rejected what, when) —
  distinct from `repository.getHistory(id)` (every version of ONE item).
- **Promotion Contracts** (`contracts/promotion-contract.js`) —
  `PromotionRecord`, populated by every `review-session-engine.js` decision.
  This is the shape V2.0.4's Promotion Engine will consume; V2.0.3 only
  fixes the shape and populates it from real activity.

## Dependencies

Pure — no V1 dependency anywhere in `review/`. Safe to re-export from
`knowledge/index.js`.

## Non-goals

- No approver-authority/role check (open question, same as Phase 5 —
  `approverId` is recorded, never authorized).
- No conflict *resolution* — that's V2.0.4.
- No new lifecycle states or transitions — the five-state graph
  (`contracts/lifecycle-contract.js`) is unchanged.
