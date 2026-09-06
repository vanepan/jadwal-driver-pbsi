# src/intelligence/corpus/visual-template — PBSI Visual Template System (V2, Phase 5.x.6)

> Status: **dormant, feature-flagged off, no UI, not deployed.** The Null
> backend is active by default, so every store call returns
> `NOT_IMPLEMENTED` until a real backend is registered. No OpenAI call, no
> model, no RAG, no renderer wiring, no NOR-generator / NOR Registry /
> Petty Cash / Style Guide / knowledge mutation. See
> `docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X6_VISUAL_TEMPLATE.md`.

## What this is

The **visual authority layer** — a sibling of the PBSI NOR Style Guide
(Phase 5.x.5). The Style Guide governs LANGUAGE / convention; this governs
PHYSICAL / document presentation.

```
VISUAL EVIDENCE  →  VISUAL OBSERVATIONS  →  VISUAL PATTERN (observed structure)
   (a PDF's                (CorpusObservation           │
    /MediaBox,              category 'layout',          │
    positioned blocks)      modality 'visual')          │
                                                        ▼
                              ── human proposal + explicit approval ──
                                                        ▼
                              PBSI VISUAL TEMPLATE            (AUTHORITY)
                                                        │
                                                        ▼
                              (future) deterministic Document Renderer
```

> **Visual evidence is not visual policy.
> A repeated layout is not automatically an official template.
> Only explicit human approval creates authoritative template authority.**

## The template lifecycle

```
proposed ──▶ approved ──▶ deprecated
    │
    └──────▶ rejected
```

- `proposed` — a candidate built **only** from an aggregated visual pattern
  (`makeVisualTemplateProposalFromPattern`). `rationale` is `null`.
- `approved` — a human with an authenticated actor id supplied a
  **non-empty written rationale**. `authorityState` (derived from `status`)
  becomes `authoritative` — the only state the future renderer reads.
- `rejected` / `deprecated` — retained terminal states. Nothing is deleted.
- Changing an approved template = a **new** superseding proposal
  (`supersedesTemplateId`); approving it auto-deprecates the predecessor,
  which stays queryable via `supersededByTemplateId` and the history chain.

Frequency, confidence, `documentEra`, temporal status, cross-type evidence
and any (optional) model output can justify a **candidate** — never an
**approval** (§0, §13, §21).

## Geometry discipline

- Coordinate spaces are **always explicit** and reused verbatim from the
  corpus provenance contract (`pdf_points` origin bottom-left, `pixels`
  origin top-left, `normalized` 0..1, `unknown`).
- Coordinates from **different spaces are never silently converted** — a
  region whose space differs from its page's space is kept verbatim and
  excluded from the grouping fingerprint.
- Page sizes / regions are **never fabricated** — an unextractable value is
  `null` / `unknown` (never "assume A4").
- Stored geometry keeps **full float precision**; rounding happens only in
  the grouping fingerprint (a configurable, documented 1%-of-page grid).
- Page-size tolerance is `±6pt` — the **same** tolerance
  `deterministic-layout-analyzer.paperName()` already uses.

## Layout

```
visual-template/
  contracts/
    visual-template-contract.js         pbsi-visual-template@1: VISUAL_TEMPLATE_STATUS (+ graph + human-gated),
                                        VISUAL_AUTHORITY_STATE (DERIVED from status), VISUAL_TEMPLATE_DOCUMENT_TYPE,
                                        VISUAL_REGION_KIND, VISUAL_PAGE_RECURRENCE, COORDINATE_SPACE (re-export),
                                        makeTemplateGeometry/PageModel/Region/Typography/Spacing, visualTemplateIdFrom,
                                        makeVisualTemplate / isVisualTemplate
    visual-template-store-contract.js    the backend interface + VisualTemplateResult envelope + VISUAL_TEMPLATE_ERRORS
  visual-template-config.js             DEFAULT_VISUAL_TEMPLATE_CONFIG (enabled=false master switch; geometryTolerance;
                                        Phase 5.x.3 temporal windows) + validated setter
  visual-observation.js                 isVisualLayoutObservation, visualObservationRegionKind, pageGeometryOf, regionOf
  visual-evidence-aggregator.js         aggregateVisualEvidence({ observations, documents }, config) → VisualEvidenceReport
                                        { patterns[], patternConflicts[] } — deterministic; observed pattern, NOT a template
  visual-template-proposal.js           makeVisualTemplateProposalFromPattern (never approved, never fabricates a rationale),
                                        buildVisualTemplateProposals (+ preserves conflicts), makeSupersedingVisualTemplateProposal
  visual-template-authority.js          markApproved (actor + non-empty rationale REQUIRED), markRejected, markDeprecated
  visual-template-query.js              getEffectiveVisualTemplates (APPROVED only), resolveEffectiveTemplate
                                        (resolved | conflict | missing — never picks by frequency),
                                        findVisualTemplateConflicts, getVisualTemplateHistory
  backends/
    null-visual-template-backend.js     the inert default — NOT_IMPLEMENTED
    memory-visual-template-backend.js   in-process; real lifecycle, conflict gate, resolver; tests + DISABLED mode
    callable-visual-template-backend.js thin adapter over the (staged) intelligenceVisualTemplate function
  visual-template-store.js              THE facade — backend registry + events + 8 delegating methods
```

## Storage / server boundary

| RTDB node | Writer | Reader |
|---|---|---|
| `/intelligence_visual_templates/{templateId}` | `intelligenceVisualTemplate` Cloud Function (Admin SDK) — `.write: false` | effective admin (`role === 'admin' \|\| 'developer' \|\| adminEquivalent`) — organization-wide, **not** owner-scoped |

**STAGED, not live (Phase 5.x.6 §33):** `intelligenceVisualTemplate.js` is
authored but **not** wired into `functions/index.js`; the rule block is in
`database.rules.json` but **not** deployed. The CJS check exercises the
callable via `.run()`, exactly like `intelligenceStyleGuide`.

## The one allowed integration (§27)

`Visual Evidence → aggregation → pattern → Visual Template proposal`, and
`Visual Template → read-only retrieval`. **No renderer.** The NOR
generator, NOR draft/registry, publication, Petty Cash `generateNor`, the
Style Guide, the OpenAI provider, RAG and KnowledgeItem promotion are all
untouched.

## Verification

- `node scripts/intelligence-corpus-visual-template-check.mjs` — contract, aggregation, proposal, authority, state machine, conflicts, versioning, retrieval, effective-template resolution, no-automatic-authority, determinism, fixtures A–L
- `node scripts/intelligence-corpus-visual-template-check.cjs` — CJS ⇄ ESM drift parity; the STAGED `intelligenceVisualTemplate` callable auth/authz/op matrix; `proposeFromEvidence` fail-safe + owner isolation; server strips client authority fields; approve requires rationale + server actor; supersession auto-deprecates; resolve returns conflict not a frequency pick; static scan; `functions/index.js` staging assertion
