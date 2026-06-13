'use strict';

/* ============================================================
   push/send.js — Web Push send wrapper with retry (v1.11.3)

   Wraps the `web-push` library (VAPID signing + aes128gcm payload
   encryption) with the same resilience shape as telegram/retry.js:

     • transient (5xx, 429, network) → retry with exponential backoff,
       honoring a Retry-After header when present.
     • terminal (404 / 410 Gone)     → the subscription is dead; do NOT
       retry. Caller prunes it (architecture §6.2).
     • terminal (400 / 413 / 403)    → malformed / too-large / forbidden;
       no retry (a key or payload bug, not a transient condition).

   Returns a structured outcome mirroring sendWithRetry:
     { ok, statusCode, attempts, terminal, expired, error }
   ============================================================ */

const logger = require('firebase-functions/logger');
const webpush = require('web-push');

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** A dead subscription — remove it. */
function isExpired(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

/** Permanent (non-retryable) failure? */
function isTerminal(statusCode) {
  if (isExpired(statusCode)) return true;
  return statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 413;
}

/**
 * Send one encrypted Web Push message with retry.
 *
 * @param {Object} subscription  { endpoint, keys:{p256dh,auth} }
 * @param {string} payload       JSON string ({ title, body, data })
 * @param {Object} vapid         { subject, publicKey, privateKey }
 * @param {{maxAttempts?:number, ttl?:number}} [opts]
 * @returns {Promise<{ok:boolean,statusCode:number,attempts:number,terminal:boolean,expired:boolean,error:string|null}>}
 */
async function sendPushWithRetry(subscription, payload, vapid, opts = {}) {
  const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const options = {
    vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    TTL: opts.ttl != null ? opts.ttl : 3600,
  };

  let attempt = 0;
  let last = { ok: false, statusCode: 0, terminal: false, expired: false, error: 'not attempted' };

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await webpush.sendNotification(subscription, payload, options);
      return { ok: true, statusCode: res.statusCode || 201, attempts: attempt, terminal: false, expired: false, error: null };
    } catch (err) {
      const statusCode = err && err.statusCode ? err.statusCode : 0;
      const terminal = statusCode ? isTerminal(statusCode) : false; // statusCode 0 = network → retry
      const expired = isExpired(statusCode);
      last = { ok: false, statusCode, terminal, expired, error: String((err && err.body) || (err && err.message) || err) };

      if (terminal) {
        if (expired) {
          logger.info('[push/send] subscription gone — prune', { statusCode });
        } else {
          logger.warn('[push/send] terminal push error — not retrying', { statusCode, error: last.error });
        }
        return { ...last, attempts: attempt };
      }

      // Transient (incl. 429): back off, honoring Retry-After when present.
      const retryAfter = err && err.headers && err.headers['retry-after'];
      const wait = retryAfter ? Number(retryAfter) * 1000 : BASE_DELAY_MS * 2 ** (attempt - 1);
      if (attempt < maxAttempts) await sleep(wait);
    }
  }

  logger.warn('[push/send] exhausted attempts', { attempts: attempt, last });
  return { ...last, attempts: attempt };
}

module.exports = { sendPushWithRetry, isTerminal, isExpired };
