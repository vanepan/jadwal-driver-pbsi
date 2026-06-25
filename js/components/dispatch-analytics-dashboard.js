/* ============================================================
   DISPATCH-ANALYTICS-DASHBOARD.JS — Dispatch Intelligence Analytics
   (v1.17.0)

   The premium, Apple-style executive dashboard that visualizes the Dispatch
   Intelligence Analytics model (js/analytics/dispatch-analytics-engine.js). It
   is a PURE RENDER layer: it computes nothing, it only turns the model into
   markup. All section math is the engine's; this file owns presentation only.

   DESIGN: built entirely on the platform CSS custom properties (var(--surface),
   --surface-2, --border, --text, --muted, --info/--info-bg, --warn/--warn-bg,
   --ok/--ok-bg, --danger/--danger-bg, --accent/--on-accent, --shadow-sm) so it
   adapts to dark mode automatically (no hard-coded #fff — the --white trap) and
   is fully responsive (CSS grid with auto-fit, min-width:0, no horizontal
   scroll). Every dynamic value is HTML-escaped, so a driver / vehicle / bidang
   name can never inject markup. Styles are injected ONCE under scoped `.daa-*`.

   API:
     injectDispatchAnalyticsStyles()                       — idempotent <style>
     renderDispatchAnalyticsDashboard(model, opts) → string — full dashboard HTML
   `opts.trendWindow` (7d|30d|90d|ytd) selects the active trend window; the host
   re-calls render with a new window on toggle.
   ============================================================ */

'use strict';

const STYLE_ID = 'daa-dashboard-styles';

const CSS = `
.daa{display:flex;flex-direction:column;gap:1.1rem;min-width:0;color:var(--text);
  font-family:var(--font-sans, inherit);}
.daa *{box-sizing:border-box;}

/* Section shell */
.daa-sec{border:1px solid var(--border);border-radius:18px;background:var(--surface);
  padding:1.05rem 1.15rem;display:flex;flex-direction:column;gap:.85rem;box-shadow:var(--shadow-sm);
  min-width:0;}
.daa-sec__head{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;flex-wrap:wrap;}
.daa-sec__title{font-size:.95rem;font-weight:800;letter-spacing:-.01em;color:var(--text);
  display:flex;align-items:center;gap:.5rem;}
.daa-sec__sub{font-size:.72rem;color:var(--muted);}
.daa-sec__hint{font-size:.66rem;color:var(--muted);font-style:italic;}

/* Empty state */
.daa-empty{display:flex;flex-direction:column;align-items:center;gap:.4rem;
  padding:1.6rem 1rem;text-align:center;color:var(--muted);}
.daa-empty__ic{font-size:1.8rem;opacity:.7;}
.daa-empty__t{font-size:.9rem;font-weight:700;color:var(--text);}
.daa-empty__d{font-size:.76rem;max-width:32rem;}

/* KPI hero grid */
.daa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.8rem;}
.daa-kpi{border:1px solid var(--border);border-radius:15px;padding:.85rem .95rem;
  background:linear-gradient(180deg, var(--surface-2), var(--surface));
  display:flex;flex-direction:column;gap:.3rem;min-width:0;}
.daa-kpi--hero{border-color:var(--info);background:linear-gradient(180deg, var(--info-bg), var(--surface));}
.daa-kpi__lbl{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.daa-kpi__num{font-size:1.9rem;font-weight:800;letter-spacing:-.02em;color:var(--text);line-height:1.05;}
.daa-kpi__sub{font-size:.66rem;color:var(--muted);}
.daa-kpi__stars{font-size:1rem;color:var(--warn);letter-spacing:.06em;}

/* Header band */
.daa-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.daa-top__l{display:flex;flex-direction:column;gap:.25rem;min-width:0;}
.daa-top__title{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:var(--text);
  display:flex;align-items:center;gap:.5rem;}
.daa-top__sub{font-size:.76rem;color:var(--muted);max-width:42rem;}
.daa-top__meta{font-size:.66rem;color:var(--muted);}
.daa-top__actions{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
.daa-btn{display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;
  font-size:.76rem;font-weight:700;color:var(--text);background:var(--surface);
  border:1px solid var(--border);border-radius:10px;padding:.45rem .75rem;
  transition:filter .15s ease, background .15s ease;}
.daa-btn:hover{background:var(--surface-2);}
.daa-btn--accent{color:var(--on-accent);background:var(--accent);border-color:var(--accent);}
.daa-btn--accent:hover{filter:brightness(1.06);background:var(--accent);}

/* Toggle group */
.daa-toggle{display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.daa-toggle__b{cursor:pointer;font-size:.72rem;font-weight:700;color:var(--muted);
  background:var(--surface);border:0;padding:.4rem .7rem;transition:background .15s ease,color .15s ease;}
.daa-toggle__b + .daa-toggle__b{border-left:1px solid var(--border);}
.daa-toggle__b[data-active="true"]{background:var(--accent);color:var(--on-accent);}

/* Distribution rows */
.daa-dist{display:flex;flex-direction:column;gap:.45rem;}
.daa-dist__row{display:grid;grid-template-columns:6.5rem 1fr auto;align-items:center;gap:.7rem;}
.daa-dist__stars{font-size:.92rem;color:var(--warn);letter-spacing:.04em;white-space:nowrap;}
.daa-bar{height:.62rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);
  overflow:hidden;min-width:2rem;}
.daa-bar__fill{height:100%;background:var(--info);border-radius:999px;}
.daa-bar__fill--ok{background:var(--ok);}
.daa-bar__fill--warn{background:var(--warn);}
.daa-bar__fill--danger{background:var(--danger);}
.daa-dist__meta{font-size:.74rem;color:var(--muted);white-space:nowrap;text-align:right;}
.daa-dist__meta b{color:var(--text);font-weight:700;}

/* Tables */
.daa-tablewrap{width:100%;min-width:0;max-width:100%;overflow-x:auto;
  -webkit-overflow-scrolling:touch;}
.daa-table{width:100%;border-collapse:collapse;font-size:.78rem;min-width:0;}
.daa-table th,.daa-table td{text-align:left;padding:.45rem .55rem;border-bottom:1px solid var(--border);
  white-space:nowrap;}
.daa-table th{font-size:.64rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.daa-table td.daa-num,.daa-table th.daa-num{text-align:right;}
.daa-table td.daa-name{white-space:normal;font-weight:700;color:var(--text);max-width:14rem;}
.daa-table tbody tr:last-child td{border-bottom:0;}
.daa-pill{display:inline-block;font-size:.64rem;font-weight:700;border-radius:999px;padding:.1rem .45rem;
  border:1px solid var(--border);color:var(--muted);background:var(--surface-2);}
.daa-pill--ok{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.daa-pill--warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn);}
.daa-pill--danger{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

/* Two-column layout helper */
.daa-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1.1rem;}

/* Rankings */
.daa-rank{display:flex;flex-direction:column;gap:.55rem;}
.daa-rank__h{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.daa-rank__list{display:flex;flex-direction:column;gap:.35rem;margin:0;padding:0;list-style:none;}
.daa-rank__item{display:flex;align-items:center;gap:.6rem;font-size:.8rem;}
.daa-rank__n{flex:0 0 1.3rem;height:1.3rem;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:.66rem;font-weight:800;color:var(--on-accent);background:var(--accent);}
.daa-rank__nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-weight:600;color:var(--text);}
.daa-rank__v{flex:0 0 auto;font-size:.72rem;color:var(--muted);}
.daa-rank__v b{color:var(--text);}

/* Funnel */
.daa-funnel{display:flex;flex-direction:column;gap:.5rem;}
.daa-funnel__row{display:grid;grid-template-columns:9rem 1fr auto;align-items:center;gap:.7rem;}
.daa-funnel__k{font-size:.78rem;font-weight:600;color:var(--text);}
.daa-funnel__meta{font-size:.74rem;color:var(--muted);white-space:nowrap;text-align:right;}
.daa-funnel__meta b{color:var(--text);}

/* Timeline */
.daa-tl{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;}
.daa-tl__li{display:flex;gap:.7rem;position:relative;padding:0 0 .85rem;}
.daa-tl__li:last-child{padding-bottom:0;}
.daa-tl__rail{flex:0 0 .8rem;display:flex;flex-direction:column;align-items:center;}
.daa-tl__dot{width:.7rem;height:.7rem;border-radius:50%;margin-top:.2rem;background:var(--info);border:2px solid var(--surface);}
.daa-tl__dot--ok{background:var(--ok);}
.daa-tl__dot--warn{background:var(--warn);}
.daa-tl__dot--danger{background:var(--danger);}
.daa-tl__line{flex:1 1 auto;width:2px;background:var(--border);margin-top:.1rem;}
.daa-tl__li:last-child .daa-tl__line{display:none;}
.daa-tl__body{display:flex;flex-direction:column;gap:.15rem;min-width:0;padding-bottom:.2rem;}
.daa-tl__top{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;}
.daa-tl__when{font-size:.68rem;color:var(--muted);font-variant-numeric:tabular-nums;}
.daa-tl__title{font-size:.82rem;font-weight:700;color:var(--text);}
.daa-tl__d{font-size:.72rem;color:var(--muted);}

/* Reason chips */
.daa-reasons{display:flex;flex-direction:column;gap:.4rem;margin:0;padding:0;list-style:none;}
.daa-reasons__li{display:flex;align-items:center;gap:.6rem;font-size:.8rem;}
.daa-reasons__txt{flex:1 1 auto;min-width:0;color:var(--text);}
.daa-reasons__n{flex:0 0 auto;font-size:.7rem;font-weight:700;color:var(--muted);
  background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:.1rem .5rem;}

/* Trend window summary cards */
.daa-trendcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:.7rem;}
.daa-trendcard{border:1px solid var(--border);border-radius:13px;padding:.7rem .8rem;background:var(--surface-2);
  display:flex;flex-direction:column;gap:.2rem;}
.daa-trendcard__lbl{font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.daa-trendcard__num{font-size:1.25rem;font-weight:800;color:var(--text);}
.daa-trendcard__sub{font-size:.62rem;color:var(--muted);}

/* Sparkline (CSS columns) */
.daa-spark{display:flex;align-items:flex-end;gap:3px;height:3.2rem;padding-top:.2rem;}
.daa-spark__col{flex:1 1 auto;min-width:3px;background:var(--info);border-radius:3px 3px 0 0;opacity:.85;}
.daa-spark__col--empty{background:var(--surface-2);}

@media (max-width:560px){
  .daa-dist__row{grid-template-columns:5rem 1fr;}
  .daa-dist__meta{grid-column:1 / -1;text-align:left;}
  .daa-funnel__row{grid-template-columns:7rem 1fr;}
  .daa-funnel__meta{grid-column:1 / -1;text-align:left;}
}
`;

/** Inject the dashboard stylesheet once (browser-only; safe no-op in node). */
export function injectDispatchAnalyticsStyles() {
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
function pct(n) { return `${Math.round(Number(n) || 0)}%`; }
function stars(n) {
  const s = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}
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
/** Acceptance/quality color class from a 0–100 rate. */
function rateClass(rate) {
  const r = Number(rate) || 0;
  if (r >= 75) return 'ok';
  if (r >= 50) return 'warn';
  return 'danger';
}

/* ── section renderers ────────────────────────────────────────────────── */

const TREND_WINDOWS = ['7d', '30d', '90d', 'ytd'];

function renderHeader(model, opts) {
  const win = TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d';
  const toggles = model.trends.windows.map((w) =>
    `<button type="button" class="daa-toggle__b" data-daa-window="${esc(w.key)}" data-active="${w.key === win}">${esc(w.label)}</button>`,
  ).join('');
  return `
    <div class="daa-top">
      <div class="daa-top__l">
        <div class="daa-top__title">📊 Dispatch Intelligence Analytics</div>
        <div class="daa-top__sub">Dashboard eksekutif untuk riwayat keputusan Dispatch Intelligence — akurasi, override, confidence, dan tren. Read-only; tidak mengubah rekomendasi atau penugasan.</div>
        <div class="daa-top__meta">Diperbarui ${esc(fmtTime(model.generatedAt))} · ${esc(model.totals.decisions)} keputusan tercatat</div>
      </div>
      <div class="daa-top__actions">
        <div class="daa-toggle" role="group" aria-label="Rentang tren">${toggles}</div>
        <button type="button" class="daa-btn" data-daa-export="pdf">⬇️ PDF</button>
        <button type="button" class="daa-btn daa-btn--accent" data-daa-export="excel">⬇️ Excel</button>
      </div>
    </div>`;
}

function renderKpis(model) {
  const k = model.kpi;
  // `value` is pre-formatted markup the caller controls (numbers, percent
  // strings, or a star <span>); `sub` is likewise caller-built. Static labels +
  // engine numbers only — no user text flows in unescaped here.
  const card = (lbl, value, sub, hero) =>
    `<div class="daa-kpi${hero ? ' daa-kpi--hero' : ''}">
      <div class="daa-kpi__lbl">${esc(lbl)}</div>
      <div class="daa-kpi__num">${value}</div>
      <div class="daa-kpi__sub">${sub}</div>
    </div>`;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">Ringkasan Eksekutif</div>
        <div class="daa-sec__sub">${esc(k.sampleSize)} sampel keputusan</div></div>
      <div class="daa-kpis">
        ${card('Akurasi Dispatch', pct(k.dispatchAccuracy), 'Rekomendasi diterima / total', true)}
        ${card('Tingkat Override', pct(k.overrideRate), 'Keputusan override / total')}
        ${card('Penerimaan Rekomendasi', pct(k.recommendationAcceptance), 'Diterima tanpa perubahan')}
        ${card('Rata-rata Skor Dispatch', esc(k.avgDispatchScore), 'Skala 0–100')}
        ${card('Rata-rata Confidence', `<span class="daa-kpi__stars">${esc(stars(k.avgConfidence.stars))}</span>`, `${esc(k.avgConfidence.label)} · ${esc(k.avgConfidence.stars)}★ rata-rata`)}
      </div>
    </div>`;
}

function renderDistribution(model) {
  const total = model.totals.decisions;
  const rows = model.confidenceDistribution.map((r) => {
    const cls = r.count === 0 ? '' : rateClass(r.acceptanceRate);
    return `<div class="daa-dist__row">
      <div class="daa-dist__stars" title="${esc(r.label)}">${esc(r.glyph)}</div>
      <div class="daa-bar"><div class="daa-bar__fill${cls ? ' daa-bar__fill--' + cls : ''}" style="width:${esc(r.percentage)}%"></div></div>
      <div class="daa-dist__meta"><b>${esc(r.count)}</b> · ${esc(r.percentage)}% · terima ${esc(r.acceptanceRate)}%</div>
    </div>`;
  }).join('');
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">Distribusi Confidence</div>
        <div class="daa-sec__hint">Skala 2★–5★ (banding sistem); 1★ kosong sesuai definisi</div></div>
      <div class="daa-dist">${rows || emptyInline('Belum ada keputusan.')}</div>
      <div class="daa-sec__sub">${total} keputusan · kolom: jumlah · porsi · tingkat penerimaan per band</div>
    </div>`;
}

function driverTable(rows) {
  if (!rows.length) return emptyInline('Belum ada rekomendasi driver.');
  const body = rows.map((r) => `<tr>
    <td class="daa-name">${esc(r.driverName)}</td>
    <td class="daa-num">${esc(r.recommended)}</td>
    <td class="daa-num"><span class="daa-pill daa-pill--${rateClass(r.acceptance)}">${pct(r.acceptance)}</span></td>
    <td class="daa-num">${pct(r.overrideRate)}</td>
    <td class="daa-num">${esc(r.avgScore)}</td>
    <td class="daa-num">${pct(r.capacityUtilization)}</td>
    <td class="daa-num">${pct(r.conflictAvoidance)}</td>
    <td>${esc(fmtTime(r.lastRecommendation))}</td>
  </tr>`).join('');
  return `<div class="daa-tablewrap"><table class="daa-table">
    <thead><tr><th>Driver</th><th class="daa-num">Rek.</th><th class="daa-num">Terima</th>
      <th class="daa-num">Override</th><th class="daa-num">Skor</th><th class="daa-num">Kapasitas</th>
      <th class="daa-num">Anti-Konflik</th><th>Terakhir</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function rankList(items, valueFn) {
  if (!items.length) return `<div class="daa-sec__sub">—</div>`;
  return `<ul class="daa-rank__list">${items.map((it, i) =>
    `<li class="daa-rank__item"><span class="daa-rank__n">${i + 1}</span>
      <span class="daa-rank__nm">${esc(it.name)}</span>
      <span class="daa-rank__v">${valueFn(it)}</span></li>`).join('')}</ul>`;
}

function renderDriverIntel(model) {
  const di = model.driverIntelligence;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🧑‍✈️ Intelijen Driver</div>
        <div class="daa-sec__hint">Rekomendasi & penerimaan = historis · kapasitas/anti-konflik = kondisi terkini</div></div>
      ${driverTable(di.rows)}
      <div class="daa-cols">
        <div class="daa-rank"><div class="daa-rank__h">Paling Direkomendasikan</div>
          ${rankList(di.rankings.topRecommended, (it) => `<b>${esc(it.recommended)}</b> rek.`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Diterima</div>
          ${rankList(di.rankings.mostAccepted, (it) => `<b>${esc(it.accepted)}</b> diterima`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Sering Di-override</div>
          ${rankList(di.rankings.mostOverridden, (it) => `<b>${esc(it.overridden)}</b> override`)}</div>
      </div>
    </div>`;
}

function vehicleTable(rows) {
  if (!rows.length) return emptyInline('Belum ada rekomendasi kendaraan.');
  const body = rows.map((r) => `<tr>
    <td class="daa-name">${esc(r.vehicleName)}</td>
    <td class="daa-num">${esc(r.recommended)}</td>
    <td class="daa-num"><span class="daa-pill daa-pill--${rateClass(r.acceptance)}">${pct(r.acceptance)}</span></td>
    <td class="daa-num">${pct(r.overrideRate)}</td>
    <td class="daa-num">${esc(r.avgScore)}</td>
    <td class="daa-num">${pct(r.utilization)}</td>
    <td class="daa-num">${pct(r.idle)}</td>
    <td class="daa-num">${pct(r.conflictAvoidance)}</td>
  </tr>`).join('');
  return `<div class="daa-tablewrap"><table class="daa-table">
    <thead><tr><th>Kendaraan</th><th class="daa-num">Rek.</th><th class="daa-num">Terima</th>
      <th class="daa-num">Override</th><th class="daa-num">Skor</th><th class="daa-num">Utilisasi</th>
      <th class="daa-num">Idle</th><th class="daa-num">Anti-Konflik</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function renderVehicleIntel(model) {
  const vi = model.vehicleIntelligence;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🚐 Intelijen Kendaraan</div>
        <div class="daa-sec__hint">Utilisasi/idle = kondisi terkini dari penugasan</div></div>
      ${vehicleTable(vi.rows)}
      <div class="daa-cols">
        <div class="daa-rank"><div class="daa-rank__h">Paling Direkomendasikan</div>
          ${rankList(vi.rankings.topRecommended, (it) => `<b>${esc(it.recommended)}</b> rek.`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Diterima</div>
          ${rankList(vi.rankings.mostAccepted, (it) => `<b>${esc(it.accepted)}</b> diterima`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Sering Di-override</div>
          ${rankList(vi.rankings.mostOverridden, (it) => `<b>${esc(it.overridden)}</b> override`)}</div>
      </div>
    </div>`;
}

function renderOverrideAnalytics(model, opts) {
  const b = model.overrideAnalytics.reasonBreakdown;
  const total = model.totals.decisions;
  const reasonRow = (lbl, n, cls) => `<div class="daa-funnel__row">
    <div class="daa-funnel__k">${esc(lbl)}</div>
    <div class="daa-bar"><div class="daa-bar__fill daa-bar__fill--${cls}" style="width:${total ? Math.round((n / total) * 100) : 0}%"></div></div>
    <div class="daa-funnel__meta"><b>${esc(n)}</b> · ${total ? Math.round((n / total) * 100) : 0}%</div></div>`;
  const win = model.trends.windows.find((w) => w.key === (TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d')) || model.trends.windows[1];
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🔁 Analitik Override</div>
        <div class="daa-sec__sub">Rentang tren: ${esc(win ? win.label : '')}</div></div>
      <div class="daa-cols">
        <div class="daa-funnel">
          ${reasonRow('Diterima', b.accepted, 'ok')}
          ${reasonRow('Override Driver', b.driver, 'warn')}
          ${reasonRow('Override Kendaraan', b.vehicle, 'warn')}
          ${reasonRow('Override Keduanya', b.full, 'danger')}
        </div>
        <div>
          <div class="daa-rank__h" style="margin-bottom:.5rem;">Tren Penerimaan vs Override</div>
          ${sparkline(win ? win.series : [], 'acceptanceRate')}
          <div class="daa-sec__sub" style="margin-top:.35rem;">Penerimaan ${pct(win ? win.acceptanceRate : 0)} · Override ${pct(win ? win.overrideRate : 0)} · ${win ? win.total : 0} keputusan</div>
        </div>
      </div>
    </div>`;
}

function renderBidang(model) {
  const rows = model.bidangIntelligence;
  const body = rows.length ? rows.map((r) => `<tr>
    <td class="daa-name">${esc(r.bidang)}</td>
    <td class="daa-num">${esc(r.requests)}</td>
    <td class="daa-num"><span class="daa-pill daa-pill--${rateClass(r.acceptanceRate)}">${pct(r.acceptanceRate)}</span></td>
    <td class="daa-num">${pct(r.overrideRate)}</td>
    <td class="daa-num">${esc(r.avgScore)}</td>
    <td class="daa-num">${esc(stars(r.avgConfidenceStars))}</td>
    <td>${esc(r.topDestination || '—')}</td>
    <td class="daa-num">${pct(r.conflictRate)}</td>
  </tr>`).join('') : '';
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🏢 Intelijen Bidang</div>
        <div class="daa-sec__hint">Konflik = porsi override penuh (driver & kendaraan diganti)</div></div>
      ${body ? `<div class="daa-tablewrap"><table class="daa-table">
        <thead><tr><th>Bidang</th><th class="daa-num">Request</th><th class="daa-num">Terima</th>
          <th class="daa-num">Override</th><th class="daa-num">Skor</th><th class="daa-num">Confidence</th>
          <th>Tujuan Teratas</th><th class="daa-num">Konflik</th></tr></thead>
        <tbody>${body}</tbody></table></div>` : emptyInline('Belum ada request yang diproses per bidang.')}
    </div>`;
}

function renderQuality(model) {
  const q = model.recommendationQuality;
  const cls = { ACCEPTED: 'ok', DRIVER_OVERRIDE: 'warn', VEHICLE_OVERRIDE: 'warn', FULL_OVERRIDE: 'danger' };
  const rows = q.funnel.map((f) => `<div class="daa-funnel__row">
    <div class="daa-funnel__k">${esc(f.label)}</div>
    <div class="daa-bar"><div class="daa-bar__fill daa-bar__fill--${cls[f.key] || 'info'}" style="width:${esc(f.percentage)}%"></div></div>
    <div class="daa-funnel__meta"><b>${esc(f.count)}</b> · ${esc(f.percentage)}%</div></div>`).join('');
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🎯 Kualitas Rekomendasi</div>
        <div class="daa-sec__sub">Rekomendasi AI → keputusan akhir admin</div></div>
      <div class="daa-funnel">${rows}</div>
    </div>`;
}

function renderTimeline(model) {
  const ev = model.timeline;
  if (!ev.length) {
    return `<div class="daa-sec"><div class="daa-sec__head"><div class="daa-sec__title">🕑 Linimasa Dispatch</div></div>
      ${emptyInline('Belum ada riwayat keputusan.')}</div>`;
  }
  const dotCls = { ACCEPTED: 'ok', DRIVER_OVERRIDE: 'warn', VEHICLE_OVERRIDE: 'warn', FULL_OVERRIDE: 'danger' };
  const outLabel = { ACCEPTED: 'Diterima', DRIVER_OVERRIDE: 'Override Driver', VEHICLE_OVERRIDE: 'Override Kendaraan', FULL_OVERRIDE: 'Override Penuh' };
  const items = ev.map((e) => `<li class="daa-tl__li">
    <div class="daa-tl__rail"><span class="daa-tl__dot daa-tl__dot--${dotCls[e.outcome] || 'info'}"></span><span class="daa-tl__line"></span></div>
    <div class="daa-tl__body">
      <div class="daa-tl__top"><span class="daa-tl__when">${esc(fmtTime(e.decidedAt))}</span>
        <span class="daa-tl__title">${esc(outLabel[e.outcome] || 'Keputusan')}</span></div>
      <div class="daa-tl__d">${esc(e.driverName)} · ${esc(e.vehicleName)} · skor ${esc(e.score)}${e.bidang ? ' · ' + esc(e.bidang) : ''}</div>
    </div></li>`).join('');
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🕑 Linimasa Dispatch</div>
        <div class="daa-sec__sub">${ev.length} keputusan terbaru</div></div>
      <ul class="daa-tl">${items}</ul>
    </div>`;
}

function reasonList(items, emptyText) {
  if (!items.length) return `<div class="daa-sec__sub">${esc(emptyText)}</div>`;
  return `<ul class="daa-reasons">${items.map((r) =>
    `<li class="daa-reasons__li"><span class="daa-reasons__txt">${esc(r.text)}</span><span class="daa-reasons__n">${esc(r.count)}×</span></li>`).join('')}</ul>`;
}

function renderExplainability(model) {
  const ex = model.explainability;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">💡 Explainability</div>
        <div class="daa-sec__sub">Alasan rekomendasi & alasan override admin</div></div>
      <div class="daa-cols">
        <div class="daa-rank"><div class="daa-rank__h">Alasan Rekomendasi Teratas</div>
          ${reasonList(ex.topReasons, 'Belum ada ringkasan alasan.')}</div>
        <div class="daa-rank"><div class="daa-rank__h">Alasan Override Admin</div>
          ${reasonList(ex.adminOverrideReasons, 'Belum ada override dengan alasan.')}</div>
      </div>
    </div>`;
}

function renderTrends(model, opts) {
  const win = model.trends.windows.find((w) => w.key === (TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d')) || model.trends.windows[1];
  const card = (lbl, num, sub) => `<div class="daa-trendcard">
    <div class="daa-trendcard__lbl">${esc(lbl)}</div><div class="daa-trendcard__num">${num}</div>
    <div class="daa-trendcard__sub">${esc(sub)}</div></div>`;
  if (!win) return '';
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">📈 Tren — ${esc(win.label)}</div>
        <div class="daa-sec__sub">${win.total} keputusan dalam rentang</div></div>
      <div class="daa-trendcards">
        ${card('Penerimaan', pct(win.acceptanceRate), 'rata-rata rentang')}
        ${card('Override', pct(win.overrideRate), 'rata-rata rentang')}
        ${card('Skor Dispatch', esc(win.avgScore), 'rata-rata')}
        ${card('Confidence', `<span class="daa-kpi__stars">${esc(stars(win.avgConfidenceStars))}</span>`, `${esc(win.avgConfidenceStars)}★ rata-rata`)}
      </div>
      <div>
        <div class="daa-rank__h" style="margin-bottom:.35rem;">Skor Dispatch Harian</div>
        ${sparkline(win.series, 'avgScore')}
      </div>
    </div>`;
}

function sparkline(series, field) {
  const list = Array.isArray(series) ? series : [];
  if (!list.length) return `<div class="daa-sec__sub">Tidak ada data dalam rentang.</div>`;
  const max = Math.max(1, ...list.map((s) => Number(s[field]) || 0));
  const cols = list.map((s) => {
    const v = Number(s[field]) || 0;
    const h = Math.max(4, Math.round((v / max) * 100));
    return `<div class="daa-spark__col${v === 0 ? ' daa-spark__col--empty' : ''}" style="height:${h}%" title="${esc(s.label)}: ${esc(v)}"></div>`;
  }).join('');
  return `<div class="daa-spark">${cols}</div>`;
}

function emptyInline(text) {
  return `<div class="daa-empty"><div class="daa-empty__ic">📭</div>
    <div class="daa-empty__d">${esc(text)}</div></div>`;
}

function renderGlobalEmpty() {
  return `
    <div class="daa-sec">
      <div class="daa-empty">
        <div class="daa-empty__ic">📊</div>
        <div class="daa-empty__t">Belum ada data analytics</div>
        <div class="daa-empty__d">Dashboard ini terisi setelah ada persetujuan request (override log). Setujui beberapa request melalui Dispatch Intelligence untuk melihat akurasi, distribusi confidence, intelijen driver/kendaraan, dan tren.</div>
      </div>
    </div>`;
}

/* ── public render ────────────────────────────────────────────────────── */

/**
 * Render the full Dispatch Intelligence Analytics dashboard as an HTML string.
 * @param {Object} model  output of computeDispatchAnalyticsModel
 * @param {Object} [opts]  { trendWindow:'7d'|'30d'|'90d'|'ytd' }
 * @returns {string}
 */
export function renderDispatchAnalyticsDashboard(model, opts = {}) {
  if (!model) return `<div class="daa">${renderGlobalEmpty()}</div>`;
  const o = { trendWindow: TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d' };
  const hasData = model.totals && model.totals.decisions > 0;
  return `<div class="daa">
    ${renderHeader(model, o)}
    ${hasData ? '' : renderGlobalEmpty()}
    ${renderKpis(model)}
    ${renderDistribution(model)}
    ${renderDriverIntel(model)}
    ${renderVehicleIntel(model)}
    ${renderOverrideAnalytics(model, o)}
    ${renderBidang(model)}
    ${renderQuality(model)}
    ${renderTimeline(model)}
    ${renderExplainability(model)}
    ${renderTrends(model, o)}
  </div>`;
}
