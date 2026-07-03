/* ============================================================
   SIMULATION-SUMMARY.JS — Scenario Simulation Engine (v1.19.8)

   The presentation of a simulation comparison: the Current-vs-Simulation metric
   table, the executive impact summary, the recommendation comparison, the
   simulation timeline, and the confidence row.

   PRESENTATION ONLY — it computes nothing. It is handed an already-built
   comparison (js/simulation/scenario-comparison.js) and only ARRANGES it, reusing
   the Executive UI Kit (ExecutiveStatusPill / anIcon / escHtml / EmptyState) plus
   a small, token-only `.sim-*` supplement. Dark-mode safe, no hardcoded colours,
   no inline styles beyond a meter width, no emoji, everything escaped.

   These builders are composition-friendly: the interactive Simulation Panel and
   the vehicle drawer both drop them into their own containers / drawer sections.

   API:
     injectSimulationSummaryStyles()
     ComparisonTable(metrics)          → string
     ImpactSummaryCard(impact)         → string
     RecommendationComparison(changes) → string
     SimulationTimeline(steps)         → string
     ConfidenceRow(confidence)         → string
   ============================================================ */

'use strict';

import { ExecutiveStatusPill, ExecutiveEmptyState, anIcon, escHtml as esc } from './executive-ui-kit.js';

const STYLE_ID = 'sim-summary-styles';

const CSS = `
/* Current vs Simulation table */
.sim-cmp{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.sim-cmp__head,.sim-cmp__row{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:.5rem;align-items:center;padding:.5rem .8rem;}
.sim-cmp__head{background:var(--surface-2);font-size:.6rem;font-weight:800;text-transform:uppercase;
  letter-spacing:.05em;color:var(--muted);}
.sim-cmp__row{border-top:1px solid var(--border);font-variant-numeric:tabular-nums;}
.sim-cmp__l{font-size:.8rem;font-weight:700;color:var(--text);}
.sim-cmp__v{font-size:.82rem;color:var(--text);text-align:right;}
.sim-cmp__v--muted{color:var(--muted);}
.sim-cmp__d{font-size:.8rem;font-weight:800;text-align:right;color:var(--muted);}
.sim-cmp__d[data-tone="ok"]{color:var(--ok);}
.sim-cmp__d[data-tone="danger"]{color:var(--danger);}
.sim-cmp__d[data-tone="info"]{color:var(--muted);}

/* Impact summary */
.sim-impact{border:1px solid var(--border);border-left:4px solid var(--info);border-radius:14px;
  background:var(--surface-2);padding:.95rem 1.1rem;display:flex;flex-direction:column;gap:.6rem;}
.sim-impact__title{font-size:.98rem;font-weight:800;color:var(--text);letter-spacing:-.01em;line-height:1.3;}
.sim-impact__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem;}
.sim-impact__li{display:flex;align-items:baseline;justify-content:space-between;gap:.8rem;
  font-size:.82rem;padding:.25rem 0;border-bottom:1px dashed var(--border);}
.sim-impact__li:last-child{border-bottom:0;}
.sim-impact__k{color:var(--muted);font-weight:700;}
.sim-impact__val{font-weight:800;font-variant-numeric:tabular-nums;color:var(--text);}
.sim-impact__val[data-tone="ok"]{color:var(--ok);}
.sim-impact__val[data-tone="danger"]{color:var(--danger);}
.sim-impact__val[data-tone="warn"]{color:var(--warn);}
.sim-impact__val[data-tone="info"]{color:var(--muted);}

/* Recommendation comparison */
.sim-recs{display:flex;flex-direction:column;gap:.6rem;}
.sim-rec{border:1px solid var(--border);border-radius:12px;background:var(--surface-2);padding:.7rem .85rem;
  display:flex;flex-direction:column;gap:.45rem;}
.sim-rec__top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
.sim-rec__who{font-size:.86rem;font-weight:800;color:var(--text);}
.sim-rec__flow{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
.sim-rec__arrow{display:inline-flex;color:var(--muted);}
.sim-rec__chg{font-size:.7rem;color:var(--muted);}
.sim-rec__chg b{color:var(--text);font-weight:700;}
.sim-rec__same{font-size:.76rem;color:var(--muted);font-style:italic;}

/* Simulation timeline */
.sim-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.15rem;}
.sim-tl__li{display:flex;gap:.8rem;}
.sim-tl__rail{display:flex;flex-direction:column;align-items:center;flex:0 0 auto;}
.sim-tl__dot{flex:0 0 .7rem;height:.7rem;border-radius:50%;background:var(--muted);margin-top:.25rem;}
.sim-tl__dot--ok{background:var(--ok);}
.sim-tl__dot--info{background:var(--info);}
.sim-tl__dot--warn{background:var(--warn);}
.sim-tl__dot--danger{background:var(--danger);}
.sim-tl__line{flex:1 1 auto;width:2px;background:var(--border);margin:.2rem 0;}
.sim-tl__li:last-child .sim-tl__line{display:none;}
.sim-tl__body{flex:1 1 auto;min-width:0;padding-bottom:.85rem;}
.sim-tl__top{display:flex;align-items:baseline;gap:.55rem;flex-wrap:wrap;}
.sim-tl__when{font-size:.82rem;font-weight:800;color:var(--text);}
.sim-tl__title{font-size:.8rem;font-weight:700;color:var(--text);}
.sim-tl__d{font-size:.76rem;color:var(--muted);line-height:1.45;margin-top:.1rem;}

.sim-conf{display:inline-flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--muted);}
.sim-conf b{color:var(--text);font-weight:700;}
`;

export function injectSimulationSummaryStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }
const ARROW = { up: '▲', down: '▼', flat: '' };

/* ── Current vs Simulation ────────────────────────────────────────────────── */

export function ComparisonTable(metrics) {
  const list = Array.isArray(metrics) ? metrics : [];
  if (!list.length) return ExecutiveEmptyState({ message: 'Perbandingan belum tersedia.' });
  const rows = list.map((m) => {
    const arrow = ARROW[m.direction] || '';
    return `<div class="sim-cmp__row">
        <span class="sim-cmp__l">${esc(m.label)}</span>
        <span class="sim-cmp__v sim-cmp__v--muted">${esc(m.current)}</span>
        <span class="sim-cmp__v">${esc(m.simulated)}</span>
        <span class="sim-cmp__d" data-tone="${esc(tone(m.tone))}">${arrow ? `${arrow} ` : ''}${esc(m.deltaText)}</span>
      </div>`;
  }).join('');
  return `<div class="sim-cmp">
      <div class="sim-cmp__head"><span>Metrik</span><span style="text-align:right">Saat Ini</span><span style="text-align:right">Simulasi</span><span style="text-align:right">Selisih</span></div>
      ${rows}
    </div>`;
}

/* ── Executive Impact Summary ─────────────────────────────────────────────── */

export function ImpactSummaryCard(impact) {
  const i = impact || {};
  const items = (Array.isArray(i.lines) ? i.lines : []).map((l) =>
    `<li class="sim-impact__li"><span class="sim-impact__k">${esc(l.label)}</span><span class="sim-impact__val" data-tone="${esc(tone(l.tone))}">${esc(l.value)}</span></li>`).join('');
  return `<div class="sim-impact">
      <div class="sim-impact__title">${esc(i.title || 'Ringkasan Dampak')}</div>
      <ul class="sim-impact__list">${items}</ul>
    </div>`;
}

/* ── Recommendation Comparison ────────────────────────────────────────────── */

export function RecommendationComparison(changes) {
  const list = Array.isArray(changes) ? changes : [];
  if (!list.length) {
    return ExecutiveEmptyState({
      message: 'Rekomendasi tidak berubah.',
      hint: 'Skenario ini tidak mengubah rekomendasi armada.',
    });
  }
  const cards = list.slice(0, 8).map((c) => {
    const b = c.before; const a = c.after;
    const flow = `<span class="sim-rec__flow">
        ${ExecutiveStatusPill(esc(b.priorityLabel), tone(b.priorityTone))}
        <span class="sim-rec__arrow">${anIcon('analytics', { size: 12 })}→</span>
        ${ExecutiveStatusPill(esc(a.priorityLabel), tone(a.priorityTone))}
      </span>`;
    const chgBits = [];
    if (c.changed.priority) chgBits.push(`<b>Prioritas</b> ${esc(b.priorityLabel)} → ${esc(a.priorityLabel)}`);
    if (c.changed.confidence) chgBits.push(`<b>Keyakinan</b> ${esc(b.confidenceWord)} → ${esc(a.confidenceWord)}`);
    if (c.changed.impact) chgBits.push(`<b>Dampak</b> ${esc(b.impactLabel)} → ${esc(a.impactLabel)}`);
    if (c.changed.category) chgBits.push(`<b>Kategori</b> ${esc(b.categoryLabel)} → ${esc(a.categoryLabel)}`);
    const detail = chgBits.length
      ? `<div class="sim-rec__chg">${chgBits.join(' · ')}</div>`
      : '<div class="sim-rec__same">Tidak ada perubahan prioritas.</div>';
    return `<div class="sim-rec">
        <div class="sim-rec__top"><span class="sim-rec__who">${esc(c.vehicleName)}</span>${flow}</div>
        ${detail}
      </div>`;
  }).join('');
  return `<div class="sim-recs">${cards}</div>`;
}

/* ── Simulation Timeline ──────────────────────────────────────────────────── */

export function SimulationTimeline(steps) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return '';
  const items = list.map((s) => `<li class="sim-tl__li">
      <div class="sim-tl__rail"><span class="sim-tl__dot sim-tl__dot--${esc(tone(s.tone))}"></span><span class="sim-tl__line"></span></div>
      <div class="sim-tl__body">
        <div class="sim-tl__top"><span class="sim-tl__when">${esc(s.when)}</span><span class="sim-tl__title">${esc(s.title)}</span></div>
        <div class="sim-tl__d">${esc(s.detail)}</div>
      </div></li>`).join('');
  return `<ul class="sim-tl">${items}</ul>`;
}

/* ── Confidence row ───────────────────────────────────────────────────────── */

export function ConfidenceRow(confidence) {
  const c = confidence;
  if (!c) return '';
  const cur = c.current || {}; const sim = c.simulated || {};
  const changed = c.changed
    ? `${esc(cur.score)}% → <b>${esc(sim.score)}%</b>`
    : `<b>${esc(sim.score)}%</b> (tidak berubah)`;
  return `<div class="sim-conf">${anIcon('pulse', { size: 13 })} Keyakinan Prediksi: ${changed}</div>`;
}

export default {
  injectSimulationSummaryStyles,
  ComparisonTable,
  ImpactSummaryCard,
  RecommendationComparison,
  SimulationTimeline,
  ConfidenceRow,
};
