/* ============================================================
   INTELLIGENCE-BACKEND-WIRING.JS — V2 Phase 2F (client backend wiring)

   The browser adapter that hands the DEPLOYED Firebase callables to the
   ESM Sarpras Intelligence layer. This is the ONE js/ module allowed to
   import src/intelligence/ (see scripts/intelligence-foundation-check.mjs);
   everything else stays isolated. All real logic lives in the pure,
   Node-testable src/intelligence/client-bootstrap.js — this file only maps
   js/firebase.js#callIntelligenceConversation / callGenerateCompletion onto
   its two injected ports.

   WHAT IT DOES: registers the server-owned RTDB conversation backend and
   the OpenAI provider adapter. Registration only. Phase 3A: it also
   forwards the already-fetched `/feature_flags` node so the bootstrap can
   sync `/feature_flags/intelligence/enabled` into the Intelligence config
   and pick the provider from it (fail-closed — only the boolean `true`
   activates the OpenAI provider).

   WHAT IT NEVER DOES: WRITE the feature flag (it only reads what
   loadFeatureFlags() already fetched), activate the OpenAI provider while
   the flag is OFF (the Null Provider stays active → deterministic path,
   zero OpenAI risk), call OpenAI, create a conversation, mount UI, touch V1.

   CALLED FROM: js/app.js#startAuthenticatedSession() — once, after Firebase
   auth is ready AND after the post-auth loadFeatureFlags() re-read, behind
   isV2Enabled(getCurrentUser()), lazy-loaded via module-loader-registry.js
   so a normal V1 session never fetches it or src/intelligence/. Errors are
   swallowed — a failure leaves Intelligence inert and never disturbs V1 boot.
   ============================================================ */

'use strict';

import { callGenerateCompletion, callIntelligenceConversation } from './firebase.js';
import { bootstrapIntelligenceClient } from '../src/intelligence/client-bootstrap.js';

let _wired = false;
let _status = null;

/**
 * Register the deployed callable conversation backend + the OpenAI provider
 * adapter, and sync `/feature_flags/intelligence/enabled` into the config.
 * Idempotent, never throws.
 * @param {*} [featureFlags]  the `/feature_flags` node already fetched by
 *   js/app.js#loadFeatureFlags(). Missing / malformed ⇒ Intelligence OFF.
 * @returns {Promise<Object>} the bootstrap status
 */
export async function wireIntelligenceBackend(featureFlags) {
  if (_wired && _status) return _status;
  try {
    _status = bootstrapIntelligenceClient({
      callConversation: (payload) => callIntelligenceConversation(payload),
      callModel: (req) => callGenerateCompletion(req),
      featureFlags: (featureFlags && typeof featureFlags === 'object') ? featureFlags : undefined,
    });
    _wired = _status.ok === true;
    if (!_status.ok && _status.error) {
      // eslint-disable-next-line no-console
      console.warn('[intelligence] backend wiring incomplete —', _status.error);
    }
  } catch (err) {
    _status = { ok: false, error: err && err.message ? err.message : String(err) };
    // eslint-disable-next-line no-console
    console.warn('[intelligence] backend wiring skipped —', _status.error);
  }
  return _status;
}

/** Test/introspection helper. */
export function isIntelligenceBackendWired() {
  return _wired;
}
