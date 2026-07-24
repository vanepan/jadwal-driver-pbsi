/* ============================================================
   GUDANG-ITEM-DETAIL.JS — Item Detail + Asset Detail (Doc 2 §08)

   "Two experiences, one entrance." An Item opens into this SAME drawer;
   the body silently swaps per itemType (Doc 1 Art.V). A Consumable Item
   shows Current Stock/Forecast/Movement/Department Usage/Average
   Consumption directly. An Asset-typed Item owns potentially MANY
   individually-tracked units (Doc 3 Ch.06: identity is per-Asset, not
   per-Item) — its body is a list of those units; opening one drills into
   the true Asset Detail (Identity/Status/Holder/Maintenance/History),
   which is where Blueprint §08's Asset body zone actually applies.

   UI never computes stock/analytics: every figure comes from analytics-
   engine.js / audit/movement-history-view.js / audit/asset-history-
   view.js (already built). Lifecycle actions call asset-lifecycle-
   engine.js#applyAssetTransition (Phase 9) directly — this file only
   decides which buttons to SHOW (via the same isTransitionAllowed()
   Phase 9 already exports), never which transitions are legal.
   ============================================================ */

'use strict';

import { esc, icon, fmtQty, fmtWhen } from './gudang-atoms.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { ASSET_STATUS, ASSET_EVENT_TYPE } from '../contracts/asset-contract.js';
import { isTransitionAllowed, applyAssetTransition } from '../asset/asset-lifecycle-engine.js';
import { getMovementHistory } from '../audit/movement-history-view.js';
import { getAssetHistory } from '../audit/asset-history-view.js';
import {
  getAverageMonthlyConsumption, getDepartmentConsumption, getForecastDaysRemaining,
} from '../analytics/analytics-engine.js';
import { forecastSentence } from '../analytics/quiet-intelligence-engine.js';

const STATUS_LABEL = { available: 'Tersedia', assigned: 'Ditugaskan', maintenance: 'Maintenance', retired: 'Pensiun' };
const STATUS_PILL = { available: 'ok', assigned: 'info', maintenance: 'warn', retired: 'neutral' };
const EVENT_LABEL = { assign: 'Tugaskan', return: 'Kembalikan', maintain: 'Kirim Maintenance', retire: 'Pensiunkan' };

/* ── Item Detail ──────────────────────────────────────────────────────── */
export function renderItemDetail(st, c, requestRender) {
  const item = st.data.items.find((i) => i.itemId === st.detail.id);
  if (!item) return drawerShell('Item tidak ditemukan', '', '<div class="gud-muted">Item mungkin sudah dihapus.</div>');

  const body = item.itemType === ITEM_TYPE.CONSUMABLE
    ? consumableBody(st, item, requestRender)
    : assetListBody(st, item);
  return drawerShell(item.name, item.itemType === ITEM_TYPE.CONSUMABLE ? 'Consumable' : 'Asset', body);
}

function ensureConsumableData(st, item, requestRender) {
  const cache = st.detail;
  if (cache.loaded === item.itemId || cache.loading) return;
  cache.loading = true;
  Promise.all([
    getForecastDaysRemaining(item.itemId), getAverageMonthlyConsumption(item.itemId),
    getDepartmentConsumption(item.itemId), getMovementHistory({ itemId: item.itemId }),
  ]).then(([forecastRes, consRes, deptRes, histRes]) => {
    cache.loading = false;
    cache.loaded = item.itemId;
    cache.forecast = forecastRes.ok ? forecastRes.data : null;
    cache.consumption = consRes.ok ? consRes.data : null;
    cache.deptUsage = deptRes.ok ? deptRes.data : [];
    cache.movements = histRes.ok ? histRes.data.slice(0, 8) : [];
    requestRender();
  });
}

function consumableBody(st, item, requestRender) {
  ensureConsumableData(st, item, requestRender);
  if (st.detail.loading || st.detail.loaded !== item.itemId) return `<div class="gud-muted">Memuat…</div>`;

  return `
    <div class="gud-sec">
      <div class="gud-sec-t">STOK</div>
      <div class="gud-kv"><span class="gud-kv-k">Forecast</span><span class="gud-kv-v">${esc(forecastSentence(st.detail.forecast) || 'Belum cukup riwayat')}</span></div>
      <div class="gud-kv"><span class="gud-kv-k">Rata-rata Konsumsi Bulanan</span><span class="gud-kv-v">${st.detail.consumption != null ? fmtQty(Math.round(st.detail.consumption)) : '—'}</span></div>
    </div>
    <div class="gud-sec">
      <div class="gud-sec-t">PENGGUNAAN PER DEPARTEMEN</div>
      ${st.detail.deptUsage.length
        ? st.detail.deptUsage.map((d) => `<div class="gud-kv"><span class="gud-kv-k">${esc(deptName(st, d.departmentId))}</span><span class="gud-kv-v">${fmtQty(d.quantity)}</span></div>`).join('')
        : `<div class="gud-muted">Belum ada data.</div>`}
    </div>
    <div class="gud-sec">
      <div class="gud-sec-t">PERGERAKAN TERBARU</div>
      ${st.detail.movements.length
        ? st.detail.movements.map((m) => `<div class="gud-kv"><span class="gud-kv-k">${esc(m.what)} · ${esc(m.why)}</span><span class="gud-kv-v">${esc(fmtWhen(m.when))}</span></div>`).join('')
        : `<div class="gud-muted">Belum ada pergerakan.</div>`}
      <button type="button" class="gud-link-btn gud-mt" data-act="gud-goto" data-val="history">${icon('arrow-right', { size: 12 })} Lihat semua di Movement History</button>
    </div>`;
}
function deptName(st, id) { return st.data.departments.find((d) => d.departmentId === id)?.name || id; }

function assetListBody(st, item) {
  const units = st.data.assets.filter((a) => a.itemId === item.itemId);
  if (!units.length) return `<div class="gud-muted">Belum ada unit aset untuk item ini.</div>`;
  return `<div class="gud-sec">
    <div class="gud-sec-t">${units.length} UNIT</div>
    <div class="gud-asset-list">${units.map((a) => `
      <button type="button" class="gud-asset-row" data-act="gud-open-asset" data-id="${esc(a.assetId)}">
        <span class="gud-asset-identity">${esc(a.identity)}</span>
        <span class="gud-pill" data-pill="${STATUS_PILL[a.status] || 'neutral'}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
      </button>`).join('')}</div>
  </div>`;
}

/* ── Asset Detail ─────────────────────────────────────────────────────── */
export function renderAssetDetail(st, c, requestRender) {
  const asset = st.data.assets.find((a) => a.assetId === st.detail.id);
  if (!asset) return drawerShell('Aset tidak ditemukan', '', '<div class="gud-muted">Aset mungkin sudah dihapus.</div>');
  const item = st.data.items.find((i) => i.itemId === asset.itemId);

  ensureAssetHistory(st, asset, requestRender);

  const allowed = Object.values(ASSET_EVENT_TYPE).filter((evt) => isTransitionAllowed(asset.status, evt));
  const actionBar = st.detail.actionOpen
    ? actionForm(asset, st.detail)
    : `<div class="gud-action-row gud-mt">${allowed.map((evt) => `
        <button type="button" class="gud-btn" data-act="gud-asset-action-open" data-id="${esc(evt)}">${esc(EVENT_LABEL[evt])}</button>`).join('')}</div>`;

  const body = `
    <div class="gud-sec">
      <div class="gud-sec-t">IDENTITAS</div>
      <div class="gud-kv"><span class="gud-kv-k">Serial / Tag</span><span class="gud-kv-v">${esc(asset.identity)}</span></div>
      <div class="gud-kv"><span class="gud-kv-k">Status</span><span class="gud-kv-v"><span class="gud-pill" data-pill="${STATUS_PILL[asset.status] || 'neutral'}">${esc(STATUS_LABEL[asset.status] || asset.status)}</span></span></div>
      ${asset.holderId ? `<div class="gud-kv"><span class="gud-kv-k">Dipegang oleh</span><span class="gud-kv-v">${esc(asset.holderId)}</span></div>` : ''}
      ${asset.locationId ? `<div class="gud-kv"><span class="gud-kv-k">Lokasi</span><span class="gud-kv-v">${esc(locName(st, asset.locationId))}</span></div>` : ''}
    </div>
    ${asset.status !== ASSET_STATUS.RETIRED ? `<div class="gud-sec"><div class="gud-sec-t">TINDAKAN</div>${actionBar}${st.detail.actionError ? `<div class="gud-flow-error gud-mt">${esc(st.detail.actionError)}</div>` : ''}</div>` : ''}
    <div class="gud-sec">
      <div class="gud-sec-t">RIWAYAT</div>
      ${historyList(st)}
    </div>`;

  return drawerShell(item ? item.name : asset.identity, 'Asset', body, () => {
    // "Kembali" affordance for the dual-layout entry (Doc 2 §08: one entrance)
    return item ? `<button type="button" class="gud-link-btn" data-act="gud-open-item" data-id="${esc(item.itemId)}">${icon('chevron-left', { size: 12 })} ${esc(item.name)}</button>` : '';
  });
}
function locName(st, id) { return st.data.locations.find((l) => l.locationId === id)?.name || id; }

function ensureAssetHistory(st, asset, requestRender) {
  const cache = st.detail;
  if (cache.historyLoaded === asset.assetId || cache.historyLoading) return;
  cache.historyLoading = true;
  getAssetHistory({ assetId: asset.assetId }).then((res) => {
    cache.historyLoading = false;
    cache.historyLoaded = asset.assetId;
    cache.history = res.ok ? res.data : [];
    requestRender();
  });
}

function historyList(st) {
  if (st.detail.historyLoading || st.detail.historyLoaded !== st.detail.id) return `<div class="gud-muted">Memuat…</div>`;
  const history = st.detail.history || [];
  if (!history.length) return `<div class="gud-muted">Belum ada riwayat.</div>`;
  return history.map((h) => `<div class="gud-kv"><span class="gud-kv-k">${esc(h.what)} · ${esc(h.why)}</span><span class="gud-kv-v">${esc(fmtWhen(h.when))}</span></div>`).join('');
}

function actionForm(asset, detail) {
  const evt = detail.actionOpen;
  const draft = detail.actionDraft || (detail.actionDraft = { reason: '', holderId: '' });
  return `<div class="gud-mt">
    <div class="gud-field"><span>Alasan</span><input class="gud-input" data-act="gud-asset-reason" value="${esc(draft.reason)}" placeholder="Alasan tindakan…" /></div>
    ${evt === ASSET_EVENT_TYPE.ASSIGN ? `<div class="gud-field gud-mt"><span>Ditugaskan kepada</span><input class="gud-input" data-act="gud-asset-holder" value="${esc(draft.holderId)}" placeholder="Nama / ID pemegang…" /></div>` : ''}
    <div class="gud-action-row gud-mt">
      <button type="button" class="gud-btn -ghost" data-act="gud-asset-action-cancel">Batal</button>
      <button type="button" class="gud-btn -primary" data-act="gud-asset-action-confirm">${icon('check', { size: 14 })} ${esc(EVENT_LABEL[evt])}</button>
    </div>
  </div>`;
}

/* ── shell ────────────────────────────────────────────────────────────── */
function drawerShell(title, badge, body, backSlot) {
  return `<div class="gud-scrim -open" data-act="gud-scrim">
    <div class="gud-drawer">
      <div class="gud-drawer-head">
        <div class="gud-drawer-head-txt">
          ${backSlot ? `<div class="gud-drawer-badges">${backSlot()}</div>` : (badge ? `<div class="gud-drawer-badges"><span class="gud-pill" data-pill="neutral">${esc(badge)}</span></div>` : '')}
          <h2 class="gud-drawer-title">${esc(title)}</h2>
        </div>
        <button type="button" class="gud-icon-btn" data-act="gud-detail-close">${icon('close', { size: 16 })}</button>
      </div>
      <div class="gud-drawer-body">${body}</div>
    </div>
  </div>`;
}

/* ── handlers ─────────────────────────────────────────────────────────── */
export const detailHandlers = {
  onClick(st, act, el, c, render, refreshCatalog) {
    const d = st.detail;
    switch (act) {
      case 'gud-asset-action-open': d.actionOpen = el.dataset.id; d.actionDraft = { reason: '', holderId: '' }; d.actionError = null; render(); break;
      case 'gud-asset-action-cancel': d.actionOpen = null; render(); break;
      case 'gud-asset-action-confirm': confirmAssetAction(st, c, render, refreshCatalog); break;
      default: break;
    }
  },
  onInput(st, act, t) {
    const draft = st.detail.actionDraft || (st.detail.actionDraft = { reason: '', holderId: '' });
    if (act === 'gud-asset-reason') draft.reason = t.value;
    else if (act === 'gud-asset-holder') draft.holderId = t.value;
  },
};

async function confirmAssetAction(st, c, render, refreshCatalog) {
  const d = st.detail;
  const draft = d.actionDraft || {};
  if (!draft.reason || !draft.reason.trim()) { d.actionError = 'Alasan wajib diisi.'; render(); return; }
  const res = await applyAssetTransition({
    assetId: d.id, eventType: d.actionOpen, actorId: c.actorId,
    reason: draft.reason.trim(), holderId: draft.holderId ? draft.holderId.trim() : undefined,
  });
  if (!res.ok) { d.actionError = res.error.message; render(); return; }
  d.actionOpen = null; d.actionError = null; d.historyLoaded = null; // force history refetch
  await refreshCatalog();
}
