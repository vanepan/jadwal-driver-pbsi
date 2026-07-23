# knowledge/machine-learning/ — Machine Learning Foundation (V2.0.9, Phase 12)

## Only infrastructure genuinely implementable without external AI

Every capability here is a deterministic statistic or a documented,
transparent formula. No model, no API call, no approximated meaning.

| Capability | File | Reuses |
|---|---|---|
| Similarity | *(not a new file)* | `knowledge/learning/similarity-detection-engine.js#computeSimilarity` (V2.0.5) — reused directly, not re-implemented |
| Clustering | `clustering-engine.js` | single-linkage over the same `computeSimilarity`, similarity-based (not exact-match, unlike `knowledge/extraction/scope-detection-engine.js`) |
| Pattern Mining | `pattern-mining-engine.js` | clusters first, then reuses `knowledge/extraction/pattern-extraction-engine.js`'s `fieldPresenceRates()` per cluster — one pattern per variant, not one blurred aggregate |
| Statistics | `statistics-engine.js` | writes `knowledge/language/contracts/statistics-confidence-contract.js`'s `StatisticEntry` (real since Phase 3.5, zero writers until now) |
| Outlier Detection | `outlier-detection-engine.js` | z-score, reuses `statistics-engine.js#computeFieldStatistics` |
| Confidence | `confidence-engine.js` + `contracts/source-weight-contract.js` | real weight table (was a locked stub since Phase 3) × real corroboration count (`dependency-graph` engine, populated for real by V2.0.8's relationship extraction) |

## Confidence formula (documented, not hidden)

```
suggestedConfidence = sourceWeight * 0.6 + min(1, corroborationCount / 3) * 0.4
```

Source trust weighted higher than corroboration — an untrustworthy source
corroborated three times is still untrustworthy. Corroboration caps at 3
matches so a large duplicate cluster can't dominate the score.

Source weight table (`contracts/source-weight-contract.js`, real since
V2.0.9): `correction` 1.0 (explicit human input, Decision 6's highest
trust), `nor` 0.9 (a real connector reading V1 directly), `extraction`
0.7 (mechanically derived, one step removed from a primary source),
`merge` 0.6 (intentionally naive shallow merge, V2.0.4), unregistered
sourceTypes default to 0.5 — unknown, not distrusted.

## "Machine Learning never modifies Approved Knowledge. It only produces
## Candidate Knowledge."

Held two ways:

- `pattern-mining-engine.js` and `statistics-engine.js` write through
  `knowledge/extraction/extraction-write-helper.js` (V2.0.8), which
  refuses anything not already `lifecycleState: 'candidate'`.
- `clustering-engine.js`, `outlier-detection-engine.js`, and
  `confidence-engine.js` write **nothing at all** — they are pure reports,
  same discipline as `knowledge/extraction/scope-detection-engine.js` and
  `promotion-candidate-engine.js`. `confidence-engine.js` in particular
  cannot modify ANY KnowledgeItem, Approved or otherwise, by construction
  — a caller wanting to apply a suggestion still goes through the
  existing repository path themselves, on a non-Approved item.

## Dependencies

Pure — no V1 dependency anywhere in this directory. Safe to re-export
from `knowledge/index.js`.

## Non-goals

- No AI, no LLM, no embeddings, no gradient descent — every algorithm is
  closed-form and auditable.
- No re-implementation of Similarity — see the table above.
