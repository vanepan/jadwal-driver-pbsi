# V1.31 C2 CLOUD FUNCTIONS FOUNDATION REPORT
## Agenda & To-Do — Phase C2

Server-side operational foundation, built and verified against the real RTDB + real trigger handlers (`.run()` invocation, this repo's established Functions-emulator technique), not merely designed. No UI. No deploy. No commit.

---

## 1. Auth Claim

`functions/src/auth/verifyPin.js#resolveRoleClaims()` now mints `agendaKabid: true` alongside the existing `adminEquivalent` derivation, reusing the SAME already-fetched `/customRoles/{role}` record (zero extra RTDB reads). The decision logic was extracted into a new pure function, `deriveExtraClaims(permissions)`, specifically so it is unit-testable without Firebase — `functions/scripts/agenda-kabid-claim-check.js`, **12/12 passed**, including the load-bearing structural proof that the function's signature accepts only a permissions array (`deriveExtraClaims.length === 1`) — there is no code path by which a role id, uid, or request body field could reach it. Server-derived only: `request.data` (the client's callable payload) is never consulted anywhere in this chain.

The Custom Role system itself is untouched — no new role, no change to `bidang`, no change to `VALID_ROLES`. Kabid identity is entirely a function of which permissions an admin-created Custom Role holds, exactly as Phase B §2.1 (Plan A) specified and Phase B.1 §2.1 confirmed as the recommended approach.

## 2. Event Trigger

`functions/src/agenda/onAgendaEventWrite.js` — one `onValueWritten` on `/agendaEvents/{eventId}`, two jobs sharing one diff:
- On genuine creation, mints a deterministic `agenda.created` /events entry (`agenda_created__{eventId}`, via `writeEventWithId`).
- On every write, mints one `agendaAudit` row per detected action, and — for whichever actions have a registered `EVENT_TYPE` — a corresponding notifiable /events entry.

No notification is sent directly from the trigger — every mint goes through the existing `/events → onEventWrite → engine` pipeline unchanged, per the brief's explicit instruction.

## 3. Task Trigger

`functions/src/agenda/onAgendaTaskWrite.js` — structurally identical, `entityType: 'agendaTask'`, and the SAME `diffToAuditActions()` diff engine auto-detects the `responsible` field (vs. `participants`) and emits `responsible_added`/`responsible_removed` instead of `participant_added`/`participant_removed` — one diff engine for both entity types, not two hand-rolled copies (validated by `functions/scripts/agenda-audit-actions-check.js`'s §F, which asserts the field is auto-detected correctly both ways).

## 4. Audit Generation

`functions/src/agenda/auditActions.js#diffToAuditActions(before, after)` — pure, unit-tested in isolation (**17/17**, `agenda-audit-actions-check.js`):
- `created` / `cancelled` / `completed` / generic `status_changed` are mutually exclusive with each other and with a trailing generic `updated` — proven directly (§C).
- `updatedBy`/`updatedAt` are excluded from the generic-change comparison, so a write that only bumps the required actor-attribution fields (every accepted write must, per the C1 Rules invariant) never produces a spurious `updated` row — proven directly (§G), and confirmed against the real emulator in the isPic-only-flip scenario (`agenda-triggers-check.js` [1c]: exactly one `updated` row, no phantom `participant_added`).
- Member-field diffing (`participant_added/removed` / `responsible_added/removed`) correctly identifies the changed usernames, including a simultaneous add+remove (swap) producing exactly two actions.

## 5. Actor Attribution

Unchanged from Phase B.1's design, now implemented and re-verified: the trigger reads `after.updatedBy` and trusts it **only** because `database.rules.json`'s `agendaEvents`/`agendaTasks` `.write` rule (Phase C1, unmodified by C2) already refuses any write where it doesn't equal the real `auth.uid`, on every branch. This trigger does not — and structurally cannot — fabricate a trigger-side auth context; confirmed once more by inspection that no field resembling caller identity exists on the `event` object this or any other trigger in this codebase receives (`onAssignmentWrite.js`, `onRequestWrite.js`, `onEngineeringAssignmentWrite.js` all carry the same absence). `actorLabel` (a resolved `/userProfiles` display name, falling back to the username itself on a lookup failure) is stored separately and explicitly documented as presentation-only, never the security identity — `actorUsername` is.

## 6. Index Synchronization

`functions/src/agenda/{onAgendaEventIndexSync,onAgendaTaskIndexSync}.js`, backed by `scopeClassifier.js` (`resolveUserScope()`, mirroring `verifyPin.js`'s own System-Role-fast-path/Custom-Role-lookup resolution server-side). Recomputes the full desired index membership from `after` (and, for removal, `before`) on every write, in one atomic multi-path `update()`. Verified against the real emulator (`agenda-triggers-check.js`):
- Creation populates both `agendaEventsByUser`/`agendaEventsByScope` (and the Tasks equivalents) with the correct `startAt`/`dueAt` value.
- Participant/responsible add and remove correctly add/remove the affected user's index entry.
- **Cancellation/completion do NOT touch the index** — the organizer's `agendaEventsByUser` entry is still present after cancellation, proven directly ([1e]) — historical accountability preserved exactly per §15.
- A Kabid-scope event indexes under `agendaEventsByScope/kabid`, never `sarpras_shared` — proven directly ([5]).

`classifyCustomRole()` (the pure half of the classifier) has its own isolated test, `agenda-scope-classifier-check.js`, **7/7 passed**, including the `archived: true` hard-fail-closed case.

## 7. Notification Events

14 new `EVENT_TYPES` (`functions/src/events/schema.js`) — the 10 your brief named explicitly plus 4 I added by necessary implication (`agenda.reminder`/`agenda.overdue`/`task.reminder`/`task.overdue`): your brief's §17–20 extensively specifies H-1/overdue reminder *behavior* riding "the existing event/notification architecture," which is structurally impossible without a registered type for the reminder tick to mint into — flagged here explicitly as a judgment call, not a silent addition.

All 14 are registered (`notifications/registry.js`, in-app + push, no Telegram — a real channel already live with zero added complexity, per the spec's own instruction) and given real Indonesian-language copy (`notifications/templates.js`) — a gap your brief didn't name but the existing `engine.js`/`render()` code makes structurally necessary (an unrendered type falls back to the raw type string as its title, which would ship broken copy).

**Recipient resolution** (`notifications/recipients.js`) is the one place this deviates structurally from every other case in the file: **none of the 14 Agenda cases ever call `admins(users)`** — proven three independent ways: (a) direct assertion per-case in `agenda-notify-recipients-templates-check.js` §C, (b) a loop over all 14 types confirming none resolves the fixture's lone unrelated admin, and (c) the real-emulator Kabid-scope trigger test confirming the audit/index side stays correctly scoped so the (already Phase-C1-proven) read-side denial actually protects something real. `participant_added`/`participant_removed`/`responsible_added`/`responsible_removed` target **only the one affected person**, not a fan-out to the whole guest list.

## 8. Reminder Synchronization

Additive extension of `functions/src/reminders/schedule.js` (new `agendaReminderId`/`syncAgendaOffsets`/`tombstoneAgendaOffsets`, `AGENDA_OFFSETS = ['h1','overdue']`) and `functions/src/reminders/tick.js` (one new `if (row.entityType)` branch at the top of the per-row loop, `continue`s past the existing assignment branch — which is **byte-for-byte unchanged**, confirmed by inspection and by `remaining-triggers-check.js`'s assignment-specific assertions still passing unmodified). Two new sync triggers, `onAgendaEventReminderSync.js`/`onAgendaTaskReminderSync.js`, maintain the rows on entity writes.

Verified against the real emulator, deterministic timestamps throughout (no wall-clock dependency — a real bug this pass caught and fixed, see §10):
- H-1 fires once for a live, still-future entity; a retried tick invocation does not duplicate the /events entry (deterministic `agenda__{entityType}__{entityId}__{offset}` id, `writeEventWithId`'s no-op-on-existing-id semantics).
- Overdue fires only when the entity is **genuinely** overdue *at fire time* (re-validated live, not merely "the row said so") — an already-acknowledged event's due overdue row is correctly skipped.
- A cancelled event's pending H-1 row is skipped, not fired; a completed task's pending overdue row is skipped, not fired.
- Completion/cancellation tombstones both offset rows; the reminder rows are the mechanism, `js/agenda/agenda-lifecycle.js`'s pure `isTaskOverdue`/`isEventOverdue` functions from Phase C1 are mirrored (duplicated, documented, and deliberately not imported across the client-ESM/server-CJS boundary — the same accepted pattern `events/schema.js`'s own `keySafe()` already uses) for the tick's live re-validation.

## 9. Kabid Privacy Test

Split across the two mechanisms this codebase actually has, stated explicitly rather than conflated:
- **Trigger-correctness half** (this phase, `agenda-triggers-check.js` §5): a Kabid-scope event's audit row carries `entityScope: 'kabid'`; its index entry lands under `agendaEventsByScope/kabid`, never `sarpras_shared`.
- **Read/write authorization half** (Phase C1, `scripts/agenda-rules-security-check.mjs`, re-run this phase, **65/65 unchanged**): an unrelated Sarpras admin is denied read on both the `kabid`-scope record and its index bucket.
- **Notification half** (this phase, pure test + real-emulator trigger scoping): no Agenda notification path ever resolves an uninvolved admin, and the audit/index data the notification pipeline would key off of is correctly scoped.

Composed together, these three independently-proven pieces give the full guarantee your brief's §26 describes — I did not attempt to fake a single "authenticated-as-admin, try to read, expect PERMISSION_DENIED" test inside the Functions-emulator harness, because that harness uses the raw Admin SDK (which bypasses Rules by construction, confirmed in `_lib/safety-guard.js`'s own header) — asserting a Rules denial there would test nothing real.

## 10. Idempotency Tests

`agenda-triggers-check.js` §4, real replay (not simulated): the identical fixture (same `before`/`after`/`event.time`) run through `onAgendaEventWrite`/`onAgendaEventIndexSync`/`onAgendaEventReminderSync` **twice each** — audit row count stays 1, `/events` entry count stays 1, reminder row stays a single upserted entry at its deterministic id. §3's reminder-tick retry test additionally re-seeds a fired row back to `pending` and fires again, confirming the deterministic `/events` id (not just the row's own status field) is the actual correctness boundary — exactly the guarantee `REV2 §3`'s original assignment-reminder design documents and this phase extends unchanged.

**A real bug was found and fixed during this verification, not merely asserted safe**: both triggers originally stored `timestamp: event.time || Date.now()` — since `event.time` is *always* a truthy ISO string in practice (confirmed against every existing trigger in this codebase), the `Date.now()` fallback never engages, and the audit schema (documented since Phase B as `timestamp: epochMs`) was silently receiving an ISO **string** instead. Caught by this phase's own emulator run (`agenda-triggers-check.js` [2c] failed), root-caused, and fixed to `event.time ? new Date(event.time).getTime() : Date.now()` in both `onAgendaEventWrite.js` and `onAgendaTaskWrite.js` — confirmed fixed by re-running the full suite green.

## 11. Functions Emulator E2E

`functions/scripts/phase-c-emulator/agenda-triggers-check.js` (new, registered in `suite-registry.mjs`) — **41/41 passed** against the real RTDB emulator + real trigger `.run()` invocations, covering every numbered scenario in your brief's §24 (event creation/participant add/PIC/remove/cancel; task creation/responsible add-remove/completion), §25 (deterministic-timestamp reminder firing/skipping/retry), and the trigger half of §26.

## 12. Existing Regression

All run against the actual modified tree, not skipped or assumed:

| Suite | Result |
|---|---|
| `npm run test:functions-emulator` (10 registered suites, including the 5 pre-existing ones + the new Agenda suite) | **10/10 suites, exit 0** |
| `npm run test:rtdb-emulator` (20 registered suites — unaffected, since C2 touched zero Rules) | **20/20 suites, exit 0** |
| `scripts/agenda-rules-security-check.mjs` (Phase C1's own suite, re-run) | **65/65 passed** |
| `scripts/permission-service-check.mjs` | **70/70 passed** |
| `scripts/canAccessModule-check.mjs` | **5/5 passed** |
| `scripts/smoke-boot.mjs` | **PASS** — 0 fatal errors |
| `scripts/workspace-foundation-check.mjs` | **24/24 passed** |
| `scripts/notifications-panel-check.mjs` | **22/22 passed** |
| `functions/scripts/assignment-notify-classify-check.js` | **25/25 passed** |
| `functions/scripts/assignment-notify-debounce-check.js` | **7/7 passed** |
| `functions/scripts/assignment-notify-recipients-templates-check.js` | **17/17 passed** — proves the assignment-specific recipient/template behavior is unaffected by the Agenda cases appended to the same two files |

The three `assignment-notify-*` scripts initially failed to even load with `Can't determine Firebase Database URL` when run directly — traced to a **pre-existing** requirement (requiring `recipients.js`/`templates.js` pulls in `config/admin.js`, which needs a resolvable `databaseURL` just to construct the handle) that these scripts' own house convention already documents (`assignment-notify-recipients-templates-check.js`'s own header comment: "Requires a dummy FIREBASE_CONFIG env var"). Setting it (exactly as documented, not invented) made all three pass cleanly — confirmed pre-existing, not a regression, since none of their own source was touched by this phase.

**Zero failures across every suite run in this phase**, after the one real bug (§10) was found and fixed.

## 13. Production Safety

- Every test ran against the local JVM RTDB emulator (`127.0.0.1:9000`, confirmed by `assertSafeEmulatorOrExit()`'s own canary check in every Functions-emulator run) or the `@firebase/rules-unit-testing` synthetic `demo-*` project (RTDB-only suite) — never the real `schedule-driver-pbsi` project.
- `firebase deploy` was not invoked at any point.
- No commit, no push — `git status --porcelain` shows only working-tree changes.
- `database.rules.json`'s diff is unchanged from Phase C1 (still exactly the 106-line additive block) — **C2 added zero lines to it**, confirmed by `git diff --stat -- database.rules.json`.
- `js/app.js`, every UI file, `js/config.js` (version), `storage.rules`, feature flags, V2 (`src/intelligence/*`), odometer code, and the existing assignment-reminder *assignment-specific* logic — all untouched (the reminder tick's assignment branch is the same code, unmodified; only a new sibling branch was added above it).

## 14. Known Limitations

- **Version staging for the agendaKabid claim's own deploy**: no feature flag gates the Agenda reminder tick's activation (unlike `REMINDER_FLAGS`, which is deliberately assignment-reminder-specific and was not repurposed) — when this eventually deploys, Agenda reminders go live immediately alongside the rest of the Cloud Functions bundle, with no staged-rollout kill switch of their own. Flagging this as a real decision for you before any future deploy, not resolved unilaterally here.
- `agenda.updated`/`task.updated` are genuinely notifiable per your explicit §11/§12 instruction, superseding Phase B.1's earlier (now-outdated) recommendation to keep them audit-only. Worth watching for notification noise once real usage begins — a config change, not a code change, if it needs dialing back.
- The reminder tick's `isAgendaEventOverdue`/`isAgendaTaskOverdue` inline functions must stay byte-for-byte in sync with `js/agenda/agenda-lifecycle.js` (documented in both places) — there is no automated cross-runtime check for this (the same accepted limitation `events/schema.js#keySafe()` already lives with).
- `functions/scripts/phase-c-emulator/agenda-triggers-check.js` and `scripts/agenda-rules-security-check.mjs` are now both wired into their respective suite registries (C2's broader scope permitted this, unlike C1's explicit restriction) — future Agenda regressions will surface automatically in the standard `npm run test:functions-emulator`/`test:rtdb-emulator` runs.

## 15. C3 Prerequisites

1. UI shell (`#v2AgendaWorkspace`, Today integration) and the create/edit drawers — nothing server-side blocks starting this.
2. The participant/PIC picker component (genuinely new UI, no local precedent — flagged since Phase A).
3. A decision on the feature-flag question in §14 before any production deploy is scheduled (not before C3 UI work starts).
4. PDF export (`buildAgendaViewModel`, the date-range resolver, the SARPRAS identity transform) — independent of everything built in C2, can proceed in parallel.
5. Before any production deploy: `database.rules.json` + the 6 new Cloud Functions + the `verifyPin.js` claim change deploy together as one unit (the claim is inert without the Rules that reference it; the Rules are unreachable for Kabid without the claim) — this was already the Phase B §11 deployment-impact table's conclusion, unchanged here.

---

**FINAL STATUS: READY FOR C3**

Checked against every explicit non-negotiable in the C2 brief: the Kabid claim is derived exclusively from a server-fetched Custom Role's permissions array, provably unforgeable from any client input (§1, §4); the Kabid privacy test's trigger half is proven directly and composes with C1's unchanged, re-run Rules proof for the read/write half (§9); no audit actor can be spoofed (unchanged C1 Rules invariant, consumed correctly, §5); audit does not duplicate on retry, proven by real replay (§10); indexes converge on replay, proven by real replay (§6, §10); reminders do not duplicate, proven by real replay including a tick retry (§8, §10); an ordinary participant still cannot write (C1 Rules, re-run, §9); an unrelated admin can see no Kabid data — record, audit, or index (§9); every existing regression suite this phase could plausibly affect was run and is green, with one real bug found and fixed rather than papered over (§10, §12); production was not modified (§13).
