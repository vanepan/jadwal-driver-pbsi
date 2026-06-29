/* Executive UI Kit foundation check (v1.18.3).
   Renders every kit primitive in a non-DOM context and asserts:
     • each builder returns a non-empty string
     • all 15 newly-added anIcon glyphs resolve to a non-empty <path>
     • NO emoji leak into kit output (SVG-only mandate)
     • ExecutiveTable emits sortable headers + numeric alignment + a row id
     • ExecutiveKPICard injects a sparkline only when `spark` is supplied
   Pure presentation; no Firebase, no engine, no DOM. */

import {
  anIcon,
  ExecutiveHeader, ExecutiveToolbar, ExecutiveFilterBar, ExecutiveSearch,
  ExecutiveReset, ExecutiveBadge, ExecutiveMetric, ExecutiveCard,
  ExecutiveSparkline, ExecutiveKPICard, ExecutiveStatusPill, ExecutiveTable,
  ExecutiveSection, ExecutiveExport, ExecutivePermissionState, ExecutiveOfflineState,
  ExecutiveDrawerSection, ExecutiveDrawerMetrics, ExecutiveDrawerTimeline,
  EXECUTIVE_UI_KIT_VERSION,
} from '../js/analytics/executive-ui-kit.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); } }

const NEW_ICONS = ['vehicle', 'motorcycle', 'ambulance', 'fleet', 'maintenance', 'history',
  'insurance', 'tax', 'dispatch', 'recommendation', 'wellness', 'analytics', 'pettycash',
  'drawer', 'timeline', 'search', 'sort', 'lock', 'offline'];

// 1. Icons resolve, are <svg> with a non-empty path.
for (const name of NEW_ICONS) {
  const svg = anIcon(name);
  ok(`icon:${name}`, /^<svg/.test(svg) && /<path d="M?[^"]+"/.test(svg) && !/d=""/.test(svg));
}

// 2. Builders return non-empty strings.
const samples = {
  ExecutiveHeader: ExecutiveHeader({ title: 'Test', subtitle: 'Sub', meta: '2026', icon: 'analytics' }),
  ExecutiveToolbar: ExecutiveToolbar({ left: 'L', right: 'R' }),
  ExecutiveFilterBar: ExecutiveFilterBar({ seg: '<div class="seg"></div>', controls: '<select></select>' }),
  ExecutiveSearch: ExecutiveSearch({ placeholder: 'Cari driver', name: 'driver' }),
  ExecutiveReset: ExecutiveReset({}),
  ExecutiveBadge: ExecutiveBadge('Aktif', { tone: 'ok' }),
  ExecutiveMetric: ExecutiveMetric({ label: 'Saldo', value: 'Rp 10', tone: 'ok' }),
  ExecutiveCard: ExecutiveCard({ content: 'x' }),
  ExecutiveSparkline: ExecutiveSparkline([1, 5, 2, 8, 3]),
  ExecutiveStatusPill: ExecutiveStatusPill('OK', 'ok'),
  ExecutiveSection: ExecutiveSection({ tag: 'T', title: 'Title', sub: 'Sub' }),
  ExecutiveExport: ExecutiveExport({ pdf: 'do-pdf', excel: 'do-xls' }),
  ExecutivePermissionState: ExecutivePermissionState({}),
  ExecutiveOfflineState: ExecutiveOfflineState({}),
  ExecutiveDrawerSection: ExecutiveDrawerSection({ title: 'S', content: 'c' }),
  ExecutiveDrawerMetrics: ExecutiveDrawerMetrics([{ label: 'A', value: '1' }]),
  ExecutiveDrawerTimeline: ExecutiveDrawerTimeline([{ when: 'now', title: 'E', tone: 'ok' }]),
};
for (const [name, html] of Object.entries(samples)) {
  ok(`builder:${name}`, typeof html === 'string' && html.trim().length > 0);
}

// 3. No emoji in any kit output (SVG-only mandate). Covers the common emoji ranges.
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/u;
const allOut = Object.values(samples).join('\n') + NEW_ICONS.map(anIcon).join('\n');
ok('no-emoji-in-kit', !emoji.test(allOut));

// 4. ExecutiveTable structure.
const table = ExecutiveTable({
  columns: [
    { key: 'name', label: 'Driver', primary: true },
    { key: 'trips', label: 'Trip', align: 'right', sortable: true },
    { key: 'state', label: 'Status', pill: () => 'ok' },
  ],
  rows: [
    { id: 'd1', clickable: true, name: 'Budi', trips: 12, state: 'Sehat' },
    { id: 'd2', clickable: true, name: 'Andi', trips: 4, state: 'Sehat' },
  ],
});
ok('table:sortable-header', /data-exec-sortable="1"/.test(table) && /aria-sort="none"/.test(table));
ok('table:numeric-align', /exec-td--r/.test(table));
ok('table:row-id', /data-row-id="d1"/.test(table) && /role="button"/.test(table));
ok('table:pill-cell', /exec-pill exec-pill--ok/.test(table));
ok('table:empty-state', /exec-table-empty/.test(ExecutiveTable({ columns: [{ key: 'a', label: 'A' }], rows: [] })));

// 5. ExecutiveKPICard sparkline is opt-in.
const kpiPlain = ExecutiveKPICard({ title: 'Trip', value: '12' });
const kpiSpark = ExecutiveKPICard({ title: 'Trip', value: '12', spark: [1, 2, 3, 4] });
ok('kpi:no-spark-by-default', !/exec-kpi-spark/.test(kpiPlain));
ok('kpi:spark-when-provided', /exec-kpi-spark/.test(kpiSpark) && /<polyline/.test(kpiSpark));

// 6. Export convenience renders enabled + "soon" formats.
const exp = ExecutiveExport({ pdf: 'do-pdf' });
ok('export:enabled-pdf', /data-action="do-pdf"/.test(exp));
ok('export:soon-chip', /Segera hadir/.test(exp));

console.log(`Executive UI Kit v${EXECUTIVE_UI_KIT_VERSION}`);
console.log(`checks: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach((f) => console.log('   ✗', f)); }
console.log('\nKIT CHECK:', fail === 0 ? 'PASS' : 'FAIL');
process.exit(fail === 0 ? 0 : 1);
