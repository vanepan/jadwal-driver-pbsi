/* ============================================================
   INDEX.JS — Machine Learning Foundation public barrel (V2.0.9, Phase 12)

   PURPOSE: single entry point for Clustering, Pattern Mining, Statistics,
   Outlier Detection, and Confidence. "Similarity" is deliberately NOT
   re-exported here — knowledge/learning/similarity-detection-engine.js
   (V2.0.5, real) already is it; re-exporting a second copy would be the
   exact duplication the frozen roadmap forbids. Use `knowledge.learning.computeSimilarity`.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/machine-learning/. Pure —
   no V1 dependency, safe to re-export from knowledge/index.js.
   ============================================================ */

'use strict';

export * from './clustering-engine.js';
export * from './pattern-mining-engine.js';
export * from './statistics-engine.js';
export * from './outlier-detection-engine.js';
export * from './confidence-engine.js';
