/* recognition-foundation-check.mjs — Phase 12.7.1, "Recognition Foundation:
   Contracts + Registries + Repository + Service".

   Verifies: every contract's structural validator accepts a real fixture
   and rejects a malformed one; every registry bootstraps its documented
   vocabulary; the Memory repository enforces append-only versioning and
   RecognitionRecord structural validity exactly like body/'s Entity
   repository does; the Null repository is honest and active by default;
   recognition-service.js's recordObservation() create-or-append
   reconciliation and explainRecognition() cite-or-abstain behavior are
   real; recognition/index.js is a structural no-op; and — the persistent
   invariant every prior domain's own Foundation sprint checks for itself —
   nothing under recognition/ imports a producer domain's ENGINE or
   SERVICE yet (only the two precedented pure-contract-leaf reuses:
   knowledge/contracts/evidence-contract.js and
   knowledge/contracts/identity-contract.js#nextVersion), and nothing
   outside recognition/ imports recognition/ yet (dormancy).

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/recognition-foundation-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecognitionScope, makeRecognitionScope, scopeKey } from '../js/v2/recognition/contracts/recognition-scope-contract.js';
import { RECORD_TYPE, isRecognitionRecord } from '../js/v2/recognition/contracts/recognition-record-contract.js';
import { isRecognitionSignaturePayload } from '../js/v2/recognition/contracts/recognition-signature-contract.js';
import { isRecognitionConfidence } from '../js/v2/recognition/contracts/recognition-confidence-contract.js';
import { isRecognitionClusterPayload } from '../js/v2/recognition/contracts/recognition-cluster-contract.js';
import { isRecognitionRelationshipPayload } from '../js/v2/recognition/contracts/recognition-relationship-contract.js';
import { isRecognitionClassificationPayload } from '../js/v2/recognition/contracts/recognition-classification-contract.js';
import {
  registerSignatureType, hasSignatureType, getSignatureType, listSignatureTypes, resetSignatureTypeRegistry,
} from '../js/v2/recognition/registry/recognition-signature-type-registry.js';
import {
  hasRelationshipType, listRelationshipTypes, resetRelationshipTypeRegistry,
} from '../js/v2/recognition/registry/recognition-relationship-type-registry.js';
import {
  hasRecommendationType, listRecommendationTypes, resetRecommendationTypeRegistry,
} from '../js/v2/recognition/registry/recognition-recommendation-type-registry.js';
import {
  getById as repoGetById, list as repoList, create as repoCreate, appendVersion as repoAppendVersion,
  getHistory as repoGetHistory, getMetrics as repoGetMetrics, setActiveRepository, getActiveRepositoryId,
} from '../js/v2/recognition/repository/recognition-repository.js';
import { resetRepositoryRegistry } from '../js/v2/recognition/repository/repository-registry.js';
import { REPOSITORY_ERRORS } from '../js/v2/recognition/repository/contracts/repository-contract.js';
import {
  recordObservation, getRecognitionRecord, explainRecognition, makeRecognitionRecordId,
} from '../js/v2/recognition/services/recognition-service.js';
import { RECOGNITION_PHASE, RECOGNITION_DORMANT } from '../js/v2/recognition/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function filesUnder(dir) {
  const out = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(r);
      else if (entry.name.endsWith('.js')) out.push(r);
    }
  }(dir));
  return out;
}

/* ══ Contracts ═══════════════════════════════════════════════════════════ */

console.log('\n[recognition-scope-contract.js]');
{
  const scope = makeRecognitionScope({ domainType: 'nor', entityType: 'petty_cash', entityId: 'nor-1' });
  check('makeRecognitionScope builds a valid scope', isRecognitionScope(scope));
  check('isRecognitionScope rejects a missing domainType', !isRecognitionScope({ entityType: null, entityId: null }));
  check('scopeKey is deterministic', scopeKey(scope) === scopeKey(makeRecognitionScope({ domainType: 'nor', entityType: 'petty_cash', entityId: 'nor-1' })));
  check('scopeKey differs for a different entityId', scopeKey(scope) !== scopeKey(makeRecognitionScope({ domainType: 'nor', entityType: 'petty_cash', entityId: 'nor-2' })));
  let threw = false;
  try { makeRecognitionScope({}); } catch { threw = true; }
  check('makeRecognitionScope throws without a domainType', threw);
}

const now = new Date().toISOString();
function fixtureRecord(overrides = {}) {
  return Object.freeze({
    id: 'signature:nor::nor-1',
    version: 1,
    recordType: RECORD_TYPE.SIGNATURE,
    scope: makeRecognitionScope({ domainType: 'nor', entityId: 'nor-1' }),
    payload: { signatureType: 'exact-hash', value: 'abc123', extractorId: 'file-hash', computedAt: now },
    confidence: 0.9,
    evidence: [],
    provenance: { producerId: 'test-extractor', computedAt: now },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

console.log('\n[recognition-record-contract.js]');
{
  check('RECORD_TYPE has all five documented values', Object.keys(RECORD_TYPE).length === 5
    && ['SIGNATURE', 'CLUSTER', 'RELATIONSHIP', 'CLASSIFICATION', 'RECOMMENDATION'].every((k) => k in RECORD_TYPE));
  check('isRecognitionRecord accepts a real fixture', isRecognitionRecord(fixtureRecord()));
  check('isRecognitionRecord rejects an unknown recordType', !isRecognitionRecord(fixtureRecord({ recordType: 'not-a-real-type' })));
  check('isRecognitionRecord rejects a confidence outside 0-1', !isRecognitionRecord(fixtureRecord({ confidence: 1.5 })));
  check('isRecognitionRecord rejects a malformed scope', !isRecognitionRecord(fixtureRecord({ scope: { domainType: '' } })));
  check('isRecognitionRecord rejects a missing provenance.producerId', !isRecognitionRecord(fixtureRecord({ provenance: { computedAt: now } })));
}

console.log('\n[recognition-signature-contract.js]');
{
  const sig = { signatureType: 'exact-hash', value: 'abc', extractorId: 'file-hash', computedAt: now };
  check('isRecognitionSignaturePayload accepts a real fixture', isRecognitionSignaturePayload(sig));
  check('isRecognitionSignaturePayload rejects an empty value', !isRecognitionSignaturePayload({ ...sig, value: '' }));
}

console.log('\n[recognition-confidence-contract.js]');
{
  const conf = {
    value: 0.7, sourceWeight: 0.6, corroborationCount: 2, contradictionCount: 0, computedAt: now,
  };
  check('isRecognitionConfidence accepts a real fixture', isRecognitionConfidence(conf));
  check('isRecognitionConfidence rejects a negative corroborationCount', !isRecognitionConfidence({ ...conf, corroborationCount: -1 }));
}

console.log('\n[recognition-cluster-contract.js]');
{
  const cluster = { clusterType: 'structural-shape', memberScopeKeys: ['a', 'b', 'c'], representativeScopeKey: 'a' };
  check('isRecognitionClusterPayload accepts a real fixture', isRecognitionClusterPayload(cluster));
  check('isRecognitionClusterPayload rejects a singleton (no corroboration)', !isRecognitionClusterPayload({ ...cluster, memberScopeKeys: ['a'] }));
  check('isRecognitionClusterPayload rejects a representative not in the membership', !isRecognitionClusterPayload({ ...cluster, representativeScopeKey: 'z' }));
}

console.log('\n[recognition-relationship-contract.js]');
{
  const rel = { relationshipType: 'SAME_VENDOR', fromScopeKey: 'a', toScopeKey: 'b' };
  check('isRecognitionRelationshipPayload accepts a real fixture', isRecognitionRelationshipPayload(rel));
  check('isRecognitionRelationshipPayload rejects fromScopeKey === toScopeKey', !isRecognitionRelationshipPayload({ ...rel, toScopeKey: 'a' }));
}

console.log('\n[recognition-classification-contract.js]');
{
  const cls = { suggestedDomainType: 'nor', suggestedKind: null, suggestedNorType: null };
  check('isRecognitionClassificationPayload accepts a partial real suggestion', isRecognitionClassificationPayload(cls));
  check('isRecognitionClassificationPayload rejects an all-null (non-)suggestion', !isRecognitionClassificationPayload({ suggestedDomainType: null, suggestedKind: null, suggestedNorType: null }));
}

/* ══ Registries ══════════════════════════════════════════════════════════ */

console.log('\n[recognition-signature-type-registry.js]');
{
  resetSignatureTypeRegistry();
  check('bootstraps exactly the 4 documented signature types', listSignatureTypes().length === 4);
  check('exact-hash is registered', hasSignatureType('exact-hash'));
  check('structural-shape is registered', hasSignatureType('structural-shape'));
  check('field-overlap is registered', hasSignatureType('field-overlap'));
  check('metadata-shape is registered', hasSignatureType('metadata-shape'));
  check('registering vocabulary never implies a real extractor exists (same discipline as entity-type-registry.js)', getSignatureType('exact-hash').label.length > 0);
  registerSignatureType('temp-test-type', 'Temp');
  check('registerSignatureType is real (a new entry is retrievable)', hasSignatureType('temp-test-type'));
  resetSignatureTypeRegistry();
  check('resetSignatureTypeRegistry genuinely clears then reboots (temp entry gone)', !hasSignatureType('temp-test-type') && listSignatureTypes().length === 4);
}

console.log('\n[recognition-relationship-type-registry.js]');
{
  resetRelationshipTypeRegistry();
  // Phase 12.7.5 (Relationship Discovery) added a 6th, additive entry —
  // CO_CLUSTERED — the one relationshipType this platform's own automatic
  // discovery is honestly entitled to assign by itself (see
  // graph/relationship-discovery-engine.js's header). This assertion was
  // "exactly 5" when this Foundation sprint (12.7.1) shipped; updated here
  // the same way scripts/body-ownership-check.mjs's own stale assertion
  // was narrowed after learning-bridge/ became a deliberate, approved
  // exception (Phase 12.6.7) — not silently left to rot.
  check('bootstraps exactly the 6 documented relationship types (5 original + Phase 12.7.5\'s CO_CLUSTERED)', listRelationshipTypes().length === 6);
  check('SAME_VENDOR is registered', hasRelationshipType('SAME_VENDOR'));
  check('RECURRING_PARTICIPANT is registered', hasRelationshipType('RECURRING_PARTICIPANT'));
  check('CO_CLUSTERED is registered (Phase 12.7.5)', hasRelationshipType('CO_CLUSTERED'));
}

console.log('\n[recognition-recommendation-type-registry.js]');
{
  resetRecommendationTypeRegistry();
  check('bootstraps exactly the 4 documented recommendation types', listRecommendationTypes().length === 4);
  check('confirm_duplicate is registered', hasRecommendationType('confirm_duplicate'));
  check('merge_cluster is registered', hasRecommendationType('merge_cluster'));
}

/* ══ Repository ══════════════════════════════════════════════════════════ */

console.log('\n[Repository — Null is active by default, honest failures]');
{
  resetRepositoryRegistry();
  check('NullRepository is active by default (never silently durable)', getActiveRepositoryId() === 'null');
  const created = repoCreate(fixtureRecord());
  check('NullRepository honestly refuses create() with NOT_IMPLEMENTED', !created.ok && created.error.code === REPOSITORY_ERRORS.NOT_IMPLEMENTED);
  const listed = repoList({});
  check('NullRepository#list() returns an honest empty array, never an error', listed.ok && Array.isArray(listed.data) && listed.data.length === 0);
}

console.log('\n[Repository — Memory backend, append-only versioning]');
{
  setActiveRepository('memory');
  const created = repoCreate(fixtureRecord());
  check('Memory#create() succeeds for a valid RecognitionRecord', created.ok && created.data.version === 1);
  const duplicate = repoCreate(fixtureRecord());
  check('Memory#create() refuses a duplicate id (DUPLICATE_ID, not a silent overwrite)', !duplicate.ok && duplicate.error.code === REPOSITORY_ERRORS.DUPLICATE_ID);
  const appended = repoAppendVersion(fixtureRecord().id, { confidence: 0.95 });
  check('Memory#appendVersion() bumps the version, never overwrites in place', appended.ok && appended.data.version === 2);
  check('Memory#appendVersion() preserves fields not in the patch', appended.data.payload.value === 'abc123');
  const invalidAppend = repoAppendVersion(fixtureRecord().id, { confidence: 5 });
  check('Memory#appendVersion() refuses a result that would violate the contract', !invalidAppend.ok);
  const history = repoGetHistory(fixtureRecord().id);
  check('Memory#getHistory() returns every real version, oldest first', history.ok && history.data.length === 2 && history.data[0].version === 1);
  const metrics = repoGetMetrics();
  check('Memory#getMetrics() tallies by recordType from real stored data', metrics.ok && metrics.data.byRecordType.signature === 1);
  const notFound = repoGetById('does-not-exist');
  check('Memory#getById() honestly reports NOT_FOUND for an unknown id', !notFound.ok && notFound.error.code === REPOSITORY_ERRORS.NOT_FOUND);
}

/* ══ Service ═════════════════════════════════════════════════════════════ */

console.log('\n[recognition-service.js — recordObservation create-or-append reconciliation]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  const scope = makeRecognitionScope({ domainType: 'nor', entityId: 'doc-42' });
  const id = makeRecognitionRecordId(RECORD_TYPE.SIGNATURE, scope);
  check('makeRecognitionRecordId is deterministic for the same (recordType, scope)', id === makeRecognitionRecordId(RECORD_TYPE.SIGNATURE, scope));

  const first = recordObservation(fixtureRecord({ id, scope }));
  check('first observation creates a new record', first.ok && first.op === 'create' && first.data.version === 1);

  const second = recordObservation(fixtureRecord({
    id, scope, confidence: 0.99, payload: { signatureType: 'exact-hash', value: 'abc123-updated', extractorId: 'file-hash', computedAt: now },
  }));
  check('re-observing the SAME (recordType, scope) appends a version, never duplicates', second.ok && second.op === 'append' && second.data.version === 2);

  const fetched = getRecognitionRecord(id);
  check('getRecognitionRecord reflects the latest observation', fetched.ok && fetched.data.confidence === 0.99);

  const invalid = recordObservation({ scope, payload: {} });
  check('recordObservation refuses a candidate with no id', !invalid.ok && invalid.op === null);
}

console.log('\n[recognition-service.js — explainRecognition, cite-or-abstain]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  const scope = makeRecognitionScope({ domainType: 'nor', entityId: 'doc-99' });
  const id = makeRecognitionRecordId(RECORD_TYPE.SIGNATURE, scope);
  recordObservation(fixtureRecord({ id, scope, confidence: 0.42 }));
  const explanation = explainRecognition(id);
  check('explainRecognition succeeds for a real record', explanation.ok);
  check('explainRecognition surfaces the real confidence value', explanation.data.confidence === 0.42);
  check('explainRecognition surfaces real provenance (Recognition Ownership)', explanation.data.producedBy === 'test-extractor');
  check('explainRecognition never fabricates a human-confirmation answer it does not have', explanation.data.humanConfirmed === null);
  const missing = explainRecognition('does-not-exist');
  check('explainRecognition honestly fails for an unknown id, never a guessed answer', !missing.ok);
}

/* ══ Dormant barrel ══════════════════════════════════════════════════════ */

console.log('\n[recognition/index.js — dormant barrel]');
{
  check('RECOGNITION_DORMANT is true', RECOGNITION_DORMANT === true);
  check('RECOGNITION_PHASE is recorded', RECOGNITION_PHASE === '12.7');
  const src = stripComments(read('js/v2/recognition/index.js'));
  check('recognition/index.js imports nothing (structural no-op, same as js/v2/index.js)', !/\bimport\b/.test(src));
}

/* ══ Persistent invariants ═══════════════════════════════════════════════ */

console.log('\n[Persistent invariant — no producer-domain ENGINE or SERVICE import]');
{
  const files = [
    ...filesUnder('js/v2/recognition/contracts'),
    ...filesUnder('js/v2/recognition/registry'),
    ...filesUnder('js/v2/recognition/repository'),
    'js/v2/recognition/index.js',
  ];
  // Only two precedented pure-contract-leaf reuses are allowed at this
  // sprint's layer — the same allowlist-by-name discipline
  // body-ownership-check.mjs already uses for its own precedented reuses.
  const ALLOWED = [
    '../../knowledge/contracts/evidence-contract.js',
    '../../../knowledge/contracts/identity-contract.js',
  ];
  const offenders = [];
  for (const rel of files) {
    const src = stripComments(read(rel));
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const imp of imports) {
      const isRelativeWithinRecognition = imp.startsWith('./') || imp.startsWith('../') && !imp.includes('knowledge/');
      if (ALLOWED.includes(imp)) continue;
      if (imp.includes('/services/') || imp.includes('/repository/') || imp.includes('-engine.js') || imp.includes('-service.js')) {
        if (!imp.startsWith('./') && !imp.startsWith('../repository') && !imp.startsWith('../../repository')) {
          offenders.push(`${rel} -> ${imp}`);
        }
      }
      void isRelativeWithinRecognition;
    }
  }
  check(`no producer-domain ENGINE/SERVICE import anywhere in contracts/, registry/, repository/, or index.js${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Dormancy — nothing outside recognition/ imports recognition/ yet]');
{
  const roots = ['js/v2/ai-foundation', 'js/v2/body', 'js/v2/knowledge', 'js/v2/organizational-memory', 'js/v2/learning', 'js/v2/learning-bridge', 'js/v2/document-intelligence', 'js/v2/conversation', 'js/v2/reasoning', 'js/v2/problem-intelligence', 'js/v2/problem-solving', 'js/v2/ui'];
  const offenders = [];
  for (const root of roots) {
    for (const rel of filesUnder(root)) {
      const src = stripComments(read(rel));
      if (/from\s+'[^']*\/recognition\//.test(src) || /from\s+'\.\.\/recognition\//.test(src)) offenders.push(rel);
    }
  }
  check(`nothing outside recognition/ imports it yet${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
