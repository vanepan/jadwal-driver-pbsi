/* ============================================================
   WIDGETS/EXECUTIVE/NARRATIVE-BUILDER.JS — v1.22.4 Executive Narrative
   Intelligence

   Replaces the old fixed if/else heroHeadline()/heroInsight() chain with a
   small deterministic pipeline: collect per-domain findings from the SAME
   already-certified facts() the Hero already reads → rank them → compose a
   headline + a Situation/Impact/Recommendation body. PURE presentation: no
   new data reads, no engine/Firebase/Store coupling, no randomization — the
   same operational state always produces the same narrative.
   ============================================================ */

'use strict';

import { priorityRank } from '../../recommendation/recommendation-priority.js';

/** Indonesian-comma join: a / a dan b / a, b, dan c. */
function joinNatural(items) {
  const list = items.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} dan ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, dan ${list[list.length - 1]}`;
}

/* ── Domain finding definitions ──────────────────────────────────────────
   One entry per domain. `trigger(f)` decides whether the domain has a
   finding at all; `severity(f)` (only called when triggered) picks the
   PRIORITY_LEVELS key; `situation(f)`/`recommendation` are plain phrases —
   never fabricated, always driven by the real count in `f`. `order` is the
   deterministic tie-break when two findings share a severity rank. */
const DOMAINS = [
  {
    key: 'vehicle', order: 0,
    trigger: (f) => f.criticalVehicles > 0,
    severity: () => 'critical',
    situation: (f) => f.criticalVehicles === 1
      ? 'satu kendaraan memasuki jadwal perawatan kritis'
      : `${f.criticalVehicles} kendaraan memasuki jadwal perawatan kritis`,
    recommendation: () => 'maintenance kendaraan yang kritis',
    healthy: 'seluruh armada siap digunakan',
  },
  {
    key: 'pettyCash', order: 1,
    trigger: (f) => f.pettyLow,
    severity: () => 'critical',
    situation: () => 'saldo petty cash mendekati batas minimum',
    recommendation: () => 'pengisian ulang saldo petty cash',
    healthy: 'saldo petty cash dalam kondisi aman',
  },
  {
    key: 'engineeringOverdue', order: 2,
    trigger: (f) => f.engOverdue > 0,
    severity: (f) => f.engOverdue >= 3 ? 'critical' : 'high',
    situation: (f) => f.engOverdue === 1
      ? 'satu pekerjaan engineering melewati batas waktu penyelesaian'
      : `${f.engOverdue} pekerjaan engineering melewati batas waktu penyelesaian`,
    recommendation: () => 'penyelesaian pekerjaan engineering yang overdue',
    healthy: 'seluruh pekerjaan engineering berada dalam target',
  },
  {
    key: 'request', order: 3,
    trigger: (f) => f.pending > 0,
    severity: (f) => f.pending >= 3 ? 'high' : 'medium',
    situation: (f) => f.pending === 1
      ? 'satu permintaan masih menunggu persetujuan'
      : `${f.pending} permintaan masih menunggu persetujuan`,
    recommendation: () => 'penyelesaian approval yang tertunda',
    healthy: 'seluruh permintaan telah diproses',
  },
  {
    key: 'engineeringVerify', order: 4,
    trigger: (f) => f.pendingVerify > 0,
    severity: () => 'medium',
    situation: (f) => f.pendingVerify === 1
      ? 'satu laporan pekerjaan menunggu verifikasi'
      : `${f.pendingVerify} laporan pekerjaan menunggu verifikasi`,
    recommendation: () => 'verifikasi laporan pekerjaan teknisi',
    healthy: null, // covered by engineeringOverdue's healthy phrase
  },
  {
    key: 'driver', order: 5,
    trigger: (f) => f.atRiskDrivers > 0,
    severity: (f) => f.atRiskDrivers >= 3 ? 'high' : 'medium',
    situation: (f) => f.atRiskDrivers === 1
      ? 'satu driver telah memasuki zona kelelahan/burnout'
      : `${f.atRiskDrivers} driver telah memasuki zona kelelahan/burnout`,
    recommendation: () => 'redistribusi beban kerja driver',
    healthy: 'seluruh driver bekerja dalam batas aman',
  },
];

/** One finding per triggered domain, ranked most-urgent first, deterministic
 *  tie-break by domain `order` (never randomized — Objective 9). */
function collectFindings(f) {
  return DOMAINS
    .filter(d => d.trigger(f))
    .map(d => ({
      key: d.key, order: d.order,
      severity: d.severity(f),
      rank: priorityRank(d.severity(f)),
      situation: d.situation(f),
      recommendation: d.recommendation(f),
    }))
    .sort((a, b) => (a.rank - b.rank) || (a.order - b.order));
}

/** Healthy-domain phrases for domains that have NO finding — used for
 *  positive balancing (warning state) and the full rundown (healthy state).
 *  Only ever includes a phrase when the underlying fact is actually clean. */
function healthyPhrasesExcluding(findings) {
  const found = new Set(findings.map(x => x.key));
  return DOMAINS
    .filter(d => d.healthy && !found.has(d.key))
    .sort((a, b) => a.order - b.order)
    .map(d => d.healthy);
}

function classifyState(findings, score) {
  if (findings.some(x => x.severity === 'critical')) return 'critical';
  if (findings.length > 0) return 'warning';
  if (!score || score.value == null) return 'neutral';
  if (score.level === 'high') return 'healthy';
  if (score.level === 'medium') return 'good';
  // Score exists and is below "stabil" (low/insufficient) but no single
  // domain crossed its own threshold — a genuine state, not an omission:
  // brief on the score itself rather than fabricate a specific domain cause.
  return 'warning';
}

const HEADLINE_BY_STATE = {
  critical: { prefix: 'Operasional', highlight: 'memerlukan intervensi segera', tone: 'danger' },
  warning: { prefix: 'Operasional', highlight: 'memerlukan perhatian', tone: 'warn' },
  good: { prefix: 'Operasional hari ini berjalan', highlight: 'stabil', tone: 'info' },
  healthy: { prefix: 'Operasional berjalan', highlight: 'sangat baik', tone: 'good' },
  neutral: { prefix: 'Data operasional', highlight: 'belum tersedia', tone: 'neutral' },
};

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function buildBody(state, findings) {
  const top = findings.slice(0, 2);

  if (state === 'critical') {
    const situation = capitalize(joinNatural(top.map(x => x.situation)));
    const recs = joinNatural(top.map(x => x.recommendation));
    return `${situation}. Prioritaskan ${recs}.`;
  }

  if (state === 'warning') {
    if (top.length === 0) {
      // Score-driven warning, no single domain crossed its own threshold —
      // brief on the score itself rather than invent a specific cause.
      return 'Skor kesiapan operasional berada di bawah target meski tidak ditemukan isu spesifik pada satu domain. Disarankan meninjau rincian skor kesiapan operasional.';
    }
    const situation = capitalize(joinNatural(top.map(x => x.situation)));
    const positives = healthyPhrasesExcluding(findings).slice(0, 2);
    const recs = joinNatural(top.map(x => x.recommendation));
    const clause = positives.length ? `, namun ${joinNatural(positives)}` : '';
    return `${situation}${clause}. Disarankan melakukan ${recs}.`;
  }

  if (state === 'healthy') {
    const HEALTHY_RUNDOWN_KEYS = new Set(['vehicle', 'request', 'engineeringOverdue']);
    const rundownPhrases = DOMAINS
      .filter(d => d.healthy && HEALTHY_RUNDOWN_KEYS.has(d.key))
      .sort((a, b) => a.order - b.order)
      .map(d => d.healthy);
    const rundown = capitalize(joinNatural([
      ...rundownPhrases,
      'tidak ditemukan risiko operasional yang memerlukan perhatian khusus',
    ]));
    return `${rundown}. Tidak diperlukan tindakan tambahan.`;
  }

  if (state === 'good') {
    return 'Operasional berjalan normal hari ini, seluruh domain utama berada dalam kondisi terkendali. Tidak ada tindakan mendesak yang diperlukan saat ini.';
  }

  return 'Sistem sedang menyusun data operasional hari ini.';
}

/** buildHeroNarrative(f) → { headline: {prefix,highlight,tone}, body } — the
 *  single entry point exec-hero calls. `f` is the existing facts(ctx) object;
 *  no new data is read. */
export function buildHeroNarrative(f) {
  const findings = collectFindings(f);
  const state = classifyState(findings, f.score);
  return { headline: HEADLINE_BY_STATE[state], body: buildBody(state, findings) };
}
