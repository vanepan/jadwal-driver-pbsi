/* ============================================================
   COVERAGE-ENGINE.JS — Learning Ownership & Organizational Memory (Phase 5, Part 7)

   PURPOSE: replace the single fabricated-feeling "Coverage 72%" — which was
   never actually one number at all, but three DIFFERENT percentages
   (Knowledge/Profile/Dataset coverage, each computed by a different call
   site in learning-dashboard.js with no shared vocabulary) — with six named,
   independently explainable dimensions, each a real deterministic fraction
   over data that already exists.

   Every dimension states its own numerator, denominator and formula in its
   own `explanation` string — "72%" alone answers nothing; "72% of registered
   domains have at least one Approved knowledge item" answers everything.

   SCOPED, NOT JUST PLATFORM-WIDE — AND WHY THAT MATTERS BEYOND DISPLAY.
   computeCoverageReport(domainType) accepts an optional domain filter. Pass
   nothing and every dimension aggregates across the whole platform (the
   number the UI shows by default, matching the old code's own platform-level
   convention). Pass a real domainType and every dimension recomputes scoped
   to just that domain.

   This is not a display nicety: recordCoverageSnapshot() (Part 9, Coverage
   as a Learning producer) MUST call this with a real domainType, because
   every LearningEvent requires one (learning-event-contract.js's
   validateSeed refuses an empty domainType — a platform-wide fact recorded
   under no domain at all would be exactly the kind of unscoped, unauditable
   record the Learning domain exists to prevent). A first draft of this file
   tried to record the platform-wide number directly and failed that gate —
   left here as the reason the scoped path exists, not a hypothetical.

   NO NEW STATISTICS ENGINE for Relationship/Metadata/Pattern/Correction/Gap
   Coverage — each is a single O(N) pass (or, scoped to one domain, an O(N)
   filter) over data an existing engine already returns. Knowledge Coverage
   scoped to one domain is a direct boolean (does this domain have >=1
   Approved item); platform-wide it reuses knowledge-metrics-engine.js#
   computeHealthReport()'s own coveragePct verbatim — never recomputed twice.

   DEPENDENCIES: knowledge/metrics/knowledge-metrics-engine.js,
   knowledge/services/knowledge-service.js, knowledge/datasets/import-session/
   import-session-engine.js + metadata-inference-engine.js,
   knowledge/services/pattern-discovery-service.js,
   knowledge/registry/domain-type-registry.js (organizational-memory/ may
   depend on knowledge/), ./services/archive-service.js (this domain),
   ./gap-workflow-engine.js, ../learning/services/learning-service.js
   (records the snapshot — Part 9's "Coverage" producer).
   ============================================================ */

'use strict';

import { computeHealthReport } from '../../js/v2/knowledge/metrics/knowledge-metrics-engine.js';
import { listKnowledge } from '../../js/v2/knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../../js/v2/knowledge/contracts/lifecycle-contract.js';
import { listImportSessions } from '../../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import { AUTO_POPULATE_CONFIDENCE_THRESHOLD } from '../../js/v2/knowledge/datasets/import-session/metadata-inference-engine.js';
import { computePatternRecommendations } from '../../js/v2/knowledge/services/pattern-discovery-service.js';
import { listDomainTypes } from '../../js/v2/knowledge/registry/domain-type-registry.js';
import { listArchive } from './services/archive-service.js';
import { getGapsWithWorkflowState, countResolvedGaps } from './gap-workflow-engine.js';
import { recordCoverage } from '../../js/v2/learning/services/learning-service.js';

function pct(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

/** Dimension 1 — Knowledge Coverage. Platform-wide: reuse
 *  computeHealthReport()'s own coveragePct verbatim. Scoped to one domain:
 *  a direct boolean — does THIS domain have >=1 Approved item. */
function computeKnowledgeCoverage(domainType) {
  if (!domainType) {
    const health = computeHealthReport();
    return { pct: health.ok ? health.data.coveragePct : 0, hasApproved: null };
  }
  const result = listKnowledge({ domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  const hasApproved = result.ok && result.data.length > 0;
  return { pct: hasApproved ? 100 : 0, hasApproved };
}

/** Dimension 2 — Relationship Coverage. A record "has a relationship" if it
 *  carries ANY recorded reference (duplicate/supersession/parent/knowledge/
 *  dataset link) OR another record points back at it. A single O(N) pass
 *  with a reverse-reference set — deliberately NOT calling
 *  getArchiveRelationships() per record (that derives full rationale text
 *  and is O(N) itself per call, which would make this O(N²) for a number
 *  that only needs a boolean per record). */
function computeRelationshipCoverage(records) {
  if (!records.length) return { pct: 0, withRelationship: 0, total: 0 };
  const referencedIds = new Set();
  for (const r of records) {
    if (r.supersedesId) referencedIds.add(r.supersedesId);
    if (r.parentId) referencedIds.add(r.parentId);
  }
  let withRelationship = 0;
  for (const r of records) {
    const hasOwnLink = !!(r.duplicateOfId || r.supersedesId || r.supersededById || r.parentId || r.knowledgeItemId || r.datasetId);
    if (hasOwnLink || referencedIds.has(r.id)) withRelationship += 1;
  }
  return { pct: pct(withRelationship, records.length), withRelationship, total: records.length };
}

/** Dimension 3 — Metadata Coverage: of every Import Session, what fraction
 *  carries metadata the pipeline actually trusts — either the inference
 *  itself cleared the auto-populate bar, or a human confirmed it. Sessions
 *  with no confidence recorded at all (created outside inference, e.g. by a
 *  check script) count as trusted — there is no low-confidence signal to
 *  doubt, and doubting one would be inventing evidence. */
function computeMetadataCoverage(sessions) {
  if (!sessions.length) return { pct: 0, trusted: 0, total: 0 };
  const trusted = sessions.filter((s) => s.metadataConfirmedBy
    || typeof s.confidence !== 'number' || s.confidence >= AUTO_POPULATE_CONFIDENCE_THRESHOLD).length;
  return { pct: pct(trusted, sessions.length), trusted, total: sessions.length };
}

/** Dimension 4 — Pattern Coverage. Platform-wide: fraction of registered
 *  domains with >=1 real, evidence-backed pattern recommendation. Scoped:
 *  a direct boolean for that one domain. */
function computePatternCoverage(domainType, domains) {
  if (domainType) {
    const covered = computePatternRecommendations(domainType).length > 0;
    return { pct: covered ? 100 : 0, covered };
  }
  if (!domains.length) return { pct: 0, covered: 0, total: 0 };
  const covered = domains.filter((d) => computePatternRecommendations(d.id).length > 0).length;
  return { pct: pct(covered, domains.length), covered, total: domains.length };
}

/** Dimension 5 — Correction Coverage: of Import Sessions EVER flagged
 *  low-confidence (permanently recorded on `confidence` at creation, never
 *  overwritten), what fraction was actually corrected (`metadataConfirmedBy`
 *  set)? This exact denominator is what makes it a coverage fraction rather
 *  than a bare, denominator-less count. */
function computeCorrectionCoverage(sessions) {
  const everFlagged = sessions.filter((s) => typeof s.confidence === 'number' && s.confidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD);
  if (!everFlagged.length) return { pct: null, corrected: 0, total: 0 }; // nothing to measure — honestly null, never a fabricated 100%
  const corrected = everFlagged.filter((s) => !!s.metadataConfirmedBy).length;
  return { pct: pct(corrected, everFlagged.length), corrected, total: everFlagged.length };
}

/** Dimension 6 — Gap Coverage: resolved / (resolved + still-open). A domain
 *  with zero gaps ever detected reports null (nothing to cover), never a
 *  fabricated 100%. */
function computeGapCoverage(domainType, domains) {
  const scope = domainType ? [{ id: domainType }] : domains;
  let resolved = 0;
  let stillOpen = 0;
  for (const d of scope) {
    resolved += countResolvedGaps(d.id);
    stillOpen += getGapsWithWorkflowState(d.id).length;
  }
  const total = resolved + stillOpen;
  return { pct: total > 0 ? pct(resolved, total) : null, resolved, stillOpen, total };
}

/**
 * Part 7 — the six explainable Coverage dimensions.
 * @param {string|null} [domainType] — omit for the platform-wide report (the
 *   UI's default view); pass a real registered domainType to scope every
 *   dimension to just that domain (required before recording a snapshot).
 * @returns {{ok: true, data: object}}
 */
export function computeCoverageReport(domainType = null) {
  const domains = listDomainTypes();
  const sessionFilter = domainType ? { domainType } : {};
  const sessions = (() => { const r = listImportSessions(sessionFilter); return r.ok ? r.data : []; })();
  const archiveFilter = domainType ? { sourceDomainType: domainType } : {};
  const archiveRecords = (() => { const r = listArchive(archiveFilter); return r.ok ? r.data : []; })();

  const knowledge = { ...computeKnowledgeCoverage(domainType), explanation: 'Persentase domain (atau: apakah domain ini) memiliki minimal satu Knowledge berstatus Approved.' };
  const relationship = { ...computeRelationshipCoverage(archiveRecords), explanation: 'Persentase Archive Record yang memiliki minimal satu hubungan terekam (duplikat, penggantian, turunan, atau tertaut ke Knowledge/Dataset).' };
  const metadata = { ...computeMetadataCoverage(sessions), explanation: 'Persentase Import Session dengan metadata yang dipercaya pipeline — baik karena confidence otomatis mencukupi, maupun karena dikonfirmasi manusia.' };
  const pattern = { ...computePatternCoverage(domainType, domains), explanation: 'Persentase domain (atau: apakah domain ini) memiliki minimal satu rekomendasi pola dengan bukti statistik nyata.' };
  const correction = { ...computeCorrectionCoverage(sessions), explanation: 'Dari sesi yang pernah ditandai berkeyakinan rendah, persentase yang benar-benar telah dikoreksi manusia.' };
  const gap = { ...computeGapCoverage(domainType, domains), explanation: 'Dari seluruh gap penomoran yang pernah terdeteksi, persentase yang telah diselesaikan.' };

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      domainType: domainType || null,
      knowledgeCoverage: Object.freeze(knowledge),
      relationshipCoverage: Object.freeze(relationship),
      metadataCoverage: Object.freeze(metadata),
      patternCoverage: Object.freeze(pattern),
      correctionCoverage: Object.freeze(correction),
      gapCoverage: Object.freeze(gap),
      computedAt: new Date().toISOString(),
    }),
  });
}

/**
 * Part 9 — Coverage as a LEARNING PRODUCER: records this domain's report as a
 * snapshot via the Learning Service. Idempotent-when-unchanged (see
 * learning-service.js#recordCoverage), so calling this on every render is
 * safe — a converged report writes nothing, and a real change in coverage
 * produces exactly one new, dated snapshot. This is what makes "Knowledge
 * quality trend" (Part 8) a real trend instead of a fabricated one.
 * @param {string} domainType — required; every LearningEvent must be scoped
 *   to a real domain (see the header on why the platform-wide report cannot
 *   be recorded directly).
 */
export function recordCoverageSnapshot(domainType) {
  const report = computeCoverageReport(domainType);
  return recordCoverage({ domainType, report: report.data });
}
