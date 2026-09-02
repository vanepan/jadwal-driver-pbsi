/* ============================================================
   NULL-NOR-DRAFT-BACKEND.JS — Sarpras Intelligence (V2, Phase 4)

   The inert default backend for the NOR-draft store. Every method returns a
   typed NOT_IMPLEMENTED result, so the store facade is never backend-less
   and a caller gets a predictable failure rather than a crash — the same
   role null-intelligence-conversation-backend.js plays for conversations.

   The real persistence path is the `callable` backend (→ the
   intelligenceNorDraft Cloud Function → Admin SDK → RTDB). `memory` is for
   tests / a DISABLED client.
   ============================================================ */

'use strict';

import { DRAFT_STORE_ERRORS, draftFailure } from '../contracts/nor-draft-store-contract.js';

export const NULL_NOR_DRAFT_BACKEND_ID = 'null';

const ni = (op) => draftFailure(DRAFT_STORE_ERRORS.NOT_IMPLEMENTED, `NOR-draft store "${op}" is not implemented by the null backend.`);

export const nullNorDraftBackend = Object.freeze({
  id: NULL_NOR_DRAFT_BACKEND_ID,
  version: 'nor-draft-null-backend@1',
  get: () => ni('get'),
  create: () => ni('create'),
  update: () => ni('update'),
  list: () => ni('list'),
});
