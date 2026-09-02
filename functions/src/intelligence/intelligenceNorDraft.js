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
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { DRAFT_STORE_ERRORS, draftFailure } = require('./norDraftContract');
const store = require('./norDraftStore');

const OPS = new Set(['create', 'get', 'update', 'list']);

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
    } else if (op === 'create') {
      const incoming = data.record && typeof data.record === 'object' ? data.record : null;
      if (!incoming) {
        result = draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'record diperlukan.');
      } else {
        // The owner is ALWAYS the authenticated uid — never the client's value.
        const record = {
          ...incoming,
          ownerId: uid,
          createdAt: incoming.createdAt || now,
          updatedAt: now,
          humanEdited: false,
          auditTrail: [{ type: 'AI_DRAFT_CREATED', at: now, actorId: uid, changedFields: [] }],
        };
        result = await store.createDraft(db, record);
        if (result.ok) auditEvent = 'AI_DRAFT_CREATED';
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
  logger.info('[intelligence/nor-draft]', {
    op,
    event: result.ok ? auditEvent : null,
    actor: uid,
    draftId: (result.data && result.data.draftId) || (request.data && request.data.draftId) || null,
    conversationId: (result.data && result.data.conversationId) || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    version: result.data && result.data.version,
    changedFields: result.data && Array.isArray(result.data.auditTrail) && result.data.auditTrail.length
      ? (result.data.auditTrail[result.data.auditTrail.length - 1].changedFields || []) : [],
  });

  return result;
});

module.exports = { intelligenceNorDraft };
