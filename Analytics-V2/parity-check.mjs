/* ============================================================
   parity-check.mjs — Sprint 0 parity validation harness

   Proves the extracted Analytics Engine produces output identical to the
   ORIGINAL pre-refactor inline computation. `computeOld()` below is an
   independent, verbatim copy of the logic that used to live inside
   refreshAnalyticsDisplay() in app.js (captured before extraction). We run
   both implementations over several synthetic scenarios and assert the
   `render` projection + `exportSnapshot` match exactly.

   Run:  node Analytics-V2/parity-check.mjs
   Exit code 0 = parity holds; 1 = mismatch.
   ============================================================ */

import { computeAnalyticsModel } from '../js/analytics/analytics-engine.js';

/* ── Reference helpers (verbatim copies of the original app.js helpers) ───── */
function _normDestKey(dest) {
  return String(dest).trim().toLowerCase()
    .replace(/[–—‒‐﹘﹣－]/g, '-').replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ').replace(/[.,;]+$/g, '').trim();
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
      dp[j - 1] = prev; prev = curr;
    }
    dp[lb] = prev;
  }
  return 1 - dp[lb] / Math.max(la, lb);
}
function _detectSimilarPairs(names, threshold = 0.75) {
  const pairs = [];
  const keys = names.map(_normDestKey);
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const sim = _strSimilarity(keys[i], keys[j]);
      if (sim >= threshold && sim < 1) pairs.push({ a: names[i], b: names[j] });
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

/* ── computeOld(): independent copy of the original inline computation ────── */
function computeOld(ctx) {
  const analyticsDateRange    = ctx.filters.dateRange;
  const analyticsDriverFilter = ctx.filters.driver;
  const analyticsVehicleFilter = ctx.filters.vehicle;
  const analyticsBidangFilter = ctx.filters.bidang;
  const requests = ctx.requests;
  const normalizeAssignmentStatus = ctx.normalizeAssignmentStatus;
  const getDrivers = () => ctx.drivers;
  const getActiveVehiclesFromStore = () => ctx.vehicles;
  const _getAnalyticsAliases  = (t) => ctx.aliases[t]   || {};
  const _getDismissedWarnings = (t) => ctx.dismissed[t] || {};
  const assignments = ctx.assignments;

  const today = ctx.today;             // injected for determinism
  let cutoff = null;
  if (analyticsDateRange !== 'all') {
    if (analyticsDateRange === 'today') cutoff = today;
    else {
      const days = analyticsDateRange === '7d' ? 7 : analyticsDateRange === '30d' ? 30 : 90;
      const d = new Date(ctx.now); d.setDate(d.getDate() - days + 1);
      cutoff = d.toISOString().split('T')[0];
    }
  }
  const _asgDate = (a) => a.date || a.startDate || '';
  const _reqDate = (r) => r.startDate || (r.createdAt || '').slice(0, 10);

  let filteredAsg = assignments.map(normalizeAssignmentStatus);
  if (analyticsDateRange === 'today') filteredAsg = filteredAsg.filter(a => _asgDate(a) === today);
  else if (cutoff) filteredAsg = filteredAsg.filter(a => _asgDate(a) >= cutoff);
  if (analyticsDriverFilter)  filteredAsg = filteredAsg.filter(a => (a.driver || '').toLowerCase() === analyticsDriverFilter.toLowerCase());
  if (analyticsVehicleFilter) filteredAsg = filteredAsg.filter(a => (a.vehicle || '').toLowerCase() === analyticsVehicleFilter.toLowerCase());
  if (analyticsBidangFilter) {
    const ids = new Set(requests.filter(r => r.requesterName === analyticsBidangFilter).map(r => r.id));
    filteredAsg = filteredAsg.filter(a => a.requestId && ids.has(a.requestId));
  }

  let filteredReqs = requests;
  if (analyticsDateRange === 'today') filteredReqs = filteredReqs.filter(r => _reqDate(r) === today);
  else if (cutoff) filteredReqs = filteredReqs.filter(r => _reqDate(r) >= cutoff);
  if (analyticsDriverFilter)  filteredReqs = filteredReqs.filter(r => (r.driver || '').toLowerCase() === analyticsDriverFilter.toLowerCase());
  if (analyticsVehicleFilter) filteredReqs = filteredReqs.filter(r => (r.vehicle || '').toLowerCase() === analyticsVehicleFilter.toLowerCase());
  if (analyticsBidangFilter)  filteredReqs = filteredReqs.filter(r => r.requesterName === analyticsBidangFilter);

  const total = filteredAsg.length;
  const completed = filteredAsg.filter(a => a.status === 'completed').length;
  const inProgress = filteredAsg.filter(a => a.status === 'started').length;
  const scheduled = filteredAsg.filter(a => a.status === 'assigned').length;
  const cancelled = Math.max(0, total - completed - inProgress - scheduled);
  const openAsg = inProgress + scheduled;
  const compRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const activeDrivers = getDrivers().filter(d => d.active !== false && !d.archived);
  const driverMap = new Map();
  for (const d of activeDrivers) driverMap.set((d.name || '').toLowerCase(), { displayName: d.name, count: 0 });
  for (const a of filteredAsg) { const e = driverMap.get((a.driver || '').toLowerCase()); if (e) e.count++; }
  const driversSorted = [...driverMap.values()].sort((x, y) => y.count - x.count);
  const driversWithTrips = driversSorted.filter(d => d.count > 0);
  const mostActiveDrv = driversWithTrips[0] ?? null;
  const leastActiveDrv = driversWithTrips.length > 1 ? driversWithTrips[driversWithTrips.length - 1] : null;

  const activeVehicles = getActiveVehiclesFromStore().filter(v => !v.archived);
  const vehicleMap = new Map();
  for (const v of activeVehicles) vehicleMap.set((v.name || '').toLowerCase(), { displayName: v.name, count: 0 });
  for (const a of filteredAsg) { const e = vehicleMap.get((a.vehicle || '').toLowerCase()); if (e) e.count++; }
  const vehiclesSorted = [...vehicleMap.values()].sort((x, y) => y.count - x.count);
  const vehiclesWithTrips = vehiclesSorted.filter(v => v.count > 0);
  const mostUsedVeh = vehiclesWithTrips[0] ?? null;
  const leastUsedVeh = vehiclesWithTrips.length > 1 ? vehiclesWithTrips[vehiclesWithTrips.length - 1] : null;

  const bidangAliases = _getAnalyticsAliases('bidang');
  const bidangReqCounts = new Map();
  const bidangAsgCounts = new Map();
  for (const r of filteredReqs) {
    const name = r.requesterName; if (!name || !name.trim()) continue;
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

  const _wlCounts = driversWithTrips.map(d => d.count);
  const _wlMean = _wlCounts.length > 0 ? _wlCounts.reduce((s, c) => s + c, 0) / _wlCounts.length : 0;
  const _wlStdDev = (() => {
    if (_wlCounts.length < 2) return 0;
    const v = _wlCounts.reduce((s, c) => s + (c - _wlMean) ** 2, 0) / _wlCounts.length;
    return Math.sqrt(v);
  })();
  const classifiedDrivers = driversSorted.map(d => {
    if (d.count === 0) return { ...d, wl: 'idle' };
    if (_wlStdDev < 0.5) return { ...d, wl: 'balanced' };
    if (d.count > _wlMean + _wlStdDev) return { ...d, wl: 'over' };
    if (d.count < Math.max(1, _wlMean - _wlStdDev)) return { ...d, wl: 'under' };
    return { ...d, wl: 'balanced' };
  });
  const wlBalancedCount = classifiedDrivers.filter(d => d.wl === 'balanced').length;
  const wlOverCount = classifiedDrivers.filter(d => d.wl === 'over').length;
  const wlUnderCount = classifiedDrivers.filter(d => d.wl === 'under').length;

  const inactiveDrivers = [...driverMap.values()].filter(d => d.count === 0).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const inactiveVehicles = [...vehicleMap.values()].filter(v => v.count === 0).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const destAliases = _getAnalyticsAliases('destinations');
  const _destFreq = new Map();
  const _destLabel = new Map();
  for (const a of filteredAsg) {
    const raw = (a.destination || '').trim(); if (!raw) continue;
    let key = _normDestKey(raw); let label = raw;
    const c = _getAliasCanonical(destAliases[key]);
    if (c) { label = c; key = _normDestKey(label); }
    _destFreq.set(key, (_destFreq.get(key) || 0) + 1);
    if (!_destLabel.has(key)) _destLabel.set(key, label);
  }
  const destSorted = [..._destFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, f]) => [_destLabel.get(k) || k, f]);
  const hasDestData = destSorted.length > 0;

  const totalBidangReqs = filteredReqs.length;
  const bidangEnhanced = bidangSorted.map(b => ({
    ...b,
    reqPct: totalBidangReqs > 0 ? Math.round((b.reqCount / totalBidangReqs) * 100) : 0,
    asgPct: total > 0 ? Math.round((b.asgCount / total) * 100) : 0,
  }));

  const exportSnapshot = {
    compRate, total, completed, inProgress, scheduled, cancelled, openAsg,
    activeDrivers: activeDrivers.length, activeVehicles: activeVehicles.length,
    mostActiveDriver: mostActiveDrv ? { name: mostActiveDrv.displayName, count: mostActiveDrv.count } : null,
    leastActiveDriver: leastActiveDrv ? { name: leastActiveDrv.displayName, count: leastActiveDrv.count } : null,
    driverCounts: driversWithTrips.map(d => ({ name: d.displayName, count: d.count })),
    mostUsedVehicle: mostUsedVeh ? { name: mostUsedVeh.displayName, count: mostUsedVeh.count } : null,
    idleVehicles: inactiveVehicles.map(v => v.displayName),
    vehicleCounts: vehiclesWithTrips.map(v => ({ name: v.displayName, count: v.count })),
    bidang: bidangEnhanced.map(b => ({ name: b.name, reqCount: b.reqCount, asgCount: b.asgCount })),
  };

  const _driverOdo = new Map(), _vehicleOdo = new Map();
  for (const a of filteredAsg) {
    const km = a.distanceTravelled; if (km == null || km <= 0) continue;
    _driverOdo.set((a.driver || '').toLowerCase(), (_driverOdo.get((a.driver || '').toLowerCase()) || 0) + km);
    _vehicleOdo.set((a.vehicle || '').toLowerCase(), (_vehicleOdo.get((a.vehicle || '').toLowerCase()) || 0) + km);
  }
  const driverOdoList = driversSorted.map(d => ({ name: d.displayName, km: _driverOdo.get(d.displayName.toLowerCase()) || 0 })).filter(d => d.km > 0).sort((a, b) => b.km - a.km);
  const vehicleOdoList = vehiclesSorted.map(v => ({ name: v.displayName, km: _vehicleOdo.get(v.displayName.toLowerCase()) || 0 })).filter(v => v.km > 0).sort((a, b) => b.km - a.km);
  const totalKm = driverOdoList.reduce((s, d) => s + d.km, 0);
  const hasOdoData = totalKm > 0;
  const odoTripCount = filteredAsg.filter(a => a.distanceTravelled != null && a.distanceTravelled > 0).length;
  const avgKmPerTrip = hasOdoData && odoTripCount > 0 ? Math.round(totalKm / odoTripCount) : 0;

  const openRate = total > 0 ? Math.round((openAsg / total) * 100) : 0;

  const _driverAliases = _getAnalyticsAliases('drivers');
  const _vehicleAliases = _getAnalyticsAliases('vehicles');
  const _destDismissed = _getDismissedWarnings('destinations');
  const _bidangDismissed = _getDismissedWarnings('bidang');
  const _driverDismissed = _getDismissedWarnings('drivers');
  const _vehicleDismissed = _getDismissedWarnings('vehicles');

  const _dqWarnings = [];
  for (const { a, b } of _detectSimilarPairs([..._destFreq.keys()].map(k => _destLabel.get(k) || k))) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(destAliases[keyA]) || _getAliasCanonical(destAliases[keyB]) || null;
    _dqWarnings.push({ type: 'destinations', a, b, aliasActive, dismissed: _destDismissed[pairKey] || null, pairKey, countA: _destFreq.get(keyA) || 0, countB: _destFreq.get(keyB) || 0 });
  }
  for (const { a, b } of _detectSimilarPairs([...bidangReqCounts.keys()])) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(bidangAliases[keyA]) || _getAliasCanonical(bidangAliases[keyB]) || null;
    _dqWarnings.push({ type: 'bidang', a, b, aliasActive, dismissed: _bidangDismissed[pairKey] || null, pairKey, countA: bidangReqCounts.get(a) || 0, countB: bidangReqCounts.get(b) || 0 });
  }
  for (const { a, b } of _detectSimilarPairs(getDrivers().filter(d => d.active !== false && !d.archived).map(d => d.name || ''))) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(_driverAliases[keyA]) || _getAliasCanonical(_driverAliases[keyB]) || null;
    _dqWarnings.push({ type: 'drivers', a, b, aliasActive, dismissed: _driverDismissed[pairKey] || null, pairKey, countA: null, countB: null });
  }
  for (const { a, b } of _detectSimilarPairs(getActiveVehiclesFromStore().filter(v => !v.archived).map(v => v.name || ''))) {
    const keyA = _normDestKey(a), keyB = _normDestKey(b);
    const pairKey = [keyA, keyB].sort().join('|');
    const aliasActive = _getAliasCanonical(_vehicleAliases[keyA]) || _getAliasCanonical(_vehicleAliases[keyB]) || null;
    _dqWarnings.push({ type: 'vehicles', a, b, aliasActive, dismissed: _vehicleDismissed[pairKey] || null, pairKey, countA: null, countB: null });
  }
  const _allDismissed = [
    ...Object.entries(_destDismissed).map(([k, v]) => ({ type: 'destinations', pairKey: k, ...v })),
    ...Object.entries(_bidangDismissed).map(([k, v]) => ({ type: 'bidang', pairKey: k, ...v })),
    ...Object.entries(_driverDismissed).map(([k, v]) => ({ type: 'drivers', pairKey: k, ...v })),
    ...Object.entries(_vehicleDismissed).map(([k, v]) => ({ type: 'vehicles', pairKey: k, ...v })),
  ];
  const _allAliases = [
    ...Object.entries(destAliases).map(([k, v]) => ({ type: 'destinations', aliasKey: k, canonical: _getAliasCanonical(v), usageCount: _destFreq.get(_normDestKey(_getAliasCanonical(v) || k)) || 0, ..._getAliasMeta(v) })),
    ...Object.entries(bidangAliases).map(([k, v]) => ({ type: 'bidang', aliasKey: k, canonical: _getAliasCanonical(v), usageCount: bidangReqCounts.get(_getAliasCanonical(v) || k) || 0, ..._getAliasMeta(v) })),
    ...Object.entries(_driverAliases).map(([k, v]) => ({ type: 'drivers', aliasKey: k, canonical: _getAliasCanonical(v), usageCount: null, ..._getAliasMeta(v) })),
    ...Object.entries(_vehicleAliases).map(([k, v]) => ({ type: 'vehicles', aliasKey: k, canonical: _getAliasCanonical(v), usageCount: null, ..._getAliasMeta(v) })),
  ];
  const _dqMainWarnings = _dqWarnings.filter(w => !w.dismissed);
  const _dqUnresolvedCount = _dqMainWarnings.filter(w => !w.aliasActive).length;
  const _dqResolvedCount = _dqWarnings.filter(w => !!w.aliasActive).length;

  const activeDriversInPeriod = classifiedDrivers.filter(d => d.count > 0);
  const mostActiveBidang = bidangEnhanced[0] ?? null;
  const leastActiveBidang = bidangEnhanced.length > 1 ? bidangEnhanced[bidangEnhanced.length - 1] : null;

  return {
    render: {
      total, completed, inProgress, scheduled, cancelled, compRate, openRate, filteredReqs,
      driversWithTrips, vehiclesWithTrips, mostActiveDrv, leastActiveDrv, mostUsedVeh, leastUsedVeh,
      activeDrivers, activeVehicles, activeDriversInPeriod, inactiveDrivers, inactiveVehicles,
      wlBalancedCount, wlOverCount, wlUnderCount,
      bidangEnhanced, mostActiveBidang, leastActiveBidang,
      destSorted, hasDestData, _destFreq,
      driverOdoList, vehicleOdoList, totalKm, hasOdoData, odoTripCount, avgKmPerTrip,
      _dqMainWarnings, _dqUnresolvedCount, _dqResolvedCount, _allDismissed, _allAliases,
    },
    exportSnapshot,
  };
}

/* ── Comparison utilities ────────────────────────────────────────────────── */
function serialize(v) {
  return JSON.stringify(v, (k, val) => {
    if (val instanceof Map) return { __map__: [...val.entries()] };
    if (val && typeof val === 'object' && val.constructor === Object) {
      return Object.fromEntries(Object.keys(val).sort().map(kk => [kk, val[kk]]));
    }
    return val;
  });
}

const normalizeAssignmentStatus = (a) => {
  const s = a.status;
  if (!s || s === 'aktif') return { ...a, status: 'assigned' };
  if (s === 'selesai') return { ...a, status: 'completed' };
  return a;
};

/* ── Synthetic dataset ───────────────────────────────────────────────────── */
const drivers = [
  { name: 'Igo', active: true }, { name: 'Bayu', active: true },
  { name: 'Rendi', active: true }, { name: 'Dewi', active: true },
  { name: 'Surya', active: true }, { name: 'Igoo', active: true },     // fuzzy dup of Igo
  { name: 'Lukman', active: false }, { name: 'Eko', active: true, archived: true },
];
const vehicles = [
  { name: 'Innova' }, { name: 'Fortuner' }, { name: 'Hiace' },
  { name: 'Avanza' }, { name: 'Innovaa' },                              // fuzzy dup
];
const requests = [
  { id: 'r1', requesterName: 'Bidang Perencanaan Strategis', startDate: '2026-06-01', driver: 'Igo', vehicle: 'Innova' },
  { id: 'r2', requesterName: 'Bidang Perencanaan Strategis', startDate: '2026-06-03', driver: 'Bayu', vehicle: 'Fortuner' },
  { id: 'r3', requesterName: 'Bidang Pembinaan Prestasi', startDate: '2026-06-05', driver: 'Rendi', vehicle: 'Hiace' },
  { id: 'r4', requesterName: 'Bidang Pembinaan Prestasii', startDate: '2026-06-07', driver: 'Dewi', vehicle: 'Avanza' }, // fuzzy dup
  { id: 'r5', requesterName: 'Bidang Umum', createdAt: '2026-05-20T00:00:00Z', driver: 'Surya', vehicle: 'Innova' },
];
const assignments = [
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-01', status: 'completed', requestId: 'r1', destination: 'Pelatnas Cipayung', distanceTravelled: 40 },
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-02', status: 'completed', requestId: 'r1', destination: 'Pelatnas Cipayung', distanceTravelled: 42 },
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-04', status: 'started', requestId: 'r1', destination: 'Pelatnas - Cipayung', distanceTravelled: 0 }, // alias-ish
  { driver: 'Bayu', vehicle: 'Fortuner', date: '2026-06-03', status: 'assigned', requestId: 'r2', destination: 'Bandara Soekarno-Hatta', distanceTravelled: 60 },
  { driver: 'Rendi', vehicle: 'Hiace', date: '2026-06-05', status: 'selesai', requestId: 'r3', destination: 'Istora Senayan', distanceTravelled: 12 }, // legacy status
  { driver: 'Dewi', vehicle: 'Avanza', date: '2026-06-07', status: null, requestId: 'r4', destination: 'Istora Senayan', distanceTravelled: null }, // legacy null
  { driver: 'Surya', vehicle: 'Innova', date: '2026-05-20', status: 'completed', requestId: 'r5', destination: 'Kantor PBSI', distanceTravelled: 8 },
  { driver: 'Unknown', vehicle: 'Ghost', date: '2026-06-06', status: 'completed', destination: '', distanceTravelled: 5 }, // not in roster
];

const aliasesFull = {
  destinations: { 'pelatnas-cipayung': { canonical: 'Pelatnas Cipayung', createdAt: '2026-06-01T00:00:00Z', createdBy: 'Evan' } },
  bidang: {}, drivers: {}, vehicles: {},
};
const dismissedFull = {
  destinations: {}, bidang: {},
  drivers: { [['igo', 'igoo'].sort().join('|')]: { dismissedBy: 'Evan', dismissedAt: '2026-06-08T00:00:00Z', a: 'Igo', b: 'Igoo' } },
  vehicles: {},
};

const NOW = '2026-06-09T10:00:00Z';
const TODAY = '2026-06-09';
const base = {
  assignments, requests, drivers, vehicles,
  normalizeAssignmentStatus, now: NOW, today: TODAY,
};

const scenarios = [
  { name: 'all-data, no aliases', filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' }, aliases: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} }, dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} } },
  { name: 'all-data, with aliases + dismissed', filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: '30d window', filters: { dateRange: '30d', driver: '', vehicle: '', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: '7d window', filters: { dateRange: '7d', driver: '', vehicle: '', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: 'today only', filters: { dateRange: 'today', driver: '', vehicle: '', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: 'driver filter (Igo)', filters: { dateRange: 'all', driver: 'Igo', vehicle: '', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: 'vehicle filter (Innova)', filters: { dateRange: 'all', driver: '', vehicle: 'Innova', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: 'bidang filter', filters: { dateRange: 'all', driver: '', vehicle: '', bidang: 'Bidang Perencanaan Strategis' }, aliases: aliasesFull, dismissed: dismissedFull },
  { name: 'empty result (impossible filter)', filters: { dateRange: 'today', driver: 'Nobody', vehicle: '', bidang: '' }, aliases: aliasesFull, dismissed: dismissedFull },
];

/* ── Run ─────────────────────────────────────────────────────────────────── */
let failures = 0;
for (const sc of scenarios) {
  const ctx = { ...base, filters: sc.filters, aliases: sc.aliases, dismissed: sc.dismissed };

  // The engine derives `today`/`now` from the real clock; to compare against
  // the (clock-injected) reference, only use date-relative ranges where the
  // synthetic data falls fully inside or outside the window deterministically.
  // For 'all', driver/vehicle/bidang/empty scenarios, date math is irrelevant.
  // Both implementations share the injected clock (ctx.now / ctx.today), so
  // every scenario — including date-windowed ones — is asserted for exact
  // equality of the render projection and the PDF export snapshot.
  const oldOut = computeOld(ctx);
  const engineModel = computeAnalyticsModel(ctx);
  const newOut = { render: engineModel.render, exportSnapshot: engineModel.exportSnapshot };

  const snapMatch = serialize(oldOut.exportSnapshot) === serialize(newOut.exportSnapshot);
  const renderMatch = serialize(oldOut.render) === serialize(newOut.render);
  const ok = snapMatch && renderMatch;
  console.log(`${ok ? '✓' : '✗'} [${sc.name}] exportSnapshot=${snapMatch} render=${renderMatch}`);
  if (!ok) {
    failures++;
    if (!snapMatch) { console.log('  --- exportSnapshot OLD:', serialize(oldOut.exportSnapshot)); console.log('  --- exportSnapshot NEW:', serialize(newOut.exportSnapshot)); }
    if (!renderMatch) { console.log('  --- render OLD:', serialize(oldOut.render)); console.log('  --- render NEW:', serialize(newOut.render)); }
  }
}

console.log(failures === 0
  ? '\nPARITY OK — engine matches the original computation across all scenarios.'
  : `\nPARITY FAILED — ${failures} scenario(s) mismatched.`);
process.exit(failures === 0 ? 0 : 1);
