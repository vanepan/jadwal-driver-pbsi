/* ============================================================
   METRICS-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for KnowledgeHealthReport, so a future
   dashboard imports one module rather than reaching into
   knowledge-metrics-engine.js directly.

   RESPONSIBILITY: pure delegation. No computation lives here — see
   knowledge/metrics/knowledge-metrics-engine.js for where it does.

   DEPENDENCIES: knowledge/metrics/knowledge-metrics-engine.js.

   NON-GOALS: no caching, no scheduling of when metrics are (re)computed —
   every call recomputes from the live repository state.

   FUTURE EVOLUTION: if computing on every call becomes expensive at scale,
   caching is added HERE, transparently to callers.
   ============================================================ */

'use strict';

import { computeHealthReport } from '../metrics/knowledge-metrics-engine.js';

export { computeHealthReport };
