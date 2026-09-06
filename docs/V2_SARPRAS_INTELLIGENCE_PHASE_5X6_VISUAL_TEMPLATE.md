# V2 — Sarpras Intelligence Phase 5.x.6: PBSI Visual Template System

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Zero OpenAI calls. Zero model use. Zero RAG. Zero renderer integration.
Zero production Visual Template mutations. No V1 change. No NOR generator /
NOR Registry / NOR draft / publication / Petty Cash / Style Guide change.
No KnowledgeItem promotion. No `functions/index.js` change. One **additive,
undeployed** `database.rules.json` block.

Builds on Phase 5.x.1–5.x.5.

> **Visual evidence is not visual policy.
> A repeated layout is not automatically an official template.
> Only explicit human approval creates authoritative template authority.**

---

## 1. Purpose

The **visual authority layer** — a sibling of the PBSI NOR Style Guide
(Phase 5.x.5). The Style Guide governs **language / convention**; this
governs **physical / document presentation**: page size, orientation,
margins, header/footer geometry, logo placement, region positions (title,
recipient, subject, date, body, signature, attachment, page number),
typography, spacing, and multi-page / recurrence behaviour.

```
Visual Evidence  →  Visual Observations  →  Visual Pattern (observed structure)
   (a PDF's /MediaBox,     (CorpusObservation           │
    positioned blocks)      category 'layout',          │
                            modality 'visual')          │
                                                        ▼
                              ── human proposal + explicit approval ──
                                                        ▼
                              PBSI Visual Template            (AUTHORITY)
                                                        │
                                                        ▼
                              (future) deterministic Document Renderer
```

This phase **does not** implement the renderer, generate NOR documents, or
touch any downstream module (§27).

---

## 2. Architecture position

### 2.1 ESM Visual Template layer — `src/intelligence/corpus/visual-template/` (pure, dormant)

| File | Role |
|---|---|
| `contracts/visual-template-contract.js` | `pbsi-visual-template@1`. `VISUAL_TEMPLATE_STATUS` + graph + human-gated set + `canVisualTemplateTransition`; `VISUAL_AUTHORITY_STATE` + `authorityStateForStatus` (**derived from status**); `VISUAL_TEMPLATE_DOCUMENT_TYPE`; `VISUAL_REGION_KIND` (16 kinds, each mapped to a real observation); `VISUAL_PAGE_RECURRENCE`; `COORDINATE_SPACE` (re-exported verbatim from the corpus provenance contract); `makeTemplateGeometry` (= `makeCorpusRegion`, reused) / `makeTemplatePageModel` / `makeTemplateRegion` / `makeTemplateTypography` / `makeTemplateSpacing` / `makeTemplateStructuralRules`; `visualTemplateIdFrom`; `makeVisualTemplate` / `isVisualTemplate` |
| `contracts/visual-template-store-contract.js` | the backend interface (`list`, `get`, `proposeFromEvidence`, `approve`, `reject`, `deprecate`, `resolve`, `history`) + `VisualTemplateResult` envelope + `VISUAL_TEMPLATE_ERRORS` |
| `visual-template-config.js` | `DEFAULT_VISUAL_TEMPLATE_CONFIG` — `enabled` master switch (default `false`, ANDed with the Intelligence flag); `geometryTolerance` (§14); Phase 5.x.3 `temporal` windows — + a validated setter |
| `visual-observation.js` | `isVisualLayoutObservation`, `visualObservationRegionKind` (observation `key`/`role` → `VISUAL_REGION_KIND`), `pageGeometryOf`, `regionOf` |
| `visual-evidence-aggregator.js` | `aggregateVisualEvidence({ observations, documents }, config, { at })` → `VisualEvidenceReport { patterns[], patternConflicts[] }` — the ONE deterministic transformation; **observed pattern, NOT a template** |
| `visual-template-proposal.js` | `makeVisualTemplateProposalFromPattern` (never approved, never fabricates a rationale), `buildVisualTemplateProposals` (+ carries conflicts as `proposalConflicts`), `makeSupersedingVisualTemplateProposal` |
| `visual-template-authority.js` | `markApproved` (authenticated actor + **non-empty** human rationale REQUIRED), `markRejected`, `markDeprecated` — pure `{ next }` \| `{ error }` |
| `visual-template-query.js` | `getEffectiveVisualTemplates` (APPROVED only), `resolveEffectiveTemplate` (`resolved` \| `conflict` \| `missing`), `findVisualTemplateConflicts`, `getVisualTemplateHistory` |
| `backends/{null,memory,callable}-visual-template-backend.js` | Null (inert default), Memory (real lifecycle for tests / DISABLED mode), Callable (thin adapter over the staged function) |
| `visual-template-store.js` | THE facade — backend registry + events + 8 delegating methods (mirrors `style-guide-store.js`) |

Re-exported from `src/intelligence/index.js` (Phase 5.x.6 block).

### 2.2 Server — `functions/src/intelligence/` (CJS, STAGED, undeployed)

| File | Role |
|---|---|
| `visualTemplateContract.js` | the CJS **drift mirror** of the ESM contract + proposal + authority + query — dependency-free. The **aggregator is not mirrored**: it is injected into the callable as an ESM port (like the Phase 5.x.4 writing-memory builder), so its geometry logic lives in one place. |
| `visualTemplateStore.js` | server-owned persistence over `/intelligence_visual_templates/{templateId}` (Admin SDK). Zero-trust: `proposeFromEvidence` takes only the pattern the callable itself rebuilt; server forces `status`, `createdBy`, timestamps, re-derives `authorityState`. Conflict gate on `approve`. Auto-deprecates a predecessor on approval of a superseding template. |
| `intelligenceVisualTemplate.js` | HTTPS callable v2, region `asia-southeast1`, **no secrets**. `canUseIntelligence` gate. `proposeFromEvidence` rebuilds the visual aggregation server-side from the caller's own corpus (`gatherOwnerCorpus` + an **injected** deterministic aggregator → fail-safe `VISUAL_ANALYSIS_UNAVAILABLE`). **NOT** wired into `functions/index.js`; the CJS check exercises it via `.run()`. |

### 2.3 Storage

`/intelligence_visual_templates/{templateId}` — **STAGED, undeployed**. One
additive `database.rules.json` block; deep-compare confirms **0 changed
existing keys**. `.write: false` (Admin SDK is the only writer). `.read` is
the effective-admin tier (`role === 'admin' \|\| 'developer' \|\|
adminEquivalent`) — **organization-wide, not owner-scoped** (§23).
`.indexOn: ["status", "documentType"]`.

---

## 3. Evidence vs authority

| | Evidence (below Layer 6) | Authority (Layer 6) |
|---|---|---|
| what it is | a repeated page geometry / region position across documents | an explicit organizational document-layout template |
| authority | none — a `VisualPattern` is an *observed structure* | `authoritative` **iff** a human approved it |
| who decides | nobody — deterministic aggregation | a human, with a written rationale |
| `current` temporal evidence means | "recent documents use this layout" | nothing about approval (§9) |

A `proposed` VisualTemplate copies the pattern's page model, regions,
geometry, evidence and temporal evidence — but its `authorityState` is
`proposed` and its `rationale` is `null`. The transition to `authoritative`
happens **only** through `approve`.

---

## 4. Visual observation model

The aggregator consumes existing `CorpusObservation`s (Phase 5.x.1/5.x.2)
with `category: 'layout'`, `modality: 'visual'`:

| observation `key` | source | → region kind |
|---|---|---|
| `page_geometry` | `deterministic-layout-analyzer.js` from a PDF `/MediaBox` | `page` (drives the page model) |
| `content_bounds` | positioned text blocks' bounding box | `margin` |
| `block_<role>` | `deterministic-layout-analyzer.js` / an injected `visual-analyzer-port.js` | `ROLE_TO_KIND[role]` (else `other`) |

Each observation preserves `sourceDocumentId`, `sourceFileId`,
`pageNumber`, `region` (a `CorpusRegion`), `coordinateSpace`,
`extractionMethod`, `extractedAt`, `confidence`. An observation with no
positioned region contributes a region-kind presence but **no geometry**.

**No model is required.** With no visual analyzer configured the corpus
carries only the deterministic `page_geometry` / `content_bounds` /
`block_*` observations; the aggregator works from those. An injected model
analyzer stays optional (`nullVisualAnalyzer` → `ANALYZER_UNAVAILABLE`).

---

## 5. Geometry coordinate system

- **`COORDINATE_SPACE`** reused verbatim: `pdf_points` (72/in, origin
  **bottom-left**), `pixels` (origin **top-left**), `normalized` (0..1
  fraction of page), `unknown`.
- **`CorpusRegion`** `{ x, y, width, height, coordinateSpace }` — every
  numeric field nullable; `null` means *genuinely unknown*, never `0`.
- Coordinates are **never rounded** in the stored template — full float
  precision (mean of the page-relative fractions). Rounding happens **only**
  in the grouping fingerprint (§14).
- Coordinates from **different coordinate spaces are never silently
  converted** (§3). A region whose space differs from its page's space is
  kept verbatim and excluded from the fingerprint.
- Page dimensions are **never fabricated** (§6). No `page_geometry`
  observation ⇒ the page model is all-`null` / `unknown` — never "assume
  A4".

---

## 6. Page model

`TemplatePageModel { pageNumber, width, height, unit, coordinateSpace,
orientation, sourceDocumentIds, sourceObservationIds }`.

- `width` / `height` are `null` when unextractable.
- `unit` is derived from `coordinateSpace` (`pt` / `px` / `fraction` /
  `unknown`).
- `orientation` (`portrait` / `landscape` / `unknown`) is computed **only**
  when both dimensions are present.
- `isTemplatePageModel` **rejects** a page model that names a coordinate
  space with no coordinate (a false geometry claim).

Multi-page evidence is not forced into one page: `structuralRules.multiPage`
is `true` / `false` / `null` from the observed max page number.

---

## 7. Region model

`TemplateRegion { kind, geometry (CorpusRegion), pageRecurrence,
occurrenceCount, documentCount, confidence, sourceObservationIds,
sourceDocumentIds, note }`.

- `kind` ∈ `VISUAL_REGION_KIND` (16 values: `page`, `margin`, `header`,
  `footer`, `logo`, `title`, `document_metadata`, `recipient`, `subject`,
  `date`, `body`, `signature`, `attachment`, `page_number`, `divider`,
  `other`).
- `geometry` is stored as a **page-relative fraction** (`coordinateSpace:
  'normalized'`), full precision. When no source region had geometry it
  is `UNKNOWN_GEOMETRY` (all `null`) with a `note`.
- `pageRecurrence` (§16) is inferred **only** from ≥
  `minDocumentsForRecurrence` multi-page documents; otherwise `unknown`.
- Not every region exists on every page (§15).

Logo placement (§19) is geometry + provenance only — no binary asset is
embedded (`sourceFileId` on the underlying observations references the
`StoredFileRecord`). No "official logo" is guessed.

Signature block (§18) is a structured region (`kind: 'signature'`) —
geometry only, no signer identity, no personal data.

---

## 8. Template candidate model

`VisualTemplate` (`visual-template@1`):

```
{
  schema, visualTemplateSystemSchema, templateId (deterministic — §7),
  scope: 'organization',                            // §23 — the only value; a per-user template is impossible
  documentType: NOR | NOTA_ORGANISASI | MEMORANDUM | LEGACY | UNKNOWN | cross_type,   // §8
  variant: string,                                  // a deterministic layout-variant label (from the geometry fingerprint)
  status: proposed | approved | rejected | deprecated,   // §10
  authorityState: proposed | authoritative | not_authoritative,   // DERIVED from status — §11
  rationale: string|null,                           // human-written; REQUIRED non-empty when approved — §11
  pageModel: TemplatePageModel,                     // §6 (may be all-null = unknown)
  regions: TemplateRegion[],                        // §7
  typography: TemplateTypography,                   // §17 — nullable; carries nothing today (no font extractor)
  spacing: TemplateSpacing,                         // §17 — nullable
  structuralRules: { multiPage, headerRecurrence, footerRecurrence, pageNumberRecurrence, signatureOnFinalPageOnly },
  sourceDocumentIds: string[]  (>= 1 — §13),
  sourceObservationIds: string[] (>= 1 — §13),
  evidence: { documentCount, observationCount, pageCount, regionKinds[], coordinateSpaces[], geometryKnown },
  temporalEvidence: { temporalStatus, conventionEra, oldestSourceDate, latestSourceDate, recentDocumentCount, historicalDocumentCount, transitionalDocumentCount, undatedDocumentCount },   // §9 — EVIDENCE, not authority
  confidence: 0..1,                                 // carried through — NOT authority — §0
  templateVersion: integer >= 1,                    // supersession-chain position
  supersedesTemplateId: string|null, supersededByTemplateId: string|null,   // §12
  createdAt, createdBy, approvedAt, approvedBy, rejectedAt, rejectedBy, deprecatedAt, deprecatedBy,
  auditTrail: AuditEntry[]                          // append-only; first entry is VISUAL_TEMPLATE_PROPOSED
}
```

`isVisualTemplate` **rejects** a template with zero evidence ids, no
variant label, an `authorityState` that does not match its `status`, an
`approved` template with no rationale / `approvedBy` / `approvedAt`, or a
`proposed` / `rejected` template carrying approval metadata.
`makeVisualTemplate` always re-derives `authorityState` from `status`.

---

## 9. Document-type scope

The aggregator groups by `(documentType, geometryFingerprint)`. A
`MEMORANDUM` layout produces a `MEMORANDUM`-scoped pattern — **never** a
NOR template. A `LEGACY` layout keeps `documentType: 'LEGACY'`. A
`cross_type` pattern is produced only when a fingerprint explicitly spans
≥ 2 real document types.

---

## 10. Temporal semantics

`temporalEvidence` is computed per pattern from its source documents'
`sourceDate` using the **Phase 5.x.3 primitives** (`resolveTemporalWindows`
+ `bucketSourceDate`) and the same thresholds. It is **evidence, not
authority** (§9):

- `conventionEra === 'current'` does **not** make `authorityState ===
  'authoritative'`.
- `conventionEra === 'historical'` does **not** make a template `rejected`.
- `transitional` evidence does **not** make a layout invalid.

A historical layout and a current layout have different geometry ⇒
different fingerprints ⇒ **two patterns**, each with its own temporal
evidence (`historical_only` / `current_evidence`). Both are preserved
(§20).

---

## 11. Human approval

`approve` requires **all** of:

1. an authenticated actor — `request.auth.uid`, server-derived, never a
   client value;
2. effective-admin authorization — `canUseIntelligence(auth.token)`
   (`role === 'admin' \|\| adminEquivalent`). **No new permission**;
3. an explicit `templateId` in `proposed` status;
4. a **non-empty, non-whitespace** human-written `rationale`.

The server derives and owns `approvedBy` (= `auth.uid`), `approvedAt` (=
the server clock), `authorityState` (= `authoritative`), `templateVersion`
and `status`. A client-supplied `approvedBy` / `approvedAt` /
`authorityState` / `templateVersion` / `createdBy` / `status` / `templateId`
on any op payload is ignored — the CJS check asserts
`intelligenceVisualTemplate.js` reads **none** of them.

An **AI-generated rationale is not human approval.** The system never
generates one; an empty rationale is `RATIONALE_REQUIRED`. `reject` /
`deprecate` likewise require a `reason` (`REASON_REQUIRED`).

**Nothing** causes automatic approval (§0, §21): not visual frequency, not
confidence, not the newest document, not a `current` document, not
`current` temporal status.

---

## 12. Versioning

Approved templates are immutable. A layout change is **never** an in-place
edit:

1. `proposeFromEvidence({ patternId, supersedesTemplateId })` builds a new
   `proposed` template for the **same slot** (scope + documentType),
   `templateVersion = predecessor.templateVersion + 1`,
   `supersedesTemplateId = predecessor.templateId`. A slot mismatch is
   refused.
2. Approving that proposal **auto-deprecates** the predecessor:
   `predecessor.status → deprecated`, `predecessor.supersededByTemplateId =
   new.templateId`, a `VISUAL_TEMPLATE_DEPRECATED` +
   `VISUAL_TEMPLATE_SUPERSEDED` audit pair is appended.
3. The predecessor's `variant`, geometry, `rationale`, `approvedBy`,
   `approvedAt` and earlier audit entries are **unchanged** — a
   `deprecated` template retains its approval provenance.

`getVisualTemplateHistory` returns the full chain oldest → newest; every
version stays queryable. A re-`proposeFromEvidence` of an already-decided
slot layout (without a supersede link) is `TEMPLATE_EXISTS`.

---

## 13. Conflict handling

The Visual Template System **never** becomes a hidden majority-vote engine
(§20, §21).

- **Patterns:** two materially different layouts for one slot become two
  separate patterns + a `patternConflicts` entry keeping **both sides in
  full**. Layouts within the documented tolerance (§14) collapse to one
  pattern.
- **Approval:** approving a second layout for a slot that already has a
  different approved layout **fails closed** with `CONFLICT_UNRESOLVED`
  unless the caller either (a) supersedes the incumbent, or (b) passes
  `acknowledgeConflict: true` for a deliberate coexistence.
- **Resolution:** `resolveEffectiveTemplate({ scope, documentType })`
  returns exactly one of:
  - `resolved` — one effective approved layout (a linear supersession
    chain collapses to its newest link);
  - `conflict` — ≥ 2 distinct approved layouts; `template` is `null`,
    `competingTemplateIds` + `competing` (with page model + regions +
    evidence) are returned;
  - `missing` — no approved template for the slot.

  It **never** picks by frequency, confidence or recency (§21).
  `findVisualTemplateConflicts` surfaces every conflicted slot (approved or
  proposed).

---

## 14. Tolerance / geometric normalisation

Deterministic, configurable (`visual-template-config.js`), documented,
testable:

- **`pageSizeTolerancePt`** (default `6`) — two page sizes within this many
  pdf-points are "the same size". This is the **same** tolerance
  `deterministic-layout-analyzer.paperName()` already uses (reused, not
  re-invented — §14).
- **`pageRelativeDecimals`** (default `2`) — every region is normalised to
  a page-relative fraction (0..1 of page width/height) and rounded to this
  many decimal places **for the grouping fingerprint only** ⇒ a
  1%-of-page grid. The **stored** region geometry is never rounded.
- **`minDocumentsForPattern`** (default `2`) — a pattern needs ≥ this many
  distinct source documents.
- **`minDocumentsForRecurrence`** (default `2`) — recurrence inference
  needs ≥ this many multi-page documents; otherwise `unknown`.

---

## 15. Retrieval semantics

`visual-template-query.js` — pure, read-only, deterministic (sorted by
`templateId`):

| function | returns |
|---|---|
| `getEffectiveVisualTemplates(templates, filter?)` | **APPROVED templates only** — the default effective set. Proposed / rejected / deprecated are **never** included (§22), even when a filter is applied |
| `getProposedVisualTemplates(templates, filter?)` | the human review queue (`proposed`) |
| `queryVisualTemplates(templates, { status, documentType, scope, variant, includeSuperseded })` | the only place a caller can ask for `proposed` / `deprecated` (history) explicitly |
| `resolveEffectiveTemplate` / `findVisualTemplateConflicts` / `getVisualTemplateHistory` | as §13 / §12 |

**Not connected to any renderer.** No RAG, no model. This is the interface
a later phase will consume (§27).

---

## 16. Security model

- **Authorization** — `canUseIntelligence(auth.token)` (unchanged). No new
  permission, no per-user grant.
- **Actor** — always `request.auth.uid`. `createdBy` / `approvedBy` /
  `rejectedBy` / `deprecatedBy` are server-derived; a client value is
  never read (statically asserted).
- **Scope** — `organization`, fixed server-side. A personal user's
  approval cannot create a personal-only template. Reads are the
  effective-admin tier, organization-wide, server-enforced.
- **Zero-trust content** — `proposeFromEvidence` rebuilds the visual
  aggregation **server-side** from the caller's own corpus visual
  observations (`listByOwner` + `listObservations` by the verified `uid`)
  and looks the pattern up by `patternId`. A client-supplied `pattern` /
  `documents` / `templateId` / geometry is ignored. Verified: `bob` cannot
  propose from `alice`'s `patternId` (`PATTERN_NOT_FOUND`).
- **No forged authority** — `status`, `authorityState`, `templateVersion`,
  `createdBy`, `approvedBy/At`, `rejectedBy/At`, `deprecatedBy/At`,
  `auditTrail`, `scope` on any op payload are ignored; `makeVisualTemplate`
  re-derives `authorityState`.
- **Read-only ops** — `list` / `get` / `resolve` / `history` write nothing
  (DB byte-identical).
- **No secret / model / outbound HTTP / V1 / Petty Cash / NOR Registry /
  Style Guide / knowledge-write / feature-flag / renderer** coupling in
  the 3 server files (statically scanned).
- **Rules** — `/intelligence_visual_templates` `.write: false`; the
  additive block changes **0** existing rule keys; **not deployed**.

---

## 17. Audit model

- **On-record** — an append-only `auditTrail[]` on every template:
  `{ event, at, actorId, fromStatus, toStatus, version, detail }`. Events:
  `VISUAL_TEMPLATE_PROPOSED`, `VISUAL_TEMPLATE_APPROVED`,
  `VISUAL_TEMPLATE_REJECTED`, `VISUAL_TEMPLATE_DEPRECATED`,
  `VISUAL_TEMPLATE_SUPERSEDED`. The first entry is always
  `VISUAL_TEMPLATE_PROPOSED`. `detail` carries the rationale / reason /
  supersedes ids — **never** a secret, a token, or document body content.
- **Callable** — a metadata-only `logger.info` (`op`, `event`, `actor`,
  `templateId`, `ok`, `errorCode`, `status`, `authorityState`, `outcome`,
  `version`). Never the rationale text.

---

## 18. Rendering boundary

The future architecture is:

```
Style Guide  +  Visual Template  +  NOR content  →  (future) deterministic Document Renderer  →  NOR Draft  →  Human Review  →  Registry  →  Publish
```

This phase builds **only** the Visual Template layer. Untouched: the NOR
generator, NOR draft generation, NOR Registry, publication, Petty Cash
`generateNor`, the Style Guide, the OpenAI provider, RAG, KnowledgeItem
promotion, and any PDF renderer (`pdfmake` in `js/`).

---

## 19. Explicit non-goals

- wiring `intelligenceVisualTemplate` into `functions/index.js` + `firebase
  deploy` — a later step with its own review;
- deploying the `database.rules.json` block;
- any production UI / review console;
- the final PDF renderer; generating official NOR documents;
- a **manual-only** template type — every template is provably
  visual-evidence-derived this phase (§13);
- font extraction — `typography` is present but carries `null` until a real
  extractor exists (§17);
- embedding / choosing an "official" logo asset (§19);
- multi-tenant scope — the repo is single-organization;
- a model-based visual interpreter as the baseline — deterministic
  geometry is the baseline; a model analyzer stays an optional injected
  port (§26).

---

## 20. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-corpus-visual-template-check.mjs` | contract (evidence-backed, explicit coordinate space, geometry never fabricated, derived `authorityState`, never auto-`approved`); fixtures A–L (identical geometry → one candidate; within tolerance → same; materially different → two; historical + current preserved with temporal evidence; MEMORANDUM ≠ NOR; logo conflict → resolver `conflict`; proposed ≠ authoritative; human approval server-owned; forged fields ignored; v1 auto-deprecated + immutable + queryable; two approved → resolver `conflict`; missing geometry → unknown/null); state machine (rejected/deprecated terminal, no `approved → approved`, re-propose of a decided slot refused); reject/deprecate (actor + reason preserved, retained); retrieval (effective = approved only; `missing` vs `conflict`); determinism |
| `node scripts/intelligence-corpus-visual-template-check.cjs` | CJS ⇄ ESM drift parity (schemas / enums / graphs / field lists; `makeVisualTemplate` / `makeVisualTemplateProposalFromPattern` / `markApproved` / `resolveEffectiveTemplate` byte-identical); callable auth/authz/op matrix; `proposeFromEvidence` fail-safe `VISUAL_ANALYSIS_UNAVAILABLE` (0 writes); owner isolation (server rebuilds the aggregation from the caller's own corpus; client corpus/pattern/authority ignored); approve requires rationale + server actor/clock (Fixture I); conflict `CONFLICT_UNRESOLVED` + `acknowledgeConflict`; resolve → `conflict` (Fixture F/K); supersession auto-deprecates predecessor, v1 immutable + queryable (Fixture J); reject actor+reason; read-only ops write nothing; organization-wide read; static secret/model/HTTP/V1/Petty Cash/NOR Registry/Style Guide/knowledge/flag/renderer scan; `functions/index.js` staging assertion |

Both pass. **All 32** `scripts/intelligence-*` checks pass. Knowledge
(acquisition / promotion / review-workflow / ownership) + Organizational
Memory + Organizational Knowledge + Document Intelligence + NOR
(composition / signature-pagination / official-archive) + Petty Cash
Intelligence + permission-service + permission-runtime + role-management +
custom-roles + RTDB hardening functions + user/role permission-overrides-
rules + Vercel module-serving regression **green**.

**Two pre-existing, unrelated failures** — `rtdb-sibling-rules-check.mjs`
and `rtdb-hardening-phases-2to7-check.mjs`: both `JSON.parse` the
`//`-commented `database.rules.json` and fail at **position 2039 / line
68** — the Phase 1 (`d9f65ea`) comment, long before this phase. `git
stash` of `database.rules.json` back to `HEAD` fails at the **identical**
position. The Phase 5.x.6 block uses the same comment style as the
existing intelligence blocks and adds **0** changed rule keys
(deep-compared).

---

## 21. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `HEAD` = `d7f11da` (`docs(v2): record Phase 5 deploy details`).
- `/feature_flags/intelligence/enabled` still absent → OFF.
- OpenAI calls = 0. Model use = 0. RAG = none. Renderer integration = 0.
  Production Visual Template mutations = 0. Automatic approvals = 0.
  Knowledge promotions = 0. V1 unchanged.
- `intelligenceVisualTemplate` **NOT** in `functions/index.js`.
  `functions/index.js` unchanged.
- `database.rules.json` — one **additive**, undeployed
  `intelligence_visual_templates` block (`.write:false`, org-wide admin
  read, `.indexOn`). 0 changed existing keys.
- New files: `src/intelligence/corpus/visual-template/**` (13),
  `functions/src/intelligence/{visualTemplateContract,visualTemplateStore,intelligenceVisualTemplate}.js`
  (3), `scripts/intelligence-corpus-visual-template-check.{mjs,cjs}` (2),
  this doc. Modified: `src/intelligence/index.js` (+1 export block),
  `database.rules.json` (+1 block).

---

## 22. Known limitations

- **No true multi-write atomicity** for supersession (auto-deprecate is a
  second `.set` after the approve write). On a failure the resolver reports
  `conflict` (fails closed), not a silent bad state.
- **`proposeFromEvidence` needs the aggregator wired at deploy** (like
  `intelligenceCorpus`'s pipeline) — until then it returns
  `VISUAL_ANALYSIS_UNAVAILABLE`.
- **Typography / spacing carry `null` today** — no deterministic font
  extractor exists; the fields are the seam.
- **DOCX corpus documents carry no geometry** — a DOCX-only corpus yields
  `geometryKnown: false` patterns. Honest, not a bug.
- **Recurrence inference is conservative** — mostly `unknown` unless clear
  multi-page evidence.
- The two `rtdb-*` regression checks cannot parse the `//`-commented rules
  file (pre-existing since Phase 1).

---

## 23. Recommended next phase

**Phase 5.x.7 — Retrieval Integration** (a single certified retrieval
gateway over the approved Style Guide + approved Visual Templates + approved
corpus rules, for a future NOR generator to consult — read-only, still no
generation). Not implemented here.
