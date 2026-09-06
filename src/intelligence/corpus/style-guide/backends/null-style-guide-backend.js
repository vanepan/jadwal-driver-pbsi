/* ============================================================
   NULL-STYLE-GUIDE-BACKEND.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   The inert default. Every call returns NOT_IMPLEMENTED — so importing the
   Style Guide facade has ZERO effect until a real backend (Memory for
   tests / DISABLED mode, or the staged server callable) is registered and
   made active. Mirrors null-corpus-backend.js / null-nor-registry-backend.js.
   ============================================================ */

'use strict';

import { STYLE_GUIDE_ERRORS, styleGuideFailure } from '../contracts/style-guide-store-contract.js';

export const NULL_STYLE_GUIDE_BACKEND_ID = 'null';
export const NULL_STYLE_GUIDE_BACKEND_VERSION = 'style-guide-null-backend@1';

const deny = (method) => styleGuideFailure(
  STYLE_GUIDE_ERRORS.NOT_IMPLEMENTED,
  `Style Guide backend "null" does not implement ${method}. Register a real backend first.`,
);

export const nullStyleGuideBackend = Object.freeze({
  id: NULL_STYLE_GUIDE_BACKEND_ID,
  version: NULL_STYLE_GUIDE_BACKEND_VERSION,
  list: () => deny('list'),
  get: () => deny('get'),
  proposeFromMemory: () => deny('proposeFromMemory'),
  approve: () => deny('approve'),
  reject: () => deny('reject'),
  deprecate: () => deny('deprecate'),
  resolve: () => deny('resolve'),
  history: () => deny('history'),
});
