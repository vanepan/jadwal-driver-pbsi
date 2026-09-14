/* ============================================================
   agenda-pdf-export.js — impure gatherer + orchestrator
   (V1.31 Agenda & To-Do, Phase C4)

   Mirrors js/petty-cash/nor-document-engine.js's own split: this file
   is the ONLY place that touches Firebase-backed state on the way to a
   PDF — it gathers already-scoped/visible data from agenda-store.js
   (the SAME authorization boundary the in-app UI itself uses — never a
   broader fetch — see §16's own instruction) and a plain directory
   snapshot from agenda-directory.js, then hands both to the PURE
   buildAgendaPdfViewModel() (agenda-pdf-view-model.js). The actual
   rendering goes through the shared DocumentEngine/template-registry/
   pdf-exporter/document-viewer pipeline — no second PDF engine.
   ============================================================ */

'use strict';

import { getVisibleEvents, getVisibleTasks } from './agenda-store.js';
import { displayNameFor, resolveParticipantClass } from './agenda-directory.js';
import { buildAgendaPdfViewModel } from './agenda-pdf-view-model.js';
import { resolvePresetRange } from './agenda-date-range.js';
import '../docs/templates/agenda.js'; // side-effect: registers the 'agenda' template
import * as DocumentEngine from '../docs/doc-engine.js';
import { logExportSuccess, logExportFailure } from '../exports/export-history.js';
import { getCurrentUser } from '../auth.js';
import { APP_VERSION } from '../config.js';

function collectParticipantUsernames(events, tasks) {
  const set = new Set();
  for (const e of events || []) for (const u of Object.keys(e.participants || {})) set.add(u);
  for (const t of tasks || []) for (const u of Object.keys(t.responsible || {})) set.add(u);
  return set;
}

/** Plain {[username]: {displayName, class}} snapshot — the ONLY Firebase-
 *  derived data the pure view-model builder ever sees, and only as
 *  already-resolved values (agenda-directory.js's own in-memory cache,
 *  no new reads triggered here). */
function buildDirectorySnapshot(usernames) {
  const out = {};
  for (const u of usernames) out[u] = { displayName: displayNameFor(u), class: resolveParticipantClass(u) };
  return out;
}

/**
 * @param {Object} opts
 * @param {string} opts.preset one of AGENDA_REPORT_PRESETS
 * @param {string} [opts.customFrom] required when preset==='custom'
 * @param {string} [opts.customTo] required when preset==='custom'
 * @param {'agenda'|'todo'|'semua'} [opts.mode]
 * @param {string} [opts.status] task status filter
 * @param {string} [opts.priority] task priority filter
 * @returns {Promise<{blob:Blob, filename:string, definition:object}>}
 */
export async function runAgendaPdfExport(opts = {}) {
  const now = Date.now();
  const range = resolvePresetRange(opts.preset, undefined, { customFrom: opts.customFrom, customTo: opts.customTo });

  const events = getVisibleEvents();
  const tasks = getVisibleTasks();
  const directory = buildDirectorySnapshot(collectParticipantUsernames(events, tasks));

  const vm = buildAgendaPdfViewModel({
    events, tasks, range,
    filters: { mode: opts.mode || 'semua', status: opts.status, priority: opts.priority },
    directory, now,
  });

  const user = getCurrentUser();
  const exportCtx = {
    reportId: 'agenda-pdf',
    reportTitle: vm.reportTitle,
    generatedBy: (user && user.name) || null,
    userId: (user && user.id) || null,
    username: (user && user.username) || null,
    periodLabel: range.label,
    dateRangeKey: `${range.start}_${range.end}`,
    filters: { mode: vm.mode, status: opts.status || 'all', priority: opts.priority || 'all' },
    appVersion: APP_VERSION,
    source: 'manual',
  };

  const startedAt = Date.now();
  try {
    const doc = await DocumentEngine.generateAndOpen('agenda', vm, {
      viewer: { title: vm.reportTitle, shareText: `${vm.reportTitle} — ${vm.dateRangeLabel}` },
    });
    logExportSuccess(exportCtx, { fileSize: doc.blob.size, durationMs: Date.now() - startedAt });
    return doc;
  } catch (err) {
    logExportFailure(exportCtx, { error: err, durationMs: Date.now() - startedAt });
    throw err;
  }
}
