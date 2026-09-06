# V2 — Sarpras Intelligence Phase 6B: Deterministic Renderer Consumption

**Status:** the pure projection + renderer capability are implemented,
tested, and real-render-verified. **NOT committed, NOT pushed, NOT
deployed.** Feature flag OFF. Phase 6 sub-flag OFF. OpenAI calls: 0.
External HTTP from the new code: 0. Production mutations: 0. No V1 change
(proven, not just claimed — see §9). No Petty Cash change. No NOR Registry
numbering/publication change. **No `database.rules.json` change.**
`functions/index.js` **unchanged** (this phase touches only `js/docs/*` and
`src/intelligence/generation/*`).

> **§1 finding, read this first:** there is **no existing V2 code path that
> renders a NOR to PDF at all.** See §1 below. Phase 6B delivers the
> deterministic rendering adapter and makes the existing renderer CAPABLE
> of consuming it — both fully tested standalone — but does **not** invent
> a new "V2 draft → PDF" entry point, because that is a real, unscoped
> product decision (§14).

---

## 1. Architecture Discovery

### 1.1 The renderer (unchanged in structure, extended additively)

| Layer | File |
|---|---|
| Template registry + pdfmake export | [template-registry.js](js/docs/template-registry.js), [pdf-exporter.js](js/docs/pdf-exporter.js), [doc-engine.js](js/docs/doc-engine.js) |
| The `nor` template | [js/docs/templates/nor.js](js/docs/templates/nor.js) — `build(vm)` returns a pdfmake `DocumentDefinition` |
| Shared node builders | [js/docs/doc-theme.js](js/docs/doc-theme.js) — `orgLogo()`, `signatureBlock()`, `signatureGrid()`, `docFooter()` |
| Layout source of truth | [document-design-system.js](js/docs/design-system/document-design-system.js) — `getDesignSystem('nor')` → `NOR_V1` = `{page:{size:'A4',orientation:'portrait',margins:[56,40,56,40]}, …}`; `pageGeometry(ds)` → `{pageSize, pageOrientation, pageMargins}` |
| The ONE caller today | [nor-document-engine.js](js/petty-cash/nor-document-engine.js) `buildNorViewModel(nor)` → `DocumentEngine.generate('nor', vm)` — **V1 Petty Cash only** |

### 1.2 THE FINDING — no V2 renderer caller exists

Grepped every reference to `buildNorViewModel` / `DocumentEngine.generate('nor'` / `openNorDocument` / `generateNorBlob` across the repo. Every single one is either:
- the real V1 call site (`js/petty-cash/petty-cash-center.js`, `nor-pdf-exporter.js`), or
- a **documentation pointer** (`RENDERS_VIA = 'js/petty-cash/nor-document-engine.js#buildNorViewModel'` in [nor-draft-assembler.js:28](src/intelligence/service/nor-draft-assembler.js#L28), `rendersVia` in the response contract, `reusesViewModelBuilder` in `src/document-intelligence/nor/contracts/nor-draft-contract.js`) that explicitly says a future phase reuses the renderer — never a live call.

`src/intelligence/nor-registry/nor-registry.js` documents itself: *"does not itself persist, number, or render anything."* Phase 5's `publishNor` reserves an **official number**; it does not generate a PDF. **V2's entire pipeline stops at the structured draft record** (`requires_review → in_review → approved → published`, a number, not a document).

This means "teach the existing renderer to consume the certified Visual Template" cannot be end-to-end verified against a real V2 flow **because no V2 flow reaches the renderer at all today**. Building a live bridge (a V2-shaped view-model builder + a new "preview/print this draft" UI affordance + a decision about *when* in the lifecycle it's offered) is a **real, unscoped product decision** — not specified anywhere in the Phase 6B brief, and not something this phase invents unilaterally (§14).

### 1.3 What this phase does instead

It builds the two things that genuinely **are** "the smallest additive rendering adapter" and are fully verifiable on their own:

1. A **pure projection** (`resolveRenderingVisualModel`) from a Phase 6 `VisualBinding` to a renderer-ready model — testable with zero browser, zero pdfmake, zero V2 pipeline.
2. An **additive capability** in `js/docs/templates/nor.js` / `doc-theme.js` to consume that model — testable by calling `template.build(vm)` directly (exactly how the repository's own `nor-signature-pagination-check.mjs` already tests this file), with **no new caller required** to prove it works.

---

## 2. Rendering Adapter

New: [src/intelligence/generation/visual-rendering-model.js](src/intelligence/generation/visual-rendering-model.js) `resolveRenderingVisualModel(visualBinding)`.

```
generationContext.visual (VisualBinding, Phase 6/6A — already server-verified)
        ↓
resolveRenderingVisualModel()          ← PURE, no I/O, no pdfmake import
        ↓
{ schema, source, fidelity, templateId, templateVersion,
  page: {width,height}|null,           ← pdfmake pageSize-ready (points)
  margins: [l,t,r,b]|null,             ← pdfmake pageMargins-ready (points)
  logo: {x,y,width}|null,              ← pdfmake absolutePosition-ready (points)
  unsupportedRegions: [{kind,reason}], unsupportedFields: [{field,reason}] }
        ↓
vm.renderingVisualModel                ← an OPTIONAL field on the existing NOR view model
        ↓
js/docs/templates/nor.js#build(vm)     ← additive: absent ⇒ 100% unchanged
```

**Why it's safe:** it only ever consumes `source === 'approved_template'` (anything else — `deterministic_fallback`, a malformed binding, or an unrecognised value including a hypothetical future `'conflict'` literal — resolves to the same safe fallback, defence in depth per §6 of the brief); it validates every number (finite, positive, sanely bounded); it never generically spreads the untrusted input (every field read explicitly — no prototype-pollution surface); it treats `structuralRules`/`typography`/`spacing` as **inert data**, never interpreted; it is a plain function with no pdfmake/DOM/network import, independently testable.

---

## 3. Visual Template Mapping

| Template field | Mapping | Support |
|---|---|---|
| `pageModel` (`coordinateSpace: pdf_points`) | → pdfmake `pageSize: {width,height}` | **Full** |
| a `MARGIN` region | → pdfmake `pageMargins: [left,top,right,bottom]`, derived from the region's bounding box against the page | **Full** (needs a resolved page) |
| a `LOGO` region | → `absolutePosition` for the **existing, trusted, locally-embedded** PBSI logo asset (never a different/external image — §20) | **Partial** — position + width only |
| `HEADER`, `FOOTER`, `TITLE`, `DOCUMENT_METADATA`, `RECIPIENT`, `SUBJECT`, `DATE`, `SIGNATURE`, `ATTACHMENT`, `PAGE_NUMBER`, `DIVIDER`, `OTHER` | *(not applied this phase)* | **Unsupported** — disclosed via `unsupportedRegions`, never silently reinterpreted (§12) |
| `typography` | *(not applied this phase)* | **Unsupported** — disclosed via `unsupportedFields`. Reasoning: the NOR template's type hierarchy is per-field (title/body/table/signature each has its own explicit size in the Document Design System); a single global typography override would risk flattening that hierarchy without any way to visually verify it in this environment (§26 — "choose based on actual safety impact") |
| `spacing` | *(not applied this phase)* | **Unsupported** — same reasoning |
| `structuralRules` | *(not applied this phase)* | **Unsupported** — retained as data only; `signatureOnFinalPageOnly`-style rules touch pagination, which §22 explicitly says to preserve, not reinterpret |

**Region recurrence** (`pageRecurrence`): not consumed this phase — the three supported region kinds (page/margin/logo) are page-1-only concerns in the current NOR template; recurrence semantics are deferred to whichever future phase adds header/footer region support.

---

## 4. Coordinate Conversion — derived, not assumed (§10 of the brief)

Per `contracts/corpus-provenance-contract.js`'s own documented convention:

```
pdf_points  — 72/inch, origin BOTTOM-LEFT (PDF native)     [the contract's own comment]
pixels      — origin TOP-LEFT, raster unit, NO declared DPI anywhere in the contract
normalized  — 0..1 fraction; the contract does NOT pin an origin for this space
unknown     — never rendered
```

`js/docs/*` (pdfmake's JS API — `pageSize`, `pageMargins`, `absolutePosition`) is **top-left origin, y increasing downward**, in points — verified directly against the actual rendered PDF (§9): `nor.js`'s existing (unmodified) centered logo call resolves in the real PDF's content stream to a `cm` matrix whose derived vertical extent is exactly `[40, 101.29]` in PDF-native (bottom-up) terms, and `101.29 - 61.29(height) = 40` = the NOR template's own top margin — confirming pdfmake performs its own internal top-left→PDF-native flip for image placement, i.e. the **JS-facing API is top-left/y-down**, exactly as this module assumes.

The one explicit transform this module implements for `pdf_points` region geometry:

```js
topY = pageHeightPt - y - height   // (x,y) is the region's PDF-native BOTTOM-LEFT corner
```

Verified by hand and by test (`intelligence-visual-rendering-model-check.mjs`, fixture D): a margin region expressed in bottom-left `pdf_points` terms round-trips to exactly NOR v1's own `[56, 40, 56, 40]` margins.

`normalized` — **this module defines** its origin (the contract doesn't pin one): top-left/y-down, matching `pixels` — the natural "already-scaled pixels-or-points, divided by page size" reading. `x*pageWidthPt`, `y*pageHeightPt`. Documented as an explicit design decision, not a discovered fact.

`pixels` — **never converted.** Per the brief's own instruction ("require a deterministic DPI conversion IF the contract provides one") — it provides none anywhere. A pixel-space page or region is always `unsupported`.

---

## 5. Fallback Policy

| Situation | Result |
|---|---|
| `visualBinding.source !== 'approved_template'` (incl. `deterministic_fallback`, malformed, or an unrecognised value) | `fidelity: 'fallback'`; `page`/`margins`/`logo` all `null`; the existing renderer defaults apply untouched |
| page geometry missing / not `pdf_points` | `page: null`, disclosed as `unsupportedFields:[{field:'page'}]`; **margin and logo regions ALSO become unsupported** (no page reference frame to scale/flip against) |
| a region's coordinate space is `unknown` or `pixels` | that region `unsupported`, never guessed |
| a region kind isn't `page`/`margin`/`logo` | `unsupportedRegions`, never silently reinterpreted |
| numeric geometry is NaN / Infinity / negative / zero / absurdly large (>20000pt page, >5000pt region) | rejected, `null`, never fabricated |
| `typography` / `spacing` / `structuralRules` present | disclosed as `unsupportedFields`, never applied, never interpreted |
| a defensively-malformed model somehow reaches `nor.js` directly (bypassing the resolver) | `nor.js`'s own cheap `Number.isFinite` guard ignores it — falls back to the NOR v1 defaults, never throws, never hangs pdfmake (§35, §36 — a known historical failure class for this exact file, v1.28.11) |

Every fallback in this phase is a **hard fallback to the existing, already-shipping deterministic default** — never a partial/blended result presented as a full template application.

---

## 6. Pagination

Untouched. The three consumed fields (page size, margins, logo position) do not interact with pdfmake's `unbreakable`/`pageBreak` mechanics that protect the NOR's signature blocks from splitting across pages. Proven, not assumed: `nor-signature-pagination-check.mjs` (48 checks — structural + a real multi-page 1→11-page render sweep + a control run proving the scenario really would split without the existing fix) re-ran **green, unmodified**, after this phase's edits.

---

## 7. Provenance

Nothing new is persisted by this phase — Phase 6/6A's `draft.provenance.visualBinding` remains the one source `resolveRenderingVisualModel` would read from, whenever a future caller wires it in. The rendering model itself (`fidelity`, `unsupportedRegions`, `unsupportedFields`) is designed to feed a **future** compact provenance line ("PBSI Visual Template v2 — partial application, logo positioned, typography not yet applied") but no UI surface exists to show it yet, since no renderer call site exists to attach it to (§1).

---

## 8. Security

- **Only `approved_template` is ever consumed** — never a proposal, never `deterministic_fallback`'s absence-of-authority, never a raw/forged binding (the resolver's own gate + Phase 6A's server verification upstream).
- **No executable template content**: `structuralRules` is read only to check `typeof === 'object'` for disclosure — its contents are never stringified into code, never `eval`'d, never passed to `new Function`. Adversarially tested with a hostile payload carrying a `toString()` that throws if ever coerced — it is never coerced.
- **No prototype pollution surface**: every field is read via explicit property access (`visualBinding.pageModel.width`, etc.) — never a generic `Object.assign`/spread of the untrusted input. Adversarially tested with a `__proto__`-bearing payload — `Object.prototype` is provably untouched.
- **Numeric safety**: NaN / Infinity / negative / zero / absurd dimensions are all rejected (bounded at 20000pt for pages, 5000pt for regions) — never propagated into pdfmake, which is known to hang (not throw) on certain malformed geometry.
- **No external resources**: the logo is always the existing, locally-embedded `PBSI_LOGO_DATA_URI` — never a URL, never fetched, never swapped for a different asset.
- **No OpenAI, no network, no DOM** in the adapter (static-scanned).

---

## 9. V1 Safety

- Petty Cash's call path (`buildNorViewModel` → `nor.build(vm)`) never sets `vm.renderingVisualModel` — so every line touching it in `nor.js` is dead code for V1, proven three ways:
  1. **Structural**: `nor.build(makeVm())` (no model) produces `pageSize === 'A4'`, `pageMargins === NOR v1's own array`, and a logo node with `alignment:'center'` and no `absolutePosition` — the exact pre-Phase-6B shape.
  2. **Real render**: the legacy render's actual `/MediaBox` (extracted from the real, rendered PDF bytes) is `[0 0 595.28 841.89]` — genuine A4, unchanged.
  3. **Regression**: `nor-signature-pagination-check.mjs` (48 checks, pre-existing, unmodified) and `nor-composition-check.mjs` (24 checks) both re-ran green.
- `js/docs/doc-theme.js#orgLogo()`'s new `position` parameter defaults to unset; every existing caller (this template's own default path, plus any other template using `orgLogo()`) is unaffected.
- No V1 file was edited. No Petty Cash file was edited. No NOR Registry / numbering / publication file was edited.

---

## 10. Tests

| Check | Scope |
|---|---|
| `node scripts/intelligence-visual-rendering-model-check.mjs` (**new**) | fixtures A-J (fallback source, standard page, normalized conversion, pdf_points Y-flip, missing typography/spacing, missing page geometry, unknown coordinate space, unsupported region kind, malformed numerics, pixels-never-converted); adversarial (forged/garbage source incl. hypothetical "conflict", non-interpreted structuralRules with a throwing `toString()`, prototype-pollution payload, absurd dimensions); determinism; static (no eval/Function/network/DOM/pdfmake import, no generic spread of untrusted input) |
| `node scripts/nor-visual-rendering-check.mjs` (**new**, Puppeteer) | structural: legacy unchanged / full model applies page+margins+logo and nothing else / partial model leaves the rest at defaults / a defensively-malformed model never throws and falls back; real render (pdfmake 0.2.10 from cdnjs): legacy renders with the genuine unchanged A4 `/MediaBox`; a model-driven render produces a PDF whose real `/MediaBox` matches the model's dimensions **exactly**, byte-verified in the rendered PDF; a malformed model still renders successfully with the default A4 `/MediaBox` (proves the numeric guard prevents a pdfmake hang, not just that it "looks" prevented) |
| `node scripts/nor-signature-pagination-check.mjs` (pre-existing, re-run) | 48 checks, unmodified, all green — pagination/signature safety intact |
| `node scripts/nor-composition-check.mjs`, `official-nor-archive-check.mjs`, `document-intelligence-check.mjs`, `pettycash-intelligence-check.mjs` | re-run, all green |
| all 41 `scripts/intelligence-*-check.{mjs,cjs}` | re-run, all green (40 from Phase 6/6A + this phase's new pure adapter check) |

**Ad-hoc visual verification performed and then removed** (not part of the repo): generated two real PDFs via the exact production pdfmake/cdnjs pipeline — one legacy, one with a distinctly different page size (612×1008pt) + repositioned logo — and confirmed via the actual PDF bytes (`/MediaBox`, and the decompressed content-stream `cm` matrix for the logo's `Do` operator) that the page-size override and the logo's `width` parameter both flow through to the real, rendered PDF exactly as configured. **No PDF rasterizer (`pdftoppm`/poppler/ImageMagick/Ghostscript) was available in this environment**, so the *exact pixel position* of the repositioned logo was not independently confirmed by eye — see Known Limitations.

---

## 11. Production State

```
Feature flag:         OFF
Phase 6 sub-flag:      OFF
OpenAI:                0
External HTTP:         0
Production mutations:  0
Deployment:            NOT DEPLOYED
```

## 12. Git

```
NOT COMMITTED
NOT PUSHED
```
New: `src/intelligence/generation/visual-rendering-model.js`,
`scripts/intelligence-visual-rendering-model-check.mjs`,
`scripts/nor-visual-rendering-check.mjs`, this doc. Modified (additive):
`js/docs/templates/nor.js`, `js/docs/doc-theme.js`, `src/intelligence/index.js`
(one export block). `functions/index.js` and `database.rules.json`:
**untouched**.

## 13. Known Limitations

- **No V2 caller exists to invoke this path with a real draft** (§1/§14) —
  the single most important limitation of this phase. Everything here is
  verified in isolation (pure unit tests + direct `template.build(vm)`
  calls + real-PDF byte verification), never through an actual V2
  generate-draft-then-render flow, because that flow doesn't exist.
- **Only page size, margins, and logo position are applied.** Header,
  footer, title, metadata, recipient, subject, date, body, signature,
  attachment, page-number, and divider regions — plus typography, spacing,
  and structural rules — are recognised and disclosed but **not yet
  geometrically or visually applied**. A template that specifies only
  these will show `fidelity: 'partial'` (or `'fallback'` if it specifies
  none of the three supported kinds) — correctly, never overclaimed.
- **No PDF rasterizer was available in this environment** to visually
  (pixel-level) confirm the repositioned logo and margin geometry. Byte-
  level evidence (`/MediaBox`, the content-stream placement matrix, and
  hand-verified coordinate math) is strong but is not the same as a human
  looking at the rendered page. Recommend a visual QA pass (any machine
  with `pdftoppm`, or simply opening a generated PDF) before this path is
  ever wired to a live entrypoint.
- **`normalized` coordinate-space origin is a documented assumption**
  (top-left/y-down), not a fact pinned by the Phase 5.x.6 contract — there
  is currently no live producer of normalized region data in the corpus
  pipeline to contradict or confirm it either way.
- **The `pdf_points` "origin bottom-left" contract comment is currently
  exercised only by whole-page width/height** in the one live analyzer
  path (`deterministic-layout-analyzer.js`) — no current extractor
  populates per-region `x/y` in that space, so the Y-flip this phase
  implements is verified against the contract's own documentation and
  against pdfmake's real behaviour, but not yet against a real corpus-
  derived region.

## 14. Recommended Next Step

**This is a genuine decision point, not a default I should pick for you:**
should a follow-up phase build the missing V2 "render/preview this NOR
draft" capability at all — and if so, at what lifecycle stage (in review?
only after approval? only at publication?), from which UI affordance, and
via a new V2-shaped view-model builder (the existing `buildNorViewModel`
expects a V1 Petty Cash RTDB record shape, not a `NorDraftRecord`)? That is
a product surface decision this phase should not make unilaterally.

Absent that decision, the smallest next *technical* step, if wanted, is
narrow: extend region support to `HEADER`/`FOOTER` (the next-safest kinds,
since the template already has dedicated flow slots for them) with the
same fixture-and-real-render verification discipline used here — still
without inventing a V2 caller.
