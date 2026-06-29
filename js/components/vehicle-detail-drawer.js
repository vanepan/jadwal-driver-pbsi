/* ============================================================
   VEHICLE-DETAIL-DRAWER.JS — Vehicle Asset Intelligence (v1.18.0)

   The Apple-style side drawer that REPLACES the old vehicle detail modal. It
   presents one normalized asset across six sections — Overview, Registration,
   Tax, Insurance, Timeline, History (NO Gallery — Gallery is reserved for a
   future roadmap item).

   It RENDERS ONLY. Every value comes from a normalized asset produced by
   vehicle-asset-service (which itself only re-expresses the Vehicle Store). The
   drawer recomputes nothing.

   DESIGN: built entirely on the platform CSS custom properties (var(--surface),
   --border, --text, --muted, --ok/--warn/--info/--danger) so it adapts to dark
   mode automatically — no hard-coded #fff (the dark-mode --white trap). Scoped
   `.vad-*` class names; a glass overlay + right-anchored sheet that springs in.
   Written with textContent (never innerHTML) so a plate / owner name can never
   inject markup. Fully responsive (full-width on mobile). ESC / overlay / Close
   dismiss it. Reuses the Decision Replay / Driver Wellness drawer grammar.
   ============================================================ */

'use strict';

import { renderIcon, vehicleTypeIconName } from './icon-system.js';

const STYLE_ID = 'vad-drawer-styles';
const ROOT_ID = 'vehicleDetailDrawer';

const CSS = `
.vad-overlay{position:fixed;inset:0;z-index:6000;display:flex;justify-content:flex-end;
  background:rgba(15,17,21,.42);opacity:0;transition:opacity .22s ease;
  -webkit-backdrop-filter:saturate(140%) blur(3px);backdrop-filter:saturate(140%) blur(3px);}
.vad-overlay[data-open="true"]{opacity:1;}
.vad-sheet{position:relative;width:min(560px,100%);height:100%;display:flex;flex-direction:column;
  background:var(--surface);border-left:1px solid var(--border);box-shadow:-24px 0 60px rgba(0,0,0,.28);
  transform:translateX(100%);transition:transform .22s cubic-bezier(.32,.72,0,1);color:var(--text);
  font-family:var(--font-sans, inherit);min-width:0;}
.vad-overlay[data-open="true"] .vad-sheet{transform:translateX(0);}

/* Header */
.vad-head{flex:0 0 auto;display:flex;flex-direction:column;gap:.85rem;padding:1.05rem 1.15rem .95rem;
  border-bottom:1px solid var(--border);background:linear-gradient(180deg,var(--info-bg),var(--surface));}
.vad-head__top{display:flex;align-items:center;gap:.5rem;}
.vad-head__brand{display:flex;align-items:center;gap:.45rem;font-size:.78rem;font-weight:800;letter-spacing:.01em;}
.vad-head__tag{margin-left:auto;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.14rem .55rem;}
.vad-x{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--text);
  width:2rem;height:2rem;border-radius:999px;cursor:pointer;font-size:1.1rem;line-height:1;display:flex;
  align-items:center;justify-content:center;transition:background .15s ease;}
.vad-x:hover{background:var(--surface-2);}
.vad-hero{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.vad-hero__id{display:flex;align-items:center;gap:.7rem;min-width:0;}
.vad-hero__avatar{flex:0 0 auto;width:3rem;height:3rem;border-radius:14px;display:flex;align-items:center;
  justify-content:center;font-size:1.5rem;border:1px solid var(--border);background:var(--surface-2);}
.vad-hero__txt{display:flex;flex-direction:column;gap:.18rem;min-width:0;}
.vad-hero__name{font-weight:800;font-size:1.12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.vad-hero__plate{font-size:.8rem;color:var(--muted);font-variant-numeric:tabular-nums;}
.vad-hero__metric{display:flex;flex-direction:column;align-items:flex-end;gap:.1rem;line-height:1.05;}
.vad-hero__num{font-size:1.8rem;font-weight:800;letter-spacing:-.01em;}
.vad-hero__lbl{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.vad-badges{display:flex;flex-wrap:wrap;gap:.35rem;}

/* Pills */
.vad-pill{display:inline-flex;align-items:center;gap:.3rem;font-size:.66rem;font-weight:700;border-radius:999px;
  padding:.16rem .55rem;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);}
.vad-pill[data-tone="ok"]{color:var(--ok);border-color:var(--ok);}
.vad-pill[data-tone="warn"]{color:var(--warn);border-color:var(--warn);}
.vad-pill[data-tone="danger"]{color:var(--danger);border-color:var(--danger);}
.vad-pill[data-tone="info"]{color:var(--info);border-color:var(--info);}

/* Body */
.vad-body{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:1rem 1.15rem 1.4rem;
  display:flex;flex-direction:column;gap:.85rem;-webkit-overflow-scrolling:touch;}
.vad-sec{border:1px solid var(--border);border-radius:14px;background:var(--surface);
  padding:.8rem .9rem;display:flex;flex-direction:column;gap:.6rem;}
.vad-sec__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;
  color:var(--muted);display:flex;align-items:center;gap:.4rem;}
.vad-sec__title b{color:var(--text);font-weight:800;}

/* Health bars */
.vad-bd{display:flex;flex-direction:column;gap:.45rem;}
.vad-bd__row{display:flex;align-items:center;gap:.6rem;}
.vad-bd__k{flex:0 0 6.4rem;font-size:.8rem;font-weight:600;}
.vad-bd__bar{flex:1 1 auto;height:.5rem;border-radius:999px;background:var(--surface-2);
  border:1px solid var(--border);overflow:hidden;min-width:2rem;}
.vad-bd__fill{height:100%;border-radius:999px;background:var(--info);}
.vad-bd__fill[data-tone="ok"]{background:var(--ok);}
.vad-bd__fill[data-tone="warn"]{background:var(--warn);}
.vad-bd__fill[data-tone="danger"]{background:var(--danger);}
.vad-bd__pts{flex:0 0 2.6rem;text-align:right;font-size:.84rem;font-weight:700;font-variant-numeric:tabular-nums;}

/* Key/value grid */
.vad-kv{display:flex;flex-direction:column;gap:.46rem;font-size:.82rem;}
.vad-kv__row{display:flex;align-items:flex-start;justify-content:space-between;gap:.9rem;padding:.62rem .72rem;
  border:1px solid var(--border);border-radius:11px;background:var(--surface-2);}
.vad-kv__k{color:var(--muted);font-size:.67rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.vad-kv__v{font-size:.9rem;font-weight:700;text-align:right;overflow-wrap:anywhere;}

/* Timeline / tax history rail */
.vad-tl{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none;}
.vad-tl li{display:flex;gap:.7rem;position:relative;padding:.12rem 0 .7rem;}
.vad-tl li:last-child{padding-bottom:0;}
.vad-tl__dot{flex:0 0 .72rem;width:.72rem;height:.72rem;border-radius:50%;margin-top:.18rem;
  background:var(--info);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--info);}
.vad-tl li:not(:last-child) .vad-tl__dot::after{content:"";position:absolute;left:.32rem;top:1rem;
  width:1px;height:calc(100% - .92rem);background:var(--border);}
.vad-tl__body{display:flex;flex-direction:column;gap:.08rem;min-width:0;}
.vad-tl__label{font-size:.86rem;font-weight:600;color:var(--text);}
.vad-tl__detail{font-size:.74rem;color:var(--muted);overflow-wrap:anywhere;}
.vad-tl__time{font-size:.72rem;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;
  flex:0 0 5.3rem;text-align:right;}
.vad-empty{font-size:.84rem;color:var(--muted);}

/* Footer */
.vad-foot{flex:0 0 auto;display:flex;gap:.6rem;padding:.85rem 1.15rem;border-top:1px solid var(--border);background:var(--surface);justify-content:flex-end;}
.vad-btn{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;cursor:pointer;
  font-size:.86rem;font-weight:700;border-radius:11px;padding:.62rem .9rem;transition:filter .15s ease;}
.vad-btn--ghost{background:var(--surface);border:1px solid var(--border);color:var(--text);}
.vad-btn--ghost:hover{background:var(--surface-2);}
.vad-btn--accent{background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);}
.vad-btn--accent:hover{filter:brightness(1.06);}
#vadEditBtn{order:1;min-width:8.6rem;}
#vadToggleBtn{order:2;}
#vadArchiveBtn{order:3;color:var(--danger);border-color:var(--danger);background:var(--danger-bg);}
#vadCloseBtn{order:4;flex:0 0 auto;min-width:6.4rem;}
#vadRestoreBtn{order:1;}
#vadDeleteBtn{order:2;color:var(--danger);border-color:var(--danger);background:var(--danger-bg);}

@media (max-width:560px){
  .vad-sheet{width:100%;border-left:0;}
  .vad-hero{gap:.6rem;}
}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function section(title, titleEmphasis) {
  const sec = el('div', 'vad-sec');
  const t = el('div', 'vad-sec__title');
  t.append(el('span', null, title));
  if (titleEmphasis) t.append(el('b', null, titleEmphasis));
  sec.append(t);
  return sec;
}

function pill(text, tone) {
  const p = el('span', 'vad-pill', text);
  if (tone) p.setAttribute('data-tone', tone);
  return p;
}

function kv(grid, k, v) {
  const row = el('div', 'vad-kv__row');
  row.append(el('span', 'vad-kv__k', k), el('span', 'vad-kv__v', v == null || v === '' ? '—' : v));
  grid.append(row);
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function healthBar(label, score, tone) {
  const row = el('div', 'vad-bd__row');
  row.append(el('span', 'vad-bd__k', label));
  const bar = el('div', 'vad-bd__bar');
  const fill = el('div', 'vad-bd__fill');
  if (tone) fill.setAttribute('data-tone', tone);
  fill.style.width = `${score == null ? 0 : Math.max(0, Math.min(100, score))}%`;
  bar.append(fill);
  row.append(bar);
  row.append(el('span', 'vad-bd__pts', score == null ? 'N/A' : String(score)));
  return row;
}

/* ── Section renderers ────────────────────────────────────────────────────── */

function renderOverview(a) {
  const sec = section('Overview', a.health.label);
  const bd = el('div', 'vad-bd');
  // v1.18.1 — full explainability: every weighted sub-score of Overall Asset
  // Health is shown (Legal + Maintenance now lead the weighting). N/A when a
  // component has no data (it is excluded from the re-weighted overall, not zero).
  const band3 = (s) => (s == null ? null : s >= 70 ? 'ok' : s >= 40 ? 'warn' : 'danger');
  bd.append(healthBar('Status Legal', a.health.legal, band3(a.health.legal)));
  bd.append(healthBar('Perawatan', a.health.maintenance, band3(a.health.maintenance)));
  bd.append(healthBar('Status Operasional', a.health.operational, a.statusInfo.tone === 'muted' ? 'info' : a.statusInfo.tone));
  bd.append(healthBar('Kelengkapan Dokumen', a.health.documents, band3(a.health.documents)));
  bd.append(healthBar('Overall Asset Health', a.health.overall, a.health.color));
  sec.append(bd);
  return sec;
}

function renderOperational(a) {
  const sec = section('Operational');

  const grid = el('div', 'vad-kv');
  kv(grid, 'Status', a.statusInfo.labelId);
  kv(grid, 'Tipe Aset', a.typeInfo.label);
  sec.append(grid);

  const elig = el('div', 'vad-badges');
  elig.style.marginTop = '.2rem';
  elig.append(pill(`Dispatch: ${a.eligibility.dispatch ? 'Ya' : 'Tidak'}`, a.eligibility.dispatch ? 'ok' : 'danger'));
  elig.append(pill(`Rekomendasi: ${a.eligibility.recommendation ? 'Ya' : (a.eligibility.medicalOnly ? 'Medis' : 'Tidak')}`, a.eligibility.recommendation ? 'ok' : (a.eligibility.medicalOnly ? 'warn' : 'danger')));
  elig.append(pill(`Analytics: ${a.eligibility.analytics ? 'Ya' : 'Tidak'}`, a.eligibility.analytics ? 'ok' : 'danger'));
  sec.append(elig);
  return sec;
}

function renderRegistration(a) {
  const sec = section('Registration');
  const grid = el('div', 'vad-kv');
  kv(grid, 'Plat Nomor', a.plateNumber);
  kv(grid, 'Merek', a.brand);
  kv(grid, 'Model', a.model);
  kv(grid, 'Tahun', a.year);
  kv(grid, 'Warna', a.color);
  kv(grid, 'Bahan Bakar', a.fuel);
  kv(grid, 'Transmisi', a.transmission);
  kv(grid, 'No. Mesin', a.engineNumber);
  kv(grid, 'No. Rangka', a.chassisNumber);
  kv(grid, 'Pemilik', a.owner);
  kv(grid, 'Wilayah Registrasi', a.registrationRegion);
  kv(grid, 'Odometer', a.odometer ? `${a.odometer} km` : '');
  kv(grid, 'Kapasitas', a.capacity ? `${a.capacity} kursi` : '');
  kv(grid, 'Tgl Akuisisi', fmtDate(a.acquisitionDate));
  kv(grid, 'Nilai Akuisisi', a.acquisitionValue ? `Rp ${a.acquisitionValue}` : '');
  sec.append(grid);
  return sec;
}

function renderTax(a) {
  const sec = section('Tax');
  const badges = el('div', 'vad-badges');
  badges.append(pill(`Pajak: ${a.tax.label}`, a.tax.tone));
  badges.append(pill(`STNK: ${a.stnk.label}`, a.stnk.tone));
  sec.append(badges);

  const grid = el('div', 'vad-kv');
  kv(grid, 'No. STNK', a.stnkNumber);
  kv(grid, 'Masa Berlaku STNK', fmtDate(a.stnkExpiry));
  kv(grid, 'Pajak Tahunan', fmtDate(a.annualTaxDue));
  kv(grid, 'Pajak 5 Tahunan', fmtDate(a.fiveYearTaxDue));
  sec.append(grid);

  // Feature 7 — Tax payment history (read-only timeline)
  const hist = el('div', null);
  hist.style.marginTop = '.4rem';
  hist.append(el('div', 'vad-sec__title', 'Riwayat Pembayaran Pajak'));
  if (!a.taxHistory.length) {
    hist.append(el('div', 'vad-empty', 'Belum ada riwayat pembayaran.'));
  } else {
    const ul = el('ul', 'vad-tl');
    const rows = a.taxHistory.slice().sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));
    for (const tx of rows) {
      const li = el('li');
      li.append(el('span', 'vad-tl__dot'));
      const body = el('div', 'vad-tl__body');
      body.append(el('span', 'vad-tl__label', tx.amount ? `Rp ${tx.amount}` : 'Pembayaran Pajak'));
      const detail = [tx.officer && `Petugas: ${tx.officer}`, tx.notes].filter(Boolean).join(' · ');
      if (detail) body.append(el('span', 'vad-tl__detail', detail));
      li.append(body);
      li.append(el('span', 'vad-tl__time', fmtDate(tx.date)));
      ul.append(li);
    }
    hist.append(ul);
  }
  sec.append(hist);
  return sec;
}

function renderInsurance(a) {
  const sec = section('Insurance');
  const badges = el('div', 'vad-badges');
  badges.append(pill(`Asuransi: ${a.insurance.label}`, a.insurance.tone));
  sec.append(badges);
  const grid = el('div', 'vad-kv');
  kv(grid, 'Perusahaan', a.insuranceCompany);
  kv(grid, 'No. Polis', a.policyNumber);
  kv(grid, 'Cakupan', a.coverage);
  kv(grid, 'Masa Berlaku', fmtDate(a.insuranceExpiry));
  sec.append(grid);
  return sec;
}

function renderMaintenance(a) {
  const sec = section('Maintenance', ' (v1.18.1)');
  
  // Summary row
  const sumGrid = el('div', 'vad-kv');
  const summary = a.maintenanceSummary || {};
  kv(sumGrid, 'Total Catatan', String(summary.totalRecords || 0));
  kv(sumGrid, 'Terakhir', summary.lastDate ? fmtDate(summary.lastDate) : 'Belum ada');
  kv(sumGrid, 'Kategori Terakhir', summary.lastCategoryLabel || '—');
  kv(sumGrid, 'Biaya Terakhir', summary.lastCostDisplay || 'Rp 0');
  sec.append(sumGrid);
  
  // Timeline of maintenance records
  if (!a.maintenanceTimeline || !a.maintenanceTimeline.length) {
    sec.append(el('div', 'vad-empty', 'Belum ada catatan perawatan.'));
    return sec;
  }
  
  const ul = el('ul', 'vad-tl');
  const rows = a.maintenanceTimeline.slice(0, 8);
  for (const rec of rows) {
    const li = el('li');
    li.append(el('span', 'vad-tl__dot'));
    const body = el('div', 'vad-tl__body');
    body.append(el('span', 'vad-tl__label', rec.categoryLabel || 'Perawatan'));
    const detail = [rec.statusLabel, rec.costDisplay, rec.workshopName].filter(Boolean).join(' · ');
    if (detail) body.append(el('span', 'vad-tl__detail', detail));
    li.append(body);
    li.append(el('span', 'vad-tl__time', fmtDate(rec.date)));
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

function renderHistory(a) {
  const sec = section('History');
  const grid = el('div', 'vad-kv');
  kv(grid, 'Tipe Aset', a.typeInfo.label);
  kv(grid, 'Status', a.statusInfo.labelId);
  kv(grid, 'Dibuat', fmtDate(a.createdAt));
  kv(grid, 'Diperbarui', fmtDate(a.updatedAt));
  kv(grid, 'Diarsipkan', a.archived ? 'Ya' : 'Tidak');
  sec.append(grid);

  // Chronological event timeline (merged in from the former Timeline section).
  const tl = el('div', null);
  tl.style.marginTop = '.5rem';
  tl.append(el('div', 'vad-sec__title', 'Linimasa'));
  if (!a.timeline.length) {
    tl.append(el('div', 'vad-empty', 'Belum ada peristiwa.'));
  } else {
    const ul = el('ul', 'vad-tl');
    const rows = a.timeline.slice().sort((x, y) => new Date(y.date) - new Date(x.date));
    for (const ev of rows) {
      const li = el('li');
      li.append(el('span', 'vad-tl__dot'));
      const body = el('div', 'vad-tl__body');
      body.append(el('span', 'vad-tl__label', ev.label));
      if (ev.detail) body.append(el('span', 'vad-tl__detail', ev.detail));
      li.append(body);
      li.append(el('span', 'vad-tl__time', fmtDate(ev.date)));
      ul.append(li);
    }
    tl.append(ul);
  }
  sec.append(tl);
  return sec;
}

/* ── Drawer assembly + lifecycle ──────────────────────────────────────────── */

let _keyHandler = null;

function buildSheet(asset, opts) {
  const sheet = el('aside', 'vad-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `Detail kendaraan ${asset.name}`);

  // Header
  const head = el('div', 'vad-head');
  const top = el('div', 'vad-head__top');
  const brand = el('div', 'vad-head__brand');
  const brandIc = el('span', null);
  brandIc.innerHTML = renderIcon('vehicle-car', '0.95rem', 'currentColor');
  brand.append(brandIc, el('span', null, 'Vehicle Asset'));
  top.append(brand);
  top.append(el('span', 'vad-head__tag', 'Asset Intelligence'));
  const x = el('button', 'vad-x', '×');
  x.type = 'button'; x.setAttribute('aria-label', 'Tutup'); x.id = 'vadClose';
  top.append(x);
  head.append(top);

  const hero = el('div', 'vad-hero');
  const id = el('div', 'vad-hero__id');
  const avatar = el('span', 'vad-hero__avatar');
  avatar.innerHTML = renderIcon(vehicleTypeIconName(asset.type), '1.5rem', 'currentColor');
  id.append(avatar);
  const txt = el('div', 'vad-hero__txt');
  txt.append(el('span', 'vad-hero__name', asset.name || '—'));
  txt.append(el('span', 'vad-hero__plate', asset.plateNumber || 'Tanpa plat'));
  id.append(txt);
  const metric = el('div', 'vad-hero__metric');
  metric.append(el('span', 'vad-hero__num', String(asset.health.overall)));
  metric.append(el('span', 'vad-hero__lbl', 'Health / 100'));
  hero.append(id, metric);
  head.append(hero);

  const badges = el('div', 'vad-badges');
  badges.append(pill(asset.typeInfo.label, 'info'));
  badges.append(pill(asset.statusInfo.labelId, asset.statusInfo.tone === 'muted' ? null : asset.statusInfo.tone));
  badges.append(pill(asset.health.label, asset.health.color));
  head.append(badges);
  sheet.append(head);

  // Body — seven sections (NO Gallery). Order improves the information
  // hierarchy: high-level health, then operational eligibility, then the record.
  const body = el('div', 'vad-body');
  body.append(renderOverview(asset));
  body.append(renderOperational(asset));
  body.append(renderRegistration(asset));
  body.append(renderTax(asset));
  body.append(renderInsurance(asset));
  body.append(renderMaintenance(asset));
  body.append(renderHistory(asset));
  sheet.append(body);

  // Footer — the drawer is the SINGLE source of truth for lifecycle actions
  // (cards carry none). Each action closes the drawer first, then delegates to
  // the host handler; the host re-renders via its vehicles-change listener.
  const foot = el('div', 'vad-foot');
  foot.style.flexWrap = 'wrap';
  const closeBtn = el('button', 'vad-btn vad-btn--ghost', 'Tutup');
  closeBtn.type = 'button'; closeBtn.id = 'vadCloseBtn';

  const act = (handler) => (id) => { closeVehicleDetailDrawer(); handler(id); };
  if (asset.archived) {
    if (typeof opts.onRestore === 'function') {
      const b = el('button', 'vad-btn vad-btn--ghost', 'Pulihkan');
      b.type = 'button'; b.id = 'vadRestoreBtn';
      b.addEventListener('click', () => act(opts.onRestore)(asset.id));
      foot.append(b);
    }
    if (typeof opts.onDelete === 'function') {
      const b = el('button', 'vad-btn vad-btn--accent', 'Hapus');
      b.type = 'button'; b.id = 'vadDeleteBtn';
      b.addEventListener('click', () => act(opts.onDelete)(asset.id));
      foot.append(b);
    }
    foot.append(closeBtn);
  } else {
    if (typeof opts.onToggle === 'function') {
      const b = el('button', 'vad-btn vad-btn--ghost', asset.status === 'active' ? 'Nonaktifkan' : 'Aktifkan');
      b.type = 'button'; b.id = 'vadToggleBtn';
      b.addEventListener('click', () => act(opts.onToggle)(asset.id));
      foot.append(b);
    }
    if (typeof opts.onArchive === 'function') {
      const b = el('button', 'vad-btn vad-btn--ghost', 'Arsipkan');
      b.type = 'button'; b.id = 'vadArchiveBtn';
      b.addEventListener('click', () => act(opts.onArchive)(asset.id));
      foot.append(b);
    }
    if (typeof opts.onEdit === 'function') {
      const editBtn = el('button', 'vad-btn vad-btn--accent', 'Edit Aset');
      editBtn.type = 'button'; editBtn.id = 'vadEditBtn';
      editBtn.addEventListener('click', () => act(opts.onEdit)(asset.id));
      foot.append(editBtn);
    }
    foot.append(closeBtn);
  }
  sheet.append(foot);

  const close = () => closeVehicleDetailDrawer();
  x.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  return sheet;
}

/**
 * Open (or replace) the vehicle detail drawer for a normalized asset.
 * @param {Object} asset  normalizeVehicleAsset() result
 * @param {{onEdit?:(id:string)=>void, onToggle?:(id:string)=>void,
 *          onArchive?:(id:string)=>void, onRestore?:(id:string)=>void,
 *          onDelete?:(id:string)=>void}} [opts]
 * @returns {HTMLElement} the drawer root
 */
export function openVehicleDetailDrawer(asset, opts = {}) {
  ensureStyles();
  closeVehicleDetailDrawer();
  if (!asset || typeof asset !== 'object') return null;

  const overlay = el('div', 'vad-overlay');
  overlay.id = ROOT_ID;
  overlay.setAttribute('data-open', 'false');
  overlay.append(buildSheet(asset, opts));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeVehicleDetailDrawer(); });
  document.body.appendChild(overlay);

  _keyHandler = (e) => { if (e.key === 'Escape') closeVehicleDetailDrawer(); };
  document.addEventListener('keydown', _keyHandler);

  requestAnimationFrame(() => { overlay.setAttribute('data-open', 'true'); });
  return overlay;
}

/** Close + remove the drawer (with a short fade) and unbind the ESC handler. */
export function closeVehicleDetailDrawer() {
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  const existing = document.getElementById(ROOT_ID);
  if (!existing) return;
  existing.setAttribute('data-open', 'false');
  setTimeout(() => { if (existing.parentNode) existing.parentNode.removeChild(existing); }, 220);
}
