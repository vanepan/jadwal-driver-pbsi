/* ============================================================
   ODOMETER-AUDIT.JS — read-only odometer anomaly detector (V1)

   A PURE function. No DOM, no Firebase, no `window`, no side effects, no
   settings-store import (thresholds are passed in). It CLASSIFIES; it never
   writes and it never says "confirmed wrong" — every finding is SUSPICIOUS
   or worse, for human review with evidence (Igo Odometer Repair Plan).

   Anomaly kinds (Phase 4 of the audit brief):
     IMPOSSIBLE           end < start
     ARITHMETIC_MISMATCH  stored distanceTravelled ≠ (end − start)
     LARGE_JUMP           derived distance > warnJumpKm
     CONTINUITY_BACKWARD  start < the previous completed assignment's valid end
                          for the SAME vehicle (odometer went backwards)
     CONTINUITY_GAP       start − previous valid end > gapKm for the SAME vehicle
                          (a big unexplained forward jump between trips)
     STALE_START          same start value reused by ≥2 completed assignments
                          for the SAME vehicle
     MISSING_ODOMETER     completed, has a vehicle, but start and/or end is null

   Legitimate reasons a mismatch is NOT an error (documented, not auto-judged):
   private mileage between assignments, maintenance/refuelling drives, manual
   vehicle-odometer updates, a vehicle swap, or a genuine data gap. That is why
   CONTINUITY_GAP is a low-severity flag and CONTINUITY_BACKWARD (physically
   impossible) is high.
   ============================================================ */

'use strict';

/** @typedef {Object} OdoThresholds
 *  @property {number} [warnJumpKm]           default 300 — a single trip beyond this is flagged LARGE_JUMP
 *  @property {number} [continuityGapKm]      default 500 — forward gap between two trips on one vehicle
 *  @property {number} [arithmeticToleranceKm] default 1 — |stored − derived| above this is a mismatch
 */

const DEFAULTS = { warnJumpKm: 300, continuityGapKm: 500, arithmeticToleranceKm: 1 };

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3 };
const KIND_SEVERITY = {
  IMPOSSIBLE: 'high',
  CONTINUITY_BACKWARD: 'high',
  ARITHMETIC_MISMATCH: 'medium',
  STALE_START: 'medium',
  LARGE_JUMP: 'low',
  CONTINUITY_GAP: 'low',
  MISSING_ODOMETER: 'low',
};

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Canonical status: only 'completed' has authoritative start+end odometer. */
function isCompleted(a) {
  return a && (a.status === 'completed' || a.status === 'selesai');
}

/** Sort key: date then startTime then id — deterministic chronological order. */
function chronoKey(a) {
  return `${a.date || a.startDate || ''}T${a.startTime || '00:00'}~${a.id || ''}`;
}

/**
 * @param {Array<Object>} assignments   raw assignment records
 * @param {OdoThresholds} [thresholds]
 * @returns {Array<{
 *   assignmentId:string, driver:string, vehicle:string, date:string,
 *   startTime:string, endTime:string, status:string,
 *   startOdometer:(number|null), endOdometer:(number|null),
 *   distanceStored:(number|null), distanceDerived:(number|null),
 *   prevVehicleEnd:(number|null),
 *   anomalies:string[], severity:('info'|'low'|'medium'|'high'), evidence:string
 * }>}  one row per assignment that has ≥1 anomaly, most severe first.
 */
export function auditOdometerAnomalies(assignments, thresholds = {}) {
  const T = { ...DEFAULTS, ...(thresholds || {}) };
  const list = (Array.isArray(assignments) ? assignments : [])
    .filter((a) => a && a.id)
    .slice()
    .sort((x, y) => chronoKey(x).localeCompare(chronoKey(y)));

  // Per-vehicle running chain of the last VALID completed end odometer, plus
  // the set of start values already seen (STALE_START).
  const lastValidEndByVehicle = new Map();
  const startsSeenByVehicle = new Map();

  const out = [];

  for (const a of list) {
    const vehicleKey = String(a.vehicle || '').trim().toLowerCase();
    const start = toNum(a.startOdometer);
    const end = toNum(a.endOdometer);
    const stored = toNum(a.distanceTravelled);
    const derived = (start != null && end != null) ? end - start : null;
    const prevEnd = vehicleKey ? (lastValidEndByVehicle.get(vehicleKey) ?? null) : null;

    const anomalies = [];
    const ev = [];

    if (isCompleted(a) && vehicleKey) {
      if (start == null || end == null) {
        anomalies.push('MISSING_ODOMETER');
        ev.push(`completed trip on ${a.vehicle} with start=${start ?? '∅'} end=${end ?? '∅'}`);
      }
    }

    if (start != null && end != null && end < start) {
      anomalies.push('IMPOSSIBLE');
      ev.push(`end ${end.toLocaleString()} < start ${start.toLocaleString()}`);
    }

    if (stored != null && derived != null && Math.abs(stored - derived) > T.arithmeticToleranceKm) {
      anomalies.push('ARITHMETIC_MISMATCH');
      ev.push(`stored distance ${stored.toLocaleString()} ≠ end−start ${derived.toLocaleString()}`);
    }

    if (derived != null && derived > T.warnJumpKm) {
      anomalies.push('LARGE_JUMP');
      ev.push(`single trip ${derived.toLocaleString()} km > warnJumpKm ${T.warnJumpKm.toLocaleString()}`);
    }

    if (start != null && prevEnd != null) {
      if (start < prevEnd) {
        anomalies.push('CONTINUITY_BACKWARD');
        ev.push(`start ${start.toLocaleString()} < previous ${a.vehicle} end ${prevEnd.toLocaleString()}`);
      } else if (start - prevEnd > T.continuityGapKm) {
        anomalies.push('CONTINUITY_GAP');
        ev.push(`+${(start - prevEnd).toLocaleString()} km between previous ${a.vehicle} end (${prevEnd.toLocaleString()}) and this start (${start.toLocaleString()})`);
      }
    }

    if (start != null && vehicleKey) {
      const seen = startsSeenByVehicle.get(vehicleKey) || new Map();
      if (isCompleted(a)) {
        const prevCount = seen.get(start) || 0;
        if (prevCount >= 1) {
          anomalies.push('STALE_START');
          ev.push(`start ${start.toLocaleString()} reused by ≥2 completed trips on ${a.vehicle}`);
        }
        seen.set(start, prevCount + 1);
        startsSeenByVehicle.set(vehicleKey, seen);
      }
    }

    // Advance the per-vehicle chain only on a physically-sane completed end.
    if (isCompleted(a) && vehicleKey && end != null && (start == null || end >= start)) {
      if (prevEnd == null || end >= prevEnd) lastValidEndByVehicle.set(vehicleKey, end);
    }

    if (anomalies.length) {
      const severity = anomalies.reduce(
        (worst, k) => (SEVERITY_RANK[KIND_SEVERITY[k]] > SEVERITY_RANK[worst] ? KIND_SEVERITY[k] : worst),
        'info',
      );
      out.push({
        assignmentId: a.id,
        driver: a.driver || '',
        vehicle: a.vehicle || '',
        date: a.date || a.startDate || '',
        startTime: a.startTime || '',
        endTime: a.endTime || '',
        status: a.status || '',
        startOdometer: start,
        endOdometer: end,
        distanceStored: stored,
        distanceDerived: derived,
        prevVehicleEnd: prevEnd,
        anomalies,
        severity,
        evidence: ev.join('; '),
      });
    }
  }

  out.sort((x, y) => (SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]) || chronoKey(x).localeCompare(chronoKey(y)));
  return out;
}

/**
 * The recomputation a confirmed KM-Awal correction produces — pure arithmetic,
 * so the repair plan / tests share ONE definition. The valid END odometer is
 * kept as-is unless it is itself below the corrected start.
 * @returns {{ correctedStart:number, correctedEnd:number, correctedDistance:number,
 *             oldDistance:(number|null), excessKm:(number|null), endKept:boolean }}
 */
export function recomputeCorrectedTrip({ correctStart, existingEnd, oldDistance = null }) {
  const cs = Number(correctStart);
  const ce = Number(existingEnd);
  const endKept = Number.isFinite(ce) && ce >= cs;
  const correctedEnd = endKept ? ce : cs;
  const correctedDistance = correctedEnd - cs;
  const od = oldDistance == null ? null : Number(oldDistance);
  return {
    correctedStart: cs,
    correctedEnd,
    correctedDistance,
    oldDistance: od,
    excessKm: (od == null || !Number.isFinite(od)) ? null : od - correctedDistance,
    endKept,
  };
}
