'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceNorGeneration.js — Phase 6

   The server-side, server-AUTHORITATIVE producer of the CONTROLLED
   BOUNDARY between Certified Retrieval and NOR Generation — ONE read-only
   gateway that:
     1. gathers ALL approved Style Guide rules + ALL approved Visual
        Templates (organization-wide) from their stores,
     2. runs the PURE Phase 5.x.7 `retrieveNorContext` composer,
     3. runs the PURE Phase 6 `buildGenerationContext` gate + projection,
   and returns ONE `intelligence-generation-context@1` object telling a
   downstream NOR generator whether — and how — it may proceed.

   HTTPS callable v2, region asia-southeast1, NO secrets. Sibling of
   intelligenceRetrieval.js / intelligenceStyleGuide.js — same architecture.

   ── STAGED, NOT LIVE ──
   Per Phase 6 §45 this file is authored but is NOT wired into
   functions/index.js and NOT deployed. There is NO new RTDB node — it
   reads the existing intelligence_style_guide / intelligence_visual_templates
   nodes via their stores. scripts/intelligence-nor-generation-check.cjs
   exercises this file via .run().

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token): the SAME
                        effective-admin boundary as every other Intelligence
                        callable. NO new permission id (§29).
     3. compose       — gather → retrieveNorContext → buildGenerationContext.
                        A store that cannot be queried ⇒ that domain is
                        `unavailable` ⇒ the gate BLOCKS (§10). Never `[]`.
     4. server owns    — documentType (validated), scope ('organization',
                        forced), actor (auth.uid), the certification result,
                        the gate outcome, the provenance snapshot. The
                        client controls ONLY documentType / categories /
                        slots / regionKinds / includeSupportingEvidence and
                        CANNOT claim certification, authorityState, approval
                        metadata, a rule id, or a database path (§28, §29).
     5. read-only     — mutates NOTHING. The DB is byte-identical after a
                        call.
     6. audit         — metadata-only logger.info. NEVER a secret, a token,
                        the rationale text, or document body content (§42).

   op ∈ { 'generationContext' }.

   HARD SAFETY: nothing here generates NOR text, assembles a draft,
   persists a draft, publishes, numbers, approves, resolves a conflict,
   touches the NOR Generator / NOR Draft / NOR Registry / Petty Cash / V1 /
   the Style Guide or Visual Template writers / organizational knowledge /
   the feature flag. No OpenAI call. No model. No RAG. No external HTTP.
   STAGED — NOT wired into functions/index.js (§45).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { retrieveNorContext, isRetrievalDocumentType } = require('./norRetrievalContract');
const { buildGenerationContext, GENERATION_MODE } = require('./generationContextContract');
const styleGuideStore = require('./styleGuideStore');
const visualTemplateStore = require('./visualTemplateStore');

const OPS = new Set(['generationContext']);

/** Sanitise the client request — ONLY the fields a downstream caller may
 *  legitimately choose. scope is NEVER read from the client (§28/§29). */
function sanitizeRequest(data) {
  const d = data && typeof data === 'object' ? data : {};
  const out = {
    documentType: typeof d.documentType === 'string' ? d.documentType : '',
    includeSupportingEvidence: d.includeSupportingEvidence !== false,
  };
  if (Array.isArray(d.categories)) out.categories = d.categories.map(String).slice(0, 64);
  else if (typeof d.categories === 'string') out.categories = d.categories;
  if (Array.isArray(d.slots)) {
    out.slots = d.slots
      .filter((x) => x && typeof x === 'object')
      .slice(0, 128)
      .map((x) => ({ category: String(x.category || ''), key: String(x.key || '') }));
  }
  if (Array.isArray(d.regionKinds)) out.regionKinds = d.regionKinds.map(String).slice(0, 32);
  else if (typeof d.regionKinds === 'string') out.regionKinds = d.regionKinds;
  return out;
}

const intelligenceNorGeneration = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }
  const gate = canUseIntelligence(auth.token);
  if (!gate.ok) {
    throw new HttpsError('permission-denied', gate.reason || 'Tidak berhak menggunakan Sarpras Intelligence.');
  }

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const op = String(data.op || 'generationContext');
  if (!OPS.has(op)) {
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan generationContext.`);
  }

  const uid = auth.uid;
  const now = new Date().toISOString();
  const req = sanitizeRequest(data);
  if (!isRetrievalDocumentType(req.documentType)) {
    throw new HttpsError('invalid-argument', 'documentType wajib diisi dengan salah satu dari: NOR | NOTA_ORGANISASI | MEMORANDUM | LEGACY | UNKNOWN.');
  }

  // ── gather (organization-wide, READ-ONLY) ──
  // A store that cannot be queried ⇒ pass `null` for that domain ⇒ that
  // domain resolves to `unavailable` ⇒ the gate BLOCKS. Never silently `[]`.
  let styleRules = null;
  let visualTemplates = null;
  try {
    const sgRes = await styleGuideStore.listRules(db, {});
    styleRules = sgRes && sgRes.ok && Array.isArray(sgRes.data) ? sgRes.data : null;
  } catch (e) {
    styleRules = null;
    logger.error('[intelligence/nor-generation] style guide read error', { actor: uid, error: e && e.message });
  }
  try {
    const vtRes = await visualTemplateStore.listTemplates(db, {});
    visualTemplates = vtRes && vtRes.ok && Array.isArray(vtRes.data) ? vtRes.data : null;
  } catch (e) {
    visualTemplates = null;
    logger.error('[intelligence/nor-generation] visual template read error', { actor: uid, error: e && e.message });
  }

  const retrievalContext = retrieveNorContext({ styleRules, visualTemplates }, req, { at: now });
  const generationContext = buildGenerationContext(retrievalContext, {
    mode: GENERATION_MODE.INTELLIGENCE, at: now,
  });

  // METADATA ONLY — never a secret, token, credential, the rationale text,
  // or document body content (§42).
  logger.info('[intelligence/nor-generation]', {
    op,
    actor: uid,
    documentType: req.documentType,
    certification: generationContext.retrieval.certification,
    styleGuide: generationContext.retrieval.styleGuideStatus,
    visualTemplate: generationContext.retrieval.visualTemplateStatus,
    gate: generationContext.gate,
    status: generationContext.status,
    blocked: generationContext.blocked,
    certifiedStyleRuleCount: generationContext.style.certifiedRuleIds.length,
    styleFallbackCount: generationContext.style.fallbacks.length,
    visualSource: generationContext.visual.source,
    styleConflicts: generationContext.conflicts.styleGuide.length,
    visualConflicts: generationContext.conflicts.visualTemplate.length,
  });

  // The callable returns the { ok, data, error } envelope shape the other
  // Intelligence callables use — the boundary never fails as a domain
  // error, it always produces a generation context (with an honest gate
  // outcome, `blocked` when it must not proceed).
  return Object.freeze({ ok: true, data: generationContext, error: null });
});

module.exports = { intelligenceNorGeneration };
