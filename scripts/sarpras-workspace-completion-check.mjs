/* sarpras-workspace-completion-check.mjs — pure-Node structural checks for
   V2.0.18 Workspace Completion / RC1 readiness. No browser needed (the
   runtime rendering behaviour is covered by sarpras-workspace-dom-check.mjs).
   Run: node scripts/sarpras-workspace-completion-check.mjs   (exit 0 = pass) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isV2Enabled } from '../js/config/feature-gates.js';
import {
  mountSarprasIntelligence, setSarprasIntelligenceScreen, closeSarprasIntelligence,
} from '../js/v2/ui/sarpras-intelligence-center.js';
import { mountArchiveCenter, closeArchiveCenter } from '../js/v2/ui/archive-center.js';
import { mountKnowledgeCenter, closeKnowledgeCenter } from '../js/v2/ui/knowledge-center.js';
import { mountLearningDashboard, closeLearningDashboard } from '../js/v2/ui/learning-dashboard.js';
import { mountSarprasSettings, closeSarprasSettings } from '../js/v2/ui/sarpras-settings.js';
// nor-center.js is NOT statically imported here — it transitively imports
// js/firebase.js's CDN-hosted SDK (via petty-cash-store.js), which only a
// browser can resolve (same constraint documented in
// organizational-memory-harness.html). Its mount/close shape is checked by
// source text below; its real runtime behaviour is covered by
// sarpras-workspace-dom-check.mjs (a real browser).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[Sarpras Intelligence — RC1 structural completion checks]');

// ── Feature gate truth table ──────────────────────────────────────────
check('isV2Enabled: admin + evan -> true', isV2Enabled({ role: 'admin', username: 'evan' }) === true);
check('isV2Enabled: admin + other username -> false', isV2Enabled({ role: 'admin', username: 'someone-else' }) === false);
check('isV2Enabled: non-admin evan -> false', isV2Enabled({ role: 'driver', username: 'evan' }) === false);
check('isV2Enabled: null user -> false', isV2Enabled(null) === false);
check('isV2Enabled: undefined -> false', isV2Enabled(undefined) === false);

// ── Exported shape of each workspace module ───────────────────────────
check('sarpras-intelligence-center exports mount/setScreen/close', typeof mountSarprasIntelligence === 'function' && typeof setSarprasIntelligenceScreen === 'function' && typeof closeSarprasIntelligence === 'function');
check('archive-center exports exactly a mount/close pair', typeof mountArchiveCenter === 'function' && typeof closeArchiveCenter === 'function');
check('knowledge-center exports exactly a mount/close pair', typeof mountKnowledgeCenter === 'function' && typeof closeKnowledgeCenter === 'function');
check('learning-dashboard exports exactly a mount/close pair', typeof mountLearningDashboard === 'function' && typeof closeLearningDashboard === 'function');
check('sarpras-settings exports exactly a mount/close pair', typeof mountSarprasSettings === 'function' && typeof closeSarprasSettings === 'function');

const norCenterSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/nor-center.js'), 'utf8');
check('nor-center.js exports mountNorCenter', /export\s+(async\s+)?function\s+mountNorCenter/.test(norCenterSrc));
check('nor-center.js exports closeNorCenter', /export\s+function\s+closeNorCenter/.test(norCenterSrc));

// ── No "Coming Soon" / COMING_SOON symbol survives in the outer shell ──
const outerShellSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/sarpras-intelligence-center.js'), 'utf8');
check('outer shell has no COMING_SOON object', !/COMING_SOON/.test(outerShellSrc));
check('outer shell has no renderComingSoon function', !/renderComingSoon/.test(outerShellSrc));
// Experience Architecture phase — the RC1 "roadmap frozen" premise this
// assertion encoded is explicitly superseded by that mission: it adds
// 'settings' as a genuinely new, reviewed screen id (Part 2's 5th primary
// nav item). The other 5 ids are untouched (still real, still mountable —
// 'knowledge' just lost its primary nav BUTTON, not its screen id), so
// this still guards against silent/accidental SCREEN_IDS drift, just not
// against this one deliberate, authorized addition.
check('outer shell SCREEN_IDS is the 5 original ids plus the one authorized addition (settings)', /SCREEN_IDS = \['dashboard', 'nor', 'archive', 'knowledge', 'learning', 'settings'\]/.test(outerShellSrc));
// Sprint 1 (Autonomy Closure, Part 1) — the old static roadmap (a second,
// duplicated "which module is done" identity) is removed entirely, not
// just gated. Developer Mode's additive content is real diagnostics.
check('outer shell no longer defines the old ROADMAP/renderRoadmap (removed, not just gated)', !/const ROADMAP =/.test(outerShellSrc) && !/function renderRoadmap/.test(outerShellSrc));
check('outer shell Developer Mode renders real Technical Diagnostics instead', /function renderTechnicalDiagnostics/.test(outerShellSrc) && /computeTechnicalDiagnostics/.test(outerShellSrc));

// ── No literal "Coming Soon" / placeholder string survives anywhere new ──
// V2.1: nor-center.js and dataset-import-center.js added. nor-center.js's
// own header comment quotes its OLD, now-removed strings in past tense for
// documentation — those quotes are excluded before checking so the doc
// comment itself doesn't trip this assertion.
for (const file of ['js/v2/ui/archive-center.js', 'js/v2/ui/knowledge-center.js', 'js/v2/ui/learning-dashboard.js', 'js/v2/ui/dataset-import-center.js']) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  check(`${file} contains no literal "Coming Soon"`, !src.includes('Coming Soon') && !src.includes('segera hadir'));
}
{
  const norCenterFullSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/nor-center.js'), 'utf8');
  const norCenterBody = norCenterFullSrc.slice(norCenterFullSrc.indexOf('*/') + 2); // strip the header doc comment (which quotes old, removed strings)
  check('nor-center.js contains no literal "Coming Soon" outside its header doc comment', !norCenterBody.includes('Coming Soon') && !norCenterBody.includes('segera hadir'));
}

// ── Reuse discipline: the new files import from existing engines only,
//    never redefine a v2-module-placeholder-style stub ─────────────────
const archiveSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/archive-center.js'), 'utf8');
check('archive-center.js imports the organizational-memory barrel (reuse, not duplication)', archiveSrc.includes("from '../../../src/organizational-memory/index.js'"));
const knowledgeSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/knowledge-center.js'), 'utf8');
check('knowledge-center.js imports the knowledge services barrel (reuse, not duplication)', knowledgeSrc.includes("from '../knowledge/services/index.js'"));
const learningSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/learning-dashboard.js'), 'utf8');
check('learning-dashboard.js calls buildLearningMetrics(listCorrectionLog()) directly', /buildLearningMetrics\(listCorrectionLog\(\)\)/.test(learningSrc));

// ── V2.1 — Dataset Import Center reuse discipline: composes both layers,
//    never duplicates either one's engines ──────────────────────────────
const datasetImportSrc = fs.readFileSync(path.join(ROOT, 'js/v2/ui/dataset-import-center.js'), 'utf8');
check('dataset-import-center.js imports the organizational-memory barrel (reuse, not duplication)', datasetImportSrc.includes("from '../../../src/organizational-memory/index.js'"));
check('dataset-import-center.js imports the Import Session engine (reuse, not duplication)', datasetImportSrc.includes("from '../knowledge/datasets/import-session/import-session-engine.js'"));
check('archive-center.js embeds the SAME Dataset Import Center controller (no second upload mechanism)', archiveSrc.includes("from './dataset-import-center.js'"));
const norCenterSrc2 = fs.readFileSync(path.join(ROOT, 'js/v2/ui/nor-center.js'), 'utf8');
check('nor-center.js embeds the SAME Dataset Import Center controller (no second upload mechanism)', norCenterSrc2.includes("from './dataset-import-center.js'"));
check('nor-center.js SECTIONS includes a "profiles" tab', /\{\s*id:\s*'profiles'/.test(norCenterSrc2));

// ── V2.1 Phase F — Backend Readiness audit, codified as permanent checks ──
// V2.1.2: activation moved from nor-center.js to sarpras-intelligence-
// center.js's own mount (the true single entry point both Archive Center
// and NOR Center sit behind — Archive Center needs the same activation
// without ever visiting NOR Center).
check('setActiveRepository(\'memory\') is activated at exactly ONE site across js/v2/ui/ (sarpras-intelligence-center.js\'s mount)', (() => {
  const uiDir = path.join(ROOT, 'js/v2/ui');
  const files = fs.readdirSync(uiDir).filter((f) => f.endsWith('.js'));
  const hits = files.filter((f) => fs.readFileSync(path.join(uiDir, f), 'utf8').includes("setActiveRepository('memory')"));
  return hits.length === 1 && hits[0] === 'sarpras-intelligence-center.js';
})());
check('nor-center.js no longer activates the repository itself (moved to the outer shell)', !norCenterSrc2.includes("setActiveRepository('memory')"));
check('sarpras-intelligence-center.js calls all three V2.1.2 persistence sync functions on mount', (() => {
  const src = fs.readFileSync(path.join(ROOT, 'js/v2/ui/sarpras-intelligence-center.js'), 'utf8');
  return src.includes('initImportSessionSync()') && src.includes('initImportBatchSync()') && src.includes('initFileStorageSync()');
})());

const fileStorageDir = path.join(ROOT, 'src/file-storage');
function allJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? allJsFiles(full) : (entry.name.endsWith('.js') ? [full] : []);
  });
}
check('src/file-storage/ never imports knowledge/ or organizational-memory/ (leaf module, both depend on it, never the reverse)', allJsFiles(fileStorageDir).every((f) => {
  const src = fs.readFileSync(f, 'utf8');
  return !src.split('\n').some((line) => /^\s*import\b.*(\.\.\/knowledge\/|\.\.\/organizational-memory\/)/.test(line));
}));

const metadataInferenceSrc = fs.readFileSync(path.join(ROOT, 'js/v2/knowledge/datasets/import-session/metadata-inference-engine.js'), 'utf8');
check('metadata-inference-engine.js has no organizational-memory import statement (stays knowledge-layer-pure)', !metadataInferenceSrc.split('\n').some((line) => /^\s*import\b.*organizational-memory/.test(line)));

check('dataset-import-center.js lazily imports file-storage-engine.js (never eager Firebase load on mount)', /await import\(['"]\.\.\/\.\.\/\.\.\/src\/file-storage\/file-storage-engine\.js['"]\)/.test(datasetImportSrc)
  && !datasetImportSrc.split('\n').some((line) => /^\s*import\b.*file-storage-engine/.test(line)));

check('dataset-import-center.js\'s hash fallback prefers real sha256 over the old FNV-1a proxy (s.sha256 || s.documentHash || computeDocumentHash)', datasetImportSrc.includes('s.sha256 || s.documentHash || computeDocumentHash'));

// ── Circular-dependency guard: none of the 5 workspace/controller files
//    import a sibling (dataset-import-center.js is intentionally embedded
//    by two workspace files, so it is checked separately: it must never
//    import one of them back) ────────────────────────────────────────────
const workspaceFiles = ['archive-center.js', 'knowledge-center.js', 'learning-dashboard.js', 'nor-center.js'];
for (const file of workspaceFiles) {
  const src = fs.readFileSync(path.join(ROOT, `js/v2/ui/${file}`), 'utf8');
  const importsSibling = workspaceFiles.some((other) => other !== file && src.includes(`./${other}`));
  check(`${file} does not import a sibling workspace file (no circular dep)`, !importsSibling);
}
check('dataset-import-center.js does not import any of the 4 workspace files back (no circular dep)', !workspaceFiles.some((f) => datasetImportSrc.includes(`./${f}`)));

// ── Sprint 1 (Autonomy Closure) — structural verification of the Part
//    3/10 live-listener widening. These fixes can't be exercised live in
//    sarpras-workspace-dom-check.mjs's harness without a genuine remote
//    RTDB snapshot (import-session-repository.js's own header: its change
//    listeners are deliberately remote-snapshot-only, never fired by a
//    local write) — verified here as source-text assertions instead. ────
check('archive-center.js no longer gates its live re-render on which internal tab is active', !/st\.section === 'dashboard' \|\| st\.section === 'import'\) render\(\)/.test(archiveSrc));
check('archive-center.js registers its live listeners with a coalesced scheduleLiveRender (matches knowledge-center.js/learning-dashboard.js\'s idiom)', /scheduleLiveRender/.test(archiveSrc));
check('nor-center.js no longer gates its live re-render on st.section === \'archive\'', !/st\.section === 'archive'\) render\(\)/.test(norCenterSrc2));
check('nor-center.js registers its live listeners with a coalesced scheduleLiveRender', /scheduleLiveRender/.test(norCenterSrc2));
check('sarpras-intelligence-center.js registers all 3 live-update listeners for its own Executive Briefing', outerShellSrc.includes('registerImportSessionChangeListener(scheduleRender)') && outerShellSrc.includes('registerImportBatchChangeListener(scheduleRender)') && outerShellSrc.includes('registerRepositoryListener(scheduleRender)'));

// ── Phase 2.6 (Pipeline State Machine & Autonomous Completion Hardening) —
//    the three assertions that stood here asserted the PRESENCE of code this
//    milestone deliberately deleted: the KNOWLEDGE_IMPORT_STALLED and
//    BATCH_CANCELLED review reasons, and the dic-import cascade retry. Each
//    was a workaround for a defect that has now been fixed at its source:
//
//      KNOWLEDGE_IMPORT_STALLED  surfaced a cascade that failed because the
//        DatasetSpec had not survived a refresh — the spec now self-heals, so
//        the cascade does not fail, so there is no stall to surface.
//      BATCH_CANCELLED           made a cancelled batch's sessions VISIBLE in
//        the attention queue because cancelBatch() never actually cancelled
//        them — they are now really Cancelled (terminal), so there is nothing
//        to flag.
//      dic-import                was the "press this to continue the pipeline"
//        button, which is the redundant approval Part 4 removed outright.
//
//    They are replaced by assertions that the REPLACEMENT architecture is
//    present and has not been accidentally reverted. Behavioural coverage
//    lives in pipeline-state-machine-check.mjs and dataset-import-center-check.mjs.
check('the pipeline scheduler exists — the ONE driver of the Import Session lifecycle', fs.existsSync(path.join(ROOT, 'js/v2/knowledge/datasets/import-session/pipeline-scheduler.js')));
check('dataset-import-center.js hands the lifecycle to the scheduler (advanceSession), not a hand-rolled cascade', datasetImportSrc.includes('advanceSession(sessionId)') && !datasetImportSrc.includes('export function cascadeFromApproved'));
check('dataset-import-center.js injects the real archiver across the knowledge/ -> organizational-memory/ seam', /registerArchiver\(doArchive\)/.test(datasetImportSrc));
check('Part 4 — NO redundant approval actions remain (dic-approve / dic-import / dic-archive / dic-submit)', !datasetImportSrc.includes('data-act="dic-approve"') && !datasetImportSrc.includes('data-act="dic-import"') && !datasetImportSrc.includes('data-act="dic-archive"') && !datasetImportSrc.includes('data-act="dic-submit"'));
check('Part 1 — the worker loop obeys the PERSISTED batch status, not only a local flag', /function batchCancelled/.test(datasetImportSrc) && datasetImportSrc.includes('cancelImportBatch'));
check('Part 5 — the mount runs the resumption sweep, so a refresh never orphans a session', outerShellSrc.includes('sweepPipeline'));
{
  const schedulerSrc = fs.readFileSync(path.join(ROOT, 'js/v2/knowledge/datasets/import-session/pipeline-scheduler.js'), 'utf8');
  // Strip BOTH block and line comments — the layering rule is about real
  // `import` statements, and the scheduler legitimately *discusses* the rule
  // (and the layer it may not touch) at length in its prose.
  const schedulerCode = schedulerSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the scheduler honours the one-way layering rule (never imports organizational-memory/)', !/organizational-memory/.test(schedulerCode));
  check('the scheduler bounds its automatic retries, so "retry forever" can never masquerade as a terminal state', /MAX_PIPELINE_ATTEMPTS/.test(schedulerSrc));
}

// ── Sprint 1 (Autonomy Closure) — Part 5/8 additive UI, Part 4 timeout ──
check('dataset-import-center.js has the always-visible Live Operation View (Part 5)', /function renderOperationalOverview/.test(datasetImportSrc) && datasetImportSrc.includes('Ringkasan Operasional'));
check('dataset-import-center.js has the Developer-Mode-only Pipeline Self-Diagnostics section (Part 8)', datasetImportSrc.includes('Diagnostik Pipeline (Developer Mode)'));
{
  const retrySrc = fs.readFileSync(path.join(ROOT, 'src/file-storage/retry-with-backoff.js'), 'utf8');
  check('retry-with-backoff.js exports withTimeout (Part 4 — bounds a hanging upload attempt)', /export function withTimeout/.test(retrySrc));
  const fileStorageEngineSrc = fs.readFileSync(path.join(ROOT, 'src/file-storage/file-storage-engine.js'), 'utf8');
  check('file-storage-engine.js\'s uploadFile() wraps the real Storage call in withTimeout', /withTimeout\(\s*\n?\s*uploadFileToStorage/.test(fileStorageEngineSrc));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exitCode = 1;
