/* ============================================================
   LEXICAL-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: fix the payload shapes for the four lexical `kind`s a
   KnowledgeItem can carry — Vocabulary, Terminology, Synonym, Alias — the
   smallest units of PBSI's learned language.

   RESPONSIBILITY: typedefs + structural validators only. `kind: 'vocabulary'`
   and `kind: 'terminology'` items carry a VocabularyEntry payload;
   `kind: 'vocabulary'` items whose payload lists `synonyms`/`aliases` reuse
   the same SynonymEntry/AliasEntry shape rather than introducing separate
   `kind`s — Synonym and Alias are payload SUB-shapes, not new registered
   kinds (avoids growing kind-registry.js for what is really one concept:
   "this vocabulary entry has known variants").

   DEPENDENCIES: none.

   NON-GOALS: no NOR-specific (or any domain-specific) vocabulary. No
   extraction/parsing logic — nothing here reads a real document. This is
   pure shape.

   FUTURE EVOLUTION: Phase 4+ connectors (Documents, User Corrections) will
   emit KnowledgeItems whose payload matches these shapes exactly, so the
   review workflow and repository never need to special-case a domain.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} SynonymEntry
 * @property {string} term
 * @property {number} [weight]    - 0-1, how strongly this term is interchangeable
 */

/**
 * @typedef {Object} AliasEntry
 * @property {string} term
 * @property {string} [reason]    - why this is treated as an alias (abbreviation, misspelling, regional term, ...)
 */

/**
 * Payload shape for `kind: 'vocabulary'` and `kind: 'terminology'`.
 * Terminology is distinguished from Vocabulary only by convention (domain
 * jargon vs. general word) — both share this exact payload shape.
 * @typedef {Object} VocabularyEntry
 * @property {string} term
 * @property {string} [definition]
 * @property {SynonymEntry[]} [synonyms]
 * @property {AliasEntry[]} [aliases]
 */

export function isVocabularyEntry(p) {
  return !!p && typeof p === 'object' && typeof p.term === 'string' && p.term.length > 0;
}

export function isSynonymEntry(p) {
  return !!p && typeof p === 'object' && typeof p.term === 'string' && p.term.length > 0;
}

export function isAliasEntry(p) {
  return !!p && typeof p === 'object' && typeof p.term === 'string' && p.term.length > 0;
}
