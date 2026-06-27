'use strict';

/* ============================================================
   MAINTENANCE-SERVICE.JS — Fleet Maintenance Intelligence (v1.18.1)
   
   PURE service layer for maintenance records. All business logic,
   no DOM, no Firebase, no `window`. Node-testable.
   
   Exports:
   - normalizeMaintenanceRecord(raw, now)
   - validateMaintenanceRecord(raw)
   - computeMaintenanceTimeline(records, now)
   - deriveMaintenanceSummary(records)
   - computeMaintenanceHealth(records, now)
   ============================================================ */

import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_IMPACTS,
  maintenanceCategoryInfo,
  maintenanceStatusInfo,
  maintenanceImpactInfo,
  deriveTypeFromCategory,
  deriveImpactFromCategory
} from '../config/maintenance-config.js';

function str(v) { return v == null ? '' : String(v).trim(); }

function nowMs(now) {
  const t = new Date(now || Date.now()).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function daysAgo(dateStr, now) {
  const s = str(dateStr);
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((nowMs(now) - t) / 86400000);
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCost(cost) {
  if (!cost || cost === 0) return 'Rp 0';
  return 'Rp ' + Math.round(cost).toLocaleString('id-ID');
}

/* ── Validation ────────────────────────────────────────────────────────── */

/**
 * Validate a maintenance record.
 * @param {Object} raw - Candidate record
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateMaintenanceRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Record is not an object'], warnings: [] };
  }

  const errors = [];
  const warnings = [];

  const dateStr = str(raw.date);
  if (!dateStr) {
    errors.push('Date is required (ISO YYYY-MM-DD)');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.push('Date must be ISO format YYYY-MM-DD');
  } else {
    const d = new Date(dateStr);
    if (!Number.isFinite(d.getTime())) {
      errors.push('Date is invalid');
    }
  }

  const category = str(raw.category).toLowerCase();
  if (!category) {
    errors.push('Category is required');
  } else if (!MAINTENANCE_CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${MAINTENANCE_CATEGORIES.join(', ')}`);
  }

  const status = str(raw.status).toLowerCase();
  if (!status) {
    errors.push('Status is required');
  } else if (!MAINTENANCE_STATUSES.includes(status)) {
    errors.push(`Status must be one of: ${MAINTENANCE_STATUSES.join(', ')}`);
  }

  const workshopId = str(raw.workshopId);
  if (!workshopId) {
    errors.push('Workshop ID is required');
  }

  const workshopName = str(raw.workshopName);
  if (!workshopName) {
    errors.push('Workshop name is required');
  }

  const officer = str(raw.officer);
  if (!officer) {
    errors.push('Officer is required');
  }

  const description = str(raw.description);
  if (!description) {
    errors.push('Description is required');
  }

  const cost = Number(raw.cost);
  if (Number.isNaN(cost)) {
    errors.push('Cost must be a number');
  } else if (cost < 0) {
    errors.push('Cost cannot be negative');
  } else if (cost === 0) {
    warnings.push('Cost is 0 — verify this is intentional');
  } else if (cost < 100000) {
    warnings.push('Cost is very low — likely data entry error');
  } else if (cost > 50000000) {
    warnings.push('Cost is very high (>50M) — verify accuracy');
  }

  if (raw.odometer != null) {
    const odo = Number(raw.odometer);
    if (Number.isNaN(odo)) {
      warnings.push('Odometer is not a valid number');
    } else if (odo < 0) {
      warnings.push('Odometer cannot be negative');
    } else if (odo === 0) {
      warnings.push('Odometer is 0 — verify this is correct');
    }
  }

  if (raw.impact != null) {
    const impact = str(raw.impact).toLowerCase();
    if (!MAINTENANCE_IMPACTS.includes(impact)) {
      warnings.push(`Impact should be one of: ${MAINTENANCE_IMPACTS.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/* ── Normalization ────────────────────────────────────────────────────── */

/**
 * Turn a raw maintenance record into the canonical form.
 * @param {Object} raw - Raw record from store
 * @param {Date|string|number} now - Reference time
 * @returns {Object|null} Normalized record or null if invalid
 */
export function normalizeMaintenanceRecord(raw, now) {
  if (!raw || typeof raw !== 'object') return null;

  const category = str(raw.category).toLowerCase();
  if (!MAINTENANCE_CATEGORIES.includes(category)) return null;

  const status = str(raw.status).toLowerCase();
  if (!MAINTENANCE_STATUSES.includes(status)) return null;

  const date = str(raw.date);
  if (!date) return null;

  const type = deriveTypeFromCategory(category);
  const categoryInfo = maintenanceCategoryInfo(category);
  const statusInfo = maintenanceStatusInfo(status);
  
  // Impact: use provided, or fall back to category default
  let impact = raw.impact ? str(raw.impact).toLowerCase() : null;
  if (!impact || !MAINTENANCE_IMPACTS.includes(impact)) {
    impact = categoryInfo.defaultImpact || 'minor';
  }
  const impactInfo = maintenanceImpactInfo(impact);

  const odometer = raw.odometer == null ? null : Number(raw.odometer);
  const cost = Number(raw.cost) || 0;

  return {
    id: str(raw.id),
    vehicleId: str(raw.vehicleId),
    date,
    daysAgo: daysAgo(date, now),
    category,
    categoryLabel: categoryInfo.label,
    categoryIcon: categoryInfo.icon,
    type,
    typeLabel: str(type),
    impact,
    impactLabel: impactInfo.label,
    impactTone: impactInfo.tone,
    status,
    statusLabel: statusInfo.label,
    statusTone: statusInfo.tone,
    workshopId: str(raw.workshopId),
    workshopName: esc(str(raw.workshopName)),
    officer: esc(str(raw.officer)),
    description: esc(str(raw.description)),
    notes: esc(str(raw.notes)),
    odometer,
    odometerEstimated: raw.odometerEstimated === true,
    cost,
    costDisplay: formatCost(cost),
    costBreakdown: raw.costBreakdown || null,
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    // Reserved fields (always null in v1.18.1):
    mediaIds: raw.mediaIds || null,
    inspectionReport: raw.inspectionReport || null,
    reminderStatus: raw.reminderStatus || null,
    reminderSentDate: raw.reminderSentDate || null,
    reminderDismissedDate: raw.reminderDismissedDate || null,
    recommendedIntervalKm: raw.recommendedIntervalKm || categoryInfo.defaultIntervalKm,
    recommendedIntervalDays: raw.recommendedIntervalDays || categoryInfo.defaultIntervalDays
  };
}

/* ── Timeline ────────────────────────────────────────────────────────── */

/**
 * Compute maintenance timeline from records (newest first, excludes cancelled).
 * @param {Array} records - Maintenance records
 * @param {Date|string|number} now - Reference time
 * @returns {Array} Normalized timeline
 */
export function computeMaintenanceTimeline(records, now) {
  if (!Array.isArray(records)) return [];
  
  const timeline = records
    .map(r => normalizeMaintenanceRecord(r, now))
    .filter(r => r !== null && r.status !== 'cancelled')
    .sort((a, b) => {
      // Newest first
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return bTime - aTime;
    });

  return timeline;
}

/* ── Summary ────────────────────────────────────────────────────────── */

/**
 * Derive maintenance summary from records.
 * @param {Array} records - Maintenance records
 * @returns {Object} Summary statistics
 */
export function deriveMaintenanceSummary(records) {
  // v1.18.1 — null-element safety. RTDB arrays with deleted indices arrive as
  // holes (e.g. [null, {...}]); filtering null/non-object elements here prevents
  // the downstream `str(r.status)` reads from throwing on a null record (which
  // aborted normalizeVehicleAsset → blank Fleet Dashboard + inventory).
  records = (Array.isArray(records) ? records : []).filter(r => r && typeof r === 'object');
  if (records.length === 0) {
    return {
      lastDate: null,
      lastCategory: null,
      lastCategoryLabel: null,
      lastWorkshop: null,
      lastCost: null,
      lastCostDisplay: null,
      totalRecords: 0,
      totalCost: 0,
      completedCount: 0,
      plannedCount: 0,
      inProgressCount: 0,
      cancelledCount: 0,
      averageCost: 0,
      hasRecords: false
    };
  }

  const completed = records.filter(r => str(r.status).toLowerCase() === 'completed');
  if (completed.length === 0) {
    return {
      lastDate: null,
      lastCategory: null,
      lastCategoryLabel: null,
      lastWorkshop: null,
      lastCost: null,
      lastCostDisplay: null,
      totalRecords: records.length,
      totalCost: 0,
      completedCount: 0,
      plannedCount: records.filter(r => str(r.status).toLowerCase() === 'planned').length,
      inProgressCount: records.filter(r => str(r.status).toLowerCase() === 'in-progress').length,
      cancelledCount: records.filter(r => str(r.status).toLowerCase() === 'cancelled').length,
      averageCost: 0,
      hasRecords: true
    };
  }

  // Get newest completed record
  const latest = completed.reduce((a, b) => {
    const aTime = new Date(a.date || 0).getTime();
    const bTime = new Date(b.date || 0).getTime();
    return aTime > bTime ? a : b;
  });

  const categoryInfo = maintenanceCategoryInfo(latest.category);
  const totalCost = records.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
  const avgCost = completed.length > 0 ? Math.round(totalCost / completed.length) : 0;

  return {
    lastDate: latest.date,
    lastCategory: latest.category,
    lastCategoryLabel: categoryInfo.label,
    lastWorkshop: str(latest.workshopName),
    lastCost: Number(latest.cost) || 0,
    lastCostDisplay: formatCost(Number(latest.cost) || 0),
    totalRecords: records.length,
    totalCost,
    completedCount: completed.length,
    plannedCount: records.filter(r => str(r.status).toLowerCase() === 'planned').length,
    inProgressCount: records.filter(r => str(r.status).toLowerCase() === 'in-progress').length,
    cancelledCount: records.filter(r => str(r.status).toLowerCase() === 'cancelled').length,
    averageCost: avgCost,
    hasRecords: true
  };
}

/* ── Health Scoring ────────────────────────────────────────────────────── */

/**
 * Compute maintenance health contribution (0-100).
 * Higher is better (Unified Scoring philosophy).
 * 
 * Components:
 * - Recency: Last maintenance <= 90 days → 100, 180 days → 50, >1 year → 20
 * - Frequency: Planned + in-progress → indicates good stewardship → +10
 * - Compliance: Zero planned overdue → +20
 * 
 * @param {Array} records - Maintenance records
 * @param {Date|string|number} now - Reference time
 * @returns {{score: number, label: string, tone: string, components: Object}}
 */
export function computeMaintenanceHealth(records, now) {
  // v1.18.1 — null-element safety (see deriveMaintenanceSummary): drop RTDB
  // array holes so the `str(r.status)` filters below never deref a null record.
  records = (Array.isArray(records) ? records : []).filter(r => r && typeof r === 'object');
  if (records.length === 0) {
    return {
      score: 50,
      label: 'Unknown',
      tone: 'muted',
      components: { recency: 50, frequency: 0, compliance: 0 }
    };
  }

  const completed = records.filter(r => str(r.status).toLowerCase() === 'completed');
  if (completed.length === 0) {
    return {
      score: 30,
      label: 'Poor',
      tone: 'danger',
      components: { recency: 30, frequency: 0, compliance: 0 }
    };
  }

  // Recency: days since last maintenance
  const latest = completed.reduce((a, b) => {
    const aTime = new Date(a.date || 0).getTime();
    const bTime = new Date(b.date || 0).getTime();
    return aTime > bTime ? a : b;
  });

  const days = daysAgo(latest.date, now);
  let recencyScore = 100;
  if (days >= 365) recencyScore = 20;  // >1 year without maintenance
  else if (days >= 180) recencyScore = 50;  // 6 months
  else if (days >= 90) recencyScore = 80;  // 3 months
  // else: <= 90 days = 100

  // Frequency: do we have planned/in-progress (indicates proactive approach)?
  const planned = records.filter(r => str(r.status).toLowerCase() === 'planned');
  const inProgress = records.filter(r => str(r.status).toLowerCase() === 'in-progress');
  const frequencyBonus = (planned.length > 0 || inProgress.length > 0) ? 10 : 0;

  // Compliance: ratio of preventive vs. corrective
  const preventive = records.filter(r => {
    const type = deriveTypeFromCategory(str(r.category).toLowerCase());
    return type === 'preventive';
  });
  const preventiveRatio = records.length > 0 ? preventive.length / records.length : 0;
  let complianceScore = Math.round(preventiveRatio * 20);  // 0-20 points

  // Final score
  const score = Math.min(100, Math.round((recencyScore * 0.6 + frequencyBonus + complianceScore)));
  let label, tone;

  if (score >= 80) {
    label = 'Excellent';
    tone = 'ok';
  } else if (score >= 60) {
    label = 'Good';
    tone = 'ok';
  } else if (score >= 40) {
    label = 'Fair';
    tone = 'warn';
  } else {
    label = 'Poor';
    tone = 'danger';
  }

  return {
    score,
    label,
    tone,
    components: {
      recency: recencyScore,
      frequency: frequencyBonus,
      compliance: complianceScore
    }
  };
}

console.info('Maintenance service module loaded');
