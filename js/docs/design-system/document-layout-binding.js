/* ============================================================
   DOCUMENT-LAYOUT-BINDING.JS — Phase 12, Sprint 12.2

   "Composer automatically chooses the appropriate template" +
   "Layout Versioning" (Phase 12 directive), as one small, pure resolver.

   A document's DOMAIN TYPE decides two things:
     · which pdfmake TEMPLATE renders it, and
     · which DESIGN SYSTEM (from document-design-system.js) supplies that
       template's geometry.

   Before this sprint that choice was an implicit string literal buried in
   review-workspace.js (`generateAndOpen('composer-document', …)`). This
   module makes it an explicit, governed, versioned binding:

     resolveLayout(domainType)  → { templateId, designSystemId, designVersion }
                                  (designVersion = the LATEST — what a NEW
                                  document renders with)
     stampLayout(domainType)    → a frozen record to persist on an archived
                                  document, so it always renders with the
                                  layout version it was PUBLISHED under
     resolvePinnedDesign(stamp) → the exact design a stamp pins to; THROWS
                                  if that version no longer exists — an
                                  archived document never silently inherits a
                                  later redesign ("Nothing changes silently").

   HONEST SCOPE: today there is exactly one real binding (the composed
   ComposerDocument, domainType 'nor', rendered by the generic
   'composer-document' template over the 'composer' design system), because
   that is the one composed-document output that exists in this codebase —
   the same reason each design system currently has exactly one version.
   The STRUCTURE is the Phase 12 infrastructure ("Multiple Document
   Templates" / "Layout Versioning"); new bindings/versions append here with
   no code change anywhere else.

   Pure data + pure functions. Imports only the design-system registry (no
   DOM, no side effects), so it is fully Node-testable.
   ============================================================ */

'use strict';

import { getDesignSystem, latestVersion } from './document-design-system.js';

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

/* domainType -> { templateId (a template-registry.js id), designSystemId }.
   The composed ComposerDocument (domainType 'nor') renders through the
   generic 'composer-document' template, which draws its page geometry from
   the 'composer' design system. This is exactly the choice review-workspace.js
   hardcoded; it lives here now, governed and extensible. */
const LAYOUT_BINDINGS = deepFreeze({
  nor: { templateId: 'composer-document', designSystemId: 'composer' },
});

/** Every domainType with a registered layout binding. */
export function listDomainBindings() {
  return Object.keys(LAYOUT_BINDINGS);
}

/**
 * Resolve the layout a NEW document of this domainType renders with.
 * @returns {{templateId:string, designSystemId:string, designVersion:number}}
 * Unknown domainType THROWS — template selection is governed, never a guess.
 */
export function resolveLayout(domainType) {
  const b = LAYOUT_BINDINGS[domainType];
  if (!b) {
    throw new Error(
      `No document layout bound for domainType "${domainType}" `
      + `(bound: ${Object.keys(LAYOUT_BINDINGS).join(', ') || 'none'})`,
    );
  }
  return Object.freeze({
    templateId: b.templateId,
    designSystemId: b.designSystemId,
    designVersion: latestVersion(b.designSystemId),
  });
}

/**
 * A frozen layout stamp to persist on an archived / published document, so a
 * later render reproduces the exact layout it was published under.
 * @param {string} domainType
 * @param {string} [at] ISO timestamp (defaults to now; injectable for tests).
 */
export function stampLayout(domainType, at) {
  const resolved = resolveLayout(domainType);
  return Object.freeze({ ...resolved, pinnedAt: at || new Date().toISOString() });
}

/**
 * Resolve the exact design-system descriptor a layout stamp pins to.
 * THROWS if that design system / version no longer exists — an archived
 * document surfaces the problem loudly instead of silently rendering with a
 * newer layout (Phase 12: LAYOUT VERSIONING, "Nothing changes silently").
 */
export function resolvePinnedDesign(stamp) {
  if (!stamp || !stamp.designSystemId) {
    throw new Error('resolvePinnedDesign requires a layout stamp with a designSystemId');
  }
  return getDesignSystem(stamp.designSystemId, stamp.designVersion);
}
