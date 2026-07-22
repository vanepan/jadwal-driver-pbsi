/* ============================================================
   KNOWLEDGE-CONTRIBUTION-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Knowledge Contribution" — a LIVE re-check of whether an
   archived document has a corresponding KnowledgeItem, distinct from
   ArchiveRecord.hasContributedKnowledge (a point-in-time snapshot taken
   when the record was archived by nor-archive-source.js — Knowledge can
   be acquired AFTER archiving, making that flag stale). Reuses the exact
   same deterministic id scheme (identity-contract.js#generateKnowledgeId)
   nor-connector.js and nor-archive-source.js both already use.

   RESPONSIBILITY: `checkKnowledgeContribution(archiveRecord)` and
   `listRecordsMissingKnowledgeContribution(domainType)`.

   DEPENDENCIES: repository/archive-repository.js,
   knowledge/contracts/identity-contract.js,
   knowledge/repository/knowledge-repository.js (read-only).

   NON-GOALS: does not trigger acquisition itself — a caller wanting to
   close the gap calls knowledge/acquisition/acquisition-engine.js#runAcquisition
   directly; this engine only reports the current state.
   ============================================================ */

'use strict';

import { listArchive as list } from './services/archive-service.js';
import { generateKnowledgeId } from '../../js/v2/knowledge/contracts/identity-contract.js';
import {
  getKnowledge as getById,
} from '../../js/v2/knowledge/services/knowledge-service.js';

/**
 * @param {import('./contracts/archive-record-contract.js').ArchiveRecord} archiveRecord
 * @returns {boolean}
 */
export function checkKnowledgeContribution(archiveRecord) {
  const knowledgeId = generateKnowledgeId({
    domainType: archiveRecord.sourceDomainType,
    sourceType: archiveRecord.sourceDomainType, // same connector-id-equals-domainType convention nor-connector.js/nor-archive-source.js both use
    sourceRef: archiveRecord.sourceId,
  });
  return getById(knowledgeId).ok;
}

/** @returns {string[]} archive record ids with no corresponding KnowledgeItem, live-checked */
export function listRecordsMissingKnowledgeContribution(domainType) {
  const result = list({ sourceDomainType: domainType });
  const records = result.ok ? result.data : [];
  return records.filter((r) => !checkKnowledgeContribution(r)).map((r) => r.id);
}
