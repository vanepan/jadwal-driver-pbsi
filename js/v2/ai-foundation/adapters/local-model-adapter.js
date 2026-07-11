/* ============================================================
   LOCAL-MODEL-ADAPTER.JS — AI Foundation (V2, Phase 3)

   A STUB adapter. Same role as claude-adapter.js, for a future on-prem /
   local-model-backed adapter (e.g. an on-site Llama/local inference
   server). See claude-adapter.js's header for the shared rationale.

   PURPOSE: lock the local-model adapter's identity + contract shape.
   RESPONSIBILITY: return NOT_IMPLEMENTED, uniformly, forever until Phase 4+
   replaces this file's body (not its shape).
   DEPENDENCIES: ai-foundation/contracts/adapter-contract.js only.
   NON-GOALS: no local inference runtime, no network/socket I/O.
   FUTURE EVOLUTION: a real implementation replaces `query()`'s body only.
   ============================================================ */

'use strict';

import { ADAPTER_ERRORS, adapterFailure } from '../contracts/adapter-contract.js';

export const LOCAL_MODEL_ADAPTER_ID = 'local-model';
export const LOCAL_MODEL_ADAPTER_VERSION = 'local-model-adapter@0-stub';

function query(/* knowledgeContext, prompt */) {
  return adapterFailure(
    ADAPTER_ERRORS.NOT_IMPLEMENTED,
    'The local-model adapter is a stub — no local inference backend is integrated yet. '
      + 'Wire a real implementation, register it, then activate it via the adapter registry.',
  );
}

export const localModelAdapter = Object.freeze({
  id: LOCAL_MODEL_ADAPTER_ID,
  provider: 'Local Model',
  version: LOCAL_MODEL_ADAPTER_VERSION,
  query,
});

export default localModelAdapter;
