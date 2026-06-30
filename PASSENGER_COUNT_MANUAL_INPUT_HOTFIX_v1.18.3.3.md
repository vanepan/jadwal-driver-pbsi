# Passenger Count Manual Input — Hotfix v1.18.3.3

> **Type:** UX Hotfix (NO new features) · **Priority:** HIGH
> **Scope:** UI control only — `Jumlah Penumpang` on the "Tambah Jadwal" (admin assignment) form
> **Date:** 2026-06-30 · **Branch:** main

---

## 1. Root Cause

The `Jumlah Penumpang` field used a stepper whose middle value was a **static
`<span>`** (`#paxDisplay`) with `pointer-events: none`. The value could only be
changed via the `[−]` / `[+]` buttons. Entering a larger count on mobile required
many taps — slow and error-prone. There was no way to tap the number, focus it,
or type a value directly.

The stepper's canonical value already lived in a **hidden input** (`#fieldPax`),
which the save path reads. So the fix is purely a UI-control change: make the
middle display editable while keeping `#fieldPax` as the single source of truth.

---

## 2. Files Modified

| File | Change |
|---|---|
| `index.html` | `#paxDisplay` `<span>` → editable `<input type="text" inputmode="numeric" pattern="[0-9]*">` |
| `js/assignments.js` | `_syncPaxDisplay()` writes `.value`; `initPaxStepper()` gains manual-input handlers (input/blur/Enter/arrows/wheel) |
| `platform.css` | Added `input.pbsi-stepper-display` variant (neutralises default input chrome; keeps the existing look) |
| `js/config.js` | `APP_VERSION` 1.18.3.2 → 1.18.3.3 |
| `index.html` / `service-worker.js` / `version.json` | Cache-bust + `SW_VERSION` re-stamped (`sync-version.mjs`); `platform.css?v` 2.1.1 → 2.1.2 |

---

## 3. Why Each File Changed

### `index.html`
The static `<span>` cannot receive focus or open a keyboard. It is replaced with
an `<input>`. **`type="text" + inputmode="numeric" + pattern="[0-9]*"`** is used
deliberately instead of `type="number"` because it:
- opens the numeric keypad on iOS Safari and Android Chrome,
- avoids `type="number"` problems: scroll-wheel value changes, accepted `e`/`+`/`-`/`.`, and native spinners,
- lets us fully control sanitisation.

The hidden `#fieldPax` is **kept** as the canonical value, so the save logic
(`assignments.js:299`) is untouched.

### `js/assignments.js`
- `_syncPaxDisplay()` now writes `display.value` (input) instead of `.textContent`
  (span). It remains the single **commit** path (clamp → hidden → visible →
  button disabled state). Buttons, arrows, Enter, blur, form reset and
  edit-populate all route through it, so the visible field is always normalised.
- New manual-input handlers on `#paxDisplay`:
  - **`input`**: strips non-digits in place and live-updates the hidden value +
    button states — but does **not** rewrite the visible field mid-typing, so
    clearing-to-retype or typing a second digit is never clobbered.
  - **`blur`** and **`Enter`**: commit + normalise via `_syncPaxDisplay`
    (Enter also `preventDefault()` so it never submits the form).
  - **Arrow Up/Down** while focused: ±1.
  - **`wheel`**: prevented while focused (no accidental scroll-to-change).
- Existing `PAX_MIN = 0` / `PAX_MAX = 20` clamp and validation are reused unchanged.

### `platform.css`
A dedicated `input.pbsi-stepper-display` rule removes the default input
top/bottom border, background, spinners, and outline so the editable control is
visually identical to the old static display. The static `.pbsi-stepper-display`
rule (still used by the request form's span) is unchanged. Focus shows the same
`--accent` outline the stepper buttons already use (keyboard only).

---

## 4. Before vs After

**Before**
```
[ − ]  0  [ + ]      ← middle is a non-interactive <span> (pointer-events:none)
```

**After**
```
[ − ] [ 0 ] [ + ]    ← middle is a tappable/typeable numeric <input>
                       buttons, increment/decrement, clamp, data binding unchanged
```

Same size, spacing, colours, and layout — only the middle number became editable.

---

## 5. Regression Risk

| Area | Risk | Reason |
|---|---|---|
| Save / data binding | **None** | Save still reads canonical `#fieldPax`; the `input` handler keeps it live-synced (correct even if saved without blur). |
| Validation / business rules | **None** | Same `PAX_MIN/MAX` clamp + the existing `Number.isNaN → 0` guard at save. |
| `[−]` / `[+]` / arrows | **None** | Original handlers preserved; now route through the shared commit fn. |
| Request form (`Penumpang *`) | **None** | Untouched — separate code (`requests.js`), still a span. |
| Firebase / dispatch / analytics / notifications / schedule / driver / vehicle logic | **None** | No change. |
| Visual | **Minimal** | Input chrome neutralised to match the prior static look. |

Other steppers using `.pbsi-stepper-display` keep the static rule; only the
assignment form's element is an `<input>`, so only it picks up the new variant.

---

## 6. Verification Checklist

Automated (Puppeteer, headless) — **PASS**:
- [x] `#paxDisplay` is `<input>` with `inputmode="numeric"` + `pattern="[0-9]*"`
- [x] Initial value `0`, `[−]` disabled
- [x] `[+]` → 1, 3; `[−]` → 2 (buttons still work, enable/disable correct)
- [x] Type `12` → value `12` (live, not clobbered)
- [x] Type `999` → hidden clamps to `20` live; on **blur** visible normalises to `20`, `[+]` disabled
- [x] Empty → hidden `0`; on **blur** visible `0`, `[−]` disabled
- [x] `ab3x` → `3`; `-5` → `5` (non-digits / negative stripped)
- [x] **Enter** commits without submitting the form
- [x] 0 fatal console errors
- [x] `node scripts/smoke-boot.mjs` — PASS (version 1.18.3.3, 0 fatal boot errors)
- [x] `node --check js/assignments.js` — OK

Manual (recommended pre-release):
- [ ] iOS Safari: tap number → numeric keypad opens
- [ ] Android Chrome: tap number → numeric keypad opens
- [ ] Edit an existing assignment → field populates with the saved pax

---

## 7. Confirmation

- ✅ `[+]` button still works
- ✅ `[−]` button still works
- ✅ Manual input works (tap, focus, type, live update)
- ✅ Numeric keyboard on mobile (`inputmode="numeric"` + `pattern="[0-9]*"`)
- ✅ Business logic unchanged (same clamp/validation, canonical `#fieldPax`, save path untouched)
- ✅ No new feature; no redesign, no layout/spacing/colour change, no roadmap change

Priority honored: **UX > Backward Compatibility > Code Simplicity.**

---

### Note (out of scope — not changed)
The **Request Jadwal** form (`Penumpang *`, `#requestPaxDisplay` in
`js/requests.js`) has the same static-span pattern. It was left untouched to
respect this hotfix's scope. If you want the same manual-input treatment there
for parity, it is a small, identical follow-up — say the word.
