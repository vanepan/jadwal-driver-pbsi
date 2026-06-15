/* ============================================================
   FORMAT/DATES.JS — id-ID date formatting for the report

   longDateID  → "15 Juni 2026"   (header date, .hda)
   shortDateID → "15 Jun 2026"     (footer version line, .fm)

   Pure, deterministic. Accepts an ISO string, a Date, or nothing
   (defaults to now). No DOM, no Firebase.
   ============================================================ */

'use strict';

function _toDate(input) {
  if (input instanceof Date) return input;
  if (input) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** "15 Juni 2026" */
export function longDateID(input) {
  return _toDate(input).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** "15 Jun 2026" */
export function shortDateID(input) {
  return _toDate(input).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** "pukul 00.44" (id-ID uses '.' as the time separator). */
export function timeID(input) {
  const t = _toDate(input).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `pukul ${t}`;
}

/** Window length (days) per analytics date-range key. */
const RANGE_DAYS = { today: 0, '7d': 7, '30d': 30, '90d': 90 };

/**
 * Report period range, e.g. "16 Mei – 15 Juni 2026" (Appendix, P5).
 * The window ends at `input` (generatedAt) and spans RANGE_DAYS back.
 * Returns '' for 'all' / unknown keys (no bounded range).
 * @param {string} dateRangeKey  today|7d|30d|90d|all
 * @param {string|Date} input    period end (generatedAt)
 */
export function periodRangeID(dateRangeKey, input) {
  const end = _toDate(input);
  if (dateRangeKey === 'today') return longDateID(end);
  if (!(dateRangeKey in RANGE_DAYS)) return ''; // 'all' or unknown
  const start = new Date(end);
  start.setDate(start.getDate() - RANGE_DAYS[dateRangeKey]);
  const startStr = start.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
  return `${startStr} – ${longDateID(end)}`;
}
