'use strict';

/* ============================================================
   credentialCallables.js — client-facing entry points into the
   Credential Service (v1.30.6.2, Emergency Credential Security Patch)

   Mirrors the verifyPin / push-callables pattern already established in
   this codebase: request.auth is required; identity for the self-service
   operation is taken from request.auth.uid, NEVER from the payload, so a
   caller cannot act on another account by construction. The two
   admin-authority operations additionally check request.auth.token.role
   directly — the same claim-inspection style verifyPin.js already uses,
   not a new authorization system.

   None of these three functions ever compute or return a hash. The
   client submits plaintext once, to exactly the operation it needs;
   hashing, persistence, and the never-both-pin-fields invariant are
   entirely credentialService.js's job.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { createCredential, resetCredential, changeCredential } = require('./credentialService');

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const PIN_RE = /^\d{4}$/;

/** Mirror of users.js#normalizeUsername — must stay in sync. */
function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function assertAdmin(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sesi tidak valid.');
  }
  if (request.auth.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang dapat melakukan aksi ini.');
  }
}

function assertAuthed(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sesi tidak valid.');
  }
  return request.auth.uid;
}

/**
 * createUserCredential({ username, pin }) — admin-only. Sets the initial
 * credential for a brand-new user record (js/users.js#createUser() calls
 * this right after writing the non-credential fields).
 */
const createUserCredential = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);
  const data = request.data || {};
  const username = normalizeUsername(data.username);
  const pin = data.pin == null ? '' : String(data.pin).trim();

  if (!USERNAME_RE.test(username)) {
    throw new HttpsError('invalid-argument', 'Username tidak valid.');
  }
  if (!PIN_RE.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN harus 4 digit.');
  }

  try {
    await createCredential(username, pin);
  } catch (err) {
    logger.error('[credential/create] failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal membuat kredensial.');
  }

  logger.info('[credential/create] credential created', { username, actor: request.auth.uid });
  return { ok: true };
});

/**
 * resetUserCredential({ username, pin? }) — admin-only. Admin authority:
 * no proof of the prior credential is required. If `pin` is omitted, one
 * is generated server-side and returned ONCE (the "Reset PIN" UX) — the
 * only legitimate plaintext-in-response case anywhere in this service.
 */
const resetUserCredential = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);
  const data = request.data || {};
  const username = normalizeUsername(data.username);
  const explicitPin = data.pin == null || data.pin === '' ? null : String(data.pin).trim();

  if (!USERNAME_RE.test(username)) {
    throw new HttpsError('invalid-argument', 'Username tidak valid.');
  }
  if (explicitPin !== null && !PIN_RE.test(explicitPin)) {
    throw new HttpsError('invalid-argument', 'PIN harus 4 digit.');
  }

  let result;
  try {
    result = await resetCredential(username, explicitPin);
  } catch (err) {
    logger.error('[credential/reset] failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal mereset kredensial.');
  }

  logger.info('[credential/reset] credential reset', { username, actor: request.auth.uid, generated: explicitPin === null });
  return { pin: result.pin };
});

/**
 * changeMyCredential({ currentPin, newPin }) — self-service. No username
 * parameter at all; the target is always request.auth.uid, so this can
 * never act on another account, by construction rather than a permission
 * check (keeps this patch out of Runtime Authorization entirely).
 */
const changeMyCredential = onCall({ region: REGION }, async (request) => {
  const uid = assertAuthed(request);
  const data = request.data || {};
  const currentPin = data.currentPin == null ? '' : String(data.currentPin).trim();
  const newPin = data.newPin == null ? '' : String(data.newPin).trim();

  if (!PIN_RE.test(currentPin) || !PIN_RE.test(newPin)) {
    throw new HttpsError('invalid-argument', 'PIN harus 4 digit.');
  }

  let result;
  try {
    result = await changeCredential(uid, currentPin, newPin);
  } catch (err) {
    logger.error('[credential/change] failed', { uid, error: err.message });
    throw new HttpsError('internal', 'Gagal mengubah PIN.');
  }

  if (!result.ok) {
    throw new HttpsError('invalid-argument', 'PIN saat ini tidak cocok.');
  }

  logger.info('[credential/change] credential changed', { uid });
  return { ok: true };
});

module.exports = { createUserCredential, resetUserCredential, changeMyCredential };
