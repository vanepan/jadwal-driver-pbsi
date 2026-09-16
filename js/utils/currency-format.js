/* ============================================================
   CURRENCY-FORMAT.JS — v1.31.4 R7

   The ONE canonical Indonesian-rupiah formatter/parser layer. Extracted
   byte-for-byte from js/petty-cash/petty-cash-config.js (petty-cash-
   config.js now re-exports from here, so every existing import site is
   unaffected) — this was already the most mature implementation in the
   app (the live, caret-preserving input reformatter in particular), not
   a rewrite. rp() and rpCompact() deliberately use a real non-breaking
   space (U+00A0) between "Rp" and the number (so it can never wrap onto
   its own line); rpTable() deliberately uses a plain space instead — both
   preserved exactly as they were, not unified into one or the other.

   Canonical numeric values are always plain numbers/digit-strings
   (1000000); ONLY these functions turn that into "1.000.000" /
   "Rp 1.000.000" for display, or back again. Never store a formatted
   string in a numeric field, never format IDs/years/dates/timestamps/
   percentages/odometer/quantities/phone numbers/codes with these.
   ============================================================ */

'use strict';

/* ── Display formatters ──────────────────────────────────────────
   rp     — UI display:    "Rp 1.250.000" (non-breaking space)
   rpDoc  — NOR/letter:    "1.250.000,-"
   rpTable— table/UI:      "Rp 1.250.000" (regular space) */
export function rp(n) { return 'Rp ' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }
export function rpDoc(n) { return Number(Math.round(n || 0)).toLocaleString('id-ID') + ',-'; }
export function rpTable(n) { return 'Rp ' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }

/**
 * Compact rupiah for executive/KPI surfaces where a full value would overflow,
 * clip, or wrap into ugly fragments. SINGLE source of truth — never reimplement.
 * Up to 1 decimal (Indonesian comma), trailing ",0" trimmed. Always one token
 * (uses a non-breaking space) so it can never break across lines.
 *   10.000.000 → "Rp 10 Jt" · 125.000.000 → "Rp 125 Jt" · 1.200.000.000 → "Rp 1,2 M"
 * @param {number} n
 * @returns {string}
 */
export function rpCompact(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const unit = (v, suffix) => {
    const s = (Math.round(v * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 });
    return `${sign}Rp ${s} ${suffix}`;
  };
  if (abs >= 1e12) return unit(abs / 1e12, 'T');   // triliun
  if (abs >= 1e9)  return unit(abs / 1e9,  'M');   // miliar
  if (abs >= 1e6)  return unit(abs / 1e6,  'Jt');  // juta
  if (abs >= 1e3)  return unit(abs / 1e3,  'Rb');  // ribu
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

/** Parse a user-typed amount ("Rp 1.250.000") → integer rupiah. */
export function parseAmount(value) {
  return parseInt(String(value == null ? '' : value).replace(/[^0-9]/g, ''), 10) || 0;
}

/** Live amount-input display: grouped digits only, no "Rp " prefix (a
 *  field's own label typically already carries "(Rp)") — same
 *  toLocaleString('id-ID') grouping convention as rp()/rpDoc()/rpTable()
 *  above, reused rather than reimplemented. '' in → '' out (empty stays
 *  empty, not "0"). */
export function formatAmountInput(digits) {
  const clean = String(digits == null ? '' : digits).replace(/[^0-9]/g, '');
  if (!clean) return '';
  return Number(clean).toLocaleString('id-ID');
}

/* ── Live, caret-preserving input reformatting ──────────────────────
   Originally private to petty-cash-center.js (its #pcAmountValue field),
   generalized here so every other money input in the app can share the
   exact same caret math instead of re-deriving it — or, worse, just
   jumping the caret to the end of the field on every keystroke. */

/** How many digit characters appear in `str` before `index`. */
function digitsBeforeIndex(str, index) {
  let n = 0;
  for (let i = 0; i < index && i < str.length; i++) if (/[0-9]/.test(str[i])) n++;
  return n;
}
/** The string index immediately after the `digitCount`-th digit character. */
function indexAfterDigits(str, digitCount) {
  if (digitCount <= 0) return 0;
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    if (/[0-9]/.test(str[i])) { n++; if (n === digitCount) return i + 1; }
  }
  return str.length;
}

/**
 * Reformats a money `<input>` IN PLACE as the user types — inserting/
 * removing thousands-separator dots without losing caret position, so
 * typing in the middle of a value, deleting a digit, or appending one all
 * keep the caret sitting after the same digit it was next to before the
 * reformat (not reset to the end, which a naive `el.value = format(...)`
 * would do on every keystroke).
 * @param {HTMLInputElement} el
 * @param {(digits: string) => string} [formatter] defaults to formatAmountInput
 * @returns {string} the clean digit string — what canonical numeric state
 *   should be set to (e.g. st.form.amount = reformatAmountInputEl(el)).
 */
export function reformatAmountInputEl(el, formatter = formatAmountInput) {
  const digitsBefore = digitsBeforeIndex(el.value, el.selectionStart);
  const digits = el.value.replace(/[^0-9]/g, '');
  const formatted = formatter(digits);
  el.value = formatted;
  const pos = indexAfterDigits(formatted, digitsBefore);
  el.setSelectionRange(pos, pos);
  return digits;
}
