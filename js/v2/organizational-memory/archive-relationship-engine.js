/* ============================================================
   ARCHIVE-RELATIONSHIP-ENGINE.JS — Archive Ownership & Intelligence (Phase 4)

   PURPOSE: turn the Archive from a flat list into a graph (Part 5), and give
   it real duplicate reasoning (Part 7) — deterministically, and only
   deterministically.

   PURE BY CONSTRUCTION. Every function here takes records IN and returns facts
   OUT. It reads no repository, holds no state, and imports nothing but its own
   contract. That is not stylistic: it is what lets services/archive-service.js
   own the data while this file owns the reasoning, with no cycle between them
   and no second source of truth. It is also what makes every claim below
   testable in isolation, with fixtures, in milliseconds.

   NO AI. NO SCORING. NO GUESSING. Every relationship is either

     (a) a RECORDED REFERENCE — a field a human or an engine explicitly wrote
         (supersedesId, parentId, knowledgeItemId, importSessionId), or
     (b) a PURE FUNCTION OF FACTS ALREADY PRESENT — an identical SHA-256, an
         identical document number, an identical archive date.

   There is no third category. Nothing here computes a similarity score,
   estimates a likelihood, or decides that two documents are "probably" the
   same. When the evidence does not determine an answer, the answer is that
   there is no relationship — not a confident guess at one.

   ON "NEAR DUPLICATE" (Part 7). The mission asks for it, and asks for it
   deterministically. Those two things constrain each other hard, so read what
   it actually means here: NEAR_DUPLICATE fires when two records carry the SAME
   identifying metadata (document number, date, sender) but DIFFERENT bytes. It
   is not a fuzzy match, a token overlap, or an edit distance — no such
   comparison exists in this file, because none of them is deterministic in any
   sense a human could audit. It is an exact statement: "these two documents
   claim to be the same document, and they are not byte-identical." That is a
   real, checkable, explainable condition, and it is genuinely the thing an
   archivist needs to be told about. It is not, and does not pretend to be,
   semantic similarity.

   RESPONSIBILITY: classifyDuplicate, findDuplicateIntelligence,
   deriveRelationships, buildReplacementChain.

   DEPENDENCIES: ./contracts/archive-record-contract.js only.
   ============================================================ */

'use strict';

import { ARCHIVE_RELATIONSHIP } from './contracts/archive-record-contract.js';

/** How two archived documents relate, when they relate by CONTENT rather than
 *  by a recorded reference. Ordered by strength of evidence — SAME_FILE is the
 *  strongest claim, NEAR_DUPLICATE the weakest, and even the weakest is an
 *  exact statement about exact fields. */
export const DUPLICATE_KIND = Object.freeze({
  /** Identical bytes AND identical origin: the same file, archived twice. */
  SAME_FILE: 'same_file',
  /** Identical bytes, different origin: the same content arrived by two routes
   *  (e.g. uploaded by hand, and later ingested from NOR). */
  SAME_CONTENT: 'same_content',
  /** Same document number, different bytes, and this one is NEWER: a revision. */
  UPDATED_VERSION: 'updated_version',
  /** Same identifying metadata (number + date + sender), different bytes, and
   *  NOT newer. Two records claiming to be the same document that are not the
   *  same document. See the header — this is an exact condition, not a score. */
  NEAR_DUPLICATE: 'near_duplicate',
  /** An explicitly recorded replacement chain (supersedesId), not an inference. */
  SUPERSEDED_VERSION: 'superseded_version',
});

/** Ordered oldest-first. Archive time is the only tiebreak available, and it is
 *  a real recorded fact — never a heuristic about which document "looks" newer. */
function olderFirst(a, b) {
  return String(a.archivedAt || '').localeCompare(String(b.archivedAt || ''));
}

/**
 * The deterministic verdict on how record `b` relates to record `a` by content.
 * Returns null when the facts do not determine a relationship — which is most
 * of the time, and is the correct answer.
 *
 * @param {object} a — the EARLIER record (the candidate original)
 * @param {object} b — the LATER record (the candidate duplicate)
 * @returns {{kind: string, rationale: string}|null}
 */
export function classifyDuplicate(a, b) {
  if (!a || !b || a.id === b.id) return null;

  // A recorded replacement beats every inference — a human (or an engine) said
  // so explicitly, and an explicit statement outranks a derived one.
  if (b.supersedesId === a.id) {
    return {
      kind: DUPLICATE_KIND.SUPERSEDED_VERSION,
      rationale: `"${b.documentNumber}" tercatat secara eksplisit menggantikan "${a.documentNumber}".`,
    };
  }

  const sameHash = !!a.documentHash && a.documentHash === b.documentHash;

  if (sameHash) {
    // Byte-identical. The only remaining question is whether it is literally the
    // same file arriving twice, or the same content arriving by a second route.
    const sameOrigin = a.sourceId === b.sourceId || a.sourceType === b.sourceType;
    return sameOrigin
      ? {
        kind: DUPLICATE_KIND.SAME_FILE,
        rationale: `Hash dokumen identik (${String(a.documentHash).slice(0, 12)}…) dan berasal dari sumber yang sama — file yang sama diarsipkan dua kali.`,
      }
      : {
        kind: DUPLICATE_KIND.SAME_CONTENT,
        rationale: `Hash dokumen identik (${String(a.documentHash).slice(0, 12)}…) tetapi tiba melalui jalur berbeda (${a.sourceType} vs ${b.sourceType}) — isi yang sama, asal berbeda.`,
      };
  }

  // Different bytes from here on. The only honest question left is whether the
  // two records CLAIM to be the same document.
  const sameNumber = !!a.documentNumber && a.documentNumber === b.documentNumber;
  if (!sameNumber) return null; // different bytes, different number: unrelated. Say nothing.

  const bIsNewer = olderFirst(a, b) < 0;
  if (bIsNewer) {
    return {
      kind: DUPLICATE_KIND.UPDATED_VERSION,
      rationale: `Nomor dokumen sama ("${a.documentNumber}") tetapi isinya berbeda, dan versi ini diarsipkan lebih baru — kemungkinan revisi.`,
    };
  }

  // Same number, different bytes, not newer. Do the identifying fields agree?
  const sameDate = (a.documentDate || null) === (b.documentDate || null);
  const sameSender = (a.senderOrigin || null) === (b.senderOrigin || null);
  if (sameDate && sameSender) {
    return {
      kind: DUPLICATE_KIND.NEAR_DUPLICATE,
      rationale: `Nomor, tanggal, dan pengirim identik, tetapi hash dokumen berbeda — dua arsip mengaku dokumen yang sama padahal isinya tidak identik. Perlu diperiksa manusia.`,
    };
  }
  return null;
}

/**
 * Every content-based duplicate relationship across a set of records. O(N·H)
 * where H is the size of the largest same-number/same-hash bucket — never
 * O(N²): records are bucketed by their two deterministic identifiers first, and
 * only compared within a bucket. A 5,000-record archive with no duplicates does
 * zero comparisons.
 *
 * @param {object[]} records
 * @returns {{originalId: string, duplicateId: string, kind: string, rationale: string}[]}
 */
export function findDuplicateIntelligence(records) {
  const buckets = new Map();
  const put = (key, r) => {
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  };
  for (const r of records) {
    put(`hash:${r.documentHash}`, r);
    put(`num:${r.sourceDomainType}:${r.documentNumber}`, r);
  }

  const seen = new Set();
  const out = [];
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(olderFirst);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        const pair = `${a.id}→${b.id}`;
        if (seen.has(pair)) continue; // a pair can land in both buckets
        const verdict = classifyDuplicate(a, b);
        if (!verdict) continue;
        seen.add(pair);
        out.push(Object.freeze({ originalId: a.id, duplicateId: b.id, ...verdict }));
      }
    }
  }
  return Object.freeze(out);
}

/**
 * Every relationship of ONE record: the recorded references it carries, plus
 * the content-based relationships derivable against the rest of the archive.
 *
 * @param {object} record
 * @param {object[]} allRecords — the archive it lives in
 * @returns {{type: string, targetId: string|null, rationale: string}[]}
 */
export function deriveRelationships(record, allRecords = []) {
  if (!record) return Object.freeze([]);
  const rel = [];
  const push = (type, targetId, rationale) => rel.push(Object.freeze({ type, targetId, rationale }));

  /* ── recorded references: someone explicitly wrote these down ── */
  if (record.duplicateOfId) {
    push(ARCHIVE_RELATIONSHIP.DUPLICATE_OF, record.duplicateOfId,
      'Tercatat sebagai duplikat byte-identik dari dokumen ini saat diarsipkan.');
  }
  if (record.supersedesId) {
    push(ARCHIVE_RELATIONSHIP.SUPERSEDES, record.supersedesId,
      'Dokumen ini tercatat menggantikan dokumen tersebut.');
  }
  if (record.supersededById) {
    push(ARCHIVE_RELATIONSHIP.SUPERSEDED_BY, record.supersededById,
      'Dokumen ini telah digantikan oleh dokumen tersebut.');
  }
  if (record.parentId) {
    push(ARCHIVE_RELATIONSHIP.DERIVED_FROM, record.parentId,
      'Dokumen ini diturunkan dari dokumen induk tersebut.');
    push(ARCHIVE_RELATIONSHIP.CHILD_OF, record.parentId,
      'Dokumen induk.');
  }
  if (record.knowledgeItemId) {
    push(ARCHIVE_RELATIONSHIP.IMPORTED_AS_KNOWLEDGE, record.knowledgeItemId,
      'Isi dokumen ini menjadi KnowledgeItem tersebut.');
    push(ARCHIVE_RELATIONSHIP.REFERENCED_BY, record.knowledgeItemId,
      'KnowledgeItem tersebut mengutip dokumen ini sebagai asalnya.');
  }
  if (record.datasetId) {
    push(ARCHIVE_RELATIONSHIP.BELONGS_TO_DATASET, record.datasetId,
      'Dokumen ini termasuk dalam dataset tersebut.');
  }

  /* ── derived: children, and content-based duplicates ── */
  for (const other of allRecords) {
    if (!other || other.id === record.id) continue;
    if (other.parentId === record.id) {
      push(ARCHIVE_RELATIONSHIP.PARENT_OF, other.id, 'Dokumen turunan dari dokumen ini.');
    }
    if (other.supersedesId === record.id && !record.supersededById) {
      // A chain recorded from the other end but not yet reflected here.
      push(ARCHIVE_RELATIONSHIP.SUPERSEDED_BY, other.id,
        'Dokumen tersebut tercatat menggantikan dokumen ini.');
    }
  }

  // Content-based duplicates, both directions, deterministic.
  for (const other of allRecords) {
    if (!other || other.id === record.id) continue;
    const older = olderFirst(record, other) <= 0 ? record : other;
    const newer = older === record ? other : record;
    const verdict = classifyDuplicate(older, newer);
    if (!verdict) continue;
    if (newer.id === record.id && !record.duplicateOfId) {
      push(ARCHIVE_RELATIONSHIP.DUPLICATE_OF, older.id, verdict.rationale);
    }
  }

  return Object.freeze(rel);
}

/**
 * The full replacement chain a record sits in, oldest first — following the
 * RECORDED supersedesId links only. A document that has been revised three
 * times can show a human all four versions in order, which is the question an
 * archivist actually asks ("what is the current version of this?").
 *
 * Cycle-safe: a malformed chain that loops back on itself terminates rather
 * than hanging.
 *
 * @param {object} record
 * @param {object[]} allRecords
 */
export function buildReplacementChain(record, allRecords = []) {
  if (!record) return Object.freeze([]);
  const byId = new Map(allRecords.map((r) => [r.id, r]));
  const seen = new Set();

  // Walk backwards to the origin.
  let head = record;
  while (head && head.supersedesId && !seen.has(head.id)) {
    seen.add(head.id);
    const prev = byId.get(head.supersedesId);
    if (!prev) break;
    head = prev;
  }

  // Then forwards to the current version.
  const chain = [];
  const walked = new Set();
  let cursor = head;
  while (cursor && !walked.has(cursor.id)) {
    walked.add(cursor.id);
    chain.push(cursor);
    const next = allRecords.find((r) => r.supersedesId === cursor.id)
      || (cursor.supersededById ? byId.get(cursor.supersededById) : null);
    cursor = next || null;
  }
  return Object.freeze(chain);
}
