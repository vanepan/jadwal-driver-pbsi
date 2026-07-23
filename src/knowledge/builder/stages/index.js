/* ============================================================
   INDEX.JS — Knowledge Builder Stages, explicit opt-in (V2, Phase 9)

   PURPOSE: the single, deliberate entry point that wires the NOR
   acquisition stage into stage-registry.js. Deliberately NOT re-exported
   by builder/index.js — importing THIS file is what pulls NOR's real
   Firebase-backed V1 dependency chain into a process; the Builder core
   (builder/index.js, builder-orchestrator.js, knowledge-builder.js) stays
   dormant/side-effect-free until a caller explicitly wants a real stage.

   RESPONSIBILITY: register nor-acquisition-stage.js at module load time.

   DEPENDENCIES: stage-registry.js, nor-acquisition-stage.js.
   ============================================================ */

'use strict';

import { registerStage } from '../stage-registry.js';
import { norAcquisitionStage } from './nor-acquisition-stage.js';

registerStage(norAcquisitionStage);

export { norAcquisitionStage };
