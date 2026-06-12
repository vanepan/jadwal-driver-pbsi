# Analytics V2 — Governance Recommendation

**Project:** Sarpras Operations · v1.10.0 — Analytics Experience Redesign
**Phase:** 2 (Analytics Governance Review)
**Status:** Architecture review — no code written
**Last updated:** 2026-06-12

---

## 1. The problem, stated precisely

Today **every record in `/assignments` and `/driver_requests` is treated as production analytics
data.** There is no field, flag, or convention distinguishing real operations from:

- **testing data** (records created while developing/QA-ing a feature),
- **demo data** (records created to show the platform),
- **training data** (records created while onboarding new staff),
- **temporary / throwaway records**,
- **user-testing records**.

I verified this directly: a search across `js/` for `classification`, `analyticsEligible`, `isTest`,
`isDemo`, `training`, `demo` returns **no data-governance concept** — the only hit is the *workload*
classification (a statistical bucket, unrelated). So analytics math in `refreshAnalyticsDisplay()`
runs over **100% of records indiscriminately**.

**Consequence:** completion rates, driver workload fairness, fleet utilization, distance totals, and
the auto-insights are all silently polluted. Worse, the future AI Operations Assistant would learn
from and reason over contaminated data — making governance a **prerequisite**, not a nicety.

---

## 2. Design principle

> **Analytics consumes a governed projection of the data, never the raw collection.**

We do **not** delete or move non-production records (they are legitimate operational artifacts and
may matter for audit). Instead we **classify at the source** and **filter at the engine boundary**.
This keeps the existing read-only-projection invariant intact (raw `/assignments` and
`/driver_requests` are never mutated for analytics purposes — same rule the alias engine already
follows).

---

## 3. Recommended data model

Extend the assignment and request schemas with an **optional, backward-compatible** governance block.
Absence of the block must mean **"production"** so that all historical records remain eligible without
a migration write (see §6).

```ts
interface AnalyticsClassification {
  // Is this record allowed into analytics aggregates at all?
  analyticsEligible: boolean;          // default: true

  // What kind of record is this?
  classification:
    | "production"   // real operations  → counts everywhere
    | "testing"      // QA / dev          → excluded from analytics
    | "training"     // onboarding        → excluded from analytics
    | "demo";        // demonstrations    → excluded from analytics

  // Lightweight provenance for audit + the AI trust layer
  classifiedBy?: string;               // username/displayName
  classifiedAt?: string;               // ISO timestamp
  classificationReason?: string;       // optional free text
}
```

Attached to a record:

```ts
interface Assignment {
  /* ...existing fields... */
  governance?: AnalyticsClassification;   // optional; absent ⇒ production
}
```

**Why `governance?` is optional and absence = production:**
- Zero-downtime: no backfill required for the thousands of existing records.
- Fail-safe-inclusive for *real* data: a forgotten classification never hides genuine operations.
- The risk it introduces (un-flagged test data stays counted) is handled by the **bulk
  reclassification tooling** in §5, not by a risky global migration.

**Derived rule used by the engine:**
```
isAnalyticsEligible(record) =
    record.governance == null                       // legacy / unclassified ⇒ production
 || (record.governance.analyticsEligible !== false
     && record.governance.classification === "production")
```

---

## 4. Where governance sits in the pipeline

```
Database (/assignments, /driver_requests, /drivers, /vehicles)
        │
        ▼
┌─────────────────────────────┐
│   GOVERNANCE LAYER           │   ← NEW, the only new gate
│   • classification filter    │
│   • alias / canonical map    │   ← existing alias engine moves here
│   • DQ duplicate detection   │   ← existing fuzzy-match engine moves here
└─────────────────────────────┘
        │  governed, production-only, de-duplicated projection
        ▼
   Analytics Engine → KPI / Insight / Recommendation → Dashboard / Export / AI
```

The Governance Layer is the **single choke point**. Everything downstream (KPIs, insights,
recommendations, PDF/Excel export, and eventually the AI Assistant) is guaranteed to see only
production-eligible, alias-resolved data. This is the architectural payoff: govern once, trust
everywhere.

The existing alias resolution (`_getAnalyticsAliases`, `_getAliasCanonical`) and duplicate detection
(`_detectSimilarPairs`, `_strSimilarity`) are **already a governance layer in spirit** — they are
just tangled inside the render function. V2 relocates them here unchanged in behavior.

---

## 5. Classification UX (how records get classified)

Three complementary mechanisms, in priority order:

1. **At creation (preferred).** The assignment/request create forms gain an optional
   "Jenis Data: Produksi / Pengujian / Pelatihan / Demo" control, defaulting to Produksi. One field,
   one default, no friction for the 99% normal case.
2. **Bulk reclassification tool** (governance admin surface). Filter records (by date window, creator,
   or text match) and reclassify a selection — this is how the existing pollution gets cleaned up
   *without* deleting anything. Each change is logged to `/logs` (reuse `logAction`, mirroring the
   existing `alias_created` / `warning_dismissed` audit actions).
3. **Heuristic suggestions (later).** The DQ panel can *suggest* candidates for review (e.g. records
   created in tight bursts by a developer account) — suggestions only, human confirms.

All classification changes are **audited** (actor + timestamp + reason) so the data lineage is
defensible — a hard requirement before any AI layer is allowed to consume the data.

---

## 6. Migration & backfill strategy (governance-specific)

| Step | Action | Risk |
|------|--------|------|
| G1 | Ship the optional `governance` field + `isAnalyticsEligible()` helper. Absence = production. | **None** — no data write, no behavior change (all records stay counted exactly as today) |
| G2 | Add the creation-form control (default Produksi). | Low — additive UI |
| G3 | Ship the bulk reclassification + audit tool. | Low — writes only the `governance` block, never touches operational fields |
| G4 | Run a **one-time supervised cleanup**: the owner reviews known test/demo windows and reclassifies. | Low — reversible, audited, human-driven |
| G5 | Engine reads classification by default; expose a "Tampilkan semua data (termasuk non-produksi)" toggle for debugging. | Low |

This sequencing means analytics numbers **do not change on day one** (everything is still production),
then converge to *true* production figures as cleanup proceeds — no jarring discontinuity, full
reversibility.

---

## 7. Settings & storage

- Governance config lives under the existing `/settings` tree, consistent with `analyticsAliases` and
  `analyticsQuality` (settings-store.js): introduce `/settings/analyticsGovernance` for defaults
  (e.g. default classification, whether legacy records may be treated as production — kept `true`).
- Per-record classification lives **on the record** (`assignment.governance`), not in settings — it
  is record-level provenance, not global config.

---

## 8. Goals → how this design meets them

| Goal | Mechanism |
|------|-----------|
| Production analytics only | Governance Layer filter at the engine boundary (§4) |
| Remove analytics pollution | Bulk reclassification + supervised cleanup (§5–6), without deletion |
| Support future AI analytics | Clean, classified, audited dataset = trustworthy training/inference input |
| Support future reporting accuracy | Same governed projection feeds screen **and** exports — no drift |

---

## 9. Recommendations (do **not** implement yet)

1. Adopt the **optional `governance` block with absence = production** — it is the only model that
   gives clean analytics without a risky backfill.
2. Make the **Governance Layer the single gate**; relocate the existing alias + DQ engines into it
   unchanged.
3. **Never delete** non-production records — classify and exclude.
4. **Audit every classification change** via the existing `logAction` pipeline.
5. Treat governance as a **hard dependency of the AI Operations Assistant** — no AI consumption of
   un-governed data.
