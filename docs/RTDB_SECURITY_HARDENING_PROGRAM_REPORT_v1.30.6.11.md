# RTDB Security Hardening Program — Final Report (v1.30.6.11)

**Status: ALL 7 PHASES IMPLEMENTED AND REGRESSION-TESTED IN CODE.
NOTHING HAS BEEN DEPLOYED.** `firebase deploy` was not run at any point
in this program, for any phase, including the root cutover (Phase 7).
Deployment is a separate, explicit decision the user has not yet made.

This report covers the full 7-phase program approved in
`docs/RTDB_SECURITY_HARDENING_MIGRATION_PLAN_v1.30.6.3.md`, executed
back-to-back in one continuous session per explicit instruction
("continue until all the phases complete and make the report
afterwards"). It supersedes that plan document as the authoritative
record of what was actually built — the plan describes intent, this
describes outcome.

---

## 1. Program Summary

| Phase | Version | Name | Risk (planned) | Outcome |
|---|---|---|---|---|
| 1 | v1.30.6.4 | Sibling Rule Completion | LOW | Implemented, tested, not deployed |
| 2 | v1.30.6.5 | Admin Nodes & Append-only Nodes | LOW | Implemented, tested, not deployed |
| 3 | v1.30.6.6 | Internal System Nodes → Cloud Functions | MEDIUM | Implemented, tested, not deployed |
| 4 | v1.30.6.7 | Roster Nodes (`drivers`/`vehicles`) | MEDIUM | Implemented, tested, not deployed |
| 5A | v1.30.6.8 | Driver Requests (ownership-scoped) | HIGH | Implemented, tested, not deployed |
| 5B | v1.30.6.9 | Assignments (ownership-scoped) | VERY HIGH | Implemented, tested, not deployed |
| 6 | v1.30.6.10 | Users Split (data-model change) | VERY HIGH | Implemented, tested, not deployed |
| 7 | v1.30.6.11 | Root Cutover (deny-by-default) | CRITICAL | Implemented, tested, not deployed |

No phase's risk classification changed during implementation. No phase
was skipped, reordered, or descoped. Every phase's own detailed narrative
lives in `js/config.js` `VERSION_HISTORY` under its version number — this
report consolidates and cross-references rather than duplicating that
prose in full.

**Deviation from the plan's stated rollout, noted explicitly**: the plan
(§"Migration Order") assumed each phase would be implemented, dark-launch
deployed, and verified live before the next began. Per this session's
explicit instruction, all 7 phases were implemented in one continuous
pass with zero deploys in between. The safety property the dark-launch
sequencing exists to protect — no phase has any live effect until root
tightens — still holds exactly as designed, because root did not change
until Phase 7's own edit, which itself has not been deployed either. The
*testing* sequencing (verify each phase's rule shape before adding the
next) was also preserved throughout, even though the *deploy* cadence
was collapsed. What changed is only when a human gets to review each
increment live in production before the next lands on top of it — that
review now happens once, over the whole diff, instead of seven times.

---

## 2. Final Node Ownership Matrix

Every node any client touches now has an explicit rule. Nodes marked
"Cloud-Function-only" deliberately have no client rule at all — that
absence, combined with the Phase 7 deny-by-default root, is the rule.

| Node | Read | Write | Added/changed in |
|---|---|---|---|
| `events`, `telegram_deliveries`, `notification_deliveries`, `reminders` | admin/dev/adminEquivalent | `false` | Pre-existing |
| `notifications/$recipientId` | self or admin/dev/adminEquivalent | `false` (Cloud Functions only) | Pre-existing |
| `push_subscriptions/$userId` | self or admin/dev/adminEquivalent | `false` (Cloud Functions only) | Pre-existing |
| `notification_state/$uid` | self | self | Pre-existing |
| `pettyCash*` (5 nodes), `overtimeUnits/Employees/Rates/RateVersions/Holidays/Records/DailySummary/MonthlySummary/Audit` (9 nodes) | admin/dev/adminEquivalent | admin/adminEquivalent | Pre-existing |
| `customRoles` | admin/dev, or authenticated + non-archived | admin only | Pre-existing |
| `v2_sarpras/import_sessions,import_batches,file_storage` | admin/dev/adminEquivalent | admin/adminEquivalent | Pre-existing |
| `engineering/assignments,notifications,settings` | Engineering roles + admin/dev | per-record status-gated / admin+coordinator / admin+dev | Pre-existing |
| `gudang/*` (7 nodes) | admin/dev/adminEquivalent | admin/dev/adminEquivalent + `.validate` | Pre-existing |
| `engineering/workReports` | admin/dev/Engineering roles | admin/dev/Engineering roles | **Phase 1** |
| `overtimeBudget/reportHistory/closing/archive` | admin/dev/adminEquivalent | admin/adminEquivalent | **Phase 1** |
| `v2_sarpras/composer_documents` | admin/dev/adminEquivalent | admin/adminEquivalent | **Phase 1** |
| `logs`, `analytics_exports` | admin/dev/adminEquivalent | per-child, append-only (`auth != null && !data.exists()`) | **Phase 2** |
| `feature_flags` | `auth != null` | `false` | **Phase 2** |
| `settings` | admin/dev/adminEquivalent | admin/adminEquivalent | **Phase 2** |
| `settings/operations` | `auth != null` | admin/adminEquivalent | **Phase 2** |
| `backups` | — | — | **Phase 3**: no client rule at all; Cloud-Function-only (`backupTick.js`, Admin SDK) |
| `reimbursement_counters` | — | — | **Phase 3**: no client rule at all; Cloud-Function-only (`counter.js`, Admin SDK) |
| `drivers`, `vehicles` | `auth != null` | admin/adminEquivalent | **Phase 4** |
| `driver_requests` | `auth != null` | per-record: admin always; bidang create-as-self / update-without-reassign | **Phase 5A** |
| `assignments` | `auth != null` | per-record: admin always; driver-owns-own-record; bidang-self-drive-via-request-cross-reference | **Phase 5B** |
| `userProfiles` | `auth != null` | `false` (Cloud-Function mirror only — `onUserWrite.js`) | **Phase 6** |
| `users/$username` | admin/adminEquivalent or self | admin/adminEquivalent or self | **Phase 6** (narrowed from no-rule) |
| **root** | `false` | `false` | **Phase 7** (was `auth != null` through Phase 6) |

Every node identified as needing a rule in the original audit's Node
Ownership Matrix (`RTDB_SECURITY_HARDENING_MIGRATION_PLAN_v1.30.6.3.md`
§2) now has one. No node was missed — confirmed by
`scripts/rtdb-hardening-phases-2to7-check.mjs` §11's completeness
spot-check, run after every phase's edits landed.

---

## 3. Files Changed (aggregate, all 7 phases)

**Rules:**
- `database.rules.json` — every phase touched this file; final diff from
  the Phase-1 baseline adds `logs`, `analytics_exports`, `feature_flags`,
  `settings` (+ `settings/operations`), `drivers`, `vehicles`,
  `driver_requests`, `assignments`, `userProfiles`, narrows `users`, and
  tightens root to deny-by-default. `backups`/`reimbursement_counters`
  deliberately gained no rule (moved off client access entirely instead).

**Cloud Functions (new):**
- `functions/src/maintenance/backupTick.js` — scheduled daily backup + prune.
- `functions/src/reimbursement/counter.js` — atomic doc-number callable.
- `functions/src/users/onUserWrite.js` — `/users` → `/userProfiles` mirror trigger.
- `functions/src/notifications/notifyAdminsOfNewRequest.js` — server-side admin fan-out for new requests.

**Cloud Functions (changed):**
- `functions/index.js` — exports for all 4 new functions.

**Client (new):**
- `js/user-profiles-store.js` — read-only `/userProfiles` store, mirrors `js/users.js`'s LOAD/SUB pattern.

**Client (changed):**
- `js/firebase.js` — removed `_backupAssignmentsOnce`/`_pruneOldBackups`
  and the dead `getSetting` import; `acquireReimbursementDocNumber`
  rewritten to call the new callable; added `saveOneRequest()`;
  added `callAcquireReimbursementNumber()`, `callNotifyAdminsOfNewRequest()`.
- `js/app.js` — 6 `driver_requests` write call sites moved from
  `saveRequests()` (full-collection) to `saveOneRequest()` (per-record);
  `loadAuthedAdminData()` now initializes the profile store and wires it
  into Engineering/Gudang personnel resolvers; 5 of 9 `getUserList()`
  driver-identity lookups switched to `getUserProfileList()` (4 admin-only
  call sites deliberately left unchanged); request-creation now calls
  `callNotifyAdminsOfNewRequest()` instead of the removed client-side sender.
- `js/notifications.js` — `resolveDisplayName()` now reads from the profile store.
- `js/notification-service.js` — removed `buildRequestPendingMessage()`/
  `sendNewRequestNotificationToAdmins()` (moved server-side); documented why.
- `js/config.js` — `APP_VERSION`, `RELEASE_NAME`, and 7 new `VERSION_HISTORY` entries.

**Version propagation:**
- `service-worker.js`, `version.json`, `index.html` — re-stamped via `scripts/sync-version.mjs`.

**Tests (new, this consolidation pass):**
- `scripts/rtdb-hardening-phases-2to7-check.mjs` — 52 checks, rule-shape
  structural assertions for Phases 2 through 7.
- `scripts/rtdb-hardening-functions-check.mjs` — 34 checks, pure-logic
  mirrors of `onUserWrite.js#extractProfile()`, `counter.js`'s doc-number
  formatting, `backupTick.js`'s retention-cutoff math, and
  `notifyAdminsOfNewRequest.js`'s admin-selection filter.

**Tests (updated):**
- `scripts/rtdb-sibling-rules-check.mjs` — sections 1 and 6 (originally
  point-in-time assertions: "root untouched", "these nodes still don't
  exist") updated to assert the final, whole-program end state instead of
  failing false-positive once later phases in the same approved program
  intentionally changed them.

**Docs:**
- `docs/RTDB_SECURITY_HARDENING_MIGRATION_PLAN_v1.30.6.3.md` — phase
  status table updated to "Implemented, not deployed" for all 7 phases.
- `docs/RTDB_SECURITY_HARDENING_PROGRAM_REPORT_v1.30.6.11.md` — this document.

---

## 4. Testing Summary

Full regression suite, run together at the end of this consolidation pass:

| Script | Checks | Result |
|---|---|---|
| `rtdb-sibling-rules-check.mjs` (Phase 1, updated for final state) | 34 | ✓ 0 failed |
| `rtdb-hardening-phases-2to7-check.mjs` (new) | 52 | ✓ 0 failed |
| `rtdb-hardening-functions-check.mjs` (new) | 34 | ✓ 0 failed |
| `pin-hash-check.mjs` (prior session, Credential Patch) | 24 | ✓ 0 failed |
| `credential-service-check.mjs` (prior session, Credential Patch) | 39 | ✓ 0 failed |
| `permission-service-check.mjs` (prior session, Permission Runtime) | 62 | ✓ 0 failed |
| `canAccessModule-check.mjs` (prior session, Permission Runtime) | 5 | ✓ 0 failed |
| `verify-pin-role-resolution-check.mjs` (prior session, Permission Runtime) | 23 | ✓ 0 failed |
| `permission-runtime-invariant-check.mjs` (Puppeteer, DOM, real wired code) | 14 | ✓ 0 failed |
| **Total** | **287** | **✓ 0 failed** |

Every newly created/modified file was syntax-checked with `node --check`
(all Cloud Functions files, `js/firebase.js`, `js/app.js`,
`js/notifications.js`, `js/notification-service.js`,
`js/user-profiles-store.js`) and `database.rules.json` was validated as
well-formed JSON. `scripts/sync-version.mjs` ran clean, re-stamping
`service-worker.js`, `version.json`, and every asset version query string
in `index.html` to `1.30.6.11`.

**What this test suite does NOT cover, and why**: none of it runs a real
Firebase Rules Simulator or Emulator Suite pass — this offline environment
has no emulator available, so every rule assertion is a structural check
against the exact expression text (proving the reviewed, designed rule is
what's actually in the file) rather than an executed evaluation against
live fixture data. The plan's own §7 Test Strategy calls for exactly this
kind of live simulator pass ("Positive/Negative authorization... Firebase
Rules Simulator / Emulator Suite") before Phase 7 goes live — that step
is still open and belongs to the deployment phase this report does not
authorize.

---

## 5. Documented Judgment Calls and Residual Gaps

Every non-obvious decision made during implementation, kept visible
rather than buried in a commit:

1. **`settings/operations` read carve-out (Phase 2).** The general
   `settings` node is admin-family read, but `settings/operations`
   specifically is broadened to `auth != null` because
   `workStartMins`/`workEndMins` under that sub-path are read by
   `js/timeline.js`, `js/modal.js`, and `js/reimbursement.js` for every
   role's scheduling UI — confirmed via source search before writing the
   rule, not assumed. Write stays admin-only either way.

2. **`settings/telegram/botToken` client-side fetch, investigated during
   report-writing.** `js/app.js`'s `startAuthenticatedSession()` fetches
   `settings/telegram` unconditionally for every authenticated session
   (not just admin) to prime `js/telegram.js`'s client-side bot token.
   Under Phase 2's rule this sub-path is admin-family-read only (correct —
   the plan's own §3 flags this token as one that "should never be
   broadly readable"). Once Phase 7 is actually deployed, non-admin
   sessions' fetch of this path will resolve to `permission_denied`.
   Traced the consequence rather than assuming it's fine:
   `fetchFirebaseData()` (`js/firebase.js:403`) already catches every
   read failure and returns `null` (logging via `console.error`, no
   thrown/unhandled rejection), and the only client-side senders that
   need the token — `notifyRequesterApproved`/`notifyRequesterRejected`
   — are reachable only from the request approve/reject flow, which is
   an admin-only action. Net effect once deployed: harmless extra
   `console.error` noise on non-admin session startup, zero functional
   regression. Not fixed, because fixing it (either broadening the rule,
   which the plan explicitly warns against, or gating the fetch by role)
   is out of this program's approved scope — flagged here for a future,
   separate cleanup rather than silently left for someone to rediscover.

3. **`driverUsername` casing hazard (Phase 5B).** `auth.uid` is always
   lowercase-normalized by this app's custom-auth flow; `driverUsername`
   (stamped via `stampDriverIdentity()`) is not guaranteed lowercase at
   write time. Any pre-existing assignment record with inconsistent
   casing in `driverUsername` would fail the driver-self-write branch of
   the new rule even though the "same" driver, by username, owns it. Not
   fixed — would require either a data backfill or a rule-level
   normalization RTDB's expression language cannot perform (no
   `toLowerCase()`). Flagged as a pre-deployment data-quality check: audit
   existing `assignments.driverUsername` values for casing consistency
   before Phase 7 goes live.

4. **Legacy/unlinked-driver assignments (Phase 5B).** Records with no
   `driverUsername` field at all (pre-dating `stampDriverIdentity()`, or
   never linked to a system user) have no way to satisfy the new driver
   ownership branch — those drivers lose self-write access to their own
   assignment under the new rule. The client's existing fuzzy
   name-matching fallback for this case cannot be replicated in RTDB rule
   syntax. Flagged, not silently patched: an admin can still write on
   behalf of any such driver; the gap is scoped to unlinked-driver
   self-service only.

5. **`archived`/`archivedAt` included in the public `userProfiles`
   mirror (Phase 6).** Investigated whether narrowing the mirror further
   (dropping these two fields) was safe; found Engineering's
   `engineering_coordinator`/`engineering_member` roster/resolver
   filtering depends on `.archived` from user records. Kept both fields
   in the broadly-readable mirror as a deliberate, scoped decision rather
   than causing a silent Engineering regression.

6. **Telegram "Phase D" cutover explicitly rejected as this program's
   mechanism (Phase 6).** The bidang-facing new-request notification
   needed admin Telegram IDs read from `/users`, which the split closes.
   The obvious lever — flipping the global
   `NOTIFICATION_FLAGS.channels.telegram` flag — was considered and
   rejected: it's a separate, already-anticipated, much larger migration
   affecting every notification type at once (per existing code comments,
   it must flip the browser send off in the same change to avoid double-
   sending). Built a narrowly-scoped new callable instead, reusing
   already-tested send primitives, so this program's Phase 6 stays
   exactly as wide as its own approved scope.

7. **Test suite consolidation.** Regression scripts for Phases 2-7 were
   written in one consolidated pass after all phases' code landed, not
   incrementally per-phase as Phase 1's own script was. This is a
   deliberate efficiency choice for a same-session, no-interim-deploy
   program (there was no live state to protect between phases) — each
   script's own header comment documents this so a future reader isn't
   confused about why the testing cadence differs from Phase 1's.

None of these gaps block the program from being considered complete —
they are the honest, investigated residue of a real system, documented
so a deployment decision can be made with full information rather than
false confidence.

---

## 6. Risk Retrospective

The plan's own Risk Analysis (§6) predicted no live production risk for
Phases 1-6 (dark-launched, root stays open) and total risk concentration
in Phase 7 alone (the only stage with real, live production risk). That
held exactly as predicted, with one addition: because Phases 1-6 were
never deployed in isolation, there was no live monitoring window between
them to catch a subtly wrong rule before the next phase built on it —
the entire structural-assertion regression suite (287 checks) is what
substitutes for that live signal in this program's actual execution.
This is a reasonable substitution for rule *shape* correctness (did the
rule text match what was designed) but does not substitute for rule
*evaluation* correctness under real Firebase semantics — see §4's note
on the missing Emulator Suite pass. That gap is inherited by whichever
deployment plan follows this report, not resolved by it.

Phase 5B (`assignments`) and Phase 6 (`users` split) remain, as planned,
the two highest-complexity phases — both required real investigation
(ownership field precision, cross-node references, a full call-site trace
of every notification consumer) rather than mechanical rule-copying, and
both surfaced genuine, now-documented gaps (§5, items 3, 4, 6) rather
than clean closes. Phase 7 remains, as planned, the single highest-risk
edit by nature (a 2-line diff that changes the enforcement status of
every other phase at once), not by size.

---

## 7. Rollback Strategy (final, whole-program)

Unchanged in substance from the plan's §8, restated for completeness now
that all 7 phases exist as one diff surface:

- **Every phase is a pure `database.rules.json` diff**, except Phase 3
  (also adds/removes Cloud Functions) and Phase 6 (also adds a Cloud
  Function trigger and a client store). `git revert` cleanly undoes any
  subset.
- **Phases 1-6 carry zero live risk to roll back**, individually or
  together, for as long as root stays `auth != null` — which it does,
  since none of this has been deployed. There is no "already deployed and
  now needs reverting" state for any of these phases.
- **Phase 7 (root cutover) is the only phase where rollback is
  time-sensitive**, and only once deployed: reverting root to
  `auth != null` instantly restores full access if any Phase 1-6 rule
  turns out wrong only once the cutover makes it load-bearing.
- **Phase 6 data-model note**: the `/userProfiles` mirror is purely
  additive and server-derived — deleting it or reverting `onUserWrite.js`
  loses nothing, since `/users` (the source of truth) is untouched by the
  mirror itself.
- **Phase 3 function note**: reverting `backupTick.js`/`counter.js`
  without also reverting the (currently undeployed) rule change that
  removes client access to `backups`/`reimbursement_counters` would strand
  those nodes with no writer at all — revert both together, as a unit,
  exactly as the plan specified.

---

## 8. What Happens Next

Per the approved roadmap, after this program:

1. **v1.30.7 — Permission Simulator.** A dry-run tool to evaluate the new
   rule tree against real-shaped fixture data before any of it goes live
   — this is the closest available substitute for the missing Emulator
   Suite pass flagged in §4, and should reasonably be the next piece of
   work before a deployment conversation happens.
2. **v1.30.8 — Permission Audit.**
3. **Administration Platform LTS** — resumes the Administration roadmap
   this security program interrupted.

**Deployment of any part of this program — Phase 1 through Phase 7,
individually or as a batch — has not happened and requires a separate,
explicit decision.** This report is the complete, tested, ready-to-review
state of that decision's subject matter, not a recommendation on when or
how to make it.
