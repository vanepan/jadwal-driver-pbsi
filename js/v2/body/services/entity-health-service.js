/* ============================================================
   ENTITY-HEALTH-SERVICE.JS — Body Intelligence (V2, Phase 12.5.5)

   PURPOSE: pure delegation over health/entity-health-engine.js — mirrors
   entity-graph-service.js's identical role for the graph engine.

   DEPENDENCIES: health/entity-health-engine.js,
   health/registry/health-source-registry.js.
   ============================================================ */

'use strict';

export { computeEntityHealth } from '../health/entity-health-engine.js';
export { getHealthSource, hasHealthSource, listHealthSources } from '../health/registry/health-source-registry.js';
