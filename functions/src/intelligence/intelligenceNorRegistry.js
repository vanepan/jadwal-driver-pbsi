'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceNorRegistry.js — Phase 5

   The server-side boundary for the CANONICAL NOR Registry & human
   publication (PART B–I). HTTPS callable v2, region asia-southeast1, NO
   secrets. Sibling of intelligenceNorDraft.js / intelligenceConversation.js —
   same architecture.

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token) — the SAME effective-
                        admin boundary as every other Intelligence callable
                        (Phase 3C): role === 'admin' || adminEquivalent === true.
                        NO new permission id, NO per-user grant, NO second
                        permission system.
     3. own           — the actor is request.auth.uid, ALWAYS. Cross-owner
                        get / sync / approve / publish / history → a FORBIDDEN
                        envelope (not a throw).
     4. re-read       — `register` / `sync` re-read the linked Phase 4 draft
                        from /intelligence_nor_drafts SERVER-SIDE and snapshot
                        it. The client cannot inject NOR content, an owner, a
                        version, or a number.
     5. lifecycle     — norRegistryStore.js enforces
                        in_review → approved → published (human-gated) with
                        optimistic concurrency; published is immutable.
     6. numbering      — publish reserves ONE official sequence atomically +
                        idempotently (norNumberingCounter.js). A retry never
                        mints a second number.
     7. audit          — an append-only auditHistory on the record itself
                        (AI_DRAFT_CREATED / AI_DRAFT_EDITED / AI_DRAFT_APPROVED
                        / NOR_NUMBER_RESERVED / NOR_PUBLISHED) + metadata-only
                        logger.info. NEVER a secret, token, or the body text.

   op ∈ { 'register', 'get', 'list', 'sync', 'approve', 'publish', 'history' }.
   Returns the { ok, data, error } envelope the ESM callable backend maps to
   registrySuccess/registryFailure. Auth / authorization / unknown-op failures
   are HttpsError (callable idiom); domain failures are the envelope.

   HARD SAFETY: nothing here touches V1 Petty Cash, its generateNor(), its
   numbering, or any V1 NOR data. No knowledge write. No feature-flag write.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { NOR_REGISTRY_ERRORS, registryFailure } = require('./norRegistryContract');
const registryStore = require('./norRegistryStore');
const draftStore = require('./norDraftStore');

const OPS = new Set(['register', 'get', 'list', 'sync', 'approve', 'publish', 'history']);

// NOTE: there is deliberately NO official-number input on any op. The
// official NOR number is reserved SERVER-SIDE (norNumberingCounter) and IS
// the reserved sequence — the browser can never choose, override, replace,
// or inject it. Any number-shaped field on request.data is simply ignored.

const intelligenceNorRegistry = onCall({ region: REGION }, async (request) => {
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
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan register | get | list | sync | approve | publish | history.`);
  }

  const uid = auth.uid; // the ONLY source of truth for the actor / owner
  const now = new Date().toISOString();
  const expectedVersion = typeof data.expectedVersion === 'number' ? data.expectedVersion : undefined;
  let result;
  let event = null;

  try {
    if (op === 'register') {
      const draftId = String(data.draftId || '');
      const gotDraft = await draftStore.getDraft(db, draftId);
      if (!gotDraft.ok) {
        result = registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, 'Draf NOR sumber tidak ditemukan.');
      } else if (gotDraft.data.ownerId !== uid) {
        result = registryFailure(NOR_REGISTRY_ERRORS.FORBIDDEN, 'This draft belongs to another user.');
      } else {
        result = await registryStore.registerFromDraft(db, { draft: gotDraft.data, ownerId: uid, now });
        if (result.ok) event = 'AI_DRAFT_CREATED';
      }
    } else if (op === 'get') {
      const norId = String(data.norId || '');
      const got = await registryStore.getRecord(db, norId);
      if (got.ok && got.data && got.data.ownerId !== uid) {
        result = registryFailure(NOR_REGISTRY_ERRORS.FORBIDDEN, 'This NOR record belongs to another user.');
      } else {
        result = got;
      }
    } else if (op === 'list') {
      result = await registryStore.listByOwner(db, uid);
    } else if (op === 'history') {
      const norId = String(data.norId || '');
      const head = await registryStore.getRecord(db, norId);
      if (!head.ok) {
        result = head;
      } else if (head.data.ownerId !== uid) {
        result = registryFailure(NOR_REGISTRY_ERRORS.FORBIDDEN, 'This NOR record belongs to another user.');
      } else {
        result = await registryStore.getHistory(db, norId);
      }
    } else {
      // sync | approve | publish — all need the head + an owner check first
      const norId = String(data.norId || '');
      const head = await registryStore.getRecord(db, norId);
      if (!head.ok) {
        result = head;
      } else if (head.data.ownerId !== uid) {
        result = registryFailure(NOR_REGISTRY_ERRORS.FORBIDDEN, 'This NOR record belongs to another user.');
      } else if (op === 'sync') {
        const draftId = String(head.data.metadata && head.data.metadata.draftId || '');
        const gotDraft = await draftStore.getDraft(db, draftId);
        if (!gotDraft.ok) {
          result = registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, 'Draf NOR terkait tidak ditemukan.');
        } else if (gotDraft.data.ownerId !== uid) {
          result = registryFailure(NOR_REGISTRY_ERRORS.FORBIDDEN, 'The linked draft belongs to another user.');
        } else {
          result = await registryStore.syncFromDraft(db, norId, { draft: gotDraft.data, actorId: uid, at: now, expectedVersion });
          if (result.ok) event = 'AI_DRAFT_EDITED';
        }
      } else if (op === 'approve') {
        result = await registryStore.approveRecord(db, norId, { expectedVersion, actorId: uid, at: now });
        if (result.ok) event = 'AI_DRAFT_APPROVED';
      } else { // publish
        // NO number input — the official number is the server-reserved
        // sequence (norNumberingCounter), inside publishRecord.
        result = await registryStore.publishRecord(db, norId, { expectedVersion, actorId: uid, at: now });
        if (result.ok) event = 'NOR_PUBLISHED';
      }
    }
  } catch (err) {
    logger.error('[intelligence/nor-registry] persistence error', { op, actor: uid, error: err && err.message });
    result = registryFailure('INTERNAL', 'Gagal memproses NOR Registry.');
  }

  // METADATA ONLY — never a secret, token, credential, or the body text.
  logger.info('[intelligence/nor-registry]', {
    op,
    event: result.ok ? event : null,
    actor: uid,
    norId: (result.data && result.data.norId) || (Array.isArray(result.data) ? null : null) || (request.data && request.data.norId) || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    status: result.data && !Array.isArray(result.data) ? result.data.status : null,
    version: result.data && !Array.isArray(result.data) ? result.data.currentVersion : null,
    publishedVersion: result.data && !Array.isArray(result.data) ? result.data.publishedVersion : null,
    numberSource: result.data && !Array.isArray(result.data) ? result.data.numberSource : null,
  });

  return result;
});

module.exports = { intelligenceNorRegistry };
