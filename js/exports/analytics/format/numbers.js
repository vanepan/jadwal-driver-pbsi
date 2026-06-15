/* ============================================================
   FORMAT/NUMBERS.JS — id-ID number formatting for the report

   The approved design renders every figure with Indonesian
   locale conventions and tabular figures: thousands grouped with
   '.', decimals with ','  (e.g. 1.342, 8,7, 42%). All formatting
   happens here in the client projection so the server components
   stay pure string emitters (Phase A/B contract).

   Pure, deterministic helpers. No DOM, no Firebase.
   ============================================================ */

'use strict';

/** Integer with id-ID grouping: 1342 → "1.342". */
export function formatInt(n) {
  return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

/** One-decimal id-ID: 8.666… → "8,7". */
export function formatDecimal1(n) {
  return Number(n || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Percent label from an already-computed 0–100 value: 42 → "42%". */
export function formatPctLabel(n) {
  return `${Math.round(Number(n || 0))}%`;
}

/** Percent label from a ratio parts/whole, rounded: (8,26) → "31%". */
export function pctOf(part, whole) {
  if (!whole) return '0%';
  return `${Math.round((Number(part || 0) / Number(whole)) * 100)}%`;
}

/** Distance label: 581 → "581 km" (grouped). Empty/zero → "—". */
export function formatKmLabel(km) {
  const v = Number(km || 0);
  return v > 0 ? `${formatInt(v)} km` : '—';
}
