/* gudang-security-check.mjs — Gudang V1.28.0, Phase 1.2 (Security Hardening).

   Authorized by: Doc 1 Art.IV/V/VI · Doc 3 Ch.04/05/06 · Doc 4 Art.III/VIII/F-09
   — Phase 1.2 brief, Part 8 "Verification" ("add new verification where
   necessary" — security verification did not exist before this phase).

   Static inspection of database.rules.json only. No live Firebase connection,
   no credentials, no deploy — this checks the RULES FILE'S TEXT, the same
   way scripts/gudang-ownership-check.mjs checks source text, not runtime
   behavior. It cannot prove the Firebase backend enforces these rules
   (that requires the Firebase Rules Simulator or a real deploy); it proves
   the rules AS WRITTEN say what this phase's report claims they say.

   Run: node scripts/gudang-security-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const raw = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');

console.log('\n[Part 1 — database.rules.json is valid JSON with no comment-key mistakes]');
let rules;
{
  try {
    rules = JSON.parse(raw);
    check('database.rules.json parses as valid JSON', true);
  } catch (err) {
    check(`database.rules.json parses as valid JSON — FAILED: ${err.message}`, false);
  }
  check('no "_comment_" or "//"-style fake keys were left in the file (not valid RTDB rules syntax)', !/"_comment/.test(raw));
}

const gudang = rules?.rules?.gudang;
check('rules.gudang exists', !!gudang);

console.log('\n[Part 2 — root default no longer silently governs gudang/* (the phase\'s central finding)]');
{
  check('root .read/.write defaults are untouched by this phase (auth != null, unchanged for every OTHER module)',
    rules.rules['.read'] === 'auth != null' && rules.rules['.write'] === 'auth != null');
  check('rules.gudang is a real override block (not falling through to the root default any more)', !!gudang && typeof gudang === 'object');
}

console.log('\n[Part 3 — Movement is append-only at the database level (Doc 1 Art.IV/VI, Doc 4 F-09)]');
{
  const w = gudang?.movements?.$movementId?.['.write'];
  check('gudang/movements/$movementId .write requires !data.exists() (rejects overwrite AND delete)', typeof w === 'string' && w.includes('!data.exists()'));
  check('gudang/movements/$movementId .write is role-scoped (admin/developer), not a bare boolean', typeof w === 'string' && w.includes("auth.token.role"));
  const v = gudang?.movements?.$movementId?.['.validate'];
  check('gudang/movements/$movementId has a .validate requiring the key to match movementId', typeof v === 'string' && v.includes("$movementId"));
}

console.log('\n[Part 4 — Asset History is append-only at the database level (Doc 1 Art.V, Doc 4 F-09)]');
{
  const w = gudang?.assetHistory?.$historyId?.['.write'];
  check('gudang/assetHistory/$historyId .write requires !data.exists()', typeof w === 'string' && w.includes('!data.exists()'));
  check('gudang/assetHistory/$historyId .write is role-scoped', typeof w === 'string' && w.includes('auth.token.role'));
}

console.log('\n[Part 5 — Projection remains overwritable; Truth does not (Doc 3 Ch.05, Doc 4 Art.VIII)]');
{
  const w = gudang?.stockProjection?.$itemId?.['.write'];
  check('gudang/stockProjection/$itemId .write does NOT require !data.exists() — a Projection must stay rebuildable', typeof w === 'string' && !w.includes('!data.exists()'));
  check('gudang/stockProjection/$itemId .write is still role-scoped (overwritable ≠ open to anyone)', typeof w === 'string' && w.includes('auth.token.role'));
  check('the RTDB path itself is named "stockProjection", not "stock" — the physical layout no longer looks like a peer of movements/assets', raw.includes('"stockProjection"') && !raw.includes('"gudang/stock"'));
}

console.log('\n[Part 6 — no unnecessary write permissions anywhere under gudang/*]');
{
  const paths = ['items', 'movements', 'assets', 'assetHistory', 'locations', 'departments', 'stockProjection'];
  const offenders = [];
  for (const p of paths) {
    const node = gudang?.[p];
    const wildcardKey = Object.keys(node || {}).find((k) => k.startsWith('$'));
    const w = wildcardKey ? node[wildcardKey]?.['.write'] : node?.['.write'];
    const r = node?.['.read'];
    if (typeof w !== 'string' || w === 'true' || !w.includes('auth.token.role')) offenders.push(`${p}.write`);
    if (typeof r !== 'string' || r === 'true' || !r.includes('auth.token.role')) offenders.push(`${p}.read`);
  }
  check(`every gudang/* path's .read and .write is role-scoped — none is a bare "true" or missing${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);

  const noGudangStaffGrant = !raw.includes("gudang_staff");
  check('no rule grants a "gudang_staff" role that does not exist yet (Doc 4 Art.VI — no premature grant)', noGudangStaffGrant);
}

console.log('\n[Part 7 — every gudang/* record path has a shape .validate]');
{
  const expectations = {
    items: ['itemId', 'name', 'itemType', 'category', 'active', 'normalizedName', 'searchTokens', 'createdAt'],
    movements: ['movementId', 'itemId', 'type', 'quantityDelta', 'reason', 'actorId', 'createdAt'],
    assets: ['assetId', 'itemId', 'identity', 'status', 'createdAt'],
    assetHistory: ['historyId', 'assetId', 'eventType', 'actorId', 'reason', 'occurredAt'],
    locations: ['locationId', 'name', 'createdAt'],
    departments: ['departmentId', 'name', 'createdAt'],
    stockProjection: ['itemId', 'quantity', 'rebuiltAt', 'consistent'],
  };
  for (const [p, fields] of Object.entries(expectations)) {
    const node = gudang?.[p];
    const wildcardKey = Object.keys(node || {}).find((k) => k.startsWith('$'));
    const v = wildcardKey ? node[wildcardKey]?.['.validate'] : undefined;
    const hasAll = typeof v === 'string' && fields.every((f) => v.includes(f));
    check(`gudang/${p} validates its required fields (${fields.join(', ')})`, hasAll);
  }
}

console.log('\n[Part 8 — Phase 1.2.1: rules protect invariants, not today\'s exact field list]');
{
  // hasChildren([...]) is a MINIMUM-presence check in RTDB rules — it passes
  // as long as the listed keys are present, and does NOT reject additional,
  // unlisted keys. Pairing it with newData.numChildren() === N is the
  // standard Firebase idiom for an EXHAUSTIVE/closed schema; the absence of
  // numChildren() anywhere below is what proves these .validate rules stay
  // open to future harmless metadata (barcode, qrCode, averageCost,
  // minimumStock, maximumStock, preferredSupplier, analytics metadata,
  // future V2 references, ...) without a rules rewrite — exactly what
  // Phase 1.2.1 Part 1/2 asked this review to confirm.
  const paths = ['items', 'movements', 'assets', 'assetHistory', 'locations', 'departments', 'stockProjection'];
  const closedSchemaOffenders = [];
  for (const p of paths) {
    const node = gudang?.[p];
    const wildcardKey = Object.keys(node || {}).find((k) => k.startsWith('$'));
    const v = wildcardKey ? node[wildcardKey]?.['.validate'] : undefined;
    if (typeof v === 'string' && /numChildren\s*\(\s*\)/.test(v)) closedSchemaOffenders.push(p);
  }
  check(`NO gudang/* .validate rule uses numChildren() to close the schema — future metadata fields remain addable without a rules rewrite${closedSchemaOffenders.length ? ` — FOUND: ${closedSchemaOffenders.join(', ')}` : ''}`, closedSchemaOffenders.length === 0);

  // The flip side: required fields, identity, and quantity type safety must
  // still be enforced — an empty or all-optional .validate would be just as
  // wrong as an exhaustive one. Re-confirms every path's rule is non-trivial
  // (checks at least one required field) rather than accidentally hollowed
  // out to "always true" while removing numChildren().
  const hollowOffenders = [];
  for (const p of paths) {
    const node = gudang?.[p];
    const wildcardKey = Object.keys(node || {}).find((k) => k.startsWith('$'));
    const v = wildcardKey ? node[wildcardKey]?.['.validate'] : undefined;
    if (typeof v !== 'string' || !/hasChildren\(\[/.test(v)) hollowOffenders.push(p);
  }
  check(`every gudang/* .validate still enforces its required-field list via hasChildren([...]) — none was hollowed out${hollowOffenders.length ? ` — FOUND: ${hollowOffenders.join(', ')}` : ''}`, hollowOffenders.length === 0);
}

console.log('\n[Part 9 — Phase 2 (Item Foundation): itemType is immutable at the database level]');
{
  const w = gudang?.items?.$itemId?.['.write'];
  check('gudang/items/$itemId .write allows create OR update, but only when itemType is unchanged from the stored value',
    typeof w === 'string' && w.includes('!data.exists()') && w.includes("newData.child('itemType').val() === data.child('itemType').val()"));
  check('gudang/items/$itemId .write remains role-scoped (admin/developer)', typeof w === 'string' && w.includes('auth.token.role'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
