/* workspace-ownership-check.mjs — Phase 12.8, "Live Word Workspace".

   Same two-part shape as scripts/body-ownership-check.mjs /
   scripts/recognition-ownership-check.mjs, on purpose.

   1. ARCHITECTURAL (static, source-scanning). Asserts: workspace-repository's
      writers (create/appendVersion) and workspace-timeline-repository's
      writer (append) have exactly one legitimate caller
      (services/workspace-service.js); workspace/ imports NOTHING from
      ui/, conversation/, reasoning/, problem-intelligence/,
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

console.log('\n[Part 3 — workspace/ never imports ui/, conversation/, problem-intelligence/, or problem-solving/ (the Phase 12.8/12.8.x graph grants ONLY document-intelligence/, knowledge/, organizational-memory/, learning/, body/, recognition/, reasoning/)]');
{
  // reasoning/ moved OUT of forbidden and into workspace-context-builder.js's
  // approved imports in Phase 12.8.x, Sprint 3 — the SECOND narrow graph
  // grant (see js/v2/README.md's Phase 12.8.x extension). conversation/ and
  // problem-intelligence/ and problem-solving/ remain forbidden — this
  // sprint did not touch those. ai-foundation/ was deleted (confirmed dead,
  // zero real callers anywhere) during Phase 1 Repository Refoundation.
  const FORBIDDEN_TREES = ['/v2/ui/', '/v2/conversation/', '/v2/problem-intelligence/', '/v2/problem-solving/'];
  const leaks = [];
  for (const { rel, code } of WORKSPACE_FILES) {
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (FORBIDDEN_TREES.some((t) => resolved.includes(t))) leaks.push(`${rel} -> ${resolved}`);
    }
  }
  check(`workspace/ imports NOTHING from ui/conversation/problem-intelligence/problem-solving/${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);

  // organizational-memory/ moved from js/v2/organizational-memory/ to
  // src/organizational-memory/ during Phase 1 Repository Refoundation — its
  // resolved import paths no longer contain '/v2/' at all, so both the gate
  // below and the allowlist match on '/organizational-memory/' alone
  // (substring-safe for either the old or new root) rather than requiring
  // '/v2/' to be present, or this assertion would silently stop checking
  // workspace's real organizational-memory dependency entirely.
  const ALLOWED_TREES = ['/v2/document-intelligence/', '/v2/knowledge/', '/organizational-memory/', '/v2/learning/', '/v2/body/', '/v2/recognition/', '/v2/reasoning/', '/v2/workspace/'];
  const unexpected = [];
  for (const { rel, code } of WORKSPACE_FILES) {
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!resolved.includes('/v2/') && !resolved.includes('/organizational-memory/')) continue; // relative sibling files under workspace/ itself, or non-v2/non-moved targets checked elsewhere
      if (!ALLOWED_TREES.some((t) => resolved.includes(t))) unexpected.push(`${rel} -> ${resolved}`);
    }
  }
  check(`workspace/'s only js/v2/ (+ moved src/) imports are the 7 approved trees (+ itself)${unexpected.length ? ` — FOUND: ${unexpected.join(', ')}` : ''}`, unexpected.length === 0);
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

console.log('\n[Part 7 — Phase 12.9.1: "Workspace must never learn new objects" (constant-cost onboarding)]');
{
  // Static: workspace-service.js and workspace-context-builder.js must
  // contain no objectKind/domainType conditional branching outside the
  // registry lookup itself (getOrganizationalObject/getCapabilitiesForObjectKind)
  // — a new object kind must be addable via adapter + registration alone.
  const CORE_FILES = [
    'js/v2/workspace/services/workspace-service.js',
    'js/v2/workspace/context/workspace-context-builder.js',
    'js/v2/workspace/suggestion/workspace-suggestion-engine.js',
    'js/v2/workspace/explainability/workspace-explainability-service.js',
  ];
  const BRANCH_RE = /(objectKind|domainType)\s*===?\s*['"`]/g;
  const branches = [];
  for (const rel of CORE_FILES) {
    const code = stripComments(read(rel));
    const matches = code.match(BRANCH_RE) || [];
    if (matches.length > 0) branches.push(`${rel}: ${matches.join(', ')}`);
  }
  check(`no Workspace core/shared-Capability file branches on a literal objectKind/domainType value${branches.length ? ` — FOUND: ${branches.join(' | ')}` : ''}`, branches.length === 0);

  // Static: only object-adapters/ (and the registry's own bootstrap) may
  // import document-intelligence/composer/composer-store.js's getDocument —
  // the one NOR-specific seam is fully contained, never leaked back into
  // the generic orchestration/capability layer.
  const leaks = [];
  for (const { rel, code } of WORKSPACE_FILES) {
    if (rel.startsWith('js/v2/workspace/object-adapters/')) continue;
    for (const { block, target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!/composer-store\.js$/.test(resolved)) continue;
      const clause = block.match(/\{([^}]*)\}/);
      if (clause && /(^|[,{\s])getDocument(\s+as\s+\w+)?\s*(,|$)/.test(clause[1])) leaks.push(rel);
    }
  }
  check(`no file outside object-adapters/ imports composer-store.js#getDocument directly${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);

  // Behavioural: the constant-cost onboarding proof itself — a synthetic
  // objectKind registers and opens successfully with zero import of any
  // core file changing. (workspace-organizational-object-check.mjs Part 6
  // is the full version of this; this is a cheap smoke re-confirmation
  // that the seam this Part's static checks describe is really load-bearing.)
  try {
    const reg = await import('../js/v2/workspace/registry/organizational-object-registry.js');
    const cap = await import('../js/v2/workspace/registry/workspace-capability-registry.js');
    const fakeAdapter = { objectKind: 'ownership-check-fake', getBlocks: () => [], getMetadata: (id) => (id === 'known' ? { objectId: id, domainType: 'ownership-check-fake' } : null), getHistory: () => [] };
    reg.registerOrganizationalObject(fakeAdapter);
    cap.registerCapabilityForObjectKind('ownership-check-fake', 'timeline');
    const ws = await import('../js/v2/workspace/services/workspace-service.js');
    const opened = ws.openObject({ objectId: 'known', objectKind: 'ownership-check-fake', ownerId: 'evan' });
    check('a synthetic objectKind opens successfully through openObject() with no core-file change', opened.ok === true && opened.data.objectKind === 'ownership-check-fake');
    reg.resetOrganizationalObjectRegistry();
    cap.resetWorkspaceCapabilityRegistry();
  } catch (err) {
    check(`constant-cost onboarding smoke test ran without throwing — FAILED: ${err && err.stack}`, false);
  }
}

console.log('\n[Part 8 — Phase 12.9.2: Discussion is a genuinely generic, self-contained shared Capability]');
{
  // Ownership: discussion-event-repository.js#append's ONE legitimate
  // caller is discussion/discussion-service.js itself — NOT
  // workspace-service.js (unlike workspace-timeline-repository.js, where
  // workspace-service.js is both orchestrator and writer; Discussion owns
  // its own repository end to end, reached only through the generic
  // executor seam).
  {
    const OWNER = 'js/v2/workspace/discussion/discussion-service.js';
    const writers = [];
    for (const { rel, code } of V2_FILES) {
      if (rel === OWNER || rel.includes('/workspace/repository/')) continue;
      for (const { block, target } of importTargets(code)) {
        const resolved = resolveRelative(rel, target);
        if (!/workspace\/repository\/discussion-event-repository\.js$/.test(resolved)) continue;
        const clause = block.match(/\{([^}]*)\}/);
        if (clause && /(^|[,{\s])append(\s+as\s+\w+)?\s*(,|$)/.test(clause[1])) writers.push(rel);
      }
    }
    check(`NO module outside discussion-service.js imports discussion-event-repository.js's append()${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`, writers.length === 0);
    const ownerSrc = stripComments(read(OWNER));
    check('discussion-service.js itself DOES write the repository (it is the owner, not a delegator)', /repoAppend/.test(ownerSrc));
  }

  // Genericity: discussion/ (and its own contracts) import NOTHING from
  // any other domain — no document-intelligence/, knowledge/,
  // organizational-memory/, body/, recognition/, learning/, reasoning/.
  // Discussion's implementation must remain identical for every object
  // kind precisely because it never imports anything that would let it
  // tell them apart.
  {
    const FORBIDDEN_TREES = ['/v2/document-intelligence/', '/v2/knowledge/', '/v2/organizational-memory/', '/v2/body/', '/v2/recognition/', '/v2/learning/', '/v2/reasoning/', '/v2/ui/'];
    const DISCUSSION_FILES = V2_FILES.filter((f) => f.rel.startsWith('js/v2/workspace/discussion/') || f.rel === 'js/v2/workspace/contracts/discussion-event-contract.js' || f.rel === 'js/v2/workspace/repository/discussion-event-repository.js');
    const leaks = [];
    for (const { rel, code } of DISCUSSION_FILES) {
      for (const { target } of importTargets(code)) {
        const resolved = resolveRelative(rel, target);
        if (FORBIDDEN_TREES.some((t) => resolved.includes(t))) leaks.push(`${rel} -> ${resolved}`);
      }
    }
    check(`Discussion (discussion/ + its contract + its repository) imports NOTHING from any other domain${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);
  }

  // workspace-service.js reaches Discussion ONLY through the generic
  // executor registry, never by importing discussion-service.js directly
  // — the real proof that "execute Discussion" stays generic.
  {
    const svcSrc = stripComments(read('js/v2/workspace/services/workspace-service.js'));
    check('workspace-service.js never imports discussion/discussion-service.js directly (only via capability-executor-registry.js)', !/discussion-service\.js/.test(svcSrc));
  }

  // No literal capabilityId branch anywhere in Workspace core or any
  // shared Capability engine — extends Part 7's objectKind/domainType
  // check to capabilityId.
  {
    const CAPABILITY_AWARE_FILES = [
      'js/v2/workspace/services/workspace-service.js',
      'js/v2/workspace/context/workspace-context-builder.js',
      'js/v2/workspace/suggestion/workspace-suggestion-engine.js',
      'js/v2/workspace/explainability/workspace-explainability-service.js',
    ];
    const CAPABILITY_BRANCH_RE = /capabilityId\s*===?\s*['"`]/g;
    const branches = [];
    for (const rel of CAPABILITY_AWARE_FILES) {
      const matches = stripComments(read(rel)).match(CAPABILITY_BRANCH_RE) || [];
      if (matches.length > 0) branches.push(`${rel}: ${matches.join(', ')}`);
    }
    check(`no Workspace core/shared-Capability file branches on a literal capabilityId value${branches.length ? ` — FOUND: ${branches.join(' | ')}` : ''}`, branches.length === 0);
  }

  // Dormancy: no UI wiring happened this sprint — review-workspace.js
  // (the one approved external caller) does not yet reference Discussion
  // or the generic capability surface at all.
  {
    const uiSrc = stripComments(read('js/v2/ui/review-workspace.js'));
    check('ui/review-workspace.js does not yet reference discussion/executeCapability (no UI wiring this sprint, as scoped)', !/executeCapability|discussionCapabilityExecutor/.test(uiSrc));
  }

  // Behavioural smoke: Discussion truly is object-agnostic — a synthetic
  // objectKind gets a working Discussion thread with zero import of any
  // real domain, mirroring Part 7's constant-cost proof.
  try {
    const reg = await import('../js/v2/workspace/registry/organizational-object-registry.js');
    const cap = await import('../js/v2/workspace/registry/workspace-capability-registry.js');
    const ws = await import('../js/v2/workspace/services/workspace-service.js');
    const discRepo = await import('../js/v2/workspace/repository/discussion-event-repository.js');
    const fakeAdapter = { objectKind: 'discussion-ownership-fake', getBlocks: () => [], getMetadata: (id) => (id === 'known' ? { objectId: id, domainType: 'discussion-ownership-fake' } : null), getHistory: () => [] };
    reg.registerOrganizationalObject(fakeAdapter);
    cap.registerCapabilityForObjectKind('discussion-ownership-fake', 'discussion');
    const opened = ws.openObject({ objectId: 'known', objectKind: 'discussion-ownership-fake', ownerId: 'evan' });
    const posted = ws.executeCapability(opened.data.workspaceId, 'discussion', 'postComment', { authorId: 'evan', body: 'Ownership-check smoke comment.' });
    check('Discussion works end-to-end for a synthetic objectKind with zero core-file/domain change', opened.ok === true && posted.ok === true);
    reg.resetOrganizationalObjectRegistry();
    cap.resetWorkspaceCapabilityRegistry();
    discRepo.resetDiscussionEventRepository();
  } catch (err) {
    check(`Discussion cross-object smoke test ran without throwing — FAILED: ${err && err.stack}`, false);
  }
}

console.log('\n[Part 9 — Phase 12.9.3: Capability Composition owns orchestration only, never a Capability]');
{
  const COMPOSITION_FILE = 'js/v2/workspace/composition/capability-composition-engine.js';
  const compositionSrc = stripComments(read(COMPOSITION_FILE));

  // Composition holds no repository of its own — purely stateless, exactly
  // like workspace-suggestion-engine.js.
  check('the composition engine defines no persistent store of its own (no Map/Set/array holding state across calls)', !/new\s+Map\s*\(|new\s+Set\s*\(/.test(compositionSrc));

  // Capability A must never import Capability B — and Composition (which
  // orchestrates every Capability) must never import ANY specific
  // Capability's implementation directly, only the generic registries.
  {
    const FORBIDDEN_DIRECT_IMPORTS = ['discussion/discussion-service', 'suggestion/workspace-suggestion-engine', 'explainability/workspace-explainability-service'];
    const leaks = [];
    for (const { target } of importTargets(compositionSrc)) {
      if (FORBIDDEN_DIRECT_IMPORTS.some((f) => target.includes(f))) leaks.push(target);
    }
    check(`the composition engine imports NO specific Capability's implementation directly (only registries)${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);
  }

  // Discussion (the one real Capability implementation so far) must not
  // import the composition engine, or any other Capability — Capability A
  // never imports Capability B, in either direction.
  {
    const discussionSrc = stripComments(read('js/v2/workspace/discussion/discussion-service.js'));
    const leaks = [];
    for (const { target } of importTargets(discussionSrc)) {
      if (target.includes('composition/') || target.includes('suggestion/') || target.includes('explainability/')) leaks.push(target);
    }
    check(`discussion-service.js imports nothing from composition/ or any other Capability's own folder${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);
  }

  // Composition never imports a Capability's own repository directly —
  // the only legitimate path into a Capability's data is through its
  // registered executor.
  check('the composition engine imports no Capability repository directly (e.g. discussion-event-repository.js)', !/discussion-event-repository\.js/.test(compositionSrc));

  // Descriptor Registry remains the single source of capability metadata
  // — Composition imports the real enums/comparator rather than
  // redeclaring its own copy.
  check('the composition engine imports SIMULATION_COMPATIBILITY/OFFLINE_COMPATIBILITY/MUTABILITY/compareExecutionCost from capability-descriptor-registry.js rather than redeclaring them', /from\s+'\.\.\/registry\/capability-descriptor-registry\.js'/.test(compositionSrc) && !/const\s+SIMULATION_COMPATIBILITY\s*=/.test(compositionSrc));

  // Workspace remains generic — extends Part 7/8's literal-branch check to
  // the composition engine itself and to workspace-service.js's new
  // composeCapabilities function.
  {
    const CAPABILITY_AWARE_FILES = [
      'js/v2/workspace/services/workspace-service.js',
      'js/v2/workspace/composition/capability-composition-engine.js',
      'js/v2/workspace/context/workspace-context-builder.js',
      'js/v2/workspace/suggestion/workspace-suggestion-engine.js',
      'js/v2/workspace/explainability/workspace-explainability-service.js',
    ];
    const CAPABILITY_BRANCH_RE = /capabilityId\s*===?\s*['"`]/g;
    const branches = [];
    for (const rel of CAPABILITY_AWARE_FILES) {
      const matches = stripComments(read(rel)).match(CAPABILITY_BRANCH_RE) || [];
      if (matches.length > 0) branches.push(`${rel}: ${matches.join(', ')}`);
    }
    check(`no Workspace core/shared-Capability/Composition file branches on a literal capabilityId value${branches.length ? ` — FOUND: ${branches.join(' | ')}` : ''}`, branches.length === 0);
  }

  // Dormancy: no UI wiring happened this sprint either.
  {
    const uiSrc = stripComments(read('js/v2/ui/review-workspace.js'));
    check('ui/review-workspace.js does not yet reference composeCapabilities (no UI wiring this sprint, as scoped)', !/composeCapabilities/.test(uiSrc));
  }

  // Behavioural smoke: two synthetic Capabilities compose over a synthetic
  // objectKind with zero core-file change — the constant-cost proof,
  // extended from "a new object kind" to "a new pipeline of new
  // capabilities."
  try {
    const reg = await import('../js/v2/workspace/registry/organizational-object-registry.js');
    const cap = await import('../js/v2/workspace/registry/workspace-capability-registry.js');
    const desc = await import('../js/v2/workspace/registry/capability-descriptor-registry.js');
    const execReg = await import('../js/v2/workspace/registry/capability-executor-registry.js');
    const engine = await import('../js/v2/workspace/composition/capability-composition-engine.js');
    const { makeCapabilityExecutionContext } = await import('../js/v2/workspace/contracts/capability-execution-context-contract.js');
    const { makeCapabilityPipelineStep } = await import('../js/v2/workspace/contracts/capability-pipeline-step-contract.js');

    reg.registerOrganizationalObject({ objectKind: 'composition-ownership-fake', getBlocks: () => [], getMetadata: (id) => (id === 'known' ? { objectId: id, domainType: 'composition-ownership-fake' } : null), getHistory: () => [] });
    for (const id of ['fake-x', 'fake-y']) {
      desc.registerCapabilityDescriptor({
        capabilityId: id, purpose: 'test', inputContract: 'test', outputContract: 'test', explainabilitySurface: null,
        learningSideEffects: desc.LEARNING_SIDE_EFFECTS.NONE, simulationCompatibility: desc.SIMULATION_COMPATIBILITY.SIMULATABLE,
        publishCompatibility: desc.PUBLISH_COMPATIBILITY.NOT_PUBLISHABLE, offlineCompatibility: desc.OFFLINE_COMPATIBILITY.OFFLINE_CAPABLE,
        executionCost: desc.EXECUTION_COST.TRIVIAL, determinism: desc.DETERMINISM.DETERMINISTIC, mutability: desc.MUTABILITY.READ_ONLY,
      });
      execReg.registerCapabilityExecutor({ capabilityId: id, execute: () => ({ ok: true, data: id, error: null }) });
      cap.registerCapabilityForObjectKind('composition-ownership-fake', id);
    }
    const context = makeCapabilityExecutionContext({ workspaceId: 'ws-smoke', objectKind: 'composition-ownership-fake', objectId: 'known' });
    const result = engine.composeCapabilities(context, [makeCapabilityPipelineStep({ capabilityId: 'fake-x', action: 'noop' }), makeCapabilityPipelineStep({ capabilityId: 'fake-y', action: 'noop' })]);
    check('two brand-new synthetic Capabilities compose successfully with zero core-file change', result.ok === true && result.compositionOutcome === 'completed' && result.steps.length === 2);

    reg.resetOrganizationalObjectRegistry();
    cap.resetWorkspaceCapabilityRegistry();
    desc.resetCapabilityDescriptorRegistry();
    execReg.resetCapabilityExecutorRegistry();
  } catch (err) {
    check(`Composition constant-cost smoke test ran without throwing — FAILED: ${err && err.stack}`, false);
  }
}

console.log('\n[Part 10 — Phase 12.9.4: Impact Analysis is a genuinely generic, read-only, non-learning analytical Capability]');
{
  const IMPACT_FILE = 'js/v2/workspace/impact-analysis/impact-analysis-service.js';
  const impactSrc = stripComments(read(IMPACT_FILE));

  // Impact Analysis holds no persistent store of its own — pure, like the
  // composition engine and workspace-suggestion-engine.js. An Impact
  // Report is never persisted, recomputed fresh on every call.
  check('impact-analysis-service.js defines no persistent store of its own (no Map/Set holding state across calls)', !/new\s+Map\s*\(|new\s+Set\s*\(/.test(impactSrc));

  // Genericity: impact-analysis/ (and its own contract) import NOTHING from
  // any other domain, and NOTHING from another Capability's own folder
  // (discussion/, composition/) or a future one — only the 3 generic
  // registries it is explicitly permitted to inspect.
  {
    const FORBIDDEN_TREES = ['/v2/document-intelligence/', '/v2/knowledge/', '/v2/organizational-memory/', '/v2/body/', '/v2/recognition/', '/v2/learning/', '/v2/reasoning/', '/v2/ui/'];
    const FORBIDDEN_CAPABILITY_FOLDERS = ['discussion/discussion-service', 'composition/capability-composition-engine'];
    const IMPACT_FILES = V2_FILES.filter((f) => f.rel.startsWith('js/v2/workspace/impact-analysis/') || f.rel === 'js/v2/workspace/contracts/impact-analysis-contract.js');
    const leaks = [];
    for (const { rel, code } of IMPACT_FILES) {
      for (const { target } of importTargets(code)) {
        const resolved = resolveRelative(rel, target);
        if (FORBIDDEN_TREES.some((t) => resolved.includes(t)) || FORBIDDEN_CAPABILITY_FOLDERS.some((f) => resolved.includes(f))) leaks.push(`${rel} -> ${resolved}`);
      }
    }
    check(`Impact Analysis (impact-analysis/ + its contract) imports NOTHING from any other domain or another Capability's implementation${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);
  }

  // Impact Analysis is explicitly PERMITTED (unlike Discussion) to import
  // the 3 generic registries — that is the real, documented difference
  // between an analytical Capability and a purely self-contained one.
  check('impact-analysis-service.js DOES import organizational-object-registry.js/workspace-capability-registry.js/capability-descriptor-registry.js (its one legitimate way to see real object state)', /organizational-object-registry\.js/.test(impactSrc) && /workspace-capability-registry\.js/.test(impactSrc) && /capability-descriptor-registry\.js/.test(impactSrc));

  // workspace-service.js reaches Impact Analysis ONLY through the generic
  // executor registry, never by importing impact-analysis-service.js
  // directly — the same proof Discussion's own Part 8 established.
  {
    const svcSrc = stripComments(read('js/v2/workspace/services/workspace-service.js'));
    check('workspace-service.js never imports impact-analysis/impact-analysis-service.js directly (only via capability-executor-registry.js)', !/impact-analysis-service\.js/.test(svcSrc));
  }

  // No literal capabilityId branch anywhere in Workspace core, the shared
  // Capability engines, or Composition — extends Parts 8/9's check; a
  // brand-new capabilityId ("impact-analysis") must not have required a
  // single one of these files to learn its name as a literal.
  {
    const CAPABILITY_AWARE_FILES = [
      'js/v2/workspace/services/workspace-service.js',
      'js/v2/workspace/composition/capability-composition-engine.js',
      'js/v2/workspace/context/workspace-context-builder.js',
      'js/v2/workspace/suggestion/workspace-suggestion-engine.js',
      'js/v2/workspace/explainability/workspace-explainability-service.js',
    ];
    const CAPABILITY_BRANCH_RE = /capabilityId\s*===?\s*['"`]/g;
    const branches = [];
    for (const rel of CAPABILITY_AWARE_FILES) {
      const matches = stripComments(read(rel)).match(CAPABILITY_BRANCH_RE) || [];
      if (matches.length > 0) branches.push(`${rel}: ${matches.join(', ')}`);
    }
    check(`no Workspace core/shared-Capability/Composition file branches on a literal capabilityId value${branches.length ? ` — FOUND: ${branches.join(' | ')}` : ''}`, branches.length === 0);
  }

  // Dormancy: no UI wiring happened this sprint either.
  {
    const uiSrc = stripComments(read('js/v2/ui/review-workspace.js'));
    check('ui/review-workspace.js does not yet reference impactAnalysisCapabilityExecutor/analyzeImpact (no UI wiring this sprint, as scoped)', !/impactAnalysisCapabilityExecutor|analyzeImpact/.test(uiSrc));
  }

  // Behavioural smoke: Impact Analysis works end-to-end for a synthetic
  // objectKind through composeCapabilities, with zero core-file change —
  // the same constant-cost onboarding proof every prior Capability sprint
  // established for its own Capability.
  try {
    const reg = await import('../js/v2/workspace/registry/organizational-object-registry.js');
    const cap = await import('../js/v2/workspace/registry/workspace-capability-registry.js');
    const ws = await import('../js/v2/workspace/services/workspace-service.js');
    const { makeCapabilityPipelineStep } = await import('../js/v2/workspace/contracts/capability-pipeline-step-contract.js');
    const { isImpactReport } = await import('../js/v2/workspace/contracts/impact-analysis-contract.js');

    const fakeAdapter = { objectKind: 'impact-ownership-fake', getBlocks: () => [], getMetadata: (id) => (id === 'known' ? { objectId: id, domainType: 'impact-ownership-fake' } : null), getHistory: () => [] };
    reg.registerOrganizationalObject(fakeAdapter);
    cap.registerCapabilityForObjectKind('impact-ownership-fake', 'impact-analysis');
    const opened = ws.openObject({ objectId: 'known', objectKind: 'impact-ownership-fake', ownerId: 'evan' });
    const composed = ws.composeCapabilities(opened.data.workspaceId, [makeCapabilityPipelineStep({ capabilityId: 'impact-analysis', action: 'analyze', payload: { proposal: {} } })]);
    check('Impact Analysis works end-to-end for a synthetic objectKind, through composeCapabilities, with zero core-file/domain change', opened.ok === true && composed.ok === true && isImpactReport(composed.steps[0].result.data));

    reg.resetOrganizationalObjectRegistry();
    cap.resetWorkspaceCapabilityRegistry();
  } catch (err) {
    check(`Impact Analysis cross-object smoke test ran without throwing — FAILED: ${err && err.stack}`, false);
  }
}

console.log('\n[Part 11 — Phase 12.9.5: Simulation is a genuinely generic, read-only, isolated analytical Capability that runs entirely through Composition]');
{
  const SIM_FILE = 'js/v2/workspace/simulation/simulation-service.js';
  const simSrc = stripComments(read(SIM_FILE));

  // Simulation holds no persistent store of its own — pure, like the
  // composition engine, workspace-suggestion-engine.js, and Impact
  // Analysis. A Simulation Report (and its Overlay) is never persisted,
  // recomputed fresh on every call.
  check('simulation-service.js defines no persistent store of its own (no Map/Set holding state across calls)', !/new\s+Map\s*\(|new\s+Set\s*\(/.test(simSrc));

  // Genericity: simulation/ (and its own contract) import NOTHING from any
  // other domain, and NOTHING from Discussion's or Impact Analysis's own
  // implementation — "Never directly call Discussion. Never directly call
  // Impact Analysis." per the brief. composition/capability-composition-engine.js
  // is the ONE explicit exception (shared engine, not a Capability
  // implementation — see the next check).
  {
    const FORBIDDEN_TREES = ['/v2/document-intelligence/', '/v2/knowledge/', '/v2/organizational-memory/', '/v2/body/', '/v2/recognition/', '/v2/learning/', '/v2/reasoning/', '/v2/ui/'];
    const FORBIDDEN_CAPABILITY_FOLDERS = ['discussion/discussion-service', 'impact-analysis/impact-analysis-service'];
    const SIM_FILES = V2_FILES.filter((f) => f.rel.startsWith('js/v2/workspace/simulation/') || f.rel === 'js/v2/workspace/contracts/simulation-contract.js');
    const leaks = [];
    for (const { rel, code } of SIM_FILES) {
      for (const { target } of importTargets(code)) {
        const resolved = resolveRelative(rel, target);
        if (FORBIDDEN_TREES.some((t) => resolved.includes(t)) || FORBIDDEN_CAPABILITY_FOLDERS.some((f) => resolved.includes(f))) leaks.push(`${rel} -> ${resolved}`);
      }
    }
    check(`Simulation (simulation/ + its contract) imports NOTHING from any other domain, Discussion's implementation, or Impact Analysis's implementation${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);
  }

  // Simulation is explicitly PERMITTED — indeed REQUIRED by the brief
  // ("Simulation executes entirely through the existing Composition
  // Engine") — to import composition/capability-composition-engine.js
  // directly, alongside the registries Impact Analysis already legitimately
  // reads. This is a real, new, third shape: neither fully self-contained
  // (Discussion) nor registry-only (Impact Analysis) — Simulation is the
  // one Capability whose entire job IS running a sub-composition.
  check('simulation-service.js DOES import composition/capability-composition-engine.js, organizational-object-registry.js, and capability-descriptor-registry.js', /composition\/capability-composition-engine\.js/.test(simSrc) && /organizational-object-registry\.js/.test(simSrc) && /capability-descriptor-registry\.js/.test(simSrc));

  // workspace-service.js reaches Simulation ONLY through the generic
  // executor registry, never by importing simulation-service.js directly.
  {
    const svcSrc = stripComments(read('js/v2/workspace/services/workspace-service.js'));
    check('workspace-service.js never imports simulation/simulation-service.js directly (only via capability-executor-registry.js)', !/simulation-service\.js/.test(svcSrc));
  }

  // No literal capabilityId branch anywhere in Workspace core, the shared
  // Capability engines, or Composition — re-confirms Parts 8/9/10's own
  // check still holds; Simulation's arrival required zero changes to any
  // of these 5 files.
  {
    const CAPABILITY_AWARE_FILES = [
      'js/v2/workspace/services/workspace-service.js',
      'js/v2/workspace/composition/capability-composition-engine.js',
      'js/v2/workspace/context/workspace-context-builder.js',
      'js/v2/workspace/suggestion/workspace-suggestion-engine.js',
      'js/v2/workspace/explainability/workspace-explainability-service.js',
    ];
    const CAPABILITY_BRANCH_RE = /capabilityId\s*===?\s*['"`]/g;
    const branches = [];
    for (const rel of CAPABILITY_AWARE_FILES) {
      const matches = stripComments(read(rel)).match(CAPABILITY_BRANCH_RE) || [];
      if (matches.length > 0) branches.push(`${rel}: ${matches.join(', ')}`);
    }
    check(`no Workspace core/shared-Capability/Composition file branches on a literal capabilityId value${branches.length ? ` — FOUND: ${branches.join(' | ')}` : ''}`, branches.length === 0);
  }

  // Dormancy: no UI wiring happened this sprint either.
  {
    const uiSrc = stripComments(read('js/v2/ui/review-workspace.js'));
    check('ui/review-workspace.js does not yet reference simulationCapabilityExecutor/simulateProposal (no UI wiring this sprint, as scoped)', !/simulationCapabilityExecutor|simulateProposal/.test(uiSrc));
  }

  // Behavioural smoke: Simulation works end-to-end for a synthetic
  // objectKind through composeCapabilities, with zero core-file change —
  // the same constant-cost onboarding proof every prior Capability sprint
  // established for its own Capability.
  try {
    const reg = await import('../js/v2/workspace/registry/organizational-object-registry.js');
    const cap = await import('../js/v2/workspace/registry/workspace-capability-registry.js');
    const ws = await import('../js/v2/workspace/services/workspace-service.js');
    const { makeCapabilityPipelineStep } = await import('../js/v2/workspace/contracts/capability-pipeline-step-contract.js');
    const { isSimulationReport } = await import('../js/v2/workspace/contracts/simulation-contract.js');

    const fakeAdapter = { objectKind: 'simulation-ownership-fake', getBlocks: () => [], getMetadata: (id) => (id === 'known' ? { objectId: id, domainType: 'simulation-ownership-fake' } : null), getHistory: () => [] };
    reg.registerOrganizationalObject(fakeAdapter);
    cap.registerCapabilityForObjectKind('simulation-ownership-fake', 'simulation');
    const opened = ws.openObject({ objectId: 'known', objectKind: 'simulation-ownership-fake', ownerId: 'evan' });
    const composed = ws.composeCapabilities(opened.data.workspaceId, [makeCapabilityPipelineStep({ capabilityId: 'simulation', action: 'simulate', payload: { proposal: {}, steps: [] } })]);
    check('Simulation works end-to-end for a synthetic objectKind, through composeCapabilities, with zero core-file/domain change', opened.ok === true && composed.ok === true && isSimulationReport(composed.steps[0].result.data));

    reg.resetOrganizationalObjectRegistry();
    cap.resetWorkspaceCapabilityRegistry();
  } catch (err) {
    check(`Simulation cross-object smoke test ran without throwing — FAILED: ${err && err.stack}`, false);
  }
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
