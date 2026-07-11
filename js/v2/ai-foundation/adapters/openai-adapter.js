/* ============================================================
   OPENAI-ADAPTER.JS — AI Foundation (V2, Phase 3)

   A STUB adapter. Same role as claude-adapter.js, for a future OpenAI-backed
   adapter. See claude-adapter.js's header for the shared rationale.

   PURPOSE: lock the OpenAI adapter's identity + contract shape.
   RESPONSIBILITY: return NOT_IMPLEMENTED, uniformly, forever until Phase 4+
   replaces this file's body (not its shape).
   DEPENDENCIES: ai-foundation/contracts/adapter-contract.js only.
   NON-GOALS: no OpenAI SDK import, no credentials, no network I/O.
   FUTURE EVOLUTION: a real implementation replaces `query()`'s body only.
   ============================================================ */

'use strict';

import { ADAPTER_ERRORS, adapterFailure } from '../contracts/adapter-contract.js';

export const OPENAI_ADAPTER_ID = 'openai';
export const OPENAI_ADAPTER_VERSION = 'openai-adapter@0-stub';

function query(/* knowledgeContext, prompt */) {
  return adapterFailure(
    ADAPTER_ERRORS.NOT_IMPLEMENTED,
    'The OpenAI adapter is a stub — no OpenAI API integration exists yet. '
      + 'Wire a real implementation, register it, then activate it via the adapter registry.',
  );
}

export const openaiAdapter = Object.freeze({
  id: OPENAI_ADAPTER_ID,
  provider: 'OpenAI',
  version: OPENAI_ADAPTER_VERSION,
  query,
});

export default openaiAdapter;
