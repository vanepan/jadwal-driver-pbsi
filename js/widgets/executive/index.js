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

/* v1.21.1 Objective 1 — a "Tanpa Kendaraan" (empty vehicle field) assignment is
   NOT an operational problem: PBSI legitimately runs trips on kendaraan
   pengurus/atlet/eksternal/non-operasional. `dk.tripsWithoutVehicle` is
   therefore never read into any attention/priority/decision signal below —
   only real operational issues (fleet risk from certified predictions,
   engineering overdue/verification backlog, driver fatigue/burnout,
   outstanding requests, petty cash low balance) do. */

/** Trivial derived facts shared by several widgets — ONE computation per
 *  render pass so exec-hero/exec-priority/exec-attention/exec-decision never
 *  duplicate the same cross-domain reads. */
function facts(ctx) {
  const ex = ctx.models?.exec;
  const dk = ex?.driverKpis || {};
  const eng = ctx.models?.engineering || {};
  const wellness = ctx.models?.wellness || {};
  const petty = ctx.models?.pettyLowBalance || {};
  const pending = (ctx.requests || []).filter(r => r.status === 'pending').length;
  const rec = ctx.recommendations || { certified: false };
  const fleetNormal = rec.certified && rec.board ? rec.board.isHealthyFleet : true;
  const criticalVehicles = (rec.board?.critical || []).length;
  const engOverdue = numOr0((eng.overdueAssignments || {}).count);
  const pendingVerify = (eng.workerProductivity || []).reduce((a, w) => a + Math.max(0, numOr0(w.finished) - numOr0(w.verified)), 0);
  const atRiskDrivers = numOr0(wellness.summary?.burnoutRisk) + numOr0(wellness.summary?.highFatigue);
  const pettyLow = !!petty.low;
  return { ex, dk, pending, rec, fleetNormal, criticalVehicles, engOverdue, pendingVerify, atRiskDrivers, pettyLow, score: ex?.score };
}

/** Deterministic executive narrative — an Operations-Officer-style briefing
 *  built strictly from certified signals (v1.21.1 Objective 7). Only real
 *  operational issues are named; a missing vehicle field never appears. */
function narrativeFor({ score, pending, criticalVehicles, engOverdue, pettyLow }) {
  const head = !score || score.value == null ? 'Data operasional masih terbatas untuk penilaian menyeluruh'
    : score.level === 'high' ? 'Operasional hari ini berjalan sangat baik'
    : score.level === 'medium' ? 'Operasional hari ini berjalan stabil'
    : score.level === 'low' ? 'Operasional hari ini memerlukan perhatian'
    : 'Data operasional masih terbatas untuk penilaian menyeluruh';
  const issues = [];
  if (engOverdue > 0) issues.push(`${engOverdue} pekerjaan Engineering melewati target penyelesaian.`);
  if (criticalVehicles > 0) issues.push(`${criticalVehicles} kendaraan memerlukan tindakan segera.`);
  if (pending > 0) issues.push(`${pending} permintaan masih menunggu persetujuan.`);
  if (pettyLow) issues.push('Saldo petty cash berada di bawah ambang aman.');
  if (!issues.length) issues.push('Tidak ada isu operasional yang membutuhkan tindakan segera.');
  return [head + '.', ...issues].join(' ');
}

const SEV_META = {
  critical: { rank: 0, label: 'Kritis', tone: 'danger' },
  warn: { rank: 1, label: 'Perlu Perhatian', tone: 'warn' },
  ok: { rank: 2, label: 'Sehat', tone: 'good' },
};

/* module inference for the activity feed */
function moduleOf(action) {
  const a = String(action || '');
  if (a.startsWith('request')) return { label: 'Permintaan' };
  if (a.startsWith('assignment')) return { label: 'Driver Ops' };
  if (a.startsWith('vehicle')) return { label: 'Kendaraan' };
  return { label: 'Operasional' };
}

/* v1.21.1 Objective 2 — the Executive Timeline is OPERATIONAL intelligence,
   never an audit trail: authentication (login/logout), session, and other
   internal-system noise never reach it. ALLOWLISTs (not denylists) so a
   future audit action defaults to hidden until deliberately added here. */
const AUDIT_TIMELINE_ALLOW = new Set([
  'assignment_created', 'assignment_started', 'assignment_completed',
  'assignment_cancelled', 'assignment_deleted', 'assignment_overtime_overridden',
  'request_created', 'request_approved', 'request_rejected',
  'vehicle_deactivated', 'vehicle_reactivated',
]);
const ACTION_LABELS = {
  assignment_created: 'Penugasan dibuat', assignment_started: 'Penugasan dimulai',
  assignment_completed: 'Penugasan selesai', assignment_cancelled: 'Penugasan dibatalkan',
  assignment_deleted: 'Jadwal dihapus', assignment_overtime_overridden: 'Lembur terdeteksi',
  request_created: 'Permintaan dibuat', request_approved: 'Permintaan disetujui',
  request_rejected: 'Permintaan ditolak',
  vehicle_deactivated: 'Kendaraan tidak tersedia', vehicle_reactivated: 'Kendaraan tersedia kembali',
};
const eventLabel = (a) => ACTION_LABELS[a] || String(a || 'aktivitas').replace(/_/g, ' ');

/* Engineering timeline events (TIMELINE_EVENT in
   js/engineering/timeline/timeline-engine.js) — only the lifecycle
   milestones a leader briefs on; intake mechanics (notification_sent,
   worker_joined/left, paused, postponed, archived) stay in the Engineering
   module's own detailed timeline, not the Executive briefing. */
const ENG_TIMELINE_ALLOW = new Set(['published', 'started', 'finished', 'verified', 'cancelled', 'work_report_submitted']);
const ENG_EVENT_LABELS = {
  published: 'Penugasan dipublikasikan', started: 'Pekerjaan dimulai',
  finished: 'Pekerjaan selesai — menunggu verifikasi', verified: 'Pekerjaan diverifikasi',
  cancelled: 'Penugasan dibatalkan',
  // v1.21.2 — Operational Work Report ("Catat Pekerjaan"): a single completed
  // record with no verification stage of its own (see TIMELINE_EVENT.WORK_REPORT_SUBMITTED).
  work_report_submitted: 'Laporan pekerjaan diselesaikan',
};
const engEventLabel = (t) => ENG_EVENT_LABELS[t] || String(t || 'aktivitas').replace(/_/g, ' ');

/* v1.21.1 Objective 3 — Executive Timeline ranks by operational importance
   first, recency second: CRITICAL → HIGH → NORMAL → LOW, newest within
   each band. */
const TIMELINE_PRIORITY = {
  assignment_cancelled: 'critical', vehicle_deactivated: 'critical', cancelled: 'critical',
  assignment_overtime_overridden: 'high', request_rejected: 'high', finished: 'high',
  assignment_created: 'normal', assignment_started: 'normal', assignment_completed: 'normal',
  request_created: 'normal', request_approved: 'normal', vehicle_reactivated: 'normal',
  published: 'normal', started: 'normal', verified: 'normal',
  work_report_submitted: 'normal',
  assignment_deleted: 'low',
};
const TIMELINE_PRIORITY_META = {
  critical: { rank: 0, label: 'Kritis', tone: 'danger' },
  high: { rank: 1, label: 'Perlu Perhatian', tone: 'warn' },
  normal: { rank: 2, label: 'Normal', tone: 'info' },
  low: { rank: 3, label: 'Administratif', tone: 'neutral' },
};

/** Time for a timeline row — bare HH:MM for today, day-qualified otherwise,
 *  so priority-first ordering never loses temporal context. */
function fmtTimelineTime(ts) {
  const d = new Date(ts);
  const startOfDay = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
  const today = startOfDay(Date.now());
  const time = fmtTime(ts);
  const day = startOfDay(ts);
  if (day === today) return time;
  if (day === today - 86400000) return `Kemarin ${time}`;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)} ${time}`;
}

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
        f.fleetNormal ? 'Armada beroperasi normal' : `${f.criticalVehicles} kendaraan memerlukan tindakan`,
      ];

      // v1.21.0 Objective 9 — Explainability: the 5 domains behind the Health
      // Score, read straight from scoreBreakdown.components (no recomputation).
      const breakdown = (f.ex && f.ex.scoreBreakdown && f.ex.scoreBreakdown.components) || [];
      const breakdownRows = breakdown.map(c => `
        <div class="wsp-hero__bd-row">
          <span class="wsp-hero__bd-label">${esc(c.label)} <span class="wsp-hero__bd-weight">${esc(c.weightPct)}%</span></span>
          <span class="wsp-hero__bd-value">${c.score == null ? '—' : esc(c.score)}</span>
        </div>`).join('');

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
            ${breakdownRows ? `<div class="wsp-hero__breakdown">${breakdownRows}</div>` : ''}
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

      (f.rec.board?.critical || []).slice(0, 3).forEach(r => items.push({ sev: 'critical', title: `${r.vehicleName} — ${r.categoryLabel}`, reason: r.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau Prediksi' }));
      if (f.pending > 0) items.push({ sev: 'warn', title: `${f.pending} permintaan menunggu persetujuan`, reason: 'Permintaan bidang menunggu keputusan admin.', action: 'navPending', actionLabel: 'Tinjau Antrian' });
      (f.rec.board?.upcoming || []).slice(0, 2).forEach(r => items.push({ sev: 'warn', title: `${r.vehicleName} — ${r.categoryLabel}`, reason: r.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau Prediksi' }));

      if (!items.some(i => i.sev === 'critical' || i.sev === 'warn')) {
        items.push({ sev: 'ok', title: 'Tidak ada tindakan prioritas hari ini', reason: 'Operasional berjalan normal di seluruh domain yang dipantau.', action: 'navAnalyticsExecutive', actionLabel: 'Lihat Analytics' });
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

  /* ── Attention Center ── (v1.21.0 Objective 3: only actionable cross-domain
     items — critical assignments/vehicle maintenance, engineering verification
     pending + overdue, driver fatigue/burnout, outstanding requests, petty
     cash low balance. Reuses ctx.models (already computed for the Health
     Score) — introduces no new query.) */
  'exec-attention': {
    render(ctx) {
      const f = facts(ctx);
      const items = [];

      if (f.criticalVehicles > 0) items.push({ sev: 'critical', title: `${f.criticalVehicles} kendaraan perlu pemeliharaan segera`, reason: 'Prediksi armada menandai risiko kritis.', action: 'navDriverPrediction', actionLabel: 'Tinjau Armada' });
      if (f.engOverdue > 0) items.push({ sev: 'critical', title: `${f.engOverdue} pekerjaan teknisi overdue`, reason: 'Assignment teknik melewati batas waktu penyelesaian.', action: 'navEngineering', actionLabel: 'Tinjau Teknik' });
      if (f.pendingVerify > 0) items.push({ sev: 'warn', title: `${f.pendingVerify} laporan menunggu verifikasi`, reason: 'Pekerjaan teknisi selesai namun belum diverifikasi koordinator.', action: 'navEngineering', actionLabel: 'Verifikasi Laporan' });
      if (f.pending > 0) items.push({ sev: 'warn', title: `${f.pending} permintaan belum diproses`, reason: 'Permintaan bidang menunggu keputusan admin.', action: 'navPending', actionLabel: 'Tinjau Permintaan' });
      if (f.atRiskDrivers > 0) items.push({ sev: 'warn', title: `${f.atRiskDrivers} driver berisiko kelelahan/burnout`, reason: 'Beban kerja driver melewati ambang aman dalam periode berjalan.', action: 'navAnalyticsDriver', actionLabel: 'Tinjau Wellness' });
      if (f.pettyLow) items.push({ sev: 'critical', title: 'Saldo petty cash rendah', reason: 'Saldo siklus berjalan berada di bawah ambang notifikasi.', action: 'navPettyCash', actionLabel: 'Tinjau Petty Cash' });

      if (!items.length) return empty('Tidak ada isu yang membutuhkan perhatian saat ini — seluruh domain operasional dalam kondisi aman.');
      items.sort((a, b) => SEV_META[a.sev].rank - SEV_META[b.sev].rank);

      const cards = items.map(i => {
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
      // v1.21.0 — Engineering/Request recs are deterministic and never gated on
      // Fleet prediction certification, so only show the "waiting on prediction"
      // fallback when there is truly nothing (no operational recs either).
      if (!rec.certified && !(rec.recs && rec.recs.length)) {
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

  /* ── Operational Snapshot ── (v1.21.0 Objective 6: Today / This Week / This
     Month — period-filtered slices of data already loaded in ctx, no new
     query. Rolling windows (not calendar-aligned), matching the existing
     "30 Hari" convention used elsewhere in the Executive model. Operational
     Hours is intentionally omitted: no existing source can be re-windowed to
     Today/Week without a new engine, which is out of scope here.) */
  'exec-snapshot': {
    render(ctx) {
      const f = facts(ctx);
      const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const now = new Date();
      const todayYmd = localYmd(now);
      const sinceYmd = (days) => { const d = new Date(now); d.setDate(d.getDate() - (days - 1)); return localYmd(d); };
      const sinceMs = (days) => { const d = new Date(now); d.setDate(d.getDate() - (days - 1)); d.setHours(0, 0, 0, 0); return d.getTime(); };

      const assignments = ctx.assignments || [];
      const requests = ctx.requests || [];
      const engEvents = ctx.engineeringEvents || [];

      function periodCard(label, fromYmd, fromMs) {
        const asg = assignments.filter(a => a.date && a.date >= fromYmd && a.date <= todayYmd);
        const completed = asg.filter(a => a.status === 'completed').length;
        const vehiclesUsed = new Set(asg.map(a => (a.vehicle || '').trim()).filter(Boolean)).size;
        const engReports = engEvents.filter(e => e.type === 'finished' && Date.parse(e.timestamp || 0) >= fromMs).length;
        const reqResolved = requests.filter(r => r.createdAt && Date.parse(r.createdAt) >= fromMs && r.status !== 'pending').length;
        return { label, tiles: [
          { title: 'Trip Dijalankan', value: asg.length },
          { title: 'Penugasan Selesai', value: completed },
          { title: 'Kendaraan Terpakai', value: vehiclesUsed },
          { title: 'Laporan Teknik Selesai', value: engReports },
          { title: 'Permintaan Diproses', value: reqResolved },
        ] };
      }

      const periods = [
        periodCard('Hari Ini', todayYmd, sinceMs(1)),
        periodCard('Minggu Ini', sinceYmd(7), sinceMs(7)),
        periodCard('Bulan Ini', sinceYmd(30), sinceMs(30)),
      ];

      return periods.map(p => `
        <div class="wsp-snapshot-period">
          <div class="wsp-snapshot-period__label">${esc(p.label)}</div>
          <div class="wsp-summary-grid">${p.tiles.map(t => `
            <div class="wsp-summary wsp-summary--static">
              <span class="wsp-summary__title">${esc(t.title)}</span>
              <span class="wsp-summary__value">${esc(t.value)}</span>
            </div>`).join('')}</div>
        </div>`).join('') + `
        <div class="wsp-summary-grid">
          <button type="button" class="wsp-summary" data-wsp-action="navPending">
            <span class="wsp-summary__title">Pending Approval</span>
            <span class="wsp-summary__value">${esc(f.pending)}</span>
            <span class="wsp-summary__status wsp-summary__status--${f.pending > 0 ? 'warn' : 'good'}">${f.pending > 0 ? 'Menunggu' : 'Bersih'}</span>
          </button>
        </div>`;
    },
  },

  /* ── Operational Activity Feed ── (v1.21.0: unified Timeline — merges the
     audit-log feed with Engineering's own structured per-assignment timeline
     events, chronologically interleaved. Reuses TIMELINE_EVENT records
     app.js already flattens into ctx.engineeringEvents — no new query.) */
  'exec-activity': {
    render(ctx) {
      const seen = new Set();
      const auditItems = (ctx.logs || [])
        .filter(l => AUDIT_TIMELINE_ALLOW.has(l.action))
        .map(l => ({
          key: l.id || `log:${l.action}:${l.createdAt || l.timestamp}`,
          ts: Date.parse(l.createdAt || l.timestamp || 0),
          title: eventLabel(l.action),
          meta: `${l.username || l.actorName || '—'} · ${moduleOf(l.action).label}`,
          priority: TIMELINE_PRIORITY[l.action] || 'normal',
        }));
      const engItems = (ctx.engineeringEvents || [])
        .filter(e => ENG_TIMELINE_ALLOW.has(e.type))
        .map(e => ({
          key: e.id || `eng:${e.type}:${e.timestamp}`,
          ts: Date.parse(e.timestamp || 0),
          title: engEventLabel(e.type),
          meta: `${(e.actor && e.actor.name) || '—'} · Teknik${e.assignmentTitle ? ' · ' + e.assignmentTitle : ''}`,
          priority: TIMELINE_PRIORITY[e.type] || 'normal',
        }));
      const merged = [...auditItems, ...engItems]
        .filter(it => { if (seen.has(it.key)) return false; seen.add(it.key); return true; })
        .filter(it => Number.isFinite(it.ts))
        .sort((a, b) => {
          const byPriority = TIMELINE_PRIORITY_META[a.priority].rank - TIMELINE_PRIORITY_META[b.priority].rank;
          return byPriority !== 0 ? byPriority : b.ts - a.ts;
        })
        .slice(0, 8);
      if (!merged.length) return empty('Belum ada aktivitas operasional penting hari ini.');

      const groups = { critical: [], high: [], normal: [], low: [] };
      for (const it of merged) groups[it.priority].push(it);

      let out = '';
      for (const key of ['critical', 'high', 'normal', 'low']) {
        const arr = groups[key];
        if (!arr.length) continue;
        const meta = TIMELINE_PRIORITY_META[key];
        out += `<div class="wsp-feed__group">${esc(meta.label)}</div>`;
        out += list(arr.map(it => listRow({
          title: it.title, meta: it.meta, trailing: fmtTimelineTime(it.ts), tone: meta.tone,
        })).join(''));
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
