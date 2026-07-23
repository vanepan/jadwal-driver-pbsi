/* ============================================================
   WORKSPACE-FLAGS.JS — Live Word Workspace (V2, Phase 12.8.4)

   PURPOSE: the ONE kill switch gating whether ui/review-workspace.js
   renders the Live Suggestion panel — CLAUDE.md's "every sprint must
   produce... feature gated" mandate, realized as a single, greppable
   boolean rather than a second copy of feature-gates.js's allowlist
   logic. The whole V2 platform is already pilot-gated to one admin user
   (js/config/feature-gates.js#isV2Enabled) — this is a SECOND, narrower
   gate one level inside that one, so Sprint 12.8.4's first live
   cross-domain wiring (Body + Recognition + Learning composed together,
   for the first time anywhere in this platform) can merge and ship
   completely dark, then be switched on deliberately, independent of any
   other V2 pilot-access decision.

   RESPONSIBILITY: WORKSPACE_LIVE_SUGGESTIONS_ENABLED (default false) and
   a setter for tests.

   DEPENDENCIES: none.

   NON-GOALS: not a role/permission check — see workspace/README.md
   "Workspace Permissions": authorization is still V1's existing role
   system plus isV2Enabled(), unchanged. This flag only answers "is the
   suggestion panel switched on at all," never "may THIS user see it."
   ============================================================ */

'use strict';

export let WORKSPACE_LIVE_SUGGESTIONS_ENABLED = false;

/** Test/ops helper — ESM live bindings mean importers see the update. */
export function setWorkspaceLiveSuggestionsEnabled(value) {
  WORKSPACE_LIVE_SUGGESTIONS_ENABLED = !!value;
}
