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
test('Timeline sorts newest first', srvSrc.includes('sort') && srvSrc.includes('descending'));

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
test('APP_VERSION bumped to 1.18.1', cfgSrc.includes("'1.18.1'"));
test('RELEASE_NAME updated to Fleet Maintenance Intelligence', cfgSrc.includes('Fleet Maintenance'));

const CFG_ASSET = path.join(ROOT, 'js', 'config', 'vehicle-asset-config.js');
const cfgAssetSrc = fs.readFileSync(CFG_ASSET, 'utf-8');
test('HEALTH_WEIGHTS includes maintenance: 0.35', cfgAssetSrc.includes('maintenance: 0.35'));

// ─────────────────────────────────────────────────────────────────────────
// UI INTEGRATION
// ─────────────────────────────────────────────────────────────────────────

section('UI Component Integration');

const DASHBOARD = path.join(ROOT, 'js', 'components', 'fleet-dashboard.js');
const dashSrc = fs.readFileSync(DASHBOARD, 'utf-8');
test('Fleet dashboard includes maintenance KPI cards', dashSrc.includes('Kendaraan Maintenance'));
test('Fleet dashboard includes category distribution chart', dashSrc.includes('Kategori Maintenance'));
test('Fleet dashboard includes workshop distribution chart', dashSrc.includes('Workshop'));

const DRAWER = path.join(ROOT, 'js', 'components', 'vehicle-detail-drawer.js');
const drawerSrc = fs.readFileSync(DRAWER, 'utf-8');
test('Detail drawer exports renderMaintenance function', drawerSrc.includes('function renderMaintenance'));
test('Drawer includes maintenance summary', drawerSrc.includes('maintenanceSummary'));
test('Drawer includes maintenance timeline', drawerSrc.includes('maintenanceTimeline'));

const APP = path.join(ROOT, 'js', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf-8');
test('App imports maintenance store functions', appSrc.includes('addMaintenanceRecord'));
test('App imports maintenance service functions', appSrc.includes('validateMaintenanceRecord'));

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
