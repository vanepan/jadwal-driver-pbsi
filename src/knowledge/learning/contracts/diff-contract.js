/* ============================================================
   DIFF-CONTRACT.JS — Diff Model (V2.0.15 / V2.0.16, shared)

   PURPOSE: fix the shape of a field-level Diff between two flat objects
   — "Generated Draft" vs. "User Edit" (V2.0.16's Diff Learning pipeline),
   and a Composer revision vs. its predecessor (V2.0.15's revision
   history). Built ONCE here, under knowledge/learning/ (a location
   document-intelligence/ is already allowed to import — the one-way
   dependency documented in document-intelligence/index.js's own header,
   "Document Intelligence may read Knowledge, never the reverse") so
   neither milestone builds its own copy.

   RESPONSIBILITY: define DiffEntry, Diff, CHANGE_TYPE, and a structural
   validator. Does not compute a diff — see diff-engine.js.

   DEPENDENCIES: none.

   NON-GOALS: not a deep/recursive diff — one level of fields only,
   matching how DocumentDraft.fields and KnowledgeItem.payload are both
   already treated as flat, opaque-shape objects everywhere else in this
   codebase (statistics-engine.js's numericFieldValues does the same
   one-level read).
   ============================================================ */

'use strict';

export const DIFF_SCHEMA = 'field-diff@1';

export const CHANGE_TYPE = Object.freeze({
  ADDED: 'added',
  REMOVED: 'removed',
  MODIFIED: 'modified',
});

/**
 * @typedef {Object} DiffEntry
 * @property {string} field
 * @property {*} before        - undefined-as-null if the field did not exist before
 * @property {*} after         - undefined-as-null if the field no longer exists
 * @property {string} changeType - one of CHANGE_TYPE
 */

/**
 * @typedef {Object} Diff
 * @property {string} schema
 * @property {DiffEntry[]} entries
 * @property {number} fieldsChanged
 * @property {string} computedAt - ISO 8601
 */

export function isDiffEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.field === 'string' && e.field.length > 0
    && Object.values(CHANGE_TYPE).includes(e.changeType);
}

export function isDiff(d) {
  return !!d && typeof d === 'object'
    && d.schema === DIFF_SCHEMA
    && Array.isArray(d.entries) && d.entries.every(isDiffEntry)
    && typeof d.fieldsChanged === 'number' && d.fieldsChanged === d.entries.length
    && typeof d.computedAt === 'string' && d.computedAt.length > 0;
}
