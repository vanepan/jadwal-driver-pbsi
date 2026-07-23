/* ============================================================
   DIFF-ENGINE.JS — Diff Model (V2.0.15 / V2.0.16, shared)

   PURPOSE: "Difference" — a real, pure, one-level field comparison
   between two flat objects. The one computation both the Composer
   (V2.0.15, comparing a revision to its predecessor) and Diff Learning
   (V2.0.16, comparing a Generated Draft to a User Edit) need — built
   once here rather than twice.

   RESPONSIBILITY: `computeDiff(before, after)`.

   DEPENDENCIES: contracts/diff-contract.js.

   NON-GOALS: no recursive/deep diff (see diff-contract.js's NON-GOALS).
   Never mutates either input.
   ============================================================ */

'use strict';

import { DIFF_SCHEMA, CHANGE_TYPE } from './contracts/diff-contract.js';

function shallowEqual(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * @param {Object} before
 * @param {Object} after
 * @returns {import('./contracts/diff-contract.js').Diff}
 */
export function computeDiff(before, after) {
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const fields = new Set([...Object.keys(b), ...Object.keys(a)]);
  const entries = [];

  for (const field of fields) {
    const hasBefore = Object.prototype.hasOwnProperty.call(b, field);
    const hasAfter = Object.prototype.hasOwnProperty.call(a, field);

    if (!hasBefore && hasAfter) {
      entries.push({ field, before: null, after: a[field], changeType: CHANGE_TYPE.ADDED });
    } else if (hasBefore && !hasAfter) {
      entries.push({ field, before: b[field], after: null, changeType: CHANGE_TYPE.REMOVED });
    } else if (!shallowEqual(b[field], a[field])) {
      entries.push({ field, before: b[field], after: a[field], changeType: CHANGE_TYPE.MODIFIED });
    }
  }

  return Object.freeze({
    schema: DIFF_SCHEMA,
    entries: Object.freeze(entries),
    fieldsChanged: entries.length,
    computedAt: new Date().toISOString(),
  });
}
