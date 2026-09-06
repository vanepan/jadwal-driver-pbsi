/* ============================================================
   INTELLIGENCE-CURATION-CONSOLE.JS — Human Curation Workspace
   (V2, Phase 5.x.8)

   The GOVERNANCE surface for Sarpras Intelligence: the ONE controlled
   place an authorized operator inspects proposed PBSI NOR Style Guide
   rules (5.x.5) + Visual Templates (5.x.6) — their evidence, temporal
   context, provenance, conflicts and supersession candidates — and then
   EXPLICITLY approves / rejects / supersedes / deprecates them.

   It is NOT an AI decision engine, NOT a generator, NOT RAG. The system
   surfaces evidence and enforces the lifecycle; only the authorized human
   decides what becomes an official PBSI convention.

   ARCHITECTURE (mirrors js/intelligence-console.js):
     • ALL workspace state → the PURE
       src/intelligence/console/curation-workspace-controller.js
     • the real store facades (Style Guide + Visual Template) are assembled
       by js/intelligence-backend-wiring.js — this file imports ONLY that
       bridge, never src/intelligence/ directly, never js/firebase.js
     • this file owns ONLY the DOM: build the shell once; re-render the
       content region per paint; build the decision dialog ONCE per
       decision signature so the rationale textarea never loses focus/caret

   GATING: identical to the intake console — mounted only for the V2 pilot
   with the synced Intelligence feature flag ON, and the server callable
   independently enforces effective-admin authorization from the verified
   Firebase context. With the flag OFF (production default) this file is
   never loaded.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { createWiredIntelligenceCurationController } from './intelligence-backend-wiring.js';

const STYLE_ID = 'cur-console-style';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'style_rules', label: 'Style Rules' },
  { id: 'visual_templates', label: 'Visual Templates' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'history', label: 'History' },
];

const DECISION_LABEL = {
  approve: 'Approve rule',
  reject: 'Reject proposal',
  deprecate: 'Deprecate rule',
  supersede: 'Supersede & approve',
};
const DECISION_VERB = { approve: 'Approving', reject: 'Rejecting', deprecate: 'Deprecating', supersede: 'Superseding' };

const CSS = `
.cur-console{width:100%;max-width:1080px;margin:0 auto;padding:16px;box-sizing:border-box;
  font:14px/1.55 var(--font-sans,system-ui,-apple-system,Segoe UI,Roboto,sans-serif);
  color:var(--text,#1b1b1f);overflow-x:hidden}
.cur-console *{box-sizing:border-box}
.cur-console__head{margin:0 0 12px}
.cur-console__title{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em}
.cur-console__sub{margin:3px 0 0;color:var(--text-muted,#5b5b66);font-size:12.5px}
.cur-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border,#e2e2e8);margin-bottom:16px}
.cur-tab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;
  padding:8px 12px;font:inherit;font-weight:600;color:var(--text-muted,#5b5b66);cursor:pointer;
  border-radius:8px 8px 0 0;min-height:40px}
.cur-tab[aria-selected="true"]{color:var(--accent,#2f6fed);border-bottom-color:var(--accent,#2f6fed)}
.cur-tab .cur-count{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:999px;
  background:var(--surface-2,#f0f0f4);color:var(--text-muted,#5b5b66);font-size:11px;font-weight:700}
.cur-tab[aria-selected="true"] .cur-count{background:var(--accent-soft,#e7efff);color:var(--accent,#2f6fed)}

.cur-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px;align-items:start}
.cur-panel{border:1px solid var(--border,#e2e2e8);border-radius:14px;background:var(--surface,#fff);padding:14px;min-width:0}
.cur-panel--muted{background:var(--surface-2,#f7f7f9)}
.cur-kicker{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted,#6b6b76)}

.cur-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.cur-metric{border:1px solid var(--border,#e2e2e8);border-radius:12px;padding:12px;background:var(--surface,#fff)}
.cur-metric b{display:block;font-size:22px;font-weight:700;letter-spacing:-.02em}
.cur-metric span{font-size:12px;color:var(--text-muted,#5b5b66)}
.cur-metric--warn b{color:var(--warning-text,#7a5300)}
.cur-metric--alert b{color:var(--danger-text,#8a1f1f)}

.cur-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.cur-filters select,.cur-filters button{font:inherit;padding:7px 10px;border-radius:9px;border:1px solid var(--border,#c9c9d2);
  background:var(--surface,#fff);color:inherit;min-height:38px}
.cur-filters button{cursor:pointer;color:var(--text-muted,#5b5b66)}

.cur-list{display:flex;flex-direction:column;gap:8px}
.cur-card{width:100%;text-align:left;appearance:none;border:1px solid var(--border,#e2e2e8);border-radius:12px;
  background:var(--surface,#fff);padding:11px 12px;font:inherit;color:inherit;cursor:pointer;display:flex;
  flex-direction:column;gap:5px;min-width:0}
.cur-card[aria-current="true"]{border-color:var(--accent,#2f6fed);box-shadow:0 0 0 1px var(--accent,#2f6fed) inset}
.cur-card__top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cur-card__summary{font-weight:600;overflow-wrap:anywhere}
.cur-card__meta{font-size:12px;color:var(--text-muted,#5b5b66);display:flex;gap:10px;flex-wrap:wrap}
.cur-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;
  background:var(--surface-2,#f0f0f4);border:1px solid var(--border,#e2e2e8);color:var(--text-muted,#5b5b66)}
.cur-chip--proposed{background:var(--warning-soft,#fff3d6);border-color:var(--warning-border,#f0d089);color:var(--warning-text,#7a5300)}
.cur-chip--approved{background:var(--success-soft,#e4f6e9);border-color:var(--success-border,#a9dcb9);color:var(--success-text,#1f7a3d)}
.cur-chip--rejected,.cur-chip--deprecated{background:var(--surface-2,#f0f0f4);color:var(--text-muted,#6b6b76)}
.cur-chip--conflict{background:var(--danger-soft,#fdecec);border-color:var(--danger-border,#f5c2c2);color:var(--danger-text,#8a1f1f)}

.cur-dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px}
.cur-dl dt{color:var(--text-muted,#6b6b76)}
.cur-dl dd{margin:0;overflow-wrap:anywhere}
.cur-sub{margin:14px 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#6b6b76)}
.cur-ids{font-size:11.5px;color:var(--text-muted,#6b6b76);word-break:break-all;line-height:1.7}
.cur-note{margin:8px 0 0;font-size:12.5px;color:var(--text-muted,#5b5b66)}

.cur-authority{display:inline-block;padding:2px 8px;border-radius:6px;font-weight:700;font-size:11px;
  background:var(--surface-2,#f0f0f4);color:var(--text,#333)}
.cur-conf{font-size:12px;color:var(--text-muted,#6b6b76)}

.cur-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.cur-btn{appearance:none;font:inherit;font-weight:600;padding:9px 16px;border-radius:10px;border:1px solid transparent;
  background:var(--accent,#2f6fed);color:#fff;cursor:pointer;min-height:40px}
.cur-btn:disabled{opacity:.55;cursor:default}
.cur-btn--ghost{background:transparent;color:var(--accent,#2f6fed);border-color:var(--accent,#2f6fed)}
.cur-btn--danger{background:var(--danger-text,#8a1f1f)}
.cur-btn--quiet{background:transparent;color:var(--text-muted,#5b5b66);border-color:var(--border,#d0d0d8);font-weight:500}

.cur-conflict{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:stretch}
.cur-conflict__side{border:1px solid var(--border,#e2e2e8);border-radius:12px;padding:12px;background:var(--surface,#fff);min-width:0}
.cur-conflict__vs{align-self:center;font-weight:700;color:var(--text-muted,#8a8a94)}
.cur-conflict__decide{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--warning-soft,#fff3d6);
  border:1px solid var(--warning-border,#f0d089);color:var(--warning-text,#7a5300);font-size:12.5px}

.cur-state{padding:28px 16px;text-align:center;color:var(--text-muted,#6b6b76)}
.cur-state--error{color:var(--danger-text,#8a1f1f)}
.cur-skeleton{height:64px;border-radius:12px;background:linear-gradient(90deg,var(--surface-2,#f0f0f4) 25%,var(--surface,#fafafb) 37%,var(--surface-2,#f0f0f4) 63%);
  background-size:400% 100%;animation:cur-shimmer 1.4s ease-in-out infinite;margin-bottom:8px}
@keyframes cur-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}

.cur-toast{position:sticky;top:8px;z-index:5;margin:0 0 12px;padding:10px 12px;border-radius:10px;
  background:var(--success-soft,#e4f6e9);border:1px solid var(--success-border,#a9dcb9);color:var(--success-text,#1f7a3d);
  display:flex;align-items:center;gap:10px;font-size:13px}
.cur-toast button{margin-left:auto;appearance:none;background:transparent;border:0;font:inherit;cursor:pointer;color:inherit;font-weight:700}

.cur-dialog-backdrop{position:fixed;inset:0;background:rgba(15,18,24,.42);display:flex;align-items:center;
  justify-content:center;padding:16px;z-index:40}
.cur-dialog{width:100%;max-width:520px;max-height:90vh;overflow:auto;background:var(--surface,#fff);border-radius:16px;
  border:1px solid var(--border,#e2e2e8);padding:18px;box-shadow:0 24px 60px rgba(15,18,24,.28)}
.cur-dialog h3{margin:0 0 4px;font-size:16px}
.cur-dialog__what{margin:10px 0;padding:10px 12px;border-radius:10px;background:var(--surface-2,#f7f7f9);
  border:1px solid var(--border,#e2e2e8);font-size:12.5px}
.cur-dialog__what dl{margin:0}
.cur-dialog label{display:block;font-size:12px;font-weight:600;color:var(--text-muted,#5b5b66);margin:12px 0 4px}
.cur-dialog textarea{width:100%;min-height:96px;padding:10px 11px;border-radius:10px;border:1px solid var(--border,#c9c9d2);
  background:var(--surface,#fff);color:inherit;font:inherit;line-height:1.5;resize:vertical}
.cur-dialog__ack{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12.5px;
  padding:10px;border-radius:10px;background:var(--danger-soft,#fdecec);border:1px solid var(--danger-border,#f5c2c2);color:var(--danger-text,#8a1f1f)}
.cur-dialog__err{margin:10px 0 0;font-size:12.5px;color:var(--danger-text,#8a1f1f);overflow-wrap:anywhere}
.cur-dialog__stale{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--warning-soft,#fff3d6);
  border:1px solid var(--warning-border,#f0d089);color:var(--warning-text,#7a5300);font-size:12.5px}
.cur-dialog__actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}

@media (max-width:860px){
  .cur-grid{grid-template-columns:1fr}
  .cur-conflict{grid-template-columns:1fr}
  .cur-conflict__vs{justify-self:start}
}
@media (max-width:560px){
  .cur-console{padding:12px}
  .cur-tab{flex:1 1 auto;text-align:center}
  .cur-actions .cur-btn,.cur-dialog__actions .cur-btn{flex:1 1 100%}
  .cur-dl{grid-template-columns:1fr}
  .cur-dl dt{margin-top:6px}
}`;

function injectStyleOnce() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function ids(arr) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return '<span class="cur-ids">(none)</span>';
  return `<span class="cur-ids">${a.map(esc).join(' · ')}</span>`;
}

let _mounted = false;
let _host = null;
let _controller = null;
let _els = null;
let _dialogSig = null; // signature of the decision dialog currently built

/* ── shell (built once) ─────────────────────────────────────────────── */
function buildShell(host) {
  host.innerHTML = `
    <div class="cur-console" data-cur-console>
      <div class="cur-console__head">
        <h2 class="cur-console__title">Human Curation</h2>
        <p class="cur-console__sub">Humans create organizational authority. The system presents evidence and enforces the lifecycle — it does not decide what the organization should believe.</p>
      </div>
      <div class="cur-tabs" role="tablist" data-region="tabs"></div>
      <div data-region="toast"></div>
      <div data-region="content"></div>
    </div>
    <div data-region="dialog"></div>`;
  const q = (s) => host.querySelector(s);
  _els = {
    root: q('[data-cur-console]'),
    tabs: q('[data-region="tabs"]'),
    toast: q('[data-region="toast"]'),
    content: q('[data-region="content"]'),
    dialog: q('[data-region="dialog"]'),
  };
  _els.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b && _controller) _controller.setTab(b.getAttribute('data-tab'));
  });
  _els.content.addEventListener('click', onContentClick);
  _els.content.addEventListener('change', onContentChange);
}

function onContentChange(e) {
  const sel = e.target.closest('[data-filter]');
  if (sel && _controller) _controller.setFilter(sel.getAttribute('data-filter'), sel.value);
}

function onContentClick(e) {
  if (!_controller) return;
  const card = e.target.closest('[data-select-kind]');
  if (card) { _controller.select(card.getAttribute('data-select-kind'), card.getAttribute('data-select-id')); return; }
  const reset = e.target.closest('[data-reset-filters]');
  if (reset) { _controller.resetFilters(); return; }
  const back = e.target.closest('[data-clear-selection]');
  if (back) { _controller.clearSelection(); return; }
  const reload = e.target.closest('[data-reload]');
  if (reload) { _controller.reload(); return; }
  const dec = e.target.closest('[data-decision]');
  if (dec) { _controller.beginDecision(dec.getAttribute('data-decision')); return; }
}

/* ── tab strip ──────────────────────────────────────────────────────── */
function renderTabs(state) {
  const counts = {
    style_rules: state.dashboard ? state.dashboard.styleGuide.proposed : 0,
    visual_templates: state.dashboard ? state.dashboard.visualTemplate.proposed : 0,
    conflicts: state.dashboard ? state.dashboard.conflicts.total : 0,
  };
  _els.tabs.innerHTML = TABS.map((t) => {
    const sel = state.tab === t.id;
    const c = counts[t.id];
    return `<button class="cur-tab" role="tab" type="button" data-tab="${t.id}" aria-selected="${sel}">${esc(t.label)}${
      c ? `<span class="cur-count">${c}</span>` : ''}</button>`;
  }).join('');
}

/* ── success toast ──────────────────────────────────────────────────── */
function renderToast(state) {
  const o = state.lastOutcome;
  if (!o) { _els.toast.innerHTML = ''; return; }
  const verb = { approve: 'approved', reject: 'rejected', deprecate: 'deprecated', supersede: 'superseded & approved' }[o.action] || 'updated';
  _els.toast.innerHTML = `<div class="cur-toast" role="status">Proposal <b>${esc(o.id)}</b> ${esc(verb)}. New status: <b>${esc(o.status || '—')}</b>.
    <button type="button" data-dismiss-toast>Dismiss</button></div>`;
  const btn = _els.toast.querySelector('[data-dismiss-toast]');
  if (btn) btn.addEventListener('click', () => _controller && _controller.dismissOutcome());
}

/* ── content per tab ────────────────────────────────────────────────── */
function renderContent(state) {
  if (!state.ready && state.loading) { _els.content.innerHTML = skeleton(); return; }
  if (state.loadError) {
    _els.content.innerHTML = `<div class="cur-panel"><div class="cur-state cur-state--error">${esc(state.loadError)}
      <div style="margin-top:12px"><button class="cur-btn cur-btn--ghost" type="button" data-reload>Retry</button></div></div></div>`;
    return;
  }
  switch (state.tab) {
    case 'overview': _els.content.innerHTML = renderOverview(state); break;
    case 'style_rules': _els.content.innerHTML = renderProposalTab(state, 'style_rule'); break;
    case 'visual_templates': _els.content.innerHTML = renderProposalTab(state, 'visual_template'); break;
    case 'conflicts': _els.content.innerHTML = renderConflicts(state); break;
    case 'history': _els.content.innerHTML = renderHistory(state); break;
    default: _els.content.innerHTML = '';
  }
}

function skeleton() {
  return `<div class="cur-panel">${'<div class="cur-skeleton"></div>'.repeat(4)}</div>`;
}

function domainBadge(domainState) {
  if (domainState === 'unavailable') return '<span class="cur-chip cur-chip--conflict">unavailable</span>';
  if (domainState === 'empty') return '<span class="cur-chip">no proposals</span>';
  return '';
}

function renderOverview(state) {
  const d = state.dashboard;
  if (!d) return `<div class="cur-panel"><div class="cur-state">Nothing loaded yet.</div></div>`;
  const sg = d.styleGuide;
  const vt = d.visualTemplate;
  const metric = (n, label, mod) => `<div class="cur-metric${mod ? ` cur-metric--${mod}` : ''}"><b>${n}</b><span>${esc(label)}</span></div>`;
  const sgBlock = sg.available
    ? metric(sg.proposed, 'Style rules awaiting review', sg.proposed ? 'warn' : '')
      + metric(sg.approved, 'Authoritative style rules')
      + metric(sg.deprecated, 'Deprecated style rules')
    : `<div class="cur-metric cur-metric--alert"><b>—</b><span>Style Guide subsystem unavailable</span></div>`;
  const vtBlock = vt.available
    ? metric(vt.proposed, 'Visual templates awaiting review', vt.proposed ? 'warn' : '')
      + metric(vt.approved, 'Authoritative visual templates')
      + metric(vt.deprecated, 'Deprecated visual templates')
    : `<div class="cur-metric cur-metric--alert"><b>—</b><span>Visual Template subsystem unavailable</span></div>`;
  return `
    <div class="cur-panel">
      <p class="cur-kicker">Operator cockpit — counts from canonical data only</p>
      <div class="cur-metrics">
        ${metric(d.awaitingReview, 'Total awaiting your review', d.awaitingReview ? 'warn' : '')}
        ${metric(d.conflicts.total, 'Unresolved conflicts', d.conflicts.total ? 'alert' : '')}
        ${metric(d.conflicts.approved, 'Competing authoritative rules', d.conflicts.approved ? 'alert' : '')}
      </div>
      <p class="cur-sub">Style Guide ${domainBadge(state.domains.styleGuide)}</p>
      <div class="cur-metrics">${sgBlock}</div>
      <p class="cur-sub">Visual Templates ${domainBadge(state.domains.visualTemplate)}</p>
      <div class="cur-metrics">${vtBlock}</div>
    </div>`;
}

function filterBar(state, kind) {
  const fvSet = kind === 'style_rule' ? state.filterValues.styleRules : state.filterValues.visualTemplates;
  const opt = (vals, cur) => ['<option value="">all</option>']
    .concat(vals.map((v) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(v)}</option>`)).join('');
  const sel = (key, label, vals) => vals.length
    ? `<label style="display:contents"><select data-filter="${key}" aria-label="Filter by ${esc(label)}">${opt(vals, state.filters[key])}</select></label>` : '';
  return `<div class="cur-filters">
    ${sel('status', 'status', fvSet.status)}
    ${sel('documentType', 'document type', fvSet.documentType)}
    ${kind === 'style_rule' ? sel('category', 'category', fvSet.category) : sel('variant', 'variant', fvSet.variant)}
    ${sel('temporalStatus', 'temporal status', fvSet.temporalStatus)}
    <button type="button" data-reset-filters>Reset filters</button>
  </div>`;
}

function proposalCard(row) {
  const chip = `<span class="cur-chip cur-chip--${esc(row.status)}">${esc(row.status)}</span>`;
  const conflictChip = row.hasConflict ? '<span class="cur-chip cur-chip--conflict">conflict</span>' : '';
  const conf = row.evidenceConfidence != null
    ? `<span class="cur-conf">evidence confidence ${esc(row.evidenceConfidence)}</span>` : '';
  return `<button class="cur-card" type="button" data-select-kind="${esc(row.kind)}" data-select-id="${esc(row.id)}">
    <div class="cur-card__top">${chip}${conflictChip}
      <span class="cur-authority">Authority: ${esc(row.authorityLabel)}</span></div>
    <div class="cur-card__summary">${esc(row.summary)}</div>
    <div class="cur-card__meta">
      <span>${esc(row.documentType)}</span>
      ${row.category ? `<span>${esc(row.category)}</span>` : ''}
      <span>${row.evidenceCount} occurrences · ${row.sourceDocumentCount} docs</span>
      <span>${esc(row.temporalContext)}</span>
      <span>v${row.version}</span>
      ${conf}
    </div>
  </button>`;
}

function renderProposalTab(state, kind) {
  const domainState = kind === 'style_rule' ? state.domains.styleGuide : state.domains.visualTemplate;
  if (domainState === 'unavailable') {
    return `<div class="cur-panel"><div class="cur-state cur-state--error">This subsystem is unavailable right now, so its proposals cannot be shown. This is not the same as "no proposals".
      <div style="margin-top:12px"><button class="cur-btn cur-btn--ghost" type="button" data-reload>Retry</button></div></div></div>`;
  }
  const rows = kind === 'style_rule' ? state.visibleRows.styleRules : state.visibleRows.visualTemplates;
  const selected = state.selection && state.selection.kind === kind ? state.selection.id : null;

  const listPanel = `
    <div class="cur-panel">
      <p class="cur-kicker">${kind === 'style_rule' ? 'Style Guide proposals' : 'Visual Template proposals'}</p>
      ${filterBar(state, kind)}
      ${rows.length === 0
    ? `<div class="cur-state">No proposals match the current filters.</div>`
    : `<div class="cur-list">${rows.map((r) => proposalCard(r).replace('<button class="cur-card"', `<button class="cur-card"${selected === r.id ? ' aria-current="true"' : ''}`)).join('')}</div>`}
    </div>`;

  const detailPanel = renderDetailPanel(state, kind);
  return `<div class="cur-grid">${listPanel}${detailPanel}</div>`;
}

function tempBlock(t) {
  if (!t) return '';
  return `<p class="cur-sub">Temporal context</p>
    <dl class="cur-dl">
      <dt>Context</dt><dd>${esc(t.contextLabel)} <span class="cur-conf">(evidence, not authority)</span></dd>
      <dt>Status</dt><dd>${esc(t.status)}</dd>
      <dt>Dated range</dt><dd>${esc(t.oldestSourceDate || '—')} → ${esc(t.latestSourceDate || '—')}</dd>
      <dt>Recent / historical docs</dt><dd>${t.recentDocumentCount} / ${t.historicalDocumentCount}</dd>
      ${'conflictingDocumentCount' in t ? `<dt>Conflicting docs</dt><dd>${t.conflictingDocumentCount}</dd>` : ''}
      ${'transitionalDocumentCount' in t ? `<dt>Transitional / undated docs</dt><dd>${t.transitionalDocumentCount} / ${t.undatedDocumentCount}</dd>` : ''}
    </dl>`;
}

function geomBlock(g) {
  if (!g) return '';
  if (!g.known) {
    return `<dl class="cur-dl"><dt>Geometry</dt><dd><b>${esc(g.note)}</b> — coordinate space ${esc(g.coordinateSpace)}</dd></dl>`;
  }
  return `<dl class="cur-dl">
    <dt>Page</dt><dd>${g.width == null ? '—' : g.width} × ${g.height == null ? '—' : g.height} ${esc(g.unit)}</dd>
    <dt>Coordinate space</dt><dd>${esc(g.coordinateSpace)}</dd>
    <dt>Orientation</dt><dd>${esc(g.orientation)}</dd>
  </dl>`;
}

function decisionButtons(cap) {
  if (!cap) return '';
  const b = [];
  if (cap.canApprove) b.push('<button class="cur-btn" type="button" data-decision="approve">Approve</button>');
  if (cap.canSupersede) b.push('<button class="cur-btn" type="button" data-decision="supersede">Supersede / Approve</button>');
  if (cap.canReject) b.push('<button class="cur-btn cur-btn--ghost" type="button" data-decision="reject">Reject</button>');
  if (cap.canDeprecate) b.push('<button class="cur-btn cur-btn--danger" type="button" data-decision="deprecate">Deprecate</button>');
  if (!b.length) b.push('<span class="cur-note">This record is in a terminal state. Read-only.</span>');
  return `<div class="cur-actions">${b.join('')}</div>`;
}

function renderDetailPanel(state, kind) {
  if (!state.selection || state.selection.kind !== kind) {
    return `<div class="cur-panel cur-panel--muted"><div class="cur-state">Select a proposal to inspect its evidence, temporal context, provenance and predecessor.</div></div>`;
  }
  if (state.detailError) {
    return `<div class="cur-panel"><div class="cur-state cur-state--error">${esc(state.detailError)}
      <div style="margin-top:12px"><button class="cur-btn cur-btn--ghost" type="button" data-reload>Reload</button>
      <button class="cur-btn cur-btn--quiet" type="button" data-clear-selection>Back to list</button></div></div></div>`;
  }
  const d = state.detail;
  if (!d) return `<div class="cur-panel"><div class="cur-skeleton"></div><div class="cur-skeleton"></div></div>`;

  if (kind === 'style_rule') return styleDetail(d);
  return visualDetail(d);
}

function predecessorBlock(p, kind) {
  if (!p) return '';
  const label = kind === 'style_rule' ? esc(p.value) : `${esc(p.variant)}`;
  return `<p class="cur-sub">Existing authority — would be superseded</p>
    <dl class="cur-dl">
      <dt>Current version</dt><dd>${esc(p.id)} (v${p.version}, ${esc(p.status)})</dd>
      <dt>Value</dt><dd>${label}</dd>
      <dt>Approved</dt><dd>${esc(p.approvedAt || '—')} by ${esc(p.approvedBy || '—')}</dd>
      <dt>Rationale</dt><dd>${esc(p.rationale || '—')}</dd>
    </dl>
    ${kind === 'visual_template' && p.pageModel ? geomBlock(p.pageModel) : ''}`;
}

function slotConflictBlock(c) {
  if (!c) return '';
  return `<div class="cur-conflict__decide">
    This slot has a live ${esc(c.status)} conflict (${c.sides.length} competing values). The system does not choose a winner — a human decides.
    <div class="cur-ids" style="margin-top:6px">${c.competingIds.map(esc).join(' · ')}</div>
  </div>`;
}

function styleDetail(d) {
  const p = d.proposed;
  const ev = d.evidence;
  return `<div class="cur-panel">
    <p class="cur-kicker">Proposed style rule</p>
    <dl class="cur-dl">
      <dt>Category</dt><dd>${esc(p.category)}</dd>
      <dt>Key</dt><dd>${esc(p.key)}</dd>
      <dt>Value</dt><dd><b>${esc(p.value)}</b></dd>
      <dt>Document type</dt><dd>${esc(p.documentType)}</dd>
      <dt>Scope</dt><dd>${esc(p.scope)}</dd>
      <dt>Version</dt><dd>${p.version}</dd>
      <dt>Authority</dt><dd><span class="cur-authority">${esc(p.authorityLabel)}</span></dd>
    </dl>

    <p class="cur-sub">Evidence <span class="cur-conf">— confidence ${esc(ev.confidence || '—')} (not authority)</span></p>
    <dl class="cur-dl">
      <dt>Occurrences</dt><dd>${ev.occurrenceCount}</dd>
      <dt>Source documents</dt><dd>${ev.documentCount}</dd>
      <dt>Document-type mix</dt><dd>${esc(JSON.stringify(ev.documentTypeDistribution))}</dd>
      <dt>Extraction methods</dt><dd>${ev.extractionMethods.length ? ev.extractionMethods.map(esc).join(', ') : '—'}</dd>
    </dl>

    ${tempBlock(ev.temporal)}

    <p class="cur-sub">Provenance</p>
    <dl class="cur-dl">
      <dt>Writing Memory ids</dt><dd>${ids(ev.sourceMemoryIds)}</dd>
      <dt>Observation ids</dt><dd>${ids(ev.sourceObservationIds)}</dd>
      <dt>Document ids</dt><dd>${ids(ev.sourceDocumentIds)}</dd>
    </dl>

    ${predecessorBlock(d.predecessor, 'style_rule')}
    ${slotConflictBlock(d.slotConflict)}
    ${decisionButtons(d.decision)}
    <div class="cur-actions"><button class="cur-btn cur-btn--quiet" type="button" data-clear-selection>Back to list</button></div>
  </div>`;
}

function visualDetail(d) {
  const t = d.template;
  const ev = d.evidence;
  const regionRows = t.regions.map((r) => `<li>${esc(r.kind)} — ${r.geometry.known ? 'geometry known' : esc(r.geometry.note)}; recurrence ${esc(r.pageRecurrence)}; ${r.occurrenceCount} occ.</li>`).join('');
  return `<div class="cur-panel">
    <p class="cur-kicker">Proposed visual template</p>
    <dl class="cur-dl">
      <dt>Document type</dt><dd>${esc(t.documentType)}</dd>
      <dt>Variant</dt><dd>${esc(t.variant)}</dd>
      <dt>Scope</dt><dd>${esc(t.scope)}</dd>
      <dt>Version</dt><dd>${t.version}</dd>
      <dt>Authority</dt><dd><span class="cur-authority">${esc(t.authorityLabel)}</span></dd>
    </dl>

    <p class="cur-sub">Page model</p>
    ${geomBlock(t.pageModel)}

    <p class="cur-sub">Regions (${t.regions.length})</p>
    ${t.regions.length ? `<ul style="margin:0;padding-left:18px;font-size:13px">${regionRows}</ul>` : '<p class="cur-note">No regions were extracted.</p>'}

    <p class="cur-sub">Visual evidence <span class="cur-conf">— confidence ${esc(ev.confidence || '—')} (not authority)</span></p>
    <dl class="cur-dl">
      <dt>Source documents</dt><dd>${ev.documentCount}</dd>
      <dt>Observations</dt><dd>${ev.observationCount}</dd>
      <dt>Pages</dt><dd>${ev.pageCount}</dd>
      <dt>Coordinate spaces</dt><dd>${ev.coordinateSpaces.length ? ev.coordinateSpaces.map(esc).join(', ') : '—'}</dd>
      <dt>Geometry known</dt><dd>${ev.geometryKnown ? 'yes' : 'no'}</dd>
      <dt>Observation ids</dt><dd>${ids(ev.sourceObservationIds)}</dd>
      <dt>Document ids</dt><dd>${ids(ev.sourceDocumentIds)}</dd>
    </dl>

    ${tempBlock(ev.temporal)}
    ${predecessorBlock(d.predecessor, 'visual_template')}
    ${slotConflictBlock(d.slotConflict)}
    ${decisionButtons(d.decision)}
    <div class="cur-actions"><button class="cur-btn cur-btn--quiet" type="button" data-clear-selection>Back to list</button></div>
  </div>`;
}

/* ── conflicts tab ──────────────────────────────────────────────────── */
function renderConflicts(state) {
  const all = state.conflicts.styleGuide.concat(state.conflicts.visualTemplate);
  if (state.domains.styleGuide === 'unavailable' && state.domains.visualTemplate === 'unavailable') {
    return `<div class="cur-panel"><div class="cur-state cur-state--error">Both subsystems are unavailable — conflicts cannot be shown.</div></div>`;
  }
  if (!all.length) {
    return `<div class="cur-panel"><div class="cur-state">No unresolved conflicts.</div></div>`;
  }
  return `<div class="cur-panel">
    <p class="cur-kicker">Conflicts — the system never chooses a winner</p>
    ${all.map(conflictCard).join('')}
  </div>`;
}

function conflictSide(s, kind) {
  const val = kind === 'style_rule' ? esc(s.value) : `${esc(s.variant)}`;
  const ev = s.evidence || {};
  const docs = kind === 'style_rule' ? (ev.documentCount || 0) : (ev.documentCount || 0);
  const t = ev.temporal || {};
  return `<div class="cur-conflict__side">
    <div class="cur-card__top"><span class="cur-chip cur-chip--${esc(s.status)}">${esc(s.status)}</span>
      <span class="cur-authority">${esc(s.authorityLabel)}</span></div>
    <div class="cur-card__summary" style="margin-top:6px">${val}</div>
    <div class="cur-card__meta" style="margin-top:6px">
      <span>${docs} documents</span>
      <span>${esc(t.contextLabel || 'Temporal context unknown')}</span>
      <span>v${s.version}</span>
    </div>
    ${kind === 'visual_template' && s.pageModel && !s.pageModel.known ? '<div class="cur-note">Geometry unavailable</div>' : ''}
    <div class="cur-ids" style="margin-top:6px">${esc(s.id)}</div>
  </div>`;
}

function conflictCard(c) {
  const kind = c.kind;
  const title = kind === 'style_rule'
    ? `${esc(c.slot.category)} · ${esc(c.slot.key)} · ${esc(c.slot.documentType)}`
    : `${esc(c.slot.documentType)} layout`;
  const [a, b] = c.sides;
  return `<div style="margin:12px 0 18px">
    <p class="cur-sub">${title} — ${esc(c.status)} conflict</p>
    <div class="cur-conflict">
      ${conflictSide(a, kind)}
      <div class="cur-conflict__vs">VS</div>
      ${conflictSide(b, kind)}
    </div>
    <div class="cur-conflict__decide">
      No recommended winner. Resolve this by explicitly superseding one side, or by deliberately keeping both — from the ${kind === 'style_rule' ? 'Style Rules' : 'Visual Templates'} tab.
    </div>
  </div>`;
}

/* ── history tab ────────────────────────────────────────────────────── */
function renderHistory(state) {
  const d = state.detail;
  if (!d) {
    return `<div class="cur-panel"><div class="cur-state">Select a proposal from the Style Rules or Visual Templates tab to see its full audit history and supersession lineage.</div></div>`;
  }
  const events = d.history || [];
  const chain = d.supersessionChain || [];
  return `<div class="cur-panel">
    <p class="cur-kicker">Audit history — ${esc(d.id)}</p>
    ${chain.length > 1 ? `<p class="cur-note">Supersession lineage: ${chain.map((c) => `${esc(c.id)} (v${c.version}, ${esc(c.status)})`).join(' → ')}</p>` : ''}
    <dl class="cur-dl" style="margin-top:10px">
      ${events.map((e) => `<dt>${esc(e.at || '—')}</dt><dd><b>${esc(e.event)}</b>${e.actorId ? ` by ${esc(e.actorId)}` : ''}${
    e.fromStatus ? ` — ${esc(e.fromStatus)} → ${esc(e.toStatus)}` : ''}${e.rationale ? `<br><span class="cur-note">${esc(e.rationale)}</span>` : ''}</dd>`).join('')}
    </dl>
  </div>`;
}

/* ── decision dialog (built once per signature; textarea never re-rendered) ── */
function dialogSignature(dec) {
  if (!dec) return null;
  return `${dec.kind}@${dec.target ? dec.target.id : ''}@${dec.target ? dec.target.expectedVersion : ''}`;
}

function buildDialog(state) {
  const dec = state.decision;
  const t = dec.target || {};
  const isApprove = dec.kind === 'approve' || dec.kind === 'supersede';
  _els.dialog.innerHTML = `
    <div class="cur-dialog-backdrop" data-dialog-backdrop>
      <div class="cur-dialog" role="dialog" aria-modal="true" aria-labelledby="curDialogTitle">
        <h3 id="curDialogTitle">${esc(DECISION_LABEL[dec.kind] || 'Confirm')}</h3>
        <p class="cur-note">${esc(DECISION_VERB[dec.kind] || 'Acting on')} this proposal is consequential and is recorded against your account.</p>
        <div class="cur-dialog__what">
          <p class="cur-kicker" style="margin-bottom:6px">What becomes ${isApprove ? 'authoritative' : 'recorded'}</p>
          <dl class="cur-dl"><dt>Proposal</dt><dd>${esc(t.id)}</dd><dt>Summary</dt><dd>${esc(t.summary)}</dd>
          <dt>Expected version</dt><dd>${t.expectedVersion == null ? '—' : t.expectedVersion}</dd></dl>
        </div>
        <label for="curRationale">${isApprove ? 'Human rationale (required)' : 'Reason (required)'}</label>
        <textarea id="curRationale" data-rationale placeholder="${isApprove
    ? 'Why should this become an official PBSI convention?'
    : 'Why is this the right decision?'}"></textarea>
        <div data-ack-slot></div>
        <p class="cur-dialog__err" data-dialog-err hidden></p>
        <div class="cur-dialog__stale" data-dialog-stale hidden></div>
        <div class="cur-dialog__actions">
          <button class="cur-btn cur-btn--quiet" type="button" data-dialog-cancel>Cancel</button>
          <button class="cur-btn cur-btn--ghost" type="button" data-dialog-reload hidden>Reload</button>
          <button class="cur-btn${dec.kind === 'reject' || dec.kind === 'deprecate' ? ' cur-btn--danger' : ''}" type="button" data-dialog-confirm>${esc(DECISION_LABEL[dec.kind] || 'Confirm')}</button>
        </div>
      </div>
    </div>`;

  const ta = _els.dialog.querySelector('[data-rationale]');
  ta.value = dec.rationale || '';
  ta.addEventListener('input', (e) => { if (_controller) _controller.setRationale(e.target.value); });
  _els.dialog.querySelector('[data-dialog-cancel]').addEventListener('click', () => _controller && _controller.cancelDecision());
  _els.dialog.querySelector('[data-dialog-backdrop]').addEventListener('click', (e) => {
    if (e.target === e.currentTarget && _controller) _controller.cancelDecision();
  });
  _els.dialog.querySelector('[data-dialog-confirm]').addEventListener('click', () => _controller && _controller.confirmDecision());
  _els.dialog.querySelector('[data-dialog-reload]').addEventListener('click', () => _controller && _controller.reload());
  setTimeout(() => { try { ta.focus(); } catch { /* ignore */ } }, 0);
  _dialogSig = dialogSignature(dec);
}

function patchDialog(state) {
  const dec = state.decision;
  const wrap = _els.dialog.querySelector('.cur-dialog');
  if (!wrap) return;

  // acknowledge-conflict control appears only when the server blocked on a conflict
  const ackSlot = wrap.querySelector('[data-ack-slot]');
  if (dec.conflictBlocked && !ackSlot.querySelector('input')) {
    ackSlot.innerHTML = `<label class="cur-dialog__ack"><input type="checkbox" data-ack />
      <span>Approving this creates a competing authoritative rule for the same slot. Tick to deliberately keep BOTH — the resolver will then report a conflict until a human supersedes one.</span></label>`;
    const cb = ackSlot.querySelector('[data-ack]');
    cb.checked = dec.acknowledgeConflict === true;
    cb.addEventListener('change', (e) => _controller && _controller.setAcknowledgeConflict(e.target.checked));
  } else if (!dec.conflictBlocked && ackSlot.firstChild) {
    ackSlot.innerHTML = '';
  }

  const err = wrap.querySelector('[data-dialog-err]');
  if (dec.error) { err.hidden = false; err.textContent = dec.error; } else { err.hidden = true; err.textContent = ''; }

  const stale = wrap.querySelector('[data-dialog-stale]');
  const reloadBtn = wrap.querySelector('[data-dialog-reload]');
  if (dec.staleError) { stale.hidden = false; stale.textContent = dec.staleError; reloadBtn.hidden = false; }
  else { stale.hidden = true; stale.textContent = ''; reloadBtn.hidden = true; }

  const confirm = wrap.querySelector('[data-dialog-confirm]');
  confirm.disabled = dec.busy === true || dec.staleError != null;
  confirm.textContent = dec.busy ? 'Working…' : (DECISION_LABEL[dec.kind] || 'Confirm');
}

function renderDialog(state) {
  if (!state.decision) { if (_dialogSig !== null) { _els.dialog.innerHTML = ''; _dialogSig = null; } return; }
  if (_dialogSig !== dialogSignature(state.decision)) buildDialog(state);
  patchDialog(state);
}

/* ── paint ──────────────────────────────────────────────────────────── */
function paint(state) {
  if (!_els) return;
  renderTabs(state);
  renderToast(state);
  renderContent(state);
  renderDialog(state);
}

/**
 * Mount the Human Curation workspace into a platform-owned host.
 * @param {HTMLElement} hostEl
 * @param {{ controller?: object }} [opts]  inject a controller for tests
 */
export async function mountIntelligenceCurationConsole(hostEl, opts = {}) {
  if (!hostEl) return;
  _host = hostEl;
  _dialogSig = null;
  injectStyleOnce();
  buildShell(hostEl);

  if (opts && opts.controller) {
    _controller = opts.controller;
  } else {
    const user = getCurrentUser && getCurrentUser();
    _controller = await createWiredIntelligenceCurationController({
      actor: { userId: (user && user.username) || null, role: (user && user.role) || null },
    });
  }
  if (typeof _controller.setOnChange === 'function') _controller.setOnChange(paint);
  _mounted = true;

  paint(_controller.getState());
  // ONE read on mount — no mutation, ever.
  if (typeof _controller.load === 'function') {
    try { await _controller.load(); } catch { /* the view already shows a load error */ }
  }
}

export function unmountIntelligenceCurationConsole() {
  if (_controller && typeof _controller.destroy === 'function') {
    try { _controller.destroy(); } catch { /* ignore */ }
  }
  if (_host) _host.innerHTML = '';
  _mounted = false;
  _host = null;
  _controller = null;
  _els = null;
  _dialogSig = null;
}

export function isIntelligenceCurationConsoleMounted() { return _mounted; }
