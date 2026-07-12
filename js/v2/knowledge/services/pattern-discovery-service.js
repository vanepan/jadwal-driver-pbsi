/* ============================================================
   PATTERN-DISCOVERY-SERVICE.JS — Knowledge Services (V2.1)

   PURPOSE: the public surface for Pattern Discovery, same idiom as
   dependency-graph-service.js — pure delegation, no computation added.

   DEPENDENCIES: knowledge/profiles/pattern-discovery-engine.js.
   ============================================================ */

'use strict';

import { computePatternRecommendations } from '../profiles/pattern-discovery-engine.js';
import { PATTERN_TYPE, isCandidateRecommendation } from '../contracts/pattern-recommendation-contract.js';

export { computePatternRecommendations, PATTERN_TYPE, isCandidateRecommendation };
