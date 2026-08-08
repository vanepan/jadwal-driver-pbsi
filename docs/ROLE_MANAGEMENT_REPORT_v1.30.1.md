# Role Management (Read-Only) — v1.30.1

**Project:** Administration Platform, Phase 2
**Status:** Shipped. Read-only. Zero writes, zero Firebase changes, zero changes to the Permission Foundation.

This is the deliverable requested by the Role Management brief: proof that
the v1.30.0 Permission Foundation can automatically generate a real
Administration UI, plus the investigation that shaped how it was wired into
the existing app.

---

## 1. Architecture Report

### 1.1 Where this module lives

Every module built since v1.14.0 (Petty Cash, Overtime, Engineering, Gudang,
Sarpras Intelligence) is a **standalone rail module**: its own
`MODULE_DEFS` entry, its own `#v2*Workspace` host div appended to
`.main-content`, its own rail icon, mounted lazily via `mount*(container)`
on first navigation. Folding a new admin surface into `js/admin.js` /
Konfigurasi instead means growing an already-large legacy `if/else` chain
over `activeAdminSection` inside one shared workspace — the older,
non-idiomatic path (`js/app.js`'s `ADMIN_MODULE_SECTIONS` / `renderV2AdminWorkspace()`).

Role Management follows the newer, standalone pattern, mirroring
`js/petty-cash/petty-cash-center.js` almost exactly:
- Own rail item `#v2RailRoleManagement`, inserted after Sarpras Intelligence
  and before Konfigurasi (Konfigurasi is hierarchy-locked "always last,"
  `js/app.js`'s own comment at the Konfigurasi rail block confirms this).
- Own host `#v2RoleManagementWorkspace`, injected at boot by
  `initV2RoleManagementWorkspace()`.
- Own `MODULE_DEFS.roleManagement` entry with a single `land()` screen — no
  panel-nav sub-menu, since the whole feature is one screen.
- Statically imported at the top of `js/app.js` (not lazy via
  `js/config/module-loader-registry.js`) — matching Petty Cash/Overtime's
  precedent: small, routine admin surfaces are static imports; only
  genuinely heavy dashboards and the single-pilot-gated Sarpras Intelligence
  go through the lazy-load registry.
- Gated by the existing `canAccessModule()`/`isAdmin()` admin-only rule,
  identical to Petty Cash/Overtime/Analytics/Konfigurasi/Gudang. **Not**
  migrated to the new Permission Service — this phase's own brief lists
  Permission Service under "DO NOT MODIFY," and Phase 1's migration
  strategy defers gate migration to a dedicated future phase anyway.

### 1.2 Why no overlay, no Firebase pause-on-hide

The "full-screen overlay" module shape was retired in v1.14.0 — current
modules are plain `.v2-workspace` panels toggled `display:block/none` by
`setWorkspace()`. Role Management follows this, with one simplification
versus Petty Cash/Overtime/Engineering/Gudang: those four pause a live
Firebase listener via a `close*()` call when hidden
(`js/app.js`'s `setWorkspace()`, e.g. `if (!isPc && pettyCashMounted) closePettyCashCenter();`).
Role Management holds **no Firebase subscription** — it's pure local UI
state (selected role, search text, module filter, group-expand state) over
data that's already fully loaded and frozen at import time — so its
`setWorkspace()` entry is a plain display toggle with no pause/resume call.

### 1.3 First real consumer of the Permission Foundation

The page's content — not its access gate — is what proves Phase 1's
architecture: selecting an arbitrary role and asking "what does this role
have" is inherently session-independent (you're inspecting someone else's
grants, not "am I allowed"), so it correctly reads
`role-permissions.js`/`permission-registry.js` **directly**, never through
the session-scoped `permission-service.js` — exactly the design Phase 1's
own report anticipated for a future Role Management UI.

---

## 2. Rendering Strategy

Nothing in the new code hardcodes a permission label, module name, category
name, or description. The entire tree is derived from
`permission-registry.js`'s own metadata via `buildPermissionTree()` (Phase
1), and rendered by walking that structure:

```
Module (e.g. "Warehouse")
  Feature / category (e.g. "Items")
    Permission rows (title + description + disabled checkbox)
```

`role-management-logic.js`'s `filterTree()` derives a smaller view of the
**same cached tree** for search/module-filter state — it never regenerates
or mutates the source tree. Role switching only changes which permission
ids are in the "granted" `Set`; the tree structure itself never changes.
Selecting `viewer` shows the exact same 50-permission tree as `admin` — just
with 49 boxes unchecked instead of 4.

Role list metadata (`ROLES`, `roleLabel()`) is likewise read directly from
`role-registry.js` — including the 3 reserved executive roles
(`ketua_umum`, `waketum`, `sekjen`), rendered honestly holding 0 permissions
today rather than merged into an invented single "Executive" role the
registry doesn't actually have.

---

## 3. Reuse Report

Nearly everything on the page is an existing component, reused verbatim:

| UI element | Reused from | New code needed |
|---|---|---|
| Search box | `.v2-admin-search` (Audit/Drivers/Vehicles/Users) | None — same class, same plain `input` event, no debounce (house-wide convention) |
| Module filter | `.v2-admin-filter` `<select>` (Audit's category filter) | None — plain `<select>`, not `pbsi-select.js` (that's a 6-item allowlist for identity selects, not a house-wide convention) |
| Toolbar layout | `.v2-admin-toolbar` | None |
| Summary stats | `.v2-dq-stats` / `.v2-dq-stat-card` (Data Quality Center's 4-card grid) | None — exact 4-card shape match for Total/Granted/Denied/Modules |
| Module disclosure group | `.user-role-group` / `-header` / `-body` / `-count-badge` (Admin Users tab's group-by-role pattern) | None — structurally identical to grouping permissions by module |
| Read-only badge | `pill()` from `js/widgets/_widget-base.js` (`wsp-pill--neutral`) | None — the actually-used neutral-badge convention (`.v2-panel-nav-badge-soon` was checked and confirmed dead CSS, zero call sites) |
| Disabled checkboxes | Global `input:disabled { opacity:.55 }` + Gudang's Edit Item immutable-radio precedent ("render the real control, inert") | None — real `<input disabled>`, not a bespoke read-only widget |
| Two-pane layout, category sub-heading, permission row | — | `.rm-layout`, `.rm-sidebar__title`, `.rm-role-item`, `.rm-header`, `.rm-category`, `.rm-permission-row` (~100 lines in `platform.css`) |

The only genuinely new visual surface is the role-list sidebar and the
permission-row layout itself — everything else (search, filter, stats,
grouping, badges, disabled state) is the app's existing design language,
unmodified.

---

## 4. Performance Report

The brief's requirement — "Permission Tree should be generated once. Reuse
cached structures. No repeated tree generation" — is structural, not just
followed by convention:

```js
// role-management-logic.js, module scope — runs exactly once, at import
// time, because ES module top-level code is a singleton.
const PERMISSION_TREE = buildPermissionTree();
export function getPermissionTree() { return PERMISSION_TREE; }
```

`filterTree()` only ever reads from this cached object; it never calls
`buildPermissionTree()` again. Verified in `scripts/role-management-check.mjs`
by reference-equality: `getPermissionTree()` called twice returns the
identical object.

Bulk-operation timing (5,000 `filterTree()` calls with search + module
filter both active): **125ms** — see §6.

---

## 5. Testing Summary

Two scripts, matching this repo's house convention (no unit-test framework;
pure logic gets a Node check, DOM/rendering gets a Puppeteer check against a
dedicated harness page):

**`node scripts/role-management-check.mjs` — 38/38 passed.** Covers: tree
built once (reference equality), search matching across
id/title/description/module/category (case-insensitive, empty-query,
whitespace-only), module filter (including compose-with-search and
matching-nothing producing no hollow groups), summary counts (admin's full
46-of-50, viewer's 1-of-50, filtered-view totals), every one of the 9 real
roles producing an internally-consistent summary, an unknown role id
degrading to an empty grant set instead of throwing, bulk-operation
performance, and a registry-count regression check (50 permissions, 11
modules, 9 roles — Phase 1's known values).

**`node scripts/role-management-dom-check.mjs` — 12/12 passed**, against a
new `scripts/role-management-harness.html` (style.css + platform.css, no
app.js boot — mirrors `vehicle-asset-harness.html`). A fake admin session is
seeded into `localStorage` before mount (`auth.js`'s `getCurrentUser()` /
`isAdmin()` read it synchronously — no real Firebase auth needed). Asserts
against the **real rendered DOM**: all 9 roles present in the role list;
switching from admin to viewer changes the checked-count from 46 to 1 (real
interaction, not just data); every checkbox carries `disabled`; searching
"warehouse" and filtering by the Warehouse module both narrow to exactly 6
rows; the summary cards reflect the filtered view; the module-group
disclosure toggles open/closed; zero fatal console errors (the same
fatal-vs-informational classification `smoke-boot.mjs` uses — Firebase
permission-denied noise on an unauthenticated/no-real-session load is
expected, not fatal). Light and dark screenshots captured to `scratch/`;
visually confirmed clean in both themes (a dark-mode color reading that
looked off at first glance was checked against actual computed styles —
`getComputedStyle` confirmed the reused components correctly resolve
`--surface-2`/`--text` dark tokens; it was a lighter elevation layer against
an even-darker page background, not a bug).

`node scripts/smoke-boot.mjs` (existing, unmodified) — still passes: login
modal, push section, app-ready, splash removal all green, zero fatal errors,
confirming the new rail item / boot injector / wiring didn't disturb normal
app boot for a signed-out session.

---

## 6. Regression Summary

No existing behavior changed. `js/config/permission-registry.js`,
`js/config/role-permissions.js`, `js/permission-service.js`, and
`js/config/role-registry.js` are byte-for-byte untouched — verified by the
check script's direct regression assertions (50 permissions, 11 modules, 9
roles, unchanged). Every existing module's rail item, boot sequence, and
`setWorkspace()` toggle block is unmodified apart from the additive lines
this phase inserted alongside them. No Firebase call, no RTDB write, no
authentication change anywhere in the new code.

---

## 7. Future Editing Strategy

This phase is explicitly read-only. A future write-enabled phase would need:

- A new, narrow permission for the *capability to edit role grants itself*
  (e.g. `system.roles.manage`), added to `permission-registry.js` and
  granted only to `admin` in `role-permissions.js` — the same registry this
  page already renders, extended by one entry, not redesigned.
- A Firebase-backed override layer for role-permission grants (today's
  `ROLE_PERMISSIONS` is a frozen, code-defined constant — persisted,
  writable grants would need an RTDB path plus a merge strategy with the
  code-defined baseline, most likely `/role_grants/{roleId}` with the same
  seed-then-subscribe shape every other `*-store.js` in this codebase uses).
- An audit-log entry per change (`logAction()`, already used by every other
  write path in this app — Users, Requests, Engineering, Petty Cash).
- Re-enabling the checkboxes (`disabled` removed) only when the acting user
  holds the new manage permission, with an explicit save/cancel flow rather
  than checkbox-onChange-writes-immediately, given how consequential a
  wrong grant could be.
- A decision on whether `ketua_umum`/`waketum`/`sekjen` (currently reserved,
  zero permissions) become grantable through this same UI or need a
  separate "activate a reserved role" step first.

None of this is built now — this phase only proves the read side works.
