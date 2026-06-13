'use strict';

/* ============================================================
   health() — deployment pipeline smoke test.

   Public, unauthenticated HTTPS endpoint. Returns a small JSON
   status payload. Its only job is to prove that the Functions
   build → deploy → invoke pipeline works end to end. It reads no
   data and has no side effects.
   ============================================================ */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { SERVICE_NAME, SERVICE_VERSION, REGION } = require('./config/constants');

const health = onRequest({ region: REGION, cors: true }, (req, res) => {
  logger.info('[health] ping', { method: req.method });
  res.status(200).json({
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  });
});

module.exports = { health };
