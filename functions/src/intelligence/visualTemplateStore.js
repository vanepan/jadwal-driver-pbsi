'use strict';

/* ============================================================
   functions/src/intelligence/visualTemplateStore.js — Phase 5.x.6

   Server-owned persistence for the authoritative PBSI Visual Template
   System at /intelligence_visual_templates/{templateId} (RTDB rule
   ".write": false — this module, via the Admin SDK, is the ONLY writer;
   effective admins may .read the whole system — it is ORGANIZATION-WIDE,
   not owner-scoped, §23).

   PURE over an injected `db`. No auth here — the callable
   (functions/src/intelligence/intelligenceVisualTemplate.js) authorizes
   the caller (canUseIntelligence) and derives the actor from the verified
   Firebase context.

   ZERO-TRUST AUTHORITY (§11, §21): `proposeFromEvidence` takes a visual
   PATTERN the CALLABLE ITSELF built server-side from the caller's own
   corpus visual observations — never client-supplied template content,
   never a client authority field. The store forces `status: 'proposed'`,
   `createdBy = actorId`, server timestamps, and re-derives
   `authorityState` from `status`.

   Direct sibling of styleGuideStore.js.
   ============================================================ */

const {
  VISUAL_TEMPLATE_ERRORS, visualTemplateSuccess, visualTemplateFailure,
  VISUAL_TEMPLATE_STATUS, isVisualTemplate, makeVisualTemplate,
  makeVisualTemplateProposalFromPattern, markApproved, markRejected, markDeprecated,
  resolveEffectiveTemplate, getVisualTemplateHistory, queryVisualTemplates,
} = require('./visualTemplateContract');

const PATH = 'intelligence_visual_templates';

function isSafeTemplateId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 300) return false;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = id[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function templateRef(db, id) { return db.ref(`${PATH}/${id}`); }

function sanitizeForRtdb(value) {
  if (Array.isArray(value)) return value.map(sanitizeForRtdb);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = sanitizeForRtdb(v);
    }
    return out;
  }
  return value;
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

async function readRaw(ref) {
  const snap = await ref.once('value');
  const val = snap && typeof snap.val === 'function' ? snap.val() : null;
  return val == null ? null : val;
}

/** Restore the full VisualTemplate shape after a read (RTDB drops empty
 *  arrays/objects and rejects undefined). makeVisualTemplate re-normalises
 *  + re-derives authorityState. */
function rehydrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const ev = raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {};
  return makeVisualTemplate(Object.assign({}, raw, {
    regions: asArray(raw.regions),
    sourceDocumentIds: asArray(raw.sourceDocumentIds),
    sourceObservationIds: asArray(raw.sourceObservationIds),
    auditTrail: asArray(raw.auditTrail),
    evidence: Object.assign({}, ev, {
      regionKinds: asArray(ev.regionKinds),
      coordinateSpaces: asArray(ev.coordinateSpaces),
    }),
    pageModel: raw.pageModel && typeof raw.pageModel === 'object' ? Object.assign({}, raw.pageModel, {
      sourceDocumentIds: asArray(raw.pageModel.sourceDocumentIds),
      sourceObservationIds: asArray(raw.pageModel.sourceObservationIds),
    }) : raw.pageModel,
  }));
}

async function getTemplate(db, templateId) {
  if (!isSafeTemplateId(templateId)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'templateId is missing or not an RTDB-safe key.');
  const raw = await readRaw(templateRef(db, templateId));
  if (raw == null) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
  return visualTemplateSuccess(rehydrate(raw));
}

async function listAll(db) {
  const snap = await db.ref(PATH).once('value');
  const out = [];
  if (snap && typeof snap.forEach === 'function') {
    snap.forEach((child) => { const v = child.val(); if (v && typeof v === 'object') out.push(rehydrate(v)); });
  } else if (snap && typeof snap.val === 'function') {
    const all = snap.val() || {};
    for (const k of Object.keys(all)) if (all[k] && typeof all[k] === 'object') out.push(rehydrate(all[k]));
  }
  return out;
}

async function listTemplates(db, filter) {
  const all = await listAll(db);
  return visualTemplateSuccess(queryVisualTemplates(all, filter && typeof filter === 'object' ? filter : {}));
}

/**
 * Get-or-create a `proposed` template from a visual pattern the CALLABLE
 * re-derived server-side from the caller's own corpus (§13, §21).
 */
async function proposeFromEvidence(db, { pattern, actorId, now, supersedesTemplateId } = {}) {
  if (!pattern || typeof pattern !== 'object') {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'a visual pattern is required.');
  }
  const actor = actorId != null ? String(actorId) : null;
  const supersedes = supersedesTemplateId == null ? null : String(supersedesTemplateId);
  let version = 1;

  if (supersedes) {
    if (!isSafeTemplateId(supersedes)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'supersedesTemplateId is not an RTDB-safe key.');
    const oldRaw = await readRaw(templateRef(db, supersedes));
    if (oldRaw == null) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `supersedesTemplateId "${supersedes}" not found.`);
    const old = rehydrate(oldRaw);
    if (old.status !== VISUAL_TEMPLATE_STATUS.APPROVED) {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, 'A superseding proposal may only replace an APPROVED template.');
    }
    if (pattern.documentType !== old.documentType) {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'A superseding proposal must target the SAME slot (scope/documentType).');
    }
    version = (old.templateVersion || 1) + 1;
  }

  const proposal = makeVisualTemplateProposalFromPattern(pattern, {
    at: now || new Date().toISOString(),
    actorId: actor,
    supersedesTemplateId: supersedes,
    version,
  });
  if (!proposal || !isVisualTemplate(proposal)) {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'the visual pattern did not yield a valid Visual Template proposal.');
  }
  if (!isSafeTemplateId(proposal.templateId)) {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'the proposal does not yield an RTDB-safe template id.');
  }

  const existingRaw = await readRaw(templateRef(db, proposal.templateId));
  if (existingRaw != null) {
    const existing = rehydrate(existingRaw);
    if (existing.status === VISUAL_TEMPLATE_STATUS.PROPOSED) return visualTemplateSuccess(existing);
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.TEMPLATE_EXISTS, `A template "${proposal.templateId}" already exists with status "${existing.status}". A changed layout must SUPERSEDE this one.`);
  }

  const clean = sanitizeForRtdb(proposal);
  await templateRef(db, proposal.templateId).set(clean);
  return visualTemplateSuccess(rehydrate(clean));
}

function versionConflict(template, expectedVersion) {
  return typeof expectedVersion === 'number' && expectedVersion !== template.templateVersion;
}

async function approveTemplate(db, templateId, { actorId, rationale, at, expectedVersion, acknowledgeConflict } = {}) {
  if (!isSafeTemplateId(templateId)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'templateId is not an RTDB-safe key.');
  const actor = actorId != null ? String(actorId) : '';
  if (!actor) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.ACTOR_REQUIRED, 'actorId is required.');
  const raw = await readRaw(templateRef(db, templateId));
  if (raw == null) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
  const template = rehydrate(raw);
  if (versionConflict(template, expectedVersion)) {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${template.templateVersion}.`);
  }

  // §21 — an unresolved slot conflict fails closed.
  const all = await listAll(db);
  const competingApproved = all.filter((t) =>
    t.templateId !== template.templateId
    && t.status === VISUAL_TEMPLATE_STATUS.APPROVED
    && !t.supersededByTemplateId
    && t.scope === template.scope && t.documentType === template.documentType
    && t.variant !== template.variant);
  const supersedesOne = template.supersedesTemplateId && competingApproved.some((t) => t.templateId === template.supersedesTemplateId);
  if (competingApproved.length && !supersedesOne && acknowledgeConflict !== true) {
    return visualTemplateFailure(
      VISUAL_TEMPLATE_ERRORS.CONFLICT_UNRESOLVED,
      `Approving would create a competing approved template for this slot (${competingApproved.map((t) => t.templateId).join(', ')}). Supersede the incumbent, or pass acknowledgeConflict.`,
    );
  }

  const { next, error } = markApproved(template, { actorId: actor, rationale, at: at || new Date().toISOString() });
  if (error) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS[error] || VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, `approve refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  if (!isVisualTemplate(rehydrate(clean))) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'the approved record would be invalid.');
  await templateRef(db, next.templateId).set(clean);

  // §12 — approving a superseding proposal auto-deprecates its predecessor.
  if (next.supersedesTemplateId && isSafeTemplateId(next.supersedesTemplateId)) {
    const oldRaw = await readRaw(templateRef(db, next.supersedesTemplateId));
    if (oldRaw != null) {
      const old = rehydrate(oldRaw);
      if (old.status === VISUAL_TEMPLATE_STATUS.APPROVED) {
        const dep = markDeprecated(old, {
          actorId: actor, at: at || next.approvedAt,
          reason: `Superseded by ${next.templateId}.`,
          supersededByTemplateId: next.templateId,
        });
        if (dep.next) await templateRef(db, dep.next.templateId).set(sanitizeForRtdb(dep.next));
      }
    }
  }

  const finalRaw = await readRaw(templateRef(db, next.templateId));
  return visualTemplateSuccess(rehydrate(finalRaw));
}

async function rejectTemplate(db, templateId, { actorId, reason, at, expectedVersion } = {}) {
  if (!isSafeTemplateId(templateId)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'templateId is not an RTDB-safe key.');
  const actor = actorId != null ? String(actorId) : '';
  if (!actor) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.ACTOR_REQUIRED, 'actorId is required.');
  const raw = await readRaw(templateRef(db, templateId));
  if (raw == null) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
  const template = rehydrate(raw);
  if (versionConflict(template, expectedVersion)) {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${template.templateVersion}.`);
  }
  const { next, error } = markRejected(template, { actorId: actor, reason, at: at || new Date().toISOString() });
  if (error) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS[error] || VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, `reject refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  await templateRef(db, next.templateId).set(clean);
  return visualTemplateSuccess(rehydrate(clean));
}

async function deprecateTemplate(db, templateId, { actorId, reason, at, expectedVersion, supersededByTemplateId } = {}) {
  if (!isSafeTemplateId(templateId)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'templateId is not an RTDB-safe key.');
  const actor = actorId != null ? String(actorId) : '';
  if (!actor) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.ACTOR_REQUIRED, 'actorId is required.');
  const raw = await readRaw(templateRef(db, templateId));
  if (raw == null) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
  const template = rehydrate(raw);
  if (versionConflict(template, expectedVersion)) {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${template.templateVersion}.`);
  }
  const { next, error } = markDeprecated(template, {
    actorId: actor, reason, at: at || new Date().toISOString(),
    supersededByTemplateId: supersededByTemplateId == null ? null : String(supersededByTemplateId),
  });
  if (error) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS[error] || VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, `deprecate refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  await templateRef(db, next.templateId).set(clean);
  return visualTemplateSuccess(rehydrate(clean));
}

async function resolveTemplate(db, target) {
  const all = await listAll(db);
  return visualTemplateSuccess(resolveEffectiveTemplate(all, target && typeof target === 'object' ? target : {}));
}

async function getHistory(db, templateId) {
  if (!isSafeTemplateId(templateId)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'templateId is not an RTDB-safe key.');
  const all = await listAll(db);
  return visualTemplateSuccess(getVisualTemplateHistory(all, String(templateId)));
}

module.exports = {
  PATH,
  isSafeTemplateId,
  sanitizeForRtdb,
  rehydrate,
  getTemplate,
  listTemplates,
  proposeFromEvidence,
  approveTemplate,
  rejectTemplate,
  deprecateTemplate,
  resolveTemplate,
  getHistory,
};
