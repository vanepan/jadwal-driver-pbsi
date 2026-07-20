/* ============================================================
   BODY-CONTEXT-BUILDER.JS — Body Intelligence (V2, Phase 12.5.6)

   PURPOSE: assemble a Body Context — "what exists, where, what state,
   what it's related to, how healthy, what recently happened" — for a
   scoped set of entities. Mirrors
   conversation/context/context-builder.js's exact discipline: PURE
   composition (every field is a real, already-computed slice of an
   existing read-only engine/service, never a new statistic, never a
   prompt), recomputed fresh on every call, honest graceful degradation
   when unscoped (an empty context, never a guess).

   THIS FILE SHIPS WITH ZERO CALLERS OUTSIDE ITS OWN TEST SUITE. Same bar
   js/v2/index.js sets for the whole platform, and the same precedent
   ai-foundation's adapters and reasoning/'s Phase 4-7 additions both
   shipped under. Wiring this into
   conversation/context/context-builder.js (as an additive field) or
   reasoning/reasoning-engine.js is EXPLICITLY deferred to a later,
   separately-approved sprint — see js/v2/body/README.md for the full
   argument: whether a live operational fact should ever be able to
   influence NOR composition is a real governance decision, not a side
   effect of this file existing.

   BODY FACTS ARE NEVER A CITATION SOURCE FOR reasoning/reasoning-engine.js
   #reason(). A live `observedState` is DESCRIPTIVE ("this vehicle is
   currently in maintenance"), never NORMATIVE ("this vehicle may not be
   dispatched") — reason()'s cite-or-abstain machinery only ever cites
   Approved KnowledgeItems of kind rule/policy, a human-reviewed
   normative statement. This file does not change that, and nothing here
   is reachable from reason() regardless.

   RESPONSIBILITY: buildBodyContext({entityType, entityIds}).

   DEPENDENCIES (read-only, one-way, all within body/):
   services/entity-service.js, services/entity-graph-service.js,
   services/entity-health-service.js, repository/body-event-repository.js
   (list/getForEntity — the safe, public-reads tier; see that file's own
   ownership note).
   ============================================================ */

'use strict';

import { getEntity, listEntities } from '../services/entity-service.js';
import { getNeighbors } from '../services/entity-graph-service.js';
import { computeEntityHealth } from '../services/entity-health-service.js';
import { getForEntity } from '../repository/body-event-repository.js';

function dedupeById(items) {
  const seen = new Map();
  for (const item of items) seen.set(item.id, item);
  return [...seen.values()];
}

/**
 * @param {{entityType?: string|null, entityIds?: string[]}} [args]
 * @returns {{
 *   entityType: string|null,
 *   entities: Array<{id, entityType, observedState, attributes, confidence}>,
 *   relationships: Array<{id, fromEntityId, toEntityId, type}>,
 *   health: import('../contracts/entity-health-contract.js').EntityHealthReport[],
 *   recentEvents: import('../contracts/body-event-contract.js').BodyEvent[],
 *   explain: {sensorsQueried: string[], asOf: string},
 *   builtAt: string,
 * }}
 */
export function buildBodyContext({ entityType = null, entityIds = [] } = {}) {
  const asOf = new Date().toISOString();

  if (!entityType && (!entityIds || entityIds.length === 0)) {
    // Domain-less graceful degradation — same discipline
    // conversation/context/context-builder.js follows for a falsy
    // domainType: an honest, mostly empty Context, never a guess.
    return { entityType: null, entities: [], relationships: [], health: [], recentEvents: [], explain: { sensorsQueried: [], asOf }, builtAt: asOf };
  }

  let entities;
  if (entityIds && entityIds.length > 0) {
    entities = entityIds.map((id) => getEntity(id)).filter((r) => r.ok).map((r) => r.data);
  } else {
    const listed = listEntities({ entityType });
    entities = listed.ok ? listed.data : [];
  }

  const relationships = [];
  const health = [];
  const recentEvents = [];
  const sensorsQueried = new Set();

  for (const entity of entities) {
    sensorsQueried.add(entity.observability.sensorId);

    const neighborsResult = getNeighbors(entity.id);
    if (neighborsResult.ok) relationships.push(...neighborsResult.data.map((n) => n.relationship));

    // No rawSourceRecord available at this layer (see
    // health/entity-health-engine.js's header) — every report here is
    // honestly OBSERVABILITY_ONLY unless a future wiring sprint supplies
    // one; never a fabricated passthrough score.
    health.push(computeEntityHealth(entity, { now: asOf }));

    const eventsResult = getForEntity(entity.id);
    if (eventsResult.ok) recentEvents.push(...eventsResult.data);
  }

  return {
    entityType,
    entities: entities.map((e) => ({
      id: e.id, entityType: e.entityType, observedState: e.observedState, attributes: e.attributes, confidence: e.confidence,
    })),
    relationships: dedupeById(relationships).map((r) => ({ id: r.id, fromEntityId: r.fromEntityId, toEntityId: r.toEntityId, type: r.type })),
    health,
    recentEvents: recentEvents.sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()),
    explain: { sensorsQueried: [...sensorsQueried], asOf },
    builtAt: asOf,
  };
}
