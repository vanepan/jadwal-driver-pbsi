# Phase 12 — Sprint 12.3: Document Template Manager Core (Runtime-registrable, Validated Versions)

**Status:** Implemented, regression-tested, NOT committed.
**Version:** unchanged (`1.27.1`).
**Builds on:** Sprint 12.1 (Design System) + Sprint 12.2 (Layout Binding/Versioning).
**Scope:** small, additive, backward-compatible. Zero visual change to any document shipping today.

---

## Why this sprint (Phase 12 directive)

> **DOCUMENT TEMPLATE MANAGER** — "Administrators can configure Paper Size,
> Margins, Fonts, … No source code changes should ever be required."
>
> **LAYOUT VERSIONING** — "Archived documents always render using their
> original version. New documents automatically use the newest approved
> version. Nothing changes silently."

Sprint 12.1 made layout a versioned data descriptor; Sprint 12.2 let a
document pin and resolve a version. But the registry was still compile-time
constant — a new layout meant editing source. This sprint turns the registry
into a **sanctioned, validated, append-only, runtime-registrable store** — the
exact mechanism a future Settings / Live Template Editor UI writes through — and
proves the versioning safety guarantees end-to-end.

---

## What was built

### 1. `validateDesignSystem(descriptor)` (new, pure)

The minimal contract a layout must satisfy to be **renderable and
explainable**: non-empty `id`/`label`/`provenance` (explainability is not
optional), a positive-integer `version`, and a `page` block with a string
`size`, a `portrait|landscape` `orientation`, and `margins` of four
non-negative numbers. Returns `{ ok, errors[] }`. The Template Manager UI calls
this to pre-validate admin input.

### 2. `registerDesignSystemVersion(id, descriptor)` (new)

The **only** sanctioned mutation of the registry. Enforces:
- `descriptor.id` must equal `id`;
- `descriptor.version` must be exactly *(latest existing + 1)*, or `1` for a
  brand-new id — **never overwrite, never skip** a version;
- `descriptor` must pass `validateDesignSystem()`.

Otherwise it throws with the aggregated errors. On success it deep-freezes and
appends the descriptor and returns it.

### 3. Registry container is now appendable; descriptors stay deep-frozen

`DESIGN_SYSTEMS` went from a fully-frozen object to per-descriptor deep-freeze
with an appendable container. A consumer still cannot mutate any descriptor
(the source of truth is immutable); only `registerDesignSystemVersion()` can
add a new version.

### 4. `composer-document.js` resolves its layout at **build** time

Previously it cached `getDesignSystem('composer')` at module load, which would
have frozen "the latest" at import. It now resolves inside `build(data)`, so a
**new** document always renders with the newest registered version while a
document carrying a pinned `layoutVersion` renders with that exact version. For
today's single registered version (v1) the output is byte-for-byte unchanged.

---

## Regression

| Check | Result |
| --- | --- |
| `scripts/document-template-manager-check.mjs` (new — 20 assertions: validation contract, append-only/gap-free/overwrite-proof registration, new-doc→v2 while pinned-doc→v1, v1 immutability after registration) | **20/20 pass** |
| `scripts/document-layout-binding-check.mjs` (Sprint 12.2) | **15/15 pass** (unchanged) |
| `scripts/document-design-system-check.mjs` (Sprint 12.1) | **45/45 pass** (unchanged) |
| `scripts/composer-document-structure-check.mjs` | **39/39 pass** (unchanged) |
| `scripts/doc-theme-primitives-check.mjs` | **26/26 pass** (unchanged) |
| `scripts/review-workspace-render-check.mjs` | **51/51 pass** (unchanged) |
| `scripts/overtime-template-check.mjs` | **16/16 pass** (unchanged) |

The key proof (harness section [3]): after registering a real `composer` v2
with different margins, a **new** document renders with v2 while a document
**pinned to v1** renders with v1's exact `[48,37,48,48]` margins — "new docs use
the newest, archived docs keep their original, nothing changes silently."

---

## What this is NOT (honest scope)

- **No Settings / Live Editor UI yet.** This is the validated write-path those
  will call; the visual editor itself is a later sprint (and needs the live
  browser this environment cannot drive).
- **`nor` and the operational family still cache their design at module load.**
  Those are the petty-cash / operational documents, not the composer output the
  Template Manager targets, and they have strong byte-identical tests; leaving
  them cached keeps that guarantee simplest. Build-time resolution was applied
  only where "new docs use the newest version" is a live requirement (the
  composer output).
- **No persistence of registered versions.** Runtime registration lives for the
  session; persisting admin-authored versions into storage is a follow-up that
  touches the (Firebase-coupled, non-Node-testable) persistence layer.

---

## Files

- `js/docs/design-system/document-design-system.js` — appendable registry + `validateDesignSystem()` + `registerDesignSystemVersion()`
- `js/docs/templates/composer-document.js` — resolves layout at build time (new docs get newest; pinned docs get their version)
- `scripts/document-template-manager-check.mjs` — **new** (20 checks)
- `docs/PHASE_12_SPRINT_12_3_TEMPLATE_MANAGER_CORE.md` — this document
