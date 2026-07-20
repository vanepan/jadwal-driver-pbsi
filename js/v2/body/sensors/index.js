/* ============================================================
   INDEX.JS — Body Intelligence Sensors, opt-in barrel (V2, Phase 12.5.3)

   PURPOSE: the ONE place all 3 real pilot sensors are pulled in together
   — mirrors knowledge/connectors/'s equivalent opt-in role for nor-connector.js.
   Importing THIS file (not registry/sensor-registry.js, which
   deliberately excludes them) is what activates vehicle/driver/assignment
   sensing. body/index.js does NOT import this file — see that file's own
   header. Nothing in Phase 12.5 imports this file either; it exists for a
   later, separately-approved wiring sprint (see js/v2/body/README.md)
   and for scripts/body-sensors-check.mjs / scripts/body-ownership-check.mjs
   to import directly.

   RESPONSIBILITY: import (and thereby self-register) the 3 real sensors.

   DEPENDENCIES: sensors/{vehicle,driver,assignment}-sensor.js.

   NON-GOALS: no orchestration — see services/body-sensing-service.js for
   the sense -> observe -> record pipeline.
   ============================================================ */

'use strict';

import './vehicle-sensor.js';
import './driver-sensor.js';
import './assignment-sensor.js';

export { vehicleSensor } from './vehicle-sensor.js';
export { driverSensor } from './driver-sensor.js';
export { assignmentSensor } from './assignment-sensor.js';
