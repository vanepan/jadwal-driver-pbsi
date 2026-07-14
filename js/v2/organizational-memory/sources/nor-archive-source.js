/* ============================================================
   NOR-ARCHIVE-SOURCE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: the ONE real archive source — mirrors
   knowledge/connectors/nor-connector.js closely (same eligibility rule:
   official, non-archived NORs only; same read-only V1 seam:
   js/petty-cash/petty-cash-store.js#getNors()), but produces ArchiveRecords
   for Organizational Memory instead of KnowledgeItems for the Knowledge
   Platform — these are two different, complementary consumers of the same
   V1 read, not a duplicate connector.

   "Original Document Archive": `sourceSnapshot` is an immutable copy of
   the NOR's own identifying fields captured at archive time — the
   permanent organizational record, since no binary file storage exists
   anywhere in this codebase (research confirmed zero Firebase Storage
   usage) to attach an actual scanned document to.

   "Knowledge Contribution": cross-references the Knowledge repository via
   the EXACT SAME deterministic id nor-connector.js already uses
   (`generateKnowledgeId({domainType:'nor', sourceType:'nor', sourceRef:
   nor.id})`) — real reuse of Phase 9's identity scheme, not a new
   correlation mechanism.

   DEPENDENCIES: js/petty-cash/petty-cash-store.js (read-only, getNors(),
   getSettings()), knowledge/contracts/identity-contract.js,
   knowledge/repository/knowledge-repository.js (read-only, getById),
   document-hash.js, registry/archive-source-registry.js (self-registers
   at the bottom of this file — NOT bootstrapped by the registry itself,
   for the exact same dormancy reason as nor-connector.js: this module
   transitively loads the real Firebase SDK via petty-cash-store.js ->
   js/firebase.js).

   NON-GOALS: never writes back to V1. Never attaches a file (none exists
   to attach).
   ============================================================ */

'use strict';

import { getNors, getSettings } from '../../../petty-cash/petty-cash-store.js';
import { generateKnowledgeId } from '../../knowledge/contracts/identity-contract.js';
import {
  getKnowledge as getKnowledgeItemById,
} from '../../knowledge/services/knowledge-service.js';
import { archiveSourceSuccess, archiveSourceFailure, ARCHIVE_SOURCE_ERRORS } from '../contracts/archive-source-contract.js';
import { computeDocumentHash } from '../document-hash.js';
import { registerArchiveSource } from '../registry/archive-source-registry.js';

export const NOR_ARCHIVE_SOURCE_ID = 'nor';
export const NOR_ARCHIVE_SOURCE_VERSION = 'nor-archive-source@1';

function isEligible(nor) {
  return !!nor && nor.type !== 'test' && nor.archived !== true;
}

function hasContributedKnowledge(nor) {
  const knowledgeId = generateKnowledgeId({ domainType: 'nor', sourceType: 'nor', sourceRef: nor.id });
  const result = getKnowledgeItemById(knowledgeId);
  return result.ok;
}

function toArchiveRecord(nor, senderTitle) {
  const now = new Date().toISOString();
  const sourceSnapshot = Object.freeze({
    norNumber: nor.norNumber,
    norDate: nor.norDate,
    type: nor.type,
    subject: nor.subject || null,
    itemCount: (nor.items || []).length,
    generatedBy: nor.generatedBy || null,
    generatedAt: nor.generatedAt || null,
  });

  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'archive', sourceRef: nor.id }),
    version: 1,
    sourceDomainType: 'nor',
    sourceId: nor.id,
    sourceType: NOR_ARCHIVE_SOURCE_ID,
    documentNumber: nor.norNumber,
    documentDate: nor.norDate || null,
    senderOrigin: senderTitle || null,
    documentHash: computeDocumentHash(sourceSnapshot),
    hasContributedKnowledge: hasContributedKnowledge(nor),
    sourceSnapshot,
    hasOriginalFile: false,
    fileRef: null,
    archivedAt: now,
    updatedAt: now,
  });
}

function fetch() {
  try {
    const settings = getSettings();
    const items = getNors().filter(isEligible).map((nor) => toArchiveRecord(nor, settings.senderTitle));
    return archiveSourceSuccess(items, { sourceId: NOR_ARCHIVE_SOURCE_ID });
  } catch (e) {
    return archiveSourceFailure(
      ARCHIVE_SOURCE_ERRORS.FETCH_FAILED,
      e && e.message ? e.message : 'NOR archive source fetch failed.',
      { sourceId: NOR_ARCHIVE_SOURCE_ID },
    );
  }
}

export const norArchiveSource = Object.freeze({
  id: NOR_ARCHIVE_SOURCE_ID,
  version: NOR_ARCHIVE_SOURCE_VERSION,
  description: 'Archives generated, official NOR records into Organizational Memory, cross-referenced against the Knowledge repository.',
  fetch,
});

registerArchiveSource(norArchiveSource);

export default norArchiveSource;
