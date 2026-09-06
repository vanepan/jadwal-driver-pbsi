/* ============================================================
   intelligence-curation-check.cjs — Human Curation Workspace
   (V2, Phase 5.x.8)

   CJS test for the SERVER + STAGING + STATIC-SAFETY guarantees the Human
   Curation Workspace depends on. It does NOT re-test the Style Guide /
   Visual Template lifecycle in depth — scripts/intelligence-corpus-
   style-guide-check.cjs + scripts/intelligence-corpus-visual-template-
   check.cjs already do. It asserts ONLY what Phase 5.x.8 adds or relies on:

     1  SECURITY boundary the workspace runs behind (serverPermissions):
        unauthenticated / non-admin denied; role 'admin' allowed;
        adminEquivalent === true allowed; a missing / malformed token → denied
     2  the two callables the workspace calls (intelligenceStyleGuide /
        intelligenceVisualTemplate) still enforce auth / authz / op from the
        verified context: unauth → unauthenticated; non-admin →
        permission-denied; unknown op → invalid-argument
     3  SERVER OWNS AUTHORITY (§16, §29 SECURITY): a client-supplied
        approvedBy / approvedAt / authorityState / status on an `approve`
        call is ignored — approvedBy = the verified uid, authorityState is
        re-derived from status
     4  WIRING (Controlled Deployment Phase A): functions/index.js now
        requires + exports intelligenceStyleGuide / intelligenceVisualTemplate
        (deploy NOT run); the curation workspace itself still adds no Cloud
        Function
     5  DATABASE SAFETY (§33): the workspace added NO new database.rules.json
        node; the intelligence_* read nodes it needs
        (intelligence_style_guide / intelligence_visual_templates) are the
        Phase 5.x.5 / 5.x.6 STAGED blocks — server-only writer, effective-
        admin read
     6  STATIC SAFETY SCAN (§31) of every NEW Phase 5.x.8 file: zero OpenAI /
        RAG / embeddings / external HTTP / secret access; zero direct
        browser writes to authoritative nodes; zero V1 / NOR-generator / NOR
        Registry / Petty Cash / feature-flag coupling; zero automatic
        authority; the console VIEW imports ONLY the sanctioned wiring bridge
     7  the js/firebase.js client wrappers target the wired function names
        and add nothing else; the wiring bridge forwards the two ports and
        exposes createWiredIntelligenceCurationController

   Run:  node scripts/intelligence-curation-check.cjs   (exit 0 = pass)
   ============================================================ */

'use strict';

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: 'https://check-only.firebaseio.com', projectId: 'check-only' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'check-only';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── faithful in-memory fake of the Admin SDK RTDB surface (mirrors the
   style-guide .cjs) ────────────────────────────────────────────────── */
function makeFakeDb() {
  const root = {};
  const getAt = (p) => p.split('/').reduce((a, k) => (a == null ? undefined : a[k]), root);
  const setAt = (p, v) => {
    const parts = p.split('/'); let n = root;
    for (let i = 0; i < parts.length - 1; i += 1) { n[parts[i]] = n[parts[i]] || {}; n = n[parts[i]]; }
    n[parts[parts.length - 1]] = v;
  };
  const drop = (v) => {
    if (Array.isArray(v)) { const a = v.map(drop).filter((x) => x !== undefined); return a.length ? a : undefined; }
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { const d = drop(x); if (d !== undefined) o[k] = d; } return Object.keys(o).length ? o : undefined; }
    return v === undefined ? undefined : v;
  };
  const snap = (val) => ({ val: () => (val === undefined ? null : val), exists: () => val != null, forEach: (cb) => { if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) cb({ key: k, val: () => v }); } });
  function ref(p) {
    return {
      async once() { return snap(getAt(p)); },
      async set(v) { setAt(p, drop(v) === undefined ? null : drop(v)); },
    };
  }
  return { ref, _root: root };
}

const { canUseIntelligence, isEffectiveAdmin } = require('../functions/src/intelligence/serverPermissions');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceStyleGuide } = require('../functions/src/intelligence/intelligenceStyleGuide');
const { intelligenceVisualTemplate } = require('../functions/src/intelligence/intelligenceVisualTemplate');
const styleGuideStore = require('../functions/src/intelligence/styleGuideStore');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
  const asAdminEquiv = (uid) => ({ uid, token: { role: 'operator', adminEquivalent: true } });

  /* ── 1. the security boundary the workspace runs behind ───────────── */
  section('serverPermissions — the effective-admin boundary the workspace depends on (§17, §29)');
  {
    check(canUseIntelligence(undefined).ok === false, 'a missing token → denied (fail closed)');
    check(canUseIntelligence({}).ok === false, 'an empty token → denied');
    check(canUseIntelligence({ role: 'driver' }).ok === false, 'role "driver" → denied');
    check(canUseIntelligence({ role: 'admin' }).ok === true, 'role "admin" → allowed');
    check(canUseIntelligence({ adminEquivalent: true }).ok === true, 'adminEquivalent === true → allowed (existing admin-tier semantics)');
    check(canUseIntelligence({ role: 'operator', adminEquivalent: 1 }).ok === false, 'adminEquivalent must be strictly true — 1 does not authorize');
    check(isEffectiveAdmin({ role: 'admin' }) === true && isEffectiveAdmin({ adminEquivalent: true }) === true && isEffectiveAdmin({ role: 'x' }) === false, 'isEffectiveAdmin agrees');
  }

  /* ── 2. the two staged callables still enforce auth / authz / op ──── */
  section('intelligenceStyleGuide / intelligenceVisualTemplate — auth / authz / op (§29 SECURITY)');
  {
    for (const [name, fn, listOp] of [['style guide', intelligenceStyleGuide, 'list'], ['visual template', intelligenceVisualTemplate, 'list']]) {
      let t;
      t = null; try { await fn.run({ data: { op: listOp } }); } catch (e) { t = e; }
      check(t && t.code === 'unauthenticated', `${name}: no auth → unauthenticated`);
      t = null; try { await fn.run({ data: { op: listOp }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
      check(t && t.code === 'permission-denied', `${name}: non-admin → permission-denied`);
      t = null; try { await fn.run({ data: { op: 'totally-bogus' }, auth: asAdmin('a') }); } catch (e) { t = e; }
      check(t && t.code === 'invalid-argument', `${name}: unknown op → invalid-argument`);
      const okList = await fn.run({ data: { op: listOp }, auth: asAdmin('alice') });
      check(okList.ok && Array.isArray(okList.data), `${name}: admin list → ok, an array`);
      const okEquiv = await fn.run({ data: { op: listOp }, auth: asAdminEquiv('e') });
      check(okEquiv.ok, `${name}: adminEquivalent admin can read too`);
    }
  }

  /* ── 3. server owns the authority metadata on an approve ──────────── */
  section('approve — a client authority field is IGNORED; approvedBy = the verified uid (§16, §29)');
  {
    // seed a `proposed` rule directly (no Writing Memory builder needed) —
    // a hand-built WM entry is enough for styleGuideStore.proposeFromMemory.
    const memory = {
      memoryId: 'mem_curation_sec', category: 'recipient_convention', key: 'recipient_label',
      value: 'Yth.', normalizedValue: 'yth.', documentType: 'NOR',
      temporalStatus: 'current_evidence', conventionEra: 'current', confidence: 0.9,
      sourceObservationIds: ['o1', 'o2'], sourceDocumentIds: ['d1', 'd2', 'd3'],
      evidence: { occurrenceCount: 7, documentCount: 3, documentTypeDistribution: { NOR: 3 }, oldestSourceDate: '2026-01-01', latestSourceDate: '2026-03-01', recentDocumentCount: 3, historicalDocumentCount: 0, conflictingDocumentCount: 0, approvedRulePresent: false, approvedRuleMatches: false },
    };
    const prop = await styleGuideStore.proposeFromMemory(callableDb, { memory, actorId: 'alice', now: AT });
    check(prop.ok && prop.data.status === 'proposed', 'seed: a proposed rule exists');
    const ruleId = prop.data.ruleId;

    const res = await intelligenceStyleGuide.run({
      data: {
        op: 'approve', ruleId,
        rationale: 'Disetujui untuk konvensi NOR PBSI.',
        // hostile client authority injections — every one must be ignored
        approvedBy: 'HOSTILE-USER', approvedAt: '1999-01-01T00:00:00.000Z',
        authorityState: 'not_authoritative', status: 'proposed', version: 999, createdBy: 'HOSTILE',
      },
      auth: asAdmin('alice'),
    });
    check(res.ok && res.data.status === 'approved' && res.data.authorityState === 'authoritative', 'approve → status=approved, authorityState re-derived (client "not_authoritative" ignored)');
    check(res.data.approvedBy === 'alice' && res.data.approvedAt !== '1999-01-01T00:00:00.000Z', 'approvedBy = the verified uid; approvedAt = the server clock — client values ignored (§16)');
    check(res.data.rationale === 'Disetujui untuk konvensi NOR PBSI.', 'the human rationale is stored verbatim');
    check(res.data.auditTrail.some((e) => e.event === 'STYLE_RULE_APPROVED' && e.actorId === 'alice'), 'an audit event records the SERVER-derived actor (§24)');

    // read-only ops write nothing
    const before = JSON.stringify(callableDb._root);
    await intelligenceStyleGuide.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    await intelligenceStyleGuide.run({ data: { op: 'get', ruleId }, auth: asAdmin('alice') });
    await intelligenceStyleGuide.run({ data: { op: 'history', ruleId }, auth: asAdmin('alice') });
    check(JSON.stringify(callableDb._root) === before, 'list / get / history are byte-identical no-ops');
  }

  /* ── 4. WIRING — both production callable exports are now wired
        (Controlled Deployment Phase A); the curation workspace itself
        still adds NO Cloud Function ──────────────────────────────────── */
  section('functions/index.js — intelligenceStyleGuide + intelligenceVisualTemplate WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceStyleGuide['"]\)/.test(idx) && /exports\.intelligenceStyleGuide\s*=\s*intelligenceStyleGuide/.test(idx), 'functions/index.js requires + exports intelligenceStyleGuide (the store this workspace reads via its controller; deploy NOT run)');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceVisualTemplate['"]\)/.test(idx) && /exports\.intelligenceVisualTemplate\s*=\s*intelligenceVisualTemplate/.test(idx), 'functions/index.js requires + exports intelligenceVisualTemplate (the store this workspace reads via its controller; deploy NOT run)');
    check(!/curation|Curation/.test(idx), 'functions/index.js has NO curation-workspace export (this phase adds no Cloud Function)');
  }

  /* ── 5. DATABASE SAFETY — no new rules node for the workspace ─────── */
  section('database.rules.json — the workspace adds NO new node (§33)');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    check(!/intelligence_curation|human_curation|curation_workspace/i.test(rules), 'no intelligence_curation* / curation_workspace node was added');
    check(/"intelligence_style_guide"\s*:\s*\{[\s\S]*?"\.write"\s*:\s*"false"/.test(rules), 'the read node it needs — intelligence_style_guide — is server-only writer (Phase 5.x.5 STAGED block, reused verbatim)');
    check(/"intelligence_visual_templates"\s*:\s*\{[\s\S]*?"\.write"\s*:\s*"false"/.test(rules), 'the read node it needs — intelligence_visual_templates — is server-only writer (Phase 5.x.6 STAGED block, reused verbatim)');
    check(/"intelligence_style_guide"[\s\S]*?"\.read"\s*:\s*"auth != null && \(auth\.token\.role === 'admin' \|\| auth\.token\.role === 'developer' \|\| auth\.token\.adminEquivalent === true\)"/.test(rules), 'intelligence_style_guide .read is the effective-admin tier — the workspace never widens it');
  }

  /* ── 6. STATIC SAFETY SCAN of every NEW Phase 5.x.8 file ──────────── */
  section('static safety scan — the new Phase 5.x.8 files (§31)');
  {
    const NEW_FILES = [
      'src/intelligence/curation/contracts/curation-contract.js',
      'src/intelligence/curation/curation-view.js',
      'src/intelligence/console/curation-workspace-controller.js',
      'js/intelligence-curation-console.js',
    ];
    for (const f of NEW_FILES) {
      const blob = strip(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/sk-[A-Za-z0-9]{6}|OPENAI_API_KEY|api\.openai\.com|\bopenai\b|anthropic|process\.env\./i.test(blob), `${f}: no secret / model endpoint / env read`);
      check(!/embedding|vector\s*store|\brag\b|retrieveNorContext|generateNor|generateCompletion/i.test(blob), `${f}: no embeddings / RAG / NOR-generator coupling`);
      check(!/petty[_-]?cash|pettyCash|acquireReimbursementNumber|norRegistry|nor[_-]?registry|numbering/i.test(blob), `${f}: no Petty Cash / NOR Registry / numbering coupling`);
      check(!/feature_flags|setIntelligenceConfig|applyIntelligenceFeatureFlag/.test(blob), `${f}: never touches the feature flag`);
      check(!/promoteKnowledge|knowledge_repository|KnowledgeItem/.test(blob), `${f}: no KnowledgeItem promotion`);
      check(!/\bXMLHttpRequest\b|\bWebSocket\b/.test(blob), `${f}: no raw socket / XHR`);
    }
    // the three PURE modules must not touch DOM / storage / network / firebase
    for (const f of NEW_FILES.slice(0, 3)) {
      const blob = strip(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/\bdocument\.|\bwindow\.|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|from\s+['"][^'"]*firebase/.test(blob), `${f}: PURE — no DOM / storage / fetch / firebase import`);
    }
    // the CONTROLLER must never SET a server-owned authority field (the pure
    // view is allowed to READ record.approvedBy etc. for the History /
    // approval-metadata display — §7, §24 — so this check is controller-only).
    const ctlBlob = strip(fs.readFileSync(path.join(ROOT, 'src/intelligence/console/curation-workspace-controller.js'), 'utf8'))
      .replace(/\/\/[^\n]*/g, '');
    check(!/\bapprovedBy\b|\bapprovedAt\b|\bauthorityState\b|\brejectedBy\b|\bdeprecatedBy\b/.test(ctlBlob), 'the controller never names a server-owned authority field — it sends only { id, action, rationale, expectedVersion, acknowledgeConflict } (§16)');
    check(/ctx\.rationale\s*=\s*rationale/.test(ctlBlob) && /ctx\.reason\s*=\s*rationale/.test(ctlBlob) && /expectedVersion:\s*dec\.target/.test(ctlBlob), 'the controller sends only the human reason + the captured expectedVersion');

    // the DOM view: RTDB writes are impossible (it imports only the bridge)
    const viewBlob = strip(fs.readFileSync(path.join(ROOT, 'js/intelligence-curation-console.js'), 'utf8'));
    check(/from '\.\/intelligence-backend-wiring\.js'/.test(viewBlob) && !/from '\.\/firebase\.js'/.test(viewBlob), 'the console VIEW imports the sanctioned wiring bridge, NEVER js/firebase.js directly');
    check(!/from '\.\.\/src\/intelligence\//.test(viewBlob), 'the console VIEW never imports src/intelligence/ directly (only via the bridge)');
    check(!/firebase|getDatabase|httpsCallable|\.database\(|onValue\(|firestore/i.test(viewBlob), 'the console VIEW references NO Firebase / RTDB / Firestore API — a direct authoritative-node write is impossible');
    check(/mountIntelligenceCurationConsole/.test(viewBlob) && /_controller\.load\(\)/.test(viewBlob), 'mount performs ONE read (load)');
    check(!/onmount|autoApprove|auto_approve|\.approve\(\s*\)|\.reject\(\s*\)|\.deprecate\(\s*\)/i.test(viewBlob), 'the view never auto-fires a decision — approve / reject / deprecate happen only from an explicit click → beginDecision → confirmDecision');
  }

  /* ── 7. client wrappers + wiring bridge shape ─────────────────────── */
  section('js/firebase.js + js/intelligence-backend-wiring.js — staged wrappers + curation wiring (§27)');
  {
    const fb = fs.readFileSync(path.join(ROOT, 'js/firebase.js'), 'utf8');
    check(/httpsCallable\(firebaseFunctions,\s*'intelligenceStyleGuide'\)/.test(fb), 'callIntelligenceStyleGuide targets the STAGED function name "intelligenceStyleGuide"');
    check(/httpsCallable\(firebaseFunctions,\s*'intelligenceVisualTemplate'\)/.test(fb), 'callIntelligenceVisualTemplate targets the STAGED function name "intelligenceVisualTemplate"');
    // Phase 6A adds callIntelligenceNorGeneration (server-authoritative retrieval) — count bumped 5→6 deliberately.
    check((fb.match(/httpsCallable\(firebaseFunctions,\s*'intelligence/g) || []).length === 6, 'exactly 6 intelligence* httpsCallable wrappers (conversation, norDraft, norRegistry, styleGuide, visualTemplate, norGeneration) — nothing else added');

    const wb = strip(fs.readFileSync(path.join(ROOT, 'js/intelligence-backend-wiring.js'), 'utf8'));
    check(/callStyleGuide:\s*\(payload\)\s*=>\s*callIntelligenceStyleGuide/.test(wb) && /callVisualTemplate:\s*\(payload\)\s*=>\s*callIntelligenceVisualTemplate/.test(wb), 'the bridge forwards both ports into bootstrapIntelligenceClient');
    check(/export async function createWiredIntelligenceCurationController/.test(wb), 'the bridge exposes createWiredIntelligenceCurationController');
    check(/createCurationWorkspaceController\(\{[\s\S]*?styleGuide[\s\S]*?visualTemplate/.test(wb), 'it builds the controller over the { list,get,approve,reject,deprecate,history } store facades');
    check(!/proposeFromMemory|proposeFromEvidence|buildWritingMemory|retrieveNorContext/.test(wb.replace(/callIntelligence\w+/g, '')), 'the curation wiring never proposes / rebuilds Writing Memory / retrieves NOR context');
    check(!/api\.openai\.com|OPENAI_API_KEY|process\.env/.test(wb), 'no endpoint / key / env read in the bridge additions');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
