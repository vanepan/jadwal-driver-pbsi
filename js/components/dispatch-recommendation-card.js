/* ============================================================
   DISPATCH-RECOMMENDATION-CARD.JS — Dispatch Scoring Engine
   (v1.16.4.11-alpha.4)

   The presentational layer for a fused dispatch recommendation: a 🚐 hero block
   pairing the recommended DRIVER + VEHICLE with the dispatch score and a reason
   breakdown (driver score · vehicle score), plus a compact list of alternative
   dispatches. Renders from the object the Dispatch Scoring Engine produces
   (recommendDispatch → { recommendedDispatch, alternatives, diagnostics, … }).

   DESIGN: matches the Sarpras Operations design language — built entirely on the
   platform CSS custom properties (var(--surface), --border, --text, --muted, and
   the --ok/--warn/--danger/--info status pairs), so it adapts to dark mode
   automatically (no hard-coded #fff — see the dark-mode --white trap) and
   inherits the app's spacing/typography. Styles are injected ONCE under scoped
   `.dci-disp-*` class names, so dropping this component anywhere causes no global
   or visual regression.

   RESPONSIVE: fluid to its container (min-width:0); the driver/vehicle pairing
   and score breakdown wrap cleanly on narrow mobile. No fixed widths.

   SAFE: all values are written with textContent (never innerHTML), so a driver
   or vehicle name can never inject markup. The only DOM dependency is `document`;
   the pure engine / store have none.

   NOT MOUNTED into any production view yet — this is the presentational layer the
   future Dispatch surface will consume.
   ============================================================ */

'use strict';

import { DISPATCH_INVALID_REASON } from '../services/dispatch-scoring-engine.js';

const STYLE_ID = 'dci-disp-card-styles';

/** Indonesian labels for the invalidity reason codes (the UI language). */
const REASON_LABEL = {
  [DISPATCH_INVALID_REASON.DRIVER_CONFLICT]: 'Driver konflik',
  [DISPATCH_INVALID_REASON.VEHICLE_CONFLICT]: 'Kendaraan konflik',
  [DISPATCH_INVALID_REASON.VEHICLE_OVER_CAPACITY]: 'Kapasitas kurang',
};

const CSS = `
.dci-disp{
  display:flex;flex-direction:column;gap:.85rem;min-width:0;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:1rem 1.1rem;box-shadow:var(--shadow-sm);
  font-family:var(--font-sans, inherit);color:var(--text);
}
.dci-disp__hero{
  display:flex;flex-direction:column;gap:.7rem;
  border:1px solid var(--ok);background:var(--ok-bg);border-radius:12px;padding:.85rem .95rem;
}
.dci-disp__hero[data-empty="true"]{border-color:var(--border);background:var(--surface-2);}
.dci-disp__crown{display:flex;align-items:center;gap:.45rem;font-size:.74rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.dci-disp__hero-main{display:flex;align-items:center;justify-content:space-between;gap:.75rem;}
.dci-disp__pair{display:flex;flex-direction:column;gap:.25rem;min-width:0;}
.dci-disp__pair-row{display:flex;align-items:baseline;gap:.4rem;min-width:0;}
.dci-disp__pair-k{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;flex:0 0 4.2rem;}
.dci-disp__pair-v{font-weight:700;font-size:1rem;color:var(--text);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dci-disp__score{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;line-height:1;}
.dci-disp__score-num{font-size:1.7rem;font-weight:800;color:var(--text);}
.dci-disp__score-lbl{font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.dci-disp__breakdown{display:flex;flex-wrap:wrap;gap:.4rem;}
.dci-disp__chip{font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:999px;
  border:1px solid var(--border);background:var(--surface);color:var(--muted);}
.dci-disp__chip[data-tone="ok"]{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.dci-disp__chip[data-tone="warn"]{color:var(--warn);background:var(--warn-bg);border-color:var(--warn);}
.dci-disp__chip[data-tone="danger"]{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

.dci-disp__alts{display:flex;flex-direction:column;gap:.35rem;margin:0;padding:0;list-style:none;}
.dci-disp__alts-title{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
.dci-disp__alt{display:flex;align-items:center;justify-content:space-between;gap:.6rem;
  padding:.45rem .6rem;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);}
.dci-disp__alt[data-invalid="true"]{opacity:.7;}
.dci-disp__alt-main{min-width:0;display:flex;flex-direction:column;gap:.15rem;}
.dci-disp__alt-pair{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:.9rem;font-weight:600;color:var(--text);}
.dci-disp__alt-sub{font-size:.72rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;}
.dci-disp__alt-rank{flex:0 0 auto;font-size:.72rem;font-weight:700;color:var(--muted);
  background:var(--surface);border:1px solid var(--border);border-radius:999px;
  min-width:1.4rem;height:1.4rem;display:inline-flex;align-items:center;justify-content:center;}
.dci-disp__alt-left{display:flex;align-items:center;gap:.5rem;min-width:0;}
.dci-disp__alt-score{flex:0 0 auto;font-size:.92rem;font-weight:700;color:var(--text);}
.dci-disp__empty{font-size:.86rem;color:var(--muted);}
@media (max-width:380px){
  .dci-disp__hero-main{flex-direction:column;align-items:flex-start;gap:.5rem;}
  .dci-disp__score{align-items:flex-start;}
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

function chip(text, tone) {
  const c = el('span', 'dci-disp__chip', text);
  if (tone) c.setAttribute('data-tone', tone);
  return c;
}

/** The diagnostic row for a given driver+vehicle pairing. */
function diagFor(result, driverId, vehicleId) {
  return (result.diagnostics || []).find((d) => d.driverId === driverId && d.vehicleId === vehicleId) || null;
}

/** "Driver konflik · Kapasitas kurang" from a diagnostic's reason codes. */
function reasonText(diag) {
  if (!diag || !Array.isArray(diag.reasons) || !diag.reasons.length) return '';
  return diag.reasons.map((r) => REASON_LABEL[r] || r).join(' · ');
}

/**
 * Build a dispatch recommendation card from a recommendDispatch() result.
 *
 * @param {Object} result  output of recommendDispatch({ request, drivers, vehicles, assignments })
 * @param {Object} [opts]
 * @param {(driverId:string)=>string} [opts.driverNameOf]
 * @param {(vehicleId:string)=>string} [opts.vehicleNameOf]
 * @returns {HTMLElement}
 */
export function renderDispatchRecommendationCard(result = {}, opts = {}) {
  ensureStyles();
  const driverName = (id, diag) =>
    (typeof opts.driverNameOf === 'function' && opts.driverNameOf(id)) || (diag && diag.driverName) || id;
  const vehicleName = (id, diag) =>
    (typeof opts.vehicleNameOf === 'function' && opts.vehicleNameOf(id)) || (diag && diag.vehicleName) || id;

  const card = el('article', 'dci-disp');
  const rec = result.recommendedDispatch || null;

  /* ── Hero: recommended driver + vehicle (or empty state) ───────────── */
  const hero = el('div', 'dci-disp__hero');
  hero.append(el('div', 'dci-disp__crown', '🚐 Rekomendasi Penugasan'));

  if (rec) {
    const diag = diagFor(result, rec.driverId, rec.vehicleId);
    hero.setAttribute('data-empty', 'false');
    const main = el('div', 'dci-disp__hero-main');

    const pair = el('div', 'dci-disp__pair');
    const drvRow = el('div', 'dci-disp__pair-row');
    drvRow.append(el('span', 'dci-disp__pair-k', 'Driver'), el('span', 'dci-disp__pair-v', driverName(rec.driverId, diag)));
    const vehRow = el('div', 'dci-disp__pair-row');
    vehRow.append(el('span', 'dci-disp__pair-k', 'Kendaraan'), el('span', 'dci-disp__pair-v', vehicleName(rec.vehicleId, diag)));
    pair.append(drvRow, vehRow);
    main.append(pair);

    const score = el('div', 'dci-disp__score');
    score.append(el('span', 'dci-disp__score-num', rec.dispatchScore), el('span', 'dci-disp__score-lbl', 'Skor Dispatch'));
    main.append(score);
    hero.append(main);

    if (diag) {
      const bd = el('div', 'dci-disp__breakdown');
      bd.append(chip('Valid', 'ok'));
      bd.append(chip(`Driver ${diag.driverScore}`));
      bd.append(chip(`Kendaraan ${diag.vehicleScore}`));
      hero.append(bd);
    }
  } else {
    hero.setAttribute('data-empty', 'true');
    hero.append(el('div', 'dci-disp__empty', 'Tidak ada kombinasi driver & kendaraan yang valid untuk permintaan ini.'));
  }
  card.append(hero);

  /* ── Alternative dispatches ────────────────────────────────────────── */
  const alts = (result.alternatives || []);
  if (alts.length) {
    card.append(el('div', 'dci-disp__alts-title', 'Alternatif Penugasan'));
    const list = el('ul', 'dci-disp__alts');
    for (const alt of alts) {
      const diag = diagFor(result, alt.driverId, alt.vehicleId);
      const li = el('li', 'dci-disp__alt');
      const invalid = diag && !diag.valid;
      if (invalid) li.setAttribute('data-invalid', 'true');

      const left = el('div', 'dci-disp__alt-left');
      left.append(el('span', 'dci-disp__alt-rank', alt.rank));
      const m = el('div', 'dci-disp__alt-main');
      m.append(el('span', 'dci-disp__alt-pair', `${driverName(alt.driverId, diag)} + ${vehicleName(alt.vehicleId, diag)}`));
      const sub = el('div', 'dci-disp__alt-sub');
      if (diag) {
        sub.append(el('span', null, `D ${diag.driverScore} · K ${diag.vehicleScore}`));
        const rt = reasonText(diag);
        if (rt) sub.append(chip(rt, 'warn'));
      }
      m.append(sub);
      left.append(m);

      li.append(left, el('span', 'dci-disp__alt-score', alt.dispatchScore));
      list.append(li);
    }
    card.append(list);
  }

  return card;
}

/**
 * Render a card into `container` (clearing it first). Returns the card element.
 * @param {HTMLElement|string} container  element or element id
 * @param {Object} result  recommendDispatch() output
 * @param {Object} [opts]
 */
export function mountDispatchRecommendationCard(container, result, opts) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return null;
  const card = renderDispatchRecommendationCard(result, opts);
  host.replaceChildren(card);
  return card;
}
