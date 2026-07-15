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
import { AUDIT_ACTION, AUDIT_LABEL, AUDIT_COLOR, HOLIDAY_TYPES, DEFAULT_HOLIDAY_TIER_KEY } from './overtime-config.js';
import {
  RATE_TIERS, DEFAULT_TIER_KEY, isValidTierKey, tierLabel, resolveActiveRateVersion, versionsForTier,
} from './overtime-rate-engine.js';
import {
  genId, getUnits, getEmployees, getRateVersions, getHolidays, getRecords,
  getDailySummary, getMonthlySummary, getAudit,
  putUnit, putEmployee, putRateVersion, putHoliday, putAudit, applyOvertimeUpdates,
} from './overtime-store.js';

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
export function getDefaultRate(atDateISO) {
  return getActiveRate(DEFAULT_TIER_KEY, atDateISO);
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

/** Records already saved for a date (+ optional unit filter). */
export function listRecordsForDate(dateISO, unitId = null) {
  return getRecords().filter(r => r.date === dateISO && (!unitId || r.unitId === unitId));
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

/** Merge one batch's totals into a summary object (daily or monthly — same
    shape). ANALYTICS PREPARATION: never recomputed from scratch by scanning
    every record — Dashboard/Analytics (Sprint 7) read these instead. */
function mergeSummary(prev, { count, amount, unitId }) {
  const base = prev || { totalRecords: 0, totalAmount: 0, byUnit: {} };
  const byUnit = { ...base.byUnit };
  const u = byUnit[unitId] || { count: 0, amount: 0 };
  byUnit[unitId] = { count: u.count + count, amount: u.amount + amount };
  return { totalRecords: base.totalRecords + count, totalAmount: base.totalAmount + amount, byUnit, updatedAt: Date.now() };
}

/**
 * Batch-save Daily Entry: ONE atomic multi-node write covering every
 * selected employee's record + the daily/monthly summary + ONE audit entry
 * — never N separate writes for a single Save click (spec: "Batch Save").
 * `overrideTierKey`, when provided, charges that tier for THIS transaction
 * only — the holiday calendar / master rate are never touched by an
 * override.
 */
export async function createDailyEntries({ date, unitId, employeeIds, overrideTierKey, overrideNote }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Tanggal tidak valid.');
  const unit = getUnits().find(u => u.id === unitId);
  if (!unit) throw new Error('Unit tidak ditemukan.');
  const ids = Array.from(new Set((employeeIds || []).filter(Boolean)));
  if (!ids.length) throw new Error('Pilih minimal satu karyawan.');

  const overrideApplied = !!overrideTierKey;
  const resolved = overrideApplied
    ? (getActiveRate(overrideTierKey, date) ? { ...getActiveRate(overrideTierKey, date), holiday: null } : null)
    : resolveEntryRate(date);
  if (!resolved) throw new Error('Tarif untuk tanggal ini belum tersedia. Atur tarif terlebih dahulu di menu Rates.');

  const now = Date.now();
  const updates = {};
  ids.forEach(employeeId => {
    const rid = genId('rec');
    updates[`overtimeRecords/${rid}`] = {
      id: rid, employeeId, unitId, date,
      tierKey: resolved.tierKey, rateVersionId: resolved.id, rateAmount: resolved.amount,
      overrideApplied, overrideNote: overrideApplied ? (overrideNote || '') : '',
      createdAt: now, createdBy: actorId(),
    };
  });

  const batchAmount = resolved.amount * ids.length;
  updates[`overtimeDailySummary/${date}`] = mergeSummary(getDailySummary(date), { count: ids.length, amount: batchAmount, unitId });
  updates[`overtimeMonthlySummary/${yyyyMM(date)}`] = mergeSummary(getMonthlySummary(yyyyMM(date)), { count: ids.length, amount: batchAmount, unitId });

  const auditEntry = buildAudit(
    AUDIT_ACTION.DAILY_ENTRY_SAVED, 'dailyEntry', null,
    `${ids.length} karyawan unit "${unit.name}" pada ${date} (${resolved.tierLabel}${overrideApplied ? ' · override' : ''}).`,
  );
  updates[`overtimeAudit/${auditEntry.id}`] = auditEntry;

  await applyOvertimeUpdates(updates);
  return { count: ids.length, rate: resolved };
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
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

/* ── Employee History (Sprint 6) ─────────────────────────────────── */

/** All records for one employee, newest first. */
export function listEmployeeRecords(employeeId) {
  return getRecords()
    .filter(r => r.employeeId === employeeId)
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
