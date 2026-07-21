/* ============================================================
   NULL-REPOSITORY.JS — Recognition Foundation Repository (Phase 12.7.1)

   PURPOSE: the honest default backend — every read returns "not found",
   every write honestly fails NOT_IMPLEMENTED. Mirrors body/repository/
   implementations/null-repository.js exactly. Active by default so a
   caller that forgets to configure a real backend gets a loud, honest
   failure instead of silently believing data is being kept when it isn't.

   RESPONSIBILITY: implement every Repository method as an honest no-op.

   DEPENDENCIES: ../contracts/repository-contract.js.
   ============================================================ */

'use strict';

import { REPOSITORY_ERRORS, repositoryFailure, repositorySuccess } from '../contracts/repository-contract.js';

export const NULL_REPOSITORY_ID = 'null';
export const NULL_REPOSITORY_VERSION = 'recognition-null-repository@1';

function notImplemented(method) {
  return repositoryFailure(REPOSITORY_ERRORS.NOT_IMPLEMENTED, `NullRepository#${method}: no real backend configured.`);
}

export const nullRepository = Object.freeze({
  id: NULL_REPOSITORY_ID,
  version: NULL_REPOSITORY_VERSION,
  getById: () => repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, 'NullRepository: nothing is ever found.'),
  getVersion: () => repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, 'NullRepository: nothing is ever found.'),
  list: () => repositorySuccess([]),
  create: () => notImplemented('create'),
  appendVersion: () => notImplemented('appendVersion'),
  getHistory: () => repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, 'NullRepository: nothing is ever found.'),
  getMetrics: () => repositorySuccess({ totalRecords: 0, byRecordType: {} }),
});

export default nullRepository;
