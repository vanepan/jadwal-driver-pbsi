/* ============================================================
   OVERRIDE-REVIEW-CARD.JS — Admin Override Workflow
   (v1.16.4.11-beta.1)

   The presentational layer for one admin decision record: what the engine
   recommended, what the admin actually selected, the classified outcome
   (ACCEPTED / DRIVER_OVERRIDE / VEHICLE_OVERRIDE / FULL_OVERRIDE), the reason,
   and the timestamp. Renders from the record createOverrideRecord() produces.

   DESIGN: matches the Sarpras Operations design language — built entirely on the
   platform CSS custom properties (var(--surface), --border, --text, --muted, and
   the --ok/--warn/--danger/--info status pairs), so it adapts to dark mode
   automatically (no hard-coded #fff — see the dark-mode --white trap) and
   inherits the app's spacing/typography. Styles are injected ONCE under scoped
   `.dci-ovr-*` class names, so dropping this component anywhere causes no global
   or visual regression.

   RESPONSIVE: fluid to its container (min-width:0); the recommended/selected
   rows and meta wrap cleanly on narrow mobile. No fixed widths.

   SAFE: all values are written with textContent (never innerHTML), so a name or
   admin-entered reason can never inject markup. The only DOM dependency is
   `document`; the pure service / store have none.

   NOT MOUNTED into any production view yet.
   ============================================================ */

'use strict';

import { OVERRIDE_OUTCOME } from '../services/override-workflow-service.js';

const STYLE_ID = 'dci-ovr-card-styles';

/** Indonesian outcome labels + the design-token tone each maps to. */
const OUTCOME_META = {
  [OVERRIDE_OUTCOME.ACCEPTED]: { label: 'Diterima', tone: 'ok' },
  [OVERRIDE_OUTCOME.DRIVER_OVERRIDE]: { label: 'Ganti Driver', tone: 'warn' },
  [OVERRIDE_OUTCOME.VEHICLE_OVERRIDE]: { label: 'Ganti Kendaraan', tone: 'warn' },
  [OVERRIDE_OUTCOME.FULL_OVERRIDE]: { label: 'Ganti Keduanya', tone: 'danger' },
};

const CSS = `
.dci-ovr{
  display:flex;flex-direction:column;gap:.8rem;min-width:0;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:1rem 1.1rem;box-shadow:var(--shadow-sm);
  font-family:var(--font-sans, inherit);color:var(--text);
}
.dci-ovr__head{display:flex;align-items:center;justify-content:space-between;gap:.6rem;}
.dci-ovr__title{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.dci-ovr__outcome{
  flex:0 0 auto;font-size:.72rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;
  padding:.2rem .6rem;border-radius:999px;border:1px solid transparent;
}
.dci-ovr[data-tone="ok"]     .dci-ovr__outcome{color:var(--ok);    background:var(--ok-bg);    border-color:var(--ok);}
.dci-ovr[data-tone="warn"]   .dci-ovr__outcome{color:var(--warn);  background:var(--warn-bg);  border-color:var(--warn);}
.dci-ovr[data-tone="danger"] .dci-ovr__outcome{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

.dci-ovr__pairs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;
  border-top:1px solid var(--border);padding-top:.75rem;}
.dci-ovr__col{display:flex;flex-direction:column;gap:.4rem;min-width:0;}
.dci-ovr__col-h{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
.dci-ovr__line{display:flex;flex-direction:column;gap:.1rem;min-width:0;}
.dci-ovr__k{font-size:.68rem;color:var(--muted);}
.dci-ovr__v{font-size:.92rem;font-weight:600;color:var(--text);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dci-ovr__v[data-changed="true"]{color:var(--warn);}
.dci-ovr__score{display:inline-flex;align-items:baseline;gap:.3rem;}
.dci-ovr__score b{font-size:1.05rem;}

.dci-ovr__reason{font-size:.86rem;color:var(--text);background:var(--surface-2);
  border:1px solid var(--border);border-radius:10px;padding:.5rem .65rem;
  white-space:pre-wrap;word-break:break-word;}
.dci-ovr__reason[data-empty="true"]{color:var(--muted);font-style:italic;}
.dci-ovr__meta{display:flex;flex-wrap:wrap;gap:.4rem .9rem;font-size:.74rem;color:var(--muted);}
.dci-ovr__meta b{color:var(--text);font-weight:600;}
@media (max-width:380px){ .dci-ovr__pairs{grid-template-columns:1fr;} }
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

/** A labelled value line; `changed` highlights an overridden selection. */
function line(label, value, changed) {
  const wrap = el('div', 'dci-ovr__line');
  wrap.append(el('span', 'dci-ovr__k', label));
  const v = el('span', 'dci-ovr__v', value || '—');
  if (changed) v.setAttribute('data-changed', 'true');
  wrap.append(v);
  return wrap;
}

/** Format an ISO timestamp for display (locale id-ID; raw string on failure). */
function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toISOString();
  }
}

/**
 * Build an override review card from an override record.
 *
 * @param {Object} record  output of createOverrideRecord()
 * @param {Object} [opts]
 * @param {(driverId:string)=>string} [opts.driverNameOf]
 * @param {(vehicleId:string)=>string} [opts.vehicleNameOf]
 * @returns {HTMLElement}
 */
export function renderOverrideReviewCard(record = {}, opts = {}) {
  ensureStyles();
  const driverName = (id) => (typeof opts.driverNameOf === 'function' && opts.driverNameOf(id)) || id || '—';
  const vehicleName = (id) => (typeof opts.vehicleNameOf === 'function' && opts.vehicleNameOf(id)) || id || '—';

  const outcome = OUTCOME_META[record.outcome] ? record.outcome : OVERRIDE_OUTCOME.ACCEPTED;
  const meta = OUTCOME_META[outcome];
  const driverChanged = String(record.recommendedDriverId || '') !== String(record.selectedDriverId || '');
  const vehicleChanged = String(record.recommendedVehicleId || '') !== String(record.selectedVehicleId || '');

  const card = el('article', 'dci-ovr');
  card.setAttribute('data-tone', meta.tone);
  card.setAttribute('data-outcome', outcome);

  const head = el('header', 'dci-ovr__head');
  head.append(el('span', 'dci-ovr__title', 'Tinjauan Keputusan'), el('span', 'dci-ovr__outcome', meta.label));
  card.append(head);

  const pairs = el('div', 'dci-ovr__pairs');
  const recCol = el('div', 'dci-ovr__col');
  recCol.append(
    el('span', 'dci-ovr__col-h', 'Rekomendasi'),
    line('Driver', driverName(record.recommendedDriverId)),
    line('Kendaraan', vehicleName(record.recommendedVehicleId)),
  );
  const selCol = el('div', 'dci-ovr__col');
  selCol.append(el('span', 'dci-ovr__col-h', 'Dipilih'));
  selCol.append(line('Driver', driverName(record.selectedDriverId), driverChanged));
  selCol.append(line('Kendaraan', vehicleName(record.selectedVehicleId), vehicleChanged));
  const scoreLine = el('div', 'dci-ovr__line');
  scoreLine.append(el('span', 'dci-ovr__k', 'Skor Dispatch'));
  const scoreVal = el('span', 'dci-ovr__v');
  const scoreInner = el('span', 'dci-ovr__score');
  scoreInner.append(el('b', null, Number(record.dispatchScore) || 0));
  scoreVal.append(scoreInner);
  scoreLine.append(scoreVal);
  selCol.append(scoreLine);
  pairs.append(recCol, selCol);
  card.append(pairs);

  const reason = el('div', 'dci-ovr__reason', record.reason || 'Tanpa alasan');
  if (!record.reason) reason.setAttribute('data-empty', 'true');
  card.append(reason);

  const metaRow = el('div', 'dci-ovr__meta');
  const by = el('span'); by.append(document.createTextNode('Oleh '), el('b', null, record.approvedBy || '—'));
  const at = el('span'); at.append(document.createTextNode('Waktu '), el('b', null, formatTimestamp(record.timestamp)));
  metaRow.append(by, at);
  card.append(metaRow);

  return card;
}

/**
 * Render a card into `container` (clearing it first). Returns the card element.
 * @param {HTMLElement|string} container  element or element id
 * @param {Object} record  createOverrideRecord() output
 * @param {Object} [opts]
 */
export function mountOverrideReviewCard(container, record, opts) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return null;
  const card = renderOverrideReviewCard(record, opts);
  host.replaceChildren(card);
  return card;
}
