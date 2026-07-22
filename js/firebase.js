/* ============================================================
   FIREBASE.JS — Firebase Realtime Database Sync
   
   Firebase config, initialization, real-time synchronization,
   and data transformation between app and Firebase.
   ============================================================ */

'use strict';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, onValue, ref, set, get, update, remove, runTransaction, goOffline, goOnline } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
// V2.1 — Sarpras Intelligence File Storage Foundation (src/file-storage/).
// Aliased to `storageRef` — `ref` above is already the Realtime Database
// ref() and must not be shadowed. Storage is the ONLY new Firebase product
// this milestone activates; every other export below is unchanged V1
// behavior.
import { getStorage, ref as storageRef, uploadBytes, getBytes } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import { showToast } from './utils.js';
import { getSetting } from './settings-store.js';

/* ── Backend region — must match Cloud Functions deploy region ── */
const FUNCTIONS_REGION = 'asia-southeast1';

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

/* ============================================================
   AUTH LAYER (v1.11.1.2) — Custom Authentication + auth-ready gate.

   Provides the Firebase Auth + Functions primitives consumed by
   js/auth.js. localStorage remains a write-through CACHE of the
   auth state hydrated by onAuthStateChanged; getCurrentUser() stays
   synchronous. No RTDB access should occur before authReady().
   ============================================================ */
let firebaseAuth = null;
let firebaseFunctions = null;
let _authStateCallback = null;
let _authResolved = false;
let _authReadyResolve = null;
const _authReadyPromise = new Promise((resolve) => { _authReadyResolve = resolve; });

/* ── Auth-presence signals (v1.11.3.3) ───────────────────────────
   Level-triggered orchestration hooks. onAuthAvailable fires whenever a
   live Firebase Auth user exists (warm launch, delayed restore, fresh
   login); onAuthLost fires on sign-out/expiry. These let the app drive
   auth-gated data loading as a recurring event instead of a one-shot
   bootstrap check — the iOS-PWA cold-launch fix. */
const _authAvailableCbs = [];
const _authLostCbs = [];
export function onAuthAvailable(cb) { if (typeof cb === 'function') _authAvailableCbs.push(cb); }
export function onAuthLost(cb) { if (typeof cb === 'function') _authLostCbs.push(cb); }
function _emitAuthSignal(user) {
  const cbs = user ? _authAvailableCbs : _authLostCbs;
  cbs.forEach(cb => { try { user ? cb(user) : cb(); } catch (err) { console.error('[firebase] auth signal cb failed:', err); } });
}

/**
 * Initialize the Firebase Auth layer and wire onAuthStateChanged.
 * The FIRST emission resolves authReady() (with the user or null).
 * Idempotent.
 * @returns {Object|null} Firebase Auth instance
 */
export function initFirebaseAuthLayer() {
  if (firebaseAuth) return firebaseAuth;
  const db = firebaseDb || initFirebaseApp();
  if (!db || !firebaseApp) return null;

  firebaseAuth = getAuth(firebaseApp);
  onAuthStateChanged(firebaseAuth, async (user) => {
    // Await hydration so the synchronous session cache is populated
    // BEFORE authReady() resolves and the bootstrap proceeds.
    try {
      if (typeof _authStateCallback === 'function') {
        await _authStateCallback(user);
      }
    } catch (err) {
      console.error('[firebase] auth-state callback failed:', err);
    } finally {
      if (!_authResolved) {
        _authResolved = true;
        _authReadyResolve(user);
      }
    }
    // Fire orchestration signals AFTER hydration so getCurrentUser() reflects
    // the new state when listeners react (e.g. re-subscribe admin data).
    _emitAuthSignal(user);
  });
  return firebaseAuth;
}

/**
 * Register the write-through hydration callback invoked on every
 * auth-state change (user | null). Set this BEFORE initFirebaseAuthLayer().
 * @param {Function} cb
 */
export function registerAuthStateCallback(cb) {
  _authStateCallback = cb;
}

/**
 * Promise that resolves once authentication state is known.
 * @returns {Promise<Object|null>}
 */
export function authReady() {
  return _authReadyPromise;
}

/**
 * Resolve authReady() without Firebase Auth (break-glass / direct-PIN mode).
 * @param {Object|null} value
 */
export function resolveAuthReadyManually(value) {
  if (!_authResolved) {
    _authResolved = true;
    _authReadyResolve(value || null);
  }
}

/**
 * Call the verifyPin Cloud Function (server-side PIN check + token mint).
 * @param {string} username
 * @param {string} pin
 * @returns {Promise<{ token: string, profile: Object }>}
 */
export async function callVerifyPin(username, pin) {
  if (!firebaseDb) initFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase belum siap.');
  if (!firebaseFunctions) {
    firebaseFunctions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  }
  const fn = httpsCallable(firebaseFunctions, 'verifyPin');
  const result = await fn({ username, pin });
  return result.data;
}

/**
 * Call the publishEvent Cloud Function (client → /events outbox).
 * Used for events with no authoritative data-node trigger (comment.added).
 * The server derives the actor from the verified token and restricts the
 * accepted type set — clients cannot forge authoritative events.
 * @param {{ type: string, entity: { kind: string, id: string }, payload?: Object, actorName?: string }} payload
 * @returns {Promise<{ id: string }>}
 */
export async function callPublishEvent(payload) {
  if (!firebaseDb) initFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase belum siap.');
  if (!firebaseFunctions) {
    firebaseFunctions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  }
  const fn = httpsCallable(firebaseFunctions, 'publishEvent');
  const result = await fn(payload);
  return result.data;
}

/**
 * Register a Web Push subscription for this device (v1.11.3).
 * Server-only write path into /push_subscriptions — the client never
 * writes that node directly. The server derives userId from the verified
 * token (NOT the payload), so a caller cannot register under another user.
 * @param {{ deviceId:string, subscription:Object, platform?:string, appVersion?:string }} payload
 * @returns {Promise<{ ok:boolean, created:boolean }>}
 */
export async function callRegisterPushSubscription(payload) {
  if (!firebaseDb) initFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase belum siap.');
  if (!firebaseFunctions) {
    firebaseFunctions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  }
  const fn = httpsCallable(firebaseFunctions, 'registerPushSubscription');
  const result = await fn(payload);
  return result.data;
}

/**
 * Unregister (delete) this device's push subscription (opt-out / logout).
 * @param {{ deviceId:string }} payload
 * @returns {Promise<{ ok:boolean }>}
 */
export async function callUnregisterPushSubscription(payload) {
  if (!firebaseDb) initFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase belum siap.');
  if (!firebaseFunctions) {
    firebaseFunctions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  }
  const fn = httpsCallable(firebaseFunctions, 'unregisterPushSubscription');
  const result = await fn(payload);
  return result.data;
}

/**
 * Render an Analytics Export PDF server-side (v1.12.0, Phase A).
 * Calls the exportAnalyticsReport Cloud Function (headless Chrome) with
 * the report envelope { templateId, model } and returns the rendered PDF
 * as base64. Used by the DocumentEngine 'puppeteer' backend; the browser
 * wraps the result back into a Blob (the Blob-only contract is preserved).
 * @param {{ templateId: string, model?: Object }} payload
 * @returns {Promise<{ base64: string, contentType: string, templateId: string }>}
 */
export async function callRenderAnalyticsExport(payload) {
  if (!firebaseDb) initFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase belum siap.');
  if (!firebaseFunctions) {
    firebaseFunctions = getFunctions(firebaseApp, FUNCTIONS_REGION);
  }
  const fn = httpsCallable(firebaseFunctions, 'exportAnalyticsReport');
  const result = await fn(payload);
  return result.data;
}

/**
 * Sign in with a custom token minted by verifyPin.
 * @param {string} token
 */
export async function signInWithToken(token) {
  const auth = firebaseAuth || initFirebaseAuthLayer();
  if (!auth) throw new Error('Firebase Auth belum siap.');
  return signInWithCustomToken(auth, token);
}

/** Sign out of Firebase Auth. */
export async function firebaseSignOut() {
  const auth = firebaseAuth || initFirebaseAuthLayer();
  if (!auth) return;
  return signOut(auth);
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

/* ── Typed read / subscribe (v1.11.3.3) ──────────────────────────
   Unlike fetchFirebaseData (which collapses every failure to null and is
   indistinguishable from an empty node), these distinguish ok / denied /
   error so callers never latch an empty cache on a permission_denied.
   Used by the admin data stores (users, logs). */

function _classifyFirebaseError(error) {
  const code = String(error?.code || error?.message || '');
  return /permission|denied|PERMISSION_DENIED/i.test(code) ? 'denied' : 'error';
}

/**
 * One-shot typed read.
 * @returns {Promise<{status:'ok'|'denied'|'error', value:*, code?:string}>}
 */
export async function readNode(path) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) return { status: 'error', value: null, code: 'no-ref' };
  try {
    const snapshot = await get(dbRef);
    return { status: 'ok', value: snapshot.exists() ? snapshot.val() : null };
  } catch (error) {
    const status = _classifyFirebaseError(error);
    console.error(`readNode ${path} (${status}):`, error);
    return { status, value: null, code: String(error?.code || '') };
  }
}

/**
 * Recoverable realtime subscription. Returns the modular-SDK unsubscribe
 * function so the caller can detach before re-attaching (no duplicate
 * listeners). The error path classifies denied vs error so the caller can
 * reset its state machine and re-subscribe once auth becomes available.
 * @returns {Function} unsubscribe
 */
export function subscribeNode(path, onData, { onDenied, onError } = {}) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) { if (typeof onError === 'function') onError(new Error('no-ref')); return () => {}; }
  return onValue(dbRef, onData, (error) => {
    const status = _classifyFirebaseError(error);
    console.error(`subscribeNode ${path} (${status}):`, error);
    if (status === 'denied' && typeof onDenied === 'function') onDenied(error);
    else if (typeof onError === 'function') onError(error);
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

/**
 * Atomic read-modify-write on a single node (reuses the shared runTransaction —
 * no parallel Firebase path). `updater(current)` receives the CURRENT committed
 * value (null when the node is absent) and returns the next value; returning
 * `undefined` ABORTS the transaction with no write. This prevents lost updates
 * and last-write-wins races when multiple clients mutate the same node
 * concurrently (e.g. two members joining the same assignment at once).
 * @param {string} path
 * @param {(current:*) => *} updater
 * @returns {Promise<{committed:boolean, value:*}>}
 */
export async function runNodeTransaction(path, updater) {
  const dbRef = getFirebaseRef(path);
  if (!dbRef) { showFirebaseConfigWarning(); return { committed: false, value: null }; }
  const result = await runTransaction(dbRef, (current) => updater(current));
  return { committed: !!result.committed, value: result.snapshot ? result.snapshot.val() : null };
}

/* DIAGNOSTIC (removable): force a realtime reconnect (goOffline → goOnline) so a
   tester can verify offline→reconnect from the Production Diagnostic panel. */
export function reconnectFirebaseRealtime() {
  const db = firebaseDb || initFirebaseApp();
  if (!db) return false;
  try { goOffline(db); setTimeout(() => goOnline(db), 250); return true; }
  catch (err) { console.warn('[firebase] reconnect failed', err); return false; }
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
 * Hapus backup yang lebih lama dari settings system.backupRetentionDays.
 * Non-blocking. Format key: YYYY-MM-DD-HHmmss
 */
async function _pruneOldBackups() {
  if (!firebaseDb) return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - getSetting('system.backupRetentionDays'));
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
      console.info(`[BACKUP] Dihapus (>${getSetting('system.backupRetentionDays')} hari): ${key}`);
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

/* ============================================================
   V2.1 — Sarpras Intelligence File Storage Foundation.

   PURPOSE: the ONLY Storage primitive this milestone needs — upload one
   file's bytes to the already-provisioned `firebaseConfig.storageBucket`,
   reusing the SAME firebaseApp singleton every other export in this file
   already initializes (never a second parallel Firebase app instance).

   RESPONSIBILITY: initFirebaseStorageLayer(), uploadFileToStorage(),
   downloadFileFromStorage() (V2.1.2, Document Preview — Part L).

   NON-GOALS (explicit, minimal scope): no getDownloadURL() call (no
   signed/public URLs) — downloadFileFromStorage() uses getBytes() instead,
   which requires the SAME authenticated SDK/security-rules context as any
   other read, never a public link. No delete/list/metadata-update
   helpers, no lifecycle or retention policy.
   src/file-storage/file-storage-engine.js and js/v2/ui/
   dataset-import-center.js (preview only) are the ONLY callers.
   ============================================================ */
let firebaseStorage = null;

export function initFirebaseStorageLayer() {
  if (firebaseStorage) return firebaseStorage;
  if (!firebaseApp) initFirebaseApp();
  if (!firebaseApp) return null;
  firebaseStorage = getStorage(firebaseApp);
  return firebaseStorage;
}

/**
 * Uploads one file's bytes to Firebase Storage. No download URL is ever
 * requested — the caller stores only the storage path (per this
 * milestone's explicit "no signed URLs" scope).
 * @param {string} storagePath - e.g. `sarpras-intelligence/<sha256>`
 * @param {Blob|File} file
 * @returns {Promise<{ok: boolean, fullPath: string|null, error: string|null}>}
 */
export async function uploadFileToStorage(storagePath, file) {
  const storage = firebaseStorage || initFirebaseStorageLayer();
  if (!storage) return { ok: false, fullPath: null, error: 'Firebase Storage belum siap.' };
  try {
    const target = storageRef(storage, storagePath);
    const snapshot = await uploadBytes(target, file);
    return { ok: true, fullPath: snapshot.ref.fullPath, error: null };
  } catch (err) {
    console.error('[firebase] uploadFileToStorage gagal:', err);
    return { ok: false, fullPath: null, error: err && err.message ? err.message : 'Upload gagal.' };
  }
}

/**
 * Downloads one file's real bytes for in-browser preview (Part L) — never
 * a signed/public URL, always through the authenticated SDK.
 * @param {string} storagePath
 * @returns {Promise<{ok: boolean, bytes: ArrayBuffer|null, error: string|null}>}
 */
export async function downloadFileFromStorage(storagePath) {
  const storage = firebaseStorage || initFirebaseStorageLayer();
  if (!storage) return { ok: false, bytes: null, error: 'Firebase Storage belum siap.' };
  try {
    const target = storageRef(storage, storagePath);
    const bytes = await getBytes(target);
    return { ok: true, bytes, error: null };
  } catch (err) {
    console.error('[firebase] downloadFileFromStorage gagal:', err);
    return { ok: false, bytes: null, error: err && err.message ? err.message : 'Unduh gagal.' };
  }
}

console.info('Firebase module loaded');
