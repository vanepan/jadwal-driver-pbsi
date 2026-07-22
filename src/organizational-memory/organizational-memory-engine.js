/* ============================================================
   ORGANIZATIONAL-MEMORY-ENGINE.JS — Learning Ownership & Organizational
   Memory (Phase 5, Part 5)

   PURPOSE: Organization Memory as a first-class, explainable REPORT — not a
   new store, not a new statistics engine. Every one of the eight facts the
   mission names already has a real, deterministic source somewhere in the
   platform; this file's entire job is composing them under one name, the
   same "connect, don't invent" discipline learning-dashboard.js's own header
   already documents for its own composition.

   THE EIGHT FACTS, AND WHERE EACH ONE GENUINELY COMES FROM:

     Common document structures    profile-engine.js buildProfile(domainType,
     Common terminology             PROFILE_TYPE.PARAGRAPH / .VOCABULARY /
     Common organizational phrases  .APPROVAL) — REFRAMED, zero new statistics,
     Common approval patterns       exactly how pattern-discovery-engine.js
                                     already reframes the same entries into
                                     CandidateRecommendation (its own header:
                                     "Zero new statistics").
     Frequently reused knowledge    Archive Records grouped by knowledgeItemId
                                     — how many archived documents cite the
                                     SAME piece of knowledge. Organizational-
                                     memory/'s own domain (Archive), no new
                                     engine.
     Frequently corrected knowledge Learning Events, kind=CORRECTION, grouped
     Frequently missing metadata    by targetKey — supersession-chain length
     Frequently missing relationships IS the correction count for that target
                                     (see learning-service.js's supersede-on-
                                     new-fact design). Grouped further by
                                     correctionType for the "missing metadata"
                                     / "missing relationships" breakdowns.

   No AI. No clustering. No similarity scoring beyond what profile-engine.js
   and machine-learning/confidence-engine.js already compute (both reused
   unchanged). Every tally here is a real COUNT over real records.

   DEPENDENCIES: knowledge/profiles/profile-engine.js (organizational-memory/
   may depend on knowledge/), ./services/archive-service.js (this domain),
   ../learning/services/learning-service.js (organizational-memory/ may
   depend on learning/ — see learning-service.js's header for the full
   layering rationale).
   ============================================================ */

'use strict';

import { buildProfile } from '../../js/v2/knowledge/profiles/profile-engine.js';
import { PROFILE_TYPE } from '../../js/v2/knowledge/contracts/profile-contract.js';
import { listArchive } from './services/archive-service.js';
import { listLearningEvents } from '../../js/v2/learning/services/learning-service.js';
import { LEARNING_KIND, CORRECTION_TYPE, isTerminalLearningState } from '../../js/v2/learning/contracts/learning-event-contract.js';

/** Reframes an existing, already-computed ProfileEntry list — same pattern
 *  pattern-discovery-engine.js#fromProfileEntries already established, reused
 *  here rather than re-derived a third time. */
function profileFacts(domainType, profileType, label) {
  const result = buildProfile(domainType, profileType);
  if (!result.ok || !result.profile) return [];
  return result.profile.entries.map((e) => ({
    label,
    value: e.value,
    supportCount: e.sampleCount,
    confidence: e.confidence,
  }));
}

/** "Frequently reused knowledge" — how many archived documents cite the same
 *  KnowledgeItem. A real count over Archive's own REFERENCED_BY relationship
 *  (archive-relationship-engine.js's vocabulary), computed directly here
 *  since only the count is needed, not the full relationship explanation. */
function computeFrequentlyReusedKnowledge(domainType, limit) {
  const result = listArchive(domainType ? { sourceDomainType: domainType } : {});
  const records = result.ok ? result.data : [];
  const byKnowledgeId = new Map();
  for (const r of records) {
    if (!r.knowledgeItemId) continue;
    byKnowledgeId.set(r.knowledgeItemId, (byKnowledgeId.get(r.knowledgeItemId) || 0) + 1);
  }
  return [...byKnowledgeId.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([knowledgeItemId, count]) => ({ knowledgeItemId, referencedByCount: count }));
}

/** "Frequently corrected knowledge/documents" + the metadata/relationship
 *  breakdowns — one pass over CORRECTION-kind Learning Events, grouped by
 *  `targetKey` (what was corrected). A target's correction COUNT is real: it
 *  is the number of distinct events ever recorded for that target (APPLIED +
 *  HISTORICAL), not merely the current one — a target corrected 5 times has 4
 *  HISTORICAL predecessors and 1 current event, and all 5 are real occasions. */
function computeCorrectionFrequencies(domainType, limit) {
  const filter = { kind: LEARNING_KIND.CORRECTION };
  if (domainType) filter.domainType = domainType;
  const result = listLearningEvents(filter);
  const events = result.ok ? result.data : [];

  const byTarget = new Map();
  const byTypeCount = { [CORRECTION_TYPE.METADATA]: 0, [CORRECTION_TYPE.RELATIONSHIP]: 0, [CORRECTION_TYPE.KNOWLEDGE]: 0, [CORRECTION_TYPE.DOMAIN]: 0, [CORRECTION_TYPE.PATTERN]: 0 };

  for (const e of events) {
    const key = e.affectedKnowledgeId || e.sourceDocumentId || e.targetKey;
    if (!key) continue;
    if (!byTarget.has(key)) byTarget.set(key, { key, count: 0, correctionType: e.correctionType, lastAt: e.observedAt });
    const entry = byTarget.get(key);
    entry.count += 1;
    if (e.observedAt > entry.lastAt) entry.lastAt = e.observedAt;
    if (e.correctionType in byTypeCount) byTypeCount[e.correctionType] += 1;
  }

  const frequentlyCorrected = [...byTarget.values()]
    .filter((x) => x.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    frequentlyCorrected,
    frequentlyMissingMetadata: byTypeCount[CORRECTION_TYPE.METADATA],
    frequentlyMissingRelationships: byTypeCount[CORRECTION_TYPE.RELATIONSHIP],
    totalCorrections: events.length,
  };
}

/**
 * Part 5 — the eight-fact Organization Memory report.
 * @param {string} domainType
 * @param {{limit?: number}} [opts]
 */
export function computeOrganizationalMemory(domainType, { limit = 10 } = {}) {
  const corrections = computeCorrectionFrequencies(domainType, limit);
  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      domainType,
      // PARAGRAPH (kind: paragraph_pattern) and WRITING_STYLE (kind:
      // writing_style) are genuinely DIFFERENT profile types with different
      // source kinds — deliberately not the same source relabeled twice.
      commonDocumentStructures: Object.freeze(profileFacts(domainType, PROFILE_TYPE.PARAGRAPH, 'structure').slice(0, limit)),
      commonTerminology: Object.freeze(profileFacts(domainType, PROFILE_TYPE.VOCABULARY, 'terminology').slice(0, limit)),
      commonOrganizationalPhrases: Object.freeze(profileFacts(domainType, PROFILE_TYPE.WRITING_STYLE, 'phrase').slice(0, limit)),
      commonApprovalPatterns: Object.freeze(profileFacts(domainType, PROFILE_TYPE.APPROVAL, 'approval').slice(0, limit)),
      frequentlyReusedKnowledge: Object.freeze(computeFrequentlyReusedKnowledge(domainType, limit)),
      frequentlyCorrectedKnowledge: Object.freeze(corrections.frequentlyCorrected),
      frequentlyMissingMetadataCount: corrections.frequentlyMissingMetadata,
      frequentlyMissingRelationshipsCount: corrections.frequentlyMissingRelationships,
      totalLearningEvents: corrections.totalCorrections,
      computedAt: new Date().toISOString(),
    }),
  });
}

export { isTerminalLearningState };
