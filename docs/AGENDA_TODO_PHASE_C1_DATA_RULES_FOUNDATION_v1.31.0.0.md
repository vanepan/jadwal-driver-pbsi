# V1.31 C1 DATA + RULES FOUNDATION REPORT
## Agenda & To-Do — Phase C1

Implements exactly the scope authorized: the data and security foundation (RTDB Rules + one pure lifecycle module), against the Phase B / Phase B.1 design, verified by real emulator execution — not merely specified. No UI, no Cloud Functions, no `verifyPin.js` change, no deploy, no commit.

---

## 1. Files Changed

| File | Change | Lines |
|---|---|---|
| `database.rules.json` | Modified — 7 new top-level blocks appended after `gudang` | +106, purely additive |
| `js/agenda/agenda-lifecycle.js` | New | 39 |
| `scripts/agenda-lifecycle-check.mjs` | New | 47 |
| `scripts/agenda-rules-security-check.mjs` | New | 243 |

`database.rules.json`'s diff is **strictly additive** — `git diff --stat` shows `106 insertions(+)`, `0 deletions(-)`. Every pre-existing node in the file is byte-identical to before this phase; nothing existing was edited.

Also present in the working tree, carried over from this session's earlier phases (not new in C1, listed for completeness since nothing has been committed yet): `docs/AGENDA_TODO_DISCOVERY_REPORT_v1.31.0.0.md`, `docs/AGENDA_TODO_PHASE_B_ARCHITECTURE_VALIDATION_v1.31.0.0.md`, `docs/AGENDA_TODO_PHASE_B1_SECURITY_CORRECTION_v1.31.0.0.md`.

Two incidental side effects of *running* the regression suite (not edits I made) were found and reverted before finalizing: `scratch/workspace-foundation-dark.png` (a screenshot `workspace-foundation-check.mjs` regenerates as a byproduct of running it — restored via `git checkout --`) and a stray `nul` file (a Windows shell-redirect artifact — deleted). Neither is part of this phase's actual changeset.

---

## 2. Data Schema Implemented

Exactly the Phase B / Phase B.1 model, no undocumented fields added. `.validate` on both canonical nodes enforces the required-field list and self-consistent `id`:

- **`agendaEvents/{eventId}`** — `id, title, description, type, allDay, date, startAt, endAt, location, scope, organizerUsername, participants{[username]:{isPic,status,invitedBy,invitedAt}}, status, cancelledBy, cancelledAt, cancelReason, acknowledgedAt, acknowledgedBy, recurrence{type,interval,until}, reminderConfig{enabled}, attachments[], createdBy, createdAt, updatedBy, updatedAt`.
- **`agendaTasks/{taskId}`** — `id, title, description, dueDate, dueTime, dueAt, responsible{[username]:{assignedBy,assignedAt}}, scope, status, priority, checklist[], attachments[], reminderConfig{enabled}, createdBy, createdAt, updatedBy, updatedAt, completedAt, completedBy`. No recurrence field — not part of the approved task model, not added.
- **`agendaAudit/{auditId}`** — schema left open at the Rules layer (no `.validate` on this node beyond what its `.read` predicate needs — `entityScope` — since the record shape itself is defined by the C2 trigger code, not by C1's Rules); canonical identity remains username throughout (`organizerUsername`, map keys, `createdBy`/`updatedBy` are all usernames — no display name anywhere in the schema).

Derived index value shape, exactly per Phase B §3.1: `agendaEventsByUser/{username}/{eventId} = startAt`, `agendaEventsByScope/{scope}/{eventId} = startAt`, `agendaTasksByUser/{username}/{taskId} = dueAt`, `agendaTasksByScope/{scope}/{taskId} = dueAt` (epoch-ms values, `.indexOn:".value"` on each — enables a future `orderByValue()` range query without fetching every record first).

---

## 3. Firebase Rules Implemented

7 new top-level blocks in `database.rules.json`, exact text as specified in `docs/AGENDA_TODO_PHASE_B1_SECURITY_CORRECTION_v1.31.0.0.md` §5, carried forward without alteration:

- **`agendaEvents`** — `.read`: participant (any, `isPic` irrelevant) OR organizer OR scope-bypass (`sarpras_shared`→admin/adminEquivalent, `kabid`→`agendaKabid` claim). `.write`: every accepted branch requires `newData.child('updatedBy').val() === auth.uid`; create requires self-attributed `createdBy`/`organizerUsername` plus scope authorization; update requires organizer, **PIC-only** participant (`participants[uid].isPic === true`), or scope-bypass, with `organizerUsername`/`scope`/`createdBy` pinned immutable. `newData.exists()` required everywhere — hard delete structurally impossible.
- **`agendaTasks`** — same shape, `responsible` in place of `participants`/PIC (no participant concept for tasks, per spec); creator/responsible/scope-bypass may write; `scope`/`createdBy` immutable.
- **`agendaAudit`** — `.write: false` at the collection level, **no `.write` declared anywhere in the `$auditId` subtree** — confirmed the only applicable rule at every path is the inherited `false` (RTDB cascade only ever grants downward, never re-opens what an ancestor closed). `.read` scope-conditioned, no cross-scope leak.
- **`agendaEventsByUser` / `agendaEventsByScope` / `agendaTasksByUser` / `agendaTasksByScope`** — all `.write: false`; reads scoped to self (`agendaEventsByUser/$username` → `auth.uid === $username` only, **no admin bypass**) or to the matching scope-bypass predicate, with the `kabid` leg of each index carrying **no admin branch at all** — deliberately stricter than every other admin-tier node in this file.

`auth.token.agendaKabid` is referenced throughout but **not yet minted anywhere in production** (`verifyPin.js` untouched, per the explicit C1 scope boundary) — until C2 adds it, no real user can ever satisfy that branch, so the Kabid scope is inert in production today, not a live gap.

---

## 4. Lifecycle Logic

`js/agenda/agenda-lifecycle.js` — two pure functions, `isTaskOverdue(task, now)` / `isEventOverdue(event, now)`, exactly the definitions specified (task: `status !== 'done' && dueAt != null && now > dueAt`; event: `status === 'scheduled' && acknowledgedAt == null && endAt != null && now > endAt`). Zero Firebase/DOM/network imports; `now` is always an explicit parameter, never read internally — confirmed by inspection (no `Date.now()` call anywhere in the file) and by the tests below, which pass a single fixed anchor timestamp throughout.

`node --check js/agenda/agenda-lifecycle.js` — clean.

---

## 5. Security Tests (executed against the real RTDB emulator, not merely specified)

`node scripts/agenda-lifecycle-check.mjs` → **16/16 passed** — task (no-due-date, future, exact boundary, past, done-before/after-due, reopened-while-overdue) and event (before/exact/after end, acknowledged before/after end, cancelled, missing `endAt`) cases, plus null-safety, all exactly matching the boundary semantics specified (exclusive `now > x`, not `>=`).

`firebase emulators:exec --only database "node scripts/agenda-rules-security-check.mjs"` → **65/65 passed**, covering:

- Shared-scope event read/write matrix (admin, ordinary participant, PIC, unrelated user, unauthenticated) — 9 checks.
- Kabid-scope event read/write matrix, **including the Case-4/5 control**: an admin who is not a participant is denied read AND write on a `kabid`-scope event — 9 checks.
- Event and task immutability (`scope`, `organizerUsername`, `createdBy`, `id`) — 7 checks.
- **Actor attribution** — every authorized-to-write identity (organizer, admin, PIC, responsible task member, Kabid) attempting to set `updatedBy` to someone else — all denied — plus one control case proving a correctly self-attributed write still succeeds (the mechanism narrows, it doesn't blanket-deny) — 6 checks.
- Task authorization mirror (creator/responsible/Kabid/unrelated/driver-bidang-viewer) — 7 checks.
- Hard-delete attempts on both node types — 2 checks.
- **Direct audit-attack tests**: `set`/`update`/`delete` against `agendaAudit` from an authenticated admin, a forged-identity record, and a Kabid identity — all denied; a legitimate scope-matched read still succeeds — 7 checks.
- **Index-attack tests**: client write attempts against all 4 derived-index nodes (admin and Kabid identities) — all denied (8 checks) — plus the full cross-scope read matrix proving the Kabid index legs have no admin bypass and per-user index legs have no cross-user bypass — 6 checks.
- **Multi-path/rule-cascade test** — the one this phase exists to prove closed: a single atomic multi-location `update()` combining a legitimate event-field write with a forged `agendaAudit` write and a forged index write is **denied in full** (RTDB's atomic multi-location semantics mean one denied path fails the entire write — confirmed by then re-reading the record and finding the earlier, isolated legitimate write's value, not the piggyback attempt's), immediately preceded by a control case proving the event-only write succeeds in isolation — 3 checks.

This is real, executed proof that Phase B's original flaw (assuming a passing event-write rule implied a passing audit-write) cannot occur under the corrected Rules — not a re-assertion of the design document.

`scripts/agenda-rules-security-check.mjs` is a standalone file, run directly via `firebase emulators:exec` exactly like every other file in `scripts/rtdb-emulator/`, but is **not** added to `scripts/rtdb-emulator/suite-registry.mjs` — that file was not in this phase's authorized scope to modify. Wiring it into the general `npm run test:rtdb-emulator` run is a one-line follow-up for you or C2 to make, not done unilaterally here.

---

## 6. Existing Regression Tests

All run against the actual modified `database.rules.json` / working tree, not skipped or assumed:

| Suite | Result |
|---|---|
| `npm run test:rtdb-emulator` (full existing suite — 20 registered checks, includes `role-claim-rules-check`, `custom-role-archived-rule-check`, `custom-role-protected-permission-check`, `custom-roles-collection-read-check`, `assignments-driver-requests-ownership-check`, and 15 more) | **20/20 suites, exit 0** |
| `scripts/permission-service-check.mjs` | **70/70 passed** |
| `scripts/canAccessModule-check.mjs` | **5/5 passed** |
| `scripts/smoke-boot.mjs` | **PASS** — 0 fatal errors, `version.json` still `1.30.14.6` (confirms no accidental version drift) |
| `scripts/workspace-foundation-check.mjs` | **24/24 passed** |
| `scripts/reminder-engine-check.mjs` | **49/49 passed** — this is the *vehicle-document* reminder engine (a different, unrelated "reminder" system per Phase A §15's own conflict-avoidance note — the *assignment*-reminder Cloud Functions are untouched code with no standalone emulator check found under this name; their behavior is covered structurally, see below) |
| `scripts/notifications-panel-check.mjs` | **22/22 passed** |
| `scripts/executive-dashboard-dom-check.mjs` (one representative of the 12 `executive-*-verification-check.mjs` files) | **37/37 passed** |

**Why the other 11 `executive-*-verification-check.mjs` files and `functions/`-side assignment-reminder tests were not individually re-run**: `git diff`/`git status` (§1) proves zero files under `functions/`, `js/app.js`, or any `js/workspace|widgets/` path were touched by this phase — the causal precondition for any of those suites regressing does not exist. This is a structural argument, not an assumption: a test suite cannot detect a regression in code that was not changed. The one representative executive check and the full RTDB/permission suites above were run anyway as direct confirmation the general test harness itself still executes cleanly against the modified repo state.

**Zero failures across every suite run in this phase.**

---

## 7. Production Safety Verification

- All Rules tests ran against the **local JVM emulator** (`firebase emulators:exec --only database`) at `127.0.0.1:9000` — confirmed via the emulator's own startup log in every run above; no `--project` flag pointing at the real Firebase project was ever used, and `initializeTestEnvironment()` always targeted `projectId: 'demo-sarpras-*'` (a synthetic emulator-only project id, never the real `schedule-driver-pbsi`).
- `firebase deploy` was **not** invoked at any point in this phase (confirmed: no such command appears in any tool call made).
- No commit, no push (confirmed: `git status --porcelain` above shows only working-tree changes, no new commits on the branch).
- `functions/`, `js/app.js`, every UI file, `js/config.js` (version), `storage.rules`, feature flags, V2 (`src/intelligence/*`), odometer code, and existing assignment-reminder Cloud Functions — all **untouched**, confirmed by `git status`/`git diff --stat` showing precisely the 4 files listed in §1 and nothing else.
- No OpenAI call was made or could be made by anything in this phase (no network-calling code was written).

---

## 8. Known Limitations

- `auth.token.agendaKabid` is referenced by the new Rules but is **not yet minted in production** — `verifyPin.js` is untouched by design (explicit C1 boundary). Until C2 resolves Phase B's still-open R8 (mint via a `verifyPin.js` addition, Plan A, vs. a hardcoded Custom Role id literal, Plan B) and implements whichever is chosen, the `kabid` scope branch of every new rule is reachable only inside the emulator test's synthetic claims, never by a real logged-in user.
- No Cloud Functions exist yet for `agendaAudit`, the derived indexes, or reminders — `agendaAudit`/the four index nodes are correctly `.write:false` but currently have **no writer at all** (not even a server one) — this is intentional (C1 is Rules-only) but means nothing can actually be created end-to-end yet; that's C2's job.
- No UI exists — `js/agenda/` contains only the one pure lifecycle module.
- `scripts/agenda-rules-security-check.mjs` is not wired into `scripts/rtdb-emulator/suite-registry.mjs` (out of C1's authorized scope to modify) — runs standalone today.
- `agendaAudit` has no `.validate` clause beyond what `.read` needs (`entityScope`) — deliberate, since the exact record shape is C2 trigger code's responsibility to define and write correctly (Admin SDK bypasses Rules validation anyway; a `.validate` here would only constrain a client write path that no longer exists).

---

## 9. C2 Prerequisites

1. **Decide Phase B §2.1's open item**: mint `agendaKabid` via a small `verifyPin.js` addition (Plan A, recommended) or a hardcoded Custom Role id literal in Rules (Plan B, zero Functions change). This gates whether C2 touches `verifyPin.js` at all.
2. Build the 6 Cloud Function triggers designed in Phase B.1 §6: `onAgendaEventWrite` / `onAgendaTaskWrite` (audit + creation-notification), `onAgendaEventIndexSync` / `onAgendaTaskIndexSync` (derived-index maintenance), `onAgendaEventReminderSync` / `onAgendaTaskReminderSync` (timer-queue maintenance, additive extension of `functions/src/reminders/{schedule,tick}.js`).
3. `functions/src/events/schema.js` / `notifications/registry.js` / `notifications/recipients.js` additions from Phase B §5 (the 6 new `EVENT_TYPES`, careful to **not** blanket-cc admins per Phase B.1's own explicit warning on this exact point).
4. Once C2's triggers exist, re-run `scripts/agenda-rules-security-check.mjs` plus new Functions-emulator integration tests (audit-row creation, idempotency-on-retry, index fan-out correctness) before C2 is itself declared complete — this phase's Rules tests only prove the *client* boundary; C2 needs to prove the *trigger* behavior on top of it.

---

**FINAL STATUS: READY FOR C2**

Checked against every explicit non-negotiable in the C1 brief: no mandatory security test failed (65/65 new + 0 failures across every existing suite run); an ordinary participant cannot write an event (tested, denied); no client can write `agendaAudit` under any attack shape including the multi-path cascade (tested, denied); no client can write any derived index (tested, denied); the Kabid scope is not visible to an unrelated admin, on records or on indexes (tested, denied on both); `updatedBy !== auth.uid` cannot pass on any authorized-write branch (tested, denied on all five identity types checked); no existing assignment/reminder/permission/notification/workspace regression appeared in any suite run; production was not modified (Rules not deployed, no commit, emulator-only throughout).
