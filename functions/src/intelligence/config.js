'use strict';

/* ============================================================
   functions/src/intelligence/config.js — Phase 1

   Server-side Intelligence flags + runtime config. Same DEFAULT + live-RTDB
   pattern as functions/src/config/runtimeSettings.js:

     • INTELLIGENCE_FLAGS  — hardcoded fail-safe defaults. `enabled: false`
       ships inert; deploying the callable changes NOTHING until an operator
       flips the flag AND sets the OPENAI_API_KEY secret.
     • getIntelligenceRuntimeConfig() — merges /feature_flags/intelligence
       and /settings/intelligence onto the defaults, short-TTL cached, falls
       back to defaults on any read error (never throws).

   No secret here — only the flag, the model id, and the defensive bounds.
   ============================================================ */

const logger = require('firebase-functions/logger');
const { db } = require('../config/admin');

const INTELLIGENCE_FLAGS = Object.freeze({
  /** Master switch. FALSE ⇒ the callable returns a typed DISABLED result. */
  enabled: false,
  /** Provider selector (only 'openai' is implemented in Phase 1). */
  provider: 'openai',
  /** Model id used when the client sends none. Named here + in
   *  src/intelligence/config/intelligence-config.js — nowhere else. */
  model: 'gpt-4o-mini',
  /** Defensive bounds (PART 13). */
  requestTimeoutMs: 30000,
  maxPromptChars: 24000,
  maxOutputTokens: 900,
});

const FLAGS_PATH = 'feature_flags/intelligence';
const SETTINGS_PATH = 'settings/intelligence';
const CACHE_TTL_MS = 30000;

let _cache = null;
let _cacheAt = 0;

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @returns {Promise<{enabled:boolean, provider:string, model:string, requestTimeoutMs:number, maxPromptChars:number, maxOutputTokens:number}>}
 */
async function getIntelligenceRuntimeConfig() {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_TTL_MS) return _cache;
  try {
    const [flagSnap, setSnap] = await Promise.all([
      db.ref(FLAGS_PATH).once('value'),
      db.ref(SETTINGS_PATH).once('value'),
    ]);
    const flags = flagSnap.val() || {};
    const settings = setSnap.val() || {};
    _cache = Object.freeze({
      enabled: typeof flags.enabled === 'boolean' ? flags.enabled : INTELLIGENCE_FLAGS.enabled,
      provider: typeof settings.provider === 'string' && settings.provider ? settings.provider : INTELLIGENCE_FLAGS.provider,
      model: typeof settings.model === 'string' && settings.model ? settings.model : INTELLIGENCE_FLAGS.model,
      requestTimeoutMs: numOr(settings.requestTimeoutMs, INTELLIGENCE_FLAGS.requestTimeoutMs),
      maxPromptChars: numOr(settings.maxPromptChars, INTELLIGENCE_FLAGS.maxPromptChars),
      maxOutputTokens: numOr(settings.maxOutputTokens, INTELLIGENCE_FLAGS.maxOutputTokens),
    });
    _cacheAt = now;
    return _cache;
  } catch (err) {
    logger.error('[intelligence/config] live read failed — using defaults', { error: err.message });
    return { ...INTELLIGENCE_FLAGS };
  }
}

function resetIntelligenceConfigCache() {
  _cache = null;
  _cacheAt = 0;
}

module.exports = { INTELLIGENCE_FLAGS, getIntelligenceRuntimeConfig, resetIntelligenceConfigCache, FLAGS_PATH, SETTINGS_PATH };
