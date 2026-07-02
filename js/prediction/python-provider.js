/* ============================================================
   PYTHON-PROVIDER.JS — Hybrid Prediction Architecture (v1.19.3)

   A STUB provider. It exists ONLY to lock the provider interface so a real
   Python-backed predictor can be integrated LATER without changing the
   Prediction Service, any dashboard, or any business logic.

   THIS SPRINT DOES NOT:
     • implement machine learning,
     • require a Python runtime,
     • make any network / API call,
     • execute any Python.

   predict() always returns a predictable NOT_IMPLEMENTED ProviderResult using
   the exact same contract as the Rule Provider. It NEVER throws.

   ── HOW A REAL PYTHON PREDICTOR WILL PLUG IN (future, NOT implemented) ────────
   A future provider replaces predict()'s body — the shape it returns does not
   change. Candidate mechanisms (pick one at integration time):
     • REST endpoint          — POST input → JSON PredictionModel
     • Cloud Run service       — containerised FastAPI/Flask model server
     • Cloud Functions         — serverless per-request inference
     • Local Python service    — localhost sidecar for on-prem deployments
   Whatever the transport, it must:
     1. send the same `input` (+ `config`) the Rule Provider receives,
     2. return a PredictionModel identical in SHAPE to the engine's output
        (so the Prediction Service can validate + certify it unchanged),
     3. map transport/model errors to providerFailure(...) — never throw,
     4. register itself and be selected via setActiveProvider('python').
   Because the service certifies EVERY provider's model with the SAME validator,
   an unshaped or degraded Python model simply fails certification — it can never
   silently reach a dashboard.
   ============================================================ */

'use strict';

import { PROVIDER_ERRORS, providerFailure } from './prediction-provider.js';

export const PYTHON_PROVIDER_ID = 'python';

/** Distinct from the engine schema so metadata never mistakes the stub for the engine. */
export const PYTHON_PROVIDER_VERSION = 'python-predictor@0-stub';

/**
 * predict(input, config) → NOT_IMPLEMENTED ProviderResult. No Python is run, no
 * network is touched. Same contract as every other provider.
 */
function predict(/* input, config */) {
  return providerFailure(
    PROVIDER_ERRORS.NOT_IMPLEMENTED,
    'The Python prediction provider is a stub — no Python runtime is integrated yet. '
      + 'Wire a real implementation (REST / Cloud Run / Cloud Functions / local service), '
      + 'register it, then setActiveProvider("python") to activate it.',
    { providerId: PYTHON_PROVIDER_ID, engineVersion: PYTHON_PROVIDER_VERSION },
  );
}

export const pythonProvider = Object.freeze({
  id: PYTHON_PROVIDER_ID,
  version: PYTHON_PROVIDER_VERSION,
  kind: 'python',
  description: 'STUB. Future Python ML predictor (REST / Cloud Run / Cloud Functions / local service). Returns NOT_IMPLEMENTED; exists only to lock the provider interface.',
  predict,
});

export default pythonProvider;
