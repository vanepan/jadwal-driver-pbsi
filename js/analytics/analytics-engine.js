/* ============================================================
   ANALYTICS-ENGINE.JS — Central analytics computation layer

   Pure functions only: given an AnalyticsContext (raw records + filters
   + alias/dismissed maps + helpers), produce a normalized AnalyticsModel.
   No Firebase, no DOM, no `window`, no side effects.

   Sprint 0 (v1.10.0): the computation here is lifted VERBATIM out of the
   old refreshAnalyticsDisplay() in app.js. A small rebinding preamble maps
   the context onto the exact local names the original code used, so the
   moved logic is byte-identical and numerical parity is guaranteed by
   construction. See Analytics-V2/SPRINT_0_MIGRATION_NOTES.md.
   ============================================================ */

'use strict';

import { buildAnalyticsModel } from './analytics-model.js';
import { filterEligible } from './analytics-governance.js';
import { generateInsights } from './analytics-insights.js';
import { generateRecommendations } from './analytics-recommendations.js';
import { generateTrends } from './analytics-trends.js';
import { buildCancellationModel } from './analytics-cancellation.js';

/* ── Pure helpers (moved verbatim from app.js) ───────────────────────────── */

function _normDestKey(dest) {
  return String(dest)
    .trim()
    .toLowerCase()
    .replace(/[–—‒‐﹘﹣－]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/g, '')
    .trim();
}

function _strSimilarity(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const dp = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const curr = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j - 1], dp[j], prev);
      dp[j - 1] = prev;
      prev = curr;
    }
    dp[lb] = prev;
  }
  return 1 - dp[lb] / Math.max(la, lb);
}

function _detectSimilarPairs(names, threshold = 0.75) {
  const pairs = [];
  const keys = names.map(_normDestKey);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const sim = _strSimilarity(keys[i], keys[j]);
      if (sim >= threshold && sim < 1) pairs.push({ a: names[i], b: names[j] });
    }
  }
  return pairs;
}

function _getAliasCanonical(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry.canonical || null;
}

function _getAliasMeta(entry) {
  if (!entry || typeof entry === 'string') return {};
  return { createdAt: entry.createdAt || null, createdBy: entry.createdBy || null };
}

function _dqPairKey(a, b) {
  return [_normDestKey(a), _normDestKey(b)].sort().join('|');
}

/* Re-exported under clean names for the rest of the app + future modules. */
export {
  _normDestKey     as normDestKey,
  _strSimilarity   as strSimilarity,
  _detectSimilarPairs as detectSimilarPairs,
  _getAliasCanonical  as getAliasCanonical,
  _getAliasMeta       as getAliasMeta,
  _dqPairKey          as dqPairKey,
};

/* ── Central computation ─────────────────────────────────────────────────── */

/**
 * Compute the normalized analytics model.
 * @param {import('./analytics-types.js').AnalyticsContext} ctx
 * @returns {import('./analytics-types.js').AnalyticsModel}
 */
export function computeAnalyticsModel(ctx) {
  // ── Rebinding preamble: map ctx onto the exact local names the moved
  //    computation uses, so the lifted logic stays byte-identical. ──────────
  const analyticsDateRange    = ctx.filters.dateRange;
  const analyticsDriverFilter = ctx.filters.driver;
  const analyticsVehicleFilter = ctx.filters.vehicle;
  const analyticsBidangFilter = ctx.filters.bidang;
  const normalizeAssignmentStatus = ctx.normalizeAssignmentStatus;
  const getDrivers = () => ctx.drivers;
  const getActiveVehiclesFromStore = () => ctx.vehicles;
  const _getAnalyticsAliases  = (type) => ctx.aliases[type]   || {};
  const _getDismissedWarnings = (type) => ctx.dismissed[type] || {};
  // Governance gate (identity for ungoverned data → parity). Both record kinds
  // pass through the same eligibility filter, so a record classified as test /
  // excluded (assignment OR driver_request) leaves every downstream aggregate.
  const assignments = filterEligible(ctx.assignments);
  const requests = filterEligible(ctx.requests);

  // ===== BEGIN lifted computation (verbatim from refreshAnalyticsDisplay) ===

  // ── Date cutoff ────────────────────────────────────────────────────────
  // Clock is injectable (ctx.now) for deterministic tests; absent ⇒ real
  // clock, i.e. byte-identical to the original `new Date()` behavior.
  const _now = ctx.now ? new Date(ctx.now) : new Date();
  const today = _now.toISOString().split('T')[0];
  let cutoff = null;
  if (analyticsDateRange !== 'all') {
    if (analyticsDateRange === 'today') {
      cutoff = today;
    } else {
      const days = analyticsDateRange === '7d' ? 7 : analyticsDateRange === '30d' ? 30 : 90;
      const d = new Date(_now);
      d.setDate(d.getDate() - days + 1);
      cutoff = d.toISOString().split('T')[0];
    }
  }

  function _asgDate(a) { return a.date || a.startDate || ''; }
  function _reqDate(r) { return r.startDate || (r.createdAt || '').slice(0, 10); }

  // ── Filter assignments ─────────────────────────────────────────────────
  let filteredAsg = assignments.map(normalizeAssignmentStatus);
  if (analyticsDateRange === 'today') {
    filteredAsg = filteredAsg.filter(a => _asgDate(a) === today);
  } else if (cutoff) {
    filteredAsg = filteredAsg.filter(a => _asgDate(a) >= cutoff);
  }
  if (analyticsDriverFilter) {
    filteredAsg = filteredAsg.filter(a => (a.driver || '').toLowerCase() === analyticsDriverFilter.toLowerCase());
  }
  if (analyticsVehicleFilter) {
    filteredAsg = filteredAsg.filter(a => (a.vehicle || '').toLowerCase() === analyticsVehicleFilter.toLowerCase());
  }
  if (analyticsBidangFilter) {
    const bidangReqIds = new Set(
      requests.filter(r => r.requesterName === analyticsBidangFilter).map(r => r.id)
    );
    filteredAsg = filteredAsg.filter(a => a.requestId && bidangReqIds.has(a.requestId));
  }
  // Optional inclusive upper bound (Sprint 6) — only set when computing a
  // PREVIOUS-period model, to keep current-period records out of the prior
  // window. Absent on the normal call ⇒ filtering is byte-identical to before.
  if (ctx.windowEnd) {
    filteredAsg = filteredAsg.filter(a => _asgDate(a) <= ctx.windowEnd);
  }

  // ── Filter requests ────────────────────────────────────────────────────
  let filteredReqs = requests;
  if (analyticsDateRange === 'today') {
    filteredReqs = filteredReqs.filter(r => _reqDate(r) === today);
  } else if (cutoff) {
    filteredReqs = filteredReqs.filter(r => _reqDate(r) >= cutoff);
  }
  if (analyticsDriverFilter) {
    filteredReqs = filteredReqs.filter(r => (r.driver || '').toLowerCase() === analyticsDriverFilter.toLowerCase());
  }
  if (analyticsVehicleFilter) {
    filteredReqs = filteredReqs.filter(r => (r.vehicle || '').toLowerCase() === analyticsVehicleFilter.toLowerCase());
  }
  if (analyticsBidangFilter) {
    filteredReqs = filteredReqs.filter(r => r.requesterName === analyticsBidangFilter);
  }
  if (ctx.windowEnd) {
    filteredReqs = filteredReqs.filter(r => _reqDate(r) <= ctx.windowEnd);
  }

  // ── Cancelled assignments (v1.10.7) ──────────────────────────────────────
  // Cancelled records are retained in data but excluded from every operational
  // aggregate (KPIs, completion rate, driver/vehicle utilization, destinations).
  // They are surfaced separately so future cancellation analytics can use them.
  const cancelledAsg = filteredAsg.filter(a => a.status === 'cancelled');
  filteredAsg = filteredAsg.filter(a => a.status !== 'cancelled');

  // ── Assignment KPIs ────────────────────────────────────────────────────
  const total      = filteredAsg.length;
  const completed  = filteredAsg.filter(a => a.status === 'completed').length;
  const inProgress = filteredAsg.filter(a => a.status === 'started').length;
  const scheduled  = filteredAsg.filter(a => a.status === 'assigned').length;
  const cancelled  = cancelledAsg.length;
  const openAsg    = inProgress + scheduled;
  const compRate   = total > 0 ? Math.round((completed / total) * 100) : 0;

  // ── Driver utilization ─────────────────────────────────────────────────
  const activeDrivers = getDrivers().filter(d => d.active !== false && !d.archived);
  const driverMap = new Map();
  for (const d of activeDrivers) {
    driverMap.set((d.name || '').toLowerCase(), { displayName: d.name, count: 0 });
  }
  for (const a of filteredAsg) {
    const entry = driverMap.get((a.driver || '').toLowerCase());
    if (entry) entry.count++;
  }
  const driversSorted    = [...driverMap.values()].sort((x, y) => y.count - x.count);
  const driversWithTrips = driversSorted.filter(d => d.count > 0);
  const mostActiveDrv    = driversWithTrips[0] ?? null;
  const leastActiveDrv   = driversWithTrips.length > 1 ? driversWithTrips[driversWithTrips.length - 1] : null;

  // ── Vehicle utilization ────────────────────────────────────────────────
  const activeVehicles = getActiveVehiclesFromStore().filter(v => !v.archived);
  const vehicleMap = new Map();
  for (const v of activeVehicles) {
    vehicleMap.set((v.name || '').toLowerCase(), { displayName: v.name, count: 0 });
  }
  for (const a of filteredAsg) {
    const entry = vehicleMap.get((a.vehicle || '').toLowerCase());
    if (entry) entry.count++;
  }
  const vehiclesSorted    = [...vehicleMap.values()].sort((x, y) => y.count - x.count);
  const vehiclesWithTrips = vehiclesSorted.filter(v => v.count > 0);
  const mostUsedVeh       = vehiclesWithTrips[0] ?? null;
  const leastUsedVeh      = vehiclesWithTrips.length > 1 ? vehiclesWithTrips[vehiclesWithTrips.length - 1] : null;

  // ── Bidang analytics ───────────────────────────────────────────────────
  const bidangAliases  = _getAnalyticsAliases('bidang');
  const bidangReqCounts = new Map();
  const bidangAsgCounts = new Map();
  for (const r of filteredReqs) {
    const name = r.requesterName;
    if (!name || !name.trim()) continue;
    const resolved = _getAliasCanonical(bidangAliases[_normDestKey(name)]) || name;
    bidangReqCounts.set(resolved, (bidangReqCounts.get(resolved) || 0) + 1);
  }
  for (const a of filteredAsg) {
    if (a.requestId) {
      const req = requests.find(r => r.id === a.requestId);
      if (req && req.requesterName && req.requesterName.trim()) {
        const resolved = bidangAliases[_normDestKey(req.requesterName)] || req.requesterName;
        bidangAsgCounts.set(resolved, (bidangAsgCounts.get(resolved) || 0) + 1);
      }
    }
  }
  const bidangSorted = [...bidangReqCounts.entries()]
    .map(([name, reqCount]) => ({ name, reqCount, asgCount: bidangAsgCounts.get(name) || 0 }))
    .sort((a, b) => b.reqCount - a.reqCount);

  // ── Workload classification (relative — no hardcoded thresholds) ─────────
  const _wlCounts = driversWithTrips.map(d => d.count);
  const _wlMean   = _wlCounts.length > 0 ? _wlCounts.reduce((s, c) => s + c, 0) / _wlCounts.length : 0;
  const _wlStdDev = (() => {
    if (_wlCounts.length < 2) return 0;
    const variance = _wlCounts.reduce((s, c) => s + (c - _wlMean) ** 2, 0) / _wlCounts.length;
    return Math.sqrt(variance);
  })();
  const classifiedDrivers = driversSorted.map(d => {
    if (d.count === 0)    return { ...d, wl: 'idle' };
    if (_wlStdDev < 0.5)  return { ...d, wl: 'balanced' };
    if (d.count > _wlMean + _wlStdDev)              return { ...d, wl: 'over' };
    if (d.count < Math.max(1, _wlMean - _wlStdDev)) return { ...d, wl: 'under' };
    return { ...d, wl: 'balanced' };
  });
  const wlBalancedCount = classifiedDrivers.filter(d => d.wl === 'balanced').length;
  const wlOverCount     = classifiedDrivers.filter(d => d.wl === 'over').length;
  const wlUnderCount    = classifiedDrivers.filter(d => d.wl === 'under').length;

  // ── Inactive resources ─────────────────────────────────────────────────
  const inactiveDrivers  = [...driverMap.values()].filter(d => d.count === 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const inactiveVehicles = [...vehicleMap.values()].filter(v => v.count === 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // ── Destination analytics (with alias resolution) ─────────────────────
  const destAliases = _getAnalyticsAliases('destinations');
  const _destFreq   = new Map();
  const _destLabel  = new Map();
  for (const a of filteredAsg) {
    const raw = (a.destination || '').trim();
    if (!raw) continue;
    let key   = _normDestKey(raw);
    let label = raw;
    const _canonical = _getAliasCanonical(destAliases[key]);
    if (_canonical) {
      label = _canonical;
      key   = _normDestKey(label);
    }
    _destFreq.set(key, (_destFreq.get(key) || 0) + 1);
    if (!_destLabel.has(key)) _destLabel.set(key, label);
  }
  const destSorted  = [..._destFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, freq]) => [_destLabel.get(key) || key, freq]);
  const hasDestData = destSorted.length > 0;

  // ── Enhanced bidang demand ─────────────────────────────────────────────
  const totalBidangReqs = filteredReqs.length;
  const bidangEnhanced  = bidangSorted.map(b => ({
    ...b,
    reqPct: totalBidangReqs > 0 ? Math.round((b.reqCount / totalBidangReqs) * 100) : 0,
    asgPct: total > 0           ? Math.round((b.asgCount / total) * 100)            : 0,
  }));

  // ── Odometer / Jarak Tempuh analytics ─────────────────────────────────
  const _driverOdo  = new Map();
  const _vehicleOdo = new Map();
  const _bidangOdo  = new Map();
  for (const a of filteredAsg) {
    const km = a.distanceTravelled;
    if (km == null || km <= 0) continue;
    const dKey = (a.driver || '').toLowerCase();
    _driverOdo.set(dKey, (_driverOdo.get(dKey) || 0) + km);
    const vKey = (a.vehicle || '').toLowerCase();
    _vehicleOdo.set(vKey, (_vehicleOdo.get(vKey) || 0) + km);
    if (a.requestId) {
      const req = requests.find(r => r.id === a.requestId);
      if (req?.requesterName) _bidangOdo.set(req.requesterName, (_bidangOdo.get(req.requesterName) || 0) + km);
    }
  }
  const driverOdoList  = driversSorted
    .map(d => ({ name: d.displayName, km: _driverOdo.get(d.displayName.toLowerCase()) || 0 }))
    .filter(d => d.km > 0).sort((a, b) => b.km - a.km);
  const vehicleOdoList = vehiclesSorted
    .map(v => ({ name: v.displayName, km: _vehicleOdo.get(v.displayName.toLowerCase()) || 0 }))
    .filter(v => v.km > 0).sort((a, b) => b.km - a.km);
  const totalKm        = driverOdoList.reduce((s, d) => s + d.km, 0);
  const hasOdoData     = totalKm > 0;
  const odoTripCount   = filteredAsg.filter(a => a.distanceTravelled != null && a.distanceTravelled > 0).length;
  const avgKmPerTrip   = hasOdoData && odoTripCount > 0 ? Math.round(totalKm / odoTripCount) : 0;

  // ── Completion quality ─────────────────────────────────────────────────
  const openRate        = total > 0 ? Math.round((openAsg / total) * 100) : 0;
  const completionRatio = total > 0 ? `${completed} / ${total}` : '—';

  // ── Data quality warnings + alias resolution ───────────────────────────
  const _driverAliases  = _getAnalyticsAliases('drivers');
  const _vehicleAliases = _getAnalyticsAliases('vehicles');

  const _destDismissed    = _getDismissedWarnings('destinations');
  const _bidangDismissed  = _getDismissedWarnings('bidang');
  const _driverDismissed  = _getDismissedWarnings('drivers');
  const _vehicleDismissed = _getDismissedWarnings('vehicles');

  const _dqWarnings = [];
  const _destRawNames = [..._destFreq.keys()].map(k => _destLabel.get(k) || k);
  for (const { a, b } of _detectSimilarPairs(_destRawNames)) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey    = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(destAliases[keyA]) || _getAliasCanonical(destAliases[keyB]) || null;
    const dismissed  = _destDismissed[pairKey] || null;
    const countA     = _destFreq.get(keyA) || 0;
    const countB     = _destFreq.get(keyB) || 0;
    _dqWarnings.push({ type: 'destinations', a, b, aliasActive, dismissed, pairKey, countA, countB });
  }
  const _bidangRawNames = [...bidangReqCounts.keys()];
  for (const { a, b } of _detectSimilarPairs(_bidangRawNames)) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey    = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(bidangAliases[keyA]) || _getAliasCanonical(bidangAliases[keyB]) || null;
    const dismissed  = _bidangDismissed[pairKey] || null;
    const countA     = bidangReqCounts.get(a) || 0;
    const countB     = bidangReqCounts.get(b) || 0;
    _dqWarnings.push({ type: 'bidang', a, b, aliasActive, dismissed, pairKey, countA, countB });
  }
  const _driverNames = getDrivers().filter(d => d.active !== false && !d.archived).map(d => d.name || '');
  for (const { a, b } of _detectSimilarPairs(_driverNames)) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey    = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(_driverAliases[keyA]) || _getAliasCanonical(_driverAliases[keyB]) || null;
    const dismissed  = _driverDismissed[pairKey] || null;
    _dqWarnings.push({ type: 'drivers', a, b, aliasActive, dismissed, pairKey, countA: null, countB: null });
  }
  const _vehicleNames = getActiveVehiclesFromStore().filter(v => !v.archived).map(v => v.name || '');
  for (const { a, b } of _detectSimilarPairs(_vehicleNames)) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey    = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(_vehicleAliases[keyA]) || _getAliasCanonical(_vehicleAliases[keyB]) || null;
    const dismissed  = _vehicleDismissed[pairKey] || null;
    _dqWarnings.push({ type: 'vehicles', a, b, aliasActive, dismissed, pairKey, countA: null, countB: null });
  }

  // All dismissed warnings for display
  const _allDismissed = [
    ...Object.entries(_destDismissed).map(([k, v]) => ({ type: 'destinations', pairKey: k, ...v })),
    ...Object.entries(_bidangDismissed).map(([k, v]) => ({ type: 'bidang', pairKey: k, ...v })),
    ...Object.entries(_driverDismissed).map(([k, v]) => ({ type: 'drivers', pairKey: k, ...v })),
    ...Object.entries(_vehicleDismissed).map(([k, v]) => ({ type: 'vehicles', pairKey: k, ...v })),
  ];

  // All existing aliases for the Kelola Alias table
  const _allAliases = [
    ...Object.entries(destAliases).map(([k, v]) => {
      const canonical = _getAliasCanonical(v); const meta = _getAliasMeta(v);
      return { type: 'destinations', aliasKey: k, canonical, usageCount: _destFreq.get(_normDestKey(canonical || k)) || 0, ...meta };
    }),
    ...Object.entries(bidangAliases).map(([k, v]) => {
      const canonical = _getAliasCanonical(v); const meta = _getAliasMeta(v);
      return { type: 'bidang', aliasKey: k, canonical, usageCount: bidangReqCounts.get(canonical || k) || 0, ...meta };
    }),
    ...Object.entries(_driverAliases).map(([k, v]) => {
      const canonical = _getAliasCanonical(v); const meta = _getAliasMeta(v);
      return { type: 'drivers', aliasKey: k, canonical, usageCount: null, ...meta };
    }),
    ...Object.entries(_vehicleAliases).map(([k, v]) => {
      const canonical = _getAliasCanonical(v); const meta = _getAliasMeta(v);
      return { type: 'vehicles', aliasKey: k, canonical, usageCount: null, ...meta };
    }),
  ];

  // DQ statistics
  const _dqMainWarnings    = _dqWarnings.filter(w => !w.dismissed);
  const _dqUnresolvedCount = _dqMainWarnings.filter(w => !w.aliasActive).length;
  const _dqResolvedCount   = _dqWarnings.filter(w => !!w.aliasActive).length;

  // ── Derivations previously computed inline in the renderer ──────────────
  const activeDriversInPeriod = classifiedDrivers.filter(d => d.count > 0);
  const mostActiveBidang  = bidangEnhanced[0] ?? null;
  const leastActiveBidang = bidangEnhanced.length > 1 ? bidangEnhanced[bidangEnhanced.length - 1] : null;

  // ===== END lifted computation =============================================

  /* Export snapshot — identical shape to the legacy _lastAnalyticsModel so
     the Analytics PDF (analytics-summary) is byte-for-byte unchanged. */
  const exportSnapshot = {
    compRate, total, completed, inProgress, scheduled, cancelled, openAsg,
    activeDrivers:  activeDrivers.length,
    activeVehicles: activeVehicles.length,
    mostActiveDriver:  mostActiveDrv  ? { name: mostActiveDrv.displayName,  count: mostActiveDrv.count }  : null,
    leastActiveDriver: leastActiveDrv ? { name: leastActiveDrv.displayName, count: leastActiveDrv.count } : null,
    driverCounts:  driversWithTrips.map(d => ({ name: d.displayName, count: d.count })),
    mostUsedVehicle: mostUsedVeh ? { name: mostUsedVeh.displayName, count: mostUsedVeh.count } : null,
    idleVehicles:  inactiveVehicles.map(v => v.displayName),
    vehicleCounts: vehiclesWithTrips.map(v => ({ name: v.displayName, count: v.count })),
    bidang: bidangEnhanced.map(b => ({ name: b.name, reqCount: b.reqCount, asgCount: b.asgCount })),
  };

  /* Flat projection consumed by the current renderer — identifiers match the
     exact names used inside the HTML templates (parity-preserving). */
  const render = {
    total, completed, inProgress, scheduled, cancelled, compRate, openRate, filteredReqs,
    driversWithTrips, vehiclesWithTrips, mostActiveDrv, leastActiveDrv, mostUsedVeh, leastUsedVeh,
    activeDrivers, activeVehicles, activeDriversInPeriod, inactiveDrivers, inactiveVehicles,
    wlBalancedCount, wlOverCount, wlUnderCount,
    bidangEnhanced, mostActiveBidang, leastActiveBidang,
    destSorted, hasDestData, _destFreq,
    driverOdoList, vehicleOdoList, totalKm, hasOdoData, odoTripCount, avgKmPerTrip,
    _dqMainWarnings, _dqUnresolvedCount, _dqResolvedCount, _allDismissed, _allAliases,
  };

  // ── Cancellation Intelligence (v1.10.8) ─────────────────────────────────
  // Reusable aggregation foundation over the cancelled set. Resolves the
  // bidang the same way the operational bidang section does (requestId →
  // requesterName → alias), falling back to the requester stored on the
  // assignment (createdBy). Never feeds operational KPIs.
  const _resolveCancelBidang = (a) => {
    if (a && a.requestId) {
      const req = requests.find(r => r.id === a.requestId);
      if (req && req.requesterName && req.requesterName.trim()) {
        return _getAliasCanonical(bidangAliases[_normDestKey(req.requesterName)]) || req.requesterName;
      }
    }
    return (a && a.createdBy) || null;
  };
  const cancellation = buildCancellationModel(cancelledAsg, {
    resolveBidang: _resolveCancelBidang,
    operationalTotal: total,
    completed,
  });

  const model = buildAnalyticsModel({
    metadata: {
      generatedAt: new Date().toISOString(),
      filters: { ...ctx.filters },
      dateRange: analyticsDateRange,
    },
    kpis: {
      total, completed, inProgress, scheduled, cancelled, grandTotal: total + cancelled, openAsg, compRate, openRate, completionRatio,
      // Cancellation Intelligence KPIs (v1.10.8):
      cancellationRate: cancellation.rate,                                   // cancelled / (operational + cancelled)
      completionVsCancellationRate: cancellation.completionVsCancellationRate, // completed / (completed + cancelled)
      activeDrivers: activeDrivers.length, activeVehicles: activeVehicles.length,
      driversWithTrips: driversWithTrips.length, vehiclesWithTrips: vehiclesWithTrips.length,
      totalKm, avgKmPerTrip, odoTripCount,
      wlBalancedCount, wlOverCount, wlUnderCount,
    },
    cancellation,
    charts: {
      status: { completed, inProgress, scheduled, cancelled, total },
      driverWorkload: activeDriversInPeriod,
      vehicleUtil: vehiclesWithTrips,
      bidangDemand: bidangEnhanced,
      odoDriver: driverOdoList,
      odoVehicle: vehicleOdoList,
    },
    insights: [],
    diagnostics: {
      filteredAsg,
      cancelledAsg, // retained for future cancellation analytics (rate, trend, by bidang/driver/destination)
      dqWarnings: _dqWarnings,
      dqMainWarnings: _dqMainWarnings,
      dqUnresolvedCount: _dqUnresolvedCount,
      dqResolvedCount: _dqResolvedCount,
      allAliases: _allAliases,
      allDismissed: _allDismissed,
    },
    render,
    exportSnapshot,
  });

  // Trend layer (Sprint 6): when a previous-period model is supplied, diff the
  // existing KPIs into a period-over-period comparison. Populated BEFORE the
  // insight/recommendation layers so they can reference trends in a single
  // generation pass. Absent ⇒ model.trends stays {} (no comparison fabricated).
  if (ctx.previousModel) {
    model.trends = generateTrends(model, ctx.previousModel);
  }

  // Insight layer (Sprint 4): interpret existing model outputs. Pure, derived,
  // and traceable — no new calculations, so KPI/chart/export values are unchanged.
  model.insights = generateInsights(model);
  // Recommendation layer (Sprint 5): deterministic advisory rules over the same
  // findings. Advisory only — changes no analytics values.
  model.recommendations = generateRecommendations(model);
  return model;
}
