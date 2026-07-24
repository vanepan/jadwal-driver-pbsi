/* ============================================================
   GUDANG-ANALYTICS.JS — Analytics screen (Doc 2 §11)

   No dashboard wall, no KPI overload — every figure begins as a sentence
   (Doc 1 Art.VII). Reached through a deliberate menu item, never
   surfaced beyond Home's quiet hints (§04/§11).

   UI never computes analytics: every number/sentence here comes straight
   from analytics-engine.js (Phase 8, decides) and quiet-intelligence-
   engine.js (Phase 8, phrases) — this file only asks for an item, shows
   what those two engines already produced, and lays out the catalog-wide
   Top Consumed/Top Departments lists their own bulk functions return.
   ============================================================ */

'use strict';

import { esc, icon, fmtQty, emptyState } from './gudang-atoms.js';
import {
  getAverageMonthlyConsumption, getAverageMonthlyCost, getForecastDaysRemaining,
  isRestockRecommended, getTopConsumedItems, getTopDepartments,
} from '../analytics/analytics-engine.js';
import { forecastSentence, restockSentence, averageMonthlyCostSentence, topDepartmentSentence } from '../analytics/quiet-intelligence-engine.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';

function ensureCatalogWide(st, requestRender) {
  if (st.analyticsTop || st.analyticsTopLoading) return;
  st.analyticsTopLoading = true;
  Promise.all([getTopConsumedItems(5), getTopDepartments(5)]).then(([itemsRes, deptRes]) => {
    st.analyticsTop = {
      items: itemsRes.ok ? itemsRes.data : [],
      departments: deptRes.ok ? deptRes.data : [],
    };
    st.analyticsTopLoading = false;
    requestRender();
  });
}

function loadItemInsight(st, itemId, requestRender) {
  st.analyticsItemLoading = true;
  st.analyticsItem = null;
  Promise.all([
    getAverageMonthlyConsumption(itemId), getAverageMonthlyCost(itemId),
    getForecastDaysRemaining(itemId), isRestockRecommended(itemId),
  ]).then(([consRes, costRes, forecastRes, restockRes]) => {
    st.analyticsItemLoading = false;
    st.analyticsItem = {
      itemId,
      consumption: consRes.ok ? consRes.data : null,
      cost: costRes.ok ? costRes.data : null,
      forecast: forecastRes.ok ? forecastRes.data : null,
      restock: restockRes.ok ? restockRes.data : false,
    };
    requestRender();
  });
}

export function renderAnalytics(st, c, requestRender) {
  ensureCatalogWide(st, requestRender);
  const items = st.data.items.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE && i.active);

  return `<div>
    <div class="gud-page-head">
      <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Analytics</h1>
      <p class="gud-page-lede">Fakta terukur, disampaikan sebagai kalimat — bukan dashboard.</p></div>
    </div>

    <div class="gud-grid -2 gud-mt">
      <div class="gud-card -pad">
        <div class="gud-card-head"><div class="gud-card-h-title">Item Paling Banyak Keluar</div></div>
        ${topList(st, 'items')}
      </div>
      <div class="gud-card -pad">
        <div class="gud-card-head"><div class="gud-card-h-title">Bidang Paling Aktif</div></div>
        ${topList(st, 'departments')}
      </div>
    </div>

    <div class="gud-card -pad gud-mt">
      <div class="gud-card-head"><div class="gud-card-h-title">Analisis per Item</div><div class="gud-card-h-sub">Pilih item untuk melihat konsumsi, biaya, dan forecast</div></div>
      <select class="gud-input" data-act="gud-an-item-pick" style="max-width:320px;">
        <option value="">Pilih item…</option>
        ${items.map((i) => `<option value="${esc(i.itemId)}" ${st.analyticsItem?.itemId === i.itemId ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
      </select>
      ${itemInsight(st)}
    </div>
  </div>`;
}

function topList(st, kind) {
  if (!st.analyticsTop) return `<div class="gud-muted">Memuat…</div>`;
  const rows = st.analyticsTop[kind];
  if (!rows.length) return `<div class="gud-muted">Belum ada data konsumsi.</div>`;
  const top = rows[0];
  const headline = kind === 'departments'
    ? topDepartmentSentence(topDeptName(st, top.departmentId))
    : null;
  return `${headline ? `<div class="gud-qi-sentence">${esc(headline)}</div>` : ''}
    <div class="gud-toplist gud-mt">${rows.map((r, i) => `
      <div class="gud-toplist-row" ${kind === 'items' ? `data-act="gud-open-item" data-id="${esc(r.itemId)}"` : ''}>
        <span class="gud-toplist-rank">${i + 1}</span>
        <span class="gud-toplist-name">${esc(kind === 'items' ? itemName(st, r.itemId) : topDeptName(st, r.departmentId))}</span>
        <span class="gud-toplist-val">${fmtQty(r.quantity)}</span>
      </div>`).join('')}</div>`;
}
function itemName(st, itemId) { return st.data.items.find((i) => i.itemId === itemId)?.name || itemId; }
function topDeptName(st, departmentId) { return st.data.departments.find((d) => d.departmentId === departmentId)?.name || departmentId; }

function itemInsight(st) {
  if (st.analyticsItemLoading) return `<div class="gud-muted gud-mt">Memuat…</div>`;
  if (!st.analyticsItem) return '';
  const a = st.analyticsItem;
  const sentences = [
    a.consumption != null ? `Rata-rata konsumsi bulanan: <strong>${fmtQty(Math.round(a.consumption))}</strong>` : null,
    averageMonthlyCostSentence(a.cost),
    forecastSentence(a.forecast),
    restockSentence(a.restock),
  ].filter(Boolean);
  if (!sentences.length) {
    return `<div class="gud-mt">${emptyState({ iconName: 'chart', title: 'Belum cukup riwayat', hint: 'Analitik akan muncul setelah item ini memiliki riwayat pergerakan.' })}</div>`;
  }
  return `<div class="gud-qi-list gud-mt gud-stagger">${sentences.map((s) => `<div class="gud-qi-sentence">${icon('chart', { size: 14, tone: 'accent' })} ${s}</div>`).join('')}</div>`;
}

export function analyticsOnChange(st, el, requestRender) {
  if (el.dataset.act !== 'gud-an-item-pick') return;
  const itemId = el.value;
  if (!itemId) { st.analyticsItem = null; requestRender(); return; }
  loadItemInsight(st, itemId, requestRender);
}
