# PHASE B.1 SECURITY CORRECTION REPORT
## Agenda & To-Do — Participant Access + Server-Authoritative Audit

No application code, Firebase Rules, or Cloud Functions have been modified to produce this report. Nothing deployed, committed, or pushed. Production untouched. V2 untouched. Odometer untouched. Existing assignment-reminder semantics untouched.

This report corrects exactly two things in `docs/AGENDA_TODO_PHASE_B_ARCHITECTURE_VALIDATION_v1.31.0.0.md`: ordinary-participant write access (§2.3's own flagged open question, R13), and `agendaAudit` becoming server-authoritative (which Phase B left client-writable, §2.5). Everything else from Phase B stands unless changed below to keep these two corrections internally consistent.

---

# 1. PARTICIPANT ACCESS CORRECTION

Phase A/B's model already made PIC a boolean flag inside `participants` (§1.5 of Phase B), not a separate list — so this correction is a pure **Rules** change, no data-model change. The locked table from your brief is implemented exactly:

| Identity | Read | Write |
|---|---:|---:|
| Organizer | YES | YES |
| Sarpras admin/adminEquivalent, `sarpras_shared` scope | YES | YES |
| Kabid claim, `kabid` scope | YES | YES |
| PIC (`participants[uid].isPic === true`) | YES | YES |
| Ordinary participant (`participants[uid]` exists, `isPic` not `true`) | YES | **NO** |
| Unrelated user | NO | NO |

`.read` is **unchanged from Phase B** (`participants.child(auth.uid).exists()`, no `isPic` condition — any participant, PIC or not, retains read). Only `.write`'s participant branch is narrowed from "any participant" to "`isPic === true` participant." Exact corrected rule in §5.

A PIC (or organizer, or scope-authorized writer) can set or clear any participant's `isPic` flag — this is intentional, not a gap: someone has to be able to designate accountability, and the spec gives organizer/PIC that authority implicitly ("PIC tetap individual" is a statement about *who's accountable*, not a restriction on *who assigns it*).

---

# 2. TASK AUTHORIZATION CORRECTION

Re-examined against your brief's §3: tasks have no separate participant concept — `responsible` already **is** the sole access list, and Phase B's task rule already restricted write to `createdBy === auth.uid || responsible.child(auth.uid).exists() || scope-bypass`. An unrelated authenticated user already fails every branch (verified again below) — **there was no read/write asymmetry bug on the task side**; §3 of your brief was a "confirm this is still true," not a bug report, and it is confirmed true. The only change tasks get in this pass is the same actor-attribution tightening events get (§4/§5) — nothing else.

"A responsible person may mark done, but not every responsible person marking it is required" remains **application-layer** logic, unchanged from Phase B: Rules authorize *who may write the record at all*; which specific responsible person is allowed to trigger the actual completion transition is a UI/service-layer check, exactly as Phase B already documented (Rules cannot express "only this one of several valid writers may set this specific field").

---

# 3. AUDIT ARCHITECTURE CORRECTION

Phase B's `agendaAudit` rule (§2.5 there) let any client `set()` a new audit row directly, reasoned as "authorized implicitly by the fact that the corresponding event/task write already passed its own rule." **That reasoning is wrong and is withdrawn.** Two independent writes in the same client operation are two independent authorization decisions to Firebase Rules — there is no mechanism by which passing rule A implies rule B should pass, and a client can trivially call `set()` on `/agendaAudit/{fakeId}` in complete isolation, with no corresponding event/task write at all. Corrected:

```json
"agendaAudit": {
  ".write": "false",
  "$auditId": {
    ".read": "auth != null && (
      (data.child('entityScope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
      (data.child('entityScope').val() === 'kabid' && auth.token.agendaKabid === true)
    )"
  }
}
```

No `.write` is declared anywhere in the `$auditId` subtree — the `false` at the collection level is therefore the only applicable rule at every path beneath it (RTDB rule cascade only ever **grants** downward from an ancestor that evaluates true; a child with no rule of its own inherits the nearest ancestor's, and here that ancestor is `false`). This is byte-for-byte the same shape as `/userProfiles` and `/reminders` — both already `.write:false`, both already written exclusively by an Admin-SDK Cloud Function trigger. `agendaAudit` now joins that same, already-established "trigger-owned derived data" family; it is not a new pattern.

The correct write path becomes exactly the diagram your brief specifies:
```
Client → /agendaEvents/{id} or /agendaTasks/{id} (Rules-gated, as before)
              ↓ (RTDB write commits)
       onAgendaEventWrite / onAgendaTaskWrite (new Cloud Function trigger)
              ↓ (Admin SDK, bypasses Rules by construction — the ONLY writer)
       /agendaAudit/{auditId}
```

---

# 4. ACTOR ATTRIBUTION MECHANISM

## 4.1 What I inspected, and what it actually proves

Read in full: `functions/src/events/onAssignmentWrite.js`, `onRequestWrite.js`, `onEngineeringAssignmentWrite.js` (every existing RTDB-trigger-to-event producer in this codebase), plus `database.rules.json`'s `assignments`/`driver_requests` rules.

**Finding, stated plainly**: this codebase's existing `deriveActor()` functions are explicitly documented in their own code as *not* trustworthy —
```js
// events/onAssignmentWrite.js:91
/** Best-effort actor from the persisted node (the writer wasn't recorded server-side). */
function deriveActor(after, type) {
  if (type === 'assignment.created') {
    return { uid: null, role: null, displayName: after.createdBy || null };  // plain client-written string, unverified
  }
  ...
  return { uid: null, role: null, displayName: null };  // the actual fallback for most transitions
}
```
`after.createdBy`, `after.cancelledBy.uid`, `after.approvedBy` are all **raw fields the client itself wrote**, and — confirmed by reading the actual `assignments`/`driver_requests` Rules — **none of those specific fields are Rules-enforced to equal `auth.uid`**. This is used today *only* to fill in a display name inside a notification message; it was never built to survive an adversarial client, and it does not. Copying this pattern for `agendaAudit` would not satisfy your requirement, and I am not copying it.

## 4.2 The mechanism that *is* sound, and its precedent in this codebase

`driver_requests`' own Rule (`database.rules.json:283-288`) already does the right thing, just only for one branch:
```json
".write": "... || (auth.token.role === 'bidang' && ((!data.exists() && newData.child('requesterId').val() === auth.uid) || (data.exists() && data.child('requesterId').val() === auth.uid && newData.child('requesterId').val() === auth.uid)))"
```
Because the Rule **rejects any write where `requesterId !== auth.uid`**, by the time a trigger reads `after.requesterId`, that value is not "best-effort" — it is **cryptographically guaranteed** to equal the real authenticated writer's uid, because the write could not have landed in the database otherwise. RTDB Rules are evaluated server-side, against the real verified `auth` token, atomically with the write — there is no way for a client to set a field to anything but its own uid and have that write accepted.

The reason this doesn't already give `driver_requests`/`assignments` trustworthy attribution for *every* action is narrower scope, not a flaw in the technique: the admin branches of those two rules have **no** matching self-attribution requirement (an admin can write anything to those fields), and only the *creator* identity was ever protected this way — not "whoever performed this specific update." That is a deliberate gap in scope for those two modules (their `/events` actor was always cosmetic, never audit-grade), not evidence the technique itself doesn't work.

## 4.3 The corrected design: close the gap comprehensively for Agenda specifically

Since `agendaEvents`/`agendaTasks` are new rules, not constrained by `assignments`'/`driver_requests`' existing shape, I extend the technique to **every** accepted write, not just create:

**Every branch of `agendaEvents`/`agendaTasks`' `.write` rule — create and update, organizer, PIC, and both scope-bypasses alike — requires `newData.child('updatedBy').val() === auth.uid`** (full text in §5). There is no branch left unconstrained. A write that doesn't self-attribute to the real caller is rejected outright, regardless of which authorization path (organizer/PIC/admin/Kabid) it would otherwise qualify under.

Consequence: **`after.updatedBy` (and, on create, `after.createdBy`) is trustworthy by construction** by the time `onAgendaEventWrite`/`onAgendaTaskWrite` reads it — not because the trigger trusts the client, but because the Rule already refused to persist any value the client could have forged. The trigger stores this **username** as the audit row's canonical `actorUsername` field; a separately-labeled `actorLabel` (resolved from `/userProfiles/{actorUsername}.displayName` by the trigger, Admin SDK, at write time) is included purely for rendering convenience and is explicitly **not** the security identity — matching your brief's "human-readable labels may still be resolved for presentation; do not store identity using display name as the canonical security identity" instruction precisely, and matching this feature's own §1.1 canonical-identity rule (username, never display name, is the identity of record).

**This does not rely on Cloud Functions v2 exposing the writer's auth context inside the trigger event** — confirmed by reading all three existing triggers, none of them use any such field, because `onValueWritten` events genuinely carry no caller-identity metadata. The mechanism instead moves the trust boundary to where it actually holds: the Rules engine, which *does* see the real `auth` on every write, and which now structurally refuses to let a forged `updatedBy` exist in the database at all.

## 4.4 One load-bearing consequence for Phase C's write code

Because `updatedBy` must be present and correct on **every** accepted write — including a small `update()` patching only, say, `participants` — Phase C must **not** let call sites hand-assemble partial writes. A single canonical write helper (`js/agenda/agenda-write.js`, mirroring the Credential Service's "one function owns every write" discipline already established in this codebase) must always inject `{updatedBy: auth.uid, updatedAt: <ISO>}` into every payload before it reaches Firebase, on every call site, with no exceptions. A call site that forgets this is not a security hole — the Rule rejects the write outright — but it *is* a functional bug (a legitimate edit silently fails), so the helper's existence is the thing that prevents that failure mode from ever being hand-rolled incorrectly at a call site. This is a design constraint for C3, not a Phase B.1 code change.

---

# 5. FIREBASE RULES CHANGES (exact, superseding Phase B §2.3–2.5)

## 5.1 `agendaEvents`

```json
"agendaEvents": {
  "$eventId": {
    ".read": "auth != null && (
      data.child('participants').child(auth.uid).exists() ||
      data.child('organizerUsername').val() === auth.uid ||
      (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
      (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true)
    )",
    ".write": "auth != null && newData.exists() && newData.child('updatedBy').val() === auth.uid && (
      (!data.exists() &&
        newData.child('createdBy').val() === auth.uid &&
        newData.child('organizerUsername').val() === auth.uid &&
        ((newData.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (newData.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      ) ||
      (data.exists() &&
        newData.child('organizerUsername').val() === data.child('organizerUsername').val() &&
        newData.child('scope').val() === data.child('scope').val() &&
        newData.child('createdBy').val() === data.child('createdBy').val() &&
        (
          data.child('organizerUsername').val() === auth.uid ||
          data.child('participants').child(auth.uid).child('isPic').val() === true ||
          (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
          (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true)
        )
      )
    )",
    ".validate": "newData.hasChildren(['id','title','scope','organizerUsername','status','createdBy','createdAt','updatedBy','updatedAt']) && newData.child('id').val() === $eventId && (newData.child('scope').val() === 'sarpras_shared' || newData.child('scope').val() === 'kabid')"
  }
}
```
Diff from Phase B: (a) top-level `newData.child('updatedBy').val() === auth.uid` added; (b) the plain-participant write branch narrowed to `.child('isPic').val() === true`; (c) `createdBy` added to the update branch's immutable-field set (was previously only `organizerUsername`/`scope`); (d) `.validate` requires `updatedBy`/`updatedAt` present.

## 5.2 `agendaTasks`

```json
"agendaTasks": {
  "$taskId": {
    ".read": "auth != null && (
      data.child('responsible').child(auth.uid).exists() ||
      data.child('createdBy').val() === auth.uid ||
      (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
      (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true)
    )",
    ".write": "auth != null && newData.exists() && newData.child('updatedBy').val() === auth.uid && (
      (!data.exists() &&
        newData.child('createdBy').val() === auth.uid &&
        ((newData.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (newData.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      ) ||
      (data.exists() &&
        newData.child('scope').val() === data.child('scope').val() &&
        newData.child('createdBy').val() === data.child('createdBy').val() &&
        (data.child('createdBy').val() === auth.uid ||
         data.child('responsible').child(auth.uid).exists() ||
         (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      )
    )",
    ".validate": "newData.hasChildren(['id','title','scope','status','priority','createdBy','createdAt','updatedBy','updatedAt']) && newData.child('id').val() === $taskId"
  }
}
```
`.read` unchanged from Phase B (already correct — no ordinary/PIC split exists for tasks). `.write` gains the same `updatedBy===auth.uid` requirement and `createdBy` immutability; the authorization branches themselves (`createdBy===auth.uid || responsible.exists() || scope-bypass`) are unchanged because they were already correct.

## 5.3 `agendaAudit`

Superseded in full by §3 above — `.write:false`, no client write path anywhere in the subtree, `.read` unchanged from Phase B. Add `.indexOn: ["entityId"]` at the collection level (not in Phase B) so a future "show history for this event" screen can query efficiently — cheap, harmless, and directly useful given the audit node's entire purpose is per-entity history.

---

# 6. CLOUD FUNCTION CHANGES

## 6.1 New: `functions/src/agenda/onAgendaEventWrite.js` / `onAgendaTaskWrite.js`

One `onValueWritten` trigger per entity type (`/agendaEvents/{eventId}`, `/agendaTasks/{taskId}`). Combines two concerns that both need the *same* before/after diff, so they're computed once, not duplicated across separate triggers:
1. On genuine create (`!before && after`), mints `agenda.created`/`task.created` into `/events` (feeds the existing notification pipeline per Phase B §5) — this is the "creation notification," not a scheduled reminder.
2. On every write, computes a list of consequential-change "actions" and writes one `agendaAudit` row per action via the Admin SDK.

```js
// functions/src/agenda/auditActions.js — pure, unit-testable, no Firebase
// (extracted exactly the way reminders/schedule.js's pure helpers are, per this
// codebase's own "pure logic separate from the I/O trigger" convention)
const IGNORED_FIELDS = ['updatedBy', 'updatedAt'];  // never trigger a spurious 'updated' row on their own

function stripIgnored(obj) {
  const copy = { ...(obj || {}) };
  for (const f of IGNORED_FIELDS) delete copy[f];
  return copy;
}

function diffToAuditActions(before, after) {
  if (!before && after) return [{ action: 'created' }];
  if (before && !after) return []; // defensive — Rules forbid delete, should never happen

  const actions = [];
  if (before.status !== after.status) {
    actions.push(after.status === 'cancelled'
      ? { action: 'cancelled', note: after.cancelReason || null }
      : { action: 'status_changed', note: `${before.status} -> ${after.status}` });
  }
  if (!before.acknowledgedAt && after.acknowledgedAt) actions.push({ action: 'acknowledged' });
  if (!before.completedAt && after.completedAt) actions.push({ action: 'completed' });

  const beforeMembers = new Set(Object.keys(before.participants || before.responsible || {}));
  const afterMembers  = new Set(Object.keys(after.participants  || after.responsible  || {}));
  for (const u of afterMembers)  if (!beforeMembers.has(u)) actions.push({ action: 'participant_added',   affectedUsername: u });
  for (const u of beforeMembers) if (!afterMembers.has(u))  actions.push({ action: 'participant_removed', affectedUsername: u });

  if (actions.length === 0 && JSON.stringify(stripIgnored(before)) !== JSON.stringify(stripIgnored(after))) {
    actions.push({ action: 'updated' });
  }
  return actions;
}

module.exports = { diffToAuditActions, stripIgnored };
```

```js
// functions/src/agenda/onAgendaEventWrite.js (shape; onAgendaTaskWrite.js mirrors it for /agendaTasks)
const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { buildEnvelope, writeEvent } = require('../events/schema');
const { diffToAuditActions } = require('./auditActions');

function keySafe(v) { return String(v == null ? '' : v).replace(/[.#$/[\]]/g, '_'); }

const onAgendaEventWrite = onValueWritten(
  { ref: '/agendaEvents/{eventId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    const eventId = event.params.eventId;
    const actorUsername = (after || before).updatedBy;               // Rules-guaranteed trustworthy — §4
    const actorLabel = (await db.ref(`userProfiles/${actorUsername}/displayName`).once('value')).val() || actorUsername;

    if (!before && after) {
      // Creation notification — rides the existing engine/dispatcher pipeline (Phase B §5).
      try {
        await writeEvent(buildEnvelope({
          type: 'agenda.created',
          actor: { uid: actorUsername, role: null, displayName: actorLabel },
          entity: { kind: 'agendaEvent', id: eventId },
          payload: { organizerUsername: after.organizerUsername, participants: after.participants, title: after.title, startAt: after.startAt },
          timestamp: event.time || new Date().toISOString(),
        }));
      } catch (err) { logger.error('[onAgendaEventWrite] creation event failed', { eventId, error: err.message }); }
    }

    const actions = diffToAuditActions(before, after);
    for (const a of actions) {
      const auditId = keySafe(`${eventId}__${event.time}__${a.action}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
      try {
        await db.ref(`agendaAudit/${auditId}`).set({
          id: auditId, action: a.action, note: a.note || null,
          affectedUsername: a.affectedUsername || null,
          actorUsername, actorLabel,                                   // §4.3 — the split canonical/presentation pair
          entityType: 'agendaEvent', entityId: eventId,
          entityScope: after ? after.scope : before.scope,
          timestamp: event.time || Date.now(),
        });
      } catch (err) { logger.error('[onAgendaEventWrite] audit write failed', { eventId, action: a.action, error: err.message }); }
    }
  }
);

module.exports = { onAgendaEventWrite };
```

**Idempotency**: the audit id is deterministic — `keySafe(entityId__event.time__action[__affectedUsername])`. `event.time` is a property of the underlying RTDB write event itself (already used this way in `onAssignmentWrite.js`), not freshly generated per invocation — so a retried/replayed delivery of the *same* write event recomputes the *identical* id and writes the *identical* content via `.set()`, a true no-op on replay. Two *different* logical writes (even to the same field, moments apart) get different `event.time` values and therefore different audit rows, as intended. This mirrors `writeEventWithId()`'s exact idempotency technique (`reminder__${assignmentId}__${offset}`) — reused, not reinvented.

**"No meaningless duplicate rows"**: `IGNORED_FIELDS` excludes `updatedBy`/`updatedAt` from the generic-change comparison specifically so that a write which changes *only* those two bookkeeping fields (which every write must touch, per §4.4) never by itself produces a spurious `'updated'` audit row.

## 6.2 Unchanged from Phase B

`onAgendaEventIndexSync.js`/`onAgendaTaskIndexSync.js` (participant/scope fan-out index) and `onAgendaEventReminderSync.js`/`onAgendaTaskReminderSync.js` (timer-queue maintenance) are **not modified by this correction** — three independent triggers per entity type now exist on the same node (audit+creation-event, index-sync, reminder-sync), which is this codebase's own explicitly-established pattern ("two triggers on one node is an established additive pattern," `onAssignmentReminderSync.js`'s own header — now extended to three, same reasoning, each independent and idempotent).

`functions/index.js` gains 2 new exports (`onAgendaEventWrite`, `onAgendaTaskWrite`) alongside the 4 already flagged in Phase B §11.

`verifyPin.js`'s `agendaKabid` claim (Phase B §2.1 Plan A) is **unchanged and still pending your confirmation** — not resolved by this pass.

---

# 7. EMULATOR SECURITY TESTS (specification — not executed in this pass)

Consistent with this whole engagement's phase discipline so far (Phase A and Phase B were both pure architecture documents; "DO NOT implement Phase C" governs this pass too), the tests below are written as a **complete, implementation-ready specification** — exact scenario, exact assertion — for `scripts/agenda-rules-security-check.mjs` (new, `@firebase/rules-unit-testing`, mirroring the existing `test:rtdb-emulator` harness convention), to be built and actually run as the first item of Phase C1 (already scheduled in Phase B §13). I have **not** stood up the emulator or executed anything in this pass; flagging this explicitly rather than silently deciding it, per your "clearly separate test code from production implementation" instruction — say the word and I'll build and run it now instead of deferring to C1.

## 7.1 Case A–F (your brief's exact numbering)

| # | Scenario | Assertion |
|---|---|---|
| A | Ordinary participant (`isPic` absent/false) reads a `sarpras_shared` event they're invited to | `get()` succeeds |
| A | Same identity attempts `update()` on that event | `PERMISSION_DENIED` |
| B | PIC (`isPic: true`) reads the event | `get()` succeeds |
| B | Same PIC updates `title` | succeeds, and produces one `agendaAudit` row with `action:'updated'` |
| C | Organizer reads/updates their own event | both succeed |
| D | Unrelated authenticated user (not organizer/participant/scope-authorized) reads/writes the event | both `PERMISSION_DENIED` |
| E | Sarpras admin (not a participant) reads a `kabid`-scope event | `PERMISSION_DENIED` |
| E | Same admin attempts to write it | `PERMISSION_DENIED` |
| F | A Kabid-invited Sarpras user (cross-scope participant, `isPic:false`) reads a `kabid` event | succeeds |
| F | Same identity attempts a write | `PERMISSION_DENIED` (ordinary participant, not PIC) |
| F | Same scenario with `isPic:true` | write succeeds |

## 7.2 Direct audit-attack tests (mandatory, your §10)

| Attempt | Expected |
|---|---|
| `set('/agendaAudit/fake-id', {...})` from any authenticated client (admin included) | `PERMISSION_DENIED` |
| `update('/agendaAudit/fake-id', {...})` | `PERMISSION_DENIED` |
| `remove('/agendaAudit/{existing-real-id}')` | `PERMISSION_DENIED` |
| `set('/agendaAudit/forged', {user:'someone-else', entityId:'evt1', action:'completed'})` | `PERMISSION_DENIED` (no `.write` rule exists at all — the specific forged shape is irrelevant, everything is denied identically) |
| Client attempts `set('/agendaEvents/{id}', {..., updatedBy:'someone-else-uid', ...})` (impersonation attempt on the *record* itself, the actual attack §4 defends against) | `PERMISSION_DENIED` |

## 7.3 Audit integration tests (Functions emulator, your §11)

Create event → assert exactly one `agendaAudit` row, `action:'created'`, `actorUsername` equals the real test-auth uid (not a client-supplied string). Update title → one `'updated'` row. Add participant → one `'participant_added'` row with correct `affectedUsername`. Remove participant → one `'participant_removed'` row. Cancel → one `'cancelled'` row. Same sequence for tasks (create/update/responsible add-remove/complete). **Replay test**: re-deliver the identical trigger event payload twice (simulating a Cloud Functions v2 retry) → assert the audit collection still contains exactly one row per action (the deterministic-id `.set()` naturally collapses the retry — assert row *count*, not just presence, to actually catch a duplicate-id bug rather than assume the design works).

---

# 8. EXISTING REGRESSION TESTS TO RE-RUN

Unchanged list from Phase B §13 C2/C6, restated because this correction touches Rules/Functions territory adjacent to several of them: `permission-service-check`, the `customRoles`/role-family checks, the full `rtdb-*-check` family (sibling-rules, hardening-phases, hardening-functions — none of `database.rules.json`'s *existing* nodes are touched by this correction, but the suite should still run green to prove that), existing notification tests, existing reminder tests (`reminders/schedule.js`/`tick.js` are **not modified** by Phase B.1 at all — this correction lives entirely in new `functions/src/agenda/*` files plus the Rules block — so this is a zero-risk re-run, not a new risk), `smoke-boot`, `workspace-foundation-check`, executive/home checks. No code exists yet to run them against for this feature specifically — this list is carried forward as C1/C2's gate, unchanged in scope by this correction.

---

# 9. REMAINING RISKS

- Phase B's R8 (the `agendaKabid` claim needs your confirmation) and R11 (mobile calendar grid) carry forward unchanged — neither is affected by this correction.
- **New, minor**: the audit trigger now does one extra `/userProfiles` read per write (to resolve `actorLabel`) — negligible cost, but worth noting since it's a new per-write read Phase B's design didn't have. If `/userProfiles/{actorUsername}` is momentarily missing (a brand-new account, or a rare race), `actorLabel` falls back to the raw username — never blocks the audit write itself.
- **New, minor**: three triggers now fire per Agenda write (audit+creation-event, index-sync, reminder-sync) instead of Phase B's two — slightly more Cloud Functions invocations per write, each cheap and independent; not a correctness risk, noted for completeness in any future cost/latency review.
- The `diffToAuditActions()` participant-diff logic assumes `before`/`after` participant maps are plain `{username: {...}}` objects (true by the data model) — if a future schema change nests participants differently, this pure function's own unit tests (to be written in C1, mirroring `reminders/schedule.js`'s pure-function test convention) are what would catch the drift, not a Rules failure.

---

# 10. PHASE C READINESS

Checklist against your brief's explicit gates:

- Actor attribution is no longer based on an untrusted client field — it is a Rules-enforced invariant (`updatedBy === auth.uid` on every accepted write, all branches), consumed by a trigger that could not have observed anything else. ✓
- An ordinary (non-PIC) participant can read but can no longer mutate an event. ✓
- No client can write `/agendaAudit` under any path or shape — `.write:false`, no exception, confirmed against the RTDB rule-cascade semantics that make this airtight. ✓
- No admin blanket bypass on Kabid scope (carried forward from Phase B, re-verified here — untouched by this correction). ✓
- No hard-delete path exists (`newData.exists()` requirement, carried forward, unchanged). ✓
- No new auth bypass introduced — every change in this pass *narrows* what was previously permitted (participant write) or *closes* what was previously open (audit write); nothing is newly granted. ✓

**FINAL STATUS: READY FOR C1**

(Conditional only on the two carry-forward Phase B open items — R8's `verifyPin.js` claim mechanism, R13 which this report itself resolves — being confirmed or redirected by you before C1's Rules/Functions land for real; the emulator tests in §7 are specified but not yet executed, and are C1's first concrete task, not a blocker to starting it.)
