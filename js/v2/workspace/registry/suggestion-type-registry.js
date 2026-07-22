/* ============================================================
   SUGGESTION-TYPE-REGISTRY.JS — Live Word Workspace (V2, Phase 12.8.3)

   PURPOSE: make `suggestionType` a registered vocabulary value, never a
   hardcoded switch in workspace-suggestion-engine.js — mirrors
   knowledge/registry/domain-type-registry.js and
   body/registry/entity-type-registry.js exactly. Each entry also carries
   a `confidenceFloor` — the minimum confidence
   workspace-suggestion-engine.js will surface a suggestion of this type
   at, tunable here rather than hardcoded in the engine (Sprint 12.8.3's
   architecture review named "false-positive suggestion noise" as a real
   risk; this is the mitigation).

   REGISTRATION IS ENRICHMENT, NEVER A GATE — same discipline every
   registry in this platform follows: an unregistered suggestionType
   still works, at a conservative DEFAULT_CONFIDENCE_FLOOR, never
   rejected outright.

   RESPONSIBILITY: register/list/check suggestionType ids and their
   metadata. No suggestion-producing logic lives here.

   DEPENDENCIES: none.

   FUTURE EVOLUTION: a new suggestion type (e.g. a future Live Table
   layout suggestion) is a registry entry plus a case in
   workspace-suggestion-engine.js — this registry does not change shape
   to accommodate it.
   ============================================================ */

'use strict';

export const DEFAULT_CONFIDENCE_FLOOR = 0.6;

/** @type {Map<string, {id: string, label: string, sourceDomain: string, confidenceFloor: number}>} */
const _suggestionTypes = new Map();

export function registerSuggestionType(id, { label, sourceDomain, confidenceFloor = DEFAULT_CONFIDENCE_FLOOR }) {
  if (typeof id !== 'string' || !id) throw new Error('registerSuggestionType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerSuggestionType: label must be a non-empty string');
  if (typeof sourceDomain !== 'string' || !sourceDomain) throw new Error('registerSuggestionType: sourceDomain must be a non-empty string');
  if (typeof confidenceFloor !== 'number' || confidenceFloor < 0 || confidenceFloor > 1) throw new Error('registerSuggestionType: confidenceFloor must be 0-1');
  _suggestionTypes.set(id, Object.freeze({
    id, label, sourceDomain, confidenceFloor,
  }));
}

export function hasSuggestionType(id) {
  return _suggestionTypes.has(id);
}

export function getSuggestionType(id) {
  return _suggestionTypes.get(id) || null;
}

export function listSuggestionTypes() {
  return Object.freeze([..._suggestionTypes.values()]);
}

/** Registration is enrichment, never a gate — see header. */
export function confidenceFloorFor(id) {
  const t = getSuggestionType(id);
  return t ? t.confidenceFloor : DEFAULT_CONFIDENCE_FLOOR;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetSuggestionTypeRegistry() {
  _suggestionTypes.clear();
  bootstrap();
}

/* ── bootstrap: the suggestion types Sprint 12.8.4's first live wiring
   actually produces. Each new sourceDomain a future sprint wires adds
   entries here, never a new field on this registry itself. ──────────── */
function bootstrap() {
  registerSuggestionType('similar_document', { label: 'Dokumen serupa', sourceDomain: 'recognition', confidenceFloor: 0.6 });
  registerSuggestionType('repeated_pattern', { label: 'Pola berulang', sourceDomain: 'recognition', confidenceFloor: 0.6 });
  registerSuggestionType('organizational_terminology', { label: 'Istilah organisasi', sourceDomain: 'organizational-memory', confidenceFloor: 0.5 });
  registerSuggestionType('historical_decision', { label: 'Keputusan historis', sourceDomain: 'organizational-memory', confidenceFloor: 0.5 });
  registerSuggestionType('learning_recommendation', { label: 'Rekomendasi pembelajaran', sourceDomain: 'learning', confidenceFloor: 0.5 });
  registerSuggestionType('related_entity', { label: 'Entitas terkait', sourceDomain: 'body', confidenceFloor: 0.7 });
}

bootstrap();
