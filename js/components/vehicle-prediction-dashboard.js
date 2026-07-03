/* ============================================================
   VEHICLE-PREDICTION-DASHBOARD.JS — Vehicle Prediction (v1.19.5)

   The SECOND consumer of the Prediction Service (after Driver Prediction) and
   an additional VIEW inside the existing Vehicle Management module — NOT a new
   sidebar menu and NOT a parallel module. It answers ONE forward-looking
   question, top to bottom:

     "Apa yang mungkin terjadi pada kesiapan armada — perawatan, ketersediaan,
      dan risiko downtime — dalam beberapa hari ke depan?"

   ── PRESENTATION ONLY ───────────────────────────────────────────────────────
   This file computes NO prediction. It renders whatever the Prediction Service
   already certified. It NEVER imports the prediction engine, validator, or
   provider — it consumes the service (getPrediction) and nothing else, so the UI
   stays completely decoupled from every prediction implementation. The engine
   already emits `model.vehicles` (maintenanceRisk / administrativeRisk /
   availabilityForecast / utilizationTrend) and `domain:'vehicle'`
   recommendations; this view only TALLIES and ARRANGES those certified outputs.
   No new metric, no new score is invented here.

   ── v1.19.5 RC2 — EXECUTIVE POLISH ──────────────────────────────────────────
   Presentation-only refinement (no business/engine/routing change): a compact
   executive hero (certified badge + horizon / updated / confidence / readiness),
   KPI cards with subtle status + meter indicators, an enriched status banner, a
   DYNAMIC insight card (Top Insight ⇆ Critical Fleet Alert), richer
   explainability (reason · confidence · method · window), a richer Risk Ranking
   table, a severity-aware timeline, positive executive empty states, and a
   subtle reveal animation. Every value still comes ONLY from the certified model.

   ── DATA SOURCE (the single gateway) ────────────────────────────────────────
   renderVehiclePredictionDashboard(input) calls getPrediction() EXACTLY ONCE,
   then renders the returned, deep-frozen PredictionResult. The caller (app.js)
   passes the aggregated platform models as the service INPUT; it never touches
   an engine either. getCertifiedVehiclePredictions(input) exposes the same
   certified per-vehicle predictions (by id) for the drawer — also via the
   service (cached), so the decoupling rule holds for the drawer too.

   ── EXPLAINABILITY / CONFIDENCE ─────────────────────────────────────────────
   Every prediction surfaced here shows its plain-language REASON + SUMMARY and a
   CONFIDENCE band (Tinggi / Sedang / Rendah). Internal evidence — signals,
   weights, rules, validator terminology, confidence maths — is NEVER exposed.

   ── DESIGN AUTHORITY ────────────────────────────────────────────────────────
   Reuses the Executive UI Kit (ExecutiveKPICard/Grid/SectionShell/Table/
   StatusPill/EmptyState + the one icon engine) and the SHARED `.daa-*` micro-viz
   (status verdict, timeline) — like the Driver Prediction sibling. Net-new CSS is
   a small `.vpr-*` supplement (executive hero, KPI meters, insight card, card
   explainability, table tweaks) — tokens only, dark-mode safe, no hardcoded
   colours, no heavy charts.

   Page structure (v1.19.5):
     Hero → Prediction Status → Prediction Summary → Fleet Insight →
     Maintenance Forecast → Recommended Actions → Prediction Timeline →
     Risk Ranking (Prediction Detail)

   API:
     injectVehiclePredictionStyles()                          — idempotent <style>
     renderVehiclePredictionDashboard(input) → string          — full dashboard HTML
     getCertifiedVehiclePredictions(input) → { ok, byId }      — per-vehicle preds
   ============================================================ */

'use strict';

import { getPrediction } from '../services/prediction-service.js';
import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
import {
  ExecutiveKPICard,
  ExecutiveKPIGrid,
  ExecutiveSectionShell,
  ExecutiveTable,
  ExecutiveStatusPill,
  ExecutiveEmptyState,
  anIcon,
  escHtml as esc,
} from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'vpr-dashboard-styles';

/* The prediction horizon presented across the view. The engine projects a 7-day
   window (urgent maintenance is called out at 3 days in the per-item copy). */
const HORIZON_LABEL = '7 Hari';
/* One user-facing, non-technical label for HOW the forecast is produced. The
   engine is a deterministic, rule-based statistical projection — we say that in
   plain language, never exposing signals / weights / rules. */
const PRED_METHOD = 'Analisis statistik deterministik';

/* `.vpr-*` supplement — executive hero, KPI meters, insight card, card
   explainability + a subtle reveal. Tokens only; dark-mode safe. Reuses the
   shared `.daa-*` system (status verdict + timeline) and adds the `danger`
   status tone the shared set lacks. */
const CSS = `
.vpr{animation:vpr-fade .28s ease both;}
@keyframes vpr-fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
.daa-status--danger{border-left-color:var(--danger);background:var(--danger-bg);}
.daa-status--danger .daa-status__level{color:var(--danger);}

/* Executive hero */
.vpr-hero{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:18px;
  background:linear-gradient(135deg,var(--surface) 0%,var(--surface-2) 100%);
  padding:1.15rem 1.3rem;display:flex;flex-direction:column;gap:1rem;margin-bottom:1.25rem;}
.vpr-hero::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,var(--info),var(--ok));}
.vpr-hero__top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.vpr-hero__title{font-size:1.55rem;font-weight:800;letter-spacing:-.02em;color:var(--text);line-height:1.08;margin:0;}
.vpr-hero__sub{font-size:.84rem;color:var(--muted);margin:.28rem 0 0;line-height:1.45;max-width:52ch;}
.vpr-badge{display:inline-flex;align-items:center;gap:.4rem;font-size:.66rem;font-weight:800;
  text-transform:uppercase;letter-spacing:.05em;padding:.34rem .62rem;border-radius:999px;
  border:1px solid var(--ok);color:var(--ok);background:transparent;white-space:nowrap;}
.vpr-hero__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.25rem,1fr));gap:.6rem;}
.vpr-meta{border:1px solid var(--border);border-radius:12px;background:var(--surface-2);
  padding:.6rem .78rem;display:flex;flex-direction:column;gap:.18rem;min-width:0;}
.vpr-meta__l{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.vpr-meta__v{font-size:1.08rem;font-weight:800;letter-spacing:-.01em;color:var(--text);
  font-variant-numeric:tabular-nums;line-height:1.15;display:flex;align-items:baseline;gap:.3rem;}
.vpr-meta__v small{font-size:.66rem;font-weight:700;color:var(--muted);}
.vpr-meta--accent{border-color:var(--info);}
.vpr-meta--accent .vpr-meta__v{color:var(--info);}

/* KPI subtle indicators (injected into the card subtitle slot) */
.vpr-kpi-sub{display:flex;flex-direction:column;gap:.42rem;}
.vpr-kpi-note{font-size:.72rem;color:var(--muted);line-height:1.4;}
.vpr-meter{display:block;height:4px;border-radius:999px;background:var(--surface-2);
  border:1px solid var(--border);overflow:hidden;}
.vpr-meter__fill{display:block;height:100%;border-radius:999px;background:var(--info);transition:width .4s ease;}
.vpr-meter__fill[data-tone="ok"]{background:var(--ok);}
.vpr-meter__fill[data-tone="warn"]{background:var(--warn);}
.vpr-meter__fill[data-tone="danger"]{background:var(--danger);}

/* Status banner enrichment (foot metrics under the shared .daa-status verdict) */
.vpr-status-foot{display:flex;flex-wrap:wrap;gap:1.4rem;margin-top:.75rem;padding-top:.7rem;
  border-top:1px solid var(--border);}
.vpr-status-foot__kv{display:flex;flex-direction:column;gap:.12rem;}
.vpr-status-foot__k{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.vpr-status-foot__v{font-size:.95rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;}

/* Dynamic insight card (replaces the oversized spotlight) */
.vpr-insight{border:1px solid var(--border);border-radius:16px;padding:1.05rem 1.2rem;
  display:flex;flex-direction:column;gap:.7rem;background:var(--surface-2);}
.vpr-insight--click{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease;}
.vpr-insight--click:hover{border-color:var(--text-dim,var(--muted));box-shadow:var(--shadow-sm);}
.vpr-insight--click:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.vpr-insight--ok{border-left:4px solid var(--ok);}
.vpr-insight--warn{border-left:4px solid var(--warn);}
.vpr-insight--alert{border-left:4px solid var(--danger);background:var(--danger-bg,var(--surface-2));}
.vpr-insight__eye{font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
.vpr-insight__head{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;}
.vpr-insight__ico{display:inline-flex;color:var(--muted);}
.vpr-insight--ok .vpr-insight__ico{color:var(--ok);}
.vpr-insight--warn .vpr-insight__ico{color:var(--warn);}
.vpr-insight--alert .vpr-insight__ico{color:var(--danger);}
.vpr-insight__title{font-size:1.18rem;font-weight:800;letter-spacing:-.01em;color:var(--text);line-height:1.15;}
.vpr-insight__verdict{margin-left:auto;font-size:.78rem;font-weight:700;color:var(--muted);}
.vpr-insight__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem;}
.vpr-insight__li{display:flex;gap:.55rem;font-size:.85rem;color:var(--muted);line-height:1.5;}
.vpr-insight__li::before{content:"";flex:0 0 .42rem;height:.42rem;margin-top:.42rem;border-radius:50%;background:var(--ok);}
.vpr-insight--warn .vpr-insight__li::before{background:var(--warn);}
.vpr-insight--alert .vpr-insight__li::before{background:var(--danger);}
.vpr-insight__foot{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .9rem;padding-top:.15rem;}
.vpr-kv{font-size:.7rem;color:var(--muted);}
.vpr-kv b{color:var(--text);font-weight:700;}

/* Prediction cards (Maintenance Forecast + Recommended Actions) */
.vpr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(17.5rem,1fr));gap:1rem;}
.vpr-card{border:1px solid var(--border);border-radius:14px;background:var(--surface-2);
  padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.5rem;}
.vpr-card--click{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;}
.vpr-card--click:hover{border-color:var(--text-dim,var(--muted));box-shadow:var(--shadow-sm);transform:translateY(-1px);}
.vpr-card--click:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.vpr-card--ok{border-left:3px solid var(--ok);}
.vpr-card--info{border-left:3px solid var(--info);}
.vpr-card--warn{border-left:3px solid var(--warn);}
.vpr-card--danger{border-left:3px solid var(--danger);}
.vpr-card__top{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.vpr-card__title{font-size:.94rem;font-weight:800;letter-spacing:-.01em;color:var(--text);line-height:1.2;}
.vpr-card__who{font-size:.74rem;font-weight:700;color:var(--muted);}
.vpr-card__reason{font-size:.8rem;color:var(--muted);line-height:1.5;}
.vpr-card__foot{display:flex;flex-wrap:wrap;gap:.4rem .9rem;margin-top:.05rem;padding-top:.55rem;
  border-top:1px dashed var(--border);}
.vpr-card__foot-l{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}

/* Timeline severity chip (rides on the shared .daa-tl structure) */
.vpr-tl-chip{margin-left:auto;font-size:.64rem;font-weight:800;text-transform:uppercase;
  letter-spacing:.04em;padding:.14rem .48rem;border-radius:999px;border:1px solid var(--border);color:var(--muted);}
.vpr-tl-chip--ok{color:var(--ok);border-color:var(--ok);}
.vpr-tl-chip--info{color:var(--info);border-color:var(--info);}
.vpr-tl-chip--warn{color:var(--warn);border-color:var(--warn);}
.vpr-tl-chip--danger{color:var(--danger);border-color:var(--danger);}

@media (prefers-reduced-motion: reduce){
  .vpr{animation:none;}
  .vpr-meter__fill,.vpr-card--click{transition:none;}
}
`;

/** Inject the supplement (and ensure the shared `.daa-*` styles exist). */
export function injectVehiclePredictionStyles() {
  injectDispatchAnalyticsStyles();
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ── formatting ───────────────────────────────────────────────────────────── */

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${mo} ${hh}:${mi}`;
}

/* Confidence is presented as ONE operational word + tone — never a formula, a
   validator term, or the underlying percentage maths. LOW/MEDIUM/HIGH is the
   only vocabulary the model exposes to a user. */
const CONF_WORD = { HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' };
const CONF_TONE = { HIGH: 'ok', MEDIUM: 'info', LOW: 'warn' };
function confWord(level) { return CONF_WORD[level] || 'Rendah'; }
function confPill(pred) {
  const lvl = pred && pred.confidenceLevel ? pred.confidenceLevel : 'LOW';
  return ExecutiveStatusPill(`Keyakinan ${confWord(lvl)}`, CONF_TONE[lvl] || 'warn');
}

/* Which of a vehicle's risks is the dominant (most severe) projection. The
   engine already scored maintenance, administrative and availability — this
   only PICKS the highest one for the headline; it computes no new risk. */
function dominantRisk(v) {
  const parts = [
    { pred: v.maintenanceRisk || {}, kind: 'maintenance' },
    { pred: v.administrativeRisk || {}, kind: 'administrative' },
    { pred: v.availabilityForecast || {}, kind: 'availability' },
  ];
  let dom = parts[0];
  for (const p of parts) if ((Number(p.pred.score) || 0) > (Number(dom.pred.score) || 0)) dom = p;
  return dom;
}
function maintenanceNeeded(v) {
  const lvl = (v.maintenanceRisk || {}).level;
  return lvl === 'HIGH' || lvl === 'CRITICAL';
}
function downtimeRisk(v) {
  const lvl = (v.availabilityForecast || {}).level;
  return lvl === 'HIGH' || lvl === 'CRITICAL';
}
function availableNext(v) {
  const lvl = (v.availabilityForecast || {}).level;
  return lvl === 'LOW' || lvl === 'MODERATE';
}
function isCritical(v) {
  const { pred } = dominantRisk(v);
  return pred.level === 'HIGH' || pred.level === 'CRITICAL';
}
function isWatch(v) {
  const { pred } = dominantRisk(v);
  return !isCritical(v) && pred.level === 'ELEVATED';
}
function isHealthy(v) { return !isCritical(v) && !isWatch(v); }

/* Sort vehicles by projected concern, most-in-need first (deterministic). */
function byConcern(a, b) {
  const ra = dominantRisk(a).pred; const rb = dominantRisk(b).pred;
  return (Number(rb.score) || 0) - (Number(ra.score) || 0)
    || String(a.name).localeCompare(String(b.name));
}

/* A fleet-readiness LABEL from the available/total ratio — a presentation
   arrangement of the certified tally, not a new score. */
function readinessLabel(pct) {
  if (pct >= 85) return { word: 'Sangat Baik', tone: 'ok' };
  if (pct >= 70) return { word: 'Baik', tone: 'ok' };
  if (pct >= 55) return { word: 'Cukup', tone: 'info' };
  if (pct >= 35) return { word: 'Perlu Perhatian', tone: 'warn' };
  return { word: 'Kritis', tone: 'danger' };
}

/** A thin, token-driven meter (the KPI "subtle visual indicator"). */
function meter(pct, tone) {
  const w = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `<span class="vpr-meter"><span class="vpr-meter__fill" data-tone="${esc(tone || 'info')}" style="width:${w}%"></span></span>`;
}

/* ── 1. HERO — a compact executive header: title + certified badge, and a
   metadata row leading with Confidence and Fleet Readiness. Dense, low
   whitespace; the numbers carry the forecast message. ─────────────────────── */

function renderHero(model, meta) {
  const vehicles = Array.isArray(model.vehicles) ? model.vehicles : [];
  const total = vehicles.length;
  const available = vehicles.filter(availableNext).length;
  const readinessPct = total ? Math.round((available / total) * 100) : 0;
  const readiness = readinessLabel(readinessPct);
  const conf = meta.confidence; // { score, level }
  const subtitle = total === 0
    ? 'Belum ada kendaraan untuk diproyeksikan.'
    : conf.level === 'HIGH'
      ? 'Proyeksi kesiapan armada dengan keyakinan tinggi — dapat diandalkan untuk pengambilan keputusan.'
      : conf.level === 'MEDIUM'
        ? 'Proyeksi kesiapan armada bersifat indikatif — keyakinan sedang.'
        : 'Data belum cukup untuk proyeksi armada yang andal.';

  const metaCard = (label, value, extra = '', mod = '') =>
    `<div class="vpr-meta ${mod}"><span class="vpr-meta__l">${esc(label)}</span><span class="vpr-meta__v">${esc(value)}${extra}</span></div>`;

  const grid = `<div class="vpr-hero__grid">
      ${metaCard('Prediction Horizon', HORIZON_LABEL)}
      ${metaCard('Diperbarui', fmtTime(model.generatedAt))}
      ${metaCard('Confidence', `${conf.score}`, '<small>%</small>', 'vpr-meta--accent')}
      ${metaCard('Fleet Readiness', total ? readiness.word : '—')}
    </div>`;

  return `<div class="vpr-hero">
      <div class="vpr-hero__top">
        <div>
          <h2 class="vpr-hero__title">Vehicle Prediction</h2>
          <p class="vpr-hero__sub">${esc(subtitle)}</p>
        </div>
        <span class="vpr-badge">${anIcon('doc-shield', { size: 13 })} Certified Prediction Engine</span>
      </div>
      ${grid}
    </div>`;
}

/* ── 2. PREDICTION STATUS — one premium verdict card, now with a foot exposing
   Confidence and Prediction Horizon alongside the operational sentence. Driven
   by the model's own vehicle-domain risk band (tone only) + the counts. ───── */

function renderStatus(model, meta) {
  const vehicles = Array.isArray(model.vehicles) ? model.vehicles : [];
  const total = vehicles.length;
  const critical = vehicles.filter(isCritical).length;
  const watch = vehicles.filter(isWatch).length;
  const maint = vehicles.filter(maintenanceNeeded).length;
  const warns = (model.executive && Array.isArray(model.executive.warnings)) ? model.executive.warnings : [];
  const vehicleWarn = warns.find((w) => w.domain === 'vehicle');

  let tone, level, msg;
  if (critical === 0 && watch === 0) {
    tone = 'good'; level = 'Armada Siap';
    msg = total
      ? `Seluruh ${total} kendaraan diproyeksikan tetap operasional selama jendela prediksi berikutnya.`
      : 'Belum ada kendaraan untuk diproyeksikan.';
  } else if (vehicleWarn || critical > 0) {
    tone = 'danger'; level = 'Perlu Tindakan Armada';
    msg = `${critical} kendaraan berisiko tinggi${maint ? ` dan ${maint} diproyeksikan perlu perawatan` : ''} — jadwalkan tindakan dalam jendela prediksi.`;
  } else {
    tone = 'warn'; level = 'Risiko Armada Meningkat';
    msg = `${watch} kendaraan menunjukkan tekanan yang meningkat — pantau kesiapan menjelang proyeksi.`;
  }

  const conf = meta.confidence;
  const foot = `<div class="vpr-status-foot">
      <div class="vpr-status-foot__kv"><span class="vpr-status-foot__k">Confidence</span><span class="vpr-status-foot__v">${esc(conf.score)}% · ${esc(confWord(conf.level))}</span></div>
      <div class="vpr-status-foot__kv"><span class="vpr-status-foot__k">Prediction Horizon</span><span class="vpr-status-foot__v">${esc(HORIZON_LABEL)}</span></div>
      <div class="vpr-status-foot__kv"><span class="vpr-status-foot__k">Cakupan</span><span class="vpr-status-foot__v">${total} kendaraan</span></div>
    </div>`;

  return `<div class="daa-status daa-status--${tone}">
      <div class="daa-status__eye">Status Prediksi</div>
      <div class="daa-status__level">${esc(level)}</div>
      <div class="daa-status__msg">${esc(msg)}</div>
      ${foot}
    </div>`;
}

/* ── 3. PREDICTION SUMMARY — five executive cards with a subtle status tone and
   a thin meter (share of the tally). Each value is a tally of the engine's
   already-certified per-vehicle projections — no new metric is invented. ───── */

function kpiSub(note, pct, tone) {
  return `<div class="vpr-kpi-sub"><span class="vpr-kpi-note">${esc(note)}</span>${meter(pct, tone)}</div>`;
}

function renderSummary(model) {
  const vehicles = Array.isArray(model.vehicles) ? model.vehicles : [];
  const total = vehicles.length;
  const healthy = vehicles.filter(isHealthy).length;
  const available = vehicles.filter(availableNext).length;
  const maint = vehicles.filter(maintenanceNeeded).length;
  const downtime = vehicles.filter(downtimeRisk).length;
  const readiness = total ? Math.round((available / total) * 100) : 0;
  const pct = (n) => (total ? (n / total) * 100 : 0);

  const healthTone = healthy === total ? 'ok' : (healthy >= total * 0.6 ? 'warn' : 'danger');
  const availTone = available === total ? 'ok' : (available >= total * 0.6 ? 'warn' : 'danger');

  const cards = [
    ExecutiveKPICard({ title: 'Fleet Health', value: `${healthy}${total ? ` / ${total}` : ''}`, status: healthTone, icon: anIcon('check', { size: 15 }), subtitle: kpiSub('Diproyeksikan prima', pct(healthy), healthTone) }),
    ExecutiveKPICard({ title: 'Ketersediaan Armada', value: `${available}${total ? ` / ${total}` : ''}`, status: availTone, icon: anIcon('vehicle-car', { size: 15 }), subtitle: kpiSub('Siap periode berikutnya', pct(available), availTone) }),
    ExecutiveKPICard({ title: 'Prakiraan Perawatan', value: String(maint), status: maint > 0 ? 'warn' : 'ok', icon: anIcon('tool-wrench', { size: 15 }), subtitle: kpiSub('Diproyeksikan perlu perawatan', pct(maint), maint > 0 ? 'warn' : 'ok') }),
    ExecutiveKPICard({ title: 'Risiko Downtime', value: String(downtime), status: downtime > 0 ? 'danger' : 'ok', icon: anIcon('alert', { size: 15 }), subtitle: kpiSub('Berisiko tidak tersedia', pct(downtime), downtime > 0 ? 'danger' : 'ok') }),
    ExecutiveKPICard({ title: 'Kesiapan Armada', value: `${readiness}%`, status: readinessLabel(readiness).tone, icon: anIcon('pulse', { size: 15 }), subtitle: kpiSub('Proyeksi ketersediaan armada', readiness, readinessLabel(readiness).tone) }),
  ];
  return ExecutiveSectionShell({ title: 'Ringkasan Prediksi', content: ExecutiveKPIGrid(cards) });
}

/* ── 4. FLEET INSIGHT — a DYNAMIC executive card. When the fleet is healthy it
   is a calm "Top Insight" (positive findings). The moment any vehicle turns
   critical it transforms into a "Critical Fleet Alert" spotlighting the
   highest-risk vehicle. Severity drives tone, title, iconography and content. */

const FORECAST_VERDICT = {
  maintenance: 'Perlu perawatan',
  administrative: 'Dokumen jatuh tempo',
  availability: 'Ketersediaan menurun',
};

function renderInsight(model, meta) {
  const vehicles = (Array.isArray(model.vehicles) ? [...model.vehicles] : []).sort(byConcern);
  if (!vehicles.length) {
    return ExecutiveSectionShell({
      title: 'Wawasan Armada',
      content: ExecutiveEmptyState({ message: 'Belum ada kendaraan untuk diproyeksikan.' }),
    });
  }
  const total = vehicles.length;
  const available = vehicles.filter(availableNext).length;
  const maint = vehicles.filter(maintenanceNeeded).length;
  const critical = vehicles.filter(isCritical);
  const watch = vehicles.filter(isWatch);
  const conf = meta.confidence;

  // CRITICAL — spotlight the highest-risk vehicle as an alert.
  if (critical.length) {
    const top = critical[0];
    const { pred, kind } = dominantRisk(top);
    const window = kind === 'maintenance' ? '3 hari' : '7 hari';
    const reasons = (Array.isArray(pred.reasons) ? pred.reasons : []).filter(Boolean).slice(0, 3);
    const items = (reasons.length ? reasons : [pred.summary || 'Proyeksi menuntut perhatian'])
      .map((r) => `<li class="vpr-insight__li">${esc(r)}</li>`).join('');
    const body = `<div class="vpr-insight vpr-insight--alert vpr-insight--click" data-vehicle-predict="${esc(top.id)}" tabindex="0" role="button" aria-label="Detail prediksi ${esc(top.name)}">
        <div class="vpr-insight__eye">Critical Fleet Alert</div>
        <div class="vpr-insight__head">
          <span class="vpr-insight__ico">${anIcon('alert', { size: 18 })}</span>
          <span class="vpr-insight__title">${esc(top.name)}</span>
          <span class="vpr-insight__verdict">${esc(FORECAST_VERDICT[kind] || 'Perlu perhatian')} · proyeksi ${esc(window)}</span>
        </div>
        <ul class="vpr-insight__list">${items}</ul>
        <div class="vpr-insight__foot">
          ${confPill(pred)}
          <span class="vpr-kv"><b>Metode:</b> ${esc(PRED_METHOD)}</span>
          <span class="vpr-kv"><b>Jendela:</b> ${esc(window)}</span>
        </div>
      </div>`;
    return ExecutiveSectionShell({
      title: 'Wawasan Armada',
      description: `${critical.length} kendaraan berisiko tinggi — prioritas tertinggi`,
      content: body,
    });
  }

  // ELEVATED — a watch insight (no critical yet).
  if (watch.length) {
    const top = watch[0];
    const { pred } = dominantRisk(top);
    const items = [
      `${watch.length} kendaraan menunjukkan tekanan yang meningkat.`,
      `Paling perlu dipantau: ${top.name}.`,
      `${available} dari ${total} kendaraan diproyeksikan tetap tersedia.`,
    ].map((r) => `<li class="vpr-insight__li">${esc(r)}</li>`).join('');
    const body = `<div class="vpr-insight vpr-insight--warn vpr-insight--click" data-vehicle-predict="${esc(top.id)}" tabindex="0" role="button" aria-label="Detail prediksi ${esc(top.name)}">
        <div class="vpr-insight__eye">Top Insight</div>
        <div class="vpr-insight__head">
          <span class="vpr-insight__ico">${anIcon('pulse', { size: 18 })}</span>
          <span class="vpr-insight__title">Pantau kesiapan armada</span>
        </div>
        <ul class="vpr-insight__list">${items}</ul>
        <div class="vpr-insight__foot">
          ${confPill(pred)}
          <span class="vpr-kv"><b>Metode:</b> ${esc(PRED_METHOD)}</span>
          <span class="vpr-kv"><b>Jendela:</b> ${esc(HORIZON_LABEL)}</span>
        </div>
      </div>`;
    return ExecutiveSectionShell({
      title: 'Wawasan Armada',
      description: 'Tekanan operasional meningkat — belum kritis',
      content: body,
    });
  }

  // HEALTHY — a calm positive Top Insight (highest-confidence findings).
  const items = [
    maint === 0 ? 'Tidak ada perawatan mendesak dalam jendela prediksi.' : `${maint} perawatan ringan terpantau — belum mendesak.`,
    `${available} dari ${total} kendaraan diproyeksikan siap periode berikutnya.`,
    `Keyakinan prediksi ${confWord(conf.level)} (${conf.score}%) — tren operasional sehat.`,
  ].map((r) => `<li class="vpr-insight__li">${esc(r)}</li>`).join('');
  const body = `<div class="vpr-insight vpr-insight--ok">
      <div class="vpr-insight__eye">Top Insight</div>
      <div class="vpr-insight__head">
        <span class="vpr-insight__ico">${anIcon('check', { size: 18 })}</span>
        <span class="vpr-insight__title">Armada beroperasi normal</span>
      </div>
      <ul class="vpr-insight__list">${items}</ul>
      <div class="vpr-insight__foot">
        <span class="vpr-kv"><b>Metode:</b> ${esc(PRED_METHOD)}</span>
        <span class="vpr-kv"><b>Jendela:</b> ${esc(HORIZON_LABEL)}</span>
      </div>
    </div>`;
  return ExecutiveSectionShell({
    title: 'Wawasan Armada',
    description: 'Temuan dengan keyakinan tertinggi',
    content: body,
  });
}

/* ── 5. MAINTENANCE FORECAST — prediction cards for every vehicle whose
   projection is elevated or worse. Each card exposes the reason plus an
   explainability foot (method + prediction window). Cards open the drawer. ── */

const RISK_TITLE = {
  maintenance: 'Perlu Perawatan',
  administrative: 'Dokumen Legal',
  availability: 'Risiko Ketersediaan',
};

function cardWindow(v) {
  const { kind } = dominantRisk(v);
  return kind === 'maintenance' && isCritical(v) ? '3 hari' : '7 hari';
}

function riskCard(v) {
  const { pred, kind } = dominantRisk(v);
  const tone = pred.tone || 'info';
  const reason = Array.isArray(pred.reasons) && pred.reasons.length ? pred.reasons[0] : (pred.summary || '');
  return `<div class="vpr-card vpr-card--click vpr-card--${esc(tone)}" data-vehicle-predict="${esc(v.id)}" tabindex="0" role="button" aria-label="Detail prediksi ${esc(v.name)}">
      <div class="vpr-card__top">
        <span class="vpr-card__title">${esc(RISK_TITLE[kind] || 'Risiko Operasional')}</span>
        ${confPill(pred)}
      </div>
      <div class="vpr-card__who">${esc(v.name)} · ${esc(pred.levelLabelId || '')}</div>
      <div class="vpr-card__reason">${esc(reason)}</div>
      <div class="vpr-card__foot">
        <span class="vpr-card__foot-l">Metode · ${esc(PRED_METHOD)}</span>
        <span class="vpr-card__foot-l">Jendela · ${esc(cardWindow(v))}</span>
      </div>
    </div>`;
}

function renderRisks(model) {
  const vehicles = (Array.isArray(model.vehicles) ? [...model.vehicles] : []).filter((v) => !isHealthy(v)).sort(byConcern);
  if (!vehicles.length) {
    return ExecutiveSectionShell({
      title: 'Prakiraan Perawatan',
      content: ExecutiveEmptyState({
        message: 'Prediction Engine tidak menemukan perawatan mendatang dalam jendela prediksi.',
        hint: 'Seluruh armada diproyeksikan tetap prima — tidak ada tindakan perawatan yang perlu dijadwalkan saat ini.',
      }),
    });
  }
  const cards = vehicles.slice(0, 6).map(riskCard).join('');
  return ExecutiveSectionShell({
    title: 'Prakiraan Perawatan',
    description: `${vehicles.length} kendaraan perlu dipantau`,
    content: `<div class="vpr-cards">${cards}</div>`,
  });
}

/* ── 6. RECOMMENDED ACTIONS — render the Prediction Service's own vehicle
   recommendations as large cards. Confidence is read from the SAME certified
   projection each recommendation was distilled from (join by vehicle). ─────── */

const ACTION_LABEL = { maintenance: 'Jadwalkan Perawatan', administrative: 'Perbarui Dokumen' };

function renderActions(model) {
  const recs = (Array.isArray(model.recommendations) ? model.recommendations : []).filter((r) => r.domain === 'vehicle');
  if (!recs.length) {
    return ExecutiveSectionShell({
      title: 'Tindakan yang Disarankan',
      content: ExecutiveEmptyState({
        message: 'Kondisi operasional saat ini tidak memerlukan intervensi.',
        hint: 'Prediction Engine tidak menyarankan tindakan armada — pertahankan pemantauan rutin.',
      }),
    });
  }
  // Join each recommendation to the vehicle projection it came from → confidence.
  const byName = new Map((Array.isArray(model.vehicles) ? model.vehicles : []).map((v) => [String(v.name), v]));
  const cards = recs.slice(0, 6).map((r) => {
    const v = byName.get(String(r.target));
    const src = v ? dominantRisk(v).pred : null;
    const tone = src && src.tone ? src.tone : 'info';
    const label = ACTION_LABEL[r.action] || 'Tindakan Operasional';
    const reason = Array.isArray(r.reasons) && r.reasons.length ? r.reasons[0] : '';
    const cls = `vpr-card vpr-card--${esc(tone)}${v ? ' vpr-card--click' : ''}`;
    const click = v ? ` data-vehicle-predict="${esc(v.id)}" tabindex="0" role="button" aria-label="Detail prediksi ${esc(r.target)}"` : '';
    const win = v ? cardWindow(v) : HORIZON_LABEL;
    return `<div class="${cls}"${click}>
        <div class="vpr-card__top">
          <span class="vpr-card__title">${esc(r.message)}</span>
          ${src ? confPill(src) : ExecutiveStatusPill('Keyakinan Sedang', 'info')}
        </div>
        <div class="vpr-card__who"><span class="vpr-card__foot-l">${esc(label)}</span> · ${esc(r.target)}</div>
        ${reason ? `<div class="vpr-card__reason">${esc(reason)}</div>` : ''}
        <div class="vpr-card__foot">
          <span class="vpr-card__foot-l">Metode · ${esc(PRED_METHOD)}</span>
          <span class="vpr-card__foot-l">Jendela · ${esc(win)}</span>
        </div>
      </div>`;
  }).join('');
  return ExecutiveSectionShell({
    title: 'Tindakan yang Disarankan',
    description: `${recs.length} tindakan prioritas`,
    content: `<div class="vpr-cards">${cards}</div>`,
  });
}

/* ── 7. PREDICTION TIMELINE — a horizon narrative (Today → 3 → 7 → 14 days) with
   a severity chip per milestone. It arranges the model's EXISTING certified
   outputs along near/mid/longer horizons; it fabricates NO per-horizon number. */

const SEVERITY_WORD = { ok: 'Aman', info: 'Stabil', warn: 'Waspada', danger: 'Kritis' };

function renderTimeline(model) {
  const vehicles = Array.isArray(model.vehicles) ? model.vehicles : [];
  const total = vehicles.length;
  const healthy = vehicles.filter(isHealthy).length;
  const critical = vehicles.filter(isCritical).length;
  const maint = vehicles.filter(maintenanceNeeded).length;
  const health = (model.executive && model.executive.overallHealth) || {};
  const opps = (model.executive && Array.isArray(model.executive.opportunities)) ? model.executive.opportunities : [];
  const vehicleOpp = opps.find((o) => o.domain === 'vehicle');

  const steps = [
    { when: 'Hari Ini', tone: health.tone || 'info',
      title: `Kesiapan ${health.levelLabelId || 'terkini'}`,
      detail: total ? `${healthy} dari ${total} kendaraan diproyeksikan prima.` : 'Belum ada kendaraan untuk diproyeksikan.' },
    { when: '3 Hari', tone: maint > 0 ? 'warn' : 'ok',
      title: maint > 0 ? 'Jadwalkan perawatan' : 'Tidak ada perawatan mendesak',
      detail: maint > 0 ? `${maint} kendaraan diproyeksikan perlu perawatan.` : 'Tidak ada kendaraan yang memerlukan perawatan segera.' },
    { when: '7 Hari', tone: critical > 0 ? 'danger' : 'ok',
      title: critical > 0 ? 'Risiko kesiapan meningkat' : 'Kesiapan terjaga',
      detail: critical > 0 ? `${critical} kendaraan diproyeksikan berisiko tinggi.` : 'Tidak ada kendaraan berisiko tinggi pada proyeksi ini.' },
    { when: '14 Hari', tone: vehicleOpp ? 'ok' : 'info',
      title: vehicleOpp ? 'Peluang optimasi' : 'Pantau tren',
      detail: vehicleOpp ? vehicleOpp.message : 'Lanjutkan pemantauan untuk menjaga kesiapan armada.' },
  ];
  const items = steps.map((s) => `<li class="daa-tl__li">
      <div class="daa-tl__rail"><span class="daa-tl__dot daa-tl__dot--${esc(s.tone)}"></span><span class="daa-tl__line"></span></div>
      <div class="daa-tl__body">
        <div class="daa-tl__top"><span class="daa-tl__when">${esc(s.when)}</span><span class="daa-tl__title">${esc(s.title)}</span><span class="vpr-tl-chip vpr-tl-chip--${esc(s.tone)}">${esc(SEVERITY_WORD[s.tone] || 'Stabil')}</span></div>
        <div class="daa-tl__d">${esc(s.detail)}</div>
      </div></li>`).join('');
  return ExecutiveSectionShell({
    title: 'Linimasa Prediksi',
    description: 'Evolusi proyeksi kesiapan armada dari hari ini hingga 14 hari',
    content: `<ul class="daa-tl">${items}</ul>`,
  });
}

/* ── 8. RISK RANKING — one executive table, one row per vehicle, ranked by
   projected concern. Richer operational columns (Availability, Risk, Prediction,
   Confidence, Recommendation, Window) — all from the certified model, no engine
   internals. Rows are clickable → open the enriched vehicle drawer. ────────── */

function renderDetail(model) {
  const vehicles = (Array.isArray(model.vehicles) ? [...model.vehicles] : []).sort(byConcern);
  if (!vehicles.length) {
    return ExecutiveSectionShell({ title: 'Peringkat Risiko', content: ExecutiveEmptyState({ message: 'Belum ada kendaraan untuk diproyeksikan.' }) });
  }
  const byName = new Map(); // vehicle name → recommendation message
  for (const r of (Array.isArray(model.recommendations) ? model.recommendations : [])) {
    if (r.domain === 'vehicle' && !byName.has(String(r.target))) byName.set(String(r.target), r.message);
  }
  const columns = [
    { key: 'vehicle', label: 'Kendaraan', primary: true },
    { key: 'availability', label: 'Ketersediaan', align: 'right', render: (v) => ExecutiveStatusPill(v.text, v.tone), sortValue: (v) => v.text },
    { key: 'risk', label: 'Risiko', align: 'right', render: (v) => ExecutiveStatusPill(v.text, v.tone), sortValue: (v) => v.text },
    { key: 'forecast', label: 'Proyeksi', align: 'right', render: (v) => ExecutiveStatusPill(v.text, v.tone), sortValue: (v) => v.text },
    { key: 'confidence', label: 'Keyakinan', align: 'right', render: (v) => ExecutiveStatusPill(v.text, v.tone), sortValue: (v) => v.text },
    { key: 'recommendation', label: 'Rekomendasi' },
    { key: 'window', label: 'Jendela', align: 'right' },
  ];
  const rows = vehicles.map((v) => {
    const { pred, kind } = dominantRisk(v);
    const af = v.availabilityForecast || {};
    const lvl = pred.confidenceLevel || 'LOW';
    const proyeksi = isCritical(v)
      ? (FORECAST_VERDICT[kind] || 'Perlu perhatian')
      : (isWatch(v) ? 'Pantau' : 'Siap');
    const proyeksiTone = isCritical(v) ? 'danger' : (isWatch(v) ? 'warn' : 'ok');
    return {
      id: String(v.id || v.name),
      clickable: true,
      rowLabel: `Detail prediksi ${v.name}`,
      vehicle: v.name,
      availability: { text: availableNext(v) ? 'Tersedia' : 'Berisiko', tone: af.tone || (availableNext(v) ? 'ok' : 'warn') },
      risk: { text: pred.levelLabelId || '—', tone: pred.tone || 'info' },
      forecast: { text: proyeksi, tone: proyeksiTone },
      confidence: { text: confWord(lvl), tone: CONF_TONE[lvl] || 'warn' },
      recommendation: byName.get(String(v.name)) || '—',
      window: cardWindow(v),
    };
  });
  return ExecutiveSectionShell({
    title: 'Peringkat Risiko',
    description: `${vehicles.length} kendaraan`,
    content: ExecutiveTable({ columns, rows, ariaLabel: 'Peringkat Risiko Kendaraan' }),
  });
}

/* ── empty / insufficient-data state ──────────────────────────────────────────
   When the service cannot certify a model, or confidence is LOW, or there is no
   vehicle to project, we DO NOT invent predictions — we state honestly that the
   data is insufficient. The hero still frames the page. ───────────────────── */

function renderInsufficient(hero) {
  return `${hero}
    ${ExecutiveSectionShell({
      title: 'Prediksi Belum Tersedia',
      content: ExecutiveEmptyState({
        message: 'Data saat ini belum cukup untuk menghasilkan proyeksi armada yang andal.',
        hint: 'Prediksi akan muncul setelah tersedia cukup data operasional kendaraan (kesehatan, status dokumen, dan perawatan).',
      }),
    })}`;
}

/* ── shared gate — the ONE place that reads the certified result ─────────────
   Both the render and the drawer-index helpers go through this so they always
   agree on when a projection is trustworthy enough to surface. */
function certifiedVehicleModel(input) {
  const result = getPrediction(input || {}); // the ONE service call per refresh
  const meta = result && result.metadata ? result.metadata : { predictionConfidence: { score: 0, level: 'LOW' }, generatedAt: null };
  const confidence = meta.predictionConfidence || { score: 0, level: 'LOW' };
  const model = result && result.model
    ? result.model
    : { generatedAt: meta.generatedAt, vehicles: [], executive: {}, recommendations: [] };
  const vehicles = Array.isArray(model.vehicles) ? model.vehicles : [];
  const ok = !!(result && result.ok && result.model && confidence.level !== 'LOW' && vehicles.length > 0);
  return { result, meta, confidence, model, vehicles, ok };
}

/* ── public render ────────────────────────────────────────────────────────── */

/**
 * Render the full Vehicle Prediction dashboard as an HTML string. Calls the
 * Prediction Service EXACTLY ONCE and renders the certified result. Never
 * throws (the service returns a structured result on any failure).
 * @param {Object} input aggregated platform models (the service input)
 * @returns {string}
 */
export function renderVehiclePredictionDashboard(input) {
  const ROOT = 'vpr daa exec-ui v2-analytics-claude';
  const { meta, confidence, model, ok } = certifiedVehicleModel(input);
  const metaCtx = { confidence, ...meta };
  const hero = renderHero(model, metaCtx);

  // Gate: never invent a forecast. If the model was not certified, confidence is
  // LOW, or there is no vehicle, present the honest insufficient-data state.
  if (!ok) {
    return `<div class="${ROOT}">${renderInsufficient(hero)}</div>`;
  }

  // Executive experience hierarchy (v1.19.5): the page answers "apa yang mungkin
  // terjadi pada kesiapan armada?" in <5s, then offers detail.
  return `<div class="${ROOT}">
    ${hero}
    ${renderStatus(model, metaCtx)}
    ${renderSummary(model)}
    ${renderInsight(model, metaCtx)}
    ${renderRisks(model)}
    ${renderActions(model)}
    ${renderTimeline(model)}
    ${renderDetail(model)}
  </div>`;
}

/**
 * Return the certified per-vehicle predictions keyed by vehicle id, for the
 * detail drawer. Consumes the SAME service (cached — a structurally-equal input
 * returns the same frozen result reference), so the drawer never touches an
 * engine either. When the model is not certified, `ok:false` and `byId` is empty
 * so callers open a plain drawer without inventing a projection.
 * @param {Object} input aggregated platform models (the service input)
 * @returns {{ ok: boolean, byId: Object<string, Object> }}
 */
export function getCertifiedVehiclePredictions(input) {
  const { ok, vehicles } = certifiedVehicleModel(input);
  const byId = {};
  if (ok) for (const v of vehicles) byId[String(v.id)] = v;
  return { ok, byId };
}

export default renderVehiclePredictionDashboard;
