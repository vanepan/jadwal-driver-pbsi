'use strict';

/* ============================================================
   MAINTENANCE-ANALYTICS.JS — Fleet Maintenance Intelligence (v1.18.1)
   
   PURE analytics layer. Aggregations for dashboard KPI cards,
   charts, and distributions. No DOM, no Firebase, Node-testable.
   ============================================================ */

function str(v) { return v == null ? '' : String(v).trim(); }

/**
 * Build complete maintenance analytics from fleet.
 * @param {Array} vehicles - All vehicles (with maintenanceRecords[])
 * @param {Date|string|number} now - Reference time
 * @returns {Object} Complete analytics object
 */
export function buildMaintenanceAnalytics(vehicles, now) {
  if (!Array.isArray(vehicles)) vehicles = [];

  // Flatten all maintenance records
  const allRecords = vehicles.reduce((acc, v) => {
    if (Array.isArray(v.maintenanceRecords)) {
      acc.push(
        ...v.maintenanceRecords.map(r => ({
          ...r,
          vehicleId: v.id,
          vehicleName: v.name
        }))
      );
    }
    return acc;
  }, []);

  const now_ms = new Date(now || Date.now()).getTime();
  const today = new Date(now_ms);
  today.setHours(0, 0, 0, 0);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  // KPI calculations
  const vehiclesUnderMaint = vehicles.filter(v => str(v.status).toLowerCase() === 'maintenance').length;
  
  const completedThisMonth = allRecords.filter(r => {
    if (str(r.status).toLowerCase() !== 'completed') return false;
    const d = new Date(r.date);
    return d >= monthAgo && d <= today;
  }).length;
  
  const planned = allRecords.filter(r => str(r.status).toLowerCase() === 'planned').length;
  
  const completedRecords = allRecords.filter(r => str(r.status).toLowerCase() === 'completed');
  const totalCost = completedRecords.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
  const avgCost = completedRecords.length > 0 ? Math.round(totalCost / completedRecords.length) : 0;

  // Most common category (among completed)
  let mostCommonCategory = { label: 'N/A', count: 0 };
  if (completedRecords.length > 0) {
    const categoryCount = {};
    completedRecords.forEach(r => {
      const cat = str(r.category).toLowerCase();
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      mostCommonCategory = {
        label: sorted[0][0],
        count: sorted[0][1]
      };
    }
  }

  // Highest cost vehicle
  let highestCostVehicle = { name: 'N/A', totalCost: 0 };
  if (completedRecords.length > 0) {
    const vehicleCosts = {};
    completedRecords.forEach(r => {
      const vname = r.vehicleName || 'Unknown';
      vehicleCosts[vname] = (vehicleCosts[vname] || 0) + (Number(r.cost) || 0);
    });
    const sorted = Object.entries(vehicleCosts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      highestCostVehicle = {
        name: sorted[0][0],
        totalCost: sorted[0][1]
      };
    }
  }

  return {
    vehiclesUnderMaintenance: vehiclesUnderMaint,
    completedThisMonth,
    plannedUpcoming: planned,
    averageMaintenanceCost: avgCost,
    mostCommonCategory,
    highestCostVehicle,
    categoryDistribution: categoryDistribution(completedRecords),
    workshopDistribution: workshopDistribution(completedRecords),
    monthlyCostTrend: monthlyCostTrend(completedRecords, now),
    vehicleCostRanking: vehicleCostRanking(completedRecords),
    maintenanceFrequency: maintenanceFrequency(allRecords)
  };
}

/**
 * Category distribution (horizontal bar chart data).
 * @param {Array} records - Maintenance records
 * @returns {Array} [{label, count, tone}, ...]
 */
export function categoryDistribution(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const dist = {};
  records.forEach(r => {
    const cat = str(r.category).toLowerCase();
    dist[cat] = (dist[cat] || 0) + 1;
  });

  return Object.entries(dist)
    .map(([cat, count]) => ({
      label: cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      count,
      tone: 'info'
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Workshop distribution (horizontal bar chart data).
 * @param {Array} records - Maintenance records
 * @returns {Array} [{label, count}, ...]
 */
export function workshopDistribution(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const dist = {};
  records.forEach(r => {
    const ws = str(r.workshopName);
    dist[ws] = (dist[ws] || 0) + 1;
  });

  return Object.entries(dist)
    .map(([ws, count]) => ({
      label: ws || 'Unknown Workshop',
      count
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Monthly cost trend (past 12 months).
 * @param {Array} records - Maintenance records (completed only)
 * @param {Date|string|number} now - Reference time
 * @returns {Array} [{month: 'Jan', year: 2026, cost: N}, ...]
 */
export function monthlyCostTrend(records, now) {
  const now_ms = new Date(now || Date.now()).getTime();
  const today = new Date(now_ms);

  // Build 12-month window
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today);
    d.setMonth(d.getMonth() - i);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      monthStr: d.toLocaleDateString('id-ID', { month: 'short' })
    });
  }

  // Group records by month
  const costs = {};
  if (Array.isArray(records)) {
    records.forEach(r => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      costs[key] = (costs[key] || 0) + (Number(r.cost) || 0);
    });
  }

  // Build result
  return months.map(m => {
    const key = `${m.year}-${m.month}`;
    return {
      month: m.monthStr,
      year: m.year,
      cost: costs[key] || 0
    };
  });
}

/**
 * Vehicle cost ranking (all vehicles, sorted by total maintenance cost).
 * @param {Array} records - Maintenance records with vehicleName
 * @returns {Array} [{vehicleName, totalCost}, ...]
 */
export function vehicleCostRanking(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const costs = {};
  records.forEach(r => {
    const vname = r.vehicleName || 'Unknown';
    costs[vname] = (costs[vname] || 0) + (Number(r.cost) || 0);
  });

  return Object.entries(costs)
    .map(([vname, totalCost]) => ({
      vehicleName: vname,
      totalCost
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Maintenance frequency (average days between records).
 * @param {Array} records - Maintenance records
 * @returns {string} Frequency description or "No data"
 */
export function maintenanceFrequency(records) {
  if (!Array.isArray(records) || records.length < 2) {
    return 'No data';
  }

  const sorted = records
    .filter(r => r.date)
    .sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return aTime - bTime;
    });

  if (sorted.length < 2) return 'No data';

  let totalDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date).getTime();
    const curr = new Date(sorted[i].date).getTime();
    totalDays += Math.abs(curr - prev) / 86400000;
  }

  const avgDays = Math.round(totalDays / (sorted.length - 1));
  if (avgDays < 30) return 'Every week';
  if (avgDays < 60) return 'Every month';
  if (avgDays < 180) return 'Every 3 months';
  if (avgDays < 365) return 'Every 6 months';
  return 'Annually';
}

console.info('Maintenance analytics module loaded');
