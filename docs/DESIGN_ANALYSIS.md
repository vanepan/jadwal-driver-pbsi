# PBSI Operations Platform — Design Analysis

> Analyzed from production source (`index.html`, `style.css`, `platform.css`, `js/`),
> design prototype files (React/Babel standalone), and screenshots.
> Current production version: **v1.2.3**. Design prototype version: **v2.0**.

---

## 1. Design Architecture

### Two-Layer System

The codebase carries two parallel design layers that are being converged:

| Layer | Files | Stack | Status |
|---|---|---|---|
| **V1 Production** | `style.css`, `index.html`, `js/` | Vanilla JS + Firebase RTDB | Live |
| **V2 Design System** | `platform.css` | CSS custom properties only | Phase 1 active |
| **V2 React Prototypes** | `app/*.jsx`, `platform/*.jsx` | React 18 + Babel standalone | Design exploration |

`platform.css` is an **additive token layer** loaded after `style.css`. It introduces V2.0 tokens, a new login screen, and refinements to existing selectors — without breaking or renaming anything already in `style.css`. The migration comment at the top makes the intent explicit: `platform.css` does NOT modify existing selectors unless explicitly noted with `OVERRIDE:`.

### Token Architecture

Tokens are CSS custom properties on `:root` / `[data-theme]`:

```
Canvas & surfaces    --canvas, --surface, --surface-2
Borders              --border, --border-strong, --grid
Text hierarchy       --text, --muted, --faint
Interactive          --hover, --input-bg, --input-border
Brand                --accent, --on-accent
Chrome regions       --topbar-bg, --tl-head-bg
Sidebar / rail       --side-bg/border/text/strong/faint/active-bg/active-tx
Avatars              --avatar-bg, --avatar-tx
Semantic status      --info/bg, --ok/bg, --warn/bg, --danger/bg
Shadows              --shadow-sm, --shadow-md, --shadow-lg
Overlay              --scrim
Vehicle palette      --v-innova, --v-luxio, --v-poly, --v-hiace
Density              --row-h, --bar-top, --bar-h
```

The vehicle palette (`--v-*`) is the only domain-specific token group. It drives timeline bar colors, legend swatches, and card accents consistently across all views.

### Theme Strategy

- **Light mode**: Default. Warm gray neutrals with a fixed dark charcoal sidebar.
- **Dark mode**: Full inversion defined in `[data-theme="dark"]` but not yet wired to a UI toggle (Phase 3 per the CSS comment).
- **Theme crossfade**: `.theme-anim` on `<html>` enables a 550ms animated transition during switches, preventing flash. JS arms this class for ~650ms then removes it — transitions are opt-in, not always-on.
- **Comfortable density**: `[data-density="comfortable"]` increases `--row-h` from 62px to 74px.

### Typographic Foundation

| Role | Font | Weight Range |
|---|---|---|
| UI text | Inter | 400–800 |
| Monospaced (times, codes, numbers) | JetBrains Mono | 400–600 |

`platform.css` migrates from DM Sans → Inter, noting that both are grotesque sans-serifs with near-identical metrics so no layout shift is expected. Font-size scale runs 9.5px → 30px with `-0.011em` base letter-spacing for optical tightening.

---

## 2. Navigation Architecture

### Production App (V1.2)

```
┌─────────────────────────────────────────┐
│  SIDEBAR (desktop, 236px fixed)          │
│  • Brand logo + "Bidang Sarana"          │
│  • Primary CTA: "Tambah Jadwal" / FAB    │
│  • Requests (admin/bidang) + badge       │
│  • Notifikasi (admin) + dot              │
│  • Admin Panel (admin only)              │
│  • Profil + Logout                       │
│  • App name + version                    │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  HEADER (full-width, sticky)             │
│  Hamburger | Brand (mobile) | Module     │
│  title | Display name | Role badge |     │
│  Date nav (Hari Ini ← date → →)          │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  MAIN CONTENT                            │
│  • Date label                            │
│  • Timeline (horizontal Gantt)           │
│  • Vehicle legend                        │
│  • Driver dashboard (driver role only)   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  MOBILE BOTTOM NAV (≤ phone)             │
│  Dashboard | Riwayat | Notifikasi | Profil│
└─────────────────────────────────────────┘
```

### Design Prototype (V2.0)

The prototype introduces a **two-column shell** replacing the single sidebar:

```
┌────────┬───────────────┬───────────────────────────────┐
│ RAIL   │ SECTION PANEL │  MAIN                          │
│ 64px   │ 218px         │  flex: 1                       │
│        │               │  ┌──────────────────────────┐ │
│ Crest  │ Module title  │  │ TOPBAR                   │ │
│ Mods   │ Back to hub   │  │ Hamburger | Crumb | User │ │
│        │ CTA           │  └──────────────────────────┘ │
│ Theme  │ Nav items     │  ┌──────────────────────────┐ │
│ Avatar │               │  │ BODY (scrollable)        │ │
│        │ Profil/Logout │  │ .view-anim key-animated  │ │
└────────┴───────────────┴──│──────────────────────────┘ │
                             └──────────────────────────┘
```

The **module rail** is the persistent identity column. It shows all modules available to the current role with icon + tooltip. Active module gets a left-edge indicator bar. Hovering any icon shows a tooltip that slides in from the left via `transform: translateX`.

### Role-based Navigation Matrix

| Surface | Admin | Bidang | Driver | Engineering |
|---|---|---|---|---|
| Operations Hub | ✓ | ✓ | — | — |
| Driver Operations | ✓ | ✓ | ✓ (own only) | — |
| Pending Approvals | ✓ | — | — | — |
| Request History | — | ✓ | — | — |
| Engineering module | ✓ | ✓ | — | ✓ |
| Analytics | ✓ | — | — | — |
| Administration | ✓ | — | — | — |
| AI Assistant | ✓ | — | — | — |

Landing destinations by role:
- **Admin / Bidang** → Operations Hub (module picker)
- **Driver** → Driver Operations directly
- **Engineering** → Engineering & Sarpras directly

### Modal System

All modals use `position: fixed` and are unaffected by layout. The production app has 9 modal types declared in HTML:

1. Login screen (fullscreen)
2. Request form
3. Requests list
4. User management list
5. User form (add/edit)
6. Profile
7. Notifications
8. Activity log
9. Assignment form (add/edit)
10. Assignment detail (accordion layout)
11. Comment thread
12. Odometer input (stacked above detail modal)

The detail modal uses an **accordion layout** introduced in v1.2.3: "Ringkasan Jadwal" always expanded, "Detail Tambahan", "Informasi Operasional", "Odometer", and "Ringkasan WhatsApp" collapsed by default.

---

## 3. Module Architecture

### Production: Single-Module App

The current production app is a single-module scheduler — it has one content area (the timeline) plus overlaid modals. The JS module graph:

```
app.js (orchestrator)
├── firebase.js          — Realtime DB sync (assignments + requests)
├── auth.js              — PIN-based login, role resolution
├── timeline.js          — Horizontal Gantt render
├── assignments.js       — CRUD form, conflict detection
├── modal.js             — Detail modal, WA preview, lifecycle actions
├── requests.js          — Request workflow (bidang → admin → approve/reject)
├── driver-dashboard.js  — Driver-specific card sections
├── comments.js          — Comment thread modal
├── notifications.js     — Notification panel
├── notification-service.js — Telegram push dispatch
├── admin.js             — Admin UI controls
├── users.js             — User CRUD
├── logs.js              — Audit log subscription
├── drivers.js           — Driver list, vehicle constants
├── validation.js        — Centralized ValidationRegistry
├── recovery.js          — Data recovery from requests
├── utils.js             — Shared helpers
└── config.js            — App name, version, changelog
```

Each module exports a focused API surface (`init*`, `open*Modal`, `register*Callback`). `app.js` is the only orchestrator — it wires callbacks together, owns global state (`assignments`, `requests`, `auditLogs`), and drives re-renders on Firebase change events.

### Design Prototype: Multi-Module Platform

The V2.0 prototype organizes 5 distinct modules under a single shell:

#### Driver Operations
- Timeline board (Gantt with multi-driver + full-day support)
- Pending approval queue
- Request history
- KPI strip (trip aktif, driver tersedia, menunggu, selesai)
- Driver personal dashboard (today / upcoming / history cards)

#### Engineering & Sarpras
- Kanban pipeline board (5 columns: Diajukan → Ditinjau → Ditugaskan → Dikerjakan → Selesai)
- Work order detail with: SLA progress bar, before/after photos, comment thread, activity history
- Technician management (load view)
- Work order form (category, priority, location, description, attachments)

#### Analytics (preview)
- Overview KPI cards (4 metrics)
- Bar chart: Trip vs Work Order by day-of-week
- Donut chart: Work order by category
- Horizontal utilization bars: drivers + vehicles
- Mini area/line chart: trend over 7 days
- AI-generated insight bullets
- Period toggle (Minggu / Bulan)

#### Administration (preview)
- User management grid with add/edit/toggle/reset-PIN
- Roles & permissions matrix table (8 capabilities × 4 roles)
- Platform configuration cards (Security, Notifications, Integrations, Backup)

#### AI Assistant (preview)
- Suggestion chips (4 canned queries)
- Chat thread with typing indicator
- Data summary cards inline in bot responses
- Persistent composer with sticky position above mobile tab bar

---

## 4. Design System Summary

### Component Library

| Class / Pattern | Description |
|---|---|
| `.p-pill` + `.ok/info/warn/danger/neutral` | Status badges with color dot |
| `.p-btn` + `-primary/-ghost/-ok/-danger/-sm` | Button variants |
| `.p-inp`, `.p-sel`, `.p-ta` | Form inputs with focus ring |
| `.p-switch` | Toggle switch (40×23px) |
| `.p-toast` | Bottom-center toast notification |
| `.p-shead` | Section heading with rule line |
| `.p-empty` | Empty state with icon + title + desc |
| `.p-scroll` | Scrollbar styling (thin, warm gray) |
| `.p-icon[-sm/-lg]` | SVG size normalization (16/13/20px) |

All V2.0 utility classes are prefixed `.p-` to avoid collision with V1 selectors. V1 classes (`.btn-primary`, `.modal-box`, `.toast`, etc.) are refined via token overrides in `platform.css` without renaming.

### Color Palette

```
Accent (PBSI Crimson)    Light: #A8292F   Dark: #CF6469
Background               Light: #F5F5F3   Dark: #17181C
Surface                  Light: #FFFFFF   Dark: #1F2025
Surface 2                Light: #FBFAF8   Dark: #262830
Text primary             Light: #1A1917   Dark: #E6E4DF
Text muted               Light: #5B5953   Dark: #A6A39B
Text faint               Light: #94918B   Dark: #71706B
Info (blue)              Light: #3B5BA9   Dark: #8AA0CF
OK (green)               Light: #2F7D62   Dark: #72AF8F
Warn (amber)             Light: #946420   Dark: #C7A05B
Danger (red)             Light: #A8292F   Dark: #D6817C
Sidebar bg               Light: #1D1D1B   (always dark)
```

The light theme uses a **consistently dark sidebar** — not the white rail seen in the design prototype's "Terang" direction. The sidebar in the production app is always charcoal. The `platform.css` `--side-bg: #1D1D1B` under `:root` reflects this.

### Elevation / Shadow Scale

```
sm    0 1px 2px rgba(28,26,23,.06)          — Cards, inputs
md    0 4px 16px -4px rgba(28,26,23,.12)    — Dropdowns, hover lift
lg    0 18px 50px -12px rgba(28,26,23,.28)  — Modals, login card
```

### Animation Principles

- **Modal entry**: `pop` keyframe — `translateY(8px) scale(.985)` → identity, 160ms cubic-bezier(.2,.8,.3,1)
- **Mobile sheet entry**: `sheetUp` keyframe — `translateY(20px)` → identity, 260ms
- **View transitions**: `viewIn` — `opacity(0) translateY(8px)` → identity, 340ms (keyed by module + view)
- **Hover lift**: `translateY(-1px)` + elevated shadow on interactive cards
- **Bar hover**: `translateY(-1px)` on timeline assignment bars
- **Theme crossfade**: `.theme-anim` class enables 550ms property transitions globally

---

## 5. Mobile & Tablet Strategy

### Breakpoints

| Breakpoint | Label | Strategy |
|---|---|---|
| ≥ 1024px | Desktop | Full two-pane shell, sidebar + rail visible |
| 768–1023px | Tablet | Two-pane, compact chrome, 2-col grids |
| ≤ 767px | Phone | Drawer sidebar, bottom nav, bottom-sheet modals |
| ≤ 480px | Small phone | Login chips go single-column |
| ≤ 900px + landscape | Landscape phone | Trimmed topbar, smaller tab bar |

### Phone Adaptations

**Navigation**
- Sidebar becomes an off-canvas drawer with backdrop scrim
- `transform: translateX(-100%)` → `none` on `.platform.nav-open`
- Hamburger triggers the drawer; backdrop click closes it
- Bottom tab bar (62px + `env(safe-area-inset-bottom)`) replaces sidebar nav
- FAB replaces the sidebar primary CTA

**Content**
- Timeline → `MobileAgenda` component (driver cards with trip rows)
- All grids collapse to single-column (`grid-template-columns: 1fr`)
- KPI stats: 4-col → 2-col

**Modals**
- `.scrim` aligns to `flex-end` (bottom of screen)
- `.modal` gets `border-radius: 20px 20px 0 0` (bottom-sheet shape)
- `max-height: 93vh` prevents full-screen takeover
- `modal-head::before` shows a drag handle indicator (38×4px pill)
- Footer buttons get `flex: 1 1 auto` (full-width stacked)

**Forms**
- All inputs use `font-size: 16px` to prevent iOS auto-zoom
- Time inputs remain separate HH / MM pairs (no native `<input type="time">`)
- `grid-template-columns: 1fr` on `.form-grid`

**Touch targets**
- Minimum 44px tap target on all interactive elements
- Icon buttons: 42×42px on mobile (34×34 on desktop)
- Bottom nav items: `min-height: 44px`

### Tablet Adaptations

- Full persistent sidebar remains visible (no drawer)
- `search` input hidden (`.search { display: none }`)
- User text hidden in header (`.user .utext { display: none }`)
- Stats: 4-col → 2-col
- Engineering Kanban: horizontal-scroll with `scroll-snap-type: x proximity`
- Analytics: `grid-template-columns: repeat(2,1fr)` dashboard

---

## 6. Future Module Architecture

### Roadmap (declared in hub.jsx)

Two modules are placeholder-locked in the Operations Hub with "Segera" (Soon) badges:

#### Asset Management
- Vehicle & facility asset tracking
- Asset ownership records
- Maintenance lifecycle (acquisition → active → serviced → retired)
- Complements Engineering & Sarpras by tracking what assets exist, not just work orders on them

#### Operational Insights
- Cross-module KPI reporting
- Per-bidang data breakdowns
- Unified CSV / PDF export
- Bridges Analytics (which shows internal utilization) with external reporting needs

### Preview → Production Graduation Path

Three modules currently show "Pratinjau" badges and limited implementation:

| Module | Current State | Missing for Production |
|---|---|---|
| Analytics | Full chart UI, canned data | Live Firebase data aggregation, date range queries, real-time updates |
| Administration | User CRUD works, roles matrix is static | Backend enforcement of permission matrix, audit trail integration |
| AI Assistant | Chat UI, 4 canned responses | Real Claude API or similar integration, access to live operational data |

### Engineering Module Expansion

The work order pipeline has documented placeholder surfaces:
- **Before/After photo slots** — grid rendered, upload action is `toast("pratinjau")`. Needs Firebase Storage integration.
- **Attachments** — chip rendered, no actual upload. Same dependency.
- **Technician scheduling** — load card shows WO count; no calendar or conflict detection yet.

### Driver Operations Expansion

Odometer tracking (v1.2.2) is the foundation for a **vehicle utilization analytics** feed. The `distanceTravelled` field already stored in Firebase can power the Analytics module's "Utilisasi Kendaraan" chart with real data instead of seed values.

### Authentication Evolution

Current: PIN-only, client-validated against `users` collection in Firebase RTDB.  
The `firebase-rules.json` file exists in the repo, indicating Firebase Security Rules are in use or planned. A production hardening step would move PIN validation server-side (Firebase Functions or Rules) and add rate limiting on the login endpoint.

### Notification System

`notification-service.js` already dispatches Telegram messages via bot token. The next logical channel is **push notifications** (Web Push / PWA) — the Profile modal already shows a "Push web: Aktif" toggle in the Administration settings card, indicating this is planned.

---

## Appendix: File Map

```
jadwal-driver-pbsi/
├── index.html              Production app shell + all modal HTML
├── style.css               V1 design system (DM Sans, class-based)
├── platform.css            V2 token layer + login screen + component classes
├── firebase-rules.json     Firebase Security Rules
├── js/
│   ├── app.js              Orchestrator, global state, Firebase wiring
│   ├── config.js           APP_NAME, APP_VERSION, VERSION_HISTORY
│   ├── firebase.js         RTDB sync (assignments, requests)
│   ├── auth.js             PIN login, role resolution, permission checks
│   ├── timeline.js         Horizontal Gantt renderer
│   ├── assignments.js      CRUD form, conflict detection
│   ├── modal.js            Detail modal (accordion), WA preview
│   ├── requests.js         Request workflow
│   ├── driver-dashboard.js Driver personal dashboard sections
│   ├── comments.js         Comment thread modal
│   ├── notifications.js    Notification panel UI
│   ├── notification-service.js  Telegram dispatch + reminder logic
│   ├── admin.js            Admin-only UI buttons
│   ├── users.js            User CRUD
│   ├── logs.js             Audit log subscription
│   ├── drivers.js          Driver list, VEHICLES constant
│   ├── validation.js       ValidationRegistry, validators
│   ├── recovery.js         Data recovery from requests
│   └── utils.js            Shared formatting + DOM helpers
└── assets/
    └── Logo-PBSI.png
```

Design prototype files (not part of production bundle):

```
[design-prototypes]/
├── PBSI Driver Ops.html          V1-style React prototype
├── PBSI Operations Platform.html V2 multi-module platform prototype
├── Schedule Board Directions.html 3 visual direction variants
├── PBSI Operations Hub - Directions.html Hub layout variants (A/B/C)
├── PBSI Operations Platform - System Overview.html Design canvas overview
├── app/                          Shared prototype data + components
│   ├── data.jsx, components.jsx, modals.jsx, main.jsx, tweaks-panel.jsx, ops.css
├── platform/                     V2 module components
│   ├── platform-data.jsx, shell.jsx, hub.jsx, driver.jsx
│   ├── engineering.jsx, engineering-modals.jsx, extras.jsx, app.jsx
│   └── platform.css
└── design-canvas.jsx             Figma-like artboard canvas component
```
