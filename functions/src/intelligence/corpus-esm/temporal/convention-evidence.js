/* ============================================================
   CONVENTION-EVIDENCE.JS — Historical vs Current Convention
   (V2, Phase 5.x.3)

   PURPOSE: assemble the MULTI-DOCUMENT evidence behind each convention
   (§7, §12) — a deterministic analytical view over observations, keyed
   the SAME way Phase 5.x.2 candidate-grouping groups them
   (`category | key | normalised observedValue`), enriched with the
   temporal bucket of each contributing document's CANONICAL sourceDate.

   It builds ON `groupObservations` from Phase 5.x.2 — one grouping
   implementation, not two (§12). It NEVER rewrites an observation, never
   merges wording, never drops a competing value (§8): every distinct
   observed value is its own group with its own evidence.

   THE EVIDENCE PER GROUP:
     documentIds / observationIds        links preserved (§12)
     documentCount / datedDocumentCount / undatedDocumentCount
     historical/current/transitional/unknownDate DocumentCount   (bucketed)
     oldestSourceDate / latestSourceDate / temporalSpreadDays
   Undated documents (sourceDate === null) are counted honestly and NEVER
   assigned a bucket (§14, §15).

   RESPONSIBILITY: buildConventionEvidence({ observations, documents },
   windows) -> ConventionEvidenceGroup[].

   DEPENDENCIES: ../analysis/candidate-grouping.js (groupObservations),
   ./temporal-windows.js (bucketSourceDate, daysBetweenIso),
   ./contracts/temporal-contract.js. PURE.
   ============================================================ */

'use strict';

import { groupObservations } from '../analysis/candidate-grouping.js';
import { bucketSourceDate, daysBetweenIso } from './temporal-windows.js';
import { TEMPORAL_CLASSIFICATION } from './contracts/temporal-contract.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** documentId -> the document's canonical sourceDate (or null). ONLY the
 *  canonical field — never upload/ingestion/filename/fs (§14). */
function indexDocumentDates(documents) {
  const m = new Map();
  for (const d of (Array.isArray(documents) ? documents : [])) {
    if (!d || typeof d !== 'object' || !d.documentId) continue;
    const sd = typeof d.sourceDate === 'string' && ISO_DATE.test(d.sourceDate) ? d.sourceDate : null;
    m.set(String(d.documentId), sd);
  }
  return m;
}

/**
 * @typedef {Object} ConventionEvidenceGroup
 * @property {string} groupKey
 * @property {string} category
 * @property {string} observationKey
 * @property {string|null} observedValue        - verbatim
 * @property {string[]} observationIds
 * @property {string[]} documentIds
 * @property {number} documentCount
 * @property {number} datedDocumentCount
 * @property {number} undatedDocumentCount
 * @property {number} historicalDocumentCount
 * @property {number} currentDocumentCount
 * @property {number} transitionalDocumentCount
 * @property {number} unknownDateDocumentCount   - dated docs that fell outside every window (only when configured) + undated
 * @property {string|null} oldestSourceDate
 * @property {string|null} latestSourceDate
 * @property {number|null} temporalSpreadDays
 * @property {Array<{documentId: string, sourceDate: string|null, bucket: string}>} perDocument
 */

/**
 * @param {{ observations: object[], documents: object[] }} input
 * @param {import('./temporal-windows.js').ResolvedWindows} windows
 * @returns {ConventionEvidenceGroup[]}  deterministic order (sorted by groupKey)
 */
export function buildConventionEvidence({ observations = [], documents = [] } = {}, windows) {
  const dateOf = indexDocumentDates(documents);
  const groups = groupObservations(observations); // Phase 5.x.2 — one grouping impl

  const out = groups.map((g) => {
    const documentIds = [...g.documentIds].map(String).sort();
    const observationIds = [...new Set(g.members.map((m) => String(m.observationId)))].sort();

    const perDocument = documentIds.map((documentId) => {
      const sourceDate = dateOf.has(documentId) ? dateOf.get(documentId) : null;
      const bucket = bucketSourceDate(sourceDate, windows);
      return { documentId, sourceDate, bucket };
    });

    const dated = perDocument.filter((p) => p.sourceDate);
    const datedSorted = [...dated].sort((a, b) => (a.sourceDate < b.sourceDate ? -1 : a.sourceDate > b.sourceDate ? 1 : 0));
    const oldest = datedSorted.length ? datedSorted[0].sourceDate : null;
    const latest = datedSorted.length ? datedSorted[datedSorted.length - 1].sourceDate : null;

    const bcount = (b) => perDocument.filter((p) => p.bucket === b).length;

    return Object.freeze({
      groupKey: g.key,
      category: g.category,
      observationKey: g.observationKey,
      observedValue: g.observedValue == null ? null : String(g.observedValue),
      observationIds: Object.freeze(observationIds),
      documentIds: Object.freeze(documentIds),
      documentCount: documentIds.length,
      datedDocumentCount: dated.length,
      undatedDocumentCount: documentIds.length - dated.length,
      historicalDocumentCount: bcount(TEMPORAL_CLASSIFICATION.HISTORICAL),
      currentDocumentCount: bcount(TEMPORAL_CLASSIFICATION.CURRENT),
      transitionalDocumentCount: bcount(TEMPORAL_CLASSIFICATION.TRANSITIONAL),
      unknownDateDocumentCount: bcount(TEMPORAL_CLASSIFICATION.UNKNOWN),
      oldestSourceDate: oldest,
      latestSourceDate: latest,
      temporalSpreadDays: oldest && latest ? daysBetweenIso(oldest, latest) : null,
      perDocument: Object.freeze(perDocument.map((p) => Object.freeze(p))),
    });
  });

  // deterministic ordering
  return out.sort((a, b) => (a.groupKey < b.groupKey ? -1 : a.groupKey > b.groupKey ? 1 : 0));
}

/** group evidence entries by (category, observationKey) — the axis on
 *  which two competing VALUES are a conflict (§8). */
export function indexBySlot(evidenceGroups) {
  const m = new Map();
  for (const g of (Array.isArray(evidenceGroups) ? evidenceGroups : [])) {
    const slot = `${g.category}|${g.observationKey}`;
    if (!m.has(slot)) m.set(slot, []);
    m.get(slot).push(g);
  }
  return m;
}
