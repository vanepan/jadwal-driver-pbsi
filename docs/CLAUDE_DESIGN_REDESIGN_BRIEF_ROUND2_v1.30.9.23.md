# Ready-to-paste Claude Design prompt — Round 2 (Ground-Truth Redesign)
**Audited at:** APP_VERSION v1.30.9.23 · 2026-08-16
**Status:** Handoff package only. No app code, data, or Firebase changed to produce this.

## Why a Round 2 exists — read this before pasting

Round 1 (`docs/CLAUDE_DESIGN_HANDOFF_PROMPT_v1.30.9.12.md`) produced 16 genuine Claude Design mockups —
Design System, App Shell, Assignment Board, Admin Home, Home Variants, Vehicle Fleet, Warehouse, Overtime,
Petty Cash, Engineering, Analytics, User/Role Management, Notifications, Settings, System States, Component
Library. `V1_TRUE_REDESIGN_GAP_ANALYSIS.md` (root of the repo) later found that the implementation built
from that round only ever read a **prose summary** of those mockups — the actual visual files were never
opened during implementation. Scored honestly against the real mockups: of 17 modules, **2 matched (A), 4
were partial (B), 3 were a different-but-real redesign (C), and 8 never left the old flat sidebar / hub
navigation (D)**. The user's own assessment after seeing the live result: *"the previous redesign doesn't
seem to be a redesign."* Both are correct — the token/component primitives shipped are real, but the
information architecture, navigation model, and most module layouts are unchanged from before Round 1.

Two things are different this time:
1. **Real, authenticated, current-production screenshots are attached to this conversation**, captured via
   `docs/CLAUDE_IN_CHROME_SCREENSHOT_AUDIT_PROMPT_v1.30.9.23.md`. Treat every screenshot as ground truth —
   above this brief, above your own memory of the 16 Round 1 mockups, above anything else. If a screenshot
   contradicts something written here, the screenshot wins; say so explicitly rather than silently picking
   one.
2. **This brief asks for more, and more explicitly, on animation and interactivity** — see the dedicated
   section below. Round 1's "purposeful motion" language was true but too vague to survive translation into
   implementation; this round specifies actual interaction moments and asks you to attach real motion
   values to each one.

**First step, before designing anything new**: open your own 16 Round 1 mockups side-by-side with the
attached screenshots and tell us, module by module, which of your existing mockups already match what you'd
design today and which need to change now that you can see the real thing. Don't silently redo work that
still holds.

Copy everything in the fenced block below into Claude Design as one message, alongside the attached
screenshots.

---

```
You are redesigning an existing, in-daily-use production operational application — Sarpras Operations —
NOT creating a fictional dashboard. Every screen you design must map to a real feature with real data, real
states, and real operational consequences. This is Round 2 of this engagement: real production screenshots
are attached — use them as ground truth for what today's UI actually looks like, above any written
description in this brief, including your own memory of Round 1's mockups if they were made without seeing
these.

## THE ONE THING THAT MUST BE TRUE THIS ROUND

A person who used the old screen and now looks at your new one should, unprompted, say this is a different
product — not "the same thing with new colors," not "nice, cleaner," but a visibly, structurally different
design. If a screen you're about to hand back still uses the same navigation shell, the same page structure,
the same information hierarchy as the attached screenshots — just restyled — it has not met the bar, no
matter how polished the restyle is. Ground-up means ground-up: navigation, layout, hierarchy, and
interaction model are all in scope for every single screen, not just the flagship ones.

## PRODUCT CONTEXT

Sarpras Operations is a vanilla-JavaScript SPA (no framework) + Firebase Realtime Database backend, used
daily by a facilities/transport operations team (PBSI) to manage: driver scheduling and dispatch, vehicle
fleet management, warehouse operations, overtime payroll, petty cash/official documents, engineering work
orders, and executive analytics/predictions. It is also an installable, offline-capable PWA. The engineering
underneath (conflict prevention, permission model, prediction pipeline) is mature and correct — what needs
work, still, is the presentation layer.

## TARGET USERS (unchanged since Round 1 — verified from the role system)

- **admin** — runs the whole operation. The only role with access to 6 of the app's 10 top-level modules
  (Petty Cash, Overtime, Analytics, Konfigurasi/Settings, Role Management, Warehouse are ALL admin-only).
  Design primarily for this power user in those six modules.
- **bidang** — requests a vehicle/driver for their org department; can self-drive.
- **driver** — executes assigned trips (start/complete with odometer capture).
- **viewer** — legacy, read-only, low-priority.
- **engineering_coordinator** / **engineering_member** — separate work-order module (field coordination vs.
  execution), distinct assignment lifecycle from driver scheduling.
- A "Custom Role" concept exists in the data model but is NOT assignable to real users yet — do not design
  around it being live today.
- "Sarpras Intelligence" is a separate, pilot-gated module (single allowlisted identity) with its own
  distinct philosophy — SCOPE THIS OUT of your redesign entirely, same as Round 1.

## WHAT TO DO WITH THE ATTACHED SCREENSHOTS

For every module you touch: find its screenshot(s) first. Note concretely what's wrong with it — not just
"looks dated" but specific, nameable problems (truncated text with no escape hatch, color-only identity,
dense unstructured tables, flat single-level navigation, a hub of disconnected screens where one workspace
should be, buttons that look too small to tap, a modal where a drawer would serve better, visual noise, dead
space, inconsistent spacing against the neighboring screen). Then design against those specific problems,
not against a generic idea of what the module "should" look like. If a screen wasn't captured, say so and
design from the feature description instead, flagged as such.

## ANIMATION & INTERACTIVITY — specified, not just described (this is the main gap from Round 1)

Round 1 asked for "Apple-inspired," "purposeful motion" — true, but too vague to survive implementation. 
This round, for every interactive surface, specify the actual motion: what changes, over what duration,
with what easing, and what triggers it. Cover at minimum:
- **Hover/press/focus states** on every button, chip, row, and card — not just a color change; consider
  scale, shadow-lift, or border treatments that feel tactile, with real duration/easing values.
- **Page/section/tab transitions** — moving between modules and between tabs within a module (e.g. the new
  Warehouse/Overtime/Analytics tab shells) should feel like one continuous surface, not a hard cut.
- **Drawer/sheet/modal choreography** — enter/exit transforms, backdrop fade timing, and how they differ
  (a side-drawer for record detail vs. a centered dialog for a short decision are different physical
  objects and should move differently).
- **List insert/remove/reorder** — a new assignment appearing on the board, a row being archived, a filter
  narrowing a table — these should animate as state changes, not just repaint.
- **Loading → content** — skeleton states and how they resolve into real content (crossfade vs. shape
  morph vs. simple swap — pick one and justify it).
- **Micro-feedback** — toasts, inline success/save confirmations, the Accept/Dismiss action on a
  recommendation card, a completed trip's odometer capture flow — small moments that should feel
  acknowledged, not silent.
- **Data-forward moments** — the Executive Health Score, KPI strips, and any place a number is the whole
  point deserve a moment of presence (e.g. a value count-in) without becoming a gimmick.

Rules: no bouncing, no parallax, nothing that delays operational work or adds a mandatory wait before a user
can act. Respect `prefers-reduced-motion` universally — every animation you specify needs a static fallback
described alongside it, not left implicit. This should read as SaaS-grade craft (the level of Linear,
Arc, or Apple's own product pages) applied to an operations tool — motion earns its place by making state
changes legible, not by decorating them.

## "PAPAN JADWAL" (ASSIGNMENT BOARD) — MUST STAY, FULLY FREE TO REDESIGN

This is a specific, explicit instruction from the product owner for this round: **"Papan Jadwal" must remain
in the product as a named, first-class, always-reachable feature** — driver × vehicle × time scheduling with
its full operational meaning (assignment visibility, conflict prevention, date navigation, workload at a
glance) intact. Within that constraint, **you have complete creative freedom to redesign how it looks and
how it's interacted with** — more freedom than Round 1's brief implied. Nothing about its current
absolutely-positioned-blocks-on-an-hourly-grid rendering model, its driver-row structure, or its visual
language is sacred; only the operational capability is. Concrete, real problems visible in the attached
screenshots to design against: assignment titles ellipsis-truncate with no way to read the full text without
opening the block; vehicle identity is color-only against a small, non-scaling legend; two rows can clearly
represent one shared trip (a driver convoy) with zero visual grouping; large empty canvas relative to actual
content; on phones, the List-view alternative is reachable for Driver but not Admin/Bidang. You may propose
an entirely different visual metaphor for this screen if you believe it serves the operational need better,
as long as: conflict prevention stays write-time-enforced (not just a passive display), only `assigned`-
status entries stay editable, cancelled assignments stay hidden from the operational view, and the screen
never becomes desktop-only.

## COMPLETE FEATURE INVENTORY (55 features across 14 areas — condensed; the full per-feature table with
## Firebase paths/roles is in docs/FEATURE_UX_AUDIT_v1.30.9.12.md if you need it)

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
opname, analytics, inventory intelligence. Admin-only (no warehouse-staff role exists). Currently a hub of
separate screens, not one connected workspace — a real structural gap, not a visual one.
Overtime (1 module, 10 screens): tiered-rate overtime computation, holiday calendar, period closing,
reports+export, archive. Admin-only. Same hub-of-screens gap as Warehouse.
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
Settings (3): global config, per-module settings, feature flags — currently scattered per-module, no
unified settings destination exists.
PWA (2): install flow + silent auto-update, offline indicator.

## CURRENT INFORMATION ARCHITECTURE (verified against the live app, confirmed in the attached screenshots)

Shell today is a **single flat sidebar** (~240px) listing every module as a direct icon+label item — there
is no icon-rail-plus-section-panel two-level navigation anywhere in the live app, whatever any prior design
round intended. On mobile: hamburger drawer (mirrors the same flat list) + a role-specific bottom tab bar +
a floating primary-action button.

Top-level modules: Home (universal role-tailored landing) → Driver Operations (the Assignment Board +
driver/vehicle admin + requests) → Petty Cash Center → Overtime Management → Analytics → Konfigurasi
(settings + user management) → Role Management → Engineering Operations → Gudang (warehouse) → Sarpras
Intelligence (excluded, see above).

You MAY: merge/rename/restructure below the top level, add filters/search, add contextual navigation,
introduce workspace-style pages, split overloaded screens, and — this round, explicitly — propose a new
top-level navigation shell if the current flat sidebar is holding the whole redesign back (it is the #1
blocker identified in the gap analysis: nothing else can genuinely look different while every module still
mounts into the old flat list). You should NOT: hide the six admin-only modules behind role-switching UI
that implies broader access than exists, or invent a workflow with no basis in the feature list above.

## DESIGN PRINCIPLES (Apple-inspired SaaS)

Clarity, restraint, hierarchy, whitespace, typography-led design, calm visual language, motion that's
purposeful per the section above. De-boxed sections (eyebrow tag + heading + hairline rule) OVER
bordered/boxed cards. Zero emoji anywhere in UI chrome; icons are stroke-SVG, single color (currentColor),
one system only. A cross-module "design authority" mandate: a user should be able to navigate between any
two modules without ever feeling they switched to another application — hold this across all 10 modules,
not just the flagship screens.

## DESIGN SYSTEM

Typography: Archivo (display) / Manrope (body/UI) / JetBrains Mono (technical values) — a real, fully-
adopted type scale (display-xl/lg, heading-xl/lg/md/sm, body-lg/body/body-sm, caption, label), 5 font
weights (400/500/600/700/800), no more, no fewer.
Color: brand accent is PBSI crimson (~#A8292F light / ~#B8454A dark). One light+dark semantic token set
(canvas/surface/border/text/muted/info/ok/warn/danger + per-vehicle identity colors that scale to an
arbitrary vehicle count, not a hardcoded 4, and are never color-only — always paired with a shape/label/icon
for colorblind safety). A known live bug visible in the attached dark-mode screenshots, if captured: several
white-background surfaces (including the base modal shell) fail to darken because a background color and a
text-on-accent color share one token — keep those semantically separate.
Spacing: 8px-based scale plus page/section/card-level geometry (max content width ~1400px, page edge padding
~24-40px, section gap ~32px, card gap ~16px).
Shape: one radius scale (~11/16/22px small/medium/large), one shadow scale (sm/md/lg), identical everywhere.
Motion: per the dedicated section above — this is the part Round 1 under-specified.
Icons: stroke SVG, currentColor, no emoji, one system.
Responsive: five breakpoint tiers — ~380px (smallest phone), ~600px (compact-mobile deep adaptation), ~768px
(the one nav-shell boundary), ~1024px (tablet→desktop), ~1280px (wide desktop). Collapse today's 20+
inconsistent breakpoint values to these five, everywhere.

## ACCESSIBILITY & INTERACTION REQUIREMENTS

Every interactive element ≥44×44px on touch surfaces, including form buttons (currently ~34px tall in the
live app — do not repeat that gap anywhere). Full keyboard navigation, visible focus states, proper modal
focus-trap/restore/Escape. Colorblind-safe status/vehicle identity — never color-only, always pair color
with a label/icon/shape.

## SCREENS TO REDESIGN — everything, not a sampler

Home (4 role-tailored workspace variants) · Assignment Board/"Papan Jadwal" (Timeline + List views,
create/edit form, detail view, request approval flow with recommendation panel) · Vehicle Management
(inventory, detail drawer, prediction/recommendation/simulation panels) · Driver Management + driver's own
dashboard · Warehouse (catalog, goods in/out, stock opname, analytics) · Overtime (dashboard, daily entry,
reports, closing) · Petty Cash (dashboard, expenses, NOR generation) · Engineering Operations (dashboard,
timeline, work queue) · Analytics suite (executive health score, dispatch analytics, driver wellness) ·
User & Role Management · Global Settings (net-new unified shell — today there isn't one) · Notifications/
Activity log · the App Shell / navigation itself · shared primitives: buttons, chips/badges, empty states,
toasts, tables, modals/drawers, forms.

## STATES EVERY SCREEN NEEDS

Loading, empty, error, permission-denied, read-only (archived records), editing, success/saved,
offline-with-cached-data — both light and dark mode, at minimum 320-430px phone widths, 768-1024px tablet,
1024-1920px+ desktop.

## THINGS THAT MUST NOT BE BROKEN

No business-logic changes for visual reasons. No changes to Firebase data structures, RTDB paths, or
permission-gating logic. No new user roles or workflows without a basis in the feature inventory above. No
second/parallel mobile navigation system. The soft-delete-only pattern in Warehouse. Sequential document
numbering for official documents (Reimbursement, NOR) stays server-issued, never client-generated. Write-
time conflict prevention on the Assignment Board stays the enforcement mechanism, whatever it looks like.

## THINGS YOU ARE FREE TO CHANGE

Everything visual and structural: navigation/IA at every level including the top-level shell, menu grouping,
typography, spacing, all component design, tables/forms/dialogs/drawers, interaction patterns, responsive
behavior, visual hierarchy, dashboard structure, and terminology where genuinely unclear (but keep
established terms: "Papan Jadwal" for the board, "Bidang" as both a department AND a requester role — keep
these distinguishable if you touch that copy, "NOR" = Nota Organisasi Realisasi, "Gudang" = warehouse).

## DELIVERABLE FORMAT — this is the specific process fix for Round 2

Round 1's implementation failed partly because only a prose "implementation map" document was ever produced
and read — the actual visual mockups existed but were never opened by whoever built from them. This round:
produce real visual mockup artifacts for every screen (not a text description standing in for one), and
finish with a single master index that links directly to every mockup file/artifact you produced, organized
by module, so nothing can be "read as a summary" again. Work in this order across our conversation:
  1. First: reconcile against your own 16 Round 1 mockups using the attached screenshots — confirm what
     still holds, flag what needs to change, before producing anything new.
  2. Then: the design system itself (typography/color/spacing/shape/motion/icons), updated with the fully-
     specified motion section above, as its own deliverable.
  3. Then: the App Shell / navigation redesign — nothing else can be honestly "done" until this exists,
     since every module mounts into it.
  4. Then: Home (admin variant) + the shared component library.
  5. Then: the Assignment Board ("Papan Jadwal") — flagship, most detail, full freedom per the section above.
  6. Then proceed module by module through the rest of SCREENS TO REDESIGN, reusing the design system and
     component library rather than re-deriving styles per module.
Flag any area where you need a product decision rather than assuming one, at any step.
```

---

## After Claude Design responds

`V1_TRUE_REDESIGN_GAP_ANALYSIS.md` §12 already defines what "done" means for this program (mounted in the
new shell, structure matches the mockup not just its tokens, every state uses the shared library, all
breakpoints/themes actually rendered and observed, every specified interaction demonstrably wired, no
business-logic drift, and — the test that matters — a returning user would call it a different product
unprompted). That definition doesn't need to change for Round 2; only the input to implementation does.

**Implementation note, for whoever writes the code next, carried forward so this doesn't repeat:** open and
visually inspect every mockup artifact this round produces before writing any implementation. Round 1's
entire gap traces back to one step being skipped — reading a prose summary instead of the sixteen actual
files. Do not let that happen twice.
