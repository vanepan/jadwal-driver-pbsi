/* ============================================================
   RECOVERY.JS — Pemulihan Data Assignment Historis

   Memulihkan assignment dari /driver_requests ke /assignments
   tanpa merusak data yang sudah ada.

   Cara pakai (dari browser console, login sebagai admin):

     // LANGKAH 1: Selalu jalankan dry run dulu
     const preview = await window.appDebug.recoverAssignments(true)

     // LANGKAH 2: Setelah preview OK, jalankan recovery
     await window.appDebug.recoverAssignments()

   ============================================================ */

'use strict';

import { fetchFirebaseData, saveOneAssignment } from './firebase.js';
import { requestToAssignment, normalizeRequest } from './requests.js';
import { expandDateRange } from './utils.js';
import { isAdmin, getCurrentUser } from './auth.js';

/* ── Konstanta ── */

// Tingkat keyakinan deteksi duplikat
const CONF = {
  HIGH:   'PASTI',        // requestId + date exact match → selalu skip
  MEDIUM: 'KEMUNGKINAN',  // driver + date + startTime match → skip (hati-hati)
  LOW:    'PERLU_CEK',    // driver + date only → flag, JANGAN skip
};

/* ── Helper: Deteksi Duplikat ── */

/**
 * Cari apakah request+date sudah punya assignment yang sesuai.
 * Menggunakan tiga level keyakinan.
 *
 * @param {Object[]} existingAssignments - Semua assignment saat ini
 * @param {Object}   request             - Normalized request
 * @param {string}   date               - Tanggal spesifik (YYYY-MM-DD)
 * @returns {{ assignment: Object, confidence: string } | null}
 */
function _detectDuplicate(existingAssignments, request, date) {
  // Level 1: requestId + date — PASTI sama (sudah pernah di-approve dan dibuat)
  const exactMatch = existingAssignments.find(
    a => a.requestId === request.id && a.date === date
  );
  if (exactMatch) return { assignment: exactMatch, confidence: CONF.HIGH };

  // Level 2: driver + date + startTime — kemungkinan besar sama (dibuat manual tanpa requestId)
  const timeMatch = existingAssignments.find(
    a =>
      String(a.driver || '').trim().toLowerCase() === String(request.driver || '').trim().toLowerCase() &&
      a.date      === date &&
      a.startTime === request.startTime
  );
  if (timeMatch) return { assignment: timeMatch, confidence: CONF.MEDIUM };

  // Level 3: driver + date saja — bisa beda waktu/tujuan, jangan otomatis skip
  const dateMatch = existingAssignments.find(
    a =>
      String(a.driver || '').trim().toLowerCase() === String(request.driver || '').trim().toLowerCase() &&
      a.date === date
  );
  if (dateMatch) return { assignment: dateMatch, confidence: CONF.LOW };

  return null;
}

/* ── Helper: Cetak Struktur ── */

function _printStructureAnalysis() {
  console.group('%c── LANGKAH 1: ANALISIS STRUKTUR DATA ──', 'font-weight:bold');
  console.log('Field mapping: /driver_requests → /assignments');
  console.table([
    { 'driver_requests'  : 'id',            'assignments'   : 'requestId',           'Catatan': 'Kunci dedup utama' },
    { 'driver_requests'  : 'driver',         'assignments'   : 'driver',               'Catatan': 'Direct' },
    { 'driver_requests'  : 'vehicle',        'assignments'   : 'vehicle',              'Catatan': 'Direct' },
    { 'driver_requests'  : 'startDate..endDate', 'assignments': 'date',               'Catatan': '1 assignment per tanggal' },
    { 'driver_requests'  : 'startTime',      'assignments'   : 'startTime',            'Catatan': 'Direct' },
    { 'driver_requests'  : 'endTime',        'assignments'   : 'endTime',              'Catatan': 'Direct' },
    { 'driver_requests'  : 'purpose',        'assignments'   : 'destination + purpose','Catatan': 'Nilai sama, 2 field' },
    { 'driver_requests'  : 'requesterName',  'assignments'   : 'pic',                  'Catatan': 'Renamed' },
    { 'driver_requests'  : 'notes',          'assignments'   : 'notes',                'Catatan': 'Direct' },
    { 'driver_requests'  : 'approvedBy',     'assignments'   : 'approvedBy+assignedBy','Catatan': 'Sama' },
    { 'driver_requests'  : '(drivers list)', 'assignments'   : 'phone',               'Catatan': 'Lookup dari daftar driver' },
    { 'driver_requests'  : '(tidak ada)',    'assignments'   : 'startedAt/By',        'Catatan': '⚠️ Tidak bisa dipulihkan' },
    { 'driver_requests'  : '(tidak ada)',    'assignments'   : 'completedAt/By',      'Catatan': '⚠️ Tidak bisa dipulihkan' },
  ]);
  console.groupEnd();
}

/* ── Fungsi Utama ── */

/**
 * Pulihkan assignment historis dari /driver_requests ke /assignments.
 *
 * Yang bisa dipulihkan:
 *   ✅ Assignment dari approved requests
 *   ✅ driver, vehicle, tanggal, waktu, tujuan, PIC, notes
 *   ✅ Status diinferensi: tanggal lampau → completed, mendatang → assigned
 *
 * Yang tidak bisa dipulihkan:
 *   ❌ Assignment dibuat langsung oleh admin (bukan dari request)
 *   ❌ startedAt / completedAt / startedBy / completedBy
 *
 * Idempotent: menjalankan 2x tidak membuat duplikat.
 * Kunci dedup: requestId+date (PASTI) atau driver+date+startTime (KEMUNGKINAN).
 *
 * @param {boolean} dryRun
 *   true  → hanya preview, TIDAK ada write ke Firebase
 *   false → jalankan recovery, tulis ke Firebase
 * @returns {Promise<{
 *   toRecover: number,
 *   skipped:   number,
 *   warnings:  number,
 *   preview:   Array,
 *   duplicates: Array
 * }>}
 */
export async function recoverAssignmentsFromRequests(dryRun = false) {
  // ── Admin gate ──
  if (!isAdmin()) {
    const user = getCurrentUser();
    console.error(`[RECOVERY] ⛔ Akses ditolak. "${user?.username || 'unknown'}" bukan admin.`);
    return { toRecover: 0, skipped: 0, warnings: 0, preview: [], duplicates: [], error: 'UNAUTHORIZED' };
  }

  const mode = dryRun ? '🔍 DRY RUN (tidak ada write)' : '⚡ EXECUTE';
  console.group(`%c[RECOVERY] ${mode}`, 'font-weight:bold;color:#0066cc');
  console.log(`Dijalankan oleh: ${getCurrentUser()?.username} — ${new Date().toLocaleString()}`);

  // ── Baca data ──
  console.log('\nMembaca /driver_requests dan /assignments dari Firebase...');
  const [rawRequests, rawExisting] = await Promise.all([
    fetchFirebaseData('driver_requests'),
    fetchFirebaseData('assignments'),
  ]);

  if (!rawRequests) {
    console.warn('[RECOVERY] /driver_requests kosong. Tidak ada yang bisa dipulihkan.');
    console.groupEnd();
    return { toRecover: 0, skipped: 0, warnings: 0, preview: [], duplicates: [] };
  }

  const allRequests       = Object.values(rawRequests).map(normalizeRequest).filter(r => r?.id);
  const approvedRequests  = allRequests.filter(r => r.status === 'approved');
  const existingAssignments = Object.values(rawExisting || {}).filter(a => a?.id);

  // ── LANGKAH 1: Struktur data ──
  _printStructureAnalysis();

  // ── LANGKAH 2: Statistik awal ──
  console.group('%c── LANGKAH 2: STATISTIK ──', 'font-weight:bold');
  console.log(`Total requests di /driver_requests : ${allRequests.length}`);
  console.log(`  → status approved               : ${approvedRequests.length}`);
  console.log(`  → status lainnya                : ${allRequests.length - approvedRequests.length}`);
  console.log(`Assignment saat ini di /assignments: ${existingAssignments.length}`);
  const totalDates = approvedRequests.reduce((sum, r) => {
    const dates = expandDateRange(r.startDate || r.date, r.endDate || r.startDate || r.date);
    return sum + dates.length;
  }, 0);
  console.log(`Total record yang akan dievaluasi  : ${totalDates} (setelah expand date range)`);
  console.groupEnd();

  // ── LANGKAH 3: Deteksi duplikat ──
  const today = new Date().toISOString().slice(0, 10);

  const toRecover  = [];  // assignment yang akan dibuat
  const duplicates = [];  // sudah ada — HIGH/MEDIUM → skip
  const warnings   = [];  // LOW confidence — ada driver/date sama tapi beda waktu

  for (const request of approvedRequests) {
    const dates = expandDateRange(
      request.startDate || request.date,
      request.endDate || request.startDate || request.date
    );

    for (const date of dates) {
      const dup = _detectDuplicate(existingAssignments, request, date);

      if (dup && (dup.confidence === CONF.HIGH || dup.confidence === CONF.MEDIUM)) {
        // Duplikat pasti/kemungkinan → skip
        duplicates.push({
          'Request ID'      : request.id,
          'Driver'          : request.driver,
          'Tanggal'         : date,
          'Tujuan'          : request.purpose,
          'Existing Assign.': dup.assignment.id,
          'Konfiden'        : dup.confidence,
          'Alasan skip'     : dup.confidence === CONF.HIGH
            ? `requestId "${request.id}" + date "${date}" sudah ada`
            : `driver "${request.driver}" + date "${date}" + startTime "${request.startTime}" sudah ada`,
        });
        continue;
      }

      // Buat assignment baru
      const assignment = requestToAssignment(
        request,
        { name: request.approvedBy || '' },
        date
      );

      // Inferensi status dari tanggal
      if (date < today) {
        assignment.status      = 'completed';
        assignment.completedAt = request.approvedAt || null;
        assignment.completedBy = '[dipulihkan]';
      } else {
        assignment.status = 'assigned';
      }

      // Pertahankan timestamps asli
      assignment.createdAt  = request.createdAt  || assignment.createdAt;
      assignment.approvedAt = request.approvedAt || assignment.approvedAt;

      const warningNote = dup && dup.confidence === CONF.LOW
        ? `⚠️ driver "${request.driver}" sudah ada di tanggal ini (beda waktu)`
        : '';

      if (warningNote) {
        warnings.push({
          'Request ID' : request.id,
          'Driver'     : request.driver,
          'Tanggal'    : date,
          'StartTime'  : request.startTime,
          'Peringatan' : warningNote,
        });
      }

      toRecover.push({ assignment, requestId: request.id, date, warningNote });
    }
  }

  // ── LANGKAH 3: Tampilkan duplikat ──
  console.group('%c── LANGKAH 3: DUPLIKAT TERDETEKSI ──', 'font-weight:bold');
  if (duplicates.length > 0) {
    console.log(`Total dilewati: ${duplicates.length} (duplikat terdeteksi)`);
    console.table(duplicates);
  } else {
    console.log('Tidak ada duplikat terdeteksi.');
  }
  if (warnings.length > 0) {
    console.warn(`⚠️ Peringatan (LOW confidence): ${warnings.length} record memiliki driver+date yang sama tapi beda waktu. Tetap akan dibuat.`);
    console.table(warnings);
  }
  console.groupEnd();

  // ── LANGKAH 4: Recovery plan ──
  console.group('%c── LANGKAH 4: RECOVERY PLAN ──', 'font-weight:bold');
  console.log(`akan dibuat   : ${toRecover.length} assignment`);
  console.log(`akan dilewati : ${duplicates.length} assignment (duplikat PASTI/KEMUNGKINAN)`);
  console.log(`peringatan    : ${warnings.length} assignment (LOW confidence, tetap dibuat)`);

  if (toRecover.length > 0) {
    const previewRows = toRecover.map(({ assignment, warningNote }) => ({
      'Driver'    : assignment.driver,
      'Tanggal'   : assignment.date,
      'Tujuan'    : assignment.destination,
      'Waktu'     : `${assignment.startTime}–${assignment.endTime}`,
      'Status'    : assignment.status,
      'Request ID': assignment.requestId,
      '⚠️'        : warningNote || '',
    }));
    console.table(previewRows);
  } else {
    console.log('Tidak ada assignment baru yang perlu dibuat.');
  }

  if (dryRun) {
    console.log('\n%c✋ DRY RUN selesai — tidak ada data yang ditulis ke Firebase.', 'color:orange;font-weight:bold');
    console.log('Untuk menjalankan recovery: await window.appDebug.recoverAssignments()');
    console.groupEnd();
    return {
      toRecover : toRecover.length,
      skipped   : duplicates.length,
      warnings  : warnings.length,
      preview   : toRecover.map(({ assignment, requestId, date, warningNote }) => ({
        driver      : assignment.driver,
        date,
        destination : assignment.destination,
        startTime   : assignment.startTime,
        endTime     : assignment.endTime,
        status      : assignment.status,
        requestId,
        warningNote : warningNote || null,
      })),
      duplicates,
    };
  }

  // ── LANGKAH 5: Execute ──
  if (toRecover.length === 0) {
    console.log('✅ Tidak ada yang perlu dipulihkan.');
    console.groupEnd();
    return { toRecover: 0, skipped: duplicates.length, warnings: warnings.length, preview: [], duplicates };
  }

  console.group('%c── LANGKAH 5: EKSEKUSI RECOVERY ──', 'font-weight:bold;color:green');
  let successCount = 0;
  let failCount    = 0;

  for (const { assignment } of toRecover) {
    try {
      await saveOneAssignment(assignment);
      console.log(`  ✓ ${assignment.driver} — ${assignment.date} (${assignment.status})`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ Gagal: ${assignment.driver} — ${assignment.date}`, err);
      failCount++;
    }
  }

  console.log(`\n✅ Recovery selesai: ${successCount} berhasil, ${failCount} gagal.`);
  if (successCount > 0) {
    console.log('Refresh halaman atau tunggu beberapa detik untuk melihat data terpulihkan di timeline.');
  }
  console.groupEnd();
  console.groupEnd();

  return {
    toRecover : successCount,
    skipped   : duplicates.length,
    warnings  : warnings.length,
    failed    : failCount,
    preview   : [],
    duplicates,
  };
}
