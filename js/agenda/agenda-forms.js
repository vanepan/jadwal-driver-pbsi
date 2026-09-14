/* ============================================================
   agenda-forms.js — shared form plumbing for the event/task drawers
   (V1.31 Agenda & To-Do, Phase C3)

   wirePlainFields() is the load-bearing function here: it implements
   this project's OWN documented Focus-Preserving Render Pattern (see
   memory/focus-preserving-render-pattern.md and the v1.25.3 Overtime
   focus-loss bug it fixed) — a plain text/date/time input's own input/
   change handler updates the draft object ONLY, it NEVER triggers a
   refreshDrawerBody() re-render. Only discrete, click-triggered actions
   (picker toggles, adding a checklist item, changing scope/type) re-
   render. Violating this reintroduces the exact bug that memory documents.
   ============================================================ */

'use strict';

/**
 * Wires every `[data-field]` input/select/textarea inside `container` to
 * write straight into `draft[name]` on input/change — no re-render.
 * Checkboxes write a boolean; everything else writes the raw string
 * value (callers coerce numeric/date fields as needed at save time).
 * @param {HTMLElement} container
 * @param {Object} draft mutated in place
 */
export function wirePlainFields(container, draft) {
  container.querySelectorAll('[data-field]').forEach((el) => {
    const name = el.dataset.field;
    const handler = () => {
      draft[name] = el.type === 'checkbox' ? el.checked : el.value;
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' || el.type === 'time' ? 'change' : 'input', handler);
  });
}

/** WIB (+07:00, no DST) date+time -> epoch ms. Mirrors
 *  functions/src/reminders/schedule.js#tripStartMs's exact convention —
 *  the server-side offset this client value must agree with. Returns
 *  null for a malformed/missing input (caller's validation catches that
 *  before save, this never throws). */
export function combineDateTimeToEpoch(dateStr, timeStr) {
  if (!dateStr) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || '00:00').trim());
  const hh = t ? String(t[1]).padStart(2, '0') : '00';
  const mm = t ? t[2] : '00';
  const ms = Date.parse(`${d[1]}-${d[2]}-${d[3]}T${hh}:${mm}:00+07:00`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * @param {Object} draft
 * @returns {{valid: boolean, errors: Object<string,string>}}
 */
export function validateEventDraft(draft) {
  const errors = {};
  if (!draft.title || !draft.title.trim()) errors.title = 'Judul wajib diisi.';
  if (!draft.date) errors.date = 'Tanggal wajib diisi.';
  if (!draft.allDay) {
    if (!draft.startTime) errors.startTime = 'Jam mulai wajib diisi.';
    if (!draft.endTime) errors.endTime = 'Jam selesai wajib diisi.';
    if (draft.startTime && draft.endTime && draft.startTime >= draft.endTime) {
      errors.endTime = 'Jam selesai harus setelah jam mulai.';
    }
  }
  if (!draft.scope) errors.scope = 'Cakupan wajib dipilih.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateTaskDraft(draft) {
  const errors = {};
  if (!draft.title || !draft.title.trim()) errors.title = 'Judul wajib diisi.';
  if (!draft.scope) errors.scope = 'Cakupan wajib dipilih.';
  if (draft.dueTime && !draft.dueDate) errors.dueDate = 'Isi tanggal jika mengisi jam.';
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Renders every field's error message under it, if the caller passes
 *  the same errors map back in — used by both drawers identically. */
export function fieldError(errors, name) {
  return errors && errors[name] ? `<div class="cal-form-error">${errors[name]}</div>` : '';
}
