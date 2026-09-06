# `src/intelligence/generation/` — Certified Retrieval → NOR Generation (Phase 6)

The **controlled boundary** between Phase 5.x.7 Certified Retrieval and the
NOR generator. It answers one question deterministically:

> Given the current state of **approved** organizational knowledge, may the
> NOR generator proceed — and with which authoritative wording rules and
> which approved layout?

It is **pure**: no retrieval, no resolution, no ranking, no storage, no
model call, no DOM, no Firebase, no secret. Given the same
`nor-retrieval-context@1` snapshot it produces a byte-identical
`intelligence-generation-context@1`.

```
retrieveNorContext(...)                         Phase 5.x.7 — the ONE retrieval
        │  nor-retrieval-context@1
        ▼
evaluateGenerationContext(ctx)                  certification-gate.js
        │  GENERATION_ALLOWED | _WITH_FALLBACK | _BLOCKED_CONFLICT
        │  | _BLOCKED_UNAVAILABLE | _BLOCKED_INCOMPLETE
        ▼
buildGenerationContext(ctx, { mode })           build-generation-context.js  ← the consumer entrypoint
        ├─ resolveStyleSlots(ctx, gate)         style-slot-resolver.js
        └─ bindVisualTemplate(ctx, gate)        visual-template-binding.js
        ▼
intelligence-generation-context@1              generation-context-contract.js
        ▼
assembleNorDraft({ …, generationStyleContext, visualBinding, generationContext })
```

## Files

| File | Role |
|---|---|
| `contracts/generation-context-contract.js` | `intelligence-generation-context@1`. Modes, gate outcomes, generation status, the named `GENERATION_STYLE_SLOT` vocabulary + the deterministic `STYLE_SLOT_CATEGORY_MAP`, the `STYLE_SLOT_SOURCE` / `VISUAL_BINDING_SOURCE` taxonomies, `makeGenerationContext` / `isGenerationContext`. |
| `certification-gate.js` | `evaluateGenerationContext(retrievalContext)` — the one deterministic gate. Never inspects confidence / frequency / recency. Fail-closed. **Hybrid incomplete policy**: missing Style Guide ⇒ fallback + warning; missing Visual Template ⇒ **block**. |
| `style-slot-resolver.js` | Projects `retrievalContext.styleGuide.rules[]` (already APPROVED + resolved by 5.x.7) onto the wording slots. Reads only the certified context. |
| `visual-template-binding.js` | Turns `retrievalContext.visualTemplate` into a render directive or the deterministic-fallback marker. Geometry passed through untouched — `null` stays `null`, never fabricated. |
| `generation-fallbacks.js` | Names the established deterministic default for each slot + the reason string a reviewer sees. **Holds no document wording and no geometry** — those live only in `js/docs/*` and `nor-draft-assembler.js`. |
| `build-generation-context.js` | The one composer: gate → style → visual → conflict refs → snapshot ids. |

CJS mirror: `functions/src/intelligence/generationContextContract.js`
(drift-guarded by `scripts/intelligence-nor-generation-check.cjs`). Server
callable: `functions/src/intelligence/intelligenceNorGeneration.js` —
**STAGED, not in `functions/index.js`, not deployed.**

## What this layer must never do

- promote evidence (Writing Memory, corpus, confidence, frequency,
  recency) into authority;
- approve, publish, number, or resolve a conflict;
- pick a side of a conflict by any heuristic;
- query the Style Guide / Visual Template store, Writing Memory or the
  corpus directly (one retrieval boundary — Phase 5.x.7);
- fabricate page size, margins, coordinates, fonts or spacing;
- change V1, Petty Cash `generateNor()`, the `js/docs` renderer, the NOR
  Registry numbering, or publication;
- run while `/feature_flags/intelligence/enabled` is not `true`
  (`GENERATION_MODE.LEGACY` is the default and only reachable mode).

See `docs/V2_SARPRAS_INTELLIGENCE_PHASE_6_CERTIFIED_RETRIEVAL_NOR_GENERATION.md`.
