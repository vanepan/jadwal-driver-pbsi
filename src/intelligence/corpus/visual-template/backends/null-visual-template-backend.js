/* ============================================================
   NULL-VISUAL-TEMPLATE-BACKEND.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   The inert default. Every call returns NOT_IMPLEMENTED — so importing the
   Visual Template facade has ZERO effect until a real backend (Memory for
   tests / DISABLED mode, or the staged server callable) is registered and
   made active. Mirrors null-style-guide-backend.js.
   ============================================================ */

'use strict';

import { VISUAL_TEMPLATE_ERRORS, visualTemplateFailure } from '../contracts/visual-template-store-contract.js';

export const NULL_VISUAL_TEMPLATE_BACKEND_ID = 'null';
export const NULL_VISUAL_TEMPLATE_BACKEND_VERSION = 'visual-template-null-backend@1';

const deny = (method) => visualTemplateFailure(
  VISUAL_TEMPLATE_ERRORS.NOT_IMPLEMENTED,
  `Visual Template backend "null" does not implement ${method}. Register a real backend first.`,
);

export const nullVisualTemplateBackend = Object.freeze({
  id: NULL_VISUAL_TEMPLATE_BACKEND_ID,
  version: NULL_VISUAL_TEMPLATE_BACKEND_VERSION,
  list: () => deny('list'),
  get: () => deny('get'),
  proposeFromEvidence: () => deny('proposeFromEvidence'),
  approve: () => deny('approve'),
  reject: () => deny('reject'),
  deprecate: () => deny('deprecate'),
  resolve: () => deny('resolve'),
  history: () => deny('history'),
});
