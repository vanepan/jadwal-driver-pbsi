/* ============================================================
   FIREBASE.JS — Firebase Realtime Database Sync
   
   Firebase config, initialization, real-time synchronization,
   and data transformation between app and Firebase.
   ============================================================ */

'use strict';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, onValue, ref, set, get, update, remove, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { showToast } from './utils.js';

/* ── Firebase Configuration ── */
const firebaseConfig = {
  apiKey: 'AIzaSyDvGB_KUV-lIvV8Bv3x6CEyjmx6zB0gRow',
  authDomain: 'schedule-driver-pbsi.firebaseapp.com',
  databaseURL: 'https://schedule-driver-pbsi-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'schedule-driver-pbsi',
  storageBucket: 'schedule-driver-pbsi.firebasestorage.app',
  messagingSenderId: '389119454083',
  appId: '1:389119454083:web:cf6bcc3466b456106ce4b6',
  measurementId: 'G-J8FXX2SGHD',
};

const FIREBASE_ASSIGNMENTS_PATH = 'assignments';
const FIREBASE_REQUESTS_PATH = 'driver_requests';
const STORAGE_KEY = 'pbsi_assignments_v1';
const REQUESTS_STORAGE_KEY = 'pbsi_driver_requests_v1';

/* ── Internal State ── */
let firebaseAssignmentsRef = null;
let firebaseRequestsRef = null;
let firebaseListening = false;
let firebaseLoadedOnce = false;
let firebaseConfigWarningShown = false;

// Jumlah assignment yang diketahui ada di Firebase (dari last real-time snapshot)
// -1 = belum pernah receive data dari Firebase
let _remoteAssignmentCount = -1;

// Callback yang dipanggil saat data Firebase berubah
let onDataChangeCallback = null;
let onRequestsChangeCallback = null;

/**
 * Check apakah Firebase sudah dikonfigurasi dengan valid
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

/**
 * Tampilkan warning sekali saja jika Firebase tidak dikonfigurasi
 */
let firebaseApp = null;
let firebaseDb = null;

function showFirebaseConfigWarning() {
  if (firebaseConfigWarningShown) return;
  firebaseConfigWarningShown = true;
  console.info('Firebase belum dikonfigurasi. Data masih tersimpan lokal.');
}

function initFirebaseApp() {
  if (firebaseDb) return firebaseDb;
  try {
    firebaseApp = initializeApp(firebaseConfig);
    firebaseDb = getDatabase(firebaseApp);
    return firebaseDb;
  } catch (err) {
    console.error('Firebase init gagal:', err);
    showToast('Firebase belum bisa tersambung. Cek config Firebase.');
    return null;
  }
}

function getFirebaseRef(path) {
  if (!isFirebaseConfigured()) {
    showFirebaseConfigWarning();
    return null;
  }
  const db = firebaseDb || initFirebaseApp();
  if (!db) return null;
  return ref(db, path);
}

export async function fetchFirebaseData(path) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) return null;
  try {
    const snapshot = await get(dbRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error('Fetch Firebase data gagal:', error);
    return null;
  }
}

export function subscribeFirebasePath(path, callback, errorHandler) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) return;
  onValue(dbRef, callback, (error) => {
    console.error(`Firebase listener gagal pada ${path}:`, error);
    if (typeof errorHandler === 'function') errorHandler(error);
  });
}

export function storeFirebaseData(path, value) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) {
    showFirebaseConfigWarning();
    return Promise.resolve();
  }
  return set(dbRef, value);
}

export function updateFirebaseData(path, value) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) {
    showFirebaseConfigWarning();
    return Promise.resolve();
  }
  return update(dbRef, value);
}

/**
 * Load assignments dari localStorage
 * @returns {Array} - Daftar assignments dari cache lokal
 */
export function loadAssignments() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Load driver requests dari localStorage.
 * @returns {Array}
 */
export function loadRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Save assignments ke localStorage saja.
 * JANGAN gunakan set() ke root /assignments — overwrite penuh dapat menghapus data historis.
 * Gunakan saveOneAssignment() atau removeOneAssignment() untuk operasi Firebase.
 * @param {Array} assignments
 */
export function saveAssignments(assignments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  return Promise.resolve();
}

/**
 * Tulis SATU assignment ke Firebase secara surgical (aman).
 * Hanya menyentuh node /assignments/{id} — tidak mempengaruhi record lain.
 * @param {Object} assignment - Harus memiliki field `id`
 * @returns {Promise}
 */
export function saveOneAssignment(assignment) {
  if (!firebaseDb || !assignment?.id) return Promise.resolve();
  const assignRef = ref(firebaseDb, `${FIREBASE_ASSIGNMENTS_PATH}/${assignment.id}`);
  return set(assignRef, assignment).catch(err => {
    console.error('Firebase single-assignment save gagal:', err);
    showToast('Firebase gagal menyimpan. Data tersimpan di device ini.');
  });
}

/**
 * Hapus SATU assignment dari Firebase secara surgical (aman).
 * Hanya menghapus node /assignments/{id} — tidak mempengaruhi record lain.
 * @param {string} assignmentId
 * @returns {Promise}
 */
export function removeOneAssignment(assignmentId) {
  if (!firebaseDb || !assignmentId) return Promise.resolve();
  const assignRef = ref(firebaseDb, `${FIREBASE_ASSIGNMENTS_PATH}/${assignmentId}`);
  return remove(assignRef).catch(err => {
    console.error('Firebase single-assignment remove gagal:', err);
    showToast('Firebase gagal menghapus. Data tersimpan di device ini.');
  });
}

/**
 * Save driver requests ke localStorage dan Firebase.
 * @param {Array} requests
 * @returns {Promise}
 */
export function saveRequests(requests) {
  localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));

  if (!firebaseRequestsRef) {
    showFirebaseConfigWarning();
    return Promise.resolve();
  }

  return set(firebaseRequestsRef, itemsToFirebaseMap(requests))
    .catch(err => {
      console.error('Firebase request save gagal:', err);
      showToast('Firebase gagal menyimpan request. Data tersimpan di device ini.');
    });
}

/**
 * Konversi array assignments → Firebase map object
 * Firebase menyukai struktur object untuk real-time sync yang lebih efisien
 * @param {Array} items - Daftar assignments
 * @returns {Object} - Map dengan assignment.id sebagai key
 */
export function assignmentsToFirebaseMap(items) {
  return itemsToFirebaseMap(items);
}

/**
 * Konversi array item dengan id -> Firebase map object.
 * @param {Array} items
 * @returns {Object}
 */
export function itemsToFirebaseMap(items) {
  return items.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});
}

/**
 * Konversi Firebase map → array assignments yang ter-sort
 * @param {Object} value - Firebase object/map
 * @returns {Array} - Daftar assignments ter-sort by date & time
 */
export function firebaseMapToAssignments(value) {
  return Object.values(value || {})
    .filter(item => item && item.id)
    .sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });
}

/**
 * Konversi Firebase map -> array requests yang ter-sort.
 * @param {Object} value
 * @returns {Array}
 */
export function firebaseMapToRequests(value) {
  return Object.values(value || {})
    .filter(item => item && item.id)
    .sort((a, b) => {
      const statusOrder = { pending: 0, rejected: 1, approved: 2 };
      const statusCompare = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (statusCompare !== 0) return statusCompare;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
}

/**
 * Register callback yang dipanggil saat data Firebase berubah
 * Berguna untuk update UI ketika ada perubahan dari device lain
 * @param {Function} callback - Fungsi dengan signature: callback(updatedAssignments)
 */
export function registerDataChangeListener(callback) {
  onDataChangeCallback = callback;
}

/**
 * Register callback untuk perubahan driver_requests.
 * @param {Function} callback
 */
export function registerRequestsChangeListener(callback) {
  onRequestsChangeCallback = callback;
}

// Threshold untuk safety guard
const SAFETY_RATIO_THRESHOLD    = 0.5;  // lokal < 50% dari remote → anomali
const SAFETY_ABSOLUTE_THRESHOLD = 20;   // selisih > 20 record → anomali
const SAFETY_MIN_REMOTE         = 10;   // jangan cek jika remote < 10 (dataset kecil)

/**
 * Safety guard: cek apakah jumlah assignment lokal mencurigakan dibanding Firebase.
 *
 * Dua kondisi independen (OR) yang masing-masing dapat memicu anomali:
 *   1. Ratio: localCount / remoteCount < SAFETY_RATIO_THRESHOLD (50%)
 *   2. Absolute: remoteCount - localCount > SAFETY_ABSOLUTE_THRESHOLD (20)
 *
 * Guard TIDAK memblokir surgical writes — menulis satu record ke /assignments/{id}
 * aman berapapun remote count-nya. Guard berfungsi sebagai anomaly detector:
 * menampilkan warning + mencatat ke /logs.
 *
 * @param {number} localCount - Jumlah assignment di state lokal saat ini
 * @returns {{ safe: boolean, localCount: number, remoteCount: number, reason: string }}
 */
export function checkAssignmentSafety(localCount) {
  const result = { safe: true, localCount, remoteCount: _remoteAssignmentCount, reason: '' };

  // Belum terima snapshot Firebase — tidak bisa dibandingkan
  if (_remoteAssignmentCount < 0) return result;
  // Dataset kecil — threshold tidak bermakna
  if (_remoteAssignmentCount < SAFETY_MIN_REMOTE) return result;

  const ratio        = localCount / _remoteAssignmentCount;
  const absoluteDiff = _remoteAssignmentCount - localCount;

  const ratioFail    = ratio < SAFETY_RATIO_THRESHOLD;
  const absoluteFail = absoluteDiff > SAFETY_ABSOLUTE_THRESHOLD;

  if (ratioFail || absoluteFail) {
    const reasons = [];
    if (ratioFail)    reasons.push(`rasio ${Math.round(ratio * 100)}% < threshold ${SAFETY_RATIO_THRESHOLD * 100}%`);
    if (absoluteFail) reasons.push(`selisih absolut ${absoluteDiff} > threshold ${SAFETY_ABSOLUTE_THRESHOLD}`);
    const reason = reasons.join('; ');

    result.safe   = false;
    result.reason = reason;

    console.warn(`[SAFETY] ⚠️ Anomali (${reason}): lokal=${localCount}, remote=${_remoteAssignmentCount}`);
    showToast('⚠️ Data lokal belum sinkron penuh. Refresh halaman jika ada masalah.');
    _logSafetyAnomalyToFirebase(localCount, _remoteAssignmentCount, reason);
  }

  return result;
}

/**
 * Tulis anomali ke /logs (non-blocking, fire-and-forget).
 * @param {number} localCount
 * @param {number} remoteCount
 * @param {string} reason
 */
async function _logSafetyAnomalyToFirebase(localCount, remoteCount, reason) {
  if (!firebaseDb) return;
  try {
    const id = `anomaly_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry = {
      type: 'safety_anomaly',
      localCount,
      remoteCount,
      ratio: +(localCount / remoteCount).toFixed(3),
      absoluteDiff: remoteCount - localCount,
      reason,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent || 'unknown',
    };
    await set(ref(firebaseDb, `logs/${id}`), entry);
    console.warn('[SAFETY] Anomali dicatat ke /logs:', id);
  } catch (err) {
    console.warn('[SAFETY] Gagal catat anomali (non-fatal):', err);
  }
}

const BACKUP_RETENTION_DAYS = 30; // hapus backup lebih lama dari ini

/**
 * Buat backup harian assignments ke /backups/assignments/TIMESTAMP.
 * Dipanggil sekali per hari saat Firebase pertama kali load data.
 * Non-blocking — kegagalan backup tidak menghambat aplikasi.
 * @param {Object} rawData - Raw Firebase map dari snapshot.val()
 */
async function _backupAssignmentsOnce(rawData) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const storageKey = `pbsi_backup_done_${today}`;
  if (localStorage.getItem(storageKey)) return; // sudah backup hari ini

  try {
    const db = firebaseDb;
    if (!db || !rawData) return;
    const ts = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '');
    const backupRef = ref(db, `backups/assignments/${ts}`);
    await set(backupRef, rawData);
    localStorage.setItem(storageKey, ts);
    console.info(`[BACKUP] Dibuat: backups/assignments/${ts}`);
    // Bersihkan backup lama setelah backup baru berhasil
    _pruneOldBackups();
  } catch (err) {
    console.warn('[BACKUP] Gagal (non-fatal):', err);
  }
}

/**
 * Hapus backup yang lebih lama dari BACKUP_RETENTION_DAYS.
 * Non-blocking. Format key: YYYY-MM-DD-HHmmss
 */
async function _pruneOldBackups() {
  if (!firebaseDb) return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - BACKUP_RETENTION_DAYS);
    // Format cutoff sebagai "YYYY-MM-DD" untuk perbandingan prefix
    const cutoffPrefix = cutoff.toISOString().slice(0, 10);

    const backupsRef = ref(firebaseDb, 'backups/assignments');
    const snapshot = await get(backupsRef);
    if (!snapshot.exists()) return;

    const keys = Object.keys(snapshot.val());
    const toDelete = keys.filter(key => {
      // Key format: "2026-06-02-140532" — ambil 10 char pertama sebagai YYYY-MM-DD
      const datePart = key.slice(0, 10);
      return datePart < cutoffPrefix;
    });

    for (const key of toDelete) {
      await remove(ref(firebaseDb, `backups/assignments/${key}`));
      console.info(`[BACKUP] Dihapus (>${BACKUP_RETENTION_DAYS} hari): ${key}`);
    }

    if (toDelete.length > 0) {
      console.info(`[BACKUP] Pruning selesai: ${toDelete.length} backup lama dihapus.`);
    }
  } catch (err) {
    console.warn('[BACKUP] Pruning gagal (non-fatal):', err);
  }
}

/**
 * Initialize Firebase sync
 * - Membuka listener real-time ke database
 * - Memerbarui local assignments saat ada perubahan dari device lain
 *
 * Callback akan dipanggil saat:
 * 1. Data berhasil dimuat dari Firebase
 * 2. Ada perubahan di database (dari device lain, dsb)
 */
export function initFirebaseSync() {
  if (!isFirebaseConfigured()) {
    showFirebaseConfigWarning();
    return;
  }

  if (firebaseListening) return; // Sudah listening
  firebaseListening = true;

  const db = initFirebaseApp();
  if (!db) return;
  firebaseAssignmentsRef = ref(db, FIREBASE_ASSIGNMENTS_PATH);
  firebaseRequestsRef = ref(db, FIREBASE_REQUESTS_PATH);

  // Set up real-time listener
  onValue(firebaseAssignmentsRef, snapshot => {
    if (!snapshot.exists()) {
      firebaseLoadedOnce = true;
      return;
    }

    const updatedAssignments = firebaseMapToAssignments(snapshot.val());
    _remoteAssignmentCount = updatedAssignments.length;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAssignments));

    // Backup sekali per hari saat pertama kali data Firebase diterima
    const isFirstLoad = !firebaseLoadedOnce;
    firebaseLoadedOnce = true;
    if (isFirstLoad) {
      _backupAssignmentsOnce(snapshot.val());
    }

    if (onDataChangeCallback) {
      onDataChangeCallback(updatedAssignments);
    }
  }, err => {
    console.error('Firebase listener gagal:', err);
    showToast('Firebase gagal membaca data. Cek rules/database URL.');
  });

  onValue(firebaseRequestsRef, snapshot => {
    if (!snapshot.exists()) {
      return;
    }

    const updatedRequests = firebaseMapToRequests(snapshot.val());
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(updatedRequests));

    if (onRequestsChangeCallback) {
      onRequestsChangeCallback(updatedRequests);
    }
  }, err => {
    console.error('Firebase request listener gagal:', err);
    showToast('Firebase gagal membaca request. Cek rules/database URL.');
  });
}

/**
 * Check apakah Firebase sudah selesai load data pertama kali
 * Berguna untuk tahu kapan bisa render UI dengan data Firebase
 * @returns {boolean}
 */
export function hasFirebaseLoaded() {
  return firebaseLoadedOnce;
}

/**
 * Get Firebase requests reference.
 * @returns {Object|null}
 */
export function getFirebaseRequestsRef() {
  return firebaseRequestsRef;
}

/**
 * Atomically acquire the next reimbursement document number for a given month.
 * Counter stored at: reimbursement_counters/{YYYY_MM}
 * Resets every month. Format: "PBSI/RMB/YYYY/MM/NNNN"
 *
 * @param {string} dateStr - Assignment date in YYYY-MM-DD format
 * @returns {Promise<string>} - Formatted document number
 */
export async function acquireReimbursementDocNumber(dateStr) {
  const [year, month] = String(dateStr || new Date().toISOString()).slice(0, 7).split('-');
  const key = `${year}_${month}`;

  const db = firebaseDb || initFirebaseApp();
  if (!db) {
    // Offline fallback — not sequential but avoids blank number
    return `PBSI/RMB/${year}/${month}/${String(Date.now()).slice(-4).padStart(4, '0')}`;
  }

  const counterRef = ref(db, `reimbursement_counters/${key}`);
  try {
    const result = await runTransaction(counterRef, (current) => (current || 0) + 1);
    const n = result.snapshot.val() ?? 1;
    return `PBSI/RMB/${year}/${month}/${String(n).padStart(4, '0')}`;
  } catch (err) {
    console.error('[RMB] Gagal acquire nomor dokumen:', err);
    return `PBSI/RMB/${year}/${month}/${String(Date.now()).slice(-4).padStart(4, '0')}`;
  }
}

console.info('Firebase module loaded');
