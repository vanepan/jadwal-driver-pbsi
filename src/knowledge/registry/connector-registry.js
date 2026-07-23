/* ============================================================
   CONNECTOR-REGISTRY.JS — Knowledge Platform (V2, Phase 3 / Phase 9)

   PURPOSE: the single process-wide directory of knowledge connectors,
   mirroring the provider-registry pattern already proven in this codebase
   (js/prediction/prediction-provider.js, js/engineering/providers/
   provider-registry.js) — reused rather than reinvented (Decision 2).

   RESPONSIBILITY: register/get/list connectors against the Connector
   contract (contracts/connector-contract.js). Holds no connector logic.

   DEPENDENCIES: knowledge/contracts/connector-contract.js,
   knowledge/connectors/placeholder-connector.js + the 11 placeholder
   connector modules, and connectors/manual-file-connector.js (V2.1,
   Knowledge Acquisition Operational Readiness — the one REAL connector
   bootstrapped here rather than self-registering, since it has zero V1/
   Firebase dependency, same reasoning that keeps the 11 placeholders
   here too — see NON-GOALS for why `nor` is deliberately NOT among
   them).

   NON-GOALS: does NOT import or register `nor-connector.js` here. Unlike
   the 11 placeholders (pure, zero dependencies), the NOR connector
   transitively imports js/petty-cash/petty-cash-store.js -> js/firebase.js,
   which loads the real Firebase SDK from a CDN at module top-level —
   importing it eagerly from this registry would mean every future caller
   of knowledge/index.js (which re-exports this registry) silently loads
   live Firebase machinery just by touching a contract. `nor-connector.js`
   self-registers at ITS OWN module load time instead (see that file's
   bottom) — it is only pulled in by something that deliberately wants
   NOR active: knowledge/connectors/index.js, or
   knowledge/builder/stages/index.js. This keeps the platform dormant
   (Decision: js/v2/README.md's dormancy rule) for every caller that
   doesn't explicitly opt into NOR.

   FUTURE EVOLUTION: activating a placeholder connector means replacing its
   `fetch` body (connectors/<name>-connector.js) — this registry does not
   change. A future connector with real V1 dependencies should follow
   nor-connector.js's self-registration pattern, not this file's bootstrap.
   ============================================================ */

'use strict';

import { isConnector } from '../contracts/connector-contract.js';
import { manualFileConnector } from '../connectors/manual-file-connector.js';
import { memorandumConnector } from '../connectors/memorandum-connector.js';
import { sopConnector } from '../connectors/sop-connector.js';
import { configurationConnector } from '../connectors/configuration-connector.js';
import { businessRulesConnector } from '../connectors/business-rules-connector.js';
import { workflowConnector } from '../connectors/workflow-connector.js';
import { analyticsConnector } from '../connectors/analytics-connector.js';
import { recommendationConnector } from '../connectors/recommendation-connector.js';
import { operationalHistoryConnector } from '../connectors/operational-history-connector.js';
import { policiesConnector } from '../connectors/policies-connector.js';
import { templatesConnector } from '../connectors/templates-connector.js';
import { userCorrectionsConnector } from '../connectors/user-corrections-connector.js';

export const CONNECTOR_REGISTRY_ERRORS = Object.freeze({
  INVALID_CONNECTOR: 'INVALID_CONNECTOR',
  UNKNOWN_CONNECTOR: 'UNKNOWN_CONNECTOR',
});

/** @type {Map<string, object>} */
const _connectors = new Map();

/**
 * Idempotent per id (re-registering the same id replaces it).
 * Throws INVALID_CONNECTOR for a malformed connector (a programmer error).
 */
export function registerConnector(connector) {
  if (!isConnector(connector)) {
    const err = new Error('registerConnector: connector must satisfy { id, version, description, fetch() }.');
    err.code = CONNECTOR_REGISTRY_ERRORS.INVALID_CONNECTOR;
    throw err;
  }
  _connectors.set(connector.id, connector);
  return connector;
}

export function getConnector(id) {
  return _connectors.get(id) || null;
}

export function hasConnector(id) {
  return _connectors.has(id);
}

/** A frozen summary of every registered connector (no `fetch` fn). */
export function listConnectors() {
  return Object.freeze([..._connectors.values()].map((c) => Object.freeze({
    id: c.id,
    version: c.version,
    description: c.description || null,
  })));
}

/** Test/teardown helper. Re-bootstraps the 11 pure placeholders (NOT nor —
 *  callers that need `nor` registered must import nor-connector.js, or
 *  connectors/index.js, themselves; see this file's NON-GOALS). */
export function resetConnectorRegistry() {
  _connectors.clear();
  bootstrap();
}

/* ── bootstrap: the 11 inactive, dependency-free placeholders named in the
   V2.0.2 brief — registered as real objects, mirroring prediction-
   provider.js's own built-in registration at the bottom of that file.
   `nor` is deliberately excluded (see NON-GOALS above). ────────────────── */
function bootstrap() {
  registerConnector(manualFileConnector);
  registerConnector(memorandumConnector);
  registerConnector(sopConnector);
  registerConnector(configurationConnector);
  registerConnector(businessRulesConnector);
  registerConnector(workflowConnector);
  registerConnector(analyticsConnector);
  registerConnector(recommendationConnector);
  registerConnector(operationalHistoryConnector);
  registerConnector(policiesConnector);
  registerConnector(templatesConnector);
  registerConnector(userCorrectionsConnector);
}

bootstrap();
