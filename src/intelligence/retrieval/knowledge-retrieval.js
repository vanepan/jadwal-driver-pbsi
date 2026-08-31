/* ============================================================
   KNOWLEDGE-RETRIEVAL.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the read-only bridge from the Intelligence layer to Approved
   organizational Knowledge (PART 7). Conservative first-cut relevance:
   every APPROVED KnowledgeItem for the requested domainType, plus (when a
   NOR Type is known) those whose payload.norType matches or is generic.

   Approved Knowledge is authoritative and reusable. It is retrieved here
   ONLY as grounding context for a draft and for explainability refs — it
   is never written, never promoted, and an AI's later output never
   re-enters as Knowledge without the existing human review gate
   (src/knowledge/services/review-service.js). PART 7's "Generated Output
   TIDAK otomatis menjadi Approved Knowledge" is a property of NOT calling
   any promote/ingest path from here — this module imports only the reader.

   RESPONSIBILITY: retrieveApprovedKnowledge({ domainType, norType,
   knowledgeReader, authz, actor, limit }).

   DEPENDENCIES: none hard — `knowledgeReader` is injected. The default
   reader (default-ports.js) wires src/knowledge/services/knowledge-service.js
   #listKnowledge (read-only).

   NON-GOALS: no ranking model, no embeddings, no write. An empty result is
   returned as an empty list with a reason, never a fabricated item.
   ============================================================ */

'use strict';

const APPROVED = 'approved';

/**
 * @param {Object} args
 * @param {string} args.domainType
 * @param {string|null} [args.norType]
 * @param {{ listKnowledge: (filter?: object) => {ok:boolean,data:*,error:*} }} args.knowledgeReader
 * @param {{ canAccessKnowledge?: (actor: object, domainType: string) => boolean }} [args.authz]
 * @param {Object} [args.actor]
 * @param {number} [args.limit]
 * @returns {{ ok: boolean, items: object[], refs: string[], reason: string|null, error: {code:string,message:string}|null }}
 */
export function retrieveApprovedKnowledge({
  domainType, norType = null, knowledgeReader, authz = {}, actor = null, limit = 40,
}) {
  if (!knowledgeReader || typeof knowledgeReader.listKnowledge !== 'function') {
    return { ok: false, items: [], refs: [], reason: null, error: { code: 'NO_READER', message: 'knowledgeReader.listKnowledge is required.' } };
  }
  if (typeof authz.canAccessKnowledge === 'function' && !authz.canAccessKnowledge(actor, domainType)) {
    return { ok: false, items: [], refs: [], reason: null, error: { code: 'FORBIDDEN', message: `Not authorized to read "${domainType}" knowledge.` } };
  }

  const res = knowledgeReader.listKnowledge({ domainType, lifecycleState: APPROVED });
  if (!res || !res.ok) {
    return { ok: false, items: [], refs: [], reason: null, error: (res && res.error) || { code: 'READ_FAILED', message: 'listKnowledge failed.' } };
  }

  let items = Array.isArray(res.data) ? res.data.filter((k) => k && k.lifecycleState === APPROVED && k.domainType === domainType) : [];
  if (norType) {
    items = items.filter((k) => {
      const payloadType = k && k.payload && typeof k.payload === 'object' ? k.payload.norType : undefined;
      return payloadType == null || payloadType === norType;
    });
  }
  items = items.slice(0, Math.max(0, limit));
  const refs = items.map((k) => k.id).filter(Boolean);
  return {
    ok: true,
    items,
    refs,
    reason: items.length === 0 ? `No Approved "${domainType}" knowledge is available yet.` : null,
    error: null,
  };
}
