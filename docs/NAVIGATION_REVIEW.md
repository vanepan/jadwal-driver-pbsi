# PBSI Operations Platform — Navigation Review

> Audit of the current navigation architecture across all breakpoints.
> Evaluated against: DESIGN_ANALYSIS.md (approved V2 design), ROADMAP.md, and mobile redesign requirements.
> Production baseline: **v1.2.5** · Migration phase: **Phase 1 complete**.
> Prepared: 2026-06-04.

---

## 1. Current Architecture at Each Breakpoint

### Desktop (≥769px)

```
┌──────────────────────────────────────────────────────────────┐
│ SIDEBAR (240px fixed)                                        │
│  [Logo] Bidang Sarana dan Prasarana                          │
│  ───────────────────────────────                             │
│  [+] Tambah Jadwal         ← Admin / Bidang only             │
│  ───────────────────────────────                             │
│  [📋] Pending / Riwayat    ← Admin / Bidang only             │
│  [🔔] Notifikasi           ← HIDDEN (retired, bell in header)│
│  ───────────────────────────────                             │
│  [👤] Profil               ← All roles                       │
│  [⚙] Admin Panel          ← Admin only                      │
│  [→] Logout                ← All roles                       │
│  ───────────────────────────────                             │
│  v1.2.5                                                      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ HEADER (sticky, 56px)                                        │
│  [Module Title]  ─────────────  [Name] [RoleBadge] [🔔] [Date Nav] │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ MAIN CONTENT (timeline + driver dashboard)                   │
└──────────────────────────────────────────────────────────────┘
```

### Tablet Portrait / Landscape (601–768px)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (sticky)                                              │
│  [☰] [Logo Sarpras]  ─────────────  [Name] [Badge] [Date Nav]│
│  Hamburger opens drawer — SAME sidebar structure as desktop  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ MAIN CONTENT                                                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ BOTTOM NAV (fixed, 56px + safe-area)                         │
│  [Dashboard]  [Riwayat*]  [Notifikasi]  [Profil]            │
│  *Admin/Bidang only                                          │
└──────────────────────────────────────────────────────────────┘

[FAB: Tambah/Buat — Admin/Bidang, floats above bottom nav]

Note: drawer + bottom nav are active simultaneously at this range.
```

### Mobile (≤600px)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER ROW 1 (compact)                                       │
│  [☰] [Logo] Sarpras Ops ──────── [Name truncated] [Badge]   │
├──────────────────────────────────────────────────────────────┤
│ HEADER ROW 2 (date nav, full width)                          │
│       [Hari Ini] [←] [date picker] [→]                      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ MAIN CONTENT                                                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ BOTTOM NAV                                                   │
│  [Dashboard]  [Riwayat*]  [Notifikasi]  [Profil]            │
└──────────────────────────────────────────────────────────────┘

[FAB: Tambah/Buat — Admin/Bidang]
```

---

## 2. Evaluation

### 2.1 Header Navigation

| Criterion | Desktop | Tablet (601–768px) | Mobile (≤600px) |
|---|---|---|---|
| Display name always visible | ✅ Yes (160px max, truncates) | ✅ Yes | ✅ Yes (80px max) |
| Role badge visible | ✅ Semantic color | ✅ Yes | ✅ Yes |
| Notification bell | ✅ All authenticated users | ❌ Hidden (CSS ≤768px) | ❌ Hidden (bottom nav covers it) |
| Module context | ✅ Hardcoded "Jadwal Driver Operasional" | ❌ Hidden on ≤768px | ❌ Hidden |
| Date navigation | ✅ Inline pill | ✅ Inline | ✅ Row 2, full-width |
| Breadcrumb / section context | ❌ Not implemented | ❌ Not implemented | ❌ Not implemented |
| Active section indicator | ❌ Not implemented | ❌ Not implemented | ❌ Not implemented |

**Issues:**
- The module title is a hardcoded string. It does not change per role or context (e.g., driver sees "Jadwal Driver Operasional" even though their primary view is the driver dashboard).
- Header bell is hidden at ≤768px, including landscape tablets where there is sufficient space to show it. Bottom nav covers this gap, but landscape tablets (e.g., iPad Air landscape = 1024px, iPad Mini landscape = 1024px) will be at ≥769px and receive the full desktop experience correctly. The 601–768px range is mostly portrait tablets and large phones — bottom nav is appropriate.
- No breadcrumb trail. This is acceptable for V1 (single module). V2 shell will introduce breadcrumbs in the topbar.

---

### 2.2 Sidebar Navigation

| Criterion | Result |
|---|---|
| Always visible on desktop | ✅ Yes (240px fixed) |
| Becomes drawer on mobile/tablet | ✅ Yes (≤768px) |
| Primary CTA visible and role-correct | ✅ Tambah Jadwal (admin), Request Jadwal (bidang), hidden (driver/viewer) |
| Secondary actions visible and role-correct | ✅ Pending/Riwayat for admin/bidang |
| Notifikasi retired cleanly | ✅ Hidden via CSS; element preserved for mobile proxy |
| Admin Panel accessible | ✅ Desktop sidebar + mobile drawer |
| Active state on selected item | ❌ Not implemented — all items look identical when clicked |
| Driver experience on desktop | ⚠️ Near-empty sidebar: only Profil + Logout visible |
| Keyboard close on mobile drawer | ✅ Escape key not wired but backdrop click closes it |

**Issues:**
- No active/selected state. When admin clicks "Pending" the button does not highlight. Every visit looks identical regardless of where the user navigated. This is a standard nav pattern that is absent.
- Driver on desktop sees a sidebar with only Profil and Logout. No primary action, no secondary navigation. The sidebar provides no functional value for drivers on desktop. This is a V2 architecture gap — in V2, the driver lands directly in Driver Operations without a full sidebar.
- The sidebar secondary group (previously: Requests + Notifikasi) now shows only Requests since Notifikasi is retired. The group separator and spacing remain correct — no visual artifact.

---

### 2.3 Bottom Navigation

| Criterion | Result |
|---|---|
| Visible only on mobile/tablet | ✅ ≤768px via CSS |
| Dashboard tab | ✅ Present; handler re-renders timeline + driver dashboard |
| Riwayat tab (Requests) | ✅ Admin + Bidang only |
| Notifikasi tab | ✅ All authenticated users (updated Phase 1) |
| Profil tab | ✅ All authenticated users |
| Active state — current tab highlighted | ⚠️ Hardcoded only — `bottom-nav-active` on Dashboard in HTML, not updated by JS |
| Label accuracy — "Riwayat" for admin | ⚠️ Misleading — admin sees PENDING requests, not history |
| Admin Panel accessible from bottom nav | ❌ Missing — must open drawer |
| Tab count by role | Admin: 4, Bidang: 4, Driver: 3, Viewer: 3 |
| Horizontal overflow | ✅ Fixed (Phase 1) |

**Issues:**
1. **Hardcoded active state.** `bottom-nav-active` is set on `#bottomNavDashboard` in the HTML. When a user taps "Riwayat", "Notifikasi", or "Profil" and closes the modal, the Dashboard tab still appears active. There is no JS that updates the active tab class. The visual state is permanently wrong for non-Dashboard tabs.

2. **"Riwayat" label is semantically wrong for Admin.** For admin, the tab opens the pending request approval queue. "Riwayat" (History) is the correct label for bidang (who sees their submitted request history). A role-aware label would improve clarity.

3. **Admin Panel is absent from bottom nav.** Admin users on mobile must tap the hamburger, open the drawer, scroll to the bottom, and tap "Admin Panel" to access user management. This is a 4-step path for a moderately frequent admin operation. An alternative access point in the bottom nav, or at minimum in the notification/profile area, would improve admin mobile experience.

4. **HTML comment outdated.** The `<!-- Notifikasi — admin only -->` comment on `#bottomNavNotifications` is incorrect — the tab is now visible to all authenticated users. Minor but misleads future developers.

---

### 2.4 Action Hierarchy

#### Desktop

| Tier | Action | Location | Role |
|---|---|---|---|
| Primary | Tambah Jadwal / Request Jadwal | Sidebar CTA (accent button) | Admin / Bidang |
| Secondary | Pending / Riwayat Request | Sidebar nav item | Admin / Bidang |
| Secondary | Notification bell | Header | All authenticated |
| Tertiary | Profil | Sidebar bottom | All |
| Tertiary | Admin Panel | Sidebar bottom | Admin |
| Tertiary | Logout | Sidebar bottom | All |

**Assessment:** Action hierarchy is logical on desktop. Primary CTA is prominent in the sidebar. The notification bell in the header is an appropriately accessible secondary action.

**Gap:** There is no quick shortcut to Admin Panel from anywhere other than the sidebar. For admin users who frequently access user management, this is the expected pattern on desktop (sidebar).

#### Mobile

| Tier | Action | Location | Role |
|---|---|---|---|
| Primary | FAB (Tambah / Buat Request) | Floating, above bottom nav | Admin / Bidang |
| Secondary | Dashboard, Riwayat, Notifikasi, Profil | Bottom nav | Role-filtered |
| Tertiary | Admin Panel, Logout | Drawer | Admin |

**Assessment:** The FAB correctly surfaces the primary action. Bottom nav gives consistent access to the four secondary destinations. Admin Panel depth (drawer only) is a friction point for admin mobile users.

---

### 2.5 Role Visibility

| Navigation Surface | Admin | Bidang | Driver | Viewer | Unauthenticated |
|---|---|---|---|---|---|
| Sidebar CTA (Tambah Jadwal) | ✅ | ✅ Request | ❌ | ❌ | ❌ |
| Sidebar Requests | ✅ Pending | ✅ Riwayat | ❌ | ❌ | ❌ |
| Sidebar Notifikasi | ❌ (retired) | ❌ (retired) | ❌ | ❌ | ❌ |
| Sidebar Admin Panel | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sidebar Profil | ✅ | ✅ | ✅ | ✅ | ❌ |
| Sidebar Logout | ✅ | ✅ | ✅ | ✅ | ❌ |
| Header Bell | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bottom Nav: Dashboard | ✅ | ✅ | ✅ | ✅ | N/A |
| Bottom Nav: Riwayat | ✅ | ✅ | ❌ | ❌ | N/A |
| Bottom Nav: Notifikasi | ✅ | ✅ | ✅ | ✅ | N/A |
| Bottom Nav: Profil | ✅ | ✅ | ✅ | ✅ | N/A |
| FAB (mobile) | ✅ Tambah | ✅ Buat | ❌ | ❌ | N/A |
| Driver Dashboard (below timeline) | ❌ | ❌ | ✅ | ❌ | N/A |

**Assessment:** Role visibility is correctly enforced at every surface. No role sees an action it should not. The `hasPermission()` / `isAdmin()` / `isDriver()` / `isBidang()` guards are working correctly across all nav elements.

**Gap:** Viewer role receives the notification bell (all authenticated users) and the Notifikasi bottom nav tab, but the notification content (operational logs) may not be directly relevant to a viewer. This is acceptable — the empty-state message "Belum ada notifikasi operasional" handles the case gracefully.

---

### 2.6 Mobile Usability

| Criterion | Status | Notes |
|---|---|---|
| No horizontal overflow | ✅ Fixed (Phase 1) | `flex-shrink: 1` on header-user-area |
| Touch target size ≥44px | ✅ Bottom nav items: 56px height | FAB: 50px — borderline |
| Bottom nav always accessible | ✅ Fixed position | |
| FAB accessible above bottom nav | ✅ CSS accounts for 56px + 70px | |
| Primary CTA reachable with one tap | ✅ FAB (admin/bidang) | Driver has no primary CTA |
| Drawer close UX | ✅ Backdrop click closes | X button visible |
| Safe area inset (iPhone notch) | ✅ `env(safe-area-inset-bottom)` on bottom nav | |
| Active tab feedback | ❌ Hardcoded — not updated dynamically | Highest UX priority issue |
| Admin Panel depth | ❌ 4 taps from home | Drawer only |
| iOS Safari test | Not confirmed | |
| Android Chrome test | Not confirmed | |

---

### 2.7 Tablet Usability

| Criterion | Status | Notes |
|---|---|---|
| Portrait layout (601–768px) | ⚠️ Drawer + bottom nav simultaneously | Dual navigation surfaces |
| Landscape layout (≥769px) | ✅ Full desktop sidebar | Breakpoint at 769px |
| 769px = desktop breakpoint | ⚠️ Too sharp | 768px tablet → mobile UX; 769px → full desktop sidebar |
| Header bell on tablet portrait | ❌ Hidden (≤768px) | Bottom nav covers it |
| Touch targets | ✅ Adequate | |
| Admin Panel accessible | ✅ In drawer (portrait), sidebar (landscape) | |
| Notification access | ✅ Bottom nav (portrait), header bell (landscape) | |

**Assessment:** Portrait tablet (601–768px) presents the most complex navigation scenario. Users see a hamburger menu, a brand bar, a user area, date navigation — AND a bottom nav bar. Some actions (Admin Panel, Logout) live in the drawer. Other actions (Dashboard, Requests, Notifikasi, Profil) live in the bottom nav. A user must learn both surfaces. This is an acceptable interim state for V1 but should be resolved in V2 shell migration.

---

## 3. Comparison vs Approved Design

### V1 Current vs V2 Approved

| Surface | V1 Current (v1.2.5) | V2 Approved (Design Analysis) | Status |
|---|---|---|---|
| Desktop navigation | 240px sidebar | 64px rail + 218px section panel | Behind `operationsHub` flag |
| Module switching | Single module (timeline) | Rail icon → section panel | Behind `operationsHub` flag |
| Operations Hub | Not present | Module picker for Admin/Bidang | Behind `operationsHub` flag |
| Landing destination by role | All roles → timeline | Admin/Bidang → Hub; Driver → Driver Ops | Behind `operationsHub` flag |
| Module active indicator | No active state | Left-edge indicator bar on rail icon | Behind `operationsHub` flag |
| Topbar breadcrumb | No breadcrumb | Hamburger + breadcrumb + user | Behind `operationsHub` flag |
| Mobile bottom nav | Tabs: Dashboard/Riwayat/Notifikasi/Profil | Tabs represent modules, not sections | Partially aligned |
| Role-based module visibility | Role-filtered actions in one shell | Role-filtered modules in rail | Behind `operationsHub` flag |
| Theme toggle | Not wired | Dark/light toggle in rail | Behind `darkModeToggle` flag |

### V1 Current vs ROADMAP.md Requirements

| Requirement | Status |
|---|---|
| Display name always visible | ✅ Complete |
| Role clearly visible | ✅ Complete |
| Notification bell as single center | ✅ Complete (header + bottom nav) |
| Sidebar notification removed | ✅ Complete (retired on desktop) |
| Mobile no horizontal scrolling | ✅ Complete (Phase 1 overflow fix) |
| Tablet support | ✅ Functional, UX gaps noted |
| Desktop support | ✅ Complete |
| V2.0 compatibility | ✅ All changes in V1 shell; V2 shell is additive |
| Feature flags not activated | ✅ Compliant |

---

## 4. What Is Already Complete

| # | Item | Phase | Notes |
|---|---|---|---|
| 1 | Design system tokens applied to all nav surfaces | Phase 1 | `--side-*`, `--topbar-bg`, `--accent` etc. |
| 2 | Login screen: V2 glass design, centered, gradient | Phase 1 | `display:flex` fix applied |
| 3 | Masuk Cepat hidden from production login | Phase 1 | CSS `display:none` on `#loginQuickAccess` |
| 4 | Role badges with semantic per-role colours | Phase 1 | `--danger-bg`, `--info-bg`, `--warn-bg`, `--ok-bg` |
| 5 | Header notification bell (all auth'd users, desktop) | Phase 1 | `#btnHeaderNotif` + `#headerNotifDot` |
| 6 | Sidebar Notifikasi retired on desktop | Phase 1 | CSS `display:none !important` at ≥769px |
| 7 | Bottom nav Notifikasi expanded to all auth'd users | Phase 1 | Changed from `isAdmin()` to `currentUser` |
| 8 | Display name: always visible, truncates cleanly | Phase 1 | `overflow:hidden; text-overflow:ellipsis` |
| 9 | Mobile header overflow fix | Phase 1 | `flex-shrink:1; min-width:0` on header-user-area |
| 10 | Bottom nav V2 token alignment | Phase 1 | `--surface`, `--border`, `--faint`, `--accent` |
| 11 | Sidebar V2 token alignment | Phase 1 | `--side-*` tokens throughout |
| 12 | Notification cards V2 token alignment | Phase 1 | `--danger`, `--warn`, semantic priority colours |
| 13 | Bottom nav Dashboard handler | v1.1.0 | Re-renders timeline; calls `renderDriverDashboard()` for driver role |
| 14 | Bottom nav Notifikasi proxies correctly | Phase 1 | `#btnNotifications.click()` still works when hidden |
| 15 | FAB role-correct label | Existing | Admin → "Tambah Jadwal"; Bidang → "Buat Request" |

---

## 5. What Is Still Missing

### Category A — No feature flag required, V1 shell

| # | Issue | Impact | Complexity |
|---|---|---|---|
| A1 | **Bottom nav active state not updated by JS** — `bottom-nav-active` hardcoded on Dashboard in HTML, never updated when other tabs open/close | Medium — user always sees Dashboard as "active" regardless of context | Low |
| A2 | **"Riwayat" label wrong for Admin role** — admin sees pending request queue, not history | Medium — confusing terminology | Low |
| A3 | **HTML comment outdated** — `<!-- Notifikasi — admin only -->` on `#bottomNavNotifications` is incorrect | Low — dev confusion only | Trivial |
| A4 | **Module title hardcoded** — "Jadwal Driver Operasional" does not update per role or context | Low — single module app, title is accurate | Low |
| A5 | **No active state on sidebar nav items** — clicking Pending/Profil does not highlight the item | Medium — common nav pattern missing | Low |
| A6 | **Admin Panel absent from mobile bottom nav** — requires 4-tap path on mobile | Medium — admin mobile UX | Medium |
| A7 | **Driver desktop sidebar near-empty** — only Profil + Logout visible; sidebar provides no functional value for drivers | Low — V2 architecture resolves this | None (wait for V2) |

### Category B — Breakpoint / responsive gaps, V1 shell

| # | Issue | Impact | Complexity |
|---|---|---|---|
| B1 | **Tablet portrait (601–768px): dual navigation surfaces** — drawer AND bottom nav simultaneously active | Medium — two surfaces to learn | Medium |
| B2 | **769px desktop breakpoint is too aggressive** — 1px difference separates mobile and desktop layouts | Low-Medium — edge case | Medium |
| B3 | **No keyboard shortcut for closing mobile drawer** — Escape key not wired | Low | Low |

### Category C — V2 shell, behind `operationsHub` flag

| # | Item | Flag |
|---|---|---|
| C1 | Three-column shell (Rail + Section Panel + Main) | `operationsHub` |
| C2 | Operations Hub module picker | `operationsHub` |
| C3 | Hash router (`#/driver`, `#/hub`) | `operationsHub` |
| C4 | Role-based landing destinations | `operationsHub` |
| C5 | Module active indicator (left-edge bar on rail icon) | `operationsHub` |
| C6 | Topbar with breadcrumb and module context | `operationsHub` |
| C7 | View entry animations (`.view-anim`) | `operationsHub` |
| C8 | Dark mode toggle wired to UI | `darkModeToggle` |

---

## 6. Implementation Priority

### Priority 1 — Immediate (no flags, high value, low risk)

**P1.1: Bottom nav active state management**

Add JS to update the `bottom-nav-active` class dynamically. When a modal opens from a nav tab (Riwayat, Notifikasi, Profil), the corresponding tab becomes active. When the modal closes, Dashboard becomes active again. Implementation: small JS function in `app.js` called on modal open/close events.

**P1.2: "Riwayat" → role-aware label**

For admin: display "Antrian" or "Permintaan" to reflect the pending approval queue.
For bidang: keep "Riwayat" (they see their own submitted requests).
Implementation: one line in `updatePermissionUI()` matching the existing `btnRequestsLabel` pattern already present in the sidebar.

**P1.3: HTML comment cleanup**

Update `<!-- Notifikasi — admin only -->` to `<!-- Notifikasi — all authenticated users -->` on `#bottomNavNotifications`.

### Priority 2 — Near-term (no flags, medium effort)

**P2.1: Sidebar nav active state**

CSS `.sidebar-nav-item--active` class with left-edge indicator using `--accent`. JS sets it on click and clears from siblings. Mirrors the V2 rail active pattern — establishing the pattern now eases V2 migration.

**P2.2: Admin Panel in mobile bottom nav (or modal shortcut)**

Two options: (a) Add `#bottomNavAdmin` tab visible to admin only, opening the User Management modal directly — adds a 5th tab for admin (currently max 4 items); (b) Surface "Admin Panel" as an action inside the Profile modal, which is already in the bottom nav. Option (b) is lower disruption.

**P2.3: Keyboard drawer close (Escape)**

Wire `document.addEventListener('keydown')` → if `Escape` and sidebar is open, close it. Standard UX pattern, zero risk.

### Priority 3 — Structural (V2 prerequisite work, no flags activated)

**P3.1: Hash router foundation**

Implement `#/driver` as the current route without changing any UI. Establish the routing module before the V2 shell is built. This is the prerequisite defined in MIGRATION_PLAN.md Phase 2.

**P3.2: Desktop breakpoint review**

Evaluate changing the sidebar breakpoint from 769px to 1024px. This would:
- Give tablet portrait (768–1023px) the drawer + bottom nav layout (current mobile layout — acceptable)
- Give tablet landscape (1024px+) the full sidebar (currently desktop layout starts at 769px)

Risk: at 769–1023px in the new scheme, users get a sidebar as a drawer. This is currently what 601–768px devices already experience, so the pattern is tested. The sidebar at 240px in a 900px viewport may feel wide — should test.

**P3.3: Tablet portrait navigation consolidation**

For 601–768px, consider hiding the bottom nav and routing all navigation through the sidebar drawer. This eliminates the dual-surface problem. Alternative: show bottom nav only on ≤600px (phone-only) and use drawer exclusively at 601–768px.

### Priority 4 — V2 Shell (gated behind `operationsHub` flag)

Per MIGRATION_PLAN.md Phase 2. Do not begin until Phase 2 prerequisites are met (Phase 0 security baseline, hash router, CSS consolidation complete).

1. Build three-column shell behind `operationsHub` flag.
2. Build Operations Hub module picker.
3. Move Driver Operations content into `#/driver` route.
4. Implement role-based landing destinations.
5. Enable `server_reminders` Cloud Function.

---

## 7. Recommended Implementation Sequence

```
Now (V1 polish, no flags)
  └── P1.1: Bottom nav active state          ← 1 session
  └── P1.2: Role-aware "Riwayat" label       ← same session
  └── P1.3: HTML comment cleanup             ← same session

Near-term (V1 UX improvements)
  └── P2.1: Sidebar nav active state         ← 1 session
  └── P2.2: Admin Panel mobile access        ← 1 session
  └── P2.3: Keyboard drawer close            ← same session

Before V2 shell (structural prerequisites)
  └── P3.1: Hash router foundation           ← Migration Plan Phase 2 prerequisite
  └── P3.2: Breakpoint review (769px → ?)   ← Requires device testing decision
  └── P3.3: Tablet nav consolidation         ← Follows breakpoint decision

V2 Shell (behind operationsHub flag)
  └── Migration Plan Phase 2                 ← After prerequisites
```

---

## 8. V2 Compatibility Assessment

All Phase 1 changes made to the V1 shell are additive and forward-compatible with the V2 shell:

| V1 Change | V2 Impact |
|---|---|
| `platform.css` token overrides | V2 uses the same token system — no conflict |
| `#btnHeaderNotif` in header | V2 topbar replaces the entire `.header` — bell moves to new topbar element |
| `#btnNotifications` CSS-hidden | V2 shell replaces sidebar structure entirely — element removed in V2 HTML |
| Bottom nav V2 tokens | Bottom nav pattern is preserved in V2 but tabs will represent modules |
| Display name / role badge | These elements exist in V2 topbar with same IDs |
| Login screen | Unaffected by shell migration |
| Notification cards | Unaffected by shell migration — same modal |

No V1 changes made during Phase 1 create technical debt for the V2 migration.

---

*This document should be reviewed when Phase 2 (Platform Shell + Routing) begins. Priority recommendations A1–A5 and B3 can be implemented without reopening this review. B1, B2, and all Category C items require a dedicated planning session before implementation.*
