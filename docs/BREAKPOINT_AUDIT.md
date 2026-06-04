# PBSI Operations Platform — Breakpoint Audit

> Complete audit of all responsive breakpoint declarations across `style.css`, `platform.css`, and `js/app.js`.
> Prepared for the P3 migration (B1 + B2 fix: shift 769/768 threshold to 768/767).
> Cross-reference: `NAVIGATION_REVIEW.md` §B1, §B2 · `MIGRATION_PLAN.md` Phase 1 · `ROADMAP.md` v2.0 design spec.
> Last updated: 2026-06-04.

---

## Quick Reference: All Breakpoints

| ID | File | Line | Declaration | P3 Action |
|---|---|---|---|---|
| BP-S1 | style.css | 251 | `@media (min-width: 769px)` | Change → 768px |
| BP-S2 | style.css | 256 | `@media (max-width: 768px)` | Change → 767px |
| BP-S3 | style.css | 411 | `@media (min-width: 769px)` | Change → 768px |
| BP-S4 | style.css | 2486 | `@media (min-width: 769px)` | Change → 768px |
| BP-S5 | style.css | 2511 | `@media (max-width: 768px)` | Change → 767px |
| BP-S6 | style.css | 2547 | `@media (max-width: 600px)` | **No change** |
| BP-P1 | platform.css | 681 | `@media (max-width: 480px)` | **No change** |
| BP-P2 | platform.css | 1174 | `@media (max-width: 768px)` | Change → 767px |
| BP-P3 | platform.css | 1184 | `@media (min-width: 769px)` | Change → 768px |
| BP-P4 | platform.css | 1201 | `@media (max-width: 600px)` | **No change** |
| BP-P5 | platform.css | 1241 | `@media (max-width: 600px)` | **No change** |
| BP-A1 | app.js | 343 | `window.innerWidth < 769` | Change → `< 768` |

**Total declarations requiring change: 7** (BP-S1, BP-S2, BP-S3, BP-S4, BP-S5, BP-P2, BP-P3, BP-A1)
**Declarations that must not change: 4** (BP-S6, BP-P1, BP-P4, BP-P5)

---

## V2 Target Breakpoints (from DESIGN_ANALYSIS.md)

| Width | V2 Label | V2 Strategy |
|---|---|---|
| ≥ 1024px | Desktop | Full two-pane shell (rail 64px + section panel 218px) |
| 768–1023px | Tablet | Two-pane, compact chrome, persistent sidebar |
| ≤ 767px | Phone | Drawer sidebar, bottom nav, bottom-sheet modals |
| ≤ 480px | Small phone | Login chips single-column |

**P3 establishes the 767/768 phone/tablet boundary — the same value V2 uses.** The 1024px desktop threshold is a V2 shell concern (behind `operationsHub` flag) and is NOT part of P3. After P3, the 768–1023px range uses V1 sidebar (not V2 rail), but the breakpoint boundary is correct.

---

## 1. Complete Instance Inventory

### BP-S1 — style.css line 251

```css
.sidebar-nav-group.sidebar-nav-desktop-only { display: none !important; }
@media (min-width: 769px) {
  .sidebar-nav-group.sidebar-nav-desktop-only { display: flex !important; }
}
```

**Purpose:** Controls which sidebar nav groups are visible. The `.sidebar-nav-desktop-only` class wraps three groups: the primary CTA (Tambah Jadwal), the secondary actions (Requests, Notifications), and the Profil button. All are hidden on mobile so they don't duplicate functionality already in the bottom nav or FAB.

**Affected elements when flag flips:**
- `#btnAddAssignment` (primary CTA) — appears in sidebar
- `#btnRequests` (requests/pending) — appears in sidebar
- `#btnNotifications` (hidden by BP-P3, but structurally in this group) — appears in sidebar container
- `#btnProfile` (profil) — appears in sidebar

**Device behavior today:**
- ≤768px: all desktop-only groups hidden → sparse drawer (Admin Panel + Logout only)
- ≥769px: all desktop-only groups visible → full sidebar navigation

**Behavior after P3 change to `min-width: 768px`:**
- ≤767px: desktop-only groups hidden → sparse drawer (phone)
- ≥768px: desktop-only groups visible → full sidebar navigation (iPad portrait now included)

**Regression risk:** None. At 768px the sidebar shows the same items it shows at 769px today. The content at 768px is identical to 769px.

---

### BP-S2 — style.css line 256

```css
@media (max-width: 768px) {
  #btnProfile.sidebar-nav-item { display: none !important; }
}
```

**Purpose:** Hides the Profil button specifically within the sidebar at mobile widths. On mobile, Profil is accessed via the bottom nav, so the sidebar entry is hidden to avoid duplication. The selector is more specific than the desktop-only group rule because `#btnProfile` is placed inside `.sidebar-nav-group-bottom` (which is not a desktop-only group) so it survives on both surfaces at its base state.

**Note:** `#btnProfile` is inside `.sidebar-nav-desktop-only` group. This rule adds an extra layer of specificity. On mobile the group is already hidden by BP-S1, making this rule redundant — but it is harmless as a belt-and-suspenders guard.

**Device behavior today:**
- ≤768px: Profil hidden in sidebar → lives in bottom nav
- ≥769px: This rule doesn't apply → Profil appears in sidebar

**Behavior after P3 change to `max-width: 767px`:**
- ≤767px: Profil hidden in sidebar → lives in bottom nav (phone)
- ≥768px: This rule doesn't apply → Profil appears in sidebar (iPad portrait included)

**Regression risk:** None. At 768px, the bottom nav is also hidden (per BP-S4/BP-S5 change). Profil is therefore correctly only in the sidebar, not duplicated.

---

### BP-S3 — style.css line 411

```css
@media (min-width: 769px) {
  .fab-add { display: none !important; }
}
```

**Purpose:** Hides the Floating Action Button on desktop. The FAB is a mobile-only primary action affordance. On desktop, the primary CTA (Tambah Jadwal) lives in the sidebar.

**Device behavior today:**
- ≤768px: FAB visible (admin and bidang see it)
- ≥769px: FAB hidden → sidebar CTA is used

**Behavior after P3 change to `min-width: 768px`:**
- ≤767px: FAB visible (phone)
- ≥768px: FAB hidden → sidebar CTA used (iPad portrait now correct)

**Regression risk:** None. FAB and sidebar CTA are functionally equivalent — both open the assignment/request form. On iPad portrait at 768px, the sidebar CTA is the appropriate affordance since the sidebar is always visible.

---

### BP-S4 — style.css line 2486 (Main Desktop Block)

```css
@media (min-width: 769px) {
  .sidebar-toggle { display: none; }       /* hide hamburger */
  .sidebar-close  { display: none; }       /* hide drawer X button */
  .sidebar-overlay { display: none !important; } /* hide backdrop */
  .header-brand { display: none; }         /* hide mobile brand logo in header */
  .bottom-nav { display: none !important; } /* hide bottom navigation bar */
  .fab-add { display: none !important; }   /* hide FAB (redundant with BP-S3, defensive) */
  .header-module-title { display: block; } /* show module title ("Jadwal Driver Operasional") */
  .date-nav { /* reset date nav to inline pill style */ }
  .header-inner { flex-wrap: nowrap; height: 56px; padding: 0 16px; }
  .header-spacer { flex: 1; }
}
```

**Purpose:** This is the primary responsive gate. Everything in this block defines the "desktop experience." It simultaneously: removes mobile chrome (hamburger, drawer X, backdrop); hides mobile navigation surfaces (bottom nav, FAB); and restores desktop chrome (module title, inline date nav, correct header height).

**This is the highest-impact declaration in the entire breakpoint system.**

**Device behavior today:**
- ≤768px: All desktop chrome hidden; mobile chrome active
- ≥769px: Desktop chrome active; mobile chrome hidden

**Behavior after P3 change to `min-width: 768px`:**
- ≤767px: Mobile behavior (phone)
- ≥768px: Desktop behavior (iPad portrait, iPad Air, all tablets, desktop)

**Downstream effects at 768px:**
- `.main-area { margin-left: 240px }` — currently set by the default CSS (not in a media query). At 768px, the sidebar is fixed 240px and the main area needs 240px left margin. This must be confirmed — is `margin-left: 240px` set only outside any breakpoint? Yes — checking style.css: `.main-area { flex: 1; margin-left: 240px; ... }` is in the base styles. BP-S5 overrides it to `margin-left: 0` for mobile. After P3 change, at 768px the base 240px margin applies correctly. ✅
- Content width at 768px: `768 - 240 = 528px` available for timeline. The timeline uses horizontal scroll, which already works at this content width on desktop screens.

**Regression risk:** Low-medium. All elements controlled by this block behave identically at 768px and 769px — the only change is that 768px (iPad portrait) now enters this block. The sidebar at 528px content width needs verification.

---

### BP-S5 — style.css line 2511 (Main Mobile Block)

```css
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-240px);   /* sidebar starts off-screen */
    transition: transform 0.26s ease;
    box-shadow: none;
  }
  .sidebar.sidebar-open {
    transform: translateX(0);        /* slides in when opened */
    box-shadow: var(--shadow-lg);
  }
  .sidebar-close { display: flex; }
  .sidebar-toggle { display: flex; }
  .header-brand { display: flex; }
  .header-module-title { display: none; }
  .main-area { margin-left: 0; }    /* full width, no sidebar space */
  .bottom-nav { display: flex; }    /* bottom nav visible */
  .main-content {
    padding-bottom: calc(56px + 70px + env(safe-area-inset-bottom, 0px) + 8px);
  }
  .toast { bottom: calc(...); }
  body.sidebar-is-open { overflow: hidden; }
}
```

**Purpose:** Defines the phone/tablet-as-mobile experience. The sidebar becomes an off-canvas drawer. The bottom nav appears. The main area fills the full viewport width. Bottom padding accounts for the bottom nav (56px) + FAB overlap zone (70px) + safe area.

**Device behavior today:**
- ≤768px: Drawer + bottom nav + full-width main area (phone AND iPad portrait)
- ≥769px: This block doesn't apply → desktop layout

**Behavior after P3 change to `max-width: 767px`:**
- ≤767px: Drawer + bottom nav + full-width main area (phone only)
- ≥768px: This block doesn't apply → desktop layout (iPad portrait now gets desktop layout)

**Critical items inside this block and their behavior at 768px after change:**

| Rule | Current at 768px | After P3 at 768px |
|---|---|---|
| `sidebar { transform: translateX(-240px) }` | Applied — sidebar off-screen | Not applied — sidebar stays fixed on-screen via base CSS |
| `.main-area { margin-left: 0 }` | Applied — full width | Not applied — base `margin-left: 240px` takes effect |
| `.bottom-nav { display: flex }` | Applied — bottom nav visible | Not applied — BP-S4 hides bottom nav |
| `padding-bottom: calc(56px+70px+...)` | Applied — extra padding | Not applied — standard desktop padding |
| `body.sidebar-is-open { overflow: hidden }` | Applied — but never triggered if sidebar can't open | Not applied — but still irrelevant since hamburger is hidden |

**Regression risk:** Medium. Each rule inside this block reverts to its base value at 768px. The main concern is `margin-left: 0` → `margin-left: 240px`. This must be verified: if `margin-left: 240px` is the default and BP-S5 overrides it to `0`, then removing BP-S5 from 768px restores the original 240px. This is correct. ✅

**Note on modal bottom-sheet:** The bottom-sheet modal style (`border-radius: 16px 16px 0 0`, `position: fixed; bottom: 0`) is in BP-S6 (≤600px), NOT in BP-S5. So at 601–767px, modals are already centered (not bottom-sheet). This does NOT change with P3.

---

### BP-S6 — style.css line 2547 (Small Phone Block) — NO CHANGE

```css
@media (max-width: 600px) {
  /* Header: 2-row compact layout */
  .header-inner { flex-wrap: wrap; height: auto; ... }
  .sidebar-toggle { order: 1; }
  .header-brand   { order: 2; flex: 1; }
  .header-spacer  { order: 3; flex: 1; }
  .header-user-area { order: 4; }
  .date-nav { order: 10; flex: 0 0 100%; /* full-width row 2 */ }

  /* Typography / sizing compacted */
  .brand-logo { width: 26px; }
  .brand-title { font-size: 12px; }
  .header-display-name { max-width: 90px; font-size: 12px; }

  /* Timeline density increased */
  :root { --row-height: 44px; --driver-col: 72px; --hour-width: 58px; --header-height: 26px; }
  .driver-name { font-size: 11px; }
  .driver-phone { display: none; }

  /* iOS Safari zoom prevention */
  .form-group input, .form-group select, .form-group textarea { font-size: 16px; }

  /* Modal: bottom-sheet style */
  .modal-box { border-radius: 16px 16px 0 0; position: fixed; bottom: 0; max-width: 100%; }
  .modal-overlay { align-items: flex-end; padding: 0; }

  /* Request cards, form grid, legend — all compact */
}
```

**Purpose:** Deep phone optimisation. Two-row compact header. Denser timeline (smaller row height, narrower columns). iOS Safari auto-zoom prevention (16px minimum input font size). Bottom-sheet modal pattern. All content compacted for 320–600px screens.

**Device behavior:**
- ≤600px: Compact phone UX with bottom-sheet modals
- ≥601px: This block doesn't apply

**P3 action: NO CHANGE.** This block is correct. After P3, phones (≤767px) still receive both BP-S5 and BP-S6 (the latter applying to the ≤600px subset). The 600px threshold is not related to the navigation breakpoint change.

**Critical warning:** The `font-size: 16px` on form inputs is a hard iOS Safari requirement — changing or removing this breakpoint would re-introduce auto-zoom on iPhones.

---

### BP-P1 — platform.css line 681 — NO CHANGE

```css
@media (max-width: 480px) {
  .login-card {
    padding: 28px 22px 22px;
    border-radius: 16px;
  }
  .login-quick-chips {
    grid-template-columns: 1fr;  /* single column on very small phones */
  }
}
```

**Purpose:** Reduces login card padding and forces single-column chip layout on very small phones (≤480px). The login-quick-chips rule targets `#loginQuickAccess` which is hidden via CSS in production — this rule is functionally dormant.

**P3 action: NO CHANGE.** Unrelated to the navigation threshold.

---

### BP-P2 — platform.css line 1174

```css
@media (max-width: 768px) {
  .header-notif-btn { display: none !important; }
}
```

**Purpose:** Hides the header notification bell on mobile and tablet. Added in Phase 1. Reasoning: the bottom nav "Notifikasi" tab covers notification access on mobile; a bell in the compact header would create redundancy and take up valuable space.

**Device behavior today:**
- ≤768px: Header bell hidden → bottom nav Notifikasi handles it
- ≥769px: Header bell visible

**Behavior after P3 change to `max-width: 767px`:**
- ≤767px: Header bell hidden → bottom nav handles it (phone)
- ≥768px: Header bell visible (iPad portrait now has the bell in header)

**Regression risk:** Low. At 768px, the bottom nav is hidden (per BP-S5 change). Without the bottom nav, the only notification access on an iPad portrait is the header bell. Showing the header bell at 768px is therefore necessary, not just convenient.

**If this change is missed:** iPad portrait (768px) would have neither the header bell NOR the bottom nav Notifikasi tab — zero notification access surface. This is the critical cascading dependency: BP-P2 and BP-S5 must be changed together.

---

### BP-P3 — platform.css line 1184

```css
@media (min-width: 769px) {
  #btnNotifications { display: none !important; }
}
```

**Purpose:** Retires the sidebar Notifikasi button on desktop. Added in Phase 1. The element is kept in DOM for the mobile bottom nav proxy click mechanism (`#bottomNavNotifications` calls `#btnNotifications.click()`), but it's visually hidden on desktop where the header bell is the canonical bell surface.

**Device behavior today:**
- ≤768px: Sidebar Notifikasi button NOT hidden by this rule. But it's inside `.sidebar-nav-desktop-only` group (BP-S1) so it's hidden by that rule on mobile. Net effect: hidden on mobile.
- ≥769px: Explicitly hidden by this rule. Header bell is the notification surface.

**Behavior after P3 change to `min-width: 768px`:**
- ≤767px: Not hidden by this rule. Sidebar group rule (BP-S1) keeps it hidden at ≤767px. Net effect: still hidden on phone.
- ≥768px: Hidden by this rule. Header bell is the notification surface (including iPad portrait).

**Regression risk:** None. The sidebar Notifikasi button is hidden at all viewports — only the mechanism changes. Below 768px: hidden by group rule. Above 767px: hidden by this explicit rule.

---

### BP-P4 — platform.css line 1201 — NO CHANGE

```css
@media (max-width: 600px) {
  .header-display-name { max-width: 80px; }
  .role-badge           { flex-shrink: 0; white-space: nowrap; }
}
```

**Purpose:** Phase 1 addition. Tightens the display name width on small screens so the user area doesn't overflow the header row. The `max-width: 80px` combined with `overflow: hidden; text-overflow: ellipsis` ensures the name truncates. Role badge is prevented from wrapping.

**P3 action: NO CHANGE.** This is a small-phone optimisation unrelated to the navigation threshold.

---

### BP-P5 — platform.css line 1241 — NO CHANGE

```css
@media (max-width: 600px) {
  .header-user-area {
    flex-shrink: 1;
    min-width: 0;
    gap: 5px;
  }
}
```

**Purpose:** Phase 1 mobile header overflow fix. Overrides `flex-shrink: 0` from style.css line 2567. Allows the user area (display name + role badge + bell) to compress within the flex row on narrow screens instead of overflowing the viewport.

**P3 action: NO CHANGE.** Applies to ≤600px only. Unrelated to the navigation threshold.

---

### BP-A1 — js/app.js line 343

```javascript
sidebar?.querySelectorAll('.sidebar-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth < 769) closeSidebar();
  });
});
```

**Purpose:** Auto-closes the sidebar drawer after a nav item is clicked on mobile. On desktop, clicking a nav item opens a modal but the sidebar stays visible. On mobile, the drawer should dismiss after the user makes a selection to reduce visual clutter.

**Device behavior today:**
- `window.innerWidth < 769` → true at ≤768px → sidebar closes after click
- `window.innerWidth ≥ 769` → false → sidebar stays open

**Behavior after P3 change to `window.innerWidth < 768`:**
- `window.innerWidth < 768` → true at ≤767px → sidebar closes (phone)
- `window.innerWidth ≥ 768` → false → sidebar stays open (iPad portrait, all larger)

**Regression risk:** Low. The only observable change is at exactly 768px: previously the sidebar would auto-close after a nav item click; after P3 it stays open. This is correct desktop behaviour — on iPad portrait the sidebar is a fixed column and should not dismiss.

**If this change is missed:** An iPad at 768px would auto-close the sidebar after clicking Requests, then immediately show the timeline without the sidebar. Since the sidebar is supposed to be persistent at ≥768px, it would reappear on next render. This would be a brief visual flash but recoverable — it's a nuisance bug, not data loss.

---

## 2. Device Behavior at Each Threshold

### At exactly 768px (iPad 9th gen portrait)

| | Current (pre-P3) | After P3 |
|---|---|---|
| Layout | Mobile: drawer + bottom nav | Desktop: fixed sidebar + no bottom nav |
| Sidebar | Off-canvas drawer, hidden by default | Fixed 240px column, always visible |
| Sidebar content | Only Admin Panel + Logout visible (desktop-only groups hidden) | Full sidebar: CTA, Requests, Profil, Admin Panel, Logout |
| Bottom nav | Visible (Dashboard, Antrian, Notifikasi, Profil) | Hidden |
| FAB | Visible (admin/bidang) | Hidden (sidebar CTA used) |
| Header hamburger | Visible | Hidden |
| Header module title | Hidden | Visible |
| Header bell | Hidden | Visible |
| Main area width | 768px (full width) | 528px (768 − 240px sidebar) |
| Date nav | Part of 2-row compact header (if ≤600px) OR inline at 601–768px | Inline pill in header |
| Modals | Centered (bottom-sheet only at ≤600px) | Centered |

### At exactly 767px (large phone in landscape — e.g., iPhone 14 Pro Max landscape)

| | Current (pre-P3) | After P3 |
|---|---|---|
| Layout | Desktop: fixed sidebar | Mobile: drawer + bottom nav |
| Sidebar | Fixed column | Off-canvas drawer |
| Bottom nav | Hidden | Visible |

**Post-P3, 767px is the new phone ceiling. This is correct.** iPhone 14 Pro Max landscape is 932px wide — well above 767px — so this is academic. Most large-phone landscape widths exceed 767px.

### At 601–767px (portrait tablets not at 768px, large phones landscape)

This range is unchanged by P3. Both before and after P3, this range receives the mobile layout (drawer + bottom nav). The 600px small-phone block does not apply.

### At ≤600px (all phones)

No change. BP-S6 remains at 600px. All compact phone adaptations, bottom-sheet modals, iOS Safari zoom prevention, and timeline density reductions are unchanged.

### At ≥769px (all current desktop)

No change. These devices were already receiving the desktop layout. After P3, 768px joins this group but 769px+ is unaffected.

---

## 3. Potential Regressions

### Critical (blocks at 768px if missed)

| Risk | Cause | Symptom if missed |
|---|---|---|
| **Zero notification access on iPad portrait** | BP-P2 and BP-S5 must both change. If BP-P2 is missed (bell stays hidden at 768px) but BP-S5 is changed (bottom nav hidden at 768px), iPad portrait has no bell and no bottom nav Notifikasi. | iPad users cannot open the notification center. |
| **Sidebar collapses after nav click on iPad** | BP-A1 not updated. `window.innerWidth < 769` stays true at 768px, so sidebar auto-closes after each click. | Sidebar disappears on iPad portrait after every nav interaction, reappearing on next render — visual flash. |

### Medium (bad experience but recoverable)

| Risk | Cause | Symptom if missed |
|---|---|---|
| **Full-width main area on iPad** | BP-S5 not changed — `.main-area { margin-left: 0 }` persists at 768px. Sidebar occupies 240px but main area also fills full width → sidebar overlaps content. | Sidebar covers 240px of the left edge of the timeline on iPad portrait. |
| **Desktop-only sidebar groups hidden on iPad** | BP-S1 not changed — groups stay hidden at 768px. iPad portrait sees sparse drawer (Admin Panel + Logout only) instead of full sidebar. | iPad portrait sidebar feels broken — no CTA, no Requests button. |
| **Header module title hidden on iPad** | BP-S4 not changed — `.header-module-title { display: block }` doesn't apply at 768px. Module title stays hidden. | Minor cosmetic — module context missing from iPad header. |

### Low (style detail)

| Risk | Cause | Symptom if missed |
|---|---|---|
| **FAB appears on iPad portrait** | BP-S3 not changed. FAB still visible at 768px alongside the sidebar CTA. | Duplicate action buttons. Admin/bidang on iPad portrait see both FAB and sidebar CTA. |
| **Header brand shows on iPad portrait** | BP-S4 not changed. `header-brand { display: none }` doesn't apply at 768px. Brand logo visible in header alongside sidebar logo. | Minor visual redundancy — PBSI logo in both sidebar and header on iPad. |
| **Profil appears in both sidebar and bottom nav on iPad** | BP-S2 and BP-S5 partially changed. Unlikely scenario requiring multiple missed changes. | Minor duplication. |

### Not a regression (acceptable changes)

- **Sidebar CTA replaces FAB for admin/bidang on iPad portrait**: Correct UX — desktop pattern applies.
- **Modal styling**: Modals remain centered at 768px (bottom-sheet is only at ≤600px). No change.
- **`body.sidebar-is-open { overflow: hidden }` no longer applies at 768px**: Never triggered at 768px because hamburger is hidden and sidebar can't be opened. No observable effect.
- **Timeline content width 528px at 768px**: Timeline already uses horizontal scroll. Same width as 769px today. Not new.

---

## 4. Required Code Changes

### style.css — 4 changes

```
Line 251:  @media (min-width: 769px)  →  @media (min-width: 768px)
Line 256:  @media (max-width: 768px)  →  @media (max-width: 767px)
Line 411:  @media (min-width: 769px)  →  @media (min-width: 768px)
Line 2486: @media (min-width: 769px)  →  @media (min-width: 768px)
Line 2511: @media (max-width: 768px)  →  @media (max-width: 767px)
```

Note: 5 lines change but only 4 distinct values (lines 251, 411, and 2486 all share `min-width: 769px`).

### platform.css — 2 changes

```
Line 1174: @media (max-width: 768px)  →  @media (max-width: 767px)
Line 1184: @media (min-width: 769px)  →  @media (min-width: 768px)
```

### js/app.js — 1 change

```
Line 343: if (window.innerWidth < 769)  →  if (window.innerWidth < 768)
```

**Total: 8 line changes across 3 files.**

---

## 5. Verification Checklist

### Pre-change baseline (document before touching anything)

- [ ] Screenshot iPad portrait (768px) at current state — confirm: hamburger visible, bottom nav visible, full-width timeline
- [ ] Screenshot desktop (≥769px) — confirm: sidebar, no bottom nav, module title visible
- [ ] Screenshot phone (≤600px) — confirm: 2-row header, bottom nav, FAB, bottom-sheet modals

### After change — iPad portrait 768px

- [ ] Sidebar is fixed 240px column, visible without tapping hamburger
- [ ] No hamburger button visible in header
- [ ] No bottom nav bar visible
- [ ] No FAB visible
- [ ] Module title "Jadwal Driver Operasional" visible in header
- [ ] Header notification bell visible
- [ ] Date nav appears as inline pill (not 2-row)
- [ ] Timeline is usable at 528px content width with horizontal scroll
- [ ] Sidebar contains: CTA, Requests/Pending, Profil, Admin Panel, Logout
- [ ] Clicking "Pending" in sidebar: modal opens AND sidebar stays visible (does not auto-close)
- [ ] Admin Panel accessible from sidebar (not just from Profile modal shortcut)
- [ ] Notification bell opens `#modalNotifications`
- [ ] Modals appear centered (not bottom-sheet)
- [ ] Login screen appears centered with gradient background

### After change — phone ≤767px

- [ ] Hamburger visible, sidebar as off-canvas drawer
- [ ] Bottom nav visible with correct tabs
- [ ] FAB visible for admin/bidang
- [ ] Tapping a sidebar nav item auto-closes the drawer
- [ ] 2-row compact header at ≤600px
- [ ] Bottom-sheet modals at ≤600px
- [ ] iOS Safari input fields use 16px (no auto-zoom)

### After change — phone 601–767px (large phones, landscape)

- [ ] Drawer + bottom nav — same as today for this range
- [ ] No 2-row header (only at ≤600px)
- [ ] Modals centered (not bottom-sheet)

### After change — desktop ≥769px

- [ ] No regression in existing desktop users
- [ ] Sidebar, module title, inline date nav, no bottom nav — unchanged

### Notification access (critical cross-breakpoint check)

- [ ] iPad portrait (768px): header bell visible ✓, bottom nav bell absent (correct)
- [ ] Phone (≤767px): header bell absent ✓, bottom nav bell visible (correct)
- [ ] Desktop (≥769px): header bell visible ✓, bottom nav absent (correct)

---

## 6. Recommended Migration Path

### Step 1: Preparation

Confirm the current value `769` appears in exactly these locations (run `grep -n "769\|768px"` in each file):

- `style.css`: lines 251, 256, 411, 2486, 2511
- `platform.css`: lines 1174, 1184
- `app.js`: line 343

Any instance not in this list is a discovery — audit before proceeding.

### Step 2: CSS changes (style.css and platform.css together)

Apply all CSS changes in a single edit session. The CSS changes are interdependent — applying BP-S4 without BP-P2 would result in the iPad portrait notification gap (critical regression listed above). Applying all CSS atomically prevents any intermediate broken state.

**Suggested order within the session:**
1. style.css lines 251, 256, 411 — sidebar and FAB rules (early in file)
2. style.css lines 2486, 2511 — main responsive blocks (end of file)
3. platform.css lines 1174, 1184 — platform overrides

### Step 3: JS change (app.js)

Apply BP-A1 in the same session or immediately after. This is one line. Missing it causes the drawer auto-close regression on iPad portrait (medium severity — bad UX but recoverable).

### Step 4: Verify all 4 breakpoints no longer contain 769 or 768px

```
grep -n "769\|768px" style.css platform.css js/app.js
```

Expected result: zero matches. Any remaining hit is a missed change.

### Step 5: Browser testing sequence

1. iPad Air (820px portrait) — already desktop today, should be unchanged
2. iPad (768px portrait) — the primary target of P3
3. iPhone 14 Pro Max (430px portrait) — should behave as before
4. Desktop (1280px) — should be identical to today

---

## 7. Why NOT Change the 600px and 480px Thresholds

### 600px threshold (BP-S6, BP-P4, BP-P5)

The 600px threshold governs **deep phone adaptations** — not navigation. Its responsibilities:
- 2-row compact header (required to avoid overflow on narrow phones)
- Denser timeline (44px rows, narrower hour columns)
- iOS Safari auto-zoom prevention (16px input font — **safety requirement**)
- Bottom-sheet modals (touch-friendly full-width sheet from screen bottom)
- Single-column form grid

None of these concern navigation surface selection. The V2 design spec does not define a 600px breakpoint for navigation. Changing it risks breaking iOS Safari zoom prevention and bottom-sheet modals on phones.

**The 600px threshold is about content density and form UX, not navigation. It must not change.**

### 480px threshold (BP-P1)

This only affects `.login-card` padding and the `#loginQuickAccess` chip grid (which is hidden in production via CSS). It has zero navigation impact and is unrelated to P3.

---

## 8. V2 Compatibility Confirmation

After P3, the breakpoint architecture aligns with V2 as follows:

| Viewport | P3 V1 Layout | V2 Layout (when operationsHub activates) | Change needed at V2 activation |
|---|---|---|---|
| ≤767px | Phone: drawer + bottom nav | Phone: drawer + bottom nav | None — boundary is identical |
| 768–1023px | Tablet: V1 sidebar (240px fixed) | Tablet: V2 compact two-pane | New CSS block for 768–1023px compact layout |
| ≥1024px | Desktop: V1 sidebar (240px fixed) | Desktop: V2 rail (64px) + section panel (218px) | New CSS for rail + panel (behind `operationsHub` flag) |

P3 establishes the **correct 767/768 phone/tablet boundary**. When `operationsHub` activates, a new CSS layer handles 768–1023px compact tablet layout and ≥1024px rail+panel layout. The P3 breakpoint values themselves do not need to change again.

---

*This document is the authoritative pre-implementation audit for the P3 breakpoint changes. All implementation must be validated against the verification checklist before merging. If any breakpoint instance not listed in this document is discovered during implementation, stop and audit before proceeding.*
