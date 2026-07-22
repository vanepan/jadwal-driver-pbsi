/* ============================================================
   INDEX.JS — Organizational Memory Sources public barrel (V2.0.7, Phase 10)

   PURPOSE: single, explicit, opt-in entry point for every archive source,
   `nor` included — mirrors knowledge/connectors/index.js exactly.
   Importing THIS file is what registers `nor` (self-registers at its own
   module load, see nor-archive-source.js). The 3 placeholders are already
   registered by archive-source-registry.js's own bootstrap.

   RESPONSIBILITY: re-export only. Deliberately NOT re-exported by
   organizational-memory/index.js — importing this file is the deliberate
   act that pulls in the real Firebase-backed V1 dependency chain.
   ============================================================ */

'use strict';

export { norArchiveSource, NOR_ARCHIVE_SOURCE_ID } from './nor-archive-source.js';
export { memorandumArchiveSource } from './memorandum-archive-source.js';
export { sopArchiveSource } from './sop-archive-source.js';
export { internalLetterArchiveSource } from './internal-letter-archive-source.js';
export { makePlaceholderArchiveSource } from './placeholder-archive-source.js';
