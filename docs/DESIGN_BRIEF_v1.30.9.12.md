# DESIGN BRIEF — Sarpras Operations Redesign
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14
**Status:** Analysis + design-research package only. No code, data, Firebase rules, or deploy changes were made to produce this. Nothing here has been committed or pushed.

## Package index
1. `DESIGN_BRIEF_v1.30.9.12.md` — this file
2. `DESIGN_SYSTEM_SPEC_v1.30.9.12.md` — current token/component chaos + proposed unified system
3. `INFORMATION_ARCHITECTURE_v1.30.9.12.md` — current IA, access matrix, proposed changes
4. `FEATURE_UX_AUDIT_v1.30.9.12.md` — complete 55-feature inventory, role analysis, known UX problems
5. `RESPONSIVE_BEHAVIOR_SPEC_v1.30.9.12.md` — breakpoints, touch targets, nav, PWA
6. `ASSIGNMENT_BOARD_REDESIGN_v1.30.9.12.md` — flagship-screen deep dive
7. `DESIGN_IMPLEMENTATION_GUARDRAILS_v1.30.9.12.md` — protected business logic + implementation strategy
8. `CLAUDE_DESIGN_HANDOFF_PROMPT_v1.30.9.12.md` — the ready-to-paste prompt for Claude Design

---

## 1. Product context

Sarpras Operations is a **production, in-daily-use** vanilla-JavaScript SPA (no framework, no build step — ES modules loaded directly) backed by Firebase Realtime Database, serving PBSI's facilities/transport operations team: driver scheduling and dispatch, vehicle fleet management, warehouse (Gudang), overtime payroll, petty cash/NOR documents, engineering work orders, and an executive analytics/prediction layer. It is also an installable PWA with offline support. Current version: **v1.30.9.12**. It has been iterating since at least v1.2 (many hundreds of shipped increments recorded in `docs/`), with a strong existing engineering discipline: surgical Firebase writes, explainable predictions, write-time conflict prevention, soft-delete-only data patterns, and a deliberately incremental release cadence.

**This is not a fictional dashboard to design from scratch.** Every screen maps to real data, real Firebase paths, real permission gates, and real operational consequences (a driver double-booked in the redesigned UI is a driver double-booked in real life).

## 2. Target users

Six roles exist in the running system today (verified in `js/config/role-registry.js`): **admin** (runs the whole operation — the only role with access to 6 of 10 top-level modules), **bidang** (requests vehicles/drivers for an org unit), **driver** (executes assigned trips), **viewer** (legacy, read-only, likely low-usage — verify before over-investing), **engineering_coordinator** and **engineering_member** (field work execution/verification, separate module). A 7th concept, **Custom Roles**, exists in the data model but cannot yet be assigned to real users (a deliberate, still-open security-migration gap) — don't design around it being live. See `FEATURE_UX_AUDIT.md` §2 for the full per-role workflow analysis.

## 3. Problem statement

The application's functionality and underlying engineering are solid — conflict detection, permission gating, offline support, and the prediction/recommendation pipeline are all genuinely well-built. The **presentation layer has accumulated inconsistency through incremental, module-by-module growth**: at least 3-4 parallel color/shadow/radius token systems, 20+ uncoordinated responsive breakpoints, duplicated component implementations (buttons, chips, empty states), and touch-target/mobile-parity gaps that were fixed in some modules (nav chrome) but never propagated to others (form buttons, Admin/Bidang's mobile Assignment Board access). None of this is a functional defect — it's a maturity gap between "many capable engineers shipping fast" and "one coherent design system." That gap is what this redesign should close.

## 4. Design philosophy

Apple-inspired SaaS operational software: clarity, restraint, hierarchy, whitespace, typography-led design, calm visual language, purposeful (not decorative) motion, strong information hierarchy. Combined with modern SaaS interaction patterns: contextual actions, smart empty states, progressive disclosure, inline editing, contextual drawers, intelligent filtering.

**This direction is not a departure from where the codebase already wants to go.** The prior UX-unification effort independently arrived at the same philosophy — a "de-boxed," hairline+eyebrow section style was explicitly adopted over bordered cards, a Design Authority mandate already governs cross-module visual parity, zero-emoji/SVG-stroke iconography is already enforced, and motion tokens + `prefers-reduced-motion` are already standard. Claude Design should **treat these as a head start, not a constraint to work around**.

## 5. Non-negotiables

- The Assignment Board ("Papan Jadwal") remains a first-class, always-reachable feature with its full operational meaning (driver/vehicle allocation, conflicts, date nav, workload) intact — see `ASSIGNMENT_BOARD_REDESIGN.md`.
- No business-logic changes for visual reasons (conflict rules, permission gates, RTDB write patterns) — see `DESIGN_IMPLEMENTATION_GUARDRAILS.md` for the full protected list.
- No Firebase data-structure breaks without explicit justification and a separate review.
- The Assignment Board is not replaced by a generic calendar that loses driver/vehicle operational context, and is not made desktop-only.
- The admin-only module set stays admin-only; no IA change should imply broader access.
- Sarpras Intelligence (the pilot-gated Organizational Learning Platform, subject of the repo's own root `CLAUDE.md`) is architecturally and philosophically distinct from the operational modules — recommend scoping it OUT of Phase 1 visual redesign; see `INFORMATION_ARCHITECTURE.md` §3.

## 6. What may change

Navigation, IA, menu grouping, page hierarchy, typography, spacing, component dimensions, cards/tables/filters/forms/dialogs/drawers, interaction patterns, responsive behavior, visual hierarchy, dashboard structure, terminology where genuinely unclear — all fair game, detailed per-area in the accompanying docs.
