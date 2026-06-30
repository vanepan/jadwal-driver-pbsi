/* ============================================================
   VEHICLE-DETAIL-DRAWER.JS — Vehicle Asset Intelligence
   (v1.18.4 — Executive UI Sprint 2)

   The asset detail drawer. As of Sprint 2 it no longer ships its own overlay,
   focus-trap, ESC handling, footer, badges, key/value grid or timeline — all of
   that bespoke `.vad-*` grammar is RETIRED in favour of the Executive UI Kit's
   ONE drawer (openExecutiveDrawer + execDrawerSection / execDrawerMetrics /
   execDrawerTimeline + ExecutiveStatusPill). This file is now a thin ADAPTER:
   it maps a normalized asset onto the kit's slots and footer actions.

   Two visuals have no kit primitive and are kept as a small, token-driven,
   exec-namespaced supplement (per the Sprint-2 decision): the asset HERO
   (avatar score) and the OVERVIEW health bars.

   It RENDERS ONLY — every value comes from a normalized asset produced by
   vehicle-asset-service. The drawer recomputes nothing. All asset-derived
   strings pass through escHtml (the kit body uses innerHTML), so a plate /
   owner name can never inject markup. Dark-mode safe via the kit scope. Zero
   emoji — glyphs come from the single icon engine (anIcon).
   ============================================================ */

'use strict';

import {
  ExecutiveDrawerOpen as openExecutiveDrawer,
  ExecutiveDrawerClose as closeExecutiveDrawer,
  ExecutiveDrawerSection as execDrawerSection,
  ExecutiveDrawerMetrics as execDrawerMetrics,
  ExecutiveDrawerTimeline as execDrawerTimeline,
  ExecutiveStatusPill,
  anIcon,
  escHtml,
} from '../analytics/executive-ui-kit.js';
import { vehicleTypeIconName } from './icon-system.js';

const STYLE_ID = 'vad-hero-styles';

/* Supplement ONLY for the two visuals the kit has no primitive for: the asset
   hero (score) and the Overview health bars. Token-driven, dark-mode safe,
   `.exec-vad-*` namespaced so it reads as part of the Executive drawer. */
const CSS = `
.exec-vad-hero{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;
  padding:14px 16px;background:var(--surface-2,#fbfaf8);border:1px solid var(--border,#e8e6e2);
  border-radius:var(--radius-sm,11px);}
.exec-vad-hero__metric{display:flex;flex-direction:column;align-items:flex-start;gap:2px;line-height:1.05;}
.exec-vad-hero__num{font-size:1.9rem;font-weight:800;letter-spacing:-.01em;color:var(--text,#1a1917);
  font-variant-numeric:tabular-nums;}
.exec-vad-hero__lbl{font-size:.6rem;color:var(--muted,#5b5953);text-transform:uppercase;letter-spacing:.04em;font-weight:700;}
.exec-vad-badges{display:flex;flex-wrap:wrap;gap:.35rem;justify-content:flex-end;}
.exec-vad-bd{display:flex;flex-direction:column;gap:.5rem;}
.exec-vad-bd__row{display:flex;align-items:center;gap:.6rem;}
.exec-vad-bd__k{flex:0 0 6.6rem;font-size:.8rem;font-weight:600;color:var(--text,#1a1917);}
.exec-vad-bd__bar{flex:1 1 auto;height:.5rem;border-radius:999px;background:var(--surface-2,#fbfaf8);
  border:1px solid var(--border,#e8e6e2);overflow:hidden;min-width:2rem;}
.exec-vad-bd__fill{height:100%;border-radius:999px;background:var(--info,#3b5ba9);}
.exec-vad-bd__fill[data-tone="ok"]{background:var(--ok,#2f7d62);}
.exec-vad-bd__fill[data-tone="warn"]{background:var(--warn,#946420);}
.exec-vad-bd__fill[data-tone="danger"]{background:var(--danger,#a8292f);}
.exec-vad-bd__pts{flex:0 0 2.7rem;text-align:right;font-size:.84rem;font-weight:700;
  font-variant-numeric:tabular-nums;color:var(--text,#1a1917);}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/* ── small builders (string HTML; every value escaped) ─────────────────────── */

const esc = escHtml;

/** Normalize a tone to the pill/health-bar tone set. 'muted'/unknown → fallback. */
function tone3(t, fallback = 'neutral') {
  return (t === 'ok' || t === 'warn' || t === 'danger' || t === 'info') ? t : fallback;
}

/** Health-bar tone band (3-step). null → null (N/A is excluded, not zero). */
function band3(s) {
  return s == null ? null : s >= 70 ? 'ok' : s >= 40 ? 'warn' : 'danger';
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Build a metrics item; empty values collapse to '—' (null) like the old kv. */
function m(label, value, tone) {
  const v = (value === '' || value == null) ? null : value;
  return { label, value: v, tone };
}

function healthBars(a) {
  const rows = [
    ['Status Legal', a.health.legal, band3(a.health.legal)],
    ['Perawatan', a.health.maintenance, band3(a.health.maintenance)],
    ['Status Operasional', a.health.operational, a.statusInfo.tone === 'muted' ? 'info' : tone3(a.statusInfo.tone, 'info')],
    ['Kelengkapan Dokumen', a.health.documents, band3(a.health.documents)],
    ['Overall Asset Health', a.health.overall, tone3(a.health.color, 'info')],
  ];
  const bar = (label, score, tn) => {
    const w = score == null ? 0 : Math.max(0, Math.min(100, score));
    const toneAttr = tn ? ` data-tone="${esc(tn)}"` : '';
    return `<div class="exec-vad-bd__row">
        <span class="exec-vad-bd__k">${esc(label)}</span>
        <span class="exec-vad-bd__bar"><span class="exec-vad-bd__fill"${toneAttr} style="width:${w}%"></span></span>
        <span class="exec-vad-bd__pts">${score == null ? 'N/A' : esc(score)}</span>
      </div>`;
  };
  return `<div class="exec-vad-bd">${rows.map(r => bar(r[0], r[1], r[2])).join('')}</div>`;
}

function badgeRow(pills) {
  return `<div class="exec-vad-badges" style="justify-content:flex-start">${pills.filter(Boolean).join('')}</div>`;
}

/* ── Section composition ──────────────────────────────────────────────────── */

function heroBlock(a) {
  const pills = [
    ExecutiveStatusPill(a.typeInfo.label, 'info'),
    ExecutiveStatusPill(a.statusInfo.labelId, tone3(a.statusInfo.tone, 'neutral')),
    ExecutiveStatusPill(a.health.label, tone3(a.health.color, 'neutral')),
  ];
  return `<div class="exec-vad-hero">
      <div class="exec-vad-hero__metric">
        <span class="exec-vad-hero__num">${esc(a.health.overall)}</span>
        <span class="exec-vad-hero__lbl">Health / 100</span>
      </div>
      <div class="exec-vad-badges">${pills.join('')}</div>
    </div>`;
}

function overviewSection(a) {
  return execDrawerSection({ title: `Overview — ${a.health.label}`, content: healthBars(a) });
}

function operationalSection(a) {
  const metrics = execDrawerMetrics([
    m('Status', a.statusInfo.labelId),
    m('Tipe Aset', a.typeInfo.label),
  ]);
  const elig = badgeRow([
    ExecutiveStatusPill(`Dispatch: ${a.eligibility.dispatch ? 'Ya' : 'Tidak'}`, a.eligibility.dispatch ? 'ok' : 'danger'),
    ExecutiveStatusPill(`Rekomendasi: ${a.eligibility.recommendation ? 'Ya' : (a.eligibility.medicalOnly ? 'Medis' : 'Tidak')}`, a.eligibility.recommendation ? 'ok' : (a.eligibility.medicalOnly ? 'warn' : 'danger')),
    ExecutiveStatusPill(`Analytics: ${a.eligibility.analytics ? 'Ya' : 'Tidak'}`, a.eligibility.analytics ? 'ok' : 'danger'),
  ]);
  return execDrawerSection({ title: 'Operational', content: metrics + elig });
}

function registrationSection(a) {
  const metrics = execDrawerMetrics([
    m('Plat Nomor', a.plateNumber),
    m('Merek', a.brand),
    m('Model', a.model),
    m('Tahun', a.year),
    m('Warna', a.color),
    m('Bahan Bakar', a.fuel),
    m('Transmisi', a.transmission),
    m('No. Mesin', a.engineNumber),
    m('No. Rangka', a.chassisNumber),
    m('Pemilik', a.owner),
    m('Wilayah Registrasi', a.registrationRegion),
    m('Odometer', a.odometer ? `${a.odometer} km` : ''),
    m('Kapasitas', a.capacity ? `${a.capacity} kursi` : ''),
    m('Tgl Akuisisi', fmtDate(a.acquisitionDate)),
    m('Nilai Akuisisi', a.acquisitionValue ? `Rp ${a.acquisitionValue}` : ''),
  ]);
  return execDrawerSection({ title: 'Registration', content: metrics });
}

function taxSection(a) {
  const badges = badgeRow([
    ExecutiveStatusPill(`Pajak: ${a.tax.label}`, tone3(a.tax.tone, 'neutral')),
    ExecutiveStatusPill(`STNK: ${a.stnk.label}`, tone3(a.stnk.tone, 'neutral')),
  ]);
  const metrics = execDrawerMetrics([
    m('No. STNK', a.stnkNumber),
    m('Masa Berlaku STNK', fmtDate(a.stnkExpiry)),
    m('Pajak Tahunan', fmtDate(a.annualTaxDue)),
    m('Pajak 5 Tahunan', fmtDate(a.fiveYearTaxDue)),
  ]);
  // Feature 7 — tax payment history (read-only timeline).
  const rows = a.taxHistory.slice().sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));
  const tl = rows.length
    ? execDrawerTimeline(rows.map(tx => ({
        when: fmtDate(tx.date),
        title: tx.amount ? `Rp ${tx.amount}` : 'Pembayaran Pajak',
        desc: [tx.officer && `Petugas: ${tx.officer}`, tx.notes].filter(Boolean).join(' · '),
        tone: 'info',
      })))
    : '<div class="exec-drawer-sec__h">Riwayat Pembayaran Pajak</div><p style="font-size:13px;color:var(--muted)">Belum ada riwayat pembayaran.</p>';
  const histTitle = rows.length ? '<div class="exec-drawer-sec__h">Riwayat Pembayaran Pajak</div>' : '';
  return execDrawerSection({ title: 'Tax', content: badges + metrics + histTitle + tl });
}

function insuranceSection(a) {
  const badges = badgeRow([ExecutiveStatusPill(`Asuransi: ${a.insurance.label}`, tone3(a.insurance.tone, 'neutral'))]);
  const metrics = execDrawerMetrics([
    m('Perusahaan', a.insuranceCompany),
    m('No. Polis', a.policyNumber),
    m('Cakupan', a.coverage),
    m('Masa Berlaku', fmtDate(a.insuranceExpiry)),
  ]);
  return execDrawerSection({ title: 'Insurance', content: badges + metrics });
}

function maintenanceSection(a) {
  const s = a.maintenanceSummary || {};
  const metrics = execDrawerMetrics([
    m('Total Catatan', String(s.totalRecords || 0)),
    m('Terakhir', s.lastDate ? fmtDate(s.lastDate) : 'Belum ada'),
    m('Kategori Terakhir', s.lastCategoryLabel || '—'),
    m('Biaya Terakhir', s.lastCostDisplay || 'Rp 0'),
  ]);
  const tl = (a.maintenanceTimeline && a.maintenanceTimeline.length)
    ? execDrawerTimeline(a.maintenanceTimeline.slice(0, 8).map(rec => ({
        when: fmtDate(rec.date),
        title: rec.categoryLabel || 'Perawatan',
        desc: [rec.statusLabel, rec.costDisplay, rec.workshopName].filter(Boolean).join(' · '),
        tone: 'info',
      })))
    : '<p style="font-size:13px;color:var(--muted)">Belum ada catatan perawatan.</p>';
  return execDrawerSection({ title: 'Maintenance', content: metrics + tl });
}

function historySection(a) {
  const metrics = execDrawerMetrics([
    m('Tipe Aset', a.typeInfo.label),
    m('Status', a.statusInfo.labelId),
    m('Dibuat', fmtDate(a.createdAt)),
    m('Diperbarui', fmtDate(a.updatedAt)),
    m('Diarsipkan', a.archived ? 'Ya' : 'Tidak'),
  ]);
  const rows = a.timeline.slice().sort((x, y) => new Date(y.date) - new Date(x.date));
  const tl = rows.length
    ? execDrawerTimeline(rows.map(ev => ({ when: fmtDate(ev.date), title: ev.label, desc: ev.detail || '', tone: 'info' })))
    : '<p style="font-size:13px;color:var(--muted)">Belum ada peristiwa.</p>';
  return execDrawerSection({ title: 'History', content: metrics + '<div class="exec-drawer-sec__h">Linimasa</div>' + tl });
}

/* ── Footer actions ───────────────────────────────────────────────────────── */

function buildFooter(asset, opts) {
  const footer = [];
  if (asset.archived) {
    if (typeof opts.onRestore === 'function') footer.push({ label: 'Pulihkan', action: 'restore' });
    if (typeof opts.onDelete === 'function') footer.push({ label: 'Hapus', action: 'delete', variant: 'danger' });
  } else {
    if (typeof opts.onToggle === 'function') footer.push({ label: asset.status === 'active' ? 'Nonaktifkan' : 'Aktifkan', action: 'toggle' });
    if (typeof opts.onArchive === 'function') footer.push({ label: 'Arsipkan', action: 'archive' });
    if (typeof opts.onEdit === 'function') footer.push({ label: 'Edit Aset', action: 'edit', variant: 'primary' });
  }
  return footer;
}

/* ── Public API (signature unchanged) ─────────────────────────────────────── */

/**
 * Open (or replace) the vehicle detail drawer for a normalized asset.
 * @param {Object} asset  normalizeVehicleAsset() result
 * @param {{onEdit?:(id:string)=>void, onToggle?:(id:string)=>void,
 *          onArchive?:(id:string)=>void, onRestore?:(id:string)=>void,
 *          onDelete?:(id:string)=>void}} [opts]
 * @returns {HTMLElement|null} the drawer overlay root
 */
export function openVehicleDetailDrawer(asset, opts = {}) {
  if (!asset || typeof asset !== 'object') return null;
  ensureStyles();

  const body = [
    heroBlock(asset),
    overviewSection(asset),
    operationalSection(asset),
    registrationSection(asset),
    taxSection(asset),
    insuranceSection(asset),
    maintenanceSection(asset),
    historySection(asset),
  ].join('');

  // Footer action → host handler. Mirror the prior order: close the drawer
  // first, then delegate (the host re-renders via its vehicles-change listener).
  const handlers = {
    restore: opts.onRestore,
    delete: opts.onDelete,
    toggle: opts.onToggle,
    archive: opts.onArchive,
    edit: opts.onEdit,
  };

  return openExecutiveDrawer({
    title: asset.name || '—',
    subtitle: asset.plateNumber || 'Tanpa plat',
    icon: vehicleTypeIconName(asset.type),
    body,
    footer: buildFooter(asset, opts),
    onAction: (action, close) => {
      const fn = handlers[action];
      close();
      if (typeof fn === 'function') fn(asset.id);
    },
  });
}

/** Close + remove the drawer (delegates to the kit). */
export function closeVehicleDetailDrawer() {
  closeExecutiveDrawer();
}
