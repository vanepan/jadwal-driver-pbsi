/* ============================================================
   OVERTIME-CONFIG.JS — Domain constants & pure helpers

   Single source of truth for the Overtime Management module's
   enums and seed data. No DOM, no Firebase, no side effects —
   imported by the store, the service, and the UI alike.

   v1.25.2 — Domain Model Correction #2: Unit is a SIMPLE employee
   category (Engineering, Cleaning Service, ...) used only for
   filtering/grouping/analytics/reporting/entry — it is NOT an
   organizational unit, has NO relation to Department/User Management,
   and carries NO hierarchy. (v1.25.1's "Operational Unit" + Department
   FK was overengineering for a business process that never needed it —
   reverted in full; see [[overtime-management]] memory.)

   Sprint 1 (v1.25.0) — Module Skeleton + Unit Management.
   ============================================================ */

'use strict';

/** Units are NOT hardcoded business logic — this is only the first-run seed
    written to `overtimeUnits` once. After seeding, `overtimeUnits` (via
    overtime-store.js) is the sole source of truth; this array is never
    re-read. Purely a categorization list — filter/grouping/analytics/entry,
    nothing more. */
export const SEED_UNITS = [
  'Engineering', 'Cleaning Service', 'Gardener', 'Laundry', 'Kantin', 'Lapangan',
];

/** Audit action codes (mirrors the petty-cash-config.js AUDIT_ACTION pattern). */
export const AUDIT_ACTION = {
  UNIT_CREATED: 'unit_created',
  UNIT_UPDATED: 'unit_updated',
  UNIT_ACTIVATED: 'unit_activated',
  UNIT_DEACTIVATED: 'unit_deactivated',
  EMPLOYEE_CREATED: 'employee_created',
  EMPLOYEE_UPDATED: 'employee_updated',
  EMPLOYEE_ACTIVATED: 'employee_activated',
  EMPLOYEE_DEACTIVATED: 'employee_deactivated',
  EMPLOYEE_REORDERED: 'employee_reordered',
  RATE_VERSION_CREATED: 'rate_version_created',
  RATE_VERSION_UPDATED: 'rate_version_updated',
  RATE_VERSION_DELETED: 'rate_version_deleted',
  RATE_VERSION_RESTORED: 'rate_version_restored',
  HOLIDAY_CREATED: 'holiday_created',
  HOLIDAY_UPDATED: 'holiday_updated',
  HOLIDAY_ACTIVATED: 'holiday_activated',
  HOLIDAY_DEACTIVATED: 'holiday_deactivated',
  DAILY_ENTRY_SAVED: 'daily_entry_saved',
};

/** Human labels (id-ID) for audit actions. */
export const AUDIT_LABEL = {
  [AUDIT_ACTION.UNIT_CREATED]: 'Unit dibuat',
  [AUDIT_ACTION.UNIT_UPDATED]: 'Unit diperbarui',
  [AUDIT_ACTION.UNIT_ACTIVATED]: 'Unit diaktifkan',
  [AUDIT_ACTION.UNIT_DEACTIVATED]: 'Unit dinonaktifkan',
  [AUDIT_ACTION.EMPLOYEE_CREATED]: 'Karyawan ditambahkan',
  [AUDIT_ACTION.EMPLOYEE_UPDATED]: 'Karyawan diperbarui',
  [AUDIT_ACTION.EMPLOYEE_ACTIVATED]: 'Karyawan diaktifkan',
  [AUDIT_ACTION.EMPLOYEE_DEACTIVATED]: 'Karyawan dinonaktifkan',
  [AUDIT_ACTION.EMPLOYEE_REORDERED]: 'Urutan karyawan diubah',
  [AUDIT_ACTION.RATE_VERSION_CREATED]: 'Tarif baru dibuat',
  [AUDIT_ACTION.RATE_VERSION_UPDATED]: 'Catatan tarif diperbarui',
  [AUDIT_ACTION.RATE_VERSION_DELETED]: 'Tarif dihapus (soft)',
  [AUDIT_ACTION.RATE_VERSION_RESTORED]: 'Tarif dipulihkan',
  [AUDIT_ACTION.HOLIDAY_CREATED]: 'Hari libur ditambahkan',
  [AUDIT_ACTION.HOLIDAY_UPDATED]: 'Hari libur diperbarui',
  [AUDIT_ACTION.HOLIDAY_ACTIVATED]: 'Hari libur diaktifkan',
  [AUDIT_ACTION.HOLIDAY_DEACTIVATED]: 'Hari libur dinonaktifkan',
  [AUDIT_ACTION.DAILY_ENTRY_SAVED]: 'Entri lembur harian disimpan',
};

/** Accent color per audit action (matches the timeline dot convention). */
export const AUDIT_COLOR = {
  [AUDIT_ACTION.UNIT_CREATED]: '#2f7d5b',
  [AUDIT_ACTION.UNIT_UPDATED]: '#a9781a',
  [AUDIT_ACTION.UNIT_ACTIVATED]: '#2f7d5b',
  [AUDIT_ACTION.UNIT_DEACTIVATED]: '#8b857c',
  [AUDIT_ACTION.EMPLOYEE_CREATED]: '#2f7d5b',
  [AUDIT_ACTION.EMPLOYEE_UPDATED]: '#a9781a',
  [AUDIT_ACTION.EMPLOYEE_ACTIVATED]: '#2f7d5b',
  [AUDIT_ACTION.EMPLOYEE_DEACTIVATED]: '#8b857c',
  [AUDIT_ACTION.EMPLOYEE_REORDERED]: '#a9781a',
  [AUDIT_ACTION.RATE_VERSION_CREATED]: '#2f7d5b',
  [AUDIT_ACTION.RATE_VERSION_UPDATED]: '#a9781a',
  [AUDIT_ACTION.RATE_VERSION_DELETED]: '#9a1b2d',
  [AUDIT_ACTION.RATE_VERSION_RESTORED]: '#2f7d5b',
  [AUDIT_ACTION.HOLIDAY_CREATED]: '#2f7d5b',
  [AUDIT_ACTION.HOLIDAY_UPDATED]: '#a9781a',
  [AUDIT_ACTION.HOLIDAY_ACTIVATED]: '#2f7d5b',
  [AUDIT_ACTION.HOLIDAY_DEACTIVATED]: '#8b857c',
  [AUDIT_ACTION.DAILY_ENTRY_SAVED]: '#2f7d5b',
};

/** Holiday categories (spec: National Holiday / Collective Leave / Custom). */
export const HOLIDAY_TYPES = [
  { key: 'national', label: 'National Holiday' },
  { key: 'collective', label: 'Collective Leave' },
  { key: 'custom', label: 'Custom Holiday' },
];

/** The rate tier a holiday uses when no explicit override is chosen. */
export const DEFAULT_HOLIDAY_TIER_KEY = 'nationalHoliday';

/** Today as ISO yyyy-mm-dd (local) — same shape as petty-cash-config.js todayISO(). */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
