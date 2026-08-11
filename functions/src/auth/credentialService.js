'use strict';

/* ============================================================
   credentialService.js — the Credential Service (v1.30.6.2)

   Emergency Credential Security Patch. THE single owner of every
   credential operation in this codebase: hashing, creation, reset,
   change, migration, and persistence. No other file ever reads or
   writes /users/{username}.pin or .pinHash directly — not verifyPin.js,
   not any callable wrapper, not the client. This is the boundary a
   future authentication evolution (longer PINs, passwords, MFA,
   passkeys) stays inside, without rippling into every caller.

   STANDING INVARIANT: a /users/{username} record must never
   simultaneously hold both `pin` and `pinHash`. Enforced structurally,
   not by convention — persistCredential() below is the ONLY place a
   credential is ever written, always as one paired update:
   { pinHash: <hash>, pin: null }. There is no second write path.

   PURE logic lives in pinHash.js (hash/verify/legacy-check — no
   Firebase). This file adds persistence (Admin SDK) on top.
   ============================================================ */

const { db } = require('../config/admin');
const { hashPin, verifyHash, verifyLegacyPlaintext } = require('./pinHash');

/**
 * The ONLY place /users/{username}.pin / .pinHash are ever written.
 * Always a paired update — this is what makes "never both fields" a
 * structural guarantee rather than something every caller must remember.
 * @param {string} username
 * @param {string} hash
 */
async function persistCredential(username, hash) {
  await db.ref(`users/${username}`).update({ pinHash: hash, pin: null });
}

/**
 * Verify `submittedPin` against `userRecord`'s stored credential —
 * hash-path if `pinHash` is present, legacy plaintext-path if only `pin`
 * is present. On a successful LEGACY verification, immediately migrates
 * the record (hashes the just-proven PIN and overwrites the plaintext)
 * before returning — the brief's "legacy plaintext → successful login →
 * hash → overwrite plaintext" flow, triggered by ANY caller that proves
 * knowledge of a legacy PIN, not just login.
 *
 * Takes an already-fetched record rather than reading one itself: the
 * login hot path (verifyPin.js) already has it from its own read, so
 * this avoids a redundant Admin SDK round trip there. Persistence
 * ownership still stays inside this service — only the initial read is
 * the caller's job.
 * @param {string} username
 * @param {Object} userRecord
 * @param {string} submittedPin
 * @returns {Promise<{ok: boolean, needsMigration: boolean}>}
 */
async function verifyCredential(username, userRecord, submittedPin) {
  if (!userRecord) return { ok: false, needsMigration: false };

  if (typeof userRecord.pinHash === 'string' && userRecord.pinHash) {
    return { ok: verifyHash(submittedPin, userRecord.pinHash), needsMigration: false };
  }

  if (typeof userRecord.pin === 'string' && userRecord.pin) {
    const ok = verifyLegacyPlaintext(submittedPin, userRecord.pin);
    if (ok) {
      const { hash } = hashPin(submittedPin);
      await persistCredential(username, hash);
    }
    return { ok, needsMigration: ok };
  }

  return { ok: false, needsMigration: false };
}

/**
 * Create the credential for a brand-new user — no prior `pin`/`pinHash`
 * exists yet. Hash-only from the very first write; a new account never
 * has a plaintext `pin` field at all.
 * @param {string} username
 * @param {string} pin
 */
async function createCredential(username, pin) {
  const { hash } = hashPin(pin);
  await persistCredential(username, hash);
}

/**
 * Admin-authority credential reset — no proof of the prior credential
 * required (this is the point of an admin reset). If `pin` is omitted, a
 * new one is generated server-side and returned ONCE so the caller can
 * communicate it — the one legitimate plaintext-in-response case in this
 * whole service, matching the existing "Reset PIN" UX (not a hash leak).
 * @param {string} username
 * @param {string|null} pin
 * @returns {Promise<{pin: string}>}
 */
async function resetCredential(username, pin = null) {
  const nextPin = pin || String(require('crypto').randomInt(1000, 10000));
  const { hash } = hashPin(nextPin);
  await persistCredential(username, hash);
  return { pin: nextPin };
}

/**
 * Self-service credential change — requires proof of `currentPin` first.
 * Reads the record itself (unlike verifyCredential, which takes one from
 * a caller that already has it) since callers of this operation start
 * with only a username.
 * @param {string} username
 * @param {string} currentPin
 * @param {string} newPin
 * @returns {Promise<{ok: boolean}>}
 */
async function changeCredential(username, currentPin, newPin) {
  const snap = await db.ref(`users/${username}`).once('value');
  const userRecord = snap.val();
  const { ok } = await verifyCredential(username, userRecord, currentPin);
  if (!ok) return { ok: false };
  const { hash } = hashPin(newPin);
  await persistCredential(username, hash);
  return { ok: true };
}

module.exports = { verifyCredential, createCredential, resetCredential, changeCredential };
