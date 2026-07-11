# ai-foundation/ — Adapter Layer Only (Phase 3, dormant)

## Purpose

The ONLY place any LLM/AI-provider-specific code may live under `js/v2/`
(Decision 7, architecture doc §4.2.7). AI is a replaceable client of the
Knowledge Platform, never its foundation — `knowledge/` must remain fully
buildable, queryable, and reviewable with zero AI providers registered,
forever.

## Responsibility

- Define the one Adapter contract every provider (Claude, OpenAI, a local
  model, any future one) conforms to.
- Provide an adapter registry, mirroring
  `js/prediction/prediction-provider.js`'s registry.
- Provide three stub adapters — `claude-adapter.js`, `openai-adapter.js`,
  `local-model-adapter.js` — each `NOT_IMPLEMENTED`, exactly like
  `js/prediction/python-provider.js` is today.

## Dependencies

- May depend on `js/v2/knowledge/` (read-only — an adapter's `query()` may
  be given a knowledge context to cite against).
- Must never be depended on by `js/v2/knowledge/`, in either direction, at
  any phase.

## Non-goals (Phase 3)

- No adapter calls any LLM, makes any network request, or requires any API
  key. Every `query()` returns a predictable `NOT_IMPLEMENTED` result.
- No adapter is registered as "active" — there is no default the way
  `js/prediction/prediction-provider.js` defaults to `'rule'`, because there
  is no working provider yet to default to.

## Future evolution

Swapping Claude for OpenAI, Gemini, or a local model should mean writing one
new adapter file and registering it — zero changes to `knowledge/` code,
ever (the literal test of Decision 7). The first real adapter implementation
is Phase 4+ work, independent of Knowledge Platform's own connector
build-out (they can proceed in either order).
