/* ============================================================
   INDEX.JS — Knowledge Platform public barrel (V2, Phase 3)

   PURPOSE: the single lazy-load entry point for the Knowledge Platform
   core, mirroring js/engineering/index.js's barrel pattern, so Phase 4+
   callers reach contracts/registries/engines through one tree-shakeable
   surface instead of deep-importing.

   RESPONSIBILITY: re-export only. Adds no logic of its own.

   DEPENDENCIES: every module under knowledge/ except connectors/ (which
   has no code yet, only a README).

   NON-GOALS: not imported by anything outside js/v2/ in Phase 3 — see
   js/v2/README.md's dormancy rule.

   FUTURE EVOLUTION: as connectors are added under connectors/, they
   register themselves at their own module load time rather than being
   re-exported here (registration, not export, is the connector seam).
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
export * as metricsEngine from './metrics/knowledge-metrics-engine.js';
export * as explainabilityEngine from './explainability/knowledge-explainability-engine.js';
export * as reviewWorkflowEngine from './review/review-workflow-engine.js';
export * as dependencyGraphEngine from './dependency-graph/knowledge-dependency-graph-engine.js';

export * as services from './services/index.js';
