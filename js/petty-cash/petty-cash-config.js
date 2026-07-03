/* ============================================================
   PETTY-CASH-CONFIG.JS — Domain constants & pure formatters

   Single source of truth for the Petty Cash Center's enums,
   default settings, and presentation helpers. No DOM, no
   Firebase, no side effects — imported by the store, the
   service, the document engine, and the UI alike.

   v1.13.0 — Petty Cash Center production implementation.
   ============================================================ */

'use strict';

/* ── Business enums ──────────────────────────────────────────── */

/** Operational units. "Others" reveals a free-text unit name field.
    "Driver" aligns the unit list with the "Reimbursement Driver" category
    (v1.16.4.1). Order is fixed: Engineering · Cleaning Service · Driver · Others. */
export const UNITS = ['Engineering', 'Cleaning Service', 'Driver', 'Others'];

/**
 * Expense categories. "Reimbursement Driver" consolidates the legacy
 * BBM / Tol / Parkir / driver-operational lines into one category.
 */
export const CATEGORIES = [
  'Inventaris',
  'Perbaikan & Pemeliharaan',
  'Kebersihan',
  'Konsumsi',
  'ATK',
  'Reimbursement Driver',
  'Lainnya',
];

/** Reimbursement Driver detail mode (v1.16.4.2). When an expense is Unit=Driver
    AND Category="Reimbursement Driver", its amount is itemised across these
    fixed components and the total is computed (never typed). Stored as
    `reimbursementDetail: { bbm, tol, parkir, lembur, others }` — additive and
    backward compatible (legacy records simply omit it). */
export const REIMBURSE_UNIT = 'Driver';
export const REIMBURSE_CATEGORY = 'Reimbursement Driver';
export const REIMBURSE_ITEMS = [
  { key: 'bbm', label: 'BBM' },
  { key: 'tol', label: 'Tol' },
  { key: 'parkir', label: 'Parkir' },
  { key: 'lembur', label: 'Lembur' },
  { key: 'others', label: 'Others' },
];
/** A zeroed reimbursement detail (default state of a new itemisation). */
export function blankReimburseDetail() {
  return { bbm: 0, tol: 0, parkir: 0, lembur: 0, others: 0 };
}
/** Sum of all reimbursement components (null-safe; non-numeric → 0). */
export function reimburseSum(detail) {
  if (!detail) return 0;
  return REIMBURSE_ITEMS.reduce((a, it) => a + (Number(detail[it.key]) || 0), 0);
}
/** True when an expense (or form draft) is in Reimbursement Driver detail mode. */
export function isReimburseExpense(e) {
  return !!e && e.unit === REIMBURSE_UNIT && e.category === REIMBURSE_CATEGORY;
}
/** True when a reimbursement detail object carries any non-zero component. */
export function hasReimburseDetail(detail) {
  return !!detail && reimburseSum(detail) > 0;
}

/** Expense lifecycle. */
export const EXPENSE_STATUS = { AVAILABLE: 'available', LOCKED: 'locked', ARCHIVED: 'archived' };

/** NOR lifecycle. */
export const NOR_STATUS = {
  GENERATED: 'generated',
  WAITING: 'waiting_replenishment',
  REPLENISHED: 'replenished',
  CLOSED: 'closed',
};

/**
 * NOR document type. A "test" NOR is a UAT / development artifact: it is
 * generated for verification only, so it NEVER locks expenses, NEVER
 * affects operational metrics, and is hidden from the default (Official)
 * history view. Archiving any NOR converts it to an archived test record.
 */
export const NOR_TYPE = { OFFICIAL: 'official', TEST: 'test' };

/** Cycle lifecycle. */
export const CYCLE_STATUS = { ACTIVE: 'active', CLOSED: 'closed' };

/** Audit action codes (used by the drawer timeline and the Excel audit sheet). */
export const AUDIT_ACTION = {
  EXPENSE_CREATED: 'expense_created',
  EXPENSE_UPDATED: 'expense_updated',
  EXPENSE_LOCKED: 'expense_locked',
  EXPENSE_DELETED: 'expense_deleted',
  EXPENSE_ARCHIVED: 'expense_archived',
  EXPENSE_RESTORED: 'expense_restored',
  EXPENSE_ARCHIVED_BY_TEST_NOR: 'expense_archived_by_test_nor',
  EXPENSE_RESTORED_BY_TEST_NOR: 'expense_restored_by_test_nor',
  NOR_GENERATED: 'nor_generated',
  NOR_EXPORTED: 'nor_exported',
  NOR_ARCHIVED: 'nor_archived',
  NOR_RESTORED: 'nor_restored',
  NOR_REPLENISHED: 'nor_replenished',
  NOR_CONVERTED_TO_TEST: 'nor_converted_to_test',
  NOR_CONVERTED_TO_OFFICIAL: 'nor_converted_to_official',
  CYCLE_CLOSED: 'cycle_closed',
  CYCLE_CREATED: 'cycle_created',
};

/** Human labels (id-ID) for audit actions. */
export const AUDIT_LABEL = {
  [AUDIT_ACTION.EXPENSE_CREATED]: 'Pengeluaran dicatat',
  [AUDIT_ACTION.EXPENSE_UPDATED]: 'Pengeluaran diperbarui',
  [AUDIT_ACTION.EXPENSE_LOCKED]: 'Dimasukkan ke NOR',
  [AUDIT_ACTION.EXPENSE_DELETED]: 'Pengeluaran dihapus',
  [AUDIT_ACTION.EXPENSE_ARCHIVED]: 'Pengeluaran diarsipkan',
  [AUDIT_ACTION.EXPENSE_RESTORED]: 'Pengeluaran dipulihkan',
  [AUDIT_ACTION.EXPENSE_ARCHIVED_BY_TEST_NOR]: 'Diarsipkan bersama NOR Test',
  [AUDIT_ACTION.EXPENSE_RESTORED_BY_TEST_NOR]: 'Dipulihkan bersama NOR Test',
  [AUDIT_ACTION.NOR_GENERATED]: 'NOR diterbitkan',
  [AUDIT_ACTION.NOR_EXPORTED]: 'NOR diekspor',
  [AUDIT_ACTION.NOR_ARCHIVED]: 'NOR diarsipkan',
  [AUDIT_ACTION.NOR_RESTORED]: 'NOR dipulihkan',
  [AUDIT_ACTION.NOR_CONVERTED_TO_TEST]: 'NOR diubah menjadi TEST',
  [AUDIT_ACTION.NOR_CONVERTED_TO_OFFICIAL]: 'NOR diubah menjadi resmi',
  [AUDIT_ACTION.NOR_REPLENISHED]: 'Dana pengganti diterima',
  [AUDIT_ACTION.CYCLE_CLOSED]: 'Siklus ditutup',
  [AUDIT_ACTION.CYCLE_CREATED]: 'Siklus baru dimulai',
};

/** Accent color per audit action (matches the design's timeline dots). */
export const AUDIT_COLOR = {
  [AUDIT_ACTION.EXPENSE_CREATED]: '#2f7d5b',
  [AUDIT_ACTION.EXPENSE_UPDATED]: '#a9781a',
  [AUDIT_ACTION.EXPENSE_LOCKED]: '#a9781a',
  [AUDIT_ACTION.EXPENSE_DELETED]: '#9a1b2d',
  [AUDIT_ACTION.EXPENSE_ARCHIVED]: '#8b857c',
  [AUDIT_ACTION.EXPENSE_RESTORED]: '#2f7d5b',
  [AUDIT_ACTION.EXPENSE_ARCHIVED_BY_TEST_NOR]: '#8b857c',
  [AUDIT_ACTION.EXPENSE_RESTORED_BY_TEST_NOR]: '#2f7d5b',
  [AUDIT_ACTION.NOR_GENERATED]: '#4f73a8',
  [AUDIT_ACTION.NOR_EXPORTED]: '#7a5aa8',
  [AUDIT_ACTION.NOR_ARCHIVED]: '#8b857c',
  [AUDIT_ACTION.NOR_RESTORED]: '#2f7d5b',
  [AUDIT_ACTION.NOR_CONVERTED_TO_TEST]: '#4f73a8',
  [AUDIT_ACTION.NOR_CONVERTED_TO_OFFICIAL]: '#a9781a',
  [AUDIT_ACTION.NOR_REPLENISHED]: '#2f7d5b',
  [AUDIT_ACTION.CYCLE_CLOSED]: '#a9781a',
  [AUDIT_ACTION.CYCLE_CREATED]: '#2f7d5b',
};

/** Per-unit dot color used across lists. */
export function unitColor(unit) {
  if (unit === 'Engineering') return '#4f73a8';
  if (unit === 'Cleaning Service') return '#2f7d5b';
  if (unit === 'Driver') return '#c2683d';
  return '#7a5aa8';
}

/* Annual Petty Cash budget baseline (v1.16.0). Operational baseline agreed after
   the v1.15.9 audit: realisasi historis Jan–Nov ≈ Rp201 jt, proyeksi tahunan
   ≈ Rp219 jt → Rp240 jt disepakati sebagai baseline. CONFIGURABLE via Settings —
   never hardcode at call sites; read from settings and fall back to THIS constant
   so existing installations (without the field) keep working. */
export const DEFAULT_ANNUAL_PETTY_CASH_BUDGET = 240000000;

/* ── Default settings (seeded on first run) ──────────────────────
   Mirrors the official PBSI NOR signatories. Editable via the
   Settings screen and persisted to pettyCashSettings. */
export const DEFAULT_SETTINGS = {
  openingBalance: 15000000,
  lowBalanceThreshold: 1000000,
  annualPettyCashBudget: DEFAULT_ANNUAL_PETTY_CASH_BUDGET,
  senderTitle: 'Plt. Kabid Sarana dan Prasarana',
  recipients: 'Wakil Ketua Umum III, Sekretaris Jenderal, Bendahara',
  ccRecipients: 'Ketua Umum sebagai laporan, Audit Internal, Arsip',
  signatories: [
    { id: 1, label: 'Diajukan oleh', name: 'Raras Ayu Pratama', position: 'Plt. Kabid Sarpras', order: 1 },
    { id: 2, label: 'Mengetahui dan Menyetujui', name: 'Armand Darmadji', position: 'Wakil Ketua Umum III', order: 2 },
    { id: 3, label: 'Mengetahui/Menyetujui', name: 'Ricky Soebagdja', position: 'Sekretaris Jenderal', order: 3 },
    { id: 4, label: 'Dibayarkan oleh', name: 'Eddy Prayitno', position: 'Wakil Bendahara', order: 4 },
  ],
  recapSignatories: [
    { id: 1, label: 'Dibuat Oleh', name: 'Grace Widelia', position: 'Staf Sarana dan Prasarana', order: 1 },
    { id: 2, label: 'Disetujui Oleh', name: 'Raras Ayu Pratama', position: 'Plt. Kabid Sarana dan Prasarana', order: 2 },
  ],
};

/* ── Currency formatters ─────────────────────────────────────────
   rp     — UI display:    "Rp 1.250.000" (non-breaking space)
   rpDoc  — NOR letter:    "1.250.000,-"
   rpTable— NOR table/UI:  "Rp 1.250.000" (regular space) */
export function rp(n) { return 'Rp ' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }
export function rpDoc(n) { return Number(Math.round(n || 0)).toLocaleString('id-ID') + ',-'; }
export function rpTable(n) { return 'Rp ' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }

/**
 * Compact rupiah for executive/KPI surfaces where a full value would overflow,
 * clip, or wrap into ugly fragments. SINGLE source of truth — never reimplement.
 * Up to 1 decimal (Indonesian comma), trailing ",0" trimmed. Always one token
 * (uses a non-breaking space) so it can never break across lines.
 *   10.000.000 → "Rp 10 Jt" · 125.000.000 → "Rp 125 Jt" · 1.200.000.000 → "Rp 1,2 M"
 * @param {number} n
 * @returns {string}
 */
export function rpCompact(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const unit = (v, suffix) => {
    const s = (Math.round(v * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 });
    return `${sign}Rp ${s} ${suffix}`;
  };
  if (abs >= 1e12) return unit(abs / 1e12, 'T');   // triliun
  if (abs >= 1e9)  return unit(abs / 1e9,  'M');   // miliar
  if (abs >= 1e6)  return unit(abs / 1e6,  'Jt');  // juta
  if (abs >= 1e3)  return unit(abs / 1e3,  'Rb');  // ribu
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

/** Parse a user-typed amount ("Rp 1.250.000") → integer rupiah. */
export function parseAmount(value) {
  return parseInt(String(value == null ? '' : value).replace(/[^0-9]/g, ''), 10) || 0;
}

/* ── Date formatters (id-ID, ISO yyyy-mm-dd in/out) ─────────────── */
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtShort(iso) {
  if (!iso) return '-';
  const p = String(iso).split('-');
  return `${p[2]} ${MONTHS_SHORT[+p[1] - 1]} ${p[0]}`;
}
export function fmtLong(iso) {
  if (!iso) return '-';
  const p = String(iso).split('-');
  return `${p[2]} ${MONTHS_LONG[+p[1] - 1]} ${p[0]}`;
}
/** Today as ISO yyyy-mm-dd (local). */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Auto-generated NOR subject from the NOR date. Read-only in the UI. */
export function norAutoSubject(date) {
  return `Realisasi Petty Cash Pertanggal ${fmtLong(date)} Bidang Sarana dan Prasarana`;
}

/* ── NOR number auto-formatter ───────────────────────────────────────
   The user types only the sequence number (e.g. "120"); the system
   composes the full official number from the NOR DATE (never the system
   date): "120/Nota Organisasi/Sarpras/VI/2026". */
const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Roman month (I…XII) derived from an ISO date's month. */
export function romanMonth(iso) {
  const m = parseInt(String(iso || '').split('-')[1], 10);
  return (m >= 1 && m <= 12) ? ROMAN_MONTHS[m - 1] : '';
}

/** Validate a NOR sequence: required, digits only, positive integer.
    Rejects "", "ABC", "12A", "120/Nota". */
export function isValidNorSequence(v) {
  const s = String(v == null ? '' : v).trim();
  return /^[0-9]+$/.test(s) && parseInt(s, 10) > 0;
}

/** Compose the full NOR number from a sequence + the NOR date.
    norNumberFromSequence('120', '2026-06-19')
      → '120/Nota Organisasi/Sarpras/VI/2026'. */
export function norNumberFromSequence(seq, iso) {
  const n = String(seq == null ? '' : seq).trim();
  const year = String(iso || '').split('-')[0] || '';
  return `${n}/Nota Organisasi/Sarpras/${romanMonth(iso)}/${year}`;
}

/** Display unit name (resolves "Others" → custom unit name). */
export function unitDisplay(e) {
  return e && e.unit === 'Others' ? (e.customUnit || 'Others') : (e && e.unit) || '—';
}

/* ── Shared transaction ordering (v1.19.6.x) ───────────────────────
   Deterministic petty-cash ordering used by every consumer:
   primary = transaction date, secondary = createdAt, fallback = transaction number. */
function txDateValue(tx) {
  const iso = String(tx && (tx.expenseDate || tx.transactionDate || tx.date) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7)) - 1;
    const d = Number(iso.slice(8, 10));
    return Date.UTC(y, m, d);
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function txCreatedAtValue(tx) {
  const n = Number(tx && tx.createdAt);
  return Number.isFinite(n) ? n : null;
}

function txNumberValue(tx) {
  return String(tx && (tx.refNumber || tx.transactionNumber || tx.number) || '').trim();
}

function txNumberRank(value) {
  const m = String(value || '').match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

function compareTxNumber(a, b) {
  const ar = txNumberRank(a);
  const br = txNumberRank(b);
  if (ar != null && br != null && ar !== br) return ar - br;
  return String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
}

/**
 * Sort petty-cash transactions deterministically.
 * @param {Array<Object>} transactions
 * @param {'ASC'|'DESC'|'asc'|'desc'} direction
 * @returns {Array<Object>}
 */
export function sortTransactions(transactions, direction = 'DESC') {
  const list = Array.isArray(transactions) ? transactions.slice() : [];
  const asc = String(direction || '').toUpperCase() === 'ASC';
  const dir = asc ? 1 : -1;
  return list.sort((a, b) => {
    const dateDiff = txDateValue(a) - txDateValue(b);
    if (dateDiff) return dateDiff * dir;

    const aCreated = txCreatedAtValue(a);
    const bCreated = txCreatedAtValue(b);
    if (aCreated != null && bCreated != null && aCreated !== bCreated) {
      return (aCreated - bCreated) * dir;
    }

    const numDiff = compareTxNumber(txNumberValue(a), txNumberValue(b));
    if (numDiff) return numDiff * dir;

    const aid = String((a && (a.id || a.expenseId)) || '');
    const bid = String((b && (b.id || b.expenseId)) || '');
    return aid.localeCompare(bid, 'id', { numeric: true, sensitivity: 'base' }) * dir;
  });
}

/* ── Terbilang (Indonesian number-to-words) ─────────────────────── */
const ONES = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
export function terbilang(n) {
  n = Math.floor(n);
  if (n < 0) return 'minus ' + terbilang(-n);
  if (n < 12) return ONES[n];
  if (n < 20) return terbilang(n - 10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '');
  if (n < 200) return 'seratus' + (n - 100 ? ' ' + terbilang(n - 100) : '');
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
  if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + terbilang(n - 1000) : '');
  if (n < 1000000) return terbilang(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
  if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + ' juta' + (n % 1000000 ? ' ' + terbilang(n % 1000000) : '');
  return terbilang(Math.floor(n / 1000000000)) + ' miliar' + (n % 1000000000 ? ' ' + terbilang(n % 1000000000) : '');
}
/** Capitalised "… Rupiah" form used on the NOR. */
export function terbilangCap(n) {
  const t = terbilang(n).trim().replace(/\s+/g, ' ');
  return t.split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ') + ' Rupiah';
}

/** Split a comma/newline string into a trimmed list (recipients / cc). */
export function splitList(s) {
  return String(s || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
}

/** NOR display status → id-ID label + tone ('done' | 'pending'). */
export function norStatusMeta(status) {
  const done = status === NOR_STATUS.REPLENISHED || status === NOR_STATUS.CLOSED;
  return { done, label: done ? 'Selesai' : 'Menunggu Realisasi' };
}
