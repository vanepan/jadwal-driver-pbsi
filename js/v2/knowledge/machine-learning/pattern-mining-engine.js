/* ============================================================
   PATTERN-MINING-ENGINE.JS — Machine Learning Foundation (V2.0.9, Phase 12)

   PURPOSE: "Pattern Mining" — a more nuanced sibling of
   knowledge/extraction/pattern-extraction-engine.js (V2.0.8): that engine
   extracts ONE aggregate pattern per domainType+kind population; this one
   clusters the population first (clustering-engine.js, similarity-based,
   not exact-match) and extracts ONE pattern PER CLUSTER — surfacing
   distinct variants a single aggregate pattern would blur together.
   Reuses pattern-extraction-engine.js's `fieldPresenceRates()` per
   cluster rather than re-deriving it.

   RESPONSIBILITY: `minePatternsPerCluster(domainType, kind, opts)` —
   writes one Candidate `kind:'structure'` item per cluster of size >= 2.

   DEPENDENCIES: knowledge/extraction/index-engine.js, clustering-engine.js,
   knowledge/extraction/pattern-extraction-engine.js (fieldPresenceRates),
   knowledge/extraction/extraction-write-helper.js,
   knowledge/language/contracts/pattern-contract.js,
   knowledge/contracts/identity-contract.js.

   NON-GOALS: never modifies Approved Knowledge — every mined pattern is
   Candidate-lifecycle (Decision 6). Singleton clusters (size 1) are
   skipped — a pattern needs at least 2 corroborating members.
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from '../extraction/index-engine.js';
import { clusterItems } from './clustering-engine.js';
import { fieldPresenceRates } from '../extraction/pattern-extraction-engine.js';
import { writeExtractedCandidate } from '../extraction/extraction-write-helper.js';
import { isPatternEntry } from '../language/contracts/pattern-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

const DEFAULT_SLOT_THRESHOLD = 0.8;

/**
 * @param {string} domainType
 * @param {string} kind
 * @param {{similarityThreshold?: number, slotThreshold?: number}} [opts]
 * @returns {{ok: boolean, clustersFound: number, patternsWritten: number, writes: object[], error: object|null}}
 */
export function minePatternsPerCluster(domainType, kind, opts = {}) {
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, clustersFound: 0, patternsWritten: 0, writes: [], error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to mine.` } };
  }

  const clusters = clusterItems(items, opts.similarityThreshold);
  const slotThreshold = opts.slotThreshold ?? DEFAULT_SLOT_THRESHOLD;
  const now = new Date().toISOString();
  const writes = [];

  clusters.forEach((cluster, clusterIndex) => {
    if (cluster.length < 2) return; // no corroboration for a singleton

    const rates = fieldPresenceRates(cluster);
    const slots = [...rates.entries()]
      .filter(([, rate]) => rate >= slotThreshold)
      .sort((a, b) => b[1] - a[1])
      .map(([name, rate]) => ({ name, type: 'presence', rate: Math.round(rate * 100) / 100 }));

    const pattern = Object.freeze({
      template: `${domainType}/${kind} cluster ${clusterIndex} pattern: {{${slots.map((s) => s.name).join('}}, {{')}}}`,
      slots: Object.freeze(slots),
      granularity: 'structure',
    });
    if (!isPatternEntry(pattern)) return;

    const sourceRef = `pattern-cluster:${domainType}:${kind}:${clusterIndex}`;
    const candidate = Object.freeze({
      id: generateKnowledgeId({ domainType, sourceType: 'extraction', sourceRef }),
      version: 1, domainType, sourceType: 'extraction', kind: 'structure',
      payload: pattern, confidence: Math.min(1, cluster.length / items.length),
      lifecycleState: LIFECYCLE_STATE.CANDIDATE,
      provenance: Object.freeze({ connectorId: 'extraction', sourceRef, capturedAt: now }),
      approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
    });
    writes.push(writeExtractedCandidate(candidate));
  });

  return { ok: true, clustersFound: clusters.length, patternsWritten: writes.length, writes, error: null };
}
