/* ============================================================
   GUDANG-ATOMS.JS — Gudang UI presentation atoms (V1.28.0 Experience Layer)

   The shared, PURE presentation layer for the Gudang module: icon set,
   escaping, small reusable HTML fragments (pill, keyboard chip, empty
   state, quantity/currency formatting for display only). Mirrors
   js/engineering/ui/engineering-atoms.js's own role and shape exactly.

   All functions return escaped HTML strings (no DOM, no framework) —
   presentation ONLY: no business logic, no repository calls, no
   computation Analytics Engine or Quiet Intelligence Engine already own
   (Doc 4 Art.IV/V). Formatting a number for display (e.g. "Rp 15.000")
   is presentation; DECIDING what that number IS belongs to the engines
   under js/gudang/, never here.
   ============================================================ */

'use strict';

/** HTML-escape (attribute/text safe). */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Icon set — warehouse/operational glyphs, same recipe as engineering-atoms.js ── */
const ICONS = {
  search: { d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35' },
  box: { d: 'M4 4h16v16H4zM12 4v16M9 9v3M15 9v3' },
  'arrow-out': { d: 'M5 12h11M12 5l7 7-7 7' },
  'arrow-in': { d: 'M19 12H8M11 5l-7 7 7 7' },
  clipboard: { d: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v14H6zM9 11h6M9 15h6' },
  history: { d: 'M3.5 12a8.5 8.5 0 1 0 2.8-6.3M6 5.5V9h3.5M12 8v4.2l3 1.8' },
  chart: { d: 'M4 20V10M10 20V4M16 20v-7M4 20h16' },
  tag: { d: 'M20.6 12.6 12 4 4 4v8l8.6 8.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8zM8 8h.01' },
  plus: { d: 'M12 5v14M5 12h14' },
  minus: { d: 'M5 12h14' },
  check: { d: 'M20 6 9 17l-5-5' },
  'check-circle': { d: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3' },
  close: { d: 'M18 6 6 18M6 6l12 12' },
  'chevron-down': { d: 'M6 9l6 6 6-6' },
  'chevron-right': { d: 'M9 6l6 6-6 6' },
  'chevron-left': { d: 'M15 6l-6 6 6 6' },
  'arrow-right': { d: 'M5 12h14M13 6l6 6-6 6' },
  pin: { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  users: { d: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
  person: { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  wrench: { d: 'M15.5 7a4.5 4.5 0 0 1-5.9 5.9L4 18.5 5.5 20l5.6-5.6A4.5 4.5 0 0 0 17 8.5a4.5 4.5 0 0 0-.3-1.6l-2.6 2.6-2-.5-.5-2 2.6-2.6A4.5 4.5 0 0 0 15.5 7z' },
  archive: { d: 'M3 4h18v4H3zM5 8v12h14V8M9 12h6' },
  bolt: { d: 'M13 2 5 13h6l-1 9 9-12h-6l0-8z' },
  gauge: { d: 'M5 18a8 8 0 1 1 14 0M12 12l3.5-2.5M12 12.5a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z' },
  package: { d: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
  scan: { d: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 8h8v8H8z' },
};

/**
 * Inline SVG icon string.
 * @param {string} name
 * @param {Object} [o] { size=18, tone='currentColor', cls='' }
 */
export function icon(name, o = {}) {
  const g = ICONS[name] || ICONS.box;
  const size = o.size || 18;
  const tone = o.tone || 'currentColor';
  const color = tone === 'currentColor' ? 'currentColor'
    : (/^(var\(|#|rgb)/.test(tone) ? tone : `var(--${String(tone).replace(/^--/, '')})`);
  return `<svg class="gud-ic ${o.cls || ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${o.strokeWidth || 1.7}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${g.d}"/></svg>`;
}

/** A keyboard key chip, e.g. kbd('Ctrl'), kbd('K') — Doc 2 §12: shown in
 *  context next to the control it triggers, never only in a reference card. */
export function kbd(label) {
  return `<span class="gud-kbd">${esc(label)}</span>`;
}
/** A chain of keys, e.g. kbdRow(['Ctrl','K']) -> "Ctrl K" chip pair. */
export function kbdRow(keys) {
  return `<span class="gud-kbd-row">${keys.map(kbd).join('')}</span>`;
}

/** Reusable empty state — icon tile + title + hint + optional CTA, the same
 *  shape as .eng-empty. An empty state always encourages the next
 *  operational action (Doc 2 §14) — never a bare "no data" dead end. */
export function emptyState({ iconName = 'box', title, hint, ctaLabel = null, ctaAct = null }) {
  const cta = ctaLabel && ctaAct
    ? `<button type="button" class="gud-btn -primary gud-empty-cta" data-act="${esc(ctaAct)}">${icon('plus', { size: 15 })} ${esc(ctaLabel)}</button>`
    : '';
  return `<div class="gud-empty">
    <span class="gud-empty-ic">${icon(iconName, { size: 26 })}</span>
    <div class="gud-empty-t">${esc(title)}</div>
    <div class="gud-empty-h">${esc(hint)}</div>
    ${cta}
  </div>`;
}

/** Format a plain quantity for display — no unit invented (Doc 1-4 never
 *  name a unit-of-measure concept), just a grouped integer. */
export function fmtQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('id-ID');
}

/** Format a Rupiah amount for display. Mirrors quiet-intelligence-engine.js's
 *  "Rp 2.4jt" style for LARGE aggregate figures; a single line-item price is
 *  shown in full (Rp 15.000), never abbreviated, since abbreviating an exact
 *  transaction amount would misrepresent it, unlike a rounded monthly average. */
export function fmtRupiah(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
}

/** Relative-ish timestamp for feed rows (Movement/Asset History) — short,
 *  human, matches the app's existing "Hari ini / Kemarin / D Mon" idiom
 *  (js/engineering/ui/engineering-atoms.js#fmtDeadline uses the same one). */
const _MON_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function fmtWhen(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t), n = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((midnight(d) - midnight(n)) / 86400000);
  if (dayDiff === 0) return `Hari ini ${hh}:${mm}`;
  if (dayDiff === -1) return `Kemarin ${hh}:${mm}`;
  const base = `${d.getDate()} ${_MON_ID[d.getMonth()]}`;
  return (d.getFullYear() === n.getFullYear() ? base : `${base} ${d.getFullYear()}`) + ` ${hh}:${mm}`;
}
