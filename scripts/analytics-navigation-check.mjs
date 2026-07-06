/* analytics-navigation-check.mjs — Analytics Navigation Integration (v1.17.6.1)

   PURE node source-analysis regression guard. The Analytics dashboards require an
   authenticated Firebase admin session to render the real workspace, so a runtime
   click test is not feasible in this harness. Instead this test parses the REAL
   source (js/app.js + platform.css) and asserts the COMPLETE desktop navigation
   call chain for every Dispatch Intelligence analytics surface:

     visible panel item → click handler → nav function → activeAdminSection
                        → renderV2AdminWorkspace branch → render function → container

   It is the exact guard that would have FAILED on the pre-patch bug (sections
   implemented but unreachable on desktop because no panel item ever set
   activeAdminSection to dispatchanalytics / wellness). It also verifies the mobile
   path is untouched (the in-content tab strip stays generated + desktop-hidden).
   Run: node scripts/analytics-navigation-check.mjs (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'platform.css'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/** Extract a small JS function body by name (heuristic slice — nav fns are tiny). */
function fnBody(name) {
  const i = APP.indexOf(`function ${name}(`);
  if (i < 0) return '';
  return APP.slice(i, i + 600);
}

/* The Dispatch Intelligence surfaces this patch makes desktop-reachable.
   v1.18.1: Recommendation Accuracy is now its OWN render page/section
   ('recommendationaccuracy') — independently rendered, no anchor scroll. */
const SURFACES = [
  { label: 'Dispatch Analytics', buttonId: 'v2NavDispatchAnalytics', navFn: 'navDispatchAnalytics', section: 'dispatchanalytics', render: 'renderDispatchAnalyticsSection', container: 'v2DispatchAnalyticsDashboard' },
  { label: 'Recommendation Accuracy', buttonId: 'v2NavRecommendationAccuracy', navFn: 'navRecommendationAccuracy', section: 'recommendationaccuracy', render: 'renderRecommendationAccuracySection', container: 'v2RecommendationAccuracyDashboard' },
  { label: 'Driver Wellness', buttonId: 'v2NavDriverWellness', navFn: 'navDriverWellness', section: 'wellness', render: 'renderDriverWellnessSection', container: 'v2DriverWellnessDashboard' },
];

console.log('\n[Feature 1 — Desktop panel items exist + correct order]');
const panelStart = APP.indexOf('id="v2PanelAnalyticsNav"');
const panelEnd = APP.indexOf('</nav>', panelStart);
const panel = APP.slice(panelStart, panelEnd);
check('Analytics panel nav block found', panelStart > 0 && panelEnd > panelStart);
for (const s of SURFACES) check(`panel button #${s.buttonId} present`, panel.includes(`id="${s.buttonId}"`));
const order = ['v2NavAnalyticsDriver', 'v2NavDispatchAnalytics', 'v2NavRecommendationAccuracy', 'v2NavDriverWellness', 'v2NavAnalyticsPetty', 'v2NavAnalyticsGabungan'];
const positions = order.map((id) => panel.indexOf(`id="${id}"`));
check('all 6 Analytics panel items present', positions.every((p) => p >= 0));
check('panel order: Driver · Dispatch · Recommendation · Wellness · Petty · Executive',
  positions.every((p, i) => i === 0 || p > positions[i - 1]));

console.log('\n[Feature 2 — Click handler wiring]');
for (const s of SURFACES) {
  check(`#${s.buttonId} click → ${s.navFn}`,
    new RegExp(`getElementById\\('${s.buttonId}'\\)\\?\\.addEventListener\\('click',\\s*${s.navFn}\\)`).test(APP));
}

console.log('\n[Feature 2 — nav functions set the correct activeAdminSection]');
for (const s of SURFACES) {
  const body = fnBody(s.navFn);
  check(`${s.navFn} defined`, body.length > 0);
  check(`${s.navFn} sets activeAdminModule = 'analytics'`, /activeAdminModule\s*=\s*'analytics'/.test(body));
  check(`${s.navFn} sets activeAdminSection = '${s.section}'`, new RegExp(`activeAdminSection\\s*=\\s*'${s.section}'`).test(body));
  check(`${s.navFn} renders the administration workspace`, /setWorkspace\('administration'\)/.test(body));
  check(`${s.navFn} highlights its panel item`, body.includes(`setV2PanelNavActive('${s.buttonId}')`));
}
const raBody = fnBody('navRecommendationAccuracy');
check('navRecommendationAccuracy is its own page (no anchor scrollIntoView)',
  !/scrollIntoView/.test(raBody));

console.log('\n[Feature 5 — render branch + render function + container]');
for (const s of SURFACES) {
  const branch = new RegExp(`activeAdminSection === '${s.section}'[\\s\\S]{0,400}?${s.render}\\(\\)`);
  check(`renderV2AdminWorkspace branch '${s.section}' → ${s.render}()`, branch.test(APP));
  check(`render function ${s.render} defined`, APP.includes(`function ${s.render}(`));
  check(`container #${s.container} exists in workspace template`, APP.includes(`id="${s.container}"`) || APP.includes(`id='${s.container}'`));
  check(`${s.render} writes into #${s.container}`,
    new RegExp(`function ${s.render}[\\s\\S]*?getElementById\\('${s.container}'\\)`).test(APP));
}

console.log('\n[Feature 5 — no unreachable analytics-module section]');
const modMatch = APP.match(/analytics:\s*\[([^\]]*)\]/);
const moduleSections = modMatch ? [...modMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
check('ADMIN_MODULE_SECTIONS.analytics parsed', moduleSections.length > 0);
// Every section in the analytics module must be reachable on desktop: either the
// module landing ('analytics' = navAnalyticsDriver) or via a panel item. The
// SURFACES list above covers the Dispatch Intelligence sections; the remaining
// analytics sections each have their own panel button + nav fn + render branch:
//   prediction → v2NavDriverPrediction / navDriverPrediction
//   executive  → v2NavAnalyticsGabungan / navAnalyticsExecutive
//   engineeringanalytics → v2NavAnalyticsEngineering / navAnalyticsEngineering (v1.20.2)
const OTHER_REACHABLE = { prediction: 'navDriverPrediction', executive: 'navAnalyticsExecutive', engineeringanalytics: 'navAnalyticsEngineering' };
const reachable = new Set(['analytics', ...SURFACES.map((s) => s.section), ...Object.keys(OTHER_REACHABLE)]);
for (const sec of moduleSections) {
  check(`analytics-module section '${sec}' is desktop-reachable`, reachable.has(sec));
}
// And each of those extra sections must actually wire a nav function that lands on it.
for (const [sec, navFn] of Object.entries(OTHER_REACHABLE)) {
  check(`section '${sec}' nav fn ${navFn} sets its activeAdminSection`,
    new RegExp(`function ${navFn}[\\s\\S]*?activeAdminSection\\s*=\\s*'${sec}'`).test(APP));
}
check('module landing navAnalyticsDriver sets activeAdminSection = \'analytics\'',
  /activeAdminSection\s*=\s*'analytics'/.test(fnBody('navAnalyticsDriver')));

console.log('\n[Feature 3/4 — single desktop source + mobile untouched]');
check('desktop hides the in-content tab strip (.v2-admin-nav display:none ≥768px)',
  /@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.v2-admin-nav\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(CSS));
check('mobile in-content tab strip still generated from ADMIN_SECTION_DEFS',
  /ADMIN_SECTION_DEFS\.map\(section\s*=>[\s\S]*?data-admin-section="\$\{section\.key\}"/.test(APP));
check('mobile Analytics segmented nav (#v2AnalyticsMobileNav) still present',
  APP.includes("nav.id = 'v2AnalyticsMobileNav'"));
check('mobile segmented nav still maps to driver/petty/exec only (unchanged)',
  /data-analytics-mnav="driver"/.test(APP) && /data-analytics-mnav="petty"/.test(APP) && /data-analytics-mnav="exec"/.test(APP));

console.log('\n[v1.18.1 — Recommendation Accuracy is its own registered section]');
check('recommendationaccuracy registered in ADMIN_SECTION_DEFS',
  /\{ key: 'recommendationaccuracy'/.test(APP));
check('recommendationaccuracy is centrally hidden unless active',
  /v2AdminSectionRecommendationAccuracy[\s\S]{0,200}?activeAdminSection === 'recommendationaccuracy'/.test(APP));
const daStart = APP.indexOf('function renderDispatchAnalyticsSection');
const daBody = daStart < 0 ? '' : APP.slice(daStart, APP.indexOf('\nfunction ', daStart + 1));
check('Dispatch Analytics no longer renders RA inline (decoupled)',
  daBody.length > 0 && !daBody.includes('renderRecommendationAccuracySection('));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
