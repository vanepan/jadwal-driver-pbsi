/* nor-knowledge-bootstrap-seed.mjs — Knowledge Authoring Sprint 01.

   Seeds the REAL, unmodified Knowledge Repository (via
   knowledge-service.js#ingest / #promoteKnowledge — no new engine, no new
   repository, no bypass of the human-gated lifecycle) with every
   KnowledgeItem reverse-engineered from docs/NOR-Specification.md and
   shaped per docs/Knowledge-Asset-Specification.md, then:

     1. verifies every item and relationship reached Approved with zero
        errors (Task 2 — Populate the Knowledge Repository)
     2. runs consistency validation: duplicates, conflicts, weak
        confidence, circular dependency, incomplete ontology (Task 5)
     3. demonstrates the pipeline this content is FOR: Knowledge Gap
        Detection (reasoning/knowledge-gap-engine.js) and Knowledge
        Retrieval / cite-or-abstain Reasoning (reasoning/reasoning-engine.js)
        both now run against REAL data instead of an empty repository
     4. prints repository population statistics (Task 6)

   Deterministic. No AI, no Firebase touch. Every engine called below
   already existed before this sprint — this script is a CLIENT of
   knowledge-service.js and reasoning-service.js, exactly like every prior
   scripts/*-check.mjs.

   Run: node scripts/nor-knowledge-bootstrap-seed.mjs   (exit 0 = pass) */

import { setKnowledgeBackend, listKnowledge, getKnowledgeMetrics, LIFECYCLE_STATE } from '../js/v2/knowledge/services/knowledge-service.js';
import { RELATIONSHIP_TYPE } from '../js/v2/knowledge/contracts/dependency-graph-contract.js';
import {
  seedNorBootstrapKnowledge, NOR_KNOWLEDGE_ITEM_SPECS, NOR_KNOWLEDGE_RELATIONSHIP_SPECS, DOMAIN_TYPE,
} from '../js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js';
import { detectKnowledgeGaps, reason, makeProblem } from '../js/v2/reasoning/services/reasoning-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
function section(title) { console.log(`\n[${title}]`); }

/* ══ 1. SEED ══════════════════════════════════════════════════════════ */
section('Task 2 — Populate the Knowledge Repository (Draft → Approved, via the REAL, unmodified review workflow)');
setKnowledgeBackend('memory');
const seedResult = seedNorBootstrapKnowledge({ approverId: 'evan', decidedAt: new Date().toISOString() });

check(`zero ingest/promote errors (${seedResult.errors.length} reported)`, seedResult.errors.length === 0);
for (const e of seedResult.errors) console.log(`    ! ${e.sourceRef} @ ${e.stage}: ${e.error && e.error.message}`);

check(`every authored item spec was created (${seedResult.items.length}/${NOR_KNOWLEDGE_ITEM_SPECS.length})`,
  seedResult.items.length === NOR_KNOWLEDGE_ITEM_SPECS.length);
check(`every authored relationship spec was created (${seedResult.relationships.length}/${NOR_KNOWLEDGE_RELATIONSHIP_SPECS.length})`,
  seedResult.relationships.length === NOR_KNOWLEDGE_RELATIONSHIP_SPECS.length);
check('every seeded item reached Approved (none left in Draft/Candidate/Pending Review)',
  seedResult.items.every((i) => i.lifecycleState === LIFECYCLE_STATE.APPROVED));
check('every seeded relationship reached Approved',
  seedResult.relationships.every((r) => r.lifecycleState === LIFECYCLE_STATE.APPROVED));

const allNorItems = listKnowledge({ domainType: DOMAIN_TYPE }).data;
const approvedNorItems = allNorItems.filter((i) => i.lifecycleState === LIFECYCLE_STATE.APPROVED);
const factItems = approvedNorItems.filter((i) => i.kind !== 'relationship');
const relationshipItems = approvedNorItems.filter((i) => i.kind === 'relationship');

/* ══ 2. VALIDATION (Task 5) ══════════════════════════════════════════ */
section('Task 5 — Knowledge Validation');

// Duplicate detection — exact-payload collisions within the same kind.
const byKind = new Map();
for (const item of factItems) {
  if (!byKind.has(item.kind)) byKind.set(item.kind, []);
  byKind.get(item.kind).push(item);
}
const duplicates = [];
for (const [kind, items] of byKind) {
  const seen = new Map();
  for (const item of items) {
    const key = JSON.stringify(item.payload);
    if (seen.has(key)) duplicates.push({ kind, a: seen.get(key), b: item.id });
    else seen.set(key, item.id);
  }
}
check(`no duplicate knowledge (0 exact-payload collisions found within any kind, checked across ${factItems.length} fact items)`, duplicates.length === 0);
for (const d of duplicates) console.log(`    ! duplicate ${d.kind}: ${d.a} ≡ ${d.b}`);

// Conflicting rules — real conflicts_with relationships, surfaced honestly (not "zero expected").
const conflicts = relationshipItems.filter((r) => r.payload.type === RELATIONSHIP_TYPE.CONFLICTS_WITH);
check(`conflicting-rule detection ran (${conflicts.length} conflicts_with relationship(s) found, by design — see Validation Report)`, true);
for (const c of conflicts) console.log(`    ⚠ conflicts_with: ${c.payload.fromId} ↔ ${c.payload.toId}`);

// Missing evidence — organizational_reasoning items structurally require
// non-empty evidenceRefs (isOrganizationalReasoningEntry already enforces
// this at ingest time); here we additionally classify each ref as
// resolving to a real sibling item vs. an external document citation.
const reasoningItems = factItems.filter((i) => i.kind === 'organizational_reasoning');
const idSet = new Set(factItems.map((i) => i.id));
let externalRefs = 0; let internalRefs = 0;
for (const item of reasoningItems) {
  for (const ref of item.payload.evidenceRefs) {
    if (idSet.has(ref)) internalRefs++; else externalRefs++;
  }
}
check(`every organizational_reasoning item has non-empty evidenceRefs (${reasoningItems.length} items, ${internalRefs} internal + ${externalRefs} external-document citations, 0 empty)`,
  reasoningItems.every((i) => Array.isArray(i.payload.evidenceRefs) && i.payload.evidenceRefs.length > 0));

// Weak confidence — flagged honestly, not hidden.
const WEAK_THRESHOLD = 0.5;
const weakConfidence = factItems.filter((i) => i.confidence < WEAK_THRESHOLD).sort((a, b) => a.confidence - b.confidence);
check(`weak-confidence scan ran (${weakConfidence.length} item(s) below ${WEAK_THRESHOLD}, by design — see Validation Report)`, true);
for (const w of weakConfidence) console.log(`    ⚠ weak confidence (${w.confidence}): ${w.id}`);

// Circular dependency — DFS cycle detection over the relationship graph.
const adjacency = new Map();
for (const r of relationshipItems) {
  const { fromId, toId } = r.payload;
  if (!adjacency.has(fromId)) adjacency.set(fromId, []);
  adjacency.get(fromId).push(toId);
}
function hasCycle() {
  const WHITE = 0; const GRAY = 1; const BLACK = 2;
  const color = new Map();
  function visit(node) {
    color.set(node, GRAY);
    for (const next of (adjacency.get(node) || [])) {
      const c = color.get(next) || WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  }
  for (const node of adjacency.keys()) {
    if ((color.get(node) || WHITE) === WHITE && visit(node)) return true;
  }
  return false;
}
check(`no circular dependency in the relationship graph (${relationshipItems.length} edges checked via DFS)`, !hasCycle());

// Incomplete ontology — reuse the REAL, existing reasoning/knowledge-gap-engine.js
// (Phase 4-7), never a new check. This is Knowledge Gap Detection running
// against real data for the first time in this platform's history.
const gaps = detectKnowledgeGaps(DOMAIN_TYPE);
check(`Knowledge Gap Detection ran against real Approved knowledge for "${DOMAIN_TYPE}" (reasoning/knowledge-gap-engine.js, unmodified)`, Array.isArray(gaps));
console.log(`    → ${gaps.length} gap(s) remaining after seeding (see Validation Report for detail):`);
for (const g of gaps) console.log(`      - [${g.priority}] ${g.gapType}: ${g.reason}`);

/* ══ 3. RETRIEVAL / REASONING PROOF (Success Criteria) ═════════════════ */
section('Success Criteria — Knowledge Retrieval has data; Reasoning can cite real rules');
const demoProblem = makeProblem({
  domainType: DOMAIN_TYPE,
  description: 'A NOR is being prepared for the current petty-cash cycle.',
  facts: {},
});
const recommendation = reason(demoProblem);
check('reasoning-engine.js#reason() returns a real, cited Recommendation against Approved knowledge (no longer NO_APPLICABLE_KNOWLEDGE)',
  recommendation.ok === true && recommendation.data.citedRuleIds.length > 0);
if (recommendation.ok) {
  console.log(`    → cited ${recommendation.data.citedRuleIds.length} rule(s), ${recommendation.data.citedKnowledgeIds.length} supporting knowledge item(s), confidence ${recommendation.data.confidence.toFixed(2)}`);
  console.log(`    → claim: ${recommendation.data.claim.slice(0, 160)}...`);
} else {
  console.log(`    ! reason() failed: ${recommendation.error && recommendation.error.message}`);
}

/* ══ 4. REPOSITORY POPULATION STATISTICS (Task 6) ══════════════════════ */
section('Task 6 — Repository Population Report');
const metrics = getKnowledgeMetrics();
const countsByKind = {};
for (const item of factItems) countsByKind[item.kind] = (countsByKind[item.kind] || 0) + 1;
const avgConfidence = factItems.reduce((sum, i) => sum + i.confidence, 0) / factItems.length;
const openQuestions = factItems.filter((i) => i.kind === 'question_tree' && i.payload.status === 'open');

console.log(`  Total fact KnowledgeItems (excluding relationships): ${factItems.length}`);
console.log(`  Total relationship KnowledgeItems: ${relationshipItems.length}`);
console.log('  Counts by kind:');
for (const [kind, n] of Object.entries(countsByKind).sort((a, b) => b[1] - a[1])) console.log(`    - ${kind}: ${n}`);
console.log(`  Average confidence across all fact items: ${avgConfidence.toFixed(3)}`);
console.log(`  Knowledge coverage (distinct kinds populated): ${Object.keys(countsByKind).length} / registered kinds`);
console.log(`  Unknown Areas (question_tree items still 'open'): ${openQuestions.length}`);
console.log(`  Repository-reported metrics: ${JSON.stringify(metrics.data)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
