/* ============================================================
   NOR-DRAFT-RECORD-CONTRACT.JS — Sarpras Intelligence (V2, Phase 4)

   The ONE shape of a persistent, human-reviewable NOR draft — the durable
   object produced when an Intelligence conversation reaches
   `requires_review`. It is NOT a published NOR:
     • numbering.publishedNumber is ALWAYS null (structural invariant)
     • there is no publish / approve / number field or transition here
     • a human review is mandatory before any downstream use

   Structured intake `facts` (item/quantity/unit/purpose/budget) are kept
   SEPARATE from the generated `body`. `recipient` is its own field, never
   folded into `purpose`.

   RESPONSIBILITY: NOR_DRAFT_SCHEMA, NOR_DRAFT_STATUS, the field lists,
   makeNorDraftRecord(), applyDraftEdits(), isNorDraftRecord(),
   sanitizeDraftEdits(). PURE — no DOM, no Firebase, no I/O.

   CJS mirror: functions/src/intelligence/norDraftContract.js — drift-guarded
   by scripts/intelligence-nor-draft-check.cjs.
   ============================================================ */

'use strict';

export const NOR_DRAFT_SCHEMA = 'intelligence-nor-draft@1';

/** The one status this phase produces — the durable equivalent of the
 *  `requires_review` response status. */
export const NOR_DRAFT_STATUS = Object.freeze({
  REQUIRES_REVIEW: 'requires_review',
});
export const NOR_DRAFT_STATUS_LIST = Object.freeze(Object.values(NOR_DRAFT_STATUS));

/** Structured intake facts kept SEPARATE from the generated body. */
export const DRAFT_FACT_FIELDS = Object.freeze(['item', 'quantity', 'unit', 'purpose', 'budget']);

/** What a human reviewer may edit. */
export const DRAFT_EDITABLE_FIELDS = Object.freeze([...DRAFT_FACT_FIELDS, 'recipient', 'subject', 'date', 'body']);

export const NOR_DRAFT_FIELDS = Object.freeze([
  'schema', 'draftId', 'conversationId', 'version', 'ownerId', 'status',
  'jenis', 'subject', 'recipient', 'recipientStatus', 'date',
  'facts', 'body', 'numbering', 'provenance', 'humanEdited', 'auditTrail',
  'createdAt', 'updatedAt',
]);

export const DRAFT_AUDIT_EVENTS = Object.freeze(['AI_DRAFT_CREATED', 'AI_DRAFT_EDITED']);

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Build a valid version-1 NOR draft from a `requires_review` draft payload
 * + the conversation's accumulated facts. `ownerId` is a placeholder here —
 * the server callable overwrites it with the verified auth.uid.
 */
export function makeNorDraftRecord({
  draftId, conversationId, ownerId = null,
  jenis = null, subject = '', recipient = null, recipientStatus = null, date = null,
  facts = {}, body = '',
  numbering = {}, provenance = {}, now = null,
} = {}) {
  const at = now || new Date().toISOString();
  const f = isPlainObject(facts) ? facts : {};
  const draftFacts = {};
  for (const k of DRAFT_FACT_FIELDS) if (f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== '') draftFacts[k] = f[k];
  return Object.freeze({
    schema: NOR_DRAFT_SCHEMA,
    draftId: draftId || null,
    conversationId: conversationId || null,
    version: 1,
    ownerId: ownerId || null,
    status: NOR_DRAFT_STATUS.REQUIRES_REVIEW,
    jenis: jenis || null,
    subject: typeof subject === 'string' ? subject : '',
    recipient: recipient || null,
    recipientStatus: recipientStatus || null,
    date: date || at.slice(0, 10),
    facts: Object.freeze({ ...draftFacts }),
    body: typeof body === 'string' ? body : '',
    numbering: Object.freeze({
      suggestedNumber: typeof numbering.suggestedNumber === 'string' ? numbering.suggestedNumber : '',
      publishedNumber: null, // NEVER anything else
      source: numbering.source || 'system_suggested',
      basis: numbering.basis == null ? null : numbering.basis,
      confidence: typeof numbering.confidence === 'number' ? numbering.confidence : 0,
    }),
    provenance: Object.freeze({ ...(isPlainObject(provenance) ? provenance : {}) }),
    humanEdited: false,
    auditTrail: Object.freeze([Object.freeze({ type: 'AI_DRAFT_CREATED', at, actorId: ownerId || null, changedFields: Object.freeze([]) })]),
    createdAt: at,
    updatedAt: at,
  });
}

/** Structural check — the ESM twin of the CJS isNorDraftRecord(). */
export function isNorDraftRecord(d) {
  if (!isPlainObject(d)) return false;
  if (d.schema !== NOR_DRAFT_SCHEMA) return false;
  if (typeof d.draftId !== 'string' || !d.draftId) return false;
  if (typeof d.conversationId !== 'string' || !d.conversationId) return false;
  if (typeof d.ownerId !== 'string' || !d.ownerId) return false;
  if (typeof d.version !== 'number' || d.version < 1) return false;
  if (!NOR_DRAFT_STATUS_LIST.includes(d.status)) return false;
  if (!isPlainObject(d.facts)) return false;
  if (typeof d.body !== 'string') return false;
  if (!isPlainObject(d.numbering)) return false;
  if (d.numbering.publishedNumber !== null && d.numbering.publishedNumber !== undefined) return false;
  if (!Array.isArray(d.auditTrail) || d.auditTrail.length < 1) return false;
  return NOR_DRAFT_FIELDS.every((f) => f in d);
}

/** Keep only DRAFT_EDITABLE_FIELDS, each a non-empty string or finite
 *  number (an explicit '' / null clears an optional text field). */
export function sanitizeDraftEdits(edits) {
  const out = {};
  if (!isPlainObject(edits)) return out;
  for (const k of DRAFT_EDITABLE_FIELDS) {
    if (!(k in edits)) continue;
    const v = edits[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.trim() !== '') out[k] = v.trim();
    else if (v === '' || v === null) out[k] = '';
  }
  return out;
}

/** Apply sanitized edits onto a record, returning { next, changedFields }.
 *  Fact fields go into `facts`; the rest are top-level. NEVER touches the
 *  source conversation. */
export function applyDraftEdits(record, edits, { actorId = null, at = null } = {}) {
  const when = at || new Date().toISOString();
  const applied = sanitizeDraftEdits(edits);
  const next = { ...record, facts: { ...(record.facts || {}) } };
  const changedFields = [];
  for (const [k, v] of Object.entries(applied)) {
    if (DRAFT_FACT_FIELDS.includes(k)) {
      if (String(next.facts[k] == null ? '' : next.facts[k]) !== String(v)) changedFields.push(k);
      next.facts[k] = v;
    } else {
      if (String(next[k] == null ? '' : next[k]) !== String(v)) changedFields.push(k);
      next[k] = v;
    }
  }
  if (changedFields.length === 0) return { next: record, changedFields: [] };
  next.version = (record.version || 1) + 1;
  next.updatedAt = when;
  next.humanEdited = true;
  next.numbering = { ...(next.numbering || {}), publishedNumber: null };
  next.auditTrail = [...(record.auditTrail || []), { type: 'AI_DRAFT_EDITED', at: when, actorId, changedFields }];
  return { next, changedFields };
}
