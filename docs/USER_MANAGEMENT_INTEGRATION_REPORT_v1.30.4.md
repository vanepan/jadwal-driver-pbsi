# User Management Integration — v1.30.4

**Project:** Administration Platform, Phase 5
**Status:** Shipped. User Management is wired into the Role Domain built in
v1.30.0-3 (Role Summary, Role Usage Provider, archived/broken-reference
detection, role-aware metadata throughout the existing UI). Custom Role
**assignability** is deliberately deferred — see §9.

---

## 1. Investigation Report

Before writing any code, the existing surfaces were read directly:

| Concern | What actually exists |
|---|---|
| User CRUD | `js/users.js` (data layer) + `js/admin.js` (shared create/edit modal, consumed by both the legacy list and the primary V2 Administration Workspace in `js/app.js`). Full CRUD already existed — create/update/archive/restore/delete, last-active-admin guard. |
| Role assignment on the user record | A single string field (`users/{username}.role`), validated against a hardcoded 6-value vocabulary in `js/users.js#isValidRole()` (4 core roles + 2 Engineering roles) and, independently, `functions/src/auth/verifyPin.js`'s `VALID_ROLES` at login-token-mint time. Zero knowledge of Custom Roles existed in either. |
| Role Domain | `js/role-management/` (v1.30.0-3): Permission Registry/Service, Role Registry (9 System Roles), Custom Role store (`customRoles` RTDB node), Role Summary/Relationships/Status/Archive-Guard/Usage-Provider. All shipped as **unconsumed infrastructure** — `docs/ROLE_ASSIGNMENT_DEPENDENCY_REPORT_v1.30.3.md` §9 explicitly handed off "register a real usage provider" and "teach the role picker about Custom Roles" to this phase. |
| **Runtime permission enforcement** | A **third, separate system**, not investigated by prior phases because nothing had tried to consume the Role Domain yet: `functions/src/auth/verifyPin.js` mints the login role claim from its own hardcoded `VALID_ROLES`; `js/app.js#canAccessModule()` gates every module with hand-written `role === 'literal'` checks; every `database.rules.json` rule checks `auth.token.role` directly. None of the three call `permission-service.js` or know a Custom Role can exist. |
| Search/filter infra | The V2 Administration Workspace's `.v2-admin-toolbar`/`.v2-admin-search`/`.v2-admin-filter` pattern (already the house convention, reused by Role Management's own search) — reused, not rebuilt. |
| Legacy stale role list | `js/validation.js#VALID_ROLES` (4 strings, missing Engineering) is dead code — grepped: no importer of `ValidationRegistry`/`validate()` besides an unrelated `validateOdometer` import in `modal.js`. Left untouched. |

**The central finding:** the Role Domain's own permission model was never wired to anything that actually gates access. Assigning a Custom Role to a real user, at this point in the project, would make the admin UI display accurate permission metadata for that user while their actual login/navigation access silently stayed capped to legacy behavior — a live UI/reality mismatch, not a cosmetic gap.

## 2. Integration Strategy

Confirmed with the user before implementation: **the platform must never
present permissions it does not enforce.** Two options were on the table —
ship full Custom Role assignability now with the mismatch documented, or
integrate everything except assignability. The user chose the latter,
explicitly: *"I don't want an Administration UI that appears to grant
permissions while the runtime still ignores them... Accuracy is more
important than feature completeness."*

This phase therefore integrates User Management with the Role Domain on
every axis except the write path:

- Role Usage Provider — real, wired, consumed by Role Management's own archive guard/summary.
- Role Summary — reused (never recomputed) in the user create/edit modal.
- Archived/broken role-reference detection — surfaced as a badge/warning, never silently swapped.
- Role-aware metadata (labels, search) throughout the existing V2 user list and card UI.
- Role picker — **lists** Custom Roles, **does not allow selecting them** (see §3).

## 3. Role Assignment Strategy

The role `<select>` in the shared create/edit modal (`index.html#userFieldRole`, populated at runtime by `js/admin.js#refreshCustomRoleOptions()`) keeps its 5 existing static options (System Roles + the Engineering sentinel) exactly as before — zero regression. Active Custom Roles are appended as a disabled `<optgroup label="Custom Role (Belum Aktif)">`, built from `role-catalog.js#getAllRoles()`, so an admin can see what Custom Roles exist without being able to assign one. A static hint (`#userRoleCustomHint`) explains why.

`js/users.js#isValidRole()` is **unchanged** — it already only accepts the 6 legacy role strings, which is now the intended boundary rather than a gap to close.

**Archived Roles** are never assignable (System Roles have no archive path at all; Custom Roles are excluded from `getAllRoles()`'s active list the moment they're archived, so they never appear as an option going forward). **If a user's already-stored role can't be represented by the picker** (an archived Custom Role or a broken reference — reachable only via manual data today, since no code path in this app has ever let a real user hold a Custom Role) the modal shows an explicit warning naming the current role and reason, rather than silently swapping in whatever option the `<select>` falls back to. The same signal drives a "Role Diarsipkan"/"Role Tidak Dikenal" badge on the user card.

## 4. Effective Permission Flow

Unchanged this phase, by design. `js/permission-service.js#can()/cannot()/hasAny()/hasAll()/listPermissions()` remain the Role Domain's only permission-check surface, still not consumed by any business module's gating (that migration is explicitly out of scope — see §9). User Management does not introduce a parallel permission API, per the brief's explicit instruction.

## 5. Files Changed

**Added**
- `js/role-management/role-catalog.js` — `getAllRoles()`/`resolveGrantedSet()` (extracted from `role-management-center.js`, zero logic change) + new `resolveRoleInfo(roleId)`.
- `docs/USER_MANAGEMENT_INTEGRATION_REPORT_v1.30.4.md` (this file).

**Changed**
- `js/role-management/role-management-center.js` — imports `getAllRoles`/`resolveGrantedSet` from the new file instead of defining them locally. No behavior change.
- `js/users.js` — new export `getRoleUsageFromUsers(roleId)`. `isValidRole()`/`createUser()`/`updateUser()` untouched.
- `js/app.js` — `navManajemenUser()` registers the usage provider + initializes the Custom Roles store once, on first visit (mirrors `navRoleManagement()`'s lazy-mount-once pattern); `buildUserCard()` and `renderV2AdminUsers()`'s search predicate resolve through `resolveRoleInfo()`.
- `js/admin.js` — `openUserFormModal()` calls the new `refreshCustomRoleOptions()`, `renderCurrentRoleWarning()`, `renderUserRoleSummaryPanel()`; `initAdminUI()`'s existing role-select/Engineering-checkbox listeners also refresh the summary panel.
- `index.html` — `#userFieldRole`'s surrounding markup (hint, warning, Role Summary panel container); CSS/JS cache-bust query strings bumped.
- `style.css` — `.form-hint`/`.form-hint--warning` (new, generic, additive).
- `platform.css` — `.v2-entity-badge--role-warning` (new, additive).
- `js/config.js` — this entry.

**Explicitly zero changes**
`js/config/permission-registry.js`, `js/config/role-permissions.js`, `js/config/role-registry.js`, `js/permission-service.js`, `js/role-management/role-summary-model.js`, `role-relationships.js`, `role-status.js`, `role-archive-guard.js`, `role-usage-provider.js`, `functions/src/auth/verifyPin.js`, `js/app.js#canAccessModule()`, `database.rules.json`, `js/validation.js` (confirmed dead code), any business module (Warehouse/Vehicle/Engineering/Driver).

## 6. Testing Summary

- Manual click-through (`/run`): Konfigurasi → Manajemen User — confirmed the 5 System Role options behave identically to before; confirmed Custom Roles (created via Role Management) appear disabled with the hint visible; confirmed the Role Summary panel updates correctly across System Roles and the Engineering Koordinator/Anggota segment.
- Role Management → selected a System Role with existing users assigned → confirmed "Assigned Users" reflects a real non-zero count for the first time (previously always zero), the concrete proof the usage provider is wired end-to-end.
- Searched the user list by a role name and by a role-status word (e.g. "aktif") to confirm the extended predicate matches.
- Per project convention, `js/firebase.js` always targets the real production database, even locally — verification stayed read-only/observational; no users were created or deleted against production in this pass.

## 7. Regression Summary

- Permission behavior: unchanged (`permission-service.js` untouched, still unconsumed for gating anywhere).
- Warehouse/Vehicle/Engineering/Driver: unchanged (no files touched).
- Role Management: unchanged behavior — its only edit was a private-function-to-import refactor.
- Authentication/login: unchanged (`verifyPin.js`, `js/auth.js` untouched).
- Existing users/System Role assignment: unchanged — `isValidRole()`, `createUser()`, `updateUser()`, and the last-active-admin guard are byte-for-byte the same code path as v1.30.3.

## 8. Performance Report

- `role-catalog.js#getAllRoles()`/`resolveGrantedSet()` are the same sync, in-memory-cache reads Role Management already relied on — no new Firebase reads introduced.
- The Role Usage Provider (`getRoleUsageFromUsers`) is a sync `Array.filter` over the already-loaded `users` cache — no new reads, called only when Role Management actually asks for usage (lazily, via `getRoleUsage()`'s existing try/catch wrapper).
- `buildRoleSummary()` is called only when the create/edit modal is open and only for the currently-selected role (not on every list render) — its existing signature-keyed cache applies unchanged.
- The extended search predicate resolves `resolveRoleInfo()` once per user per render; for this app's user-list scale this is a cheap sync array scan, no Firebase involvement.

## 9. Future Permission Migration Strategy

This is the concrete scope of the phase this one explicitly does **not**
attempt — deferred per the user's decision in §2:

1. **`functions/src/auth/verifyPin.js`** — `VALID_ROLES` must recognize Custom Role ids (or be replaced by a live lookup against `customRoles` + `role-registry.js`), and its downgrade-to-`'viewer'` fallback must be revisited so a Custom-Role-holding user isn't silently demoted at every login.
2. **`js/app.js#canAccessModule()`** — its hand-written `role === 'literal'` switch must be replaced (or supplemented) with real `permission-service.js#can()` checks so a Custom Role's granted permissions actually control module access, not just display metadata.
3. **`database.rules.json`** — every rule keyed on `auth.token.role === '...'` needs an equivalent permission-aware path (or the custom-token claim needs to carry more than a bare role string) before write-level enforcement can trust a Custom Role the way it trusts the 6 legacy strings today.

These three must ship together, as one coordinated, deployed change — enforcement split across only some of them would recreate exactly the UI/reality mismatch this phase avoided. Once that phase lands, the only change needed back in User Management is removing the `disabled` attribute in `js/admin.js#refreshCustomRoleOptions()` (and, if desired, deleting `#userRoleCustomHint`'s hint copy) — the Role Summary panel, the usage provider, the archived/broken-reference handling, and `resolveRoleInfo()` all already generalize correctly to a Custom Role being genuinely assignable, since none of them special-case "System Role only" anywhere in their logic.
