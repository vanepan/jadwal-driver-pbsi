/* ============================================================
   RELATIONSHIP-EXTRACTION-ENGINE.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: "Relationship Extraction" — a real, deterministic signal: two
   Approved items of the same domainType+kind with IDENTICAL payloads are
   real evidence of corroboration (independent sources agreeing), written
   as `kind:'relationship'` Candidate items reusing
   knowledge/contracts/dependency-graph-contract.js's existing
   RELATIONSHIP_TYPE.CORROBORATES/isRelationshipPayload — never a new
   relationship vocabulary.

   RESPONSIBILITY: `extractCorroboratingRelationships(domainType, kind)`.

   DEPENDENCIES: index-engine.js, extraction-write-helper.js,
   knowledge/contracts/dependency-graph-contract.js,
   knowledge/contracts/identity-contract.js.

   NON-GOALS: only detects exact payload equality — no fuzzy/semantic
   similarity here (that is knowledge/learning/similarity-detection-engine.js's
   job, V2.0.5, a deliberately different, threshold-based algorithm for a
   different purpose: flagging a correction as possibly redundant, not
   asserting corroboration between settled facts).
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from './index-engine.js';
import { writeExtractedCandidate } from './extraction-write-helper.js';
import { RELATIONSHIP_TYPE, isRelationshipPayload } from '../contracts/dependency-graph-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

function payloadKey(item) {
  try { return JSON.stringify(item.payload); } catch { return String(item.payload); }
}

/**
 * @param {string} domainType
 * @param {string} kind
 * @returns {{ok: boolean, itemsAnalyzed: number, relationshipsExtracted: number, writes: object[], error: object|null}}
 */
export function extractCorroboratingRelationships(domainType, kind) {
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, itemsAnalyzed: 0, relationshipsExtracted: 0, writes: [], error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to extract relationships from.` } };
  }

  const groups = new Map();
  for (const item of items) {
    const key = payloadKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const now = new Date().toISOString();
  const writes = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const fromId = group[i].id;
        const toId = group[j].id;
        const relationshipPayload = Object.freeze({ fromId, toId, type: RELATIONSHIP_TYPE.CORROBORATES });
        if (!isRelationshipPayload(relationshipPayload)) continue;

        const sourceRef = `relationship:${fromId}:${toId}`;
        const candidate = Object.freeze({
          id: generateKnowledgeId({ domainType, sourceType: 'extraction', sourceRef }),
          version: 1, domainType, sourceType: 'extraction', kind: 'relationship',
          payload: relationshipPayload, confidence: 1,
          lifecycleState: LIFECYCLE_STATE.CANDIDATE,
          provenance: Object.freeze({ connectorId: 'extraction', sourceRef, capturedAt: now }),
          approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
        });
        writes.push(writeExtractedCandidate(candidate));
      }
    }
  }

  return { ok: true, itemsAnalyzed: items.length, relationshipsExtracted: writes.length, writes, error: null };
}
