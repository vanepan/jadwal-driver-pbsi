'use strict';

/* ============================================================
   functions/src/intelligence/intelligenceRetrieval.js — Phase 5.x.7

   The server-side boundary for CERTIFIED RETRIEVAL — ONE read-only
   gateway that composes the approved Phase 5.x.5 Style Guide rules + the
   approved Phase 5.x.6 Visual Template into ONE structured, deterministic
   context a FUTURE NOR generator will consume. HTTPS callable v2, region
   asia-southeast1, NO secrets. Sibling of intelligenceStyleGuide.js /
   intelligenceVisualTemplate.js — same architecture.

   ── STAGED, NOT LIVE ──
   Per Phase 5.x.7 §29/§35 this file is authored but is NOT wired into
   functions/index.js and NOT deployed. There is NO new RTDB node — it
   reads the existing intelligence_style_guide / intelligence_visual_templates
   nodes via their stores. scripts/intelligence-retrieval-check.cjs
   exercises this file via .run().

   Its only jobs:
     1. authenticate  — request.auth.uid required
     2. authorize     — canUseIntelligence(auth.token): the SAME
                        effective-admin boundary as every other
                        Intelligence callable. NO new permission id.
     3. compose       — gather ALL Style Guide rules + ALL Visual Templates
                        (organization-wide) from their stores, hand them to
                        the PURE retrieveNorContext composer. A store that
                        cannot be queried ⇒ that domain is `unavailable`
                        (never silently `[]` — §22, §23).
     4. read-only     — mutates NOTHING. The DB is byte-identical after a
                        call (§19).
     5. client trust  — the client controls ONLY documentType / categories
                        / slots / regionKinds / includeSupportingEvidence.
                        It CANNOT control scope (server-forced
                        'organization'), authority state, approval metadata,
                        source ownership, or any database path (§20, §21).
     6. audit         — metadata-only logger.info. NEVER a secret, a token,
                        the rationale text, or document body content.

   op ∈ { 'norContext' }.

   HARD SAFETY: nothing here generates NOR, modifies a NOR draft, publishes,
   touches the NOR Generator / NOR Registry / Petty Cash / V1 / the Style
   Guide or Visual Template writers / organizational knowledge. No OpenAI
   call. No model. No RAG. No external HTTP. STAGED — NOT wired into
   functions/index.js (§29).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { db } = require('../config/admin');
const { canUseIntelligence } = require('./serverPermissions');
const { retrieveNorContext, isRetrievalDocumentType } = require('./norRetrievalContract');
const styleGuideStore = require('./styleGuideStore');
const visualTemplateStore = require('./visualTemplateStore');

const OPS = new Set(['norContext']);

/** Sanitise the client request — ONLY the fields a downstream caller may
 *  legitimately choose. scope is NEVER read from the client (§20/§21). */
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

const intelligenceRetrieval = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }
  const gate = canUseIntelligence(auth.token);
  if (!gate.ok) {
    throw new HttpsError('permission-denied', gate.reason || 'Tidak berhak menggunakan Sarpras Intelligence.');
  }

  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const op = String(data.op || 'norContext');
  if (!OPS.has(op)) {
    throw new HttpsError('invalid-argument', `op tidak dikenal: "${op}". Gunakan norContext.`);
  }

  const uid = auth.uid;
  const now = new Date().toISOString();
  const req = sanitizeRequest(data);
  if (!isRetrievalDocumentType(req.documentType)) {
    throw new HttpsError('invalid-argument', 'documentType wajib diisi dengan salah satu dari: NOR | NOTA_ORGANISASI | MEMORANDUM | LEGACY | UNKNOWN.');
  }

  // ── gather (organization-wide, READ-ONLY) ──
  // A store that cannot be queried ⇒ pass `null` for that domain ⇒ that
  // domain resolves to `unavailable` (never silently `[]` — §22, §23).
  let styleRules = null;
  let visualTemplates = null;
  try {
    const sgRes = await styleGuideStore.listRules(db, {});
    styleRules = sgRes && sgRes.ok && Array.isArray(sgRes.data) ? sgRes.data : null;
  } catch (e) {
    styleRules = null;
    logger.error('[intelligence/retrieval] style guide read error', { actor: uid, error: e && e.message });
  }
  try {
    const vtRes = await visualTemplateStore.listTemplates(db, {});
    visualTemplates = vtRes && vtRes.ok && Array.isArray(vtRes.data) ? vtRes.data : null;
  } catch (e) {
    visualTemplates = null;
    logger.error('[intelligence/retrieval] visual template read error', { actor: uid, error: e && e.message });
  }

  const context = retrieveNorContext({ styleRules, visualTemplates }, req, { at: now });

  // METADATA ONLY — never a secret, token, credential, the rationale text,
  // or document body content.
  logger.info('[intelligence/retrieval]', {
    op,
    actor: uid,
    documentType: req.documentType,
    certification: context.certification.status,
    styleGuide: context.certification.styleGuide.status,
    visualTemplate: context.certification.visualTemplate.status,
    styleRuleCount: context.provenance.approvedStyleRuleCount,
    visualTemplateCount: context.provenance.approvedVisualTemplateCount,
    styleGuideConflicts: context.conflicts.styleGuide.length,
    visualTemplateConflicts: context.conflicts.visualTemplate.length,
  });

  // the callable returns the { ok, data, error } envelope shape the other
  // Intelligence callables use — retrieval never fails as a domain error,
  // it always produces a context (with an honest certification status).
  return Object.freeze({ ok: true, data: context, error: null });
});

module.exports = { intelligenceRetrieval };
