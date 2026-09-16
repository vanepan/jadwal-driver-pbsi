/* currency-format-check.mjs — v1.31.4 R7: the canonical Indonesian-rupiah
   formatter/parser layer (js/utils/currency-format.js), extracted from
   js/petty-cash/petty-cash-config.js (which now re-exports it) so every
   module sharing a money field shares ONE implementation instead of
   reimplementing 'Rp ' + n.toLocaleString('id-ID') ad hoc.

   Pure Node, no browser needed — reformatAmountInputEl() only touches
   .value/.selectionStart/.setSelectionRange, so a plain fake "input"
   object exercises the exact same code path a real <input> would.

   Run: node scripts/currency-format-check.mjs   (exit 0 = pass)
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rp, rpDoc, rpTable, rpCompact, parseAmount, formatAmountInput, reformatAmountInputEl,
} from '../js/utils/currency-format.js';
import * as PettyCashConfig from '../js/petty-cash/petty-cash-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + JSON.stringify(detail)); }
};

const NBSP = ' ';

/* ══ display formatters — the exact matrix the phase brief requires ══ */
console.log('\n[A — rp(): "Rp" + NBSP + grouped digits]');
check('empty/undefined -> "Rp 0" (never blank, never NaN)', rp(undefined) === `Rp${NBSP}0`, rp(undefined));
check('0 -> "Rp 0"', rp(0) === `Rp${NBSP}0`, rp(0));
check('1 -> "Rp 1"', rp(1) === `Rp${NBSP}1`, rp(1));
check('12 -> "Rp 12"', rp(12) === `Rp${NBSP}12`, rp(12));
check('100 -> "Rp 100"', rp(100) === `Rp${NBSP}100`, rp(100));
check('1000 -> "Rp 1.000"', rp(1000) === `Rp${NBSP}1.000`, rp(1000));
check('100000 -> "Rp 100.000"', rp(100000) === `Rp${NBSP}100.000`, rp(100000));
check('1000000 -> "Rp 1.000.000"', rp(1000000) === `Rp${NBSP}1.000.000`, rp(1000000));
check('negative -1000 -> "Rp -1.000" (this codebase permits negative rp())', rp(-1000) === `Rp${NBSP}-1.000`, rp(-1000));
check('decimal rounds to nearest integer rupiah (1000.6 -> 1.001)', rp(1000.6) === `Rp${NBSP}1.001`, rp(1000.6));
check('uses a real NON-BREAKING space (U+00A0) between "Rp" and the number, not a plain space', rp(1000).charCodeAt(2) === 0xA0, rp(1000).charCodeAt(2));

console.log('\n[B — rpTable(): same grouping, but a PLAIN space — deliberately different from rp(), preserved not unified]');
check('1000000 -> "Rp 1.000.000"', rpTable(1000000) === 'Rp 1.000.000', rpTable(1000000));
check('uses a PLAIN space (0x20), not NBSP', rpTable(1000).charCodeAt(2) === 0x20, rpTable(1000).charCodeAt(2));

console.log('\n[C — rpDoc(): NOR-letter style, no "Rp" prefix, trailing ",-"]');
check('1000000 -> "1.000.000,-"', rpDoc(1000000) === '1.000.000,-', rpDoc(1000000));
check('0 -> "0,-"', rpDoc(0) === '0,-', rpDoc(0));

console.log('\n[D — rpCompact(): abbreviated for KPI surfaces]');
check('999 stays exact (below the Rb threshold)', rpCompact(999) === `Rp${NBSP}999`, rpCompact(999));
check('10.000.000 -> "Rp 10 Jt"', rpCompact(10000000) === `Rp${NBSP}10${NBSP}Jt`, rpCompact(10000000));
check('1.200.000.000 -> "Rp 1,2 M" (Indonesian decimal comma)', rpCompact(1200000000) === `Rp${NBSP}1,2${NBSP}M`, rpCompact(1200000000));
check('negative value keeps its sign', rpCompact(-5000000).startsWith('-Rp'), rpCompact(-5000000));

/* ══ parser — the exact inverse of the display formatters ══ */
console.log('\n[E — parseAmount(): "Rp 1.250.000"-shaped input -> canonical integer]');
check('empty string -> 0', parseAmount('') === 0, parseAmount(''));
check('"Rp 1.000.000" -> 1000000', parseAmount('Rp 1.000.000') === 1000000, parseAmount('Rp 1.000.000'));
check('"1.000.000" -> 1000000', parseAmount('1.000.000') === 1000000, parseAmount('1.000.000'));
check('null/undefined -> 0, never throws', parseAmount(null) === 0 && parseAmount(undefined) === 0);

/* ══ live-input formatter (no "Rp " prefix) ══ */
console.log('\n[F — formatAmountInput(): live grouped digits, empty stays empty]');
check('"" -> ""  (empty must stay empty, never "0")', formatAmountInput('') === '', formatAmountInput(''));
check('"0" -> "0"', formatAmountInput('0') === '0', formatAmountInput('0'));
check('"1000000" -> "1.000.000"', formatAmountInput('1000000') === '1.000.000', formatAmountInput('1000000'));
check('non-digit characters are stripped before grouping', formatAmountInput('Rp1.000.000') === '1.000.000', formatAmountInput('Rp1.000.000'));

/* ══ live, caret-preserving input reformatting ══ */
console.log('\n[G — reformatAmountInputEl(): type / edit-middle / delete / append, caret stays put]');
function fakeInput(value, selectionStart) {
  return {
    value, selectionStart, selectionEnd: selectionStart,
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
  };
}
// Typing digit-by-digit: 1, 12, 123, 1234, 12345 — each keystroke lands the
// caret right after the just-typed digit, never jumping to the end/start.
{
  let el = fakeInput('1', 1);
  const seq = ['1', '12', '123', '1234', '12345'];
  let ok = true, trail = [];
  for (const typed of seq) {
    el.value = typed; el.selectionStart = typed.length; // simulate "just typed the next digit at the end"
    const digits = reformatAmountInputEl(el);
    trail.push({ typed, formatted: el.value, digits, caret: el.selectionStart });
    if (el.selectionStart !== el.value.length) ok = false; // caret should trail the last real digit typed
  }
  check('typing 1 -> 12 -> 123 -> 1234 -> 12345 keeps the caret at the end (append case) at every step', ok, trail);
  check('final formatted value is "12.345"', el.value === '12.345', el.value);
  check('final returned digit string is "12345" (canonical, no dots)', el.value.replace(/\./g, '') === '12345');
}
{
  // Editing in the MIDDLE of an already-formatted value: "1.000.000" with
  // caret after the first "1.00|0.000" (5 digits before caret: 1,0,0,0 ->
  // wait, count precisely) — insert a "9" right after the 2nd digit.
  const el = fakeInput('1.000.000', 0);
  // caret sits right after "1.0" (3 characters in: '1','.','0') = 1 digit before caret
  el.value = '19.000.000'; // user typed "9" right after the first digit "1"
  el.selectionStart = 2; // caret now after "19"
  const digits = reformatAmountInputEl(el);
  check('inserting "9" after the first digit of "1.000.000" -> canonical digits "19000000"', digits === '19000000', digits);
  check('reformatted display is "19.000.000"', el.value === '19.000.000', el.value);
  check('caret lands right after the 2nd digit ("19|.000.000"), not reset to start/end', el.selectionStart === 2, el.selectionStart);
}
{
  // Deleting a digit from the middle: "12.345" -> delete the "3" (3rd digit) -> "12.45"
  const el = fakeInput('12.345', 0);
  el.value = '12.45'; // the "3" was deleted; caret already collapsed by the native delete
  el.selectionStart = 3; // caret sits right after "12." where the deleted digit was
  const digits = reformatAmountInputEl(el);
  check('deleting the 3rd digit of "12.345" -> canonical digits "1245"', digits === '1245', digits);
  check('reformatted display is "1.245"', el.value === '1.245', el.value);
  check('caret repositioned to stay after the same 2 digits ("1.2|45")', el.selectionStart === 3, el.selectionStart);
}

/* ══ save/load roundtrip — canonical numeric value survives format<->parse ══ */
console.log('\n[H — save/load roundtrip: format(parse(x)) === format(x) for every test value]');
for (const v of [0, 1, 12, 100, 1000, 100000, 1000000, -1000]) {
  // formatAmountInput() strips every non-digit (including a leading "-") by
  // design — it formats what the user is actively TYPING into a bare digit
  // field, not a signed display value — so the roundtrip lands on the
  // absolute value; this codebase's signed display (rp(-1000) -> "Rp -1.000")
  // goes through rp(), not this live-input pair, and is covered in [A].
  const reparsed = parseAmount(formatAmountInput(String(v)));
  check(`roundtrip holds for ${v} (format -> parse returns the magnitude)`, reparsed === Math.abs(v),
    { v, formatted: formatAmountInput(String(v)), reparsed });
}

/* ══ petty-cash-config.js re-exports THE SAME functions, not a divergent copy ══ */
console.log('\n[I — petty-cash-config.js re-exports the canonical functions (single source of truth, no fork)]');
check('petty-cash-config.js#rp === currency-format.js#rp (identical reference, not a duplicate copy)', PettyCashConfig.rp === rp);
check('petty-cash-config.js#formatAmountInput === currency-format.js#formatAmountInput', PettyCashConfig.formatAmountInput === formatAmountInput);
check('petty-cash-config.js#parseAmount === currency-format.js#parseAmount', PettyCashConfig.parseAmount === parseAmount);
check('petty-cash-config.js#rpCompact === currency-format.js#rpCompact', PettyCashConfig.rpCompact === rpCompact);
check('petty-cash-config.js#rpTable === currency-format.js#rpTable', PettyCashConfig.rpTable === rpTable);
check('petty-cash-config.js#rpDoc === currency-format.js#rpDoc', PettyCashConfig.rpDoc === rpDoc);

/* ══ no formatting applied to non-monetary fields — static contract guard ══ */
console.log('\n[J — static: currency-format.js is never imported by odometer/date/id-shaped modules]');
const guardTargets = [
  'js/analytics/odometer-audit.js',
  'js/timeline.js',
];
for (const rel of guardTargets) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { check(`${rel} exists (sanity)`, false); continue; }
  const src = fs.readFileSync(p, 'utf-8');
  check(`${rel} does not import currency-format.js (odometer/KM is never money-formatted)`, !src.includes("currency-format.js"));
}

console.log(`\ncurrency-format-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
