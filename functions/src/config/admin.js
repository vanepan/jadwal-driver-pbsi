'use strict';

/* ============================================================
   Firebase Admin SDK — shared singleton.

   Initializes the Admin app exactly once (idempotent) and exposes
   the Auth + Realtime Database handles used by callable functions.
   The Functions runtime injects service-account credentials, so no
   key material is committed or referenced here.
   ============================================================ */

const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

module.exports = {
  admin,
  auth: admin.auth(),
  db: admin.database(),
};
