'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceVisualTemplate.js — Phase 5.x.6

   The server-side boundary for the authoritative PBSI Visual Template
   System. HTTPS callable v2, region asia-southeast1, NO secrets. Sibling
   of intelligenceStyleGuide.js / intelligenceCorpus.js — same architecture.

   ── STAGED, NOT LIVE ──
   Per Phase 5.x.6 §33 this file is authored but is NOT wired into
   functions/index.js and NOT deployed. The RTDB rule block
   (/intelligence_visual_templates) is in database.rules.json but NOT
   deployed. scripts/intelligence-corpus-visual-template-check.cjs
   exercises this file via .run().

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token): the SAME
                        effective-admin boundary as every other
                        Intelligence callable. NO new permission id.
     3. actor         — the actor is request.auth.uid, ALWAYS. It is what
                        the store records as createdBy / approvedBy /
                        rejectedBy / deprecatedBy — never a client value (§11).
     4. evidence-derived — `proposeFromEvidence` rebuilds the visual
                        aggregation SERVER-SIDE from the CALLER'S OWN corpus
                        (listByOwner + listObservations by the verified uid,
                        then an INJECTED deterministic aggregator) and looks
                        the pattern up by `patternId`. The client cannot
                        inject template content, geometry, an
                        authorityState, or a status (§13, §21, §27). With no
                        aggregator wired the op fails safe with
                        VISUAL_ANALYSIS_UNAVAILABLE (§26).
     5. human gate    — `approve` requires a non-empty human `rationale`;
                        `reject` / `deprecate` require a `reason`. An
                        unresolved slot conflict fails closed (§21). There
                        is NO op that writes an `approved` template
                        directly and NO bulk-approve.
     6. read-only ops — `list` / `get` / `resolve` / `history` never write.
     7. audit         — metadata-only logger.info. NEVER a secret, a
                        token, the rationale text, or document body content.

   op ∈ { 'list', 'get', 'proposeFromEvidence', 'approve', 'reject',
          'deprecate', 'resolve', 'history' }.

   HARD SAFETY: nothing here touches V1 Petty Cash, generateNor(), the NOR
   Registry, the Style Guide, organizational knowledge, any renderer, or
   the feature flag. No OpenAI call. No model. No RAG. No production
   Visual Template mutation until deployed. STAGED — NOT wired into
   functions/index.js (§33).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { VISUAL_TEMPLATE_ERRORS, visualTemplateFailure } = require('./visualTemplateContract');
const visualTemplateStore = require('./visualTemplateStore');
const corpusStore = require('./corpusStore');

const OPS = new Set(['list', 'get', 'proposeFromEvidence', 'approve', 'reject', 'deprecate', 'resolve', 'history']);

/* ── the visual-evidence aggregator (INJECTED) — Phase 5.x.6 ──
   `proposeFromEvidence` gathers the CALLER'S OWN corpus and hands it to
   this runner (src/intelligence/corpus/visual-template/visual-evidence-
   aggregator.js#aggregateVisualEvidence) to reconstruct the
   VisualEvidenceReport SERVER-SIDE, then finds the requested pattern by
   `patternId`. PURE, DETERMINISTIC, geometry-only (§26). Wiring it in is a
   Phase 5.x.6 DEPLOY-time step; until then it is null and the op fails
   safe with VISUAL_ANALYSIS_UNAVAILABLE. The client cannot supply the
   corpus, an owner, or a pre-built pattern. */
let _visualAggregator = null;
function __setVisualAggregatorForTest(fn) { _visualAggregator = typeof fn === 'function' ? fn : null; }

/** Sanitise the client-supplied visual-template config — ONLY the geometry
 *  tolerance + the temporal windows. Nothing authoritative can be set. */
function sanitizeVisualConfig(c) {
  const src = c && typeof c === 'object' ? c : {};
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const out = { geometryTolerance: {}, temporal: {} };
  const g = src.geometryTolerance && typeof src.geometryTolerance === 'object' ? src.geometryTolerance : {};
  if (Number.isFinite(Number(g.pageSizeTolerancePt)) && Number(g.pageSizeTolerancePt) >= 0) out.geometryTolerance.pageSizeTolerancePt = Number(g.pageSizeTolerancePt);
  if (Number.isInteger(Number(g.pageRelativeDecimals)) && Number(g.pageRelativeDecimals) >= 0 && Number(g.pageRelativeDecimals) <= 6) out.geometryTolerance.pageRelativeDecimals = Math.floor(Number(g.pageRelativeDecimals));
  if (Number.isInteger(Number(g.minDocumentsForPattern)) && Number(g.minDocumentsForPattern) >= 1) out.geometryTolerance.minDocumentsForPattern = Math.floor(Number(g.minDocumentsForPattern));
  if (Number.isInteger(Number(g.minDocumentsForRecurrence)) && Number(g.minDocumentsForRecurrence) >= 1) out.geometryTolerance.minDocumentsForRecurrence = Math.floor(Number(g.minDocumentsForRecurrence));
  const t = src.temporal && typeof src.temporal === 'object' ? src.temporal : {};
  if (t.historicalCutoff === null || (typeof t.historicalCutoff === 'string' && ISO.test(t.historicalCutoff))) out.temporal.historicalCutoff = t.historicalCutoff;
  if (t.currentWindowStart === null || (typeof t.currentWindowStart === 'string' && ISO.test(t.currentWindowStart))) out.temporal.currentWindowStart = t.currentWindowStart;
  if (Number.isFinite(Number(t.transitionalOverlapDays)) && Number(t.transitionalOverlapDays) >= 0) out.temporal.transitionalOverlapDays = Math.floor(Number(t.transitionalOverlapDays));
  if (Number.isInteger(Number(t.minCurrentDocuments)) && Number(t.minCurrentDocuments) >= 1) out.temporal.minCurrentDocuments = Math.floor(Number(t.minCurrentDocuments));
  if (Number.isInteger(Number(t.minHistoricalDocuments)) && Number(t.minHistoricalDocuments) >= 1) out.temporal.minHistoricalDocuments = Math.floor(Number(t.minHistoricalDocuments));
  return out;
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

/** Rebuild the visual aggregation server-side and return the pattern with
 *  the given patternId (or null). */
async function findVisualPattern(uid, patternId, data, now) {
  if (typeof _visualAggregator !== 'function') return { error: 'VISUAL_ANALYSIS_UNAVAILABLE' };
  const corpus = await gatherOwnerCorpus(uid);
  const cfg = sanitizeVisualConfig(data.config);
  let report;
  try {
    report = await _visualAggregator({ observations: corpus.observations, documents: corpus.documents }, cfg, { at: now });
  } catch (e) {
    logger.error('[intelligence/visual-template] aggregator error', { actor: uid, error: e && e.message });
    return { error: 'VISUAL_ANALYSIS_FAILED' };
  }
  if (!report || typeof report !== 'object' || !Array.isArray(report.patterns)) {
    return { error: 'VISUAL_ANALYSIS_FAILED' };
  }
  const pattern = report.patterns.find((p) => p && String(p.patternId) === String(patternId));
  return { pattern: pattern || null };
}

const intelligenceVisualTemplate = onCall({ region: REGION }, async (request) => {
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
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan list | get | proposeFromEvidence | approve | reject | deprecate | resolve | history.`);
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
      if (data.documentType != null) filter.documentType = data.documentType;
      result = await visualTemplateStore.listTemplates(db, filter);
    } else if (op === 'get') {
      result = await visualTemplateStore.getTemplate(db, String(data.templateId || ''));
    } else if (op === 'history') {
      result = await visualTemplateStore.getHistory(db, String(data.templateId || ''));
    } else if (op === 'resolve') {
      result = await visualTemplateStore.resolveTemplate(db, {
        scope: data.scope != null ? String(data.scope) : undefined,
        documentType: String(data.documentType || ''),
      });
      if (result.ok) event = 'VISUAL_TEMPLATE_RESOLVED';
    } else if (op === 'proposeFromEvidence') {
      const patternId = String(data.patternId || '');
      if (!patternId) {
        result = visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'proposeFromEvidence: a `patternId` is required.');
      } else {
        const found = await findVisualPattern(uid, patternId, data, now);
        if (found.error) {
          const code = VISUAL_TEMPLATE_ERRORS[found.error] || 'VISUAL_ANALYSIS_FAILED';
          result = visualTemplateFailure(code, found.error === 'VISUAL_ANALYSIS_UNAVAILABLE'
            ? 'The deterministic visual-evidence aggregator is not wired in this deployment (§33). The Visual Template proposal path is staged.'
            : 'the visual aggregation could not be rebuilt.');
        } else if (!found.pattern) {
          result = visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.PATTERN_NOT_FOUND, `No visual pattern "${patternId}" in your corpus view.`);
        } else {
          result = await visualTemplateStore.proposeFromEvidence(db, {
            pattern: found.pattern,
            actorId: uid,
            now,
            supersedesTemplateId: data.supersedesTemplateId != null ? String(data.supersedesTemplateId) : null,
          });
          if (result.ok) event = 'VISUAL_TEMPLATE_PROPOSED';
        }
      }
    } else if (op === 'approve') {
      result = await visualTemplateStore.approveTemplate(db, String(data.templateId || ''), {
        actorId: uid,
        rationale: typeof data.rationale === 'string' ? data.rationale : '',
        at: now,
        expectedVersion,
        acknowledgeConflict: data.acknowledgeConflict === true,
      });
      if (result.ok) event = 'VISUAL_TEMPLATE_APPROVED';
    } else if (op === 'reject') {
      result = await visualTemplateStore.rejectTemplate(db, String(data.templateId || ''), {
        actorId: uid,
        reason: typeof data.reason === 'string' ? data.reason : '',
        at: now,
        expectedVersion,
      });
      if (result.ok) event = 'VISUAL_TEMPLATE_REJECTED';
    } else { // deprecate
      result = await visualTemplateStore.deprecateTemplate(db, String(data.templateId || ''), {
        actorId: uid,
        reason: typeof data.reason === 'string' ? data.reason : '',
        at: now,
        expectedVersion,
      });
      if (result.ok) event = 'VISUAL_TEMPLATE_DEPRECATED';
    }
  } catch (err) {
    logger.error('[intelligence/visual-template] persistence error', { op, actor: uid, error: err && err.message });
    result = visualTemplateFailure('INTERNAL', 'Gagal memproses Visual Template.');
  }

  // METADATA ONLY — never a secret, token, credential, the rationale text,
  // or document body content.
  const d = result && result.data && !Array.isArray(result.data) ? result.data : {};
  logger.info('[intelligence/visual-template]', {
    op,
    event: result.ok ? event : null,
    actor: uid,
    templateId: d.templateId || (d.template && d.template.templateId) || data.templateId || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    status: d.status || (d.template && d.template.status) || null,
    authorityState: d.authorityState || null,
    outcome: d.outcome || null,
    version: typeof d.templateVersion === 'number' ? d.templateVersion : null,
  });

  return result;
});

module.exports = {
  intelligenceVisualTemplate,
  __setVisualAggregatorForTest,
};
