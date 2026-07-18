/* ============================================================
   NOR-COMPOSER.JS — NOR Intelligence Runtime (V2, Phase 8-10, Part 3)

   PURPOSE: "the NOR must become a consequence of organizational reasoning,
   never the starting point." Composes a fully-explainable, knowledge-driven
   draft — every section traceable to either a genuinely resolved fact
   (human-provided, e.g. via a completed Conversation) or a specific,
   Approved, cited Knowledge Asset — and hands it to the EXISTING, real,
   long-DORMANT Composer store (composer/composer-store.js#createDocument)
   for human authoring/review.

   A DELIBERATE, DOCUMENTED INTERPRETATION OF "FINAL NOR" — READ BEFORE
   MODIFYING. This file NEVER calls js/petty-cash/nor-document-engine.js's
   buildNorViewModel, js/docs/doc-engine.js, or ANY renderer, and produces
   NO PDF/HTML/Excel output. Three independent, load-bearing prior
   decisions make that the correct boundary, not a shortfall:
     1. nor-draft-contract.js's own NorPreview typedef: "a NOR Preview is
        NEVER a new render — a pointer to invoking the EXISTING
        buildNorViewModel + existing template renderer, unchanged... this
        file does not import or call any of them."
     2. nor-generator.js's own header: "never proposes norNumber, subject,
        recipients, or any other field whose correct value is genuinely
        business-specific data this platform has no statistical basis to
        invent — that would be a fake implementation."
     3. The original architecture doc's Decision 8 / §4.5: "must not
        introduce a second document-rendering universe."
   The real V1 renderer (js/docs/templates/nor.js + nor-paper.js +
   nor-excel-exporter.js) is hardwired to ONE specific NOR shape — Petty
   Cash realization (openingBalance/realizedAmount/real expense items),
   backed by real V1 data this platform does not own or create. A
   Conversation's CREATE_NOR intent (destination/traveler/dates/budget —
   a "Perjalanan Dinas" request) has NEVER had a real V1 renderer to target
   (document-intelligence/nor/README.md: "the actual NOR document remains
   the existing V1 flow, untouched"). Composing content for a document
   family with no real renderer, then calling a renderer built for a
   DIFFERENT document family, would be exactly the "fake implementation"
   nor-generator.js's own header refuses to become. Waking the ALREADY-
   BUILT, ALREADY-SCAFFOLDED Composer (dormant since V2.0.15, per
   js/v2/dormant-subsystems.js's own "composer-timeline" entry — deleted by
   this phase, see that file) is the legitimate "Final NOR" this platform
   can honestly produce: a complete, explainable, human-owned draft, never
   an auto-rendered artifact a human never reviewed.

   RESPONSIBILITY: composeNorDocument(gatheredFacts, opts).

   NORTH STAR GAP CLOSURE — NOR TYPE SCOPING BEFORE COMPOSITION. See
   docs/NOR_TYPE_DOMAIN_MODEL.md. This was the single most dangerous
   finding in docs/NORTH_STAR_READINESS_AUDIT.md's Stage 7: composing
   against EVERY Approved `nor`-domain item regardless of which NOR Type
   the gatheredFacts describe let wrong-domain content (petty-cash
   boilerplate) render into a business-trip draft as if it were correct.
   Approved items are now filtered against `gatheredFacts.type` before
   `patterns`/`renderingRules` are derived — an item with no
   `payload.norType` stays generic (applies to every NOR Type, e.g. a
   footer/pagination rule), an item WITH one only applies to a matching
   occasion. No existing seeded item carries `payload.norType` yet, so this
   filter is presently a no-op for every fixture that predates it; it only
   starts mattering once real, NOR-Type-tagged content exists (a content
   decision this design doc explicitly deferred, not part of this change).

   DEPENDENCIES: nor-generator.js (proposeNorFields — reused, unchanged),
   knowledge/services/knowledge-service.js, knowledge/services/
   explainability-service.js, knowledge/language/contracts/
   pattern-contract.js (isPatternEntry — reused), knowledge/language/
   contracts/rendering-rule-contract.js (isRenderingRuleEntry — reused),
   composer/composer-store.js#createDocument (the ONE new writer this file
   gives that store — see dormant-subsystems.js's own note that
   "reactivating a subsystem means deleting its entry, and the check will
   fail if you forget").

   PHASE 9, SPRINT 9.5 (REASONING ACTIVATION) — WHY reason() IS NOT CALLED
   HERE. See docs/SPRINT_9_5_REASONING_ACTIVATION.md. A first attempt
   imported reasoning/services/reasoning-service.js directly into this
   file; reasoning-engine-check.mjs's own architectural invariant
   (document-intelligence/ may never import reasoning/ — reasoning/ is
   the more upstream of the two, per js/v2/README.md's binding graph, and
   conversation/services/dynamic-conversation-service.js is the ONE
   documented exception) correctly caught this as a real boundary
   violation, not a style nit. Reasoning is instead computed by the
   caller (problem-solving/services/problem-solving-service.js#
   composeApprovedNor, which already legitimately depends on reasoning/
   for planDiagnosis) and attached to this function's own return value
   AFTER composeNorDocument returns — never inside it. This file stays
   exactly as reasoning-unaware as document-intelligence/'s own layering
   rule requires.

   NON-GOALS: never writes anywhere outside the Composer store. Never
   invents a field's value — a slot with no genuinely known fact stays an
   honest, visible placeholder, never guessed content.
   ============================================================ */

'use strict';

import { proposeNorFields } from './nor-generator.js';
import { listKnowledge, getKnowledge, LIFECYCLE_STATE } from '../../knowledge/services/knowledge-service.js';
import { explain } from '../../knowledge/services/explainability-service.js';
import { isPatternEntry } from '../../knowledge/language/contracts/pattern-contract.js';
import { isRenderingRuleEntry } from '../../knowledge/language/contracts/rendering-rule-contract.js';
import { createDocument } from '../composer/composer-store.js';

export const NOR_COMPOSER_ERRORS = Object.freeze({ NO_KNOWLEDGE: 'NO_KNOWLEDGE' });

const UNRESOLVED_MARKER = 'UNKNOWN — memerlukan masukan manusia';
const PATTERN_KINDS = Object.freeze(['sentence_pattern', 'paragraph_pattern', 'template_pattern']);

/** Resolves a PatternEntry's `{{slot}}` placeholders against genuinely
 *  known facts only. A slot with no matching, non-empty fact stays the
 *  honest UNRESOLVED_MARKER — never a fabricated guess. */
function resolvePattern(patternEntry, facts) {
  const unresolved = [];
  const text = patternEntry.template.replace(/\{\{(\w+)\}\}/g, (whole, slot) => {
    const value = facts[slot];
    if (value === undefined || value === null || value === '') {
      unresolved.push(slot);
      return `{{${slot}: ${UNRESOLVED_MARKER}}}`;
    }
    return String(value);
  });
  return { text, unresolved };
}

/**
 * @param {Object} gatheredFacts - facts already genuinely known (e.g. a completed Conversation's own gatheredFacts) — never fetched or invented by this file
 * @param {{sessionId?: string}} [opts]
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function composeNorDocument(gatheredFacts = {}, opts = {}) {
  const structural = proposeNorFields({ domainType: 'nor', ...gatheredFacts }, { sessionId: opts.sessionId });
  if (!structural.ok) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze(structural.error) });
  }

  const approved = listKnowledge({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.APPROVED });
  const allItems = approved.ok ? approved.data : [];
  // NOR Type scoping — see header. An item with no payload.norType is
  // generic; an item WITH one only applies when it matches this occasion.
  const norType = gatheredFacts.type || null;
  const items = allItems.filter((i) => {
    const itemNorType = i.payload && i.payload.norType;
    return !itemNorType || itemNorType === norType;
  });

  const patterns = items.filter((i) => PATTERN_KINDS.includes(i.kind) && isPatternEntry(i.payload));
  const renderingRules = items.filter((i) => i.kind === 'rendering_rule' && isRenderingRuleEntry(i.payload));

  const composedSections = [];
  const unresolvedFields = new Set();
  for (const item of patterns) {
    const { text, unresolved } = resolvePattern(item.payload, gatheredFacts);
    unresolved.forEach((u) => unresolvedFields.add(u));
    composedSections.push({
      field: `pattern:${item.id}`, value: text, source: 'knowledge', citedKnowledgeId: item.id, granularity: item.payload.granularity || null,
    });
  }

  // Human-provided facts are cited with source:'human_answer'; nothing
  // here is re-derived or altered — a straight, traceable pass-through.
  const humanFields = Object.entries(gatheredFacts)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([field, value]) => ({ field, value, source: 'human_answer', citedKnowledgeId: null }));

  const structuralFields = Object.entries(structural.draft.fields)
    .map(([field, value]) => ({ field, value, source: 'knowledge_suggestion', citedKnowledgeId: null }));

  const allSections = [...humanFields, ...structuralFields, ...composedSections];
  const fieldMap = {};
  for (const s of allSections) fieldMap[s.field] = s.value;

  const citedKnowledgeIds = [
    ...structural.citedKnowledgeIds,
    ...patterns.map((p) => p.id),
    ...renderingRules.map((r) => r.id),
  ];

  const explanation = citedKnowledgeIds.map((id) => {
    const itemResult = getKnowledge(id);
    if (!itemResult.ok) return { citedKnowledgeId: id, statement: `Source "${id}" is no longer available.` };
    const explained = explain(itemResult.data);
    return {
      citedKnowledgeId: id,
      kind: itemResult.data.kind,
      statement: explained.ok
        ? `Approved ${itemResult.data.approvedAt ? itemResult.data.approvedAt.slice(0, 10) : itemResult.data.updatedAt.slice(0, 10)}, cited by ${explained.data.corroborationCount} corroborating item(s).`
        : 'Not yet explainable.',
    };
  });

  const composerDocument = createDocument('nor', fieldMap);

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      composerDocument,
      unresolvedFields: Object.freeze([...unresolvedFields]),
      citedKnowledgeIds: Object.freeze(citedKnowledgeIds),
      explanation: Object.freeze(explanation),
      renderingRulesConsidered: Object.freeze(renderingRules.map((r) => ({ id: r.id, property: r.payload.property, rule: r.payload.rule }))),
    }),
  });
}
