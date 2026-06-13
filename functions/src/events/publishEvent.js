'use strict';

/* ============================================================
   events/publishEvent.js — client → /events publisher (callable)

   The thin server boundary the client uses to emit events that have
   NO authoritative data-node trigger. In this release that is exactly
   one type: comment.added (comments are an embedded array, so a comment
   write is indistinguishable from request.updated at the data layer).

   Security:
     • Caller must be authenticated (request.auth present).
     • The actor is taken from the VERIFIED token (auth.uid / role) —
       a client cannot forge who acted.
     • Only CLIENT_PUBLISHABLE types are accepted, so clients cannot
       forge authoritative assignment.* / request.* events (those come
       only from the data-node triggers).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { buildEnvelope, validateEnvelope, writeEvent, inferEntityKind } = require('./schema');

/** Types a browser client is allowed to publish directly. */
const CLIENT_PUBLISHABLE = new Set(['comment.added']);

const publishEvent = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }

  const data = request.data || {};
  const type = String(data.type || '');
  if (!CLIENT_PUBLISHABLE.has(type)) {
    throw new HttpsError('permission-denied', `Tipe event tidak dapat dipublikasikan klien: ${type}`);
  }

  const entity = data.entity || {};
  const kind = entity.kind || inferEntityKind(type);
  if (!kind || !entity.id) {
    throw new HttpsError('invalid-argument', 'entity.kind dan entity.id diperlukan.');
  }

  // Actor is authoritative — derived from the verified token, never the client body.
  const actor = {
    uid:         auth.uid,
    role:        (auth.token && auth.token.role) || null,
    displayName: data.actorName ? String(data.actorName) : auth.uid,
  };

  const envelope = buildEnvelope({
    type,
    actor,
    entity:  { kind, id: String(entity.id) },
    payload: data.payload && typeof data.payload === 'object' ? data.payload : {},
  });

  const { valid, errors } = validateEnvelope(envelope);
  if (!valid) {
    throw new HttpsError('invalid-argument', `Envelope tidak valid: ${errors.join(', ')}`);
  }

  try {
    const stored = await writeEvent(envelope);
    logger.info('[publishEvent] event published', { type, eventId: stored.id, uid: auth.uid });
    return { id: stored.id };
  } catch (err) {
    logger.error('[publishEvent] write failed', { type, uid: auth.uid, error: err.message });
    throw new HttpsError('internal', 'Gagal menyimpan event.');
  }
});

module.exports = { publishEvent };
