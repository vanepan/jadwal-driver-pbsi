# Production Deployment Final Report — v1.30.7.9 + v1.30.8

**Checkpoint state: COMMITTED → PUSHED → DEPLOYED → PRODUCTION VERIFIED
on BOTH client surfaces (Firebase Hosting and Vercel). Two real Vercel
platform issues were found DURING this deployment window — one a stale
build (§6.1), the other a full application outage caused by an
ignore-pattern collision (§6.2) — both found, fixed, and independently
re-verified within this same session. Neither originated in the
v1.30.7.9/v1.30.8 code itself, but both are now closed as part of this
checkpoint's complete state.**

---

## 1. Git commits

| Commit | Message | Files |
|---|---|---|
| `22e256d` | `security: v1.30.7.9 - Protect Self Role Fields` | `database.rules.json`, `scripts/rtdb-emulator/users-nodes-full-sweep-check.mjs`, `js/config.js` |
| `66c7892` | `feat: v1.30.8 - Custom Role Assignment Activation` | `js/admin.js`, `js/users.js`, `index.html`, `service-worker.js`, `version.json`, `js/config.js`, + 5 new files (2 test files, 1 harness, 2 docs) |
| `8032233` | `fix: v1.30.7.8.2 - Vercel stale-build hypothesis fix (skip install/build)` | `vercel.json` only — found and fixed mid-deployment, see §6.1 |
| `cd18ac3` | `fix: v1.30.7.8.3 - CRITICAL: .vercelignore was hiding js/docs/ (full app outage)` | `.vercelignore` only — a full production outage on Vercel, found and fixed mid-deployment, see §6.2 |

Both commits contain real, accurate intermediate state — `js/config.js`'s
`APP_VERSION`/`RELEASE_NAME`/`VERSION_HISTORY` were reconstructed to their
true v1.30.7.9-only values for the first commit (the working tree had
already been advanced to v1.30.8 before commit time), not just split by
file.

## 2. Remote status

`git push origin main`: **PASS**. Independently verified after push:
`git fetch origin main` → `origin/main` = `66c78921b6924ab17b7114c7982907114af5b960`,
local `HEAD` = same SHA, `git status` reports clean/up-to-date. No
divergence.

## 3. Tests — exact commands and totals

**Plain-node pure-logic suites** (`node scripts/<name>.mjs`), re-run
immediately before deployment:

| Suite | Checks |
|---|---|
| `role-management-check` | 38 |
| `role-status-check` | 14 |
| `role-relationships-check` | 26 |
| `role-usage-provider-check` | 14 |
| `role-archive-guard-check` | 10 |
| `role-summary-model-check` | 19 |
| `custom-roles-check` | 29 |
| `permission-service-check` | 62 |
| `canAccessModule-check` | 5 |
| `verify-pin-role-resolution-check` | 23 |
| `pin-hash-check` | 24 |
| `credential-service-check` | 39 |

**Puppeteer DOM suites** (`node scripts/<name>.mjs`, real Chromium, real
wired app code):

| Suite | Checks |
|---|---|
| `role-management-dom-check` | 12 |
| `role-management-edit-dom-check` | 23 |
| `role-management-detail-dom-check` | 19 |
| `permission-runtime-invariant-check` | 14 |
| `user-management-role-picker-dom-check` | 12 |
| `users-role-assignment-check` | 16 |

**RTDB authorization suite** (`npm run test:rtdb-emulator`): **345
checks, 14 registered suites, 0 failures.** This is the **real Firebase
Realtime Database emulator** evaluating the actual rules-compiler/rules-
engine (`@firebase/rules-unit-testing`), not a structural/string-match
simulation — confirmed by the rules-syntax-compile step the emulator
performs, the same compiler that later validated the production deploy
in §5. Run twice during this session (once mid-implementation, once as
final pre-deploy verification); both runs clean.

**Total: 649 automated checks, 0 failures**, across every suite touched
by or adjacent to this checkpoint's change surface. Zero warnings beyond
expected/informational `FIREBASE WARNING: ... permission_denied` noise
(the emulator correctly rejecting each check's own negative-case
assertions) and CRLF line-ending notices from `git add` (cosmetic,
Windows checkout setting, not a defect).

## 4. Version / diff integrity

- `js/config.js`: two separate, accurate `VERSION_HISTORY` entries
  (v1.30.7.9, v1.30.8) — no fabricated entries for unrelated work.
- `version.json` / `service-worker.js`'s `SW_VERSION` / `index.html`'s
  five `?v=` cache-busts: synchronized to `1.30.8` via
  `node scripts/sync-version.mjs` immediately before the Hosting deploy
  (the established, intentional-desync-until-deploy-time convention this
  repo has followed for every prior release in this program). Diff
  verified to touch only the 3 files that script is scoped to.

## 5. Deployment commands executed

```
firebase database:get / --output <scratchpad>/rtdb-backup-pre-v1.30.7.9-<ts>.json
firebase deploy --only database        # v1.30.7.9 rules fix
firebase deploy --only hosting         # v1.30.8 client
git push origin main                   # also triggers Vercel's auto-deploy
```

**Cloud Functions were deliberately NOT redeployed** — confirmed via
`firebase functions:list` (21/21 already `ACTIVE`, unchanged by this
checkpoint's diff — neither v1.30.7.9 nor v1.30.8 touches `functions/`
at all) before making that decision, per the master prompt's own
instruction not to redeploy unchanged Cloud Functions.

**Sequencing note (deliberate deviation from the master prompt's literal
phase numbering, in service of its own explicit constraint):** RTDB
rules and Firebase Hosting were deployed via the Firebase CLI **before**
`git push` — not after, as the phase list's literal order (Commit/Push =
Phase 4, Deploy = Phase 6) would suggest. Reason: `git push` to `main`
also triggers Vercel's automatic, ungated redeploy of the client (§3 of
`docs/PRODUCTION_SECURITY_DEPLOYMENT_RUNBOOK_v1.30.7.md`). Pushing before
the RTDB rules fix was live would have put the v1.30.8 UI activation (on
Vercel) into production days/hours ahead of the v1.30.7.9 rule fix it
depends on — exactly what the master prompt's own text explicitly
forbids ("Do NOT deploy v1.30.8 client activation without v1.30.7.9 RTDB
rule fix"). Deploying RTDB rules and Firebase Hosting directly via CLI
first (neither requires a git push) let both go live, get independently
verified, THEN push — so every client surface, including Vercel, only
ever sees the two changes already-together.

## 6. Firebase resources actually deployed

| Resource | Action | Result |
|---|---|---|
| RTDB Rules (`schedule-driver-pbsi-default-rtdb`) | `firebase deploy --only database` | **PASS** — syntax valid, released. Read back via `firebase database:get /.settings/rules` and diffed against local certified `database.rules.json`: structurally identical (full JSON deep-compare) AND the exact v1.30.7.9 clause text confirmed present verbatim in the live response. |
| Hosting (`schedule-driver-pbsi.web.app`) | `firebase deploy --only hosting` | **PASS** — 1195 files uploaded, released. `version.json` → `{"version":"1.30.8"}`, `index.html`'s `js/app.js?v=1.30.8`, `service-worker.js`'s `SW_VERSION = '1.30.8'` — all independently re-fetched and confirmed live, not inferred from CLI output alone. `docs/**` still 404 (pre-existing, unaffected ignore list). |
| Cloud Functions | Not deployed (unchanged) | **N/A** — confirmed 21/21 already `ACTIVE` before this checkpoint began; correctly skipped. |
| Vercel (`jadwal-driver-pbsi.vercel.app`) | Automatic on `git push` | **FAIL, then FIXED and RE-VERIFIED.** See §6.1. |

### 6.1 Vercel finding (real-time, user-confirmed)

The user opened `https://jadwal-driver-pbsi.vercel.app` in an actual
browser during this deployment and observed (screenshots taken): (1) an
indefinite stuck loading spinner on first load, then (2) on a
subsequent load, a **visibly older application UI entirely** — a legacy
"Jadwal Driver Operasional" layout with no V2 shell, no modern
workspace/executive UI — not merely "one version behind," but from
significantly earlier in this project's history.

Direct HTTP investigation (multiple checks, several minutes apart)
confirmed this with data: `version.json` returns `{"version":
"1.30.6.11"}` (not `1.30.8`), `js/admin.js` still contains the pre-v1.30.8
`"Custom Role (Belum Aktif)"` text, and — notably — `index.html`'s
`Last-Modified` header showed a **very recent** rebuild (~2 minutes old
at check time) that **still** produced old content. This means Vercel's
pipeline did rebuild after the push, but from a stale/wrong source state,
not simply "hasn't started yet." Root cause could not be determined from
this environment — **no Vercel dashboard, build-log, or API access is
available here**, matching the identical, already-documented constraint
in `docs/PRODUCTION_SECURITY_DEPLOYMENT_RUNBOOK_v1.30.7.md` §0.3
(a prior, separate Vercel misbehavior — `.vercelignore` silently not
taking effect — on this same project).

**This is isolated to Vercel specifically, not the underlying code or
this checkpoint's changes**: Firebase Hosting, built from the identical
git history via `firebase deploy --only hosting`, is confirmed correct
(`version.json` → `1.30.8`, `js/admin.js` → the new `"Custom Role"` text,
re-verified multiple times including after the Vercel finding). If
Vercel's pipeline were reflecting a real defect in the shipped code, both
surfaces would show it; only Vercel does.

**Fix attempted (`8032233`, `fix: v1.30.7.8.2`):** a leading, evidence-backed
hypothesis — this is genuinely a static site (no framework, no "build"
script), but `package.json`'s `dependencies` block includes `puppeteer`,
a heavy dependency whose install triggers a Chromium binary download.
Vercel's zero-config "Other" preset still runs an install step even
without a build script; that install is a plausible, non-deterministic
failure/timeout point matching the observed symptom exactly (a confirmed
fresh rebuild attempt that still produces stale content — the standard
signature of a failed build silently not being promoted). Fix:
`vercel.json`'s `installCommand`/`buildCommand` explicitly set to empty
strings, telling Vercel to skip both entirely and serve the repository
as pure static output — safe regardless of whether this exact mechanism
is correct, since a site with no real build step loses nothing by
skipping install/build. **Confirmed effective (not just plausible): RESOLVED.** After pushing
`8032233`, Vercel produced a new deployment (`Last-Modified` ~08:55:09
GMT, `Age: 23s` at check time — a genuinely fresh promotion, not a stale
cache hit) serving correct v1.30.8 content: `version.json` →
`{"version":"1.30.8"}`, `index.html`'s `js/app.js?v=1.30.8`,
`service-worker.js`'s `SW_VERSION = '1.30.8'`, and — the actual feature
this whole checkpoint is about — `js/admin.js` now contains
`group.label = 'Custom Role'`, not the old `"Custom Role (Belum
Aktif)"` text. `docs/**` and `functions/**` remain correctly blocked
(404), confirming the exposure-remediation routes are unaffected. All
independently re-verified via direct, cache-busted HTTP checks, not
inferred from the fix having been pushed. Root cause (heavy `puppeteer`
dependency triggering a Vercel build/install failure) remains a
well-evidenced hypothesis, not a certainty proven via build logs this
session never had access to — but the fix worked, whatever the exact
mechanism.

### 6.2 CRITICAL follow-up finding: `.vercelignore` was hiding real application code (full outage)

After §6.1's fix, the user ran a Claude in Chrome browser investigation
of the same URL and found the "stale UI" symptom persisted even after a
fully clean, cache-free, no-service-worker reload — ruling out caching
entirely. That investigation found: **zero Firebase Realtime Database
requests were ever attempted**, meaning `js/app.js`'s module graph never
executed at all.

Root cause, confirmed directly: `js/app.js:133` does a top-level static
`import * as DocumentEngine from './docs/doc-engine.js'`. That file (and
`js/docs/templates/analytics-summary.js`) returned 404 on Vercel.
`.vercelignore`'s `docs/` pattern (bare, no leading slash — gitignore
syntax for "a directory named docs at ANY depth") was also excluding
`js/docs/`, a real application code directory, alongside the intended
top-level `docs/` (markdown security reports). A failed static ES module
import fails the entire module graph before a single line of `app.js`
runs — the exact documented failure mode from a prior `v1.25.x` "Memuat..."
hotfix already recorded in `js/config.js`'s own `VERSION_HISTORY`, just
triggered by a missing import instead of a syntax error this time.

**This collision existed since `.vercelignore` was authored (v1.30.7.8)
but was not actually breaking anything until §6.1's fix**: the
deployment runbook had already documented `.vercelignore` as "verified
NOT effective" on Vercel. §6.1's install/build-skip fix made Vercel
start actually honoring ignore files for the first time — which is what
made this latent bug fire for real, taking down the **entire
application**, for every user, on the URL staff actually use day to day.

**Firebase Hosting was never affected** — confirmed directly:
`js/docs/doc-engine.js` returns 200 there. `firebase.json`'s `docs/**`
ignore entry doesn't have this collision (Firebase's own hosting-ignore
semantics are effectively root-anchored already).

**Fix (`cd18ac3`, `fix: v1.30.7.8.3`)**: every directory-name pattern in
`.vercelignore` anchored to the repository root with a leading `/`.
Verified after deploy, independently, via direct HTTP: both previously-
404 files now 200; the 4 exposure-remediation routes
(`docs/**`/`functions/**`/`database.rules.json`/`scripts/**`) still
correctly 404 (the security fix was not weakened); `index.html`/`js/app.js`
both 200; `version.json` still `1.30.8`; a spot-check of 7 other
frequently-imported `js/` subdirectory files all 200 (no other hidden
collisions found).

## 7. Production security canaries

All executed safely, read-only or against throwaway/nonexistent paths —
no real data touched.

| # | Canary | Result |
|---|---|---|
| 1 | Unauthenticated read of `drivers`, `users`, `customRoles`, `vehicles`, `settings`, `assignments`, `driver_requests` | **PASS** — all 7 return `{"error":"Permission denied"}` |
| 2 | Unauthenticated write to a throwaway canary path (root deny-by-default) | **PASS** — `{"error":"Permission denied"}`, read-back confirms nothing was persisted |
| 3 | Unauthenticated write attempting to set `users/{x}/role` directly (the exact exploit shape v1.30.7.9 closes) | **PASS** at the unauthenticated layer — `{"error":"Permission denied"}` |
| 4 | Rules content integrity | **PASS** — byte/structurally verified identical to certified source (§6) |
| 5 | **Authenticated self-write role-escalation attempt by a real non-admin production user** (the specific scenario v1.30.7.9 was written to close) | **NOT TESTED IN PRODUCTION** — this environment has no real non-admin production credentials, consistent with every prior phase of this program (see `docs/PRODUCTION_SECURITY_DEPLOYMENT_RUNBOOK_v1.30.7.md` §21's identical, standing limitation). Indirect assurance: the live rules are byte-identical to the exact rule text that passed `users-nodes-full-sweep-check.mjs`'s 9 dedicated checks for this exact scenario against the real Firebase rules engine (§3). Reported honestly as indirect, not converted to PASS. |
| 6 | Existing admin access remains functional (real admin login) | **NOT TESTED** — same credential constraint. |
| 7 | Custom Role without `system.admin` does NOT receive `adminEquivalent`; Custom Role with `system.admin` DOES | **NOT APPLICABLE** — the production `customRoles` node is confirmed **empty** (§5's fresh backup, top-level key `customRoles` absent from the 37-node export). There is currently no real Custom Role in production to test against, mirroring the exact finding `docs/PRODUCTION_SECURITY_DEPLOYMENT_RUNBOOK_v1.30.7.md` already made for the v1.30.7.7 deployment. Indirectly verified via `permission-service-check.mjs`/`role-claim-rules-check.mjs`/`verify-pin-role-resolution-check.mjs` against fixtures. |
| 8 | Archived Custom Role fails closed | **NOT APPLICABLE** — same reason as #7 (no Custom Role exists in production yet, archived or otherwise). |
| 9 | Legitimate self-profile-edit (Telegram chat ID, notifications) still writable by the record's own owner | **NOT TESTED IN PRODUCTION** (same credential constraint) — indirectly verified: `users-nodes-full-sweep-check.mjs`'s new checks confirm the exact `handleProfileSubmit()` field shape (`displayName` only, no `role`/`active`/`archived`) still passes against the identical live rule text. |

## 8. Manual verification gaps (honest, not converted to PASS)

1. Real admin login smoke test — not executable from this environment.
2. Real non-admin (viewer/driver/bidang) login smoke test — same.
3. A real, live Custom Role assignment exercised end-to-end by an actual
   admin session — not executable; also moot until an admin creates a
   first Custom Role in production (none exist yet).
4. **Vercel was found stuck serving a stale build, mid-deployment (§6.1)
   — found, fixed (`8032233`), and independently re-verified resolved,
   all within this session.** Not a standing gap after all, but worth
   recording that it happened: this is the second time this specific
   Vercel project has misbehaved in ways requiring investigation from
   outside its own dashboard (the first being the prior `.vercelignore`
   incident) — worth a human eventually checking the Vercel dashboard
   directly to understand root cause with real build logs, even though
   the symptom is now resolved.

Items 1-3 are the same class of gap the prior `v1.30.7.7` deployment
runbook already named and did not silently convert to PASS — not new
limitations introduced by this checkpoint.

## 9. Current production version

- Firebase Hosting (`schedule-driver-pbsi.web.app`): **1.30.8**, confirmed live and correct.
- Vercel (`jadwal-driver-pbsi.vercel.app`): **1.30.8**, confirmed live and correct as of the re-verification in §6.1 (was stuck on `1.30.6.11` earlier in this same deployment window; fixed).
- RTDB Rules: v1.30.7.9's fix confirmed live (byte-verified) — this
  applies to BOTH client surfaces equally, since RTDB rules aren't
  served per-hosting-target.

## 10. Is Custom Role Assignment genuinely active?

**Yes, at the code/rules level** — the `disabled` gate is removed, the
save path validates correctly, and the RTDB rule protecting the
assignment target (`/users/$username`) is deployed. **Not yet in active
use** — production holds zero Custom Roles today (`customRoles` node
empty), so no real user has been, or currently could be, assigned one
until an admin first creates one via Role Management.

## 11. Runtime authorization confirmation

Confirmed at the unit/emulator level against real production logic and
real production rule text (§3, §6). Not confirmed against a live,
real Custom Role in production, because none exists (§7, items 7-8) —
this is a data-availability gap, not an untested-code gap.

## 12. Rollback

**Not required.** No failures observed at any stage. Rollback mechanisms
remain exactly as documented in `docs/PRODUCTION_SECURITY_DEPLOYMENT_RUNBOOK_v1.30.7.md`
§15 (RTDB rules: Console history or redeploy prior JSON; Hosting:
`firebase hosting:rollback`) should they ever be needed.

## 13. Remaining known issues

- Credential migration remains at 0/32 users (pre-existing, unrelated to
  this checkpoint, informational only — tracked since the v1.30.7.7
  deployment).
- The standing "live login smoke test" gap (§8) carries forward
  unchanged from the prior deployment; not resolved or worsened by this
  checkpoint.
- The Vercel stale-build incident (§6.1) was resolved within this
  session, but its exact root cause is a well-evidenced hypothesis, not
  a certainty — recommend a human eventually confirm via the Vercel
  dashboard's build logs whether the `puppeteer`-install theory was
  actually what happened, since this project's Vercel pipeline has now
  misbehaved twice (this incident + the earlier `.vercelignore` one) and
  neither was ever confirmed via first-party logs.

---

*Report drafted during active deployment; §3/§6/§8/§9 finalized once
Vercel's propagation status was independently confirmed by direct HTTP
check (see the accompanying conversation turn for the exact evidence).*
