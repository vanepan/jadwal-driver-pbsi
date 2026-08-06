# Warehouse Core LTS — v1.29.11 Audit & Hardening Report

**Date:** 2026-08-06
**Release:** Warehouse Core LTS (v1.29.11)
**Scope:** `js/gudang/**` (~60 files), its 21 regression suites under `scripts/gudang-*`, and the 3 files (`js/config.js`, `service-worker.js`, `version.json`) plus `index.html` that carry the module's version stamp.
**Mandate:** investigate first, harden minimally, freeze what's already correct, document everything, change no business rule or user-facing behavior. This document is the full audit trail behind the terser `VERSION_HISTORY` entry in `js/config.js`.

---

## 1. Executive summary

The Gudang module is in genuinely good shape. Three parallel audits
(architecture/dependency, dead-code/duplication, naming/version-history),
followed by manual grep-and-read verification of every concrete claim and an
independent second review, found that **nearly every flagged item was
already a deliberate, documented decision** — not drift. Two dead exports
and one real, narrow, reproducible bug survived scrutiny; only those were
changed. Everything else in this document that reads like a "finding" is
either confirmed-correct-as-is, or accepted technical debt with its
reasoning recorded so it isn't re-litigated by a future pass.

**Changed:** 2 dead-code deletions, 1 cache-invalidation bug fix, 1 new
regression assertion, lightweight performance timestamps in 3 existing test
scripts, version bump.
**Not changed:** every business rule, every screen's user-facing behavior,
Firebase schema, authentication, the Vehicle module, and one intentionally
accepted layering exception (§7).

---

## 2. Architecture overview

Gudang is a vanilla-ES-module, no-framework, no-bundler feature module
mounted once into the host app's `#v2GudangWorkspace` via `js/app.js`'s
`navGudang()`, which imports `mountGudang`/`setGudangScreen`/etc. directly
from `js/gudang/ui/gudang-center.js` (not through the `js/gudang/index.js`
barrel — that barrel is a Phase-1 foundation-only surface: contracts,
repositories, projection, audit, search, settings; it deliberately exports
no UI).

The layering is a clean, mostly-textbook pipeline:

```
ui/ (screens + gudang-center.js orchestrator)
  -> engines (analytics/, dashboard/, intelligence/, filters/, selection/,
     asset/, consumable/, upload/, activity/, projection/) — PURE, no
     DOM/Firebase/window
  -> repository/ (one file per domain, Firebase reads/writes ONLY here)
  -> contracts/ (shape validation/normalization, zero I/O)
```

`gudang-center.js` owns one module-level state object (`st`) with the base
catalog (`st.data.items/locations/departments/assets`), UI/navigation state,
and every screen's own lazy per-screen cache (§5). Screens receive `st` by
reference: base catalog reads come from `st.data`; each screen's own
derived/expensive data (top-consumed items, per-item insight, movement
history feed, …) is fetched screen-locally on demand and cached back onto
`st` (§5/§6).

## 3. Folder responsibilities

| Folder | Responsibility | Notes |
|---|---|---|
| `contracts/` | Shape validation/normalization (`makeX`/`isX` pairs) | Zero Firebase, zero repository imports — confirmed clean |
| `repository/` | Persistence only, one file per domain, lazy Firebase import per function | No `ui/` imports anywhere |
| `projection/` | `stock-projection-engine.js` — "Movement is Truth" stock derivation | Composes `movement-repository` + `stock-repository` |
| `consumable/` | Goods In/Out, Stock Opname — write movements + recalc stock | |
| `asset/`, `audit/`, `analytics/`, `intelligence/`, `dashboard/`, `filters/`, `selection/`, `upload/`, `activity/` | Pure composition/decision engines, each self-documented "no DOM/Firebase/window" | Healthiest layer in the module |
| `search/` | `search-resolver.js` (find+resolve, never execute), `action-resolver.js`, `search-session-engine.js` (reducer), `recent-searches-store.js` (the module's one `localStorage` touchpoint) | |
| `config/` | Static seed data + `gudang-bidang-source.js`, a live bridge using dependency injection (`setGudangUsersSource`) instead of importing Firebase/users.js directly | Good pattern |
| `settings/` | In-memory config, deliberately no UI (§8) | |
| `bulk/` | Reusable execution pipeline (`bulk-executor.js`) + 4 thin operation adapters | One accepted cross-layer import — see §7 |
| `ui/` | Screens + `gudang-center.js` orchestrator | Two minor business-logic-in-UI spots noted below, not changed |

**UI owning business logic (spot-checked, not changed):** `ui/gudang-catalog.js`
owns `resolveOrCreateLocationId`/`generateId` (arguably repository-layer
concerns — see §7 for why this stays); `ui/gudang-item-image.js` imports
Firebase Storage primitives directly rather than through a repository
wrapper (acknowledged, isolated to this one file, no duplicate-read
consequence). Neither blocks this release; both are named here for
visibility rather than silently accepted.

## 4. Data flow

1. `refreshCatalog()` (see §6) fetches `items`/`locations`/`assets` and reads
   `departments` synchronously from an in-memory, DI-populated list
   (`listBidang()`), populating `st.data`.
2. `gudang-center.js#render()` is a single switch over `st.screen`,
   dispatching to one `render*` function per screen file.
3. Each screen reads `st.data` for the base catalog and, for anything
   derived (top consumed items, per-item insight, activity feed, movement
   history), calls its own engine/repository functions directly and caches
   the result onto `st` under a screen-owned key (§5).
4. Every mutating action (Goods In/Out, Stock Opname, all 4 Bulk operations,
   Add/Edit/Archive Item, Add Location/Asset, every Asset lifecycle
   transition, photo upload) already funnels through `refreshCatalog()` on
   save — confirmed by reading the dispatch table (`gudang-center.js`'s
   `onClick`/`onInput` handlers), not assumed.

## 5. Cache ownership

| Cache slot | Owner | Busted by `refreshCatalog()`? |
|---|---|---|
| `homeCardData` | `gudang-home.js` | Yes |
| `homeImageCache` | `gudang-home.js` | No — intentional; busted per-item on photo replace instead |
| `homeStockBulk`/`homeStockBulkLoading` | `gudang-home.js` (shared by dashboard/intelligence) | Yes |
| `analyticsTop`/`analyticsTopLoading` | `gudang-analytics.js` | Yes |
| `analyticsItem`/`analyticsItemLoading` | `gudang-analytics.js` | **Yes, as of v1.29.11 — was the bug fixed this release (§9)** |
| `historyData`/`historyLoading` | `gudang-movement-history.js` | Yes |
| `dashboardActivity`/`dashboardActivityLoading` | Co-written by dashboard/intelligence/movement-history (3-way shared, by design — see §14) | Yes |
| `st.detail.*` caches | `gudang-item-detail.js` | Yes, on drawer open |

## 6. Refresh ownership

`refreshCatalog()` in `gudang-center.js` is the single chokepoint. Verbatim
(post-v1.29.11):

```js
async function refreshCatalog() {
  st.loading = true; render();
  const readCatalog = () => Promise.all([listItems(), listLocations(), listAssets()]);
  let [itemsRes, locationsRes, assetsRes] = await readCatalog();
  if (!itemsRes.ok || !locationsRes.ok || !assetsRes.ok) {
    await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
    [itemsRes, locationsRes, assetsRes] = await readCatalog();
  }
  if (!itemsRes.ok || !locationsRes.ok || !assetsRes.ok) {
    st.loading = false; render();
    showToast('Gagal memperbarui data gudang. Menampilkan data terakhir.');
    return;
  }
  st.data = { items: itemsRes.data, locations: locationsRes.data, departments: listBidang(), assets: assetsRes.data, loadedAt: Date.now() };
  pruneSelection(st.selection, new Set(st.data.items.map((i) => i.itemId)));
  st.homeCardData = null;
  st.homeStockBulk = null; st.homeStockBulkLoading = false;
  st.analyticsTop = null; st.analyticsTopLoading = false;
  st.analyticsItem = null; st.analyticsItemLoading = false;   // v1.29.11
  st.historyData = null; st.historyLoading = false;
  st.dashboardActivity = null; st.dashboardActivityLoading = false;
  if (st.detail) { st.detail.loaded = null; st.detail.historyLoaded = null; }
  st.loading = false; render();
}
```

One bounded retry on read failure (never a loop), last-good data kept on
screen with a toast on total failure (added v1.29.10). Every `{data,loading}`
cache pair this function owns now resets as one unit — the principle
established in v1.29.10 and completed for the last remaining pair in
v1.29.11 (§9).

## 7. Dependency audit

**Layering is clean** with one known, deliberate exception:
`js/gudang/bulk/bulk-edit.js` imports `resolveOrCreateLocationId` from
`js/gudang/ui/gudang-catalog.js` — a real `bulk/` → `ui/` cross-layer
import. Verified this is a **deliberate v1.29.4 decision**, documented
inline in `gudang-catalog.js` right above the function: it exists so Bulk
Edit's Location field resolves/creates a Location exactly the same way
Add/Edit Item already does, "never a second implementation." The
alternative — duplicating that resolve-or-create logic — is arguably worse
than the layering purity issue. Relocating it now would touch 3 call sites
in a file explicitly marked "DO NOT MODIFY: Bulk behavior" in this release's
brief, for zero bug/behavior benefit. **Decision: leave as-is, recorded here
as accepted technical debt** (also §14). Confirmed independently by a second
review before this decision was finalized.

No other cross-layer violations found: `repository/`, `contracts/`,
`projection/`, `audit/`, `search/`, `config/` never import `ui/`; no direct
A↔B import cycles exist anywhere in the module.

## 8. Dead code audit

**Removed (zero callers anywhere, confirmed by repo-wide grep before
deletion):**
- `js/gudang/bulk/bulk-executor.js` — `createRunState(total)`. Not even
  self-referenced within its own file; its JSDoc mentioned a
  `buildRunState()` that doesn't exist anywhere in the repo — evidence of an
  export orphaned by a past rename.
- `js/gudang/ui/gudang-center.js` — `export { esc };`. `esc` is imported
  from `./gudang-atoms.js` and used internally only; no file (checked both
  named and `import * as` namespace forms) ever imported it from
  `gudang-center.js`.

**Investigated and deliberately NOT removed** (self-disclosed, intentional
dormant scaffolding — removing these would delete prepared future work, not
dead code):
- `settings/gudang-settings.js` — has zero production callers; its own
  header states "NO Settings UI... in-memory configuration state only,
  exactly as the Phase 1 brief specifies."
- `search/item-keyword-index.js` — `buildItemKeywordIndex`/
  `lookupItemIdsByToken` are unwired by explicit design; header states
  "search-resolver.js is deliberately NOT modified to use it."
- `projection/stock-projection-engine.js#isProjectionConsistent` and
  `contracts/audit-entry-contract.js#isAuditEntry` — exported via the
  barrel, exercised only by `gudang-foundation-check.mjs`, no production
  caller yet; consistent with the barrel's "public surface for a future
  Workspace route" purpose.
- `upload/upload-engine.js#toHumanUploadError` — exported but only called
  internally; directly unit-tested by `gudang-upload-check.mjs`, so removing
  the export would break that test's import for no benefit.

**No duplicate calculations found.** Stock-status classification is
centralized in `filters/stock-status-bulk.js#classify()`, producing the
shared `STOCK_STATUS_FILTER` enum every consumer (dashboard, intelligence,
home) compares against — no `ui/*.js` file reimplements the
`quantity <= 0` / `<= avgMonthlyConsumption` threshold logic.

**No duplicate Firebase reads found.** Every `readNode`/`storeFirebaseData`
call is confined to `repository/*.js` (10 call sites across 7 files); no
`ui/`, `dashboard/`, or `intelligence/` file touches an RTDB path directly.
`gudang-ownership-check.mjs` already enforces this architecturally and
matches what a static grep confirms.

**No deprecated-helper/TODO/FIXME/shim comment markers found** anywhere in
the module — unusually clean on this axis.

## 9. The one real bug fixed this release

`refreshCatalog()` correctly busted 5 of 6 per-screen lazy caches on every
mutation but missed the 6th: `st.analyticsItem`/`st.analyticsItemLoading`,
owned by `gudang-analytics.js`'s "Analisis per Item" picker
(`loadItemInsight()`, triggered by `analyticsOnChange()`). **Reproduction:**
pick an item's insight on the Analytics screen (shows
consumption/cost/forecast/restock sentences for that one item), then perform
any mutation anywhere in the app — the displayed numbers silently go stale
and never refresh, because an unchanged `<select>` value never re-fires
`onChange` to reload it. This is the exact bug class the in-flight v1.29.10
work fixed for two sibling caches (`analyticsTopLoading`, `historyLoading`)
two lines away in the same function, using the identical mechanism.

**Fix:** two lines added to `refreshCatalog()`'s existing reset block (§6).
**Regression guard:** `gudang-analytics-check.mjs` Part F now source-scans
`gudang-center.js` and asserts the reset block contains both lines —
`refreshCatalog()` isn't exported for direct unit invocation (same
limitation every other reset line in that function already has), so a
source-text assertion matches the precedent `gudang-ownership-check.mjs`
already set for architectural invariants.

## 10. Naming audit

Surveyed exported identifiers by role. All conventions below are **dominant
patterns with named exceptions**, not mandates — documented per the brief's
"avoid mixed conventions... document exceptions" instruction, nothing
renamed.

- **Engines**: dominant `computeX`/`getX`/`createX`/`validateX`/`isX`/`hasX`.
  Exceptions: `quiet-intelligence-engine.js` uses a whole-file `XSentence`
  suffix convention instead (a deliberate, consistent alternative, not
  drift); a handful of noun-phrase functions across
  `dashboard-engine.js`/`intelligence-engine.js`/`filter-engine.js`/
  `activity-engine.js`/`selection-engine.js`/`asset-lifecycle-engine.js`.
- **Repositories**: dominant `createX`/`getX`/`listX`, extremely consistent.
  Small sub-convention: append-only logs use `appendX`
  (`movement-repository.js`, `asset-history-repository.js`); a few
  `find`/`save` verbs elsewhere.
- **UI**: dominant and strongest convention in the module — render functions
  are uniformly `renderX`; handlers are grouped into one exported
  `{screen}Handlers` object per screen (10 of the screen files). One
  exception: `gudang-analytics.js` exposes a standalone `analyticsOnChange`
  instead of an `analyticsHandlers` object. `gudang-center.js` itself mixes
  `on*`/`handle*` internal (non-exported) naming for DOM-interaction
  responders.
- **Contracts**: near-universal `makeX`/`isX` pairs — the most rigorously
  consistent category in the module, essentially zero unexplained drift.
- **Stores**: only one file (`recent-searches-store.js`), internally
  consistent `get`/`add`/`clear` triplet.

## 11. Performance baseline

No perf issue has ever been reported for this module, and the brief's own
"no optimization unless measurable" was read as also meaning "don't build
new measurement tooling to go looking for a problem that hasn't been
reported." A dedicated synthetic-fixture Puppeteer script was considered and
rejected for that reason. Instead, lightweight `performance.now()`/
`Date.now()` timestamps were added to the 3 existing test scripts that
already exercise these paths. Numbers below are from one representative
local run (headless Chromium, unauthenticated — see caveat):

**`gudang-ui-smoke.mjs`:**
| Step | Time |
|---|---|
| Page boot (`goto` → `networkidle2`) | 2988 ms |
| `mountGudang()` | 1078 ms |
| Screen render (`setGudangScreen`, synchronous call only) | 2.4–23.2 ms across Dashboard/Goods Out/Goods In/History/Opname/Analytics/Intelligence/Home |
| Search resolve (`setGudangSearch`) | 16.6 ms |

**`gudang-ui-interaction-check.mjs`:**
| Step | Time |
|---|---|
| `mountGudang()` | 1057 ms |
| Full real-click/keyboard interaction battery | 5543 ms |

**`gudang-bulk-check.mjs`:** `runBulkOperation()` pipeline overhead, 200
synthetic ids, no-op `execute()`, `concurrency=3` (isolating the executor's
own orchestration cost from Firebase write latency, which this app doesn't
control): **0.2 ms**.

**Documented gap, not fabricated:** real Firebase read/write latency and
Storage upload timing are not measurable in this unauthenticated local
harness without touching production data, and were not estimated. If a real
performance concern is ever reported, that's the recommended next
measurement, not a number invented here.

## 12. Regression summary

All 21 pre-existing suites plus the one extended this release — **100%
green, zero regressions**, run after every code change in this release:

| Script | Result |
|---|---|
| gudang-activity-check.mjs | 61/61 |
| gudang-analytics-check.mjs | 30/30 (27 pre-existing + 3 new, §9) |
| gudang-asset-lifecycle-check.mjs | 37/37 |
| gudang-bulk-check.mjs | 81/81 |
| gudang-dashboard-check.mjs | 80/80 |
| gudang-filter-check.mjs | 47/47 |
| gudang-foundation-check.mjs | 64/64 |
| gudang-goods-in-check.mjs | 20/20 |
| gudang-goods-out-check.mjs | 22/22 |
| gudang-intelligence-check.mjs | 99/99 |
| gudang-item-check.mjs | 67/67 |
| gudang-movement-history-check.mjs | 26/26 |
| gudang-ownership-check.mjs | 74/74 |
| gudang-search-check.mjs | 56/56 |
| gudang-security-check.mjs | 26/26 |
| gudang-selection-check.mjs | 56/56 |
| gudang-stock-opname-check.mjs | 19/19 |
| gudang-ui-check.mjs | 171/171 |
| gudang-ui-interaction-check.mjs | 19/19 |
| gudang-upload-check.mjs | 60/60 |
| gudang-ui-smoke.mjs | PASS (zero console/page errors, all screens render) |

**Total: 1115/1115 numeric checks pass, plus a clean qualitative smoke
pass.**

## 13. Files changed

- `js/gudang/bulk/bulk-executor.js` — removed dead `createRunState()`
- `js/gudang/ui/gudang-center.js` — removed dead `export { esc }`; 2-line
  cache-bust fix in `refreshCatalog()`
- `scripts/gudang-analytics-check.mjs` — new Part F regression assertion
- `scripts/gudang-ui-smoke.mjs`, `scripts/gudang-ui-interaction-check.mjs`,
  `scripts/gudang-bulk-check.mjs` — performance-baseline timestamps added
- `js/config.js` — version bump + new `VERSION_HISTORY` entry
- `service-worker.js`, `version.json`, `index.html` — synced via
  `scripts/sync-version.mjs`
- `docs/WAREHOUSE_CORE_LTS_v1.29.11.md` — this document (new)

No business rule, Inventory/Search/Selection/Bulk/Upload/Dashboard/
Intelligence *behavior*, Authentication, Firebase schema, or Vehicle-module
file was touched.

## 14. Technical debt summary

Recorded here so a future pass doesn't need to re-discover these:

1. `bulk-edit.js` → `ui/gudang-catalog.js` cross-layer import for
   `resolveOrCreateLocationId` (§7) — deliberate v1.29.4 tradeoff, accepted.
2. `ui/gudang-item-image.js` imports Firebase Storage primitives directly
   rather than through a repository wrapper — isolated to one file, no
   duplicate-read consequence, not blocking.
3. `dashboardActivity`'s 3-way shared cache ownership (dashboard/
   intelligence/movement-history all write the same slot) is fragile-by-
   design, a documented "mirror, not import" choice from when Dashboard was
   frozen (v1.29.7/v1.29.9) — consistently busted, not currently buggy, but
   worth remembering if a 4th consumer is ever added.
4. A narrow, unreproduced stale-in-flight-fetch race (an `ensure*` fetch
   started before a `refreshCatalog()` call resolving after it) was named in
   the v1.29.10 entry and remains unfixed — no reproduction obtained, a fix
   would touch 4 already-frozen screen files for an undemonstrated defect.

## 15. Future extension points (documented only — nothing implemented)

- **Barcode/QR scanning**: `bulk-executor.js`'s own header already
  anticipates this — its concurrency design is explicitly described as
  "REPLACEABLE... a future swap to a real batched multi-path write" and
  names "future Bulk Barcode/QR/Label Printing" as a consumer of the same
  `prepare→validate→execute` pipeline every existing bulk operation uses.
  A scan-driven bulk operation would be a 5th thin adapter module, not a
  change to the executor itself.
- **Label printing**: no existing hook; would likely live alongside
  `bulk/bulk-export.js`'s lazy-loaded external-library pattern (XLSX/pdfmake
  loaded on demand, never at module load).
- **Mobile/Stock Opname scan**: `consumable/stock-opname-engine.js` is
  already input-agnostic (takes a counted quantity, not a UI event) — a
  scan-driven count entry would feed the same engine function a manually
  typed one does today, no engine change needed.
- **Photo/scan capture**: `upload/upload-engine.js`'s existing session
  pattern (used for item photos today) is reusable for a scan-triggered
  capture flow without new upload plumbing.
- Item identity (`contracts/item-identity-rules.js`) and the open
  `item.metadata` bag are already designed to accommodate a future barcode/
  SKU field without a contract migration (`metadata`'s own docstring already
  names this pattern, as `minimumStock` used it in v1.29.4).

## 16. Warehouse roadmap

This LTS checkpoint freezes the module as: Foundation (Phase 1) → Consumable
lifecycle (Goods In/Out/Opname) → Asset lifecycle → Search/Selection/Filter
→ Bulk operations → Upload → Analytics/Intelligence → Dashboard → Activity/
Audit trail, all stable and regression-covered. The next roadmap phase,
Warehouse Digitization (Barcode/QR/Scanner/Label Printing/Mobile Scan), can
build on this foundation per §15 without further architectural groundwork —
that was this release's actual goal.

## 17. Version numbering note

The release brief specified v1.30.0. This repo's own history shows that
exact version was used one day earlier (`7842b95`, 2026-08-04) for an
unrelated release, then explicitly reverted the next commit (`23c83ec`,
2026-08-05) for "mis-versioning a Warehouse-roadmap milestone as a new major
era... renumbered to 1.29.2." Given that fresh, explicit precedent in this
exact repo, the user was asked and confirmed staying in the 1.29.x line:
**v1.29.11**, with `RELEASE_NAME = 'Warehouse Core LTS'` carrying the
checkpoint framing in text rather than in the version number.
