/* ============================================================
   CANDIDATE-GROUPING.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the ONE place frequency-across-documents is turned into a
   `candidate` observation — and NOTHING more (§11, §21).

   THE HARD RULE: "10 documents contain phrase X does NOT mean PBSI
   officially requires phrase X." A `candidate` is a proposal for a human
   to review. It is NOT authoritative. This module:
     • groups observations that describe the SAME thing
       (category + key + normalised observedValue) across documents
     • when a group is corroborated by at least `minDocuments` DISTINCT
       source documents, it may emit a `candidate` observation
     • it does NOT, and CANNOT, produce `approved` — that transition is
       human-gated (advanceObservationLifecycle) and unreachable here
     • it never sets approvedBy / approvedAt / preferenceRationale

   RESPONSIBILITY: groupObservations(observations) -> ObservationGroup[];
   promoteGroupsToCandidates(groups, { minDocuments }) -> CorpusObservation[]
   (each in lifecycleState 'candidate', with merged provenance +
   occurrenceCount = distinct-document count).

   DEPENDENCIES: ../contracts/corpus-observation-contract.js,
   ../contracts/observation-lifecycle-contract.js,
   ../corpus-observation-record.js. Pure.
   ============================================================ */

'use strict';

import {
  makeCorpusObservation, isCorpusObservation,
} from '../contracts/corpus-observation-contract.js';
import { OBSERVATION_LIFECYCLE } from '../contracts/observation-lifecycle-contract.js';
import { observationIdFrom } from '../corpus-observation-record.js';

function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

function groupKey(o) {
  return `${o.category}|${o.key}|${normValue(o.observedValue)}`;
}

/**
 * @param {import('../contracts/corpus-observation-contract.js').CorpusObservation[]} observations
 * @returns {Array<{ key: string, category: string, observationKey: string, observedValue: string|null, documentIds: string[], members: object[] }>}
 */
export function groupObservations(observations) {
  const groups = new Map();
  for (const o of (Array.isArray(observations) ? observations : [])) {
    if (!isCorpusObservation(o)) continue;
    const gk = groupKey(o);
    if (!groups.has(gk)) {
      groups.set(gk, {
        key: gk, category: o.category, observationKey: o.key, observedValue: o.observedValue,
        documentIds: new Set(), members: [],
      });
    }
    const g = groups.get(gk);
    g.documentIds.add(o.documentId);
    g.members.push(o);
  }
  return [...groups.values()].map((g) => Object.freeze({
    key: g.key, category: g.category, observationKey: g.observationKey, observedValue: g.observedValue,
    documentIds: Object.freeze([...g.documentIds]),
    members: Object.freeze(g.members),
  }));
}

/**
 * Emit a NON-AUTHORITATIVE `candidate` observation for each group seen in
 * at least `minDocuments` distinct documents. A candidate is a proposal —
 * it still requires an explicit human approval to become organizational
 * guidance (§21).
 *
 * @param {ReturnType<typeof groupObservations>} groups
 * @param {{ minDocuments?: number, at?: string }} [opts]
 * @returns {import('../contracts/corpus-observation-contract.js').CorpusObservation[]}
 */
export function promoteGroupsToCandidates(groups, opts = {}) {
  const minDocuments = Number.isInteger(opts.minDocuments) && opts.minDocuments >= 2 ? opts.minDocuments : 3;
  const at = opts.at || new Date().toISOString();
  const out = [];
  for (const g of (Array.isArray(groups) ? groups : [])) {
    if (!g || !Array.isArray(g.documentIds) || g.documentIds.length < minDocuments) continue;
    // merge provenance across every member; confidence = the max seen; the
    // canonical documentId is the first — a candidate is still traced to
    // real sources (§16).
    const members = Array.isArray(g.members) ? g.members : [];
    const provenance = [];
    let confidence = 0;
    let occurrenceCount = 0;
    for (const m of members) {
      for (const p of (m.provenance || [])) provenance.push(p);
      confidence = Math.max(confidence, m.confidence || 0);
      occurrenceCount += m.occurrenceCount || 1;
    }
    const documentId = members[0] ? members[0].documentId : g.documentIds[0];
    out.push(makeCorpusObservation({
      observationId: `${observationIdFrom(documentId, g.category, g.observationKey)}__cand`,
      documentId,
      category: g.category,
      key: g.observationKey,
      observedValue: g.observedValue,
      observation: {
        role: 'cross_document_candidate',
        corroboratingDocumentIds: g.documentIds,
        documentCount: g.documentIds.length,
      },
      modality: members[0] ? members[0].modality : 'text',
      provenance,
      confidence,
      occurrenceCount: Math.max(occurrenceCount, g.documentIds.length),
      // A CANDIDATE — never approved. No approvedBy / rationale. (§21)
      lifecycleState: OBSERVATION_LIFECYCLE.CANDIDATE,
      createdAt: at,
      updatedAt: at,
    }));
  }
  return out;
}
