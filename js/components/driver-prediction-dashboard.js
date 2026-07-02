/* ============================================================
   DRIVER-PREDICTION-DASHBOARD.JS — Driver Prediction (v1.19.4)

   The FIRST consumer of the Prediction Service. A premium executive render
   layer that answers ONE forward-looking question, top to bottom:

     "Apa yang mungkin terjadi pada kesiapan operasional driver
      dalam beberapa hari ke depan?"

   ── PRESENTATION ONLY ───────────────────────────────────────────────────────
   This file computes NO prediction. It renders whatever the Prediction Service
   already certified. It NEVER imports the prediction engine, validator, or
   provider — it consumes the service (getPrediction) and nothing else, so the UI
   stays completely decoupled from every prediction implementation. Business
   output is byte-identical; only the presentation exists here.

   ── DATA SOURCE (the single gateway) ────────────────────────────────────────
   renderDriverPredictionDashboard(input) calls predictionService.getPrediction()
   EXACTLY ONCE, then renders the returned, deep-frozen PredictionResult. The
   caller (app.js) passes the aggregated platform models as the service INPUT; it
   never touches an engine either.

   ── EXPLAINABILITY / CONFIDENCE ─────────────────────────────────────────────
   Every prediction surfaced here shows its plain-language REASON + SUMMARY and a
   CONFIDENCE band (Tinggi / Sedang / Rendah). Internal evidence — signals,
   weights, rules, validator terminology, confidence maths — is NEVER exposed.

   ── DESIGN AUTHORITY ────────────────────────────────────────────────────────
   Driver Prediction is a SIBLING of Analytics Driver, Dispatch Analytics,
   Recommendation Accuracy, Driver Wellness and Executive Analytics. It consumes
   the SAME Executive UI Kit (ExecutiveHeader/KPICard/Grid/SectionShell/Table/
   StatusPill/EmptyState + the one icon engine) and reuses the SHARED `.daa-*`
   micro-viz owned by Dispatch Analytics (hero stat band, status verdict,
   spotlight, timeline). The only net-new CSS is a small `.dpr-*` supplement for
   the prediction risk / action cards, plus the `danger` status tone.

   Page structure (v1.19.4):
     Hero → Prediction Status → Prediction Summary → Driver Forecast →
     Upcoming Risks → Recommended Actions → Prediction Timeline → Prediction Detail

   API:
     injectDriverPredictionStyles()                          — idempotent <style>
     renderDriverPredictionDashboard(input, opts) → string    — full dashboard HTML
   ============================================================ */

'use strict';

import { getPrediction } from '../services/prediction-service.js';
import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
import {
  ExecutiveHeader,
  ExecutiveKPICard,
  ExecutiveKPIGrid,
  ExecutiveSectionShell,
  ExecutiveTable,
  ExecutiveStatusPill,
  ExecutiveEmptyState,
  anIcon,
  escHtml as esc,
} from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'dpr-dashboard-styles';

/* The ONLY shapes Driver Prediction adds beyond the shared `.daa-*` system: the
   `danger` Executive-Status tone (a "Perlu Penyesuaian Jadwal" verdict) and the
   prediction card grammar used by Upcoming Risks + Recommended Actions. Kept
   deliberately small — everything else reuses the sibling design language. */
const CSS = `
.daa-status--danger{border-left-color:var(--danger);background:var(--danger-bg);}
.daa-status--danger .daa-status__level{color:var(--danger);}
.dpr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1rem;}
.dpr-card{border:1px solid var(--border);border-radius:14px;background:var(--surface-2);
  padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.45rem;}
.dpr-card--ok{border-left:3px solid var(--ok);}
.dpr-card--info{border-left:3px solid var(--info);}
.dpr-card--warn{border-left:3px solid var(--warn);}
.dpr-card--danger{border-left:3px solid var(--danger);}
.dpr-card__top{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.dpr-card__title{font-size:.92rem;font-weight:800;letter-spacing:-.01em;color:var(--text);line-height:1.2;}
.dpr-card__who{font-size:.74rem;font-weight:700;color:var(--muted);}
.dpr-card__reason{font-size:.8rem;color:var(--muted);line-height:1.5;}
.dpr-card__foot-l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
`;

/** Inject the supplement (and ensure the shared `.daa-*` styles exist). */
export function injectDriverPredictionStyles() {
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

/* Which of a driver's two risks is the dominant (most severe) projection. The
   engine already scored both — this only PICKS the higher one for the headline,
   it computes no new risk. */
const RISK_ORDER = { LOW: 0, MODERATE: 1, ELEVATED: 2, HIGH: 3, CRITICAL: 4 };
function dominantRisk(d) {
  const f = d.fatigueRisk || {}; const a = d.availabilityRisk || {};
  const fS = Number(f.score) || 0; const aS = Number(a.score) || 0;
  const dom = aS > fS ? a : f;
  return { pred: dom, kind: dom === a ? 'availability' : 'fatigue' };
}
function isAtRisk(d) {
  const { pred } = dominantRisk(d);
  return d.recoveryRecommended === true || pred.level === 'HIGH' || pred.level === 'CRITICAL';
}
function isWatch(d) {
  const { pred } = dominantRisk(d);
  return !isAtRisk(d) && pred.level === 'ELEVATED';
}
function isStable(d) { return !isAtRisk(d) && !isWatch(d); }

/* Sort drivers by projected concern, most-in-need first (deterministic). */
function byConcern(a, b) {
  const ra = dominantRisk(a).pred; const rb = dominantRisk(b).pred;
  const rec = (b.recoveryRecommended === true) - (a.recoveryRecommended === true);
  if (rec) return rec;
  return (Number(rb.score) || 0) - (Number(ra.score) || 0)
    || String(a.name).localeCompare(String(b.name));
}

/* ── 1. HERO — title, one readiness verdict subtitle, and a band that leads with
   the Prediction Confidence. No icon; the numbers carry the forecast message. ── */

function renderHero(model, meta) {
  const drivers = Array.isArray(model.drivers) ? model.drivers : [];
  const total = drivers.length;
  const stable = drivers.filter(isStable).length;
  const attention = total - stable;
  const conf = meta.confidence; // { score, level }
  const subtitle = total === 0
    ? 'Belum ada driver untuk diproyeksikan.'
    : conf.level === 'HIGH'
      ? 'Keyakinan prediksi tinggi — proyeksi kesiapan dapat diandalkan.'
      : conf.level === 'MEDIUM'
        ? 'Keyakinan prediksi sedang — proyeksi kesiapan bersifat indikatif.'
        : 'Keyakinan prediksi rendah — data belum cukup untuk proyeksi yang andal.';

  const stat = (v, l) => `<div class="daa-hero-stat"><span class="daa-hero-stat__v">${esc(v)}</span><span class="daa-hero-stat__l">${esc(l)}</span></div>`;
  const band = `<div class="daa-hero-stats">
      ${stat(`${conf.score}%`, 'keyakinan prediksi')}
      ${stat(stable, 'driver stabil')}
      ${stat(attention, 'perlu perhatian')}
    </div>`;
  return ExecutiveHeader({
    title: 'Driver Prediction',
    subtitle,
    meta: `Diperbarui ${fmtTime(model.generatedAt)} · ${total} driver · proyeksi 7 hari`,
  }) + band;
}

/* ── 2. PREDICTION STATUS — one premium verdict card. It states a single
   readiness status and one operational sentence, driven by the model's own
   overall risk band (tone only) and the driver counts (no new analytics). ──── */

function renderStatus(model) {
  const drivers = Array.isArray(model.drivers) ? model.drivers : [];
  const total = drivers.length;
  const atRisk = drivers.filter(isAtRisk).length;
  const watch = drivers.filter(isWatch).length;
  const recovery = drivers.filter((d) => d.recoveryRecommended === true).length;
  const exec = (model.executive && model.executive.overallRisk) || {};
  const lvl = exec.level || 'LOW';

  let tone, level, msg;
  if (atRisk === 0 && watch === 0) {
    tone = 'good'; level = 'Operasional Stabil';
    msg = total
      ? `Seluruh ${total} driver diproyeksikan siap untuk operasional beberapa hari ke depan.`
      : 'Belum ada driver untuk diproyeksikan.';
  } else if (lvl === 'HIGH' || lvl === 'CRITICAL' || atRisk > 0) {
    tone = 'danger'; level = 'Perlu Penyesuaian Jadwal';
    msg = `${atRisk} driver berisiko tinggi dan ${recovery} memerlukan pemulihan — sesuaikan jadwal dalam beberapa hari ke depan.`;
  } else {
    tone = 'warn'; level = 'Risiko Operasional Meningkat';
    msg = `${watch} driver menunjukkan tekanan yang meningkat — pantau kesiapan menjelang proyeksi 7 hari.`;
  }
  return `<div class="daa-status daa-status--${tone}">
      <div class="daa-status__eye">Status Prediksi</div>
      <div class="daa-status__level">${esc(level)}</div>
      <div class="daa-status__msg">${esc(msg)}</div>
    </div>`;
}

/* ── 3. PREDICTION SUMMARY — exactly four executive cards, operational language
   only. Each value is a tally of the engine's already-certified per-driver
   projections — no new metric is invented. ──────────────────────────────────── */

function renderSummary(model) {
  const drivers = Array.isArray(model.drivers) ? model.drivers : [];
  const total = drivers.length;
  const stable = drivers.filter(isStable).length;
  const atRisk = drivers.filter(isAtRisk).length;
  const recovery = drivers.filter((d) => d.recoveryRecommended === true).length;
  const available = drivers.filter((d) => {
    const lvl = (d.availabilityRisk || {}).level;
    return lvl === 'LOW' || lvl === 'MODERATE';
  }).length;

  const cards = [
    ExecutiveKPICard({ title: 'Driver Stabil', value: `${stable}${total ? ` / ${total}` : ''}`, subtitle: 'Diproyeksikan siap untuk operasional', icon: anIcon('check', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Driver Berisiko', value: String(atRisk), subtitle: 'Risiko tinggi pada proyeksi beberapa hari', icon: anIcon('alert', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Perlu Pemulihan', value: String(recovery), subtitle: 'Disarankan istirahat / rotasi dalam waktu dekat', icon: anIcon('pulse', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Proyeksi Ketersediaan', value: `${available}${total ? ` / ${total}` : ''}`, subtitle: 'Diproyeksikan tersedia periode berikutnya', icon: anIcon('user', { size: 15 }) }),
  ];
  return ExecutiveSectionShell({ title: 'Ringkasan Prediksi', content: ExecutiveKPIGrid(cards) });
}

/* ── 4. DRIVER FORECAST — a premium spotlight on the single driver most in need
   of attention: large name, a large forecast verdict, then confidence, reason
   and the forecast window. Signals / weights / rules are never shown. ───────── */

function renderForecast(model) {
  const drivers = (Array.isArray(model.drivers) ? [...model.drivers] : []).sort(byConcern);
  if (!drivers.length) {
    return ExecutiveSectionShell({ title: 'Proyeksi Driver', content: ExecutiveEmptyState({ message: 'Belum ada driver untuk diproyeksikan.' }) });
  }
  const top = drivers[0];
  const { pred, kind } = dominantRisk(top);
  const recovery = top.recoveryRecommended === true;
  const window = recovery ? '3 hari' : '7 hari';
  const forecast = recovery
    ? 'Perlu pemulihan'
    : (pred.level === 'HIGH' || pred.level === 'CRITICAL')
      ? (kind === 'fatigue' ? 'Risiko kelelahan' : 'Ketersediaan menurun')
      : 'Diproyeksikan siap';
  const lead = recovery
    ? `Diproyeksikan memerlukan hari pemulihan dalam ${window} ke depan.`
    : (pred.level === 'HIGH' || pred.level === 'CRITICAL')
      ? `Diproyeksikan memerlukan perhatian dalam ${window} ke depan.`
      : `Diproyeksikan tetap siap untuk operasional dalam ${window} ke depan.`;
  const reason = Array.isArray(pred.reasons) && pred.reasons.length ? pred.reasons[0] : (pred.summary || '');

  const spot = `<div class="daa-spot">
      <div class="daa-spot__eye">Paling Perlu Perhatian</div>
      <div class="daa-spot__name">${esc(top.name)}</div>
      <div class="daa-spot__score"><span class="daa-spot__score-v">${esc(forecast)}</span><span class="daa-spot__score-l">proyeksi ${esc(window)}</span></div>
      <div class="daa-spot__meta">${esc(lead)} ${confPill(pred)}</div>
      <div class="daa-spot__meta"><b>Alasan:</b> ${esc(reason)}</div>
    </div>`;
  return ExecutiveSectionShell({
    title: 'Proyeksi Driver',
    description: 'Driver dengan proyeksi kesiapan paling menuntut perhatian',
    content: spot,
  });
}

/* ── 5. UPCOMING RISKS — prediction cards for every driver whose projection is
   elevated or worse. Operational language only: risk type, driver, confidence,
   and the plain-language reason. ────────────────────────────────────────────── */

const RISK_TITLE = { fatigue: 'Risiko Kelelahan', availability: 'Risiko Ketersediaan' };

function renderRisks(model) {
  const drivers = (Array.isArray(model.drivers) ? [...model.drivers] : []).filter((d) => !isStable(d)).sort(byConcern);
  if (!drivers.length) {
    return ExecutiveSectionShell({
      title: 'Risiko Mendatang',
      content: ExecutiveEmptyState({ message: 'Tidak ada risiko menonjol pada proyeksi saat ini.' }),
    });
  }
  const cards = drivers.slice(0, 6).map((d) => {
    const { pred, kind } = dominantRisk(d);
    const tone = pred.tone || 'info';
    const reason = Array.isArray(pred.reasons) && pred.reasons.length ? pred.reasons[0] : (pred.summary || '');
    return `<div class="dpr-card dpr-card--${esc(tone)}">
        <div class="dpr-card__top">
          <span class="dpr-card__title">${esc(RISK_TITLE[kind] || 'Risiko Operasional')}</span>
          ${confPill(pred)}
        </div>
        <div class="dpr-card__who">${esc(d.name)} · ${esc(pred.levelLabelId || '')}</div>
        <div class="dpr-card__reason">${esc(reason)}</div>
      </div>`;
  }).join('');
  return ExecutiveSectionShell({
    title: 'Risiko Mendatang',
    description: `${drivers.length} driver perlu dipantau`,
    content: `<div class="dpr-cards">${cards}</div>`,
  });
}

/* ── 6. RECOMMENDED ACTIONS — render the Prediction Service's own driver
   recommendations as large cards. Confidence is read from the SAME certified
   projection each recommendation was distilled from (join by driver), so a
   confidence band is always shown. ─────────────────────────────────────────── */

const ACTION_LABEL = { recovery: 'Rotasi / Pemulihan', 'redistribute': 'Distribusi Ulang', workload: 'Kurangi Beban' };

function renderActions(model) {
  const recs = (Array.isArray(model.recommendations) ? model.recommendations : []).filter((r) => r.domain === 'driver');
  if (!recs.length) {
    return ExecutiveSectionShell({
      title: 'Tindakan yang Disarankan',
      content: ExecutiveEmptyState({ message: 'Belum ada tindakan yang perlu disarankan.' }),
    });
  }
  // Join each recommendation to the driver projection it came from → confidence.
  const byName = new Map((Array.isArray(model.drivers) ? model.drivers : []).map((d) => [String(d.name), d]));
  const cards = recs.slice(0, 6).map((r) => {
    const d = byName.get(String(r.target));
    const src = d ? dominantRisk(d).pred : null;
    const tone = src && src.tone ? src.tone : 'info';
    const label = ACTION_LABEL[r.action] || 'Tindakan Operasional';
    const reason = Array.isArray(r.reasons) && r.reasons.length ? r.reasons[0] : '';
    return `<div class="dpr-card dpr-card--${esc(tone)}">
        <div class="dpr-card__top">
          <span class="dpr-card__title">${esc(r.message)}</span>
          ${src ? confPill(src) : ExecutiveStatusPill('Keyakinan Sedang', 'info')}
        </div>
        <div class="dpr-card__who"><span class="dpr-card__foot-l">${esc(label)}</span> · ${esc(r.target)}</div>
        ${reason ? `<div class="dpr-card__reason">${esc(reason)}</div>` : ''}
      </div>`;
  }).join('');
  return ExecutiveSectionShell({
    title: 'Tindakan yang Disarankan',
    description: `${recs.length} tindakan prioritas`,
    content: `<div class="dpr-cards">${cards}</div>`,
  });
}

/* ── 7. PREDICTION TIMELINE — a horizon narrative (Today → 3 → 7 → 14 days). It
   arranges the model's EXISTING certified outputs (driver counts, recovery
   flags, opportunities) along near/mid/longer horizons; it fabricates NO
   per-horizon number. A timeline, not a chart. ─────────────────────────────── */

function renderTimeline(model) {
  const drivers = Array.isArray(model.drivers) ? model.drivers : [];
  const total = drivers.length;
  const stable = drivers.filter(isStable).length;
  const atRisk = drivers.filter(isAtRisk).length;
  const recovery = drivers.filter((d) => d.recoveryRecommended === true).length;
  const health = (model.executive && model.executive.overallHealth) || {};
  const opps = (model.executive && Array.isArray(model.executive.opportunities)) ? model.executive.opportunities : [];
  const driverOpp = opps.find((o) => o.domain === 'driver');

  const steps = [
    { when: 'Hari Ini', tone: health.tone || 'info',
      title: `Kesiapan ${health.levelLabelId || 'terkini'}`,
      detail: total ? `${stable} dari ${total} driver diproyeksikan stabil.` : 'Belum ada driver untuk diproyeksikan.' },
    { when: '3 Hari', tone: recovery > 0 ? 'warn' : 'ok',
      title: recovery > 0 ? 'Jadwalkan pemulihan' : 'Tidak ada pemulihan mendesak',
      detail: recovery > 0 ? `${recovery} driver disarankan istirahat / rotasi.` : 'Tidak ada driver yang memerlukan pemulihan segera.' },
    { when: '7 Hari', tone: atRisk > 0 ? 'danger' : 'ok',
      title: atRisk > 0 ? 'Risiko kesiapan meningkat' : 'Kesiapan terjaga',
      detail: atRisk > 0 ? `${atRisk} driver diproyeksikan berisiko tinggi.` : 'Tidak ada driver berisiko tinggi pada proyeksi ini.' },
    { when: '14 Hari', tone: driverOpp ? 'ok' : 'info',
      title: driverOpp ? 'Peluang optimasi' : 'Pantau tren',
      detail: driverOpp ? driverOpp.message : 'Lanjutkan pemantauan untuk menjaga kesiapan armada.' },
  ];
  const items = steps.map((s) => `<li class="daa-tl__li">
      <div class="daa-tl__rail"><span class="daa-tl__dot daa-tl__dot--${esc(s.tone)}"></span><span class="daa-tl__line"></span></div>
      <div class="daa-tl__body">
        <div class="daa-tl__top"><span class="daa-tl__when">${esc(s.when)}</span><span class="daa-tl__title">${esc(s.title)}</span></div>
        <div class="daa-tl__d">${esc(s.detail)}</div>
      </div></li>`).join('');
  return ExecutiveSectionShell({
    title: 'Linimasa Prediksi',
    description: 'Evolusi proyeksi kesiapan dari hari ini hingga 14 hari',
    content: `<ul class="daa-tl">${items}</ul>`,
  });
}

/* ── 8. PREDICTION DETAIL — one executive table, one row per driver. Operational
   columns only (no signals, weights, or engine internals). ─────────────────── */

function renderDetail(model) {
  const drivers = (Array.isArray(model.drivers) ? [...model.drivers] : []).sort(byConcern);
  if (!drivers.length) {
    return ExecutiveSectionShell({ title: 'Rincian Prediksi', content: ExecutiveEmptyState({ message: 'Belum ada driver untuk diproyeksikan.' }) });
  }
  const byName = new Map(); // driver name → recommendation message
  for (const r of (Array.isArray(model.recommendations) ? model.recommendations : [])) {
    if (r.domain === 'driver' && !byName.has(String(r.target))) byName.set(String(r.target), r.message);
  }
  const columns = [
    { key: 'driver', label: 'Driver', primary: true },
    { key: 'forecast', label: 'Proyeksi', align: 'right', render: (v) => ExecutiveStatusPill(v.text, v.tone) },
    { key: 'confidence', label: 'Keyakinan', align: 'right', render: (v) => ExecutiveStatusPill(v.text, v.tone) },
    { key: 'recommendation', label: 'Rekomendasi' },
    { key: 'window', label: 'Jendela Prediksi', align: 'right' },
  ];
  const rows = drivers.map((d) => {
    const { pred } = dominantRisk(d);
    const recovery = d.recoveryRecommended === true;
    const lvl = pred.confidenceLevel || 'LOW';
    return {
      id: String(d.id || d.name),
      driver: d.name,
      forecast: { text: pred.levelLabelId || '—', tone: pred.tone || 'info' },
      confidence: { text: confWord(lvl), tone: CONF_TONE[lvl] || 'warn' },
      recommendation: byName.get(String(d.name)) || '—',
      window: recovery ? '3 hari' : '7 hari',
    };
  });
  return ExecutiveSectionShell({
    title: 'Rincian Prediksi',
    description: `${drivers.length} driver`,
    content: ExecutiveTable({ columns, rows, ariaLabel: 'Rincian Prediksi Driver' }),
  });
}

/* ── empty / insufficient-data state ──────────────────────────────────────────
   When the service cannot certify a model, or confidence is LOW, or there is no
   driver to project, we DO NOT invent predictions — we state honestly that the
   data is insufficient. The hero still frames the page. ───────────────────── */

function renderInsufficient(hero) {
  return `${hero}
    ${ExecutiveSectionShell({
      title: 'Prediksi Belum Tersedia',
      content: ExecutiveEmptyState({
        message: 'Data saat ini belum cukup untuk menghasilkan proyeksi yang andal.',
        hint: 'Prediksi akan muncul setelah tersedia cukup riwayat operasional driver (penugasan, kelelahan, dan pemulihan).',
      }),
    })}`;
}

/* ── public render ────────────────────────────────────────────────────────── */

/**
 * Render the full Driver Prediction dashboard as an HTML string. Calls the
 * Prediction Service EXACTLY ONCE and renders the certified result. Never
 * throws (the service returns a structured result on any failure).
 * @param {Object} input aggregated platform models (the service input)
 * @returns {string}
 */
export function renderDriverPredictionDashboard(input) {
  const ROOT = 'dpr daa exec-ui v2-analytics-claude';
  const result = getPrediction(input || {}); // the ONE service call per refresh
  const meta = result && result.metadata ? result.metadata : { predictionConfidence: { score: 0, level: 'LOW' }, generatedAt: null };
  const confidence = meta.predictionConfidence || { score: 0, level: 'LOW' };
  const model = result && result.model
    ? result.model
    : { generatedAt: meta.generatedAt, drivers: [], executive: {}, recommendations: [] };
  const hero = renderHero(model, { confidence, ...meta });

  // Gate: never invent a forecast. If the model was not certified, confidence is
  // LOW, or there is no driver, present the honest insufficient-data state.
  const drivers = Array.isArray(model.drivers) ? model.drivers : [];
  if (!result || !result.ok || !result.model || confidence.level === 'LOW' || drivers.length === 0) {
    return `<div class="${ROOT}">${renderInsufficient(hero)}</div>`;
  }

  // Executive experience hierarchy (v1.19.4): the page answers "apa yang mungkin
  // terjadi pada kesiapan operasional driver?" in <5s, then offers detail.
  return `<div class="${ROOT}">
    ${hero}
    ${renderStatus(model)}
    ${renderSummary(model)}
    ${renderForecast(model)}
    ${renderRisks(model)}
    ${renderActions(model)}
    ${renderTimeline(model)}
    ${renderDetail(model)}
  </div>`;
}

export default renderDriverPredictionDashboard;
