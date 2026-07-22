/* workspace-ownership-check.mjs — Phase 12.8, "Live Word Workspace".

   Same two-part shape as scripts/body-ownership-check.mjs /
   scripts/recognition-ownership-check.mjs, on purpose.

   1. ARCHITECTURAL (static, source-scanning). Asserts: workspace-repository's
      writers (create/appendVersion) and workspace-timeline-repository's
      writer (append) have exactly one legitimate caller
      (services/workspace-service.js); workspace/ imports NOTHING from
      ui/, ai-foundation/, conversation/, reasoning/, problem-intelligence/,
      problem-solving/ (the Phase 12.8 graph extension permits ONLY
      document-intelligence/, knowledge/, organizational-memory/, learning/,
      body/, recognition/); nothing OUTSIDE js/v2/workspace/ imports
      js/v2/workspace/, except js/v2/ui/review-workspace.js (Sprint
      12.8.4's one approved caller); workspace/index.js stays a structural
      no-op (dormancy-by-omission, same convention every prior domain's
      Foundation sprint establishes).

   2. BEHAVIOURAL (runtime). A real end-to-end flow in plain Node:
      createDocument -> createWorkspace -> buildContext ->
      computeSuggestionsFor -> decideSuggestion -> getWorkspaceTimeline ->
      getBlockCitations -> explainSuggestion. Unlike body/'s real sensors
      (which genuinely cannot import in plain Node — real V1/Firebase
      coupling), workspace/service.js's one document-intelligence/
      dependency (composer-store.js) stays Firebase-free by construction
      (composer-document-repository.js only ever touches js/firebase.js
      inside initComposerDocumentSync(), never at module load) — so this
      whole flow is expected to run for real here, not just import cleanly.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/workspace-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function allSourceFiles(dir) {
  const out = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(r);
      else if (entry.name.endsWith('.js')) out.push({ rel: r, code: stripComments(read(r)) });
    }
  }(dir));
  return out;
}

const V2_FILES = allSourceFiles('js/v2');
const WORKSPACE_FILES = V2_FILES.filter((f) => f.rel.startsWith('js/v2/workspace/'));

function importTargets(code) {
  const blocks = code.match(/import\s*(?:\{[^}]*\}|[\w*\s,]+)\s*from\s*'[^']*'|^import\s*'[^']*'/gms) || [];
  return blocks.map((b) => {
    const m = b.match(/from\s*'([^']*)'/) || b.match(/^import\s*'([^']*)'/);
    return { block: b, target: m ? m[1] : null };
  }).filter((x) => x.target);
}

function resolveRelative(fromRel, target) {
  if (!target.startsWith('.')) return target;
  const fromDir = path.posix.dirname(fromRel);
  return path.posix.normalize(path.posix.join(fromDir, target));
}

console.log('\n[Part 1 — exactly ONE owner writes the Workspace Repository]');
{
  const OWNER = 'js/v2/workspace/services/workspace-service.js';
  const REPO_RE = /workspace\/repository\/workspace-repository\.js$/;
  const writers = [];
  for (const { rel, code } of V2_FILES) {
    if (rel === OWNER || rel.includes('/workspace/repository/')) continue;
    for (const { block, target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!REPO_RE.test(resolved)) continue;
      const clause = block.match(/\{([^}]*)\}/);
      if (!clause) continue;
      for (const w of ['create', 'appendVersion']) {
        if (new RegExp(`(^|[,{\\s])${w}(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause[1])) writers.push(`${rel}:${w}`);
      }
    }
  }
  check(`NO module outside the owner imports a Workspace Repository WRITER${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`, writers.length === 0);
  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write the repository (it is the owner, not a delegator)', /repoCreate/.test(ownerSrc) && /repoAppendVersion/.test(ownerSrc));
}

console.log('\n[Part 2 — exactly ONE owner writes the Workspace Timeline Repository]');
{
  const OWNER = 'js/v2/workspace/services/workspace-service.js';
  const writers = [];
  for (const { rel, code } of V2_FILES) {
    if (rel === OWNER) continue;
    for (const { block, target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!/workspace\/repository\/workspace-timeline-repository\.js$/.test(resolved)) continue;
      const clause = block.match(/\{([^}]*)\}/);
      if (!clause) continue;
      if (new RegExp('(^|[,{\\s])append(\\s+as\\s+\\w+)?\\s*(,|$)').test(clause[1])) writers.push(rel);
    }
  }
  check(`NO module outside the owner imports workspace-timeline-repository.js's append()${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`, writers.length === 0);
  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write the timeline (it is the orchestrator, not a delegator)', /timelineAppend/.test(ownerSrc));
}

console.log('\n[Part 3 — workspace/ never imports ui/, ai-foundation/, conversation/, problem-intelligence/, or problem-solving/ (the Phase 12.8/12.8.x graph grants ONLY document-intelligence/, knowledge/, organizational-memory/, learning/, body/, recognition/, reasoning/)]');
{
  // reasoning/ moved OUT of forbidden and into workspace-context-builder.js's
  // approved imports in Phase 12.8.x, Sprint 3 — the SECOND narrow graph
  // grant (see js/v2/README.md's Phase 12.8.x extension). conversation/ and
  // problem-intelligence/ and problem-solving/ remain forbidden — this
  // sprint did not touch those.
  const FORBIDDEN_TREES = ['/v2/ui/', '/v2/ai-foundation/', '/v2/conversation/', '/v2/problem-intelligence/', '/v2/problem-solving/'];
  const leaks = [];
  for (const { rel, code } of WORKSPACE_FILES) {
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (FORBIDDEN_TREES.some((t) => resolved.includes(t))) leaks.push(`${rel} -> ${resolved}`);
    }
  }
  check(`workspace/ imports NOTHING from ui/ai-foundation/conversation/problem-intelligence/problem-solving/${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);

  const ALLOWED_TREES = ['/v2/document-intelligence/', '/v2/knowledge/', '/v2/organizational-memory/', '/v2/learning/', '/v2/body/', '/v2/recognition/', '/v2/reasoning/', '/v2/workspace/'];
  const unexpected = [];
  for (const { rel, code } of WORKSPACE_FILES) {
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!resolved.includes('/v2/')) continue; // relative sibling files under workspace/ itself, or non-v2 targets checked elsewhere
      if (!ALLOWED_TREES.some((t) => resolved.includes(t))) unexpected.push(`${rel} -> ${resolved}`);
    }
  }
  check(`workspace/'s only js/v2/ imports are the 7 approved trees (+ itself)${unexpected.length ? ` — FOUND: ${unexpected.join(', ')}` : ''}`, unexpected.length === 0);
}

console.log('\n[Part 4 — nothing OUTSIDE js/v2/workspace/ imports js/v2/workspace/, except ui/review-workspace.js (Sprint 12.8.4\'s one approved caller)]');
{
  const APPROVED_CALLER = 'js/v2/ui/review-workspace.js';
  const offenders = [];
  for (const { rel, code } of V2_FILES) {
    if (rel.startsWith('js/v2/workspace/') || rel === APPROVED_CALLER) continue;
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (resolved.includes('/v2/workspace/')) offenders.push(`${rel} -> ${resolved}`);
    }
  }
  check(`no js/v2/* file outside workspace/ or ${APPROVED_CALLER} imports workspace/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);

  const approvedSrc = stripComments(read(APPROVED_CALLER));
  check(`${APPROVED_CALLER} DOES import workspace/ (it is the approved caller, not a stray)`, /\/v2\/workspace\//.test(approvedSrc) || /\.\.\/workspace\//.test(approvedSrc));

  const wideOffenders = [];
  (function walk(rel) {
    if (rel === 'js/v2') return; // handled above, more precisely
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) { walk(r); continue; }
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.mjs')) continue;
      if (r.startsWith('scripts/')) continue; // check scripts legitimately import workspace/ directly
      const code = stripComments(read(r));
      if (/from\s*'[^']*\/v2\/workspace\//.test(code) || /from\s*"[^"]*\/v2\/workspace\//.test(code)) wideOffenders.push(r);
    }
  }('js'));
  check(`no file anywhere under js/ (outside js/v2/workspace/, ${APPROVED_CALLER}, and scripts/) imports js/v2/workspace/${wideOffenders.length && wideOffenders.length > 1 ? ` — FOUND: ${wideOffenders.join(', ')}` : ''}`, wideOffenders.every((f) => f === APPROVED_CALLER));
}

console.log('\n[Part 5 — dormancy-by-omission: workspace/index.js is still a structural no-op]');
{
  const indexSrc = stripComments(read('js/v2/workspace/index.js'));
  check('workspace/index.js imports nothing at all (still a structural no-op)', !/\bimport\b/.test(indexSrc));
}

console.log('\n[Part 6b — Sprint 2: deterministic entity-text-matcher, pure function, synthetic vocabulary]');
{
  const { buildVocabulary, matchEntityMentions } = await import('../js/v2/workspace/context/entity-text-matcher.js');
  const vocabulary = buildVocabulary({
    body: { entities: [{ id: 'vehicle:B-1234-XYZ', entityType: 'vehicle', attributes: { plateNumber: 'B 1234 XYZ', name: 'Toyota Avanza' } }] },
    organizationalMemory: { commonTerminology: [{ value: 'Nota Organisasi', supportCount: 5 }, { value: 'ab' /* too short, must be filtered */ }] },
  });
  check('buildVocabulary assembles real terms from body + organizational memory', vocabulary.some((v) => v.term === 'Toyota Avanza') && vocabulary.some((v) => v.term === 'Nota Organisasi'));
  check('buildVocabulary filters out terms below the minimum length floor', !vocabulary.some((v) => v.term === 'ab'));

  const matches = matchEntityMentions('Kendaraan Toyota Avanza akan digunakan untuk Nota Organisasi ini.', vocabulary);
  check('matchEntityMentions finds every real vocabulary term present in the text', matches.some((m) => m.term === 'Toyota Avanza') && matches.some((m) => m.term === 'Nota Organisasi'));

  const noMatch = matchEntityMentions('Kalimat ini tidak menyebut apapun yang relevan.', vocabulary);
  check('matchEntityMentions returns nothing when the text genuinely mentions none of the vocabulary — never a fabricated match', noMatch.length === 0);

  const wordBoundaryGuard = matchEntityMentions('TidakToyota Avanzaland sama sekali.', [{ term: 'Toyota', sourceType: 'body', refId: null, entityType: null }]);
  check('matchEntityMentions never matches a term as a substring of a LONGER word (word-boundary respected)', wordBoundaryGuard.length === 0);
}

console.log('\n[Part 6 — behavioural: a real end-to-end flow in plain Node]');
{
  try {
    const { createDocument } = await import('../js/v2/document-intelligence/composer/composer-store.js');
    const { isRoundTripSafe } = await import('../js/v2/workspace/adapters/block-adapter.js');
    const ws = await import('../js/v2/workspace/services/workspace-service.js');
    const { makeLiveSuggestion } = await import('../js/v2/workspace/contracts/live-suggestion-contract.js');

    // Mirrors ui/review-workspace.js's own explicit opt-in — see that
    // file's mountReviewWorkspace() comment for why NullRepository is the
    // correct default and this is the one legitimate place it is overridden.
    ws.setWorkspaceBackend('memory');

    const doc = createDocument('nor', { subject: 'Pengadaan meja', requestedBy: 'Budi' });
    check('block-adapter round-trips a real ComposerDocument losslessly', isRoundTripSafe(doc.sections));

    const bogus = ws.createWorkspace({ documentId: 'does-not-exist', ownerId: 'evan' });
    check('createWorkspace refuses an unknown documentId', bogus.ok === false && bogus.error.code === 'DOCUMENT_NOT_FOUND');

    const created = ws.createWorkspace({ documentId: doc.documentId, ownerId: 'evan' });
    check('createWorkspace succeeds for a real ComposerDocument', created.ok === true && created.data.documentId === doc.documentId);
    const workspaceId = created.data.workspaceId;

    const reused = ws.getOrCreateWorkspaceForDocument(doc.documentId, { ownerId: 'evan' });
    check('getOrCreateWorkspaceForDocument reuses the existing workspace (never a duplicate)', reused.data.workspaceId === workspaceId);

    const context = ws.buildContext(workspaceId);
    check('buildContext resolves the real documentId/domainType', context.documentId === doc.documentId && context.domainType === 'nor');
    check('buildContext blocks mirror the document\'s own section count', context.blocks.length === doc.sections.length);
    // Phase 12.8.x, Sprint 3 — reasoning/ is genuinely called (real
    // detectKnowledgeGaps output for a domainType with no Approved
    // Ontology yet), never a guess or a silently-skipped field.
    check('buildContext genuinely calls reasoning/ (reasonWithGaps) and gets a real, structured result back', context.reasoning !== null && Array.isArray(context.reasoning.gaps) && 'recommendation' in context.reasoning);

    const suggestions = ws.computeSuggestionsFor(workspaceId);
    check('computeSuggestionsFor returns an array honestly (Recognition/Body have zero real producers yet, so [] is the correct answer, never a throw)', Array.isArray(suggestions));
    check('computeSuggestionsFor genuinely includes a real knowledge_gap suggestion (no Approved Ontology exists for "nor" in this fixture run — a real, honest gap, not fabricated)', suggestions.some((s) => s.suggestionType === 'knowledge_gap'));

    const snap = ws.getLastSnapshot(workspaceId);
    check('getLastSnapshot returns the just-built context, honestly aged (not stale)', snap !== null && snap.stale === false && typeof snap.ageMs === 'number');

    const synthetic = makeLiveSuggestion({
      workspaceId, blockId: null, suggestionType: 'organizational_terminology', payload: { value: 'test' },
      sourceDomain: 'organizational-memory', sourceRecordId: null, confidence: 0.7,
      evidence: [{ itemId: 'organizational-memory:nor:terminology:test', kind: 'statistic', weight: 0.7, rationale: 'test evidence' }],
    });
    const decided = ws.decideSuggestion(workspaceId, synthetic, 'accepted', { actorId: 'evan' });
    check('decideSuggestion succeeds, recording BOTH a timeline entry and a real Learning Signal', decided.ok === true && decided.timelineEntry !== null && decided.learningResult.ok === true);
    check('decideSuggestion binds a Live Citation for an organizational-memory-sourced suggestion', decided.citationEntry !== null);

    const timeline = ws.getWorkspaceTimeline(workspaceId);
    check('getWorkspaceTimeline shows exactly the decision + citation entries just written', timeline.ok === true && timeline.data.length === 2);

    const citations = ws.getBlockCitations(workspaceId, null);
    check('getBlockCitations folds the bound citation, keyed to the real evidence itemId', citations.length === 1 && citations[0].itemId === synthetic.evidence[0].itemId);

    const rejected = ws.decideSuggestion(workspaceId, { ...synthetic, suggestionId: 'live-suggestion:other:1', sourceDomain: 'recognition' }, 'rejected', { actorId: 'evan' });
    check('decideSuggestion(reject) does NOT bind a citation (only accepted knowledge/org-memory suggestions do)', rejected.ok === true && rejected.citationEntry === null);
    check('decideSuggestion(reject) still records a real Learning Signal (a rejection is a real, useful signal too)', rejected.learningResult.ok === true);

    const badDecision = ws.decideSuggestion(workspaceId, synthetic, 'maybe', { actorId: 'evan' });
    check('decideSuggestion refuses an invalid decision value', badDecision.ok === false && badDecision.error.code === 'INVALID_DECISION');

    const explanation = ws.explainSuggestion(synthetic);
    check('explainSuggestion answers all 5 CLAUDE.md-mandated questions (why/evidence/historical-source/knowledge/confidence)', explanation.ok === true && !!explanation.data.why && explanation.data.evidence.length === 1 && explanation.data.confidence === 0.7 && 'sourceExplanation' in explanation.data);

    // Phase 12.8.x, Sprint 5 — the passive 'ignored' outcome.
    const ignoredSuggestion = makeLiveSuggestion({
      workspaceId, blockId: null, suggestionType: 'learning_recommendation', payload: { claim: 'test' },
      sourceDomain: 'learning', sourceRecordId: 'learning-event:test', confidence: 0.6,
      evidence: [{ itemId: 'learning-event:test', kind: 'corroboration', weight: 0.6, rationale: 'test' }],
    });
    const ignored = ws.decideSuggestion(workspaceId, ignoredSuggestion, 'ignored', { actorId: 'evan' });
    check('decideSuggestion accepts the new "ignored" outcome and records a real Learning Signal', ignored.ok === true && ignored.learningResult.ok === true);
    check('an "ignored" decision never binds a citation (only accepted knowledge/org-memory suggestions do)', ignored.citationEntry === null);
    const timelineAfterIgnore = ws.getWorkspaceTimeline(workspaceId);
    check('the Workspace Timeline records the ignored decision as its own distinct entry type', timelineAfterIgnore.data.some((e) => e.entryType === 'suggestion_ignored'));

    const badDecision2 = ws.decideSuggestion(workspaceId, ignoredSuggestion, 'maybe', { actorId: 'evan' });
    check('decideSuggestion still refuses a genuinely invalid decision value after adding "ignored"', badDecision2.ok === false && badDecision2.error.code === 'INVALID_DECISION');
  } catch (err) {
    check(`the full end-to-end flow ran without throwing — FAILED: ${err && err.stack}`, false);
  }
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
