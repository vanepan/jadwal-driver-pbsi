/* ============================================================
   WIDGETS/EXECUTIVE/INDEX.JS — v1.19.10 Executive Briefing

   The Executive Command Center as an operational BRIEFING, not a dashboard.
   Every widget SUMMARIZES, PRIORIZES, or RECOMMENDS — never plain data. All
   inputs are already-certified: ctx.models (the Executive Dashboard aggregate)
   and ctx.recommendations (the certified Recommendation Engine package built in
   app.js). PURE presentation: no prediction, no recommendation, no simulation
   logic here — those layers are consumed read-only and deep-linked into.

   Narratives are deterministic summaries of certified data — no AI, no LLM,
   no invented facts.
   ============================================================ */

'use strict';

import { esc, empty, lead, pill, listRow, list, actionBtn, chip, chipRow } from '../_widget-base.js';

/* ── deterministic view helpers ── */
const LEVEL_TONE = { high: 'good', medium: 'info', low: 'warn', insufficient: 'neutral', nodata: 'neutral' };
// Recommendation-engine tones → workspace tones.
const ENGINE_TONE = { ok: 'good', good: 'good', info: 'info', warn: 'warn', danger: 'danger', critical: 'danger' };
const engineTone = (t) => ENGINE_TONE[t] || 'neutral';
const n = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v));
const numOr0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function greeting(d) {
  const h = d.getHours();
  if (h < 11) return 'Selamat Pagi';
  if (h < 15) return 'Selamat Siang';
  if (h < 19) return 'Selamat Sore';
  return 'Selamat Malam';
}
function fmtLongDate(d) { return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function fmtTime(ts) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Trivial derived facts shared by several widgets. */
function facts(ctx) {
  const ex = ctx.models?.exec;
  const dk = ex?.driverKpis || {};
  const pending = (ctx.requests || []).filter(r => r.status === 'pending').length;
  const noVeh = numOr0(dk.tripsWithoutVehicle);
  const rec = ctx.recommendations || { certified: false };
  const fleetNormal = rec.certified && rec.board ? rec.board.isHealthyFleet : (noVeh === 0);
  return { ex, dk, pending, noVeh, rec, fleetNormal, score: ex?.score };
}

/** Deterministic executive narrative — a plain summary of certified signals. */
function narrativeFor({ score, pending, noVeh, fleetNormal }) {
  const head = !score || score.value == null ? 'Data operasional masih terbatas'
    : score.level === 'high' ? 'Operasional berjalan sangat baik'
    : score.level === 'medium' ? 'Operasional berjalan baik'
    : score.level === 'low' ? 'Operasional membutuhkan perhatian'
    : 'Data operasional masih terbatas';
  const parts = [head + '.'];
  if (noVeh > 0) parts.push(`${noVeh} trip masih memerlukan penetapan kendaraan.`);
  if (pending > 0) parts.push(`${pending} permintaan menunggu persetujuan.`);
  if (noVeh === 0 && pending === 0 && fleetNormal) parts.push('Tidak ada isu kritis yang membutuhkan tindakan segera.');
  return parts.join(' ');
}

const SEV_META = {
  critical: { rank: 0, label: 'Kritis', tone: 'danger' },
  warn: { rank: 1, label: 'Perlu Perhatian', tone: 'warn' },
  ok: { rank: 2, label: 'Sehat', tone: 'good' },
};

/* module inference for the activity feed */
function moduleOf(action) {
  const a = String(action || '');
  if (a.startsWith('request')) return { label: 'Permintaan', action: 'navPending' };
  if (a.startsWith('assignment')) return { label: 'Driver Ops', action: 'navDriverOps' };
  if (a.startsWith('vehicle')) return { label: 'Kendaraan', action: 'navVehicles' };
  if (a.startsWith('driver')) return { label: 'Driver', action: 'navDriverOps' };
  if (a.includes('nor') || a.includes('petty') || a.includes('expense')) return { label: 'Petty Cash', action: 'navPettyCash' };
  if (a.startsWith('alias') || a.startsWith('warning')) return { label: 'Analytics', action: 'navAnalyticsDriver' };
  return { label: 'Sistem', action: '' };
}
const ACTION_LABELS = {
  request_created: 'Permintaan dibuat', request_approved: 'Permintaan disetujui',
  request_rejected: 'Permintaan ditolak', assignment_created: 'Jadwal dibuat',
  assignment_updated: 'Jadwal diperbarui', assignment_deleted: 'Jadwal dihapus',
  vehicle_deactivated: 'Kendaraan dinonaktifkan', vehicle_reactivated: 'Kendaraan diaktifkan',
  vehicle_archived: 'Kendaraan diarsipkan', vehicle_restored: 'Kendaraan dipulihkan',
};
const eventLabel = (a) => ACTION_LABELS[a] || String(a || 'aktivitas').replace(/_/g, ' ');

export const widgets = {
  /* ── Executive Briefing Hero ── (greeting · date · readiness · narrative · summary) */
  'exec-hero': {
    render(ctx) {
      const f = facts(ctx);
      const name = (ctx.user && (ctx.user.name || ctx.user.username)) || 'Admin';
      const now = new Date();
      const tone = f.score ? (LEVEL_TONE[f.score.level] || 'neutral') : 'neutral';

      const panel = (f.score && f.score.value != null)
        ? `<div class="wsp-hero__score wsp-hero__score--${tone}">
             <span class="wsp-hero__scoreval">${esc(f.score.value)}</span><span class="wsp-hero__scoreunit">/100</span>
           </div>
           ${pill(f.score.label || 'Kondisi Operasional', tone)}`
        : `<div class="wsp-hero__scoreval wsp-hero__scoreval--muted">—</div>${pill('Menyusun data', 'neutral')}`;

      const bullets = [
        `${n(f.dk.activeVehicles)} kendaraan siap`,
        `${n(f.dk.activeDrivers)} driver aktif`,
        f.pending > 0 ? `${f.pending} permintaan menunggu persetujuan` : 'Tidak ada permintaan tertunda',
        f.fleetNormal ? 'Armada beroperasi normal' : `${f.noVeh} trip perlu kendaraan`,
      ];

      return `
        <div class="wsp-hero">
          <div class="wsp-hero__lead">
            <div class="wsp-hero__greeting">${esc(greeting(now))}, ${esc(name)}</div>
            <div class="wsp-hero__date">${esc(fmtLongDate(now))}</div>
            <p class="wsp-hero__narrative">${esc(narrativeFor(f))}</p>
          </div>
          <div class="wsp-hero__panel">
            <div class="wsp-hero__panel-label">Kesiapan Operasional</div>
            ${panel}
          </div>
          <div class="wsp-hero__summary">
            <div class="wsp-hero__summary-title">Ringkasan Hari Ini</div>
            <ul class="wsp-hero__list">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
          </div>
        </div>`;
    },
  },

  /* ── Operational Priority ── (ranked Critical → Warning → Healthy) */
  'exec-priority': {
    render(ctx) {
      const f = facts(ctx);
      const items = [];

      if (f.noVeh > 0) items.push({ sev: 'critical', title: `${f.noVeh} trip tanpa kendaraan`, reason: 'Perjalanan terjadwal belum memiliki kendaraan.', action: 'navPending', actionLabel: 'Tetapkan Kendaraan' });
      (f.rec.board?.critical || []).slice(0, 3).forEach(r => items.push({ sev: 'critical', title: `${r.vehicleName} — ${r.categoryLabel}`, reason: r.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau Prediksi' }));
      if (f.pending > 0) items.push({ sev: 'warn', title: `${f.pending} permintaan menunggu persetujuan`, reason: 'Permintaan bidang menunggu keputusan admin.', action: 'navPending', actionLabel: 'Tinjau Antrian' });
      (f.rec.board?.upcoming || []).slice(0, 2).forEach(r => items.push({ sev: 'warn', title: `${r.vehicleName} — ${r.categoryLabel}`, reason: r.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau Prediksi' }));

      if (!items.some(i => i.sev === 'critical' || i.sev === 'warn')) {
        items.push({ sev: 'ok', title: 'Operasi dalam kondisi sehat', reason: 'Tidak ada isu operasional yang membutuhkan tindakan segera.', action: 'navAnalyticsExecutive', actionLabel: 'Lihat Analytics' });
      }
      items.sort((a, b) => SEV_META[a.sev].rank - SEV_META[b.sev].rank);

      const cards = items.slice(0, 5).map(i => {
        const m = SEV_META[i.sev];
        return `
          <div class="wsp-prio wsp-prio--${i.sev}">
            <span class="wsp-prio__sev">${esc(m.label)}</span>
            <div class="wsp-prio__title">${esc(i.title)}</div>
            <div class="wsp-prio__reason">${esc(i.reason)}</div>
            ${actionBtn(i.actionLabel, i.action, { variant: 'ghost' })}
          </div>`;
      }).join('');
      return `<div class="wsp-prio-grid">${cards}</div>`;
    },
  },

  /* ── Decision Center ── (a lightweight operational inbox) */
  'exec-decision': {
    render(ctx) {
      const f = facts(ctx);
      const decisions = [];

      if (f.noVeh > 0) decisions.push({ tone: 'danger', priority: 'Kritis', title: 'Tetapkan Kendaraan', reason: `${f.noVeh} trip belum memiliki kendaraan.`, action: 'navPending', actionLabel: 'Tetapkan', impact: 'Ketersediaan armada' });
      if (f.pending > 0) decisions.push({ tone: 'warn', priority: 'Tinggi', title: 'Setujui Permintaan', reason: `${f.pending} permintaan menunggu persetujuan.`, action: 'navPending', actionLabel: 'Buka Antrian', impact: 'Kelancaran operasional bidang' });
      (f.rec.recs || [])
        .filter(r => r.actionable && (r.category === 'maintenance' || r.category === 'availability'))
        .slice(0, 2)
        .forEach(r => decisions.push({ tone: engineTone(r.priority.tone), priority: r.priority.label, title: `Tinjau Pemeliharaan — ${r.vehicleName}`, reason: r.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau', impact: r.estimatedImpact?.label || '—' }));

      if (!decisions.length) return empty('Tidak ada keputusan tertunda. Semua tertangani.');

      return `<div class="wsp-inbox">${decisions.slice(0, 4).map(d => `
        <div class="wsp-inbox__item">
          <div class="wsp-inbox__top">${pill(d.priority, d.tone)}<span class="wsp-inbox__impact">${esc(d.impact)}</span></div>
          <div class="wsp-inbox__title">${esc(d.title)}</div>
          <div class="wsp-inbox__reason">${esc(d.reason)}</div>
          ${actionBtn(d.actionLabel, d.action, { variant: 'ghost' })}
        </div>`).join('')}</div>`;
    },
  },

  /* ── Recommendation Center ── (reuses the certified Recommendation Engine) */
  'exec-recommendation': {
    render(ctx) {
      const rec = ctx.recommendations || { certified: false };
      if (!rec.certified) {
        return lead('Rekomendasi tersedia setelah data prediksi mencukupi.') +
          actionBtn('Buka Prediksi', 'navDriverPrediction', { variant: 'ghost' });
      }
      const items = (rec.recs || []).filter(r => r.actionable && r.category !== 'none' && r.category !== 'fleet-optimization').slice(0, 3);
      if (!items.length) {
        const msg = (rec.positive && rec.positive.messages && rec.positive.messages[0]) || 'Armada beroperasi normal.';
        return lead(msg) + actionBtn('Buka Prediksi', 'navDriverPrediction', { variant: 'ghost' });
      }
      const rows = items.map(r => `
        <div class="wsp-reco">
          <div class="wsp-reco__top">${pill(r.confidence?.levelWord || 'Keyakinan', engineTone(r.confidence?.tone))}<span class="wsp-reco__benefit">${esc(r.estimatedImpact?.label || '')}</span></div>
          <div class="wsp-reco__title">${esc(r.title)}</div>
          <div class="wsp-reco__reason">${esc(r.expectedBenefit || r.reason)}</div>
        </div>`).join('');
      return rows + actionBtn('Buka Rekomendasi', 'navDriverPrediction', { variant: 'ghost' });
    },
  },

  /* ── Simulation Center ── (a launcher; logic unchanged, lives in Prediction) */
  'exec-simulation': {
    render() {
      return `
        <div class="wsp-sim">
          ${pill('Simulasi Siap', 'info')}
          <p class="wsp-lead">Uji skenario penugasan & pemeliharaan sebelum diterapkan — tanpa menyentuh data produksi.</p>
          <ul class="wsp-sim__examples">
            <li>Menunda pemeliharaan</li>
            <li>Mengganti kendaraan</li>
            <li>Menyesuaikan utilisasi</li>
          </ul>
          ${actionBtn('Buka Skenario', 'navDriverPrediction', { variant: 'primary' })}
        </div>`;
    },
  },

  /* ── Operational Snapshot ── (Executive Summary Cards: value + status + deep link) */
  'exec-snapshot': {
    render(ctx) {
      const f = facts(ctx);
      const cards = [
        { title: 'Total Trip', value: n(f.dk.totalTrip), status: { label: '30 Hari', tone: 'neutral' }, action: 'navAnalyticsDriver' },
        { title: 'Driver Aktif', value: n(f.dk.activeDrivers), status: { label: 'Beroperasi', tone: 'good' }, action: 'navDriverOps' },
        { title: 'Kendaraan Siap', value: n(f.dk.activeVehicles), status: { label: 'Siap', tone: 'good' }, action: 'navVehicles' },
        { title: 'Pending Approval', value: f.pending, status: { label: f.pending > 0 ? 'Menunggu' : 'Bersih', tone: f.pending > 0 ? 'warn' : 'good' }, action: 'navPending' },
      ];
      return `<div class="wsp-summary-grid">${cards.map(c => `
        <button type="button" class="wsp-summary" data-wsp-action="${esc(c.action)}">
          <span class="wsp-summary__title">${esc(c.title)}</span>
          <span class="wsp-summary__value">${esc(c.value)}</span>
          <span class="wsp-summary__status wsp-summary__status--${c.status.tone}">${esc(c.status.label)}</span>
        </button>`).join('')}</div>`;
    },
  },

  /* ── Operational Activity Feed ── (unified events + activity, grouped) */
  'exec-activity': {
    render(ctx) {
      const seen = new Set();
      const logs = (ctx.logs || [])
        .filter(l => { const k = l.id || `${l.action}:${l.createdAt || l.timestamp}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => Date.parse(b.createdAt || b.timestamp || 0) - Date.parse(a.createdAt || a.timestamp || 0))
        .slice(0, 8);
      if (!logs.length) return empty('Belum ada aktivitas operasional.');

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const yest = new Date(today); yest.setDate(yest.getDate() - 1);
      const groups = { Hari_Ini: [], Kemarin: [], Sebelumnya: [] };
      for (const l of logs) {
        const t = Date.parse(l.createdAt || l.timestamp || 0);
        const key = t >= today.getTime() ? 'Hari_Ini' : t >= yest.getTime() ? 'Kemarin' : 'Sebelumnya';
        groups[key].push(l);
      }
      const LABEL = { Hari_Ini: 'Hari Ini', Kemarin: 'Kemarin', Sebelumnya: 'Sebelumnya' };
      let out = '';
      for (const key of ['Hari_Ini', 'Kemarin', 'Sebelumnya']) {
        const arr = groups[key];
        if (!arr.length) continue;
        out += `<div class="wsp-feed__group">${esc(LABEL[key])}</div>`;
        out += list(arr.map(l => {
          const mod = moduleOf(l.action);
          return listRow({
            title: eventLabel(l.action),
            meta: `${l.username || l.actorName || '—'} · ${mod.label}`,
            trailing: fmtTime(l.createdAt || l.timestamp),
            tone: 'info',
          });
        }).join(''));
      }
      return `<div class="wsp-feed">${out}</div>`;
    },
  },

  /* ── Executive Launcher ── (role-aware; horizontally scrollable on mobile) */
  'exec-quick': {
    render() {
      return chipRow([
        chip('Buat Jadwal', 'openFormModal'),
        chip('Buat Permintaan', 'openRequestFormModal'),
        chip('Generate NOR', 'navPettyCashNor'),
        chip('Manajemen Kendaraan', 'navVehicles'),
        chip('Driver Operations', 'navDriverOps'),
        chip('Analytics', 'navAnalyticsDriver'),
        chip('Petty Cash', 'navPettyCash'),
      ]);
    },
  },
};
