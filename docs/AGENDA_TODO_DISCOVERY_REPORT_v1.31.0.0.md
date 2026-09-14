# V1.31 DISCOVERY REPORT
## Agenda & To-Do — Shared Sarpras Calendar + Kabid Calendar + Task Management + PDF Reporting

Phase A — Discovery only. No application code was changed to produce this report. Current version: `1.30.14.6` (target `1.31.0.0`). All findings below were verified against the live working tree (not against memory of past sessions), 2026-09-11.

---

## 1. Today Architecture

Entry chain, all confirmed current:

- `js/app.js:2103-2109` `navHome()` — resolves workspace, sets breadcrumb, `setWorkspace('home')`.
- `js/app.js:1966-2056` `buildHomeContext()` — builds the immutable `ctx` handed to the workspace/widget layer (`user, role, assignments, requests, drivers, vehicles, models, recommendations, vehicleFlags, engineeringEvents, actions{...}`). Admin-only intelligence is gated by `can('executive.dashboard.view')`.
- `js/app.js:2135-2142` `renderHomeWorkspace()` — gets `#v2HomeWorkspace`, builds ctx, calls `renderHome(host, ctx, {skeleton:false})`.
- `js/app.js:2157-2168` `refreshHomeWorkspace()` — rAF-coalesced live refresh.
- `js/app.js:5086-5093` `initV2HomeWorkspace()` — injects `<div id="v2HomeWorkspace" class="v2-workspace exec-ui v2-analytics-claude">` as a plain child of `.main-content`. **This is the only DOM anchor for Today's content.**

Workspace layer (`js/workspace/`): `home-router.js` (`renderHome`/`refreshHome`) → `workspace-registry.js` (`resolveWorkspaceForRole(role)`: `admin→executive`, `bidang→request`, `driver→driver`, `engineering*→engineering`, unknown→`request`) → `widget-registry.js` (id→`{title,span,variant,group}` + lazy group loaders) → `workspace-loader.js` (resolves ordered `[{def,impl}]`, never throws) → `workspace-renderer.js` (`renderShell`/`mountWidgets`/`wireDelegation`).

**A separate top-level "domain shell" also exists and is live** (`js/shell/domain-shell.js`, `buildDomains()`), the current 7–9-domain rail replacing the old flat V2 rail. Its first domain is:
```js
{ id: 'today', label: 'Today', icon: 'today', module: 'home',
  screens: [{ id: 'today', label: 'Today', land: land.navHome }] }
```
Domain-shell owns chrome/routing only and calls the unmodified `navHome()` — it has zero awareness of workspace zones/widgets. `canAccessModule('home')` always returns `true` (`js/app.js:1761`) and every non-engineering role defaults to `'home'` — **Today/Home is the universal landing screen for admin, bidang, and driver alike**, which matters because the new Kabid persona will also need to land somewhere.

## 2. Executive Command Center Architecture

9 widgets, all defined in `js/widgets/executive/index.js` (`exec-hero`, `exec-attention`, `exec-recommendation`, `exec-snapshot`, `exec-activity`, `exec-drivers`, `exec-vehicle-flags`, `exec-outlook`, `exec-quick`).

**Order is zone-driven, not flat-array-driven** — `js/workspace/workspace-registry.js:47-54`:
```js
const EXECUTIVE_ZONES = [
  { id: 'masthead', widgets: ['exec-hero'] },
  { id: 'now', label: 'Sekarang', widgets: ['exec-attention'] },
  { id: 'decisions', label: 'Keputusan', widgets: ['exec-recommendation'] },
  { id: 'situation', label: 'Situasi Operasional', widgets: ['exec-snapshot','exec-activity','exec-drivers','exec-vehicle-flags'] },
  { id: 'outlook', label: 'Proyeksi', widgets: ['exec-outlook'] },
  { id: 'explore', widgets: ['exec-quick'] },
];
WORKSPACES.executive = { ..., zones: EXECUTIVE_ZONES, widgets: EXECUTIVE_ZONES.flatMap(z => z.widgets) };
```
`renderZonedGrid()` renders zones in array order inside one `<div class="wsp-dashboard-grid">`; each zone's widgets render in array order inside a `<div class="wsp-grid">`. `span`/`variant` only affect CSS width/chrome, never order.

**Two ways to insert a new section above Executive Command Center without touching its business logic:**
- **Option A** — prepend a zone to `EXECUTIVE_ZONES`. Reaches only the admin (`executive`) workspace.
- **Option B (recommended)** — inject a new sibling host (e.g. `#v2AgendaWorkspace`) immediately before `#v2HomeWorkspace` in `.main-content`, mounted by a small new module called from `renderHomeWorkspace()` just before `renderHome(...)`. This never touches `workspace-registry.js`/`widget-registry.js`/any per-role workspace definition, and appears above Today's content for **every** role — admin, bidang, driver, engineering, and any future Kabid role — with a single insertion point instead of four.

Shared presentation primitives any new UI should reuse: `js/widgets/_widget-base.js` (`esc, empty, metric, pill, listRow, actionBtn, chip, chipRow, ...`).

## 3. Current User/Role Model

Canonical fast-path role list — `functions/src/auth/verifyPin.js:46-49`:
```js
const VALID_ROLES = ['admin', 'bidang', 'driver', 'viewer', 'engineering_coordinator', 'engineering_member'];
```
`js/config/role-registry.js` mirrors this and additionally **declares but does not grant** an `executive` role group (`ketua_umum`, `waketum`, `sekjen`) — a precedent for "a named organizational role we know is coming but isn't live yet."

**No "Kabid" role exists anywhere in code** — a repo-wide case-insensitive grep (118 hits) found only document-content strings (NOR signatory titles, Sarpras Intelligence's organizational-knowledge corpus pattern-matching real document text) — zero role checks, zero permission ids, zero UI gates. A Kabid persona must be created from scratch (see §Permission Model).

**`bidang` is not "Sarpras staff"** — it's the generic trip-requester role for any department submitting a driver request (`role-permissions.js:53-56`: only `driver.schedule.view`, `driver.request.create`, `start/complete/cancel`). Sarpras staff (Evan/Leo/Grace) administer schedules, petty cash, warehouse, overtime, users — permissions only `admin`'s `BASE_GRANTS` holds. **Sarpras staff accounts run as `role: 'admin'`.** This is the load-bearing fact for the permission model: "shared Sarpras scope" in the product spec maps directly onto the existing `admin` role cohort — no new role needs to be invented for Evan/Leo/Grace/future staff.

## 4. Admin / Effective-Admin Authorization

`js/permission-service.js#can(permission)` resolves `effectivePermissionSetFor(user) = (System Role static grant | Custom Role dynamic grant from /customRoles/{roleId}) ∪ Role Additional Permissions ∪ Individual Permission Overrides`. Purely additive, fail-closed on unknown/archived role.

`adminEquivalent` is minted **only** server-side, `functions/src/auth/verifyPin.js` `resolveRoleClaims()`:
```js
if (!customRole || customRole.archived === true) return { role: 'viewer', extraClaims: {} };
const permissions = Array.isArray(customRole.permissions) ? customRole.permissions : [];
return { role: storedRole, extraClaims: permissions.includes('system.admin') ? { adminEquivalent: true } : {} };
```
i.e. `adminEquivalent === true` iff a user's role is a non-archived Custom Role whose `permissions` include `system.admin`.

**The Custom Role system is fully live in production code, not dormant**: `js/role-management/*` (catalog/store/runtime-role-provider), a real Role Management admin UI (`canAccessModule('roleManagement')` → `can('system.admin')`), `database.rules.json`'s `customRoles` node with `.validate` hardening, and `js/users.js#isValidRole()` already accepting any active Custom Role id. **Any admin can, today, create a Custom Role and assign it to a user via existing User Management UI — no code change required for the role-creation mechanism itself.** This is the key enabling fact for standing up "Kabid Sarpras" without a Cloud Functions deploy (see Permission Model).

`js/app.js#canAccessModule()` is fully permission-service-driven (migrated in v1.30.5, confirmed live):
```js
const MODULE_PERMISSIONS = { engineering:'eng.view', driverops:'driver.schedule.view', pettycash:'pettycash.view',
  overtime:'overtime.view', analytics:'analytics.view', konfigurasi:'konfigurasi.view', roleManagement:'system.admin', gudang:'warehouse.view' };
function canAccessModule(name) {
  if (name === 'home') return true;
  if (name === 'sarprasIntelligence') return isV2Enabled(getCurrentUser());
  return MODULE_PERMISSIONS[name] ? can(MODULE_PERMISSIONS[name]) : false;
}
```
A new module adds one `MODULE_PERMISSIONS` entry — no hardcoded role switch to fight.

**Permission-id convention** (`js/config/permission-registry.js`): `{module}.{feature}[.{qualifier}]`, e.g. `driver.schedule.view.own` for an "own records only" qualifier — directly reusable shape for a `agenda.*`/`todo.*` set, including a `.own`/scope qualifier.

## 5. Firebase Schema

`database.rules.json` root is currently deny-by-default in the file (`.read`/`.write: "false"`) — deployment status intentionally not asserted here.

Full top-level node inventory (abridged, ~45 nodes) includes: `events` (canonical append-only outbox), `notifications`/`notification_deliveries`/`notification_state`/`push_subscriptions`, `reminders` (server-only timer queue, `.indexOn:["fireAt"]`), `logs`, `analytics_exports`, `feature_flags`, the 7 V2 `intelligence_*` nodes, `settings`, 5 `pettyCash*` nodes, 13 `overtime*` nodes, `userProfiles`/`users`, `assignments`, `driver_requests`, `drivers`/`vehicles`, `customRoles`, `userPermissionOverrides`/`rolePermissionOverrides`, `v2_sarpras` (nested), `dispatchIntelligence`, `engineering` (nested), `gudang` (nested).

**No `agenda`, `calendar`, `todo`, or `task` node exists anywhere** — confirmed via grep — the namespace is fully clear for `agendaEvents`, `agendaTasks`, `agendaAudit`, etc.

Representative existing rule shapes to model new rules on:
- **Collection-read + per-record conditional write with cross-node lookup** (`assignments`, `database.rules.json:276-281`) — the pattern for "a participant may act on a record if a *different* node says they're linked to it" (`root.child('driver_requests')...requesterId === auth.uid`).
- **Self-scoped create/edit** (`driver_requests:283-288`) — `bidang` may create/edit only records where `requesterId === auth.uid` — the template for "a Kabid/staff member may edit only agenda items they created or are a participant of."
- **Simple admin-tier-only** (`overtimeRecords:222-225`) — `auth.token.role === 'admin' || auth.token.adminEquivalent === true` for both read and write, no per-record branching. **Note**: every admin-tier example found in the codebase includes this blanket bypass — this is directly relevant to the spec's explicit requirement that admin must NOT automatically see Kabid's calendar (see Risks §R3).

Atomic-counter precedent (if Agenda ever needs sequence numbers): `functions/src/reimbursement/counter.js:22-71`, `db.ref('reimbursement_counters/${key}').transaction((n) => (n||0)+1)`, server-only `onCall`.

Reusable `js/firebase.js` helpers: `subscribeNode(path, onData, {onDenied, onError})` (typed subscribe), `readNode(path)` (typed one-shot read), `updateFirebaseData(path, value)` (multi-path patch — what per-item state toggles like notification read/archive already use), `runNodeTransaction(path, updater)` (atomic RMW).

## 6. Notification System

A **complete, already-shipped, server-owned pipeline** exists — not just a client bell:

- Client bell `js/notifications.js` merges legacy `/logs`-derived cards with a live subscription to `notifications/{uid}` (server outbox). Per-item read/archive state lives in a **sibling** per-user node, `notification_state/{uid}/{notifId}`.
- Server engine `functions/src/notifications/`: `model.js#buildNotification()` writes `notifications/{recipientId}/{notificationId}` where `notificationId = eventId` — **structural idempotency**, re-processing the same event is a no-op. `registry.js` maps event type → `{channels, template}` (one entry per notifiable type). `recipients.js#resolveRecipients(event, users)`. `engine.js#processEvent(event)` is the one path from a canonical `/events` row to notifications. `dispatcher.js` fans out to in-app/Telegram/push, each gated by feature flags.

**A complete, proven H-1-hour/scheduled-reminder mechanism already exists and is directly reusable** — this is the strongest finding for the notification-engineering requirement:
```js
// functions/src/reminders/tick.js:71-73
const reminderTick = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Asia/Jakarta', region: REGION }, async () => { ... });
```
Design: `functions/src/reminders/schedule.js` maintains a `/reminders` timer-queue node (one row per `(entity, offset)`, deterministic key → reschedule overwrites in place, `.indexOn:["fireAt"]`); `onAssignmentReminderSync.js` is an `onValueWritten` trigger on `/assignments/{id}` that keeps the queue rows in sync with entity state (create/cancel/complete/delete → upsert/tombstone); `tick.js` sweeps due rows every 5 min, re-validates against live state, mints a **deterministic event id** (`reminder__${id}__${offset}`) via an idempotent `writeEventWithId()`, and rides the existing engine→dispatcher pipeline. This row-status design (`pending/fired/cancelled/skipped` + deterministic event id) gives the spec's "exactly-once, idempotent, no duplicate on reload/reconnect/multi-tab" requirement essentially for free if copied.

Also confirmed: `functions/src/maintenance/backupTick.js` (`onSchedule`, daily) — a second precedent for adding a new scheduled Cloud Function.

## 7. Attachment / Storage System

Firebase Storage is real, used for one production flow (Gudang item photos), governed by `storage.rules`:
```
match /gudang/item-photos/{itemId}/{fileName} {
  allow read, write: if request.auth != null && (request.auth.token.role == 'admin' || request.auth.token.role == 'developer');
}
```
Deny-by-default outside a matching block. **The app never requests a public/signed download URL** — `js/firebase.js#downloadFileFromStorage()` deliberately uses `getBytes()`, never `getDownloadURL()`; a file is displayed via `URL.createObjectURL(blob)` (tab-scoped, not a shareable link) after an authenticated, rules-gated download. This is exactly the "don't leak attachments via direct URL" mechanism the spec requires, already proven — reference implementation: `js/gudang/ui/gudang-item-image.js` (`uploadItemPhoto`, `loadItemPhotoUrl` with bounded retry + timeout).

**Risk**: per a prior session's direct GCS check (recorded in `storage.rules`' own header), the Storage **bucket may not be provisioned in production at all** yet — enabling it requires a manual Firebase Console step plus a separate `gcloud storage buckets update --cors-file=...` CORS step that is **not** part of `firebase deploy`. This affects only the Attachments sub-feature, not the core Agenda/To-do/Notification/PDF feature set.

Petty Cash receipts use a **different, simpler, non-Storage pattern** (base64 data URI stored directly in RTDB) — not a fit for calendar attachments (potentially larger/multiple files); model attachments on Gudang's real Storage flow instead.

## 8. PDF / Export System

Pipeline: `template-registry.js` (id → descriptor) → `js/docs/doc-engine.js` (`DocumentEngine.generate(templateId, data)`) → `pdf-exporter.js` (client-side `pdfMake.createPdf(...).getBlob()`) → download or `document-viewer.js` preview/print/share UI.

**View-model / template split**, directly reusable shape: `buildNorViewModel(nor)` (pure domain mapping, `nor-document-engine.js`) feeds a template (`js/docs/templates/nor.js`) with **zero domain knowledge**. Shared primitives in `js/docs/doc-theme.js`: `docHeader(meta)` (org block **defaults to an organizational identity, e.g. "Bidang Sarana dan Prasarana / PBSI" — never the logged-in user's name**, by construction), `docFooter`, `orgLogo`, `signatureBlock`/`signatureGrid`, `tableLayout`.

**Important precedent for the "SARPRAS not Evan/Leo/Grace" requirement**: no existing template currently substitutes a logged-in user's identity with an organizational label — that transform doesn't exist yet anywhere and would be new. The one place an individual name *does* leak into a PDF today is `analytics-report.js`'s "Generated By: {displayName}" line — explicitly **not** a pattern to copy. The correct place to apply the SARPRAS transform is inside the Agenda view-model builder (map any `organizerName`/`picNames` field to `'SARPRAS'` before it reaches the template), matching the doc engine's own convention of keeping templates dumb/data-only.

**Preview-before-export pattern — exact fit for the spec's "Preview" requirement**: `js/petty-cash/nor-paper.js` is a pure HTML string builder consuming the **identical** view-model object the pdfmake template consumes, guaranteeing the on-screen preview and the generated PDF can never drift (one function, two renderers). Recommended shape for Agenda: `buildAgendaViewModel(events, tasks, dateRange)` → `agenda-paper.js` (screen preview) + `js/docs/templates/agenda.js` (PDF), both fed by the one view-model function, with the SARPRAS-identity transform applied once inside it.

**Export Registry is generic enough for a direct new entry, no changes needed**: `js/exports/export-registry.js`'s `EXPORT_REPORTS` map is already id/template-agnostic (`{id, title, template, run(meta)}`); `js/exports/export-history.js`'s `/analytics_exports` metadata log (despite its name) is a generic envelope (`reportId, reportTitle, periodLabel, dateRangeKey, filters, status, ...`) already used by non-analytics reports.

**No reusable calendar-aware date-range-preset component exists.** The two closest UI patterns (Analytics' flat rolling-window `<select>`, Overtime's period-tabs + single anchor-date) are both **not** calendar-boundary-aware (no Monday-start-week/real-month-boundary math) and neither supports a `start+end` custom range. The 7-preset picker (Minggu ini/depan, 1 minggu, Bulan ini/depan, 1 bulan, Custom) is genuinely new code — but should follow the existing conventions of (a) resolving named keys through one label dictionary, and (b) a UI that only picks mode+anchor while a pure function resolves the actual boundary dates.

## 9. Date/Time System

**No date library** (`package.json` has none — moment/luxon/date-fns/dayjs all absent). Pure native `Date`/`Intl`, and **no real timezone conversion exists anywhere** — the app implicitly assumes the client's local clock is already WIB/Asia-Jakarta (confirmed via `js/utils.js:275`'s own comment: `// 0=Sun … 6=Sat (local/WIB on the client)`). The one literal `'Asia/Jakarta'` string in `js/` is a data-field default in Engineering settings, not a conversion. Cloud Functions' scheduled triggers, by contrast, **do** set `timeZone: 'Asia/Jakarta'` explicitly (`backupTick.js`, `reminderTick`) — the server-side convention to follow for the new reminder tick.

Canonical helpers, `js/utils.js`: `todayString()`, `parseLocalDate(dateStr)`, `offsetDate(dateStr, days)` ("timezone-safe" per its own comment), `formatDateLong`/`formatDateShort`/`formatDateTime` (`'id-ID'` locale), `expandDateRange`, and — most relevant for events — `assignmentSpan(a)` (single source of truth for start/end datetime, correctly deriving a crossed-midnight end date) and `scheduledTimeState(a, now)` (classifies `'upcoming'|'active'|'past'`).

**Note**: a second, independently-invented `todayISO()` idiom exists in Overtime/Petty Cash (`getTimezoneOffset()`-subtraction trick) — functionally equivalent but stylistically inconsistent with `utils.js`. **Recommend the new Agenda module import `js/utils.js`'s helpers rather than adding a third copy.**

Reusable date-picker UI: `js/pbsi-datepicker.js` — wraps a native `<input type="date">` with Flatpickr, Indonesian locale, `firstDayOfWeek: 1`, supports presets. This is the component to use for event/task date fields — no new picker needed.

## 10. Mobile / Responsive Patterns

Two coexisting mobile nav surfaces (pre-existing, previously flagged, not something to fix as part of this feature): a persistent 5-icon `#bottomNav` bar (workspace-keyed quick actions) and the domain-shell rail/tab-strip, which reparents into the hamburger drawer on mobile (`max-width:767px`, matching the bottom-nav breakpoint).

Today's own content has **no separate mobile renderer** — same `renderHome()`/zone pipeline at every viewport, purely CSS-responsive: `js/workspace/workspace-styles.js`'s `.wsp-dashboard-grid` collapses to a single column at `≤600px`, DOM order unchanged. **A new zone/section prepended to the array (§2 Option A/B) renders first on mobile automatically, zero extra responsive work**, as long as it uses the same `.wsp-zone`/`.wsp-grid` scaffolding.

Primary breakpoints in house use: **768px** (nav/layout split), **640px** (bottom-sheet/drawer threshold), **600px** (iOS 16px input-zoom guard + grid collapse). JS-only tokens also exist: `--bp-xs:380px; --bp-sm:600px; --bp-md:768px; --bp-lg:1024px; --bp-xl:1280px` (`platform.css:185-189`, for `matchMedia`, not usable inside `@media`).

## 11. Modal / Form Patterns

**Canonical drawer — `js/components/drawer.js`** — the house-documented "generalized, app-wide primitive... all consumers route through here, never a new drawer implementation of their own." On desktop it's a right-side sliding panel; at `@media (max-width:640px)` it becomes a true bottom sheet (`height:86dvh`, rounded top corners, a real drag-handle with swipe-to-dismiss, safe-area-aware footer padding). Built-in focus trap, ESC-to-close, unsaved-changes guard. `js/admin.js#openUserFormModal()` already uses it. **Recommended for Agenda's create/edit event/task form** — gives the mobile bottom-sheet requirement for free.

Petty Cash's own hand-rolled centered modal (`petty-cash-center.js#addModal()`) is explicitly documented in its own code comment as **legacy/pre-drawer**, not a pattern to imitate for new work.

**No multi-select participant/PIC-picker component exists anywhere** (checked chip/multi-select/participant/picker across all CSS and JS — zero hits for a compact type-to-filter-and-pick-multiple-people UI). The closest existing idiom is a full-page checkbox-grid with "Pilih Semua/Kosongkan" bulk actions, used identically in both Overtime (employee rekap) and Petty Cash (transaction multi-select) — a real component but a full-page-checklist shape, not a compact in-drawer picker. **Building the participant/PIC picker is genuinely new UI work**, though it can borrow the same checkbox-square + full-row-click + Select-All/Clear visual idiom already established.

Design tokens: brand `--accent:#A8292F` (red), `--ok:#2F7D62`/`--ok-bg` (muted green), `--warn:#946420`/`--warn-bg` (gold/brown), all with `[data-theme="dark"]` overrides. Module-scoped token pattern (`.ot-root`/`.pc-root` in `overtime.css`/`petty-cash.css`) is the template to copy for a new `.cal-root` scope — guarantees visual consistency for free. **Avoid `var(--white)`/`var(--dark*)` directly** — documented, deliberately-unfixed dark-mode trap (dual-use token, blind remap breaks something).

## 12. Existing Audit Patterns

`buildAudit`/`writeAudit`, confirmed byte-similar across `js/overtime/overtime-service.js:62-77` and `js/petty-cash/petty-cash-service.js:76-90`:
```js
function buildAudit(action, entityType, entityId, note) {
  return { id: genId('audit'), action, label: AUDIT_LABEL[action]||action, color: AUDIT_COLOR[action]||'#5b5953',
    note: note||'', user: actorLabel(), entityType, entityId: entityId||null, timestamp: Date.now() };
}
async function writeAudit(action, entityType, entityId, note) { await putAudit(buildAudit(...)); }
```
Each module owns its **own** flat audit node (`overtimeAudit`, `pettyCashAudit`) — never the shared `/logs` path. **Convention for Agenda: a new top-level `agendaAudit` node**, same shape, filtered per-entity the same way.

## 13. Existing Deployment / Version Patterns

`js/config.js:4` `APP_VERSION = '1.30.14.6'` (confirmed matches git). `VERSION_HISTORY` (line 68+, newest first) entries are `{version, date, summary, highlights[]}`.

`scripts/sync-version.mjs` stamps exactly: `service-worker.js` (`SW_VERSION`/`CACHE_NAME`), `version.json` (whole-file rewrite), and 6 `index.html` targets — `js/app.js?v=`, `style.css?v=`, `petty-cash.css?v=`, `engineering.css?v=`, `overtime.css?v=`, `gudang.css?v=`. **Confirmed still NOT covered**: `platform.css` (independently at `2.1.8`, hand-bumped), `sarpras-intelligence.css`/`nor-center.css`/`workspace-list-kit.css` (frozen at `1.23.0`). **If the new feature adds/materially changes a scoped CSS file (e.g. `agenda.css`), either add it to `sync-version.mjs`'s stamped list or remember to hand-bump its own `?v=` — this is a known, previously-bitten gap.**

Two independent production surfaces, confirmed: **Firebase Hosting** (`firebase deploy --only hosting`, deploys local tree; covers Hosting/Functions/RTDB-rules/Storage-rules as separate `--only` targets) and **Vercel** (auto-deploys on `git push` to `main` from git history only, static-site config, `.vercelignore` root-anchored patterns). `sync-version.mjs`'s output must be committed+pushed, or Vercel serves stale `version.json`/cache-busts even though the bundled `APP_VERSION` constant is already correct.

## 14. Relevant Tests

**301** `scripts/*-check.mjs` files exist — the dominant verification convention, no CI (`.github/` does not exist; everything is run manually via `node scripts/<name>.mjs`, only 4 emulator/corpus scripts are wired as `npm run` aliases). Two representative shapes, both confirmed by full read:
- **Pure Node**: imports the real production module directly, a tiny inline `check(name, cond, detail)` harness, lettered spec-like sections, ends `process.exit(fail===0?0:1)`.
- **Headless Puppeteer**: local static file server serving the real repo tree, `puppeteer.launch()`, navigates a hand-built harness that `<script type="module">`-imports the **real** production module with a mocked DI `cfg` object, drives via `page.evaluate()`, asserts DOM/CSS at desktop/dark/375px-mobile, captures zero-console-error.
- **`scripts/smoke-boot.mjs`** — the whole-app boot gate, also self-validates that `sync-version.mjs` was run (`version.json` vs. live `APP_VERSION` must match) — referenced at the end of nearly every past release.

Regression suites specifically relevant to this feature's "must not regress" list, all confirmed to exist as prior precedent: `workspace-foundation-check.mjs`, `smoke-boot.mjs`, executive/domain-shell/overtime render checks, `permission-service-check`, `canAccessModule-check`, `rtdb-*-check` family (sibling-rules, hardening-phases, hardening-functions). New Agenda test scripts should follow the same naming (`agenda-*-check.mjs`) and dual pure-Node/Puppeteer shape.

## 15. Potential Conflicts (naming / namespace)

- **Clear**: no code uses `agenda`, `calendar`(as a feature/RTDB path — the date-*picker* component is unrelated), `todo`, or `task` as an RTDB path or feature name. `'eng-calendar'` is only a dormant, unimplemented Engineering widget id (placeholder, "coming soon") — a naming collision to be aware of if Agenda ever needs a "Kalender" label near Engineering's UI, not a functional conflict.
- **Avoid the bare word "reminder" as a new top-level entity name** — `/reminders` is already a live, assignment-scoped (but structurally generic) timer queue, and `js/services/reminder-engine.js` is an unrelated, already-shipped **vehicle document/maintenance** reminder system feeding the Executive `exec-vehicle-flags` widget. Recommend reusing `/reminders`' row shape for Agenda (extending it to be entity-agnostic) rather than inventing a same-named-but-different sibling.
- **Avoid a bare "event" outbox name** — `/events` is the canonical, already-load-bearing cross-module event/audit outbox (`functions/src/events/schema.js`'s `EVENT_TYPES`, consumed by the notification engine). Agenda's calendar-event entities should be named distinctly (e.g. `agendaEvents`) and should **emit into** the existing `/events` outbox with new `EVENT_TYPES` (`agenda.created`, `task.overdue`, etc.) to plug into the existing notification pipeline — not build a parallel outbox.

---

# RECOMMENDED INTEGRATION POINTS

1. **Today insertion**: Option B from §2 — a new sibling host injected before `#v2HomeWorkspace`, mounted from `renderHomeWorkspace()`/`refreshHomeWorkspace()` in `js/app.js`. Renders once for every role, gated by a new `agenda.view` permission (see below) so it's simply absent for roles that shouldn't see it — zero touches to `workspace-registry.js`, `widget-registry.js`, or `js/widgets/executive/index.js`. Executive Command Center's business logic is untouched.
2. **RTDB namespace**: new top-level nodes `agendaEvents`, `agendaTasks`, `agendaAudit` (mirrors the Overtime/Petty Cash per-module-audit-node convention), sibling to `overtime*`/`pettyCash*`, never nested under `assignments`.
3. **Notifications**: emit through the existing `/events` outbox with new `EVENT_TYPES` entries and `notifications/registry.js` entries — reuse the entire engine→dispatcher→bell pipeline as-is.
4. **Reminders**: copy the `functions/src/reminders/{schedule,tick,onXWrite}.js` three-file shape verbatim for Agenda's H-1-hour/overdue-once requirement — either extend the existing 5-minute `reminderTick` to also sweep Agenda-sourced rows, or add one sibling `onSchedule` tick. Either way this is a new/changed Cloud Function and needs its own deploy step later (flagged under Risks).
5. **PDF**: new `js/docs/templates/agenda.js` + `buildAgendaViewModel()` + `agenda-paper.js` screen preview, following the `nor.js`/`nor-document-engine.js`/`nor-paper.js` triad exactly (one view-model, two renderers, identity transform applied once inside the view-model builder). Register one new entry in `js/exports/export-registry.js`; log through the existing `/analytics_exports` history mechanism with `reportId:'agenda-pdf'`.
6. **Attachments**: reuse `js/firebase.js`'s Storage helpers (`uploadFileToStorage*`/`downloadFileFromStorage`/`deleteFileFromStorage`) and the `getBytes()`-never-`getDownloadURL()` pattern from `js/gudang/ui/gudang-item-image.js`; add a new `match /agenda/attachments/{eventOrTaskId}/{fileName}` block to `storage.rules`.
7. **Forms**: use `js/components/drawer.js#openDrawer()` for create/edit — gives the mobile bottom-sheet for free. Use `js/pbsi-datepicker.js` for all date/time fields. Build a new (genuinely new) compact multi-select participant/PIC picker, borrowing the checkbox-square + full-row-click visual idiom from Overtime/Petty Cash's existing checklist grids.
8. **Styling**: new `agenda.css` with a `.cal-root` scope copied from `.ot-root`/`.pc-root`'s token set (guarantees visual consistency, sidesteps the `--white` dark-mode trap). Remember to add it to `sync-version.mjs`'s stamped list (or hand-bump its `?v=` on every change) — a previously-bitten gap for exactly this class of new CSS file.

---

# PROPOSED DATA MODEL (for Phase B validation, not final)

```
/agendaEvents/{eventId}
  { id, title, description, startAt, endAt, allDay, location, type,
    organizerUsername, pic: [username...], participants: [{username, role:'sarpras_staff'|'kabid'|'external', status:'invited'|'accepted'|'declined'|'tentative'}...],
    scope: 'sarpras_shared' | 'kabid',
    status: 'scheduled' | 'cancelled' | 'archived',
    recurrence: { type:'none'|'daily'|'weekly'|'monthly'|'custom', ...future-compatible, unused in V1 UI },
    reminderConfig: { hourBefore: true },
    attachments: [{storagePath, fileName, contentType, size}...],
    createdBy, createdAt, updatedBy, updatedAt }

/agendaTasks/{taskId}
  { id, title, description, dueAt, responsible: [username...], status: 'not_started'|'in_progress'|'done',
    priority: 'normal'|'penting'|'urgent', checklist: [{id, label, done}...],
    attachments: [...], reminderConfig: {...}, createdBy, createdAt, updatedBy, updatedAt, completedAt, completedBy }

/agendaAudit/{auditId}   — mirrors overtimeAudit/pettyCashAudit shape exactly

/reminders/{entity}__{offset}   — EXTEND the existing node (entity-agnostic already in shape); or a sibling `agendaReminders` if extension proves risky in Phase B
```

**The open design question for Phase B**: RTDB cannot efficiently query "does participants[] contain me" or "is scope X." Two options, to be decided in Phase B (not resolved here):
- **(a) Cloud-Function-maintained fan-out index** — `onValueWritten` trigger on `/agendaEvents/{id}` (mirroring the existing `onAssignmentReminderSync.js` and `onUserWrite.js` precedents) maintains derived, clearly-non-canonical index nodes: `agendaEventsByUser/{uid}/{eventId}: true` and `agendaEventsByScope/{scope}/{eventId}: true`. Server-authoritative, can't drift, but is a new Cloud Function (deploy needed).
- **(b) Client-side atomic multi-location write** — one `update()` call writes the canonical record and its index entries together, with `.validate` rules cross-checking consistency. No new Cloud Function, but more complex rules and a theoretical drift risk if the multi-location write is ever partially rejected.

The spec's own words ("Derived indexes harus aman terhadap stale state dan tidak menjadi sumber kebenaran ganda") point toward (a) being the more literally compliant choice; (b) has smaller deployment blast radius. **Recommendation: (a)**, consistent with two already-proven precedents in this exact codebase.

---

# PERMISSION MODEL (for Phase B validation, not final)

New permission ids, following the established `{module}.{feature}[.{qualifier}]` convention:

| id | meaning | granted to |
|---|---|---|
| `agenda.view` | see shared Sarpras agenda/tasks on Today | `admin` base grant |
| `agenda.manage` | create/edit/cancel Sarpras-scope events & tasks | `admin` base grant |
| `agenda.kabid.view` | see Kabid's own calendar scope | new Kabid persona |
| `agenda.kabid.manage` | create/edit Kabid's own events/tasks | new Kabid persona |

**Kabid persona — recommend standing it up as a Custom Role** (via the already-live Role Management UI, §4), **not** a new hardcoded System Role. This needs zero `verifyPin.js`/`VALID_ROLES` change and zero Cloud Functions deploy for the role mechanism itself — the dynamic Custom Role fallback already handles any role string not in the fast-path list. The alternative (a code-defined `kabid_sarpras` System Role, matching the already-reserved-but-ungranted `executive` role-group precedent in `role-registry.js`) is cleaner long-term but requires touching `verifyPin.js`, which is a Functions deploy — flagged as a Phase B decision, not resolved here.

**Deliberate deviation from house convention, to implement carefully**: the spec explicitly requires *"Admin tidak otomatis mendapatkan seluruh Kabid calendar hanya karena role admin."* Every single existing admin-tier RTDB rule found in this codebase (`overtimeRecords`, and the admin branch of `assignments`/`driver_requests`) includes an unconditional `auth.token.role === 'admin' || auth.token.adminEquivalent === true` read/write bypass. **The new Kabid-scoped rules must deliberately omit that bypass** for Kabid-scope-only agenda items — an admin should see a Kabid-scope event only if they are an actual invited participant. This is a real, non-trivial rule-authoring exercise (the codebase has no existing precedent for "admin excluded"), should get its own explicit review pass in Phase B/C (matches this project's established pattern of staging security-relevant rule changes behind their own review), and is directly covered by one of the spec's own required test cases ("Sarpras admin cannot read arbitrary Kabid calendar data").

Event/task-level access (participant scoping) is orthogonal to the above role permissions: `agenda.view`/`agenda.kabid.view` gate *module visibility*; per-record RTDB rules (participant membership OR scope match) gate *which records* are actually readable — same two-layer shape already used by `driver_requests`/`assignments`.

---

# RISKS

- **R1 — Storage bucket may not be provisioned in production.** Confirmed via a prior direct GCS check recorded in `storage.rules`'s own header. Blocks Attachments only; does not block Agenda/To-do/Notifications/PDF core. Needs a human decision (enable Storage in Firebase Console + apply CORS) before Attachments can ship — flag explicitly before that sub-feature's deploy, per the spec's own STOP-condition instructions.
- **R2 — This feature requires new RTDB Rules and (for scheduled reminders) new/changed Cloud Functions.** Both are expected, inherent to the feature, not a contradiction — but both are explicit STOP-before-deploy items per the spec's own rules. Development/testing can and should proceed against the RTDB emulator (an existing, working emulator harness is already in this repo: `npm run test:rtdb-emulator`) without needing any production deploy until Phase C's very end.
- **R3 — Admin-excluded-from-Kabid-scope rule has zero precedent in this codebase.** Every existing admin-tier rule is a blanket bypass; this feature needs the first-ever deliberate exception. Higher-than-usual risk of an authoring mistake (accidentally leaving the bypass in, or being too restrictive and breaking legitimate cross-scope access via invitation) — warrants its own emulator-based authorization test pass before anything is deployed, mirroring the rigor of the prior RTDB Authorization Validation Suite program.
- **R4 — RTDB fan-out/index design (data model §, option a vs b) is a genuine architecture fork**, not resolvable from the spec text alone. Needs an explicit Phase B decision before Phase C coding starts on the event/task write path, since it affects both the Cloud Functions surface and the client write code.
- **R5 — No existing calendar-boundary-aware date-range-resolver exists.** The 7 PDF export presets require genuinely new (if small) pure-function logic (Monday-start-week math, real month boundaries) — low complexity but should get its own unit test (pure-Node, no Firebase, per house convention) given date-boundary bugs are easy to get subtly wrong.
- **R6 — No participant/PIC multi-select component exists.** New UI surface with no local precedent to copy exactly; budget real design/QA time for it specifically, especially on mobile (390/430px) where a checkbox-grid-per-person could get long for a small event.
- **R7 — `platform.css`-style versioning gap.** If a new `agenda.css`/`.cal-root` stylesheet is added, it must be added to `sync-version.mjs`'s stamped list or hand-bumped every release — a previously-bitten, easy-to-forget gap in this exact codebase.

---

# MIGRATION NEEDS

**None required for existing data** — this is a wholly new namespace (`agendaEvents`/`agendaTasks`/`agendaAudit`, confirmed to not previously exist), so there is zero legacy-data backfill. Per the spec's own instruction, ship with an empty state; do not manufacture seed events/tasks.

**Deployment surfaces that will eventually need a human go-ahead** (flagged, not executed):
1. `database.rules.json` — new nodes' rules (required for the feature to function in production at all).
2. `storage.rules` — new `agenda/attachments/...` match block (required only for Attachments).
3. `functions/` — new/extended scheduled reminder tick + (if fan-out option (a) is chosen) a new `onValueWritten` trigger.
4. `sync-version.mjs` output + any new `agenda.css` `?v=` — routine version-bump housekeeping, both Firebase Hosting and Vercel surfaces per the established dual-surface deploy note.

---

# TEST STRATEGY

Follow the existing house convention exactly (§14): `scripts/agenda-*-check.mjs`, pure-Node where the logic is pure (view-model builders, date-range resolver, identity-transform function, recurrence-shape validation), headless-Puppeteer where DOM/CSS/interaction matters (Today insertion point, create/edit drawer on 375–430px, participant picker, export dialog). Minimum coverage matches the spec's own §TEST REQUIREMENTS list one-for-one (agenda CRUD, shared-Sarpras visibility ×3 users, Kabid isolation + cross-invitation, to-do CRUD/multi-PIC/status/priority/checklist/overdue, notification lifecycle idempotency, attachment authorization, PDF preset/filter/identity-transform matrix, mobile create/edit/export, and a full existing-suite regression pass — `workspace-foundation-check`, `smoke-boot`, executive/domain-shell checks, `permission-service-check`, `canAccessModule-check`, the RTDB rules-family checks — with zero new failures accepted).

All Firebase-touching tests run against the **emulator** (`npm run test:rtdb-emulator` / `test:functions-emulator` already exist and are wired) — never against production, per the spec's Production Safety section and this project's own established practice.

---

# OPEN DECISIONS FOR PHASE B (recommendation given for each; awaiting confirmation before proceeding)

1. **Kabid persona mechanism** — Custom Role (recommended, zero Functions deploy for the role itself) vs. a new code-defined System Role (cleaner long-term, needs a `verifyPin.js` change/deploy).
2. **RTDB fan-out index** — Cloud-Function-maintained (recommended, matches existing precedent, needs a new trigger) vs. client-side atomic multi-location write (smaller deploy footprint, more complex rules).
3. **Reminder scheduling** — extend the existing `reminderTick` (5-min sweep) to also cover Agenda rows, vs. a second dedicated `onSchedule` tick.
4. **Attachments timing** — ship Attachments in the same release once the Storage-bucket provisioning question (R1) is resolved, or explicitly defer Attachments to a fast-follow release so the rest of v1.31.0.0 isn't gated on an infrastructure unknown.

No code has been written or changed. Nothing has been committed or deployed. Production has not been touched.
