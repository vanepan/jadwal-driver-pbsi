# Authorization Validation Suite — Phase C Coverage Report (v1.30.7.7)

**Type: COVERAGE REPORT ONLY.** This document inventories what was tested,
how, and to what result. It is explicitly **not** the final Validation /
Risk / Performance / Deployment-Readiness / Go-No-Go / Rollback report —
that remains Phase D, not yet started, exactly as promised in the Phase A
and Phase B coverage docs.

## 1. Scope and method

Phase A and Phase B validated `database.rules.json` against Firebase's
real RTDB rules engine. Phase C validates the other half of this
platform's authorization surface: **Cloud Functions**, which run on the
Admin SDK and therefore bypass every RTDB rule Phases A/B tested entirely.
A client that reaches a privileged Cloud Function entry point is not
constrained by anything Phase A/B proved — this phase exists to prove
each entry point enforces its own boundary correctly.

Method: every exported function's real handler module is `require()`d
directly and invoked via its `.run()` shortcut (confirmed against the
actually-installed `firebase-functions`/`cors` package source, not
assumed), with fabricated `request`/`event`/`(req,res)` objects — no HTTP
layer, no Functions emulator. The real `firebase-admin` Admin SDK is
pointed at the already-running local RTDB emulator via
`FIREBASE_DATABASE_EMULATOR_HOST`, verified live by a raw `node:http`
canary round-trip (`functions/scripts/phase-c-emulator/_lib/safety-guard.js`)
before any function module is ever loaded. Real external services
(Telegram, Firebase Auth token minting) are stubbed only at their own
network edge, restored in a `finally` block — the authorization/business
logic itself is never mocked. Run via `npm run test:functions-emulator`.

## 2. Function Security Matrix

All 21 functions exported from `functions/index.js`.

| Function | Trigger | Auth requirement | Accepted callers | Target identity source | Admin SDK writes | Admin SDK reads | Abuse path considered |
|---|---|---|---|---|---|---|---|
| `verifyPin` | onCall | none (IS the login) | anyone | n/a | — | `/users` | brute-force PIN guessing (rate-limiting explicitly out of scope, documented in v1.30.6.2) |
| `createUserCredential` | onCall | required | literal `admin` only | payload `username` | `/users/{u}` (pinHash) | — | non-admin escalation (denied, tested) |
| `resetUserCredential` | onCall | required | literal `admin` only | payload `username` | `/users/{u}` (pinHash) | — | same |
| `changeMyCredential` | onCall | required | any authenticated | `auth.uid` (no param exists) | `/users/{auth.uid}` | `/users/{auth.uid}` | none — no cross-account path exists structurally |
| `publishEvent` | onCall | required | any authenticated | `auth.uid`/`auth.token.role` | `/events` (append) | — | forging an authoritative event type (denied, tested) |
| `registerPushSubscription` | onCall | required | any authenticated | `auth.uid` (no param exists) | `/push_subscriptions/{auth.uid}` | `/push_subscriptions/{auth.uid}` | registering an untrusted push endpoint (origin-allowlisted, tested) |
| `unregisterPushSubscription` | onCall | required | any authenticated | `auth.uid` (no param exists) | `/push_subscriptions/{auth.uid}` | — | none — no cross-account path exists structurally |
| `acquireReimbursementNumber` | onCall | required | **any authenticated, no role gate** | n/a | `/reimbursement_counters/{ym}` | — | broad-but-low-stakes minting (documented, not escalated — see §4) |
| `notifyAdminsOfNewRequest` | onCall | required | **admin, adminEquivalent, or the request's own requester (v1.30.7.7)** | payload `requestId` cross-referenced against `driver_requests` | — (Telegram send only) | `/driver_requests/{id}`, `/users` | **cross-request notification-fan-out abuse — FOUND, FIXED, see §4** |
| `exportAnalyticsReport` | onCall | required | any authenticated (documented, accepted-for-now — see §5) | n/a | — | — | resource exhaustion (2GiB/120s render); pre-existing, code-commented, not this phase's finding |
| `onUserWrite` | trigger (`/users/{u}`) | n/a | n/a | n/a | `/userProfiles/{u}` (allowlist) | n/a (event data) | credential-field leakage into the broadly-readable mirror — tested, none found |
| `onAssignmentWrite` | trigger (`/assignments/{id}`) | n/a | n/a | n/a | `/events` (append) | `/settings/notifications`, live re-read for debounce | audit-log actor fidelity — not independently re-verified (persisted-field-derived by design, pre-existing) |
| `onRequestWrite` | trigger (`/driver_requests/{id}`) | n/a | n/a | n/a | `/events` (append) | — | same class, lower complexity (no debounce) |
| `onEngineeringAssignmentWrite` | trigger (`/engineering/assignments/{id}`) | n/a | n/a | n/a | `/events` (append) | — | same class |
| `onEventWrite` | trigger (`/events/{id}`, create-only) | n/a | n/a | n/a | `/notifications`, dispatch | `/events/{id}` | envelope forgery via a malformed/looped record — tested (validation gate, `notification.sent` loop guard) |
| `onAssignmentReminderSync` | trigger (`/assignments/{id}`) | n/a | n/a | n/a | `/reminders` | — | none — gated on `REMINDER_FLAGS.enabled`, no caller-influenced path |
| `reminderTick` | onSchedule (5 min) | n/a — no caller | n/a | n/a | `/reminders`, `/events` | `/assignments`, `/driver_requests` | none — zero client input; re-validates live state before firing |
| `backupTick` | onSchedule (daily) | n/a — no caller | n/a | n/a | `/backups/assignments/*` | `/assignments`, `/settings/system` | none — zero client input |
| `telegramProxy` | onRequest (HTTP) | Firebase ID token | any valid token (**DORMANT**, not wired to any client) | `auth.verifyIdToken()` | — | — | open relay if the auth gate were bypassed (tested: gate holds on every rejection path) |
| `telegramWebhook` | onRequest (HTTP) | Telegram shared-secret header | Telegram's own servers only | n/a | — (delivery log only) | — | inbound command injection via crafted `text` (mapped through a fixed switch, no dynamic execution) |
| `health` | onRequest (HTTP) | none (deliberate) | anyone | n/a | — | — | none — no data, no side effects |

## 3. Coverage by security dimension

TESTED = a real assertion exists and passes. N/A = the dimension does not
apply to this function's design (not a gap). GAP = the dimension applies
but is not dynamically tested, named explicitly rather than hidden.

| Function | Authentication | Authorization | Input Validation | Target Ownership | Admin SDK Boundary | Credential Safety | Negative Cases | Positive Cases | Status |
|---|---|---|---|---|---|---|---|---|---|
| verifyPin | N/A¹ | N/A¹ | TESTED | N/A | TESTED | TESTED | TESTED | TESTED | TESTED |
| createUserCredential | TESTED | TESTED | GAP² | N/A | TESTED | TESTED | TESTED | TESTED | TESTED (1 minor gap) |
| resetUserCredential | TESTED³ | TESTED | GAP² | N/A | TESTED | TESTED | TESTED³ | TESTED | TESTED (1 minor gap) |
| changeMyCredential | TESTED | N/A (self-only by construction) | TESTED | TESTED (by construction) | TESTED | TESTED | TESTED | TESTED | TESTED |
| publishEvent | TESTED | TESTED | TESTED | N/A | TESTED | N/A | TESTED | TESTED | TESTED |
| registerPushSubscription | TESTED | N/A (self-uid by construction) | TESTED | TESTED (by construction) | TESTED | N/A | TESTED | TESTED | TESTED (device-cap pruning not dynamically tested — low-risk storage hygiene, not authorization) |
| unregisterPushSubscription | TESTED³ | N/A | TESTED | TESTED (by construction) | TESTED | N/A | TESTED³ | TESTED | TESTED |
| acquireReimbursementNumber | TESTED | **GAP⁴ (documented, not escalated)** | TESTED | N/A | TESTED | N/A | TESTED | TESTED | TESTED |
| notifyAdminsOfNewRequest | TESTED | **TESTED — FOUND + FIXED (v1.30.7.7)** | TESTED | **TESTED — FOUND + FIXED** | TESTED | N/A | TESTED (12-point matrix) | TESTED (2 privilege tiers) | TESTED |
| exportAnalyticsReport | **ACCEPTED GAP⁵** | ACCEPTED GAP⁵ | ACCEPTED GAP⁵ | N/A | ACCEPTED GAP⁵ | N/A | ACCEPTED GAP⁵ | ACCEPTED GAP⁵ | ACCEPTED GAP |
| onUserWrite | N/A | N/A | N/A | N/A | TESTED | TESTED | N/A | TESTED | TESTED |
| onAssignmentWrite | N/A | N/A | N/A | N/A | TESTED | N/A | TESTED (no-op case) | TESTED | TESTED |
| onRequestWrite | N/A | N/A | N/A | N/A | TESTED | N/A | N/A | TESTED | TESTED |
| onEngineeringAssignmentWrite | N/A | N/A | N/A | N/A | TESTED | N/A | N/A | TESTED | TESTED |
| onEventWrite | N/A | N/A | TESTED (envelope gate) | N/A | ACCEPTED GAP⁶ | N/A | TESTED (invalid + loop guard) | ACCEPTED GAP⁶ | TESTED (validation gate only, by design) |
| onAssignmentReminderSync | N/A | N/A | N/A | N/A | TESTED | N/A | N/A | TESTED | TESTED |
| reminderTick | N/A | N/A | N/A | N/A | TESTED | N/A | TESTED (already-cancelled case) | TESTED | TESTED |
| backupTick | N/A | N/A | N/A | N/A | TESTED | N/A | TESTED (empty case) | TESTED (retention pruning) | TESTED |
| telegramProxy | TESTED (rejection paths) | N/A | N/A | N/A | N/A | N/A | TESTED | **ACCEPTED GAP⁷** | TESTED (rejection paths only, by explicit decision) |
| telegramWebhook | TESTED | N/A | TESTED (command routing) | N/A | N/A | N/A | TESTED | TESTED (network stubbed) | TESTED |
| health | N/A (deliberate) | N/A (deliberate) | N/A | N/A | N/A | N/A | N/A | TESTED | TESTED (N/A by design, not a gap) |

¹ `verifyPin` has no "authorization boundary" in the usual sense — it IS
the credential-proof mechanism every other function's authorization
ultimately rests on. Its role-resolution correctness (VALID_ROLES fast
path, Custom Role fallback, archived downgrade, adminEquivalent minting)
is fully covered under Admin SDK Boundary / Positive Cases instead.

² `createUserCredential`/`resetUserCredential` share the exact same
`USERNAME_RE`/`PIN_RE` format validation already dynamically proven on
`verifyPin` in this same file — not re-proven as a distinct assertion on
these two endpoints specifically. A genuine, if very low-risk, gap: the
regex objects are shared by import, not by a shared validation function
call, so a hypothetical future edit to one endpoint's validation call
site could silently diverge without this suite catching it immediately.

³ `resetUserCredential`/`unregisterPushSubscription` share their sibling
endpoint's exact `assertAdmin()`/`_assertAuthed()` function object (the
identical function reference, not just identical logic) — collapsed per
this program's established principle (Phase B: "enumerate every literal
clause once, don't re-test an identical clause per sibling"), not
independently re-invoked with a fresh assertion on these two endpoints.

⁴ `acquireReimbursementNumber` has no role check at all — any
authenticated user can mint a reimbursement document number. Investigated
and tested factually (see the labeled check in
`backup-and-counter-check.js`). **Not escalated through the STOP protocol**:
unlike `notifyAdminsOfNewRequest`, there is no spam/enumeration/data-
exposure vector — a monotonic counter with no downstream effect beyond a
formatted string, and reimbursement is not a role-gated action anywhere
else in this application's business logic.

⁵ `exportAnalyticsReport`'s missing role check is a PRE-EXISTING,
explicitly code-commented, accepted-for-now design decision ("role-
agnostic for now... tightened when wired to the admin UI in a later
phase" — the function's own source). No dynamic test was written for it
at all: running it to confirm a fact its own comment already states would
mean paying for a real 2GiB/120s headless-Chrome PDF render for zero new
information. Distinguished deliberately from `acquireReimbursementNumber`
(undocumented) and `notifyAdminsOfNewRequest` (undocumented AND a real
abuse vector).

⁶ `onEventWrite`'s envelope-validation gate is fully tested; the full
notification engine (recipients → templates → dispatch) is deliberately
NOT exercised past that gate in this suite — that pipeline can reach real
push/Telegram send paths with no dependency-injection point in the
untouched notification engine code, and this function has no caller-
authorization boundary of its own to validate (the `/events` write that
triggers it is already RTDB-append-only-gated, tested in Phase B).

⁷ `telegramProxy`'s authenticated-success path is out of scope by
explicit user decision (would require the Auth emulator, not added to
this program, to mint a real token) for a function that is DORMANT — not
wired to any client today.

## 4. Findings

### notifyAdminsOfNewRequest — missing authorization check (v1.30.7.7)

Full narrative in `js/config.js` `VERSION_HISTORY` v1.30.7.7. Summary:
investigation found the function checked only that a caller was
authenticated — no role check, no check that the caller owned the
`driver_requests` record whose id they supplied. Confirmed against the
real emulator (an authenticated `viewer` with no relationship to an
existing request reached `{ok:true}`). A first fix attempt (uid-only
ownership check) was itself caught causing a real regression — admin
denied for a request admin didn't personally create — stopped and
reported per protocol rather than silently shipped or widened. The
corrected policy (`admin` OR `adminEquivalent` OR the record's own
requester) was verified against a 12-point identity/ownership matrix plus
2 positive-pipeline checks, 14/14 passing, with `role==='admin'` and
`adminEquivalent===true` tested as genuinely separate branches. Fixed,
regression-locked in `notification-dispatcher-check.js`, versioned
separately from this coverage doc's own test-file work.

## 5. Known/accepted gaps (carried forward, not blocking)

1. `exportAnalyticsReport` — no role check, pre-existing and self-documented, no dynamic test (§3 note 5).
2. `telegramProxy` authenticated-success path — out of scope, needs the Auth emulator (§3 note 7).
3. `onEventWrite`'s full notification-engine dispatch — deliberately not exercised past envelope validation (§3 note 6).
4. `createUserCredential`/`resetUserCredential` input-validation format checks, and `resetUserCredential`/`unregisterPushSubscription`'s authentication checks — collapsed onto a sibling endpoint sharing the identical function reference, not independently re-asserted (§3 notes 2, 3).
5. `registerPushSubscription`'s device-cap pruning — not dynamically tested (storage hygiene, not an authorization boundary).
6. `acquireReimbursementNumber` — no role check; documented as a factual finding, not escalated (§3 note 4).

None of these are believed to be exploitable in the way
`notifyAdminsOfNewRequest` was — each is either a shared-logic collapse
(the underlying code path IS tested, just via a sibling call site) or an
explicitly out-of-scope external-service dependency.

## 6. Regression summary

- Phase C suite: **77/77** across 8 registered suites (verified twice
  consecutively — see the session's own verification log for exact run
  output).
- Phase A + Phase B RTDB emulator suite: **337/337**, unaffected (Phase C
  is Cloud-Function-only; the one `database.rules.json` interaction this
  phase had — none — means zero rules-side regression risk by
  construction).
- Pre-existing Cloud Function regression scripts
  (`assignment-notify-classify-check.js`, `-debounce-check.js`,
  `-recipients-templates-check.js`): **49/49**, unaffected.

Nothing deployed. `firebase deploy` was not run at any point in this
phase; no real Firebase project, no real Telegram endpoint, and no real
Firebase Auth Identity Toolkit endpoint was ever contacted — every
external-service call this suite could have reached was stubbed at its
own network edge and restored immediately after.

## 7. What's next

Phase D (performance measurement, full business-module regression across
Warehouse/Vehicle/Driver/Engineering/Executive/Petty Cash/Overtime/
Gudang/Notification, and the final Validation/Coverage/Risk/Deployment-
Readiness/Go-No-Go/Rollback report) remains separate and not yet started,
exactly as promised in the Phase A and Phase B coverage docs. Deployment
remains a distinct, not-yet-authorized decision.
