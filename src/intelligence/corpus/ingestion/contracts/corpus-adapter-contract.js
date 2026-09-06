/* ============================================================
   CORPUS-ADAPTER-CONTRACT.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: fix the ONE shape every corpus pipeline adapter conforms to —
   an extractor, a page renderer, a visual analyzer, a model analyzer.
   Mirrors the Stage / Connector / Provider / ArchiveSource /
   DocumentAnalyzer family already used across V2:

       { id, version, kind, run(input) -> Promise<result> }

   Every adapter is REPLACEABLE. A `null` adapter is always the default,
   so the whole pipeline is dormant and deterministic-only until real
   adapters are registered (§14 — "the ingestion pipeline must fail
   safely" when a capability is unavailable).

   RESPONSIBILITY: ADAPTER_KIND, isCorpusAdapter, a tiny registry helper
   (registerAdapter / getAdapter / listAdapters / resetAdapters) keyed by
   `${kind}:${id}`.

   DEPENDENCIES: none.

   NON-GOALS: implements no adapter.
   ============================================================ */

'use strict';

export const CORPUS_ADAPTER_SCHEMA = 'corpus-adapter@1';

export const ADAPTER_KIND = Object.freeze({
  EXTRACTOR: 'extractor',
  PAGE_RENDERER: 'page_renderer',
  VISUAL_ANALYZER: 'visual_analyzer',
  MODEL_ANALYZER: 'model_analyzer',
});

export function isCorpusAdapter(a) {
  return !!a && typeof a === 'object'
    && typeof a.id === 'string' && a.id.length > 0
    && typeof a.version === 'string' && a.version.length > 0
    && Object.values(ADAPTER_KIND).includes(a.kind)
    && typeof a.run === 'function';
}

const _adapters = new Map();

export function registerAdapter(adapter) {
  if (!isCorpusAdapter(adapter)) {
    const err = new Error('registerAdapter: adapter must be { id, version, kind, run }.');
    err.code = 'INVALID_ADAPTER';
    throw err;
  }
  _adapters.set(`${adapter.kind}:${adapter.id}`, adapter);
  return adapter;
}

export function getAdapter(kind, id) {
  return _adapters.get(`${kind}:${id}`) || null;
}

export function listAdapters(kind) {
  return Object.freeze([..._adapters.values()]
    .filter((a) => !kind || a.kind === kind)
    .map((a) => Object.freeze({ id: a.id, version: a.version, kind: a.kind })));
}

export function resetAdapters() {
  _adapters.clear();
}
