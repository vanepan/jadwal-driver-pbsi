/* ============================================================
   QUESTION-OPTIMIZER.JS — Conversation Intelligence Foundation (Phase 6, Part 4)

   PURPOSE: "the engine should minimize questions... if information already
   exists, never ask again." This file is the ONLY place that decision is
   made, and it never fabricates an answer — every resolution is a REAL,
   already-recorded fact read from one of five named sources, in a fixed,
   documented priority order:

     1. PREVIOUS CONVERSATION  the SAME actor answered this exact field for
        this exact intent before, in a Conversation the caller has already
        filtered to COMPLETED. Applies to EVERY field, including facts that
        look occasion-specific — a human genuinely may repeat the same
        request (the same monthly trip), and their own prior answer is
        never a fabrication of it.
     2. PROFILE OVERRIDE  a human explicitly authored and got APPROVED a
        Business Rule override naming a default for this field
        (key === `default:<field>`, see resolveFromProfileOverride below) —
        the most deliberate, most human-gated source there is.
     3. ORGANIZATION MEMORY  computeOrganizationalMemory()'s
        commonApprovalPatterns, when a dominant, real-support pattern
        exists — narrowly scoped to the one field ("traveler"/executing
        unit) this mission's own example names ("Organization Memory knows:
        Traveler is usually Engineering Unit"). Never generalized to a
        field this platform has no aggregated approval-pattern basis for.
     4. KNOWLEDGE  any Approved KnowledgeItem for this domain whose payload
        already happens to carry this exact field — a generic, honest scan
        (never a fabricated schema), because knowledge producers may
        legitimately record any fact for their domain.
     5. ARCHIVE  the most recently archived AVAILABLE/REFERENCED document
        for this domain, if its recorded sourceSnapshot carries this field.

   WHY ONLY "optimizable" FIELDS TRY 2-4. intent-contract.js#
   INTENT_FIELD_SCHEMA marks a field `optimizable: false` specifically
   because no organizational aggregate could ever honestly stand in for it
   (a NOR's destination, budget, or dates are unique to THIS occasion) — see
   that contract's header. Only source 1 (a genuine repeat by the same
   human) is ever attempted for those; sources 2-4 are gated on
   `optimizable: true`.

   Every resolution carries its source and a human-readable rationale
   (contracts/question-contract.js#ResolvedFact) — Part 7's "why each
   question was skipped", answerable for every single skip, never a bare
   flag.

   RESPONSIBILITY: optimizeQuestions.

   DEPENDENCIES (read-only, one-way — conversation/ MAY depend on
   knowledge/ and organizational-memory/, never the reverse):
   knowledge/services/knowledge-service.js, knowledge/services/
   profile-override-service.js, organizational-memory/services/
   archive-service.js, organizational-memory/organizational-memory-engine.js.
   Deliberately does NOT import conversation/services/conversation-service.js
   or conversation/repository/conversation-repository.js — "previous
   conversations" are handed in by the caller (the service already holds
   them), which keeps this engine acyclic and pure over its inputs.
   ============================================================ */

'use strict';

import { getRequiredFacts } from '../contracts/intent-contract.js';
import { makeResolvedFact, QUESTION_SOURCE } from '../contracts/question-contract.js';
import { listKnowledge, LIFECYCLE_STATE } from '../../knowledge/services/knowledge-service.js';
import { listApprovedOverrides, PROFILE_OVERRIDE_TYPE } from '../../knowledge/services/profile-override-service.js';
import { listArchive, ARCHIVE_STATE } from '../../organizational-memory/services/archive-service.js';
import { computeOrganizationalMemory } from '../../organizational-memory/organizational-memory-engine.js';

/** A single sample is noise, not memory — same bar
 *  knowledge/services/pattern-discovery-service.js#MIN_SUPPORT_TO_RECORD
 *  already uses for the identical reason. */
const MIN_APPROVAL_PATTERN_SUPPORT = 2;

function isKnown(value) {
  return value !== undefined && value !== null && value !== '';
}

function resolveFromPreviousConversations(field, previousConversations) {
  const sorted = [...previousConversations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const hit = sorted.find((c) => isKnown(c.gatheredFacts && c.gatheredFacts[field]));
  if (!hit) return null;
  return {
    value: hit.gatheredFacts[field],
    rationale: `Jawaban yang sama pernah diberikan pada percakapan "${hit.id}".`,
    evidence: { conversationId: hit.id, at: hit.createdAt },
  };
}

/** Convention: a Business Rule override DEFINEs a default for exactly one
 *  field when its key is `default:<field>` — payload.action carries the
 *  literal value, payload.rationale the human's own reason. */
function resolveFromProfileOverride(domainType, field) {
  const result = listApprovedOverrides(domainType, PROFILE_OVERRIDE_TYPE.BUSINESS_RULE);
  if (!result.ok) return null;
  const hit = result.overrides.find((o) => o.key === `default:${field}`);
  if (!hit) return null;
  return {
    value: hit.payload.action,
    rationale: hit.payload.rationale || `Business Rule override "${hit.key}" disetujui untuk domain "${domainType}".`,
    evidence: { overrideId: hit.id },
  };
}

/** Narrowly scoped to the one field this mission's own example names —
 *  see the header. Never generalized beyond it. */
function resolveFromOrganizationMemory(domainType, field) {
  if (field !== 'traveler') return null;
  const result = computeOrganizationalMemory(domainType);
  if (!result.ok) return null;
  const patterns = result.data.commonApprovalPatterns || [];
  if (!patterns.length) return null;
  const top = patterns.reduce((best, p) => ((p.sampleCount || 0) > (best.sampleCount || 0) ? p : best), patterns[0]);
  if ((top.sampleCount || 0) < MIN_APPROVAL_PATTERN_SUPPORT) return null;
  return {
    value: top.value ?? top.label,
    rationale: `Pola persetujuan paling umum di Organization Memory (${top.sampleCount} kejadian tercatat).`,
    evidence: { domainType, sampleCount: top.sampleCount },
  };
}

function resolveFromKnowledge(domainType, field) {
  const result = listKnowledge({ domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  if (!result.ok) return null;
  const hit = result.data.find((item) => item.payload && isKnown(item.payload[field]));
  if (!hit) return null;
  return {
    value: hit.payload[field],
    rationale: `Approved Knowledge "${hit.id}" sudah mencatat fakta ini.`,
    evidence: { knowledgeId: hit.id },
  };
}

function resolveFromArchive(domainType, field) {
  const result = listArchive({ sourceDomainType: domainType });
  if (!result.ok) return null;
  const candidates = result.data
    .filter((r) => r.state === ARCHIVE_STATE.AVAILABLE || r.state === ARCHIVE_STATE.REFERENCED)
    .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
  const hit = candidates.find((r) => r.sourceSnapshot && isKnown(r.sourceSnapshot[field]));
  if (!hit) return null;
  return {
    value: hit.sourceSnapshot[field],
    rationale: `Dokumen arsip "${hit.documentNumber}" mencatat fakta ini.`,
    evidence: { archiveId: hit.id, documentNumber: hit.documentNumber },
  };
}

/**
 * @param {{intent: string, domainType: string|null, missingQuestions: Object[], previousConversations?: Object[]}} args
 * @returns {{resolved: Object[], stillMissing: Object[]}} ResolvedFact[] and the Question[] still genuinely unanswered
 */
export function optimizeQuestions({
  intent, domainType, missingQuestions, previousConversations = [],
}) {
  const schema = new Map(getRequiredFacts(intent).map((f) => [f.field, f]));
  const resolved = [];
  const stillMissing = [];

  for (const q of missingQuestions) {
    const fromPrev = resolveFromPreviousConversations(q.field, previousConversations);
    if (fromPrev) {
      resolved.push(makeResolvedFact({
        field: q.field, value: fromPrev.value, source: QUESTION_SOURCE.PREVIOUS_CONVERSATION,
        rationale: fromPrev.rationale, evidence: fromPrev.evidence,
      }));
      continue;
    }

    const schemaEntry = schema.get(q.field);
    if (schemaEntry && schemaEntry.optimizable && domainType) {
      const bySources = [
        [resolveFromProfileOverride(domainType, q.field), QUESTION_SOURCE.PROFILE_OVERRIDE],
        [resolveFromOrganizationMemory(domainType, q.field), QUESTION_SOURCE.ORGANIZATION_MEMORY],
        [resolveFromKnowledge(domainType, q.field), QUESTION_SOURCE.KNOWLEDGE],
        [resolveFromArchive(domainType, q.field), QUESTION_SOURCE.ARCHIVE],
      ];
      const hit = bySources.find(([r]) => r);
      if (hit) {
        const [r, source] = hit;
        resolved.push(makeResolvedFact({
          field: q.field, value: r.value, source, rationale: r.rationale, evidence: r.evidence,
        }));
        continue;
      }
    }

    stillMissing.push(q);
  }

  return { resolved, stillMissing };
}
