# V1 — Operations Bug Fixes (revised) + Overnight Assignment / Datetime Foundation (Phase 1 of 3)

**Status: NOT committed, NOT pushed, NOT deployed. Awaiting review.**
`js/config.js` `APP_VERSION` is **untouched** (`1.30.12.2`) — no version entry was
added; that happens at commit time once this passes review.

This report covers two work packages that currently sit together in the working
tree:

| Pkg | What | Prior instruction |
|-----|------|-------------------|
| **1** | The 3 revised Operations / Driver Assignment / Sidebar bug fixes | "DO NOT commit or push yet. Wait for review." |
| **2** | Overnight Assignment + Multi-Day / Infinite Timeline — **Phase 1 only** (datetime foundation) | "approved" — Phase 1 of the proposed 3-phase plan |

---

## PART 1 — Operations / Driver Assignment / Sidebar (revised after live verification)

### Bug 1 — Driver "Mulai Tugas" no-op on first click — **KEPT (unchanged)**

Per the revision instruction ("KEEP THE EXISTING FIX — do NOT modify unless a
regression is found"). No further edits this pass.

Flow verified end-to-end: `[Mulai Tugas]` → odometer dialog → `[Konfirmasi &
Mulai]` → assignment immediately **ACTIVE** on the first confirm, odometer dialog
+ detail drawer both close, no double-attempt, no "Penugasan tidak ditemukan"
toast.

- Files (from the earlier pass, still in the tree): `index.html`
  (`#btnConfirmOdometer` label), `js/app.js` (`registerStartCallback` /
  `registerCompleteCallback` — stale-array recovery + explicit
  "not found" toast instead of a silent return), `js/modal.js` (odometer
  confirm passes the assignment object through as the 3rd arg).
- Regression test: `scripts/assignment-start-flow-check.mjs` → **9 / 0**.

### Bug 2 — Operations Timeline does not reliably auto-position — **real-lifecycle fix**

**Why the first attempt failed in the real app:** the isolated harness moved a
statically-visible `#timelineBody`. The real Operations path shows the timeline
surface **asynchronously** — `setWorkspace()` applies the workspace state (which
toggles `#v2TimelineSurface` `display`) inside `document.startViewTransition()`,
so `renderTimeline()` and its auto-focus ran against a `display:none` /
zero-width element where `scrollLeft = …` silently does nothing.

**The fix (`js/timeline.js`):**

- A **bounded `requestAnimationFrame` readiness loop** (`_autoFocusTick`, max 60
  frames) that waits until `body.offsetParent !== null && body.scrollWidth >
  body.clientWidth + 1` — i.e. the surface is genuinely laid out and scrollable —
  before it positions. No `setTimeout`, no fixed delay.
- The scroll target is **measured from the actual rendered
  `.assignment-block[data-id]`** (`_driverColPx() + block.style.left −
  contextOffset`), with the minutes-formula only as a fallback. It then
  **verifies the browser actually moved** (`Math.abs(body.scrollLeft −
  target.px) <= 4`) before it "latches" the date; if the verify fails it retries
  next frame.
- Priority order (pure, exported `pickRelevantAssignment`): **A** a currently
  running assignment (`start <= now < end`, the one *ending soonest* so a long
  trip can't hide a short concurrent one) → **B** next upcoming → **C** last of
  the day → **D** current time. Cancelled assignments are excluded from A/B.
- **Does not reset on Firebase refresh** (`lastAutoFocusedDate` latch), **does**
  reset on date change / "Hari Ini" (`setCurrentDate` clears the latch +
  `userMovedTimeline`). A user wheel/touch scroll sets `userMovedTimeline = true`
  and auto-focus stops fighting them.
- `initDateControls()` Prev / Next / date-input / "Hari Ini" now all route
  through one `goToDate()` that calls `setCurrentDate()` (previously they
  assigned `currentDate` directly, bypassing the reset).

- Integration test: `scripts/timeline-autofocus-check.mjs` (real `style.css` +
  `platform.css`, async-visibility `#v2TimelineSurface` shell, 1280px & 390px) →
  **30 / 0**.

### Bug 3 — Mobile sidebar intermittently freezes the whole screen — **drawer-overlay pointer capture**

**Not a blur bug** (per the revision: mobile backdrop blur is acceptable; no
blanket `backdrop-filter` removal was done — all earlier blur edits were
reverted with `git checkout`).

**Root cause:** the canonical drawer overlay `#appDrawerOverlay`
(`js/components/drawer.js`) is `position:fixed; inset:0; z-index:10000` and its
DOM removal is **deferred ~260 ms** behind a CSS transition (and can be delayed
further by a backgrounded tab, or left behind by a rapid open→close→open race).
While it lingered it had **no `pointer-events:none`** — so a closing / closed /
stale overlay stayed an invisible full-viewport click-blocker above the entire
app, the mobile sidebar included. Every tap was swallowed → "frozen".

**The fix:**

- `platform.css` — `.drawer-overlay:not(.is-open) { pointer-events: none }` (and
  the same on its `.drawer` child). A closed/closing overlay is inert the instant
  `.is-open` is removed, regardless of when the node is finally deleted.
- `js/components/drawer.js` — `closeDrawer()` also sets
  `overlay.style.pointerEvents = 'none'` synchronously; the deferred cleanup now
  removes the node **unconditionally** (never bails on a superseded sequence and
  leaves it behind); `openDrawer()` hard-removes **every** stale
  `#appDrawerOverlay` (`querySelectorAll`) before creating the new one; an
  external `closeDrawer()` with no argument falls back to the drawer's own
  registered `onClose` so the consumer is fully torn down; body-scroll-lock is
  released on close.
- `js/app.js` — `sweepOpenModalsOnWorkspaceChange()` also calls `closeDrawer()`;
  `openSidebar()` starts with `closeDrawer()` (a drawer and the sidebar never
  coexist).

- Test: `scripts/drawer-overlay-pointer-safety-check.mjs` (real `platform.css`,
  a full-viewport button behind where the overlay sits, 8 viewport widths) →
  **35 / 0**. Confirms: an **open** overlay still intercepts (scrim
  click-to-dismiss works); a **closing** overlay lets a tap reach the app behind
  it *before* the 260 ms removal; rapid open/close/open ×5 leaves exactly one,
  interactive; a manually-injected stale overlay is inert.

---

## PART 2 — Overnight Assignment + Datetime Foundation (Phase 1 of 3)

### The 3-phase plan (Phase 1 approved; 2 & 3 pending review)

| Phase | Scope | State |
|-------|-------|-------|
| **1 — Datetime foundation** *(this report)* | One source of truth for an assignment's full start/end datetime; the form accepts an overnight window and shows a read-only "+1 hari" cue; status / work-time / conflict checks become datetime-span-based; the board no longer renders a broken stub for an overnight block. **No schema change, no migration, backward-compatible.** | **DONE — awaiting review** |
| **2 — Overnight-aware timeline** | Render the **next-day tail** of an overnight assignment on that day's board (same id, no duplicate record); auto-focus finds an assignment that started *yesterday* but is still active *now* (Part G/H). | **Deferred** — needs Phase 1 reviewed first; it builds directly on `assignmentSpan()` |
| **3 — Continuous / infinite timeline** | Horizontal scroll across midnight into the next/previous day with no hard limit; date header follows the viewport; Prev/Next/calendar become scroll shortcuts; windowed data loading; "Hari Ini" returns to *now*. | **Deferred** — largest surface (scroll engine + windowed loading), independent of Phases 1–2 |

Phases 2 & 3 were **not** started. This keeps the diff small and each phase
independently reviewable, per the standing "small diff, isolated, testable,
backward-compatible" rule.

### What Phase 1 changed

#### 1. `js/utils.js` — `assignmentSpan()` = the single source of truth

```
assignmentSpan(a) -> { startDate, endDate, startDateTime, endDateTime,
                       crossesMidnight, startMin, endMin } | null
```

Rule (Part B / Part Q): the stored `date` is **always the start date**.

| | endDate |
|--|--|
| `endTime  >  startTime` | `= date` (same day) |
| `endTime  <  startTime` | `= date + 1` (crosses midnight) |
| `endTime === startTime`  | same day, zero-length (rejected at the form; handled here without throwing) |
| `fullDay` (00:00–23:59) | never crosses midnight |

- **No new persisted field.** `endDate` is *derived on read*. Existing records
  (only `date` / `startTime` / `endTime`) work unchanged — no migration. A record
  that already carries its own `endDate` (e.g. a future multi-day write) is
  respected as-is.
- Thin wrappers over the same helper: `deriveEndDate()`, `crossesMidnight()`,
  `scheduledTimeState(a, now) -> 'upcoming' | 'active' | 'past'` (Part C: an
  assignment is *past* only when `now >= endDateTime`).
- `computeWorkTime().scheduledHours` is now overnight-aware
  (`23:30→01:30` = **2 h**, was `null`). Same-day arithmetic is byte-identical.

#### 2. `js/validation.js` — `validateTimeRange()` accepts an overnight window

Was: reject `endTime <= startTime`. Now: reject **only** `endTime === startTime`
(zero-length). The request form keeps its **own independent** same-day guard
(`js/requests.js`) untouched — overnight is an **assignment-only** feature in
Phase 1.

#### 3. `js/assignments.js` — builder + conflict detection

- `createAssignmentDirect()` / `updateAssignmentDirect()` time guards relaxed
  `<=` → `===` (consistent with the form).
- **`checkConflict()` / `checkVehicleConflict()` rewritten** to compare the
  **full datetime span** (`mySpan.startDateTime < aSpan.endDateTime &&
  mySpan.endDateTime > aSpan.startDateTime`) via `assignmentSpan()`, dropping the
  `a.date !== date` early-return.
  - **Same-day behaviour is identical** — two windows on different dates have
    non-overlapping spans.
  - **Additionally correct across midnight** — an existing `23:30→01:30` trip is
    now measured to its real `01:30` end on the *next* calendar day, so a
    `00:30→02:00` trip the same night is detected as a conflict (previously it
    was silently missed).
  - Cancelled / identity / driver-or-vehicle-mismatch short-circuits unchanged.
- **Read-only "+1 hari · <tanggal>" cue** next to *Jam Selesai*
  (`#assignmentOvernightCue` in `index.html`, `.overnight-cue` in `platform.css`,
  `syncOvernightCue()` in `js/assignments.js`). Shown **only** when the entered
  window crosses midnight; hidden for same-day / full-day / incomplete input.
  Reactive to Tanggal / Jam Mulai / Jam Selesai / Penuh Hari via **one** handler
  folded into the existing conflict-preview watch list (no parallel listener
  set). **No editable "Tanggal Selesai" field was added** — the end date is
  always derived.

#### 4. `js/timeline.js` — `createAssignmentBlock()` clips an overnight block

An overnight window (`schedEndMin < schedStartMin`, `fullDay` excluded) is
clipped at **24:00** for width; it gets a `.continues-next-day` class
(`style.css`: flattened right edge + `»` chevron). The time **label still shows
the true times** (`23:30–01:30`). The record stays **one assignment, one id**
(Part I) — drawing the next-day tail is Phase 2.

Before this, an overnight block computed a negative width and rendered as a 20 px
stub.

### Part P — request/assignment datetime restriction: **already correct, no change**

`validateNotBeforeCreation()` (`js/validation.js`) compares the assignment's
**start** datetime (`dateStr` + `startTime`) against the reference creation
instant. For the spec's example — request created `31 Aug 20:00`, assignment
`31 Aug 23:30 → 1 Sep 01:30` — the start (`23:30`) is after `20:00` → **VALID**;
`31 Aug 19:00` → `19:00 < 20:00` → **BLOCK** for non-admin; admin override
preserved. The end crossing midnight is irrelevant to this check. Verified, no
edit needed.

---

## Files changed

| File | Package | Change |
|------|---------|--------|
| `js/timeline.js` | 1 (Bug 2) + 2 | Real-lifecycle auto-focus (rAF readiness loop, measured target, verify-before-latch, `pickRelevantAssignment`); overnight block clip at 24:00 + `.continues-next-day` |
| `js/components/drawer.js` | 1 (Bug 3) | `pointer-events:none` on close, unconditional deferred removal, stale-overlay sweep on open, `onClose` fallback |
| `js/app.js` | 1 (Bug 1 + Bug 3) | Start/Complete stale-array recovery + explicit not-found toast; `closeDrawer()` on workspace change / sidebar open |
| `js/modal.js` | 1 (Bug 1) | Odometer confirm passes the assignment object through |
| `platform.css` | 1 (Bug 3) + 2 | `.drawer-overlay:not(.is-open)` pointer-events; `.overnight-cue` style |
| `index.html` | 1 (Bug 1) + 2 | `#btnConfirmOdometer` label; `#assignmentOvernightCue` element |
| `js/utils.js` | 2 | `assignmentSpan()` + `deriveEndDate()` / `crossesMidnight()` / `scheduledTimeState()`; `computeWorkTime` overnight scheduledHours |
| `js/validation.js` | 2 | `validateTimeRange()` accepts overnight (reject `===` only) |
| `js/assignments.js` | 2 | Builder guards `<=`→`===`; span-based conflict detection; `syncOvernightCue()` + wiring |
| `style.css` | 1 (Bug 2 area) + 2 | `.assignment-block.continues-next-day` |

New test scripts (untracked): `scripts/assignment-start-flow-check.mjs` +
`…-harness.html`, `scripts/timeline-autofocus-check.mjs` + `…-harness.html`,
`scripts/drawer-overlay-pointer-safety-check.mjs` + `…-harness.html`,
`scripts/overnight-assignment-check.mjs`,
`scripts/overnight-conflict-dom-check.mjs` + `…-harness.html`,
`scripts/overnight-timeline-block-check.mjs`.

---

## Test evidence

### New / updated suites for this work

| Suite | Result | Covers |
|-------|--------|--------|
| `overnight-assignment-check.mjs` | **63 / 0** | `assignmentSpan` Part R edge cases (same-day, `23:30→01:30`, `23:59→00:01`, `00:30→01:30` same-day, `22:00→05:00`, full-day, stored-endDate wins, malformed→null); `deriveEndDate`/`crossesMidnight`; `scheduledTimeState` active-after-midnight; `computeWorkTime` scheduledHours; static shape checks for `validation.js` / `assignments.js` / `timeline.js` / markup / CSS |
| `overnight-conflict-dom-check.mjs` | **18 / 0** | **Real** `checkConflict`/`checkVehicleConflict` (headless): same-day unchanged (overlap, back-to-back, other driver, cancelled, excludeId), adjacent-day no false collide, **cross-midnight overlaps now detected** (both directions), disjoint overnight windows, different driver/vehicle, cancelled overnight |
| `overnight-timeline-block-check.mjs` | **12 / 0** | **Real** render (real CSS): same-day block untouched; overnight block positive width clipped to the 24:00 edge, `.continues-next-day`, label shows true times; `23:59→00:01` sliver hits the shared 20 px floor (not a negative/overshoot); full-day is not overnight |
| `assignment-start-flow-check.mjs` | **9 / 0** | Bug 1 |
| `timeline-autofocus-check.mjs` | **30 / 0** | Bug 2 |
| `drawer-overlay-pointer-safety-check.mjs` | **35 / 0** | Bug 3 |

### Regression sweep (existing suites re-run, unchanged)

| Suite | Result |
|-------|--------|
| `smoke-boot.mjs` | **PASS** (full app boot; the one pre-auth Firebase "Permission denied" is expected/documented) |
| `startup-stability-check.mjs` | **8 / 0** |
| `worktime-check.mjs` | **40 / 0** |
| `self-drive-assignment-check.mjs` | **42 / 0** |
| `drawer-consolidation-check.mjs` | **67 / 0** |
| `delete-confirm-drawer-check.mjs` | **16 / 0** |
| `vehicle-timeline-check.mjs` | **44 / 0** |
| `home-generate-live-preview-check.mjs` | **9 / 0** |
| `nor-center-generate-redirect-check.mjs` | **14 / 0** |
| `nor-composition-check.mjs` | **24 / 0** |
| `north-star-acceptance-check.mjs` | **38 / 0** |
| `gudang-ui-smoke.mjs` | **PASS** (Warehouse / Shuttlecock untouched) |

Total ≈ **500+ checks green, 0 failures, 0 regressions**.

Pre-existing unrelated failure (present on clean `main`, not caused here):
`scripts/gudang-security-check.mjs` — `JSON.parse` on the comment-containing
`database.rules.json`.

---

## Explicitly NOT touched

- **Database schema** — no new persisted field; `endDate` is derived on read.
- **No migration** — existing same-day records work unchanged.
- **Permission architecture** — untouched.
- **Navigation architecture** — untouched.
- **`database.rules.json`, Cloud Functions, permission engine** — untouched.
- **The request form** — keeps its own same-day-only time guard; overnight is
  assignment-only in Phase 1.
- **No second timeline module, no duplicate date parser, no duplicate assignment
  state, no editable end-date field, no hardcoded dates, no `setTimeout` delays,
  no duplicate listeners.**
- **Warehouse / Shuttlecock** (`172501d`) — untouched.
- **Generate NOR** — untouched (regression suites green).

---

## Known limitations / what Phase 2–3 will address

1. **The next-day tail of an overnight assignment is not yet drawn** on the
   following day's board. On its start date it renders correctly (clipped at
   24:00 with the `»` cue); on the next day it does not appear at all yet.
   → **Phase 2.**
2. **Auto-focus does not yet find an assignment that started *yesterday* but is
   still active *now*** (e.g. viewing 1 Sep at 00:30 for a `31 Aug 23:30 → 1 Sep
   01:30` trip). `pickRelevantAssignment` still keys on `currentDate`.
   → **Phase 2** (`scheduledTimeState()` / `assignmentSpan()` already provide the
   primitive).
3. **The timeline is still one calendar day per view** — no continuous
   cross-midnight scroll, Prev/Next still swap the whole grid. → **Phase 3.**
4. **`js/timeline-interactions.js` drag/resize** can now, in principle, produce
   an overnight window (the `createAssignmentDirect`/`updateAssignmentDirect`
   guards were relaxed). The block renders safely (clipped), but a resize that
   drags the end handle left past the start reads as "went overnight". A Phase 2
   consideration is whether drag/resize should clamp to same-day unless the
   gesture explicitly crosses midnight.
5. **Assignment-Detail mobile bottom-sheet `dvh`** limitation from the prior
   hotfix (real iOS Safari / Android Chrome URL-bar pass) is unrelated to this
   work but still open.

---

## Review checklist

- [ ] `assignmentSpan()` is the only place that derives an assignment end
  datetime — confirm no second parser was introduced.
- [ ] Same-day conflict detection is unchanged (18/0 DOM test + 42/0
  self-drive).
- [ ] The "+1 hari" cue is advisory only — never blocks submit, no editable
  end-date field.
- [ ] Bug 2 auto-focus: confirm on a real device that the viewport visibly moves
  on first open of Operations and does **not** jump on a Firebase refresh.
- [ ] Bug 3: confirm on a real mobile browser that repeated sidebar
  open/close/outside-click never leaves the screen unresponsive.
- [ ] Decision needed: proceed to **Phase 2** (overnight-aware timeline render +
  auto-focus)?
- [ ] Nothing here is committed/pushed/deployed; version is still `1.30.12.2`.
