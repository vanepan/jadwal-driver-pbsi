# src/intelligence/nor-registry — Canonical NOR Registry (V2, Phase 0)

> Status: **contract + facade only**. The active backend is the Null backend, so
> every write returns `NOT_IMPLEMENTED`. No existing module is rewired yet.

## Why this exists

Today a NOR number is free text. `js/petty-cash/petty-cash-service.js#generateNor()`
only checks that `norNumber` is non-empty — there is no allocation, no
uniqueness guarantee, and nothing stopping a second module from issuing the same
number. As soon as Sarpras Intelligence can also produce NORs, duplicate numbers
become inevitable.

This registry is the fix: **one place** that owns NOR identity and NOR numbering,
independent of whichever module generated the document.

```
Petty Cash ─────┐
Sarpras Intel ──┼──▶  NOR Registry  ──▶  active backend
Future module ──┘         │
                          └── suggestNextNumber(domainType)   (advisory only)
```

## Canonical identity (PART 10)

`nor-record-contract.js#NorRecord`: `norId`, `norNumber`, `sourceModule`
(registry-backed — `registerNorSourceModule`, never a hardcoded switch),
`sourceFeature`, `documentType`, `title`, `subject`, `recipient` (**contextual,
never a fixed constant** — PART 15), `createdAt`, `createdBy`, `status`,
`currentVersion`, `publishedVersion`, `numberSource`, `content` (opaque
view-model payload), `metadata`, `auditHistory`.

## Lifecycle (PART 13)

```
draft → in_review → approved → published → superseded
        └──────────┘ (revise)
```

`in_review → approved` and `approved → published` are **human-gated** — nothing
enters them automatically. An edit is a **new version**, never an overwrite.
An AI-produced draft is never automatically the published document.

## Numbering ownership (PART 11–12)

| Concept | Where it lives | Phase 0 status |
|---|---|---|
| **Suggested number** (advisory, editable) | `organizational-memory/numbering-engine.js#suggestNextNumber` — re-exported by `nor-numbering-contract.js` | **Real** — pattern inference over the archive; honest (confidence 0) when no pattern exists |
| **Published number** (reserved + validated at issuance) | `nor-numbering-contract.js#reserveNumber` → future server-side, precedent `functions/src/reimbursement/counter.js#acquireReimbursementNumber` | **`NOT_IMPLEMENTED`** — contract + ownership only |

`makeNumberAllocation()` carries both, plus `source` (`system_suggested` /
`user_edited` / `reserved`) so the registry always distinguishes an autofilled
suggestion from an officially issued number.

## Not in Phase 0

- No Firebase/RTDB backend.
- No migration of Petty Cash's `generateNor()` onto this registry (PART 11
  explicitly defers this).
- No number reservation.
