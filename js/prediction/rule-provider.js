/* ============================================================
   RULE-PROVIDER.JS — Hybrid Prediction Architecture (v1.19.3)

   The DEFAULT prediction provider. A thin adapter that wraps the existing
   JavaScript Prediction Engine (v1.19.0) behind the provider contract.

   It adds ZERO prediction logic and does NOT modify the engine in any way — it
   only calls buildPredictionModel(input, config) and packages the raw model
   into a ProviderResult. Because it forwards the exact same arguments, a
   prediction produced through this provider is byte-identical to a direct
   engine call: the platform's runtime behaviour is unchanged by the abstraction.

   Certification is NOT this provider's job — it returns the RAW model; the
   Prediction Service validates + certifies it.
   ============================================================ */

'use strict';

import { buildPredictionModel, PREDICTION_SCHEMA } from '../engines/prediction-engine.js';
import { PROVIDER_ERRORS, providerSuccess, providerFailure } from './prediction-provider.js';

export const RULE_PROVIDER_ID = 'rule';

/**
 * predict(input, config) → ProviderResult. Never throws: an engine error is
 * captured as a predictable BUILD_FAILED result so the service stays in control.
 */
function predict(input, config) {
  const meta = { providerId: RULE_PROVIDER_ID, engineVersion: PREDICTION_SCHEMA };
  try {
    const model = buildPredictionModel(input, config);
    return providerSuccess(model, meta);
  } catch (e) {
    return providerFailure(
      PROVIDER_ERRORS.BUILD_FAILED,
      `Rule engine failed to build a model: ${e && e.message ? e.message : e}`,
      meta,
    );
  }
}

export const ruleProvider = Object.freeze({
  id: RULE_PROVIDER_ID,
  version: PREDICTION_SCHEMA,        // 'prediction@1' — the engine's own schema id
  kind: 'rule',
  description: 'JavaScript rule-based Prediction Engine (v1.19.0). The default, always-available provider — deterministic, PURE, no external runtime.',
  predict,
});

export default ruleProvider;
