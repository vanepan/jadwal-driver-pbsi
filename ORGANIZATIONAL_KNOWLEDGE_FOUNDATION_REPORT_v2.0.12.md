# V2.0.12 — Organizational Knowledge Foundation

**Implementation report.** Sarpras Intelligence roadmap, milestone 1 of 4 (V2.0.12–V2.0.15). Scope: build the generic, domain-agnostic organizational knowledge layer the roadmap asked for — KnowledgeGraph, Evidence, Confidence, Knowledge Statistics — as a **thin unifying layer** over the mature `js/v2/knowledge/` platform already shipped in prior milestones, not a rebuild. No AI, no LLM, no OCR, no NLP, no recommendation generated.

---

## 1. Starting state

Two V2 milestones are already committed: V2.0.10 (Sarpras Intelligence shell) and V2.0.11 (NOR Center). Underneath both, `js/v2/knowledge/` already contained a mature, domain-agnostic platform — repository, lifecycle, review workflow, explainability, single-hop relationship reads, confidence math, statistics math — none of which needed rebuilding.

A codebase survey (before writing any code) found that most of what the roadmap names for V2.0.12 — relationship contracts, confidence contracts, knowledge statistics — already existed and worked. Two real gaps remained:

1. **No typed Evidence shape.** Confidence was a raw number (`suggestedConfidence`); nothing described *what* backed that number as a listable, structured fact.
2. **No services-layer exposure.** `confidence-engine.js` and `statistics-engine.js` were real and correct but had never been added to the `knowledge/services/` public façade — the layer every future UI/consumer is supposed to import from instead of reaching into an engine directly.

This was confirmed with the user before writing code, who chose the **thin unifying layer** scope (reject: building new graph algorithms — path-finding, centrality, connected-components) and approved one drive-by fix: `domain-type-registry.js` mislabeled NOR as "Nota Operasional Reimbursement"; the real name (confirmed in `js/docs/templates/nor.js` and `js/analytics/engines/nor-analytics-engine.js`) is "Nota Organisasi Realisasi."

---

## 2. Roadmap-term → concrete-file mapping (traceability)

| Roadmap asks for | Resolution |
|---|---|
| Relationship contracts | **Reused** `contracts/dependency-graph-contract.js` (already existed) |
| Relationship Services | **Reused** `services/dependency-graph-service.js` (already existed) |
| Evidence contracts | **New** `contracts/evidence-contract.js` |
| Recommendation Evidence | **New** `contracts/recommendation-evidence-contract.js` (shape only — no recommendation engine exists yet in `js/v2`, so nothing produces this in production code) |
| Confidence contracts | Formalized by the new Evidence contract (raw confidence had a formula but no typed "what backs this number" shape) |
| Confidence Services | **New** `services/confidence-service.js` (fills the services-barrel gap) |
| Knowledge Statistics | **Reused** `machine-learning/statistics-engine.js` (already existed) |
| Knowledge Statistics Services | **New** `services/statistics-service.js` (fills the services-barrel gap) |
| KnowledgeGraph, Graph Services | **New** `dependency-graph/knowledge-graph-engine.js` + `services/knowledge-graph-service.js` — multi-hop read composed by looping the existing single-hop `getDependencies` primitive; no new storage, no new relationship semantics |

---

## 3. Files created

| File | Exports | What it does |
|---|---|---|
| `js/v2/knowledge/contracts/evidence-contract.js` | `EVIDENCE_SCHEMA`, `EVIDENCE_KIND`, `isEvidence`, `isEvidenceList` | Typed shape for one piece of evidence (`itemId`, `kind`, `weight` 0–1, `rationale`) backing a confidence number or future recommendation. Pure shape, no computation. |
| `js/v2/knowledge/contracts/recommendation-evidence-contract.js` | `RECOMMENDATION_EVIDENCE_SCHEMA`, `isRecommendationEvidence` | Typed shape for the `Evidence[]` a future recommendation engine would cite. No producer in this milestone. |
| `js/v2/knowledge/dependency-graph/knowledge-graph-engine.js` | `getNeighbors`, `getSubgraph`, `getGraphStats`, `RELATIONSHIP_TYPE` | Multi-hop composition: `getNeighbors` resolves one hop with the neighbor's full item + direction (`incoming`/`outgoing`); `getSubgraph` is a bounded BFS loop over `getNeighbors` (dedupes nodes/edges, `maxHops` default 2); `getGraphStats` tallies relationship counts by type via one repository `list()` call. No shortest-path, no centrality, no new storage — every traversal loops the existing single-hop `getDependencies`. |
| `js/v2/knowledge/services/knowledge-graph-service.js` | re-exports the engine above | Pure delegation, zero logic — mirrors `dependency-graph-service.js`'s own layering (traversal logic lives in the engine, never the service). |
| `js/v2/knowledge/services/confidence-service.js` | `suggestConfidence` (re-export), `explainConfidenceAsEvidence(item)` | `suggestConfidence` is pure delegation to `confidence-engine.js`. `explainConfidenceAsEvidence` is composition only: reshapes the engine's already-computed `sourceWeight`/corroborating relationships into an `Evidence[]` — one `SOURCE` entry, one `CORROBORATION` entry per corroborating relationship. Computes no new number. |
| `js/v2/knowledge/services/statistics-service.js` | `computeFieldStatistics`, `computeStatistics` (re-exports) | Pure delegation to `statistics-engine.js`. Zero new math. |
| `scripts/organizational-knowledge-check.mjs` | — | New Node check script, 28 assertions (see §6). |

## 4. Files modified

| File | Change |
|---|---|
| `js/v2/knowledge/services/index.js` | Added 3 namespaced barrel exports: `confidence`, `statistics`, `knowledgeGraph` — following the file's own documented "each gets one more namespaced export here" evolution note. |
| `js/v2/knowledge/services/README.md` | Updated service count (eleven → fourteen) and documented that `knowledge-graph-service.js` deliberately contains no traversal logic itself. |
| `js/v2/knowledge/registry/domain-type-registry.js` | Two-line label fix: `'Nota Operasional Reimbursement'` → `'Nota Organisasi Realisasi'` (doc-comment example on line 29, and the actual `registerDomainType('nor', ...)` call). |

No other files changed. No V1 file was touched (only read as reference). No file outside `js/v2/` was touched.

---

## 5. Design decisions

**Where does multi-hop traversal logic live?** The `services/` directory's own README states its non-goal explicitly: *"No new business logic anywhere in this directory — if a service needs logic an engine doesn't already have, that logic belongs in the engine, not the service."* So the BFS loop lives in a new **engine** file (`dependency-graph/knowledge-graph-engine.js`), and the service is a pure re-export — identical layering to the existing `dependency-graph-service.js` → `knowledge-dependency-graph-engine.js` pair. No exception was carved out.

**Does Evidence need a real producer?** A contract exercised only by its own validator tests is dead weight. `confidence-service.js#explainConfidenceAsEvidence` gives Evidence one genuine (non-test) producer by reshaping numbers `confidence-engine.js` already computes — this adds no new math, only a new shape around existing output. `RecommendationEvidence` deliberately has **no** producer this milestone, since no recommendation engine exists anywhere in `js/v2` yet — matching how `connector-contract.js` predated any real connector.

---

## 6. New verification script

`scripts/organizational-knowledge-check.mjs` — follows the repo's exact existing convention (`check(name, cond)` counter, `node scripts/organizational-knowledge-check.mjs`, `setActiveRepository('memory')`, synthetic fixtures, `process.exit(fail>0?1:0)`).

**28/28 checks passed:**

- **Evidence contract** (5): valid payload accepted; missing `itemId`, out-of-range `weight`, and unregistered `kind` each rejected; `isEvidenceList` rejects the moment one entry is invalid.
- **RecommendationEvidence contract** (4): valid shape accepted; empty `evidence` array, out-of-range `confidence`, and missing `rationale` each rejected.
- **Domain-type-registry fix** (3): label is corrected; old label is gone; `resetDomainTypeRegistry()` re-bootstraps the corrected label.
- **KnowledgeGraph — getNeighbors** (3): fixture A←B `corroborates`, A←C `supersedes`, C←D `corroborates`. Confirms direction tagging (`incoming`/`outgoing`), relationship-type filtering, and empty results when no edge matches the requested direction.
- **KnowledgeGraph — getSubgraph** (3): `maxHops:1` correctly excludes the 2-hop node; `maxHops:2` includes all four nodes; edge list is deduplicated (3 edges, not more) despite BFS revisiting shared nodes.
- **KnowledgeGraph — getGraphStats** (3): correct `edgeCount`/`nodeCount`; correct per-type breakdown; an unmatched `domainType` filter returns zero without crashing.
- **Confidence service** (4): `suggestConfidence` delegates byte-identically to the engine; `explainConfidenceAsEvidence` returns exactly `1 + corroborationCount` entries, all `isEvidence`-valid, split correctly into one `SOURCE` + N `CORROBORATION` entries.
- **Statistics service** (1): `computeFieldStatistics` delegates byte-identically to the engine.
- **Dormancy — structural import scan** (2): recursively walks `js/` and confirms no file outside the known gated chain (`feature-gates.js`, `module-loader-registry.js`) imports anything under `js/v2/`; recursively walks `js/v2/knowledge/` and confirms nothing imports `js/v2/ai-foundation/`.

---

## 7. Regression

All 9 pre-existing V2 check scripts were re-run and pass with **identical counts** to the pre-change baseline:

| Script | Result |
|---|---|
| `machine-learning-check.mjs` | 24/24 |
| `organizational-memory-check.mjs` | 28/28 |
| `knowledge-review-workflow-check.mjs` | 20/20 |
| `document-intelligence-check.mjs` | 21/21 |
| `knowledge-extraction-check.mjs` | 24/24 |
| `knowledge-learning-check.mjs` | 23/23 |
| `knowledge-observability-check.mjs` | 21/21 |
| `knowledge-promotion-check.mjs` | 21/21 |
| `knowledge-acquisition-check.mjs` | 24/24 |
| `organizational-knowledge-check.mjs` (new) | 28/28 |

(`*-dom-check.mjs` / `*-harness.html` variants require a browser and were not touched by this milestone's files — out of scope for this manual pass.)

## 8. Dormancy verification

```
grep -rln "\.\./v2/\|/v2/ui\|from '\.\./\.\./v2" js/config js/app.js
→ js/config/module-loader-registry.js   (only hit, unchanged from baseline)
```

The gated chain (`feature-gates.js#isV2Enabled` → `module-loader-registry.js` → `app.js`) is the sole entry point into `js/v2/`, exactly as before this milestone. Structurally re-verified inside the new check script itself (assertion 27/28).

## 9. Dependency verification

Every new/modified file's imports were grepped directly:

```
evidence-contract.js                 → (none)
recommendation-evidence-contract.js  → ./evidence-contract.js
knowledge-graph-engine.js            → ../contracts/dependency-graph-contract.js
                                        ./knowledge-dependency-graph-engine.js
                                        ../repository/knowledge-repository.js
knowledge-graph-service.js           → ../dependency-graph/knowledge-graph-engine.js
confidence-service.js                → ../machine-learning/confidence-engine.js
                                        ./dependency-graph-service.js
                                        ../contracts/evidence-contract.js
statistics-service.js                → ../machine-learning/statistics-engine.js
```

None import `js/v2/ai-foundation/` or any V1 module. All stay entirely within `js/v2/knowledge/`.

## 10. Architecture verification

- Every new **service** file is pure delegation/composition — no math beyond what `confidence-engine.js`/`statistics-engine.js` already compute.
- The new **engine** file's only logic is a bounded BFS loop over the existing single-hop `getDependencies` primitive — no new storage mechanism, no new relationship semantics, no path-finding/centrality.
- **No production writes** — every check ran against the in-memory test repository (`setActiveRepository('memory')`); no Firebase, no real backend touched.

---

## 11. Known issue, deliberately out of scope

The same stale NOR label ("Nota Operasional Reimbursement") also appears in two other places, found during the survey but **not fixed** — the user's approval was scoped to `domain-type-registry.js` only:

- `js/v2/knowledge/connectors/nor-connector.js` (header comment)
- `js/v2/knowledge/language/examples.js` (`term: 'Nota Operasional'`)

Flagged here for a future cleanup pass.

---

## 12. Remaining roadmap

| Milestone | Status |
|---|---|
| V2.0.10 Sarpras Intelligence Workspace | ✔ Complete (prior) |
| V2.0.11 NOR Center Foundation | ✔ Complete (prior) |
| **V2.0.12 Organizational Knowledge Foundation** | ✔ **Complete — this report** |
| V2.0.13 Bootstrap Dataset Foundation | Not started |
| V2.0.14 Dataset Import Foundation | Not started |
| V2.0.15 Live Editable Composer Foundation | Not started |

Per the roadmap's own stop-and-verify structure, each remaining milestone gets its own plan and checkpoint before code, one at a time.

## 13. Risks / open questions for future milestones

- **Naming drift risk**: "Confidence contracts" in the roadmap text was interpreted as satisfied by the new Evidence contract rather than a literal `confidence-contract.js` file — worth confirming this reading holds for V2.0.13+ if similar ambiguous terms reappear.
- **RecommendationEvidence has no producer**: it will stay unexercised in production code until a real recommendation engine exists — not a defect, but worth remembering so a future milestone doesn't assume it's already wired up.
- **Two remaining stale-label sites** (§11) are cosmetic but should be swept up before any customer-facing NOR label surfaces from `js/v2/knowledge/connectors/` or `language/examples.js`.

---

*No commit was made. This report is a status snapshot pending approval to continue into V2.0.13.*
