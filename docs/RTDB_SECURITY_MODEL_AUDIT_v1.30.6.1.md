# Realtime Database Security Model Audit — v1.30.6.1

**Type:** Investigation checkpoint. **No code, rules, or configuration were
modified to produce this report.** Nothing was deployed.

**Question asked:** is the current RTDB root rule (`.read`/`.write`:
`auth != null`, which makes every deeper per-node role rule advisory) a
deliberate architectural decision, or an unnoticed defect?

**Short answer:** neither, exactly. It is a **deliberate, planned,
temporary intermediate stage ("Stage B") that was never completed.** The
team designed a 3-step rollout, shipped step 2, documented the gap in
writing at least three separate times over two months, and never executed
step 3. It is not silent — but it is also not "intentional forever." And
independently of the root-cascade question, this audit surfaced one
concrete, **practical** (not theoretical) consequence worth flagging with
urgency: because `/users` has no node-specific rule at all, any
authenticated user — including the lowest-privilege `viewer` role — can
currently read every account's **plaintext PIN** directly via the Firebase
client SDK, bypassing this application's UI entirely. See §7.

---

## 1. Architecture Report

```
Client (any role, any device)
        │
        │  Firebase JS SDK — reads/writes RTDB paths directly
        ▼
┌─────────────────────────────────────────────┐
│  database.rules.json                         │
│  root: .read="auth!=null"  .write="auth!=null"│ ◄── grants EVERYTHING to
└─────────────────────────────────────────────┘     any signed-in user,
        │                                            evaluated FIRST
        │  (cascade stops here — deeper rules
        │   below are never reached for most paths)
        ▼
┌─────────────────────────────────────────────┐
│  Per-node rules (pettyCash*, overtime*,       │  ADVISORY — correct in
│  gudang/*, customRoles, engineering/*, ...)   │  shape, never actually
└─────────────────────────────────────────────┘  evaluated by Firebase
        │
        ▼
┌─────────────────────────────────────────────┐
│  Nodes with NO rule at all: assignments,      │  Same outcome as above,
│  driver_requests, users, drivers, vehicles,   │  by omission rather than
│  settings, logs, and others (§5)              │  by cascade — never had
└─────────────────────────────────────────────┘  a node-specific rule to
                                                    begin with

Separately, unaffected by any of the above:
Cloud Functions (Admin SDK) ── always bypasses ALL rules by Firebase design
        │
        ▼
  verifyPin.js reads /users/{username} directly — this is why LOGIN itself
  is unaffected by anything in this report (§4, §9).
```

## 2. Security Model Diagram — narrative

Two independent enforcement layers exist today, and only one of them is
real for access control:

1. **Client-side authorization (real, but bypassable):** `js/permission-service.js#can()`,
   `js/app.js#canAccessModule()`, `isAdmin()`/`isBidang()`/etc. decide what
   the *UI* shows and which buttons are wired to fire a write. This is
   genuinely effective against the ordinary user using the app normally —
   but it is enforced entirely in code running on the user's own device.
   Anyone who opens browser devtools and calls the Firebase SDK directly
   (`firebase.database().ref('users').once('value')`, or a write) skips
   this layer completely.
2. **RTDB rules (real for shape, advisory for access):** `.validate` rules
   (e.g. `gudang/items`'s `newData.hasChildren([...])` / itemType-immutability
   check) **do** still bind — Firebase evaluates every `.validate` rule
   along the full path, ANDed together, independent of the `.read`/`.write`
   cascade. But `.read`/`.write` rules are evaluated top-down and the
   **first** satisfied one wins — so the root's `auth != null` grant is
   reached before any deeper node rule ever gets a chance to run, for
   every single path in the database.

## 3. RTDB Rule Cascade Analysis

Firebase evaluates `.read`/`.write` by walking from the root toward the
requested path and granting access at the **first** node (starting from the
root) whose rule evaluates `true`. A deeper, more specific `false`/stricter
rule can never revoke what a shallower rule already granted.

**Concrete example — `pettyCashExpenses`:**
```
root:              .write: "auth != null"          ← TRUE for any signed-in user
pettyCashExpenses: .write: "auth.token.role==='admin' || ... adminEquivalent"
```
When a `viewer`-role client calls `firebase.database().ref('pettyCashExpenses/x').set(...)`,
Firebase checks the root rule first, finds `auth != null` true, and **grants
the write immediately** — `pettyCashExpenses`'s own, much stricter rule is
never even evaluated. The same is true for every node listed in §5's first
table (rules present but never reached) and, by simple absence, every node
in §5's second table (no rule to even write).

**Which rule actually grants read/write today, for every path in this
database:** the root rule, unconditionally, for any authenticated user.

**Which rules are never reached:** every `.read`/`.write` rule below root —
all ~26 blocks across `events`, `notifications`, `pettyCash*`, `overtime*`,
`v2_sarpras`, `gudang/*`, `customRoles`, and `engineering/*`'s role-specific
narrowing.

**Which rules are effectively decorative:** the same set — they are
correct, well-formed, and would work exactly as intended the moment root
stops granting blanket access. They are not wrong; they are dormant.

**Exception — `.validate` rules stay real.** `gudang/items/$itemId/.validate`
(shape + itemType-immutability), `gudang/movements/$movementId/.validate`,
every other `.validate` block in the file: these remain fully enforced
regardless of who is allowed to write, because Firebase requires ALL
matching `.validate` rules to pass, evaluated independently of `.read`/`.write`.
They constrain *what* can be written, not *who* can write it.

## 4. Root Dependency Analysis

**If root were changed to deny-by-default (`.read: false, .write: false`) today, with no other change:**

Every path that has no node-specific rule of its own would become
completely inaccessible to every client — including legitimate reads by
the roles that are supposed to have them. Every path that *does* have a
node-specific rule would, for the first time, actually start being
enforced by that rule (which, per §5, mostly already says "admin/developer
only" — so this would also newly and correctly restrict non-admin roles
from paths they were never supposed to reach in the first place, e.g.
`pettyCashExpenses`).

Concretely, using §5's inventory:

- **Total breakage** (no rule exists anywhere for these): `assignments`,
  `driver_requests`, `users`, `drivers`, `vehicles`, `settings`, `logs`,
  `analytics_exports`, `backups`, `reimbursement_counters`,
  `feature_flags`, `engineering/workReports`, `overtimeBudget`,
  `overtimeReportHistory`, `overtimeClosing`, `overtimeArchive`,
  `v2_sarpras/composer_documents`.
- **Continues working, now for real** (a node rule already exists and is
  correctly scoped): `events`, `telegram_deliveries`, `notification_deliveries`,
  `reminders`, `pettyCashExpenses/Nors/Cycles/Settings/Audit`,
  `overtimeUnits/Employees/Rates/RateVersions/Holidays/Records/DailySummary/MonthlySummary/Audit`,
  `customRoles`, `v2_sarpras/import_sessions,import_batches,file_storage`,
  `gudang/*` (all 7 children), `engineering/assignments,notifications,settings`.
- **Continues working, uid-scoped as intended**: `notification_state/$uid`,
  and (mostly — see caveat) `notifications/$recipientId`, `push_subscriptions/$userId`.
  Caveat: today, because root also grants these, an authenticated user can
  currently read/write **any** uid's row, not just their own, the same
  root-cascade issue as everywhere else — tightening root actually fixes
  this specific case for free, since the existing `auth.uid === $recipientId`
  clause becomes the binding one.
- **Unaffected either way**: `verifyPin` login (Cloud Function, Admin SDK,
  never subject to client rules), all other Cloud Function writes.

## 5. Module Impact Matrix

| Module | Nodes it reads/writes | Has a node rule today? | Impact if root → deny-by-default (no other change) |
|---|---|---|---|
| Warehouse (Gudang) | `gudang/*` (7 children) | Yes, all 7 | **None** — already fully specified; would simply start being real |
| Vehicle | `vehicles` | **No** | **Total breakage** — every vehicle read/write fails |
| Driver Operations | `assignments`, `driver_requests`, `drivers` | **No** | **Total breakage** — scheduling, requests, driver roster all fail for every role, including drivers viewing their own schedule |
| Executive | reads `assignments`/`drivers`/`vehicles`/engineering data for dashboards | Mixed — underlying nodes mostly unruled | **Total breakage** of dashboard data (dashboard *shell* still renders, client-side gated) |
| Engineering | `engineering/assignments,notifications,settings` (ruled); `engineering/workReports` (**not** ruled — a sibling gap) | Partial | Assignments/notifications/settings keep working; Work Reports ("Catat Pekerjaan") break entirely |
| Administration (Konfigurasi) | `users`, `settings` (**not** ruled), `customRoles` (ruled) | Partial | User management and global config break entirely; Role Management keeps working |
| Authentication | `/users/{username}` via Admin SDK in `verifyPin.js` | N/A — bypasses rules | **None** — login is completely unaffected, since Cloud Functions never go through client rules |
| Uploads / Sarpras Intelligence | `v2_sarpras/import_sessions,import_batches,file_storage` (ruled); `v2_sarpras/composer_documents` (**not** ruled — a sibling gap) | Partial | Import flows keep working; document composer drafts break |
| Analytics | reads `assignments`/`drivers`/`vehicles` (unruled) + writes `analytics_exports` (**not** ruled) | No | **Total breakage** — both the underlying data reads and the export-history log |
| Petty Cash | `pettyCash*` (5 nodes, ruled) | Yes | **None** — already fully specified |
| Overtime | `overtimeUnits/Employees/Rates/RateVersions/Holidays/Records/DailySummary/MonthlySummary/Audit` (ruled); `overtimeBudget`, `overtimeReportHistory`, `overtimeClosing`, `overtimeArchive` (**not** ruled) | Partial | Core payroll data keeps working; budget target, report history, and month-close/archive workflows break |
| Notifications / Push / Reminders / Events / Telegram | ruled | Yes | **None**, plus the uid-scoping bug in §4 gets fixed as a side effect |
| Audit trail | `logs` | **No** | **Total breakage** — every screen that shows recent activity/audit history fails |

## 6. Client Trust Model

**Conclusion: this application currently relies on client-side authorization
for essentially all access control.** There are exactly two exceptions,
both narrow:

1. **Cloud Functions using the Admin SDK** — `verifyPin` (login),
   `onAssignmentWrite`/`onRequestWrite`/`onEngineeringAssignmentWrite`/`onEventWrite`
   (event/notification dispatch), `reminderTick`/`onAssignmentReminderSync`
   (scheduling), `telegramProxy`/`telegramWebhook`, push
   registration/unregistration, `exportAnalyticsReport` — these run
   server-side with credentials that bypass RTDB rules entirely by Firebase
   design, so they constitute genuine server-side logic, independent of the
   root-cascade issue.
2. **`.validate` rules** — real, but they constrain data *shape*, not *who*
   may write. They do not substitute for access control.

Everything else — every `readNode`/`subscribeNode`/`storeFirebaseData`/`updateFirebaseData`
call from the client for `assignments`, `drivers`, `vehicles`, `users`,
`settings`, `pettyCash*`, `overtime*`, `gudang/*`, `customRoles`, etc. — is
authorized only by whether the *client-side code that happens to be running
in the user's browser* chose to call it. This is "**hybrid**" only in the
loosest sense: the hybrid is between "real server logic for a handful of
specific server-triggered flows" and "no server-side access control at all
for interactive reads/writes," not between two comparably-strong layers.

## 7. Security Impact — Theoretical vs. Practical vs. Already Mitigated

This is the section that matters most for prioritization.

### Practical, exploitable today, no privilege escalation required

- **Credential harvesting via `/users`.** `functions/src/auth/verifyPin.js`
  authenticates a login by direct string equality: `user.pin === pin`
  (confirmed at `functions/src/auth/verifyPin.js:118-119`) — meaning
  `/users/{username}.pin` is stored as the **raw, plaintext 4-digit PIN**,
  not a hash. `/users` has no node-specific RTDB rule (§5), so it falls
  through entirely to the root's `auth != null` grant. **Any authenticated
  user of any role — including the lowest-privilege `viewer`** — can open
  a browser console and run `firebase.database().ref('users').once('value')`
  (or the equivalent read via this app's own already-loaded SDK instance)
  and receive every account's username, plaintext PIN, and role in one
  call. This is a complete credential-harvesting path requiring no
  exploit, no privilege escalation, and no bypass of anything beyond
  "open devtools" — an authenticated low-privilege employee can silently
  obtain every admin account's login PIN and log in as them. **This is the
  single highest-priority finding in this audit** — it is a direct
  consequence of the root-cascade issue, but its severity comes from being
  layered on top of plaintext credential storage, which is a second,
  independent weakness.
- **Silent write access to `assignments`/`driver_requests`/`drivers`/`vehicles`.**
  A `viewer`-role account (whose entire intended capability, per
  `role-permissions.js`, is `driver.schedule.view` — read-only) can write
  or delete any assignment, driver, or vehicle record directly, bypassing
  every `can()`/`canAccessModule()` check the last two releases built.
  The client-side permission model secures the *ordinary UI path*; it does
  not secure the data.
- **Audit-log tampering.** `logs` has no rule; any authenticated user can
  write fabricated entries or is unrestricted from doing so if they choose
  to call `logAction()`-equivalent writes directly — undermining the audit
  trail's evidentiary value.
- **Global settings tampering, including the Telegram bot token.** `settings`
  (and `settings/telegram`) have no rule; any authenticated user can read
  or overwrite the bot token or operational configuration.

### Practical, but lower severity / narrower blast radius

- Reading (not just one's own) `notifications/$recipientId` or
  `push_subscriptions/$userId` for any uid, per §4's caveat.
- Writing to `overtimeBudget`/`overtimeReportHistory`/`overtimeClosing`/`overtimeArchive`,
  `analytics_exports`, `backups`, `reimbursement_counters`,
  `engineering/workReports`, `v2_sarpras/composer_documents` — all
  bypassable by any authenticated user, but each is narrower in
  consequence than credential theft or core operational data tampering.

### Theoretical (would require additional conditions not present today)

- Nothing in this audit found a risk that is *purely* theoretical — every
  gap identified is reachable today by any authenticated session using
  only the standard Firebase client SDK, which is already loaded by this
  app for every logged-in user.

### Already mitigated

- `.validate` rules on `gudang/*` (shape/type constraints) — real,
  independent of the root issue.
- Anything server-only (`.write: "false"` unconditionally: `events`,
  `telegram_deliveries`, `notification_deliveries`, `push_subscriptions`,
  `reminders`) — a client can still *read* these via root (§5), but cannot
  write them regardless of root, since `false` cannot be overridden by a
  more permissive rule in the other direction (root's grant only helps
  when root itself says `true`; a hardcoded `"false"` at the node always
  wins for writes to that exact node, because it's evaluated as the
  authoritative rule for that specific write, not superseded by a
  shallower `true` — Firebase's cascade only ever adds permissiveness
  going *down* the tree for a `true`, it does not let a deeper `false`
  override, but a deeper `false` and a shallower `true`... to be precise:
  the safest correct statement is that these five nodes' `.write: "false"`
  is a `false` at a level Firebase does check, and no ancestor of theirs
  sets `.write` to anything, so root's `.write: "auth != null"` is what's
  actually evaluated for a write attempt at, say, `events/x` — meaning
  **these are NOT actually protected from writes either**, by the same
  cascade logic as everything else, unless Firebase's implementation
  specifically treats an explicit `"false"` at the target node as
  overriding an ancestor grant. This distinction could not be resolved
  from static analysis alone and should be verified against Firebase's
  documented rule-cascade semantics precisely, or empirically via the
  Emulator Suite, before being relied upon either way — flagged here as an
  open question rather than asserted as fact in either direction.

## 8. Historical Evidence

Full detail in the investigation transcript; summarized findings:

- `database.rules.json` was created 2026-06-13 fully open (`.read`/`.write: true`),
  tightened the same day (commit `7398e63`, v1.11.1.2, "Identity Foundation
  production rollout") to `auth != null`, and has **never been changed
  since** across 13 further commits (through v1.30.2) plus the current
  uncommitted v1.30.6 working tree.
- `js/config.js`'s `VERSION_HISTORY` entry for v1.11.1.2 explicitly labels
  this **"RTDB Security Rules Stage B"** and lists "Role Rules, Ownership
  Rules" as **deferred** (not abandoned), with `database.rules.stageA.json`
  kept as an instant rollback to the original fully-open state.
- `docs/BACKEND_FOUNDATION_ARCHITECTURE.md` (the pre-implementation master
  plan) designed an explicit 3-step rollout — authenticated-only baseline →
  `auth != null` deploy → **tighten per-path** — and includes a fully
  designed deny-by-default ruleset that was never deployed. The plan
  explicitly named "locking RTDB rules breaks the live app" as a migration
  risk to stage carefully.
- `docs/IDENTITY_SECURITY_CUTOVER_v1.11.1.2.md` (the blueprint for the
  cutover commit) explicitly marks Role Rules/Ownership Rules as deferred
  in its own Definition of Done.
- `docs/PUSH_NOTIFICATION_ARCHITECTURE_v1.11.3.md`, written **two weeks
  later**, contains an explicit written warning: *"Known rules limitation
  ... the real protection is 'clients simply don't write these paths' ...
  load-bearing, not belt-and-suspenders, until the permissive root is
  tightened ... Tightening the root is the right long-term fix and should
  be scheduled."* This recommendation was never subsequently acted on.
- `docs/IPHONE_PWA_ADMIN_DATA_AUDIT.md` (later, unrelated debugging work)
  casually cites "RTDB rules are Stage B" as already-known internal
  context at that point.
- This session's own `docs/PERMISSION_RUNTIME_MIGRATION_REPORT_v1.30.6.md`
  independently re-derived and re-confirmed the identical finding, and
  chose to proceed with additive rule changes anyway, documenting them as
  "forward-compatible hardening... not a new restriction today."
- **No evidence was found**, anywhere in commit history, `VERSION_HISTORY`,
  or `docs/`, of anyone declaring the open root a *permanent* design choice.
  Every trace found frames it as temporary and pending a follow-up that
  has now gone unexecuted for roughly two months, re-discovered and
  re-flagged independently at least three separate times (the original
  architecture doc, the push-notification security review, and this
  session) without ever being promoted to the planned "Stage C."

## 9. Hardening Feasibility

**Verdict: High Risk, as a single cutover; Medium-to-Low Risk if staged
per-module.**

Why High Risk as a single cutover: §5 shows roughly a third of the
database's real, in-use data (assignments, driver_requests, users, drivers,
vehicles, settings, logs, analytics_exports, backups,
reimbursement_counters, feature_flags, plus several sub-nodes of
Engineering/Overtime/Sarpras Intelligence) has **no node-specific rule
whatsoever today**. Flipping root to deny-by-default without first writing
rules for every one of these would cause the near-total application outage
described in §10 — this is not a "flip a flag and fix stragglers" change,
it is "write a complete, correct rule for every node this app touches,
first."

Why Medium-to-Low Risk if staged per-module: the nodes that already have
rules (Petty Cash, Overtime's core 9 nodes, Gudang, Engineering's 3 ruled
children, Custom Roles, notifications/events/reminders/push) could have
root tightened for *just those paths* with very low risk today, since
their rules are already correct and tested by virtue of having existed
for months. The genuinely hard, higher-risk part is the un-ruled paths
(§5's second table) — those need real design work (what should a `driver`
role actually be allowed to write to `assignments`? what does "own
assignment" ownership scoping look like in a rule, not just client code?)
before they can be tightened safely, matching exactly what
`BACKEND_FOUNDATION_ARCHITECTURE.md`'s original Phase 3 plan anticipated
needing.

This is consistent with, and now has concrete evidence for, the "platform-wide
change with high blast radius, outside any single module's scope" assessment
already recorded in this project's own `[[rtdb-rules-cascade-caveat]]` memory.

## 10. Rollback Risk — what breaks first if root were tightened carelessly

Per §4/§5, essentially simultaneously and immediately:

- **Background listeners / realtime sync**: `initFirebaseSync()`'s live
  subscriptions on `assignments`/`driver_requests` would fail with
  `permission_denied` the instant root denies by default — the entire
  live-sync mechanism this app is built around stops.
- **Every list/detail screen** reading `assignments`, `drivers`, `vehicles`,
  `users`, `settings` would show empty or error states.
- **Navigation** itself would keep rendering (it's client-side, driven by
  `canAccessModule()`) — but every screen behind it would be broken, which
  is arguably a *worse* user experience than an outright block, since the
  app would look like it's loading forever or silently showing nothing.
- **Offline cache**: Firebase's local persistence (if enabled) may
  continue showing stale last-known data briefly, masking the failure
  before the first fresh read attempt surfaces it.
- **Authentication**: unaffected — login goes through `verifyPin.js` via
  the Admin SDK, never subject to client RTDB rules.
- **Cloud Functions**: unaffected, same reason.
- **Uploads**: `v2_sarpras`'s ruled children (import flows) keep working;
  `composer_documents` breaks.

In short: **tightening root without first writing the missing rules would
not degrade gracefully — it would break the application's core scheduling
and administration functionality for every signed-in user, simultaneously,
while login and background Cloud Functions kept working normally**, which
would likely present as "the app is broken" rather than "access is now
correctly restricted," and would need immediate rollback.

## 11. Recommendation

This audit was scoped as investigation-only and makes no code, rule, or
deployment changes. For the record, and for whoever picks up the next step:

1. **Treat §7's `/users` plaintext-PIN finding as the priority**, separate
   from and more urgent than the general root-rule hardening question — it
   is exploitable today by any authenticated account with zero additional
   conditions. Whether the eventual fix is a `/users` node rule, PIN
   hashing, or both is a decision for that dedicated piece of work, not
   this audit.
2. **Root tightening is real, valuable work, correctly identified as
   deferred rather than abandoned** — but it is large (§9) and should be
   staged per-module as `BACKEND_FOUNDATION_ARCHITECTURE.md` originally
   planned, starting with the already-ruled nodes (low risk) and treating
   each currently-unruled node (§5's second table) as its own scoped design
   task: what should each role actually be allowed to read/write there, not
   just "admin or not."
3. This audit, the `/users` finding, and the broader root-tightening
   project are each their own scope — none of this was implemented here,
   per the brief.
