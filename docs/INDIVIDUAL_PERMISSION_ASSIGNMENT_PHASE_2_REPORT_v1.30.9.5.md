# Individual Permission Assignment — Phase 2: Runtime Permission Resolution (v1.30.9.5)

**Status: implemented, tested, NOT deployed, NOT committed.** Working tree only.

---

## 1. Objective

Phase 1 (v1.30.9.1) built `/userPermissionOverrides/{username}` storage and its
RTDB security boundary, but deliberately left it disconnected from
enforcement — that file's own header stated *"A user's runtime permissions
are byte-for-byte unchanged by this file's existence."* Phase 2's objective
was to close that gap: make individual overrides actually participate in the
application's runtime authorization calculation, without creating a second
authorization engine, without weakening any existing fail-closed guarantee,
and without letting `system.admin`/`adminEquivalent` become reachable through
this mechanism.

## 2. Architecture before Phase 2

```
getCurrentUser() [auth.js]
  → { username, role }
permission-service.js#can(permission)
  → permissionSetFor(user.role)
       System Role? → frozen cached Set (config/role-permissions.js)
       else → runtime-role-provider.js#getRuntimeRole(role) → custom-roles-store.js live cache
              → archived/unknown → EMPTY_SET
  → .has(permission)
```

`/userPermissionOverrides` existed in RTDB with a correct, admin-only-write
security rule, but was imported by nothing outside its own two Phase 1 files.

## 3. Architecture after Phase 2

```
getCurrentUser() → { username, role }
permission-service.js#can(permission)
  → effectivePermissionSetFor(user)
       base = permissionSetFor(user.role)                          [UNCHANGED]
       overrides = individual-permission-provider.js
                     #getIndividualPermissionOverrides(user.username)  [NEW]
       return base ∪ overrides
  → .has(permission)
```

`listPermissions()`, `hasAny()`, `hasAll()`, `cannot()` all derive from the
same `effectivePermissionSetFor()`. `js/app.js#canAccessModule()` required no
change at all — it has no logic beyond `can(MODULE_PERMISSIONS[name])`, so it
inherits the new behavior automatically.

## 4. Runtime provider design

`js/permission-management/individual-permission-provider.js` is structurally
identical to `role-management/runtime-role-provider.js`:
`initIndividualPermissionProvider()` / `getIndividualPermissionOverrides(username)`.
It is the *only* thing `permission-service.js` imports for override
resolution — never Firebase, never the concrete store — reapplying the exact
dependency-inversion boundary already reviewed and approved for Custom Roles,
rather than inventing a new pattern.

## 5. Override cache/subscription design

The live cache lives in `user-permission-overrides-store.js` (Phase 1's own
file — its header predicted exactly this addition). Unlike
`custom-roles-store.js`'s single global `/customRoles` subscription, this
cache is **scoped to exactly one username at a time**:
`userPermissionOverrides/{currentUsername}`. This is a real, deliberate
divergence from the Custom Role provider's shape, not an oversight — the
RTDB rule for this node only permits `admin`/`adminEquivalent` or the
record's own subject to read it, so a global subscription would be denied
outright for any non-admin session.

`getCachedUserPermissionOverrides(username)` additionally fails closed for
any username other than the one currently subscribed — a defense-in-depth
identity guard, verified directly in the Puppeteer suite (§13), on top of
the pre-existing structural guarantee that every user switch in this app
passes through a full page reload (`auth.js#logout()`), which alone already
destroys all in-memory module state.

Two test-only seams were added, mirroring `custom-roles-store.js`'s
`__seedCustomRolesForTest()` convention:
`__seedUserPermissionOverridesForTest(username, permissions)` and
`__resetUserPermissionOverridesLiveForTest()`.

Wired into boot at `js/app.js#startAuthenticatedSession()`, immediately after
the existing `initRuntimeRoleProvider()` call — the same one-shot,
already-authenticated boot moment.

## 6. Effective permission semantics

```
effectivePermissions(user) = permissionSetFor(user.role) ∪ getIndividualPermissionOverrides(user.username)
```

Additive/union only — no DENY concept, matching Phase 1's storage shape.
`permissionSetFor()` itself is **unchanged** — it still resolves the base
role/Custom Role grant only. `role-catalog.js#resolveGrantedSet()` and Role
Management's Role Summary continue to describe a ROLE's own definition, not
any one user's effective permissions, exactly as before.

## 7. System Role behavior

`viewer`/`bidang`/`driver`/`admin` + an individual override resolve to the
System Role's static grant unioned with the override, verified for all four
roles (plus `engineering_coordinator`/`engineering_member` implicitly via the
backward-compat sweep). `admin` is unaffected in practice — its own grant
already a superset of anything a sane override would add — but the union
path is exercised for `admin` too, not special-cased away.

## 8. Custom Role behavior

Custom Role (active) + override resolves to the Custom Role's own live
permission set unioned with the override — no special-casing versus System
Roles, since both flow through the same `permissionSetFor(user.role)` call.
Verified with one, and with multiple, simultaneous overrides.

## 9. Archived Custom Role behavior — explicit product decision

**Confirmed before implementation, not assumed:** when a user's Custom Role
is archived, `permissionSetFor()` still collapses the base grant to
`EMPTY_SET` exactly as it always has (unchanged, pre-existing fail-closed
behavior). The user's individual overrides are **not** collapsed along with
it — they remain independently effective on top of the now-empty base
(`EMPTY_SET ∪ overrides = overrides`). The archived role's own former
permissions are never resurrected by the mere presence of an override.
Verified directly: `scripts/individual-permission-runtime-check.mjs` §4 and
the Puppeteer suite's `archivedCustomRoleOverrideSurvives` /
`archivedCustomRoleOwnGrantsNotResurrected` checks.

## 10. system.admin protection

Structurally impossible to grant through this mechanism, defended at every
layer, all unchanged by this phase and now proven end-to-end through the
real `can()`/`listPermissions()` wiring (not just a mirror):
1. **Write time** (Phase 1): `isValidPermissionId()` hard-rejects it before a
   grant can even be built.
2. **RTDB rule** (Phase 1): `.validate` independently rejects it per array
   element.
3. **Read time** (Phase 1, reused as-is): `normalizeOverrideRecord()` strips
   it defensively even if it somehow existed in a raw record.
4. **Runtime** (this phase): verified that an override array containing
   `system.admin` — alone, or mixed with a valid permission — never makes
   `can('system.admin')` true, never appears in `listPermissions()`, and
   never opens the `system.admin`-gated `roleManagement` module.

## 11. adminEquivalent separation

Untouched. `adminEquivalent` is minted exclusively by
`functions/src/auth/verifyPin.js#resolveRoleClaims()` from a Custom Role's
own `permissions` array — that file was not modified, and it has no code
path that reads `/userPermissionOverrides`. Verified: an `adminEquivalent`
Custom Role (holding `system.admin` itself) keeps `can('system.admin') ===
true` with or without an unrelated override present, and a Custom Role
*without* `system.admin` does not gain it merely by holding an ordinary
override.

## 12. Fail-closed behavior

No override record, a denied/errored subscription, a malformed record, an
unknown permission id, or a signed-out session all resolve to an empty
override contribution — never an error, never a fallback grant. All reuse
Phase 1's already-fail-closed `normalizeOverrideRecord()`; no new fail-closed
logic was invented.

## 13. Identity isolation

Verified directly against real wired code: user A grants an override,
"logout" (simulated via `__resetUserPermissionOverridesLiveForTest()`),
user B logs in with no override of their own — B does not inherit A's grant.
B is then given a *different* override — B has their own, still not A's.
A direct, defense-in-depth check (`getIndividualPermissionOverrides('user
A')` called while the live cache is scoped to user B) confirms the store's
identity guard refuses to answer for the wrong username even though user A's
data was real and seeded earlier in the same test run.

## 14. Performance

No Firebase reads inside `can()`/`listPermissions()`/`hasAny()`/`hasAll()`/
`cannot()` — all resolve against the already-live in-memory cache. One
subscription per session (scoped to one username), not one read per
permission check. `can()` remains fully synchronous.

## 15. Test matrix

- **New**, pure Node, real `normalizeOverrideRecord()`:
  `scripts/individual-permission-runtime-check.mjs` — **38/38 passing**.
  Backward compatibility, System Role + override, Custom Role + override,
  archived Custom Role + override (survives), `system.admin` never
  effective, unknown/malformed entries ignored, unresolvable role + override,
  Set-union idempotency.
- **Extended**, Puppeteer, real wired `permission-service.js` →
  `individual-permission-provider.js` → store: `scripts/permission-runtime-
  invariant-check.mjs` — **42/42 passing** (13 pre-existing role-invariant
  checks + 29 new Phase 2 checks). Covers `can()`/`listPermissions()`/
  `hasAny()`/`hasAll()`/`cannot()`/`canAccessModule()`, System/Custom/
  archived-role + override, `system.admin`/`adminEquivalent` separation,
  identity isolation across a simulated logout boundary, fail-closed reads
  for unauthenticated/unseeded identities, zero fatal console errors.

## 16. Regression results

| Suite | Result |
|---|---|
| `permission-service-check.mjs` | 62/62 |
| `canAccessModule-check.mjs` | 5/5 |
| `user-permission-overrides-rules-check.mjs` (Phase 1) | 47/47 |
| `individual-permission-runtime-check.mjs` (new) | 38/38 |
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
| `permission-runtime-invariant-check.mjs` (Puppeteer, extended) | 42/42 |
| `role-management-dom-check.mjs` (Puppeteer) | 12/12 |
| `role-management-edit-dom-check.mjs` (Puppeteer) | 23/23 |
| `role-management-detail-dom-check.mjs` (Puppeteer) | 19/19 |
| `user-management-role-picker-dom-check.mjs` (Puppeteer) | 12/12 |
| `admin-pin-reset-dom-check.mjs` (Puppeteer) | 39/39 |
| `npm run test:rtdb-emulator` | 16/16 suites, exit 0 |
| `npm run test:functions-emulator` | 8/8 suites, exit 0 |

**Zero failures, zero regressions.**

## 17. Files changed

**Created:**
- `js/permission-management/individual-permission-provider.js`
- `scripts/individual-permission-runtime-check.mjs`
- `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_2_REPORT_v1.30.9.5.md` (this file)

**Changed:**
- `js/permission-management/user-permission-overrides-store.js` — added the
  per-username live cache + two test-only seams. Existing one-shot admin API
  (`getUserPermissionOverrides`/`grantUserPermission`/`revokeUserPermission`)
  untouched.
- `js/permission-service.js` — added `effectivePermissionSetFor()`; `can()`/
  `listPermissions()` now use it. `permissionSetFor()` unchanged.
- `js/app.js` — one new import, one new call
  (`initIndividualPermissionProvider()`) in `startAuthenticatedSession()`.
- `scripts/permission-runtime-invariant-check.mjs` — extended with the Phase
  2 real-wiring scenarios (§15).
- `js/config.js` — `APP_VERSION`, `RELEASE_NAME`, new `VERSION_HISTORY` entry.

**Explicitly not touched:** `functions/src/auth/verifyPin.js`,
`database.rules.json`, `user-permission-overrides-rules.js`,
`runtime-role-provider.js`, `custom-roles-store.js`, `role-catalog.js`,
`js/auth.js`'s legacy permission helpers, `canEng()`, and every unrelated
business module.

## 18. Version state

`APP_VERSION = '1.30.9.5'`. `v1.30.9.4` was already committed (Secure Admin
PIN Reset UX) — confirmed via git log before choosing this number, per the
Phase 2 investigation report's own flag. `scripts/sync-version.mjs` was not
run; `version.json`, `service-worker.js`, `index.html` were not touched.

## 19. Deployment state

**Nothing deployed. Nothing committed.** All changes are working-tree only.
No `firebase deploy` of any kind was run. No production data, users, roles,
or RTDB rules were touched.

## 20. Remaining limitations

- **Pre-existing, not introduced by this phase** (named explicitly so it
  isn't silently inherited): an individual override only affects
  `canAccessModule()`'s cluster — the same structural limitation Custom
  Roles already have. It has no effect on `auth.js#hasPermission()`/
  `isAdmin()`/`isBidang()`/`isDriver()`/`isViewer()`, or `canEng()`, because
  those mechanisms don't resolve any role/permission concept beyond a
  handful of literal strings. Granting `driver.schedule.assign` via an
  override does not, today, let that user actually assign a driver anywhere
  `hasPermission('assign')` gates — exactly as a Custom Role with that
  permission already cannot.
- No User Management UI exists yet to grant/revoke overrides through the real
  app (that's the audit's originally-planned "User Management UX" phase) —
  this phase is runtime resolution only, verifiable today only through the
  test-only seed hooks or `js/permission-management/user-permission-
  overrides-store.js`'s existing one-shot admin API directly.
- No audit-trail (`logAction()`) wiring for grant/revoke events yet — out of
  scope for this phase, per the original architecture audit's phasing.
