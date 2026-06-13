# Admin Data Bootstrap — Fix Design

**Date:** 2026-06-14
**App version at design time:** 1.11.3.2
**Companion audit:** `docs/IPHONE_PWA_ADMIN_DATA_AUDIT.md`
**Type:** Architecture / design only. **No code. No commits. No deploy.**
**Scope:** Make User Management (`/users`) and Audit Center (`/logs`) load
reliably on iPhone standalone PWA without regressing desktop, the Admin UI, or
data structures.

---

## 1. Root-cause summary

The audit established that "0 records" is produced by **two compounding defects**,
not one. The fix must close **both**, or the symptom can recur:

**Defect A — Ungated bootstrap reads (ordering).**
Admin data loaders run *outside* the authenticated-session gate:
`initAdminUI()` → `initUsersSync()`/`getUsers()` (`app.js:6887`) and the top-level
`getLogs()` + `subscribeLogsChangeListener()` (`app.js:6934`, `:6942`). When the
Firebase Auth session is absent at cold launch — the normal state for an iOS
standalone PWA whose IndexedDB-backed session did not survive — these run while
`auth == null` and are rejected by the Stage-B rules (`.read: "auth != null"`).

**Defect B — Poisoned cache + dead listener (state machine).**
A denied/failed read is made *indistinguishable from empty* and is then *latched
permanently*:

- `fetchFirebaseData()` collapses every error (incl. `permission_denied`) to
  `null` (`firebase.js:265-271`), which maps to `[]`.
- `refreshUsersCache([])` / `refreshLogsCache([])` set `usersLoaded`/`logsLoaded`
  `= true` **on the empty result** (`users.js:33`, `logs.js:18`).
- `getUsers()`/`getLogs()` then short-circuit forever (`users.js:56`, `logs.js:34`).
- The realtime `onValue` listener attached while unauthenticated is **cancelled**
  by the rules; its error callback only logs (`firebase.js:277-280`); the
  once-only flags (`usersSubscribed`, single `onLogsChangeCallback`) prevent
  re-attachment.

The subsequent in-app login runs `startAuthenticatedSession()`, but every loader
inside it **no-ops** against the poisoned latch, and nothing re-subscribes.

> **Design principle derived from this:** the system must (1) *never* load admin
> data before auth, (2) *never* treat failure as empty, (3) *never* latch a
> non-success, and (4) treat "auth became available" as a **recurring event** that
> re-drives loading — not a one-shot check at bootstrap.

---

## 2. Proposed architecture

Three layers change. Each layer fixes one class of the problem and is
independently testable.

### 2.1 Layer 1 — Typed read/subscribe outcomes (kills "failure == empty")

**Today:** the data primitive has a lossy contract — `null` means *both* "node
empty" *and* "read failed."

**Proposed:** introduce a **discriminated outcome** for the two admin paths so
callers can distinguish three states:

| Outcome | Meaning | Caller action |
|---|---|---|
| `ok` (value, possibly empty `{}`) | Authoritative read succeeded | Cache it; mark loaded |
| `denied` | `permission_denied` / `auth == null` | **Do not cache, do not latch**; schedule retry on auth |
| `error` | Transient (network/timeout/other) | **Do not cache, do not latch**; retry/backoff |

Implementation shape (description, not code):

- Add a **new internal primitive** in `firebase.js` (e.g. a `readNode(path)` that
  returns `{ status, value, code }`) rather than changing the existing
  `fetchFirebaseData()` signature. This **caps blast radius** — the ~many other
  callers of `fetchFirebaseData` keep their current null-tolerant contract; only
  `/users` and `/logs` migrate to the typed primitive.
- Add a **guarded subscribe primitive** (e.g. `subscribeNode(path, onValue, {onDenied, onError})`) that:
  - tracks the live `ref`/unsubscribe handle so it can be torn down and re-attached cleanly (call Firebase `off`/unsubscribe before re-`onValue` to avoid duplicate callbacks → double renders);
  - on the error callback, **classifies** denied vs other and reports it upward instead of silently dying;
  - exposes its **attachment state** (`idle | active | denied | error`) so the orchestrator can re-drive it.

> Distinguishing empty-vs-denied is the linchpin of **Requirement 1**: it is what
> lets every higher layer refuse to latch on failure.

### 2.2 Layer 2 — Store state machines (kills the sticky latch; enables recovery)

`users.js` and `logs.js` each adopt an explicit, identical lifecycle. Replace the
boolean `*Loaded` latch and once-only subscribe flag with two small state fields:

```
load state:   UNLOADED → LOADING → LOADED         (success only)
                  ↑__________________|  (failure: denied/error → back to UNLOADED)

sub  state:   IDLE → SUBSCRIBING → SUBSCRIBED      (success only)
                ↑________________________|  (denied/cancel/error → back to IDLE)
```

Rules:

- **`LOADED` is set only on an `ok` outcome.** `denied`/`error` return the store to
  `UNLOADED` so the next `getUsers()`/`getLogs()` retries (directly satisfies
  Requirement 1: `usersLoaded`/`logsLoaded` must not become `true` on failed reads).
- A single **`ensureLoadedAndSubscribed()`** entry point per store, **idempotent
  and re-entrant**: safe to call on every auth-available event. It:
  1. if not `SUBSCRIBED`/`SUBSCRIBING`, (re)attaches the realtime listener via the
     guarded subscribe primitive;
  2. relies on the **subscription's initial snapshot as the loader** (see §2.4) —
     so a successful subscribe both loads *and* keeps fresh, collapsing the
     fragile dual `get()`+`subscribe()` path the audit flagged.
- On a successful snapshot, the existing `refreshUsersCache`/`refreshLogsCache`
  fan-out to `onUsersChangeCallbacks` / `onLogsChangeCallback` is **unchanged** —
  so `renderAdminList()` / `renderAuditCenter()` re-render exactly as today.
- **Public API is preserved**: `getUsers()`, `getUserByUsername()`, `getUserList()`,
  `registerUsersChangeListener()`, `getLogs()`, `subscribeLogsChangeListener()`,
  `logAction()` keep their signatures and return shapes (Requirement 5).

### 2.3 Layer 3 — Auth-driven orchestration (kills the ordering bug; drives recovery)

The bootstrap's one-shot `if (getCurrentUser()) await startAuthenticatedSession()`
(`app.js:6883`) is replaced by an **event-driven gate**:

- **Single source of "auth is available."** `firebase.js` already centralizes auth
  via `onAuthStateChanged` → `registerAuthStateCallback` → `authReady()`
  (`firebase.js:111-151`). Extend this into a small **auth-state signal** the app
  subscribes to:
  - `onAuthAvailable(user)` — fires whenever a **live Firebase Auth user** exists:
    on warm launch (session restored), on delayed restoration, and on fresh PIN
    login. **This is the trigger for all admin-data (re)loading.**
  - `onAuthLost()` — fires on sign-out/expiry; tears down listeners and resets the
    store state machines to `UNLOADED`/`IDLE` so a later re-auth reloads cleanly.
- **Split `startAuthenticatedSession()` (`app.js:6839`) into two responsibilities:**
  - **`startSessionInfraOnce()`** — strictly once-per-page guarded by the existing
    `_sessionStarted` flag: `initFirebaseSync()`, H-1/H-2 reminder `setInterval`s,
    `initPush()`, telegram token fetch. *(Must not run twice — see migration risk.)*
  - **`loadAuthedData()`** — **re-entrant**, called on every `onAuthAvailable`:
    invokes each store's `ensureLoadedAndSubscribed()` (users, logs, and by the
    same pattern drivers/vehicles/settings if desired), then refreshes the visible
    admin view if one is open.
- **Move the ungated loaders behind the gate.** The top-level `getLogs()` /
  `subscribeLogsChangeListener()` (`app.js:6934`, `:6942`) move *into*
  `loadAuthedData()`. `initAdminUI()` (`admin.js:38`) is **split**: DOM/event
  wiring (`attachAdminButtons`, listener registration) stays unconditional at
  bootstrap; the **data-loading half** (`initUsersSync`/`getUsers`/initial
  `renderAdminList`) moves under `loadAuthedData()` (or is internally guarded to
  no-op until auth is available).

This makes the gate **level-triggered on auth presence** rather than
**edge-checked once at boot** — which is exactly what cold/warm/delayed-restore on
iOS requires (Requirement 4).

### 2.4 Recommended simplification — subscription as the single loader

The audit noted the brittle **dual path**: a one-shot `get()` *and* an `onValue()`
for the same node. The design recommends, for `/users` and `/logs`, **treating the
realtime subscription as the authoritative loader**:

- `onValue` delivers an immediate initial snapshot on (successful) attach, so a
  separate `get()` is redundant for these two screens.
- This means **one** code path to gate, **one** to recover, **one** to reason about
  — and listener recovery (Requirement 3) *is* data recovery.
- `get()`-style reads may remain where a synchronous-ish one-shot is genuinely
  needed (e.g. `getUserByUsername` during login), but they must use the **typed
  primitive** and must **not** latch on failure.

### 2.5 Recovery behavior (Requirement 3, explicit)

| Situation | Behavior under design |
|---|---|
| Listener attached before auth | Attach is attempted; rules deny → classified `denied` → store returns to `IDLE` (not latched) |
| Listener denied | `onDenied` reported; sub state `IDLE`; `LOADED` never set |
| Auth becomes available later (restore or login) | `onAuthAvailable` → `loadAuthedData()` → `ensureLoadedAndSubscribed()` re-attaches; initial snapshot loads data; fan-out re-renders |
| Token refresh / transient blip | Working listeners are **not** torn down; only `IDLE`/`denied` ones are (re)attached — avoids flicker/double-render |
| Sign-out | `onAuthLost()` tears down listeners, resets state machines to `UNLOADED`/`IDLE` |

### 2.6 UX state (optional, recommended)

To prevent a denied/pending read from *looking* like "no data," the admin views
should distinguish:

- **Loading / auth-pending** → neutral "Memuat…" placeholder (not "Belum ada user").
- **Empty (authoritative `ok` with 0 rows)** → existing "Belum ada user." copy.
- **Error/denied after retries** → small inline retry affordance.

This is additive to the render functions (`renderAdminList`, `renderAuditCenter`)
and does not change data structures.

---

## 3. Cold vs warm launch — target sequences

**Warm launch (auth session present — today's desktop happy path):**
```
boot → initFirebaseAuthLayer → onAuthStateChanged(user) → onAuthAvailable(user)
     → loadAuthedData() → ensureLoadedAndSubscribed(users, logs)
     → subscribe ok → initial snapshot → caches filled → admin views render data
```
Fires once, immediately. **Behaviorally identical to today** (Requirement 5).

**Cold launch (auth absent then arrives — iOS PWA failure path, now fixed):**
```
boot → onAuthStateChanged(null) → NO admin reads fired (gate closed)
     → UI wiring done; admin views show "Memuat…/login" (not poisoned empty)
     → user logs in (or session restores late) → onAuthAvailable(user)
     → loadAuthedData() → ensureLoadedAndSubscribed() attaches NOW (authenticated)
     → initial snapshot → caches filled → admin views render data
```
No latch was set while unauthenticated, so the auth-available event fully recovers.

---

## 4. File impact

| File | Change | Risk |
|---|---|---|
| `js/firebase.js` | Add typed read primitive (`{status,value,code}`) + guarded/recoverable subscribe primitive that tracks handles and classifies denied vs error; extend auth-state into `onAuthAvailable`/`onAuthLost` signals. Leave existing `fetchFirebaseData`/`subscribeFirebasePath` intact for other callers. | Medium (core module; additive, not a rewrite) |
| `js/users.js` | Replace `usersLoaded`/`usersSubscribed` booleans with load/sub state machines; `LOADED` only on `ok`; add idempotent `ensureLoadedAndSubscribed()`; route reads through typed primitive. Public API unchanged. | Medium |
| `js/logs.js` | Same state-machine treatment for `/logs`; `ensureLoadedAndSubscribed()`; typed primitive. `logAction()` unchanged. | Low–Medium |
| `js/app.js` | Split `startAuthenticatedSession()` into `startSessionInfraOnce()` (once) + `loadAuthedData()` (re-entrant); subscribe `loadAuthedData` to `onAuthAvailable`; **move** `getLogs`/`subscribeLogsChangeListener` (`:6934`,`:6942`) into the gate; reset on `onAuthLost`. | Medium (bootstrap orchestration) |
| `js/admin.js` | Split `initAdminUI()` into unconditional **wiring** vs gated **data load**; the gated half runs via `loadAuthedData()`/auth event. | Low–Medium |
| `js/auth.js` | Minor: ensure `_hydrateFromFirebaseUser(user)` path emits/relies on `onAuthAvailable`; no change to login UX or session-cache semantics. | Low |
| Render fns (`app.js`, `admin.js`) | Optional §2.6 loading/empty/error tri-state. | Low (additive) |
| **RTDB rules / schema / data** | **None.** No `database.rules.json`, node shape, or migration change. | — |
| **service-worker.js** | **None for the bug itself.** A version bump (cache-bust) is the *delivery* mechanism, not a logic change. | Low |

---

## 5. Migration risk

1. **Re-entrancy double-effects.** If `loadAuthedData()` re-runs on auth events,
   one-shot infra (`setInterval` reminders, `initPush`, `initFirebaseSync`) must
   **not** re-run. *Mitigation:* hard separation — infra stays under the
   `_sessionStarted` once-guard; only data (re)load is re-entrant.
2. **Duplicate listeners → double renders.** Re-attaching a subscription without
   detaching the prior one doubles callbacks. *Mitigation:* the guarded subscribe
   primitive tracks and `off()`s the previous handle before re-attaching; sub state
   machine forbids attaching while `SUBSCRIBED`.
3. **Changing the data-primitive contract.** *Mitigation:* do **not** alter
   `fetchFirebaseData`; add a parallel typed primitive used only by `/users` and
   `/logs`. Other callers are untouched.
4. **Auth flapping** (token refresh, brief disconnects) causing teardown/reload
   churn. *Mitigation:* only `onAuthLost` (true sign-out/expiry) tears down;
   transient connection blips do not; working listeners are preserved.
5. **Desktop regression.** The warm-launch sequence (§3) fires once immediately, as
   today. *Mitigation:* explicit warm-path test (auth present at boot → data on
   first paint) in the verification matrix below.
6. **"Empty vs loading" copy.** If §2.6 is adopted, ensure a genuine empty dataset
   still reads "Belum ada user." and is not stuck on "Memuat…". *Mitigation:*
   loading state clears on the first `ok` outcome regardless of row count.

**Verification matrix (no fixes implied — for the eventual implementation):**

| Platform | Launch | Auth at boot | Expected |
|---|---|---|---|
| Desktop | warm | present | Data on first render (unchanged) |
| iOS PWA | cold | absent → login | Data appears immediately after login |
| iOS PWA | warm | restored | Data on first render |
| iOS PWA | cold | restored late | Data appears when restoration completes |
| Any | sign-out → re-login | toggles | Clean reload, no stale/empty, no double rows |

---

## 6. Rollback strategy

The change is **client-JS only** — no rules, schema, or data migration — so
rollback is low-cost and reversible at several granularities:

1. **Break-glass feature flag (fastest, no redeploy).** Gate the new behavior
   behind a flag mirroring the existing `AUTH_DIRECT_PIN` pattern
   (`auth.js:37`) — e.g. `window.ADMIN_DATA_GATED` / a `localStorage` key,
   **defaulting ON**. Flipping it OFF restores the legacy ungated bootstrap path
   (retained, not deleted) for an individual device under investigation, without
   shipping anything.
2. **Bundle rollback (full).** Because nothing persistent changed, redeploy the
   previous JS bundle and bump `APP_VERSION`/`SW_VERSION` to cache-bust the service
   worker (`service-worker.js:24`). Installed PWAs pick it up via the existing
   update-banner flow.
3. **No data cleanup required.** No records were rewritten; `/users` and `/logs`
   shapes are unchanged. There is nothing to reverse server-side.
4. **Rules are untouched**, so a client rollback can never desync from a rules
   change (there is none).

Recommended sequence: ship behind the default-ON flag → validate on a real iPhone
PWA (cold + warm) → if a regression appears, flip the flag OFF on the affected
device, diagnose, and only then decide between fix-forward and bundle rollback.

---

*Design only. No code, rules, configuration, service-worker, or data changes were
made. Implementation, commits, and deploy are explicitly out of scope for this
document.*
