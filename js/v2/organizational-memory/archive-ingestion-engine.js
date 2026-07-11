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
import { create, appendVersion } from './repository/archive-repository.js';
import { ARCHIVE_REPOSITORY_ERRORS } from './repository/archive-repository.js';
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
    const createResult = create(record);
    if (createResult.ok) {
      itemsCreated += 1;
      emit(onEvent, ARCHIVE_EVENT_TYPE.RECORD_ARCHIVED, sourceId, { id: record.id, op: 'create' });
      continue;
    }
    if (createResult.error && createResult.error.code === ARCHIVE_REPOSITORY_ERRORS.DUPLICATE_ID) {
      const appendResult = appendVersion(record.id, record);
      if (appendResult.ok) {
        itemsUpdated += 1;
        emit(onEvent, ARCHIVE_EVENT_TYPE.RECORD_ARCHIVED, sourceId, { id: record.id, op: 'append' });
      } else {
        itemsSkipped += 1;
        errors.push({ itemId: record.id, message: appendResult.error.message });
        emit(onEvent, ARCHIVE_EVENT_TYPE.RECORD_SKIPPED, sourceId, { id: record.id });
      }
      continue;
    }
    itemsSkipped += 1;
    errors.push({ itemId: record.id, message: createResult.error ? createResult.error.message : 'create() failed.' });
    emit(onEvent, ARCHIVE_EVENT_TYPE.RECORD_SKIPPED, sourceId, { id: record.id });
  }

  emit(onEvent, ARCHIVE_EVENT_TYPE.COMPLETED, sourceId, { itemsCreated, itemsUpdated, itemsSkipped });
  return { ok: true, sourceId, itemsFetched: fetchResult.items.length, itemsCreated, itemsUpdated, itemsSkipped, errors };
}
