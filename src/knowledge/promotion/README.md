# knowledge/promotion/ — Knowledge Promotion (V2.0.4, Phase 9.3)

## The five-state graph (unchanged)

```
Draft -> Candidate -> Pending Review -> Approved -> Deprecated
```

This graph (`contracts/lifecycle-contract.js`) and its guard
(`lifecycle/lifecycle-engine.js#requestTransition`) are frozen — V2.0.4
adds no new state and no new edge. What it adds is **named verb coverage**
for edges that previously had none.

## Promotion Engine (`promotion-engine.js`)

Before V2.0.4, only three edges had a named verb (all in
`review/review-workflow-engine.js`, real since Phase 5):
`submitForReview` (candidate → pending_review), `approve` (→ approved),
`reject` (pending_review → candidate). Draft → Candidate and
(Candidate|Pending Review|Approved) → Deprecated had **no** named verb —
only a raw `lifecycle-engine.requestTransition()` call could do it. This
file adds exactly those two:

- `promoteToCandidate(id, opts)` — Draft → Candidate.
- `deprecate(id, reason, opts)` — → Deprecated, from any of the three
  states the lifecycle graph allows it from.

Neither is human-gated (`HUMAN_GATED_STATES = [APPROVED]` only) — reaching
Approved still only ever happens through `review-workflow-engine.js#approve()`.
Every verb here records a `review/contracts/promotion-contract.js#PromotionRecord`
into the SAME `review/review-history.js` log V2.0.3 built (one history, not
a second competing one) and emits a `PromotionEvent`.

`rollbackPromotion()` is a thin wrapper around the already-real
`review-workflow-engine.js#rollback()` — Rollback Engine was Phase-5 work,
not rebuilt; this only adds the same PromotionRecord/event bookkeeping the
other verbs have. "Version Promotion" (a promotion is always a NEW
version, append-only, never an overwrite) is likewise already guaranteed
by `identity-contract.js#nextVersion` + `memory-repository.js` — no
separate module was needed for it.

## Conflict Resolution (`conflict-resolution-engine.js`)

Acts on a `KnowledgeConflictReport` (shape: V2.0.2.1, detection: V2.0.3).
`resolveConflict(report, winnerId)` deprecates every OTHER item in the
report — it does **not** auto-approve the winner. Resolving a conflict
means "stop these competitors from being reviewable," not "this one is
now correct" — that judgment still requires an explicit
`review-workflow-engine.js#approve()` call with a `preferenceRationale`,
same as any item (Decision 6, "teach once, learn forever").

## Knowledge Merge Contracts (`contracts/merge-contract.js`, `knowledge-merge-engine.js`)

`KnowledgeMergeProposal` is the shape; `mergePayloads()` is deliberately
**one honest, generic reference strategy** — a shallow, last-item-wins
field merge, the same "reference implementation, not a real X" honesty as
`memory-repository.js`'s naive `search()`. A real per-`kind` reconciliation
strategy (e.g. union two vocabulary lists instead of overwriting) is
future work this contract doesn't foreclose but doesn't fake either.
`proposeMergedDraft()` never writes to the repository and never
auto-promotes — it returns a new **Draft** item that re-enters the exact
same acquisition → review → promotion pipeline as any connector's output.

## Dependencies

Pure — no V1 dependency anywhere in `promotion/`. Safe to re-export from
`knowledge/index.js`.

## Non-goals

- No new lifecycle state or transition.
- No automatic approval, ever, from any verb in this directory.
- No domain-aware merge semantics — `mergePayloads()` is intentionally
  naive.
