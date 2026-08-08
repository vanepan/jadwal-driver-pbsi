# Permission Foundation — v1.30.0

**Project:** Administration Platform, Phase 1
**Status:** Foundation shipped. Zero call sites migrated. Zero UI changes.

This is the deliverable requested by the Permission Foundation brief: an
ownership audit of the whole application, followed by a data-driven
Permission Service built strictly as a foundation layer on top of the
current role model — with every existing role check left untouched.

---

## 1. Architecture Report (pre-implementation audit, condensed)

The full application was audited for every role check, permission check,
navigation guard, drawer guard, feature-visibility gate, action-visibility
gate, admin-only/developer-only surface, keyboard shortcut, and context
menu. Findings:

### 1.1 Where role comes from

`functions/src/auth/verifyPin.js` validates username/PIN server-side, reads
`/users/{username}`, and mints a Firebase **custom token** with `{ role }` as
a developer claim. The client never sets its own role. `js/auth.js`
`_hydrateFromFirebaseUser()` reads the claim back via `getIdTokenResult()`
and caches it in `localStorage` (`getCurrentUser()` is the ubiquitous
synchronous accessor used everywhere else in the app). This phase does not
touch any of it.

### 1.2 Two pre-existing, partial permission systems

1. **`js/auth.js`** — a flat `PERMISSIONS` map (`view`, `create`, `edit`,
   `delete`, `start`, `complete`, `cancel`, `print_reimbursement`,
   `override_overtime`, `manage_users`, …) + `hasPermission()` /
   `isAdmin()` / `isBidang()` / `isViewer()` / `isDriver()`. Covers only
   Driver Operations.
2. **`js/config/role-registry.js`** — a newer, better-shaped `CAPABILITIES`
   map (`eng.view`, `eng.verify`, `sic.review.act`, …) + `can(capability,
   roleId)`, exposed through `auth.js`'s `canEng()`. Covers only Engineering
   + a forward-declared Sarpras Intelligence slice. Explicitly documented as
   *additive*, not a replacement for (1).

Nothing before this phase expressed Warehouse, Vehicle, Petty Cash,
Overtime, Analytics, Konfigurasi, or Executive access as data — those are
plain `if (isAdmin())` gates scattered across `app.js`,
`petty-cash-center.js`, `overtime-center.js`, `admin.js`, etc.

### 1.3 Module isolation (`canAccessModule`)

`js/app.js:1525` `canAccessModule(name)` is the single decision point for
which rail modules a role may see/mount: Home → every role; Engineering →
Engineering roles only; Driver Operations → bidang + driver; Petty
Cash/Overtime/Analytics/Konfigurasi/Gudang → admin-only; Sarpras
Intelligence → gated separately by `isV2Enabled()` (see 1.5), checked
*before* the admin bypass. 18 call sites across rail visibility, bottom-nav
filtering, deep-link guards, and the mount guard in `setRailModule()`.

### 1.4 Navigation, drawers, keyboard shortcuts, context menus

- **Nav/rail/sidebar**: `updatePermissionUI()` (`app.js:883`) is the single
  big function toggling every role-gated button/rail item/badge/panel.
  `js/workspace/workspace-registry.js`'s `ROLE_TO_WORKSPACE` map resolves
  Home's content per role (Executive/Request/Driver/Engineering workspaces).
- **Drawers/modals**: `js/modal.js` `canActOnAssignment()` /
  `canCancelAssignment()` combine role membership with **resource
  ownership** (`assignmentBelongsToDriver()`, `_isOwnBidangAssignment()`) —
  a second axis pure role checks can't express. Same pattern in
  `js/comments.js` `_canView()`/`_canComment()` and
  `js/notifications.js` `isVisibleToUser()`.
- **Keyboard shortcuts**: exactly one role-gated shortcut exists —
  `js/engineering/diagnostics/engineering-diagnostics.js`'s Ctrl+Shift+D
  diagnostics panel, gated `isDevelopment() || isAdmin()`.
- **Context menus**: exactly one — `js/timeline-interactions.js`'s
  assignment right-click menu, gated per-action via `hasPermission()`.

### 1.5 Two non-role axes that must not be silently absorbed

- **`isV2Enabled(user)`** (`js/config/feature-gates.js`) gates Sarpras
  Intelligence on role **and** a hardcoded username allowlist (`['evan']`).
  It is an identity override layered on top of role, not expressible as a
  plain role grant.
- **Resource ownership** — "this assignment belongs to this driver," "this
  request belongs to this bidang" — is orthogonal to role membership and
  hand-rolled per module today.

### 1.6 Flagged gaps (not fixed — out of scope for this phase)

- The **`'developer'` role** is referenced in ~20 RTDB/Storage security-rule
  clauses but is absent from `VALID_ROLES` (server), `ROLES`
  (`role-registry.js`), and `isValidRole()` (`users.js`) — no login path can
  produce it today. Touching Firebase rules/schema is explicitly out of
  scope for this phase.
- `js/validation.js`'s `VALID_ROLES` is stale (missing both Engineering
  roles) and appears to have no call site — left alone.

---

## 2. Permission Model

`js/config/permission-registry.js` is the single source of truth for **what
permissions exist**. It carries **zero role information** and never changes
when a role is added. Every permission is a fully machine-readable record:

```js
'warehouse.item.edit': {
  id: 'warehouse.item.edit',
  title: 'Edit Item',
  description: 'Allows editing warehouse inventory items.',
  module: 'Warehouse',
  category: 'Items',
},
```

**50 permissions** across every module the audit found real access control
for:

| Module | Permissions | Example ids |
|---|---|---|
| System | 2 | `system.admin`, `system.users.manage` |
| Driver Operations | 12 | `driver.schedule.view`, `driver.schedule.start`, `driver.reimbursement.print` |
| Warehouse | 6 | `warehouse.item.create/edit/delete`, `warehouse.goodsin.execute`, `warehouse.goodsout.execute` |
| Vehicle | 3 | `vehicle.view`, `vehicle.edit`, `vehicle.maintenance` |
| Petty Cash | 2 | `pettycash.view`, `pettycash.manage` |
| Overtime | 2 | `overtime.view`, `overtime.manage` |
| Analytics | 1 | `analytics.view` |
| Configuration | 1 | `konfigurasi.view` |
| Executive | 1 | `executive.dashboard.view` |
| Engineering | 18 | `eng.view` … `eng.reopen` (ids match `role-registry.js` `CAPABILITIES` verbatim) |
| Sarpras Intelligence | 2 | `sic.review.act`, `sic.approve.act` |

`module` + `category` on every entry double as the grouping keys for a
**Module → Feature → Permission** hierarchy:

```
Warehouse
  Items        → View*, Create, Edit, Delete
  Goods In     → Execute
  Goods Out    → Execute
```
*(`warehouse.view` is category "Overview", not "Items" — it's a
module-level view, not an item-level one.)*

`buildPermissionTree()` derives this tree automatically from the flat
registry — no separate configuration exists or is needed. A future Role
Management screen, Permission Simulator, or Audit page renders directly from
`listAllPermissions()` / `permissionsByModule()` / `buildPermissionTree()`
with no hardcoded label tables.

---

## 3. Role Model

`js/config/role-permissions.js` is the single source of truth for **which
roles own which permissions** — "Role ↓ permissions[], nothing else." It
depends on the registry (for permission ids) and on `role-registry.js` (for
role ids and the existing Engineering/Sarpras-Intelligence grants, reused
rather than duplicated). The registry never depends on it back.

| Role | Grant count | Notes |
|---|---|---|
| `admin` | 46 (28 base + 18 capability) | Every non-reserved permission except role-specific narrowings (`driver.schedule.view.own`, `driver.request.create`); capability grants exclude `eng.history`/`eng.continueTomorrow.ownOnly`, which the existing `CAPABILITIES` matrix reserves for Coordinator/Member |
| `bidang` | 6 (5 base + 1 capability) | Driver-ops requester actions + `sic.review.act` |
| `driver` | 5 | Own-schedule + start/complete + reimbursement |
| `viewer` | 1 | `driver.schedule.view` only |
| `engineering_coordinator` | 12 | Field coordination + verification, no create/edit/delete/analytics/settings |
| `engineering_member` | 9 | Field execution, own-only continue-tomorrow |
| `ketua_umum` / `waketum` / `sekjen` | 0 | Reserved (declared in `role-registry.js`, granted nothing yet — unchanged from before this phase) |

Adding a new role — including a future custom role — means adding one array
to `role-permissions.js` and nothing else. Adding a new permission means one
entry in `permission-registry.js`, then granting it to whichever roles here.
`validateRegistryIntegrity()` cross-checks that every granted id actually
exists in the catalog, guarding the split against drift.

---

## 4. Permission Service (`js/permission-service.js`)

The runtime surface future code asks instead of adding another
`role === '...'` branch:

```js
can(permission)          // boolean, current session
cannot(permission)       // inverse
hasAny([permissions])    // at least one
hasAll([permissions])    // every one
listPermissions()        // every permission id the current role holds
```

Deliberately narrow — it answers "can the current session do X" only. It
does not expose the metadata catalog or the tree; a future Role Management
UI reads `permission-registry.js` + `role-permissions.js` directly for that,
keeping "no UI inside the service" honest.

**Performance**: both registries are `Object.freeze`d literals loaded once
at module import (ES module singleton semantics — top-level code runs
exactly once). The service builds one `Set<permissionId>` per role on first
use and caches it in a `Map`; every subsequent lookup for that role is an
O(1) `Set.has()` against the cached instance (verified by reference-equality
in the check script, not just value equality).

---

## 5. Migration Strategy

This phase builds and proves the layer. It migrates **nothing**. Recommended
order for future phases, module by module:

1. **Engineering + Sarpras Intelligence** first — `canEng(cap)` call sites
   already speak the exact capability-id idiom (`eng.*`/`sic.*`); swapping
   to `permissionService.can(cap)` is closest to a mechanical replacement.
2. **Driver Operations** next — `hasPermission()` call sites map 1:1 to
   `driver.*` ids (see §2 table); ownership checks
   (`canActOnAssignment`/`canCancelAssignment`) stay as a second check
   layered on top of `can()`, since a pure role check can't express
   ownership.
3. **Boolean module gates** (`canAccessModule`, the admin-only `if
   (!isAdmin())` guards in `petty-cash-center.js`/`overtime-center.js`)
   — replace with `can('warehouse.view')`/`can('pettycash.view')`/etc.
4. **Identity-layer composition last** — `isV2Enabled()` stays a separate
   gate composed alongside `can('sic.review.act')`, not folded into the
   role-only registry, since it also depends on username.

Each step is its own small, isolated, backward-compatible diff, per the
brief's incremental-development mandate.

---

## 6. Files Changed

**Added:**
- `js/config/permission-registry.js` — permission catalog + metadata + `buildPermissionTree()`
- `js/config/role-permissions.js` — role → permission grants + `validateRegistryIntegrity()`
- `js/permission-service.js` — `can`/`cannot`/`hasAny`/`hasAll`/`listPermissions`
- `scripts/permission-service-check.mjs` — regression harness (56 assertions)
- `docs/PERMISSION_FOUNDATION_REPORT_v1.30.0.md` — this report

**Changed:**
- `js/config.js` — `APP_VERSION` 1.29.20 → 1.30.0, `RELEASE_NAME`, new `VERSION_HISTORY` entry
- `service-worker.js`, `version.json`, `index.html` — re-stamped by `scripts/sync-version.mjs` (cache-bust only)

**Untouched:** `js/app.js`, `js/auth.js`, `js/modal.js`,
`js/config/role-registry.js`, `js/config/feature-gates.js`, every business
module, Cloud Functions, RTDB/Storage rules.

---

## 7. Testing Summary

`node scripts/permission-service-check.mjs` — **56/56 passed**, covering:
permission lookup (role × permission grid against real current behavior),
unknown-permission deny-by-default, `hasAny`/`hasAll` composition including
empty-array edge cases, role-mapping correctness against hand-computed
expected sets, Set-reference caching, a 50,000-lookup performance sanity
loop (9ms), signed-out/unknown-role/null edge cases, `eng.*`/`sic.*` parity
against `role-registry.js`'s real `CAPABILITIES` (proves reuse, not
divergence), registry-integrity cross-checking, and hierarchy-tree
correctness.

`permission-service.js`'s `can()`/`hasAny()`/`hasAll()` themselves depend on
`getCurrentUser()` from `auth.js`, which is not Node-loadable (transitively
imports Firebase, same constraint documented in
`scripts/vehicle-asset-check.mjs`) — they're exercised via a local mirror of
the identical cache algorithm, parameterized by role instead of session, the
same pattern this repo's other check scripts already use for Firebase-backed
logic.

## 8. Regression Summary

No existing behavior changed. Every previously-existing role check,
permission map, capability registry, module gate, drawer guard, keyboard
shortcut, and context menu is byte-for-byte unchanged — `permission-service.js`
is not imported anywhere in the application yet. `node scripts/smoke-boot.mjs`
passes (app boot, login modal, push section, app-ready, splash removal all
green) with the three new unused files sitting in the tree.

## 9. Future Migration Plan

- Execute §5's four-step migration, one module per future phase.
- Add a `canOnResource(permission, resource, user)` extension for the
  ownership axis (§1.4), so `assignmentBelongsToDriver`-style checks can
  eventually compose with the Permission Service instead of living outside it.
- Resolve the `'developer'` role gap (§1.6): either retire it from RTDB/
  Storage rules or promote it to a real registry role.
- Unify `auth.js`'s `PERMISSIONS` map and `role-registry.js`'s `CAPABILITIES`
  map once Driver Operations migrates (§5 step 2) — today they're
  intentionally still two systems underneath the new registry.
- Build the Role Management UI / Permission Simulator / Audit pages the
  metadata layer (§2) was designed for — they read
  `permission-registry.js` + `role-permissions.js` directly, no new backend
  needed.
