# Identity & Security Rules Cutover — v1.11.1.2 (Identity Foundation)

**Status:** Approved blueprint — implemented.
**Companion to:** [BACKEND_FOUNDATION_ARCHITECTURE.md](BACKEND_FOUNDATION_ARCHITECTURE.md)
**Scope of this release:** Trusted per-user identity + authenticated RTDB access (`auth != null`) only.
**Explicitly deferred:** Role Rules · Ownership Rules · Server-side Telegram · Push Notifications.

---

## 0. Objective

Introduce trusted user identity and authenticated RTDB access while preserving the existing PIN login UX byte-for-byte. The migration target:

```
PIN login (unchanged form)
   → verifyPin()                 Cloud Function: server-side PIN check
   → Custom Token { uid, role }  minted by the Admin SDK
   → signInWithCustomToken()     Firebase Auth (local persistence)
   → onAuthStateChanged()        write-through hydration
   → localStorage cache          getCurrentUser() stays SYNCHRONOUS
```

`getCurrentUser()` keeps its synchronous signature; localStorage becomes a **cache of** Firebase auth state, never the source of truth. The `role` claim minted server-side is the **authoritative** role.

---

## 1. Username Audit (Phase 0 gate)

Audited live `/users` keys via shallow REST read (`/users.json?shallow=true`) — PIN values never fetched.

- **Total users audited:** 24
- **Invalid usernames found:** NONE
- **Forbidden characters checked:** `/ # $ [ ] .`
- **Result:** **PASS** — every key matches `^[a-z0-9._-]{3,30}$` and contains none of RTDB/Auth's reserved characters. `uid = username` is safe with **zero re-keying**.

Users: `admin, akuntes, aria, audit, bidangit, binpres, binpresda, comdev, dedi, driver, etik, evan, grace, hublu, humas, igo, keuangan, medis, organisasi, pengadaan, perwasitan, renstra, sekjen, turnamen`.

---

## 2. verifyPin — server-side custom-auth entry

`functions/src/auth/verifyPin.js` (callable, region `asia-southeast1`):

1. Validate `username` (`^[a-z0-9._-]{3,30}$` after normalization) and `pin` (`^\d{4}$`).
2. Normalize username identically to the client (`trim → lowercase → spaces to dashes`) so `uid` equals the `/users` key.
3. Read `/users/{username}` via the Admin SDK (`admin.database()`).
4. Reject inactive/archived/unknown users and PIN mismatch with a **generic** `unauthenticated` error (no account enumeration).
5. **Never log the PIN.** Only `username` + outcome are logged.
6. Mint `admin.auth().createCustomToken(username, { role })`.
7. Return `{ token, profile: { username, name, role, active } }`.

The `role` developer claim is embedded in the token and surfaces in `request.auth.token.role` and `getIdTokenResult().claims.role` — the authoritative role source. `name`/`active` are returned (not claimed) so the client writes a complete session blob on fresh login; on reload the cached blob supplies `name` while `role` comes from the token.

---

## 3. Auth integration & write-through cache

**`js/firebase.js`** gains an auth layer (Auth + Functions SDK):
- `callVerifyPin(username, pin)` — httpsCallable bound to the region.
- `signInWithToken(token)` / `firebaseSignOut()`.
- `registerAuthStateCallback(cb)` + `initFirebaseAuthLayer()` — registers `onAuthStateChanged`.
- `authReady()` — a promise resolving on the **first** auth-state emission (online or offline, from persisted state).

**`js/auth.js`**:
- `getCurrentUser()` — **unchanged** synchronous localStorage reader.
- `login()` — same signature. In Firebase mode: `callVerifyPin → signInWithToken → write blob from profile`. In break-glass mode: legacy client-side PIN compare.
- `onAuthStateChanged` handler (`_hydrateFromFirebaseUser`): on user → write-through blob `{id, username, name, role, active}` (role from token claim, name from cache fallback); on null → clear blob.
- `logout()` — `firebaseSignOut()`; the auth listener clears the blob and reloads to a clean unauthenticated state.

All permission helpers (`hasPermission`, `isAdmin`, …) are untouched — they read the same blob shape, now backed by a server-asserted claim.

---

## 4. Auth-ready gate (bootstrap boundary)

`js/app.js` `DOMContentLoaded` is restructured so **no RTDB access occurs before auth resolution**:

```
DOMContentLoaded
  → initPWA, feature flags, pure-UI wiring   (no RTDB)
  → initAuthUI()         registers login form + onAuthStateChanged; await authReady()
  → if getCurrentUser():  startAuthenticatedSession()   (runs once)
        initUsersSync · initAdminUI · initDriversStore · initVehiclesStore
        · initSettingsStore · telegram settings fetch · render · initFirebaseSync
        · H-1/H-2 reminder timers
  → else: login modal shown; startAuthenticatedSession() fires on first successful login
```

`startAuthenticatedSession()` is idempotent (one-shot guard). This eliminates `permission_denied` storms: every `get`/`onValue`/store-init runs only after a signed-in user exists. Offline reload resolves `authReady()` from persisted auth without a network round-trip, then renders from the localStorage assignment cache.

---

## 5. Break-glass fallback — `AUTH_DIRECT_PIN`

Emergency rollback path, **default OFF**, legacy code retained:

- Enable via `window.AUTH_DIRECT_PIN = true` **or** `localStorage['pbsi_auth_direct_pin'] = 'true'`.
- When ON: `login()` uses the legacy client-side PIN compare + localStorage session; Firebase Auth is **not** initialized; `authReady()` resolves immediately; `initUsersSync()` + legacy `restoreSession()` run so client-side PIN verification works.
- **Constraint:** direct-PIN mode requires RTDB rules at **Stage A (open)** because clients are unauthenticated. Use only paired with a rules rollback.
- Removable in a future release once custom auth is proven stable.

---

## 6. Security rules

**Stage B (this release) — `database.rules.json`:**
```json
{ "rules": { ".read": "auth != null", ".write": "auth != null" } }
```
No role/ownership restrictions — the goal is only to prove all active users authenticate.

**Stage A rollback — `database.rules.stageA.json`:**
```json
{ "rules": { ".read": true, ".write": true } }
```

Rollback = `cp database.rules.stageA.json database.rules.json && firebase deploy --only database` (seconds, no data change).

---

## 7. Production deployment order (operator-executed)

Rules must be deployed **last**. The app + functions must be live and adopted before locking reads/writes.

```
1. firebase deploy --only functions        # verifyPin + health live (verifyPin now active)
2. Deploy app bundle (Hosting or current host) with v1.11.1.2 auth integration, AUTH_DIRECT_PIN OFF
3. Smoke: each role logs in → token minted → app loads (rules STILL Stage A/open)
4. firebase deploy --only database          # flip to Stage B (auth != null)
5. Monitor permission_denied ≈ 0; if regressions → roll back rules to Stage A (+ break-glass if needed)
```

---

## 8. Testing matrix (operator-executed against deployed env)

| Area | Test | Pass |
|---|---|---|
| Auth | admin/driver/bidang/viewer login | token minted, blob has correct role, modal closes |
| Session | reload | no re-login (persisted), app loads |
| Session | logout | signOut, blob cleared, login modal |
| Session | token refresh | SDK auto-refresh, role claim retained |
| Session | offline reload | auth resolves from cache, cached assignments render |
| Core | assignments / requests / comments / notifications / analytics | read+write succeed for signed-in users (no role gate yet) |
| PWA | install / update banner / offline | unchanged |
| Gate | bootstrap | no `permission_denied` storms in console |
| Break-glass | `AUTH_DIRECT_PIN=true` + Stage A | legacy PIN login works |

## 9. Rollback verification

- **Code:** legacy `login`/`restoreSession` paths retained; `AUTH_DIRECT_PIN` flips to them without a redeploy.
- **Rules:** Stage B → Stage A by republishing `database.rules.stageA.json`.

---

## Definition of Done

- [x] Trusted user identity established (`verifyPin` → custom token `uid=username`, `role` claim authoritative)
- [x] Firebase Auth active (custom token sign-in + persistence + write-through cache)
- [x] `getCurrentUser()` unchanged (synchronous)
- [x] RTDB protected by `auth != null` (Stage B)
- [x] Existing PIN login UX preserved
- [x] Role Rules deferred · Ownership Rules deferred · Server Telegram deferred · Push deferred
