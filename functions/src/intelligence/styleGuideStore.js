'use strict';

/* ============================================================
   functions/src/intelligence/styleGuideStore.js — Phase 5.x.5

   Server-owned persistence for the authoritative PBSI NOR Style Guide at
   /intelligence_style_guide/{ruleId} (RTDB rule ".write": false — this
   module, via the Admin SDK, is the ONLY writer; effective admins may
   .read the whole guide — it is ORGANIZATION-WIDE, not owner-scoped, §16).

   PURE over an injected `db` (an Admin SDK database handle, or a fake in a
   test). No auth here — the callable
   (functions/src/intelligence/intelligenceStyleGuide.js) authorizes the
   caller (canUseIntelligence) and derives the actor from the verified
   Firebase context.

   ZERO-TRUST AUTHORITY (§9, §22): `proposeFromMemory` takes a Writing
   Memory ENTRY the CALLABLE ITSELF built server-side from the caller's own
   corpus — never client-supplied rule content, never a client authority
   field. The store forces `status: 'proposed'`, `createdBy = actorId`,
   server timestamps, and re-derives `authorityState` from `status`.

   LIFECYCLE (styleGuideContract.js is the one authority):
     proposeFromMemory → proposed (v1, get-or-create by deterministic id)
     approve           → approved  — human, non-empty rationale, actor;
                          FAILS CLOSED on an unresolved slot conflict (§14, §21);
                          a superseding proposal auto-deprecates its predecessor (§15)
     reject            → rejected  — human, reason preserved
     deprecate         → deprecated — human, reason preserved; RETAINED + queryable
     approved/rejected/deprecated → immutable (a changed value is a NEW proposal)

   Mirrors norRegistryStore.js / corpusStore.js byte-for-behaviour where it
   can (safe key guard, sanitizeForRtdb, rehydrate, full-node scan).
   ============================================================ */

const {
  STYLE_GUIDE_ERRORS, styleGuideSuccess, styleGuideFailure,
  STYLE_RULE_STATUS, isStyleRule, makeStyleRule,
  makeStyleGuideProposalFromMemory, markApproved, markRejected, markDeprecated,
  resolveEffectiveRule, getSupersessionChain, queryStyleGuide,
} = require('./styleGuideContract');

const PATH = 'intelligence_style_guide';

/** Same rule as norDraftStore.isSafeDraftId. */
function isSafeRuleId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 300) return false;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = id[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function ruleRef(db, id) { return db.ref(`${PATH}/${id}`); }

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

/** Restore the full StyleRule shape after a read (RTDB drops empty
 *  arrays/objects and rejects undefined). makeStyleRule re-normalises +
 *  re-derives authorityState. */
function rehydrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return makeStyleRule(Object.assign({}, raw, {
    sourceMemoryIds: asArray(raw.sourceMemoryIds),
    sourceObservationIds: asArray(raw.sourceObservationIds),
    sourceDocumentIds: asArray(raw.sourceDocumentIds),
    auditTrail: asArray(raw.auditTrail),
    evidence: raw.evidence && typeof raw.evidence === 'object' ? Object.assign({}, raw.evidence, {
      documentTypeDistribution: raw.evidence.documentTypeDistribution && typeof raw.evidence.documentTypeDistribution === 'object'
        ? raw.evidence.documentTypeDistribution : {},
      pageNumbers: asArray(raw.evidence.pageNumbers),
      extractionMethods: asArray(raw.evidence.extractionMethods),
    }) : {},
  }));
}

/** Read one rule (rehydrated). */
async function getRule(db, ruleId) {
  if (!isSafeRuleId(ruleId)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'ruleId is missing or not an RTDB-safe key.');
  const raw = await readRaw(ruleRef(db, ruleId));
  if (raw == null) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
  return styleGuideSuccess(rehydrate(raw));
}

/** Read the whole guide (organization-wide), then apply the pure filter. */
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

async function listRules(db, filter) {
  const all = await listAll(db);
  return styleGuideSuccess(queryStyleGuide(all, filter && typeof filter === 'object' ? filter : {}));
}

/**
 * Get-or-create a `proposed` rule from a Writing Memory entry. `memory` is
 * the entry the CALLABLE re-derived server-side from the caller's own
 * corpus — this store never sees client rule content (§13, §22).
 */
async function proposeFromMemory(db, { memory, actorId, now, supersedesRuleId } = {}) {
  if (!memory || typeof memory !== 'object') {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'a Writing Memory entry is required.');
  }
  const actor = actorId != null ? String(actorId) : null;
  const supersedes = supersedesRuleId == null ? null : String(supersedesRuleId);
  let version = 1;

  if (supersedes) {
    if (!isSafeRuleId(supersedes)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'supersedesRuleId is not an RTDB-safe key.');
    const oldRaw = await readRaw(ruleRef(db, supersedes));
    if (oldRaw == null) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `supersedesRuleId "${supersedes}" not found.`);
    const old = rehydrate(oldRaw);
    if (old.status !== STYLE_RULE_STATUS.APPROVED) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, 'A superseding proposal may only replace an APPROVED rule.');
    }
    if (memory.category !== old.category || String(memory.key || '') !== String(old.key || '') || memory.documentType !== old.documentType) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'A superseding proposal must target the SAME slot (scope/category/key/documentType).');
    }
    version = (old.version || 1) + 1;
  }

  const proposal = makeStyleGuideProposalFromMemory(memory, {
    at: now || new Date().toISOString(),
    actorId: actor,
    supersedesRuleId: supersedes,
    version,
  });
  if (!proposal || !isStyleRule(proposal)) {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'the Writing Memory entry did not yield a valid Style Guide proposal (needs a language category, verbatim value, and >= 1 evidence id).');
  }
  if (!isSafeRuleId(proposal.ruleId)) {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'the proposal does not yield an RTDB-safe rule id.');
  }

  const existingRaw = await readRaw(ruleRef(db, proposal.ruleId));
  if (existingRaw != null) {
    const existing = rehydrate(existingRaw);
    if (existing.status === STYLE_RULE_STATUS.PROPOSED) return styleGuideSuccess(existing); // get-or-create — idempotent
    return styleGuideFailure(STYLE_GUIDE_ERRORS.RULE_EXISTS, `A rule "${proposal.ruleId}" already exists with status "${existing.status}". A changed value must SUPERSEDE this one.`);
  }

  const clean = sanitizeForRtdb(proposal);
  await ruleRef(db, proposal.ruleId).set(clean);
  return styleGuideSuccess(rehydrate(clean));
}

function versionConflict(rule, expectedVersion) {
  return typeof expectedVersion === 'number' && expectedVersion !== rule.version;
}

function effectiveValueOf(r) {
  return r.normalizedValue == null
    ? String(r.value == null ? '' : r.value).toLowerCase().replace(/\s+/g, ' ').trim()
    : r.normalizedValue;
}

/** proposed → approved (human). Non-empty rationale + server actor required. */
async function approveRule(db, ruleId, { actorId, rationale, at, expectedVersion, acknowledgeConflict } = {}) {
  if (!isSafeRuleId(ruleId)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'ruleId is not an RTDB-safe key.');
  const actor = actorId != null ? String(actorId) : '';
  if (!actor) return styleGuideFailure(STYLE_GUIDE_ERRORS.ACTOR_REQUIRED, 'actorId is required.');
  const raw = await readRaw(ruleRef(db, ruleId));
  if (raw == null) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
  const rule = rehydrate(raw);
  if (versionConflict(rule, expectedVersion)) {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${rule.version}.`);
  }

  // §14, §21 — an unresolved slot conflict fails closed.
  const all = await listAll(db);
  const competingApproved = all.filter((r) =>
    r.ruleId !== rule.ruleId
    && r.status === STYLE_RULE_STATUS.APPROVED
    && !r.supersededByRuleId
    && r.scope === rule.scope && r.category === rule.category && r.key === rule.key && r.documentType === rule.documentType
    && effectiveValueOf(r) !== effectiveValueOf(rule));
  const supersedesOne = rule.supersedesRuleId && competingApproved.some((r) => r.ruleId === rule.supersedesRuleId);
  if (competingApproved.length && !supersedesOne && acknowledgeConflict !== true) {
    return styleGuideFailure(
      STYLE_GUIDE_ERRORS.CONFLICT_UNRESOLVED,
      `Approving would create a competing approved rule for this slot (${competingApproved.map((r) => r.ruleId).join(', ')}). Supersede the incumbent, or pass acknowledgeConflict.`,
    );
  }

  const { next, error } = markApproved(rule, { actorId: actor, rationale, at: at || new Date().toISOString() });
  if (error) return styleGuideFailure(STYLE_GUIDE_ERRORS[error] || STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, `approve refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  if (!isStyleRule(rehydrate(clean))) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'the approved record would be invalid.');
  await ruleRef(db, next.ruleId).set(clean);

  // §15 — approving a superseding proposal auto-deprecates its predecessor.
  if (next.supersedesRuleId && isSafeRuleId(next.supersedesRuleId)) {
    const oldRaw = await readRaw(ruleRef(db, next.supersedesRuleId));
    if (oldRaw != null) {
      const old = rehydrate(oldRaw);
      if (old.status === STYLE_RULE_STATUS.APPROVED) {
        const dep = markDeprecated(old, {
          actorId: actor, at: at || next.approvedAt,
          reason: `Superseded by ${next.ruleId}.`,
          supersededByRuleId: next.ruleId,
        });
        if (dep.next) await ruleRef(db, dep.next.ruleId).set(sanitizeForRtdb(dep.next));
      }
    }
  }

  const finalRaw = await readRaw(ruleRef(db, next.ruleId));
  return styleGuideSuccess(rehydrate(finalRaw));
}

/** proposed → rejected (human). Reason preserved. */
async function rejectRule(db, ruleId, { actorId, reason, at, expectedVersion } = {}) {
  if (!isSafeRuleId(ruleId)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'ruleId is not an RTDB-safe key.');
  const actor = actorId != null ? String(actorId) : '';
  if (!actor) return styleGuideFailure(STYLE_GUIDE_ERRORS.ACTOR_REQUIRED, 'actorId is required.');
  const raw = await readRaw(ruleRef(db, ruleId));
  if (raw == null) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
  const rule = rehydrate(raw);
  if (versionConflict(rule, expectedVersion)) {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${rule.version}.`);
  }
  const { next, error } = markRejected(rule, { actorId: actor, reason, at: at || new Date().toISOString() });
  if (error) return styleGuideFailure(STYLE_GUIDE_ERRORS[error] || STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, `reject refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  await ruleRef(db, next.ruleId).set(clean);
  return styleGuideSuccess(rehydrate(clean));
}

/** approved → deprecated (human). Retained + queryable. */
async function deprecateRule(db, ruleId, { actorId, reason, at, expectedVersion, supersededByRuleId } = {}) {
  if (!isSafeRuleId(ruleId)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'ruleId is not an RTDB-safe key.');
  const actor = actorId != null ? String(actorId) : '';
  if (!actor) return styleGuideFailure(STYLE_GUIDE_ERRORS.ACTOR_REQUIRED, 'actorId is required.');
  const raw = await readRaw(ruleRef(db, ruleId));
  if (raw == null) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
  const rule = rehydrate(raw);
  if (versionConflict(rule, expectedVersion)) {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${rule.version}.`);
  }
  const { next, error } = markDeprecated(rule, {
    actorId: actor, reason, at: at || new Date().toISOString(),
    supersededByRuleId: supersededByRuleId == null ? null : String(supersededByRuleId),
  });
  if (error) return styleGuideFailure(STYLE_GUIDE_ERRORS[error] || STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, `deprecate refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  await ruleRef(db, next.ruleId).set(clean);
  return styleGuideSuccess(rehydrate(clean));
}

/** Deterministic effective-rule resolution for a slot. */
async function resolveRule(db, target) {
  const all = await listAll(db);
  return styleGuideSuccess(resolveEffectiveRule(all, target && typeof target === 'object' ? target : {}));
}

/** The supersession chain for a rule id. */
async function getHistory(db, ruleId) {
  if (!isSafeRuleId(ruleId)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'ruleId is not an RTDB-safe key.');
  const all = await listAll(db);
  return styleGuideSuccess(getSupersessionChain(all, String(ruleId)));
}

module.exports = {
  PATH,
  isSafeRuleId,
  sanitizeForRtdb,
  rehydrate,
  getRule,
  listRules,
  proposeFromMemory,
  approveRule,
  rejectRule,
  deprecateRule,
  resolveRule,
  getHistory,
};
