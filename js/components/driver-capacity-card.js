/* ============================================================
   DRIVER-CAPACITY-CARD.JS — Dispatch Intelligence Foundation
   (v1.16.4.11-alpha.1)

   The presentational layer for one driver's capacity: name, a utilization
   bar + %, a four-band status pill, the 7-day / 30-day assignment counts,
   and remaining available slots. Renders from the DriverCapacity object the
   engine / snapshot service produces.

   DESIGN: matches the Sarpras Operations design language — built entirely on
   the platform CSS custom properties (var(--surface), --border, --text,
   --muted, and the --ok/--warn/--danger/--info status pairs), so it adapts to
   dark mode automatically (no hard-coded #fff — see the dark-mode --white
   trap) and inherits the app's spacing/typography. Styles are injected ONCE
   under scoped `.dci-cap-*` class names, so dropping this component anywhere
   causes no global or visual regression.

   RESPONSIVE: fluid to its container width (min-width:0). The metric strip is
   a 3-column grid on comfortable widths and collapses cleanly on narrow
   mobile via a single container-driven breakpoint. No fixed widths.

   SAFE: values are written with textContent (never innerHTML), so a driver
   name can never inject markup. The only DOM dependency is `document`; the
   pure engine/service/store have none.
   ============================================================ */

'use strict';

import { CAPACITY_STATUS } from '../services/driver-capacity-engine.js';

const STYLE_ID = 'dci-cap-card-styles';

/** Indonesian status labels (the UI language) keyed by the engine status code. */
const STATUS_LABEL = {
  [CAPACITY_STATUS.LOW]: 'Rendah',
  [CAPACITY_STATUS.NORMAL]: 'Normal',
  [CAPACITY_STATUS.HIGH]: 'Tinggi',
  [CAPACITY_STATUS.OVERLOADED]: 'Berlebih',
};

const CSS = `
.dci-cap-card{
  display:flex;flex-direction:column;gap:.75rem;min-width:0;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:1rem 1.1rem;box-shadow:var(--shadow-sm);
  font-family:var(--font-sans, inherit);color:var(--text);
}
.dci-cap-card__head{display:flex;align-items:center;gap:.5rem;justify-content:space-between;}
.dci-cap-card__name{
  font-weight:600;font-size:.98rem;line-height:1.2;color:var(--text);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.dci-cap-card__status{
  flex:0 0 auto;font-size:.72rem;font-weight:700;letter-spacing:.02em;
  padding:.2rem .55rem;border-radius:999px;border:1px solid transparent;text-transform:uppercase;
}
.dci-cap-card[data-status="LOW"]        .dci-cap-card__status{color:var(--info);  background:var(--info-bg);  border-color:var(--info);}
.dci-cap-card[data-status="NORMAL"]     .dci-cap-card__status{color:var(--ok);    background:var(--ok-bg);    border-color:var(--ok);}
.dci-cap-card[data-status="HIGH"]       .dci-cap-card__status{color:var(--warn);  background:var(--warn-bg);  border-color:var(--warn);}
.dci-cap-card[data-status="OVERLOADED"] .dci-cap-card__status{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

.dci-cap-card__util{display:flex;flex-direction:column;gap:.35rem;}
.dci-cap-card__util-row{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;}
.dci-cap-card__util-pct{font-size:1.5rem;font-weight:700;line-height:1;color:var(--text);}
.dci-cap-card__util-label{font-size:.74rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
.dci-cap-card__bar{height:8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;}
.dci-cap-card__bar-fill{height:100%;border-radius:999px;transition:width .35s var(--motion-ease, ease);}
.dci-cap-card[data-status="LOW"]        .dci-cap-card__bar-fill{background:var(--info);}
.dci-cap-card[data-status="NORMAL"]     .dci-cap-card__bar-fill{background:var(--ok);}
.dci-cap-card[data-status="HIGH"]       .dci-cap-card__bar-fill{background:var(--warn);}
.dci-cap-card[data-status="OVERLOADED"] .dci-cap-card__bar-fill{background:var(--danger);}

.dci-cap-card__metrics{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin:0;
  border-top:1px solid var(--border);padding-top:.75rem;
}
.dci-cap-card__metric{display:flex;flex-direction:column;gap:.15rem;min-width:0;text-align:center;}
.dci-cap-card__metric dt{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.02em;order:2;}
.dci-cap-card__metric dd{margin:0;font-size:1.05rem;font-weight:700;color:var(--text);order:1;}
@media (max-width:360px){
  .dci-cap-card__metrics{grid-template-columns:1fr;gap:.4rem;}
  .dci-cap-card__metric{flex-direction:row;justify-content:space-between;text-align:left;}
  .dci-cap-card__metric dt{order:1;}.dci-cap-card__metric dd{order:2;font-size:.95rem;}
}
`;

/** Inject the scoped stylesheet once. No-op outside a DOM environment. */
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
 * Build a driver capacity card element from a DriverCapacity object.
 *
 * @param {Object} capacity  output of calculateDriverCapacity (+ optional driverName)
 * @param {Object} [opts]
 * @param {string} [opts.driverName]  display name (falls back to capacity.driverName/driverId)
 * @returns {HTMLElement}
 */
export function renderDriverCapacityCard(capacity = {}, opts = {}) {
  ensureStyles();

  const status = STATUS_LABEL[capacity.status] ? capacity.status : CAPACITY_STATUS.LOW;
  const util = Math.max(0, Math.min(100, Number(capacity.utilizationPercent) || 0));
  const name = opts.driverName || capacity.driverName || capacity.driverId || 'Driver';

  const card = el('article', 'dci-cap-card');
  card.setAttribute('data-status', status);
  card.setAttribute('data-driver-id', capacity.driverId || '');

  const head = el('header', 'dci-cap-card__head');
  head.append(
    el('span', 'dci-cap-card__name', name),
    el('span', 'dci-cap-card__status', STATUS_LABEL[status]),
  );

  const utilWrap = el('div', 'dci-cap-card__util');
  const utilRow = el('div', 'dci-cap-card__util-row');
  utilRow.append(
    el('span', 'dci-cap-card__util-pct', `${util}%`),
    el('span', 'dci-cap-card__util-label', 'Utilisasi'),
  );
  const bar = el('div', 'dci-cap-card__bar');
  const fill = el('div', 'dci-cap-card__bar-fill');
  fill.style.width = `${util}%`;
  bar.appendChild(fill);
  utilWrap.append(utilRow, bar);

  const metrics = el('dl', 'dci-cap-card__metrics');
  const addMetric = (label, value) => {
    const m = el('div', 'dci-cap-card__metric');
    m.append(el('dd', null, value), el('dt', null, label));
    metrics.appendChild(m);
  };
  addMetric('7 Hari', Number(capacity.assignmentsLast7Days) || 0);
  addMetric('30 Hari', Number(capacity.assignmentsLast30Days) || 0);
  addMetric('Slot', Number(capacity.availableSlots) || 0);

  card.append(head, utilWrap, metrics);
  return card;
}

/**
 * Render a card into `container` (clearing it first). Returns the card element.
 * @param {HTMLElement|string} container  element or element id
 * @param {Object} capacity
 * @param {Object} [opts]
 */
export function mountDriverCapacityCard(container, capacity, opts) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return null;
  const card = renderDriverCapacityCard(capacity, opts);
  host.replaceChildren(card);
  return card;
}
