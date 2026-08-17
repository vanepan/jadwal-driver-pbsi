# Ready-to-paste Claude Design prompt
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14. Copy everything in the fenced block below into Claude Design as one message.

---

```
You are designing an existing, in-daily-use production operational application — Sarpras Operations —
NOT creating a fictional dashboard. Every screen you design must map to a real feature with real data,
real states, and real operational consequences.

## PRODUCT CONTEXT

Sarpras Operations is a vanilla-JavaScript SPA (no framework) + Firebase Realtime Database backend, used
daily by a facilities/transport operations team (PBSI) to manage: driver scheduling and dispatch, vehicle
fleet management, warehouse operations, overtime payroll, petty cash/official documents, engineering work
orders, and executive analytics/predictions. It is also an installable, offline-capable PWA. The app has
shipped hundreds of increments; its engineering (conflict prevention, permission model, prediction
pipeline) is mature and correct. What needs work is the PRESENTATION LAYER, which accumulated
inconsistency through incremental, module-by-module growth: 3-4 parallel color/token systems, 20+
uncoordinated responsive breakpoints, duplicated components, and touch-target/mobile gaps fixed in some
places but not others.

## TARGET USERS (verified from the actual role system — do not invent others)

- **admin** — runs the whole operation. The only role with access to 6 of the app's 10 top-level modules
  (Petty Cash, Overtime, Analytics, Konfigurasi/Settings, Role Management, Warehouse are ALL admin-only).
  Design primarily for this power user in those six modules.
- **bidang** — requests a vehicle/driver for their org department; can self-drive.
- **driver** — executes assigned trips (start/complete with odometer capture).
- **viewer** — legacy, read-only, low-priority.
- **engineering_coordinator** / **engineering_member** — separate work-order module (field coordination
  vs. execution), distinct assignment lifecycle from driver scheduling.
- A "Custom Role" concept exists in the data model but is NOT assignable to real users yet — do not design
  around it being live today.

Access pattern in one line: Driver Operations is the one genuinely multi-role module. Everything else is
either admin-only or role-siloed (Engineering). A "Sarpras Intelligence" module exists but is gated to a
single pilot user and is architecturally/philosophically distinct (an "Organizational Learning Platform,"
not a CRUD tool) — SCOPE THIS OUT of your redesign; do not touch it.

## COMPLETE FEATURE INVENTORY (55 features across 14 areas — condensed; ask for the full
## FEATURE_UX_AUDIT.md table if you need per-feature Firebase paths/roles)

Assignment/Scheduling (10): the Assignment Board itself, create/edit with conflict detection, the
Ajukan→Approve request workflow with an AI-style dispatch recommendation panel + decision replay audit
trail, per-request comments, trip lifecycle (start/complete/cancel + odometer capture), overtime override,
WhatsApp summary export, an admin-only data-recovery console tool, unsaved-changes form guard.
Drivers (6): driver master data CRUD, a driver's own personal dashboard, driver-scoped audit log, driver
wellness/fatigue dashboard, driver prediction dashboard, the capacity/recommendation engine feeding both.
Fleet/Vehicles (11): vehicle CRUD, a deliberately-capped 5-KPI fleet dashboard, a rich detail drawer
(health/compliance/maintenance), a reminder panel, a unified activity timeline, prediction dashboard,
recommendation panel, "what-if" scenario simulation, maintenance records+projection, compliance/insurance
tracking, vehicle-scoped audit.
Warehouse (1 module, 8 screens): full warehouse OS — catalog, goods in/out, movement history, stock
opname, analytics, inventory intelligence. Admin-only (no warehouse-staff role exists).
Overtime (1 module, 10 screens): tiered-rate overtime computation, holiday calendar, period closing,
reports+export, archive. Admin-only.
Petty Cash (1 module, 5 screens + document generation): expense tracking against a cycle balance,
generates an official sequentially-numbered "NOR" letterhead PDF/Excel document. Admin-only.
Engineering (1 module, 5 screens): work-order execution distinct from driver scheduling (join→start→
finish/postpone→verify lifecycle), 3-tier role capability (admin/coordinator/member).
Reimbursement (1): per-trip overtime pay PDF generator, admin+driver.
Shared Document Framework (1): one PDF/DOCX engine every generated document uses.
User & Role Management (3): user CRUD + role assignment + individual permission overrides, a Role
Management center (view system roles, author custom roles), the underlying permission-override layers.
Notifications (3): in-app bell + activity log, web push, Telegram bot linking.
Analytics/Executive/Prediction (8): a role-tailored Home dashboard for every role, domain analytics
(driver/pettycash/executive/engineering), dispatch-recommendation accuracy tracking, a "what should the
admin do" recommendation board, scenario simulation, the certified prediction service every dashboard must
consume, an export center, and Sarpras Intelligence (OUT OF SCOPE per above).
Settings (3): global config, per-module settings, feature flags.
PWA (2): install flow + silent auto-update, offline indicator.

## CURRENT INFORMATION ARCHITECTURE

Shell = 64px icon Rail + Section Panel + Topbar + Main content area (desktop); on mobile this same rail
physically relocates into a hamburger drawer (NOT a second nav tree) plus a role-specific bottom tab bar
plus a floating primary-action button — this mobile pattern is deliberate and recently hardened; preserve
the MECHANISM, restyle only the visuals.

Top-level modules: Home (universal role-tailored landing) → Driver Operations (the Assignment Board +
driver/vehicle admin + requests) → Petty Cash Center → Overtime Management → Analytics → Konfigurasi
(settings + user management) → Role Management → Engineering Operations → Gudang (warehouse) → Sarpras
Intelligence (excluded, see above).

You MAY: merge/rename/restructure below the top level, add filters/search, add contextual navigation,
introduce workspace-style pages, split overloaded screens. You should NOT: hide the six admin-only modules
behind role-switching UI that implies broader access than exists, or invent a workflow with no basis in
the feature list above.

## DESIGN PRINCIPLES (Apple-inspired SaaS — and the codebase already agrees with this direction)

Clarity, restraint, hierarchy, whitespace, typography-led design, calm visual language, purposeful (never
decorative) motion. A prior internal UX-unification pass independently arrived at the same philosophy —
build on it, don't relitigate it:
- De-boxed sections (eyebrow tag + heading + hairline rule) OVER bordered/boxed cards — this is the
  established, correct direction; the "boxed card" look across several modules is the pattern being
  actively phased OUT, not a style to imitate.
- Zero emoji anywhere in UI chrome; icons are stroke-SVG, single color (currentColor), one system only.
- Motion tokens already exist (~160ms modal pop, ~260ms mobile sheet slide-up, ~340ms route transition,
  ~550ms theme crossfade) plus a universal prefers-reduced-motion guard — reuse this vocabulary.
- A cross-module "design authority" mandate is already a standing internal rule, quoted repeatedly: a user
  should be able to navigate between any two modules "without ever feeling they switched to another
  application." Your system must hold across all 10 modules, not just the flagship screens.

## DESIGN SYSTEM TO PROPOSE (current state is fragmented — unify, don't add a 5th system)

Typography: Archivo (display) / Manrope (body/UI) / JetBrains Mono (technical values) — already the
intended stack, just needs a real, fully-adopted type scale (display-xl/lg, heading-xl/lg/md/sm,
body-lg/body/body-sm, caption, label) with 5 font weights (400/500/600/700/800), no more, no fewer.
Color: brand accent is PBSI crimson (~#A8292F light / ~#B8454A dark). Needs one light+dark semantic token
set (canvas/surface/border/text/muted/info/ok/warn/danger + per-vehicle identity colors that scale to an
arbitrary vehicle count, not a hardcoded 4). A known live bug to design around: several white-background
surfaces (including the base modal shell) currently fail to darken in dark mode because a background color
and a text-on-accent color share one token — your spec should keep those semantically separate tokens.
Spacing: an 8px-based scale plus page/section/card-level geometry tokens (roughly: max content width
~1400px, page edge padding ~24-40px, section gap ~32px, card gap ~16px).
Shape: one radius scale (~11/16/22px small/medium/large), one shadow scale (sm/md/lg), used identically
everywhere — today the SAME variable names resolve to different actual values in different modules, which
your spec must not repeat.
Motion: reuse the tokens named above.
Icons: stroke SVG, currentColor, no emoji, one system.
Responsive: five breakpoint tiers — ~380px (smallest phone), ~600px (compact-mobile deep adaptation:
2-row headers, bottom sheets, denser grids), ~768px (THE ONLY nav-shell boundary — sidebar/drawer/
bottom-nav switch here and nowhere else), ~1024px (tablet→desktop full layout), ~1280px (wide desktop).
Today these three specific values are each expressed 2-3 inconsistent ways in different files (e.g., the
nav-shell boundary drifts between 760-768px depending on module, and the modal-vs-drawer-vs-sheet
"become a bottom sheet" threshold drifts between 560-640px) — collapse each to ONE value.

## ANIMATION RULES

Product-quality motion only: hover/press states, expand/collapse, modal/drawer transitions, list
insert/remove, skeleton loading, subtle state-change feedback. No bouncing, no parallax, no animation that
delays operational work. Respect prefers-reduced-motion universally.

## ACCESSIBILITY & INTERACTION REQUIREMENTS

Every interactive element must be ≥44×44px on touch surfaces — this discipline already exists for
navigation chrome in the current app but was never extended to primary/secondary/danger form buttons
(currently ~34px tall) — do not repeat that gap. Full keyboard navigation, visible focus states, proper
modal focus-trap/restore/Escape (a layered-dismiss stack already exists as house convention: modal → active
search → search-blur → open drawer → no-op — follow this pattern for any new stacked-overlay case).
Colorblind-safe status/vehicle identity — never color-only, always pair color with a label/icon/shape.

## ASSIGNMENT BOARD — FLAGSHIP SCREEN, NON-NEGOTIABLE REQUIREMENTS

Live in-app name is "Papan Jadwal." It MUST remain a first-class, always-reachable feature — never replaced
by a generic calendar that loses driver/vehicle context, never made desktop-only. Current implementation:
one row per driver, assignment blocks positioned by time-of-day on an hourly grid, single-date view with
smart auto-focus-scroll to the relevant time window, write-time conflict prevention (blocks a double-
booking before save, not just after), a card-based List view alternative that already exists. A real
screenshot of production (attached context, not fabricated) showed these concrete, fixable problems:
assignment titles ellipsis-truncate with literally no way to read the full text without opening the block;
vehicle identity is color-only against a small legend (fails both new-vehicle-added and colorblind cases);
two rows can show what is clearly one shared trip (a driver convoy) with zero visual grouping; the visible
canvas is often mostly empty white space relative to actual content. A code-only, non-visual finding: on
phones, the List-view alternative is reachable for the Driver role but NOT for Admin or Bidang — they're
stuck with the dense scrolling grid on mobile. Fix this mobile gap; it's the single highest-value change
you can make to this screen. You MAY explore: sticky driver column, adaptive time-range/zoom, a real
driver/vehicle/status filter (today only a single search box exists), a passive (non-blocking) visual
indicator for assignments that already overlap in stored data, a vehicle-lane or icon-labeled vehicle
identity, mobile card-first presentation, keyboard navigation. You must NOT: change how conflict
prevention is computed or enforced, make cancelled assignments visible again, make non-"assigned"-status
blocks draggable, or invent a persistent OS-level clipboard where a deliberately session-only one exists
today.

## SCREENS TO REDESIGN

Home (4 role-tailored workspace variants) · Assignment Board (Timeline + List views, create/edit form,
detail modal, request approval flow with recommendation panel) · Vehicle Management (inventory, detail
drawer, prediction/recommendation/simulation panels) · Driver Management + driver's own dashboard ·
Warehouse (catalog, goods in/out, stock opname, analytics) · Overtime (dashboard, daily entry, reports,
closing) · Petty Cash (dashboard, expenses, NOR generation) · Engineering Operations (dashboard, timeline,
work queue) · Analytics suite (executive health score, dispatch analytics, driver wellness) · User & Role
Management · Global Settings · Notifications/Activity log · shared primitives: buttons, chips/badges,
empty states, toasts, tables, modals/drawers, forms.

## STATES EVERY SCREEN NEEDS

Loading, empty, error, permission-denied, read-only (archived records), editing, success/saved,
offline-with-cached-data, and both light and dark mode, at minimum 320-430px phone widths, 768-1024px
tablet, and 1024-1920px+ desktop.

## THINGS THAT MUST NOT BE BROKEN

No business-logic changes for visual reasons. No changes to Firebase data structures, RTDB paths, or
permission-gating logic. No new user roles or workflows without a basis in the feature inventory above. No
second/parallel mobile navigation system. The soft-delete-only pattern in Warehouse (hard delete is
structurally blocked at the data layer, not just hidden in the UI). Sequential document numbering for
official documents (Reimbursement, NOR) stays server-issued, never client-generated.

## THINGS YOU ARE FREE TO CHANGE

Navigation, IA below the top level, menu grouping, typography, spacing, all component visual design,
tables/forms/dialogs/drawers, interaction patterns, responsive behavior, visual hierarchy, dashboard
structure, and terminology where genuinely unclear (but keep established terms: "Papan Jadwal" for the
board, "Bidang" as both a department AND a requester role — keep these distinguishable if you touch that
copy, "NOR" = Nota Organisasi Realisasi, "Gudang" = warehouse).

This is a COMPLETE redesign, not a sampler — every module and screen listed under SCREENS TO REDESIGN is
in scope, not just a representative few. Given the size of that list, work in this order across our
conversation rather than trying to produce everything in one shot:
  1. First: the design system itself (typography/color/spacing/shape/motion/icons) as its own deliverable,
     fully spec'd, so every later screen can be checked against it for consistency.
  2. Second: Home (admin variant) + the shared component library (buttons, chips, cards, tables, modals,
     empty states) — these two establish the visual language every other screen will reuse.
  3. Third: the Assignment Board (desktop + mobile, Timeline + List) — the flagship screen, most detail.
  4. Then proceed module by module through the rest of SCREENS TO REDESIGN, reusing the design system and
     component library from steps 1-2 rather than re-deriving styles per module — flag it explicitly if any
     module seems to need something the shared system doesn't cover yet, rather than quietly inventing a
     one-off.
Flag any area where you need a product decision rather than assuming one, at any step.
```
