/* engineering-ui-dom-check.mjs — validates the Engineering Operations UI
   render layer (v1.20.1): each screen + the detail drawer render correctly,
   role-gated actions appear for exactly the right role, output is HTML-escaped,
   and empty states render. Assertions run over the rendered HTML strings (the
   render functions are pure string builders — no DOM/jsdom needed).
   Run: node scripts/engineering-ui-dom-check.mjs   (exit 0 = all pass) */

import { buildDevSeedAssignments, SEED_MEMBERS } from '../js/engineering/providers/dev-seed-data.js';
import {
  resetEngineeringStore, hydrateAssignments, listAssignments,
} from '../js/engineering/stores/engineering-store.js';
import { buildEngineeringAnalytics } from '../js/engineering/analytics/engineering-analytics.js';
import { can, ENGINEERING_ROLE } from '../js/config/role-registry.js';
import { STATUS } from '../js/engineering/config/engineering-config.js';
import { createAssignmentModel } from '../js/engineering/models/engineering-assignment.js';
import { renderOpsDashboard, renderMemberDashboard } from '../js/engineering/ui/engineering-dashboard.js';
import { renderQueue, renderAssignmentCard } from '../js/engineering/ui/engineering-queue.js';
import { renderTimelinePage, renderHistory, renderSettings } from '../js/engineering/ui/engineering-views.js';
import { renderEngineeringAnalyticsView } from '../js/analytics/views/analytics-engineering-view.js';
import { renderDrawer } from '../js/engineering/ui/engineering-drawer.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const has = (html, s) => html.includes(s);

resetEngineeringStore();
hydrateAssignments(buildDevSeedAssignments());
const all = listAssignments();
const NOW = Date.now();
const ctx = (role, name) => ({ role, me: { id: (name || '').toLowerCase().replace(/[^a-z]+/g, '-'), name: name || 'X' }, canEng: (c) => can(c, role), roster: SEED_MEMBERS, now: NOW, filters: { cat: 'all', q: '', tl: 'semua', hq: '' }, expandedId: null });
const admin = ctx('admin', 'Sri Wahyuni');
const coord = ctx(ENGINEERING_ROLE.COORDINATOR, 'Tono Sugianto');
const member = ctx(ENGINEERING_ROLE.MEMBER, 'Isep Saepudin');   // Isep works a-2041

const pick = (s) => all.find((a) => a.status === s);

/* ── Dashboards ───────────────────────────────────────────────────────── */
console.log('\n[dashboards]');
const opsA = renderOpsDashboard(all, admin);
// v1.20.4 — SINGLE global create entry point: the sidebar CTA is the ONLY
// "Buat Penugasan" action. No screen renders an in-content create button for
// ANY role (admin included).
check('admin dashboard has NO in-content Buat Penugasan', !has(opsA, 'data-act="eng-create"'));
check('admin dashboard has health ring', has(opsA, 'eng-ring'));
check('admin dashboard has 4-KPI hero', has(opsA, '-c4'));
check('admin dashboard has Perlu Tindakan', has(opsA, 'Perlu Tindakan'));
check('admin dashboard has verify banner', has(opsA, 'eng-verify-banner'));
const opsC = renderOpsDashboard(all, coord);
// Create is admin-capability only — coordinator never sees it.
check('coordinator dashboard has NO create CTA', !has(opsC, 'data-act="eng-create"'));
check('coordinator dashboard has 5-KPI strip', has(opsC, '-c5'));
check('coordinator dashboard shows Engineering Tersedia', has(opsC, 'Engineering Tersedia'));
const mem = renderMemberDashboard(all, member);
check('member dashboard greets by name', has(mem, 'Halo, Isep'));
check('member dashboard has mywork hero', has(mem, 'eng-mywork'));
check('member mywork shows Selesai action', has(mem, 'data-act="eng-finish"'));

/* ── Queue + cards ────────────────────────────────────────────────────── */
console.log('\n[queue + cards]');
const q = renderQueue(all, admin);
check('queue renders cards', has(q, 'eng-card'));
check('queue has category chips', has(q, 'data-act="eng-filter-cat"'));
check('queue omits archived/done', !has(q, 'Terverifikasi'));
check('queue (admin) has NO in-content Buat Penugasan', !has(q, 'data-act="eng-create"'));
// v1.20.3 — search matches building/room/category/status/priority/member/requester.
const openInProg = pick(STATUS.IN_PROGRESS);
const bldgTerm = (openInProg.building || '').split(/\s+/)[0].toLowerCase();
check('queue search matches by building', bldgTerm.length > 0
  && has(renderQueue(all, { ...admin, filters: { cat: 'all', q: bldgTerm } }), openInProg.assignmentNumber));
const memberName = (openInProg.participants || []).find((p) => p.name);
check('queue search matches by member name', !memberName
  || has(renderQueue(all, { ...admin, filters: { cat: 'all', q: memberName.name.split(' ')[0].toLowerCase() } }), 'eng-card'));
const critCard = renderAssignmentCard(pick(STATUS.IN_PROGRESS), member);
check('member card on available shows Mulai', has(renderAssignmentCard(pick(STATUS.AVAILABLE), member), 'Mulai Mengerjakan'));
check('coordinator card on waiting shows Verifikasi', has(renderAssignmentCard(pick(STATUS.WAITING_VERIFICATION), coord), 'Verifikasi'));
check('admin card on waiting shows Verifikasi (has cap)', has(renderAssignmentCard(pick(STATUS.WAITING_VERIFICATION), admin), 'data-act="eng-verify"'));

/* ── Drawer role-aware actions ────────────────────────────────────────── */
console.log('\n[drawer actions]');
const dInProgAdmin = renderDrawer(pick(STATUS.IN_PROGRESS), admin);
check('admin drawer: Tunda Penugasan', has(dInProgAdmin, 'data-act="eng-postpone"'));
check('admin drawer: NOT Mulai Mengerjakan', !has(dInProgAdmin, 'Mulai Mengerjakan'));
const dWaitCoord = renderDrawer(pick(STATUS.WAITING_VERIFICATION), coord);
check('coordinator drawer waiting: Verifikasi Pekerjaan', has(dWaitCoord, 'Verifikasi Pekerjaan'));
const dWaitMember = renderDrawer(pick(STATUS.WAITING_VERIFICATION), member);
check('member drawer waiting: NO Verifikasi Pekerjaan', !has(dWaitMember, 'Verifikasi Pekerjaan'));
const dAvailCoord = renderDrawer(pick(STATUS.AVAILABLE), coord);
check('coordinator drawer available: Gabung', has(dAvailCoord, '>Gabung<') || has(dAvailCoord, 'Gabung'));
const dAvailMember = renderDrawer(pick(STATUS.AVAILABLE), member);
check('member drawer available: Mulai Mengerjakan', has(dAvailMember, 'Mulai Mengerjakan'));
const dMyWork = renderDrawer(all.find((a) => a.id === 'a-2041'), member);   // Isep is working
check('member drawer own working: Lanjutkan Besok + Selesaikan', has(dMyWork, 'Lanjutkan Besok') && has(dMyWork, 'Selesaikan'));
const dVerified = renderDrawer(all.find((a) => a.status === STATUS.VERIFIED || a.status === STATUS.COMPLETED), admin);
check('verified drawer: closed banner', has(dVerified, 'Terverifikasi dan ditutup'));
check('drawer has timeline + attachments placeholder', has(dInProgAdmin, 'Timeline Operasional') && has(dInProgAdmin, 'Foto sebelum / sesudah'));
check('drawer scrim is eng-scrim (closes on backdrop)', has(dInProgAdmin, 'data-act="eng-scrim"'));

/* ── Views ────────────────────────────────────────────────────────────── */
console.log('\n[views]');
const tl = renderTimelinePage(all, admin);
check('timeline page has expandable cards', has(tl, 'data-act="eng-tl-toggle"'));
check('timeline page has filter chips', has(tl, 'data-act="eng-tl-filter"'));
// v1.20.3 — create available from Timeline (admin) but not for non-creators.
check('timeline (admin) has NO in-content Buat Penugasan', !has(tl, 'data-act="eng-create"'));
check('timeline (member) has NO Buat Penugasan', !has(renderTimelinePage(all, member), 'data-act="eng-create"'));
// v1.20.2 — collapsed by default (no card is data-open when expandedId is null),
// and exactly the selected card expands (single-expand).
check('timeline collapsed by default (expandedId=null)', !has(tl, 'data-open="true"'));
const firstTlId = all.filter((a) => a.status !== STATUS.ARCHIVED)[0].id;
const tlOpen = renderTimelinePage(all, { ...admin, expandedId: firstTlId });
check('timeline expands exactly the selected card', has(tlOpen, 'data-open="true"') && (tlOpen.match(/data-open="true"/g) || []).length === 1);
const hist = renderHistory(all, coord);
check('history renders a table', has(hist, 'eng-table'));
check('history empty state when nothing', has(renderHistory([], coord), 'Belum ada riwayat'));
// v1.20.2 — Engineering Analytics migrated into the global Analytics module.
// Engineering exposes only the PROVIDER; the global view renders it with the
// shared Analytics kit + shared Export Center.
const engAn = renderEngineeringAnalyticsView(buildEngineeringAnalytics(all, { now: NOW }));
check('global engineering analytics view renders KPIs', has(engAn, 'Task Selesai'));
check('global engineering analytics view has category + building sections', has(engAn, 'Task per Kategori') && has(engAn, 'Task per Gedung'));
check('global engineering analytics reuses shared export center', has(engAn, 'export-engineering-analytics-pdf') && has(engAn, 'export-engineering-analytics-excel'));
check('engineering module no longer imports its own renderAnalytics', typeof renderEngineeringAnalyticsView === 'function');
const set = renderSettings(all, admin);
check('settings (admin) has NO in-content Buat Penugasan', !has(set, 'data-act="eng-create"'));
check('settings has master data', has(set, 'Data Operasional'));
check('settings has roadmap placeholders', has(set, 'Spare Parts') && has(set, 'Bidang Request') && has(set, 'Preventive Maintenance'));
check('settings toggles reflect settings store', has(set, 'eng-toggle'));
// v1.20.3 RC1 — the Seed Manager (3 dev-only ops) renders ONLY when ctx.isDev,
// and NEVER in staging/production. The old unconditional "reload demo" button is gone.
const setDev = renderSettings(all, { ...admin, isDev: true });
check('settings dev: Seed Manager present', has(setDev, 'eng-seedmgr') && has(setDev, 'data-act="eng-seed-load"') && has(setDev, 'data-act="eng-seed-reset"') && has(setDev, 'data-act="eng-seed-clear"'));
const setProd = renderSettings(all, { ...admin, isDev: false });
check('settings prod: NO Seed Manager / no demo controls', !has(setProd, 'eng-seedmgr') && !has(setProd, 'eng-seed-') && !has(setProd, 'eng-reset-seed'));

/* ── Escaping ─────────────────────────────────────────────────────────── */
console.log('\n[escaping]');
const evil = createAssignmentModel({ id: 'x', assignmentNumber: 'X-1', title: '<script>alert(1)</script>', category: 'ac-maintenance', priority: 'normal', building: 'B', room: '<img>', location: 'B · L · <img>' });
const evilCard = renderAssignmentCard(evil, admin);
check('title is HTML-escaped in card', has(evilCard, '&lt;script&gt;') && !has(evilCard, '<script>alert'));
const evilDrawer = renderDrawer(evil, admin);
check('title is HTML-escaped in drawer', has(evilDrawer, '&lt;script&gt;') && !has(evilDrawer, '<script>alert'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
