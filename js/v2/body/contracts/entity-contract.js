/* ============================================================
   ENTITY-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the one shape every operational object takes in Body
   Intelligence, regardless of entityType — this domain's equivalent of
   knowledge/contracts/knowledge-item-contract.js's KnowledgeItem. An
   Entity is a READ MODEL, never a system of record: it is always a
   projection of a V1 record that already has its own identity, its own
   store, and its own authority (js/vehicles-store.js stays the only
   writer of a vehicle, forever). See js/v2/body/README.md §1 for the full
   argument this contract embodies.

   RESPONSIBILITY: define the Entity typedef, its field-vs-ref split, and
   a structural validator. `entityType` is validated against
   registry/entity-type-registry.js — never a hardcoded switch, the same
   discipline knowledge-item-contract.js follows for `domainType`/`kind`.

   FIELD VS. REF (why each field is shaped the way it is — see the Phase
   12.5 plan §2 for the full table):
     - Identity/Attributes/State/Owner/Capabilities/Confidence/
       Observability/Visibility/AI-context-tags are INLINE fields — small,
       computed once per sensor read, owned by no other engine.
     - Relationships are a REF (`relationshipIds`) — owned by
       graph/entity-relationship-graph-engine.js / the relationship
       repository; embedding edges here would duplicate that engine's own
       storage, the exact anti-pattern knowledge/'s own README calls out
       for its KnowledgeGraph.
     - Events are a REF (`eventLogRef`) — owned by the append-only
       body-event-repository.js; embedding would break append-only and
       grow this row unboundedly.
     - Health is a REF (`lastHealthReportId`, nullable) — computed lazily/
       on its own cadence by health/entity-health-engine.js, often a
       pass-through of a V1 score; inlining would force recomputation on
       every sensor tick even when nothing health-relevant changed.
     - History is a REF (`versionCount` + repository `getHistory(id)`) —
       the append-only repository already IS the history.

   DEPENDENCIES: registry/entity-type-registry.js,
   contracts/entity-state-contract.js, contracts/entity-vocabulary-contract.js.

   NON-GOALS: this module does not create, persist, or version an Entity —
   see repository/entity-repository.js (Phase 12.5.2). It does not decide
   health or corroboration — see health/entity-health-engine.js. It never
   grants write authority back into V1 — an Entity has no field or method
   that could express one.

   FUTURE EVOLUTION: a new entityType is a registry entry
   (registry/entity-type-registry.js) plus a sensor — this contract should
   not need to change shape to accommodate it.
   ============================================================ */

'use strict';

import { hasEntityType } from '../registry/entity-type-registry.js';
import { isEntityState } from './entity-state-contract.js';
import { isCapability, isVisibility, isAiContextTag } from './entity-vocabulary-contract.js';

export const ENTITY_SCHEMA = 'entity@1';

/**
 * @typedef {Object} EntityOwner
 * @property {string} type   - e.g. 'system' (every V1-sourced Entity today) | 'organization_unit' (reserved, unused until that entity type has real V1 backing)
 * @property {string|null} ref
 */

/**
 * @typedef {Object} EntityObservability
 * @property {string} sensorId
 * @property {string} sensorVersion
 * @property {string} observedAt   - ISO 8601
 * @property {string|null} since   - the incremental watermark this read was scoped from, or null for a full read
 */

/**
 * @typedef {Object} Entity
 * // ── Identity ──────────────────────────────────────────────
 * @property {string} id                    - see contracts/identity-contract.js#generateEntityId
 * @property {number} version               - monotonically increasing per id; append-only, never an overwrite
 * @property {string} entityType            - registry-backed, e.g. 'vehicle' | 'driver' | 'assignment' | ...
 * @property {string} sourceRef             - the V1 record's own id/key this Entity projects
 * // ── Attributes ────────────────────────────────────────────
 * @property {Object} attributes            - entityType-shaped snapshot the sensor decided was load-bearing; never the raw V1 record verbatim
 * // ── State ─────────────────────────────────────────────────
 * @property {string} observedState         - one of ENTITY_STATE (entity-state-contract.js) — DERIVED, never platform-gated
 * @property {string} observedStateBasis    - which raw V1 field/value produced it, e.g. "vehicles.status='maintenance'"
 * // ── Owner ─────────────────────────────────────────────────
 * @property {EntityOwner} owner
 * // ── Capabilities ──────────────────────────────────────────
 * @property {string[]} capabilities        - closed, registry-backed (entity-vocabulary-contract.js#CAPABILITY)
 * // ── Relationships (ref) ───────────────────────────────────
 * @property {string[]} relationshipIds
 * // ── Events (ref) ──────────────────────────────────────────
 * @property {string} eventLogRef           - usually === id
 * // ── Health (ref) ──────────────────────────────────────────
 * @property {string|null} lastHealthReportId
 * // ── History (ref) ─────────────────────────────────────────
 * @property {number} versionCount
 * // ── Confidence ────────────────────────────────────────────
 * @property {number} confidence            - 0-1: freshness/completeness of THIS snapshot — NOT a business score, disjoint from health
 * // ── Observability ─────────────────────────────────────────
 * @property {EntityObservability} observability
 * // ── Permissions / Visibility ──────────────────────────────
 * @property {string} visibility            - closed, registry-backed (entity-vocabulary-contract.js#VISIBILITY)
 * // ── AI Context ────────────────────────────────────────────
 * @property {string[]} aiContextTags       - closed, registry-backed (entity-vocabulary-contract.js#AI_CONTEXT_TAG); labels only, never generated prose
 * @property {string} createdAt             - ISO 8601
 * @property {string} updatedAt             - ISO 8601
 */

export const ENTITY_CONTRACT = Object.freeze({
  schema: ENTITY_SCHEMA,
  fields: Object.freeze([
    'id', 'version', 'entityType', 'sourceRef', 'attributes',
    'observedState', 'observedStateBasis', 'owner', 'capabilities',
    'relationshipIds', 'eventLogRef', 'lastHealthReportId', 'versionCount',
    'confidence', 'observability', 'visibility', 'aiContextTags',
    'createdAt', 'updatedAt',
  ]),
});

/**
 * Structural validity check — NOT a persistence guard. Confirms an object
 * has every required field of the right rough shape, and that entityType/
 * observedState/capabilities/visibility/aiContextTags are registered
 * values, never a hardcoded switch.
 * @param {*} e
 * @returns {boolean}
 */
export function isEntity(e) {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.id !== 'string' || !e.id) return false;
  if (typeof e.version !== 'number' || e.version < 1) return false;
  if (typeof e.entityType !== 'string' || !hasEntityType(e.entityType)) return false;
  if (typeof e.sourceRef !== 'string' || !e.sourceRef) return false;
  if (!e.attributes || typeof e.attributes !== 'object') return false;
  if (!isEntityState(e.observedState)) return false;
  if (typeof e.observedStateBasis !== 'string') return false;
  if (!e.owner || typeof e.owner !== 'object' || typeof e.owner.type !== 'string') return false;
  if (!Array.isArray(e.capabilities) || !e.capabilities.every(isCapability)) return false;
  if (!Array.isArray(e.relationshipIds)) return false;
  if (typeof e.eventLogRef !== 'string' || !e.eventLogRef) return false;
  if (e.lastHealthReportId !== null && typeof e.lastHealthReportId !== 'string') return false;
  if (typeof e.versionCount !== 'number' || e.versionCount < 1) return false;
  if (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 1) return false;
  if (!e.observability || typeof e.observability !== 'object' || typeof e.observability.sensorId !== 'string') return false;
  if (!isVisibility(e.visibility)) return false;
  if (!Array.isArray(e.aiContextTags) || !e.aiContextTags.every(isAiContextTag)) return false;
  return true;
}
