/* body-ownership-check.mjs — Phase 12.5, "Body Intelligence".

   Same two-part shape as scripts/learning-ownership-check.mjs /
   scripts/knowledge-ownership-check.mjs, on purpose.

   1. ARCHITECTURAL (static, source-scanning). Asserts: entity-repository's
      writers (create/appendVersion) have exactly one legitimate caller
      (services/entity-service.js); relationship-repository's create() and
      body-event-repository's append() have exactly one legitimate caller
      (services/body-sensing-service.js); body/ imports NOTHING from
      knowledge/, organizational-memory/, learning/, conversation/,
      reasoning/, problem-intelligence/, problem-solving/,
      document-intelligence/, ui/ ENGINES OR SERVICES —
      only the 2 precedented pure-leaf contract reuses, allowlisted by
      name; nothing OUTSIDE js/v2/body/ imports js/v2/body/, except
      js/v2/workspace/ (Phase 12.8's one approved, narrowly-scoped grant —
      see Part 4's own comment). js/v2/learning-bridge/ (Phase 12.6's
      former bridge) was deleted, confirmed dead, during Phase 1
      Repository Refoundation; the 3 real pilot sensors are NEVER imported by
      registry/sensor-registry.js, body/index.js, or
      services/body-sensing-service.js (dormancy-by-omission).

   2. BEHAVIOURAL (runtime). Re-confirms the dormancy claims are true in
      practice, not just by static grep — e.g. that services/
      body-sensing-service.js really does import cleanly in plain Node
      (proving it has no transitive Firebase dependency).

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/body-ownership-check.mjs   (exit 0 = pass) */

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
const BODY_FILES = V2_FILES.filter((f) => f.rel.startsWith('js/v2/body/'));

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

console.log('\n[Part 1 — exactly ONE owner writes the Entity Repository]');
{
  const OWNER = 'js/v2/body/services/entity-service.js';
  const REPO_RE = /body\/repository\/entity-repository\.js$/;
  const writers = [];
  for (const { rel, code } of V2_FILES) {
    if (rel === OWNER || rel.includes('/body/repository/')) continue;
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
  check(`NO module outside the owner imports an Entity Repository WRITER${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`, writers.length === 0);
  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write the repository (it is the owner, not a delegator)', /repoCreate/.test(ownerSrc) && /repoAppendVersion/.test(ownerSrc));
}

console.log('\n[Part 2 — exactly ONE owner writes Relationship + BodyEvent repositories]');
{
  const OWNER = 'js/v2/body/services/body-sensing-service.js';
  // Symbol-level check: which files import `create` from
  // relationship-repository.js or `append` from body-event-repository.js.
  const relWriters = []; const eventWriters = [];
  for (const { rel, code } of V2_FILES) {
    if (rel === OWNER) continue;
    for (const { block, target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      const clause = block.match(/\{([^}]*)\}/);
      if (!clause) continue;
      if (/body\/repository\/relationship-repository\.js$/.test(resolved) && new RegExp(`(^|[,{\\s])create(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause[1])) relWriters.push(rel);
      if (/body\/repository\/body-event-repository\.js$/.test(resolved) && new RegExp(`(^|[,{\\s])append(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause[1])) eventWriters.push(rel);
    }
  }
  check(`NO module outside the owner imports relationship-repository.js's create()${relWriters.length ? ` — FOUND: ${relWriters.join(', ')}` : ''}`, relWriters.length === 0);
  check(`NO module outside the owner imports body-event-repository.js's append()${eventWriters.length ? ` — FOUND: ${eventWriters.join(', ')}` : ''}`, eventWriters.length === 0);
  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write both (it is the orchestrator, not a delegator)', /relationshipCreate/.test(ownerSrc) && /eventAppend/.test(ownerSrc));
}

console.log('\n[Part 3 — body/ is a PEER of knowledge/, never depends on any ENGINE or SERVICE in it (or any downstream domain)]');
{
  // organizational-memory/ moved to src/organizational-memory/ during Phase 1
  // Repository Refoundation — matched on '/organizational-memory/' alone
  // (substring-safe for either the old or new root) so this stays a real
  // assertion instead of silently never matching a path that no longer
  // contains '/v2/'.
  const FORBIDDEN_TREES = ['/v2/knowledge/', '/organizational-memory/', '/v2/learning/', '/v2/conversation/', '/v2/reasoning/', '/v2/problem-intelligence/', '/v2/problem-solving/', '/document-intelligence/', '/v2/ui/'];
  const ALLOWLISTED_PURE_LEAF_REUSE = ['js/v2/knowledge/contracts/identity-contract.js', 'js/v2/knowledge/observability/contracts/warning-contract.js'];
  const leaks = [];
  for (const { rel, code } of BODY_FILES) {
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!FORBIDDEN_TREES.some((t) => resolved.includes(t))) continue;
      if (ALLOWLISTED_PURE_LEAF_REUSE.some((allowed) => resolved.endsWith(allowed.replace('js/v2/knowledge/', '/v2/knowledge/')))) continue;
      leaks.push(`${rel} -> ${resolved}`);
    }
  }
  check(`body/ imports NOTHING from knowledge/organizational-memory/learning/conversation/reasoning/problem-intelligence/problem-solving/document-intelligence/ui/ ENGINES/SERVICES, only the 2 allowlisted pure-leaf contracts${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);

  const identityReuseFiles = BODY_FILES.filter(({ code }) => /knowledge\/contracts\/identity-contract\.js/.test(code));
  check('the identity-contract.js reuse is exactly where documented (contracts/identity-contract.js only)', identityReuseFiles.length === 1 && identityReuseFiles[0].rel === 'js/v2/body/contracts/identity-contract.js');
}

console.log('\n[Part 4 — nothing OUTSIDE js/v2/body/ imports js/v2/body/, except the one approved exception (Phase 12.8\'s workspace/)]');
{
  // js/v2/learning-bridge/ was the Phase 12.6 exception, added specifically
  // because body/ and learning/ are mutually forbidden from importing each
  // other (see body/README.md and learning-service.js's own headers) —
  // something outside both had to bridge them, mirroring problem-solving/'s
  // "sees everyone" precedent. That folder was deleted, confirmed dead
  // (zero real callers anywhere), during Phase 1 Repository Refoundation.
  //
  // js/v2/workspace/ is the Phase 12.8 exception — a separately approved,
  // narrow grant (js/v2/README.md's Phase 12.8 extension,
  // js/v2/workspace/README.md §2): workspace/ may read
  // body/services/index.js#context.buildBodyContext() directly (read-only,
  // services-only, via workspace-context-builder.js), the one new edge that
  // phase's own architecture review named. scripts/workspace-ownership-
  // check.mjs is the authority on exactly what workspace/ may import from
  // body/ — this check only confirms no OTHER file anywhere still reaches
  // into body/.
  const offenders = [];
  for (const { rel, code } of V2_FILES) {
    if (rel.startsWith('js/v2/body/') || rel.startsWith('js/v2/workspace/')) continue;
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (resolved.includes('/v2/body/')) offenders.push(`${rel} -> ${resolved}`);
    }
  }
  check(`no js/v2/* file outside body/ or workspace/ imports body/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);

  // Also the wider repo — a grep-for-importers sweep, same technique
  // js/v2/index.js's own header prescribes for the whole platform.
  const wideOffenders = [];
  (function walk(rel) {
    if (rel === 'js/v2') return; // handled above, more precisely
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) { walk(r); continue; }
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.mjs')) continue;
      if (r.startsWith('scripts/')) continue; // check scripts legitimately import body/ directly
      const code = stripComments(read(r));
      if (/from\s*'[^']*\/v2\/body\//.test(code) || /from\s*"[^"]*\/v2\/body\//.test(code)) wideOffenders.push(r);
    }
  }('js'));
  check(`no file anywhere under js/ (outside js/v2/body/ and scripts/) imports js/v2/body/${wideOffenders.length ? ` — FOUND: ${wideOffenders.join(', ')}` : ''}`, wideOffenders.length === 0);
}

console.log('\n[Part 5 — dormancy-by-omission: the 3 real pilot sensors are never eagerly imported]');
{
  const registrySrc = stripComments(read('js/v2/body/registry/sensor-registry.js'));
  check('sensor-registry.js does NOT import any of the 3 real sensor files', !/vehicle-sensor\.js|driver-sensor\.js|assignment-sensor\.js/.test(registrySrc));
  const bodyIndexSrc = stripComments(read('js/v2/body/index.js'));
  check('body/index.js imports nothing at all (still a structural no-op)', !/\bimport\b/.test(bodyIndexSrc));
  const sensingServiceSrc = stripComments(read('js/v2/body/services/body-sensing-service.js'));
  check('body-sensing-service.js does NOT import sensors/index.js or any individual real sensor file (registry lookup only)', !/sensors\/(index|vehicle-sensor|driver-sensor|assignment-sensor)\.js/.test(sensingServiceSrc));
  const barrelSrc = stripComments(read('js/v2/body/sensors/index.js'));
  check('sensors/index.js (the opt-in barrel) DOES import all 3 — that is its one job', ['vehicle-sensor.js', 'driver-sensor.js', 'assignment-sensor.js'].every((f) => barrelSrc.includes(f)));
}

console.log('\n[Part 6 — behavioural: the dormant paths really do import cleanly in plain Node]');
{
  const results = await Promise.allSettled([
    import('../js/v2/body/index.js'),
    import('../js/v2/body/registry/sensor-registry.js'),
    import('../js/v2/body/services/entity-service.js'),
    import('../js/v2/body/services/body-sensing-service.js'),
  ]);
  check('body/index.js, sensor-registry.js, entity-service.js, body-sensing-service.js ALL import cleanly (zero transitive Firebase dependency)', results.every((r) => r.status === 'fulfilled'));

  const sensorResults = await Promise.allSettled([
    import('../js/v2/body/sensors/vehicle-sensor.js'),
    import('../js/v2/body/sensors/driver-sensor.js'),
    import('../js/v2/body/sensors/assignment-sensor.js'),
  ]);
  check('the 3 real *-sensor.js files, by contrast, genuinely CANNOT import in plain Node (real V1/Firebase coupling — expected, not a bug)', sensorResults.every((r) => r.status === 'rejected'));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
