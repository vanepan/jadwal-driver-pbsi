#!/usr/bin/env node
/**
 * vehicle-management-presentation-check.mjs
 * Presentation-layer contract for the Vehicle Management EXECUTIVE UI MIGRATION
 * (v1.18.4 — Sprint 2). Authoritative replacement for the v1.18.2 redesign check,
 * which asserted the bespoke patterns this migration RETIRES (.vms__kpi tiles,
 * .vad-* drawer, renderIcon, .vm-pill badges).
 *
 * Verifies, file-statically (no DOM), that Vehicle Management now consumes the
 * Executive UI Kit as its SINGLE design authority:
 *   • Dashboard KPIs use ExecutiveKPICard + the single icon engine (anIcon).
 *   • Inventory header + toolbar use the Executive header/toolbar (.exec-*),
 *     while PRESERVING the filter ids + the shared runAnalyticsExport pipeline.
 *   • Asset cards use ExecutiveStatusPill + anIcon (no .vm-pill, no renderIcon).
 *   • The detail drawer is the Executive drawer (openExecutiveDrawer + slots),
 *     not the bespoke .vad-* overlay.
 *   • The icon engine gained the ported vehicle glyphs (+ alias map).
 *   • ZERO emoji anywhere; tokens only; business logic + Firebase untouched.
 */

'use strict';

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const P = (...p) => path.join(ROOT, ...p);
const read = (rel) => fs.readFileSync(P(rel), 'utf-8');

const dash   = read('js/components/fleet-dashboard.js');
const drawer = read('js/components/vehicle-detail-drawer.js');
const icons  = read('js/components/icon-system.js');
const shell  = read('js/analytics/analytics-shell.js');
const app    = read('js/app.js');
const css    = read('platform.css');

let PASS = 0, FAIL = 0;
const test = (label, ok) => { if (ok) { console.log(`✓ ${label}`); PASS++; } else { console.log(`✗ ${label}`); FAIL++; } };
const section = (t) => console.log(`\n━━━ ${t} ━━━`);

// Isolate the vehicle card builder from app.js for targeted assertions.
const cardStart = app.indexOf('function buildVehicleCard');
const cardSrc = cardStart >= 0 ? app.slice(cardStart, cardStart + 5000) : '';

// Broad emoji detector (pictographs + the unicode check marks/dashes the old UI used).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}✔✗✅❌️]/u;

section('Icon engine — single source (anIcon), vehicle glyphs ported');
test('analytics-shell defines an alias map', shell.includes('AN_ICON_ALIASES'));
test('ported status glyph present', shell.includes("'status-active'") && shell.includes("'status-inactive'"));
test('ported legal/health glyphs present', shell.includes("'legal-warning'") && shell.includes("'health-ok'"));
test('archive glyph present', /archive:\s*'/.test(shell));
test('aliases resolve doc-tax / tool-wrench / time-clock / vehicle-car', ["'doc-tax'", "'tool-wrench'", "'time-clock'", "'vehicle-car'"].every(s => shell.includes(s)));

section('Executive Summary — thin strip on the kit');
test('Dashboard exports renderFleetDashboard', dash.includes('export function renderFleetDashboard'));
test('Dashboard exports injectFleetDashboardStyles', dash.includes('export function injectFleetDashboardStyles'));
test('Uses thin .vms summary prefix', dash.includes('.vms{') || dash.includes('class="vms'));
test('KPIs use ExecutiveKPICard / ExecutiveKPIGrid from the kit', dash.includes('ExecutiveKPICard') && dash.includes('executive-ui-kit'));
test('Has exactly the 5 executive KPIs', ['Armada', 'Perlu Perhatian', 'Kesehatan', 'Pajak Jatuh Tempo', 'Perawatan'].every(s => dash.includes(s)));
test('Bespoke .vms__kpi tiles removed', !dash.includes('vms__kpi'));
test('Single icon engine (anIcon, not renderIcon)', dash.includes('anIcon(') && !dash.includes('renderIcon'));
test('No emoji in dashboard', !EMOJI.test(dash));
test('Token-driven (no hard-coded #fff/#000)', !dash.includes('#fff') && !dash.includes('#000'));

section('Inventory header + toolbar — Executive UI, ids preserved');
test('Header uses Executive header (.exec-head)', app.includes('class="exec-head"') && app.includes('Inventaris Kendaraan'));
test('Old .vm-inv__ header retired', !app.includes('vm-inv__'));
test('Toolbar uses Executive toolbar/search/reset', app.includes('exec-toolbar') && app.includes('exec-search') && app.includes('exec-reset'));
test('Inventory list is a responsive grid (vm-grid)', app.includes('id="v2AdminVehicleList" class="vm-grid"'));
{
  const ids = ['v2AdminVehicleSearch', 'v2AdminVehicleTypeFilter', 'v2AdminVehicleStatusFilter', 'v2AdminVehicleFuelFilter', 'v2AdminVehicleTransmissionFilter', 'v2AdminVehicleReset', 'v2VehicleExportBtn', 'v2VehicleExportMenu', 'v2AdminAddVehicle'];
  test('All toolbar element ids preserved (wiring intact)', ids.every(id => app.includes(`id="${id}"`)));
}
test('Export still delegates to shared pipeline (runAnalyticsExport)', app.includes('runAnalyticsExport(item.dataset.report, _vehExportBtn)'));

section('Asset card — Executive badges + single icon engine');
test('buildVehicleCard renders .vm-asset card', cardSrc.includes('class="vm-asset'));
test('Asset card does NOT reuse the People card (.v2-user-card)', !cardSrc.includes('v2-user-card'));
test('No inline action buttons on the card', !cardSrc.includes('data-vehicle-edit') && !cardSrc.includes('data-vehicle-toggle') && !cardSrc.includes('data-vehicle-archive'));
test('Card uses SVG vehicle-type icon via anIcon', cardSrc.includes('vehicleTypeIconName(') && cardSrc.includes('anIcon('));
test('Card status strip uses ExecutiveStatusPill (no .vm-pill)', cardSrc.includes('ExecutiveStatusPill') && !cardSrc.includes('vm-pill'));
test('Card no longer uses renderIcon', !cardSrc.includes('renderIcon('));
test('Card shows last-activity footer', cardSrc.includes('vm-asset__foot') && (cardSrc.includes('Terakhir') || cardSrc.includes('Belum pernah ditugaskan')));
test('Whole card opens the drawer (data-vehicle-detail)', cardSrc.includes('data-vehicle-detail'));
test('app.js imports ExecutiveStatusPill', app.includes('ExecutiveStatusPill'));
test('Bespoke .vm-pill CSS removed from platform.css', !css.includes('.vm-pill'));
test('No emoji in the vehicle card', !EMOJI.test(cardSrc));

section('Detail drawer — the Executive drawer (kit), not .vad-*');
test('Drawer imports the Executive UI Kit', drawer.includes('executive-ui-kit.js'));
test('Drawer opens via openExecutiveDrawer (ExecutiveDrawerOpen)', drawer.includes('ExecutiveDrawerOpen') && drawer.includes('openExecutiveDrawer('));
test('Drawer composes with kit slots (section/metrics/timeline)', drawer.includes('execDrawerSection') && drawer.includes('execDrawerMetrics') && drawer.includes('execDrawerTimeline'));
test('Keeps an Operational section', drawer.includes("title: 'Operational'") || drawer.includes("'Operational'"));
test('Footer carries lifecycle actions', ["'toggle'", "'archive'", "'edit'", "'restore'", "'delete'"].every(a => drawer.includes(a)));
test('Bespoke .vad-* overlay retired', !drawer.includes('vad-overlay') && !drawer.includes('vad-sheet'));
test('Public openVehicleDetailDrawer signature retained', drawer.includes('export function openVehicleDetailDrawer'));
test('Drawer uses the single icon engine (no renderIcon)', !drawer.includes('renderIcon'));
test('No emoji in the drawer', !EMOJI.test(drawer));

section('Icon system — still serves the OTHER (non-vehicle) modules');
test('icon-system retains vehicleTypeIconName', icons.includes('export function vehicleTypeIconName'));

section('Import integrity — every vehicle-asset-service fn used is imported');
{
  const m = app.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/services\/vehicle-asset-service\.js['"]/);
  const imported = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  for (const fn of ['computeFleetAssetModel', 'findVehicleAsset', 'searchFilterVehicles']) {
    const usedAsCall = new RegExp(`[^.\\w]${fn}\\s*\\(`).test(app);
    test(`${fn} is imported (used as a call: ${usedAsCall})`, !usedAsCall || imported.includes(fn));
  }
}

section('Business logic untouched');
test('computeFleetAssetModel still used', app.includes('computeFleetAssetModel'));
test('Vehicle store functions unchanged', app.includes('deactivateVehicle') && app.includes('archiveVehicle') && app.includes('restoreVehicle'));
test('No new Firebase calls introduced in dashboard', !dash.includes('Firebase') && !dash.includes('firebase'));

section('Summary');
console.log(`\nPassed: ${PASS}\nFailed: ${FAIL}\nTotal:  ${PASS + FAIL}`);
process.exit(FAIL > 0 ? 1 : 0);
