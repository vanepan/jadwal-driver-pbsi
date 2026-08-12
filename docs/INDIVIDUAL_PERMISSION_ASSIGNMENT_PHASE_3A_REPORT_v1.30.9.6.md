# Individual Permission Assignment — Phase 3A: User Management UX (v1.30.9.6)

**Status: implemented, tested, NOT deployed, NOT committed.** Working tree only.

---

## 1. Objective

Phase 1 (storage) and Phase 2 (runtime resolution) shipped with no UI —
confirmed empirically via a live production Claude-in-Chrome read-only
pass that found no path anywhere in the app to actually create an
individual permission override. Phase 3A closes that gap: an admin can
now grant/revoke individual permissions for one user directly from
Manajemen User's Edit User modal.

## 2. UX implemented

A new "Individual Permissions" section renders inside `#modalUserForm`,
directly below the existing (unchanged) `#userRoleSummaryPanel`, visible
only in Edit-mode (hidden entirely when creating a new user — there's no
user yet to grant an override to):

- **Header**: title, live count ("N permission"), and a "+ Tambah
  Permission" button (editable users only).
- **Grant list**: one row per individual override, canonical registry
  title (never a raw permission id), an "Individual" provenance badge, and
  a "Cabut" button (editable users only).
- **Empty state**: "Belum ada individual permission."
- **Picker** (opens on "+ Tambah Permission"): the real 50-permission
  registry grouped by Module → Category, with a live search filter. Each
  row shows one of three states: grantable (enabled checkbox), already
  inherited from the user's selected Role (disabled, checked, "Sudah
  tersedia melalui Role"), or already an individual grant (disabled,
  checked, "Sudah menjadi Individual Permission"). `system.admin` and
  `system.users.manage` never appear in this list at all.
- **Read-only state** (inactive/archived users): existing grants remain
  fully visible; no "+ Tambah Permission" button, no "Cabut" buttons, and
  an explanatory notice ("Akun tidak aktif" / "Akun sudah diarsipkan.
  Individual permissions tidak dapat diubah.").
- **Loading state**: "Memuat individual permissions..." shown
  synchronously, before the async read resolves.
- **Error state**: "Gagal memuat individual permissions." — see §8 for
  the one honestly-reported limitation here.

Visual language reuses the existing `.rm-permission-row`/`.rm-category`
shape and design tokens from Role Management, under a new `ipm-` CSS
prefix — the same tokens, not the same DOM/event-delegation (verified
safe: Role Management's listeners are bound to its own mount container,
never `document`).

## 3. Grant/revoke flow

Immediate, independent actions — never bundled into `#btnSaveUserForm`,
exactly mirroring the existing Reset PIN precedent:

```
click a grantable checkbox
  → handleIpmGrantClick(permissionId)
      → grantUserPermission(username, permissionId)   [existing Phase 1 API, unmodified]
      → success: update local state, toast, keep modal open
      → failure: toast the error, leave prior state untouched (no fabricated success)

click "Cabut"
  → handleIpmRevokeClick(permissionId)
      → revokeUserPermission(username, permissionId)  [existing Phase 1 API, unmodified]
      → same success/failure handling
```

Both call the existing one-shot admin API directly — no Firebase call, no
duplicated storage logic, and never the live runtime cache
(`getCachedUserPermissionOverrides`), which is scoped to the currently
logged-in session, not whoever is being edited.

**User-switching identity safety**, proven by test, not just asserted:
`openUserFormModal(username)` resets state **synchronously** to a loading
placeholder for the new username before any async read starts. Every
async result (`loadIndividualPermissionsFor`, grant/revoke) checks
`ipmState.username` against its own captured username before applying
anything — a response from a superseded load (user switched, or modal
closed, mid-request) is silently discarded.

## 4. Inactive/archived behavior

Both states, per this phase's explicit product decision: section stays
**visible**, existing overrides stay **visible**, but the picker and
"Cabut" controls are not rendered at all, and a notice explains why. No
code path in this phase writes to `active`/`archived`/`role` — confirmed
by inspection (`handleIpmGrantClick`/`handleIpmRevokeClick` only ever call
`grantUserPermission`/`revokeUserPermission`, which touch
`/userPermissionOverrides` exclusively, never `/users`).

## 5. Security exclusions

- `system.admin` — already structurally blocked at the storage/rules layer
  since Phase 1; this phase adds UI-layer defense in depth (never rendered
  in the picker at all, plus a defensive check in the click handler).
- `system.users.manage` — a new, explicit exclusion this phase adds. Zero
  enforcement consumers exist anywhere in the codebase today, but its
  description ("Create, edit, and deactivate user accounts and role
  assignments") is administrative — excluded so a future change that
  starts enforcing it doesn't retroactively empower every existing
  override holder without review.

No change to `database.rules.json`, `functions/**`, `verifyPin.js`,
`permission-service.js`, `individual-permission-provider.js`,
`user-permission-overrides-store.js`, `user-permission-overrides-rules.js`,
`users.js`, any `config/role-*.js` file, `role-management-center.js`, or
`role-summary-model.js`.

## 6. Files changed

**Created:**
- `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3_INVESTIGATION_REPORT_v1.30.9.6.md`
- `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3A_REPORT_v1.30.9.6.md` (this file)
- `scripts/individual-permission-management-harness.html`
- `scripts/individual-permission-management-dom-check.mjs`

**Changed:**
- `js/admin.js` — new imports (`getUserPermissionOverrides`/`grantUserPermission`/`revokeUserPermission`, `listAllPermissions`/`getPermission`), `ipmState` + render/handler functions, wiring into `openUserFormModal()`/`closeUserFormModal()`/role-select change handlers, new test-only `__setIpmOverridesForTest()` seam.
- `index.html` — new `#userIndividualPermissionsGroup`/`#userIndividualPermissionsPanel` markup inside `#modalUserForm`, outside the submit-relevant fields.
- `platform.css` — new `.ipm-*` component block (~180 lines), including a mobile breakpoint.
- `js/config.js` — `APP_VERSION`/`RELEASE_NAME`/new `VERSION_HISTORY` entry.

## 7. Tests

**New**: `scripts/individual-permission-management-dom-check.mjs` — **45/45 passing** (exceeds the requested 21-check minimum; several items were split into more granular, independently-readable assertions). Real `js/admin.js` in headless Chromium, real registry data, real (correctly-denied) grant/revoke network calls against the live RTDB rule, test-only `__setIpmOverridesForTest()` seam for deterministic rendering assertions — same conventions as every prior DOM test in this program. Hardened with poll-until-condition waits (not fixed sleeps) around the two real-network-dependent assertions, after one transient network-timing flake was observed and fixed during verification.

## 8. One reported gap (not silently worked around)

`getUserPermissionOverrides()` (Phase 1) is fail-closed by design — a
denied/errored read and a genuinely-empty override record both resolve to
an empty `Set`, with no way to distinguish them through the existing API's
return shape alone. The `error` UI state built in this phase is real,
styled, and tested (via the test-only seam), but **cannot currently be
reached through an actual RTDB denial** — only a genuine JS exception
would trigger it, and the store's documented contract says it never
throws. Extending the store to surface this distinction would require
touching a file this phase was explicitly told not to modify without
stopping first — so it's reported here as a known limitation for a future,
separately-scoped decision, not silently patched around.

## 9. Regression results

| Suite | Result |
|---|---|
| `individual-permission-runtime-check.mjs` | 38/38 |
| `permission-service-check.mjs` | 62/62 |
| `canAccessModule-check.mjs` | 5/5 |
| `user-permission-overrides-rules-check.mjs` | 47/47 |
| `role-management-check.mjs` | 38/38 |
| `role-status-check.mjs` | 14/14 |
| `role-relationships-check.mjs` | 26/26 |
| `role-usage-provider-check.mjs` | 14/14 |
| `role-archive-guard-check.mjs` | 10/10 |
| `role-summary-model-check.mjs` | 19/19 |
| `custom-roles-check.mjs` | 29/29 |
| `verify-pin-role-resolution-check.mjs` | 23/23 |
| `users-role-assignment-check.mjs` | 16/16 |
| `credential-service-check.mjs` | 39/39 |
| `pin-hash-check.mjs` | 24/24 |
| `permission-runtime-invariant-check.mjs` (Puppeteer) | 42/42 |
| `role-management-dom-check.mjs` (Puppeteer) | 12/12 |
| `role-management-edit-dom-check.mjs` (Puppeteer) | 23/23 |
| `role-management-detail-dom-check.mjs` (Puppeteer) | 19/19 |
| `user-management-role-picker-dom-check.mjs` (Puppeteer) | 12/12 |
| `admin-pin-reset-dom-check.mjs` (Puppeteer) | 39/39 |
| `individual-permission-management-dom-check.mjs` (new, Puppeteer) | 45/45 |
| `npm run test:rtdb-emulator` | 16/16 suites, 392 checks, exit 0 |
| `npm run test:functions-emulator` | 8/8 suites, 77 checks, exit 0 |

**Zero failures, zero regressions.**

## 10. Version state

`APP_VERSION = '1.30.9.6'`. `scripts/sync-version.mjs` was **not** run —
`version.json`/`service-worker.js`/`index.html`'s cache-bust params remain
at their last-synced value, per this phase's explicit instruction.

## 11. Deployment state

**Nothing deployed. Nothing committed.** All changes are working-tree
only.

## 12. Remaining scope (explicitly out of this phase)

- Phase 3B: `logAction()` audit-trail wiring for grant/revoke events
  (`individual_permission_granted`/`individual_permission_revoked`).
- §8's storage-API error-distinguishability gap, if ever prioritized.
- Any change to the legacy `hasPermission()`/`isAdmin()`/`canEng()`
  authorization paths — an individually-granted permission still only
  affects `canAccessModule()`'s cluster, the same pre-existing,
  already-documented limitation Phase 2 inherited from Custom Roles.
