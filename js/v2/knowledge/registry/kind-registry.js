/* ============================================================
   KIND-REGISTRY.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: make `kind` (what SHAPE of knowledge an item carries — a piece of
   vocabulary, a structural pattern, a business rule, …) a registered
   vocabulary value, for the same reason domainType is registered (Decision
   1) — so no core module ever hardcodes "if kind === 'vocabulary'".

   RESPONSIBILITY: register/list/check `kind` ids and their labels.

   DEPENDENCIES: none.

   NON-GOALS: no interpretation of what a payload shaped like each kind
   looks like — that is for Phase 4+ connector/consumer code to define.

   FUTURE EVOLUTION: Phase 4+ may add a payload-shape typedef per kind once
   real connectors exist; the registry itself does not need to change.
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string}>} */
const _kinds = new Map();

export function registerKind(id, label) {
  if (typeof id !== 'string' || !id) throw new Error('registerKind: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerKind: label must be a non-empty string');
  _kinds.set(id, Object.freeze({ id, label }));
}

export function hasKind(id) {
  return _kinds.has(id);
}

export function getKind(id) {
  return _kinds.get(id) || null;
}

export function listKinds() {
  return Object.freeze([..._kinds.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetKindRegistry() {
  _kinds.clear();
  bootstrap();
}

/* ── bootstrap: the kinds named in the architecture doc's Decision 1 ─────── */
function bootstrap() {
  registerKind('vocabulary', 'Vocabulary');
  registerKind('terminology', 'Terminology');
  registerKind('structure', 'Structure');
  registerKind('writing_style', 'Writing Style');
  registerKind('sentence_pattern', 'Sentence Pattern');
  registerKind('paragraph_pattern', 'Paragraph Pattern');
  registerKind('template_pattern', 'Template Pattern');
  registerKind('relationship', 'Relationship');
  registerKind('rule', 'Rule');
  registerKind('correction', 'Correction');
  registerKind('statistic', 'Statistic');
  registerKind('policy', 'Policy');
  // V2.0.12.5 — Organizational Knowledge Profiles (recipients, signatories,
  // etc. are organizational EXPERIENCE, never configuration — see
  // profiles/profile-engine.js's header for the Config/Knowledge split).
  registerKind('recipient', 'Recipient');
  registerKind('signatory', 'Signatory');
  registerKind('cc', 'CC');
  registerKind('approval_chain', 'Approval Chain');
  registerKind('attachment', 'Attachment Pattern');
  registerKind('department', 'Department');
  registerKind('document_category', 'Document Category');
  // V2.1 — Knowledge Acquisition Operational Readiness: generic fallback
  // for manual-entry facts (connectors/manual-file-connector.js) that
  // don't match a more specific existing kind above.
  registerKind('document_fact', 'Document Fact');
}

bootstrap();
