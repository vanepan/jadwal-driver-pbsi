# CLAUDE IN CHROME — MANUAL PRODUCTION VERIFICATION PROMPT

Copy everything below the line into Claude in Chrome.

---

You are doing a **safe, read-mostly manual verification** of a feature
called "Custom Role Assignment" that was just deployed to the Sarpras
Operations application. **Do not modify code, run terminal commands,
commit, push, deploy, or change any production configuration.** This is
browser-only verification.

**Production URL**: https://jadwal-driver-pbsi.vercel.app (the URL staff
actually use day to day).

**Background, for context only — already resolved, no action needed
from you:** mid-deployment, this URL was briefly found stuck serving a
stale build (a Vercel platform issue, unrelated to the application
code). It was fixed and independently re-verified live at the correct
version via direct HTTP checks before this prompt was finalized. If you
still see anything that looks stale or broken (an old-looking UI, a
version other than `1.30.8`), don't assume it's expected — record it
exactly as observed in your report; it would mean the issue recurred.
Fallback if this URL is unreachable or clearly broken:
https://schedule-driver-pbsi.web.app (Firebase Hosting — the same
application, an independent hosting surface).

## Steps

1. Open the production URL above. Confirm it loads without console
   errors.

2. Find the displayed application version (check the page footer/about
   area, or open DevTools → Application → Service Workers to see the
   registered version, or view page source for `js/app.js?v=`). Record
   it. Expected: `1.30.8`. If it shows something older (e.g. `1.30.6.11`
   or `1.30.7.7`), record that exactly — do not assume it's wrong, just
   report the actual value.

3. Log in **only if you already have an authorized admin session
   available through the normal browser** (e.g. already logged in, or a
   password manager offers to fill known-good credentials in the
   browser's own UI). **Never ask the human to paste a password or PIN
   into this chat. Never attempt to guess, brute-force, or discover
   credentials. Never bypass the login screen.** If no admin session is
   readily available through normal means, STOP here and report:
   "MANUAL GAP: no admin session available for verification."

4. Navigate to User Management (usually under Konfigurasi / a user icon
   / admin panel — look for "Manajemen User" or similar).

5. Open the "Add User" or "Edit User" form (the create/edit user
   interface with a Role dropdown).

6. In the Role dropdown, verify:
   - The standard System Roles (Admin, Bidang, Viewer, Driver,
     Engineering) still appear normally.
   - If any **Custom Roles** appear (they may not — production may have
     zero Custom Roles defined right now, which is expected and fine):
     - They must NOT be grayed out / disabled — you should be able to
       click and select one.
     - The group label should say "Custom Role", NOT "Custom Role
       (Belum Aktif)".
     - Archived Custom Roles (if you know of any) must NOT appear in
       this list at all.
   - If there are genuinely zero Custom Roles in the dropdown, that is
     an expected, valid state — report it as such, don't treat it as a
     failure.

7. **Do NOT select a Custom Role and save it against any real user
   unless BOTH of these are true:**
   - A Custom Role actually exists to select in step 6, AND
   - You are certain the account you're about to edit is an explicitly
     designated, disposable, safe test account (e.g. its username/display
     name literally says "test" and it is not attached to a real staff
     member).
   
   **If no safe test account exists, or no Custom Role exists to test
   with, STOP the assignment portion here and report:**
   "MANUAL GAP: no safe production test scenario available (either no
   Custom Role exists yet, or no designated safe test user exists)."
   **Do not improvise, do not use a real staff member's account, do not
   create a new real-looking user "just to test."**

8. **If and only if** step 7's both conditions are met and you proceed:
   - Select the Custom Role, save.
   - Reload the page fully (hard refresh).
   - Re-open that same user's edit form and confirm the Custom Role is
     still selected (proves it persisted to the database, not just
     local UI state).
   - Check the Role Summary panel shown in the form — confirm it shows
     a role Type ("Custom"), a Status ("Aktif"), a Permission count, and
     a Module count, all as plausible non-error values.

9. If the Custom Role you assigned has non-admin permissions and you
   know which module(s) it should/shouldn't grant access to, you may
   log in as that test user (only if you have legitimate access to do
   so) and spot-check ONE permitted module loads and ONE non-permitted
   module is correctly blocked. If you don't have a way to log in as
   that test user, skip this and report it as NOT TESTED, not as a
   failure.

10. If the Custom Role includes `system.admin`-level permissions, do
    NOT assume the UI shows an "Admin" badge or equivalent — just
    report what you actually observe in the Role Summary panel, nothing
    inferred.

11. Confirm normal System Roles (e.g. open the edit form for a Driver or
    Bidang user) still work exactly as before — role shows correctly,
    form saves normally (only check this if you're not going to
    actually change anything about a real user; observing the form
    pre-filled correctly is enough, you don't need to submit it).

12. **If you modified a real test user in step 8**, restore its
    original role now:
    - Edit the same user again, set the Role dropdown back to its
      original value.
    - Save.
    - Reload and confirm the original role is back.
    If you did NOT modify any user (because step 7 stopped you), skip
    this step — there's nothing to restore.

13. Do not modify any other user. Do not archive/unarchive or edit any
    Role definition. Do not change any permission. Do not trigger any
    notification, create any operational assignment (driver
    schedule/request), or touch any business data outside the one test
    user (if any) from steps 7-8.

14. Take screenshots of:
    - The User Management role picker showing the dropdown open
      (Custom Role visible/selectable, or empty state if none exist).
    - The Role Summary panel (if you got to see one).
    - The persisted result after reload (if you performed step 8).
    - The restored state after reload (if you performed step 12).

15. Produce this exact final report format, one line per item, using
    only `PASS`, `FAIL`, `GAP`, or `NOT TESTED` (never invent a status,
    never mark something PASS if you only read about it rather than
    observed it in the browser):

```
VERSION: <what you saw> — <PASS if 1.30.8, otherwise report actual + NOT MATCHING>
LOGIN: <PASS/GAP/NOT TESTED + one line detail>
USER MANAGEMENT: <PASS/GAP/NOT TESTED>
CUSTOM ROLE VISIBILITY: <PASS/GAP/NOT TESTED — note if zero Custom Roles exist, that's a valid PASS-with-note, not a failure>
CUSTOM ROLE ASSIGNABILITY: <PASS/GAP/NOT TESTED>
ROLE SUMMARY: <PASS/GAP/NOT TESTED>
PERMISSION BEHAVIOR: <PASS/GAP/NOT TESTED>
PERSISTENCE: <PASS/GAP/NOT TESTED>
RESTORATION: <PASS/GAP/NOT TESTED/NOT APPLICABLE — NOT APPLICABLE only if you never modified a real user>
SYSTEM ROLE REGRESSION: <PASS/GAP/NOT TESTED>
SECURITY OBSERVATIONS: <anything unexpected you noticed, or "none">
MANUAL GAPS: <list every "MANUAL GAP:" you reported above, or "none">
```

## Hard stop conditions

Stop immediately and report the exact screen/state (don't keep clicking
around trying to fix it yourself) if:
- Login fails unexpectedly for what should be a valid session.
- Any role — Custom or System — appears to grant access to something
  that looks clearly wrong (e.g. a non-admin test account suddenly
  shows admin-only controls it shouldn't).
- The application throws visible errors, a blank screen, or a crash.
- Anything else looks like it doesn't match this prompt's expectations.

Never claim something was verified if you only inferred it from reading
code, documentation, or this prompt itself — every PASS in your final
report must correspond to something you actually saw happen in the
browser during this session.
