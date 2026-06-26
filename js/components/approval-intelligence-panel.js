/* ============================================================
   APPROVAL-INTELLIGENCE-PANEL.JS — Auto Assignment Assistant (v1.16.4.12)

   The premium presentational panel for the admin approval (Edit & Setujui)
   modal. It turns the background dispatch recommendation the engines already
   produced into an easy-to-read decision aid:

     🤖 Dispatch Intelligence  — recommended driver + vehicle, dispatch score,
                                 confidence badge, "Mengapa?" explanation
     Terapkan Rekomendasi      — one-click pre-fill of the approval selects
     Komposisi Skor            — score breakdown that totals to the dispatch score
     AI ↔ Admin                — comparison shown when the admin overrides
     Linimasa                  — recommendation → (override) → approval timeline

   RECOMMENDATION-ONLY. This panel renders; it never approves, never assigns, and
   never recomputes a score. All values come from the engine package + the pure
   dispatch-presentation helpers. The human still decides via the form below it.

   DESIGN: built entirely on the platform CSS custom properties (var(--surface),
   --border, --text, --muted, --ok/--warn/--info pairs) so it adapts to dark mode
   automatically (no hard-coded #fff — the dark-mode --white trap) and inherits
   the app's spacing/typography. Styles are injected ONCE under scoped `.aip-*`
   class names; everything is written with textContent (never innerHTML), so a
   driver/vehicle name can never inject markup. Fluid + responsive (min-width:0).
   ============================================================ */

'use strict';

import {
  confidenceFromScore,
  buildScoreBreakdown,
  buildSubScoreRows,
  buildExplanation,
  buildComparison,
  buildTimeline,
} from '../services/dispatch-presentation.js';
// v1.17.3 Unified Scoring System — single source of score color + quality label
// (higher = better). The score badge is tinted + labeled through these helpers.
import { scoreColorVar, scoreLabelId } from '../services/unified-scoring.js';

const STYLE_ID = 'aip-panel-styles';

const CSS = `
.aip{display:flex;flex-direction:column;gap:.8rem;min-width:0;
  font-family:var(--font-sans, inherit);color:var(--text);margin-bottom:.9rem;}

/* Hero — the headline recommendation */
.aip__hero{display:flex;flex-direction:column;gap:.75rem;
  border:1px solid var(--info);border-radius:16px;
  background:linear-gradient(180deg, var(--info-bg), var(--surface));
  padding:.95rem 1.05rem;box-shadow:var(--shadow-sm);}
.aip__hero[data-empty="true"]{border-color:var(--border);background:var(--surface-2);}
.aip__brand{display:flex;align-items:center;gap:.45rem;font-size:.76rem;font-weight:700;
  letter-spacing:.02em;color:var(--text);}
.aip__brand-tag{margin-left:auto;font-size:.64rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.05em;color:var(--muted);background:var(--surface);
  border:1px solid var(--border);border-radius:999px;padding:.12rem .5rem;}
.aip__main{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.aip__pair{display:flex;flex-direction:column;gap:.45rem;min-width:0;flex:1 1 12rem;}
.aip__pair-row{display:flex;align-items:baseline;gap:.5rem;min-width:0;}
.aip__pair-k{font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;flex:0 0 4.6rem;}
.aip__pair-v{font-weight:700;font-size:1.02rem;color:var(--text);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aip__metrics{display:flex;gap:1.1rem;flex:0 0 auto;}
.aip__metric{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15;gap:.15rem;}
.aip__metric-num{font-size:1.7rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.aip__metric-lbl{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.aip__stars{font-size:1.02rem;color:var(--warn);letter-spacing:.05em;}
.aip__conf-lbl{font-size:.7rem;font-weight:700;color:var(--text);}

/* Apply button */
.aip__apply{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;
  align-self:stretch;width:100%;cursor:pointer;
  font-size:.86rem;font-weight:700;color:var(--on-accent);
  background:var(--accent);border:1px solid var(--accent);
  border-radius:11px;padding:.6rem .9rem;transition:filter .15s ease, opacity .15s ease;}
.aip__apply:hover{filter:brightness(1.06);}
.aip__apply:active{filter:brightness(.95);}
.aip__apply[data-applied="true"]{background:var(--ok);border-color:var(--ok);}
.aip__apply:disabled{opacity:.55;cursor:default;filter:none;}

/* Generic mini-section */
.aip__sec{border:1px solid var(--border);border-radius:13px;background:var(--surface);
  padding:.7rem .85rem;display:flex;flex-direction:column;gap:.5rem;}
.aip__sec-title{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  color:var(--muted);display:flex;align-items:center;gap:.4rem;}

/* Explanation checklist */
.aip__why{display:flex;flex-direction:column;gap:.3rem;margin:0;padding:0;list-style:none;}
.aip__why li{display:flex;align-items:center;gap:.5rem;font-size:.84rem;color:var(--text);}
.aip__why-ic{flex:0 0 1.1rem;text-align:center;font-weight:800;}
.aip__why li[data-ok="true"] .aip__why-ic{color:var(--ok);}
.aip__why li[data-ok="false"] .aip__why-ic{color:var(--danger);}
.aip__why li[data-ok="false"]{color:var(--muted);}

/* Score breakdown */
.aip__bd{display:flex;flex-direction:column;gap:.4rem;}
.aip__bd-row{display:flex;align-items:center;gap:.6rem;}
.aip__bd-k{flex:0 0 5.6rem;font-size:.8rem;color:var(--text);font-weight:600;}
.aip__bd-bar{flex:1 1 auto;height:.5rem;border-radius:999px;background:var(--surface-2);
  border:1px solid var(--border);overflow:hidden;min-width:2rem;}
.aip__bd-fill{height:100%;background:var(--info);border-radius:999px;}
.aip__bd-pts{flex:0 0 2.2rem;text-align:right;font-size:.84rem;font-weight:700;color:var(--text);}
.aip__bd-sub{flex:0 0 auto;font-size:.66rem;color:var(--muted);}
.aip__bd-total{display:flex;align-items:center;justify-content:space-between;
  border-top:1px dashed var(--border);padding-top:.45rem;margin-top:.15rem;
  font-size:.84rem;font-weight:800;color:var(--text);}
.aip__bd-total span:last-child{font-size:1rem;}
.aip__chips{display:flex;flex-wrap:wrap;gap:.3rem;}
.aip__chip{font-size:.68rem;font-weight:600;color:var(--muted);background:var(--surface-2);
  border:1px solid var(--border);border-radius:999px;padding:.16rem .5rem;}

/* Comparison */
.aip__cmp{display:flex;flex-direction:column;gap:.5rem;}
.aip__cmp-row{display:grid;grid-template-columns:4.6rem 1fr auto 1fr;align-items:center;gap:.5rem;}
.aip__cmp-k{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
.aip__cmp-cell{display:flex;flex-direction:column;gap:.1rem;min-width:0;}
.aip__cmp-tag{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.aip__cmp-val{font-size:.88rem;font-weight:700;color:var(--text);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aip__cmp-arrow{color:var(--muted);font-weight:800;}
.aip__cmp-row[data-changed="true"] .aip__cmp-cell--admin .aip__cmp-val{color:var(--warn);}
.aip__cmp-badge{font-size:.66rem;font-weight:700;color:var(--warn);
  background:var(--warn-bg);border:1px solid var(--warn);
  border-radius:999px;padding:.14rem .5rem;}
.aip__cmp-badges{display:flex;flex-wrap:wrap;gap:.35rem;}
.aip__cmp-none{font-size:.8rem;color:var(--muted);}

/* Timeline */
.aip__tl{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none;}
.aip__tl li{display:flex;align-items:flex-start;gap:.6rem;position:relative;padding:.1rem 0 .55rem;}
.aip__tl li:last-child{padding-bottom:0;}
.aip__tl-dot{flex:0 0 .7rem;width:.7rem;height:.7rem;border-radius:50%;margin-top:.2rem;
  background:var(--ok);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--ok);}
.aip__tl li[data-done="false"] .aip__tl-dot{background:var(--surface);box-shadow:0 0 0 1px var(--border);}
.aip__tl li:not(:last-child) .aip__tl-dot::after{content:"";position:absolute;left:.31rem;top:1rem;
  width:1px;height:calc(100% - .9rem);background:var(--border);}
.aip__tl-body{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;}
.aip__tl-time{font-size:.74rem;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;min-width:2.6rem;}
.aip__tl-label{font-size:.84rem;color:var(--text);}
.aip__tl li[data-done="false"] .aip__tl-label{color:var(--muted);}

.aip__empty{font-size:.86rem;color:var(--muted);}

@media (max-width:480px){
  .aip__main{flex-direction:column;align-items:stretch;}
  .aip__metrics{justify-content:space-between;}
  .aip__metric{align-items:flex-start;}
  .aip__cmp-row{grid-template-columns:1fr;gap:.25rem;}
  .aip__cmp-arrow{display:none;}
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
 * Resolve the transparent diagnostics for a driver/vehicle pairing out of a
 * LIVE engine package, WITHOUT recalculating anything itself — it only reads the
 * sub-scores the engines already produced. The pairing is chosen by the stored
 * recommendation's ids when given (so the breakdown matches the recommendation
 * that was shown to the requester at submit), otherwise the package's own #1.
 * @param {Object} pkg  buildRecommendationPackage() result
 * @param {{driverId?:string, vehicleId?:string}} [target] stored recommendation ids
 * @returns {Object|null}
 */
function resolveDiagnostics(pkg, target = {}) {
  const disp = (pkg && pkg.dispatchRecommendation) || {};
  const rec = (pkg && pkg.recommendedDispatch) || null;
  const driverId = target.driverId || (rec && rec.driverId);
  const vehicleId = target.vehicleId || (rec && rec.vehicleId);
  if (!driverId || !vehicleId) return null;

  const driverDiag = ((pkg.driverRecommendation || {}).diagnostics || []).find((d) => d.driverId === driverId) || {};
  const vehicleDiag = ((pkg.vehicleRecommendation || {}).diagnostics || []).find((v) => v.vehicleId === vehicleId) || {};
  const dispatchDiag = (disp.diagnostics || []).find((d) => d.driverId === driverId && d.vehicleId === vehicleId) || {};
  // Need at least the fused sub-scores to render the breakdown.
  if (dispatchDiag.driverScore == null && dispatchDiag.vehicleScore == null
      && driverDiag.score == null && vehicleDiag.score == null) return null;

  return {
    weights: disp.weights || { driver: 60, vehicle: 40 },
    driverName: dispatchDiag.driverName || driverDiag.driverName || driverId,
    vehicleName: dispatchDiag.vehicleName || vehicleDiag.vehicleName || vehicleId,
    driverDiag,
    vehicleDiag,
    driverScore: dispatchDiag.driverScore != null ? dispatchDiag.driverScore : driverDiag.score,
    vehicleScore: dispatchDiag.vehicleScore != null ? dispatchDiag.vehicleScore : vehicleDiag.score,
  };
}

/* ── Section renderers ─────────────────────────────────────────────────── */

function renderHero(driverName, vehicleName, score, confidence) {
  const hero = el('div', 'aip__hero');
  const brand = el('div', 'aip__brand');
  brand.append(el('span', null, '🤖'), el('span', null, 'Dispatch Intelligence'));
  brand.append(el('span', 'aip__brand-tag', 'Rekomendasi'));
  hero.append(brand);

  const main = el('div', 'aip__main');
  const pair = el('div', 'aip__pair');
  const dRow = el('div', 'aip__pair-row');
  dRow.append(el('span', 'aip__pair-k', 'Driver'), el('span', 'aip__pair-v', driverName));
  const vRow = el('div', 'aip__pair-row');
  vRow.append(el('span', 'aip__pair-k', 'Kendaraan'), el('span', 'aip__pair-v', vehicleName));
  pair.append(dRow, vRow);

  const metrics = el('div', 'aip__metrics');
  const scoreM = el('div', 'aip__metric');
  // Unified scale: higher = better. Tint the number + show the quality band so
  // the score reads as "95 = Sangat Baik", never as an inverted value.
  const scoreNum = el('span', 'aip__metric-num', `${score}`);
  scoreNum.style.color = scoreColorVar(score);
  scoreM.append(scoreNum, el('span', 'aip__metric-lbl', `Skor / 100 · ${scoreLabelId(score)}`));
  const confM = el('div', 'aip__metric');
  confM.append(el('span', 'aip__stars', confidence.glyph), el('span', 'aip__conf-lbl', confidence.label), el('span', 'aip__metric-lbl', 'Confidence'));
  metrics.append(scoreM, confM);

  main.append(pair, metrics);
  hero.append(main);
  return hero;
}

function renderApplyButton() {
  const btn = el('button', 'aip__apply', 'Terapkan Rekomendasi');
  btn.type = 'button';
  btn.id = 'aipApplyBtn';
  return btn;
}

function renderWhy(driverDiag, vehicleDiag) {
  const sec = el('div', 'aip__sec');
  sec.append(el('div', 'aip__sec-title', 'Mengapa rekomendasi ini?'));
  const ul = el('ul', 'aip__why');
  for (const item of buildExplanation(driverDiag, vehicleDiag)) {
    const li = el('li');
    li.setAttribute('data-ok', item.ok ? 'true' : 'false');
    li.append(el('span', 'aip__why-ic', item.ok ? '✓' : '✕'), el('span', null, item.text));
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

function renderBreakdown(data, dispatchScore) {
  const sec = el('div', 'aip__sec');
  sec.append(el('div', 'aip__sec-title', 'Komposisi Skor Dispatch'));

  const bd = buildScoreBreakdown(
    { driverScore: data.driverScore, vehicleScore: data.vehicleScore, dispatchScore },
    data.weights,
  );
  const wrap = el('div', 'aip__bd');
  for (const row of bd.rows) {
    const r = el('div', 'aip__bd-row');
    r.append(el('span', 'aip__bd-k', row.label));
    const bar = el('div', 'aip__bd-bar');
    const fill = el('div', 'aip__bd-fill');
    fill.style.width = `${Math.max(0, Math.min(100, row.score))}%`;
    bar.append(fill);
    r.append(bar);
    r.append(el('span', 'aip__bd-sub', `${row.score} · bobot ${row.weightPct}%`));
    r.append(el('span', 'aip__bd-pts', `+${row.points}`));
    wrap.append(r);
  }
  const total = el('div', 'aip__bd-total');
  total.append(el('span', null, 'Total Skor Dispatch'), el('span', null, `${bd.total}`));
  wrap.append(total);
  sec.append(wrap);

  // Detailed sub-scores (informational chips) — relabeled engine breakdowns.
  const subs = buildSubScoreRows(data.driverDiag, data.vehicleDiag);
  const chips = el('div', 'aip__chips');
  subs.driver.forEach((s) => chips.append(el('span', 'aip__chip', `D·${s.label} ${s.score}`)));
  subs.vehicle.forEach((s) => chips.append(el('span', 'aip__chip', `K·${s.label} ${s.score}`)));
  sec.append(chips);
  return sec;
}

function renderComparisonInner(cmp) {
  const wrap = el('div', 'aip__cmp');
  if (!cmp.anyChange) {
    wrap.append(el('div', 'aip__cmp-none', 'Pilihan admin sama dengan rekomendasi AI.'));
    return wrap;
  }
  const mkRow = (label, side) => {
    const row = el('div', 'aip__cmp-row');
    row.setAttribute('data-changed', side.changed ? 'true' : 'false');
    row.append(el('span', 'aip__cmp-k', label));
    const aiCell = el('div', 'aip__cmp-cell aip__cmp-cell--ai');
    aiCell.append(el('span', 'aip__cmp-tag', 'AI'), el('span', 'aip__cmp-val', side.ai || '—'));
    row.append(aiCell);
    row.append(el('span', 'aip__cmp-arrow', '→'));
    const adCell = el('div', 'aip__cmp-cell aip__cmp-cell--admin');
    adCell.append(el('span', 'aip__cmp-tag', 'Admin'), el('span', 'aip__cmp-val', side.admin || '—'));
    row.append(adCell);
    return row;
  };
  wrap.append(mkRow('Driver', cmp.driver), mkRow('Kendaraan', cmp.vehicle));

  const badges = el('div', 'aip__cmp-badges');
  if (cmp.driver.changed) badges.append(el('span', 'aip__cmp-badge', 'Driver Diubah'));
  if (cmp.vehicle.changed) badges.append(el('span', 'aip__cmp-badge', 'Kendaraan Diubah'));
  wrap.append(badges);
  return wrap;
}

function renderComparisonSection(recommended, selection) {
  const sec = el('div', 'aip__sec');
  sec.id = 'aipComparisonSec';
  sec.append(el('div', 'aip__sec-title', 'Perbandingan AI ↔ Admin'));
  const region = el('div', 'aip__cmp-region');
  region.id = 'aipComparisonRegion';
  region.append(renderComparisonInner(buildComparison(recommended, selection)));
  sec.append(region);
  return sec;
}

function renderTimeline(timeline) {
  const sec = el('div', 'aip__sec');
  sec.append(el('div', 'aip__sec-title', 'Linimasa'));
  const ul = el('ul', 'aip__tl');
  for (const ev of timeline) {
    const li = el('li');
    li.setAttribute('data-done', ev.done ? 'true' : 'false');
    li.setAttribute('data-tl', ev.key);
    li.append(el('span', 'aip__tl-dot'));
    const body = el('div', 'aip__tl-body');
    if (ev.time) body.append(el('span', 'aip__tl-time', ev.time));
    body.append(el('span', 'aip__tl-label', ev.label));
    li.append(body);
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

/**
 * Render the full approval intelligence panel. The HEADLINE (driver/vehicle/
 * score/confidence) is taken from the STORED recommendation object — nothing is
 * recalculated for it (Feature 1). The transparent breakdown + explanation read
 * the engine sub-scores from a LIVE package, looked up for the SAME pairing — a
 * read-only reuse of the engines, no scoring duplicated (Features 5 & 7).
 *
 * @param {Object} opts
 * @param {Object} [opts.pkg]        a buildRecommendationPackage() result (live, for diagnostics)
 * @param {Object} [opts.stored]     the stored request.recommendation object
 * @param {Object} [opts.request]    the request (for createdAt / status in the timeline)
 * @param {{driver:string, vehicle:string}} [opts.recommended] stored recommendation names
 * @param {{driver:string, vehicle:string}} [opts.selection]   admin's current selection
 * @returns {HTMLElement}
 */
export function renderApprovalIntelligencePanel(opts = {}) {
  ensureStyles();
  const { pkg = {}, stored = null, request = {}, selection = { driver: '', vehicle: '' } } = opts;
  const root = el('article', 'aip');

  // Headline values from the STORED recommendation (no recalculation), falling
  // back to the live package's #1 when a request has no stored recommendation.
  const liveRec = pkg.recommendedDispatch || null;
  const hasStored = stored && stored.hasRecommendation;
  const recommended = opts.recommended && (opts.recommended.driver || opts.recommended.vehicle)
    ? opts.recommended
    : { driver: (stored && stored.recommendedDriver) || '', vehicle: (stored && stored.recommendedVehicle) || '' };

  // Diagnostics for the recommended pairing (by stored ids when available).
  const target = hasStored
    ? { driverId: stored.recommendedDriverId, vehicleId: stored.recommendedVehicleId }
    : {};
  const data = resolveDiagnostics(pkg, target);

  const score = hasStored ? Number(stored.dispatchScore) || 0
    : (liveRec ? liveRec.dispatchScore : 0);
  const driverName = recommended.driver || (data && data.driverName) || '';
  const vehicleName = recommended.vehicle || (data && data.vehicleName) || '';
  const hasRecommendation = !!(hasStored || liveRec);

  if (!hasRecommendation) {
    const hero = el('div', 'aip__hero');
    hero.setAttribute('data-empty', 'true');
    const brand = el('div', 'aip__brand');
    brand.append(el('span', null, '🤖'), el('span', null, 'Dispatch Intelligence'));
    hero.append(brand);
    hero.append(el('div', 'aip__empty',
      'Tidak ada rekomendasi otomatis untuk request ini — pilih driver & kendaraan secara manual di bawah.'));
    root.append(hero);
    root.append(renderTimeline(buildTimeline({ createdAt: request.createdAt, generatedAt: (stored && stored.generatedAt) || pkg.generatedAt })));
    root._aipRecommended = recommended;
    return root;
  }

  const confidence = confidenceFromScore(score);
  const cmp = buildComparison(recommended, selection);

  root.append(renderHero(driverName || '—', vehicleName || '—', score, confidence));
  root.append(renderApplyButton());
  if (data) {
    root.append(renderWhy(data.driverDiag, data.vehicleDiag));
    root.append(renderBreakdown(data, score));
  }
  root.append(renderComparisonSection(recommended, selection));
  root.append(renderTimeline(buildTimeline({
    createdAt: request.createdAt,
    generatedAt: (stored && stored.generatedAt) || pkg.generatedAt,
    overridden: cmp.anyChange,
    approvedAt: request.status === 'approved' ? request.approvedAt : '',
  })));

  // Stash what the live comparison/timeline updates need.
  root._aipRecommended = recommended;
  return root;
}

/**
 * Mount the panel into a host container (cleared first). Returns the panel root.
 * @param {HTMLElement|string} container
 * @param {Object} opts  see renderApprovalIntelligencePanel
 */
export function mountApprovalIntelligencePanel(container, opts) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return null;
  const panel = renderApprovalIntelligencePanel(opts);
  host.replaceChildren(panel);
  return panel;
}

/**
 * Live-update the comparison region (and the override row in the timeline) when
 * the admin changes the driver/vehicle selects. No re-render of the whole panel.
 * @param {HTMLElement|string} container  the panel host (or the panel root)
 * @param {{driver:string, vehicle:string}} selection
 */
export function updateApprovalComparison(container, selection = { driver: '', vehicle: '' }) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return;
  const panel = host.classList && host.classList.contains('aip') ? host : host.querySelector('.aip');
  if (!panel || !panel._aipRecommended) return;
  const region = panel.querySelector('#aipComparisonRegion');
  if (!region) return;
  const cmp = buildComparison(panel._aipRecommended, selection);
  region.replaceChildren(renderComparisonInner(cmp));

  // Reflect the override on the timeline: ensure exactly one override row exists
  // between "Rekomendasi Dibuat" and "Menunggu Keputusan".
  const tl = panel.querySelector('.aip__tl');
  if (tl) {
    let overrideLi = tl.querySelector('[data-tl="override"]');
    if (cmp.anyChange && !overrideLi) {
      overrideLi = el('li');
      overrideLi.setAttribute('data-done', 'true');
      overrideLi.setAttribute('data-tl', 'override');
      overrideLi.append(el('span', 'aip__tl-dot'));
      const body = el('div', 'aip__tl-body');
      body.append(el('span', 'aip__tl-label', 'Admin Override'));
      overrideLi.append(body);
      const pending = tl.querySelector('[data-tl="pending"]') || tl.querySelector('li:last-child');
      tl.insertBefore(overrideLi, pending);
    } else if (!cmp.anyChange && overrideLi) {
      overrideLi.remove();
    }
  }
}
