'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceCorpus.js — Phase 5.x.1

   The server-side boundary for the historical NOR / Memorandum CORPUS
   (Phase 5.x.1 §13, §14). HTTPS callable v2, region asia-southeast1, NO
   secrets. Sibling of intelligenceNorRegistry.js / intelligenceNorDraft.js —
   same architecture.

   ── STAGED, NOT LIVE ──
   Per Phase 5.x.1 §20 this file is authored but is NOT wired into
   functions/index.js and NOT deployed. The two RTDB rule blocks
   (/intelligence_corpus_documents, /intelligence_corpus_observations) are
   in database.rules.json but NOT deployed. Wiring + the
   `firebase deploy --only database` review belong to Phase 5.x.2.
   scripts/intelligence-corpus-check.cjs still exercises this file via
   .run().

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token): the SAME
                        effective-admin boundary as every other
                        Intelligence callable (Phase 3C). NO new
                        permission id, NO per-user grant.
     3. own           — the actor / owner is request.auth.uid, ALWAYS.
                        Cross-owner get / observations / recordObservation
                        / setAnalysisStatus → a FORBIDDEN envelope.
     4. classify only — `ingest` takes the CLASSIFICATION metadata from the
                        client (checksum, type, era, title, filename,
                        pageCount, language, sourcePath). The server forces
                        ownerId + the deterministic documentId. The client
                        cannot inject an owner, a documentId, an
                        ingestion/analysis state, or an observation
                        lifecycle.
     5. observed-only — recordObservation / analyze ALWAYS store
                        lifecycleState 'observed'. There is NO op that
                        approves / promotes an observation (§9, §15, §21).
     6. derived-only  — `setClassification` and `analyze` write ONLY the
                        derived documentType / typeConfidence /
                        documentEra / eraConfidence / sourceDate /
                        pageCount + the analysis-status chain + observed
                        observations. Never ownerId, never ingestionStatus,
                        never an approval.
     7. fail-safe     — `analyze` needs an injected pipeline runner; with
                        none wired (the default) it returns
                        PIPELINE_UNAVAILABLE and mutates nothing (§14).
     8. audit         — metadata-only logger.info. NEVER a secret, a
                        token, the observed text, or a provenance detail
                        string.

   op ∈ { 'ingest', 'get', 'list', 'observations', 'recordObservation',
          'setAnalysisStatus', 'setClassification', 'analyze',
          'temporalView', 'driftCheck', 'writingMemory' }.

   Phase 5.x.3 adds 'temporalView' + 'driftCheck' — READ-ONLY. They gather
   the caller's OWN corpus documents + observations and hand them to an
   injected temporal analyzer; they write NOTHING, never move a lifecycle
   state, never create an approval, never modify an approved rule (which
   is a READ-ONLY input). With no analyzer wired they fail safe with
   TEMPORAL_UNAVAILABLE.

   Phase 5.x.4 adds 'writingMemory' — READ-ONLY. Gathers the caller's OWN
   corpus, hands it to an injected writing-memory builder, returns the
   evidence-backed WritingMemoryReport. Entries are ONLY observed /
   candidate — NEVER approved; the server strips anything else before it
   returns. Fails safe with WRITING_MEMORY_UNAVAILABLE.

   HARD SAFETY: nothing here touches V1 Petty Cash, generateNor(),
   numbering, organizational knowledge, or the feature flag. No OpenAI
   call. No production corpus mutation until deployed. STAGED — NOT wired
   into functions/index.js (§20).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { CORPUS_STORE_ERRORS, corpusFailure, corpusSuccess } = require('./corpusContract');
const corpusStore = require('./corpusStore');

const OPS = new Set([
  'ingest', 'get', 'list', 'observations', 'recordObservation', 'setAnalysisStatus', 'setClassification', 'analyze',
  // Phase 5.x.3 — READ-ONLY temporal interpretation
  'temporalView', 'driftCheck',
  // Phase 5.x.4 — READ-ONLY organizational writing memory
  'writingMemory',
]);

/* ── the analysis pipeline runner (INJECTED) ──
   `analyze` delegates to this. Its production wiring — fetch the original
   bytes from Storage via sourceFileId, run the pure ESM pipeline
   (src/intelligence/corpus/pipeline/analysis-pipeline.js), return its
   PipelineResult — is a Phase 5.x.2 DEPLOY-time step (needs `mammoth` in
   functions/package.json + Storage read). Until then it is null and
   `analyze` fails safe with PIPELINE_UNAVAILABLE (§14).
   scripts/intelligence-corpus-ingestion-check.cjs injects a fake to
   exercise the write path. */
let _analyzePipeline = null;
function __setAnalyzePipelineForTest(fn) { _analyzePipeline = typeof fn === 'function' ? fn : null; }

/* ── the temporal analyzer (INJECTED) — Phase 5.x.3 ──
   `temporalView` / `driftCheck` gather the CALLER'S OWN corpus documents
   + observations server-side and hand them to this runner
   (src/intelligence/corpus/temporal/convention-temporal-analyzer.js
   #analyzeConventionTemporal). It is a PURE, READ-ONLY analysis — no
   write, no lifecycle move, no approval, no model. Wiring it in is a
   Phase 5.x.3 DEPLOY-time step; until then it is null and these ops fail
   safe with TEMPORAL_UNAVAILABLE (§15). The client cannot supply the
   corpus, an owner, or a pre-computed view — only the temporal `config`
   and a READ-ONLY `approvedRules` list, which are sanitised. */
let _temporalAnalyzer = null;
function __setTemporalAnalyzerForTest(fn) { _temporalAnalyzer = typeof fn === 'function' ? fn : null; }

/* ── the writing-memory builder (INJECTED) — Phase 5.x.4 ──
   `writingMemory` gathers the CALLER'S OWN corpus and hands it to this
   runner (src/intelligence/corpus/writing-memory/writing-memory-builder.js
   #buildWritingMemory). PURE, READ-ONLY, DETERMINISTIC — no write, no
   lifecycle move, NO `approved` authority (it only ever produces
   observed / candidate). Wiring it in is a Phase 5.x.4 DEPLOY-time step;
   until then it is null and the op fails safe with
   WRITING_MEMORY_UNAVAILABLE (§22). The client cannot supply the corpus,
   an owner, an authorityState, or approval metadata (§23). */
let _writingMemoryBuilder = null;
function __setWritingMemoryBuilderForTest(fn) { _writingMemoryBuilder = typeof fn === 'function' ? fn : null; }

/** Drop every field of a client-supplied approved rule except the four
 *  this layer reads. NEVER trusts approvedBy / authority / currentness
 *  / owner (§19). */
function sanitizeApprovedRules(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && typeof r === 'object' && r.category && r.key && r.value != null)
    .slice(0, 200)
    .map((r) => ({ category: String(r.category), key: String(r.key), value: String(r.value), ruleId: r.ruleId == null ? null : String(r.ruleId) }));
}

/** Sanitise the client-supplied analysis config — ONLY the temporal
 *  windows / thresholds + the candidate-grouping threshold, nothing else.
 *  authorityState / approval metadata / owner can NEVER be set here. */
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

/** Gather the caller's OWN corpus: every document owned by `uid`, plus
 *  that document's observations. Read-only. */
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

const intelligenceCorpus = onCall({ region: REGION }, async (request) => {
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
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan ingest | get | list | observations | recordObservation | setAnalysisStatus | setClassification | analyze | temporalView | driftCheck | writingMemory.`);
  }

  const uid = auth.uid; // the ONLY source of truth for the actor / owner
  const now = new Date().toISOString();
  let result;
  let event = null;

  try {
    if (op === 'ingest') {
      const seed = data.document && typeof data.document === 'object' ? data.document : null;
      if (!seed) {
        result = corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'ingest: a `document` classification object is required.');
      } else {
        // strip anything the client must not choose
        const {
          ownerId: _o, documentId: _d, tenantId: _t, duplicateOfId: _du,
          ingestionStatus: _is, analysisStatus: _as, ...safe
        } = seed;
        void _o; void _d; void _t; void _du; void _is; void _as;
        result = await corpusStore.ingestDocument(db, { seed: safe, ownerId: uid, now });
        if (result.ok) event = result.data && result.data.duplicate ? 'CORPUS_DOCUMENT_DUPLICATE' : 'CORPUS_DOCUMENT_INGESTED';
      }
    } else if (op === 'list') {
      result = await corpusStore.listByOwner(db, uid);
    } else if (op === 'temporalView' || op === 'driftCheck') {
      // READ-ONLY. Gather ONLY the caller's own corpus, run the temporal
      // analyzer, return the analytical view. No write, no lifecycle
      // move, no approval (§16, §17).
      if (typeof _temporalAnalyzer !== 'function') {
        result = corpusFailure('TEMPORAL_UNAVAILABLE', 'The temporal interpretation layer is not wired in this deployment (§15). It runs client/agent-side; the server read surface is staged.');
      } else {
        const corpus = await gatherOwnerCorpus(uid);
        const cfg = sanitizeTemporalConfig(data.config);
        let approvedRules = sanitizeApprovedRules(data.approvedRules);
        if (op === 'driftCheck') {
          // driftCheck focuses on ONE supplied approved rule
          const one = sanitizeApprovedRules(data.approvedRule ? [data.approvedRule] : []);
          if (!one.length) {
            result = corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'driftCheck: an { category, key, value } `approvedRule` is required.');
          } else {
            approvedRules = one;
          }
        }
        if (!result) {
          let view;
          try {
            view = await _temporalAnalyzer({ ...corpus, approvedRules }, cfg, { at: now });
          } catch (e) {
            view = null;
            logger.error('[intelligence/corpus] temporal analyzer error', { op, actor: uid, error: e && e.message });
          }
          if (!view || typeof view !== 'object') {
            result = corpusFailure('TEMPORAL_FAILED', 'the temporal analyzer produced no usable view.');
          } else if (op === 'driftCheck') {
            result = corpusSuccess({ drift: Array.isArray(view.drift) ? view.drift : [], windows: view.windows, temporalConfigured: view.temporalConfigured });
          } else {
            result = corpusSuccess(view);
          }
          if (result.ok) event = op === 'driftCheck' ? 'CORPUS_DRIFT_CHECKED' : 'CORPUS_TEMPORAL_VIEWED';
        }
      }
    } else if (op === 'writingMemory') {
      // READ-ONLY. Gather ONLY the caller's own corpus, build the writing
      // memory, return it. No write, no lifecycle move, NO `approved`
      // authority (§8, §16, §23).
      if (typeof _writingMemoryBuilder !== 'function') {
        result = corpusFailure('WRITING_MEMORY_UNAVAILABLE', 'The organizational writing memory builder is not wired in this deployment (§22). It runs client/agent-side; the server read surface is staged.');
      } else {
        const corpus = await gatherOwnerCorpus(uid);
        const cfg = sanitizeTemporalConfig(data.config);
        const approvedRules = sanitizeApprovedRules(data.approvedRules);
        let report;
        try {
          report = await _writingMemoryBuilder({ ...corpus, approvedRules }, cfg, { at: now });
        } catch (e) {
          report = null;
          logger.error('[intelligence/corpus] writing-memory builder error', { op, actor: uid, error: e && e.message });
        }
        if (!report || typeof report !== 'object' || !Array.isArray(report.entries)) {
          result = corpusFailure('WRITING_MEMORY_FAILED', 'the writing memory builder produced no usable report.');
        } else {
          // defence in depth — the builder never produces `approved`, but
          // strip anything that is not observed / candidate before it
          // leaves the server (§8, §23).
          const entries = report.entries.filter((e) => e && (e.authorityState === 'observed' || e.authorityState === 'candidate'));
          result = corpusSuccess({ ...report, entries, drift: (report.drift || []).map((d) => ({ ...d, ruleUnchanged: true })) });
          event = 'CORPUS_WRITING_MEMORY_BUILT';
        }
      }
    } else {
      // get | observations | recordObservation | setAnalysisStatus — all
      // need the document head + an owner check first.
      const documentId = String(data.documentId || (data.observation && data.observation.documentId) || '');
      const head = await corpusStore.getDocument(db, documentId);
      if (!head.ok) {
        result = head;
      } else if (head.data.ownerId !== uid) {
        result = corpusFailure(CORPUS_STORE_ERRORS.FORBIDDEN, 'This corpus document belongs to another user.');
      } else if (op === 'get') {
        result = head;
      } else if (op === 'observations') {
        result = await corpusStore.listObservations(db, documentId);
      } else if (op === 'recordObservation') {
        const obs = data.observation && typeof data.observation === 'object' ? data.observation : null;
        if (!obs) {
          result = corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'recordObservation: an `observation` object is required.');
        } else {
          const { ownerId: _o, lifecycleState: _l, approvedBy: _ab, approvedAt: _aa, preferenceRationale: _pr, ...safe } = obs;
          void _o; void _l; void _ab; void _aa; void _pr;
          result = await corpusStore.recordObservation(db, { seed: Object.assign({}, safe, { documentId }), ownerId: uid, now });
          if (result.ok) event = result.data && result.data.merged ? 'CORPUS_OBSERVATION_MERGED' : 'CORPUS_OBSERVATION_RECORDED';
        }
      } else if (op === 'setAnalysisStatus') {
        result = await corpusStore.setAnalysisStatus(db, documentId, { to: String(data.to || ''), actorId: uid, at: now });
        if (result.ok) event = 'CORPUS_ANALYSIS_ADVANCED';
      } else if (op === 'setClassification') {
        // the client MAY supply a derived classification (type / era /
        // sourceDate / pageCount). Every value is re-validated + re-
        // normalised by the store; nothing else on the record can move.
        const c = data.classification && typeof data.classification === 'object' ? data.classification : {};
        result = await corpusStore.setClassification(db, documentId, {
          patch: {
            documentType: c.documentType, typeConfidence: c.typeConfidence,
            documentEra: c.documentEra, eraConfidence: c.eraConfidence,
            sourceDate: c.sourceDate, pageCount: c.pageCount,
          },
          actorId: uid, at: now,
        });
        if (result.ok) event = 'CORPUS_CLASSIFIED';
      } else { // analyze — run the pipeline, then WRITE its result via the
        //         same safe primitives (setClassification + setAnalysisStatus
        //         + recordObservation). Fails safe if no pipeline is wired.
        if (typeof _analyzePipeline !== 'function') {
          result = corpusFailure('PIPELINE_UNAVAILABLE', 'The analysis pipeline is not wired in this deployment (§14). Deterministic analysis runs client/agent-side; server persistence is staged.');
        } else {
          let pr;
          try {
            pr = await _analyzePipeline({ documentId, document: head.data, source: data.source || null });
          } catch (e) {
            pr = { ok: false, error: { code: 'ANALYSIS_THREW', message: e && e.message ? e.message : String(e) } };
          }
          if (!pr || pr.ok !== true) {
            // honest partial — record 'failed' if the pipeline said so
            if (pr && pr.analysisStatus === 'failed') {
              await corpusStore.setAnalysisStatus(db, documentId, { to: 'failed', actorId: uid, at: now });
            }
            result = corpusFailure('ANALYSIS_FAILED', (pr && pr.error && pr.error.message) || 'analysis produced no usable result.');
          } else {
            // 1. classification (server re-validates every field)
            if (pr.classification && typeof pr.classification === 'object') {
              await corpusStore.setClassification(db, documentId, {
                patch: {
                  documentType: pr.classification.documentType, typeConfidence: pr.classification.typeConfidence,
                  documentEra: pr.classification.documentEra, eraConfidence: pr.classification.eraConfidence,
                  sourceDate: pr.classification.sourceDate, pageCount: pr.classification.pageCount,
                },
                actorId: uid, at: now,
              });
            }
            // 2. analysis status — apply the legal step chain
            const path = Array.isArray(pr.statusPath) ? pr.statusPath : [];
            for (const step of path) {
              const s = await corpusStore.setAnalysisStatus(db, documentId, { to: String(step), actorId: uid, at: now });
              if (!s.ok) break;
            }
            // 3. observations — every one forced to 'observed', client
            //    trust fields stripped, documentId pinned
            let recorded = 0;
            let merged = 0;
            for (const o of (Array.isArray(pr.observations) ? pr.observations : [])) {
              if (!o || typeof o !== 'object') continue;
              const { ownerId: _o, lifecycleState: _l, approvedBy: _ab, approvedAt: _aa, preferenceRationale: _pr, ...safe } = o;
              void _o; void _l; void _ab; void _aa; void _pr;
              const rec = await corpusStore.recordObservation(db, { seed: Object.assign({}, safe, { documentId }), ownerId: uid, now });
              if (rec.ok) { recorded += 1; if (rec.data && rec.data.merged) merged += 1; }
            }
            const finalDoc = await corpusStore.getDocument(db, documentId);
            result = corpusSuccess({
              document: finalDoc.ok ? finalDoc.data : head.data,
              analysis: { observationsRecorded: recorded, observationsMerged: merged, statusPath: path, stages: (pr.stages || []).map((st) => ({ stage: st.stage, outcome: st.outcome })) },
            });
            event = 'CORPUS_ANALYZED';
          }
        }
      }
    }
  } catch (err) {
    logger.error('[intelligence/corpus] persistence error', { op, actor: uid, error: err && err.message });
    result = corpusFailure('INTERNAL', 'Gagal memproses Corpus Intelligence.');
  }

  // METADATA ONLY — never a secret, token, credential, the observed text,
  // or a provenance detail string.
  const d = result && result.data && !Array.isArray(result.data) ? result.data : {};
  const doc = d.document || (d.schema === 'corpus-document@1' ? d : null);
  const obs = d.observation || null;
  logger.info('[intelligence/corpus]', {
    op,
    event: result.ok ? event : null,
    actor: uid,
    documentId: (doc && doc.documentId) || (obs && obs.documentId) || data.documentId || null,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    duplicate: d.duplicate === true ? true : null,
    merged: d.merged === true ? true : null,
    ingestionStatus: doc ? doc.ingestionStatus : null,
    analysisStatus: doc ? doc.analysisStatus : null,
    observationLifecycle: obs ? obs.lifecycleState : null,
  });

  return result;
});

module.exports = {
  intelligenceCorpus,
  __setAnalyzePipelineForTest,
  __setTemporalAnalyzerForTest,
  __setWritingMemoryBuilderForTest,
};
