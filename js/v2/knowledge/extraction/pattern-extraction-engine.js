/* ============================================================
   PATTERN-EXTRACTION-ENGINE.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: "Pattern Extraction" / "Structure Extraction" — mines the
   Approved population of one domainType+kind group into ONE aggregate
   PatternEntry (knowledge/language/contracts/pattern-contract.js, real
   since Phase 3.5, never redefined here) describing which payload fields
   are consistently present ("slots") across the population — a real,
   generic, deterministic field-presence statistic, not a fabricated
   template. Works on ANY structural payload (payload shape is opaque to
   the core by design) — not NOR-specific, though NOR's `structure` items
   (knowledge/connectors/nor-connector.js) are the only real population to
   run it against today.

   RESPONSIBILITY: `extractPattern(domainType, kind, opts)` — writes one
   Candidate `kind:'structure'` item summarizing the group via
   extraction-write-helper.js.

   DEPENDENCIES: index-engine.js, extraction-write-helper.js,
   knowledge/language/contracts/pattern-contract.js,
   knowledge/contracts/identity-contract.js.

   NON-GOALS: only ever reads Approved input (index-engine.js's default)
   — extraction never mines its OWN prior Candidate output, which would
   create a feedback loop (a Candidate pattern influencing the next
   pattern extraction before a human ever reviewed it). Never claims a
   slot exists when the population doesn't actually show it.
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from './index-engine.js';
import { writeExtractedCandidate } from './extraction-write-helper.js';
import { isPatternEntry } from '../language/contracts/pattern-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

const DEFAULT_SLOT_THRESHOLD = 0.8;

/** Pure. Computes, for each top-level payload key across `items`, the
 *  fraction with a truthy/defined value. Exported for reuse by
 *  machine-learning/pattern-mining-engine.js (V2.0.9), which applies the
 *  SAME statistic per-cluster instead of over a whole domainType+kind
 *  population. */
export function fieldPresenceRates(items) {
  const counts = new Map();
  for (const item of items) {
    for (const key of Object.keys(item.payload || {})) {
      if (item.payload[key] === undefined || item.payload[key] === null || item.payload[key] === false) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const rates = new Map();
  for (const [key, count] of counts) rates.set(key, count / items.length);
  return rates;
}

/**
 * @param {string} domainType
 * @param {string} kind          - the SOURCE kind being mined (e.g. 'structure')
 * @param {{slotThreshold?: number, targetKind?: string}} [opts]
 * @returns {{ok: boolean, itemsAnalyzed: number, pattern: import('../language/contracts/pattern-contract.js').PatternEntry|null, write: object|null, error: object|null}}
 */
export function extractPattern(domainType, kind, opts = {}) {
  const targetKind = opts.targetKind || kind;
  const threshold = opts.slotThreshold ?? DEFAULT_SLOT_THRESHOLD;

  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, itemsAnalyzed: 0, pattern: null, write: null, error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to extract a pattern from.` } };
  }

  const rates = fieldPresenceRates(items);
  const slots = [...rates.entries()]
    .filter(([, rate]) => rate >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([name, rate]) => ({ name, type: 'presence', rate: Math.round(rate * 100) / 100 }));

  const pattern = Object.freeze({
    template: `${domainType}/${kind} pattern: {{${slots.map((s) => s.name).join('}}, {{')}}}`,
    slots: Object.freeze(slots),
    granularity: 'structure',
  });

  if (!isPatternEntry(pattern)) {
    return { ok: false, itemsAnalyzed: items.length, pattern: null, write: null, error: { code: 'INVALID_PATTERN', message: 'extractPattern: constructed an invalid PatternEntry.' } };
  }

  const now = new Date().toISOString();
  const sourceRef = `pattern:${domainType}:${kind}`;
  const candidate = Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType: 'extraction', sourceRef }),
    version: 1, domainType, sourceType: 'extraction', kind: targetKind,
    payload: pattern, confidence: Math.min(1, items.length / 10), // more source items -> more confident, capped at 1
    lifecycleState: LIFECYCLE_STATE.CANDIDATE,
    provenance: Object.freeze({ connectorId: 'extraction', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });

  const write = writeExtractedCandidate(candidate);
  return { ok: write.ok, itemsAnalyzed: items.length, pattern, write, error: write.ok ? null : write.error };
}
