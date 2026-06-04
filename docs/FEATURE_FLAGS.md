# PBSI Operations Platform — Feature Flag Registry

> Authoritative reference for all feature flags: their purpose, current state, activation rules, and roadmap version.
> Cross-reference: `MIGRATION_PLAN.md` §8 for technical storage mechanism, `ROADMAP.md` for release context.
> Last updated: 2026-06-04.

---

## Overview

Feature flags control access to unreleased or experimental functionality. Every flagged feature must be **completely hidden** when its flag is off — no disabled buttons, no blurred sections, no visible placeholder surfaces.

### Storage Mechanism

**Primary: Firebase RTDB `/feature_flags/{flagName}`**
- Read once at app startup in `app.js`; stored in a module-level `flags` object.
- A flag set to `true` in Firebase is immediately live for all sessions on next page load.
- Admin can toggle flags via Firebase console or a future flags management UI.

**Secondary: `localStorage` developer override**
- Set `localStorage.setItem('pbsi_flag_{flagName}', 'true')` in the browser console.
- Overrides the Firebase value for the current device only.
- Clears on `localStorage.clear()` or manual removal.
- Never use localStorage overrides in production. Dev-only.

### Flag Lifecycle

```
PENDING   → flag is defined here but not yet implemented in code
DISABLED  → flag exists in code; off in production; feature hidden
ENABLED   → flag is on in production; feature active
RETIRED   → flag and its code branches have been removed
```

A flag moves from `DISABLED` to `ENABLED` only after QA sign-off on staging. A flag is `RETIRED` after it has been `ENABLED` in production for 30+ days without incident and its code branches have been cleaned up.

---

## V2 Shell Flags

These flags control the progressive migration of the V1 shell into the V2 visual design. They are prerequisites for V2 Module Flags. All currently `DISABLED`.

---

### `visualShellV2`

| Field | Value |
|---|---|
| **Flag name** | `visualShellV2` |
| **Firebase RTDB path** | `/feature_flags/visualShellV2` |
| **Description** | Enables the V2 three-column visual shell for Driver Operations only. When active: V1 sidebar is hidden; a 64px navigation rail (VSM-1) appears; V2 section panel, topbar, KPI cards, and micro-animations are revealed phase-by-phase. All Driver Operations business logic is completely unchanged. No routing, no Operations Hub, no new modules. |
| **Current status** | `DISABLED` |
| **Current value in Firebase** | `false` (not yet written — defaults to off) |
| **User visibility** | Hidden from all users. V1 sidebar and header remain active. |
| **Activation version** | v2.0.0 preliminary — after all VSM phases QA-approved on staging |
| **Activation conditions** | All six VSM phases (VSM-1 through VSM-6) QA-approved on staging. No regressions on all four roles at 767px, 768px, 1024px, 1280px. |
| **Dependencies** | `platform.css` committed and deployed. Phase 0 security baseline complete. P3 breakpoint changes applied. |
| **Roles affected when enabled** | All — all users see the V2 visual shell |
| **Rollback** | Set flag to `false`. V1 shell immediately restored on next page load. < 30 seconds. |
| **Notes** | This flag is a hard prerequisite for `operationsHub`. Do not enable `operationsHub` until `visualShellV2` has been stable in production for at least 14 days. VSM phases are: VSM-1 Rail · VSM-2 Section Panel · VSM-3 Header/Topbar · VSM-4 KPI Cards · VSM-5 Timeline Container · VSM-6 Micro Animations. |

---

## V2 Module Flags

These flags control access to the V2 multi-module platform features. All are currently `DISABLED` and invisible to all users. No V2 module code exists in the production bundle at v1.2.5.

---

### `operationsHub`

| Field | Value |
|---|---|
| **Flag name** | `operationsHub` |
| **Firebase RTDB path** | `/feature_flags/operationsHub` |
| **Description** | Enables the V2 three-column shell (Rail + Section Panel + Main) and the Operations Hub module-picker landing page. When active, replaces the V1 sidebar + header layout. The V1 sidebar remains functional when this flag is `false`. |
| **Current status** | `DISABLED` |
| **Current value in Firebase** | `false` (not yet written — defaults to off) |
| **User visibility** | Hidden from all users. V1 sidebar and header remain active. |
| **Activation version** | v2.0.0 (Migration Plan Phase 2) |
| **Activation conditions** | Migration Plan Phase 1 (CSS consolidation) complete. Hash-router implemented. Operations Hub landing page built and QA-approved on staging. |
| **Dependencies** | `platform.css` committed to git and deployed. Phase 0 security baseline complete. |
| **Roles that see the feature when enabled** | Admin, Bidang → Operations Hub. Driver → Driver Operations directly. |
| **Rollback** | Set flag to `false`. V1 layout immediately restored on next page load. |
| **Notes** | This is the single highest-impact flag in the registry. It changes the entire navigation contract. Enabling it for the first time in production must be coordinated with all team members. |

---

### `engineering`

| Field | Value |
|---|---|
| **Flag name** | `engineering` |
| **Firebase RTDB path** | `/feature_flags/engineering` |
| **Description** | Enables the Engineering & Sarpras module in the platform rail. When active: the Engineering icon appears in the rail, the module is accessible at `#/engineering`, and writes to `/work_orders` in Firebase are permitted. |
| **Current status** | `DISABLED` |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. No Engineering entry in rail or hub. |
| **Activation version** | v2.0.0 (Migration Plan Phase 5) |
| **Activation conditions** | `operationsHub` flag enabled and stable. Firebase Storage configured with security rules. `/work_orders` Firebase path defined and rules written. Kanban board and work order form QA-approved on staging. |
| **Dependencies** | `operationsHub` enabled. Firebase Authentication complete (Phase 4). Firebase Storage provisioned. |
| **Roles that see the feature when enabled** | Admin (full access), Engineering role (own work orders), Bidang (submit work order requests). |
| **Rollback** | Set flag to `false`. Engineering entry disappears from rail on next page load. No data is deleted. |
| **Notes** | This is the first net-new module. Its successful deployment validates the multi-module architecture end-to-end. Do not rush activation — use it to stress-test the platform shell, Firebase rules, and build pipeline (if React components are used). |

---

### `analytics`

| Field | Value |
|---|---|
| **Flag name** | `analytics` |
| **Firebase RTDB path** | `/feature_flags/analytics` |
| **Description** | Enables the Analytics module in the platform rail. When active: the Analytics icon appears in the rail, the module is accessible at `#/analytics`, and client-side aggregation runs over `/assignments` data. If a Cloud Function materialized view is available, it reads from `/analytics_cache`. |
| **Current status** | `DISABLED` |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. Analytics Foundation data (v1.2.3) is being collected silently in the background regardless of this flag. |
| **Activation version** | v1.5.0 for basic KPI surface; v2.0.0 for full module in platform shell |
| **Activation conditions** | Minimum 3 months of assignment lifecycle data in Firebase. `getAssignmentLifecycle()` wired to KPI cards. Chart UI connected to live data (not prototype seed data). `operationsHub` flag enabled. |
| **Dependencies** | `operationsHub` enabled. v1.2.3 data layer operational (already complete). |
| **Roles that see the feature when enabled** | Admin only in initial release. Bidang (own-data view) in a subsequent sub-release. |
| **Rollback** | Set flag to `false`. Analytics entry disappears from rail. No data is deleted. |
| **Notes** | The Analytics Foundation data layer has been collecting data since v1.2.3. The flag only controls the UI surface — data collection is unconditional. Firebase RTDB has no server-side aggregation; initial implementation must use client-side aggregation over full dataset fetches. Monitor performance as dataset grows. |

---

### `aiAssistant`

| Field | Value |
|---|---|
| **Flag name** | `aiAssistant` |
| **Firebase RTDB path** | `/feature_flags/aiAssistant` |
| **Description** | Enables the AI Operations Assistant module in the platform rail. When active: the AI icon appears in the rail, the chat interface is accessible at `#/ai`, and queries are proxied to the Claude API via a Cloud Function. |
| **Current status** | `DISABLED` |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. |
| **Activation version** | v1.6.0 for basic capability; v2.0.0 for full platform integration |
| **Activation conditions** | Cloud Function infrastructure established (v1.4.0 milestone). Firebase Authentication complete (Phase 4). Claude API Cloud Function proxy deployed with API key secured in environment variables (never in client code). `analytics` flag enabled and stable. |
| **Dependencies** | `operationsHub` enabled. `analytics` enabled. Firebase Auth (Phase 4) complete. Cloud Function codebase deployed. |
| **Roles that see the feature when enabled** | Admin only. No other roles in initial release. |
| **Rollback** | Set flag to `false`. AI Assistant entry disappears from rail. No data is deleted. |
| **Notes** | The Claude API key must never appear in client-side code, `index.html`, or any committed file. It lives exclusively in Cloud Function environment configuration. AI access is read-only over operational data — the assistant cannot create, edit, or delete records. |

---

### `assetManagement`

| Field | Value |
|---|---|
| **Flag name** | `assetManagement` |
| **Firebase RTDB path** | `/feature_flags/assetManagement` |
| **Description** | Enables the Asset Management module in the platform rail and Operations Hub. When active: the Asset Management icon appears in the rail, the module is accessible at `#/assets`, and writes to `/assets` in Firebase are permitted. Covers vehicle and facility asset tracking, ownership records, and maintenance lifecycle. |
| **Current status** | `DISABLED` |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. |
| **Activation version** | v2.0.0 (Migration Plan Phase 9) |
| **Activation conditions** | `engineering` module stable (asset records integrate with work orders). `/assets` Firebase path defined and rules written. Asset form, ownership view, and maintenance lifecycle UI QA-approved. |
| **Dependencies** | `operationsHub` enabled. `engineering` enabled and stable. Firebase Auth complete. |
| **Roles that see the feature when enabled** | Admin (full access), Engineering (asset status updates). |
| **Rollback** | Set flag to `false`. Asset Management entry disappears. No data deleted. |
| **Notes** | Asset Management is the final module in the v2.0.0 platform. Do not activate until Engineering module has been stable in production for at least one full operational quarter. Asset records that reference work orders require referential consistency — activation ordering matters. |

---

## 1.x Feature Flags

These flags control advanced features within the V1 Driver Operations release stream. They do not require the V2 shell. All are currently `PENDING` or `DISABLED`.

---

### `multiDayAssignments`

| Field | Value |
|---|---|
| **Flag name** | `multiDayAssignments` |
| **Firebase RTDB path** | `/feature_flags/multiDayAssignments` |
| **Description** | Enables advanced multi-day assignment behavior: parent record tracking, shared lifecycle status across the date range, and bulk start/complete across all dates in a series. Note: basic multi-day date-range expansion already works in production (generates one assignment per date) — this flag covers the improved behavior only. |
| **Current status** | `PENDING` — not yet implemented |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. Basic multi-day expansion continues to work regardless of this flag. |
| **Activation version** | v1.3.0 |
| **Activation conditions** | v1.2.x Login Refinement complete. Parent/child assignment relationship schema defined. Bulk start/complete UI implemented and QA-approved. |
| **Dependencies** | None. Independent of V2 shell flags. |
| **Roles that see the feature when enabled** | Admin (create multi-day series), Driver (bulk start/complete own series). |
| **Rollback** | Set flag to `false`. New advanced UI hidden. Existing multi-day assignments (basic format) unaffected. |

---

### `multiDriverAssignments`

| Field | Value |
|---|---|
| **Flag name** | `multiDriverAssignments` |
| **Firebase RTDB path** | `/feature_flags/multiDriverAssignments` |
| **Description** | Enables assignments that list more than one driver (e.g., lead driver + support driver). Timeline renders both drivers on a shared block. Conflict detection extends to cover all assigned drivers. Each driver can independently start and complete their participation. |
| **Current status** | `PENDING` — not yet implemented |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. Assignment form shows only a single driver field while flag is off. |
| **Activation version** | v1.3.0 |
| **Activation conditions** | `multiDayAssignments` QA complete. Assignment data schema extended to support `drivers[]` array. Timeline renderer updated to handle multi-driver blocks. Conflict detection updated. |
| **Dependencies** | `multiDayAssignments` flag — both ship in v1.3.0. |
| **Roles that see the feature when enabled** | Admin (assign multiple drivers), both assigned drivers (start/complete own participation). |
| **Rollback** | Set flag to `false`. Assignment form returns to single-driver field. Existing multi-driver assignments remain in Firebase but are displayed with only the primary driver. |

---

### `recurringRequests`

| Field | Value |
|---|---|
| **Flag name** | `recurringRequests` |
| **Firebase RTDB path** | `/feature_flags/recurringRequests` |
| **Description** | Enables bidang to submit a request with a recurrence pattern (weekly on specific days, bi-weekly, or custom interval). Admin approves the pattern once; the system generates all assignments for the recurrence window. Admin can terminate the recurrence series at any point. |
| **Current status** | `PENDING` — not yet implemented |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. Request form shows no recurrence option while flag is off. |
| **Activation version** | v1.3.0 |
| **Activation conditions** | v1.3.0 advanced scheduling foundation stable. Recurrence pattern schema defined. Assignment generation logic handles variable-length series. Admin UI for series management (view, terminate) built and QA-approved. |
| **Dependencies** | `multiDayAssignments` flag active (recurring series uses the same parent/child assignment model). |
| **Roles that see the feature when enabled** | Bidang (submit recurring request), Admin (approve or reject the full pattern; terminate active series). |
| **Rollback** | Set flag to `false`. Recurrence UI hidden. Existing recurring assignments remain and continue to operate as individual assignments. |
| **Notes** | Recurrence termination must be implemented before this flag is enabled. Do not activate without a clear workflow for admin to stop a recurring series. |

---

### `telegramAutomation`

| Field | Value |
|---|---|
| **Flag name** | `telegramAutomation` |
| **Firebase RTDB path** | `/feature_flags/telegramAutomation` |
| **Description** | Enables the full v1.4.0 Telegram Automation feature set: inline Approve/Reject buttons in admin Telegram notifications, driver reply-to-confirm workflow, Telegram self-registration (`/register` command), and the centralized Notification Engine. Note: Cloud Function scheduled reminders (`serverReminders` flag) can be activated independently before this flag. |
| **Current status** | `PENDING` — not yet implemented |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. Existing Telegram notifications continue to fire via browser-side code while flag is off. |
| **Activation version** | v1.4.0 |
| **Activation conditions** | Cloud Function infrastructure deployed and verified. `serverReminders` flag enabled and stable for 30+ days. Telegram Bot updated with inline keyboard handlers. Bot token moved from client-side code to Cloud Function environment variable. |
| **Dependencies** | `serverReminders` flag enabled. Cloud Function codebase deployed. |
| **Roles that see the feature when enabled** | Admin (inline approval buttons), Driver (reply-to-confirm, self-registration), Bidang (receives richer notification format). |
| **Rollback** | Set flag to `false`. Falls back to existing browser-side Telegram notification code. `serverReminders` flag stays active independently. |
| **Notes** | The Telegram Bot token must be moved to Cloud Function environment before this flag activates. The client-side token in `notification-service.js` is a security debt — removing it from the browser bundle is a requirement for v1.4.0, not optional. |

---

### `operationalAnalytics`

| Field | Value |
|---|---|
| **Flag name** | `operationalAnalytics` |
| **Firebase RTDB path** | `/feature_flags/operationalAnalytics` |
| **Description** | Enables the v1.5.0 Operational Analytics UI: driver utilization, vehicle utilization, route analytics, cost analytics, demand analytics, and Smart Dispatch Foundation scoring. In v1.5.0 this surfaces within the Driver Operations module (no V2 shell required). In v2.0.0 it migrates to the dedicated Analytics module. |
| **Current status** | `PENDING` — not yet implemented |
| **Current value in Firebase** | `false` |
| **User visibility** | Hidden from all users. Analytics Foundation data (`getAssignmentLifecycle`) is collected unconditionally — this flag only controls the UI surface. |
| **Activation version** | v1.5.0 |
| **Activation conditions** | Minimum 3 months of assignment lifecycle data in Firebase. Chart UI connected to live data. Client-side aggregation performance verified against actual dataset size. Optionally: Cloud Function `/analytics_cache` writer deployed for large datasets. |
| **Dependencies** | None (data collection already active since v1.2.3). Optionally: Cloud Function for performance at scale. |
| **Roles that see the feature when enabled** | Admin (full analytics), Bidang (own-request analytics). Driver sees only their personal utilization summary. |
| **Rollback** | Set flag to `false`. Analytics UI hidden. No data is deleted. Re-enabling the flag immediately restores the view from the same data. |

---

## Infrastructure Flags

These flags control technical platform behavior rather than user-facing features. They are set by engineers, not product decisions.

| Flag name | Description | Current status | Activation |
|---|---|---|---|
| `sessionExpiry` | Enforce configurable session timeout (default 12 hours). On expiry, user is returned to login. | `DISABLED` | Migration Plan Phase 0 |
| `offlineQueue` | Enable localStorage pending-write queue. Assignments submitted while Firebase is unreachable are retried on reconnect. | `DISABLED` | Migration Plan Phase 1 |
| `serverReminders` | Disable browser `setInterval` reminder checks. Trust Cloud Function scheduled reminders as the sole sender. | `DISABLED` | Migration Plan Phase 2 (earliest) |
| `firebaseAuth` | Use Firebase Authentication for login instead of PIN plaintext lookup. Dual-auth period required before decommissioning PIN path. | `DISABLED` | Migration Plan Phase 4 |
| `darkModeToggle` | Show theme toggle button in shell chrome. Wires `[data-theme="dark"]` to a persistent user preference. | `DISABLED` | Migration Plan Phase 3 |
| `devMode` | Enable development-only UI: "Masuk Cepat" quick-login buttons, verbose console logging, flag override panel. Must never be `true` in production Firebase. | `DISABLED` | Development environments only |

---

## Flag × Roadmap Version Matrix

| Flag | v1.2.x | v1.3.0 | v1.4.0 | v1.5.0 | v1.6.0 | v2.0.0 |
|---|---|---|---|---|---|---|
| `visualShellV2` | — | — | — | — | — | ✓ Active |
| `sessionExpiry` | Phase 0 | — | — | — | — | — |
| `offlineQueue` | Phase 1 | — | — | — | — | — |
| `serverReminders` | Phase 2 (early) | — | ✓ Active | — | — | — |
| `multiDayAssignments` | — | ✓ Active | — | — | — | — |
| `multiDriverAssignments` | — | ✓ Active | — | — | — | — |
| `recurringRequests` | — | ✓ Active | — | — | — | — |
| `firebaseAuth` | — | — | Phase 4 | — | — | — |
| `telegramAutomation` | — | — | ✓ Active | — | — | — |
| `operationalAnalytics` | — | — | — | ✓ Active | — | — |
| `darkModeToggle` | — | — | — | — | Phase 3 | — |
| `operationsHub` | — | — | — | — | — | ✓ Active |
| `engineering` | — | — | — | — | — | ✓ Active |
| `analytics` | — | — | — | Partial | — | ✓ Active |
| `aiAssistant` | — | — | — | — | ✓ Partial | ✓ Active |
| `assetManagement` | — | — | — | — | — | ✓ Active |
| `devMode` | Dev only | Dev only | Dev only | Dev only | Dev only | Dev only |

---

## Flag Implementation Rules

These rules apply to every engineer and every Claude Code session working on this codebase.

1. **Hidden means absent.** A feature behind a `false` flag must not produce any DOM output, network request, or visible effect. No disabled buttons, no `display: none` wrappers, no grayed-out placeholders.

2. **Flags are read once at startup.** Check the `flags` object populated by `app.js` at init time. Do not re-read from Firebase mid-session unless the flag has an explicit live-reload listener.

3. **Never hardcode a flag state in application code.** All flag checks read from the `flags` object. No `if (false)` guards or commented-out blocks standing in for a flag.

4. **New flags start as `DISABLED`.** Every new flag in this registry defaults to `false`. Enable on staging first; production enable requires explicit QA sign-off.

5. **Retiring a flag requires a code cleanup commit.** When a flag is promoted to always-on, remove the flag check and the `false` branch from code in a dedicated cleanup commit. Update this registry to mark the flag `RETIRED` and remove it from the matrix.

6. **`devMode` is the only flag that may show hidden UI.** The "Masuk Cepat" quick-login buttons and any other development convenience surfaces are gated exclusively on `devMode`. No other flag may reveal development-only UI.

7. **Document new flags in this file before implementing them.** Adding a flag to code without a registry entry creates invisible flags. Update this file in the same commit that introduces the flag.

---

*This document is authoritative for all feature flag decisions. If a flag is not listed here, it does not exist. If a flag's state conflicts between this document and Firebase, this document describes the intended state — reconcile by updating Firebase to match.*
