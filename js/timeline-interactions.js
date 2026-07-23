/* ============================================================
   TIMELINE-INTERACTIONS.JS — Driver Timeline Desktop Experience
   (v1.25.x Timeline Desktop Experience)

   Desktop-only (pointer:fine) additions to the Driver Timeline:
     - a custom context menu SCOPED to the timeline/assignment surface only
       (Copy / Duplicate / Delete on a block, Paste Assignment Here on empty
       space) — the browser's native context menu is untouched everywhere
       else in the app;
     - drag (move within a row = re-time; move across rows = reassign
       driver) and resize (right edge = change duration) for Planned
       ('assigned' status) blocks only. Running/Completed/Cancelled blocks
       are never draggable or resizable.

   Mobile is completely unaffected: every entry point below bails out via
   isDesktopPointer() (matches the `(pointer: coarse)` check already used by
   js/form-guard.js), so touch devices keep tap-to-open and the native
   long-press menu exactly as before.

   Reuses, never re-implements:
     - assignments.js: checkConflict/checkVehicleConflict (the SAME hard
       block the manual form uses — a drag/resize/paste can never silently
       create an overlap), createAssignmentDirect/updateAssignmentDirect
       (the SAME onSaveCallback persistence pipeline as every other write).
     - modal.js: requestDeleteAssignment (the SAME confirm + permission gate
       as the detail modal's Delete button).
     - services/driver-recommendation-engine.js: recommendDrivers +
       evaluateAvailability (the v1.25.x Recovery Buffer rules) — paste never
       fabricates availability; it keeps the original driver only when the
       buffer is actually satisfied, otherwise defers to the recommendation
       engine exactly like the spec requires.
     - timeline-clipboard.js: the session-only "internal clipboard" (never
       the OS clipboard).
   ============================================================ */

'use strict';

import { timeToMinutes, minutesToTime, showToast } from './utils.js';
import { hasPermission } from './auth.js';
import {
  getAssignments, checkConflict, checkVehicleConflict,
  createAssignmentDirect, updateAssignmentDirect,
} from './assignments.js';
import { requestDeleteAssignment } from './modal.js';
import { getCurrentDate, getHourWidth } from './timeline.js';
import { getActiveDrivers } from './drivers-store.js';
import { recommendDrivers, evaluateAvailability } from './services/driver-recommendation-engine.js';
import { getDispatchConfig } from './config/dispatch-intelligence-config.js';
import {
  copyAssignmentToClipboard, getClipboardAssignment, hasClipboardAssignment,
} from './timeline-clipboard.js';

/** pointer:coarse = touch/stylus primary input — mirrors js/form-guard.js's
 *  _isTouchDevice() convention. Every custom interaction below is desktop-only. */
function isDesktopPointer() {
  return typeof window !== 'undefined' && !!window.matchMedia && !window.matchMedia('(pointer: coarse)').matches;
}

function clampDayMinutes(m) {
  return Math.max(0, Math.min(1439, Math.round(m)));
}

/** Movement past this many pixels (from mousedown) promotes a "pending" press
 *  into an actual drag/resize. Below it, releasing the pointer is a plain
 *  click — Assignment Detail opens exactly as before. No long-press: the
 *  threshold check itself happens on the very first qualifying pointermove,
 *  so the interaction still feels immediate. */
const DRAG_THRESHOLD_PX = 5;

/** Soft/magnetic snap grid (5-minute marks). SNAP_RADIUS_MIN is deliberately
 *  < 2 so a deliberate in-between value (17:03, 17:07, 17:12 — each exactly 2
 *  minutes from its nearest mark) always stays reachable: this is a "pull
 *  when close" assist, never a hard round-to-grid. */
const SNAP_INTERVAL_MIN = 5;
const SNAP_RADIUS_MIN = 1.5;

/** @returns {{value:number, snapped:boolean}} `minutes` pulled to the nearest
 *  5-minute mark only when already within the magnetic radius of it. */
function magneticSnap(minutes) {
  const nearest = Math.round(minutes / SNAP_INTERVAL_MIN) * SNAP_INTERVAL_MIN;
  return Math.abs(minutes - nearest) <= SNAP_RADIUS_MIN
    ? { value: nearest, snapped: true }
    : { value: minutes, snapped: false };
}

/** Live time-label update while dragging/resizing — minimal visual feedback
 *  for the soft snap (the label reads clearly, and gets a subtle emphasis
 *  via .tl-drag-snapped when the current position is magnetically snapped). */
function updateBlockTimeLabel(el, startTime, endTime) {
  const label = el.querySelector('.block-time');
  if (label) label.textContent = `${startTime}–${endTime}`;
}

function getTimelineBody() {
  return document.getElementById('timelineBody') || document.getElementById('timelineGrid');
}

/* ── Styles (CSS-in-JS, mirrors js/components/assignment-dispatch-hints.js) ── */
const STYLE_ID = 'tl-interactions-styles';
const CSS = `
.tl-ctx-menu{
  position:fixed;z-index:3000;min-width:190px;
  background:var(--white, #ffffff);
  border:1px solid var(--gray-2, #eeeeee);
  border-radius:10px;
  box-shadow:0 2px 8px rgba(0,0,0,0.10), 0 16px 40px rgba(0,0,0,0.22);
  padding:5px;display:flex;flex-direction:column;gap:1px;
}
.tl-ctx-menu[hidden]{display:none;}
.tl-ctx-item{
  all:unset;box-sizing:border-box;display:block;width:100%;padding:8px 11px;border-radius:7px;
  font-size:13px;color:var(--text, #1a1a1a);cursor:pointer;
}
.tl-ctx-item:hover:not(:disabled){background:var(--gray-1, #f5f5f5);}
.tl-ctx-item:disabled{color:var(--text-muted, #757575);cursor:not-allowed;opacity:.6;}
.tl-ctx-item--danger{color:#c23b3b;}

.assignment-block[data-status="assigned"]{cursor:grab;}
.assignment-block[data-status="assigned"]:active{cursor:grabbing;}

/* v1.25.x Timeline UX Refinement — invisible-only widened resize grab zone;
   the visible 8px handle (style.css) is untouched, this only extends the
   interactive area leftward into the block's own body (never past the block's
   outer edge, so it can never bleed into a neighbouring block). */
.assignment-block[data-status="assigned"] .resize-handle::before{
  content:'';
  position:absolute;
  top:0; bottom:0;
  left:-8px; right:0;
}

.tl-drag-ghost{opacity:.9;box-shadow:var(--shadow-lg);pointer-events:none;transition:none !important;}
.tl-drag-source{opacity:.35;}
.tl-drag-valid{outline:2px solid #2f7d5b;outline-offset:1px;}
.tl-drag-invalid{outline:2px solid #c23b3b;outline-offset:1px;}
.tl-drag-snapped .block-time{opacity:1;font-weight:700;}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/* ── Context menu ──────────────────────────────────────────────────────── */

const MENU_ID = 'tlCtxMenu';
let menuContext = null;

function ensureMenu() {
  let menu = document.getElementById(MENU_ID);
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'tl-ctx-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.appendChild(menu);
  menu.addEventListener('click', onMenuClick);
  return menu;
}

function showMenu(x, y, items, context) {
  menuContext = context;
  const menu = ensureMenu();
  menu.innerHTML = items.map((it) =>
    `<button type="button" class="tl-ctx-item${it.danger ? ' tl-ctx-item--danger' : ''}" data-action="${it.action}"${it.enabled ? '' : ' disabled'}>${it.label}</button>`
  ).join('');
  menu.hidden = false;

  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = '-9999px'; menu.style.top = '-9999px';
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(x, vw - mw - 8))}px`;
  menu.style.top  = `${Math.max(4, Math.min(y, vh - mh - 8))}px`;
}

function closeMenu() {
  const menu = document.getElementById(MENU_ID);
  if (menu) menu.hidden = true;
  menuContext = null;
}

function onMenuClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  const ctx = menuContext;
  closeMenu();
  if (!ctx) return;
  if (action === 'copy') doCopy(ctx.id);
  else if (action === 'duplicate') doDuplicate(ctx.id);
  else if (action === 'delete') doDelete(ctx.id);
  else if (action === 'paste') doPaste(ctx.hoverMinutes);
}

function onTimelineContextMenu(e) {
  if (!isDesktopPointer()) return;
  const slots = e.target.closest('.driver-slots');
  if (!slots) return; // outside the timeline/assignment surface — native menu stays untouched
  e.preventDefault();

  const block = e.target.closest('.assignment-block');
  if (block) {
    const id = block.dataset.id;
    if (!getAssignments().some((a) => a.id === id)) return;
    showMenu(e.clientX, e.clientY, [
      { action: 'copy', label: 'Copy Assignment', enabled: true },
      { action: 'duplicate', label: 'Duplicate Assignment', enabled: hasPermission('create') },
      { action: 'delete', label: 'Delete Assignment', enabled: hasPermission('delete'), danger: true },
    ], { type: 'assignment', id });
  } else {
    const rect = slots.getBoundingClientRect();
    const hoverMinutes = clampDayMinutes(((e.clientX - rect.left) / getHourWidth()) * 60);
    showMenu(e.clientX, e.clientY, [
      { action: 'paste', label: 'Paste Assignment Here', enabled: hasPermission('create') && hasClipboardAssignment() },
    ], { type: 'empty', hoverMinutes });
  }
}

function onDocumentClick(e) {
  const menu = document.getElementById(MENU_ID);
  if (menu && !menu.hidden && !menu.contains(e.target)) closeMenu();
}
function onDocumentKeydown(e) { if (e.key === 'Escape') closeMenu(); }

/* ── Menu actions ──────────────────────────────────────────────────────── */

function doCopy(id) {
  const a = getAssignments().find((x) => x.id === id);
  if (!a) return;
  copyAssignmentToClipboard(a);
  showToast('📋 Assignment disalin');
}

function doDelete(id) {
  requestDeleteAssignment(id);
}

function doDuplicate(id) {
  const a = getAssignments().find((x) => x.id === id);
  if (!a) return;
  if (!hasPermission('create')) { showToast('Anda tidak punya akses untuk menambah jadwal'); return; }
  const durationMinutes = a.fullDay ? null : Math.max(15, timeToMinutes(a.endTime) - timeToMinutes(a.startTime));
  const startMinutes = a.fullDay ? 0 : timeToMinutes(a.endTime); // placed right after the original
  pasteAssignmentCore(a, { date: a.date, startMinutes, durationMinutes, fullDay: !!a.fullDay });
}

function doPaste(hoverMinutes) {
  const source = getClipboardAssignment();
  if (!source) return;
  if (!hasPermission('create')) { showToast('Anda tidak punya akses untuk menambah jadwal'); return; }
  const durationMinutes = source.fullDay ? null : Math.max(15, timeToMinutes(source.endTime) - timeToMinutes(source.startTime));
  pasteAssignmentCore(source, { date: getCurrentDate(), startMinutes: hoverMinutes, durationMinutes, fullDay: !!source.fullDay });
}

/**
 * Shared engine behind Paste and Duplicate. Driver rule (spec, Part 2 step 3):
 * keep the original driver ONLY when they are not Running and clear the
 * Recovery Buffer for the new slot; otherwise defer to recommendDrivers() —
 * never fabricate availability. A Self-Drive source (driver === '') stays
 * Self-Drive; no reassignment is attempted.
 */
function pasteAssignmentCore(source, { date, startMinutes, durationMinutes, fullDay }) {
  const startTime = fullDay ? '00:00' : minutesToTime(clampDayMinutes(startMinutes));
  const endTime   = fullDay ? '23:59' : minutesToTime(clampDayMinutes(startMinutes + durationMinutes));
  const request = { date, startTime, endTime };
  const sourceDriverName = String(source.driver || '').trim();

  let driver = '';
  let driverNote = '';

  if (sourceDriverName) {
    const mine = getAssignments().filter((x) => String(x.driver || '').trim() === sourceDriverName);
    const bufferMinutes = getDispatchConfig().recoveryBufferMinutes;
    const { running, conflict } = evaluateAvailability(mine, request, bufferMinutes);

    if (!running && !conflict) {
      driver = sourceDriverName;
    } else {
      const rec = recommendDrivers(request, getActiveDrivers(), getAssignments());
      if (rec.recommendedDriver) {
        const chosen = getActiveDrivers().find((d) => d.id === rec.recommendedDriver.driverId);
        driver = chosen ? chosen.name : '';
        driverNote = rec.recommendedDriver.bufferSatisfied
          ? ` — driver dialihkan otomatis ke ${driver} (${sourceDriverName} tidak tersedia)`
          : ` — driver dialihkan otomatis ke ${driver} (⚠ buffer pemulihan belum terpenuhi)`;
      } else {
        showToast('⚠ Tidak ada driver yang tersedia untuk ditempel di sini');
        return;
      }
    }
  }

  const result = createAssignmentDirect({
    driver, phone: source.phone || '', vehicle: source.vehicle || '',
    date, startTime, endTime, destination: source.destination || '',
    purpose: source.purpose || '', pic: source.pic || '', pax: source.pax || 0,
    notes: source.notes || '', fullDay: !!fullDay,
  });

  if (!result.ok) {
    const reason = result.reason === 'vehicle_conflict' ? 'Kendaraan sedang digunakan pada waktu ini'
      : result.reason === 'driver_conflict' ? 'Driver sudah memiliki jadwal pada waktu ini'
      : result.reason === 'permission' ? 'Anda tidak punya akses untuk menambah jadwal'
      : 'Tidak dapat menempel jadwal di sini';
    showToast(`⚠ ${reason}`);
    return;
  }
  showToast(`✅ Assignment ditempel${driverNote}`);
}

/* ── Drag (move / reassign) ──────────────────────────────────────────────
   Horizontal movement re-times the assignment (start+end shift together,
   duration fixed); crossing into another driver's row reassigns it. Both are
   one gesture — dragging the block body, as distinct from the resize-handle. */

let dragState = null;
let pointerDownAt = null; // {x,y} — drag-vs-click threshold
let pending = null; // {kind, block, assignment} — a press that hasn't crossed DRAG_THRESHOLD_PX yet

/**
 * mousedown → wait for intent → only PAST the movement threshold does this
 * become an actual drag/resize. Below the threshold, nothing here ever touches
 * the DOM or writes anything, so the native 'click' on the (untouched)
 * original block fires normally and Assignment Detail opens exactly as
 * before. This is what was broken previously: starting the drag machinery
 * immediately on pointerdown (even for a plain click) triggered a same-value
 * updateAssignmentDirect() write on pointerup, which re-rendered the timeline
 * and destroyed the block element before its own 'click' event could fire.
 */
function onBlockPointerDown(e) {
  if (!isDesktopPointer() || e.button !== 0) return;
  const block = e.target.closest('.assignment-block');
  if (!block) return;
  if (block.dataset.status !== 'assigned') return; // only Planned is draggable/resizable

  const assignment = getAssignments().find((a) => a.id === block.dataset.id);
  if (!assignment) return;

  pointerDownAt = { x: e.clientX, y: e.clientY };
  pending = { kind: e.target.closest('.resize-handle') ? 'resize' : 'move', block, assignment };
  window.addEventListener('pointermove', onPendingMove);
  window.addEventListener('pointerup', onPendingUp, { once: true });
}

function onPendingMove(e) {
  if (!pending) return;
  const dx = e.clientX - pointerDownAt.x;
  const dy = e.clientY - pointerDownAt.y;
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return; // still just a click so far

  e.preventDefault();
  window.removeEventListener('pointermove', onPendingMove);
  window.removeEventListener('pointerup', onPendingUp);
  const { kind, block, assignment } = pending;
  pending = null;

  const originEvent = { clientX: pointerDownAt.x, clientY: pointerDownAt.y, preventDefault() {}, stopPropagation() {} };
  if (kind === 'resize') {
    startResize(originEvent, block, assignment);
    if (resizeState) onResizeMove(e); // snap the ghost/resize to the pointer's CURRENT spot immediately
  } else {
    startMove(originEvent, block, assignment);
    if (dragState) onDragMove(e);
  }
}

function onPendingUp() {
  window.removeEventListener('pointermove', onPendingMove);
  pending = null; // never crossed the threshold — a plain click, nothing to clean up
}

function startMove(e, block, assignment) {
  e.preventDefault();
  const hourWidth = getHourWidth();
  const blockRect = block.getBoundingClientRect();
  const originRow = block.closest('.driver-row');

  const ghost = block.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('tl-drag-ghost');
  ghost.style.position = 'fixed';
  ghost.style.left = `${blockRect.left}px`;
  ghost.style.top = `${blockRect.top}px`;
  ghost.style.width = `${blockRect.width}px`;
  ghost.style.margin = '0';
  ghost.style.zIndex = '2000';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  block.classList.add('tl-drag-source');

  dragState = {
    id: assignment.id, block, ghost, originRow, hourWidth,
    grabOffsetX: e.clientX - blockRect.left,
    grabOffsetY: e.clientY - blockRect.top,
    ghostHeight: blockRect.height,
    durationMinutes: assignment.fullDay ? null : (timeToMinutes(assignment.endTime) - timeToMinutes(assignment.startTime)),
    fullDay: !!assignment.fullDay,
    vehicle: assignment.vehicle,
    targetDriver: assignment.driver,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    valid: true,
  };

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!dragState) return;
  const d = dragState;
  const newLeft = e.clientX - d.grabOffsetX;
  const newTop = e.clientY - d.grabOffsetY;
  d.ghost.style.left = `${newLeft}px`;
  d.ghost.style.top = `${newTop}px`;

  const centerY = newTop + d.ghostHeight / 2;
  const rowEl = document.elementFromPoint(e.clientX, centerY)?.closest('.driver-row');
  const nameEl = rowEl?.querySelector('.driver-name');
  const targetDriver = nameEl ? nameEl.textContent.trim() : d.targetDriver;
  const refSlots = (rowEl?.querySelector('.driver-slots')) || d.originRow.querySelector('.driver-slots');
  const refRect = refSlots.getBoundingClientRect();

  const date = getCurrentDate();
  let startTime = d.startTime, endTime = d.endTime, isSnapped = false;
  if (!d.fullDay) {
    const rawStartMinutes = ((newLeft - refRect.left) / d.hourWidth) * 60;
    const snap = magneticSnap(rawStartMinutes);
    const startMinutes = clampDayMinutes(snap.value);
    const endMinutes = clampDayMinutes(startMinutes + d.durationMinutes);
    startTime = minutesToTime(startMinutes);
    endTime = minutesToTime(endMinutes);
    isSnapped = snap.snapped && startMinutes === Math.round(snap.value);
    updateBlockTimeLabel(d.ghost, startTime, endTime);
  }

  const driverConflict = targetDriver !== '' && checkConflict(targetDriver, startTime, endTime, date, d.id);
  const vehicleConflict = d.vehicle !== '' && checkVehicleConflict(d.vehicle, startTime, endTime, date, d.id);
  const valid = !driverConflict && !vehicleConflict;

  d.ghost.classList.toggle('tl-drag-valid', valid);
  d.ghost.classList.toggle('tl-drag-invalid', !valid);
  d.ghost.classList.toggle('tl-drag-snapped', isSnapped);

  d.targetDriver = targetDriver;
  d.startTime = startTime;
  d.endTime = endTime;
  d.valid = valid;
}

function onDragEnd(e) {
  window.removeEventListener('pointermove', onDragMove);
  if (!dragState) return;
  const d = dragState;
  d.ghost.remove();
  d.block.classList.remove('tl-drag-source');

  suppressClickIfDragged(pointerDownAt, e);

  if (d.valid) {
    const result = updateAssignmentDirect(d.id, {
      driver: d.targetDriver, date: getCurrentDate(), startTime: d.startTime, endTime: d.endTime,
    });
    if (!result.ok) showToast('⚠ Tidak dapat memindahkan jadwal ke sini');
  }
  dragState = null;
}

/* ── Resize (right edge only — no existing left-edge implementation to reuse) ── */

let resizeState = null;

function startResize(e, block, assignment) {
  if (assignment.fullDay) return; // a full-day block already spans the day — nothing to resize
  e.preventDefault();
  e.stopPropagation();
  const hourWidth = getHourWidth();
  const slots = block.closest('.driver-slots');
  const slotsRect = slots.getBoundingClientRect();

  const timeLabel = block.querySelector('.block-time');
  resizeState = {
    id: assignment.id, block, hourWidth, slotsRect,
    startMinutesFixed: timeToMinutes(assignment.startTime),
    driver: assignment.driver, vehicle: assignment.vehicle,
    date: getCurrentDate(), originalWidth: block.style.width,
    originalLabel: timeLabel ? timeLabel.textContent : null,
    endTime: assignment.endTime, valid: true,
  };
  block.classList.add('tl-resizing');
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeEnd, { once: true });
}

function onResizeMove(e) {
  if (!resizeState) return;
  const r = resizeState;
  const rawEndMinutes = ((e.clientX - r.slotsRect.left) / r.hourWidth) * 60;
  const snap = magneticSnap(rawEndMinutes);
  const flooredSnapValue = Math.max(snap.value, r.startMinutesFixed + 15);
  const endMinutes = clampDayMinutes(flooredSnapValue);
  const isSnapped = snap.snapped && flooredSnapValue === snap.value;
  const endTime = minutesToTime(endMinutes);
  const width = ((endMinutes - r.startMinutesFixed) / 60) * r.hourWidth;
  r.block.style.width = `${Math.max(width, 20)}px`;

  const startTime = minutesToTime(r.startMinutesFixed);
  updateBlockTimeLabel(r.block, startTime, endTime);
  const driverConflict = r.driver !== '' && checkConflict(r.driver, startTime, endTime, r.date, r.id);
  const vehicleConflict = r.vehicle !== '' && checkVehicleConflict(r.vehicle, startTime, endTime, r.date, r.id);
  const valid = !driverConflict && !vehicleConflict;

  r.block.classList.toggle('tl-drag-valid', valid);
  r.block.classList.toggle('tl-drag-invalid', !valid);
  r.block.classList.toggle('tl-drag-snapped', isSnapped);
  r.endTime = endTime;
  r.valid = valid;
}

function onResizeEnd(e) {
  window.removeEventListener('pointermove', onResizeMove);
  if (!resizeState) return;
  const r = resizeState;
  r.block.classList.remove('tl-resizing', 'tl-drag-valid', 'tl-drag-invalid', 'tl-drag-snapped');

  suppressClickIfDragged(pointerDownAt, e);

  const revert = () => {
    r.block.style.width = r.originalWidth;
    const label = r.block.querySelector('.block-time');
    if (label && r.originalLabel != null) label.textContent = r.originalLabel;
  };

  if (r.valid) {
    const result = updateAssignmentDirect(r.id, { endTime: r.endTime });
    if (!result.ok) { showToast('⚠ Tidak dapat mengubah durasi jadwal'); revert(); }
  } else {
    revert(); // snap back
  }
  resizeState = null;
}

/** A completed drag/resize must not also fire the block's existing click-to-open
 *  handler (js/timeline.js) — especially since pointerup can land on a
 *  DIFFERENT block after a move. Swallow the next click only when the
 *  pointer actually travelled past a small threshold. */
function suppressClickIfDragged(downAt, upEvent) {
  if (!downAt) return;
  const dx = (upEvent?.clientX ?? downAt.x) - downAt.x;
  const dy = (upEvent?.clientY ?? downAt.y) - downAt.y;
  if (Math.hypot(dx, dy) < 4) return; // treat as a click, not a drag
  window.addEventListener('click', swallowNextClick, { capture: true, once: true });
}

function swallowNextClick(e) {
  e.stopPropagation();
  e.preventDefault();
}

/* ── Init ────────────────────────────────────────────────────────────── */

export function initTimelineInteractions() {
  ensureStyles();
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('blur', closeMenu);

  const body = getTimelineBody();
  if (!body) return;
  body.addEventListener('contextmenu', onTimelineContextMenu);
  body.addEventListener('pointerdown', onBlockPointerDown);
}
