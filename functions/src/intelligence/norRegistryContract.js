'use strict';

/* ============================================================
   functions/src/intelligence/norRegistryContract.js — Phase 5
   — CJS mirror of the SERVER-relevant parts of
       src/intelligence/nor-registry/contracts/nor-record-contract.js
       src/intelligence/nor-registry/contracts/registry-contract.js
       src/intelligence/nor-registry/nor-registry-record.js

   The Functions runtime is CJS and self-contained; it cannot import the
   browser-ESM contracts. This mirrors ONLY what the server needs to build,
   validate, and advance a canonical NorRecord it is about to persist, and to
   speak the same { ok, data, error } envelope. Kept byte-equivalent to the
   ESM originals by the drift test in scripts/intelligence-nor-registry-check.cjs
   — change one, change both.

   A canonical NorRecord is the module-independent record of an official NOR
   (PART B). Lifecycle: draft → in_review → approved → published → superseded,
   with `approved` and `published` HUMAN-GATED. An AI-generated NOR is NEVER
   automatically official. `norNumber` is '' until publication reserves it.
   ============================================================ */

const NOR_RECORD_SCHEMA = 'nor-record@1';

const NOR_STATUS = Object.freeze({
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  SUPERSEDED: 'superseded',
});
const NOR_STATUS_LIST = Object.freeze(Object.values(NOR_STATUS));

/** The one authority on legal NOR status moves (mirror of NOR_STATUS_GRAPH). */
const NOR_STATUS_GRAPH = Object.freeze({
  [NOR_STATUS.DRAFT]: Object.freeze([NOR_STATUS.IN_REVIEW]),
  [NOR_STATUS.IN_REVIEW]: Object.freeze([NOR_STATUS.APPROVED, NOR_STATUS.DRAFT]),
  [NOR_STATUS.APPROVED]: Object.freeze([NOR_STATUS.PUBLISHED, NOR_STATUS.IN_REVIEW]),
  [NOR_STATUS.PUBLISHED]: Object.freeze([NOR_STATUS.SUPERSEDED]),
  [NOR_STATUS.SUPERSEDED]: Object.freeze([]),
});

/** States a human must gate — nothing enters these automatically. */
const NOR_HUMAN_GATED_STATES = Object.freeze([NOR_STATUS.APPROVED, NOR_STATUS.PUBLISHED]);

function canNorTransition(from, to) {
  const reachable = NOR_STATUS_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

const NUMBER_SOURCE = Object.freeze({
  SYSTEM_SUGGESTED: 'system_suggested',
  USER_EDITED: 'user_edited',
  RESERVED: 'reserved',
});

const NOR_SOURCE_MODULE = Object.freeze({
  PETTY_CASH: 'petty_cash',
  INTELLIGENCE: 'intelligence',
});

const NOR_RECORD_FIELDS = Object.freeze([
  'schema', 'norId', 'norNumber', 'sourceModule', 'sourceFeature', 'documentType',
  'title', 'subject', 'recipient', 'createdAt', 'createdBy', 'status',
  'currentVersion', 'publishedVersion', 'numberSource', 'content', 'metadata', 'auditHistory',
]);

/** On-record append-only audit vocabulary (PART I). */
const REGISTRY_AUDIT_EVENTS = Object.freeze([
  'AI_DRAFT_CREATED', 'AI_DRAFT_EDITED', 'AI_DRAFT_APPROVED', 'NOR_NUMBER_RESERVED', 'NOR_PUBLISHED',
]);

const REGISTRY_CHANGE_TYPE = Object.freeze({
  REGISTERED: 'registered',
  HUMAN_EDIT: 'human_edit',
  APPROVED: 'approved',
  PUBLISHED: 'published',
});

/* ── registry result envelope (twin of registry-contract.js) ── */

const NOR_REGISTRY_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  DUPLICATE_ID: 'DUPLICATE_ID',
  DUPLICATE_NUMBER: 'DUPLICATE_NUMBER',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  ALREADY_PUBLISHED: 'ALREADY_PUBLISHED',
  NUMBER_RESERVATION_FAILED: 'NUMBER_RESERVATION_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

function registrySuccess(data) {
  return Object.freeze({ ok: true, data: data == null ? null : data, error: null });
}
function registryFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function str(v) {
  return v == null ? '' : String(v);
}

/** Structural check — the CJS twin of ESM isNorRecord(). Does NOT check
 *  business validity or number uniqueness. */
function isNorRecord(r) {
  if (!isPlainObject(r)) return false;
  if (r.schema !== NOR_RECORD_SCHEMA) return false;
  if (typeof r.norId !== 'string' || !r.norId) return false;
  if (r.sourceModule !== NOR_SOURCE_MODULE.INTELLIGENCE && r.sourceModule !== NOR_SOURCE_MODULE.PETTY_CASH) return false;
  if (!NOR_STATUS_LIST.includes(r.status)) return false;
  return NOR_RECORD_FIELDS.every((f) => f in r);
}

/* ── pure lifecycle helpers (twin of nor-registry-record.js) ── */

const CONTENT_FACT_FIELDS = Object.freeze(['item', 'quantity', 'unit', 'purpose', 'budget']);

/** nor_<conversationId> — mirrors Phase 4's draft_<conversationId>. */
function norIdFromConversation(conversationId) {
  const c = str(conversationId).trim();
  return c ? `nor_${c}` : null;
}

/** The immutable per-version content snapshot taken from a Phase 4 draft. */
function registryContentFromDraft(draft) {
  const d = isPlainObject(draft) ? draft : {};
  const f = isPlainObject(d.facts) ? d.facts : {};
  const facts = {};
  for (const k of CONTENT_FACT_FIELDS) {
    if (f[k] !== undefined && f[k] !== null && str(f[k]).trim() !== '') facts[k] = f[k];
  }
  const bodySource = (isPlainObject(d.provenance) && d.provenance.bodySource) || null;
  return {
    jenis: d.jenis || null,
    subject: str(d.subject),
    recipient: d.recipient == null ? null : str(d.recipient),
    recipientStatus: d.recipientStatus == null ? null : str(d.recipientStatus),
    date: d.date == null ? null : str(d.date),
    body: str(d.body),
    bodySource,
    facts,
    draftVersion: typeof d.version === 'number' ? d.version : 1,
  };
}

/** Structural inequality of two content snapshots (draftVersion ignored). */
function registryContentChanged(a, b) {
  const x = isPlainObject(a) ? a : {};
  const y = isPlainObject(b) ? b : {};
  const scalars = ['jenis', 'subject', 'recipient', 'recipientStatus', 'date', 'body', 'bodySource'];
  for (const k of scalars) if (str(x[k]) !== str(y[k])) return true;
  const fx = isPlainObject(x.facts) ? x.facts : {};
  const fy = isPlainObject(y.facts) ? y.facts : {};
  const keys = new Set([...Object.keys(fx), ...Object.keys(fy)]);
  for (const k of keys) if (str(fx[k]) !== str(fy[k])) return true;
  return false;
}

/**
 * A version-1 canonical NorRecord in status `in_review`, built from a
 * freshly-persisted Phase 4 draft. Carries NO official number. `ownerId` is
 * the server-verified uid — never a browser value.
 */
function makeNorRecordFromDraft(draft, ctx) {
  const d = isPlainObject(draft) ? draft : {};
  const ownerId = ctx && ctx.ownerId;
  const at = (ctx && ctx.now) || new Date().toISOString();
  const conversationId = str(d.conversationId).trim();
  const norId = norIdFromConversation(conversationId);
  const content = registryContentFromDraft(d);
  const numbering = isPlainObject(d.numbering) ? d.numbering : {};
  const title = content.subject || ('NOR ' + (content.jenis || '')).trim();
  const sourceFeature = (isPlainObject(d.provenance) && d.provenance.sourceFeature) || null;

  return {
    schema: NOR_RECORD_SCHEMA,
    norId,
    norNumber: '',
    sourceModule: NOR_SOURCE_MODULE.INTELLIGENCE,
    sourceFeature: sourceFeature || 'nor.generate',
    documentType: 'nor',
    title,
    subject: content.subject,
    recipient: content.recipient,
    createdAt: d.createdAt || at,
    createdBy: ownerId || null,
    status: NOR_STATUS.IN_REVIEW,
    currentVersion: 1,
    publishedVersion: null,
    numberSource: NUMBER_SOURCE.SYSTEM_SUGGESTED,
    ownerId: ownerId || null,
    content,
    metadata: {
      draftId: d.draftId || null,
      conversationId: conversationId || null,
      sourceFeature: sourceFeature || null,
      suggestedNumber: typeof numbering.suggestedNumber === 'string' ? numbering.suggestedNumber : '',
      suggestionBasis: numbering.basis == null ? null : str(numbering.basis),
      suggestionConfidence: typeof numbering.confidence === 'number' ? numbering.confidence : 0,
      numberAllocation: null,
    },
    versions: [
      { version: 1, at, actorId: ownerId || null, changeType: REGISTRY_CHANGE_TYPE.REGISTERED, content },
    ],
    auditHistory: [
      { type: 'AI_DRAFT_CREATED', at, actorId: ownerId || null, fromVersion: null, version: 1, detail: { draftVersion: content.draftVersion } },
    ],
  };
}

/**
 * A NEW immutable version from a human edit. Only legal while `in_review`.
 * Returns { next, changed } — a no-op returns { next: record, changed: false }.
 */
function appendRegistryVersion(record, ctx) {
  const nextContent = (ctx && ctx.nextContent) || {};
  const actorId = ctx && ctx.actorId;
  const when = (ctx && ctx.at) || new Date().toISOString();
  if (record.status !== NOR_STATUS.IN_REVIEW) return { next: record, changed: false, illegal: true };
  if (!registryContentChanged(record.content, nextContent)) return { next: record, changed: false };
  const version = (record.currentVersion || 1) + 1;
  const content = Object.assign({}, nextContent);
  const next = Object.assign({}, record, {
    subject: content.subject,
    recipient: content.recipient,
    currentVersion: version,
    content,
    versions: record.versions.concat([
      { version, at: when, actorId: actorId || null, changeType: REGISTRY_CHANGE_TYPE.HUMAN_EDIT, content },
    ]),
    auditHistory: record.auditHistory.concat([
      { type: 'AI_DRAFT_EDITED', at: when, actorId: actorId || null, fromVersion: record.currentVersion, version, detail: {} },
    ]),
  });
  return { next, changed: true };
}

/** in_review → approved (human). Returns { next } or { error }. */
function markApproved(record, ctx) {
  const actorId = ctx && ctx.actorId;
  const when = (ctx && ctx.at) || new Date().toISOString();
  if (record.status === NOR_STATUS.PUBLISHED) return { error: 'ALREADY_PUBLISHED' };
  if (record.status !== NOR_STATUS.IN_REVIEW || !canNorTransition(record.status, NOR_STATUS.APPROVED)) {
    return { error: 'ILLEGAL_TRANSITION' };
  }
  const next = Object.assign({}, record, {
    status: NOR_STATUS.APPROVED,
    auditHistory: record.auditHistory.concat([
      { type: 'AI_DRAFT_APPROVED', at: when, actorId: actorId || null, fromVersion: record.currentVersion, version: record.currentVersion, detail: {} },
    ]),
  });
  return { next };
}

/**
 * approved → published (human). `allocation` = the server-side atomic
 * reservation from norNumberingCounter.reserveNorNumber(). The official
 * `norNumber` IS the server-reserved sequence — there is NO client-supplied
 * or human-supplied number input. Returns { next } or { error }.
 */
function markPublished(record, ctx) {
  const allocation = ctx && ctx.allocation;
  const actorId = ctx && ctx.actorId;
  const when = (ctx && ctx.at) || new Date().toISOString();
  if (record.status === NOR_STATUS.PUBLISHED) return { error: 'ALREADY_PUBLISHED' };
  if (record.status !== NOR_STATUS.APPROVED || !canNorTransition(record.status, NOR_STATUS.PUBLISHED)) {
    return { error: 'ILLEGAL_TRANSITION' };
  }
  if (!allocation || typeof allocation.sequence !== 'number') return { error: 'NUMBER_RESERVATION_FAILED' };
  // SOLE AUTHORITY: the official number is the atomic server-reserved
  // sequence. (The decorated PBSI format is an unresolved org rule — see the
  // phase report; until then the sequence itself is the canonical number.)
  const norNumber = String(allocation.sequence);
  const publishedVersion = record.currentVersion;
  const next = Object.assign({}, record, {
    status: NOR_STATUS.PUBLISHED,
    norNumber,
    numberSource: NUMBER_SOURCE.RESERVED,
    publishedVersion,
    metadata: Object.assign({}, record.metadata, {
      numberAllocation: {
        sequence: allocation.sequence,
        scopeKey: allocation.scopeKey || null,
        reservationKey: allocation.reservationKey || null,
        allocatedAt: allocation.allocatedAt || when,
        basis: allocation.basis || null,
      },
    }),
    versions: record.versions.map((v) => (v.version === publishedVersion ? Object.assign({}, v, { published: true }) : v)),
    auditHistory: record.auditHistory.concat([
      {
        type: 'NOR_NUMBER_RESERVED', at: when, actorId: actorId || null,
        fromVersion: publishedVersion, version: publishedVersion,
        detail: { sequence: allocation.sequence, scopeKey: allocation.scopeKey || null, reservationKey: allocation.reservationKey || null },
      },
      {
        type: 'NOR_PUBLISHED', at: when, actorId: actorId || null,
        fromVersion: publishedVersion, version: publishedVersion,
        detail: { norNumber, numberSource: NUMBER_SOURCE.RESERVED },
      },
    ]),
  });
  return { next };
}

module.exports = {
  NOR_RECORD_SCHEMA,
  NOR_RECORD_FIELDS,
  NOR_STATUS,
  NOR_STATUS_LIST,
  NOR_STATUS_GRAPH,
  NOR_HUMAN_GATED_STATES,
  canNorTransition,
  NUMBER_SOURCE,
  NOR_SOURCE_MODULE,
  REGISTRY_AUDIT_EVENTS,
  REGISTRY_CHANGE_TYPE,
  NOR_REGISTRY_ERRORS,
  registrySuccess,
  registryFailure,
  isNorRecord,
  norIdFromConversation,
  registryContentFromDraft,
  registryContentChanged,
  makeNorRecordFromDraft,
  appendRegistryVersion,
  markApproved,
  markPublished,
};
