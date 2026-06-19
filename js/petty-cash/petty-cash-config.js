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

/** Operational units. "Others" reveals a free-text unit name field. */
export const UNITS = ['Engineering', 'Cleaning Service', 'Others'];

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

/** Expense lifecycle. */
export const EXPENSE_STATUS = { AVAILABLE: 'available', LOCKED: 'locked', ARCHIVED: 'archived' };

/** NOR lifecycle. */
export const NOR_STATUS = {
  GENERATED: 'generated',
  WAITING: 'waiting_replenishment',
  REPLENISHED: 'replenished',
  CLOSED: 'closed',
};

/** Cycle lifecycle. */
export const CYCLE_STATUS = { ACTIVE: 'active', CLOSED: 'closed' };

/** Audit action codes (used by the drawer timeline and the Excel audit sheet). */
export const AUDIT_ACTION = {
  EXPENSE_CREATED: 'expense_created',
  EXPENSE_UPDATED: 'expense_updated',
  EXPENSE_LOCKED: 'expense_locked',
  EXPENSE_DELETED: 'expense_deleted',
  NOR_GENERATED: 'nor_generated',
  NOR_EXPORTED: 'nor_exported',
  NOR_REPLENISHED: 'nor_replenished',
  CYCLE_CLOSED: 'cycle_closed',
  CYCLE_CREATED: 'cycle_created',
};

/** Human labels (id-ID) for audit actions. */
export const AUDIT_LABEL = {
  [AUDIT_ACTION.EXPENSE_CREATED]: 'Pengeluaran dicatat',
  [AUDIT_ACTION.EXPENSE_UPDATED]: 'Pengeluaran diperbarui',
  [AUDIT_ACTION.EXPENSE_LOCKED]: 'Dimasukkan ke NOR',
  [AUDIT_ACTION.EXPENSE_DELETED]: 'Pengeluaran dihapus',
  [AUDIT_ACTION.NOR_GENERATED]: 'NOR diterbitkan',
  [AUDIT_ACTION.NOR_EXPORTED]: 'NOR diekspor',
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
  [AUDIT_ACTION.NOR_GENERATED]: '#4f73a8',
  [AUDIT_ACTION.NOR_EXPORTED]: '#7a5aa8',
  [AUDIT_ACTION.NOR_REPLENISHED]: '#2f7d5b',
  [AUDIT_ACTION.CYCLE_CLOSED]: '#a9781a',
  [AUDIT_ACTION.CYCLE_CREATED]: '#2f7d5b',
};

/** Per-unit dot color used across lists. */
export function unitColor(unit) {
  if (unit === 'Engineering') return '#4f73a8';
  if (unit === 'Cleaning Service') return '#2f7d5b';
  return '#7a5aa8';
}

/* ── Default settings (seeded on first run) ──────────────────────
   Mirrors the official PBSI NOR signatories. Editable via the
   Settings screen and persisted to pettyCashSettings. */
export const DEFAULT_SETTINGS = {
  openingBalance: 15000000,
  lowBalanceThreshold: 1000000,
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

/** Display unit name (resolves "Others" → custom unit name). */
export function unitDisplay(e) {
  return e && e.unit === 'Others' ? (e.customUnit || 'Others') : (e && e.unit) || '—';
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
