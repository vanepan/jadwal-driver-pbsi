/* ============================================================
   DEFAULT-PORTS.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: wire the Intelligence Service's injected ports to the REAL,
   existing V2 domains — reuse, never re-implement (PART 1). Every port here
   is a thin adapter over an existing service; nothing new is computed.

     conversation   → src/conversation/services/conversation-service.js
     knowledgeReader → src/knowledge/services/knowledge-service.js (read-only)
     memoryReader   → src/organizational-memory/services/archive-service.js (read-only)
     norTypes       → src/knowledge/registry/nor-type-registry.js
     numbering      → src/intelligence/nor-registry (Phase 0 — suggestNextNumber)

   RESPONSIBILITY: buildDefaultPorts() → the deps object createIntelligenceService expects.

   DEPENDENCIES: the four existing services above + Phase 0 nor-registry.
   All are pure/in-memory-repo ESM that already run under Node in tests.

   NON-GOALS: no provider here (the caller injects the active provider), no
   authz policy here (the caller injects it — see the Cloud Function for the
   server-side gate; the client is already behind isV2Enabled()).
   ============================================================ */

'use strict';

import {
  startConversation, continueConversation, findConversation, CONVERSATION_STATE,
} from '../../conversation/services/conversation-service.js';
import { listKnowledge } from '../../knowledge/services/knowledge-service.js';
import { listArchive } from '../../organizational-memory/services/archive-service.js';
import { NOR_TYPE, hasNorType, getNorTypeFieldSchema, listNorTypes } from '../../knowledge/registry/nor-type-registry.js';
import { suggestNextNumber } from '../nor-registry/nor-registry.js';

export function buildDefaultPorts() {
  return {
    conversation: {
      start: startConversation,
      continue: continueConversation,
      find: findConversation,
      STATE: CONVERSATION_STATE,
    },
    knowledgeReader: { listKnowledge },
    memoryReader: { listArchive },
    norTypes: { NOR_TYPE, hasNorType, getNorTypeFieldSchema, listNorTypes },
    numbering: { suggestNextNumber },
  };
}
