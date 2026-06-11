/* ============================================================
   TEMPLATE-REGISTRY.JS — id → document template descriptor

   A template descriptor:
   {
     build:    (data, ctx) => DocumentDefinition,  // pure, no DOM
     filename: (data) => string,                   // optional
     meta:     { title, label, ... },              // optional
   }

   Templates self-register on import (side-effect import).
   ============================================================ */

'use strict';

const _templates = new Map();

/** Register (or replace) a template by id. */
export function register(id, descriptor) {
  if (!id || typeof descriptor?.build !== 'function') {
    throw new Error(`register("${id}") requires a descriptor with a build() function`);
  }
  _templates.set(id, descriptor);
}

/** Resolve a template descriptor or throw. */
export function getTemplate(id) {
  const t = _templates.get(id);
  if (!t) throw new Error(`No document template registered for id "${id}"`);
  return t;
}

/** List registered template ids (for tooling / diagnostics). */
export function listTemplates() {
  return [..._templates.keys()];
}
