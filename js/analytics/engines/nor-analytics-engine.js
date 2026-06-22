/* ============================================================
   NOR-ANALYTICS-ENGINE.JS — Reusable NOR (Nota Organisasi Realisasi)
   analytics  (v1.15.0 — Analytics Expansion Foundation)

   Pure functions over the Petty Cash NOR records. Used by Analytics
   Petty Cash (Hero KPI), Analytics Executive, and future reports.

   NOR record shape (see petty-cash-service.generateNor):
     { type:'official'|'test', archived:boolean,
       norDate:'YYYY-MM-DD'  (date the NOR was ISSUED),
       replenishedAt: number (ms epoch, set when "Dana Pengganti Diterima"),
       status:'generated'|'waiting_replenishment'|'replenished'|'closed', … }

   Realization time (spec P1 formula):
     Tanggal Dana Pengganti Diterima  −  Tanggal NOR Diterbitkan
   i.e. (replenishedAt) − (norDate), expressed in whole days.

   Pure: no DOM, no Firebase, no side effects. The clock is never read —
   callers pass periods explicitly so output is deterministic.
   ============================================================ */

'use strict';

const MS_PER_DAY = 86400000;

/** An official, non-archived NOR is the only kind that counts in reporting. */
export function isOfficialNor(nor) {
  return !!nor && nor.type !== 'test' && !nor.archived;
}

/**
 * THE single source of truth for which expenses analytics may count.
 *
 * Analytics Petty Cash is an OFFICIAL report: it counts ONLY expenses that
 * belong to an issued, official (non-archived) NOR. This excludes — by
 * construction — draft / "siap NOR" / not-yet-in-NOR expenses (no norId, or a
 * norId that is not in the official set), TEST NORs, archived TEST NORs, and
 * archived official NORs. Because conversion (Official ↔ Test) flips nor.type,
 * the official set recomputes automatically, so analytics follow conversions
 * with no migration (validation cases C & D).
 *
 * @param {Object[]} expenses - all expense records
 * @param {Object[]} nors     - all NOR records
 * @returns {Object[]} expenses linked to an official, non-archived NOR
 */
export function getOfficialAnalyticsExpenses(expenses, nors) {
  const officialIds = new Set(
    (Array.isArray(nors) ? nors : []).filter(isOfficialNor).map(n => n.id)
  );
  return (Array.isArray(expenses) ? expenses : [])
    .filter(e => e && e.norId && officialIds.has(e.norId));
}

/** A NOR whose replacement funds have arrived (cycle realised). */
export function isRealizedNor(nor) {
  return !!nor && (nor.status === 'replenished' || nor.status === 'closed') && nor.replenishedAt != null;
}

/** Parse an ISO 'YYYY-MM-DD' date to an epoch ms at UTC midnight (null-safe). */
function isoToMs(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/**
 * Realization time, in whole days, for a single NOR.
 * Returns null when the NOR is not yet realized or dates are missing.
 * @param {Object} nor
 * @returns {number|null}
 */
export function realizationDays(nor) {
  if (!isRealizedNor(nor)) return null;
  const issued = isoToMs(nor.norDate);
  if (issued == null) return null;
  const received = Number(nor.replenishedAt);
  if (!Number.isFinite(received)) return null;
  const days = Math.round((received - issued) / MS_PER_DAY);
  return days >= 0 ? days : 0;
}

/**
 * Count of official (non-test, non-archived) NORs.
 * @param {Object[]} nors
 * @returns {number}
 */
export function officialNorCount(nors) {
  return (Array.isArray(nors) ? nors : []).filter(isOfficialNor).length;
}

/**
 * Average realization time across realized official NORs.
 * @param {Object[]} nors
 * @returns {{averageDays:number|null, realizedCount:number, samples:number[]}}
 *   averageDays is null when there is no realized NOR to measure.
 */
export function averageRealizationTime(nors) {
  const samples = (Array.isArray(nors) ? nors : [])
    .filter(isOfficialNor)
    .map(realizationDays)
    .filter(d => d != null);
  if (samples.length === 0) return { averageDays: null, realizedCount: 0, samples: [] };
  const avg = samples.reduce((s, d) => s + d, 0) / samples.length;
  return { averageDays: Math.round(avg), realizedCount: samples.length, samples };
}

/**
 * TRUE Timeliness ratio (v1.16.2): the share of REALIZED official NORs that were
 * replenished within `targetDays` of issue. This is a genuine SPEED metric built
 * from the existing `realizationDays` samples — distinct from the realization /
 * completion RATE (how many NORs got realized at all).
 *
 *   timeliness = (#realized NORs with realizationDays ≤ targetDays) / (#realized NORs)
 *
 * Denominator is realized NORs only, so unrealized NORs neither help nor hurt
 * timeliness (they are a completion concern, not a speed one). Returns null when
 * there is no realized NOR to measure (No-Data ≠ 0).
 *
 * @param {Object[]} nors
 * @param {number} [targetDays=14]
 * @returns {number|null} 0–1 ratio | null
 */
export function realizationTimelinessRatio(nors, targetDays = 14) {
  const { samples } = averageRealizationTime(nors);
  if (!samples.length) return null;
  const limit = Number.isFinite(Number(targetDays)) ? Number(targetDays) : 14;
  const onTime = samples.filter(d => d <= limit).length;
  return onTime / samples.length;
}

/**
 * Compare average realization time of the CURRENT period's NORs against the
 * PREVIOUS period's. Lower is better (faster replenishment), so a decrease is
 * a positive tone. Returns a directionless/insufficient result when either
 * period lacks a realized NOR.
 *
 * @param {Object[]} currentNors  - NORs realized within the current window
 * @param {Object[]} previousNors - NORs realized within the previous window
 * @returns {{available:boolean, current:number|null, previous:number|null,
 *   deltaDays:number|null, direction:'up'|'down'|'neutral',
 *   tone:'positive'|'negative'|'neutral'}}
 */
export function realizationTrend(currentNors, previousNors) {
  const cur = averageRealizationTime(currentNors).averageDays;
  const prev = averageRealizationTime(previousNors).averageDays;
  if (cur == null || prev == null) {
    return { available: false, current: cur, previous: prev, deltaDays: null, direction: 'neutral', tone: 'neutral' };
  }
  const deltaDays = cur - prev;
  const direction = deltaDays > 0 ? 'up' : deltaDays < 0 ? 'down' : 'neutral';
  // Faster realization (fewer days) is good.
  const tone = direction === 'down' ? 'positive' : direction === 'up' ? 'negative' : 'neutral';
  return { available: true, current: cur, previous: prev, deltaDays, direction, tone };
}
