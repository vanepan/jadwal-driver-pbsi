/* ============================================================
   EXECUTIVE-TABLE.JS — The ONE table primitive (v1.18.3 Foundation)

   Part of the Executive UI Kit. A single, canonical, dark-mode-safe data
   table that every future analytics module will consume — replacing the
   four hand-rolled tables (.daa-table, .dwi-table, Petty Cash inline table,
   .vm inventory grid).

   PURE PRESENTATION. It computes nothing and stores no app state. It is a
   string builder (renderExecutiveTable) plus a tiny, dependency-free DOM
   enhancer (bindExecutiveTable) that wires client-side sort + keyboard rows.

   DESIGN: platform tokens only (var(--surface/-2), --border, --text, --muted,
   --radius-sm, --shadow-sm, --ok/--info/--warn/--danger). No rem, no hard-coded
   surface colors, no emoji. Styles live in platform.css under `.exec-table*`.

   Capabilities (Sprint-1 deliverable):
     • responsive (horizontal-scroll wrap, min-width:0)
     • sortable (header click → client-side sort, aria-sort)
     • sticky header
     • numeric alignment (align:'right')
     • status pills (col.pill or cell {pill})
     • row click support (data-row-id → 'exec-table:row' CustomEvent)
     • keyboard accessible (focusable rows, Enter/Space activate; sortable
       headers are buttons)
     • dark-mode safe (token-driven)

   NOTE: This file migrates NO existing table. It only makes the primitive
   available for Sprint 2+.
   ============================================================ */

'use strict';

import { anIcon } from './analytics-shell.js';

/** Minimal HTML escaper (mirrors analytics-shell). */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PILL_TONES = new Set(['ok', 'info', 'warn', 'danger', 'neutral']);

/** Render one status pill (the canonical pill — also exported via the kit). */
export function renderExecutiveStatusPill(text, tone = 'neutral', title = '') {
  const t = PILL_TONES.has(tone) ? tone : 'neutral';
  const titleAttr = title ? ` title="${esc(title)}"` : '';
  return `<span class="exec-pill exec-pill--${t}"${titleAttr}>${esc(text)}</span>`;
}

/**
 * Build one cell's inner HTML + its sort value.
 * @returns {{html:string, sort:string}}
 */
function buildCell(col, row) {
  const raw = row && Object.prototype.hasOwnProperty.call(row, col.key) ? row[col.key] : '';
  // A column may carry a custom renderer returning ready HTML.
  if (typeof col.render === 'function') {
    const out = col.render(raw, row);
    const sort = (col.sortValue ? col.sortValue(raw, row) : raw);
    return { html: out == null ? '' : String(out), sort: String(sort == null ? '' : sort) };
  }
  // A cell value may be a descriptor object: { value, pill, tone, title, sort }.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const sort = raw.sort != null ? raw.sort : (raw.value != null ? raw.value : '');
    if (raw.pill || raw.tone) {
      return { html: renderExecutiveStatusPill(raw.value, raw.tone || 'neutral', raw.title || ''), sort: String(sort) };
    }
    return { html: esc(raw.value), sort: String(sort) };
  }
  // Column-level pill mapping (col.pill = (val,row) => tone | falsy).
  if (typeof col.pill === 'function') {
    const tone = col.pill(raw, row);
    if (tone) return { html: renderExecutiveStatusPill(raw, tone), sort: String(raw == null ? '' : raw) };
  }
  return { html: esc(raw), sort: String(raw == null ? '' : raw) };
}

/**
 * Render the ONE canonical table.
 *
 * @param {Object} p
 * @param {Array<{key:string,label:string,align?:'left'|'right'|'center',sortable?:boolean,
 *   width?:string,render?:Function,sortValue?:Function,pill?:Function}>} p.columns
 * @param {Array<Object>} p.rows  - each row is a flat object keyed by column.key,
 *   plus optional `id` (→ data-row-id) and `clickable` (→ focusable + cursor).
 * @param {string} [p.caption]    - accessible caption / visible eyebrow label
 * @param {string} [p.empty]      - message when rows is empty
 * @param {boolean} [p.stickyHeader=true]
 * @param {boolean} [p.dense=false]
 * @param {string} [p.ariaLabel]
 * @returns {string}
 */
export function renderExecutiveTable({
  columns = [], rows = [], caption = '', empty = 'Tidak ada data.',
  stickyHeader = true, dense = false, ariaLabel = '',
} = {}) {
  const cols = Array.isArray(columns) ? columns.filter(Boolean) : [];
  const data = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const anySortable = cols.some((c) => c.sortable);

  const capHtml = caption
    ? `<div class="exec-table-cap">${esc(caption)}</div>` : '';

  if (!data.length) {
    return `${capHtml}<div class="exec-table-empty">${esc(empty)}</div>`;
  }

  const thead = `<thead><tr>${cols.map((c, i) => {
    const align = c.align === 'right' ? ' exec-th--r' : c.align === 'center' ? ' exec-th--c' : '';
    const w = c.width ? ` style="width:${esc(c.width)}"` : '';
    if (c.sortable) {
      return `<th class="exec-th exec-th--sort${align}" data-col="${i}" aria-sort="none"${w}>` +
        `<button type="button" class="exec-th-btn">${esc(c.label)}` +
        `<span class="exec-th-ico" aria-hidden="true">${anIcon('sort', { size: 13 })}</span></button></th>`;
    }
    return `<th class="exec-th${align}"${w}>${esc(c.label)}</th>`;
  }).join('')}</tr></thead>`;

  const tbody = `<tbody>${data.map((row) => {
    const id = row.id != null ? row.id : '';
    const clickable = !!row.clickable && id !== '';
    const rowAttrs = clickable
      ? ` class="exec-tr exec-tr--click" data-row-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(row.rowLabel || ('Detail ' + id))}"`
      : ' class="exec-tr"';
    const tds = cols.map((c) => {
      const align = c.align === 'right' ? ' exec-td--r' : c.align === 'center' ? ' exec-td--c' : '';
      const name = c.primary ? ' exec-td--name' : '';
      const { html, sort } = buildCell(c, row);
      return `<td class="exec-td${align}${name}" data-sort="${esc(sort)}">${html}</td>`;
    }).join('');
    return `<tr${rowAttrs}>${tds}</tr>`;
  }).join('')}</tbody>`;

  const cls = [
    'exec-table',
    stickyHeader ? 'exec-table--sticky' : '',
    dense ? 'exec-table--dense' : '',
  ].filter(Boolean).join(' ');
  const sortableAttr = anySortable ? ' data-exec-sortable="1"' : '';
  const labelAttr = ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : '';

  return `${capHtml}<div class="exec-table-wrap"><table class="${cls}"${sortableAttr}${labelAttr}>${thead}${tbody}</table></div>`;
}

/* ── DOM enhancer (sort + keyboard) ───────────────────────────────────────────
   Self-contained, idempotent, dependency-free. Call once per host AFTER the
   table HTML is in the DOM. Sorting reorders the existing <tr> nodes by each
   cell's data-sort (numeric-aware); it never recomputes data. Row activation
   (click / Enter / Space) emits a bubbling 'exec-table:row' CustomEvent whose
   detail.id is the row's data-row-id — consumers open their drawer from there. */
export function bindExecutiveTable(host) {
  if (!host || host.__execTableBound) return;
  host.__execTableBound = true;

  host.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('.exec-th--sort');
    if (sortBtn) { _sortBy(sortBtn); return; }
    const row = e.target.closest('.exec-tr--click');
    if (row) _activateRow(row);
  });

  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.exec-tr--click');
    if (row) { e.preventDefault(); _activateRow(row); }
  });
}

function _activateRow(row) {
  const id = row.getAttribute('data-row-id');
  row.dispatchEvent(new CustomEvent('exec-table:row', { bubbles: true, detail: { id } }));
}

function _sortBy(th) {
  const table = th.closest('table');
  const tbody = table && table.querySelector('tbody');
  if (!tbody) return;
  const colIdx = Number(th.getAttribute('data-col'));
  const current = th.getAttribute('aria-sort');
  const dir = current === 'ascending' ? 'descending' : 'ascending';

  // Reset siblings, set this one.
  table.querySelectorAll('th[aria-sort]').forEach((h) => h.setAttribute('aria-sort', 'none'));
  th.setAttribute('aria-sort', dir);

  const rows = Array.from(tbody.querySelectorAll('tr'));
  const factor = dir === 'ascending' ? 1 : -1;
  rows.sort((a, b) => {
    const av = a.children[colIdx] ? a.children[colIdx].getAttribute('data-sort') : '';
    const bv = b.children[colIdx] ? b.children[colIdx].getAttribute('data-sort') : '';
    const an = parseFloat(av), bn = parseFloat(bv);
    const bothNum = !Number.isNaN(an) && !Number.isNaN(bn);
    if (bothNum) return (an - bn) * factor;
    return String(av).localeCompare(String(bv), 'id', { numeric: true }) * factor;
  });
  rows.forEach((r) => tbody.appendChild(r));
}
