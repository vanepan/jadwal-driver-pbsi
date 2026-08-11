# RTDB Collection-Read Defect — Production Incident Fix (v1.30.9.2)

Status: **NOT DEPLOYED. NOT COMMITTED. NOT PUSHED.** Working-tree only.

## 1. Incident

Production "Manajemen User" (User Management) rendered as empty for an
authenticated admin session:

- Total Pengguna = 0, every role count = 0
- List body: "Tidak ada pengguna ditemukan."
- Page shell, search/filter controls, and the rest of the app rendered
  normally — no visible JS crash.

## 2. Live Evidence (as reported)

- Authenticated production user, `role: admin`, valid unexpired token,
  project `schedule-driver-pbsi`.
- `/drivers`, `/vehicles`, `/assignments`, `/driver_requests` — ALLOW.
- `/users` — DENY.
- `/customRoles` — DENY.

This report treats that as a hypothesis to verify, not a given — everything
below it is independently reproduced against the real Firebase RTDB
emulator, not merely inferred from rules text.

## 3. Root Cause

`js/users.js#ensureUsersLoadedAndSubscribed()` calls
`subscribeNode(USERS_PATH, ...)` where `USERS_PATH = 'users'` — a
subscription at the **`/users` collection path itself**.

Before this fix, `database.rules.json` defined `.read` only on the
`/users/$username` **child** path:

```json
"users": {
  "$username": {
    ".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true || auth.uid === $username",
    ".write": "..."
  }
}
```

Root is `".read": "false"`. Firebase Realtime Database evaluates a `.read`
rule at the **exact requested path and its ancestors only** — never at a
descendant. A rule defined solely on `$username` never applies to a read
issued at the parent `/users` path, regardless of the requester's role.
With no `.read` on `/users` itself and a deny-by-default root, the admin
session's own collection subscription was silently denied. `onDenied()`
correctly avoided latching a poisoned cache (existing v1.11.3.3 LOAD/SUB
state-machine contract), so the UI simply rendered its normal empty state
for zero loaded users. This is a real rules gap, not a client bug, and not
a data-loss incident — no evidence anywhere touches `/users` data itself.

### Why the existing test suite didn't catch it

Every prior suite exercising `/users` (`role-claim-rules-check.mjs`,
`users-nodes-full-sweep-check.mjs`) called `ref('users/$username')`
directly — a child-level read, which the child rule genuinely allows for
admin. None called `ref('users')` (the collection path), which is the
actual call `subscribeNode('users', ...)` makes. This was a genuine
test-coverage gap, independent of the rules gap itself.

## 4. Firebase Rules Evaluation (the general mechanism)

RTDB rule cascading is **downward-only**: a `.read: true` at a shallow
path grants access to everything below it, regardless of deeper rules. It
does **not** work in reverse — a `.read` rule written only at a deep path
never "reaches up" to authorize a shallower read request. A collection
read (`ref('users').once('value')` / `.on('value')`) is evaluated against
`.read` at `/`, then `/users` — never at `/users/$username`. This is
documented, standard RTDB behavior, and is the exact shape of this defect.

## 5. Was v1.30.9.1 responsible?

**NO** — re-confirmed. `js/users.js`, `js/app.js`, and `js/firebase.js`
(the entire read path) are untouched by v1.30.9.1. v1.30.9.1's rule
addition (`userPermissionOverrides`) is a sibling node that never touches
`/users`' rule text, and nothing from that phase was ever deployed. Full
detail in `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_1_REPORT_v1.30.9.1.md`.
This defect pre-dates v1.30.9.1 and was simply first noticed while testing
around it.

## 6. `/users` Fix

`database.rules.json` — added one `.read` clause directly on `users`, as a
sibling of the pre-existing (untouched) `$username` child block:

```json
"users": {
  ".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true",
  "$username": {
    ".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true || auth.uid === $username",
    ".write": "auth.token.role === 'admin' || auth.token.adminEquivalent === true || (auth.uid === $username && newData.child('role').val() === data.child('role').val() && newData.child('active').val() === data.child('active').val() && newData.child('archived').val() === data.child('archived').val())"
  }
}
```

Deliberately **admin/adminEquivalent only** — no `self` branch at the
collection level. The collection lists every user account; granting
self-read at that level would let any authenticated user enumerate every
other user's record, a real broadening this phase must not introduce. The
child rule (including the v1.30.7.9 self-role-escalation guard) is
byte-for-byte unchanged.

## 7. `/customRoles` Analysis — Found, NOT Fixed

Investigated per Phase 2's explicit instruction not to copy the `/users`
fix mechanically. Findings:

- `js/role-management/custom-roles-store.js#initCustomRolesStore()` also
  calls `subscribeNode('customRoles', ...)` — a collection-level
  subscribe, structurally identical to `/users`.
- This store is consumed by **two** call sites:
  1. `role-management-center.js` (the admin Role Management UI).
  2. `runtime-role-provider.js#getRuntimeRole()` → `permission-service.js`
     — used for **every session's** Custom Role permission resolution,
     called from `js/app.js`'s boot sequence for every logged-in user, not
     just admins.
- `runtime-role-provider.js`'s own header comment claims the client
  "reads `/customRoles/{id}` directly" — this is **inaccurate** relative
  to the actual implementation, which reads the whole collection via
  `custom-roles-store.js`.
- A real-emulator diagnostic (informational, not added as a permanent
  suite) confirmed: collection-level read of `/customRoles` is DENIED for
  **every** role tested, including admin — broader than the reported
  incident, which only mentioned admin. Child-level reads
  (`customRoles/$roleId`) work correctly for both admin and
  non-admin/authenticated users, matching the existing child rule.

**Why this was not fixed here:** unlike `/users`, the existing child rule
for `/customRoles` deliberately grants read to *any authenticated user*
for *non-archived* records only:

```json
"customRoles": {
  "$roleId": {
    ".read": "auth.token.role === 'admin' || auth.token.role === 'developer' || (auth != null && data.child('archived').val() !== true)"
  },
  ".write": "auth.token.role === 'admin'"
}
```

RTDB rules cannot express a parent-level `.read` that conditionally hides
individual archived children from a collection read — a `.read: true` at
the parent exposes the entire subtree unconditionally. Any static parent
rule here would have to choose between:

- **(a)** granting `auth != null` at the collection level — which would
  expose every archived Custom Role's full permission list to any
  authenticated user, a real broadening beyond the current architecture's
  deliberate boundary (archived roles are currently invisible outside
  admin/developer child reads), or
- **(b)** restricting the parent rule to admin/developer only — which
  would leave the actual broken, in-scope consumer (ordinary users'
  runtime Custom-Role permission resolution) still broken.

This is exactly the ambiguity the phase's STOP conditions call out
("any ambiguity exists about whether a collection should be
publicly/broadly readable"). Per instruction, **reported, not solved.**
See Remaining Risks (§12) for the recommended follow-up.

## 8. Files Changed

- `database.rules.json` — one `.read` clause added to `users` (§6). No
  other rule text touched.
- `js/config.js` — `APP_VERSION`/`RELEASE_NAME` bumped to 1.30.9.2, one
  new `VERSION_HISTORY` entry. No other change.
- `scripts/rtdb-emulator/users-collection-read-check.mjs` — new, 15
  checks (§10).
- `scripts/rtdb-emulator/suite-registry.mjs` — registers the new suite.

Not touched: `version.json`, `service-worker.js`, `index.html`,
`js/users.js`, `js/app.js`, `js/permission-service.js`,
`js/role-management/*`, `js/admin.js`, `js/firebase.js`. No
`sync-version.mjs` run.

## 9. Security Impact

- **No broadening beyond admin/adminEquivalent** for `/users` collection
  reads. Viewer, bidang, driver, self, and unauthenticated all remain
  denied at the collection level (verified).
- **No change** to `/users/$username` child read/write semantics.
- **No change** to the v1.30.7.9 self-role-escalation guard
  (role/active/archived still pinned on any non-admin self-write).
- **No change** to `/customRoles` (deliberately deferred, §7).
- **No change** to `/userPermissionOverrides` (v1.30.9.1, untouched).

## 10. Regression Matrix

New suite `users-collection-read-check.mjs` (15 checks):

| # | Assertion | Result |
|---|---|---|
| 1 | admin → `/users` collection read | ALLOW |
| 2 | adminEquivalent → `/users` collection read | ALLOW |
| 3 | admin collection read returns actual seeded data | confirmed |
| 4 | viewer → `/users` collection read | DENY |
| 5 | bidang → `/users` collection read | DENY |
| 6 | driver → `/users` collection read | DENY |
| 7 | self (alice) → `/users` collection read | DENY |
| 8 | unauthenticated → `/users` collection read | DENY |
| 9 | self → own `/users/$username` child read | ALLOW (unchanged) |
| 10 | self → other's `/users/$username` child read | DENY (unchanged) |
| 11 | admin → any `/users/$username` child read | ALLOW (unchanged) |
| 12 | self-write own `role` to `admin` | DENY (unchanged) |
| 13 | self-write own `active` | DENY (unchanged) |
| 14 | self-write own `archived` | DENY (unchanged) |
| 15 | self-write own `displayName` | ALLOW (unchanged) |

## 11. Emulator Results

**BEFORE fix** (unmodified rules, real emulator): new suite — **12
passed, 3 failed**, failing exactly checks #1, #2, #3 above (the
incident, empirically reproduced). All 15 pre-existing suites: unaffected,
green.

**AFTER fix** (real emulator): new suite — **15 passed, 0 failed**. Full
suite: **16/16 suites executed, 390/390 checks passed, 0 failures.**
(Baseline was 375/375 across 15 suites; +15 from this phase's new suite.)

`/customRoles` diagnostic (informational, not a permanent suite, not
retained): confirmed collection-level DENY for admin and non-admin alike,
child-level reads working as designed. Not part of the pass/fail gate.

## 12. Deployment Status

**NOT DEPLOYED.** `database.rules.json` and `js/config.js` are
working-tree changes only. Production Firebase Rules are unchanged from
whatever was last actually published — this fix has no live effect until
an explicit `firebase deploy --only database` (and separately, a static
redeploy for `js/config.js`) is authorized and run.

## 13. Remaining Risks

1. **`/customRoles` has the same structural defect, live in production
   right now, and it is broader than `/users`:** it affects every user
   with a Custom Role assigned (their runtime permission resolution
   silently returns nothing for that role), not just the admin Role
   Management screen. Recommended follow-up: the mirror-node strategy
   `runtime-role-provider.js` already anticipates in its own "FUTURE"
   comment — a minimal, broadly-readable `roleRuntime/{id}: {
   permissions: [...] }` node kept in sync by a Cloud Function trigger on
   `customRoles` writes, so archived-role exposure never becomes a
   collection-level concern. This needs its own explicit authorization
   and scoping — not started here.
2. **`runtime-role-provider.js`'s header comment is factually wrong**
   about reading `/customRoles/{id}` directly; it actually reads the
   collection via `custom-roles-store.js`. Worth a doc correction
   alongside whatever fixes §13.1, so the next reader isn't misled the
   way this comment could have misled this investigation.
3. This fix has not been verified against live production — only against
   a real local RTDB emulator loaded with the same rules text. Deployment
   is the only way to close the loop on the original incident report
   fully; that is an explicit separate decision, not implied by this
   report.

## 14. Recommendation

Deploy the `/users` rule fix once reviewed — it is narrow, additive, and
fully regression-tested. Treat `/customRoles` as its own follow-up item
requiring a real architectural decision (mirror node vs. accepting
broader read exposure), not a copy-paste of this fix.

---

## v1.30.9.2 RESULT

- Root cause: `/users` had `.read` only on the `$username` child path;
  `js/users.js` subscribes at the `/users` collection path; RTDB never
  applies a child-only rule to a parent-scoped read; root is deny-by-default.
- `/users` fix: added `.read` (admin/adminEquivalent only) directly on
  `users` in `database.rules.json`, sibling to the untouched `$username`
  child block.
- `/customRoles` decision: same structural gap confirmed via real
  emulator (broader — denies every role, not just admin), correct fix is
  ambiguous (would either leak archived role data or leave the real
  consumer broken) — **reported, not fixed**, per explicit STOP condition.
- Files changed: `database.rules.json`, `js/config.js`,
  `scripts/rtdb-emulator/users-collection-read-check.mjs` (new),
  `scripts/rtdb-emulator/suite-registry.mjs`.
- New tests: 15 (`users-collection-read-check.mjs`).
- Full regression: 16/16 suites, 390/390 checks, 0 failures.
- Emulator result: BEFORE — 12/15 new-suite checks passed (3 failures =
  the incident, reproduced). AFTER — 15/15 new-suite checks passed, full
  suite clean.
- Production changed: NO
- Firebase deploy: NO
- Commit: NO
- Push: NO
