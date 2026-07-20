/* body-health-check.mjs — Phase 12.5.5, "Body Intelligence: Entity
   Health".

   Verifies computeEntityHealth() passes through the REAL
   js/services/vehicle-asset-service.js#normalizeVehicleAsset() score for
   Vehicle (cross-checked against calling that pure V1 service directly —
   it genuinely imports in plain Node, confirmed), falls back honestly to
   OBSERVABILITY_ONLY for entityTypes with no registered source (Driver,
   Assignment) or when no raw V1 record is supplied, and that the
   observability (freshness+completeness) formula behaves as documented.

   Deterministic. No Firebase (vehicle-asset-service.js is genuinely pure).
   Run: node scripts/body-health-check.mjs   (exit 0 = pass) */

import { normalizeVehicleAsset } from '../js/services/vehicle-asset-service.js';
import { ENTITY_HEALTH_MODE } from '../js/v2/body/contracts/entity-health-contract.js';
import { isEntityHealthReport } from '../js/v2/body/contracts/entity-health-contract.js';
import { ENTITY_STATE } from '../js/v2/body/contracts/entity-state-contract.js';
import { VISIBILITY, AI_CONTEXT_TAG, CAPABILITY } from '../js/v2/body/contracts/entity-vocabulary-contract.js';
import { generateEntityId } from '../js/v2/body/contracts/identity-contract.js';
import { computeEntityHealth } from '../js/v2/body/health/entity-health-engine.js';
import { getHealthSource, hasHealthSource, listHealthSources, resetHealthSourceRegistry } from '../js/v2/body/health/registry/health-source-registry.js';
import * as entityHealthService from '../js/v2/body/services/entity-health-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

function fixtureEntity(entityType, attributes, observedAt) {
  const id = generateEntityId({ entityType, sourceRef: 'x1' });
  return Object.freeze({
    id, version: 1, entityType, sourceRef: 'x1',
    attributes, observedState: ENTITY_STATE.ACTIVE, observedStateBasis: 'test',
    owner: { type: 'system', ref: 'test' }, capabilities: [CAPABILITY.ASSIGNABLE],
    relationshipIds: [], eventLogRef: id, lastHealthReportId: null, versionCount: 1,
    confidence: 1, observability: { sensorId: entityType, sensorVersion: 'test@1', observedAt, since: null },
    visibility: VISIBILITY.INTERNAL, aiContextTags: [AI_CONTEXT_TAG.OPERATIONAL],
    createdAt: observedAt, updatedAt: observedAt,
  });
}

console.log('\n[health-source-registry — Vehicle passthrough registered, Driver/Assignment honestly absent]');
{
  check('exactly 1 health source registered (vehicle)', listHealthSources().length === 1);
  check('vehicle is registered as SOURCE_PASSTHROUGH', hasHealthSource('vehicle') && getHealthSource('vehicle').mode === ENTITY_HEALTH_MODE.SOURCE_PASSTHROUGH);
  check('driver has NO registered source (honest — no standing V1 score to pass through)', !hasHealthSource('driver'));
  check('assignment has NO registered source', !hasHealthSource('assignment'));
  resetHealthSourceRegistry();
  check('resetHealthSourceRegistry re-bootstraps to the same single registration', listHealthSources().length === 1);
}

console.log('\n[Vehicle — real passthrough of js/services/vehicle-asset-service.js#normalizeVehicleAsset()]');
{
  const now = new Date().toISOString();
  const rawVehicle = {
    id: 'v1', name: 'Avanza 1', plateNumber: 'B 1 ABC', status: 'active',
    stnkExpiry: '2030-01-01', insuranceExpiry: '2030-01-01', annualTaxDue: '2030-01-01',
    brand: 'Toyota', model: 'Avanza', year: '2020', engineNumber: 'E1', chassisNumber: 'C1',
  };
  const entity = fixtureEntity('vehicle', { name: 'Avanza 1', plateNumber: 'B 1 ABC' }, now);
  const report = computeEntityHealth(entity, { rawSourceRecord: rawVehicle, now });
  check('a well-formed EntityHealthReport is produced', isEntityHealthReport(report));
  check('mode is SOURCE_PASSTHROUGH when a raw record is supplied for a registered entityType', report.mode === ENTITY_HEALTH_MODE.SOURCE_PASSTHROUGH);
  const directAsset = normalizeVehicleAsset(rawVehicle);
  check('sourceScore EXACTLY matches calling vehicle-asset-service.js directly — no second, drifted computation', report.sourceScore === directAsset.health.overall);
  check('sourceScoreOrigin names the real function it passed through (traceability)', report.sourceScoreOrigin.includes('vehicle-asset-service.js'));
  check('observabilityScore is STILL computed even in passthrough mode (a secondary signal, never dropped)', typeof report.observabilityScore === 'number');
}

console.log('\n[Vehicle WITHOUT a supplied raw record — honest fallback, never a fabricated passthrough]');
{
  const now = new Date().toISOString();
  const entity = fixtureEntity('vehicle', { name: 'Avanza 1' }, now);
  const report = computeEntityHealth(entity, { now });
  check('falls back to OBSERVABILITY_ONLY rather than guessing a source score', report.mode === ENTITY_HEALTH_MODE.OBSERVABILITY_ONLY);
  check('sourceScore is honestly null, not a stale/fabricated number', report.sourceScore === null);
}

console.log('\n[Driver / Assignment — no registered source, always OBSERVABILITY_ONLY]');
{
  const now = new Date().toISOString();
  const driverEntity = fixtureEntity('driver', { name: 'Budi', phone: '0800' }, now);
  const driverReport = computeEntityHealth(driverEntity, { now });
  check('driver health is OBSERVABILITY_ONLY (never a fabricated business score)', driverReport.mode === ENTITY_HEALTH_MODE.OBSERVABILITY_ONLY && driverReport.sourceScore === null);
  const assignmentEntity = fixtureEntity('assignment', { date: '2026-07-20' }, now);
  const assignmentReport = computeEntityHealth(assignmentEntity, { now });
  check('assignment health is OBSERVABILITY_ONLY', assignmentReport.mode === ENTITY_HEALTH_MODE.OBSERVABILITY_ONLY);
}

console.log('\n[Observability formula — freshness + completeness, deterministic]');
{
  const now = new Date('2026-07-20T12:00:00.000Z').toISOString();
  const fresh = fixtureEntity('driver', { name: 'Budi', phone: '0800' }, now);
  const stale = fixtureEntity('driver', { name: 'Budi', phone: '0800' }, '2026-01-01T00:00:00.000Z');
  const freshReport = computeEntityHealth(fresh, { now });
  const staleReport = computeEntityHealth(stale, { now });
  check('a just-observed entity scores higher observability than a stale one', freshReport.observabilityScore > staleReport.observabilityScore);
  check('a 30+ day stale observation floors at 0 freshness contribution', staleReport.observabilityScore <= 50);

  const complete = fixtureEntity('driver', { name: 'Budi', phone: '0800' }, now);
  const incomplete = fixtureEntity('driver', { name: '', phone: '' }, now);
  const completeReport = computeEntityHealth(complete, { now });
  const incompleteReport = computeEntityHealth(incomplete, { now });
  check('an entity with complete attributes scores higher than one with empty ones', completeReport.observabilityScore > incompleteReport.observabilityScore);
  check('observabilityScore always stays within [0,100]', [freshReport, staleReport, completeReport, incompleteReport].every((r) => r.observabilityScore >= 0 && r.observabilityScore <= 100));
}

console.log('\n[entity-health-service — pure delegation]');
{
  const now = new Date().toISOString();
  const entity = fixtureEntity('driver', { name: 'Budi' }, now);
  const direct = computeEntityHealth(entity, { now });
  const viaService = entityHealthService.computeEntityHealth(entity, { now });
  check('delegates identically', direct.mode === viaService.mode && direct.observabilityScore === viaService.observabilityScore);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
