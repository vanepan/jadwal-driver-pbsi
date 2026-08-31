/* ============================================================
   CLIENT-BOOTSTRAP.JS — Sarpras Intelligence (V2, Phase 2F)

   PURPOSE: the single, PURE registration step that connects the ESM
   Intelligence layer to whatever transports the host supplies:
     • callConversation  → the server-owned conversation-state callable
     • callModel          → the OpenAI server boundary callable

   It registers, it does not activate an AI provider while the feature flag
   is OFF, it never enables the flag, never calls a transport, never mounts
   UI. Node-testable (no js/firebase.js import — the host injects the
   transports; js/intelligence-backend-wiring.js is the browser adapter).

   RESPONSIBILITY: bootstrapIntelligenceClient({ callConversation, callModel,
   featureFlags?, enabled? }) → a status object. Idempotent (the registries
   are idempotent per id). Never throws.

   FEATURE FLAG (Phase 3A): pass `featureFlags` — the already-fetched
   `/feature_flags` RTDB node — and this step resolves
   `/feature_flags/intelligence/enabled` FAIL-CLOSED (only the boolean
   `true` ⇒ ON), persists it into the config via setIntelligenceConfig,
   and selects the provider from that same value: ON ⇒ OpenAI provider
   ACTIVE, OFF ⇒ Null Provider ACTIVE. `enabled` (a resolved boolean) is a
   test/advanced seam that skips the resolve+persist and drives selection
   directly. With neither, the current config flag is used (default OFF).

   DEPENDENCIES: conversation/intelligence-conversation-store.js,
   providers/openai-provider.js, provider-registry.js,
   config/intelligence-config.js, config/feature-flag-sync.js.
   ============================================================ */

'use strict';

import { useCallableIcBackend, getActiveIcBackendId } from './conversation/intelligence-conversation-store.js';
import { createOpenAiProvider, OPENAI_PROVIDER_ID } from './providers/openai-provider.js';
import { registerProvider, setActiveProvider, getActiveProviderId, DEFAULT_PROVIDER_ID } from './provider-registry.js';
import { isIntelligenceEnabled } from './config/intelligence-config.js';
import { applyIntelligenceFeatureFlag } from './config/feature-flag-sync.js';

/**
 * @param {Object} args
 * @param {(payload: {op:string, convId?:string, record?:object}) => Promise<{ok:boolean,data:*,error:*}>} args.callConversation
 * @param {(req: import('./providers/model-completion-contract.js').ModelCompletionRequest) => Promise<import('./providers/model-completion-contract.js').ModelCompletionResult>} args.callModel
 * @param {*} [args.featureFlags]  the already-fetched `/feature_flags` RTDB
 *   node; `/feature_flags/intelligence/enabled` is resolved FAIL-CLOSED and
 *   persisted into the config. Missing / malformed ⇒ OFF.
 * @param {boolean} [args.enabled]  a pre-resolved boolean that skips the
 *   featureFlags resolve+persist (test / advanced seam). Takes precedence
 *   over `featureFlags`. With neither, the current config flag is used.
 * @returns {{ ok:boolean, conversationBackend:string|null, providerRegistered:boolean,
 *   activeProvider:string|null, featureEnabled:boolean, error:string|null }}
 */
export function bootstrapIntelligenceClient({ callConversation, callModel, featureFlags, enabled } = {}) {
  // Step 2 of the Phase 3A sequence — resolve + persist the flag BEFORE any
  // provider is selected. Precedence: an explicit resolved boolean wins;
  // otherwise resolve /feature_flags/intelligence/enabled fail-closed (a
  // missing / undefined node resolves to `false` and is still persisted, so
  // the config is left in a known state rather than whatever it held); with
  // no signal at all, fall back to the config flag (default OFF).
  let featureEnabled;
  if (typeof enabled === 'boolean') {
    featureEnabled = enabled;
  } else if (featureFlags !== undefined) {
    featureEnabled = applyIntelligenceFeatureFlag(featureFlags);
  } else {
    featureEnabled = isIntelligenceEnabled();
  }
  const status = {
    ok: false,
    conversationBackend: null,
    providerRegistered: false,
    activeProvider: null,
    featureEnabled,
    error: null,
  };
  try {
    if (typeof callConversation !== 'function') throw new Error('bootstrapIntelligenceClient: callConversation port is required.');
    if (typeof callModel !== 'function') throw new Error('bootstrapIntelligenceClient: callModel port is required.');

    // 1. server-owned conversation state — RTDB via the deployed callable.
    useCallableIcBackend({ callConversation });
    status.conversationBackend = getActiveIcBackendId();

    // 2. OpenAI provider adapter — the callModel port never sees a key.
    registerProvider(createOpenAiProvider({ callModel }));
    status.providerRegistered = true;

    // 3. Provider selection follows the resolved flag, BOTH ways: ON ⇒ the
    //    OpenAI provider is ACTIVE; OFF ⇒ the Null Provider is (re)activated
    //    so a re-run after a flag flip self-corrects and a stale OpenAI
    //    selection can never linger. OFF keeps the deterministic path.
    if (featureEnabled) setActiveProvider(OPENAI_PROVIDER_ID);
    else setActiveProvider(DEFAULT_PROVIDER_ID);
    status.activeProvider = getActiveProviderId();

    status.ok = true;
  } catch (err) {
    status.error = err && err.message ? err.message : String(err);
  }
  return status;
}
