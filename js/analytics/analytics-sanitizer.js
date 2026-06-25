/* ============================================================
   ANALYTICS-SANITIZER.JS — Analytics Data Sanitization
   (v1.16.4.11-rc.1.1)

   THE single boundary that turns raw, possibly-malformed RTDB data into the
   clean, fully-typed shape the analytics engine assumes. Firebase RTDB can
   hand the app:
     • null / undefined elements inside an array (a deleted index in an
       array-shaped node deserializes as `null`),
     • numeric or otherwise non-string text fields (a "12345" requesterName
       comes back as a Number),
     • records missing the active / archived / status flags entirely.

   computeAnalyticsModel() previously assumed perfect data and dereferenced
   these directly (e.g. `drivers.filter(d => d.active …)` throws on a null
   element). Rather than scatter null-guards through the engine's business
   logic, EVERY analytics input passes through this layer first, so the engine
   stays clean and operates only on well-formed records.

   GUARANTEE: the returned arrays contain only plain objects (never null /
   undefined / empties), every string field the engine touches is a real
   string, every DATE field is a 'YYYY-MM-DD' day string (or ''), and active /
   archived / status always have a sane default. Pure + side-effect free;
   imports nothing; fully unit-testable. Touches ONLY analytics — no Dispatch
   Intelligence, recommendation, persistence, workflow, or auth surface is
   affected.

   rc.1.1.1 — date normalization. The engine derives record dates by string-
   slicing (e.g. _reqDate: `r.startDate || (r.createdAt||'').slice(0,10)`), so a
   non-string createdAt (epoch number / Date / Firebase Timestamp) threw
   `TypeError: …slice is not a function`. normalizeDate() now folds every
   supported timestamp shape to 'YYYY-MM-DD' BEFORE the engine sees it; the
   engine stays date-guard-free.
   ============================================================ */

'use strict';

/* ── Primitive coercion helpers ──────────────────────────────────────────── */

/** Always an array — a non-array (null/undefined/object) becomes []. */
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** True only for a real, non-array object. */
function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Drop null/undefined, non-objects, and `{}` (empty records). */
function isUsableRecord(v) {
  return isObject(v) && Object.keys(v).length > 0;
}

/** Coerce any value to a string; null/undefined → fallback ('' by default). */
function toStr(v, fallback = '') {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  return String(v);
}

/** A finite number, or `null` when the value can't be one. */
function toNumOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A Date → 'YYYY-MM-DD' (UTC), or '' when the Date is invalid. */
function dayFromDate(d) {
  const t = d.getTime();
  return Number.isNaN(t) ? '' : d.toISOString().slice(0, 10);
}

/**
 * Normalize ANY analytics date value to a 'YYYY-MM-DD' day string — the one
 * shape the engine assumes for every record date. NEVER throws; anything it
 * can't interpret becomes ''. This is the date counterpart to the field
 * coercions above and the reason analytics-engine.js needs no date guards.
 *
 * Accepts:
 *   • 'YYYY-MM-DD'                → returned as-is
 *   • ISO string ('…T…Z', '…+07')→ leading date taken VERBATIM (matches the
 *                                   engine's historical `.slice(0,10)`, so no
 *                                   timezone shift / parity change on clean data)
 *   • other parseable strings     → Date-parsed → UTC day
 *   • epoch milliseconds (number) → UTC day
 *   • Date object                 → UTC day
 *   • Firebase Timestamp          → .toDate(), else {seconds|_seconds}×1000
 *   • null / undefined / ''       → ''
 *   • anything invalid            → ''
 *
 * @param {*} value
 * @returns {string} 'YYYY-MM-DD' or ''
 */
export function normalizeDate(value) {
  try {
    if (value == null) return '';

    if (typeof value === 'string') {
      const s = value.trim();
      if (s === '') return '';
      // Date-prefixed strings ('YYYY-MM-DD', 'YYYY-MM-DDThh:mm…') → literal
      // first 10 chars, EXACTLY reproducing the engine's prior `.slice(0,10)`.
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
      if (m) return m[1];
      const d = new Date(s);
      return dayFromDate(d);
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '';
      return dayFromDate(new Date(value));        // epoch milliseconds
    }

    if (typeof value === 'object') {
      // Native Date (cross-realm safe).
      if (Object.prototype.toString.call(value) === '[object Date]') {
        return dayFromDate(value);
      }
      // Firebase Timestamp — client SDK exposes toDate().
      if (typeof value.toDate === 'function') {
        const d = value.toDate();
        return (d && Object.prototype.toString.call(d) === '[object Date]') ? dayFromDate(d) : '';
      }
      // Serialized Timestamp — { seconds, nanoseconds } or { _seconds, … }.
      const secs = typeof value.seconds === 'number' ? value.seconds
        : typeof value._seconds === 'number' ? value._seconds
          : null;
      if (secs != null && Number.isFinite(secs)) return dayFromDate(new Date(secs * 1000));
    }

    return '';
  } catch (_) {
    return '';   // contract: never throw
  }
}

/* ── Public sanitizers ───────────────────────────────────────────────────── */

/**
 * Drivers: drop holes/empties; guarantee a string `name`; default presence
 * flags (`active` true unless explicitly false, `archived` only when true).
 * @param {*} drivers
 * @returns {Array<Object>}
 */
export function sanitizeDrivers(drivers) {
  return asArray(drivers)
    .filter(isUsableRecord)
    .map((d) => ({
      ...d,
      name: toStr(d.name),
      active: d.active !== false,
      archived: d.archived === true,
    }));
}

/**
 * Vehicles: same contract as drivers — string `name`, defaulted flags.
 * @param {*} vehicles
 * @returns {Array<Object>}
 */
export function sanitizeVehicles(vehicles) {
  return asArray(vehicles)
    .filter(isUsableRecord)
    .map((v) => ({
      ...v,
      name: toStr(v.name),
      active: v.active !== false,
      archived: v.archived === true,
    }));
}

/**
 * Requests: drop holes/empties; normalize every text field the engine reads to
 * a string (`requesterName`, `driver`, `vehicle`, `destination`, `purpose`),
 * default `status` to 'pending'.
 * @param {*} requests
 * @returns {Array<Object>}
 */
export function sanitizeRequests(requests) {
  return asArray(requests)
    .filter(isUsableRecord)
    .map((r) => ({
      ...r,
      requesterName: toStr(r.requesterName),
      driver: toStr(r.driver),
      vehicle: toStr(r.vehicle),
      destination: toStr(r.destination),
      purpose: toStr(r.purpose),
      status: toStr(r.status, 'pending') || 'pending',
      // Date fields normalized to 'YYYY-MM-DD' so the engine's _reqDate()
      // (r.startDate || r.createdAt.slice(0,10)) can never hit a non-string.
      createdAt: normalizeDate(r.createdAt),
      updatedAt: normalizeDate(r.updatedAt),
      startDate: normalizeDate(r.startDate),
      endDate: normalizeDate(r.endDate),
    }));
}

/**
 * Assignments: drop holes/empties; normalize text fields to strings, default
 * `status` to 'assigned', and coerce `distanceTravelled` to a finite number or
 * null (so the odometer aggregation never string-concatenates).
 * @param {*} assignments
 * @returns {Array<Object>}
 */
export function sanitizeAssignments(assignments) {
  return asArray(assignments)
    .filter(isUsableRecord)
    .map((a) => ({
      ...a,
      driver: toStr(a.driver),
      vehicle: toStr(a.vehicle),
      destination: toStr(a.destination),
      purpose: toStr(a.purpose),
      status: toStr(a.status, 'assigned') || 'assigned',
      // Every scheduling/date field normalized to 'YYYY-MM-DD' so the engine's
      // _asgDate() and the cancellation model never date-process a non-string.
      date: normalizeDate(a.date),
      startDate: normalizeDate(a.startDate),
      endDate: normalizeDate(a.endDate),
      createdAt: normalizeDate(a.createdAt),
      updatedAt: normalizeDate(a.updatedAt),
      cancelledAt: normalizeDate(a.cancelledAt),
      distanceTravelled: toNumOrNull(a.distanceTravelled),
    }));
}

/**
 * Settings (the analytics office-hours window): guarantee finite
 * workStartMins / workEndMins, defaulting to the engine's documented
 * 09:00–17:00 boundary when absent or malformed.
 * @param {*} office
 * @returns {{workStartMins:number, workEndMins:number}}
 */
export function sanitizeSettings(office) {
  const o = isObject(office) ? office : {};
  const start = toNumOrNull(o.workStartMins);
  const end = toNumOrNull(o.workEndMins);
  return {
    ...o,
    workStartMins: start == null ? 540 : start,   // 09:00
    workEndMins: end == null ? 1020 : end,         // 17:00
  };
}
