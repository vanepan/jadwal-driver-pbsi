# Individual Permission Assignment — Phase 1 Report (v1.30.9.1)
## Storage & Security Foundation

**Status: IMPLEMENTED, TESTED, NOT DEPLOYED, NOT COMMITTED.** Scope held
exactly to Phase 1 (storage + RTDB security only) — no runtime
resolution, no UI, no login-claim changes, per the master prompt's own
explicit boundary.

---

## 1. Objective

Build the minimum, isolated, fail-closed storage layer for individual
(per-user) permission grants — `/userPermissionOverrides/{username}` —
so that a later, separately-authorized phase can wire it into
`permission-service.js`'s runtime resolution. This phase does not
change what any existing user can do.

## 2. Existing architecture inspected

Before writing anything: `js/config/permission-registry.js` (50
permissions, `getPermission(id)`), `js/config/role-registry.js`,
`js/config/role-permissions.js`, `js/permission-service.js`,
`js/role-management/runtime-role-provider.js`, `js/users.js`
(`normalizeUsername()` — not exported, mirrored locally per the same
pattern `functions/src/auth/verifyPin.js` already uses for the identical
reason), `functions/src/auth/verifyPin.js` (confirms `auth.uid` ===
normalized `username`, verbatim, minted via `auth.createCustomToken(username, ...)`),
`database.rules.json` (the `/users`, `/customRoles` rule idioms — the
`auth.token.role === 'admin' || auth.token.adminEquivalent === true`
pair confirmed as this file's universal admin-tier idiom), the
`scripts/rtdb-emulator/` harness + `suite-registry.mjs`, and this
session's own `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_ARCHITECTURE_AUDIT_v1.30.9.md`.

**Answering the mandatory pre-code questions:**
1. Exact permission ID format: dot-notation strings (e.g.
   `warehouse.item.edit`), 50 registered today, `getPermission(id)` is
   the authoritative lookup.
2. Exact username key format: `^[a-z0-9._-]{3,30}$` after
   `normalizeUsername()` (trim → lowercase → spaces→dashes).
3. Username is always the auth UID: **confirmed** —
   `auth.createCustomToken(username, ...)` mints the token with the
   normalized username AS the uid; every existing rule's
   `auth.uid === $username` pattern relies on this being exact.
4. Whether user IDs may contain RTDB-key-problematic characters: the
   username regex technically permits `.`, which IS an illegal RTDB key
   character — a pre-existing latent inconsistency on `/users` itself,
   not introduced by this phase and out of scope to fix here (flagged,
   not silently ignored).
5. Current admin/adminEquivalent idiom: `auth.token.role === 'admin' ||
   auth.token.adminEquivalent === true` — used verbatim, not a new
   variant.
6. Existing reusable `.validate` patterns: `hasChildren([...])`,
   per-child wildcard `.validate`, `!hasChild('field')` negation checks
   — all already used elsewhere in `database.rules.json`; this phase
   reuses the same idioms rather than inventing new ones.

## 3. Final storage schema

```
/userPermissionOverrides/{username}: {
  permissions: string[],   // e.g. ["pettycash.view", "analytics.view"]
  updatedAt: string        // ISO 8601, stamped on every write
}
```

**This is NOT the shape the master prompt's own draft suggested**
(`{permissions: {"id": true}}`), and that deviation is the single most
important finding of this phase (§13). No `role`, `adminEquivalent`,
`system.admin`-as-a-grant, credential field, or `active`/`archived`
field may ever appear on this record — enforced at both the application
layer and the RTDB rule, independently.

## 4. Read authorization

```
".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true || auth.uid === $username"
```

Admin, adminEquivalent, or the record's own subject. Chosen because a
future runtime-resolution phase (per the architecture audit's own
recommendation, §12) will need the subject's own client session to read
their own overrides for a live-cache pattern identical to how Custom
Roles already work — establishing this now avoids a rules change later.
No broad authenticated read, no public read.

## 5. Write authorization

```
".write": "auth.token.role === 'admin' || auth.token.adminEquivalent === true"
```

**No self-write clause at all** — deliberately, unconditionally
stricter than `/users`. There is no legitimate self-write use case for
one's own authorization data (unlike `/users`, where self-write exists
for genuinely unrelated profile fields like Telegram chat ID). This is
the direct, structural answer to Section 5/15's mandatory requirement:
a normal user cannot write their own override record, full stop —
proven against the real emulator, not merely asserted.

## 6. Validation rules

```json
".validate": "newData.hasChildren(['permissions']) && !newData.hasChild('role') && !newData.hasChild('adminEquivalent') && !newData.hasChild('pin') && !newData.hasChild('pinHash') && !newData.hasChild('active') && !newData.hasChild('archived')",
"permissions": {
  "$index": {
    ".validate": "newData.isString() && newData.val() !== 'system.admin'"
  }
},
"updatedAt": {
  ".validate": "newData.isString()"
}
```

- `permissions` must be present (a record can't exist with zero grants —
  matches the "absent record == empty override" equivalence the future
  runtime layer will rely on).
- Every element must be a string and must not be the literal
  `"system.admin"` — checked per-array-element via the `$index`
  wildcard, so `["harmless.permission", "system.admin"]` is rejected
  just as completely as `["system.admin"]` alone (proven by a dedicated
  test, not assumed).
- The six forbidden top-level fields are rejected outright.
- **Deliberately NOT enforced at the rules layer**: full Permission
  Registry membership (i.e., the rule does not reject
  `"totally.made.up.permission"`) — see §13 for the reasoning.

## 7. Admin/adminEquivalent behavior

Unchanged, not touched, not extended. This phase's storage layer is
never read by `verifyPin.js#resolveRoleClaims()` (the only place
`adminEquivalent` is minted) — structurally impossible for an override
to influence it, not merely a policy choice. The RTDB rule additionally
forbids `system.admin` as a storable grant even for an admin writer, as
defense-in-depth beyond that structural guarantee.

## 8. Permission Registry validation

Enforced at the **application layer** only
(`user-permission-overrides-rules.js#isValidPermissionId()`, checked
against the real `permission-registry.js#getPermission()`), not
duplicated into `database.rules.json`. This is a deliberate,
documented tradeoff, not an oversight — see §13/§15 (Known Limitations)
for the full reasoning and what it does and doesn't mean for security.

## 9. Files changed

| File | Change |
|---|---|
| `database.rules.json` | +1 new node (`userPermissionOverrides`), nothing else touched |
| `scripts/rtdb-emulator/suite-registry.mjs` | +1 line registering the new suite |
| `js/config.js` | `APP_VERSION`/`RELEASE_NAME` bump, +1 `VERSION_HISTORY` entry |

## 10. Files added

| File | Purpose |
|---|---|
| `js/permission-management/user-permission-overrides-rules.js` | PURE validation/normalization logic, Node-loadable |
| `js/permission-management/user-permission-overrides-store.js` | Firebase-backed read/write abstraction |
| `scripts/user-permission-overrides-rules-check.mjs` | 47 pure-logic checks |
| `scripts/rtdb-emulator/user-permission-overrides-check.mjs` | 28 real-emulator checks |
| `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_1_REPORT_v1.30.9.1.md` | this file |

## 11. Files deliberately untouched

`permission-service.js`, `runtime-role-provider.js`, every
`role-management/*` file, `js/users.js`, `js/admin.js`,
`functions/src/auth/verifyPin.js`, `functions/src/**` generally, every
other RTDB node, `credentialService.js`, `version.json` /
`service-worker.js` / `index.html` (no `sync-version.mjs` run).

## 12. Test matrix

**Pure logic** (`node scripts/user-permission-overrides-rules-check.mjs`):
**47/47 passing.** Covers: dangerous-id detection, real-registry
membership (every one of the 50 registered permissions checked
individually, confirming `system.admin` is the one and only rejected
entry), well-formedness (including RTDB's own list-like object read-back
shape, duplicate detection, all 6 forbidden fields individually),
fail-closed normalization of malformed/malicious payloads, and the
grant/revoke update builders (additive, idempotent, throws on invalid
input rather than silently no-opping).

**RTDB emulator** (`npm run test:rtdb-emulator`):
**28/28 passing** in the new suite; **375/375 across all 15 registered
suites**, two consecutive clean runs. Read (5): admin/adminEquivalent/
self allowed, unrelated-user/unauthenticated denied. Write-who (5):
admin/adminEquivalent allowed; viewer/driver/bidang denied. Mandatory
self-write negatives (3, per explicit instruction): self-write of a
harmless permission denied, self-write of `system.admin` denied,
cross-user write denied. Content validation (13): `system.admin` denied
alone and alongside a harmless permission in the same array (every
element checked, not just the first), each of the 6 forbidden fields
denied individually, non-string array elements (number, boolean)
denied, a record with no `permissions` field denied, a well-formed grant
allowed (control case), a delete (null write) allowed. Documented
boundary case (1): an unregistered-but-not-dangerous permission id is
ALLOWED at the rules layer — proven, not assumed, and explained in §13.

**Broader regression** (Section 21's explicit requirement):
`role-management-check` 38, `role-status-check` 14,
`role-relationships-check` 26, `role-usage-provider-check` 14,
`role-archive-guard-check` 10, `role-summary-model-check` 19,
`custom-roles-check` 29, `permission-service-check` 62,
`canAccessModule-check` 5, `verify-pin-role-resolution-check` 23,
`users-role-assignment-check` 16 — **all 256 passing, 0 regressions.**

**Grand total this phase: 706 checks (47 + 28 + 375 + 256), 0 failures.**

## 13. Security findings

**The one real, non-hypothetical defect found and fixed DURING this
phase's own build** (not merely anticipated): the first storage-schema
draft used `permissions: {"warehouse.item.edit": true}` — a permission-
id-keyed object — reasoned to be the more rules-friendly shape (each key
individually `.validate`-able). The **real Firebase client SDK rejected
this write outright** the moment the emulator suite actually attempted
it: `"Keys... can't contain '.', '#', '$', '/', '[', or ']'"`. Every
permission id in this app is dot-notation. This was caught by the
emulator, not by reading the rule text — exactly the class of gap this
program's own established discipline (real-engine testing over
structural assertion) exists to close. **Fixed**: redesigned to
`permissions: string[]`, verified against the real engine to work
correctly for every test in the matrix above. This is not a new pattern
invented for this feature — it is the exact shape
`/customRoles/{id}.permissions` already uses successfully in production.

**Deliberate, documented tradeoff — full Permission Registry membership
is NOT enforced at the RTDB rules layer.** The master prompt's own
Section 4 explicitly steers toward this: *"Do not duplicate the entire
Permission Registry into the RTDB rules unless the current architecture
requires it."* Enforcing "is this exact string one of the 50 registered
ids" at the rules layer would require either hardcoding all 50 (a
50-entry OR-chain, a real maintenance burden every time a permission is
added anywhere in the app) or mirroring the registry into a second RTDB
node purely to `root.child(...)`-check against — both materially larger
than this phase's own "small, additive, isolated" mandate. **Why this is
still safe**: the write gate is already the strongest possible boundary
— only admin/adminEquivalent can write to this node AT ALL, regardless
of content. An unregistered id slipping through is a *data-quality*
concern (an admin's typo), not a *security* concern — no consumer will
ever recognize an unregistered id as valid (the entire rest of this
codebase's "unknown permission id denies by default" convention already
guarantees this, confirmed FACT in the architecture audit). The
DANGEROUS case — `system.admin` specifically — **is** enforced at the
rules layer, because that one is not a data-quality question, it's the
one hard security boundary (§8's own explicit non-negotiable). This
asymmetry (one denylisted id enforced structurally; the other 49 valid
ids' membership enforced only at the application layer) is intentional,
proven via the test matrix's own explicit "documented boundary" case,
not an inconsistency.

**No existing security boundary was touched, weakened, or reinterpreted.**
`/users`' rule (including the v1.30.7.9 self-write fix), `/customRoles`,
every other node, `permission-service.js`, `verifyPin.js`, and
`adminEquivalent` semantics are all byte-for-byte unchanged.

## 14. Performance considerations

No live subscription in this phase — `getUserPermissionOverrides()` is a
one-shot `readNode()` call, since Phase 1 has no consumer that would
benefit from a live cache. Expected record count: a minority of the 32
current production users (this is an exception-based, opt-in mechanism
by its own stated design). Deferred, not forgotten: Phase 2's runtime
consumer will need the live-subscription pattern
`custom-roles-store.js` already establishes — not built here because
nothing in Phase 1 reads this data on a hot path.

## 15. Known limitations

1. Full Permission Registry membership is not enforced at the RTDB rules
   layer (§13) — an admin with a compromised or scripted session could
   in principle write an unregistered garbage string, harmlessly (no
   consumer would ever honor it).
2. The pre-existing `.` character allowed by the username regex (§2,
   item 4) is a latent RTDB-key inconsistency this phase inherits from
   `/users` — not introduced, not fixed, flagged for whoever eventually
   owns that regex.
3. No audit-trail wiring yet (`logAction()` integration is explicitly
   Phase 4 territory per the architecture audit's own phasing, §20/§26
   of that document) — Phase 1 has no admin-facing UI that would trigger
   a loggable action in the first place.
4. No live subscription (§14) — acceptable for Phase 1, will need
   revisiting the moment Phase 2 adds a runtime consumer.

## 16. Next-phase prerequisites

Per the architecture audit's own recommended phasing (§26 of that
document), the next proposed step is **v1.30.9.2 — Individual Permission
Runtime Resolution**: a new `individual-permission-provider.js` mirroring
`runtime-role-provider.js`'s exact shape, plus `permission-service.js`'s
additive union (`base ∪ overrides`), with the mandatory backward-
compatibility invariant (every existing user's effective permissions
byte-identical when no override record exists) as the very first test
written. **Not started, not auto-continued, per explicit instruction.**

---

## Final Report

```
STATUS:
v1.30.9.1 — PASS

STORAGE:
PASS

SECURITY:
PASS

VALIDATION:
PASS

REGRESSION:
PASS

FILES CHANGED:
database.rules.json
scripts/rtdb-emulator/suite-registry.mjs
js/config.js

FILES ADDED:
js/permission-management/user-permission-overrides-rules.js
js/permission-management/user-permission-overrides-store.js
scripts/user-permission-overrides-rules-check.mjs
scripts/rtdb-emulator/user-permission-overrides-check.mjs
docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_1_REPORT_v1.30.9.1.md

FILES UNTOUCHED:
permission-service.js, runtime-role-provider.js, every role-management/*
file, js/users.js, js/admin.js, functions/src/auth/verifyPin.js,
functions/src/** generally, every other RTDB node, credentialService.js,
version.json, service-worker.js, index.html

TESTS:
706/706 (47 pure-logic + 28 new RTDB emulator + 375 full RTDB emulator
suite + 256 broader Role Management/Permission Service/User Management
regression)

DEPLOYMENT:
NOT DEPLOYED

COMMIT:
NOT COMMITTED — awaiting explicit instruction after review

PUSH:
NOT PUSHED
```
