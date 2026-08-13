# Role-Level Permission Assignment — Phase 4 Final Report (v1.30.9.9)

**Status: implemented, audited, tested. NOT deployed, NOT committed, NOT pushed.**

---

## 1. Architecture

```
BASE ROLE (System, code-defined / Custom, admin-editable)
  ↓                                                ∪
ROLE ADDITIONAL   (NEW — System Roles only)
  ↓                                                ∪
INDIVIDUAL        (Phase 1-3, unchanged)
  ↓
EFFECTIVE  →  can()/listPermissions()
```

`effectivePermissionSetFor(user) = permissionSetFor(user.role) ∪ roleAdditionalGrantsFor(user.role) ∪ individualGrantsFor(user.username)`, deduplicated by `Set` union, resolved synchronously.

## 2. The Custom Role architectural decision

Investigated first, per instruction. **Finding: Custom Roles (`role-management/custom-roles-store.js`) already are a fully mutable, admin-editable, role-level bulk permission mechanism** — an admin edits a Custom Role's `permissions[]` and every user holding that role id inherits the change immediately, through the exact same `permissionSetFor()` path a System Role uses. That already satisfies "fast bulk permission assignment for everyone in a role."

Introducing a second, independent Role Additional mechanism for the *same* Custom Role id would let two independently-writable layers both claim to define "this role's bulk permissions" — semantically duplicative, exactly the condition the brief's STOP-condition-adjacent language describes.

**Resolution (the brief's own anticipated path, not a workaround):** Role Additional Permissions are exclusively a **System Role** concept. Enforced not just at the UI but at the store layer — `role-permission-overrides-rules.js#isValidRoleOverrideTarget()` rejects any Custom Role id before a grant/revoke write is even attempted. Custom Roles are completely untouched: no new checkbox state, no new stats card, no new data path.

This was not a STOP condition — it is the case the brief explicitly pre-resolves.

## 3. Storage

New node: `/rolePermissionOverrides/{roleId}` → `{ permissions: string[], updatedAt: string }`. Same array-of-strings shape as `/customRoles.permissions` and `/userPermissionOverrides.permissions` (permission ids are dot-notation; RTDB keys cannot contain `.`).

- **`js/permission-management/role-permission-overrides-rules.js`** — PURE. `FORBIDDEN_PERMISSION_IDS = ['system.admin', 'system.users.manage']` (wider than Individual Permission Assignment's own list — see §5), `isValidRoleOverrideTarget(roleId)` (the System-Role-only boundary), `normalizeOverrideRecord`, `buildGrantUpdate`/`buildRevokeUpdate`.
- **`js/permission-management/role-permission-overrides-store.js`** — one-shot admin API (`getRolePermissionOverrides`/`grantRolePermission`/`revokeRolePermission`, each gated `isAdmin()` → `isValidRoleOverrideTarget()` → `isValidPermissionId()` before any Firebase write) **and** a single-role live cache scoped to the current session's own role, for the runtime path.
- **`js/permission-management/role-permission-provider.js`** — the dependency-inversion boundary `permission-service.js` is allowed to depend on, mirroring `individual-permission-provider.js` and `runtime-role-provider.js` exactly.

No direct Firebase call anywhere outside the store. Confirmed by grep across every file touched this phase.

## 4. Security (RTDB rules)

```
"rolePermissionOverrides": {
  "$roleId": {
    ".read": "admin || adminEquivalent || auth.token.role === $roleId",
    ".write": "admin || adminEquivalent",
    ".validate": "hasChildren(['permissions']) && no role/adminEquivalent/pin/pinHash/active/archived fields",
    "permissions/$index": ".validate": "isString && != 'system.admin' && != 'system.users.manage'"
  }
}
```

**One deliberate, documented deviation from the brief's literal READ template** ("non-admin: DENY"): a self-role read branch, `auth.token.role === $roleId`. Without it, a non-admin session could never resolve its own role's Additional grants and the feature would not function for anyone but admin. This mirrors `userPermissionOverrides`' own precedent exactly — that node's READ rule also has a self branch (`auth.uid === $username`) beyond the same generic "non-admin DENY" template, proven in its own emulator test (`alice (self) -> reads her OWN override record ALLOWED`). Not a STOP — a precedented, necessary interpretation, flagged explicitly here rather than applied silently.

WRITE has **no self-role branch of any kind** — proven by dedicated negative tests: a session with `role=bidang` can read `rolePermissionOverrides/bidang` but cannot write to it, including a harmless permission and including an attempted self-grant of `system.admin`.

## 5. A real gap found and fixed during this phase's own test-writing

`role-permission-overrides-rules.js` hard-blocks **both** `system.admin` and `system.users.manage` at `normalizeOverrideRecord()` — wider than Individual Permission Assignment's own `user-permission-overrides-rules.js`, which (by that phase's own explicit, documented decision, Phase 3 report §4) only hard-blocks `system.admin` at that layer; `system.users.manage` there is a UI-only exclusion (`admin.js`'s `IPM_FORBIDDEN_PERMISSION_IDS`).

While writing `role-permission-runtime-check.mjs`'s PROTECTED matrix, this asymmetry surfaced as a live test failure: `system.users.manage` **could** become effective through a directly-written (UI-bypassing) Individual override, since nothing at the storage/rules layer stops it for that mechanism.

`user-permission-overrides-rules.js` is on this phase's explicit do-not-modify list, so the fix lives entirely in `permission-service.js` — a file this phase already owns: `NEVER_EFFECTIVE_VIA_OVERRIDE = Set(['system.admin', 'system.users.manage'])`, filtering only **override contributions** (Role Additional and Individual), never `base` (an admin role's own legitimate `system.admin` grant is untouched). Strictly additive; zero bytes of the Phase 1-3 program touched.

## 6. Runtime

`permission-service.js#effectivePermissionSetFor()` extended to a three-way union. `can()`/`cannot()`/`hasAny()`/`hasAll()`/`listPermissions()` remain fully synchronous — no async introduced anywhere in the resolution path. Boot wiring: `initRolePermissionProvider()` called once per session in `app.js#startAuthenticatedSession()`, alongside the existing `initIndividualPermissionProvider()`.

Role Additional is unioned agnostically of role *type* (System or Custom) — it is only ever *written* for System Roles (store-layer enforced), so a Custom Role's contribution is always the empty set in practice; the runtime function doesn't need to know the distinction, matching `permissionSetFor()`'s own existing type-agnostic shape.

## 7. Role Management UI (System Roles only; Custom Role flow untouched)

Four checkbox states per permission: **Base** (checked+disabled, no `data-*` attribute at all — structurally, not just visually, un-toggleable), **Role Additional** (checked+enabled, immediate grant/revoke on click), **Protected** (unchecked+disabled), **Grantable** (unchecked+enabled). Grant/revoke are **immediate, independent writes** — mirroring Individual Permission Management's pattern, not Custom Role's Edit→Review→Save flow (a single boolean toggle has no meaningful review step). Stats cards for a System Role: 5 values (Total / Base Permissions / Role Additional / Not Granted / Modules), replacing the old 4-value Diberikan/Tidak-Diberikan pair for that role type only.

## 8. Individual Permission Integration (`js/admin.js`, read-only from this feature's side)

"Efektif" line extended from 2-way to 3-way: `Efektif: N permission (B dari Role, R Role Tambahan, I Individual)`. Each layer's contribution is its **unique** (non-overlapping-with-layers-beneath) count, so the three numbers always sum exactly to the total. New picker note: `Sudah tersedia melalui Role Additional.` (distinct from the existing `Sudah tersedia melalui Role.`). `admin.js` never imports `grantRolePermission`/`revokeRolePermission` — confirmed by grep; the only write affordance for this mechanism is Role Management.

## 9. Revocation / role-change semantics

Proven by `role-permission-runtime-check.mjs` §4-6: a Role Additional revoke never touches a user's Individual grant of the same permission (and vice versa); a role change means the OLD role's Role Additional grants disappear (never copied/migrated) while Individual grants (keyed by username) survive untouched; Bidang's Role Additional grants never leak into a Driver session's resolution.

## 10. Tests

| Suite | Result |
|---|---|
| `role-permission-overrides-rules-check.mjs` (new) | 59/59 |
| `role-permission-runtime-check.mjs` (new) | 46/46 |
| `role-additional-permission-dom-check.mjs` (new, Puppeteer) | 22/22 |
| `scripts/rtdb-emulator/role-permission-overrides-check.mjs` (new) | 29/29 |

## 11. Regression

| Suite | Result |
|---|---|
| `permission-service-check.mjs` | 62/62 |
| `individual-permission-runtime-check.mjs` | 38/38 |
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
| `permission-runtime-invariant-check.mjs` (Puppeteer) | 42/42 |
| `role-management-dom-check.mjs` (Puppeteer, 2 assertions intentionally narrowed — see §12) | 13/13 |
| `role-management-edit-dom-check.mjs` (Puppeteer, 1 assertion intentionally narrowed — see §12) | 24/24 |
| `role-management-detail-dom-check.mjs` (Puppeteer) | 19/19 |
| `user-management-role-picker-dom-check.mjs` (Puppeteer) | 12/12 |
| `individual-permission-management-dom-check.mjs` (Puppeteer, extended — see §12) | 91/91 |
| `admin-pin-reset-dom-check.mjs` (Puppeteer) | 39/39 |
| `npm run test:rtdb-emulator` (full authorization matrix, incl. this phase's new node) | 17/17 suites, 423 checks |
| `npm run test:functions-emulator` | 8/8 suites, 77 checks |

**Zero failures.** Total: 441 pure-logic + 262 DOM + 423 RTDB + 77 Cloud Function = **1,203 checks green.** (Corrected during the Phase 4 Final Review — the category subtotals originally published here were mis-summed by ±20 checks each; the grand total was, coincidentally, already correct.)

## 12. Pre-existing regression files intentionally updated (not silently patched)

Three files asserted the OLD (fully-read-only) System Role rendering. Their assertions were **factually superseded** by this phase's own, correct, intentional UI change — Base stays read-only (unchanged, non-negotiable), but not-yet-granted permissions are now legitimately editable (Role Additional). Each change is narrowly scoped and explained inline:

- `role-management-dom-check.mjs`: `"every permission row checkbox is disabled"` → `"every CHECKED (Base) checkbox stays disabled"` + new `"at least one editable checkbox exists"`. Stats card count `4` → `5` for a System Role.
- `role-management-edit-dom-check.mjs`: same narrowing for the `admin` role selection at the end of the Custom Role test flow.
- `individual-permission-management-dom-check.mjs`: hardcoded 2-way effective-line string → 3-way. Also caught and fixed a genuine test-authoring race of my own (an unnecessary `await setTimeout` let a slower REAL, unauthenticated individual-overrides fetch resolve and clobber a test-seeded value that a synchronous assertion would have safely captured) — removed the wait rather than papering over it. Added dedicated Role Additional provenance + picker-note assertions using a new test-only seam (`__setRaFormCacheForTest`, mirroring `__setIpmOverridesForTest`'s exact convention).

## 13. Audit logging

`role_permission_granted` / `role_permission_revoked`, via the existing `js/logs.js#logAction()` — no new subsystem. Logged only after confirmed store success. Payload: role id, permission id, actor, timestamp. No PIN/password/credential ever logged.

## 14. Security audit (Phase 9, hostile source review)

Grepped the complete diff for `firebase.database`/`set(`/`update(`/`remove(`/`ref(`/`system.admin`/`system.users.manage`/`innerHTML`/`addEventListener`/`catch`/`role`/`archived`/`active`/`PIN`. Findings:

- **No direct Firebase write from any UI file** — `role-management-center.js` and `admin.js` both have zero Firebase imports; all writes route through `role-permission-overrides-store.js`, each gated `isAdmin()` → `isValidRoleOverrideTarget()` → `isValidPermissionId()`.
- **`grantRolePermission`/`revokeRolePermission` are called from exactly one file** (`role-management-center.js`) — confirmed by grep. `admin.js` only imports the read-only `getRolePermissionOverrides`.
- **No user/role/PIN/account-status mutation anywhere in the diff** — grep for `role`/`archived`/`active`/`pin` inside the new store returns only read-only references (`auth.token.role` claim checks) and RTDB `.validate` clauses forbidding those exact fields.
- **All dynamic HTML is escaped** (`esc()` in `role-management-center.js`, `escapeHTML()` in `admin.js`) — verified for `permission.title`/`.description`, the new per-row `note` text, and toast/error messages.
- **No new `addEventListener` calls** — Role Additional reuses `role-management-center.js`'s existing single delegated listener (`onChange`); `admin.js`'s new calls are function invocations inside already-registered handler bodies, not new registrations. No listener-accumulation risk.
- **No swallowed errors** — every `catch` either logs to console and surfaces an inline error, or (one case, mirroring an established, already-audited precedent in `user-permission-overrides-store.js`) is an intentional no-op around an unsubscribe teardown call that cannot meaningfully fail.
- **Protected-permission exposure**: traced the theoretical case of a `system.admin`/`system.users.manage` id somehow present in `roleAdditionalSet` (e.g. a direct-database-console bypass of the RTDB rule) through `systemPermissionRowHtml()` — it renders `disabled` via the `isProtected` branch regardless, and `permission-service.js`'s `NEVER_EFFECTIVE_VIA_OVERRIDE` independently strips it from the effective set. Two independent layers agree; no single point of failure.
- **Cross-user / cross-role leakage**: proven by both the pure runtime matrix (§9 above) and the RTDB emulator's identity-scoped negative tests.
- **Asynchronous role switching**: `role-management-center.js` (`raRequestToken`) and `admin.js` (`raFormRequestToken`) each guard their one-shot loads with a token-AND-identity double check, mirroring the exact race class Individual Permission Assignment's own audit found and fixed for `ipmRequestToken` — applied proactively here, not discovered the hard way a second time.

No findings requiring a fix beyond what's already described in §5 (which was fixed).

## 15. Known limitations

- Role Management's sidebar per-role permission-count badge only reflects Role Additional for whichever role is *currently selected* (already-loaded data) — not all 9 roles simultaneously, to avoid a broad top-level RTDB read. Visiting a role refreshes its own badge.
- The Role Summary panel above User Management's Individual Permissions section (`buildRoleSummary()`'s `permissionCount`) still reflects Base only, not Role Additional — deliberately out of scope (touches `role-summary-model.js`'s shared, role-id-keyed cache, used by Role Management's own detail panel too). The "Efektif" line directly below it is the complete, correct picture.
- `getRolePermissionOverrides()` cannot distinguish a denied/errored read from a genuinely empty record through its return shape alone — same documented, intentional fail-closed tradeoff Individual Permission Assignment already established for its own equivalent function.

## 16. Files changed

**Phase 4, new:**
- `js/permission-management/role-permission-overrides-rules.js`
- `js/permission-management/role-permission-overrides-store.js`
- `js/permission-management/role-permission-provider.js`
- `scripts/role-permission-overrides-rules-check.mjs`
- `scripts/role-permission-runtime-check.mjs`
- `scripts/rtdb-emulator/role-permission-overrides-check.mjs`
- `scripts/role-additional-permission-dom-check.mjs`
- `docs/ROLE_LEVEL_PERMISSION_ASSIGNMENT_PHASE_4_REPORT_v1.30.9.9.md` (this file)

**Phase 4, modified:**
- `database.rules.json`
- `js/permission-service.js`
- `js/app.js` (boot wiring only)
- `js/role-management/role-management-center.js`
- `js/admin.js` (Phase 6 provenance line only)
- `js/config.js` (version bump + history entry)
- `platform.css`
- `scripts/rtdb-emulator/suite-registry.mjs` (registration only)
- `scripts/role-management-dom-check.mjs` (2 assertions narrowed, explained)
- `scripts/role-management-edit-dom-check.mjs` (1 assertion set narrowed, explained)
- `scripts/individual-permission-management-dom-check.mjs` (extended + 1 pre-existing race fixed)

**Pre-existing working-tree changes, explicitly excluded from this phase (not reverted, not further modified):**
- `index.html`, `service-worker.js`, `version.json`
- `js/users.js`
- `docs/CLAUDE_IN_CHROME_*.md` (3 files), `docs/PRODUCTION_DEPLOYMENT_FINAL_REPORT_v1.30.7.9_v1.30.8.md`

**Protected files (untouched, confirmed by grep):**
- `functions/**`
- `verifyPin.js`
- `js/permission-management/user-permission-overrides-rules.js`, `user-permission-overrides-store.js`, `individual-permission-provider.js`
- `config/role-registry.js`, `config/role-permissions.js`, `config/permission-registry.js`
- `role-management/custom-roles-store.js`, `custom-roles-rules.js`, `role-catalog.js`, `role-summary-model.js`, `role-relationships.js`, `role-status.js`, `role-usage-provider.js`, `role-archive-guard.js`, `runtime-role-provider.js`

## 17. Production / Git

**Nothing deployed. Nothing committed. Nothing pushed.** `version.json`/`service-worker.js`/`index.html` cache-bust params untouched — `sync-version.mjs` not run, per instruction (the pre-existing `version.json` vs `config.js#APP_VERSION` mismatch was already present, unrelated to this phase, before this session began; see `smoke-boot.mjs`'s pre-existing failure, unchanged in kind by this phase's version bump).
