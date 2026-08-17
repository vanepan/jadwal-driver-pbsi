# V1 True Redesign — Gap Analysis

**Status: research only. No application code was modified to produce this document.**

**Method note, stated up front because it changes everything below:** across the prior implementation passes, only one Claude Design artifact was ever actually read — `Sarpras V1 Redesign Implementation Map.dc.html`, a prose summary. The sixteen actual visual mockups in the same project (`Sarpras Design System`, `App Shell`, `Assignment Board`, `Admin Home`, `Home Variants`, `Vehicle Fleet`, `Warehouse`, `Overtime`, `Petty Cash`, `Engineering`, `Analytics`, `User Role Management`, `Notifications`, `Settings`, `System States`, `Component Library`) were never opened. All of them have now been read in full for this analysis. That gap in process is the direct cause of the mismatch you're seeing: the implementation was built from a description of the design, not the design itself.

---

## 1. Original objective

A genuine product-level redesign of Sarpras Operations V1 — new visual language, information hierarchy, interaction model, and responsive behavior across the whole application — while preserving all existing functionality, Firebase integration, permissions, and business rules underneath. Not a token migration. Not a component-library exercise. Not an audit that stops at "already true."

## 2. Claude Design target (now actually read, not summarized)

The target is precise and consistent across all sixteen files, sharing one token set (OKLCH-based color, Archivo/Manrope/JetBrains Mono type, 8px spacing, a 3-tier radius/shadow scale) and one shell. The parts that matter most for this gap analysis, because they are structural, not cosmetic:

- **App Shell**: a **64px icon-only rail** (top-level modules, icons only) plus a **separate 216px labeled section panel** showing the active module's sub-items — a genuine two-level navigation. Below 1024px the panel becomes a tap-to-reveal overlay; below 768px the whole rail relocates into a hamburger drawer, replaced day-to-day by a role-scoped bottom tab bar + centered FAB. This is the single shell every module mounts into.
- **Admin Home**: not a dashboard — an action-first command center. Headline narrative ("Good morning — 4 things need your attention"), a 5-stat ops strip, a "Needs your attention" alert list with per-item action buttons, a "Recommended actions" panel with explicit Accept/Dismiss and an accuracy-audit link, a mini per-driver timeline-bar list, a driver-status list, a vehicle-flags list, and a closing metrics row. Bidang/Driver/Engineering each get a **role-specific single-purpose card**, not a scaled-down admin view (Bidang: one "+Request a vehicle" CTA; Driver: one "Start trip" CTA; Engineering: unassigned work orders with Assign buttons).
- **Assignment Board**: full titles (no truncation without a drawer), **vehicle identity by shape + color per driver** (circle/diamond/hexagon/triangle/square — not color alone), a visual convoy-link icon on grouped blocks, a passive corner-dot conflict flag, filter chips + search in the toolbar, a **side drawer** for assignment detail (not the current click-to-modal), and on mobile a List/Compact-Timeline toggle plus a purpose-built chronological agenda view (not a shrunk grid).
- **Vehicle/Fleet**: a capped 5-KPI header, a dense table, and a **detail drawer with 5 tabs** (Health/Compliance/Maintenance/Reminders/Timeline) with prediction/recommendation/what-if always visible beneath the tabs, not inside one.
- **Warehouse**: **one workspace shell with 7 tabs** (Dashboard/Catalog/Goods In/Goods Out/Movement/Stock Opname/Analytics) under one header — not a hub of separate screens.
- **Overtime**: **one workspace with 7 tabs** (Dashboard/Daily Entry/Employees/Rates/Calendar/Closing/Reports), a period selector everything respects, and a guarded one-way period-close confirmation naming the concrete consequence.
- **Petty Cash**: cycle balance pinned above the fold, and a **true pre-numbering draft state** — "Save as draft (no number yet)" as a distinct action from "Generate & issue number," so no sequence number is ever burned on an abandoned document.
- **Engineering**: a genuine 5-column **kanban** (Open/Joined/In progress/Postponed/Verify) with its own numbered lifecycle stepper in the detail view, deliberately shaped differently from the Assignment Board's trip lifecycle.
- **Analytics**: 7 tabs (Executive/Dispatch/Driver/Wellness/Prediction/Scenario/Export) under one shell, one health score above the fold, scenario simulation read-only until an explicit Apply.
- **User/Role Management**: inherited role permissions and individual overrides shown as **visually separate sections** (not a flat merged list), a "Protected permission" inline notice, and a persistent "Custom Role — not yet assignable" banner wherever that action would otherwise appear.
- **Notifications**: one row component powering the bell dropdown, the mobile full-screen list, and the activity feed — differing only in density.
- **Settings**: **one shell** — a left section index + one form panel — covering global config, per-module settings, and **feature flags with in-app toggle switches**.
- **System States**: 15 named, reusable state components (loading skeleton, table-row skeleton, empty, no-search-results, error+retry, permission-denied, read-only, archived, editing/unsaved-guard, saving, saved, offline, reconnecting, success, destructive-confirm) that every module is expected to reuse verbatim.

## 3. Current implementation reality

- **Tokens, dark mode, touch targets, and shared component primitives** (buttons, chips, cards, table shell) are now largely aligned with the Design System spec at the *primitive* level — 44px targets, accent-hover/subtle tokens, de-boxed cards, canonical shadow/status colors. This part of the work was real and is not being walked back.
- **The App Shell is a single flat 240px sidebar** listing every module as a direct icon+label item (Tambah Jadwal, Requests, Notifications, Profil, Petty Cash, Overtime, Analytics, Engineering, Gudang, Sarpras Intelligence, Role Management, Konfigurasi, Logout). There is no icon rail, no separate section panel, no two-level navigation anywhere in the codebase.
- **Home** already went through its own multi-sprint redesign (v1.21.0–v1.22.6: a de-boxed hero, a ring-gauge health score, a narrative headline builder) — but to a **different design than this Claude Design handoff specifies**. It has no 5-stat ops strip, no per-item "Needs attention" action buttons, no Accept/Dismiss recommendation cards, no mini per-driver timeline bars, no vehicle-flags list. `grep` for the mockup's literal narrative pattern ("Good morning — N things need your attention") returns nothing.
- **Assignment Board**: this session shipped two real, verified fixes (mobile List-view reachability, filter chips) and a passive conflict badge — but vehicle identity is still color-only (no per-driver shape), there is no convoy-link visual, detail opens in the existing modal (not a side drawer), and the mobile compact-agenda view doesn't exist as its own chronological component.
- **Vehicle/Fleet drawer**: this session's own work built a genuine 5-tab CSS-only restructure (Ringkasan/Operasional/Legal & Asuransi/Perawatan/Riwayat + conditional Prediksi) — the *closest* match to any Claude Design target found anywhere in the app, though the tab groupings and labels were inferred from the implementation map's prose, not the actual mockup's exact tab set (Health/Compliance/Maintenance/Reminders/Timeline), so the grouping is a reasonable approximation, not a match.
- **Warehouse**: confirmed hub-and-drill-down (a Home dashboard linking to separate Catalog/Goods-In/Goods-Out/Opname/Analytics screens), not a 7-tab single shell. `grep` for a tab-bar class in `js/gudang/` returns nothing.
- **Overtime, Analytics**: same finding — no tab-bar implementation exists in either module's source.
- **Petty Cash**: has a "Test NOR" mechanism (non-official, doesn't lock expenses, hidden from history) that is functionally adjacent to but **not the same thing** as the mockup's true pre-numbering draft (Test NOR still consumes a server-issued number; the design target's draft explicitly does not).
- **Engineering**: correctly scoped under its own `.eng-root` namespace (visually distinct from Driver Ops, confirmed), and per project memory already implements a kanban-style lifecycle — the closest-aligned module of the non-token work, though the exact 5-column Open/Joined/In-progress/Postponed/Verify shape and the numbered stepper in the detail view have not been visually verified against the mockup.
- **User/Role Management**: independently already implements almost exactly the target pattern — distinct `.rm-permission-row--base/--role-additional/--protected` classes with explanatory copy per state. This is the one module where prior work and the actual mockup agree closely, confirmed by direct comparison, not assumption.
- **Notifications**: confirmed via click-path tracing that bell, mobile, and the activity feed already funnel through one row-rendering path — matches the target.
- **Settings**: confirmed scattered — Engineering and Petty Cash each maintain separate settings screens, and feature flags have no UI at all (`/feature_flags` is read once at startup; nothing in the app writes to that path). No left-index shell exists.
- **System States**: no evidence of a consolidated 15-state library; states are implemented ad hoc per module (confirmed empty/error/loading patterns exist in various places, e.g. Vehicle Fleet's `moduleStates` array in the mockup vs. scattered bespoke empty-state markup in the app).

## 4. Module-by-module classification

| Module | Class | Basis |
|---|---|---|
| App Shell / navigation | **D** | Flat single sidebar; no icon-rail + section-panel two-level structure exists anywhere |
| Admin Home | **C** | Extensively redesigned, but to a different design than this handoff (no ops-strip, no action-attached alerts, no recommendation Accept/Dismiss, no vehicle-flags list) |
| Home — Bidang/Driver/Engineering variants | **D** | No evidence of role-specific single-CTA home cards distinct from Admin's view |
| Driver Operations / Assignment Board | **B** | Real fixes shipped (mobile list, filters, conflict badge); vehicle shape-identity, convoy visual, side-drawer detail, and mobile compact-agenda are all still missing |
| Pending / approval workflows | **D** | Not evaluated against a specific mockup (none exists as a standalone file) but no evidence of the "Recommended actions" Accept/Dismiss pattern the Home mockup implies feeds it |
| Driver Management | **D** | No dedicated mockup reviewed separately from Assignment Board's driver list pattern; current implementation not compared |
| Vehicle / Fleet Management | **B** | Genuine 5-tab drawer restructure shipped this session (closest module to target in the whole app); table/KPI-header/mobile-card layout not yet verified against the mockup's specifics |
| Warehouse | **D** | Confirmed hub-and-drill-down, not the target's 7-tab single shell; deliberately left this way in the prior pass on a judgment call that now needs revisiting given the explicit target exists |
| Overtime | **D** | No tab-bar implementation found; rate/tier-per-row (a narrow, real, already-shipped win) is not the same as the 7-tab workspace the target specifies |
| Petty Cash | **C** | Cycle-balance prominence matches; "Test NOR" is a real but different mechanism from the target's true pre-numbering draft |
| NOR Center / NOR workflow | **C** | Server-issued numbering correctly preserved; draft-before-numbering UX not implemented |
| Engineering | **B** | `.eng-root` visual separation confirmed; kanban lifecycle exists per project history but exact 5-column shape + numbered stepper not visually verified this pass |
| Analytics / Executive Intelligence | **D** | No 7-tab shell; existing Executive Intelligence briefing is a substantial but *different* redesign; simulation read-only behavior does match (confirmed at the code level) |
| User / Role Management | **A** | Independently verified to already implement the target's inherited-vs-override visual separation and protected-permission notice pattern |
| Notifications | **A** | Confirmed via click-path tracing: one row component genuinely serves bell, mobile, and activity feed |
| Settings | **D** | Confirmed scattered per-module; feature flags have zero UI; no left-index shell exists |
| System States library | **D** | No consolidated 15-state component library found; states exist ad hoc per module |

**Reading the table honestly: 2 of 17 rows are A. 4 are B. 3 are C. 8 are D.** The token/component-primitive work done in prior passes is real and reusable, but it is infrastructure for a redesign, not the redesign itself — exactly the distinction you drew.

## 5. Visual gaps

- No icon-rail + section-panel shell exists — every module still renders inside the old flat-sidebar frame.
- Vehicle identity is color-only throughout the live app; the target's shape+color system (colorblind-safe, scales past a hardcoded palette) is not implemented anywhere, including in the Vehicle Fleet table this session touched.
- De-boxed, Apple-restraint visual language is inconsistently applied — Home's hero already reads this way from prior work, but most module list/table screens still use the pre-existing bordered-card look.
- No convoy-link iconography, no per-block corner conflict indicator beyond this session's new badge (which is text+color, not the mockup's dot).

## 6. UX gaps

- Assignment detail opens in the existing modal pattern app-wide; the target's dedicated side-drawer-for-detail pattern (distinct from the centered-dialog pattern used for short decisions) is not implemented.
- Petty Cash cannot save a NOR before a number is issued — a real behavioral gap, not just visual, since it changes what "cancel and walk away" costs the org (a burned sequence number today; free under the target).
- Settings requires visiting each module separately to change that module's config; there is no single place to see "everything configurable in one list."
- No in-app feature-flag control exists at all — flag changes require direct Firebase access today.

## 7. Responsive gaps

- Mobile shell: current hamburger-drawer-plus-bottom-nav mechanism is structurally *compatible* with the target (both relocate the same rail into a drawer + bottom bar), but since the desktop rail doesn't exist yet, the mobile drawer can't yet mirror it either — it mirrors the old flat sidebar instead.
- Warehouse, Overtime, Analytics: the target's "tabs → horizontal scroll-pill row" mobile pattern has nothing to adapt from, since none of the three have a tab bar on desktop yet.
- Assignment Board mobile: List view is now reachable (this session's real fix), but the target's second mobile mode — a purpose-built chronological "compact timeline" agenda, distinct from List — does not exist; mobile today is List-view or the same (barely-touch-usable) grid.

## 8. Interaction gaps

- No side-drawer slide-in/out interaction pattern implemented for record detail (Assignment Board, Vehicle Fleet uses tabs-in-a-fixed-position, not a drawer with the mockup's specific transform/backdrop choreography).
- Recommendation Accept/Dismiss as a first-class interaction (with an audit-trail link) does not exist on Home.
- Scenario simulation's "Run simulation" → visible projected-result panel interaction is not confirmed to exist in the current Analytics UI in this exact shape, even though the underlying read-only guarantee is confirmed at the code level.

## 9. Navigation / information architecture gaps

- This is the largest single gap in the whole review: **the two-level icon-rail + section-panel navigation is a different information architecture than the current flat sidebar**, not a restyle of it. Every module's "how do I get here" path changes under the target.
- Warehouse and Overtime's information architecture (hub-of-screens vs. tabs-of-one-shell; separate-screens vs. tabs-of-one-shell) is a real structural change, not a visual one — moving between "Catalog" and "Goods In" today is a full navigation; under the target it's a tab click within the same shell.
- Settings' architecture changes from "find the right module, then find its settings tab" to "one settings destination, pick a section."

## 10. Modules requiring genuine redesign (not audit, not token pass)

In priority order, based on how large the gap is and how central the module is to daily use:

1. **App Shell** — blocks every other module's navigation gap from closing; nothing else can genuinely match its target screen without the shell existing first.
2. **Admin Home + role variants** — the first thing every user sees; currently a different (if polished) design.
3. **Assignment Board** — flagship, partially done; needs shape-identity, drawer-based detail, and the mobile compact-agenda to actually match.
4. **Warehouse** — full hub→tabs restructure.
5. **Overtime** — full tabs restructure.
6. **Analytics** — full tabs restructure; health-score-above-the-fold work may already partially exist and needs verification, not rebuilding.
7. **Petty Cash / NOR** — the draft-state behavior change specifically (the rest is closer already).
8. **Settings** — net-new shell; feature-flag UI is a security-scoped decision, not a pure visual task (flagged, not resolved, in the prior pass — still true).
9. **System States library** — infrastructure work that would make every module above faster to bring to parity, arguably worth doing early alongside the App Shell.

Engineering, User/Role Management, and Notifications do **not** need this treatment — they're already close enough that the remaining work is verification and polish, not redesign.

## 11. Proposed implementation sequence

Matches the order you specified, with the addition of a System States pass folded into Phase 1 since every later phase depends on it existing to avoid each module re-inventing its own loading/empty/error markup:

- **Phase 1 — Global App Shell + System States**: icon rail, section panel, responsive collapse behavior, and the 15-state component library. Nothing else can be honestly marked "redesigned" until this exists, since every module mounts into it.
- **Phase 2 — Home / Admin Command Center**: rebuild to the actual mockup's content model; build the three role variants as genuinely distinct single-CTA experiences, not scaled admin views.
- **Phase 3 — Assignment Board**: shape+color vehicle identity, side-drawer detail, convoy visual, mobile compact-agenda.
- **Phase 4 — Vehicle/Fleet**: verify/adjust the already-built 5-tab drawer against the mockup's exact tab set and content; table + KPI header to target.
- **Phase 5 — Warehouse**: hub → 7-tab single shell.
- **Phase 6 — Petty Cash/NOR**: true pre-numbering draft state (this is the one item in this whole list that is a genuine product/data-model decision — see note below).
- **Phase 7 — Overtime**: 7-tab single shell.
- **Phase 8 — Engineering**: verify kanban shape + lifecycle stepper against mockup; likely smallest lift of the remaining modules.
- **Phase 9 — Analytics**: 7-tab shell; verify existing health-score/simulation work slots into it rather than being rebuilt.
- **Phase 10 — User/Role Management**: verification pass only, given Class A status.
- **Phase 11 — Notifications**: verification pass only, given Class A status.
- **Phase 12 — Settings**: net-new shell; feature-flag toggles need an explicit scope decision on which flags are admin-exposed before UI is built.
- **Final — cross-application consistency pass**: re-run the same responsive/light-dark/accessibility/motion/regression QA this session already has tooling for, across every phase's output together, not per-phase in isolation.

**One flagged decision carried forward, unchanged from the prior pass's finding**: Petty Cash's true draft state is a data-model question (does a draft persist before any server contact, and where), not a visual one. The mockup answers *what it should feel like*; it does not specify the storage shape. That still needs a product decision, now correctly scoped as part of Phase 6 rather than dismissed as already-solved.

## 12. Definition of Done for the entire V1 redesign

A module is done when **all** of the following are true — matching your explicit rejection of "audited clean" / "already true" / "tokens only" as sufficient:

1. It is mounted inside the new App Shell (icon rail + section panel), not the legacy sidebar.
2. Its layout, navigation, and information architecture match the corresponding Claude Design mockup's structure — tabs where the mockup specifies tabs, a drawer where it specifies a drawer, a kanban where it specifies a kanban — not merely its color tokens.
3. Every loading/empty/error/permission-denied/archived/saving/saved state on the screen uses the System States library, not bespoke markup.
4. Desktop, tablet, and mobile presentations have each been rendered in an actual browser (not inferred from source) at minimum 320/375/768/1024/1440px and screenshotted or otherwise directly observed, in both themes.
5. Every interaction the mockup specifies (hover, press, drawer/sheet transition, Accept/Dismiss, confirm-then-feedback) is wired and demonstrably works, not just styled.
6. No business logic, Firebase path, permission check, or data contract changed as a side effect — verified by diff review, not assumption.
7. A person who used the old screen and now uses this one would, unprompted, describe it as a different product — not "the same thing with new colors."

The whole V1 redesign is done when every module in the table in §4 is class **A**, and the final cross-application consistency pass in §11 has been run and passed.

---

*This document reflects sixteen Claude Design mockups read in full, plus targeted verification against the current codebase (grep-confirmed absence/presence of specific classes, tab bars, and content patterns cited inline above). It does not include live authenticated screenshots of the production app — that remains a standing limitation for final visual sign-off, not a reason to defer the redesign work itself.*
