/* ============================================================
   DORMANT-SUBSYSTEMS.JS — Knowledge Ownership & Governance (Phase 3, Part 8)

   PURPOSE: the single, explicit register of subsystems that are BUILT, TESTED
   and REACHABLE, but that nothing in the platform currently drives.

   WHY THIS FILE EXISTS. The Phase 2.6 ownership audit found three subsystems
   with readers but no writers — engines whose state could never change, feeding
   UI surfaces that counted them anyway. The result was not a crash. It was
   worse: a calm, confident, permanent ZERO. The Executive Briefing reported "0
   koreksi tercatat" not because no corrections had been made, but because no
   correction COULD be made. Nobody would ever question that number, and in two
   years someone would make a decision on it.

   A subsystem must have a complete lifecycle:

       readers > 0  AND  writers = 0   ->  a lie waiting to be believed
       writers > 0  AND  readers = 0   ->  work nobody can see
       both zero                       ->  dead code; delete it
       both non-zero                   ->  alive

   So every dormant subsystem is either ACTIVATED, or declared here and made to
   SAY SO wherever it is displayed. The one thing it may never do is quietly
   render a zero.

   This register is machine-checked: scripts/knowledge-ownership-check.mjs
   asserts that every reader-without-writer subsystem appears in DORMANT below,
   and that nothing appears here that has since grown a writer. Reactivating a
   subsystem means deleting its entry — and the check will fail if you forget.

   PHASE 3 DISPOSITIONS
   --------------------
   gap-workflow          ACTIVATED. flagGapForUpload()/resolveGap() now have real
                         callers (ui/archive-center.js — "Tandai untuk Diunggah" /
                         "Tandai Selesai"). Its own V2.0.7 header had asked for
                         exactly this UI. Removed from this register.

   correction-log        DORMANT at the time — see PHASE 5 below for what changed
                         and, just as importantly, what did NOT.

   composer-timeline     DORMANT. composer-store.js#createDocument/editSection
                         have zero callers. The document Composer was scaffolded
                         for a NOR-authoring flow that was never built. Deferred;
                         no date claimed. Unchanged by Phase 5.

   PHASE 5 DISPOSITION — 'correction-log', READ CAREFULLY
   -------------------------------------------------------
   Phase 5 ("Learning Ownership & Organizational Memory") built
   js/v2/learning/services/learning-service.js — the ONE owner of
   organizational learning — and wired THREE real, already-firing human
   corrections through it: Advanced Metadata confirmation
   (ui/dataset-import-center.js), Knowledge Center's "Request Changes"
   (ui/knowledge-center.js), and Profile Override approval (ui/nor-center.js).
   Corrections now genuinely happen in this platform and are genuinely
   recorded — listLearningEvents({kind:'correction'}) returns real, dated,
   provenanced events, consumed by Learning Dashboard's "Approval & Coverage"
   and "Memori Organisasi" tabs and by the Executive Briefing's "Wawasan
   Pembelajaran" card.

   THIS ENTRY STAYS IN THE REGISTER ANYWAY, because the SPECIFIC mechanism it
   names — correction-pipeline-engine.js#submitCorrection (a human rewriting a
   KnowledgeItem's payload field-by-field) — still has ZERO real callers.
   diff-learning-engine.js#submitDraftEditAsCorrection is still never invoked;
   listCorrectionLog() is still permanently empty; Learning Dashboard's
   original "Learning Overview" card and "Koreksi Terbaru"/"Koreksi
   Terbanyak"/"Most Active Domains" lists still read THIS specific dormant
   log and still show dormantNote('correction-log') for exactly that reason.
   Removing the entry now — because SOME kind of correction is finally real —
   would be exactly the sleight-of-hand this register exists to prevent: a
   reader would see "not dormant" and reasonably assume THAT NUMBER moves,
   when it still cannot. Two mechanisms, two honest states, one register that
   says so precisely. The genuine payload-editing feature this entry has
   always been waiting for is still not built.

   DEPENDENCIES: none. This is a manifest, read by the UI (to display honesty)
   and by the verification suite (to enforce it).
   ============================================================ */

'use strict';

/**
 * @typedef {Object} DormantSubsystem
 * @property {string} id
 * @property {string} label          - what a human calls it
 * @property {string} module         - where the unwritten state lives
 * @property {string[]} writers      - the exported writers that have no caller
 * @property {string[]} readers      - the surfaces that read it today
 * @property {string} reason         - why it is not wired, honestly
 * @property {string} plannedPhase   - when it is expected to wake, or 'unscheduled'
 * @property {string} displayNote    - what a UI must say INSTEAD of rendering a zero
 */

/** @type {readonly DormantSubsystem[]} */
export const DORMANT = Object.freeze([
  Object.freeze({
    id: 'correction-log',
    label: 'Correction Log (knowledge payload editing)',
    module: 'js/v2/knowledge/learning/correction-pipeline-engine.js',
    writers: Object.freeze(['submitCorrection (via diff-learning-engine.js#submitDraftEditAsCorrection)']),
    readers: Object.freeze(['ui/learning-dashboard.js (Learning Overview, Koreksi Terbaru, Koreksi Terbanyak, Most Active Domains)']),
    reason: 'Driving it requires a knowledge PAYLOAD-EDITING surface (rewriting a KnowledgeItem field by field), which still does not exist. The engine is complete and tested; nothing calls it. NOTE: this is narrower than "corrections" generally — Phase 5 activated three OTHER, real correction paths (metadata/knowledge/pattern) through learning-service.js; this entry is specifically about the one that still has no UI.',
    plannedPhase: 'unscheduled — Knowledge Editing',
    displayNote: 'Alur koreksi payload pengetahuan belum diaktifkan — angka ini bukan nol karena tidak ada koreksi jenis ini, tetapi karena belum ada antarmuka untuk melakukannya. Jenis koreksi lain (metadata, permintaan perubahan, pola) sudah tercatat nyata di Memori Organisasi.',
  }),
  Object.freeze({
    id: 'composer-timeline',
    label: 'Composer Timeline',
    module: 'js/v2/document-intelligence/composer/composer-store.js',
    writers: Object.freeze(['createDocument', 'editSection']),
    readers: Object.freeze(['ui/nor-center.js', 'ui/learning-dashboard.js']),
    reason: 'The document Composer was scaffolded for a NOR-authoring flow that was never built. No caller exists.',
    plannedPhase: 'unscheduled',
    displayNote: 'Composer belum diaktifkan — belum ada dokumen yang dapat disusun di sini.',
  }),
]);

export function isDormant(id) {
  return DORMANT.some((d) => d.id === id);
}

export function getDormant(id) {
  return DORMANT.find((d) => d.id === id) || null;
}

/** The note a UI must render INSTEAD of a zero, so a dormant subsystem can
 *  never be mistaken for an empty-but-working one. */
export function dormantNote(id) {
  const d = getDormant(id);
  return d ? d.displayNote : null;
}
