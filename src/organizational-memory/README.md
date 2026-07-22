# organizational-memory/ — Organizational Memory Foundation (V2.0.7, Phase 10)

## Where this sits

Per the frozen architecture:

```
Official Documents -> Knowledge Acquisition -> Knowledge Repository -> Organizational Memory -> Applications
```

Organizational Memory is downstream of Knowledge, not a replacement for
it. A **KnowledgeItem** (`knowledge/contracts/knowledge-item-contract.js`)
is an extracted structural fact with a Draft→Approved curation lifecycle.
An **ArchiveRecord** (`contracts/archive-record-contract.js`) is the
organizational record of the document itself — its number, its "Dari"
(origin), its hash, whether it has contributed Knowledge yet. Different
axis, same source documents, cross-referenced (`knowledge-contribution-engine.js`)
rather than duplicated.

## Grounding: what's real vs. what would be fabricated

Before writing any code, this milestone researched the actual V1 surface
so nothing here invents data or capability that doesn't exist:

- **"Dari:"** is real — `settings.senderTitle`
  (`js/petty-cash/petty-cash-config.js`'s `DEFAULT_SETTINGS`), a single
  **global** org setting snapshotted onto every NOR at generation time.
  It is NOT per-document or per-department. `senderOrigin` reuses it
  honestly — today it classifies every archived NOR into one group, and
  will become meaningful the moment the underlying V1 setting becomes
  per-document. This is documented, not silently worked around.
- **Only NOR has a real V1 store.** `memorandum`, `sop`, and
  `internal_letter` are registered vocabulary only — confirmed zero
  templates, zero stores, zero generation code anywhere in the repo.
  `sources/` mirrors `knowledge/connectors/`'s exact split: one real
  source (`nor`) plus placeholders for the rest, returning
  `NOT_IMPLEMENTED` honestly rather than pretending to archive nothing.
- **No auto-numbering exists** — `norNumber` is free-text
  (`petty-cash-service.js#generateNor()` only checks non-empty).
  `numbering-engine.js` infers a pattern from real archived numbers
  instead of assuming one; confidence is honestly `0` when no consistent
  pattern exists, never a fabricated default.
- **No hash/dedup/file-upload mechanism exists anywhere in this
  codebase** — confirmed zero Firebase Storage usage. `document-hash.js`
  is genuinely new (a dependency-free FNV-1a fingerprint). "Original
  Document Archive" is scoped honestly to an **immutable snapshot of the
  source record's identifying fields** (`sourceSnapshot`), not a binary
  file — there is no file to store. "Upload Missing NOR" is scoped to a
  **workflow status marker** (`gap-workflow-engine.js`) a future UI can
  wire a real upload button to — building actual file-upload
  infrastructure now would mean introducing a new persistence strategy
  and almost certainly touching V1, both outside this milestone's bounds.

## What's here

| Concern | File | Reuses |
|---|---|---|
| Digital Archive / Metadata Repository | `repository/archive-repository.js` | `identity-contract.js#nextVersion` (append-only, same invariant as KnowledgeItem) |
| Archive Source (Connector-equivalent) | `contracts/archive-source-contract.js`, `sources/*.js` | mirrors `connector-contract.js`'s exact shape |
| Digital Archive ingestion | `archive-ingestion-engine.js` | mirrors `acquisition-engine.js`'s create-or-appendVersion shape |
| Document Hash | `document-hash.js` | — (genuinely new, none existed) |
| Duplicate Detection | `duplicate-detection-engine.js` | groups by `document-hash.js`'s fingerprint |
| Automatic/Editable Numbering | `numbering-engine.js` | — (genuinely new, generic pattern inference) |
| Missing NOR / Gap Detection | `gap-detection-engine.js` | reuses `numbering-engine.js`'s inferred pattern |
| Upload Missing NOR (workflow marker) | `gap-workflow-engine.js` | wraps `gap-detection-engine.js` with persisted status |
| Archive Timeline | `archive-timeline-engine.js` | — |
| Archive Health | `archive-health-engine.js` | composes the four engines above, weighted composite |
| Knowledge Contribution | `knowledge-contribution-engine.js` | reuses `identity-contract.js#generateKnowledgeId`, cross-references `knowledge/repository/` |

## Dormancy

`sources/nor-archive-source.js` transitively loads the real Firebase SDK
(`js/petty-cash/petty-cash-store.js` -> `js/firebase.js`'s CDN import) —
the same hazard `knowledge/connectors/nor-connector.js` has. It
self-registers only when explicitly imported (`sources/index.js`), never
bootstrapped by `registry/archive-source-registry.js` itself. This
barrel (`index.js`) does not re-export `sources/`, same convention as
`knowledge/index.js` / `document-intelligence/index.js`.

## Dependency direction

May read `knowledge/` (identity + repository, read-only), never the
reverse. Not imported by `knowledge/` or `document-intelligence/`.
Nothing outside `js/v2/` imports this tree. V1 is read-only, never
written to, never modified.

## Non-goals

- No file upload, no binary storage — none exists anywhere in this app.
- No UI — this milestone is platform capability only, same as every
  milestone before it; V2.0.10 "NOR Center" is where a UI is built.
- No auto-write of a suggested number or a resolved gap back into V1 —
  every suggestion here is advisory.
