'use strict';

/* ============================================================
   pinHash.js — Credential hashing primitives (v1.30.6.2)

   Emergency Credential Security Patch. PURE Node — no firebase-admin
   import, no RTDB access, nothing async — so this file is directly
   unit-testable outside the Functions runtime (see
   scripts/pin-hash-check.mjs), unlike verifyPin.js which cannot be
   required outside it (admin.initializeApp() at module load).

   Algorithm: crypto.scrypt, Node's built-in memory-hard KDF. Chosen over
   bcrypt/argon2 specifically for zero new dependencies and zero native-
   binding build risk — both npm packages require node-gyp compilation,
   a real deployment-risk variable for an emergency patch that needs to
   build and deploy reliably on the first try. scrypt is part of Node
   core, guaranteed to work anywhere this Cloud Functions runtime does.
   Cost parameters are Node's own documented defaults for password
   hashing (N=16384, r=8, p=1) — not hand-tuned, not chosen for novelty.

   Stored format is self-describing: "scrypt:N:r:p:saltHex:hashHex" — so
   cost parameters can be tuned later without invalidating existing
   hashes (a future migration would just recognize the old parameters at
   verify time, same as the legacy-plaintext path this patch introduces).

   This file owns exactly two concerns: turning a PIN into a hash, and
   checking a PIN against a stored hash OR the legacy plaintext shape.
   It does NOT decide what gets persisted where — that is
   credentialService.js's job (the Credential Service), which is the
   ONLY thing that imports this file.
   ============================================================ */

const crypto = require('crypto');

const ALGO_TAG = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Hash a plaintext PIN into the self-describing stored format.
 * @param {string} pin
 * @returns {{ hash: string }}
 */
function hashPin(pin) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(String(pin), salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  const hash = [ALGO_TAG, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), derived.toString('hex')].join(':');
  return { hash };
}

/**
 * Parse a stored hash string back into its own parameters. Returns null
 * for anything that doesn't match the expected shape (fails closed —
 * callers must never treat a malformed stored value as verifiable).
 * @param {string} storedHash
 */
function parseStoredHash(storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 6 || parts[0] !== ALGO_TAG) return null;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return null;
  return { N, r, p, salt: Buffer.from(saltHex, 'hex'), hash: Buffer.from(hashHex, 'hex') };
}

/**
 * Verify a plaintext PIN against a stored hash — recomputes scrypt with
 * the hash's OWN stored parameters (not today's constants, so a future
 * cost-parameter tuning never invalidates existing hashes) and compares
 * with a timing-safe equality check.
 * @param {string} pin
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyHash(pin, storedHash) {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  const candidate = crypto.scryptSync(String(pin), parsed.salt, parsed.hash.length, {
    N: parsed.N, r: parsed.r, p: parsed.p,
  });
  if (candidate.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(candidate, parsed.hash);
}

/**
 * The legacy plain-equality check this patch is replacing, isolated in
 * its own named function on purpose: once no /users record has a `pin`
 * field left, deleting this function (and its one call site in
 * credentialService.js) is the entire future plaintext-removal task —
 * no redesign needed.
 * @param {string} pin
 * @param {string} storedPlaintext
 * @returns {boolean}
 */
function verifyLegacyPlaintext(pin, storedPlaintext) {
  return typeof storedPlaintext === 'string' && storedPlaintext === String(pin);
}

module.exports = { hashPin, verifyHash, verifyLegacyPlaintext, parseStoredHash };
