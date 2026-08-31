# V1 FOLLOW-UP — Operations Timeline: Phase 2 (Overnight Tail + Datetime Auto-focus) + Phase 3 (Continuous / Infinite Multi-Day Timeline)

**Status: NOT committed, NOT pushed, NOT deployed. Awaiting review.**
`js/config.js` `APP_VERSION` untouched (`1.30.12.2`).

Phase 1 (datetime foundation — `assignmentSpan()` as the single source of
truth) is preserved unchanged and is the foundation this builds on.

---

## Part 25 — Architecture analysis (done BEFORE coding)

### 1. How the timeline worked before

- **DOM.** `#timelineBody` (`.timeline-body`, `overflow-x:auto`) is the one
  horizontal scroller. `#timelineHours` mirrors it (`hours.scrollLeft =
  body.scrollLeft` on every `scroll`). Each `.driver-row` is
  `[.driver-label (sticky left, --driver-col)] [.driver-slots]`.
  `.driver-slots` was **hard-coded** `width: calc(24 * var(--hour-width))` —
  exactly one day. Blocks are `position:absolute`, `left =
  startMin/60 * hourWidth` within that single-day slots element.
- **One day per render.** `renderDriverRows()` did `body.innerHTML = ''`,
  then `assignments.filter(a => a.date === currentDate)`, then rebuilt.
  Prev / Next / date-input / "Hari Ini" → `setCurrentDate()` + a **full
  `innerHTML` rebuild** for the new single day (a visible hard swap).
- **Date label.** `updateDateLabel()` set `#timelineDateLabel` from
  `formatDateLong(currentDate)` — a scalar, changed only by the buttons.
- **Auto-focus.** `pickRelevantAssignment(dateAssignments, nowMinutes)` used
  **minutes-of-day** (`timeToMinutes`), pre-filtered to `a.date ===
  currentDate`. Scroll was `body.scrollLeft = px` — **instant** (the "BREEK"
  teleport).

### 2. Why Phase 3 was impossible with that implementation

| Blocker | Detail |
|---|---|
| Single-day canvas | `.driver-slots` is literally `24 * --hour-width` wide. No representation of "next day" exists to scroll into. |
| Date-keyed filter + full rebuild | `a.date === currentDate` + `innerHTML = ''` per render — no windowed multi-day render, no incremental prepend/append. |
| Single-day hour ruler | `#timelineHours` renders a fixed `00:00…24:00`. |
| Label bound to a scalar | `currentDate` is one value; nothing derives a date from scroll position. |
| Prev/Next = hard reset | not a scroll. |
| Minutes-of-day auto-focus | an assignment that started *yesterday* and is active *now* has `a.date !== currentDate` and `endMin < startMin`, so it was invisible to `pickRelevantAssignment` and to `renderDriverRows`. |

### 3. Minimal architecture added (existing architecture EXTENDED, not replaced)

Kept verbatim: `#timelineBody` as the sole scroller; the sticky-label row
model; absolute-`px` blocks; `--hour-width` / `--driver-col` tokens;
`syncTimelineScroll` wheel/touch handling; the `userMovedTimeline` guard; the
bounded-rAF readiness loop (the Phase-1 Bug-2 fix for the async
View-Transition surface); `assignmentSpan()` as the datetime source of truth;
the `renderViews()` pipeline; `getCurrentDate()` for the List/Daftar view.

Added:

- **A bounded, sliding day WINDOW.** `windowStartDate` + `windowDayCount`
  (initial anchor ± 10 days; extends by 10 near an edge; hard cap
  `WINDOW_MAX_DAYS = 63`, past which the far edge is trimmed). `.driver-slots`
  width became `calc(var(--tl-days) * 24 * var(--hour-width))` — `--tl-days`
  set from JS.
- **Absolute canvas minutes.** Every block is placed at `dayIndex * 1440 +
  minuteOfDay` px. An overnight / multi-day assignment is therefore **one
  block** that simply extends across the midnight gridline — no split, no
  duplicate record.
- **Multi-day hour ruler.** `windowDayCount * 24` cells + a per-day divider
  (`.hour-cell--daystart`) carrying a compact date marker.
- **Viewport → date derivation.** A throttled (`requestAnimationFrame`)
  `scroll` handler computes the "dominant day" from `scrollLeft` and updates
  the header label; near an edge it extends the window and **compensates
  `scrollLeft`** so the view never jumps.
- **A smooth-scroll tween** (`easeOutCubic`, distance-scaled 240–650 ms) that
  yields the instant the user starts a manual scroll.
- **Datetime auto-focus.** `pickRelevantAssignment(assignments, now: Date)`
  ranks by absolute `startDateTime`/`endDateTime` via `assignmentSpan()`.

No new timeline module. No second datetime parser. No new Firebase query
architecture (the in-memory `assignments` array is still the only source; only
*rendering* is windowed).

---

## Part 26 — Final report (18 items)

### 1. Root cause — the overnight next-day tail was missing

`renderDriverRows()` filtered `assignments.filter(a => a.date ===
currentDate)` and drew into a `.driver-slots` exactly 24 h wide. An overnight
record (`date` = the start day) only ever matched its **start** day, and even
there Phase 1 could only clip it at 24:00. There was no canvas for the next
day's portion to live on.

**Fix:** the canvas is now `windowDayCount` days wide. `renderDriverRows()`
selects assignments whose **datetime span overlaps the window**
(`s.startDateTime < windowEnd && s.endDateTime > windowStart`) and
`createAssignmentBlock()` positions the block at `dateToDayIndex(span.startDate)
* 1440 + span.startMin` … `dateToDayIndex(span.endDate) * 1440 + span.endMin`
(absolute canvas minutes). The block spans the midnight seam **continuously**
— one element, one `data-id`, one click target. Clicking any part of it (incl.
past midnight) opens the same assignment.

### 2. Root cause — auto-focus could not find an assignment that started yesterday

`pickRelevantAssignment(dateAssignments, nowMinutes)` took a list
pre-filtered to `currentDate` and compared **minutes-of-day**. An overnight
trip `31 Aug 23:30 → 1 Sep 01:30` viewed on `1 Sep` was neither in
`dateAssignments` (its `date` is `31 Aug`) nor "running" by minutes
(`endMin 90 < startMin 1410`).

**Fix:** `pickRelevantAssignment(candidates, now: Date)` now takes the whole
dataset + a `Date`, builds each `assignmentSpan()`, and ranks by absolute
datetime:
**A** `startDateTime <= now < endDateTime` (active — ties broken by earliest
`endDateTime`) → **B** smallest `startDateTime > now` (next upcoming) →
**C** largest `endDateTime <= now` (nearest previous) → **D** `null`
(caller falls back to "now"). Cancelled assignments are never chosen.

### 3. Next-day tail rendering — implementation

`createAssignmentBlock()` (rewritten): `assignmentSpan()` → absolute canvas
`startAbs`/`endAbs` → `left`, `width`. Actual-time adjustment (`startedAt` /
`completedAt`) converts each ISO stamp through its **own real local date**
(`isoLocalParts` → `dateToDayIndex`), so a genuinely cross-midnight *engaged*
window is handled too. Clipping is applied **only** when `left < 0` (→
`.continues-prev-day`, a « chevron) or `left + width > canvasWidth` (→
`.continues-next-day`, a » chevron). An in-window midnight crossing gets
`.spans-midnight` + a `--midnight-x` tick at the seam — one card, not two.

### 4. Full-datetime viewport overlap — implementation

Everywhere a "does this belong on screen / near this date" question is asked
it is now a span-overlap test, never `=== currentDate`:
`renderDriverRows()` (window overlap), `_focusPxForDate()` (per-date nav
target: assignments whose span overlaps `[date 00:00, date+1 00:00)`),
`_isNowInView()` ("Hari Ini" enabled state). All go through `assignmentSpan()`.

### 5. Smooth auto-focus — implementation

`smoothScrollTimelineTo(targetPx, {onDone})` — a `requestAnimationFrame`
tween, `easeOutCubic`, duration `clamp(|distance| * 0.4, 240, 650) ms`,
mirroring `#timelineHours` each frame. `_autoFocusTick()` (still inside the
bounded readiness loop that waits for the async View-Transition surface to be
laid out) now calls this instead of `body.scrollLeft = px`. It verifies the
scroll actually landed (`|scrollLeft − target| <= 6`, or clamped) in `onDone`
before latching `lastFocusAnchor`.

### 6. Manual scroll interruption — behaviour

The tween's per-frame `step()` returns early if `!_smoothActive` **or**
`userMovedTimeline`. `cancelSmoothScroll()` is called synchronously by the
`wheel`, `touchmove` and `pointerdown` handlers. So the instant the user
touches the timeline the animation stops and never resumes or pulls back
toward the old target. The pre-existing `userMovedTimeline` protection is
kept and extended (it also now blocks `renderTimeline()`'s auto-focus block).

### 7. Infinite timeline — architecture

A **windowed** render over the existing in-memory `assignments` array
(`buildWindow`, `ensureDateInWindow`, `maybeExtendWindow`). `--tl-days` on
`#timelineBody` drives the canvas width via CSS `calc()`. The window is a
contiguous run of calendar days; there is **no** ±N-day UX limit — you can
keep scrolling either direction and it keeps extending — but the **rendered**
DOM is bounded (`WINDOW_MAX_DAYS = 63`; past it the far edge is trimmed and
`scrollLeft` compensated).

### 8. Windowed data loading

No new data path. The Firebase `onValue('/assignments')` feed already loads
the full set into memory; only **rendering** is windowed. `renderDriverRows`
includes every assignment whose `assignmentSpan()` overlaps the window range,
so an assignment that *started before* the window but still overlaps it is
drawn (left-clipped with the « chevron). If a future scale problem appears,
`buildWindow` / `maybeExtendWindow` are the single place to add a
range-scoped repository read — the render contract already expects a subset.

### 9. Scroll-position preservation

On **prepend** (`windowStartDate` moves back `N` days) the canvas grows by
`N * dayWidthPx` on the left, so `syncViewportDate()` sets `body.scrollLeft +=
N * dayWidthPx` (and mirrors `#timelineHours`, and shifts `_desiredScrollPx`)
immediately after the re-render. On a **far-edge trim** the compensation is
negative. `renderDriverRows()` also captures `body.scrollLeft` before its
`innerHTML` wipe and restores it after — so a Firebase refresh never moves the
view either. **Verified:** a fixed landmark block stays within ±4 px of its
on-screen position across a prepend.

### 10. Date-header synchronisation

`syncViewportDate()` (rAF-throttled off the `scroll` event) computes the
"dominant day" as `floor((scrollLeft + min(clientWidth*0.35, dayWidth*0.5)) /
dayWidth)` and, when it changes, calls `updateDateLabel()` — which:

- rewrites `#timelineDateLabel` (the label inside the "Papan Jadwal" card) via
  `formatDateLong(viewportDate)`;
- sets `#filterDate.value = viewportDate` (assigning `.value` does **not** fire
  the input's `change` listener, so there is no `goToDate()` feedback loop);
- fires the new `registerViewportDateCallback(fn)` hook, which `app.js`
  (`_initAllPbsiDatepickers`) uses to `syncPbsiDatepicker(#filterDate)` — so the
  **styled PBSI date control in the top header** (`📅 Sen, 31 Agu 2026`, the
  one between the ← → arrows) refreshes its visible trigger text too. That
  control wraps `#filterDate` and, like the old code path for the nav buttons,
  needs an explicit `syncPbsiDatepicker()` because a bare `.value` write leaves
  its rendered button stale. The hook deliberately does **not** re-render the
  List/Daftar view (that follows the explicit anchor only — item 18.5).

All three update *during* a smooth animation too (the tween mirrors hours +
fires `scroll` each frame). No per-pixel work: one rAF-coalesced write per day
boundary crossed.

### 11. Prev / Next behaviour

Kept as buttons; now smooth-scroll shortcuts. `btnPrev` / `btnNext` →
`goToDate(offsetDate(viewportDate, ∓1))` (relative to what you *see*, not a
stale anchor). `goToDate` rebuilds the window **only** if the target is
outside it (`ensureDateInWindow`, margin 2) — otherwise it is a pure
`smoothScrollTimelineTo(_focusPxForDate(target))`. It also updates
`currentDate` and fires `onDateChange` so the List/Daftar view stays in step.

### 12. Calendar behaviour

`#filterDate` `change` → the same `goToDate(input.value)`: smooth-scroll to
that date's relevant assignment (or 08:00 if none), rebuild only if outside
the window. After it, infinite scroll in either direction still works.

### 13. "Hari Ini" behaviour

`goToDate(todayString())`. `_focusPxForDate` takes the today branch → picks
the operationally-relevant assignment for **now** across the dataset (an
active overnight trip that started yesterday qualifies), else positions at the
actual current minute — never 00:00, never the last scroll position. The
button is enabled whenever `viewportDate !== today` **or** the now-line is
scrolled out of view (`_isNowInView()`), so it can always re-centre on now.

### 14. Files changed

| File | Change |
|---|---|
| `js/timeline.js` | Core rewrite: window state + geometry, `assignmentSpan`-based multi-day `createAssignmentBlock`, datetime `pickRelevantAssignment`, `smoothScrollTimelineTo`, `syncViewportDate` + `maybeExtendWindow`, viewport-driven `updateDateLabel` (+ `#filterDate.value` + a new `registerViewportDateCallback` hook), smooth `goToDate`. New exports: `dateToDayIndex`, `canvasMinutesToDateTime`, `getWindowStartDate`, `getViewportDate`, `registerViewportDateCallback`. |
| `js/timeline-interactions.js` | Drag / resize / paste / context-menu math converted from minute-of-day to **absolute canvas minutes** via `canvasMinutesToDateTime` / `dateToDayIndex`; drag can now cross a day boundary (resolves the real drop date) and roll past midnight (overnight); resize capped at ≤ one overnight; paste near end-of-day rolls over instead of truncating. |
| `js/app.js` | `_initAllPbsiDatepickers()` also registers `registerViewportDateCallback(() => syncPbsiDatepicker(#filterDate))` so the top-header PBSI date control tracks a free scroll, not only the nav buttons. (The `js/app.js` diff also carries the Operations bug-fix package — unchanged this pass.) |
| `style.css` | `.driver-slots` width → `calc(var(--tl-days,1) * 24 * --hour-width)`; day-seam gridline layer on `.driver-slots::before`; `.hour-cell--daystart` divider + date marker; `.hour-cell--endcap`; `.assignment-block.continues-prev-day` (« mirror of the » clip); `.assignment-block.spans-midnight` seam tick. |
| `js/utils.js`, `js/validation.js`, `js/assignments.js`, `index.html`, `platform.css` | **Phase 1 only** — unchanged this pass (still in the same working tree). |
| `js/components/drawer.js`, `js/modal.js` | **Operations bug-fix package** — unchanged this pass. |

### 15. Tests run — exact results

**New (Phase 2/3):**

| Suite | Result | What |
|---|---|---|
| `scripts/timeline-multiday-render-check.mjs` | **33 / 0** | real render: 21-day canvas, 505 ruler cells, 21 day markers; overnight = ONE block, ONE id, `.spans-midnight`, true-time label, `--midnight-x` tick; same-day byte-identical; window-edge « / » clips; **no page-level h-overflow**; exported canvas helpers round-trip; interactions use them |
| `scripts/timeline-continuous-scroll-check.mjs` | **23 / 0** | header, the `#filterDate` value **and the `registerViewportDateCallback` hook** (which refreshes the top-header PBSI date control) all follow the viewport on a plain scroll; crossing midnight is continuous (no reset, no rebuild); window extends near an edge, bounded ≤ 63; **prepend preserves on-screen position within ±4 px**; Prev/Next/calendar are animated (≥5 distinct samples, a real intermediate frame); a wheel gesture mid-animation cancels it with no fight-back; "Hari Ini" returns to today + now; calendar is a scroll shortcut |
| `scripts/timeline-autofocus-datetime-check.mjs` | **11 / 0** | `pickRelevantAssignment` datetime ranking A/B/C/D incl. **overnight-started-yesterday = active**; real board auto-scrolls (smoothly, with intermediate positions) so the active trip is in view |
| `scripts/timeline-responsive-check.mjs` | **56 / 0** | 320 / 375 / 390 / 430 / 475 / 768 / 1024 / 1440 — no doc h-overflow, `#timelineBody` owns the scroll, label visible, card not row-clipped, day markers render, scroll moves the header |

**Updated:** `scripts/overnight-assignment-check.mjs` **68 / 0** (section D
rewritten for the continuous model; sections A–C/E unchanged).
**Deleted (superseded):** `scripts/timeline-autofocus-check.mjs` and
`scripts/overnight-timeline-block-check.mjs` — both asserted the Phase-1
one-day 24:00-clip model that Phase 2/3 replaces; their behaviour is now
covered by the four suites above (async-surface auto-focus, date-nav
re-focus, overnight rendering).

**Regression sweep — all green, 0 regressions:**

`smoke-boot` PASS · `startup-stability-check` 8/0 ·
`overnight-conflict-dom-check` 18/0 · `assignment-start-flow-check` 9/0
(Bug 1) · `drawer-overlay-pointer-safety-check` 35/0 (Bug 3) ·
`self-drive-assignment-check` 42/0 · `worktime-check` 40/0 ·
`vehicle-timeline-check` 44/0 · `drawer-consolidation-check` 67/0 ·
`delete-confirm-drawer-check` 16/0 · `home-generate-live-preview-check` 9/0 ·
`nor-center-generate-redirect-check` 14/0 · `nor-composition-check` 24/0 ·
`north-star-acceptance-check` 38/0 · `gudang-ui-smoke` PASS.

Pre-existing unrelated failure (present on clean `main`):
`scripts/gudang-security-check.mjs` (`JSON.parse` on comment-containing
`database.rules.json`).

### 16. Browser viewport tests

Every timeline suite above runs in headless Chromium against the **real**
`style.css` + `platform.css` and the async-visibility `#v2TimelineSurface`
shell. The infinite-scroll verification (`timeline-continuous-scroll-check`)
does exactly the Part-24 flow: opens the board → records the date → scrolls
right across midnight → asserts the header advanced and `scrollLeft` strictly
increased (no snap-back) → asserts a distinct label per day → scrolls back →
asserts the label returns → asserts a prepend near the left edge did **not**
jump a landmark's on-screen x → drives an overnight assignment → clicks "Hari
Ini" and asserts it returns to today with the now-position in view. Smooth
scroll is verified by **sampling `scrollLeft` every animation frame** and
asserting ≥ 5 distinct values with at least one strictly between start and end
— i.e. never `initial → target` in one jump.

### 17. Console-error result

Zero unexpected console / page errors across every suite (the one pre-auth
Firebase "Permission denied" line in `smoke-boot` is expected and documented).
No duplicate event listeners: `syncTimelineScroll` still binds once behind
`window.timelineScrollInitialized`; `#timelineBody` is never replaced (only
its `innerHTML`), so its `scroll` / `pointerdown` / `touchmove` / wheel
listeners survive every re-render; `initDateControls` binds the four buttons
once.

### 18. Limitations

1. **Window bound = 63 rendered days.** Beyond that the far edge is trimmed
   and the scroll compensated — the UX is still infinite, but a single
   uninterrupted drag can only span ~9 weeks of DOM before the trim kicks in.
   Tunable via `WINDOW_MAX_DAYS`.
2. **Extend re-renders the rows** (`renderHourHeaders` + `renderDriverRows`)
   once per ~10 days scrolled — not per frame, but it is a full rebuild of
   the (bounded) canvas at that moment. On a very fast fling a brief hitch is
   possible on low-end devices; the trigger is eager (3 days from the edge) to
   hide it. A fully incremental prepend/append is a future refinement.
3. **`.spans-midnight` tick** marks only the **first** day-seam a block
   crosses (a >24 h assignment crossing two midnights shows one tick). Cosmetic.
4. **Drag across a day boundary** now reassigns the date (a real new
   capability). A resize is capped at ≤ one overnight (`startAbs + 1439`) so
   it can never produce a +2-day span; a drag is not capped (you can drop a
   block on any visible day). If review wants drag constrained to same-day
   unless a modifier is held, that is a one-line clamp in `onDragMove`.
5. **List/Daftar view** still follows the explicit anchor (`getCurrentDate()`),
   not the scroll viewport — it updates on Prev/Next/calendar/"Hari Ini", not
   on a free scroll. Deliberate (avoids thrashing the list while scrolling).
6. Real-device pass (iOS Safari / Android Chrome momentum scrolling + dynamic
   URL bar) recommended in review — headless has no fling physics or dynamic
   chrome.

---

## Review checklist

- [ ] Existing architecture extended, not replaced — confirm no second
  timeline module / no second datetime parser (`assignmentSpan()` is still
  the only one).
- [ ] Overnight assignment = ONE record, ONE `data-id` from both sides of
  midnight (33/0 render test).
- [ ] Auto-focus finds an assignment that started yesterday and is active now
  (11/0 datetime test) and animates rather than teleports.
- [ ] Prepend near the left edge does not jump the view (±4 px, 20/0 test).
- [ ] Nothing committed / pushed / deployed; version still `1.30.12.2`.
- [ ] Decision: is the drag-across-days behaviour (item 18.4) wanted as-is?
