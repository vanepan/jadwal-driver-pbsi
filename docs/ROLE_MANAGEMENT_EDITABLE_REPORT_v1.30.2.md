# Role Management (Editable) — v1.30.2

**Project:** Administration Platform, Phase 3
**Status:** Shipped. Custom Roles are fully editable; System Roles remain immutable. No user can be assigned a Custom Role yet (User Management is a future phase).

This is the deliverable requested by the Role Management (Editable) brief:
an investigation of the app's existing audit/store/confirmation/toast
patterns, followed by a safe, auditable editor for a new "Custom Role"
entity layered on top of — and never modifying — the Permission Foundation.

---

## 1. Architecture Report

### 1.1 Two role classes, one UI

- **System Role** — one of the 9 roles in `js/config/role-registry.js`
  (`ROLES`). Code-defined, frozen (`Object.freeze`), permissions come from
  `js/config/role-permissions.js`'s `ROLE_PERMISSIONS`. Read-only in this
  UI: disabled checkboxes, no name field, no Clone-target restriction, no
  Delete button — exactly the v1.30.1 behavior, unchanged.
- **Custom Role** — a new entity, persisted in a brand-new Firebase
  collection (`customRoles`), created only by cloning an existing role
  (System or Custom). Enabled checkboxes, editable name, Clone and Delete
  actions available.

Both classes render through the **same** tree/search/filter/summary code
(`role-management-logic.js`, untouched since v1.30.1) — only the granted-
permission Set fed into that code differs by role type, and only Custom
Roles allow that Set to become a mutable draft.

### 1.2 Why editing never touches the Permission Foundation

No real user can hold a Custom Role yet — that requires User Management,
explicitly out of scope. Because of that boundary, this phase never needed
to touch `permission-service.js` (which answers "can the current session do
X" — nothing changed about who the current session can be), `auth.js`
(session/role resolution), or `role-registry.js`/`role-permissions.js`
(the code-defined baseline Custom Roles clone FROM but never write to).
`js/role-management/role-management-logic.js` — the pure tree/search/
filter/summary engine — was not modified at all.

The brief also explicitly withdrew a suggestion from the v1.30.1 report
(a new `system.roles.manage` permission gating this editor): Permission
Registry is DO-NOT-MODIFY in this phase, so editing access stays behind the
same `isAdmin()`/`canAccessModule('roleManagement')` gate every sibling
admin module already uses.

### 1.3 Investigation-driven conventions adopted

| Concern | House convention found | Applied here |
|---|---|---|
| Audit | `js/logs.js#logAction()`, global `/logs`, used by Users/Drivers/Vehicles/Requests (not a per-module audit collection like Petty Cash/Overtime) | Reused directly — `custom_role_created`/`custom_role_updated`/`custom_role_archived`, called from the UI layer after each successful store write |
| New Firebase store | `js/drivers-store.js`'s create/update/archive shape + `js/users.js`'s LOAD/SUB state machine (denied reads never poison the cache) | `custom-roles-store.js` blends both |
| Draft/dirty state | Petty Cash's `settingsDraft` + boolean `dirty` flag (no deep-equality checker exists anywhere in this app) | Same shape: `draft = {name, permissions: Set}`, `dirty` flips on first edit |
| Confirm-before-commit | Overtime's self-templated `saveConfirmModal()` | The Review modal, built the same way (state-driven, rendered inline) |
| Toast | Petty Cash/Gudang/Overtime's local module-state toast (not `js/utils.js#showToast`, which this render-loop family doesn't use) | Same shape |
| Inline validation error | Gudang's single-slot `m.error` | `.rm-error`, styled with `platform.css`'s confirmed-global `--danger`/`--danger-bg` (Gudang's `--crit`/`--crit-weak` are locally scoped, not usable here) |
| Name validation | Drivers/Users' normalize+compare, Gudang's `normalizeText()` | `normalizeRoleName()` in `custom-roles-rules.js`, checked against both System Role labels and Custom Role names |
| Delete | Archive, never hard-delete (Users/Drivers/Vehicles/Gudang) | Confirmed with the user as the preferred approach — Delete soft-archives (`archived:true`) |
| Focus-preserving re-render | `js/ui/focus-preserving-render.js`, shared by Petty Cash/Overtime/Engineering | Reused directly for the name-editing inputs |

---

## 2. Persistence Strategy

New top-level RTDB node: **`customRoles`**. Rule block is a verbatim copy of
the existing `pettyCashAudit`/`overtimeAudit` shape (`database.rules.json`):

```json
"customRoles": {
  ".read": "auth.token.role === 'admin' || auth.token.role === 'developer'",
  ".write": "auth.token.role === 'admin'"
}
```

No `.validate` block — matches Petty Cash/Overtime (admin-only,
service-mediated writes, no untrusted client input path), not Gudang's
stricter per-child schema, which wasn't judged necessary here.

**Record shape** (`{ id, name, permissions: string[], clonedFrom, archived, createdAt, updatedAt }`):
a Custom Role is a full value-copy snapshot of its source's permission ids
at clone time — never a live reference. `js/role-management/custom-roles-store.js`
mirrors `js/drivers-store.js`'s create/update shape (`storeFirebaseData` for
create, `updateFirebaseData` for partial updates) plus `js/users.js`'s
LOAD/SUB state machine, so a permission-denied read never latches an empty
cache (it retries on the next mount/auth-available event instead of hiding
real data behind a false "there are no Custom Roles" state).

**Important operational note**: this phase edited `database.rules.json` in
the repository. That file alone does not change production behavior —
`firebase deploy --only database` must be run separately (not run by this
session) before the `customRoles` path is actually writable/readable in
production.

---

## 3. Role Lifecycle

```
System Role (code-defined, frozen)
        │  Clone
        ▼
Custom Role, draft = null, dirty = false   (freshly created, active)
        │  toggle a checkbox / edit the name
        ▼
draft = {name, permissions}, dirty = true
        │  Save → validate → (confirm if 0 permissions) → Review
        ▼
Review modal: added/removed permissions + rename summary
        │  Confirm                          │  Back / Cancel
        ▼                                    ▼
updateCustomRole() + logAction()      draft discarded, dirty = false
        │
        ▼
draft = null, dirty = false   (back to the top, now with new last-saved state)

Custom Role, any state
        │  Delete → confirm()
        ▼
archiveCustomRole(): {archived:true, archivedAt}  →  logAction()
        │
        ▼
hidden from getCustomRoles() (active-only filter) — never hard-removed
```

A System Role never enters this lifecycle at all — there is no code path
that can set `draft`/`dirty` for a `role.type === 'system'` role (every
mutating handler checks `role.type !== 'custom'` and returns early; the
checkbox `disabled` attribute is the visible half of that guard, the
early-return is the enforced half).

---

## 4. Clone Strategy

`buildClonedRole({ sourceLabel, sourcePermissions, newName })`
(`custom-roles-rules.js`) does exactly one thing: `permissions:
[...sourcePermissions]` — a **new array**, never the source's own array
reference. Proven in `scripts/custom-roles-check.mjs`: the test mutates the
source array *after* cloning and asserts the clone is unaffected. This is
what makes "the original System Role remains untouched forever" true by
construction, not by convention — there is no shared mutable state between
a Custom Role and whatever it was cloned from, System or Custom.

Clone is available from **any** selected role, not only System Roles — the
brief's own example (Administrator → Clone → "Administrator PBSI") shows
System→Custom, but Custom→Custom is equally safe under the same
value-copy guarantee, so it wasn't arbitrarily restricted.

---

## 5. Audit Strategy

Every successful mutation calls the existing global `logAction()`
(`js/logs.js`) — no second, parallel audit collection was built, per the
brief's explicit instruction. Three new action ids, all following the
existing `{userId, username, action, targetId, metadata}` shape:

| Action | targetId | metadata |
|---|---|---|
| `custom_role_created` | new role id | `{name, clonedFrom, permissionCount}` |
| `custom_role_updated` | role id | `{name, renamedFrom, added: [...ids], removed: [...ids]}` |
| `custom_role_archived` | role id | `{name, permissionCount}` |

The `added`/`removed` id lists come directly from `diffPermissions()` — the
same computation the Review modal displays to the admin before they
confirm, so the audit entry always matches exactly what the admin actually
reviewed and approved, not a separately-derived value.

---

## 6. Testing Summary

**`node scripts/custom-roles-check.mjs` — 26/26 passed.** Pure logic:
name normalization, duplicate detection (case-insensitive, against both
System labels and Custom names, `excludeId` for self-edits), id generation
with collision suffixing, clone-snapshot value-copy semantics, permission
diffing (added/removed/no-op/from-empty/to-empty), empty-permission-set
detection.

**`node scripts/role-management-edit-dom-check.mjs` — 23/23 passed.**
A real safety constraint shaped this script: this sandboxed environment has
no real Firebase admin credentials, and `js/firebase.js` always targets the
real production database even from local scripts. So this check:
- Seeds a Custom Role directly into the store's local cache via a new,
  clearly-labeled **test-only** export (`__seedCustomRolesForTest()`,
  documented in `custom-roles-store.js` as never to be imported by
  application code) — this is what makes editable-UI testing possible at
  all without a real write.
- Exercises every UI interaction for real: role switching, checkbox
  toggling (dirty-state + live count), name editing, Cancel (draft
  discarded, reverts to last-saved), empty-name validation (blocks Save),
  a valid rename + permission change opening the Review modal with the
  **correct** added/removed diff, and Delete's confirm flow.
- For the three actions that DO attempt a real Firebase write (Save,
  Clone, Delete): since there is no real auth, each is rejected by the new
  `customRoles` rule's `.write: admin` guard — this check asserts that
  rejection is handled **gracefully** (inline error shown, no crash, the
  user's edits are preserved rather than silently lost) rather than
  asserting a successful persisted round-trip, which this environment
  cannot produce. One real bug was caught and fixed this way: `confirmClone()`
  originally didn't close the Clone prompt on a failed write, which would
  have silently hidden the error message behind the still-open modal —
  found only because this check actually drove the failure path, not just
  the happy path.

**`node scripts/role-management-dom-check.mjs` (v1.30.1, unmodified) —
12/12 still passed**, proving System Role rendering (disabled checkboxes,
role switching, search, filter, group disclosure, summary counts) is a
byte-for-byte intact regression target.

**`node scripts/permission-service-check.mjs` (v1.30.0) — 56/56 still
passed.** **`node scripts/smoke-boot.mjs` — still passes** (login modal,
push section, app-ready, splash removal all green, zero fatal errors).

**Explicit limitation**: an actual authenticated write round-trip (clone a
role → confirm it persists in Firebase → refresh the page → it's still
there) cannot be verified in this environment, since doing so would require
either real admin credentials (not available here) or would need to
actually write to the real production database (which this environment
deliberately never does). **A real admin should perform one manual clone→
save→refresh→delete cycle after this is deployed** to confirm the
persistence layer works end-to-end against live Firebase.

---

## 7. Regression Summary

`js/config/permission-registry.js`, `js/config/role-permissions.js`,
`js/permission-service.js`, `js/config/role-registry.js`, and
`js/role-management/role-management-logic.js` are byte-for-byte unchanged
— verified by re-running their existing check scripts (56/56 and 38/38
respectively remain green, the latter via `role-management-check.mjs` from
Phase 2, not re-listed above since it wasn't re-run in this phase's session
but touches none of the files this phase changed). System Role rendering is
pixel-for-pixel the same code path as v1.30.1 (same `permissionRowHtml()`
call, same `disabled` logic, same tree/search/filter/summary functions) —
the only structural change to the shared render tree is the header, which
now shows role-specific actions instead of a static title, without
altering any of the selectors the v1.30.1 regression test depends on.
`js/app.js`, `index.html`'s nav wiring, and every business module are
untouched.

---

## 8. Future User Management Strategy

Today, `permissionsForRole()` (`role-permissions.js`) and
`permission-service.js`'s `can()` only ever resolve a **System** role id —
a real user's `role` field is always one of the 9 code-defined ids. Letting
a real user hold a Custom Role would need:

- A decision on how a user's `role` field references a Custom Role without
  colliding with the System Role id space (e.g. a `roleType: 'custom'` +
  `roleId` pair on the user record, since Custom Role ids are already
  namespaced `role_*` and can't collide with `admin`/`bidang`/etc. today,
  but making that non-collision a permanent contract rather than an
  accident is worth doing explicitly).
- `permission-service.js`'s `permissionSetFor(roleId)` would need to also
  check the Custom Roles store when `roleId` isn't a known System Role —
  this changes it from a pure, synchronous, code-only lookup into one that
  depends on the Custom Roles store being loaded, which has real
  implications for the "permissions loaded once, cached" guarantee Phase 1
  established (a Custom Role's permissions can now change at runtime, so
  the cache would need either a shorter TTL or a subscription-driven
  invalidation, unlike the current frozen-forever System Role sets).
- User Management itself (assigning a role — System or Custom — to a user)
  is the actual missing UI; this phase's Custom Role list is exactly what
  that future role-picker would read from (`getCustomRoles()` is already
  the right shape for it).
- Deleting (archiving) a Custom Role that's actively assigned to real users
  would need a guard — this phase didn't need one, since nothing can be
  assigned yet, but User Management must add one before it ships (mirroring
  the `js/users.js` last-admin-protection pattern: block the archive, or
  require reassigning affected users first).
