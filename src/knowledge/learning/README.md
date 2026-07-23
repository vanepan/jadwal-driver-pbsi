# knowledge/learning/ — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

## Why this is a separate module from acquisition/

A Connector (`knowledge/connectors/`) answers "what's out there in bulk,
read from a source." A Correction is "here is one specific fix from a
human, right now." These are different-shaped problems — routing
corrections through `contracts/connector-contract.js`/`acquisition-engine.js`
(built for bulk source reads with a `since` watermark) would be a bad-fit
reuse, not a good one. `learning/` is a parallel, equally-real path into
the same repository.

## Correction Pipeline (`correction-pipeline-engine.js`)

`submitCorrection(session, correction)` takes one of two paths:

1. **Update** (Pattern/Vocabulary/Relationship Update — ONE mechanism):
   if `correction.itemId` names an item still Draft, Candidate, or Pending
   Review, `appendVersion()`s it in place with the corrected payload. This
   is a content fix mid-flight — `lifecycleState` is untouched. There's no
   separate "vocabulary update" vs "relationship update" code path: every
   `kind`'s payload is opaque to the core by design
   (`knowledge-item-contract.js`'s own documented invariant), so the same
   mechanism serves all of them honestly.
2. **Candidate Generation**: if there's no `itemId`, OR the named item is
   Approved or Deprecated (never mutated in place — that would silently
   alter reviewed content), a brand-new Candidate is created instead
   (skipping Draft — a human explicitly authored this). If it names an
   existing Approved item, a `kind:'relationship'` item
   (`contracts/dependency-graph-contract.js`, `RELATIONSHIP_TYPE.DERIVED_FROM`)
   links the new Candidate back to it — reusing the existing dependency
   graph rather than inventing a new "supersedes" field.

Both paths run **Similarity Detection** first (flagged in the result, never
blocking) and record a `PromotionRecord`-shaped entry into an in-memory
correction log for Learning Metrics. Neither path ever produces anything
but Draft/Candidate-lifecycle output — Decision 6 ("teach once, learn
forever") still applies; a generated Candidate goes through the exact same
`review/` → `promotion/` pipeline as anything else.

## Similarity Detection (`similarity-detection-engine.js`)

`computeSimilarity(payloadA, payloadB)` is deliberately **one honest,
generic reference metric** — Jaccard similarity over top-level payload
keys+values — the same "reference implementation, not a real X" honesty as
`promotion/knowledge-merge-engine.js`'s shallow merge. This platform's
payloads are structured data (counts, flags, patterns), not prose, so a
field-overlap ratio is an honest generic answer, not a stand-in for real
NLP similarity.

## Knowledge Evolution (`knowledge-evolution-engine.js`)

`getKnowledgeEvolution(itemId)` is a pure reporting shape over
`repository.getHistory(id)` (already real, Phase 5) — not a new data
source. It reads each version's `provenance.connectorId` (which a
correction legitimately repatches — "a human corrected this" is more
accurate than the stale original connector) to compute `correctionCount`.

## Learning Metrics (`contracts/learning-metrics-contract.js`)

A pure aggregator over the correction log, mirroring
`observability/contracts/import-statistics-contract.js`'s pattern exactly
— same shape of question ("how has this pipeline done over N runs"),
applied to corrections instead of acquisitions.

## "Incremental Learning"

Already satisfied by the platform's existing design, not a new mechanism:
every correction is processed one at a time as it arrives (append-only,
same as acquisition), and Incremental Cursor Contracts
(`observability/`, V2.0.2.1) already cover the "resume from where we left
off" need for any future connector-shaped learning source.

## Dependencies

Pure — no V1 dependency anywhere in `learning/`. Safe to re-export from
`knowledge/index.js`.

## Non-goals

- No UI, no correction-authoring form — this is the platform capability a
  future UI would call.
- No automatic approval, ever — every path here terminates at Draft or
  Candidate at most.
- No semantic/NLP similarity — intentionally structural.
