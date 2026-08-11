'use strict';

/* ============================================================
   verifyPin() — custom-authentication entry (v1.11.1.2; Custom-Role-aware
   since v1.30.6 — Permission Runtime Migration, Sub-phase B; credential
   verification delegated to the Credential Service since v1.30.6.2 —
   Emergency Credential Security Patch)

   ACTIVE. Wired into the login flow (js/auth.js → callVerifyPin).

   Flow:
     1. Validate username + PIN format.
     2. Normalize the username exactly like the client (trim →
        lowercase → spaces to dashes) so uid === the /users key.
     3. Read /users/{username} via the Admin SDK.
     4. Reject unknown / inactive / archived users and a failed
        credential check with a GENERIC unauthenticated error
        (no account enumeration). Credential verification —
        hash-path, legacy-plaintext-path, and lazy migration on a
        successful legacy check — is entirely owned by
        credentialService.js; this function no longer touches
        `.pin`/`.pinHash` directly at all.
     5. Resolve the role claim (resolveRoleClaims — see below) and mint a
        custom token: createCustomToken(username, { role, ...extraClaims }).
        The role developer-claim becomes the authoritative role,
        surfaced as request.auth.token.role for RTDB rules.
     6. Return { token, profile } so the client can
        signInWithCustomToken() and hydrate its session cache.

   The submitted PIN is NEVER logged. Neither is any stored hash.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION, SERVICE_VERSION } = require('../config/constants');
const { auth, db } = require('../config/admin');
const { verifyCredential } = require('./credentialService');

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const PIN_RE = /^\d{4}$/;
// Authoritative role vocabulary minted into the token claim (request.auth.token.role).
// MUST stay in sync with js/config/role-registry.js ROLES. Engineering roles are
// first-class here so an Engineering account is NEVER downgraded to 'viewer' at
// token-mint time (which would break workspace routing, sidebar, RTDB role rules
// and every eng.* capability check for that user).
const VALID_ROLES = [
  'admin', 'bidang', 'driver', 'viewer',
  'engineering_coordinator', 'engineering_member',
];

/** Mirror of users.js#normalizeUsername — must stay in sync. */
function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Resolve a stored /users/{username}.role value into the token's `role`
 * claim plus any additional claims database.rules.json needs.
 *
 * Fast path (VALID_ROLES): byte-for-byte the pre-v1.30.6 behavior — every
 * existing account mints exactly the token it always has. No extra read.
 *
 * Fallback (Custom Role): a role value outside VALID_ROLES is looked up in
 * /customRoles/{role} (Admin SDK — bypasses rules, one extra read, only on
 * this rare path). An archived or nonexistent record downgrades to 'viewer',
 * same fail-safe as before. A found, active record mints its own id as the
 * role claim verbatim, plus `adminEquivalent: true` iff its permissions
 * include 'system.admin' — the one boolean database.rules.json's admin-tier
 * rules need (see database.rules.json; there is no finer-grained tier today
 * for any rule to consume, so no finer-grained claim is minted).
 * @param {string} storedRole
 * @returns {Promise<{role: string, extraClaims: Object}>}
 */
async function resolveRoleClaims(storedRole) {
  if (VALID_ROLES.includes(storedRole)) {
    return { role: storedRole, extraClaims: {} };
  }
  let customRole = null;
  try {
    const snap = await db.ref(`customRoles/${storedRole}`).once('value');
    customRole = snap.val();
  } catch (err) {
    logger.error('[verifyPin] custom role read failed', { storedRole, error: err.message });
    // Fail-safe: a read error must never surface as an elevated grant.
    return { role: 'viewer', extraClaims: {} };
  }
  if (!customRole || customRole.archived === true) {
    return { role: 'viewer', extraClaims: {} };
  }
  const permissions = Array.isArray(customRole.permissions) ? customRole.permissions : [];
  return {
    role: storedRole,
    extraClaims: permissions.includes('system.admin') ? { adminEquivalent: true } : {},
  };
}

const verifyPin = onCall({ region: REGION }, async (request) => {
  const data = request.data || {};
  const username = normalizeUsername(data.username);
  const pin = data.pin == null ? '' : String(data.pin).trim();

  /* ── Format validation ── */
  if (!USERNAME_RE.test(username)) {
    throw new HttpsError('invalid-argument', 'Username harus 3-30 karakter alfanumerik.');
  }
  if (!PIN_RE.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN harus 4 digit.');
  }

  /* ── Read user record (Admin SDK bypasses rules) ── */
  let user = null;
  try {
    const snap = await db.ref(`users/${username}`).once('value');
    user = snap.val();
  } catch (err) {
    logger.error('[verifyPin] user read failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal memverifikasi. Coba lagi.');
  }

  /* ── Generic rejection (no enumeration). PIN never logged. Credential
     check — hash or legacy-plaintext, with lazy migration on a
     successful legacy verify — is entirely owned by credentialService.js. ── */
  const activeAccount = user && user.active !== false && user.archived !== true;
  const { ok } = activeAccount
    ? await verifyCredential(username, user, pin)
    : { ok: false };

  if (!ok) {
    logger.warn('[verifyPin] auth failed', { username, version: SERVICE_VERSION });
    throw new HttpsError('unauthenticated', 'Username atau PIN salah.');
  }

  /* ── Mint custom token with authoritative role claim (+ Custom Role
     extras, v1.30.6) ── */
  const { role, extraClaims } = await resolveRoleClaims(user.role);
  let token;
  try {
    token = await auth.createCustomToken(username, { role, ...extraClaims });
  } catch (err) {
    logger.error('[verifyPin] token mint failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal membuat sesi. Coba lagi.');
  }

  logger.info('[verifyPin] auth ok', { username, role, extraClaims, version: SERVICE_VERSION });

  return {
    token,
    profile: {
      username,
      name: String(user.displayName || username),
      role,
      active: user.active !== false,
    },
  };
});

module.exports = { verifyPin };
