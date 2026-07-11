/* ============================================================
   HEALTH-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: "Knowledge Health" as its own named service, per the master
   prompt's Phase 6 list — a thin alias over metrics-service.js's
   `healthScore`/`coveragePct` fields, kept separate so a future health
   widget can depend on the narrower name without pulling in the full
   KnowledgeHealthReport shape conceptually.

   RESPONSIBILITY: composition only — no new computation (would duplicate
   knowledge-metrics-engine.js).

   DEPENDENCIES: knowledge/services/metrics-service.js.

   NON-GOALS: none beyond what metrics-service.js already excludes.

   FUTURE EVOLUTION: if "health" and "metrics" genuinely diverge in the
   future (e.g. health gains alerting thresholds metrics doesn't need),
   this file is where that divergence starts — today they are the same
   data, viewed narrowly.
   ============================================================ */

'use strict';

import { computeHealthReport } from './metrics-service.js';

/** Just the health-at-a-glance fields, not the full KnowledgeHealthReport. */
export function getHealthSummary() {
  const result = computeHealthReport();
  if (!result.ok) return result;
  const { healthScore, coveragePct, pendingReviewCount, learningQueueCount } = result.data;
  return { ok: true, error: null, data: Object.freeze({ healthScore, coveragePct, pendingReviewCount, learningQueueCount }) };
}
