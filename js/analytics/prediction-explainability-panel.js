/* ============================================================
   PREDICTION-EXPLAINABILITY-PANEL.JS — Explainability presentation (v1.19.6)

   The PRESENTATION half of the Fleet Explainability layer. It renders the pure
   derivations from js/prediction/explainability.js into executive HTML, reusing
   the Executive UI Kit (ExecutiveStatusPill / anIcon / escHtml / EmptyState) plus
   a small, token-only `.pex-*` supplement for the two visuals the kit has no
   primitive for: the factor contribution bars and the methodology / insight
   cards. Dark-mode safe, no hardcoded colours, no inline styles, no emoji.

   PRESENTATION ONLY — it computes nothing. It is handed already-derived,
   already-certified structures and only ARRANGES them. Every string is escaped
   (callers inject via innerHTML), so a vehicle name can never inject markup.

   The panels are composition-friendly: the drawer drops each into an
   ExecutiveDrawerSection; the dashboard drops the Fleet Heatmap + Executive
   Insights straight into an ExecutiveSectionShell.
   ============================================================ */

'use strict';

import { ExecutiveStatusPill, ExecutiveEmptyState, anIcon, escHtml as esc } from './executive-ui-kit.js';

const STYLE_ID = 'pex-explainability-styles';

/* `.pex-*` supplement — factor bars, methodology / coverage cards, plain lists,
   fleet heatmap grid and executive insight cards. Tokens only; dark-mode safe. */
const CSS = `
.pex-factors{display:flex;flex-direction:column;gap:.85rem;}
.pex-factor{display:flex;flex-direction:column;gap:.32rem;}
.pex-factor__top{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.pex-factor__label{font-size:.86rem;font-weight:700;color:var(--text);letter-spacing:-.01em;}
.pex-factor__meta{display:inline-flex;align-items:center;gap:.5rem;}
.pex-factor__pct{font-size:.86rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;}
.pex-imp{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
  padding:.14rem .44rem;border-radius:999px;border:1px solid var(--border);color:var(--muted);white-space:nowrap;}
.pex-imp--high{color:var(--danger);border-color:var(--danger);}
.pex-imp--medium{color:var(--warn);border-color:var(--warn);}
.pex-imp--low{color:var(--muted);}
.pex-factor__bar{height:.5rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;}
.pex-factor__fill{display:block;height:100%;border-radius:999px;background:var(--info);transition:width .4s ease;}
.pex-factor__fill[data-tone="ok"]{background:var(--ok);}
.pex-factor__fill[data-tone="warn"]{background:var(--warn);}
.pex-factor__fill[data-tone="danger"]{background:var(--danger);}
.pex-factor__why{font-size:.76rem;color:var(--muted);line-height:1.5;}

.pex-card{border:1px solid var(--border);border-radius:12px;background:var(--surface-2);
  padding:.85rem 1rem;display:flex;flex-direction:column;gap:.55rem;}
.pex-card__eye{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
.pex-conf__num{font-size:1.9rem;font-weight:800;letter-spacing:-.02em;color:var(--text);
  font-variant-numeric:tabular-nums;line-height:1;display:flex;align-items:baseline;gap:.3rem;}
.pex-conf__num small{font-size:.9rem;font-weight:700;color:var(--muted);}
.pex-conf__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:.5rem;margin-top:.15rem;}
.pex-kv{display:flex;flex-direction:column;gap:.12rem;}
.pex-kv__k{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.pex-kv__v{font-size:.9rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;}

.pex-meth__chips{display:flex;flex-wrap:wrap;gap:.4rem;}
.pex-chip{font-size:.7rem;font-weight:600;color:var(--text);background:var(--surface);
  border:1px solid var(--border);border-radius:999px;padding:.24rem .6rem;}
.pex-meth__row{display:flex;gap:.5rem;font-size:.78rem;color:var(--muted);line-height:1.5;}
.pex-meth__row b{color:var(--text);font-weight:700;}

.pex-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem;}
.pex-list__li{display:flex;gap:.55rem;font-size:.8rem;color:var(--muted);line-height:1.5;}
.pex-list__li::before{content:"";flex:0 0 .4rem;height:.4rem;margin-top:.42rem;border-radius:50%;background:var(--muted);}
.pex-list--ok .pex-list__li::before{background:var(--ok);}
.pex-list--warn .pex-list__li::before{background:var(--warn);}

/* Historical trend */
.pex-trend{display:flex;align-items:center;gap:1.1rem;flex-wrap:wrap;}
.pex-trend__col{display:flex;flex-direction:column;gap:.1rem;}
.pex-trend__l{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.pex-trend__v{font-size:1.15rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;}
.pex-trend__delta{font-size:1rem;font-weight:800;font-variant-numeric:tabular-nums;}
.pex-trend__delta[data-tone="ok"]{color:var(--ok);}
.pex-trend__delta[data-tone="warn"]{color:var(--warn);}
.pex-trend__delta[data-tone="info"]{color:var(--muted);}

/* Fleet heatmap (dashboard) */
.pex-heat{display:grid;grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr));gap:.6rem;}
.pex-heat__cell{border:1px solid var(--border);border-left-width:3px;border-radius:12px;background:var(--surface-2);
  padding:.6rem .75rem;display:flex;flex-direction:column;gap:.28rem;text-align:left;cursor:pointer;
  transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;min-width:0;}
.pex-heat__cell:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px);}
.pex-heat__cell:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.pex-heat__cell--ok{border-left-color:var(--ok);}
.pex-heat__cell--warn{border-left-color:var(--warn);}
.pex-heat__cell--danger{border-left-color:var(--danger);}
.pex-heat__top{display:flex;align-items:center;gap:.4rem;}
.pex-heat__dot{flex:0 0 .55rem;height:.55rem;border-radius:50%;background:var(--muted);}
.pex-heat__cell--ok .pex-heat__dot{background:var(--ok);}
.pex-heat__cell--warn .pex-heat__dot{background:var(--warn);}
.pex-heat__cell--danger .pex-heat__dot{background:var(--danger);}
.pex-heat__name{font-size:.84rem;font-weight:800;color:var(--text);letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pex-heat__sub{font-size:.68rem;color:var(--muted);line-height:1.35;}

/* Executive insight cards (dashboard) */
.pex-insights{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.75rem;}
.pex-ins{border:1px solid var(--border);border-left-width:3px;border-radius:12px;background:var(--surface-2);
  padding:.8rem .95rem;display:flex;flex-direction:column;gap:.35rem;text-align:left;min-width:0;}
.pex-ins--click{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;}
.pex-ins--click:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px);}
.pex-ins--click:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.pex-ins--ok{border-left-color:var(--ok);}
.pex-ins--warn{border-left-color:var(--warn);}
.pex-ins--danger{border-left-color:var(--danger);}
.pex-ins--info{border-left-color:var(--info);}
.pex-ins__eye{display:flex;align-items:center;gap:.4rem;font-size:.6rem;font-weight:800;
  text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.pex-ins__ico{display:inline-flex;color:var(--muted);}
.pex-ins--ok .pex-ins__ico{color:var(--ok);}
.pex-ins--warn .pex-ins__ico{color:var(--warn);}
.pex-ins--danger .pex-ins__ico{color:var(--danger);}
.pex-ins--info .pex-ins__ico{color:var(--info);}
.pex-ins__val{font-size:1.35rem;font-weight:800;letter-spacing:-.02em;color:var(--text);
  font-variant-numeric:tabular-nums;line-height:1.1;}
.pex-ins__subject{font-size:.82rem;font-weight:700;color:var(--text);}
.pex-ins__detail{font-size:.72rem;color:var(--muted);line-height:1.45;}

@media (prefers-reduced-motion: reduce){
  .pex-factor__fill,.pex-heat__cell,.pex-ins--click{transition:none;}
}
`;

/** Inject the `.pex-*` supplement (idempotent, no-op outside a DOM). */
export function injectExplainabilityStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }

/* ── Contributing Factors ─────────────────────────────────────────────────── */

/**
 * @param {Array} factors  contributingFactors() output
 * @returns {string} HTML (or an executive empty state)
 */
export function ContributingFactorsPanel(factors) {
  const list = Array.isArray(factors) ? factors : [];
  if (!list.length) {
    return ExecutiveEmptyState({
      message: 'Tidak ada faktor yang menonjol.',
      hint: 'Keyakinan prediksi saat ini sudah memadai tanpa faktor risiko dominan.',
    });
  }
  const rows = list.map((f) => {
    const w = Math.max(0, Math.min(100, Number(f.contribution) || 0));
    const impCls = f.importanceKey === 'high' ? 'pex-imp--high' : f.importanceKey === 'medium' ? 'pex-imp--medium' : 'pex-imp--low';
    return `<div class="pex-factor">
        <div class="pex-factor__top">
          <span class="pex-factor__label">${esc(f.label)}</span>
          <span class="pex-factor__meta">
            <span class="pex-imp ${impCls}">${esc(f.importanceLabel)}</span>
            <span class="pex-factor__pct">${w}%</span>
          </span>
        </div>
        <span class="pex-factor__bar"><span class="pex-factor__fill" data-tone="${esc(tone(f.tone))}" style="width:${w}%"></span></span>
        <span class="pex-factor__why">${esc(f.explanation)}</span>
      </div>`;
  }).join('');
  return `<div class="pex-factors">${rows}</div>`;
}

/* ── Confidence Analytics ─────────────────────────────────────────────────── */

/**
 * @param {Object} analysis  confidenceAnalytics() output
 * @returns {string} HTML
 */
export function ConfidenceAnalyticsPanel(analysis) {
  const a = analysis || {};
  const kv = (k, v) => `<div class="pex-kv"><span class="pex-kv__k">${esc(k)}</span><span class="pex-kv__v">${esc(v)}</span></div>`;
  return `<div class="pex-card">
      <span class="pex-card__eye">Analisis Keyakinan</span>
      <span class="pex-conf__num">${esc(a.score != null ? a.score : 0)}<small>%</small></span>
      <div>${ExecutiveStatusPill(`Keyakinan ${esc(a.levelWord || 'Rendah')}`, tone(a.tone, 'warn'))}</div>
      <div class="pex-conf__grid">
        ${kv('Cakupan Data', `${a.coveragePct != null ? a.coveragePct : 0}%`)}
        ${kv('Faktor Terpakai', `${a.factorsUsed != null ? a.factorsUsed : 0}`)}
        ${kv('Jendela Prediksi', a.windowLabel || '—')}
      </div>
    </div>`;
}

/* ── Prediction Methodology ───────────────────────────────────────────────── */

/**
 * @param {Object} meth  predictionMethodology() output
 * @returns {string} HTML
 */
export function MethodologyPanel(meth) {
  const m = meth || {};
  const chips = (Array.isArray(m.methods) ? m.methods : [])
    .map((x) => `<span class="pex-chip">${esc(x)}</span>`).join('');
  return `<div class="pex-card">
      <span class="pex-card__eye">Metodologi</span>
      <div class="pex-meth__row"><b>Tipe:</b> ${esc(m.type || '—')}</div>
      ${chips ? `<div class="pex-meth__chips">${chips}</div>` : ''}
      <div class="pex-meth__row"><b>Tujuan:</b> ${esc(m.purpose || '—')}</div>
      <div class="pex-meth__row"><b>Audiens:</b> ${esc(m.audience || '—')}</div>
      ${m.note ? `<div class="pex-factor__why">${esc(m.note)}</div>` : ''}
    </div>`;
}

/* ── Historical Trend ─────────────────────────────────────────────────────── */

/**
 * @param {Object} hist  historicalComparison() output
 * @returns {string} HTML (informative message when no prior snapshot exists)
 */
export function HistoricalTrendPanel(hist) {
  const h = hist || {};
  if (!h.available) {
    return ExecutiveEmptyState({
      message: 'Perbandingan historis belum tersedia.',
      hint: h.message || 'Riwayat operasional tambahan akan memperkaya penjelasan prediksi berikutnya.',
    });
  }
  const sign = h.deltaPct > 0 ? '+' : '';
  return `<div class="pex-card">
      <span class="pex-card__eye">Tren Historis</span>
      <div class="pex-trend">
        <div class="pex-trend__col"><span class="pex-trend__l">Sebelumnya</span><span class="pex-trend__v">${esc(h.previous)}%</span></div>
        <div class="pex-trend__col"><span class="pex-trend__l">Saat Ini</span><span class="pex-trend__v">${esc(h.current)}%</span></div>
        <div class="pex-trend__col"><span class="pex-trend__l">Perubahan</span><span class="pex-trend__delta" data-tone="${esc(tone(h.tone))}">${esc(sign)}${esc(h.deltaPct)}</span></div>
      </div>
      <span class="pex-factor__why">${esc(h.message)}</span>
    </div>`;
}

/* ── Data Coverage ────────────────────────────────────────────────────────── */

export function DataCoveragePanel(coverage) {
  const c = coverage || {};
  const kv = (k, v) => `<div class="pex-kv"><span class="pex-kv__k">${esc(k)}</span><span class="pex-kv__v">${esc(v)}</span></div>`;
  return `<div class="pex-card">
      <span class="pex-card__eye">Cakupan Data</span>
      <div>${ExecutiveStatusPill(`Cakupan ${esc(c.coverageWord || '—')}`, tone(c.coverageTone, 'info'))}</div>
      <div class="pex-conf__grid">
        ${kv('Cakupan', `${c.coveragePct != null ? c.coveragePct : 0}%`)}
        ${kv('Faktor Terpakai', `${c.factorsUsed != null ? c.factorsUsed : 0}`)}
        ${kv('Jendela', c.windowLabel || '—')}
      </div>
    </div>`;
}

/* ── Plain lists (Limitations / Operational Notes) ────────────────────────── */

/**
 * @param {string[]} items
 * @param {'ok'|'warn'|''} [variant]
 * @returns {string} HTML
 */
export function NotesList(items, variant = '') {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!list.length) return '';
  const mod = variant === 'ok' ? ' pex-list--ok' : variant === 'warn' ? ' pex-list--warn' : '';
  return `<ul class="pex-list${mod}">${list.map((t) => `<li class="pex-list__li">${esc(t)}</li>`).join('')}</ul>`;
}

/* ── Fleet Heatmap (dashboard) ────────────────────────────────────────────── */

/**
 * @param {Array} cells  fleetHeatmap() output
 * @returns {string} HTML grid (cells carry the shared `data-vehicle-predict`
 *          hook so the dashboard's existing binder opens the enriched drawer).
 */
export function FleetHeatmap(cells) {
  const list = Array.isArray(cells) ? cells : [];
  if (!list.length) {
    return ExecutiveEmptyState({ message: 'Belum ada kendaraan untuk dipetakan.' });
  }
  const items = list.map((c) => `<div class="pex-heat__cell pex-heat__cell--${esc(tone(c.tone, 'ok'))}"
        data-vehicle-predict="${esc(c.id)}" tabindex="0" role="button" aria-label="Detail prediksi ${esc(c.name)} — ${esc(c.statusWord)}">
      <div class="pex-heat__top"><span class="pex-heat__dot"></span><span class="pex-heat__name">${esc(c.name)}</span></div>
      <span class="pex-heat__sub">${esc(c.headline)}</span>
    </div>`).join('');
  return `<div class="pex-heat">${items}</div>`;
}

/* ── Executive Insights (dashboard) ───────────────────────────────────────── */

/**
 * @param {Array} insights  executiveInsights() output
 * @returns {string} HTML grid (cards with a vehicleId carry `data-vehicle-predict`).
 */
export function ExecutiveInsightCards(insights) {
  const list = Array.isArray(insights) ? insights : [];
  if (!list.length) {
    return ExecutiveEmptyState({ message: 'Wawasan eksekutif akan muncul setelah tersedia data prediksi.' });
  }
  const cards = list.map((i) => {
    const t = tone(i.tone, 'info');
    const cls = `pex-ins pex-ins--${t}${i.vehicleId ? ' pex-ins--click' : ''}`;
    const hook = i.vehicleId
      ? ` data-vehicle-predict="${esc(i.vehicleId)}" tabindex="0" role="button" aria-label="Detail prediksi ${esc(i.subject)}"`
      : '';
    return `<div class="${cls}"${hook}>
        <span class="pex-ins__eye"><span class="pex-ins__ico">${anIcon(i.icon || 'analytics', { size: 13 })}</span>${esc(i.title)}</span>
        <span class="pex-ins__val">${esc(i.value)}</span>
        <span class="pex-ins__subject">${esc(i.subject)}</span>
        <span class="pex-ins__detail">${esc(i.detail)}</span>
      </div>`;
  }).join('');
  return `<div class="pex-insights">${cards}</div>`;
}

export default {
  injectExplainabilityStyles,
  ContributingFactorsPanel,
  ConfidenceAnalyticsPanel,
  MethodologyPanel,
  HistoricalTrendPanel,
  DataCoveragePanel,
  NotesList,
  FleetHeatmap,
  ExecutiveInsightCards,
};
