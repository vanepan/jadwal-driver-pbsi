/* ============================================================
   OVERTIME-SERVICE.JS — Domain orchestration

   The only module that mutates Overtime Management state with
   business meaning. The UI calls these intents; persistence + realtime
   echo are handled by the store. Every state-changing intent writes a
   global audit entry (overtimeAudit) — mirrors
   js/petty-cash/petty-cash-service.js's buildAudit/writeAudit pattern.

   v1.25.2 — Domain Model Correction #2: Unit is a flat employee
   category (no Department relation — see overtime-config.js header).
   Employee is the module's PRIMARY master data (Sprint 2). Rate Engine
   (Sprint 3) is append-only versioned — "changing a rate" always means
   creating a new version, never mutating an existing one's amount.

   Sprint 1 (v1.25.0) — Unit Management domain rules.
   Sprint 2 — Employee Management domain rules.
   Sprint 3 — Rate Engine + Versioning domain rules.
   ============================================================ */

'use strict';

import { getCurrentUser } from '../auth.js';
import { APP_VERSION } from '../config.js';
import { AUDIT_ACTION, AUDIT_LABEL, AUDIT_COLOR, HOLIDAY_TYPES, DEFAULT_HOLIDAY_TIER_KEY, CLOSING_STATUS, RECORD_STATUS } from './overtime-config.js';
import {
  RATE_TIERS, DEFAULT_TIER_KEY, isValidTierKey, tierLabel, resolveActiveRateVersion, versionsForTier,
  resolveDefaultRateVersion,
} from './overtime-rate-engine.js';
import {
  genId, getUnits, getEmployees, getRateVersions, getHolidays, getRecords,
  getDailySummary, getMonthlySummary, getAllDailySummaries, getAllMonthlySummaries, getAudit,
  getBudget, getReportHistory, getClosing, getAllClosings, getArchive, getAllArchives,
  putUnit, putEmployee, putRateVersion, putHoliday, putAudit, putBudget,
  putReportHistoryEntry, applyOvertimeUpdates,
} from './overtime-store.js';
import {
  emptySummary, addRecordToSummary, subtractRecordFromSummary, buildSummaryFromRecords, mergeSummaries,
  reconcileSummaryEdit,
  topUnits as rankTopUnits, topEmployees as rankTopEmployees,
  sumDailySummariesInRange, weekRangeContaining, monthRangeOf, yearRangeOf,
  buildTrendSeries, buildHeatmapGrid, buildBudgetAnalytics, buildExecutiveCards,
} from './overtime-analytics-engine.js';
import {
  validateMonthForClosing, buildClosingSnapshot, findDuplicateRecords,
} from './overtime-closing-engine.js';

/* ── Identity helpers (mirrors petty-cash-service.js currentActor/actorLabel) ── */
function currentActor() {
  const u = getCurrentUser();
  if (!u) return { id: null, name: 'Sistem', role: '' };
  return { id: u.username || null, name: u.displayName || u.username || 'Admin', role: u.role || '' };
}
function actorLabel() {
  const a = currentActor();
  return a.role === 'admin' ? `${a.name} · Admin` : a.name;
}
/** The stable identifier stored on createdBy/updatedBy fields (username, not a display label). */
function actorId() { return currentActor().id; }

/* ── Audit ──────────────────────────────────────────────────────── */
function buildAudit(action, entityType, entityId, note) {
  return {
    id: genId('audit'),
    action,
    label: AUDIT_LABEL[action] || action,
    color: AUDIT_COLOR[action] || '#5b5953',
    note: note || '',
    user: actorLabel(),
    entityType,
    entityId: entityId || null,
    timestamp: Date.now(),
  };
}
async function writeAudit(action, entityType, entityId, note) {
  await putAudit(buildAudit(action, entityType, entityId, note));
}

/** Audit entries for one entity, newest last (timeline order). */
export function getEntityAudit(entityType, entityId) {
  return getAudit()
    .filter(a => a.entityType === entityType && a.entityId === entityId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/* ── Unit Management (flat employee category — NOT an org unit) ──── */

/** Active + inactive units, sorted by sortOrder then name. */
export function listUnits({ includeInactive = true } = {}) {
  return getUnits()
    .filter(u => includeInactive || u.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'id'));
}

/** Active units only — the set Daily Entry (later sprints) picks from. */
export function listActiveUnits() {
  return listUnits({ includeInactive: false });
}

export function getUnitLabel(unitId) {
  const u = getUnits().find(x => x.id === unitId);
  return u ? u.name : null;
}

function normalizedName(name) { return String(name || '').trim(); }

/** True when another unit already uses this name (case-insensitive), excluding `excludeId`. */
function isDuplicateUnitName(name, excludeId) {
  const norm = normalizedName(name).toLowerCase();
  return getUnits().some(u => u.id !== excludeId && String(u.name).trim().toLowerCase() === norm);
}

/**
 * Create a new unit. Throws a user-facing message (id-ID) on invalid input —
 * callers (the UI) catch and surface `err.message` inline, matching the
 * petty-cash form validation convention.
 */
export async function createUnit({ name }) {
  const trimmed = normalizedName(name);
  if (!trimmed) throw new Error('Nama unit wajib diisi.');
  if (isDuplicateUnitName(trimmed)) throw new Error('Nama unit sudah digunakan.');

  const now = Date.now();
  const existing = listUnits();
  const maxOrder = existing.reduce((m, u) => Math.max(m, u.sortOrder ?? 0), -1);
  const unit = {
    id: genId('unit'), name: trimmed, isActive: true,
    sortOrder: maxOrder + 1, createdAt: now, updatedAt: now,
  };
  await putUnit(unit);
  await writeAudit(AUDIT_ACTION.UNIT_CREATED, 'unit', unit.id, `Unit "${trimmed}" dibuat.`);
  return unit;
}

/** Rename an existing unit. */
export async function updateUnit(id, { name }) {
  const unit = getUnits().find(u => u.id === id);
  if (!unit) throw new Error('Unit tidak ditemukan.');
  const trimmed = normalizedName(name);
  if (!trimmed) throw new Error('Nama unit wajib diisi.');
  if (isDuplicateUnitName(trimmed, id)) throw new Error('Nama unit sudah digunakan.');

  const prevName = unit.name;
  const next = { ...unit, name: trimmed, updatedAt: Date.now() };
  await putUnit(next);
  if (prevName !== trimmed) {
    await writeAudit(AUDIT_ACTION.UNIT_UPDATED, 'unit', id, `Nama diubah dari "${prevName}" menjadi "${trimmed}".`);
  }
  return next;
}

/** Toggle a unit's active status (soft — never a hard delete, matches the
    Driver/Vehicle registry convention: history must survive deactivation). */
export async function setUnitActive(id, isActive) {
  const unit = getUnits().find(u => u.id === id);
  if (!unit) throw new Error('Unit tidak ditemukan.');
  const next = { ...unit, isActive: !!isActive, updatedAt: Date.now() };
  await putUnit(next);
  await writeAudit(
    isActive ? AUDIT_ACTION.UNIT_ACTIVATED : AUDIT_ACTION.UNIT_DEACTIVATED,
    'unit', id, `Unit "${unit.name}" ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
  );
  return next;
}

/* ── Employee Management (the module's PRIMARY master data) ──────── */

/** Active + inactive employees, sorted by displayOrder ascending (FIX 3 —
    this is the order Daily Entry's checklist will follow), name as tiebreak. */
export function listEmployees({ includeInactive = true, unitId = null } = {}) {
  return getEmployees()
    .filter(e => includeInactive || e.isActive !== false)
    .filter(e => !unitId || e.unitId === unitId)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'id'));
}

/** Active employees only — the set Daily Entry (later sprints) checklist picks from. */
export function listActiveEmployees(unitId = null) {
  return listEmployees({ includeInactive: false, unitId });
}

/** Search by name (substring) and/or unit — used by the Employees screen. */
export function searchEmployees(query, { unitId = null, includeInactive = true } = {}) {
  const q = normalizedName(query).toLowerCase();
  return listEmployees({ includeInactive, unitId })
    .filter(e => !q || e.name.toLowerCase().includes(q));
}

function isDuplicateEmployeeName(name, unitId, excludeId) {
  const norm = normalizedName(name).toLowerCase();
  return getEmployees().some(e =>
    e.id !== excludeId && e.unitId === unitId && String(e.name).trim().toLowerCase() === norm);
}

/**
 * Add a new employee. Minimal required input is { name, unitId } — matches
 * the spec's "Nama → Unit → Save" flow; `note` is optional.
 */
export async function createEmployee({ name, unitId, note }) {
  const trimmed = normalizedName(name);
  if (!trimmed) throw new Error('Nama karyawan wajib diisi.');
  if (!unitId) throw new Error('Unit wajib dipilih.');
  const unit = getUnits().find(u => u.id === unitId);
  if (!unit) throw new Error('Unit tidak ditemukan.');
  if (isDuplicateEmployeeName(trimmed, unitId, null)) throw new Error('Nama karyawan sudah ada pada unit ini.');

  const now = Date.now();
  const siblings = listEmployees({ unitId });
  const maxOrder = siblings.reduce((m, e) => Math.max(m, e.displayOrder ?? 0), -1);
  const employee = {
    id: genId('emp'), name: trimmed, unitId, isActive: true, note: note || '',
    displayOrder: maxOrder + 1,
    createdAt: now, updatedAt: now, createdBy: actorId(), updatedBy: actorId(),
  };
  await putEmployee(employee);
  await writeAudit(AUDIT_ACTION.EMPLOYEE_CREATED, 'employee', employee.id, `Karyawan "${trimmed}" ditambahkan ke unit "${unit.name}".`);
  return employee;
}

/** Edit an employee's name, unit, and/or note. */
export async function updateEmployee(id, { name, unitId, note }) {
  const employee = getEmployees().find(e => e.id === id);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');
  const trimmed = normalizedName(name);
  if (!trimmed) throw new Error('Nama karyawan wajib diisi.');
  if (!unitId) throw new Error('Unit wajib dipilih.');
  const unit = getUnits().find(u => u.id === unitId);
  if (!unit) throw new Error('Unit tidak ditemukan.');
  if (isDuplicateEmployeeName(trimmed, unitId, id)) throw new Error('Nama karyawan sudah ada pada unit ini.');

  const prevName = employee.name;
  const prevUnit = getUnits().find(u => u.id === employee.unitId);
  const unitChanged = employee.unitId !== unitId;
  let displayOrder = employee.displayOrder;
  if (unitChanged) {
    // Moving to a different unit's group — append at the end of the new
    // group rather than keeping a displayOrder that only made sense in the
    // old one.
    const siblings = listEmployees({ unitId });
    displayOrder = siblings.reduce((m, e) => Math.max(m, e.displayOrder ?? 0), -1) + 1;
  }
  const next = {
    ...employee, name: trimmed, unitId, note: note || '', displayOrder,
    updatedAt: Date.now(), updatedBy: actorId(),
  };
  await putEmployee(next);

  const notes = [];
  if (prevName !== trimmed) notes.push(`nama diubah dari "${prevName}" menjadi "${trimmed}"`);
  if (employee.unitId !== unitId) notes.push(`unit diubah dari "${prevUnit ? prevUnit.name : '(tidak diketahui)'}" menjadi "${unit.name}"`);
  if (notes.length) {
    await writeAudit(AUDIT_ACTION.EMPLOYEE_UPDATED, 'employee', id, `${notes.join('; ')}.`);
  }
  return next;
}

/** Toggle an employee's active status (soft — never a hard delete, so
    history/reports/analytics referencing past records stay intact). */
export async function setEmployeeActive(id, isActive) {
  const employee = getEmployees().find(e => e.id === id);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');
  const next = { ...employee, isActive: !!isActive, updatedAt: Date.now(), updatedBy: actorId() };
  await putEmployee(next);
  await writeAudit(
    isActive ? AUDIT_ACTION.EMPLOYEE_ACTIVATED : AUDIT_ACTION.EMPLOYEE_DEACTIVATED,
    'employee', id, `Karyawan "${employee.name}" ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
  );
  return next;
}

/**
 * FIX 3 (2026-07-16): move an employee up/down within their unit's
 * displayOrder — this is the order Daily Entry's checklist follows. Swaps
 * displayOrder with the adjacent sibling in the SAME unit; a no-op at either
 * end of the list.
 */
export async function moveEmployee(id, direction) {
  const employee = getEmployees().find(e => e.id === id);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');
  const siblings = listEmployees({ unitId: employee.unitId });
  const idx = siblings.findIndex(e => e.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return employee;

  const other = siblings[swapIdx];
  const now = Date.now();
  const a = { ...employee, displayOrder: other.displayOrder ?? 0, updatedAt: now, updatedBy: actorId() };
  const b = { ...other, displayOrder: employee.displayOrder ?? 0, updatedAt: now, updatedBy: actorId() };
  await putEmployee(a);
  await putEmployee(b);
  await writeAudit(AUDIT_ACTION.EMPLOYEE_REORDERED, 'employee', id, `"${employee.name}" dipindahkan ${direction === 'up' ? 'ke atas' : 'ke bawah'}.`);
  return a;
}

/* ── Overtime Rate Engine (Sprint 3 — append-only versioning) ────── */

export function listRateTiers() { return RATE_TIERS; }

/** All versions for a tier, newest effectiveFrom first (includes soft-deleted,
    UI decides how to render them). */
export function listRateVersions(tierKey) {
  return versionsForTier(getRateVersions(), tierKey);
}

/** The rate active for `tierKey` on `atDateISO` (defaults to today) — the
    single source Holiday Engine (Sprint 4) / Daily Entry (Sprint 5) call to
    resolve what to charge. Decorated with the tier label for display. */
export function getActiveRate(tierKey, atDateISO) {
  const date = atDateISO || todayISOLocal();
  const version = resolveActiveRateVersion(getRateVersions(), tierKey, date);
  if (!version) return null;
  return { ...version, tierLabel: tierLabel(tierKey) };
}

/** FIX 4 (2026-07-16): the Default Active Rate — what Daily Entry charges
    on a non-holiday date, with zero extra clicks. */
/** The Default Active Rate for `atDateISO` (used when the date is not a
    holiday) — thin wrapper over the pure resolveDefaultRateVersion(), which
    falls back to the earliest version when backdated entry predates every
    version's effectiveFrom (see its own doc comment for why). */
export function getDefaultRate(atDateISO) {
  const date = atDateISO || todayISOLocal();
  const version = resolveDefaultRateVersion(getRateVersions(), DEFAULT_TIER_KEY, date);
  if (!version) return null;
  return { ...version, tierLabel: tierLabel(DEFAULT_TIER_KEY) };
}

export function todayISOLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Create a new rate version. NEVER edits an existing version's amount — this
 * is the append-only invariant that lets Daily Entry snapshot "the rate that
 * was active at the time" without it silently changing later.
 */
export async function createRateVersion({ tierKey, amount, effectiveFrom, note }) {
  if (!isValidTierKey(tierKey)) throw new Error('Tipe tarif tidak dikenal.');
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) throw new Error('Nominal tarif harus lebih dari 0.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveFrom || ''))) throw new Error('Tanggal berlaku tidak valid.');

  const now = Date.now();
  const version = {
    id: genId('rv'), tierKey, amount: numAmount, effectiveFrom, note: note || '',
    isActive: true, createdAt: now, createdBy: actorId(), updatedAt: now, updatedBy: actorId(),
  };
  await putRateVersion(version);
  await writeAudit(
    AUDIT_ACTION.RATE_VERSION_CREATED, 'rateVersion', version.id,
    `Tarif "${tierLabel(tierKey)}" versi baru: Rp${numAmount.toLocaleString('id-ID')} berlaku mulai ${effectiveFrom}.`,
  );
  return version;
}

/** Edit a version's NOTE only — amount/tierKey/effectiveFrom are immutable
    once created (append-only invariant); to change the nominal, create a new
    version instead. */
export async function updateRateVersionNote(id, note) {
  const version = getRateVersions().find(v => v.id === id);
  if (!version) throw new Error('Versi tarif tidak ditemukan.');
  const next = { ...version, note: note || '', updatedAt: Date.now(), updatedBy: actorId() };
  await putRateVersion(next);
  await writeAudit(AUDIT_ACTION.RATE_VERSION_UPDATED, 'rateVersion', id, 'Catatan tarif diperbarui.');
  return next;
}

/** Soft-delete a rate version (e.g. created by mistake) — excluded from
    resolveActiveRate, but never physically removed; audit + Restore keep it
    recoverable. */
export async function softDeleteRateVersion(id) {
  const version = getRateVersions().find(v => v.id === id);
  if (!version) throw new Error('Versi tarif tidak ditemukan.');
  const next = { ...version, isActive: false, updatedAt: Date.now(), updatedBy: actorId() };
  await putRateVersion(next);
  await writeAudit(
    AUDIT_ACTION.RATE_VERSION_DELETED, 'rateVersion', id,
    `Tarif "${tierLabel(version.tierKey)}" Rp${Number(version.amount).toLocaleString('id-ID')} (berlaku ${version.effectiveFrom}) dihapus.`,
  );
  return next;
}

/** Restore a previously soft-deleted rate version. */
export async function restoreRateVersion(id) {
  const version = getRateVersions().find(v => v.id === id);
  if (!version) throw new Error('Versi tarif tidak ditemukan.');
  const next = { ...version, isActive: true, updatedAt: Date.now(), updatedBy: actorId() };
  await putRateVersion(next);
  await writeAudit(
    AUDIT_ACTION.RATE_VERSION_RESTORED, 'rateVersion', id,
    `Tarif "${tierLabel(version.tierKey)}" Rp${Number(version.amount).toLocaleString('id-ID')} (berlaku ${version.effectiveFrom}) dipulihkan.`,
  );
  return next;
}

/* ── Holiday Engine (Sprint 4) ────────────────────────────────────── */

export function listHolidayTypes() { return HOLIDAY_TYPES; }

/** All holidays, chronological. */
export function listHolidays({ includeInactive = true } = {}) {
  return getHolidays()
    .filter(h => includeInactive || h.isActive !== false)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Search by name or date substring — used by the Holiday screen. */
export function searchHolidays(query) {
  const q = normalizedName(query).toLowerCase();
  return listHolidays().filter(h => !q || h.name.toLowerCase().includes(q) || String(h.date).includes(q));
}

/** The active holiday covering `dateISO`, or null. Ties (shouldn't happen —
    guarded at create/update — but defensive) resolve to the most recent. */
export function findHolidayForDate(dateISO) {
  const matches = getHolidays().filter(h => h.date === dateISO && h.isActive !== false);
  if (!matches.length) return null;
  return matches.reduce((best, h) => (!best || (h.createdAt || 0) > (best.createdAt || 0)) ? h : best, null);
}

function isDuplicateHolidayDate(dateISO, excludeId) {
  return getHolidays().some(h => h.id !== excludeId && h.date === dateISO && h.isActive !== false);
}

function normalizeHolidayType(type) {
  return HOLIDAY_TYPES.some(t => t.key === type) ? type : 'custom';
}
function normalizeHolidayTier(tierKey) {
  return isValidTierKey(tierKey) ? tierKey : DEFAULT_HOLIDAY_TIER_KEY;
}

/** Create a holiday. `tierKey` is which Rate Engine tier this date charges
    (default 'nationalHoliday') — Daily Entry resolves the amount through
    the SAME versioned Rate Engine, never a raw number stored here. */
export async function createHoliday({ date, name, type, tierKey, note }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Tanggal tidak valid.');
  const trimmedName = normalizedName(name);
  if (!trimmedName) throw new Error('Nama hari libur wajib diisi.');
  if (isDuplicateHolidayDate(date, null)) throw new Error('Sudah ada hari libur pada tanggal ini.');

  const now = Date.now();
  const holiday = {
    id: genId('hol'), date, name: trimmedName, type: normalizeHolidayType(type), tierKey: normalizeHolidayTier(tierKey),
    note: note || '', isActive: true, createdAt: now, updatedAt: now, createdBy: actorId(), updatedBy: actorId(),
  };
  await putHoliday(holiday);
  await writeAudit(AUDIT_ACTION.HOLIDAY_CREATED, 'holiday', holiday.id, `Hari libur "${trimmedName}" (${date}) ditambahkan.`);
  return holiday;
}

/** Edit a holiday's date/name/type/tier/note. */
export async function updateHoliday(id, { date, name, type, tierKey, note }) {
  const holiday = getHolidays().find(h => h.id === id);
  if (!holiday) throw new Error('Hari libur tidak ditemukan.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Tanggal tidak valid.');
  const trimmedName = normalizedName(name);
  if (!trimmedName) throw new Error('Nama hari libur wajib diisi.');
  if (isDuplicateHolidayDate(date, id)) throw new Error('Sudah ada hari libur pada tanggal ini.');

  const next = {
    ...holiday, date, name: trimmedName, type: normalizeHolidayType(type), tierKey: normalizeHolidayTier(tierKey),
    note: note || '', updatedAt: Date.now(), updatedBy: actorId(),
  };
  await putHoliday(next);
  await writeAudit(AUDIT_ACTION.HOLIDAY_UPDATED, 'holiday', id, `Hari libur "${trimmedName}" diperbarui.`);
  return next;
}

/** Toggle a holiday's active status (soft). */
export async function setHolidayActive(id, isActive) {
  const holiday = getHolidays().find(h => h.id === id);
  if (!holiday) throw new Error('Hari libur tidak ditemukan.');
  const next = { ...holiday, isActive: !!isActive, updatedAt: Date.now(), updatedBy: actorId() };
  await putHoliday(next);
  await writeAudit(
    isActive ? AUDIT_ACTION.HOLIDAY_ACTIVATED : AUDIT_ACTION.HOLIDAY_DEACTIVATED,
    'holiday', id, `Hari libur "${holiday.name}" ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
  );
  return next;
}

/**
 * Holiday-aware rate resolution — the SINGLE function Daily Entry calls to
 * get a rate without any extra admin click ("Tanggal → cek Holiday → YES:
 * Holiday Rate / NO: Default Rate"). Falls back to the Default Active Rate
 * (FIX 4) when the date isn't a holiday.
 */
export function resolveEntryRate(dateISO) {
  const holiday = findHolidayForDate(dateISO);
  if (holiday) {
    const rate = getActiveRate(holiday.tierKey, dateISO);
    return rate ? { ...rate, holiday } : null;
  }
  const rate = getDefaultRate(dateISO);
  return rate ? { ...rate, holiday: null } : null;
}

/* ── Daily Entry (Sprint 5) ───────────────────────────────────────── */

/** A record with no `status` at all (written before RECORD_STATUS existed)
    is treated as active — no migration needed for pre-existing data. */
function isActiveRecord(r) { return r.status !== RECORD_STATUS.DELETED; }

/** Records already saved for a date (+ optional unit filter). Excludes
    soft-deleted records — a deleted entry must not count as "already
    recorded" (Level 1 duplicate detection would otherwise permanently
    block re-entering a voided row). */
export function listRecordsForDate(dateISO, unitId = null) {
  return getRecords().filter(r => r.date === dateISO && (!unitId || r.unitId === unitId) && isActiveRecord(r));
}

/** Every record, newest first — the Penyesuaian Data screen's browse
    source; unlike listRecentRecords(limit) this is never truncated, since
    the screen's own filters (date/unit/employee/status) are what bound
    what's actually rendered. Soft-deleted records are excluded by default
    — pass includeDeleted:true for the "Terhapus" filter. */
export function listAllRecords({ includeDeleted = false } = {}) {
  return getRecords()
    .filter(r => includeDeleted || isActiveRecord(r))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Employee ids among `employeeIds` who already have a record for this
    date+unit — surfaced as a non-blocking warning; the admin decides
    whether to save anyway (spec: duplicate detection, not duplicate
    prevention). */
export function findDuplicateEmployeeIds(dateISO, unitId, employeeIds) {
  const existing = new Set(listRecordsForDate(dateISO, unitId).map(r => r.employeeId));
  return (employeeIds || []).filter(id => existing.has(id));
}

function yyyyMM(dateISO) { return String(dateISO || '').slice(0, 7); }

/** Guards every mutation against a CLOSED period (Sprint 9). Plain `Error`,
    id-ID message — matches petty-cash-service.js's updateExpense() lock
    guard convention exactly, no new error contract invented. */
function assertPeriodUnlocked(dateISO) {
  const closing = getClosing(yyyyMM(dateISO));
  if (closing && closing.status === CLOSING_STATUS.CLOSED) {
    throw new Error(`Periode ${yyyyMM(dateISO)} telah ditutup (Closing). Buka kunci (Unlock) terlebih dahulu untuk mengubah data.`);
  }
}

/**
 * Batch-save Daily Entry: ONE atomic multi-node write covering every
 * selected employee's record (across EVERY unit) + the daily/monthly
 * summary + ONE audit entry — never N separate writes for a single Save
 * click (spec: "Batch Save").
 *
 * Production Polish Round 2 FIX 13 — Global Save Workflow: the real
 * business process is "one date, every unit, one Simpan" (never "one unit,
 * one transaction"). `unitId` is no longer a parameter — each employee's
 * unit is resolved server-side from the Employee master (never trusted
 * from the client), so one call can atomically save employees spanning
 * any number of units for a single date. `overrideTierKey`, when
 * provided, charges that tier for THIS transaction only — the holiday
 * calendar / master rate are never touched by an override.
 */
export async function createDailyEntries({ date, employeeIds, overrideTierKey, overrideNote }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Tanggal tidak valid.');
  assertPeriodUnlocked(date);
  const ids = Array.from(new Set((employeeIds || []).filter(Boolean)));
  if (!ids.length) throw new Error('Pilih minimal satu karyawan.');

  const employeeById = new Map(getEmployees().map(e => [e.id, e]));
  const unitById = new Map(getUnits().map(u => [u.id, u]));
  const resolvedEmployees = ids.map(employeeId => {
    const emp = employeeById.get(employeeId);
    if (!emp) throw new Error('Karyawan tidak ditemukan.');
    const unit = unitById.get(emp.unitId);
    if (!unit) throw new Error(`Unit untuk ${emp.name} tidak ditemukan.`);
    return { employeeId, unitId: unit.id, unitName: unit.name };
  });

  // Level 2 duplicate detection (atomic, backend): re-checks against the
  // FRESHEST record list immediately before writing — never trusts a
  // possibly-stale render-time snapshot. No override path (unlike the old
  // "confirm and save anyway" UI flow this supersedes) — Level 1 (disabled
  // checkboxes) already prevents this in normal use; this is the safety
  // net for a race (e.g. two admins saving the same employee/date within
  // the same few seconds). Scoped to the WHOLE date now (unitId=null),
  // not one unit — a global save must never partially collide either.
  const dupes = findDuplicateEmployeeIds(date, null, ids);
  if (dupes.length) {
    const names = dupes.map(did => (employeeById.get(did) || {}).name || did).join(', ');
    throw new Error(`${names} sudah memiliki entri pada tanggal ini. Muat ulang data dan coba lagi.`);
  }

  const overrideApplied = !!overrideTierKey;
  const resolved = overrideApplied
    ? (getActiveRate(overrideTierKey, date) ? { ...getActiveRate(overrideTierKey, date), holiday: null } : null)
    : resolveEntryRate(date);
  if (!resolved) throw new Error('Tarif untuk tanggal ini belum tersedia. Atur tarif terlebih dahulu di menu Rates.');

  const now = Date.now();
  const updates = {};
  const newRecords = resolvedEmployees.map(({ employeeId, unitId }) => {
    const rid = genId('rec');
    const record = {
      id: rid, employeeId, unitId, date,
      tierKey: resolved.tierKey, rateVersionId: resolved.id, rateAmount: resolved.amount,
      overrideApplied, overrideNote: overrideApplied ? (overrideNote || '') : '',
      status: RECORD_STATUS.ACTIVE,
      createdAt: now, createdBy: actorId(),
    };
    updates[`overtimeRecords/${rid}`] = record;
    return record;
  });

  // One summary fold per record, regardless of which unit it belongs to —
  // addRecordToSummary buckets byUnit/byEmployee independently, so mixed-
  // unit records within the SAME atomic write aggregate correctly (this is
  // what makes Dashboard/Analytics/History/Report all reflect the save in
  // one transaction, per FIX 13 — no per-unit summary math needed here).
  let dailySummary = getDailySummary(date);
  let monthlySummary = getMonthlySummary(yyyyMM(date));
  newRecords.forEach(record => {
    dailySummary = addRecordToSummary(dailySummary, record);
    monthlySummary = addRecordToSummary(monthlySummary, record);
  });
  updates[`overtimeDailySummary/${date}`] = dailySummary;
  updates[`overtimeMonthlySummary/${yyyyMM(date)}`] = monthlySummary;

  // ONE audit entry for the whole date, breaking down per-unit counts —
  // scales the old single-unit audit note to "every unit touched".
  const unitCounts = new Map();
  resolvedEmployees.forEach(({ unitId, unitName }) => unitCounts.set(unitId, { name: unitName, count: (unitCounts.get(unitId)?.count || 0) + 1 }));
  const unitBreakdown = Array.from(unitCounts.values()).map(u => `${u.name}: ${u.count}`).join(', ');
  const auditEntry = buildAudit(
    AUDIT_ACTION.DAILY_ENTRY_SAVED, 'dailyEntry', null,
    `${ids.length} karyawan (${unitCounts.size} unit — ${unitBreakdown}) pada ${date} (${resolved.tierLabel}${overrideApplied ? ' · override' : ''}).`,
  );
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return { count: ids.length, unitCount: unitCounts.size, rate: resolved };
}

/** Employee ids that had a record on `dateISO` for `unitId` — source for
    Bulk Copy (pre-fills the NEXT date's checklist; never auto-saves). */
export function getEntryEmployeeIds(dateISO, unitId) {
  return listRecordsForDate(dateISO, unitId).map(r => r.employeeId);
}

/** Most recently created records across all units/dates — "Recent Entry"
    on the Daily Entry screen. */
export function listRecentRecords(limit = 10) {
  return getRecords()
    .filter(isActiveRecord)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

/* ── Record CRUD + Monthly Closing (Sprint 9) ────────────────────────
   Before this sprint, overtimeRecords were permanently append-only.
   Product decision (confirmed): full CRUD is required WHILE a period
   is open — admin can create/edit/delete/reassign any field, every
   change audited. After Closing, the period is read-only until an
   explicit, reason-required Unlock. */

function getRecordById(id) {
  return getRecords().find(r => r.id === id) || null;
}

/** Edit any field of an existing record (employee/unit/date/tier/rate/
    note). Re-resolves rateAmount from the (possibly new) tier/version —
    never trusts a caller-supplied amount, same discipline as
    createDailyEntries. Reconciles daily+monthly summaries via
    reconcileSummaryEdit (overtime-analytics-engine.js), one atomic write
    with the audit entry. */
export async function updateRecord(id, { employeeId, unitId, date, tierKey, rateVersionId, overrideNote, expectedUpdatedAt } = {}) {
  const existing = getRecordById(id);
  if (!existing) throw new Error('Entri lembur tidak ditemukan.');
  assertNoConflict(existing, expectedUpdatedAt);
  if (existing.status === RECORD_STATUS.DELETED) throw new Error('Entri ini sudah dihapus — pulihkan terlebih dahulu untuk mengedit.');

  const nextDate = date || existing.date;
  assertPeriodUnlocked(existing.date);
  if (nextDate !== existing.date) assertPeriodUnlocked(nextDate);

  const nextUnitId = unitId || existing.unitId;
  const nextEmployeeId = employeeId || existing.employeeId;
  const nextTierKey = tierKey || existing.tierKey;

  const versions = getRateVersions();
  let resolved;
  if (rateVersionId) {
    resolved = versions.find(v => v.id === rateVersionId);
    if (!resolved) throw new Error('Tarif tidak ditemukan.');
  } else {
    resolved = resolveActiveRateVersion(versions, nextTierKey, nextDate);
    if (!resolved) throw new Error('Tarif untuk tanggal ini belum tersedia.');
  }

  const nextRecord = {
    ...existing,
    employeeId: nextEmployeeId, unitId: nextUnitId, date: nextDate,
    tierKey: nextTierKey, rateVersionId: resolved.id, rateAmount: resolved.amount,
    overrideNote: overrideNote != null ? overrideNote : existing.overrideNote,
    updatedAt: Date.now(), updatedBy: actorId(),
  };

  const dailyPatch = reconcileSummaryEdit(getDailySummary, existing.date, nextDate, existing, nextRecord);
  const monthlyPatch = reconcileSummaryEdit(getMonthlySummary, yyyyMM(existing.date), yyyyMM(nextDate), existing, nextRecord);

  const updates = { [`overtimeRecords/${id}`]: nextRecord };
  Object.entries(dailyPatch).forEach(([k, v]) => { updates[`overtimeDailySummary/${k}`] = v; });
  Object.entries(monthlyPatch).forEach(([k, v]) => { updates[`overtimeMonthlySummary/${k}`] = v; });

  const auditEntry = buildAudit(AUDIT_ACTION.RECORD_UPDATED, 'overtimeRecord', id, `Entri ${existing.date} diperbarui${nextDate !== existing.date ? ` (dipindah ke ${nextDate})` : ''}.`);
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return nextRecord;
}

/** Delete a record — subtracts its contribution from the daily/monthly
    summaries and nulls the record node in one atomic write, with an
    audit entry. */
/** Throws the shared conflict-detection error if `expectedUpdatedAt` was
    captured (e.g. when an edit modal opened) and no longer matches the
    record's current `updatedAt` — another admin changed it in the
    meantime. Never-updated records have `updatedAt === undefined`, which
    still compares correctly (undefined === undefined). Opt-in: callers
    that don't pass expectedUpdatedAt skip the check entirely. */
function assertNoConflict(existing, expectedUpdatedAt) {
  if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
    throw new Error('Data telah berubah. Silakan muat ulang data.');
  }
}

/** Soft-deletes a record — status becomes DELETED (never a hard RTDB
    null-delete), so it can be restored. Still subtracts its contribution
    from the daily/monthly summaries (a deleted entry must not count
    toward totals) in the same atomic write as the audit entry. */
export async function deleteRecord(id, { expectedUpdatedAt } = {}) {
  const existing = getRecordById(id);
  if (!existing) throw new Error('Entri lembur tidak ditemukan.');
  assertNoConflict(existing, expectedUpdatedAt);
  assertPeriodUnlocked(existing.date);
  if (existing.status === RECORD_STATUS.DELETED) throw new Error('Entri ini sudah dihapus.');

  const deletedRecord = { ...existing, status: RECORD_STATUS.DELETED, deletedAt: Date.now(), deletedBy: actorId() };
  const updates = {
    [`overtimeRecords/${id}`]: deletedRecord,
    [`overtimeDailySummary/${existing.date}`]: subtractRecordFromSummary(getDailySummary(existing.date), existing),
    [`overtimeMonthlySummary/${yyyyMM(existing.date)}`]: subtractRecordFromSummary(getMonthlySummary(yyyyMM(existing.date)), existing),
  };
  const auditEntry = buildAudit(AUDIT_ACTION.RECORD_DELETED, 'overtimeRecord', id, `Entri ${existing.date} dihapus (${getUnitLabel(existing.unitId) || existing.unitId}).`);
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
}

/** Restores a soft-deleted record — re-adds its contribution to the
    daily/monthly summaries (mirrors petty-cash-service.js's
    restoreExpense() shape: guarded, audited, one atomic write). */
export async function restoreRecord(id, { expectedUpdatedAt } = {}) {
  const existing = getRecordById(id);
  if (!existing) throw new Error('Entri lembur tidak ditemukan.');
  assertNoConflict(existing, expectedUpdatedAt);
  if (existing.status !== RECORD_STATUS.DELETED) throw new Error('Entri ini tidak sedang dihapus.');
  assertPeriodUnlocked(existing.date);

  const restoredRecord = { ...existing, status: RECORD_STATUS.ACTIVE, deletedAt: null, deletedBy: null, updatedAt: Date.now(), updatedBy: actorId() };
  const updates = {
    [`overtimeRecords/${id}`]: restoredRecord,
    [`overtimeDailySummary/${existing.date}`]: addRecordToSummary(getDailySummary(existing.date), restoredRecord),
    [`overtimeMonthlySummary/${yyyyMM(existing.date)}`]: addRecordToSummary(getMonthlySummary(yyyyMM(existing.date)), restoredRecord),
  };
  const auditEntry = buildAudit(AUDIT_ACTION.RECORD_RESTORED, 'overtimeRecord', id, `Entri ${existing.date} dipulihkan (${getUnitLabel(existing.unitId) || existing.unitId}).`);
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return restoredRecord;
}

/* ── Monthly Closing (Sprint 9) ───────────────────────────────────────
   GLOBAL: one lock per yyyy-mm covering every unit (confirmed product
   decision — mirrors petty-cash-service.js's single-cycle-at-a-time
   model rather than a per-unit lock). Validation is WARN-ONLY: it never
   blocks closeMonth(), it only annotates the closing record with what
   it found. */

/** Current status for a month, synthesizing an OPEN default for a
    never-closed month (no RTDB node needed until the first Closing). */
export function getClosingStatus(yyyyMMKey) {
  return getClosing(yyyyMMKey) || { yyyyMM: yyyyMMKey, status: CLOSING_STATUS.OPEN, history: [], reopenCount: 0 };
}

/** Active (non-deleted) records for one month — the single source both
    runClosingValidation() and closeMonth() read from, so a month's record
    set is never queried twice with the same filter (Final Audit target). */
function recordsForMonth(yyyyMMKey) {
  return getRecords().filter(r => yyyyMM(r.date) === yyyyMMKey && isActiveRecord(r));
}

/** Duplicate employee+unit+date groups among already-recorded, active
    records for one month — feeds the Dashboard/Penyesuaian Data warning
    banners (Final UX Refinement §8 Level 3: Analytics). Reuses the SAME
    findDuplicateRecords() primitive Closing's own validator calls —
    never a second implementation of "what counts as a duplicate." */
export function findDuplicatesInMonth(yyyyMMKey) {
  return findDuplicateRecords(recordsForMonth(yyyyMMKey));
}

/** Runs the (never-blocking) pre-closing validator for one month. */
export function runClosingValidation(yyyyMMKey) {
  return validateMonthForClosing({
    records: recordsForMonth(yyyyMMKey), employees: getEmployees(), rateVersions: getRateVersions(),
    resolveTierForDate: resolveEntryRate,
  });
}

export function listClosings() { return getAllClosings(); }
export function listArchives() { return getAllArchives(); }
export function getArchiveSnapshot(yyyyMMKey) { return getArchive(yyyyMMKey); }

/**
 * Closes a month: runs the warn-only validator, freezes an archive
 * snapshot (version = priorVersion + 1), locks the period. Does NOT
 * generate the PDF itself — PDF rendering is DOM-dependent and is
 * orchestrated by the Closing screen AFTER this resolves (calls
 * getReportSnapshot()+exportOvertimeReport(), then
 * attachClosingReportRef()) — mixing async DOM rendering into this
 * atomic data-write function would be a layering violation.
 */
export async function closeMonth(yyyyMMKey, { note } = {}) {
  const existingClosing = getClosing(yyyyMMKey);
  if (existingClosing && existingClosing.status === CLOSING_STATUS.CLOSED) {
    throw new Error(`Periode ${yyyyMMKey} sudah ditutup.`);
  }

  const records = recordsForMonth(yyyyMMKey);
  const validation = validateMonthForClosing({
    records, employees: getEmployees(), rateVersions: getRateVersions(), resolveTierForDate: resolveEntryRate,
  });
  const summary = getMonthlySummary(yyyyMMKey) || emptySummary();
  const existingArchive = getArchive(yyyyMMKey);

  const snapshot = buildClosingSnapshot({
    yyyyMM: yyyyMMKey, summary, recordIds: records.map(r => r.id),
    warnings: validation.warnings, priorVersion: existingArchive ? existingArchive.version : 0,
    actorLabel: actorLabel(),
  });

  const priorHistory = (existingClosing && existingClosing.history) || [];
  const reopenCount = (existingClosing && existingClosing.reopenCount) || 0;
  const nextClosing = {
    yyyyMM: yyyyMMKey, status: CLOSING_STATUS.CLOSED,
    closedAt: Date.now(), closedBy: actorLabel(), closeNote: note || '',
    history: [...priorHistory, { event: 'closed', at: Date.now(), by: actorLabel(), note: note || '', reopenCount }],
    reopenCount,
    lastValidation: validation,
    updatedAt: Date.now(),
  };

  const updates = {
    [`overtimeClosing/${yyyyMMKey}`]: nextClosing,
    [`overtimeArchive/${yyyyMMKey}`]: snapshot,
  };
  const auditEntry = buildAudit(AUDIT_ACTION.PERIOD_CLOSED, 'overtimeClosing', yyyyMMKey, `Periode ${yyyyMMKey} ditutup (versi ${snapshot.version}, ${validation.warningCount} peringatan).`);
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return { closing: nextClosing, archive: snapshot };
}

/** Reopens a closed month. `reason` is MANDATORY — the one place in
    this module a reason is truly required beyond the standard audit
    note (confirmed product decision). Does not touch the archive; the
    next closeMonth() call produces a new, higher version. */
export async function unlockMonth(yyyyMMKey, { reason } = {}) {
  if (!reason || !reason.trim()) throw new Error('Alasan wajib diisi untuk membuka kunci periode.');
  const closing = getClosing(yyyyMMKey);
  if (!closing || closing.status !== CLOSING_STATUS.CLOSED) throw new Error(`Periode ${yyyyMMKey} tidak sedang ditutup.`);

  const nextReopenCount = (closing.reopenCount || 0) + 1;
  const nextClosing = {
    ...closing, status: CLOSING_STATUS.OPEN, reopenCount: nextReopenCount,
    history: [...(closing.history || []), { event: 'unlocked', at: Date.now(), by: actorLabel(), reason, reopenCount: nextReopenCount }],
    updatedAt: Date.now(),
  };

  const updates = { [`overtimeClosing/${yyyyMMKey}`]: nextClosing };
  const auditEntry = buildAudit(AUDIT_ACTION.PERIOD_UNLOCKED, 'overtimeClosing', yyyyMMKey, `Periode ${yyyyMMKey} dibuka kembali. Alasan: ${reason}`);
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return nextClosing;
}

/** Attaches the generated Closing report's history-entry id to the
    archive snapshot — a small follow-up write made by the UI AFTER the
    report is generated (kept out of closeMonth() itself; see its header
    comment for why). */
export async function attachClosingReportRef(yyyyMMKey, historyEntryId) {
  const archive = getArchive(yyyyMMKey);
  if (!archive) return;
  const nextArchive = { ...archive, reportRef: { format: 'pdf', generatedAt: Date.now(), historyEntryId } };
  await applyOvertimeUpdates({ [`overtimeArchive/${yyyyMMKey}`]: nextArchive });
}

/* ── Employee History (Sprint 6) ─────────────────────────────────── */

/** All records for one employee, newest first. */
export function listEmployeeRecords(employeeId) {
  return getRecords()
    .filter(r => r.employeeId === employeeId && isActiveRecord(r))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/**
 * Employee History analytics: totals, averages, monthly/yearly series, and
 * the raw transaction list — everything the History screen needs in one
 * call. Reads overtimeRecords directly (a single employee's record count is
 * small; the daily/monthly SUMMARY tables exist for cross-employee
 * Dashboard/Analytics aggregates, not this per-employee drill-down).
 */
export function employeeHistory(employeeId) {
  const records = listEmployeeRecords(employeeId);
  const totalDays = records.length;
  const totalAmount = records.reduce((a, r) => a + (r.rateAmount || 0), 0);

  const byMonth = new Map();
  const byYear = new Map();
  records.forEach(r => {
    const m = String(r.date).slice(0, 7);
    const y = String(r.date).slice(0, 4);
    const mEntry = byMonth.get(m) || { count: 0, amount: 0 };
    mEntry.count++; mEntry.amount += r.rateAmount || 0;
    byMonth.set(m, mEntry);
    const yEntry = byYear.get(y) || { count: 0, amount: 0 };
    yEntry.count++; yEntry.amount += r.rateAmount || 0;
    byYear.set(y, yEntry);
  });

  const monthlySeries = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }));
  const yearlySeries = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, v]) => ({ year, ...v }));
  const mostActiveMonth = monthlySeries.reduce((best, m) => (!best || m.count > best.count) ? m : best, null);

  return {
    employeeId, totalDays, totalAmount,
    avgPerMonth: totalAmount / (monthlySeries.length || 1),
    avgPerYear: totalAmount / (yearlySeries.length || 1),
    lastOvertime: records[0] ? records[0].date : null,
    mostActiveMonth: mostActiveMonth ? mostActiveMonth.month : null,
    monthlySeries, yearlySeries, transactions: records,
  };
}

/* ── Analytics (Sprint 7) ─────────────────────────────────────────
   Reads precomputed daily/monthly summaries only — never scans
   overtimeRecords. Closes the Sprint 1-6 gap where the Dashboard's own
   on-screen copy claimed to read summaries while actually calling
   listRecordsForDate() under the hood. */

/** Public reader for one date's summary (empty shape if none yet). */
export function getDailySummaryReport(dateISO) {
  return getDailySummary(dateISO) || emptySummary();
}

/** Public reader for one month's summary (empty shape if none yet). */
export function getMonthlySummaryReport(yyyyMMKey) {
  return getMonthlySummary(yyyyMMKey) || emptySummary();
}

/** Everything the Dashboard/Analytics screen needs, in ONE call — never
    one store/service call per card (Sprint 10's "no duplicated queries"
    requirement is designed in from the start, not patched in later). */
export function getDashboardAnalytics({ today, trendGranularity = 'daily' } = {}) {
  const todayD = today || todayISOLocal();
  const units = getUnits();
  const employees = getEmployees();
  const dailySummaries = getAllDailySummaries();
  const monthlySummaries = getAllMonthlySummaries();

  const yyyyMMToday = todayD.slice(0, 7);
  const yyyyToday = todayD.slice(0, 4);

  const todaySummary = dailySummaries[todayD] || null;
  const weekRange = weekRangeContaining(todayD);
  const weekAgg = sumDailySummariesInRange(dailySummaries, weekRange.start, weekRange.end);
  const monthSummary = monthlySummaries[yyyyMMToday] || null;
  const monthRange = monthRangeOf(yyyyMMToday);
  const monthDaysAgg = sumDailySummariesInRange(dailySummaries, monthRange.start, monthRange.end);

  let yearAmount = 0;
  Object.entries(monthlySummaries).forEach(([ym, s]) => {
    if (ym.slice(0, 4) === yyyyToday) yearAmount += s.totalAmount || 0;
  });

  const heatmapCells = buildHeatmapGrid(dailySummaries, yyyyMMToday);
  const budget = getBudget();
  const budgetAnalytics = buildBudgetAnalytics({
    monthlyAmount: (monthSummary && monthSummary.totalAmount) || 0,
    yearAmount,
    target: (budget && budget.monthlyTargetAmount) || 0,
    today: todayD,
  });

  return {
    // UX Refinement: the top KPI row is simplified to 4 cards — all scoped
    // to the current month, consistent with the rankings/budget/executive
    // sections below (which were already month-scoped). Superseded the old
    // today/week/year breakdown as the headline row; `today`/`week`/`year`
    // are kept in this return value (unused by the simplified view) only in
    // case a future screen wants them again — cheap to compute, already done.
    kpis: {
      totalAmount: (monthSummary && monthSummary.totalAmount) || 0,
      totalRecords: (monthSummary && monthSummary.totalRecords) || 0,
      employeeCount: Object.keys((monthSummary && monthSummary.byEmployee) || {}).length,
      unitCount: Object.keys((monthSummary && monthSummary.byUnit) || {}).length,
    },
    today: { count: (todaySummary && todaySummary.totalRecords) || 0, amount: (todaySummary && todaySummary.totalAmount) || 0 },
    week: { days: weekAgg.days, amount: weekAgg.amount },
    month: { days: monthDaysAgg.days, amount: (monthSummary && monthSummary.totalAmount) || 0 },
    year: { amount: yearAmount },
    topUnits: rankTopUnits(monthSummary, units, employees, 5),
    topEmployees: rankTopEmployees(monthSummary, employees, 5),
    trend: buildTrendSeries(dailySummaries, trendGranularity),
    heatmap: { month: yyyyMMToday, cells: heatmapCells },
    budget: budgetAnalytics,
    executive: buildExecutiveCards({ heatmapCells, monthlySummary: monthSummary, units, employees }),
  };
}

/** Current monthly budget target amount (0 = unset). */
export function getBudgetTarget() {
  const b = getBudget();
  return b ? (b.monthlyTargetAmount || 0) : 0;
}

/** Admin sets the recurring monthly budget target used by Budget Analytics. */
export async function setBudgetTarget(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new Error('Target anggaran tidak valid.');
  const budget = { monthlyTargetAmount: n, updatedAt: Date.now(), updatedBy: actorId() };
  await putBudget(budget);
  await writeAudit(AUDIT_ACTION.BUDGET_TARGET_UPDATED, 'budget', 'default', `Target anggaran bulanan diubah menjadi ${n}.`);
  return budget;
}

/**
 * Admin utility: recompute every daily/monthly summary from
 * overtimeRecords from scratch, in one atomic write. Needed once to
 * backfill `byEmployee` onto summaries written before Sprint 7 (which only
 * tracked `byUnit`); also the drift-recovery escape hatch if incremental
 * reconciliation is ever suspected of diverging from the record list.
 * A date/month with no current records gets its summary node CLEARED
 * (written null), not left stale.
 */
export async function rebuildAllSummaries() {
  // Deleted records must NOT be re-included — their contribution was
  // already subtracted at delete-time; rebuilding from the full record
  // list (including deleted ones) would silently reinstate it.
  const records = getRecords().filter(isActiveRecord);
  const byDate = new Map();
  const byMonth = new Map();
  records.forEach(r => {
    const d = r.date;
    const m = yyyyMM(d);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(r);
  });

  const existingDaily = getAllDailySummaries();
  const existingMonthly = getAllMonthlySummaries();
  const allDateKeys = new Set([...byDate.keys(), ...Object.keys(existingDaily)]);
  const allMonthKeys = new Set([...byMonth.keys(), ...Object.keys(existingMonthly)]);

  const updates = {};
  allDateKeys.forEach(d => { updates[`overtimeDailySummary/${d}`] = byDate.has(d) ? buildSummaryFromRecords(byDate.get(d)) : null; });
  allMonthKeys.forEach(m => { updates[`overtimeMonthlySummary/${m}`] = byMonth.has(m) ? buildSummaryFromRecords(byMonth.get(m)) : null; });

  const auditEntry = buildAudit(
    AUDIT_ACTION.SUMMARY_RECALCULATED, 'summary', null,
    `${records.length} rekaman dihitung ulang menjadi ${byDate.size} ringkasan harian dan ${byMonth.size} ringkasan bulanan.`,
  );
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return { recordCount: records.length, dailyCount: byDate.size, monthlyCount: byMonth.size };
}

/* ── Reporting (Sprint 8) ───────────────────────────────────────────
   getReportSnapshot() is the ONE data source every export format
   (PDF/Excel/CSV) and the Report Builder preview read from —
   summary-derived, same "read summaries, never scan records"
   discipline as getDashboardAnalytics(). */

/** Resolve a period+scope into a summary-derived report snapshot.
    @param {{period?:'day'|'week'|'month'|'year', refDate?:string, unitId?:string|null, employeeId?:string|null}} [opts] */
export function getReportSnapshot({ period = 'month', refDate, unitId = null, employeeId = null } = {}) {
  const ref = refDate || todayISOLocal();
  const units = getUnits();
  const employees = getEmployees();
  const dailySummaries = getAllDailySummaries();
  const monthlySummaries = getAllMonthlySummaries();

  let range, summary, periodLabel;
  if (period === 'day') {
    range = { start: ref, end: ref };
    summary = dailySummaries[ref] || emptySummary();
    periodLabel = `Harian — ${ref}`;
  } else if (period === 'week') {
    range = weekRangeContaining(ref);
    const inRange = Object.entries(dailySummaries).filter(([d]) => d >= range.start && d <= range.end).map(([, s]) => s);
    summary = mergeSummaries(inRange);
    periodLabel = `Mingguan — ${range.start} s.d. ${range.end}`;
  } else if (period === 'year') {
    const yyyy = ref.slice(0, 4);
    range = yearRangeOf(yyyy);
    const inRange = Object.entries(monthlySummaries).filter(([m]) => m.slice(0, 4) === yyyy).map(([, s]) => s);
    summary = mergeSummaries(inRange);
    periodLabel = `Tahunan — ${yyyy}`;
  } else {
    const ymKey = ref.slice(0, 7);
    range = monthRangeOf(ymKey);
    summary = monthlySummaries[ymKey] || emptySummary();
    periodLabel = `Bulanan — ${ymKey}`;
  }

  // Scope narrowing: a report FOR one unit/employee, not the whole org with
  // a highlighted row — totals and the sibling table are filtered too.
  let scopeLabel = 'Semua Unit & Karyawan';
  let scopedSummary = summary;
  if (unitId) {
    const unit = units.find(u => u.id === unitId);
    const unitEmployeeIds = new Set(employees.filter(e => e.unitId === unitId).map(e => e.id));
    const bucket = summary.byUnit[unitId] || { count: 0, amount: 0 };
    const filteredByEmployee = Object.fromEntries(Object.entries(summary.byEmployee || {}).filter(([id]) => unitEmployeeIds.has(id)));
    scopedSummary = { totalRecords: bucket.count, totalAmount: bucket.amount, byUnit: { [unitId]: bucket }, byEmployee: filteredByEmployee, updatedAt: summary.updatedAt };
    scopeLabel = unit ? `Unit: ${unit.name}` : scopeLabel;
  } else if (employeeId) {
    const emp = employees.find(e => e.id === employeeId);
    const bucket = summary.byEmployee[employeeId] || { count: 0, amount: 0 };
    const empUnitBucket = emp ? summary.byUnit[emp.unitId] : null;
    scopedSummary = {
      totalRecords: bucket.count, totalAmount: bucket.amount,
      byUnit: (emp && empUnitBucket) ? { [emp.unitId]: empUnitBucket } : {},
      byEmployee: { [employeeId]: bucket }, updatedAt: summary.updatedAt,
    };
    scopeLabel = emp ? `Karyawan: ${emp.name}` : scopeLabel;
  }

  const daysInRange = Math.max(1, Math.round((new Date(`${range.end}T00:00:00`) - new Date(`${range.start}T00:00:00`)) / 86400000) + 1);
  const trendGranularity = period === 'year' ? 'monthly' : period === 'month' ? 'weekly' : 'daily';

  return {
    period, periodLabel, dateRangeStart: range.start, dateRangeEnd: range.end,
    scope: { type: unitId ? 'unit' : (employeeId ? 'employee' : 'all'), unitId, employeeId, label: scopeLabel },
    kpis: {
      totalRecords: scopedSummary.totalRecords,
      totalAmount: scopedSummary.totalAmount,
      avgPerDay: scopedSummary.totalAmount / daysInRange,
      unitCount: Object.keys(scopedSummary.byUnit).length,
      employeeCount: Object.keys(scopedSummary.byEmployee).length,
    },
    unitRows: rankTopUnits(scopedSummary, units, employees, 50),
    // Enriched with the employee's assigned unit (Bidang) — needed by the
    // canonical Rekapitulasi export layout; the ranking engine itself stays
    // general-purpose (unit-agnostic) since the Dashboard's own rankings
    // don't need this field.
    employeeRows: rankTopEmployees(scopedSummary, employees, 50).map(row => {
      const emp = employees.find(e => e.id === row.employeeId);
      const empUnit = emp ? units.find(u => u.id === emp.unitId) : null;
      return { ...row, unitName: empUnit ? empUnit.name : '—' };
    }),
    trend: buildTrendSeries(dailySummaries, trendGranularity),
    detailRecords: buildDetailRecords(range, unitId, employeeId, units, employees),
  };
}

/** Raw, per-record transaction detail for the canonical export's date-
    grouped section — bounded to the report's own date range (and scope),
    never an unbounded scan. Mirrors the already-established employeeHistory()
    precedent: raw overtimeRecords are read directly for a bounded,
    UI-visible drill-down/detail listing, never for the Dashboard's
    cross-cutting aggregates (those stay summary-derived, unchanged above).

    Sort order (Production Polish FIX 9 — readability over alphabetical):
    Tanggal → Unit (sortOrder) → Employee (displayOrder), NOT employee name.
    This is the exact order a Kabid reads a coordinator's paper recap in —
    grouped by unit, employees in the same order Daily Entry's own checklist
    already uses — so the report's date-grouping in overtime-report-model.js
    (which just projects this array, doing no sorting of its own) naturally
    comes out unit-clustered within each date for free. */
function buildDetailRecords(range, unitId, employeeId, units, employees) {
  const employeeById = new Map(employees.map(e => [e.id, e]));
  const unitById = new Map(units.map(u => [u.id, u]));
  return getRecords()
    .filter(r => r.date >= range.start && r.date <= range.end)
    .filter(r => !unitId || r.unitId === unitId)
    .filter(r => !employeeId || r.employeeId === employeeId)
    .filter(isActiveRecord)
    .map(r => ({
      date: r.date,
      employeeId: r.employeeId,
      employeeName: (employeeById.get(r.employeeId) || {}).name || '—',
      unitId: r.unitId,
      unitName: (unitById.get(r.unitId) || {}).name || '—',
      amount: r.rateAmount || 0,
    }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const unitOrder = ((unitById.get(a.unitId) || {}).sortOrder ?? 0) - ((unitById.get(b.unitId) || {}).sortOrder ?? 0);
      if (unitOrder) return unitOrder;
      const empOrder = ((employeeById.get(a.employeeId) || {}).displayOrder ?? 0) - ((employeeById.get(b.employeeId) || {}).displayOrder ?? 0);
      if (empOrder) return empOrder;
      return a.employeeName.localeCompare(b.employeeName, 'id');
    });
}

function sanitizeForFirebase(obj) {
  if (!obj || typeof obj !== 'object') return obj === undefined ? null : obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
    if (v === undefined) return [k, null];
    if (v && typeof v === 'object' && !Array.isArray(v)) return [k, sanitizeForFirebase(v)];
    return [k, v];
  }));
}

/** Metadata-only log of one export (never the PDF/blob itself — mirrors
    js/exports/export-history.js's convention). `source: 'closing'` is
    reserved for Sprint 9's auto-generated Closing report. */
export async function logReportGenerated({ format, period, periodLabel, dateRangeStart, dateRangeEnd, scope, status, fileSize, durationMs, error, source } = {}) {
  const entry = sanitizeForFirebase({
    id: genId('report'),
    reportTitle: 'Laporan Overtime',
    generatedAt: Date.now(),
    generatedBy: actorLabel(),
    userId: actorId(),
    periodKey: period || null,
    periodLabel: periodLabel || null,
    dateRangeStart: dateRangeStart || null,
    dateRangeEnd: dateRangeEnd || null,
    scope: scope || { type: 'all', unitId: null, employeeId: null, label: 'Semua Unit & Karyawan' },
    format: format || 'pdf',
    status: status || 'success',
    fileSize: fileSize == null ? null : fileSize,
    durationMs: durationMs == null ? null : durationMs,
    error: error || null,
    appVersion: APP_VERSION,
    source: source || 'manual',
  });
  await putReportHistoryEntry(entry);
  return entry;
}

/** Report History list, newest first. */
export function listReportHistory() { return getReportHistory(); }

/** Re-derives filters from a stored history entry and rebuilds the
    snapshot fresh — regenerate-on-demand, never fetches stored bytes
    (no Firebase Storage is used anywhere in this app). Returns the
    entry alongside the snapshot so the caller (UI) knows which
    exporter (`entry.format`) to invoke. */
export function regenerateReportFromHistory(entryId) {
  const entry = getReportHistory().find(e => e.id === entryId);
  if (!entry) throw new Error('Riwayat laporan tidak ditemukan.');
  const snapshot = getReportSnapshot({
    period: entry.periodKey || 'month',
    refDate: entry.dateRangeStart || undefined,
    unitId: (entry.scope && entry.scope.unitId) || null,
    employeeId: (entry.scope && entry.scope.employeeId) || null,
  });
  return { entry, snapshot };
}

