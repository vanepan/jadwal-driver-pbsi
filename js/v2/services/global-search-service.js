/* ============================================================
   GLOBAL-SEARCH-SERVICE.JS — Experience Architecture phase (Part 5)

   PURPOSE: "users should not need to remember where Knowledge lives, where
   Archive lives, where Learning lives" — ONE query, over data that already
   exists in three real services. This file computes NOTHING new and stores
   NOTHING: every result comes straight from an existing list/search call,
   filtered client-side by a plain case-insensitive substring match — the
   exact same discipline organizational-memory/repository/archive-
   repository.js#search already uses (no fuzzy scoring invented here, no
   new index, no duplicated data).

   RESPONSIBILITY: globalSearch(query).

   DEPENDENCIES: knowledge/datasets/import-session/import-session-engine.js
   (listImportSessions), organizational-memory/services/archive-service.js
   (searchArchive, reused verbatim), knowledge/services/knowledge-service.js
   (listKnowledge).

   NON-GOALS: no ranking model, no relevance score, no new storage. A
   result set with nothing in it is a real, honest empty answer — never
   padded to look non-empty.
   ============================================================ */

'use strict';

import { listImportSessions } from '../knowledge/datasets/import-session/import-session-engine.js';
import { searchArchive } from '../../../src/organizational-memory/services/archive-service.js';
import { listKnowledge } from '../knowledge/services/knowledge-service.js';

const RESULT_CAP_PER_KIND = 8;

function safeList(result) {
  return result && result.ok ? result.data : [];
}

/**
 * @param {string} query
 * @returns {{query: string, documents: object[], archive: object[], knowledge: object[], total: number}}
 */
export function globalSearch(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { query: '', documents: [], archive: [], knowledge: [], total: 0 };

  // Documents — real Import Sessions, matched on their real filename.
  const sessions = safeList(listImportSessions({}));
  const documents = sessions
    .filter((s) => typeof s.filename === 'string' && s.filename.toLowerCase().includes(q))
    .slice(0, RESULT_CAP_PER_KIND);

  // Archive — reuses the real, existing search() unchanged (documentNumber/id).
  const archiveResult = searchArchive(query);
  const archive = safeList(archiveResult).slice(0, RESULT_CAP_PER_KIND);

  // Knowledge — id, kind, or its (opaque, kind-dependent) payload's real
  // stringified content. A pragmatic, honest substring match over real
  // stored data — never a parse of a shape this layer isn't meant to know.
  const knowledgeItems = safeList(listKnowledge({}));
  const knowledge = knowledgeItems.filter((k) => {
    if (typeof k.id === 'string' && k.id.toLowerCase().includes(q)) return true;
    if (typeof k.kind === 'string' && k.kind.toLowerCase().includes(q)) return true;
    try { return JSON.stringify(k.payload ?? '').toLowerCase().includes(q); } catch { return false; }
  }).slice(0, RESULT_CAP_PER_KIND);

  return {
    query: q, documents, archive, knowledge,
    total: documents.length + archive.length + knowledge.length,
  };
}
