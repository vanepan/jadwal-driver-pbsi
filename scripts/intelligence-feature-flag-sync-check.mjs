/* ============================================================
   intelligence-feature-flag-sync-check.mjs — Sarpras Intelligence (V2, Phase 3A)

   PURE node test. Proves the CLIENT feature-flag synchronisation:

     • resolveIntelligenceFlag() is FAIL-CLOSED — ONLY the boolean `true`
       at /feature_flags/intelligence/enabled resolves ON; every other
       shape (missing node, missing branch, missing key, false, "true", 1,
       null, undefined, {}, [], a read that never happened) resolves OFF
     • applyIntelligenceFeatureFlag() persists the resolved value into the
       real Intelligence config (setIntelligenceConfig({ enabled }))
     • bootstrapIntelligenceClient({ featureFlags }) drives PROVIDER
       SELECTION from the resolved flag: ON ⇒ 'openai' ACTIVE, OFF ⇒ 'null'
       ACTIVE — and a re-run after a flag flip self-corrects
     • initialisation ORDER: flag resolve+persist happens BEFORE provider
       selection (auth → flag read → config updated → bootstrap → provider)
     • OpenAI SAFETY (PART 9): even with enabled=true, bootstrap makes ZERO
       calls through the stubbed callModel port — it only registers + selects
     • V1 SAFETY: src/intelligence/config/feature-flag-sync.js is pure — no
       fetch / firebase / window / document / storage, and it NEVER writes
       the flag (no .set(/.update(/storeFirebaseData/'feature_flags' write)

   Cases A–I map to the Phase 3A spec table.

   Run:  node scripts/intelligence-feature-flag-sync-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const flagSync = await import('../src/intelligence/config/feature-flag-sync.js');
const cfg = await import('../src/intelligence/config/intelligence-config.js');
const registry = await import('../src/intelligence/provider-registry.js');
const store = await import('../src/intelligence/conversation/intelligence-conversation-store.js');
const { bootstrapIntelligenceClient } = await import('../src/intelligence/client-bootstrap.js');

const { resolveIntelligenceFlag, applyIntelligenceFeatureFlag, isIntelligenceFlagValueOn } = flagSync;

/* ════════════════════════════════════════════════════════════════════════ */

section('resolveIntelligenceFlag — fail-closed truth table (Cases A–I)');

// Case A — /feature_flags node absent entirely (loadFeatureFlags never got a read)
check(resolveIntelligenceFlag(undefined) === false, 'A: no /feature_flags node (undefined)            → OFF');
check(resolveIntelligenceFlag(null) === false,      'A: no /feature_flags node (null)                 → OFF');
// Case B — /feature_flags present, no `intelligence` branch
check(resolveIntelligenceFlag({ visualShellV2: true }) === false, 'B: /feature_flags without an intelligence branch  → OFF');
check(resolveIntelligenceFlag({ intelligence: null }) === false,  'B: intelligence branch is null                   → OFF');
check(resolveIntelligenceFlag({ intelligence: 'true' }) === false,'B: intelligence branch is a string              → OFF');
// Case C — intelligence branch present, no `enabled` key
check(resolveIntelligenceFlag({ intelligence: {} }) === false,               'C: intelligence branch without an enabled key    → OFF');
check(resolveIntelligenceFlag({ intelligence: { other: true } }) === false,  'C: intelligence branch, unrelated keys only      → OFF');
// Case D — enabled: false
check(resolveIntelligenceFlag({ intelligence: { enabled: false } }) === false, 'D: enabled === false                            → OFF');
// Case E — enabled: "true" (string, NOT boolean)
check(resolveIntelligenceFlag({ intelligence: { enabled: 'true' } }) === false, 'E: enabled === "true" (string)                 → OFF');
check(resolveIntelligenceFlag({ intelligence: { enabled: 'false' } }) === false,'E: enabled === "false" (string)                → OFF');
// Case F — enabled: 1 (number)
check(resolveIntelligenceFlag({ intelligence: { enabled: 1 } }) === false, 'F: enabled === 1 (number)                       → OFF');
check(resolveIntelligenceFlag({ intelligence: { enabled: 0 } }) === false, 'F: enabled === 0 (number)                       → OFF');
// Case G — enabled: true (strict boolean) — the ONLY ON case
check(resolveIntelligenceFlag({ intelligence: { enabled: true } }) === true, 'G: enabled === true (strict boolean)           → ON');
// Case H — enabled: null / undefined
check(resolveIntelligenceFlag({ intelligence: { enabled: null } }) === false,      'H: enabled === null                     → OFF');
check(resolveIntelligenceFlag({ intelligence: { enabled: undefined } }) === false, 'H: enabled === undefined                → OFF');
// Case I — a read that failed → js/app.js#loadFeatureFlags() returns {} (or the node stays undefined)
check(resolveIntelligenceFlag({}) === false, 'I: RTDB read failed → loadFeatureFlags() returned {}  → OFF');
// extra hardening — arrays and odd truthy shapes
check(resolveIntelligenceFlag([]) === false, 'array as /feature_flags node                     → OFF');
check(resolveIntelligenceFlag({ intelligence: [] }) === false, 'array as intelligence branch                     → OFF');
check(resolveIntelligenceFlag({ intelligence: { enabled: {} } }) === false, 'enabled is an object                       → OFF');
check(resolveIntelligenceFlag('true') === false, 'a bare string passed in                          → OFF');
check(resolveIntelligenceFlag(1) === false, 'a bare number passed in                          → OFF');

section('resolveIntelligenceFlag — always returns a strict boolean');
for (const v of [undefined, null, {}, [], { intelligence: { enabled: true } }, { intelligence: { enabled: 'true' } }, { intelligence: { enabled: 1 } }]) {
  check(typeof resolveIntelligenceFlag(v) === 'boolean', `typeof result is 'boolean' for ${JSON.stringify(v)}`);
}
check(isIntelligenceFlagValueOn(true) === true, 'isIntelligenceFlagValueOn(true) === true');
check([false, 'true', 1, 0, null, undefined, {}, ''].every((v) => isIntelligenceFlagValueOn(v) === false), 'isIntelligenceFlagValueOn is false for every non-true value');

section('applyIntelligenceFeatureFlag — persists the resolved value into the config');
cfg.resetIntelligenceConfig();
check(cfg.isIntelligenceEnabled() === false, 'baseline: the config default is OFF');
let applied = applyIntelligenceFeatureFlag({ intelligence: { enabled: 'true' } });
check(applied === false && cfg.getIntelligenceConfig().enabled === false, 'invalid value ("true") → config stays OFF, returns false');
applied = applyIntelligenceFeatureFlag({ intelligence: { enabled: true } });
check(applied === true && cfg.getIntelligenceConfig().enabled === true, 'strict true → config flips ON, returns true');
applied = applyIntelligenceFeatureFlag({ intelligence: { enabled: false } });
check(applied === false && cfg.getIntelligenceConfig().enabled === false, 'back to false → config flips OFF again (idempotent, both directions)');
applied = applyIntelligenceFeatureFlag(undefined);
check(applied === false && cfg.getIntelligenceConfig().enabled === false, 'undefined node → config explicitly set OFF (known state, not left stale)');

/* ── provider selection is driven by the resolved flag ──────────────────── */

function freshBootstrap(featureFlags) {
  store.resetIcStore();
  registry.resetRegistry();
  cfg.resetIntelligenceConfig();
  modelCalls = 0;
  return bootstrapIntelligenceClient({ callConversation, callModel, featureFlags });
}
const callConversation = async () => ({ ok: true, data: null, error: null });
let modelCalls = 0;
const callModel = async () => { modelCalls += 1; return { schema: 'model-completion@1', ok: true, text: '', usage: {}, model: 'stub', durationMs: 0, error: null }; };

section('bootstrapIntelligenceClient — provider selection follows the resolved flag');
let s = freshBootstrap({ intelligence: { enabled: true } });
check(s.ok === true && s.featureEnabled === true && s.activeProvider === 'openai', 'G (enabled:true)  → OpenAI provider ACTIVE');
check(cfg.getIntelligenceConfig().enabled === true, 'G → the config flag was persisted ON as part of bootstrap');

for (const [label, node] of [
  ['A  no /feature_flags node (undefined)', undefined],
  ['A  /feature_flags without intelligence branch', { visualShellV2: true, domainShellV1: true }],
  ['B  intelligence branch is null', { intelligence: null }],
  ['C  intelligence branch, no enabled key', { intelligence: {} }],
  ['D  enabled: false', { intelligence: { enabled: false } }],
  ['E  enabled: "true" (string)', { intelligence: { enabled: 'true' } }],
  ['F  enabled: 1 (number)', { intelligence: { enabled: 1 } }],
  ['H  enabled: null', { intelligence: { enabled: null } }],
  ['I  RTDB read failed → {}', {}],
]) {
  s = freshBootstrap(node);
  check(s.ok === true && s.featureEnabled === false && s.activeProvider === 'null', `${label.padEnd(44)} → Null Provider ACTIVE (never fail-open)`);
}
// a concrete OFF object path also leaves the config explicitly OFF
freshBootstrap({ intelligence: { enabled: false } });
check(cfg.getIntelligenceConfig().enabled === false, 'D → the config flag is persisted OFF as part of bootstrap');

section('bootstrapIntelligenceClient — a re-run after a flag flip self-corrects');
store.resetIcStore(); registry.resetRegistry(); cfg.resetIntelligenceConfig(); modelCalls = 0;
const on1 = bootstrapIntelligenceClient({ callConversation, callModel, featureFlags: { intelligence: { enabled: true } } });
check(on1.activeProvider === 'openai', 'first run, flag ON  → openai ACTIVE');
const off2 = bootstrapIntelligenceClient({ callConversation, callModel, featureFlags: { intelligence: { enabled: false } } });
check(off2.activeProvider === 'null', 'second run, flag now OFF → provider RETURNS to null (no stale OpenAI selection)');
const on3 = bootstrapIntelligenceClient({ callConversation, callModel, featureFlags: { intelligence: { enabled: true } } });
check(on3.activeProvider === 'openai', 'third run, flag ON again → openai ACTIVE again');

section('OpenAI safety (PART 9) — flag ON never triggers a model call from bootstrap');
freshBootstrap({ intelligence: { enabled: true } });
check(modelCalls === 0, 'even with enabled:true, bootstrap made ZERO calls through the stubbed callModel port');
// the resolver + apply path, exercised many times, also never calls a transport
for (let i = 0; i < 25; i += 1) {
  applyIntelligenceFeatureFlag({ intelligence: { enabled: i % 2 === 0 } });
  resolveIntelligenceFlag({ intelligence: { enabled: true } });
}
check(modelCalls === 0, '25 resolve/apply cycles → still ZERO model calls (pure, no OpenAI request)');

section('bootstrapIntelligenceClient — the pre-resolved `enabled` seam still wins over featureFlags');
store.resetIcStore(); registry.resetRegistry(); cfg.resetIntelligenceConfig();
const forced = bootstrapIntelligenceClient({ callConversation, callModel, featureFlags: { intelligence: { enabled: true } }, enabled: false });
check(forced.featureEnabled === false && forced.activeProvider === 'null', 'enabled:false overrides featureFlags{enabled:true} (test seam precedence)');

section('Static — feature-flag-sync.js is pure and never WRITES the flag (V1 safety, PART 13)');
const SRC = path.join(ROOT, 'src/intelligence/config/feature-flag-sync.js');
const raw = fs.readFileSync(SRC, 'utf8');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|from\s+['"][^'"]*firebase|storeFirebaseData|\blocalStorage\.|\bsessionStorage\.|\bdocument\.|\bwindow\./.test(code), 'no network / firebase / storage / DOM / window access');
check(!/\.set\s*\(|\.update\s*\(|\.push\s*\(|['"]feature_flags['"]/.test(code), 'no RTDB write and no literal "feature_flags" path — it only RESOLVES a value handed in');
check(/from '\.\/intelligence-config\.js'/.test(code) && /setIntelligenceConfig\(\s*\{\s*enabled\s*\}\s*\)/.test(code), "it feeds the resolved boolean into setIntelligenceConfig({ enabled }) — no second config system");
check(/rawValue === true/.test(code), 'the strict leaf test is literally `rawValue === true` (fail-closed)');

section('Static — the config resolve/persist runs BEFORE provider selection in client-bootstrap.js');
const bootSrc = fs.readFileSync(path.join(ROOT, 'src/intelligence/client-bootstrap.js'), 'utf8');
const applyIdx = bootSrc.indexOf('applyIntelligenceFeatureFlag(featureFlags)');
const selectIdx = bootSrc.indexOf('setActiveProvider(');
check(applyIdx > 0 && selectIdx > applyIdx, 'applyIntelligenceFeatureFlag() appears before the first setActiveProvider() (init order: config updated → provider selection)');
check(/else setActiveProvider\(DEFAULT_PROVIDER_ID\)/.test(bootSrc), 'flag OFF explicitly (re)activates the Null Provider — no fail-open, no stale selection');
check(!/setIntelligenceConfig\(\s*\{\s*enabled:\s*true/.test(bootSrc), 'client-bootstrap.js never hard-codes enabled:true');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
