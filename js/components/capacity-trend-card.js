/* ============================================================
   CAPACITY-TREND-CARD.JS — Dispatch Intelligence Hardening
   (v1.16.4.11-alpha.1.1)

   The presentational layer for one driver's capacity TREND: name, current vs
   previous utilization, the delta, and a direction pill (UP / DOWN / STABLE).
   Renders from a DriverTrend object (capacity-trend-engine.buildDriverTrends).

   DESIGN: matches the Sarpras Operations design language and the sibling
   driver-capacity-card — built entirely on platform CSS custom properties so
   it is dark-mode safe (no hard-coded #fff — avoids the --white trap), with
   styles injected ONCE under scoped `.dci-trend-*` classes (no global or
   visual regression). Direction colour follows OPERATIONAL meaning: rising
   load = warn (UP), easing load = ok (DOWN), flat = muted (STABLE).

   RESPONSIVE: fluid to its container (min-width:0); the prev→current figures
   sit in a 2-up row that collapses to stacked on very narrow mobile.

   SAFE: values written with textContent (never innerHTML).
   ============================================================ */

'use strict';

import { TREND } from '../services/capacity-trend-engine.js';

const STYLE_ID = 'dci-trend-card-styles';

/** Direction glyph + Indonesian label per trend code. */
const TREND_META = {
  [TREND.UP]: { glyph: '▲', label: 'Naik' },
  [TREND.DOWN]: { glyph: '▼', label: 'Turun' },
  [TREND.STABLE]: { glyph: '▬', label: 'Stabil' },
};

const CSS = `
.dci-trend-card{
  display:flex;flex-direction:column;gap:.7rem;min-width:0;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:1rem 1.1rem;box-shadow:var(--shadow-sm);
  font-family:var(--font-sans, inherit);color:var(--text);
}
.dci-trend-card__head{display:flex;align-items:center;gap:.5rem;justify-content:space-between;}
.dci-trend-card__name{
  font-weight:600;font-size:.98rem;line-height:1.2;color:var(--text);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.dci-trend-card__pill{
  flex:0 0 auto;display:inline-flex;align-items:center;gap:.3rem;
  font-size:.72rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;
  padding:.2rem .55rem;border-radius:999px;border:1px solid transparent;
}
.dci-trend-card[data-trend="UP"]     .dci-trend-card__pill{color:var(--warn);  background:var(--warn-bg);  border-color:var(--warn);}
.dci-trend-card[data-trend="DOWN"]   .dci-trend-card__pill{color:var(--ok);    background:var(--ok-bg);    border-color:var(--ok);}
.dci-trend-card[data-trend="STABLE"] .dci-trend-card__pill{color:var(--muted); background:var(--surface-2); border-color:var(--border);}

.dci-trend-card__figs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.5rem;}
.dci-trend-card__fig{display:flex;flex-direction:column;gap:.15rem;min-width:0;text-align:center;}
.dci-trend-card__fig dt{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.02em;order:2;margin:0;}
.dci-trend-card__fig dd{margin:0;font-size:1.35rem;font-weight:700;line-height:1;color:var(--text);order:1;}
.dci-trend-card__fig--current dd{color:var(--accent);}
.dci-trend-card__arrow{font-size:1rem;color:var(--muted);}
.dci-trend-card[data-trend="UP"]     .dci-trend-card__arrow{color:var(--warn);}
.dci-trend-card[data-trend="DOWN"]   .dci-trend-card__arrow{color:var(--ok);}

.dci-trend-card__delta{
  align-self:flex-start;font-size:.8rem;font-weight:600;color:var(--muted);
  border-top:1px solid var(--border);padding-top:.6rem;width:100%;
}
.dci-trend-card__delta b{font-weight:700;}
.dci-trend-card[data-trend="UP"]     .dci-trend-card__delta b{color:var(--warn);}
.dci-trend-card[data-trend="DOWN"]   .dci-trend-card__delta b{color:var(--ok);}
@media (max-width:340px){
  .dci-trend-card__figs{grid-template-columns:1fr;gap:.4rem;}
  .dci-trend-card__arrow{transform:rotate(90deg);}
}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

/**
 * Build a capacity trend card element from a DriverTrend object.
 * @param {Object} trend  output of buildDriverTrends (per driver)
 * @param {Object} [opts]
 * @param {string} [opts.driverName]  display name override
 * @returns {HTMLElement}
 */
export function renderCapacityTrendCard(trend = {}, opts = {}) {
  ensureStyles();

  const dir = TREND_META[trend.trend] ? trend.trend : TREND.STABLE;
  const meta = TREND_META[dir];
  const prev = Math.max(0, Math.min(100, Number(trend.previousUtilization) || 0));
  const curr = Math.max(0, Math.min(100, Number(trend.currentUtilization) || 0));
  const delta = Number(trend.delta);
  const deltaShown = Number.isFinite(delta) ? delta : (curr - prev);
  const name = opts.driverName || trend.driverName || trend.driverId || 'Driver';

  const card = el('article', 'dci-trend-card');
  card.setAttribute('data-trend', dir);
  card.setAttribute('data-driver-id', trend.driverId || '');

  const head = el('header', 'dci-trend-card__head');
  const pill = el('span', 'dci-trend-card__pill');
  pill.append(el('span', null, meta.glyph), el('span', null, meta.label));
  head.append(el('span', 'dci-trend-card__name', name), pill);

  const figs = el('div', 'dci-trend-card__figs');
  const prevFig = el('dl', 'dci-trend-card__fig dci-trend-card__fig--prev');
  prevFig.append(el('dd', null, `${prev}%`), el('dt', null, 'Sebelumnya'));
  const arrow = el('span', 'dci-trend-card__arrow', meta.glyph);
  const currFig = el('dl', 'dci-trend-card__fig dci-trend-card__fig--current');
  currFig.append(el('dd', null, `${curr}%`), el('dt', null, 'Saat Ini'));
  figs.append(prevFig, arrow, currFig);

  const deltaRow = el('div', 'dci-trend-card__delta');
  const sign = deltaShown > 0 ? '+' : '';
  deltaRow.append(
    document.createTextNode('Δ Utilisasi '),
    el('b', null, `${sign}${deltaShown}`),
    document.createTextNode(' poin'),
  );

  card.append(head, figs, deltaRow);
  return card;
}

/**
 * Render trend cards for a list of DriverTrend objects into `container`.
 * @param {HTMLElement|string} container
 * @param {Object[]} trends
 * @returns {HTMLElement[]} the card elements
 */
export function mountCapacityTrendCards(container, trends) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return [];
  const cards = (Array.isArray(trends) ? trends : []).map((t) => renderCapacityTrendCard(t));
  host.replaceChildren(...cards);
  return cards;
}
