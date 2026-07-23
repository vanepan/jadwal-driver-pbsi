/* ============================================================
   INDEX.JS — Gudang Foundation (public barrel) (Phase 1)

   Authorized by: Doc 1 Art.I · Doc 3 Ch.03 · Doc 4 Art.II

   The single lazy-load entry point for the Gudang module. A future
   Workspace route can `import('./gudang/index.js')` and reach the whole
   foundation — domain registry, contracts, repositories, projection, audit,
   search and settings — through one tree-shakeable surface, without
   deep-importing.

   This barrel adds NO logic; it only re-exports. No UI — Phase 1 builds
   none (see the Phase 1 brief's STRICTLY FORBIDDEN list).
   ============================================================ */

'use strict';

export * from './config/gudang-domain-registry.js';
export * from './config/gudang-paths.js';
export * from './config/gudang-categories.js';

export * from './contracts/text-normalization.js';
export * from './contracts/item-contract.js';
export * from './contracts/item-identity-rules.js';
export * from './contracts/movement-contract.js';
export * from './contracts/asset-contract.js';
export * from './contracts/location-contract.js';
export * from './contracts/department-contract.js';
export * from './contracts/stock-projection-contract.js';
export * from './contracts/search-result-contract.js';
export * from './contracts/audit-entry-contract.js';

export * from './repository/repository-result.js';
export * from './repository/item-repository.js';
export * from './repository/movement-repository.js';
export * from './repository/asset-repository.js';
export * from './repository/asset-history-repository.js';
export * from './repository/location-repository.js';
export * from './repository/department-repository.js';
export * from './repository/stock-repository.js';

export * from './projection/stock-projection-engine.js';
export * from './audit/audit-view.js';
export * from './search/search-resolver.js';
export * from './search/item-keyword-index.js';
export * from './settings/gudang-settings.js';
