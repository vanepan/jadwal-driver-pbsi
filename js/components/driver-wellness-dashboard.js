/* ============================================================
   DRIVER-WELLNESS-DASHBOARD.JS — Driver Wellness
   (v1.18.7 — Executive Migration)

   The premium executive render layer over the Driver Wellness model
   (js/services/driver-wellness-service.js). PURE RENDER: it computes nothing;
   it turns the model into markup. The wellness service is untouched, so every
   business value is byte-identical to before — only the presentation changed.

   ── ONE QUESTION ────────────────────────────────────────────────────────────
   The page answers a single executive question, top to bottom:
     "Apakah kondisi driver masih sehat untuk operasional?"
   Everything here supports answering that; nothing else is on the page. The
   language is an operational briefing — not a medical, developer, or AI report.

   ── DESIGN AUTHORITY ────────────────────────────────────────────────────────
   Driver Wellness is now a SIBLING of Analytics Driver, Dispatch Analytics and
   Recommendation Accuracy. It consumes the SAME Executive UI Kit as its single
   design language (ExecutiveHeader/Toolbar, ExecutiveKPICard/Grid,
   ExecutiveSectionShell, ExecutiveTable, ExecutiveStatusPill, ExecutiveSparkline,
   ExecutiveEmptyState, the one icon engine). The inner micro-viz that has no kit
   primitive — the hero stat band, the Executive Status verdict, the driver
   spotlight, the performance headlines, the band ladder and the event feed —
   reuses the SHARED `.daa-*` classes owned by Dispatch Analytics (injected via
   injectDispatchAnalyticsStyles). That is the single source of truth; this file
   only adds the tiny `.daa-status--danger` supplement (the one status tone the
   shared block did not yet need).

   Page structure (v1.18.7):
     Hero (stat band) → Executive Health Status (one verdict) → Executive KPI
     → Performa Wellness (headlines + band ladder, merged) → Kondisi Driver
     (spotlight + detail table) → Riwayat Wellness.

   Every dynamic value is HTML-escaped and emoji-free, matching the Dispatch
   Analytics / Recommendation Accuracy executive vocabulary.

   API:
     injectDriverWellnessStyles()                       — idempotent <style>
     renderDriverWellnessDashboard(model, opts) → string — full dashboard HTML
   Driver rows are Executive-table clickable rows (data-row-id="<driverId>" →
   `exec-table:row` CustomEvent); the host opens the wellness detail drawer.
   ============================================================ */

'use strict';

import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
// v1.18.7 Executive UI — the shared design authority (same kit the siblings use).
import {
  ExecutiveHeader,
  ExecutiveToolbar,
  ExecutiveKPICard,
  ExecutiveKPIGrid,
  ExecutiveSectionShell,
  ExecutiveTable,
  ExecutiveStatusPill,
  ExecutiveSparkline,
  ExecutiveEmptyState,
  anIcon,
} from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'dwi-dashboard-styles';

// The ONLY shape Driver Wellness adds beyond the shared `.daa-*` system: the
// `danger` Executive-Status tone (for a "Kritis" verdict). Dispatch + RAA only
// ever needed good/info/warn; the shared block stays their single source of
// truth and is left byte-identical.
const CSS = `
.daa-status--danger{border-left-color:var(--danger);background:var(--danger-bg);}
.daa-status--danger .daa-status__level{color:var(--danger);}
`;

/** Inject the supplement stylesheet (and ensure the shared .daa-* styles exist). */
export function injectDriverWellnessStyles() {
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
function naOrNum(v) { return v == null ? 'N/A' : String(Math.round(Number(v) || 0)); }
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
/** Quality/readiness status pill via the kit (replaces the old .dwi-pill). */
function tonePill(text, tone, title) { return ExecutiveStatusPill(text, tone, title || ''); }

/** The active trend window object (Today/7/30/90/YTD) for the current model. */
function activeWindow(model) {
  const ws = (model.trend && Array.isArray(model.trend.windows)) ? model.trend.windows : [];
  return ws.find((w) => w.key === model.window) || ws.find((w) => w.key === '30d') || ws[0] || null;
}

/* ── 1. HERO — title + one verdict subtitle + a band of three headline figures.
   No icon, no technical explanation; the numbers carry the readiness message.
   Every value is read straight from the model — the hero states the verdict, it
   does not compute a new one. ─────────────────────────────────────────────── */

function renderHeader(model) {
  const wins = (model.trend && Array.isArray(model.trend.windows)) ? model.trend.windows : [];
  // Executive segmented control — SAME `seg` control the siblings use, keeping the
  // data-dwi-window contract the host's delegated handler binds (no workflow change).
  const toggle = `<div class="seg" role="tablist" aria-label="Rentang pemantauan">${wins.map((w) =>
    `<button type="button" class="${w.key === model.window ? 'on' : ''}" data-dwi-window="${esc(w.key)}" data-active="${w.key === model.window}">${esc(w.label)}</button>`,
  ).join('')}</div>`;
  // Export buttons keep the data-dwi-export contract + the byte-identical pipeline.
  const exportBtns =
    `<button type="button" class="exec-reset" data-dwi-export="pdf">${anIcon('download', { size: 14 })}PDF</button>` +
    `<button type="button" class="exec-reset" data-dwi-export="excel">${anIcon('download', { size: 14 })}Excel</button>`;

  const s = model.summary;
  const total = s.driverCount;
  const healthy = s.healthyDrivers;
  const atRisk = Math.max(0, total - healthy);
  const subtitle = total === 0
    ? 'Belum ada pengemudi untuk dipantau.'
    : (atRisk === 0 && s.averageHealth >= 70)
      ? 'Kondisi pengemudi masih mendukung operasional.'
      : s.averageHealth >= 55
        ? 'Sebagian besar pengemudi siap; beberapa memerlukan perhatian.'
        : 'Beberapa driver memerlukan perhatian.';

  const stat = (v, l) => `<div class="daa-hero-stat"><span class="daa-hero-stat__v">${esc(v)}</span><span class="daa-hero-stat__l">${esc(l)}</span></div>`;
  const statBand = `<div class="daa-hero-stats">
      ${stat(total, 'driver dipantau')}
      ${stat(healthy, 'siap bertugas')}
      ${stat(atRisk, 'perlu perhatian')}
    </div>`;
  return ExecutiveHeader({
    title: 'Driver Wellness',
    subtitle,
    meta: `Diperbarui ${fmtTime(model.generatedAt)} · ${total} driver · jendela ${esc(model.windowDays)} hari`,
  }) + statBand + ExecutiveToolbar({ left: toggle, right: exportBtns });
}

/* ── 2. EXECUTIVE HEALTH STATUS — ONE verdict card directly under the hero. It
   states a single readiness status, a matching level word, and one supporting
   sentence, all read from values already in the model (no prediction, no new
   analytics). Tone drives the accent only. ────────────────────────────────── */

function renderStatus(model) {
  const s = model.summary;
  const avg = Number(s.averageHealth) || 0;
  const total = s.driverCount;
  const atRisk = Math.max(0, total - s.healthyDrivers);
  const fatigue = s.highFatigue;
  const burnout = s.burnoutRisk;

  let tone, level, msg;
  if (avg >= 80 && atRisk === 0) {
    tone = 'good'; level = 'Sangat Baik';
    msg = 'Seluruh pengemudi dalam kondisi sehat dan siap untuk operasional penuh.';
  } else if (avg >= 70 && burnout === 0) {
    tone = 'good'; level = 'Baik';
    msg = `Kondisi pengemudi mendukung operasional — ${s.healthyDrivers} dari ${total} siap bertugas.`;
  } else if (avg >= 50) {
    tone = 'warn'; level = 'Perlu Perhatian';
    msg = `${atRisk} pengemudi perlu perhatian — ${fatigue} kelelahan tinggi, ${burnout} risiko burnout.`;
  } else {
    tone = 'danger'; level = 'Kritis';
    msg = `Kondisi armada menurun — ${atRisk} dari ${total} pengemudi memerlukan pemulihan segera.`;
  }
  return `<div class="daa-status daa-status--${tone}">
      <div class="daa-status__eye">Status Kesehatan</div>
      <div class="daa-status__level">${esc(level)}</div>
      <div class="daa-status__msg">${esc(msg)}</div>
    </div>`;
}

/* ── 3. EXECUTIVE KPI — four indicators in operational language. Every subtitle
   says the business impact. Medical / technical terminology is avoided. ────── */

function renderKpis(model) {
  const s = model.summary;
  const total = s.driverCount;
  const cards = [
    ExecutiveKPICard({ title: 'Driver Siap Bertugas', value: `${s.healthyDrivers}${total ? ` / ${total}` : ''}`, subtitle: 'Kondisi sehat untuk operasional penuh', icon: anIcon('check', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Perlu Istirahat', value: String(s.highFatigue), subtitle: 'Kelelahan tinggi — jadwalkan pemulihan', icon: anIcon('pulse', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Risiko Tinggi', value: String(s.burnoutRisk), subtitle: 'Beban jangka panjang — perlu distribusi ulang', icon: anIcon('alert', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Skor Kesehatan Operasional', value: naOrNum(s.averageHealth), subtitle: 'Rata-rata kesiapan armada (0–100)', icon: anIcon('wellness', { size: 15 }) }),
  ];
  return ExecutiveSectionShell({
    title: 'Ringkasan Eksekutif',
    content: ExecutiveKPIGrid(cards),
  });
}

/* ── 4. PERFORMA WELLNESS — the single "is the fleet healthy overall?" section.
   MERGES the old Distribusi + Tren blocks: first two performance headlines
   (average health + recovery, with a per-range sparkline), then the band ladder
   showing how the drivers are spread across the health bands. No new analytics —
   every number is read straight from the model. ──────────────────────────── */

/** One performance headline — a big current figure + a per-range sparkline.
 *  Honest by construction: the trend windows (Today/7/30/90/YTD) are nested
 *  look-backs, not a chronological series, so no up/down direction is claimed. */
function performanceCard(label, value, caption, series) {
  const arr = (Array.isArray(series) ? series : []).map((n) => Number(n) || 0);
  const spark = arr.length >= 2 ? ExecutiveSparkline(arr, { tone: 'info' })
    : '<div class="daa-move__sub">Belum cukup data</div>';
  return `<div class="daa-trendcard">
      <div class="daa-trendcard__lbl">${esc(label)}</div>
      <div class="daa-move__row"><span class="daa-move__dir daa-move__dir--flat">${esc(value)}</span><span class="daa-move__t">${esc(caption)}</span></div>
      <div style="margin-top:.5rem">${spark}</div>
    </div>`;
}

function renderPerforma(model) {
  const wins = (model.trend && Array.isArray(model.trend.windows)) ? model.trend.windows : [];
  const healthSeries = wins.map((w) => Number(w.averageHealth) || 0);
  const recoverySeries = wins.map((w) => Number(w.averageRecovery) || 0);
  const s = model.summary;
  const headlines = `<div class="daa-cols">
      ${performanceCard('Kesehatan Operasional', naOrNum(s.averageHealth), 'rata-rata skor · per rentang', healthSeries)}
      ${performanceCard('Pemulihan', naOrNum(s.averageRecovery), 'rata-rata pemulihan · per rentang', recoverySeries)}
    </div>`;

  // Band ladder — how the drivers are spread across the health bands (only bands
  // that actually contain drivers, healthiest first). One clear "who is where".
  const bands = (model.distributions && Array.isArray(model.distributions.health)) ? model.distributions.health : [];
  const populated = bands.filter((b) => b.count > 0);
  const total = populated.reduce((sum, b) => sum + b.count, 0);
  const ladder = populated.length ? `<div class="daa-funnel">${populated.map((b) => {
    const wpct = total ? Math.round((b.count / total) * 100) : 0;
    const fillCls = b.tone === 'ok' ? ' daa-bar__fill--ok' : b.tone === 'warn' ? ' daa-bar__fill--warn' : b.tone === 'danger' ? ' daa-bar__fill--danger' : '';
    return `<div class="daa-funnel__row">
        <div class="daa-funnel__k">${esc(b.labelId)}</div>
        <div class="daa-bar"><div class="daa-bar__fill${fillCls}" style="width:${wpct}%"></div></div>
        <div class="daa-funnel__meta"><b>${esc(b.count)}</b> driver · ${wpct}%</div></div>`;
  }).join('')}</div>` : ExecutiveEmptyState({ message: 'Belum ada driver untuk dinilai.' });

  const win = activeWindow(model);
  return ExecutiveSectionShell({
    title: 'Performa Wellness',
    description: win ? `${win.label} · ${s.driverCount} driver` : '',
    content: `${headlines}
      <div class="daa-detail-cap" style="margin-top:1rem">Sebaran kondisi driver</div>
      ${ladder}`,
  });
}

/* ── 5. KONDISI DRIVER — the section leads with the premium spotlight on the
   driver most in need of attention (big name, one large health figure, a plain
   operational line), then the concise detail table. Rows are Executive-table
   clickable rows → the host opens the wellness detail drawer. ─────────────── */

function spotlight({ eyebrow, name, primary, meta }) {
  return `<div class="daa-spot">
      <div class="daa-spot__eye">${esc(eyebrow)}</div>
      <div class="daa-spot__name">${esc(name)}</div>
      <div class="daa-spot__score"><span class="daa-spot__score-v">${esc(primary.value)}</span><span class="daa-spot__score-l">${esc(primary.label)}</span></div>
      <div class="daa-spot__meta">${meta}</div>
    </div>`;
}

function detailTable(rows) {
  if (!rows.length) return ExecutiveEmptyState({ message: 'Belum ada driver aktif untuk dipantau.' });
  const columns = [
    { key: 'driver', label: 'Driver', primary: true },
    { key: 'kondisi', label: 'Kondisi', align: 'right', render: (v) => tonePill(`${v.score} · ${v.labelId}`, v.tone) },
    { key: 'fatigue', label: 'Kelelahan', align: 'right', render: (v) => tonePill(v.labelId, v.tone) },
    { key: 'burnout', label: 'Burnout', align: 'right', render: (v) => tonePill(v.labelId, v.tone) },
    { key: 'readiness', label: 'Kesiapan', align: 'right', render: (v) => tonePill(String(v.score), v.tone, '100 = paling siap/lengang') },
    { key: 'hours', label: 'Jam Kerja', align: 'right' },
  ];
  const data = rows.map((r) => ({
    id: r.driverId, clickable: true, rowLabel: `Detail wellness ${r.driverName}`,
    driver: r.driverName,
    kondisi: { score: r.health.score, labelId: r.health.labelId, tone: r.health.tone },
    fatigue: { labelId: r.fatigue.labelId, tone: r.fatigue.tone },
    burnout: { labelId: r.burnout.labelId, tone: r.burnout.tone },
    readiness: { score: r.capacityHealth.score, tone: r.capacityHealth.tone },
    hours: `${r.workingTime.hours} j`,
  }));
  return ExecutiveTable({ columns, rows: data, ariaLabel: 'Kondisi Operasional Driver' });
}

function renderDrivers(model) {
  const rows = Array.isArray(model.drivers) ? model.drivers : [];
  if (!rows.length) {
    return ExecutiveSectionShell({
      title: 'Kondisi Driver',
      content: ExecutiveEmptyState({ message: 'Belum ada driver aktif untuk dipantau.' }),
    });
  }
  // rows are pre-sorted health-ascending, so [0] is the driver most in need of
  // attention — the actionable spotlight for a wellness briefing.
  const top = rows[0];
  const atRisk = top.health.score < 70;
  const lead = atRisk ? 'Perlu penjadwalan pemulihan' : 'Masih dalam batas sehat';
  const spot = spotlight({
    eyebrow: 'Paling Perlu Perhatian',
    name: top.driverName,
    primary: { value: top.health.score, label: top.health.labelId },
    meta: `${esc(lead)} · kelelahan <b>${esc(top.fatigue.labelId)}</b> · burnout <b>${esc(top.burnout.labelId)}</b> · <b>${esc(top.workingTime.hours)}</b> jam kerja`,
  });
  return ExecutiveSectionShell({
    title: 'Kondisi Driver',
    description: 'Siapa yang paling perlu perhatian, lalu rincian setiap pengemudi',
    content: `${spot}
      <div class="daa-detail-cap">Rincian per driver</div>
      ${detailTable(rows)}`,
  });
}

/* ── 6. RIWAYAT WELLNESS — the final section: the latest operational wellness
   events across the fleet, most urgent first. Each event is one the model
   already derived per driver (buildTimeline); this only collects and orders them
   for display — no new analytics. Kept very simple. ───────────────────────── */

const EVENT_SEVERITY = { danger: 0, warn: 1, info: 2, ok: 3 };

function renderHistory(model) {
  const rows = Array.isArray(model.drivers) ? model.drivers : [];
  const events = [];
  for (const r of rows) {
    for (const e of (Array.isArray(r.timeline) ? r.timeline : [])) {
      events.push({ driver: r.driverName, tone: e.tone || 'info', label: e.label, detail: e.detail, rank: r.health.score });
    }
  }
  // Most urgent first (danger → ok), then lowest-health driver first.
  events.sort((a, b) => (EVENT_SEVERITY[a.tone] ?? 2) - (EVENT_SEVERITY[b.tone] ?? 2) || a.rank - b.rank);
  const view = events.slice(0, 8);

  if (!view.length) {
    return ExecutiveSectionShell({
      title: 'Riwayat Wellness',
      content: ExecutiveEmptyState({ message: 'Belum ada peristiwa wellness untuk ditampilkan.' }),
    });
  }
  const items = view.map((e) => `<li class="daa-tl__li">
      <div class="daa-tl__rail"><span class="daa-tl__dot daa-tl__dot--${esc(e.tone)}"></span><span class="daa-tl__line"></span></div>
      <div class="daa-tl__body">
        <div class="daa-tl__top"><span class="daa-tl__title">${esc(e.label)}</span></div>
        <div class="daa-tl__d">${esc(e.driver)}${e.detail ? ' · ' + esc(e.detail) : ''}</div>
      </div></li>`).join('');
  return ExecutiveSectionShell({
    title: 'Riwayat Wellness',
    description: `${view.length} peristiwa terbaru`,
    content: `<ul class="daa-tl">${items}</ul>`,
  });
}

/* ── global empty ─────────────────────────────────────────────────────── */

function renderGlobalEmpty() {
  return ExecutiveSectionShell({
    title: 'Belum ada data wellness',
    content: ExecutiveEmptyState({
      message: 'Dashboard ini terisi setelah ada driver aktif dengan riwayat penugasan.',
      hint: 'Tambahkan driver dan penugasan untuk melihat kesiapan operasional, kelelahan, dan risiko burnout armada.',
    }),
  });
}

/* ── public render ────────────────────────────────────────────────────── */

/**
 * Render the full Driver Wellness dashboard as an HTML string.
 * @param {Object} model output of computeDriverWellnessModel
 * @returns {string}
 */
export function renderDriverWellnessDashboard(model) {
  // Root keeps `.dwi` for layout, adds the shared `.daa` inner-viz scope, and
  // `exec-ui v2-analytics-claude` so the kit/analytics classes (and dark mode)
  // resolve even though the dashboard renders outside an analytics scope.
  const ROOT = 'dwi daa exec-ui v2-analytics-claude';
  if (!model) return `<div class="${ROOT}">${renderGlobalEmpty()}</div>`;
  const hasData = model.summary && model.summary.driverCount > 0;
  // Executive experience hierarchy (v1.18.7) — the page answers "apakah kondisi
  // driver masih sehat untuk operasional?" in <5s, then offers detail. Each block
  // carries a different visual weight: Hero (stat band) → Status (one verdict) →
  // KPI (four-number story) → Performa Wellness (headlines + band ladder, merged)
  // → Kondisi Driver (spotlight + detail table) → Riwayat (event feed).
  return `<div class="${ROOT}">
    ${renderHeader(model)}
    ${hasData ? renderStatus(model) : renderGlobalEmpty()}
    ${renderKpis(model)}
    ${renderPerforma(model)}
    ${renderDrivers(model)}
    ${renderHistory(model)}
  </div>`;
}
