/* ============================================================
   FEATURE-FLAG-SYNC.JS — Sarpras Intelligence (V2, Phase 3A)

   PURPOSE: the ONE place that turns the server-controlled feature flag
   `/feature_flags/intelligence/enabled` into the Intelligence layer's
   in-memory `enabled` config value — fail-closed.

   This does NOT read RTDB. It is a PURE resolver: the host (js/app.js,
   via its existing loadFeatureFlags() → `/feature_flags` read) hands the
   already-fetched `/feature_flags` node in; this module drills to
   `.intelligence.enabled`, validates it STRICTLY, and pushes the result
   into setIntelligenceConfig({ enabled }). No second feature-flag system,
   no second config store, no network, no storage, no DOM.

   FAIL-CLOSED CONTRACT (PART 3): the layer is enabled ⇔ the flag value is
   the JavaScript boolean `true` and nothing else. Every other shape —
   missing `/feature_flags` node, missing `intelligence` branch, missing
   `enabled` key, `false`, `null`, `undefined`, the STRING "true", the
   number 1, the string "false", an object, an array, a read that never
   happened — resolves to `false`. There is no code path here that can
   fail-open to the OpenAI provider.

   The client flag is a CONVENIENCE / rollout switch, NOT authorization —
   the Cloud Functions (`generateCompletion`, `intelligenceConversation`)
   independently re-check `/feature_flags/intelligence` server-side and
   enforce role authz from the verified Firebase context regardless of
   anything the browser resolved here.

   RESPONSIBILITY: isIntelligenceFlagValueOn(rawValue),
   resolveIntelligenceFlag(featureFlagsNode),
   applyIntelligenceFeatureFlag(featureFlagsNode).

   DEPENDENCIES: ./intelligence-config.js only. PURE.
   ============================================================ */

'use strict';

import { setIntelligenceConfig } from './intelligence-config.js';

/**
 * The strict leaf test. ONLY the boolean `true` counts as ON — a string
 * "true", the number 1, "1", "on", etc. are all OFF. Keeping this as its
 * own named function makes the fail-closed rule the single obvious thing a
 * reviewer (or a test) checks.
 * @param {*} rawValue the raw value stored at /feature_flags/intelligence/enabled
 * @returns {boolean}
 */
export function isIntelligenceFlagValueOn(rawValue) {
  return rawValue === true;
}

/**
 * Drill the already-fetched `/feature_flags` RTDB node down to
 * `intelligence.enabled` and apply the strict leaf test. Any structural
 * gap (node not an object, `intelligence` branch absent or not an object)
 * short-circuits to `false` before the leaf test is even reached.
 *
 * @param {*} featureFlagsNode the value of the `/feature_flags` node
 *   (js/app.js#loadFeatureFlags() already returns this shape). May be
 *   undefined / null / a primitive / {} — all resolve to `false`.
 * @returns {boolean} the fail-closed effective flag
 */
export function resolveIntelligenceFlag(featureFlagsNode) {
  if (!featureFlagsNode || typeof featureFlagsNode !== 'object' || Array.isArray(featureFlagsNode)) {
    return false;
  }
  const branch = featureFlagsNode.intelligence;
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
    return false;
  }
  return isIntelligenceFlagValueOn(branch.enabled);
}

/**
 * Resolve the flag (fail-closed) and PERSIST it into the live Intelligence
 * config via setIntelligenceConfig({ enabled }). This is step 3 of the
 * Phase 3A sequence (auth → flag read → CONFIG UPDATED → bootstrap →
 * provider selection). Returns the effective boolean so the caller can
 * drive provider selection from the same value without re-reading.
 *
 * setIntelligenceConfig itself only accepts a boolean `enabled`, so even a
 * corrupted call here cannot enable the layer with a non-boolean.
 *
 * @param {*} featureFlagsNode the `/feature_flags` node (see resolveIntelligenceFlag)
 * @returns {boolean} the effective flag now stored in the config
 */
export function applyIntelligenceFeatureFlag(featureFlagsNode) {
  const enabled = resolveIntelligenceFlag(featureFlagsNode);
  setIntelligenceConfig({ enabled });
  return enabled;
}
