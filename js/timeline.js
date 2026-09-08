/* ============================================================
   TIMELINE.JS — Timeline Scheduler Rendering

   V1 FOLLOW-UP (Phase 2 + Phase 3): the board is a CONTINUOUS, multi-day
   canvas. #timelineBody scrolls a strip `windowDayCount` days wide; every
   assignment block is positioned in ABSOLUTE canvas minutes
   (dayIndex * 1440 + minuteOfDay), so an overnight / multi-day assignment is
   ONE block, ONE id, spanning the midnight gridline — no duplicate record,
   no per-day clipping (clipping only ever happens at the WINDOW edge).

   The window is bounded for performance and slides / extends as the user
   scrolls toward either edge (infinite feel, bounded DOM). The date header
   (#timelineDateLabel) follows the scroll VIEWPORT, not an explicit
   selection. Prev / Next / calendar / "Hari Ini" are smooth-scroll
   shortcuts. Auto-focus resolves the operationally-relevant assignment by
   ABSOLUTE datetime (assignmentSpan) — an overnight trip that started
   yesterday but is active now IS found.

   Single source of truth for an assignment's datetime span: js/utils.js
   assignmentSpan(). No second parser lives here.
   ============================================================ */

'use strict';

import {
  todayString, formatDateLong, parseLocalDate,
  timeToMinutes, minutesToTime, offsetDate, computeWorkTime, assignmentSpan,
} from './utils.js';
import { getVehicleColor } from './drivers.js';
import { getActiveDrivers } from './drivers-store.js';
import { getActiveVehicles } from './vehicles-store.js';
import { checkConflict, checkVehicleConflict } from './assignments.js';
import { openDetailModal } from './modal.js';
import { getSetting } from './settings-store.js';
import { buildVehicleShapeMap, vehicleShapeCss } from './utils/vehicle-identity.js';

/** Live office-hours window (09:00–17:00 default) for overtime detection. */
function getOfficeHours() {
  return {
    workStartMins: getSetting('operations.workStartMins'),
    workEndMins:   getSetting('operations.workEndMins'),
  };
}

const DAY_MIN = 1440;

/** Minutes-from-midnight (local) for an ISO timestamp, or null. */
function isoToMinsOfDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}
/** { dateStr:'YYYY-MM-DD', minutes } (local) for an ISO timestamp, or null. */
function isoLocalParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dateStr, minutes: d.getHours() * 60 + d.getMinutes() };
}

/* ── Helpers ── */
function normalizeBlockStatus(status) {
  if (!status || status === 'aktif') return 'assigned';
  if (status === 'selesai') return 'completed';
  return status;
}

/* ── Module State ── */

// Continuous multi-day window. The canvas renders a contiguous run of
// calendar days [windowStartDate .. windowStartDate + windowDayCount - 1].
const WINDOW_RADIUS_DAYS = 10;      // initial build: anchor ± this many days
const WINDOW_EXTEND_DAYS = 10;      // days appended/prepended per infinite-extend
const WINDOW_EDGE_TRIGGER_DAYS = 3; // extend when the viewport day is within N of an edge
const WINDOW_MAX_DAYS = 63;         // hard cap on rendered days — extend past it slides the far edge

let windowStartDate = null;   // 'YYYY-MM-DD' — leftmost rendered day
let windowDayCount = 0;

let currentDate = todayString(); // the explicit ANCHOR (date-nav target) — drives window centering + the List/Daftar view (getCurrentDate)
let viewportDate = currentDate;  // the day the SCROLL POSITION currently shows — drives the header label + "Hari Ini" state
let assignments = [];
let realtimeTimer = null;

// Auto-focus (INITIAL OPEN / explicit nav only). `lastFocusAnchor` is the
// anchor we have already resolved a position for; `_desiredScrollPx` is the
// canvas px the timeline "wants" — re-asserted across re-renders until the
// user takes manual control (userMovedTimeline).
let lastFocusAnchor = null;
let userMovedTimeline = false;
let _desiredScrollPx = null;

// The REAL Operations-open path routes through setWorkspace() →
// document.startViewTransition(), which applies the surface's `display`
// change ASYNCHRONOUSLY, AFTER renderTimeline() has run. So auto-focus can
// fire against a display:none / not-yet-laid-out #timelineBody where a
// scroll write is a silent no-op. A bounded requestAnimationFrame loop
// waits until the body is genuinely visible + scrollable before it acts.
let _autoFocusRaf = 0;
let _autoFocusTries = 0;
const AUTO_FOCUS_MAX_TRIES = 60; // ~1s of frames — bounded, stops on success
const AUTO_FOCUS_CONTEXT_MIN = 90; // ~1.5h of leading context before the target

// Smooth-scroll tween (Part 6/7). Distance-scaled easeOutCubic; yields the
// instant the user starts a manual scroll (wheel / touch / pointer-down).
let _smoothRaf = 0;
let _smoothActive = false;

// rAF-throttled viewport-date + infinite-extend sync (Part 11).
let _viewportSyncRaf = 0;

function getTimelineBodyElement() {
  return document.getElementById('timelineBody') || document.getElementById('timelineGrid');
}

/* ── Canvas geometry ─────────────────────────────────────────────────────
   A block's `style.left` is ABSOLUTE canvas px from windowStartDate 00:00.
   Within #timelineBody the leftmost VISIBLE canvas px === body.scrollLeft
   (the sticky .driver-label covers viewport-x 0..driverCol, and .driver-
   slots begins right after it, so canvas-px P sits at viewport-x
   driverCol + P - scrollLeft). Positioning a block P px from the visible
   canvas edge therefore means scrollLeft = P. */
function _hourWidth() { return getHourWidth(); }
function _dayWidthPx() { return 24 * getHourWidth(); }
function _canvasWidthPx() { return windowDayCount * _dayWidthPx(); }

function _daysBetween(aStr, bStr) {
  return Math.round((parseLocalDate(bStr) - parseLocalDate(aStr)) / 86400000);
}

/** Day index of a date within the current window (may be <0 or >=count). */
export function dateToDayIndex(dateStr) {
  if (!windowStartDate || !dateStr) return 0;
  return _daysBetween(windowStartDate, dateStr);
}

/** Absolute canvas px for (dateStr, minuteOfDay). */
function _canvasPx(dateStr, minuteOfDay) {
  return ((dateToDayIndex(dateStr) * DAY_MIN + minuteOfDay) / 60) * getHourWidth();
}

/** Inverse: absolute canvas minutes → { date, minutes-of-day } — used by
 *  timeline-interactions.js so drag/resize/paste resolve the real day the
 *  pointer is over, not a day-0 assumption. */
export function canvasMinutesToDateTime(absMin) {
  const dayIndex = Math.floor(absMin / DAY_MIN);
  let minutes = Math.round(absMin - dayIndex * DAY_MIN);
  minutes = Math.max(0, Math.min(1439, minutes));
  return { date: windowStartDate ? offsetDate(windowStartDate, dayIndex) : todayString(), minutes };
}

/** Leftmost rendered day — for timeline-interactions.js canvas math. */
export function getWindowStartDate() { return windowStartDate; }

/* ── Window management ──────────────────────────────────────────────────── */

function buildWindow(anchorDate) {
  const anchor = anchorDate || todayString();
  windowStartDate = offsetDate(anchor, -WINDOW_RADIUS_DAYS);
  windowDayCount = WINDOW_RADIUS_DAYS * 2 + 1;
}

/** Rebuild the window centred on `dateStr` when it is outside (or within
 *  `margin` days of) the current window. Returns true if it rebuilt. */
function ensureDateInWindow(dateStr, margin = 2) {
  if (!windowStartDate) { buildWindow(dateStr); return true; }
  const idx = _daysBetween(windowStartDate, dateStr);
  if (idx < margin || idx > windowDayCount - 1 - margin) { buildWindow(dateStr); return true; }
  return false;
}

/**
 * Grow the window toward whichever edge `viewportDate` is approaching, and
 * slide the far edge once WINDOW_MAX_DAYS is hit so the DOM stays bounded.
 * @returns {{changed:boolean, shiftPx:number}} shiftPx = px the canvas
 *   content moved RIGHT (prepend) or LEFT (negative, far-edge slide);
 *   caller compensates scrollLeft by it so the viewport does not jump.
 */
function maybeExtendWindow() {
  if (!windowStartDate) return { changed: false, shiftPx: 0 };
  const idx = _daysBetween(windowStartDate, viewportDate);
  let changed = false;
  let shiftPx = 0;

  if (idx <= WINDOW_EDGE_TRIGGER_DAYS) {
    windowStartDate = offsetDate(windowStartDate, -WINDOW_EXTEND_DAYS);
    windowDayCount += WINDOW_EXTEND_DAYS;
    shiftPx = WINDOW_EXTEND_DAYS * _dayWidthPx();
    if (windowDayCount > WINDOW_MAX_DAYS) windowDayCount = WINDOW_MAX_DAYS; // drop rightmost — off-screen right, no compensation
    changed = true;
  } else if (idx >= windowDayCount - 1 - WINDOW_EDGE_TRIGGER_DAYS) {
    windowDayCount += WINDOW_EXTEND_DAYS;
    if (windowDayCount > WINDOW_MAX_DAYS) {
      const trim = windowDayCount - WINDOW_MAX_DAYS;
      windowStartDate = offsetDate(windowStartDate, trim);
      windowDayCount = WINDOW_MAX_DAYS;
      shiftPx = -trim * _dayWidthPx(); // content shifted left → reduce scrollLeft
    }
    changed = true;
  }
  return { changed, shiftPx };
}

/**
 * Render keseluruhan timeline scheduler (multi-day continuous canvas).
 */
export function renderTimeline() {
  if (!windowStartDate) buildWindow(currentDate);

  updateDateLabel();
  renderHourHeaders();
  renderDriverRows();      // preserves body.scrollLeft across the innerHTML wipe
  updateRealtimeTimeline();
  startRealtimeTimeline();

  if (!window.timelineScrollInitialized) {
    syncTimelineScroll();
    window.timelineScrollInitialized = true;
  }

  // Smart auto-focus (INITIAL OPEN / new anchor only — never fights the user).
  if (!userMovedTimeline && lastFocusAnchor !== currentDate) {
    scheduleAutoFocus();
  }

  // Debug: verify the full multi-day range is rendered and scrollable.
  requestAnimationFrame(() => {
    const body = getTimelineBodyElement();
    const hoursEl = document.getElementById('timelineHours');
    if (!body) return;
    const cells = hoursEl ? hoursEl.querySelectorAll('.hour-cell') : [];
    const hw = getHourWidth();
    const dc = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--driver-col')) || 0;
    const expected = Math.round(dc + windowDayCount * 24 * hw);
    const ok = body.scrollWidth >= expected - 4 && body.scrollWidth > body.clientWidth;
    console.info(`[Timeline] ${ok ? '✅' : '❌'}`, {
      windowStartDate, windowDayCount,
      viewportDate, currentDate,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      renderedHourCells: cells.length,
      expectedScrollWidth: expected,
      hourWidthPx: hw,
      driverColPx: dc,
    });
  });
}

/**
 * Pick the single most operationally-relevant assignment for `now`, by
 * ABSOLUTE datetime (Part 4/5). PURE + exported for unit testing.
 *   A. Active now: startDateTime <= now < endDateTime — the one ending
 *      soonest, so a long trip never hides a shorter concurrent one.
 *      (An overnight trip that started YESTERDAY is found here.)
 *   B. Else the next upcoming (smallest startDateTime > now).
 *   C. Else the nearest previous (largest endDateTime <= now).
 *   D. Else null — caller falls back to "now" / the anchor day.
 * Cancelled assignments are never chosen.
 * @param {Array} candidates  any assignment list (not pre-filtered to a date)
 * @param {Date}  now
 * @returns {{ assignment:object, focusDate:string, focusMinutes:number }|null}
 */
export function pickRelevantAssignment(candidates, now = new Date()) {
  const withSpan = (candidates || [])
    .map(a => ({ a, s: assignmentSpan(a) }))
    .filter(x => x.s && x.a && x.a.status !== 'cancelled');
  if (!withSpan.length) return null;

  const out = (x) => ({ assignment: x.a, focusDate: x.s.startDate, focusMinutes: x.s.startMin });

  const active = withSpan
    .filter(x => x.s.startDateTime <= now && now < x.s.endDateTime)
    .sort((p, q) => p.s.endDateTime - q.s.endDateTime);
  if (active.length) return out(active[0]);

  const upcoming = withSpan
    .filter(x => x.s.startDateTime > now)
    .sort((p, q) => p.s.startDateTime - q.s.startDateTime);
  if (upcoming.length) return out(upcoming[0]);

  const previous = withSpan
    .filter(x => x.s.endDateTime <= now)
    .sort((p, q) => q.s.endDateTime - p.s.endDateTime);
  if (previous.length) return out(previous[0]);

  return null;
}

/** Sticky driver-label column width (px). */
function _driverColPx() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--driver-col'));
  if (Number.isFinite(v) && v > 0) return v;
  const label = document.querySelector('#timelineBody .driver-label, #timelineGrid .driver-label');
  return label ? label.offsetWidth || 110 : 110;
}

function _nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Measured canvas-left of a rendered block (robust against layout/token
 *  drift), or the minutes-formula fallback. */
function _blockOrFormulaPx(picked) {
  if (picked && picked.assignment && picked.assignment.id != null) {
    let blk = null;
    try {
      const body = getTimelineBodyElement();
      blk = body && body.querySelector(`.assignment-block[data-id="${CSS.escape(String(picked.assignment.id))}"]`);
    } catch (_) { blk = null; }
    if (blk) {
      const l = parseFloat(blk.style.left);
      if (Number.isFinite(l)) return l;
    }
  }
  return _canvasPx(picked.focusDate, picked.focusMinutes);
}

/**
 * The canvas scrollLeft that brings the operationally-relevant thing for the
 * WHOLE dataset (by absolute datetime) `AUTO_FOCUS_CONTEXT_MIN` in from the
 * visible edge. `canLatch:false` ⇒ "positioned, but data almost certainly
 * isn't loaded yet — keep retrying so data arrival re-focuses".
 * @returns {{ px:number, canLatch:boolean }}
 */
function _computeAutoFocusTarget() {
  const ctxPx = (AUTO_FOCUS_CONTEXT_MIN / 60) * getHourWidth();
  const picked = pickRelevantAssignment(assignments, new Date());
  if (picked) return { px: Math.max(0, _blockOrFormulaPx(picked) - ctxPx), canLatch: true };

  const todayStr = todayString();
  const todayIdx = dateToDayIndex(todayStr);
  if (todayIdx >= 0 && todayIdx < windowDayCount) {
    return { px: Math.max(0, _canvasPx(todayStr, _nowMinutes()) - ctxPx), canLatch: assignments.length > 0 };
  }
  return { px: Math.max(0, _canvasPx(currentDate, 8 * 60) - ctxPx), canLatch: assignments.length > 0 };
}

/** The canvas scrollLeft for an EXPLICIT date-nav target (Part 14/15/16). */
function _focusPxForDate(dateStr) {
  const ctxPx = (AUTO_FOCUS_CONTEXT_MIN / 60) * getHourWidth();
  const isToday = dateStr === todayString();
  const dayStart = parseLocalDate(dateStr);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const overlapping = assignments
    .map(a => ({ a, s: assignmentSpan(a) }))
    .filter(x => x.s && x.a.status !== 'cancelled' && x.s.startDateTime < dayEnd && x.s.endDateTime > dayStart);

  if (isToday) {
    const picked = pickRelevantAssignment(overlapping.map(x => x.a), new Date());
    if (picked) return Math.max(0, _blockOrFormulaPx(picked) - ctxPx);
    return Math.max(0, _canvasPx(dateStr, _nowMinutes()) - ctxPx);
  }
  if (overlapping.length) {
    const earliest = overlapping.reduce((m, x) => (x.s.startDateTime < m.s.startDateTime ? x : m));
    return Math.max(0, _blockOrFormulaPx({
      assignment: earliest.a, focusDate: earliest.s.startDate, focusMinutes: earliest.s.startMin,
    }) - ctxPx);
  }
  return Math.max(0, _canvasPx(dateStr, 8 * 60) - ctxPx);
}

/* ── Smooth scroll (Part 6/7) ──────────────────────────────────────────── */

function cancelSmoothScroll() {
  if (_smoothRaf) cancelAnimationFrame(_smoothRaf);
  _smoothRaf = 0;
  _smoothActive = false;
}

/**
 * Animate #timelineBody.scrollLeft to `targetPx` (easeOutCubic, distance-
 * scaled 240–650ms). Yields immediately if the user starts a manual scroll
 * (userMovedTimeline) — never fights them back to the target.
 */
function smoothScrollTimelineTo(targetPx, { onDone } = {}) {
  const body = getTimelineBodyElement();
  if (!body) return;
  const maxPx = Math.max(0, body.scrollWidth - body.clientWidth);
  const target = Math.max(0, Math.min(targetPx, maxPx));
  const start = body.scrollLeft;
  const dist = target - start;

  cancelSmoothScroll();
  if (Math.abs(dist) < 4) { body.scrollLeft = target; onDone && onDone(); return; }

  _smoothActive = true;
  const dur = Math.min(650, Math.max(240, Math.abs(dist) * 0.4));
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ease = (p) => 1 - Math.pow(1 - p, 3);

  const step = (now) => {
    if (!_smoothActive) return;                 // cancelled elsewhere
    if (userMovedTimeline) { cancelSmoothScroll(); return; } // user took over
    const p = Math.min(1, ((now || Date.now()) - t0) / dur);
    body.scrollLeft = start + dist * ease(p);
    const hours = document.getElementById('timelineHours');
    if (hours) hours.scrollLeft = body.scrollLeft;
    if (p < 1) {
      _smoothRaf = requestAnimationFrame(step);
    } else {
      _smoothActive = false;
      _smoothRaf = 0;
      onDone && onDone();
    }
  };
  _smoothRaf = requestAnimationFrame(step);
}

/* ── Bounded readiness loop for the async surface (unchanged rationale) ── */

function scheduleAutoFocus() {
  _autoFocusTries = 0;
  if (_autoFocusRaf) cancelAnimationFrame(_autoFocusRaf);
  _autoFocusRaf = requestAnimationFrame(_autoFocusTick);
}

function _autoFocusRetry() {
  if (++_autoFocusTries <= AUTO_FOCUS_MAX_TRIES) {
    _autoFocusRaf = requestAnimationFrame(_autoFocusTick);
  } else {
    _autoFocusRaf = 0;
  }
}

function _autoFocusTick() {
  _autoFocusRaf = 0;

  if (userMovedTimeline) { lastFocusAnchor = currentDate; return; }
  if (lastFocusAnchor === currentDate) return;
  if (_smoothActive) { _autoFocusRetry(); return; } // an animation is already running — don't stack
  if (syncTimelineScroll._isPointerDown && syncTimelineScroll._isPointerDown()) { _autoFocusRetry(); return; }

  const body = getTimelineBodyElement();
  if (!body) { _autoFocusRetry(); return; }

  // Not laid out yet (surface still display:none / mid View Transition), or
  // genuinely nothing to scroll — wait for a real scrollable width.
  const ready = body.offsetParent !== null && body.scrollWidth > body.clientWidth + 1;
  if (!ready) { _autoFocusRetry(); return; }

  const target = _computeAutoFocusTarget();
  _desiredScrollPx = target.px;

  smoothScrollTimelineTo(target.px, {
    onDone: () => {
      const landed = target.px <= 2 || Math.abs(body.scrollLeft - target.px) <= 6
        || body.scrollLeft >= (body.scrollWidth - body.clientWidth - 2);
      if (landed && target.canLatch) {
        lastFocusAnchor = currentDate;
      } else if (!target.canLatch) {
        _autoFocusRetry(); // pre-data — keep trying so data arrival re-focuses
      }
    },
  });
}

/**
 * Update the header date label + the calendar picker (Part 10 — BOTH follow
 * the scroll VIEWPORT, incl. a free scroll past today) and the "Hari Ini"
 * enabled state.
 */
function updateDateLabel() {
  const label = document.getElementById('timelineDateLabel');
  if (label) label.textContent = formatDateLong(viewportDate);

  // The date-input calendar tracks whatever the timeline is showing — a plain
  // horizontal scroll moves it too, not just the Prev/Next/Today buttons.
  // Assigning .value programmatically does NOT fire its 'change' listener, so
  // there is no goToDate() feedback loop; onViewportDateChange lets app.js
  // refresh the PBSI datepicker's visible trigger text (also not a change ev).
  const dateInput = document.getElementById('filterDate');
  if (dateInput && dateInput.value !== viewportDate) {
    dateInput.value = viewportDate;
    if (onViewportDateChange) { try { onViewportDateChange(viewportDate); } catch (_) {} }
  }

  const btnToday = document.getElementById('btnToday');
  if (btnToday) {
    // Enabled whenever the viewport is not on today, OR today's "now" line is
    // scrolled out of view (so "Hari Ini" can always re-centre on now — Part 16).
    const onToday = viewportDate === todayString();
    const disabled = onToday && _isNowInView();
    btnToday.disabled = disabled;
    btnToday.classList.toggle('is-today', disabled);
  }
}

function _isNowInView() {
  const body = getTimelineBodyElement();
  if (!body || !windowStartDate) return false;
  const todayIdx = dateToDayIndex(todayString());
  if (todayIdx < 0 || todayIdx >= windowDayCount) return false;
  const nowPx = _canvasPx(todayString(), _nowMinutes());
  const left = body.scrollLeft;
  const right = body.scrollLeft + body.clientWidth - _driverColPx();
  return nowPx >= left && nowPx <= right;
}

/**
 * Render the multi-day hour ruler: `windowDayCount * 24` cells (00:00–23:00
 * repeating). Every day boundary (hour 0) carries a divider + a compact
 * date marker so the continuous strip stays legible (Part 10).
 */
function renderHourHeaders() {
  const container = document.getElementById('timelineHours');
  if (!container) return;

  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let d = 0; d < windowDayCount; d++) {
    const dateStr = offsetDate(windowStartDate, d);
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'hour-cell';
      cell.textContent = `${String(h).padStart(2, '0')}:00`;
      if (h === 0) {
        cell.classList.add('hour-cell--daystart');
        cell.dataset.day = _shortDayLabel(dateStr);
      }
      frag.appendChild(cell);
    }
  }
  // Trailing 24:00 marker so the last day still shows its right edge.
  const endCap = document.createElement('div');
  endCap.className = 'hour-cell hour-cell--endcap';
  endCap.textContent = '24:00';
  frag.appendChild(endCap);
  container.appendChild(frag);
}

function _shortDayLabel(dateStr) {
  const p = parseLocalDate(dateStr);
  return p.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Render every driver row + its assignment blocks across the whole window.
 * An assignment is included when its datetime SPAN overlaps the window
 * (Part 17) — never `a.date === currentDate`. Preserves body.scrollLeft
 * across the innerHTML wipe so a Firebase refresh never jumps the view.
 */
function renderDriverRows() {
  const body = getTimelineBodyElement();
  if (!body) return;

  const keepScroll = body.scrollLeft;

  // Drive .driver-slots / grid width via a CSS var (see style.css).
  body.style.setProperty('--tl-days', String(windowDayCount));
  body.innerHTML = '';

  const winStart = parseLocalDate(windowStartDate);
  const winEnd = new Date(winStart);
  winEnd.setDate(winEnd.getDate() + windowDayCount);

  const visibleAssignments = assignments.filter(a => {
    const s = assignmentSpan(a);
    return s && s.startDateTime < winEnd && s.endDateTime > winStart;
  });

  const timelineDrivers = getActiveDrivers();
  const driversToRender = [...timelineDrivers];

  visibleAssignments.forEach(assignment => {
    if (isUnassignedAssignment(assignment)) return; // handled by the dedicated lane below
    const hasDriverRow = driversToRender.some(driver => driverMatchesAssignment(driver, assignment));
    if (!hasDriverRow && assignment.driver) {
      // driverId is filled but resolves to no active driver — keep the existing
      // fallback convention: surface it as its own (inactive) lane under the raw
      // name rather than dropping the assignment.
      driversToRender.push({
        name: assignment.driver,
        phone: assignment.phone || '',
        legacyNames: [assignment.driver],
        active: false,
      });
    }
  });

  // Every visible assignment with no driver — routed to ONE dedicated lane,
  // rendered last (see below). Overnight / multi-day span logic is unchanged:
  // only the lane differs, never the time math.
  const unassignedAssignments = visibleAssignments.filter(isUnassignedAssignment);

  const todayIdx = dateToDayIndex(todayString());
  const todayInWindow = todayIdx >= 0 && todayIdx < windowDayCount;
  const nowLeftPx = todayInWindow ? _canvasPx(todayString(), _nowMinutes()) : null;

  const frag = document.createDocumentFragment();

  const addNowLine = (slots) => {
    if (nowLeftPx == null) return;
    const nowLine = document.createElement('div');
    nowLine.className = 'today-line';
    nowLine.style.left = `${nowLeftPx}px`;
    slots.appendChild(nowLine);
  };

  driversToRender.forEach(driver => {
    const row = document.createElement('div');
    row.className = 'driver-row';

    const label = document.createElement('div');
    label.className = 'driver-label';
    label.innerHTML = `
      <span class="driver-name">${driver.name}</span>
      <span class="driver-phone">${driver.phone}</span>
    `;
    row.appendChild(label);

    const slots = document.createElement('div');
    slots.className = 'driver-slots';

    const driverAssignments = visibleAssignments.filter(a => driverMatchesAssignment(driver, a));
    if (driverAssignments.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'empty-slots-hint';
      hint.textContent = 'Belum ada jadwal';
      slots.appendChild(hint);
    } else {
      driverAssignments.forEach(a => slots.appendChild(createAssignmentBlock(a)));
    }

    addNowLine(slots);

    row.appendChild(slots);
    frag.appendChild(row);
  });

  // ── Dedicated "Tanpa Driver" lane ─────────────────────────────────────
  // ALWAYS LAST, and shown ONLY when at least one visible assignment has no
  // driver — never a permanently-empty fixed row. Same structural row as a
  // driver lane (one .driver-row = its own sticky left label + right slots),
  // so left labels and timeline lanes stay 1:1 from a single resource pass.
  if (unassignedAssignments.length > 0) {
    const row = document.createElement('div');
    row.className = 'driver-row driver-row--unassigned';
    row.dataset.lane = 'unassigned'; // read by timeline-interactions.js drag → driver:''

    const label = document.createElement('div');
    label.className = 'driver-label driver-label--unassigned';
    const nameEl = document.createElement('span');
    nameEl.className = 'driver-name';
    nameEl.textContent = 'Tanpa Driver';
    const countEl = document.createElement('span');
    countEl.className = 'driver-phone driver-lane-count';
    countEl.textContent = `${unassignedAssignments.length} tugas`;
    label.append(nameEl, countEl);
    row.appendChild(label);

    const slots = document.createElement('div');
    slots.className = 'driver-slots';
    unassignedAssignments.forEach(a => slots.appendChild(createAssignmentBlock(a)));
    addNowLine(slots);

    row.appendChild(slots);
    frag.appendChild(row);
  }

  body.appendChild(frag);

  // Restore the pre-wipe scroll position (Firebase refresh must not jump).
  body.scrollLeft = keepScroll;
  const hours = document.getElementById('timelineHours');
  if (hours) hours.scrollLeft = keepScroll;
}

function driverMatchesAssignment(driver, assignment) {
  const assignmentDriver = String(assignment?.driver || '').trim();
  if (!assignmentDriver) return false;
  if (assignmentDriver === driver.name) return true;
  const legacyNames = Array.isArray(driver.legacyNames) ? driver.legacyNames : [];
  return legacyNames.some(name => String(name || '').trim() === assignmentDriver);
}

/**
 * An assignment is UNASSIGNED when it carries no driver reference. In this
 * codebase the driver reference IS the display-name string (`assignment.driver`);
 * `''` is the persisted "Tanpa Driver" / Self-Drive state (v1.27.0, see
 * js/assignments.js NO_DRIVER_SENTINEL) and legacy records may hold null /
 * undefined. All three route to the dedicated "Tanpa Driver" lane — a driver
 * being absent is an operational condition to surface, never a reason to drop
 * the assignment from the board. Independent of the vehicle: an assignment with
 * a vehicle but no driver is still unassigned.
 */
export function isUnassignedAssignment(assignment) {
  return String(assignment?.driver ?? '').trim() === '';
}

/**
 * V1 Redesign Phase 3 (v1.30.9.15) — passive, read-only convoy detection.
 * Same heuristic (same date + same start/end time + same destination, across
 * 2+ DIFFERENT drivers): no data-model change, purely visual, exactly like
 * the passive conflict badge.
 */
function isConvoyAssignment(assignment) {
  if (!assignment?.date || !assignment?.startTime || !assignment?.endTime || !assignment?.destination) return false;
  if (normalizeBlockStatus(assignment.status) === 'cancelled') return false;
  return assignments.some(other =>
    other.id !== assignment.id
    && other.date === assignment.date
    && other.startTime === assignment.startTime
    && other.endTime === assignment.endTime
    && other.destination === assignment.destination
    && other.driver !== assignment.driver
    && normalizeBlockStatus(other.status) !== 'cancelled'
  );
}

/**
 * Build one assignment block, positioned in ABSOLUTE canvas px. An overnight
 * / multi-day assignment is ONE block spanning the midnight gridline(s) —
 * one id, one click target, one business entity (Part I / Part 2 / Part 3).
 * Clipping happens ONLY at the window edge (`.continues-prev-day` /
 * `.continues-next-day` chevrons); the block's day-crossing inside the
 * window is shown continuously against the day-seam gridline.
 */
function createAssignmentBlock(assignment) {
  const hourWidth = getHourWidth();
  const span = assignmentSpan(assignment);

  const status = normalizeBlockStatus(assignment.status);
  const isCompleted = status === 'completed';
  const isStarted   = status === 'started';
  const isUnassigned = isUnassignedAssignment(assignment);

  // Scheduled window in ABSOLUTE canvas minutes from windowStartDate 00:00.
  let startAbs, endAbs;
  if (span) {
    startAbs = dateToDayIndex(span.startDate) * DAY_MIN + span.startMin;
    endAbs   = dateToDayIndex(span.endDate)   * DAY_MIN + span.endMin;
  } else {
    // Malformed record — degrade to a minimal same-day stub on its own date.
    const s = timeToMinutes(assignment.startTime || '00:00');
    startAbs = dateToDayIndex(assignment.date || currentDate) * DAY_MIN + (Number.isFinite(s) ? s : 0);
    endAbs = startAbs + 60;
  }

  // v1.16.4.7 — auto-adjust to ACTUAL operational time when known (scheduled
  // fields are never mutated; this only changes the visual window). The
  // actual timestamps carry their own real dates, so a real cross-midnight
  // engaged window is handled too.
  let usingActual = false;
  const aStart = isoLocalParts(assignment.startedAt);
  const aEnd   = isoLocalParts(assignment.completedAt);
  const toAbs = (p) => dateToDayIndex(p.dateStr) * DAY_MIN + p.minutes;

  if (isCompleted && aStart && aEnd) {
    const s = toAbs(aStart), e = toAbs(aEnd);
    if (e > s) { startAbs = s; endAbs = e; usingActual = true; }
  } else if (isStarted && aStart) {
    const s = toAbs(aStart);
    startAbs = s;
    endAbs = Math.max(endAbs, s + 1);
    usingActual = true;
  }

  const canvasW = _canvasWidthPx();
  let left = (startAbs / 60) * hourWidth;
  let width = ((endAbs - startAbs) / 60) * hourWidth;

  // Clip at the WINDOW edges only.
  let clipLeft = false, clipRight = false;
  if (left < 0) { width += left; left = 0; clipLeft = true; }
  if (left + width > canvasW) { width = canvasW - left; clipRight = true; }
  if (width < 0) width = 0;

  const block = document.createElement('div');
  block.className = 'assignment-block';
  block.dataset.id = assignment.id;
  block.dataset.vehicle = assignment.vehicle;
  block.dataset.status = status;
  block.style.left  = `${left}px`;
  block.style.width = `${Math.max(width, 20)}px`;
  block.style.background = getVehicleColor(assignment.vehicle);

  if (isCompleted) block.classList.add('is-completed');
  if (isStarted)   block.classList.add('is-started');
  if (isUnassigned) block.classList.add('is-unassigned');
  if (status === 'cancelled') block.classList.add('is-cancelled');
  if (clipLeft)  block.classList.add('continues-prev-day');
  if (clipRight) block.classList.add('continues-next-day');
  if (span && span.crossesMidnight && !clipLeft && !clipRight) {
    block.classList.add('spans-midnight');
    // Vertical tick at the first day seam the block crosses (px from its left edge).
    const seamPx = (dateToDayIndex(span.endDate) * DAY_MIN / 60) * hourWidth - left;
    if (seamPx > 2 && seamPx < width - 2) block.style.setProperty('--midnight-x', `${seamPx}px`);
  }

  const work = computeWorkTime(assignment, getOfficeHours());
  const isOvertime = work.isOvertime === true;
  if (isOvertime) block.classList.add('is-overtime');

  // Label always shows the TRUE scheduled times (not the clipped extent).
  const labelStartMin = span ? span.startMin : (startAbs % DAY_MIN);
  const labelEndMin   = span ? span.endMin   : (endAbs % DAY_MIN);
  const blockTimeLabel = (assignment.fullDay && !usingActual)
    ? 'Penuh Hari'
    : `${minutesToTime(labelStartMin)}–${minutesToTime(labelEndMin)}`;

  // Passive visual conflict indicator — SAME checkConflict/checkVehicleConflict
  // used at write time; read-only, never blocks. The driver-conflict term is
  // guarded on a non-empty driver to match the write path exactly (js/
  // assignments.js: `driver !== '' && checkConflict(...)`) — two concurrent
  // "Tanpa Driver" assignments are a valid state, not a conflict.
  const hasConflict = status !== 'cancelled' && (
    (assignment.driver && checkConflict(assignment.driver, assignment.startTime, assignment.endTime, assignment.date, assignment.id))
    || (assignment.vehicle && assignment.vehicle !== '__none__'
        && checkVehicleConflict(assignment.vehicle, assignment.startTime, assignment.endTime, assignment.date, assignment.id))
  );

  const metadataBadges = [
    isUnassigned ? '<span class="block-status-badge block-status-badge--unassigned">⚠ Tanpa Driver</span>' : '',
    isCompleted ? '<span class="block-status-badge">✓ Selesai</span>' : '',
    isOvertime  ? '<span class="block-status-badge block-status-badge--overtime">Lembur</span>' : '',
    isStarted   ? '<span class="block-status-badge block-status-badge--started">Jalan</span>' : '',
    hasConflict ? '<span class="block-status-badge block-status-badge--conflict">⚠ Konflik</span>' : '',
  ].filter(Boolean).join('<span class="block-meta-separator">•</span>');

  const shapeMap = buildVehicleShapeMap(getActiveVehicles());
  const shape = shapeMap.get(assignment.vehicle) || 'rounded';
  const isConvoy = isConvoyAssignment(assignment);
  const vehicleShapeDot = assignment.vehicle && assignment.vehicle !== '__none__'
    ? `<span class="block-vehicle-shape" style="${vehicleShapeCss(shape)}" aria-hidden="true"></span>` : '';
  const convoyMark = isConvoy
    ? `<span class="block-convoy-mark" title="Bagian dari konvoi (jadwal &amp; tujuan sama)" aria-hidden="true">
         <svg viewBox="0 0 24 14" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="8" cy="7" r="5.4"/><circle cx="16" cy="7" r="5.4"/></svg>
       </span>` : '';
  const conflictDot = hasConflict ? '<span class="block-conflict-dot" aria-hidden="true"></span>' : '';

  block.innerHTML = `
    ${vehicleShapeDot}
    ${conflictDot}
    <span class="block-time">${blockTimeLabel}</span>
    <span class="block-purpose">${assignment.purpose}</span>
    ${metadataBadges ? `<span class="block-meta-row">${metadataBadges}</span>` : ''}
    ${convoyMark}
    <div class="resize-handle"></div>
  `;
  block.title = assignment.purpose || '';

  // Klik blok (any part of it, incl. past a midnight seam) → the SAME
  // assignment detail. Continuation is visual only; identity is unchanged.
  block.addEventListener('click', (e) => {
    if (!e.target.classList.contains('resize-handle')) {
      openDetailModal(assignment.id, { sourceEl: block });
    }
  });

  return block;
}

/**
 * Mendapatkan lebar per jam dari CSS variable --hour-width. Default 80px.
 */
export function getHourWidth() {
  const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour-width'));
  return isNaN(w) ? 80 : w;
}

function updateRealtimeTimeline() {
  const hourCells = document.querySelectorAll('#timelineHours .hour-cell');
  const now = new Date();
  const todayIdx = dateToDayIndex(todayString());
  const todayInWindow = todayIdx >= 0 && todayIdx < windowDayCount;
  const currentCellIndex = todayInWindow ? todayIdx * 24 + now.getHours() : -1;

  hourCells.forEach((cell, index) => {
    const hourOfDay = index % 24;
    cell.classList.toggle('hour-shaded', hourOfDay < 7 || hourOfDay >= 22);
    cell.classList.toggle('hour-current', index === currentCellIndex);
  });

  const body = getTimelineBodyElement();
  if (!body) return;

  if (!todayInWindow) {
    body.querySelectorAll('.today-line').forEach(line => line.remove());
    return;
  }
  const leftPx = _canvasPx(todayString(), now.getHours() * 60 + now.getMinutes());
  body.querySelectorAll('.today-line').forEach(line => { line.style.left = `${leftPx}px`; });
}

function startRealtimeTimeline() {
  if (realtimeTimer) return;
  realtimeTimer = setInterval(() => { updateRealtimeTimeline(); }, 60 * 1000);
}

/* ── Scroll: header sync + wheel-to-horizontal + viewport-date + extend ── */

function syncTimelineScroll() {
  const body    = getTimelineBodyElement();
  const hours   = document.getElementById('timelineHours');
  const wrapper = document.querySelector('.timeline-wrapper');
  const fadeR   = wrapper?.querySelector('.timeline-scroll-fade-right');
  if (!body || !hours) return;

  let isPointerDown = false;
  body.addEventListener('pointerdown', () => { isPointerDown = true; cancelSmoothScroll(); }, { passive: true });
  window.addEventListener('pointerup',     () => { isPointerDown = false; }, { passive: true });
  window.addEventListener('pointercancel', () => { isPointerDown = false; }, { passive: true });
  syncTimelineScroll._isPointerDown = () => isPointerDown;

  // A touch-pan is a deliberate manual reposition — latch userMovedTimeline
  // so a later data refresh / auto-focus never scrolls it back.
  body.addEventListener('touchmove', () => { userMovedTimeline = true; cancelSmoothScroll(); }, { passive: true });

  body.addEventListener('scroll', () => {
    hours.scrollLeft = body.scrollLeft;
    updateFadeIndicators();
    scheduleViewportSync();
  });

  if (wrapper) {
    wrapper.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        userMovedTimeline = true; cancelSmoothScroll();
        body.scrollLeft += e.deltaX;
        return;
      }
      if (e.deltaY !== 0) {
        e.preventDefault();
        userMovedTimeline = true; cancelSmoothScroll();
        const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        body.scrollLeft += delta;
      }
    }, { passive: false });
  }

  function updateFadeIndicators() {
    if (!fadeR) return;
    const maxScroll = body.scrollWidth - body.clientWidth;
    fadeR.style.opacity = body.scrollLeft < maxScroll - 16 ? '1' : '0';
  }
  updateFadeIndicators();
}

/** rAF-throttled: keep the header label in step with the scroll viewport and
 *  grow the window near an edge (Part 10/11/12/13). One re-render per extend
 *  (rare) — never per scroll frame. */
function scheduleViewportSync() {
  if (_viewportSyncRaf) return;
  _viewportSyncRaf = requestAnimationFrame(() => {
    _viewportSyncRaf = 0;
    syncViewportDate();
  });
}

function syncViewportDate() {
  const body = getTimelineBodyElement();
  if (!body || !windowStartDate) return;

  // "Dominant day" = a point ~a third of the way into the visible canvas.
  const focusPx = body.scrollLeft + Math.min(body.clientWidth * 0.35, _dayWidthPx() * 0.5);
  let dayIdx = Math.floor(focusPx / _dayWidthPx());
  dayIdx = Math.max(0, Math.min(windowDayCount - 1, dayIdx));
  const newViewportDate = offsetDate(windowStartDate, dayIdx);
  if (newViewportDate !== viewportDate) {
    viewportDate = newViewportDate;
    updateDateLabel();
  }

  // Never extend mid programmatic-animation (it would re-render + compensate
  // scrollLeft under the tween). Auto-focus / nav targets are always inside
  // the freshly-ensured window anyway.
  if (_smoothActive) return;

  const { changed, shiftPx } = maybeExtendWindow();
  if (!changed) return;

  const keep = body.scrollLeft;
  renderHourHeaders();
  renderDriverRows();                 // restores `keep` internally
  const compensated = keep + shiftPx;
  body.scrollLeft = compensated;
  const hours = document.getElementById('timelineHours');
  if (hours) hours.scrollLeft = compensated;
  if (_desiredScrollPx != null) _desiredScrollPx += shiftPx;
  updateRealtimeTimeline();
}

let onDateChange = null;
let onViewportDateChange = null;

/**
 * Register a callback fired after an EXPLICIT date-nav (Prev/Next/date-input/
 * Today). app.js uses it to keep the List/Daftar view in sync. A plain
 * scroll that only moves the header viewport does NOT fire it.
 */
export function registerDateChangeCallback(fn) {
  onDateChange = fn;
}

/**
 * Register a callback fired whenever the header VIEWPORT date changes — incl.
 * on a plain horizontal scroll past the current day. app.js uses it to keep
 * the PBSI datepicker trigger text in step with `#filterDate.value` (which
 * updateDateLabel() writes without a `change` event). Deliberately does NOT
 * re-render the List/Daftar view (that follows the explicit anchor only).
 */
export function registerViewportDateCallback(fn) {
  onViewportDateChange = fn;
}

/**
 * Set current date (the explicit ANCHOR). Rebuilds the window around it and
 * resets auto-focus so the next render positions to it.
 */
export function setCurrentDate(dateStr) {
  currentDate = dateStr;
  viewportDate = dateStr;
  lastFocusAnchor = null;
  userMovedTimeline = false;
  _desiredScrollPx = null;
  _autoFocusTries = 0;
  if (_autoFocusRaf) { cancelAnimationFrame(_autoFocusRaf); _autoFocusRaf = 0; }
  cancelSmoothScroll();
  buildWindow(dateStr);
}

/** The explicit anchor date (List/Daftar view + window centering). */
export function getCurrentDate() {
  return currentDate;
}

/** The day the scroll VIEWPORT currently shows (header label). */
export function getViewportDate() {
  return viewportDate;
}

export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/**
 * Initialize date navigation. Prev / Next / date-input / "Hari Ini" are now
 * smooth-scroll shortcuts across the continuous canvas — they only trigger a
 * full rebuild when the target falls outside the current window (Part 14/15/16).
 */
export function initDateControls() {
  const input = document.getElementById('filterDate');
  if (!input) return;

  input.value = currentDate;

  const goToDate = (target) => {
    cancelSmoothScroll();
    currentDate = target;
    viewportDate = target;
    input.value = target;
    userMovedTimeline = false;
    // Claim the focus for this anchor NOW so renderTimeline()'s own auto-focus
    // block is a no-op — the explicit smooth-scroll below is the sole
    // animation (no two tweens racing to different targets).
    lastFocusAnchor = target;

    const rebuilt = ensureDateInWindow(target);
    if (rebuilt) {
      renderTimeline();          // new window — rebuild DOM
    } else {
      updateDateLabel();
    }

    // Position after layout settles (a rebuild needs a frame).
    requestAnimationFrame(() => {
      const px = _focusPxForDate(target);
      _desiredScrollPx = px;
      smoothScrollTimelineTo(px);
    });

    onDateChange && onDateChange();
  };

  input.addEventListener('change', () => goToDate(input.value));

  const btnPrev = document.getElementById('btnPrevDate');
  if (btnPrev) btnPrev.addEventListener('click', () => goToDate(offsetDate(viewportDate, -1)));

  const btnNext = document.getElementById('btnNextDate');
  if (btnNext) btnNext.addEventListener('click', () => goToDate(offsetDate(viewportDate, 1)));

  const btnToday = document.getElementById('btnToday');
  if (btnToday) btnToday.addEventListener('click', () => goToDate(todayString()));
}

console.info('Timeline module loaded');
