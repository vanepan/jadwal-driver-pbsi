/* ============================================================
   PLACEHOLDER-ARCHIVE-SOURCE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: one factory shared by every inactive archive source, mirroring
   knowledge/connectors/placeholder-connector.js exactly.

   RESPONSIBILITY: produce an ArchiveSource whose fetch() always returns a
   NOT_IMPLEMENTED ArchiveSourceResult.
   ============================================================ */

'use strict';

import { archiveSourceFailure, ARCHIVE_SOURCE_ERRORS } from '../contracts/archive-source-contract.js';

export function makePlaceholderArchiveSource(id, description) {
  function fetch() {
    return archiveSourceFailure(
      ARCHIVE_SOURCE_ERRORS.NOT_IMPLEMENTED,
      `The "${id}" archive source is an inactive placeholder — no V1 store exists for this domainType yet.`,
      { sourceId: id },
    );
  }
  return Object.freeze({ id, version: `${id}-archive-source@0-stub`, description, fetch });
}
