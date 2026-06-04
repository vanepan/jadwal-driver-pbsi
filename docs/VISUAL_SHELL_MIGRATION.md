# PBSI Operations Platform — Visual Shell Migration (VSM)

> Objective: Migrate the V1.2.x Driver Operations UI shell into the approved V2 three-column shell while preserving all existing business logic unchanged.
> Scope: Presentation layer only. No new modules, no routing, no Operations Hub, no feature flag changes except adding `visualShellV2` at `false`.
> Cross-reference: `DESIGN_ANALYSIS.md` §2 · `PRODUCTION_ANALYSIS.md` §Navigation · `MIGRATION_PLAN.md` Phase 2 · `FEATURE_FLAGS.md` · `ROUTING_ARCHITECTURE.md`.
> Dependency: Phase 0 (security baseline) and Phase 1 (P1–P3 CSS consolidation + breakpoint fixes) must be complete. Both are confirmed complete.
> Last updated: 2026-06-04.
> Status: Architecture only. No code changes. No flag activation.

---

## Confirmations

This document describes a **visual migration only**. Before any VSM phase begins, confirm:

| Item | Confirmed |
|---|---|
| No Firebase path changes | ✓ |
| No Firebase rule changes | ✓ |
| No Firebase read/write pattern changes | ✓ |
| No workflow changes (approval, scheduling, odometer, reimbursement) | ✓ |
| No database schema changes | ✓ |
| No routing activation (`operationsHub` remains `false`) | ✓ |
| No Operations Hub activation | ✓ |
| No Engineering module activation | ✓ |
| No Analytics module activation | ✓ |
| No AI Assistant activation | ✓ |
| No Asset Management activation | ✓ |
| All existing feature flags remain at current values | ✓ |
| All existing JS module logic unchanged (`timeline.js`, `app.js`, `assignments.js`, etc.) | ✓ |
| All existing modal behavior unchanged | ✓ |
| All existing role-gating (`hasPermission()`) unchanged | ✓ |

The only additions: a new `visualShellV2` flag (default `false`) and new HTML/CSS shell elements that are completely hidden when the flag is off.

---

## 1. Current Shell Inventory

### 1.1 Sidebar (`#sidebar`)

The V1 sidebar is a `position: fixed` left column, 240px wide, always visible on desktop (≥768px post-P3). On mobile (≤767px) it becomes an off-canvas drawer.

**Structure:**

| Element | Selector | Visible to | Current behavior |
|---|---|---|---|
| Sidebar container | `#sidebar` | All roles (hidden on mobile by default) | Fixed 240px, dark charcoal bg (`#1D1D1B`) |
| Brand block | `.sidebar-brand` | All | PBSI logo, "Bidang Sarana" text, app version at bottom |
| Primary CTA group | `.sidebar-nav-group.sidebar-nav-desktop-only` (first) | Admin, Bidang | Contains `#btnAddAssignment` "Tambah Jadwal" |
| Secondary actions group | `.sidebar-nav-group.sidebar-nav-desktop-only` (second) | Admin (requests+notif), Bidang (requests) | `#btnRequests` with `.sidebar-badge` count; `#btnNotifications` (hidden ≥768px by BP-P3) |
| Profile group | `.sidebar-nav-group.sidebar-nav-desktop-only` (third) | All | `#btnProfile`, `#btnLogout` |
| Admin panel group | `.sidebar-nav-group` (non-desktop-only) | Admin only | `#btnAdminPanel` |
| Hamburger | `.sidebar-toggle` | Mobile only (≤767px) | Toggles sidebar drawer |
| Drawer close | `.sidebar-close` | Mobile only (≤767px) | Closes drawer from inside |
| Backdrop | `.sidebar-overlay` | Mobile only, when drawer open | Click-to-dismiss overlay |

**Desktop-only group visibility:** `.sidebar-nav-group.sidebar-nav-desktop-only` is hidden below 768px (BP-S1: `min-width: 768px`). Above 768px the group shows CTA, requests, notifications (sidebar btn hidden by BP-P3), and profile.

**Mobile drawer:** `#sidebar` transforms `translateX(-240px)` on mobile. `.sidebar-open` class slides it to `translateX(0)`. Hamburger in header (`.sidebar-toggle`) triggers this. Backdrop and close button dismiss it.

### 1.2 Header

The sticky header bar, 56px tall on desktop. Contains date navigation, module title, user area.

| Element | Selector | Visible to | Notes |
|---|---|---|---|
| Header container | `.header` (or equivalent) | All | `position: sticky; top: 0; height: 56px` |
| Inner flex row | `.header-inner` | All | Flex container; wraps to 2 rows at ≤600px (BP-S6) |
| Hamburger | `.sidebar-toggle` (in header) | Mobile only (≤767px) | Mirror of sidebar hamburger |
| Mobile brand | `.header-brand` | Mobile only (≤767px) | PBSI logo; hidden ≥768px (BP-S4) |
| Module title | `.header-module-title` | Desktop only (≥768px) | "Jadwal Driver Operasional"; hidden ≤767px |
| Date navigation | `.date-nav` | All | `#prevDay`, `#todayBtn`, `#nextDay`, `#datePicker` |
| Search input | `#searchInput` | All | Filters timeline by driver name / purpose |
| User area | `.header-user-area` | All | `.header-display-name`, `.role-badge`, `.header-notif-btn` |
| Notification bell | `.header-notif-btn` | All roles, desktop only (≥768px) | Opens `#modalNotifications`; hidden ≤767px (BP-P2) |
| Spacer | `.header-spacer` | Desktop | `flex: 1` fills gap between title and user area |

**Height at breakpoints:**
- ≥601px: 56px fixed height (`flex-wrap: nowrap`)
- ≤600px: auto height, 2-row compact layout (BP-S6)

### 1.3 Timeline Container

The primary content area. Contains the horizontal Gantt grid rendered by `timeline.js`.

| Element | Notes |
|---|---|
| Main area wrapper | `.main-area`; `margin-left: 240px` on desktop (base CSS); `margin-left: 0` on mobile (BP-S5) |
| Main content | `.main-content`; `padding-bottom: calc(56px + 70px + ...)` on mobile (BP-S5) |
| Timeline wrapper | Contains the Gantt scroll area |
| Timeline header row | Hour labels (00:00–24:00), horizontally scrollable |
| Timeline body | Driver rows; assignment blocks color-coded by vehicle (`--v-innova`, `--v-luxio`, `--v-poly`, `--v-hiace`) |
| Now line | `#nowLine`; updates every 60 seconds |
| Non-working shading | Before 07:00 and after 20:00 |
| Vehicle legend | Below timeline |

**Timeline JS is not modified in any VSM phase.** `timeline.js` renders into its DOM target regardless of the outer shell. All `renderTimeline()`, `autoFocusTimeline()`, and scroll sync logic runs unchanged.

**Width impact of V2 shell:** V1 main area = `viewport − 240px`. V2 main area = `viewport − 282px` (rail 64px + panel 218px). Delta: 42px narrower. The timeline uses horizontal scroll (`overflow-x: auto`); `--hour-width` drives column sizing independently of container width. No timeline logic changes are required.

### 1.4 KPI Area

Two contexts in V1:

**Admin / all-user KPI strip (above timeline):**
The V2 Driver Operations prototype (`DESIGN_ANALYSIS.md` §3) defines a KPI strip with four metrics: trip aktif, driver tersedia, menunggu, selesai. In V1 production, these counts are derived from the in-memory `assignments` and `requests` arrays already loaded by `app.js`. In V1 the display may be embedded in the timeline header or shown as summary text. VSM-4 gives these a standalone V2 card treatment.

**Driver personal dashboard (`#driverDashboard`):**
Rendered by `driver-dashboard.js`. Four sections: Berlangsung Sekarang, Jadwal Hari Ini, Jadwal Mendatang, Riwayat. Each section is a list of cards. Currently styled with V1 CSS classes. VSM-4 migrates card styling to V2 tokens without changing the JS data logic.

**Data source:** All KPI values come from the in-memory `assignments` and `requests` arrays. No new Firebase reads. No new computations. Visual-only update.

### 1.5 Modals

Twelve modal types. All use `position: fixed` and are unaffected by any shell layout change. All remain functionally identical through the entire VSM migration.

| Modal | Selector | Type |
|---|---|---|
| Login | `#modalLogin` | Fullscreen overlay (already V2 styled via `platform.css`) |
| Assignment form | `#modalAssignment` | Standard centered modal |
| Requests list | `#modalRequestsList` | Standard centered modal |
| Request form | `#modalRequestForm` | Standard centered modal |
| User management list | `#modalUserList` | Standard centered modal |
| User form | `#modalUserForm` | Standard centered modal |
| Profile | `#modalProfile` | Standard centered modal |
| Notifications | `#modalNotifications` | Standard centered modal |
| Activity log | (within admin panel modal) | Standard centered modal |
| Assignment detail | `#modalDetail` | Accordion modal |
| Comment thread | `#modalComment` | Standard centered modal |
| Odometer input | `#modalOdometer` | Stacked above `#modalDetail`, z-index 210+ |

**Bottom-sheet modals at ≤600px** (BP-S6): `border-radius: 16px 16px 0 0`, `position: fixed; bottom: 0`. This breakpoint and behavior is unchanged by VSM.

**Modal open/close triggers are all preserved.** CTA buttons in the new section panel (VSM-2) call the same functions as the V1 sidebar buttons. No modal is re-wired.

### 1.6 Mobile Navigation

| Element | Selector | Notes |
|---|---|---|
| Bottom nav bar | `.bottom-nav` | Visible ≤767px (BP-S5, activated by `display: flex`); hidden ≥768px (BP-S4) |
| Dashboard tab | `#bottomNavDashboard` (or equivalent) | Driver role only |
| Timeline tab | Bottom nav item | All roles |
| Requests/Riwayat tab | `#bottomNavRequests` | Admin (pending), Bidang (history) |
| Notifications tab | `#bottomNavNotifications` | All roles; calls `#btnNotifications.click()` proxy |
| Profile tab | `#bottomNavProfile` | All roles |
| FAB | `.fab-add` | Admin/Bidang; visible ≤767px (BP-S3: hidden ≥768px) |

**Bottom nav proxy click:** `#bottomNavNotifications` calls `#btnNotifications.click()` programmatically — the sidebar Notifikasi button is the actual handler. This proxy mechanism is preserved unchanged in V2 (the `#btnNotifications` element stays in DOM per `BREAKPOINT_AUDIT.md` BP-P3 analysis).

### 1.7 Login

| Element | Notes |
|---|---|
| Login overlay | `#modalLogin` fullscreen; V2 glass card design already active via `platform.css` |
| Background | Four-layer radial gradient mesh (crimson + brand blue) — already V2 |
| Card | `rgba(255,255,255,0.84)` + `backdrop-filter: blur(24px)` + `box-shadow: --shadow-lg` — already V2 |
| "Masuk Cepat" | `#loginQuickAccess { display: none }` — hidden in production |

**Login requires no changes in VSM.** The `platform.css` Phase 1 migration already delivered the V2 login design. Login is excluded from all VSM phases.

---

## 2. Target Claude Shell Inventory

The V2 shell is a three-column layout. When `visualShellV2 = true`, this shell wraps the existing Driver Operations content. No module other than Driver Operations is visible.

```
┌──────────┬────────────────────┬────────────────────────────────────────┐
│  RAIL    │   SECTION PANEL    │   MAIN                                  │
│  64px    │   218px            │   flex: 1                               │
│──────────│────────────────────│─────────────────────────────────────────│
│ [Crest]  │ Driver Operations  │  ┌──────────────────────────────────┐  │
│          │ ─────────────────  │  │  TOPBAR  56px sticky             │  │
│ [DrOps●] │ [+ Tambah Jadwal]  │  │  ☰  |  Driver Operations  |  🔔 │  │
│          │ [+ Ajukan Request] │  │     |  ← Prev  Today  Next→     │  │
│          │ ─────────────────  │  │     |  [date]  │  Name  Role    │  │
│          │ ▶ Timeline Board   │  └──────────────────────────────────┘  │
│          │   Pending Approvals│  ┌──────────────────────────────────┐  │
│          │   Request History  │  │  BODY  (overflow-y: auto)        │  │
│          │   Personal Dash    │  │  .view-anim on entry             │  │
│          │ ─────────────────  │  │                                  │  │
│ [Avatar] │ [Profil] [Keluar]  │  │  KPI strip (if applicable)       │  │
└──────────┴────────────────────│  │  Timeline / Driver Dashboard     │  │
                                 │  │  Vehicle legend                  │  │
                                 │  └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

Section panel nav items are role-gated. Items absent if role doesn't have access (hidden means absent).

### 2.1 Navigation Rail (64px)

| Element | Description |
|---|---|
| Container | `.v2-rail`; `width: 64px`; `flex-shrink: 0`; background: `--side-bg` (`#1D1D1B`); `position: relative` or part of flex shell |
| PBSI crest | Top of rail; PBSI logo icon (monochrome); links to Driver Operations home (same as V1) |
| Driver Operations icon | Only module icon rendered (all other flags off → other icons absent); active indicator: 2px left-edge bar in `--accent` |
| Theme toggle | Absent — `darkModeToggle` flag is `false`; produces no DOM |
| User avatar | Bottom of rail; initials from `currentUser.name`; background: `--avatar-bg`; click opens profile modal |
| Tooltips | Hover on any icon shows label sliding in from left via `transform: translateX`; 140ms |

**In `visualShellV2` mode, the rail shows exactly one module icon** (Driver Operations). Engineering, Analytics, AI, Asset Management icons are absent — their flags are all off. No empty slots, no disabled icons, no placeholders.

### 2.2 Section Panel (218px)

| Element | Description |
|---|---|
| Container | `.v2-panel`; `width: 218px`; `flex-shrink: 0`; background: `--surface`; `border-right: 1px solid --border` |
| Module title | "Driver Operations" in `--side-strong` color, `font-weight: 700`, 13px |
| Divider | Thin rule `--border` under title |
| CTA buttons | `.p-btn.-primary` or `.p-btn.-ghost`; role-gated (see §2.2.1) |
| Nav items | Role-gated list (see §2.2.2); active item: `--side-active-bg` + `--side-active-tx` |
| Footer divider | Thin rule above footer |
| Footer items | [Profil] button, [Keluar] button; both call V1 JS functions |
| Back to Hub | **Absent** — `operationsHub = false`; produces no DOM |

#### 2.2.1 Section Panel CTAs by Role

| Role | CTAs shown | JS function called |
|---|---|---|
| Admin | [+ Tambah Jadwal] | Same as clicking `#btnAddAssignment` → opens `#modalAssignment` |
| Bidang | [+ Tambah Jadwal], [+ Ajukan Request] | Opens `#modalAssignment` or `#modalRequestForm` |
| Driver | None | — |
| Viewer | None | — |

#### 2.2.2 Section Panel Nav Items by Role

| Nav item | Roles | JS function called (no routing — V1 behavior) |
|---|---|---|
| Timeline Board (default active) | All | Scrolls/focuses timeline; no modal |
| Pending Approvals | Admin | Same as clicking `#btnRequests` → opens `#modalRequestsList` |
| Request History | Bidang | Same as V1 requests button → opens `#modalRequestsList` filtered to own |
| Personal Dashboard | Driver | Scrolls to `#driverDashboard` section |
| Admin Panel | Admin | Same as clicking `#btnAdminPanel` → opens admin modal |

**Nav items call V1 JS functions directly — not `navigate()`.** The hash router is dormant. This is intentional: `visualShellV2` is a visual layer over unchanged V1 behavior.

### 2.3 Topbar (56px)

The V2 topbar replaces the V1 header. It occupies the same position (sticky top of main content column) and the same height (56px).

| Element | Description |
|---|---|
| Container | `.v2-topbar`; `height: 56px`; `position: sticky; top: 0`; background: `--topbar-bg`; `border-bottom: 1px solid --border` |
| Hamburger | `.sidebar-toggle` equivalent; mobile only (≤767px); opens V2 drawer |
| Breadcrumb | "Driver Operations" text; `--text` color; takes place of `.header-module-title` |
| Date navigation | Same `#prevDay`, `#todayBtn`, `#nextDay`, `#datePicker` — unchanged functionality; pill container styled with V2 tokens (`--input-bg`, `--border`, `--radius-sm`) |
| Search | `#searchInput`; existing search; V2 input token styling (`.p-inp`) |
| Spacer | `flex: 1` |
| User area | `.header-display-name` + `.role-badge` — unchanged; V2 token styling |
| Notification bell | `.header-notif-btn` — unchanged; visible ≥768px only (BP-P2 preserved) |

**All date navigation event listeners and their bindings to `renderTimeline()` / `autoFocusTimeline()` are unchanged.** The topbar is a re-skinning of the header, not a rewrite.

### 2.4 Main Content Area

| Element | Description |
|---|---|
| Shell wrapper | `.v2-shell`; `display: flex`; `height: 100vh`; applied via `body.v2-shell-active` class |
| Rail | `.v2-rail`; 64px; `flex-shrink: 0` |
| Section panel | `.v2-panel`; 218px; `flex-shrink: 0` |
| Main column | `.v2-main`; `flex: 1`; `overflow: hidden`; contains topbar + body |
| Body | `.v2-body`; `overflow-y: auto`; `height: calc(100vh - 56px)`; contains timeline, KPI, driver dashboard |
| View animation | `.view-anim` keyframe: `opacity 0 + translateY(8px)` → identity over 340ms; applied to body on navigation or page load |

**The existing `.main-area` element is not renamed.** The V2 shell wraps it. When `visualShellV2 = true`:
- `#sidebar` is hidden
- `.main-area { margin-left: 0 }` is overridden (shell flex handles offset)
- The shell wrapper (`body.v2-shell-active`) activates the flex layout

### 2.5 Mobile Navigation (V2, ≤767px)

| Surface | Description |
|---|---|
| V2 bottom tab bar | Same element as V1 `.bottom-nav`; V2 token-updated styling; same tabs and same JS handlers |
| V2 drawer | `.v2-rail` + `.v2-panel` collapse together into off-canvas drawer on mobile; opened by topbar hamburger |
| Drawer backdrop | `.sidebar-overlay` equivalent; click closes drawer |
| FAB | `.fab-add` unchanged; same trigger, same form modal; V2 token styling only |

**The bottom nav JS proxy mechanism is preserved.** `#bottomNavNotifications` → `#btnNotifications.click()` continues to work because `#btnNotifications` stays in DOM (hidden visually on desktop by BP-P3, but accessible to JS).

### 2.6 Modals (unchanged)

All twelve modals remain functionally identical. Their `position: fixed` rendering is unaffected by the outer shell layout. The only change in VSM is that V2 token styling (`platform.css` component classes) is applied consistently — this may already be partially done for some modals via existing `platform.css` overrides.

Z-index: Modal overlays at 200 must remain above all V2 shell elements (rail, panel, topbar). Shell elements must use z-index values below 200.

### 2.7 Login (unchanged)

The login screen is already fully V2-styled via `platform.css` (completed in Phase 1 / P1). No changes in any VSM phase.

---

## 3. Component Mapping

| V1 Component | V1 Selector | V2 Component | V2 Selector | Change type |
|---|---|---|---|---|
| Sidebar container | `#sidebar` | Navigation rail | `.v2-rail` | Layout restructure |
| Sidebar brand block | `.sidebar-brand` | Rail: PBSI crest icon | `.v2-rail__crest` | Visual refactor |
| Sidebar CTA group | `#btnAddAssignment` area | Section panel CTA buttons | `.v2-panel__cta` | Visual refactor |
| Sidebar nav items | `.sidebar-nav-item` | Section panel nav items | `.v2-panel__nav-item` | Visual refactor |
| Sidebar Profil/Keluar | `#btnProfile`, `#btnLogout` | Section panel footer | `.v2-panel__footer` | Visual refactor |
| Sidebar Admin Panel | `#btnAdminPanel` | Section panel nav item | `.v2-panel__nav-item` | Visual refactor |
| Sidebar Notifikasi btn | `#btnNotifications` | Stays in DOM (hidden) — proxy target preserved | (unchanged) | No visual change |
| Sidebar hamburger | `.sidebar-toggle` | V2 topbar hamburger | `.v2-topbar__hamburger` | Visual refactor |
| Sidebar close | `.sidebar-close` | V2 drawer close | `.v2-drawer__close` | Visual refactor |
| Sidebar backdrop | `.sidebar-overlay` | V2 drawer backdrop | `.v2-drawer__overlay` | Visual refactor |
| Header container | `.header` | Topbar | `.v2-topbar` | Visual refactor |
| Header module title | `.header-module-title` | Topbar breadcrumb | `.v2-topbar__crumb` | Visual refactor |
| Header date nav | `.date-nav` | Topbar date nav pill | `.v2-topbar .date-nav` | Token update |
| Header search | `#searchInput` | Topbar search | `#searchInput` (same element) | Token update |
| Header user area | `.header-user-area` | Topbar user area | `.v2-topbar__user` | Token update |
| Header notif bell | `.header-notif-btn` | Topbar notif bell | `.header-notif-btn` (same element) | Token update |
| Main area | `.main-area` | V2 body content | `.v2-body > .main-area` | Layout wrapper added |
| Main area left margin | `margin-left: 240px` | Removed — flex handles offset | `margin-left: 0` via `body.v2-shell-active` | CSS override |
| Bottom nav bar | `.bottom-nav` | V2 bottom tab bar | `.bottom-nav` (same element) | Token update |
| FAB | `.fab-add` | FAB (same) | `.fab-add` (same element) | Token update |
| Admin KPI strip | (inline / text) | V2 KPI cards | `.v2-kpi-card` | Visual addition |
| Driver dashboard cards | `#driverDashboard` sections | V2 token-styled cards | Same sections, `.p-` tokens | Token update |
| Timeline JS render | `timeline.js` output | Unchanged | Unchanged | No change |
| All modals (12) | `#modal*` | Unchanged functionally | Same selectors | Token update only |
| Login screen | `#modalLogin` | **No change** — already V2 | `#modalLogin` | None required |

---

## 4. Migration Phases

Each phase is independently deliverable and independently rollbackable via the `visualShellV2` flag. All phases operate under `visualShellV2 = false` during development and staging. Production enable happens once all phases pass QA.

### Phase VSM-1: Navigation Rail

**Objective:** Build the 64px navigation rail. Replace the V1 sidebar brand column with a modern icon rail.

**Scope:**

1. Add `.v2-rail` element to `index.html`:
   - PBSI crest at top (monochrome logo, 32px); links to timeline (JS call, not route)
   - Driver Operations module icon (calendar or similar; 20px SVG)
   - Active indicator: 2px left-edge bar using `--accent` (`#A8292F`)
   - User avatar at bottom: initials derived from `currentUser.name`; click opens `#modalProfile`
   - No other module icons (all module flags are off → absent per flag rule)
   - No theme toggle button (`darkModeToggle = false` → absent)

2. Tooltip behavior:
   - On hover: module name label slides in from left (`transform: translateX(8px)` → identity, 140ms ease)
   - Tooltip background: `--surface`, `border: 1px solid --border`, `--shadow-md`
   - Tooltip text: "Driver Operations"

3. Rail CSS:
   - `background: var(--side-bg)` — always dark charcoal (`#1D1D1B`)
   - `width: 64px; flex-shrink: 0`
   - `display: flex; flex-direction: column; align-items: center`
   - `border-right: 1px solid var(--side-border)`
   - Hidden when `body:not(.v2-shell-active)`: `display: none`

4. Flag gate:
   - V1 `#sidebar` is hidden when `body.v2-shell-active`: `#sidebar { display: none }`
   - V2 `.v2-rail` shows when `body.v2-shell-active`: `.v2-rail { display: flex }`

5. `FEATURE_FLAGS.md` must be updated with `visualShellV2` flag entry in the same commit that introduces this code.

**JS changes:**
- App init: after flags are loaded, if `flags.visualShellV2 === true`, add `v2-shell-active` class to `body`
- Avatar click handler: calls same function as `#btnProfile` click
- Crest click: no-op or scrolls to top of timeline

**V1 behavior verified when `visualShellV2 = false`:** `#sidebar` fully visible, `.v2-rail` absent, no class on body. Identical to v1.2.5.

---

### Phase VSM-2: Context Panel

**Objective:** Build the 218px section panel. Replace V1 sidebar nav content with V2 section panel layout. All click behavior preserved.

**Scope:**

1. Add `.v2-panel` element to `index.html`:
   - Module title: "Driver Operations" (`font-weight: 700`, 13px, `--side-strong`)
   - Title divider: `1px solid var(--border)`
   - CTA area (role-gated, hidden if role has no CTA):
     - [+ Tambah Jadwal] → `.p-btn.-primary.-sm` → same click handler as `#btnAddAssignment`
     - [+ Ajukan Request] → `.p-btn.-ghost.-sm` → same click handler as request form button
   - Nav item list (role-gated, hidden if role has no access):
     - Timeline Board — always visible for active role; active by default
     - Pending Approvals — Admin only → same click as `#btnRequests`
     - Request History — Bidang only → same click as requests button
     - Personal Dashboard — Driver only → scrolls to `#driverDashboard`
     - Admin Panel — Admin only → same click as `#btnAdminPanel`
   - Footer (below bottom divider):
     - [Profil] → same as `#btnProfile` click
     - [Keluar] → same as logout button click
   - **Back to Hub is absent.** `operationsHub = false` → no Hub exists → no Back to Hub item.

2. Nav item active state:
   - "Timeline Board" is active by default (left border `--accent`, `background: --side-active-bg`, `color: --side-active-tx`)
   - Active state is set purely by CSS class — no router involvement
   - Clicking Personal Dashboard sets Personal Dashboard as active

3. Panel CSS:
   - `background: var(--surface)`
   - `width: 218px; flex-shrink: 0`
   - `border-right: 1px solid var(--border)`
   - `display: flex; flex-direction: column`
   - `overflow-y: auto` (for small screens where panel content might exceed height)
   - Hidden when `body:not(.v2-shell-active)`: `display: none`

4. Mobile drawer:
   - On mobile (≤767px): `.v2-rail` + `.v2-panel` move inside `.v2-drawer`
   - Drawer: `position: fixed; left: 0; top: 0; height: 100vh; width: 282px; transform: translateX(-282px)`
   - `.v2-drawer-open` class: `transform: translateX(0); box-shadow: var(--shadow-lg)`
   - `.v2-drawer__overlay`: same scrim as V1 `.sidebar-overlay`

5. V1 sidebar buttons (`#btnRequests`, `#btnAdminPanel`, `#btnProfile`, `#btnLogout`, `#btnAddAssignment`) remain in the DOM but are inside the hidden `#sidebar`. Their event listeners remain active — the section panel CTA/nav buttons duplicate their click targets. This means clicking either the hidden V1 button OR the new panel button has the same effect (both call the same handler). This is safe and avoids rewriting event wiring.

**Alternative approach:** The section panel buttons call the V1 element's `.click()` directly (proxy click pattern — same as `#bottomNavNotifications` → `#btnNotifications.click()`). This is the zero-risk approach: zero JS rewriting required, the section panel just triggers the existing V1 handlers.

**V1 behavior verified when `visualShellV2 = false`:** `.v2-panel` absent, `#sidebar` visible, all V1 nav items operational.

---

### Phase VSM-3: Header Migration

**Objective:** Replace the V1 sticky header with the V2 topbar. Preserve all date navigation, search, and user area functionality.

**Scope:**

1. Add `.v2-topbar` element above the body content in the `.v2-main` column:
   - `height: 56px; position: sticky; top: 0`
   - `background: var(--topbar-bg)`
   - `border-bottom: 1px solid var(--border)`
   - `display: flex; align-items: center; gap: 12px; padding: 0 16px`

2. Topbar contents:
   - **Hamburger** (mobile only, ≤767px): opens V2 drawer; `class="sidebar-toggle"` (keeps V1 CSS) or new `.v2-topbar__hamburger`
   - **Breadcrumb**: "Driver Operations" text; `font-size: 14px; font-weight: 600; color: var(--text)`
   - **Date nav pill**: same `#prevDay`, `#todayBtn`, `#nextDay`, `#datePicker` elements; wrapped in a container with `background: var(--gray-1); border: 1px solid var(--gray-2); border-radius: var(--radius-sm); padding: 2px 6px` — same as current desktop `.date-nav` from BP-S4
   - **Search**: same `#searchInput`; styled with `.p-inp`
   - **Spacer**: `flex: 1`
   - **User area**: `.header-display-name` + `.role-badge` + `.header-notif-btn`; V2 token-aligned

3. V1 header hidden when `body.v2-shell-active`:
   - `.header { display: none }` (or equivalent V1 header selector)
   - `.v2-topbar { display: flex }` when active

4. **All date navigation event listeners (`#prevDay`, `#todayBtn`, `#nextDay`, `#datePicker`) are not rebound.** The elements keep their IDs and their listeners from V1. The topbar re-uses the same DOM elements by moving them into the topbar HTML, or it contains new elements with the same IDs that replace the hidden V1 header elements. The simpler approach: the V2 topbar is built with its own elements that share the same event handler binding approach as V1.

5. **The search input `#searchInput` keeps its existing event listener.** The filter function bound to it in `app.js` or `timeline.js` runs unchanged.

6. Height at ≤600px (BP-S6): the existing 2-row compact layout behavior applies to the `.v2-topbar` on very small screens. Date nav and search stack to a second row at ≤600px using `flex-wrap: wrap`.

**Shell layout activation (VSM-3 also completes the shell wrapper):**

When `body.v2-shell-active` is set:
```
body.v2-shell-active .main-area  { margin-left: 0; }
body.v2-shell-active #sidebar    { display: none; }
body.v2-shell-active .header     { display: none; }
body.v2-shell-active .v2-shell   { display: flex; }
```

The `.v2-shell` is a new wrapper div added to `index.html`:
```html
<div class="v2-shell">
  <div class="v2-rail"> ... </div>
  <div class="v2-panel"> ... </div>
  <div class="v2-main">
    <div class="v2-topbar"> ... </div>
    <div class="v2-body">
      <!-- existing .main-area content moved here -->
    </div>
  </div>
</div>
```

When `visualShellV2 = false`: `.v2-shell { display: none }` and the original `#sidebar` + `.header` + `.main-area` are in their default V1 state.

**V1 behavior verified when `visualShellV2 = false`:** V1 header fully operational, V1 sidebar visible, no topbar in DOM (or present but hidden).

---

### Phase VSM-4: KPI Cards

**Objective:** Apply V2 card styling to summary metrics. No behavioral change, no new data sources.

**Scope:**

1. **Admin / all-user KPI strip:**
   Build a `#v2KpiStrip` row with four stat cards above the timeline. Each card:
   - `.v2-kpi-card`: `background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 16px`
   - Label: `font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em`
   - Value: `font-size: 24px; font-weight: 700; color: var(--text); font-family: var(--font-mono)`
   - Four metrics derived from in-memory arrays already loaded:
     - **Trip Aktif**: `assignments.filter(a => a.status === 'started').length`
     - **Driver Tersedia**: computed from drivers not in active assignments today
     - **Menunggu**: `requests.filter(r => r.status === 'pending').length`
     - **Selesai Hari Ini**: `assignments.filter(a => a.status === 'completed' && a.date === today).length`
   - Values update on every `renderAll()` call (same trigger as timeline re-render)

2. **Driver dashboard cards (`#driverDashboard`):**
   Each section card in `driver-dashboard.js` output:
   - Update card CSS to use V2 tokens (`--surface`, `--border`, `--shadow-sm`, `--radius-md`)
   - Update status badges to `.p-pill` classes from `platform.css`
   - Update vehicle color patches to use `--v-*` tokens already defined in `platform.css`
   - No changes to `driver-dashboard.js` JS logic

3. **Vehicle legend below timeline:**
   - Update swatch + label CSS to V2 tokens
   - Use `--v-innova`, `--v-luxio`, `--v-poly`, `--v-hiace` tokens
   - No JS changes

4. **KPI strip gating:**
   - Admin/Bidang: KPI strip visible
   - Driver: KPI strip absent; driver dashboard cards take its place
   - Viewer: KPI strip visible (read-only counts)

**Data source confirmation:** All values come from `app.js` in-memory arrays (`assignments`, `requests`). No new Firebase reads. No new Firebase paths. No new computation functions.

**V1 behavior when `visualShellV2 = false`:** KPI strip absent (inside hidden `.v2-shell`). Dashboard cards styled with V1 classes. No visible change to existing V1 UI.

---

### Phase VSM-5: Timeline Container

**Objective:** Ensure the timeline renders correctly within the V2 main content area. No changes to `timeline.js`.

**Scope:**

1. **CSS context for timeline inside `.v2-body`:**
   - Remove `margin-left: 240px` from `.main-area` when shell is active (handled by `body.v2-shell-active .main-area { margin-left: 0 }` in VSM-3)
   - Remove mobile padding override conflict: `.main-content` padding-bottom rule from BP-S5 remains valid (it applies at ≤767px regardless of shell)
   - Verify that timeline horizontal scroll (`overflow-x: auto`) is still correctly constrained to the `.v2-body` container width

2. **Content width verification:**
   - At 1280px: V2 content = `1280 - 64 - 218 = 998px`. Timeline scrolls within 998px. Functional.
   - At 768px: V2 content = `768 - 64 - 218 = 486px`. Timeline scrolls within 486px. Functional.
   - `--hour-width` CSS variable drives column sizing independently; not dependent on container width.
   - Auto-scroll (`autoFocusTimeline()`) uses `scrollLeft` assignments relative to the timeline scroll container, not the viewport. Unchanged.
   - "Now" line (`#nowLine`) position is a percentage of 24 hours; not viewport-relative. Unchanged.

3. **`.main-content` padding-bottom on mobile:**
   - BP-S5 rule `padding-bottom: calc(56px + 70px + env(safe-area-inset-bottom, 0px) + 8px)` applies at ≤767px
   - In V2 mobile: the bottom tab bar is still 56px and FAB is still ~70px height in the overlap zone
   - This padding value remains correct in V2 mobile. No change required.

4. **`timeline.js` is not modified.** The Gantt renderer calls `renderTimeline()` which writes into its DOM target. The outer wrapper change (`.main-area` is now inside `.v2-body`) does not affect the rendering function.

5. **Search filter:** `#searchInput` is now in the topbar. Its binding to `filterDrivers()` or equivalent in `app.js`/`timeline.js` is the same. No rewrite needed — the element has the same ID.

**V1 behavior when `visualShellV2 = false`:** Timeline in original `.main-area` with `margin-left: 240px`. No change.

---

### Phase VSM-6: Micro Animations

**Objective:** Wire existing `platform.css` animation keyframes to V2 shell transitions. No new animation logic — only ensure existing keyframes are applied correctly.

**Scope:**

1. **View entry animation (`.view-anim`):**
   - `platform.css` defines `@keyframes viewIn: opacity(0) translateY(8px) → identity, 340ms`
   - Apply `.view-anim` class to `.v2-body` content on page load and on section panel nav item click
   - The class is added by JS and auto-removes after the animation completes (use `animationend` event)

2. **Modal entry animation (`.pop`):**
   - `platform.css` defines `@keyframes pop: translateY(8px) scale(.985) → identity, 160ms cubic-bezier(.2,.8,.3,1)`
   - Verify `.modal-box` elements (or equivalent) use this keyframe on `display: flex` activation
   - No JS change — CSS `animation` on `.modal-box` fires automatically on display change via the existing transition

3. **Mobile sheet entry (`.sheetUp`):**
   - `platform.css` defines `@keyframes sheetUp: translateY(20px) → identity, 260ms`
   - Verify bottom-sheet modals (≤600px) use this keyframe
   - No JS change

4. **V2 drawer slide (mobile):**
   - Drawer open/close: `transition: transform 0.26s ease` on `.v2-rail` + `.v2-panel` (matches V1 sidebar transition)
   - The `transform: translateX(-282px)` → `translateX(0)` animation replaces V1's `translateX(-240px)` → `translateX(0)`

5. **Theme crossfade (`.theme-anim`):**
   - `platform.css` defines the `.theme-anim` class enabling 550ms CSS property transitions globally
   - When `darkModeToggle` flag activates (future), JS will add `.theme-anim` to `<html>` for ~650ms during the toggle
   - VSM-6 does not activate dark mode — it only ensures the mechanism is in place

6. **Hover states:**
   - Rail icon hover: `background: rgba(255,255,255,0.08)` on icon hit area; `border-radius: var(--radius-sm)`
   - Section panel nav item hover: `background: var(--hover)`
   - Section panel CTA hover: handled by `.p-btn` class from `platform.css`
   - Timeline block hover: `translateY(-1px)` + `--shadow-md` — already in V1, unchanged

**All animation keyframes are already defined in `platform.css`.** VSM-6 is purely about ensuring they are applied to the new shell elements, not about writing new CSS.

---

## 5. Feature Flag Strategy

### 5.1 `visualShellV2` Flag Definition

This flag must be added to `FEATURE_FLAGS.md` before any VSM implementation begins. Per `FEATURE_FLAGS.md` rule 7: flags must be documented before implementing.

| Field | Value |
|---|---|
| **Flag name** | `visualShellV2` |
| **Firebase RTDB path** | `/feature_flags/visualShellV2` |
| **Description** | Enables the V2 three-column visual shell (Rail 64px + Section Panel 218px + Main flex:1) for Driver Operations. When active: V1 sidebar and header are hidden; V2 rail, section panel, and topbar are shown. All Driver Operations business logic is unchanged. No routing, no Operations Hub, no new modules. |
| **Current status** | `DISABLED` |
| **Default value** | `false` |
| **User visibility** | Hidden from all users when `false`. V1 shell remains active. |
| **Activation version** | v2.0.0 preliminary — after VSM phases QA-approved on staging |
| **Activation conditions** | All six VSM phases QA-approved on staging. No regressions on all four roles (Admin, Bidang, Driver, Viewer). All breakpoints (767px, 768px, 1024px) verified. `platform.css` committed and deployed. |
| **Dependencies** | Phase 0 (security baseline) complete. Phase 1 P3 breakpoint changes applied. `platform.css` V2 token layer active. |
| **Roles affected when enabled** | All roles — all users see the V2 visual shell |
| **Rollback** | Set flag to `false` in Firebase. V1 shell immediately restored on next page load. < 30 seconds. |
| **Notes** | This flag is a prerequisite for `operationsHub`. `operationsHub` must not be enabled until `visualShellV2` has been stable in production for at least 14 days. |

### 5.2 CSS Activation Class

The flag maps to a CSS class on `<body>`:

```
visualShellV2 = false  →  body has NO .v2-shell-active class
                          #sidebar visible, .header visible, .v2-shell hidden
                          Application identical to v1.2.5

visualShellV2 = true   →  body gets .v2-shell-active class
                          #sidebar hidden, .header hidden
                          .v2-shell visible (flex), .v2-rail, .v2-panel, .v2-topbar rendered
```

All V2 shell CSS is scoped under `body.v2-shell-active`. No V2 shell CSS affects the application when the class is absent. This is the same pattern as `[data-theme="dark"]` for theming — a single body class gates an entire CSS subtree.

### 5.3 Flag Read at Startup

The flag is read by `app.js` on startup, alongside all other feature flags from Firebase RTDB `/feature_flags`. No new read — it joins the existing flags object.

```
// pseudocode
if (flags.visualShellV2 === true) {
  document.body.classList.add('v2-shell-active');
  initV2Shell();  // VSM-specific init: avatar, tooltip listeners, drawer handlers
}
```

`initV2Shell()` wires the V2-specific interactions (hover tooltips, drawer open/close, view animations). V1 event listeners (date nav, search, modal triggers, etc.) are not modified.

### 5.4 Relationship to `operationsHub`

| State | Behavior |
|---|---|
| `visualShellV2 = false, operationsHub = false` | Full V1 (current production state) |
| `visualShellV2 = true, operationsHub = false` | V2 shell visuals, V1 Driver Operations behavior (this document) |
| `visualShellV2 = true, operationsHub = true` | Full V2 with routing and Operations Hub (ROUTING_ARCHITECTURE.md) |
| `visualShellV2 = false, operationsHub = true` | Invalid state — `operationsHub` requires `visualShellV2`. Must not occur. |

`operationsHub` activation is a strict prerequisite of `visualShellV2 = true` being stable in production. When `operationsHub` activates, it adds routing and converts section panel nav items from V1 JS function calls to `navigate()` calls. The section panel HTML structure built in VSM-2 does not need to change at that point — only the click handlers change.

### 5.5 What Remains Unchanged by the Flag

Setting `visualShellV2 = true` does not change:
- Firebase listeners
- `app.js` global state or callback wiring
- All modal open/close functions
- All form submit handlers (assignment, request, user, odometer)
- All approval workflow logic
- All validation logic
- Role gating (`hasPermission()`)
- Telegram notification dispatch
- Reminder `setInterval` checks
- `localStorage` session management
- Login/logout flow
- `timeline.js` rendering
- `driver-dashboard.js` data logic
- Any `.js` file in the `js/` directory

---

## 6. Risk Assessment

Risks are evaluated against two dimensions: **likelihood during VSM** and **user impact if manifested**.

### Risk 1 — Main area width reduction breaks timeline layout
**Likelihood:** Low. **Impact:** Medium.

V2 shell is 282px wide (vs V1 240px). Content area narrows by 42px. Timeline uses horizontal scroll — `timeline.js` does not break at narrower widths. However, if `--hour-width` or any layout variable assumes the V1 content width, subtle visual clipping could occur at 768px tablet (486px available vs 528px in V1).

**Mitigation:** Test at exactly 768px (iPad portrait) with `visualShellV2 = true`. Run `autoFocusTimeline()` and verify the now-line, auto-scroll, and block positioning are correct at 486px content width.

### Risk 2 — Section panel nav proxy clicks diverge from V1 sidebar behavior
**Likelihood:** Low. **Impact:** Medium.

Section panel nav items call V1 element `.click()` (proxy pattern). If any V1 button has conditional behavior (badge counts, disabled states) that the proxy call bypasses, the V2 experience diverges.

**Mitigation:** Map each V1 button ID to its expected proxy behavior. Verify badge count on `#btnRequests` is still visible (it moves to the section panel nav item). The badge DOM must be inside the section panel item, not on the hidden `#btnRequests` element.

### Risk 3 — Z-index conflict between V2 shell and modals
**Likelihood:** Low. **Impact:** High (modals rendered behind shell elements).

V1 modals use z-index 200. New V2 shell elements (rail, panel, topbar, drawer) must be below 200. The drawer backdrop must also be below modal overlays.

**Mitigation:** Explicitly set all V2 shell z-indices: rail/panel/topbar at z-index ≤ 10. Drawer overlay at z-index 100 (below modals at 200). This must be in the initial CSS commit — do not leave unset.

### Risk 4 — Mobile drawer width change (240px → 282px) breaks small screens
**Likelihood:** Low. **Impact:** Low–Medium.

V1 mobile sidebar drawer is 240px wide. V2 drawer (rail + panel together) is 282px wide. On a 320px viewport, this leaves only 38px of peek area (vs 80px in V1).

**Mitigation:** Cap drawer width at `min(282px, 85vw)` on mobile. This maintains a reasonable peek area on all phones including small 320px devices. The drawer is dismissible by tapping the peek area (existing overlay behavior).

### Risk 5 — `body.v2-shell-active .main-area { margin-left: 0 }` conflicts with BP-S5 mobile rule
**Likelihood:** Low. **Impact:** Medium.

V1 BP-S5 (`@media (max-width: 767px)`) already sets `.main-area { margin-left: 0 }`. The `body.v2-shell-active` rule also sets it to 0. These do not conflict — both override the default 240px. However, the specificity order must be correct: the `body.v2-shell-active` override needs to be in `platform.css` AFTER the BP-S5 rule, or use higher specificity than the base `style.css` rule.

**Mitigation:** Place the `body.v2-shell-active` overrides in `platform.css` in the Phase 2 override section, which loads after `style.css`. Specificity: `body.v2-shell-active .main-area` (2 classes + 1 element) beats `.main-area` (1 class).

### Risk 6 — Bottom nav notification proxy breaks when `#btnNotifications` is inside hidden `#sidebar`
**Likelihood:** Low. **Impact:** Critical.

`#bottomNavNotifications` calls `#btnNotifications.click()` to open the notifications modal. If `#sidebar { display: none }` prevents the element from receiving click events, the proxy fails on mobile.

**Mitigation:** Verify that `display: none` on a parent does not prevent `.click()` programmatic calls on a child. In all major browsers, `.click()` on a `display: none` element triggers the click event and any bound handlers. This is standard DOM behavior. Confirm in testing. If this fails in any target browser, move `#btnNotifications` outside `#sidebar` (as a hidden-but-functional element independent of the sidebar).

### Risk 7 — `#searchInput` rebinding if element is re-created in topbar
**Likelihood:** Medium. **Impact:** High.

If the V2 topbar is built with a new `<input id="searchInput">` element (rather than moving the existing one), any event listeners bound by `app.js` or `timeline.js` to the original element are lost.

**Mitigation:** Either (a) move the existing `#searchInput` DOM element into the topbar via JS when V2 shell activates, or (b) bind the search handler in `initV2Shell()` rather than at module init time. Option (b) is cleaner: the search handler binds to `#searchInput` after the topbar is rendered.

### Risk 8 — Date navigation element relocation loses event bindings
**Likelihood:** Medium. **Impact:** High.

Same risk as #7: if `#prevDay`, `#todayBtn`, `#nextDay`, `#datePicker` are new elements in the topbar, existing event listeners from `app.js` are not bound to them.

**Mitigation:** Use the same approach as #7. Preferred: V2 topbar reuses the same HTML elements (moved from `#header` into `.v2-topbar` when flag is on) OR `initV2Shell()` re-binds these handlers explicitly. Document the binding requirement clearly so it's not missed.

### Risk 9 — `height: 100vh` on `.v2-shell` causes issues on mobile browsers with dynamic address bars
**Likelihood:** Medium. **Impact:** Low.

iOS Safari and Android Chrome shrink the viewport dynamically when the address bar slides away. `height: 100vh` may cause the shell to be taller than the visible area.

**Mitigation:** Use `height: 100%` on the shell and ensure `html, body { height: 100% }` is set. Alternatively use `height: -webkit-fill-available` with a fallback. This is a well-known pattern in `platform.css` already (`env(safe-area-inset-bottom, 0px)` is already used in BP-S5 for bottom nav padding).

### Risk 10 — Incomplete CSS specificity: V1 sidebar styles bleed into V2 panel
**Likelihood:** Low. **Impact:** Low.

Some V1 `style.css` rules target `.sidebar-nav-item`, `.sidebar-nav-group`, and similar selectors. If V2 panel elements accidentally match these selectors (e.g., if V2 panel items reuse a `.sidebar-nav-item` class), they will receive unintended V1 styles.

**Mitigation:** V2 panel elements must use exclusively `.v2-*` and `.p-*` prefixed class names. Never reuse `.sidebar-*` selectors in V2 HTML. This is enforced by the `platform.css` naming convention (`.p-` prefix for all V2 component classes).

---

## 7. Rollback Plan

### Tier 1: Flag Rollback (< 30 seconds)

**Trigger:** Any visual regression, behavioral regression, or user-reported issue after `visualShellV2` is enabled.

**Action:** Set `/feature_flags/visualShellV2` to `false` in Firebase console.

**Effect:** `body.v2-shell-active` class is not added on next page load. V1 sidebar and header are shown. V2 shell elements (`.v2-rail`, `.v2-panel`, `.v2-topbar`) are hidden. Application behavior is byte-for-byte identical to v1.2.5.

**What is preserved:** All Firebase data, all assignments, all requests, all user sessions. No data loss is possible from this rollback.

**Time to restore:** Firebase write propagates within seconds. Users who reload see V1 immediately. Users with active sessions see V1 on next page load or next manual reload.

### Tier 2: Code Revert (< 5 minutes)

**Trigger:** Flag rollback does not resolve the issue (e.g., a V2 shell element is causing a JS error even when hidden, breaking the V1 init sequence).

**Action:** `git revert` the VSM implementation commit(s). Redeploy `index.html`, `platform.css`, and any modified JS files.

**Per-phase revert:** Each VSM phase is a separate commit. VSM-1 through VSM-6 can be reverted independently. Example: if VSM-4 (KPI Cards) introduces a JS error, revert only the VSM-4 commit; VSM-1–3 remain.

### Tier 3: Emergency File Swap (< 2 minutes)

**Trigger:** Tiers 1 and 2 are insufficient (e.g., flag infrastructure is unreachable, Firebase is down).

**Action:** Switch hosting config to `index.v1.html` (the pre-VSM backup of `index.html`). This is the same emergency fallback documented in `MIGRATION_PLAN.md`.

`index.v1.html` must be created before any VSM phase begins. It is a copy of the current `index.html` at v1.2.5 state, committed to the repository.

### Rollback Decision Criteria

| Scenario | Tier | Action |
|---|---|---|
| Visual regression on any breakpoint | 1 | Set flag to `false` |
| Modal broken or inaccessible | 1 | Set flag to `false` |
| Nav action calls wrong function | 1 | Set flag to `false` |
| JS error on flag activation | 1 → 2 | Flag off; revert VSM commit if error persists |
| Timeline not rendering | 1 → 2 | Flag off; revert if timeline issue is in VSM code |
| Notification access broken | 1 → 2 | Flag off; investigate proxy issue |
| Flag infrastructure unreachable | 3 | Emergency file swap |

**All rollbacks are non-destructive.** No Firebase paths are created, modified, or deleted by VSM. No data loss is possible at any tier.

---

## 8. Mobile and Tablet Strategy

### Breakpoint Summary (Post-P3)

| Viewport | Layout | Shell behavior |
|---|---|---|
| ≥ 768px | Desktop / Tablet | Rail + Section Panel always visible. V2 topbar. No bottom nav. |
| ≤ 767px | Phone | Rail + Panel collapsed into off-canvas drawer. V2 bottom tab bar. V2 topbar with hamburger. |
| ≤ 600px | Small phone | 2-row compact topbar (BP-S6 preserved). Bottom-sheet modals. |
| ≤ 480px | Very small phone | Login card single-column (BP-P1 unchanged). |

The P3 breakpoint changes are already applied. This document does not change any breakpoints. VSM operates within the established post-P3 breakpoint system.

### ≥768px (Tablet — iPad Portrait and Larger)

After P3, 768px is a full desktop breakpoint. The V2 shell at 768px:
- Rail: 64px visible
- Section panel: 218px visible
- Topbar: 56px, no hamburger, breadcrumb + date nav + bell visible
- Bottom nav: hidden (BP-S4)
- FAB: hidden (BP-S3)
- Content area: 486px (768 − 64 − 218)

At 768px (iPad portrait), the section panel is visible at full width. Section panel height: the panel must be vertically scrollable if nav items exceed the viewport height. `overflow-y: auto` on `.v2-panel` handles this.

At 1024px+, behavior is identical — just more content width available.

### ≤767px (Phone)

- Rail + panel collapse into `.v2-drawer` (off-canvas, 282px or `min(282px, 85vw)`)
- `.v2-topbar` renders with hamburger button
- Hamburger click: adds `.v2-drawer-open` class → `transform: translateX(0)`, `box-shadow: var(--shadow-lg)`
- Backdrop (`.v2-drawer__overlay`) appears; click dismisses drawer
- `.bottom-nav` (V2-styled) visible: same 5 tabs, same handlers
- `.fab-add` visible for admin/bidang
- Notification access: bottom nav Notifikasi tab (proxy to `#btnNotifications`), NOT header bell

**Drawer contents at ≤767px:**
```
.v2-drawer (282px)
  ├── .v2-rail (64px, full height, icon column)
  └── .v2-panel (218px, full height, nav items)
```

The rail icons are visible in the drawer's left 64px column. On mobile with a single module, the rail provides minimal value — it primarily shows the PBSI crest and the user avatar. The panel occupies most of the drawer and shows the full navigation.

### ≤600px (Small Phone)

BP-S6 applies: 2-row compact topbar layout. The V2 topbar must respect this:
- Row 1: hamburger | brand | spacer | user area
- Row 2: date nav (full-width)

The existing BP-S6 rules from `style.css` (order, flex properties for `.header-inner` children) apply to `.v2-topbar` if it uses matching class names. Alternatively, `.v2-topbar` has its own ≤600px media query that mirrors the BP-S6 layout.

### Mobile FAB

The `.fab-add` button is not part of the V2 shell columns — it is `position: fixed` and overlays the screen. It appears above the bottom nav on mobile (≤767px). Its show/hide rule (BP-S3: `min-width: 768px { display: none }`) is unchanged. No changes needed.

### Bottom Nav Proxy Preservation

`#bottomNavNotifications` calls `#btnNotifications.click()` programmatically. In V2 shell, `#btnNotifications` lives inside `#sidebar` which has `display: none`. As noted in Risk 6: programmatic `.click()` works on hidden elements in all target browsers. Test must confirm this on iOS Safari (primary risk platform) before enabling `visualShellV2`.

---

## 9. Compatibility Matrix

### Business Logic Preservation

| Workflow | Changed by VSM? | Verified by |
|---|---|---|
| Assignment create / edit / delete | No | `assignments.js` untouched |
| Assignment conflict detection | No | `assignments.js` untouched |
| Assignment start / complete (odometer) | No | `modal.js` untouched |
| Request submit / approve / reject | No | `requests.js` untouched |
| Telegram notifications | No | `notification-service.js` untouched |
| H-1 and 2-hour reminders | No | `setInterval` in browser untouched |
| Reimbursement form generation | No | `reimbursement.js` untouched |
| Driver dashboard 4-section view | No | `driver-dashboard.js` untouched |
| Audit log write | No | `logs.js` untouched |
| User CRUD | No | `users.js`, `admin.js` untouched |
| Role gating (`hasPermission()`) | No | `auth.js` untouched |
| Search filter | No | `#searchInput` handler untouched |
| Firebase sync pattern | No | `firebase.js` untouched |
| localStorage session | No | `auth.js` untouched |
| Comment threads | No | `comments.js` untouched |

### Feature Flag Compatibility

| Flag | Status | Interaction with `visualShellV2` |
|---|---|---|
| `visualShellV2` | New (default `false`) | This document |
| `operationsHub` | `DISABLED` (`false`) | `visualShellV2 = true` is a prerequisite for enabling `operationsHub` |
| `engineering` | `DISABLED` | No interaction; module absent regardless of `visualShellV2` |
| `analytics` | `DISABLED` | No interaction |
| `aiAssistant` | `DISABLED` | No interaction |
| `assetManagement` | `DISABLED` | No interaction |
| `multiDayAssignments` | `PENDING` | No interaction; gates V1 behavior only |
| `multiDriverAssignments` | `PENDING` | No interaction |
| `recurringRequests` | `PENDING` | No interaction |
| `sessionExpiry` | `DISABLED` | No interaction |
| `offlineQueue` | `DISABLED` | No interaction |
| `serverReminders` | `DISABLED` | No interaction |
| `firebaseAuth` | `DISABLED` | No interaction |
| `darkModeToggle` | `DISABLED` | Rail theme toggle button absent (flag off → DOM absent) |
| `devMode` | `DISABLED` | No interaction |

### CSS Compatibility

| File | Touched by VSM? | Notes |
|---|---|---|
| `style.css` | Minimal | Only: add `body.v2-shell-active` override rules for `#sidebar`, `.header`, `.main-area`. Existing rules untouched. |
| `platform.css` | Additive only | New `.v2-*` shell selectors added in a Phase 2 section. No existing rules removed or modified. |
| V2 animation keyframes | Pre-existing | `viewIn`, `pop`, `sheetUp`, `.theme-anim` already in `platform.css`. VSM-6 only ensures they are applied. |

### Breakpoint Compatibility

All five breakpoints from the post-P3 system are preserved:

| Breakpoint | Owned by | VSM changes it? |
|---|---|---|
| `min-width: 768px` (desktop gate) | BP-S1, BP-S3, BP-S4, BP-P3 | No |
| `max-width: 767px` (mobile gate) | BP-S2, BP-S5, BP-P2 | No |
| `max-width: 600px` (small phone) | BP-S6, BP-P4, BP-P5 | No |
| `max-width: 480px` (very small phone) | BP-P1 | No |
| `min-width: 768px` notification bell | BP-P2, BP-P3 | No |

### Firebase Compatibility

| Firebase path | Read/write change? | |
|---|---|---|
| `/assignments` | No | Read by `firebase.js` unchanged |
| `/driver_requests` | No | Read/written by `firebase.js`, `requests.js` unchanged |
| `/users` | No | Read by `auth.js`, `users.js` unchanged |
| `/logs` | No | Written by `logs.js` unchanged |
| `/backups` | No | Written by `firebase.js` unchanged |
| `/reimbursement_counters` | No | Written by `reimbursement.js` unchanged |
| `/feature_flags/visualShellV2` | Read only | Read once at startup, joins existing flags object |

**No new Firebase paths are created. No existing Firebase paths are modified. No Firebase Security Rules are changed.**

---

## Phase Sequencing and Exit Criteria

| Phase | Deliverable | Entry requirement | Exit criterion (before next phase) |
|---|---|---|---|
| VSM-1 | Navigation Rail | `platform.css` deployed, P3 applied | Rail renders correctly at 768px + 1280px. V1 unaffected when flag off. |
| VSM-2 | Section Panel | VSM-1 complete | All role-gated items correct. All proxy clicks trigger correct modals. V1 unaffected when flag off. |
| VSM-3 | Header → Topbar + Shell wrapper | VSM-2 complete | Date nav, search, user area all functional in topbar. Layout correct at 767px / 768px / 1024px. |
| VSM-4 | KPI Cards | VSM-3 complete | KPI values match in-memory counts. Driver dashboard cards visually correct. V1 unaffected when flag off. |
| VSM-5 | Timeline Container | VSM-4 complete | Timeline renders, scrolls, and auto-focuses correctly at 486px and 998px content widths. Now-line accurate. |
| VSM-6 | Micro Animations | VSM-5 complete | View entry, modal pop, drawer slide all animate correctly. No animation blocking rendering. |
| Staging QA | Full integration | VSM-6 complete | All four roles (Admin, Bidang, Driver, Viewer) verified at 767px, 768px, 1024px, 1280px. All 12 modals open/close correctly. All workflows exercised. |
| Production enable | `visualShellV2 = true` | Staging QA passed | Flag toggled in Firebase. Monitor for 14 days before considering `operationsHub`. |

---

*This document is the authoritative specification for the VSM migration. Implementation must not begin until this document is reviewed. Each phase must exit cleanly (flag off = V1 identical) before the next phase begins. The `visualShellV2` flag must be added to `FEATURE_FLAGS.md` in the same commit as VSM-1 implementation. Any modification to JS files in `js/` requires immediate re-evaluation against the "visual migration only" constraint.*
