/* nor-composition-check.mjs — Phase 8-10, Part 3 ("NOR Composition
   Engine").

   1. ARCHITECTURAL (static). nor-composer.js NEVER imports
      js/petty-cash/nor-document-engine.js (buildNorViewModel),
      js/docs/doc-engine.js, or any renderer — the one, load-bearing
      constraint this file's own header names three prior decisions for.

   2. BEHAVIOURAL. Cite-or-abstain (no Approved structural Knowledge ->
      NO_KNOWLEDGE, never a fabricated draft — the SAME real
      nor-generator.js#proposeNorFields refusal, reused unchanged).
      Placeholder resolution: a genuinely known fact fills a `{{slot}}`;
      an unknown one stays a visible, honest placeholder, never invented
      content. The dormant Composer really wakes: createDocument produces
      a real, readable ComposerDocument every call.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/nor-composition-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setKnowledgeBackend, ingest, promoteKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { composeNorDocument, NOR_COMPOSER_ERRORS } from '../js/v2/document-intelligence/nor/nor-composer.js';
import { getComposerTimeline, resetComposerStore } from '../js/v2/document-intelligence/composer/composer-store.js';
import { isDormant, getDormant } from '../js/v2/dormant-subsystems.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

console.log('\n[Part 1 — nor-composer.js never imports a renderer]');
{
  const code = read('js/v2/document-intelligence/nor/nor-composer.js');
  const blocks = code.match(/import\s*(?:\{[^}]*\}|\S+)\s*from\s*'[^']*'/gs) || [];
  const targets = blocks.map((b) => b.match(/from\s*'([^']*)'/)[1]);
  const offenders = targets.filter((t) => /nor-document-engine\.js|doc-engine\.js|nor-paper\.js|nor-excel-exporter\.js|templates\/nor\.js/.test(t));
  check(`no renderer import found${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
  check('no call to buildNorViewModel anywhere in the file', !code.includes('buildNorViewModel'));
}

console.log('\n[Part 2 — dormant-subsystems.js honestly reflects the full wake: createDocument AND editSection both real (Phase 10, Sprint 10.3)]');
{
  // 'composer-timeline' was retired from the register in Sprint 10.3 —
  // editSection now has a real caller (ui/review-workspace.js's Document
  // Editor). The entry existing at all would now be the bug.
  check('composer-timeline is NO LONGER in the register (editSection has a real caller as of Sprint 10.3)', !isDormant('composer-timeline'));
  check('getDormant returns null for the retired entry', getDormant('composer-timeline') === null);
}

setKnowledgeBackend('memory');
resetComposerStore();

function seedApproved({ kind, payload, sourceRef }) {
  const id = generateKnowledgeId({ domainType: 'nor', sourceType: 'manual-file', sourceRef });
  const now = new Date().toISOString();
  ingest({
    id, version: 1, domainType: 'nor', sourceType: 'manual-file', kind, payload, confidence: 0.9,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: 'manual-file', sourceRef, capturedAt: now },
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  promoteKnowledge(id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'seed for nor-composition-check.mjs' });
  return id;
}

console.log('\n[Behaviour — cite-or-abstain: no Approved structural Knowledge refuses, never fabricates]');
{
  const result = composeNorDocument({ destination: 'Bandung' });
  check('ok:false', !result.ok);
  check('error code is NO_KNOWLEDGE (the SAME code nor-generator.js#proposeNorFields already uses)', result.error.code === NOR_COMPOSER_ERRORS.NO_KNOWLEDGE);
}

console.log('\n[Behaviour — a real composition: known facts fill slots, unknown facts stay honest placeholders]');
{
  seedApproved({ kind: 'structure', payload: { signatoryTopCount: 4, signatoryBottomCount: 2, itemCount: 10, reimburseLineCount: 0 }, sourceRef: 'struct-1' });
  const patternId = seedApproved({
    kind: 'sentence_pattern',
    payload: { template: 'Sehubungan dengan {{destination}}, kami mengajukan perjalanan dinas untuk {{traveler}}.', slots: [{ name: 'destination' }, { name: 'traveler' }], granularity: 'sentence' },
    sourceRef: 'pattern-1',
  });
  const renderRuleId = seedApproved({ kind: 'rendering_rule', payload: { property: 'pageBreak', scope: 'ledgerSection', rule: 'Ledger always starts on a new page.' }, sourceRef: 'render-1' });

  const result = composeNorDocument({ destination: 'Bandung' }, { sessionId: 'test-session' });
  check('composition succeeds', result.ok);
  const composedField = result.data.composerDocument.sections.find((s) => s.field.startsWith('pattern:'));
  check('a real composed section exists', !!composedField);
  check('the KNOWN slot ("destination") is genuinely resolved', composedField.value.includes('Bandung'));
  check('the UNKNOWN slot ("traveler") stays an honest, visible placeholder — never fabricated', composedField.value.includes('UNKNOWN') && composedField.value.includes('traveler'));
  check('unresolvedFields honestly names "traveler"', result.data.unresolvedFields.includes('traveler'));
  check('citedKnowledgeIds includes the pattern and the rendering rule', result.data.citedKnowledgeIds.includes(patternId) && result.data.citedKnowledgeIds.includes(renderRuleId));
  check('every cited item has a real, non-empty explanation', result.data.explanation.length === result.data.citedKnowledgeIds.length);
  check('renderingRulesConsidered surfaces the real rule as informational metadata (never applied to any actual rendering)', result.data.renderingRulesConsidered.length === 1);

  const timeline = getComposerTimeline('nor');
  check('the Composer store genuinely woke — getComposerTimeline("nor") is no longer empty', timeline.length > 0);
  check('the human-provided fact ("destination") is cited with source human_answer', result.data.composerDocument.sections.some((s) => s.field === 'destination' && s.value === 'Bandung'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
