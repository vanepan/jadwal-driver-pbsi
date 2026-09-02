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
   activates the OpenAI provider). Phase 3B: it also assembles the
   createIntelligenceService() instance the minimal console UI drives
   (ports = the real existing V2 domains, provider = the ACTIVE one — Null
   while the flag is OFF).

   WHAT IT NEVER DOES: WRITE the feature flag (it only reads what
   loadFeatureFlags() already fetched), activate the OpenAI provider while
   the flag is OFF (the Null Provider stays active → deterministic path,
   zero OpenAI risk), call OpenAI, create a conversation, mount UI, touch V1.

   CALLED FROM: js/app.js#startAuthenticatedSession() — once, after Firebase
   auth is ready AND after the post-auth loadFeatureFlags() re-read, behind
   isV2Enabled(getCurrentUser()), lazy-loaded via module-loader-registry.js
   so a normal V1 session never fetches it or src/intelligence/. Errors are
   swallowed — a failure leaves Intelligence inert and never disturbs V1 boot.
   The Phase 3B console factory is reached only from js/intelligence-console.js
   (itself only mounted for the pilot with the synced flag ON).
   ============================================================ */

'use strict';

import { callGenerateCompletion, callIntelligenceConversation, callIntelligenceNorDraft } from './firebase.js';
import { bootstrapIntelligenceClient } from '../src/intelligence/client-bootstrap.js';
import { createIntelligenceService } from '../src/intelligence/service/intelligence-service.js';
import { buildDefaultPorts } from '../src/intelligence/service/default-ports.js';
import { getActiveProvider } from '../src/intelligence/provider-registry.js';
import { getIntelligenceConfig, isIntelligenceEnabled } from '../src/intelligence/config/intelligence-config.js';
import { createIntelligenceConsoleController } from '../src/intelligence/console/intelligence-console-controller.js';

let _wired = false;
let _status = null;

/** Client-side pre-check only. The deployed Cloud Functions
 *  (generateCompletion / intelligenceConversation) independently enforce
 *  role authz from the verified Firebase context — this never widens that. */
const CLIENT_INTELLIGENCE_ROLES = new Set(['admin', 'developer']);

/** RTDB-safe conversation id (no `.` `$` `#` `[` `]` `/`). The server still
 *  owns ownership + persistence; this is only the local handle the service
 *  echoes back in its response. */
let _convSeq = 0;
function makeConversationId() {
  _convSeq += 1;
  return `conv_${Date.now().toString(36)}_${_convSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

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
      callDraft: (payload) => callIntelligenceNorDraft(payload),
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

/**
 * Build the minimal Phase 3B console controller over an EXISTING
 * createIntelligenceService() instance. Ensures the backend is wired first
 * (idempotent), then composes:
 *   ports    → buildDefaultPorts()  (the real existing V2 domains — reuse)
 *   provider → getActiveProvider()  (Null while the flag is OFF ⇒ template body,
 *                                    0 OpenAI calls; OpenAI only once the synced
 *                                    flag flipped it active during bootstrap)
 *   config   → the Phase 0 config module (flag + limits)
 *   authz    → a client PRE-CHECK only (server re-verifies — never widened here)
 *   idgen    → makeConversationId()
 *
 * @param {{ actor?: {userId?:string|null, role?:string|null}, onChange?:Function }} [opts]
 * @returns {Promise<import('../src/intelligence/console/intelligence-console-controller.js').*>}
 */
export async function createWiredIntelligenceConsoleController({ actor, onChange } = {}) {
  await wireIntelligenceBackend();
  const service = createIntelligenceService({
    ports: buildDefaultPorts(),
    provider: getActiveProvider(),
    authz: {
      canUseIntelligence: (a) => !!a && CLIENT_INTELLIGENCE_ROLES.has(a.role),
      canAccessKnowledge: () => true,
    },
    config: {
      isEnabled: () => isIntelligenceEnabled(),
      get: () => getIntelligenceConfig(),
    },
    idgen: makeConversationId,
  });
  return createIntelligenceConsoleController({
    service,
    actor: { userId: (actor && actor.userId) || null, role: (actor && actor.role) || null },
    onChange,
  });
}
