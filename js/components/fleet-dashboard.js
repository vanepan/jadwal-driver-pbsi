/* ============================================================
   FLEET-DASHBOARD.JS — Vehicle Asset Intelligence (v1.18.0)

   The executive Fleet Dashboard (Feature 10), Vehicle Health summary (Feature 11),
   and asset-only Fleet Analytics (Feature 12) rendered above the vehicle inventory
   list. It RENDERS ONLY — every number comes from computeFleetAssetModel
   (vehicle-asset-service). It recomputes nothing and touches no dispatch metric.

   Returns an HTML string (consumed by app.js innerHTML). All interpolated values
   pass through a local escaper. DESIGN: scoped `.fld-*` classes built on platform
   tokens (var(--surface)/--border/--text/--muted/--ok/--warn/--info/--danger) so
   it is dark-mode safe (no hard-coded #fff) and responsive. Reuses the Dispatch
   Analytics / Driver Wellness dashboard grammar.
   ============================================================ */

'use strict';

const STYLE_ID = 'fld-dashboard-styles';

const CSS = `
.fld{display:flex;flex-direction:column;gap:1rem;margin-bottom:1rem;}
.fld-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(8.4rem,1fr));gap:.6rem;}
.fld-kpi{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:.7rem .8rem;
  display:flex;flex-direction:column;gap:.2rem;min-width:0;}
.fld-kpi__v{font-size:1.55rem;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.05;}
.fld-kpi__l{font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}
.fld-kpi[data-tone="ok"] .fld-kpi__v{color:var(--ok);}
.fld-kpi[data-tone="warn"] .fld-kpi__v{color:var(--warn);}
.fld-kpi[data-tone="danger"] .fld-kpi__v{color:var(--danger);}
.fld-kpi[data-tone="info"] .fld-kpi__v{color:var(--info);}

.fld-health{border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,var(--info-bg),var(--surface));
  padding:.8rem .9rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;}
.fld-health__num{font-size:2.1rem;font-weight:800;letter-spacing:-.02em;line-height:1;}
.fld-health__num[data-tone="ok"]{color:var(--ok);}
.fld-health__num[data-tone="warn"]{color:var(--warn);}
.fld-health__num[data-tone="danger"]{color:var(--danger);}
.fld-health__num[data-tone="info"]{color:var(--info);}
.fld-health__meta{display:flex;flex-direction:column;gap:.1rem;}
.fld-health__lbl{font-size:.82rem;font-weight:700;}
.fld-health__sub{font-size:.7rem;color:var(--muted);}

.fld-grids{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.8rem;}
.fld-dist{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:.8rem .9rem;
  display:flex;flex-direction:column;gap:.55rem;min-width:0;}
.fld-dist__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.fld-dist__rows{display:flex;flex-direction:column;gap:.4rem;}
.fld-row{display:flex;align-items:center;gap:.6rem;}
.fld-row__k{flex:0 0 6.4rem;font-size:.76rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fld-row__bar{flex:1 1 auto;height:.5rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;min-width:2rem;}
.fld-row__fill{height:100%;border-radius:999px;background:var(--info);}
.fld-row__fill[data-tone="ok"]{background:var(--ok);}
.fld-row__fill[data-tone="warn"]{background:var(--warn);}
.fld-row__fill[data-tone="danger"]{background:var(--danger);}
.fld-row__n{flex:0 0 2.6rem;text-align:right;font-size:.78rem;font-weight:700;font-variant-numeric:tabular-nums;}
.fld-empty{font-size:.8rem;color:var(--muted);}

@media (max-width:560px){
  .fld-kpis{grid-template-columns:repeat(auto-fill,minmax(7rem,1fr));}
}
`;

export function injectFleetDashboardStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function kpi(value, label, tone) {
  return `<div class="fld-kpi"${tone ? ` data-tone="${esc(tone)}"` : ''}>
    <span class="fld-kpi__v">${esc(value)}</span>
    <span class="fld-kpi__l">${esc(label)}</span>
  </div>`;
}

function distRows(rows, toneOf) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return '<div class="fld-empty">Tidak ada data.</div>';
  return rows.map((r) => {
    const tone = toneOf ? toneOf(r) : '';
    const w = Math.round((r.count / max) * 100);
    return `<div class="fld-row">
      <span class="fld-row__k" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="fld-row__bar"><span class="fld-row__fill"${tone ? ` data-tone="${esc(tone)}"` : ''} style="width:${w}%"></span></span>
      <span class="fld-row__n">${esc(r.count)}</span>
    </div>`;
  }).join('');
}

function distCard(title, rows, toneOf) {
  return `<div class="fld-dist">
    <div class="fld-dist__title">${esc(title)}</div>
    <div class="fld-dist__rows">${distRows(rows, toneOf)}</div>
  </div>`;
}

/**
 * Render the full Fleet Dashboard (executive cards + health + analytics).
 * @param {Object} model  computeFleetAssetModel() result
 * @returns {string} HTML
 */
export function renderFleetDashboard(model) {
  if (!model || !model.dashboard) return '';
  const d = model.dashboard;
  const a = model.analytics || {};

  const cards = [
    kpi(d.totalAssets, 'Total Aset'),
    kpi(d.active, 'Active', d.active ? 'ok' : null),
    kpi(d.maintenance, 'Maintenance', d.maintenance ? 'warn' : null),
    kpi(d.inactive, 'Inactive'),
    kpi(d.retired, 'Retired', d.retired ? 'danger' : null),
    kpi(d.cars, 'Mobil'),
    kpi(d.motorcycles, 'Motor'),
    kpi(d.ambulances, 'Ambulance'),
    kpi(d.taxDueSoon, 'Pajak Jatuh Tempo', d.taxDueSoon ? 'warn' : null),
    kpi(d.expiredStnk, 'STNK Kedaluwarsa', d.expiredStnk ? 'danger' : null),
  ].join('');

  const health = `<div class="fld-health">
    <span class="fld-health__num" data-tone="${esc(d.healthColor)}">${esc(d.healthAvg)}</span>
    <div class="fld-health__meta">
      <span class="fld-health__lbl">Rata-rata Asset Health · ${esc(d.healthLabel)}</span>
      <span class="fld-health__sub">Operasional · Legal · Kelengkapan Dokumen — semakin tinggi semakin baik</span>
    </div>
  </div>`;

  const taxTone = (r) => ({ valid: 'ok', due_soon: 'warn', expired: 'danger' }[r.key] || '');
  const docTone = (r) => ({ complete: 'ok', partial: 'warn', minimal: 'danger' }[r.key] || '');

  const grids = `<div class="fld-grids">
    ${distCard('Komposisi Armada', a.composition || [])}
    ${distCard('Distribusi Usia', a.ageDistribution || [])}
    ${distCard('Distribusi Bahan Bakar', a.fuelDistribution || [])}
    ${distCard('Distribusi Transmisi', a.transmissionDistribution || [])}
    ${distCard('Kelengkapan Dokumen', a.documentCompleteness || [], docTone)}
    ${distCard('Status Pajak', a.taxStatus || [], taxTone)}
  </div>`;

  return `<div class="fld">
    <div class="fld-kpis">${cards}</div>
    ${health}
    ${grids}
  </div>`;
}
