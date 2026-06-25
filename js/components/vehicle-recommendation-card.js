/* ============================================================
   VEHICLE-RECOMMENDATION-CARD.JS — Vehicle Recommendation Engine
   (v1.16.4.11-alpha.3)

   The presentational layer for a vehicle recommendation: a 🥇 hero block for
   the recommended vehicle (name, final score, passenger fit, availability) and
   a compact list of alternatives. Renders from the object the Vehicle
   Recommendation Engine produces (recommendVehicle → { recommendedVehicle,
   alternatives, diagnostics, … }).

   DESIGN: matches the Sarpras Operations design language — built entirely on the
   platform CSS custom properties (var(--surface), --border, --text, --muted, and
   the --ok/--warn/--danger/--info status pairs), so it adapts to dark mode
   automatically (no hard-coded #fff — see the dark-mode --white trap) and
   inherits the app's spacing/typography. Styles are injected ONCE under scoped
   `.dci-vrec-*` class names, so dropping this component anywhere causes no global
   or visual regression.

   RESPONSIVE: fluid to its container width (min-width:0). Score/fit metrics are a
   flexible row that wraps on narrow mobile. No fixed widths.

   SAFE: all values are written with textContent (never innerHTML), so a vehicle
   name can never inject markup. The only DOM dependency is `document`; the pure
   engine / store have none.

   NOT MOUNTED into any production view yet — this is the presentational layer the
   future Dispatch surface will consume.
   ============================================================ */

'use strict';

const STYLE_ID = 'dci-vrec-card-styles';

const CSS = `
.dci-vrec{
  display:flex;flex-direction:column;gap:.85rem;min-width:0;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:1rem 1.1rem;box-shadow:var(--shadow-sm);
  font-family:var(--font-sans, inherit);color:var(--text);
}
.dci-vrec__hero{
  display:flex;flex-direction:column;gap:.6rem;
  border:1px solid var(--ok);background:var(--ok-bg);border-radius:12px;padding:.85rem .95rem;
}
.dci-vrec__hero[data-empty="true"]{border-color:var(--border);background:var(--surface-2);}
.dci-vrec__crown{display:flex;align-items:center;gap:.45rem;font-size:.74rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.dci-vrec__hero-main{display:flex;align-items:center;justify-content:space-between;gap:.75rem;}
.dci-vrec__name{font-weight:700;font-size:1.05rem;line-height:1.2;color:var(--text);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dci-vrec__score{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;line-height:1;}
.dci-vrec__score-num{font-size:1.7rem;font-weight:800;color:var(--text);}
.dci-vrec__score-lbl{font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.dci-vrec__meta{display:flex;flex-wrap:wrap;gap:.4rem;}
.dci-vrec__chip{font-size:.72rem;font-weight:600;padding:.2rem .55rem;border-radius:999px;
  border:1px solid var(--border);background:var(--surface);color:var(--muted);}
.dci-vrec__chip[data-tone="ok"]{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.dci-vrec__chip[data-tone="warn"]{color:var(--warn);background:var(--warn-bg);border-color:var(--warn);}
.dci-vrec__chip[data-tone="danger"]{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

.dci-vrec__alts{display:flex;flex-direction:column;gap:.35rem;margin:0;padding:0;list-style:none;}
.dci-vrec__alts-title{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
.dci-vrec__alt{display:flex;align-items:center;justify-content:space-between;gap:.6rem;
  padding:.45rem .6rem;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);}
.dci-vrec__alt[data-blocked="true"]{opacity:.7;}
.dci-vrec__alt-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:.9rem;font-weight:600;color:var(--text);display:flex;align-items:center;gap:.4rem;}
.dci-vrec__alt-rank{flex:0 0 auto;font-size:.72rem;font-weight:700;color:var(--muted);
  background:var(--surface);border:1px solid var(--border);border-radius:999px;
  min-width:1.4rem;height:1.4rem;display:inline-flex;align-items:center;justify-content:center;}
.dci-vrec__alt-score{flex:0 0 auto;font-size:.92rem;font-weight:700;color:var(--text);}
.dci-vrec__empty{font-size:.86rem;color:var(--muted);}
@media (max-width:360px){
  .dci-vrec__hero-main{flex-direction:column;align-items:flex-start;gap:.4rem;}
  .dci-vrec__score{align-items:flex-start;}
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
  const c = el('span', 'dci-vrec__chip', text);
  if (tone) c.setAttribute('data-tone', tone);
  return c;
}

/** The diagnostic row for a given vehicleId (carries fit/availability detail). */
function diagFor(result, vehicleId) {
  return (result.diagnostics || []).find((d) => d.vehicleId === vehicleId) || null;
}

/** Passenger-fit label from a diagnostic ("6/7 kursi", or over-capacity). */
function fitLabel(diag, request) {
  const pax = Number(request && request.passengers) || 0;
  if (!diag) return pax ? `${pax} penumpang` : 'Kapasitas';
  if (diag.overCapacity) return `Melebihi kapasitas (${pax}/${diag.capacity})`;
  if (!pax) return `${diag.capacity} kursi`;
  return `${pax}/${diag.capacity} kursi`;
}

/**
 * Build a vehicle recommendation card from a recommendVehicle() result.
 *
 * @param {Object} result  output of recommendVehicle(request, vehicles, assignments)
 * @param {Object} [opts]
 * @param {(vehicleId:string)=>string} [opts.nameOf]  resolve a display name (default: diagnostic name)
 * @returns {HTMLElement}
 */
export function renderVehicleRecommendationCard(result = {}, opts = {}) {
  ensureStyles();
  const request = result.request || {};
  const nameOf = (id) => {
    if (typeof opts.nameOf === 'function') { const n = opts.nameOf(id); if (n) return n; }
    const d = diagFor(result, id);
    return (d && d.vehicleName) || id;
  };

  const card = el('article', 'dci-vrec');
  const rec = result.recommendedVehicle || null;

  /* ── Hero: the recommended vehicle (or an empty state) ─────────────── */
  const hero = el('div', 'dci-vrec__hero');
  hero.append(el('div', 'dci-vrec__crown', '🥇 Kendaraan Rekomendasi'));

  if (rec) {
    const diag = diagFor(result, rec.vehicleId);
    hero.setAttribute('data-empty', 'false');
    const main = el('div', 'dci-vrec__hero-main');
    main.append(el('span', 'dci-vrec__name', nameOf(rec.vehicleId)));
    const score = el('div', 'dci-vrec__score');
    score.append(el('span', 'dci-vrec__score-num', rec.score), el('span', 'dci-vrec__score-lbl', 'Skor'));
    main.append(score);
    hero.append(main);

    const meta = el('div', 'dci-vrec__meta');
    meta.append(chip('Tersedia', 'ok'));
    meta.append(chip(fitLabel(diag, request)));
    if (diag) meta.append(chip(`Utilisasi ${diag.utilizationPercent}%`));
    hero.append(meta);
  } else {
    hero.setAttribute('data-empty', 'true');
    hero.append(el('div', 'dci-vrec__empty', 'Tidak ada kendaraan yang tersedia & sesuai untuk permintaan ini.'));
  }
  card.append(hero);

  /* ── Alternatives ──────────────────────────────────────────────────── */
  const alts = (result.alternatives || []);
  if (alts.length) {
    card.append(el('div', 'dci-vrec__alts-title', 'Alternatif'));
    const list = el('ul', 'dci-vrec__alts');
    for (const alt of alts) {
      const diag = diagFor(result, alt.vehicleId);
      const li = el('li', 'dci-vrec__alt');
      const blocked = diag && (diag.conflict || diag.overCapacity);
      if (blocked) li.setAttribute('data-blocked', 'true');

      const nameWrap = el('span', 'dci-vrec__alt-name');
      nameWrap.append(el('span', 'dci-vrec__alt-rank', alt.rank));
      nameWrap.append(el('span', null, nameOf(alt.vehicleId)));
      if (diag && diag.conflict) nameWrap.append(chip('Konflik', 'danger'));
      else if (diag && diag.overCapacity) nameWrap.append(chip('Kapasitas', 'warn'));

      li.append(nameWrap, el('span', 'dci-vrec__alt-score', alt.score));
      list.append(li);
    }
    card.append(list);
  }

  return card;
}

/**
 * Render a card into `container` (clearing it first). Returns the card element.
 * @param {HTMLElement|string} container  element or element id
 * @param {Object} result  recommendVehicle() output
 * @param {Object} [opts]
 */
export function mountVehicleRecommendationCard(container, result, opts) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return null;
  const card = renderVehicleRecommendationCard(result, opts);
  host.replaceChildren(card);
  return card;
}
