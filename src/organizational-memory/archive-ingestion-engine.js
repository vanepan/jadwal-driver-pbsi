/* ============================================================
   ARCHIVE-INGESTION-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: the generic orchestration between an ArchiveSource and the
   Archive Repository — mirrors knowledge/acquisition/acquisition-engine.js's
   shape closely (resolve source -> fetch -> write each record, create or
   appendVersion on a DUPLICATE_ID collision). The deterministic
   `nor:archive:<norId>` id scheme (nor-archive-source.js) is what makes
   that collision meaningful — re-ingesting the same NOR updates its
   archive record instead of duplicating it.

   RESPONSIBILITY: `ingestArchive(sourceId, opts)`.

   DEPENDENCIES: registry/archive-source-registry.js,
   repository/archive-repository.js, contracts/event-contract.js.

   NON-GOALS: does not decide which sources are "active" — every
   registered source can be ingested from. Domain-agnostic: knows nothing
   about NOR specifically.
   ============================================================ */

'use strict';

import { getArchiveSource } from './registry/archive-source-registry.js';
// Phase 4 — a CLIENT of the Archive Service, no longer a writer. The
// create-or-append-on-DUPLICATE_ID dance this engine used to perform itself now
// lives once, in the one module that owns organizational memory
// (services/archive-service.js#archiveDocument) — which additionally does the
// content-level duplicate detection this engine never did, and stamps the
// provenance (reason, actor, lifecycle state) that ArchiveRecords never carried.
import { archiveDocument } from './services/archive-service.js';
import { ARCHIVE_EVENT_TYPE, makeArchiveEvent } from './contracts/event-contract.js';

function emit(onEvent, type, sourceId, detail) {
  if (typeof onEvent === 'function') onEvent(makeArchiveEvent(type, { sourceId, detail }));
}

/**
 * @param {string} sourceId
 * @param {{onEvent?: Function}} [opts]
 * @returns {{ok: boolean, sourceId: string, itemsFetched: number, itemsCreated: number, itemsUpdated: number, itemsSkipped: number, errors: {itemId: string, message: string}[]}}
 */
export function ingestArchive(sourceId, opts = {}) {
  const onEvent = opts.onEvent;
  emit(onEvent, ARCHIVE_EVENT_TYPE.STARTED, sourceId, null);

  const source = getArchiveSource(sourceId);
  if (!source) {
    const error = { code: 'SOURCE_NOT_FOUND', message: `No archive source registered under "${sourceId}".` };
    emit(onEvent, ARCHIVE_EVENT_TYPE.FAILED, sourceId, error);
    return { ok: false, sourceId, itemsFetched: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, errors: [error] };
  }

  const fetchResult = source.fetch();
  if (!fetchResult || !fetchResult.ok) {
    const error = (fetchResult && fetchResult.error) || { code: 'FETCH_FAILED', message: 'Archive source fetch failed.' };
    emit(onEvent, ARCHIVE_EVENT_TYPE.FAILED, sourceId, error);
    return { ok: false, sourceId, itemsFetched: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, errors: [error] };
  }

  emit(onEvent, ARCHIVE_EVENT_TYPE.FETCHED, sourceId, { count: fetchResult.items.length });

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;
  const errors = [];

  for (const record of fetchResult.items) {
    // ONE call. The Service reports which of create/append it performed via
    // `op`, so the counters below stay exactly as honest as they were — without
    // this engine needing to know how the repository decides.
    const result = archiveDocument(record);
    if (result.ok) {
      if (result.op === 'create') itemsCreated += 1; else itemsUpdated += 1;
      emit(onEvent, ARCHIVE_EVENT_TYPE.RECORD_ARCHIVED, sourceId, { id: record.id, op: result.op });
      continue;
    }
    itemsSkipped += 1;
    errors.push({ itemId: record.id, message: result.error ? result.error.message : 'archiveDocument() failed.' });
    emit(onEvent, ARCHIVE_EVENT_TYPE.RECORD_SKIPPED, sourceId, { id: record.id });
  }

  emit(onEvent, ARCHIVE_EVENT_TYPE.COMPLETED, sourceId, { itemsCreated, itemsUpdated, itemsSkipped });
  return { ok: true, sourceId, itemsFetched: fetchResult.items.length, itemsCreated, itemsUpdated, itemsSkipped, errors };
}
