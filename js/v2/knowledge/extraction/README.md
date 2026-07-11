# knowledge/extraction/ — Knowledge Learning Foundation (V2.0.8, Phase 11)

## Deterministic only — no AI, no LLM, no fake NLP

Every algorithm in this directory is a plain statistic over the Knowledge
Repository's own data: presence rates, term frequency, exact-payload
grouping. Nothing here calls a model, an API, or approximates meaning.

## What's here

| Capability | File | Real algorithm |
|---|---|---|
| Knowledge Indexing | `index-engine.js` | groups the repository snapshot by `${domainType}:${kind}`, built once per extraction run |
| Pattern / Structure Extraction | `pattern-extraction-engine.js` | field-presence rate across a population; fields above threshold become `slots` in a `PatternEntry` (reuses `knowledge/language/contracts/pattern-contract.js`, Phase 3.5, unchanged) |
| Vocabulary Extraction | `vocabulary-extraction-engine.js` | tokenize + term-frequency over string-valued payload fields; terms below a minimum occurrence are dropped as noise (reuses `lexical-contract.js`'s `VocabularyEntry`) |
| Relationship Extraction | `relationship-extraction-engine.js` | exact payload equality within a group -> `CORROBORATES` relationship (reuses `dependency-graph-contract.js`'s existing vocabulary, no new relationship type) |
| Scope Detection | `scope-detection-engine.js` | majority-payload-group coverage % — `organization_wide` if the majority covers ≥70% of the population, else `variant` |
| Cross-Division Promotion Candidates | `promotion-candidate-engine.js` | reuses Scope Detection's majority grouping; reports which item ids are majority-pattern (worth a human's promotion attention) vs. minority variants — never performs the promotion itself |
| Knowledge Health | *(not a new file)* | `knowledge/metrics/knowledge-metrics-engine.js#computeHealthReport()` (Phase 6, unchanged) already reports `patternCount`/`vocabularySize`/`relationshipCount`/`learningQueueCount` — all of which move for real once this directory's engines write Candidate items. No duplicate metrics engine was built. |

## "Everything should produce Candidate Knowledge"

Every extraction engine writes through `extraction-write-helper.js`,
which refuses anything not already `lifecycleState: 'candidate'` and
performs the same idempotent create-or-appendVersion `acquisition-engine.js`
(V2.0.2) established — re-running an extraction updates its own prior
output instead of duplicating it. Nothing here ever reaches Approved;
that still only happens through `knowledge/review/review-workflow-engine.js#approve()`,
one human decision at a time (Decision 6, "teach once, learn forever").

## Feedback-loop guard

`index-engine.js#buildKnowledgeIndex()` defaults to indexing **Approved**
items only. Extraction never mines its own prior Candidate output — that
would let an unreviewed guess influence the next guess before a human
ever saw it.

## An honest limitation, stated plainly

`nor`'s `structure` payloads (the only real population today) deliberately
carry counts/flags, never free text — Vocabulary Extraction has little to
mine from them by design (see `knowledge/connectors/nor-connector.js`'s
own "learn structure, not content" rule). The algorithm itself is real
and correctly exercised in `scripts/knowledge-extraction-check.mjs`
against synthetic text-bearing payloads — it is ready the moment any
future connector emits real text, not a stub waiting to be built.

## Scope Detection does not read Organizational Memory

`js/v2/organizational-memory/` carries the real "Dari"/origin signal
(`senderOrigin`), but it sits **downstream** of the Knowledge Repository
in the frozen architecture (Official Documents → Knowledge Acquisition →
Knowledge Repository → Organizational Memory → Applications). Reading it
from here would invert that direction. Scope here is a Knowledge-internal
proxy — "what fraction of the population shares this exact payload" —
not the same signal, but real and in-bounds.

## Dependencies

Pure — no V1 dependency anywhere in this directory. Safe to re-export
from `knowledge/index.js`.

## Non-goals

- No clustering beyond exact payload equality (fuzzy grouping, if ever
  needed, is V2.0.9's "Machine Learning Foundation" scope).
- No automatic promotion or approval — every engine here only reports.
