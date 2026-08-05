/* ============================================================
   GUDANG-ACTIVITIES.JS — Warehouse Activity vocabulary + adapters (v1.29.6)

   The Gudang-specific layer on top of the domain-ignorant activity-
   engine.js: the full ACTIVITY_TYPE vocabulary (including types this
   release deliberately does NOT populate — see below) and the two
   adapters that turn what Gudang already has into ActivityEntry objects.

   INVESTIGATED FIRST, per the brief — what's actually derivable without
   touching this release's Do Not Modify list (Inventory Engine, Bulk
   Operations, Upload Engine, Firebase Schema, ...):

   REAL, populated this release:
     - item_created      — item.createdAt already exists, immutable,
                            always set (item-contract.js) — one synthetic
                            entry per item, zero new read or write.
     - goods_in/goods_out/bulk_goods_out/transfer/adjustment/
       stock_opname_adjustment/return — every one of Movement's own
       seven types (minus the dormant future_reservation seam), already
       fully captured by appendMovement/getMovementHistory. Zero new
       data source.

   DEFINED BUT DORMANT this release — confirmed, not assumed, via direct
   investigation: NO existing Firebase write of ANY kind captures these.
   Only Item's CURRENT STATE changes; nothing records that it changed:
     - photo_uploaded / photo_replaced — gudang-item-image.js/gudang-
       photo-upload.js (Upload Engine, Do Not Modify) write only Storage
       bytes + Item.metadata.imageStoragePath; no event trail exists.
     - bulk_edit          — bulk-edit.js (Bulk Operations, Do Not Modify)
       calls updateItem() — a plain overwrite, no history of what changed.
     - archive / restore  — item-repository.js#archiveItem (Inventory
       Engine, Do Not Modify) is `updateItem(id,{active:false})` — no
       trace of when/by whom; "restore" (un-archiving) does not even
       exist as an implemented action anywhere in Gudang yet.
     - manual_edit        — gudang-catalog.js#confirmEditItem — same
       plain-overwrite updateItem() path, no diff/history captured.
     - import             — no import feature exists anywhere in Gudang;
       vocabulary only, matching the brief's own "Future Ready" types.
   Capturing any of these for real would require either a new Firebase
   node (a real Firebase Schema change — the security-rules/shape-
   validation gap that would introduce is documented in this release's
   own architecture report, not glossed over) or editing the frozen Bulk
   Operations/Upload Engine/Inventory Engine files directly — both
   explicitly out of bounds this release. Defined here anyway (type
   constant + label + icon) for the SAME reason movement-contract.js's
   own FUTURE_RESERVATION seam is defined "reserved — no effect
   implemented yet": a future release can populate them with ZERO engine
   changes, because the vocabulary and the UI\'s type-filter machinery
   already exist end to end.

   BULK GOODS OUT — a disclosed heuristic, not a hard discriminator:
   bulk-goods-out.js and goods-out-engine.js (v1.29.4) write byte-
   identical Movement shapes (type=goods_out, reason=issue) — the ONLY
   difference is that ONLY the bulk flow can ever populate purpose/notes
   (confirmed: gudang-goods-out.js's single-item screen has no such
   fields at all). So: a Goods Out movement with purpose OR notes
   non-null is labeled Bulk Goods Out here; one with BOTH null stays a
   plain Goods Out even if it actually came from a bulk run where the
   user left them blank. Neither bulk-goods-out.js nor goods-out-
   engine.js was touched to add a real batchId/source flag — both are
   frozen (Bulk Operations, Do Not Modify).
   ============================================================ */

'use strict';

import { createActivityEntry } from './activity-engine.js';

export const ACTIVITY_TYPE = Object.freeze({
  ITEM_CREATED: 'item_created',
  GOODS_IN: 'goods_in',
  GOODS_OUT: 'goods_out',
  BULK_GOODS_OUT: 'bulk_goods_out',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
  STOCK_OPNAME_ADJUSTMENT: 'stock_opname_adjustment',
  RETURN: 'return',
  // Dormant this release — see file header.
  PHOTO_UPLOADED: 'photo_uploaded',
  PHOTO_REPLACED: 'photo_replaced',
  BULK_EDIT: 'bulk_edit',
  ARCHIVE: 'archive',
  RESTORE: 'restore',
  MANUAL_EDIT: 'manual_edit',
  IMPORT: 'import',
  // Explicitly future (brief: "Do NOT implement them now").
  BARCODE_SCAN: 'barcode_scan',
  QR_SCAN: 'qr_scan',
  INSPECTION: 'inspection',
  DAMAGE_REPORT: 'damage_report',
  MAINTENANCE: 'maintenance',
});

export const ACTIVITY_LABEL = Object.freeze({
  item_created: 'Item Dibuat',
  goods_in: 'Goods In',
  goods_out: 'Goods Out',
  bulk_goods_out: 'Bulk Goods Out',
  transfer: 'Transfer',
  adjustment: 'Penyesuaian Stok',
  stock_opname_adjustment: 'Penyesuaian Stock Opname',
  return: 'Pengembalian',
  photo_uploaded: 'Foto Diunggah',
  photo_replaced: 'Foto Diganti',
  bulk_edit: 'Bulk Edit',
  archive: 'Diarsipkan',
  restore: 'Dipulihkan',
  manual_edit: 'Diedit',
  import: 'Impor',
  barcode_scan: 'Pindai Barcode',
  qr_scan: 'Pindai QR',
  inspection: 'Inspeksi',
  damage_report: 'Laporan Kerusakan',
  maintenance: 'Maintenance',
});

/** Every icon name here already exists in gudang-atoms.js's own ICONS
 *  table (box/arrow-in/arrow-out/arrow-right/gauge/clipboard) — no new
 *  glyph added for this release. Unmapped types (every dormant/future
 *  one) fall back to 'history' at the call site, never throw. */
const ICON_BY_TYPE = Object.freeze({
  item_created: 'box',
  goods_in: 'arrow-in',
  goods_out: 'arrow-out',
  bulk_goods_out: 'arrow-out',
  transfer: 'arrow-right',
  adjustment: 'gauge',
  stock_opname_adjustment: 'clipboard',
  return: 'arrow-in',
});
export function iconForActivity(type) {
  return ICON_BY_TYPE[type] || 'history';
}

/** Reuses the exact ok/crit tone vocabulary gudang-movement-history.js's
 *  own historyCard() already established (green in, red out) — 'neutral'
 *  for anything else (Item Created, and every dormant/future type). */
const TONE_BY_TYPE = Object.freeze({ goods_in: 'ok', return: 'ok', goods_out: 'crit', bulk_goods_out: 'crit' });
export function toneForActivity(type) {
  return TONE_BY_TYPE[type] || 'neutral';
}

/** Item Created — synthesized from item.createdAt, NOT a log entry. */
export function itemCreatedActivity(item) {
  return createActivityEntry({
    id: `created-${item.itemId}`,
    type: ACTIVITY_TYPE.ITEM_CREATED,
    when: item.createdAt,
    title: ACTIVITY_LABEL.item_created,
    description: 'Item ditambahkan ke katalog Gudang.',
  });
}

/**
 * One movement-history-view.js#formatMovementEntry() result -> one
 * ActivityEntry. `departments` (st.data.departments) resolves the
 * department a name, never leaving a raw id in the description (brief:
 * "Never expose raw database fields... entries must be human-readable").
 * @param {ReturnType<import('../audit/movement-history-view.js').formatMovementEntry>} m
 * @param {object[]} departments
 */
export function movementToActivity(m, departments) {
  const isBulk = m.type === 'goods_out' && (m.purpose || m.notes);
  // m.type (Movement's own raw type string) already matches ACTIVITY_TYPE's
  // values for every real, populated type one-for-one, by construction
  // above — no lookup/transform needed for the non-bulk case.
  const type = isBulk ? ACTIVITY_TYPE.BULK_GOODS_OUT : m.type;
  const qtyLabel = `${m.quantityDelta > 0 ? '+' : ''}${m.quantityDelta} Unit`;
  const deptName = m.departmentId ? (departments.find((d) => d.departmentId === m.departmentId)?.name || m.departmentId) : null;
  const descParts = [qtyLabel];
  if (deptName) descParts.push(m.quantityDelta < 0 ? `Diminta oleh ${deptName}` : `Bidang ${deptName}`);
  if (m.purpose) descParts.push(m.purpose);
  return createActivityEntry({
    id: m.movementId,
    type,
    when: m.when,
    who: m.who,
    title: ACTIVITY_LABEL[type] || m.what,
    description: descParts.join(' · '),
    meta: { quantityDelta: m.quantityDelta, departmentName: deptName, price: m.price, purpose: m.purpose, notes: m.notes, reasonLabel: m.why },
  });
}
