# knowledge/language/ — Knowledge Language Foundation (Phase 3.5, dormant)

## Purpose

The internal vocabulary every future Knowledge component speaks. Not a
builder, not a repository — the SHAPES that flow through both. Every
`kind` a KnowledgeItem can carry (`registry/kind-registry.js`) has its
payload shape defined here, domain-agnostically.

## Responsibility

Six contract files, grouped by concept family rather than one file per
noun (to avoid 20+ near-empty files for what are really six shape
families):

| File | Covers |
|---|---|
| `contracts/lexical-contract.js` | Vocabulary, Terminology, Synonym, Alias |
| `contracts/taxonomy-contract.js` | Tag, Category, Domain (Domain reuses `domain-type-registry.js` — not re-registered) |
| `contracts/pattern-contract.js` | Sentence Pattern, Paragraph Pattern, Template Pattern, Structure Pattern |
| `contracts/reference-contract.js` | Reference, Source (`KnowledgeSource`) |
| `contracts/metadata-contract.js` | Metadata, Policy |
| `contracts/statistics-confidence-contract.js` | Statistics, Confidence (banding reuses `js/services/unified-scoring.js`) |

Six concepts are deliberately **not** duplicated here because Phase 3
already defined them and this layer just reuses them:

| Concept | Already defined in |
|---|---|
| Identity, Version | `knowledge/contracts/identity-contract.js` |
| Dependency, Relationship | `knowledge/contracts/dependency-graph-contract.js` |
| Review, Approval | `knowledge/contracts/review-contract.js` |
| History, Lifecycle | `knowledge/contracts/lifecycle-contract.js` + repository's `getHistory` |
| Weight | `knowledge/contracts/source-weight-contract.js` |

Every new payload-shape validator (`isVocabularyEntry`, `isPatternEntry`,
`isKnowledgeSource`, `isPolicyEntry`, `isStatisticEntry`, etc.) lives beside
its contract, matching the pattern already established in Phase 3
(`isKnowledgeItem`, `isConnector`, `isRelationshipPayload`). `examples.js`
holds one frozen, obviously-fake example per shape for future connector
authors and tests to copy.

## Dependencies

- `statistics-confidence-contract.js` reuses `js/services/unified-scoring.js`
  (pure, no DOM/Firebase) for confidence banding — the one place this layer
  reaches into V1, and only for a pure re-expression helper, never business
  logic.
- Everything else has zero dependencies outside this folder.

## Non-goals

- No domain-specific vocabulary (no NOR-specific term is seeded).
- No parser, no extraction, no builder logic — see `knowledge/builder/`
  (Phase 4) for where a real Documents connector will eventually populate
  these shapes.
- No new registry duplicating `domain-type-registry.js` or
  `kind-registry.js` — `paragraph_pattern` and `policy` were added to the
  existing `kind-registry.js` bootstrap (a data addition), not a new file.

## Future evolution

Phase 4+ connectors emit real `KnowledgeItem`s whose `payload` matches these
shapes; Phase 7+ Document Intelligence reads Approved items of these kinds
to explain "how PBSI writes" without ever generating content itself in this
phase.
