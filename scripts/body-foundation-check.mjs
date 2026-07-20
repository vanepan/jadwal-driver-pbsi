/* body-foundation-check.mjs — Phase 12.5.1, "Body Intelligence: Contracts +
   Registries".

   Verifies: every contract's structural validator accepts a real fixture
   and rejects a malformed one; entity-type-registry carries all 19 named
   entityTypes; sensor-registry bootstraps exactly the 16 placeholders
   (never the 3 pilot types) and every one of them honestly refuses with
   NOT_IMPLEMENTED; contracts/ + registry/ + index.js never import V1 or
   Firebase (a persistent invariant — the 3 real pilot sensors added in
   Phase 12.5.3 live in sensors/, not here, and are checked separately by
   body-ownership-check.mjs).

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/body-foundation-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENTITY_SCHEMA, isEntity } from '../js/v2/body/contracts/entity-contract.js';
import { ENTITY_STATE, isEntityState, DEFERRED_ENTITY_STATES } from '../js/v2/body/contracts/entity-state-contract.js';
import { generateEntityId, nextVersion } from '../js/v2/body/contracts/identity-contract.js';
import { CAPABILITY, VISIBILITY, AI_CONTEXT_TAG, defaultVisibilityFor } from '../js/v2/body/contracts/entity-vocabulary-contract.js';
import { isSensor, senseSuccess, senseFailure, SENSOR_ERRORS } from '../js/v2/body/contracts/sensor-contract.js';
import { ENTITY_RELATIONSHIP_TYPE, makeEntityRelationship, isEntityRelationship } from '../js/v2/body/contracts/entity-relationship-contract.js';
import { BODY_EVENT_TYPE, makeBodyEvent, isBodyEvent } from '../js/v2/body/contracts/body-event-contract.js';
import { ENTITY_HEALTH_MODE, makeEntityHealthReport, isEntityHealthReport } from '../js/v2/body/contracts/entity-health-contract.js';
import {
  registerEntityType, hasEntityType, getEntityType, listEntityTypes, resetEntityTypeRegistry,
} from '../js/v2/body/registry/entity-type-registry.js';
import {
  getSensor, hasSensor, listSensors, resetSensorRegistry,
} from '../js/v2/body/registry/sensor-registry.js';
import { BODY_PHASE, BODY_DORMANT } from '../js/v2/body/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function filesUnder(dir) {
  const out = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(r);
      else if (entry.name.endsWith('.js')) out.push(r);
    }
  }(dir));
  return out;
}

function makeFixtureEntity(overrides = {}) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateEntityId({ entityType: 'vehicle', sourceRef: 'v1' }),
    version: 1,
    entityType: 'vehicle',
    sourceRef: 'v1',
    attributes: { name: 'Avanza 1', plateNumber: 'B 1 ABC' },
    observedState: ENTITY_STATE.ACTIVE,
    observedStateBasis: "vehicles.status='active'",
    owner: { type: 'system', ref: 'vehicles-store' },
    capabilities: [CAPABILITY.ASSIGNABLE],
    relationshipIds: [],
    eventLogRef: generateEntityId({ entityType: 'vehicle', sourceRef: 'v1' }),
    lastHealthReportId: null,
    versionCount: 1,
    confidence: 1,
    observability: { sensorId: 'vehicle', sensorVersion: 'vehicle-sensor@1', observedAt: now, since: null },
    visibility: VISIBILITY.INTERNAL,
    aiContextTags: [AI_CONTEXT_TAG.OPERATIONAL],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

console.log('\n[Entity contract]');
{
  check('ENTITY_SCHEMA is versioned', ENTITY_SCHEMA === 'entity@1');
  check('a well-formed Entity passes isEntity()', isEntity(makeFixtureEntity()));
  check('a missing entityType is rejected', !isEntity(makeFixtureEntity({ entityType: undefined })));
  check('an unregistered entityType is rejected', !isEntity(makeFixtureEntity({ entityType: 'not-a-real-type' })));
  check('an invalid observedState is rejected', !isEntity(makeFixtureEntity({ observedState: 'deprecated' })));
  check('a confidence outside [0,1] is rejected', !isEntity(makeFixtureEntity({ confidence: 1.5 })));
  check('an unregistered capability is rejected', !isEntity(makeFixtureEntity({ capabilities: ['not-a-capability'] })));
  check('version < 1 is rejected', !isEntity(makeFixtureEntity({ version: 0 })));
}

console.log('\n[Identity]');
{
  check('generateEntityId is deterministic per (entityType, sourceRef)', generateEntityId({ entityType: 'vehicle', sourceRef: 'v1' }) === 'vehicle:v1');
  check('generateEntityId throws on empty sourceRef', (() => { try { generateEntityId({ entityType: 'vehicle', sourceRef: '' }); return false; } catch { return true; } })());
  check('nextVersion is reused from knowledge/, not reimplemented', nextVersion(1) === 2);
}

console.log('\n[Entity state — 5-value MVP enum, deferred values documented not implemented]');
{
  check('exactly 5 shipped states', Object.values(ENTITY_STATE).length === 5);
  check('isEntityState accepts every shipped value', Object.values(ENTITY_STATE).every(isEntityState));
  check('isEntityState rejects a deferred value (e.g. "emergency")', !isEntityState('emergency'));
  check('deferred states are documented, not silently dropped', DEFERRED_ENTITY_STATES.includes('deprecated') && DEFERRED_ENTITY_STATES.includes('future') && DEFERRED_ENTITY_STATES.includes('desired'));
}

console.log('\n[Entity vocabulary]');
{
  check('defaultVisibilityFor restricts budget/petty_cash/employee', defaultVisibilityFor('budget') === VISIBILITY.RESTRICTED && defaultVisibilityFor('petty_cash') === VISIBILITY.RESTRICTED && defaultVisibilityFor('employee') === VISIBILITY.RESTRICTED);
  check('defaultVisibilityFor defaults everything else to internal', defaultVisibilityFor('vehicle') === VISIBILITY.INTERNAL && defaultVisibilityFor('totally-unknown-type') === VISIBILITY.INTERNAL);
}

console.log('\n[Sensor contract]');
{
  const stub = Object.freeze({ id: 'x', entityType: 'x', version: 'x@1', description: 'x', sense: () => senseFailure(SENSOR_ERRORS.NOT_IMPLEMENTED, 'x', { sensorId: 'x' }) });
  check('a well-formed Sensor passes isSensor()', isSensor(stub));
  check('an object missing sense() fails isSensor()', !isSensor({ id: 'x', entityType: 'x', version: 'x@1', description: 'x' }));
  const ok = senseSuccess([makeFixtureEntity()], { sensorId: 'vehicle' });
  check('senseSuccess envelope is frozen and carries entities', ok.ok === true && Object.isFrozen(ok) && ok.entities.length === 1);
  const bad = senseFailure(SENSOR_ERRORS.NOT_IMPLEMENTED, 'nope', { sensorId: 'x' });
  check('senseFailure never carries entities', bad.ok === false && bad.entities === null);
}

console.log('\n[Entity Relationship contract — disambiguated from Knowledge Graph]');
{
  const rel = makeEntityRelationship({ id: 'r1', fromEntityId: 'assignment:a1', toEntityId: 'vehicle:v1', type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE, derivedFrom: { sensorId: 'assignment', field: 'vehicle' } });
  check('a well-formed EntityRelationship passes isEntityRelationship()', isEntityRelationship(rel));
  check('derivedFrom traceability is required', !isEntityRelationship({ ...rel, derivedFrom: undefined }));
  check('only the 2 real relationship types exist this phase', Object.values(ENTITY_RELATIONSHIP_TYPE).length === 2);
}

console.log('\n[Body Event contract — no version field, never revised]');
{
  const ev = makeBodyEvent({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId: 'vehicle:v1', entityType: 'vehicle', sensorId: 'vehicle' });
  check('a well-formed BodyEvent passes isBodyEvent()', isBodyEvent(ev));
  check('BodyEvent carries no version field (immutable, append-only by construction)', !('version' in ev));
  const failEv = makeBodyEvent({ type: BODY_EVENT_TYPE.SENSE_FAILED, entityId: null, entityType: 'vendor', sensorId: 'vendor' });
  check('SENSE_FAILED may carry a null entityId and still validate', isBodyEvent(failEv));
}

console.log('\n[Entity Health contract — third, disambiguated health concept]');
{
  const h = makeEntityHealthReport({ id: 'h1', entityId: 'vehicle:v1', entityType: 'vehicle', mode: ENTITY_HEALTH_MODE.SOURCE_PASSTHROUGH, sourceScore: 82, sourceScoreOrigin: 'test', observabilityScore: 100 });
  check('a well-formed EntityHealthReport passes isEntityHealthReport()', isEntityHealthReport(h));
  check('observabilityScore is always required, even in passthrough mode', !isEntityHealthReport({ ...h, observabilityScore: undefined }));
}

console.log('\n[entity-type-registry — 19 registered entityTypes]');
{
  check('exactly 19 entityTypes registered', listEntityTypes().length === 19);
  check('the 3 pilot types are registered', hasEntityType('vehicle') && hasEntityType('driver') && hasEntityType('assignment'));
  check('16 more placeholder-only types are registered (e.g. vendor, meeting, organization_unit)', hasEntityType('vendor') && hasEntityType('meeting') && hasEntityType('organization_unit') && hasEntityType('knowledge') && hasEntityType('policy'));
  check('registering vocabulary alone does not activate a real sensor (vendor is registered, its sensor still refuses NOT_IMPLEMENTED)', getEntityType('vendor').label === 'Vendor' && getSensor('vendor').sense(null).ok === false);
  resetEntityTypeRegistry();
  check('resetEntityTypeRegistry re-bootstraps to the same 19', listEntityTypes().length === 19);
}

console.log('\n[sensor-registry — exactly the 16 placeholders bootstrapped, NEVER the 3 pilots]');
{
  check('exactly 16 sensors registered at bootstrap', listSensors().length === 16);
  check('the 3 pilot sensors are NOT registered here (dormancy-by-omission)', !hasSensor('vehicle') && !hasSensor('driver') && !hasSensor('assignment'));
  check('every placeholder sensor honestly refuses with NOT_IMPLEMENTED', listSensors().every((s) => {
    const result = getSensor(s.id).sense(null);
    return result.ok === false && result.error.code === SENSOR_ERRORS.NOT_IMPLEMENTED && result.entities === null;
  }));
  resetSensorRegistry();
  check('resetSensorRegistry re-bootstraps to the same 16 (not 19 — vocabulary != liveness)', listSensors().length === 16);
}

console.log('\n[body/index.js — dormant barrel, same shape as js/v2/index.js]');
{
  check('BODY_PHASE is declared', BODY_PHASE === '12.5');
  check('BODY_DORMANT is true', BODY_DORMANT === true);
  const src = stripComments(read('js/v2/body/index.js'));
  check('body/index.js imports nothing (structural no-op, same as js/v2/index.js)', !/\bimport\b/.test(src));
}

console.log('\n[Persistent invariant — contracts/ + registry/ + index.js never import V1 or Firebase]');
{
  const V1_OR_FIREBASE_RE = /firebase\.js|vehicles-store\.js|drivers-store\.js|drivers\.js|assignments\.js|requests\.js|petty-cash-store\.js|overtime-store\.js|engineering-provider\.js/;
  const scoped = [...filesUnder('js/v2/body/contracts'), ...filesUnder('js/v2/body/registry'), 'js/v2/body/index.js'];
  const offenders = [];
  for (const rel of scoped) {
    const code = stripComments(read(rel));
    const imports = code.match(/from\s*'([^']*)'/g) || [];
    for (const imp of imports) {
      if (V1_OR_FIREBASE_RE.test(imp)) offenders.push(`${rel} -> ${imp}`);
    }
  }
  check(`no V1/Firebase import anywhere in contracts/, registry/, or index.js${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
