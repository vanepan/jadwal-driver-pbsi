/* ============================================================
   RECOMMENDATION-BOARD.JS — Fleet Recommendation Engine (v1.19.7)

   The executive presentation of the Fleet Recommendation Board, the Priority
   Timeline, the Executive Decision Support insights, and the positive
   No-Recommendation state. It renders the PURE derivations from
   js/recommendation/recommendation-summary.js into executive HTML.

   PRESENTATION ONLY — it computes nothing. It reuses the Executive UI Kit
   (ExecutiveSectionShell / ExecutiveStatusPill / ExecutiveEmptyState / anIcon /
   escHtml), the Recommendation Card, and the shared ExecutiveInsightCards (so
   Decision Support reads exactly like the Explainability insights), plus a small
   token-only `.rec-board-*` / `.rec-tl-*` supplement. Dark-mode safe, no
   hardcoded colours, no inline styles, no emoji, everything escaped.

   API:
     injectRecommendationBoardStyles()      — idempotent <style> (+ dependencies)
     FleetRecommendationBoard(board)         → string HTML
     RecommendationTimeline(buckets)         → string HTML
     DecisionSupportInsights(insights)       → string HTML
     NoRecommendationState(state)            → string HTML
   ============================================================ */

'use strict';

import { ExecutiveStatusPill, ExecutiveEmptyState, anIcon, escHtml as esc } from './executive-ui-kit.js';
import {
  injectRecommendationStyles,
  RecommendationCardGrid,
} from './recommendation-card.js';
import {
  injectExplainabilityStyles,
  ExecutiveInsightCards,
} from './prediction-explainability-panel.js';

const STYLE_ID = 'rec-board-styles';

const CSS = `
/* Board groups */
.rec-board{display:flex;flex-direction:column;gap:1.35rem;}
.rec-group{display:flex;flex-direction:column;gap:.7rem;}
.rec-group__head{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;}
.rec-group__ico{display:inline-flex;color:var(--muted);}
.rec-group--critical .rec-group__ico{color:var(--danger);}
.rec-group--upcoming .rec-group__ico{color:var(--warn);}
.rec-group--optimization .rec-group__ico{color:var(--info);}
.rec-group--healthy .rec-group__ico{color:var(--ok);}
.rec-group__title{font-size:.94rem;font-weight:800;letter-spacing:-.01em;color:var(--text);}
.rec-group__count{font-size:.66rem;font-weight:800;font-variant-numeric:tabular-nums;
  padding:.12rem .5rem;border-radius:999px;border:1px solid var(--border);color:var(--muted);}
.rec-group--critical .rec-group__count{color:var(--danger);border-color:var(--danger);}
.rec-group--upcoming .rec-group__count{color:var(--warn);border-color:var(--warn);}
.rec-group__desc{font-size:.74rem;color:var(--muted);margin-left:auto;}

/* Healthy chips + completed placeholder */
.rec-chips{display:flex;flex-wrap:wrap;gap:.4rem;}
.rec-chip{display:inline-flex;align-items:center;gap:.35rem;font-size:.76rem;font-weight:700;color:var(--text);
  background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.24rem .6rem;}
.rec-chip__dot{flex:0 0 .45rem;height:.45rem;border-radius:50%;background:var(--ok);}
.rec-note{font-size:.8rem;color:var(--muted);line-height:1.5;border:1px dashed var(--border);
  border-radius:12px;padding:.7rem .9rem;background:var(--surface-2);}

/* Priority Timeline */
.rec-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.15rem;}
.rec-tl__li{display:flex;gap:.85rem;}
.rec-tl__rail{display:flex;flex-direction:column;align-items:center;flex:0 0 auto;}
.rec-tl__dot{flex:0 0 .7rem;height:.7rem;border-radius:50%;background:var(--muted);margin-top:.25rem;}
.rec-tl__dot--ok{background:var(--ok);}
.rec-tl__dot--info{background:var(--info);}
.rec-tl__dot--warn{background:var(--warn);}
.rec-tl__dot--danger{background:var(--danger);}
.rec-tl__line{flex:1 1 auto;width:2px;background:var(--border);margin:.2rem 0;}
.rec-tl__li:last-child .rec-tl__line{display:none;}
.rec-tl__body{flex:1 1 auto;min-width:0;padding-bottom:1rem;}
.rec-tl__top{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;}
.rec-tl__when{font-size:.86rem;font-weight:800;color:var(--text);}
.rec-tl__note{font-size:.72rem;color:var(--muted);}
.rec-tl__count{margin-left:auto;font-size:.64rem;font-weight:800;font-variant-numeric:tabular-nums;
  padding:.1rem .46rem;border-radius:999px;border:1px solid var(--border);color:var(--muted);}
.rec-tl__recs{list-style:none;margin:.4rem 0 0;padding:0;display:flex;flex-direction:column;gap:.3rem;}
.rec-tl__rec{display:flex;align-items:baseline;gap:.5rem;font-size:.8rem;color:var(--muted);line-height:1.4;}
.rec-tl__rec-dot{flex:0 0 .38rem;height:.38rem;border-radius:50%;background:var(--muted);margin-top:.4rem;}
.rec-tl__rec-dot--ok{background:var(--ok);}
.rec-tl__rec-dot--info{background:var(--info);}
.rec-tl__rec-dot--warn{background:var(--warn);}
.rec-tl__rec-dot--danger{background:var(--danger);}
.rec-tl__rec b{color:var(--text);font-weight:700;}
.rec-tl__empty{font-size:.74rem;color:var(--muted);font-style:italic;margin-top:.25rem;}

/* No-recommendation (positive) state */
.rec-none{border:1px solid var(--border);border-left:4px solid var(--ok);border-radius:16px;
  background:var(--surface-2);padding:1.1rem 1.25rem;display:flex;flex-direction:column;gap:.65rem;}
.rec-none__head{display:flex;align-items:center;gap:.55rem;}
.rec-none__ico{display:inline-flex;color:var(--ok);}
.rec-none__title{font-size:1.15rem;font-weight:800;letter-spacing:-.01em;color:var(--text);}
.rec-none__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem;}
.rec-none__li{display:flex;gap:.55rem;font-size:.85rem;color:var(--muted);line-height:1.5;}
.rec-none__li::before{content:"";flex:0 0 .42rem;height:.42rem;margin-top:.42rem;border-radius:50%;background:var(--ok);}
`;

/** Inject the board supplement plus its presentation dependencies (idempotent). */
export function injectRecommendationBoardStyles() {
  injectRecommendationStyles();
  injectExplainabilityStyles();
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }

/* ── Fleet Recommendation Board ───────────────────────────────────────────────
   Renders the certified buckets: Critical → Upcoming → Optimization → Healthy →
   Completed. Cards are used for actionable groups; healthy is a compact chip
   row; completed is an honest placeholder (execution history not yet persisted). */

function group({ mod, icon, title, count, desc, content }) {
  const countChip = `<span class="rec-group__count">${esc(count)}</span>`;
  const descHtml = desc ? `<span class="rec-group__desc">${esc(desc)}</span>` : '';
  return `<section class="rec-group rec-group--${esc(mod)}">
      <div class="rec-group__head">
        <span class="rec-group__ico">${anIcon(icon, { size: 15 })}</span>
        <span class="rec-group__title">${esc(title)}</span>
        ${countChip}${descHtml}
      </div>
      ${content}
    </section>`;
}

function healthyChips(recs) {
  const list = Array.isArray(recs) ? recs : [];
  if (!list.length) return '<div class="rec-note">Belum ada kendaraan dengan status sepenuhnya sehat pada jendela ini.</div>';
  const chips = list.slice(0, 24).map((r) =>
    `<span class="rec-chip"><span class="rec-chip__dot"></span>${esc(r.vehicleName)}</span>`).join('');
  const more = list.length > 24 ? `<span class="rec-chip">+${list.length - 24}</span>` : '';
  return `<div class="rec-chips">${chips}${more}</div>`;
}

/**
 * @param {Object} board  recommendationBoard() output
 * @returns {string} HTML
 */
export function FleetRecommendationBoard(board) {
  const b = board || {};
  const c = b.counts || {};

  const groups = [
    group({
      mod: 'critical', icon: 'alert', title: 'Rekomendasi Kritis', count: c.critical || 0,
      desc: 'Perlu tindakan pada jendela prediksi',
      content: RecommendationCardGrid(b.critical, {
        emptyMessage: 'Tidak ada rekomendasi kritis.',
        emptyHint: 'Tidak ada kendaraan yang menuntut tindakan mendesak.',
      }),
    }),
    group({
      mod: 'upcoming', icon: 'pulse', title: 'Rekomendasi Mendatang', count: c.upcoming || 0,
      desc: 'Tindakan preventif & pemantauan',
      content: RecommendationCardGrid(b.upcoming, {
        emptyMessage: 'Tidak ada rekomendasi mendatang.',
        emptyHint: 'Tidak ada tekanan operasional yang perlu diantisipasi.',
      }),
    }),
    group({
      mod: 'optimization', icon: 'analytics', title: 'Peluang Optimasi', count: c.optimization || 0,
      desc: 'Peningkatan efisiensi armada',
      content: RecommendationCardGrid(b.optimization, {
        emptyMessage: 'Belum ada peluang optimasi.',
        emptyHint: 'Peluang optimasi akan muncul saat domain armada berada dalam kondisi sangat sehat.',
      }),
    }),
    group({
      mod: 'healthy', icon: 'check', title: 'Armada Sehat', count: c.healthy || 0,
      desc: 'Tidak memerlukan tindakan',
      content: healthyChips(b.healthy),
    }),
    group({
      mod: 'completed', icon: 'check', title: 'Rekomendasi Selesai', count: c.completed || 0,
      desc: 'Riwayat pelaksanaan',
      content: '<div class="rec-note">Riwayat pelaksanaan rekomendasi akan tercatat di sini seiring tindakan operasional dijalankan.</div>',
    }),
  ];

  return `<div class="rec-board">${groups.join('')}</div>`;
}

/* ── Priority Timeline ────────────────────────────────────────────────────────
   Recommendations grouped by recommended execution window (Immediate → Later). */

function timelineRow(bucket) {
  const recs = Array.isArray(bucket.recs) ? bucket.recs : [];
  const dotTone = recs.length
    ? tone(recs[0].priority && recs[0].priority.tone, 'info')
    : 'info';
  const body = recs.length
    ? `<ul class="rec-tl__recs">${recs.slice(0, 6).map((r) => {
        const t = tone(r.priority && r.priority.tone, 'info');
        return `<li class="rec-tl__rec"><span class="rec-tl__rec-dot rec-tl__rec-dot--${t}"></span><span><b>${esc(r.vehicleName)}</b> — ${esc(r.title)}</span></li>`;
      }).join('')}</ul>`
    : '<div class="rec-tl__empty">Tidak ada tindakan pada jendela ini.</div>';
  return `<li class="rec-tl__li">
      <div class="rec-tl__rail"><span class="rec-tl__dot rec-tl__dot--${dotTone}"></span><span class="rec-tl__line"></span></div>
      <div class="rec-tl__body">
        <div class="rec-tl__top"><span class="rec-tl__when">${esc(bucket.label)}</span><span class="rec-tl__note">${esc(bucket.note)}</span><span class="rec-tl__count">${recs.length}</span></div>
        ${body}
      </div>
    </li>`;
}

/**
 * @param {Array} buckets  recommendationTimeline() output
 * @returns {string} HTML
 */
export function RecommendationTimeline(buckets) {
  const list = Array.isArray(buckets) ? buckets : [];
  const total = list.reduce((n, b) => n + (Array.isArray(b.recs) ? b.recs.length : 0), 0);
  if (!total) {
    return ExecutiveEmptyState({
      message: 'Tidak ada tindakan terjadwal.',
      hint: 'Seluruh armada diproyeksikan siap — tidak ada rekomendasi yang perlu dijadwalkan.',
    });
  }
  return `<ul class="rec-tl">${list.map(timelineRow).join('')}</ul>`;
}

/* ── Executive Decision Support ───────────────────────────────────────────────
   Reuses the shared ExecutiveInsightCards so decision insights read exactly like
   the Explainability insights (cards with a vehicleId carry the drawer hook). */
export function DecisionSupportInsights(insights) {
  const list = Array.isArray(insights) ? insights : [];
  if (!list.length) {
    return ExecutiveEmptyState({
      message: 'Dukungan keputusan akan muncul saat tersedia rekomendasi.',
      hint: 'Wawasan keputusan dihasilkan dari rekomendasi yang tersertifikasi.',
    });
  }
  return ExecutiveInsightCards(list);
}

/* ── No Recommendation State (positive) ──────────────────────────────────────── */

export function NoRecommendationState(state) {
  const s = state || {};
  const items = (Array.isArray(s.messages) ? s.messages : []).filter(Boolean)
    .map((m) => `<li class="rec-none__li">${esc(m)}</li>`).join('');
  return `<div class="rec-none">
      <div class="rec-none__head">
        <span class="rec-none__ico">${anIcon('check', { size: 18 })}</span>
        <span class="rec-none__title">${esc(s.title || 'Armada Beroperasi Normal')}</span>
      </div>
      <ul class="rec-none__list">${items}</ul>
    </div>`;
}

export default {
  injectRecommendationBoardStyles,
  FleetRecommendationBoard,
  RecommendationTimeline,
  DecisionSupportInsights,
  NoRecommendationState,
};
