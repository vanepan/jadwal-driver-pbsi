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
     retrieval      → Phase 6: the ONE certified retrieval boundary
                      (src/intelligence/retrieval + src/intelligence/generation).
                      Composes retrieveNorContext over the approved Style
                      Guide + Visual Template stores (read-only) then the
                      Phase 6 gate. With the Null backends active (the
                      default) each domain is `unavailable` ⇒ the gate
                      BLOCKS — the only safe default until a server-owned
                      retrieval port is injected (js/intelligence-backend-wiring.js).

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
import { listStyleRules } from '../corpus/style-guide/style-guide-store.js';
import { listVisualTemplates } from '../corpus/visual-template/visual-template-store.js';
import { retrieveNorContext } from '../retrieval/nor-context-retrieval.js';
import { buildGenerationContext } from '../generation/build-generation-context.js';
import { GENERATION_MODE } from '../generation/contracts/generation-context-contract.js';

/** Phase 6 — the default certified-retrieval → generation-context port.
 *  Reads the APPROVED Style Guide + Visual Template stores (read-only),
 *  runs the PURE retrieveNorContext composer, then the PURE Phase 6 gate.
 *  A store whose `list` is `!ok` ⇒ `null` for that domain ⇒ `unavailable`
 *  ⇒ the gate BLOCKS (never silently `[]`). With the Null backends active
 *  (the default) BOTH domains are `unavailable` and the gate blocks — the
 *  only safe default. A server-owned retrieval (the STAGED
 *  intelligenceNorGeneration callable) replaces this port in production. */
async function defaultBuildGenerationContext({ documentType, categories, slots, regionKinds, mode, at } = {}) {
  let styleRules = null;
  let visualTemplates = null;
  try {
    const res = await listStyleRules({});
    styleRules = res && res.ok && Array.isArray(res.data) ? res.data : null;
  } catch { styleRules = null; }
  try {
    const res = await listVisualTemplates({});
    visualTemplates = res && res.ok && Array.isArray(res.data) ? res.data : null;
  } catch { visualTemplates = null; }
  const retrievalContext = retrieveNorContext(
    { styleRules, visualTemplates },
    { documentType, categories, slots, regionKinds },
    { at: at || new Date().toISOString() },
  );
  return buildGenerationContext(retrievalContext, {
    mode: mode || GENERATION_MODE.INTELLIGENCE,
    at: at || new Date().toISOString(),
  });
}

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
    retrieval: { buildGenerationContext: defaultBuildGenerationContext },
  };
}
