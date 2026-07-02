/* ============================================================
   EXECUTIVE-DASHBOARD.JS — Executive Analytics (v1.18.8.4)

   The executive HOME PAGE for the entire Sarpras Operations platform. It is
   NOT another analytics page: it answers ONE question, within five seconds —

     "Bagaimana kondisi operasional PBSI hari ini?"

   Everything on the page supports that question; nothing else is here.

   ── PRESENTATION ONLY ───────────────────────────────────────────────────────
   This file computes NOTHING. It receives an aggregate model whose every value
   was produced by an EXISTING engine (the Operational Health Score from
   computeExecutiveAnalytics, plus the Dispatch Analytics, Recommendation
   Accuracy, Driver Wellness and Fleet Asset models) and turns those outputs
   into an operational briefing. No new scoring, prediction, or business logic;
   no duplicated calculation. The PDF/Excel exporter reuses pick / verdict /
   buildHighlights from here, so those three are kept byte-identical.

   ── APPLE REFINEMENT (v1.18.8.3) ────────────────────────────────────────────
   A refinement pass (not a redesign): less UI, better hierarchy, better
   storytelling. Meaning leads, numbers support.
     • Hero + Status are UNIFIED into one meaning-first centerpiece: an elegant,
       lighter Operational Ring holds the score, but the VERDICT ("Sangat Baik")
       is the dominant element, followed by one calm sentence. The separate
       status card was removed (prefer removing UI to adding it).
     • Supporting metrics each explain themselves ("5 kendaraan aktif / Semua
       armada siap operasional") — never a number alone.
     • The KPI gauges keep a quality word + a REFINED (thin, long, subtle) bar.
     • "Sorotan Hari Ini" reads conversationally: a domain, a status word, and a
       sentence — not a KPI card.
     • Typography is editorial: natural case (no shouty uppercase eyebrows or
       section dividers), calmer rhythm, more whitespace.
   Business terminology stays honest — the wellness "healthy" count is surfaced
   as "driver kondisi sehat" (condition), never "tersedia/available".

   Page structure (v1.18.8.4 — final premium polish): the KPI-gauge "Ringkasan"
   and the domain cards are merged into ONE meaning-first editorial section, the
   verdict is the largest textual element, and the ring is a lighter visual
   anchor:
     Hero (ring anchor + large verdict + self-explaining metrics) → Sorotan Hari
     Ini (one editorial insight per domain) → Sorotan Eksekutif (one spotlight)
     → Navigasi (one-click cards).

   API:
     injectExecutiveDashboardStyles()                  — idempotent <style>
     renderExecutiveDashboard(model) → string          — full dashboard HTML
   Quick-navigation cards are `data-exa-nav="<key>"` buttons; the host routes
   the click to the matching page. Export buttons are `data-exa-export`.
   ============================================================ */

'use strict';

import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
import {
  ExecutiveSectionShell,
  ExecutiveEmptyState,
  anIcon,
} from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'exa-dashboard-styles';

/* Premium, editorial `.exa-*` surface. Platform tokens only (dark-mode safe —
   no hard-coded #fff). Natural-case typography, few borders, generous
   whitespace, one focus per block. */
const CSS = `
.exa{ --exa-gap: clamp(2rem, 4vw, 3.25rem); }
/* Editorial section headers — natural case, no shouty divider (less UI). */
.exa .v2-analytics-section{ margin-top: var(--exa-gap); gap: 4px; }
.exa .v2-analytics-section-header{ text-transform:none; letter-spacing:-.01em; font-size:1.05rem;
  font-weight:800; color:var(--text); border-bottom:0; padding-bottom:0; }
/* Editorial: soften the one remaining uppercase eyebrow (the shared spotlight). */
.exa .daa-spot__eye{ text-transform:none; letter-spacing:.01em; font-weight:700; }

.exa-dot{display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--muted);flex:0 0 auto;}
.exa-dot--ok,.exa-dot--good{background:var(--ok);} .exa-dot--info{background:var(--info);}
.exa-dot--warn{background:var(--warn);} .exa-dot--danger{background:var(--danger);} .exa-dot--neutral{background:var(--muted);}

/* Hairline progress indicator — thin, long, subtle, rounded (Apple restraint). */
.exa-bar{height:.28rem;border-radius:999px;background:color-mix(in srgb, var(--muted) 16%, transparent);overflow:hidden;}
.exa-bar__fill{height:100%;border-radius:999px;background:var(--info);transition:width .6s ease;}
.exa-bar__fill--ok{background:var(--ok);} .exa-bar__fill--info{background:var(--info);}
.exa-bar__fill--warn{background:var(--warn);} .exa-bar__fill--danger{background:var(--danger);}
.exa-bar__fill--neutral{background:var(--muted);opacity:.5;}

/* ── HERO — one meaning-first centerpiece (ring + verdict + metrics). ──────── */
.exa-hero{padding:.25rem 0 0;}
.exa-hero__top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.exa-hero__title{font-size:1.2rem;font-weight:800;letter-spacing:-.02em;color:var(--text);margin:0;}
.exa-hero__q{font-size:.92rem;color:var(--muted);margin:.35rem 0 0;line-height:1.5;}
.exa-hero__actions{display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;}
.exa-hero__btns{display:flex;gap:.5rem;}
.exa-hero__ts{font-size:.7rem;color:var(--muted);}
.exa-hero__body{display:flex;align-items:center;gap:clamp(2rem,5vw,4.5rem);flex-wrap:wrap;margin-top:1.75rem;}
.exa-ring{position:relative;flex:0 0 auto;width:196px;height:196px;display:flex;align-items:center;justify-content:center;}
.exa-ring__svg{display:block;}
.exa-ring__c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.exa-ring__v{font-size:2rem;font-weight:700;letter-spacing:-.03em;line-height:1;color:var(--text);}
.exa-ring__u{font-size:.68rem;font-weight:600;color:var(--muted);margin-top:.22rem;letter-spacing:.02em;}
.exa-hero__meta{display:flex;flex-direction:column;min-width:0;flex:1 1 18rem;}
.exa-hero__eye{font-size:.82rem;font-weight:600;color:var(--muted);}
/* The verdict is the LARGEST textual element — meaning leads, the score supports. */
.exa-hero__verdict{font-size:clamp(2.4rem,4vw,3rem);font-weight:800;letter-spacing:-.03em;line-height:1.02;margin:.1rem 0 .45rem;color:var(--text);}
.exa-hero__verdict--good{color:var(--ok);} .exa-hero__verdict--warn{color:var(--warn);} .exa-hero__verdict--danger{color:var(--danger);}
.exa-hero__say{font-size:.92rem;color:var(--muted);line-height:1.5;max-width:34rem;}
.exa-hero__metrics{display:flex;flex-wrap:wrap;gap:clamp(1.75rem,4vw,3.5rem);margin-top:2rem;}
.exa-metric{display:flex;flex-direction:column;gap:.2rem;min-width:0;max-width:16rem;}
.exa-metric__head{font-size:1.05rem;color:var(--text);letter-spacing:-.01em;}
.exa-metric__head b{font-size:1.5rem;font-weight:800;margin-right:.3rem;}
.exa-metric__say{font-size:.8rem;color:var(--muted);line-height:1.45;}

/* ── SOROTAN HARI INI — one meaning-first editorial insight per domain: a verdict
   word, a plain sentence, and a hairline health cue. (Merges the old KPI gauges
   + domain cards into a single premium section — less dashboard, one language.) */
.exa-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1.25rem;}
.exa-sumcard{display:flex;flex-direction:column;gap:.7rem;padding:1.5rem 1.6rem;border-radius:22px;
  background:var(--surface-2);transition:transform .18s ease,box-shadow .18s ease;}
.exa-sumcard:hover{transform:translateY(-2px);box-shadow:0 16px 36px -26px rgba(0,0,0,.5);}
.exa-sumcard__top{display:flex;align-items:center;gap:.55rem;}
.exa-sumcard__ico{display:inline-flex;color:var(--muted);}
.exa-sumcard__name{font-size:.92rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.exa-sumcard__tag{margin-left:auto;display:inline-flex;align-items:center;gap:.4rem;font-size:.78rem;font-weight:700;}
.exa-sumcard__tag--good{color:var(--ok);} .exa-sumcard__tag--warn{color:var(--warn);}
.exa-sumcard__tag--danger{color:var(--danger);} .exa-sumcard__tag--neutral{color:var(--muted);}
.exa-sumcard__msg{font-size:1.05rem;font-weight:500;color:var(--text);line-height:1.5;letter-spacing:-.01em;}
.exa-sumcard__bar{margin-top:.15rem;}

/* ── NAVIGASI — premium one-click cards to every executive page. ────────────── */
.exa-nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(15.5rem,1fr));gap:1.1rem;}
.exa-nav__card{display:flex;align-items:center;gap:.9rem;text-align:left;width:100%;
  border:1px solid var(--border);border-radius:18px;padding:1.1rem 1.25rem;background:var(--surface);
  cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;font:inherit;color:inherit;}
.exa-nav__card:hover{transform:translateY(-2px);border-color:var(--info);box-shadow:0 14px 34px -22px rgba(0,0,0,.5);}
.exa-nav__card:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.exa-nav__ico{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:13px;background:var(--info-bg);color:var(--info);}
.exa-nav__tx{display:flex;flex-direction:column;gap:.15rem;min-width:0;}
.exa-nav__t{font-size:.9rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.exa-nav__s{font-size:.74rem;color:var(--muted);line-height:1.35;}
.exa-nav__go{margin-left:auto;flex:0 0 auto;color:var(--muted);opacity:.65;}
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
/** Elegant, static, correctly-filled Operational Ring (SVG). Reuses the ring-
 *  gauge visual grammar of the Executive UI Kit but renders at its final value
 *  so it is right without host animation (robust in tests + print). Thinner and
 *  larger than before for a more premium, minimal proportion. */
function operationalRing(value01, toneKey) {
  const size = 196, th = 10;
  const r = (size - th) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number(value01) || 0));
  const filled = (v * circ).toFixed(1);
  const rest = (circ - v * circ).toFixed(1);
  const color = toneKey === 'good' ? 'var(--ok)' : toneKey === 'warn' ? 'var(--warn)' : toneKey === 'danger' ? 'var(--danger)' : 'var(--info)';
  const track = 'color-mix(in srgb, var(--muted) 16%, transparent)';
  return `<svg class="exa-ring__svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${track}" stroke-width="${th}"/>
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${th}"
        stroke-linecap="round" stroke-dasharray="${filled} ${rest}" transform="rotate(-90 ${cx} ${cx})"/>
    </svg>`;
}

/* ── safe model accessors (every field below is an existing engine output) ─
   Exported (pick / verdict / buildHighlights) so the Executive Report exporter
   projects the SAME derived values — one source, no duplicated logic. These
   three are kept byte-identical across the polish (exports unchanged). */

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

/* ── 1. HERO — the meaning-first centerpiece. An elegant ring holds the score,
   but the VERDICT leads; one calm sentence follows; three supporting metrics
   each explain themselves (never a number alone). ─────────────────────────── */

function renderHero(model, d, v) {
  const scoreTxt = (d.score && d.score.value != null) ? String(round(d.score.value)) : '—';
  const ringVal = (d.score && d.score.value != null) ? num(d.score.value) / 100 : 0;

  const say = v.tone === 'good'
    ? 'Operasional berjalan normal. Tidak ada area yang memerlukan tindakan segera.'
    : v.tone === 'warn'
      ? 'Sebagian besar berjalan baik; beberapa area memerlukan perhatian.'
      : 'Beberapa area operasional memerlukan tindak lanjut segera.';

  const total = num(d.wellness.driverCount);
  const healthy = num(d.wellness.healthyDrivers);
  const risk = num(d.wellness.highFatigue) + num(d.wellness.burnoutRisk);
  const active = num(d.fleet.active);
  const maint = num(d.fleet.maintenance);
  const taxDue = num(d.fleet.taxDueSoon);
  const totalVeh = num(d.fleet.totalAssets);
  const acceptance = d.recKpi.acceptanceRate != null ? d.recKpi.acceptanceRate : d.dispatchKpi.recommendationAcceptance;

  // Each supporting metric answers "so what?" — a headline fact + a plain line.
  // Business-validated: the wellness "healthy" count is drivers in HEALTHY
  // CONDITION (fit for duty), never "tersedia/available".
  const metric = (head, say2) => `<div class="exa-metric"><div class="exa-metric__head">${head}</div><div class="exa-metric__say">${esc(say2)}</div></div>`;
  const metrics = [
    total > 0
      ? metric(`<b>${healthy}</b> driver kondisi sehat`, risk > 0 ? `${risk} memerlukan pemulihan` : 'Semua dalam kondisi sehat')
      : metric('<b>—</b> data driver', 'Belum ada data kesehatan'),
    totalVeh > 0
      ? metric(`<b>${active}</b> kendaraan aktif`, (maint > 0 || taxDue > 0)
        ? [maint > 0 ? `${maint} dalam perawatan` : '', taxDue > 0 ? `${taxDue} pajak jatuh tempo` : ''].filter(Boolean).join(' · ')
        : 'Semua armada siap operasional')
      : metric('<b>—</b> data armada', 'Belum ada data kendaraan'),
    acceptance == null
      ? metric('<b>—</b> dispatch', 'Belum ada keputusan dispatch')
      : metric(`<b>${round(acceptance)}%</b> rekomendasi diterima`, acceptance >= 80 ? 'Dispatch berjalan konsisten' : 'Sebagian disesuaikan admin'),
  ].join('');

  const exportBtns =
    `<button type="button" class="exec-reset" data-exa-export="pdf" aria-label="Unduh laporan PDF">${anIcon('download', { size: 14 })}PDF</button>` +
    `<button type="button" class="exec-reset" data-exa-export="excel" aria-label="Unduh laporan Excel">${anIcon('download', { size: 14 })}Excel</button>`;

  return `<section class="exa-hero">
      <div class="exa-hero__top">
        <div>
          <h1 class="exa-hero__title">Executive Analytics</h1>
          <p class="exa-hero__q">Bagaimana kondisi operasional PBSI hari ini?</p>
        </div>
        <div class="exa-hero__actions">
          <div class="exa-hero__btns">${exportBtns}</div>
          <div class="exa-hero__ts">Diperbarui ${esc(fmtTime(model.generatedAt))}</div>
        </div>
      </div>
      <div class="exa-hero__body">
        <div class="exa-ring">
          ${operationalRing(ringVal, v.tone)}
          <div class="exa-ring__c"><span class="exa-ring__v">${esc(scoreTxt)}</span><span class="exa-ring__u">dari 100</span></div>
        </div>
        <div class="exa-hero__meta">
          <div class="exa-hero__eye">Skor Operasional</div>
          <div class="exa-hero__verdict exa-hero__verdict--${esc(v.tone)}">${esc(v.level)}</div>
          <div class="exa-hero__say">${esc(say)}</div>
        </div>
      </div>
      <div class="exa-hero__metrics">${metrics}</div>
    </section>`;
}

/* ── 2. SOROTAN HARI INI — one meaning-first editorial insight per domain. Each
   reads as a sentence (a verdict word + a plain line) with a hairline health cue;
   the number never dominates. Merges the old KPI gauges + domain cards into a
   single premium section — less dashboard, one presentation language. Every fact
   is an existing engine field. ─────────────────────────────────────────────── */

/** 0–100 score → the domain's editorial verdict word + tone (presentation). */
function domainVerdict(score) {
  if (score == null) return { tone: 'neutral', word: 'Belum ada data' };
  const s = num(score);
  if (s >= 70) return { tone: 'good', word: 'Baik' };
  if (s >= 40) return { tone: 'warn', word: 'Perlu perhatian' };
  return { tone: 'danger', word: 'Kritis' };
}

function insightCard({ icon, name, msg, score }) {
  const { tone, word } = domainVerdict(score);
  const has = score != null;
  const bar = has
    ? `<div class="exa-bar exa-sumcard__bar"><div class="exa-bar__fill exa-bar__fill--${tone === 'good' ? 'ok' : tone}" style="width:${Math.max(3, round(score))}%"></div></div>`
    : '';
  return `<div class="exa-sumcard">
      <div class="exa-sumcard__top">
        <span class="exa-sumcard__ico">${anIcon(icon, { size: 16 })}</span>
        <span class="exa-sumcard__name">${esc(name)}</span>
        <span class="exa-sumcard__tag exa-sumcard__tag--${tone}"><span class="exa-dot exa-dot--${tone}"></span>${esc(word)}</span>
      </div>
      <div class="exa-sumcard__msg">${esc(msg)}</div>
      ${bar}
    </div>`;
}

function domainSummaries(d) {
  const cards = [];

  // Driver — Driver Wellness (fitness for duty). The bar reflects average health.
  if (num(d.wellness.driverCount) > 0) {
    const risk = num(d.wellness.highFatigue) + num(d.wellness.burnoutRisk);
    cards.push({
      icon: 'user', name: 'Driver', score: d.wellness.averageHealth,
      msg: risk > 0 ? `${risk} driver membutuhkan pemulihan.` : 'Semua driver dalam kondisi sehat.',
    });
  } else {
    cards.push({ icon: 'user', name: 'Driver', score: null, msg: 'Belum ada data kesehatan driver.' });
  }

  // Vehicle — fleet servicing; the bar reflects average fleet health.
  if (num(d.fleet.totalAssets) > 0) {
    const maint = num(d.fleet.maintenance);
    const taxDue = num(d.fleet.taxDueSoon);
    let msg;
    if (taxDue > 0 && maint === 0) msg = `${taxDue} pajak kendaraan akan jatuh tempo.`;
    else if (maint > 0) msg = `${maint} kendaraan dalam perawatan.${taxDue > 0 ? ` ${taxDue} pajak jatuh tempo.` : ''}`;
    else msg = 'Seluruh armada aktif dan siap.';
    cards.push({ icon: 'vehicle', name: 'Kendaraan', score: d.fleet.healthAvg, msg });
  } else {
    cards.push({ icon: 'vehicle', name: 'Kendaraan', score: null, msg: 'Belum ada data armada.' });
  }

  // Dispatch — recommendation acceptance (share used as-is); bar reflects the
  // dispatch quality score when available, else the acceptance rate.
  const acc = d.recKpi.acceptanceRate != null ? d.recKpi.acceptanceRate : d.dispatchKpi.recommendationAcceptance;
  const dispatchScore = num(d.dispatchKpi.sampleSize) > 0 ? d.dispatchKpi.avgDispatchScore : (acc != null ? acc : null);
  cards.push(acc != null
    ? { icon: 'dispatch', name: 'Dispatch', score: dispatchScore, msg: `${round(acc)}% rekomendasi digunakan.` }
    : { icon: 'dispatch', name: 'Dispatch', score: null, msg: 'Belum ada keputusan dispatch.' });

  // Petty Cash — health of the active period; bar reflects the petty health score.
  if (d.pettyHealth && d.pettyHealth.score != null) {
    const s = num(d.pettyHealth.score);
    cards.push({ icon: 'pettycash', name: 'Petty Cash', score: s, msg: s >= 70 ? 'Tidak ada perhatian hari ini.' : 'Kesehatan petty cash perlu perhatian.' });
  } else {
    cards.push({ icon: 'pettycash', name: 'Petty Cash', score: null, msg: 'Belum terdapat transaksi periode ini.' });
  }

  return cards;
}

function renderSummaryCards(d) {
  const cards = domainSummaries(d);
  return ExecutiveSectionShell({
    title: 'Sorotan Hari Ini',
    content: `<div class="exa-sum">${cards.map(insightCard).join('')}</div>`,
  });
}

/* ── 4. TODAY'S HIGHLIGHTS (data projection) — kept for the PDF/Excel exporter,
   which reuses this alongside pick + verdict. The on-screen dashboard shows the
   conversational domain cards above; this builds the report's highlight feed
   (max 5, most urgent first) from the same existing engine fields. ─────────── */

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

/* ── 5. SOROTAN EKSEKUTIF — one operational spotlight, rotated deterministically
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

/* ── 6. NAVIGASI — premium one-click cards to every executive page. The host
   routes `data-exa-nav` to the matching nav function. ─────────────────────── */

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
    title: 'Navigasi',
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
  const v = verdict(d);
  const hasAny = !!d.exec
    || num(d.wellness.driverCount) > 0
    || num(d.fleet.totalAssets) > 0
    || num(d.dispatchKpi.sampleSize) > 0;
  if (!hasAny) return `<div class="${ROOT}">${renderHero(model, d, v)}${renderGlobalEmpty()}${renderQuickNav()}</div>`;

  // Executive briefing hierarchy (v1.18.8.4) — meaning leads, numbers support;
  // less dashboard, more whitespace. Hero (ring anchor + large verdict + self-
  // explaining metrics) → Sorotan Hari Ini (one editorial insight per domain) →
  // Sorotan Eksekutif (spotlight) → Navigasi.
  return `<div class="${ROOT}">
    ${renderHero(model, d, v)}
    ${renderSummaryCards(d)}
    ${renderSpotlight(d, model)}
    ${renderQuickNav()}
  </div>`;
}
