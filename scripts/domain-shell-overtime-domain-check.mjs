/* domain-shell-overtime-domain-check.mjs — Overtime is a STANDALONE top-level
   navigation domain in the consolidated shell (js/shell/domain-shell.js),
   not a nested Finance tab.

   Static source-contract check (same style as feature-flags-override-check.mjs
   / role-label-drift-check.mjs / the reconciliation check's static-contract
   section): buildDomains() is not exported, so this asserts the structural
   facts over source rather than executing the shell. It proves:

     1. admin sees a standalone Overtime domain  (a top-level domain object
        with module:'overtime' — domainVisible() gates the WHOLE domain on
        cfg.canAccessModule('overtime'))
     2. Overtime still respects overtime.view    (gate is the unchanged
        MODULE_PERMISSIONS.overtime -> 'overtime.view' via canAccessModule;
        no new permission id in the shell)
     3. no duplicate top-level Overtime          (exactly one id:'overtime' in
        buildDomains(), and it is NOT inside the finance domain's screens)
     4. Finance navigation remains valid         (finance domain still present,
        still driven by cfg.pcMenuTitles, no dangling overtime screen)
     5. mobile Overtime remains accessible       (js/app.js BOTTOM_NAV_MORE_ITEMS
        still lists Overtime, gated by the same requiresModule:'overtime')
     6. the rail icon resolves                   (AN_ICON_PATHS has an 'overtime'
        glyph so svgIcon('overtime') is not an empty <path>)

   Run: node scripts/domain-shell-overtime-domain-check.mjs   (exit 0 = pass)
*/

import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + String(detail).slice(0, 400)); }
};

const shell = fs.readFileSync(new URL('../js/shell/domain-shell.js', import.meta.url), 'utf-8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf-8');
const icons = fs.readFileSync(new URL('../js/analytics/analytics-shell.js', import.meta.url), 'utf-8');

/* The buildDomains() function body — from its declaration to the next
   top-level declaration. "top-level domain" vs "nested screen" lives here. */
const bd = shell.slice(
  shell.indexOf('function buildDomains('),
  shell.indexOf('\nfunction moduleForDomain('),
);
// Comments stripped so assertions never trip over prose that mentions a
// permission id or another domain name.
const bdCode = bd.replace(/\/\/[^\n]*/g, '');
const idx = (s) => bdCode.indexOf(s);

console.log('\n[1 — standalone Overtime domain]');
check("buildDomains() has a top-level { id:'overtime', label:'Overtime', icon:'overtime', module:'overtime' } domain",
  /\{\s*id:\s*'overtime',\s*label:\s*'Overtime',\s*icon:\s*'overtime',\s*module:\s*'overtime',/m.test(bdCode),
  bdCode.match(/id:\s*'overtime'[^\n]*/)?.[0]);
check("its screens reuse cfg.otMenuTitles -> land.navOvertime (no new handler/module)",
  /id:\s*'overtime',[\s\S]{0,200}?otMenuTitles\)\.map\(\(\[id, label\]\) => \(\{\s*id, label, land: \(\) => land\.navOvertime\(id\),/m.test(bdCode));
check('domainVisible() gates a whole domain on cfg.canAccessModule(moduleForDomain(domain))',
  /function domainVisible\(domain\)\s*\{\s*return cfg\.canAccessModule\(moduleForDomain\(domain\)\)/m.test(shell));
check("moduleForDomain() returns domain.module (module:'overtime' => canAccessModule('overtime') gate)",
  /function moduleForDomain\(domain\)\s*\{\s*return domain\.module;/m.test(shell));

console.log('\n[2 — still respects overtime.view, no new permission]');
check("the shell routes purely through canAccessModule — it never names a raw overtime.* permission id",
  !/overtime\.(view|manage)/.test(shell.replace(/\/\/[^\n]*/g, '')));
check("js/app.js MODULE_PERMISSIONS still maps overtime -> 'overtime.view' (unchanged gate)",
  /overtime:\s*'overtime\.view'/.test(app));
check("js/app.js canAccessModule('overtime') still resolves via MODULE_PERMISSIONS -> can(permission)",
  /const permission = MODULE_PERMISSIONS\[name\];\s*return permission \? can\(permission\) : false;/m.test(app));

console.log('\n[3 — no duplicate / not nested in Finance]');
const overtimeIdHits = (bdCode.match(/id:\s*'overtime'/g) || []).length;
check("exactly ONE id:'overtime' in buildDomains()", overtimeIdHits === 1, `found ${overtimeIdHits}`);
const financeToOvertime = bdCode.slice(idx("id: 'finance'"), idx("id: 'overtime'"));
check("the Finance domain block (finance -> overtime) has no nested id:'overtime' and no land.navOvertime",
  !/id:\s*'overtime'/.test(financeToOvertime) && !/navOvertime/.test(financeToOvertime),
  financeToOvertime.match(/navOvertime[^\n]*/)?.[0]);

console.log('\n[4 — Finance still valid]');
check("Finance domain still present: { id:'finance', label:'Finance', icon:'finance', module:'pettycash' }",
  /\{\s*id:\s*'finance',\s*label:\s*'Finance',\s*icon:\s*'finance',\s*module:\s*'pettycash',/m.test(bdCode));
check('Finance screens still derived from cfg.pcMenuTitles via land.navPettyCash',
  /id:\s*'finance',[\s\S]{0,160}?pcMenuTitles\)\.map\(\(\[id, label\]\) => \(\{\s*id, label, land: \(\) => land\.navPettyCash\(id\),/m.test(bdCode));
check('rail order is Finance, then Overtime, then Engineering (requested desktop order)',
  idx("id: 'finance'") >= 0 && idx("id: 'finance'") < idx("id: 'overtime'")
  && idx("id: 'overtime'") < idx("id: 'engineering'"));

console.log('\n[5 — mobile "Lainnya" still reaches Overtime]');
check("js/app.js BOTTOM_NAV_MORE_ITEMS still lists Overtime, gated by requiresModule:'overtime'",
  /\{\s*label:\s*'Overtime',\s*proxy:\s*'btnOvertime',\s*requiresModule:\s*'overtime'\s*\}/.test(app));
check('the "Lainnya" sheet still filters entries through canAccessModule(it.requiresModule)',
  /\.filter\(\(it\) => !it\.requiresModule \|\| canAccessModule\(it\.requiresModule\)\)/.test(app));
check("#btnOvertime still routes to setRailModule('overtime')",
  /getElementById\('btnOvertime'\)\?\.addEventListener\('click', \(\) => setRailModule\('overtime'\)\)/.test(app));

console.log('\n[6 — rail icon resolves]');
check("AN_ICON_PATHS has an 'overtime' glyph (svgIcon('overtime') is not an empty path)",
  /\n\s*overtime:\s*'M[^']+',/.test(icons));

console.log(`\ndomain-shell-overtime-domain-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
