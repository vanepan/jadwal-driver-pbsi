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
  saveSettings as storeSaveSettings,
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

/* ── Settings + smart opening-balance sync (v1.13.2.2) ───────────────
   The active cycle is "empty" when nothing has been realised against it yet:
   no active (non-archived) expenses and a zero realised total. Only then does a
   change to the Saldo Awal Default also retune the CURRENT cycle's opening
   balance; otherwise the change applies to the next cycle only. */
export function isActiveCycleEmpty() {
  const cycle = getActiveCycle();
  if (cycle && (cycle.realizedAmount || 0) > 0) return false;
  return activeExpenses().length === 0;
}

/**
 * Persist Petty Cash settings, with smart opening-balance sync:
 * • CASE A — active cycle still empty → also apply the new openingBalance to the
 *   current cycle so the dashboard reflects it immediately.
 * • CASE B — active cycle already has expenses → settings only; the current
 *   cycle keeps its opening balance and the new value takes effect on the next
 *   cycle (created by receiveReplenishment).
 * Returns { syncedCycle, opening, cycleNumber } for the caller's feedback.
 */
export async function saveSettings(draft) {
  const merged = { ...getSettings(), ...draft };
  const cycle = getActiveCycle();
  let syncedCycle = null;
  if (isActiveCycleEmpty() && cycle && cycle.openingBalance !== merged.openingBalance) {
    // Empty cycle → no spend, so closing tracks opening.
    syncedCycle = { ...cycle, openingBalance: merged.openingBalance, closingBalance: merged.openingBalance };
  }
  await storeSaveSettings(merged, syncedCycle);
  return { syncedCycle: !!syncedCycle, opening: merged.openingBalance, cycleNumber: cycle ? cycle.cycleNumber : 1 };
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
  // Cascade-archived expenses are owned by their Test NOR — restore them by
  // restoring the NOR (restoreNor) so the NOR/expense states stay consistent.
  if (e.archivedByNor) throw new Error('Pengeluaran ini diarsipkan bersama NOR Test. Pulihkan melalui NOR terkait.');
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

  // Fan-out: write the NOR and lock its selected expenses. Both Official and
  // TEST NORs now lock their expenses (the TEST case is the "LOCKED TEST"
  // state) and stamp norId, so the association is authoritative. An Official
  // lock is released by the cycle-close replenishment; a TEST lock is released
  // by archiving the NOR (cascade — see archiveTestNor / restoreNor). (v1.13.2)
  const updates = {};
  updates[`${P.nors}/${norId}`] = nor;
  selected.forEach(e => {
    updates[`${P.expenses}/${e.id}`] = { ...e, status: EXPENSE_STATUS.LOCKED, norId, updatedAt: now };
  });
  await applyUpdates(updates);

  await writeAudit(AUDIT_ACTION.NOR_GENERATED, 'nor', norId,
    `${num} · ${selected.length} nota · ${realized}${isTest ? ' · TEST' : ''}`);
  for (const e of selected) {
    await writeAudit(AUDIT_ACTION.EXPENSE_LOCKED, 'expense', e.id, `Terkunci dalam ${num}${isTest ? ' (Test)' : ''}`);
  }
  return nor;
}

/**
 * Archive a NOR (v1.13.2): sets archived=true while PRESERVING the original
 * type. An archived Official NOR stays Official ("ARSIP"); an archived Test
 * NOR stays Test ("ARSIP · TEST"). Archived NORs leave the Official view and
 * are excluded from metrics. Export name kept for caller compatibility.
 *
 * NOR Archive Cascade (v1.13.2): a TEST NOR locks its expenses ("LOCKED TEST"),
 * which would otherwise become permanent orphans once the NOR is archived. So
 * archiving a TEST NOR cascades to its expenses — each one is archived too, its
 * prior status snapshotted in `previousStatus` and tagged with `archivedByNor`
 * /`archivedReason` so `restoreNor` can put it back exactly. An OFFICIAL NOR is
 * NEVER cascaded (rule H): its expenses stay LOCKED to preserve the cycle's
 * historical snapshot.
 */
export async function archiveTestNor(norId) {
  const nor = getNorById(norId);
  if (!nor) throw new Error('NOR tidak ditemukan.');
  if (nor.archived) return { cascadedCount: 0, isTest: nor.type === NOR_TYPE.TEST };
  const now = Date.now();
  const isTest = nor.type === NOR_TYPE.TEST;

  const updates = {};
  // Cascade only for TEST NORs. We target the NOR's stored `expenseIds` (the
  // authoritative association — also covers legacy Test NORs whose expenses
  // predate the norId stamping), skipping any already archived.
  let cascaded = [];
  if (isTest) {
    const ids = nor.expenseIds || [];
    cascaded = getExpenses().filter(e => ids.includes(e.id) && e.status !== EXPENSE_STATUS.ARCHIVED);
    cascaded.forEach(e => {
      updates[`${P.expenses}/${e.id}`] = {
        ...e,
        previousStatus: e.status,
        status: EXPENSE_STATUS.ARCHIVED,
        archivedByNor: norId,
        archivedReason: 'test_nor_archive',
        updatedAt: now,
      };
    });
  }
  updates[`${P.nors}/${norId}`] = {
    ...nor, archived: true, archivedAt: now, archivedExpenseCount: cascaded.length,
  };
  await applyUpdates(updates);

  await writeAudit(AUDIT_ACTION.NOR_ARCHIVED, 'nor', norId, `${nor.norNumber} diarsipkan${isTest ? ' (test)' : ''}`);
  for (const e of cascaded) {
    await writeAudit(AUDIT_ACTION.EXPENSE_ARCHIVED_BY_TEST_NOR, 'expense', e.id,
      `Pengeluaran diarsipkan otomatis karena NOR Test ${nor.norNumber} diarsipkan`);
  }
  return { cascadedCount: cascaded.length, isTest };
}

/**
 * Restore an archived NOR (v1.13.2): clears archived and, for a TEST NOR,
 * cascades the restore back to every expense it archived — each is returned to
 * its `previousStatus` and the cascade metadata (archivedByNor / archivedReason
 * / previousStatus) is stripped. Writing a full object to each expense path
 * deletes the omitted keys (Firebase multi-path update semantics).
 */
export async function restoreNor(norId) {
  const nor = getNorById(norId);
  if (!nor) throw new Error('NOR tidak ditemukan.');
  const now = Date.now();
  const isTest = nor.type === NOR_TYPE.TEST;

  const updates = {};
  const restored = isTest ? getExpenses().filter(e => e.archivedByNor === norId) : [];
  restored.forEach(e => {
    const clean = { ...e, status: e.previousStatus || EXPENSE_STATUS.LOCKED, updatedAt: now };
    delete clean.previousStatus;
    delete clean.archivedByNor;
    delete clean.archivedReason;
    updates[`${P.expenses}/${e.id}`] = clean;
  });
  const norClean = { ...nor, archived: false };
  delete norClean.archivedAt;
  delete norClean.archivedExpenseCount;
  updates[`${P.nors}/${norId}`] = norClean;
  await applyUpdates(updates);

  await writeAudit(AUDIT_ACTION.NOR_RESTORED, 'nor', norId, `${nor.norNumber} dipulihkan${isTest ? ' (test)' : ''}`);
  for (const e of restored) {
    await writeAudit(AUDIT_ACTION.EXPENSE_RESTORED_BY_TEST_NOR, 'expense', e.id,
      `Pengeluaran dipulihkan otomatis karena NOR Test ${nor.norNumber} dipulihkan`);
  }
  return { cascadedCount: restored.length, isTest };
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
