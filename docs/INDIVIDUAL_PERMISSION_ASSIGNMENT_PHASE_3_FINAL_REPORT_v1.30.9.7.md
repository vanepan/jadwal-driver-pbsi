# Individual Permission Assignment — Phase 3 Final Report (v1.30.9.7)

**Status: implemented, audited, tested. NOT deployed, NOT committed.**

---

## 1. Architecture

Unchanged across the entire Phase 1→3B program:

```
User (/users/{username})
  role: string                                    (existing, unchanged)
  ↓
permissionSetFor(user.role)                       (Phase 0, unchanged)
  ↓                                    ∪
getIndividualPermissionOverrides(user.username)    (Phase 2, unchanged)
  ↓
effectivePermissionSetFor(user)  →  can()/listPermissions()
```

Phase 3 (A+B) adds exactly one new layer on top: an admin-facing UI in
`js/admin.js` that reads/writes `/userPermissionOverrides/{username}`
through the Phase 1 one-shot API
(`getUserPermissionOverrides`/`grantUserPermission`/`revokeUserPermission`)
— never Firebase directly, never the runtime's live cache, never a second
storage or resolution mechanism.

## 2. UX

Manajemen User's Edit User modal, below the existing (unchanged) Role
Summary panel:

- Header: title, live count, "+ Tambah Permission" (editable users only).
- Grant list: canonical registry title, "Individual" provenance badge,
  "Cabut" (editable users only).
- **New in 3B**: an "Efektif: N permission (M dari Role, K Individual)"
  line — Base Role ∪ Individual, computed locally per edited user.
- Picker: real 50-permission registry, Module → Category grouping, live
  search. Three states per row: grantable, inherited ("Sudah tersedia
  melalui Role"), already-individual ("Sudah menjadi Individual
  Permission").
- Empty / Loading / Error states, visually distinct.
- Read-only notice for inactive/archived accounts.

## 3. Grant/revoke behavior

Immediate, independent writes through the existing Phase 1 API — never
bundled into `#btnSaveUserForm`. Serialized via a busy-state guard (all
grant/revoke controls disable while any one operation is in flight, not
just the specific row clicked — tightened in the Phase 3 audit for visual
consistency with the handler's own no-op guard).

**Race-condition fix from the Phase 3 audit**: grant/revoke and
`loadIndividualPermissionsFor()` now share one `ipmRequestToken` counter.
Previously, grant/revoke only checked "did the admin switch to a
different user" — closing and reopening the *same* user's modal while a
write was in flight was not guarded, so a superseded response could
resolve after a fresh reload and silently overwrite it. Fixed and proven
by a dedicated regression test.

## 4. Security boundaries

- All writes go through the existing Phase 1 store API — no direct
  Firebase calls added anywhere in `admin.js` for this feature (verified
  by grep).
- `system.admin` and `system.users.manage` are structurally excluded from
  the picker (the former also blocked at the storage/rules layer since
  Phase 1; the latter a new, explicit UI-layer decision — administrative
  by description, zero enforcement consumers today, excluded so a future
  enforcement change can't retroactively empower existing holders).
- Inherited and already-granted permissions cannot become duplicate
  overrides — the picker disables both states.
- Cross-user leakage is structurally prevented: `ipmState.username` is
  checked before any async result is applied, at every call site.
- Inactive/archived accounts render read-only — no grant/revoke control
  exists in the DOM for them at all.
- No code path in this feature ever writes `role`/`active`/`archived`/
  `pin`/`displayName`/`username` — `grantUserPermission`/
  `revokeUserPermission` only ever touch `/userPermissionOverrides`.
- `database.rules.json`, `functions/**`, `verifyPin.js`,
  `permission-service.js`, `individual-permission-provider.js`,
  `user-permission-overrides-store.js`, `user-permission-overrides-rules.js`,
  `users.js`, every `config/role-*.js` file, `role-management-center.js`,
  and `role-summary-model.js` are untouched across the entire Phase 1
  through 3B program.

## 5. User-state behavior

| State | Section | Existing grants | Picker | Cabut |
|---|---|---|---|---|
| Active | visible | visible | available | available |
| Inactive (`active:false`) | visible | visible | **absent** | **absent**, notice shown |
| Archived (`archived:true`) | visible | visible | **absent** | **absent**, notice shown |
| Create-mode (no user yet) | **hidden entirely** | n/a | n/a | n/a |

## 6. Runtime integration

Read-only from this feature's perspective — Phase 2's
`effectivePermissionSetFor()` already unions base role/Custom Role grants
with individual overrides; this phase only ever writes to the storage
Phase 2 already reads from. No change to `can()`/`listPermissions()`/
`hasAny()`/`hasAll()`/`cannot()` or their resolution order.

## 7. Audit logging

**Implemented**, not deferred — investigated first, per this phase's own
instruction not to invent a new subsystem. `js/logs.js#logAction()`
already exists and is already used by this exact file
(`handleUserFormSubmit()`'s `user_edited`/`user_created` calls), so it was
reused verbatim: two new `action` values,
`individual_permission_granted`/`individual_permission_revoked`, `targetId`
= the affected username, `metadata: {permission}`, logged only after a
**confirmed** store success (never speculatively before the write
settles). No new logging infrastructure was built.

## 8. Tests

`scripts/individual-permission-management-dom-check.mjs`: **68/68
passing** (grew from Phase 3A's 45 during the audit + Phase 3B). Real
`js/admin.js` in headless Chromium, real (correctly denied, in this
unauthenticated harness) grant/revoke network calls against the live
RTDB rule, test-only `__setIpmOverridesForTest()` seam for deterministic
rendering assertions. New this phase: a dedicated stale-response
regression test, a 20-cycle open/close/switch stress test, three-viewport
coverage (390×844/768×1024/1366×768), 6 accessibility-basics checks, and
3 audit-log wiring checks (source-level, mirroring the established
convention for asserting wiring a minimal harness can't authenticate to
observe live).

## 9. Regression

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
| `individual-permission-management-dom-check.mjs` (Puppeteer) | 68/68 |
| `npm run test:rtdb-emulator` (incl. the 29-check authorization matrix for this node) | 16/16 suites, 392 checks |
| `npm run test:functions-emulator` | 8/8 suites, 77 checks |

**Zero failures, zero regressions**, re-run in full after every fix (not
accepted on "same as before" without executing).

## 10. Known limitations

- `getUserPermissionOverrides()` (Phase 1) cannot distinguish a
  denied/errored read from a genuinely empty override set through its
  return shape alone — the error-state UI is real and tested via a seam,
  but not reachable through an actual RTDB denial today. Documented, not
  silently patched (would require touching a protected file).
- An individually-granted permission still only affects
  `canAccessModule()`'s cluster — the same pre-existing, already-documented
  limitation Phase 2 inherited from Custom Roles (`hasPermission()`/
  `isAdmin()`/`canEng()` don't resolve permission ids at all).
- No bulk grant/revoke — one permission per action, matching the existing
  store API's own shape.

## 11. Files changed (cumulative, Phase 3A + 3B)

- `js/admin.js`
- `index.html`
- `platform.css`
- `js/config.js`
- `scripts/individual-permission-management-harness.html`
- `scripts/individual-permission-management-dom-check.mjs`
- `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3_INVESTIGATION_REPORT_v1.30.9.6.md`
- `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3A_REPORT_v1.30.9.6.md`
- `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3_FINAL_REPORT_v1.30.9.7.md` (this file)

## 12. Version

`APP_VERSION = '1.30.9.7'`. `sync-version.mjs` not run;
`version.json`/`service-worker.js`/`index.html`'s cache-bust params
untouched, per instruction.

## 13. Deployment / Git

**Nothing deployed. Nothing committed. Nothing pushed.**
