# PBSI Operations Platform — Routing Architecture

> Architecture specification for Migration Plan Phase 2.
> Cross-reference: `MIGRATION_PLAN.md` §Phase 2, §R11 · `FEATURE_FLAGS.md` · `ROADMAP.md` v2.0 · `DESIGN_ANALYSIS.md` §2.
> Migration phases 0–3 complete (P1 CSS consolidation, P2 breakpoints, P3 breakpoints). Routing is the primary deliverable of Phase 2.
> Last updated: 2026-06-04.
> Status: Architecture only. No code changes. No V2 shell implementation. No flag activation.

---

## Context

The V1 production application (v1.2.5) has no client-side routing. All navigation is driven by direct JS function calls — sidebar item clicks invoke modal-open functions, no URL changes occur. This is correct and sufficient for a single-module app.

V2.0 requires routing for three reasons:
- **Multi-module navigation.** Five modules must be independently addressable. The Operations Hub, Engineering, Analytics, AI Assistant, and Asset Management each occupy distinct content areas with no modal-based equivalent in V1.
- **Deep linking.** An admin sharing a direct link to the Engineering Kanban or the Analytics driver utilization view must be possible. This requires stable, bookmarkable URLs.
- **Browser history.** Back and forward buttons must work correctly when a user navigates between modules or sub-views.

`MIGRATION_PLAN.md` §R11 identifies routing as a medium-severity production risk — "routing must be added before the Engineering module ships." It prescribes a minimal hash-router (`window.hashchange` listener) added in Phase 2, with route contracts defined upfront to avoid URL-breaking changes later.

**Constraints this document respects:**
- No Firebase changes of any kind.
- No breaking changes to V1 behavior.
- No V2 shell implementation (document only).
- No flag activation (all flags remain at current state in production).
- Route naming is fixed by this document and must not change in implementation without updating this document in the same commit.

---

## 1. Route Structure

### 1.1 Base Module Routes

All application routes use the hash segment (`#`) of the URL. Seven top-level module routes are defined.

| Route | Module | Default view |
|---|---|---|
| `#/hub` | Operations Hub | Module-picker landing page |
| `#/driver` | Driver Operations | Gantt timeline |
| `#/engineering` | Engineering & Sarpras | Kanban pipeline |
| `#/analytics` | Analytics | KPI overview |
| `#/ai` | AI Assistant | Chat interface |
| `#/assets` | Asset Management | Asset registry |
| `#/admin` | Administration | User management |

These identifiers match the route contracts established in `MIGRATION_PLAN.md` §R11 mitigation and the module paths confirmed in `FEATURE_FLAGS.md` (`#/engineering`, `#/analytics`, `#/ai`, `#/assets`).

### 1.2 Sub-Routes (Section Panel Navigation)

The V2 section panel provides sub-view navigation within each module. Sub-routes follow `#/{module}/{sub-view}`. The router owns module-level dispatch; the section panel owns sub-view dispatch within the active module.

Modals (assignment form, request form, assignment detail, comment thread, odometer input, WA preview, profile, notifications) are not routes. They are triggered by user interaction within a view and do not represent independently addressable destinations.

#### Driver Operations (`#/driver`)

| Sub-route | Label | Roles | Description |
|---|---|---|---|
| `#/driver` | Timeline Board | All | Default. Gantt timeline with date navigation |
| `#/driver/pending` | Pending Approvals | Admin | Request approval queue — all pending requests |
| `#/driver/history` | Request History | Bidang | Bidang's own submitted requests + history |
| `#/driver/dashboard` | Personal Dashboard | Driver | Four-section driver view: Berlangsung, Hari Ini, Mendatang, Riwayat |

Note: the assignment detail modal, odometer input, and WA preview remain modal overlays launched from the timeline — they are not sub-routes.

#### Engineering & Sarpras (`#/engineering`) — behind `engineering` flag

| Sub-route | Label | Roles | Description |
|---|---|---|---|
| `#/engineering` | Kanban Board | Admin, Engineering, Bidang | Default. 5-column work order pipeline |
| `#/engineering/orders` | Work Orders | Admin, Engineering | Work order list with filter and search |
| `#/engineering/technicians` | Technicians | Admin | Technician load view |

#### Analytics (`#/analytics`) — behind `analytics` flag

| Sub-route | Label | Roles | Description |
|---|---|---|---|
| `#/analytics` | Overview | Admin | Default. KPI cards + chart summary |
| `#/analytics/drivers` | Driver Utilization | Admin | Per-driver trip count, hours, overtime ratio |
| `#/analytics/vehicles` | Vehicle Utilization | Admin | Per-vehicle distance (`distanceTravelled`), utilization |
| `#/analytics/demand` | Demand Analytics | Admin | Request volume by bidang and time-of-day |
| `#/analytics/cost` | Cost Analytics | Admin | Reimbursement totals per driver, vehicle, bidang |

#### AI Assistant (`#/ai`) — behind `aiAssistant` flag

| Sub-route | Label | Roles | Description |
|---|---|---|---|
| `#/ai` | Chat | Admin | Natural language query interface; no sub-views |

#### Asset Management (`#/assets`) — behind `assetManagement` flag

| Sub-route | Label | Roles | Description |
|---|---|---|---|
| `#/assets` | Asset Registry | Admin, Engineering | Default. Vehicle and facility asset list |
| `#/assets/maintenance` | Maintenance Log | Admin, Engineering | Maintenance lifecycle (acquisition → active → serviced → retired) |

#### Administration (`#/admin`) — base V2 shell, no additional flag

| Sub-route | Label | Roles | Description |
|---|---|---|---|
| `#/admin` | User Management | Admin | Default. User CRUD (carries V1 user management logic) |
| `#/admin/roles` | Roles & Permissions | Admin | Permission matrix view |
| `#/admin/settings` | Platform Settings | Admin | Security, notifications, integrations, backup config |

Administration is part of the base V2 shell when `operationsHub` is active. It has no separate feature flag. It is accessible to Admin role only.

### 1.3 Default Landing Destinations by Role

After login (or on page load with an active session), the router resolves the destination based on role and flag state.

| Role | Default route | Condition |
|---|---|---|
| Admin | `#/hub` | `operationsHub` enabled |
| Admin | (no route — V1 nav) | `operationsHub` disabled |
| Bidang | `#/hub` | `operationsHub` enabled |
| Bidang | (no route — V1 nav) | `operationsHub` disabled |
| Driver | `#/driver` | Always — Driver bypasses hub |
| Engineering | `#/engineering` | `operationsHub` + `engineering` enabled |
| Engineering | `#/driver` | `engineering` not yet enabled |
| Viewer | `#/driver` | Always |

Driver and Engineering roles never land on the Operations Hub. Admin and Bidang always land on the Hub when `operationsHub` is active.

### 1.4 Redirect Rules

| Condition | Redirect target |
|---|---|
| Empty hash or bare `#` | Role default |
| Unrecognized module segment | Role default |
| Route recognized but module flag is off | Role default |
| Route recognized but role unauthorized | Role default |
| `#/hub` accessed by Driver | `#/driver` |
| `#/hub` accessed by Engineering | `#/engineering` (if flag on) or `#/driver` |
| `#/driver/pending` accessed by non-Admin | `#/driver` |
| `#/driver/history` accessed by non-Bidang | `#/driver` |
| `#/driver/dashboard` accessed by non-Driver | `#/driver` |
| `#/analytics*` or `#/ai*` accessed by non-Admin | Role default |
| Sub-route forbidden for role | Module root (e.g., `#/driver`) |

All redirects are silent — no error page, no forbidden message. The user arrives at their correct destination.

### 1.5 Post-Login Hash Preservation

When a user arrives at a bookmarked hash URL and must authenticate (session expired or first visit), the hash fragment is preserved through the login flow. After authentication, the router evaluates the hash against role and flag guards and either activates the destination or falls back to the role default.

---

## 2. Hash Routing Strategy

### 2.1 Why Hash Routing

Hash routing (`#/path`) is chosen over the History API (`/path`) on four grounds:

1. **No server configuration.** The V1 app is served as a static file. History API routes require server-side rewrite rules (`/* → index.html`). Hash routing requires no server configuration and works with any static host.
2. **No build step.** Hash routing is implemented as a `hashchange` event listener in vanilla JS — no router library, no bundler. This is consistent with V1's no-build delivery model.
3. **Inert until armed.** Adding a `hashchange` listener to a page that previously ignored the hash fragment has zero observable effect until the listener fires routing logic. The V1 app can carry the router in its bundle without any behavior change.
4. **Upgrade path.** If a build step is introduced (Vite, as anticipated for React modules), the hash router can be replaced with a History API router by swapping the listener implementation. Route segment names are identical under both schemes — no URL contract change is needed at that point.

### 2.2 Router Lifecycle

```
App startup
  │
  ├─ Read flags once from Firebase RTDB /feature_flags/{flagName}
  ├─ Resolve user role from auth.js
  │
  ├─ operationsHub = false
  │    └─ Router dormant.
  │       V1 sidebar + header nav active.
  │       window.location.hash present but ignored by application.
  │       Stop.
  │
  └─ operationsHub = true
       ├─ Register window hashchange listener
       ├─ Parse window.location.hash
       ├─ Evaluate flag guard → role guard
       ├─ Pass: activate module, render section panel
       └─ Fail: navigate(roleDefault) → re-evaluate
```

### 2.3 Hash Format

```
#/{module}
#/{module}/{sub-view}
```

Rules:
- Module segment: lowercase, no hyphens (matches `FEATURE_FLAGS.md` paths).
- Sub-view segment: lowercase, no hyphens.
- No query strings. Filter state (date ranges, search terms, selected periods) is managed in-memory by the active module, not in the URL. In-memory filter state has no sharing value and should not pollute the URL contract.
- Only two segments maximum. There is no `#/a/b/c` depth. Deep nesting is resolved by the module internally.

### 2.4 Router Dormancy

When `operationsHub = false` (the current production state and the default for all new environments):
- The `hashchange` listener is not registered.
- The V1 navigation model operates entirely through JS function calls.
- No URL changes occur during in-app navigation.
- Any hash fragment in the URL (e.g., from a developer typing `#/driver` manually) has no effect.

This ensures V1 and router code can coexist in the same bundle without conflict. The router is activated exclusively by setting `operationsHub = true` in Firebase.

### 2.5 Route Dispatch

On each `hashchange` event and once at app startup (when `operationsHub = true`):

```
1. Parse window.location.hash
     → moduleSegment (e.g., "driver")
     → subViewSegment (e.g., "pending") or empty

2. Look up module in route table

3. Flag guard: is this module's flag enabled?
     No  → navigate(roleDefault)

4. Role guard: does current role have access to this route?
     No  → navigate(roleDefault)

5. Guards pass:
     → deactivate current module (if any)
     → activate new module: module.activate(subViewSegment)
     → update section panel for new module
     → update rail active indicator
```

### 2.6 Navigation API

All in-app navigation goes through two functions. No module or event handler assigns `window.location.hash` directly.

| Function | Behavior | Use for |
|---|---|---|
| `navigate(route)` | Sets hash, triggers `hashchange`, full guard evaluation | User-initiated navigation |
| `replace(route)` | Sets hash without a history entry | Redirects (role default fallback, flag-off redirect) |

`window.history.back()` is the standard browser behavior and requires no application wrapper — the router responds to the resulting `hashchange` event naturally.

The prohibition on direct `window.location.hash` assignment applies to all code when the router is active. V1-era code that uses `window.location.hash` (there is none in the current bundle) must be updated before the module it belongs to is activated.

### 2.7 Flag Changes During a Live Session

Flags are read once at startup. A flag toggled in Firebase during an active session does not affect that session. The change takes effect on the next page load.

Exception: if a real-time listener is wired to `/feature_flags` (a future Phase 2+ enhancement, not part of the initial implementation), a flag set to `false` must:
1. Remove the corresponding rail icon.
2. If the current route is guarded by that flag: call `replace(roleDefault)`.

This exception requires no code design decision now — it is noted for the engineer implementing live flag reloading.

---

## 3. Module Boundaries

### 3.1 DOM Ownership

Each module owns exactly one DOM region: the main content area. Only the active module's content occupies that region. Shared platform regions — header/topbar, rail, section panel, bottom nav — are owned by the shell, not by any module.

Modals are `position: fixed` and render outside the module content region. They are owned by the module that opens them. Modal open/close state is not reflected in the URL.

### 3.2 Module Activation Strategy

**Phase 2 (V2 shell initial):** Show/hide within a single `index.html`. All module HTML is present in the document. The active module's container is visible; all others are hidden. This mirrors how V1 already handles content switching (Driver Dashboard and Timeline coexist in the DOM; JS toggles their visibility). Zero new complexity.

**Phase 5+ (React modules):** Dynamic loading. Engineering, Analytics, AI, and Asset Management modules are imported on demand at activation time. Driver Operations and Administration remain as V1 static HTML/JS. The router interface — `activate(subView)` and `deactivate()` — is identical in both strategies. The implementation behind the interface changes; the router does not.

All modules expose:
- `activate(subView)` — called by the router when the module's route becomes active.
- `deactivate()` — called by the router when leaving the module.
- `sectionPanelConfig()` — returns the title, CTA items, and nav items for the section panel renderer.

### 3.3 State Scope

| State | Owner | Storage |
|---|---|---|
| Assignments array | Driver Operations | `app.js` (unchanged V1 pattern) |
| Requests array | Driver Operations | `app.js` (unchanged V1 pattern) |
| Audit logs | Platform | `app.js` |
| Feature flags | Platform | `app.js` flags object (read once at startup) |
| User session + role | Platform | `auth.js` / localStorage |
| Active route | Router | `window.location.hash` (canonical) |
| Selected date, view filters | Per-module, in-memory | Module JS — not in URL |
| Work orders | Engineering module | Engineering module JS |
| Analytics aggregates | Analytics module | Analytics module JS |
| Chat session history | AI module | AI module JS (session-only, not persisted) |
| Asset records | Asset module | Asset module JS |

The V1 global state (`assignments`, `requests` in `app.js`) is not dismantled. Driver Operations reads and writes it as before. New modules own their own state and do not read the Driver Operations state. Cross-module data exchange happens through events (§3.4) or by reading Firebase directly within the module's own listener.

### 3.4 Cross-Module Event Bus

Events that originate in one module and are relevant to another are dispatched as `CustomEvent` on `document`. Modules subscribe by adding `document.addEventListener`. Direct module-to-module function calls are prohibited — modules must not import each other.

| Event name | Source | Subscribers |
|---|---|---|
| `pbsi:assignment:created` | Driver Operations | Analytics |
| `pbsi:assignment:completed` | Driver Operations | Analytics |
| `pbsi:request:approved` | Driver Operations | Analytics |
| `pbsi:workorder:created` | Engineering | Analytics, Asset Management |
| `pbsi:workorder:completed` | Engineering | Analytics |
| `pbsi:asset:status-changed` | Asset Management | Engineering |

All event names are prefixed `pbsi:` to avoid collision with native browser events. Cross-module events are only dispatched when `operationsHub = true`. In V1 mode no events are emitted (no other modules are listening).

### 3.5 Notification Access Independence

The notification system is platform-level, not module-scoped. The header bell (≥768px) and the bottom nav Notifikasi tab (≤767px) open the notifications modal regardless of which module route is active. This access path is defined by the P3 breakpoint changes (`BREAKPOINT_AUDIT.md`) and is unaffected by routing.

`#/notifications` is not a route. Notifications remain modal-based. When the notification system is extended to a platform-wide activity feed, it will remain a modal or a shell-level panel — it will not become a navigable route destination.

---

## 4. Navigation Ownership

### 4.1 V1 Mode (`operationsHub = false`)

The V1 navigation model is untouched. Ownership and behavior:

| Surface | Owner | Action on interaction |
|---|---|---|
| Sidebar (240px) | V1 | Click → direct JS function call |
| Header | V1 | Date nav, user area, hamburger |
| Bottom nav (≤767px) | V1 | Tap → direct JS function call |
| FAB | V1 | Tap → opens assignment / request form |

No URL changes occur. No router is consulted. This is identical to v1.2.5 behavior.

### 4.2 V2 Mode (`operationsHub = true`)

When the flag is active, the V1 sidebar is replaced by the V2 three-column shell. Navigation ownership shifts entirely.

| Surface | Owner | Action on interaction |
|---|---|---|
| Rail (64px) | Shell | Icon click → `navigate('#/module')` |
| Section panel (218px) | Shell + active module | Item click → `navigate('#/module/sub-view')` |
| Topbar | Shell | Notification bell, user area, breadcrumb |
| Bottom tab bar (≤767px) | Shell | Tab tap → `navigate('#/module')` |
| FAB | Driver Operations module | Remains in Driver Operations mobile view |
| Hamburger (≤767px) | Shell | Opens drawer (collapsed rail + section panel) |

The rail owns module-level switching. The section panel owns sub-view switching. The router is the source of truth for which module and sub-view are active — not the DOM state of any nav element.

### 4.3 Section Panel Configuration by Module

Each module's section panel is rendered by the shell from a config object the module provides. Nav items and CTAs that are not accessible to the current role are absent — not disabled, not grayed out.

**Driver Operations:**
```
Driver Operations
─────────────────
[+ Tambah Jadwal]         Admin, Bidang — opens assignment form modal
[+ Ajukan Request]        Bidang only — opens request form modal

Timeline Board            #/driver                     all roles
Pending Approvals         #/driver/pending             Admin only
Request History           #/driver/history             Bidang only
Personal Dashboard        #/driver/dashboard           Driver only

──────────────────
[Back to Hub]             #/hub                        Admin, Bidang only
[Profil]                  opens profile modal          all roles
[Logout]                  logout()                     all roles
```

**Engineering & Sarpras:**
```
Engineering & Sarpras
─────────────────────
[+ Work Order]            Admin, Engineering — opens work order form modal

Kanban Board              #/engineering                Admin, Engineering, Bidang
Work Orders               #/engineering/orders         Admin, Engineering
Technicians               #/engineering/technicians    Admin only

──────────────────────
[Back to Hub]             #/hub
[Profil] [Logout]
```

**Analytics:**
```
Analytics
──────────
Overview                  #/analytics
Driver Utilization        #/analytics/drivers
Vehicle Utilization       #/analytics/vehicles
Demand Analytics          #/analytics/demand
Cost Analytics            #/analytics/cost

──────────
[Back to Hub]             #/hub
[Profil] [Logout]
```

**AI Assistant:**
```
AI Assistant
────────────
Chat                      #/ai

──────────────────
[Back to Hub]             #/hub
[Profil] [Logout]
```

**Asset Management:**
```
Asset Management
────────────────
[+ Add Asset]             Admin only — opens asset form modal

Asset Registry            #/assets
Maintenance Log           #/assets/maintenance

──────────────────
[Back to Hub]             #/hub
[Profil] [Logout]
```

**Administration:**
```
Administration
──────────────
User Management           #/admin
Roles & Permissions       #/admin/roles
Platform Settings         #/admin/settings

──────────────────
[Back to Hub]             #/hub
[Logout]
```

### 4.4 Mobile Navigation (≤767px) in V2 Mode

On mobile, the rail and section panel collapse into a single off-canvas drawer. The bottom tab bar replaces the V1 bottom nav. Tab items represent modules, not sub-views.

| Surface | Behavior |
|---|---|
| Bottom tab bar | Tabs: Hub, Driver, Engineering (if enabled), ... — tap → `navigate('#/module')` |
| Drawer | Contains rail icons + active module section panel; opened by hamburger |
| Notification bell | Absent on mobile (≤767px) per P3 breakpoint rules |
| Bottom nav Notifikasi tab | Present — opens notifications modal |
| FAB | Present in Driver Operations views only |

The V2 mobile bottom tab bar is distinct from the V1 bottom nav. The V1 bottom nav items (Dashboard, Riwayat, Notifikasi, Profil) mapped to in-module actions. The V2 tab bar items map to module routes. The Notifikasi tab is retained — it opens the notifications modal and does not navigate to a route.

### 4.5 Operations Hub

The Operations Hub has no section panel. It occupies the full main area with a grid of module tiles. Each tile is a navigation entry: `navigate('#/module')`. The Hub is not a persistent shell surface — it is a landing page. Once a user selects a module, the Hub is replaced by the module content and the section panel appears.

---

## 5. Feature Flag Interaction

### 5.1 Router Activation Gate

The router is gated at the top level by `operationsHub`. No other flag can activate routing or the V2 shell.

```
operationsHub = false  →  router dormant, V1 nav active, hash ignored
operationsHub = true   →  router active, V2 shell active, hash respected
```

This is a hard gate, not a partial state. There is no intermediate state where some routes work and others do not. The router either runs or does not.

### 5.2 Module Route Guards (Flag Layer)

Each module route is guarded by its corresponding flag before the role guard runs. If the flag is off, the route does not exist from the router's perspective.

| Route | Flag guard | Notes |
|---|---|---|
| `#/hub` | `operationsHub` | Gate is the shell activation itself |
| `#/driver*` | none | Driver Operations is always on when shell is active |
| `#/engineering*` | `engineering` | |
| `#/analytics*` | `analytics` | |
| `#/ai*` | `aiAssistant` | |
| `#/assets*` | `assetManagement` | |
| `#/admin*` | `operationsHub` | Part of base shell; no separate flag |

The `*` notation covers the module root and all its sub-routes.

### 5.3 Rail Rendering Rules

The rail only renders icons for modules that pass both the flag check and the role check for the current user. A disabled module produces no DOM in the rail — not a grayed icon, not a tooltip, no placeholder. This follows the feature flag rule: hidden means absent.

| Rail icon | Rendered when |
|---|---|
| Platform crest (→ hub) | `operationsHub` enabled |
| Driver Operations | Always (when shell active) |
| Engineering | `engineering` flag on + role in {Admin, Engineering, Bidang} |
| Analytics | `analytics` flag on + role = Admin |
| AI Assistant | `aiAssistant` flag on + role = Admin |
| Asset Management | `assetManagement` flag on + role in {Admin, Engineering} |
| Administration | `operationsHub` on + role = Admin |

### 5.4 Startup Sequence (operationsHub = true)

```
1. App init: read /feature_flags/* once from Firebase RTDB
2. Resolve user role from auth.js
3. Compute visible-module set: flags ∩ role permissions
4. Register hashchange listener
5. Parse window.location.hash:
     empty or invalid  → replace(roleDefault)
     valid module route →
       a. flag guard check
       b. role guard check
       c. pass: activate module, render section panel
       d. fail: replace(roleDefault)
6. Render rail with visible-module set
7. Mark active module icon in rail
```

Steps 1–2 are unchanged from V1 startup. Steps 3–7 are additive — they run only when `operationsHub = true`.

### 5.5 V1 Flags Are Routing-Inert

The V1 feature flags (`multiDayAssignments`, `multiDriverAssignments`, `recurringRequests`, `operationalAnalytics`, `telegramAutomation`) do not interact with routing. They gate behavior within the Driver Operations module regardless of routing state. Their values do not affect route guards, rail rendering, or section panel items.

The one V1 flag with a routing adjacency is `operationalAnalytics`: when active in v1.5.0, it surfaces analytics KPI UI within the Driver Operations module (no V2 shell required). When the `analytics` V2 flag subsequently activates, the same data migrates to `#/analytics`. These are two separate surfaces on separate timelines. The router does not need to distinguish between them — `operationalAnalytics` controls in-module content; `analytics` controls a route.

---

## 6. Role-Based Access Model

### 6.1 Roles

| Role | Description | Default landing (V2) |
|---|---|---|
| Admin | Full platform access | `#/hub` |
| Bidang | Submit requests, view own history, Engineering requests | `#/hub` |
| Driver | Own assignments and dashboard only | `#/driver` |
| Engineering | Engineering module, asset status updates | `#/engineering` (when enabled) |
| Viewer | Read-only timeline access | `#/driver` |

Engineering is a new role — it does not exist in V1 user records. Existing users are unaffected. The Engineering role is introduced when the `engineering` flag activates and the first engineering user account is created.

### 6.2 Route Access Matrix

| Route | Admin | Bidang | Driver | Engineering | Viewer |
|---|---|---|---|---|---|
| `#/hub` | ✓ | ✓ | → `#/driver` | → `#/engineering` | → `#/driver` |
| `#/driver` | ✓ | ✓ | ✓ | — | ✓ |
| `#/driver/pending` | ✓ | — | — | — | — |
| `#/driver/history` | — | ✓ | — | — | — |
| `#/driver/dashboard` | — | — | ✓ | — | — |
| `#/engineering` | ✓ | ✓ | — | ✓ | — |
| `#/engineering/orders` | ✓ | — | — | ✓ | — |
| `#/engineering/technicians` | ✓ | — | — | — | — |
| `#/analytics*` | ✓ | — | — | — | — |
| `#/ai*` | ✓ | — | — | — | — |
| `#/assets*` | ✓ | — | — | ✓ | — |
| `#/admin*` | ✓ | — | — | — | — |

A `—` entry means: accessing this route triggers a silent redirect to the role default. No error page, no access denied message.

### 6.3 Role Default Resolution

```
roleDefault(role, flags):
  role == 'driver'                           →  '#/driver'
  role == 'engineering'
    flags.engineering == true                →  '#/engineering'
    flags.engineering == false               →  '#/driver'
  role == 'viewer'                           →  '#/driver'
  role in ('admin', 'bidang')
    flags.operationsHub == true              →  '#/hub'
    flags.operationsHub == false             →  (V1 mode — no route)
  fallback                                   →  '#/driver'
```

### 6.4 Sub-View Access Enforcement

Sub-view access is enforced at two layers:
1. **Section panel renderer.** Items that the current role cannot access are absent from the rendered section panel. The user cannot click to a forbidden sub-view.
2. **Router redirect.** If a user manually enters a forbidden sub-route URL, the router evaluates the role guard and calls `replace('#/module')` — landing them at the module root, which is always accessible for that role.

There is no third layer needed. The combination of absent nav items and router redirect covers all access paths.

### 6.5 V1 Permission Model Continuity

V1 uses `hasPermission(perm)` from `auth.js` to gate individual UI elements (form buttons, modal actions, admin-only controls). This system is unchanged. It continues to operate for all V1 behavior in both V1 mode and V2 mode.

The router role model is additive — it introduces route-level role guards that operate alongside `hasPermission()`. They do not replace it. In Phase 2, route guards read the same `currentUser.role` value that `auth.js` already resolves. No new permission key is needed in the `PERMISSIONS` map for routing itself. Individual module features that require new permission checks (e.g., `manage_assets`, `view_engineering`) will add new PERMISSIONS map entries when those modules are implemented.

---

## 7. Migration Path from Current V1 Navigation

### 7.1 V1 Baseline Navigation Model

In V1 production (v1.2.5), all navigation is JS-driven with no URL changes:

| V1 Surface | Action | URL change |
|---|---|---|
| Sidebar: Tambah Jadwal | Opens assignment form modal | None |
| Sidebar: Requests + badge | Opens requests list modal | None |
| Sidebar: Notifikasi | Opens notifications modal | None |
| Sidebar: Admin Panel | Opens admin UI modal | None |
| Sidebar: Profil | Opens profile modal | None |
| Sidebar: Logout | Calls logout() | None |
| Bottom nav: Dashboard | Scrolls to timeline | None |
| Bottom nav: Riwayat | Opens requests history modal | None |
| Bottom nav: Notifikasi | Opens notifications modal | None |
| Bottom nav: Profil | Opens profile modal | None |
| FAB | Opens assignment / request form | None |
| Header date nav | Calls navigateDate(±1) | None |

There are no bookmarkable views, no deep links, no browser history entries for in-app navigation. This is the correct behavior for a single-module app and requires no remediation in V1 mode.

### 7.2 Phase 2 — Router Added, V1 Nav Fully Intact

**Goal:** Add routing infrastructure to the bundle without altering any observable V1 behavior.

**What is added:**
- A hash router (`router.js` or inline in `app.js`) containing the route table, guard logic, and `navigate()` / `replace()` functions.
- The Operations Hub landing page HTML, built and tested behind `operationsHub` flag.
- The V2 three-column shell HTML structure, built behind `operationsHub` flag.
- Driver Operations content wired to respond to `module.activate('driver', subView)`.
- `hashchange` listener registration, gated on `operationsHub`.

**What is not changed:**
- Existing sidebar click handlers and their JS function calls.
- The V1 bottom nav tap handlers.
- All modal open/close logic.
- All `hasPermission()` role gating.
- The `index.html` structure as seen by users with `operationsHub = false`.
- All Firebase listener registrations, write patterns, and data paths.

**Verification:** With `operationsHub = false` (current production state), the application behaves identically to v1.2.5 on every device, every role, and every viewport. The router code is inert. This must be the explicit exit criterion for Phase 2 before the flag is considered for activation.

### 7.3 Phase 3 — V2 Shell Enabled in Production

**Goal:** Enable `operationsHub` in production. All users transition to hash-routed navigation.

**Activation sequence:**
1. QA sign-off on staging with `operationsHub = true`.
2. Communicate shell change to all team members before production enable.
3. Set `operationsHub = true` in Firebase RTDB. Active sessions unaffected until next page load.
4. Monitor for regressions. Rollback path: set flag back to `false` (< 30 seconds).

**What users see after activation:**

| Role | Pre-Phase 3 | Post-Phase 3 |
|---|---|---|
| Admin / Bidang | V1 sidebar, single module | Operations Hub landing, three-column shell |
| Driver | V1 sidebar (sparse), bottom nav | `#/driver` directly, V2 section panel |
| Engineering | (role doesn't exist yet) | `#/engineering` directly (when flag active) |

### 7.4 V1 Nav Item → V2 Route Mapping

Each V1 sidebar/bottom nav item maps to a V2 equivalent. Items that opened modals in V1 remain modal-based in V2 — they move from sidebar triggers to section panel CTAs or shell-level controls.

| V1 item | V1 action | V2 equivalent | Mechanism |
|---|---|---|---|
| Sidebar: Tambah Jadwal | Opens assignment form modal | Section panel CTA: [+ Tambah Jadwal] | Modal (unchanged) |
| Sidebar: Ajukan Request | Opens request form modal | Section panel CTA: [+ Ajukan Request] | Modal (unchanged) |
| Sidebar: Requests + badge | Opens requests modal | `navigate('#/driver/pending')` (Admin) | Route |
| Sidebar: Notifikasi | Opens notifications modal | Header bell or bottom nav tab | Modal (unchanged) |
| Sidebar: Admin Panel | Opens admin modal | `navigate('#/admin')` | Route |
| Sidebar: Profil | Opens profile modal | Section panel footer [Profil] | Modal (unchanged) |
| Sidebar: Logout | logout() | Section panel footer [Logout] | Function call (unchanged) |
| Bottom nav: Dashboard | Scrolls to timeline | Active state of `#/driver` | Route |
| Bottom nav: Riwayat | Opens requests modal | `navigate('#/driver/history')` (Bidang) | Route |
| Bottom nav: Notifikasi | Opens notifications modal | Bottom nav Notifikasi tab | Modal (unchanged) |
| Bottom nav: Profil | Opens profile modal | Bottom nav or section panel [Profil] | Modal (unchanged) |
| FAB | Opens form modal | FAB retained in Driver Operations mobile | Modal (unchanged) |

The key observation: items that were modal triggers in V1 remain modal triggers in V2. Only items that represented distinct content areas (requests list, admin panel, driver history) become routes. This minimizes the behavioral delta for users and the implementation risk for the migration.

### 7.5 Backward Compatibility

- **No existing bookmarks to break.** V1 users have no in-app deep links — the base URL is the only bookmark. It continues to work after routing is introduced.
- **No Firebase changes.** Routing is entirely client-side. No new Firebase paths, no changed listener registrations, no new security rule requirements. `MIGRATION_PLAN.md` §R11 explicitly confirms this.
- **Active sessions at flag activation.** When `operationsHub` is set to `true`, active sessions see no change until they reload. On reload, the router directs them to their role default. No forced logout, no data loss.
- **Hash in URL during V1 mode.** If a hash fragment exists in the URL while `operationsHub = false` (e.g., a developer tested with `#/driver`), the V1 app ignores it. No error occurs.

---

## 8. Rollback Strategy

### 8.1 Module-Level Rollback (Flag per Module)

Each non-base module is rolled back by setting its flag to `false` in Firebase RTDB. The rollback is non-destructive: no Firebase data is deleted, no code is changed. The feature is simply hidden.

| Module | Flag | Effect of setting to `false` |
|---|---|---|
| Engineering | `engineering` | Rail icon removed. `#/engineering*` redirects to role default. Work order data untouched. |
| Analytics | `analytics` | Rail icon removed. `#/analytics*` redirects to role default. Aggregation halts. Data untouched. |
| AI Assistant | `aiAssistant` | Rail icon removed. `#/ai*` redirects to role default. |
| Asset Management | `assetManagement` | Rail icon removed. `#/assets*` redirects to role default. Asset data untouched. |

Any user currently on a route guarded by the rolled-back flag is redirected to their role default on the next router evaluation (next navigation action or next `hashchange` event). They are not immediately ejected mid-session; the redirect happens gracefully on next navigation.

### 8.2 Shell-Level Rollback (`operationsHub` Flag)

Setting `operationsHub = false` in Firebase reverts the application to V1 navigation for all users on their next page load:

- V2 three-column shell is hidden.
- V1 sidebar, header, and bottom nav are shown.
- `hashchange` listener is dormant (or removed by the app init check).
- All module-level flags become irrelevant — their routes are unreachable without the router.
- Hash fragments in the URL are ignored.

**This is the primary rollback path for any shell regression.** It requires no code deployment — only a Firebase write. Time to restore for all users: < 30 seconds (Firebase write propagation) + one page reload per user.

### 8.3 Emergency File Fallback (`index.v1.html`)

Per `MIGRATION_PLAN.md` §Rollback Strategy: during the V2 shell transition, `index.v1.html` is maintained as a live backup of the pre-shell `index.html`. The hosting configuration can point to either file without a code change.

This fallback handles failure modes where the flag infrastructure itself is unavailable (Firebase RTDB connectivity loss, rules lockout preventing flag reads). It is a last-resort measure only. The `operationsHub` flag rollback (§8.2) must be the first action taken in any shell regression scenario.

`index.v1.html` must be kept in sync with V1 production releases until `operationsHub` has been stable in production for 30+ days and the flag is promoted to always-on (retired per the flag lifecycle).

### 8.4 Hash Fragment State on Rollback

When `operationsHub` is rolled back to `false` and a user's browser URL contains a route hash (e.g., `#/engineering/orders`):
- The router becomes dormant.
- The hash is present in the URL bar but has no effect on the application.
- The V1 sidebar and header activate normally.
- The user sees the V1 layout with no disruption.
- No hash cleanup is required during rollback.

On next page load (after the user navigates away and returns, or refreshes), the base URL is loaded, the router is dormant, and the V1 app initializes as normal.

### 8.5 Rollback Decision Criteria

| Scenario | Primary action | Secondary if primary fails | Time to restore |
|---|---|---|---|
| New module UI regression | Set module flag to `false` | — | < 30 seconds |
| Shell layout regression | Set `operationsHub` to `false` | Switch hosting to `index.v1.html` | < 30 seconds / < 2 min |
| Router logic bug (bad redirect) | Set `operationsHub` to `false` | Switch hosting to `index.v1.html` | < 30 seconds / < 2 min |
| Module JS crash on activation | Set module flag to `false` | Set `operationsHub` to `false` | < 30 seconds |
| Flag infrastructure unreachable | Switch hosting to `index.v1.html` | — | < 2 minutes |

Routing bugs do not affect data. Firebase RTDB is unchanged regardless of routing state. No routing rollback requires a data recovery operation. Data rollback procedures remain as documented in `MIGRATION_PLAN.md` §Data Rollback and are unrelated to routing.

---

## Summary: Route × Flag × Role Matrix

| Route | `operationsHub` | Module flag | Admin | Bidang | Driver | Engineering | Viewer |
|---|---|---|---|---|---|---|---|
| `#/hub` | required | — | ✓ | ✓ | → driver | → eng/driver | → driver |
| `#/driver*` | required | none | ✓ | ✓ | ✓ | — | ✓ |
| `#/engineering*` | required | `engineering` | ✓ | ✓ | — | ✓ | — |
| `#/analytics*` | required | `analytics` | ✓ | — | — | — | — |
| `#/ai*` | required | `aiAssistant` | ✓ | — | — | — | — |
| `#/assets*` | required | `assetManagement` | ✓ | — | — | ✓ | — |
| `#/admin*` | required | — | ✓ | — | — | — | — |
| V1 nav (all) | `false` | n/a | ✓ | ✓ | ✓ | — | ✓ |

A `—` entry is a silent redirect to the role default. The `*` notation covers all sub-routes of that module.

---

*This document is the authoritative routing contract for the PBSI Operations Platform V2. Route identifiers, flag guard assignments, and role guard assignments defined here are fixed. Implementation may not change these values without updating this document in the same commit. New routes or sub-routes added in future phases must be appended here before implementation begins.*
