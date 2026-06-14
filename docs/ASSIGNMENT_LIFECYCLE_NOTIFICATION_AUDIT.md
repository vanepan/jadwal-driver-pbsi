# Assignment Lifecycle Notification Audit

**Status:** Audit only. No implementation, no code change, no deploy.
**Date:** 2026-06-14
**Method:** Read of the *actual* implementation — both the **live** path (browser) and the **shadow** path (server engine). Files: `js/app.js` (start/complete/create/cancel callbacks + `logAction`), `js/notification-service.js` (browser Telegram — the live sender), `js/notifications.js` (the in-app bell), `functions/src/events/onAssignmentWrite.js`, `functions/src/notifications/{registry,recipients,dispatcher}.js`, `functions/src/config/constants.js`.

> **The one fact that governs every answer below:** there are **two parallel notification systems**, and only one is *live*.
> - **LIVE in-app** = the bell in `js/notifications.js`, which reads **`/logs`** (via `setNotificationData`) and filters by an `OPERATIONAL_ACTIONS` whitelist.
> - **LIVE Telegram** = the **browser** `js/notification-service.js` (the server Telegram channel is `false` → shadow).
> - **SHADOW** = the server Notification Engine writes `/notifications` + `/notification_deliveries`, but the bell does **not** read `/notifications` yet (Phase C bell cutover has not happened), and server Telegram/Push are flag-gated OFF (push: pilot `['evan']` only). So **server in-app records are invisible**, and **server Telegram never sends**.
>
> Therefore "does X get notified?" must be answered against the **live** path. The server engine's intent is recorded but, for in-app, **not yet user-visible**.

---

## 1. Per-event findings (verified against code)

### 1.1 `assignment.created`

**A. Event production**
- **Live log:** `js/app.js` approval flow writes `logAction({ action: 'assignment_created', metadata: { driver, driverUsername, vehicle, destination, date, startTime, endTime, requestId, requesterId } })` per produced assignment ([app.js:6581-6599](js/app.js#L6581)).
- **Server event:** `saveOneAssignment` → `/assignments` write → `onAssignmentWrite.classify` → **`assignment.created`** ([onAssignmentWrite.js:69](functions/src/events/onAssignmentWrite.js#L69)).

**B. Recipients**
- **Live Telegram:** `sendNewAssignmentNotificationToDriver(...)` → **driver only** ([app.js:6607](js/app.js#L6607), [notification-service.js:481-493](js/notification-service.js#L481)); plus `sendRequestApprovedNotification(...)` → **requester** (this is the *request.approved* message, fired in the same approval) ([app.js:6606](js/app.js#L6606)).
- **Live bell (`/logs`):** admin (sees everything), requester (`meta.requesterId === username`), driver (`meta.driverUsername === username`) ([notifications.js:193-227](js/notifications.js#L193)).
- **Server engine:** `resolveDriver` + `byUsername(requesterId)` → **driver + requester** ([recipients.js:120-124](functions/src/notifications/recipients.js#L120)). (Admin not a server recipient for `created`.)

**C. Channels (live)**
- **inApp:** ✅ admin, requester, driver (bell, whitelisted, `ACTION_META` present).
- **Telegram:** ✅ driver (and requester via the approval message). ❌ admin.
- **Push:** ❌ live — server records shadow/pilot only (only `evan` is in `pilotAllowlist`).

---

### 1.2 `assignment.started`  ⚠️ **GAP**

**A. Event production**
- **Live log:** `registerStartCallback` writes `logAction({ action: 'assignment_started', metadata: { startedAt, startedBy, startOdometer } })` ([app.js:7224-7235](js/app.js#L7224)). **Note the metadata: no `driver`, no `driverUsername`, no `requesterId`.**
- **Server event:** status → `'started'` → `onAssignmentWrite` → **`assignment.started`** ([onAssignmentWrite.js:78](functions/src/events/onAssignmentWrite.js#L78)).

**B. Recipients**
- **Live Telegram:** **NONE.** There is no `notify…Started` function anywhere in `js/notification-service.js`. The start callback makes **no** notification call ([app.js:7199-7238](js/app.js#L7199)).
- **Live bell (`/logs`):** **NONE.** `assignment_started` is **not** in `OPERATIONAL_ACTIONS` ([notifications.js:46-54](js/notifications.js#L46)) and has **no** `ACTION_META` entry → the bell filters it out entirely. (`isVisibleToUser` also has no `assignment_started` case.)
- **Server engine:** `admins(excludeActor)` + `requester(excludeActor)` ([recipients.js:125-131](functions/src/notifications/recipients.js#L125)) — so the engine *intends* to notify admins+requester, **but** the registry gives `assignment.started` channels **`[IN_APP]` only** ([registry.js:32](functions/src/notifications/registry.js#L32)), and that in-app record is written to `/notifications`, which the bell does not read.

**C. Channels (live)**
- **inApp:** ❌ (not whitelisted in the live bell; server `/notifications` record exists but is invisible). Only trace: the **admin-only Activity Log** modal renders raw `/logs` and would list `assignment_started` ([notifications.js:413-435](js/notifications.js#L413)) — but that is a manual audit view, **not a notification** (no badge, no alert).
- **Telegram:** ❌ none.
- **Push:** ❌ none (not in registry channels for `started`).

> **Net: a driver starting a trip (vehicle departure / odometer start) produces NO visible notification to anyone — admin or requester — on any live channel.**

---

### 1.3 `assignment.completed`  ⚠️ **PARTIAL**

**A. Event production**
- **Live log:** `registerCompleteCallback` writes `logAction({ action: 'assignment_completed', metadata: { driver, driverUsername, vehicle, destination, date, requestId, requesterId, completedAt, completedBy, endOdometer, distanceTravelled } })` ([app.js:7284-7303](js/app.js#L7284)). Rich metadata (unlike `started`).
- **Server event:** status → `'completed'` → `onAssignmentWrite` → **`assignment.completed`** ([onAssignmentWrite.js:77](functions/src/events/onAssignmentWrite.js#L77)).

**B. Recipients**
- **Live Telegram:** **NONE.** No `notify…Completed` function exists; the complete callback makes **no** notification call ([app.js:7242-7306](js/app.js#L7242)).
- **Live bell (`/logs`):** admin (sees everything → visible), requester (`meta.requesterId === username`), driver (`meta.driverUsername === username`) — `assignment_completed` **is** whitelisted and has `ACTION_META` ("Pengantaran Selesai") ([notifications.js:102-120](js/notifications.js#L102), [notifications.js:206-223](js/notifications.js#L206)).
- **Server engine:** `admins` + `requester`, channels **`[IN_APP, TELEGRAM, PUSH]`** ([recipients.js:132-136](functions/src/notifications/recipients.js#L132), [registry.js:33](functions/src/notifications/registry.js#L33)) — Telegram is shadow (flag off), Push is shadow unless recipient ∈ `['evan']`.

**C. Channels (live)**
- **inApp:** ✅ admin (and requester/driver) — via the `/logs` bell card.
- **Telegram:** ❌ none (no browser sender; server shadow).
- **Push:** ❌ none for admins (server shadow; only `evan` is pilot-allowlisted).

> **Net: a driver completing a trip (vehicle return / odometer end) shows a SILENT in-app bell card to admins — no push, no Telegram, no badge-pushed alert. Admins only learn of a return by opening the app and the bell.**

---

### 1.4 `assignment.cancelled`  ✅ (best-covered)

**A. Event production**
- **Live log:** cancel callback writes `logAction({ action: 'assignment_cancelled', metadata: { …, cancelledByName, reason, requesterId, driverUsername } })` ([app.js:7311+](js/app.js#L7311)).
- **Server event:** status → `'cancelled'` → **`assignment.cancelled`** ([onAssignmentWrite.js:76](functions/src/events/onAssignmentWrite.js#L76)).

**B. Recipients**
- **Live Telegram:** `sendAssignmentCancelledNotification` → **always the driver**, **plus** admins (if cancelled by bidang) **or** requester (if cancelled by admin) ([notification-service.js:509-548](js/notification-service.js#L509)).
- **Live bell (`/logs`):** admin (all), requester (`requesterId`), driver (`driverUsername`) — whitelisted + `ACTION_META` ([notifications.js:121-138](js/notifications.js#L121)).
- **Server engine:** `resolveDriver` + (admins if actor bidang else requester) ([recipients.js:137-147](functions/src/notifications/recipients.js#L137)) — matches the browser logic.

**C. Channels (live)**
- **inApp:** ✅ driver, admin/requester.
- **Telegram:** ✅ driver + (admins or requester).
- **Push:** ❌ live (server shadow/pilot only).

---

## 2. Assignment Lifecycle Coverage Matrix (LIVE behavior)

Legend: ✅ delivered & visible · ⚪ recorded-but-invisible (server `/notifications`, bell still reads `/logs`) / shadow · ❌ nothing.

| Event | Recipient | In App | Telegram | Push |
|---|---|---|---|---|
| **assignment.created** | Driver | ✅ (bell) | ✅ (browser) | ⚪ shadow* |
| | Requester | ✅ (bell) | ✅ (approval msg) | ⚪ shadow* |
| | Admin | ✅ (bell, sees all) | ❌ | ❌ |
| **assignment.started** | Admin | ❌ (not whitelisted; server inApp ⚪ invisible) | ❌ | ❌ |
| | Requester | ❌ (same) | ❌ | ❌ |
| | Driver (actor) | ❌ (excluded as actor) | ❌ | ❌ |
| **assignment.completed** | Admin | ✅ (bell, sees all) | ❌ | ❌ (⚪ shadow; pilot=evan only) |
| | Requester | ✅ (bell) | ❌ | ❌ (⚪ shadow) |
| | Driver | ✅ (bell) | ❌ | ❌ (⚪ shadow) |
| **assignment.cancelled** | Driver | ✅ (bell) | ✅ (browser) | ⚪ shadow* |
| | Admin (if bidang cancelled) | ✅ (bell) | ✅ (browser) | ⚪ shadow* |
| | Requester (if admin cancelled) | ✅ (bell) | ✅ (browser) | ⚪ shadow* |

\* Push is real **only** for a recipient whose exact `/users` key is in `PUSH_CONFIG.pilotAllowlist` (currently `['evan']`); everyone else records a `shadow:true` delivery and receives nothing.

---

## 3. Answers to the eight questions

**Q1. Does admin receive a notification when a driver *starts* an assignment?**
**No.** Not on any live channel. No browser Telegram call exists for start; `assignment_started` is excluded from the bell whitelist (`OPERATIONAL_ACTIONS`) and has no `ACTION_META`; the server engine writes an in-app `/notifications` record for admins but the bell doesn't read it, and the registry gives `started` no Telegram/Push. The only trace is a raw `/logs` row visible in the admin-only **Activity Log** modal — an audit view, not a notification.

**Q2. If yes — which channels?** N/A. (None. Invisible server `inApp` record aside.)

**Q3. Does admin receive a notification when a driver *completes* an assignment?**
**Yes, but in-app only and silently.** The bell shows a "Pengantaran Selesai" card (admin sees everything). There is **no** push and **no** Telegram on completion.

**Q4. If yes — which channels?** **In-app only** (the `/logs` bell). Not Telegram, not Push.

**Q5. Is current behavior intentional or accidental?**
**Mixed — and the inconsistency is the tell.**
- Completion in-app visibility is **intentional** (whitelisted, `ACTION_META`, admin-sees-all).
- Start having **zero** visible coverage is **accidental divergence**: the server engine clearly *intends* to notify admins+requester on `started` (it resolves them), but (a) the registry caps `started` at `[IN_APP]`, (b) those server in-app records are invisible pre-Phase-C, and (c) the legacy bell whitelist omits `assignment_started` while including every other lifecycle action. Start also logs **impoverished metadata** (no `driver`/`requesterId`), so even if it *were* whitelisted, the bell's non-admin visibility filter (which keys on `requesterId`/`driverUsername`) would fail. This is drift between the new engine and the legacy bell, not a deliberate "don't notify on start" decision.
- The absence of Telegram/Push on **completion** for admins is also effectively accidental: the server registry lists Telegram+Push for `completed`, but they are flag-gated OFF and there is no browser equivalent — so the *intended* coverage never reaches anyone.

**Q6. Does current behavior satisfy PBSI operational requirements?**
**No** — measured against the stated operational purpose of these events (odometer start/end, vehicle departure/return, analytics foundation, operational visibility, future AI Operations Assistant). Admins have **no real-time signal of departure** (start: nothing) and only a **silent, pull-based in-app signal of return** (complete: bell card, no push/Telegram). For live operational visibility — knowing when a vehicle leaves and comes back without staring at the app — the current coverage is insufficient. The *data* foundation is fine (odometer + `distanceTravelled` are captured on completion; analytics already consume `/logs`/assignments), but the *notification* foundation is not.

**Q7. Are there notification coverage gaps?** **Yes — five:**
- **G1 — Start is invisible end-to-end.** No live channel notifies anyone when a trip starts. (Highest-impact for "vehicle departed" visibility.)
- **G2 — Completion has no push/Telegram.** Admins get only a silent in-app card; no proactive alert for "vehicle returned."
- **G3 — Creation Telegram is driver-only.** Admins receive no Telegram on creation (acceptable since admin is the actor, but worth noting for the matrix).
- **G4 — Engine ↔ bell divergence.** Server recipient intent for `started` (admins+requester) contradicts the legacy bell whitelist (excludes `started`), and `assignment_started` `/logs` metadata lacks `driver`/`requesterId` needed by the visibility filter.
- **G5 — Two parallel notification stores, one invisible.** The live bell reads `/logs`; the engine writes `/notifications`. Until the Phase C bell cutover, every server in-app record (including future reminders) is recorded-but-invisible.

**Q8. Would the Reminder Engine inherit or amplify any of these gaps?**
- **Inherits G5 (in-app invisibility).** Reminders ride the same engine → their `IN_APP` records land in `/notifications`, which the bell doesn't read. The reminder architecture already accounts for this by treating **Push + Telegram as the only *visible* reminder channels** — so reminders are not *blocked* by G5, but their in-app surface is invisible just like lifecycle in-app records.
- **Does NOT fix G1/G2.** Reminders are **time-based** (H-1d / H-1h *before* a scheduled trip). They say "your trip is soon," not "the vehicle just departed/returned." The departure/return real-time visibility gap is a **state-change** notification problem that reminders structurally cannot solve. Shipping reminders must **not** be mistaken for closing G1/G2.
- **Amplifies G5 if shipped before Phase C.** Adding reminders increases the volume of recorded-but-invisible `/notifications` traffic and deepens the two-store split-brain until the bell migrates.
- **Shares the credential-gate dependency** already identified for reminders (see REV2 §1–2) — but that is a reminder concern, not a lifecycle one.

---

## 4. Recommendation (separate from reminder implementation)

The lifecycle gaps (G1–G4) are a **distinct workstream** from v1.11.4 and should not be folded into it. A focused, additive lifecycle-coverage patch would:
1. Add `assignment.started` to the registry with **Telegram (+Push)** for **admins** (departure visibility), and enrich the `assignment_started` `/logs` metadata with `driver`/`driverUsername`/`requesterId`.
2. Add `assignment.started`/`assignment_completed` admin **Telegram/Push** coverage (either via the server engine once `REMINDER_FLAGS`-style independent gating exists, or—short term—a browser `notify…Started/Completed`).
3. Add `assignment_started` to the bell whitelist + an `ACTION_META` entry, or accelerate the Phase C bell cutover so server `/notifications` becomes the single in-app source.

These are **recommendations**, not part of v1.11.4. They are recorded here so the reminder release is not misread as delivering operational departure/return visibility.

---

## 5. Bottom line for v1.11.4

- **Is admin notified when assignments START?** **No** (no live channel).
- **Is admin notified when assignments COMPLETE?** **Yes, in-app only and silently** (no push/Telegram).
- **Is current behavior acceptable for PBSI Operations?** **Not for real-time operational visibility** (departure/return). Acceptable only as a passive, pull-based record. G1/G2 should be addressed in a separate lifecycle-coverage workstream.
- **May v1.11.4 (Reminder Engine) implementation begin safely?** **Yes** — reminders are architecturally independent of these gaps (they neither fix nor are blocked by G1–G4), **provided** they are built per `REMINDER_ENGINE_ARCHITECTURE_v1.11.4_REV2.md` (visible channels = Push + Telegram, in-app acknowledged invisible) and **provided** stakeholders understand reminders do not deliver departure/return signals.
