/* ============================================================
   INDEX.JS — Knowledge Platform public barrel (V2, Phase 3 / Phase 9)

   PURPOSE: the single lazy-load entry point for the Knowledge Platform
   core, mirroring js/engineering/index.js's barrel pattern, so callers
   reach contracts/registries/engines through one tree-shakeable surface
   instead of deep-importing.

   RESPONSIBILITY: re-export only. Adds no logic of its own.

   DEPENDENCIES: every module under knowledge/ except connectors/ and
   builder/stages/ (deliberately excluded — see NON-GOALS).

   NON-GOALS: does NOT re-export knowledge/connectors/ or
   knowledge/builder/stages/. The `nor` connector transitively loads the
   real Firebase SDK (js/petty-cash/petty-cash-store.js -> js/firebase.js);
   folding it into this barrel would mean any caller of this file — even
   one that only wants LIFECYCLE_STATE — silently loads live Firebase
   machinery. Getting real connectors/stages requires importing
   knowledge/connectors/index.js or knowledge/builder/stages/index.js
   explicitly. This preserves the dormancy rule (js/v2/README.md) for this
   barrel specifically, even though connectors/ itself is no longer empty.

   FUTURE EVOLUTION: acquisition/ is safe to include here (no V1
   dependency of its own — it only resolves whatever's already registered
   in connector-registry.js at call time).
   ============================================================ */

'use strict';

export * from './contracts/knowledge-item-contract.js';
export * from './contracts/lifecycle-contract.js';
export * from './contracts/identity-contract.js';
export * from './contracts/explainability-contract.js';
export * from './contracts/source-weight-contract.js';
export * from './contracts/connector-contract.js';
export * from './contracts/dependency-graph-contract.js';
export * from './contracts/review-contract.js';
export * from './contracts/metrics-contract.js';

export * as language from './language/index.js';

export * from './registry/domain-type-registry.js';
export * from './registry/kind-registry.js';
export * from './registry/connector-registry.js';

export * as repository from './repository/index.js';
export * as lifecycleEngine from './lifecycle/lifecycle-engine.js';
export * as builder from './builder/index.js';
export * as acquisition from './acquisition/index.js';
export * as observability from './observability/index.js';
export * as metricsEngine from './metrics/knowledge-metrics-engine.js';
export * as explainabilityEngine from './explainability/knowledge-explainability-engine.js';
export * as review from './review/index.js';
export * as promotion from './promotion/index.js';
export * as learning from './learning/index.js';
export * as extraction from './extraction/index.js';
export * as machineLearning from './machine-learning/index.js';
export * as dependencyGraphEngine from './dependency-graph/knowledge-dependency-graph-engine.js';

export * as services from './services/index.js';
