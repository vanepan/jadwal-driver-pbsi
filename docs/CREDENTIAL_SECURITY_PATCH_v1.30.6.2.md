# Emergency Credential Security Patch — v1.30.6.2

**Project:** Security (out-of-roadmap, P0)
**Status:** Code complete, verified, **not deployed**.

---

## 1. Security Investigation

`docs/RTDB_SECURITY_MODEL_AUDIT_v1.30.6.1.md`'s top finding: `/users/{username}.pin`
stored in plaintext, checked via `user.pin === pin`, with `/users` having
no RTDB node-specific rule — so, combined with the root-cascade finding
from that same audit, any authenticated user of any role could read every
account's plaintext PIN via the Firebase client SDK.

Full credential lifecycle traced before writing any code:

| Stage | Location (pre-patch) | Finding |
|---|---|---|
| Format validation | `js/users.js#isValidPin()` | Regex only, no security concern — unchanged |
| Creation | `js/admin.js` form → `js/users.js#createUser()` | Plaintext `pin` written via direct client RTDB write, no server involved |
| Admin update/reset | same form / "Reset PIN" action → `updateUser()` | Plaintext write; reset additionally generated the new PIN client-side (`Math.random()`) |
| Self-service change | `js/admin.js#handleProfileSubmit()` | Client-side plaintext `user.pin !== currentPin` compare against the already-cached `users` array |
| Display leak #1 | `js/admin.js#openUserFormModal()` | Edit form pre-filled the CURRENT plaintext PIN into the input |
| Display leak #2 | `js/admin.js#renderUserCard()` (legacy list) | `PIN: ${user.pin}` rendered directly in every card |
| Verification | `functions/src/auth/verifyPin.js` | Plain string equality, server-side |
| **Amplifier** | `js/users.js#ensureUsersLoadedAndSubscribed()`, unconditional for every authenticated session | Every logged-in user of any role already has every account's plaintext PIN in browser memory as a side effect of normal operation — no devtools Firebase knowledge needed, just inspecting already-loaded state |
| Export / logs | searched broadly | **None found** — no export path or `logAction()` call ever received a PIN value |

**Residual risk, reported honestly, not solved here**: a 4-digit PIN has
10,000 possible values. Hashing converts "instant, bulk, zero-effort
exposure" into "an attacker with one stolen hash must brute-force up to
10,000 guesses for that account" — real, large improvement, not
brute-force-proof. Rate-limiting `verifyPin` and/or longer PINs are
separate, legitimate follow-ups, explicitly out of this patch's scope.

## 2. Hashing Strategy

**Chosen: `crypto.scrypt`, Node's built-in memory-hard KDF.**

| Option | Verdict |
|---|---|
| bcrypt (npm) | Rejected — native compilation (node-gyp), a real deployment-risk variable for an emergency patch |
| Argon2 (npm) | Rejected — same native-binding risk, not already in this stack |
| **scrypt (Node core)** | **Adopted** — zero new dependencies, memory-hard, guaranteed to work anywhere this Node 20 Cloud Functions runtime does |

Cost parameters are Node's own documented password-hashing defaults
(N=16384, r=8, p=1) — not hand-tuned. Stored format is self-describing —
`scrypt:N:r:p:<saltHex>:<hashHex>` — so a future cost retune never
invalidates existing hashes (verification always uses the parameters
embedded in the stored string, confirmed by test).

## 3. Migration Strategy

Dual-field, lazy, triggered at any point a plaintext PIN is proven known:

- `pinHash` present → hash-path verify.
- `pin` present, no `pinHash` → legacy-path verify (old `===` check); **on
  success only**, immediately hash and overwrite: `{pinHash: <hash>, pin: null}`
  in the same write.
- Triggered by both **login** (`verifyPin.js`) and **self-service PIN
  change** (`changeMyCredential`) — proving the current PIN is the same
  proof-of-knowledge event either way.
- All new writes (new user, admin reset, self-service change) are
  hash-only from the start — a brand-new account never has a `pin` field.
- **Future plaintext removal** (not done now): once no record has a `pin`
  field, delete `pinHash.js#verifyLegacyPlaintext()` and its one call site
  in `credentialService.js#verifyCredential()` — no redesign, a function
  and a branch.

## 4. Credential Lifecycle (after this patch)

```
Admin types PIN in form
        │
        ▼
js/users.js#createUser()/updateUser() — writes ONLY non-credential fields
        │
        ▼
callCreateUserCredential() / callResetUserCredential()  (Cloud Function)
        │
        ▼
credentialService.js#createCredential()/resetCredential()
        │
        ▼
pinHash.js#hashPin() → persistCredential() → { pinHash, pin: null }


Login:
verifyPin.js reads /users/{username}
        │
        ▼
credentialService.js#verifyCredential(username, record, pin)
        │
        ├─ pinHash present → pinHash.js#verifyHash()
        └─ pin present only → verifyLegacyPlaintext() → on success, migrate


Self-service change:
admin.js#handleProfileSubmit() → callChangeMyCredential({currentPin, newPin})
        │
        ▼
credentialService.js#changeCredential() — verifies currentPin via the
SAME verifyCredential() logic (migrates if legacy), then persists newPin
```

The client never computes, assembles, or persists a credential object at
any point in this diagram — every arrow crossing into `credentialService.js`
carries only plaintext-in, and nothing but `{ok}`/`{pin}` (the one
legitimate one-time-display case) comes back out.

## 5. Architecture: the Credential Service (added on plan review)

Two refinements were requested before implementation:

1. No generic client-facing "hash this for me" helper — Cloud Functions
   own hashing, creation, reset, change, migration, and persistence
   end-to-end.
2. One small Credential Service owns all four operations, so future
   authentication evolution (longer PINs, passwords, MFA, passkeys) stays
   inside one boundary.

`functions/src/auth/pinHash.js` — pure Node, no Firebase import, directly
unit-testable: `hashPin()`, `verifyHash()`, `verifyLegacyPlaintext()`.

`functions/src/auth/credentialService.js` — the Credential Service. Owns
every read/write of `pin`/`pinHash` in the codebase; no other file ever
touches those two fields. `verifyCredential()`, `createCredential()`,
`resetCredential()`, `changeCredential()`. One private `persistCredential()`
is the **single** place a credential is ever written — always the paired
`{pinHash, pin: null}` update.

`functions/src/auth/credentialCallables.js` — thin `onCall` wrappers:
`createUserCredential`/`resetUserCredential` (admin-role-checked via the
existing token claim) and `changeMyCredential` (no username parameter —
target is always `request.auth.uid`, so it cannot act on another account
by construction, not by a permission check — keeps this patch out of
Runtime Authorization per the brief's DO NOT MODIFY).

**Standing invariant**: a `/users/{username}` record must never
simultaneously hold both `pin` and `pinHash`. Enforced structurally
(one write path, always paired) and asserted permanently in
`scripts/credential-service-check.mjs` §7 — not just reasoned about.

## 6. Files Changed

**Added**: `functions/src/auth/pinHash.js`, `credentialService.js`,
`credentialCallables.js`, `scripts/pin-hash-check.mjs`,
`scripts/credential-service-check.mjs`,
`docs/CREDENTIAL_SECURITY_PATCH_v1.30.6.2.md` (this file).

**Changed**: `functions/src/auth/verifyPin.js` (credential check delegated
to the Credential Service; PIN-format validation, user lookup,
active/archived checks, and v1.30.6's role-claim minting untouched),
`functions/index.js` (three new exports), `js/firebase.js` (three new
callable wrappers, same convention as `callVerifyPin`), `js/users.js`
(`createUser()`/`updateUser()` no longer assemble a `pin` field), `js/admin.js`
(both display leaks removed; reset and self-service change flows call the
new Cloud Functions instead of comparing/writing plaintext), `js/config.js`
(this entry).

**Explicitly zero changes**: `config/permission-registry.js`,
`config/role-permissions.js`, `config/role-registry.js`, Role Summary,
`database.rules.json`, Runtime Authorization
(`permission-service.js#can()`/`canAccessModule()`), any Warehouse/
Vehicle/Driver/Engineering/Executive business logic — per the brief's DO
NOT MODIFY.

## 7. Testing Summary / Regression Summary

- `scripts/pin-hash-check.mjs` — **24 checks, real code** (no mirror
  needed; `pinHash.js` has no Firebase import): hash shape/self-description,
  no salt reuse, round-trip correctness, malformed/foreign input fails
  closed, a hash string's own embedded parameters are honored regardless
  of today's constants, the legacy check is correctly isolated.
- `scripts/credential-service-check.mjs` — **39 checks**, mirrors
  `credentialService.js`'s orchestration against an injected fake database
  while reusing the REAL `pinHash.js` for every crypto operation: all four
  operations, the legacy-migration path, and a dedicated §7 proving the
  standing invariant holds across all four operations plus the migration
  write — collected every write produced in the test run and asserted
  each one is exactly `{pinHash: <truthy>, pin: null}`.
- Full pre-existing suite re-run clean: `permission-service-check` (62),
  `canAccessModule-check` (5), `verify-pin-role-resolution-check` (23),
  the Puppeteer `permission-runtime-invariant-check` (14).
- **Total: 167 passing checks across this patch and the two prior
  same-session phases, 0 failing.**
- All modified client JS (`firebase.js`, `users.js`, `admin.js`, `app.js`,
  `permission-service.js`) and all new/modified Cloud Functions files
  syntax-checked (`node --check`) clean.
- Deploy-time functional testing (new user creation, legacy login +
  migration confirmation, already-migrated login, wrong PIN, self-service
  change from both legacy and hashed starting states, admin reset) is
  **not yet performed** — requires the separate deploy go-ahead.

## 8. Performance Impact

One additional `crypto.scrypt` computation per login and per credential
write. scrypt is deliberately CPU/memory-expensive by design (that's the
security property) — Node's default parameters (N=16384) typically cost
low tens of milliseconds on Cloud Functions' allocated CPU, a small,
one-time-per-request cost, not a hot loop. `resetCredential`/`changeCredential`/
`createCredential` are all rare, human-initiated actions (account
creation, password reset, a user changing their own PIN), never called at
volume. `verifyCredential`'s migration write adds one extra RTDB write,
but only once per account, ever, on that account's first login after this
patch ships.

## 9. Rollback Strategy

Pure code revert — no schema migration to undo. `git revert` restores the
plaintext-only path exactly. Since Custom Role assignment is unrelated and
untouched, and no user was forced through anything, the only
consideration: any account already migrated to `pinHash` by the time a
rollback happens would need a normal PIN reset to regain access under
reverted code (which expects only `pin`) — an ordinary, already-existing
admin action, not a special recovery procedure.

## 10. Future Plaintext-Removal Plan

Once no `/users/{username}` record has a `pin` field left (verifiable via
a simple admin query), delete:
- `pinHash.js#verifyLegacyPlaintext()`
- Its one call site inside `credentialService.js#verifyCredential()`'s
  legacy branch

No redesign — the hash-path branch and the rest of the Credential Service
are already the permanent shape.
