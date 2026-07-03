/* ============================================================
   RECOMMENDATION-CARD.JS — Fleet Recommendation Engine (v1.19.7)

   The Executive Recommendation Card — the presentation of a single enriched
   recommendation from the Fleet Recommendation Engine. It shows, in one glance:
   category · title · priority · confidence · operational benefit · prediction
   reference · reason · estimated impact · execution window.

   PRESENTATION ONLY — it computes nothing. It is handed an already-derived
   Recommendation and only ARRANGES it, reusing the Executive UI Kit
   (ExecutiveStatusPill / anIcon / escHtml) plus a small, token-only `.rec-*`
   supplement. Dark-mode safe, no hardcoded colours, no inline styles beyond the
   width of a meter, no emoji. Every string is escaped (callers inject via
   innerHTML) so a vehicle name can never inject markup.

   Cards that describe a specific vehicle carry the shared `data-vehicle-predict`
   hook, so the Vehicle Prediction dashboard's EXISTING binder opens the enriched
   Recommendation drawer with zero new wiring.

   API:
     injectRecommendationStyles()   — idempotent <style> (also ensures kit styles)
     RecommendationCard(rec)         → string HTML
     RecommendationCardGrid(recs)    → string HTML grid (or empty state)
   ============================================================ */

'use strict';

import { ExecutiveStatusPill, ExecutiveEmptyState, anIcon, escHtml as esc } from './executive-ui-kit.js';

const STYLE_ID = 'rec-card-styles';

/* `.rec-*` supplement — recommendation card + priority/impact accents. Tokens
   only; dark-mode safe. The left accent uses the recommendation's PRIORITY tone,
   reusing the four Executive status tones (no new colour system). */
const CSS = `
.rec-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(19rem,1fr));gap:1rem;}
.rec-card{border:1px solid var(--border);border-left-width:3px;border-radius:14px;background:var(--surface-2);
  padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.6rem;min-width:0;}
.rec-card--click{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;}
.rec-card--click:hover{border-color:var(--text-dim,var(--muted));box-shadow:var(--shadow-sm);transform:translateY(-1px);}
.rec-card--click:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.rec-card--ok{border-left-color:var(--ok);}
.rec-card--info{border-left-color:var(--info);}
.rec-card--warn{border-left-color:var(--warn);}
.rec-card--danger{border-left-color:var(--danger);}
.rec-card__head{display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.rec-card__eye{display:inline-flex;align-items:center;gap:.4rem;font-size:.62rem;font-weight:800;
  text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
.rec-card__eye-ico{display:inline-flex;color:var(--muted);}
.rec-card__pills{display:inline-flex;align-items:center;gap:.35rem;flex-wrap:wrap;justify-content:flex-end;}
.rec-card__title{font-size:.98rem;font-weight:800;letter-spacing:-.01em;color:var(--text);line-height:1.28;margin:0;}
.rec-card__reason{font-size:.8rem;color:var(--muted);line-height:1.5;margin:0;}
.rec-card__benefit{font-size:.8rem;color:var(--text);line-height:1.5;
  border-left:2px solid var(--ok);padding-left:.55rem;}
.rec-card__benefit b{font-weight:800;color:var(--muted);font-size:.62rem;text-transform:uppercase;
  letter-spacing:.05em;display:block;margin-bottom:.1rem;}
.rec-card__meta{display:flex;flex-wrap:wrap;gap:.55rem .95rem;margin-top:.05rem;padding-top:.55rem;
  border-top:1px dashed var(--border);}
.rec-card__kv{display:flex;flex-direction:column;gap:.1rem;min-width:0;}
.rec-card__k{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.rec-card__v{font-size:.82rem;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;}
.rec-card__v[data-tone="ok"]{color:var(--ok);}
.rec-card__v[data-tone="warn"]{color:var(--warn);}
.rec-card__v[data-tone="danger"]{color:var(--danger);}
.rec-card__v[data-tone="info"]{color:var(--info);}

@media (prefers-reduced-motion: reduce){
  .rec-card--click{transition:none;}
}
`;

/** Inject the `.rec-*` supplement (idempotent, no-op outside a DOM). */
export function injectRecommendationStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }

/**
 * A single Executive Recommendation Card.
 * @param {Object} rec  a Recommendation from the Fleet Recommendation Engine
 * @returns {string} HTML
 */
export function RecommendationCard(rec) {
  const r = rec || {};
  const pr = r.priority || {};
  const cf = r.confidence || {};
  const ref = r.predictionRef || {};
  const impact = r.estimatedImpact || {};
  const tl = r.timeline || {};
  const accent = tone(pr.tone, 'info');
  const clickable = !!r.vehicleId;

  const priorityPill = ExecutiveStatusPill(`Prioritas ${esc(pr.label || '—')}`, tone(pr.tone, 'info'));
  const confPill = ExecutiveStatusPill(`Keyakinan ${esc(cf.levelWord || 'Rendah')}`, tone(cf.tone, 'warn'));

  const hook = clickable
    ? ` data-vehicle-predict="${esc(r.vehicleId)}" tabindex="0" role="button" aria-label="Detail rekomendasi ${esc(r.vehicleName)}"`
    : '';
  const cls = `rec-card rec-card--${accent}${clickable ? ' rec-card--click' : ''}`;

  const kv = (k, v, t) => `<div class="rec-card__kv"><span class="rec-card__k">${esc(k)}</span><span class="rec-card__v"${t ? ` data-tone="${esc(t)}"` : ''}>${esc(v)}</span></div>`;

  return `<article class="${cls}"${hook}>
      <div class="rec-card__head">
        <span class="rec-card__eye"><span class="rec-card__eye-ico">${anIcon(r.icon || 'analytics', { size: 13 })}</span>${esc(r.categoryLabel || 'Rekomendasi')}</span>
        <span class="rec-card__pills">${priorityPill}${confPill}</span>
      </div>
      <h4 class="rec-card__title">${esc(r.title || '—')}</h4>
      ${r.reason ? `<p class="rec-card__reason">${esc(r.reason)}</p>` : ''}
      <div class="rec-card__benefit"><b>Manfaat Operasional</b>${esc(r.expectedBenefit || '—')}</div>
      <div class="rec-card__meta">
        ${kv('Prediksi', `${ref.kindLabel || '—'} · ${ref.levelLabel || '—'}`)}
        ${kv('Estimasi Dampak', impact.label || '—', tone(impact.tone, 'info'))}
        ${kv('Jendela', tl.label || '—')}
      </div>
    </article>`;
}

/**
 * A responsive grid of recommendation cards.
 * @param {Array} recs
 * @param {{ emptyMessage?:string, emptyHint?:string, limit?:number }} [opts]
 * @returns {string} HTML
 */
export function RecommendationCardGrid(recs, opts = {}) {
  const list = Array.isArray(recs) ? recs.filter(Boolean) : [];
  if (!list.length) {
    return ExecutiveEmptyState({
      message: opts.emptyMessage || 'Tidak ada rekomendasi.',
      hint: opts.emptyHint || 'Rekomendasi akan muncul saat prediksi menuntut tindakan.',
    });
  }
  const limited = typeof opts.limit === 'number' ? list.slice(0, opts.limit) : list;
  return `<div class="rec-cards">${limited.map(RecommendationCard).join('')}</div>`;
}

export default {
  injectRecommendationStyles,
  RecommendationCard,
  RecommendationCardGrid,
};
