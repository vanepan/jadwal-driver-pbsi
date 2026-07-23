/* ============================================================
   KNOWLEDGE-REHYDRATION-ENGINE.JS — Autonomous Pipeline Integration (Phase 2.5)

   PURPOSE: make the in-memory knowledge repository a deterministic
   PROJECTION of the persisted Import Sessions, so imported Knowledge
   survives a browser refresh (and appears in another tab that hydrated the
   sessions from RTDB) WITHOUT a second persisted store. The Import Session
   remains the single source of truth; the KnowledgeItem is reconstructed
   from it, never independently persisted — so there is no duplicated cache
   and no second authority to keep in sync.

   WHY THIS IS NEEDED: Import Sessions are RTDB-persisted and rehydrate on
   load; the KnowledgeItems they produced are NOT (the knowledge repo is
   in-memory by the established architecture). Before this, a refresh left
   the sessions intact but Knowledge Center/Learning Dashboard empty. This
   engine closes that gap by replaying the session→knowledge derivation.

   DETERMINISM & IDEMPOTENCE: the reconstructed item id is the SAME
   deterministic id markKnowledgeImported() already stamped
   (generateKnowledgeId over the session) — so a re-run skips any item that
   already exists (getById ok). Running it repeatedly (on every session
   hydration) is therefore safe and cheap after the first pass. It NEVER
   fabricates content: a session with no real content facts is skipped, not
   invented.

   HUMAN GATE PRESERVED: reconstructed items land as DRAFT (via the
   connector's own canonical mapping) exactly like a live import — nothing
   is auto-approved (Decision 6). Coverage/Pattern Discovery (Approved-only)
   are unaffected until a human approves.

   RESPONSIBILITY: rehydrateKnowledgeFromSessions() only.

   DEPENDENCIES: ./import-session-engine.js (listImportSessions,
   hasContentFacts), ./contracts/import-session-contract.js
   (IMPORT_SESSION_STATE), ../../connectors/manual-file-connector.js
   (buildManualFileKnowledgeItem — the ONE canonical item shape, reused not
   duplicated), ../../repository/knowledge-repository.js (getById/create —
   the facade, whose create() fires the Repository Event the dashboards
   subscribe to).
   ============================================================ */

'use strict';

import { listImportSessions, hasContentFacts } from './import-session-engine.js';
import { IMPORT_SESSION_STATE } from './contracts/import-session-contract.js';
import { buildManualFileKnowledgeItem } from '../../connectors/manual-file-connector.js';
// Phase 3 — a CLIENT of the Knowledge Service. createDraft() is idempotent by
// id (an item that already exists is returned untouched), which is exactly the
// guarantee this projection needs and used to hand-roll with a getById probe.
import { getKnowledge, createDraft } from '../../services/knowledge-service.js';

/**
 * Reconstructs any missing Draft KnowledgeItem from the persisted Import
 * Sessions that have reached Knowledge Imported / Archived and carry real
 * content facts. Idempotent, deterministic, side-effect-only-on-the-
 * knowledge-repo (each create fires one Repository Event → subscribed
 * dashboards refresh).
 * @returns {{ok: boolean, created: number, skipped: number, ineligible: number}}
 */
export function rehydrateKnowledgeFromSessions() {
  const result = listImportSessions({});
  const sessions = result.ok ? result.data : [];
  let created = 0;
  let skipped = 0;
  let ineligible = 0;

  for (const s of sessions) {
    // Only sessions that genuinely produced Knowledge, with a real id and
    // real content — never fabricate an item for an in-flight or
    // facts-less session.
    const producedKnowledge = s.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED || s.state === IMPORT_SESSION_STATE.ARCHIVED;
    if (!producedKnowledge || !s.knowledgeItemId || !hasContentFacts(s)) { ineligible += 1; continue; }

    // Idempotent — the item id is deterministic and equals s.knowledgeItemId.
    if (getKnowledge(s.knowledgeItemId).ok) { skipped += 1; continue; }

    const item = buildManualFileKnowledgeItem({
      importSessionId: s.id,
      domainType: s.domainType,
      kind: s.knowledgeKind,
      facts: s.manualEntryFacts,
      parsedContent: s.parsedContent,
    });
    if (createDraft(item).ok) created += 1;
  }

  return { ok: true, created, skipped, ineligible };
}
