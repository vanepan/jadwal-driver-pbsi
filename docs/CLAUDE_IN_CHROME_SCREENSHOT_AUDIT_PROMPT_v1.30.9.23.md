# Ready-to-paste Claude in Chrome prompt — Visual Ground-Truth Capture

**Audited at:** APP_VERSION v1.30.9.23 · 2026-08-16
**Purpose:** Round 1 of the redesign (`docs/CLAUDE_DESIGN_HANDOFF_PROMPT_v1.30.9.12.md`) produced 16 real Claude Design mockups, but the implementation that followed was built from a *prose summary* of those mockups, never the mockups themselves — and separately, neither pass ever captured what the live production app actually looks like today. `V1_TRUE_REDESIGN_GAP_ANALYSIS.md` names both gaps explicitly and closes with: *"It does not include live authenticated screenshots of the production app — that remains a standing limitation for final visual sign-off."* This prompt closes that specific gap. Copy everything in the fenced block below into Claude in Chrome as one message, in a browser tab where you're already logged into the real app.

**Before you paste:** log in as **admin** first — the large majority of this checklist is admin-only screens (6 of 10 top-level modules require admin). You'll be asked to re-log-in as other roles for the smaller Tier 3 pass later. Point the browser at the **production URL you normally use** — not a local dev server — so what gets captured is the real thing users see today, not the uncommitted in-progress redesign work currently sitting in the local working tree.

---

```
You are doing a pure visual observation pass over a live, in-daily-use production operational application —
Sarpras Operations — to build a ground-truth screenshot set for a design team (Claude Design) that is about
to redesign this application from the ground up. You are NOT testing functionality, NOT filing bugs, and
MUST NOT change, submit, approve, delete, archive, or otherwise mutate any real data, permission, role, or
credential — this holds even where a control appears safe, per standing house policy for this app. Screens
that require submitting a form to view (e.g. a confirmation state) should be opened and screenshotted in
their pre-submit state, then cancelled/backed out, never completed for real.

## WHAT THIS APP IS (context so you can navigate intelligently, not just click blindly)

Sarpras Operations is a facilities/transport operations platform for an organization called PBSI: driver
scheduling and dispatch, vehicle fleet management, warehouse operations, overtime payroll, petty cash /
official documents, engineering work orders, and executive analytics. It is a single-page app, installable
as a PWA, with a light/dark theme toggle and a responsive shell (desktop rail+panel nav, mobile
hamburger-drawer + bottom tab bar). Six roles exist: **admin** (runs everything — the only role with access
to 6 of the 10 top-level modules), **bidang** (requests a vehicle/driver, can self-drive), **driver**
(executes assigned trips), **viewer** (legacy read-only — low priority, capture briefly if reachable),
**engineering_coordinator** and **engineering_member** (a separate field work-order module). Do NOT attempt
to reach "Sarpras Intelligence" / a pilot-only module gated to a single identity — it's explicitly out of
scope for this redesign effort; skip it if you see it in the nav.

## GROUND RULES

1. Pure observation. No writes. Opening a create/edit form to screenshot it empty (or filled with
   already-existing real data, unedited) is fine; clicking Save/Submit/Approve/Delete/Archive/Generate/
   Close-Period/Reset-PIN is NOT, even as a "just to see the confirmation" test.
2. If a flow requires a destructive or generative final step to reach a later screen (e.g. NOR document
   generation burns a sequential number; period closing is one-way), capture every step up to and including
   the confirmation dialog, then cancel out. Note in your manifest (see below) that the final state was not
   captured and why.
3. If you hit a genuinely empty list/table (nothing to show) or a state you can't safely reach, note it in
   the manifest as "not captured — reason" rather than skipping it silently.
4. Capture both the light and dark theme where the checklist below marks it (☀/🌙); the theme toggle is in
   the app's top bar / settings.
5. Try to capture at these three viewport widths where marked (🖥 desktop ~1440px, 📱 tablet ~1024px,
   📱 mobile ~390px) — use the browser's device toolbar / responsive mode rather than physically resizing if
   that's more reliable for you.

## PRIORITY TIERS — work top to bottom; later tiers are lower-value, do them if time/patience allow

### TIER 1 — every module, every screen, main state, 🖥 desktop, ☀ light, role=admin (the backbone pass)

For each item below: capture the screen itself, then any modal/drawer/popup listed under it opened once.

**Home** — the admin variant ("Executive Command Center"): hero/headline area, attention/alerts list,
recommendation cards (note whether Accept/Dismiss controls exist), driver-status list, vehicle-flags list,
activity feed, quick-launch area.

**Driver Operations / "Papan Jadwal" (Assignment Board)** — this is the flagship screen, be thorough:
  - Timeline (grid) view, a date with several assignments on it
  - Daftar (List) view toggle
  - "Tambah Jadwal" (create assignment) modal, empty
  - An existing assignment block clicked → its detail modal
  - The vehicle-color legend specifically (scroll to it if below the fold) — known issue: it's a static
    4-item list, capture it clearly so an added 5th vehicle's absence (if applicable) is visible
  - Two assignment blocks that visually represent the same shared trip/convoy, if any exist today
  - An assignment with a long title, to capture the truncation behavior
  - Start-trip odometer modal, Complete-trip odometer modal (open + cancel, don't submit)
  - Requests tab: the Ajukan list, and the Approve modal including the Dispatch Recommendation panel
  - Manajemen Driver (list + create/edit form)
  - Manajemen Kendaraan (Inventory tab, Prediction tab)
  - Vehicle detail drawer, every tab it has
  - Audit Driver, Audit Kendaraan

**Petty Cash Center** — Dashboard, Pengeluaran (expense list + add-expense form), Generate NOR flow up to
(not including) the final "generate" click, Riwayat NOR, Pengaturan.

**Overtime Management** — Dashboard, Rekap Lembur, Karyawan, Tarif, Hari Libur, Laporan, Riwayat Laporan,
Penyesuaian Data, Tutup Periode (up to but not past the confirmation), Arsip.

**Analytics** — Driver Analytics, Petty Cash Analytics, Executive Analytics (the Health Score view), 
Engineering Analytics, Dispatch Analytics / Recommendation Accuracy, Driver Wellness, Driver Prediction,
Vehicle Prediction, Export Center.

**Konfigurasi** — Manajemen User (list + one user's edit form, showing role assignment and any Individual
Permission override UI — do NOT click Reset PIN), Konfigurasi Global.

**Role Management** — System Roles (read-only list), Custom Roles list, a Custom Role's edit view (note
anywhere it says assignment is disabled/not-yet-available).

**Engineering Operations** — Dashboard, Timeline, Pekerjaan (job queue / kanban-style view — capture its
exact column structure), a work-order detail view, Pengaturan, Engineering Analytics.

**Gudang (Warehouse)** — Dashboard, Catalog/Home, Goods In, Goods Out, Movement History, Stock Opname,
Analytics, Inventory Intelligence. Note whether these feel like one connected workspace or separate screens
you navigate between — that distinction matters a lot for the redesign brief.

**Shared chrome** — the notification bell dropdown, the full-screen mobile notification list (if reachable
at desktop width, note that), a toast/success message (trigger one via any safe action, e.g. toggling a
non-destructive UI preference), the global search if one exists, the nav rail/sidebar itself fully expanded.

### TIER 2 — flagship screens only, additional breakpoints/theme (still role=admin)

Repeat just **Home**, **Papan Jadwal (Timeline + List)**, and **Vehicle detail drawer** at:
  - 📱 mobile width, ☀ light
  - 📱 mobile width, 🌙 dark
  - 🖥 desktop width, 🌙 dark (specifically check whether any card/panel/modal background stays white in
    dark mode — this is a known, named issue: `var(--white)` dark-mode trap — call out any instance you see)
  - 📱 tablet width, ☀ light

### TIER 3 — other roles, brief pass

Ask the user to log you into each of these in turn; for each, capture just the Home landing + Papan Jadwal
as that role sees it (🖥 desktop, ☀ light only):
  - **bidang** — Home should show a request workspace; note whatever single primary CTA it has
  - **driver** — Home should show a driver workspace with active/today/upcoming trips
  - **engineering_coordinator** or **engineering_member** — Home + the Engineering module's job view for
    that role specifically (note what's hidden/shown compared to the admin view)
  - **viewer**, if a test account exists — brief, low priority

## SPECIFIC THINGS TO VERIFY WHILE YOU'RE THERE (known issues — confirm or refute with a screenshot)

- Do primary/secondary/danger buttons in forms look short/thin compared to the nav's touch targets? 
- Does any modal or card have a white background that doesn't adapt in dark mode?
- Is the mobile List/Daftar toggle actually reachable on the Papan Jadwal at mobile width, logged in as
  admin? (A prior audit found it hidden for admin/bidang on phones — confirm current state either way.)
- Do the Warehouse and Overtime modules feel like tabs inside one shell, or like separate pages you navigate
  between via a hub/menu?

## OUTPUT

For every screenshot, use a short caption in this shape when you present results:
`{module} — {screen/state} — {breakpoint} — {theme} — one-line note on anything notable`

At the end, produce a single manifest (a table or list) of everything captured, in the order captured, plus
a short list of anything in the checklist you could NOT reach and why (permission, no test data, role
unavailable, etc.). The user will carry this manifest and the screenshots into a separate design tool —
your job ends at producing a complete, well-captioned set, not at proposing any redesign yourself.
```
