/* ============================================================
   TIMELINE-CLIPBOARD.JS — Driver Timeline internal clipboard
   (v1.25.x Timeline Desktop Experience)

   "Copy Assignment" from the timeline's custom context menu stores the
   assignment HERE — an in-memory, session-only slot. It is NEVER written to
   the OS clipboard (navigator.clipboard): closing the tab or reloading loses
   it, exactly like a normal application clipboard is expected to behave for
   this feature (per spec — "internal clipboard/service is sufficient").

   PURE: no DOM, no Firebase. A single module-level slot is all this needs.
   ============================================================ */

'use strict';

let clipboard = null; // shallow copy of the last copied assignment, or null

/** Copy an assignment into the session clipboard (shallow copy — never a live reference). */
export function copyAssignmentToClipboard(assignment) {
  clipboard = assignment ? { ...assignment } : null;
}

/** The currently clipped assignment, or null when nothing has been copied. */
export function getClipboardAssignment() {
  return clipboard;
}

/** Whether the clipboard currently holds an assignment. */
export function hasClipboardAssignment() {
  return !!clipboard;
}

/** Clear the clipboard (not currently wired to any action, exposed for completeness/testing). */
export function clearClipboard() {
  clipboard = null;
}
