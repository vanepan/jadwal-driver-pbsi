/* ============================================================
   INTELLIGENCE-CONFIG.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: the single source of truth for every Sarpras Intelligence
   tunable (PART 21, 23). Mirrors the frozen-DEFAULT + mutable-ACTIVE
   pattern of js/config/dispatch-intelligence-config.js.

   THE MASTER SWITCH: `enabled` defaults to FALSE. With it false, the whole
   layer is inert and V1 boots and runs exactly as it does today — there is
   no startup dependency on any AI provider or backend (PART 21, 22).

   RESPONSIBILITY: DEFAULT_INTELLIGENCE_CONFIG, getIntelligenceConfig(),
   setIntelligenceConfig(partial) (validated merge), resetIntelligenceConfig(),
   isIntelligenceEnabled().

   DEPENDENCIES: none. PURE — no DOM, no Firebase, no `window`. Safe to ship
   to the browser: it holds NO secret.

   NON-GOALS: contains NO provider credential — the OpenAI/other key lives
   only server-side (see docs/V2_SARPRAS_INTELLIGENCE_ARCHITECTURE.md §4,
   §5). Does not wire itself into the live app: connecting `enabled` to
   js/config/feature-gates.js / loadFeatureFlags() / a
   /feature_flags/intelligence RTDB flag is a later phase. Model ids are
   named HERE and nowhere else in application code.

   FUTURE EVOLUTION: a settings surface pushes overrides in via
   setIntelligenceConfig() (in-memory) or the flag path (persisted); the
   shape does not change to add a provider.
   ============================================================ */

'use strict';

export const INTELLIGENCE_CONFIG_SCHEMA = 'intelligence-config@1';

/** Immutable canonical baseline. Every literal lives HERE. */
export const DEFAULT_INTELLIGENCE_CONFIG = Object.freeze({
  /** Master feature flag. FALSE ⇒ the layer is inert; V1 is unaffected. */
  enabled: false,
  /** provider-registry.js id to activate when enabled. 'null' = the inert default. */
  provider: 'null',
  /** Provider-neutral default model id. null until a provider is chosen; never
   *  hardcoded anywhere else in application code. */
  defaultModel: null,
  request: Object.freeze({
    /** Client-visible ceiling for how long to wait on a response. */
    timeoutMs: 30000,
    /** Optional cap on generated length; null = provider/server default. */
    maxOutputTokens: null,
  }),
  numbering: Object.freeze({
    /** Whether publication may RESERVE a NOR number (PART 12). Off in Phase 0 —
     *  the registry only ever SUGGESTS. */
    reservationEnabled: false,
  }),
  /** Phase 1 — defensive bounds on a generation session (PART 13). */
  limits: Object.freeze({
    /** Hard cap on clarification turns before the service returns an error
     *  instead of continuing (no infinite conversation loop). */
    maxTurns: 12,
    /** Hard cap on characters of grounding context sent to a provider
     *  (no unbounded context expansion). */
    maxPromptChars: 24000,
  }),
  /** Phase 1 — provider-neutral hints for a remote model provider. The
   *  provider adapter maps these to its own API params; still no secret,
   *  no endpoint, no provider param NAME here. */
  openai: Object.freeze({
    /** Model id used when defaultModel is null. Named HERE only. */
    model: 'gpt-4o-mini',
    /** Sampling determinism hint, 0..1 (1 = most deterministic). */
    determinism: 0.7,
  }),
});

function cloneConfig(cfg) {
  return {
    enabled: cfg.enabled === true,
    provider: cfg.provider,
    defaultModel: cfg.defaultModel,
    request: { timeoutMs: cfg.request.timeoutMs, maxOutputTokens: cfg.request.maxOutputTokens },
    numbering: { reservationEnabled: cfg.numbering.reservationEnabled === true },
    limits: { maxTurns: cfg.limits.maxTurns, maxPromptChars: cfg.limits.maxPromptChars },
    openai: { model: cfg.openai.model, determinism: cfg.openai.determinism },
  };
}

let _active = cloneConfig(DEFAULT_INTELLIGENCE_CONFIG);

/** The live config. Treat as read-only; mutate via setIntelligenceConfig(). */
export function getIntelligenceConfig() {
  return _active;
}

/**
 * Merge a partial override onto the active config. Only well-formed values
 * are applied; anything else is ignored so a bad write can never silently
 * enable the layer or set a nonsense timeout.
 * @param {Object} partial
 * @returns {Object} the updated active config
 */
export function setIntelligenceConfig(partial = {}) {
  const next = cloneConfig(_active);
  if (typeof partial.enabled === 'boolean') next.enabled = partial.enabled;
  if (typeof partial.provider === 'string' && partial.provider) next.provider = partial.provider;
  if (partial.defaultModel === null || (typeof partial.defaultModel === 'string' && partial.defaultModel)) {
    next.defaultModel = partial.defaultModel;
  }
  if (partial.request && typeof partial.request === 'object') {
    if (Number(partial.request.timeoutMs) > 0) next.request.timeoutMs = Number(partial.request.timeoutMs);
    if (partial.request.maxOutputTokens === null || Number(partial.request.maxOutputTokens) > 0) {
      next.request.maxOutputTokens = partial.request.maxOutputTokens === null ? null : Number(partial.request.maxOutputTokens);
    }
  }
  if (partial.numbering && typeof partial.numbering === 'object' && typeof partial.numbering.reservationEnabled === 'boolean') {
    next.numbering.reservationEnabled = partial.numbering.reservationEnabled;
  }
  if (partial.limits && typeof partial.limits === 'object') {
    if (Number(partial.limits.maxTurns) > 0) next.limits.maxTurns = Math.floor(Number(partial.limits.maxTurns));
    if (Number(partial.limits.maxPromptChars) > 0) next.limits.maxPromptChars = Math.floor(Number(partial.limits.maxPromptChars));
  }
  if (partial.openai && typeof partial.openai === 'object') {
    if (typeof partial.openai.model === 'string' && partial.openai.model) next.openai.model = partial.openai.model;
    const d = Number(partial.openai.determinism);
    if (Number.isFinite(d) && d >= 0 && d <= 1) next.openai.determinism = d;
  }
  _active = next;
  return _active;
}

/** Reset to the immutable default (test/teardown helper). */
export function resetIntelligenceConfig() {
  _active = cloneConfig(DEFAULT_INTELLIGENCE_CONFIG);
  return _active;
}

/** Whether the Sarpras Intelligence layer is switched on. Defaults false. */
export function isIntelligenceEnabled(cfg = _active) {
  return !!cfg && cfg.enabled === true;
}
