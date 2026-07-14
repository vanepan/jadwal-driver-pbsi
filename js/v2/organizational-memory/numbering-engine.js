/* ============================================================
   NUMBERING-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Automatic Numbering" / "Editable Numbering" — a real, generic
   pattern-inference algorithm over WHATEVER numbering scheme the archive
   actually contains, since research confirmed `norNumber` is free-text
   with no fixed format (unlike `petty-cash-service.js#nextRefNumber()`,
   which assumes one hardcoded pattern, `PC/{YYMM}/{seq}`, for a different
   field). This engine does not assume ANY format — it infers the
   majority template from real archived numbers and is honest (confidence
   0) when no consistent pattern exists. Always advisory — see
   contracts/numbering-contract.js's header for why this is never written
   back to V1.

   RESPONSIBILITY: `parseNumber`/`majorityTemplateGroup` (shared with
   gap-detection-engine.js, which reasons about the SAME inferred
   pattern) and `suggestNextNumber(domainType)`.

   DEPENDENCIES: repository/archive-repository.js,
   contracts/numbering-contract.js.
   ============================================================ */

'use strict';

import { listArchive as list } from './services/archive-service.js';
import { makeNumberingSuggestion } from './contracts/numbering-contract.js';

/** Splits "NOR-2026-014" into { template: "NOR-2026-{}", numeric: 14, width: 3 }.
 *  Uses the LAST contiguous digit run — the part most numbering schemes
 *  increment. Returns null if the number has no digits at all. */
export function parseNumber(documentNumber) {
  const match = documentNumber.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  return { template: `${prefix}{}${suffix}`, numeric: parseInt(digits, 10), width: digits.length, original: documentNumber };
}

/** Groups parsed numbers by template, returning the majority
 *  { template, group, totalParsed } — shared by suggestNextNumber() and
 *  gap-detection-engine.js so both reason about the SAME inferred pattern.
 *  Returns null if no number in the input has a parseable digit run. */
export function majorityTemplateGroup(documentNumbers) {
  const parsed = documentNumbers.map(parseNumber).filter(Boolean);
  if (!parsed.length) return null;
  const byTemplate = new Map();
  for (const p of parsed) {
    if (!byTemplate.has(p.template)) byTemplate.set(p.template, []);
    byTemplate.get(p.template).push(p);
  }
  const [template, group] = [...byTemplate.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return { template, group, totalParsed: parsed.length };
}

/**
 * @param {string} domainType
 * @returns {import('./contracts/numbering-contract.js').NumberingSuggestion}
 */
export function suggestNextNumber(domainType) {
  const result = list({ sourceDomainType: domainType });
  const numbers = result.ok ? result.data.map((r) => r.documentNumber) : [];
  const grouping = majorityTemplateGroup(numbers);

  if (!grouping) {
    return makeNumberingSuggestion({ domainType, suggestedNumber: '', basis: `No archived ${domainType} numbers to infer a pattern from.`, confidence: 0 });
  }

  const { template, group, totalParsed } = grouping;
  const confidence = group.length / totalParsed;
  const maxEntry = group.reduce((max, p) => (p.numeric > max.numeric ? p : max), group[0]);
  const nextNumeric = maxEntry.numeric + 1;
  const suggestedNumber = template.replace('{}', String(nextNumeric).padStart(maxEntry.width, '0'));

  return makeNumberingSuggestion({
    domainType,
    suggestedNumber,
    basis: `Next in sequence after "${maxEntry.original}" — ${group.length}/${totalParsed} archived numbers share this pattern.`,
    confidence,
  });
}
