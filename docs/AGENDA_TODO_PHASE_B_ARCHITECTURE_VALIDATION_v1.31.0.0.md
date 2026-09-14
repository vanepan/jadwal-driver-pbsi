# V1.31 PHASE B ARCHITECTURE VALIDATION REPORT
## Agenda & To-Do — Shared Sarpras Calendar + Kabid Calendar + Task Management + PDF Reporting

No application code, Firebase Rules, or Cloud Functions have been modified to produce this report. Nothing deployed. Nothing committed. This report validates and refines the Phase A data model/permission model against the exact current contents of `database.rules.json`, `functions/src/events/schema.js`, `functions/src/notifications/{registry,recipients}.js`, `functions/src/reminders/{schedule,tick,onAssignmentReminderSync}.js`, `functions/src/users/onUserWrite.js`, `functions/src/config/constants.js`, `js/config/{role-registry,permission-registry,role-permissions}.js`, and `js/role-management/custom-roles-store.js` — all read in full for this pass, 2026-09-11.

The 14 LOCKED decisions from the Phase B prompt are treated as fixed constraints throughout; nothing below contradicts them.

---

# 1. FINAL DATA MODEL

## 1.1 Canonical identity rule

**Every identity-bearing field stores a `username` (this app's immutable uid — confirmed `auth.uid === username` throughout `database.rules.json`, e.g. `auth.uid === $username`), never a display name.** Display names are resolved at render time via `/userProfiles/{username}.displayName` (the existing broadly-readable mirror, `.read: auth != null`). This is load-bearing for both the permission model (Rules can only see `auth.uid`/`auth.token.role`, never a display string) and the PDF identity transform (§6), which must substitute on *identity*, not on a name string that could collide.

## 1.2 `/agendaEvents/{eventId}`

```
{
  id: eventId,
  title: string,
  description: string,
  type: 'rapat'|'kegiatan'|'kunjungan'|'perjalanan'|'maintenance'|'deadline'|'lainnya',

  allDay: boolean,
  date: 'YYYY-MM-DD',        // local WIB calendar date — display/grouping key, same convention as assignments' own `date` field
  startAt: epochMs,          // UTC instant, derived date+startTime using the hardcoded +07:00 offset convention from reminders/schedule.js#tripStartMs — never trust container TZ
  endAt: epochMs,            // derived the same way; if end < start (spans midnight), derived exactly like js/utils.js#assignmentSpan already does for assignments
  location: string,

  scope: 'sarpras_shared' | 'kabid',   // IMMUTABLE after create — whose calendar this event primarily belongs to
  organizerUsername: string,           // IMMUTABLE after create

  // Single source of truth for "who has access" — see §1.5 for why this replaces
  // Phase A's separate pic[]/participants[] sketch.
  participants: {
    [username]: {
      isPic: boolean,                  // individual accountability marker, NOT a separate access list
      status: 'invited'|'accepted'|'declined'|'tentative',  // data-model-ready; V1 UI always shows the event regardless of status (§1.6)
      invitedBy: username,
      invitedAt: ISO8601,
    }
  },

  status: 'scheduled' | 'cancelled',   // 'archived' reserved, not exposed in V1 UI — see §1.7
  cancelledBy: username|null, cancelledAt: ISO8601|null, cancelReason: string|null,

  // Lightweight completion marker — needed ONLY to suppress the one-time overdue
  // notification once a human has acknowledged the event happened (the spec's
  // AGENDA notification #3 is explicitly conditioned on "belum marked complete/
  // done"). NOT a workflow, NOT shown as a status chip — just an idempotency gate.
  acknowledgedAt: ISO8601|null, acknowledgedBy: username|null,

  recurrence: { type: 'none'|'daily'|'weekly'|'monthly'|'custom', interval: number|null, until: 'YYYY-MM-DD'|null },  // future-compatible, unused by V1 UI (spec: "UI V1 boleh sederhana")

  reminderConfig: { enabled: boolean },  // V1 only ever produces the H-1h offset; the field exists for future per-event opt-out, not multiple offsets

  attachments: [{ storagePath, fileName, contentType, size, uploadedBy, uploadedAt }],  // empty in V1 if Storage provisioning is unresolved (§8)

  createdBy: username, createdAt: ISO8601,
  updatedBy: username, updatedAt: ISO8601,
}
```

## 1.3 `/agendaTasks/{taskId}`

```
{
  id: taskId,
  title: string, description: string,

  dueDate: 'YYYY-MM-DD'|null,
  dueTime: 'HH:MM'|null,              // absence of dueTime is meaningful — no H-1h reminder is scheduled (spec: "jika due time tersedia")
  dueAt: epochMs|null,                // derived from dueDate(+dueTime, or 23:59 WIB if dueTime is null), same +07:00 convention

  responsible: {
    [username]: { assignedBy: username, assignedAt: ISO8601 }
  },

  scope: 'sarpras_shared' | 'kabid',  // IMMUTABLE after create

  status: 'not_started'|'in_progress'|'done',
  priority: 'normal'|'penting'|'urgent',
  checklist: [{ id, label, done }],
  attachments: [{ storagePath, fileName, contentType, size, uploadedBy, uploadedAt }],
  reminderConfig: { enabled: boolean },

  createdBy: username, createdAt: ISO8601,
  updatedBy: username, updatedAt: ISO8601,
  completedAt: ISO8601|null, completedBy: username|null,
}
```

**Overdue is derived, never stored** (per the spec's own instruction): `isOverdue(task, now) = task.status !== 'done' && task.dueAt != null && now > task.dueAt`, and symmetrically for events: `isEventOverdue(event, now) = event.status === 'scheduled' && !event.acknowledgedAt && now > event.endAt`. Both are pure functions in a new `js/agenda/agenda-lifecycle.js`, consumed identically by the UI (to render an "Terlewat" badge) and by the Cloud Function reminder tick (to decide whether to fire the one-time overdue event) — one computation, never two copies that could drift, mirroring this codebase's own `js/utils.js#scheduledTimeState()` precedent for assignments.

## 1.4 `/agendaAudit/{auditId}`

```
{
  id, action: 'created'|'updated'|'status_changed'|'participant_added'|'participant_removed'|'cancelled'|'completed',
  label, color,                        // same AUDIT_LABEL/AUDIT_COLOR lookup convention as overtime-service.js/petty-cash-service.js
  note,
  user: displayLabel,                  // human-readable actor label, mirrors buildAudit()'s existing `user` field exactly
  entityType: 'agendaEvent'|'agendaTask',
  entityId,
  entityScope: 'sarpras_shared'|'kabid',   // DENORMALIZED from the entity at write time — needed because RTDB rules can't join; see §2.4
  timestamp: epochMs,
}
```
Byte-compatible in spirit with `overtime-service.js#buildAudit()`/`petty-cash-service.js#buildAudit()` (same field names: `id, action, label, color, note, user, entityType, entityId, timestamp`), plus the one addition (`entityScope`) that those two modules don't need because they have no Kabid-style split-visibility problem.

## 1.5 Why `participants` replaced Phase A's separate `pic[]` + `participants[]`

Phase A's draft had `pic: [username...]` and `participants: [{username,...}]` as two independent lists. Validating against the actual access-control requirement (§2) exposed a real risk: if PIC and participants can independently drift, a user added as PIC but never added to `participants` would have *individual accountability* (shown in the UI) but *no read access* (the Rules only consult one list) — an actual bug, not just an inconsistency. **Fix: `participants` is the single access-list; `isPic` is a per-entry boolean flag inside it.** PIC is therefore always a subset of participants by construction, not a parallel structure that can desync. `organizerUsername` stays separate (the organizer always has access, and is exactly one person, unlike PIC which can be several).

## 1.6 Invitation / participant lifecycle

`status` defaults to `'invited'` on add and is **informational only in V1** — exactly per the spec's "invitation SIMPLE" instruction: the event is immediately visible to an invited participant regardless of `status`'s value (the Rules in §2 check *membership*, never `status`). `accepted`/`declined`/`tentative` are written by the data model today (so a future RSVP UI needs zero schema change) but nothing in V1 reads or displays them yet. Removing a participant = deleting their key from the map (triggers the derived-index removal path, §3).

## 1.7 Cancellation / archive semantics

**V1 ships `cancelled` only.** `archived` is declared in the proposed `status` enum's comment but deliberately **not exposed in any V1 UI action** — there is no "Archive" button. Rationale: the spec's own DELETE/CANCEL section asks to "evaluate" cancelled/archived/soft-delete, and Cancel alone already satisfies every stated V1 requirement (historical accountability, no hard delete, stops future reminders). Adding a second terminal state with no distinct V1 behavior would be unused complexity — exactly the kind of premature structure this codebase's own house style (see the Overtime "Unit vs Department" correction) warns against. `archived` can be added as a real `status` value later with zero migration, since today's `status` field is already an open enum, not a fixed Firebase `.validate` allowlist that would need changing.

## 1.8 Lifecycles, summarized

- **Event**: `scheduled → cancelled` (terminal). Independently: `acknowledgedAt` can be set any time while `scheduled` (suppresses the overdue notification; does not change `status`).
- **Task**: `not_started → in_progress → done` (done is terminal for reminder purposes — §4). A task can move backward (`done → in_progress`) if reopened; reminders are **not** retroactively re-armed by this (see §4's "completion cancels future reminders" — once cancelled, a reminder row is never revived, matching `reminders/schedule.js#syncOffsets()`'s own "a row already fired is NOT reverted to pending" rule).
- **Participant**: `invited → {accepted|declined|tentative}`, display/data-only in V1.
- **Audit**: append-only, one row per consequential mutation (status change, participant add/remove, cancel) — never edited or deleted, matching `/logs`'s own append-only convention.

---

# 2. ACCESS / PERMISSION MODEL

## 2.1 The Kabid custom-claim decision (resolves Phase A's open question #1)

Confirmed directly from `functions/src/auth/verifyPin.js`'s `resolveRoleClaims()` (quoted in Phase A): when a user's stored `role` is a Custom Role id, the minted JWT claim is **`role: storedRole`** — i.e. `auth.token.role` carries the *exact* Custom Role id string, not a generic `'custom'` sentinel. This means Rules *can* hardcode a specific Custom Role id exactly like they already hardcode `'engineering_coordinator'`/`'engineering_member'` throughout `database.rules.json` — no Functions change is strictly required.

However, validating that against the robustness the spec asks for, I recommend the **adminEquivalent-style derived claim** instead, for one concrete reason: hardcoding the literal Custom Role id string into `database.rules.json` means renaming the role in the Role Management UI (a purely cosmetic admin action today) would silently break every Agenda rule — a footgun with no error message. The existing `adminEquivalent` claim already solves exactly this class of problem (decoupling "does this role have the capability" from "what is this role literally called"). Recommendation:

Add one more `extraClaims` branch to `verifyPin.js#resolveRoleClaims()`, parallel to the existing `adminEquivalent` derivation:
```js
// functions/src/auth/verifyPin.js — inside resolveRoleClaims(), alongside the existing adminEquivalent branch
const extraClaims = {};
if (permissions.includes('system.admin')) extraClaims.adminEquivalent = true;
if (permissions.includes('agenda.kabid.manage') || permissions.includes('agenda.kabid.view')) {
  extraClaims.agendaKabid = true;
}
return { role: storedRole, extraClaims };
```
This is a **tiny, precedented, additive** change to a file that already needs no other edit for this feature — but it **is** a Cloud Functions change requiring its own deploy, so it is listed under Deployment Impact (§12) and flagged as needing your explicit confirmation before Phase C writes it (it is not literally one of the 14 locked decisions). **Fallback if you'd rather touch zero auth code**: hardcode the Kabid Custom Role's exact id as a Rules literal (Plan B, documented inline in §2.3) — works today with zero Functions changes, at the cost of the rename-footgun above.

All rules below are written assuming the `agendaKabid` claim (Plan A); the Plan-B substitution is a single mechanical find-replace (`auth.token.agendaKabid === true` → `auth.token.role === 'kabid_sarana_prasarana'` or whatever literal id is chosen) if you prefer Plan B.

## 2.2 The access matrix (Cases 1–10)

| Case | Requirement | Satisfied by |
|---|---|---|
| 1 | Sarpras user reads shared events/tasks | `scope==='sarpras_shared'` branch of `.read`, keyed on `role==='admin'\|\|adminEquivalent` |
| 2 | Sarpras user creates/manages shared events/tasks | `scope==='sarpras_shared'` branch of `.write`, same predicate |
| 3 | Kabid reads/manages own scope | `scope==='kabid'` branches of `.read`/`.write`, keyed on `agendaKabid===true` |
| 4 | Kabid-private event NOT readable by ordinary admin unless participant | the `sarpras_shared` bypass branch is **scope-conditioned** — it only ever matches when `data.child('scope').val()==='sarpras_shared'`, so it never fires for a `kabid`-scope record |
| 5 | Admin ≠ automatic Kabid access | same mechanism as Case 4 — there is **no unconditional admin branch anywhere** in the Agenda rules, unlike every pre-existing admin-tier rule in this codebase |
| 6 | Sarpras can invite Kabid | inviting = writing a new key into `participants`, authorized by the ordinary `scope==='sarpras_shared'` write-bypass (organizer/PIC editing their own event) — no special "invite" permission needed |
| 7 | Kabid can invite Sarpras | same mechanism, via the `scope==='kabid'` write-bypass |
| 8 | Invited participant can read that event | `data.child('participants').child(auth.uid).exists()` branch — independent of scope, independent of role |
| 9 | Participant can't read unrelated events from the same organizer | the participant branch is evaluated **per record** — membership in event A's `participants` map implies nothing about event B; RTDB has no row-level leakage between sibling keys |
| 10 | Unauthorized user can't mutate | fails every `.write` OR-branch: not organizer, not a participant, and their role/claim doesn't match the record's own `scope` |

## 2.3 Firebase Rules — `agendaEvents` (new `database.rules.json` block, Plan A)

```json
"agendaEvents": {
  "$eventId": {
    ".read": "auth != null && (
      data.child('participants').child(auth.uid).exists() ||
      data.child('organizerUsername').val() === auth.uid ||
      (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
      (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true)
    )",
    ".write": "auth != null && newData.exists() && (
      (!data.exists() &&
        newData.child('createdBy').val() === auth.uid &&
        newData.child('organizerUsername').val() === auth.uid &&
        ((newData.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (newData.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      ) ||
      (data.exists() &&
        newData.child('organizerUsername').val() === data.child('organizerUsername').val() &&
        newData.child('scope').val() === data.child('scope').val() &&
        (data.child('organizerUsername').val() === auth.uid ||
         data.child('participants').child(auth.uid).exists() ||
         (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      )
    )",
    ".validate": "newData.hasChildren(['id','title','scope','organizerUsername','status','createdBy','createdAt']) && newData.child('id').val() === $eventId && (newData.child('scope').val() === 'sarpras_shared' || newData.child('scope').val() === 'kabid')"
  }
}
```
Notes:
- `newData.exists()` at the top level forbids hard delete entirely (the spec's own "don't hard-delete" instruction, enforced structurally, not just by convention) — cancellation is a field write (`status:'cancelled'`), never a removal.
- `organizerUsername` and `scope` are asserted immutable on every update branch — prevents "scope laundering" (an organizer quietly moving their own event from `kabid` into `sarpras_shared` to broaden its audience, or vice versa, without a fresh create).
- A participant (not organizer, not scope-privileged) **can still write** the record today under this rule (the `participants.child(auth.uid).exists()` branch has no further restriction) — meaning any invited participant can edit title/time/location, not just read. This matches "Participant hanya mendapatkan access terhadap event yang mengikutsertakan dirinya" (access, not "read-only access") but is worth a deliberate yes/no from you: if participants should be **read-only** unless they're also PIC, change that branch to `data.child('participants').child(auth.uid).child('isPic').val() === true`. I've left it as read+write-if-participant in this draft because the spec's PIC/participant distinction reads as an accountability label, not an access-tier split — flag if you disagree.

## 2.4 Firebase Rules — `agendaTasks`

```json
"agendaTasks": {
  "$taskId": {
    ".read": "auth != null && (
      data.child('responsible').child(auth.uid).exists() ||
      data.child('createdBy').val() === auth.uid ||
      (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
      (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true)
    )",
    ".write": "auth != null && newData.exists() && (
      (!data.exists() &&
        newData.child('createdBy').val() === auth.uid &&
        ((newData.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (newData.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      ) ||
      (data.exists() &&
        newData.child('scope').val() === data.child('scope').val() &&
        (data.child('createdBy').val() === auth.uid ||
         data.child('responsible').child(auth.uid).exists() ||
         (data.child('scope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
         (data.child('scope').val() === 'kabid' && auth.token.agendaKabid === true))
      )
    )",
    ".validate": "newData.hasChildren(['id','title','scope','status','priority','createdBy','createdAt']) && newData.child('id').val() === $taskId"
  }
}
```
Same shape as events, `responsible` playing the role `participants` plays for events. "Satu task TIDAK otomatis selesai hanya karena satu PIC menandainya selesai" (the spec's explicit multi-PIC-completion rule) is **application-layer logic**, not a Rules concern — any one `responsible` member can write `status`, but the UI's "Tandai Selesai" action is gated by a permission check (only the task's creator or — per your call — a designated "authorized" responsible member triggers the actual completion write), which Rules cannot express (RTDB has no concept of "this specific field may only be set by user X among several valid writers"). Flagging this explicitly: **Rules enforce who may write the record; the "who may mark done" nuance is UI/application logic**, same division of labor the spec's own "Approval already happens on paper" note implies for Overtime.

## 2.5 Firebase Rules — `agendaAudit`

```json
"agendaAudit": {
  "$auditId": {
    ".read": "auth != null && (
      (data.child('entityScope').val() === 'sarpras_shared' && (auth.token.role === 'admin' || auth.token.adminEquivalent === true)) ||
      (data.child('entityScope').val() === 'kabid' && auth.token.agendaKabid === true)
    )",
    ".write": "auth != null && !data.exists() && newData.hasChildren(['id','action','entityType','entityId','entityScope','user','timestamp']) && (newData.child('entityScope').val() === 'sarpras_shared' || newData.child('entityScope').val() === 'kabid')"
  }
}
```
Append-only (`!data.exists()`), mirroring `/logs`'s `"$logId": { ".write": "auth != null && !data.exists()" }` exactly — the write itself is authorized implicitly by the fact that the corresponding `agendaEvents`/`agendaTasks` write already had to pass its own Rule in the same client operation; this rule only prevents tampering with history (no edits, no deletes), not re-deriving who-may-act.

## 2.6 One deliberate, explicit exception: the derived-index nodes get **no** admin bypass at all

See §3.3 — `agendaEventsByUser/{username}` is `auth.uid === $username`-only and `agendaEventsByScope/kabid` is `agendaKabid===true`-only, with **no** `role==='admin'` branch in either. This is stricter than every other rule in this file (even the Case-4/5-compliant rules above still let admin read *sarpras_shared*-scope events, which is correct — Sarpras IS admin's own scope). The index nodes would otherwise leak "which event ids exist in Kabid's calendar" to admin even without granting the event content itself — a real, if narrow, privacy leak the spec's wording ("tidak otomatis mendapatkan seluruh Kabid calendar data") reads as forbidding. **Caveat for clarity, not a gap**: this governs client-SDK access only; a human with Firebase Console / Admin-SDK access (you) always sees raw data regardless of Rules, exactly as with every other node in this database — Rules constrain the *app*, not console administration.

---

# 3. DERIVED INDEX

## 3.1 Shape (refined from Phase A)

```
/agendaEventsByUser/{username}/{eventId} = startAt (epochMs)     // NOT a bare `true` — see rationale below
/agendaEventsByScope/sarpras_shared/{eventId} = startAt (epochMs)
/agendaEventsByScope/kabid/{eventId} = startAt (epochMs)
/agendaTasksByUser/{username}/{taskId} = dueAt (epochMs) | 0      // 0 for a task with no due date, so it still sorts/exists
/agendaTasksByScope/{sarpras_shared|kabid}/{taskId} = dueAt (epochMs) | 0
```
**Refinement over Phase A's `{eventId}: true` sketch**: storing the timestamp as the index *value* (instead of a bare boolean) lets the PDF export feature range-query directly — `ref('agendaEventsByScope/sarpras_shared').orderByValue().startAt(rangeStartMs).endAt(rangeEndMs)` — without fetching every record first just to learn its date. `.indexOn: ".value"` is added to both index nodes to make that ordering efficient. This is the same reasoning `reminders/schedule.js` already applied (`fireAt` as the row's sortable value, `.indexOn:["fireAt"]`) — reused here, not invented.

## 3.2 Trigger — `functions/src/agenda/onAgendaEventIndexSync.js` (new)

`onValueWritten({ ref: '/agendaEvents/{eventId}', region: REGION, instance: DB_INSTANCE })`, mirroring `onAssignmentReminderSync.js`'s own justification for a second, focused trigger on a node that already has other triggers ("Two triggers on one node is an established additive pattern").

Algorithm (idempotent, safe to replay):
1. `before`/`after` = the two snapshots.
2. If `after` is null (should never happen — Rules forbid delete — defensive only): remove every index entry this event could have had, using `before`'s own data to know where to look.
3. Compute `visibleSetAfter(after)`: `{after.organizerUsername} ∪ keys(after.participants)`, plus `visibleScopesAfter = {after.scope} ∪ classify(user) for each user in visibleSetAfter` where `classify(username)` reads `/userProfiles/{username}.role`, and if that role is itself a Custom Role id (not `'admin'`), looks up `/customRoles/{role}.permissions` for `agenda.kabid.view` to decide `'kabid'` — the exact same two-step resolution `permission-service.js` already does client-side, just re-implemented server-side with the Admin SDK (which bypasses rules, so this read is always available to the trigger).
4. Compute `visibleSetBefore`/`visibleScopesBefore` identically from `before` (empty sets if this is a create).
5. Diff: for every username in `visibleSetAfter \ visibleSetBefore`, `update()` sets `agendaEventsByUser/{username}/{eventId} = after.startAt`; for every username in `visibleSetBefore \ visibleSetAfter` (participant removed), the same `update()` call sets that path to `null` (removal). Same diff-and-patch for the two scope buckets.
6. If `after.startAt !== before.startAt` (event rescheduled) but the visible sets didn't change, still patch every existing index entry's *value* to the new `startAt` (so the `.orderByValue()` range-query in §3.1 never goes stale) — one more diff branch, same `update()` call.
7. All of steps 5–6 collapse into **one** multi-path `db.ref().update({...})` call — atomic from the index's perspective, mirroring `syncOffsets()`'s own single-purpose-per-entity-write style.

**Status changes (cancel) do NOT touch the index** — a cancelled event stays visible to everyone who could already see it (historical accountability, per the spec's own "Past events harus tetap accessible" instruction); only participant-set or start-time changes ever mutate index membership.

## 3.3 Rules for the index nodes

```json
"agendaEventsByUser": {
  ".write": "false",
  "$username": { ".read": "auth.uid === $username", ".indexOn": ".value" }
},
"agendaEventsByScope": {
  ".write": "false",
  "sarpras_shared": { ".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true", ".indexOn": ".value" },
  "kabid":          { ".read": "auth.token.agendaKabid === true", ".indexOn": ".value" }
}
```
(`agendaTasksByUser`/`agendaTasksByScope` identical shape.) `.write: false` at the parent — **only** the Admin-SDK trigger ever writes these, exactly the `/userProfiles` (`.write:false`, `onUserWrite` the sole writer) and `/reminders` (`.write:false`, the tick/sync the sole writers) precedent.

## 3.4 Rebuild strategy (the spec's explicit requirement)

A new, idempotent, manually-invoked script `scripts/agenda-index-rebuild.mjs` (Admin SDK, same house convention as every other `scripts/*.mjs`): reads the entirety of `/agendaEvents` and `/agendaTasks`, recomputes both index trees from scratch using the **exact same** `classify()`/diff logic the trigger uses (imported from a shared, pure helper module so the two can never drift — `functions/src/agenda/indexLogic.js`), and replaces each index node wholesale via one `.set()`. Safe to run at any time, including against a live database (it only ever overwrites derived data, never canonical records). This is the direct answer to "the index MUST be rebuildable."

## 3.5 Stale-index behavior — by construction, never a security problem

The index is consulted **only** by the client to decide *which ids to fetch*; it is never consulted by a Rule. A stale or even maliciously-corrupted index entry can at worst cause a **UX** gap (a user briefly doesn't see a new event until the trigger catches up — sub-second in practice) or a harmless **dangling reference** (the client asks to read an id the index still lists, the per-record Rule still independently re-evaluates against the real record, and denies/allows exactly as if the index didn't exist). **The canonical record's own Rule is always re-evaluated on every read regardless of how the client learned the id** — so the index can never grant access it shouldn't; it can only, in the worst case, fail to surface access the record would otherwise grant. This directly satisfies "index must not become source of truth."

---

# 4. REMINDER ENGINE INTEGRATION

## 4.1 Feasibility of extending `reminderTick` (Decision #8's "unless proven unsafe" test)

`functions/src/reminders/*` is **not dormant** — `REMINDER_FLAGS.enabled/channels.*` are all `true` in the current `functions/src/config/constants.js`; this is a live, actively-firing production system for assignment reminders today. Extension must therefore be **strictly additive** to avoid regressing a real, running feature. Verified additive path exists:

- `schedule.js`'s row shape (`{id, assignmentId, offset, fireAt, status, firedAt, eventId, updatedAt}`) gets two **new, optional** fields — `entityType: 'assignment'|'agendaEvent'|'agendaTask'` and `entityId` — populated only on new Agenda rows. Existing assignment rows are untouched (no migration, `assignmentId` keeps meaning exactly what it always has). `reminderId()` for new rows becomes `keySafe(`${entityType}:${entityId}__${offset}`)`; legacy rows keep their existing `keySafe(`${assignmentId}__${offset}`)` format — both co-exist in the same flat node, distinguished by whether `entityType` is present.
- `OFFSETS`/`OFFSET_MS` become per-entity-type: assignments keep `['H-1d','H-1h']`; Agenda rows only ever get `['H-1h','overdue']` — note **`overdue` is a genuinely new offset concept** (fires *after* the instant, not before) that assignments' reminders don't need. `OFFSET_MS['overdue']` is conceptually `0` (fires exactly at/after the due instant, the tick's 5-minute granularity providing the natural "a few minutes after" slack the spec doesn't otherwise specify).
- `tick.js`'s per-row re-validation branches on `row.entityType`: absent → today's exact assignment logic, unchanged; `'agendaEvent'`/`'agendaTask'` → reads `/agendaEvents/{id}` or `/agendaTasks/{id}`, checks `status==='cancelled'` (events) / `status==='done'` (tasks) / `acknowledgedAt` (events, for the overdue offset specifically) the same way the assignment branch checks `status==='cancelled'||'completed'`.
- A **new, separate** sync trigger (`onAgendaEventReminderSync.js`/`onAgendaTaskReminderSync.js`, one each) maintains these rows on `/agendaEvents/{id}` / `/agendaTasks/{id}` writes — kept separate from `onAgendaEventIndexSync.js` (§3.2), exactly mirroring how assignments already splits "events" (`onAssignmentWrite`) from "timer queue" (`onAssignmentReminderSync`) into two distinct triggers on one node.

**Verdict: extension is safe**, provided (a) every existing assignment-path branch in `tick.js`/`schedule.js` is left byte-for-byte unchanged (only new `if (row.entityType)` branches added, never edited-in-place), and (b) the existing reminder regression suite (if one exists under `scripts/`) is re-run green before this ships, as its own explicit gate (Risk R9, §13).

## 4.2 The three required notifications per entity, mapped to mechanism

| Moment | Mechanism | New? |
|---|---|---|
| Creation notification | An ordinary event emitted the instant the record is created (by `onAgendaEventWrite.js`/`onAgendaTaskWrite.js`, a **third** small trigger — or folded into the index-sync trigger, since "mint the created event" and "sync the index" both fire off the exact same `!before && after` transition and cost nothing extra to combine) | Not reminder-tick at all — no scheduling involved |
| H-1 hour reminder | A `/reminders` row, offset `H-1h`, fired by the extended `reminderTick` sweep | Extension of existing mechanism |
| Overdue (once) | A `/reminders` row, offset `overdue`, fired by the same extended sweep, re-validated against `status`/`acknowledgedAt`/`completedAt` at fire time | Extension of existing mechanism |

## 4.3 Idempotency / no duplicates on reload / reconnect / multi-tab

**Inherited for free, not re-derived.** Time-based notifications (`H-1h`, `overdue`) are *exclusively* server-minted — no client code ever creates a `/reminders` row or calls `writeEventWithId` for these; a browser reload/reconnect/second tab changes nothing about the server's 5-minute sweep. The deterministic event id (`agenda__${entityType}__${entityId}__${offset}`) plus `writeEventWithId`'s `onValueCreated`-is-a-no-op-on-existing-id semantics (already proven in production for `reminder__${assignmentId}__${offset}`) makes re-emission structurally impossible to duplicate. The one client-triggered notification — "creation" — is minted by a **server trigger** reacting to the RTDB write transition itself (not by the client directly calling a notify function), so N browser tabs all submitting "create" UI doesn't multiply anything either: only one `/agendaEvents/{id}` row is ever created (the client write itself is a single `set()` to a single new key), so the trigger fires exactly once regardless of how many tabs are open.

## 4.4 Completion / cancellation cancels future reminders

Handled by the new `onAgendaEventReminderSync`/`onAgendaTaskReminderSync` triggers' own tombstone branch — on `status→'cancelled'` (events) or `status→'done'` (tasks), tombstone every non-fired row for that entity, exactly mirroring `tombstoneOffsets()`'s existing behavior for assignment cancel/complete/start. A row already `fired` stays `fired` (never reverted), same existing invariant.

## 4.5 Schedule — Asia/Jakarta, server-authoritative

No new scheduler. Either `reminderTick`'s existing `{ schedule: 'every 5 minutes', timeZone: 'Asia/Jakarta', region: REGION }` definition is literally reused (the function just also sweeps Agenda rows now), or — if you'd rather keep blast radius even smaller and not touch the function that's live for assignments at all — a **second**, near-identical `onSchedule` (`agendaReminderTick`) with the same cadence/timezone/region, reading only Agenda rows. Decision #8 says "do not create a second scheduler unless proven unsafe" and §4.1 found extension *is* safe, so **the recommendation is to extend the one tick**, not add a second — but the second-tick fallback costs nothing extra to keep in reserve if code review in Phase C finds the combined function growing unwieldy.

---

# 5. NOTIFICATION EVENT MODEL

## 5.1 `EVENT_TYPES` additions — deliberately minimal

Per the Phase B brief's own "do not add unnecessary event types": only the **6** types corresponding to the 3 notifiable moments × 2 entity types are added to `functions/src/events/schema.js`:
```js
'agenda.created', 'agenda.reminder', 'agenda.overdue',
'task.created',   'task.reminder',   'task.overdue',
```
`ENTITY_KINDS` gains `'agendaEvent'`, `'agendaTask'`.

**Deliberately NOT added to `/events` at all**: `agenda.updated`, `agenda.cancelled`, `task.updated`, `task.completed`. Reasoning, validated against actual precedent: Overtime and Petty Cash — the two existing modules with the closest shape to this one — **never** ride `/events` for routine field edits; they record those in their own `*Audit` node only (§1.4/§2.5). The platform's `/events` outbox is reserved for things that are either (a) genuinely cross-module/notifiable, or (b) part of the assignment/request/engineering lifecycles it already governs. Routine Agenda edits and task completion are neither — they're fully captured by `agendaAudit`, with zero loss of information, and zero risk of inventing a notification nobody asked for. If a future release wants "notify participants when an event is cancelled," that's a one-line registry addition later (exactly as easy as today), not a gap now.

## 5.2 `notifications/registry.js` additions

```js
'agenda.created':  { channels: [IN_APP, PUSH], template: 'agenda.created' },
'agenda.reminder': { channels: [IN_APP, PUSH], template: 'agenda.reminder' },
'agenda.overdue':  { channels: [IN_APP, PUSH], template: 'agenda.overdue' },
'task.created':    { channels: [IN_APP, PUSH], template: 'task.created' },
'task.reminder':   { channels: [IN_APP, PUSH], template: 'task.reminder' },
'task.overdue':    { channels: [IN_APP, PUSH], template: 'task.overdue' },
```
**PUSH included, Telegram omitted.** The spec says external channels aren't needed "kecuali architecture existing sudah memiliki sistem yang dapat dipakai tanpa menambah complexity besar" — Web Push is exactly that system (already live, already deployed, a registry entry is the entire marginal cost, per `NOTIFICATION_FLAGS.channels.push: true` already being on). Telegram is deliberately left out — it would need new per-type message templates in a channel the spec didn't ask for. **If you'd rather V1 be IN_APP-only, delete `PUSH` from these six lines — nothing else changes.**

## 5.3 Recipient resolution — the one place this module *must* deviate from every existing case

```js
// functions/src/notifications/recipients.js additions
case 'agenda.created': {
  Object.keys(p.participants || {}).forEach(u => add(byUsername(users, u), { excludeActor: true }));
  break;
}
case 'agenda.reminder':
case 'agenda.overdue': {
  // System-originated — no actor to exclude.
  add(byUsername(users, p.organizerUsername));
  Object.keys(p.participants || {}).forEach(u => add(byUsername(users, u)));
  break;
}
case 'task.created': {
  Object.keys(p.responsible || {}).forEach(u => add(byUsername(users, u), { excludeActor: true }));
  break;
}
case 'task.reminder':
case 'task.overdue': {
  Object.keys(p.responsible || {}).forEach(u => add(byUsername(users, u)));
  break;
}
```
**Every other case in this file calls `admins(users).forEach(a => add(a))` somewhere** (fleet oversight, approval visibility, etc.) — the Agenda cases above **must not**. Blanket-ccing all admins on an `agenda.reminder`/`agenda.overdue` event would notify every Sarpras admin of a Kabid-scope event's existence through the notification bell even when they're not a participant — a direct violation of Case 5, arrived at through the *notification* path rather than the *read* path, which the Rules in §2 alone can't prevent (notifications are server-minted via the Admin SDK, which bypasses Rules by design). **This is the one place in the whole feature where a copy-paste-from-an-existing-case mistake would silently reopen the exact leak Rules were written to close** — flagged as the top implementation-review item for Phase C.

---

# 6. PDF ARCHITECTURE

## 6.1 Resolving the apparent contradiction: "PIC visible in-app" vs. "preview must match PDF"

Phase A's `nor-paper.js` precedent guarantees the **export preview** and the generated PDF are pixel/content-identical by construction (one view-model, two renderers). This does **not** conflict with individual PIC names staying visible in the **ordinary in-app Agenda/To-do list** — those are two different screens with two different data paths. The ordinary Agenda list renders straight from `/agendaEvents`/`/agendaTasks` records (real usernames, resolved to real display names via `/userProfiles`). The **Export Preview** screen (opened from `[Preview]` in the export dialog) exists *specifically* to show "what the official document will look like" — so it is correct, not contradictory, for that screen to already show `SARPRAS` exactly as the PDF will. There is no third "identity" to reconcile.

## 6.2 `buildAgendaViewModel(events, tasks, dateRange, filters)`

```
1. Filter events/tasks to dateRange ∩ filters.include{agenda,todo} ∩ filters.status.
2. Sort chronologically (events by startAt, tasks by dueAt, nulls last).
3. For each record, resolve display identities via /userProfiles, THEN apply the transform:
     - organizationalResponsible → always the literal string 'SARPRAS' (never conditional, never derived from who actually organized it)
     - internal (Sarpras-shared-scope) participants → collapsed to a generic label ('Tim Sarpras'), per the spec's own
       "Peserta: Tim Sarpras / Kabid Sarpras" example — individual names are NEVER placed in the returned object
     - Kabid-scope participants → collapsed to 'Kabid Sarpras' the same way
     - external/non-Sarpras participants (anyone whose role resolves to neither 'admin' nor the Kabid claim —
       e.g. "Sekjen", an outside guest) → kept verbatim (name/title as recorded), per the spec's explicit carve-out
     - individual usernames/displayNames for Sarpras/Kabid people are DROPPED during this step, not merely unused —
       they never enter the returned object at all.
4. Return { title, org: 'SARANA DAN PRASARANA', period, generatedAt, sections: [{date, items:[...]}], attachmentCounts }.
```
**Why dropping beats relabeling**: if the transform only *relabeled* a field the template happened to read, a future template edit that reads a different field (e.g. `organizerDisplayName` instead of `organizerLabel`) could silently reintroduce Evan/Leo/Grace into an official document. Because the individual identity **never exists** in the object `buildAgendaViewModel()` returns, no downstream consumer — template, preview renderer, or a future one nobody's written yet — can leak it by accident. This is the direct, structural answer to the spec's "CRITICAL" identity requirement.

## 6.3 Template + preview

`js/docs/templates/agenda.js` (new, registered as `'agenda'`) using `doc-theme.js`'s `docHeader`/`docFooter`/`tableLayout`/`orgLogo` exactly as `nor.js` does; header reproduces the spec's own example layout ("AGENDA & KEGIATAN / SARANA DAN PRASARANA", period line, generated timestamp). Body = one section per day (agenda items) + one table (to-do items, if included), `Lampiran: N file` per record (count only, from `attachments.length` — never embedded content, per the spec's explicit instruction). `js/agenda/agenda-paper.js` (new) is a pure HTML string builder consuming the **identical** view-model, following `nor-paper.js`'s contract verbatim — screen and PDF cannot drift by construction.

---

# 7. EXPORT DATE-RANGE RESOLVER

`js/agenda/agenda-date-range.js` (new, pure, zero Firebase — unit-testable the pure-Node way):

```js
resolveDateRangePreset(presetKey, anchorDateStr = todayString()) → { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }  // inclusive
```

| Preset | Boundary semantics |
|---|---|
| `minggu_ini` | Monday–Sunday of the ISO week containing the anchor (firstDayOfWeek=1, matching `pbsi-datepicker.js`'s existing convention — not a new convention) |
| `minggu_depan` | The following Monday–Sunday |
| `1_minggu` | Rolling: `anchor .. offsetDate(anchor, 6)` |
| `bulan_ini` | 1st–last day of the anchor's calendar month |
| `bulan_depan` | 1st–last day of the following calendar month |
| `1_bulan` | Rolling: `anchor .. (anchor + 1 month − 1 day)`, **with explicit day-overflow clamping** (see Risk, §13 R10) — never delegate to naive `new Date(y, m+1, d)` arithmetic, which silently rolls Jan 31 into March |
| `custom` | Literal `{start, end}` from the two date inputs; UI validates `end >= start` before enabling Export |

All built from `js/utils.js`'s existing `parseLocalDate`/`offsetDate`/`todayString` — no new date library, no timezone conversion (this app has none anywhere, per Phase A §9, and Agenda introduces none either — dates stay in the same implicit-WIB-local convention as every other module).

---

# 8. ATTACHMENT DECISION

**ARCHITECTURE READY. NOT RELEASE BLOCKING for v1.31.0.0.** Per Decision #10. Concretely:

- The data model (`attachments: [...]` on both event and task schemas, §1) ships in v1.31.0.0 regardless — zero migration cost either way.
- The upload/download code (reusing `js/firebase.js`'s `uploadFileToStorage*`/`downloadFileFromStorage`/`deleteFileFromStorage`, and the `getBytes()`-never-`getDownloadURL()` pattern from `js/gudang/ui/gudang-item-image.js`) is written and unit-tested against the **emulator** in Phase C regardless.
- A new `storage.rules` block (`match /agenda/attachments/{entityId}/{fileName} { allow read, write: if request.auth != null && (request.auth.token.role == 'admin' || request.auth.token.adminEquivalent == true || request.auth.token.agendaKabid == true); }`) is drafted but **not deployed** until the production bucket's existence is confirmed (Phase A R1).
- **Gate**: before the attachment *UI control* (the upload button) is enabled in production, a one-time manual verification step — an actual small upload attempt against the real production bucket via the Firebase Console or a disposable authenticated script — confirms the bucket is live and CORS is applied. If it isn't, v1.31.0.0 ships with the `attachments` field present-but-always-empty (no UI to populate it) and Attachments becomes a v1.31.1 fast-follow with **zero further schema change** — just flipping the UI control on once Storage is confirmed.

---

# 9. MOBILE ARCHITECTURE

Validated against 390px/430px using the already-proven primitives from Phase A §10/§11 — no new breakpoint class needed.

- **Create/edit drawer**: `js/components/drawer.js#openDrawer()` already becomes a full bottom sheet at `≤640px` (both 390/430 qualify) — reused as-is.
- **Participant/PIC picker**: genuinely new (Phase A §11 R6). Designed as a **second-level sheet**, not an inline section of the main form — tapping a "Peserta" row in the event drawer opens a dedicated full-height picker (search-to-filter input + checkbox-per-person list, "Pilih Semua"/"Kosongkan" bulk actions, borrowing the exact visual idiom already proven in Overtime's employee-rekap grid and Petty Cash's transaction multi-select) — avoids cramming a long checklist into an already-busy create form on a 390px screen. Selected participants render back in the main drawer as a compact chip row (new, small — `chip`/`chipRow` already exist as shared primitives in `js/widgets/_widget-base.js`, reusable here even though that module is workspace-specific — or a 3-line local equivalent if importing across that boundary is undesirable).
- **Date/time fields**: `js/pbsi-datepicker.js`, full-width, native `<input type="date">` fallback underneath — already proven responsive.
- **Agenda (list) view**: trivially mobile — a vertical list, no grid, no new work.
- **Calendar (week/month) view**: the one real mobile design risk (Phase A R11 carries forward unchanged) — a literal month grid does not fit 390px at readable cell size. Recommended pattern (not yet built, flagged for Phase C design time): month view renders compact day cells bearing only a dot/count badge on narrow viewports; tapping a day opens that day's items in the same Agenda-list renderer, rather than attempting inline event text inside a shrunk grid cell. Week view can stay a true grid down to ~390px (7 narrow columns of mostly-empty-or-one-dot cells render acceptably; this is the same density Overtime's heatmap already proves works at this width).
- **Export dialog**: an ordinary form inside the same drawer pattern — no new mobile work beyond the date-range preset `<select>` + custom-range two-date-inputs, both native controls.

---

# 10. EMULATOR SECURITY TEST MATRIX

Run against `@firebase/rules-unit-testing` (already a devDependency) + the existing `npm run test:rtdb-emulator` harness. Identities × record types × expected outcome:

| Identity | Shared event (`sarpras_shared`, not a participant) | Kabid event (`kabid`, not a participant) | Cross-scope event (participant, either scope) | Shared task | Kabid task | Attachment metadata (follows parent) |
|---|---|---|---|---|---|---|
| Sarpras admin (Evan/Leo/Grace equivalent) | READ ✓ / WRITE ✓ | READ ✗ / WRITE ✗ | READ ✓ / WRITE ✓ (as participant) | READ ✓ / WRITE ✓ | READ ✗ / WRITE ✗ | follows event/task result |
| Kabid (agendaKabid claim) | READ ✗ / WRITE ✗ | READ ✓ / WRITE ✓ | READ ✓ / WRITE ✓ (as participant) | READ ✗ / WRITE ✗ | READ ✓ / WRITE ✓ | follows event/task result |
| Participant who is neither admin nor Kabid (e.g. an `engineering_member` invited to a shared meeting) | READ ✗ (unless invited) | READ ✗ (unless invited) | READ ✓ (participant branch only) / WRITE ✓ | same pattern | same pattern | follows event/task result |
| Non-participant, unrelated role (`driver`, `bidang`, `viewer`) | READ ✗ / WRITE ✗ | READ ✗ / WRITE ✗ | READ ✗ / WRITE ✗ | READ ✗ / WRITE ✗ | READ ✗ / WRITE ✗ | READ ✗ |
| Unauthenticated | READ ✗ / WRITE ✗ (all) | — | — | — | — | — |

Plus explicit, individually-named test cases matching the spec's own §TEST REQUIREMENTS and the 10 Cases in §2.2: shared-scope visibility across 3 distinct Sarpras identities; Kabid isolation (a Kabid-only event genuinely invisible to a non-invited admin, asserted via `get()` throwing `PERMISSION_DENIED`, not merely "returns nothing"); cross-invitation both directions (Case 6/7); hard-delete attempt always rejected (asserts the `newData.exists()` guard); immutable-field tamper attempts (`scope`/`organizerUsername` changed mid-update) always rejected; index nodes unreadable by admin for the `kabid` bucket specifically (the one rule in this whole feature stricter than the house norm — deserves its own named test so a future "helpfully widen this rule" PR gets caught); derived-index rebuild script produces byte-identical output to the live trigger's incremental result on a synthetic dataset (proves §3.4's rebuildability claim, not just asserts it).

---

# 11. DEPLOYMENT IMPACT

| Surface | Changes | Deploy command | Needed for |
|---|---|---|---|
| **Hosting only** | All new `js/agenda/*`, `agenda.css`, Today integration, drawers/pickers, PDF templates, date-range resolver | `firebase deploy --only hosting` (+ routine `git push` for Vercel) | Core UI — no approval beyond the routine release process |
| **RTDB Rules** | `agendaEvents`, `agendaTasks`, `agendaAudit`, `agendaEventsByUser`, `agendaEventsByScope`, `agendaTasksByUser`, `agendaTasksByScope` (7 new top-level blocks) | `firebase deploy --only database` | The entire feature — nothing functions in production without this |
| **Cloud Functions** | `onAgendaEventIndexSync`, `onAgendaTaskIndexSync` (index + creation-event minting), `onAgendaEventReminderSync`, `onAgendaTaskReminderSync` (timer-queue maintenance), `reminders/schedule.js`/`tick.js` additive extension, `functions/src/events/schema.js`/`notifications/registry.js`/`notifications/recipients.js` additions (all in one deploy unit), **and, if Plan A (§2.1) is confirmed**, one new branch in `functions/src/auth/verifyPin.js#resolveRoleClaims()` | `firebase deploy --only functions` | H-1h/overdue reminders, creation notifications, and (Plan A only) the `agendaKabid` claim itself |
| **Storage Rules** | New `match /agenda/attachments/...` block | `firebase deploy --only storage` | Attachments only — deferred per §8 |

**None of the above is executed by this report.** Per the spec's own Production Safety section, all RTDB-Rules- and Functions-touching work is built and proven against the **RTDB + Functions emulators** (`npm run test:rtdb-emulator` / `test:functions-emulator`, both already wired) through the whole of Phase C; the table above exists so the *scope* of the eventual production deploy is known in advance, not so it can be executed now.

---

# 12. REMAINING RISKS (Phase B-specific, additive to Phase A's R1–R7)

- **R8 — the `agendaKabid` claim (§2.1 Plan A) is a `verifyPin.js` change, i.e. a Functions deploy, and is not itself one of the 14 locked decisions.** Needs your explicit yes/no before Phase C writes it; Plan B (a hardcoded Custom Role id literal) is ready as a zero-Functions-change fallback if you'd rather not touch `verifyPin.js` at all this release.
- **R9 — extending the live, already-firing `reminders/schedule.js`/`tick.js` carries real regression risk for assignment reminders if done carelessly.** Mitigation: every new branch is strictly additive (new `if (row.entityType)` checks only; zero lines of the existing assignment path are edited in place), and whatever existing reminder regression coverage exists under `scripts/` is re-run green as its own explicit gate before this ships — not assumed safe because "it's additive."
- **R10 — month-arithmetic day-overflow** (the `bulan_depan`/`1_bulan` presets) is a well-known bug class (naive `new Date(y, m+1, d)` silently rolls Jan 31 → Mar 3). The resolver must clamp explicitly; its unit test must include Jan 31, a leap-Feb 29 anchor, and a non-leap-Feb 29 anchor.
- **R11 — the Calendar month/week grid on ≤430px remains the single highest-uncertainty UI surface in this feature**, with zero local precedent to copy (carried forward from Phase A R6/R11 — restated here because Phase B's own mobile validation (§9) confirms it's still unresolved, not newly discovered).
- **R12 — the recipient-resolution deviation in §5.3 (no blanket admin cc) is easy to regress** the first time someone extends `recipients.js` for a seventh Agenda-adjacent type by copy-pasting a nearby `case` block that *does* cc admins. Recommend a code comment directly above the Agenda cases in `recipients.js` calling this out explicitly (mirroring how the file already comments its other non-obvious asymmetries), and a named emulator/unit test asserting a non-participant admin is absent from `resolveRecipients()`'s output for a `kabid`-scope event.
- **R13 — the "participant can write, not just read" choice in §2.3's closing note** is a real design fork I made a default call on rather than leaving fully open; please confirm or redirect before Phase C implements it, since it's materially different from "PIC can edit, plain participants can only read."

---

# 13. EXACT IMPLEMENTATION PHASES (Phase C plan — naming and sequencing only, nothing started)

1. **C1 — Data + Rules foundation.** `agendaEvents`/`agendaTasks`/`agendaAudit` + the two derived-index node families in `database.rules.json`; `js/agenda/agenda-lifecycle.js` (pure overdue/derivation helpers). Emulator test matrix (§10) green. No UI, no Functions yet.
2. **C2 — Cloud Functions.** `onAgendaEventIndexSync`/`onAgendaTaskIndexSync`, `onAgendaEventReminderSync`/`onAgendaTaskReminderSync`, the `reminders/schedule.js`/`tick.js` extension, `events/schema.js`/`notifications/registry.js`/`notifications/recipients.js` additions, and — pending your R8 confirmation — the `verifyPin.js` `agendaKabid` branch. Functions-emulator green; existing reminder/notification regression suites re-run green (R9's gate).
3. **C3 — Today integration + core UI.** `#v2AgendaWorkspace` sibling host (empty state first), Agenda list / Calendar / To-do views, create/edit drawers, the new participant/PIC picker, mobile pass at 390/430px (§9).
4. **C4 — PDF.** `buildAgendaViewModel()`, `js/docs/templates/agenda.js`, `agenda-paper.js` preview, the date-range resolver (§7) with its own unit tests (R10's gate), the export dialog, registry entry in `js/exports/export-registry.js`.
5. **C5 — Attachments (conditional).** Ships in this release only if the Storage-bucket verification gate (§8) passes during C3/C4; otherwise becomes v1.31.1 with no further schema change.
6. **C6 — Full regression + release.** Entire existing suite re-run (`workspace-foundation-check`, `smoke-boot`, executive/domain-shell checks, `permission-service-check`, `canAccessModule-check`, the RTDB rules-family checks, plus every new `agenda-*-check.mjs`), version bump `1.30.14.6 → 1.31.0.0` across every source-of-truth location identified in Phase A §13, final implementation report per the spec's own required format.

Each of C1–C6 gets its own review checkpoint before the next starts, matching this project's established "one phase, one go-ahead" working style — Phase C does not begin until this report is confirmed.
