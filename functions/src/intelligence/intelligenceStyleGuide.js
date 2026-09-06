'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceStyleGuide.js — Phase 5.x.5

   The server-side boundary for the authoritative PBSI NOR Style Guide.
   HTTPS callable v2, region asia-southeast1, NO secrets. Sibling of
   intelligenceNorRegistry.js / intelligenceCorpus.js — same architecture.

   ── STAGED, NOT LIVE ──
   Per Phase 5.x.5 §28 this file is authored but is NOT wired into
   functions/index.js and NOT deployed. The RTDB rule block
   (/intelligence_style_guide) is in database.rules.json but NOT deployed.
   scripts/intelligence-corpus-style-guide-check.cjs exercises this file
   via .run().

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token): the SAME
                        effective-admin boundary as every other
                        Intelligence callable (Phase 3C). NO new
                        permission id, NO per-user grant.
     3. actor         — the actor is request.auth.uid, ALWAYS. It is what
                        the store records as createdBy / approvedBy /
                        rejectedBy / deprecatedBy — never a client value (§9).
     4. WM-derived    — `proposeFromMemory` rebuilds Organizational Writing
                        Memory SERVER-SIDE from the CALLER'S OWN corpus
                        (listByOwner + listObservations by the verified
                        uid) and looks the entry up by `memoryId`. The
                        client cannot inject rule content, evidence, an
                        authorityState, or a status (§13, §22, §26). With
                        no builder wired the op fails safe with
                        WRITING_MEMORY_UNAVAILABLE.
     5. human gate    — `approve` requires a non-empty human `rationale`;
                        `reject` / `deprecate` require a `reason`. An
                        unresolved slot conflict fails closed (§14, §21).
                        There is NO op that writes an `approved` rule
                        directly and NO bulk-approve.
     6. read-only ops — `list` / `get` / `resolve` / `history` never write.
     7. audit         — metadata-only logger.info. NEVER a secret, a
                        token, the rationale text, or corpus body content.

   op ∈ { 'list', 'get', 'proposeFromMemory', 'approve', 'reject',
          'deprecate', 'resolve', 'history' }.

   HARD SAFETY: nothing here touches V1 Petty Cash, generateNor(),
   numbering, the NOR Registry, organizational knowledge, the NOR
   generator, or the feature flag. No OpenAI call. No RAG. No production
   Style Guide mutation until deployed. STAGED — NOT wired into
   functions/index.js (§28).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { STYLE_GUIDE_ERRORS, styleGuideFailure } = require('./styleGuideContract');
const styleGuideStore = require('./styleGuideStore');
const corpusStore = require('./corpusStore');

const OPS = new Set(['list', 'get', 'proposeFromMemory', 'approve', 'reject', 'deprecate', 'resolve', 'history']);

/* ── the writing-memory builder (INJECTED) — Phase 5.x.4/5.x.5 ──
   `proposeFromMemory` gathers the CALLER'S OWN corpus and hands it to this
   runner (src/intelligence/corpus/writing-memory/writing-memory-builder.js
   #buildWritingMemory) to reconstruct the WritingMemoryReport SERVER-SIDE,
   then finds the requested entry by `memoryId`. PURE, READ-ONLY,
   DETERMINISTIC. Wiring it in is a Phase 5.x.5 DEPLOY-time step; until
   then it is null and the op fails safe with WRITING_MEMORY_UNAVAILABLE.
   The client cannot supply the corpus, an owner, or a pre-built entry. */
let _writingMemoryBuilder = null;
function __setWritingMemoryBuilderForTest(fn) { _writingMemoryBuilder = typeof fn === 'function' ? fn : null; }

/* ── PRODUCTION WIRING (Controlled Deployment Phase C1) ──────────────
   `proposeFromMemory` now rebuilds Organizational Writing Memory through
   the verbatim, drift-guarded corpus mirror that ships INSIDE the
   Functions bundle (functions/src/intelligence/corpus-esm/, an ESM
   package). Loaded ONCE, lazily. A test injection (__setWritingMemory-
   BuilderForTest) ALWAYS wins. If the import throws, the builder resolves
   to null and proposeFromMemory fails safe with WRITING_MEMORY_UNAVAILABLE
   exactly as before. The mirror is PURE — no Firebase, no network, no
   model. §10: the __set*ForTest seam is retained for unit isolation. */
let _prodWritingMemoryBuilder;
async function resolveWritingMemoryBuilder() {
  if (typeof _writingMemoryBuilder === 'function') return _writingMemoryBuilder;
  if (_prodWritingMemoryBuilder === undefined) {
    try {
      const wm = await import('./corpus-esm/writing-memory/writing-memory-builder.js');
      _prodWritingMemoryBuilder = (input, config, opts) => wm.buildWritingMemory(input, config, opts);
    } catch (err) {
      logger.error('[intelligence/style-guide] corpus-esm writing-memory builder failed to load — proposeFromMemory fails safe', { error: err && err.message });
      _prodWritingMemoryBuilder = null;
    }
  }
  return _prodWritingMemoryBuilder;
}

/** Drop every field of a client-supplied approved rule except the four the
 *  Writing Memory / temporal layers read (mirror of the intelligenceCorpus
 *  helper — §19). */
function sanitizeApprovedRules(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && typeof r === 'object' && r.category && r.key && r.value != null)
    .slice(0, 200)
    .map((r) => ({ category: String(r.category), key: String(r.key), value: String(r.value), ruleId: r.ruleId == null ? null : String(r.ruleId) }));
}

/** Sanitise the client-supplied analysis config — ONLY the temporal
 *  windows / thresholds + the candidate-grouping threshold (mirror of the
 *  intelligenceCorpus helper). */
function sanitizeTemporalConfig(c) {
  const t = c && typeof c === 'object' && c.temporal && typeof c.temporal === 'object' ? c.temporal : (c && typeof c === 'object' ? c : {});
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const out = {};
  if (t.historicalCutoff === null || (typeof t.historicalCutoff === 'string' && ISO.test(t.historicalCutoff))) out.historicalCutoff = t.historicalCutoff;
  if (t.currentWindowStart === null || (typeof t.currentWindowStart === 'string' && ISO.test(t.currentWindowStart))) out.currentWindowStart = t.currentWindowStart;
  if (Number.isFinite(Number(t.transitionalOverlapDays)) && Number(t.transitionalOverlapDays) >= 0) out.transitionalOverlapDays = Math.floor(Number(t.transitionalOverlapDays));
  if (Number.isInteger(Number(t.minCurrentDocuments)) && Number(t.minCurrentDocuments) >= 1) out.minCurrentDocuments = Math.floor(Number(t.minCurrentDocuments));
  if (Number.isInteger(Number(t.minHistoricalDocuments)) && Number(t.minHistoricalDocuments) >= 1) out.minHistoricalDocuments = Math.floor(Number(t.minHistoricalDocuments));
  if (Number.isFinite(Number(t.conflictMinorityRatio)) && Number(t.conflictMinorityRatio) > 0 && Number(t.conflictMinorityRatio) <= 1) out.conflictMinorityRatio = Number(t.conflictMinorityRatio);
  const result = { temporal: out };
  const cm = c && typeof c === 'object' ? c.candidateMinDocuments : undefined;
  if (Number.isInteger(Number(cm)) && Number(cm) >= 2) result.candidateMinDocuments = Math.floor(Number(cm));
  return result;
}

/** Gather the caller's OWN corpus: every document owned by `uid`, plus its
 *  observations. Read-only. (Mirror of the intelligenceCorpus helper.) */
async function gatherOwnerCorpus(uid) {
  const docsRes = await corpusStore.listByOwner(db, uid);
  const documents = docsRes.ok && Array.isArray(docsRes.data) ? docsRes.data : [];
  const observations = [];
  for (const d of documents) {
    if (!d || !d.documentId) continue;
    const obsRes = await corpusStore.listObservations(db, d.documentId);
    if (obsRes.ok && Array.isArray(obsRes.data)) {
      for (const o of obsRes.data) observations.push(o);
    }
  }
  return { documents, observations };
}

/** Rebuild Writing Memory server-side and return the entry with the given
 *  memoryId (or null). */
async function findWritingMemoryEntry(uid, memoryId, data, now) {
  const writingMemoryBuilder = await resolveWritingMemoryBuilder();
  // reached ONLY if the corpus-esm mirror could not be imported (and no
  // test injection is present) — proposeFromMemory then fails safe.
  if (typeof writingMemoryBuilder !== 'function') return { error: 'WRITING_MEMORY_UNAVAILABLE' };
  const corpus = await gatherOwnerCorpus(uid);
  const cfg = sanitizeTemporalConfig(data.config);
  const approvedRules = sanitizeApprovedRules(data.approvedRules);
  let report;
  try {
    report = await writingMemoryBuilder({ ...corpus, approvedRules }, cfg, { at: now });
  } catch (e) {
    logger.error('[intelligence/style-guide] writing-memory builder error', { actor: uid, error: e && e.message });
    return { error: 'WRITING_MEMORY_FAILED' };
  }
  if (!report || typeof report !== 'object' || !Array.isArray(report.entries)) {
    return { error: 'WRITING_MEMORY_FAILED' };
  }
  const entry = report.entries.find((e) => e && String(e.memoryId) === String(memoryId)
    && (e.authorityState === 'observed' || e.authorityState === 'candidate'));
  return { entry: entry || null };
}

const intelligenceStyleGuide = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }
  const gate = canUseIntelligence(auth.token);
  if (!gate.ok) {
    throw new HttpsError('permission-denied', gate.reason || 'Tidak berhak menggunakan Sarpras Intelligence.');
  }

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const op = String(data.op || '');
  if (!OPS.has(op)) {
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan list | get | proposeFromMemory | approve | reject | deprecate | resolve | history.`);
  }

  const uid = auth.uid; // the ONLY source of truth for the actor
  const now = new Date().toISOString();
  const expectedVersion = typeof data.expectedVersion === 'number' ? data.expectedVersion : undefined;
  let result;
  let event = null;

  try {
    if (op === 'list') {
      const filter = {};
      if (data.status != null) filter.status = data.status;
      if (data.category != null) filter.category = data.category;
      if (data.documentType != null) filter.documentType = data.documentType;
      result = await styleGuideStore.listRules(db, filter);
    } else if (op === 'get') {
      result = await styleGuideStore.getRule(db, String(data.ruleId || ''));
    } else if (op === 'history') {
      result = await styleGuideStore.getHistory(db, String(data.ruleId || ''));
    } else if (op === 'resolve') {
      result = await styleGuideStore.resolveRule(db, {
        scope: data.scope != null ? String(data.scope) : undefined,
        category: String(data.category || ''),
        key: String(data.key || ''),
        documentType: String(data.documentType || ''),
      });
      if (result.ok) event = 'STYLE_RULE_RESOLVED';
    } else if (op === 'proposeFromMemory') {
      const memoryId = String(data.memoryId || '');
      if (!memoryId) {
        result = styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'proposeFromMemory: a `memoryId` is required.');
      } else {
        const found = await findWritingMemoryEntry(uid, memoryId, data, now);
        if (found.error) {
          const code = STYLE_GUIDE_ERRORS[found.error] || 'WRITING_MEMORY_FAILED';
          result = styleGuideFailure(code, found.error === 'WRITING_MEMORY_UNAVAILABLE'
            ? 'The organizational writing memory builder is not wired in this deployment (§28). The Style Guide proposal path is staged.'
            : 'the writing memory could not be rebuilt.');
        } else if (!found.entry) {
          result = styleGuideFailure(STYLE_GUIDE_ERRORS.MEMORY_NOT_FOUND, `No observed/candidate Writing Memory entry "${memoryId}" in your corpus view.`);
        } else {
          result = await styleGuideStore.proposeFromMemory(db, {
            memory: found.entry,
            actorId: uid,
            now,
            supersedesRuleId: data.supersedesRuleId != null ? String(data.supersedesRuleId) : null,
          });
          if (result.ok) event = 'STYLE_RULE_PROPOSED';
        }
      }
    } else if (op === 'approve') {
      result = await styleGuideStore.approveRule(db, String(data.ruleId || ''), {
        actorId: uid,
        rationale: typeof data.rationale === 'string' ? data.rationale : '',
        at: now,
        expectedVersion,
        acknowledgeConflict: data.acknowledgeConflict === true,
      });
      if (result.ok) event = 'STYLE_RULE_APPROVED';
    } else if (op === 'reject') {
      result = await styleGuideStore.rejectRule(db, String(data.ruleId || ''), {
        actorId: uid,
        reason: typeof data.reason === 'string' ? data.reason : '',
        at: now,
        expectedVersion,
      });
      if (result.ok) event = 'STYLE_RULE_REJECTED';
    } else { // deprecate
      result = await styleGuideStore.deprecateRule(db, String(data.ruleId || ''), {
        actorId: uid,
        reason: typeof data.reason === 'string' ? data.reason : '',
        at: now,
        expectedVersion,
      });
      if (result.ok) event = 'STYLE_RULE_DEPRECATED';
    }
  } catch (err) {
    logger.error('[intelligence/style-guide] persistence error', { op, actor: uid, error: err && err.message });
    result = styleGuideFailure('INTERNAL', 'Gagal memproses Style Guide.');
  }

  // METADATA ONLY — never a secret, token, credential, the rationale text,
  // or corpus body content.
  const d = result && result.data && !Array.isArray(result.data) ? result.data : {};
  logger.info('[intelligence/style-guide]', {
    op,
    event: result.ok ? event : null,
    actor: uid,
    ruleId: d.ruleId || (d.rule && d.rule.ruleId) || data.ruleId || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    status: d.status || (d.rule && d.rule.status) || null,
    authorityState: d.authorityState || null,
    outcome: d.outcome || null,
    version: typeof d.version === 'number' ? d.version : null,
  });

  return result;
});

module.exports = {
  intelligenceStyleGuide,
  __setWritingMemoryBuilderForTest,
};
