#!/usr/bin/env node
/**
 * vehicle-management-presentation-check.mjs
 * Presentation-layer contract for the Vehicle Management EXECUTIVE REDESIGN
 * (v1.18.2). Authoritative replacement for the earlier (superseded) v1.18.1 /
 * v1.18.1.1 checks, which asserted the very patterns this redesign removes
 * (People-card inventory, inline card buttons, KPI/insights wall).
 *
 * Verifies, file-statically (no DOM):
 *   • Executive Summary is a THIN strip (5 KPIs, no insights wall, no export).
 *   • Inventory is the hero (section header + responsive asset grid).
 *   • Asset cards replace .v2-user-card and carry NO inline action buttons.
 *   • Toolbar reuses the Analytics Reset + Export components.
 *   • Drawer gains an Operational section + footer lifecycle actions.
 *   • ZERO emoji anywhere in the Vehicle Management presentation files.
 *   • Tokens only; business logic untouched.
 */

'use strict';

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const P = (...p) => path.join(ROOT, ...p);
const read = (rel) => fs.readFileSync(P(rel), 'utf-8');

const dash  = read('js/components/fleet-dashboard.js');
const drawer = read('js/components/vehicle-detail-drawer.js');
const icons = read('js/components/icon-system.js');
const app   = read('js/app.js');
const css   = read('platform.css');

let PASS = 0, FAIL = 0;
const test = (label, ok) => { if (ok) { console.log(`✓ ${label}`); PASS++; } else { console.log(`✗ ${label}`); FAIL++; } };
const section = (t) => console.log(`\n━━━ ${t} ━━━`);

// Isolate the vehicle card builder from app.js for targeted assertions.
const cardStart = app.indexOf('function buildVehicleCard');
const cardSrc = cardStart >= 0 ? app.slice(cardStart, cardStart + 5000) : '';

// Broad emoji detector (pictographs + the unicode check marks/dashes the old UI used).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}✔✗✅❌️]/u;

section('Executive Summary — thin strip');
test('Dashboard exports renderFleetDashboard', dash.includes('export function renderFleetDashboard'));
test('Dashboard exports injectFleetDashboardStyles', dash.includes('export function injectFleetDashboardStyles'));
test('Uses thin .vms summary prefix', dash.includes('.vms{') || dash.includes('class="vms"'));
test('Has exactly the 5 executive KPIs', ['Armada', 'Perlu Perhatian', 'Kesehatan', 'Pajak Jatuh Tempo', 'Perawatan'].every(s => dash.includes(s)));
test('Insights wall removed (no renderInsights / .vm-insights)', !dash.includes('renderInsights') && !dash.includes('vm-insights'));
test('Export buttons removed from dashboard (no data-vm-export)', !dash.includes('data-vm-export'));
test('Imports the SVG icon system', dash.includes("import { renderIcon }") && dash.includes('renderIcon('));
test('No emoji in dashboard', !EMOJI.test(dash));
test('Token-driven (no hard-coded #fff/#000)', !dash.includes('#fff') && !dash.includes('#000'));

section('Inventory — the hero');
test('Section header present (Inventaris Kendaraan)', app.includes('vm-inv__title') && app.includes('Inventaris Kendaraan'));
test('Inventory list is a responsive grid (vm-grid)', app.includes('id="v2AdminVehicleList" class="vm-grid"'));
test('CSS defines .vm-grid responsive grid', css.includes('.vm-grid') && css.includes('repeat(auto-fill'));
test('CSS defines executive asset card .vm-asset', css.includes('.vm-asset'));
test('CSS defines section header .vm-inv__title', css.includes('.vm-inv__title'));

section('Asset card — not a person, no inline buttons');
test('buildVehicleCard renders .vm-asset card', cardSrc.includes('class="vm-asset'));
test('Asset card does NOT reuse the People card (.v2-user-card)', !cardSrc.includes('v2-user-card'));
test('No inline action buttons on the card', !cardSrc.includes('data-vehicle-edit') && !cardSrc.includes('data-vehicle-toggle') && !cardSrc.includes('data-vehicle-archive'));
test('Card uses SVG vehicle-type icon', cardSrc.includes('vehicleTypeIconName('));
test('Card shows a status strip of platform pills', cardSrc.includes('vm-asset__strip') && cardSrc.includes('vm-pill'));
test('Card shows last-activity footer', cardSrc.includes('vm-asset__foot') && (cardSrc.includes('Terakhir') || cardSrc.includes('Belum pernah ditugaskan')));
test('Whole card opens the drawer (data-vehicle-detail)', cardSrc.includes('data-vehicle-detail'));
test('No emoji in the vehicle card', !EMOJI.test(cardSrc));

section('Toolbar — reuse Analytics components');
test('Reuses Analytics reset button', app.includes('v2-analytics-reset-btn') && app.includes('v2AdminVehicleReset'));
test('Reuses Analytics export component', app.includes('id="v2VehicleExport"') && app.includes('v2-analytics-export'));
test('Export delegates to shared pipeline (runAnalyticsExport)', app.includes("runAnalyticsExport(item.dataset.report, _vehExportBtn)"));
test('Type filter options carry no emoji', !/VEHICLE_TYPE_REGISTRY\.map\(t => `<option value="\$\{t\.key\}">\$\{t\.icon\}/.test(app));
test('app.js imports vehicleTypeIconName', app.includes('vehicleTypeIconName'));

section('Drawer — Operational section + footer actions');
test('Drawer imports icon system', drawer.includes("import { renderIcon, vehicleTypeIconName }"));
test('Drawer adds an Operational section', drawer.includes("function renderOperational") && drawer.includes("section('Operational')"));
test('Footer carries lifecycle actions', ['vadToggleBtn', 'vadArchiveBtn', 'vadRestoreBtn', 'vadDeleteBtn', 'vadEditBtn'].every(id => drawer.includes(id)));
test('No emoji in the drawer', !EMOJI.test(drawer));

section('Icon system');
test('Exports vehicleTypeIconName', icons.includes('export function vehicleTypeIconName'));
test('Has a motorcycle glyph (no emoji fallback)', icons.includes("'vehicle-motorcycle'"));
test('Has asset-strip glyphs (tax/shield/wrench/clock)', ["'doc-tax'", "'doc-shield'", "'tool-wrench'", "'time-clock'"].every(s => icons.includes(s)));

section('Business logic untouched');
test('computeFleetAssetModel still used', app.includes('computeFleetAssetModel'));
test('Vehicle store functions unchanged', app.includes('deactivateVehicle') && app.includes('archiveVehicle') && app.includes('restoreVehicle'));
test('No new Firebase calls introduced in dashboard', !dash.includes('Firebase') && !dash.includes('firebase'));

section('Summary');
console.log(`\nPassed: ${PASS}\nFailed: ${FAIL}\nTotal:  ${PASS + FAIL}`);
process.exit(FAIL > 0 ? 1 : 0);
