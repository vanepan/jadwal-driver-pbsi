/* ============================================================
   WRITING-MEMORY-BUILDER.JS — Organizational Writing Memory
   (V2, Phase 5.x.4)

   PURPOSE: the ONE deterministic transformation

     CorpusObservation[]  +  (temporal config)  →  WritingMemoryReport

   It CONSUMES the Phase 5.x.3 temporal analyzer (never re-derives its
   logic — §7) and the Phase 5.x.2 grouping, and produces evidence-backed
   WritingMemory entries scoped by document type (§11, §12), with the
   per-type document-type distribution preserved (§13), competing values
   kept side by side (§14), and drift findings passed through unchanged
   (§16, §17).

   HARD BOUNDARIES:
     • authorityState ∈ { observed, candidate } — NEVER `approved` (§8)
     • every entry is evidence-backed: >= 1 sourceObservationId AND
       >= 1 sourceDocumentId, else it is NOT emitted (§5)
     • original wording is kept verbatim in `value`; normalisation is a
       SEPARATE field (§6)
     • approved rules passed in are READ-ONLY reference — never copied
       into an entry as if approved here (§8, §16)
     • pure, deterministic, input-order independent, idempotent: same
       observations + same config ⇒ byte-identical report (§10, §24)
     • no model, no persistence, no NOR-generator wiring (§21)

   RESPONSIBILITY: buildWritingMemory({ observations, documents,
   approvedRules }, config, { at }).

   DEPENDENCIES: ./contracts/writing-memory-contract.js,
   ../temporal/convention-temporal-analyzer.js,
   ../temporal/temporal-input.js (sanitizeApprovedRules),
   ../corpus-analysis-config.js. PURE.
   ============================================================ */

'use strict';

import { DEFAULT_CORPUS_ANALYSIS_CONFIG } from '../corpus-analysis-config.js';
import { analyzeConventionTemporal } from '../temporal/convention-temporal-analyzer.js';
import { sanitizeApprovedRules } from '../temporal/temporal-input.js';
import { CORPUS_DOCUMENT_TYPE } from '../contracts/corpus-document-contract.js';
import { CONVENTION_STATUS } from '../temporal/contracts/temporal-contract.js';
import {
  WRITING_MEMORY_CATEGORIES, WRITING_AUTHORITY_STATE, DOCUMENT_TYPE_SCOPE,
  memoryIdFrom, makeWritingMemory, makeWritingMemoryConflict, makeWritingMemoryReport,
} from './contracts/writing-memory-contract.js';

const REAL_TYPES = Object.freeze([
  CORPUS_DOCUMENT_TYPE.NOR, CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI,
  CORPUS_DOCUMENT_TYPE.MEMORANDUM, CORPUS_DOCUMENT_TYPE.LEGACY, CORPUS_DOCUMENT_TYPE.UNKNOWN,
]);

function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** the verbatim wording to keep on the entry: the lexicographically-first
 *  DISTINCT raw observedValue among the source observations — deterministic,
 *  input-order independent (§6, §24). */
function pickVerbatim(observations) {
  const raw = [...new Set(observations
    .map((o) => (o && o.observedValue != null ? String(o.observedValue) : ''))
    .filter(Boolean))].sort();
  return raw.length ? raw[0] : '';
}

/**
 * @param {{ observations?: object[], documents?: object[], approvedRules?: object[] }} input
 * @param {object} [config]   a corpus-analysis-config shape
 * @param {{ at?: string }} [opts]
 * @returns {import('./contracts/writing-memory-contract.js').WritingMemoryReport}
 */
export function buildWritingMemory(input = {}, config, opts = {}) {
  const cfg = {
    ...DEFAULT_CORPUS_ANALYSIS_CONFIG,
    ...(config || {}),
    temporal: { ...DEFAULT_CORPUS_ANALYSIS_CONFIG.temporal, ...((config && config.temporal) || {}) },
  };
  const at = opts.at || new Date().toISOString();
  const candidateMin = Number.isInteger(cfg.candidateMinDocuments) && cfg.candidateMinDocuments >= 2 ? cfg.candidateMinDocuments : 3;
  const approvedRules = sanitizeApprovedRules(input.approvedRules);

  /* ── index inputs ── */
  const documents = (Array.isArray(input.documents) ? input.documents : []).filter((d) => d && d.documentId);
  const docById = new Map(documents.map((d) => [String(d.documentId), d]));
  const typeOf = (docId) => {
    const d = docById.get(String(docId));
    const t = d && d.documentType;
    return REAL_TYPES.includes(t) ? t : CORPUS_DOCUMENT_TYPE.UNKNOWN;
  };

  // §4 — writing/language observations only; structure/layout are OUT.
  // Defensive: only `observed` / `candidate` observations (Phase 5.x.2
  // never emits anything else, but a caller-supplied list is untrusted).
  const obsById = new Map();
  const writingObs = [];
  for (const o of (Array.isArray(input.observations) ? input.observations : [])) {
    if (!o || typeof o !== 'object' || !o.observationId || !o.documentId) continue;
    if (!WRITING_MEMORY_CATEGORIES.includes(o.category)) continue;
    if (o.lifecycleState !== 'observed' && o.lifecycleState !== 'candidate') continue;
    if (!docById.has(String(o.documentId))) continue;
    if (o.observedValue == null || String(o.observedValue).trim() === '') continue; // §6 — need recoverable wording
    obsById.set(String(o.observationId), o);
    writingObs.push(o);
  }

  /* ── temporal reads — CONSUME the analyzer, once for the full set and
        once per document-type slice (§7). The type slices are what keeps
        a Memorandum phrase from becoming a NOR convention (§11). ── */
  const fullTemporal = analyzeConventionTemporal(
    { observations: writingObs, documents, approvedRules }, cfg, { at },
  );

  const typesPresent = [...new Set(writingObs.map((o) => typeOf(o.documentId)))].sort();
  const perType = new Map();
  for (const type of typesPresent) {
    const sliceObs = writingObs.filter((o) => typeOf(o.documentId) === type);
    const sliceDocIds = new Set(sliceObs.map((o) => String(o.documentId)));
    const sliceDocs = documents.filter((d) => sliceDocIds.has(String(d.documentId)));
    perType.set(type, analyzeConventionTemporal({ observations: sliceObs, documents: sliceDocs, approvedRules }, cfg, { at }));
  }

  /* ── helpers to turn a ConventionTemporalEntry into a WritingMemory ── */
  const entryEvidenceBase = (tEntry, distribution, occurrenceCount) => ({
    documentCount: tEntry.evidence.documentCount,
    recentDocumentCount: tEntry.evidence.currentDocumentCount,
    historicalDocumentCount: tEntry.evidence.historicalDocumentCount,
    transitionalDocumentCount: tEntry.evidence.transitionalDocumentCount,
    undatedDocumentCount: tEntry.evidence.undatedDocumentCount,
    occurrenceCount,
    oldestSourceDate: tEntry.evidence.oldestSourceDate,
    latestSourceDate: tEntry.evidence.latestSourceDate,
    temporalSpreadDays: tEntry.evidence.temporalSpreadDays,
    documentTypeDistribution: distribution,
    conflictingDocumentCount: tEntry.evidence.conflictingDocumentCount,
    approvedRulePresent: tEntry.evidence.approvedRulePresent,
    approvedRuleMatches: tEntry.evidence.approvedRuleMatches,
  });

  const buildEntry = (tEntry, scope, distribution) => {
    const srcObs = tEntry.observationIds.map((id) => obsById.get(String(id))).filter(Boolean);
    if (!srcObs.length || !tEntry.documentIds.length) return null; // §5
    const value = pickVerbatim(srcObs);
    if (!value) return null; // §6
    const occurrenceCount = srcObs.reduce((a, o) => a + (Number.isInteger(o.occurrenceCount) && o.occurrenceCount >= 1 ? o.occurrenceCount : 1), 0);
    const confidence = srcObs.reduce((a, o) => Math.max(a, Number.isFinite(o.confidence) ? o.confidence : 0), 0);
    const docCount = tEntry.evidence.documentCount;
    // §9 — reuse the existing candidate threshold. `candidate` = strong
    // enough for a human to review; it is NOT an official standard.
    const authorityState = docCount >= candidateMin ? WRITING_AUTHORITY_STATE.CANDIDATE : WRITING_AUTHORITY_STATE.OBSERVED;
    return makeWritingMemory({
      memoryId: memoryIdFrom(scope, tEntry.category, tEntry.observationKey, value),
      category: tEntry.category,
      key: tEntry.observationKey,
      value,
      normalizedValue: normValue(value),
      documentType: scope,
      temporalStatus: tEntry.conventionStatus,
      conventionEra: tEntry.conventionEra,
      evidence: entryEvidenceBase(tEntry, distribution, occurrenceCount),
      confidence,
      authorityState,
      sourceObservationIds: tEntry.observationIds,
      sourceDocumentIds: tEntry.documentIds,
      createdAt: at,
      updatedAt: at,
    });
  };

  /* ── 1. type-scoped entries (§12) ── */
  const entries = [];
  for (const [type, report] of perType.entries()) {
    for (const tEntry of report.conventions) {
      const e = buildEntry(tEntry, type, { [type]: tEntry.evidence.documentCount });
      if (e) entries.push(e);
    }
  }

  /* ── 2. cross_type entries — only for groups whose evidence explicitly
        spans >= 2 real document types (§13). ── */
  for (const tEntry of fullTemporal.conventions) {
    const distribution = {};
    for (const docId of tEntry.documentIds) {
      const t = typeOf(docId);
      distribution[t] = (distribution[t] || 0) + 1;
    }
    const realTypesInGroup = Object.keys(distribution).filter((t) => REAL_TYPES.includes(t));
    if (realTypesInGroup.length < 2) continue; // not cross-type
    const e = buildEntry(tEntry, DOCUMENT_TYPE_SCOPE.CROSS_TYPE, distribution);
    if (e) entries.push(e);
  }

  entries.sort((a, b) => (a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0));

  /* ── 3. conflicts (§14) — from each temporal report's `conflicts`; keep
        BOTH sides, tagged with the scope they were seen in. ── */
  const conflicts = [];
  const addConflicts = (report, scope) => {
    for (const c of report.conflicts) {
      const sides = c.sides
        .map((sideEntry) => {
          // find the WritingMemory entry we already built for this side + scope
          const mv = normValue(sideEntry.observedValue);
          const match = entries.find((e) => e.documentType === scope && e.category === c.category
            && e.key === c.observationKey && normValue(e.value) === mv);
          return {
            memoryId: match ? match.memoryId : null,
            value: match ? match.value : (sideEntry.observedValue || ''),
            normalizedValue: mv || null,
            temporalStatus: sideEntry.conventionStatus,
            conventionEra: sideEntry.conventionEra,
            evidence: match ? match.evidence : { documentCount: sideEntry.evidence.documentCount, recentDocumentCount: sideEntry.evidence.currentDocumentCount },
          };
        })
        .sort((a, b) => (a.normalizedValue < b.normalizedValue ? -1 : a.normalizedValue > b.normalizedValue ? 1 : 0));
      if (sides.length < 2) continue;
      conflicts.push(makeWritingMemoryConflict({
        category: c.category, key: c.observationKey, documentType: scope, sides,
        note: `${sides.length} competing values are in recent use for "${c.observationKey}" (${scope}). BOTH are kept — Writing Memory does not choose (§14).`,
      }));
    }
  };
  addConflicts(fullTemporal, DOCUMENT_TYPE_SCOPE.CROSS_TYPE);
  for (const [type, report] of perType.entries()) addConflicts(report, type);
  conflicts.sort((a, b) => {
    const ka = `${a.documentType}|${a.category}|${a.key}`;
    const kb = `${b.documentType}|${b.category}|${b.key}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  // de-dup (same scope|category|key)
  const seenConflict = new Set();
  const conflictsOut = conflicts.filter((c) => {
    const k = `${c.documentType}|${c.category}|${c.key}`;
    if (seenConflict.has(k)) return false;
    seenConflict.add(k);
    return true;
  });

  /* ── 4. drift — pass through the temporal findings UNCHANGED (§16, §17) ── */
  const drift = fullTemporal.drift.map((d) => Object.freeze({ ...d, ruleUnchanged: true }));

  return makeWritingMemoryReport({
    generatedAt: at,
    temporalConfigured: fullTemporal.temporalConfigured === true,
    entries,
    conflicts: conflictsOut,
    drift,
  });
}
