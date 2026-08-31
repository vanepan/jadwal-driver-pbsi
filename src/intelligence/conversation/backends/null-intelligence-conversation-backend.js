/* ============================================================
   NULL-INTELLIGENCE-CONVERSATION-BACKEND.JS — Sarpras Intelligence (V2, Phase 1)

   The inert default backend for the durable conversation store. Every
   method returns a typed NOT_IMPLEMENTED result, so the store facade is
   never backend-less and a caller gets a predictable failure rather than a
   crash — the role NullRepository plays for the Knowledge Repository.

   Phase 1 ships this + the in-memory backend. The RTDB-backed backend is
   registered server-side by the Cloud Function once the
   /intelligence_conversations rules are deployed (staged, not deployed in
   Phase 1).
   ============================================================ */

'use strict';

import { IC_STORE_ERRORS, icFailure } from '../intelligence-conversation-store-contract.js';

export const NULL_IC_BACKEND_ID = 'null';

const ni = (op) => icFailure(IC_STORE_ERRORS.NOT_IMPLEMENTED, `IntelligenceConversation store "${op}" is not implemented by the null backend.`);

export const nullIntelligenceConversationBackend = Object.freeze({
  id: NULL_IC_BACKEND_ID,
  version: 'ic-null-backend@1',
  get: () => ni('get'),
  save: () => ni('save'),
  list: () => ni('list'),
});
