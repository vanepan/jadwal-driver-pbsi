# Phase 11 Post-Checkpoint Bug Investigation — "Gagal memuat Custom Roles"

**Status: root cause found, confirmed from three independent angles.
User explicitly authorized deployment after the investigation was
presented; the pending rules fix was then deployed to production and
verified read-back-and-diff. FIXED IN PRODUCTION as of this document's
update. All other Phase 11 work remains NOT committed, NOT pushed —
this deploy touched only `database.rules.json`'s live state, no local
file content changed (it was already correct) and no code was
committed/pushed anywhere.**

---

## 1. Exact root cause

**The currently-deployed production RTDB rules for `/customRoles` have no
collection-level `.read` rule.** `js/role-management/custom-roles-store.js
#initCustomRolesStore()` subscribes at the **collection** path itself
(`subscribeNode('customRoles', ...)`), never at an individual
`/customRoles/$roleId` child. Firebase RTDB evaluates a read request
against the `.read` rule at the **exact requested path and its ancestors
only** — a rule that exists solely on the `$roleId` child never satisfies
a read issued at the `customRoles` parent. With the RTDB root
deny-by-default and no `.read` on `customRoles` itself in production, that
collection subscription is silently denied for **every** role, including
a real admin session — exactly the symptom in the screenshot (Evan, a
genuine admin, sees the failure banner).

The fix for this exact defect was already written, already reasoned
through in detail, and already committed to `main` on **2026-08-14**
(commit `9746e2f4`, "v1.30.9.12 - Custom Roles Collection Read Fix") — it
is sitting in the current working tree's `database.rules.json` right now.
**It was simply never deployed to production.**

## 2. Was this a Phase 11 regression?

**No.** Confirmed three ways:

- `git status` at the start of this investigation shows `database.rules.json`
  as **unmodified** — Phase 11 (this program's implementation work) never
  touched it, consistent with Decision 2 (explicitly declined RTDB rule
  changes) being honored throughout.
- The fix commit (`9746e2f4`) predates every Phase 11 commit/session by
  nearly two weeks.
- A byte-level diff (comments and whitespace stripped) between the
  **currently-deployed** production rules and the local working-tree file
  shows **exactly one line of difference** — the missing `customRoles`
  `.read` clause. Nothing else has drifted; this is not a symptom of
  broader undeployed-hardening bundling, just this one isolated,
  never-shipped fix.

**What Phase 11 actually did:** it added the *first-ever visible
surfacing* of this pre-existing, previously-silent failure.
`js/role-management/role-management-center.js`'s audit finding "Roles
D-3" (implemented this phase) added `hasCustomRolesLoadError()` +
the warning banner specifically because, before this phase, a denied
collection read rendered **identical to "zero Custom Roles exist"** — no
warning, no visible symptom at all. The underlying denial has very likely
been happening on every real admin session since 2026-08-14; Phase 11 is
the reason it's now visible, not the reason it's happening.

## 3. Exact files/functions involved

| Layer | File | Function |
|---|---|---|
| Render (the message itself) | `js/role-management/role-management-center.js:393-397` | `customRolesLoadErrorHtml()` |
| Flag/state | `js/role-management/custom-roles-store.js:44,60-64` | `loadError` / `hasCustomRolesLoadError()` |
| Subscription (where the denial actually happens) | `js/role-management/custom-roles-store.js:70-96` | `initCustomRolesStore()` → `subscribeNode('customRoles', ...)` |
| Error classification | `js/firebase.js:537-546` | `subscribeNode()` — `onValue()`'s error callback, classified via `_classifyFirebaseError()`; a real `permission_denied` from the SDK routes to `onDenied` |
| **Rules — the actual defect** | `database.rules.json` (production, **not** the working-tree copy) | `/customRoles` node — missing parent `.read` |

**System Roles vs Custom Roles — why one works and the other doesn't:**
System Roles (`js/config/role-registry.js` / `role-permissions.js`) are
pure code-defined constants with **zero Firebase dependency** — nothing
to deny. Custom Roles are the **only** role source backed by a live RTDB
collection subscription, so they're the only one that can be blocked by a
rules gap at all. Both go through the same `getAllRoles()` in
`role-catalog.js`, so the split only becomes visible at the data-source
layer, exactly where this investigation found the actual break.

## 4. Fix applied

Per this investigation's own explicit instruction ("If the root cause
requires changing database.rules.json ... STOP. Do not implement that
part."), the investigation itself stopped short of deploying and
presented the finding for explicit authorization. **The user then
explicitly authorized deployment** ("Yes, deploy now"). No local file was
edited — the correct fix already existed verbatim in the working tree's
`database.rules.json` (the `"customRoles": { ".read": "auth.token.role
=== 'admin' || auth.token.role === 'developer'", ...}` block, committed
2026-08-14). Only its **live deployment state** changed:

```
firebase deploy --only database --project schedule-driver-pbsi
```

Result: `Deploy complete!` — rules syntax validated, released
successfully to `schedule-driver-pbsi-default-rtdb`.

**Post-deploy verification** (read-only, same discipline as the 2026-08-11
deployment): rules read back via `firebase database:get
/.settings/rules`, normalized (comments/whitespace stripped), and diffed
against the working-tree `database.rules.json` a second time —
**zero differences**. Production now exactly matches what was certified.

## 5. Why deploying it would be safe (for the record, not acted on)

Read directly from commit `9746e2f4`'s own extensive reasoning (verified,
not just quoted):
- Admin and developer **already** have unconditional child-level read
  access to every Custom Role record (including archived) via the
  pre-existing `$roleId` rule — granting them the same at the collection
  level adds no new privilege, it only fixes the broken bulk-read
  mechanics.
- The fix is deliberately **narrower** than this file's usual
  admin/developer/adminEquivalent-read convention — `adminEquivalent` is
  excluded specifically so a collection grant can't cascade into exposing
  archived Custom Role records to a claim that the child rule intentionally
  keeps out of that same data today.
- The dedicated emulator suite `scripts/rtdb-emulator/custom-roles-collection-read-check.mjs`
  re-run during this investigation: **17/17 passed**, including the
  negative cases (adminEquivalent/viewer/bidang/driver/unauthenticated all
  still correctly denied at the collection level; child-level behavior
  and `.write` completely unchanged).
- A full diff against currently-deployed production rules (§2) confirms
  this is the **only** pending change — deploying now would not
  accidentally ship any other undeployed hardening work.

## 6. Tests run and results

| Check | Result |
|---|---|
| `scripts/rtdb-emulator/custom-roles-collection-read-check.mjs` (via `npm run test:rtdb-emulator`) | **17/17 pass** — proves the fix's logic is correct (this was already known from 2026-08-14; re-confirmed here) |
| `firebase database:get /.settings/rules` (read-only, production) | Fetched successfully — 417 lines; used for the diff in §2 |
| Full normalized diff, production rules vs. working-tree `database.rules.json` | **Exactly 1 line of difference** — the missing `customRoles` `.read` |
| `git status` / `git log -- database.rules.json` | Confirms Phase 11 never touched this file; confirms the fix commit predates Phase 11 |

No Role Management/Administration DOM test in the Phase 11 suite exercises
this specific failure mode, because none of them can — see §7.

## 7. Test coverage gap (why nothing caught this sooner)

The existing regression suite for this exact fix
(`custom-roles-collection-read-check.mjs`) runs against a **local Firebase
RTDB emulator**, loaded from the working-tree `database.rules.json` — by
construction, it verifies the fix's *logic*, and can **never** detect
whether that logic has actually been *deployed*. This is a real,
structural blind spot: this codebase has no automated check that compares
working-tree rules against live production rules. The 2026-08-11 deploy
(`docs/PRODUCTION_RTDB_DEPLOYMENT_REPORT_v1.30.9.2.md`) had its own
dedicated, manually-run "read back from production and diff" verification
step — but that discipline is deploy-time only, not continuous, so a rules
fix that's certified-but-never-deployed (like this one) has no automated
tripwire between commit and the next manual deploy-and-verify cycle.

Per this investigation's own instruction ("Do not inflate this into a new
test-coverage phase"), no new test was added here. Worth flagging
separately for the user's consideration: a lightweight CI/pre-deploy check
that diffs the working tree's `database.rules.json` against
`firebase database:get /.settings/rules` would have caught this
immediately rather than 13 days later via a real user noticing a UI
banner.

## 8. Hostile review — specific challenges

- **Is the warning gone because the error was hidden?** N/A — no code was
  changed. The warning is real, accurate, and (per this investigation)
  should stay exactly as-is until the underlying rules gap is deployed.
- **Did we merely mask the failure?** No masking occurred — nothing was
  implemented.
- **Could a fix here have widened role visibility?** No fix was applied.
  Had the pending fix been deployed, §5 shows it would not: the
  emulator suite's negative cases (adminEquivalent excluded, viewer/
  bidang/driver/unauthenticated all denied) prove the boundary is
  unchanged for everyone except admin/developer, who already had
  equivalent child-level access.
- **Does an empty Custom Roles collection render correctly as empty,
  distinct from "failed to load"?** Yes — `loadError` is a separate flag
  from the `customRoles` array; `refreshCache()` (a successful load, even
  of zero records) explicitly sets `loadError = false`. A genuinely-empty
  collection would render the normal empty state, not this banner.
- **Auth initialization race?** Not applicable to this finding — the
  denial is a rules-evaluation outcome (`permission_denied`), not a
  timing issue; it fires the same way on every load, every refresh, every
  session, admin or not, until the rules gap is closed in production.

## 9. Final classification

**FIXED** — deployed to production 2026-08-27 after explicit user
authorization, verified read-back-and-diff (§4). Not a new security
review; the fix itself was already reviewed, reasoned through, and
certified on 2026-08-14 (commit `9746e2f4`) — it only needed to actually
ship, which it now has.

**Remaining action for the user:** refresh the live browser session shown
in the original screenshot (or any other open admin session) — the
in-page `.rm-error` banner will not update on its own without a fresh
`/customRoles` subscription, since the SDK's existing denied listener
isn't automatically retried. A page reload re-subscribes and should load
cleanly with the rule now in place.

This deploy touched `database.rules.json`'s live state only. No code was
committed or pushed; Phase 11's own implementation work (§1 of the
program report) remains exactly as it was — uncommitted, unpushed,
awaiting review — and Decision 2 (declining the separate
`userPermissionOverrides`/`system.users.manage` asymmetry) is untouched
and still in effect.
