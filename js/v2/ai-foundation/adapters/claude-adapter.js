/* ============================================================
   CLAUDE-ADAPTER.JS — AI Foundation (V2, Phase 3)

   A STUB adapter. It exists ONLY to lock the adapter interface so a real
   Claude-backed adapter can be integrated LATER without changing
   knowledge/, any dashboard, or any business logic — mirroring
   js/prediction/python-provider.js's role for the Prediction Platform.

   THIS PHASE DOES NOT: call any API, require any API key, make any network
   call. `query()` always returns a predictable NOT_IMPLEMENTED
   AdapterResult. It NEVER throws.

   PURPOSE: lock the Claude adapter's identity + contract shape.
   RESPONSIBILITY: return NOT_IMPLEMENTED, uniformly, forever until Phase 4+
   replaces this file's body (not its shape).
   DEPENDENCIES: ai-foundation/contracts/adapter-contract.js only.
   NON-GOALS: no Anthropic SDK import, no credentials, no network I/O.
   FUTURE EVOLUTION: a real implementation replaces `query()`'s body only —
   register it under the same id, and switching from another adapter to
   this one requires zero changes to knowledge/.
   ============================================================ */

'use strict';

import { ADAPTER_ERRORS, adapterFailure } from '../contracts/adapter-contract.js';

export const CLAUDE_ADAPTER_ID = 'claude';
export const CLAUDE_ADAPTER_VERSION = 'claude-adapter@0-stub';

function query(/* knowledgeContext, prompt */) {
  return adapterFailure(
    ADAPTER_ERRORS.NOT_IMPLEMENTED,
    'The Claude adapter is a stub — no Claude API integration exists yet. '
      + 'Wire a real implementation, register it, then activate it via the adapter registry.',
  );
}

export const claudeAdapter = Object.freeze({
  id: CLAUDE_ADAPTER_ID,
  provider: 'Anthropic Claude',
  version: CLAUDE_ADAPTER_VERSION,
  query,
});

export default claudeAdapter;
