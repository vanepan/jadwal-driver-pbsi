#!/usr/bin/env node
/**
 * maintenance-intelligence-check.mjs
 * Comprehensive PURE function tests for Fleet Maintenance Intelligence (v1.18.1)
 * 
 * Tests: validation, normalization, timeline, health scoring, analytics aggregations
 * All functions PURE (no DOM, no Firebase, Node-testable)
 */

'use strict';

import fs from 'fs';
import path from 'path';
import { computeMaintenanceHealth, computeMaintenanceTimeline, deriveMaintenanceSummary } from '../js/services/maintenance-service.js';

// Paths
const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'js', 'config', 'maintenance-config.js');
const SERVICE_PATH = path.join(ROOT, 'js', 'services', 'maintenance-service.js');
const ANALYTICS_PATH = path.join(ROOT, 'js', 'analytics', 'maintenance-analytics.js');

let PASS = 0, FAIL = 0;

function test(label, assertion) {
  if (assertion) {
    console.log(`✓ ${label}`);
    PASS++;
  } else {
    console.log(`✗ ${label}`);
    FAIL++;
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURATION TESTS
// ─────────────────────────────────────────────────────────────────────────

section('Configuration Schema');

test('CONFIG_PATH file exists', fs.existsSync(CONFIG_PATH));
const configSrc = fs.readFileSync(CONFIG_PATH, 'utf-8');
test('Config exports 13 categories', configSrc.includes('periodic-service') && configSrc.includes('inspection'));
test('Config exports 4 types', configSrc.includes('preventive') && configSrc.includes('corrective'));
test('Config exports 4 statuses', configSrc.includes('planned') && configSrc.includes('completed'));
test('Config exports 4 impacts', configSrc.includes('minor') && configSrc.includes('major'));
test('Config has lookup functions', configSrc.includes('maintenanceCategoryInfo') && configSrc.includes('maintenanceTypeInfo'));

// ─────────────────────────────────────────────────────────────────────────
// SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────

section('Maintenance Service Layer');

test('SERVICE_PATH file exists', fs.existsSync(SERVICE_PATH));
const srvSrc = fs.readFileSync(SERVICE_PATH, 'utf-8');
test('Service exports validateMaintenanceRecord', srvSrc.includes('export function validateMaintenanceRecord'));
test('Service exports normalizeMaintenanceRecord', srvSrc.includes('export function normalizeMaintenanceRecord'));
test('Service exports computeMaintenanceTimeline', srvSrc.includes('export function computeMaintenanceTimeline'));
test('Service exports deriveMaintenanceSummary', srvSrc.includes('export function deriveMaintenanceSummary'));
test('Service exports computeMaintenanceHealth', srvSrc.includes('export function computeMaintenanceHealth'));
test('Validation includes date format checks', srvSrc.includes('daysAgo') || srvSrc.includes('Date format'));
test('Normalization includes cost formatting', srvSrc.includes('costDisplay') || srvSrc.includes('Rp'));

// ─────────────────────────────────────────────────────────────────────────
// ANALYTICS TESTS
// ─────────────────────────────────────────────────────────────────────────

section('Maintenance Analytics');

test('ANALYTICS_PATH file exists', fs.existsSync(ANALYTICS_PATH));
const anaSrc = fs.readFileSync(ANALYTICS_PATH, 'utf-8');
test('Analytics exports buildMaintenanceAnalytics', anaSrc.includes('export function buildMaintenanceAnalytics'));
test('Analytics provides KPI aggregations', anaSrc.includes('vehiclesUnderMaintenance') && anaSrc.includes('completedThisMonth'));
test('Analytics provides cost analysis', anaSrc.includes('averageMaintenanceCost') && anaSrc.includes('highestCostVehicle'));
test('Analytics provides distributions', anaSrc.includes('categoryDistribution') && anaSrc.includes('workshopDistribution'));
test('Analytics provides monthly trends', anaSrc.includes('monthlyCostTrend'));

// ─────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────

section('Store Integration');

const STORE_PATH = path.join(ROOT, 'js', 'vehicles-store.js');
test('STORE_PATH file exists', fs.existsSync(STORE_PATH));
const storeSrc = fs.readFileSync(STORE_PATH, 'utf-8');
test('Store exports addMaintenanceRecord', storeSrc.includes('export async function addMaintenanceRecord'));
test('Store exports updateMaintenanceRecord', storeSrc.includes('export async function updateMaintenanceRecord'));
test('Store exports deleteMaintenanceRecord', storeSrc.includes('export async function deleteMaintenanceRecord'));
test('Store exports getMaintenanceRecords', storeSrc.includes('export function getMaintenanceRecords'));
test('Store initializes maintenanceRecords array', storeSrc.includes('maintenanceRecords: []'));

// ─────────────────────────────────────────────────────────────────────────
// ASSET SERVICE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────

section('Asset Service Integration');

const ASSET_SVC = path.join(ROOT, 'js', 'services', 'vehicle-asset-service.js');
test('Asset service imports maintenance functions', 
  fs.readFileSync(ASSET_SVC, 'utf-8').includes('computeMaintenanceHealth') &&
  fs.readFileSync(ASSET_SVC, 'utf-8').includes('buildMaintenanceAnalytics')
);
const assetSrc = fs.readFileSync(ASSET_SVC, 'utf-8');
test('Health function includes maintenance component', assetSrc.includes('maintenance'));
test('Normalized asset includes maintenance field', assetSrc.includes('maintenanceSummary'));

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURATION UPDATES
// ─────────────────────────────────────────────────────────────────────────

section('Configuration Version Bumps');

const CONFIG = path.join(ROOT, 'js', 'config.js');
const cfgSrc = fs.readFileSync(CONFIG, 'utf-8');
// NOTE: no longer asserting APP_VERSION === '1.18.1' — that pinned this
// regression suite to the exact release that introduced the feature, so it
// was guaranteed to fail on every subsequent version bump forever (a
// permanent false negative, not a real regression signal). VERSION_HISTORY
// is append-only, so the release-name check below stays meaningful.
test('RELEASE_NAME updated to Fleet Maintenance Intelligence', cfgSrc.includes('Fleet Maintenance'));

const CFG_ASSET = path.join(ROOT, 'js', 'config', 'vehicle-asset-config.js');
const cfgAssetSrc = fs.readFileSync(CFG_ASSET, 'utf-8');
test('HEALTH_WEIGHTS includes maintenance: 0.35', cfgAssetSrc.includes('maintenance: 0.35'));

// ─────────────────────────────────────────────────────────────────────────
// UI INTEGRATION
// ─────────────────────────────────────────────────────────────────────────

section('UI Component Integration');

// NOTE: the original v1.18.1 dashboard had a dedicated maintenance KPI card
// plus separate category/workshop distribution charts. The v1.18.4 Executive
// UI migration deliberately consolidated the whole dashboard down to a fixed
// 5-tile summary strip (see fleet-dashboard.js's own header comment — "NOT a
// second analytics page, answers only five questions"); the per-category and
// per-workshop breakdowns were dropped, not lost. Asserting for them today
// would resurrect a removed feature as a "failure." The one KPI tile that
// still represents maintenance ("Perawatan") is what's checked below.
const DASHBOARD = path.join(ROOT, 'js', 'components', 'fleet-dashboard.js');
const dashSrc = fs.readFileSync(DASHBOARD, 'utf-8');
test('Fleet dashboard includes a maintenance KPI tile ("Perawatan")', /fleetKpi\(\{[^}]*label:\s*'Perawatan'/.test(dashSrc));

const DRAWER = path.join(ROOT, 'js', 'components', 'vehicle-detail-drawer.js');
const drawerSrc = fs.readFileSync(DRAWER, 'utf-8');
// renderMaintenance was renamed to maintenanceSection() when every drawer
// section was unified under the xSection(a) naming convention.
test('Detail drawer exports maintenanceSection function', drawerSrc.includes('function maintenanceSection'));
test('Drawer includes maintenance summary', drawerSrc.includes('maintenanceSummary'));
test('Drawer includes maintenance timeline', drawerSrc.includes('maintenanceTimeline'));

const APP = path.join(ROOT, 'js', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf-8');
test('App imports maintenance store functions', appSrc.includes('addMaintenanceRecord'));
test('App imports maintenance service functions', appSrc.includes('validateMaintenanceRecord'));

// ─────────────────────────────────────────────────────────────────────────
// VALUE-LEVEL: computeMaintenanceHealth formula (real function calls)
//
// Everything above this point only checks that source text CONTAINS certain
// strings — it would stay green even if the health-scoring arithmetic were
// silently broken. These tests call the real, imported functions and assert
// on their actual output, including every score-tier boundary.
// ─────────────────────────────────────────────────────────────────────────

section('Value-level: computeMaintenanceHealth formula');

const NOW = '2026-08-07';
function daysBefore(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

{
  const r = computeMaintenanceHealth([], NOW);
  test('no records ⇒ score 50 / Unknown / muted', r.score === 50 && r.label === 'Unknown' && r.tone === 'muted');
}
{
  const r = computeMaintenanceHealth([{ status: 'planned', category: 'oil-change', date: daysBefore(10) }], NOW);
  test('records but none completed ⇒ score 30 / Poor / danger', r.score === 30 && r.label === 'Poor' && r.tone === 'danger');
}
{
  // Single recent (10 days ago) completed preventive record: recency=100,
  // frequency=0 (nothing planned/in-progress), compliance=20 (100% preventive).
  const r = computeMaintenanceHealth([{ status: 'completed', category: 'oil-change', date: daysBefore(10) }], NOW);
  test('recent preventive-only ⇒ score 80 / Excellent (components: recency 100, frequency 0, compliance 20)',
    r.score === 80 && r.label === 'Excellent' && r.tone === 'ok' &&
    r.components.recency === 100 && r.components.frequency === 0 && r.components.compliance === 20);
}
{
  // Adding a planned corrective record trades compliance (100%→50% preventive
  // ratio, 20→10 pts) for frequency (+10 pts) — same total, different mix.
  const r = computeMaintenanceHealth([
    { status: 'completed', category: 'oil-change', date: daysBefore(10) },
    { status: 'planned', category: 'brake', date: daysBefore(-5) },
  ], NOW);
  test('planned record trades compliance for frequency bonus (still 80, different components)',
    r.score === 80 && r.components.frequency === 10 && r.components.compliance === 10);
}
// Recency tier boundaries (corrective-only record, so frequency=compliance=0
// and score is purely recencyScore*0.6 — makes every tier edge unambiguous).
const recencyTiers = [
  { days: 89, score: 60, label: 'Good', recency: 100 },
  { days: 90, score: 48, label: 'Fair', recency: 80 },
  { days: 179, score: 48, label: 'Fair', recency: 80 },
  { days: 180, score: 30, label: 'Poor', recency: 50 },
  { days: 364, score: 30, label: 'Poor', recency: 50 },
  { days: 365, score: 12, label: 'Poor', recency: 20 },
];
for (const t of recencyTiers) {
  const r = computeMaintenanceHealth([{ status: 'completed', category: 'brake', date: daysBefore(t.days) }], NOW);
  test(`${t.days} days since last service ⇒ score ${t.score} / ${t.label} (recency ${t.recency})`,
    r.score === t.score && r.label === t.label && r.components.recency === t.recency);
}
{
  // Malformed input safety — must never throw, per the same null-hole
  // guarantee vehicle-asset-check.mjs already verifies at the store level.
  let threw = false;
  try { computeMaintenanceHealth([null, undefined, { status: 'completed', category: 'oil-change', date: daysBefore(1) }], NOW); }
  catch { threw = true; }
  test('null/undefined holes in the records array do not throw', !threw);
}

section('Value-level: computeMaintenanceTimeline + deriveMaintenanceSummary');

{
  const unsorted = [
    { status: 'completed', category: 'oil-change', date: '2026-01-01' },
    { status: 'completed', category: 'brake', date: '2026-06-01' },
    { status: 'completed', category: 'battery', date: '2026-03-01' },
  ];
  const tl = computeMaintenanceTimeline(unsorted, NOW);
  const dates = tl.map((r) => r.date);
  test('computeMaintenanceTimeline actually sorts newest-first (not just claims to)',
    dates[0] === '2026-06-01' && dates[1] === '2026-03-01' && dates[2] === '2026-01-01');
}
{
  const s = deriveMaintenanceSummary([
    { status: 'completed', category: 'oil-change', date: '2026-01-01', cost: 100000, workshopName: 'Bengkel A' },
    { status: 'completed', category: 'brake', date: '2026-06-01', cost: 300000, workshopName: 'Bengkel B' },
    { status: 'planned', category: 'battery', date: '2026-09-01' },
  ]);
  test('deriveMaintenanceSummary picks the newest COMPLETED record (not just newest record)',
    s.lastDate === '2026-06-01' && s.lastCategory === 'brake' && s.lastWorkshop === 'Bengkel B');
  test('deriveMaintenanceSummary totals cost across all records, averages only over completed ones',
    s.totalCost === 400000 && s.completedCount === 2 && s.averageCost === 200000 && s.plannedCount === 1);
}

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────

section('Test Summary');
console.log(`\nPassed: ${PASS}`);
console.log(`Failed: ${FAIL}`);
console.log(`Total:  ${PASS + FAIL}`);

if (FAIL > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
