# CLAUDE IN CHROME — PRODUCTION CUSTOM ROLE FIRST-USE VERIFICATION

Copy everything below the line into Claude in Chrome. **Before sending
it, fill in the two placeholders** — `<<TEST_USERNAME>>` and
`<<TEST_USER_DISPLAY_NAME>>` — with a real, disposable, non-admin
production account you have personally confirmed is safe to use (not a
real staff member's account). This cannot be chosen by an AI with no
operational context on which accounts are genuinely disposable.

**Why this whole thing is one Claude-in-Chrome prompt, not split between
Claude Code and Claude in Chrome**: every phase here requires clicking
through the real Role Management UI, the real User Management UI, and a
real logout/login cycle. Claude Code has no browser — it already
confirmed the read-only pre-flight facts below via CLI/curl, but cannot
perform any of the actual UI steps.

**Pre-flight facts already confirmed from the server side (you do not
need to re-derive these, only re-confirm #1-#2 visually in the browser
before proceeding):**
1. Firebase Hosting (`schedule-driver-pbsi.web.app`) and Vercel
   (`jadwal-driver-pbsi.vercel.app`) both independently confirmed serving
   `version.json: "1.30.8"` via direct HTTP check.
2. Both previously-broken app files (`js/docs/doc-engine.js`,
   `js/docs/templates/analytics-summary.js`) confirmed 200 on Vercel — the
   full-outage bug from earlier this session is fixed.
3. `/customRoles` confirmed empty (`null`) via `firebase database:get` —
   this will be the FIRST real Custom Role ever created in this
   production database.
4. RTDB rules confirmed live with the v1.30.7.9 self-write-escalation fix
   (`git` commit `22e256d`) still present, byte-verified against the
   deployed rules text.
5. `git status` on the deployment repo is clean (only untracked report
   docs from this session, nothing pending).

---

PRODUCTION CUSTOM ROLE FIRST-USE VERIFICATION
==============================================

This is a LIVE production test using real data. Read every safety rule
below before touching anything.

TEST SUBJECT (fill in before running)
--------------------------------------
Test username: `<<TEST_USERNAME>>`
Test user display name: `<<TEST_USER_DISPLAY_NAME>>`

This account has been confirmed by the human operator to be a genuinely
disposable, non-admin test account — NOT a real staff member's account.
If you cannot independently confirm this account exists and is not an
admin once you're in User Management, STOP and report
"MANUAL GAP: could not confirm test user identity/safety" rather than
proceeding on assumption.

PRIMARY OBJECTIVE
------------------
Prove the already-built Custom Role lifecycle works end-to-end against
real production data:

Create Custom Role → save → appears in Role Management → assign to test
user → user logs in again → verifyPin resolves the Custom Role → runtime
permission resolution works → module access matches the role's
permissions → adminEquivalent stays false unless system.admin is
explicitly granted → Role Usage reflects assignment → Archive Guard
blocks archiving while in use → removing/reassigning behaves correctly.

DO NOT rebuild anything that already exists. DO NOT introduce a new
authorization mechanism. DO NOT modify production code, database rules,
or Cloud Functions unless a concrete defect is discovered and proven —
and even then, STOP and report rather than fixing it yourself.

==================================================
STRICT SAFETY RULES
==================================================

- No broad data writes. No mass assignment.
- No changes to any existing production role other than the one new test
  role you create.
- No changes to any user other than the one designated test user.
- No real Telegram notification triggers unless unavoidable — if any
  action you're about to take would send one, stop and reconsider a
  safer path first.
- Never print, log, or expose credentials, PINs, tokens, or cookies.
- Do not manually edit the database. Every mutation in this test must go
  through the real application UI — if the UI can't do something, that
  itself is a finding to report, not something to work around via direct
  data manipulation.
- Do not modify code. Do not open a code editor or terminal.
- This is an OBSERVATION-AND-CONTROLLED-MUTATION pass, not a free-form
  exploration — follow the phases in order, don't improvise extra
  changes.

==================================================
PHASE 1 — CREATE A NON-ADMIN CUSTOM ROLE
==================================================

In the real Role Management UI, create exactly ONE Custom Role:
- Name: "Production Verification - Test Role" (or similar, clearly
  identifiable as temporary/test).
- Permissions: a small, safe set covering ONE or TWO ordinary modules —
  pick permissions that are easy to visually verify (the user gains
  access to something they didn't have before).
- Do NOT include `system.admin` or anything that would make this role
  effectively administrative.

Before saving, record: role name, description, exact permissions
selected, permission count, and confirm `system.admin` is NOT among them.

Save through the real UI. Then reload and read the record back:
- Confirm it exists, is Active, `archived` is false/absent.
- Confirm the stored permission set matches what you selected.
- Confirm no unexpected fields appeared.

STOP if the saved record differs materially from what you selected.

==================================================
PHASE 2 — VERIFY ROLE CATALOG / ROLE SUMMARY
==================================================

Reload Role Management. Confirm:
- The new role appears, status Active.
- Its Role Summary shows correct permission labels and count.
- No "Belum Aktif" text appears anywhere for this or any other active
  Custom Role.
- Archived roles (if any exist) are still excluded from assignment
  pickers.
- Role Usage for this new role shows 0 (unassigned).

==================================================
PHASE 3 — ASSIGN THE CUSTOM ROLE TO THE TEST USER
==================================================

In User Management, open the test user's edit form. Record their
CURRENT role before changing anything.

Assign the new Custom Role, save through the real UI. Verify:
- The user record now shows this Custom Role.
- Role Usage for the role increments to 1.
- No other field on the user (display name, active status, etc.)
  changed.

If the UI fails to save or behaves unexpectedly: STOP. Report the exact
error. Do not work around it by editing data directly.

==================================================
PHASE 4 — FORCE A REAL AUTHORIZATION REFRESH
==================================================

Custom Role resolution happens at login/token-mint time, not live. The
test user's existing session (if any) will NOT pick up the new role
automatically.

- Log out the test user (if currently logged in as them; otherwise skip
  to login).
- Confirm the session is actually gone (login screen shown).
- Log back in as the test user through the normal login flow.
- Confirm login succeeds.

Do not inspect raw token contents unless the browser's own normal UI
already surfaces role/permission state somewhere safe (e.g. a profile
panel) — do not use DevTools to extract or display the token string,
PIN, or any credential material.

==================================================
PHASE 5 — VERIFY REAL RUNTIME PERMISSIONS
==================================================

For each permission you granted in Phase 1:
- Confirm the corresponding module/nav item is now visible and
  accessible to the test user.
- Confirm at least one basic, safe action inside that module works (view
  only if a real action would mutate unrelated data).

For at least one permission you deliberately did NOT grant:
- Confirm the corresponding module/nav item remains hidden/inaccessible.
- This is the important assertion: access is determined by the Custom
  Role's actual granted permissions, not merely by "having a Custom
  Role" at all.

==================================================
PHASE 6 — VERIFY ADMIN SEPARATION (MANDATORY)
==================================================

Expected for this first, non-admin test role: the user does NOT see any
admin-only UI, cannot access Role Management or User Management
themselves, and has no capability beyond what was explicitly granted.

If the test user unexpectedly gains ANY administrative capability or
admin-only UI: **STOP IMMEDIATELY. Do not continue to later phases.**
Report exactly what was seen.

==================================================
PHASE 7 — ROLE USAGE + ARCHIVE GUARD
==================================================

While still assigned:
1. In Role Management, confirm Role Usage = 1 for the test role.
2. Attempt to archive the test role through the normal UI.
3. Expected: archival is BLOCKED (role is in use). Confirm the user
   remains assigned throughout — don't let a failed archive attempt
   leave things in a weird state.

Then, in User Management, change the test user back to their ORIGINAL
role (recorded in Phase 3) or remove the Custom Role — through the real
UI.
4. Confirm Role Usage returns to 0.
5. Confirm the test user shows the expected (original) role.
6. NOW attempt to archive the test role again.
7. Expected: archival is now PERMITTED.

**Do not actually confirm/complete the archive yet** — stop just before
finalizing it, so Phase 10's cleanup can decide the final disposition
with full evidence already collected.

==================================================
PHASE 8 — REASSIGNMENT / FAIL-CLOSED TEST
==================================================

After the role was removed from the test user (Phase 7):
- Log the test user out and back in again (fresh session).
- Confirm they no longer have the permissions the Custom Role granted.
- Confirm the role definition itself is untouched (still exists, same
  permissions) — only the USER's assignment changed, not the role.

This proves authorization comes from the current assignment, not cached
client state.

==================================================
PHASE 9 — OPTIONAL ADMIN-EQUIVALENT TEST
==================================================

Only attempt this if Phase 1-8 fully succeeded AND a second safe,
disposable, non-admin test account is available to you (do not reuse an
account you're unsure about, and never use the primary admin account as
the subject).

If no second safe test account exists: SKIP this phase and report it as
"NOT TESTED — no second safe test account available." Do not fabricate
a result.

If performed: create a SECOND test Custom Role granting exactly
`system.admin`, assign to the second test account, log out/in, and
verify: the role field is still the Custom Role's own ID (not the
literal string `admin`), the user now has administrative capability, and
this did not silently convert the role into the real `admin` system
role.

==================================================
PHASE 10 — CLEANUP (MANDATORY, DO NOT SKIP)
==================================================

Regardless of pass/fail outcome above:
1. Confirm the test role is not assigned to anyone (Role Usage = 0).
2. Confirm the test user's role is back to its original value from
   Phase 3.
3. Archive (or otherwise remove per the product's normal lifecycle) the
   temporary test Custom Role(s) created in Phase 1 and (if run) Phase 9.
4. Confirm no other user or role was touched.
5. Re-open Role Management and User Management one final time and
   confirm the state looks exactly as it should — no leftover privileged
   test role assigned to anyone.

**Do not leave a test role assigned to any account when you finish, even
if an earlier phase failed.**

==================================================
STOP CONDITIONS — report immediately, do not continue past these
==================================================

- The Custom Role save creates unexpected/extra data.
- An archived or unknown role becomes assignable.
- The Custom Role resolves as literal `admin`.
- `adminEquivalent`-style elevated access appears without `system.admin`
  being granted.
- The user retains permissions after removal + a fresh login.
- Role Usage count is wrong at any point.
- Archive Guard allows archiving a role that's still in use.
- The non-admin test role grants ANY admin-only capability.
- Any user or role OTHER than the designated test subject changes.
- Anything suggests a code, rule, or Cloud Function change is needed.

If any of these happen: stop, do not attempt a fix, do not improvise
around it, and include it prominently in the final report.

==================================================
EVIDENCE REQUIREMENT
==================================================

For each phase, note concretely what you observed (not just "it
worked") — the actual values/labels/counts shown in the UI, not an
inference. Screenshots for: the created Role Summary, the assignment
result, Role Usage before/after, the test user's navigation before vs.
after login with the new role, and the final cleaned-up state.

==================================================
FINAL REPORT FORMAT
==================================================

# PRODUCTION CUSTOM ROLE FIRST-USE VERIFICATION REPORT

1. Environment / production versions observed
2. Test role (name, id, permissions)
3. Test user
4. Pre-test state
5. Custom Role creation result
6. Assignment result
7. Login/token refresh result
8. Runtime permission result (granted permissions work)
9. Negative permission result (ungranted permissions still blocked)
10. Admin/adminEquivalent separation result
11. Role Usage result
12. Archive Guard result
13. Role removal/reassignment result
14. Optional adminEquivalent test result (or NOT TESTED)
15. Cleanup result
16. Production data integrity result (nothing else touched)
17. Defects found (if any)
18. Manual verification gaps
19. Final decision: PASS / FAIL / BLOCKED

Use exactly: PASS, FAIL, NOT TESTED, NOT APPLICABLE, or BLOCKED for each
item. Never write PASS for something you only inferred rather than
directly observed in the browser.

This is a LIVE production test — execute conservatively, report
evidence, not optimism. If genuinely unsure whether an action is safe,
stop and ask rather than guessing.
