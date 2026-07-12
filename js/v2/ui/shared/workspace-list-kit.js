/* ============================================================
   WORKSPACE-LIST-KIT.JS — Sarpras Intelligence shared UI kit (V2.0.18)

   PURPOSE: the presentational scaffolding Archive Center, Knowledge Center
   and Learning Dashboard all need (tab shell, empty state, row list, filter
   bar, search box, a stacked detail drawer, a diff table) — generalized
   from nor-center.js's own local `shellMarkup()`/`emptyState()`/
   `renderArchiveRows()`/`renderReviewRows()` (V2.0.11) so the three new
   workspaces don't each re-author the same markup a third/fourth time.

   RESPONSIBILITY: pure rendering only. Every function here takes data (or
   a render callback) and returns an HTML string — nothing in this file
   calls an Organizational Memory or Knowledge engine directly, so it
   cannot duplicate business logic by construction.

   The one exception is `deriveRejectedFromCandidateQueue`, which is pure
   COMPOSITION over data/functions the caller supplies (it never imports an
   engine module itself) — see its own header below for why a "Rejected"
   view needs this at all (there is no `rejected` lifecycle state).

   DEPENDENCIES: knowledge/contracts/lifecycle-contract.js (LIFECYCLE_STATE
   — a vocabulary contract, not an engine; reusing its constants here is
   the same kind of reuse nor-center.js already does).

   NON-GOALS: nor-center.js is NOT migrated onto this kit in V2.0.18 — see
   that file's own header. Migrating it is a V2.0.19 hardening task, done
   as a verified byte-identical-output refactor.
   ============================================================ */

'use strict';

import { LIFECYCLE_STATE } from '../../knowledge/contracts/lifecycle-contract.js';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** V2.1 — "Display file sizes in KB/MB/GB. Never raw bytes." The one
 *  shared formatter every sizeBytes display in Sarpras Intelligence
 *  reuses (Dataset Import Center rows, session detail) rather than each
 *  re-deriving the same KB/MB/GB thresholds independently. */
export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── empty state ──────────────────────────────────────────────────── */

export function renderEmptyState(title, subtitle) {
  return `
    <div class="wlk-empty">
      <svg class="wlk-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>
      </svg>
      <div class="wlk-empty-title">${esc(title)}</div>
      ${subtitle ? `<div class="wlk-empty-sub">${esc(subtitle)}</div>` : ''}
    </div>`;
}

/* ── tab shell ────────────────────────────────────────────────────── */

/**
 * @param {{id:string,label:string}[]} tabs
 * @param {string} activeId
 * @param {{tabAct?: string, ariaLabel?: string}} [opts]
 */
export function renderTabShell(tabs, activeId, opts = {}) {
  const act = opts.tabAct || 'wlk-tab';
  const label = opts.ariaLabel || 'Workspace';
  const buttons = tabs.map((t) => `<button class="wlk-tab${t.id === activeId ? ' wlk-tab--active' : ''}" data-act="${act}" data-id="${t.id}" type="button">${esc(t.label)}</button>`).join('');
  return `
    <div class="wlk-shell">
      <div class="wlk-tabbar" role="tablist" aria-label="${esc(label)}">${buttons}</div>
      <div class="wlk-content"></div>
    </div>`;
}

/* ── row list ─────────────────────────────────────────────────────── */

/**
 * @param {Array} items
 * @param {(item:*) => string} rowRenderer must return one `<li>` (or fragment of `<li>`s)
 */
export function renderRowList(items, rowRenderer) {
  return `<ul class="wlk-row-list">${items.map(rowRenderer).join('')}</ul>`;
}

/* ── stat / status grid ───────────────────────────────────────────── */

/** @param {{count:*, label:string}[]} cards */
export function renderStatCards(cards) {
  return `
    <ul class="wlk-status-grid">
      ${cards.map((c) => `
        <li class="wlk-status-item">
          <span class="wlk-status-count">${esc(c.count)}</span>
          <span class="wlk-status-label">${esc(c.label)}</span>
        </li>`).join('')}
    </ul>`;
}

/* ── filter bar / search box ──────────────────────────────────────── */

/**
 * @param {{id:string,label:string}[]} filters
 * @param {string} activeId
 * @param {{act?: string}} [opts]
 */
export function renderFilterBar(filters, activeId, opts = {}) {
  const act = opts.act || 'wlk-filter';
  return `
    <div class="wlk-filter-bar">
      ${filters.map((f) => `<button class="wlk-filter-chip${f.id === activeId ? ' wlk-filter-chip--active' : ''}" data-act="${act}" data-id="${f.id}" type="button">${esc(f.label)}</button>`).join('')}
    </div>`;
}

/** @param {{inputId?: string}} [opts] */
export function renderSearchBox(value, placeholder, opts = {}) {
  const id = opts.inputId ? ` id="${esc(opts.inputId)}"` : '';
  return `<input${id} class="wlk-search-box" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" />`;
}

/* ── detail drawer ────────────────────────────────────────────────── */

/** One stacked section inside a detail drawer — omitted entirely if `bodyHtml` is falsy. */
export function renderDetailSection(title, bodyHtml) {
  if (!bodyHtml) return '';
  return `
    <div class="wlk-detail-sec">
      <div class="wlk-detail-sec-title">${esc(title)}</div>
      ${bodyHtml}
    </div>`;
}

/** @param {[string, *][]} pairs */
export function renderKvList(pairs) {
  return `
    <ul class="wlk-kv-list">
      ${pairs.map(([k, v]) => `<li class="wlk-kv-row"><span class="wlk-kv-key">${esc(k)}</span><span class="wlk-kv-val">${esc(v == null || v === '' ? '—' : v)}</span></li>`).join('')}
    </ul>`;
}

/**
 * Wraps zero or more `renderDetailSection()` outputs in one drawer card.
 * @param {string[]} sectionHtmlList
 */
export function renderDetail(sectionHtmlList) {
  const body = sectionHtmlList.filter(Boolean).join('');
  return `<div class="wlk-detail">${body || renderEmptyState('Tidak ada detail untuk ditampilkan.')}</div>`;
}

/* ── diff table ───────────────────────────────────────────────────── */

const DIFF_TAG_CLASS = { added: 'wlk-diff-added', removed: 'wlk-diff-removed', modified: 'wlk-diff-modified' };

/**
 * Renders the exact shape `computeDiff()` (knowledge/learning/diff-engine.js)
 * returns: `{schema, entries:[{field,before,after,changeType}], fieldsChanged, computedAt}`.
 * This is the ONE diff renderer every Diff Viewer in Sarpras Intelligence uses.
 * @param {{entries: {field:string, before:*, after:*, changeType:string}[], fieldsChanged: number}} diff
 */
export function renderDiffTable(diff) {
  if (!diff || !diff.entries || diff.entries.length === 0) {
    return renderEmptyState('Tidak ada perbedaan.', 'Kedua versi identik.');
  }
  const rows = diff.entries.map((e) => {
    const tagClass = DIFF_TAG_CLASS[e.changeType] || '';
    return `
      <tr>
        <td>${esc(e.field)}</td>
        <td>${esc(JSON.stringify(e.before))}</td>
        <td>${esc(JSON.stringify(e.after))}</td>
        <td class="${tagClass}"><span class="wlk-diff-tag">${esc(e.changeType)}</span></td>
      </tr>`;
  }).join('');
  return `
    <table class="wlk-diff-table">
      <thead><tr><th>Field</th><th>Sebelum</th><th>Sesudah</th><th>Perubahan</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── rejected derivation ──────────────────────────────────────────── */

/**
 * "Rejected" composition helper — there is NO `rejected` lifecycle state
 * (knowledge/contracts/lifecycle-contract.js only defines
 * draft -> candidate -> pending_review -> approved -> deprecated;
 * review-workflow-engine.js#reject() sends an item back to `candidate`).
 * A genuinely rejected item is therefore a Candidate whose history shows a
 * real `pending_review -> candidate` transition (as opposed to an item
 * that simply never left Candidate yet). This is pure composition over
 * data the caller already fetched — it imports no engine module itself.
 *
 * @param {{itemId:string}[]} candidateEntries   from getCandidateQueue()
 * @param {(id:string) => {ok:boolean, data:*[]}} getHistory   from knowledge-repository.js
 * @returns {{itemId:string, rejectedAtVersion:number, rejectedAt:string}[]}
 */
export function deriveRejectedFromCandidateQueue(candidateEntries, getHistory) {
  const rejected = [];
  for (const entry of candidateEntries) {
    const historyResult = getHistory(entry.itemId);
    if (!historyResult.ok) continue;
    const versions = historyResult.data;
    for (let i = 1; i < versions.length; i += 1) {
      if (versions[i - 1].lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW
        && versions[i].lifecycleState === LIFECYCLE_STATE.CANDIDATE) {
        rejected.push({ itemId: entry.itemId, rejectedAtVersion: versions[i].version, rejectedAt: versions[i].updatedAt });
        break;
      }
    }
  }
  return rejected;
}
