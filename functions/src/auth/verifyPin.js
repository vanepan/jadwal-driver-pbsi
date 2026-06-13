'use strict';

/* ============================================================
   verifyPin() — DORMANT SKELETON (v1.11.1.1)

   Structure + input validation + logging ONLY.

   This function is NOT wired into the login flow. The frontend
   (js/auth.js) still verifies PINs client-side and stores a
   localStorage session exactly as before. Nothing calls this yet.

   In v1.11.1.2 this skeleton becomes the real custom-auth entry:
     1. read /users/{username} via the Admin SDK,
     2. compare the PIN server-side (and later, a hash),
     3. mint a custom token: admin.auth().createCustomToken(
          username, { role }),
     4. return it so the client can signInWithCustomToken().

   Until then it deliberately performs NO database read, NO PIN
   comparison, and mints NO token. It returns a dormant marker.
   The submitted PIN is never logged.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION, SERVICE_VERSION } = require('../config/constants');

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const PIN_RE = /^\d{4}$/;

const verifyPin = onCall({ region: REGION }, (request) => {
  const data = request.data || {};
  const username = typeof data.username === 'string' ? data.username.trim() : '';
  const pin = data.pin == null ? '' : String(data.pin).trim();

  /* ── Validation only ── */
  if (!USERNAME_RE.test(username)) {
    throw new HttpsError('invalid-argument', 'username harus 3-30 karakter alfanumerik.');
  }
  if (!PIN_RE.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN harus 4 digit.');
  }

  /* ── Logging only (never log the PIN itself) ── */
  logger.info('[verifyPin] dormant skeleton invoked', {
    username,
    version: SERVICE_VERSION,
  });

  /* ── DORMANT: not connected to login. No DB read, no token minted. ── */
  return {
    status: 'not_implemented',
    dormant: true,
    version: SERVICE_VERSION,
    message: 'verifyPin skeleton — input validated and logged only. Not active in v1.11.1.1.',
  };
});

module.exports = { verifyPin };
