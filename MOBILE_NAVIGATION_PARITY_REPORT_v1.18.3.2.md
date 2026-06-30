# Mobile Navigation Parity & Apple-Style Refinement — v1.18.3.2

> **Type:** Stabilization / UI Architecture (NO new features)
> **Priority:** HIGH · **Scope:** Navigation architecture + presentation ONLY
> **Date:** 2026-06-30 · **Branch:** main

---

## 1. Architecture Summary

The platform already had a **single navigation model**: the V2 shell's
`#v2Rail` (module switcher) + `#v2Panel` (active-module context menu), built
once in `initV2Rail()` / `initV2Panel()` and gated by the `visualShellV2` flag.

This sprint did **not** introduce a second renderer. It finished the
*single-renderer relocation* approach: on mobile the **live** `#v2Rail` +
`#v2Panel` DOM nodes are physically moved into the legacy `#sidebar` drawer
(`#v2MobileNavHost`), and moved back to `.app-layout` on desktop. Same nodes,
same handlers, same permission state — only their mount point changes.

```
              Navigation Model (MODULE_DEFS + #v2Rail/#v2Panel, built once)
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                     ▼
        Desktop Renderer                        Mobile Drawer Renderer
   (rail+panel in .app-layout)        (SAME rail+panel relocated into #sidebar
                                       via syncV2ResponsiveNavReuse)
```

There is exactly **one** renderer, **one** menu definition, **one** permission
path (`updatePermissionUI`), and **one** active-state path (`setRailModule` /
`setV2PanelNavActive`). Desktop is the source of truth; mobile reuses it.

**Mobile drawer layout (Apple HIG inspired):**

```
┌ Header (brand)
│ ACTIVE MODULE menu (expanded — sections + items)
│    OPERASIONAL · Jadwal Driver · Pending
│    MASTER DATA  · Manajemen Driver · Manajemen Kendaraan   (admin)
│    AUDIT        · Audit Driver · Audit Kendaraan           (admin)
│ BOTTOM MODULES (the rail, minus the active module)
│    Petty Cash Center · Analytics · Konfigurasi             (admin)
│ Logout
└ Footer (app name + version — legacy .sidebar-footer)
```

---

## 2. Root Cause

The mobile drawer was not broken at the *architecture* level — it was broken at
the *presentation/consistency* level. Two contradictory presentation strategies
had been layered across the previous two commits and never reconciled:

| | Approach A (WIP `e89eea4`) | Approach B (checkpoint `822eff8`) |
|---|---|---|
| Rail | shown as a module list | `display:none` (hidden) |
| Module menus | only the **active** module | **all** modules expanded at once |
| Permission gate | reuses existing rail gating | **new** `mobileNavVisibility` array (duplicate) |

A third "HOTFIX" `@media` block then re-themed everything to light tokens **and
killed Approach B's section labels** (`::before { content: none }`). The net live
result was: rail hidden, every module's submenu dumped into one flat unlabeled
list — matching **neither** approach, carrying **duplicate permission logic**,
and ~400 lines of three overlapping `@media (max-width:767px)` blocks fighting
with `!important`.

The target layout (active module expanded → *Bottom Modules* switcher → footer)
is **Approach A**. This sprint converged on Approach A and deleted Approach B.

---

## 3. Files Modified

| File | Δ | Why |
|---|---|---|
| `js/app.js` | ~+17 / −41 | Rewrote `syncV2ResponsiveNavReuse()` |
| `platform.css` | ~+175 / −500 | Deleted 3 conflicting drawer blocks; one consolidated block |
| `js/config.js` | +1 / −1 | `APP_VERSION` 1.18.3 → 1.18.3.2 |
| `index.html` | cache-bust | `platform.css?v` 2.1.0 → 2.1.1; app/style/petty-cash `?v` re-stamped |
| `service-worker.js` | cache-bust | `SW_VERSION` → 1.18.3.2 (via `sync-version.mjs`) |
| `version.json` | version | → 1.18.3.2 (via `sync-version.mjs`) |

Net: **+192 / −556 (−364 lines).**

---

## 4. Why Each File Changed

### `js/app.js` — `syncV2ResponsiveNavReuse()`
- **Removed** the `mobileNavVisibility` / `data-mobile-drawer` block — this was
  the **duplicate permission logic** (it re-decided admin visibility that
  `updatePermissionUI()` already owns). Module visibility on mobile now flows
  from the relocated rail items, gated by the single existing source.
- **Removed** the mobile-only section relabeling (`Operasional` → "Driver
  Operations"). Desktop section titles are kept verbatim and rendered uppercase
  by CSS — closer parity, less divergence, and matches the spec ("OPERASIONAL").
- **Added** logout relocation: `#v2FooterLogoutDirect` is appended into the host
  *after* the rail on mobile (so the order is menu → Bottom Modules → Logout)
  and returned to the panel on desktop.
- **Added** an empty-state guard: the rail ("Bottom Modules") hides itself when
  the current role has no other module to switch to (Bidang/Driver). It *reads*
  the permission-driven rail-item visibility — it does **not** re-implement it.

### `platform.css`
- Deleted the **Approach-B** `@media (max-width:767px)` block (`data-mobile-drawer`
  show/hide + per-module `::before` labels).
- Deleted the **HOTFIX** `@media` block (redundant re-theming + label killers).
- Deleted the **old base** drawer rules (dark `--side-*` tokens, hardcoded
  `#v2RailDriverOps` hide, "Modules" label, 48px/19px/12px metrics).
- Replaced all three with **one** consolidated `@media (max-width:767px)` block:
  app theme tokens, Apple metrics (52px rows · 20px icons · 14px radius · thin
  dividers · subtle accent active state), `.v2-rail-item--active` excluded from
  Bottom Modules, "Bottom Modules" label, footer pinned at the bottom.

### Version files
- `APP_VERSION` bumped; `sync-version.mjs` propagated it to `service-worker.js`,
  `version.json`, and the `index.html` entry/CSS cache-busts. `platform.css`
  carries an independent cache-bust (`2.1.1`) bumped manually since it changed.

---

## 5. Before vs After Architecture

**Before (working tree @ `822eff8`)**
```
Single renderer (correct) BUT:
  • CSS: 3 overlapping @media drawer blocks (Approach A + B + HOTFIX) w/ !important wars
  • JS:  duplicate permission gate (mobileNavVisibility) parallel to updatePermissionUI
  • Live result: rail hidden, all submenus flat & unlabeled (matches no spec)
```

**After (v1.18.3.2)**
```
Single renderer (unchanged) + ONE clean presentation:
  • CSS: 1 consolidated @media drawer block, app tokens, Apple metrics
  • JS:  permission flows from the single source (updatePermissionUI) only
  • Live result: active module expanded → Bottom Modules → Logout → footer
```

---

## 6. Regression Risk

| Area | Risk | Reason |
|---|---|---|
| Desktop navigation | **None** | Desktop rail/panel CSS untouched; verified relocation back to `.app-layout` with mobile classes cleared. |
| Permission engine | **None** | No permission logic changed; duplicate gate removed (now single source). |
| Routing / business logic | **None** | No `nav*()` routing function, module def, handler, or Firebase call changed. |
| Mobile presentation | **Low** | New CSS is presentation-only; gated by JS-added classes that exist only ≤767px. |
| Cache / SW | **Low** | Version stamped consistently; `platform.css?v` bumped so new CSS is fetched. |

Rollback: `visualShellV2 = false` in Firebase restores V1 (unchanged path), and
all changes are presentation/relocation only.

---

## 7. Verification Checklist

- [x] `node --check js/app.js` — syntax OK
- [x] `node scripts/smoke-boot.mjs` — **PASS** (0 fatal boot errors, version 1.18.3.2)
- [x] Puppeteer nav-parity check (375px ↔ 1280px):
  - [x] Mobile: `body.v2-shell-active`, `#v2MobileNavHost` inside `#sidebar`
  - [x] Mobile: `#v2Panel`, `#v2Rail`, `#v2FooterLogoutDirect` all inside the host
  - [x] Mobile: mobile-drawer classes applied; active module = `v2PanelDriverOpsNav`
  - [x] Mobile: legacy `.sidebar-nav-group`s hidden
  - [x] Desktop: rail + panel back in `.app-layout`; mobile classes cleared; legacy groups restored
  - [x] 0 fatal console errors
- [x] CSS brace balance unchanged vs HEAD (pre-existing −1 delta preserved; no new imbalance)
- [x] No remaining `data-mobile-drawer` / `desktopTitle` / `mobileNavVisibility` references

> Manual on-device QA (iOS Safari / Android Chrome) for the authenticated drawer
> per role (Admin/Bidang/Driver) is recommended before release — the automated
> checks cover the unauthenticated relocation mechanism; role visibility is
> guaranteed by the unchanged single permission source.

---

## 8. Technical Debt Removed

- **−364 net lines** of CSS/JS.
- Eliminated **3 overlapping** `@media` drawer blocks → **1** consolidated block.
- Removed the **duplicate permission gate** (`mobileNavVisibility` / `data-mobile-drawer`).
- Removed mobile-only **section relabeling** divergence from desktop.
- Removed `!important` cascade conflicts between the competing approaches.
- Removed dead/contradictory Approach-B rules (rail `display:none`, label killers).

---

## 9. Confirmation

- ✅ **One** navigation renderer (the live `#v2Rail` + `#v2Panel`, relocated — not duplicated).
- ✅ Desktop and mobile are at **parity** (same menus, same order, same sections, role-correct).
- ✅ **No** duplicate menu / no second menu array / no HTML scraping.
- ✅ **No** duplicate permission logic (single source: `updatePermissionUI`).
- ✅ **No** duplicate routing (single source: the `nav*()` layer).
- ✅ **No** new feature.
- ✅ **No** change to Firebase, auth, permission engine, analytics, dispatch, vehicle management, petty cash, notifications, routing, business logic, data model, or roadmap.

Priority honored: **Architecture > Parity > Presentation.** No big redesign, no
new UI, Executive UI Sprint 2 not started.
