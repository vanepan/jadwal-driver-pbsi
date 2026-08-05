/* ============================================================
   GUDANG-TIMELINE.JS — Warehouse Activity Timeline UI (v1.29.6)

   Lives INSIDE the existing Item Detail Drawer (brief: "Do NOT create
   another page. Do NOT create another modal.") — this file only renders;
   gudang-item-detail.js owns mounting it and the one piece of state it
   needs (st.detail.timeline: {filterType, query, page}).

   NO NEW FIREBASE READ: buildActivities() below shapes data gudang-item-
   detail.js's own ensureConsumableData() ALREADY fetches (st.detail.
   movements) — Performance/"avoid unnecessary downloads" is satisfied by
   not adding a second query, not by a new caching layer.

   VISUAL LANGUAGE: reuses gudang-movement-history.js's own established
   timeline classes VERBATIM (.gud-timeline/-group/-label/-rows,
   .gud-hist-row/-ic/-main/-title/-qty/-sub/-time) — "reuse the existing
   design language," not a second timeline look. The one new element is
   the expand/collapse row itself, and even THAT reuses the one existing
   precedent for it elsewhere in the app (a native <details>/<summary>
   disclosure, e.g. js/app.js's own v2-audit-tech-details) — free
   keyboard accessibility (Tab focuses the summary, Enter/Space toggles
   it) with zero new JS, exactly why that pattern was chosen there too.
   ============================================================ */

'use strict';

import { esc, icon, fmtRupiah } from './gudang-atoms.js';
import {
  sortActivitiesDesc, groupActivitiesByPeriod, filterActivitiesByType, searchActivities, availableActivityTypes,
} from '../activity/activity-engine.js';
import { ACTIVITY_LABEL, iconForActivity, toneForActivity, itemCreatedActivity, movementToActivity } from '../activity/gudang-activities.js';

const PAGE_SIZE = 30;

export function ensureTimelineState(st) {
  if (!st.detail.timeline) st.detail.timeline = { filterType: 'all', query: '', page: PAGE_SIZE };
  return st.detail.timeline;
}

/** Item Created (always) + every cached Movement (Consumable only —
 *  st.detail.movements is undefined/empty for an Asset-type Item, which
 *  is correct: Asset UNIT history stays exactly where it already lives,
 *  each unit's own Asset Detail drawer, untouched by this release). */
function buildActivities(st, item) {
  const entries = [itemCreatedActivity(item)];
  if (st.detail.movements) {
    for (const m of st.detail.movements) entries.push(movementToActivity(m, st.data.departments));
  }
  return sortActivitiesDesc(entries);
}

function fmtTimeOnly(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function renderTimeline(st, item) {
  const t = ensureTimelineState(st);
  const all = buildActivities(st, item);
  const types = availableActivityTypes(all);
  const filtered = searchActivities(filterActivitiesByType(all, t.filterType), t.query);
  const page = filtered.slice(0, t.page);
  const groups = groupActivitiesByPeriod(page);

  return `<div class="gud-sec">
    <div class="gud-sec-t-row">
      <div class="gud-sec-t">AKTIVITAS</div>
      <button type="button" class="gud-link-btn" data-act="gud-goto" data-val="history">${icon('arrow-right', { size: 12 })} Movement History</button>
    </div>
    ${types.length > 1 ? renderFilterChips(t, types) : ''}
    ${all.length > 3 ? `<input class="gud-input gud-mt gud-timeline-search" data-act="gud-timeline-q" value="${esc(t.query)}" placeholder="Cari aktivitas…" autocomplete="off" />` : ''}
    ${filtered.length
      ? `<div class="gud-timeline gud-mt">${groups.map(renderGroup).join('')}</div>`
      : `<div class="gud-muted gud-mt">${all.length ? 'Tidak ada aktivitas yang cocok.' : 'Belum ada aktivitas.'}</div>`}
    ${filtered.length > page.length ? `<button type="button" class="gud-btn gud-mt" data-act="gud-timeline-more">Muat Lebih Banyak (${filtered.length - page.length} lagi)</button>` : ''}
  </div>`;
}

function renderFilterChips(t, types) {
  return `<div class="gud-chips gud-mt">
    <button type="button" class="gud-chip" data-on="${t.filterType === 'all'}" data-act="gud-timeline-filter" data-val="all">Semua</button>
    ${types.map((ty) => `<button type="button" class="gud-chip" data-on="${t.filterType === ty}" data-act="gud-timeline-filter" data-val="${esc(ty)}">${esc(ACTIVITY_LABEL[ty] || ty)}</button>`).join('')}
  </div>`;
}

function renderGroup(g) {
  return `<section class="gud-timeline-group">
    <div class="gud-timeline-label">${esc(g.label)}</div>
    <div class="gud-timeline-rows gud-stagger">${g.entries.map(renderRow).join('')}</div>
  </section>`;
}

function renderRow(a) {
  const hasDetail = !!(a.who || a.meta);
  const inner = `
    <span class="gud-hist-ic" data-tone="${toneForActivity(a.type)}">${icon(iconForActivity(a.type), { size: 15 })}</span>
    <span class="gud-hist-main">
      <span class="gud-hist-title">${esc(a.title)}</span>
      <span class="gud-hist-sub">${esc(a.description)}</span>
    </span>
    <span class="gud-hist-time">${esc(fmtTimeOnly(a.when))}</span>`;
  // Every activity CAN expand (brief) — but one with genuinely nothing
  // beyond its summary (Item Created: no who, no meta) skips the
  // disclosure affordance entirely rather than offering to "expand" into
  // an empty box, which would just be visual clutter (Visual Design:
  // "no visual clutter") — a plain row, same as gudang-movement-
  // history.js's own historyCard() for a row with nothing more to show.
  if (!hasDetail) return `<div class="gud-hist-row">${inner}</div>`;
  return `<details class="gud-timeline-row">
    <summary class="gud-hist-row gud-timeline-row-summary">${inner}
      <span class="gud-timeline-chevron">${icon('chevron-down', { size: 13 })}</span>
    </summary>
    <div class="gud-timeline-detail">${renderDetail(a)}</div>
  </details>`;
}

function renderDetail(a) {
  const rows = [];
  if (a.who) rows.push(['Oleh', esc(a.who)]);
  if (a.meta?.departmentName) rows.push(['Bidang', esc(a.meta.departmentName)]);
  if (a.meta?.purpose) rows.push(['Tujuan', esc(a.meta.purpose)]);
  if (a.meta?.notes) rows.push(['Catatan', esc(a.meta.notes)]);
  if (a.meta?.price != null) rows.push(['Harga', esc(fmtRupiah(a.meta.price))]);
  rows.push(['Waktu', esc(new Date(a.when).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }))]);
  return rows.map(([k, v]) => `<div class="gud-kv"><span class="gud-kv-k">${k}</span><span class="gud-kv-v">${v}</span></div>`).join('');
}

/* ── handlers ─────────────────────────────────────────────────────────── */
export const timelineHandlers = {
  onClick(st, act, el, render) {
    const t = ensureTimelineState(st);
    if (act === 'gud-timeline-filter') { t.filterType = el.dataset.val || 'all'; t.page = PAGE_SIZE; render(); }
    else if (act === 'gud-timeline-more') { t.page += PAGE_SIZE; render(); }
  },
  onInput(st, act, input, render) {
    const t = ensureTimelineState(st);
    if (act === 'gud-timeline-q') { t.query = input.value; t.page = PAGE_SIZE; render(); }
  },
};
