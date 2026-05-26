/* ============================================================
   FIREBASE.JS — Firebase Realtime Database Sync
   
   Firebase config, initialization, real-time synchronization,
   and data transformation between app and Firebase.
   ============================================================ */

'use strict';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, onValue, ref, set } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
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
const STORAGE_KEY = 'pbsi_assignments_v1';

/* ── Internal State ── */
let firebaseAssignmentsRef = null;
let firebaseListening = false;
let firebaseLoadedOnce = false;
let firebaseConfigWarningShown = false;

// Callback yang dipanggil saat data Firebase berubah
let onDataChangeCallback = null;

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
function showFirebaseConfigWarning() {
  if (firebaseConfigWarningShown) return;
  firebaseConfigWarningShown = true;
  console.info('Firebase belum dikonfigurasi. Data masih tersimpan lokal.');
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
 * Save assignments ke localStorage dan Firebase (jika terhubung)
 * @param {Array} assignments - Daftar assignments yang akan disimpan
 * @returns {Promise}
 */
export function saveAssignments(assignments) {
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

/**
 * Konversi array assignments → Firebase map object
 * Firebase menyukai struktur object untuk real-time sync yang lebih efisien
 * @param {Array} items - Daftar assignments
 * @returns {Object} - Map dengan assignment.id sebagai key
 */
export function assignmentsToFirebaseMap(items) {
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
 * Register callback yang dipanggil saat data Firebase berubah
 * Berguna untuk update UI ketika ada perubahan dari device lain
 * @param {Function} callback - Fungsi dengan signature: callback(updatedAssignments)
 */
export function registerDataChangeListener(callback) {
  onDataChangeCallback = callback;
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

  try {
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    firebaseAssignmentsRef = ref(db, FIREBASE_ASSIGNMENTS_PATH);
  } catch (err) {
    console.error('Firebase init gagal:', err);
    showToast('Firebase belum bisa tersambung. Cek config Firebase.');
    return;
  }

  if (firebaseListening) return; // Sudah listening
  firebaseListening = true;

  // Set up real-time listener
  onValue(firebaseAssignmentsRef, snapshot => {
    if (!snapshot.exists()) {
      // Jika Firebase kosong tapi local ada data, sync ke Firebase
      firebaseLoadedOnce = true;
      return;
    }

    // Data ada di Firebase, convert dan update
    const updatedAssignments = firebaseMapToAssignments(snapshot.val());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAssignments));
    firebaseLoadedOnce = true;

    // Panggil callback untuk update UI
    if (onDataChangeCallback) {
      onDataChangeCallback(updatedAssignments);
    }
  }, err => {
    console.error('Firebase listener gagal:', err);
    showToast('Firebase gagal membaca data. Cek rules/database URL.');
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
 * Get Firebase reference (untuk testing atau operasi advanced)
 * @returns {Object|null}
 */
export function getFirebaseRef() {
  return firebaseAssignmentsRef;
}

console.info('Firebase module loaded');
