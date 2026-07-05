/* ============================================================
   ADAPTIVE-SEARCH.JS — Module-aware global search architecture (v1.20.2)

   ONE global search box, many module adapters. The topbar search delegates to
   the adapter registered for the active module through a common interface, and
   the placeholder swaps automatically. Modules keep owning HOW they filter —
   this layer only routes.

   Adapter interface:
     {
       id:          string,                 // module id (matches activeRailModule)
       placeholder: string,                 // topbar placeholder for this module
       run(query:string): void,             // apply the query to the module
       clear?():   void,                    // optional: reset (defaults to run(''))
     }

   Driver / Engineering / Petty Cash → real data filtering.
   Analytics → adaptive contextual search (jump / highlight / scroll), not row
   filtering, because a KPI dashboard has no list to filter.

   PURE registry: no DOM, no globals. Consumers register concrete adapters.
   ============================================================ */

'use strict';

const _adapters = new Map();

export const DEFAULT_PLACEHOLDER = 'Cari…';

/** Register (or replace) a module's search adapter. */
export function registerSearchAdapter(adapter) {
  if (!adapter || !adapter.id || typeof adapter.run !== 'function') {
    throw new Error('registerSearchAdapter: adapter needs { id, run(query) }');
  }
  _adapters.set(adapter.id, adapter);
  return adapter;
}

/** The adapter for a module id, or null. */
export function getSearchAdapter(moduleId) {
  return _adapters.get(moduleId) || null;
}

/** Whether a module has a registered adapter. */
export function hasSearchAdapter(moduleId) {
  return _adapters.has(moduleId);
}

/** The placeholder for a module (falls back to the default). */
export function searchPlaceholder(moduleId) {
  const a = _adapters.get(moduleId);
  return (a && a.placeholder) ? a.placeholder : DEFAULT_PLACEHOLDER;
}

/** Delegate a query to a module's adapter. No-op when none is registered. */
export function runModuleSearch(moduleId, query) {
  const a = _adapters.get(moduleId);
  if (a && typeof a.run === 'function') a.run(query || '');
}

/** Clear a module's search (adapter.clear, else run('')). */
export function clearModuleSearch(moduleId) {
  const a = _adapters.get(moduleId);
  if (!a) return;
  if (typeof a.clear === 'function') a.clear();
  else a.run('');
}

/** All registered module ids (for tests / introspection). */
export function registeredModules() {
  return [..._adapters.keys()];
}
