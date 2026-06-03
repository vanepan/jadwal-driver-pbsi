# PBSI Jadwal Driver — Production Analysis

**Version:** 1.2.3 — Completion Tracking Expansion  
**Date Analysed:** 2026-06-03  
**Stack:** Vanilla JS (ES6 modules), HTML5, CSS3, Firebase Realtime Database SDK v10.12.5

---

## Architecture Overview

The application is a **single-page application (SPA)** built without any framework. It consists of one HTML file (`index.html`) that acts as the complete UI scaffold, with 22 ES6 modules loaded via `<script type="module">`. There is no build step, bundler, or transpiler — the browser receives raw source files.

**Architectural pattern:** Callback-based module orchestration. `app.js` is the central hub; all other modules register callbacks into it and receive state via setter functions. There is no shared state object or reactive store — data flows through explicit function calls.

**Storage dual-layer:**
- **Primary (runtime):** In-memory arrays in `app.js` (`assignments`, `requests`, `auditLogs`)
- **Offline cache:** `localStorage` (keyed `pbsi_assignments`, `pbsi_requests`, `pbsi_reminders`)
- **Source of truth:** Firebase Realtime Database (always authoritative; overwrites cache on sync)

**Module map:**

| Module | Responsibility |
|--------|---------------|
| `app.js` | Global state, init sequence, callback wiring, cross-module coordination |
| `firebase.js` | Firebase listeners, surgical writes, safety guards, daily backup |
| `auth.js` | Login, session management, role/permission checks |
| `timeline.js` | Horizontal schedule grid rendering, scroll sync, auto-focus |
| `assignments.js` | Schedule CRUD, conflict detection, form state |
| `requests.js` | Request workflow (create → approve/reject → expand to assignments) |
| `modal.js` | Detail modal accordion, odometer modal, WhatsApp template |
| `users.js` | User CRUD, Telegram Chat ID management |
| `admin.js` | Admin UI (user list, test notifications) |
| `drivers.js` | Driver roster and vehicle registry (static data) |
| `comments.js` | Comment threads scoped to requests |
| `notification-service.js` | Telegram message builders, reminder deduplication |
| `notifications.js` | Notification feed modal (in-app activity log) |
| `telegram.js` | Low-level Telegram Bot API wrapper |
| `logs.js` | Audit log write, Firebase path `/logs` |
| `validation.js` | Centralized validation engine, ValidationRegistry |
| `driver-dashboard.js` | Driver personal view (4 sections: live, today, upcoming, history) |
| `utils.js` | Date/time converters, formatters, ID generator, toast |
| `recovery.js` | Legacy data migration helpers (archived) |
| `config.js` | App version, release name, version history |

---

## Authentication Flow

Authentication uses **4-digit PIN over username lookup** with no cryptographic hashing. Session state is stored in `localStorage` under key `pbsi_current_user`.

**Login sequence:**
1. User enters username and PIN in `#modalLogin`
2. `getUserByUsername(username)` reads from Firebase `/users/{normalized_username}`
3. Stored `pin` field compared to entered value (plaintext string comparison)
4. On match: session object `{ id, username, name, role, active }` written to `localStorage`
5. `logAction({ action: 'login' })` appended to `/logs`
6. `notifyAuthChange()` triggers `updateAuthUI()` — closes modal, reveals role-appropriate UI

**Session restoration:**
- On page load, `initAuthUI()` reads `localStorage` session key
- If a valid session exists and the user is `active`, session is restored without re-authentication
- No token expiry, no server-side session validation

**Logout:**
- Clears `localStorage` session key
- Logs `logout` action
- Reloads to login modal state

**Security model:**
- PINs stored in plaintext in Firebase `/users/{id}.pin`
- Firebase rules currently allow unauthenticated full read/write on `/assignments` (see Firebase Integration section)
- No HTTPS enforcement at the app layer (relies on hosting)
- No rate limiting on login attempts

---

## Firebase Integration Points

**Project config:** Loaded inline in `index.html` via `firebaseConfig` object (API key exposed in client-side source).

**Database paths and their consumers:**

| Path | Read by | Written by | Notes |
|------|---------|-----------|-------|
| `/assignments/{id}` | `firebase.js` onValue listener | `firebase.js` saveOneAssignment / removeOneAssignment | Surgical per-record writes only |
| `/driver_requests/{id}` | `firebase.js` onValue listener | `requests.js` via firebase module | Full request object including nested comments array |
| `/users/{username}` | `auth.js`, `users.js`, `admin.js` | `users.js` | Username is the key (normalized to lowercase-hyphen) |
| `/logs/{id}` | `logs.js` onValue listener | `logs.js` logAction | Append-only audit trail |
| `/backups/assignments/{timestamp}` | Never read by app | `firebase.js` daily backup | 30-day retention, pruned automatically |

**Real-time sync pattern:**
- `onValue()` listeners opened on `/assignments` and `/driver_requests` at startup
- Every snapshot overwrites `localStorage` cache and calls back into `app.js`
- `app.js` updates in-memory state and triggers full re-render of all modules

**Safety guard (anomaly detection):**
- Compares incoming Firebase assignment count to local count
- If remote < 50% of local OR absolute difference > 20, logs `safety_anomaly` to `/logs` and shows toast
- Does not block the UI or prevent the sync — advisory only

**Firebase rules (`firebase-rules.json`):**
```json
{
  "rules": {
    "assignments": {
      ".read": true,
      ".write": true
    }
  }
}
```
Only `/assignments` has explicit rules. `/driver_requests`, `/users`, `/logs`, and `/backups` have **no rules declared**, which means they fall under Firebase's default (deny all) or inherit root rules depending on deployment. This is a significant discrepancy between the rules file and the application's actual data access pattern.

---

## Role System

Four roles are defined. All role checks happen client-side only.

| Role | Key capabilities |
|------|----------------|
| `admin` | Create/edit/delete assignments, approve/reject requests, manage users, start/complete assignments, view all data |
| `bidang` | Create and view own requests, add comments to own requests |
| `driver` | View own assignments on personal dashboard, start and complete own assignments, add comments to assigned requests |
| `viewer` | Read-only access to the timeline |

**Permission constants** are defined in `auth.js` as a static `PERMISSIONS` map. `hasPermission(perm)` checks whether the current user's role is in the allowed list for that permission key.

**Role enforcement gaps:**
- All permission checks are in-browser JavaScript — any user with browser dev tools can bypass them
- Firebase rules do not enforce role boundaries; they only gate on `/assignments` (open read/write)
- The `viewer` role has no dedicated UI filtering — it receives the same data as `admin` but with action buttons hidden

**Driver identity:** Driver users are matched to assignment records by comparing `user.username` or `user.name` to `assignment.driver` (string comparison). There is no foreign-key relationship — a driver account and a driver roster entry are loosely coupled by name string.

---

## Scheduling Workflow

**Direct creation (admin):**
1. Admin opens form modal via "Tambah Jadwal" button
2. Selects driver, vehicle, date, time range, destination, purpose
3. Optional: multi-day checkbox expands date range (stored as one assignment per date)
4. Conflict check: driver overlap + vehicle overlap across all selected dates
5. On submit: assignment written to `localStorage` and Firebase `/assignments/{id}` (surgical)
6. Timeline re-renders; driver receives Telegram notification

**Assignment object fields:**
```
id, driver, phone, vehicle, date, startTime, endTime, fullDay,
destination, purpose, pic, pax, notes,
status (assigned | started | completed),
createdAt, createdBy,
updatedAt,
requestId, approvedAt, approvedBy,     (if from request)
assignedAt, assignedBy,                (if direct admin)
startedAt, startedBy, startOdometer,
completedAt, completedBy, endOdometer, distanceTravelled
```

**Conflict detection:**
- `checkConflict()` — same driver, overlapping time window, same date (excludes editingId)
- `checkVehicleConflict()` — same vehicle, overlapping time window, same date
- Advisory warning shown on form input; hard block on submit

**Multi-day behavior:**
- Stored as N independent single-day assignment records (one per date)
- No parent/child relationship between them
- Each must be started and completed independently

---

## Approval Workflow

**Request lifecycle:** `pending` → `approved` | `rejected`

1. **Bidang creates request** via `#modalRequestForm`: selects driver, vehicle, date(s), time, purpose
2. Request saved to `localStorage` and Firebase `/driver_requests/{id}` with `status: "pending"`
3. All active `admin` users receive Telegram notification via `sendNewRequestNotificationToAdmins()`
4. **Admin reviews** via `#modalRequestsList`: can edit fields while status is `pending`
5. **Approve path:**
   - Conflict check across all dates (hard block if overlap found)
   - For each date in range: `requestToAssignment()` creates one assignment record
   - All assignments saved to Firebase surgically
   - `request.status` set to `"approved"`, `approvedBy` and `approvedAt` recorded
   - Bidang notified (Telegram); first assigned driver notified (Telegram)
6. **Reject path:**
   - `request.status` set to `"rejected"`, optional rejection note
   - Bidang notified (Telegram)

**Traceability:** Approved assignments carry `requestId` linking back to the source request, and `createdBy` = requester name distinct from `approvedBy` = admin name.

**Comment thread:** Available on any assignment that has a `requestId`. Accessible by admin, bidang (own requests), and the assigned driver.

---

## Notification Workflow

**Transport:** Telegram Bot API. No in-browser push notifications (no service worker, no Web Push).

**In-app feed:** `#modalNotifications` displays audit log entries from `/logs` as a chronological activity feed. This is read-only and shows system actions, not direct messages.

**Telegram trigger points:**

| Event | Recipients | Sender function |
|-------|-----------|----------------|
| New request submitted | All active admin users | `sendNewRequestNotificationToAdmins()` |
| Request approved | Requesting bidang user | `sendRequestApprovedNotification()` |
| Request rejected | Requesting bidang user | `sendRequestRejectedNotification()` |
| Assignment created (direct) | Assigned driver | `sendNewAssignmentNotificationToDriver()` |
| H-1 reminder | Driver + request bidang | `checkAndSendH1Reminders()` |
| 2-hour reminder | Driver + request bidang | `checkAndSendHoursReminders()` |

**Reminder scheduling:**
- H-1 check runs on a `setInterval` every 60 minutes
- 2-hour check runs every 5 minutes
- Both use a daily deduplication key in `localStorage` (`pbsi_reminders`) to prevent repeat sends
- Reminders only fire if the browser tab is open — no background worker or server-side scheduler

**Telegram Chat ID storage:**
- Each user has `telegramChatIds.primary` and optional `secondary1`, `secondary2`
- Set via admin user management panel or self-service in `#modalProfile`
- `/myid` command on the PBSI Bot returns the user's Chat ID

**Error handling:** All Telegram sends are fire-and-forget with `try/catch`. Failures are swallowed silently (logged to console only) and never surface to the user.

---

## Completion Tracking Workflow

Added in v1.2.2 (Odometer Foundation) and expanded in v1.2.3.

**Start assignment:**
1. Admin or driver clicks "Mulai Tugas" in detail modal
2. Detail modal closes; `#modalOdometer` opens with label "KM AWAL"
3. User enters current odometer reading
4. `validateOdometer({ currentOdometer })` — blocks if non-numeric or negative
5. On confirm: `assignment.status = "started"`, `startedAt`, `startedBy`, `startOdometer` recorded
6. Firebase surgical write; timeline block gains "▶ Jalan" badge

**Complete assignment:**
1. Admin or driver clicks "Selesaikan" in detail modal
2. Detail modal closes; `#modalOdometer` opens with label "KM AKHIR"
3. Live preview shows KM Awal, KM Akhir (live input), and Jarak Tempuh (calculated)
4. `validateOdometer({ currentOdometer, previousOdometer: startOdometer })` — warning if end < start (not hard block), warning if jump > 2000 km
5. On confirm: `assignment.status = "completed"`, `completedAt`, `completedBy`, `endOdometer`, `distanceTravelled` recorded
6. Firebase surgical write; timeline block gains "✓ Selesai" badge

**Cancel odometer modal:** Reopens detail modal so context is not lost.

**Lifecycle analytics foundation (v1.2.3):**
- `getAssignmentLifecycle(assignment)` in `validation.js` extracts all timestamps and computes durations: `requestToApprovalMs`, `approvalToStartMs`, `actualDurationMs`, `totalCycleMs`
- `validateLifecycle(assignment)` warns on out-of-order timestamps (non-blocking)
- Both functions are in `ValidationRegistry` but not yet consumed by any UI — documented as foundation for v1.2.5 Analytics

---

## Existing Dashboards

### Admin / All-user view: Timeline
- Horizontal Gantt-style grid: rows = drivers, columns = hours (00:00–24:00)
- Single date visible at a time; navigated via prev/next day buttons or date picker in header
- Assignment blocks positioned by CSS `left` and `width` (percentage of `--hour-width`)
- Color-coded by vehicle (Innova: blue, Luxio: green, Polytron: orange, Hiace: purple)
- Block badges: "▶ Jalan" (started), "✓ Selesai" (completed)
- "Now" line tracks current time (updates every 60 seconds)
- Non-working hour shading (before 07:00 and after 20:00)
- Auto-scroll on date change: to nearest assignment, or current time if today, or 08:00 if empty

### Driver personal view: Driver Dashboard (`#driverDashboard`)
- Visible only when logged in as a `driver` role user
- Four sections rendered by `driver-dashboard.js`:
  1. **Berlangsung Sekarang** — assignments with `status === "started"`
  2. **Jadwal Hari Ini** — `date === today` and `status === "assigned"`
  3. **Jadwal Mendatang** — `date > today` and not completed (capped at 20)
  4. **Riwayat** — completed or past-date assignments (capped at 20)
- Card click opens detail modal for start/complete actions

### In-app activity feed: Notifications modal (`#modalNotifications`)
- Lists audit log entries from `/logs` in reverse-chronological order
- Not a true notification inbox — it mirrors the server-side log
- No unread count or badge; icon in sidebar and bottom nav

---

## Existing Navigation

### Desktop (≥769px): Sidebar (`#sidebar`)
- Fixed 240px left column, always visible
- Items: Timeline, Requests (bidang/admin), Users (admin only), Profile
- Active state tracked by CSS class on clicked item

### Mobile (<769px): Bottom navigation (`#bottomNav`) + Drawer sidebar
- Five tabs: Dashboard (driver only), Timeline, Requests, Notifications, Profile
- Sidebar becomes a drawer, toggled by hamburger button
- FAB (floating action button) for "Tambah Jadwal" (admin only)

### Header
- Sticky 56px bar: hamburger (mobile), date navigation (prev/today/next + date picker), search input, user badge
- Search filters timeline in real time by driver name or purpose

### Date navigation
- Previous/next day arrows shift `currentDate` by one day
- "Hari Ini" button jumps to today
- Date input allows arbitrary date selection
- All navigation triggers `renderTimeline()` and `autoFocusTimeline()`

---

## Existing Reusable Components

### Toast notification (`utils.js: showToast`)
- Single `#toast` element, text set and auto-hidden after 2800ms
- Used across all modules via import — the only feedback mechanism for errors and confirmations
- Not queued: a new toast replaces the previous one immediately

### Modal system (pattern, not a shared component)
- Each modal is a `position: fixed` div toggled via `display: flex / none`
- No shared open/close helper — each module manages its own modal lifecycle
- Z-index layering: base modals at 200, stacked odometer modal at 210+

### Accordion (`modal.js`)
- Detail modal uses a CSS-class-toggled accordion for Ringkasan, Detail Tambahan, Info Operasional, Odometer, WA sections
- No shared accordion component — implementation is inline in `modal.js`

### Vehicle badge
- Inline `<span>` with `background-color` from `VEHICLES` map in `drivers.js`
- Rendered in timeline blocks, request list cards, driver dashboard cards, comment context strip
- Not a shared component — each module generates its own badge HTML string

### WhatsApp template generator (`modal.js`)
- Pre-formatted template with driver, vehicle, route, time, PIC, pax
- "Copy" button writes to clipboard via `navigator.clipboard.writeText()`
- Used only in the detail modal

### Validation engine (`validation.js`)
- `ValidationRegistry` with named validators: `request`, `assignment`, `driver`, `vehicle`, `user`, `odometer`, `lifecycle`
- `validate(type, data)` dispatch function
- Pure functions, no DOM or Firebase side effects
- **Not yet wired** to most form submission paths — inline validation still used in `assignments.js` and `requests.js`

### Time input pair (`utils.js: initCustomTimeInputPair`)
- Two separate `<input>` elements (hour / minute) with auto-focus-advance and backspace-retreat
- `getCombinedTimeFromPair()` / `setTimeFieldsFromValue()` for reading and writing
- Shared across assignment form and request form

### ID generator (`utils.js: generateId`)
- `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`
- Used for assignments, requests, comments, log entries
- Collision probability: low for current scale, not cryptographically unique

---

## Current Technical Debt

### Critical

**1. Firebase security rules are incomplete and permissive.**
`firebase-rules.json` grants open read/write to `/assignments` only. All other paths (`/driver_requests`, `/users`, `/logs`, `/backups`) have no declared rules — behavior depends on root-level defaults. In practice the app writes to all these paths, meaning either rules are not deployed from this file or root is open. Any unauthenticated user can read all PIN values from `/users`.

**2. PINs stored in plaintext.**
`/users/{id}.pin` is a 4-digit string with no hashing. Any person with access to Firebase console or who can read the database (given current rules) obtains all PINs immediately.

**3. All authorization is client-side only.**
Role checks (`isAdmin()`, `hasPermission()`) run in the browser. Firebase rules do not enforce role boundaries. A motivated user can call any Firebase path with arbitrary data by opening dev tools.

**4. No session expiry.**
`localStorage` session persists indefinitely. A stolen or shared device retains full access until manual logout.

### High

**5. Validation engine (v1.2.1) is not wired to form submissions.**
`validation.js` contains comprehensive validators for requests, assignments, users, and odometer. The existing `assignments.js` and `requests.js` still use inline validation that partially duplicates this logic. The validation engine is documented as "ready to import" but migration is incomplete.

**6. Driver roster is static in source code.**
`DEFAULT_DRIVERS` in `drivers.js` is a hardcoded array of 3 drivers with phone numbers. Adding or removing a driver requires a code change and redeployment. Driver accounts in Firebase `/users` and driver roster entries are loosely coupled by name string — they can drift out of sync.

**7. Reminder checks require an open browser tab.**
`checkAndSendH1Reminders()` and `checkAndSendHoursReminders()` run on `setInterval` inside the browser. If no admin or driver has the app open, no reminders are sent. There is no server-side scheduler or service worker.

**8. Comments are stored nested inside request documents.**
`request.comments` is an array embedded in the request object. As comment counts grow, every request sync transmits the entire comment history. Firebase Realtime Database has no server-side query or pagination — the full request document (including all comments) is delivered on every update.

**9. `generateId()` is not collision-safe at scale.**
The current ID scheme uses millisecond timestamp + 4 random base-36 characters. Under concurrent writes (multiple users submitting within the same millisecond), collisions are possible. Firebase's `push()` key would be preferable.

### Medium

**10. No offline write queue.**
If Firebase is unreachable when a user submits a form, the assignment saves to `localStorage` but the `saveOneAssignment()` Firebase write fails silently. On next Firebase reconnect, the local state and remote state diverge permanently (the local write is never retried).

**11. `recovery.js` is a legacy archive in the production bundle.**
This module exists for one-time data migration and is never called by current code. It is imported nowhere but ships in the JS directory and is parsed by the browser on load.

**12. Dual CSS files with partial overlap.**
`style.css` (70 KB) is the original design system. `platform.css` (20 KB) is a V2.0 design token layer that overrides font, colors, and adds new utility classes. Some variables are defined in both files with different values. The intended migration path from `style.css` to `platform.css` is incomplete.

**13. `platform.css` is listed as untracked in git.**
Per git status at analysis time, `platform.css` is `??` (untracked). This means it is not committed to version control, which is a deployment risk — a clean checkout would be missing this file and the V2.0 design tokens would not apply.

**14. Inline Firebase config in `index.html`.**
The Firebase API key and project ID are hardcoded in the HTML file. While Firebase API keys are not secret (they identify the project, not authenticate it), the current open database rules mean exposure of the key is a higher risk than it would be with proper security rules in place.

**15. `app.js` does no data pagination.**
All assignments and requests are loaded into memory on startup. For the current scale (small PBSI operations team) this is not a problem, but the pattern does not scale — a year of daily assignments with no archiving will eventually produce noticeable load times.

---

## Migration Risks

### Adding Firebase Authentication (highest impact)

Currently there is no Firebase Auth. Users are identified by `localStorage` session only. Migrating to Firebase Auth (email/password, phone, or anonymous + custom claims) would require:
- Replacing PIN login with Firebase Auth sign-in
- Adding `uid` to all existing user documents or re-keying the `/users` path
- Updating Firebase rules to use `request.auth.uid`
- Invalidating all existing `localStorage` sessions at migration time
- Re-deploying rules without breaking existing active users

Risk: **High**. This is a foundational change. A partial migration (auth on some paths but not others) creates split-brain state.

### Migrating `/users` PIN scheme to hashed credentials

Current PINs are plaintext 4-digit strings. Adding hashing (even bcrypt) requires:
- A server-side component (Firebase Cloud Functions or external API) to do comparison — cannot hash-compare in browser safely
- A forced PIN reset for all users
- A temporary dual-path that accepts both hashed and unhashed during transition

Risk: **Medium**. Operationally disruptive (all users need new PINs) but technically straightforward with Cloud Functions.

### Deploying correct Firebase security rules

The existing `firebase-rules.json` does not cover `/driver_requests`, `/users`, `/logs`, or `/backups`. Deploying rules that restrict these paths to authenticated users or role-based access would immediately break the current application, which uses unauthenticated Firebase reads/writes for all paths.

Risk: **High** if done without Firebase Auth migration first. Low risk as a follow-on step after Auth is in place.

### Moving driver roster to Firebase

Migrating `DEFAULT_DRIVERS` from a static file to `/drivers` in Firebase would allow runtime additions without redeployment. Migration requires:
- A new Firebase path and corresponding admin UI
- Updating all modules that import `DEFAULT_DRIVERS` (validation.js, drivers.js, timeline.js, assignments.js, requests.js)
- Handling the async load of driver data before form initialization
- Decision on what happens to existing assignments whose driver names no longer match any roster entry

Risk: **Medium**. Data migration is straightforward; the async initialization change touches many modules.

### Replacing `setInterval` reminders with server-side scheduling

Moving reminder logic from browser `setInterval` to Firebase Cloud Functions or a cron service:
- Notification logic in `notification-service.js` is already well-separated — it can be extracted
- Deduplication would move from `localStorage` to Firebase (a new `/sent_reminders` path or a flag on each assignment)
- Telegram Bot token would move from client-side code to a server environment variable
- Browser-side reminder checks could be removed entirely

Risk: **Low**. The notification module is already decoupled. The main work is creating the Cloud Function and migrating the deduplication key.

### Wiring the Validation Engine to form submissions

`validation.js` validators exist but inline validation in `assignments.js` and `requests.js` has not been replaced. Full wiring requires:
- Replacing `if (!fieldDriver.value)` style guards with `validateRequest()` / `validateAssignment()` calls
- Surfacing `result.errors[]` and `result.warnings[]` in the form UI (currently only `showToast` is used)
- Verifying that the centralized validators cover all cases the inline logic covers, including edge cases added over time

Risk: **Low**. The validators are already written and tested in isolation. The migration is mechanical but requires careful regression testing.

### Migrating from nested comment arrays to a subcollection

Moving `request.comments` from an embedded array to `/driver_requests/{id}/comments/{commentId}` in Firebase:
- Eliminates the bloat of transmitting full comment history on every request sync
- Requires a new listener on the comments subcollection
- Requires a one-time data migration of all existing embedded comments
- The `comments.js` module would need its `refreshCommentThreadIfOpen` pattern updated

Risk: **Medium**. The data migration is the main risk — existing comments must be moved atomically or with a dual-read period.

### Adopting Firebase `push()` keys for ID generation

Current IDs are generated client-side with `generateId()` (timestamp + random). Switching to Firebase `push()` keys:
- Firebase `push()` returns a key immediately (no round-trip needed)
- Keys are guaranteed unique and time-ordered
- Requires replacing all `generateId()` call sites in assignments, requests, comments, and logs
- Existing data retains old-format IDs — no migration needed (IDs are opaque strings)

Risk: **Low**. Non-breaking change. Old and new ID formats can coexist.
