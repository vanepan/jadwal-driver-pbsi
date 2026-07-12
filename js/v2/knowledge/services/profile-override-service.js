/* ============================================================
   PROFILE-OVERRIDE-SERVICE.JS — Knowledge Services (V2.1)

   PURPOSE: the one public surface for the editable Organizational Profile
   Override layer, same idiom as review-service.js — pure re-export.

   DEPENDENCIES: knowledge/profiles/overrides/profile-override-engine.js,
   knowledge/profiles/overrides/profile-override-merge-engine.js.
   ============================================================ */

'use strict';

export {
  createOverrideDraft,
  promoteOverrideToCandidate,
  canSubmitOverrideForReview,
  submitOverrideForReview,
  approveOverride,
  rejectOverride,
  rollbackOverride,
  getOverride,
  listOverrides,
  getOverrideHistory,
} from '../profiles/overrides/profile-override-engine.js';

export {
  getEffectiveProfile,
  listApprovedOverrides,
} from '../profiles/overrides/profile-override-merge-engine.js';

export {
  PROFILE_OVERRIDE_TYPE,
  STANDALONE_OVERRIDE_TYPES,
  OVERRIDE_ACTION,
  OVERRIDE_PAYLOAD_SHAPE,
  isOverlayType,
  isStandaloneType,
} from '../profiles/overrides/contracts/profile-override-contract.js';
