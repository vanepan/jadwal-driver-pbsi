/* ============================================================
   REQUEST-INTELLIGENCE-PANEL.JS — Request Auto-Fill Intelligence
   (v1.16.4.11-beta.2)

   The read-only Dispatch Intelligence panel mounted alongside the request form.
   As the admin fills a request it shows, live: the recommended driver + vehicle,
   the dispatch score, alternatives, and an informational acceptance-risk read
   from the override analytics. THREE STATES:
     • NOT_READY        — request incomplete → the missing fields are listed
     • READY            — a valid dispatch recommendation is shown
     • NO_RECOMMENDATION — request complete but no valid dispatch was found

   STRICTLY READ-ONLY. It mirrors the existing advisory conflict-preview pattern:
   it watches the same form fields, recomputes on change, and renders — it never
   writes to the request, never creates an assignment, and never approves
   anything. Human approval stays mandatory.

   This file has two halves:
     • pure-ish RENDER (renderRequestIntelligencePanel / mount…) — DOM only,
       reuses renderDispatchRecommendationCard for the READY block (no UI dup).
     • impure WIRING (initRequestIntelligencePanel) — reads the live form +
       stores, calls the pure request-intelligence-service, caches the package,
       and re-mounts. All scoring/readiness logic lives in the service; this just
       moves data between the form and the service.

   DESIGN: platform CSS custom properties only (dark-mode safe, no hard-coded
   #fff), scoped `.dci-rip-*`, values via textContent. Styles injected once.
   ============================================================ */

'use strict';

import { getCombinedTimeFromPair } from '../utils.js';
import { getActiveDrivers } from '../drivers-store.js';
import { getActiveVehicles } from '../vehicles-store.js';
import { getAssignments } from '../assignments.js';
import {
  buildRecommendationPackage,
  PANEL_STATE,
  ACCEPTANCE_RISK,
} from '../services/request-intelligence-service.js';
import {
  saveRequestRecommendation,
  getOverrideLogs,
} from '../stores/dispatch-intelligence-store.js';
import { renderDispatchRecommendationCard } from './dispatch-recommendation-card.js';

const STYLE_ID = 'dci-rip-panel-styles';

/** Indonesian labels for the required request fields (the UI language). */
const FIELD_LABEL = {
  date: 'Tanggal',
  startTime: 'Jam mulai',
  endTime: 'Jam selesai',
  passengers: 'Jumlah penumpang',
};

/** Acceptance-risk → { label, tone } (informational only). */
const RISK_META = {
  [ACCEPTANCE_RISK.LOW]: { label: 'Rendah', tone: 'ok' },
  [ACCEPTANCE_RISK.MEDIUM]: { label: 'Sedang', tone: 'warn' },
  [ACCEPTANCE_RISK.HIGH]: { label: 'Tinggi', tone: 'danger' },
  [ACCEPTANCE_RISK.UNKNOWN]: { label: 'Belum ada data', tone: 'muted' },
};

const CSS = `
.dci-rip{
  display:flex;flex-direction:column;gap:.7rem;min-width:0;
  background:var(--surface-2);border:1px solid var(--border);border-radius:12px;
  padding:.85rem .95rem;margin:.25rem 0 .5rem;
  font-family:var(--font-sans, inherit);color:var(--text);
}
.dci-rip__head{display:flex;align-items:center;justify-content:space-between;gap:.6rem;}
.dci-rip__title{display:flex;align-items:center;gap:.4rem;font-size:.78rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.03em;color:var(--muted);}
.dci-rip__badge{flex:0 0 auto;font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;
  padding:.18rem .5rem;border-radius:999px;border:1px solid transparent;}
.dci-rip[data-state="READY"]             .dci-rip__badge{color:var(--ok);    background:var(--ok-bg);    border-color:var(--ok);}
.dci-rip[data-state="NOT_READY"]         .dci-rip__badge{color:var(--muted); background:var(--surface); border-color:var(--border);}
.dci-rip[data-state="NO_RECOMMENDATION"] .dci-rip__badge{color:var(--warn);  background:var(--warn-bg);  border-color:var(--warn);}

.dci-rip__missing{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.2rem;}
.dci-rip__missing li{font-size:.85rem;color:var(--text);}
.dci-rip__hint{font-size:.84rem;color:var(--muted);}

.dci-rip__risk{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;font-size:.78rem;color:var(--muted);}
.dci-rip__risk-chip{font-size:.72rem;font-weight:700;padding:.18rem .55rem;border-radius:999px;border:1px solid transparent;}
.dci-rip__risk-chip[data-tone="ok"]{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.dci-rip__risk-chip[data-tone="warn"]{color:var(--warn);background:var(--warn-bg);border-color:var(--warn);}
.dci-rip__risk-chip[data-tone="danger"]{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}
.dci-rip__risk-chip[data-tone="muted"]{color:var(--muted);background:var(--surface);border-color:var(--border);}

.dci-rip__foot{font-size:.72rem;color:var(--muted);font-style:italic;
  border-top:1px solid var(--border);padding-top:.5rem;}
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

/** The informational acceptance-risk row for the recommended driver. */
function riskRow(acceptanceRisk) {
  if (!acceptanceRisk) return null;
  const meta = RISK_META[acceptanceRisk.level] || RISK_META[ACCEPTANCE_RISK.UNKNOWN];
  const row = el('div', 'dci-rip__risk');
  row.append(el('span', null, 'Risiko penerimaan'));
  const chip = el('span', 'dci-rip__risk-chip', meta.label);
  chip.setAttribute('data-tone', meta.tone);
  row.append(chip);
  if (acceptanceRisk.level !== ACCEPTANCE_RISK.UNKNOWN) {
    row.append(el('span', null, `· akurasi driver ${acceptanceRisk.driverAccuracy}% (n=${acceptanceRisk.sampleSize})`));
  }
  return row;
}

/**
 * Build the panel element from a recommendation package.
 * @param {Object} pkg  output of buildRecommendationPackage()
 * @param {Object} [opts]  forwarded to the embedded dispatch card (nameOf resolvers)
 * @returns {HTMLElement}
 */
export function renderRequestIntelligencePanel(pkg = {}, opts = {}) {
  ensureStyles();
  const state = pkg.state || PANEL_STATE.NOT_READY;

  const panel = el('section', 'dci-rip');
  panel.setAttribute('data-state', state);

  const head = el('header', 'dci-rip__head');
  head.append(el('span', 'dci-rip__title', '🧭 Saran Dispatch'));
  const badgeLabel = state === PANEL_STATE.READY ? 'Tersedia'
    : state === PANEL_STATE.NO_RECOMMENDATION ? 'Tidak ada saran' : 'Lengkapi data';
  head.append(el('span', 'dci-rip__badge', badgeLabel));
  panel.append(head);

  if (state === PANEL_STATE.NOT_READY) {
    panel.append(el('div', 'dci-rip__hint', 'Lengkapi field berikut untuk melihat saran dispatch:'));
    const ul = el('ul', 'dci-rip__missing');
    for (const f of (pkg.missingFields || [])) ul.append(el('li', null, FIELD_LABEL[f] || f));
    panel.append(ul);
  } else if (state === PANEL_STATE.NO_RECOMMENDATION) {
    panel.append(el('div', 'dci-rip__hint', pkg.summary || 'Tidak ada kombinasi driver & kendaraan yang valid untuk permintaan ini.'));
  } else {
    panel.append(renderDispatchRecommendationCard(pkg.dispatchRecommendation || {}, opts));
    const rr = riskRow(pkg.acceptanceRisk);
    if (rr) panel.append(rr);
  }

  panel.append(el('div', 'dci-rip__foot', 'Informasi saja — tidak membuat atau menyetujui penugasan.'));
  return panel;
}

/**
 * Render a panel into `container` (clearing it first). Returns the element.
 * @param {HTMLElement|string} container
 * @param {Object} pkg
 * @param {Object} [opts]
 */
export function mountRequestIntelligencePanel(container, pkg, opts) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return null;
  const panel = renderRequestIntelligencePanel(pkg, opts);
  host.replaceChildren(panel);
  return panel;
}

/* ── Live form wiring (impure adapter) ───────────────────────────────── */

/** Default selector map — the REQUEST Jadwal workflow (#modalRequestForm /
 *  #requestForm). beta.2 hardcoded the admin assignment-form ids here, which
 *  mounted the panel into the wrong modal; the selectors are now configurable
 *  and default to the request workflow (the spec's true integration target). */
export const REQUEST_FORM_SELECTORS = Object.freeze({
  modalId: 'modalRequestForm',
  formId: 'requestForm',
  containerId: 'requestIntelligencePanel',
  dateField: 'requestFieldStartDate',
  startHourField: 'requestFieldStartHour',
  startMinuteField: 'requestFieldStartMinute',
  endHourField: 'requestFieldEndHour',
  endMinuteField: 'requestFieldEndMinute',
  paxField: 'requestFieldPax',
  fullDayField: 'requestFullDay',
  destinationField: 'requestFieldPurpose',
  paxStepperId: 'requestPaxStepper',
});

/** Read the current request from the form named by `cfg` (full-day → 00:00–23:59). */
function readRequestFromForm(cfg) {
  const get = (id) => (id ? document.getElementById(id) : null);
  const dateEl = get(cfg.dateField);
  const fullDayEl = get(cfg.fullDayField);
  const paxEl = get(cfg.paxField);
  const destEl = get(cfg.destinationField);

  const date = dateEl ? dateEl.value : '';
  const fullDay = fullDayEl ? !!fullDayEl.checked : false;
  const startTime = fullDay ? '00:00' : getCombinedTimeFromPair(cfg.startHourField, cfg.startMinuteField);
  const endTime = fullDay ? '23:59' : getCombinedTimeFromPair(cfg.endHourField, cfg.endMinuteField);
  const passengers = parseInt(paxEl ? paxEl.value : '0', 10) || 0;
  const destination = destEl ? destEl.value.trim() : '';
  return { date, startTime, endTime, passengers, destination };
}

/**
 * Wire the panel to a live form. Attaches advisory listeners to the configured
 * fields, recomputes the recommendation on change, caches it, and re-mounts.
 * READ-ONLY: it never touches the form, the assignment/request data, or any save
 * path. Selectors are fully configurable (defaulting to the Request Jadwal
 * workflow) so the panel can never again be bound to the wrong modal silently.
 *
 * @param {Object} [opts]  selector overrides (see REQUEST_FORM_SELECTORS) plus:
 * @param {()=>Array} [opts.getDrivers]      default getActiveDrivers()
 * @param {()=>Array} [opts.getVehicles]     default getActiveVehicles()
 * @param {()=>Array} [opts.getAssignments]  default getAssignments()
 * @param {()=>Array} [opts.getOverrideLogs] default getOverrideLogs()
 * @returns {()=>void} a manual refresh function (no-op outside the DOM)
 */
export function initRequestIntelligencePanel(opts = {}) {
  if (typeof document === 'undefined') return () => {};
  const cfg = { ...REQUEST_FORM_SELECTORS, ...opts };
  const container = document.getElementById(cfg.containerId);
  if (!container) return () => {};

  const getDrivers = opts.getDrivers || getActiveDrivers;
  const getVehicles = opts.getVehicles || getActiveVehicles;
  const getAsg = opts.getAssignments || getAssignments;
  const getLogs = opts.getOverrideLogs || getOverrideLogs;

  const isFormVisible = () => {
    const modal = document.getElementById(cfg.modalId);
    return !!modal && modal.style.display !== 'none';
  };

  function refresh() {
    if (!isFormVisible()) return;
    let pkg;
    try {
      pkg = buildRecommendationPackage({
        request: readRequestFromForm(cfg),
        drivers: getDrivers() || [],
        vehicles: getVehicles() || [],
        assignments: getAsg() || [],
        overrideLogs: getLogs() || [],
      });
    } catch (err) {
      console.warn('[RequestIntelligence] recommendation failed', err);
      return;
    }
    saveRequestRecommendation(pkg);
    mountRequestIntelligencePanel(container, pkg);
  }

  // Watch the request date/time/destination fields (change + blur).
  [cfg.dateField, cfg.startHourField, cfg.startMinuteField, cfg.endHourField, cfg.endMinuteField, cfg.destinationField]
    .forEach((id) => {
      const node = id ? document.getElementById(id) : null;
      if (!node) return;
      node.addEventListener('change', refresh);
      node.addEventListener('blur', refresh);
    });
  if (cfg.fullDayField) document.getElementById(cfg.fullDayField)?.addEventListener('change', refresh);
  // The pax stepper writes its hidden input programmatically (no input event),
  // so refresh just after a stepper interaction settles.
  if (cfg.paxStepperId) document.getElementById(cfg.paxStepperId)?.addEventListener('click', () => setTimeout(refresh, 0));

  // Recompute when the form modal opens/closes (display attribute toggles).
  const modal = document.getElementById(cfg.modalId);
  if (modal && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => refresh()).observe(modal, { attributes: true, attributeFilter: ['style'] });
  }

  return refresh;
}
