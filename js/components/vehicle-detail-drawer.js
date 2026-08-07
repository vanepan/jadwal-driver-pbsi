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
import { complianceTypeInfo } from '../config/compliance-config.js';
// v1.29.18 (Phase 7) — Reminder Engine: reads the SAME normalized asset this
// drawer already renders (tax/insurance doc-status + maintenanceProjection);
// computes no due date/priority of its own. Render-only consumer, like every
// other section in this file.
import { computeVehicleReminders } from '../services/reminder-engine.js';
// v1.19.6 — the Fleet Explainability layer. PURE derivations (arrangements of the
// SAME certified projection) + their presentation panels; no prediction logic.
import {
  dominantRisk as predDominantRisk,
  contributingFactors,
  confidenceAnalytics,
  historicalComparison,
  predictionMethodology,
  predictionWindow,
  dataCoverage,
  limitations,
  operationalNotes,
} from '../prediction/explainability.js';
import {
  injectExplainabilityStyles,
  ContributingFactorsPanel,
  ConfidenceAnalyticsPanel,
  MethodologyPanel,
  HistoricalTrendPanel,
  DataCoveragePanel,
  NotesList,
} from '../analytics/prediction-explainability-panel.js';
// v1.19.7 — Fleet Recommendation Engine: the recommendation drawer sections
// (What / Why / Priority / Expected benefit / Prediction reference / Source).
// EXTENDS the prediction drawer; never removes existing content.
import { recommendationDrawerSections } from '../vehicle/vehicle-recommendation-panel.js';
// v1.19.8 — Scenario Simulation: when a simulation is active, the drawer shows its
// Current-vs-Simulation result for this vehicle. EXTENDS the drawer; read-only.
import { simulationDrawerSections } from '../vehicle/vehicle-simulation-panel.js';

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
  // The Explainability sections (shown only for the prediction drawer) reuse the
  // shared `.pex-*` supplement — inject it here so it is always present when a
  // prediction is passed. Idempotent + a no-op for the plain inventory drawer.
  injectExplainabilityStyles();
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

function fmtRp(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString('id-ID') : String(n == null ? '' : n);
}

/** Human countdown to a derived doc-status (a.tax / a.stnk / a.insurance) — the
 *  "Upcoming Renewal" signal. `days` already comes from vehicle-asset-service's
 *  deriveDocStatus; this only phrases it. */
function renewalCountdown(doc) {
  if (!doc || doc.days == null) return 'Tdk diketahui';
  if (doc.days < 0) return `Terlambat ${Math.abs(doc.days)} hari`;
  if (doc.days === 0) return 'Jatuh tempo hari ini';
  return `${doc.days} hari lagi`;
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Phase 6 (v1.29.17) — km formatter for the Maintenance Projection block. */
function fmtKm(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `${num.toLocaleString('id-ID')} km` : '—';
}

/** Human countdown for the projection's remainingDays/remainingKm — same
 *  overdue/today/N-left phrasing as renewalCountdown, generalized to a unit. */
function projectionCountdown(remaining, unit) {
  if (remaining == null) return null;
  if (remaining < 0) return `Terlambat ${Math.abs(remaining).toLocaleString('id-ID')} ${unit}`;
  if (remaining === 0) return `Jatuh tempo sekarang`;
  return `${remaining.toLocaleString('id-ID')} ${unit} lagi`;
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

/** Reminders (Phase 7, v1.29.18) — Overdue / Due Soon / Upcoming groups built
 *  from computeVehicleReminders(a), which itself only reads a.tax/a.insurance/
 *  a.fiveYearTaxDue/a.maintenanceProjection. This section computes nothing:
 *  no due date, no remaining-day count, no priority is derived here. */
function remindersGroup(title, items) {
  if (!items.length) return '';
  const tl = execDrawerTimeline(items.map((r) => ({
    when: r.dueDate ? fmtDate(r.dueDate) : (r.remainingKm != null ? fmtKm(r.remainingKm) : '—'),
    title: r.category ? `${r.typeLabel} — ${r.categoryLabel}` : r.typeLabel,
    desc: [r.reason, r.recommendedAction].filter(Boolean).join(' · '),
    tone: tone3(r.tone, 'info'),
  })));
  return `<div class="exec-drawer-sec__h">${esc(title)}</div>${tl}`;
}

function remindersSection(a) {
  const reminders = computeVehicleReminders(a);
  const overdue = reminders.filter((r) => r.status === 'overdue');
  const dueSoon = reminders.filter((r) => r.status === 'due_soon');
  const upcoming = reminders.filter((r) => r.status === 'upcoming');

  if (!reminders.length) {
    const msg = a.archived || a.status === 'retired'
      ? 'Aset tidak aktif — tidak ada kewajiban yang dipantau.'
      : 'Belum ada tanggal jatuh tempo yang tercatat untuk dipantau.';
    return execDrawerSection({ title: 'Pengingat', content: `<p style="font-size:13px;color:var(--muted)">${esc(msg)}</p>` });
  }

  const badges = badgeRow([
    overdue.length ? ExecutiveStatusPill(`${overdue.length} Terlambat`, 'danger') : '',
    dueSoon.length ? ExecutiveStatusPill(`${dueSoon.length} Segera`, 'warn') : '',
    upcoming.length ? ExecutiveStatusPill(`${upcoming.length} Terjadwal`, 'ok') : '',
  ]);

  const content = badges
    + remindersGroup('Terlambat', overdue)
    + remindersGroup('Segera', dueSoon)
    + remindersGroup('Terjadwal', upcoming);

  return execDrawerSection({ title: 'Pengingat', content });
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
    m('Perpanjangan Berikutnya', renewalCountdown(a.tax), a.tax.tone),
  ]);
  // Vehicle Compliance & Financial History — complianceHistory (renewalDate,
  // expiryDate, amount, type) is the source of truth for this timeline going
  // forward. Human-readable only: no field names, no technical values.
  // v1.29.16 — insurance-type entries get their own filtered view in
  // insuranceSection() below (same ledger, no duplicate storage); excluded
  // here so a renewal doesn't appear twice in the same drawer.
  const rows = a.complianceHistory.filter(rec => rec.type !== 'insurance')
    .sort((x, y) => new Date(y.renewalDate || 0) - new Date(x.renewalDate || 0));
  const tl = rows.length
    ? execDrawerTimeline(rows.map(rec => ({
        when: fmtDate(rec.renewalDate),
        title: complianceTypeInfo(rec.type).timelineTitle,
        desc: [
          rec.amount != null ? `Rp ${fmtRp(rec.amount)}` : '',
          rec.expiryDate ? `Berlaku Hingga ${fmtDate(rec.expiryDate)}` : '',
        ].filter(Boolean).join(' · '),
        tone: 'info',
      })))
    : '<div class="exec-drawer-sec__h">Riwayat Kepatuhan</div><p style="font-size:13px;color:var(--muted)">Belum ada riwayat perpanjangan.</p>';
  const histTitle = rows.length ? '<div class="exec-drawer-sec__h">Riwayat Kepatuhan</div>' : '';
  return execDrawerSection({ title: 'Tax', content: badges + metrics + histTitle + tl });
}

/** Insurance — Current Insurance summary + Insurance History (Phase 5, v1.29.16).
 *  Reuses the SAME complianceHistory ledger as Tax, filtered to type:'insurance'
 *  entries only (never a separate ledger/store). */
function insuranceSection(a) {
  const badges = badgeRow([ExecutiveStatusPill(`Asuransi: ${a.insurance.label}`, tone3(a.insurance.tone, 'neutral'))]);
  const metrics = execDrawerMetrics([
    m('Perusahaan', a.insuranceCompany),
    m('No. Polis', a.policyNumber),
    m('Cakupan', a.coverage),
    m('Masa Berlaku', fmtDate(a.insuranceExpiry)),
    m('Sisa Hari', renewalCountdown(a.insurance), a.insurance.tone),
  ]);
  const rows = a.complianceHistory.filter(rec => rec.type === 'insurance')
    .sort((x, y) => new Date(y.renewalDate || 0) - new Date(x.renewalDate || 0));
  const tl = rows.length
    ? execDrawerTimeline(rows.map(rec => ({
        when: fmtDate(rec.renewalDate),
        title: complianceTypeInfo(rec.type).timelineTitle,
        desc: [
          rec.amount != null ? `Rp ${fmtRp(rec.amount)}` : '',
          rec.expiryDate ? `Berlaku Hingga ${fmtDate(rec.expiryDate)}` : '',
        ].filter(Boolean).join(' · '),
        tone: 'info',
      })))
    : '<p style="font-size:13px;color:var(--muted)">Belum ada riwayat perpanjangan asuransi.</p>';
  const histTitle = rows.length ? '<div class="exec-drawer-sec__h">Riwayat Asuransi</div>' : '';
  return execDrawerSection({ title: 'Insurance', content: badges + metrics + histTitle + tl });
}

const STATUS_LABEL_ID = { overdue: 'Terlambat', due_soon: 'Segera', on_track: 'Terjadwal', unknown: 'Tdk diketahui' };

/** Maintenance Projection (Phase 6, v1.29.17) — the deterministic headline
 *  ("next service due") plus a short "recommended next service" list, both
 *  computed by maintenance-projection-service.js and passed through on the
 *  normalized asset (a.maintenanceProjection). This section RENDERS ONLY —
 *  no due-date/remaining-km/priority arithmetic happens here. */
function maintenanceProjectionBlock(a) {
  const proj = a.maintenanceProjection;
  if (!proj || !proj.headline) return '';
  const h = proj.headline;

  const badges = badgeRow([
    ExecutiveStatusPill(`Proyeksi: ${h.label}`, tone3(h.tone, 'neutral')),
  ]);
  const countdown = [
    projectionCountdown(h.remainingDays, 'hari'),
    projectionCountdown(h.remainingKm, 'km'),
  ].filter(Boolean).join(' · ') || '—';
  const metrics = execDrawerMetrics([
    m('Kategori', h.categoryLabel || '—'),
    m('Perkiraan Tgl Servis', h.nextDueDate ? fmtDate(h.nextDueDate) : '—'),
    m('Perkiraan Odometer', h.nextDueOdometer != null ? fmtKm(h.nextDueOdometer) : '—'),
    m('Sisa Waktu/Jarak', countdown, h.tone),
  ]);
  const reason = h.reason
    ? `<p style="font-size:13px;color:var(--muted)">${esc(h.reason)}</p>` : '';

  const others = (proj.items || []).slice(0, 5);
  const list = others.length
    ? execDrawerTimeline(others.map(it => ({
        when: it.nextDueDate ? fmtDate(it.nextDueDate) : (it.nextDueOdometer != null ? fmtKm(it.nextDueOdometer) : '—'),
        title: it.categoryLabel,
        desc: [STATUS_LABEL_ID[it.status] || it.label, it.reason].filter(Boolean).join(' · '),
        tone: tone3(it.tone, 'info'),
      })))
    : '';
  const listTitle = others.length ? '<div class="exec-drawer-sec__h">Rekomendasi Servis Berikutnya</div>' : '';

  return execDrawerSection({ title: 'Proyeksi Perawatan', content: badges + metrics + reason + listTitle + list });
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
  return maintenanceProjectionBlock(a) + execDrawerSection({ title: 'Maintenance', content: metrics + tl });
}

/* ── Explainability Drawer (v1.19.6, optional) ─────────────────────────────────
   Rendered ONLY when the caller passes `opts.prediction` — the certified
   per-vehicle projection from the Prediction Service (model.vehicles[i]). The
   drawer recomputes NOTHING: the Fleet Explainability layer (js/prediction/
   explainability.js) ARRANGES that same certified projection into executive,
   plain-language transparency, and the panels present it. Answers, without
   technical knowledge: why was this prediction generated? how reliable is it?
   which factors influenced it? how much data supports it? should action be taken?

   Signals, weights, thresholds and validator internals are never shown — only a
   factor's plain-language share of the decision + operational reason. Backward
   compatible: inventory callers pass no prediction and the drawer is unchanged. */

const PRED_CONF_WORD = { HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' };
const PRED_CONF_TONE = { HIGH: 'ok', MEDIUM: 'info', LOW: 'warn' };

/** Prediction Summary — the existing at-a-glance risk snapshot (kept first). */
function predictionSummarySection(p, dom) {
  const mr = p.maintenanceRisk || {};
  const ar = p.administrativeRisk || {};
  const af = p.availabilityForecast || {};
  const cLvl = dom.confidenceLevel || 'LOW';
  const win = predictionWindow(p);

  const badges = badgeRow([
    ExecutiveStatusPill(`Keyakinan ${PRED_CONF_WORD[cLvl] || 'Rendah'}`, PRED_CONF_TONE[cLvl] || 'warn'),
    ExecutiveStatusPill(`Jendela ${win.label}`, 'info'),
  ]);
  const summary = dom.summary
    ? `<p style="font-size:13px;color:var(--muted)">${esc(dom.summary)}</p>` : '';
  const metrics = execDrawerMetrics([
    m('Risiko Perawatan', mr.levelLabelId || '—', tone3(mr.tone, 'info')),
    m('Risiko Administrasi', ar.levelLabelId || '—', tone3(ar.tone, 'info')),
    m('Ketersediaan', af.levelLabelId || '—', tone3(af.tone, 'info')),
    m('Keyakinan Prediksi', PRED_CONF_WORD[cLvl] || 'Rendah'),
  ]);
  return execDrawerSection({ title: 'Prediction Summary', content: badges + summary + metrics });
}

/**
 * The full Explainability drawer body for a certified projection. Returns several
 * ExecutiveDrawerSections concatenated (the caller joins them into the body).
 */
function predictionSection(p) {
  const dom = predDominantRisk(p).pred;

  const sections = [
    predictionSummarySection(p, dom),
    execDrawerSection({ title: 'Contributing Factors', content: ContributingFactorsPanel(contributingFactors(p)) }),
    execDrawerSection({ title: 'Prediction Confidence', content: ConfidenceAnalyticsPanel(confidenceAnalytics(p)) }),
    execDrawerSection({ title: 'Historical Trend', content: HistoricalTrendPanel(historicalComparison(p)) }),
    execDrawerSection({ title: 'Prediction Methodology', content: MethodologyPanel(predictionMethodology()) }),
    execDrawerSection({ title: 'Data Coverage', content: DataCoveragePanel(dataCoverage(p)) }),
    execDrawerSection({ title: 'Operational Notes', content: NotesList(operationalNotes(p), 'ok') }),
    execDrawerSection({ title: 'Limitations', content: NotesList(limitations(p), 'warn') }),
    // v1.19.7 — the actionable Recommendation, distilled from this SAME certified
    // projection by the Fleet Recommendation Engine (extends, never replaces).
    recommendationDrawerSections(p),
  ];
  return sections.join('');
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
    // Vehicle Compliance & Financial History — placed first/primary: this is
    // the once-or-twice-a-year action the drawer exists to make effortless.
    if (typeof opts.onRenewSTNK === 'function') footer.push({ label: 'Perpanjang STNK', action: 'renew-stnk', variant: 'primary' });
    // Phase 5 (v1.29.16) — Insurance Ledger: same interaction pattern as STNK
    // (opens a small modal on top of this drawer, drawer stays open), a
    // separate real-world renewal cadence/provider so it gets its own action.
    if (typeof opts.onRenewInsurance === 'function') footer.push({ label: 'Perpanjang Asuransi', action: 'renew-insurance' });
    if (typeof opts.onToggle === 'function') footer.push({ label: asset.status === 'active' ? 'Nonaktifkan' : 'Aktifkan', action: 'toggle' });
    if (typeof opts.onArchive === 'function') footer.push({ label: 'Arsipkan', action: 'archive' });
    if (typeof opts.onEdit === 'function') footer.push({ label: 'Edit Aset', action: 'edit' });
  }
  return footer;
}

/** Compose the drawer body sections — shared by open + in-place refresh so
 *  they can never drift apart. */
function buildDrawerBody(asset, opts) {
  return [
    heroBlock(asset),
    overviewSection(asset),
    // Phase 7 (v1.29.18) — Reminders sits right after Overview: "what deserves
    // attention" is high-value information, same placement rationale as the
    // Prediction/Simulation sections directly below it.
    remindersSection(asset),
    // v1.19.5 — Prediction summary sits high (right after health) when the caller
    // supplies a certified per-vehicle projection; omitted entirely otherwise.
    (opts.prediction && typeof opts.prediction === 'object') ? predictionSection(opts.prediction) : '',
    // v1.19.8 — the active scenario simulation's Current-vs-Simulation result for
    // this vehicle (only when a simulation is running); read-only, extends only.
    (opts.simulation && typeof opts.simulation === 'object') ? simulationDrawerSections(opts.simulation, asset.id) : '',
    operationalSection(asset),
    registrationSection(asset),
    taxSection(asset),
    insuranceSection(asset),
    maintenanceSection(asset),
    historySection(asset),
  ].join('');
}

/* ── Public API (signature unchanged) ─────────────────────────────────────── */

/**
 * Open (or replace) the vehicle detail drawer for a normalized asset.
 * @param {Object} asset  normalizeVehicleAsset() result
 * @param {{onEdit?:(id:string)=>void, onToggle?:(id:string)=>void,
 *          onArchive?:(id:string)=>void, onRestore?:(id:string)=>void,
 *          onDelete?:(id:string)=>void, onRenewSTNK?:(id:string)=>void,
 *          onRenewInsurance?:(id:string)=>void,
 *          prediction?:Object}} [opts]  `prediction` = certified per-vehicle
 *          projection (model.vehicles[i]); when present a Prediction section is
 *          shown. Omit it for the plain (inventory) drawer.
 * @returns {HTMLElement|null} the drawer overlay root
 */
export function openVehicleDetailDrawer(asset, opts = {}) {
  if (!asset || typeof asset !== 'object') return null;
  ensureStyles();

  const body = buildDrawerBody(asset, opts);

  // Footer action → host handler. Mirror the prior order: close the drawer
  // first, then delegate (the host re-renders via its vehicles-change listener)
  // — EXCEPT 'renew-stnk', which opens a small modal ON TOP of this drawer and
  // must leave it open (Compliance & Financial History spec: "Do NOT close the
  // drawer automatically"). The host refreshes the open drawer in place via
  // refreshVehicleDetailDrawer() once the renewal is saved.
  const handlers = {
    restore: opts.onRestore,
    delete: opts.onDelete,
    toggle: opts.onToggle,
    archive: opts.onArchive,
    edit: opts.onEdit,
    'renew-stnk': opts.onRenewSTNK,
    'renew-insurance': opts.onRenewInsurance,
  };
  const KEEP_OPEN_ACTIONS = new Set(['renew-stnk', 'renew-insurance']);

  return openExecutiveDrawer({
    title: asset.name || '—',
    subtitle: asset.plateNumber || 'Tanpa plat',
    icon: vehicleTypeIconName(asset.type),
    body,
    footer: buildFooter(asset, opts),
    onAction: (action, close) => {
      const fn = handlers[action];
      if (!KEEP_OPEN_ACTIONS.has(action)) close();
      if (typeof fn === 'function') fn(asset.id);
    },
  });
}

/** Close + remove the drawer (delegates to the kit). */
export function closeVehicleDetailDrawer() {
  closeExecutiveDrawer();
}

/**
 * Re-render the CURRENTLY OPEN drawer's body in place, without closing it —
 * used after saving a compliance renewal so the timeline/badges/health refresh
 * immediately while the drawer stays open (see openVehicleDetailDrawer's
 * 'renew-stnk' handling above). No-op (returns false) if no drawer is open.
 * @param {Object} asset  fresh normalizeVehicleAsset() result for the same vehicle
 * @param {Object} [opts] same shape as openVehicleDetailDrawer's opts
 * @returns {boolean} whether a drawer was found and refreshed
 */
export function refreshVehicleDetailDrawer(asset, opts = {}) {
  if (!asset || typeof asset !== 'object') return false;
  const bodyEl = document.querySelector('.exec-drawer-overlay .exec-drawer__body');
  if (!bodyEl) return false;
  bodyEl.innerHTML = buildDrawerBody(asset, opts);
  return true;
}
