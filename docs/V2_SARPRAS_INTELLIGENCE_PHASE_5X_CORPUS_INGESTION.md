# V2 — Sarpras Intelligence Phase 5.x.2: Corpus Ingestion & Document Analysis

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
`corpus-analysis-config.enabled` defaults **false**. Zero OpenAI calls. Zero
production corpus mutations. No V1 change. No Phase 5 Registry change. No
`database.rules.json` change (Phase 5.x.1's two corpus rule blocks are reused;
5.x.2 adds no RTDB node).

Builds on Phase 5.x.1 (Corpus Acquisition Foundation — the `CorpusDocument` /
`CorpusObservation` / `CorpusProvenance` contracts + the observation
lifecycle + the server store + the STAGED `intelligenceCorpus` callable).

---

## 1. Purpose

Move the dormant corpus foundation into a **controlled, deterministic
analysis pipeline** for historical PBSI NOR / Memorandum documents:

```
original PDF / DOCX
  → SHA-256 of the ORIGINAL bytes → deterministic documentId → dedup
  → text extraction (DOCX: Mammoth; PDF: deterministic geometry + best-effort text)
  → structure extraction (DOCX tree / PDF page geometry)
  → page render          (Null unless a real renderer is injected)
  → visual analysis      (deterministic layout always; a model analyzer only if wired)
  → classification       (documentType + era + sourceDate — from CONTENT only)
  → observations         (structure + terminology + layout — every one 'observed')
  → HUMAN REVIEW
```

It is **not**: automatic rule promotion, style-guide publication, knowledge
approval, NOR generation/publication, a Registry/Petty-Cash/V1 mutation, a
client-side OpenAI key, model fine-tuning, or any modification of a source
file. **Human approval remains mandatory** before anything becomes
authoritative organizational knowledge — and there is no code path that
performs it.

The physical corpus this serves is already in the repo as a design-reference
bundle: `Petty Cash Center/uploads/` — 2 signed NOR PDFs (Skia / PDFium
renderers), 2 `.docx` (NOR 113, "Memo Sarpras 362" — a predecessor
instrument). The tests run against these real files when present.

---

## 2. Architecture

### 2.1 ESM analysis pipeline — `src/intelligence/corpus/`

All pure (no Firebase, no network, no model). Dormant by default.

```
ingestion/
  contracts/
    corpus-source-contract.js        CorpusSource + detectFormat (magic → MIME → filename)
    extraction-result-contract.js    ExtractionResult / ExtractedPage / TextBlock — method,
                                     pageCount (null = unknown), region always with a
                                     coordinateSpace
    classification-result-contract.js ClassificationResult — documentType/era + confidence +
                                     a list of named WEIGHTED SIGNALS (never an opaque score);
                                     a filename-derived date can NEVER be an era signal
    corpus-adapter-contract.js       { id, version, kind, run } adapter family + a tiny registry
  corpus-checksum.js                 computeCorpusChecksum(bytes) — SHA-256 via Web Crypto
  extractors/
    docx-extractor.js                Mammoth (INJECTED port) → text + structure_parse; honest
                                     PARSER_UNAVAILABLE / MALFORMED_DOCUMENT failures
    pdf-structure-extractor.js       dependency-free: /Type/Page count + per-page /MediaBox
                                     geometry + /Producer; best-effort text-object scan held to
                                     a text-quality gate — a PDF with no readable text →
                                     ok:false + NO_TEXT_LAYER (§17), geometry still returned
    null-extractor.js / extractor-registry.js
  classify/
    source-date-extractor.js         a date from the document DATELINE / body — NEVER filename,
                                     upload time, or filesystem timestamp (§2)
    document-type-classifier.js      NOR | NOTA_ORGANISASI | MEMORANDUM | LEGACY | UNKNOWN + conf;
                                     weak evidence → UNKNOWN; filename is a weak hint only
    document-era-classifier.js       historical | current | transitional | unknown + conf; era
                                     is decided ONLY by the document's OWN date vs an
                                     operator-configured cutover (never "now"); default unknown,
                                     confidence < 1
analysis/
  structure-observer.js              NOR/Memo anatomy → CorpusObservation[] (all 'observed')
  terminology-observer.js            recurring wording / terms / tone → observations; occurrence
                                     count is evidence, NOT authority; wording verbatim,
                                     normalizedValue null
  candidate-grouping.js              groupObservations + promoteGroupsToCandidates — cross-document
                                     frequency → 'candidate' ONLY (never 'approved'; no
                                     approvedBy / rationale)
  visual/
    page-render-port.js              PageRenderPort + nullPageRenderPort (RENDER_UNAVAILABLE)
    visual-analyzer-port.js          VisualAnalyzerPort + nullVisualAnalyzer (ANALYZER_UNAVAILABLE)
    deterministic-layout-analyzer.js page geometry → layout observations; NO geometry → NOTHING
  analysis-prompt-config.js          versioned, PURE-DATA model prompt/schema + a mapper that
                                     forces 'observed' and strips any model-supplied approval
pipeline/
  pipeline-contract.js               PIPELINE_STAGE / STAGE_OUTCOME / makePipelineResult /
                                     computeStatusPath (legal analysis-status chain)
  analysis-pipeline.js               runAnalysisPipeline() — the orchestrator (DATA ONLY)
corpus-analysis-config.js            enabled (false) + per-stage toggles + eraCutoverDate (null —
                                     no chronology assumed) + thresholds
```

### 2.2 Server boundary — `functions/src/intelligence/` (CJS, STAGED)

| File | Change |
|---|---|
| `corpusChecksum.js` | **NEW** — CJS SHA-256 mirror; parity with the ESM checksum is asserted |
| `corpusStore.js` | `+ setClassification(db, documentId, { patch, actorId })` — a safe write primitive: only `documentType / typeConfidence / documentEra / eraConfidence / sourceDate / pageCount` can move; `makeCorpusDocument` re-normalises (clamps confidences, validates enums, enforces the §5 invariant); never touches ownerId / ingestionStatus / analysisStatus / observations |
| `intelligenceCorpus.js` | `+ setClassification` op and `+ analyze` op. `analyze` delegates to an **injected pipeline runner** — with none wired (the default) it returns `PIPELINE_UNAVAILABLE` and mutates nothing (§14). When a runner is present it writes the result via the existing safe primitives (`setClassification` + `setAnalysisStatus` chain + `recordObservation` loop), forcing every observation to `observed`. Owner is always `auth.uid`; cross-owner → `FORBIDDEN`. `logger.info` stays METADATA ONLY. **Still NOT wired into `functions/index.js`.** |

**Why the server pipeline is a seam, not a full integration:** running the
ESM pipeline inside a Cloud Function needs `mammoth` in
`functions/package.json` + a Storage read of the original bytes. Both are
**deploy-time** steps for Phase 5.x.2's separately-reviewed deploy. Until
then the deterministic pipeline runs agent-/client-side (or in a Node
harness) and the server exposes only the authoritative WRITE path, tested
with an injected fake runner.

---

## 3. Ingestion lifecycle & checksum identity (§5)

- `computeCorpusChecksum(bytes)` = SHA-256 of the **original bytes**,
  lowercase hex. Deterministic; Web Crypto (browser + Node) ⇄ Node
  `crypto` (Functions) parity verified.
- `documentId = corpus_<checksum>` (Phase 5.x.1). **Identity is the bytes**
  — never the filename, never the extracted text.
- **Dedup** (Phase 5.x.1 `corpusStore.ingestDocument`, unchanged): a
  byte-identical re-ingest returns the existing document (`duplicate:
  true`), never overwrites it. Different bytes with the same filename →
  different `documentId`. `duplicateOfId` semantics preserved.
- The source file is **evidence** — never rewritten, never overwritten. An
  extractor returns no bytes and no source handle; the original byte array
  is untouched after extraction (verified).

`ingestionStatus` (`pending → received → stored → duplicate → failed`) and
`analysisStatus` (below) are **separate axes**, and both are separate from
the observation lifecycle. None means "organizationally approved".

---

## 4. Extraction adapters (§8, §9)

| Format | Adapter | Method on success | Honest failure |
|---|---|---|---|
| DOCX | `docx-extractor` (Mammoth port) | `structure_parse` — text + headings/tables/lists; `pageCount` stays `null` (a .docx has no fixed pages) | no port → `PARSER_UNAVAILABLE`; bad zip → `MALFORMED_DOCUMENT`; empty → `NO_TEXT_LAYER` |
| PDF | `pdf-structure-extractor` (dependency-free) | `text_layer` — only when a real, quality-gated text layer is found | **`NO_TEXT_LAYER`, method `unknown`** for Skia/PDFium/scanned PDFs — but `pageCount` + per-page `/MediaBox` geometry (with `coordinateSpace: 'pdf_points'`) ARE returned |
| unknown | `null-extractor` | — | `NOT_IMPLEMENTED` (fail safe) |

**§17 enforced:** a PDF whose text cannot be read does **not** claim
`text_layer`; the pipeline does **not** advance `analysisStatus` to
`text_extracted`; the document still gets an honest `pageCount` and
geometry-only layout analysis. A real pdfjs/OCR extractor can be injected
later with no contract change — a re-run would then advance the document.

On the real fixtures: both `.docx` extract fully (title, dateline,
reference number, meta labels, opening, terbilang, closing, signatory);
both `.pdf` (Skia, PDFium) honestly report `NO_TEXT_LAYER` + 5/4 pages of
596×842 / 595×841 geometry.

---

## 5. Classification (§6) & era detection (§7)

**documentType** — deterministic weighted signals: explicit title
(`NOTA ORGANISASI` / `MEMORANDUM` / `MEMO`), reference-number shape
(`.../Nota Organisasi/Sarpras/...` vs `.../Memo/Sarpras/...`), meta-label
family membership, the petty-cash-realisation subject, and — last and
weakest — a filename token. Weak/absent evidence → `UNKNOWN`. The result
carries the full `typeSignals[]` list (name + weight + evidence) — never
an opaque number. On the fixtures: NOR 113 → `NOTA_ORGANISASI` (0.95),
Memo 362 → `MEMORANDUM` (0.95).

**sourceDate** — from the document DATELINE (`<Kota>, <d> <BulanIndonesia>
<yyyy>`) or a body date. **Never** from the filename, upload time, or a
filesystem timestamp. On the fixtures the DATELINE ("18 Mei 2026") wins
over the filename's subject-period date ("12 Mei 2026"). No date in the
content → `sourceDate = null`.

**documentEra** — `historical | current | transitional | unknown` +
confidence. Decided **only** by the document's OWN `sourceDate` compared
against an **operator-configured** `eraCutoverDate` (`± transitionalWindowDays`),
plus weak terminology markers (a predecessor instrument → `historical`).
`eraCutoverDate` defaults to **`null`** — with no cutover configured, era
is `unknown` (confidence < 1). Era is **never** "current" because
ingestion happened now — the classifier never receives "now".

---

## 6. Observations (§10, §11, §12)

Every observation the pipeline emits is `lifecycleState: 'observed'`,
carries `>= 1` provenance back to `sourceDocumentId` (+ page + region when
available), and keeps `normalizedValue = null` (raw wording stays
recoverable). Categories used (all from the Phase 5.x.1 vocabulary):
`terminology`, `opening_pattern`, `closing_pattern`,
`recipient_convention`, `subject_convention`, `date_convention`,
`attachment_convention`, `copy_convention`, `signature_wording`,
`body_structure`, `formal_tone`, `preferred_phrase`,
`organizational_term`, `structure`, `layout`.

- **structure-observer** — document title, dateline, reference number,
  recipient / sender / subject / attachment / copy blocks, opening,
  terbilang, closing, signatory, page count, heading outline.
- **terminology-observer** — fixed phrases ("Dengan hormat,", "Kepada
  Yth.", "Tembusan", "Atas perhatiannya…", …), organizational terms,
  formal-tone markers. `occurrenceCount` records how many times a phrase
  appeared **in this document** — evidence weight, **not** authority.
- **deterministic-layout-analyzer** — page geometry → `layout` /
  `visual` observations (size, orientation, nearest paper name,
  coordinateSpace); positioned blocks → `content_bounds` + per-block
  regions. **No geometry → nothing** (no fabricated margins).
- **candidate-grouping** (a SEPARATE, explicit call — not part of the
  per-document pipeline) — groups observations by
  `category + key + normalised value` across documents and, when `>=
  candidateMinDocuments` (default 3) distinct documents corroborate,
  emits a `'candidate'` observation with merged provenance and the
  corroborating document ids. A candidate is a **proposal for a human** —
  it carries no `approvedBy` / `preferenceRationale`, and there is **no
  code path** that turns a candidate into `'approved'`.

---

## 7. `analysisStatus` — honest, isolated, idempotent

`pending → text_extracted → structure_extracted → visual_analyzed →
completed` (with `failed` reachable from any point).

- **Honest (§17):** a DOCX reaches `completed` via `structure_extracted`
  and **never** a fabricated `visual_analyzed`. A PDF with no readable
  text reaches `structure_extracted` / `visual_analyzed` via page
  geometry and **never** `text_extracted`. A document that can't be
  extracted at all → `failed`. A stage toggled off, or with no applicable
  input, is `skipped` — not silently "ran".
- **Not rolled forward on partial work:** the pipeline only reports
  `completed` when the observations stage ran **and** no stage failed.
- **`statusPath`:** the pipeline returns the ordered, individually-legal
  analysis-status moves from `pending` (e.g.
  `["structure_extracted","completed"]`); the server applies them one at a
  time via `setAnalysisStatus`, so no `ILLEGAL_TRANSITION`.
- **Failure isolation (§19):** `runAnalysisPipeline` holds no shared
  state; a stage failure is recorded and later independent stages still
  run; one bad document never affects the next.
- **Idempotency (§18):** every observation id is deterministic
  (`observationIdFrom(documentId, category, key)`). A re-run yields the
  same ids; the server merges via `mergeObservationOccurrence`
  (occurrenceCount grows, provenance appends, `lifecycleState` never
  moves).

---

## 8. Provenance (§16)

Every observation carries `provenance: CorpusProvenance[]`
(`length >= 1`): `sourceDocumentId` (always), `sourceFileId` (the
preserved-original `file:<sha256>` when known), `pageNumber` (or null),
`region` (`{x,y,width,height,coordinateSpace}` or null — coordinates never
appear without a coordinateSpace, and an all-null region is `"unknown"`,
never a fabricated measurement), `extractionMethod`, `extractedAt`,
`confidence`. `isCorpusObservation` **rejects** an observation with zero
provenance — no orphan observations are persisted.

---

## 9. Visual-analysis boundary (§13, §14)

- `PageRenderPort` / `VisualAnalyzerPort` are contracts + Null
  implementations only. The Null ports return `RENDER_UNAVAILABLE` /
  `ANALYZER_UNAVAILABLE`; the pipeline then **skips** the visual stage and
  does **not** advance to `visual_analyzed` on that basis.
- A real page renderer (headless Chromium via the already-present
  `puppeteer` / `@sparticuz/chromium`) and a real visual analyzer
  (server-side, authenticated backend) are **injected later** — no
  contract change.
- Where deterministic PDF geometry establishes a layout fact, the
  deterministic analyzer is preferred; a model is never asked to invent
  coordinates.

## 10. OpenAI / model boundary (§14, §15)

- **No key, no endpoint, no model SDK** anywhere in this phase — client or
  server (statically scanned). A future analyzer is a server-side adapter
  calling the authenticated Sarpras backend.
- `analysis-prompt-config.js` is the **versioned, pure-data**
  specification: instructions ("report only what's present", "separate
  observation from inference", "never invent a date/number/name", "never
  declare policy", "never mark approved") + an output JSON schema.
- `mapModelObservationToContract` maps a model item into a
  `CorpusObservation`, **hard-forcing `lifecycleState: 'observed'`** and
  stripping any `approvedBy` / `preferenceRationale` a model returns; an
  unknown category → `null` (rejected, not coerced).
- If a model is unavailable, the pipeline still produces its full
  deterministic result. Model output is never authoritative and always
  carries provenance + confidence.

---

## 11. Security model (§20)

- **Browser cannot write** corpus nodes — RTDB `.write: false` (Phase
  5.x.1); the `intelligenceCorpus` Cloud Function (Admin SDK) is the only
  writer.
- **Authorization** — `canUseIntelligence(auth.token)` (`role === 'admin'
  || adminEquivalent === true`), unchanged. No new permission.
- **Owner / actor** — always `request.auth.uid`. Cross-owner
  `setClassification` / `analyze` / `get` / `observations` /
  `recordObservation` / `setAnalysisStatus` → a `FORBIDDEN` envelope
  (verified).
- **No client trust** — the callable strips `ownerId` / `documentId` /
  `tenantId` / `ingestionStatus` / `analysisStatus` from `ingest`;
  `ownerId` / `lifecycleState` / `approvedBy` / `approvedAt` /
  `preferenceRationale` from `recordObservation` and from every
  observation in an `analyze` result; and `setClassification` accepts
  **only** the six derived fields, re-validating each. A model-injected
  `'approved'` observation is persisted as `'observed'` (verified).
- **No secret, no outbound HTTP, no env-var** beyond the Firebase runtime
  config (statically scanned). No V1 / Petty Cash / `generateNor` /
  organizational-knowledge / feature-flag coupling.
- **Audit** — `logger.info` is METADATA ONLY: never the observed text, a
  rationale, a body, a token, or a secret. `analysisStatus`/`failed`
  outcomes carry no stack trace into the record.

### STAGED — not live

`intelligenceCorpus` is **NOT** wired into `functions/index.js`.
`database.rules.json` is **unchanged** by 5.x.2 (5.x.1's two corpus rule
blocks are reused and remain undeployed). Wiring + `firebase deploy` (with
`mammoth` added to `functions/package.json` + Storage read) is a Phase
5.x.2 deploy step with its own review.

---

## 12. Failure handling (§19) & idempotency (§18)

- A failed analysis of one document cannot corrupt another
  `CorpusDocument`, another observation, V1, the NOR Registry,
  organizational memory, or a knowledge item — the pipeline is a pure
  function with no shared state, and every server write is one of the
  Phase 5.x.1 safe primitives on a single document id.
- Partial progress is represented honestly (§7). A document is never
  rolled to `completed` on text-extraction-only.
- Re-running analysis: deterministic observation ids + `mergeOccurrence`
  → no uncontrolled duplicates, no accidental lifecycle promotion
  (verified).

---

## 13. Human-review boundary (§21, §22)

```
ingested document → observations ('observed')
                  → candidate conventions ('candidate', cross-document, non-authoritative)
                  → HUMAN REVIEW (explicit actor + written preferenceRationale)
                  → approved preferred convention   ← the ONLY authoritative state
```

This phase produces **`observed`** (per-document) and, via the separate
`candidate-grouping` call, **`candidate`** observations. It **never**
produces `approved` / `deprecated`, never sets `approvedBy` /
`preferenceRationale`, and never invokes
`advanceObservationLifecycle` (the Phase 5.x.1 helper, still unreachable
from the store/callable). This phase writes **no** `KnowledgeItem`, and
does not modify organizational-memory approved rules, a style guide, a NOR
template, the NOR Registry, or any published NOR.

---

## 14. Intentionally deferred

- wiring `intelligenceCorpus` into `functions/index.js` + `firebase
  deploy` (+ `mammoth` in `functions/package.json` + Storage read) —
  Phase 5.x.2 deploy step
- a real pdfjs/OCR PDF text extractor (the Skia/PDFium fixtures need one)
- a real page renderer (puppeteer) + a real visual/vision analyzer
- production RAG retrieval; a vector database
- the human review workspace that walks `candidate → approved`
- automatic knowledge promotion / style-guide generation / template
  replacement
- any UI (§23)

---

## 15. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-corpus-ingestion-check.mjs` | checksum determinism + CJS parity value; `detectFormat`; DOCX extractor (real + fake port + failures); PDF extractor (synthetic text + real Skia/PDFium `NO_TEXT_LAYER` + geometry); classifiers (weak → UNKNOWN, filename ≠ authority); sourceDate from content only; era never from "now"; source immutability |
| `node scripts/intelligence-corpus-analysis-check.mjs` | structure + terminology observers (all `observed`, verbatim, provenance); deterministic layout (geometry → obs, no geometry → nothing); candidate grouping (`candidate` ≠ `approved`, no approvedBy, minDocuments); prompt config (`mapModelObservationToContract` forces `observed`); config defaults |
| `node scripts/intelligence-corpus-pipeline-check.mjs` | honest `analysisStatus` (DOCX → completed via structure; PDF-no-text → visual_analyzed, never text_extracted; garbage → failed); `statusPath` legal chain; failure isolation; idempotency; config toggles skip; no persist/promote/model |
| `node scripts/intelligence-corpus-ingestion-check.cjs` | CJS ⇄ ESM checksum parity; `corpusStore.setClassification` (6 fields only, §5 invariant, no observation); the `setClassification` + `analyze` callable ops (auth/authz/owner/no-injection); `analyze` fails safe with no pipeline (0 mutations); `analyze` with a fake runner forces every observation to `observed`; static secret/model/V1/knowledge/flag scan; `functions/index.js` staging assertion |

All four pass. All 24 `scripts/intelligence-*` checks pass. Knowledge +
Organizational Memory + Document Intelligence + NOR + Petty Cash +
permission/role + RTDB-functions regression green. One pre-existing,
unrelated failure: `rtdb-hardening-phases-2to7-check.mjs` cannot
`JSON.parse` the `//`-commented `database.rules.json` (fails identically on
a pristine tree; not touched — §19).

---

## 16. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `/feature_flags/intelligence/enabled` still absent → OFF;
  `corpus-analysis-config.enabled` default false.
- Zero OpenAI calls. Zero production corpus mutations.
- `intelligenceCorpus` NOT in `functions/index.js`. `database.rules.json`
  unchanged by 5.x.2.
- `git diff --stat` (over the uncommitted 5.x.1 + 5.x.2 working tree):
  `database.rules.json` (+25, from 5.x.1), `src/intelligence/index.js`
  (+52). Phase 5.x.2 adds ~22 ESM files + `corpusChecksum.js` + 4 check
  scripts + this doc (~3,600 lines).
