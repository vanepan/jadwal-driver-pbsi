# Permission Runtime Migration, Sub-phase B — v1.30.6

**Project:** Administration Platform, Phase 7
**Status:** Code complete, verified, **not deployed**. Custom Role assignment
remains disabled (`js/admin.js#refreshCustomRoleOptions()`) — that unlock is
deliberately deferred until this phase's changes are deployed and verified
against production, per the plan's sequencing.

---

## 1. Security Investigation

Traced the full chain before writing any code: PIN Login → Firebase Custom
Token → JWT Claims → Firebase Auth → Realtime Database Rules → Client
Runtime.

| Concern | Finding |
|---|---|
| Token minting | `functions/src/auth/verifyPin.js` is the **only** function that ever mints an auth token — confirmed via `functions/index.js`'s full export list; no other function calls `createCustomToken`/`setCustomUserClaims`. |
| Role claim vocabulary | `VALID_ROLES` = 6 legacy strings. Anything else silently downgrades to `'viewer'` at mint time. |
| `'developer'` role | Referenced in ~40 `database.rules.json` clauses but **unreachable** — no code path in this repo can ever mint it. Confirmed again this session; left untouched, flagged to the team. |
| RTDB rule shape | Every existing elevated-tier rule is one of exactly two shapes: `admin`-or-`developer` (read tiers) or `admin`-only (write tiers). No rule differentiates "admin for petty cash" from "admin for warehouse" — a single blanket tier. This is why one boolean claim (`adminEquivalent`) is the correct granularity; a finer scheme would be unconsumed by anything today. |
| Custom-token claim persistence | `js/auth.js#_hydrateFromFirebaseUser()` already reads `role` from `getIdTokenResult().claims` on every reload — proven, shipped, working behavior since v1.11.1.2. Claims minted via `createCustomToken()` reliably survive the SDK's silent ID-token refresh for the life of a sign-in session. They do **not** live-update mid-session (fixed at mint/login time) — a real property of the mechanism, not a bug. |
| **RTDB root cascade (material finding)** | `database.rules.json`'s root is `".read": "auth != null"` / `".write": "auth != null"`. RTDB rules cascade top-down and a grant at a shallower path cannot be revoked deeper, so the root already grants every authenticated user read **and write** on the entire database. Every per-node role rule below root — including this phase's own `adminEquivalent` additions — is **advisory**, not actually reached by Firebase's rule evaluator. This is a pre-existing condition (confirmed against a prior-session memory note), not introduced or worsened by this phase. See §5 (Security Review) for the full implication. |

## 2. Architecture Report

```
PIN Login
  → verifyPin.js: read /users/{username}, verify PIN
  → resolveRoleClaims(user.role)
      legacy role  → {role, extraClaims: {}}              (unchanged fast path)
      Custom Role  → {role: customRoleId, extraClaims: {adminEquivalent: true?}}
      unresolvable → {role: 'viewer', extraClaims: {}}
  → createCustomToken(username, {role, ...extraClaims})
  → client: signInWithCustomToken()
  → getIdTokenResult().claims  →  role (+ adminEquivalent, RTDB-only)
  → js/permission-service.js#can(permission)
      System Role   → static ROLE_PERMISSIONS lookup (cached)
      Custom Role   → runtime-role-provider.js#getRuntimeRole(roleId)
  → js/app.js#canAccessModule() / navigation cluster (v1.30.5)
  → database.rules.json (advisory today — see §1/§5)
```

## 3. Authentication Flow

`functions/src/auth/verifyPin.js` — PIN verification (username/PIN format,
user lookup, active/archived/PIN match) is **byte-for-byte unchanged**. The
only new code is `resolveRoleClaims(storedRole)`, inserted between the PIN
check and token minting:

- **Legacy role** (in `VALID_ROLES`): identical to pre-v1.30.6 — no extra
  read, no extra claim.
- **Custom Role**: one Admin-SDK read of `customRoles/{storedRole}`. Found +
  not archived → mints that role id verbatim, plus `adminEquivalent: true`
  iff its `permissions[]` includes `'system.admin'`. Not found, archived, or
  the read itself errors → downgrades to `'viewer'` (same fail-safe default
  as before).
- **Archived role behavior**: fails closed to `'viewer'` — an archived
  Custom Role can never mint its own claim again.
- **Unknown role behavior**: fails closed to `'viewer'` — unchanged default.

## 4. JWT Claim Design

One new claim: **`adminEquivalent`** (boolean, present only when `true` —
never minted as `false`, so its mere absence is the deny case). Named
explicitly per prior review feedback, rejecting a more generic name
(`elevated`) that would grow ambiguous as more administrative tiers
eventually appear — `adminEquivalent` states exactly what it grants.

No permission set, bitmask, or role list is embedded in the token. That
strategy was evaluated and rejected (see §5) because claims freeze at
mint/login time — a Custom Role's permissions could only ever be as fresh as
the holder's last login, which conflicts with "fully operational."

## 5. Database Rule Strategy (includes Security Review)

**Re-evaluated from scratch**, per instruction not to reuse v1.30.5's draft
recommendation without re-checking it against the code as it exists now:

| # | Strategy | Verdict this session |
|---|---|---|
| 1. Widen `customRoles` RTDB read | **Adopted.** `permission-service.js`'s Custom Role fallback already reads exactly this store, already wired, already covered by 81 (now 104) passing checks. Costs one rules-file change, zero code changes. |
| 2. Callable Cloud Function | Rejected. `can()`/`listPermissions()` are real, synchronous, and called from dozens of live `js/app.js` sites now — retrofitting an async pre-fetch gate is *more* invasive today than when this was hypothetical. |
| 3. JWT bitmask claim | Rejected. Confirmed (not just suspected) to go stale until next login. Would also need a shadow numeric-id map to avoid touching the protected Permission Registry. |
| 4. Mirrored node via Cloud Function trigger | Rejected as primary — got *more* expensive since Strategy 1 is already live: adopting it now means forking or discarding an already-shipped, already-tested fallback. Kept as the documented future path (see `runtime-role-provider.js`'s "Future Runtime Architecture"). |

**Adopted design**, scoped tighter than the original draft using a real RTDB
capability (per-child rules) already used elsewhere in this exact file:

```json
"customRoles": {
  "$roleId": {
    ".read": "auth.token.role === 'admin' || auth.token.role === 'developer' || (auth != null && !data.child('archived').val())"
  },
  ".write": "auth.token.role === 'admin'"
}
```

Any authenticated user can read a **non-archived** Custom Role record;
archived records and all writes stay admin/developer-only, unchanged. Every
other elevated-tier rule (`events`, `notifications`, `pettyCash*`,
`overtime*`, `v2_sarpras`, `gudang`) gained one additive
`|| auth.token.adminEquivalent === true` clause. `engineering/*` and every
`'developer'` reference are untouched.

**Why safe**: every change to an existing rule is additive-OR only (nothing
that passed before can now fail); the one non-additive change (`customRoles`
read) only ever *narrows* admin/developer's implicit full-node access down
to "still full" while *adding* non-archived visibility to other authenticated
users — a net-neutral-or-tighter change for the privileged tier, and a
narrow, justified widening for everyone else (Custom Role definitions are
role/permission metadata, not secrets; the System Role matrix, far more
comprehensive, already ships unauthenticated in the public JS bundle).

**Why preferable**: reuses already-shipped, already-tested client code with
zero new Cloud Function surface; matches this file's own existing
conventions (per-child rules already appear in `engineering/assignments`).

**Attack surface**: unchanged in practice. See the root-cascade finding
above — every node in this database, this rule included, is already
reachable by any authenticated user via the root grant. This phase's rule
changes add no new attack surface at the RTDB layer that didn't already
exist; they are forward-compatible hardening for the day root is tightened,
not a new restriction today. The `adminEquivalent` claim itself cannot be
forged client-side — it is only ever minted server-side in
`verifyPin.js`, gated on a real `customRoles` record actually granting
`system.admin`.

**Rollback strategy**: see §9.

## 6. Runtime Role Provider (requested during plan review)

`js/permission-service.js` no longer imports `custom-roles-store.js` (or any
concrete storage) directly. New `js/role-management/runtime-role-provider.js`
exposes exactly two functions — `initRuntimeRoleProvider()` and
`getRuntimeRole(roleId)` — backed today by `custom-roles-store.js` with zero
behavior change. `js/app.js`'s every-session provider-init call (added in
v1.30.5) now goes through this abstraction; `navManajemenUser()`'s own
Role-Management-motivated store call stays direct, since that surface
legitimately owns the concrete implementation.

**Future Runtime Architecture**: if `customRoles`'s read exposure is ever
judged too broad, the migration path is a Cloud Function trigger mirroring
`customRoles/{id}` into a minimal `roleRuntime/{id}: {permissions}` node
(no name/metadata/lineage), a new `role-runtime-store.js` reading it, and a
swap of `runtime-role-provider.js`'s two function bodies. Neither
`permission-service.js` nor `app.js`'s boot sequence would change.

## 7. Files Changed

**Added**: `js/role-management/runtime-role-provider.js`,
`scripts/verify-pin-role-resolution-check.mjs`,
`docs/PERMISSION_RUNTIME_MIGRATION_REPORT_v1.30.6.md` (this file).

**Changed**: `functions/src/auth/verifyPin.js` (`resolveRoleClaims()` +
claim minting), `database.rules.json` (additive `adminEquivalent` clauses +
scoped `customRoles` read), `js/users.js` (`isValidRole()` delegates to
`role-catalog.js#getAllRoles()`), `js/permission-service.js` (imports the
provider instead of the store), `js/app.js` (one call site: provider-init
instead of direct store-init), `js/config.js` (this entry).

**Explicitly zero changes**: `config/permission-registry.js`,
`config/role-permissions.js`, `config/role-registry.js`,
`js/role-management/role-summary-model.js`, `js/admin.js`, PIN verification
logic itself, `engineering/*` RTDB rules, any Warehouse/Vehicle/Driver/
Engineering/Executive business logic.

## 8. Testing Summary / Regression Summary

- New `scripts/verify-pin-role-resolution-check.mjs` (23 checks, pure Node —
  `verifyPin.js` cannot be `require`d outside the Functions runtime since it
  calls `admin.initializeApp()` at module load, so this mirrors
  `resolveRoleClaims()`'s exact algorithm, the same convention this
  codebase's other Firebase-touching-file checks already use): legacy fast
  path unchanged for all 6 roles, fast path never shadowed by a same-named
  Custom Role fixture, active Custom Role with/without `system.admin`,
  archived Custom Role fails closed even if it holds `system.admin`,
  unknown role id fails closed, malformed record never throws.
- Full pre-existing suite re-run **through the new provider indirection**:
  `permission-service-check.mjs` (62), `canAccessModule-check.mjs` (5),
  `permission-runtime-invariant-check.mjs` (14, Puppeteer, real wired code —
  proves `permission-service.js` → `runtime-role-provider.js` →
  `custom-roles-store.js` still resolves identically to Role Management's
  own Role Summary computation).
- **Total: 104 passing checks, 0 failing.**
- `database.rules.json` diff hand-verified clause-by-clause against the
  pre-migration file (`git diff`): every existing OR-branch present and
  unmodified; only additive clauses and the one documented `customRoles`
  read restructure; `engineering/*` absent from the diff entirely (untouched,
  confirmed).
- Deploy-time testing (login as each legacy role; create a disposable test
  Custom Role with/without `system.admin`) is **not yet performed** — this
  requires the separate deploy go-ahead per the plan's constraint.

## 9. Rollback Plan

- Both `verifyPin.js` and `database.rules.json` changes are pure git diffs
  with no data migration or backfill. `git revert` + redeploy
  (`firebase deploy --only functions:verifyPin` /
  `firebase deploy --only database`) restores prior behavior exactly.
- Safe to revert at any point before Custom Role assignment is re-enabled
  (`js/admin.js`'s own step, not yet done): no real user can hold a Custom
  Role today, so reverting has zero user-facing impact.
- If assignment were later re-enabled and reverted after: the affected
  user's role simply stops being re-selectable in the picker; their existing
  session continues under whatever token was already minted until next
  login. No crash, no data loss, no irreversible schema change anywhere in
  this phase.

## 10. Performance Report

- Legacy fast path: zero added latency (no new read, no new computation).
- Custom Role fallback: exactly one additional Admin-SDK read
  (`customRoles/{role}`), only on the rare non-legacy-role login path.
- Client-side: `runtime-role-provider.js` adds one function-call layer of
  indirection over what was already a synchronous, already-cached local
  read (`custom-roles-store.js`'s live subscription cache) — no new Firebase
  reads, no measurable overhead versus v1.30.5.
