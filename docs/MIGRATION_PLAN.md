# PBSI Operations Platform — Migration Plan

> Synthesized from `DESIGN_ANALYSIS.md` and `PRODUCTION_ANALYSIS.md`.
> Production baseline: **v1.2.5**. Target: **V2.0 Multi-Module Platform**.
> Prepared: 2026-06-04.

---

## 1. Current Architecture vs V2 Architecture

### Runtime Environment

| Dimension | V1 Production (v1.2.5) | V2 Target |
|---|---|---|
| **Delivery** | Single `index.html`, raw ES6 modules, no build step | Platform shell with module-scoped entry points; build step recommended (Vite or esbuild) |
| **Framework** | Vanilla JS | Vanilla JS core preserved; React for new module UIs (already prototyped) |
| **State management** | In-memory arrays in `app.js`; localStorage cache; Firebase as source of truth | Module-scoped state; shared platform bus for cross-module events |
| **Routing** | None — single view with modal overlays | Client-side router (hash-based or History API) for module navigation |
| **CSS architecture** | `style.css` (V1 class-based) + `platform.css` (V2 additive token layer) | `platform.css` becomes the sole design system; `style.css` deprecated progressively |
| **Typography** | DM Sans (V1) migrating to Inter (V2 tokens already set in platform.css) | Inter + JetBrains Mono via platform.css |
| **Theme** | Light default; dark mode defined but unwired | Light default; dark mode activated via `[data-theme="dark"]` toggle in Phase 3 |

### Navigation Shell

| Dimension | V1 Production | V2 Target |
|---|---|---|
| **Structure** | Sidebar 240px fixed (desktop) + sticky header + bottom nav (mobile) | Rail 64px + Section Panel 218px + Main (flex:1) — three-column shell |
| **Module concept** | Single module (scheduler) | Five modules: Driver Operations, Engineering & Sarpras, Analytics, Administration, AI Assistant + two roadmap placeholders |
| **Role gating** | Sidebar items hidden per role; single content area | Rail shows only modules available to logged-in role; landing destination varies by role |
| **Mobile** | Bottom tab bar + off-canvas drawer | Bottom tab bar preserved; rail and section panel collapse to drawer or sheet |

### Data Architecture

| Dimension | V1 Production | V2 Target |
|---|---|---|
| **Auth** | PIN vs Firebase `/users/{id}.pin` (plaintext, client-side only) | Firebase Authentication (email/password or custom token); PINs hashed via Cloud Function |
| **Session** | `localStorage` session, no expiry | Firebase Auth session with token refresh and server-side expiry |
| **Realtime DB paths** | `/assignments`, `/driver_requests`, `/users`, `/logs`, `/backups`, `/reimbursement_counters` | Above paths preserved + new: `/work_orders`, `/engineering_users`, `/assets`, `/feature_flags`, `/sent_reminders` |
| **Firebase rules** | Open read/write on `/assignments` only; all other paths unprotected | Role-enforced rules on all paths, keyed to Firebase Auth UID |
| **ID generation** | Client-side base36 timestamp + random chars | Firebase `push()` keys for all new records; existing IDs coexist |
| **Comments** | Nested array inside request document | Subcollection `/driver_requests/{id}/comments/{id}` |
| **Reminders** | `setInterval` in browser tab | Cloud Function cron (Firebase Scheduled Functions) |

### Module Surface Comparison

| V1 Surface | V2 Equivalent | Status |
|---|---|---|
| Timeline (Gantt) | Driver Operations → Timeline Board | Reuse core, wrap in V2 shell |
| Driver Dashboard | Driver Operations → Personal Dashboard | Reuse logic, upgrade UI |
| Request workflow | Driver Operations → Pending Approvals | Reuse, minor UX lift |
| Assignment detail modal | Driver Operations → Detail Panel | Reuse accordion, token-align |
| Notifications modal | Platform-wide activity feed | Extend, not replace |
| Admin user management | Administration → User Management | Reuse CRUD logic |
| — *(not present)* | Engineering & Sarpras | New module |
| — *(not present)* | Analytics | New module |
| — *(not present)* | AI Assistant | New module |
| — *(not present)* | Asset Management | Phase 9 roadmap |
| — *(not present)* | Operational Insights | Phase 9 roadmap |

---

## 2. Reusable Components

These modules and patterns can be carried into V2 with minimal or no modification.

### Firebase Layer (`firebase.js`)
- RTDB sync pattern (`onValue` listeners, surgical `saveOneAssignment`, `removeOneAssignment`) is correct and production-proven.
- Safety guard (anomaly detection, `/logs` write) adds no overhead and should remain.
- Daily backup to `/backups/assignments` is solid and should be extended to new paths.
- `acquireReimbursementDocNumber` (v1.2.5) demonstrates the `runTransaction` pattern — the same approach applies to sequential numbering in Engineering work orders.

### Validation Engine (`validation.js`)
- `ValidationRegistry` and all named validators (`request`, `assignment`, `driver`, `vehicle`, `user`, `odometer`, `lifecycle`) are pure functions with no DOM or Firebase dependencies.
- Designed explicitly for reuse across modules — import and dispatch pattern stays identical.
- Lifecycle analytics foundation (`getAssignmentLifecycle`, `validateLifecycle`) is already documented as the Analytics module feed.

### Utility Library (`utils.js`)
- All date/time formatters (`formatDateLong`, `formatDateTime`, `parseLocalDate`, `getTimePeriod`) are locale-aware and production-tested.
- `showToast` is the only global feedback mechanism — the pattern is correct even if the implementation needs to support a queue in V2.
- `initCustomTimeInputPair` / `getCombinedTimeFromPair` / `setTimeFieldsFromValue` are polished UX components used in two forms; carry forward as-is.
- `expandDateRange` handles multi-day assignment creation — reusable for Engineering work orders with date ranges.

### Reimbursement Form Generator (`reimbursement.js`)
- Fully self-contained (v1.2.5). Produces a standalone A4 HTML document — no shell dependencies.
- `calculateOvertimeStatus` is a pure function, reusable in Analytics and reporting.
- `acquireReimbursementDocNumber` integration pattern is a template for all sequential numbering needs.

### Notification Service (`notification-service.js`)
- Message builders (`sendNewAssignmentNotificationToDriver`, `sendRequestApprovedNotification`, etc.) are well-separated from delivery logic.
- Can be extracted verbatim to a Cloud Function — only the Telegram Bot token environment and the deduplication storage location need to change.

### Telegram Bot Wrapper (`telegram.js`)
- Low-level API wrapper. No application logic. Reuse as-is when moving to Cloud Functions.

### Design Token System (`platform.css`)
- The V2 CSS custom property token layer is the V2 design system foundation.
- All semantic tokens (surfaces, text, borders, status colors, shadows, vehicle palette) are correctly defined.
- `.p-` prefixed component classes avoid collision with V1 selectors — safe to extend.
- Dark mode (`[data-theme="dark"]`) and density (`[data-density="comfortable"]`) are already wired at the token level.

### Audit Log (`logs.js`)
- `logAction()` is a clean append-only writer. Keep pattern; extend to cover new V2 event types (work orders, engineering, auth events).

### Permission Model (`auth.js — PERMISSIONS map`)
- The `hasPermission(perm)` pattern with a static PERMISSIONS map per role is correct and consistent.
- The map structure is trivially extensible for new permissions (e.g., `view_engineering`, `manage_assets`).
- The pattern must survive even after Firebase Auth is added — it will be backed by custom claims rather than `localStorage`.

### Approval Workflow Business Logic (`requests.js`)
- The bidang → admin → approve/reject state machine is operationally proven.
- The traceability model (`requestId`, `createdBy`, `approvedBy`, `approvedAt`) is correct and should extend to Engineering work orders.

---

## 3. Components Requiring Redesign

These components need to be built new or substantially reimagined for V2.

### Application Shell (`index.html`)
- Currently a 900+ line monolithic file containing all modal HTML, all section HTML, and the module bootstrap.
- V2 requires a thin platform shell that loads a persistent rail, a section panel, and a swappable main content area.
- Each module's HTML should live in its own template or be rendered by its JavaScript — not declared globally.
- The modal system needs to become module-scoped, not globally declared in a single file.

### Navigation (`sidebar + bottom nav → rail + section panel + bottom sheet`)
- V1 sidebar is a flat list of links for a single-module app.
- V2 rail is a 64px icon column with tooltip labels that drives module switching — fundamentally different layout contract.
- Section panel (218px) provides per-module navigation (sub-views, CTAs, back-to-hub) — no equivalent in V1.
- Mobile bottom nav needs to represent modules rather than individual pages.
- The V2 prototype's drawer behavior (rail + section panel collapse together on mobile) needs to be built for production.

### Operations Hub
- Not present in V1 at all. V2 has a module-picker Hub as the Admin/Bidang landing destination.
- Needs to be built from the prototype `hub.jsx` as a production HTML/JS component.
- Must reflect role-based module visibility matrix.

### Engineering & Sarpras Module
- Entirely new. Kanban pipeline (5 columns), work order detail, before/after photo integration (requires Firebase Storage), technician management.
- Firebase Storage is a new dependency not present in V1 — requires new configuration and rules.

### Analytics Module
- The chart UI exists in the React prototype with canned seed data.
- Real implementation requires: live Firebase aggregation queries, date-range filtering, per-module KPI calculation.
- Firebase RTDB has no server-side aggregation — queries will require client-side aggregation over fetched data or a Cloud Function materialized view.

### AI Assistant Module
- Chat UI exists in the prototype with canned responses.
- Real implementation requires: Claude API (or similar) integration, access to live operational data (assignments, requests, work orders), streaming response support.
- This is a net-new service dependency.

### Login Screen
- V1 PIN modal is functional but security architecture is inadequate for V2 scale.
- V2 login needs to interface with Firebase Authentication instead of a plaintext Firebase lookup.
- The UI redesign already exists in `platform.css` (new login card styles) — the business logic needs replacement.

---

## 4. Components Requiring Refactoring

These components work correctly but need targeted changes before V2 deployment.

### App Orchestrator (`app.js`)
- **Problem:** app.js owns all global state, all Firebase wiring, all module callback registration, and all re-render logic. As new modules are added, it becomes untenable.
- **Refactor:** Split into a thin platform boot sequence + per-module entry points. Global state (assignments, requests) stays in app.js for Driver Operations; new modules own their own state.
- **Risk:** Medium. app.js is tightly coupled to every module; changes require full regression.

### Assignment Form (`assignments.js`)
- **Problem:** Inline validation (`if (!fieldDriver.value)`) partially duplicates `validation.js` validators. Multi-day expansion logic is embedded alongside form rendering.
- **Refactor:** Replace inline checks with `ValidationRegistry.validate('assignment', data)` dispatch. Extract multi-day logic to a helper. Wire error display to `result.errors[]` rather than toast-only.
- **Risk:** Low. Validators are already written and tested; migration is mechanical.

### Request Form (`requests.js`)
- **Problem:** Same inline validation duplication as assignments.js. Request → assignment expansion (`requestToAssignment`) creates one assignment per date in a loop without batching Firebase writes.
- **Refactor:** Wire to `ValidationRegistry.validate('request', data)`. Batch Firebase writes using `update()` multi-path write for atomic approval.
- **Risk:** Low.

### Detail Modal (`modal.js`)
- **Problem:** Accordion implementation is inline (not a shared component). `updateDetailActionButtons()` is a large function that knows about every button. Permission-gated button logic will grow as more V2 actions are added.
- **Refactor:** Extract accordion into a shared utility (state toggle + ARIA). Split button gating by concern. The `printReimbursementForm` async handler pattern (v1.2.5) is a good template.
- **Risk:** Low. Logic is correct; refactor is structural.

### Firebase Security Rules (`firebase-rules.json`)
- **Problem:** Only `/assignments` has rules. All other paths are unprotected in production. PINs in `/users` are accessible to any unauthenticated reader.
- **Refactor:** Write rules covering all paths. Structure: read/write gated by `auth != null` at minimum; role-based writes gated by user document role field before Firebase Auth is available.
- **Risk:** High if deployed without coordinating with Auth migration. Must be staged (see Phase 4).

### ID Generation (`utils.js — generateId()`)
- **Problem:** Client-side base36 timestamp + 4 random chars. Collision probability is low at current scale but non-zero under concurrent writes.
- **Refactor:** Replace with Firebase `push()` key at all new write sites (work orders, engineering records). Existing assignment/request IDs retain old format — no data migration needed.
- **Risk:** Low. Old and new ID formats coexist transparently.

### Comment Storage (`comments.js + requests.js`)
- **Problem:** `request.comments` is a nested array inside the request document. Every request sync delivers full comment history. This grows without bound.
- **Refactor:** Move to `/driver_requests/{id}/comments/{commentId}` subcollection. Add a separate `onValue` listener in `comments.js` scoped to the open thread. Migrate existing embedded comments during a dedicated maintenance window.
- **Risk:** Medium. Requires a one-time data migration. Dual-read period (check array AND subcollection) during transition.

### Reminder Scheduling (`notification-service.js`)
- **Problem:** `setInterval` in the browser tab. No reminders if no tab is open.
- **Refactor:** Extract reminder logic to a Firebase Scheduled Function (runs on Cloud Function cron). Move deduplication key from `localStorage` to `/sent_reminders/{assignmentId}/{type}` in Firebase. Remove browser-side interval after Cloud Function is verified.
- **Risk:** Low. Module is already well-separated. Telegram Bot token moves to Cloud Function environment variable.

### Driver Roster (`drivers.js`)
- **Problem:** `DEFAULT_DRIVERS` is a hardcoded source-code array. Adding a driver requires code change and deployment. Driver user accounts and roster entries are loosely coupled by name string.
- **Refactor:** Migrate `DEFAULT_DRIVERS` to `/drivers` Firebase path. Add admin UI for roster management. Add a `driverId` foreign key to assignment documents (non-breaking; old assignments retain string-only driver name).
- **Risk:** Medium. Async load of driver data before form initialization touches multiple modules.

### CSS Consolidation (`style.css` + `platform.css`)
- **Problem:** Two CSS files with overlapping variable definitions. Some tokens defined in both with different values. `platform.css` was untracked in git at analysis time (critical deployment risk).
- **Refactor:** Commit `platform.css` to git immediately (if not already done). Audit all overriding declarations. Progressively remove V1 style.css sections as each component is lifted to V2 tokens. Target: `style.css` reduced to a thin reset shim that imports from `platform.css`.
- **Risk:** Medium. CSS changes are high surface area. Require visual regression checks on mobile and desktop.

---

## 5. Components That Should Remain Unchanged

These components are stable, correct, and should not be touched during migration.

| Component | Reason to leave unchanged |
|---|---|
| `validation.js` — all validators | Pure functions, no dependencies, already designed for cross-module reuse. Adding more validators is additive. |
| `timeline.js` — Gantt renderer | Complex horizontal layout, production-proven over many versions. Wrap in V2 shell; do not rewrite. |
| `reimbursement.js` — form generator | Just completed v1.2.5 production polish. Self-contained. No shell dependencies. |
| `telegram.js` — Bot API wrapper | Correct low-level wrapper. No application logic to change. |
| `logs.js` — audit writer | Clean append-only pattern. Extend event types; do not change write mechanism. |
| `config.js` — version registry | Simple static data. Update version entries as releases ship. |
| `utils.js` — time input pair | Polished UX for HH:MM entry. Carries forward as-is into all forms. |
| Odometer capture flow (`modal.js`) | The stacked-modal UX (detail → odometer → return to detail) is operationally smooth. Do not change the interaction pattern. |
| Assignment approval business logic | Bidang → admin → approve/reject state machine is correct and operationally proven. The lifecycle traceability model (`requestId`, `createdBy`, `approvedBy`) is a foundation for Analytics. |
| Safety guard in `firebase.js` | Anomaly detection and daily backup are silent defensive mechanisms with no UX impact. Keep both. |
| Firebase RTDB surgical write pattern | `saveOneAssignment` / `removeOneAssignment` per-record writes are correct. Extend the same pattern to all new Firebase paths. |
| `platform.css` token architecture | The token system is already V2. Do not restructure the token hierarchy. |
| WhatsApp template generator (`modal.js`) | Operationally critical. Correct format. No changes needed. |

---

## 6. Production Risks

Risks are rated by **impact** (blast radius if it fails) and **likelihood** (probability during migration).

### Critical — Address Before Any V2 Work

**R1 — Open Firebase security rules**
- Impact: Critical. All `/users` data (including PINs) is accessible to any unauthenticated reader. Any unauthenticated client can write to `/assignments`.
- Likelihood: Certain (this is the current production state, not a future risk).

**R2 — PINs stored in plaintext**
- Impact: Critical. A Firebase console read or a rules misconfiguration exposes all user credentials.
- Likelihood: Certain.

**R3 — `platform.css` absent from git**
- Impact: High. A clean deployment checkout would produce a broken V2 UI (missing all design tokens, login screen, component classes).
- Likelihood: High if not already resolved.

### High — Address in Phase 1–2

**R4 — Client-side-only authorization**
- Impact: High. Any motivated user with browser dev tools can bypass all role checks. Firebase rules do not enforce roles.
- Likelihood: Low (requires deliberate intent), but the exposure exists.

**R5 — No session expiry**
- Impact: High. A shared or stolen device retains permanent access until manual logout.
- Likelihood: Medium (shared devices are common in operational settings).

**R6 — Reminders require an open browser tab**
- Impact: High operationally. Time-sensitive H-1 and 2-hour driver reminders may not fire if no admin is logged in.
- Likelihood: Certain (this is a design limitation of `setInterval`).

**R7 — Firebase Auth migration is a breaking change**
- Impact: High. Adding Firebase Auth invalidates all existing `localStorage` sessions and changes every Firebase rule.
- Likelihood: Certain (this migration will happen; the risk is in execution).

### Medium — Address in Phase 3–5

**R8 — Comment array growth**
- Impact: Medium. As comment volume grows, every request sync transmits the full comment history for all requests. Firebase RTDB delivers entire documents — no server-side projection.
- Likelihood: Grows over time.

**R9 — No offline write queue**
- Impact: Medium. Assignments submitted while Firebase is unreachable persist locally but are never retried. Local and remote states diverge silently.
- Likelihood: Low (Firebase outages are rare), but divergence is invisible to users when it occurs.

**R10 — Driver roster drift**
- Impact: Medium. Driver accounts in `/users` and roster entries in `drivers.js` are matched by name string. A renamed account or a typo in either location silently breaks driver-assignment matching.
- Likelihood: Grows as the team expands.

**R11 — Multi-module routing is absent**
- Impact: Medium. V2's multi-module platform requires a client-side router. V1 has none. Adding a router late changes the URL contract for all existing bookmarks and deep links.
- Likelihood: Certain (routing must be added before Engineering module ships).

### Low — Monitor

**R12 — ID collision at scale**
- Impact: Low. The base36 timestamp + 4-char random ID is collision-resistant at current scale but not cryptographically unique.
- Likelihood: Very low unless concurrent writes increase significantly.

**R13 — React/Babel CDN delivery for new modules**
- Impact: Medium. The V2 prototypes use React 18 + Babel standalone from CDN — suitable for prototyping only, not production. If new modules ship as React components, a build step is required.
- Likelihood: Certain if React modules are deployed without a build tool.

**R14 — Analytics module requires data aggregation not native to RTDB**
- Impact: Medium. Firebase Realtime Database has no server-side aggregation or query engine. Real analytics will require client-side aggregation over full data fetches or a Cloud Function materialized view — both have performance implications.
- Likelihood: Certain when Analytics moves from prototype to live data.

---

## 7. Risk Mitigation

### R1 + R2 — Firebase Rules + PIN Security
- Deploy restrictive rules on `/users` (read: auth != null; write: auth != null AND `role == "admin"`) as a standalone deployment before any other V2 work.
- Use a staging Firebase project (cloned from production) to test rule changes before applying to production.
- Do not hash PINs until a Cloud Function handles comparison — client-side hashing provides no security guarantee. Plan the hashing work as a coordinated step with Cloud Function setup (Phase 4).

### R3 — platform.css in git
- Verify `platform.css` is committed and tracked (`git status`). If not, commit immediately as a hotfix. Add a CI check that fails if `platform.css` is absent.

### R4 — Client-side authorization
- Accept this as a known limitation for the current team size and trust model. Enforce server-side rules (Firebase rules) as the primary boundary. Client-side checks remain for UX gating only, not security enforcement.

### R5 — Session expiry
- As a short-term measure, add a `loginTime` field to the `localStorage` session object. On session restore, check if `Date.now() - loginTime > SESSION_MAX_MS` and force re-login. Implement before Firebase Auth migration (Phase 4).

### R6 — Reminder reliability
- Deploy Cloud Function scheduled reminders in Phase 2 before any other Cloud Function work — this is the lowest-risk Cloud Function (no auth dependency, notification-service.js is already extractable). Browser-side interval becomes a fallback, not primary.

### R7 — Firebase Auth migration breakage
- Run Firebase Auth on a separate staging project first. Never migrate production users without a dual-auth period (accept both old PIN method and new Firebase Auth simultaneously for a transition window of at least 2 weeks). Communicate migration dates to all users in advance.

### R8 — Comment array growth
- Add comment count monitoring to the safety guard in `firebase.js`. Log a warning when any request document exceeds 50 comments. Treat this as a trigger signal for the subcollection migration, not a hard blocker today.

### R9 — Offline write queue
- Add a pending writes queue to `localStorage` (array of `{ path, data, timestamp }`). On reconnect (detect via Firebase connection state ref `/.info/connected`), replay queued writes in order. This is a self-contained addition to `firebase.js`.

### R10 — Driver roster drift
- As an immediate improvement, add a consistency check to `app.js` startup: compare `DEFAULT_DRIVERS` names against active user accounts with `role === 'driver'`. Log a warning if any driver user has no matching roster entry. Full fix in Phase 6 (Firebase-backed roster).

### R11 — Routing
- Add a minimal hash-router (`window.hashchange` listener) in Phase 2 before any module UI is built. Define URL contracts upfront: `#/driver`, `#/engineering`, `#/analytics`, `#/admin`, `#/hub`. This prevents URL-breaking changes later.

### R13 — React + CDN in production
- Do not ship React modules to production via CDN. Before any React-based module graduates from prototype to production, introduce a build step (Vite is recommended — minimal config, native ES module support, no webpack complexity).

### R14 — Analytics aggregation
- Start Analytics with client-side aggregation over the full Firebase dataset (acceptable for current data volume). Design aggregation functions as pure utilities. When data volume triggers performance issues, extract to a Cloud Function that writes pre-aggregated daily summaries to `/analytics_cache/{date}`.

---

## 8. Feature Flag Strategy

Because V1 has no build step, feature flags cannot be compile-time constants. All flags must be runtime-readable.

### Flag Storage

**Primary: Firebase RTDB `/feature_flags/{flag_name}`**
- Read once at startup in `app.js`; stored in a module-level `flags` object.
- Admin can toggle flags in real time via Firebase console or a flags UI panel (Phase 2).
- Propagates to all open sessions within seconds via RTDB listener.

**Secondary: `localStorage` override for developer testing**
- Check `localStorage.getItem('pbsi_flag_{name}')` first; fall back to Firebase value.
- Allows a developer or tester to force-enable a flag on their own device without affecting others.
- Override expires on `localStorage.clear()` or explicit removal.

### Flag Registry

| Flag name | Controls | Default |
|---|---|---|
| `v2_shell` | Enable three-column rail + section panel shell | `false` |
| `engineering_module` | Show Engineering in rail; enable `/work_orders` writes | `false` |
| `analytics_module` | Show Analytics in rail; enable data aggregation | `false` |
| `ai_assistant` | Show AI Assistant in rail; enable Claude API calls | `false` |
| `asset_management` | Show Asset Management placeholder in hub | `false` |
| `firebase_auth` | Use Firebase Auth login instead of PIN lookup | `false` |
| `server_reminders` | Disable browser setInterval; trust Cloud Function | `false` |
| `dark_mode_toggle` | Show theme toggle button in shell chrome | `false` |
| `session_expiry` | Enforce `SESSION_MAX_MS` session timeout | `false` |
| `offline_queue` | Enable localStorage pending-write queue | `false` |

### Flag Usage Pattern

- Feature-flagged code paths must be **completely hidden**, not disabled. Do not show a disabled button or a blurred section — if the flag is off, the surface does not exist.
- Flag reads happen once per startup. A flag change during a live session takes effect on next page load (or immediately if a RTDB listener is wired).
- All flags default to `false`. New flags start off; graduate to `true` after QA sign-off on staging.
- Remove a flag from the registry (and its code branches) once the feature is stable and the flag has been `true` in production for at least 30 days without incident.

---

## 9. Rollback Strategy

### Code Rollback

Because there is no build pipeline, rollback is a git operation: `git revert` or `git checkout {commit} -- {files}`. The absence of a build step is a deployment advantage here — a reverted commit is immediately live on the next file-serve cache refresh.

- **Per-file rollback:** Any single module (e.g., `firebase.js`, `modal.js`) can be reverted independently without touching others.
- **Shell rollback:** During the V2 shell transition (Phase 2), keep `index.v1.html` as a live backup. The hosting config can point to either file without any code change.
- **Module rollback:** Feature flags (Section 8) are the primary rollback mechanism for individual modules. Setting a flag to `false` in Firebase is instant and requires no deployment.

### Firebase Data Rollback

- The daily backup system (`/backups/assignments/{timestamp}`) provides a 30-day rolling snapshot of assignment data. Any assignment-level data loss can be recovered by reading a backup node and replaying surgical writes.
- **New paths added in V2** (e.g., `/work_orders`, `/feature_flags`) must also be added to the backup routine before their modules go live.
- Firebase RTDB does not support transactions that span multiple top-level paths — a failed multi-path write leaves partial state. All critical writes must use `update()` with a multi-path object to be atomic within a single request.

### Firebase Rules Rollback

- Rules changes are the highest rollback risk — a bad rules push can instantly lock out all users or expose all data.
- **Protocol:** Always test rules on a staging Firebase project (separate from production) before applying to production.
- Keep the previous working rules file in git. The rules rollback is `firebase deploy --only database:rules` with the previous file.
- Never deploy rules changes at peak operating hours (morning dispatch window).

### Firebase Auth Migration Rollback

- Auth migration is the only change in the plan that is difficult to roll back once user accounts are migrated.
- **Dual-auth period (mandatory):** Accept both PIN lookup (old) and Firebase Auth (new) for a minimum of 2 weeks before decommissioning PIN login. During this window, a rollback means simply setting `firebase_auth` flag back to `false`.
- After PIN login is decommissioned, rollback requires re-enabling PIN lookup AND potentially re-creating user sessions — treat this as a recovery scenario, not a routine rollback.

### Rollback Decision Criteria

| Scenario | Rollback action | Time to restore |
|---|---|---|
| New module UI regression | Set feature flag to `false` | < 30 seconds |
| Module JS bug | `git revert` + redeploy file | < 5 minutes |
| Shell layout regression | Switch hosting to `index.v1.html` | < 2 minutes |
| Firebase rules lockout | `firebase deploy --only database:rules` with previous rules file | < 3 minutes |
| Data loss (assignments) | Restore from `/backups/assignments/{latest}` via surgical writes | 15–60 minutes depending on volume |
| Firebase Auth failure during migration | Set `firebase_auth` flag to `false`; PIN login still active | < 30 seconds |

---

## 10. Recommended Implementation Phases

Phases are sequenced to: (a) fix critical risks before adding scope, (b) deliver operational value incrementally, (c) never break the production scheduler during migration.

---

### Phase 0 — Security Baseline
*Prerequisite for all subsequent phases. No V2 features ship until this is done.*

- Commit `platform.css` to git and verify deployment.
- Audit and deploy complete Firebase security rules covering all existing paths (`/assignments`, `/driver_requests`, `/users`, `/logs`, `/backups`).
- Add a `loginTime` field to `localStorage` sessions and enforce a configurable session expiry (default: 12 hours).
- Add `session_expiry` feature flag; enable in production after testing.
- Document the rules file in the repository and add a deployment checklist note.

**Risk reduction:** R1, R2 (partially), R3, R5.
**User impact:** None visible. Session expiry prompts re-login after inactivity.

---

### Phase 1 — Design System Consolidation
*Resolve the dual-CSS technical debt before building new UI surfaces.*

- Audit all declarations in `style.css` that conflict with or duplicate `platform.css` tokens.
- Migrate V1 component selectors (`.btn-primary`, `.modal-box`, `.badge-status`) to consume V2 tokens.
- Reduce `style.css` to a compatibility shim; mark all remaining rules with `/* V1-COMPAT */`.
- Wire the `dark_mode_toggle` flag and implement the theme switch button in the current sidebar.
- Verify mobile responsiveness across all current views after token migration.
- Add `offline_queue` to `firebase.js`; enable via flag after testing.

**Risk reduction:** R3 (completed), R9.
**User impact:** Subtle visual refinements. No workflow changes.

---

### Phase 2 — Platform Shell + Routing
*Build the V2 navigation container without replacing any module content.*

- Introduce a hash-router (`#/driver`, `#/hub`, `#/engineering`, etc.) in `app.js`.
- Build the V2 three-column shell (rail, section panel, main) as an HTML/CSS structure gated by the `v2_shell` feature flag.
- V1 sidebar and header remain active when `v2_shell` is `false`.
- Implement the Operations Hub module-picker landing page for Admin/Bidang roles.
- Move Driver Operations content (timeline, driver dashboard) into the `#/driver` route.
- Migrate bottom navigation to represent modules.
- Extract Cloud Function for H-1 and 2-hour reminders; set `server_reminders` flag to `true` after verification.

**Risk reduction:** R6, R11.
**User impact:** Navigation changes when `v2_shell` flag is enabled. Operationally invisible while flag is `false`.

---

### Phase 3 — Driver Operations Module Polish
*Complete the Driver Operations module under the V2 shell before shipping new modules.*

- Lift the assignment detail modal into the V2 shell as a side panel or full-view (design decision).
- Wire `ValidationRegistry` to assignment form and request form submissions; replace all inline validation.
- Move comment storage to `/driver_requests/{id}/comments/{id}` subcollection; migrate existing comments.
- Replace `generateId()` with Firebase `push()` keys at all new write sites.
- Add monitoring for comment document size in the safety guard.
- Enable the `v2_shell` flag in production after QA sign-off.

**Risk reduction:** R4 (partially), R8, R10 (partially), R12.
**User impact:** Visual shell change. No workflow changes.

---

### Phase 4 — Firebase Authentication + Role Enforcement
*The highest-risk phase. Must follow Phase 3; cannot be partially deployed.*

- Set up Firebase Authentication on a staging project with a cloned production database.
- Implement PIN-based Firebase Auth sign-in via a Cloud Function that validates PIN and issues a custom token.
- Add `uid` to all user documents; update Firebase rules to use `request.auth.uid`.
- Deploy dual-auth mode (`firebase_auth` flag): accept both old PIN lookup and new Firebase Auth.
- Communicate migration timeline to all users with a 2-week notice period.
- After 2-week dual-auth window: disable PIN lookup; set `firebase_auth` flag permanently to `true`.
- Decommission old PIN comparison code path.

**Risk reduction:** R1 (completed), R2 (completed), R4 (completed), R7.
**User impact:** Login flow changes. All users re-authenticate on migration day.

---

### Phase 5 — Engineering & Sarpras Module
*First net-new module. Validate the multi-module architecture end-to-end.*

- Configure Firebase Storage (new dependency). Write Security Rules for storage paths before first upload.
- Define `/work_orders` Firebase path and data schema. Write rules before enabling writes.
- Build Kanban pipeline board and work order form.
- Add daily backup coverage for `/work_orders` to the backup routine.
- Extend `ValidationRegistry` with work order validators.
- Apply `reimbursement_counters` pattern for sequential work order numbering.
- Enable `engineering_module` flag after QA on staging.

**Risk reduction:** R13 (build step decision point).
**User impact:** Engineering team gains a new module. No impact on Driver Operations.

---

### Phase 6 — Data Infrastructure Improvements
*Address the remaining medium-term technical debt.*

- Migrate `DEFAULT_DRIVERS` to `/drivers` Firebase path. Build admin roster management UI in Administration module.
- Add `driverId` foreign key to assignment documents (non-breaking; old string-only driver assignments remain valid).
- Migrate Firebase-backed Analytics aggregation: client-side aggregation first, Cloud Function materialized view when data volume demands.
- Enable `analytics_module` flag after live data wiring is complete.
- Extend Administration module with live roles & permissions matrix (not static display).

**Risk reduction:** R10 (completed), R14.
**User impact:** Admins can manage driver roster without code deployments.

---

### Phase 7 — Analytics Module (Live Data)
*Graduate Analytics from prototype to production data.*

- Wire `getAssignmentLifecycle` (already in `validation.js`) into Analytics KPI cards.
- Connect `distanceTravelled` from odometer data to vehicle utilization charts.
- Build date-range query helpers in `firebase.js` (client-side filtered fetches from `/assignments`).
- Implement Cloud Function daily aggregation writer to `/analytics_cache/{date}`.
- Add CSV export for Operational Insights reporting (foundation for Phase 9).

---

### Phase 8 — AI Assistant Module
*Deferred until infrastructure (Auth, Cloud Functions) is stable.*

- Integrate Claude API via a Cloud Function proxy (never expose API key to client).
- Scope AI access to read-only summaries of assignments, requests, and work orders.
- Build streaming response support in the chat UI.
- Add `ai_assistant` flag; enable for Admin role only initially.

---

### Phase 9 — Asset Management + Operational Insights
*Roadmap modules. Plan after Phase 7 is stable.*

- Asset Management: vehicle and facility tracking, maintenance lifecycle, integration with Engineering work orders.
- Operational Insights: cross-module KPI reporting, per-bidang data breakdowns, PDF/CSV export pipeline.
- Both modules depend on the data infrastructure and aggregation patterns established in Phases 6 and 7.

---

## Summary Table

| Phase | Focus | Critical Dependencies | User-Visible Change |
|---|---|---|---|
| 0 | Security baseline | None | Session expiry prompt |
| 1 | CSS consolidation + offline queue | Phase 0 complete | Visual refinements |
| 2 | V2 shell + routing + Cloud Function reminders | Phase 1 complete | Navigation (behind flag) |
| 3 | Driver Operations polish + validation wiring | Phase 2 complete | Shell revealed in production |
| 4 | Firebase Authentication | Phase 3 stable | Login flow change |
| 5 | Engineering module | Phase 4 complete, Firebase Storage | New module for engineering team |
| 6 | Driver roster + Analytics infrastructure | Phase 5 stable | Roster admin UI |
| 7 | Analytics live data | Phase 6 complete | Analytics module live |
| 8 | AI Assistant | Phase 4 + Phase 7 complete | AI module for admins |
| 9 | Asset Management + Operational Insights | Phase 7 + Phase 8 complete | Roadmap modules |

---

*This document should be reviewed and updated at the start of each phase. Assumptions made here about Firebase rules, Cloud Function feasibility, and user count are based on the state of the codebase at v1.2.5. Significant changes to team size, data volume, or Firebase plan tier may require re-prioritization.*
