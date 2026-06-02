/* ============================================================
   VALIDATION.JS — Centralized Validation Engine v1.2.1

   Single source of truth untuk seluruh validasi PBSI Platform.

   Prinsip:
     • Pure functions — tidak ada side effects (tidak ada DOM, Firebase, toast)
     • Composable — validator domain menggabungkan validator primitif
     • Extensible — tambah domain baru via ValidationRegistry
     • Backward compatible — tidak memaksa perubahan pada kode existing

   Return format standar untuk semua validator:
     { valid: boolean, errors: string[], warnings: string[] }

   Integrasi v1.2.1:
     Siap diimport. Belum menggantikan inline validasi existing.
     Lihat komentar "Integration point:" di setiap domain validator.

   Roadmap:
     v1.2.2 — Odometer Foundation: wiring validateOdometer ke form
     v1.2.3 — Policy Engine: validatePolicy (aturan bisnis lintas entitas)
     v1.2.4 — Sanity Check Engine: validasi konsistensi data antar koleksi
   ============================================================ */

'use strict';

import { DEFAULT_DRIVERS, VEHICLES } from './drivers.js';

/* ── Constants ─────────────────────────────────────────────── */

const VALID_STATUSES  = ['assigned', 'started', 'completed'];
const VALID_ROLES     = ['admin', 'bidang', 'driver', 'viewer'];

// Derived from drivers.js — single source of truth
const KNOWN_VEHICLE_NAMES = Object.keys(VEHICLES);
const KNOWN_DRIVER_NAMES  = DEFAULT_DRIVERS.map(d => d.name);

// Regex patterns (mirrored from existing inline usage for consistency)
const TIME_REGEX        = /^\d{2}:\d{2}$/;
const STRICT_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PIN_REGEX         = /^\d{4}$/;
const USERNAME_REGEX    = /^[a-z0-9._-]{3,30}$/;
const CHAT_ID_REGEX     = /^-?\d+$/;

// Odometer: jump > this (km) triggers a warning (not a hard error)
const ODOMETER_WARN_JUMP_KM = 2000;

/* ── Core Result Helpers ───────────────────────────────────── */

/**
 * Create a ValidationResult.
 * @param {string[]} errors
 * @param {string[]} warnings
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function createResult(errors = [], warnings = []) {
  return {
    valid: errors.length === 0,
    errors: [...errors],
    warnings: [...warnings],
  };
}

/**
 * Merge multiple ValidationResults into one combined result.
 * valid = true only when ALL results have zero errors.
 * @param {...{ valid: boolean, errors: string[], warnings: string[] }} results
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function mergeResults(...results) {
  const errors   = results.flatMap(r => r.errors   || []);
  const warnings = results.flatMap(r => r.warnings || []);
  return createResult(errors, warnings);
}

/* ── Primitive Validators ──────────────────────────────────── */

/**
 * Validate that a value is not null / undefined / empty string.
 * @param {*} value
 * @param {string} fieldName - Human-readable field label for error messages
 */
export function validateRequired(value, fieldName = 'Field') {
  if (value === null || value === undefined || String(value).trim() === '') {
    return createResult([`${fieldName} wajib diisi.`]);
  }
  return createResult();
}

/**
 * Validate time string format "HH:MM" (24-hour).
 * @param {string} time
 * @param {string} fieldName
 * @param {boolean} strict - when true, also validates hour 00–23 and minute 00–59
 */
export function validateTimeFormat(time, fieldName = 'Waktu', strict = false) {
  if (!time || !String(time).trim()) {
    return createResult([`${fieldName} wajib diisi.`]);
  }
  const regex = strict ? STRICT_TIME_REGEX : TIME_REGEX;
  if (!regex.test(String(time).trim())) {
    return createResult([`${fieldName} harus dalam format HH:MM (24 jam).`]);
  }
  return createResult();
}

/**
 * Validate that endTime is strictly after startTime (both "HH:MM" strings).
 * Skips check if either value is missing.
 * @param {string} startTime
 * @param {string} endTime
 */
export function validateTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return createResult();
  if (_timeToMinutes(endTime) <= _timeToMinutes(startTime)) {
    return createResult(['Jam selesai harus lebih dari jam mulai.']);
  }
  return createResult();
}

/**
 * Validate that endDate is not before startDate (YYYY-MM-DD strings).
 * Skips check if either value is missing.
 * @param {string} startDate
 * @param {string} endDate
 */
export function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return createResult();
  if (endDate < startDate) {
    return createResult(['Tanggal selesai tidak boleh sebelum tanggal mulai.']);
  }
  return createResult();
}

/**
 * Validate PIN format: exactly 4 numeric digits.
 * @param {string|number} pin
 * @param {string} fieldName
 */
export function validatePIN(pin, fieldName = 'PIN') {
  const value = String(pin || '').trim();
  if (!value) return createResult([`${fieldName} wajib diisi.`]);
  if (!PIN_REGEX.test(value)) {
    return createResult([`${fieldName} harus tepat 4 digit angka.`]);
  }
  return createResult();
}

/**
 * Validate username format: 3–30 chars, lowercase, alphanumeric + dash/dot/underscore.
 * @param {string} username
 */
export function validateUsername(username) {
  const norm = String(username || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!norm) return createResult(['Username wajib diisi.']);
  if (!USERNAME_REGEX.test(norm)) {
    return createResult([
      'Username harus 3–30 karakter: huruf kecil, angka, titik, underscore, atau dash.',
    ]);
  }
  return createResult();
}

/**
 * Validate Telegram Chat ID: must be a non-empty numeric string (optionally negative).
 * @param {string} chatId
 */
export function validateTelegramChatId(chatId) {
  const value = String(chatId || '').trim();
  if (!value) return createResult(['Telegram Chat ID wajib diisi.']);
  if (!CHAT_ID_REGEX.test(value)) {
    return createResult(['Telegram Chat ID harus berupa angka (boleh diawali minus untuk grup).']);
  }
  return createResult();
}

/* ── Domain Validators ─────────────────────────────────────── */

/**
 * Validate a Request object (from /driver_requests).
 *
 * Checks: driver, vehicle, startDate, purpose, time (when !fullDay),
 *         endDate & date range (when multiDay).
 * Warns:  requesterName missing, driver not in known list.
 *
 * Integration point: requests.js handleRequestSubmit
 *   Replace inline checks with:
 *     const result = validateRequest(buildRequestObject());
 *     if (!result.valid) { showToast(result.errors[0]); return; }
 *
 * @param {Object} request - Normalized request object
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateRequest(request) {
  const r = request || {};
  const parts = [];

  parts.push(validateRequired(r.driver,    'Driver'));
  parts.push(validateRequired(r.vehicle,   'Kendaraan'));
  parts.push(validateRequired(r.startDate || r.date, 'Tanggal'));
  parts.push(validateRequired(r.purpose,   'Tujuan / Keperluan'));

  if (!r.fullDay) {
    parts.push(validateRequired(r.startTime, 'Jam Mulai'));
    parts.push(validateRequired(r.endTime,   'Jam Selesai'));
    parts.push(validateTimeFormat(r.startTime, 'Jam Mulai'));
    parts.push(validateTimeFormat(r.endTime,   'Jam Selesai'));
    parts.push(validateTimeRange(r.startTime,  r.endTime));
  }

  const hasEndDate = r.endDate && r.endDate !== (r.startDate || r.date);
  if (hasEndDate) {
    parts.push(validateDateRange(r.startDate || r.date, r.endDate));
  }

  const warnings = [];
  if (!r.requesterName) warnings.push('Nama pengaju tidak tercatat.');
  if (r.driver && !KNOWN_DRIVER_NAMES.includes(r.driver)) {
    warnings.push(`Driver "${r.driver}" tidak ada dalam daftar driver aktif.`);
  }
  if (r.vehicle && !KNOWN_VEHICLE_NAMES.includes(r.vehicle)) {
    warnings.push(`Kendaraan "${r.vehicle}" tidak ada dalam daftar kendaraan yang dikenal.`);
  }

  const merged = mergeResults(...parts);
  merged.warnings.push(...warnings);
  return merged;
}

/**
 * Validate an Assignment object (from /assignments).
 *
 * Checks: id, driver, vehicle, date, status, time (when !fullDay).
 * Warns:  purpose/destination missing, driver/vehicle not in known lists.
 *
 * Integration point: assignments.js handleFormSubmit, app.js save callbacks
 *   Can be used as a pre-save check before saveOneAssignment().
 *
 * @param {Object} assignment
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateAssignment(assignment) {
  const a = assignment || {};
  const parts = [];

  parts.push(validateRequired(a.id,      'ID Assignment'));
  parts.push(validateRequired(a.driver,  'Driver'));
  parts.push(validateRequired(a.vehicle, 'Kendaraan'));
  parts.push(validateRequired(a.date,    'Tanggal'));

  if (a.status !== undefined && !VALID_STATUSES.includes(a.status)) {
    parts.push(createResult([
      `Status "${a.status}" tidak valid. Harus salah satu dari: ${VALID_STATUSES.join(', ')}.`,
    ]));
  }

  if (!a.fullDay) {
    parts.push(validateRequired(a.startTime,  'Jam Mulai'));
    parts.push(validateRequired(a.endTime,    'Jam Selesai'));
    parts.push(validateTimeFormat(a.startTime, 'Jam Mulai', true));
    parts.push(validateTimeFormat(a.endTime,   'Jam Selesai', true));
    parts.push(validateTimeRange(a.startTime,  a.endTime));
  }

  const warnings = [];
  if (!a.purpose)      warnings.push('Keperluan (purpose) tidak diisi.');
  if (!a.destination)  warnings.push('Tujuan (destination) tidak diisi.');
  if (a.driver && !KNOWN_DRIVER_NAMES.includes(a.driver)) {
    warnings.push(`Driver "${a.driver}" tidak ada dalam daftar driver aktif.`);
  }
  if (a.vehicle && !KNOWN_VEHICLE_NAMES.includes(a.vehicle)) {
    warnings.push(`Kendaraan "${a.vehicle}" tidak ada dalam daftar kendaraan yang dikenal.`);
  }

  const merged = mergeResults(...parts);
  merged.warnings.push(...warnings);
  return merged;
}

/**
 * Validate a Driver entry.
 * Accepts a string (name only) OR object { name, phone }.
 *
 * Checks: name required.
 * Warns:  phone missing, name not in known drivers list.
 *
 * Integration point: drivers.js, admin user management for driver users
 *
 * @param {string|{ name: string, phone?: string }} driver
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateDriver(driver) {
  const name  = typeof driver === 'string' ? driver : (driver?.name || '');
  const phone = typeof driver === 'object' ? (driver?.phone || '') : '';

  const parts = [validateRequired(name, 'Nama Driver')];
  const warnings = [];

  if (typeof driver === 'object' && !phone) {
    warnings.push('Nomor HP driver tidak tersedia.');
  }
  if (name && !KNOWN_DRIVER_NAMES.includes(name)) {
    warnings.push(`Driver "${name}" tidak terdaftar dalam daftar driver aktif.`);
  }

  const merged = mergeResults(...parts);
  merged.warnings.push(...warnings);
  return merged;
}

/**
 * Validate a vehicle name.
 *
 * Checks: name not empty.
 * Warns:  name not in known vehicles list.
 *
 * Integration point: assignments.js, requests.js form submission
 *
 * @param {string} vehicleName
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateVehicle(vehicleName) {
  const name = String(vehicleName || '').trim();
  if (!name) return createResult(['Kendaraan wajib dipilih.']);

  const warnings = [];
  if (!KNOWN_VEHICLE_NAMES.includes(name)) {
    warnings.push(`Kendaraan "${name}" tidak ada dalam daftar yang dikenal: ${KNOWN_VEHICLE_NAMES.join(', ')}.`);
  }

  return createResult([], warnings);
}

/**
 * Validate a User object.
 *
 * Checks: username format, PIN format, role valid.
 * Warns:  displayName missing, notificationsEnabled without chatId.
 *
 * Integration point: users.js createUser / updateUser (replaces local isValidX helpers)
 *
 * @param {Object} user
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateUser(user) {
  const u = user || {};
  const parts = [];

  parts.push(validateUsername(u.username));
  if (u.pin) parts.push(validatePIN(u.pin));

  if (u.role && !VALID_ROLES.includes(u.role)) {
    parts.push(createResult([`Role "${u.role}" tidak valid. Harus salah satu dari: ${VALID_ROLES.join(', ')}.`]));
  }

  const warnings = [];
  if (!u.displayName) warnings.push('Display name tidak diisi.');
  if (u.notificationsEnabled) {
    const ids = u.telegramChatIds || {};
    if (!ids.primary) warnings.push('Notifikasi aktif tapi Telegram Chat ID belum diatur.');
  }

  const merged = mergeResults(...parts);
  merged.warnings.push(...warnings);
  return merged;
}

/**
 * Validate Odometer data — FOUNDATION ONLY (v1.2.1).
 *
 * Status: NOT YET WIRED to any UI, form, or Firebase field.
 *         Akan diaktifkan di v1.2.2 (Odometer Foundation).
 *
 * Checks: currentOdometer is a non-negative finite number.
 *         If previousOdometer provided: no backward movement.
 * Warns:  jump > ODOMETER_WARN_JUMP_KM (anomali tidak wajar).
 *
 * Integration point (v1.2.2): assignment detail modal, start/complete callbacks
 *   const result = validateOdometer({ currentOdometer, previousOdometer });
 *   if (!result.valid) { showToast(result.errors[0]); return; }
 *
 * @param {{ currentOdometer: number, previousOdometer?: number }} data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateOdometer(data) {
  const d = data || {};
  const errors   = [];
  const warnings = [];

  // ── Current odometer ──
  if (d.currentOdometer === undefined || d.currentOdometer === null || d.currentOdometer === '') {
    errors.push('Odometer saat ini wajib diisi.');
    return createResult(errors, warnings);
  }

  const current = Number(d.currentOdometer);
  if (!Number.isFinite(current)) {
    errors.push('Odometer saat ini harus berupa angka valid.');
    return createResult(errors, warnings);
  }
  if (current < 0) {
    errors.push('Odometer tidak boleh bernilai negatif.');
  }

  // ── Previous odometer (optional comparison) ──
  const hasPrev = d.previousOdometer !== undefined &&
                  d.previousOdometer !== null &&
                  d.previousOdometer !== '';

  if (hasPrev) {
    const prev = Number(d.previousOdometer);
    if (!Number.isFinite(prev)) {
      warnings.push('Odometer sebelumnya tidak dapat dibaca — perbandingan dilewati.');
    } else if (prev < 0) {
      errors.push('Odometer sebelumnya tidak boleh bernilai negatif.');
    } else if (current < prev) {
      errors.push(
        `Odometer mundur terdeteksi: saat ini ${current.toLocaleString()} km < sebelumnya ${prev.toLocaleString()} km.`
      );
    } else {
      const jump = current - prev;
      if (jump > ODOMETER_WARN_JUMP_KM) {
        warnings.push(
          `Lonjakan odometer tidak wajar: +${jump.toLocaleString()} km sejak pencatatan terakhir. Harap periksa kembali.`
        );
      }
    }
  }

  return createResult(errors, warnings);
}

/* ── Lifecycle Helpers (v1.2.3) ────────────────────────────── */

/**
 * Extract the full assignment lifecycle into a structured object.
 * Includes computed durations in milliseconds for analytics use.
 *
 * Durations are null if either endpoint timestamp is missing.
 *
 * Usage (v1.2.5 Analytics Foundation):
 *   const lc = getAssignmentLifecycle(assignment);
 *   const waitingMin = lc.approvalToStartMs / 60000;
 *
 * @param {Object} assignment
 * @returns {Object} Lifecycle snapshot with timestamps + computed durations
 */
export function getAssignmentLifecycle(assignment) {
  const a = assignment || {};

  const createdAt   = a.createdAt   || null;
  const approvedAt  = a.approvedAt  || null;
  const assignedAt  = a.assignedAt  || null;
  const startedAt   = a.startedAt   || null;
  const completedAt = a.completedAt || null;

  return {
    // Actors
    createdBy:   a.createdBy   || null,
    approvedBy:  a.approvedBy  || null,
    assignedBy:  a.assignedBy  || null,
    startedBy:   a.startedBy   || null,
    completedBy: a.completedBy || null,

    // Timestamps
    createdAt,
    approvedAt,
    assignedAt,
    startedAt,
    completedAt,

    // Odometer
    startOdometer:     a.startOdometer     ?? null,
    endOdometer:       a.endOdometer       ?? null,
    distanceTravelled: a.distanceTravelled ?? null,

    // Source
    requestId:     a.requestId || null,
    isRequestBased: Boolean(a.requestId),

    // Computed durations (ms) — foundation for Analytics v1.2.5
    // Request created → Approval
    requestToApprovalMs:  _durationMs(createdAt, approvedAt),
    // Approval → Driver starts
    approvalToStartMs:    _durationMs(approvedAt || assignedAt, startedAt),
    // Driver starts → Driver completes
    actualDurationMs:     _durationMs(startedAt, completedAt),
    // Full cycle: created → completed
    totalCycleMs:         _durationMs(createdAt, completedAt),
  };
}

/**
 * Validate that assignment lifecycle timestamps are in chronological order.
 * Returns warnings (never errors) — does NOT block workflow.
 *
 * Expected order: createdAt ≤ approvedAt ≤ assignedAt ≤ startedAt ≤ completedAt
 *
 * Integration point (v1.2.5): Analytics Foundation anomaly detection
 *
 * @param {Object} assignment
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateLifecycle(assignment) {
  const a = assignment || {};
  const warnings = [];

  const sequence = [
    { field: 'createdAt',   ts: a.createdAt },
    { field: 'approvedAt',  ts: a.approvedAt },
    { field: 'assignedAt',  ts: a.assignedAt },
    { field: 'startedAt',   ts: a.startedAt },
    { field: 'completedAt', ts: a.completedAt },
  ].filter(e => e.ts);  // only check fields that are set

  for (let i = 1; i < sequence.length; i++) {
    const prev = sequence[i - 1];
    const curr = sequence[i];
    if (new Date(curr.ts) < new Date(prev.ts)) {
      warnings.push(
        `Lifecycle anomali: ${curr.field} (${curr.ts}) lebih awal dari ${prev.field} (${prev.ts}).`
      );
    }
  }

  return createResult([], warnings);
}

/* ── Validation Registry ───────────────────────────────────── */

/**
 * Central registry of all available validators.
 *
 * Extend untuk versi berikutnya:
 *   v1.2.3  → lifecycle: validateLifecycle (audit trail order)
 *   v1.2.4  → sanity: validateSanityCheck (konsistensi data antar koleksi)
 *   v1.2.5  → analytics: powered by getAssignmentLifecycle()
 */
export const ValidationRegistry = {
  request:    validateRequest,
  assignment: validateAssignment,
  driver:     validateDriver,
  vehicle:    validateVehicle,
  user:       validateUser,
  odometer:   validateOdometer,
  lifecycle:  validateLifecycle,
};

/**
 * Run a named validator via the registry.
 * Useful for dynamic validation dispatch.
 *
 * @param {string} type - Key in ValidationRegistry
 * @param {*} data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 *
 * @example
 *   const result = validate('request', requestObject);
 *   const result = validate('odometer', { currentOdometer: 12500, previousOdometer: 11200 });
 */
export function validate(type, data) {
  const validator = ValidationRegistry[type];
  if (!validator) {
    console.warn(`[Validation] Validator tidak ditemukan: "${type}"`);
    return createResult([`Validator "${type}" tidak terdaftar dalam ValidationRegistry.`]);
  }
  return validator(data);
}

/* ── Internal Helpers ──────────────────────────────────────── */

/**
 * Compute duration in milliseconds between two ISO timestamps.
 * Returns null if either value is missing or result is negative.
 * @param {string|null} fromTs
 * @param {string|null} toTs
 * @returns {number|null}
 */
function _durationMs(fromTs, toTs) {
  if (!fromTs || !toTs) return null;
  const ms = new Date(toTs) - new Date(fromTs);
  return ms >= 0 ? ms : null;
}

/**
 * Convert "HH:MM" to total minutes since midnight.
 * Internal — use timeToMinutes from utils.js in application code.
 * @param {string} time
 * @returns {number}
 */
function _timeToMinutes(time) {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

console.info('[Validation] Engine v1.2.1 loaded');
