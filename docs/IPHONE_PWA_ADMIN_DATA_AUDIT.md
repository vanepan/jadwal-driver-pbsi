# iPhone PWA — Admin Data Audit (User Management & Audit Center)

**Date:** 2026-06-14
**App version:** 1.11.3.2 (`js/config.js`, `version.json`)
**Type:** Read-only audit. No fixes implemented.
**Symptom:** On the same account / same backend / same database, **User Management**
and **Audit Center** render **0 records on iPhone PWA** but load correctly in a PC browser.

---

## Executive summary

The most likely cause is **not** a query, a role, or a database problem. It is a
**bootstrap ordering bug that is detonated by iOS standalone-PWA Firebase-Auth
session loss.**

The two admin datasets are loaded by code paths that run **unconditionally at
startup, outside the auth-ready gate**:

- `initAdminUI()` → `initUsersSync()` / `getUsers()` (Users)
- top-level `getLogs()` + `subscribeLogsChangeListener()` (Audit)

Both data stores use a **one-shot "loaded" latch** (`usersLoaded`, `logsLoaded`)
that is set to `true` **even when the read returns nothing**, and both attach a
**realtime listener exactly once**. Under the Stage-B RTDB rules
(`.read: "auth != null"`), any read performed **before a Firebase Auth session
exists** is rejected with `permission_denied`, which `fetchFirebaseData()`
**swallows into `null` → `[]`**. The latch is then stuck `true` and the
realtime listener is cancelled. A subsequent in-app login **does not re-fetch or
re-subscribe**, so both views stay at **0 forever for that app session.**

On a **PC browser** the Firebase Auth session persists across launches, so
`startAuthenticatedSession()` runs **first, while authenticated**, populating the
caches with real data before the unconditional paths run. On an **iPhone
installed PWA** the Auth session frequently does **not** persist across cold
launches (iOS standalone storage partitioning/eviction), so the unconditional
paths run **first, while unauthenticated**, poison the caches with `[]`, and the
post-login start cannot recover them.

This single mechanism explains every observed fact: same account, same backend,
same DB, panel still enterable, yet 0 records — and **only on iPhone PWA.**

---

## 1. Exact data-loading path

### User Management

```
app.js bootstrap
  └─ initAdminUI()                         js/admin.js:38
       ├─ await initUsersSync()            js/users.js:39
       │     ├─ fetchFirebaseData('users') js/firebase.js:262   (one-time get)
       │     │     └─ refreshUsersCache()  js/users.js:33  → usersLoaded = true
       │     └─ subscribeFirebasePath('users', …)  js/firebase.js:274  (onValue, once)
       ├─ users = await getUsers()         js/users.js:55  (returns cache if usersLoaded)
       ├─ renderAdminList()                js/admin.js:284
       └─ registerUsersChangeListener(cb)  js/users.js:186  (re-render on cache change)
```

The V2 Administration workspace renders the same `users` array via
`renderV2AdminUsers()` / `renderV2AdminStats()` (`js/app.js:2504`, `:2188`),
also sourced from `getUserList()` / `getUsers()`.

- Path: RTDB node **`/users`** (object keyed by username) → `mapFirebaseUsers()`
  (`js/users.js:28`) → `[{ id, username, ...record }]`.

### Audit Center

```
app.js bootstrap
  ├─ getLogs().then(...)                   js/app.js:6934   → js/logs.js:33
  │     ├─ fetchFirebaseData('logs')       js/firebase.js:262  (one-time get)
  │     └─ refreshLogsCache()              js/logs.js:18  → logsLoaded = true
  └─ subscribeLogsChangeListener(cb)       js/app.js:6942   → js/logs.js:62
        └─ subscribeFirebasePath('logs', …) js/firebase.js:274  (onValue, once)
              └─ on change: auditLogs = updatedLogs; re-render if Audit visible
```

Render: `renderV2AdminWorkspace()` → `renderAuditCenter()` (`js/app.js:3464`)
reads the module-level `auditLogs` array (`js/app.js:115`).

- Path: RTDB node **`/logs`** (object keyed by generated id) → `mapFirebaseLogs()`
  (`js/logs.js:11`, sorts desc by timestamp).

**Key structural fact:** Neither dataset is loaded *inside*
`startAuthenticatedSession()` (`js/app.js:6839`). `initUsersSync` is called
*both* there (`:6843`) *and* unconditionally inside `initAdminUI()` (`:6887`).
`getLogs` / `subscribeLogsChangeListener` are called **only** unconditionally
(`:6934`, `:6942`) — they are **never** gated behind the auth-ready session.

---

## 2. Authentication requirements

- **RTDB rules are Stage B** (`database.rules.json:3-4`): `.read`/`.write` require
  `auth != null`. Every `/users` and `/logs` read therefore requires a live
  **Firebase Auth** session.
- Login flow (`auth.js:92` `loginViaFirebase`): `callVerifyPin` (Cloud Function,
  **does not** need RTDB auth) → mints a custom token → `signInWithCustomToken`
  establishes the Firebase Auth session. RTDB reads only succeed after this.
- **localStorage `pbsi_current_user` is only a write-through cache** of the auth
  state (`auth.js:117`, `:167`). `getCurrentUser()` reads it **synchronously**
  (`auth.js:231`) and is what gates UI/role — **it does not prove a live RTDB
  Auth session exists.** This decoupling is central to the bug: the UI can think
  "admin is logged in" while RTDB sees `auth == null`.

## 3. Role requirements

- Admin-panel entry is gated by `isAdmin()` (`auth.js:257`), driven by the
  cached `role` (token claim → cache). The Users button is shown only for admins
  (`admin.js:159`, `updateAdminButtons`).
- **The RTDB reads for `/users` and `/logs` do not require any role** — only
  `auth != null`. So a role mismatch is **not** a plausible cause of 0 records
  (a wrong role would still read non-empty data, or fail identically on PC).
- (Role-scoped nodes like `/events`, `/notifications`, `/push_subscriptions` —
  `database.rules.json:6-33` — are unrelated to these two screens.)

## 4. Firebase query path used

- Both use a **plain ref read of an entire node** — no `orderBy`/`limit`/indexed
  query. `ref(db, 'users')` / `ref(db, 'logs')` via `getFirebaseRef()`
  (`firebase.js:252`), then `get()` (one-shot) and `onValue()` (realtime).
- No composite indexes, no `.indexOn` dependency, no pagination. A query-shape
  difference between platforms is therefore **not** possible — identical code,
  identical node.

## 5. Realtime-listener attachment path

- `subscribeFirebasePath(path, cb, errorHandler)` (`firebase.js:274`) attaches a
  single `onValue` with an **error callback that only `console.error`s**
  (`:277-280`). It does **not** re-attach.
- Each store guards subscription with a **once-only flag**: `usersSubscribed`
  (`users.js:8`, set at `:48`) and the single `onLogsChangeCallback`
  (`logs.js:9`). After it is set, no module re-subscribes.
- **Critical:** when an `onValue` listener is attached while unauthenticated, the
  rules reject it → the listener's **error callback fires and the listener is
  cancelled** (Firebase does not silently retry a denied listener). Because the
  subscribe flag is already `true`, **nothing re-attaches it after login** — so
  even though a later auth change *could* satisfy the rules, there is no live
  listener left to deliver data.

## 6. Platform-specific conditions

There is **no `if (iOS)` branch** in the data layer — the platform split is
**emergent**, from how iOS treats an installed PWA's storage:

- **Firebase Auth persistence (primary trigger).** The Web SDK persists the auth
  session in IndexedDB (`indexedDBLocalPersistence`, falling back to
  `localStorage`). On an iOS **standalone** home-screen PWA, that storage is
  partitioned from Safari and is aggressively evicted; the session frequently
  does **not** survive a cold launch. Result: on next launch
  `onAuthStateChanged` fires **`null`** before any login.
- The app detects standalone/iOS (`pwa.js:85,95,107`), but the **auth/data layer
  ignores it** — it assumes the persisted session will be there as it is on PC.
- Consequence is purely a matter of **ordering** (see §10): on iOS PWA the
  unconditional reads win the race in the unauthenticated state; on PC the
  authenticated session is already present so the gated reads win.

## 7. Cache / service-worker interactions

- `service-worker.js` is **cache-first for all static assets incl. `*.js`/`*.mjs`**
  (`:41`, `:96-110`). It correctly **bypasses Firebase/RTDB origins**
  (`BYPASS_ORIGINS`, `:30-38`) and never caches RTDB responses — so the SW does
  **not** directly serve stale *data*.
- However the SW **can serve a stale JS app shell**, and iOS PWAs are notorious
  for deferring SW updates. A secondary failure mode: the iPhone PWA could be
  running a **pre-v1.11.1.2 JS bundle** (before custom-auth) against the current
  Stage-B `auth != null` rules → that older code never calls
  `signInWithToken()`, so every read is unauthenticated → 0 records, while the
  cached localStorage session still admits the user to the panel. Confirm by
  checking the loaded `APP_VERSION` on-device vs `version.json` (`1.11.3.2`).
- `version.json` is network-only (`:84`), but update **activation** requires the
  user to accept the banner; an installed iOS PWA that never accepted it keeps
  the old worker (and old cache) indefinitely.

## 8. Error swallowing that converts failure → empty array

This is the **amplifier** that turns a transient `permission_denied` into a
permanent empty screen:

| Location | Behavior |
|---|---|
| `fetchFirebaseData()` `firebase.js:265-271` | `catch (error) { console.error(...); return null; }` — **`permission_denied` → `null`** |
| `mapFirebaseUsers(null)` `users.js:28-31` | `null → {} → []` |
| `mapFirebaseLogs(null)` `logs.js:11-16` | `null → {} → []` |
| `refreshUsersCache([])` `users.js:33-37` | sets `usersLoaded = true` **on the empty result** |
| `refreshLogsCache([])` `logs.js:18-22` | sets `logsLoaded = true` **on the empty result** |
| `getUsers()` `users.js:55-60` | `if (usersLoaded) return users;` → **returns the poisoned `[]` and never refetches** |
| `getLogs()` `logs.js:33-38` | `if (logsLoaded) return logs;` → same |
| `subscribeFirebasePath` error cb `firebase.js:277-280` | denied listener only logged; **never re-attached** |

Net effect: a denied read is **indistinguishable from "no data"**, and the
one-shot latch makes the empty state **sticky** for the rest of the session.
There is **no user-visible error** on these two screens — only a `console.error`
(invisible on iPhone without remote debugging).

## 9. Can the iPhone PWA enter the Admin Panel without loading admin datasets?

**Yes — this is the heart of the bug.** Panel access is gated by `isAdmin()` /
`getCurrentUser()`, which read the **localStorage cache** synchronously
(`auth.js:231,257`). RTDB data access is gated independently by a **live Firebase
Auth session** (Stage-B rules). These two gates are **decoupled**:

- After an in-app PIN login, the localStorage cache is populated → `isAdmin()` is
  `true` → the admin rail/workspace opens.
- But if the dataset reads already executed (and latched empty) while
  unauthenticated at bootstrap, the panel opens onto **empty Users and Audit
  lists**. The screen is fully navigable; it just has nothing in it.

So: **entering the Admin Panel is possible with zero loaded admin data.**

## 10. Most-likely root-cause ranking

> **#1 — Bootstrap reads run unauthenticated, latch empty, and never recover
> (triggered by iOS-PWA Auth-session loss).**  *(Highest confidence.)*
>
> Mechanism, step by step:
> 1. iOS PWA cold launch → Firebase Auth session not restored → first
>    `onAuthStateChanged` emits **`null`** → `_hydrateFromFirebaseUser(null)`
>    (`auth.js:167`) and `authReady()` resolves with no user.
> 2. `if (getCurrentUser()) await startAuthenticatedSession()` (`app.js:6883`)
>    is **skipped** (no session yet).
> 3. `await initAdminUI()` (`app.js:6887`) runs anyway → `initUsersSync()` reads
>    `/users` **unauthenticated** → `permission_denied` → `[]` →
>    `usersLoaded = true`; the `/users` `onValue` listener is attached and
>    **cancelled** by the rules.
> 4. `getLogs()` (`app.js:6934`) + `subscribeLogsChangeListener()` (`:6942`) read
>    `/logs` **unauthenticated** → `[]` → `logsLoaded = true`; the `/logs`
>    listener is cancelled.
> 5. User enters PIN → `loginViaFirebase` succeeds → `startAuthenticatedSession()`
>    finally runs, but `initUsersSync()` **no-ops** (`usersLoaded` &
>    `usersSubscribed` already `true`), and **nothing re-runs `getLogs` or
>    re-subscribes `/logs`**.
> 6. Result: Users = 0, Audit = 0, panel fully accessible — **persisting until a
>    hard reload that happens to start already-authenticated.**
>
> **Why PC differs:** PC retains the Auth session, so step 2 is taken — the
> *authenticated* `startAuthenticatedSession()` populates the caches with real
> data *before* the unconditional paths run, and the latch/subscription guards
> then correctly short-circuit. The exact same code yields opposite results
> purely because of auth-session presence at bootstrap.

**#2 — Stale service-worker-cached JS bundle on the iPhone PWA** running
pre-custom-auth code (no `signInWithToken`) against Stage-B rules → every read
unauthenticated → 0 records, panel still enterable via cached session. *(Plausible;
verify on-device `APP_VERSION` vs `1.11.3.2`. Same fingerprint as #1, distinct
fix.)*

**#3 — Firebase Auth WebSocket auth-token race**, iOS-only: `signInWithCustomToken`
resolves but the RTDB connection authenticates slightly later; an immediate read
slips through unauthenticated and latches empty. *(Lower; the SDK normally queues
reads behind the token, but iOS PWA timing is the most fragile.)*

**#4 — IndexedDB unavailable/blocked in the iOS PWA** (private-mode-like
restrictions) so Auth persistence and possibly the SDK itself degrade. *(Lower;
would tend to also break login, not just data.)*

**Effectively ruled out:** query shape (§4 — identical full-node read), role
requirements (§3 — reads need only `auth != null`), backend/data divergence
(same DB), and SW caching of *data* (§7 — RTDB origins are bypassed).

---

## Suggested verification (no fixes applied)

1. **On-device version:** confirm the iPhone PWA's loaded `APP_VERSION` equals
   `1.11.3.2` (rules out / confirms #2).
2. **Remote-debug the iPhone PWA** (Mac Safari → Develop → device) and watch the
   console at launch for `Fetch Firebase data gagal` /
   `Firebase listener gagal pada users|logs` with a `permission_denied` /
   `PERMISSION_DENIED` code — direct evidence of unauthenticated reads (#1/#3).
3. **Auth-state probe:** log `firebase.auth().currentUser` (or the SDK v10
   equivalent) immediately after the admin panel opens with 0 records — `null`
   confirms the Auth/localStorage decoupling in §9.
4. **Cold-vs-warm test:** with the PWA already open and authenticated, pull-to-
   refresh / relaunch and compare. If data appears only when the launch starts
   already-authenticated, that is the §10-#1 signature.
5. **Storage check:** in the iOS PWA, inspect whether the Firebase Auth IndexedDB
   record survives a force-quit + relaunch (confirms the persistence trigger).

---

*Audit only. No code, rules, configuration, or service-worker changes were made.*
