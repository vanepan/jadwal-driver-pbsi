/* ============================================================
   TEMPORAL-INPUT.JS — Historical vs Current Convention (V2, Phase 5.x.3)

   PURPOSE: assemble the { observations, documents } input the temporal
   analyzer needs, from the shape the corpus store returns (a list of
   CorpusDocuments + each document's observations). Also normalise a
   client-supplied `approvedRules` array into a strict, READ-ONLY shape
   ({ category, key, value, ruleId }) — every other field a caller might
   attach (approvedBy, authority, currentness, …) is DROPPED here (§19).

   RESPONSIBILITY: buildTemporalInput({ documents, observationsByDocument }),
   sanitizeApprovedRules(list).

   DEPENDENCIES: none. PURE.
   ============================================================ */

'use strict';

/**
 * @param {{ documents: object[], observationsByDocument?: Record<string,object[]>, observations?: object[] }} input
 * @returns {{ observations: object[], documents: object[] }}
 */
export function buildTemporalInput({ documents = [], observationsByDocument = {}, observations = [] } = {}) {
  const docs = (Array.isArray(documents) ? documents : []).filter((d) => d && typeof d === 'object' && d.documentId);
  const obs = [];
  if (Array.isArray(observations) && observations.length) {
    for (const o of observations) if (o && typeof o === 'object') obs.push(o);
  }
  if (observationsByDocument && typeof observationsByDocument === 'object') {
    for (const list of Object.values(observationsByDocument)) {
      for (const o of (Array.isArray(list) ? list : [])) if (o && typeof o === 'object') obs.push(o);
    }
  }
  // de-dup observations by observationId (a document may be listed twice)
  const seen = new Set();
  const observationsOut = [];
  for (const o of obs) {
    const id = String(o.observationId || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    observationsOut.push(o);
  }
  // de-dup documents by documentId
  const dseen = new Set();
  const documentsOut = [];
  for (const d of docs) {
    const id = String(d.documentId);
    if (dseen.has(id)) continue;
    dseen.add(id);
    documentsOut.push(d);
  }
  return { observations: observationsOut, documents: documentsOut };
}

/**
 * Normalise an untrusted `approvedRules` list to the ONLY shape the
 * temporal layer reads. A rule is a pointer to an ALREADY-EXISTING
 * human-approved convention; this layer compares against it and NEVER
 * writes it (§10, §19).
 * @param {any} list
 * @returns {{category:string,key:string,value:string,ruleId:string|null}[]}
 */
export function sanitizeApprovedRules(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && typeof r === 'object' && r.category && r.key && r.value != null)
    .map((r) => Object.freeze({
      category: String(r.category),
      key: String(r.key),
      value: String(r.value),
      ruleId: r.ruleId == null ? null : String(r.ruleId),
    }));
}
