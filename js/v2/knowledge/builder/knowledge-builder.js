/* ============================================================
   KNOWLEDGE-BUILDER.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: the public entry point — "run registered connectors, turn their
   output into Draft KnowledgeItems, hand them to the repository" — built
   on top of builder-orchestrator.js's real pipeline sequencer. Commits to
   Decision 9 (incremental indexing) as an architectural constraint.

   RESPONSIBILITY: `runIncremental()` / `runFull()` build a Pipeline from
   whatever stages are currently registered (stage-registry.js) and hand it
   to `runPipeline()`. With zero stages registered (true today — no
   connector exists yet), a run genuinely completes having processed zero
   items; this is a real, honest result, not a NOT_IMPLEMENTED placeholder
   — the orchestration itself is real, only the STAGES are absent.

   DEPENDENCIES: knowledge/builder/stage-registry.js,
   knowledge/builder/builder-orchestrator.js,
   knowledge/builder/contracts/context-contract.js,
   knowledge/builder/contracts/error-contract.js (CancellationToken).

   NON-GOALS: does not run any connector directly and does not write to the
   repository — a real Stage (Phase 4+) does both, wrapped behind the Stage
   contract, never this file.

   FUTURE EVOLUTION: Phase 4+ registers real stages
   (stage-registry.registerStage), at which point `runIncremental()`'s
   pipeline is no longer empty and this file's behavior changes with zero
   edits to it.
   ============================================================ */

'use strict';

import { listStages } from './stage-registry.js';
import { runPipeline } from './builder-orchestrator.js';
import { createContext } from './contracts/context-contract.js';
import { createCancellationToken } from './contracts/error-contract.js';

/**
 * The stages this build session would run, given today's registry —
 * read-only introspection.
 */
export function plannedStages() {
  return listStages();
}

function buildPipelineFromRegistry() {
  return Object.freeze({ id: 'default', stageIds: listStages().map((s) => s.id) });
}

/**
 * Default mode: process only sources changed/newly-Approved since each
 * connector's own watermark. Genuinely runs the current pipeline (today:
 * zero stages, so it completes immediately having processed nothing).
 * @param {import('./contracts/context-contract.js').IndexWatermark[]} [watermarks]
 * @param {{onEvent?: Function}} [opts]
 * @returns {import('./builder-orchestrator.js').BuilderRunResult}
 */
export function runIncremental(watermarks = [], opts = {}) {
  const context = createContext({
    runId: `incremental-${Date.now()}`,
    mode: 'incremental',
    watermarks,
    cancellationToken: createCancellationToken(),
    onEvent: opts.onEvent,
  });
  return runPipeline(buildPipelineFromRegistry(), context);
}

/**
 * Explicit full rebuild, ignoring all watermarks. Never the default —
 * callers must invoke this deliberately (Decision 9).
 * @param {{onEvent?: Function}} [opts]
 * @returns {import('./builder-orchestrator.js').BuilderRunResult}
 */
export function runFull(opts = {}) {
  const context = createContext({
    runId: `full-${Date.now()}`,
    mode: 'full',
    watermarks: [],
    cancellationToken: createCancellationToken(),
    onEvent: opts.onEvent,
  });
  return runPipeline(buildPipelineFromRegistry(), context);
}
