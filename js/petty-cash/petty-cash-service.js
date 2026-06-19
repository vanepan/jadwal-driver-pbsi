/* ============================================================
   PETTY-CASH-SERVICE.JS — Domain orchestration

   The only module that mutates Petty Cash state with business
   meaning. The UI calls these intents; persistence + realtime
   echo are handled by the store. Every state-changing intent
   writes a global audit entry (pettyCashAudit) so the drawer
   timeline and the Excel "Audit Trail" sheet share one source.

   Lifecycle invariants enforced here:
   • Locked / archived expenses are immutable (no edit/delete).
   • NOR generation locks its expenses and snapshots their line
     items (history survives a cycle reset).
   • "Dana Pengganti Diterima" closes the cycle, archives the
     current expenses, opens the next cycle, marks the NOR
     replenished — old records are preserved, never deleted.
   ============================================================ */

'use strict';

import { getCurrentUser } from '../auth.js';
import {
  EXPENSE_STATUS, NOR_STATUS, NOR_TYPE, CYCLE_STATUS, AUDIT_ACTION, AUDIT_LABEL, AUDIT_COLOR,
  norAutoSubject, unitDisplay, todayISO,
} from './petty-cash-config.js';
import {
  genId, getExpenses, getNors, getActiveCycle, getSettings, getAudit,
  getExpenseById, getNorById, putExpense, putNor, putCycle, putAudit,
  deleteExpense as storeDeleteExpense, applyUpdates, PETTY_CASH_PATHS as P,
} from './petty-cash-store.js';

/** Operational (official, non-archived) NORs — the only ones that count
    toward reporting metrics. Test and archived NORs are excluded. */
export function operationalNors() {
  return getNors().filter(n => n.type !== NOR_TYPE.TEST && !n.archived);
}

/* ── Identity helpers ───────────────────────────────────────────── */
export function currentActor() {
  const u = getCurrentUser();
  if (!u) return { name: 'Sistem', role: '' };
  return { name: u.displayName || u.username || 'Admin', role: u.role || '' };
}
function actorLabel() {
  const a = currentActor();
  return a.role === 'admin' ? `${a.name} · Admin` : a.name;
}

/* ── Audit ──────────────────────────────────────────────────────── */
function buildAudit(action, entityType, entityId, note) {
  const id = genId('audit');
  return {
    id,
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

/** Audit entries for one expense, newest last (drawer timeline order). */
export function getExpenseAudit(expenseId) {
  return getAudit()
    .filter(a => a.entityType === 'expense' && a.entityId === expenseId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/* ── Active expense set (non-archived = current cycle) ───────────── */
export function activeExpenses() {
  return getExpenses()
    .filter(e => e.status !== EXPENSE_STATUS.ARCHIVED)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export function availableExpenses() {
  return activeExpenses().filter(e => e.status === EXPENSE_STATUS.AVAILABLE);
}

/** Next sequential reference number: PC/{YYMM}/{seq}. */
export function nextRefNumber() {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seqs = getExpenses()
    .map(e => parseInt(String(e.refNumber || '').split('/')[2], 10))
    .filter(n => !isNaN(n));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `PC/${yymm}/${String(next).padStart(3, '0')}`;
}

/* ── Dashboard metrics (scoped to the active cycle) ──────────────── */
export function computeMetrics() {
  const cycle = getActiveCycle();
  const settings = getSettings();
  const opening = cycle ? cycle.openingBalance : settings.openingBalance;
  const active = activeExpenses();
  const spent = active.reduce((a, e) => a + (e.amount || 0), 0);
  const balance = opening - spent;
  const avail = active.filter(e => e.status === EXPENSE_STATUS.AVAILABLE);
  const availableTotal = avail.reduce((a, e) => a + (e.amount || 0), 0);
  const usagePct = opening > 0 ? Math.min(100, Math.round((spent / opening) * 100)) : 0;
  const low = balance < settings.lowBalanceThreshold;
  return {
    cycle, opening, spent, balance,
    availableCount: avail.length, availableTotal,
    expenseCount: active.length, norCount: operationalNors().length,
    usagePct, low, threshold: settings.lowBalanceThreshold,
  };
}

/* ── Expense intents ────────────────────────────────────────────── */
export async function createExpense(input) {
  const cycle = getActiveCycle();
  const now = Date.now();
  const id = genId('exp');
  const expense = {
    id,
    refNumber: nextRefNumber(),
    expenseDate: input.expenseDate || todayISO(),
    unit: input.unit || 'Engineering',
    customUnit: input.unit === 'Others' ? (input.customUnit || '').trim() : '',
    category: input.category || 'Lainnya',
    amount: input.amount || 0,
    description: (input.description || '').trim(),
    notes: (input.notes || '').trim(),
    receiptImage: input.receiptImage || null,
    status: EXPENSE_STATUS.AVAILABLE,
    norId: null,
    cycleId: cycle ? cycle.id : null,
    createdBy: actorLabel(),
    createdAt: now,
    updatedAt: now,
  };
  await putExpense(expense);
  await writeAudit(AUDIT_ACTION.EXPENSE_CREATED, 'expense', id, 'Dibuat dari nota fisik yang diserahkan unit');
  return expense;
}

export async function updateExpense(id, patch) {
  const e = getExpenseById(id);
  if (!e) throw new Error('Pengeluaran tidak ditemukan.');
  if (e.status !== EXPENSE_STATUS.AVAILABLE) throw new Error('Pengeluaran terkunci tidak dapat diubah.');
  const next = {
    ...e,
    ...patch,
    customUnit: (patch.unit || e.unit) === 'Others' ? (patch.customUnit ?? e.customUnit) : '',
    updatedAt: Date.now(),
  };
  await putExpense(next);
  await writeAudit(AUDIT_ACTION.EXPENSE_UPDATED, 'expense', id, patch._note || 'Pengeluaran diperbarui');
  return next;
}

export async function removeExpense(id) {
  const e = getExpenseById(id);
  if (!e) return;
  if (e.status !== EXPENSE_STATUS.AVAILABLE) throw new Error('Pengeluaran terkunci tidak dapat dihapus.');
  await storeDeleteExpense(id);
  await writeAudit(AUDIT_ACTION.EXPENSE_DELETED, 'expense', id, `Nota ${e.refNumber} dihapus`);
}

/* ── Expense archive (v1.13.2) ──────────────────────────────────────
   Archived expenses leave every operational view (list, dashboard,
   metrics) and cannot be selected for a NOR, but remain searchable under
   the Arsip filter and restorable. Only AVAILABLE expenses may be archived
   — LOCKED ones belong to an issued NOR and stay immutable. */

/** Archived expenses (newest first) — the Arsip filter's data source. */
export function archivedExpenses() {
  return getExpenses()
    .filter(e => e.status === EXPENSE_STATUS.ARCHIVED)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
}

/** Archive an AVAILABLE expense → status=archived. */
export async function archiveExpense(id) {
  const e = getExpenseById(id);
  if (!e) throw new Error('Pengeluaran tidak ditemukan.');
  if (e.status === EXPENSE_STATUS.LOCKED) throw new Error('Pengeluaran terkunci dalam NOR tidak dapat diarsipkan.');
  if (e.status === EXPENSE_STATUS.ARCHIVED) return e;
  const next = { ...e, status: EXPENSE_STATUS.ARCHIVED, updatedAt: Date.now() };
  await putExpense(next);
  await writeAudit(AUDIT_ACTION.EXPENSE_ARCHIVED, 'expense', id, `Nota ${e.refNumber} diarsipkan`);
  return next;
}

/** Restore an ARCHIVED expense → status=available. */
export async function restoreExpense(id) {
  const e = getExpenseById(id);
  if (!e) throw new Error('Pengeluaran tidak ditemukan.');
  if (e.status !== EXPENSE_STATUS.ARCHIVED) throw new Error('Hanya pengeluaran terarsip yang dapat dipulihkan.');
  const next = { ...e, status: EXPENSE_STATUS.AVAILABLE, updatedAt: Date.now() };
  await putExpense(next);
  await writeAudit(AUDIT_ACTION.EXPENSE_RESTORED, 'expense', id, `Nota ${e.refNumber} dipulihkan`);
  return next;
}

/* ── NOR generation ─────────────────────────────────────────────── */
export async function generateNor({ expenseIds, norNumber, norDate, type }) {
  const num = (norNumber || '').trim();
  if (!num) throw new Error('Nomor NOR wajib diisi.');
  const norType = type === NOR_TYPE.TEST ? NOR_TYPE.TEST : NOR_TYPE.OFFICIAL;
  const isTest = norType === NOR_TYPE.TEST;
  const ids = (expenseIds || []).slice();
  const selected = availableExpenses().filter(e => ids.includes(e.id));
  if (!selected.length) throw new Error('Pilih minimal satu nota untuk direalisasikan.');

  const cycle = getActiveCycle();
  const settings = getSettings();
  const opening = cycle ? cycle.openingBalance : settings.openingBalance;
  const realized = selected.reduce((a, e) => a + (e.amount || 0), 0);
  const remaining = opening - realized;
  const norId = genId('nor');
  const date = norDate || todayISO();
  const now = Date.now();

  // Denormalised line-item snapshot — survives a cycle reset / archive.
  const items = selected.map(e => ({
    expenseId: e.id,
    refNumber: e.refNumber,
    expenseDate: e.expenseDate,
    unit: unitDisplay(e),
    category: e.category,
    description: e.description,
    keterangan: e.notes || '—',
    amount: e.amount || 0,
  }));

  const nor = {
    id: norId,
    norNumber: num,
    norDate: date,
    type: norType,
    archived: false,
    subject: norAutoSubject(date),
    expenseIds: selected.map(e => e.id),
    items,
    openingBalance: opening,
    realizedAmount: realized,
    remainingBalance: remaining,
    cycleId: cycle ? cycle.id : null,
    status: NOR_STATUS.GENERATED,
    generatedBy: actorLabel(),
    generatedAt: now,
    replenishedAt: null,
  };

  // Fan-out: write the NOR. Official NORs lock their selected expenses;
  // TEST NORs are dry-runs — they never touch expense state or metrics.
  const updates = {};
  updates[`${P.nors}/${norId}`] = nor;
  if (!isTest) {
    selected.forEach(e => {
      updates[`${P.expenses}/${e.id}`] = { ...e, status: EXPENSE_STATUS.LOCKED, norId, updatedAt: now };
    });
  }
  await applyUpdates(updates);

  await writeAudit(AUDIT_ACTION.NOR_GENERATED, 'nor', norId,
    `${num} · ${selected.length} nota · ${realized}${isTest ? ' · TEST' : ''}`);
  if (!isTest) {
    for (const e of selected) {
      await writeAudit(AUDIT_ACTION.EXPENSE_LOCKED, 'expense', e.id, `Terkunci dalam ${num}`);
    }
  }
  return nor;
}

/**
 * Archive a NOR (v1.13.2): sets archived=true while PRESERVING the original
 * type. An archived Official NOR stays Official ("ARSIP"); an archived Test
 * NOR stays Test ("ARSIP · TEST"). Archived NORs leave the Official view and
 * are excluded from metrics. Does NOT unlock expenses (preserves the
 * historical snapshot). Export name kept for caller compatibility.
 */
export async function archiveTestNor(norId) {
  const nor = getNorById(norId);
  if (!nor) throw new Error('NOR tidak ditemukan.');
  await putNor({ ...nor, archived: true, archivedAt: Date.now() });
  const tag = nor.type === NOR_TYPE.TEST ? ' (test)' : '';
  await writeAudit(AUDIT_ACTION.NOR_ARCHIVED, 'nor', norId, `${nor.norNumber} diarsipkan${tag}`);
  return true;
}

/** Record that a NOR was exported (PDF or Excel). */
export async function recordNorExport(norId, kind) {
  await writeAudit(AUDIT_ACTION.NOR_EXPORTED, 'nor', norId, `Diekspor sebagai ${kind}`);
}

/* ── Cycle rollover ("Dana Pengganti Diterima") ─────────────────── */
export async function receiveReplenishment({ norId, newOpeningBalance }) {
  const nor = getNorById(norId);
  if (!nor) throw new Error('NOR tidak ditemukan.');
  const cycle = getActiveCycle();
  const settings = getSettings();
  const opening = newOpeningBalance || settings.openingBalance;
  const now = Date.now();

  const updates = {};

  // 1. Current NOR → replenished.
  updates[`${P.nors}/${norId}`] = { ...nor, status: NOR_STATUS.REPLENISHED, replenishedAt: now };

  // 2. Active cycle → closed (with realised totals frozen).
  if (cycle) {
    const realized = activeExpenses().reduce((a, e) => a + (e.amount || 0), 0);
    updates[`${P.cycles}/${cycle.id}`] = {
      ...cycle,
      status: CYCLE_STATUS.CLOSED,
      endDate: todayISO(),
      realizedAmount: realized,
      closingBalance: cycle.openingBalance - realized,
    };
  }

  // 3. Open the next cycle with the received opening balance.
  const newCycleId = genId('cycle');
  const newNumber = (cycle ? cycle.cycleNumber : 0) + 1;
  updates[`${P.cycles}/${newCycleId}`] = {
    id: newCycleId,
    cycleNumber: newNumber,
    startDate: todayISO(),
    endDate: null,
    openingBalance: opening,
    realizedAmount: 0,
    closingBalance: opening,
    status: CYCLE_STATUS.ACTIVE,
    createdAt: now,
  };

  // 4. Archive current expenses (preserve records; reset the working set).
  activeExpenses().forEach(e => {
    updates[`${P.expenses}/${e.id}`] = { ...e, status: EXPENSE_STATUS.ARCHIVED, updatedAt: now };
  });

  // 5. Persist the received amount as the new default opening balance.
  updates[`${P.settings}`] = { ...settings, openingBalance: opening };

  await applyUpdates(updates);

  await writeAudit(AUDIT_ACTION.NOR_REPLENISHED, 'nor', norId, `Dana pengganti diterima: ${opening}`);
  if (cycle) await writeAudit(AUDIT_ACTION.CYCLE_CLOSED, 'cycle', cycle.id, `Siklus #${cycle.cycleNumber} ditutup`);
  await writeAudit(AUDIT_ACTION.CYCLE_CREATED, 'cycle', newCycleId, `Siklus #${newNumber} dimulai · saldo awal ${opening}`);
  return { newCycleNumber: newNumber, opening };
}
