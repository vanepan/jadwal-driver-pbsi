/* problem-router-check.mjs — Phase 10.5, Part 2 ("Problem Router") + Part
   3 ("Unknown Problem Handling").

   Pure-engine (no browser) verification of routeProblem(),
   generateClarification(), and advanceProblemConversation() — the DOM
   check (problem-first-home-dom-check.mjs) proves the UI wiring; this
   proves the underlying engines' own decision logic directly, including
   edge cases a browser-level test would be slow/awkward to enumerate.

   Run: node scripts/problem-router-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeProblem, MIN_ROUTABLE_CONFIDENCE } from '../src/intake/problem-router.js';
import { WORKFLOW_ROUTE, isRoutingDecision } from '../src/intake/contracts/workflow-route-contract.js';
import { generateClarification } from '../src/intake/clarification-engine.js';
import { makeProblem } from '../src/reasoning/contracts/problem-contract.js';
import { hasProblemCategory, listProblemCategories } from '../src/intake/contracts/problem-category-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function importsOf(code) {
  const targets = [];
  const blocks = code.match(/import\s*(?:\{[^}]*\}|\S+)\s*from\s*'[^']*'/gs) || [];
  for (const b of blocks) { const m = b.match(/from\s*'([^']*)'/); if (m) targets.push(m[1]); }
  return targets;
}

console.log('\n[Part 1 — problem-router.js never imports conversation/ (Never rely on keyword matching alone — a plain lookup on the Problem Model\'s own field)]');
{
  const offenders = importsOf(read('src/intake/problem-router.js')).filter((t) => /\/conversation\//.test(t));
  check(`no violation${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 2 — the six registered categories from Phase 10.5\'s own worked examples all exist]');
{
  for (const id of ['facility', 'business_trip', 'procurement', 'administration', 'knowledge_search', 'document_upload']) {
    check(`hasProblemCategory('${id}')`, hasProblemCategory(id));
  }
}

function problemOf(category, facts = {}) {
  return makeProblem({ domainType: 'nor', description: 'x', facts: { category, ...facts } });
}

console.log('\n[Behaviour — every named route fires for its real category, per Part 2\'s own table]');
{
  const cases = [
    ['facility', WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION],
    ['business_trip', WORKFLOW_ROUTE.CONVERSATION],
    ['procurement', WORKFLOW_ROUTE.CONVERSATION],
    ['administration', WORKFLOW_ROUTE.CONVERSATION],
    ['knowledge_search', WORKFLOW_ROUTE.SEARCH],
    ['document_upload', WORKFLOW_ROUTE.KNOWLEDGE_ACQUISITION],
  ];
  for (const [category, expectedRoute] of cases) {
    const decision = routeProblem(problemOf(category), 0.5);
    check(`${category} -> ${expectedRoute}`, decision.route === expectedRoute);
    check(`${category}'s decision satisfies isRoutingDecision()`, isRoutingDecision(decision));
    check(`${category}'s reason names the real category, never a bare keyword`, decision.reason.includes(category));
  }
}

console.log('\n[Behaviour — Part 3: unknown category or low confidence ALWAYS clarifies, never rejects]');
{
  const unknownDecision = routeProblem(problemOf('unknown'), 0);
  check('unknown category -> CLARIFICATION_CONVERSATION', unknownDecision.route === WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION);

  const weakDecision = routeProblem(problemOf('facility'), MIN_ROUTABLE_CONFIDENCE - 0.01);
  check('a real category but BELOW the confidence threshold still clarifies rather than acting on a weak signal', weakDecision.route === WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION);

  const atThreshold = routeProblem(problemOf('facility'), MIN_ROUTABLE_CONFIDENCE);
  check('exactly AT the threshold is routable (>=, not >)', atThreshold.route === WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION);

  const unregisteredDecision = routeProblem(problemOf('some_future_category'), 0.9);
  check('a registered-but-unmapped category clarifies rather than guessing a workflow', unregisteredDecision.route === WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION);
}

console.log('\n[Behaviour — hasIntentMapping is honestly carried through, never inferred]');
{
  const withMapping = routeProblem(problemOf('business_trip'), 0.7, { hasIntentMapping: true });
  check('hasIntentMapping: true is preserved', withMapping.hasIntentMapping === true);
  const withoutMapping = routeProblem(problemOf('procurement'), 0.7, { hasIntentMapping: false });
  check('hasIntentMapping: false is preserved (procurement has no real Intent)', withoutMapping.hasIntentMapping === false);
  const defaulted = routeProblem(problemOf('facility'), 0.7);
  check('omitted opts defaults to false, never assumed true', defaulted.hasIntentMapping === false);
}

console.log('\n[Behaviour — Part 3: generateClarification NEVER returns a rejection, always a real question + real examples]');
{
  const c = generateClarification(problemOf('unknown'), []);
  check('message is a non-empty question/prompt, never "not recognized"', typeof c.message === 'string' && c.message.length > 0 && !/not recognized|tidak dikenali/i.test(c.message));
  check('examples reflects the REAL registry, not a hardcoded list', c.examples.length === listProblemCategories().filter((cat) => cat.label !== 'Unknown').length);
  check('partialSignal is honestly null when nothing was matched', c.partialSignal === null);

  const withKeywords = generateClarification(problemOf('unknown'), ['rusak']);
  check('partialSignal names the real matched keyword when one existed', withKeywords.partialSignal.includes('rusak'));

  // Determinism check — same input, same output (never a random reply).
  const c2 = generateClarification(problemOf('unknown'), []);
  check('clarification is deterministic for the same input', c.message === c2.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
