# Custom Role Assignment & Activation — v1.30.8

Status: **IMPLEMENTED, TESTED, NOT DEPLOYED, NOT COMMITTED.**

A prerequisite security fix (v1.30.7.9) was also implemented and tested this
session, as its own separate diff. Its own detail lives in its own
`VERSION_HISTORY` entry in `js/config.js`; this report references it but
does not duplicate it.

---

## 1. Current architecture (Phase 1 findings)

Before any code was written, the following files were read in full:
`js/role-management/{role-catalog,role-management-center,role-summary-model,
role-status,role-relationships,role-archive-guard,role-usage-provider,
runtime-role-provider,custom-roles-store}.js`, `js/users.js`, `js/admin.js`,
`js/permission-service.js`, `js/app.js`, `functions/src/auth/verifyPin.js`,
`database.rules.json`.

**Finding: almost the entire assignment infrastructure already existed and
was already deployed**, from the earlier Permission Runtime Migration
(v1.30.5–v1.30.7). Specifically:

| Question | Answer |
|---|---|
| Where is a user's role stored? | `/users/{username}.role` — a single string field. No separate field for Custom Role vs System Role. |
| How are Custom Role ids represented? | Verbatim — the `customRoles/{id}` key itself becomes the stored `role` value. No sentinel/prefix. |
| How are Custom Roles resolved (display)? | `role-catalog.js#getAllRoles()` / `#resolveRoleInfo(roleId)`. |
| How are Custom Roles resolved (runtime enforcement)? | `permission-service.js#can()` → `runtime-role-provider.js#getRuntimeRole()` → `custom-roles-store.js`'s live cache. Archived/unknown → `EMPTY_SET` (fail closed). |
| How are Custom Roles resolved (login)? | `verifyPin.js#resolveRoleClaims()` — mints the Custom Role id verbatim as the token `role` claim, plus `adminEquivalent: true` iff the role holds `system.admin`. Archived/unknown → downgrades to `'viewer'`. |
| Was the save path (`createUser`/`updateUser`) already safe? | **Yes.** `js/users.js#isValidRole()` already validates against `getAllRoles()` (System + active Custom only) for both functions — an archived/unknown Custom Role id was already silently rejected (falls back to `'viewer'` on create, or the existing role on update), independent of any UI. |
| What exactly blocked assignment? | **One place only**: `js/admin.js#refreshCustomRoleOptions()` rendered every active Custom Role as a `<option disabled>` ("Belum Aktif"). |
| Are archived Custom Roles already handled? | Yes — excluded from `getAllRoles()` entirely (never listed), and a user whose *current* stored role is archived/unknown is separately surfaced via `renderCurrentRoleWarning()`. |
| Is `adminEquivalent` kept distinct from `role === 'admin'`? | Yes, confirmed in `verifyPin.js`, `permission-service.js`, every RTDB rule, and `auth.js#isAdmin()` (which never reads `adminEquivalent` — RTDB-rules-only signal, by design). |

So Phases 2, 3, 6, and 7 of the original brief were **already done and
already in production**. What remained was Phase 4 (drop `disabled`),
Phase 8 (UX cleanup), and Phase 12 (tests actually proving all of the
above — most of which had never been directly exercised in isolation).

## 2. STOP-and-report: a pre-existing authorization gap (v1.30.7.9)

Investigating `/users/{username}` — the exact node this feature's whole
assignment mechanism depends on — surfaced a genuine, pre-existing,
unrelated self-privilege-escalation gap: the self-write branch
(`auth.uid === $username`, added in v1.30.6.10 for profile self-edit) had
no field-level restriction, so any authenticated user could rewrite their
own `role`/`active`/`archived` directly via RTDB, then re-login to mint a
privileged token. Per this task's own Phase 11 instruction ("if a missing
authorization boundary is discovered: STOP and report before changing
it"), this was reported to the user as a blocking finding before any
v1.30.8 code was written. The user chose to fix it first, as its own
separate version (**v1.30.7.9**) — full detail in that version's own
`VERSION_HISTORY` entry. v1.30.8 resumes on top of that closed gap.

## 3. Assignment contract

- **Field**: `/users/{username}.role` — unchanged. No migration.
- **Valid values**: any System Role id (`admin`, `bidang`, `driver`,
  `viewer`, `engineering_coordinator`, `engineering_member`) or any
  **active, non-archived** Custom Role id.
- **Invalid values** (rejected at the save path, not merely hidden in the
  UI): an archived Custom Role id, an unknown/nonexistent id, empty/undefined.
- **Enforcement**: `js/users.js#isValidRole(value)` = `getAllRoles().some(r
  => r.id === value)`, called by both `createUser()` (invalid → falls back
  to `'viewer'`) and `updateUser()` (invalid → keeps the existing role).
  This was already true before this version; v1.30.8 does not change it.

## 4. What actually changed (Phase 4/8)

`js/admin.js#refreshCustomRoleOptions()`:
- Removed `opt.disabled = true` on injected Custom Role `<option>`s.
- Renamed the `<optgroup>` label from `"Custom Role (Belum Aktif)"` to
  `"Custom Role"`.
- Removed the now-permanently-dead hint element (`#userRoleCustomHint`,
  previously explained *why* roles weren't assignable — no longer true,
  and nothing else ever showed it) from both `index.html` and `admin.js`,
  rather than leaving inert markup/lookups behind.

Archived Custom Roles are **still never listed** in the picker — this was
a deliberate decision, not an oversight: `role-catalog.js#getAllRoles()`
already excludes them (the same mechanism System Roles rely on — no
archive state to render), and inventing a new "visible but disabled
archived option" UI pattern would have duplicated logic the brief itself
says not to duplicate. A user whose *current* stored role is archived or
unknown is still surfaced by the pre-existing, untouched
`renderCurrentRoleWarning()`.

Role Summary, Role Usage, and the Archive Guard needed **zero code
changes** — all three were already correctly generalized to any role type
since v1.30.3/v1.30.4.

## 5. Runtime permission verification (Phase 6)

Proven against real production logic (not reimplemented), via
`scripts/users-role-assignment-check.mjs` and the pre-existing
`permission-service-check.mjs` / `permission-runtime-invariant-check.mjs`:

- A Custom Role's granted permissions resolve through `can()` exactly as
  the Role Summary panel reports them (the permanent drift guard
  `permission-runtime-invariant-check.mjs` already asserts this equality).
- Permissions **not** granted by the Custom Role remain denied
  (`permission-service-check.mjs` §11: `cannotAs('warehouse-lead-a1b2',
  'system.admin', ...)`).
- An archived Custom Role fails closed at runtime even for a permission it
  held before archiving.

## 6. Admin-equivalent handling (Phase 7)

Unchanged, verified intact:
- `role === 'admin'` (literal) and `adminEquivalent === true` (Custom Role
  holding `system.admin`) remain two genuinely separate signals throughout
  — `verifyPin.js` mints them distinctly, every RTDB rule checks both
  explicitly (`auth.token.role === 'admin' || auth.token.adminEquivalent
  === true`), and `auth.js#isAdmin()` never reads `adminEquivalent`.
- `permission-service-check.mjs` and `role-claim-rules-check.mjs` both
  test a Custom Role WITH `system.admin` and WITHOUT as genuinely separate
  branches, not assumed interchangeable.
- No new elevated flag was introduced; `adminEquivalent` was not renamed.

## 7. Security (Phase 11)

- Assignment writes go through the existing client → `updateFirebaseData('users/{username}', ...)` path (direct RTDB, same as every other user-record write — no Cloud Function involved, unchanged by this version).
- `/users/{username}.write` already requires admin/adminEquivalent for a
  cross-user write; a self-write cannot change `role` at all (as of
  v1.30.7.9). Assigning a Custom Role to **another** user therefore
  requires admin/adminEquivalent, exactly as assigning a System Role
  already did — no new capability, no weakened rule.
- No RTDB rule was weakened. `customRoles/$roleId.write` remains
  admin-literal-only (Custom Role *definition* changes stay stricter than
  Custom Role *assignment*, unchanged, not evaluated for widening here).
- No client-only security was added — the save-path gate (`isValidRole`)
  is enforced identically regardless of which UI (or lack of UI) calls
  `createUser`/`updateUser`.

## 8. Tests

**New (this version):**
| File | Type | Checks |
|---|---|---|
| `scripts/users-role-assignment-check.mjs` | Puppeteer, real `js/users.js` logic | 16 |
| `scripts/user-management-role-picker-dom-check.mjs` + `-harness.html` | Puppeteer, real `js/admin.js` | 12 |
| `scripts/rtdb-emulator/users-nodes-full-sweep-check.mjs` (extended, v1.30.7.9) | Real Firebase emulator | +9 (3→12) |

**Full regression re-run this session, all clean:**
`role-management-check` 38, `role-status-check` 14, `role-relationships-check`
26, `role-usage-provider-check` 14, `role-archive-guard-check` 10,
`role-summary-model-check` 19, `custom-roles-check` 29,
`permission-service-check` 62, `canAccessModule-check` 5,
`verify-pin-role-resolution-check` 23, `role-management-dom-check` 12,
`role-management-edit-dom-check` 23, `role-management-detail-dom-check` 19,
`permission-runtime-invariant-check` 14, `pin-hash-check` 24,
`credential-service-check` 39, plus the full RTDB emulator authorization
suite (**345 checks, 14 suites**, two consecutive clean runs).

**Zero real production users were touched or assigned a Custom Role at any
point.** Every assertion runs against seeded fixtures
(`__seedCustomRolesForTest`/`__seedUsersForTest`, both explicitly
test-only exports) or the local RTDB emulator — per the brief's own Phase
13 instruction, and because this sandboxed environment has no real
non-admin production credentials in any case (`js/firebase.js` always
targets the real production database, even from local scripts, so
authenticated-only store functions are never driven directly in
ad-hoc/automated verification here).

## 9. Regression results

0 failures across every check listed above. Standard-role behavior (admin,
bidang, driver, viewer, both engineering roles) is unchanged — none of
this version's edits touch System Role resolution at any layer.

## 10. Production-readiness assessment

- **Code**: complete, tested, matches the brief's contract exactly.
- **Deployment**: the RTDB rule change (v1.30.7.9) and the client changes
  (v1.30.8) are both currently local/uncommitted, like every prior phase
  of this program. `firebase deploy` was not run.
- **Recommendation**: a single controlled production assignment is **not**
  required to validate this feature further — the fixture/emulator tests
  above exercise the exact same code paths (`isValidRole`,
  `getRoleUsageFromUsers`, `canArchiveRole`, `refreshCustomRoleOptions`,
  `permission-service.js`, `verifyPin.js`'s `resolveRoleClaims`) that a
  real assignment would. What a real assignment would additionally prove —
  a live login as a Custom-Role-holding user — is out of scope for this
  sandboxed environment regardless (no non-admin production credentials
  available), consistent with every prior phase of this program.
- Before this ships to real users: (1) deploy v1.30.7.9's rule fix and
  v1.30.8's client changes together (the RTDB fix has no effect until
  deployed, and shipping the UI activation without it would be shipping
  the exact single-assignment-write self-escalation surface back into
  general availability); (2) the standing, still-open item from the
  Permission Runtime Migration program — live click-through as each of the
  6 real System Roles, not yet completed for lack of non-admin production
  credentials — remains open and is not newly introduced by this version.

## Files changed

- `js/admin.js` — `refreshCustomRoleOptions()` activation.
- `index.html` — comment update, removed dead hint element.
- `js/users.js` — `isValidRole()` exported, new `__seedUsersForTest()`.
- `database.rules.json` — v1.30.7.9's self-write field pin (see that
  entry).
- `scripts/rtdb-emulator/users-nodes-full-sweep-check.mjs` — v1.30.7.9's 9
  new checks.
- `js/config.js` — both `VERSION_HISTORY` entries.

## Files added

- `scripts/users-role-assignment-check.mjs`
- `scripts/user-management-role-picker-dom-check.mjs`
- `scripts/user-management-role-picker-harness.html`
- `docs/CUSTOM_ROLE_ASSIGNMENT_ACTIVATION_REPORT_v1.30.8.md` (this file)

Nothing deployed. Nothing committed. No real user's role was touched.
