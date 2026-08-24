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

import { esc, empty, lead, pill, actionBtn, listRow, list, metric, metricRow } from '../_widget-base.js';
// v1.30.9.14 (V1 Redesign Phase 2) — shape half of vehicle identity (color
// already existed per-vehicle; shape did not exist anywhere before this).
import { buildVehicleShapeMap, vehicleShapeCss } from '../../utils/vehicle-identity.js';
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
import { rankedList, compactSuccessLine, severityRank, toneFromLevel, toneFromEngine as engineTone, launcherGrid, launcherGroups } from './ui-kit.js';
// Phase 1 (Hero) — Motion Profiles defined in Phase 0, first consumed here.
// Macro Motion (page-level section reveal) is unaffected by this import —
// it stays owned by workspace-renderer.js's existing fade-up class.
import { resolveMotionProfile, REALTIME_TWEEN, cssEaseToFn, MOTION_PROFILES, EASE } from './motion-profiles.js';
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
  // v1.30.4.1 — atRiskDrivers is the Wellness Engine's canonical DISTINCT-driver
  // union (fatigue ∪ burnout); never sum burnoutRisk + highFatigue here, that
  // double-counts a driver who crosses both thresholds.
  const atRiskDrivers = numOr0(wellness.summary?.atRiskDrivers);
  const pettyLow = !!petty.low;
  // Same expression buildInsight() already computes locally (line ~537) for
  // its own workload-comparison sentence — duplicated here (not extracted
  // into a shared helper) because buildInsight() needs yesterday's count too
  // and this file's own convention is "ONE computation per render pass"
  // scoped to facts(), not a cross-function shared cache.
  const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const tripsToday = (ctx.assignments || []).filter(a => a.date === todayYmd).length;
  return {
    ex, dk, pending, rec, criticalVehicles, engOverdue,
    engUnverifiedList, pendingVerify, atRiskDrivers, pettyLow, tripsToday,
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

/** Phase 7C — per-item entrance cascade (`.fade-up` + nth-child delay, see
 *  workspace-styles.js) must only ever play on the FIRST mount of a
 *  section, exactly like Hero's own `.wsp-hero-anim` contract
 *  (mountHeroMotion above): `bodyEl` is the same node across a live
 *  refresh (only its innerHTML is rebuilt), so "already mounted" is
 *  reliably known from a dataset flag. On every mount after the first,
 *  the animation is hard-disabled inline before paint so a Firebase
 *  update never replays the reveal. */
function suppressReplayAfterFirstMount(bodyEl, flagKey, itemSelector) {
  const already = bodyEl.dataset[flagKey] === '1';
  bodyEl.dataset[flagKey] = '1';
  if (already) bodyEl.querySelectorAll(itemSelector).forEach((el) => { el.style.animation = 'none'; });
}

/** Phase 7C — generic 0->value count-up for any `[data-countup]` element
 *  (metric() tiles: Snapshot's 5 KPI values, Outlook's tomorrow-trip
 *  metric), the same tween shape mountHeroMotion already uses for the
 *  score/pulse stats, generalized. Deliberately capped short (<=450ms) —
 *  unlike the Hero's mood-tuned ring/score (which stays on its own
 *  established per-mood timing, untouched), a KPI tile has no mood to
 *  express; it should just feel like live data arriving quickly. Runs
 *  once on first mount only — a live refresh shows the new value directly
 *  rather than re-tweening from 0 (simpler than Hero's full last-shown
 *  continuity contract; never replaying from 0 is the part that matters). */
function mountCountUp(bodyEl, flagKey) {
  const already = bodyEl.dataset[flagKey] === '1';
  bodyEl.dataset[flagKey] = '1';
  const els = Array.from(bodyEl.querySelectorAll('[data-countup]'));
  if (!els.length) return;
  if (already || motionOff()) {
    els.forEach((el) => { el.textContent = el.getAttribute('data-countup'); });
    return;
  }
  // Phase 8.7 — same staleness hazard mountHeroMotion's own gen/stale()
  // guard below already documents and fixes for the Hero, missed here: a
  // second mount arriving faster than this tween's own duration (rapid
  // back-to-back Firebase refreshes) left the FIRST call's tick loop still
  // running afterward, writing to now-detached [data-countup] nodes
  // (mountWidgets() rebuilds bodyEl's innerHTML on every mount) until its
  // own duration elapsed on its own — wasted compositor/scripting work, not
  // a visible bug (detached nodes render nothing), found by rAF-loop audit.
  const gen = (bodyEl.__countUpGen = (bodyEl.__countUpGen || 0) + 1);
  const stale = () => bodyEl.__countUpGen !== gen;
  const ease = cssEaseToFn(EASE);
  const duration = 420;
  const t0 = performance.now();
  const targets = els.map((el) => ({ el, target: Number(el.getAttribute('data-countup')) || 0 }));
  const tick = (now) => {
    if (stale()) return;
    const p = Math.min(1, (now - t0) / duration);
    const e = ease(p);
    targets.forEach(({ el, target }) => { el.textContent = String(Math.round(target * e)); });
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Premium Pass (Sections 9/16) — comparative bars (Snapshot metrics,
 *  Driver trip-bars) MORPH between refreshes instead of snapping, reusing
 *  the exact continuity-tween shape mountHeroMotion's ring/score already
 *  established: `bodyEl.__wspBarLast` is a plain JS Map (bar keys can
 *  contain characters `dataset` can't) that persists across a refresh
 *  (bodyEl is the same node every mount, only its innerHTML is rebuilt).
 *  On first mount every key is unseen, so every bar eases 0 -> target — the
 *  same reveal the old CSS keyframe gave, just JS-driven so the exact same
 *  code path also handles a live value CHANGING. A bar with no
 *  `data-bar-key` (barKey omitted at the call site) is drawn at its target
 *  immediately every mount — never tracked, never animated — matching how
 *  every metric()/barPct caller that predates this Pass already behaved. */
function mountBarReveal(bodyEl, barSelector) {
  const els = Array.from(bodyEl.querySelectorAll(barSelector));
  if (!els.length) return;
  if (!bodyEl.__wspBarLast) bodyEl.__wspBarLast = new Map();
  const lastMap = bodyEl.__wspBarLast;
  const reduce = motionOff();
  const ease = cssEaseToFn(EASE);
  const duration = 500;
  const t0 = performance.now();
  // Phase 8.7 — same guard as mountCountUp above (see its comment): one
  // generation counter for this whole mount call, checked by every bar's
  // own tick loop, so a superseded mount's loops stop writing to detached
  // nodes instead of running out their full duration for nothing.
  const gen = (bodyEl.__barGen = (bodyEl.__barGen || 0) + 1);
  const stale = () => bodyEl.__barGen !== gen;
  els.forEach((el) => {
    const target = Number(el.dataset.barTarget);
    if (!Number.isFinite(target)) return;
    const key = el.dataset.barKey || '';
    const from = key && lastMap.has(key) ? lastMap.get(key) : 0;
    if (key) lastMap.set(key, target);
    if (!key || reduce) { el.style.width = `${target}%`; return; }
    const tick = (now) => {
      if (stale()) return;
      const p = Math.min(1, (now - t0) / duration);
      el.style.width = `${from + (target - from) * ease(p)}%`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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
  // .wsp-pulse__dot's own pop-in (Phase 7D) isn't itself .wsp-hero-anim
  // (each dot carries its own per-index animation-delay, not a Hero beat),
  // so it needs the same suppression explicitly, on the same
  // alreadyMounted signal, or it would replay its stagger on every
  // realtime refresh.
  root.querySelectorAll('.wsp-hero-anim, .wsp-pulse__dot').forEach((el) => {
    if (reduce || alreadyMounted) el.style.animation = 'none';
  });

  const hasScore = !!(f.score && f.score.value != null);
  const targetScore = hasScore ? f.score.value : 0;
  const lastScoreRaw = Number(root.dataset.heroLastScore);
  const fromScore = alreadyMounted && Number.isFinite(lastScoreRaw) ? lastScoreRaw : 0;
  root.dataset.heroLastScore = String(targetScore);

  // Scoped to .wsp-hero__scoreval specifically (not the bare [data-countup]
  // attribute) now that the pulse stats below also carry data-countup —
  // DOM order happens to put the score first today, but this must not rely
  // on that.
  const scoreEl = root.querySelector('.wsp-hero__scoreval[data-countup]');
  const ringEl = root.querySelector('.an-ring-val[data-ring-len]');
  const circ = ringEl ? parseFloat(ringEl.getAttribute('data-ring-circ')) : null;
  const targetLen = ringEl ? parseFloat(ringEl.getAttribute('data-ring-len')) : null;
  const fromLen = alreadyMounted && circ != null ? (fromScore / 100) * circ : 0;

  // v1.30.10.6 — Pulse metrics (Kendaraan Siap/Driver Aktif/Permintaan
  // Tertunda/Trip Hari Ini) count up the same way the score does: 0->target
  // on first mount, last-shown->new on a live refresh, never a hard snap.
  // Continuity is tracked per stat key on root.dataset, same contract as
  // heroLastScore above (root survives a refresh, only innerHTML is rebuilt).
  const statEls = Array.from(root.querySelectorAll('.wsp-hero__stat-big[data-countup][data-stat-key]'));
  const statTweens = new Map();
  statEls.forEach((el) => {
    const key = el.dataset.statKey;
    const target = Number(el.dataset.countup);
    if (!Number.isFinite(target)) return;
    const datasetKey = `heroLastStat${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    const lastRaw = Number(root.dataset[datasetKey]);
    const from = alreadyMounted && Number.isFinite(lastRaw) ? lastRaw : 0;
    statTweens.set(el, { from, target });
    root.dataset[datasetKey] = String(target);
  });

  if (reduce) {
    if (scoreEl) scoreEl.textContent = String(Math.round(targetScore));
    if (ringEl && circ != null) ringEl.setAttribute('stroke-dasharray', `${targetLen} ${circ}`);
    statTweens.forEach(({ target }, el) => { el.textContent = String(target); });
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

  statTweens.forEach(({ from, target }, el) => {
    const tick = (now) => {
      if (stale()) return;
      const p = Math.min(1, (now - t0) / tween.duration);
      const v = from + (target - from) * ease(p);
      el.textContent = String(Math.round(v));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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

/** Phase 7D — extracted from exec-activity's own render() (unchanged
 *  computation, same audit-log + Engineering-timeline merge, same
 *  allowlists, same today-only window) so the new Operational Pulse strip
 *  (exec-hero) can plot the exact same certified event set instead of
 *  running a second, possibly-diverging query. One source of truth for
 *  "what happened today," two presentations: a vertical feed (Story) and a
 *  compact time-axis (Pulse). */
function todaysStoryItems(ctx) {
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
  return [...auditItems, ...engItems]
    .filter(it => { if (seen.has(it.key)) return false; seen.add(it.key); return true; })
    .filter(it => Number.isFinite(it.ts) && it.ts >= todayStart && it.ts < todayStart + DAY_MS)
    .sort((a, b) => a.ts - b.ts);
}

/** Phase 7D — Operational Pulse: today's REAL events (todaysStoryItems,
 *  above — the same certified set Story renders as a feed) plotted on a
 *  fixed 07:00-19:00 time axis. Never a forecast, never a trend line —
 *  each dot is one real, already-happened event at its real timestamp.
 *  domainKey collapses to the Pulse's 3-category legend: driver
 *  operations + vehicle events read as "Operasional Driver" (both are
 *  fleet/trip activity), engineering as "Teknik", requests as
 *  "Permintaan". Positions clamp into the window rather than being
 *  dropped, so an event outside 07:00-19:00 still shows (at the nearest
 *  edge) rather than silently vanishing. */
const PULSE_WINDOW_START_MIN = 7 * 60;
const PULSE_WINDOW_END_MIN = 19 * 60;
const PULSE_TONE_BY_DOMAIN = { driverOps: 'brand', vehicle: 'brand', engineering: 'intel', request: 'warn' };
/** Premium Pass — carries the real sentence + domain label per mark (both
 *  already computed by todaysStoryItems, STORY_DOMAINS — no new data) so
 *  the dot's hover/focus tooltip can show genuine event content instead of
 *  just a bare timestamp. */
function buildPulseMarks(ctx) {
  const items = todaysStoryItems(ctx);
  const span = PULSE_WINDOW_END_MIN - PULSE_WINDOW_START_MIN;
  const marks = items.map((it) => {
    const d = new Date(it.ts);
    const minutes = d.getHours() * 60 + d.getMinutes();
    const pct = Math.max(0, Math.min(100, ((minutes - PULSE_WINDOW_START_MIN) / span) * 100));
    const domain = STORY_DOMAINS[it.domainKey];
    // Phase 7G.4 — `active` marks the ONE event type this pulse gives an
    // active-state treatment to: a driver assignment actually starting
    // (groupKey is the raw log action, 'assignment_started', for audit-log
    // items — see todaysStoryItems()/AUDIT_TIMELINE_ALLOW above). No other
    // event type pulses; the dot's own tone/color is unchanged either way.
    return { leftPct: pct, tone: PULSE_TONE_BY_DOMAIN[it.domainKey] || 'brand', active: it.groupKey === 'assignment_started', ts: it.ts, sentence: it.sentence, domainLabel: domain ? domain.label : '' };
  });
  return marks;
}

/** Command Panel Pass (7G) — an adaptive viewport clamp shared by the
 *  Pulse and Outlook tooltips. Both position themselves centered on their
 *  trigger (dot/marker) via a CSS `translateX(-50%)`; on a narrow phone a
 *  dot/marker near either edge of the axis centers a tooltip that
 *  overflows the real viewport (confirmed empirically at 375px — a
 *  left-edge dot's tooltip sat 58px off-screen, a right-edge one 20px off
 *  the other side) — exactly what the brief's "do not allow tooltips to
 *  render outside the viewport" calls out. Rather than a different
 *  positioning scheme, this measures the ALREADY-centered tooltip
 *  (position/left is unaffected by the opacity-only --visible class, so
 *  no rAF wait is needed) and nudges it back inside a small margin via a
 *  CSS custom property the tooltip's own transform already reads. */
function clampTooltipToViewport(tip, margin = 8) {
  tip.style.removeProperty('--wsp-tooltip-shift');
  const rect = tip.getBoundingClientRect();
  let shift = 0;
  if (rect.left < margin) shift = margin - rect.left;
  else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
  if (shift !== 0) tip.style.setProperty('--wsp-tooltip-shift', `${shift}px`);
}

/** Premium Pass — a single shared floating tooltip per Pulse instance
 *  (event-delegated, not one listener/element per dot). Built with
 *  textContent-only DOM writes (never innerHTML) even though the source
 *  fields were already esc()-escaped for their data-* attributes — dataset
 *  reads return the DECODED string, so re-injecting that into innerHTML
 *  would reopen exactly the injection risk esc() exists to close. */
function wirePulseTooltip(root) {
  const pulseEl = root.querySelector('.wsp-pulse');
  const axis = pulseEl && pulseEl.querySelector('.wsp-pulse__axis');
  if (!axis) return;
  let tip = axis.querySelector('.wsp-pulse__tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'wsp-pulse__tooltip';
    tip.setAttribute('role', 'status');
    axis.appendChild(tip);
  }
  const show = (dot) => {
    tip.textContent = '';
    const t = document.createElement('span'); t.className = 'wsp-pulse__tooltip-time'; t.textContent = dot.dataset.pulseTime || '';
    const d = document.createElement('span'); d.className = 'wsp-pulse__tooltip-domain'; d.textContent = dot.dataset.pulseDomain || '';
    const s = document.createElement('span'); s.className = 'wsp-pulse__tooltip-sentence'; s.textContent = dot.dataset.pulseSentence || '';
    tip.append(t, d, s);
    tip.style.left = dot.style.left;
    tip.classList.add('wsp-pulse__tooltip--visible');
    clampTooltipToViewport(tip);
  };
  const hide = () => tip.classList.remove('wsp-pulse__tooltip--visible');
  axis.querySelectorAll('.wsp-pulse__dot').forEach((dot) => {
    dot.addEventListener('mouseenter', () => show(dot));
    dot.addEventListener('mouseleave', hide);
    dot.addEventListener('focus', () => show(dot));
    dot.addEventListener('blur', hide);
  });
}

/** Premium Visual Experience Pass (Section 10) — same hover/focus tooltip
 *  pattern as wirePulseTooltip above, one shared element per Outlook
 *  instance. The horizon's trip markers previously only had a native
 *  `title` attribute (no keyboard access, inconsistent with the Pulse's
 *  own richer tooltip) — this closes that gap using the exact same
 *  mechanism, not a new one. */
function wireHorizonTooltip(root) {
  const horizonEl = root.querySelector('.wsp-horizon');
  if (!horizonEl) return;
  let tip = horizonEl.querySelector('.wsp-horizon__tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'wsp-horizon__tooltip';
    tip.setAttribute('role', 'status');
    horizonEl.appendChild(tip);
  }
  const show = (marker) => {
    tip.textContent = marker.dataset.horizonLabel || '';
    tip.style.left = marker.style.left;
    tip.classList.add('wsp-horizon__tooltip--visible');
    clampTooltipToViewport(tip);
  };
  const hide = () => tip.classList.remove('wsp-horizon__tooltip--visible');
  horizonEl.querySelectorAll('.wsp-horizon__marker--trip').forEach((marker) => {
    marker.addEventListener('mouseenter', () => show(marker));
    marker.addEventListener('mouseleave', hide);
    marker.addEventListener('focus', () => show(marker));
    marker.addEventListener('blur', hide);
  });
}

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
/** Phase 7G.3 — sub-scores are documented as 0-100 by contract, but two of
 *  the five score-engine helpers (vehicleUtilScore, requestScore in
 *  executive-score-engine.js) return an un-rounded ratio*100 (e.g.
 *  98.57142857142858 for a 69/70 ratio) while their siblings (driverOpsScore,
 *  engineeringOpsScore, pettyCashHealthScore) already Math.round() — an
 *  inconsistency in the engine. Fixed at display time only, never by
 *  changing the engine: calculateScore()'s own blended result is already
 *  Math.round()'d regardless of whether its inputs were pre-rounded, so this
 *  is a presentation fix with no calculation-behavior change. */
function fmtScore(score) {
  return score == null ? '—' : Math.round(score);
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

/** Phase 7 (Outlook) — tomorrow's scheduled load, the exact same
 *  `assignments.filter(a => a.date === ymd)` shape facts().tripsToday
 *  already uses, one day ahead. Zero new query — this app IS the
 *  scheduling system, so tomorrow's assignments already exist in
 *  ctx.assignments the moment they're created. Returns the real list (not
 *  just a count) since the Visual Expansion Pass's horizon markers need
 *  each trip's own startTime. */
function tomorrowTrips(ctx) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (ctx.assignments || []).filter(a => a.date === ymd && a.status !== 'cancelled');
}
function tomorrowTripCount(ctx) { return tomorrowTrips(ctx).length; }

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
// Phase 7D — `group` ('op'|'intel') drives the Launcher's two labeled
// sections and each icon's tinted badge color; purely presentational,
// splits the same fixed order at the same point it already conceptually
// separated (fleet/ops destinations vs. intelligence/analysis ones).
const LAUNCHER_DESTINATIONS = [
  { label: 'Driver', icon: 'user', action: 'navDriverOps', visibleFor: ['admin'], group: 'op' },
  { label: 'Teknik', icon: 'maintenance', action: 'navEngineering', visibleFor: ['admin'], group: 'op' },
  { label: 'Kendaraan', icon: 'vehicle', action: 'navVehicles', visibleFor: ['admin'], group: 'op' },
  { label: 'Permintaan', icon: 'file', action: 'navPending', visibleFor: ['admin'], group: 'op' },
  { label: 'Petty Cash', icon: 'pettycash', action: 'navPettyCash', visibleFor: ['admin'], group: 'op' },
  { label: 'Analitik', icon: 'chart', action: 'navAnalyticsDriver', visibleFor: ['admin'], group: 'intel' },
  { label: 'Prediksi', icon: 'trend', action: 'navDriverPrediction', visibleFor: ['admin'], group: 'intel' },
  { label: 'Rekomendasi', icon: 'recommendation', action: 'navRecommendationAccuracy', visibleFor: ['admin'], group: 'intel' },
  { label: 'Simulasi', icon: 'reset', action: 'navDriverPrediction', visibleFor: ['admin'], group: 'intel' },
  // Phase 7 — closes the one real gap found in the audit: navAnalyticsExecutive
  // was already a wired ctx.actions entry (js/app.js buildHomeContext) but had
  // no path FROM the Home briefing itself; Insights -> Executive Analytics
  // (js/components/executive-dashboard.js) is this briefing's own Deep Dive
  // destination — the drill-down page this Outlook/Situation summary points to.
  { label: 'Analitik Eksekutif', icon: 'insights', action: 'navAnalyticsExecutive', visibleFor: ['admin'], group: 'intel' },
];

/** Filters the fixed catalogue by role — a `.filter()` preserves source
 *  order by construction, so this can only ever hide items, never reorder
 *  them. */
function launcherDestinationsFor(role) {
  return LAUNCHER_DESTINATIONS.filter(d => d.visibleFor.includes(role));
}

/** Premium Pass (Section 6) — Decisions' calm empty state. Replaces the old
 *  `lead(msg) + actionBtn(...)` fallback, which read as "a giant empty area
 *  with one sentence and one button" — the exact anti-pattern called out for
 *  this section. Two distinct real states share this shape: "waiting on
 *  prediction data" (neutral — the system genuinely doesn't have enough
 *  data yet) and "nothing needs a decision" (positive — the engine ran and
 *  found nothing actionable). Never used for a genuine decision; those keep
 *  the `.wsp-inbox--tinted` accent surface untouched. */
function decisionCalmState({ icon, title, sub, tone = 'good' }) {
  return `
    <div class="wsp-inbox__calm">
      <span class="wsp-inbox__calm-icon wsp-inbox__calm-icon--${tone}" aria-hidden="true">${anIcon(icon, { size: 20 })}</span>
      <div class="wsp-inbox__calm-body">
        <div class="wsp-inbox__calm-title">${esc(title)}</div>
        <div class="wsp-inbox__calm-sub">${esc(sub)}</div>
      </div>
      ${actionBtn('Buka Prediksi', 'navDriverPrediction', { variant: 'link' })}
    </div>`;
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
      // Command Panel Pass (7G) — grown from 108/8 to 156/12: the approved
      // design makes readiness the Hero's focal visualization again, sized
      // to hold its own beside the headline rather than reading as a small
      // supporting badge. renderRingGauge's viewBox scales proportionally
      // with `size`, so CSS width/height overrides at narrower breakpoints
      // (workspace-styles.js) scale the whole gauge — including this
      // stroke thickness — cleanly, without a second size to maintain.
      const ring = renderRingGauge({ value: ringValue, size: 156, thickness: 12, color: `var(--wsp-${headline.tone})`, track: 'var(--border-faint)' });

      // Phase 1 — Operational Pulse: the metrics that communicate NOW
      // (Snapshot owns Today/Week/Month, never duplicated here). "Status
      // Armada" is dropped from this row on purpose — it's already covered
      // by the ring/score itself and by the explainability disclosure
      // directly below, so keeping it here only added density without
      // adding clarity. Trip Hari Ini (v1.30.10.x) reuses facts().tripsToday
      // — the exact same assignments.filter(date===todayYmd) expression
      // buildInsight() already computes for its own workload sentence.
      // Phase 7D — icon + tone per fact (was plain text): a colored icon
      // badge per operational fact, matching the approved richer direction.
      const stats = [
        { key: 'vehicles', lbl: 'Kendaraan Siap', big: n(f.dk.activeVehicles), icon: 'car', tone: 'brand' },
        { key: 'drivers', lbl: 'Driver Aktif', big: n(f.dk.activeDrivers), icon: 'user', tone: 'info' },
        { key: 'pending', lbl: 'Permintaan Tertunda', big: f.pending, icon: 'file', tone: 'warn' },
        { key: 'trips', lbl: 'Trip Hari Ini', big: f.tripsToday, icon: 'trend', tone: 'good' },
      ];

      // v1.21.0/v1.22.0 Explainability — now secondary, behind a disclosure.
      const breakdown = (f.ex && f.ex.scoreBreakdown && f.ex.scoreBreakdown.components) || [];
      const breakdownRows = breakdown.map(c => `
        <div class="wsp-hero__bd-row">
          <span class="wsp-hero__bd-label">${esc(c.label)} <span class="wsp-hero__bd-weight">${esc(c.weightPct)}%</span></span>
          <span class="wsp-hero__bd-value">${esc(fmtScore(c.score))}</span>
        </div>`).join('');
      const explain = explainRows(f, breakdown);
      const explainRowsHtml = explain.map(r => `
        <div class="wsp-hero__explain-row wsp-hero__explain-row--${r.good ? 'good' : 'bad'}">
          <span class="wsp-hero__explain-sign">${r.good ? '+' : '−'}</span>${esc(r.text)}
        </div>`).join('');

      // Command Panel Pass (7G) — the "at a glance" domain layer moves from
      // a vertical dot-strength list nested under the ring to a horizontal
      // bar-meter STRIP spanning the full Command Panel width (matching
      // the approved design's domain health strip). Same source data as
      // before (breakdown.components, score/label/key unchanged, the same
      // EXPLAIN_ISSUE tone check) — only the visual encoding changed, from
      // 5 dots to a proportional bar. The exact weight%/score disclosure
      // below is unaffected and still exists for anyone who wants precise
      // numbers. Renders nothing when breakdown is empty (never a
      // fabricated substitute).
      const domainRows = breakdown
        .filter(c => c.score != null)
        .map(c => {
          const issue = EXPLAIN_ISSUE[c.key] ? EXPLAIN_ISSUE[c.key](f) : false;
          const tone = issue ? 'warn' : 'good';
          const pct = Math.max(0, Math.min(100, c.score));
          return `
            <div class="wsp-hero__domain">
              <div class="wsp-hero__domain-head"><span class="wsp-hero__domain-label">${esc(c.label)}</span><span class="wsp-hero__domain-val">${esc(fmtScore(c.score))}</span></div>
              <div class="wsp-hero__domain-track"><div class="wsp-hero__domain-fill wsp-hero__domain-fill--${tone}" style="width:${pct}%"></div></div>
            </div>`;
        }).join('');

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
        <div class="wsp-hero wsp-hero--${headline.tone}">
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

          <div class="wsp-hero__stats wsp-hero-anim" style="${beat(profile.micro.pulse)}" role="group" aria-label="Status operasional saat ini">
            <span class="wsp-hero__stats-label">Status Operasional</span>
            ${stats.map(s => {
              // v1.30.10.6 — numeric stats count up (mountHeroMotion) the same
              // way the health score already does; a '—' (no-data) stat has
              // nothing to tween and renders as static text, unchanged.
              const numeric = typeof s.big === 'number' && Number.isFinite(s.big);
              return `
              <div class="wsp-hero__stat">
                <span class="wsp-hero__stat-icon wsp-hero__stat-icon--${s.tone}" aria-hidden="true">${anIcon(s.icon, { size: 16 })}</span>
                <span class="wsp-hero__stat-big"${numeric ? ` data-countup="${esc(s.big)}" data-stat-key="${s.key}"` : ''}>${numeric ? '0' : esc(s.big)}</span>
                <span class="wsp-hero__stat-lbl">${esc(s.lbl)}</span>
              </div>`;
            }).join('')}
          </div>

          ${domainRows ? `
          <div class="wsp-hero__domains wsp-hero-anim" style="${beat(profile.micro.pulse)}">
            ${domainRows}
          </div>` : ''}

          ${(() => {
            // Phase 7D — Operational Pulse: today's REAL events (see
            // buildPulseMarks' own header) plotted on a fixed 07:00-19:00
            // axis. Never a forecast, never fabricated — an empty day is an
            // empty axis, not a hidden section.
            const marks = buildPulseMarks(ctx);
            // Premium Pass — a real <button> (was a plain <span>) so every
            // dot is keyboard-focusable, with the tooltip's content sourced
            // straight from data-pulse-* (wirePulseTooltip, above). aria-label
            // carries the same info for assistive tech that never sees the
            // visual tooltip.
            // Phase 7G.4 — active (assignment-start) dots get an extra
            // class driving a CSS-only expanding-ring pulse (see
            // .wsp-pulse__dot--active::before in workspace-styles.js); the
            // aria-label gains a plain-language "(dimulai)" marker so the
            // active state is conveyed to screen readers too, not just
            // visually.
            const dots = marks.map((m, i) => `<button type="button" class="wsp-pulse__dot wsp-pulse__dot--${m.tone}${m.active ? ' wsp-pulse__dot--active' : ''}" style="left:${m.leftPct.toFixed(1)}%;animation-delay:${i * 50}ms" data-pulse-time="${esc(fmtTime(m.ts))}" data-pulse-domain="${esc(m.domainLabel)}" data-pulse-sentence="${esc(m.sentence)}" aria-label="${esc(fmtTime(m.ts))} — ${esc(m.domainLabel)} — ${esc(m.sentence)}${m.active ? ' (dimulai)' : ''}"></button>`).join('');
            // Visual Expansion Pass — a "now" marker, the one element in the
            // Pulse allowed to animate continuously (a slow pulsing dot) —
            // every event dot above stays static once its one-time pop-in
            // finishes. Real current time, same clamp-to-window math as
            // every event dot; simply omitted (not clamped to an edge) when
            // now falls outside the 07:00-19:00 window, since a marker
            // sitting at the axis edge claiming to be "now" at 22:00 would
            // mislead rather than inform.
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const nowInWindow = nowMin >= PULSE_WINDOW_START_MIN && nowMin <= PULSE_WINDOW_END_MIN;
            const nowPct = nowInWindow ? ((nowMin - PULSE_WINDOW_START_MIN) / (PULSE_WINDOW_END_MIN - PULSE_WINDOW_START_MIN)) * 100 : null;
            const nowMarker = nowPct != null
              ? `<div class="wsp-pulse__now" style="left:${nowPct.toFixed(1)}%" aria-hidden="true"><span class="wsp-pulse__now-dot"></span></div>`
              : '';
            return `
          <div class="wsp-pulse wsp-hero-anim" style="${beat(profile.micro.pulse)}">
            <div class="wsp-pulse__label">Timeline Operasional — Hari Ini</div>
            <div class="wsp-pulse__axis">
              <div class="wsp-pulse__line"></div>
              ${dots}
              ${nowMarker}
            </div>
            <div class="wsp-pulse__ticks"><span>07:00</span><span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span><span>17:00</span></div>
            <div class="wsp-pulse__legend">
              <span class="wsp-pulse__legend-item"><span class="wsp-pulse__legend-dot wsp-pulse__dot--brand"></span>Operasional Driver</span>
              <span class="wsp-pulse__legend-item"><span class="wsp-pulse__legend-dot wsp-pulse__dot--intel"></span>Teknik</span>
              <span class="wsp-pulse__legend-item"><span class="wsp-pulse__legend-dot wsp-pulse__dot--warn"></span>Permintaan</span>
            </div>
          </div>`;
          })()}

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
    onMount(bodyEl, ctx) { mountHeroMotion(bodyEl, ctx); wirePulseTooltip(bodyEl); },
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

      // v1.30.10.x — `domain` labels the SUBJECT of the item (matching the
      // consolidated Today/Operations/Warehouse/Finance/Engineering/
      // Insights/Control IA — see js/shell/domain-shell.js), not necessarily
      // the specific screen `action` deep-links to. Presentational only —
      // the item's real destination/behavior via `action` is unchanged.
      const criticalVehicleList = f.rec.board?.critical || [];
      if (criticalVehicleList.length > 0) {
        const top = criticalVehicleList[0];
        const suffix = criticalVehicleList.length > 1 ? ` (+${criticalVehicleList.length - 1} lainnya)` : '';
        items.push({ sev: 'critical', domain: 'Operations', title: `${top.vehicleName} — ${top.categoryLabel}${suffix}`, reason: top.reason, action: 'navDriverPrediction', actionLabel: 'Tinjau Armada' });
      }
      if (f.engOverdue > 0) items.push({ sev: classifyEngineeringOverdue(f.engOverdue).critical ? 'critical' : 'warn', domain: 'Engineering', title: `${f.engOverdue} pekerjaan Teknik melewati batas waktu`, reason: 'Penugasan teknik melewati batas waktu penyelesaian.', action: 'navEngineering', actionLabel: 'Tinjau Teknik' });
      if (f.pendingVerify > 0) {
        const top = f.engUnverifiedList[0];
        const suffix = f.pendingVerify > 1 ? ` (+${f.pendingVerify - 1} lainnya)` : '';
        items.push({ sev: 'warn', domain: 'Engineering', title: `Verifikasi Pekerjaan — ${top.title}${suffix}`, reason: 'Pekerjaan Teknik selesai namun belum diverifikasi koordinator.', action: 'navEngineering', actionLabel: 'Verifikasi Laporan' });
      }
      if (f.pending > 0) {
        const label = f.topPendingRequest.purpose || f.topPendingRequest.destination || f.topPendingRequest.requesterName || 'Bidang';
        const suffix = f.pending > 1 ? ` (+${f.pending - 1} lainnya)` : '';
        items.push({ sev: 'warn', domain: 'Operations', title: `Setujui Permintaan — ${label}${suffix}`, reason: 'Permintaan bidang menunggu keputusan admin.', action: 'navPending', actionLabel: 'Tinjau Permintaan' });
      }
      if (f.atRiskDrivers > 0) items.push({ sev: 'warn', domain: 'Operations', title: `${f.atRiskDrivers} driver berisiko kelelahan/burnout`, reason: 'Beban kerja driver melewati ambang aman dalam periode berjalan.', action: 'navAnalyticsDriver', actionLabel: 'Tinjau Wellness' });
      if (f.pettyLow) items.push({ sev: 'critical', domain: 'Finance', title: 'Saldo petty cash rendah', reason: 'Saldo siklus berjalan berada di bawah ambang notifikasi.', action: 'navPettyCash', actionLabel: 'Tinjau Petty Cash' });

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

      // Command Panel Pass (7G) — a warm-tinted elevated panel (was
      // de-boxed/flat), the same "genuinely distinct executive surface"
      // treatment Decision already earned in an earlier phase — Attention
      // and Decision must read as different objects (urgency vs. action),
      // not as two plain text sections. Real severity data unchanged.
      return `<div class="wsp-attn wsp-attn--panel">${summary}${rankedList(visible)}${disclosure}</div>`;
    },
    onMount(bodyEl) {
      suppressReplayAfterFirstMount(bodyEl, 'wspAttnRowsMounted', '.wsp-sevrow');
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
        return decisionCalmState({
          icon: 'history',
          title: 'Menunggu data prediksi',
          sub: 'Rekomendasi tersedia setelah data prediksi mencukupi.',
          tone: 'neutral',
        });
      }
      const items = (rec.recs || [])
        .filter(r => r.actionable && r.category !== 'none' && r.category !== 'fleet-optimization')
        .slice()
        .sort((a, b) => (a.priority?.rank ?? 9) - (b.priority?.rank ?? 9));
      if (!items.length) {
        const msg = (rec.positive && rec.positive.messages && rec.positive.messages[0]) || 'Armada beroperasi normal.';
        return decisionCalmState({ icon: 'check', title: 'Tidak ada tindakan yang diperlukan', sub: msg });
      }

      // v1.22.2 Objective 6's Decision Center hierarchy, reused verbatim: only
      // the single top (highest-priority) action is ever "primary" — every
      // other action, visible or behind disclosure, is "secondary". Reason
      // and Impact are two DISTINCT, labeled lines (not merged into one) per
      // the Decision Center contract: Action / Reason / Impact / Priority
      // must each be independently identifiable within 10 seconds.
      //
      // v1.30.9.14 (V1 Redesign Phase 2) — Dismiss added per the mockup's
      // Accept/Dismiss pair. Scoped deliberately: this engine's recs are
      // navigational ("go look at Prediction"), not auto-executable actions
      // (there is no "assign Vehicle C to the 14:00 request" endpoint this
      // widget can safely call sight-unseen) — inventing a fake data-mutating
      // "Accept" would be worse than not having one. "Tinjau Prediksi" is
      // kept as the real action (styled primary, matching the mockup's
      // Accept weight); "Dismiss" is a genuine session-local hide (a Set on
      // bodyEl, gone on reload) — it touches no stored data, matching what
      // this widget can honestly promise today.
      const dismissKey = (r) => `${r.category || ''}:${r.title}`;
      const row = (r, variant) => `
        <div class="wsp-inbox__item wsp-inbox__item--${variant} fade-up" data-reco-key="${esc(dismissKey(r))}">
          <div class="wsp-inbox__top">${pill(r.priority?.label || 'Prioritas', engineTone(r.priority?.tone))}</div>
          <div class="wsp-inbox__title">${esc(r.title)}</div>
          <div class="wsp-inbox__explain">
            <div class="wsp-inbox__explain-row"><span class="wsp-inbox__explain-label">Alasan</span>${esc(r.reason)}</div>
            <div class="wsp-inbox__explain-row"><span class="wsp-inbox__explain-label">Dampak</span>${esc(r.expectedBenefit || r.estimatedImpact?.label || '—')}</div>
          </div>
          <div class="wsp-inbox__row-actions">
            ${actionBtn('Tinjau Prediksi', 'navDriverPrediction', { variant: 'primary' })}
            <button type="button" class="wsp-btn wsp-btn--ghost" data-reco-dismiss="${esc(dismissKey(r))}">Abaikan</button>
          </div>
        </div>`;

      const visible = items.slice(0, RECOMMENDATION_VISIBLE_CAP);
      const rest = items.slice(RECOMMENDATION_VISIBLE_CAP);
      const visibleHtml = visible.map((r, i) => row(r, i === 0 ? 'primary' : 'secondary')).join('');
      const disclosure = rest.length ? `
        <div class="wsp-reco__more" data-reco-more>${rest.map(r => row(r, 'secondary')).join('')}</div>
        <button type="button" class="wsp-reco__toggle" data-reco-toggle aria-expanded="false">Lihat ${esc(rest.length)} tindakan lainnya</button>` : '';

      // Phase 7D — a tinted surface is back for Decisions specifically (the
      // brief explicitly reverses Phase 7B's "de-box everything": a
      // recommendation is a genuinely distinct object, "management can act
      // on this," so it earns a considered accent-tinted card again).
      return `<div class="wsp-inbox wsp-inbox--tinted">${visibleHtml}${disclosure}</div>`;
    },
    onMount(bodyEl) {
      suppressReplayAfterFirstMount(bodyEl, 'wspRecoRowsMounted', '.wsp-inbox__item');
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

      // v1.30.9.14 — session-local Dismiss. __wspRecoDismissed persists on
      // bodyEl (the same node across a live refresh, only innerHTML is
      // rebuilt — the established Realtime Continuity pattern this file
      // uses everywhere else), re-applied on every mount so a dismissal
      // survives a Firebase-triggered re-render but not a reload.
      if (!bodyEl.__wspRecoDismissed) bodyEl.__wspRecoDismissed = new Set();
      bodyEl.querySelectorAll('[data-reco-key]').forEach(el => {
        if (bodyEl.__wspRecoDismissed.has(el.dataset.recoKey)) el.style.display = 'none';
      });
      bodyEl.querySelectorAll('[data-reco-dismiss]').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.dataset.recoDismiss;
          bodyEl.__wspRecoDismissed.add(key);
          bodyEl.querySelector(`[data-reco-key="${CSS.escape(key)}"]`)?.style.setProperty('display', 'none');
        });
      });
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
      // Phase 7D — `tone` per tile (was untoned). `barPct` is computed below,
      // per-panel, relative to the LARGEST of these same 5 values in that
      // same period — an honest same-unit comparison, never a percentage of
      // an invented total (per the brief's absolute "never fabricate" rule).
      const TILE_META = [
        { key: 'trip', title: 'Penugasan Dijalankan', desc: 'Total penugasan terjadwal pada periode ini', tone: 'brand' },
        { key: 'completed', title: 'Penugasan Selesai', desc: 'Penugasan yang telah diselesaikan driver', tone: 'good' },
        { key: 'vehicles', title: 'Kendaraan Terpakai', desc: 'Kendaraan unik yang digunakan', tone: 'info' },
        { key: 'engReports', title: 'Laporan Teknik Selesai', desc: 'Pekerjaan Teknik yang selesai', tone: 'intel' },
        { key: 'reqResolved', title: 'Permintaan Diproses', desc: 'Permintaan bidang yang telah diputuskan', tone: 'warn' },
      ];

      const segButtons = PERIODS.map((p, i) => `
        <button type="button" role="tab" id="wsp-seg-${p.key}" class="wsp-segmented__btn${i === 0 ? ' wsp-segmented__btn--active' : ''}"
          data-wsp-seg="${p.key}" aria-selected="${i === 0}" aria-controls="wsp-panel-${p.key}" tabindex="${i === 0 ? '0' : '-1'}">${esc(p.segLabel)}</button>`).join('');

      // Phase 7B (Executive Experience Refinement) — de-boxed metric() tiles
      // (the same shared primitive Outlook's "Trip Terjadwal Besok" already
      // uses) replace the old `.wsp-summary` boxed-tile grid: one flowing
      // operational readout instead of 5 independent KPI cards. Same 5
      // values, same descriptions, same period-switching — presentation only.
      const panels = PERIODS.map((p, i) => {
        const maxVal = Math.max(1, ...TILE_META.map(m => p.values[m.key]));
        return `
        <div class="wsp-snapshot__panel" id="wsp-panel-${p.key}" data-snapshot-panel="${p.key}" role="tabpanel" aria-labelledby="wsp-seg-${p.key}"${i === 0 ? '' : ' hidden'}>
          ${metricRow(TILE_META.map(m => metric(m.title, p.values[m.key], { sub: m.desc, countUp: true, tone: m.tone, barPct: (p.values[m.key] / maxVal) * 100, barKey: `${p.key}:${m.key}` })).join(''))}
        </div>`;
      }).join('');

      // Phase 7 (Executive Command Center Rebuild) — the day-over-day
      // Insight sentence (topInsightLine()) moved to the new Outlook zone
      // (exec-outlook, below): it's a trend statement, which fits "what
      // should I expect next" better than "what happened," and Snapshot
      // itself becomes purely a period-scoped facts panel. Computed exactly
      // the same way, by the same functions — relocated, not removed.

      // Phase 7B — the one genuinely clickable tile here (a nav action, not
      // a KPI readout) becomes a list row matching Drivers/Vehicle Flags'
      // vocabulary instead of a standalone KPI box.
      const pendingRow = list(listRow({
        title: 'Permintaan Tertunda',
        trailing: f.pending > 0 ? `${f.pending} · Menunggu` : 'Bersih',
        tone: f.pending > 0 ? 'warn' : 'good',
        action: 'navPending',
      }));

      return `
        <div class="wsp-segmented" role="tablist" aria-label="Pilih periode Snapshot Operasional" data-wsp-segmented>${segButtons}</div>
        <div class="wsp-snapshot__panels">${panels}</div>
        ${pendingRow}`;
    },
    onMount(bodyEl) {
      wireSnapshotSegmented(bodyEl);
      const saved = bodyEl.dataset.wspActivePeriod;
      if (saved && saved !== 'hari') applySnapshotPeriod(bodyEl, saved, false);
      else bodyEl.dataset.wspActivePeriod = 'hari';
      mountCountUp(bodyEl, 'wspSnapshotCountedUp');
      mountBarReveal(bodyEl, '.wsp-metric__bar-fill');
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
      const raw = todaysStoryItems(ctx);
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

  /* ── Drivers now ── (v1.30.9.14, V1 Redesign Phase 2: Admin Home mockup's
     "Drivers" list — who is doing what right now, colored by the vehicle
     they're currently paired with. Status is derived directly from
     ctx.assignments (already loaded, same pattern exec-snapshot's own
     render() already uses for its own date-range filtering) — no new
     engine, no new Firebase read. Vehicle color reuses each vehicle's
     existing `.color` field; shape is the net-new axis from
     utils/vehicle-identity.js. */
  'exec-drivers': {
    render(ctx) {
      const driversList = ctx.drivers || [];
      if (!driversList.length) return empty('Belum ada driver aktif.');

      const vehicles = ctx.vehicles || [];
      const shapeMap = buildVehicleShapeMap(vehicles);
      const vehicleByName = new Map(vehicles.map(v => [v.name, v]));

      const todayYmd = new Date().toISOString().slice(0, 10);
      const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
      const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };

      const todays = (ctx.assignments || []).filter(a => a.date === todayYmd && a.status !== 'cancelled');

      // Phase 7D — `mine.length` (today's assignment count for this driver)
      // is real, already-loaded data — the same array this widget already
      // filters to find in-trip/upcoming status, just counted instead of
      // searched. Used as a comparative bar (relative to the busiest driver
      // shown), never a fabricated workload/fatigue score.
      const perDriver = driversList.map(d => {
        const mine = todays.filter(a => a.driver === d.name);
        const inTrip = mine.find(a => {
          const s = toMin(a.startTime), e = toMin(a.endTime);
          return s != null && e != null && nowMin >= s && nowMin < e;
        });
        const upcoming = mine.find(a => { const s = toMin(a.startTime); return s != null && s > nowMin; });
        const active = inTrip || upcoming;
        const vehicle = active ? vehicleByName.get(active.vehicle) : null;
        const dotStyle = vehicle
          ? `background:${esc(vehicle.color || '#9a9a9a')};${vehicleShapeCss(shapeMap.get(vehicle.name) || 'rounded')}`
          : '';
        const tone = inTrip ? 'good' : upcoming ? 'info' : 'neutral';
        const status = mine.length > 0 ? `${mine.length} trip hari ini` : (inTrip ? 'Dalam perjalanan' : upcoming ? 'Terjadwal' : 'Tidak bertugas');
        return { name: d.name, tripCount: mine.length, dotStyle, tone, status };
      });
      const maxTrips = Math.max(1, ...perDriver.map(d => d.tripCount));

      const rows = perDriver.map(d => `
        <div class="wsp-driver-row">
          <span class="wsp-row__dot wsp-row__dot--${esc(d.tone)}" style="${esc(d.dotStyle)}" aria-hidden="true"></span>
          <span class="wsp-driver-row__name">${esc(d.name)}</span>
          <span class="wsp-driver-row__bar-track"><span class="wsp-driver-row__bar-fill wsp-driver-row__bar-fill--${esc(d.tone)}" data-bar-target="${((d.tripCount / maxTrips) * 100).toFixed(0)}" data-bar-key="${esc(d.name)}" style="width:0%"></span></span>
          <span class="wsp-driver-row__status">${esc(d.status)}</span>
        </div>`);

      return `<div class="wsp-driver-list">${rows.join('')}</div>`;
    },
    onMount(bodyEl) {
      mountBarReveal(bodyEl, '.wsp-driver-row__bar-fill');
    },
  },

  /* ── Vehicle flags ── (v1.30.9.14, V1 Redesign Phase 2: Admin Home
     mockup's "Vehicle flags" list. Reuses the certified Vehicle Core
     pipeline verbatim via ctx.vehicleFlags (computed once in
     buildHomeContext(), same computeFleetAssetModel → reminder-engine path
     the Fleet drawer's own Reminders tab already runs) — this widget only
     renders what it's given, no new compliance/maintenance logic. */
  'exec-vehicle-flags': {
    render(ctx) {
      const vf = ctx.vehicleFlags;
      if (!vf || !vf.top || !vf.top.length) {
        return compactSuccessLine('Tidak ada kendaraan yang memerlukan tindakan.');
      }
      const vehicles = ctx.vehicles || [];
      const shapeMap = buildVehicleShapeMap(vehicles);
      const vehicleById = new Map(vehicles.map(v => [v.id, v]));

      // Phase 7D — Fleet vehicle cards replace the plain list rows: each
      // vehicle is a real operational entity ("cards are earned" per the
      // brief), not just a status line. Same certified data (r.reason is
      // the Reminder Engine's own sentence, e.g. "Servis terlewat 5 hari"
      // — reused verbatim, not re-derived) — presentation only.
      const cards = vf.top.map(r => {
        const vehicle = vehicleById.get(r.vehicleId);
        const dotStyle = vehicle
          ? `background:${esc(vehicle.color || '#9a9a9a')};${vehicleShapeCss(shapeMap.get(vehicle.name) || 'rounded')}`
          : '';
        const tone = engineTone(r.tone);
        // Same category-error guard exec-vehicle-flags has always had:
        // ctx.actions.openDetail() only resolves assignment ids.
        // openVehicleDetail (Phase 7) is the correctly-typed deep link to
        // the canonical Vehicle Detail Drawer.
        const clickable = !!vehicle;
        const tag = clickable ? 'button' : 'div';
        const attrs = clickable ? ` type="button" data-wsp-action="openVehicleDetail" data-wsp-arg="${esc(r.vehicleId)}"` : '';
        return `
          <${tag} class="wsp-fleet-card wsp-fleet-card--${tone}"${attrs}>
            <div class="wsp-fleet-card__top">
              <span class="wsp-fleet-card__icon" aria-hidden="true">${anIcon('vehicle', { size: 15 })}</span>
              <span class="wsp-fleet-card__dot" style="${esc(dotStyle)}" aria-hidden="true"></span>
            </div>
            <div class="wsp-fleet-card__name">${esc(r.vehicleName)} · ${esc(r.typeLabel)}</div>
            <span class="wsp-fleet-card__status wsp-fleet-card__status--${tone}">${esc(r.statusLabel)}</span>
            ${r.reason ? `<div class="wsp-fleet-card__reason">${esc(r.reason)}</div>` : ''}
          </${tag}>`;
      });
      return `<div class="wsp-fleet-grid">${cards.join('')}</div>` + actionBtn('Buka Manajemen Kendaraan', 'navVehicles', { variant: 'ghost' });
    },
  },

  /* ── Outlook ── (Phase 7, Executive Command Center Rebuild: "what should I
     expect next" — the one question the pre-Phase-7 briefing never
     answered. Three lines, nothing invented:
       1) the day-over-day Insight sentence (topInsightLine, unchanged
          computation) relocated here from Snapshot — a trend statement
          belongs to Outlook, not "what happened this period";
       2) ctx.recommendations.board.upcoming — the certified Fleet
          Recommendation Engine's preventive/monitoring-tier vehicles.
          Already computed every render (buildExecutiveRecommendations(),
          js/app.js), deliberately excluded from Attention (non-actionable
          tier — see exec-attention's own comment) and, until this phase,
          never surfaced anywhere in the Home briefing at all;
       3) tomorrow's scheduled trip count (tomorrowTripCount) — the only
          net-new computation in this widget, and it's a one-line filter
          over data already in ctx.assignments, not a forecast. */
  'exec-outlook': {
    render(ctx) {
      const f = facts(ctx);
      const insightLine = topInsightLine(ctx) || 'Data historis belum cukup untuk menghasilkan wawasan perbandingan.';
      const trips = tomorrowTrips(ctx);
      const tomorrow = trips.length;
      const upcoming = (f.rec.certified && f.rec.board?.upcoming) || [];

      const loadRow = metricRow(metric('Trip Terjadwal Besok', tomorrow, { tone: tomorrow > 0 ? 'info' : 'neutral', countUp: true }));

      const upcomingBody = upcoming.length
        ? list(upcoming.slice(0, 3).map(r => listRow({
            title: `${r.vehicleName} — ${r.categoryLabel}`,
            meta: r.reason,
            trailing: r.timeline?.label || '',
            tone: 'info',
          })).join(''))
        : compactSuccessLine('Tidak ada kendaraan dalam jendela pemantauan preventif.');

      // Visual Expansion Pass (Section 11) — a real marker per scheduled
      // trip (was one fixed decorative dot at a hardcoded 38%). "Hari Ini"
      // is the horizon's left half, "Besok" its right half; a trip with a
      // real startTime is placed within the right half using the exact
      // same 07:00-19:00 operational-window math the Pulse strip already
      // establishes as this app's convention. A trip with no recorded
      // startTime still gets a marker (it's real — it's just not
      // time-placed) at the "Besok" half's own midpoint, rather than being
      // silently dropped. Zero trips tomorrow means zero markers, honestly
      // — never a placeholder standing in for data that doesn't exist.
      const toStartMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
      const tripMarkers = trips.map((a) => {
        const min = toStartMin(a.startTime);
        const pct = min != null
          ? 50 + Math.max(0, Math.min(1, (min - PULSE_WINDOW_START_MIN) / (PULSE_WINDOW_END_MIN - PULSE_WINDOW_START_MIN))) * 50
          : 75;
        const label = a.startTime ? `Terjadwal ${a.startTime}` : 'Terjadwal besok';
        return `<button type="button" class="wsp-horizon__marker wsp-horizon__marker--trip" style="left:${pct.toFixed(1)}%" data-horizon-label="${esc(label)}" aria-label="${esc(label)}"></button>`;
      }).join('');
      const horizon = `
        <div class="wsp-horizon">
          <div class="wsp-horizon__fill"></div>
          <div class="wsp-horizon__marker wsp-horizon__marker--now" style="left:0%"></div>
          ${tripMarkers}
        </div>
        <div class="wsp-horizon__labels"><span>Hari Ini</span><span>Besok</span></div>`;

      return `
        ${horizon}
        <p class="wsp-insight">${esc(insightLine)}</p>
        ${loadRow}
        <div class="wsp-snapshot-period__label">Pemantauan Preventif</div>
        ${upcomingBody}`;
    },
    onMount(bodyEl) { mountCountUp(bodyEl, 'wspOutlookCountedUp'); wireHorizonTooltip(bodyEl); },
  },

  /* ── Executive Launcher ── (Phase 6: the exit point of the briefing, not
     another decision surface — "where do I go next," never "what should I
     do." Fixed 9-destination order (LAUNCHER_DESTINATIONS above), genuinely
     role-filtered via ctx.role (see that const's comment for why this is a
     no-op today).

     v1.30.10.6 — rebuilt as a quiet destination grid (launcherGrid, ui-kit.js)
     instead of a row of bordered/filled .wsp-chip pills: the reference spec
     explicitly calls out "a giant pill collection" as the anti-pattern to
     avoid for this exact section. Same 9 destinations, same icons
     (anIcon()), same data-wsp-action click contract — presentation only. */
  'exec-quick': {
    render(ctx) {
      const items = launcherDestinationsFor(ctx?.role);
      if (!items.length) return empty('Tidak ada tujuan yang tersedia untuk peran ini.');
      const mapped = items.map(d => ({ label: d.label, action: d.action, icon: anIcon(d.icon, { size: 18 }), group: d.group }));
      // Phase 7D — "app switcher", not one flat icon row: split into the
      // same two groups LAUNCHER_DESTINATIONS already carries, each with
      // its own tinted icon badge color.
      return launcherGroups([
        { id: 'op', label: 'Operasional', tint: 'op', items: mapped.filter(d => d.group === 'op') },
        { id: 'intel', label: 'Intelijen', tint: 'intel', items: mapped.filter(d => d.group === 'intel') },
      ]);
    },
  },
};
