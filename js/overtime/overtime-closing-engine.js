/* ============================================================
   OVERTIME-CLOSING-ENGINE.JS — pure Monthly Closing rules (Sprint 9)

   Mirrors overtime-rate-engine.js's purity contract: no DOM, no
   Firebase, no side effects. overtime-service.js gathers the month's
   records/employees/rateVersions from the store and a rate resolver
   function, and hands them here.

   Product decision (confirmed): validation is WARN-ONLY. This engine
   NEVER throws and NEVER blocks Closing — it only reports what it
   found. The admin makes the final call (CLAUDE.md: "Human owns
   final authority").
   ============================================================ */

'use strict';

import { CLOSING_STATUS } from './overtime-config.js';

export const WARNING_CODE = {
  DUPLICATE: 'duplicate',
  MISSING_EMPLOYEE: 'missing_employee',
  INVALID_RATE: 'invalid_rate',
  HOLIDAY_MISMATCH: 'holiday_mismatch',
};

export const WARNING_LABEL = {
  [WARNING_CODE.DUPLICATE]: 'Duplikat entri',
  [WARNING_CODE.MISSING_EMPLOYEE]: 'Karyawan tidak ditemukan',
  [WARNING_CODE.INVALID_RATE]: 'Tarif tidak valid',
  [WARNING_CODE.HOLIDAY_MISMATCH]: 'Tidak sesuai kalender libur',
};

/**
 * Groups records by employee+unit+date and returns every group with more
 * than one record — the single source of "what counts as a duplicate" in
 * this module. Extracted out of validateMonthForClosing (Final UX
 * Refinement §8 Level 3) so Dashboard/Penyesuaian Data can flag duplicates
 * in already-recorded data WITHOUT a Closing context, instead of
 * duplicating this grouping logic a second time.
 * @param {Array} records
 * @returns {Array<{recordIds:string[], employeeId:string, unitId:string, date:string}>}
 */
export function findDuplicateRecords(records) {
  const seen = new Map();
  (records || []).forEach(r => {
    const key = `${r.employeeId}|${r.unitId}|${r.date}`;
    if (!seen.has(key)) seen.set(key, { recordIds: [], employeeId: r.employeeId, unitId: r.unitId, date: r.date });
    seen.get(key).recordIds.push(r.id);
  });
  return [...seen.values()].filter(g => g.recordIds.length > 1);
}

/**
 * @param {{records:Array, employees:Array, rateVersions:Array,
 *   resolveTierForDate?:(dateISO:string)=>({tierKey:string}|null)}} input
 * @returns {{warnings:Array<{code,severity,message,recordIds}>, warningCount:number, checkedAt:number}}
 */
export function validateMonthForClosing({ records, employees, rateVersions, resolveTierForDate } = {}) {
  const warnings = [];
  const employeeIds = new Set((employees || []).map(e => e.id));
  const rateVersionIds = new Set((rateVersions || []).map(v => v.id));
  const recs = records || [];

  findDuplicateRecords(recs).forEach(g => {
    warnings.push({
      code: WARNING_CODE.DUPLICATE, severity: 'warning',
      message: `${g.recordIds.length} entri duplikat untuk kombinasi karyawan/unit/tanggal yang sama.`,
      recordIds: g.recordIds,
    });
  });

  recs.forEach(r => {
    if (!employeeIds.has(r.employeeId)) {
      warnings.push({
        code: WARNING_CODE.MISSING_EMPLOYEE, severity: 'warning',
        message: `Entri pada ${r.date} merujuk karyawan yang sudah tidak ada.`,
        recordIds: [r.id],
      });
    }
    if (r.rateVersionId && !rateVersionIds.has(r.rateVersionId)) {
      warnings.push({
        code: WARNING_CODE.INVALID_RATE, severity: 'warning',
        message: `Entri pada ${r.date} merujuk tarif yang sudah tidak ada.`,
        recordIds: [r.id],
      });
    }
    // Overridden entries deliberately charge a tier different from the
    // calendar by design — never flag those as a mismatch.
    if (!r.overrideApplied && typeof resolveTierForDate === 'function') {
      const current = resolveTierForDate(r.date);
      if (current && current.tierKey && current.tierKey !== r.tierKey) {
        warnings.push({
          code: WARNING_CODE.HOLIDAY_MISMATCH, severity: 'warning',
          message: `Entri pada ${r.date} tercatat sebagai "${r.tierKey}", namun kalender libur saat ini menunjukkan "${current.tierKey}".`,
          recordIds: [r.id],
        });
      }
    }
  });

  return { warnings, warningCount: warnings.length, checkedAt: Date.now() };
}

/** Frozen archive payload for one (re-)Closing. `reportRef` starts null —
    the UI fills it in with the report-history id after generating the
    Closing report (kept out of this pure function, which never touches
    DOM-dependent PDF rendering). */
export function buildClosingSnapshot({ yyyyMM, summary, recordIds, warnings, priorVersion, actorLabel }) {
  return {
    yyyyMM,
    archivedAt: Date.now(),
    archivedBy: actorLabel || null,
    version: (priorVersion || 0) + 1,
    summary: summary || { totalRecords: 0, totalAmount: 0, byUnit: {}, byEmployee: {} },
    recordCount: (recordIds || []).length,
    recordIds: recordIds || [],
    reportRef: null,
    validationWarningsAtClose: warnings || [],
  };
}

export function isPeriodLocked(closingRecord) {
  return !!closingRecord && closingRecord.status === CLOSING_STATUS.CLOSED;
}
