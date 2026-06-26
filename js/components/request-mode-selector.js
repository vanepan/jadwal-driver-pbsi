/* ============================================================
   REQUEST-MODE-SELECTOR.JS — Premium request mode controller
   (v1.17.4 — Part B · Request Experience Polish)

   Drives the two Apple-style option cards ("Tanpa Driver" / "Ambulance"), the
   confirmation sheets (Feature 9), and the context hint (Feature 10) in the
   Request Jadwal form. The cards are a VIEW over two hidden checkboxes
   (#requestUseAmbulance / #requestNoDriver) which remain the source of truth
   read by requests.js — so the submit / restore / policy wiring is unchanged.

   All copy, visibility and the mode matrix live in the PURE services/request-mode.js
   (no dispatch logic here; the Dispatch Policy Engine still owns eligibility).
   ============================================================ */

'use strict';

import {
  REQUEST_MODE, REQUEST_MODE_SHEET,
  requestModeVisibility, resolveRequestMode,
} from '../services/request-mode.js';

const ID = {
  group: 'requestModeGroup',
  cardNoDriver: 'reqModeCardNoDriver',
  cardAmbulance: 'reqModeCardAmbulance',
  hint: 'requestModeHint',
  inputAmbulance: 'requestUseAmbulance',
  inputNoDriver: 'requestNoDriver',
  sheet: 'requestModeSheet',
  sheetTitle: 'reqSheetTitle',
  sheetBody: 'reqSheetBody',
  sheetConfirm: 'reqSheetConfirm',
  sheetCancel: 'reqSheetCancel',
};

let wired = false;
let pendingMode = null;       // the mode awaiting confirmation in the sheet
let lastFocusedCard = null;   // restore focus here after the sheet closes

const el = (id) => document.getElementById(id);
const inputFor = (mode) => el(mode === REQUEST_MODE.AMBULANCE ? ID.inputAmbulance : ID.inputNoDriver);
const cardFor = (mode) => el(mode === REQUEST_MODE.AMBULANCE ? ID.cardAmbulance : ID.cardNoDriver);
const cardHidden = (mode) => { const c = cardFor(mode); return !c || c.hidden; };

function readToggles() {
  const amb = inputFor(REQUEST_MODE.AMBULANCE);
  const nod = inputFor(REQUEST_MODE.NO_DRIVER);
  return { useAmbulance: !!(amb && amb.checked), noDriver: !!(nod && nod.checked) };
}

function setCardState(mode, on) {
  const card = cardFor(mode);
  if (!card) return;
  card.classList.toggle('is-selected', !!on);
  card.setAttribute('aria-checked', on ? 'true' : 'false');
}

/** Reflect the hidden checkboxes onto the cards + context hint. */
export function syncRequestModeFromInputs() {
  const t = readToggles();
  setCardState(REQUEST_MODE.AMBULANCE, t.useAmbulance);
  setCardState(REQUEST_MODE.NO_DRIVER, t.noDriver);
  const { showContextHint } = resolveRequestMode(t);
  const hint = el(ID.hint);
  if (hint) hint.hidden = !(showContextHint && !cardHidden(REQUEST_MODE.AMBULANCE));
}

/** Show/hide the Ambulance card by requester role (Feature 7). */
export function setRequestModeVisibility(isMedical) {
  const vis = requestModeVisibility(isMedical);
  const amb = cardFor(REQUEST_MODE.AMBULANCE);
  if (amb) amb.hidden = !vis.ambulance;
  if (!vis.ambulance) {                       // never leave a hidden mode active
    const inp = inputFor(REQUEST_MODE.AMBULANCE);
    if (inp) inp.checked = false;
  }
  syncRequestModeFromInputs();
}

/** Clear both modes (new request). */
export function resetRequestMode() {
  [ID.inputAmbulance, ID.inputNoDriver].forEach((id) => { const i = el(id); if (i) i.checked = false; });
  closeSheet(true);
  syncRequestModeFromInputs();
}

/* ── Confirmation sheet ───────────────────────────────────────────── */
function openSheet(mode) {
  const copy = REQUEST_MODE_SHEET[mode];
  const overlay = el(ID.sheet);
  if (!copy || !overlay) {                    // graceful fallback — just enable
    const inp = inputFor(mode); if (inp) inp.checked = true; syncRequestModeFromInputs(); return;
  }
  pendingMode = mode;
  el(ID.sheetTitle).textContent = copy.title;
  el(ID.sheetBody).textContent = copy.body;
  el(ID.sheetConfirm).textContent = copy.confirm;
  el(ID.sheetCancel).textContent = copy.cancel;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  setTimeout(() => { const c = el(ID.sheetConfirm); if (c) c.focus(); }, 10);
}

function confirmSheet() {
  if (pendingMode) {
    const inp = inputFor(pendingMode);
    if (inp) inp.checked = true;
  }
  closeSheet();
  syncRequestModeFromInputs();
}

function closeSheet(instant) {
  pendingMode = null;
  const overlay = el(ID.sheet);
  if (overlay) {
    overlay.classList.remove('is-open');
    const sheet = overlay.querySelector('.req-sheet');
    if (sheet) sheet.style.transform = '';
    if (instant) overlay.hidden = true;
    else setTimeout(() => { if (!overlay.classList.contains('is-open')) overlay.hidden = true; }, 220);
  }
  if (lastFocusedCard && typeof lastFocusedCard.focus === 'function') {
    try { lastFocusedCard.focus(); } catch (_) {}
  }
  lastFocusedCard = null;
}

/* ── Card interaction ─────────────────────────────────────────────── */
function onCardActivate(mode, cardEl) {
  const input = inputFor(mode);
  if (!input) return;
  if (input.checked) {                        // turning OFF — no confirmation
    input.checked = false;
    syncRequestModeFromInputs();
  } else {                                    // turning ON — confirm via sheet
    lastFocusedCard = cardEl || cardFor(mode);
    openSheet(mode);
  }
}

/* ── Swipe-to-dismiss (mobile) ────────────────────────────────────── */
function wireSwipe(overlay) {
  const sheet = overlay.querySelector('.req-sheet');
  if (!sheet) return;
  let startY = null;
  sheet.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : startY) - (startY || 0);
    sheet.style.transform = '';
    startY = null;
    if (dy > 70) closeSheet();
  });
}

/** Wire the cards + sheet once. Idempotent. */
export function initRequestModeSelector() {
  if (wired) return; wired = true;

  document.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('[data-request-mode]');
    const group = el(ID.group);
    if (card && group && group.contains(card)) {
      e.preventDefault();
      onCardActivate(card.getAttribute('data-request-mode'), card);
    }
  });

  const confirmBtn = el(ID.sheetConfirm);
  const cancelBtn = el(ID.sheetCancel);
  if (confirmBtn) confirmBtn.addEventListener('click', confirmSheet);
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeSheet());

  const overlay = el(ID.sheet);
  if (overlay) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); }); // outside click
    wireSwipe(overlay);
  }

  // ESC dismiss — capture phase + stopImmediatePropagation so it never also
  // closes the underlying request modal while the sheet is open.
  document.addEventListener('keydown', (e) => {
    const ov = el(ID.sheet);
    if (e.key === 'Escape' && ov && !ov.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeSheet();
    }
  }, true);

  syncRequestModeFromInputs();
}
