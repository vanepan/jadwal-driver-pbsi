/* ============================================================
   DOMAIN-TYPE-REGISTRY.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: make `domainType` a registered vocabulary value, never a
   hardcoded enum baked into the repository or lifecycle core (Decision 1,
   architecture doc §4.2.1). Adding a new domain — Executive Intelligence, a
   brand-new document type — must be a registry entry here, nothing else.

   RESPONSIBILITY: register/list/check domainType ids and their labels. No
   domainType-specific behavior lives here — this is vocabulary, not logic.

   DEPENDENCIES: none.

   NON-GOALS: no connector logic, no repository logic. This module does not
   know what a NOR or a Memorandum IS — only that those ids are registered.

   FUTURE EVOLUTION: Phase 4+ connectors will look up `hasDomainType()`
   before emitting a KnowledgeItem, so a connector can never emit an
   unregistered domainType silently.
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string}>} */
const _domainTypes = new Map();

/**
 * @param {string} id     e.g. 'nor'
 * @param {string} label  e.g. 'Nota Organisasi Realisasi'
 */
export function registerDomainType(id, label) {
  if (typeof id !== 'string' || !id) throw new Error('registerDomainType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerDomainType: label must be a non-empty string');
  _domainTypes.set(id, Object.freeze({ id, label }));
}

export function hasDomainType(id) {
  return _domainTypes.has(id);
}

export function getDomainType(id) {
  return _domainTypes.get(id) || null;
}

export function listDomainTypes() {
  return Object.freeze([..._domainTypes.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetDomainTypeRegistry() {
  _domainTypes.clear();
  bootstrap();
}

/* ── bootstrap: the domainTypes named as first-class in the architecture
   doc's Decision 1 — registered as data, not as branches of logic. ────────── */
function bootstrap() {
  registerDomainType('nor', 'Nota Organisasi Realisasi');
  registerDomainType('memorandum', 'Memorandum');
  registerDomainType('sop', 'Standard Operating Procedure');
  registerDomainType('internal_letter', 'Internal Letter');
  registerDomainType('engineering', 'Engineering Operations');
  registerDomainType('request', 'Request');
  registerDomainType('petty_cash', 'Petty Cash');
  registerDomainType('executive_intelligence', 'Executive Intelligence');
}

bootstrap();
