'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceConversation.js — Phase 2C

   The server-side boundary for SERVER-OWNED multi-turn conversation state
   (PART C/D/F). HTTPS callable v2, region asia-southeast1, NO secrets.

   It is a thin persistence boundary — NO orchestration, NO model call, NO
   knowledge/NOR logic (that all lives in the reusable ESM
   src/intelligence/ layer). Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token) — the SAME boundary
                        as generateCompletion: Sarpras Intelligence is a
                        capability of the ADMIN role (role === 'admin' ||
                        adminEquivalent). Not bypassable by calling this
                        callable directly instead of generateCompletion.
     3. own           — the owner is request.auth.uid, ALWAYS. A
                        client-supplied record.actorId is overwritten, never
                        trusted. A get/append on another user's conversation
                        is FORBIDDEN.
     4. persist       — conversationStore.js (Admin SDK → RTDB
                        /intelligence_conversations/{convId})

    op ∈ { 'create', 'get', 'append' }. Returns the { ok, data, error }
   envelope the ESM callable backend maps to icSuccess/icFailure. Auth /
   authorization failures are HttpsError (callable idiom); domain failures
   (NOT_FOUND / FORBIDDEN-owner / VERSION_CONFLICT / INVALID_RECORD) are the
   envelope so a multi-turn client can react without a thrown exception.

   NOT wired into functions/index.js yet is FALSE for Phase 2C — it IS wired
   (see functions/index.js) but NOT deployed. Deploying it is an explicit
   later step (PART Q).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { IC_STORE_ERRORS, icFailure } = require('./conversationContract');
const store = require('./conversationStore');

const OPS = new Set(['create', 'get', 'append', 'list']);

const intelligenceConversation = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }
  // SAME authorization boundary as generateCompletion: Sarpras Intelligence
  // is a capability of the ADMIN role (role === 'admin' || adminEquivalent).
  // A caller cannot bypass it by driving conversation state directly.
  // Ownership (below) is a SEPARATE, additional check — actorId is always
  // auth.uid regardless.
  const gate = canUseIntelligence(auth.token);
  if (!gate.ok) {
    throw new HttpsError('permission-denied', gate.reason || 'Tidak berhak menggunakan Sarpras Intelligence.');
  }

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const op = String(data.op || '');
  if (!OPS.has(op)) {
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan create | get | append.`);
  }

  const uid = auth.uid;                 // the ONLY source of truth for the owner
  let result;

  try {
    if (op === 'get') {
      const convId = String(data.convId || '');
      const got = await store.getConversation(db, convId);
      if (got.ok && got.data && got.data.actorId !== uid) {
        result = icFailure(IC_STORE_ERRORS.FORBIDDEN, 'This conversation belongs to another user.');
      } else {
        result = got;
      }
    } else if (op === 'list') {
      // Always scoped to the authenticated user — a client filter is ignored.
      result = await store.listByActor(db, uid);
    } else {
      const incoming = data.record && typeof data.record === 'object' ? data.record : null;
      if (!incoming) {
        result = icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'record diperlukan.');
      } else {
        // The owner is ALWAYS the authenticated uid — never the client's value.
        const record = { ...incoming, actorId: uid };
        if (op === 'create') {
          result = await store.createConversation(db, record);
        } else {
          // append — verify the stored head is owned by this uid first
          const head = await store.getConversation(db, record.convId);
          if (!head.ok) {
            result = head;
          } else if (head.data.actorId !== uid) {
            result = icFailure(IC_STORE_ERRORS.FORBIDDEN, 'This conversation belongs to another user.');
          } else {
            result = await store.appendConversation(db, record);
          }
        }
      }
    }
  } catch (err) {
    logger.error('[intelligence/conversation] persistence error', { op, actor: uid, error: err && err.message });
    result = icFailure('INTERNAL', 'Gagal menyimpan status percakapan.');
  }

  // METADATA ONLY — never the record body beyond ids / status / version.
  logger.info('[intelligence/conversation]', {
    op,
    actor: uid,
    convId: (result.data && result.data.convId) || (request.data && request.data.convId) || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    version: result.data && result.data.version,
    status: result.data && result.data.status,
  });

  return result;
});

module.exports = { intelligenceConversation };
