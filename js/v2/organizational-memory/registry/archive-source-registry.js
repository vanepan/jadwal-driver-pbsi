/* ============================================================
   ARCHIVE-SOURCE-REGISTRY.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: the process-wide directory of archive sources, mirroring
   knowledge/registry/connector-registry.js exactly — including its most
   important lesson (see that file's own NON-GOALS): the real `nor` source
   transitively loads the real Firebase SDK via a CDN import
   (js/petty-cash/petty-cash-store.js -> js/firebase.js) and must NOT be
   bootstrapped here, only self-registered when something deliberately
   imports it. The 3 placeholders (memorandum/sop/internal_letter — the
   domainTypes research confirmed have zero real V1 implementation) are
   pure and bootstrapped eagerly, same split as connector-registry.js's.

   RESPONSIBILITY: register/get/list archive sources.

   DEPENDENCIES: contracts/archive-source-contract.js,
   sources/{memorandum,sop,internal-letter}-archive-source.js (bootstrap
   only — NOT nor, see above).
   ============================================================ */

'use strict';

import { isArchiveSource } from '../contracts/archive-source-contract.js';
import { memorandumArchiveSource } from '../sources/memorandum-archive-source.js';
import { sopArchiveSource } from '../sources/sop-archive-source.js';
import { internalLetterArchiveSource } from '../sources/internal-letter-archive-source.js';

export const ARCHIVE_SOURCE_REGISTRY_ERRORS = Object.freeze({
  INVALID_SOURCE: 'INVALID_SOURCE',
});

/** @type {Map<string, object>} */
const _sources = new Map();

export function registerArchiveSource(source) {
  if (!isArchiveSource(source)) {
    const err = new Error('registerArchiveSource: source must satisfy { id, version, description, fetch() }.');
    err.code = ARCHIVE_SOURCE_REGISTRY_ERRORS.INVALID_SOURCE;
    throw err;
  }
  _sources.set(source.id, source);
  return source;
}

export function getArchiveSource(id) {
  return _sources.get(id) || null;
}

export function hasArchiveSource(id) {
  return _sources.has(id);
}

export function listArchiveSources() {
  return Object.freeze([..._sources.values()].map((s) => Object.freeze({ id: s.id, version: s.version, description: s.description || null })));
}

/** Test/teardown helper. Re-bootstraps the 3 pure placeholders (NOT nor —
 *  see this file's NON-GOALS). */
export function resetArchiveSourceRegistry() {
  _sources.clear();
  bootstrap();
}

function bootstrap() {
  registerArchiveSource(memorandumArchiveSource);
  registerArchiveSource(sopArchiveSource);
  registerArchiveSource(internalLetterArchiveSource);
}

bootstrap();
