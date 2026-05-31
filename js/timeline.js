/* ============================================================
   TIMELINE.JS — Timeline Scheduler Rendering
   
   Render timeline header, driver rows, assignment blocks,
   dan sinkronisasi scroll horizontal.
   ============================================================ */

'use strict';

import { todayString, formatDateLong, timeToMinutes, offsetDate } from './utils.js';
import { DEFAULT_DRIVERS, VEHICLES } from './drivers.js';
import { openDetailModal } from './modal.js';

/* ── Module State ── */
let currentDate = todayString();
let assignments = [];
let realtimeTimer = null;
let lastAutoFocusedDate = null; // track which date has already been auto-focused

function getTimelineBodyElement() {
  return document.getElementById('timelineBody') || document.getElementById('timelineGrid');
}

/**
 * Set current date yang sedang ditampilkan.
 * Resets auto-focus so the new date gets focused on next render.
 * @param {string} dateStr - Format YYYY-MM-DD
 */
export function setCurrentDate(dateStr) {
  currentDate = dateStr;
  lastAutoFocusedDate = null; // force re-focus on next renderTimeline call
}

/**
 * Get current date yang sedang ditampilkan
 * @returns {string} - Format YYYY-MM-DD
 */
export function getCurrentDate() {
  return currentDate;
}

/**
 * Set assignments array untuk rendering
 * Biasanya dipanggil dari app.js setiap kali data berubah
 * @param {Array} newAssignments - Daftar assignments
 */
export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/**
 * Render keseluruhan timeline scheduler
 * - Update label tanggal
 * - Render header jam
 * - Render baris driver + blocks
 * - Setup scroll sync
 * - Auto-scroll ke jam sekarang jika today
 */
export function renderTimeline() {
  updateDateLabel();
  renderHourHeaders();
  renderDriverRows();
  updateRealtimeTimeline();
  startRealtimeTimeline();

  // Init scroll sync hanya sekali
  if (!window.timelineScrollInitialized) {
    syncTimelineScroll();
    window.timelineScrollInitialized = true;
  }

  // Smart auto-focus: run when date changes (not on every data refresh)
  if (lastAutoFocusedDate !== currentDate) {
    lastAutoFocusedDate = currentDate;
    requestAnimationFrame(() => autoFocusTimeline());
  }

  // Debug: verify full 24-hour range is rendered and scrollable
  requestAnimationFrame(() => {
    const body = getTimelineBodyElement();
    const hoursEl = document.getElementById('timelineHours');
    if (!body) return;
    const cells = hoursEl ? hoursEl.querySelectorAll('.hour-cell') : [];
    const first = cells[0]?.textContent ?? 'N/A';
    const last  = cells[cells.length - 1]?.textContent ?? 'N/A';
    console.info('[Timeline]', {
      scrollWidth:   body.scrollWidth,
      clientWidth:   body.clientWidth,
      maxScroll:     body.scrollWidth - body.clientWidth,
      canScroll:     body.scrollWidth > body.clientWidth,
      renderedHours: cells.length,
      firstHour:     first,
      lastHour:      last,
      hourWidthPx:   getHourWidth(),
      driverColPx:   parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--driver-col')) || 0,
      expectedWidth: Math.round(24 * getHourWidth()),
    });
  });
}

/**
 * Scroll timeline to the most relevant position for the current date:
 * - Today: nearest assignment to current time, or current hour
 * - Other date with assignments: earliest assignment
 * - No assignments: default 08:00
 * Uses smooth scrolling with ~350ms feel.
 */
function autoFocusTimeline() {
  const body = getTimelineBodyElement();
  if (!body) return;

  // Don't fight an active user drag
  if (syncTimelineScroll._isPointerDown?.()) {
    lastAutoFocusedDate = null; // retry on next render after release
    return;
  }

  const hourWidth = getHourWidth();
  const dateAssignments = assignments.filter(a => a.date === currentDate);
  let targetMinutes;

  if (currentDate === todayString()) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (dateAssignments.length > 0) {
      // Nearest assignment to current time
      const nearest = dateAssignments.reduce((best, a) => {
        const diff = Math.abs(timeToMinutes(a.startTime) - nowMinutes);
        const bestDiff = Math.abs(timeToMinutes(best.startTime) - nowMinutes);
        return diff < bestDiff ? a : best;
      });
      targetMinutes = timeToMinutes(nearest.startTime);
    } else {
      targetMinutes = nowMinutes;
    }
  } else if (dateAssignments.length > 0) {
    // Earliest assignment on the selected date
    const earliest = dateAssignments.reduce((min, a) =>
      timeToMinutes(a.startTime) < timeToMinutes(min.startTime) ? a : min
    );
    targetMinutes = timeToMinutes(earliest.startTime);
  } else {
    targetMinutes = 8 * 60; // default: 08:00
  }

  // Offset by ~1.5 hours to give context before the target
  const scrollTarget = Math.max(0, ((targetMinutes / 60) - 1.5) * hourWidth);
  body.scrollTo({ left: scrollTarget, behavior: 'smooth' });
}

/**
 * Update label tanggal di atas timeline
 * Menampilkan tanggal dalam format panjang: "Minggu, 24 Mei 2026"
 */
function updateDateLabel() {
  const label = document.getElementById('timelineDateLabel');
  if (label) label.textContent = formatDateLong(currentDate);

  // Disable "Hari Ini" button when already viewing today
  const btnToday = document.getElementById('btnToday');
  if (btnToday) {
    const isToday = currentDate === todayString();
    btnToday.disabled = isToday;
    btnToday.classList.toggle('is-today', isToday);
  }
}

/**
 * Render header jam (00:00 – 24:00)
 * Setiap kolom mewakili 1 jam
 */
function renderHourHeaders() {
  const container = document.getElementById('timelineHours');
  if (!container) return;

  container.innerHTML = '';
  for (let h = 0; h <= 24; h++) {
    const cell = document.createElement('div');
    cell.className = 'hour-cell';
    cell.textContent = `${String(h).padStart(2, '0')}:00`;
    container.appendChild(cell);
  }
}

/**
 * Render baris setiap driver beserta blok assignment-nya
 */
function renderDriverRows() {
  const body = getTimelineBodyElement();
  if (!body) return;

  body.innerHTML = '';

  // Filter assignments sesuai tanggal yang dipilih
  const todayAssignments = assignments.filter(a => a.date === currentDate);

  DEFAULT_DRIVERS.forEach(driver => {
    // Buat baris driver
    const row = document.createElement('div');
    row.className = 'driver-row';

    // Label nama driver (sticky kiri)
    const label = document.createElement('div');
    label.className = 'driver-label';
    label.innerHTML = `
      <span class="driver-name">${driver.name}</span>
      <span class="driver-phone">${driver.phone}</span>
    `;
    row.appendChild(label);

    // Area slot waktu
    const slots = document.createElement('div');
    slots.className = 'driver-slots';

    // Gambar blok assignment untuk driver ini
    const driverAssignments = todayAssignments.filter(a => a.driver === driver.name);

    if (driverAssignments.length === 0) {
      // Teks hint jika tidak ada jadwal
      const hint = document.createElement('span');
      hint.className = 'empty-slots-hint';
      hint.textContent = 'Belum ada jadwal';
      slots.appendChild(hint);
    } else {
      // Render setiap assignment block
      driverAssignments.forEach(a => {
        const block = createAssignmentBlock(a);
        slots.appendChild(block);
      });
    }

    // Garis waktu sekarang (hanya jika tanggal yang dipilih = hari ini)
    if (currentDate === todayString()) {
      const now = new Date();
      const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
      const hourWidth = getHourWidth();
      const leftPx = (minutesFromMidnight / 60) * hourWidth;

      const nowLine = document.createElement('div');
      nowLine.className = 'today-line';
      nowLine.style.left = `${leftPx}px`;
      slots.appendChild(nowLine);
    }

    row.appendChild(slots);
    body.appendChild(row);
  });
}

/**
 * Buat elemen blok assignment
 * Posisi dan ukuran dihitung berdasarkan jam mulai/selesai
 * @param {Object} assignment - Assignment object
 * @returns {HTMLElement} - Assignment block element
 */
function createAssignmentBlock(assignment) {
  const hourWidth = getHourWidth();
  const startMin = timeToMinutes(assignment.startTime);
  const endMin   = timeToMinutes(assignment.endTime);
  const left  = (startMin / 60) * hourWidth;
  const width = ((endMin - startMin) / 60) * hourWidth;

  const block = document.createElement('div');
  block.className = 'assignment-block';
  block.dataset.id = assignment.id;
  block.dataset.vehicle = assignment.vehicle;
  block.style.left  = `${left}px`;
  block.style.width = `${Math.max(width, 20)}px`;
  block.style.background = VEHICLES[assignment.vehicle] || '#555';

  const isCompleted = (assignment.status ?? 'aktif') === 'selesai';
  if (isCompleted) block.classList.add('is-completed');

  block.innerHTML = `
    <span class="block-time">${assignment.startTime}–${assignment.endTime}</span>
    <span class="block-purpose">${assignment.purpose}</span>
    ${isCompleted ? '<span class="block-status-badge">✓ Selesai</span>' : ''}
    <div class="resize-handle"></div>
  `;

  // Klik blok → tampilkan detail modal
  block.addEventListener('click', (e) => {
    if (!e.target.classList.contains('resize-handle')) {
      openDetailModal(assignment.id);
    }
  });

  return block;
}

/**
 * Mendapatkan lebar per jam dari CSS variable --hour-width
 * Default 80px jika tidak ditemukan
 * @returns {number}
 */
export function getHourWidth() {
  const w = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--hour-width')
  );
  return isNaN(w) ? 80 : w;
}

function updateRealtimeTimeline() {
  const isToday = currentDate === todayString();
  const hourCells = document.querySelectorAll('#timelineHours .hour-cell');
  const now = new Date();

  hourCells.forEach((cell, index) => {
    const hour = index;
    cell.classList.toggle('hour-shaded', hour < 7 || hour >= 22);
    cell.classList.toggle('hour-current', isToday && hour === now.getHours());
  });

  if (!isToday) {
    const body = getTimelineBodyElement();
    if (body) body.querySelectorAll('.today-line').forEach(line => line.remove());
    return;
  }

  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  const hourWidth = getHourWidth();
  const leftPx = (minutesFromMidnight / 60) * hourWidth;

  const body = getTimelineBodyElement();
  if (!body) return;

  body.querySelectorAll('.today-line').forEach(line => {
    line.style.left = `${leftPx}px`;
  });
}

function startRealtimeTimeline() {
  if (realtimeTimer) return;
  realtimeTimer = setInterval(() => {
    updateRealtimeTimeline();
  }, 60 * 1000);
}

/**
 * Sinkronisasi scroll horizontal antara header jam dan body.
 * Juga mengaktifkan scroll horizontal via mouse wheel pada area timeline,
 * dan memperbarui fade indicator kiri/kanan.
 */
function syncTimelineScroll() {
  const body    = getTimelineBodyElement();
  const hours   = document.getElementById('timelineHours');
  const wrapper = document.querySelector('.timeline-wrapper');
  const fadeL   = wrapper?.querySelector('.timeline-scroll-fade-left');
  const fadeR   = wrapper?.querySelector('.timeline-scroll-fade-right');

  if (!body || !hours) return;

  // Pointer-down guard: stop auto-focus if user starts a manual drag
  let isPointerDown = false;
  body.addEventListener('pointerdown', () => { isPointerDown = true; }, { passive: true });
  window.addEventListener('pointerup',     () => { isPointerDown = false; }, { passive: true });
  window.addEventListener('pointercancel', () => { isPointerDown = false; }, { passive: true });

  // Expose for autoFocusTimeline
  syncTimelineScroll._isPointerDown = () => isPointerDown;

  // Sync hours header with body scroll
  body.addEventListener('scroll', () => {
    hours.scrollLeft = body.scrollLeft;
    updateFadeIndicators();
  });

  // Mouse-wheel → horizontal scroll on the timeline body
  if (wrapper) {
    wrapper.addEventListener('wheel', (e) => {
      // Prioritise native horizontal gestures (trackpad swipe, Shift+wheel)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        body.scrollLeft += e.deltaX;
        return;
      }
      // Convert vertical wheel to horizontal scroll
      if (e.deltaY !== 0) {
        e.preventDefault();
        const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        body.scrollLeft += delta;
      }
    }, { passive: false });
  }

  function updateFadeIndicators() {
    if (!fadeL || !fadeR) return;
    const maxScroll = body.scrollWidth - body.clientWidth;
    fadeL.style.opacity = body.scrollLeft > 16 ? '1' : '0';
    fadeR.style.opacity = body.scrollLeft < maxScroll - 16 ? '1' : '0';
  }

  // Initial state
  updateFadeIndicators();
}

/**
 * Initialize kontrol navigasi tanggal (Prev, Next, Today, Filter)
 */
export function initDateControls() {
  const input = document.getElementById('filterDate');
  if (!input) return;

  input.value = currentDate;

  // Input tanggal manual
  input.addEventListener('change', () => {
    currentDate = input.value;
    renderTimeline();
  });

  // Prev button
  const btnPrev = document.getElementById('btnPrevDate');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      currentDate = offsetDate(currentDate, -1);
      input.value = currentDate;
      renderTimeline();
    });
  }

  // Next button
  const btnNext = document.getElementById('btnNextDate');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      currentDate = offsetDate(currentDate, 1);
      input.value = currentDate;
      renderTimeline();
    });
  }

  // Today button
  const btnToday = document.getElementById('btnToday');
  if (btnToday) {
    btnToday.addEventListener('click', () => {
      currentDate = todayString();
      input.value = currentDate;
      renderTimeline();
    });
  }
}

console.info('Timeline module loaded');
