'use strict';

/* ============================================================
   COMPLIANCE-CONFIG.JS — Vehicle Compliance & Financial History

   Central configuration for `complianceHistory` records: renewal types and
   payment methods. Mirrors maintenance-config.js's registry shape so both
   history ledgers (mechanical vs. legal/financial) read the same way.

   PURE: plain data only. No DOM, no Firebase, no `window`.
   ============================================================ */

// Renewal Types — open-ended by design so future compliance events (insurance,
// registration, inspection…) can reuse `complianceHistory` without a schema
// change. v1.29.16 adds 'insurance' (Phase 5 — Insurance Ledger): the FIRST
// type to exercise that extensibility since this file's original comment was
// written; no other field changed to support it.
export const COMPLIANCE_TYPES = Object.freeze(['annual_tax', 'five_year_tax', 'insurance', 'other']);

export const COMPLIANCE_TYPE_REGISTRY = Object.freeze([
  Object.freeze({ key: 'annual_tax',    label: 'Pajak Tahunan',   timelineTitle: 'STNK Diperpanjang' }),
  Object.freeze({ key: 'five_year_tax', label: 'Pajak 5 Tahunan', timelineTitle: 'STNK 5 Tahunan Diperpanjang' }),
  Object.freeze({ key: 'insurance',     label: 'Asuransi',        timelineTitle: 'Asuransi Diperpanjang' }),
  Object.freeze({ key: 'other',         label: 'Lainnya',         timelineTitle: 'Pembayaran Lainnya' }),
]);

export const COMPLIANCE_PAYMENT_METHODS = Object.freeze(['cash', 'transfer', 'petty_cash', 'corporate_account']);

export const COMPLIANCE_PAYMENT_METHOD_REGISTRY = Object.freeze([
  Object.freeze({ key: 'cash',              label: 'Tunai' }),
  Object.freeze({ key: 'transfer',          label: 'Transfer' }),
  Object.freeze({ key: 'petty_cash',        label: 'Kas Kecil' }),
  Object.freeze({ key: 'corporate_account', label: 'Rekening Perusahaan' }),
]);

/** Registry entry for a renewal type (never null, falls back to 'other'). */
export function complianceTypeInfo(key) {
  return COMPLIANCE_TYPE_REGISTRY.find(t => t.key === key)
    || COMPLIANCE_TYPE_REGISTRY.find(t => t.key === 'other');
}

/** Registry entry for a payment method (may be null when unset — payment method is optional). */
export function compliancePaymentMethodInfo(key) {
  if (!key) return null;
  return COMPLIANCE_PAYMENT_METHOD_REGISTRY.find(p => p.key === key) || null;
}
