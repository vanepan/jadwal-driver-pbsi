# Production Security Deployment Runbook — v1.30.7

**Status: DEPLOYED AND LIVE (as of 2026-08-11, ~07:44–07:50 UTC).** The
sections below (originally written pre-deployment) are kept as the
planning record; the actual execution is logged in §21.

---

## §21. DEPLOYMENT EXECUTED — v1.30.7.8.1 checkpoint (2026-08-11)

Executed under explicit, phased authorization (the v1.30.7.8 "Close
Deployment Blocker → Deploy Security Foundation" master prompt), gated
correctly on the Vercel exposure being closed first per that prompt's own
rule.

**Commits deployed from**: `2aec20d` (HEAD at deploy time; includes
`e9ac4c4`'s certified security suite + `8e8f9b0`/`2aec20d`'s Vercel
remediation). `version.json`/`service-worker.js`/`index.html`'s
`sync-version.mjs` stamp to `1.30.7.7` was applied to the working tree
and deployed to Hosting, but — consistent with "only commit when
asked," which this authorization didn't cover — **left uncommitted**;
git and the live deployment now differ on these 3 files until that
commit is explicitly requested.

### Sequence executed (Functions → Rules → Client, per §5's derived order)

1. **Vercel exposure gate**: closed and verified (§0.4) — `vercel.json`
   routes-based fix (`2aec20d`), 27/27 sensitive paths 404, 22/22 app
   assets 200.
2. **Pre-Firebase checklist**: all 9 items confirmed fresh (rules content,
   `notifyAdminsOfNewRequest` fix, Credential Service presence, no test
   stubs, no emulator config leakage). Full suite re-run: **414/414**
   (337 + 77), immediately before deployment.
3. **Production RTDB backup**: `firebase database:get / --pretty
   --export` → 65MB, 39 top-level nodes, spot-checked (32 users, 164
   assignments, 56 driver_requests — plausible real counts). **Bonus
   finding**: confirmed **0/32 users have `pinHash`** — the credential
   migration genuinely has not started, exactly as §1/§16 predicted from
   code alone, now confirmed against real data.
4. **Cloud Functions deployed**: `firebase deploy --only functions` —
   all 21 functions, `Deploy complete!`, zero failures. 7 new functions
   created (`createUserCredential`, `resetUserCredential`,
   `changeMyCredential`, `backupTick`, `acquireReimbursementNumber`,
   `onUserWrite`, `notifyAdminsOfNewRequest`), 14 updated. Confirmed via
   `firebase functions:list` post-deploy: all 21 present.
5. **RTDB Rules deployed**: `firebase deploy --only database` — syntax
   valid, released successfully. **Verified byte-for-byte identical** to
   local `database.rules.json` by reading back `/.settings/rules` from
   production and diffing (14,993 bytes, exact match) — not just "deploy
   succeeded," but proven to be the exact certified content.
6. **Client deployed**: `firebase deploy --only hosting` — 1196 files,
   `Deploy complete!`. Verified live: `version.json` → `1.30.7.7`,
   `index.html`'s `app.js?v=1.30.7.7`, `service-worker.js`'s
   `SW_VERSION = '1.30.7.7'`, all 10 required assets 200, `docs/**`
   still correctly 404 (firebase.json's own pre-existing ignore list).

### Canaries / smoke tests — what was directly verified vs. what requires manual follow-up

**Directly executed against production, PASS:**
- Unauthenticated RTDB read of `/drivers`, `/users` → `{"error":
  "Permission denied"}` (canary 1).
- Unauthenticated RTDB write to a throwaway canary path → `{"error":
  "Permission denied"}` (canary 2).
- Rules content integrity (byte-identical to certified source, above).
- Cloud Function deployment logs: all 21 transitioned to `ACTIVE`, no
  startup/crash errors in the post-deploy log window.

**NOT directly executable from this environment — genuine limitation,
not skipped silently:** canaries 3–9 (bidang `requestId` retargeting,
self-drive claim, `notifyAdminsOfNewRequest` viewer/requester/admin/
adminEquivalent scenarios, credential-field privacy) and Phase 12's
login-based smoke tests (admin login, normal user login, navigation,
Role Summary, User Management, driver/assignment operations) all require
an authenticated session as a specific real production role. This
environment has **no real user credentials, no browser, and no
production Admin SDK access** (no service account key configured
locally) — obtaining or guessing real credentials was not attempted.

**Why this is lower-risk than it sounds, without overclaiming it as
equivalent to direct verification:** the deployed Cloud Functions source
is the exact, unmodified working tree that passed all 77 Phase C
emulator checks covering these exact scenarios (canaries 3, 5, 6, 7, 9
each have a direct emulator-suite counterpart); the deployed rules are
byte-identical to what passed all 337 Phase A/B checks (canary 3, 4, 9's
direct counterparts). This is strong indirect assurance, not a
substitute for a real login. **Recommended before considering this
checkpoint fully closed**: one manual admin login and one manual normal-user
login by someone with real credentials, confirming the app still
authenticates and the dashboard renders.

**Canary 8 (adminEquivalent) is untestable in production right now for
a separate reason**: the production backup confirms `customRoles` is
completely empty — no adminEquivalent-granting Custom Role exists yet.
This isn't a gap in verification; there is currently no such user to
test with.

### Credential migration state (Phase 13)

**0/32 users migrated as of this deployment.** No monitoring mechanism
in this codebase watches for the first migration event in real time;
this was a point-in-time backup check, not a live watch. Per §16: this
is the moment the one-way migration risk WINDOW opens, not the moment it
IS triggered — it begins at the first real post-deployment login.

### Rollback limitation reconfirmed live

Per §16, rolling Cloud Functions back below this deployment is fully
safe RIGHT NOW (0 migrated users) but stops being clean the instant one
real user logs in. This is a standing, time-sensitive fact for whoever
operates this system going forward, not a one-time checkpoint note.

### What remains uncommitted

`version.json`, `service-worker.js`, `index.html` (the `sync-version.mjs`
stamp) are live in production (Hosting + Vercel will pick it up on next
push) but not yet committed to git — flagged explicitly, not silently
left inconsistent.

Investigation basis: repository at commit `e9ac4c4` (branch `main`,
`origin/main`, working tree clean), plus two read-only production queries
made during this investigation (disclosed in full in §0 below — both
non-mutating).

---

## §0. Disclosure of production queries made during this investigation

This runbook's own brief (Step 5, Step 3) requires knowing what is
*actually* live in production, not just what the repository intends. Two
read-only queries were made to answer that, both non-mutating, both
disclosed here rather than performed silently:

1. **`firebase functions:list`** — lists deployed Cloud Functions and
   their trigger metadata. Read-only; does not deploy, invoke, or change
   anything. Result is the basis for §3 and §9.
2. **`WebFetch` of `https://jadwal-driver-pbsi.vercel.app/docs/RTDB_AUTHORIZATION_VALIDATION_FINAL_REPORT_v1.30.7.md`**
   — a plain HTTP GET, the same request any browser would make to a
   public URL already named in this repo's own `storage.rules` comments.
   Read-only. Result is the basis for the urgent finding in §0.1 below.

No RTDB data was read, no Cloud Function was invoked, no Telegram message
was sent, and no write of any kind was made to any production system.

### §0.1 — URGENT, out-of-band finding (not part of the requested scope, surfaced because it materially affects deployment urgency)

**This application is deployed to a second, independent production
surface that this runbook's own brief did not mention: Vercel
(`jadwal-driver-pbsi.vercel.app`), auto-deployed on every `git push` to
`main`, with no `vercel.json` or `.vercelignore` in the repository to
restrict what gets served.** `storage.rules`'s own comments (v1.28.10)
confirm this is the actual URL staff use day to day — Firebase Hosting
is not the primary production surface.

Firebase Hosting's `firebase.json` explicitly `ignore`s `docs/**`,
`scripts/**`, `package.json`, and `*.md`. Vercel has no equivalent
config, so it very likely serves the entire repository as static files.
This was verified directly: the just-committed
`docs/RTDB_AUTHORIZATION_VALIDATION_FINAL_REPORT_v1.30.7.md` — an
internal report containing the exact exploit mechanics for the
`requestId`-retargeting defect and the `notifyAdminsOfNewRequest` missing
ownership check — **is publicly reachable at that URL right now.**

Because neither `database.rules.json` nor the Cloud Functions containing
these fixes have ever been deployed (§3), **production RTDB and Cloud
Functions are still running the pre-hardening, vulnerable code today**,
and a detailed roadmap for exploiting them is now live on the public
internet. This is a real, active information-disclosure risk that
predates this runbook task and is independent of it — nothing in this
session created the Vercel auto-deploy or the missing ignore config; the
session only pushed files into it, same as every prior commit on this
branch (`docs/CREDENTIAL_SECURITY_PATCH_v1.30.6.2.md`,
`docs/RTDB_SECURITY_MODEL_AUDIT_v1.30.6.1.md`, and every other
`docs/*.md` on `main` are almost certainly *also* already public via the
same mechanism).

**This is not something this runbook can remediate on its own** — it
requires a decision (add a `vercel.json`/`.vercelignore` restricting the
served output, move sensitive docs out of the deployed tree, or restrict
the Vercel project's public access) that is out of scope for "produce a
deployment runbook" and has not been made. It is recorded here because it
changes the risk calculus for §13 (deployment order) and §19 (stop
conditions): **the security exposure window this whole v1.30.7 program
exists to close is not merely "still open" — its exact exploitation
mechanics are now also public.** This argues for treating deployment
authorization as more time-sensitive than a purely internal readiness
question would suggest, without this runbook making that authorization
decision itself.

### §0.2 — UPDATE (v1.30.7.8): remediation designed, tested, NOT YET APPLIED

A full audit and a proposed fix now exist — see the standalone
`v1.30.7.8` investigation for the complete methodology. Summary:

- **Exposure was worse than §0.1 alone showed.** Beyond `docs/**`, the
  live Vercel deployment also serves `functions/**` (the full Cloud
  Functions source, including the exact fixed authorization logic for
  `notifyAdminsOfNewRequest`/`credentialService.js` — confirmed live via
  a second read-only fetch of `functions/index.js`), `scripts/**`,
  `scratch/**`, `src/**` (an unrelated, not-yet-wired module), three
  design-prototype directories (`Analytics Export/`, `Engineering
  Operations Prototype/`, `Petty Cash Center/`), `legacy/`,
  `database.rules.stageA.json` (a documented, explicit "ROLLBACK ONLY"
  fully-open-rules break-glass artifact), `firebase-rules.json`,
  `storage.rules`, `storage-cors.json`, and both tracked `*.txt` reports
  — the entire repository, essentially, since Vercel had zero ignore
  configuration at all.
- **No actual secret material was found exposed.** A repo-wide scan for
  hardcoded API keys/private keys/tokens found exactly one match —
  `js/firebase.js`'s Firebase Web `apiKey` — which is not a secret by
  Firebase's own design (access control is enforced by RTDB rules, not
  by hiding this value) and is already intentionally public in the
  running client anyway. No STOP-for-secrets condition was triggered.
- **A `.vercelignore` has been written to the repo root** (untracked,
  not committed), mirroring `firebase.json`'s own already-approved
  `hosting.ignore` list plus the additional gaps above. Statically
  verified, file-by-file, against every asset `index.html`,
  `service-worker.js`, and `manifest.json` actually reference at
  runtime — nothing required by the live client is hidden by it.
### §0.3 — UPDATE (v1.30.7.8, post-push): remediation deployed, VERIFIED NOT EFFECTIVE

`.vercelignore` was committed (`8e8f9b0`, `.vercelignore` the only file
in the diff) and pushed to `origin/main`, which triggered a real Vercel
production deployment — confirmed by `index.html`'s response headers
showing `Age: 0` / a fresh `Last-Modified` timestamp matching the request
time, i.e., Vercel did rebuild and re-serve the site after the push.

**The exclusion itself did not take effect.** A full, cache-busted
(`?cb=<unique>` query string on every request, to rule out edge-cache
staleness) HTTP status check against all 13 previously-identified
sensitive paths, run AFTER the new deployment was confirmed live, found
**all 13 still return `200 OK`** with real content — including
`docs/RTDB_AUTHORIZATION_VALIDATION_FINAL_REPORT_v1.30.7.md`,
`functions/index.js`, and `database.rules.stageA.json`. The application
itself remains fully functional (10/10 required runtime assets checked,
all 200; `version.json` still correctly reads `1.30.6.11`, confirming no
unintended version sync occurred) — so this is not a broken deployment,
specifically an **ignored `.vercelignore`**.

**Root cause not confirmed** (no Vercel dashboard/build-log access from
this environment). Leading hypothesis, not verified: `.vercelignore`
mirrors `firebase.json`'s ignore list verbatim, which includes
`package.json`/`package-lock.json` — excluding these from a Vercel
deployment (unlike Firebase Hosting, which has no build step tied to
`package.json` at all) may cause Vercel's build/framework-detection step
to behave unexpectedly, possibly falling back to serving an unfiltered
tree, or `.vercelignore` may not be honored the way assumed for however
this specific project is configured on Vercel's side (a dashboard-level
Root/Output Directory setting predating this session could override it —
this cannot be checked without dashboard access this session doesn't
have).

**Current state: the exposure from §0.1 is fully unresolved.** The
`.vercelignore` fix is live in the repo and deployed, but empirically
confirmed ineffective. Firebase deployment remains blocked on this
exposure exactly as before — a failed remediation attempt does not
change that condition, it just means the fix needs to be re-designed
(most likely investigated via direct Vercel dashboard/build-log access,
which this session does not have) before the next attempt.

### §0.4 — UPDATE (v1.30.7.8.1): Vercel exposure gate CLOSED, VERIFIED

Root cause of §0.3's failure was never confirmed (no Vercel dashboard
access), but a second, independent mechanism at a different layer was
added instead of continuing to debug `.vercelignore`: `vercel.json`'s
`routes` config, which returns an explicit `404` status at
request-serving time for the same set of paths, falling through to
normal filesystem serving (`{ "handle": "filesystem" }`) for everything
else — this doesn't depend on whatever caused the build-time exclusion
mechanism not to take effect.

Committed as `2aec20d` (`vercel.json` the only file in the diff), pushed
to `origin/main`. The new route rule was live within 5 seconds of push
(first poll after the push already returned `404` for the security
report).

**Full verification, cache-busted, run against the live post-deploy
site:**

- **27 sensitive paths — ALL 404** (superset of the 13 checked in §0.3:
  every doc, the full `functions/` tree including `credentialService.js`
  specifically, both rules files, `storage.rules`/`storage-cors.json`,
  `scripts/`, `scratch/`, `src/`, `legacy/`, `package.json`,
  `package-lock.json`, `temp_server.js`, `framework-poc.html`,
  `CLAUDE.md`, both `.txt` reports, `Analytics-V2/`, and — the syntactically
  riskiest patterns in `vercel.json`, confirmed working — the three
  space-containing prototype directories, `Analytics Export/`,
  `Engineering Operations Prototype/`, `Petty Cash Center/`).
- **22 required application assets — ALL 200**: every root CSS file,
  `js/app.js`, `js/firebase.js`, a nested `js/components/` file,
  `manifest.json`, `version.json`, `service-worker.js`, `offline.html`,
  both `vendor/flatpickr.*` files, `assets/Logo-PBSI.png`, all 3 icon
  files.
- **Content integrity spot-check** (not just status codes):
  `version.json` returns the exact expected `{"version": "1.30.6.11"}`
  (confirms no accidental version sync); `index.html`
  (`Content-Length: 118052`, `text/html`) and `js/app.js`
  (`Content-Length: 643600`, `application/javascript`) both return
  plausible real sizes and correct content-types, not truncated content
  or an error page disguised as 200.

**The Vercel exposure that blocked Firebase deployment is closed and
independently verified.** Firebase deployment may now proceed per the
rest of this runbook.

---

## 1. Executive Summary

The v1.30.7 Authorization Validation Suite certified, against Firebase's
real rules engine and real Cloud Function code, that the previously
code-complete-but-undeployed RTDB Security Hardening Program
(v1.30.6.4–v1.30.6.11) plus three additional defects found during
validation (v1.30.7.2, v1.30.7.4, v1.30.7.7) are correct: 414/414
security checks green, 228/228 legacy regression checks accounted for,
final decision GO (`docs/RTDB_AUTHORIZATION_VALIDATION_FINAL_REPORT_v1.30.7.md`
§17).

**None of it is deployed.** This runbook's investigation confirms, with
direct evidence (§3), that production today is running:

- **RTDB rules** from before the Phase 1 root-cutover program began
  (permissive root, not the deny-by-default v1.30.6.11 state).
- **Cloud Functions** from before v1.30.6.2 — specifically, `verifyPin`
  is still the plaintext-only, non-Custom-Role-aware version
  (`git show c43cc7e:functions/src/auth/verifyPin.js`), and 7 of the 21
  functions defined in the current repo (`createUserCredential`,
  `resetUserCredential`, `changeMyCredential`, `onUserWrite`,
  `notifyAdminsOfNewRequest`, `backupTick`, `acquireReimbursementNumber`)
  **have never been deployed at all** — this is their first release, not
  an update.

This has one important, favorable consequence the source master prompt's
framing should be corrected on: **the "one-way credential migration" has
not actually begun in production.** `persistCredential()` (the only code
path that ever writes `pinHash`) lives entirely inside
`credentialService.js`, a file that did not exist before this program and
is only ever reached through the new `verifyPin.js` or the three
credential callables — none of which are deployed. Production almost
certainly holds 100% plaintext `.pin` fields today. The migration begins
the moment this deployment ships and a user first logs in through the
new code — not before. See §16 for what this changes about rollback
safety.

**Deployment readiness: the code is certified GO. This runbook does not
itself authorize deployment** — per the governing constraint, that is a
separate, explicit decision.

## 2. Deployment Scope

Three independently deployable Firebase artifacts, one auto-deploying
non-Firebase artifact, and one dormant, non-deployable artifact:

| Artifact | Deploy mechanism | In scope for v1.30.7? |
|---|---|---|
| RTDB Rules (`database.rules.json`) | `firebase deploy --only database` (manual) | YES — the whole point of this program |
| Cloud Functions (`functions/src/**`) | `firebase deploy --only functions` (manual) | YES — `notifyAdminsOfNewRequest` fix + 6 other new functions + `verifyPin` migration |
| Client (Firebase Hosting) | `firebase deploy --only hosting` (manual) | YES, but only a version-stamp change — no client-side authorization logic changed in v1.30.7 |
| Client (Vercel) | automatic, on `git push` to `main` | **Already partially happened** — see §0.1. Not gated by any command in this runbook. |
| Storage Rules (`storage.rules`) | `firebase deploy --only storage` | **NOT DEPLOYABLE** — the default Storage bucket does not exist for this project yet (confirmed by this repo's own `storage.rules` comment). Out of scope entirely; not part of v1.30.7. |

## 3. Current Production vs Target State

### 3.1 RTDB Rules

| | Current production (inferred) | Target (`database.rules.json` at `e9ac4c4`) |
|---|---|---|
| Root `.read`/`.write` | Pre-Phase-7: permissive (`auth != null` era) | `false` / `false` — deny by default |
| `assignments` bidang branch | Pre-hardening — no ownership/requestId scoping | ownership-scoped, `requestId` pinned immutable (v1.30.7.4) |
| `customRoles` archived read | N/A (node likely didn't exist pre-hardening) | boolean-coerced correctly (v1.30.7.2) |
| `users`/`userProfiles` split | N/A — likely still one `users` node, broadly readable | split, `userProfiles` broad-read/no-write, `users` self-or-admin only |

*(This inference is based on this program's own established record —
see `[[rtdb-authorization-validation-suite]]`/`[[permission-runtime-migration]]`
— not a fresh read of production rules in this session; no production
RTDB or rules-read call was made while producing this document, per the
no-production-network-call constraint. If precision matters before
deployment, the operator should independently confirm via the Firebase
Console → Realtime Database → Rules tab, which this runbook does not
have a way to query non-interactively.)*

### 3.2 Cloud Functions

Confirmed directly via `firebase functions:list` (§0):

**Currently deployed (14):** `health`, `verifyPin`, `publishEvent`,
`onAssignmentWrite`, `onRequestWrite`, `onEngineeringAssignmentWrite`,
`onEventWrite`, `telegramProxy`, `telegramWebhook`,
`registerPushSubscription`, `unregisterPushSubscription`,
`onAssignmentReminderSync`, `reminderTick`, `exportAnalyticsReport`.

**Never deployed — first release with this deployment (7):**
`createUserCredential`, `resetUserCredential`, `changeMyCredential`
(Credential Service, v1.30.6.2), `onUserWrite`, `notifyAdminsOfNewRequest`
(users split, v1.30.6.10 + the v1.30.7.7 authorization fix), `backupTick`,
`acquireReimbursementNumber` (v1.30.6.6).

**Changed in place (code differs from what's live, same function name):**
`verifyPin` — confirmed via `git log` that its only change since the
pre-backlog baseline (`c43cc7e`, v1.20.7) is the entire `d2160cb` commit,
which added Custom-Role-aware `resolveRoleClaims()` and delegated
credential checking to the (also-new) `credentialService.js`. The
currently-deployed `verifyPin` almost certainly still does
`user.pin === pin` directly (confirmed by reading that exact historical
version — no delegation, no hashing, no Custom Role lookup exists in it).

Because `firebase deploy --only functions` deploys the entire
`functions/index.js` module's exports as one unit (Cloud Functions
Gen 2 does not partially deploy a single source directory), **every one
of the other 6 already-deployed functions may also differ from
production in ways not yet enumerated here** (e.g. `onEventWrite`,
`reminderTick` — the `REMINDER_FLAGS`/`NOTIFICATION_FLAGS`/`PUSH_CONFIG`
history in `functions/src/config/constants.js` shows several rollout
phases (Push Phase D, Reminder Phase C+D cutover) whose deployment status
relative to production is **not independently confirmed by this
investigation** — `firebase functions:list` shows function *existence*
and trigger *type*, not source-code diff against what's live. Treat all
21 functions as needing redeploy, not just the 8 that changed for
security reasons.

### 3.3 Client

| | Current production (Vercel, live) | Target (working tree, `e9ac4c4`) |
|---|---|---|
| `APP_VERSION` (`js/config.js`) | Whatever was live at the last push before this session — almost certainly older than `1.30.7.7`, since `js/config.js` is part of the same repo history | `1.30.7.7` |
| `version.json` / `SW_VERSION` | Same — tracks whatever was last pushed | **Deliberately still `1.30.6.11`** — this desync is intentional at this checkpoint (§0, confirmed clean via `git status`) |

Note the asymmetry: Vercel already has `APP_VERSION = '1.30.7.7'` live
(pushed in `e9ac4c4`) but `version.json`/`SW_VERSION` still say
`1.30.6.11` — **this exact desync state is what's live on Vercel right
now**, not just a local working-tree curiosity. The PWA's own update-banner
mechanism (which compares `version.json` against a cached value) will not
have fired for this change yet, since `version.json` itself hasn't moved.

## 4. Firebase Deployment Inventory

| Product | Configuration file | Deployment command | Dependencies | Rollback mechanism |
|---|---|---|---|---|
| Realtime Database (Rules) | `database.rules.json` | `firebase deploy --only database` | None (rules are self-contained; do not require Functions to be deployed first — see §5 for why the safe order still isn't "rules first") | Redeploy prior rules JSON (must be retrieved from git history or Console rules history — Firebase keeps a rules revision history in-console) |
| Cloud Functions | `functions/index.js` + `functions/src/**`, `functions/package.json` | `firebase deploy --only functions` (or scoped: `firebase deploy --only functions:verifyPin,functions:notifyAdminsOfNewRequest,...`) | Requires `functions/package.json` dependencies installed (`firebase-admin`, `firebase-functions`, `@sparticuz/chromium`, `puppeteer-core`, `web-push`); requires the 4 declared secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`) already set in Secret Manager — they must already exist since `telegramProxy`/`reminderTick`/`onEventWrite` are already live and use them | Redeploy the previous Cloud Functions release (Firebase keeps prior versions; `firebase functions:list` + Cloud Console "Version history" per function, or `gcloud functions deploy ... --source=<old-tag>` if the old source is checked out) — **NOT symmetrical for the 7 never-deployed functions, which have no "previous version" to roll back to; rollback for those is deletion, not revert** |
| Hosting | `firebase.json`'s `hosting` block, serves `.` (repo root) with an explicit `ignore` list | `firebase deploy --only hosting` | Requires `scripts/sync-version.mjs` run first (§6) so `version.json`/`SW_VERSION`/`index.html` cache-busts match `APP_VERSION` | `firebase hosting:rollback` (Firebase Hosting keeps prior releases natively — the one target in this whole inventory with a true one-command rollback) |
| Storage | `storage.rules` | `firebase deploy --only storage` | **Blocked**: default bucket does not exist for this project | N/A — not deployable, not in scope |
| Vercel (undocumented second client target) | none — zero-config, whole-repo static deploy | automatic on `git push origin main` | None a Firebase command controls | Vercel dashboard → previous deployment → "Promote to Production" (outside this repo's tooling entirely; **this runbook cannot document an exact command for it** since there is no Vercel CLI config in this repo) |

## 5. Dependency Graph

Derived from actually reading the rule/function/client code, not assumed:

```
                     ┌─────────────────────┐
                     │   RTDB Rules         │
                     │ database.rules.json  │
                     └──────────┬───────────┘
                                │
        Cloud Functions use the Admin SDK, which BYPASSES
        RTDB rules entirely (confirmed throughout Phase C —
        admin.database() is not subject to database.rules.json
        at all). Functions do NOT depend on Rules being deployed
        to function correctly.
                                │
                                ▼
                     ┌─────────────────────┐
                     │   Cloud Functions    │
                     │  functions/src/**    │
                     └──────────┬───────────┘
                                │
        The CLIENT depends on Functions for: verifyPin (login),
        createUserCredential/resetUserCredential/changeMyCredential
        (credential UI), notifyAdminsOfNewRequest (bidang's request
        flow), publishEvent, push subscription registration.
        The client ALSO writes directly to RTDB for everything
        NOT routed through a callable (assignments, driver_requests,
        drivers, vehicles, settings, gudang, engineering, overtime,
        pettyCash, etc.) — so the client depends on RTDB Rules
        matching what the client's write shapes actually produce.
                                │
                                ▼
                     ┌─────────────────────┐
                     │   Client / Hosting    │
                     │  index.html, js/**    │
                     └───────────────────────┘
```

**This is NOT a strict linear dependency** — RTDB Rules and Cloud
Functions are independent of each other (Functions bypass Rules via the
Admin SDK), so they could theoretically deploy in either order or
simultaneously. But the CLIENT depends on both being in their target
state:

- If Rules deploy before Functions: any client write path the NEW rules
  now protect via ownership/immutability (e.g. `assignments`'
  `requestId` pin) will correctly reject a malicious write, but the
  currently-live (old) `verifyPin` still mints tokens without
  `adminEquivalent` support — a Custom Role admin-equivalent user would
  find themselves newly locked out of admin-only rule branches they
  used to pass under the old permissive rules, with no code path yet
  deployed to grant them the claim. **This is a real, observable
  regression window if Rules deploy first and Functions deploy later.**
- If Functions deploy before Rules: the new `verifyPin` can mint
  `adminEquivalent`/Custom-Role claims and the new callables
  (`notifyAdminsOfNewRequest`, credential callables) enforce their OWN
  authorization correctly regardless of RTDB rules state (Admin SDK
  bypass) — but the client's DIRECT RTDB writes (assignments, driver
  requests, etc.) are still validated against the OLD, pre-hardening
  rules until Rules deploy too. **This is safe** (old rules were more
  permissive, not less — nothing that passed before starts failing) but
  leaves the actual security gap (the reason this whole program exists)
  open for the gap between the two deploys.

**Conclusion: Functions before Rules is the safer order** — it avoids
the observable-regression window, at the cost of leaving the
(already-long-open, now-worse per §0.1) security gap open a little
longer. Client deploys last in both cases, since it is the only artifact
whose correct behavior depends on the other two already being live.

## 6. Pre-Deployment Checklist

- [ ] Confirm `git status` on `main` is clean and `HEAD` is `e9ac4c4` (or later, if more commits land before deployment is authorized).
- [ ] Confirm 414/414 security suite green on a final pre-deploy run (`npm run test:rtdb-emulator && npm run test:functions-emulator`).
- [ ] Confirm the 4 Cloud Functions secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`) are present in Secret Manager for the `schedule-driver-pbsi` project (they must already be, since functions consuming them are already live — but reconfirm, since this deploy is the first time `TELEGRAM_BOT_TOKEN` is consumed by the NEW `notifyAdminsOfNewRequest`, a different function than whichever already-live function first declared it).
- [ ] Take the RTDB backup (§7) BEFORE any deploy step.
- [ ] Independently confirm current production RTDB rules content via Firebase Console (this runbook could not do so without a production network call it chose not to make — see §3.1's caveat).
- [ ] **§0.1/§0.3 Vercel exposure gate — the current hard blocker, STILL OPEN.** `.vercelignore` was committed and pushed (`8e8f9b0`) but verified, post-deploy, to have had NO effect — all 13 previously-identified sensitive paths still return `200`. This is not a "pending push" item anymore; it's a "the fix didn't work, needs re-diagnosis" item. Do not treat the mere existence of `.vercelignore` in the repo as resolving this — re-verify live before assuming otherwise.
- [ ] Explicit, separate authorization obtained for the deployment operation itself (this document does not constitute that authorization).

## 7. Backup Procedure

**Not performed. Documented only, per explicit instruction.**

### 7.1 What to back up

Every node listed in `database.rules.json` (confirmed by parsing the
file directly): `events`, `telegram_deliveries`, `notifications`,
`notification_deliveries`, `push_subscriptions`, `notification_state`,
`reminders`, `logs`, `analytics_exports`, `feature_flags`, `settings`,
`pettyCash*` (5 nodes), `overtime*` (13 nodes), `userProfiles`, `users`,
`assignments`, `driver_requests`, `drivers`, `vehicles`, `customRoles`,
`v2_sarpras`, `engineering`, `gudang` — plus **`backups` and
`reimbursement_counters`**, which have NO rule block (Admin-SDK-only,
invisible to a rules-based enumeration, but real data written by the
(currently undeployed) `backupTick`/`acquireReimbursementNumber` and by
whatever their client-side predecessors wrote historically).

The highest-priority nodes for THIS specific deployment (the ones the
new rules/functions actually change behavior for) are: `users`
(credential migration begins here), `userProfiles`, `assignments`,
`driver_requests`, `customRoles`. A full-database export is still
recommended over a partial one — it is one command either way (§7.2) and
a partial backup risks missing a node a rollback needs.

### 7.2 Mechanism

Firebase's standard point-in-time RTDB export, via the CLI (authenticated,
read-only, does not require the database emulator):

```
firebase database:get / --output rtdb-backup-pre-v1.30.7-<UTC timestamp>.json
```

This is a full recursive JSON export of the entire database instance at
the moment it runs — genuinely point-in-time (a single read transaction
from the client's perspective; RTDB does not offer cross-node atomic
snapshots, so under concurrent writes during the export there is a
theoretical small window of read-skew, acceptable for a pre-deploy safety
snapshot, not acceptable as a substitute for real backup infrastructure).

Alternative (larger-scale, GCS-backed, supports scheduled/automatic
exports): Firebase Console → Realtime Database → the "⋮" menu →
"Export JSON", or `gcloud` GCS-based RTDB export if the project has that
enabled. Not investigated further here since the CLI command above is
sufficient for a one-time pre-deployment snapshot and requires no
additional GCS bucket setup.

### 7.3 Expected size / restore / verification

- **Expected size**: not measured in this investigation (would require a
  production read this runbook chose not to perform). Order-of-magnitude
  estimate from node count and this being an operational scheduling app
  (not a media/document store): almost certainly under Firebase RTDB's
  practical CLI-export comfort zone (low tens of MB at most), but the
  operator should check actual size via Firebase Console → Usage before
  relying on `database:get` for a very large instance — very large
  exports can time out over the CLI and may need the Console/GCS path
  instead.
- **Restore**: `firebase database:set / rtdb-backup-<ts>.json` — this is
  a **destructive full overwrite** of the target path (`/`) with the
  backup's content. Never run this against a live database without
  understanding it replaces everything at that path, including anything
  written AFTER the backup was taken.
- **Point-in-time**: yes, to the granularity described in §7.2 (small
  read-skew risk under concurrent writes, not a hard transactional
  guarantee).
- **Independent verification**: after export, spot-check the JSON file
  contains the expected top-level keys (the node list in §7.1) and a
  plausible record count for at least `users` and `assignments` (compare
  against what the admin UI's own counts show) before trusting the
  backup as complete.

## 8. RTDB Deployment Procedure

**Command (documented, NOT executed):**

```
firebase deploy --only database
```

- **Exact target**: the single RTDB instance `schedule-driver-pbsi-default-rtdb`
  (per `functions/src/config/constants.js#DB_INSTANCE`), region
  `asia-southeast1` (per `REGION` in the same file — confirmed the
  Functions region matches the DB region, which the file's own comment
  says is deliberate for trigger latency).
- **Pre-deployment validation**: Firebase's own CLI performs a rules
  syntax/type check at deploy time (the same real compiler the Phase A
  emulator harness used — this is exactly the validation that caught the
  two `!`-on-non-boolean defects fixed in v1.30.7.2). A failed validation
  here means the deploy does not go live at all — safe-by-default. No
  separate pre-flight command beyond this deploy's own built-in check
  (the emulator suite in §6 already exercises the identical compiler
  offline).
- **Sequencing note**: this section documents the RTDB-specific procedure
  in isolation. §5's dependency analysis concludes Functions should
  actually deploy BEFORE Rules (avoids a real regression window for
  Custom Role/`adminEquivalent` users) — see §14/§17 for the actual
  recommended execution order. This section's content applies whichever
  step it ends up being.
- **Post-deployment validation**: run the security canaries (§12) against
  production immediately after this step. Confirm `firebase database:get
  /.settings/rules` (or Console) reflects the new rules content.
- **Rollback**: Firebase Console → Realtime Database → Rules tab → "History"
  shows prior deployed rule sets with one-click revert; alternatively
  `firebase deploy --only database` with the OLD `database.rules.json`
  checked out via `git show <prior-commit>:database.rules.json > database.rules.json`
  temporarily, deploy, then restore the working tree. No data loss risk
  either way — rules changes never touch data, only what future
  reads/writes are permitted.

## 9. Cloud Functions Deployment Procedure

### 9.1 Full inventory (21 functions), by trigger type

**onCall (client-invokable):** `verifyPin`, `createUserCredential`,
`resetUserCredential`, `changeMyCredential`, `publishEvent`,
`registerPushSubscription`, `unregisterPushSubscription`,
`acquireReimbursementNumber`, `notifyAdminsOfNewRequest`,
`exportAnalyticsReport`.

**Database triggers:** `onAssignmentWrite`, `onRequestWrite`,
`onEngineeringAssignmentWrite`, `onEventWrite`, `onAssignmentReminderSync`,
`onUserWrite`.

**Scheduled:** `backupTick` (daily 02:00 Asia/Jakarta), `reminderTick`
(every 5 min).

**HTTP:** `telegramProxy` (dormant, not wired to any client),
`telegramWebhook` (Telegram inbound), `health` (public, no auth, no
side effects).

### 9.2 What actually changed vs production (§3.2 recap)

7 functions are brand new (never deployed): `createUserCredential`,
`resetUserCredential`, `changeMyCredential`, `onUserWrite`,
`notifyAdminsOfNewRequest`, `backupTick`, `acquireReimbursementNumber`.

1 function has a confirmed code change against live production:
`verifyPin` (plaintext-only → Credential-Service-delegated,
Custom-Role-aware).

The remaining 13 functions' relationship to production is **not
independently confirmed** by this investigation (§3.2) — Firebase does
not expose "deployed source hash vs local source hash" through
`functions:list`. Treat them as "possibly changed, not verified
unchanged."

### 9.3 Individually vs group deployment

Firebase supports scoped deploys: `firebase deploy --only functions:fnA,functions:fnB`.

**Recommendation: deploy as one group**, not individually, for these
reasons specific to this codebase:
- The 13 "unverified" functions in §9.2 cannot be safely excluded
  without first proving they're unchanged — which would require pulling
  deployed source via Cloud Console/`gcloud functions describe
  --format=...` per function, work this runbook did not do (see §0's
  scope limits).
- Several functions share config imported from the SAME module
  (`functions/src/config/constants.js` — `NOTIFICATION_FLAGS`,
  `REMINDER_FLAGS`, `PUSH_CONFIG`) — deploying a subset while that shared
  config module differs from what SOME already-live functions expect
  risks an inconsistent flag-reading state across functions (e.g. one
  deployed function reading a newer `REMINDER_FLAGS.channels.telegram:
  true` while a not-yet-redeployed sibling still reads an older `false`
  from its own bundled copy). A single deploy makes every function agree
  on one config snapshot.
- The whole point of this security program is closing gaps atomically.
  Partial deployment reopens the "some of the fix is live, some isn't"
  ambiguity this exact investigation exists to eliminate.

**Exception worth naming explicitly, not acted on here**: if the
operator wants to reduce blast radius, `notifyAdminsOfNewRequest` alone
(the confirmed, currently-exploitable defect) could be deployed first
and separately as its own `--only functions:notifyAdminsOfNewRequest`
call, ahead of the rest — this is the one function where doing so is
unambiguously safe (it's brand new, nothing depends on it existing yet,
and it closes the single most concretely-exploitable gap found this
program). Named here as an option for the separate deployment-approval
conversation, not chosen by this runbook.

### 9.4 Command (documented, NOT executed)

```
firebase deploy --only functions
```

Scoped alternative for the exception above:

```
firebase deploy --only functions:notifyAdminsOfNewRequest
```

### 9.5 Secrets dependency

`functions/src/config/secrets.js` declares 4 secrets via
`defineSecret()`. `notifyAdminsOfNewRequest` binds `TELEGRAM_BOT_TOKEN`
(`onCall({ region: REGION, secrets: [TELEGRAM_BOT_TOKEN] }, ...)`).
Since `telegramProxy` is already live and presumably already binds this
same secret, it should already exist in Secret Manager — but this is a
**new function's first bind** of it, which is a legitimate place for a
deploy-time surprise if the secret was ever scoped to specific functions
rather than project-wide. Verify with `firebase functions:secrets:access TELEGRAM_BOT_TOKEN`
(read-only) before deploying, not after.

## 10. Client Deployment Procedure

### 10.1 Firebase Hosting

Before deployment: `node scripts/sync-version.mjs` must run — it is the
only mechanism that stamps `version.json`, `service-worker.js`'s
`SW_VERSION`, and `index.html`'s five `?v=` cache-bust query strings
(`app.js`, `style.css`, `petty-cash.css`, `engineering.css`,
`overtime.css`, `gudang.css`) from `APP_VERSION`. **This has deliberately
not been run** — confirmed via `git status` (§0) showing `version.json`/
`service-worker.js` still at `1.30.6.11` against `APP_VERSION`'s
`1.30.7.7`.

```
node scripts/sync-version.mjs   # NOT executed in this investigation
firebase deploy --only hosting  # NOT executed
```

**When to run `sync-version.mjs`**: immediately before the Hosting
deploy step, as the last action before `firebase deploy --only hosting`
— not earlier, since running it earlier just recreates the "already
synced" state this checkpoint deliberately avoided, with no benefit
(nothing else in this runbook's pre-deployment steps depends on the
client version files being synced).

### 10.2 Vercel

**No command exists to gate this in this repository.** As established in
§0.1, Vercel already redeploys on every push to `main` — the NEXT push
(whenever it happens, for whatever reason) will carry `version.json`/
`SW_VERSION` in whatever state they're in at that push. If the operator
wants Vercel and Firebase Hosting to go live with the SAME version-synced
state at the SAME time, `sync-version.mjs` must run and be committed
BEFORE that push — meaning, practically, the Hosting deploy and the next
`git push` should be sequenced together, not treated as independent
steps the way RTDB/Functions/Hosting are.

## 11. Post-Deployment Smoke Tests

Minimal, meaningful, not exhaustive — run after EACH deployment unit
(§13), not only at the very end:

| # | Test | Expected |
|---|---|---|
| 1 | Admin login (`verifyPin` with a known admin account) | Success, token contains `role: 'admin'` |
| 2 | Normal user login (driver/bidang/viewer) | Success, token contains the correct role |
| 3 | Custom Role login (if any exist in production `customRoles`) | Success, token contains the custom role id + `adminEquivalent` iff the role grants `system.admin` |
| 4 | `adminEquivalent` RTDB access (e.g. write to `settings`) | ALLOWED |
| 5 | Anonymous RTDB read of any node | DENIED (root is `false`/`false` post-deploy) |
| 6 | Admin RTDB read/write across several nodes (`drivers`, `vehicles`, `users`) | ALLOWED |
| 7 | Bidang creates a self-drive assignment for their own open request | ALLOWED |
| 8 | Bidang reads their own `driver_requests` record | ALLOWED |
| 9 | Driver reads/writes their own `assignments` record | ALLOWED |
| 10 | Read `userProfiles` as any authenticated role | ALLOWED (broad-read by design) |
| 11 | Read `users/{other-username}.pin` / `.pinHash` as a non-admin, non-self role | DENIED |
| 12 | Trigger `notifyAdminsOfNewRequest` for the caller's own request | ALLOWED, real Telegram send (see §11.1 caveat) |
| 13 | Application boot (load the client, confirm no console errors, dashboard renders) | Clean boot |
| 14 | Service worker registers, `CACHE_NAME` reflects `sarpras-cache-v1.30.7.7` | Confirmed via DevTools Application tab |
| 15 | Version display in the app UI (wherever `APP_VERSION` is surfaced, e.g. a footer/about panel) | Shows `1.30.7.7` |

**§11.1 caveat**: test #12 is the one smoke test in this list with a real
side effect (an actual Telegram message to real admin chat IDs). Either
accept that one real message as an acceptable cost of verifying the
positive path in production, or substitute a request record with zero
`notificationsEnabled` admins so the call succeeds (authorization proven)
but `sent: 0` (no real message) — the same technique already used in the
Phase C emulator test for this exact function.

## 12. Security Canary Tests

These are the exact vulnerabilities found and fixed by v1.30.7 — the
tests that must NEVER go red again, distinct from general smoke tests:

| Canary | Action | Expected |
|---|---|---|
| 1 | Unauthenticated client attempts any RTDB read or write | DENY |
| 2 | Bidang holding an open self-drive assignment attempts to retarget its `requestId` to a different bidang's request in the same write | DENY (v1.30.7.4 fix) |
| 3 | Viewer (or any non-owning, non-privileged role) calls `notifyAdminsOfNewRequest` for a `requestId` they don't own | DENY (v1.30.7.7 fix) |
| 4 | The request's own requester calls `notifyAdminsOfNewRequest` for their own request | ALLOW |
| 5 | Admin (`role === 'admin'`) calls `notifyAdminsOfNewRequest` for a request they didn't create | ALLOW |
| 6 | A Custom Role with `adminEquivalent === true` calls `notifyAdminsOfNewRequest` for a foreign request | ALLOW — tested as a claim shape genuinely distinct from `role === 'admin'`, per the v1.30.7.7 12-point matrix, not assumed interchangeable |
| 7 | Non-admin, non-self role reads `users/{other}.pin` or `.pinHash` | DENY |

Additional canary this investigation surfaces as worth adding (not in
the original brief's list, but directly follows from §0.1 and §1's
migration-start finding):

| 8 (new) | First real user login after this deployment — confirm `users/{that-username}` transitions from holding `pin` to holding `pinHash` (paired update, never both) | `pin` becomes `null`/absent, `pinHash` becomes a populated string, in the SAME transaction — verifies `persistCredential()`'s structural invariant holds under real production data shapes, not just emulator fixtures |

## 13. Monitoring Plan

Using only what already exists (no new infrastructure proposed):

| Signal | Where | What to watch |
|---|---|---|
| Cloud Function errors | Firebase Console → Functions → each function's error rate / Cloud Logging (`logger.error(...)` calls already present throughout `functions/src/**`, e.g. `[verifyPin] auth failed`, `[notify/newRequest] send failed`) | Any spike above baseline for `verifyPin`, `notifyAdminsOfNewRequest`, `onUserWrite` specifically — these are the functions with genuinely new code paths |
| RTDB permission-denied spikes | Client-side: `js/firebase.js`'s existing error handling for `PERMISSION_DENIED` (already surfaces to the browser console per the emulator harness's own observed `FIREBASE WARNING: ... permission_denied` pattern); no server-side RTDB rules audit log exists in this stack today | A sudden rise in denied writes from a role that used to succeed indicates a Rules regression (§5's ordering risk) |
| Authentication failures | `verifyPin`'s own `logger.warn('[verifyPin] auth failed', ...)` | Should track pre-deploy baseline; the log line intentionally never includes the PIN, so this monitors rate, not content |
| Notification failures | `recordDelivery()` writes to `/telegram_deliveries` and `/notification_deliveries` on every send attempt, success or failure, already the existing delivery-tracking mechanism | Spike in `ok: false` entries post-deploy |
| Function latency | Firebase Console → Functions → per-function latency graphs (native) | `exportAnalyticsReport` already has a 2GiB/120s budget — watch it isn't affected by anything in this deploy (it shouldn't be; unrelated code path) |
| Client boot failures | No existing error-tracking service found in this repo (no Sentry/equivalent import in `js/`) — only the browser console and whatever staff report | This is a real monitoring gap, named here as a fact, not proposed to be filled by this runbook (would be new infrastructure, out of scope) |
| Service worker / cache issues | DevTools Application tab, manually, per smoke test #14; `service-worker.js`'s own `no-cache` header (already configured in `firebase.json`) ensures the SW file itself is never stale-cached | Confirm no "stuck on old SW" reports in the observation window |
| Unexpected production writes | None of the existing tooling logs writes centrally; `/events`/`/logs` capture SOME application-level actions (assignment/request lifecycle) but not raw RTDB writes | Same gap as client boot failures — named, not filled |

**Observation windows**: 15 minutes of active watching immediately after
each of the 3 deployment units (Rules, Functions, Client) before
proceeding to the next; 24 hours of passive Console monitoring after the
full sequence completes, since `backupTick`/`reminderTick` only fire on
their schedules (02:00 and every 5 min respectively) and won't be
exercised by same-minute smoke tests.

## 14. Failure Decision Tree

```
Deploy Cloud Functions   (§5: deploys FIRST — avoids the Custom Role /
   │                       adminEquivalent regression window that
   │                       deploying Rules first would create)
   ▼
Run canaries 3-6, 8 + smoke tests 1-3, 12-15 against production
   │
   ├── PASS ──────────────────────────► Deploy RTDB Rules
   │
   └── FAIL
        │
        ├── verifyPin regression (login broken for any role)
        │      → STOP ALL. This is the highest-severity failure mode
        │        in this entire runbook — broken login is a total
        │        outage. Roll back Functions immediately (§15) to the
        │        prior deployed version.
        │
        ├── notifyAdminsOfNewRequest / credential callables misbehave
        │      → These are NEW functions (§3.2) — rollback is deletion,
        │        not revert (§15). Safe to simply not-deploy /
        │        redeploy-without-them while investigating, since
        │        nothing in production currently depends on them
        │        existing.
        │
        ├── Any other function's error rate spikes (§13)
        │      → Classify: is this one of the 13 "unverified vs
        │        production" functions (§9.2)? If so, this may be a
        │        genuine behavioral change from whatever WAS live —
        │        investigate before assuming it's this deploy's fault.
        │
        └── Data integrity — e.g. a `users` record ends up with BOTH
            `pin` AND `pinHash`, or a canary-8-style migration writes
            malformed data
               → STOP ALL. This violates credentialService.js's own
                 stated structural invariant. Do not proceed to Client
                 deployment. Investigate before any further action —
                 this is the one failure mode this runbook's own
                 governing constraints treat as most severe (§16's
                 one-way migration framing).

Deploy RTDB Rules   (§5: deploys SECOND, now that Functions can mint
   │                  adminEquivalent/Custom Role claims — no client
   │                  request the new rules would deny was ever ALLOWED
   │                  to depend on Functions being old, so this order
   │                  introduces no new regression window)
   ▼
Run canaries 1, 2, 7 + smoke tests 4-6 against production
   │
   ├── PASS ──────────────────────────► Deploy Client
   │
   └── FAIL
        │
        ├── Rules failed to compile/deploy at all
        │      → Firebase never went live with the new rules (deploy
        │        is atomic-or-nothing at the CLI level) → NO ACTION
        │        NEEDED beyond fixing the rule and retrying; production
        │        was never in a bad state.
        │
        └── Rules deployed but a canary/smoke test fails
               (a legitimate role now denied)
               → STOP. Do not deploy Client yet.
               → Revert via Console Rules History (§8) to the prior
                 rule set.
               → Investigate before retrying.

Deploy Client (sync-version.mjs → Hosting → next git push for Vercel)
   │
   ▼
Run all remaining smoke tests (13-15) + full canary re-run
   │
   ├── PASS ──────────────────────────► Monitoring window (§13) → Certification
   │
   └── FAIL
        │
        ├── Client-only (boot failure, stale SW, wrong version displayed)
        │      → Rollback Hosting via `firebase hosting:rollback`
        │        (one command, no data implications — the ONE truly
        │        clean rollback in this whole runbook).
        │      → Vercel: manually promote the prior deployment via its
        │        dashboard (§4) — this repo has no CLI path for it.
        │
        └── Client surfaces an RTDB/Functions authorization regression
            that smoke-tested clean at the RTDB/Functions stage
               → This means the regression is client-request-SHAPE
                 dependent (the client sends something the emulator
                 fixtures didn't cover) — STOP, investigate the actual
                 request payload, do not attempt a blanket rollback of
                 all three artifacts at once.
```

**Do not use a blanket rollback command anywhere in this tree** — each
branch names the specific artifact and specific mechanism, per the
master constraint.

## 15. Rollback Matrix

| Artifact | Failure | Rollback possible? | Safe rollback version | Rollback command | Data implications |
|---|---|---|---|---|---|
| RTDB Rules | Any | YES, fully | The exact prior deployed rules (retrieve from Console Rules History, or `git show <commit-before-hardening>:database.rules.json`) | Console one-click revert, or `firebase deploy --only database` with the old file temporarily checked out | None — rules never touch data |
| Cloud Functions (13 already-live functions, if unchanged) | Any | YES, if truly unchanged from what's live (§9.2 caveat: not independently confirmed) | Whatever was live before this deploy | Cloud Console → function → "Rollback to previous version" (native per-function), or redeploy from the `d2160cb`-parent commit's `functions/` tree | None expected, but see `verifyPin` row below — a "13 unchanged" assumption is unverified |
| `verifyPin` specifically | Login broken, or Custom Role/`adminEquivalent` claims not minting | YES, but with a real consequence | The pre-`d2160cb` version (`c43cc7e`) | Redeploy that exact file content | **Any user who already migrated to `pinHash` under the NEW code (post-deploy) cannot log in against the OLD `verifyPin`** — it does `user.pin === pin` directly and has no knowledge of `pinHash` at all. This is the concrete mechanism behind the "one-way migration" constraint: it is one-way starting from the FIRST successful login after this deployment, not before. |
| 7 never-deployed functions (`createUserCredential`, `resetUserCredential`, `changeMyCredential`, `onUserWrite`, `notifyAdminsOfNewRequest`, `backupTick`, `acquireReimbursementNumber`) | Any | YES, trivially | N/A — rollback is deletion (`firebase functions:delete <name>`), not "revert to a prior version," since no prior version exists | `firebase functions:delete notifyAdminsOfNewRequest` etc. | None — these functions own no data path anything else depends on existing yet (verified: nothing in the currently-deployed 14 functions calls into these new ones) |
| Client (Hosting) | Any | YES, fully, natively | Any prior Hosting release | `firebase hosting:rollback` | None — static assets only |
| Client (Vercel) | Any | Partially — outside this repo's tooling | Prior Vercel deployment | Manual, via Vercel dashboard | None to data; **this runbook cannot provide an exact command**, named as a real gap |
| Credentials (`users/{u}.pin`/`.pinHash`) | Migration corrupts a record, or Functions rollback strands migrated users | **ROLLBACK PARTIAL ONLY** | N/A | N/A | See below |
| `userProfiles` migration (`onUserWrite` mirror) | Mirror diverges from `users`, or is deleted by a Functions rollback | YES for the mirror itself (it's derived data, `users` remains authoritative) | Re-run is automatic: any future `users/{u}` write re-fires `onUserWrite` and re-mirrors | No manual command needed — self-healing on the next write, or a one-time backfill script would need to be written (does not exist in this repo today) if a full re-mirror of ALL existing users is needed immediately | `userProfiles` is pure derived data — safe to lose and regenerate |
| Custom Roles / `adminEquivalent` behavior | A Custom Role holder loses/gains access unexpectedly after a partial rollback | Depends entirely on WHICH half rolled back (Rules vs Functions) — see §5's ordering risk | N/A | N/A | If Functions roll back to pre-`d2160cb` `verifyPin` while Rules stay on the NEW deny-by-default set: Custom Role users lose the ability to mint `adminEquivalent` claims at all, and may be locked out of admin-gated rule branches with no error message clearer than "permission denied" |
| `notifyAdminsOfNewRequest` authorization fix | Rolled back (function deleted) | Reopens the exact vulnerability this program exists to close | N/A | N/A | **Per the governing constraint, rolling back below v1.30.7.7 is prohibited unless compatibility and security preservation are explicitly proven — this matrix does not attempt to prove that case, because doing so would mean recommending the rollback the constraint forbids** |

## 16. Rollback Limitations

**ROLLBACK PARTIAL ONLY** for the credential migration, stated per the
governing constraint's own required format:

The migration is one-way starting from the moment it actually starts —
which, per §1/§3.2's finding, is NOT before this deployment, but IS
during it, the instant any single user successfully logs in through the
new `verifyPin`. Before that first login: rollback of Functions is
completely safe (production still holds only plaintext `.pin`, nothing
to lose). After even one user has logged in: that specific user's record
now holds `pinHash` only, and the old `verifyPin` cannot authenticate
them at all (confirmed by reading its exact deployed-equivalent source,
§3.2) — they would be **completely locked out**, not degraded, until
either (a) an admin uses `resetUserCredential` (itself only available in
the NEW code) to re-issue them a fresh plaintext PIN and manually
communicate it, or (b) the new code is redeployed.

**The safe recovery strategy, if a rollback is needed after some users
have already migrated**: do NOT roll back `verifyPin` to the pre-migration
version. Instead, fix forward — redeploy a corrected version of the NEW
`verifyPin`/`credentialService.js`, since by that point going backward
locks out real users while going forward only requires the specific bug
that triggered the rollback consideration to be fixed. This is the
practical meaning of "if a complete rollback is impossible, explicitly
state that": **a complete rollback of Cloud Functions, once even one
user has logged in post-deployment, is impossible without manually
resetting that user's credential** — there is no code-only rollback path
that restores plaintext-PIN compatibility for an already-migrated
account, because `persistCredential()`'s paired update
(`{ pinHash: hash, pin: null }`) deletes the plaintext field as part of
the same write that creates the hash.

Two more irreversible-in-practice operations, named explicitly:
- **`onUserWrite`'s mirror-then-narrow of `users` read access**: once
  `userProfiles` exists and client code is updated to read FROM it
  instead of the broader `users` node for display purposes, any client
  code (old cached Service Worker version, or a browser tab that hasn't
  refreshed) still expecting the old broad `users` read will start
  failing — this is a rollout-timing risk, not a data-loss risk (see
  Client rollback row, §15).
- **`backups/assignments/*` pruning**: `backupTick`'s own retention
  logic (§7.1) permanently deletes backup snapshots older than
  `settings/system/backupRetentionDays`. This is by design (not a bug),
  but is itself an irreversible operation once it fires on its first
  02:00 run post-deployment — worth knowing it starts running
  immediately on deploy, not on some later opt-in.

## 17. Exact Deployment Commands

*(Documented for reference. NONE executed as part of this investigation.)*

**(v1.30.7.8) The Vercel exposure gate (§0.2) sits BEFORE step 0 below,
as its own separate precondition — it does not reorder Functions/Rules/
Client relative to each other, it gates the whole sequence:**

```bash
# -1. Vercel exposure remediation (must complete and be verified FIRST)
git add .vercelignore
git commit -m "..."                           # review the prepared .vercelignore first
git push origin main                          # this is what actually applies it (Vercel auto-deploy)
# then confirm: a GET to the previously-exposed docs/ URL now 404s

# 0. Pre-flight
git status                                    # confirm clean, HEAD = e9ac4c4 (or later)
npm run test:rtdb-emulator                    # confirm 337/337
npm run test:functions-emulator               # confirm 77/77
firebase functions:secrets:access TELEGRAM_BOT_TOKEN   # confirm secret exists (read-only)

# 1. Backup
firebase database:get / --output rtdb-backup-pre-v1.30.7-<UTC-timestamp>.json

# 2. Cloud Functions — deploys FIRST, per §5's dependency analysis
#    (avoids the Custom Role / adminEquivalent regression window that
#    deploying Rules first would create)
firebase deploy --only functions
#   — or, for the reduced-blast-radius option named in §9.3:
#   firebase deploy --only functions:notifyAdminsOfNewRequest

# [ run canaries 3-6, 8 + smoke tests 1-3, 12-15 against production, per §14 ]

# 3. RTDB Rules
firebase deploy --only database

# [ run canaries 1, 2, 7 + smoke tests 4-6 against production, per §14 ]

# 4. Client
node scripts/sync-version.mjs                 # stamps version.json / SW_VERSION / index.html
git add version.json service-worker.js index.html
git commit -m "chore: sync version artifacts for v1.30.7 deployment"
firebase deploy --only hosting
git push origin main                          # this is what actually redeploys Vercel too

# [ run remaining smoke tests + full canary re-run, per §14 ]

# 5. Monitoring window (§13), then certification
```

## 18. Exact Verification Commands

```bash
# RTDB rules — confirm what's actually live
firebase database:get /.settings/rules        # (if supported by CLI version; else Console)

# Cloud Functions — confirm deployment succeeded and lists all 21
firebase functions:list

# Hosting — confirm live release
firebase hosting:channel:list                 # or Console → Hosting → Release history

# Application version, live
curl -s https://schedule-driver-pbsi.web.app/version.json
curl -s https://jadwal-driver-pbsi.vercel.app/version.json   # separate surface, may differ if push timing diverges

# Cloud Function logs, tail during the observation window
firebase functions:log --only notifyAdminsOfNewRequest,verifyPin,onUserWrite
```

## 19. Deployment Stop Conditions

Deployment must stop (per the governing brief, confirmed applicable at
every stage in §14) if:

- RTDB rules fail validation/compile at deploy time.
- Any authentication smoke test fails (admin or normal user login).
- The permission model observed in production differs from what the
  emulator suite certified (i.e., a canary that passed at 414/414
  offline fails against real production).
- `adminEquivalent` claim minting or enforcement fails.
- Requester ownership enforcement fails (canaries 2-6).
- Credential privacy fails (canary 7 — `pin`/`pinHash` readable by a
  non-privileged role).
- The `notifyAdminsOfNewRequest` exploit reappears (canary 3 fails).
- Cloud Functions error rate spikes above baseline (§13).
- Client fails to boot.
- Data integrity changes unexpectedly (a `users` record holds both
  `pin` and `pinHash` simultaneously — canary 8).
- The Service Worker causes a stale/incompatible client (version
  mismatch that doesn't resolve after one refresh cycle).
- **Any unexpected production write occurs** that this runbook did not
  plan for — including, notably, this runbook's own smoke test #12
  (§11.1), which must be deliberately scoped to avoid a real Telegram
  send unless that's explicitly accepted in advance.
- **(v1.30.7.8) The Vercel exposure gate (§0.2) has not been closed.**
  If the prepared `.vercelignore` has not yet been committed AND pushed
  AND spot-verified as no longer serving `docs/**`/`functions/**`,
  Firebase deployment does not proceed — this is a standing precondition
  on top of everything else in this section, not an alternative to it.

## 20. Final Operator Checklist

- [ ] §0.1's Vercel exposure finding has been reviewed and a decision made (even if the decision is "accept the risk, proceed anyway") — this runbook surfaces it but does not resolve it.
- [ ] §6's pre-deployment checklist fully complete.
- [ ] §7 backup taken and spot-verified.
- [ ] Deployment order (§5, §17) understood: **Functions, then Rules, then Client** — per §5's derived (not assumed) safe order, this avoids a real regression window for Custom Role/`adminEquivalent` users that deploying Rules first would create. Operator should re-read §5 to confirm this reasoning still holds if anything about the codebase changes between now and the actual deployment.
- [ ] §16's rollback limitation for the credential migration is understood and accepted: rollback stops being clean the moment the first user logs in post-deployment.
- [ ] Explicit, separate authorization for the deployment operation obtained — this runbook is not that authorization.
- [ ] `firebase deploy` (in any of its forms), `scripts/sync-version.mjs`, and any production-write/production-invoke action remain **NOT EXECUTED** until that authorization is given.

---

*This document was produced by investigation only. No `firebase deploy`
in any form was executed. No production RTDB write occurred. No Cloud
Function was invoked. No Telegram message was sent. No production data
was modified. `scripts/sync-version.mjs` was read, not run. The two
read-only production queries made during this investigation are fully
disclosed in §0. The next action is a separate, explicitly authorized
production deployment operation — this document does not initiate it.*
