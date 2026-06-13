# Notification Engine Foundation — Architecture Review (v1.11.2)

**Status:** Design / architecture review only. **No implementation in this document.**
**Companion to:** [SERVER_TELEGRAM_EVENT_FOUNDATION_v1.11.1.3.md](SERVER_TELEGRAM_EVENT_FOUNDATION_v1.11.1.3.md)
**Builds on:** v1.11.1.3 Event Foundation + Server Telegram Foundation (shadow-validated). Canonical `/events` outbox with authoritative producers, `resolveRecipients()` shadow resolver, server Telegram send (`sendWithRetry` + `recordDelivery`), dormant `telegramProxy`.
**Scope of this release:** the **single notification engine** that sits between events and channels. After this release every channel (in-app, Telegram, push, future AI) originates from one entrypoint — `processEvent(event)` — via a registry and a dispatcher.
**Explicitly deferred:** Push lifecycle (v1.11.3) · Reminder engine (v1.11.4) · Comment push (v1.11.5). This release creates **only the engine** and migrates the two live channels (in-app, Telegram) onto it, shadow-first.

---

## 0. Framing

v1.11.1.3 gave us the two missing primitives: a **canonical event** the platform can subscribe to, and a **server-side Telegram sender** with the token off the browser. What it deliberately did *not* do is connect them — `onEventWrite` resolves recipients in **shadow** and sends nothing; the live notification paths still run in the acting user's browser.

Today there are **two independent notification systems** and **three recipient encodings**. The same business event (e.g. "assignment created") is computed three times with three different rules, rendered from two different template sets, and delivered through two unrelated mechanisms. There is no object you can point at and call "a notification."

This release introduces that object and the engine that produces it:

```
Event (/events)
      ↓
Notification Engine        processEvent(event)
      ↓                    ── resolveRecipients (already exists, shadow→authoritative)
      ↓                    ── registry lookup (type → template + channels)
      ↓                    ── generate one Notification per recipient
Channel Dispatcher         dispatch(notification)
      ↓
  inApp · telegram · [push dormant]
```

The hard rule (Phase 8) carries over from v1.11.1.3: **every existing path keeps working untouched** until the engine is proven at parity in shadow. Nothing here is on the critical path of a production notification on day one.

---

## 1. Architecture Review (Output 1) — current state

### 1.1 The two notification systems today

| | **In-app center** | **Telegram delivery** |
|---|---|---|
| Module | [js/notifications.js](../js/notifications.js) | [js/notification-service.js](../js/notification-service.js) + [js/telegram.js](../js/telegram.js) |
| Source of truth | `/logs` (read via [js/logs.js](../js/logs.js)) | direct API call at the moment of the action |
| Trigger | render-time, derived from the log stream | imperative `send*()` call in app.js |
| Recipient logic | `isVisibleToUser(entry, user)` — **client-side filter** over all logs | inline role fan-out + `findDriverUser()` per `send*` function |
| Templates | `ACTION_META` (icon/title/desc/detail, short Indonesian) | `build*Message()` (rich Markdown Indonesian) |
| Read/seen state | single localStorage timestamp `pbsi_notif_read_at` | n/a (fire-and-forget) |
| Persistence of the notification itself | **none** — recomputed from `/logs` every render | **none** — only the wire send |
| Gating | role + ownership | `notificationsEnabled` + `telegramChatIds` |

These share **no code and no data**. "Assignment created" produces a `/logs` entry (filtered client-side for the bell) *and* a separate `notifyDriverAssignment()` Telegram call (recipient resolved again, message built again). They can and do drift.

### 1.2 The three recipient encodings (already catalogued in v1.11.1.3)

1. `notification-service.js` — role fan-out + `findDriverUser` (Telegram)
2. `notifications.js#isVisibleToUser` — role/ownership filter (in-app)
3. `comments.js#_canView` — admin / owning bidang / assigned driver (comment access)

[functions/src/notifications/recipients.js](../functions/src/notifications/recipients.js) `resolveRecipients(event, users) → { users, telegram, push }` **already collapses all three** into one server-side resolver — but it is **shadow only**, exercised by `onEventWrite` for parity logging and driving nothing.

### 1.3 What the Event Foundation already gives the engine

| Primitive | File | Engine use |
|---|---|---|
| Canonical envelope `{id,type,version,timestamp,actor,entity,payload}` | [events/schema.js](../functions/src/events/schema.js) | the engine's input contract |
| Authoritative producers (assignment.\*, request.\*) | [onAssignmentWrite.js](../functions/src/events/onAssignmentWrite.js), [onRequestWrite.js](../functions/src/events/onRequestWrite.js) | events fire server-side from true state changes, cannot be forged/skipped |
| Client publisher (`comment.added`) | [publishEvent.js](../functions/src/events/publishEvent.js) | only event with no data-node trigger |
| Subscriber (validation-only) | [onEventWrite.js](../functions/src/events/onEventWrite.js) | **this becomes the engine entrypoint** |
| Recipient resolver (shadow) | [recipients.js](../functions/src/notifications/recipients.js) | **engine step 1**, shadow → authoritative |
| Server Telegram send + retry | [telegram/retry.js](../functions/src/telegram/retry.js), [sendMessage.js](../functions/src/telegram/sendMessage.js) | **telegram channel** of the dispatcher |
| Delivery record + `notification.sent` | [telegram/deliveryLog.js](../functions/src/telegram/deliveryLog.js) | **delivery tracking** (Phase 7), generalize beyond Telegram |
| Dormant ingress | [telegram/proxyEndpoint.js](../functions/src/telegram/proxyEndpoint.js) | irrelevant to engine (browser→Telegram cutover, separate lever) |

**The engine is not greenfield.** Roughly 60% of it exists in shadow. v1.11.2 is mostly *wiring + a registry + a notification record + a dispatcher*, then flipping shadow flags one channel at a time.

---

## 2. Gap Analysis (Output 2)

| # | Gap | Impact | Closed by |
|---|---|---|---|
| G1 | Two recipient/template/delivery stacks per event | drift; every new event type touched in ≥2 files | engine + registry (one path) |
| G2 | `resolveRecipients` is shadow only | the unifier exists but is authoritative nowhere | Phase 3 cutover |
| G3 | **No persisted notification entity** | in-app is recomputed from `/logs`; "unread" is one global timestamp, not per-item; no audit of *what was notified to whom* | Phase 2 model + `/notifications` |
| G4 | Templates duplicated (`ACTION_META` vs `build*Message`) | same event worded twice, can diverge | Phase 5 template foundation |
| G5 | In-app reads `/logs`, not events | the bell is coupled to the legacy audit log, not the canonical stream | Phase 6 inApp channel writes `/notifications` |
| G6 | Telegram fan-out lives in the browser | recipient logic + (legacy) token client-side; no server authority/retry on the live path | Phase 6 telegram channel uses server send |
| G7 | Richer event types map to nothing | `assignment.updated/started/deleted`, `request.updated` resolve to no recipients | registry simply omits them (explicit, not accidental) |
| G8 | `notification.sent` exists but only for Telegram | delivery tracking is channel-specific | Phase 7 generalize to `/notification_deliveries` |
| G9 | Reminders are client-polled + localStorage-dedup | not event-driven, no server authority, lost when no browser open | **out of scope** — v1.11.4, but the engine must not foreclose it |
| G10 | No de-dup / idempotency on event reprocessing | a function retry could double-notify | engine keys notifications by `(eventId, recipientId, channel)` |

**Non-goals this release (must stay out):** push delivery (G-push), reminder engine (G9), comment push (v1.11.5), removing any legacy path, the browser→Telegram proxy cutover (that flag belongs to its own lever and is orthogonal to the engine).

---

## 3. Notification Domain Model (Output 3)

### 3.1 Canonical notification

One **Notification** = one event delivered to one recipient (channel-agnostic). Channels are an attribute, not a copy.

```jsonc
// /notifications/{recipientId}/{notificationId}
{
  "id":          "<push key>",
  "type":        "assignment.created",   // canonical event type (registry key)
  "eventId":     "<source /events id>",  // provenance → replay/audit
  "recipientId": "<username = uid>",
  "title":       "Penugasan Baru",       // rendered from template (recipient role-aware)
  "body":        "Anda mendapatkan penugasan baru",
  "channels":    ["inApp", "telegram"],  // channels this notification targeted
  "status":      "queued",               // queued → dispatched → (per-channel in deliveries)
  "readAt":      null,                   // replaces the global localStorage timestamp
  "createdAt":   "2026-06-13T...Z"
}
```

Design choices, with reasons:

- **Keyed under `recipientId`.** A user's bell reads `/notifications/{me}` — one cheap subscription, naturally scoped, and RTDB rules become trivial (`recipientId === auth.uid`). This is the single biggest divergence from "one flat `/notifications` list," and it's the right one for RTDB.
- **`channels` is intent; `status` is coarse.** Per-channel outcome (sent/failed/terminal) lives in `/notification_deliveries`, not here — keeps the user-facing record small and the audit record complete (Phase 7).
- **`readAt` per record.** Replaces `pbsi_notif_read_at`. Per-item read state, survives devices, no localStorage. (In-app badge = count where `readAt == null`.)
- **`eventId` is mandatory provenance.** Every notification traces to exactly one `/events` row → the whole system is **replayable** (re-run `processEvent` over `/events`) and **auditable**.
- **Idempotency key = `eventId + channel`** within a recipient. Re-processing the same event must not create a second record (G10). Engine checks/uses a deterministic child key derived from `eventId` rather than a fresh push key (detail for impl).

### 3.2 Delivery record (Phase 7)

Generalize the existing `/telegram_deliveries` to channel-agnostic `/notification_deliveries`:

```jsonc
// /notification_deliveries/{deliveryId}
{
  "id":            "<push key>",
  "notificationId":"<…>",
  "eventId":       "<…>",
  "recipientId":   "<…>",
  "channel":       "telegram",     // inApp | telegram | push
  "status":        "sent",         // queued | sent | failed | delivered
  "attempts":      1,
  "terminal":      false,          // e.g. stale Telegram chat
  "error":         null,
  "target":        "<chatId | uid | pushToken>",
  "sentAt":        "..."
}
```

`/telegram_deliveries` stays as-is for back-compat during migration; `notification.sent` events continue to be emitted (the engine becomes a second producer of them, now per-channel).

### 3.3 Status lifecycle

```
Notification:   queued ──► dispatched
Delivery:       queued ──► sent ──► delivered      (delivered = push receipt, future)
                       └─► failed (retryable / terminal)
```

`delivered` is reserved for push receipts (v1.11.3); for inApp, "sent" = written to `/notifications`; for Telegram, "sent" = 2xx from the API.

---

## 4. Notification Engine (Output — Phase 3)

### 4.1 Single entrypoint

```
processEvent(event)            // pure-ish orchestrator, server-side
  1. guard      — skip notification.sent (delivery record, not a business event); skip unknown types
  2. registry   — entry = REGISTRY[event.type]; if none → no-op (explicit)
  3. recipients — resolveRecipients(event, users)            ← already built
  4. generate   — for each recipient: notification = render(entry, event, recipient)
  5. dispatch   — for each notification: dispatch(notification)   ← Phase 6
  6. track      — record per-channel delivery + emit notification.sent  ← Phase 7
```

### 4.2 Where it lives

**`onEventWrite` graduates from validation-only to the engine.** It already fires on every `/events/{id}`, already loads the user directory, already calls `resolveRecipients` in shadow. v1.11.2 replaces the "log the counts" body with `processEvent(envelope)`, behind a shadow flag (Section 7).

Engine responsibilities (verbatim from the objective): **consume events · resolve recipients · generate notifications · dispatch · track status.** All five now have a home; only *generate* and *dispatch* are new code.

### 4.3 Why server-side

Authoritative producers already run server-side; the engine must too, or it inherits the browser problems it exists to remove (no fan-out when no browser is open, recipient logic on the client, token exposure). The Admin SDK write to `/notifications/{recipientId}` is also what lets RTDB rules stay strict (clients never write notifications).

---

## 5. Notification Registry (Output 4 — Phase 4)

A single declarative table keyed by canonical event type. Replaces `OPERATIONAL_ACTIONS`, `ACTION_META`, and the implicit per-`send*` recipient rules.

```jsonc
REGISTRY = {
  "assignment.created": {
    channels:   ["inApp", "telegram"],
    recipients: "resolveRecipients",        // delegated; resolver already knows this type
    template:   "assignment.created"        // → Section 6 template foundation
  },
  "assignment.completed": { channels: ["inApp", "telegram"], template: "assignment.completed" },
  "assignment.cancelled": { channels: ["inApp", "telegram"], template: "assignment.cancelled" },
  "request.created":      { channels: ["inApp", "telegram"], template: "request.created" },
  "request.approved":     { channels: ["inApp", "telegram"], template: "request.approved" },
  "request.rejected":     { channels: ["inApp", "telegram"], template: "request.rejected" },
  "comment.added":        { channels: ["inApp", "telegram"], template: "comment.added" }
  // assignment.updated / started / deleted, request.updated, notification.sent:
  //   intentionally ABSENT → engine no-ops. Matches resolveRecipients' default branch.
}
```

The registry is the **one place** a new notifiable event is declared. Adding push later = add `"push"` to a `channels` array, nothing else. This directly satisfies the objective's "avoid hardcoded logic spread across files."

Note the registry's enabled set mirrors today's `OPERATIONAL_ACTIONS` whitelist exactly — that's the parity target.

---

## 6. Template Foundation (Output — Phase 5) & Channel Dispatcher (Output 5 — Phase 6)

### 6.1 Templates

One template module keyed by type, producing **role/channel-aware** copy. Consolidates `ACTION_META` (in-app) and `build*Message` (Telegram) so each event is worded once, with variants where they legitimately differ:

```
TEMPLATES["assignment.created"] = {
  title: (event, recipient) => "Penugasan Baru",
  body:  (event, recipient) =>
           recipient.role === "driver" ? "Anda mendapatkan penugasan baru"
                                        : "Penugasan baru dibuat",
  // channel renderers reuse the same title/body; telegram adds the rich detail block
  telegram: (event) => buildAssignmentMarkdown(event),   // ports build*Message
  inApp:    (event) => ({ icon: "🚗", priority: "medium", detail: rows(event) })  // ports ACTION_META
}
```

Centralized, no duplication. The in-app `detail`/`icon`/`priority` and the Telegram Markdown are *renderers over one template*, not two templates.

### 6.2 Dispatcher

```
dispatch(notification):
  for channel in notification.channels:
    switch channel:
      inApp:    write /notifications/{recipientId}/{id}     (Admin SDK)
      telegram: for chatId in recipient.telegram:
                  sendWithRetry(token, chatId, render.telegram)   ← exists
                  recordDelivery({...})                            ← exists, generalized
      push:     NO-OP (dormant; reserved for v1.11.3)
    write /notification_deliveries/{…}                       (Phase 7)
```

For v1.11.2 only `inApp` and `telegram` are live; `push` is a registered-but-dormant branch (the resolver already returns `push: []`). The dispatcher is the **only** place that knows how to talk to a channel — adding push = one new case.

`recipient.telegram` comes straight from `resolveRecipients().telegram` (already gated by `notificationsEnabled` + chat IDs), so the dispatcher does no recipient logic.

---

## 7. Migration Strategy (Output 6 — Phase 8)

**Shadow-first, channel-at-a-time, no legacy removal.** Mirrors the v1.11.1.3 playbook.

| Stage | Action | Live behavior | Rollback |
|---|---|---|---|
| **S0** | Engine + registry + templates + dispatcher built; `onEventWrite` calls `processEvent` but dispatcher runs in **dry-run** (logs intended writes/sends, writes nothing) | unchanged (legacy in-app + browser Telegram) | flag off |
| **S1** | Enable **inApp dispatch** → engine writes `/notifications/{recipientId}`. In-app center still renders from `/logs`. Compare `/notifications` vs the `/logs`-filtered bell in shadow | unchanged (bell still on `/logs`) | stop writing `/notifications` |
| **S2** | Flip the **bell to read `/notifications`** (per-user subscription, `readAt`-based unread). `/logs` + `isVisibleToUser` remain as fallback/audit | in-app now engine-sourced | repoint bell to `/logs` |
| **S3** | Enable **telegram dispatch** from the engine (server send + retry + delivery). Browser `notification-service.js send*` calls become **no-ops guarded by a flag** (code stays) | Telegram now engine-sourced & server-sent | re-enable browser sends |
| **S4** | Burn-in. Confirm no double-sends, parity on recipients/counts, deliveries logged | engine is the live path | per-channel flags |

Legacy code (`isVisibleToUser`, `build*Message`, `notification-service` `send*`, `ACTION_META`) is **retained, dormant** at the end of v1.11.2. Its removal is a later cleanup release once burn-in is clean. Reminders (`checkAndSend*`) are untouched — they remain client-polled until v1.11.4.

**Double-send guard (critical):** S3 must atomically flip browser-send OFF and engine-telegram ON, gated by one flag, because both resolve the same recipients. The engine's `(eventId, channel)` idempotency key is the backstop.

---

## 8. Validation Checklist (Output 7)

**Recipient parity (extends the v1.11.1.3 shadow logs):**
- [ ] For each live type, engine recipients == union of legacy in-app `isVisibleToUser` audience and legacy Telegram fan-out, per role.
- [ ] `comment.added` excludes the author (matches `isVisibleToUser` + resolver `excludeActor`).
- [ ] Driver match works on `driverUsername` and legacy display-name fallback.
- [ ] `assignment.cancelled` routes by `actor.role` (bidang→admins, else→requester) identically to `sendAssignmentCancelledNotification`.

**Engine / idempotency:**
- [ ] Reprocessing the same `/events` row creates no duplicate notification (key on `eventId+channel`).
- [ ] Unknown / non-registry types (`assignment.updated`, `notification.sent`, …) → no-op, no error.
- [ ] Function retry does not double-dispatch.

**In-app:**
- [ ] `/notifications/{recipientId}` populated for exactly the right users.
- [ ] Unread count = records with `readAt == null`; mark-all-read sets `readAt`.
- [ ] Bell parity vs legacy `/logs`-filtered list during S1 shadow.

**Telegram:**
- [ ] Engine send reaches the same chat IDs as the browser path; `notificationsEnabled` honored.
- [ ] Exactly one send per recipient after S3 (no browser + engine double-send).
- [ ] Delivery recorded; `notification.sent` emitted per channel; terminal (stale chat) classified.

**Safety / rules:**
- [ ] `/notifications` and `/notification_deliveries`: client read scoped to owner/admin; **write false** (server-only).
- [ ] Each stage independently flag-rollbackable; legacy path intact at every stage.
- [ ] Backend `SERVICE_VERSION` bump does not trigger the PWA update banner (separate from `APP_VERSION`).

---

## 9. Recommended Implementation Plan (Output 8)

Architecture only — this is the *build order*, not code. Each step is independently shippable behind a flag.

1. **Model + rules** — define `/notifications/{recipientId}/{id}` and `/notification_deliveries`; add `database.rules.json` entries (owner/admin read, write false). No behavior change.
2. **Registry + templates** — author `REGISTRY` (mirror `OPERATIONAL_ACTIONS`) and the template module; port `ACTION_META` + `build*Message` copy into one place. Pure data/functions, unit-testable, unused.
3. **Engine (dry-run)** — `processEvent(event)`; swap `onEventWrite`'s shadow body to call it with the dispatcher in **dry-run**. Logs intended notifications. (Stage S0.)
4. **Dispatcher — inApp** — implement the inApp case; enable inApp dispatch (S1), then flip the bell to `/notifications` with `readAt` unread (S2). Retire reliance on `isVisibleToUser` (keep the code).
5. **Dispatcher — telegram** — wire the telegram case to `sendWithRetry`/`recordDelivery`; generalize delivery logging to `/notification_deliveries`. Flip browser sends off + engine telegram on under one flag (S3).
6. **Delivery tracking** — finalize per-channel `notification.sent` + `/notification_deliveries`; admin/dev visibility (reuses existing rules pattern).
7. **Burn-in + parity sign-off** (S4) against Section 8. Only then schedule legacy removal (separate release).

**Deliberately not in this plan:** push channel, reminder engine, comment push, browser→Telegram proxy cutover, removal of legacy modules.

---

## 10. Summary

The Notification Engine is **mostly assembly**: the canonical event, the unified resolver, the server Telegram sender, and the delivery/`notification.sent` plumbing already exist in shadow from v1.11.1.3. v1.11.2 adds the three missing pieces — a **persisted notification record**, a **registry + template layer**, and a **channel dispatcher** — and graduates `onEventWrite` from validation-only to `processEvent`. It migrates the two live channels onto that single path **shadow-first, one channel at a time, removing nothing**, so that after this release every channel (in-app, Telegram, and the dormant push/AI channels) originates from one engine — with no direct event→channel wiring left.
