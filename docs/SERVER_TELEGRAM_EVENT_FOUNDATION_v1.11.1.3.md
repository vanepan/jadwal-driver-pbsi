# Server Telegram + Event Foundation — Architecture Review (v1.11.1.3)

**Status:** Design / architecture review only. **No implementation in this document.**
**Companion to:** [BACKEND_FOUNDATION_ARCHITECTURE.md](BACKEND_FOUNDATION_ARCHITECTURE.md) · [PUSH_NOTIFICATION_ARCHITECTURE.md](PUSH_NOTIFICATION_ARCHITECTURE.md) · [IDENTITY_SECURITY_CUTOVER_v1.11.1.2.md](IDENTITY_SECURITY_CUTOVER_v1.11.1.2.md)
**Builds on:** v1.11.1.2 Identity Foundation (production-validated) — trusted `uid`, `role` claim, `auth != null` RTDB.
**Scope of this release:** **Event Foundation** + **Server Telegram Foundation** — built and shadow-validated, with browser Telegram remaining the live path. **This release is NOT Push Notification, and NOT the unified Notification Engine fan-out.**
**Explicitly deferred:** Notification Engine cutover (v1.11.2) · Push lifecycle (v1.11.3) · Server reminders (v1.11.4) · Comment push (v1.11.5).

---

## 0. Framing

v1.11.1.2 gave the platform a trusted identity and authenticated RTDB. Everything notification-related, however, still runs **in the acting user's browser**: Telegram is sent client-side with the bot token pulled from the DB, recipient logic is duplicated across three files, and there is no canonical event the future Notification Engine / Push pipeline can subscribe to.

This release builds **two foundations** and validates them **in shadow**, changing no user-facing behavior:

1. **Event Foundation** — a canonical, versioned event the rest of the platform will consume.
2. **Server Telegram Foundation** — a Cloud Function that can send Telegram with the token off the browser.

The hard rule (Phase 8): **the existing browser Telegram path keeps working untouched** until the server path is proven. Nothing in this release is on the critical path of a production notification.

---

## PHASE 1 — Current System Audit & Migration Map

### 1.1 Every notification trigger (source of truth: `js/app.js`)

| Business event | Emits `logAction` | Fires Telegram | In-app visible | Wiring site |
|---|---|---|---|---|
| Request created (bidang) | `request_created` | `sendNewRequestNotificationToAdmins` | ✅ | [app.js:7059](../js/app.js#L7059) |
| Request updated (admin pre-approval edit) | `request_updated` | — | ❌ | [app.js:7074](../js/app.js#L7074) |
| Request approved → assignment(s) | `request_approved` + one `assignment_created` per assignment | `sendRequestApprovedNotification` + `sendNewAssignmentNotificationToDriver(newAssignments[0])` | ✅ | [app.js:6554](../js/app.js#L6554), [app.js:6604](../js/app.js#L6604) |
| Request rejected | `request_rejected` | `sendRequestRejectedNotification` | ✅ | [app.js:6626](../js/app.js#L6626) |
| Assignment created/edited (direct) | `assignment_created` / `assignment_edited` | `sendNewAssignmentNotificationToDriver` (only when `isNewAssignment && newAssignment`) | ✅ created | [app.js:7023](../js/app.js#L7023), [app.js:7048](../js/app.js#L7048) |
| Assignment deleted | `assignment_deleted` | — | ❌ | [app.js:7114](../js/app.js#L7114) |
| Assignment cancelled | `assignment_cancelled` | `sendAssignmentCancelledNotification` | ✅ | [app.js:7301](../js/app.js#L7301), [app.js:7323](../js/app.js#L7323) |
| Assignment completed | `assignment_completed` (logged elsewhere) | — | ✅ | (status flow) |
| **Comment added** | **❌ none** | **❌ none** | **❌ none** | [app.js:7089](../js/app.js#L7089) — save + render only |
| H-1 reminder | — | `checkAndSendH1Reminders` (client `setInterval`) | ❌ | [app.js:6862](../js/app.js#L6862) |
| H-2 reminder | — | `checkAndSendHoursReminders` (client `setInterval`) | ❌ | [app.js:6865](../js/app.js#L6865) |
| User/driver/vehicle archive·restore·delete·deactivate | `*_archived` etc. | — | ❌ | various |

### 1.2 Every Telegram send path

There is exactly **one** physical send path; everything funnels into it:

```
notification-service.js  (notify* / send* / checkAndSend* / build*Message)
        │  sendNotification(user, message)
        ▼
telegram.js  sendNotification(user, message)        ← notificationsEnabled gate + multi-chatId fan-out
        │  sendTelegramMessage(chatId, message)
        ▼
   ┌────────────────────────────┬───────────────────────────────┐
   │ proxy mode                 │ direct mode (DEFAULT today)    │
   │ window.TELEGRAM_API_BASE_  │ https://api.telegram.org/bot   │
   │ URL  (JSON {chatId,message})│ <token>/sendMessage (urlencoded)│
   └────────────────────────────┴───────────────────────────────┘
```

- Token source: `setTelegramBotToken()` populated at startup from `/settings/telegram/botToken`, fallback `window.TELEGRAM_BOT_TOKEN` ([telegram.js:20-24](../js/telegram.js#L20-L24)).
- **The proxy hook (`window.TELEGRAM_API_BASE_URL`, [telegram.js:16](../js/telegram.js#L16)) is the pre-built cutover lever** — when set, each send becomes `POST {chatId, message}` JSON to that URL. Pointing it at a Cloud Function = server Telegram with **zero code change in `telegram.js`**. This is the spine of the migration and rollback strategy.

### 1.3 Every recipient-resolution path (the core duplication)

The same "who is involved in this event" question is answered **three times, divergently**:

| # | Location | Purpose | Logic |
|---|---|---|---|
| 1 | `notification-service.js` | Telegram fan-out | `findDriverUser` (role=driver, match `displayName`\|`username`) ([notification-service.js:72](../js/notification-service.js#L72)); admin fan-out (`role==='admin' && active!==false && notificationsEnabled`); requester via `getUserByUsername(origRequest.requesterId)` |
| 2 | `notifications.js` | In-app visibility | `isVisibleToUser` ([notifications.js:168](../js/notifications.js#L168)): admin=all; bidang=`meta.requesterId===username` (+ own `request_created`); driver=`meta.driverUsername===username` then legacy `meta.driver===name` |
| 3 | `comments.js` | Comment access | `_canView` ([comments.js:147](../js/comments.js#L147)): admin; bidang `req.requesterId===user.id`; driver `req.driver` matches `username`\|`name` |

Plus two divergent gates: Telegram requires `notificationsEnabled`; in-app does not. This is the duplication Phase 4 collapses into one resolver.

### 1.4 Existing event-like structures

- **`/logs/{id}`** — `{ userId, username, displayName, action, targetId, metadata, timestamp }`, append-only, already subscribed by `notifications.js`. **This is the de-facto event stream.** Actions are flat `snake_case` (`request_created`, `assignment_cancelled`, …). `metadata` already carries `requesterId`, `driver`, `driverUsername`, `vehicle`, `date`, `requestId` — the fields a resolver needs. Written via `logAction()` ([logs.js:40](../js/logs.js#L40)), which already `sanitizeMetadata`s `undefined → null` for Firebase.
- **`NOTIFICATION_TYPES`** enum ([notification-service.js:92](../js/notification-service.js#L92)) — a parallel `UPPER_SNAKE` taxonomy used only by the legacy `sendNotificationByType` switch.
- **`OPERATIONAL_ACTIONS`** whitelist ([notifications.js:46](../js/notifications.js#L46)) — the subset of `/logs` actions the in-app center surfaces.

### 1.5 Migration map (current → target)

```
TODAY                                          TARGET (foundations laid this release)

acting browser                                 authoritative source
  logAction() ───────────────► /logs ──────►   /logs (unchanged, in-app keeps reading it)
  notify*() ──► telegram.js ──► api.telegram        +
               (token in browser)              /events/{id}  (NEW canonical envelope, shadow)
                                                      ▲
                                          onAssignmentWrite / onRequestWrite (NEW triggers)
                                          + client publishEvent() for non-data events

  (no comment event) ───────────────────────►  comment.added emitter (NEW)

  telegram.js direct send ──────────────────►  telegram/ Cloud Function (NEW, shadow)
                                                token in Secret Manager
                                                window.TELEGRAM_API_BASE_URL = cutover lever
```

Nothing in the left column is removed in v1.11.1.3 — the right column is added alongside and validated in shadow.

---

## PHASE 2 — Event Model

### 2.1 Canonical envelope

Adopt the brief's field names as canonical (they supersede the *draft* envelope sketched in `BACKEND_FOUNDATION_ARCHITECTURE.md` §6, which used `v`/`ts`/`subject`/`metadata`):

```jsonc
{
  "id":        "<pushId>",            // RTDB push key — chronological, unique
  "type":      "assignment.created", // domain.action  (dot namespace)
  "version":   1,                     // envelope schema version
  "timestamp": "<ISO8601>",          // event time (matches /logs timestamp shape)
  "actor":     {                      // who caused it
    "uid":         "budi",            // = auth.uid (username)
    "role":        "admin",
    "displayName": "Budi"
  },
  "entity":    {                      // what it is about
    "kind": "assignment",             // assignment | request | comment
    "id":   "ASG-20260613-XXXX"
  },
  "payload":   {                      // domain data (superset of today's logAction metadata)
    "driverUsername": "igo",
    "requesterId":    "humas",
    "vehicle":        "Avanza",
    "date":           "2026-06-13",
    "startTime":      "08:00",
    "endTime":        "12:00",
    "destination":    "Bandara",
    "reason":         null
  }
}
```

**Field mapping** (decision: `version`/`timestamp`/`entity`/`payload` are canonical; the draft's `v`/`ts`/`subject`/`metadata` are retired before they shipped — nothing consumes them yet):

| Canonical | Draft (`BACKEND_FOUNDATION §6`) | `/logs` source |
|---|---|---|
| `type` (`domain.action`) | `type` | `action` (`domain_action`) via mapping table |
| `version` | `v` | n/a (new) |
| `timestamp` | `ts` | `timestamp` |
| `actor.{uid,role,displayName}` | `actor` | `userId`/`username` + `displayName` |
| `entity.{kind,id}` | `subject.{kind,id}` | inferred from `action` + `targetId` |
| `payload` | `metadata` | `metadata` (1:1) |

### 2.2 Type namespace & legacy mapping

`domain.action`, dot-separated. The migration is **purely a string mapping** over existing `/logs` actions — historical entries and `notifications.js` keep working unchanged because `/logs` is untouched; the mapping lives only where the new envelope is produced.

| Canonical `type` | Legacy `/logs` action | In foundation scope? |
|---|---|---|
| `assignment.created` | `assignment_created` | ✅ emit |
| `assignment.updated` | `assignment_edited` | ✅ emit |
| `assignment.cancelled` | `assignment_cancelled` | ✅ emit |
| `assignment.completed` | `assignment_completed` | ✅ emit |
| `assignment.deleted` | `assignment_deleted` | ✅ emit |
| `request.created` | `request_created` | ✅ emit |
| `request.updated` | `request_updated` | ✅ emit |
| `request.approved` | `request_approved` | ✅ emit |
| `request.rejected` | `request_rejected` | ✅ emit |
| `comment.added` | *(none today)* | ✅ **new emitter** (Phase 6) |
| `notification.sent` | *(none today)* | ✅ written by the Telegram function (delivery record) |

`notification.sent` is emitted **by the server** (the Telegram function), not the client — it is the delivery-tracking event that closes the loop and seeds future retry/audit.

### 2.3 Compatibility rules (so this never needs a redesign)

- **Additive-only payloads.** Consumers must ignore unknown `payload` keys. New keys never bump `version`.
- **`version` bumps only on breaking envelope changes** (renaming/removing a top-level field) — none expected.
- **`type` is the routing key**; no consumer switches on `entity.kind` alone.
- Every future module (Engineering, Asset, AI) emits a new `type`, never new envelope machinery.

---

## PHASE 3 — Event Bus Foundation

### 3.1 Topology

```
        Publisher                     Event Store              Subscriber layer
  ┌───────────────────┐          ┌──────────────────┐     ┌──────────────────────────┐
  │ A. Authoritative  │          │                  │     │ (v1.11.1.3: validation     │
  │  data triggers    │────────► │  /events/{id}    │────►│  only — log/metrics)       │
  │  onAssignmentWrite│          │  append-only      │     │                            │
  │  onRequestWrite   │          │  envelope (P2)     │     │ (v1.11.2+: Notification    │
  ├───────────────────┤          │                  │     │  Engine subscribes here)   │
  │ B. Client publish │────────► │                  │     │                            │
  │  publishEvent()   │          │                  │     │ in-app center keeps reading │
  │  (comment.added,  │          └──────────────────┘     │ /logs (unchanged)          │
  │   non-data events)│                                    └──────────────────────────┘
  └───────────────────┘
```

### 3.2 Store choice — **add `/events`, keep `/logs`**

`/logs` is client-written and forgeable, and it is already load-bearing for the in-app center. Rather than overload it, introduce a dedicated **`/events/{pushId}`** outbox:

- **Authoritative correctness:** the P1 events (`assignment.*`, `request.*`) are written by **Cloud Function triggers on `/assignments` and `/driver_requests`**, so they reflect true state changes and cannot be forged or skipped by an offline client.
- **Breadth:** events with no data node (`comment.added`) are written by a thin client `publishEvent()` until/unless they get a data trigger.
- **`/logs` is unchanged** — zero risk to the in-app center, the Audit Center, or `isVisibleToUser`.

### 3.3 Requirements coverage

| Requirement | How `/events` meets it |
|---|---|
| **Firebase-friendly** | Plain RTDB push-keyed node; same shape discipline as `/logs` (`sanitizeMetadata` reused) |
| **Cloud Functions friendly** | Produced *by* triggers; consumed *by* a future `onEventWrite` subscriber — native fit |
| **Replay capable** | Append-only, chronologically push-keyed → range reads replay any window |
| **Audit capable** | Immutable envelope with `actor` + `timestamp`; `notification.sent` closes the delivery loop |
| **Avoid overengineering** | One node, one envelope, no broker/queue infra; subscriber is just another Function |

### 3.4 Scope discipline for this release

In v1.11.1.3 the **subscriber layer only validates** (counts events, asserts envelope shape, logs to Cloud Functions logs). **No fan-out, no sending is wired off `/events` yet** — that is the v1.11.2 Notification Engine. We are proving the stream is correct and complete before anything depends on it.

### 3.5 Security rules (additive, no tightening of existing paths)

```jsonc
"events": {
  ".read":  "auth.token.role === 'admin'",         // audit-grade, admin-only
  "$id": { ".write": "auth != null && !data.exists()" }  // append-only; triggers use admin SDK (bypass)
},
"telegram_deliveries": {                            // Phase 5 delivery tracking
  ".read":  "auth.token.role === 'admin'",
  ".write": "false"                                  // server-only (admin SDK)
}
```

These are **new nodes** — adding rules for them does not change any existing path's enforcement.

---

## PHASE 4 — Recipient Resolution Engine

### 4.1 Contract

One pure, server-side function replaces the three divergent encodings (§1.3):

```
resolveRecipients(event, userDirectory) → {
  users:    [ "<uid>", ... ],   // in-app inbox targets (future /notifications)
  telegram: [ "<chatId>", ... ],// flattened, deduped, notificationsEnabled-gated
  push:     [ ]                  // reserved — always empty until v1.11.3
}
```

- `event` = the Phase 2 envelope. `userDirectory` = `/users` read via admin SDK (server) — the same data the browser resolvers read, now read once server-side.
- `push` is present **but always empty** this release, so the v1.11.3 push line is a fill-in, not a signature change.

### 4.2 Rules ported from the three sources (single source of truth)

| `type` | `users` (in-app) | `telegram` adds | Notes |
|---|---|---|---|
| `request.created` | all admins + author | admins' chatIds | mirrors `sendNewRequestNotificationToAdmins` + in-app bidang-own |
| `request.approved` / `request.rejected` | requester (`payload.requesterId`) + admins | requester chatIds | mirrors `notifyRequester*` |
| `assignment.created` | driver (`payload.driverUsername`, legacy `driver`==displayName) + requester | driver chatIds | mirrors `sendNewAssignmentNotificationToDriver` + driver in-app |
| `assignment.cancelled` | driver + (admins **or** requester, per `payload.cancelledByRole`) | same | mirrors `sendAssignmentCancelledNotification` branch |
| `assignment.completed` | admins + requester | — | in-app today; telegram reserved |
| `comment.added` | thread participants (admin, owning bidang, assigned driver) **minus author** | participants' chatIds | new; participant set = `_canView` rules ported |

### 4.3 Gates folded in

- **`notificationsEnabled`** is applied inside the resolver when building `telegram[]` (in-app `users[]` is not gated, preserving today's split).
- **Author exclusion** for `comment.added` (the author should not be notified of their own comment).
- **Dedup** of chatIds across recipients (reuse the `Set` pattern in `telegram.js#sendNotification`).

This release **implements and unit-tests** `resolveRecipients` server-side and **validates its output against the three legacy resolvers in shadow** (does it pick the same recipients the browser would?). It does **not** yet become the sole authority — that flips with the engine in v1.11.2.

---

## PHASE 5 — Server Telegram Foundation

### 5.1 Target path

```
TODAY:   Browser ──► api.telegram.org              (token in browser)
TARGET:  Event ──► Cloud Function ──► api.telegram.org   (token in Secret Manager)
```

### 5.2 The function

A region-pinned (`asia-southeast1`) Telegram sender in `functions/src/telegram/` that **reproduces `telegram.js` byte-for-byte on the wire**:

- Multi-chatId fan-out, `notificationsEnabled` gate, `parse_mode: Markdown`, identical message bodies (the `build*Message` templates move server-side unchanged).
- **Two ingress shapes**, same core:
  1. **Proxy-compatible HTTP** accepting `{ chatId, message }` — the exact contract `telegram.js` proxy mode already sends. Setting `window.TELEGRAM_API_BASE_URL` to this endpoint cuts the browser over **with no `telegram.js` change**. This is the validation/cutover ingress.
  2. **Callable / event-driven** `sendTelegram(event)` — used by the future engine; not wired to user flows this release.

### 5.3 Requirements

| Requirement | Design |
|---|---|
| **Token never in browser** | `TELEGRAM_BOT_TOKEN` already declared in [functions/src/config/secrets.js](../functions/src/config/secrets.js); bind via `onRequest({ secrets: [TELEGRAM_BOT_TOKEN] })`. Browser path keeps its own token until cutover; remove `/settings/telegram/botToken` client read only **after** v1.11.2. |
| **Secret Manager compatible** | `firebase functions:secrets:set TELEGRAM_BOT_TOKEN` — no code secret, no env file. |
| **Delivery tracking ready** | Each send writes `/telegram_deliveries/{id}` `{ eventId, chatId, ok, status, error, sentAt }` and emits a `notification.sent` event. Closes the audit loop the browser path never had. |
| **Retry ready** | Wrap send in a retry policy: exponential backoff; honor Telegram `429 retry_after`; treat `400 chat not found`/`403 blocked` as terminal (no retry, flag stale chatId for cleanup). Implemented as a `telegram/retry.js` wrapper so the engine inherits it. |

### 5.4 Shadow validation (no production risk)

Deploy the function and run it in **shadow**: the browser keeps sending (live), and a flagged duplicate call hits the server function writing only `/telegram_deliveries` (no second user-visible message during validation — validate against a test chat / the engineer's own chatId). Compare server delivery records against browser outcomes. Cutover (pointing `TELEGRAM_API_BASE_URL` at the function) is a **separate, reversible flag flip** and is **not required to ship v1.11.1.3** — shipping the *foundation* means the function exists and is proven, not that the primary path moved.

---

## PHASE 6 — Comment Event Foundation

### 6.1 Audit result

**`comment.added` is NOT emitted today.** `registerCommentSaveCallback` ([app.js:7089](../js/app.js#L7089)) only `saveRequests` + `renderRequestsList`; `comments.js#_handleSend` ([comments.js:252](../js/comments.js#L252)) persists the comment into `req.comments[]` via the callback and emits **no log and no notification**. This is the single genuinely missing event source — and it is **required for v1.11.5** (comment push).

### 6.2 Implementation plan (emitter only, this release)

Additive, in the existing save callback (keeps `comments.js` decoupled from logging, consistent with how every other event is logged from `app.js`):

```
registerCommentSaveCallback((updatedRequest, newComment) => {
   ...existing save + render...
   logAction({ action: 'comment_added', targetId: updatedRequest.id, metadata: {
       requestId:      updatedRequest.id,
       commentId:      newComment.id,
       authorUsername: currentUser.username,
       requesterId:    updatedRequest.requesterId,   // for participant resolution
       driver:         updatedRequest.driver
   }});
   publishEvent('comment.added', { kind: 'comment', id: newComment.id }, metadata);
}
```

- `comments.js#_handleSend` passes `newComment` to the callback (small additive signature change).
- The new `comment_added` action joins `OPERATIONAL_ACTIONS` so the in-app center surfaces it (gives comments an in-app card immediately, even before push).
- Participant set for resolution = `_canView` rules ported into `resolveRecipients` (§4.2), author excluded.

**In scope now:** the emitter + in-app surfacing. **Deferred to v1.11.5:** consuming `comment.added` for push fan-out.

---

## PHASE 7 — Functions Architecture

Final structure (follows the brief's four top-level groups; extends the existing scaffold which already has `auth/`, `config/`, `health.js`, and reserved `events/`·`notifications/`·`scheduled/` READMEs):

```
functions/
├─ index.js                         # exports only (health, verifyPin live today)
├─ package.json
└─ src/
   ├─ auth/
   │  └─ verifyPin.js               # LIVE (v1.11.1.2)
   ├─ config/
   │  ├─ admin.js                   # admin SDK init
   │  ├─ constants.js               # bump SERVICE_VERSION → 1.11.1.3
   │  └─ secrets.js                 # TELEGRAM_BOT_TOKEN (declared; bound this release)
   ├─ health.js                     # LIVE
   │
   ├─ events/                       # ── Event Foundation (Phase 2/3) ──
   │  ├─ schema.js                  # envelope builder + version + legacy type map
   │  ├─ publishEvent.js            # callable: client → /events (comment.added etc.)
   │  ├─ onAssignmentWrite.js       # /assignments trigger → assignment.* events
   │  ├─ onRequestWrite.js          # /driver_requests trigger → request.* events
   │  └─ onEventWrite.js            # subscriber — VALIDATION ONLY this release
   │
   ├─ notifications/                # ── reserved for v1.11.2 engine ──
   │  └─ recipients.js              # resolveRecipients() (Phase 4) — built + shadow-tested
   │
   ├─ telegram/                     # ── Server Telegram Foundation (Phase 5) ──
   │  ├─ sendMessage.js             # core send (Secret Manager token, Markdown)
   │  ├─ proxyEndpoint.js           # HTTP {chatId,message} — TELEGRAM_API_BASE_URL target
   │  ├─ retry.js                   # backoff + 429 retry_after + terminal-error classify
   │  └─ deliveryLog.js             # /telegram_deliveries + notification.sent
   │
   └─ scheduled/                    # ── reserved for v1.11.4 reminders ──
```

`index.js` gains exports for `publishEvent`, `onAssignmentWrite`, `onRequestWrite`, `onEventWrite`, and the Telegram proxy endpoint. `notifications/engine.js` and `scheduled/reminders.js` stay **reserved** (READMEs only) — they belong to later versions.

---

## PHASE 8 — Rollback Strategy

**Principle: every piece is additive and shadow-first. Browser Telegram remains the live, primary path for the entire release.**

| Component | Live path during v1.11.1.3 | Rollback |
|---|---|---|
| **Browser Telegram** | **Primary, unchanged** | n/a — never moved |
| **Server Telegram function** | Shadow only (writes `/telegram_deliveries`, no user-facing send except test chat) | Stop invoking; `window.TELEGRAM_API_BASE_URL` stays **unset** → browser direct mode |
| **Cutover lever** | `TELEGRAM_API_BASE_URL` **unset** | Flipping it on is opt-in and per-deploy; unsetting reverts instantly, no data change |
| **`/events` outbox** | Written by triggers; consumed only by validation subscriber | Additive node — stop the triggers / ignore the node; nothing reads it for delivery |
| **`comment.added` emitter** | Writes `/logs` + `/events`; surfaces in-app | Additive action — remove the emit; in-app gracefully ignores unknown actions |
| **RTDB rules** | Add `/events` + `/telegram_deliveries` rules only | Existing path rules untouched; republish previous rules in seconds |

There is **no production risk** because no existing read or write path is modified — the release only **adds** parallel infrastructure and proves it in shadow. The migration to make the server path primary is a **future release's** flag flip (v1.11.2), itself reversible.

---

## PHASE 9 — Version Plan

**v1.11.1.3 scope (this release) — foundation, shadow-validated, no behavior change:**

- ✅ Canonical event envelope + legacy type map (`events/schema.js`)
- ✅ `/events` outbox + authoritative triggers (`onAssignmentWrite`, `onRequestWrite`) + client `publishEvent`
- ✅ Validation subscriber (`onEventWrite`) — asserts shape/completeness, no fan-out
- ✅ `resolveRecipients()` built + shadow-tested against the three legacy resolvers (not yet authoritative)
- ✅ Server Telegram function (Secret Manager token, retry, delivery tracking) — shadow
- ✅ `comment.added` emitter + in-app surfacing
- ✅ Functions folder structure (`events/`, `notifications/`, `telegram/`, `scheduled/`)
- ✅ Additive rules for `/events`, `/telegram_deliveries`

**Explicitly NOT in this release — do not pull forward:**

| Version | Theme | Belongs there, not here |
|---|---|---|
| **v1.11.2** | Notification Engine cutover | Engine consumes `/events` and fans out; `resolveRecipients` becomes authoritative; **Telegram primary path moves to server** (`TELEGRAM_API_BASE_URL` flipped); retire browser send; remove `/settings/telegram/botToken` client read |
| **v1.11.3** | Push — assignment lifecycle | FCM, `firebase-messaging-sw.js`, token DB, permission flow, `push[]` populated, Created/Approved/Cancelled pushes |
| **v1.11.4** | Push — reminders | `scheduled/reminders.js` (server H-1/H-2), retire client `setInterval`, global dedupe |
| **v1.11.5** | Push — comments | Consume `comment.added` for push participant fan-out |

This sequencing aligns with `BACKEND_FOUNDATION_ARCHITECTURE.md` §9 and `PUSH_NOTIFICATION_ARCHITECTURE.md` §10 (note: the Push doc's older `1.11.2/.3/.4/.5` numbering maps onto these `v1.11.x` lines; this document's numbering is authoritative for the foundation track).

---

## OUTPUT — Deliverables Summary

### A. Architecture Review
v1.11.1.2 secured identity and RTDB but left all notification work in the acting browser: one physical Telegram send path (`notification-service.js → telegram.js → api.telegram.org`, token client-side), recipient logic triplicated across `notification-service.js`/`notifications.js`/`comments.js`, and `/logs` serving as a de-facto but forgeable event stream. This release adds two **shadow-validated foundations** — a canonical `/events` outbox written by authoritative Cloud Function triggers, and a Secret-Manager-backed server Telegram function — without moving any live path.

### B. Gap Analysis
1. **No canonical event** — `/logs` is client-written, forgeable, and overloaded; future engine/push have nothing trustworthy to subscribe to. → `/events` envelope + data-node triggers.
2. **Recipient logic triplicated and divergent** (+ split `notificationsEnabled` gating). → one `resolveRecipients()`.
3. **Bot token in the browser** + no delivery tracking, no retry. → server Telegram + Secret Manager + `/telegram_deliveries` + `notification.sent`.
4. **`comment.added` emitted nowhere** — blocks v1.11.5 and gives comments no in-app card. → additive emitter now.
5. **"Notified" depends on who's online** (browser fan-out, client-timer reminders) — *acknowledged*, fixed structurally in v1.11.2/.4, not this release.

### C. Migration Strategy
Additive, shadow-first, browser-primary throughout (Phase 1.5 map + Phase 8 table). Build `/events`, `resolveRecipients`, and the Telegram function in parallel to the live path; validate server output against browser behavior; keep `window.TELEGRAM_API_BASE_URL` **unset** so direct browser send stays primary. The proxy hook is the single reversible cutover lever, exercised only in v1.11.2.

### D. Recommended Implementation Plan
1. `events/schema.js` — envelope + version + legacy `action → type` map.
2. `onAssignmentWrite` / `onRequestWrite` triggers → write `/events`; `publishEvent` callable for `comment.added`.
3. `onEventWrite` validation subscriber (shape/completeness logging only).
4. `notifications/recipients.js` `resolveRecipients()` + shadow comparison harness vs the three legacy resolvers.
5. `telegram/` function (core send + Secret Manager binding + `retry.js` + `deliveryLog.js`; proxy-compatible `{chatId,message}` ingress).
6. `comment.added` emitter in the save callback + `OPERATIONAL_ACTIONS` entry + `_handleSend` passes `newComment`.
7. Additive rules for `/events` + `/telegram_deliveries`; bump `SERVICE_VERSION` to `1.11.1.3`.
8. Deploy functions; shadow-validate; **do not** flip the cutover lever.

### E. Recommended Version Validation Checklist
- [ ] `functions deploy` succeeds; `health` green; `verifyPin` still LIVE and unaffected.
- [ ] Browser Telegram still sends for every existing trigger — **byte-identical messages** (no regression).
- [ ] Each operational mutation writes a well-formed `/events` envelope (`version`, `actor`, `entity`, `payload` present; `type` correctly namespaced).
- [ ] `onAssignmentWrite` / `onRequestWrite` fire on real state changes only (no dup/no miss vs `/logs`).
- [ ] `resolveRecipients()` output **matches** the three legacy resolvers on a replayed sample of recent `/logs` (admin/bidang/driver/comment cases).
- [ ] Server Telegram function sends to a test chat using the **Secret Manager** token (no token in browser, no token in code/env file).
- [ ] `/telegram_deliveries` records written with `ok`/`status`/`error`; `notification.sent` event emitted; retry honors `429 retry_after`; terminal errors not retried.
- [ ] `comment.added` emitted on comment save; appears as an in-app card; author excluded from recipient set.
- [ ] New rules: `/events` + `/telegram_deliveries` admin-read / server-write; **all existing path rules unchanged**; `permission_denied` ≈ 0.
- [ ] `window.TELEGRAM_API_BASE_URL` **unset** in production → browser direct mode remains primary (rollback posture intact).
- [ ] No user-facing behavior change observable to any role.

---

**DO NOT IMPLEMENT. Architecture only.** Implementation begins in a follow-up once this review is approved.
```