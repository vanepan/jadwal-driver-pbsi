/* ============================================================
   WRITING-MEMORY-QUERY.JS — Organizational Writing Memory
   (V2, Phase 5.x.4)

   PURPOSE: the pure, read-only retrieval layer over a WritingMemoryReport
   (§20). Deterministic, scope-aware, provenance-preserving. It does NOT
   connect to the NOR generator (§21) — it is the interface a later RAG
   phase will consume.

   RESPONSIBILITY: queryWritingMemory(report, filter) + the small named
   helpers the phase names (get conventions for NOR, current evidence for
   opening patterns, preferred terminology, recipient / subject
   conventions, conflicts, historical-only, possible drift).

   DEPENDENCIES: ./contracts/writing-memory-contract.js,
   ../temporal/contracts/temporal-contract.js (CONVENTION_STATUS). PURE —
   no I/O, no mutation of the report.
   ============================================================ */

'use strict';

import { CONVENTION_STATUS } from '../temporal/contracts/temporal-contract.js';
import {
  WRITING_AUTHORITY_STATE, DOCUMENT_TYPE_SCOPE, isWritingMemoryReport,
} from './contracts/writing-memory-contract.js';

function entriesOf(report) {
  return isWritingMemoryReport(report) && Array.isArray(report.entries) ? report.entries : [];
}

/**
 * @param {import('./contracts/writing-memory-contract.js').WritingMemoryReport} report
 * @param {Object} [filter]
 * @param {string|string[]} [filter.category]
 * @param {string|string[]} [filter.documentType]        - a real type, 'cross_type', or 'ANY'
 * @param {string|string[]} [filter.temporalStatus]      - CONVENTION_STATUS.*
 * @param {string|string[]} [filter.conventionEra]       - TEMPORAL_CLASSIFICATION.*
 * @param {string|string[]} [filter.authorityState]      - 'observed' | 'candidate'
 * @param {string} [filter.key]
 * @param {boolean} [filter.candidatesOnly]
 * @param {boolean} [filter.approvedRulePresent]
 * @returns {import('./contracts/writing-memory-contract.js').WritingMemory[]}  a NEW sorted array; entries are the frozen originals (provenance intact)
 */
export function queryWritingMemory(report, filter = {}) {
  const f = filter && typeof filter === 'object' ? filter : {};
  const inSet = (v, spec) => {
    if (spec == null) return true;
    const list = Array.isArray(spec) ? spec : [spec];
    if (list.includes('ANY')) return true;
    return list.includes(v);
  };
  let out = entriesOf(report).filter((e) =>
    inSet(e.category, f.category)
    && inSet(e.documentType, f.documentType)
    && inSet(e.temporalStatus, f.temporalStatus)
    && inSet(e.conventionEra, f.conventionEra)
    && inSet(e.authorityState, f.authorityState)
    && (f.key == null || e.key === f.key));
  if (f.candidatesOnly === true) out = out.filter((e) => e.authorityState === WRITING_AUTHORITY_STATE.CANDIDATE);
  if (typeof f.approvedRulePresent === 'boolean') out = out.filter((e) => e.evidence.approvedRulePresent === f.approvedRulePresent);
  // deterministic order — already sorted by memoryId in the report, but a
  // filtered slice is re-sorted so callers never depend on report order.
  return [...out].sort((a, b) => (a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0));
}

/* ── named helpers (the queries §20 lists) ──────────────────────────── */

/** Writing conventions observed in NOR documents (scope NOR + cross_type). */
export function getWritingConventionsForType(report, documentType) {
  return queryWritingMemory(report, { documentType: [documentType, DOCUMENT_TYPE_SCOPE.CROSS_TYPE] });
}

/** Entries with recent/current evidence, optionally filtered to a category. */
export function getCurrentEvidence(report, category) {
  return queryWritingMemory(report, { category: category || undefined, temporalStatus: CONVENTION_STATUS.CURRENT_EVIDENCE });
}

/** Historically-observed-only patterns (NOT currently required — §15). */
export function getHistoricalOnly(report, category) {
  return queryWritingMemory(report, { category: category || undefined, temporalStatus: CONVENTION_STATUS.HISTORICAL_ONLY });
}

/** Preferred terminology / organizational terms. */
export function getPreferredTerminology(report) {
  return queryWritingMemory(report, { category: ['terminology', 'organizational_term', 'preferred_phrase'] });
}

export function getRecipientConventions(report) {
  return queryWritingMemory(report, { category: 'recipient_convention' });
}
export function getSubjectConventions(report) {
  return queryWritingMemory(report, { category: 'subject_convention' });
}

/** All conflict representations (competing values in a slot — §14). */
export function getConflicts(report) {
  return isWritingMemoryReport(report) && Array.isArray(report.conflicts) ? [...report.conflicts] : [];
}

/** All possible-drift signals (approved rule vs recent corpus — §17).
 *  Returns the read-only DriftFinding pass-through; ruleUnchanged is
 *  guaranteed true. */
export function getPossibleDrift(report) {
  const findings = isWritingMemoryReport(report) && Array.isArray(report.drift) ? report.drift : [];
  return findings.filter((d) => d && d.status === CONVENTION_STATUS.POSSIBLE_DRIFT).map((d) => Object.freeze({ ...d, ruleUnchanged: true }));
}

/** Entries that align with a supplied approved rule. */
export function getAligned(report) {
  return queryWritingMemory(report, { temporalStatus: CONVENTION_STATUS.ALIGNED });
}
