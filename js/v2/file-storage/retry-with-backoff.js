/* ============================================================
   RETRY-WITH-BACKOFF.JS — Phase 1 (Operational Engine Hardening)

   PURPOSE: a bounded retry wrapper for a transient async failure —
   currently the one evidenced gap in the import pipeline: a Storage
   upload's network hiccup was caught and logged but never retried (see
   file-storage-engine.js#uploadFile's header).

   ISOLATED ON PURPOSE, same reasoning file-hash.js's own header already
   documents: file-storage-engine.js can never be imported under Node (its
   top-level `import ... from '../../firebase.js'` is an unresolvable CDN
   URL to Node's ESM loader), so the retry MECHANISM itself (attempt
   counting, backoff, eventual success/failure) needs to live in a
   Firebase-free file to stay directly unit-testable — only the
   integration with the real uploadFileToStorage remains verifiable solely
   via a real browser.

   RESPONSIBILITY: withRetryAsync(fn, opts) only. Does not know or care
   what `fn` does — no Storage/Firebase-specific logic here.
   ============================================================ */

'use strict';

function sleep(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); }

/**
 * Sprint 1 (Autonomy Closure, Part 4) — bounds one attempt's wall-clock
 * time. Full pipeline trace found NO timeout anywhere between
 * processOneFile()'s `await uploadFile(...)` and the real Firebase
 * `uploadBytes()` call — a genuinely-hanging (never settling, not merely
 * rejecting) upload would freeze every remaining file in a batch forever,
 * since processBatch() awaits each file sequentially. A timeout turns a
 * hang into an ordinary rejection, which withRetryAsync (below) already
 * retries and the caller's existing catch already handles gracefully —
 * no new failure shape, no fabricated success.
 * @param {Promise<*>} promise
 * @param {number} ms
 * @param {string} [code]
 */
export function withTimeout(promise, ms, code = 'TIMEOUT') {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Calls `fn()` (an async function returning `{ok: boolean, ...}`, matching
 * this codebase's own success/failure envelope convention) up to
 * `attempts` times, waiting `delaysMs[i]` between attempt i and i+1.
 * Retries only on a real `{ok:false}` result or a thrown error — never
 * fabricates success. Returns the last attempt's result (or a synthetic
 * failure envelope if every attempt threw).
 * @param {() => Promise<{ok: boolean, [key: string]: any}>} fn
 * @param {{attempts?: number, delaysMs?: number[]}} [opts]
 */
export async function withRetryAsync(fn, opts = {}) {
  const attempts = opts.attempts ?? 3;
  const delaysMs = opts.delaysMs ?? [300, 900];
  let lastResult = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      lastResult = await fn();
    } catch (err) {
      lastResult = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    if (lastResult && lastResult.ok) return lastResult;
    if (i < attempts - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 0);
    }
  }
  return lastResult;
}
