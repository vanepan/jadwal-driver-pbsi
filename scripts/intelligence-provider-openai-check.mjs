/* ============================================================
   intelligence-provider-openai-check.mjs — Sarpras Intelligence (V2, Phase 1)

   PURE node test. Proves the OpenAI ESM provider boundary (PART 3, PART 4):

     • satisfies the Phase 0 provider contract (id/version/generate) + adds complete()
     • registers as 'openai' and can be made the active provider
     • NO callModel port → typed NOT_CONFIGURED, never a throw
     • model boundary error → passed through as a typed ModelCompletionResult
     • model boundary THROWS → normalised to NETWORK, never propagated
     • malformed boundary output → INVALID_OUTPUT
     • prompt over the char ceiling → INVALID_REQUEST (no unbounded context)
     • generate() is NOT the entry point → typed pointer, never a real generation
     • no secret / endpoint / SDK anywhere in the ESM provider source

   Run:  node scripts/intelligence-provider-openai-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import { createOpenAiProvider, OPENAI_PROVIDER_ID } from '../src/intelligence/providers/openai-provider.js';
import { isIntelligenceProvider, PROVIDER_CONTRACT } from '../src/intelligence/contracts/provider-contract.js';
import {
  makeModelCompletionRequest, MESSAGE_ROLE, MODEL_COMPLETION_ERRORS,
  modelCompletionResult, modelCompletionError, isModelCompletionResult,
} from '../src/intelligence/providers/model-completion-contract.js';
import {
  registerProvider, getProvider, setActiveProvider, getActiveProviderId, resetRegistry,
} from '../src/intelligence/provider-registry.js';
import { nullProvider } from '../src/intelligence/providers/null-provider.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const req = (opts = {}) => makeModelCompletionRequest({
  requestId: 'r1', purpose: 'nor.draft',
  messages: [{ role: MESSAGE_ROLE.SYSTEM, content: 'sys' }, { role: MESSAGE_ROLE.USER, content: 'hi' }],
  ...opts,
});

/* ════════════════════════════════════════════════════════════════════════ */

section('Model completion envelope');
check(makeModelCompletionRequest({ requestId: 'r', messages: [{ role: 'user', content: 'x' }] }).schema === 'model-completion@1', 'ModelCompletionRequest schema');
check(isModelCompletionResult(modelCompletionResult({ text: 'ok' })), 'modelCompletionResult(ok) is well-formed');
check(isModelCompletionResult(modelCompletionError('X', 'y')), 'modelCompletionError is well-formed');
check(!isModelCompletionResult({ schema: 'model-completion@1', ok: true }), 'an ok result with no text is rejected');

section('Provider contract + registry');
const okProvider = createOpenAiProvider({ callModel: async () => modelCompletionResult({ text: 'Badan surat.', usage: { inputTokens: 3, outputTokens: 7 }, model: 'gpt-4o-mini' }) });
check(isIntelligenceProvider(okProvider), 'openai provider satisfies isIntelligenceProvider()');
check(PROVIDER_CONTRACT.provider.every((k) => k in okProvider), 'exposes every Phase 0 contract field');
check(typeof okProvider.complete === 'function', 'adds the Phase 1 complete() capability');
check(okProvider.id === OPENAI_PROVIDER_ID && okProvider.id === 'openai', "provider id is 'openai'");
resetRegistry();
registerProvider(okProvider);
check(getProvider('openai') === okProvider, 'registers into the Phase 0 provider registry');
setActiveProvider('openai');
check(getActiveProviderId() === 'openai', 'can be made the active provider');
resetRegistry();
check(getActiveProviderId() === 'null' && getProvider('openai') === null, 'resetRegistry() restores the Null default');

section('complete() — success path');
{
  const r = await okProvider.complete(req());
  check(r.ok === true && r.text === 'Badan surat.' && r.model === 'gpt-4o-mini', 'a working boundary returns its ModelCompletionResult verbatim');
}

section('complete() — no callModel port ⇒ NOT_CONFIGURED, no throw');
{
  const p = createOpenAiProvider({});
  const r = await p.complete(req());
  check(r.ok === false && r.error.code === MODEL_COMPLETION_ERRORS.NOT_CONFIGURED, 'missing port → typed NOT_CONFIGURED');
}

section('complete() — boundary returns a typed error ⇒ passed through');
{
  const p = createOpenAiProvider({ callModel: async () => modelCompletionError(MODEL_COMPLETION_ERRORS.AUTH, 'HTTP 401') });
  const r = await p.complete(req());
  check(r.ok === false && r.error.code === 'AUTH', 'an AUTH failure from the boundary reaches the caller unchanged');
  check(!/sk-|Bearer|api_key/i.test(JSON.stringify(r)), 'the error result carries no secret');
}

section('complete() — boundary THROWS ⇒ normalised to NETWORK, never propagated');
{
  const p = createOpenAiProvider({ callModel: async () => { throw new Error('socket hang up'); } });
  let threw = false;
  let r;
  try { r = await p.complete(req()); } catch { threw = true; }
  check(!threw && r.ok === false && r.error.code === MODEL_COMPLETION_ERRORS.NETWORK, 'a thrown transport error becomes a NETWORK result (no exception escapes)');
}

section('complete() — malformed boundary output ⇒ INVALID_OUTPUT');
{
  const p = createOpenAiProvider({ callModel: async () => ({ not: 'a result' }) });
  const r = await p.complete(req());
  check(r.ok === false && r.error.code === MODEL_COMPLETION_ERRORS.INVALID_OUTPUT, 'a non-ModelCompletionResult reply → INVALID_OUTPUT');
}

section('complete() — prompt over the ceiling ⇒ INVALID_REQUEST (PART 13)');
{
  const p = createOpenAiProvider({ callModel: async () => modelCompletionResult({ text: 'x' }), config: { maxPromptChars: 50 } });
  const big = req({ messages: [{ role: MESSAGE_ROLE.USER, content: 'x'.repeat(200) }] });
  const r = await p.complete(big);
  check(r.ok === false && r.error.code === MODEL_COMPLETION_ERRORS.INVALID_REQUEST, 'an oversized prompt is refused before any call');
}

section('complete() — malformed request ⇒ INVALID_REQUEST');
{
  const r = await okProvider.complete({ schema: 'model-completion@1', requestId: '', messages: [] });
  check(r.ok === false && r.error.code === MODEL_COMPLETION_ERRORS.INVALID_REQUEST, 'a malformed ModelCompletionRequest is rejected');
}

section('generate() is not the Phase 1 entry point');
{
  const g = okProvider.generate({});
  check(g.ok === false && /not the Phase 1 entry point/i.test(g.error.message), 'generate() returns a typed pointer to the Intelligence Service, never a real generation');
}

section('The Null provider gained complete() → DISABLED');
{
  const r = await nullProvider.complete(req());
  check(r.ok === false && r.error.code === MODEL_COMPLETION_ERRORS.DISABLED, 'nullProvider.complete() → DISABLED (deterministic-only mode)');
  check(nullProvider.generate({}).error.code === 'NOT_IMPLEMENTED', 'nullProvider.generate() is unchanged from Phase 0');
}

section('No secret / endpoint / SDK in the ESM provider source (PART 5)');
{
  const src = fs.readFileSync(new URL('../src/intelligence/providers/openai-provider.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check(!/api\.openai\.com|sk-[A-Za-z0-9]|OPENAI_API_KEY|process\.env|from\s+['"]openai['"]/.test(src), 'openai-provider.js contains no endpoint, key, env read, or OpenAI SDK import');
  check(/callModel/.test(src), 'it reaches a model ONLY through the injected callModel port');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
