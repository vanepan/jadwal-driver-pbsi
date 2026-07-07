'use strict';

/* ============================================================
   verifyPin() — custom-authentication entry (v1.11.1.2)

   ACTIVE. Wired into the login flow (js/auth.js → callVerifyPin).

   Flow:
     1. Validate username + PIN format.
     2. Normalize the username exactly like the client (trim →
        lowercase → spaces to dashes) so uid === the /users key.
     3. Read /users/{username} via the Admin SDK.
     4. Reject unknown / inactive / archived users and PIN
        mismatches with a GENERIC unauthenticated error
        (no account enumeration).
     5. Mint a custom token: createCustomToken(username, { role }).
        The role developer-claim becomes the authoritative role,
        surfaced as request.auth.token.role for RTDB rules.
     6. Return { token, profile } so the client can
        signInWithCustomToken() and hydrate its session cache.

   The submitted PIN is NEVER logged.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION, SERVICE_VERSION } = require('../config/constants');
const { auth, db } = require('../config/admin');

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

  /* ── Generic rejection (no enumeration). PIN never logged. ── */
  const ok =
    user &&
    user.active !== false &&
    user.archived !== true &&
    typeof user.pin === 'string' &&
    user.pin === pin;

  if (!ok) {
    logger.warn('[verifyPin] auth failed', { username, version: SERVICE_VERSION });
    throw new HttpsError('unauthenticated', 'Username atau PIN salah.');
  }

  /* ── Mint custom token with authoritative role claim ── */
  const role = VALID_ROLES.includes(user.role) ? user.role : 'viewer';
  let token;
  try {
    token = await auth.createCustomToken(username, { role });
  } catch (err) {
    logger.error('[verifyPin] token mint failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal membuat sesi. Coba lagi.');
  }

  logger.info('[verifyPin] auth ok', { username, role, version: SERVICE_VERSION });

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
