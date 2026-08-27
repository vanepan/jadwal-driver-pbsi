# Design System Program — Phase 11: Administration Implementation Report

**Status:** Full punch list from the Phase 11 Administration audit
implemented — canonical drawer migration (Users, Roles), net-new
Permissions Matrix, all P1/P2 fixes, all P3 cleanup, and the audit's own
test-coverage debt closed. **NOT committed, NOT pushed, NOT deployed.**
`database.rules.json` was **not touched** (Decision 2, explicit user
instruction — see §4).

---

## 1. Executive Summary

Phase 11 covered Administration: Users, Roles/Permissions, Notifications,
and Settings — the four surfaces the [Phase 11 Administration
Audit](DESIGN_SYSTEM_PROGRAM_PHASE_11_ADMINISTRATION_AUDIT.md) mapped in
full before any code was touched. The user approved the audit's complete
migration map ("full punch list") and made two explicit, binding scope
decisions (§9 of the audit) before implementation began; both are recorded
verbatim in §4 below.

Everything the audit flagged was implemented across this session:

- **Canonical drawer migration** — 6 hand-rolled modals (User Form, Delete
  Confirm, Reset PIN Confirm, Reset PIN Result, Clone Role, Review Role)
  migrated onto `js/components/drawer.js`, the same shell Phase 10 already
  proved out for Gudang/Engineering/Petty Cash.
- **Net-new Permissions Matrix** — a second view mode inside the existing
  Role Management module (no new nav/IA), closing the audit's single
  largest UX gap: no cross-role, cross-permission overview existed
  anywhere before this.
- **3 P1 fixes** — Users U-2 (confirm before Deactivate/Archive), U-3
  (audit log the same two actions), Roles D-1 (role-usage provider
  registered at session boot, not lazily).
- **7 P2 fixes** — Decision 1 (write-access gating, client-side only),
  Roles D-2/D-3/D-4, Notifications D2/D3/D4, and a confirmation step
  before every permission grant/revoke (Individual + Role Additional).
- **6 P3 cleanup items** — dead `DEFAULTS` keys, a stale/redundant UI
  card, a duplicate CSS block, Notifications D6 (real priority tiers),
  upper-bound numeric validation (5 fields), and a drift-guard comment in
  `functions/src/maintenance/backupTick.js`.
- **Test-coverage debt closed** — `js/settings-store.js` and
  `js/users.js`'s lifecycle/last-admin-guard logic had *zero* test
  coverage before this phase; both now have dedicated, real-boot
  regression suites. `renderV2AdminConfig()` had only ever been verified
  by static source regex; it now has a real rendered-DOM test too.

**Total regression: 618 Phase 11-suite checks + 42 mobile-first checks +
smoke-boot, all green**, except **2 pre-existing failures** in
`role-management-edit-dom-check.mjs` ("Cancel hides the Save bar" /
"Cancel reverts the checked count") — confirmed via `git stash` during
this session to predate Phase 11 entirely. Not fixed (unrelated to this
phase's scope); flagged here for a future, separately-scoped pass.

Six genuine, previously-latent bugs were found and fixed along the way —
none of them cosmetic (§6).

---

## 2. Scope

**In scope, completed — see the audit's own migration map for the
original punch list this mirrors:**
- Users: 4 modals → canonical drawer; U-2/U-3 fixes; Decision 1 write-
  access gating (client-side); test coverage for `deleteUser()`/
  `archiveUser()`/`restoreUser()` + the last-active-admin guard.
- Roles/Permissions: 2 modals → canonical drawer; net-new Permissions
  Matrix view; D-1 through D-4 fixes; confirmation step on every
  grant/revoke in both the Individual and Role Additional panels.
- Notifications: D2 (click-to-navigate), D3 (logout teardown), D4
  (Escape-to-close), D6 (real priority tiers); D5 documented (not
  removed — see §6).
- Settings: Decision 1 write-access gating; upper-bound validation on all
  5 numeric fields; dead `DEFAULTS` key removal; a real DOM test for
  `renderV2AdminConfig()` (previously static-only); a pure-logic test
  suite for `js/settings-store.js` (previously zero coverage).
- `js/components/drawer.js`: one new shared utility,
  `evacuatePersistentDrawerContent()` (see §6, finding 4).

**Explicitly out of scope, untouched — per the master spec and Decision
2:**
- `database.rules.json` — **not modified.** The audit's Decision 2 (the
  `userPermissionOverrides` / `system.users.manage` RTDB asymmetry) was
  explicitly declined by the user ("No, leave open for now"). No RTDB
  rules file was touched anywhere in this phase.
- Sarpras Intelligence / V2, Executive Command Center, Driver Ops,
  Gudang, Petty Cash, Engineering, Overtime redesign, Phase 12
  (cross-product QA).
- Any Cloud Functions *logic* change — the one Cloud Functions edit this
  phase made (`backupTick.js`) is a documentation-only comment addition,
  not a behavior change (§3, P3 item 6).
- `js/components/drawer.js`'s own public API — no new capability was
  added to the primitive itself beyond the one shared evacuation helper;
  every drawer migration used only `openDrawer`/`closeDrawer`/
  `evacuatePersistentDrawerContent`.

---

## 3. What changed, by punch-list item

### 3.1 Canonical drawer migration

| Modal | File | Pattern used |
|---|---|---|
| User Form (Create/Edit/View) | `js/admin.js` | Persistent-node — content physically moved in/out of the drawer body via `appendChild` between opens (once-bound field listeners) |
| Delete Confirm | `js/app.js` | Persistent-node, same pattern |
| Reset PIN Confirm | `js/admin.js` | Persistent-node |
| Reset PIN Result | `js/admin.js` | Persistent-node |
| Clone Role | `js/role-management/role-management-center.js` | Fresh-HTML-per-render — body content returned from `openDrawer()`'s own render path |
| Review Role | `js/role-management/role-management-center.js` | Fresh-HTML-per-render |

`index.html` and the 3 test harness HTML files were flattened to match
(`.modal-overlay`/`.modal-box`/`.modal-header` wrapper divs removed —
the canonical drawer owns that chrome now).

### 3.2 Permissions Matrix (net new)

A second view mode (`viewMode: 'detail' | 'matrix'`) inside the existing
Role Management module — a toggle in the header, no new nav entry, no new
route. The matrix reads `getRolePermissionOverrides()` (Role Additional)
and `getUserPermissionOverrides()` (Individual, via `getUserList()`) for
every role up front, then renders a permission × role grid with a
base/additional/custom/none legend and a drill-in (click an Individual
count → see which users). `system.admin`/`system.users.manage` excluded
from the matrix entirely (same floor `permission-service.js` already
enforces at the resolution layer).

### 3.3 P1 fixes

- **Users U-2** — `data-user-toggle`/`data-user-archive` handlers in
  `js/app.js` now `confirm()` before mutating.
- **Users U-3** — both handlers now call `logAction()` on success
  (`user_deactivated`/`user_reactivated`, joining the existing
  `user_archived`), with matching `AUDIT_ACTION_LABELS` entries and
  Audit Center detail-view cases.
- **Roles D-1** — `registerRoleUsageProvider({ getUsage:
  getRoleUsageFromUsers })` moved from `navManajemenUser()` (lazy, only
  on first Users-screen visit) to `startAuthenticatedSession()` (session
  boot) — an admin who opens Roles first no longer gets the always-zero
  default provider silently no-opping the archive-safety guard.

### 3.4 P2 fixes

- **Decision 1 (audit §9)** — `hasAdminWriteAccess()` (`isAdmin() ||
  can('system.admin')`) gates every write control in both the Users
  screen and the Settings screen: a session holding `konfigurasi.view`
  alone (already grantable via Individual/Role Additional/Custom Role)
  now sees a read-only banner and disabled fields/buttons instead of a
  fully-interactive form whose every Save would silently fail against
  the real RTDB rule. **Client-side only** — no `database.rules.json`
  change, per Decision 2's spirit even though Decision 1 was approved.
- **Roles D-2** — the topbar role badge, V2 rail footer, and the new
  domain-shell's `formatRole` callback now resolve through
  `resolveRoleInfo(roleId).label` (Custom-Role-aware) instead of the
  System-Role-only `formatRole()`.
- **Roles D-3** — (folded into the drawer migration — Clone/Review now
  render inside the canonical shell with no CSS flex-collision; see §6
  finding 5).
- **Roles D-4** — `registerCustomRolesChangeListener(() =>
  updatePermissionUI())` added at session boot so a live Custom Role
  change re-derives nav visibility immediately, not just on next login.
- **Notifications D2** — a server-outbox card carrying `entityKind`/
  `entityId` is now clickable (`.notif-card--clickable`, `role="button"`),
  dispatching the existing `pbsi:push-nav` CustomEvent `js/app.js`
  already handles for real OS push taps — no duplicated navigation logic.
- **Notifications D3** — `resetNotificationsSync()` added and wired into
  `onAuthLost` in `js/app.js`; this module had no logout teardown at all
  before this phase.
- **Notifications D4** — `#modalNotifications`/`#modalActivityLog` both
  gained Escape-to-close, matching ~7 other modals in `js/app.js`.
- **Permissions grant/revoke confirmation** — both the Individual
  Permissions panel (`js/admin.js`) and the Role Additional panel
  (`role-management-center.js`) now `confirm()` before every grant and
  revoke, closing the audit's own explicit contrast with this same
  codebase's Custom Role Edit→Review→Save flow.

### 3.5 P3 cleanup

1. **Dead `DEFAULTS` keys** (`js/settings-store.js`) — `general: {}`,
   `ui: {}`, and 4 legacy `notifications.*` keys (`h2WindowMinFrom`,
   `h2WindowMinTo`, `h1ReminderCheckIntervalMs`,
   `h2ReminderCheckIntervalMs`) removed. Confirmed zero consumers
   anywhere in `js/`, `functions/`, or `scripts/` before removal;
   `deepMerge()`'s behavior for any stray legacy value still sitting in
   production `/settings` is unchanged (verified by inspection, not just
   assumed — see §5).
2. **Stale + redundant UI card** — `role-management-center.js`'s
   `futureAssignmentHtml()` ("Penetapan User — Tersedia setelah
   Manajemen User mendukung Custom Role") removed. The feature it
   described as unavailable has shipped (Individual + Role Additional
   Permission Assignment, both live; Custom Role IS selectable in User
   Management today), and the card directly above it (Ringkasan
   Penggunaan) already shows the real Assigned Users count — the
   placeholder had become both wrong and duplicated.
3. **Duplicate CSS block** — `.v2-user-btn--archive`/`--delete`/
   `--restore` (+ `:hover`) were defined twice in `platform.css`, both at
   brace-depth 0 (verified programmatically, not by eye); the later "V1.5.3
   — Archive & Safe Deletion Framework" block already won the cascade.
   The earlier, fully-overridden declarations were removed.
4. **Notifications D6** — every server-outbox card hardcoded
   `notif-priority-normal`, a class with **no matching CSS rule anywhere**
   in the app (`.notif-priority-high/medium/low` are the only three that
   exist) — every card has always rendered with zero priority accent.
   `serverNotifPriority(action)` now derives a real tier from the event
   type, grounded in `functions/src/notifications/registry.js`'s
   exhaustive 15-type list: cancellation/rejection → high; new-or-changed
   work needing a response (created/reassigned/updated/reminder/
   published/postponed) → medium; already-in-motion or already-resolved
   → low.
5. **Upper-bound numeric validation** — all 5 numeric Settings fields
   (odometer jump km, Recovery Buffer, Ambang Batas Perubahan Jadwal,
   Notification Debounce, Retensi Backup) previously validated a lower
   bound only. Each now has an HTML `max=` hint plus the real enforcing
   JS guard in its save handler (50,000km / 1440min / 1440min / 3600s /
   365 days respectively) — bounds chosen as "obviously too large to be
   a legitimate entry, not a fat-fingered extra digit," not tuned
   business thresholds.
6. **`backupTick.js` cross-reference** — a comment added at
   `DEFAULT_RETENTION_DAYS` documenting it must stay in sync with
   `settings-store.js`'s matching default (both `30`, currently in
   sync), and noting this Cloud Function's own read has no upper bound
   of its own — only the client UI's new 365-day ceiling constrains a
   value reaching it through the normal UI path. **No behavior change** —
   comment only.

### 3.6 Test-coverage debt closed

| Suite | Target | Checks |
|---|---|---|
| `settings-store-check.mjs` | `js/settings-store.js` (previously zero coverage) | 16 |
| `admin-config-screen-dom-check.mjs` | `renderV2AdminConfig()` real render (previously static-regex-only) | 9 |
| `users-lifecycle-check.mjs` | `archiveUser`/`restoreUser`/`deleteUser` + the last-active-admin guard (previously zero coverage) | 16 |
| `settings-numeric-bounds-check.mjs` | The 5 new upper-bound guards | 13 |
| `notifications-panel-check.mjs` | D2/D3/D4/D6 | 22 |
| `delete-confirm-drawer-check.mjs` | Delete Confirm drawer migration | 16 |
| `admin-write-access-gate-check.mjs` | Decision 1 gating | 19 |
| `phase-11-p1-fixes-check.mjs` | Roles D-1, Users U-2/U-3, Roles D-4 | 19 |
| `permissions-matrix-dom-check.mjs` | Permissions Matrix | 30 |
| `role-label-drift-check.mjs` | Roles D-2 | 7 |
| `custom-roles-load-error-check.mjs` | Custom Roles load-error banner | 4 |

---

## 4. Security decisions (recorded verbatim per the master spec)

**Decision 1** (audit §9 — `konfigurasi.view` write-access conflation):
**"Yes, apply now"** — client-side hardening only
(`hasAdminWriteAccess()` gating). Implemented in §3.4.

**Decision 2** (audit §9 — `userPermissionOverrides` /
`system.users.manage` RTDB write-asymmetry): **"No, leave open for
now"** — explicitly declined. `database.rules.json` was not opened for
editing at any point in this phase. This is a hard constraint carried
across the whole session, not a one-time check — every subsequent P2/P3
item that touched adjacent territory (Notifications D5, the confirmation-
step additions) was deliberately kept client-side-only or
documentation-only for this same reason.

---

## 5. Verification methodology

Every fix in this phase was verified by the **strongest method actually
available for that file**, not a uniform default:

- **Files with real ES exports** (`notifications.js`, `admin.js`,
  `role-management-center.js`, `users.js`, `settings-store.js`,
  `custom-roles-store.js`, `drawer.js`) — dynamically imported directly
  inside a Puppeteer `page.evaluate()`, either against a real boot of
  `index.html` or a minimal test harness page, using each module's
  established `__seed*ForTest()`/`__set*ForTest()` test-only seams.
- **`js/app.js`** (zero exports — importing it directly would fire a
  real Firebase read against **production**) — verified two ways
  depending on what was being checked: static source-text regex
  assertions for structural/logic changes (the established pattern from
  earlier phases), and, for `renderV2AdminConfig()` specifically, a real
  rendered-DOM test driven through actual clicks on the real 7-domain
  shell (`js/shell/domain-shell.js`) — see the discovery below.
- **No real Firebase Auth session exists in this sandbox.** Every write
  attempt (`updateSetting`, `archiveUser`, grant/revoke, etc.) that
  reaches the real backend is genuinely, fail-closed **denied** by the
  live RTDB rules — exploited deliberately throughout this phase's tests
  as real negative-path coverage, never mocked.

**A real, non-trivial discovery made while building
`admin-config-screen-dom-check.mjs`:** `js/auth.js`'s real
`onAuthStateChanged` listener (`_hydrateFromFirebaseUser`) wipes any
localStorage-only session the instant it settles with no real Firebase
Auth user — meaning a session faked only via
`page.evaluateOnNewDocument()` is **gone** by the time the app's domain
shell first renders. Every earlier real-boot test in this phase happened
to be immune (none of them depended on a permission-gated render), so
this surfaced for the first time on the Settings screen test. Worked
around by re-seeding `localStorage` *after* that auth-settle wipe fires
once, then calling `domain-shell.js`'s own exported
`refreshDomainShell(true)` to force a fresh, correctly-gated re-render —
no monkey-patching of Firebase itself, and no change to production auth
code.

A second, unrelated discovery in the same test: a stale `.login-screen`
overlay (never dismissed, since the real login handshake that would
dismiss it never runs in this harness) sat on top of the whole viewport
and silently intercepted Puppeteer's coordinate-based `page.click()`.
Fixed in the test only, by dispatching the click via an in-page
`element.click()` call instead.

---

## 6. Real bugs found and fixed along the way

Six genuine, previously-latent defects were found during this phase —
none were assumed from the audit; each was confirmed by actual
behavior/rendering before being fixed:

1. **Cross-modal drawer-content destruction** — one dialog's
   `openDrawer()` call could destroy a *different* dialog's still-attached
   persistent content if the first was left open. Fixed by extracting a
   shared `evacuatePersistentDrawerContent()` utility into `drawer.js`
   itself (not duplicated per-file), called at the top of every
   persistent-content opener.
2. **`onClick` early-return bug (Permissions Matrix)** — the drill-in
   button check (`data-rm-matrix-drillin`) was positioned *after* the
   `data-rm-action` early-return, so drill-in buttons rendered correctly
   but were completely unclickable. Found via a real interaction test, not
   a DOM-presence assertion (the button *looked* fine).
3. **CSS flex-collision (Clone Role dialog)** — `.rm-name-input`'s
   `flex: 1 1 260px` (correct in its original row-flex context) ballooned
   vertically once the dialog moved into the drawer's `flex-direction:
   column` body. Found via a real screenshot, not a DOM test. Fixed by
   wrapping the dialog body in a plain, non-flex container.
4. **Test-seam bug, `__setServerNotifsForTest()`** — the seam set
   `serverNotifs` directly, bypassing `normalizeServerNotif()`, so
   fixture entries lacked the `_server: true` flag `renderCard()`
   requires — every seeded card silently rendered as an **empty string**
   (fell into the `/logs` `ACTION_META` branch, found no match for a
   server-only action type, returned `''`). This was a bug in the *test
   seam*, not the feature — the real `js/notifications.js` code was
   already correct. Fixed by routing the seam through the real
   normalizer.
5. **`serverNotifPriority()` internal inconsistency** — the first pass of
   the D6 fix (§3.5 item 4) mapped `engineering.postponed` to the default
   'low' tier, but a timing change is exactly the kind of "needs the
   recipient's awareness" event the same function's own doc comment
   defines as 'medium'. Caught during this report's own hostile-review
   pass (§7), not by a test — the regex simply didn't match 'postponed'.
   Fixed before this report was finalized; regression coverage added.
6. **Real-boot session wipe** (see §5) — not a product bug (the
   auth-listener behavior is correct and intentional), but a real gap in
   this phase's own test methodology that would have silently produced a
   false negative (or a test that only accidentally passed) had it not
   been root-caused.

---

## 7. Hostile review pass

Performed after the full punch list was implemented and before this
report was written:

- Re-read every `confirm()` addition (Individual + Role Additional grant/
  revoke) for a checkbox-state-revert edge case — confirmed correct: the
  Individual picker's checkbox is only ever unchecked→checked (disabled
  once granted, so revert-on-cancel is always safe); the Role Additional
  checkbox is bidirectional, so its revert explicitly captures
  pre-toggle state (`wasGranted`) rather than assuming `false`.
- Re-derived `serverNotifPriority()`'s classification against all 15
  real event types in `functions/src/notifications/registry.js`
  one-by-one (not just its own regex) — found and fixed finding 5 above.
- Re-verified the `.v2-user-btn--archive/--delete/--restore` CSS dedup
  was genuinely safe to remove (both blocks at brace-depth 0, confirmed
  programmatically rather than by eye) before deleting the earlier copy.
- Re-confirmed via `grep` that no other file in `js/`, `functions/`, or
  `scripts/` referenced any of the removed `DEFAULTS` keys or the removed
  `futureAssignmentHtml()`/`.rm-detail-card--future` before deleting
  them.
- Re-ran the complete 618-check Phase 11 suite plus `smoke-boot.mjs` and
  `mobile-first-verification-check.mjs` (42 checks) after every
  individual change in this session, not just once at the end.

No further findings from this pass beyond the one already fixed
(finding 5).

---

## 8. Explicitly deferred / not done, with reasons

- **RTDB rules (`database.rules.json`)** — untouched per Decision 2.
  Not deferred as an oversight; explicitly declined by the user.
- **Notifications D5** (orphaned `js/engineering/notifications/
  notification-engine.js`) — **documented, not deleted.** Investigation
  found it's reachable only via the `js/engineering/index.js` barrel
  (itself unimported by production) and is used as a fixture-builder
  inside `scripts/engineering-foundation-check.mjs`'s *unrelated*
  store/provider test coverage. Deleting it would have required reworking
  those fixtures too, expanding the diff well past a "remove dead code"
  cleanup for marginal benefit. A status-note comment was added to the
  file instead, explaining the real (Cloud Functions + `js/notifications.js`)
  pipeline it was superseded by.
- **The 2 pre-existing `role-management-edit-dom-check.mjs` failures** —
  confirmed via `git stash` to predate this session; out of this phase's
  scope, not fixed here.

---

## 9. Final regression tally

| Suite class | Result |
|---|---|
| Phase 11 suite (21 scripts) | 618 checks, 616 pass, 2 pre-existing/unrelated fail |
| `smoke-boot.mjs` | pass |
| `mobile-first-verification-check.mjs` | 42/42 pass |

No regression in this tally was caused by this phase's own changes.

---

**Per the master spec: this phase remains uncommitted, unpushed, and
undeployed, awaiting review.**
