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
   enabled? }) → a status object. Idempotent (the registries are idempotent
   per id). Never throws.

   DEPENDENCIES: conversation/intelligence-conversation-store.js,
   providers/openai-provider.js, provider-registry.js, config/intelligence-config.js.
   ============================================================ */

'use strict';

import { useCallableIcBackend, getActiveIcBackendId } from './conversation/intelligence-conversation-store.js';
import { createOpenAiProvider, OPENAI_PROVIDER_ID } from './providers/openai-provider.js';
import { registerProvider, setActiveProvider, getActiveProviderId } from './provider-registry.js';
import { isIntelligenceEnabled } from './config/intelligence-config.js';

/**
 * @param {Object} args
 * @param {(payload: {op:string, convId?:string, record?:object}) => Promise<{ok:boolean,data:*,error:*}>} args.callConversation
 * @param {(req: import('./providers/model-completion-contract.js').ModelCompletionRequest) => Promise<import('./providers/model-completion-contract.js').ModelCompletionResult>} args.callModel
 * @param {boolean} [args.enabled]  defaults to the current client config flag
 * @returns {{ ok:boolean, conversationBackend:string|null, providerRegistered:boolean,
 *   activeProvider:string|null, featureEnabled:boolean, error:string|null }}
 */
export function bootstrapIntelligenceClient({ callConversation, callModel, enabled } = {}) {
  const featureEnabled = typeof enabled === 'boolean' ? enabled : isIntelligenceEnabled();
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

    // 3. The feature flag is the authority. While OFF, keep the Null Provider
    //    active so a Phase 3 session degrades to the deterministic path.
    if (featureEnabled) setActiveProvider(OPENAI_PROVIDER_ID);
    status.activeProvider = getActiveProviderId();

    status.ok = true;
  } catch (err) {
    status.error = err && err.message ? err.message : String(err);
  }
  return status;
}
