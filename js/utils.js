/* ============================================================
   UTILS.JS — Utility & Helper Functions
   
   Date/time converters, formatters, and general utilities.
   ============================================================ */

'use strict';

/**
 * Mengembalikan tanggal hari ini dalam format YYYY-MM-DD
 */
export function todayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseLocalDate(dateStr) {
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date(dateStr);
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Menggeser tanggal sebanyak n hari dari tanggal yang diberikan (timezone-safe)
 * @param {string} dateStr - Format YYYY-MM-DD
 * @param {number} days - Jumlah hari untuk digeser (bisa negatif)
 * @returns {string} - Tanggal baru dalam format YYYY-MM-DD
 */
export function offsetDate(dateStr, days) {
  const parts = dateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Konversi waktu HH:MM → menit dari tengah malam
 * @param {string} timeStr - Format HH:MM (contoh: "09:30")
 * @returns {number} - Menit dari tengah malam (contoh: 570)
 */
export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Konversi menit dari tengah malam → waktu HH:MM
 * @param {number} minutes - Menit dari tengah malam (contoh: 570)
 * @returns {string} - Waktu dalam format HH:MM (contoh: "09:30")
 */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ============================================================
   WORKING TIME & OVERTIME (v1.16.4.7)
   Single source of truth for actual working time + calendar-based
   overtime detection. Pure & DOM-free — reused by the timeline,
   the analytics engine, and the Driver Analytics KPIs.
   ============================================================ */

/**
 * Default office-hours window — mirrors settings-store DEFAULTS.operations
 * (09:00–17:00). Callers should pass the live configured window; this is
 * only the fallback when settings haven't loaded.
 */
export const DEFAULT_OFFICE_HOURS = { workStartMins: 540, workEndMins: 1020 };

/** Minutes-from-midnight (local time) for a Date. */
function _localMinsOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

/** Whole-calendar-day difference (local) between two Dates (b − a). */
function _calendarDayDiff(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/**
 * Compute actual working time + calendar-based overtime for an assignment,
 * WITHOUT mutating it.
 *
 * Reuses the existing operational ground-truth fields (no new fields):
 *   startedAt   (ISO) → actualStartAt
 *   completedAt (ISO) → actualEndAt
 * Scheduled time stays in `date` + `startTime`/`endTime` and is never touched.
 *
 * Overtime is CALENDAR-based, not duration-based: an assignment is overtime
 * when it runs on a weekend (Sat/Sun, by actualStart day) OR any engaged
 * minute falls outside the office-hours window. `overtimeHours` is the full
 * engaged time on a weekend, otherwise the engaged minutes outside office
 * hours (computed across spanned days so cross-midnight trips are correct).
 *
 * Vehicle-agnostic: uses only timestamps, so `vehicle === ''` (Tanpa
 * Kendaraan) assignments contribute working hours identically.
 *
 * @param {Object} a - assignment record
 * @param {{workStartMins:number, workEndMins:number}} [office] - office window
 * @returns {{
 *   actualStartAt:(string|null), actualEndAt:(string|null),
 *   hasStarted:boolean, hasCompleted:boolean,
 *   actualHours:(number|null), scheduledHours:(number|null), varianceHours:(number|null),
 *   isOvertime:(boolean|null), overtimeHours:number, overtimeReason:(string|null),
 *   autoIsOvertime:(boolean|null), detectionStatus:(string|null),
 *   finalStatus:(string|null), overtimeSource:string,
 *   overtimeOverrideReason:(string|null)
 * }}
 *
 * v1.16.4.9 (Overtime Administration): the system detection is exposed as
 * `detectionStatus` ('AUTO_NORMAL' | 'AUTO_LEMBUR'), and an optional admin
 * override persisted on the record (`overtimeOverride` ∈ {'NORMAL','LEMBUR'})
 * resolves the `finalStatus` ('NORMAL' | 'LEMBUR'). `isOvertime` and
 * `overtimeHours` reflect the FINAL decision, so every existing consumer
 * (timeline, analytics, KPIs) follows the administrative result automatically.
 * Backward compatible: records without the override field behave exactly as
 * before (source = 'AUTO', final = detection).
 */
export function computeWorkTime(a, office = DEFAULT_OFFICE_HOURS) {
  const workStartMins = Number(office?.workStartMins ?? DEFAULT_OFFICE_HOURS.workStartMins);
  const workEndMins   = Number(office?.workEndMins   ?? DEFAULT_OFFICE_HOURS.workEndMins);

  const actualStartAt = a?.startedAt   || null;
  const actualEndAt   = a?.completedAt || null;
  const hasStarted   = !!actualStartAt;
  const hasCompleted = !!actualEndAt && hasStarted;

  // ── Scheduled hours (baseline; from planned schedule, never overwritten) ──
  let scheduledHours = null;
  if (a?.fullDay) {
    scheduledHours = (timeToMinutes('23:59') - timeToMinutes('00:00')) / 60;
  } else if (a?.startTime && a?.endTime) {
    const sMin = timeToMinutes(a.startTime);
    const eMin = timeToMinutes(a.endTime);
    if (Number.isFinite(sMin) && Number.isFinite(eMin) && eMin >= sMin) {
      scheduledHours = (eMin - sMin) / 60;
    }
  }

  // ── Actual hours + overtime (truth; only once completed) ──
  let actualHours = null;
  let autoIsOvertime = null; // raw SYSTEM detection (pre-override)
  let overtimeHours = 0;
  let overtimeReason = null;

  if (hasCompleted) {
    const start = new Date(actualStartAt);
    const end   = new Date(actualEndAt);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end.getTime() >= start.getTime()) {
      actualHours = (end.getTime() - start.getTime()) / 3600000;

      const day = start.getDay(); // 0=Sun … 6=Sat (local/WIB on the client)
      const isWeekend = day === 0 || day === 6;

      // Absolute minute timeline anchored at the start day's midnight, so the
      // office window can be intersected across each spanned calendar day.
      const startAbs = _localMinsOfDay(start);
      const dayDiff  = _calendarDayDiff(start, end);
      const endAbs   = dayDiff * 1440 + _localMinsOfDay(end);
      const totalMins = endAbs - startAbs;

      let officeOverlap = 0;
      for (let d = 0; d <= dayDiff; d++) {
        const winStart = d * 1440 + workStartMins;
        const winEnd   = d * 1440 + workEndMins;
        officeOverlap += Math.max(0, Math.min(endAbs, winEnd) - Math.max(startAbs, winStart));
      }
      const outsideMins = Math.max(0, totalMins - officeOverlap);
      const isOutsideOffice = outsideMins > 0;

      autoIsOvertime = isWeekend || isOutsideOffice;
      overtimeReason = isWeekend ? 'weekend' : (isOutsideOffice ? 'outside_office' : null);
      overtimeHours = isWeekend ? actualHours : (outsideMins / 60);
    }
  }

  // ── Detection result (system) ── 'AUTO_LEMBUR' | 'AUTO_NORMAL' | null.
  const detectionStatus = hasCompleted
    ? (autoIsOvertime ? 'AUTO_LEMBUR' : 'AUTO_NORMAL')
    : null;

  // ── Administrative override (v1.16.4.9) ──
  // `overtimeOverride` ∈ {'NORMAL','LEMBUR'} is persisted on the assignment by
  // an admin. Only meaningful once completed (no actuals before that). When
  // present it overrides the detection; the final boolean + hours are adjusted
  // so analytics, KPIs, and the timeline all follow the final decision.
  const rawOverride = a?.overtimeOverride;
  const hasOverride = hasCompleted && (rawOverride === 'NORMAL' || rawOverride === 'LEMBUR');
  const overtimeSource = hasOverride ? 'MANUAL' : 'AUTO';

  let isOvertime = autoIsOvertime; // FINAL boolean (override applied below)
  if (hasOverride) {
    if (rawOverride === 'NORMAL') {
      isOvertime = false;
      overtimeHours = 0;          // forced normal → contributes no Jam Lembur
      overtimeReason = null;
    } else { // 'LEMBUR'
      isOvertime = true;
      // If the system already counted overtime hours, keep them. When forcing
      // lembur onto an in-office trip (system counted 0), the full engaged time
      // is treated as the overtime window — mirrors weekend semantics. This is
      // operational accounting only; no pay rate or compensation is implied.
      if (!(overtimeHours > 0)) overtimeHours = actualHours || 0;
      overtimeReason = 'override_lembur';
    }
  }

  const finalStatus = hasCompleted
    ? (isOvertime ? 'LEMBUR' : 'NORMAL')
    : null;

  const varianceHours = (actualHours != null && scheduledHours != null)
    ? actualHours - scheduledHours
    : null;

  return {
    actualStartAt, actualEndAt,
    hasStarted, hasCompleted,
    actualHours, scheduledHours, varianceHours,
    isOvertime, overtimeHours, overtimeReason,
    // v1.16.4.9 Overtime Administration — detection vs final + provenance.
    autoIsOvertime, detectionStatus, finalStatus, overtimeSource,
    overtimeOverrideReason: hasOverride ? (a?.overtimeOverrideReason || null) : null,
  };
}

/**
 * Format tanggal panjang: YYYY-MM-DD → "Minggu, 24 Mei 2026"
 * @param {string} dateStr - Format YYYY-MM-DD
 * @returns {string} - Tanggal format panjang dalam Bahasa Indonesia
 */
export function formatDateLong(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Format tanggal pendek: YYYY-MM-DD → "29/05/2026"
 * @param {string} dateStr - Format YYYY-MM-DD
 * @returns {string}
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Expand a date range into an array of YYYY-MM-DD strings, inclusive.
 * Timezone-safe: uses local Date constructor.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 * @returns {string[]}
 *
 * @example
 * expandDateRange('2026-05-29', '2026-05-31')
 * // → ['2026-05-29', '2026-05-30', '2026-05-31']
 */
export function expandDateRange(startDate, endDate) {
  if (!startDate) return [];
  const effective = endDate || startDate;

  const [sy, sm, sd] = String(startDate).split('-').map(Number);
  const [ey, em, ed] = String(effective).split('-').map(Number);

  const start = new Date(sy, sm - 1, sd);
  const end   = new Date(ey, em - 1, ed);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [startDate];
  if (end < start) return [startDate];

  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    dates.push(`${yy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Mengembalikan label waktu berdasarkan jam
 * @param {number} hour - Jam (0-23)
 * @returns {string} - Label waktu (Dini Hari, Pagi, Siang, Sore, Malam)
 */
export function getTimePeriod(hour) {
  if (hour >= 0 && hour < 6)  return 'Dini Hari';
  if (hour >= 6 && hour < 12) return 'Pagi';
  if (hour >= 12 && hour < 15) return 'Siang';
  if (hour >= 15 && hour < 18) return 'Sore';
  return 'Malam';
}

/**
 * Generate ID unik sederhana untuk assignment
 * @returns {string} - ID unik
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Tambahkan jam ke waktu HH:MM. Hasil dicap di 23:59.
 * @param {string} timeStr - Format HH:MM
 * @param {number} hoursToAdd
 * @returns {string} - Format HH:MM
 */
export function addHoursToTime(timeStr, hoursToAdd) {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMinutes = h * 60 + m + hoursToAdd * 60;
  return minutesToTime(Math.min(totalMinutes, 23 * 60 + 59));
}

/**
 * Format ISO timestamp → "1 Juni 2026, 14.30"
 * @param {string} isoString
 * @returns {string}
 */
export function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Toast notification untuk feedback user
 * @param {string} message - Pesan yang ditampilkan
 */
let toastTimeout = null;
export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2800);
}

/**
 * Display label for an assignment's vehicle (v1.15.6 — Requester Vehicle).
 * An assignment performed with a non-PBSI / requester vehicle is stored as
 * `vehicle: ''`; render it as "Tanpa Kendaraan" everywhere (timeline, cards,
 * dashboard, detail, notifications, exports) instead of '-' / '—' / blank.
 * Any non-empty value is returned unchanged.
 * @param {string|null|undefined} vehicle
 * @returns {string}
 */
export function vehicleLabel(vehicle) {
  return (vehicle == null || String(vehicle).trim() === '') ? 'Tanpa Kendaraan' : vehicle;
}

export function normalizeTimeValue(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

export function padTimePart(value) {
  return String(value || '0').padStart(2, '0');
}

export function isValidHour(value) {
  const hour = Number(value);
  return /^\d{1,2}$/.test(String(value)) && hour >= 0 && hour <= 23;
}

export function isValidMinute(value) {
  const minute = Number(value);
  return /^\d{1,2}$/.test(String(value)) && minute >= 0 && minute <= 59;
}

export function initCustomTimeInputPair(hourId, minuteId) {
  const hourInput = document.getElementById(hourId);
  const minuteInput = document.getElementById(minuteId);
  if (!hourInput || !minuteInput) return;

  hourInput.inputMode = 'numeric';
  hourInput.pattern = '[0-9]*';
  hourInput.maxLength = 2;
  hourInput.autocomplete = 'off';
  minuteInput.inputMode = 'numeric';
  minuteInput.pattern = '[0-9]*';
  minuteInput.maxLength = 2;
  minuteInput.autocomplete = 'off';

  hourInput.addEventListener('input', () => {
    const digits = String(hourInput.value || '').replace(/\D/g, '').slice(0, 2);
    hourInput.value = digits;

    if (digits.length === 2 && isValidHour(digits)) {
      minuteInput.focus();
    }
  });

  hourInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' && hourInput.value.length >= 1) {
      minuteInput.focus();
    }
  });

  minuteInput.addEventListener('input', () => {
    const digits = String(minuteInput.value || '').replace(/\D/g, '').slice(0, 2);
    minuteInput.value = digits;
  });

  minuteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && minuteInput.value.length === 0) {
      event.preventDefault();
      hourInput.focus();
    }
  });

  hourInput.addEventListener('blur', () => {
    if (hourInput.value) {
      if (!isValidHour(hourInput.value)) {
        hourInput.value = hourInput.value.slice(0, 1);
      }
      hourInput.value = padTimePart(hourInput.value);
    }
  });

  minuteInput.addEventListener('blur', () => {
    if (minuteInput.value) {
      if (!isValidMinute(minuteInput.value)) {
        minuteInput.value = minuteInput.value.slice(0, 1);
      }
      minuteInput.value = padTimePart(minuteInput.value);
    }
  });
}

export function getCombinedTimeFromPair(hourId, minuteId) {
  const hourInput = document.getElementById(hourId);
  const minuteInput = document.getElementById(minuteId);

  if (!hourInput || !minuteInput) return '';
  const hour = padTimePart(String(hourInput.value || '').replace(/\D/g, '').slice(0, 2));
  const minute = padTimePart(String(minuteInput.value || '').replace(/\D/g, '').slice(0, 2));

  if (!isValidHour(hour) || !isValidMinute(minute)) {
    return '';
  }

  return `${hour}:${minute}`;
}

export function setTimeFieldsFromValue(hourId, minuteId, timeValue) {
  const hourInput = document.getElementById(hourId);
  const minuteInput = document.getElementById(minuteId);
  if (!hourInput || !minuteInput) return;

  if (!timeValue || typeof timeValue !== 'string') {
    hourInput.value = '';
    minuteInput.value = '';
    return;
  }

  const [hour, minute] = timeValue.split(':').map(part => String(part || '').replace(/\D/g, ''));
  hourInput.value = padTimePart(hour).slice(-2);
  minuteInput.value = padTimePart(minute).slice(-2);
}
