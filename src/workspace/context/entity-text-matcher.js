/* ============================================================
   ENTITY-TEXT-MATCHER.JS — Live Word Workspace (V2, Phase 12.8.x Sprint 2)

   PURPOSE: "Live Entity Recognition... without explicit tagging," realized
   the ONLY way this platform's own invariants allow: deterministic,
   case-insensitive, exact-substring matching of block text against
   vocabulary this platform ALREADY knows (real Body entity attributes,
   real Organizational Memory terminology) — never NLP, never an AI model,
   never a guess. Recognition's own README states "Structural, not
   Semantic — no NLP anywhere" as a platform-wide invariant; this file
   extends that same restraint to free text instead of structured records.

   RESPONSIBILITY: buildVocabulary({body, organizationalMemory}) — turns
   already-real context pieces workspace-context-builder.js already
   computed into a flat, deduped term list; matchEntityMentions(text,
   vocabulary) — pure, returns every vocabulary term literally present in
   `text`, case-insensitive, word-boundary-respecting (never a partial
   word match — "Toyota" must not match inside "Toyotaland").

   DEPENDENCIES: none — a pure leaf. Reads only the ALREADY-COMPUTED
   shapes buildBodyContext()/computeOrganizationalMemory() already return;
   never re-fetches anything itself.

   NON-GOALS: no fuzzy matching, no stemming, no synonyms, no scoring
   model. A term below MIN_TERM_LENGTH is never matched (a 1-2 character
   vocabulary entry would false-positive constantly) — an honest, small,
   tunable floor, not a hidden heuristic.

   HONEST CAVEAT: Body ships Phase 12.5 with zero real sensors ever having
   run in most environments, and Organizational Memory's terminology
   depends on real archived documents already existing. This file is real
   and tested — it will genuinely match text against WHATEVER vocabulary
   it's given — but the vocabulary itself may be empty until those
   upstream domains have real data, same honesty every other Phase 12.8
   suggestion source already carries.
   ============================================================ */

'use strict';

const MIN_TERM_LENGTH = 3;

/** Common attribute keys a sensed Body Entity's `attributes` bag might
 *  carry a human-readable name/identifier under — checked defensively
 *  since `attributes` is intentionally opaque/entityType-shaped (see
 *  body/contracts/entity-contract.js's own header), never assumed to
 *  have one fixed schema across every entityType. */
const NAME_LIKE_ATTRIBUTE_KEYS = Object.freeze(['name', 'plateNumber', 'employeeName', 'label', 'title']);

/**
 * @param {{body: object|null, organizationalMemory: object|null}} context
 * @returns {Array<{term: string, sourceType: 'body'|'organizational-memory', refId: string|null, entityType: string|null}>}
 */
export function buildVocabulary({ body, organizationalMemory }) {
  const terms = [];
  const seen = new Set();

  const add = (term, sourceType, refId, entityType = null) => {
    if (typeof term !== 'string') return;
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ term: trimmed, sourceType, refId, entityType });
  };

  for (const entity of (body && body.entities) || []) {
    for (const key of NAME_LIKE_ATTRIBUTE_KEYS) {
      const value = entity.attributes && entity.attributes[key];
      if (typeof value === 'string') add(value, 'body', entity.id, entity.entityType);
    }
  }

  for (const term of (organizationalMemory && organizationalMemory.commonTerminology) || []) {
    add(term.value, 'organizational-memory', null, null);
  }

  return terms;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic, case-insensitive, word-boundary substring matching —
 * see this file's header for exactly what this does and does not do.
 * @param {string} text
 * @param {Array<{term: string, sourceType: string, refId: string|null, entityType: string|null}>} vocabulary
 * @returns {Array<{term: string, sourceType: string, refId: string|null, entityType: string|null}>}
 */
export function matchEntityMentions(text, vocabulary) {
  if (typeof text !== 'string' || !text.trim() || !vocabulary || !vocabulary.length) return [];
  const matches = [];
  for (const entry of vocabulary) {
    const pattern = new RegExp(`(?:^|\\b)${escapeRegExp(entry.term)}(?:\\b|$)`, 'i');
    if (pattern.test(text)) matches.push(entry);
  }
  return matches;
}
