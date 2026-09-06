/* ============================================================
   VISUAL-TEMPLATE-STORE.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: THE single access point to the authoritative PBSI Visual
   Template System — propose (from aggregated visual evidence only),
   approve (human + rationale), reject, deprecate, resolve, read. The
   actual persistence is a pluggable backend (Null by default = inert;
   Memory for tests / DISABLED mode; the staged server callable later).
   Mirrors src/intelligence/corpus/style-guide/style-guide-store.js
   exactly: a backend registry + process-wide events + pure delegation.

   RESPONSIBILITY: backend registry (register / setActive / reset /
   useCallableVisualTemplateBackend), VISUAL_TEMPLATE_EVENT + listeners,
   and the eight delegating facade methods.

   NON-GOALS: does not itself persist, aggregate, resolve, or RENDER
   anything (§27). Does NOT connect to any renderer, the NOR generator, the
   NOR Registry, Petty Cash, the Style Guide, the feature flag, or any
   OpenAI surface.
   ============================================================ */

'use strict';

import {
  VISUAL_TEMPLATE_ERRORS, visualTemplateFailure, isVisualTemplateBackend,
} from './contracts/visual-template-store-contract.js';
import { nullVisualTemplateBackend, NULL_VISUAL_TEMPLATE_BACKEND_ID } from './backends/null-visual-template-backend.js';
import { createCallableVisualTemplateBackend, CALLABLE_VISUAL_TEMPLATE_BACKEND_ID } from './backends/callable-visual-template-backend.js';

/* ── re-exports so this facade is a complete import surface ───────────── */
export {
  VISUAL_TEMPLATE_STORE_SCHEMA, VISUAL_TEMPLATE_ERRORS, visualTemplateSuccess, visualTemplateFailure,
  VISUAL_TEMPLATE_STORE_CONTRACT, isVisualTemplateBackend,
} from './contracts/visual-template-store-contract.js';
export { NULL_VISUAL_TEMPLATE_BACKEND_ID } from './backends/null-visual-template-backend.js';
export {
  memoryVisualTemplateBackend, resetMemoryVisualTemplateBackend, MEMORY_VISUAL_TEMPLATE_BACKEND_ID,
} from './backends/memory-visual-template-backend.js';
export {
  createCallableVisualTemplateBackend, CALLABLE_VISUAL_TEMPLATE_BACKEND_ID,
} from './backends/callable-visual-template-backend.js';

/* ── backend registry — Null is the default and the reset target ─────── */

const _backends = new Map();
let _activeBackendId = null;

export const DEFAULT_VISUAL_TEMPLATE_BACKEND_ID = NULL_VISUAL_TEMPLATE_BACKEND_ID;

export function registerVisualTemplateBackend(backend) {
  if (!isVisualTemplateBackend(backend)) {
    const err = new Error('registerVisualTemplateBackend: backend must satisfy the VISUAL_TEMPLATE_STORE_CONTRACT method set.');
    err.code = 'INVALID_BACKEND';
    throw err;
  }
  _backends.set(backend.id, backend);
  if (_activeBackendId === null) _activeBackendId = backend.id;
  return backend;
}

export function setActiveVisualTemplateBackend(id) {
  if (!_backends.has(id)) {
    const err = new Error(`setActiveVisualTemplateBackend: no backend registered under "${id}".`);
    err.code = 'UNKNOWN_BACKEND';
    throw err;
  }
  _activeBackendId = id;
  return _backends.get(id);
}

export function getActiveVisualTemplateBackendId() {
  return _activeBackendId;
}

export function listVisualTemplateBackends() {
  return Object.freeze([..._backends.values()].map((b) => Object.freeze({
    id: b.id, version: b.version, active: b.id === _activeBackendId,
  })));
}

export function useCallableVisualTemplateBackend({ callVisualTemplate }) {
  const backend = createCallableVisualTemplateBackend({ callVisualTemplate });
  registerVisualTemplateBackend(backend);
  setActiveVisualTemplateBackend(CALLABLE_VISUAL_TEMPLATE_BACKEND_ID);
  return backend;
}

export function resetVisualTemplateStore() {
  _backends.clear();
  _activeBackendId = null;
  registerVisualTemplateBackend(nullVisualTemplateBackend);
  setActiveVisualTemplateBackend(DEFAULT_VISUAL_TEMPLATE_BACKEND_ID);
  _listeners.length = 0;
}

function active(method, ...args) {
  const backend = _backends.get(_activeBackendId);
  if (!backend) {
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NO_BACKEND_CONFIGURED, `No active Visual Template backend (method: ${method}).`);
  }
  return backend[method](...args);
}

/* ── Visual Template events (mirrors style-guide-store.js) — metadata only ── */

/** @type {Function[]} */
const _listeners = [];

export function registerVisualTemplateListener(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}
export function unregisterVisualTemplateListener(cb) {
  const i = _listeners.indexOf(cb);
  if (i !== -1) _listeners.splice(i, 1);
}

export const VISUAL_TEMPLATE_EVENT = Object.freeze({
  PROPOSED: 'visual_template.proposed',
  APPROVED: 'visual_template.approved',
  REJECTED: 'visual_template.rejected',
  DEPRECATED: 'visual_template.deprecated',
});

function notify(type, template) {
  const event = Object.freeze({
    type,
    at: new Date().toISOString(),
    templateId: template && template.templateId ? template.templateId : null,
    status: template && template.status ? template.status : null,
    version: template && template.templateVersion ? template.templateVersion : null,
  });
  for (const cb of _listeners) cb(event);
}

/* ── facade methods ─────────────────────────────────────────────────── */

export const listVisualTemplates = (filter) => active('list', filter);
export const getVisualTemplate = (templateId) => active('get', templateId);

/** Create a `proposed` template FROM an aggregated visual pattern (§13,
 *  §27). NEVER produces an approved template. `input` = { pattern |
 *  patternId, actorId?, now?, supersedesTemplateId? }. */
export function proposeVisualTemplateFromEvidence(input) {
  const result = active('proposeFromEvidence', input);
  if (result && result.ok) notify(VISUAL_TEMPLATE_EVENT.PROPOSED, result.data);
  return result;
}

/** Human approval (§11, §21): `proposed → approved`. `ctx` carries
 *  `{ actorId, rationale, at, expectedVersion, acknowledgeConflict }`. The
 *  server derives the actor + timestamps; the rationale MUST be non-empty. */
export function approveVisualTemplate(templateId, ctx = {}) {
  const result = active('approve', templateId, ctx);
  if (result && result.ok) notify(VISUAL_TEMPLATE_EVENT.APPROVED, result.data);
  return result;
}

export function rejectVisualTemplate(templateId, ctx = {}) {
  const result = active('reject', templateId, ctx);
  if (result && result.ok) notify(VISUAL_TEMPLATE_EVENT.REJECTED, result.data);
  return result;
}

export function deprecateVisualTemplate(templateId, ctx = {}) {
  const result = active('deprecate', templateId, ctx);
  if (result && result.ok) notify(VISUAL_TEMPLATE_EVENT.DEPRECATED, result.data);
  return result;
}

/** Deterministic effective-template resolution for a slot (§21): resolved | conflict | missing. */
export const resolveVisualTemplate = (target) => active('resolve', target);

/** The supersession chain for a template id (§12). */
export const getVisualTemplateHistoryChain = (templateId) => active('history', templateId);

/* ── bootstrap ─────────────────────────────────────────────────────── */
registerVisualTemplateBackend(nullVisualTemplateBackend);
setActiveVisualTemplateBackend(DEFAULT_VISUAL_TEMPLATE_BACKEND_ID);
