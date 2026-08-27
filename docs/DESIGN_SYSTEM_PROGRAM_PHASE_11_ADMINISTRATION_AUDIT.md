# Design System Program — Phase 11: Administration Audit

**Status:** AUDIT COMPLETE. No code changed. This document is Deliverable A
(§26 of the phase brief) — architecture inventory, per-surface findings,
security review, risk classification, and a proposed implementation scope.
Implementation has not started. Two decision points require explicit
user sign-off before any code is written (§9).

Method: five parallel read-only research passes, one per surface (Users,
Roles, Permissions, Notifications, Settings), each required to cite
`file:line` for every claim and mark anything genuinely ambiguous as
`UNKNOWN — REQUIRES VERIFICATION` rather than guess. Cross-checked against
`database.rules.json`, the relevant Cloud Functions, and existing test
scripts. Nothing below was inferred from screenshots or naming alone.

---

## 1. Executive Summary

Administration in this app is **not a dedicated module** — it's five
loosely-related surfaces reached through the "Control" domain
(`js/shell/domain-shell.js:154-166`: Users, Roles, Settings) plus a
standalone Notifications bell and a Permissions layer that has no nav
entry of its own (its two mechanisms are embedded inside Users and Roles).
All five are functionally solid — every one already validates input, saves
correctly, logs to Audit Center, and has *some* responsive treatment — but
none of them received the design-system consolidation the rest of the app
got in Phases 2-10.

**The single biggest finding, true across all five surfaces:** every
Administration dialog is still a hand-rolled `.modal-overlay`/`.modal-box`.
None use the canonical drawer (`js/components/drawer.js`) that Vehicle,
Driver, Gudang, Engineering, and Petty Cash already migrated to. This is
the same class of gap Phase 10 closed elsewhere, and Phase 10's own
pattern (audit → migrate one module at a time → verify → hostile review)
applies directly here.

**Security posture: no exploitable authorization gap was found anywhere.**
The RTDB rules and the runtime permission-resolution engine
(`permission-service.js`) are unusually mature, heavily commented, and
carry their own defense-in-depth floors that were independently verified
to actually hold (not just asserted in comments). Two P2-level asymmetries
exist (§9) — both currently inert, both flagged below as explicit decision
points rather than silently fixed, per this phase's own instruction to
never weaken *or* tighten an authorization rule without a deliberate
review.

**Real, concrete defects found** (full list in §8): a user-mutating action
with zero audit trail and zero confirmation (Users), a safety guard that
can be silently defeated by session navigation order (Roles), two entire
roles with no mobile path to notifications at all (Notifications), and a
permission whose own catalog description promises write access it cannot
actually grant (Settings, and separately Users).

**Scale correction on "Administration is under-built":** it isn't. Every
surface already has real validation, real audit logging, real responsive
CSS with genuine breakpoints (not table overflow), and — for Permissions
specifically — test coverage that exceeds most CRUD screens in this
codebase. The work here is consolidation, hardening, and closing specific
gaps, not a from-scratch build.

---

## 2. Architecture Inventory

```
Administration (no single entry point)
├── Users        → Control domain, screen 'users'   → js/app.js#navManajemenUser → renderV2AdminUsers()
├── Roles        → Control domain, screen 'roles'    → js/app.js#navRoleManagement → mountRoleManagement()
├── Permissions  → embedded in Users (Individual) + Roles (Role Additional); NO standalone screen
├── Notifications→ header bell (desktop) / bottom-nav (mobile, partial) → initNotificationUI()
└── Settings     → Control domain, screen 'settings' → js/app.js#navKonfigurasiGlobal → renderV2AdminConfig()
```

| Surface | Live render function | Data/store layer | RTDB path(s) | Client permission gate | Canonical drawer? |
|---|---|---|---|---|---|
| Users | `renderV2AdminUsers()` — `js/app.js:6176-6331` (V1 `js/admin.js` list is dead code, rollback-flag only) | `js/users.js` | `/users`, `/userPermissionOverrides` (individual panel) | `konfigurasi.view` (coarse, module-level) | **No** — hand-rolled `.modal-overlay` |
| Roles | `js/role-management/role-management-center.js` | `js/role-management/custom-roles-store.js`, `role-catalog.js`, `runtime-role-provider.js` | `/customRoles`, `/rolePermissionOverrides` | `system.admin` (structurally admin-only, cannot be delegated via any override) | **No** — hand-rolled `.modal-overlay` (Clone/Review) |
| Permissions | Two embedded panels: `js/admin.js` (Individual, inside Edit User) + `role-management-center.js` (Role Additional, inside Role detail) | `js/permission-management/*` (6 files) | `/userPermissionOverrides`, `/rolePermissionOverrides`, `/customRoles/{id}/permissions` | Same as host screen (Users/Roles) — no independent gate | **No** — inline panels, no drawer/modal at all |
| Notifications | `js/notifications.js` (`initNotificationUI`, `openNotificationsModal`) | `js/notification-service.js` (legacy Request-lifecycle only) + server pipeline | `/notifications/{uid}`, `/notification_state/{uid}`, `/notification_deliveries`, `/push_subscriptions` | Visible to every authenticated user (not admin-gated — it's a personal inbox) | **No** — hand-rolled `.modal-overlay`, uses the shared swipe-dismiss helper but not the drawer |
| Settings | `renderV2AdminConfig()` — `js/app.js:8183-8671` | `js/settings-store.js` | `/settings/{operations,notifications,telegram,system,dispatch,general,ui}` | `konfigurasi.view` (same coarse gate as Users) | N/A — this screen is inline cards, not a drawer/modal to begin with |

**Runtime permission engine** (shared by all five): `js/permission-service.js`
— the single choke point every `can()`/`canAccessModule()` call resolves
through. Formula: `effective = base(role) ∪ roleAdditional(role) ∪
individual(user)`, pure union, never a DENY. Two ids
(`system.admin`, `system.users.manage`) are unconditionally stripped from
ever becoming effective via *any* override, re-applied at read time
regardless of what's actually stored in Firebase — this floor is real,
independently tested (`scripts/role-permission-runtime-check.mjs:162-174`),
and is the reason the one storage-layer asymmetry found (§9) is not
currently exploitable.

---

## 3. Users Audit

Full detail: agent working file (not committed) covered `js/admin.js`
(1810 lines — **mostly dead code today**, live only behind an
emergency-rollback flag) and the actual production surface,
`renderV2AdminUsers()` in `js/app.js`.

**What's there:** list/search/status-filter/sort, create/edit/view
(archived=read-only), deactivate/activate, archive/restore, permanent
delete (only offered when `refCount===0`), PIN reset (shared modal), and
an embedded Individual Permissions panel inside Edit User. PIN handling
correctly never shows/prefills a PIN — only "Reset PIN" exists, matching
[[secure-admin-pin-reset-ux]] from prior work. Mobile layout is genuine
card-based responsive (44px tap targets, real breakpoints at 800/560/400px),
not table overflow.

**Findings (full IDs U-1..U-8 in the working file):**

| ID | Finding | Risk |
|---|---|---|
| U-2 | Deactivate/Activate and Archive quick-actions fire with **zero confirmation** — a regression from the legacy code, which did confirm. `js/app.js:6277-6308`. | **P1** |
| U-3 | The Deactivate/Activate toggle calls neither `logAction()` nor a success toast — the one user-mutating action on this whole surface with **zero audit trail**, while every sibling action logs correctly. `js/app.js:6277-6294`. | **P1** |
| U-1 | `konfigurasi.view` gates the entire Users screen but is not admin-exclusive by construction — grantable via Custom Role or the very Individual-Permission panel this screen hosts. No data is actually at risk (RTDB root-read and the PIN Cloud Functions independently require literal admin/adminEquivalent), but a holder sees a fully-interactive console that silently fails end-to-end. Same root cause as Settings D1 — see §9. | P2 |
| U-5 | Hand-rolled modals throughout, not the canonical drawer, despite Vehicle/Driver detail already having migrated. | P2 |
| U-6 | Last-active-admin lockout guard is client-JS-only, no RTDB backstop — a TOCTOU race across two concurrent admin sessions. | P2 |
| U-7 | Zero test coverage for `deleteUser()`/`archiveUser()`/`restoreUser()` and the last-admin guard — the single most safety-critical rule on this surface. | P2 |
| U-4 | Loading / permission-denied / genuinely-empty states are visually identical (all show "Tidak ada pengguna ditemukan"). | P3 |
| U-8 | V1 (`admin.js`) and V2 (`app.js`) maintain two drifting user-list implementations; V1 is dead in production but still maintained. | P3 (informational) |

---

## 4. Roles Audit

**What's there:** System Roles (9, code-defined, immutable) + Custom Roles
(admin-creatable via clone-only, `/customRoles`) unified through
`role-catalog.js#getAllRoles()`. A third layer, Role Additional Permissions
(bulk per-System-Role overlay, `/rolePermissionOverrides`), applies to
System Roles only. Archive is the only removal mechanism (no hard delete),
matching the app's house convention. Role-definition edits (Custom Role
permissions, Role Additional grants) propagate **live** to open sessions —
no re-login needed. Role *assignment* (which role a user holds) requires
re-login, because the `role` custom claim is minted only at `verifyPin`
time and the client never uses `onIdTokenChanged` to catch a silent
background refresh.

**Findings:**

| ID | Finding | Risk |
|---|---|---|
| D-1 | **Real, currently-live defect.** The archive-safety guard (blocks archiving a Custom Role that real users still hold) depends on a usage-provider that's only registered the first time an admin visits the *Users* screen this session (`js/app.js:2410-2425`). Users and Roles are sibling tabs, not a forced sequence — an admin who goes straight to Control → Roles can delete a Custom Role that real users hold, with the guard silently reporting `assignedUsers: 0` and no warning. Fails closed (affected users drop to `EMPTY_SET` permissions, no privilege escalation), reversible by un-archiving, but silent. `js/role-management/role-usage-provider.js:22-30`, `js/app.js:2410-2425`. | **P1** |
| D-2 | Topbar/rail-footer/domain-shell role badges use the Custom-Role-blind `roleLabel()` instead of the correct `resolveRoleInfo()` — a Custom-Role user sees their own raw internal slug id instead of their role's display name. 4 call sites, one-line fix each, pattern already proven at `js/app.js:5699-5707`. | P2 |
| D-3 | Custom Roles collection load failure never surfaces a UI error — looks identical to "no custom roles exist." | P2 |
| D-4 | Nav-visibility (`updatePermissionUI()`) doesn't re-run when a live Custom Role/Role Additional change affects the current session — the underlying route guard stays correct/live, but a now-forbidden nav button can stay visibly clickable until an unrelated re-render, then silently no-op. | P2 |
| D-5 | Clone/Review modals are hand-rolled, not the canonical drawer. | P2 |
| D-6/D-7 | No loading indicator for initial Custom Roles fetch; one Detail Panel placeholder's copy is stale (says Custom Role assignment "isn't supported yet" — it shipped in v1.30.8). | P3 |

The test suite gap that let D-1 ship is itself notable: the one test that
proves the archive guard works (`scripts/users-role-assignment-check.mjs`)
registers the real usage provider **directly**, bypassing the real
navigation sequence entirely — so it proves the wiring is correct *once
registered*, never that registration has actually happened by the time an
admin reaches Role Management.

---

## 5. Permissions Audit

**No unified matrix UI exists.** An admin auditing "who can do X" today
must open Role Management (one role at a time) and separately open each
user of interest in User Management (one user at a time) — there is no
cross-role, cross-user view. This is the central design opportunity for
Phase 11: a genuine permission × role matrix with drill-in to Individual
overrides would be **net-new**, not a consolidation of scattered UI.

**Permission matrix** (BASE grants only — Role Additional/Individual are
runtime-configurable additive layers on top, not fixed cells):

| Permission id | admin | bidang | driver | viewer | eng_coord | eng_member | Executive×3 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| system.admin | ✅ | | | | | | — |
| system.users.manage | ✅ | | | | | | — |
| driver.schedule.view | ✅ | ✅ | ✅ | ✅ | | | — |
| driver.schedule.view.own | | | ✅ | | | | — |
| driver.schedule.create/edit/delete/assign | ✅ | | | | | | — |
| driver.schedule.start/complete | ✅ | ✅ | ✅ | | | | — |
| driver.schedule.cancel | ✅ | ✅ | | | | | — |
| driver.request.create | | ✅ | | | | | — |
| driver.reimbursement.print | ✅ | | ✅ | | | | — |
| driver.overtime.override | ✅ | | | | | | — |
| warehouse.* (view/create/edit/delete/goodsin/goodsout) | ✅ | | | | | | — |
| vehicle.view/edit/maintenance | ✅ | | | | | | — |
| pettycash.view/manage | ✅ | | | | | | — |
| overtime.view/manage | ✅ | | | | | | — |
| analytics.view | ✅ | | | | | | — |
| konfigurasi.view | ✅ | | | | | | — |
| executive.dashboard.view | ✅ | | | | | | — |
| eng.view/dashboard/timeline | ✅ | | | | ✅ | ✅ | — |
| eng.history | | | | | ✅ | ✅ | — |
| eng.analytics/settings/create/edit/delete | ✅ | | | | | | — |
| eng.report.create | ✅ | | | | ✅ | | — |
| eng.join/start/finish/continueTomorrow | ✅ | | | | ✅ | ✅ | — |
| eng.continueTomorrow.ownOnly | | | | | | ✅ | — |
| eng.verify/postpone/reopen | ✅ | | | | ✅ | | — |
| sic.review.act | ✅ | ✅ | | | | | — |
| sic.approve.act | ✅ | | | | | | — |

`ketua_umum`/`waketum`/`sekjen` ("Executive" role family) are declared but
granted **zero** capabilities today — an intentional, reserved placeholder,
not a gap. `admin` is missing `eng.history` alone among all Engineering
capabilities (every other one follows "admin ⊇ Coordinator/Member") — a
likely oversight (P3), not a security issue since `system.admin` already
gives admin every other path to the same data.

**Headline security finding — no exploitable gap** (full trace in §9):
one real storage-layer asymmetry (`userPermissionOverrides` forbids only
`system.admin`, its two siblings forbid `system.admin` **and**
`system.users.manage`) exists, but it's closed by the runtime floor in
`permission-service.js`, independently tested, and `system.users.manage`
currently has zero enforcement consumers anywhere in the app. Flagged as a
P2 decision point in §9, not silently patched.

**Other findings:**

| Finding | Risk |
|---|---|
| No confirmation step before granting/revoking a permission (both mechanisms mutate immediately on click) — a real contrast with this same codebase's own Custom Role Edit→Review→Save flow. Every grant is at least correctly audit-logged after the fact. | P2 |
| Neither override panel uses the canonical drawer — both are inline panels embedded in existing forms. | P2 |
| Archiving a Custom Role does **not** strip Individual overrides already granted to its former holders (deliberate, documented) — worth surfacing explicitly in any new UI so an admin doesn't assume archiving a role revokes everything tied to it. | P3 |

Test coverage here is unusually strong — loading/empty/error/saving/stress/
a11y/responsive, all directly asserted, not just implemented
(`scripts/individual-permission-management-dom-check.mjs`,
`scripts/role-additional-permission-dom-check.mjs`). One documented gap:
the error state for a denied override-read isn't reachable through the
real API today, only via a test seam (`admin.js:586-594`, self-acknowledged
in the source).

---

## 6. Notifications Audit

**Two structurally different, deliberately disjoint trigger paths:**
server/Cloud-Function-driven (Engineering + Assignment lifecycle, the
canonical `/events` → notification engine → `/notifications/{uid}`
pipeline) and legacy client-triggered Telegram (Request approve/reject
only). This is not duplication — it's documented, intentional, narrower
scope for the legacy path, already fixed once before when
`assignment_created/completed/cancelled` were removed from the client
path to eliminate a genuine dual-fire.

**Duplication question settled:** `js/engineering/notifications/
notification-engine.js` is **dead code** — a pure builder with zero call
sites anywhere in the app, confirmed by grep and by the module's own
in-code comment ("There is no separate Engineering notification store").
Engineering notifications flow through the exact same shared pipeline as
everything else. The paired `engineering.notifications` RTDB node (4-role
read+write) is orphaned — a real, if currently inert, unexplained
client-writable surface with no application reader or writer (D5 below).

**Findings:**

| ID | Finding | Risk |
|---|---|---|
| D1 | **Driver and Engineering roles have no mobile UI path to notifications at all.** The desktop header bell is CSS-hidden <768px in favor of the bottom nav, but `js/config/bottom-nav-registry.js` only wires a `badge:'notif'` item for the `request` (bidang) and `executive` (admin) workspaces — `driver` and `engineering` have none. These are exactly the two roles that receive real server-pushed content. `js/config/bottom-nav-registry.js:40-68`. | **P1** |
| D2 | In-panel notification cards aren't clickable to navigate — deep-linking only works via an actual OS push tap, traced end-to-end; browsing the in-app bell gives a read-only feed with no "go to this record" action. | P2 |
| D3 | Notification RTDB listeners aren't explicitly torn down on logout — `onAuthLost` handles users/logs/export-history but not notifications; relies implicitly on the next login's uid-diff check. Inconsistent with the app's own established logout-hygiene convention. | P2 |
| D4 | No Escape-key handler on the notifications modal, unlike ~7 other modals in `js/app.js`. | P2 |
| D5 | Orphaned `engineering.notifications` RTDB node — dead code + unexplained client-writable surface (no live security impact, nothing reads or writes it, but worth closing). | P2 |
| D6/D7/D9 | Server-outbox cards render hardcoded normal-priority regardless of real severity; server `readAt` field is written once and never updated by anything; badge count (unsliced) can exceed the panel's 60-item render cap at very high volume. | P3 |
| D10 | Zero automated test coverage for the client-side bell/badge/read-state logic itself (only the Cloud Functions side is tested). | P3 |

Read/unread state is real-time (RTDB `onValue`, not polling) and mostly
solid, but **optimistic and unconfirmed** — a write failure leaves the UI
showing "read" with no rollback (low severity, not separately risk-rated
above the P2/P3 items already listed).

---

## 7. Settings Audit

**What's there:** five groups (Operasional, Notifikasi, Sistem, Telegram,
PWA-diagnostics-readonly), each independently Save/Reset with per-field
diff-based writes, real client validation (min-bounds only, no max-bounds),
and a genuine before/after audit-log entry per changed field — a notably
higher bar than "does it save" for an admin config screen. Two Cloud
Functions read the same `/settings` subtree live
(`runtimeSettings.js`, 30s TTL cache, disciplined single-source-of-truth
header comment; `backupTick.js`, an **undocumented second copy** of the
retention-days default — D4 below). Three fields
(`operations.workStartMins/workEndMins/odometerWarnJumpKm`) are purely
client-computed everywhere (drivers' own overtime/odometer checks) with no
server-side authority at all — advisory-only, by design, no drift risk
since nothing duplicates the literal.

**The `operations` sub-node's broader RTDB read rule is deliberate, not a
bug** — it's the only child with its own `.read: auth != null` rule, which
Firebase's partial-read cascade uses to hand every authenticated session
(including drivers) exactly those three values through the same
subscription, while Telegram/notifications/system/dispatch stay filtered
out for non-admins. Confirmed via the actual RTDB cascade semantics plus
the fact that none of the client consumers need anything else.

**Findings:**

| ID | Finding | Risk |
|---|---|---|
| D1 | `konfigurasi.view`'s own catalog description says *"View and manage platform configuration"* — but every `/settings` write requires literal `admin`/`adminEquivalent`, a separate permission entirely. A user granted `konfigurasi.view` alone (already possible via the shipped Individual Permission system) sees a fully-interactive Settings form where every Save silently fails. Same root permission as Users U-1 — see §9. | **P2** |
| D6 | Generic "Gagal menyimpan…" toast doesn't distinguish permission-denied from a transient/network failure — compounds D1. | P2 (paired with D1) |
| — | Zero test coverage for `renderV2AdminConfig()` (the ~490-line render/validate/save/reset function) or `settings-store.js`'s core `deepMerge`/`getSetting`/`updateSetting` logic — exactly the kind of money/threshold/credential-adjacent, low-change-frequency screen where a regression goes unnoticed a long time. | P2 |
| D2/D3 | 4 legacy `notifications.*` DEFAULTS keys and `general:{}`/`ui:{}` — confirmed zero consumers anywhere, pure dead scaffolding. | P3 |
| D4 | `functions/src/maintenance/backupTick.js`'s `DEFAULT_RETENTION_DAYS = 30` is a second, undocumented literal (currently matching, no cross-reference), unlike `runtimeSettings.js`'s disciplined single-source pattern. | P3 |
| D5 | No upper-bound validation on any numeric field. | P3 |

**Deferred, not new:** the already-documented, already-tracked
[[rtdb-rules-cascade-caveat]] — production RTDB root is still `auth !=
null` (not yet cut over to the coded-and-tested deny-by-default root),
meaning any authenticated user in production today can read the entire
`/settings` subtree including the plaintext Telegram bot token, regardless
of the careful per-node rules described above. This predates Phase 11,
is owned by the existing RTDB hardening program, and is restated here
only because it's the single most consequential fact about this specific
screen's most sensitive field.

---

## 8. Cross-Cutting Audits

**Responsive/Mobile:** Every surface already has genuine, purpose-built
responsive CSS — real breakpoints (560/720/800/960px, one outlier
380px-only tier on Settings), card-based mobile patterns (not table
overflow), and correctly-sized tap targets. No horizontal-overflow defect
found on any of the five surfaces. Consistent with the broader,
already-documented [[ux-ui-audit-claude-design-handoff]] finding of
app-wide "breakpoint chaos" (many slightly different values module to
module) — restated as context, not re-verified as a new Phase 11 finding.

**Accessibility:** The pattern is consistent with "not yet drawer-migrated"
across all five surfaces: hand-rolled modals with real, keyboard-focusable
buttons, but missing the canonical drawer's free focus-trap, initial-focus,
focus-restoration, and (in Notifications' case specifically) Escape-key
handling that ~7 other modals in the same file already have. No `role=
"dialog"`/`aria-modal` found on any Administration modal — likely an
app-wide hand-rolled-modal pattern rather than Administration-specific,
not independently re-verified outside these five surfaces this pass.

**Motion:** No Administration-specific motion was found to inspect —
these surfaces don't have bespoke animation, so there's nothing here that
conflicts with the Phase 8.x motion system. Migrating to the canonical
drawer would be the way these surfaces gain the app's standard open/close
motion, for free, same as Phase 10's three migrations did.

**Performance:** One real listener-lifecycle gap (Notifications D3, logout
teardown) and one architectural gap that's really a functional/safety
issue wearing a performance-adjacent shape (Roles D-1, the usage-provider
registration timing). No duplicate/leaking listeners found on Users,
Roles-proper, Permissions, or Settings.

**Security:** Covered in depth per-surface above; consolidated in §9.

---

## 9. Security Review — Decision Points

Two related, currently-inert items need an explicit user decision before
implementation touches them — not because either is exploitable today, but
because both require either an RTDB rule change or a permission-catalog
change, and this phase's own instructions are explicit: never weaken *or*
casually tighten an authorization rule without a deliberate, separately
reviewed decision.

**Decision 1 — `konfigurasi.view` conflates view and manage** (Users U-1,
Settings D1). The permission's own catalog description promises write
access ("View and manage") that it cannot actually grant (RTDB requires
literal `admin`/`adminEquivalent` for every write on both surfaces it
gates). Today this is latent — it only manifests if an admin has actually
granted `konfigurasi.view` individually to a non-admin, which this audit
did not confirm has happened in production. Two real options, not
mutually exclusive:
  - (a) **UI-only fix, no security change**: gate the Create/Edit/
    Deactivate/Archive/Delete/Save controls behind an explicit
    `isAdmin()`/`adminEquivalent` check client-side, and show a clear
    "you have view-only access" message instead of a generic save failure.
    Ships this phase, zero RTDB change.
  - (b) **Catalog/permission-model fix**: split `konfigurasi.view` into a
    genuine read-only permission and a separate edit-capable one that
    implies `adminEquivalent`-class trust. This is a permission-model
    change with RTDB implications — the kind of change this phase's brief
    says should be scoped and reviewed on its own, not bundled into a UX
    pass.

**Decision 2 — `system.users.manage` asymmetry** (Permissions §3).
`userPermissionOverrides`' RTDB `.validate` and its client-side rules file
forbid only `system.admin`; its two sibling mechanisms
(`rolePermissionOverrides`, `customRoles`) forbid both `system.admin` and
`system.users.manage`. This is closed today by an independent, tested
runtime floor (`NEVER_EFFECTIVE_VIA_OVERRIDE`) and by the fact that
`system.users.manage` has zero enforcement consumers anywhere in the app —
so nothing is exploitable right now. The option, purely defense-in-depth:
add `system.users.manage` to `userPermissionOverrides`'s RTDB `.validate`
and client rules file, closing the asymmetry at its origin instead of
relying solely on the downstream floor. This is an RTDB rules file change
and should be scoped/reviewed the same way any other rules change in this
codebase has been (per [[feedback-security-migration-review-style]] and
the extensive precedent already documented in `database.rules.json`
itself).

**My recommendation for both:** (1a) now, as part of this phase's UX pass
— it's a pure client-side hardening with no rules change. (1b) and
Decision 2 deferred to a scoped, separately-reviewed security pass, since
neither is exploitable today and both touch `database.rules.json`.

---

## 10. Consolidated Risk Table

| Risk | Count | Items |
|---|---|---|
| **P0** | 0 | None found. |
| **P1** | 3 | Users U-2 (no confirm on deactivate/archive), Users U-3 (no audit log on deactivate/activate), Roles D-1 (archive-guard order-dependency), Notifications D1 (no mobile nav path for driver/engineering) |
| **P2** | ~16 | Konfigurasi.view conflation (×2 surfaces), 5× hand-rolled-modal-not-canonical-drawer, Roles D-2/D-3/D-4, Notifications D2/D3/D4/D5, Users U-1/U-6/U-7, Settings zero test coverage, Permissions no-confirmation + no-unified-matrix, `system.users.manage` asymmetry |
| **P3** | ~15 | Stale copy, dead DEFAULTS keys, priority-color gaps, duplicate CSS blocks, missing upper-bound validation, cosmetic inconsistencies — full list in each surface's section above |
| **Deferred** | 2 | Production RTDB root cascade (owned by the existing hardening program), `dependencies`/`consumers` unrealized extension point in Role Usage |

(D1/D2/D3-style ids above are scoped per-surface, e.g. "Notifications D1"
≠ "Settings D1" — see each surface's own table for the full id.)

---

## 11. Migration / Implementation Map

Proposed grouping for the IMPLEMENT step, ordered lowest-risk-and-highest-
value first (same principle Phase 10 used):

1. **Notifications D1 (P1)** — add `badge:'notif'` bottom-nav items for
   `driver`/`engineering` workspaces in `bottom-nav-registry.js`. Small,
   additive, no security surface.
2. **Users U-2 + U-3 (P1)** — add a confirm step and `logAction()`+toast to
   the V2 deactivate/activate/archive quick-actions. Small, additive.
3. **Roles D-1 (P1)** — register the real role-usage provider at session
   boot (`startAuthenticatedSession()`) instead of lazily on first Users
   visit, matching the pattern already used for the other three
   role-adjacent providers. Small, additive, closes a real safety gap.
4. **Canonical drawer migration** for Users (Create/Edit/Delete-confirm/
   Reset-PIN), Roles (Clone/Review), and — if the two inline Permission
   panels can be reasonably reshaped into drawer-hosted content without
   functional loss — Permissions. Follows the exact Phase 10 playbook.
   Notifications' modal is a candidate too, though its dropdown-panel
   shape may fit less cleanly — worth confirming during implementation,
   not assumed here (per this phase's own STOP condition: "If [Admin] needs
   a drawer and the canonical drawer can't represent it without functional
   loss, STOP and report before extending the primitive").
5. **Remaining P2 UX fixes**: Notifications D2 (click-to-navigate)/D3
   (logout listener teardown)/D4 (Escape key)/D5 (remove orphaned
   Engineering notification dead code + RTDB node), Roles D-2 (role-label
   call sites)/D-3 (error state)/D-4 (nav-visibility live refresh),
   Permissions confirmation step, Decision 1a from §9 (client-side
   isAdmin gate on Settings/Users write controls + specific error
   messaging).
6. **Permissions Matrix UI** — the one genuinely net-new screen this phase
   should probably ship: a cross-role, cross-permission view with drill-in
   to Individual overrides. This is the single biggest UX gap found in the
   whole audit (§5) and is explicitly in-scope per the phase brief's §7.
7. **Test-coverage debt** — Settings (`settings-store-check.mjs` +
   DOM check for `renderV2AdminConfig()`), Users
   (`deleteUser`/`archiveUser`/`restoreUser` + last-admin guard), Roles
   (a DOM check that exercises "visit Roles without visiting Users first").
8. **P3 cleanup** — dead DEFAULTS keys, stale copy, duplicate CSS blocks,
   priority-color fix, upper-bound validation, `backupTick.js` constant
   cross-reference.

**Explicitly NOT in this implementation pass** (per §9): Decision 1b
(permission-catalog split) and Decision 2 (`userPermissionOverrides` RTDB
tightening) — both pending explicit user direction.

---

## 12. Files Referenced (non-exhaustive index for implementation)

Users: `js/admin.js`, `js/users.js`, `js/app.js` (`renderV2AdminUsers`,
`buildUserCard`, `navManajemenUser`).
Roles: `js/role-management/*` (10 files), `js/config/role-registry.js`,
`js/config/role-permissions.js`.
Permissions: `js/permission-management/*` (6 files),
`js/permission-service.js`, `js/config/permission-registry.js`.
Notifications: `js/notifications.js`, `js/notification-service.js`,
`js/engineering/notifications/notification-engine.js` (dead, candidate for
removal), `js/config/bottom-nav-registry.js`, `js/push.js`,
`functions/src/notifications/*`, `functions/src/events/onEventWrite.js`.
Settings: `js/settings-store.js`, `js/app.js` (`renderV2AdminConfig`),
`functions/src/config/runtimeSettings.js`,
`functions/src/maintenance/backupTick.js`.
Shared: `js/shell/domain-shell.js`, `js/components/drawer.js`,
`database.rules.json`, `platform.css` (`.v2-admin-*`, ~1000 lines).

---

## 13. Verification Strategy for the Implementation Pass

Following this phase's own instruction to prefer the strongest available
method per surface: real-browser DOM checks (Puppeteer, the pattern
already used by `*-dom-check.mjs` across this codebase) for every UI
change, pure-Node checks for the new provider-registration timing and any
new validation logic, and a full `scripts/smoke-boot.mjs` pass after each
surface's migration — mirroring Phase 10's per-module
audit → implement → verify → hostile-review loop rather than batching
everything to the end.

---

## 14. What This Audit Did NOT Do

- No code was changed.
- No Firebase read/write was performed beyond the read-only `firebase
  database:get` probe attempted for live-rules verification (failed —
  RTDB has no safe read-only rules-diff command without a deploy; not
  pursued further).
- Live/deployed state of `visualShellV2`/`domainShellV1` feature flags and
  the actual production `/feature_flags` values were not independently
  confirmed — the analysis above uses the coded defaults
  (`js/app.js:1301,1309`, both `true`), consistent with this being a
  static/read-only pass.
- Real-device and authenticated-session testing were not available, same
  standing constraint disclosed throughout this program's prior phases.
