/* ============================================================
   INDEX.JS — Knowledge Connectors public barrel (V2, Phase 9)

   PURPOSE: single, explicit, opt-in entry point for every connector,
   NOR included. The 11 placeholders are already registered by
   connector-registry.js's own bootstrap (they are pure, zero-dependency);
   importing this file is what registers `nor` (see nor-connector.js's
   self-registration at its own bottom, and connector-registry.js's
   NON-GOALS for why NOR is deliberately not in that registry's bootstrap).

   RESPONSIBILITY: re-export only. Deliberately NOT re-exported by
   knowledge/index.js — importing THIS file is the deliberate act that
   pulls in NOR's real Firebase-backed V1 dependency chain; the platform
   core barrel stays dormant/side-effect-free.

   DEPENDENCIES: every module under knowledge/connectors/.
   ============================================================ */

'use strict';

export { norConnector, NOR_CONNECTOR_ID, norSource } from './nor-connector.js';
export { memorandumConnector } from './memorandum-connector.js';
export { sopConnector } from './sop-connector.js';
export { configurationConnector } from './configuration-connector.js';
export { businessRulesConnector } from './business-rules-connector.js';
export { workflowConnector } from './workflow-connector.js';
export { analyticsConnector } from './analytics-connector.js';
export { recommendationConnector } from './recommendation-connector.js';
export { operationalHistoryConnector } from './operational-history-connector.js';
export { policiesConnector } from './policies-connector.js';
export { templatesConnector } from './templates-connector.js';
export { userCorrectionsConnector } from './user-corrections-connector.js';
export { makePlaceholderConnector } from './placeholder-connector.js';
