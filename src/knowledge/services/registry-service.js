/* ============================================================
   REGISTRY-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: one introspection surface over every registry in the platform —
   domainType, kind, connector, stage, repository, and (from ai-foundation)
   adapter — so a future admin/diagnostic view has one module to import
   instead of five.

   RESPONSIBILITY: pure composition — each function delegates to exactly
   one existing registry's own `listX()`.

   DEPENDENCIES: knowledge/registry/domain-type-registry.js,
   knowledge/registry/kind-registry.js,
   knowledge/registry/connector-registry.js,
   knowledge/builder/stage-registry.js,
   knowledge/repository/repository-registry.js.
   Deliberately does NOT import js/v2/ai-foundation/ (Knowledge must never
   depend on ai-foundation, per the frozen dependency direction) — an
   adapter listing, if ever needed alongside this, belongs in an
   ai-foundation-side service, not here.

   NON-GOALS: no mutation methods (register/setActive) are re-exposed here
   — this is read-only introspection; callers needing to register or
   activate something call the specific registry directly.

   FUTURE EVOLUTION: unchanged as new registries are added — each gets one
   more delegated function here.
   ============================================================ */

'use strict';

import { listDomainTypes } from '../registry/domain-type-registry.js';
import { listKinds } from '../registry/kind-registry.js';
import { listConnectors } from '../registry/connector-registry.js';
import { listStages } from '../builder/stage-registry.js';
import { listRepositories } from '../repository/repository-registry.js';

export function getPlatformRegistrySnapshot() {
  return Object.freeze({
    domainTypes: listDomainTypes(),
    kinds: listKinds(),
    connectors: listConnectors(),
    stages: listStages(),
    repositories: listRepositories(),
  });
}

export { listDomainTypes, listKinds, listConnectors, listStages, listRepositories };
