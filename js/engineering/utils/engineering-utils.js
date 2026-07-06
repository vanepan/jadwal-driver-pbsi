/* ============================================================
   ENGINEERING-UTILS.JS — Engineering Operations Foundation
   (v1.20.0)

   The pure toolbox every Engineering module leans on: identity
   generation, time / duration math, RTDB-safe key derivation, and the
   normalization helpers the store and provider use when hydrating a raw
   Firebase node into clean in-memory state.

   PURE: plain functions only. No DOM, no Firebase, no `window`, no module
   state. Everything here is deterministic given its inputs (times are
   injectable via a `now` argument so engines and checks stay reproducible).

   The RTDB-safe key derivation reuses the lesson from the Alias Engine
   hardening: Firebase keys may not contain '.', '#', '$', '[', ']' or '/'.
   Every generated id is composed only of [0-9a-z-] so it is a legal key.
   ============================================================ */

'use strict';

/** Coerce to a finite number, else 0. */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Clamp `v` into the inclusive [lo, hi] range. */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, num(v)));
}

/** True for a non-null, non-array plain object. */
export function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Normalize an RTDB node to a clean array. RTDB may return a real array OR an
 * object keyed by push-id/index, possibly with holes/null — both collapse to a
 * dense array of the objects. Mirrors the persistence-layer convention.
 * @param {*} node
 * @returns {Array<Object>}
 */
export function nodeToArray(node) {
  if (Array.isArray(node)) return node.filter((v) => v && typeof v === 'object');
  if (isPlainObject(node)) return Object.values(node).filter((v) => v && typeof v === 'object');
  return [];
}

/**
 * Normalize an RTDB node to a plain keyed object; a raw array is re-keyed by
 * each entry's `id` (falling back to its index).
 * @param {*} node
 * @returns {Object}
 */
export function nodeToObject(node) {
  if (Array.isArray(node)) {
    const out = {};
    node.forEach((v, i) => { if (v && typeof v === 'object') out[v.id || i] = v; });
    return out;
  }
  return isPlainObject(node) ? { ...node } : {};
}

/** ISO-8601 timestamp for `now` (Date | ms | ISO string | undefined → real now). */
export function nowISO(now) {
  const d = now == null ? new Date() : (now instanceof Date ? now : new Date(now));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Epoch ms for an ISO/Date/ms value; NaN when unparseable. */
export function toMillis(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? NaN : t;
}

/** Local-day ISO (yyyy-mm-dd), timezone-safe. */
export function dayISO(value) {
  const d = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Duration in whole milliseconds between two timestamps (`end` − `start`);
 * null when either is missing/unparseable or the interval is negative.
 * @returns {number|null}
 */
export function durationMs(start, end) {
  const a = toMillis(start);
  const b = toMillis(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const delta = b - a;
  return delta >= 0 ? delta : null;
}

/** Sum an array of durationMs results, ignoring nulls. */
export function sumDurations(list) {
  return (Array.isArray(list) ? list : []).reduce((acc, d) => acc + (num(d) > 0 ? num(d) : 0), 0);
}

/** Strip every RTDB-illegal key character from a string, collapsing runs to '-'. */
export function rtdbSafeKey(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[.#$\[\]/\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

let _idCounter = 0;
/**
 * A collision-resistant, RTDB-safe id: `<prefix>-<base36 time>-<base36 seq>-<rand>`.
 * Deterministic ordering (time then monotonic counter) with a random tail so two
 * ids minted in the same millisecond never collide. Contains only [0-9a-z-].
 * @param {string} [prefix='eng']
 * @param {Date|number|string} [now]  injectable clock (tests)
 * @returns {string}
 */
export function generateId(prefix = 'eng', now) {
  const t = Number.isNaN(toMillis(now)) ? Date.now() : toMillis(now);
  const seq = (_idCounter = (_idCounter + 1) % 0xffffff).toString(36);
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${rtdbSafeKey(prefix) || 'eng'}-${t.toString(36)}-${seq}-${rand}`;
}

/**
 * A human-readable, RTDB-safe assignment number: `<PREFIX>-<yyyymmdd>-<NNNN>`.
 * The sequence is caller-supplied (the store owns the running counter) so the
 * number is deterministic and gap-free per day; missing sequence → time-based.
 * @param {Object} [opts]
 * @param {string} [opts.prefix='ENG']
 * @param {number} [opts.sequence]  1-based per-day counter
 * @param {Date|number|string} [opts.now]
 * @returns {string}
 */
export function generateAssignmentNumber(opts = {}) {
  const prefix = (opts.prefix || 'ENG').toUpperCase();
  const day = dayISO(opts.now).replace(/-/g, '') || dayISO(Date.now()).replace(/-/g, '');
  const seq = num(opts.sequence) > 0
    ? String(Math.floor(num(opts.sequence))).padStart(4, '0')
    : String((Number.isNaN(toMillis(opts.now)) ? Date.now() : toMillis(opts.now)) % 10000).padStart(4, '0');
  return `${prefix}-${day}-${seq}`;
}

/** Recursively freeze an object graph (returns the same reference). */
export function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

/** Structured-ish deep clone of plain JSON data (objects/arrays/primitives). */
export function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out;
  }
  return value;
}

/** Non-empty trimmed string, else ''. */
export function cleanString(v) {
  return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim());
}

/** Increment a count on a bucket map in place and return it. */
export function tally(map, key) {
  const k = key == null || key === '' ? 'unknown' : String(key);
  map[k] = (map[k] || 0) + 1;
  return map;
}
