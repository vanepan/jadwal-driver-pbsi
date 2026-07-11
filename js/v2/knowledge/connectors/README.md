# knowledge/connectors — zero connectors implemented (Phase 3)

This directory intentionally contains **no code**. It exists to document
the multi-source seam (Decision 2, architecture doc §4.2.2) that Phase 4+
will fill in, one file per connector, each registered against
`knowledge/registry/connector-registry.js` and conforming to
`knowledge/contracts/connector-contract.js`.

| Connector | Would read from (existing V1 code, read-only) | Status |
|---|---|---|
| Documents | Approved NOR/Memorandum/SOP/Internal Letters | not started |
| Configuration | `js/config/*`, `js/engineering/config/*`, `dispatch-policy-config.js`, etc. | not started |
| Business Rules | Existing validation/policy engines' rule definitions | not started |
| Operational History | Existing analytics models, decision-replay records | not started |
| Analytics | `js/analytics/*` outputs | not started |
| Recommendation Engines | `js/recommendation/*` + `js/simulation/*` outputs | not started |
| Workflow Definitions | Engineering's lifecycle graph, future modules' state machines | not started |
| User Corrections | Explicit human corrections | not started |
| Organizational Decisions | Approved decisions (e.g. this architecture doc, once approved) | not started |
| Templates | `js/docs/template-registry.js` descriptors, `report-types.js` typedefs | not started |
| Policies | Policy engine configuration | not started |

Every future connector is **read-only** over its source — this is the same
boundary already established in the audit's §2.5 ("Core Operations never
depends on Intelligence"). A connector that writes back into V1 violates the
contract by construction.

Per the architecture doc's §4.4, the first pilot connector work (Phase 4+,
not Phase 3) is expected to be the Documents connector against NOR's
existing template *code* (there is no historical filled-document corpus to
mine), with acceptance criteria recommended — but not yet decided — to also
exercise a second, structurally different `domainType` in the same phase.
