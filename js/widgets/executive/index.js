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

import { esc, empty, lead, pill, actionBtn, chip, chipRow } from '../_widget-base.js';
// v1.22.1 Objective 9 — Analytics Driver (analytics-shell.js) is the Executive
// design authority; reuse its exact ring-gauge SVG builder rather than drawing
// a second one. Pure presentation, no engine/business-logic coupling.
import { renderRingGauge, anIcon } from '../../analytics/analytics-shell.js';
// v1.22.4 Executive Narrative Intelligence — Situation/Impact/Recommendation
// composition, extracted so the Hero's own render() stays presentation-only.
import { buildHeroNarrative } from './narrative-builder.js';
// Phase 0 Executive Foundation — presentation primitives + tone adapters
// extracted out of this file (previously private, now shared/reusable).
// Pure move: same markup, same CSS classes, zero visual change.
import { rankedList, compactSuccessLine, severityRank, toneFromLevel, toneFromEngine as engineTone } from './ui-kit.js';
// Phase 1 (Hero) — Motion Profiles defined in Phase 0, first consumed here.
// Macro Motion (page-level section reveal) is unaffected by this import —
// it stays owned by workspace-renderer.js's existing fade-up class.
import { resolveMotionProfile, REALTIME_TWEEN, cssEaseToFn, MOTION_PROFILES } from './motion-profiles.js';
// v1.23.0 hotfix — the assignment-level "pending engineering verification"
// computation moved to a shared module so Attention and Recommendation can
// no longer compute two different counts for the same fact (see that
// module's own header for why).
import { unverifiedEngineeringAssignments } from '../../recommendation/engineering-verification.js';
// v1.23.0 hotfix — the engineering-overdue critical/high decision is now
// made in exactly one place, shared with Hero (narrative-builder.js), so
// Attention can no longer classify the same engOverdue count differently.
import { classifyEngineeringOverdue } from '../../recommendation/engineering-overdue.js';

/* ── deterministic view helpers ── */
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
/** Phase 5 — a block's time meta: a single stamp when it started and ended
 *  in the same minute, otherwise the span. */
function fmtStoryRange(tsStart, tsEnd) {
  const a = fmtTime(tsStart), b = fmtTime(tsEnd);
  return a === b ? a : `${a}–${b}`;
}

/* v1.21.1 Objective 1 — a "Tanpa Kendaraan" (empty vehicle field) assignment is
   NOT an operational problem: PBSI legitimately runs trips on kendaraan
   pengurus/atlet/eksternal/non-operasional. `dk.tripsWithoutVehicle` is
   therefore never read into any attention/priority/decision signal below —
   only real operational issues (fleet risk from certified predictions,
   engineering overdue/verification backlog, driver fatigue/burnout,
   outstanding requests, petty cash low balance) do. */

/** Local day-key helpers (rolling, matches the existing exec-snapshot convention). */
function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const DAY_MS = 86400000;

/** v1.22.0 Objective 2 — the single pending request most worth naming in a
 *  briefing: the oldest one still waiting. Named via purpose/destination so
 *  the Decision card can say "Setujui Permintaan — Transport Pelatnas"
 *  instead of a generic count. */
function topPendingRequest(ctx) {
  const pending = (ctx.requests || []).filter(r => r.status === 'pending');
  if (!pending.length) return null;
  return pending.slice().sort((a, b) => (Date.parse(a.createdAt || 0) || 0) - (Date.parse(b.createdAt || 0) || 0))[0];
}

/** Trivial derived facts shared by several widgets — ONE computation per
 *  render pass so exec-hero/exec-attention never duplicate the same
 *  cross-domain reads. */
function facts(ctx) {
  const ex = ctx.models?.exec;
  const dk = ex?.driverKpis || {};
  const eng = ctx.models?.engineering || {};
  const wellness = ctx.models?.wellness || {};
  const petty = ctx.models?.pettyLowBalance || {};
  const pending = (ctx.requests || []).filter(r => r.status === 'pending').length;
  const rec = ctx.recommendations || { certified: false };
  const criticalVehicles = (rec.board?.critical || []).length;
  const engOverdue = numOr0((eng.overdueAssignments || {}).count);
  const engUnverifiedList = unverifiedEngineeringAssignments(ctx.engineeringEvents);
  const pendingVerify = engUnverifiedList.length;
  const atRiskDrivers = numOr0(wellness.summary?.burnoutRisk) + numOr0(wellness.summary?.highFatigue);
  const pettyLow = !!petty.low;
  return {
    ex, dk, pending, rec, criticalVehicles, engOverdue,
    engUnverifiedList, pendingVerify, atRiskDrivers, pettyLow,
    topPendingRequest: topPendingRequest(ctx), score: ex?.score,
  };
}

/** Reduced-motion contract, unchanged since v1.22.1: data-anim="off" or the
 *  OS preference disables animation and snaps straight to final values. */
function motionOff() {
  if (typeof document === 'undefined') return true;
  if (document.documentElement.getAttribute('data-anim') === 'off') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/** Phase 1 (Hero) — mood-aware entrance + continuity-safe score/ring tween.
 *  Replaces the old flat 900ms animateHeroMotion(). Two concerns, kept
 *  distinct per the approved Conflict Resolution:
 *
 *  1) Micro Motion (entrance choreography) — every `.wsp-hero-anim` element
 *     already carries its correct per-mood duration/easing/delay as inline
 *     CSS custom properties, baked in by render() itself. This function's
 *     only job for them is to suppress replay: `root.dataset.heroMounted`
 *     persists on the Hero's body element across a live refresh (the DOM
 *     node itself is NOT recreated on refresh — only its innerHTML is), so
 *     "already mounted" is reliably known, and the entrance is hard-disabled
 *     (inline `animation:none`, set synchronously before first paint) on
 *     every mount after the first. The Hero's entrance never replays.
 *
 *  2) Score/ring value — on first mount, tweens 0 → target using the mood's
 *     first-paint profile (ring via a per-instance CSS transition override;
 *     .an-ring-val's shared 900ms rule in platform.css is DO-NOT-TOUCH, so
 *     this overrides duration/easing inline on this one instance only,
 *     touching nothing shared). On a refresh, tweens the LAST shown value →
 *     the new one using REALTIME_TWEEN (one fixed continuity timing, not
 *     mood-dependent, per Motion Language §07) — driven entirely in JS
 *     since the DOM node is fresh and has no "old" CSS state to transition
 *     from. Either way it never resets to zero on a refresh. */
function mountHeroMotion(root, ctx) {
  if (!root) return;
  const f = facts(ctx);
  const { headline } = buildHeroNarrative(f);
  const profile = resolveMotionProfile(headline.tone);
  const reduce = motionOff();
  const alreadyMounted = root.dataset.heroMounted === '1';
  root.dataset.heroMounted = '1';

  // Hardening (RC) — `root` (the Hero's body element) is NOT recreated on a
  // live refresh, only its innerHTML is (see this function's own doc above).
  // Without a generation guard, a rAF tick loop started by an EARLIER mount
  // keeps calling itself (nothing here previously stopped it) and keeps
  // writing to scoreEl/ringEl references that are now DETACHED nodes once a
  // newer refresh replaces the innerHTML — wasted work that compounds under
  // back-to-back Firebase updates (each refresh spawns its own loop). Every
  // mount now invalidates any loop from a prior mount before starting its own.
  const gen = (root.__heroAnimGen = (root.__heroAnimGen || 0) + 1);
  const stale = () => root.__heroAnimGen !== gen;

  // Micro Motion: suppress replay synchronously, before the browser paints.
  root.querySelectorAll('.wsp-hero-anim').forEach((el) => {
    if (reduce || alreadyMounted) el.style.animation = 'none';
  });

  const hasScore = !!(f.score && f.score.value != null);
  const targetScore = hasScore ? f.score.value : 0;
  const lastScoreRaw = Number(root.dataset.heroLastScore);
  const fromScore = alreadyMounted && Number.isFinite(lastScoreRaw) ? lastScoreRaw : 0;
  root.dataset.heroLastScore = String(targetScore);

  const scoreEl = root.querySelector('[data-countup]');
  const ringEl = root.querySelector('.an-ring-val[data-ring-len]');
  const circ = ringEl ? parseFloat(ringEl.getAttribute('data-ring-circ')) : null;
  const targetLen = ringEl ? parseFloat(ringEl.getAttribute('data-ring-len')) : null;
  const fromLen = alreadyMounted && circ != null ? (fromScore / 100) * circ : 0;

  if (reduce) {
    if (scoreEl) scoreEl.textContent = String(Math.round(targetScore));
    if (ringEl && circ != null) ringEl.setAttribute('stroke-dasharray', `${targetLen} ${circ}`);
    return;
  }

  const tween = alreadyMounted ? REALTIME_TWEEN : { duration: profile.ringDuration, ease: profile.ease };
  const ease = cssEaseToFn(tween.ease);
  const t0 = performance.now();

  if (ringEl && circ != null) {
    if (!alreadyMounted) {
      // First mount: the shared CSS transition draws 0 -> target; only its
      // duration/easing are overridden per-instance for this mood.
      ringEl.style.transitionDuration = `${tween.duration}ms`;
      ringEl.style.transitionTimingFunction = tween.ease;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ringEl.setAttribute('stroke-dasharray', `${targetLen} ${circ}`);
      }));
    } else {
      // Refresh: this DOM node is freshly built, so there is no "old" state
      // for a CSS transition to ease from — interpolate it in JS instead,
      // from the previously-displayed value, so it still eases directly to
      // the new sweep and never resets to zero.
      ringEl.style.transition = 'none';
      const tick = (now) => {
        if (stale()) return;
        const p = Math.min(1, (now - t0) / tween.duration);
        const len = fromLen + (targetLen - fromLen) * ease(p);
        ringEl.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${circ}`);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  if (scoreEl) {
    const tick = (now) => {
      if (stale()) return;
      const p = Math.min(1, (now - t0) / tween.duration);
      const v = fromScore + (targetScore - fromScore) * ease(p);
      scoreEl.textContent = String(Math.round(v));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/* v1.22.1 Objectives 6/7 — Priority/Attention as a de-boxed severity list
   (Apple-style "things requiring attention"), not a wall of bordered cards.
   rankedList/compactSuccessLine/severityRank now live in ui-kit.js (Phase 0
   Executive Foundation) — same output, reusable across sections. */

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

/** v1.22.3 Objective 5 — actor at the top level of every log entry
 *  (js/logs.js logAction), independent of the event's own metadata. */
const actorName = (l) => l.displayName || l.username || 'Admin';
/** v1.22.3 Objective 5 — request_* log entries carry requesterId, not a name;
 *  ctx.requests (already in every widget's ctx) has requesterName for that
 *  id, so this is a presentation-layer join, not a new query. */
function requesterNameFor(l, ctx) {
  const req = (ctx.requests || []).find(r => r.id === l.targetId);
  return (req && req.requesterName) || 'Bidang';
}

/** v1.22.3 Objectives 5/7/8 — Today's Story per-action metadata: icon (reused
 *  from analytics-shell.js's anIcon(), zero new SVG), accent tone (category
 *  color — negative outcomes are always "danger", overriding their base
 *  category), a one-sentence builder using the REAL fields each log entry
 *  already carries (never fabricated), and an aggregate phrase for grouped
 *  runs of the same action (v1.22.3 Objective 4). */
const AUDIT_STORY_META = {
  assignment_created: {
    icon: 'car', tone: 'good',
    sentence: (l) => `${actorName(l)} membuat penugasan baru${l.metadata?.destination ? ` menuju ${l.metadata.destination}` : ''}.`,
    aggregate: (n) => `${n} penugasan baru dibuat.`,
  },
  assignment_started: {
    icon: 'car', tone: 'good',
    sentence: (l) => `Driver ${actorName(l)} memulai perjalanan${l.metadata?.destination ? ` menuju ${l.metadata.destination}` : ''}.`,
    aggregate: (n) => `${n} perjalanan driver dimulai.`,
  },
  assignment_completed: {
    icon: 'car', tone: 'good',
    sentence: (l) => `${l.metadata?.driver || actorName(l)} menyelesaikan perjalanan${l.metadata?.destination ? ` ke ${l.metadata.destination}` : ''}.`,
    aggregate: (n) => `${n} penugasan selesai.`,
  },
  assignment_cancelled: {
    icon: 'car', tone: 'danger',
    sentence: (l) => `Penugasan ${l.metadata?.driver ? `${l.metadata.driver} ` : ''}dibatalkan${l.metadata?.destination ? ` (${l.metadata.destination})` : ''}.`,
    aggregate: (n) => `${n} penugasan dibatalkan.`,
  },
  assignment_deleted: {
    icon: 'car', tone: 'danger',
    sentence: (l) => `${actorName(l)} menghapus jadwal penugasan.`,
    aggregate: (n) => `${n} jadwal penugasan dihapus.`,
  },
  assignment_overtime_overridden: {
    icon: 'car', tone: 'warn',
    sentence: (l) => `Lembur terdeteksi pada penugasan${l.metadata?.driver ? ` ${l.metadata.driver}` : ''}.`,
    aggregate: (n) => `${n} lembur terdeteksi.`,
  },
  request_created: {
    icon: 'inbox', tone: 'neutral',
    sentence: (l, ctx) => `Permintaan ${requesterNameFor(l, ctx)} diajukan.`,
    aggregate: (n) => `${n} permintaan baru diajukan.`,
  },
  request_approved: {
    icon: 'check', tone: 'warn',
    sentence: (l, ctx) => `Permintaan ${requesterNameFor(l, ctx)} disetujui.`,
    aggregate: (n) => `${n} permintaan disetujui.`,
  },
  request_rejected: {
    icon: 'check', tone: 'danger',
    sentence: (l, ctx) => `Permintaan ${requesterNameFor(l, ctx)} ditolak.`,
    aggregate: (n) => `${n} permintaan ditolak.`,
  },
  vehicle_deactivated: {
    icon: 'vehicle', tone: 'danger',
    sentence: (l) => `${actorName(l)} menonaktifkan kendaraan.`,
    aggregate: (n) => `${n} kendaraan dinonaktifkan.`,
  },
  vehicle_reactivated: {
    icon: 'vehicle', tone: 'good',
    sentence: (l) => `${actorName(l)} mengaktifkan kembali kendaraan.`,
    aggregate: (n) => `${n} kendaraan diaktifkan kembali.`,
  },
};

/* Engineering timeline events (TIMELINE_EVENT in
   js/engineering/timeline/timeline-engine.js) — only the lifecycle
   milestones a leader briefs on; intake mechanics (notification_sent,
   worker_joined/left, paused, postponed, archived) stay in the Engineering
   module's own detailed timeline, not the Executive briefing. */
const ENG_TIMELINE_ALLOW = new Set(['published', 'started', 'finished', 'verified', 'cancelled', 'work_report_submitted']);

/** v1.22.2 Objective 7 (wording refined v1.22.3) — one flowing sentence
 *  naming the object (assignment/report title) woven into the verb, instead
 *  of a title line plus a separate "actor · module · object" meta line. */
const ENG_STORY_META = {
  published: { icon: 'maintenance', tone: 'info', sentence: (t) => `Penugasan ${t} dipublikasikan.`, aggregate: (n) => `${n} penugasan teknik dipublikasikan.` },
  started: { icon: 'maintenance', tone: 'info', sentence: (t) => `Pekerjaan ${t} dimulai.`, aggregate: (n) => `${n} pekerjaan Teknik dimulai.` },
  finished: { icon: 'maintenance', tone: 'info', sentence: (t) => `Pekerjaan ${t} selesai dikerjakan.`, aggregate: (n) => `${n} pekerjaan Teknik selesai.` },
  verified: { icon: 'maintenance', tone: 'info', sentence: (t) => `Pekerjaan ${t} diverifikasi.`, aggregate: (n) => `${n} pekerjaan Teknik diverifikasi.` },
  cancelled: { icon: 'maintenance', tone: 'danger', sentence: (t) => `Penugasan ${t} dibatalkan.`, aggregate: (n) => `${n} penugasan teknik dibatalkan.` },
  // v1.21.2 — Operational Work Report ("Catat Pekerjaan"): a single completed
  // record with no verification stage of its own (see TIMELINE_EVENT.WORK_REPORT_SUBMITTED).
  work_report_submitted: { icon: 'file', tone: 'info', sentence: (t) => `Laporan pekerjaan ${t} diselesaikan.`, aggregate: (n) => `${n} laporan pekerjaan diselesaikan.` },
};
function engEventSentence(type, title) {
  const meta = ENG_STORY_META[type];
  if (meta && title) return meta.sentence(title);
  return String(type || 'aktivitas').replace(/_/g, ' ') + (title ? ` — ${title}` : '');
}

/** v1.22.3 Objective 4 — collapse RUNS of 2+ consecutive items sharing the
 *  same fine-grained event key into one aggregate summary ("4 penugasan baru
 *  dibuat"), so a busy day never reads as repeated spam. Adjacency-based (not
 *  a fixed time window) — the input is already sorted chronologically, so a
 *  run is just consecutive same-key items; the summary keeps the run's LAST
 *  (most recent) timestamp, so the array stays sorted with no re-sort. */
function groupStoryItems(items) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j + 1 < items.length && items[j + 1].groupKey === items[i].groupKey) j++;
    const run = items.slice(i, j + 1);
    if (run.length >= 2) {
      const last = run[run.length - 1];
      out.push({
        key: `group:${last.groupKey}:${last.ts}`,
        ts: last.ts, icon: last.icon, tone: last.tone, meta: '',
        sentence: (last.aggregate ? last.aggregate(run.length) : `${run.length} ${last.groupKey.replace(/_/g, ' ')}.`),
      });
    } else {
      out.push(run[0]);
    }
    i = j + 1;
  }
  return out;
}

/** Phase 5 (Executive Operational Story) — the operational CONTEXT each event
 *  belongs to, for narrative grouping ("Driver Operations", "Engineering",
 *  "Kendaraan", "Permintaan"). "Petty Cash" is defined per the Design Review's
 *  own category list but currently has no logAction() call sites feeding the
 *  timeline (grep-verified) — it stays reserved, never fabricated. */
const STORY_DOMAINS = {
  driverOps: { label: 'Operasional Driver', icon: 'car' },
  request: { label: 'Permintaan', icon: 'inbox' },
  vehicle: { label: 'Kendaraan', icon: 'vehicle' },
  engineering: { label: 'Teknik', icon: 'maintenance' },
  pettyCash: { label: 'Petty Cash', icon: 'pettycash' },
};
function storyDomainKey(source, groupKey) {
  if (source === 'eng') return 'engineering';
  if (groupKey.startsWith('assignment_')) return 'driverOps';
  if (groupKey.startsWith('request_')) return 'request';
  if (groupKey.startsWith('vehicle_')) return 'vehicle';
  return 'driverOps';
}
const STORY_TONE_RANK = { good: 0, neutral: 1, info: 2, warn: 3, danger: 4 };

/** Phase 5 — group consecutive events sharing the same operational CONTEXT
 *  (domain) into one narrative "block" ("Each group should tell a small
 *  story"), reusing groupStoryItems() for the fine-grained same-action
 *  aggregation WITHIN the run — no new event data, no synthetic summaries.
 *  A block whose run collapses to exactly one line (an isolated event, or a
 *  run that's already one repeated action) renders identically to the old
 *  flat feed row — the domain header only appears once a run genuinely mixes
 *  2+ distinct actions within the same context, which is the actual "small
 *  story" case ("3 penugasan dibuat, 1 dibatalkan"). Adjacency-based, same
 *  reasoning as groupStoryItems: the input is already chronological. */
function buildStoryBlocks(items) {
  const blocks = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j + 1 < items.length && items[j + 1].domainKey === items[i].domainKey) j++;
    const run = items.slice(i, j + 1);
    const lines = groupStoryItems(run);
    const domain = STORY_DOMAINS[run[0].domainKey];
    const tone = lines.reduce((acc, l) => (STORY_TONE_RANK[l.tone] > STORY_TONE_RANK[acc] ? l.tone : acc), lines[0].tone);
    blocks.push({
      key: `block:${run[0].key}`,
      domainKey: run[0].domainKey,
      domainLabel: domain.label,
      domainIcon: domain.icon,
      tone,
      tsStart: run[0].ts,
      tsEnd: run[run.length - 1].ts,
      count: run.length,
      lines,
    });
    i = j + 1;
  }
  return blocks;
}

/** v1.22.0 Objective 5 — Health Score Explainability: one deterministic +/−
 *  line per domain, reusing the SAME issue flags facts()/narrativeFor()
 *  already compute (no new signal, no recomputation). A domain with a null
 *  score (no data) is skipped rather than given an invented verdict. */
const EXPLAIN_RULES = {
  driverOps: (f) => f.atRiskDrivers > 0 ? `${f.atRiskDrivers} driver berisiko kelelahan/burnout` : 'Beban kerja driver sehat',
  engineering: (f) => f.engOverdue > 0 ? `${f.engOverdue} pekerjaan Teknik melewati batas waktu` : 'Teknik stabil',
  vehicleUtil: (f) => f.criticalVehicles > 0 ? `${f.criticalVehicles} kendaraan perlu perhatian` : 'Armada beroperasi normal',
  request: (f) => f.pending > 0 ? `${f.pending} permintaan menunggu persetujuan` : 'Tidak ada permintaan tertunda',
  pettyCash: (f) => f.pettyLow ? 'Saldo petty cash rendah' : 'Petty cash dalam batas aman',
};
const EXPLAIN_ISSUE = {
  driverOps: (f) => f.atRiskDrivers > 0,
  engineering: (f) => f.engOverdue > 0,
  vehicleUtil: (f) => f.criticalVehicles > 0,
  request: (f) => f.pending > 0,
  pettyCash: (f) => f.pettyLow,
};
function explainRows(f, breakdown) {
  return breakdown
    .filter(c => c.score != null && EXPLAIN_RULES[c.key])
    .map(c => ({ good: !EXPLAIN_ISSUE[c.key](f), text: EXPLAIN_RULES[c.key](f) }));
}

/** v1.22.0 Objective 4 — Executive Insight: day-over-day comparisons built
 *  strictly from data already in ctx (ctx.engineeringEvents/ctx.requests/
 *  ctx.assignments) — no new engine, no new query. Every comparison is
 *  guarded: a zero yesterday-denominator or an unmatched started→finished
 *  pair means the line is OMITTED rather than a fabricated percentage (same
 *  "No Data ≠ 0" rule the Health Score already follows). */
function buildInsight(ctx) {
  const todayStart = startOfDay(0);
  const yestStart = startOfDay(1);
  const inRange = (ts, from, to) => ts >= from && ts < to;
  const lines = [];

  const finishedTs = (ctx.engineeringEvents || [])
    .filter(e => e.type === 'finished')
    .map(e => Date.parse(e.timestamp || 0))
    .filter(Number.isFinite);
  const engToday = finishedTs.filter(t => inRange(t, todayStart, todayStart + DAY_MS)).length;
  const engYesterday = finishedTs.filter(t => inRange(t, yestStart, todayStart)).length;
  if (engYesterday > 0) {
    const pct = Math.round(((engToday - engYesterday) / engYesterday) * 100);
    if (pct > 0) lines.push(`Teknik meningkat ${pct}% dibanding kemarin.`);
    else if (pct < 0) lines.push(`Teknik menurun ${Math.abs(pct)}% dibanding kemarin.`);
    else lines.push('Teknik stabil dibanding kemarin.');
  } else if (engToday > 0) {
    lines.push(`${engToday} pekerjaan Teknik selesai hari ini.`);
  }

  const reqTs = (ctx.requests || [])
    .map(r => Date.parse(r.createdAt || 0))
    .filter(Number.isFinite);
  const reqToday = reqTs.filter(t => inRange(t, todayStart, todayStart + DAY_MS)).length;
  const reqYesterday = reqTs.filter(t => inRange(t, yestStart, todayStart)).length;
  if (reqYesterday > 0) {
    const pct = Math.round(((reqToday - reqYesterday) / reqYesterday) * 100);
    if (pct > 0) lines.push(`Permintaan naik ${pct}% dibanding kemarin.`);
    else if (pct < 0) lines.push(`Permintaan turun ${Math.abs(pct)}% dibanding kemarin.`);
    else lines.push('Permintaan stabil dibanding kemarin.');
  }

  const byAssignment = new Map();
  for (const e of ctx.engineeringEvents || []) {
    const id = e.assignmentId;
    if (id == null) continue;
    const ts = Date.parse(e.timestamp || 0);
    if (!Number.isFinite(ts)) continue;
    if (!byAssignment.has(id)) byAssignment.set(id, {});
    const rec = byAssignment.get(id);
    if (e.type === 'started') rec.started = ts;
    if (e.type === 'finished') rec.finished = ts;
  }
  const durations = [...byAssignment.values()]
    .filter(r => r.started != null && r.finished != null && r.finished > r.started)
    .map(r => ({ finished: r.finished, mins: (r.finished - r.started) / 60000 }));
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const durToday = avg(durations.filter(d => inRange(d.finished, todayStart, todayStart + DAY_MS)).map(d => d.mins));
  const durYesterday = avg(durations.filter(d => inRange(d.finished, yestStart, todayStart)).map(d => d.mins));
  if (durToday != null && durYesterday != null) {
    const diff = Math.round(durYesterday - durToday);
    if (diff > 0) lines.push(`Rata-rata penyelesaian Teknik lebih cepat ${diff} menit dibanding kemarin.`);
    else if (diff < 0) lines.push(`Rata-rata penyelesaian Teknik lebih lambat ${Math.abs(diff)} menit dibanding kemarin.`);
  }

  const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayYmd = localYmd(new Date());
  const yestYmd = localYmd(new Date(yestStart));
  const activeDrivers = numOr0(ctx.models?.exec?.driverKpis?.activeDrivers);
  const assignments = ctx.assignments || [];
  const tripsToday = assignments.filter(a => a.date === todayYmd).length;
  const tripsYesterday = assignments.filter(a => a.date === yestYmd).length;
  if (activeDrivers > 0 && tripsYesterday > 0) {
    const pct = Math.round(((tripsToday - tripsYesterday) / tripsYesterday) * 100);
    lines.push(Math.abs(pct) <= 10 ? 'Beban kerja driver tetap stabil dibanding kemarin.' : `Beban kerja driver ${pct > 0 ? 'naik' : 'turun'} ${Math.abs(pct)}% dibanding kemarin.`);
  }

  return lines;
}

/** v1.22.2 Objective 8 — Executive Insight, Apple-Health style: exactly ONE
 *  sentence, not a bulleted list. buildInsight() still computes every guarded
 *  comparison (engineering/request/duration/driver-workload); this just picks
 *  the single most decision-relevant one, in a fixed priority order. */
function topInsightLine(ctx) {
  const lines = buildInsight(ctx);
  return lines[0] || null;
}

/** Phase 2 (Executive Attention) — findings always visible before disclosure.
 *  Matches the approved Design Review prototype's own `attentionShowCount`. */
const ATTENTION_VISIBLE_CAP = 2;

/** Phase 3 (Executive Decision Center) — recommended actions always visible
 *  before disclosure: one dominant (primary) action plus two supporting
 *  (secondary) ones, matching the prior hard cap of 3 exactly so a fleet with
 *  ≤3 actionable recommendations renders identically to before this phase —
 *  the only new behavior is disclosure appearing once there is more. */
const RECOMMENDATION_VISIBLE_CAP = 3;

/** Phase 4 (Operational Snapshot) — crossfades the active period panel in
 *  place instead of recreating the section, per Motion Language's "content
 *  morphs, the section is never recreated". All three panels render the
 *  identical 5-tile grid shape and share one grid cell
 *  (.wsp-snapshot__panels), so switching never shifts layout — only opacity
 *  animates (GPU-friendly), and reduced motion / animate=false drops
 *  straight to the end state. Selection is persisted on bodyEl's dataset
 *  (the body node survives a data refresh — only its innerHTML is replaced,
 *  same continuity contract mountHeroMotion relies on) so a realtime update
 *  never resets the admin's chosen period back to "Hari". */
function applySnapshotPeriod(bodyEl, period, animate) {
  const buttons = bodyEl.querySelectorAll('[data-wsp-seg]');
  const panels = bodyEl.querySelectorAll('[data-snapshot-panel]');
  const nextPanel = bodyEl.querySelector(`[data-snapshot-panel="${period}"]`);
  if (!nextPanel) return;
  if (bodyEl.dataset.wspActivePeriod === period && !nextPanel.hidden) return;
  const activePanel = Array.from(panels).find(p => !p.hidden && p !== nextPanel);

  buttons.forEach(b => {
    const on = b.dataset.wspSeg === period;
    b.classList.toggle('wsp-segmented__btn--active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  bodyEl.dataset.wspActivePeriod = period;

  if (bodyEl.__wspSnapshotTimer) { clearTimeout(bodyEl.__wspSnapshotTimer); bodyEl.__wspSnapshotTimer = null; }

  if (!animate || motionOff()) {
    panels.forEach(p => { p.hidden = p !== nextPanel; p.style.opacity = ''; });
    return;
  }

  nextPanel.hidden = false;
  nextPanel.style.opacity = '0';
  if (activePanel) activePanel.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => { nextPanel.style.opacity = '1'; }));
  bodyEl.__wspSnapshotTimer = window.setTimeout(() => {
    panels.forEach(p => {
      if (p === nextPanel) { p.style.opacity = ''; return; }
      p.hidden = true;
      p.style.opacity = '';
    });
    bodyEl.__wspSnapshotTimer = null;
  }, 220);
}

/** Native tablist keyboard pattern (Left/Right/Home/End move focus AND
 *  activate — a segmented control, not a deferred-activation tab strip). */
function wireSnapshotSegmented(bodyEl) {
  const list = bodyEl.querySelector('[data-wsp-segmented]');
  if (!list) return;
  const buttons = Array.from(list.querySelectorAll('[data-wsp-seg]'));
  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => applySnapshotPeriod(bodyEl, btn.dataset.wspSeg, true));
    btn.addEventListener('keydown', (e) => {
      let idx = null;
      if (e.key === 'ArrowRight') idx = (i + 1) % buttons.length;
      else if (e.key === 'ArrowLeft') idx = (i - 1 + buttons.length) % buttons.length;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = buttons.length - 1;
      if (idx == null) return;
      e.preventDefault();
      buttons[idx].focus();
      applySnapshotPeriod(bodyEl, buttons[idx].dataset.wspSeg, true);
    });
  });
}

/** Executive Launcher — the fixed destination catalogue (Phase 6). Order is
 *  the approved, frozen sequence (Design Review LAUNCHER data) and NEVER
 *  varies by health/attention/recommendation state — this is the one section
 *  of the briefing an executive should be able to find by muscle memory.
 *  `visibleFor` is the ONLY axis allowed to vary: a destination is hidden,
 *  never reordered, when the viewing role lacks it. Today
 *  `resolveWorkspaceForRole()` (workspace-registry.js) sends only
 *  role==='admin' into this workspace at all, and admin already has working
 *  access to every destination below via other Executive widgets' own CTAs
 *  (exec-attention → navPending/navEngineering, exec-recommendation →
 *  navDriverPrediction) — so this list currently resolves to "show all 9"
 *  for the only role that ever renders it. Phase 7C (Executive
 *  Consolidation) removed the standalone exec-simulation card; its
 *  'Simulasi' destination stays here unchanged — this catalogue was always
 *  the one place Simulation belonged as a destination rather than a second,
 *  content-free briefing section. The check is real, not decorative: it
 *  reads ctx.role so a future narrower role reaching this workspace is
 *  filtered correctly with zero code change here, instead of a comment that
 *  merely claims to be role-aware. */
const LAUNCHER_DESTINATIONS = [
  { label: 'Driver', icon: 'user', action: 'navDriverOps', visibleFor: ['admin'] },
  { label: 'Teknik', icon: 'maintenance', action: 'navEngineering', visibleFor: ['admin'] },
  { label: 'Kendaraan', icon: 'vehicle', action: 'navVehicles', visibleFor: ['admin'] },
  { label: 'Permintaan', icon: 'file', action: 'navPending', visibleFor: ['admin'] },
  { label: 'Petty Cash', icon: 'pettycash', action: 'navPettyCash', visibleFor: ['admin'] },
  { label: 'Analitik', icon: 'chart', action: 'navAnalyticsDriver', visibleFor: ['admin'] },
  { label: 'Prediksi', icon: 'trend', action: 'navDriverPrediction', visibleFor: ['admin'] },
  { label: 'Rekomendasi', icon: 'recommendation', action: 'navRecommendationAccuracy', visibleFor: ['admin'] },
  { label: 'Simulasi', icon: 'reset', action: 'navDriverPrediction', visibleFor: ['admin'] },
];

/** Filters the fixed catalogue by role — a `.filter()` preserves source
 *  order by construction, so this can only ever hide items, never reorder
 *  them. */
function launcherDestinationsFor(role) {
  return LAUNCHER_DESTINATIONS.filter(d => d.visibleFor.includes(role));
}

export const widgets = {
  /* ── Executive Briefing Hero ── (v1.22.1 redesign: de-boxed, ring gauge +
     huge score as the visual anchor, one verdict headline, one insight
     sentence, compact stat row, score breakdown/explainability collapsed
     into a secondary <details> disclosure. Same ctx.models/facts() as
     v1.22.0 — presentation-only.) */
  'exec-hero': {
    render(ctx) {
      const f = facts(ctx);
      const name = (ctx.user && (ctx.user.name || ctx.user.username)) || 'Admin';
      const now = new Date();
      const { headline, body } = buildHeroNarrative(f);
      const hasScore = !!(f.score && f.score.value != null);
      const pillTone = hasScore ? toneFromLevel(f.score.level) : 'neutral';
      const ringValue = hasScore ? Math.max(0, Math.min(100, f.score.value)) / 100 : 0;
      const ring = renderRingGauge({ value: ringValue, size: 152, thickness: 11, color: `var(--wsp-${headline.tone})`, track: 'var(--border-faint)' });

      // Phase 1 — Operational Pulse: exactly the three metrics that
      // communicate NOW (Snapshot owns Today/Week/Month, never duplicated
      // here). "Status Armada" is dropped from this row on purpose — it's
      // already covered by the ring/score itself and by the explainability
      // disclosure directly below, so keeping it here only added density
      // without adding clarity.
      const stats = [
        { lbl: 'Kendaraan Siap', big: n(f.dk.activeVehicles) },
        { lbl: 'Driver Aktif', big: n(f.dk.activeDrivers) },
        { lbl: 'Permintaan Tertunda', big: f.pending },
      ];

      // v1.21.0/v1.22.0 Explainability — now secondary, behind a disclosure.
      const breakdown = (f.ex && f.ex.scoreBreakdown && f.ex.scoreBreakdown.components) || [];
      const breakdownRows = breakdown.map(c => `
        <div class="wsp-hero__bd-row">
          <span class="wsp-hero__bd-label">${esc(c.label)} <span class="wsp-hero__bd-weight">${esc(c.weightPct)}%</span></span>
          <span class="wsp-hero__bd-value">${c.score == null ? '—' : esc(c.score)}</span>
        </div>`).join('');
      const explain = explainRows(f, breakdown);
      const explainRowsHtml = explain.map(r => `
        <div class="wsp-hero__explain-row wsp-hero__explain-row--${r.good ? 'good' : 'bad'}">
          <span class="wsp-hero__explain-sign">${r.good ? '+' : '−'}</span>${esc(r.text)}
        </div>`).join('');

      // Phase 1 — Motion Profile for THIS mood (Micro Motion only; the
      // page's Macro fade-up is untouched and lives in workspace-renderer.js
      // /platform.css). Every `.wsp-hero-anim` element gets its own delay
      // (the internal beat order: greeting -> ring -> headline -> pulse)
      // plus this mood's duration/easing — baked in here so the entrance is
      // correct even before onMount runs; onMount's only remaining job is
      // to suppress it on a refresh (see mountHeroMotion).
      const profile = resolveMotionProfile(headline.tone);
      const beat = (ms) => `--wsp-hero-delay:${ms}ms;--wsp-hero-dur:${profile.entranceDuration}ms;--wsp-hero-ease:${profile.ease}`;

      const scoreAria = hasScore
        ? `Skor kesehatan operasional ${esc(f.score.value)} dari 100, status ${esc(f.score.label || 'Kondisi Operasional')}`
        : 'Skor kesehatan operasional belum tersedia';

      return `
        <div class="wsp-hero">
          <div class="wsp-hero__eyebrow wsp-hero-anim" style="${beat(profile.micro.greeting)}">${esc(greeting(now))}, ${esc(name)} · ${esc(fmtLongDate(now))}</div>

          <div class="wsp-hero__health wsp-hero-anim" style="${beat(profile.micro.ring)}" aria-label="${scoreAria}">
            <div class="wsp-hero__gwrap" aria-hidden="true">
              ${ring}
              <div class="wsp-hero__scorewrap">
                ${hasScore
                  ? `<span class="wsp-hero__scoreval" data-countup="${esc(f.score.value)}">0</span><span class="wsp-hero__scoreunit">/100</span>`
                  : `<span class="wsp-hero__scoreval wsp-hero__scoreval--muted">—</span>`}
              </div>
            </div>
            <div class="wsp-hero__healthmeta" aria-hidden="true">
              ${pill(hasScore ? (f.score.label || 'Kondisi Operasional') : 'Menyusun data', pillTone)}
              <div class="wsp-hero__panel-label">Kesiapan Operasional</div>
            </div>
          </div>

          <div class="wsp-hero__verdict wsp-hero-anim" style="${beat(profile.micro.headline)}">
            <h2 class="wsp-hero__headline">${esc(headline.prefix)} <span class="wsp-hero__hl wsp-hero__hl--${headline.tone}">${esc(headline.highlight)}</span>.</h2>
            <p class="wsp-hero__insight">${esc(body)}</p>
          </div>

          <div class="wsp-hero__stats wsp-hero-anim" style="${beat(profile.micro.pulse)}" tabindex="0" role="group" aria-label="Status operasional saat ini">
            <span class="wsp-hero__stats-label">Status Operasional</span>
            ${stats.map(s => `
              <div class="wsp-hero__stat">
                <span class="wsp-hero__stat-lbl">${esc(s.lbl)}</span>
                <span class="wsp-hero__stat-big">${esc(s.big)}</span>
              </div>`).join('')}
          </div>

          ${(breakdownRows || explainRowsHtml) ? `
          <details class="wsp-hero__details">
            <summary>Lihat rincian skor</summary>
            <div class="wsp-hero__details-body">
              ${breakdownRows ? `<div class="wsp-hero__breakdown">${breakdownRows}</div>` : ''}
              ${explainRowsHtml ? `<div class="wsp-hero__explain">${explainRowsHtml}</div>` : ''}
            </div>
          </details>` : ''}
        </div>`;
    },
    onMount(bodyEl, ctx) { mountHeroMotion(bodyEl, ctx); },
  },

  /* ── Attention Center ── (v1.21.0 Objective 3: only actionable cross-domain
     items — critical assignments/vehicle maintenance, engineering verification
     pending + overdue, driver fatigue/burnout, outstanding requests, petty
     cash low balance. Reuses ctx.models (already computed for the Health
     Score) — introduces no new query.

     Phase 2 (Executive Attention) — rebuilt as the operational inbox per the
     approved Design Review: severity summary (pulsing dot + area count) above
     the ranked findings, then progressive disclosure for anything beyond the
     first ATTENTION_VISIBLE_CAP items — "Lihat N lainnya" per the Design
     Review's own `attentionShowCount = 2`. Still rankedList()/rankedItem()
     (Phase 0 ui-kit.js) for every row — no second severity-row vocabulary. The
     pulsing dot reuses the exact per-mood pulse spec already defined in
     motion-profiles.js's MOTION_PROFILES (critical/warning) — Motion Language
     §04's "Attention pulse" catalogue entry, first wired in here.

     Phase 7C (Executive Consolidation) — absorbs the one non-duplicated
     signal each removed section carried: exec-priority named its top
     critical vehicle instead of a bare count, and exec-decision named the
     single oldest pending request / top unverified engineering item instead
     of a bare count. Folded in here as the row TITLE (top instance + a "+N
     lainnya" suffix when there's more than one) using the exact same
     f.rec.board.critical / f.topPendingRequest / f.engUnverifiedList facts()
     already computes — no new query, no new vocabulary, no second severity
     list. Reason/action/tone per row are unchanged. (exec-priority's OTHER
     source, f.rec.board.upcoming, is deliberately NOT surfaced here: those
     are the Recommendation Engine's own MODERATE/"monitoring" tier —
     actionable:false by the engine's own classification — and Attention's
     contract is actionable items only; surfacing a non-actionable tier here
     would reintroduce the noise this consolidation removes. ELEVATED/
     "preventive" vehicles in that same bucket remain visible by name in
     exec-recommendation, unaffected.) */
  'exec-attention': {
    render(ctx) {
      const f = facts(ctx);
      const items = [];

      const criticalVehicleList = f.rec.board?.critical || [];
      if (criticalVehicleList.length > 0) {
        const top = criticalVehicleList[0];
        const suffix = criticalVehicleList.length > 1 ? ` (+${criticalVehicleList.length - 1} lainnya)` : '';
        items.push({ sev: 'critical', title: `${top.vehicleName} — ${top.categoryLabel}${suffix}`, reason: top.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau Armada' });
      }
      if (f.engOverdue > 0) items.push({ sev: classifyEngineeringOverdue(f.engOverdue).critical ? 'critical' : 'warn', title: `${f.engOverdue} pekerjaan Teknik melewati batas waktu`, reason: 'Penugasan teknik melewati batas waktu penyelesaian.', action: 'navEngineering', actionLabel: 'Tinjau Teknik' });
      if (f.pendingVerify > 0) {
        const top = f.engUnverifiedList[0];
        const suffix = f.pendingVerify > 1 ? ` (+${f.pendingVerify - 1} lainnya)` : '';
        items.push({ sev: 'warn', title: `Verifikasi Pekerjaan — ${top.title}${suffix}`, reason: 'Pekerjaan Teknik selesai namun belum diverifikasi koordinator.', action: 'navEngineering', actionLabel: 'Verifikasi Laporan' });
      }
      if (f.pending > 0) {
        const label = f.topPendingRequest.purpose || f.topPendingRequest.destination || f.topPendingRequest.requesterName || 'Bidang';
        const suffix = f.pending > 1 ? ` (+${f.pending - 1} lainnya)` : '';
        items.push({ sev: 'warn', title: `Setujui Permintaan — ${label}${suffix}`, reason: 'Permintaan bidang menunggu keputusan admin.', action: 'navPending', actionLabel: 'Tinjau Permintaan' });
      }
      if (f.atRiskDrivers > 0) items.push({ sev: 'warn', title: `${f.atRiskDrivers} driver berisiko kelelahan/burnout`, reason: 'Beban kerja driver melewati ambang aman dalam periode berjalan.', action: 'navAnalyticsDriver', actionLabel: 'Tinjau Wellness' });
      if (f.pettyLow) items.push({ sev: 'critical', title: 'Saldo petty cash rendah', reason: 'Saldo siklus berjalan berada di bawah ambang notifikasi.', action: 'navPettyCash', actionLabel: 'Tinjau Petty Cash' });

      if (!items.length) return compactSuccessLine('Seluruh domain operasional dalam kondisi aman.');
      items.sort((a, b) => severityRank(a.sev) - severityRank(b.sev));

      const topSev = items[0].sev;
      const criticalCount = items.filter(i => i.sev === 'critical').length;
      const pulse = (topSev === 'critical' ? MOTION_PROFILES.critical : MOTION_PROFILES.warning).pulse;

      const visible = items.slice(0, ATTENTION_VISIBLE_CAP);
      const rest = items.slice(ATTENTION_VISIBLE_CAP);

      const summary = `
        <div class="wsp-attn__summary">
          <span class="wsp-attn__dot wsp-attn__dot--${topSev} wsp-attn-pulse wsp-attn-pulse--${pulse.amplitude}" style="animation-duration:${pulse.periodMs}ms" aria-hidden="true"></span>
          <span class="wsp-attn__count">${esc(items.length)} area memerlukan tindakan${criticalCount ? ` · ${esc(criticalCount)} kritis` : ''}</span>
        </div>`;

      const disclosure = rest.length ? `
        <div class="wsp-attn__more" data-attn-more>${rankedList(rest)}</div>
        <button type="button" class="wsp-attn__toggle" data-attn-toggle aria-expanded="false">Lihat ${esc(rest.length)} lainnya</button>` : '';

      return `<div class="wsp-attn">${summary}${rankedList(visible)}${disclosure}</div>`;
    },
    onMount(bodyEl) {
      const btn = bodyEl.querySelector('[data-attn-toggle]');
      const more = bodyEl.querySelector('[data-attn-more]');
      // Phase 8 (Motion Polish) — Realtime Continuity: disclosure state now
      // persists across a live refresh, the same dataset-on-bodyEl contract
      // Story (exec-activity) and Snapshot's period selector already use —
      // bodyEl is the same node every mount (only its innerHTML is rebuilt),
      // so "already open" is reliably known. Previously a Firebase update
      // would silently re-collapse an Attention list the admin had
      // expanded; this was the one section (with Recommendation) that
      // hadn't yet adopted the pattern Story already established.
      if (btn && more) {
        const totalMore = more.querySelectorAll('.wsp-sevrow').length;
        if (bodyEl.dataset.wspAttnOpen === '1') {
          more.classList.add('wsp-attn__more--open');
          btn.setAttribute('aria-expanded', 'true');
          btn.textContent = 'Sembunyikan';
        }
        btn.addEventListener('click', () => {
          const open = more.classList.toggle('wsp-attn__more--open');
          bodyEl.dataset.wspAttnOpen = open ? '1' : '0';
          btn.setAttribute('aria-expanded', String(open));
          btn.textContent = open ? 'Sembunyikan' : `Lihat ${totalMore} lainnya`;
        });
      } else {
        delete bodyEl.dataset.wspAttnOpen;
      }
    },
  },

  /* ── Executive Decision Center (Recommended Actions) ── (Phase 3: the
     Recommendation section redesigned per the approved Design Review — it
     answers "what decision should I make next?", not "what information
     exists?". Reuses the certified Recommendation Engine's own fields
     one-to-one, never a second recommendation vocabulary: r.title is already
     an imperative ACTION ("Jadwalkan perawatan …"), r.reason is the ENGINE's
     own reason, r.expectedBenefit is the IMPACT, r.priority is the PRIORITY —
     nothing here is invented. Same explainable-card + primary/secondary size
     hierarchy + progressive disclosure shape already established for the
     .wsp-inbox vocabulary and Attention's own disclosure — "no second
     recommendation vocabulary" per the implementation contract. (Phase 7C
     Executive Consolidation removed the standalone exec-decision widget that
     originally established this .wsp-inbox shape alongside this one; its
     unique named-entity signals were folded into exec-attention, and its
     duplicated fleet-maintenance recommendations were already redundant with
     this section — see exec-attention's own comment for the migration.) */
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
      const items = (rec.recs || [])
        .filter(r => r.actionable && r.category !== 'none' && r.category !== 'fleet-optimization')
        .slice()
        .sort((a, b) => (a.priority?.rank ?? 9) - (b.priority?.rank ?? 9));
      if (!items.length) {
        const msg = (rec.positive && rec.positive.messages && rec.positive.messages[0]) || 'Armada beroperasi normal.';
        return lead(msg) + actionBtn('Buka Prediksi', 'navDriverPrediction', { variant: 'ghost' });
      }

      // v1.22.2 Objective 6's Decision Center hierarchy, reused verbatim: only
      // the single top (highest-priority) action is ever "primary" — every
      // other action, visible or behind disclosure, is "secondary". Reason
      // and Impact are two DISTINCT, labeled lines (not merged into one) per
      // the Decision Center contract: Action / Reason / Impact / Priority
      // must each be independently identifiable within 10 seconds.
      const row = (r, variant) => `
        <div class="wsp-inbox__item wsp-inbox__item--${variant}">
          <div class="wsp-inbox__top">${pill(r.priority?.label || 'Prioritas', engineTone(r.priority?.tone))}</div>
          <div class="wsp-inbox__title">${esc(r.title)}</div>
          <div class="wsp-inbox__explain">
            <div class="wsp-inbox__explain-row"><span class="wsp-inbox__explain-label">Alasan</span>${esc(r.reason)}</div>
            <div class="wsp-inbox__explain-row"><span class="wsp-inbox__explain-label">Dampak</span>${esc(r.expectedBenefit || r.estimatedImpact?.label || '—')}</div>
          </div>
          ${actionBtn('Tinjau Prediksi', 'navDriverPrediction', { variant: 'ghost' })}
        </div>`;

      const visible = items.slice(0, RECOMMENDATION_VISIBLE_CAP);
      const rest = items.slice(RECOMMENDATION_VISIBLE_CAP);
      const visibleHtml = visible.map((r, i) => row(r, i === 0 ? 'primary' : 'secondary')).join('');
      const disclosure = rest.length ? `
        <div class="wsp-reco__more" data-reco-more>${rest.map(r => row(r, 'secondary')).join('')}</div>
        <button type="button" class="wsp-reco__toggle" data-reco-toggle aria-expanded="false">Lihat ${esc(rest.length)} tindakan lainnya</button>` : '';

      return `<div class="wsp-inbox">${visibleHtml}${disclosure}</div>`;
    },
    onMount(bodyEl) {
      const btn = bodyEl.querySelector('[data-reco-toggle]');
      const more = bodyEl.querySelector('[data-reco-more]');
      // Phase 8 (Motion Polish) — Realtime Continuity, same pattern as
      // exec-attention above and exec-activity's own established contract.
      if (btn && more) {
        const totalMore = more.querySelectorAll('.wsp-inbox__item').length;
        if (bodyEl.dataset.wspRecoOpen === '1') {
          more.classList.add('wsp-reco__more--open');
          btn.setAttribute('aria-expanded', 'true');
          btn.textContent = 'Sembunyikan';
        }
        btn.addEventListener('click', () => {
          const open = more.classList.toggle('wsp-reco__more--open');
          bodyEl.dataset.wspRecoOpen = open ? '1' : '0';
          btn.setAttribute('aria-expanded', String(open));
          btn.textContent = open ? 'Sembunyikan' : `Lihat ${totalMore} tindakan lainnya`;
        });
      } else {
        delete bodyEl.dataset.wspRecoOpen;
      }
    },
  },

  /* ── Operational Snapshot ── (Phase 4: "what happened over the selected
     period", not "what exists" — a Segmented control (Hari/Minggu/Bulan,
     per the approved Design Review) drives ONE active summary-card panel
     instead of the old always-all-three-visible KPI stack. Same rolling
     Today/Week/Month windows and the same 5 metrics as v1.21.0 — reused,
     never recomputed differently — plus a static, non-fabricated supporting
     description per card (no invented trend/delta: none is available for
     these metrics yet, so none is shown, per the "never fabricate trends"
     contract). Insight and Pending Approval are unchanged in substance,
     just no longer nested under a per-period label since only one period is
     ever visible now.) */
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

      function periodValues(fromYmd, fromMs) {
        const asg = assignments.filter(a => a.date && a.date >= fromYmd && a.date <= todayYmd);
        return {
          trip: asg.length,
          completed: asg.filter(a => a.status === 'completed').length,
          vehicles: new Set(asg.map(a => (a.vehicle || '').trim()).filter(Boolean)).size,
          engReports: engEvents.filter(e => e.type === 'finished' && Date.parse(e.timestamp || 0) >= fromMs).length,
          reqResolved: requests.filter(r => r.createdAt && Date.parse(r.createdAt) >= fromMs && r.status !== 'pending').length,
        };
      }

      const PERIODS = [
        { key: 'hari', segLabel: 'Hari', values: periodValues(todayYmd, sinceMs(1)) },
        { key: 'minggu', segLabel: 'Minggu', values: periodValues(sinceYmd(7), sinceMs(7)) },
        { key: 'bulan', segLabel: 'Bulan', values: periodValues(sinceYmd(30), sinceMs(30)) },
      ];
      const TILE_META = [
        { key: 'trip', title: 'Penugasan Dijalankan', desc: 'Total penugasan terjadwal pada periode ini' },
        { key: 'completed', title: 'Penugasan Selesai', desc: 'Penugasan yang telah diselesaikan driver' },
        { key: 'vehicles', title: 'Kendaraan Terpakai', desc: 'Kendaraan unik yang digunakan' },
        { key: 'engReports', title: 'Laporan Teknik Selesai', desc: 'Pekerjaan Teknik yang selesai' },
        { key: 'reqResolved', title: 'Permintaan Diproses', desc: 'Permintaan bidang yang telah diputuskan' },
      ];

      const segButtons = PERIODS.map((p, i) => `
        <button type="button" role="tab" id="wsp-seg-${p.key}" class="wsp-segmented__btn${i === 0 ? ' wsp-segmented__btn--active' : ''}"
          data-wsp-seg="${p.key}" aria-selected="${i === 0}" aria-controls="wsp-panel-${p.key}" tabindex="${i === 0 ? '0' : '-1'}">${esc(p.segLabel)}</button>`).join('');

      const panels = PERIODS.map((p, i) => `
        <div class="wsp-snapshot__panel" id="wsp-panel-${p.key}" data-snapshot-panel="${p.key}" role="tabpanel" aria-labelledby="wsp-seg-${p.key}"${i === 0 ? '' : ' hidden'}>
          <div class="wsp-summary-grid">${TILE_META.map(m => `
            <div class="wsp-summary wsp-summary--static">
              <span class="wsp-summary__title">${esc(m.title)}</span>
              <span class="wsp-summary__value">${esc(p.values[m.key])}</span>
              <span class="wsp-summary__desc">${esc(m.desc)}</span>
            </div>`).join('')}</div>
        </div>`).join('');

      // v1.22.2 Objective 8 — Executive Insight, Apple-Health style: exactly
      // ONE sentence (topInsightLine), not a bulleted list of up to 4.
      const insightLine = topInsightLine(ctx) || 'Data historis belum cukup untuk menghasilkan wawasan perbandingan.';

      return `
        <div class="wsp-segmented" role="tablist" aria-label="Pilih periode Snapshot Operasional" data-wsp-segmented>${segButtons}</div>
        <div class="wsp-snapshot__panels">${panels}</div>
        <div class="wsp-snapshot-period">
          <div class="wsp-snapshot-period__label">Wawasan</div>
          <p class="wsp-insight">${esc(insightLine)}</p>
        </div>
        <div class="wsp-summary-grid">
          <button type="button" class="wsp-summary" data-wsp-action="navPending">
            <span class="wsp-summary__title">Permintaan Tertunda</span>
            <span class="wsp-summary__value">${esc(f.pending)}</span>
            <span class="wsp-summary__status wsp-summary__status--${f.pending > 0 ? 'warn' : 'good'}">${f.pending > 0 ? 'Menunggu' : 'Bersih'}</span>
          </button>
        </div>`;
    },
    onMount(bodyEl) {
      wireSnapshotSegmented(bodyEl);
      const saved = bodyEl.dataset.wspActivePeriod;
      if (saved && saved !== 'hari') applySnapshotPeriod(bodyEl, saved, false);
      else bodyEl.dataset.wspActivePeriod = 'hari';
    },
  },

  /* ── Executive Operational Story ── (Phase 5: "How has today's operation
     unfolded", not "what events occurred" — narrative groups by operational
     CONTEXT (Driver Operations / Teknik / Kendaraan / Permintaan), not just
     adjacent same-action runs, per the approved Design Review. Reuses the
     exact same audit-log + Engineering-timeline merge v1.22.3/v1.21.0 built
     (no new query, no synthetic events) — buildStoryBlocks() groups
     consecutive same-context items into one small narrative, falling back to
     the original flat row for an isolated event or an already-uniform run
     (the common case, unchanged look). Disclosure now caps on total activity
     COUNT across blocks (still 5, unchanged threshold), and realtime refresh
     never replays the whole Story — see onMount. */
  'exec-activity': {
    render(ctx) {
      const seen = new Set();
      const auditItems = (ctx.logs || [])
        .filter(l => AUDIT_TIMELINE_ALLOW.has(l.action))
        .map(l => {
          const meta = AUDIT_STORY_META[l.action];
          return {
            key: l.id || `log:${l.action}:${l.createdAt || l.timestamp}`,
            groupKey: l.action,
            domainKey: storyDomainKey('audit', l.action),
            ts: Date.parse(l.createdAt || l.timestamp || 0),
            icon: meta.icon, tone: meta.tone,
            sentence: meta.sentence(l, ctx),
            meta: '',
            aggregate: meta.aggregate,
          };
        });
      const engItems = (ctx.engineeringEvents || [])
        .filter(e => ENG_TIMELINE_ALLOW.has(e.type))
        .map(e => {
          const meta = ENG_STORY_META[e.type];
          return {
            key: e.id || `eng:${e.type}:${e.timestamp}`,
            groupKey: e.type,
            domainKey: storyDomainKey('eng', e.type),
            ts: Date.parse(e.timestamp || 0),
            icon: meta.icon, tone: meta.tone,
            sentence: engEventSentence(e.type, e.assignmentTitle),
            meta: (e.actor && e.actor.name) || '',
            aggregate: meta.aggregate,
          };
        });
      const todayStart = startOfDay(0);
      const raw = [...auditItems, ...engItems]
        .filter(it => { if (seen.has(it.key)) return false; seen.add(it.key); return true; })
        .filter(it => Number.isFinite(it.ts) && it.ts >= todayStart && it.ts < todayStart + DAY_MS)
        .sort((a, b) => a.ts - b.ts);
      if (!raw.length) return empty('Belum ada aktivitas penting hari ini.');

      const blocks = buildStoryBlocks(raw);

      const row = (it) => `
        <li class="wsp-feed__row" data-story-key="${esc(it.key)}">
          <span class="wsp-feed__icon wsp-feed__icon--${it.tone}" aria-hidden="true">${anIcon(it.icon, { size: 15 })}</span>
          <div class="wsp-feed__body">
            <div class="wsp-feed__sentence">${esc(it.sentence)}</div>
            ${it.meta ? `<div class="wsp-feed__meta">${esc(it.meta)}</div>` : ''}
          </div>
          <span class="wsp-feed__time">${esc(fmtTime(it.ts))}</span>
        </li>`;

      // A block that collapsed to one line (an isolated event, or a run that
      // was already a single repeated action) IS the old flat row — no
      // header needed, nothing new to disclose. A header only earns its
      // place once a run genuinely mixes 2+ distinct actions in the same
      // context ("3 penugasan dibuat, 1 dibatalkan").
      const blockItem = (b) => {
        if (b.lines.length === 1) return row(b.lines[0]);
        return `
        <li class="wsp-feed__block" data-story-key="${esc(b.key)}">
          <div class="wsp-feed__block-head">
            <span class="wsp-feed__icon wsp-feed__icon--${b.tone}" aria-hidden="true">${anIcon(b.domainIcon, { size: 15 })}</span>
            <span class="wsp-feed__block-label">${esc(b.domainLabel)}</span>
            <span class="wsp-feed__time">${esc(fmtStoryRange(b.tsStart, b.tsEnd))}</span>
          </div>
          <ul class="wsp-feed__sublist">
            ${b.lines.map(l => `
            <li class="wsp-feed__subrow" data-story-key="${esc(`${b.key}:${l.key}`)}">
              <span class="wsp-feed__subrow-sentence">${esc(l.sentence)}</span>
              <span class="wsp-feed__subrow-time">${esc(fmtTime(l.ts))}</span>
            </li>`).join('')}
          </ul>
        </li>`;
      };

      // Disclosure caps on total ACTIVITY count across blocks (unchanged
      // threshold, 5), not block count — a contiguous chronological prefix,
      // never a gap. The first block always shows in full even if its own
      // count alone exceeds the cap (never split a block mid-narrative).
      const VISIBLE_CAP = 5;
      const visible = [];
      const rest = [];
      let acc = 0;
      for (const b of blocks) {
        if (!rest.length && (acc === 0 || acc + b.count <= VISIBLE_CAP)) { visible.push(b); acc += b.count; }
        else rest.push(b);
      }
      const hiddenCount = rest.reduce((sum, b) => sum + b.count, 0);
      const toggle = rest.length
        ? `<button type="button" class="wsp-feed__toggle" data-feed-toggle data-feed-hidden-count="${hiddenCount}" aria-expanded="false">Lihat ${hiddenCount} aktivitas lainnya</button>`
        : '';
      const moreBlock = rest.length
        ? `<ul class="wsp-feed__more" data-feed-more role="list">${rest.map(blockItem).join('')}</ul>`
        : '';

      return `<div class="wsp-feed">
        <ul class="wsp-feed__list" role="list">${visible.map(blockItem).join('')}</ul>
        ${moreBlock}
        ${toggle}
      </div>`;
    },
    onMount(bodyEl) {
      const btn = bodyEl.querySelector('[data-feed-toggle]');
      const more = bodyEl.querySelector('[data-feed-more]');

      // Disclosure state persists across a live refresh — bodyEl is the same
      // node every mount (only its innerHTML is rebuilt), same continuity
      // contract as exec-snapshot's applySnapshotPeriod. Without this, every
      // Firebase update would silently re-collapse a Story the admin had
      // opened — the ONE new behavior Motion Language calls out for Story.
      if (btn && more) {
        if (bodyEl.dataset.wspStoryOpen === '1') {
          more.classList.add('wsp-feed__more--open');
          btn.setAttribute('aria-expanded', 'true');
          btn.textContent = 'Sembunyikan';
        }
        btn.addEventListener('click', () => {
          const open = more.classList.toggle('wsp-feed__more--open');
          bodyEl.dataset.wspStoryOpen = open ? '1' : '0';
          btn.setAttribute('aria-expanded', String(open));
          btn.textContent = open ? 'Sembunyikan' : btn.dataset.feedHiddenCount ? `Lihat ${btn.dataset.feedHiddenCount} aktivitas lainnya` : '';
        });
      } else {
        delete bodyEl.dataset.wspStoryOpen;
      }

      // Realtime append, never a replay: the first mount has nothing to diff
      // against (the section's own Macro fade-up already covers that
      // entrance — see MACRO_STAGGER.story), so nothing animates here. Every
      // mount after that is a live data refresh rebuilding this same body
      // node from scratch; only rows/sub-rows whose key is NEW since the
      // PREVIOUS mount ease in (REALTIME_TWEEN — the same continuity timing
      // the Hero's score/ring correction already uses). Everything already
      // seen appears exactly as it looked a moment ago — the Story is never
      // replayed wholesale on a data poll.
      const nodes = Array.from(bodyEl.querySelectorAll('[data-story-key]'));
      const prevSeen = bodyEl.__wspStorySeen;
      if (prevSeen && !motionOff()) {
        nodes.forEach((el) => {
          if (prevSeen.has(el.dataset.storyKey)) return;
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(-4px)';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = `opacity ${REALTIME_TWEEN.duration}ms ${REALTIME_TWEEN.ease}, transform ${REALTIME_TWEEN.duration}ms ${REALTIME_TWEEN.ease}`;
            el.style.opacity = '1';
            el.style.transform = 'none';
          }));
        });
      }
      bodyEl.__wspStorySeen = new Set(nodes.map(el => el.dataset.storyKey));
    },
  },

  /* ── Executive Launcher ── (Phase 6: the exit point of the briefing, not
     another decision surface — "where do I go next," never "what should I
     do." Fixed 9-destination order (LAUNCHER_DESTINATIONS above), genuinely
     role-filtered via ctx.role (see that const's comment for why this is a
     no-op today), horizontally scrollable on mobile via the existing
     .wsp-chips rule — unchanged from before this phase. */
  'exec-quick': {
    render(ctx) {
      const items = launcherDestinationsFor(ctx?.role);
      if (!items.length) return empty('Tidak ada tujuan yang tersedia untuk peran ini.');
      return chipRow(items.map(d => chip(d.label, d.action, { icon: anIcon(d.icon, { size: 16 }) })));
    },
  },
};
