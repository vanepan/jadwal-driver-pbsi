# Design System Program — Phase 4 Report: Application-Wide Icon Consolidation (v1.30.11.3)

**Status: implemented, verified, committed (`3fc2aa7`). NOT pushed, NOT deployed.**

---

## 1. Goal

Phase 4 continues the Design System Program (Phase 2 — Canonical Drawer Architecture, v1.30.11.1; Phase 3 — Shared Save-Feedback State Machine, v1.30.11.2). This phase retires the last standalone icon mechanism in the app and moves every icon-producing surface onto the single canonical glyph set: `anIcon()` in `js/analytics/analytics-shell.js`.

Before this phase, three icon systems coexisted:
- `anIcon()` — the canonical set (already used by Analytics, Fleet, Drawer surfaces)
- `js/components/icon-system.js` — a second, separate `renderIcon()`/`ICONS` map plus a `vehicleTypeIconName()` helper
- Ad-hoc inline SVG and raw emoji/Unicode glyphs scattered across `modal.js`, `notifications.js`, `command-palette.js`, `domain-shell.js`, and `index.html`

## 2. What changed

**Retired:** `js/components/icon-system.js` deleted outright. Its only surviving real consumer, `vehicleTypeIconName()`, relocated into `js/analytics/analytics-shell.js` (backed by a small `VEHICLE_TYPE_ICONS` map: `mobil`/`motor`/`ambulance`) and is re-exported through `js/analytics/executive-ui-kit.js` alongside `anIcon`. The file's own separate `ICONS`/`renderIcon()` were confirmed dead for both real callers before deletion.

**Migrated onto `anIcon()`** (5 surfaces):
- `js/modal.js` — Assignment Detail drawer: accordion chevrons, primary action buttons (Mulai Tugas/Selesaikan/Komentar/Batalkan/Override), WhatsApp/Reimbursement section icons, Hapus/Edit footer actions, odometer-warning icon. All previously raw emoji (▶ ✓ 💬 ✕ ⏱ 📱 📋 ✅ 📄 🗑 ✏️).
- `js/notifications.js` — notification card icons (`ACTION_META.icon`) and `serverNotifIcon()`'s action-to-glyph mapping, both previously emoji.
- `js/shell/command-palette.js` — search trigger, previously a one-off inline `<svg>` literal.
- `js/shell/domain-shell.js` — rail icons. Previously a local `ICONS` map of hand-written path fragments with its own filled-accent-dot convention (`.domshell-icon-dot`, `.domshell-icon-accent-stroke`); `svgIcon()` now calls `anIcon()` directly and that CSS was deleted as dead.
- `index.html` — header notification bell. Static HTML has no JS templating, so this is a literal, commented, byte-matched copy of `anIcon('bell')`'s `<path d>` (see §4 for how that's kept from silently drifting).

**Glyph set changes in `analytics-shell.js`:**
- 10 new paths added: `bell`, `nor`, `warehouse`, `control`, `today`, `operations`, `comment`, `copy`, `trash`, `edit`
- 1 dead path removed: `pin2` (was an empty string, unused)
- 5 exact-duplicate paths collapsed into aliases rather than kept as separate literals: `legal-warning`→`alert`, `health-warn`→`alert`, `legal-valid`→`status-active`, `health-ok`→`status-active`, `health-danger`→`status-inactive`
- 1 further duplicate collapsed: `target`→`recommendation`
- 6 new semantic aliases for domain-shell's rail names, each pointing at an existing same-meaning glyph: `finance`→`pettycash`, `engineering`→`maintenance`, `insights`→`analytics`, `sarprasIntelligence`→`bulb`, `driver`→`user`, `info`→`health-info`

Every existing caller of a collapsed name keeps working unchanged — the alias layer resolves transparently inside `anIcon()`.

## 3. Non-goals / explicitly untouched

- `#waPreviewText` (the generated WhatsApp message text sent externally) — real message content, never routed through the icon system, explicitly excluded from every emoji-leftover check.
- Business logic, Firebase calls, data models — zero change; this phase is presentation-layer only.
- `vehicle-detail-drawer.js`'s own icon usage was already on `anIcon()`/`vehicleTypeIconName`; only its import source changed (from `icon-system.js` to `executive-ui-kit.js`).

## 4. Verification

Two purpose-built scripts in `scratch/`, plus the existing regression suite, all re-run fresh for this report (not just trusted from memory):

**a) `scratch/verify-icon-consolidation-names.mjs`** — static check. Imports the real `analytics-shell.js` and confirms every icon name used across the 5 migrated surfaces resolves to a non-empty `<path d>` (catches a typo silently rendering a blank glyph, which no screenshot glance would reliably catch at 14px). Also cross-checks index.html's hand-copied bell `<path>` is byte-identical to `anIcon('bell')`'s live output, so the two can't silently drift apart.

```
30/30 checks passed — All icon names resolve. index.html bell copy is in sync.
```

**b) `scratch/verify-icon-consolidation-visual.js`** — Puppeteer visual pass against the real running app (not just source text). Opens the Assignment Detail drawer harness and the live shell in light/dark × desktop/mobile, screenshots each into `scratch/icon-consolidation-verify/`, and asserts real `<svg>` markup is present with zero leftover emoji/chevron glyphs in the rendered text.

```
[assignment-drawer/light]  svgCount=20  hasEmoji=false
[assignment-drawer/dark]   svgCount=20  hasEmoji=false
[shell/light/desktop]      allItemsHaveSvg=true  bellHasSvg=true  paletteHasSvg=true
[shell/light/mobile]       allItemsHaveSvg=true  bellHasSvg=true  paletteHasSvg=true
[shell/dark/desktop]       allItemsHaveSvg=true  bellHasSvg=true  paletteHasSvg=true
[shell/dark/mobile]        allItemsHaveSvg=true  bellHasSvg=true  paletteHasSvg=true

Icon consolidation visual pass: all surfaces render real SVG icons, no leftover emoji, no page errors.
```

(Rail item/icon counts show 1 in this headless run — a standing, pre-existing test-environment limitation documented in the script itself: a bare `localStorage` session claim doesn't grant real permissions without a live Firebase Auth session, so only the "Today" domain renders. Full 8-domain rail coverage is asserted separately by `verify-domain-shell-phase1a.js`'s mocked-permission harness. What this script *does* assert — every rail item that does render carries a real SVG, not a fixed count — holds.)

**c) `scripts/vehicle-management-presentation-check.mjs`** — full regression suite for the Vehicle Management presentation layer, updated this phase to assert `icon-system.js` no longer exists and `vehicleTypeIconName` now lives in `analytics-shell.js`.

```
Passed: 52 / Failed: 0 / Total: 52
```

**d) Reference grep** — confirmed zero remaining references to `icon-system`/`renderIcon` anywhere in application code (one unrelated hit in a vendored `_ds_bundle.js` prototype file, out of scope).

## 5. Files changed

**Deleted:**
- `js/components/icon-system.js`

**Modified:**
- `js/analytics/analytics-shell.js` — glyph set additions/collapse, `vehicleTypeIconName()` relocation
- `js/analytics/executive-ui-kit.js` — re-export `vehicleTypeIconName`
- `js/app.js` — import source switch
- `js/components/vehicle-detail-drawer.js` — import source switch
- `js/modal.js`, `js/notifications.js`, `js/shell/command-palette.js`, `js/shell/domain-shell.js` — emoji/inline-SVG/local-map → `anIcon()`
- `index.html` — header bell markup + cache-bust query params
- `platform.css` — removed dead `.domshell-icon-dot`/`.domshell-icon-accent-stroke` rules
- `js/config.js`, `version.json`, `service-worker.js` — version bump to `1.30.11.3`
- `scripts/vehicle-management-presentation-check.mjs` — regression assertions updated for the retirement

**New (verification artifacts, committed alongside the code change):**
- `scratch/verify-icon-consolidation-names.mjs`
- `scratch/verify-icon-consolidation-visual.js`
- `scratch/icon-consolidation-verify/*.png` (6 screenshots)

## 6. Known limitations

- `index.html`'s header bell is a manually-synced literal copy, not a live template call — by design (plain HTML has no templating), but it means any future edit to `anIcon('bell')`'s path must remember to update this file too. The names-verify script's byte-identity check is the safety net; it will fail loudly if the two drift.
- The headless-permission ceiling described in §4(b) means this phase's own visual script cannot independently confirm all 8 rail domains render icons correctly in one run — that coverage lives in a different, pre-existing script.

## 7. Production / Git

**Committed** as `3fc2aa7` — *"feat: v1.30.11.3 - Design System Program Phase 4: Application-Wide Icon Consolidation"*. **Not pushed** (`main` is 6 commits ahead of `origin/main`, spanning Phases 2–4 plus the Domain Shell IA default-flip). **Not deployed** to Firebase Hosting or Vercel.
