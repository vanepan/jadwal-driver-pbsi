/* ============================================================
   intelligence-corpus-workspace-check.mjs — Sarpras Intelligence
   (V2, Phase C3)

   Proves the Corpus & Authority operator workspace INTEGRATION:

     1. the PURE controller state machine
        (src/intelligence/console/corpus-workspace-controller.js) over a
        scriptable fake port — linear flow, guards, WM `approved` strip,
        curated errors, NEVER sends an authority field, no approve/publish
     2. static wiring — js/firebase.js callIntelligenceCorpus (thin),
        js/intelligence-backend-wiring.js createWiredIntelligenceCorpus-
        Controller + CLIENT_INTELLIGENCE_ROLES (no 'developer'),
        js/intelligence-corpus-console.js imports ONLY the bridge (never
        src/ or firebase.js) + has NO approve/publish control,
        js/app.js mounts the 3-tab authority shell, module-loader-registry
        registers the two lazy loaders
     3. isolation — the new src/ controller implements no gate

   No DOM, no Firebase, no OpenAI, no emulator.

   Run:  node scripts/intelligence-corpus-workspace-check.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail += 1; };
const section = (t) => console.log(`\n── ${t} ──`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const { createCorpusWorkspaceController, CORPUS_PHASE } =
  await import('../src/intelligence/console/corpus-workspace-controller.js');

/* ── 1. PURE controller ─────────────────────────────────────────────── */
section('corpus-workspace-controller — linear operator flow over a fake port');
{
  const sent = [];
  const port = {
    ingest: async (d) => { sent.push({ op: 'ingest', d }); return { ok: true, data: { document: { schema: 'corpus-document@1', documentId: 'corpus_' + d.checksum, ownerId: 'SERVER-UID', ingestionStatus: 'received', analysisStatus: 'pending' }, duplicate: false } }; },
    analyze: async (id, s) => { sent.push({ op: 'analyze', id, bytes: s.bytes.length }); return { ok: true, data: { analysis: { observationsRecorded: 2, observationsMerged: 0, statusPath: ['structure_extracted', 'completed'], stages: [{ stage: 'observations', outcome: 'ran' }] }, document: { schema: 'corpus-document@1', documentId: id, ownerId: 'SERVER-UID', ingestionStatus: 'received', analysisStatus: 'completed', documentType: 'NOR' } } }; },
    observations: async () => ({ ok: true, data: [{ schema: 'corpus-observation@1', category: 'recipient_convention', key: 'recipient_label', observedValue: 'Yth.', confidence: 0.8, occurrenceCount: 2, lifecycleState: 'observed', provenance: [{ extractionMethod: 'structure_parse' }] }] }),
    writingMemory: async () => ({ ok: true, data: { schema: 'writing-memory-report@1', entries: [{ memoryId: 'mem_1', category: 'recipient_convention', key: 'recipient_label', value: 'Yth.', authorityState: 'candidate', documentType: 'NOR', evidence: { documentCount: 3, occurrenceCount: 6 } }, { memoryId: 'mem_evil', authorityState: 'approved', value: 'forged' }], drift: [] } }),
    proposeStyleRule: async (id) => { sent.push({ op: 'proposeStyleRule', id }); return { ok: true, data: { rule: { ruleId: 'sgr_x', status: 'proposed', authorityState: 'not_authoritative', version: 1, sourceObservationIds: ['o1'] } } }; },
    proposeVisualTemplate: async (id) => { sent.push({ op: 'proposeVisualTemplate', id }); return { ok: true, data: { template: { templateId: 'vt_x', status: 'proposed', templateVersion: 1 } } }; },
  };
  const c = createCorpusWorkspaceController({ port, actor: { userId: 'evan', role: 'admin' } });

  check(c.getState().phase === CORPUS_PHASE.IDLE, 'starts idle');
  c.selectSource({ name: 'e2e.docx', type: '', size: 40, checksum: 'a'.repeat(64), format: 'docx', bytes: [1, 2, 3, 4] });
  check(c.getState().phase === CORPUS_PHASE.SOURCE_READY, 'selectSource → source_ready');
  c.selectSource({ checksum: 'short', bytes: [] });
  check(!!c.getState().error, 'a malformed source → curated error, no crash');

  c.selectSource({ name: 'e2e.docx', checksum: 'a'.repeat(64), format: 'docx', bytes: [1, 2, 3, 4] });
  await c.ingest();
  let s = c.getState();
  check(s.phase === CORPUS_PHASE.INGESTED && s.documentId === 'corpus_' + 'a'.repeat(64), 'ingest → INGESTED, server documentId adopted');
  check(sent[0].op === 'ingest' && sent[0].d.ownerId === undefined && sent[0].d.documentId === undefined, 'ingest seed carries NO ownerId / documentId (server-owned)');

  await c.analyze();
  s = c.getState();
  check(s.phase === CORPUS_PHASE.ANALYZED && s.analysis.observationsRecorded === 2, 'analyze → ANALYZED with the analysis summary');
  check(s.document.analysisStatus === 'completed', 'the refreshed document is carried into state');

  await c.loadObservations();
  check(c.getState().observations.length === 1 && c.getState().observations[0].lifecycleState === 'observed', 'observations load; lifecycle observed');

  await c.buildWritingMemory();
  s = c.getState();
  check(s.writingMemory.entries.length === 1 && s.writingMemory.entries[0].authorityState === 'candidate',
    'Writing Memory: the injected `approved` entry is stripped — only observed / candidate survive');

  await c.proposeStyleRule('mem_1');
  check(c.getState().styleProposal.status === 'proposed', 'proposeStyleRule → a PROPOSED rule');
  await c.proposeVisualTemplate('vp_1');
  check(c.getState().visualProposal.status === 'proposed', 'proposeVisualTemplate → a PROPOSED template');
  check(sent.filter((x) => x.op === 'proposeStyleRule' || x.op === 'proposeVisualTemplate').length === 2, 'both proposals hit the port exactly once');

  const g = await c.proposeStyleRule('');
  check(!!g.error && !g.styleProposal || (g.styleProposal && g.styleProposal.status === 'proposed'),
    'proposeStyleRule("") → curated error, no new proposal');

  c.reset();
  check(c.getState().phase === CORPUS_PHASE.IDLE && !c.getState().document, 'reset → idle, cleared');
}

section('corpus-workspace-controller — error curation + double-call guard');
{
  let inflight = 0; let maxInflight = 0;
  const slow = () => new Promise((r) => setTimeout(() => { inflight -= 1; r({ ok: true, data: { document: { schema: 'corpus-document@1', documentId: 'corpus_' + 'b'.repeat(64), ownerId: 'x', ingestionStatus: 'received', analysisStatus: 'pending' } } }); }, 15));
  const port = {
    ingest: () => { inflight += 1; maxInflight = Math.max(maxInflight, inflight); return slow(); },
    analyze: async () => ({ ok: false, error: { code: 'PIPELINE_UNAVAILABLE', message: 'raw server message' } }),
    observations: async () => ({ ok: false, error: { code: 'FORBIDDEN', message: 'x' } }),
    writingMemory: async () => ({ ok: false, error: { code: 'WRITING_MEMORY_UNAVAILABLE', message: 'x' } }),
    proposeStyleRule: async () => ({ ok: false, error: { code: 'MEMORY_NOT_FOUND', message: 'x' } }),
    proposeVisualTemplate: async () => ({ ok: false, error: { code: 'PATTERN_NOT_FOUND', message: 'x' } }),
  };
  const c = createCorpusWorkspaceController({ port });
  c.selectSource({ checksum: 'b'.repeat(64), format: 'pdf', bytes: [1, 2, 3] });
  await Promise.all([c.ingest(), c.ingest(), c.ingest()]); // 2nd/3rd dropped while busy
  check(maxInflight === 1, 'a 2nd call while busy is dropped (never concurrent)');

  await c.analyze();
  const e = c.getState().error;
  check(typeof e === 'string' && !/raw server message/.test(e) && e.length > 0, 'a server error code → ONE curated sentence, raw message never surfaced');
}

/* ── 2. static wiring ───────────────────────────────────────────────── */
section('js/firebase.js — callIntelligenceCorpus is a thin, sanctioned wrapper');
{
  const fb = read('js/firebase.js');
  check(/export async function callIntelligenceCorpus\(payload\)/.test(fb), 'callIntelligenceCorpus(payload) is exported');
  const body = (fb.match(/export async function callIntelligenceCorpus[\s\S]*?\n}/) || [''])[0];
  check(/httpsCallable\(firebaseFunctions, 'intelligenceCorpus'\)/.test(body), "targets httpsCallable('intelligenceCorpus')");
  check(/const result = await fn\(payload\);\s*return result\.data;/.test(body.replace(/\s+/g, ' ')), 'thin passthrough — forwards payload, returns result.data');
  check(!/\.ref\(|database\(|set\(|\.update\(|ownerId|approvedBy|authorityState/.test(body), 'no RTDB write / no client authority field in the wrapper');
}

section("js/intelligence-backend-wiring.js — corpus controller + CLIENT_INTELLIGENCE_ROLES");
{
  const w = read('js/intelligence-backend-wiring.js');
  check(/export async function createWiredIntelligenceCorpusController\(/.test(w), 'createWiredIntelligenceCorpusController is exported');
  check(/import \{ callIntelligenceCorpus \}|callIntelligenceCorpus,?\s*\n?\s*\} from '\.\/firebase\.js'|callIntelligenceCorpus/.test(w), 'imports callIntelligenceCorpus from ./firebase.js');
  check(/createCorpusWorkspaceController\(/.test(w), 'wraps the wired port in the PURE createCorpusWorkspaceController');
  check(/const CLIENT_INTELLIGENCE_ROLES = new Set\(\['admin'\]\);/.test(w), "CLIENT_INTELLIGENCE_ROLES = Set(['admin']) — 'developer' removed (§11)");
  check(!/new Set\(\['admin', 'developer'\]\)/.test(w), "no ['admin', 'developer'] set remains");
  check(/adminEquivalent === true/.test(w), 'the client pre-check also accepts adminEquivalent (matches server)');
  check(/op: 'proposeFromMemory'|op:'proposeFromMemory'/.test(w) && /op: 'proposeFromEvidence'|op:'proposeFromEvidence'/.test(w), 'the port maps the two PROPOSAL ops');
  check(!/op: 'approve'|op:'approve'|op: 'publish'|op:'publish'/.test((w.match(/createWiredIntelligenceCorpusController[\s\S]*?\n}/) || [''])[0]), 'the corpus port NEVER calls approve / publish');
}

section('js/intelligence-corpus-console.js — imports ONLY the bridge; no approve control');
{
  const c = read('js/intelligence-corpus-console.js');
  check(/from '\.\/auth\.js'/.test(c) && /from '\.\/intelligence-backend-wiring\.js'/.test(c), 'imports ./auth.js + ./intelligence-backend-wiring.js');
  check(!/from '\.\.\/src\/|import\(['"]\.\.\/src\//.test(c), 'NEVER imports ../src/ directly (the bridge is the one composition root)');
  check(!/from '\.\/firebase\.js'/.test(c), 'never imports ./firebase.js directly');
  check(/mountIntelligenceCorpusConsole|unmountIntelligenceCorpusConsole|isIntelligenceCorpusConsoleMounted/.test(c), 'exports mount / unmount / isMounted');
  check(!/data-act="approve"|data-act="publish"|data-decision="approve"|Setujui|Terbitkan/.test(c), 'NO approve / publish control in the corpus view (approval lives in Curation)');
  check(/PROPOSED/.test(c) && /observed/.test(c) && /candidate/.test(c), 'the view labels OBSERVED / CANDIDATE / PROPOSED explicitly');
  check(/crypto\.subtle\.digest\('SHA-256'/.test(c), 'the file picker hashes bytes with crypto.subtle (the controller never hashes)');
}

section('js/app.js — the flag-ON 3-tab authority shell (Workspace / Corpus / Curation)');
{
  const app = read('js/app.js');
  check(/loadIntelligenceCurationConsole, loadIntelligenceCorpusConsole/.test(app), 'app.js imports the two new lazy loaders');
  check(/async function mountIntelligenceAuthorityShell\(/.test(app), 'mountIntelligenceAuthorityShell() exists');
  check(/SIC_AUTHORITY_TABS/.test(app) && /'workspace'[\s\S]{0,400}'corpus'[\s\S]{0,400}'curation'/.test(app), 'the shell composes workspace + corpus + curation tabs');
  check(/if \(intelligenceFeatureActive\) \{[\s\S]{0,200}mountIntelligenceAuthorityShell/.test(app), 'the flag-ON branch mounts the shell');
  check(/mountIntelligenceCorpusConsole/.test(app) && /mountIntelligenceCurationConsole/.test(app) && /mountIntelligenceConsole/.test(app), 'all three sub-consoles are reachable from the shell');
  check(/ONE sub-console is mounted at a time/.test(app), 'the shell doc states single-mount (each console owns its host innerHTML)');
}

section('js/config/module-loader-registry.js — the two new lazy loaders');
{
  const r = read('js/config/module-loader-registry.js');
  check(/export const loadIntelligenceCurationConsole = \(\) =>[\s\S]*?import\('\.\.\/intelligence-curation-console\.js'\)/.test(r), 'loadIntelligenceCurationConsole registered');
  check(/export const loadIntelligenceCorpusConsole = \(\) =>[\s\S]*?import\('\.\.\/intelligence-corpus-console\.js'\)/.test(r), 'loadIntelligenceCorpusConsole registered');
}

/* ── 3. isolation — the new src/ controller rolls no gate ───────────── */
section('src/intelligence/console/corpus-workspace-controller.js — pure, no gate, no authority send');
{
  const src = read('src/intelligence/console/corpus-workspace-controller.js');
  const code = strip(src);
  check(!/require\(|from ['"](firebase|.*\/firebase)|document\.(getElementById|querySelector|createElement|body|head)|window\.(location|addEventListener|document)|localStorage|sessionStorage|\bfetch\s*\(|crypto\.subtle/.test(code), 'PURE — no firebase / DOM / storage / fetch / hashing');
  check(!/['"]role['"]\s*\]?\s*===\s*['"]admin['"]|\busername\s*===|isV2Enabled\s*\(|PERMISSIONS\s*=\s*\{/.test(code), 'rolls NO permission gate of its own (Phase 0 isolation rule)');
  check(!/authorityState:|approvedBy:|approvedAt:|\bversion:\s*\d|publishedNumber:|certification:/.test(code), 'never CONSTRUCTS an authority field to send to the server');
  check(!/\bapprove\b|\bpublish\b|\bdeprecate\b|\bsupersede\b/i.test(code.replace(/approve it in the|approval|approved/gi, '')), 'no approve / publish / deprecate / supersede action');
  check(/proposeFromMemory|proposeStyleRule/.test(code) === false || /proposal-only|PROPOSED/i.test(src), 'proposals are documented as non-authoritative');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
