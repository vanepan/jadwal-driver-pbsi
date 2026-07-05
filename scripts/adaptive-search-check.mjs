/* adaptive-search-check.mjs — validates the module-aware global search registry
   (v1.20.2): adapters register behind the common interface, placeholders + run
   delegation resolve per module, unknown modules degrade safely, and clear works.
   Run: node scripts/adaptive-search-check.mjs   (exit 0 = all pass) */

import {
  registerSearchAdapter, getSearchAdapter, hasSearchAdapter, searchPlaceholder,
  runModuleSearch, clearModuleSearch, registeredModules, DEFAULT_PLACEHOLDER,
} from '../js/services/adaptive-search.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const calls = [];
registerSearchAdapter({ id: 'driverops', placeholder: 'Cari driver…', run: (q) => calls.push(['driverops', q]) });
registerSearchAdapter({ id: 'engineering', placeholder: 'Cari penugasan…', run: (q) => calls.push(['engineering', q]) });
registerSearchAdapter({ id: 'pettycash', placeholder: 'Cari NOR…', run: (q) => calls.push(['pettycash', q]) });
let cleared = false;
registerSearchAdapter({ id: 'analytics', placeholder: 'Cari KPI…', run: (q) => calls.push(['analytics', q]), clear: () => { cleared = true; } });

console.log('\n[registry]');
check('all four modules registered', ['driverops', 'engineering', 'pettycash', 'analytics'].every((m) => hasSearchAdapter(m)));
check('registeredModules lists them', registeredModules().length >= 4);
check('getSearchAdapter returns the adapter', getSearchAdapter('engineering').id === 'engineering');

console.log('\n[placeholders]');
check('per-module placeholder resolves', searchPlaceholder('pettycash') === 'Cari NOR…');
check('unknown module falls back to default placeholder', searchPlaceholder('konfigurasi') === DEFAULT_PLACEHOLDER);

console.log('\n[delegation]');
runModuleSearch('engineering', 'AC');
check('runModuleSearch delegates to the active adapter', calls.some(([m, q]) => m === 'engineering' && q === 'AC'));
runModuleSearch('nope', 'x');
check('unknown module search is a safe no-op', !calls.some(([m]) => m === 'nope'));

console.log('\n[clear]');
clearModuleSearch('analytics');
check('clear() called when provided', cleared === true);
clearModuleSearch('driverops');
check('clear falls back to run("") when no clear()', calls.some(([m, q]) => m === 'driverops' && q === ''));

console.log('\n[validation]');
let threw = false;
try { registerSearchAdapter({ id: 'bad' }); } catch (_) { threw = true; }
check('rejects an adapter without run()', threw);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
