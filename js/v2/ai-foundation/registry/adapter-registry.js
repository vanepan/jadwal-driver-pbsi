/* ============================================================
   ADAPTER-REGISTRY.JS — AI Foundation (V2, Phase 3)

   PURPOSE: the single process-wide directory of AI adapters, mirroring
   js/prediction/prediction-provider.js's registry.

   RESPONSIBILITY: register/get/list adapters and track which one (if any)
   is active. Unlike prediction-provider.js — which always has a working
   default ('rule') — this registry bootstraps with three stubs and NO
   active adapter, because there is no working provider yet to default to.

   DEPENDENCIES: ai-foundation/contracts/adapter-contract.js,
   ai-foundation/adapters/{claude,openai,local-model}-adapter.js (stubs).

   NON-GOALS: no adapter is ever called by this registry. `setActiveAdapter`
   exists so Phase 4+ can select a real adapter once one exists; nothing in
   Phase 3 calls it.

   FUTURE EVOLUTION: Phase 4+ implements one real adapter's `query()` body
   and calls `setActiveAdapter(id)` — no registry shape change required.
   ============================================================ */

'use strict';

import { isAdapter } from '../contracts/adapter-contract.js';
import { claudeAdapter } from '../adapters/claude-adapter.js';
import { openaiAdapter } from '../adapters/openai-adapter.js';
import { localModelAdapter } from '../adapters/local-model-adapter.js';

export const ADAPTER_REGISTRY_ERRORS = Object.freeze({
  INVALID_ADAPTER: 'INVALID_ADAPTER',
  UNKNOWN_ADAPTER: 'UNKNOWN_ADAPTER',
});

const _adapters = new Map();
let _activeId = null;

export function registerAdapter(adapter) {
  if (!isAdapter(adapter)) {
    const err = new Error('registerAdapter: adapter must be { id, provider, version, query() }.');
    err.code = ADAPTER_REGISTRY_ERRORS.INVALID_ADAPTER;
    throw err;
  }
  _adapters.set(adapter.id, adapter);
  return adapter;
}

export function getAdapter(id) {
  return _adapters.get(id) || null;
}

export function listAdapters() {
  return Object.freeze([..._adapters.values()].map((a) => Object.freeze({
    id: a.id,
    provider: a.provider,
    version: a.version,
    active: a.id === _activeId,
  })));
}

/** No adapter is active by default — every registered adapter is a stub. */
export function setActiveAdapter(id) {
  if (!_adapters.has(id)) {
    const err = new Error(`setActiveAdapter: no adapter registered under "${id}".`);
    err.code = ADAPTER_REGISTRY_ERRORS.UNKNOWN_ADAPTER;
    throw err;
  }
  _activeId = id;
  return _adapters.get(id);
}

export function getActiveAdapter() {
  return _adapters.get(_activeId) || null;
}

export function getActiveAdapterId() {
  return _activeId;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetAdapterRegistry() {
  _adapters.clear();
  _activeId = null;
  bootstrap();
}

function bootstrap() {
  registerAdapter(claudeAdapter);
  registerAdapter(openaiAdapter);
  registerAdapter(localModelAdapter);
  // Deliberately no setActiveAdapter() call — no adapter is active by
  // default, unlike prediction-provider.js's always-working 'rule' default.
}

bootstrap();
