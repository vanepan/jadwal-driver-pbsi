# Analytics V2 — Migration Plan, Risks & Roadmap

**Project:** Sarpras Operations · v1.10.0 — Analytics Experience Redesign
**Phase:** 6 (Migration Strategy) + Risks & Recommendations
**Status:** Architecture review — no code written
**Last updated:** 2026-06-12

---

## 1. Migration principles

1. **No big-bang rewrite.** The current analytics works and is in production. We refactor *behind* it,
   then swap the surface — never delete-then-rebuild.
2. **Strangler-fig pattern.** Extract pure logic out of `refreshAnalyticsDisplay()` first, prove it
   produces identical numbers, *then* re-render on top of it.
3. **Behavior parity before enhancement.** The new engine must reproduce today's figures exactly
   before any new metric/visual is added.
4. **Ship behind a flag.** The app already has a feature-flag concept (`docs/FEATURE_FLAGS.md`) — gate
   V2 so it can run side-by-side with V1 for validation and instant rollback.
5. **Preserve invariants.** Raw `/assignments`, `/driver_requests`, `/logs` are never mutated for
   analytics. Exports keep matching the screen.

---

## 2. Recommended implementation order

### Stage 0 — Foundations (no UI change)
- **0.1** Define the typed `AnalyticsModel`, `KPI`, `Insight`, `Recommendation` contracts (`DATA_FLOW_ANALYSIS.md`).
- **0.2** Extract pure helpers already isolated today (`_normDestKey`, `_strSimilarity`,
  `_detectSimilarPairs`, alias getters, odometer aggregation, workload classification) into an engine
  module **unchanged in behavior**.
- **0.3** Add `resolvePeriod(range)` returning `{current, previous}`.
- **Exit criterion:** engine, run over the same data + filters, reproduces every number currently in
  `_lastAnalyticsModel` exactly (diff = 0).

### Stage 1 — Governance Layer (no visible analytics change)
- **1.1** Ship optional `governance` field + `isAnalyticsEligible()` (absence = production → numbers unchanged).
- **1.2** Route the engine's input through `buildGovernedDataset()` (alias + DQ relocated here).
- **1.3** Add creation-form classification control (default Produksi) + bulk reclassification + audit tool.
- **Exit criterion:** with everything classified production (the default), analytics output is
  byte-identical to Stage 0. Cleanup happens later, supervised.

### Stage 2 — Engine-backed render of the *current* UI
- **2.1** Re-point `refreshAnalyticsDisplay()` to consume `AnalyticsModel` instead of computing inline.
  Same HTML, same charts — just sourced from the engine.
- **2.2** Add memoization keyed by `(governedDatasetVersion, filters)`.
- **Exit criterion:** visual + numeric parity with V1; no user-visible change; charts/DOM no longer
  recompute on unrelated state.

### Stage 3 — V2 component library (built, not yet wired live)
- **3.1** Build the presentation components from `COMPONENT_INVENTORY.md` Part B as vanilla render
  functions (matching the app's no-framework stack), token-driven per `DESIGN_SPEC.md`.
- **3.2** Build new chart wrappers: Area (trend), Funnel (lifecycle), HealthScoreGauge — fixing the
  hardcoded-color/font defects.
- **Exit criterion:** components render correctly against the engine model in isolation (the prototype
  here is the visual acceptance reference).

### Stage 4 — V2 experience behind a flag
- **4.1** Compose Executive Summary → Highlights → Deep tabs → Intelligence per `INFORMATION_ARCHITECTURE.md`.
- **4.2** Wire KPI/Insight/Recommendation engines to the new surface.
- **4.3** Gate with feature flag; V1 remains default.
- **Exit criterion:** owner validates V2 side-by-side; numbers reconcile with V1.

### Stage 5 — Export parity & extension
- **5.1** Re-point the `analytics-summary` PDF template to the new `AnalyticsModel`.
- **5.2** Add Excel + Print exporters behind the Document Engine's existing `getExporter` seam.
- **Exit criterion:** PDF identical to V1's; Excel/Print produce the same figures as screen.

### Stage 6 — Flip default & decommission V1
- **6.1** Make V2 the default; keep the flag for one release as a safety valve.
- **6.2** Run the supervised governance cleanup (reclassify known test/demo windows).
- **6.3** Remove the old `refreshAnalyticsDisplay()` inline-compute path.
- **Exit criterion:** V2 default in production; V1 code deleted; numbers reflect true production data.

### Stage 7+ — Roadmap modules (post-V2, same architecture)
Cost Analytics → Recommendation expansion → Maintenance Analytics → predictive forecasting → AI
Operations Assistant. Each is a new analyzer + recommendations behind the existing IA/components — no
re-architecture.

---

## 3. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | New engine produces different numbers than V1 | Med | High | Stage 0 diff-to-zero exit gate; run engine and V1 in parallel, assert equality |
| R2 | Governance default hides real data or changes numbers prematurely | Low | High | Absence = production; numbers unchanged until *supervised* cleanup (Stage 1/6) |
| R3 | Export drifts from screen | Low | Med | Single `AnalyticsModel` feeds both; no separate compute path |
| R4 | Performance regression on large `/assignments` | Med | Med | Memoization (Stage 2.2); pure functions are cheap to cache |
| R5 | Chart theming breaks in dark mode / print | Med | Low | Token-driven chart wrappers (Stage 3.2) replace hardcoded hex/font |
| R6 | Scope creep (rebuild everything at once) | High | High | Strangler stages + feature flag; parity before enhancement |
| R7 | Framework mismatch (prototype is React/JSX, app is vanilla) | Med | Med | Treat `.jsx` files as **visual spec only**; author V2 as vanilla per existing stack |
| R8 | Reimbursement→Cost join data sparse/inconsistent | Med | Med | Ship Cost analyzer with graceful empty states; coverage indicator like odometer |
| R9 | Losing the proven workload/alias IP during refactor | Low | High | Stage 0.2 moves these *unchanged*; covered by R1 parity gate |

---

## 4. Rollback strategy

- Every stage through 5 is **non-destructive** and flag-gated → instant rollback to V1.
- Governance writes only the additive `governance` block → reversible (re-classify or ignore field).
- V1 inline-compute path is deleted **only** at Stage 6, after V2 is validated as default.

---

## 5. Success criteria recap (per the brief)

| Deliverable | Document |
|-------------|----------|
| 1. Complete analytics audit | `COMPONENT_INVENTORY.md` Part A |
| 2. Governance strategy | `GOVERNANCE_RECOMMENDATION.md` |
| 3. Analytics architecture design | `DATA_FLOW_ANALYSIS.md` Part B |
| 4. Information architecture | `INFORMATION_ARCHITECTURE.md` |
| 5. Component inventory | `COMPONENT_INVENTORY.md` Part B |
| 6. Migration roadmap | this document |
| 7. Risks & recommendations | this document §3–4 |

---

## 6. Top recommendations

1. **Refactor before you redesign.** Stage 0–2 (engine extraction with diff-to-zero parity) de-risks
   everything else and changes nothing the user sees.
2. **Governance first, cleanup later.** Ship the classification model with absence = production so
   numbers stay stable, then clean up under human supervision.
3. **One model, many surfaces.** The typed `AnalyticsModel` is the contract that keeps screen, PDF,
   Excel, print, and the future AI Assistant permanently consistent.
4. **Reuse, don't rebuild, the export pipeline.** The Document Engine already is the target Export Engine.
5. **Treat the prototype as a visual contract, not code to merge** — the production build is vanilla JS.
6. **Gate with the existing feature-flag system** for safe, reversible rollout.
