# PBSI Operations Platform — Product Roadmap

> Authoritative reference for release planning, feature sequencing, and migration status.
> Cross-reference: `MIGRATION_PLAN.md` for technical implementation detail, `FEATURE_FLAGS.md` for flag activation rules.
> Last updated: 2026-06-04.

---

## Current Status

| Item | Detail |
|---|---|
| **Production version** | v1.2.5 — Reimbursement Form Production Polish |
| **Active module** | Driver Operations (sole production module) |
| **Migration phase** | Phase 1 — Design System Consolidation (in progress) |
| **Migration planning** | Complete (`MIGRATION_PLAN.md` finalized 2026-06-04) |
| **V2.0 architecture** | Approved — three-column shell, multi-module platform, token design system |
| **Design system** | `platform.css` V2 token layer active; Phase 1 overrides applied to header, sidebar, bottom nav, notifications |
| **Login UI redesign** | V2 structure active; Masuk Cepat hidden in production (2026-06-04) |

### Active Production Module

**Driver Operations** is the only live module. It covers:
- Horizontal Gantt timeline (single-date view, all drivers and vehicles)
- Assignment lifecycle: assigned → started → completed with odometer capture
- Bidang request workflow: create → admin approve/reject → assignment generation
- Driver personal dashboard (4 sections: live, today, upcoming, history)
- Reimbursement form generator (A4 PDF, sequential document numbering)
- Telegram push notifications and H-1 / 2-hour driver reminders
- Role-based access: Admin, Bidang, Driver, Viewer

All other modules (Engineering, Analytics, AI Assistant, Asset Management) are in design or planning state only. No V2 module code is in the production bundle.

---

## Version 1.2.x — Driver Operations Foundation

**Release stream status:** Active. Patch releases continue until 1.3.0 is ready.

### Completed

| Feature | Version | Notes |
|---|---|---|
| Initial platform release | v1.0.0 | Driver scheduling, Firebase RTDB sync, Telegram notifications, bidang request workflow |
| Mobile UX refresh | v1.1.0 | Collapsible sidebar, horizontal timeline scroll, mobile bottom navigation |
| Validation Engine | v1.2.1 | `ValidationRegistry` — centralized, extensible, pure-function validators for request, assignment, driver, vehicle, user, odometer |
| Business Rules Engine | v1.2.1 | Conflict detection (`checkConflict`, `checkVehicleConflict`), multi-day expansion rules, full-day flag handling |
| Odometer Foundation | v1.2.2 | KM Awal captured on start, KM Akhir on complete, `distanceTravelled` auto-calculated and stored in Firebase |
| Driver Dashboard | v1.2.2 | Four-section personal view for driver role: Berlangsung, Jadwal Hari Ini, Mendatang, Riwayat |
| Completion Tracking | v1.2.3 | `status` lifecycle: `assigned → started → completed` with full timestamp and actor audit trail |
| Assignment Lifecycle Tracking | v1.2.3 | `getAssignmentLifecycle()` — extracts all timestamps and computes durations (foundation for Analytics v1.5.0) |
| Sanity Check Engine | v1.2.3 | `validateLifecycle()` warns on out-of-order timestamps; Firebase safety guard (anomaly detection, daily backups) |
| Analytics Foundation | v1.2.3 | `getAssignmentLifecycle` and `validateLifecycle` in `ValidationRegistry` — data layer ready, UI not yet wired |
| Reimbursement Form Generator | v1.2.4 | A4 HTML/PDF form: driver info, odometer, overtime badge, signature area, Section D attachment space |
| Reimbursement Production Polish | v1.2.5 | Sequential PBSI/RMB/YYYY/MM/NNNN numbering (Firebase atomic counter), Section C two-column redesign, role permission gate, No. Assignment reference |

### Pending — v1.2.x

These items are scoped to the 1.2.x release stream and do not require the V2 shell.

#### Login Refinement

**Status:** Complete (2026-06-04)

The `platform.css` V2 login card design is fully production-ready.

| Requirement | Status | Detail |
|---|---|---|
| Center login card on screen | ✅ Done | `display: grid; place-items: center` on `.login-screen` |
| Premium enterprise background | ✅ Done | Four-layer radial gradient mesh (crimson top-left/bottom-left, brand blue bottom-right/top-right) at .07–.22 opacity over `--canvas` |
| Blur / glass effect | ✅ Done | `rgba(255,255,255,0.84)` card + `backdrop-filter: blur(24px) saturate(160%)` + inset top highlight + layered shadow |
| Remove "Masuk Cepat" buttons | ✅ Done | `#loginQuickAccess { display: none }` in Phase 1 section; HTML preserved for dev override |

#### Validation Engine Wiring

**Status:** Pending

`validation.js` validators are complete but form submissions in `assignments.js` and `requests.js` still use inline checks. Wire `ValidationRegistry.validate()` to all form submissions and surface `result.errors[]` in the form UI rather than toast-only feedback.

#### Analytics Foundation UI

**Status:** Pending

`getAssignmentLifecycle` data exists in every completed assignment. A basic in-app KPI display (total trips, avg duration, distance summary) can be added to the Driver Dashboard without the full v1.5.0 Analytics module.

---

## Version 1.3.0 — Advanced Scheduling

**Status:** Planned
**Dependency:** v1.2.x pending items complete, Login Refinement shipped.

### Feature Scope

| Feature | Description |
|---|---|
| **Multi Day Assignments** | Improved multi-day scheduling: parent record tracking, shared status, bulk start/complete across date range |
| **Full Day Assignment Improvements** | Better visual representation on timeline, conflict detection refinements for full-day blocks |
| **Recurring Requests** | Bidang can submit a request with a recurrence pattern (weekly, custom days). Admin approves the pattern; assignments are generated for the full recurrence window |
| **Multi Driver Assignments** | A single trip can be assigned to more than one driver (e.g., lead driver + support). Timeline renders both on the same block |
| **Split Schedules** | A driver can have a morning and afternoon segment for the same date as separate blocks without being treated as a conflict |
| **Capacity Validation** | System warns when all vehicles of a type are booked for a requested date/time window |
| **Conflict Detection** | Extend existing conflict engine to handle multi-driver and recurring assignment overlap scenarios |
| **Bulk Approval Workflow** | Admin can select multiple pending requests and approve or reject them in a single action |

### Migration Plan Reference

1.3.0 features do not require the V2 shell. All features ship within the existing V1 Driver Operations module. Feature flags `multiDayAssignments`, `multiDriverAssignments`, and `recurringRequests` gate new scheduling behaviors independently (see `FEATURE_FLAGS.md`).

---

## Version 1.4.0 — Telegram Automation

**Status:** Planned
**Dependency:** v1.3.0 stable.

### Feature Scope

| Feature | Description |
|---|---|
| **Notification Engine** | Centralized notification bus replacing current per-event Telegram calls. Supports multiple channels (Telegram, future: Web Push) from one dispatch point |
| **Telegram Actions** | Driver can reply to a Telegram message to confirm an assignment, log an odometer reading, or report an issue — without opening the web app |
| **Telegram Approval Workflow** | Admin receives a Telegram message for new requests with inline Approve / Reject buttons. Approval action triggers the full request-to-assignment pipeline |
| **Driver Reminders** | Move H-1 and 2-hour reminder scheduling from browser `setInterval` to Firebase Scheduled Cloud Functions. Reminders fire reliably regardless of browser state |
| **Telegram Self Registration** | Driver users can initiate `/register` on the PBSI Bot to link their Telegram account to their platform user record, replacing the manual Chat ID entry flow |

### Migration Plan Reference

Cloud Function reminders (`server_reminders` flag) can be deployed as early as Migration Plan Phase 2, before the rest of 1.4.0 is ready. Telegram Actions and Approval Workflow require Cloud Function infrastructure established in that same phase. The `telegramAutomation` flag gates the full 1.4.0 feature set.

---

## Version 1.5.0 — Operational Analytics

**Status:** Planned
**Dependency:** v1.4.0 stable, Analytics Foundation data layer (v1.2.3) operational for minimum 3 months of history.

### Feature Scope

| Feature | Description |
|---|---|
| **Driver Utilization Analytics** | Per-driver trip count, total hours, overtime ratio, trend over configurable period |
| **Vehicle Utilization Analytics** | Per-vehicle trip count, total distance (`distanceTravelled`), utilization rate, idle days |
| **Assignment Analytics** | Approval time distributions, start-time punctuality, completion rate, request-to-completion cycle time |
| **Route Analytics** | Most frequent destinations, average distance per purpose, geographical heat map if location data is present |
| **Cost Analytics** | Reimbursement totals per driver, per vehicle, per bidang requester — requires reimbursement form data to be structured and stored |
| **Demand Analytics** | Request volume by bidang, by day-of-week, by time-of-day. Identifies peak demand windows |
| **Smart Dispatch Foundation** | Data model and scoring function for recommending the optimal driver + vehicle for a new request based on availability, utilization balance, and historical performance |

### Data Sources

All 1.5.0 analytics draw from data already being collected:
- `/assignments` — trip records with full lifecycle timestamps and odometer readings
- `/driver_requests` — approval and request workflow data
- `/reimbursement_counters` and future structured reimbursement records
- `getAssignmentLifecycle()` in `validation.js` — lifecycle duration extractor (ready since v1.2.3)

The `operationalAnalytics` feature flag gates the Analytics UI surface. Underlying data collection requires no new implementation.

---

## Version 1.6.0 — AI Operations Assistant

**Status:** Planned
**Dependency:** v1.5.0 stable, Cloud Function infrastructure established in v1.4.0, Firebase Authentication complete (Migration Plan Phase 4).

### Feature Scope

| Feature | Description |
|---|---|
| **Natural Language Queries** | Admin asks operational questions in Bahasa Indonesia and receives structured answers drawn from live Firebase data ("Siapa driver yang paling sering lembur bulan ini?") |
| **AI Recommendations** | System proactively surfaces scheduling recommendations before a request is submitted — e.g., flagging that a vehicle is already 90% booked for the requested week |
| **Operational Insights** | AI-generated narrative summaries of weekly/monthly operational performance, surfaced in the platform and optionally sent to Telegram |
| **Demand Forecasting** | Predict next week's request volume by bidang based on historical patterns. Helps admin pre-position drivers |
| **Workload Forecasting** | Estimate driver fatigue and overtime risk for the upcoming period based on current schedule density |
| **Management Insights** | Executive-level summary cards suitable for stakeholder reporting: key metrics, trend arrows, anomaly callouts |

### Technical Requirements

- Claude API integration via a Cloud Function proxy (API key never exposed to client)
- Read-only access to `/assignments`, `/driver_requests`, `/analytics_cache`
- Streaming response support in the chat UI
- The `aiAssistant` feature flag gates the module. Admin role only in initial release.

---

## Version 2.0.0 — PBSI Operations Platform

**Status:** Future
**Dependency:** All 1.x release stream stable, Migration Plan Phases 0–8 complete.

### Platform Architecture

V2.0.0 represents the completion of the multi-module platform migration described in `MIGRATION_PLAN.md`. It is not a replacement of the Driver Operations module — it is the shell that makes all modules accessible from a single authenticated session.

**Navigation shell:** Three-column layout — Rail (64px, module icons) + Section Panel (218px, per-module navigation) + Main (flex, module content). Mobile: drawer + bottom sheet.

**Operations Hub:** Role-aware module picker landing page for Admin and Bidang roles. Driver role lands directly in Driver Operations.

### Modules at V2.0.0

| Module | Source | Status at V2.0.0 |
|---|---|---|
| **Driver Operations** | V1 production, migrated into V2 shell | Stable production module |
| **Engineering & Sarpras** | New — Kanban pipeline, work orders, technician management | Generally available |
| **Analytics** | Prototype + v1.5.0 data layer | Generally available |
| **AI Assistant** | Prototype + v1.6.0 backend | Generally available (Admin role) |
| **Asset Management** | New — vehicle/facility tracking, maintenance lifecycle | Generally available |

### Unified Platform Engines

These engines are shared across all V2.0 modules. Each replaces a module-specific implementation from V1.

| Engine | Replaces | Status |
|---|---|---|
| **Unified Request Engine** | `requests.js` (Driver Operations only) | Extends approval workflow to work orders, asset requests, engineering tickets |
| **Unified Assignment Engine** | `assignments.js` (Driver Operations only) | Shared scheduling model across drivers and technicians |
| **Unified Attachment Engine** | Section D placeholder in reimbursement form | Firebase Storage integration for work order photos, receipts, documents |
| **Unified Comment Engine** | `comments.js` (request-scoped only) | Thread comments on any entity: assignment, work order, asset |
| **Unified Notification Engine** | `notification-service.js` (Telegram only) | Multi-channel (Telegram, Web Push, in-app feed) from a single dispatch bus |

### Roadmap Modules (Post-2.0.0)

| Module | Description |
|---|---|
| **Operational Insights** | Cross-module KPI reporting, per-bidang data breakdowns, unified CSV/PDF export. Bridges internal Analytics with external stakeholder reporting. |
| **Sansan (Sarana dan Prasarana) Network** | Extends the platform to other PBSI departments. Shared scheduling infrastructure, isolated data namespaces per department. |

---

## Release Stream Summary

```
v1.2.x   ████████████████░░   Active — patch releases
v1.3.0   ░░░░░░░░░░░░░░░░░░   Planned — Advanced Scheduling
v1.4.0   ░░░░░░░░░░░░░░░░░░   Planned — Telegram Automation
v1.5.0   ░░░░░░░░░░░░░░░░░░   Planned — Operational Analytics
v1.6.0   ░░░░░░░░░░░░░░░░░░   Planned — AI Operations Assistant
v2.0.0   ░░░░░░░░░░░░░░░░░░   Future  — PBSI Operations Platform
```

Migration Plan phases run in parallel with 1.x releases:
- Phases 0–1 align with v1.2.x completion
- Phases 2–3 align with v1.3.0 window
- Phase 4 (Firebase Auth) is a standalone milestone between v1.3.0 and v1.4.0
- Phases 5–6 align with v1.4.0–v1.5.0
- Phases 7–9 align with v1.5.0–v2.0.0

---

*This document is authoritative for product sequencing. Feature scope within each version may be adjusted based on operational priorities, but the version ordering and migration phase dependencies must not change without updating `MIGRATION_PLAN.md` in the same commit.*
