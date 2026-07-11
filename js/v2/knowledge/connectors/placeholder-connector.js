/* ============================================================
   PLACEHOLDER-CONNECTOR.JS — Knowledge Connector (V2, Phase 9)

   PURPOSE: one factory shared by every inactive connector placeholder —
   mirrors ai-foundation/adapters/claude-adapter.js's stub pattern
   (predictable NOT_IMPLEMENTED, never throws, never fakes success) so the
   11 non-NOR sources named in the V2.0.2 brief are real, listable,
   structurally valid Connectors without any of them reading anything yet.

   RESPONSIBILITY: produce a Connector whose fetch() always returns a
   NOT_IMPLEMENTED ConnectorResult.

   DEPENDENCIES: contracts/connector-contract.js only.

   NON-GOALS: no source is read, no V1 module is imported. Activating one
   of these means replacing its `fetch` body with a real implementation
   (mirroring nor-connector.js's shape) — the id stays the same, so the
   registry entry does not change, only what queries it does.
   ============================================================ */

'use strict';

import { connectorFailure, CONNECTOR_ERRORS } from '../contracts/connector-contract.js';

/**
 * @param {string} id
 * @param {string} description
 * @returns {import('../contracts/connector-contract.js').Connector}
 */
export function makePlaceholderConnector(id, description) {
  function fetch(/* since */) {
    return connectorFailure(
      CONNECTOR_ERRORS.NOT_IMPLEMENTED,
      `The "${id}" connector is an inactive placeholder — no source is wired yet.`,
      { connectorId: id },
    );
  }
  return Object.freeze({
    id,
    version: `${id}-connector@0-stub`,
    description,
    fetch,
  });
}
