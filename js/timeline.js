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

/**
 * Set current date yang sedang ditampilkan
 * @param {string} dateStr - Format YYYY-MM-DD
 */
export function setCurrentDate(dateStr) {
  currentDate = dateStr;
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

  // Auto scroll ke jam sekarang (jika menampilkan hari ini)
  if (currentDate === todayString()) {
    requestAnimationFrame(() => {
      const body = document.getElementById('timelineBody');
      if (!body) return;

      const hourWidth = getHourWidth();
      const now = new Date();
      const currentHour = now.getHours() + (now.getMinutes() / 60);
      const scrollTarget = Math.max(0, (currentHour - 2) * hourWidth);

      body.scrollLeft = scrollTarget;
    });
  }
}

/**
 * Update label tanggal di atas timeline
 * Menampilkan tanggal dalam format panjang: "Minggu, 24 Mei 2026"
 */
function updateDateLabel() {
  const label = document.getElementById('timelineDateLabel');
  if (!label) return;
  label.textContent = formatDateLong(currentDate);
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
  const body = document.getElementById('timelineBody');
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

  block.innerHTML = `
    <span class="block-purpose">${assignment.purpose}</span>
    <span class="block-time">${assignment.startTime}–${assignment.endTime}</span>
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
    document.querySelectorAll('#timelineBody .today-line').forEach(line => line.remove());
    return;
  }

  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  const hourWidth = getHourWidth();
  const leftPx = (minutesFromMidnight / 60) * hourWidth;

  document.querySelectorAll('#timelineBody .today-line').forEach(line => {
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
 * Sinkronisasi scroll horizontal antara header jam dan body
 * Ketika user scroll body ke kanan, header ikut scroll
 */
function syncTimelineScroll() {
  const body  = document.getElementById('timelineBody');
  const hours = document.getElementById('timelineHours');

  if (!body || !hours) return;

  body.addEventListener('scroll', () => {
    hours.scrollLeft = body.scrollLeft;
  });
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
