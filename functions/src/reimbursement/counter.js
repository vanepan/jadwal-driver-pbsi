'use strict';

/* ============================================================
   reimbursement/counter.js — atomic reimbursement doc-number issuance
   (RTDB Security Hardening Program, Phase 3 — v1.30.6.6)

   Moves /reimbursement_counters off client RTDB access. Previously:
   js/firebase.js#acquireReimbursementDocNumber() ran a client-side
   runTransaction() directly against the counter node. Same "Client ->
   Cloud Function -> Admin SDK -> RTDB" pattern as backupTick.js and the
   Credential Service — the client now submits only the date, the server
   owns the atomic increment and the formatted document number.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');

const DATE_PREFIX_RE = /^(\d{4})-(\d{2})/;

const acquireReimbursementNumber = onCall({ region: REGION }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sesi tidak valid.');
  }
  const data = request.data || {};
  const dateStr = String(data.dateStr || new Date().toISOString());
  const match = DATE_PREFIX_RE.exec(dateStr);
  if (!match) {
    throw new HttpsError('invalid-argument', 'Format tanggal tidak valid.');
  }
  const [, year, month] = match;
  const key = `${year}_${month}`;

  let n;
  try {
    const result = await db.ref(`reimbursement_counters/${key}`).transaction((current) => (current || 0) + 1);
    n = result.snapshot.val() ?? 1;
  } catch (err) {
    logger.error('[reimbursement/counter] transaction failed', { key, error: err.message });
    throw new HttpsError('internal', 'Gagal memperoleh nomor dokumen.');
  }

  const docNumber = `PBSI/RMB/${year}/${month}/${String(n).padStart(4, '0')}`;
  logger.info('[reimbursement/counter] acquired', { key, n, actor: request.auth.uid });
  return { docNumber };
});

module.exports = { acquireReimbursementNumber };
