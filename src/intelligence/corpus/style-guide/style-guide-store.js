/* ============================================================
   STYLE-GUIDE-STORE.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   PURPOSE: THE single access point to the authoritative PBSI NOR Style
   Guide — propose (from Writing Memory only), approve (human + rationale),
   reject, deprecate, resolve, read. The actual persistence is a pluggable
   backend (Null by default = inert; Memory for tests / DISABLED mode; the
   staged server callable later). Mirrors
   src/intelligence/corpus/corpus-store.js exactly: a backend registry +
   process-wide events + pure delegation.

       (future) Style Guide review console ──┐
       (future) NOR generator (read-only) ───┼──▶  style guide store  ──▶  active backend
       Writing Memory → proposal builder ────┘            │                (Null by default)
                                                          └── events (metadata only)

   RESPONSIBILITY: backend registry (register / setActive / reset /
   useCallableStyleGuideBackend), STYLE_GUIDE_EVENT + listeners, and the
   eight delegating facade methods (contracts/style-guide-store-contract.js).

   NON-GOALS: does not itself persist, resolve, or render anything. Ships
   the Null backend only, so every call returns NOT_IMPLEMENTED until a
   real backend is registered. Does NOT connect to the NOR generator (§26).
   Does NOT read/write src/knowledge/, the NOR Registry, Petty Cash, the
   feature flag, or any OpenAI surface.
   ============================================================ */

'use strict';

import {
  STYLE_GUIDE_ERRORS, styleGuideFailure, isStyleGuideBackend,
} from './contracts/style-guide-store-contract.js';
import { nullStyleGuideBackend, NULL_STYLE_GUIDE_BACKEND_ID } from './backends/null-style-guide-backend.js';
import { createCallableStyleGuideBackend, CALLABLE_STYLE_GUIDE_BACKEND_ID } from './backends/callable-style-guide-backend.js';

/* ── re-exports so this facade is a complete import surface ───────────── */
export {
  STYLE_GUIDE_STORE_SCHEMA, STYLE_GUIDE_ERRORS, styleGuideSuccess, styleGuideFailure,
  STYLE_GUIDE_STORE_CONTRACT, isStyleGuideBackend,
} from './contracts/style-guide-store-contract.js';
export { NULL_STYLE_GUIDE_BACKEND_ID } from './backends/null-style-guide-backend.js';
export {
  memoryStyleGuideBackend, resetMemoryStyleGuideBackend, MEMORY_STYLE_GUIDE_BACKEND_ID,
} from './backends/memory-style-guide-backend.js';
export {
  createCallableStyleGuideBackend, CALLABLE_STYLE_GUIDE_BACKEND_ID,
} from './backends/callable-style-guide-backend.js';

/* ── backend registry — Null is the default and the reset target ─────── */

const _backends = new Map();
let _activeBackendId = null;

export const DEFAULT_STYLE_GUIDE_BACKEND_ID = NULL_STYLE_GUIDE_BACKEND_ID;

export function registerStyleGuideBackend(backend) {
  if (!isStyleGuideBackend(backend)) {
    const err = new Error('registerStyleGuideBackend: backend must satisfy the STYLE_GUIDE_STORE_CONTRACT method set.');
    err.code = 'INVALID_BACKEND';
    throw err;
  }
  _backends.set(backend.id, backend);
  if (_activeBackendId === null) _activeBackendId = backend.id;
  return backend;
}

export function setActiveStyleGuideBackend(id) {
  if (!_backends.has(id)) {
    const err = new Error(`setActiveStyleGuideBackend: no backend registered under "${id}".`);
    err.code = 'UNKNOWN_BACKEND';
    throw err;
  }
  _activeBackendId = id;
  return _backends.get(id);
}

export function getActiveStyleGuideBackendId() {
  return _activeBackendId;
}

export function listStyleGuideBackends() {
  return Object.freeze([..._backends.values()].map((b) => Object.freeze({
    id: b.id, version: b.version, active: b.id === _activeBackendId,
  })));
}

/**
 * Register the server-owned callable backend and make it active.
 * `callStyleGuide` is js/firebase.js's httpsCallable wrapper in production,
 * a fake wired to the CJS callable's .run() in tests.
 * @param {{ callStyleGuide: Function }} opts
 */
export function useCallableStyleGuideBackend({ callStyleGuide }) {
  const backend = createCallableStyleGuideBackend({ callStyleGuide });
  registerStyleGuideBackend(backend);
  setActiveStyleGuideBackend(CALLABLE_STYLE_GUIDE_BACKEND_ID);
  return backend;
}

/** Test/teardown helper — restore just the Null backend, active. */
export function resetStyleGuideStore() {
  _backends.clear();
  _activeBackendId = null;
  registerStyleGuideBackend(nullStyleGuideBackend);
  setActiveStyleGuideBackend(DEFAULT_STYLE_GUIDE_BACKEND_ID);
  _listeners.length = 0;
}

function active(method, ...args) {
  const backend = _backends.get(_activeBackendId);
  if (!backend) {
    return styleGuideFailure(STYLE_GUIDE_ERRORS.NO_BACKEND_CONFIGURED, `No active Style Guide backend (method: ${method}).`);
  }
  return backend[method](...args);
}

/* ── Style Guide events (mirrors corpus-store.js) — metadata only ─────── */

/** @type {Function[]} */
const _listeners = [];

export function registerStyleGuideListener(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}
export function unregisterStyleGuideListener(cb) {
  const i = _listeners.indexOf(cb);
  if (i !== -1) _listeners.splice(i, 1);
}

export const STYLE_GUIDE_EVENT = Object.freeze({
  PROPOSED: 'style_guide.rule_proposed',
  APPROVED: 'style_guide.rule_approved',
  REJECTED: 'style_guide.rule_rejected',
  DEPRECATED: 'style_guide.rule_deprecated',
});

function notify(type, rule) {
  const event = Object.freeze({
    type,
    at: new Date().toISOString(),
    ruleId: rule && rule.ruleId ? rule.ruleId : null,
    status: rule && rule.status ? rule.status : null,
    version: rule && rule.version ? rule.version : null,
  });
  for (const cb of _listeners) cb(event);
}

/* ── facade methods ─────────────────────────────────────────────────── */

/** Read rules (organization-wide). `filter` = { status?, category?, documentType?, scope?, key?, includeSuperseded? }. */
export const listStyleRules = (filter) => active('list', filter);

/** Read one rule by id. */
export const getStyleRule = (ruleId) => active('get', ruleId);

/**
 * Create a `proposed` rule FROM a Writing Memory entry (§13, §26). NEVER
 * produces an approved rule. `input` = { memory | memoryId, actorId?, now?,
 * supersedesRuleId? }.
 */
export function proposeStyleRuleFromMemory(input) {
  const result = active('proposeFromMemory', input);
  if (result && result.ok) notify(STYLE_GUIDE_EVENT.PROPOSED, result.data);
  return result;
}

/**
 * Human approval (§9, §10, §14): `proposed → approved`. `ctx` carries
 * `{ actorId, rationale, at, expectedVersion, acknowledgeConflict }`. The
 * server derives the actor + timestamps; the rationale MUST be non-empty.
 */
export function approveStyleRule(ruleId, ctx = {}) {
  const result = active('approve', ruleId, ctx);
  if (result && result.ok) notify(STYLE_GUIDE_EVENT.APPROVED, result.data);
  return result;
}

/** Human rejection (§10): `proposed → rejected`. `ctx` = { actorId, reason, at, expectedVersion }. */
export function rejectStyleRule(ruleId, ctx = {}) {
  const result = active('reject', ruleId, ctx);
  if (result && result.ok) notify(STYLE_GUIDE_EVENT.REJECTED, result.data);
  return result;
}

/** Human deprecation (§15): `approved → deprecated`. The rule is retained + queryable. */
export function deprecateStyleRule(ruleId, ctx = {}) {
  const result = active('deprecate', ruleId, ctx);
  if (result && result.ok) notify(STYLE_GUIDE_EVENT.DEPRECATED, result.data);
  return result;
}

/** Deterministic effective-rule resolution for a slot (§21): resolved | conflict | missing. */
export const resolveStyleRule = (target) => active('resolve', target);

/** The supersession chain for a rule id (§15). */
export const getStyleRuleHistory = (ruleId) => active('history', ruleId);

/* ── bootstrap ─────────────────────────────────────────────────────── */
registerStyleGuideBackend(nullStyleGuideBackend);
setActiveStyleGuideBackend(DEFAULT_STYLE_GUIDE_BACKEND_ID);
