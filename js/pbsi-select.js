/* ============================================================
   PBSI-SELECT.JS — Custom Select Component v1.4.0

   Architecture
   ────────────
   The native <select> stays in the DOM, hidden (display:none).
   It remains the authoritative form value source. All existing
   code that reads/writes .value or listens to 'change' on the
   native select works unchanged.

   A trigger <button> and a floating panel <div> (portal —
   appended to document.body) provide the visible UI. The portal
   pattern avoids z-index stacking-context issues inside modals.

   MutationObserver rebuilds the option list whenever the native
   select's children change (e.g. dynamic driver population).

   Keyboard: aria-activedescendant pattern. Focus stays on the
   trigger; ArrowUp/Down highlights options via ARIA attribute.

   Public API
   ──────────
   initPbsiSelect(selectEl)   — wrap one native <select>
   syncPbsiSelect(selectEl)   — re-read native .value, update trigger
                                (call after any external .value write)
   ============================================================ */

'use strict';

/** @type {WeakMap<HTMLSelectElement, object>} */
const _registry = new WeakMap();

/** Only one panel open at a time. */
let _currentOpen = null;

/* ── Chevron SVG (matches existing select chevron) ────────── */
const CHEVRON_SVG = `<svg class="pbsi-select-chevron" width="11" height="7"
  viewBox="0 0 11 7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ── Public: init ─────────────────────────────────────────── */

export function initPbsiSelect(selectEl) {
  if (!selectEl || _registry.has(selectEl)) return;

  // 1. Wrapper — takes the select's layout slot
  const wrapper = document.createElement('div');
  wrapper.className = 'pbsi-select';
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  // 2. Trigger button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pbsi-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('autocomplete', 'off');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'pbsi-select-value';
  trigger.appendChild(valueSpan);
  trigger.insertAdjacentHTML('beforeend', CHEVRON_SVG);
  wrapper.appendChild(trigger);

  // 3. Portal panel — lives on <body> to escape modal stacking contexts
  const panel = document.createElement('div');
  panel.className = 'pbsi-select-panel';
  panel.setAttribute('role', 'listbox');
  if (selectEl.id) {
    panel.id = `pbsi-panel-${selectEl.id}`;
    trigger.setAttribute('aria-controls', panel.id);
  }
  panel.hidden = true;
  document.body.appendChild(panel);

  // 4. Forward label clicks to trigger
  try {
    Array.from(selectEl.labels || []).forEach(lbl => {
      lbl.addEventListener('click', e => { e.preventDefault(); trigger.focus(); });
    });
  } catch (_) { /* labels not supported in all environments */ }

  // 5. Register instance
  const inst = {
    selectEl, wrapper, trigger, valueSpan, panel,
    open: false,
    kbIndex: -1,       // currently keyboard-highlighted option index
    _onOutside: null,
    _onRepos: null,
    observer: null,
  };
  _registry.set(selectEl, inst);

  // 6. Build initial options and sync display
  _buildOptions(inst);
  _updateTrigger(inst);

  // 7. MutationObserver — rebuild when options are added/removed dynamically
  const obs = new MutationObserver(() => {
    _buildOptions(inst);
    _updateTrigger(inst);
  });
  obs.observe(selectEl, { childList: true });
  inst.observer = obs;

  // 8. Hide native select (stays in DOM; form reads its .value)
  selectEl.style.display = 'none';

  // 9. Wire trigger events
  trigger.addEventListener('click', () => _toggle(inst));
  trigger.addEventListener('keydown', e => _onKey(e, inst));
}

/* ── Public: sync ─────────────────────────────────────────── */

/**
 * Re-reads the native select's current .value and updates the
 * trigger label. Call this after any external programmatic write:
 *   selectEl.value = 'foo';
 *   syncPbsiSelect(selectEl);
 */
export function syncPbsiSelect(selectEl) {
  const inst = _registry.get(selectEl);
  if (!inst) return;
  _updateTrigger(inst);
  _markSelected(inst);
}

/* ── Private: option list ─────────────────────────────────── */

function _buildOptions(inst) {
  const { selectEl, panel } = inst;
  const cur = selectEl.value;
  panel.innerHTML = '';

  Array.from(selectEl.options).forEach((opt, i) => {
    const item = document.createElement('div');
    item.className = 'pbsi-select-option';
    item.setAttribute('role', 'option');
    item.dataset.value = opt.value;
    item.dataset.idx   = i;
    if (selectEl.id) item.id = `pbsi-opt-${selectEl.id}-${i}`;

    const isSel = (opt.value === cur);
    item.setAttribute('aria-selected', String(isSel));
    if (isSel) item.classList.add('pbsi-select-option--selected');
    if (!opt.value) item.classList.add('pbsi-select-option--placeholder');

    item.textContent = opt.textContent;

    // mousedown (not click) so we can preventDefault before blur fires on trigger
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      _pick(inst, opt.value);
    });
    panel.appendChild(item);
  });
}

function _markSelected(inst) {
  const cur = inst.selectEl.value;
  Array.from(inst.panel.children).forEach(item => {
    const sel = (item.dataset.value === cur);
    item.setAttribute('aria-selected', String(sel));
    item.classList.toggle('pbsi-select-option--selected', sel);
  });
}

function _updateTrigger(inst) {
  const { selectEl, valueSpan, trigger } = inst;
  const opt = selectEl.options[selectEl.selectedIndex];
  valueSpan.textContent = opt ? opt.textContent : '';
  valueSpan.classList.toggle('pbsi-select-value--placeholder', !opt || !opt.value);
  trigger.disabled = selectEl.disabled;
}

/* ── Private: open / close ────────────────────────────────── */

function _toggle(inst) {
  inst.open ? _close(inst) : _open(inst);
}

function _open(inst) {
  if (inst.trigger.disabled) return;
  if (_currentOpen && _currentOpen !== inst) _close(_currentOpen);

  // Rebuild in case options changed while closed
  _buildOptions(inst);
  _markSelected(inst);
  _reposition(inst);

  inst.panel.hidden = false;
  requestAnimationFrame(() => inst.panel.classList.add('pbsi-select-panel--open'));

  inst.trigger.setAttribute('aria-expanded', 'true');
  inst.trigger.classList.add('pbsi-select-trigger--open');
  inst.open = true;
  inst.kbIndex = -1;
  _currentOpen = inst;

  // Scroll selected option into view
  requestAnimationFrame(() => {
    const sel = inst.panel.querySelector('.pbsi-select-option--selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  });

  // Outside click → close
  inst._onOutside = e => {
    if (!inst.panel.contains(e.target) && e.target !== inst.trigger) _close(inst);
  };
  document.addEventListener('mousedown', inst._onOutside);

  // Reposition on scroll / resize
  inst._onRepos = () => _reposition(inst);
  window.addEventListener('scroll',  inst._onRepos, { passive: true, capture: true });
  window.addEventListener('resize',  inst._onRepos, { passive: true });
}

function _reposition(inst) {
  const rect = inst.trigger.getBoundingClientRect();
  const panel = inst.panel;

  // Flip upward if not enough space below
  const spaceBelow = window.innerHeight - rect.bottom;
  const estimatedH = Math.min(panel.scrollHeight || 240, 240);

  if (spaceBelow < estimatedH + 8 && rect.top > estimatedH + 8) {
    panel.style.top    = `${rect.top - estimatedH - 3}px`;
    panel.classList.add('pbsi-select-panel--above');
  } else {
    panel.style.top    = `${rect.bottom + 3}px`;
    panel.classList.remove('pbsi-select-panel--above');
  }
  panel.style.left     = `${rect.left}px`;
  panel.style.minWidth = `${rect.width}px`;
}

function _close(inst) {
  const { trigger, panel } = inst;

  panel.classList.remove('pbsi-select-panel--open');
  _clearKb(inst);

  // Hide after animation completes
  const hidePanel = () => { panel.hidden = true; };
  panel.addEventListener('transitionend', hidePanel, { once: true });
  setTimeout(hidePanel, 160);  // fallback if transitionend doesn't fire

  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
  trigger.classList.remove('pbsi-select-trigger--open');
  inst.open = false;
  inst.kbIndex = -1;

  if (_currentOpen === inst) _currentOpen = null;

  if (inst._onOutside) {
    document.removeEventListener('mousedown', inst._onOutside);
    inst._onOutside = null;
  }
  if (inst._onRepos) {
    window.removeEventListener('scroll', inst._onRepos, { capture: true });
    window.removeEventListener('resize', inst._onRepos);
    inst._onRepos = null;
  }
}

/* ── Private: selection ───────────────────────────────────── */

function _pick(inst, value) {
  const { selectEl } = inst;
  selectEl.value = value;
  // Dispatch both change (for logic) and input (for coverage) with bubbles
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  selectEl.dispatchEvent(new Event('input',  { bubbles: true }));
  _updateTrigger(inst);
  _markSelected(inst);
  _close(inst);
  inst.trigger.focus();
}

/* ── Private: keyboard ────────────────────────────────────── */

function _onKey(e, inst) {
  const count = inst.panel.children.length;

  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (!inst.open) {
        _open(inst);
      } else if (inst.kbIndex >= 0) {
        const item = inst.panel.children[inst.kbIndex];
        if (item) _pick(inst, item.dataset.value);
      } else {
        _close(inst);
      }
      break;

    case 'ArrowDown':
      e.preventDefault();
      if (!inst.open) { _open(inst); break; }
      _moveKb(inst, 1, count);
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (!inst.open) { _open(inst); break; }
      _moveKb(inst, -1, count);
      break;

    case 'Escape':
      if (inst.open) { e.stopPropagation(); _close(inst); }
      break;

    case 'Tab':
      if (inst.open) _close(inst);
      break;
  }
}

function _moveKb(inst, dir, count) {
  if (count === 0) return;
  _clearKb(inst);

  let next = inst.kbIndex + dir;
  if (next < 0) next = count - 1;
  if (next >= count) next = 0;

  inst.kbIndex = next;
  const item = inst.panel.children[next];
  if (!item) return;

  item.classList.add('pbsi-select-option--active');
  if (item.id) inst.trigger.setAttribute('aria-activedescendant', item.id);
  item.scrollIntoView({ block: 'nearest' });
}

function _clearKb(inst) {
  inst.panel.querySelectorAll('.pbsi-select-option--active')
    .forEach(el => el.classList.remove('pbsi-select-option--active'));
  inst.trigger.removeAttribute('aria-activedescendant');
}

console.info('PBSI Select module loaded');
