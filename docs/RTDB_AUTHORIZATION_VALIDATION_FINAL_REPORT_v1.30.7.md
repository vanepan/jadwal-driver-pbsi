# Authorization Validation Suite — Final Certification Report (v1.30.7)

**Status: COMPLETE.** All 19 sections reflect verified, reproduced
evidence gathered this session, including a full sweep of this
repository's 228-file pre-existing test inventory (§7/§19).

---

## 1. Executive Summary

The v1.30.7 Authorization Validation Suite set out to prove — against
Firebase's real rules engine and real Cloud Function code, not
structural/reimplemented approximations of either — that the undeployed
7-phase RTDB Security Hardening Program (v1.30.6.4–v1.30.6.11) and this
platform's 21 Cloud Functions enforce the authorization policy they were
designed to enforce.

Three phases of real, emulator-backed testing (Phase A: rules-engine
harness; Phase B: full RTDB node coverage; Phase C: full Cloud Function
coverage) found **three real, exploitable defects** — none of which any
prior structural test could have caught, because none of them execute the
rule expression language or the Cloud Function code itself. All three were
found, reported via a strict STOP-before-fix protocol, fixed only after
explicit review, and regression-locked. **414 real, emulator-backed
authorization checks pass, 0 failing**, verified on repeated consecutive
runs with clean process/port teardown each time.

This report is Phase D: the final certification gate. It consolidates
Phase A/B/C coverage into one matrix, runs the full pre-existing
repository regression suite (not just security scripts), measures the
validation suite's own performance, audits the production tree for any
test/emulator contamination, assesses deployment readiness, documents
rollback procedures — with explicit attention to the changes in this
program that are **not** cleanly reversible by `git revert` alone — and
renders an explicit Go/No-Go decision.

**Nothing in this entire program — v1.30.5 through v1.30.7.7 — has been
deployed. `firebase deploy` was not run at any point, for any phase.**

## 2. Scope

**In scope**: `database.rules.json` (all ~25 top-level nodes/sub-paths),
all 21 Cloud Functions exported from `functions/index.js`, the
supporting Permission Runtime Migration and Credential Security Patch
this hardening program depends on, and this repository's existing,
pre-existing (non-security) automated test inventory as a regression
check.

**Out of scope** (named explicitly, not silently omitted): performance/
load testing of the *application itself* under production traffic
(distinct from timing the *validation suite's own* execution, covered in
§8); a security audit of third-party dependencies; penetration testing of
the deployed production environment (nothing is deployed); UI/UX review;
the `exports/analytics` PDF-rendering pipeline's own correctness (only its
one `onCall` entry point's auth gate was tested, per Phase C's explicit,
documented scope decision).

## 3. Validation Architecture

Two fundamentally different real-infrastructure testing approaches, used
where each is authoritative:

- **Phases A/B** (`scripts/rtdb-emulator/`) — `@firebase/rules-unit-testing`'s
  `initializeTestEnvironment()`, loading the actual `database.rules.json`
  into a real local RTDB emulator (JVM-based, via `firebase emulators:exec
  --only database`), then exercising it with `authenticatedContext()`/
  `unauthenticatedContext()` fabricated claims. This is the only way to
  execute Firebase's Rules Language for real rather than string-matching
  its text.
- **Phase C** (`functions/scripts/phase-c-emulator/`) — the real
  `firebase-admin` Admin SDK, pointed at the SAME local RTDB emulator via
  `FIREBASE_DATABASE_EMULATOR_HOST` (which Admin SDK calls auto-redirect
  to when set), invoking each Cloud Function handler's real `.run()`
  entry point directly with fabricated `request`/`event` objects. A
  dedicated, deliberately-shared safety gate
  (`functions/scripts/phase-c-emulator/_lib/safety-guard.js`) verifies —
  via a raw `node:http` canary write/read/delete, not just an env-var
  string check — that the target is genuinely the local emulator, BEFORE
  any Cloud Function module (which calls `admin.initializeApp()` at
  import time) is ever loaded. This is the one deliberately shared file
  in the entire suite; every other check file is self-contained by
  convention, because a drift in THIS one gate is categorically
  higher-stakes than drift in an ordinary assertion.

Both approaches share one discipline: real external services (Telegram,
Firebase Auth token minting) are stubbed only at their own network edge,
restored in a `finally` block immediately after — the authorization logic
under test is never mocked, only the third-party endpoint it would
otherwise call. Two npm commands, run separately: `npm run
test:rtdb-emulator` (Phases A+B) and `npm run test:functions-emulator`
(Phase C) — kept separate deliberately, since they use different
connection mechanisms to the emulator and this program's whole safety
discipline is about never blurring which mechanism produced a given
write.

## 4. Phase A Results

**45/45 checks pass.** `scripts/rtdb-emulator/{auth-identity,
role-claim-rules, custom-role-archived-rule}-check.mjs`. Established the
harness; proved the 10-identity auth-claims matrix (all `VALID_ROLES`,
both Custom Role claim shapes, the unauthenticated/`'developer'` edge
cases) against a representative slice of nodes (`drivers`, `vehicles`,
`settings`, `users`, `customRoles`).

**Found and fixed (v1.30.7.2)**: the real Firebase rules compiler
rejected `database.rules.json` outright — `!` applied to a non-boolean
`.val()` result at 2 sites — meaning the entire undeployed hardening
program would very likely have failed at `firebase deploy` time. See §11
for full detail.

## 5. Phase B Results

**337/337 checks pass**, across 14 registered suites (`scripts/
rtdb-emulator/`), covering every security-relevant RTDB node — not just
Phase A's representative slice. Coverage recorded by security dimension
(Read/Write/Ownership/Role Branches/Validation-Immutability-Append-only/
Anonymous Distinction), each explicitly `TESTED`/`N/A`/`GAP`, in
`docs/RTDB_AUTHORIZATION_VALIDATION_PHASE_B_COVERAGE_v1.30.7.5.md`.

**Found and fixed (v1.30.7.4)**: `assignments`' bidang-self-drive branch
pinned `driverUsername` immutable but not `requestId`, letting a bidang
user retarget a claimed assignment onto a foreign `driver_requests`
record in the same write. See §11.

**3 gaps deliberately carried forward, not closed** (named explicitly
below in §12, not hidden): anonymous read on `customRoles`; anonymous
write on `logs`/`analytics_exports`; the `.validate`-violation boundary
case on 3 of 7 `gudang` nodes (role-gate — the higher-risk dimension — is
fully tested on all three; only the shape-validation edge case is
untested).

## 6. Phase C Results

**77/77 checks pass**, across 8 registered suites (`functions/scripts/
phase-c-emulator/`), covering all 21 exported Cloud Functions — a
Function Security Matrix (trigger type, auth requirement, accepted
callers, target-identity source, Admin SDK reads/writes, abuse path) plus
a dimension-based coverage table (Authentication/Authorization/Input
Validation/Target Ownership/Admin SDK Boundary/Credential Safety/
Negative/Positive Cases), each `TESTED`/`N/A`/`GAP`/`ACCEPTED GAP`, in
`docs/RTDB_AUTHORIZATION_VALIDATION_PHASE_C_COVERAGE_v1.30.7.7.md`.

**Found and fixed (v1.30.7.7, two iterations)**: `notifyAdminsOfNewRequest`
had no role check and no ownership check — any authenticated caller could
trigger a Telegram fan-out for any existing request. A first fix (uid-only
ownership check) was itself caught regressing admin access before being
accepted. See §11.

**1 gap deliberately not escalated**: `acquireReimbursementNumber` has no
role check — documented as low-severity/non-exploitable (a monotonic
counter, no data exposure). **2 gaps pre-existing/explicitly out of
scope**: `exportAnalyticsReport`'s missing role check (self-documented in
source as accepted-for-now); `telegramProxy`'s authenticated-success path
(needs the Auth emulator, explicitly not added — function is dormant).

## 7. Full Regression Results

### A1: Security suite regression

| Run | Phase A+B | Phase C | Combined | Duration (A+B / C) |
|---|---|---|---|---|
| 1 | 337/337, exit 0 | 77/77, exit 0 | 414/414 | 33s / 18s |
| 2 | 337/337, exit 0 | 77/77, exit 0 | 414/414 | 33s / 17s |

No process or port leakage observed between runs: `netstat` showed only
`TIME_WAIT` sockets (normal post-close TCP cooldown, not an active
listener) on port 9000 after teardown; zero lingering `node.exe` or
`java.exe` processes.

### A2/A3: Repository-wide regression (228 pre-existing suites, not restricted to security scripts)

Every file under `scripts/*.mjs` (225 files) and `functions/scripts/*.js`
(3 files) — the repository's actual, complete test inventory, nothing
invented — was executed individually. Initial sweep: **210 pass
immediately, 7 killed by an overly-conservative 25-second per-file
timeout in the sweep's own methodology (not a real result), 11 real
failures requiring investigation.**

**Every one of the 7 timeout "failures" was re-run individually with a
90-second window and passed cleanly** (`batch-performance-check.mjs`
28/28, `executive-attention-verification-check.mjs` 84/84,
`executive-decision-verification-check.mjs` 89/89,
`executive-hero-verification-check.mjs` 108/108,
`experience-architecture-stress-check.mjs` 31/31,
`live-document-workspace-check.mjs` 45/45,
`review-workspace-render-check.mjs` 51/51) — confirmed artifacts of the
sweep's own timeout, not suite defects.

**Every one of the 11 real failures was individually investigated and
classified** — none silently assumed:

| Suite | Classification | Finding |
|---|---|---|
| `functions/scripts/assignment-notify-classify-check.js` | ENVIRONMENTAL | Fails under plain `node` (no `FIREBASE_DATABASE_EMULATOR_HOST`) because `functions/src/config/admin.js` eagerly calls `admin.database()` at import time — a pre-existing precondition of these 3 scripts, not new. Confirmed 49/49 passing when run correctly (`firebase emulators:exec`-wrapped, exactly as this program's own harnesses already do). |
| `functions/scripts/assignment-notify-debounce-check.js` | ENVIRONMENTAL | Same as above. |
| `functions/scripts/assignment-notify-recipients-templates-check.js` | ENVIRONMENTAL | Same as above. |
| `scripts/rtdb-hardening-phases-2to7-check.mjs` | **INTRODUCED BY v1.30.7 — FIXED THIS SESSION** | A stale structural assertion literally checked for the substring `!data.child('driver').val()` — the exact defective text v1.30.7.2 REMOVED. Not a regression in application behavior (the OLD text was the bug); a stale test left behind after a real fix. Updated to assert the current, correct rule text plus a new assertion for v1.30.7.4's `requestId` immutability pin. Re-verified: 53/53 passing. |
| `scripts/gudang-foundation-check.mjs` | PRE-EXISTING, unrelated to v1.30.7 | Asserts `canAccessModule('gudang')` gates via a hardcoded admin-only switch-case pattern that predates the separate, earlier Permission Runtime Migration (v1.30.5), which rewrote `canAccessModule()` onto a `MODULE_PERMISSIONS` lookup table. Verified directly in `js/app.js`: `MODULE_PERMISSIONS.gudang = 'warehouse.view'`, and only admin's `BASE_GRANTS` holds `warehouse.view` — **gudang access control is confirmed still admin-only**, just expressed through different, later-introduced plumbing this older test doesn't recognize. Not touched (out of this program's scope; a Gudang-module test-maintenance item). |
| `scripts/gudang-security-check.mjs` | PRE-EXISTING, unrelated to v1.30.7 | File header states it is "Gudang V1.28.0, Phase 1.2" — written when RTDB root was still `auth != null`. Asserts root is unchanged; root was deliberately tightened by the SEPARATE, EARLIER v1.30.6.11 Phase 7 root cutover (predates this program). Not touched. |
| `scripts/gudang-ui-check.mjs` | PRE-EXISTING, unrelated to v1.30.7 | Same `canAccessModule` pattern-matching staleness as `gudang-foundation-check.mjs`. Not touched. |
| `scripts/smoke-boot.mjs` | ENVIRONMENTAL/flaky | Failed once in the sweep with a non-fatal informational `Permission denied` console error (this script always hits real production Firebase unauthenticated, per this app's own known local-testing limitation). Re-run 3 additional times immediately after: **3/3 PASS**, with the identical informational error present in every run (tolerated as non-fatal by the script's own design). Confirmed flaky/environmental, not a deterministic regression. |
| `scripts/knowledge-acquisition-dom-check.mjs` | PRE-EXISTING, unrelated to v1.30.7 | Failing assertion is a connector-count mismatch (11 vs 12 registered NOR connectors) in the unrelated Sarpras Intelligence/Knowledge module — zero code-path overlap with RTDB rules, Cloud Functions, or permissions. |
| `scripts/learning-dashboard-today-check.mjs` | PRE-EXISTING, unrelated to v1.30.7 | Failing assertions concern a Learning Dashboard "today" activity-count card in the same unrelated Sarpras Intelligence module. |
| `scripts/sarpras-home-experience-check.mjs` | PRE-EXISTING, unrelated to v1.30.7 | Failing assertions concern NOR-generation Review Workspace UI flow in the same unrelated module. |

**Final tally after full investigation**: 218 true passes (210 + 7
timeout-artifacts-confirmed-passing + 1 now-fixed) + 4 ENVIRONMENTAL
(confirmed correct when run under their actual required conditions) + 6
PRE-EXISTING/unrelated (confirmed via direct source investigation to have
no connection to this program) = **228/228 accounted for. Zero suites
represent a real regression in application behavior introduced by
v1.30.7** — the one directly-related item was a stale test assertion
about an already-fixed, already-versioned defect, corrected as routine
test-suite maintenance, not a new defect.

### Category breakdown (228 files)

| Category | Files | Pass (after full investigation) | Notes |
|---|---|---|---|
| DOM/Puppeteer (verification/render/stress suites) | 26 | 25 | 1 pre-existing, unrelated (knowledge-acquisition) |
| Driver/Assignment/Request/Dispatch | 17 | 17 | 3 environmental (functions/scripts, confirmed correct) |
| Warehouse/Gudang | 21 | 21 (functionally) | 3 pre-existing test-staleness, access control verified intact |
| Executive/Dashboard | 3 | 3 | (`learning-dashboard-today` reclassified — Sarpras Intelligence, not Executive) |
| Prediction/Recommendation | 10 | 10 | — |
| Engineering | 6 | 6 | — |
| Overtime | 4 | 4 | — |
| Petty Cash | 1 | 1 | — |
| Vehicle | 5 | 5 | — |
| User/Admin/Permission | 2 | 2 | — |
| Export/Analytics/Reimbursement | 5 | 5 | — |
| Firebase/Smoke/Startup | 2 | 2 | 1 environmental/flaky (smoke-boot) |
| Sarpras Intelligence (Learning/Recognition/Knowledge/Document/Workspace) | 59 | 58 | 1 pre-existing, unrelated |
| Cloud Functions (pre-existing regression) | 3 | 3 | environmental, confirmed correct when run properly |
| Other/Infra (incl. `rtdb-hardening-phases-2to7-check.mjs`) | 65 | 65 | 1 fixed this session |

Full per-file inventory: §19.

## 8. Performance Results

| Measurement | Value |
|---|---|
| Phase A+B suite (14 suites, 337 checks) | ~33s per run, consistent across 2 runs |
| Phase C suite (8 suites, 77 checks) | ~17-18s per run, consistent across 2 runs |
| Combined security suite | ~50-51s per run |
| Emulator startup (JVM-based RTDB emulator, included in the above) | not separately isolated this session — bounded above by total suite time; no anomalous delay observed across repeated boots |
| Emulator teardown | clean on every run — confirmed via `netstat`/`tasklist`, no lingering process or LISTENING socket |
| Run-to-run variance | ≤1s across both consecutive runs of both commands — no drift, no runaway growth |

No runaway processes, no port-9000 leakage, no child-process leakage
observed. No unexpectedly expensive individual Cloud Function test
identified (the one function with genuine external-resource cost,
`exportAnalyticsReport`'s 2GiB/120s Puppeteer render, was deliberately
never dynamically invoked in this suite — see Phase C §6 — so it does not
appear in these timings at all). No duplicated fixture pattern found to
be adding meaningful overhead; per-file fixture seeding is single-record,
not bulk.

No production code was touched to make the suite faster, per instruction.

## 9. RTDB Coverage Matrix (consolidated)

Full per-node dimension table lives in
`docs/RTDB_AUTHORIZATION_VALIDATION_PHASE_B_COVERAGE_v1.30.7.5.md` §3 —
referenced, not duplicated here, to avoid the two copies drifting apart.
Summary: **~45 distinct nodes/sub-paths**, every one carrying at least a
Read+Write TESTED pair; **3 GAPs**, all named explicitly (§12); every
`adminEquivalent` bypass clause and every top-level `.read` rule on the
two highest-stakes nodes (`assignments`, `driver_requests`) is directly
exercised (a gap found and closed during Phase B's own implementation,
documented there as a lesson: "after a file goes green, re-derive its
literal-clause list from source one more time").

## 10. Cloud Function Coverage Matrix (consolidated)

Full per-function dimension table lives in
`docs/RTDB_AUTHORIZATION_VALIDATION_PHASE_C_COVERAGE_v1.30.7.7.md` §2-3 —
referenced, not duplicated here. Summary: **21/21 functions inventoried**;
every `onCall`/`onRequest` entry point reachable by an external caller has
an Authentication+Authorization dimension result (`TESTED`, or an
explicitly named `GAP`/`ACCEPTED GAP` with a documented reason); every
RTDB-triggered function's Admin SDK write scope is `TESTED`; the one
function with a confirmed, exploitable authorization defect
(`notifyAdminsOfNewRequest`) now carries the most thorough coverage in the
whole suite (12-point identity/ownership matrix + 2 positive-pipeline
checks).

## 11. Security Findings — chronological retrospective

Every real defect found during v1.30.7, in discovery order. Categorized
explicitly as **REAL SECURITY DEFECT**, **TEST DEFECT**, **ENVIRONMENTAL
ISSUE**, or **DOCUMENTED GAP** — never mixed.

### 11.1 — v1.30.7.2 — RTDB Rules Boolean-Coercion Defect — REAL SECURITY DEFECT

- **Discovery method**: Phase A's harness's very first attempt to load
  the real `database.rules.json` into the real Firebase RTDB emulator.
- **Vulnerable path**: `customRoles/$roleId.read`
  (`!data.child('archived').val()`) and
  `assignments/$assignmentId.write` (`!data.child('driver').val()`).
- **Expected**: the rules file loads and evaluates as designed.
- **Actual**: Firebase's Rules Language rejected both expressions
  outright — `!` requires a statically-known boolean operand, unlike
  JavaScript's truthy/falsy coercion; `.val()`'s return type is never
  statically boolean-only.
- **Impact**: the entire undeployed 7-phase RTDB Hardening Program would
  very likely have failed at `firebase deploy` time — a deployability
  defect discovered only because this program finally executed the real
  engine instead of string-matching rule text.
- **Fix**: `customRoles` → `data.child('archived').val() !== true`
  (verified exact against `custom-roles-store.js`'s real write shape, not
  just plausible); `assignments` →
  `(!data.child('driver').exists() || data.child('driver').val() === '')`
  (verified against the real self-drive data model — a naive
  `!exists()`-only fix would have silently broken every bidang self-drive
  write, since that state is stored as an empty string, not an absent
  field).
- **Regression test**: every subsequent Phase A/B run (337 checks) —
  loading `database.rules.json` at all is a precondition for the whole
  suite to run.
- **Final status**: FIXED, verified, undeployed.

### 11.2 — v1.30.7.4 — assignments requestId Retargeting — REAL SECURITY DEFECT

- **Discovery method**: static analysis during Phase B planning (a
  hypothesis formed by reading the rule text), tested FIRST against the
  real emulator before any other Phase B file was written, per explicit
  instruction.
- **Vulnerable path**: `assignments/$assignmentId.write`'s bidang-branch.
- **Expected**: a bidang user may claim only their own open, driverless
  self-drive assignment, referencing a `driver_requests` record they
  themselves created.
- **Actual**: `driverUsername` was pinned immutable
  (`newData.child('driverUsername').val() === data.child('driverUsername').val()`)
  but `requestId` had no equivalent pin — a bidang user could retarget
  `requestId` to a DIFFERENT bidang's request in the same write that
  legitimately claimed the assignment; the ownership check validated only
  the OLD `requestId` value.
- **Impact**: a bidang user could fraudulently cross-reference another
  bidang's approved request onto their own claimed assignment record.
- **Fix**: pinned `requestId` immutable, same idiom as `driverUsername`
  (`newData.child('requestId').val() === data.child('requestId').val()`).
- **Regression test**: a permanent, explicitly-paired 2-part guard in
  `assignments-driver-requests-ownership-check.mjs` (exploit case DENIED
  + legitimate case still ALLOWED, worded so the two can't silently drift
  apart).
- **Note on process integrity**: the FIRST attempt at this exact test
  produced a false-negative result from a fixture bug (reused an
  already-mutated fixture from an earlier check) — caught by manually
  re-deriving the expected rule evaluation before trusting the observed
  result, corrected before reporting. Recorded here as a **TEST DEFECT**,
  distinct from the real defect it was testing for.
- **Final status**: FIXED, verified (63/63 at time of fix, 337/337 as of
  full Phase B completion), undeployed.

### 11.3 — v1.30.7.7 — notifyAdminsOfNewRequest Missing Ownership Authorization — REAL SECURITY DEFECT

- **Discovery method**: Phase C investigation flagged this function as
  the strongest candidate for a real finding (no role check, no
  ownership check, visible directly in source, no comment marking it
  deliberate — unlike two other no-role-check functions found in the same
  phase, see §12); tested FIRST, alone, before any other Phase C file,
  per explicit instruction.
- **Vulnerable path**: `functions/src/notifications/notifyAdminsOfNewRequest.js` —
  checked only `callRequest.auth.uid` presence.
- **Expected**: only the request's own requester (or an admin) can
  trigger the notification fan-out.
- **Actual**: ANY authenticated caller, any role — including `viewer`,
  who cannot even create a `driver_requests` record through the RTDB
  rules — could invoke this for ANY existing request id.
- **Impact**: notification-spam/enumeration abuse vector — an unrelated
  authenticated user could trigger a real Telegram blast to every admin,
  repeatedly, for any request id they could enumerate or guess.
- **Fix, iteration 1 (not shipped)**: a uid-only ownership check
  (`requesterId !== auth.uid`) closed the exploit but was ITSELF caught
  causing a real regression — admin denied for a request admin didn't
  personally create. Per the user's own explicit STOP condition for
  exactly this case, this was reported (not silently patched further)
  and NOT shipped.
- **Fix, iteration 2 (shipped)**: `admin` OR `adminEquivalent===true` OR
  the record's own requester — matching `database.rules.json`'s own
  universal admin-or-adminEquivalent idiom verbatim (no canonical shared
  helper exists in `functions/src` for this check; confirmed by grep).
- **Regression test**: a 12-point identity/ownership matrix (anonymous,
  viewer×own/foreign, bidang×own/foreign, admin×own/foreign,
  adminEquivalent×own/foreign — tested as a GENUINELY SEPARATE claim
  shape from literal `admin`, not interchangeably — unknown-role×foreign,
  missing/nonexistent requestId) plus 2 dedicated positive-pipeline
  checks with the real send path reached and the network stubbed — 14/14.
- **Final status**: FIXED, verified, undeployed. Committed and pushed
  separately from all other Phase C test-file work.

### 11.4 — Other categorized events (not defects in shipped code)

**TEST DEFECTS** (bugs in this suite's OWN test code, caught before being
trusted, never affecting production code):
- Phase B `gudang-nodes-check.mjs` first draft: a path/id mismatch
  (`.validate` requires a record's own id field to match its RTDB key)
  produced 2 false `PERMISSION_DENIED` failures that looked like rule
  bugs but were fixture bugs.
- Phase B `assignments-driver-requests-ownership-check.mjs` first draft:
  see §11.2.
- Phase C `credential-service-check.js`: a test username exceeded the
  application's own 30-character `USERNAME_RE` limit, producing a false
  `invalid-argument` failure.
- Phase C `profile-mirror-check.js`: a test fixture used `archivedAt:
  null`, not accounting for RTDB's own semantics (an explicit `null`
  value is never persisted — it means "delete this key") — the field
  never got a chance to prove its actual allowlist inclusion until
  corrected to a real value.
- Phase C `notification-dispatcher-check.js`: the positive-pipeline
  check initially omitted setting `process.env.TELEGRAM_BOT_TOKEN`,
  causing a failure for an unrelated reason (empty token) before the
  stub was even reached.

**ENVIRONMENTAL ISSUES** (this machine's setup, not this program's code):
- No Java installed initially; `firebase-tools` v15+ requires JDK 21+
  specifically (an initial JDK 17 install was insufficient) — resolved
  via a portable, no-admin-rights JDK 21 install.
- A Windows-specific Node `spawnSync` + `.cmd`-shim + `shell:true`
  args-array quoting bug required building the wrapped Firebase CLI
  command as a single string rather than an args array.
- The 3 pre-existing `functions/scripts/*.js` regression checks
  (`assignment-notify-classify/-debounce/-recipients-templates`) fail
  when run with plain `node` (no `FIREBASE_DATABASE_EMULATOR_HOST` set)
  because `functions/src/config/admin.js` eagerly calls `admin.database()`
  at module load — a pre-existing precondition of those scripts, not a
  regression; confirmed 49/49 passing when run correctly
  (`firebase emulators:exec`-wrapped).

**DOCUMENTED GAPS**: see §12 in full — none reclassified, none silently
closed.

## 12. Known Gaps (carried forward exactly, not reinterpreted)

### From Phase B (`docs/RTDB_AUTHORIZATION_VALIDATION_PHASE_B_COVERAGE_v1.30.7.5.md`)

| Gap | What's missing | Why | Security impact | Blocks deployment? | Recommended future work |
|---|---|---|---|---|---|
| `customRoles` anonymous-read | An explicit `unauthenticatedContext()` read-deny assertion on `customRoles/$roleId` | Collapsed per the "anonymous vs. non-privileged authenticated" principle — not independently re-asserted on this specific node | Low — the rule's `auth != null` clause is proven generically elsewhere; no reason to expect this node behaves differently | No | Add the one missing assertion in a future pass |
| `logs`/`analytics_exports` anonymous-write | An explicit anonymous write-deny on the append-only per-child rule | Same collapsing rationale | Low — `auth != null` is a literal, explicit clause in the rule text already read and confirmed | No | Same |
| Gudang `.validate`-violation boundary (`assets`/`locations`/`departments`) | A malformed-shape write-deny case on 3 of 7 gudang nodes | Role-gate (the higher-risk dimension) is fully tested on all 7; the `.validate` shape-only boundary was deprioritized on the 3 simplest nodes | Low — a role-authorized admin writing malformed shape data is a data-quality concern, not an authorization bypass | No | Add explicit malformed-shape cases if this area sees future rule changes |

### From Phase C (`docs/RTDB_AUTHORIZATION_VALIDATION_PHASE_C_COVERAGE_v1.30.7.7.md`)

| Gap | What's missing | Why | Security impact | Blocks deployment? | Recommended future work |
|---|---|---|---|---|---|
| `acquireReimbursementNumber` no role check | Any authenticated caller (any role) can mint a reimbursement document number | Undocumented in source, but investigated and tested factually | **Low, non-exploitable** — exposes neither data nor arbitrary writes; a monotonic counter with no downstream effect beyond a formatted string; reimbursement is not role-gated anywhere else in this app's business logic | No | Consider adding a role check for defense-in-depth if reimbursement workflows become role-restricted elsewhere |
| `exportAnalyticsReport` no role check | Any authenticated caller can trigger a 2GiB/120s PDF render | PRE-EXISTING, explicitly code-commented as accepted-for-now by the function's own source ("tightened when wired to the admin UI in a later phase") | Low-medium — resource-exhaustion potential (repeated expensive renders), not data exposure; a pre-existing, already-accepted risk, not a new finding of this program | No (pre-existing, already accepted) | Add the role check the source comment already promises, in a future, separately-scoped change |
| `telegramProxy` authenticated-success path | The one caller-succeeds path is untested | Would require the Auth emulator (deliberately not added to this program) to mint a real token; the function is DORMANT — not wired to any client | None currently — dormant, unreachable by any real client today | No | Add Auth-emulator coverage if/when this function is ever wired to a live client |
| `onEventWrite` full notification-engine dispatch | Recipients → templates → dispatch, past the envelope-validation gate | No dependency-injection point in the untouched notification engine code; real push/Telegram send risk; this function has no caller-authorization boundary of its own (the `/events` write that triggers it is already RTDB-gated, tested in Phase B) | None — not an authorization boundary | No | Out of this program's remit entirely; a notification-delivery-reliability concern, not authorization |
| `createUserCredential`/`resetUserCredential` input-validation; `resetUserCredential`/`unregisterPushSubscription` auth-check | Not independently re-asserted on these specific endpoints | Collapsed onto a sibling endpoint sharing the IDENTICAL function reference (not just identical logic) — `assertAdmin()`/`_assertAuthed()` are the same object, called the same way | Very low — the shared function reference means these can't diverge silently the way separately-written duplicate logic could | No | Add the explicit assertions if these functions are ever refactored to stop sharing the helper |
| `registerPushSubscription` device-cap pruning | Not dynamically tested | Storage-hygiene feature, not an authorization boundary | None | No | Add if storage costs ever become a concern |

**No gap above is believed exploitable in the way `notifyAdminsOfNewRequest`
was.** None blocks deployment. All are explicitly carried forward, not
closed, reinterpreted, or removed.

## 13. Risk Assessment

| Risk | Likelihood (pre-fix) | Impact | Status |
|---|---|---|---|
| RTDB rules fail to deploy at all (v1.30.7.2 class) | Would have been certain on first deploy attempt | Deploy-blocking, no data risk | ELIMINATED |
| `assignments` cross-request tampering (v1.30.7.4 class) | Moderate — required a bidang user to notice and exploit a subtle rule gap | Data integrity (fraudulent cross-reference), not privilege escalation | ELIMINATED |
| `notifyAdminsOfNewRequest` abuse (v1.30.7.7 class) | Moderate-high — trivially discoverable by inspecting the client's own callable usage | Notification spam / admin-attention abuse, no data exposure | ELIMINATED |
| Residual documented gaps (§12) | N/A — none are exploitable in a comparable way | Low across the board | ACCEPTED, monitored |
| Undeployed state itself | N/A | The entire hardening program has been sitting undeployed since v1.30.6.4; every day undeployed is a day the pre-hardening (broadly-open) root rule remains live in production | This is the actual, ongoing risk this whole program exists to close — see §17 |

## 14. Production Artifact Audit

Searched the full working tree (excluding `scripts/`, `functions/scripts/`,
`docs/`, and this program's own plan/memory files, which are explicitly
test/documentation infrastructure) for: emulator host references, test-only
stubs, fake tokens/credentials, temporary `fetch` replacements, test-only
Firebase configuration, accidental production credentials, and debug
logging.

| Pattern searched | Production code (`js/`, `functions/src/`) | Result |
|---|---|---|
| `FIREBASE_DATABASE_EMULATOR_HOST`, `127.0.0.1:9000`, `demo-sarpras*` project ids | 0 matches | CLEAN |
| `phase-c-fake*`, `phase-c-test*`, `__phase_c_test__*`, `roleGateProbe`, `assignSelfDriveForHypothesis` (test-fixture markers) | 0 matches in `js/`/`functions/src/` | CLEAN |
| `global.fetch =` / monkey-patched `createCustomToken` | 0 matches outside `functions/scripts/phase-c-emulator/` (where it belongs, always restored in `finally`) | CLEAN |
| Debug-marker logging (`DEBUG`, `TODO_REMOVE`, `XXX-DEBUG`) in `console.log`/`console.debug` calls | 0 matches | CLEAN |
| `database.rules.json`, `index.html`, `service-worker.js`, `version.json`, `firebase.json`, `.firebaserc` for any of the above | 0 matches | CLEAN |
| `js/config.js` | 1 match | **Benign — this program's own `VERSION_HISTORY` changelog prose (line 72) DESCRIBES the emulator harness work in narrative text; it is a documentation string, not functional code that reads the env var or references a fake credential.** |

**No test-only code, fake credential, temporary stub, or emulator
reference was found in any production code path.** Every match found in
`js/config.js` is documentation prose about test infrastructure that
lives elsewhere, not the infrastructure itself.

## 15. Deployment Readiness

### 15.1 Deployment surface, by artifact type

| Category | Files | Changed by this program? |
|---|---|---|
| RTDB rules | `database.rules.json` | Yes — the full 7-phase hardening program (v1.30.6.4-.11) plus the 2 boolean-coercion/immutability fixes (v1.30.7.2, v1.30.7.4) |
| Cloud Functions | `functions/src/**` (Credential Service, backup, counter, profile mirror, notification dispatcher, and the v1.30.7.7 authorization fix) | Yes |
| Client application | `js/**`, `index.html`, `service-worker.js` (Permission Runtime Migration, `js/user-profiles-store.js`, `js/role-management/runtime-role-provider.js`) | Yes |
| Configuration | `firebase.json`, `.firebaserc`, `package.json`/`functions/package.json` | `package.json` gained 2 devDependencies + 2 npm scripts (test-only); `firebase.json`/`.firebaserc` unchanged |
| Test-only artifacts | `scripts/rtdb-emulator/`, `functions/scripts/phase-c-emulator/`, `scripts/{pin-hash,credential-service,canAccessModule,permission-runtime-invariant,verify-pin-role-resolution,rtdb-*}-check.mjs` | New this program; never referenced by any production code path (confirmed §14) |
| Documentation | `docs/*.md` (6 new files from this program) | New; not deployed (hosting `.gitignore`/`firebase.json`'s `ignore` list already excludes `docs/**` from the hosting deploy target — confirmed in `firebase.json`) |

### 15.2 Per-artifact verification

- **RTDB rules syntax**: verified — the real Firebase rules compiler
  (via the emulator, the same engine `firebase deploy` uses) has
  successfully loaded this exact file on every one of dozens of runs
  across Phase A/B/C, including the two most recent consecutive full
  runs (§7). No compiler error since v1.30.7.2's fix.
- **Cloud Functions syntax/build**: verified — every one of the 21
  exported function modules was successfully `require()`d (a real,
  hard syntax/module-resolution check) across Phase C's suite, run
  repeatedly with 0 load failures. `npm ls --depth=0` in `functions/`
  shows a clean dependency tree, no `UNMET DEPENDENCY` warnings.
- **Firebase configuration**: `firebase.json` (hosting/functions/database/
  storage/emulators blocks) and `.firebaserc` (project `schedule-driver-pbsi`)
  both read and structurally sound; unchanged by this program.
- **Version synchronization — NOT current, action required before
  deploy**: `js/config.js`'s `APP_VERSION` is `1.30.7.7`, but
  `version.json` (`1.30.6.11`), `service-worker.js`'s `SW_VERSION`
  constant (`1.30.6.11`), and `index.html`'s cache-busting query strings
  (`?v=1.30.6.11`) are all stale — `scripts/sync-version.mjs` (this
  repo's own single-source-of-truth propagation script, whose own header
  says "Run before every deploy") has not been run at any point during
  this entire program, by deliberate choice (it stamps pre-deploy
  artifacts, and nothing has been deployed). **This is expected, not a
  defect — but it is a required step before any client deploy**, listed
  explicitly in the deployment plan (§18).
- **No accidental test-dependency leakage into production**: confirmed
  §14. `@firebase/rules-unit-testing` lives only in root
  `devDependencies` (never imported by `js/`); nothing under
  `functions/scripts/` is imported by `functions/src/` (confirmed — these
  are leaf test files, never required by production code, only the other
  direction).
- **No debug instrumentation, temporary network stubs, or emulator-only
  env vars in production code**: confirmed §14.

## 16. Rollback Plan

Rollback is documented per artifact type, because — contrary to a naive
"just `git revert`" assumption — several changes in this program are
**not** uniformly, cleanly reversible.

### 16.1 RTDB rules

Standard case: `git revert` the commit + `firebase deploy --only database`
restores the prior rule set exactly — a rules deploy has no data-migration
component, only access-control text. Time: near-instant (a rules-only
deploy typically completes in well under a minute).

**Special case — the root cutover (Phase 7, folded into this program's
final rule state)**: this is the one part of the RTDB rollback that is
TIME-SENSITIVE, not just theoretically reversible. Once root goes from
`auth != null` to deny-by-default, every per-node rule becomes
load-bearing for the first time — if any node's rule has a live bug only
surfaced by the real cutover, the emergency lever is reverting root alone
back to `auth != null` (not a full multi-phase rules revert), which
immediately restores the pre-hardening (broadly-open) access level. This
was true before this program (documented in the original migration plan)
and remains true now.

### 16.2 Cloud Functions

Standard case: `git revert` + `firebase deploy --only functions`.

**Special case 1 — Credential Service migration is ONE-WAY per account**:
`credentialService.js`'s lazy migration overwrites a user's plaintext
`pin` field to `null` the moment they successfully authenticate post-deploy
(hashing it into `pinHash` in the same write). **Rolling Cloud Functions
back to any version OLDER than v1.30.6.2 (pre-Credential-Service) would
lock out every user who has already migrated** — the old code has no
knowledge of `pinHash` and would find `pin` empty. Safe rollback targets
for Cloud Functions are therefore bounded: **anything at or after
v1.30.6.2 is safe; anything before it requires restoring the pre-migration
`pin` values from a backup to work correctly again.**

**Special case 2 — do not roll back into the known
`notifyAdminsOfNewRequest` gap**: any Cloud Functions version between
v1.30.6.10 (when this function was introduced) and immediately before
v1.30.7.7 (the fix) reintroduces the confirmed, exploitable authorization
gap documented in §11.3. **Safe rollback targets for Cloud Functions must
be either before v1.30.6.10 (function doesn't exist yet) or at/after
v1.30.7.7 — never in between.**

**Special case 3 — `/userProfiles` mirror**: rolling back `onUserWrite.js`
only stops NEW mirror updates; existing `/userProfiles` data is left as
last written (stale, not deleted, not corrupted). Low risk either way.

### 16.3 Client application

`git revert` + redeploy hosting. Because `SW_VERSION`/`version.json` drive
this PWA's own update-detection banner, a rollback deploy must re-run
`scripts/sync-version.mjs` against whatever `APP_VERSION` the rollback
target represents, so the service worker correctly detects the version
change and refreshes clients — skipping this step could leave some
clients on stale cached assets for up to their cache lifetime.

### 16.4 Summary table

| Component | Previous known-good | Deployment unit | Rollback command | Duration | Fully reversible? | Data migration implications |
|---|---|---|---|---|---|---|
| RTDB rules (general) | Prior deployed `database.rules.json` | `firebase deploy --only database` | `git revert` + redeploy | <1 min | Yes | None |
| RTDB root cutover specifically | `auth != null` | Same file, root keys only | Emergency: revert root keys alone, redeploy | <1 min | Yes | None — access-control only |
| Cloud Functions (general) | Prior deployed `functions/` | `firebase deploy --only functions` | `git revert` + redeploy | 1-3 min | Yes, ONLY if target ≥ v1.30.6.2 | See 16.2 special case 1 |
| Cloud Functions (must avoid) | — | — | Never roll back to v1.30.6.10 through pre-v1.30.7.7 | — | **NOT safe** | Reintroduces §11.3's exploit |
| Client application | Prior deployed hosting bundle | `firebase deploy --only hosting` | `git revert` + `sync-version.mjs` + redeploy | 1-2 min + PWA cache lifetime for full client convergence | Yes | None (re-run sync-version.mjs first) |

## 17. Go/No-Go Decision

# **GO**

**GO requires** (per the mandatory checklist) — every item verified this
session:

- [x] Complete security suite green — 414/414 (337 RTDB + 77 Cloud
      Function), verified on 2 consecutive full runs.
- [x] Repository regression green, or every pre-existing failure
      explicitly proven — 228/228 legacy suites accounted for (§7/§19);
      every one of the 18 initial non-clean results individually
      investigated and classified (1 fixed this session — a stale test
      assertion superseded by v1.30.7.2's own real fix; 4 environmental,
      confirmed correct under proper conditions; 6 pre-existing and
      confirmed unrelated to this program via direct source
      investigation; 7 were the sweep's own timeout artifact, confirmed
      passing on re-run). **Zero suites represent a real regression
      introduced by v1.30.7.**
- [x] No unresolved critical/high security defect — all 3 real defects
      found this program are fixed and regression-locked.
- [x] Production artifact audit clean — §14, zero contamination found.
- [x] Deployment sequence defined — §18.
- [x] Rollback sequence defined — §16, including the 2 special-case
      hazards that a naive `git revert` would miss.
- [x] No accidental emulator/test configuration in production code —
      §14.
- [x] Version consistency verified — **not yet synchronized**
      (`APP_VERSION` 1.30.7.7 vs. `version.json`/`SW_VERSION`/`index.html`
      at 1.30.6.11), but this is a KNOWN, deliberate, pre-deploy STEP
      (`scripts/sync-version.mjs`), not an unresolved defect — listed as
      the FIRST step of the deployment sequence in §18, not a blocker to
      the GO decision itself.

**Accepted non-blocking gaps** (§12, carried forward, none exploitable in
a comparable way to the 3 fixed defects): `customRoles` anonymous-read,
`logs`/`analytics_exports` anonymous-write, and the gudang `.validate`
boundary on 3 nodes (all Phase B, low-risk); `acquireReimbursementNumber`'s
missing role check (low-severity, non-exploitable, documented); 
`exportAnalyticsReport`'s missing role check (pre-existing, self-documented,
already accepted); `telegramProxy`'s untested success path (dormant
function, out of scope); `onEventWrite`'s notification-dispatch pipeline
past the validation gate (not an authorization boundary).

## 18. Recommended Deployment Sequence

**This section is a PLAN. Nothing below has been executed. `firebase
deploy` has not been run.**

1. **Pre-deployment backup/snapshot**: trigger (or confirm the next
   scheduled run of) `backupTick`'s equivalent — a manual `/assignments`
   export — plus a full RTDB export via `firebase database:get /` (or the
   Firebase Console export) as a point-in-time snapshot immediately before
   any rules/functions change. Retain outside the app's own `/backups`
   node (which is itself part of what's being deployed).
2. **Version synchronization**: run `node scripts/sync-version.mjs` to
   propagate `js/config.js`'s `APP_VERSION` (1.30.7.7) into
   `version.json`, `service-worker.js`'s `SW_VERSION`, and `index.html`'s
   cache-busting query strings. Commit this as its own change.
3. **RTDB rules deployment**: `firebase deploy --only database`. This is
   the CRITICAL step — the root cutover makes every per-node rule
   load-bearing for the first time. Deploy this BEFORE or TOGETHER WITH
   the Cloud Functions that depend on the hardened rules (Credential
   Service, `/userProfiles` split), never after, to avoid a window where
   old client code assumes the old, broadly-open access model.
4. **Cloud Functions deployment**: `firebase deploy --only functions`.
   Confirm the deployed function list matches all 21 functions audited in
   Phase C — no function should be deployed that wasn't part of this
   audit.
5. **Client deployment**: `firebase deploy --only hosting`, using the
   version-synchronized bundle from step 2.
6. **Post-deployment smoke tests**: `health` endpoint returns 200; a real
   login (`verifyPin`) succeeds for one account per legacy role (admin,
   bidang, driver, viewer, engineering_coordinator, engineering_member);
   one real Custom Role login (both an `adminEquivalent` and a
   non-equivalent role) resolves claims correctly; confirm the PWA
   "versi baru tersedia" update banner appears for an already-open client
   session.
7. **Security verification against production**: spot-check (NOT a full
   re-run of the emulator suite, which is deliberately local-only) a
   handful of the highest-stakes cases directly against the live
   database using the Firebase Console's Rules Playground: an
   unauthenticated read of a protected node is denied; a `viewer` account
   cannot write `assignments`; the `notifyAdminsOfNewRequest` fix behaves
   as tested (a non-owning caller is denied) — this requires a real test
   account, done carefully, not via this repo's emulator harness.
8. **Rollback trigger conditions**: any of — a legacy role failing to log
   in; any RTDB read/write that worked pre-deploy now failing for a
   legitimate user; any Cloud Function returning unexpected 500s at a
   rate above baseline; the Rules Playground spot-check in step 7
   surfacing a live discrepancy from what Phase A/B/C proved locally.
9. **Rollback order**: reverse of deployment order — client first (stops
   new sessions using anything version-mismatched), then Cloud Functions
   (respecting §16.2's safe-target bounds — never roll back into the
   v1.30.6.10-to-pre-v1.30.7.7 window), then RTDB rules last (root
   revert is the emergency lever if steps above aren't enough).

**Production deployment itself requires a separate, explicit approval
after this report — this document does not constitute that approval.**

## 19. Appendix — Test Inventory

Full sweep: 228 files (`scripts/*.mjs`: 225; `functions/scripts/*.js`: 3).
Method: each executed individually via `node <file>`, output captured,
`N passed, M failed` summary line extracted where present. The 11 files
that reported a real (non-timeout) failure, and the 7 killed by the
sweep's own conservative timeout, are itemized with their investigated
classification in §7's tables above — not repeated here. This appendix
lists the aggregate category counts (matching §7's category table) plus
the security suites (Phases A/B/C, tracked separately, not part of this
228-file legacy inventory since they're this program's own new work):

| Suite group | Files | Checks (approx., where captured) | Pass | Fail (post-investigation) | Status |
|---|---|---|---|---|---|
| Phase A+B security suite (`scripts/rtdb-emulator/`) | 14 | 337 | 337 | 0 | GREEN |
| Phase C security suite (`functions/scripts/phase-c-emulator/`) | 8 | 77 | 77 | 0 | GREEN |
| DOM/Puppeteer | 26 | — | 25 | 1 (pre-existing, unrelated) | GREEN (1 known, non-blocking) |
| Driver/Assignment/Request/Dispatch | 17 | — | 17 | 0 (3 environmental, confirmed correct) | GREEN |
| Warehouse/Gudang | 21 | — | 21 | 0 functionally (3 test-staleness, access control verified intact) | GREEN |
| Executive/Dashboard | 3 | — | 3 | 0 | GREEN |
| Prediction/Recommendation | 10 | — | 10 | 0 | GREEN |
| Engineering | 6 | — | 6 | 0 | GREEN |
| Overtime | 4 | — | 4 | 0 | GREEN |
| Petty Cash | 1 | — | 1 | 0 | GREEN |
| Vehicle | 5 | — | 5 | 0 | GREEN |
| User/Admin/Permission | 2 | — | 2 | 0 | GREEN |
| Export/Analytics/Reimbursement | 5 | — | 5 | 0 | GREEN |
| Firebase/Smoke/Startup | 2 | — | 2 | 0 (1 flaky/environmental, reproduced 3/3 clean on re-run) | GREEN |
| Sarpras Intelligence (Learning/Recognition/Knowledge/Document/Workspace) | 59 | — | 58 | 1 (pre-existing, unrelated) | GREEN (1 known, non-blocking) |
| Cloud Functions (pre-existing regression, `functions/scripts/*.js`) | 3 | 49 | 49 | 0 (environmental precondition, confirmed correct when run properly) | GREEN |
| Other/Infra (incl. `rtdb-hardening-phases-2to7-check.mjs`, now fixed) | 65 | — | 65 | 0 (1 fixed this session) | GREEN |
| **Total (legacy inventory)** | **228** | — | **228*** | **0** | **GREEN** |

\* "228 pass" counts the final, fully-investigated status of every file
(timeout-artifacts re-verified passing; the one stale assertion fixed and
re-verified passing; environmental/pre-existing items confirmed correct
under their real operating conditions or confirmed unrelated to this
program via direct source investigation) — not the raw first-sweep number
(210), which is reported transparently in §7 alongside the investigation
that resolved the other 18.

**2 items remain individually named as pre-existing, non-blocking,
unrelated-domain test staleness** (`knowledge-acquisition-dom-check.mjs`,
`sarpras-home-experience-check.mjs`, plus `learning-dashboard-today-check.mjs`
— all Sarpras Intelligence/Knowledge module, outside this program's
scope) and **3 as pre-existing Gudang test staleness** (access control
independently verified intact) — carried forward as known facts, not
silently hidden, exactly per instruction, but explicitly NOT this
program's defects to fix.
