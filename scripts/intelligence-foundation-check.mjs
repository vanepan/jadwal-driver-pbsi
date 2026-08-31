/* ============================================================
   intelligence-foundation-check.mjs — Sarpras Intelligence Foundation (V2, Phase 0)

   PURE node test (no browser, no Firebase, no network). Proves the Phase 0
   architecture:

     • AI request contract              (PART 6)
     • AI response contract — 5 states  (PART 7)
     • provider abstraction + registry + null stub + switching   (PART 4)
     • NOR Registry — canonical identity, source module, lifecycle  (PART 9, 10, 13)
     • NOR numbering — ONE boundary, next-number, suggested vs published  (PART 11, 12)
     • Knowledge is SEPARATE from the NOR Registry                 (PART 8)
     • audit + model/prompt/knowledge versioning + usage          (PART 16, 17, 18)
     • data classification — RESTRICTED never sendable            (PART 20)
     • feature flag OFF by default; no startup dependency         (PART 21, 22, 23)
     • permission architecture reused, not duplicated             (PART 19)
     • dormancy — nothing outside src/intelligence/ imports it    (Phase 0 goal)

   Run:  node scripts/intelligence-foundation-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTELLIGENCE_REQUEST_SCHEMA, REQUEST_TASK, OUTPUT_TYPE,
  makeIntelligenceRequest, isIntelligenceRequest,
} from '../src/intelligence/contracts/intelligence-request-contract.js';
import {
  INTELLIGENCE_RESPONSE_SCHEMA, RESPONSE_STATUS, RESPONSE_ERRORS,
  completedResponse, needsInputResponse, draftResponse, requiresReviewResponse, errorResponse,
  isIntelligenceResponse,
} from '../src/intelligence/contracts/intelligence-response-contract.js';
import {
  PROVIDER_SCHEMA, PROVIDER_CONTRACT, PROVIDER_ERRORS, REGISTRY_ERRORS,
  providerSuccess, providerFailure, isIntelligenceProvider,
} from '../src/intelligence/contracts/provider-contract.js';
import {
  DEFAULT_PROVIDER_ID, registerProvider, getProvider, listProviders,
  setActiveProvider, getActiveProvider, getActiveProviderId, resetRegistry,
} from '../src/intelligence/provider-registry.js';
import { nullProvider, NULL_PROVIDER_ID } from '../src/intelligence/providers/null-provider.js';
import {
  makeGenerationProvenance, isGenerationProvenance, GENERATION_PROVENANCE_SCHEMA,
} from '../src/intelligence/contracts/generation-provenance-contract.js';
import {
  INTELLIGENCE_EVENT, INTELLIGENCE_EVENT_LIST, makeIntelligenceAuditEvent, isIntelligenceAuditEvent,
} from '../src/intelligence/contracts/audit-contract.js';
import { makeUsageRecord, isUsageRecord } from '../src/intelligence/contracts/usage-contract.js';
import {
  DATA_CLASS, SENDABLE_TO_PROVIDER, isSendableToProvider, assertSendable, maxClass, makeClassifiedField,
} from '../src/intelligence/contracts/data-classification-contract.js';
import {
  DEFAULT_INTELLIGENCE_CONFIG, getIntelligenceConfig, setIntelligenceConfig,
  resetIntelligenceConfig, isIntelligenceEnabled,
} from '../src/intelligence/config/intelligence-config.js';

import {
  NOR_STATUS, NOR_STATUS_GRAPH, canNorTransition, NUMBER_SOURCE, NOR_SOURCE_MODULE,
  makeNorRecord, isNorRecord, registerNorSourceModule, hasNorSourceModule,
  listNorSourceModules, resetNorSourceModules,
} from '../src/intelligence/nor-registry/contracts/nor-record-contract.js';
import {
  NUMBERING_OWNER, NOR_NUMBERING_SCHEMA, NUMBERING_ERRORS,
  suggestNextNumber, makeNumberAllocation, isNumberAllocation, reserveNumber,
} from '../src/intelligence/nor-registry/contracts/nor-numbering-contract.js';
import {
  NOR_REGISTRY_ERRORS, registrySuccess, registryFailure, isNorRegistryBackend, NOR_REGISTRY_CONTRACT,
} from '../src/intelligence/nor-registry/contracts/registry-contract.js';
import * as registry from '../src/intelligence/nor-registry/nor-registry.js';

import { isKnowledgeItem, KNOWLEDGE_ITEM_SCHEMA } from '../src/knowledge/contracts/knowledge-item-contract.js';
import { PERMISSIONS, buildPermissionTree } from '../js/config/permission-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

/* ════════════════════════════════════════════════════════════════════════ */

section('AI request contract (PART 6)');
check(INTELLIGENCE_REQUEST_SCHEMA === 'intelligence-request@1', `schema is ${INTELLIGENCE_REQUEST_SCHEMA}`);
const req = makeIntelligenceRequest({
  requestId: 'req_1',
  actor: { userId: 'u1', role: 'admin', sourceModule: 'petty_cash', sourceFeature: 'nor' },
  task: REQUEST_TASK.NOR_GENERATE,
  domainType: 'nor',
  input: { text: 'Buatkan NOR pembelian mesin potong rumput.', fields: {} },
  context: { knowledgeRefs: ['k1', 'k2'], norRefs: ['n9'], notes: null },
  requestedOutput: OUTPUT_TYPE.NOR_DRAFT,
  session: { conversationId: 'c1', turn: 1 },
  modelConfig: { model: null, maxOutputTokens: 800 },
  classification: DATA_CLASS.INTERNAL,
});
check(isIntelligenceRequest(req), 'makeIntelligenceRequest() → a valid request');
check(Object.isFrozen(req) && Object.isFrozen(req.actor) && Object.isFrozen(req.context), 'request + nested blocks frozen');
check(req.actor.userId === 'u1' && req.actor.sourceModule === 'petty_cash', 'request distinguishes user + module/feature');
check(req.task === 'nor.generate' && req.domainType === 'nor', 'request distinguishes task + domain');
check(req.session.conversationId === 'c1' && req.session.turn === 1, 'request carries conversation/session');
check(req.context.knowledgeRefs.length === 2 && req.context.norRefs.length === 1, 'request carries context refs (ids only)');
check(!('apiKey' in req) && !('endpoint' in req) && !('temperature' in req) && !('api_key' in req.modelConfig),
  'request exposes NO provider-specific fields (no key/endpoint/temperature/api_key)');
check(isIntelligenceRequest(makeIntelligenceRequest({ requestId: 'r', task: 't' })) === true, 'minimal valid request accepted');
check(isIntelligenceRequest(makeIntelligenceRequest({ task: 't' })) === false, 'request without requestId rejected');

section('AI response contract — five states (PART 7)');
check(INTELLIGENCE_RESPONSE_SCHEMA === 'intelligence-response@1', `schema is ${INTELLIGENCE_RESPONSE_SCHEMA}`);
const rCompleted = completedResponse({ requestId: 'req_1', content: { ok: true } });
const rNeeds = needsInputResponse({ requestId: 'req_1', questions: [
  { prompt: 'Berapa unit?' }, { prompt: 'Spesifikasi mesin?' }, { prompt: 'Perkiraan harga?' },
] });
const rDraft = draftResponse({ requestId: 'req_1', draft: { documentType: 'nor', fields: { subject: 'x' }, rendersVia: 'js/petty-cash/nor-document-engine.js#buildNorViewModel' } });
const rReview = requiresReviewResponse({ requestId: 'req_1', draft: { documentType: 'nor', fields: {} }, reason: 'Approval required.' });
const rError = errorResponse({ requestId: 'req_1', code: RESPONSE_ERRORS.NOT_IMPLEMENTED, message: 'no provider' });
check(rCompleted.status === RESPONSE_STATUS.COMPLETED && isIntelligenceResponse(rCompleted), 'completed response valid');
check(rNeeds.status === RESPONSE_STATUS.NEEDS_INPUT && rNeeds.questions.length === 3 && isIntelligenceResponse(rNeeds), 'needs_input response carries questions');
check(rNeeds.questions[0].prompt === 'Berapa unit?' && rNeeds.questions[0].required === true, 'needs_input questions normalised {id,prompt,why,required}');
check(rDraft.status === RESPONSE_STATUS.DRAFT && rDraft.draft.documentType === 'nor' && isIntelligenceResponse(rDraft), 'draft response carries a draft (not final)');
check(rReview.status === RESPONSE_STATUS.REQUIRES_REVIEW && rReview.review.blocking === true && isIntelligenceResponse(rReview), 'requires_review response carries a blocking review gate');
check(rError.status === RESPONSE_STATUS.ERROR && rError.error.code === 'NOT_IMPLEMENTED' && isIntelligenceResponse(rError), 'error response carries {code,message}');
check([rCompleted, rNeeds, rDraft, rReview, rError].every(Object.isFrozen), 'every response is frozen');
check(isIntelligenceResponse({ schema: INTELLIGENCE_RESPONSE_SCHEMA, status: 'bogus', requestId: 'x' }) === false, 'unknown status rejected');

section('Provider abstraction + registry (PART 4)');
check(PROVIDER_SCHEMA === 'intelligence-provider@1', `provider schema is ${PROVIDER_SCHEMA}`);
check(DEFAULT_PROVIDER_ID === 'null', "DEFAULT_PROVIDER_ID = 'null'");
check(getActiveProviderId() === 'null' && getActiveProvider() === nullProvider, 'Null Provider is active by default');
check(isIntelligenceProvider(nullProvider), 'nullProvider satisfies isIntelligenceProvider()');
check(PROVIDER_CONTRACT.provider.every((k) => k in nullProvider), 'nullProvider exposes every contract field');
const nr = nullProvider.generate(req);
check(PROVIDER_CONTRACT.result.every((k) => k in nr) && Object.isFrozen(nr), 'generate() returns a frozen ProviderResult');
check(nr.ok === false && nr.response === null && nr.error.code === PROVIDER_ERRORS.NOT_IMPLEMENTED, 'Null Provider → ok:false, NOT_IMPLEMENTED, no response');
check(nr.providerId === 'null', 'Null Provider identifies itself');
// a hand-rolled provider registers + switches, then reset restores the null default
const echo = Object.freeze({
  id: 'echo', version: 'echo@1', kind: 'inert', description: 'test',
  generate: (request) => providerSuccess(completedResponse({ requestId: request.requestId, content: request.input.text }), { providerId: 'echo', modelVersion: 'echo@1' }),
});
registerProvider(echo);
check(getProvider('echo') === echo && listProviders().some((p) => p.id === 'echo'), 'registerProvider + listProviders');
check(listProviders().every((p) => !('generate' in p)), 'listed summaries never leak generate()');
setActiveProvider('echo');
const er = getActiveProvider().generate(req);
check(er.ok === true && er.response.status === RESPONSE_STATUS.COMPLETED && er.response.content.startsWith('Buatkan NOR'), 'active provider switch is honoured by callers');
let threw = false;
try { setActiveProvider('nope'); } catch (e) { threw = e && e.code === REGISTRY_ERRORS.UNKNOWN_PROVIDER; }
check(threw, 'setActiveProvider(unknown) throws UNKNOWN_PROVIDER');
let threw2 = false;
try { registerProvider({ id: '', generate: 1 }); } catch (e) { threw2 = e && e.code === REGISTRY_ERRORS.INVALID_PROVIDER; }
check(threw2, 'registerProvider(malformed) throws INVALID_PROVIDER');
resetRegistry();
check(getActiveProviderId() === 'null' && getProvider('echo') === null, 'resetRegistry() restores the Null default');
check(providerFailure(PROVIDER_ERRORS.TIMEOUT, 't').ok === false && Object.isFrozen(providerFailure(PROVIDER_ERRORS.TIMEOUT, 't')), 'providerFailure builds a frozen error result');

section('NOR Registry — canonical identity, source module, lifecycle (PART 9, 10, 13)');
check(hasNorSourceModule(NOR_SOURCE_MODULE.PETTY_CASH) && hasNorSourceModule(NOR_SOURCE_MODULE.INTELLIGENCE), 'petty_cash + intelligence are registered source modules');
check(listNorSourceModules().length === 2, 'exactly the two known source modules bootstrapped');
registerNorSourceModule('future_module', { label: 'Future' });
check(hasNorSourceModule('future_module'), 'a new source module is a registry entry, not a code switch (PART 9)');
resetNorSourceModules();
check(!hasNorSourceModule('future_module') && listNorSourceModules().length === 2, 'resetNorSourceModules() restores the bootstrapped set');
const rec = makeNorRecord({
  norId: 'nor_1', norNumber: '', sourceModule: NOR_SOURCE_MODULE.PETTY_CASH, sourceFeature: 'generateNor',
  documentType: 'nor', title: 'Pembelian', subject: 'Mesin potong rumput', recipient: 'Kepala Bagian Umum',
  createdBy: 'u1', status: NOR_STATUS.DRAFT, numberSource: NUMBER_SOURCE.USER_EDITED,
});
check(isNorRecord(rec) && Object.isFrozen(rec), 'makeNorRecord() → a valid frozen NorRecord');
check(['norId', 'norNumber', 'sourceModule', 'sourceFeature', 'documentType', 'title', 'subject', 'recipient', 'status', 'currentVersion', 'publishedVersion', 'content', 'metadata', 'auditHistory'].every((k) => k in rec), 'NorRecord has every canonical identity field (PART 10)');
check(rec.recipient === 'Kepala Bagian Umum', "recipient is a contextual value, not a fixed constant (PART 15)");
check(makeNorRecord({ norId: 'n', sourceModule: 'petty_cash', recipient: null }).recipient === null, 'recipient may vary per NOR (nullable, contextual)');
check(isNorRecord(makeNorRecord({ norId: 'n', sourceModule: 'unregistered_x' })) === false, 'a NorRecord with an unregistered sourceModule is invalid');
check(Object.values(NOR_STATUS).join(',') === 'draft,in_review,approved,published,superseded', 'lifecycle states: draft → in_review → approved → published → superseded (PART 13)');
check(canNorTransition('draft', 'in_review') && !canNorTransition('draft', 'published'), 'lifecycle graph forbids skipping review');
check(canNorTransition('approved', 'published') && !canNorTransition('published', 'approved'), 'published is terminal-forward (only → superseded)');
check(NOR_STATUS_GRAPH.superseded.length === 0, 'superseded is terminal');

section('NOR numbering — ONE boundary, next-number, suggested vs published (PART 11, 12)');
check(NUMBERING_OWNER === 'src/intelligence/nor-registry/nor-registry.js', 'NUMBERING_OWNER names ONE source of truth');
check(typeof suggestNextNumber === 'function', 'suggestNextNumber re-exported through the NOR-numbering boundary (next-number concept)');
const suggestion = suggestNextNumber('nor');
check(suggestion && typeof suggestion.suggestedNumber === 'string' && typeof suggestion.confidence === 'number', 'suggestNextNumber("nor") → { suggestedNumber, basis, confidence, ... }');
check(registry.suggestNextNumber === suggestNextNumber, 'the facade re-exports the SAME suggestion function (no second copy)');
const alloc = makeNumberAllocation({ norId: 'nor_1', suggestedNumber: 'NOR-2026-015', source: NUMBER_SOURCE.SYSTEM_SUGGESTED, basis: 'next after NOR-2026-014', confidence: 0.9 });
check(isNumberAllocation(alloc) && alloc.publishedNumber === null, 'a suggested number is NOT a published number (PART 12)');
check(NOR_NUMBERING_SCHEMA === 'nor-number-allocation@1', `numbering schema is ${NOR_NUMBERING_SCHEMA}`);
check(Object.values(NUMBER_SOURCE).sort().join(',') === 'reserved,system_suggested,user_edited', 'NUMBER_SOURCE distinguishes system-suggested / user-edited / reserved');
const rn = reserveNumber({ norId: 'nor_1', requestedNumber: 'NOR-2026-015' });
check(rn.ok === false && rn.error.code === NUMBERING_ERRORS.NOT_IMPLEMENTED, 'reserveNumber() is NOT_IMPLEMENTED in Phase 0 (contract only)');
// no per-module numbering duplication: petty cash's own file has no NOR-number generator
const pcService = fs.readFileSync(path.join(ROOT, 'js/petty-cash/petty-cash-service.js'), 'utf8');
check(!/function\s+nextNorNumber|generateNorNumber|nextNor\b/.test(pcService), 'js/petty-cash/petty-cash-service.js defines NO independent NOR-number generator (nextRefNumber is a nota ref, not a NOR number)');

section('NOR Registry facade + null backend');
check(NOR_REGISTRY_CONTRACT.methods.join(',') === 'register,getById,list,appendVersion,publish,getHistory', 'backend contract method set');
check(isNorRegistryBackend(registry) === false, 'the facade module namespace is not itself a "backend" object');
check(registry.getActiveBackendId() === 'null', 'Null backend active by default');
const regResult = registry.register(rec);
check(regResult.ok === false && regResult.error.code === NOR_REGISTRY_ERRORS.NOT_IMPLEMENTED, 'register() → NOT_IMPLEMENTED under the Null backend');
check(registry.publish('nor_1', { publishedNumber: 'NOR-2026-015' }).error.code === NOR_REGISTRY_ERRORS.NOT_IMPLEMENTED, 'publish() → NOT_IMPLEMENTED under the Null backend');
let events = 0;
const lst = () => { events++; };
registry.registerRegistryListener(lst);
registry.register(rec); // still NOT_IMPLEMENTED → no event fires
check(events === 0, 'a failed write fires no Registry Event');
registry.unregisterRegistryListener(lst);
check(registrySuccess({ x: 1 }).ok === true && registryFailure('E', 'm').ok === false, 'RegistryResult builders');

section('Knowledge is SEPARATE from the NOR Registry (PART 8)');
check(KNOWLEDGE_ITEM_SCHEMA === 'knowledge-item@1' && registry.NOR_REGISTRY_SCHEMA === 'nor-registry@1', 'distinct schemas: knowledge-item@1 vs nor-registry@1');
check(isKnowledgeItem(rec) === false, 'a NorRecord is NOT a KnowledgeItem (different data type)');
check(isNorRecord({ id: 'k', version: 1, domainType: 'nor', sourceType: 'x', kind: 'structure', confidence: 0.5, lifecycleState: 'approved' }) === false, 'a KnowledgeItem-shaped object is NOT a NorRecord');

section('Audit + model/prompt/knowledge versioning + usage (PART 16, 17, 18)');
const prov = makeGenerationProvenance({ requestId: 'req_1', model: 'x', modelVersion: 'x-2026', promptVersion: 'nor-prompt@3', knowledgeVersion: 'snap-2026-08-31', generatedAt: new Date().toISOString(), userId: 'u1', sourceModule: 'petty_cash' });
check(isGenerationProvenance(prov) && prov.schema === GENERATION_PROVENANCE_SCHEMA, 'GenerationProvenance carries model + modelVersion + promptVersion + knowledgeVersion + requestId + userId + sourceModule');
check(['model', 'modelVersion', 'promptVersion', 'knowledgeVersion', 'generatedAt', 'requestId', 'userId', 'sourceModule'].every((k) => k in prov), 'every PART 16 versioning field present');
check(!('apiKey' in prov) && !('secret' in prov), 'provenance carries no secret');
check(INTELLIGENCE_EVENT_LIST.length === 9 && INTELLIGENCE_EVENT.NOR_PUBLISHED === 'NOR_PUBLISHED' && INTELLIGENCE_EVENT.KNOWLEDGE_APPROVED === 'KNOWLEDGE_APPROVED', 'INTELLIGENCE_EVENT vocabulary covers request → publish → learn (PART 17)');
const ae = makeIntelligenceAuditEvent({ type: INTELLIGENCE_EVENT.AI_REQUESTED, requestId: 'req_1', actorId: 'u1', sourceModule: 'petty_cash' });
check(isIntelligenceAuditEvent(ae) && Object.isFrozen(ae), 'makeIntelligenceAuditEvent() → a valid frozen event');
check(isIntelligenceAuditEvent(makeIntelligenceAuditEvent({ type: 'MADE_UP', requestId: 'r' })) === false, 'unknown audit event type rejected');
const usage = makeUsageRecord({ requestId: 'req_1', provider: 'x', model: 'x', success: true });
check(isUsageRecord(usage) && usage.inputTokens === null && usage.estimatedCost === null, 'UsageRecord tolerates missing token/cost data (observability, not billing — PART 18)');
check(isUsageRecord(makeUsageRecord({ requestId: 'r', success: false })), 'a failure UsageRecord is still valid');

section('Data classification — RESTRICTED never sendable (PART 20)');
check(Object.values(DATA_CLASS).join(',') === 'public,internal,restricted', 'three classes: PUBLIC | INTERNAL | RESTRICTED');
check(SENDABLE_TO_PROVIDER.join(',') === 'public,internal' && !SENDABLE_TO_PROVIDER.includes('restricted'), 'RESTRICTED is not in SENDABLE_TO_PROVIDER');
check(isSendableToProvider(DATA_CLASS.INTERNAL) === true && isSendableToProvider(DATA_CLASS.RESTRICTED) === false, 'isSendableToProvider(): INTERNAL yes, RESTRICTED no');
check(isSendableToProvider('made-up') === false, 'unknown class fails closed (not sendable)');
let sendThrew = false;
try { assertSendable(DATA_CLASS.RESTRICTED); } catch (e) { sendThrew = e && e.code === 'DATA_NOT_SENDABLE'; }
check(sendThrew, 'assertSendable(RESTRICTED) throws DATA_NOT_SENDABLE');
check(maxClass(DATA_CLASS.PUBLIC, DATA_CLASS.RESTRICTED) === DATA_CLASS.RESTRICTED, 'maxClass() takes the more sensitive');
check(makeClassifiedField({ value: 'x', classification: 'bogus' }).classification === DATA_CLASS.RESTRICTED, 'a mis-classified field normalises to RESTRICTED (fail closed)');

section('Feature flag OFF by default; no startup dependency (PART 21, 22, 23)');
check(DEFAULT_INTELLIGENCE_CONFIG.enabled === false, 'DEFAULT_INTELLIGENCE_CONFIG.enabled === false');
check(isIntelligenceEnabled() === false, 'isIntelligenceEnabled() === false out of the box');
check(DEFAULT_INTELLIGENCE_CONFIG.provider === 'null' && DEFAULT_INTELLIGENCE_CONFIG.defaultModel === null, "provider defaults to 'null', no model name hardcoded");
setIntelligenceConfig({ enabled: true, defaultModel: 'some-model' });
check(isIntelligenceEnabled() === true && getIntelligenceConfig().defaultModel === 'some-model', 'setIntelligenceConfig() applies a validated override');
setIntelligenceConfig({ enabled: 'yes-please' });
check(getIntelligenceConfig().enabled === true, 'a malformed enabled value is ignored (never silently flips the flag)');
resetIntelligenceConfig();
check(isIntelligenceEnabled() === false, 'resetIntelligenceConfig() restores OFF');
// strip comments before scanning for credential-SHAPED code (the header
// legitimately says the words "secret" / "OpenAI" while explaining there is none)
const cfgCode = fs.readFileSync(path.join(ROOT, 'src/intelligence/config/intelligence-config.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|(api[_-]?key|token|secret|bearer)\s*[:=]\s*['"]/i.test(cfgCode),
  'intelligence-config.js has no credential-shaped code (comments about "no secret" excluded)');
check(!/process\.env\./.test(cfgCode), 'intelligence-config.js reads no environment variable');

section('Permission architecture reused, not duplicated (PART 19)');
const tree = buildPermissionTree();
check(!!tree['Sarpras Intelligence'], "permission-registry.js already has a 'Sarpras Intelligence' module (reused, not a new system)");
check(!!PERMISSIONS['sic.review.act'] && !!PERMISSIONS['sic.approve.act'], 'existing sic.* permissions are the pattern new intelligence.* ids follow');
check(!Object.keys(PERMISSIONS).some((k) => k.startsWith('intelligence.')), 'Phase 0 adds NO new permission id (nothing is wired yet — PART 19)');
// src/intelligence/** must not roll its own gate. (Comments stripped first —
// a header may name isV2Enabled in prose while explaining the caller is
// already gated; and the Phase 1 service takes authz via an INJECTED port,
// never a hardcoded role check of its own.)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const intelFiles = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) intelFiles.push(p); } })(path.join(ROOT, 'src/intelligence'));
const gateLeak = intelFiles.filter((f) => /['"]role['"]\s*\]?\s*===\s*['"]admin['"]|\busername\s*===|isV2Enabled\s*\(|PERMISSIONS\s*=\s*\{/.test(stripComments(fs.readFileSync(f, 'utf8'))));
check(gateLeak.length === 0, `no src/intelligence/** file implements its own permission gate (${gateLeak.map((f) => path.relative(ROOT, f)).join(', ') || 'none'})`);

section('Isolation — src/intelligence/ has exactly ONE js/ composition root (Phase 2F)');
// Phase 2F wires the client: js/intelligence-backend-wiring.js is the ONE
// sanctioned js/ module that runtime-imports src/intelligence/ (registering
// the deployed callable conversation backend + the OpenAI provider adapter).
// Every OTHER js/ file, every other src/ domain, every functions/ file must
// still NOT import the tree. The CJS server keeps its own tiny contract
// mirrors. index.html loads nothing from src/intelligence/. No UI mounts the
// Intelligence Service yet (Phase 3).
const JS_COMPOSITION_ROOT = 'js/intelligence-backend-wiring.js';
function runtimeImportsIntelligence(dir, exclude) {
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!p.includes('node_modules') && p !== exclude) walk(p); }
      else if (/\.(js|mjs|cjs)$/.test(e.name)) {
        const t = stripComments(fs.readFileSync(p, 'utf8'));
        if (/(^|[^.\w])(import|export)\s[^;]*from\s+['"][^'"]*src\/intelligence\/|(^|[^.\w])import\(['"][^'"]*src\/intelligence\/|require\(['"][^'"]*src\/intelligence\//.test(t)) {
          hits.push(path.relative(ROOT, p));
        }
      }
    }
  })(dir);
  return hits;
}
const jsHits = runtimeImportsIntelligence(path.join(ROOT, 'js')).map((p) => p.replace(/\\/g, '/'));
const srcHits = runtimeImportsIntelligence(path.join(ROOT, 'src'), path.join(ROOT, 'src/intelligence'));
const fnHits = runtimeImportsIntelligence(path.join(ROOT, 'functions/src'));
const jsHitsOther = jsHits.filter((p) => p !== JS_COMPOSITION_ROOT);
check(jsHits.includes(JS_COMPOSITION_ROOT), `the js/ composition root (${JS_COMPOSITION_ROOT}) imports src/intelligence/ as designed`);
check(jsHitsOther.length === 0, `no OTHER js/** file runtime-imports src/intelligence/ (${jsHitsOther.join(', ') || 'none'})`);
check(srcHits.length === 0, `no other src/** domain imports src/intelligence/ (${srcHits.join(', ') || 'none'})`);
check(fnHits.length === 0, `no functions/** file imports src/intelligence/ — the CJS side mirrors, never imports (${fnHits.join(', ') || 'none'})`);
// the composition root must NOT hardcode a gate — it inherits js/app.js's isV2Enabled call.
const wiringSrc = stripComments(fs.readFileSync(path.join(ROOT, JS_COMPOSITION_ROOT), 'utf8'));
check(!/isV2Enabled\s*\(|['"]role['"]\s*\]?\s*===\s*['"]admin['"]|\busername\s*===/.test(wiringSrc), 'the composition root implements no gate of its own (app.js owns isV2Enabled)');
check(!/api\.openai\.com|sk-[A-Za-z0-9]|OPENAI_API_KEY/.test(wiringSrc), 'the composition root contains no endpoint / key / secret');
check(!/setActiveProvider\([^)]*\)\s*;?\s*$/m.test(wiringSrc) || /if\s*\(\s*status\.featureEnabled\s*\)/.test(wiringSrc), 'the OpenAI provider is only activated behind the feature flag');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check(!/src\/intelligence\//.test(indexHtml), 'index.html does not load anything from src/intelligence/');
// the layer may read knowledge/organizational-memory/document-intelligence — never the reverse (spot-check the one edge used)
check(/organizational-memory\/numbering-engine\.js/.test(fs.readFileSync(path.join(ROOT, 'src/intelligence/nor-registry/contracts/nor-numbering-contract.js'), 'utf8')), 'the numbering boundary reads organizational-memory/ (the one allowed edge)');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
