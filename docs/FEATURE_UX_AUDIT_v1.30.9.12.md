# FEATURE UX AUDIT — Sarpras Operations
**Audited at:** APP_VERSION v1.30.9.12 "Custom Role Collection-Read Fix" · 2026-08-14
**Scope:** Analysis only. No code, data, rules, or deploy changes. Part of the Claude Design handoff package — see `DESIGN_BRIEF_v1.30.9.12.md` for the index of the full package.
**Method:** Read directly from source (`index.html`, `js/app.js` MODULE_DEFS/canAccessModule, every `js/` subdirectory, `js/config/role-registry.js`, `js/config/role-permissions.js`, `database.rules.json`). Nothing here is guessed or extrapolated from naming alone.

---

## 1. Complete Feature Inventory (55 features, 14 areas)

Legend — **Roles**: A=admin, B=bidang, D=driver, V=viewer, EC=engineering_coordinator, EM=engineering_member, Pilot=single allowlisted identity (admin + username `evan`).

### Assignment / Scheduling
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 1 | Papan Jadwal (Assignment Timeline/Dashboard) | `js/assignments.js`, `js/timeline.js` | A,B,D,V (view) | Date-scoped driver×vehicle×destination board — the app's original core screen | `assignments` |
| 2 | Assignment Create/Edit + Conflict Detection | `js/assignments.js` | A (create/edit/delete) | Author an assignment; hard-blocks driver/vehicle double-booking | `assignments/{id}` |
| 3 | Request Workflow (Ajukan/Approve/Reject) | `js/requests.js` | B (create), A (approve/reject) | Bidang submits a request instead of authoring directly; admin converts to assignment | `driver_requests` |
| 4 | Dispatch Recommendation + Decision Replay | `js/components/approval-intelligence-panel.js`, `js/services/dispatch-*-engine.js` | A | Recommends best driver+vehicle for a pending request with explainable scoring + override audit trail | `dispatchIntelligence/*` |
| 5 | Comment Thread (per request) | `js/comments.js` | A, B (own), D (assigned) | Lightweight discussion per request | `driver_requests/{id}/comments` |
| 6 | Trip Lifecycle (Start/Complete/Cancel + Odometer) | `js/modal.js`, `js/assignments.js` | A,B,D | Odometer capture at start, completion/cancellation with reason | `assignments/{id}` |
| 7 | Overtime Override (per assignment) | `js/modal.js` | A | Manually correct auto-computed overtime status | `assignments/{id}` |
| 8 | WhatsApp Summary Copy | `js/modal.js` | anyone with detail access | One-click formatted trip summary for off-app coordination | — |
| 9 | Data Recovery (console-only) | `js/recovery.js` | A (console only) | Emergency recovery of assignments from requests; not a discoverable UI feature | `assignments`, `driver_requests` |
| 10 | Form Guard | `js/form-guard.js` | cross-cutting | Unsaved-changes protection on every operational modal | — |

### Drivers
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 11 | Manajemen Driver | `js/drivers.js`, `js/drivers-store.js` | A | Driver roster CRUD | `drivers` |
| 12 | Driver Dashboard (own view) | `js/driver-dashboard.js` | D | Read-only personal task board (Active/Today/Upcoming/History) | — |
| 13 | Audit Driver | `js/app.js` | A | Driver-scoped activity log | `logs` |
| 14 | Driver Wellness Dashboard | `js/components/driver-wellness-*.js` | A | Workload/fatigue-risk signals per driver | `dispatchIntelligence/*` |
| 15 | Driver Prediction Dashboard | `js/components/driver-prediction-dashboard.js` | A | Certified-model forward risk/utilization outlook | — |
| 16 | Driver Capacity/Recommendation Engine | `js/services/driver-capacity-engine.js` et al. | A (consumed by #4,#14,#15) | Monthly capacity/utilization bands feeding recommendations | `dispatchIntelligence/capacityHistory` |

### Fleet / Vehicles
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 17 | Manajemen Kendaraan | `js/vehicles-store.js` | A | Fleet master data | `vehicles` |
| 18 | Fleet Dashboard (5-KPI strip) | `js/components/fleet-dashboard.js` | A | Fixed 5 KPIs, deliberately not a second analytics page | — |
| 19 | Vehicle Detail Drawer | `js/components/vehicle-detail-drawer.js` | A | Health score, compliance, maintenance timeline | `vehicles/{id}` |
| 20 | Vehicle Reminder Panel | `js/components/vehicle-reminder-panel.js` | A | Upcoming maintenance/compliance "needs attention" strip | `vehicles/{id}` |
| 21 | Vehicle Activity/Unified Timeline | `js/vehicle/vehicle-timeline.js` | A | Chronological per-vehicle events (reuses Gudang's activity-engine) | — |
| 22 | Vehicle Prediction Dashboard | `js/components/vehicle-prediction-dashboard.js` | A | 2nd Prediction Service consumer | — |
| 23 | Vehicle Recommendation Panel | `js/vehicle/vehicle-recommendation-panel.js` | A | "What to do" layer from certified prediction | — |
| 24 | Vehicle Simulation Panel | `js/vehicle/vehicle-simulation-panel.js`, `js/simulation/*` | A | "What if" scenario testing, discards after use | — |
| 25 | Maintenance Records + Projection | `js/services/maintenance-*.js` | A | Deterministic next-due projection (not the probabilistic engine) | `vehicles/{id}` |
| 26 | Compliance & Financial History | `js/config/compliance-config.js` | A | Insurance/tax expiry tracking | `vehicles/{id}` |
| 27 | Audit Kendaraan | `js/app.js` | A | Vehicle-scoped activity log | `logs` |

### Warehouse / Gudang
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 28 | Gudang (8 screens: Dashboard, Catalog, Goods In/Out, Movement History, Stock Opname, Analytics, Inventory Intelligence) | `js/gudang/*` | **A only** (no "Warehouse Staff" role exists yet — deliberate, not an oversight) | Full warehouse operating system | `gudang/items`, `gudang/movements`, `gudang/assets`, `gudang/assetHistory`, `gudang/locations`, `gudang/departments`, `gudang/stockProjection` |

### Overtime
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 29 | Overtime Management (10 screens: Dashboard, Rekap, Karyawan, Tarif, Hari Libur, Laporan, Riwayat Laporan, Penyesuaian, Tutup Periode, Arsip) | `js/overtime/*` | **A only** | Tiered-rate overtime computation + national holiday calendar + period closing | `overtimeUnits/Employees/RateVersions/Holidays/Records/DailySummary/MonthlySummary/Audit/Budget/ReportHistory/Closing/Archive` |

### Petty Cash
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 30 | Petty Cash Center (5 screens: Dashboard, Pengeluaran, Generate NOR, Riwayat NOR, Pengaturan) | `js/petty-cash/*` | **A only** | Cash expense tracking against cycle opening balance, grouped into official NOR documents | `pettyCashExpenses/Nors/Cycles/Settings/Audit` |
| 31 | NOR Document Generation | `js/petty-cash/nor-*.js`, `js/docs/templates/nor.js` | A | Renders sequentially-numbered official letterhead PDF + 3-sheet Excel | — |

### Engineering
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 32 | Engineering Operations (5 screens: Dashboard, Timeline, Riwayat, Pekerjaan, Pengaturan) | `js/engineering/*` | A (full), EC (field coordination + verify, no create/edit/delete), EM (execution only) | Work-order execution unit, distinct lifecycle from Driver Ops (join→start→finish/postpone/continueTomorrow→verify) | `engineering/assignments/workReports/notifications/settings` |
| 33 | Engineering Analytics | `js/engineering/analytics/engineering-analytics.js` | A only (capability, not just admin-flag) | Engineering-scoped analytics | — |

### Reimbursement
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 34 | Form Reimbursement Generator | `js/reimbursement.js` | A, D | Computes trip overtime pay, generates sequentially-numbered PDF via the shared Document Generation Framework | — (doc numbers via Cloud Function) |

### NOR / Documents (shared infrastructure)
| # | Feature | Files | Roles | Purpose |
|---|---|---|---|---|
| 35 | Document Generation Framework | `js/docs/doc-engine.js` + exporters/viewer/print-manager/template-registry/design-system | all (via consumers) | One reusable pluggable PDF/DOCX pipeline for every generated document app-wide |

### User & Role Management
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 37 | Manajemen User | `js/admin.js`, `js/users.js` | A only | User CRUD, role assignment, Individual Permission overrides, Reset PIN, Telegram/push linking | `users` |
| 38 | Role Management Center | `js/role-management/*` | A only | View 9 System Roles (read-only) + create/edit/soft-archive Custom Roles | `customRoles` |
| 39 | Role-Level & Individual Permission Overrides | `js/permission-management/*`, `js/permission-service.js` | A only (management surface) | Two additive override layers on top of base Role→Permission grant | `userPermissionOverrides`, `rolePermissionOverrides` |

### Notifications
| # | Feature | Files | Roles | Purpose | RTDB |
|---|---|---|---|---|---|
| 40 | In-App Notifications + Activity Log | `js/notifications.js` | A (full), others (own-scoped) | Server-computed notification feed + global audit log | `notifications/{uid}`, `notification_state/{uid}`, `logs` |
| 41 | Web Push Notifications | `js/push.js` | all (opt-in) | Client half of 3-channel pipeline; soft-ask, never cold-prompts | `push_subscriptions` |
| 42 | Telegram Bot Notifications | `js/telegram.js` | all (opt-in) | Per-user Telegram chat-ID linking | `settings/telegram` |

### Analytics / Executive / Prediction / Dispatch Intelligence
| # | Feature | Files | Roles | Purpose |
|---|---|---|---|---|
| 43 | Home (Executive Command Center / Request / Driver workspace) | `js/workspace/*`, `js/widgets/*` | all (role-tailored) | Default landing for every role; "what needs my attention today" |
| 44 | Analytics — Driver/Petty Cash/Executive/Engineering | `js/analytics/*` | A only | Domain KPI/trend dashboards; Executive = 5-domain Operational Health Score |
| 45 | Dispatch Analytics / Recommendation Accuracy | `js/analytics/dispatch-analytics-engine.js`, `recommendation-accuracy-*.js` | A only | Measures recommendation-engine accuracy vs. actual admin decisions |
| 46 | Fleet Recommendation Board | `js/recommendation/*` | A only | "What should the admin do" — prioritized action board from certified predictions |
| 47 | Scenario Simulation Engine | `js/simulation/*` | A only | "What if" — clones input, reforecasts, compares, discards |
| 48 | Prediction Service / Explainability | `js/services/prediction-service.js`, `js/prediction/*` | infra (A-facing) | Single certified gateway every prediction dashboard must consume |
| 49 | Export Center | `js/exports/*` | A only | PDF/Excel export catalog across analytics surfaces |
| 50 | Sarpras Intelligence (V2 Platform) | `js/v2/*` | **Pilot only** (`admin` + `evan`) | Organizational Learning Platform per root `CLAUDE.md`; architecture-complete, content-empty; NOR pilot pipeline (analyze→draft→validate→explain→recommend) with mandatory human review/approval |

### Settings / Config
| # | Feature | Files | Roles |
|---|---|---|---|
| 51 | Konfigurasi Global | `js/settings-store.js` | A only |
| 52 | Module-level Settings (Petty Cash, Overtime, Engineering, Gudang) | per-module | A only |
| 53 | Feature Flags / V2 Pilot Gate | `js/config/feature-gates.js` | infra |

### PWA
| # | Feature | Files |
|---|---|---|
| 54 | Install / Silent Auto-Update | `js/pwa.js`, `manifest.json`, `service-worker.js` |
| 55 | Offline Experience Indicator | `js/app.js` (`initOfflineExperience`) |

**Access-control pattern, in one line:** Driver Ops is the only genuinely multi-role module (admin/bidang/driver/viewer). Petty Cash, Overtime, Analytics, Gudang, Konfigurasi, Role Management are **all admin-only**. Engineering has its own 3-role capability matrix. Sarpras Intelligence is **single-user-gated**, not role-gated — do not design it as if any admin can reach it.

---

## 2. User / Role Analysis

Source of truth verified in code: `js/config/role-registry.js` (roles + Engineering/Sarpras-Intelligence capability matrix) and `js/config/role-permissions.js` (`BASE_GRANTS`). 6 legacy roles are the only ones the runtime (`functions/src/auth/verifyPin.js` `VALID_ROLES`) actually issues login tokens for. Custom Roles exist in Role Management as a UI/data concept but assignment to real users is deliberately still disabled pending a coordinated 3-file security migration — do not design around Custom Roles being assignable today.

| Role | Primary tasks | Most-used modules | Info needed immediately | Frequent actions | Rare actions |
|---|---|---|---|---|---|
| **admin** | Runs the whole operation — scheduling, approvals, fleet, cash, HR overtime, warehouse, config | Home (Executive), Driver Ops, Petty Cash, Overtime, Analytics, Konfigurasi | Today's operational health, pending approvals, anomalies | Approve/create assignment, log expense, check driver status | Role Management edits, Custom Role authoring, data recovery console |
| **bidang** | Requests vehicles/drivers for their org unit; self-drive option | Home (Request workspace), Driver Ops (own requests) | Status of my request, my own trip's schedule | Ajukan Jadwal, comment on own request, start/complete own self-drive trip | — |
| **driver** | Executes assigned trips | Home (Driver workspace), Driver Ops (own trips), Reimbursement | My active/today/upcoming trips | Start trip (odometer), complete trip, print reimbursement | Cancel (rare, own only) |
| **viewer** | Legacy, read-only; faded from current role matrix per docs-mining findings — treat as low-priority in the redesign, verify with the user whether it's still provisioned to any real account before investing design effort | Driver Ops (view only) | Today's schedule | View only | — |
| **engineering_coordinator** | Field coordination, verification of work | Engineering (Dashboard, Timeline, Riwayat, Pekerjaan) | Queue of jobs needing verification | Join/start/finish/postpone jobs, verify, Catat Pekerjaan | — |
| **engineering_member** | Field execution | Engineering (Dashboard, Pekerjaan) | My assigned jobs | Join/start/finish/continueTomorrow own jobs | — |

**"Bidang" is overloaded** — it names both the org department ("Bidang Sarana dan Prasarana") *and* the requester role. Keep these visually/verbally distinct in any new IA or copy; conflating them in redesigned navigation labels would reintroduce ambiguity the codebase already works around.

---

## 3. Workflow Analysis (click/friction audit, code-verified)

- **Ajukan → Approve → Assignment**: Bidang creates a request (1 form) → Admin opens Approve modal, sees a Dispatch Recommendation panel with one-click "Terapkan Rekomendasi" prefill → approves. This is already close to optimal (one-click apply) — a redesign should preserve, not rebuild, this flow.
- **Assignment creation**: Admin opens "Tambah Jadwal" → fills driver/vehicle/date/time/destination → live conflict preview disables Simpan on overlap. Already has real-time validation; friction is the form length, not the validation logic.
- **Trip lifecycle**: Start → (Odometer modal, KM Awal) → Complete → (Odometer modal, KM Akhir, auto-computes distance) → done. Two required modal round-trips per trip; could be flattened into one panel without changing the underlying two data-capture points (odometer-in and odometer-out are genuinely two different moments in time, so this is not pure friction — see Guardrails doc).
- **Finding a specific assignment's vehicle**: driver row → block color → **must cross-reference a static 4-item legend below the fold of the board** to know which vehicle. No inline label. This is a real, avoidable multi-step lookup — see `ASSIGNMENT_BOARD_REDESIGN_v1.30.9.12.md` §Vehicle Identity.
- **Reaching List view on mobile (Admin/Bidang)**: the Timeline/Daftar toggle is `display:none` at ≤767px and no bottom-nav substitute exists for these two roles (only the Driver role's bottom-nav has direct list access) — Admin/Bidang are **structurally stuck** with the dense horizontal-scroll grid on a phone. This is the single highest-value mobile fix candidate found in this audit (P0, see Redesign Backlog below).
- **Warehouse "who can pick"**: Gudang is admin-only by design (no Warehouse Staff role exists) — any redesign that implies a broader warehouse workflow (e.g., a picker/receiving-clerk persona) would be inventing a role that doesn't exist. Flag to the user before designing for it.

---

## 4. Known UX Problems (compiled from live code, the user-provided screenshot, and prior project reports — see `docs/*` sources cited inline)

**P0 — structural, code-confirmed:**
1. Mobile List-view unreachable for Admin/Bidang on the Assignment Board (above).
2. Assignment Board vehicle legend is a **static hardcoded 4-item list**, never regenerated from the live `/vehicles` collection — a 5th vehicle added in Vehicle Management renders correctly on blocks (dynamic color lookup) but never appears in the legend. Same hardcoding affects the manual create/edit form's vehicle `<select>`.
3. Primary/secondary/danger/success buttons (`.btn-primary` etc.) have **no min-height** — effective height ≈34px, under the 44px touch-target guideline that was deliberately retrofitted onto nav chrome (sidebar, bottom nav, date-nav arrows) in v1.20.8 but never extended to in-form buttons. The "Hari Ini" button shrinks to ~30px tall on mobile.
4. `var(--white)` dark-mode trap: ~21 live `background: var(--white)` sites in `style.css` (cards, panels, form controls, the base `.modal-box` shell) stay white under dark mode. Documented by the maintainers as a known, deliberately-deferred issue (dual-use token blocks a blind fix).
5. Breakpoint chaos: 20+ distinct pixel values across 9 CSS files with no shared token — concretely, the "mobile shell" boundary is 767/768px in the core shell but 760px in Engineering/Gudang (an 8px dead zone), and the "bottom sheet" threshold is 560/600/640px depending on which overlay (`.modal-box` vs `.exec-drawer` vs `.req-sheet`) — in the 561–640px band, different overlays on the same screen can be in different visual modes simultaneously.

**P1 — real gaps, lower blast radius:**
6. Assignment title truncation with no escape hatch (confirmed in the user's own screenshot: "Pengantaran Keberangkatan Ti…" / "…Tim World Champ 2026 B…" both ellipsis-cut with no visible way to read the full text without the ⋮ menu).
7. No visual link between two rows that represent the same logical trip (screenshot shows Dedi and Aria both driving the same 07:00–11:00 event with no grouping indicator).
8. No passive conflict badge for overlaps that already exist in stored data — conflict UI only fires during active create/edit/drag, never as a standing indicator on the rendered board.
9. Design-system token duplication: 3-4 parallel color/shadow/radius systems live simultaneously (`style.css` legacy, `platform.css` V2 — defined but only 22 of its own uses outside itself — a "card system" palette copy-pasted across `gudang.css`/`engineering.css`/`sarpras-intelligence.css`/`platform.css`'s own `.v2-analytics-claude` scope, and a separate Overtime/Petty-Cash crimson pair). See `DESIGN_SYSTEM_SPEC_v1.30.9.12.md`.
10. Component duplication: `.eng-btn`/`.gud-btn` are character-for-character identical CSS declared twice; 4 separate badge/chip systems; 3 near-identical empty-state implementations; Gudang has its own local `showToast()` parallel to the shared `#toast` element.
11. Vehicle Management: two redundant "total vehicles" stat tiles (cosmetic); no sort/table/pagination on the Inventory grid (flagged in a prior audit as a platform-wide concern, not fixed).

**P2 — polish:**
12. Assignment Board header stat area ("8 jam • 09:00–17:00" in the user's screenshot) did not visibly match the actual displayed time range (04:00–18:00) or event times (05:30–11:00) in the one sample captured — flag to the designer to verify against the live app whether this is a static "standard operating hours" label (by design) or a genuine display bug; this audit could not confirm the source of that string from code in the time available.
13. Phone numbers truncated in driver rows ("+62 813-1…") with no visible full-number affordance in the timeline view itself (full number is presumably in the detail modal).
14. Overtime has **no prior UX audit document at all** — treat as unaudited territory; do a fresh pass rather than assuming prior decisions exist.

---

## 5. Component Audit summary
See `DESIGN_SYSTEM_SPEC_v1.30.9.12.md` §5 for the full inventory with file:line citations. One-line summary: **modals, select, and date-picker are genuinely shared** (adoption gap only — Gudang/Sarpras-Intelligence/workspace-list-kit never import the shared select/datepicker and hand-roll their own). **Buttons, chips/badges, empty states, and tables are not shared** — each newer module (`gudang.css`, `engineering.css`) explicitly copies the previous module's CSS "verbatim" per its own header comments rather than drawing from one library.
