import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, onValue, ref, set } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

/* ============================================================
   PBSI Driver Scheduler — script.js
   Vanilla JavaScript + Firebase Realtime Database
   ============================================================ */

'use strict';

/* ============================================================
   0. FIREBASE CONFIG

   Isi value di bawah dari Firebase Console:
   Project settings -> General -> Your apps -> Web app config.

   Pastikan Realtime Database sudah dibuat, lalu publish rules dari
   firebase-rules.json untuk mode sederhana tanpa login.
   ============================================================ */

const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

const FIREBASE_ASSIGNMENTS_PATH = 'assignments';

/* ============================================================
   1. DATA: DAFTAR DRIVER & KENDARAAN
   ============================================================ */

// Daftar driver default. Tambah/edit driver di sini.
const DEFAULT_DRIVERS = [
  { name: 'Igo',  phone: '+62 813-1107-3261' },
  { name: 'Dedi', phone: '+62 818-0693-4345' },
  { name: 'Aria', phone: '+62 813-8954-1138' },
];

// Daftar kendaraan beserta warna blok timeline
const VEHICLES = {
  'Innova':   '#1565C0',
  'Luxio':    '#2E7D32',
  'Polytron': '#E65100',
  'Hiace':    '#6A1B9A',
};

/* ============================================================
   2. STATE: DATA ASSIGNMENT (Firebase + cache LocalStorage)
   ============================================================ */

const STORAGE_KEY = 'pbsi_assignments_v1';

// Muat cache lokal dulu supaya app tetap bisa tampil sebelum Firebase siap.
let assignments = loadAssignments();
let firebaseAssignmentsRef = null;
let firebaseListening = false;
let firebaseLoadedOnce = false;
let firebaseConfigWarningShown = false;

function loadAssignments() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveAssignments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));

  if (!firebaseAssignmentsRef) {
    showFirebaseConfigWarning();
    return Promise.resolve();
  }

  return set(firebaseAssignmentsRef, assignmentsToFirebaseMap(assignments))
    .catch(err => {
      console.error('Firebase save gagal:', err);
      showToast('Firebase gagal menyimpan. Data tersimpan di device ini.');
    });
}

// Generate ID unik sederhana
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function initFirebaseSync() {
  if (!isFirebaseConfigured()) {
    showFirebaseConfigWarning();
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    firebaseAssignmentsRef = ref(db, FIREBASE_ASSIGNMENTS_PATH);
  } catch (err) {
    console.error('Firebase init gagal:', err);
    showToast('Firebase belum bisa tersambung. Cek config Firebase.');
    return;
  }

  if (firebaseListening) return;
  firebaseListening = true;

  onValue(firebaseAssignmentsRef, snapshot => {
    if (!snapshot.exists()) {
      if (!firebaseLoadedOnce && assignments.length > 0) {
        saveAssignments();
      }
      firebaseLoadedOnce = true;
      return;
    }

    assignments = firebaseMapToAssignments(snapshot.val());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
    firebaseLoadedOnce = true;
    renderTimeline();

    if (viewingId && !assignments.some(a => a.id === viewingId)) {
      closeDetailModal();
    }
  }, err => {
    console.error('Firebase listener gagal:', err);
    showToast('Firebase gagal membaca data. Cek rules/database URL.');
  });
}

function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

function showFirebaseConfigWarning() {
  if (firebaseConfigWarningShown) return;
  firebaseConfigWarningShown = true;
  console.info('Firebase belum dikonfigurasi. Data masih tersimpan lokal.');
}

function assignmentsToFirebaseMap(items) {
  return items.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});
}

function firebaseMapToAssignments(value) {
  return Object.values(value || {})
    .filter(item => item && item.id)
    .sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });
}

/* ============================================================
   3. STATE: TANGGAL YANG SEDANG DITAMPILKAN
   ============================================================ */

// Gunakan tanggal hari ini sebagai default
let currentDate = todayString();

// Mengembalikan tanggal hari ini dalam format YYYY-MM-DD
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/* ============================================================
   4. INISIALISASI SAAT DOM SIAP
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initDriverSelect();      // Isi dropdown driver di form
  initDateControls();      // Inisialisasi kontrol tanggal
  renderTimeline();        // Render timeline pertama kali
  initFirebaseSync();      // Sinkronisasi realtime antar device
  initFormHandlers();      // Event listener form
  initModalHandlers();     // Event listener modal
});

/* ============================================================
   5. INISIALISASI DROPDOWN DRIVER DI FORM
   ============================================================ */

function initDriverSelect() {
  const sel = document.getElementById('fieldDriver');
  sel.innerHTML = '<option value="">-- Pilih Driver --</option>';
  DEFAULT_DRIVERS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });

  // Saat driver dipilih, otomatis isi nomor HP
  sel.addEventListener('change', () => {
    const driver = DEFAULT_DRIVERS.find(d => d.name === sel.value);
    document.getElementById('fieldPhone').value = driver ? driver.phone : '';
  });
}

/* ============================================================
   6. KONTROL TANGGAL (Filter, Prev, Next, Today)
   ============================================================ */

function initDateControls() {
  const input = document.getElementById('filterDate');
  input.value = currentDate;

  // Saat tanggal diubah langsung lewat input
  input.addEventListener('change', () => {
    currentDate = input.value;
    renderTimeline();
  });

  // Tombol panah kiri (hari sebelumnya)
  document.getElementById('btnPrevDate').addEventListener('click', () => {
    currentDate = offsetDate(currentDate, -1);
    input.value = currentDate;
    renderTimeline();
  });

  // Tombol panah kanan (hari berikutnya)
  document.getElementById('btnNextDate').addEventListener('click', () => {
    currentDate = offsetDate(currentDate, +1);
    input.value = currentDate;
    renderTimeline();
  });

  // Tombol "Hari Ini"
  document.getElementById('btnToday').addEventListener('click', () => {
    currentDate = todayString();
    input.value = currentDate;
    renderTimeline();
  });
}

// Menambah/mengurangi n hari dari tanggal string YYYY-MM-DD
function offsetDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ============================================================
   7. RENDER TIMELINE SCHEDULER
   ============================================================ */

function renderTimeline() {
  updateDateLabel();
  renderHourHeaders();
  renderDriverRows();
  syncTimelineScroll();
}

// Update label tanggal di atas timeline
function updateDateLabel() {
  const label = document.getElementById('timelineDateLabel');
  const d = new Date(currentDate + 'T00:00:00');
  label.textContent = d.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// Render header jam (00:00 – 24:00)
function renderHourHeaders() {
  const container = document.getElementById('timelineHours');
  container.innerHTML = '';
  for (let h = 0; h <= 24; h++) {
    const cell = document.createElement('div');
    cell.className = 'hour-cell';
    cell.textContent = `${String(h).padStart(2, '0')}:00`;
    container.appendChild(cell);
  }
}

// Render baris setiap driver beserta blok assignment-nya
function renderDriverRows() {
  const body = document.getElementById('timelineBody');
  body.innerHTML = '';

  // Filter assignment sesuai tanggal yang dipilih
  const todayAssignments = assignments.filter(a => a.date === currentDate);

  DEFAULT_DRIVERS.forEach(driver => {
    // ── Baris driver ──
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
      driverAssignments.forEach(a => {
        const block = createAssignmentBlock(a);
        slots.appendChild(block);
      });
    }

    // Garis waktu sekarang (hanya jika tanggal yang dipilih = hari ini)
    if (currentDate === todayString()) {
      const now = new Date();
      const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
      const hourWidth = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--hour-width')) || 80;
      const leftPx = (minutesFromMidnight / 60) * hourWidth;

      const nowLine = document.createElement('div');
      nowLine.className = 'today-line';
      nowLine.style.left = `${leftPx}px`;
      slots.appendChild(nowLine);
    }

    row.appendChild(slots);
    body.appendChild(row);

    // Aktifkan drag & drop pada baris ini
    initDragDrop(slots, driver.name);
  });
}

/* ── Membuat elemen blok assignment ── */
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

  // Klik blok → tampilkan detail
  block.addEventListener('click', (e) => {
    if (!e.target.classList.contains('resize-handle')) {
      openDetailModal(assignment.id);
    }
  });

  // Aktifkan resize (drag handle kanan)
  initResize(block, assignment);

  return block;
}

/* ── Mendapatkan lebar per jam dari CSS variable ── */
function getHourWidth() {
  const w = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--hour-width')
  );
  return isNaN(w) ? 80 : w;
}

/* ── Sinkronisasi scroll horizontal header dan body ── */
function syncTimelineScroll() {
  const body  = document.getElementById('timelineBody');
  const hours = document.getElementById('timelineHours');

  body.addEventListener('scroll', () => {
    hours.scrollLeft = body.scrollLeft;
  });
  hours.addEventListener('scroll', () => {
    body.scrollLeft = hours.scrollLeft;
  });
}

/* ============================================================
   8. DRAG & DROP ASSIGNMENT
   ============================================================ */

function initDragDrop(slotsEl, driverName) {
  let draggingBlock = null;
  let dragOffsetX   = 0;
  let originalLeft  = 0;

  // Mulai drag di blok
  slotsEl.addEventListener('mousedown', startDrag, { passive: true });
  slotsEl.addEventListener('touchstart', startDragTouch, { passive: true });

  function startDrag(e) {
    // Hanya blok (bukan resize handle)
    const block = e.target.closest('.assignment-block');
    if (!block || e.target.classList.contains('resize-handle')) return;

    draggingBlock = block;
    dragOffsetX   = e.clientX - block.getBoundingClientRect().left;
    originalLeft  = parseFloat(block.style.left);

    block.style.zIndex   = '10';
    block.style.opacity  = '0.85';
    block.style.transition = 'none';

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }

  function startDragTouch(e) {
    const block = e.target.closest('.assignment-block');
    if (!block || e.target.classList.contains('resize-handle')) return;

    const touch = e.touches[0];
    draggingBlock = block;
    dragOffsetX   = touch.clientX - block.getBoundingClientRect().left;
    originalLeft  = parseFloat(block.style.left);

    block.style.zIndex  = '10';
    block.style.opacity = '0.85';
    block.style.transition = 'none';

    document.addEventListener('touchmove', onDragTouch, { passive: true });
    document.addEventListener('touchend', endDragTouch);
  }

  function onDrag(e) {
    if (!draggingBlock) return;
    moveDragging(e.clientX);
  }

  function onDragTouch(e) {
    if (!draggingBlock) return;
    moveDragging(e.touches[0].clientX);
  }

  function moveDragging(clientX) {
    const slotsRect = slotsEl.getBoundingClientRect();
    const hourWidth = getHourWidth();
    const totalWidth = 24 * hourWidth;

    // Hitung posisi baru (snap ke 15 menit)
    let newLeft = clientX - slotsRect.left - dragOffsetX + slotsEl.scrollLeft;
    const snapPx = hourWidth / 4; // 15 menit
    newLeft = Math.round(newLeft / snapPx) * snapPx;
    newLeft = Math.max(0, Math.min(newLeft, totalWidth - parseFloat(draggingBlock.style.width)));

    draggingBlock.style.left = `${newLeft}px`;
  }

  function endDrag() {
    finishDrag();
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
  }

  function endDragTouch() {
    finishDrag();
    document.removeEventListener('touchmove', onDragTouch);
    document.removeEventListener('touchend', endDragTouch);
  }

  function finishDrag() {
    if (!draggingBlock) return;

    const hourWidth = getHourWidth();
    const newLeft   = parseFloat(draggingBlock.style.left);
    const newStartMin = Math.round((newLeft / hourWidth) * 60);
    const id = draggingBlock.dataset.id;
    const asgn = assignments.find(a => a.id === id);

    if (asgn) {
      const durationMin = timeToMinutes(asgn.endTime) - timeToMinutes(asgn.startTime);
      const newEndMin   = newStartMin + durationMin;

      // Cek konflik (kecuali dengan dirinya sendiri)
      const conflict = checkConflict(asgn.driver, minutesToTime(newStartMin),
        minutesToTime(newEndMin), currentDate, id);

      if (conflict) {
        // Kembalikan ke posisi asal
        draggingBlock.style.left = `${originalLeft}px`;
        showToast('⚠️ Konflik jadwal! Assignment dikembalikan ke posisi semula.');
      } else {
        asgn.startTime = minutesToTime(newStartMin);
        asgn.endTime   = minutesToTime(newEndMin);
        saveAssignments();
        // Update teks waktu di blok
        draggingBlock.querySelector('.block-time').textContent =
          `${asgn.startTime}–${asgn.endTime}`;
      }
    }

    draggingBlock.style.zIndex    = '';
    draggingBlock.style.opacity   = '';
    draggingBlock.style.transition = '';
    draggingBlock = null;
  }
}

/* ============================================================
   9. RESIZE ASSIGNMENT (drag handle kanan)
   ============================================================ */

function initResize(block, assignment) {
  const handle = block.querySelector('.resize-handle');

  handle.addEventListener('mousedown', startResize);
  handle.addEventListener('touchstart', startResizeTouch, { passive: true });

  function startResize(e) {
    e.stopPropagation();
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', endResize);
  }

  function startResizeTouch(e) {
    e.stopPropagation();
    document.addEventListener('touchmove', onResizeTouch, { passive: true });
    document.addEventListener('touchend', endResizeTouch);
  }

  function onResize(e)      { doResize(e.clientX); }
  function onResizeTouch(e) { doResize(e.touches[0].clientX); }

  function doResize(clientX) {
    const slotsEl   = block.parentElement;
    const slotsRect = slotsEl.getBoundingClientRect();
    const hourWidth = getHourWidth();
    const snapPx    = hourWidth / 4; // snap 15 menit

    const left    = parseFloat(block.style.left);
    let newWidth  = clientX - slotsRect.left + slotsEl.scrollLeft - left;
    newWidth = Math.round(newWidth / snapPx) * snapPx;
    newWidth = Math.max(snapPx, newWidth);

    block.style.width = `${newWidth}px`;

    // Update preview waktu selesai
    const newEndMin = Math.round((left + newWidth) / hourWidth * 60);
    block.querySelector('.block-time').textContent =
      `${assignment.startTime}–${minutesToTime(newEndMin)}`;
  }

  function endResize() {
    finishResize();
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', endResize);
  }

  function endResizeTouch() {
    finishResize();
    document.removeEventListener('touchmove', onResizeTouch);
    document.removeEventListener('touchend', endResizeTouch);
  }

  function finishResize() {
    const hourWidth = getHourWidth();
    const left      = parseFloat(block.style.left);
    const width     = parseFloat(block.style.width);
    const newEndMin = Math.round((left + width) / hourWidth * 60);
    const newEnd    = minutesToTime(Math.min(newEndMin, 24 * 60));

    // Cek konflik sebelum menyimpan
    const conflict = checkConflict(assignment.driver, assignment.startTime,
      newEnd, currentDate, assignment.id);

    if (conflict) {
      // Kembalikan ukuran asal
      const origWidth = ((timeToMinutes(assignment.endTime) -
        timeToMinutes(assignment.startTime)) / 60) * hourWidth;
      block.style.width = `${origWidth}px`;
      block.querySelector('.block-time').textContent =
        `${assignment.startTime}–${assignment.endTime}`;
      showToast('⚠️ Konflik jadwal! Ukuran dikembalikan.');
    } else {
      assignment.endTime = newEnd;
      saveAssignments();
    }
  }
}

/* ============================================================
   10. CONFLICT DETECTION
   ============================================================ */

/**
 * Cek apakah ada konflik jadwal untuk driver tertentu
 * di tanggal dan rentang waktu yang diberikan.
 * excludeId: ID assignment yang sedang diedit (untuk mengabaikan dirinya sendiri)
 */
function checkConflict(driverName, startTime, endTime, date, excludeId = null) {
  const startMin = timeToMinutes(startTime);
  const endMin   = timeToMinutes(endTime);

  return assignments.some(a => {
    if (a.id === excludeId) return false;
    if (a.driver !== driverName) return false;
    if (a.date !== date) return false;

    const aStart = timeToMinutes(a.startTime);
    const aEnd   = timeToMinutes(a.endTime);

    // Overlap jika range baru overlap dengan range yang ada
    return startMin < aEnd && endMin > aStart;
  });
}

/* ============================================================
   11. FORM ADD / EDIT ASSIGNMENT
   ============================================================ */

// ID assignment yang sedang diedit (null = mode tambah baru)
let editingId = null;

function initFormHandlers() {
  // Buka modal tambah jadwal
  document.getElementById('btnAddAssignment').addEventListener('click', () => {
    openFormModal();
  });

  // Tombol batal di form
  document.getElementById('btnCancelForm').addEventListener('click', closeFormModal);
  document.getElementById('btnCloseForm').addEventListener('click', closeFormModal);

  // Submit form
  document.getElementById('assignmentForm').addEventListener('submit', handleFormSubmit);
}

function openFormModal(asgnId = null) {
  editingId = asgnId;
  const form = document.getElementById('assignmentForm');
  form.reset();
  document.getElementById('conflictWarning').style.display = 'none';
  document.getElementById('modalFormTitle').textContent =
    asgnId ? 'Edit Jadwal' : 'Tambah Jadwal';

  if (asgnId) {
    // Mode edit: isi form dengan data existing
    const a = assignments.find(x => x.id === asgnId);
    if (a) {
      document.getElementById('fieldId').value          = a.id;
      document.getElementById('fieldDriver').value      = a.driver;
      document.getElementById('fieldPhone').value       = a.phone;
      document.getElementById('fieldVehicle').value     = a.vehicle;
      document.getElementById('fieldDate').value        = a.date;
      document.getElementById('fieldStart').value       = a.startTime;
      document.getElementById('fieldEnd').value         = a.endTime;
      document.getElementById('fieldDestination').value = a.destination;
      document.getElementById('fieldPurpose').value     = a.purpose;
      document.getElementById('fieldPIC').value         = a.pic;
      document.getElementById('fieldPax').value         = a.pax;
      document.getElementById('fieldNotes').value       = a.notes;
    }
  } else {
    // Mode tambah: isi tanggal dengan tanggal yang sedang dilihat
    document.getElementById('fieldDate').value = currentDate;
  }

  document.getElementById('modalForm').style.display = 'flex';
}

function closeFormModal() {
  document.getElementById('modalForm').style.display = 'none';
  editingId = null;
}

function handleFormSubmit(e) {
  e.preventDefault();

  const driver      = document.getElementById('fieldDriver').value;
  const phone       = document.getElementById('fieldPhone').value;
  const vehicle     = document.getElementById('fieldVehicle').value;
  const date        = document.getElementById('fieldDate').value;
  const startTime   = document.getElementById('fieldStart').value;
  const endTime     = document.getElementById('fieldEnd').value;
  const destination = document.getElementById('fieldDestination').value.trim();
  const purpose     = document.getElementById('fieldPurpose').value.trim();
  const pic         = document.getElementById('fieldPIC').value.trim();
  const pax         = parseInt(document.getElementById('fieldPax').value) || 1;
  const notes       = document.getElementById('fieldNotes').value.trim();

  // Validasi dasar
  if (!driver || !vehicle || !date || !startTime || !endTime || !destination || !purpose) {
    showToast('⚠️ Lengkapi semua field wajib (*)');
    return;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    showToast('⚠️ Jam selesai harus lebih dari jam mulai');
    return;
  }

  // Cek konflik jadwal
  const hasConflict = checkConflict(driver, startTime, endTime, date, editingId);
  const warningEl   = document.getElementById('conflictWarning');

  if (hasConflict) {
    warningEl.style.display = 'block';
    return; // Hentikan, jangan simpan
  } else {
    warningEl.style.display = 'none';
  }

  if (editingId) {
    // Update assignment yang ada
    const idx = assignments.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      assignments[idx] = {
        id: editingId, driver, phone, vehicle, date,
        startTime, endTime, destination, purpose, pic, pax, notes,
        createdAt: assignments[idx].createdAt,
        updatedAt: new Date().toISOString(),
      };
    }
    showToast('✅ Jadwal berhasil diperbarui');
  } else {
    // Tambah assignment baru
    const newAssignment = {
      id: generateId(), driver, phone, vehicle, date,
      startTime, endTime, destination, purpose, pic, pax, notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assignments.push(newAssignment);
    showToast('✅ Jadwal berhasil ditambahkan');
  }

  saveAssignments();

  // Update tanggal yang ditampilkan ke tanggal assignment yang baru dibuat
  if (!editingId) {
    currentDate = date;
    document.getElementById('filterDate').value = currentDate;
  }

  closeFormModal();
  renderTimeline();
}

/* ============================================================
   12. MODAL DETAIL ASSIGNMENT
   ============================================================ */

let viewingId = null; // ID assignment yang sedang dilihat di modal detail

function initModalHandlers() {
  document.getElementById('btnCloseDetail').addEventListener('click', closeDetailModal);
  document.getElementById('btnCloseDetail2').addEventListener('click', closeDetailModal);

  // Tombol Edit di modal detail
  document.getElementById('btnEditAssignment').addEventListener('click', () => {
    closeDetailModal();
    openFormModal(viewingId);
  });

  // Tombol Hapus di modal detail
  document.getElementById('btnDeleteAssignment').addEventListener('click', () => {
    if (confirm('Yakin ingin menghapus jadwal ini?')) {
      assignments = assignments.filter(a => a.id !== viewingId);
      saveAssignments();
      closeDetailModal();
      renderTimeline();
      showToast('🗑 Jadwal berhasil dihapus');
    }
  });

  // Tombol Copy WhatsApp
  document.getElementById('btnCopyWA').addEventListener('click', () => {
    const text = document.getElementById('waPreviewText').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const feedback = document.getElementById('copyFeedback');
      feedback.style.display = 'inline';
      setTimeout(() => { feedback.style.display = 'none'; }, 2000);
    }).catch(() => {
      // Fallback untuk browser yang tidak support clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('📋 Tersalin ke clipboard!');
    });
  });

  // Klik di luar modal untuk menutup
  document.getElementById('modalForm').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalForm')) closeFormModal();
  });
  document.getElementById('modalDetail').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalDetail')) closeDetailModal();
  });
}

function openDetailModal(id) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;

  viewingId = id;

  // Render detail content
  const content = document.getElementById('detailContent');
  content.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Driver</span>
      <span class="detail-value">${a.driver}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">No. HP</span>
      <span class="detail-value">${a.phone || '-'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Kendaraan</span>
      <span class="detail-value">
        <span class="vehicle-badge" style="background:${VEHICLES[a.vehicle]||'#555'}">${a.vehicle}</span>
      </span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Tanggal</span>
      <span class="detail-value">${formatDateLong(a.date)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Waktu</span>
      <span class="detail-value">${a.startTime} – ${a.endTime}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Tujuan</span>
      <span class="detail-value">${a.destination}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Keperluan</span>
      <span class="detail-value">${a.purpose}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">PIC</span>
      <span class="detail-value">${a.pic || '-'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Penumpang</span>
      <span class="detail-value">${a.pax} pax</span>
    </div>
    ${a.notes ? `
    <div class="detail-row">
      <span class="detail-label">Catatan</span>
      <span class="detail-value">${a.notes}</span>
    </div>` : ''}
  `;

  // Generate dan tampilkan format WhatsApp
  document.getElementById('waPreviewText').textContent = generateWAText(a);

  document.getElementById('modalDetail').style.display = 'flex';
}

function closeDetailModal() {
  document.getElementById('modalDetail').style.display = 'none';
  document.getElementById('copyFeedback').style.display = 'none';
  viewingId = null;
}

/* ============================================================
   13. GENERATE FORMAT RINGKASAN WHATSAPP
   ============================================================ */

function generateWAText(a) {
  const dateObj  = new Date(a.date + 'T00:00:00');
  const dateStr  = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Format jam + keterangan waktu (Pagi/Siang/Sore/Malam)
  const [h, m]    = a.startTime.split(':').map(Number);
  const timeLabel = getTimePeriod(h);
  const timeStr   = `${String(h).padStart(2,'0')}.${String(m).padStart(2,'0')} (${timeLabel})`;

  const picStr  = a.pic ? `${a.pax} Pax (${a.pic})` : `${a.pax} Pax`;
  const driverPhone = a.phone ? ` ${a.phone}` : '';

  return `${a.purpose}

${dateStr}
Jam ${timeStr}
📍: ${a.destination}
🚗: ${a.vehicle}
${picStr}
Driver: ${a.vehicle} @${a.driver} PBSI${a.notes ? `\nCatatan: ${a.notes}` : ''}`;
}

// Mengembalikan label waktu berdasarkan jam
function getTimePeriod(hour) {
  if (hour >= 0 && hour < 6)  return 'Dini Hari';
  if (hour >= 6 && hour < 12) return 'Pagi';
  if (hour >= 12 && hour < 15) return 'Siang';
  if (hour >= 15 && hour < 18) return 'Sore';
  return 'Malam';
}

/* ============================================================
   14. TOAST NOTIFICATION
   ============================================================ */

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2800);
}

/* ============================================================
   15. UTILITAS WAKTU
   ============================================================ */

// "09:30" → 570 (menit dari tengah malam)
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// 570 → "09:30"
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "2026-05-24" → "Minggu, 24 Mei 2026"
function formatDateLong(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

/* ============================================================
   16. (OPSIONAL) INTEGRASI GOOGLE SHEETS
   ============================================================

   Untuk menggunakan Google Sheets sebagai database:

   1. Buat Google Sheet baru, catat Spreadsheet ID dari URL:
      https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_DI_SINI/edit

   2. Buat Google Apps Script (Extensions → Apps Script) dengan
      kode berikut, lalu deploy sebagai Web App (akses: Anyone):

      function doPost(e) {
        const sheet = SpreadsheetApp.openById('SPREADSHEET_ID').getSheets()[0];
        const data  = JSON.parse(e.postData.contents);
        if (data.action === 'save') {
          sheet.clearContents();
          data.assignments.forEach(a => {
            sheet.appendRow([a.id, a.driver, a.phone, a.vehicle, a.date,
              a.startTime, a.endTime, a.destination, a.purpose,
              a.pic, a.pax, a.notes, a.createdAt]);
          });
        }
        return ContentService.createTextOutput('OK');
      }

      function doGet() {
        const sheet = SpreadsheetApp.openById('SPREADSHEET_ID').getSheets()[0];
        const rows  = sheet.getDataRange().getValues();
        const data  = rows.map(r => ({
          id: r[0], driver: r[1], phone: r[2], vehicle: r[3], date: r[4],
          startTime: r[5], endTime: r[6], destination: r[7], purpose: r[8],
          pic: r[9], pax: r[10], notes: r[11], createdAt: r[12]
        }));
        return ContentService.createTextOutput(JSON.stringify(data))
          .setMimeType(ContentService.MimeType.JSON);
      }

   3. Ganti SCRIPT_URL di bawah dengan URL Web App yang didapat
      setelah deploy.

   4. Uncomment fungsi syncToSheets() dan panggil di saveAssignments().

// ── Konfigurasi Google Sheets (isi setelah deploy Apps Script) ──
const SHEETS_SCRIPT_URL = ''; // Isi URL Web App Apps Script di sini

async function syncToSheets() {
  if (!SHEETS_SCRIPT_URL) return;
  try {
    await fetch(SHEETS_SCRIPT_URL, {
      method: 'POST',
      mode:   'no-cors',
      body:   JSON.stringify({ action: 'save', assignments }),
    });
  } catch (err) {
    console.warn('Google Sheets sync gagal:', err);
  }
}

async function loadFromSheets() {
  if (!SHEETS_SCRIPT_URL) return;
  try {
    const res  = await fetch(SHEETS_SCRIPT_URL);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      assignments = data;
      saveAssignments();
      renderTimeline();
    }
  } catch (err) {
    console.warn('Load dari Google Sheets gagal:', err);
  }
}

   ============================================================ */
