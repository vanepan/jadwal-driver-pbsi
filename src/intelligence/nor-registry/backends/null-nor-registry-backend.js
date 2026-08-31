/* ============================================================
   NULL-NOR-REGISTRY-BACKEND.JS — NOR Registry Foundation (V2, Phase 0)

   PURPOSE: the default, inert NOR Registry backend. Every method returns a
   typed NOT_IMPLEMENTED RegistryResult, so the facade is never backend-less
   and a caller written against nor-registry.js gets a predictable failure
   instead of a crash — the role NullRepository plays for the Knowledge
   Repository.

   RESPONSIBILITY: satisfy contracts/registry-contract.js's backend shape.

   DEPENDENCIES: intelligence/nor-registry/contracts/registry-contract.js.

   NON-GOALS: PURE — no Firebase, no persistence, no id generation. Phase 0
   ships ONLY this backend; a real one is a later phase.
   ============================================================ */

'use strict';

import { NOR_REGISTRY_ERRORS, registryFailure } from '../contracts/registry-contract.js';

export const NULL_NOR_REGISTRY_BACKEND_ID = 'null';
export const NULL_NOR_REGISTRY_BACKEND_VERSION = 'nor-registry-null-backend@1';

const notImplemented = (op) =>
  registryFailure(NOR_REGISTRY_ERRORS.NOT_IMPLEMENTED, `NOR Registry backend "${op}" is not implemented in Phase 0.`);

export const nullNorRegistryBackend = Object.freeze({
  id: NULL_NOR_REGISTRY_BACKEND_ID,
  version: NULL_NOR_REGISTRY_BACKEND_VERSION,
  register: () => notImplemented('register'),
  getById: () => notImplemented('getById'),
  list: () => notImplemented('list'),
  appendVersion: () => notImplemented('appendVersion'),
  publish: () => notImplemented('publish'),
  getHistory: () => notImplemented('getHistory'),
});
