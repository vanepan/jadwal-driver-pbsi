'use strict';

/* ============================================================
   telegram/retry.js — send wrapper with retry + error classification

   Wraps telegram/sendMessage with the resilience the browser path
   never had:
     • transient errors (5xx, network, 429) → retry with exponential
       backoff; honor Telegram's 429 retry_after when present.
     • terminal errors (400 chat not found, 403 blocked/kicked) → no
       retry; classified so the caller can flag a stale chat ID for
       future cleanup (cleanup itself is a later release).

   Returns a structured outcome:
     { ok, status, description, attempts, terminal, retryable }
   ============================================================ */

const logger = require('firebase-functions/logger');
const { sendTelegramMessage } = require('./sendMessage');

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Is this Telegram failure permanent (don't retry)? */
function isTerminal(status, description) {
  if (status === 403) return true; // bot blocked / kicked
  if (status === 400) {
    const d = String(description || '').toLowerCase();
    if (d.includes('chat not found') || d.includes('chat_id is empty') ||
        d.includes('user is deactivated') || d.includes('peer_id_invalid')) {
      return true;
    }
  }
  return false;
}

/**
 * Send with retry. Network exceptions are treated as retryable.
 *
 * @param {string} token
 * @param {string|number} chatId
 * @param {string} message
 * @param {{maxAttempts?:number}} [opts]
 * @returns {Promise<{ok:boolean,status:number,description:string,attempts:number,terminal:boolean,retryable:boolean}>}
 */
async function sendWithRetry(token, chatId, message, opts = {}) {
  const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  let attempt = 0;
  let last = { ok: false, status: 0, description: '', terminal: false, retryable: true };

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await sendTelegramMessage(token, chatId, message);
      if (res.ok) {
        return { ok: true, status: res.status, description: '', attempts: attempt, terminal: false, retryable: false };
      }
      const terminal = isTerminal(res.status, res.description);
      last = { ok: false, status: res.status, description: res.description, terminal, retryable: !terminal };
      if (terminal) {
        logger.warn('[telegram/retry] terminal error — not retrying', { chatId: String(chatId), status: res.status, description: res.description });
        return { ...last, attempts: attempt };
      }
      // Transient (incl. 429): back off, honoring retry_after if given.
      const wait = res.retryAfter ? res.retryAfter * 1000 : BASE_DELAY_MS * 2 ** (attempt - 1);
      if (attempt < maxAttempts) await sleep(wait);
    } catch (err) {
      // Network-level failure — retryable.
      last = { ok: false, status: 0, description: String(err && err.message || err), terminal: false, retryable: true };
      if (attempt < maxAttempts) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  logger.warn('[telegram/retry] exhausted attempts', { chatId: String(chatId), attempts: attempt, last });
  return { ...last, attempts: attempt };
}

module.exports = { sendWithRetry, isTerminal };
