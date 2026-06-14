# Reminder Engine — Production Activation Readiness Review (v1.11.4)

**Status:** Review only. No implementation, no code change, no commit, no deploy.
**Date:** 2026-06-14
**Premise:** v1.11.4 is implemented + deployed; production carries `reminderTick`, `onAssignmentReminderSync`, `/reminders` rules, the `assignment.reminder` model, `REMINDER_FLAGS`, the credential gate, and dispatcher integration — all **dormant** (`REMINDER_FLAGS.enabled:false`).
**Method:** Read of the deployed code — `functions/src/config/constants.js`, `functions/src/reminders/{schedule,onAssignmentReminderSync,tick}.js`, `functions/src/events/{schema,onEventWrite}.js`, `functions/src/notifications/{dispatcher,recipients,registry,templates,model}.js`, `js/notification-service.js`, `js/app.js`, `database.rules.json`.
**Reads:** `REMINDER_ENGINE_ARCHITECTURE_v1.11.4_REV2.md`, `REMINDER_ENGINE_READINESS_REVIEW.md`, `TIER1_OPERATIONAL_DATA_INTEGRITY_ARCHITECTURE.md`.

---

## 0. Headline (read first)

The engine is **safe to activate in shadow (Phase A) and pilot (Phase B) today** — those states produce **no** duplicate, regression, or user-facing change, because the server stays shadow on Telegram while the browser remains the live sender, and reminder Push is independently gated and currently shadow for everyone.

**The single dangerous boundary is Phase C** (reminder Telegram live). At Phase C the server Telegram reminder and the still-running **browser** reminders (`checkAndSendH1Reminders`/`checkAndSendHoursReminders`) are **both live → guaranteed duplicate Telegram**. This is a known, coupled cutover: browser reminders must be disabled **in the same deploy** that sets `REMINDER_FLAGS.channels.telegram:true`. Phase C also surfaces two latent gaps the browser currently masks: the **reschedule-after-fire** at-most-once limitation and the **no-backfill** coverage gap for trips created before activation.

**Verdict: READY FOR ACTIVATION** — where "activation" means **begin at Phase A, then B**. Phase C/D are conditional and must not be flipped until their preconditions (browser retirement + reschedule-gap decision + backfill decision) are met.

---

## Phase 1 — Current State Audit

| # | Question | Finding (from code) |
|---|---|---|
| 1 | Current `REMINDER_FLAGS` | `enabled:false`, `channels:{inApp:true, telegram:false, push:false}`, `pilotAllowlist:[]` ([constants.js](functions/src/config/constants.js)). **Fully dormant.** |
| 2 | Reminder activation state | **Inactive.** `onAssignmentReminderSync` returns immediately when `!enabled` (no `/reminders` rows written); `reminderTick` returns immediately when `!enabled` (no events emitted). Both functions are deployed and *running* (the tick fires every 5 min) but **no-op**. |
| 3 | Browser reminder state | **Active and live.** `checkAndSendH1Reminders` (H-1 day) and `checkAndSendHoursReminders` (~H-2h) run on page load, on `setInterval` timers, and on every Firebase assignments-change ([app.js:6886-6891](js/app.js#L6886), [app.js:6987-6988](js/app.js#L6987)). They send Telegram via the browser `sendNotification` path. |
| 4 | Any legacy reminder path still exists? | **Yes** — the browser path (#3) is the only *live* reminder sender. It is deduped per-browser/per-day via `localStorage` (`pbsi_reminders`, keyed `${id}:h1`/`${id}:h2`, [notification-service.js:52-69](js/notification-service.js#L52)). |
| 5 | Are browser reminders the active sender? | **Yes.** With `NOTIFICATION_FLAGS.channels.telegram:false` and `REMINDER_FLAGS` dormant, every reminder users actually receive today comes from the browser path. |

**Adjacent live state:** `NOTIFICATION_FLAGS` = `enabled:true, {inApp:true, telegram:false, push:false}` (lifecycle in-app records written but invisible — bell reads `/logs`; lifecycle Telegram still browser-sent). `PUSH_CONFIG.pilotAllowlist:['evan']` (evan receives **lifecycle** push). These are unchanged by reminder activation.

---

## Phase 2 — Double-Send Risk Audit

### 2.1 If `REMINDER_FLAGS.enabled = true` (everything else unchanged — Phase A)

- `onAssignmentReminderSync` begins materializing `/reminders` rows on assignment writes; `reminderTick` begins emitting `assignment.reminder` events at fireAt.
- Each event → `onEventWrite` → engine → dispatcher. Credential gate: `isReminder=true`, but `REMINDER_FLAGS.channels.telegram/push` are false and `pilotAllowlist` empty → **token=null, and VAPID loads only because the lifecycle pilot `['evan']` already forces it** (immaterial — see push gating). Dispatcher `liveFor`: telegram→shadow, push→shadow, inApp→`NOTIFICATION_FLAGS.channels.inApp=true`→**SENT inApp delivery row**.
- **Net:** server records `/notifications` (inApp "sent", invisible — bell reads `/logs`, and reminders write no `/logs` entry) + shadow Telegram/Push delivery rows. **Server sends nothing to any channel.** Browser reminders continue as today.
- **Double-send? NO.** The only reminders users receive are still the browser ones.

### 2.2 If additionally `REMINDER_FLAGS.channels.telegram = true` (Phase C)

- Credential gate now loads the Telegram token for `assignment.reminder` events; `liveFor(telegram, reminder)` → **live**. Server sends a Telegram reminder to driver + requester.
- **Browser reminders are still running** (#1.3) and send their own H-1 day / H-2h Telegram to driver + requester.
- **Double-send? YES — guaranteed**, and worse than 1:1: the offsets don't even align (browser H-1**day** + H-**2h** vs server H-1**d** + H-1**h**), so a user can receive up to **four** reminder messages for one trip, two of them near-duplicate.
- **Mitigation (mandatory, from REV2 §1.4):** disable `checkAndSendH1Reminders` + `checkAndSendHoursReminders` **in the same deploy** as the `channels.telegram:true` flip. Until that client change ships, Phase C must not be activated.

### 2.3 Four channel paths traced

| Path | Phase A | Phase B | Phase C (browser retired) | Phase C (browser NOT retired) |
|---|---|---|---|---|
| **Browser reminder** (Telegram) | live | live | **disabled** | live ❌ |
| **Reminder Engine** (server) | shadow | push-pilot only | telegram live | telegram live |
| **Notification Engine** (lifecycle) | unchanged (telegram shadow) | unchanged | unchanged | unchanged |
| **Telegram bot** | browser only | browser only | server only | **browser + server = DUP** |

### 2.4 Specific duplicate scenarios

| Scenario | Verdict | Evidence |
|---|---|---|
| Duplicate **H-1 day** reminder | **Only at Phase C if browser not retired** (browser H-1day + server H-1d). Prevented by the coupled cutover. | §2.2 |
| Duplicate **H-1 hour** reminder | Same — browser H-2h and server H-1h are different *times* but overlapping *intent*; both fire at Phase C if browser live. | §2.2 |
| Duplicate **Telegram message** | Same root cause; the headline risk. | §2.2 |
| Duplicate **Push** | **No.** Reminder push uses deterministic `deliveryId`; the dispatcher skips a `sent` row ([dispatcher.js getDelivery→skip if SENT]); browser has **no** push path. Multi-device = one per device (intended). | §3 |
| **Server-internal** duplicate (any channel) | **No.** Deterministic `eventId` → at-most-once notification (`persistNotification` skips existing) + at-most-once delivery; `loadDueReminders` only returns `status:'pending'`, tick marks `fired` after emit; a crash-then-re-emit writes the same event id → `onValueCreated` does not re-fire. Verified by 33/33 unit harness. | [schedule.js loadDueReminders], [tick.js], [model.js:73-81] |

**Browser-path pre-existing caveat (context, not introduced by v1.11.4):** browser dedup is **per-browser** `localStorage`. If two admins both have the app open, each browser independently sends the H-1 reminder → the driver can already receive duplicate browser reminders today. This is a reason the server engine is more reliable, and a reason **not** to leave both paths live at Phase C.

---

## Phase 3 — Push Impact Review (v1.11.3 interaction)

| Item | Finding |
|---|---|
| Push pilot behavior | **Unchanged.** Lifecycle push gated by `NOTIFICATION_FLAGS.channels.push` (false) `||` `PUSH_CONFIG.pilotAllowlist` (`['evan']`). evan still gets lifecycle push exactly as before. |
| Push allowlist behavior | **Independent.** Reminder push gated by `REMINDER_FLAGS.channels.push` `||` `REMINDER_FLAGS.pilotAllowlist` (`[]`). evan is **not** in the reminder allowlist → reminder push is **shadow for evan** until explicitly added. No crossover with the lifecycle pilot. |
| Reminder push behavior | Sends only when `REMINDER_FLAGS.channels.push` or a reminder-pilot match — currently never. When enabled, reuses `dispatchPush` verbatim (load subs → encrypted send → prune 404/410 → per-device delivery row). |
| iPhone / Android / Desktop | **Identical to lifecycle push** — same `web-push` transport, same VAPID (`PUSH_CONFIG.subject` = Apple-valid `https://schedule-driver-pbsi.web.app`), same service worker, same subscriptions. No new client code, no new SW. The §5.4 per-offset `entityId` tag suffix is data-only (SW unchanged). |
| Impact on assignment/lifecycle/existing push delivery | **None.** Reminder events have a disjoint id namespace (`reminder__…`) and their own gates. VAPID is already loaded for all events today (lifecycle pilot non-empty), so reminder activation changes nothing about how lifecycle push loads or sends. |

**Conclusion:** reminder activation **cannot** affect existing push. Reminder push is fully decoupled and currently inert.

---

## Phase 4 — Telegram Impact Review

| Item | Finding |
|---|---|
| Existing (lifecycle) Telegram path | **Unchanged.** Gated by `NOTIFICATION_FLAGS.channels.telegram` (false) → browser remains the live lifecycle sender. The credential gate loads a token for a *lifecycle* event only if `NOTIFICATION_FLAGS.channels.telegram` — still false at every reminder phase → lifecycle Telegram stays shadow regardless of `REMINDER_FLAGS`. |
| Reminder Telegram path | Gated by `REMINDER_FLAGS.channels.telegram`; credential gate loads the token for a *reminder* event only when that flag is true. Verified the cred-gate predicate is **identical** to `dispatcher.liveFor` (REV2 §2.2) — 33/33 harness incl. the cross-check. |
| Credential loading | Per-event, type-aware: `telegramMaySend = NOTIFICATION_FLAGS.channels.telegram || (isReminder && REMINDER_FLAGS.channels.telegram)` ([onEventWrite.js]). A lifecycle event never sees a reminder-loaded token and vice-versa. |
| Dispatcher routing | `liveFor` branches on `notification.type === 'assignment.reminder'`; lifecycle and reminder use disjoint flag blocks. |
| Lifecycle unchanged? | **Yes.** Same bot token, but routing/gating never crosses. |
| Reminder isolated? | **Yes.** |
| Accidental channel crossover? | **None** found. The only shared resource is the bot identity (expected). |

---

## Phase 5 — Event Foundation Review

| Concern | Finding |
|---|---|
| Event IDs | Reminder uses **deterministic** `reminder__<assignmentId>__<offset>` via `writeEventWithId` (`set`); lifecycle uses **random push keys** via `writeEvent` (`push()`). **Disjoint namespaces — no collision possible.** |
| Notification IDs | `notificationId = keySafe(eventId)` → reminder notif ids are `reminder__…`, lifecycle are push-key-derived. No overlap → a reminder can never overwrite or dedup against a lifecycle notification. |
| Delivery IDs | `deliveryId = eventId__recipientId__channel` → inherits the disjoint event-id namespace. No collision. |
| Idempotency | Three structural guards intact (deterministic event id; `persistNotification` skip-if-exists; delivery skip-if-`sent`) + the `/reminders` row `status` pre-filter. At-most-once per (assignment, offset). |
| Interference with `assignment.created/started/completed/cancelled` | **None.** `onAssignmentReminderSync` is a **separate** trigger from `onAssignmentWrite`; both fire on a `/assignments` write independently (no ordering dependency). The recipients/registry/templates additions are new keys only — existing cases byte-for-byte unchanged. `engine.js`/`model.js` untouched. |
| `/events` ordering side-effect | Deterministic keys break *lexical* `/events` ordering for reminder rows; `timestamp` (=fireAt) is accurate so *time* ordering holds. Only matters to an admin/developer consumer that sorts `/events` by key — low risk; flagged. |

---

## Phase 6 — Production Safety Review

### A. `enabled=true, telegram=false, push=false` (Phase A — Shadow)
- **Expected behavior:** `/reminders` rows materialize; tick emits reminder events; engine writes `/notifications` (inApp "sent", invisible) + **shadow** Telegram/Push delivery rows; **nothing sends**. Browser reminders unchanged.
- **Risks:** essentially none user-facing. New DB writes under `/reminders`, `/events`, `/notifications`, `/notification_deliveries` (all server-only, bounded). One caveat: **only assignments written *after* activation get rows** (no backfill — `onAssignmentReminderSync` was dormant). Pre-existing future trips are covered by the browser until they're next written.
- **Rollback:** set `enabled:false`, redeploy functions → tick + sync no-op immediately. Existing rows become inert. Zero user impact.

### B. `enabled=true, telegram=false, push=true`*(or reminder pilotAllowlist set)* (Phase B — Pilot)
- *(Note: the safe pilot uses `REMINDER_FLAGS.pilotAllowlist:[<exact key>]`, not a global `channels.push:true`.)*
- **Expected behavior:** allowlisted recipients receive **real reminder Push**; everyone else stays shadow; Telegram still shadow (browser live). A pilot user who also gets the browser Telegram reminder sees the reminder on **two channels** (Telegram + Push) — cross-channel, **not** a within-channel duplicate (same property as the v1.11.3 push pilot).
- **Risks:** pilot user double-surface (acceptable, expected); reminder push requires the user already has a `/push_subscriptions` device (iPhone: installed PWA). Exact-case allowlist gotcha applies.
- **Rollback:** empty `REMINDER_FLAGS.pilotAllowlist` (or `channels.push:false`), redeploy → reverts to shadow. No data cleanup needed.

### C. `enabled=true, telegram=true, push=true` (Full)
- **Expected behavior:** reminder Telegram to everyone + reminder Push (global or pilot).
- **Risks (HIGH if entered naively):**
  1. **Duplicate Telegram** with live browser reminders — **must retire browser reminders in the same deploy** (§2.2). Hard precondition.
  2. **Reschedule-after-fire gap** (Special Focus) becomes user-visible once the browser safety net is gone.
  3. **No-backfill gap** — trips created before Phase A activation that were never re-written have **no** `/reminders` row; after browser retirement they get **no** reminder at all. Requires a backfill or a guarantee that all live future trips have rows.
  4. Phase D push depends on the v1.11.3 push channel going live globally (or remaining pilot-scoped).
- **Rollback:** `channels.telegram:false`/`push:false` (+ re-enable browser reminders if they were retired) → reverts. Note rollback here is **two-artifact** (functions flags + client browser-reminder re-enable) — slower than A/B.

---

## Phase 7 — Operational Validation

| # | Capability | Verified behavior |
|---|---|---|
| 1 | Reminder **creation** | `onAssignmentReminderSync` on `assignment.created` → `computeFireAts` → upsert two `pending` rows (gated on `enabled`). |
| 2 | Reminder **scheduling** | fireAt computed at WIB `+07:00` (H-1d = tripStart−24h, H-1h = tripStart−1h); verified incl. month-boundary; null-safe. |
| 3 | Reminder **cancellation** | `assignment.cancelled/completed/started/deleted` → `tombstoneOffsets` (status `cancelled`); tick also re-validates live state and tombstones a cancelled/gone trip. |
| 4 | Reminder **rescheduling** | date/startTime change → `assignment.updated` + `scheduleChanged` → `syncOffsets` overwrites fireAt in place. **Caveat:** a row already `fired` is preserved as `fired` (Special Focus). |
| 5 | Reminder **firing** | tick (every 5 min) loads due `pending` rows (`fireAt ≤ now`, fireAt index), re-validates, applies staleness guard (`now ≥ tripStart` or status `started` → `skipped`), mints deterministic event, marks `fired`. |
| 6 | Reminder **delivery** | rides existing engine→dispatcher; inApp/Telegram/Push per `liveFor`. No parallel path. |
| 7 | Reminder **tracking** | `/notifications/{recipient}/{id}` + `/notification_deliveries/{deliveryId}` (shadow flag when not live) + `/reminders/{id}` status (`pending→fired/skipped/cancelled`, `firedAt`, `eventId`). Durable, inspectable. |
| 8 | Reminder **rollback** | one-flag reversible (Phase A/B); two-artifact at Phase C. No destructive data. |
| 9 | Reminder **observability** | `/reminders` is the inspectable timer queue (admin/developer read); `/events` carries the fired reminder; delivery rows carry shadow/sent/devices; structured logs (`[reminder/tick] done {due,fired,skipped,cancelled}`). |

---

## Special Focus — Reschedule-after-fire (deterministic-ID limitation)

**Trace (actual code, `syncOffsets`):** on a reschedule, each offset row is rewritten with the new fireAt but `status = prior.status === 'fired' ? 'fired' : 'pending'`. A `fired` row stays `fired` and `loadDueReminders` only returns `pending` → it never re-fires. Even if it *were* reset to `pending`, the deterministic `eventId` already exists, so `writeEventWithId` is a `set`-update that **does not re-fire** `onValueCreated`. Either way: **a reminder that already fired does not re-fire for the new schedule.**

**Concrete outcome:**
- Trip tomorrow 09:00; H-1d fires today. Admin moves trip to next week.
- **H-1d:** row is `fired` → **no new H-1d reminder** for the new date.
- **H-1h:** if not yet fired (it won't have, it fires 1h before the *new* time) → row stays `pending`, fireAt recomputed → **H-1h reminder DOES fire** for the new date.
- Worst case (reschedule after **both** offsets fired — e.g. an imminent trip pushed a week out): **no server reminder at all** for the new date.

**Is it masked today?** **Yes, during Phase A/B.** Browser reminders are date-relative and re-evaluated daily (`localStorage` state resets when the day changes), so a rescheduled trip is re-reminded by the browser. The gap is **only user-visible at Phase C** once the browser is retired.

**Classification:**
- **Acceptable?** Yes for Phase A/B (masked) and arguably for Phase C with eyes open — it affects only the subset of trips rescheduled *after* a reminder already fired, and H-1h still covers most reschedules.
- **Operational risk?** Low–medium, Phase C only.
- **Future enhancement?** Yes — the clean fix is a **schedule-version in the id** (`reminder__<id>__<offset>__v<n>`) so a material reschedule mints a fresh, distinct event; or reset `fired→pending` with a new event-id scheme. **Out of scope for activation** (would be a redesign).
- **Activation blocker?** **No** for Phase A/B. For Phase C, it is a **decision point**, not a hard blocker: either accept the documented gap (and keep an eye on rescheduled trips) or land the versioned-id enhancement first.

---

## Final Deliverable

### 1. Activation Readiness
## **READY FOR ACTIVATION**
…where activation means **begin at Phase A, soak, then Phase B**. The engine is structurally safe to turn on in shadow now: no duplicate, no regression to push/Telegram/lifecycle, no user-facing change, no data corruption, no hidden side effects beyond bounded server-only writes. **Phase C and D are conditional** (see preconditions) and must not be entered until they are met.

### 2. Recommended Activation Sequence
1. **Pre-flight:** confirm `REMINDER_FLAGS` is dormant (it is); confirm browser reminders live (they are) — they are your safety net through Phase A/B.
2. **Phase A — Shadow.** Set `REMINDER_FLAGS.enabled:true` (leave channels/pilot as-is). Redeploy functions. Create a few test trips; verify `/reminders` rows, tick firing (`[reminder/tick] done`), `/events` reminder rows, `/notifications` + **shadow** delivery rows, **zero** sends. Confirm browser reminders unaffected. Soak several days against real trips. *(Note the no-backfill behavior: validate with trips created after activation.)*
3. **Phase B — Pilot.** Add one or two **exact-case** `/users` keys to `REMINDER_FLAGS.pilotAllowlist`. Redeploy. Verify those recipients get real reminder **Push** (subscribed devices), everyone else stays shadow, Telegram still browser-only. Confirm no within-channel duplicate; accept the cross-channel double-surface for pilots. Soak.
4. **Phase C — Telegram live (GATED).** Only when ready to retire the browser path: in **one deploy**, set `REMINDER_FLAGS.channels.telegram:true` **and** disable `checkAndSendH1Reminders`/`checkAndSendHoursReminders` in `js/notification-service.js`, **and** resolve the no-backfill + reschedule-after-fire decisions (backfill rows for existing future trips; accept or fix the reschedule gap). Validate no duplicate Telegram.
5. **Phase D — Push live (GATED).** Set `REMINDER_FLAGS.channels.push:true`, empty the reminder pilot. Gated on the v1.11.3 push channel posture.

### 3. Recommended Flag Values (safe initial production)
```
REMINDER_FLAGS = {
  enabled: true,                                  // Phase A — activate shadow
  channels: { inApp: true, telegram: false, push: false },
  pilotAllowlist: [],                             // empty until Phase B
}
```
Leave `NOTIFICATION_FLAGS` and `PUSH_CONFIG.pilotAllowlist:['evan']` **untouched**.

### 4. Rollback Procedure
- **Phase A/B (one-flag, instant):** `REMINDER_FLAGS.enabled:false` (or empty `pilotAllowlist` / `channels.*:false`), redeploy functions → tick + sync no-op, sends stop, shadow rows are inert. No data migration; `/reminders` and reminder `/events`/`/notifications` rows are harmless if left.
- **Phase C (two-artifact):** `channels.telegram:false` **and** re-enable the browser reminder calls in the same deploy → reverts to browser-only reminders. (This is why Phase C rollback is slower — plan it.)
- **Phase D:** `channels.push:false` → reminder push reverts to shadow.
- Nothing is destructive; all delivery/`/reminders` rows are append/idempotent audit.

### 5. Known Limitations
1. **Phase C browser-retirement coupling** — reminder Telegram + live browser reminders = duplicate; retire browser in the same deploy. (Mandatory precondition, not a defect.)
2. **Reschedule-after-fire** — a reminder that already fired does not re-fire for a new schedule (at-most-once). Masked by the browser until Phase C; future fix = versioned ids.
3. **No backfill** — assignments created/last-written *before* Phase A activation have no `/reminders` rows until next written; browser covers them until Phase C. Phase C needs a backfill or a coverage guarantee.
4. **In-app reminders invisible** — server writes `/notifications` inApp records, but the bell reads `/logs` (reminders write none). Push + Telegram are the only *visible* reminder channels (by design, REV2 §5.3).
5. **`/events` lexical ordering** — deterministic reminder keys aren't chronologically ordered by key; sort by `timestamp`.
6. **Pre-existing browser multi-browser duplicate** — browser dedup is per-browser; unrelated to v1.11.4 but a reason to retire it at Phase C.

### 6. Production Risk Assessment
| Risk | Likelihood | Severity | When | Mitigation |
|---|---|---|---|---|
| Duplicate Telegram | **High if Phase C without browser retirement** | High | Phase C | Coupled cutover (mandatory) |
| Reschedule-after-fire missed reminder | Medium | Low–Med | Phase C | Accept (documented) or versioned-id enhancement first |
| No-backfill missed reminder | Medium | Med | Phase C | Backfill `/reminders` before retiring browser |
| Push regression (lifecycle) | Very Low | High | any | None needed — fully decoupled (Phase 3) |
| Telegram regression (lifecycle) | Very Low | High | any | None needed — gating never crosses (Phase 4) |
| Event/idempotency collision | Very Low | High | any | Disjoint id namespace + 3 guards (Phase 5) |
| Operational data corruption | None | — | — | Reminders touch no Tier-1/odometer/assignment data; read-only on `/assignments` |
| Hidden side effects | Low | Low | Phase A | Bounded server-only writes; tick runs every 5 min (no-op when disabled) |

**Overall:** Phase A/B carry **negligible** production risk. All material risk is concentrated at the **Phase C boundary** and is fully mitigable by the documented coupled cutover plus two pre-Phase-C decisions (backfill, reschedule gap). Production stability is preserved by activating shadow-first and holding at Phase B until those decisions are made.
