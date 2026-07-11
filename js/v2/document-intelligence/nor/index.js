/* ============================================================
   INDEX.JS — NOR Intelligence Runtime public barrel (V2, Phase 8 / V2.0.6, Phase 9.5)

   PURPOSE: single entry point for the NOR pilot — contracts, plus (Phase
   9.5) the five real pipeline steps. Importing this file is what
   registers `nor-analyzer`/`nor-generator`/`nor-validator`/`nor-explainer`/
   `nor-recommender` into registry/step-registry.js and document-registry.js.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under document-intelligence/nor/.

   NON-GOALS: not imported by document-intelligence/index.js itself (NOR is
   a pilot nested UNDER Document Intelligence, not re-exported at that
   layer's top level — the generic barrel and its step-registry stay free
   of any domain-specific registration until a caller explicitly wants the
   NOR pilot active, same explicit-opt-in convention as
   knowledge/connectors/index.js and knowledge/builder/stages/index.js).

   FUTURE EVOLUTION: unchanged as the real steps' bodies improve.
   ============================================================ */

'use strict';

export * from './contracts/nor-session-contract.js';
export * from './contracts/nor-draft-contract.js';
export * from './contracts/nor-knowledge-contract.js';
// nor-generator-contract.js's own `proposeNorFields` is a locked STUB that
// always throws (see that file's header — it is documentation of the
// shape, never called by any real code path); nor-generator.js's
// `proposeNorFields` below is the real Phase 9.5 implementation and is
// the one callers get. Re-exporting both by name would collide (ES
// modules silently drop an ambiguous `export *` name rather than error),
// so the contract file's other exports are re-exported explicitly instead.
export { NOR_GENERATOR_ERRORS, NOR_PIPELINE, NOR_PIPELINE_IS_VALID } from './nor-generator-contract.js';

export * from './nor-analyzer.js';
export * from './nor-generator.js';
export * from './nor-validator.js';
export * from './nor-explainer.js';
export * from './nor-recommender.js';
