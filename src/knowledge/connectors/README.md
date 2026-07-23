# knowledge/connectors — 1 real connector (NOR), 11 inactive placeholders (Phase 9)

Every future connector is **read-only** over its source — this is the same
boundary already established in the audit's §2.5 ("Core Operations never
depends on Intelligence"). A connector that writes back into V1 violates the
contract by construction.

| Connector | Reads from (V1, read-only) | Status |
|---|---|---|
| `nor` | `js/petty-cash/petty-cash-store.js` (`getNors()`) via `js/petty-cash/nor-document-engine.js#buildNorViewModel` | **active** — `nor-connector.js` |
| `memorandum` | Approved Memorandum documents | inactive placeholder |
| `sop` | Standard Operating Procedure documents | inactive placeholder |
| `configuration` | `js/config/*`, `js/engineering/config/*`, `dispatch-policy-config.js`, etc. | inactive placeholder |
| `business_rules` | Existing validation/policy engines' rule definitions | inactive placeholder |
| `workflow` | Engineering's lifecycle graph, future modules' state machines | inactive placeholder |
| `analytics` | `js/analytics/*` outputs | inactive placeholder |
| `recommendation` | `js/recommendation/*` + `js/simulation/*` outputs | inactive placeholder |
| `operational_history` | Existing analytics models, decision-replay records | inactive placeholder |
| `policies` | Policy engine configuration | inactive placeholder |
| `templates` | `js/docs/template-registry.js` descriptors, `report-types.js` typedefs | inactive placeholder |
| `user_corrections` | Explicit human corrections | inactive placeholder |

This id list reconciles to the V2.0.2 brief's literal wording — it replaces
this README's earlier "Documents" grouping (which lumped NOR/Memorandum/SOP/
Internal Letters together and included an "Organizational Decisions" entry
the brief doesn't name). No code ever referenced that grouping, so the
rename was safe.

## Two different kinds of "inactive"

- The 11 placeholders (`connectors/placeholder-connector.js`'s factory) are
  **pure, zero-dependency, eagerly bootstrapped** by
  `registry/connector-registry.js` itself — importing anything from
  `knowledge/` registers them, and their `fetch()` always returns a
  predictable `NOT_IMPLEMENTED` `ConnectorResult`, mirroring
  `js/prediction/python-provider.js`.
- `nor-connector.js` is real but is **deliberately NOT bootstrapped by the
  registry** — it transitively imports `js/petty-cash/petty-cash-store.js`
  → `js/firebase.js`, which loads the real Firebase SDK from a CDN at
  module top-level. It self-registers at its own module load time instead,
  so it only activates when something deliberately imports it: this file's
  `index.js`, or `knowledge/builder/stages/index.js` (which wires it into
  the Builder pipeline as the `acquire-nor` stage). `knowledge/index.js`
  does not re-export either of those — see that barrel's own header.

## Activating a placeholder

Replace the placeholder's `fetch` body with a real implementation, following
`nor-connector.js`'s shape: read via existing `*-store.js` getters or a
`ctx`-shaped handoff, map to Draft-lifecycle `KnowledgeItem`s using
`contracts/identity-contract.js#generateKnowledgeId` for a deterministic id,
and (if the source has real side effects like Firebase) self-register at
the connector's own module load time rather than being added to
`connector-registry.js`'s bootstrap.
