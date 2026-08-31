/* ============================================================
   MEMORY-RETRIEVAL.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the read-only bridge to Organizational Memory — the archive of
   past official documents (PART 7). Distinct from Approved Knowledge:
   Memory is "what happened before" (real prior NOR records), not "what the
   organization has decided is true". Retrieved here for two reasons:
     1. recipient-pattern context — how past NORs of this type addressed
        their "Kepada", so the model/clarifier can PROPOSE (never impose) a
        recipient, and knows to ASK when the past is ambiguous (PART 8).
     2. numbering context — the recent number sequence, so a SUGGESTED
        number can be offered (authority stays with the Registry, PART 9).

   RESPONSIBILITY: retrieveRecentArchive({ domainType, memoryReader, limit }),
   summarizeRecipientPatterns(records).

   DEPENDENCIES: none hard — `memoryReader` is injected. Default reader wires
   src/organizational-memory/services/archive-service.js#listArchive.

   NON-GOALS: no write, no dedup logic (archive-relationship-engine owns
   that), no invention — an empty archive yields empty context.
   ============================================================ */

'use strict';

/**
 * @param {Object} args
 * @param {string} args.domainType
 * @param {{ listArchive: (filter?: object) => {ok:boolean,data:*,error:*} }} args.memoryReader
 * @param {number} [args.limit]
 * @returns {{ ok: boolean, records: object[], refs: string[], error: {code:string,message:string}|null }}
 */
export function retrieveRecentArchive({ domainType, memoryReader, limit = 25 }) {
  if (!memoryReader || typeof memoryReader.listArchive !== 'function') {
    return { ok: false, records: [], refs: [], error: { code: 'NO_READER', message: 'memoryReader.listArchive is required.' } };
  }
  const res = memoryReader.listArchive({ sourceDomainType: domainType });
  if (!res || !res.ok) {
    return { ok: false, records: [], refs: [], error: (res && res.error) || { code: 'READ_FAILED', message: 'listArchive failed.' } };
  }
  const records = (Array.isArray(res.data) ? res.data : [])
    .slice()
    .sort((a, b) => String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || '')))
    .slice(0, Math.max(0, limit));
  return { ok: true, records, refs: records.map((r) => r.id).filter(Boolean), error: null };
}

/**
 * How past records addressed their recipient. Returns the distinct
 * recipients seen and whether the past is consistent enough to PROPOSE one.
 * @param {object[]} records
 * @returns {{ distinct: string[], dominant: string|null, consistent: boolean, sampleSize: number }}
 */
export function summarizeRecipientPatterns(records) {
  const counts = new Map();
  for (const r of records || []) {
    const recip = r && (r.recipient || (r.metadata && r.metadata.recipient));
    if (typeof recip === 'string' && recip.trim()) {
      const key = recip.trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const sampleSize = [...counts.values()].reduce((a, b) => a + b, 0);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const distinct = sorted.map(([k]) => k);
  const dominant = sorted.length ? sorted[0][0] : null;
  // "consistent" only when a clear majority of a non-trivial sample used ONE recipient.
  const consistent = sampleSize >= 3 && sorted.length > 0 && sorted[0][1] / sampleSize >= 0.7;
  return { distinct, dominant, consistent, sampleSize };
}
