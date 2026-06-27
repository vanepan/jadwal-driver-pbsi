'use strict';

/* ============================================================
   MAINTENANCE-CONFIG.JS — Fleet Maintenance Intelligence (v1.18.1)
   
   Central configuration for maintenance records: categories, types,
   statuses, default intervals, and impact levels.
   
   Maintenance records are embedded in Vehicle Store (not separate).
   This registry provides the schema and defaults for all records.
   ============================================================ */

// Maintenance Categories (13 types)
export const MAINTENANCE_CATEGORIES = Object.freeze([
  'periodic-service',
  'oil-change',
  'tire-replacement',
  'brake',
  'battery',
  'engine',
  'transmission',
  'suspension',
  'electrical',
  'body-repair',
  'air-conditioning',
  'inspection',
  'other'
]);

// Maintenance Types (strategic classification)
export const MAINTENANCE_TYPES = Object.freeze([
  'preventive',   // scheduled, routine
  'corrective',   // reactive, after failure
  'emergency',    // safety-critical, immediate
  'predictive'    // based on monitoring (future)
]);

// Maintenance Statuses (lifecycle)
export const MAINTENANCE_STATUSES = Object.freeze([
  'planned',
  'in-progress',
  'completed',
  'cancelled'
]);

// Impact Levels (severity classification)
export const MAINTENANCE_IMPACTS = Object.freeze([
  'minor',
  'medium',
  'major',
  'critical'
]);

/* ── Category Registry ────────────────────────────────────────────────── */

export const MAINTENANCE_CATEGORY_REGISTRY = Object.freeze([
  {
    key: 'periodic-service',
    label: 'Periodic Service',
    type: 'preventive',
    icon: '🔧',
    defaultImpact: 'minor',
    defaultIntervalKm: 40000,
    defaultIntervalDays: 180
  },
  {
    key: 'oil-change',
    label: 'Oil Change',
    type: 'preventive',
    icon: '🛢️',
    defaultImpact: 'minor',
    defaultIntervalKm: 10000,
    defaultIntervalDays: 180
  },
  {
    key: 'tire-replacement',
    label: 'Tire Replacement',
    type: 'corrective',
    icon: '🛞',
    defaultImpact: 'medium',
    defaultIntervalKm: 80000,
    defaultIntervalDays: 0
  },
  {
    key: 'brake',
    label: 'Brake',
    type: 'corrective',
    icon: '🛑',
    defaultImpact: 'major',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  },
  {
    key: 'battery',
    label: 'Battery',
    type: 'corrective',
    icon: '🔋',
    defaultImpact: 'medium',
    defaultIntervalKm: 100000,
    defaultIntervalDays: 1095  // ~3 years
  },
  {
    key: 'engine',
    label: 'Engine',
    type: 'corrective',
    icon: '⚙️',
    defaultImpact: 'critical',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  },
  {
    key: 'transmission',
    label: 'Transmission',
    type: 'corrective',
    icon: '⚡',
    defaultImpact: 'critical',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  },
  {
    key: 'suspension',
    label: 'Suspension',
    type: 'corrective',
    icon: '🚙',
    defaultImpact: 'medium',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  },
  {
    key: 'electrical',
    label: 'Electrical',
    type: 'corrective',
    icon: '💡',
    defaultImpact: 'medium',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  },
  {
    key: 'body-repair',
    label: 'Body Repair',
    type: 'corrective',
    icon: '🔨',
    defaultImpact: 'minor',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  },
  {
    key: 'air-conditioning',
    label: 'Air Conditioning',
    type: 'preventive',
    icon: '❄️',
    defaultImpact: 'medium',
    defaultIntervalKm: 0,
    defaultIntervalDays: 365
  },
  {
    key: 'inspection',
    label: 'Inspection',
    type: 'preventive',
    icon: '🔍',
    defaultImpact: 'minor',
    defaultIntervalKm: 40000,
    defaultIntervalDays: 365
  },
  {
    key: 'other',
    label: 'Other',
    type: 'corrective',
    icon: '📝',
    defaultImpact: 'minor',
    defaultIntervalKm: 0,
    defaultIntervalDays: 0
  }
]);

/* ── Type Registry ────────────────────────────────────────────────── */

export const MAINTENANCE_TYPE_REGISTRY = Object.freeze([
  {
    key: 'preventive',
    label: 'Preventive',
    tone: 'ok',
    description: 'Scheduled, routine maintenance'
  },
  {
    key: 'corrective',
    label: 'Corrective',
    tone: 'warn',
    description: 'Reactive, after failure'
  },
  {
    key: 'emergency',
    label: 'Emergency',
    tone: 'danger',
    description: 'Safety-critical, immediate'
  },
  {
    key: 'predictive',
    label: 'Predictive',
    tone: 'info',
    description: 'Based on monitoring (future)'
  }
]);

/* ── Status Registry ────────────────────────────────────────────────── */

export const MAINTENANCE_STATUS_REGISTRY = Object.freeze([
  {
    key: 'planned',
    label: 'Planned',
    tone: 'info'
  },
  {
    key: 'in-progress',
    label: 'In Progress',
    tone: 'warn'
  },
  {
    key: 'completed',
    label: 'Completed',
    tone: 'ok'
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    tone: 'muted'
  }
]);

/* ── Impact Registry ────────────────────────────────────────────────── */

export const MAINTENANCE_IMPACT_REGISTRY = Object.freeze([
  {
    key: 'minor',
    label: 'Minor',
    tone: 'ok',
    description: 'Routine fix, no operational impact'
  },
  {
    key: 'medium',
    label: 'Medium',
    tone: 'warn',
    description: 'Moderate impact, repair needed'
  },
  {
    key: 'major',
    label: 'Major',
    tone: 'warn',
    description: 'Significant impact, critical repair'
  },
  {
    key: 'critical',
    label: 'Critical',
    tone: 'danger',
    description: 'Safety-critical, urgent attention'
  }
]);

/* ── Lookup Functions ────────────────────────────────────────────────── */

/**
 * Get registry entry for a maintenance category.
 * @param {string} key - Category key
 * @returns {Object} Registry entry (never null, falls back to 'other')
 */
export function maintenanceCategoryInfo(key) {
  const entry = MAINTENANCE_CATEGORY_REGISTRY.find(c => c.key === key);
  return entry || MAINTENANCE_CATEGORY_REGISTRY[MAINTENANCE_CATEGORY_REGISTRY.length - 1];
}

/**
 * Get registry entry for a maintenance type.
 * @param {string} key - Type key
 * @returns {Object} Registry entry (never null, falls back to 'corrective')
 */
export function maintenanceTypeInfo(key) {
  const entry = MAINTENANCE_TYPE_REGISTRY.find(t => t.key === key);
  return entry || MAINTENANCE_TYPE_REGISTRY[1];
}

/**
 * Get registry entry for a maintenance status.
 * @param {string} key - Status key
 * @returns {Object} Registry entry (never null, falls back to 'completed')
 */
export function maintenanceStatusInfo(key) {
  const entry = MAINTENANCE_STATUS_REGISTRY.find(s => s.key === key);
  return entry || MAINTENANCE_STATUS_REGISTRY[2];
}

/**
 * Get registry entry for a maintenance impact.
 * @param {string} key - Impact key or null
 * @returns {Object} Registry entry (never null, falls back to 'minor')
 */
export function maintenanceImpactInfo(key) {
  if (!key) return MAINTENANCE_IMPACT_REGISTRY[0];
  const entry = MAINTENANCE_IMPACT_REGISTRY.find(i => i.key === key);
  return entry || MAINTENANCE_IMPACT_REGISTRY[0];
}

/**
 * Derive maintenance type from category.
 * @param {string} categoryKey - Category key
 * @returns {string} Type key (preventive|corrective|emergency|predictive)
 */
export function deriveTypeFromCategory(categoryKey) {
  const category = maintenanceCategoryInfo(categoryKey);
  return category.type || 'corrective';
}

/**
 * Derive default impact from category.
 * @param {string} categoryKey - Category key
 * @returns {string} Impact key (minor|medium|major|critical)
 */
export function deriveImpactFromCategory(categoryKey) {
  const category = maintenanceCategoryInfo(categoryKey);
  return category.defaultImpact || 'minor';
}

console.info('Maintenance configuration module loaded');
