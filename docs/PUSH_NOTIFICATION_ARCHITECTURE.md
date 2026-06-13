# Push Notification Foundation — Architecture Review (v1.11.1)

**Status:** Design / architecture review only. No implementation.
**Author:** Architecture review, 2026-06-13
**Scope:** Make web push the primary notification channel for Sarpras Operations; Telegram becomes secondary/optional.

---

## 0. The one finding that reframes everything

The brief lists "Firebase Authentication" and a server-capable stack, but the actual codebase is a **100% client-side static PWA with no backend**:

- **No Firebase Auth.** Login is a mock PIN check (`auth.js` → `login()`): it reads `user.pin` from the database and compares strings, storing the session in `localStorage` (`pbsi_current_user`). There is no ID token, no `request.auth` available to security rules.
- **No server.** No `functions/`, no `firebase.json`, no `.firebaserc`, no `*.rules.json` in the repo. Everything runs in the browser.
- **Telegram is sent from the browser.** `telegram.js` calls `api.telegram.org` directly; the bot token is read client-side from `/settings/telegram/botToken`. This works only because Telegram's bot API tolerates client calls — it is a model that **does not transfer to push**.
- **Reminders run client-side.** `checkAndSendH1Reminders` / `checkAndSendHoursReminders` execute on a `setInterval` in whatever browser is currently open (`app.js:7296`). If no admin tab is open, no reminder fires.
- **RTDB appears open.** No rules file is committed; the safety-guard/backup code assumes unrestricted read/write.

**Why this matters for push:** A push message can only be *triggered* by a party holding a secret (the VAPID private key for Web Push, or the FCM server credential for FCM). That secret **cannot** live in the browser. Therefore, regardless of protocol, **v1.11.1's foundational work is introducing the first trusted server-side component** (a Firebase Cloud Function). The protocol choice (Phase 2) is secondary to this.

This review is written around that reality.

---

## Phase 1 — Current-State Assessment

### 1.1 Existing notification architecture

There are **two parallel, unconnected notification systems** today:

| System | File | Channel | Trigger | Destination | Persistence |
|---|---|---|---|---|---|
| **In-App Notification Center** | `notifications.js` | UI badge + modal list | Reads `/logs` stream | Current user (role/ownership filtered) | `/logs` in RTDB + `localStorage` read-state |
| **Telegram Service** | `notification-service.js` → `telegram.js` | Telegram bot message | Fire-and-forget call from the acting client | Resolved per recipient role | None (transient) |

They are **driven by the same events but share no code**. Each event triggers both paths independently from `app.js`.

### 1.2 Existing event sources

Every operational mutation in `app.js` does two things: (1) writes an audit entry via `logAction()` (`logs.js`) and (2) fires Telegram notifier(s). The event taxonomy already exists and is consistent:

| Business event | `logAction` action | Telegram notifier (`app.js`) | In-app (`notifications.js` whitelist) |
|---|---|---|---|
| Request created (bidang) | `request_created` | `sendNewRequestNotificationToAdmins` | ✅ `request_created` |
| Request approved → assignment(s) | `request_approved` / `assignment_created` | `sendRequestApprovedNotification` + `sendNewAssignmentNotificationToDriver` | ✅ |
| Request rejected | `request_rejected` | `notifyRequesterRejected` (via type) | ✅ |
| Direct assignment created | `assignment_created` | `sendNewAssignmentNotificationToDriver` | ✅ |
| Assignment completed | (logged) | — | ✅ `assignment_completed` |
| Assignment cancelled | `assignment_cancelled` | `sendAssignmentCancelledNotification` | ✅ |
| H-1 reminder | — | `checkAndSendH1Reminders` (client timer) | ❌ (Telegram only) |
| H-2 reminder | — | `checkAndSendHoursReminders` (client timer) | ❌ (Telegram only) |
| **Comment added** | ❌ none | ❌ none | ❌ none |

**Key observations:**

1. **`/logs` is already a de-facto event bus.** `logAction()` writes a structured, append-only stream (`{ userId, username, displayName, action, targetId, metadata, timestamp }`) for nearly every event. `notifications.js` already *subscribes* to it to render the in-app center. This is the natural seam for a unified engine.
2. **Comments emit nothing.** `comments.js` persists the comment via `onCommentSaveCallback` but logs no event and sends no notification. The brief lists "Comment Added" as a Priority-1 push — so this event source must be *created*, not just rerouted.
3. **Notification logic is duplicated and divergent.** Telegram recipient resolution lives in `notification-service.js` (`findDriverUser`, role fan-out). In-app visibility lives in `notifications.js` (`isVisibleToUser`). They encode the *same* "who should see this" rules in two different places — a maintenance hazard the new engine should collapse.
4. **"Notified" depends on who is online.** Telegram fan-out runs in the *acting* client's browser; reminders run in *any* open browser. There is no authoritative, always-on sender. Push *requires* one — which fixes this class of bug as a side effect.

### 1.3 Existing notification destinations

- **In-app:** badge (`#notificationDot`, bottom-nav dot, header dot) + `#modalNotifications` list, filtered by `isVisibleToUser` (admin sees all; bidang sees own-request lineage; driver sees own assignments; viewer none).
- **Telegram:** one or more chat IDs per user (`telegramChatIds` object, legacy `telegramChatId` string), gated by `user.notificationsEnabled`.
- **User schema today** (`users.js`): `{ id, username, displayName, role, telegramChatIds, notificationsEnabled, pin, active, ... }`. There is **no field for push tokens, devices, or per-channel preferences** — these must be added.

### 1.4 PWA / Service Worker readiness

- `service-worker.js` is a clean cache/offline worker (precache `offline.html`, network-first nav, cache-first static, version-stamped cache busting). It has **no `push` or `notificationclick` handlers** — these must be added (or hosted in a separate `firebase-messaging-sw.js`).
- `pwa.js` handles install/update lifecycle robustly (install prompt capture, iOS A2HS modal, update banner, version oracle). It has **no notification-permission flow** — to be added in Phase 5.
- The update model (version-stamped SW, `SKIP_WAITING` banner) is mature and must be preserved; the messaging SW must not break it.

---

## Phase 2 — Push Architecture Recommendation

### Option A — Firebase Cloud Messaging (FCM)

| Dimension | Assessment |
|---|---|
| **Pros** | Native to the existing Firebase project (one console, one SDK already loaded for RTDB). SDK handles VAPID, payload encryption, token rotation, and Safari/iOS quirks for you. Server send is a 3-line `admin.messaging().send()` from a Cloud Function. Topic messaging + multicast built in. Token lifecycle errors (`messaging/registration-token-not-registered`) returned in a clean shape for cleanup. |
| **Cons** | Adds `firebase-messaging` (~30–40 KB gz) + a `firebase-messaging-sw.js`. Vendor lock-in — but the project is already all-in on Firebase. Requires a Web Push certificate (VAPID key pair) generated in the Firebase console. |
| **Complexity** | **Low–Medium.** SDK abstracts the hard parts. Most effort is the Cloud Function + token storage, which any option needs. |
| **Browser compat** | Chrome/Edge/Firefox (desktop + Android): full. Safari macOS 16+: supported via the FCM JS SDK. iOS/iPadOS 16.4+: supported **only as an installed (A2HS) PWA**. |
| **Mobile compat** | Android Chrome: excellent. iOS: works for installed PWAs on 16.4+ — the single biggest UX caveat (covered in Phase 5/6). |
| **Maintenance** | Lowest. Google maintains the protocol layer; the app maintains only token storage + send logic. |

### Option B — Web Push + VAPID (raw)

| Dimension | Assessment |
|---|---|
| **Pros** | No extra SDK; uses the native `PushManager`. No FCM dependency; fully standards-based; portable off Firebase. |
| **Cons** | You implement and maintain everything FCM gives free: VAPID key handling, `PushSubscription` storage, **payload encryption (aes128gcm)** on the server (via a lib like `web-push`), per-endpoint send with retry, and the Safari subscription quirks. More code, more surface area. |
| **Complexity** | **Medium–High.** The server send path (encryption, endpoint-specific TTLs, 410/404 cleanup) is real work. |
| **Browser/mobile compat** | Identical *underlying* support to FCM (both ride the same browser Push API), but you absorb the cross-browser edge cases yourself. |
| **Maintenance** | Higher — you own the protocol glue. |

### Recommendation: **Option A — Firebase Cloud Messaging.**

For an internal, small/medium, Firebase-first enterprise app the calculus is one-sided:

- The send side is already going to be a Cloud Function (mandatory — see Phase 0). FCM makes that function trivial and gives multicast + automatic invalid-token reporting.
- The browser SDK eliminates exactly the parts (encryption, Safari handling, token refresh) that make raw Web Push expensive to maintain with a tiny team.
- It reuses the existing Firebase project, billing, and console. Zero new vendor.

The only thing FCM "locks in" is the transport, and the project is already committed to Firebase for data, so there is no marginal lock-in cost.

> **Both options still require the Cloud Function + token database. FCM simply minimizes the code you maintain on top of that.**

---

## Phase 3 — Notification Engine Design

### 3.1 Principle: generate the event once, fan out server-side

Today the *acting client* fans out to channels. That is the root cause of "notifications depend on who's online" and of the duplicated recipient logic. The target architecture moves fan-out to a single **server-side Notification Engine** (Cloud Function), so a business event is produced once and every channel subscribes to it.

```
            Business event (written once, authoritatively)
                              │
                              ▼
                ┌──────────────────────────┐
                │   Notification Engine     │  ← Cloud Function (Firebase)
                │   (recipient resolution,  │
                │    de-dupe, preferences)  │
                └──────────────────────────┘
                  │            │            │
        ┌─────────┘            │            └──────────┐
        ▼                      ▼                       ▼
  In-App Notification    Push Notification        Telegram Notification
  (write /notifications  (FCM multicast to        (existing bot send,
   inbox per user)        user's device tokens)    now server-side)
```

### 3.2 Where the event comes from

Two candidate sources already exist; use a **hybrid**:

1. **Authoritative data triggers (preferred for P1 correctness):** Cloud Functions on `onCreate`/`onUpdate` of `/assignments/{id}` and `/driver_requests/{id}`. These fire from the *true* state change, so they cannot be forged or skipped by an offline client. Status transitions (`pending→approved`, `→cancelled`) drive Approved/Cancelled events.
2. **The `/logs` stream (reuse for breadth):** `logAction()` already emits a typed, metadata-rich event for almost everything. A function on `/logs/{id}` `onCreate` can fan out events that have no dedicated data node (e.g. comment-added once it logs one).

**Recommended:** introduce a single canonical event channel the engine reads from — either keep using `/logs` as the bus (lowest new surface; it already carries `action` + `metadata` + actor) **or** add a dedicated `/events/{id}` outbox written alongside logs. Given `notifications.js` *already* consumes `/logs`, standardizing on `/logs` as the event bus is the lowest-friction path. Trade-off: `/logs` entries are currently client-written and forgeable — acceptable for an internal app at launch, but the engine should treat the authoritative `/assignments` and `/driver_requests` triggers as the source of truth for the P1 events and use `/logs` for enrichment/breadth. This is the main thing to lock down in Phase 8.

### 3.3 Unified recipient resolution

Collapse the two divergent implementations (`notification-service.js#findDriverUser` + role fan-out, and `notifications.js#isVisibleToUser`) into **one server-side resolver**: `resolveRecipients(eventType, payload) → userId[]`. Every channel consumes the same recipient list. The existing rules port directly:

- **Admin** → all operational events.
- **Bidang** → events whose `metadata.requesterId === user.id` (own-request lineage) + their own `request_created`.
- **Driver** → assignment events where `metadata.driverUsername === user.username` (with legacy `metadata.driver === displayName` fallback already present in `isVisibleToUser`).

### 3.4 Per-channel dispatch contract

```
dispatch(event):
  recipients = resolveRecipients(event.type, event.payload)
  for user in recipients:
    prefs = user.notificationChannels            # { inApp, push, telegram }
    if prefs.inApp:    writeInbox(user.id, event)            # /notifications/{userId}/{id}
    if prefs.push:     sendFCM(user.deviceTokens, render(event, 'push'))
    if prefs.telegram: sendTelegram(user.telegramChatIds, render(event, 'telegram'))
```

- **Message templates** already exist as pure builders in `notification-service.js` (`buildAssignmentCreatedMessage`, etc.). Refactor them into channel-agnostic `render(event, channel)` so the same event yields a Telegram Markdown body, an FCM `{title, body, data}`, and an in-app card from one source — no triplicated copy.
- **De-duplication** (currently `localStorage`-keyed for reminders, per-browser) moves server-side: a `/notifications_sent/{eventKey}` guard makes reminders fire exactly once globally instead of once-per-open-browser.
- **In-app today reads `/logs`; keep that working.** Either continue rendering the badge from `/logs` (no change) or migrate to a per-user `/notifications` inbox for true read/unread-per-user state. Recommended end state: per-user inbox (replaces the `localStorage` `pbsi_notif_read_at` global read marker, which can't track per-device state).

---

## Phase 4 — Device Registration & Storage Design

### 4.1 Stable device identity

FCM tokens rotate and are not stable identifiers. Mint a **device ID** once per install and persist it (localStorage, mirrored to IndexedDB for durability):

```
pbsi_device_id = crypto.randomUUID()   // created on first run, never changes for this install
```

The FCM token is then stored *under* the device ID, so token rotation updates one record instead of creating duplicates.

### 4.2 Recommended database structure

```
/push_subscriptions/{userId}/{deviceId} = {
  token:       "<fcm-registration-token>",
  platform:    "android-chrome" | "ios-safari" | "desktop-chrome" | "other",  // reuse pwa.js _detectPlatform()
  userAgent:   "<navigator.userAgent>",
  appVersion:  "1.11.1",
  createdAt:   "<ISO>",
  lastSeenAt:  "<ISO>",          // refreshed on each app open → drives stale cleanup
  enabled:     true              // user toggled push off without uninstalling
}
```

- **Multi-device is native:** Android phone, iPhone, and desktop each get a distinct `{deviceId}` child under the same `{userId}`. Send = multicast over `Object.values(/push_subscriptions/{userId}).map(d => d.token)`.
- **Token refresh** (`onTokenRefresh` / re-`getToken`) overwrites the same `{deviceId}` record — no orphan accumulation.

### 4.3 Per-channel preferences (new user fields)

```
/users/{id}/notificationChannels = {
  inApp:    true,    // default on
  push:     false,   // off until the user completes the Phase 5 opt-in
  telegram: true     // preserves today's behavior; now "secondary/optional"
}
```

This supersedes the single `notificationsEnabled` boolean (keep it as a legacy fallback/migration source). `telegramChatIds` is unchanged.

---

## Phase 5 — Permission Flow Design

**Goal:** never fire the raw browser permission prompt cold. A denied prompt is effectively permanent and poisons future attempts.

```
  ┌────────────────────────────────────────────────────────────┐
  │ 1. Soft pre-permission (in-app education)                   │
  │    - Shown contextually, NOT on first load. Trigger after a │
  │      meaningful action (e.g. after a driver opens their     │
  │      first assignment, or via a header "Aktifkan Notifikasi"│
  │      affordance).                                           │
  │    - Card/modal: "Dapatkan notifikasi langsung saat ada     │
  │      penugasan, persetujuan, atau pengingat — tanpa perlu   │
  │      membuka aplikasi."  [Aktifkan]  [Nanti]                │
  └────────────────────────────────────────────────────────────┘
                 │ user taps [Aktifkan]
                 ▼
  ┌────────────────────────────────────────────────────────────┐
  │ 2. iOS gate (conditional)                                   │
  │    - If ios-safari AND not installed → show the existing    │
  │      showIOSInstallModal() first. iOS push requires an      │
  │      installed (A2HS) PWA on 16.4+. Do NOT request          │
  │      permission in the browser tab — it will fail.          │
  └────────────────────────────────────────────────────────────┘
                 │ (installed / non-iOS)
                 ▼
  ┌────────────────────────────────────────────────────────────┐
  │ 3. Native browser prompt                                    │
  │    Notification.requestPermission()                         │
  └────────────────────────────────────────────────────────────┘
                 │ granted
                 ▼
  ┌────────────────────────────────────────────────────────────┐
  │ 4. Token acquisition + registration                        │
  │    getToken(messaging, { vapidKey, serviceWorkerReg })      │
  │    → write /push_subscriptions/{userId}/{deviceId}          │
  │    → set notificationChannels.push = true                   │
  │    → confirmation toast: "Notifikasi aktif di perangkat ini"│
  └────────────────────────────────────────────────────────────┘
```

- **Re-entry / denied handling:** if `Notification.permission === 'denied'`, the education card shows OS-specific "re-enable in settings" guidance instead of a dead button. Persist a "soft-asked" timestamp (mirror the existing `pbsi_pwa_install_dismissed` 7-day TTL pattern) so the soft prompt isn't nagging.
- **Reuse existing platform detection** (`pwa.js` `_detectPlatform`, `_detectInstalled`) to drive the iOS gate — no new detection code.

---

## Phase 6 — Notification Types & Rollout Order

| Type | Priority | Recipients | Source |
|---|---|---|---|
| Assignment Created | P1 | Driver (+ requester for request-based) | `/assignments` onCreate |
| Assignment Approved | P1 | Requester (bidang) | `/driver_requests` status→approved |
| Assignment Cancelled | P1 | Driver + (admin or requester, per canceller) | `/assignments` status→cancelled |
| Comment Added | P1 | Thread participants (admin, owning bidang, assigned driver) **minus author** | **new** — comment write must emit an event |
| H-1 Reminder | P1 | Driver + requester | scheduled function |
| H-2 Reminder | P1 | Driver + requester | scheduled function |
| Driver Start Assignment | P2 | Admin + requester | `/assignments` status→ongoing |
| Driver Complete Assignment | P2 | Admin + requester | `/assignments` status→completed |

**Recommended rollout order (de-risked):**

1. **Foundation first (no user-facing pushes):** Cloud Function + token DB + permission flow + SW push/click handlers, validated with a single manual "test notification" to the engineer's own device.
2. **Assignment Created** — highest value, simplest fan-out (one primary recipient), drives the most driver engagement.
3. **Assignment Approved + Assignment Cancelled** — reuse the same `/driver_requests` / `/assignments` triggers.
4. **Reminders (H-1, H-2)** — requires the scheduled function; ship after the trigger-based events prove the pipeline. This *also fixes* the current "reminders only fire if a browser is open" defect.
5. **Comment Added** — requires adding a comment event source (`comments.js` currently emits nothing); lower risk to do once the engine is proven.
6. **P2 Start/Complete** — operational visibility, lowest urgency.

**Comment caveat:** "Comment Added" is the only P1 with no existing event. Plan a small `comments.js` change to log/emit a `comment_added` event (with `requestId` + participant context) — this is the one new *source* the foundation needs.

---

## Phase 7 — Notification Click Routing

### 7.1 Payload contract

Every push carries a `data` payload with a deep-link target (data-only or notification+data):

```
data: {
  type:    "assignment_created",
  url:     "/?view=assignment&id=ASG-20260613-XXXX",   // app-resolvable deep link
  entityId:"ASG-20260613-XXXX"
}
```

### 7.2 Service worker handler (to be added)

```
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find(c => c.url.includes(self.registration.scope));
    if (existing) { await existing.focus(); existing.postMessage({ type:'NAV', url: target }); }
    else { await clients.openWindow(target); }
  })());
});
```

- **Focus-or-open:** if a window is already open, focus it and `postMessage` the route (the app's existing routing reads the param and navigates the detail modal). Otherwise `openWindow(target)`.
- **App side:** add a `message` listener that maps `{type:'NAV', url}` onto the existing assignment-detail / request open flow. The deep-link param (`?view=assignment&id=…`) should also be honored on cold start so `openWindow` lands correctly.

### 7.3 Cross-platform

- **Android / Windows (Chrome/Edge):** full `notificationclick` + `openWindow`/`focus`. Works as above.
- **iOS 16.4+ (installed PWA):** `notificationclick` is supported; `clients.openWindow` lands inside the installed app. Must be installed — covered by the Phase 5 gate.
- **Desktop Safari 16+:** supported via FCM SDK; same handler.

> The `firebase-messaging-sw.js` (FCM background handler) and the existing `service-worker.js` must coexist. Recommended: keep caching/offline in `service-worker.js` and add a *separate, minimal* `firebase-messaging-sw.js` for `onBackgroundMessage` + `notificationclick` (the standard FCM layout). Do **not** fold FCM into the version-stamped cache SW in a way that risks the existing update flow.

---

## Phase 8 — Security Review

| Concern | Current state | Recommendation |
|---|---|---|
| **User privacy / token exposure** | No tokens today; RTDB has no committed rules (assumed open). | FCM tokens are device-linked PII-adjacent. They must be readable/writable **only by the owning user** and the Cloud Function (admin SDK bypasses rules). This forces the auth gap below. |
| **Auth gap (root issue)** | Mock PIN auth in `localStorage`; no `request.auth`, so RTDB rules can't scope by user. | Introduce a real identity for rules: minimum **Firebase Anonymous Auth** bound to the PIN login, or custom tokens minted by a function. Without it, `/push_subscriptions` cannot be access-controlled and *anyone* could read every device token. **This is a prerequisite for shipping push safely.** |
| **Device ownership** | n/a | Tokens stored under `/push_subscriptions/{userId}/{deviceId}`; rules: `auth.uid === userId` for read/write. |
| **Revoked / logged-out devices** | Logout only clears `localStorage` session. | On logout: delete `/push_subscriptions/{userId}/{thisDeviceId}` and call `deleteToken()`. A device should stop receiving pushes the moment its user logs out. |
| **Multiple devices** | n/a | Per-`deviceId` records (Phase 4) isolate revocation — logging out one device leaves the others working. |
| **Stale subscriptions** | Telegram has no cleanup. | Cloud Function send inspects FCM responses: on `messaging/registration-token-not-registered` (HTTP 404/410 equivalent) **delete that token record**. Also prune records whose `lastSeenAt` is older than N days (e.g. 60–90). |
| **Telegram token exposure** | Bot token pulled to the browser (`telegram.js`). | Moving send into the Cloud Function lets the bot token live server-side only — a free security win from the same refactor. |
| **Event forgery** | `/logs` is client-written. | Drive P1 pushes from authoritative `/assignments` / `/driver_requests` triggers, not solely from client-written `/logs`. Lock RTDB rules so clients can append logs but the engine trusts data nodes. |

---

## Phase 9 — Future Compatibility

The engine must serve modules beyond driver scheduling (Operational Intelligence, AI Operations Assistant, Engineering, Asset Management). Design choices that keep it open:

- **Event-typed, not feature-coded.** The engine dispatches on an `eventType` string + generic `payload`/`metadata` — exactly the shape `logAction()` already uses. A new module emits a new `eventType`; no engine change. (Mirrors how the app already added `assignment_classified`, `request_classified`, etc. as new actions without touching the log infrastructure.)
- **Channel registry.** `inApp | push | telegram` are dispatch plugins behind a common `send(event, recipients)` interface. Adding email or WhatsApp later = one new plugin, no engine rewrite.
- **Recipient resolver as a pure function** keyed by event type — new modules register new resolution rules without forking the dispatcher.
- **Per-user `notificationChannels`** is a map, not booleans-per-feature — future per-category preferences (e.g. "mute analytics digests") extend it without schema breakage.
- **Topic/segment readiness.** FCM topics allow broadcast (e.g. "all admins", "engineering on-call") for future digest/alert features without enumerating tokens.

This is the same additive, foundation-then-features pattern the codebase already follows (PWA Foundation → Install → Update → Push; Analytics Foundation → Filters → Trend Engine → Governance).

---

## Phase 10 — Deliverables Summary

### 1. Current-state assessment
Two unconnected notification systems (in-app via `/logs`, Telegram via direct client calls) driven by a consistent event taxonomy already emitted through `logAction()`. **No backend, no Firebase Auth, no RTDB rules, no SW push handler.** Comments emit no events. Reminders run client-side and only when a browser is open.

### 2. Architecture recommendation
**FCM**, with the real foundational work being the introduction of the **first Cloud Function** (the Notification Engine) + a **real auth identity** for RTDB rules. Protocol choice is secondary to standing up a trusted sender.

### 3. Database design
- `/push_subscriptions/{userId}/{deviceId}` — token, platform, appVersion, createdAt, lastSeenAt, enabled.
- `/users/{id}/notificationChannels` — `{ inApp, push, telegram }`.
- (optional) `/notifications/{userId}/{id}` — per-user inbox replacing the global `localStorage` read marker.
- (optional) `/notifications_sent/{eventKey}` — server-side dedupe for reminders.

### 4. Notification engine design
Server-side Cloud Function: one authoritative event → `resolveRecipients()` → per-channel dispatch (in-app / push / telegram) using channel-agnostic `render(event, channel)` templates refactored from the existing `build*Message` functions. Fixes duplicated recipient logic and "depends on who's online."

### 5. Permission flow design
Soft in-app education → iOS install gate (conditional) → native prompt → token registration. Never cold-prompt. Reuse existing platform/install detection and the 7-day-dismiss pattern.

### 6. Security considerations
Real identity (Firebase Anonymous/custom token) is a **prerequisite**; owner-scoped RTDB rules for tokens; logout/stale/invalid-token cleanup in the engine; move the Telegram bot token server-side; drive P1 pushes from authoritative data nodes, not forgeable client logs.

### 7. Implementation roadmap
1. Stand up Firebase project for Functions + real auth identity + RTDB rules (security prerequisite).
2. Token DB + permission flow + SW push/`notificationclick` handlers (`firebase-messaging-sw.js`) — validate with a manual self-test.
3. Notification Engine function + unified recipient resolver + `render(event, channel)` refactor; route **Telegram through the engine** (proves the engine without any new user-facing surface).
4. Enable **Push** for Assignment Created → Approved → Cancelled (trigger-based).
5. Scheduled function for H-1 / H-2 reminders (also fixes the client-timer defect).
6. Add `comment_added` event source + Comment push.
7. P2 Start/Complete; then per-category preferences / topics for future modules.

### 8. Estimated version breakdown

| Version | Theme | Contents |
|---|---|---|
| **1.11.1** | **Push Foundation (no user pushes)** | Cloud Functions project, auth identity + RTDB rules, `firebase-messaging-sw.js` (push + notificationclick), token DB schema, permission flow UI, self-test only. |
| **1.11.2** | **Notification Engine** | Server-side engine, unified recipient resolver, `render(event, channel)` refactor, **Telegram migrated to the engine** (no behavior change, validates the pipeline). |
| **1.11.3** | **Push — Assignment lifecycle** | Created / Approved / Cancelled pushes via data-node triggers; click-routing into assignment detail. |
| **1.11.4** | **Push — Reminders** | Scheduled function for H-1 / H-2; retires client-timer reminders; global dedupe. |
| **1.11.5** | **Push — Comments** | `comment_added` event source in `comments.js`; participant fan-out. |
| **1.12.0** | **Notification preferences + P2** | Per-channel/category preferences UI, Driver Start/Complete pushes, FCM topics groundwork for future modules. |

---

**DO NOT IMPLEMENT. Architecture review only.**
