# Phase 12 — Sprint 12.2: Layout Binding + Version-Pinned Rendering

**Status:** Implemented, regression-tested, NOT committed.
**Version:** unchanged (`1.27.1`).
**Builds on:** Sprint 12.1 (Document Design System).
**Scope:** small, additive, backward-compatible. Zero visual change to any document shipping today.

---

## Why this sprint (Phase 12 directive)

Two Phase 12 pillars sit directly on top of the Sprint 12.1 design system:

> **MULTIPLE DOCUMENT TEMPLATES** — "Composer automatically chooses the
> appropriate template."
>
> **LAYOUT VERSIONING** — "Archived documents always render using their
> original version. New documents automatically use the newest approved
> version. Nothing changes silently."

Before this sprint, the composer's template choice was an implicit string
literal in `review-workspace.js` (`generateAndOpen('composer-document', …)`),
and a rendered document carried no record of *which layout version* produced
it — so a future layout `v2` would silently re-flow every past document.

---

## What was built

### 1. `js/docs/design-system/document-layout-binding.js` (new, pure)

A governed resolver mapping a document's **domainType → { templateId,
designSystemId, designVersion }**:

- `resolveLayout(domainType)` — the layout a **new** document renders with
  (`designVersion` = the latest). An unknown domainType **throws** (template
  choice is governed, never a guess).
- `stampLayout(domainType[, at])` — a frozen record to persist on an
  archived/published document, so a later render reproduces the exact layout
  it was published under.
- `resolvePinnedDesign(stamp)` — the exact design a stamp pins to; **throws**
  if that version no longer exists, so an archived document surfaces the
  problem loudly instead of silently inheriting a later redesign.

Imports only the design-system registry — no DOM, no side effects, fully
Node-testable.

**Honest scope:** today there is exactly one real binding — the composed
`ComposerDocument` (domainType `nor`) → the generic `composer-document`
template over the `composer` design system — because that is the one composed
output that exists in this codebase (the same reason each design system has
exactly one version). The *structure* is the Phase 12 infrastructure; new
bindings/versions append here with no code change elsewhere.

### 2. `js/docs/templates/composer-document.js` — honors a pinned `layoutVersion`

`build(data)` now resolves `getDesignSystem('composer', data.layoutVersion)`.
Omitted (every current caller) → the latest, so today's output is byte-for-byte
unchanged. A pin to a version that no longer exists throws at render.

### 3. `js/v2/ui/review-workspace.js` — export resolves + stamps its layout

`buildExportData(doc)` now resolves the governed layout for `doc.domainType`
and attaches `templateId` + `layoutVersion` to the export data; the PDF export
calls `generateAndOpen(data.templateId, …)` instead of the hardcoded string.
For the real `nor` documents this resolves to the exact same
`composer-document` template at version 1, so the exported PDF is byte-for-byte
unchanged — but it now carries its layout version for reproducible re-rendering.
Guarded (`try/catch`) so a user-triggered export can never crash on an
unexpected domainType (it then keeps the historical generic default, unpinned).

---

## Regression

| Check | Result |
| --- | --- |
| `scripts/document-layout-binding-check.mjs` (new — 15 assertions: governed resolution, unbound-throws, stamp/pin round-trip, stale-version-throws, template honors pinned version, end-to-end render) | **15/15 pass** |
| `scripts/document-design-system-check.mjs` (Sprint 12.1) | **45/45 pass** (unchanged) |
| `scripts/composer-document-structure-check.mjs` | **39/39 pass** (unchanged) |
| `scripts/doc-theme-primitives-check.mjs` | **26/26 pass** (unchanged) |
| `scripts/review-workspace-render-check.mjs` (exercises the modified UI file) | **51/51 pass** (unchanged) |
| `node --check` on all touched files | clean |

---

## What this is NOT (honest scope + disclosure)

- **The published/archived ComposerDocument does not yet persist a layout
  stamp.** `stampLayout()` produces the record and `resolvePinnedDesign()`
  consumes it, and the export path now *carries* a `layoutVersion`, but wiring
  the stamp into the archive record's stored shape (so a re-open of an
  archived doc pins automatically) is the next follow-up — it touches the
  archive persistence layer, kept out of this small sprint.
- **The export path itself (pdfmake generation) is not Node-executable** in
  this repo (per its established convention — pdf-exporter lazy-loads pdfmake
  in the browser). The `review-workspace.js` wiring is verified structurally
  (`node --check`) and by the existing 51/51 render check confirming the module
  still loads/renders; the resolved values are proven byte-identical by the
  pure binding + template checks above.

---

## Files

- `js/docs/design-system/document-layout-binding.js` — **new**
- `scripts/document-layout-binding-check.mjs` — **new** (15 checks)
- `js/docs/templates/composer-document.js` — honors optional pinned `layoutVersion`
- `js/v2/ui/review-workspace.js` — export resolves template + stamps `layoutVersion` via the binding
- `docs/PHASE_12_SPRINT_12_2_LAYOUT_BINDING_VERSIONING.md` — this document
