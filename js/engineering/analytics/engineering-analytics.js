/* ============================================================
   ENGINEERING-ANALYTICS.JS — Engineering Operations Foundation
   (v1.20.0)

   The analytics FOUNDATION for Engineering — pure computations plus a
   provider that reads the store and caches the result. There is NO analytics
   UI this sprint (that comes later); this module exposes the numbers a future
   dashboard renders, all derived from the assignment records the engines
   produce. Everything is provider-based, matching the platform's analytics
   convention.

   Metrics: completed assignments, average completion time, overdue
   assignments, priority / category / building distribution, most-requested
   rooms, engineering workload, request sources, and worker productivity.

   PURE compute (no DOM, no Firebase, no `window`); deterministic given a `now`.
   The provider wrapper is the only stateful part — it reads the store's
   assignments and writes the snapshot into the store's analytics cache.
   ============================================================ */

'use strict';

import {
  cleanString, durationMs, isPlainObject, nowISO, num, tally, toMillis,
} from '../utils/engineering-utils.js';
import {
  COMPLETED_STATUSES, ACTIVE_STATUSES, PARTICIPANT_STATUS,
} from '../config/engineering-config.js';

const DEFAULT_OVERDUE_HOURS = 24;

const asArray = (a) => (Array.isArray(a) ? a.filter(isPlainObject) : []);

/** Count of assignments that reached a completed/verified state. */
export function countCompleted(assignments) {
  return asArray(assignments).filter((a) => COMPLETED_STATUSES.includes(a.status)).length;
}

/**
 * Average completion time (start → finish) in milliseconds over assignments
 * that have both timestamps. Returns { averageMs, sampleSize }.
 */
export function averageCompletionTime(assignments) {
  const durations = asArray(assignments)
    .map((a) => durationMs(a.startedTime, a.finishedTime))
    .filter((d) => d != null && d >= 0);
  const total = durations.reduce((s, d) => s + d, 0);
  return {
    averageMs: durations.length ? Math.round(total / durations.length) : 0,
    sampleSize: durations.length,
  };
}

/**
 * Assignments that are still active and older than the overdue threshold.
 * @param {Array} assignments
 * @param {Object} [options]
 * @param {number} [options.overdueThresholdHours=24]
 * @param {Date|number|string} [options.now]
 * @returns {{count:number, ids:string[]}}
 */
export function overdueAssignments(assignments, options = {}) {
  const thresholdMs = (num(options.overdueThresholdHours) || DEFAULT_OVERDUE_HOURS) * 3600000;
  const now = toMillis(nowISO(options.now));
  const overdue = asArray(assignments).filter((a) => {
    if (!ACTIVE_STATUSES.includes(a.status)) return false;
    const created = toMillis(a.createdTime);
    return !Number.isNaN(created) && (now - created) > thresholdMs;
  });
  return { count: overdue.length, ids: overdue.map((a) => cleanString(a.id)) };
}

/** Count distribution over a field accessor. */
function distribution(assignments, accessor) {
  const out = {};
  for (const a of asArray(assignments)) tally(out, accessor(a));
  return out;
}

export function priorityDistribution(assignments) {
  return distribution(assignments, (a) => a.priority);
}

export function categoryDistribution(assignments) {
  return distribution(assignments, (a) => a.category);
}

export function buildingDistribution(assignments) {
  return distribution(assignments, (a) => a.building);
}

export function requestSources(assignments) {
  return distribution(assignments, (a) => a.source);
}

export function statusDistribution(assignments) {
  return distribution(assignments, (a) => a.status);
}

/**
 * Most-requested rooms, as a sorted list (desc by count). Rooms are keyed by
 * "building · room" so the same room name in two buildings stays distinct.
 * @returns {Array<{key:string, building:string, room:string, count:number}>}
 */
export function mostRequestedRooms(assignments, options = {}) {
  const limit = num(options.limit) > 0 ? num(options.limit) : Infinity;
  const buckets = new Map();
  for (const a of asArray(assignments)) {
    const room = cleanString(a.room);
    if (!room) continue;
    const building = cleanString(a.building);
    const key = `${building}·${room}`;
    const cur = buckets.get(key) || { key, building, room, count: 0 };
    cur.count += 1;
    buckets.set(key, cur);
  }
  return [...buckets.values()].sort((x, y) => y.count - x.count).slice(0, limit);
}

/**
 * Engineering workload per worker: how many assignments they participated in,
 * how many they finished, and their summed actual working time.
 * @returns {Array<{workerId:string, name:string, assignments:number, finished:number, workingMs:number}>}
 */
export function engineeringWorkload(assignments) {
  const workers = new Map();
  for (const a of asArray(assignments)) {
    for (const p of (Array.isArray(a.participants) ? a.participants : [])) {
      if (!p || p.status === PARTICIPANT_STATUS.LEFT) continue;
      const id = cleanString(p.workerId || p.id);
      if (!id) continue;
      const w = workers.get(id) || { workerId: id, name: cleanString(p.name), assignments: 0, finished: 0, workingMs: 0 };
      w.assignments += 1;
      if (p.status === PARTICIPANT_STATUS.FINISHED) w.finished += 1;
      w.workingMs += num(p.actualWorkingDurationMs);
      if (!w.name && p.name) w.name = cleanString(p.name);
      workers.set(id, w);
    }
  }
  return [...workers.values()].sort((x, y) => y.assignments - x.assignments);
}

/**
 * Worker productivity: finished count, verified count, and average working
 * time per finished assignment. Built from the same participation data.
 * @returns {Array<{workerId:string, name:string, finished:number, verified:number, averageWorkingMs:number}>}
 */
export function workerProductivity(assignments) {
  const workers = new Map();
  for (const a of asArray(assignments)) {
    for (const p of (Array.isArray(a.participants) ? a.participants : [])) {
      if (!p || p.status === PARTICIPANT_STATUS.LEFT) continue;
      const id = cleanString(p.workerId || p.id);
      if (!id) continue;
      const w = workers.get(id) || { workerId: id, name: cleanString(p.name), finished: 0, verified: 0, _sumMs: 0 };
      if (p.status === PARTICIPANT_STATUS.FINISHED) {
        w.finished += 1;
        w._sumMs += num(p.actualWorkingDurationMs);
      }
      if (p.verificationStatus === 'verified') w.verified += 1;
      if (!w.name && p.name) w.name = cleanString(p.name);
      workers.set(id, w);
    }
  }
  return [...workers.values()].map((w) => ({
    workerId: w.workerId,
    name: w.name,
    finished: w.finished,
    verified: w.verified,
    averageWorkingMs: w.finished ? Math.round(w._sumMs / w.finished) : 0,
  })).sort((x, y) => y.finished - x.finished);
}

/**
 * The full analytics snapshot for a set of assignments. This is the single
 * object a future dashboard binds to.
 * @param {Array} assignments
 * @param {Object} [options]  { overdueThresholdHours, now, roomLimit }
 * @returns {Object}
 */
export function buildEngineeringAnalytics(assignments, options = {}) {
  const list = asArray(assignments);
  return {
    generatedAt: nowISO(options.now),
    totalAssignments: list.length,
    completedAssignments: countCompleted(list),
    averageCompletionTime: averageCompletionTime(list),
    overdueAssignments: overdueAssignments(list, options),
    priorityDistribution: priorityDistribution(list),
    categoryDistribution: categoryDistribution(list),
    statusDistribution: statusDistribution(list),
    buildingDistribution: buildingDistribution(list),
    mostRequestedRooms: mostRequestedRooms(list, { limit: options.roomLimit }),
    engineeringWorkload: engineeringWorkload(list),
    requestSources: requestSources(list),
    workerProductivity: workerProductivity(list),
  };
}
