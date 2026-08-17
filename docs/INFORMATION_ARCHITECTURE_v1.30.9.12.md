# INFORMATION ARCHITECTURE — Current → Proposed
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14
**Part of the Claude Design handoff package** — see `DESIGN_BRIEF_v1.30.9.12.md`.

---

## 1. Current IA (verified from `js/app.js` MODULE_DEFS + canAccessModule)

```
Sarpras Operations (V2 shell: 64px Rail + Section Panel + Topbar + Main)
│
├── Home  (every role — role-tailored workspace, default landing since v1.19.9)
│     ├── admin      → Executive Command Center (hero, attention center, recommendations,
│     │                 snapshot, activity, quick launcher)
│     ├── bidang      → Request workspace (my requests)
│     ├── driver      → Driver workspace (my trips)
│     └── engineering  → Engineering workspace (reserved/placeholder)
│
├── Driver Operations ("Papan Jadwal")           [admin, bidang, driver, viewer]
│     ├── Timeline (default) / Daftar (list) toggle — toggle hidden ≤767px except for Driver role
│     ├── Manajemen Driver                         [admin]
│     ├── Manajemen Kendaraan (Inventory / Prediction tabs)  [admin]
│     ├── Audit Driver / Audit Kendaraan            [admin]
│     └── Requests (Ajukan/Approve/Reject)          [bidang create, admin approve]
│
├── Petty Cash Center                              [admin only]
│     ├── Dashboard
│     ├── Pengeluaran (Expenses)
│     ├── Generate NOR
│     ├── Riwayat NOR
│     └── Pengaturan
│
├── Overtime Management                            [admin only]
│     ├── Dashboard · Rekap Lembur · Karyawan · Tarif · Hari Libur
│     └── Laporan · Riwayat Laporan · Penyesuaian Data · Tutup Periode · Arsip
│
├── Analytics                                      [admin only]
│     ├── Driver Analytics
│     ├── Petty Cash Analytics
│     ├── Executive Analytics (5-domain Health Score)
│     ├── Engineering Analytics
│     ├── Dispatch Analytics / Recommendation Accuracy
│     ├── Driver Wellness / Driver Prediction / Vehicle Prediction
│     └── Export Center
│
├── Konfigurasi                                    [admin only]
│     ├── Manajemen User (+ role assignment, Individual Permissions, Reset PIN)
│     └── Konfigurasi Global (ops hours, notifications, Telegram, Dispatch buffer)
│
├── Role Management                                [admin only]
│     └── System Roles (read-only) + Custom Roles (create/edit/archive; assignment disabled)
│
├── Engineering Operations                         [admin, engineering_coordinator, engineering_member]
│     ├── Dashboard · Timeline · Riwayat (EC/EM) · Pekerjaan (myjobs) · Pengaturan [admin]
│     └── Engineering Analytics                     [admin]
│
├── Gudang (Warehouse Operating System)             [admin only — no Warehouse Staff role exists]
│     ├── Dashboard · Home (catalog) · Goods In · Goods Out
│     └── Movement History · Stock Opname · Analytics · Inventory Intelligence
│
└── Sarpras Intelligence                            [single pilot identity only — admin AND username=evan]
      ├── Home/Dashboard · NOR · Documents (Archive) · Knowledge Center
      └── Intelligence (Learning) · Settings · Review Workspace (from Settings)
```

**Mobile navigation today** (verified, `index.html` + `js/config/bottom-nav-registry.js`): a hybrid of hamburger→drawer (full menu), a primary-action FAB (replaces the desktop sidebar's top CTA), a role-keyed bottom tab bar (4 registries: driver / engineering / request / executive — different tabs per role), and a "Lainnya" overflow bottom sheet for the executive role. This is an already-hardened pattern (single relocated nav renderer — the desktop rail physically moves into the mobile drawer, not a second nav tree) — **preserve the mechanism**, redesign only its visuals.

---

## 2. Access Matrix

| Module | admin | bidang | driver | viewer | eng_coord | eng_member | pilot |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Home | ✅ | ✅ | ✅ | — | ✅(placeholder) | ✅(placeholder) | ✅ |
| Driver Operations | ✅ full | ✅ own+create | ✅ own | ✅ view | — | — | — |
| Petty Cash | ✅ | — | — | — | — | — | — |
| Overtime | ✅ | — | — | — | — | — | — |
| Analytics | ✅ | — | — | — | — | — | — |
| Konfigurasi | ✅ | — | — | — | — | — | — |
| Role Management | ✅ | — | — | — | — | — | — |
| Engineering | ✅ full | — | — | — | ✅ coordinate | ✅ execute | — |
| Gudang | ✅ | — | — | — | — | — | — |
| Sarpras Intelligence | — | — | — | — | — | — | ✅ |

**Reading this table for redesign purposes**: 6 of 10 top-level modules are strictly admin-only. A redesign that assumes broad multi-role usage of Petty Cash/Overtime/Analytics/Konfigurasi/Role Management/Gudang would be designing for personas that don't exist in this system today — those six modules should be optimized for a single power-user (the admin), not for role-switching or permission-tiered views within themselves.

---

## 3. Proposed IA — reasoning per change

The redesign is explicitly **not required to restructure the top-level module list** — the current grouping is coherent (Home as the universal landing, one module per business domain, Engineering/Gudang graduated from placeholders using a consistent "embedded native module" pattern). The prior UX-unification effort's own **Design Authority mandate** ("navigate 5 modules without feeling you switched apps," quoted 3× across `docs/`) is a standing constraint any new IA proposal should honor, not relitigate.

Recommended IA changes, each with reasoning:

| Change | Current → Proposed | Reasoning | Risk |
|---|---|---|---|
| **Promote List view to a first-class, always-reachable toggle on mobile** | Toggle hidden ≤767px for Admin/Bidang → visible at all breakpoints, or auto-selected as the default mobile view with Timeline as an explicit opt-in | Closes the P0 gap in `FEATURE_UX_AUDIT.md` §4.1 — Admin/Bidang are currently stuck with a dense horizontal-scroll grid on phones | Low — the List view and its data path already exist; this is exposure, not new build |
| **Consolidate the 4 vehicle-color legends** (static board legend, manual form `<select>`, and any per-module vehicle chip) onto the live `/vehicles` collection | Hardcoded 4-item lists → generated from `getActiveVehicles()` | Fixes a confirmed data-accuracy gap (new vehicles silently missing from the legend and the create form) | Low-medium — read path only, no schema change |
| **Introduce a lightweight driver/vehicle/status filter alongside the existing search box** on the Assignment Board | Single global adaptive search only → search + filter chips | The board today has zero dedicated filter controls; a redesign explicitly listed "filtering" as an area to improve — this is additive, doesn't touch `getFilteredAssignments()`'s conflict-check exemption (see Guardrails doc) | Low |
| **Do not introduce a "Warehouse Staff" persona or workflow** | — | No such role exists in `role-registry.js`; Gudang admin-only is a documented deliberate decision, not an oversight | N/A — this is a "don't" |
| **Keep Sarpras Intelligence out of the general redesign scope**, or treat it as an explicitly separate, much smaller design pass | — | It's gated to one pilot identity, architecture-complete but content-empty, and it is itself the subject of the repo's own root `CLAUDE.md` master context (a distinct, deliberate product with its own philosophy — "not a chatbot, not a document generator, an Organizational Learning Platform"). Redesigning its UI is legitimate but should not consume the same design language decisions being made for the operational modules without a separate check-in, since its content model (Knowledge/Datasets/Conversations/NOR pilot) is fundamentally different from the CRUD-heavy operational modules | Medium if conflated — recommend scoping it out of Phase 1 of the visual redesign, revisit after |
| **Merge the two "Audit" screens (Driver, Kendaraan) into one shared Audit/Activity view with a domain filter**, matching the pattern the Notifications "Log Aktivitas" already uses | Two near-identical filtered views of the same `logs` collection → one view, filterable | Same underlying data source (`logs`), same UI (filtered activity list) — currently duplicated per-domain rather than parameterized | Low |
| **No change to role-gating logic** | — | This is a visual/IA redesign; permission decisions (`canAccessModule`, `MODULE_PERMISSIONS`) are protected business logic — see Guardrails doc | — |

---

## 4. What must NOT move

- The Assignment Board's core purpose (viewing driver assignments, vehicle allocation, schedule conflicts, date navigation, operational workload) stays a first-class, always-reachable surface — not folded into a generic calendar.
- Home stays the universal default landing for every role.
- The admin-only module set (Petty Cash, Overtime, Analytics, Konfigurasi, Role Management, Gudang) stays admin-only in the redesign's navigation — do not imply broader access through IA changes.
- Sarpras Intelligence's pilot gate is a security/product decision, not a navigation choice — a redesign must not make it appear more broadly available than it is.
