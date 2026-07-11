/* ============================================================
   STATISTICS-SERVICE.JS — Knowledge Services (V2.0.12)

   PURPOSE: the public surface for numeric knowledge statistics — real
   since V2.0.9's machine-learning/statistics-engine.js, never before
   exposed through the services façade.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: machine-learning/statistics-engine.js.

   NON-GOALS: no new math — explicitly NOT reimplementing anything
   statistics-engine.js already computes.

   FUTURE EVOLUTION: unchanged as statistics-engine.js's aggregates
   are extended.
   ============================================================ */

'use strict';

import { computeFieldStatistics, computeStatistics } from '../machine-learning/statistics-engine.js';

export { computeFieldStatistics, computeStatistics };
