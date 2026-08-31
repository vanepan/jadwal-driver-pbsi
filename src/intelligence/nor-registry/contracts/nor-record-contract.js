/* ============================================================
   NOR-RECORD-CONTRACT.JS — NOR Registry Foundation (V2, Phase 0)

   PURPOSE: fix the CANONICAL identity of a NOR (PART 10) — the one record
   shape every official NOR takes, regardless of which module generated it
   (Petty Cash, Sarpras Intelligence, or a future module). Also fixes the
   NOR lifecycle states (PART 13) as a transition graph, mirroring
   src/knowledge/contracts/lifecycle-contract.js.

   RESPONSIBILITY: NOR_STATUS + NOR_STATUS_GRAPH + canNorTransition;
   the NOR_SOURCE_MODULE registry (registered values, never a hardcoded
   switch — PART 9); NUMBER_SOURCE (system-suggested vs user-edited vs
   reserved — PART 12); NorRecord typedef + makeNorRecord + isNorRecord.

   DEPENDENCIES: none.

   NON-GOALS: does not persist, number, or validate business content.
   `content` is opaque here — it is the existing view-model shape the
   existing renderer already consumes, never redefined in this file
   (same discipline as src/document-intelligence/nor/contracts/nor-draft-contract.js).
   `recipient` is a plain contextual field, deliberately NOT a fixed
   constant (PART 15).

   FUTURE EVOLUTION: a real registry backend stores these; a NOR editing
   surface appends versions; publication sets `publishedVersion` +
   `norNumber` + status 'published'.
   ============================================================ */

'use strict';

export const NOR_RECORD_SCHEMA = 'nor-record@1';

/* ── lifecycle (PART 13): draft → in_review → approved → published → superseded ── */

export const NOR_STATUS = Object.freeze({
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  SUPERSEDED: 'superseded',
});

export const NOR_STATUS_DEFS = Object.freeze([
  Object.freeze({ id: NOR_STATUS.DRAFT, label: 'Draft' }),
  Object.freeze({ id: NOR_STATUS.IN_REVIEW, label: 'In Review' }),
  Object.freeze({ id: NOR_STATUS.APPROVED, label: 'Approved' }),
  Object.freeze({ id: NOR_STATUS.PUBLISHED, label: 'Published' }),
  Object.freeze({ id: NOR_STATUS.SUPERSEDED, label: 'Superseded' }),
]);

/** The one authority on legal NOR status moves. */
export const NOR_STATUS_GRAPH = Object.freeze({
  [NOR_STATUS.DRAFT]: Object.freeze([NOR_STATUS.IN_REVIEW]),
  [NOR_STATUS.IN_REVIEW]: Object.freeze([NOR_STATUS.APPROVED, NOR_STATUS.DRAFT]),
  [NOR_STATUS.APPROVED]: Object.freeze([NOR_STATUS.PUBLISHED, NOR_STATUS.IN_REVIEW]),
  [NOR_STATUS.PUBLISHED]: Object.freeze([NOR_STATUS.SUPERSEDED]),
  [NOR_STATUS.SUPERSEDED]: Object.freeze([]),
});

/** States that a human must gate: nothing may enter these automatically. */
export const NOR_HUMAN_GATED_STATES = Object.freeze([NOR_STATUS.APPROVED, NOR_STATUS.PUBLISHED]);

/** Pure structural check: is `from → to` a legal single step? */
export function canNorTransition(from, to) {
  const reachable = NOR_STATUS_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/* ── where a NOR number came from (PART 12) ────────────────────────────── */

export const NUMBER_SOURCE = Object.freeze({
  SYSTEM_SUGGESTED: 'system_suggested', // autofilled from the numbering engine's advisory suggestion
  USER_EDITED: 'user_edited',           // a human typed/changed it
  RESERVED: 'reserved',                 // allocated + validated at publication (future)
});

/* ── source-module registry (PART 9): the registry is independent of the
      module that generated the NOR; adding a module is a registry entry,
      never a switch statement anywhere. ───────────────────────────────── */

const _sourceModules = new Map();

/** The two known origins today. Bootstrapped below. */
export const NOR_SOURCE_MODULE = Object.freeze({
  PETTY_CASH: 'petty_cash',
  INTELLIGENCE: 'intelligence',
});

export function registerNorSourceModule(id, meta = {}) {
  if (typeof id !== 'string' || !id) {
    const err = new Error('registerNorSourceModule: id must be a non-empty string.');
    err.code = 'INVALID_SOURCE_MODULE';
    throw err;
  }
  _sourceModules.set(id, Object.freeze({ id, label: meta.label || id, ...meta }));
  return id;
}

export function hasNorSourceModule(id) {
  return _sourceModules.has(id);
}

export function listNorSourceModules() {
  return Object.freeze([..._sourceModules.values()]);
}

/** Test/teardown helper — restores just the bootstrapped two. */
export function resetNorSourceModules() {
  _sourceModules.clear();
  registerNorSourceModule(NOR_SOURCE_MODULE.PETTY_CASH, { label: 'Petty Cash' });
  registerNorSourceModule(NOR_SOURCE_MODULE.INTELLIGENCE, { label: 'Sarpras Intelligence' });
}
resetNorSourceModules();

/* ── the canonical record (PART 10) ───────────────────────────────────── */

export const NOR_RECORD_FIELDS = Object.freeze([
  'schema', 'norId', 'norNumber', 'sourceModule', 'sourceFeature', 'documentType',
  'title', 'subject', 'recipient', 'createdAt', 'createdBy', 'status',
  'currentVersion', 'publishedVersion', 'numberSource', 'content', 'metadata', 'auditHistory',
]);

/**
 * @typedef {Object} NorRecord
 * @property {string} schema
 * @property {string} norId               - stable registry identity, independent of the source module's own id
 * @property {string} norNumber           - the official number; '' until assigned
 * @property {string} sourceModule        - registry-backed origin (NOR_SOURCE_MODULE / registerNorSourceModule)
 * @property {string|null} sourceFeature  - finer origin within that module
 * @property {string} documentType        - e.g. 'nor'
 * @property {string} title
 * @property {string} subject
 * @property {string|null} recipient      - CONTEXTUAL, never a fixed constant (PART 15)
 * @property {string} createdAt           - ISO 8601
 * @property {string|null} createdBy
 * @property {string} status              - NOR_STATUS.*
 * @property {number} currentVersion      - monotonically increasing; an edit is a new version, never an overwrite (PART 13)
 * @property {number|null} publishedVersion - the version that was published, or null
 * @property {string} numberSource        - NUMBER_SOURCE.*
 * @property {*} content                  - opaque view-model payload; not redefined here
 * @property {Object} metadata
 * @property {Array} auditHistory         - lightweight audit entries / refs (audit-contract.js events)
 */

/**
 * @param {Object} r
 * @returns {NorRecord}
 */
export function makeNorRecord({
  norId,
  norNumber = '',
  sourceModule = null,
  sourceFeature = null,
  documentType = 'nor',
  title = '',
  subject = '',
  recipient = null,
  createdAt = new Date().toISOString(),
  createdBy = null,
  status = NOR_STATUS.DRAFT,
  currentVersion = 1,
  publishedVersion = null,
  numberSource = NUMBER_SOURCE.USER_EDITED,
  content = null,
  metadata = {},
  auditHistory = [],
} = {}) {
  return Object.freeze({
    schema: NOR_RECORD_SCHEMA,
    norId: norId || null,
    norNumber: typeof norNumber === 'string' ? norNumber : '',
    sourceModule: sourceModule || null,
    sourceFeature: sourceFeature || null,
    documentType: documentType || 'nor',
    title: String(title || ''),
    subject: String(subject || ''),
    recipient: recipient == null ? null : String(recipient),
    createdAt,
    createdBy,
    status: Object.values(NOR_STATUS).includes(status) ? status : NOR_STATUS.DRAFT,
    currentVersion: Number.isFinite(Number(currentVersion)) && Number(currentVersion) >= 1 ? Number(currentVersion) : 1,
    publishedVersion: Number.isFinite(Number(publishedVersion)) ? Number(publishedVersion) : null,
    numberSource: Object.values(NUMBER_SOURCE).includes(numberSource) ? numberSource : NUMBER_SOURCE.USER_EDITED,
    content: content ?? null,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    auditHistory: Array.isArray(auditHistory) ? auditHistory : [],
  });
}

/** Structural check — non-empty norId, registered sourceModule, known status,
 *  full field set. Does NOT check business validity or number uniqueness. */
export function isNorRecord(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== NOR_RECORD_SCHEMA) return false;
  if (typeof r.norId !== 'string' || !r.norId) return false;
  if (typeof r.sourceModule !== 'string' || !hasNorSourceModule(r.sourceModule)) return false;
  if (!Object.values(NOR_STATUS).includes(r.status)) return false;
  return NOR_RECORD_FIELDS.every((f) => f in r);
}
