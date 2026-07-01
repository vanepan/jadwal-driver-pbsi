/* ============================================================
   EXECUTIVE-DASHBOARD.JS — Executive Analytics (v1.18.8)

   The executive HOME PAGE for the entire Sarpras Operations platform. It is
   NOT another analytics page: it answers ONE question, within five seconds —

     "Bagaimana kondisi operasional hari ini?"

   Everything on the page supports that question; nothing else is here.

   ── PRESENTATION ONLY ───────────────────────────────────────────────────────
   This file computes NOTHING. It receives an aggregate model whose every value
   was produced by an EXISTING engine (the Operational Health Score from
   computeExecutiveAnalytics, plus the Dispatch Analytics, Recommendation
   Accuracy, Driver Wellness and Fleet Asset models) and turns those outputs
   into an operational briefing. No new scoring, prediction, or business logic;
   no duplicated calculation.

   ── DESIGN AUTHORITY ────────────────────────────────────────────────────────
   Executive Analytics is the design authority for executive reporting. It is a
   SIBLING of Analytics Driver, Dispatch Analytics, Recommendation Accuracy and
   Driver Wellness and speaks the SAME Executive UI Kit as its only design
   language (ExecutiveHeader, ExecutiveKPICard/Grid, ExecutiveSectionShell,
   ExecutiveStatusPill, ExecutiveEmptyState, the one icon engine). The inner
   micro-viz that has no kit primitive — the hero stat band, the Executive
   Status verdict, the spotlight and the event feed — reuses the SHARED `.daa-*`
   classes owned by Dispatch Analytics (injected via injectDispatchAnalyticsStyles).
   The only net-new shapes are the domain-overview grid and the premium quick-
   navigation cards (`.exa-*`), which no sibling had before.

   Page structure (v1.18.8):
     Hero → Executive Status → Executive KPI → Today's Highlights →
     Operational Overview → Executive Spotlight → Quick Navigation.

   Every dynamic value is HTML-escaped and emoji-free, matching the sibling
   executive vocabulary. The language reads like an operational briefing — no
   developer, AI, technical, engineering, or medical wording.

   API:
     injectExecutiveDashboardStyles()                  — idempotent <style>
     renderExecutiveDashboard(model) → string          — full dashboard HTML
   Quick-navigation cards are `data-exa-nav="<key>"` buttons; the host routes
   the click to the matching page (one-click navigation).
   ============================================================ */

'use strict';

import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
import {
  ExecutiveHeader,
  ExecutiveToolbar,
  ExecutiveKPICard,
  ExecutiveKPIGrid,
  ExecutiveSectionShell,
  ExecutiveStatusPill,
  ExecutiveEmptyState,
  anIcon,
} from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'exa-dashboard-styles';

/* The ONLY shapes Executive Analytics adds beyond the shared `.daa-*` system:
   the `danger` Executive-Status tone (Dispatch only ever needed good/info/warn),
   the domain-overview grid, and the premium quick-navigation cards. All colours
   come from the platform tokens (dark-mode safe — no hard-coded #fff). */
const CSS = `
.daa-status--danger{border-left-color:var(--danger);background:var(--danger-bg);}
.daa-status--danger .daa-status__level{color:var(--danger);}

/* Operational Overview — one calm card per domain answering "Apakah semuanya baik?" */
.exa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;}
.exa-dom{border:1px solid var(--border);border-radius:14px;padding:1rem 1.1rem;background:var(--surface-2);
  display:flex;flex-direction:column;gap:.5rem;}
.exa-dom__head{display:flex;align-items:center;justify-content:space-between;gap:.6rem;}
.exa-dom__name{display:flex;align-items:center;gap:.5rem;font-size:.86rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.exa-dom__ico{display:inline-flex;color:var(--muted);}
.exa-dom__line{font-size:.76rem;color:var(--muted);line-height:1.4;}

/* Quick Navigation — premium one-click cards to every executive page. */
.exa-nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;}
.exa-nav__card{display:flex;align-items:center;gap:.85rem;text-align:left;width:100%;
  border:1px solid var(--border);border-radius:16px;padding:1.05rem 1.15rem;background:var(--surface);
  cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease;
  font:inherit;color:inherit;}
.exa-nav__card:hover{transform:translateY(-2px);border-color:var(--info);box-shadow:0 10px 28px -18px rgba(0,0,0,.45);}
.exa-nav__card:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.exa-nav__ico{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:2.4rem;height:2.4rem;border-radius:12px;background:var(--info-bg);color:var(--info);}
.exa-nav__tx{display:flex;flex-direction:column;gap:.12rem;min-width:0;}
.exa-nav__t{font-size:.88rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.exa-nav__s{font-size:.72rem;color:var(--muted);line-height:1.35;}
.exa-nav__go{margin-left:auto;flex:0 0 auto;color:var(--muted);opacity:.7;}
`;

/** Inject the supplement (and ensure the shared .daa-* styles exist). Idempotent. */
export function injectExecutiveDashboardStyles() {
  injectDispatchAnalyticsStyles();
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ── escaping + formatting ────────────────────────────────────────────── */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round(v) { return Math.round(num(v)); }
function pct(v) { return `${round(v)}%`; }
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
/** Compact Indonesian Rupiah — reads at a glance in a KPI cell. */
function rpCompact(v) {
  const n = num(v);
  if (n === 0) return 'Rp 0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `Rp ${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)} M`;
  if (abs >= 1e6) return `Rp ${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)} Jt`;
  if (abs >= 1e3) return `Rp ${Math.round(n / 1e3)} Rb`;
  return `Rp ${Math.round(n)}`;
}
/** Map an existing 0–100 score to a pill tone. PRESENTATION ONLY — this chooses
 *  a colour for a number the engine already produced; it computes no score. */
function toneFromScore(n) {
  const s = num(n);
  if (s >= 70) return 'ok';
  if (s >= 55) return 'info';
  if (s >= 40) return 'warn';
  return 'danger';
}

/* ── safe model accessors (every field below is an existing engine output) ─
   Exported (pick / verdict / buildHighlights) so the Executive Report exporter
   projects the SAME derived values — one source, no duplicated logic. */

export function pick(model) {
  const exec = model.exec || null;
  return {
    exec,
    score: (exec && exec.score) || null,
    driverKpis: (exec && exec.driverKpis) || {},
    pettyKpis: (exec && exec.pettyKpis) || {},
    pettyHealth: (exec && exec.pettyHealth) || null,
    dispatchKpi: (model.dispatch && model.dispatch.kpi) || {},
    recKpi: (model.recommendation && model.recommendation.kpi) || {},
    recDrivers: (model.recommendation && model.recommendation.driverAccuracy && model.recommendation.driverAccuracy.rows) || [],
    wellness: (model.wellness && model.wellness.summary) || {},
    wellnessDrivers: (model.wellness && Array.isArray(model.wellness.drivers)) ? model.wellness.drivers : [],
    fleet: (model.fleet && model.fleet.dashboard) || {},
    hasPetty: !!model.petty,
  };
}

/** The single operational verdict — read straight from the Operational Health
 *  Score (computeExecutiveAnalytics). No new status is computed; the engine's
 *  own level/label/tone drives the card. Falls back to fleet-wide readiness only
 *  so the page still renders when the score is unavailable. */
export function verdict(d) {
  if (d.score && d.score.value != null) {
    const tone = d.score.tone === 'green' ? 'good' : d.score.tone === 'crit' ? 'danger' : 'warn';
    return { tone, level: d.score.label || '—', value: d.score.value };
  }
  // Fallback: fleet readiness average (still an existing engine number).
  const h = num(d.fleet.healthAvg);
  const tone = h >= 70 ? 'good' : h >= 40 ? 'warn' : 'danger';
  return { tone, level: d.fleet.healthLabel || 'Belum Ada Data', value: d.score ? d.score.value : null };
}

/* ── 1. HERO — title, one concise verdict subtitle, and a band of three headline
   figures. No icon, no technical explanation; the numbers carry the message. ─ */

function renderHero(model, d, v) {
  const subtitle = v.tone === 'good'
    ? 'Operasional berjalan normal.'
    : v.tone === 'warn'
      ? 'Beberapa area memerlukan perhatian.'
      : 'Beberapa area memerlukan perhatian segera.';

  const total = num(d.wellness.driverCount);
  const healthy = num(d.wellness.healthyDrivers);
  const activeVeh = num(d.fleet.active);
  const scoreTxt = (d.score && d.score.value != null) ? String(round(d.score.value)) : '—';

  const stat = (val, lbl) => `<div class="daa-hero-stat"><span class="daa-hero-stat__v">${esc(val)}</span><span class="daa-hero-stat__l">${esc(lbl)}</span></div>`;
  const band = `<div class="daa-hero-stats">
      ${stat(scoreTxt, 'skor operasional')}
      ${stat(total ? `${healthy}/${total}` : '—', 'driver siap bertugas')}
      ${stat(activeVeh || '—', 'kendaraan aktif')}
    </div>`;

  // Export buttons — the printable Executive Report (PDF | Excel). Same
  // `exec-reset` grammar + `download` glyph the siblings use; the host binds the
  // data-exa-export contract and runs the registered exporter.
  const exportBtns =
    `<button type="button" class="exec-reset" data-exa-export="pdf" aria-label="Unduh laporan PDF">${anIcon('download', { size: 14 })}PDF</button>` +
    `<button type="button" class="exec-reset" data-exa-export="excel" aria-label="Unduh laporan Excel">${anIcon('download', { size: 14 })}Excel</button>`;

  return ExecutiveHeader({
    title: 'Executive Analytics',
    subtitle,
    meta: `Diperbarui ${fmtTime(model.generatedAt)}`,
  }) + band + ExecutiveToolbar({ right: exportBtns });
}

/* ── 2. EXECUTIVE STATUS — ONE large verdict card. One level word, one sentence.
   No checklist. The sentence reuses the executive narrative the engine already
   wrote (or a calm default when it is absent). ────────────────────────────── */

function renderStatus(d, v) {
  // One verdict-coherent sentence. The cross-domain verdict is operational, so a
  // tone-matched line (not the driver/petty-specific engine narrative) always
  // reads in step with the level word above it.
  const msg = v.tone === 'good'
    ? 'Seluruh indikator operasional berada dalam kondisi yang sehat hari ini.'
    : v.tone === 'warn'
      ? 'Sebagian besar operasional berjalan baik; beberapa area memerlukan perhatian.'
      : 'Beberapa area operasional memerlukan tindak lanjut segera.';
  return `<div class="daa-status daa-status--${v.tone}">
      <div class="daa-status__eye">Status Operasional Hari Ini</div>
      <div class="daa-status__level">${esc(v.level)}</div>
      <div class="daa-status__msg">${esc(msg)}</div>
    </div>`;
}

/* ── 3. EXECUTIVE KPI — six indicators in operational language. Every value is an
   existing engine output; every subtitle states the business meaning. ─────── */

function renderKpis(d) {
  const total = num(d.wellness.driverCount);
  const healthy = num(d.wellness.healthyDrivers);
  const activeVeh = num(d.fleet.active);
  const totalVeh = num(d.fleet.totalAssets);
  const maint = num(d.fleet.maintenance);
  const acceptance = d.recKpi.acceptanceRate != null ? d.recKpi.acceptanceRate : d.dispatchKpi.recommendationAcceptance;
  const scoreVal = (d.score && d.score.value != null) ? String(round(d.score.value)) : '—';
  const scoreSub = (d.score && d.score.label) ? d.score.label : 'Kesehatan operasional (0–100)';
  const pettyVal = d.hasPetty ? rpCompact(d.pettyKpis.consumedSpend || d.pettyKpis.actualBurnYtd) : '—';

  const cards = [
    ExecutiveKPICard({ title: 'Driver Siap Bertugas', value: total ? `${healthy} / ${total}` : '—', subtitle: 'Kondisi sehat untuk operasional', icon: anIcon('check', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Penerimaan Rekomendasi', value: acceptance == null ? '—' : pct(acceptance), subtitle: 'Rekomendasi diterima tanpa perubahan', icon: anIcon('target', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Kendaraan Aktif', value: totalVeh ? `${activeVeh} / ${totalVeh}` : (activeVeh || '—'), subtitle: 'Armada siap operasional', icon: anIcon('vehicle', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Kendaraan Dalam Perawatan', value: String(maint), subtitle: 'Sedang servis — belum siap bertugas', icon: anIcon('maintenance', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Dana Petty Cash', value: pettyVal, subtitle: d.hasPetty ? 'Realisasi periode berjalan' : 'Belum tersedia periode ini', icon: anIcon('pettycash', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Skor Operasional', value: scoreVal, subtitle: esc(scoreSub), icon: anIcon('pulse', { size: 15 }) }),
  ];
  return ExecutiveSectionShell({ title: 'Ringkasan Eksekutif', content: ExecutiveKPIGrid(cards) });
}

/* ── 4. TODAY'S HIGHLIGHTS — a simple executive feed (max 5), most urgent first.
   Each item is read from an existing engine field; the dot colour carries the
   tone (no emoji). Short, readable, operational. ──────────────────────────── */

const SEV = { danger: 0, warn: 1, info: 2, ok: 3 };

export function buildHighlights(d) {
  const items = [];

  // Driver readiness (wellness).
  if (num(d.wellness.driverCount) > 0) {
    const fatigue = num(d.wellness.highFatigue);
    const burnout = num(d.wellness.burnoutRisk);
    if (fatigue > 0 || burnout > 0) {
      items.push({ tone: 'warn', label: 'Sebagian driver memerlukan pemulihan', detail: `${fatigue} kelelahan tinggi · ${burnout} risiko tinggi` });
    } else {
      items.push({ tone: 'ok', label: 'Seluruh driver dalam kondisi sehat', detail: `${num(d.wellness.healthyDrivers)} siap bertugas` });
    }
  }

  // Recommendation acceptance.
  const acc = d.recKpi.acceptanceRate;
  if (acc != null) {
    items.push(acc >= 80
      ? { tone: 'ok', label: 'Rekomendasi banyak diterima', detail: `${round(acc)}% diterima tanpa perubahan` }
      : { tone: 'info', label: 'Rekomendasi diterima sebagian', detail: `${round(acc)}% diterima tanpa perubahan` });
  }

  // Dispatch stability (override rate low = few conflicts).
  if (num(d.dispatchKpi.sampleSize) > 0) {
    const ov = num(d.dispatchKpi.overrideRate);
    items.push(ov <= 20
      ? { tone: 'ok', label: 'Dispatch berjalan stabil', detail: `${round(ov)}% keputusan diubah dari rekomendasi` }
      : { tone: 'info', label: 'Beberapa dispatch disesuaikan admin', detail: `${round(ov)}% keputusan diubah dari rekomendasi` });
  }

  // Fleet servicing.
  const maint = num(d.fleet.maintenance);
  const taxDue = num(d.fleet.taxDueSoon);
  if (maint > 0 || taxDue > 0) {
    const parts = [];
    if (maint > 0) parts.push(`${maint} dalam perawatan`);
    if (taxDue > 0) parts.push(`${taxDue} pajak jatuh tempo`);
    items.push({ tone: 'warn', label: 'Kendaraan memerlukan perhatian', detail: parts.join(' · ') });
  } else if (num(d.fleet.totalAssets) > 0) {
    items.push({ tone: 'ok', label: 'Seluruh armada siap operasional', detail: `${num(d.fleet.active)} kendaraan aktif` });
  }

  // Top-accuracy driver (recommendation).
  const topDriver = d.recDrivers.find((r) => num(r.recommendations) > 0);
  if (topDriver) {
    items.push({ tone: 'info', label: `${topDriver.name} paling konsisten dengan rekomendasi`, detail: `${round(topDriver.accuracyPct)}% akurasi rekomendasi` });
  }

  items.sort((a, b) => (SEV[a.tone] ?? 2) - (SEV[b.tone] ?? 2));
  return items.slice(0, 5);
}

function renderHighlights(d) {
  const items = buildHighlights(d);
  if (!items.length) {
    return ExecutiveSectionShell({
      title: 'Sorotan Hari Ini',
      content: ExecutiveEmptyState({ message: 'Belum ada sorotan operasional untuk ditampilkan.' }),
    });
  }
  const li = items.map((e) => `<li class="daa-tl__li">
      <div class="daa-tl__rail"><span class="daa-tl__dot daa-tl__dot--${esc(e.tone)}"></span><span class="daa-tl__line"></span></div>
      <div class="daa-tl__body">
        <div class="daa-tl__top"><span class="daa-tl__title">${esc(e.label)}</span></div>
        ${e.detail ? `<div class="daa-tl__d">${esc(e.detail)}</div>` : ''}
      </div></li>`).join('');
  return ExecutiveSectionShell({
    title: 'Sorotan Hari Ini',
    description: `${items.length} sorotan operasional`,
    content: `<ul class="daa-tl">${li}</ul>`,
  });
}

/* ── 5. OPERATIONAL OVERVIEW — one very concise card per domain, each answering
   "Apakah semuanya baik?" via an existing metric mapped to a status pill. No
   charts. ─────────────────────────────────────────────────────────────────── */

function domCard(icon, name, score, pillText, tone, line) {
  const t = tone || toneFromScore(score);
  return `<div class="exa-dom">
      <div class="exa-dom__head">
        <div class="exa-dom__name"><span class="exa-dom__ico">${anIcon(icon, { size: 15 })}</span>${esc(name)}</div>
        ${ExecutiveStatusPill(pillText, t)}
      </div>
      <div class="exa-dom__line">${esc(line)}</div>
    </div>`;
}

function renderOverview(d) {
  const cards = [];

  // Driver Operations — from the Operational Health Score's driver sub-score.
  const driverScore = (d.exec && d.exec.scoreBreakdown && d.exec.scoreBreakdown.driverScore != null)
    ? d.exec.scoreBreakdown.driverScore : num(d.driverKpis.compRate);
  cards.push(domCard('user', 'Driver', driverScore,
    driverScore >= 70 ? 'Baik' : driverScore >= 40 ? 'Perhatian' : 'Kritis', null,
    `${round(d.driverKpis.driverUtilization)}% driver aktif bertugas`));

  // Dispatch — acceptance/accuracy.
  if (num(d.dispatchKpi.sampleSize) > 0) {
    const s = num(d.dispatchKpi.dispatchAccuracy);
    cards.push(domCard('dispatch', 'Dispatch', s, s >= 70 ? 'Baik' : s >= 40 ? 'Perhatian' : 'Kritis', null,
      `${round(s)}% keputusan sesuai rekomendasi`));
  } else {
    cards.push(domCard('dispatch', 'Dispatch', 0, 'Belum Ada Data', 'neutral', 'Belum ada riwayat keputusan dispatch'));
  }

  // Recommendation — acceptance rate.
  if (d.recKpi.acceptanceRate != null) {
    const s = num(d.recKpi.acceptanceRate);
    cards.push(domCard('target', 'Rekomendasi', s, s >= 70 ? 'Baik' : s >= 40 ? 'Perhatian' : 'Kritis', null,
      `${round(s)}% rekomendasi diterima`));
  } else {
    cards.push(domCard('target', 'Rekomendasi', 0, 'Belum Ada Data', 'neutral', 'Belum ada rekomendasi untuk dinilai'));
  }

  // Wellness — average health.
  if (num(d.wellness.driverCount) > 0) {
    const s = num(d.wellness.averageHealth);
    cards.push(domCard('wellness', 'Wellness', s, s >= 70 ? 'Sehat' : s >= 40 ? 'Perhatian' : 'Kritis', null,
      `${num(d.wellness.healthyDrivers)} dari ${num(d.wellness.driverCount)} driver siap`));
  } else {
    cards.push(domCard('wellness', 'Wellness', 0, 'Belum Ada Data', 'neutral', 'Belum ada data kesehatan driver'));
  }

  // Vehicle — fleet health average.
  if (num(d.fleet.totalAssets) > 0) {
    const s = num(d.fleet.healthAvg);
    cards.push(domCard('vehicle', 'Kendaraan', s, s >= 70 ? 'Baik' : s >= 40 ? 'Perhatian' : 'Kritis', null,
      `${num(d.fleet.active)} aktif · ${num(d.fleet.maintenance)} servis`));
  } else {
    cards.push(domCard('vehicle', 'Kendaraan', 0, 'Belum Ada Data', 'neutral', 'Belum ada data armada'));
  }

  // Petty Cash — health score (present only when the petty period has data).
  if (d.pettyHealth && d.pettyHealth.score != null) {
    const s = num(d.pettyHealth.score);
    cards.push(domCard('pettycash', 'Petty Cash', s, d.pettyHealth.levelLabel || (s >= 70 ? 'Sehat' : 'Perhatian'), null,
      `Kesehatan petty cash ${String(d.pettyHealth.levelLabel || '').toLowerCase() || round(s)}`));
  } else {
    cards.push(domCard('pettycash', 'Petty Cash', 0, 'Belum Ada Data', 'neutral', 'Belum cukup data petty cash'));
  }

  return ExecutiveSectionShell({
    title: 'Tinjauan Operasional',
    description: 'Kondisi ringkas setiap domain',
    content: `<div class="exa-grid">${cards.join('')}</div>`,
  });
}

/* ── 6. EXECUTIVE SPOTLIGHT — one operational spotlight, rotated deterministically
   by day across whichever domains have data. Every figure is an existing engine
   output; no new calculation. ─────────────────────────────────────────────── */

function spotCandidates(d) {
  const out = [];

  // Driver most needing attention (wellness rows are sorted health-ascending).
  const low = d.wellnessDrivers[0];
  if (low && low.health && low.health.score < 70) {
    out.push({
      eyebrow: 'Area yang Memerlukan Perhatian',
      name: low.driverName,
      value: String(round(low.health.score)),
      label: 'skor kesehatan',
      meta: `Kesiapan <b>${esc((low.health && low.health.labelId) || '—')}</b> · pertimbangkan penjadwalan pemulihan`,
    });
  }

  // Best driver by recommendation accuracy.
  const best = d.recDrivers.find((r) => num(r.recommendations) > 0);
  if (best) {
    out.push({
      eyebrow: 'Driver Terbaik Hari Ini',
      name: best.name,
      value: `${round(best.accuracyPct)}%`,
      label: 'akurasi rekomendasi',
      meta: `<b>${num(best.recommendations)}</b> rekomendasi · <b>${num(best.accepted)}</b> diterima langsung`,
    });
  }

  // Fleet condition.
  if (num(d.fleet.totalAssets) > 0) {
    out.push({
      eyebrow: 'Kondisi Armada',
      name: `${num(d.fleet.active)} Kendaraan Aktif`,
      value: String(round(d.fleet.healthAvg)),
      label: 'kesehatan armada',
      meta: `<b>${num(d.fleet.maintenance)}</b> dalam perawatan · <b>${num(d.fleet.taxDueSoon)}</b> pajak jatuh tempo`,
    });
  }

  return out;
}

function renderSpotlight(d, model) {
  const cands = spotCandidates(d);
  if (!cands.length) {
    return ExecutiveSectionShell({
      title: 'Sorotan Eksekutif',
      content: ExecutiveEmptyState({ message: 'Belum ada sorotan operasional untuk ditampilkan.' }),
    });
  }
  // Deterministic daily rotation so the spotlight varies without any new logic.
  const day = (() => { const t = new Date(model.generatedAt); return Number.isNaN(t.getTime()) ? 0 : Math.floor(t.getTime() / 86400000); })();
  const pickOne = cands[day % cands.length];
  const spot = `<div class="daa-spot">
      <div class="daa-spot__eye">${esc(pickOne.eyebrow)}</div>
      <div class="daa-spot__name">${esc(pickOne.name)}</div>
      <div class="daa-spot__score"><span class="daa-spot__score-v">${esc(pickOne.value)}</span><span class="daa-spot__score-l">${esc(pickOne.label)}</span></div>
      <div class="daa-spot__meta">${pickOne.meta}</div>
    </div>`;
  return ExecutiveSectionShell({ title: 'Sorotan Eksekutif', content: spot });
}

/* ── 7. QUICK NAVIGATION — premium one-click cards to every executive page. The
   host routes `data-exa-nav` to the matching nav function. ─────────────────── */

const NAV_CARDS = [
  { key: 'driver', icon: 'chart', title: 'Analytics Driver', sub: 'Kinerja operasional & utilisasi driver' },
  { key: 'dispatch', icon: 'dispatch', title: 'Dispatch Analytics', sub: 'Akurasi, override, dan intelijen dispatch' },
  { key: 'recommendation', icon: 'target', title: 'Recommendation Accuracy', sub: 'Seberapa akurat rekomendasi dispatch' },
  { key: 'wellness', icon: 'wellness', title: 'Driver Wellness', sub: 'Kesehatan, kelelahan, dan kesiapan driver' },
  { key: 'vehicle', icon: 'vehicle', title: 'Vehicle Analytics', sub: 'Kondisi armada, perawatan, dan legalitas' },
  { key: 'petty', icon: 'pettycash', title: 'Petty Cash Analytics', sub: 'Realisasi, anggaran, dan kesehatan petty cash' },
];

function renderQuickNav() {
  const arrow = anIcon('chevR', { size: 16 });
  const cards = NAV_CARDS.map((c) => `<button type="button" class="exa-nav__card" data-exa-nav="${esc(c.key)}" aria-label="Buka ${esc(c.title)}">
      <span class="exa-nav__ico">${anIcon(c.icon, { size: 18 })}</span>
      <span class="exa-nav__tx"><span class="exa-nav__t">${esc(c.title)}</span><span class="exa-nav__s">${esc(c.sub)}</span></span>
      <span class="exa-nav__go" aria-hidden="true">${arrow}</span>
    </button>`).join('');
  return ExecutiveSectionShell({
    title: 'Navigasi Cepat',
    description: 'Buka laporan rinci dengan satu klik',
    content: `<div class="exa-nav">${cards}</div>`,
  });
}

/* ── global empty ─────────────────────────────────────────────────────── */

function renderGlobalEmpty() {
  return ExecutiveSectionShell({
    title: 'Belum ada data operasional',
    content: ExecutiveEmptyState({
      message: 'Dashboard ini terisi setelah ada aktivitas operasional pada driver, dispatch, atau armada.',
      hint: 'Tambahkan driver, kendaraan, dan penugasan untuk melihat kondisi operasional hari ini.',
    }),
  });
}

/* ── public render ────────────────────────────────────────────────────── */

/**
 * Render the full Executive Analytics dashboard as an HTML string.
 * @param {Object} model aggregate of existing engine outputs
 *   { generatedAt, exec, dispatch, recommendation, wellness, fleet, petty }
 * @returns {string}
 */
export function renderExecutiveDashboard(model) {
  // Root adds the shared `.daa` inner-viz scope + `exec-ui v2-analytics-claude`
  // so the kit/analytics classes (and dark mode) resolve outside an analytics
  // scope — exactly like its Driver Wellness sibling.
  const ROOT = 'exa daa exec-ui v2-analytics-claude';
  if (!model) return `<div class="${ROOT}">${renderGlobalEmpty()}</div>`;

  const d = pick(model);
  const hasAny = !!d.exec
    || num(d.wellness.driverCount) > 0
    || num(d.fleet.totalAssets) > 0
    || num(d.dispatchKpi.sampleSize) > 0;
  if (!hasAny) return `<div class="${ROOT}">${renderHero(model, d, verdict(d))}${renderGlobalEmpty()}${renderQuickNav()}</div>`;

  const v = verdict(d);
  // Executive experience hierarchy (v1.18.8) — the page answers "bagaimana
  // kondisi operasional hari ini?" in <5s, then offers supporting detail. Each
  // block carries a different visual weight: Hero (stat band) → Status (one
  // verdict) → KPI (six-number story) → Sorotan (feed) → Tinjauan (per-domain)
  // → Sorotan Eksekutif (one spotlight) → Navigasi Cepat.
  return `<div class="${ROOT}">
    ${renderHero(model, d, v)}
    ${renderStatus(d, v)}
    ${renderKpis(d)}
    ${renderHighlights(d)}
    ${renderOverview(d)}
    ${renderSpotlight(d, model)}
    ${renderQuickNav()}
  </div>`;
}
