/* ============================================================
   ACTIVITY-ENGINE.JS — Warehouse Activity Timeline (v1.29.6)

   THE reusable Normalize/Group/Sort/Filter/Search pipeline every activity
   timeline consumes — this file has ZERO knowledge of Gudang, Items, or
   Movements (confirmed by static check: no such string appears in it),
   the same "generic engine, domain-ignorant" shape bulk-executor.js
   (v1.29.4) and upload-engine.js (v1.29.5) already established. A future
   Vehicle Timeline or Compliance Timeline (brief, Future Ready) reuses
   THIS SAME engine for its own entries — nothing here would need to
   change, because nothing here was ever written to know what a
   "Movement" or an "Item" is. Domain vocabulary (what activity TYPES
   exist, their labels/icons, and how to build one from a Movement) lives
   one layer up, in gudang-activities.js — never here.

   ACTIVITY ENTRY SHAPE: { id, type, when, who, title, description, meta }.
   This is NOT invented — it mirrors the {what, why, when} (+who/ids)
   shape movement-history-view.js#formatMovementEntry and asset-history-
   view.js#formatAssetHistoryEntry ALREADY both independently converge on
   (confirmed: Item Detail's own Recent Movements and Asset History
   sections already consume both that way) — `title`/`description` here
   are simply `what`/`why` renamed to what the brief's own vocabulary
   calls them ("Every activity should include Type, Timestamp, User,
   Title, Description, Optional Metadata").

   GROUPING: Today / Yesterday / Last Week / Last Month / Older — a
   genuinely NEW 5-tier bucketing (the two existing precedents in this
   codebase, gudang-movement-history.js's own Today/Yesterday/per-day-
   forever and notifications.js's Today/Yesterday/Earlier, are each a
   different shape — neither already implements this exact 5-tier
   partition, so this is new logic, not a reuse). The brief names the 5
   labels but not exact day thresholds — a stated, explicit partition
   below, same discipline filter-engine.js's own forecast-bucket header
   already established for this identical situation (Doc-unspecified
   exact numbers -> pick one, state it, don't hide it in the math).
   ============================================================ */

'use strict';

/** @param {{id:string, type:string, when:string, who?:?string, title:string,
 *   description?:string, meta?:?object}} seed */
export function createActivityEntry({ id, type, when, who = null, title, description = '', meta = null }) {
  return { id, type, when, who, title, description, meta };
}

export function sortActivitiesDesc(entries) {
  return [...entries].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

const DAY_MS = 86400000;
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Stated partition (brief names the labels, not the day thresholds):
 *  Hari Ini = 0 days ago; Kemarin = 1; Minggu Lalu = 2-7; Bulan Lalu =
 *  8-30; Lebih Lama = 31+. Exported so a caller can override for a
 *  different domain's own vocabulary without forking this file. */
export const DEFAULT_PERIOD_LABELS = Object.freeze([
  Object.freeze({ label: 'Hari Ini', minDay: 0, maxDay: 0 }),
  Object.freeze({ label: 'Kemarin', minDay: 1, maxDay: 1 }),
  Object.freeze({ label: 'Minggu Lalu', minDay: 2, maxDay: 7 }),
  Object.freeze({ label: 'Bulan Lalu', minDay: 8, maxDay: 30 }),
  Object.freeze({ label: 'Lebih Lama', minDay: 31, maxDay: Infinity }),
]);

/**
 * Groups entries into named periods, newest period first. Entries are
 * assumed already reverse-chronological within each bucket (the caller's
 * own sort order is preserved, not re-sorted) — matching gudang-movement-
 * history.js's own "grouping only has to be stable, not re-sort" note.
 * Empty periods are omitted entirely, never rendered as an empty section
 * (brief: "avoid displaying raw timestamps repeatedly," extended here to
 * "avoid displaying empty groups at all").
 * @param {object[]} entries
 * @param {number} [now]
 * @param {typeof DEFAULT_PERIOD_LABELS} [labels]
 * @returns {{label:string, entries:object[]}[]}
 */
export function groupActivitiesByPeriod(entries, now = Date.now(), labels = DEFAULT_PERIOD_LABELS) {
  const buckets = labels.map((l) => ({ label: l.label, entries: [] }));
  const todayStart = startOfDay(new Date(now));
  for (const entry of entries) {
    const t = Date.parse(entry.when);
    const dayDiff = Number.isNaN(t) ? Infinity : Math.round((todayStart - startOfDay(new Date(t))) / DAY_MS);
    const idx = labels.findIndex((l) => dayDiff >= l.minDay && dayDiff <= l.maxDay);
    buckets[idx === -1 ? buckets.length - 1 : idx].entries.push(entry);
  }
  return buckets.filter((b) => b.entries.length > 0);
}

/** @returns {object[]} entries of exactly `type`, or all entries when type is falsy/'all'. */
export function filterActivitiesByType(entries, type) {
  return !type || type === 'all' ? entries : entries.filter((e) => e.type === type);
}

/** Client-side only (brief: "Timeline search should search only visible
 *  activities... never reload Firebase") — matches against title and
 *  description, case-insensitive. Never touches `meta` (avoids matching
 *  on an internal id/raw value the user never sees). */
export function searchActivities(entries, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => `${e.title} ${e.description}`.toLowerCase().includes(q));
}

/** The distinct types actually present in `entries`, in first-seen order —
 *  the UI's filter chips are built from THIS, not the full domain
 *  vocabulary, so a chip for a type with zero entries for this item never
 *  appears (never a dead "Uploads" filter that is always empty). */
export function availableActivityTypes(entries) {
  const seen = [];
  for (const e of entries) if (!seen.includes(e.type)) seen.push(e.type);
  return seen;
}
