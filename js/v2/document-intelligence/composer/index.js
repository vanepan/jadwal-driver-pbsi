/* ============================================================
   INDEX.JS — Live Editable Composer Foundation public barrel (V2.0.15)

   PURPOSE: single entry point for the Composer's contracts and store,
   mirroring document-intelligence/index.js's own barrel pattern.
   Deliberately NOT re-exported from document-intelligence/index.js
   itself — a caller wanting the Composer active imports this file
   explicitly, the same opt-in convention nor/index.js already
   establishes for the NOR pilot.

   RESPONSIBILITY: re-export only.
   ============================================================ */

'use strict';

export * from './contracts/field-override-contract.js';
export * from './contracts/suggestion-placeholder-contract.js';
export * from './contracts/editable-section-contract.js';
export * from './contracts/composer-document-contract.js';
export * from './contracts/composer-revision-contract.js';
export * from './contracts/composer-session-contract.js';
export * from './composer-store.js';
