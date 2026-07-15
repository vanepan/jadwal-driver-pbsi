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
import { AUDIT_ACTION, AUDIT_LABEL, AUDIT_COLOR } from './overtime-config.js';
import {
  RATE_TIERS, isValidTierKey, tierLabel, resolveActiveRateVersion, versionsForTier,
} from './overtime-rate-engine.js';
import {
  genId, getUnits, getEmployees, getRateVersions, getAudit,
  putUnit, putEmployee, putRateVersion, putAudit,
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

/** Active + inactive employees, sorted by name. */
export function listEmployees({ includeInactive = true, unitId = null } = {}) {
  return getEmployees()
    .filter(e => includeInactive || e.isActive !== false)
    .filter(e => !unitId || e.unitId === unitId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
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
  const employee = {
    id: genId('emp'), name: trimmed, unitId, isActive: true, note: note || '',
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
  const next = {
    ...employee, name: trimmed, unitId, note: note || '',
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

function todayISOLocal() {
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
