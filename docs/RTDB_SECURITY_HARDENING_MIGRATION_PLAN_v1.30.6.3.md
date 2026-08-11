# RTDB Security Hardening — Migration Plan (v1.30.6.3)

**Type:** Planning only. **No `database.rules.json` change, no code, no
deployment.** This document is the deliverable.

**Status:** `docs/CREDENTIAL_SECURITY_PATCH_v1.30.6.2.md` is complete but
not deployed. This plan does not depend on that deploy happening first,
but Stage 7 below (the actual root cutover) should not happen before it,
since a tightened root would otherwise start *actually enforcing* the
plaintext-credential exposure this session already fixed in code.

## Approved program — phase-to-version mapping

The 7 stages below were approved as a formal program, each its own
version, with Stage 5 split into two independently-gated phases
(Driver Requests before Assignments, not combined):

| Phase | Version | Name | Risk | Status |
|---|---|---|---|---|
| 1 | v1.30.6.4 | Sibling Rule Completion | LOW | **Implemented, not deployed** |
| 2 | v1.30.6.5 | Admin Nodes & Append-only Nodes | LOW | **Implemented, not deployed** |
| 3 | v1.30.6.6 | Internal System Nodes → Cloud Functions | MEDIUM | **Implemented, not deployed** |
| 4 | v1.30.6.7 | Roster Nodes (`drivers`/`vehicles`) | MEDIUM | **Implemented, not deployed** |
| 5A | v1.30.6.8 | Driver Requests (ownership-scoped) | HIGH | **Implemented, not deployed** |
| 5B | v1.30.6.9 | Assignments (ownership-scoped) | VERY HIGH | **Implemented, not deployed** |
| 6 | v1.30.6.10 | Users Split (data-model change, not a rules change) | VERY HIGH | **Implemented, not deployed** |
| 7 | v1.30.6.11 | Root Cutover (`auth != null` → deny-by-default) | CRITICAL | **Implemented, not deployed** |

**Program status as of v1.30.6.11: all 7 phases fully implemented and
regression-tested in code. Nothing has been deployed.** The original
per-phase rollout plan below (each phase dark-launched independently
before the next begins) describes the INTENDED deploy sequence once
deployment is authorized — it does not describe what actually happened
in this session. Per explicit instruction, every phase was implemented
back-to-back in one continuous pass and `firebase deploy` was not run for
any of it; deployment (in whatever order — one phase at a time as
originally planned, or as a single batch — is the user's call to make
separately) remains entirely not started. See
`docs/RTDB_SECURITY_HARDENING_PROGRAM_REPORT_v1.30.6.11.md` for the full
program report: architecture, node ownership matrix, dependency graph,
per-phase outcomes, testing summary, documented judgment calls/gaps, and
rollback strategy.

After this program: v1.30.7 Permission Simulator → v1.30.8 Permission
Audit → Administration Platform LTS (resumes the Administration roadmap
this security program interrupted).

Each phase was DESIGNED to be implemented, tested, and dark-launched
(deployed, but inert — root stays `auth != null` until Phase 7)
independently before the next begins. In practice, all 7 phases were
implemented in one continuous session with zero deploys in between; the
dark-launch safety property (a rule with no effect until root tightens)
still held throughout, since root did not change until Phase 7's own edit
— the sequencing intent (test each phase's rule shape in isolation before
adding the next) was preserved even though the deploy cadence was not.

**Phase 1 (v1.30.6.4) implementation note**: closed all 3 sibling gaps
(`engineering/workReports`, the 4 Overtime siblings, `v2_sarpras/composer_documents`)
by copying each one's existing sibling rule verbatim — see `js/config.js`
VERSION_HISTORY v1.30.6.4 and `scripts/rtdb-sibling-rules-check.mjs` (34
checks, asserts byte-identical sibling matching + confirms no scope
creep). One documented judgment call: `engineering/workReports` mirrors
`engineering/notifications`' simpler uniform shape, not
`engineering/assignments`' per-record status-conditioned shape, since
work reports have no analogous field to hang a new condition on and
inventing one would have been out of this phase's scope. Not deployed.

**Phases 2-7 implementation notes**: full detail for each phase (scope,
files changed, judgment calls, hazards found and documented rather than
silently patched, exact test counts) lives in `js/config.js`
VERSION_HISTORY v1.30.6.5 through v1.30.6.11 and is consolidated in
`docs/RTDB_SECURITY_HARDENING_PROGRAM_REPORT_v1.30.6.11.md`. Not
repeated here to avoid drift between three copies of the same narrative.
Not deployed.

---

## 1. Architecture Report

`docs/RTDB_SECURITY_MODEL_AUDIT_v1.30.6.1.md` established: root
`.read`/`.write: "auth != null"` makes every deeper per-node rule
advisory. This was traced to a **pre-existing, already-planned** 3-step
rollout in `docs/BACKEND_FOUNDATION_ARCHITECTURE.md`: (1) authenticated-only
baseline, (2) `auth != null` deploy — **the step this app has been on
since 2026-06-13** — (3) tighten per-path. That original plan never
specified an actual sequence for step 3. This document supplies one, built
from a full inventory of what's actually in the database today, not the
example stages in the brief (which the brief itself says not to follow
literally).

Two enforcement layers exist today: client-side gating (`can()`/
`canAccessModule()`, real but bypassable by anyone using the Firebase SDK
directly) and RTDB `.validate` rules (real, but they constrain data
*shape*, not *who* — they don't need root to be tightened to matter, and
should not be confused with access control). This plan is about the third
layer, `.read`/`.write` rules, which don't yet bind at all.

## 2. Node Ownership Matrix

Every node this app touches, its class(es) per the brief's taxonomy, and
whether it has a node-specific rule today (advisory) or none at all.

| Node | Class(es) | Rule today? | Business owner | Real writers |
|---|---|---|---|---|
| `events` | System-owned, Internal, Append-only | Yes (read: admin/dev; write: false) | Notification Engine | Cloud Function triggers only |
| `telegram_deliveries` | System-owned, Internal, Append-only | Yes | Notification Engine | `telegramProxy` only |
| `notifications/$recipientId` | **User-owned** (correctly uid-scoped already) | Yes | Notification Engine | Cloud Functions only (`write: false` to clients) |
| `notification_deliveries` | System-owned, Internal | Yes | Notification Engine | Cloud Functions only |
| `push_subscriptions` | User-owned, **fully Cloud-Function-mediated both ways already** | Yes | Push | `registerPushSubscription`/`unregisterPushSubscription` only — zero direct client RTDB access, confirmed via source search |
| `notification_state/$uid` | **User-owned** (correctly uid-scoped already, read AND write) | Yes | Notification bell UI | The owning user, directly (`js/notifications.js`) |
| `reminders` | System-owned, Internal | Yes | Reminder Engine | `onAssignmentReminderSync` only |
| `pettyCash*` (5 nodes) | Admin-owned | Yes | Petty Cash module | Admin, via `js/petty-cash/*` |
| `overtime*` (9 nodes) | Admin-owned | Yes (6 of 9 — see gap below) | Overtime module | Admin, via `js/overtime/*` |
| `customRoles` | Admin-owned (write), Public-authenticated (read, non-archived) | Yes | Role Management | Admin only |
| `v2_sarpras/import_sessions,import_batches,file_storage` | Admin-owned (pilot) | Yes (2 of 3 siblings — see gap below) | Sarpras Intelligence | Admin, pilot-allowlisted client-side |
| `engineering/assignments,notifications,settings` | Role-owned (Engineering roles), per-record scoped | Yes — the most sophisticated existing rule (status-based write restriction) | Engineering module | Admin + Engineering roles |
| `gudang/*` (7 nodes) | Admin-owned, `.validate`-constrained | Yes | Warehouse module | Admin only |
| **`assignments`** | **Role-owned + ownership-scoped** (every role touches it differently) | **No** | Driver Operations | Effectively everyone (admin full; driver/bidang their own; viewer read) |
| **`driver_requests`** | **Role-owned + ownership-scoped** | **No** | Driver Operations | bidang (own requests) + admin (approve) |
| **`users`** | **Mixed — see §9, needs a data-model decision, not just a rule** | **No** | Administration | Admin (write); effectively everyone (read — see below) |
| `drivers` | Role-owned (broad read), Admin-owned (write) | **No** | Driver Operations | Admin write; broad read (scheduling UI, every role) |
| `vehicles` | Role-owned (broad read), Admin-owned (write) | **No** | Vehicle module | Same pattern as `drivers` |
| `settings` (+ `settings/telegram`) | Admin-owned, mixed sensitivity | **No** | Administration | Admin write; some sub-paths may need broader read |
| `logs` | Admin-owned (read), Append-only (write) | **No** | Administration / audit | Any authenticated user appends their own action; nobody should overwrite an existing entry |
| `analytics_exports` | Admin-owned (read), Append-only (write) | **No** | Export Center | Any authenticated user who triggers an export |
| `backups` | System-owned, Internal, Archive | **No** | Ops | Automatic, client-triggered today — candidate to move server-side (§9) |
| `reimbursement_counters` | System-owned, Internal | **No** | Driver Operations | Client `runTransaction` today — candidate to move server-side (§9) |
| `feature_flags` | Public-authenticated, Read-only from the client | **No**, but needs almost nothing — write is already console-only by convention, not app-writable | Ops | Nobody (manual console edit only) |
| `engineering/workReports` | Role-owned (Engineering) — **sibling gap** vs. its ruled siblings | **No** | Engineering module | Admin + Coordinator |
| `overtimeBudget/reportHistory/closing/archive` | Admin-owned — **sibling gap** | **No** | Overtime module | Admin only |
| `v2_sarpras/composer_documents` | Admin-owned (pilot) — **sibling gap** | **No** | Sarpras Intelligence | Admin, pilot-allowlisted |

## 3. Dependency Analysis

For the nodes that matter most (the ones with real complexity — the rest
are either already correctly shaped or trivially admin-only):

- **`users`**: read by `getUserByUsername()` (login-adjacent lookups),
  `js/engineering/providers/*` (personnel resolver), Gudang's Bidang
  roster resolver, the User Management admin screens, and the self-profile
  modal. Every authenticated session subscribes to the *entire* collection
  today (`loadAuthedAdminData()`). **What breaks if read is denied
  entirely**: Engineering personnel names, Gudang's roster picker, admin
  user list, and — critically — the client-side `pinHash` field would no
  longer even need to be broadly readable once §9's split ships, but
  today's blanket subscription would break outright.
- **`assignments`/`driver_requests`**: read by the entire Driver
  Operations timeline/list views (every role), `js/recovery.js`, Cloud
  Function triggers (`onAssignmentWrite`/`onRequestWrite`), reminder sync.
  Written by admin (direct), driver/bidang (status transitions on their
  own assignment — enforced only client-side today, e.g.
  `modal.js#canActOnAssignment`'s ownership checks). **What breaks if
  write is denied for non-admin roles**: drivers could no longer mark a
  trip started/completed, bidang could no longer submit or act on their
  own requests — core, daily-use functionality. This is why Stage 5 is
  late and high-risk, not early.
- **`drivers`/`vehicles`**: read broadly (every scheduling screen, every
  role, since a driver/vehicle name needs to render regardless of who's
  looking at a schedule). Written by admin only (and bidang, for
  self-drive assignment vehicle assignment per `js/app.js`'s
  self-drive flow — needs confirming precisely if scoped that way).
- **`settings`**: read broadly for some sub-paths (e.g., operational hours
  feeding scheduling logic that isn't admin-gated), narrowly for others
  (`settings/telegram`'s bot token — this one should never be broadly
  readable). A single node-level rule can't express this split — sub-path
  rules are needed (RTDB supports this natively, unlike a field-level
  split).
- **`logs`**: read by the admin activity feed and the Executive Timeline
  (admin-only surfaces); written by `logAction()`, called from dozens of
  call sites across every role's ordinary actions (login/logout,
  assignment changes, request actions). An append-only-per-child write
  rule (`!data.exists()`, the same pattern `gudang/movements` and
  `gudang/assetHistory` already use) allows every role to keep logging
  their own actions while preventing anyone from rewriting history.

## 4. Node Classification (grouped view)

- **Public authenticated** (any signed-in user, by design, not by
  accident): `feature_flags` (read), `customRoles` (read, non-archived).
- **User-owned** (already correctly uid-scoped, real precedent to copy):
  `notifications/$recipientId`, `notification_state/$uid`,
  `push_subscriptions` (fully server-mediated — the strongest form of
  "user-owned").
- **Role-owned + ownership-scoped** (the hardest class — needs per-record
  logic, not just a role check): `assignments`, `driver_requests`,
  `engineering/assignments` (already has this, is the template).
- **Role-owned, broad-read** (every role needs to see it, only admin
  writes): `drivers`, `vehicles`.
- **Admin-owned** (straightforward — admin/developer only, both
  directions): `pettyCash*`, `overtime*`, `gudang/*`,
  `v2_sarpras/import_sessions,import_batches,file_storage,composer_documents`,
  `settings` (mostly), `overtimeBudget/reportHistory/closing/archive`,
  `engineering/workReports`.
- **System-owned / Internal** (no client business reason to read or write
  directly at all): `events`, `telegram_deliveries`, `notification_deliveries`,
  `reminders`, `backups`, `reimbursement_counters`.
- **Append-only**: `logs`, `analytics_exports`, and (already) `gudang/movements`,
  `gudang/assetHistory`.
- **Mixed / needs a data-model decision, not just a rule**: `users` (§9).

## 5. Migration Order (derived from the investigation, not the brief's example)

**Stage 1 — Close the sibling gaps.** `engineering/workReports`,
`overtimeBudget`/`reportHistory`/`closing`/`archive`,
`v2_sarpras/composer_documents`. Each gets the *exact* rule shape its
already-ruled sibling in the same parent already has — zero new design,
zero new risk beyond what's already accepted for that sibling.

**Stage 2 — Admin-only nodes with no legitimate non-admin need.**
`settings` (non-sensitive sub-paths first, `settings/telegram` last and
most carefully), `feature_flags` (confirm write stays closed to the
client), `logs` and `analytics_exports` (append-only-per-child write,
admin-only read — reuses the `!data.exists()` pattern already proven in
`gudang/movements`/`assetHistory`).

**Stage 3 — Move system-internal nodes off client RTDB access entirely,**
rather than writing them a rule. `backups`, `reimbursement_counters`.
Mirrors the pattern this session's own Credential Security Patch and the
pre-existing `push_subscriptions` already establish: a Cloud Function
owns the write, the client calls it, RTDB rules for that node become
`.write: false` unconditionally — the *strongest* available guarantee,
stronger than any role-based rule could be.

**Stage 4 — Broadly-read business-roster nodes.** `drivers`, `vehicles`:
real per-role read rules (broad, since every role's scheduling UI needs
names), admin-only write. Moderate design work; real risk of breaking a
legitimate read path if scoped too narrowly — test every role explicitly.

**Stage 5 — Ownership-scoped operational nodes.** `assignments`,
`driver_requests`: the hardest rule-writing task in this plan — needs
real per-record ownership expressions (a driver may act on their own
assignment; a bidang may act on their own request), directly modeled on
`engineering/assignments/$assignmentId`'s existing
`data.child('status').val() !== 'verified'` pattern. Higher risk because
an incorrect rule here breaks the core scheduling functionality every
role depends on daily — the most testing-intensive stage.

**Stage 6 — `/users`.** Do not attempt a rule here before resolving §9's
data-model question. Highest architectural risk in this entire plan.

**Stage 7 — Tighten root.** Only after every stage above has its real
rule live (deployed, dark — i.e., root still open, so the new rules are
provably correct in production without yet being load-bearing) and
verified via §7's checklist for that stage. This is literally
"Step 3" of `BACKEND_FOUNDATION_ARCHITECTURE.md`'s original 3-step plan
from 2026-06, executed at last.

## 6. Risk Analysis (per stage)

| Stage | Risk | Rollback complexity | Testing effort | Deployment impact | User impact if wrong | Monitoring |
|---|---|---|---|---|---|---|
| 1. Sibling gaps | Low | Trivial — revert one rule block | Low — mirrors an already-proven sibling | Rules-only deploy | None (root still open, rules stay advisory until Stage 7) | None needed pre-Stage-7 |
| 2. Admin-only + append-only | Low-Medium | Trivial | Medium — verify append-only doesn't block legitimate first-writes | Rules-only | None pre-Stage-7 | None needed pre-Stage-7 |
| 3. Move to Cloud Functions | Medium | Revert both the new Function and the tightened rule together | Medium — new Function needs its own test coverage (mirrors `credentialService.js`'s testing convention) | Functions + rules deploy | Backups/reimbursement-counter writes would fail if the new Function has a bug — **this is the one stage with real risk even before Stage 7**, since it changes the WRITE PATH itself, not just a dormant rule | Watch Function error rate after deploy |
| 4. drivers/vehicles | Medium | Trivial rule revert | Medium-High — every role's scheduling read path | Rules-only | None pre-Stage-7 | None needed pre-Stage-7 |
| 5. assignments/requests | High | Trivial rule revert, but a wrong rule found only at Stage 7 cutover is expensive to diagnose live | High — every role, every assignment lifecycle action | Rules-only | None pre-Stage-7 (this is exactly why dark-launching all rules before Stage 7 matters) | Needed at Stage 7, not before |
| 6. `/users` | Highest | Depends entirely on whether a data split was needed — plan this stage on its own before scheduling it | High — a data-model change, not just a rule | Possibly a data migration + rules + client changes | Data-model changes always carry more risk than a rule | Ongoing after Stage 7 |
| 7. Root cutover | **The only stage with real, live production risk** | Revert root to `auth != null` instantly undoes everything | Full regression across every role and every module (§7) | The actual cutover | **Total outage for any node whose Stage 1-6 rule has a bug** — this is why every prior stage must be dark-launched and verified first | Active monitoring required during and after |

## 7. Test Strategy (per stage, before Stage 7; full regression at Stage 7)

- **Positive authorization**: for each node and each role the ownership
  matrix says should have access, confirm the *rule itself* evaluates true
  (Firebase Rules Simulator / Emulator Suite — root can stay open in
  parallel while the simulator tests the deeper rule directly).
- **Negative authorization**: for each node and each role that should
  NOT have access, confirm the rule evaluates false.
- **Realtime listeners**: every `subscribeNode()` call site for the
  affected node, for every role that should keep working after Stage 7.
- **Offline cache**: confirm a client with a stale local cache doesn't
  silently keep functioning past Stage 7 in a way that masks a
  denied-write (RTDB queues writes offline; a denied write surfaces async
  — every write call site needs a real error handler, not a fire-and-forget).
- **Admin tools**: Role Management, User Management, every admin-only
  screen touching a hardened node.
- **Cloud Functions**: every trigger/callable that reads/writes a
  hardened node via the Admin SDK — unaffected by rules by definition,
  but confirm nothing was accidentally relying on rules for its own logic.
- **Authentication**: login itself (Stage 7 must never affect `verifyPin`,
  which uses the Admin SDK) — explicit regression, not an assumption.
- **Custom Roles**: an `adminEquivalent` Custom Role (from v1.30.6) against
  every admin-tier node once Stage 7 lands — this is the first time that
  claim will matter for real.
- **Legacy System Roles**: all 6, against every node, at every stage.

## 8. Rollback Strategy

Every stage is a pure `database.rules.json` diff (Stage 3 additionally
touches a Cloud Function) — `git revert` + `firebase deploy --only database`
(and `--only functions` for Stage 3) restores the prior rule set exactly.
Stages 1-6 are safe to roll back at any time with zero user impact, since
root stays open throughout and nothing depends on the new rules being
correct yet. **Stage 7 is the only stage where rollback is time-sensitive**
— revert root to `auth != null` immediately restores full access if any
Stage 1-6 rule turns out to have a bug only surfaced by the real cutover.

## 9. `/users` — the node that needs a decision before a rule

`/users` cannot be correctly hardened with a single per-node rule, because
it needs to be broadly readable for some fields (username, displayName,
role — needed by Engineering/Gudang personnel resolvers and every
scheduling screen that shows a name) while other fields should be far
narrower (the credential fields, already hash-only and admin/self-scoped
per v1.30.6.2's design intent; `telegramChatIds`, arguably self/admin-only).
RTDB rules are per-*path*, not per-*field* — the fix is a **data-model
split**, not a cleverer rule: a `userProfiles/{username}: {displayName,
role}` broadly-readable node plus the existing `users/{username}` node
narrowed to self/admin. This is real, separately-scoped work — flagged
here as the reason Stage 6 is last and shouldn't be scheduled until it has
its own design pass, not attempted as a rider on this migration.

## 10. Future Architecture

- The credential-fields pattern from v1.30.6.2 (Cloud-Function-owned
  read/write, `.write: false` to clients) and the pre-existing
  `push_subscriptions` node are the two best templates in this codebase
  for "how do we harden a node" — Stage 3 generalizes that pattern to
  `backups`/`reimbursement_counters`; the `/users` split in §9 is the same
  idea applied to a broadly-read node instead of a narrowly-written one.
- `notification_state`/`notifications/$recipientId` are the best templates
  for genuine per-user ownership scoping (`auth.uid === $key`) — the
  simplest correct shape, reusable wherever a node is inherently
  one-record-per-user.
- `engineering/assignments/$assignmentId`'s status-conditioned write rule
  is the best template for Stage 5's ownership-scoped nodes.
- Once Stage 7 lands, `database.rules.stageA.json` (the original fully-open
  rollback artifact from 2026-06-13, per the audit's git history) should be
  retired — it would no longer represent a safe rollback target once real
  per-role rules are load-bearing; the rollback target from that point on
  is "the previous deployed `database.rules.json`," an ordinary git revert.
