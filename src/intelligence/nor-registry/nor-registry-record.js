/* ============================================================
   NOR-REGISTRY-RECORD.JS — Canonical NOR Registry (V2, Phase 5)

   PURPOSE: the PURE helpers that turn a Phase 4 human-reviewable NOR draft
   into — and advance — a canonical NorRecord
   (contracts/nor-record-contract.js). No persistence, no numbering, no
   authorization, no I/O. The server store (functions/) and the memory
   backend both build on these so the lifecycle rules live in exactly one
   place.

   RESPONSIBILITY:
     • norIdFromConversation(convId)          — the deterministic registry id
     • registryContentFromDraft(draft)        — the immutable content snapshot
     • registryContentChanged(a, b)           — structural compare of snapshots
     • makeNorRecordFromDraft(draft, ctx)     — a version-1 `in_review` record
     • appendRegistryVersion(record, ctx)     — a new immutable version (edit)
     • markApproved(record, ctx)              — in_review → approved (human)
     • markPublished(record, ctx)             — approved → published (+ number)
     • REGISTRY_AUDIT_EVENTS                   — the on-record audit vocabulary

   NON-GOALS: does NOT reserve numbers (that is server-side —
   functions/src/intelligence/norNumberingCounter.js), does NOT check who
   the caller is (the callable does), does NOT write anything.
   ============================================================ */

'use strict';

import {
  NOR_STATUS, NUMBER_SOURCE, canNorTransition, makeNorRecord, NOR_SOURCE_MODULE,
} from './contracts/nor-record-contract.js';

/** Audit entry types stored on the NorRecord's own append-only `auditHistory`
 *  array (PART I). `AI_DRAFT_CREATED` / `AI_DRAFT_EDITED` / `AI_DRAFT_APPROVED`
 *  / `NOR_PUBLISHED` are the audit-contract.js INTELLIGENCE_EVENT vocabulary;
 *  `NOR_NUMBER_RESERVED` is a Phase-5 lifecycle detail carried alongside
 *  `NOR_PUBLISHED` (the array is not type-validated — see the phase report). */
export const REGISTRY_AUDIT_EVENTS = Object.freeze([
  'AI_DRAFT_CREATED', 'AI_DRAFT_EDITED', 'AI_DRAFT_APPROVED', 'NOR_NUMBER_RESERVED', 'NOR_PUBLISHED',
]);

/** How a registry version came to be — recorded on each `versions[]` entry. */
export const REGISTRY_CHANGE_TYPE = Object.freeze({
  REGISTERED: 'registered',
  HUMAN_EDIT: 'human_edit',
  APPROVED: 'approved',
  PUBLISHED: 'published',
});

const CONTENT_FACT_FIELDS = Object.freeze(['item', 'quantity', 'unit', 'purpose', 'budget']);

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v) {
  return v == null ? '' : String(v);
}

/** The deterministic canonical id for the NOR a conversation produced —
 *  mirrors Phase 4's `draft_<conversationId>` so a reload / a re-run finds
 *  the same record (get-or-create). */
export function norIdFromConversation(conversationId) {
  const c = str(conversationId).trim();
  return c ? `nor_${c}` : null;
}

/** The immutable per-version content snapshot, taken from the Phase 4 draft.
 *  This is the ONLY place the draft's editable shape is projected into the
 *  registry — the registry never re-computes business content. */
export function registryContentFromDraft(draft) {
  const d = isPlainObject(draft) ? draft : {};
  const f = isPlainObject(d.facts) ? d.facts : {};
  const facts = {};
  for (const k of CONTENT_FACT_FIELDS) {
    if (f[k] !== undefined && f[k] !== null && str(f[k]).trim() !== '') facts[k] = f[k];
  }
  const bodySource = (isPlainObject(d.provenance) && d.provenance.bodySource) || null;
  return Object.freeze({
    jenis: d.jenis || null,
    subject: str(d.subject),
    recipient: d.recipient == null ? null : str(d.recipient),
    recipientStatus: d.recipientStatus == null ? null : str(d.recipientStatus),
    date: d.date == null ? null : str(d.date),
    body: str(d.body),
    bodySource,
    facts: Object.freeze({ ...facts }),
    draftVersion: typeof d.version === 'number' ? d.version : 1,
  });
}

/** Structural equality of two content snapshots — drives "an edit creates a
 *  new version, a no-op does not" (PART D). `draftVersion` is deliberately
 *  ignored: it is metadata, not business content. */
export function registryContentChanged(a, b) {
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

/** A version-1 canonical NorRecord in status `in_review`, built from a
 *  freshly-persisted Phase 4 draft. Carries NO official number. `ownerId`
 *  is a top-level field (the RTDB rule + `.indexOn` key) and MUST be the
 *  server-verified uid — the caller supplies it, never the browser. */
export function makeNorRecordFromDraft(draft, { ownerId, now } = {}) {
  const d = isPlainObject(draft) ? draft : {};
  const at = now || new Date().toISOString();
  const conversationId = str(d.conversationId).trim();
  const norId = norIdFromConversation(conversationId);
  const content = registryContentFromDraft(d);
  const numbering = isPlainObject(d.numbering) ? d.numbering : {};
  const title = content.subject || `NOR ${content.jenis || ''}`.trim();

  const base = makeNorRecord({
    norId,
    norNumber: '',
    sourceModule: NOR_SOURCE_MODULE.INTELLIGENCE,
    sourceFeature: (isPlainObject(d.provenance) && d.provenance.sourceFeature) || 'nor.generate',
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
    content,
    metadata: {
      draftId: d.draftId || null,
      conversationId: conversationId || null,
      sourceFeature: (isPlainObject(d.provenance) && d.provenance.sourceFeature) || null,
      suggestedNumber: typeof numbering.suggestedNumber === 'string' ? numbering.suggestedNumber : '',
      suggestionBasis: numbering.basis == null ? null : str(numbering.basis),
      suggestionConfidence: typeof numbering.confidence === 'number' ? numbering.confidence : 0,
      numberAllocation: null,
    },
    auditHistory: [
      { type: 'AI_DRAFT_CREATED', at, actorId: ownerId || null, fromVersion: null, version: 1, detail: { draftVersion: content.draftVersion } },
    ],
  });

  // makeNorRecord() now normalises `publishedVersion: null` to a genuine
  // null at the contract level (no Number(null) → 0 coercion), so a fresh
  // registry record already carries the right semantic value — no downstream
  // correction here.
  return Object.freeze({
    ...base,
    ownerId: ownerId || null,
    versions: Object.freeze([
      Object.freeze({ version: 1, at, actorId: ownerId || null, changeType: REGISTRY_CHANGE_TYPE.REGISTERED, content }),
    ]),
  });
}

/** True iff `from → to` is a legal lifecycle move (structural). */
export function canRegistryTransition(from, to) {
  return canNorTransition(from, to);
}

/**
 * A NEW immutable version from a human edit — the current content snapshot is
 * replaced by `nextContent`, `currentVersion` bumps, a `versions[]` entry is
 * appended (the previous entries are NEVER rewritten), and an
 * `AI_DRAFT_EDITED` audit entry is added. Returns `{ next, changed }`; a
 * no-op edit returns `{ next: record, changed: false }`.
 */
export function appendRegistryVersion(record, { nextContent, actorId, at } = {}) {
  const when = at || new Date().toISOString();
  if (record.status !== NOR_STATUS.IN_REVIEW) {
    return { next: record, changed: false, illegal: true };
  }
  const changed = registryContentChanged(record.content, nextContent);
  if (!changed) return { next: record, changed: false };
  const version = (record.currentVersion || 1) + 1;
  const content = Object.freeze({ ...nextContent });
  return {
    changed: true,
    next: Object.freeze({
      ...record,
      subject: content.subject,
      recipient: content.recipient,
      currentVersion: version,
      content,
      versions: Object.freeze([
        ...record.versions,
        Object.freeze({ version, at: when, actorId: actorId || null, changeType: REGISTRY_CHANGE_TYPE.HUMAN_EDIT, content }),
      ]),
      auditHistory: Object.freeze([
        ...record.auditHistory,
        { type: 'AI_DRAFT_EDITED', at: when, actorId: actorId || null, fromVersion: record.currentVersion, version, detail: {} },
      ]),
    }),
  };
}

/** in_review → approved (human, PART E). Pure — the caller enforces authz +
 *  expectedVersion. Returns `{ next }` or `{ error }`. */
export function markApproved(record, { actorId, at } = {}) {
  const when = at || new Date().toISOString();
  if (record.status === NOR_STATUS.PUBLISHED) return { error: 'ALREADY_PUBLISHED' };
  if (record.status !== NOR_STATUS.IN_REVIEW || !canRegistryTransition(record.status, NOR_STATUS.APPROVED)) {
    return { error: 'ILLEGAL_TRANSITION' };
  }
  return {
    next: Object.freeze({
      ...record,
      status: NOR_STATUS.APPROVED,
      auditHistory: Object.freeze([
        ...record.auditHistory,
        { type: 'AI_DRAFT_APPROVED', at: when, actorId: actorId || null, fromVersion: record.currentVersion, version: record.currentVersion, detail: {} },
      ]),
    }),
  };
}

/**
 * approved → published (human, PART G). `allocation` is the result of the
 * SERVER-SIDE atomic reservation ({ sequence, scopeKey, reservationKey,
 * allocatedAt, basis }). The official `norNumber` IS that server-reserved
 * sequence — there is NO client-supplied or human-supplied number input; the
 * browser can never choose, override, or inject the official number. The
 * decorated organizational (PBSI) format is an unresolved org rule — see the
 * phase report; until it is decided, the sequence itself is the canonical
 * number. Pure — the caller enforces authz + expectedVersion and performs
 * the reservation. Returns `{ next }` or `{ error }`.
 */
export function markPublished(record, { allocation, actorId, at } = {}) {
  const when = at || new Date().toISOString();
  if (record.status === NOR_STATUS.PUBLISHED) return { error: 'ALREADY_PUBLISHED' };
  if (record.status !== NOR_STATUS.APPROVED || !canRegistryTransition(record.status, NOR_STATUS.PUBLISHED)) {
    return { error: 'ILLEGAL_TRANSITION' };
  }
  if (!allocation || typeof allocation.sequence !== 'number') return { error: 'NUMBER_RESERVATION_FAILED' };
  const norNumber = String(allocation.sequence);
  const publishedVersion = record.currentVersion;
  return {
    next: Object.freeze({
      ...record,
      status: NOR_STATUS.PUBLISHED,
      norNumber,
      numberSource: NUMBER_SOURCE.RESERVED,
      publishedVersion,
      metadata: Object.freeze({
        ...record.metadata,
        numberAllocation: Object.freeze({
          sequence: allocation.sequence,
          scopeKey: allocation.scopeKey || null,
          reservationKey: allocation.reservationKey || null,
          allocatedAt: allocation.allocatedAt || when,
          basis: allocation.basis || null,
        }),
      }),
      versions: Object.freeze([
        ...record.versions.map((v) => (v.version === publishedVersion ? Object.freeze({ ...v, published: true }) : v)),
      ]),
      auditHistory: Object.freeze([
        ...record.auditHistory,
        {
          type: 'NOR_NUMBER_RESERVED',
          at: when,
          actorId: actorId || null,
          fromVersion: publishedVersion,
          version: publishedVersion,
          detail: { sequence: allocation.sequence, scopeKey: allocation.scopeKey || null, reservationKey: allocation.reservationKey || null },
        },
        {
          type: 'NOR_PUBLISHED',
          at: when,
          actorId: actorId || null,
          fromVersion: publishedVersion,
          version: publishedVersion,
          detail: { norNumber, numberSource: NUMBER_SOURCE.RESERVED },
        },
      ]),
    }),
  };
}
