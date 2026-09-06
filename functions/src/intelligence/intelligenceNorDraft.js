'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceNorDraft.js — Phase 4

   The server-side boundary for the SERVER-OWNED, human-reviewable NOR draft
   (Phase 4 — NOR DRAFT & REVIEW). HTTPS callable v2, region asia-southeast1,
   NO secrets. Sibling of intelligenceConversation.js — same architecture.

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token) — the SAME admin-role
                        boundary as generateCompletion / intelligenceConversation
                        (Phase 3C). NO per-user intelligence.use grant.
     3. own           — the owner is request.auth.uid, ALWAYS. A
                        client-supplied ownerId is overwritten, never trusted.
                        get/update on another user's draft → FORBIDDEN.
     4. persist       — norDraftStore.js (Admin SDK → RTDB
                        /intelligence_nor_drafts/{draftId})
     5. audit         — an append-only auditTrail on the record itself
                        (AI_DRAFT_CREATED / AI_DRAFT_EDITED) + metadata-only
                        logger.info. NO secret, no credential, no token.

   op ∈ { 'create', 'get', 'update', 'list' }. Returns the { ok, data, error }
   envelope the ESM callable backend maps to draftSuccess/draftFailure. Auth
   / authorization failures are HttpsError (callable idiom); domain failures
   are the envelope.

   HARD SAFETY: this callable NEVER publishes, numbers, approves, or mutates
   the NOR Registry / organizational knowledge. numbering.publishedNumber is
   forced null by norDraftStore on every write.

   Phase 6A — SERVER CROSS-CHECK: `create` no longer trusts
   `record.provenance.generationContext` merely because it parses. It is
   verified against the canonical Style Guide / Visual Template records
   (generationContextVerifier.js) — a forged or superseded authority claim
   is REJECTED (INVALID_GENERATION_CONTEXT / STALE_GENERATION_CONTEXT), never
   silently repaired. `provenance.visualBinding` is always SERVER-DERIVED
   from the verified generationContext, never taken from the client.

   Phase 6C — `op: 'preview'` — a READ + a server-authoritative freshness
   VERDICT for a client-side PDF preview of an owned draft. It performs NO
   write of any kind: it never approves, numbers, registers, publishes, or
   transitions a lifecycle. It re-runs the SAME point-lookup verification
   (generationContextVerifier.js) so the browser is never told a stored
   Visual Template is still authoritative when a curator has since
   deprecated/superseded it (§9, §32); the client applies the template's
   geometry ONLY on an `applied` verdict, and falls back to the
   deterministic layout on `fallback` / `stale` / `invalid`.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { DRAFT_STORE_ERRORS, draftFailure } = require('./norDraftContract');
const store = require('./norDraftStore');
const { verifyGenerationContext } = require('./generationContextVerifier');

/** V2 intake is NOR-only (mirrors src/intelligence/service/intelligence-service.js
 *  #retrievalDocumentTypeFor) — the server-fixed document type every
 *  generation context submitted with a NEW draft is verified against (§8). */
const DRAFT_DOCUMENT_TYPE = 'NOR';

const OPS = new Set(['create', 'get', 'update', 'list', 'preview']);

/** Phase 6C — map the Phase 6A verifier's verdict on a draft's STORED
 *  generation context to the compact freshness signal the preview needs.
 *  `null` binding, or one that never claimed an approved template, is a
 *  plain deterministic fallback — nothing to verify. */
async function assessPreviewVisual(db, provenance) {
  const prov = provenance && typeof provenance === 'object' ? provenance : {};
  const binding = prov.visualBinding && typeof prov.visualBinding === 'object' ? prov.visualBinding : null;
  const templateId = binding && typeof binding.templateId === 'string' ? binding.templateId : null;
  const templateVersion = binding && Number.isInteger(binding.templateVersion) ? binding.templateVersion : null;
  if (!binding || binding.source !== 'approved_template') {
    return { status: 'fallback', templateId: null, templateVersion: null, reason: 'No approved Visual Template was bound when this draft was generated.' };
  }
  // Phase 6A stores visualBinding and generationContext together — an
  // `approved_template` binding with no context to verify it against is an
  // inconsistent record; fail closed rather than apply unverified authority.
  if (!prov.generationContext || typeof prov.generationContext !== 'object') {
    return { status: 'invalid', templateId: null, templateVersion: null, reason: 'The visual binding claims an approved template but carries no generation context to verify it.' };
  }
  const verify = await verifyGenerationContext(db, prov.generationContext, { documentType: DRAFT_DOCUMENT_TYPE });
  if (verify.ok) {
    return { status: 'applied', templateId, templateVersion, reason: null };
  }
  if (verify.code === DRAFT_STORE_ERRORS.STALE_GENERATION_CONTEXT) {
    return { status: 'stale', templateId, templateVersion, reason: verify.message };
  }
  return { status: 'invalid', templateId: null, templateVersion: null, reason: verify.message };
}

const intelligenceNorDraft = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }
  const gate = canUseIntelligence(auth.token);
  if (!gate.ok) {
    throw new HttpsError('permission-denied', gate.reason || 'Tidak berhak menggunakan Sarpras Intelligence.');
  }

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const op = String(data.op || '');
  if (!OPS.has(op)) {
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan create | get | update | list.`);
  }

  const uid = auth.uid; // the ONLY source of truth for the owner
  const now = new Date().toISOString();
  let result;
  let auditEvent = null;

  try {
    if (op === 'get') {
      const draftId = String(data.draftId || '');
      const got = await store.getDraft(db, draftId);
      if (got.ok && got.data && got.data.ownerId !== uid) {
        result = draftFailure(DRAFT_STORE_ERRORS.FORBIDDEN, 'This draft belongs to another user.');
      } else {
        result = got;
      }
    } else if (op === 'list') {
      result = await store.listByOwner(db, uid);
    } else if (op === 'preview') {
      // Phase 6C — READ + freshness verdict only. NO write, NO number, NO
      // Registry, NO publication, NO lifecycle transition (§13, §14, §29).
      const draftId = String(data.draftId || '');
      const got = await store.getDraft(db, draftId);
      if (!got.ok) {
        result = got;
      } else if (got.data.ownerId !== uid) {
        result = draftFailure(DRAFT_STORE_ERRORS.FORBIDDEN, 'This draft belongs to another user.');
      } else {
        const previewVisual = await assessPreviewVisual(db, got.data.provenance);
        result = { ok: true, data: { draft: got.data, previewVisual }, error: null };
      }
    } else if (op === 'create') {
      const incoming = data.record && typeof data.record === 'object' ? data.record : null;
      if (!incoming) {
        result = draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'record diperlukan.');
      } else {
        // Phase 6A §2, §15 — SERVER-AUTHORITATIVE CROSS-CHECK. The client's
        // provenance.generationContext is NEVER trusted merely because it is
        // present and well-formed JSON: every certified_style_rule / approved
        // Visual Template it claims is verified, by id, against the LIVE
        // canonical stores (status still 'approved', version unchanged,
        // content byte-identical). A forged or superseded claim REJECTS the
        // whole create — nothing is silently repaired, nothing is partially
        // persisted (fail closed). `null` (legacy mode) always passes.
        const incomingProvenance = incoming.provenance && typeof incoming.provenance === 'object' ? incoming.provenance : {};
        const claimedContext = incomingProvenance.generationContext || null;
        const verify = await verifyGenerationContext(db, claimedContext, { documentType: DRAFT_DOCUMENT_TYPE });
        if (!verify.ok) {
          result = draftFailure(verify.code, verify.message);
        } else {
          // The owner is ALWAYS the authenticated uid — never the client's value.
          const record = {
            ...incoming,
            ownerId: uid,
            createdAt: incoming.createdAt || now,
            updatedAt: now,
            humanEdited: false,
            auditTrail: [{ type: 'AI_DRAFT_CREATED', at: now, actorId: uid, changedFields: [] }],
            provenance: {
              ...incomingProvenance,
              generationContext: claimedContext, // verified above — the frozen generation-time snapshot (§16)
              // Derived from the JUST-VERIFIED generationContext, never trusted
              // from the client directly — visualBinding is a redundant mirror
              // of generationContext.visual and would otherwise be a second,
              // unverified place to smuggle a forged directive.
              visualBinding: claimedContext ? claimedContext.visual : null,
            },
          };
          result = await store.createDraft(db, record);
          if (result.ok) auditEvent = 'AI_DRAFT_CREATED';
        }
      }
    } else { // update
      const draftId = String(data.draftId || '');
      const head = await store.getDraft(db, draftId);
      if (!head.ok) {
        result = head;
      } else if (head.data.ownerId !== uid) {
        result = draftFailure(DRAFT_STORE_ERRORS.FORBIDDEN, 'This draft belongs to another user.');
      } else {
        result = await store.updateDraft(db, draftId, data.edits || {}, {
          actorId: uid, at: now,
          expectedVersion: typeof data.expectedVersion === 'number' ? data.expectedVersion : undefined,
        });
        if (result.ok) auditEvent = 'AI_DRAFT_EDITED';
      }
    }
  } catch (err) {
    logger.error('[intelligence/nor-draft] persistence error', { op, actor: uid, error: err && err.message });
    result = draftFailure('INTERNAL', 'Gagal menyimpan draf NOR.');
  }

  // METADATA ONLY — never a secret, token, credential, or the body text.
  // Phase 6C §30 — a `preview` is a READ; the existing metadata-only line IS
  // the preview audit (op + actor + draftId + ok + the visual freshness
  // verdict). No `auditTrail` entry is written (preview writes nothing) and
  // no new audit event type / system is introduced.
  const previewData = op === 'preview' && result.ok && result.data && result.data.draft ? result.data : null;
  logger.info('[intelligence/nor-draft]', {
    op,
    event: result.ok ? auditEvent : null,
    actor: uid,
    draftId: (result.data && result.data.draftId)
      || (previewData && previewData.draft.draftId)
      || (request.data && request.data.draftId) || null,
    conversationId: (result.data && result.data.conversationId)
      || (previewData && previewData.draft.conversationId) || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    version: (result.data && result.data.version) || (previewData && previewData.draft.version) || undefined,
    previewVisual: previewData ? previewData.previewVisual.status : undefined,
    changedFields: result.data && Array.isArray(result.data.auditTrail) && result.data.auditTrail.length
      ? (result.data.auditTrail[result.data.auditTrail.length - 1].changedFields || []) : [],
  });

  return result;
});

module.exports = { intelligenceNorDraft };
