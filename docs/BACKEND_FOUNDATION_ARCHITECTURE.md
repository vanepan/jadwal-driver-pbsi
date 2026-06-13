# Platform Security & Backend Foundation — Architecture Review (v1.11.1)

**Status:** Design / architecture review only. No implementation.
**Author:** Architecture review, 2026-06-13
**Companion to:** [PUSH_NOTIFICATION_ARCHITECTURE.md](PUSH_NOTIFICATION_ARCHITECTURE.md)
**Scope:** Design the first trusted backend foundation (auth identity, RTDB rules, Cloud Functions, server-side Telegram, unified events) so Push, the Notification Engine, the Engineering Module, Operational Intelligence, and the AI Operations Assistant can be built later without major refactors.

---

## 0. Framing

The Push review concluded that push is impossible without a trusted sender, which forces the first server-side component. This review designs that component as a *general* foundation, not a push-only one. The guiding constraint:

> **Everything that follows hinges on one decision — giving the platform a real, per-user identity that RTDB security rules can reason about.** Once `request.auth.uid` and a `role` claim exist, rules, Functions, server-side Telegram, and the event bus all fall out naturally. Without it, none of them can be secured.

---

## Phase 1 — Current State Assessment

### 1.1 Authentication architecture
- PIN login: `auth.js#login()` fetches `/users/{username}`, compares `user.pin === enteredPin` as plaintext strings, and writes a session blob to `localStorage` (`pbsi_current_user`). No identity provider, no token.
- **Risk:** `pin` is stored in cleartext at `/users/{username}/pin` ([users.js:101](../js/users.js#L101)) and, with no rules, is world-readable. The entire credential set is exposed to any client that can read `/users`.

### 1.2 Session architecture
- Session = a JSON blob in `localStorage` (`{ id, username, name, role, active }`). `getCurrentUser()` reads it **synchronously** and is called from 60+ sites across `app.js`, `notifications.js`, `comments.js`, `auth.js`.
- No expiry, no refresh, no server validation. Role is self-asserted client-side; `hasPermission()` is pure client logic ([auth.js:102](../js/auth.js#L102)).
- **Consequence for migration:** any move to Firebase Auth (async `onAuthStateChanged`) must preserve a **synchronous** `getCurrentUser()` to avoid touching every call site.

### 1.3 User model
- Stored at `/users/{username}` (keyed by username, **not** a UID). Shape: `{ username, displayName, role, pin, telegramChatIds, notificationsEnabled, active, createdAt, updatedAt }`.
- Roles: `admin | bidang | driver | viewer`. "Last active admin" guard exists in `updateUser()`.
- **Migration upside:** username-keyed records mean a custom-auth `uid = username` strategy needs **no re-keying**.

### 1.4 RTDB structure (today)
```
/users/{username}            { ...profile, pin }      ← plaintext PIN, no rules
/assignments/{id}            { ...assignment }        ← surgical single-record writes
/driver_requests/{id}        { ...request, comments[] } ← comments embedded here
/logs/{id}                   { userId, username, action, targetId, metadata, timestamp }
/settings/...                telegram.botToken, analyticsAliases, analyticsQuality
/backups/assignments/{ts}    daily snapshot
/reimbursement_counters/{ym} atomic doc-number counter
```
- **There is no top-level `/comments` node** — comments live inside `/driver_requests/{id}/comments[]`. The brief lists `comments` for rule design; in reality their access is governed by the parent request.
- **`/notifications` and `/push_subscriptions` do not exist yet** — greenfield (designed in the Push review).
- `/logs` is already a structured, append-only **de-facto event stream** consumed by `notifications.js`.

### 1.5 Notification architecture
Two unconnected systems (in-app via `/logs`; Telegram fired from the browser with the bot token pulled client-side via `telegram.js`). Reminders run on a client `setInterval`. Full detail in the Push review §1.

### 1.6 Deployment architecture
- No `firebase.json`, `.firebaserc`, hosting config, CI workflow, or build step. `package.json` deps are only `firebase` + `puppeteer`. Versioning is a static `version.json` stamped by `scripts/sync-version.mjs`.
- It is a hand-deployed static site against a single Firebase project (`schedule-driver-pbsi`, `asia-southeast1`). The version oracle is served same-origin as the app.

### 1.7 Strengths / Limitations / Risks

**Strengths**
- Clean module boundaries; `logAction()` already centralizes events.
- User records already username-keyed (UID migration is cheap).
- Surgical RTDB writes (no root overwrites); daily backups; atomic counters already use `runTransaction`.
- Mature PWA update/version pipeline to preserve.

**Limitations**
- No real identity → rules cannot be written at all.
- Plaintext PINs, world-readable.
- All authorization is client-side and trivially bypassable.
- Secrets (Telegram bot token) exposed to clients.
- No server → no scheduled work, no trusted fan-out, no push.

**Future risks if unaddressed**
- Every new module (Engineering, Asset, AI) would inherit an unsecured database.
- Locking rules *after* more write paths exist gets riskier each release — the cost of delay compounds.
- AI Operations Assistant on an unauthenticated DB is a non-starter.

---

## Phase 2 — Firebase Authentication Strategy

| Option | What it gives rules | UX disruption | Migration effort | Verdict |
|---|---|---|---|---|
| **A. PIN UX + Anonymous Auth** | `request.auth != null` only. The anonymous `uid` is random per device, **not** tied to the person — rules cannot express "this user owns this record" or "is admin". Would need a side `/uid_to_username` map and still couldn't carry role. | None | Low | ❌ Insufficient — authenticates the *session*, not the *user*. |
| **B. PIN UX + Custom Authentication** | A Cloud Function verifies username+PIN and mints a **custom token** with `uid = username` and custom claims `{ role }`. Rules can then use `auth.uid === $username` and `auth.token.role === 'admin'`. | **None** — login form unchanged | Low–Medium (no re-keying; PIN check moves server-side) | ✅ **Recommended** |
| **C. Full email/password** | Real identity + Firebase-managed credentials | **High** — every user needs an email; new login UX; password resets | High | ❌ Overkill and disruptive for an internal PIN-based tool |

### Recommendation: **Option B — Custom Authentication.**

It is the only option that yields **true per-user identity *and* a role claim** — the two things rules need — while keeping the PIN login UX byte-for-byte identical. Because users are already keyed by username, `uid = username` means **zero data re-keying**. As a bonus, the PIN comparison moves into the Function (server-side), so the plaintext PIN no longer needs to be client-readable.

> This supersedes the Push review's tentative "minimum Anonymous Auth" note. With owner-scoped push tokens and role-gated rules as hard requirements — and a Cloud Function being built anyway — custom tokens are the correct target, and Anonymous Auth cannot meet the requirement.

**Flow:**
```
Login form (unchanged) → POST {username, pin} → Cloud Function verifyPin()
   → admin SDK reads /users/{username}, compares pin
   → mints customToken(uid=username, claims={ role })
   → client signInWithCustomToken(token)
   → onAuthStateChanged hydrates the SAME localStorage session blob (sync cache preserved)
```

**Compatibility tactic (critical):** keep `getCurrentUser()` synchronous by treating `localStorage` as a write-through cache of the Firebase auth state. `onAuthStateChanged` updates the blob; the 60+ synchronous readers are untouched. RTDB access must be **gated on auth-ready** (see Phase 8).

**Follow-up (not blocking):** hash PINs server-side (e.g. bcrypt/scrypt in the verify Function) and remove client read access to `pin`. Can be a later sub-phase since reads get locked anyway.

---

## Phase 3 — Security Rules Foundation

**Principle:** deny by default; grant by role claim and ownership. Authenticated-only baseline first, then per-path tightening (staged rollout in Phase 8/9).

```jsonc
{
  "rules": {
    ".read": false,
    ".write": false,

    "users": {
      // Admins manage users; a user may read their OWN record.
      ".read":  "auth.token.role === 'admin'",
      "$uid": {
        ".read":  "auth.uid === $uid || auth.token.role === 'admin'",
        ".write": "auth.token.role === 'admin'",
        // pin must never be client-readable once custom-auth verifies server-side
        "pin": { ".read": false }
      }
    },

    "assignments": {
      ".read":  "auth != null",                       // all signed-in roles view schedule
      "$id": {
        // admins write freely; assigned driver may update lifecycle fields (start/complete/odometer)
        ".write": "auth.token.role === 'admin' || (auth != null && data.child('driverUsername').val() === auth.uid)"
      }
    },

    "driver_requests": {
      ".read": "auth != null",
      "$id": {
        // bidang creates/owns; admin approves/rejects; comments are children (below)
        ".write": "auth.token.role === 'admin' || (auth.token.role === 'bidang' && (!data.exists() || data.child('requesterId').val() === auth.uid))",
        "comments": {
          // embedded thread — participant write (admin, owning bidang, assigned driver)
          ".write": "auth != null"   // refine to participant check via parent fields
        }
      }
    },

    "notifications": {            // per-user inbox (new)
      "$uid": {
        ".read":  "auth.uid === $uid",
        ".write": "false"          // only the engine (admin SDK) writes
      }
    },

    "push_subscriptions": {       // device tokens (new) — owner-only
      "$uid": {
        ".read":  "auth.uid === $uid",
        ".write": "auth.uid === $uid"
      }
    },

    "logs": {
      ".read":  "auth.token.role === 'admin'",   // audit center is admin-only already
      // clients may append; the engine treats authoritative data nodes as truth
      "$id": { ".write": "auth != null && !data.exists()" }
    },

    "settings": {
      ".read":  "auth != null",
      ".write": "auth.token.role === 'admin'",
      "telegram": { ".read": "auth.token.role === 'admin'" }  // bot token never to normal clients
    }
  }
}
```

**Notes**
- `comments` is **not** a top-level node; its rule lives under `driver_requests/$id/comments`. Tighten the placeholder `auth != null` to a participant check using the parent request's `requesterId` / `driver` fields.
- `logs` stays append-only and admin-read (matches today's admin-only Audit Center).
- `settings/telegram` becomes admin-read-only; once Telegram send moves server-side (Phase 5) the bot token can be removed from any client-reachable path entirely.
- **Maintainability:** rules key off **two primitives only** — `auth.uid` (ownership) and `auth.token.role` (role). Every future module reuses the same two checks; no per-feature rule sprawl.

---

## Phase 4 — Cloud Functions Foundation

**Goal:** introduce Functions with zero disruption — deploy *dormant* first, cut over deliberately.

### Recommended structure
```
/ (repo root — existing static app unchanged)
├─ firebase.json            # hosting (existing static) + functions + database rules
├─ .firebaserc              # project alias → schedule-driver-pbsi
├─ database.rules.json      # Phase 3 rules (versioned, instantly republishable = rollback)
├─ functions/
│  ├─ package.json          # isolated deps (firebase-admin, firebase-functions)
│  ├─ index.js              # exports only
│  ├─ src/
│  │  ├─ auth/verifyPin.js          # custom-token minting (Phase 2)
│  │  ├─ notifications/engine.js    # event → channel fan-out (Push review §3)
│  │  ├─ notifications/telegram.js  # server-side bot send (Phase 5)
│  │  ├─ events/onAssignmentWrite.js / onRequestWrite.js
│  │  └─ scheduled/reminders.js     # H-1 / H-2 (replaces client timers)
│  └─ .env / secrets        # see below
└─ ...static app (js/, css/, *.html) — untouched
```

- **Deployment strategy:** adopt **Firebase Hosting** for the static app (co-locates with Functions, same origin as `version.json`, free TLS, instant rollback) + **Functions** in `asia-southeast1` (match the RTDB region for latency). Hosting deploy of the existing static files is behavior-neutral.
- **Environment / secrets:** Telegram bot token, custom-auth signing (service account is implicit to the Functions runtime) → **Cloud Secret Manager** via `functions.runWith({ secrets: [...] })` / `defineSecret`. Never in code or client. Remove `/settings/telegram/botToken` from the DB once migrated.
- **Monitoring:** Cloud Functions logs + error reporting; a trivial `health` HTTPS function for smoke tests; alert on auth-verify failure rate and FCM/Telegram send error rate.
- **Runtime:** Node 20, 2nd-gen functions, min-instances 0 (cost) — accept cold starts for an internal tool; bump `verifyPin` to min-instances 1 later if login latency matters.

---

## Phase 5 — Telegram Migration Strategy

**Current:** `Browser → api.telegram.org` (token client-side).
**Target:** `App → Cloud Function → api.telegram.org` (token server-side).

- **Security benefits:** bot token leaves the client entirely; send is gated by auth + role; centralizes rate-limiting and retry; removes the CORS/`x-www-form-urlencoded` workaround in `telegram.js`.
- **Migration strategy (no user-facing change):**
  1. Build a `sendTelegram` callable/event-driven Function that reproduces `telegram.js#sendNotification` exactly (multi-chat-id fan-out, `notificationsEnabled` gate, Markdown).
  2. Route the **engine** (Push review §3) through it; the message templates (`build*Message`) move server-side unchanged.
  3. Flip `notification-service.js` callers from direct send to "emit event"; output is byte-identical Telegram messages.
- **Rollback strategy:** keep `telegram.js` client path behind a feature flag (`window.TELEGRAM_API_BASE_URL` already supports a proxy mode — point it at the Function, or disable to fall back to direct). Because messages are identical, rollback is a flag flip with no data change.

---

## Phase 6 — Event Architecture Foundation

**Reuse, don't reinvent:** `/logs` already is the event stream. Formalize it into a versioned envelope and a naming convention so all current and future modules emit consistently.

### Event schema (envelope)
```jsonc
{
  "id":        "<pushId>",
  "type":      "assignment.created",       // domain.action (see convention)
  "v":         1,                           // schema version
  "actor":     { "uid": "budi", "role": "admin", "displayName": "Budi" },
  "subject":   { "kind": "assignment", "id": "ASG-20260613-XXXX" },
  "metadata":  { "driverUsername": "...", "requesterId": "...", "date": "...", ... },
  "ts":        "<ISO8601>"
}
```

### Naming convention
- `domain.action`, lower snake within parts: `assignment.created`, `assignment.cancelled`, `request.approved`, `request.rejected`, `comment.added`, `user.archived`.
- **Backward compatibility:** the engine maps legacy flat actions already in `/logs` (`request_created`, `assignment_cancelled`, …) to the new namespaced types, so historical entries and `notifications.js` keep working during transition.

### Storage approach
- Keep `/logs/{id}` as the canonical, append-only event store (admin-read; client-append). This is the lowest-surface choice and already wired into the in-app center and Audit Center.
- For **authoritative correctness**, the engine derives P1 notifications from data-node triggers (`onAssignmentWrite`, `onRequestWrite`) and uses `/logs` for breadth/enrichment — exactly the hybrid in the Push review §3.2. The envelope above is what triggers normalize *into* before fan-out.
- **One new source required:** `comments.js` currently emits nothing — add a `comment.added` event when a comment is saved (the only genuinely new emitter the foundation needs).

This makes Analytics Governance, Operational Intelligence, and the AI Assistant first-class consumers of the same stream — they read events, they don't each re-instrument the app.

---

## Phase 7 — Future Compatibility

| Future capability | How this foundation already serves it |
|---|---|
| **Notification Engine / Push** | Auth identity → owner-scoped `push_subscriptions` rules; Functions → trusted sender; events → single fan-out source. (Direct unblock.) |
| **Engineering Module / Asset Management** | New top-level nodes inherit the **same two rule primitives** (`auth.uid`, `auth.token.role`); new `domain.action` events need no engine change. |
| **Analytics Governance** | Already event-shaped (`assignment_classified` etc.); slots into the formalized envelope. |
| **Operational Intelligence** | Reads the unified `/logs` event stream + authoritative nodes — no new instrumentation. |
| **AI Operations Assistant** | Requires a secured DB and a server boundary to hold model/API secrets and enforce per-user data scope — this foundation provides exactly that. |

**Design rule to avoid future redesigns:** model identity as `uid + role claim`, model authorization as rules over `auth.uid`/`auth.token.role`, model everything that happens as a typed event. New modules add nodes, claims values, and event types — never new auth/rule/engine machinery.

---

## Phase 8 — Migration Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Locking RTDB rules breaks the live app** (all reads/writes currently unauthenticated) | High | Stage it: (1) cut over custom auth so every client is signed in; (2) deploy `auth != null` baseline; (3) tighten per-path. Validate on the **Emulator Suite** / a staging project first. Rules are versioned → rollback = republish previous in seconds. |
| **Async auth vs synchronous `getCurrentUser()`** (60+ call sites) | High | Keep `localStorage` as a write-through cache hydrated by `onAuthStateChanged`; do not change the synchronous signature. |
| **RTDB access before auth-ready (race)** | High | Gate `initFirebaseSync()` and all reads behind an "auth resolved" promise; the app already has an init sequence in `app.js` to hook. |
| **Custom-auth Function down → no one can log in** | High | `verifyPin` min-instances ≥1; health check + alert; short-lived **break-glass** path (temporary direct-PIN fallback behind a flag) during rollout only. |
| **Plaintext PIN exposure window** | Medium | Lock `users/$uid/pin` read to `false` immediately at rules cutover; hash PINs in a follow-up sub-phase. |
| **Telegram regression** | Low–Medium | Identical templates + feature-flag rollback (Phase 5). |
| **Data migration** | Low | None required — username-keyed users map directly to `uid`; comments stay embedded; no schema rewrite. |
| **Cost / cold starts** | Low | Internal small/medium user base; min-instances 0 except `verifyPin`. |

---

## Phase 9 — Incremental Implementation Roadmap

Small, independently deployable, each reversible. Sub-versions under v1.11.1.

| Sub-version | Theme | Contents | Reversible by |
|---|---|---|---|
| **v1.11.1.1** | **Backend scaffold (dormant)** | Add `firebase.json` / `.firebaserc` / `functions/`; move static hosting to Firebase Hosting (behavior-neutral); deploy `health` + `verifyPin` Functions **without switching login**; commit `database.rules.json` but keep current open rules live. No client behavior change. | Don't call the new code / keep open rules |
| **v1.11.1.2** | **Identity + rules cutover** | Login calls `verifyPin` → `signInWithCustomToken`; `getCurrentUser()` becomes a write-through cache; gate RTDB on auth-ready; deploy rules in stages (`auth != null` → per-path role/owner); lock `pin` read. | Republish open rules + flag login back to direct PIN (break-glass) |
| **v1.11.1.3** | **Server Telegram + event formalization** | Move Telegram send into a Function; route `notification-service.js` through it; formalize the `/logs` event envelope + naming + legacy mapping; add `comment.added` emitter; create `notifications` / `push_subscriptions` nodes + rules (ready for the Push engine). | Telegram feature-flag fallback; event envelope is additive |

After v1.11.1.3 the platform is ready for the Push engine line (Push review's v1.11.2+) with no further foundational work.

---

## Phase 10 — Deliverables Summary

1. **Architecture assessment** — Client-only PWA; mock PIN auth with plaintext, world-readable PINs; synchronous localStorage sessions (60+ readers); no rules, no Functions, no hosting config; `/logs` already a de-facto event stream; comments embedded in requests; no `/comments`, `/notifications`, `/push_subscriptions` nodes yet.
2. **Authentication recommendation** — **Custom Authentication** (PIN UX preserved, `uid = username` ⇒ no re-keying, `role` claim for rules, PIN check moves server-side). Anonymous Auth can't scope by user; email/password is disruptive overkill.
3. **Security rules strategy** — Deny-by-default; authorize on exactly two primitives (`auth.uid` ownership, `auth.token.role`); owner-only `push_subscriptions`/`notifications`; admin-only `logs`/`users`/`settings.telegram`; `pin` unreadable; comments governed by parent request. Staged enforcement.
4. **Cloud Functions design** — Firebase Hosting + Functions (`asia-southeast1`); isolated `functions/` tree; Secret Manager for tokens; `verifyPin`, notification engine, server Telegram, data-node triggers, scheduled reminders; dormant-first deployment.
5. **Telegram migration plan** — Reproduce client send in a Function, route the engine through it, identical messages, feature-flag rollback (reuse existing proxy-mode hook).
6. **Event architecture** — Versioned `domain.action` envelope over the existing `/logs` stream; legacy action mapping for back-compat; authoritative data-node triggers for P1; add the one missing `comment.added` emitter.
7. **Risk assessment** — Top risks are rule-lock breakage and async-auth vs sync `getCurrentUser()`; mitigated by staged rules + emulator testing + write-through session cache + auth-ready gating + `verifyPin` availability/break-glass.
8. **Incremental roadmap** — v1.11.1.1 dormant scaffold → v1.11.1.2 identity + rules cutover → v1.11.1.3 server Telegram + event foundation; each reversible.

---

**DO NOT IMPLEMENT. Architecture review only.**
