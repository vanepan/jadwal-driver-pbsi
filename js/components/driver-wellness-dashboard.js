/* ============================================================
   DRIVER-WELLNESS-DASHBOARD.JS — Driver Wellness Intelligence (v1.17.6)

   The premium, Apple-style executive dashboard that visualizes the Driver
   Wellness model (js/services/driver-wellness-service.js). PURE RENDER: it
   computes nothing — it turns the model into markup. All wellness math is the
   service's; this file owns presentation only.

   DESIGN: built entirely on the platform CSS custom properties (var(--surface),
   --surface-2, --border, --text, --muted, --ok/--info/--warn/--danger + *-bg,
   --accent/--on-accent, --shadow-sm) so it adapts to dark mode automatically
   (no hard-coded #fff — the --white trap) and is fully responsive. Every dynamic
   value is HTML-escaped. Styles inject ONCE under scoped `.dwi-*`. It reuses the
   same visual grammar as the Dispatch Analytics dashboard (KPI cards, bars,
   tables, pills) so nothing is duplicated conceptually.

   API:
     injectDriverWellnessStyles()                       — idempotent <style>
     renderDriverWellnessDashboard(model, opts) → string — full dashboard HTML
   Driver rows carry `data-dwi-driver="<id>"` so the host opens the detail drawer.
   ============================================================ */

'use strict';

const STYLE_ID = 'dwi-dashboard-styles';

const CSS = `
.dwi{display:flex;flex-direction:column;gap:1.1rem;min-width:0;color:var(--text);font-family:var(--font-sans, inherit);}
.dwi *{box-sizing:border-box;}

.dwi-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.dwi-top__l{display:flex;flex-direction:column;gap:.25rem;min-width:0;}
.dwi-top__title{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:.5rem;}
.dwi-top__sub{font-size:.76rem;color:var(--muted);max-width:44rem;}
.dwi-top__meta{font-size:.66rem;color:var(--muted);}
.dwi-top__actions{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
.dwi-btn{display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.76rem;font-weight:700;
  color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:.45rem .75rem;
  transition:filter .15s ease, background .15s ease;}
.dwi-btn:hover{background:var(--surface-2);}
.dwi-btn--accent{color:var(--on-accent);background:var(--accent);border-color:var(--accent);}
.dwi-btn--accent:hover{filter:brightness(1.06);}
.dwi-toggle{display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.dwi-toggle__b{cursor:pointer;font-size:.72rem;font-weight:700;color:var(--muted);background:var(--surface);border:0;
  padding:.4rem .7rem;transition:background .15s ease,color .15s ease;}
.dwi-toggle__b + .dwi-toggle__b{border-left:1px solid var(--border);}
.dwi-toggle__b[data-active="true"]{background:var(--accent);color:var(--on-accent);}

.dwi-sec{border:1px solid var(--border);border-radius:18px;background:var(--surface);padding:1.05rem 1.15rem;
  display:flex;flex-direction:column;gap:.85rem;box-shadow:var(--shadow-sm);min-width:0;}
.dwi-sec__head{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;flex-wrap:wrap;}
.dwi-sec__title{font-size:.95rem;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;gap:.5rem;}
.dwi-sec__sub{font-size:.72rem;color:var(--muted);}
.dwi-sec__hint{font-size:.66rem;color:var(--muted);font-style:italic;}

/* KPI cards (Feature 6) */
.dwi-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.8rem;}
.dwi-kpi{border:1px solid var(--border);border-radius:15px;padding:.85rem .95rem;
  background:linear-gradient(180deg, var(--surface-2), var(--surface));display:flex;flex-direction:column;gap:.3rem;min-width:0;}
.dwi-kpi--hero{border-color:var(--info);background:linear-gradient(180deg, var(--info-bg), var(--surface));}
.dwi-kpi__lbl{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.dwi-kpi__num{font-size:1.9rem;font-weight:800;letter-spacing:-.02em;line-height:1.05;}
.dwi-kpi__num--ok{color:var(--ok);} .dwi-kpi__num--info{color:var(--info);}
.dwi-kpi__num--warn{color:var(--warn);} .dwi-kpi__num--danger{color:var(--danger);}
.dwi-kpi__sub{font-size:.66rem;color:var(--muted);}

/* Distribution charts (Feature 11) */
.dwi-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1.1rem;}
.dwi-dist{display:flex;flex-direction:column;gap:.45rem;}
.dwi-dist__row{display:grid;grid-template-columns:7.5rem 1fr auto;align-items:center;gap:.7rem;}
.dwi-dist__k{font-size:.74rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dwi-bar{height:.62rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;min-width:2rem;}
.dwi-bar__fill{height:100%;border-radius:999px;background:var(--info);}
.dwi-bar__fill--ok{background:var(--ok);} .dwi-bar__fill--info{background:var(--info);}
.dwi-bar__fill--warn{background:var(--warn);} .dwi-bar__fill--danger{background:var(--danger);}
.dwi-dist__meta{font-size:.74rem;color:var(--muted);white-space:nowrap;text-align:right;}
.dwi-dist__meta b{color:var(--text);font-weight:700;}

/* Sparkline (trend) */
.dwi-spark{display:flex;align-items:flex-end;gap:4px;height:3.4rem;padding-top:.2rem;}
.dwi-spark__col{flex:1 1 auto;min-width:4px;background:var(--info);border-radius:3px 3px 0 0;opacity:.88;}
.dwi-spark__col--empty{background:var(--surface-2);}
.dwi-trendcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:.7rem;}
.dwi-trendcard{border:1px solid var(--border);border-radius:13px;padding:.7rem .8rem;background:var(--surface-2);display:flex;flex-direction:column;gap:.2rem;}
.dwi-trendcard__lbl{font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.dwi-trendcard__num{font-size:1.25rem;font-weight:800;}
.dwi-trendcard__sub{font-size:.62rem;color:var(--muted);}

/* Driver table */
.dwi-tablewrap{width:100%;min-width:0;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
.dwi-table{width:100%;border-collapse:collapse;font-size:.78rem;min-width:0;}
.dwi-table th,.dwi-table td{text-align:left;padding:.5rem .55rem;border-bottom:1px solid var(--border);white-space:nowrap;}
.dwi-table th{font-size:.64rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.dwi-table td.dwi-num,.dwi-table th.dwi-num{text-align:right;}
.dwi-table tbody tr{cursor:pointer;transition:background .12s ease;}
.dwi-table tbody tr:hover{background:var(--surface-2);}
.dwi-table tbody tr:last-child td{border-bottom:0;}
.dwi-name{white-space:normal;font-weight:700;color:var(--text);max-width:13rem;display:flex;align-items:center;gap:.4rem;}
.dwi-name__chev{color:var(--muted);font-size:.8rem;}
.dwi-pill{display:inline-block;font-size:.64rem;font-weight:700;border-radius:999px;padding:.12rem .5rem;border:1px solid var(--border);color:var(--muted);background:var(--surface-2);}
.dwi-pill--ok{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.dwi-pill--info{color:var(--info);background:var(--info-bg);border-color:var(--info);}
.dwi-pill--warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn);}
.dwi-pill--danger{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}
.dwi-hint{font-size:.68rem;color:var(--muted);}

/* Empty */
.dwi-empty{display:flex;flex-direction:column;align-items:center;gap:.4rem;padding:1.6rem 1rem;text-align:center;color:var(--muted);}
.dwi-empty__ic{font-size:1.8rem;opacity:.7;}
.dwi-empty__t{font-size:.9rem;font-weight:700;color:var(--text);}
.dwi-empty__d{font-size:.76rem;max-width:32rem;}

@media (max-width:560px){
  .dwi-dist__row{grid-template-columns:6rem 1fr;}
  .dwi-dist__meta{grid-column:1 / -1;text-align:left;}
}
`;

export function injectDriverWellnessStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ── escaping + formatting ────────────────────────────────────────────────── */

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
  return `${dd} ${mo} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── section renderers ────────────────────────────────────────────────────── */

function renderHeader(model) {
  const toggles = (model.trend.windows || []).map((w) =>
    `<button type="button" class="dwi-toggle__b" data-dwi-window="${esc(w.key)}" data-active="${w.key === model.window}">${esc(w.label)}</button>`,
  ).join('');
  return `
    <div class="dwi-top">
      <div class="dwi-top__l">
        <div class="dwi-top__title">🫀 Driver Wellness Intelligence</div>
        <div class="dwi-top__sub">Dari optimasi operasional menuju keberlanjutan operasional — pemantauan kesehatan, kelelahan, dan burnout driver. Read-only; tidak mengubah rekomendasi, penugasan, atau kebijakan.</div>
        <div class="dwi-top__meta">Diperbarui ${esc(fmtTime(model.generatedAt))} · ${esc(model.summary.driverCount)} driver · jendela ${esc(model.windowDays)} hari</div>
      </div>
      <div class="dwi-top__actions">
        <div class="dwi-toggle" role="group" aria-label="Rentang">${toggles}</div>
        <button type="button" class="dwi-btn" data-dwi-export="pdf">⬇️ PDF</button>
        <button type="button" class="dwi-btn dwi-btn--accent" data-dwi-export="excel">⬇️ Excel</button>
      </div>
    </div>`;
}

function kpiCard(lbl, value, sub, tone, hero) {
  const toneCls = tone ? ` dwi-kpi__num--${tone}` : '';
  return `<div class="dwi-kpi${hero ? ' dwi-kpi--hero' : ''}">
    <div class="dwi-kpi__lbl">${esc(lbl)}</div>
    <div class="dwi-kpi__num${toneCls}">${esc(value)}</div>
    <div class="dwi-kpi__sub">${esc(sub)}</div>
  </div>`;
}

function renderSummary(model) {
  const s = model.summary;
  const healthTone = s.averageHealth >= 70 ? 'ok' : (s.averageHealth >= 55 ? 'warn' : 'danger');
  return `
    <div class="dwi-sec">
      <div class="dwi-sec__head"><div class="dwi-sec__title">Ringkasan Eksekutif</div>
        <div class="dwi-sec__sub">${esc(s.driverCount)} driver dipantau</div></div>
      <div class="dwi-kpis">
        ${kpiCard('Rata-rata Skor Kesehatan', naOrNum(s.averageHealth), 'Skala 0–100 · tinggi = sehat', healthTone, true)}
        ${kpiCard('Driver Sehat', s.healthyDrivers, '≥ 70 skor kesehatan', 'ok')}
        ${kpiCard('Perlu Perhatian', s.needsAttention, '35–69 skor kesehatan', 'warn')}
        ${kpiCard('Kelelahan Tinggi', s.highFatigue, 'Fatigue High / Critical', 'danger')}
        ${kpiCard('Risiko Burnout', s.burnoutRisk, 'Burnout High / Critical', 'danger')}
        ${kpiCard('Rata-rata Pemulihan', naOrNum(s.averageRecovery), 'Skor pemulihan')}
        ${kpiCard('Rata-rata Capacity Health', naOrNum(s.averageCapacityHealth), '100 = paling lengang')}
      </div>
    </div>`;
}

function distChart(title, rows, hint) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const body = rows.map((r) => {
    const pct = total ? Math.round((r.count / total) * 100) : 0;
    return `<div class="dwi-dist__row">
      <div class="dwi-dist__k" title="${esc(r.label)}">${esc(r.labelId || r.label)}</div>
      <div class="dwi-bar"><div class="dwi-bar__fill dwi-bar__fill--${esc(r.tone || 'info')}" style="width:${pct}%"></div></div>
      <div class="dwi-dist__meta"><b>${esc(r.count)}</b> · ${pct}%</div>
    </div>`;
  }).join('');
  return `<div>
    <div class="dwi-sec__title" style="font-size:.82rem;margin-bottom:.5rem;">${esc(title)}</div>
    <div class="dwi-dist">${body}</div>
    ${hint ? `<div class="dwi-sec__hint" style="margin-top:.4rem;">${esc(hint)}</div>` : ''}
  </div>`;
}

function renderDistributions(model) {
  const d = model.distributions;
  return `
    <div class="dwi-sec">
      <div class="dwi-sec__head"><div class="dwi-sec__title">📊 Distribusi Wellness</div>
        <div class="dwi-sec__hint">Higher = better untuk kesehatan & kapasitas; risiko: kategori tinggi = perlu perhatian</div></div>
      <div class="dwi-cols">
        ${distChart('Distribusi Kesehatan', d.health)}
        ${distChart('Capacity Health', d.capacity, '100 = paling lengang/tersedia')}
        ${distChart('Distribusi Kelelahan', d.fatigue)}
        ${distChart('Distribusi Burnout', d.burnout)}
      </div>
    </div>`;
}

function sparkline(series, field) {
  const list = Array.isArray(series) ? series : [];
  if (!list.length) return `<div class="dwi-sec__sub">Tidak ada data dalam rentang.</div>`;
  const max = Math.max(1, ...list.map((s) => Number(s[field]) || 0));
  const cols = list.map((s) => {
    const v = Number(s[field]) || 0;
    const h = Math.max(4, Math.round((v / max) * 100));
    return `<div class="dwi-spark__col${v === 0 ? ' dwi-spark__col--empty' : ''}" style="height:${h}%" title="${esc(s.label)}: ${esc(v)}"></div>`;
  }).join('');
  return `<div class="dwi-spark">${cols}</div>`;
}

function renderTrend(model) {
  const wins = model.trend.windows || [];
  const cards = wins.map((w) => `<div class="dwi-trendcard">
    <div class="dwi-trendcard__lbl">${esc(w.label)}</div>
    <div class="dwi-trendcard__num">${esc(naOrNum(w.averageHealth))}</div>
    <div class="dwi-trendcard__sub">pemulihan ${esc(naOrNum(w.averageRecovery))} · burnout ${esc(w.burnoutRisk)}</div>
  </div>`).join('');
  return `
    <div class="dwi-sec">
      <div class="dwi-sec__head"><div class="dwi-sec__title">📈 Tren Historis</div>
        <div class="dwi-sec__sub">Rata-rata skor kesehatan per rentang</div></div>
      <div class="dwi-trendcards">${cards}</div>
      <div>
        <div class="dwi-sec__title" style="font-size:.82rem;margin:.4rem 0 .35rem;">Rata-rata Kesehatan</div>
        ${sparkline(wins, 'averageHealth')}
      </div>
    </div>`;
}

function pill(tone, text) { return `<span class="dwi-pill dwi-pill--${esc(tone)}">${esc(text)}</span>`; }

function renderDriverTable(model) {
  const rows = model.drivers;
  if (!rows.length) {
    return `<div class="dwi-sec"><div class="dwi-sec__head"><div class="dwi-sec__title">🧑‍✈️ Driver</div></div>
      ${emptyInline('Belum ada driver aktif untuk dipantau.')}</div>`;
  }
  const body = rows.map((r) => `<tr data-dwi-driver="${esc(r.driverId)}" tabindex="0" role="button" aria-label="Detail wellness ${esc(r.driverName)}">
    <td><div class="dwi-name"><span class="dwi-name__chev">›</span>${esc(r.driverName)}</div></td>
    <td class="dwi-num">${pill(r.health.tone, `${r.health.score} · ${r.health.labelId}`)}</td>
    <td class="dwi-num">${pill(r.fatigue.tone, r.fatigue.labelId)}</td>
    <td class="dwi-num">${pill(r.burnout.tone, r.burnout.labelId)}</td>
    <td class="dwi-num">${pill(r.capacityHealth.tone, String(r.capacityHealth.score))}</td>
    <td class="dwi-num">${esc(r.recovery.score)}</td>
    <td class="dwi-num">${esc(r.workingTime.hours)} j</td>
  </tr>`).join('');
  return `
    <div class="dwi-sec">
      <div class="dwi-sec__head"><div class="dwi-sec__title">🧑‍✈️ Wellness per Driver</div>
        <div class="dwi-sec__hint">Klik baris untuk membuka detail wellness (drawer)</div></div>
      <div class="dwi-tablewrap"><table class="dwi-table">
        <thead><tr><th>Driver</th><th class="dwi-num">Kesehatan</th><th class="dwi-num">Kelelahan</th>
          <th class="dwi-num">Burnout</th><th class="dwi-num">Capacity Health</th><th class="dwi-num">Pemulihan</th>
          <th class="dwi-num">Jam Kerja</th></tr></thead>
        <tbody>${body}</tbody></table></div>
      <div class="dwi-hint">Diurutkan dari skor kesehatan terendah (paling perlu perhatian) ke tertinggi.</div>
    </div>`;
}

function emptyInline(text) {
  return `<div class="dwi-empty"><div class="dwi-empty__ic">📭</div><div class="dwi-empty__d">${esc(text)}</div></div>`;
}

function renderGlobalEmpty() {
  return `
    <div class="dwi-sec">
      <div class="dwi-empty">
        <div class="dwi-empty__ic">🫀</div>
        <div class="dwi-empty__t">Belum ada data wellness</div>
        <div class="dwi-empty__d">Dashboard ini terisi setelah ada driver aktif dengan riwayat penugasan. Tambahkan driver dan penugasan untuk melihat skor kesehatan, kelelahan, burnout, dan kapasitas.</div>
      </div>
    </div>`;
}

/**
 * Render the full Driver Wellness dashboard as an HTML string.
 * @param {Object} model  output of computeDriverWellnessModel
 * @returns {string}
 */
export function renderDriverWellnessDashboard(model) {
  if (!model) return `<div class="dwi">${renderGlobalEmpty()}</div>`;
  const hasData = model.summary && model.summary.driverCount > 0;
  return `<div class="dwi">
    ${renderHeader(model)}
    ${hasData ? '' : renderGlobalEmpty()}
    ${renderSummary(model)}
    ${renderDistributions(model)}
    ${renderTrend(model)}
    ${renderDriverTable(model)}
  </div>`;
}
