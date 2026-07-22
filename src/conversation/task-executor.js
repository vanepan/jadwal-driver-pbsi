/* ============================================================
   TASK-EXECUTOR.JS — Conversation Intelligence Foundation (Phase 6, Part 6)

   PURPOSE: "Conversation Engine should never perform work directly...
   Conversation never bypasses service boundaries." This file is the ONLY
   place a Conversation's gathered facts are ever handed to a real,
   already-owned domain service — never a repository, never an engine that
   itself owns writes. Every dispatch below imports a SERVICE-layer (or, for
   NOR, the real registered pipeline STEP) function that already existed
   before this phase and already enforces its own domain's rules; this file
   adds no new authority over any of them.

   HONESTY OVER COMPLETENESS. Two of the six mission intents genuinely
   cannot be executed through conversation alone, and this file says so
   rather than faking it — the same discipline nor-generator-contract.js's
   own `proposeNorFields` stub and js/v2/README.md's "no file-upload/Storage
   mechanism exists anywhere in this codebase" already establish:

     CREATE_NOR       REAL, but DELIBERATELY LIMITED — dispatches to the
                       real, registered NOR Generator (document-
                       intelligence/nor/nor-generator.js#proposeNorFields),
                       which proposes STRUCTURAL suggestions (typical
                       signatory/item counts) from Approved NOR knowledge.
                       It never authors norNumber/subject/recipients or any
                       other business content this platform has no
                       statistical basis to invent (see that file's own
                       header) — the actual NOR document remains the
                       existing V1 flow, untouched.
     CORRECT_METADATA  REAL — dispatches to learning-service.js#
                       recordCorrection with the gathered domainType/
                       targetKey/correctedValue, exactly the fact a human
                       describing a correction in conversation already
                       supplies.
     REVIEW_KNOWLEDGE  REAL — dispatches to knowledge-service.js#
                       getPendingReviewKnowledge(); a genuine read, no
                       fabricated queue.
     GENERATE_EXECUTIVE_BRIEFING  REAL — composes computeCoverageReport(),
                       computeOrganizationalMemory() and
                       getKnowledgeMetrics(), the exact three engines
                       ui/learning-dashboard.js's own Executive Briefing
                       card already composes. Invents no new number.
     ARCHIVE_DOCUMENT  CONDITIONALLY REAL — if the named documentNumber is
                       already an ArchiveRecord, returns its real state (a
                       genuine read). A conversation cannot originate a
                       NEW ArchiveRecord (that needs a real source id/type/
                       hash/snapshot this layer has no way to construct
                       from a sentence) — reported honestly as
                       REQUIRES_ATTACHMENT, never fabricated.
     UPLOAD_KNOWLEDGE  HONESTLY NOT EXECUTABLE through conversation alone —
                       no file-upload/Storage mechanism exists anywhere in
                       this codebase (js/v2/README.md). Reported as
                       REQUIRES_ATTACHMENT, the same honest non-fabrication
                       this tree has practiced everywhere else.

   RESPONSIBILITY: executeTask.

   DEPENDENCIES (services/real pipeline steps only, never a repository):
   document-intelligence/nor/nor-generator.js, learning/services/
   learning-service.js, knowledge/services/knowledge-service.js,
   organizational-memory/services/archive-service.js,
   organizational-memory/coverage-engine.js,
   organizational-memory/organizational-memory-engine.js.
   ============================================================ */

'use strict';

import { INTENT } from './contracts/intent-contract.js';
import { proposeNorFields } from '../document-intelligence/nor/nor-generator.js';
import { recordCorrection, CORRECTION_TYPE } from '../../js/v2/learning/services/learning-service.js';
import { getPendingReviewKnowledge, getKnowledgeMetrics } from '../../js/v2/knowledge/services/knowledge-service.js';
import { listArchive } from '../organizational-memory/services/archive-service.js';
import { computeCoverageReport } from '../organizational-memory/coverage-engine.js';
import { computeOrganizationalMemory } from '../organizational-memory/organizational-memory-engine.js';

export const TASK_EXECUTOR_ERRORS = Object.freeze({
  UNKNOWN_INTENT: 'UNKNOWN_INTENT',
  REQUIRES_ATTACHMENT: 'REQUIRES_ATTACHMENT',
  DISPATCH_FAILED: 'DISPATCH_FAILED',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}
function success(data) {
  return Object.freeze({ ok: true, data: Object.freeze(data), error: null });
}

function executeCreateNor(conversation) {
  const facts = conversation.gatheredFacts;
  const result = proposeNorFields({ domainType: 'nor', ...facts }, { sessionId: conversation.id });
  // Forward the REAL error code (e.g. NO_KNOWLEDGE) rather than masking it —
  // "the executor honestly refuses to fabricate a draft" only means
  // something if a caller can tell WHY, not just that it failed.
  if (!result.ok) return failure(result.error.code, result.error.message);
  return success({
    kind: 'nor_structural_draft', draft: result.draft, citedKnowledgeIds: result.citedKnowledgeIds, sampleSize: result.sampleSize, facts,
  });
}

function executeCorrectMetadata(conversation) {
  const { domainType, targetKey, correctedValue } = conversation.gatheredFacts;
  if (!domainType || !targetKey) {
    return failure(TASK_EXECUTOR_ERRORS.DISPATCH_FAILED, 'CORRECT_METADATA requires domainType and targetKey.');
  }
  const result = recordCorrection({
    domainType, correctionType: CORRECTION_TYPE.METADATA, targetKey, actorId: conversation.actorId, after: { value: correctedValue },
  });
  if (!result.ok) return failure(result.error.code, result.error.message);
  return success({ kind: 'correction_recorded', learningEventId: result.data.id, op: result.op });
}

function executeReviewKnowledge() {
  const result = getPendingReviewKnowledge();
  const items = result.ok ? result.data : [];
  return success({ kind: 'pending_review_list', items, count: items.length });
}

function executeGenerateExecutiveBriefing(conversation) {
  const domainType = conversation.gatheredFacts.domainType || null;
  const coverage = computeCoverageReport(domainType || undefined);
  const orgMemory = domainType ? computeOrganizationalMemory(domainType) : null;
  const metrics = getKnowledgeMetrics();
  return success({
    kind: 'executive_briefing',
    domainType,
    coverage: coverage.ok ? coverage.data : null,
    organizationMemory: orgMemory && orgMemory.ok ? orgMemory.data : null,
    knowledgeMetrics: metrics.ok ? metrics.data : null,
  });
}

function executeArchiveDocument(conversation) {
  const { domainType, documentNumber } = conversation.gatheredFacts;
  const result = listArchive({ sourceDomainType: domainType });
  const existing = result.ok ? result.data.find((r) => r.documentNumber === documentNumber) : null;
  if (existing) {
    return success({
      kind: 'archive_record_found', archiveId: existing.id, state: existing.state,
    });
  }
  return failure(
    TASK_EXECUTOR_ERRORS.REQUIRES_ATTACHMENT,
    `Tidak ada ArchiveRecord untuk "${documentNumber}" — mengarsipkan dokumen BARU memerlukan sumber nyata (id/tipe/hash) yang tidak dapat dibentuk dari percakapan saja.`,
  );
}

function executeUploadKnowledge() {
  return failure(
    TASK_EXECUTOR_ERRORS.REQUIRES_ATTACHMENT,
    'Tidak ada mekanisme unggah berkas di platform ini — unggah pengetahuan memerlukan lampiran nyata yang tidak dapat diberikan lewat percakapan saja.',
  );
}

/**
 * @param {import('./contracts/conversation-contract.js').Conversation} conversation
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function executeTask(conversation) {
  switch (conversation.currentIntent.intent) {
    case INTENT.CREATE_NOR: return executeCreateNor(conversation);
    case INTENT.CORRECT_METADATA: return executeCorrectMetadata(conversation);
    case INTENT.REVIEW_KNOWLEDGE: return executeReviewKnowledge();
    case INTENT.GENERATE_EXECUTIVE_BRIEFING: return executeGenerateExecutiveBriefing(conversation);
    case INTENT.ARCHIVE_DOCUMENT: return executeArchiveDocument(conversation);
    case INTENT.UPLOAD_KNOWLEDGE: return executeUploadKnowledge();
    default: return failure(TASK_EXECUTOR_ERRORS.UNKNOWN_INTENT, `No executable task for intent "${conversation.currentIntent.intent}".`);
  }
}
