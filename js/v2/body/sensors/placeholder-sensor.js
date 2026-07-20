/* ============================================================
   PLACEHOLDER-SENSOR.JS — Body Intelligence Sensor (V2, Phase 12.5.1)

   PURPOSE: one factory shared by every inactive sensor placeholder —
   mirrors knowledge/connectors/placeholder-connector.js exactly, so the
   16 non-pilot entity types named in the Phase 12.5 brief are real,
   listable, structurally valid Sensors without any of them reading
   anything yet. Several of these entity types (Vendor, Inventory,
   standalone Meeting, Workflow/Approval, standalone Organization Unit)
   have NO RTDB store at all today; Building/Room/Equipment are only
   static seeded taxonomies (js/engineering/master-data/
   engineering-master-data.js: "Seeded now; Firebase-backed later"). A
   sensor here must NEVER synthesize a plausible-looking entity to make
   the domain "feel complete" — that would fabricate the object itself,
   not just a fact about it, the single worst violation of CLAUDE.md's
   "never invent" possible in this domain.

   RESPONSIBILITY: produce a Sensor whose sense() always returns a
   NOT_IMPLEMENTED SensorResult.

   DEPENDENCIES: contracts/sensor-contract.js only.

   NON-GOALS: no source is read, no V1 module is imported.

   FUTURE EVOLUTION: activating one of these means replacing its `sense`
   body with a real implementation (mirroring sensors/vehicle-sensor.js's
   shape) once V1 actually grows the entity type a real store — the id
   stays the same, so the registry entry does not change.
   ============================================================ */

'use strict';

import { senseFailure, SENSOR_ERRORS } from '../contracts/sensor-contract.js';

/**
 * @param {string} entityType
 * @param {string} description
 * @returns {import('../contracts/sensor-contract.js').Sensor}
 */
export function makePlaceholderSensor(entityType, description) {
  function sense(/* since */) {
    return senseFailure(
      SENSOR_ERRORS.NOT_IMPLEMENTED,
      `The "${entityType}" sensor is an inactive placeholder — no source is wired yet.`,
      { sensorId: entityType },
    );
  }
  return Object.freeze({
    id: entityType,
    entityType,
    version: `${entityType}-sensor@0-stub`,
    description,
    sense,
  });
}
