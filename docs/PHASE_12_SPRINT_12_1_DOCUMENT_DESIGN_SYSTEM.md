# Phase 12 — Sprint 12.1: Document Design System (Foundation)

**Status:** Implemented, regression-tested, NOT committed.
**Version:** unchanged (`1.27.1`) — no release; no `APP_VERSION` bump, no cache-bust resync.
**Scope:** small, isolated, backward-compatible, feature-free-of-behavior-change. Zero visual change to any document shipping today.

---

## Why this sprint (Phase 12 directive)

Phase 12 transforms Sarpras Intelligence from a Document Parser into an
Organizational Composition Engine. One explicit pillar of that directive is
the **Document Design System**:

> The visual appearance of every NOR must NEVER be hardcoded.
> Settings → Document Design System becomes the single source of truth for
> every document layout. The Composer renders documents from this
> configuration. Never from hardcoded CSS. Never from hardcoded JavaScript.

Everything else on the layout half of Phase 12 — **Document Template Manager**,
**Multiple Document Templates**, **Live Template Editor**, **Layout Learning**,
**Layout Versioning** — depends on there first being a single, governed,
versioned, explainable place where a document's layout is *declared* rather
than *hardcoded*. This sprint builds exactly that foundation, and nothing
more, honoring the master-context rule: *incremental, small diff, isolated,
fully testable, backward compatible, never a massive rewrite.*

Before this sprint, document layout lived as scattered literals in two places:

- `js/docs/doc-theme.js` — module constants (`A4_MARGINS`, `CONTENT_W`,
  `TOKENS`, `DEFAULT_STYLE`, `BASE_STYLES`, `tableLayout()`, `headerRule()`,
  `orgLogo()`, `signatureBlock()`, footer) shared by every *operational*
  document (analytics, reimbursement, test-report, overtime, composer).
- `js/docs/templates/nor.js` — the official PBSI "Nota Organisasi Realisasi
  Petty Cash" letter's own hardcoded page margins, colours, rincian-table
  grid, column widths, and heading sizes.

---

## What was built

### 1. `js/docs/design-system/document-design-system.js` (new, ~300 lines, pure)

The single source of truth for every document's layout. Pure data + pure
builders — **no DOM, no imports, no side effects**, so it is unit-testable in
Node and can never cause a circular import (`doc-theme.js` imports *this*;
this imports nothing).

- **Three seed design systems**, each seeded **byte-for-byte** from the code
  that owned the values before this sprint:
  - `operational` v1 ← `doc-theme.js` (shared operational design language).
  - `nor` v1 ← `templates/nor.js` (official PBSI Petty Cash NOR).
  - `composer` v1 ← `templates/composer-document.js` (generic composed draft;
    inherits the operational palette/type, owns only its page margins).
- **Versioned registry** — each template id owns an ordered list of versions.
  New versions append. Archived documents will pin the exact version they were
  composed with; new documents use the latest.
- **Resolver** — `getDesignSystem(id[, version])`. Omitting the version returns
  the latest. **An unknown id or an unknown version THROWS** — never a silent
  fallback, because Phase 12's Layout Versioning rule is *"Nothing changes
  silently."* A caller pinning an archived layout must handle a missing version
  explicitly, never inherit a redesign by accident.
- **Provenance** — every descriptor carries `label` + `provenance`;
  `designProvenance(ds)` renders an explainable one-liner. Satisfies *"Every
  automatic decision must include provenance."*
- **Immutability** — the whole registry is deep-frozen, so a template can never
  mutate the shared source of truth.
- **Pure pdfmake builders** — `pageGeometry(ds)` → `{pageSize, pageOrientation,
  pageMargins}`; `tableGridLayout(ds)` → a pdfmake table `layout` object. So a
  template plugs the design system straight into its DocumentDefinition instead
  of writing the raw numbers.

### 2. `js/docs/doc-theme.js` — now DERIVED, not hardcoded

Every public constant is now derived from `operational` v1 (which was seeded
*from* these same constants), so all five operational templates keep
pixel-identical output while no layout number is hardcoded in this file:

- `MM`, `A4_MARGINS`, `CONTENT_W`, `TOKENS`, `DEFAULT_STYLE`, `BASE_STYLES`
  all read from `getDesignSystem('operational')`.
- `tableLayout()` → `tableGridLayout(OP)`.
- `headerRule()`, `orgLogo()`, `signatureBlock()`, `signatureGrid()`,
  `docFooter()` source their literals (rule weight/colour, logo width/margin,
  signing gap, column cap, footer type) from the design system.

`A4_MARGINS === getDesignSystem('operational').page.margins` (the *same*
frozen array, not a copy) — proving single source of truth, not duplication.

### 3. `js/docs/templates/nor.js` — reads its layout from `nor` v1

Page geometry (`...pageGeometry(NOR_DS)`), body default style, `INK`/`DIM`
colours, the rincian-table grid (`tableGridLayout(NOR_DS)`), the meta / balance
/ item-table column widths, and both heading sizes now come from the design
system. The printed PDF is byte-identical; the numbers just live in one
governed place now.

### 4. `js/docs/templates/composer-document.js` — reads its page geometry from `composer` v1

Page size, page margins, and logo width now come from `getDesignSystem('composer')`.
Palette/typography still flow in from the shared operational design via
`doc-theme` (`TOKENS`/`BASE_STYLES`), so nothing here is hardcoded that the
design system could own.

---

## Regression

| Check | Result |
| --- | --- |
| `scripts/document-design-system-check.mjs` (new — 45 assertions across resolver/versioning, immutability, provenance, byte-identical seed, pure builders, doc-theme derivation, live template rendering) | **45/45 pass** |
| `scripts/doc-theme-primitives-check.mjs` (nor.js byte-for-byte output) | **26/26 pass** (unchanged) |
| `scripts/composer-document-structure-check.mjs` | **39/39 pass** (unchanged) |
| `scripts/overtime-template-check.mjs` (operational-family consumer) | **16/16 pass** (unchanged) |
| `scripts/measure-reimbursement.mjs` (renders reimbursement template) | renders cleanly (unchanged) |
| `node --check` on all touched + all doc-theme-consuming templates | clean |

**Byte-for-byte proof:** the new harness asserts each design-system value
equals the exact pre-sprint literal (`[48,37,48,31]`, the 8-colour palette,
`[56,40,56,40]`, the 1pt-ink rincian grid, `[26,70,'*',92,86]`, etc.), *and*
that the real `nor`/`composer` templates now render those values straight from
the design system. The two pre-existing byte-for-byte suites still pass
untouched, which is the independent confirmation that no pixel moved.

---

## What this is NOT (honest scope)

- **No Settings UI yet.** The directive's "Settings → Document Design System"
  admin surface and the "Live Template Editor" are later sprints. This sprint
  is the data model + resolver + wiring they will build on.
- **No new visual capability.** No `v2` layout exists yet; only `v1` of each
  design system, encoding today's exact look. Adding a real `v2` (a genuine
  redesign) is a future, human-approved change.
- **No archived-document version pinning wired yet.** The resolver *supports*
  pinning (`getDesignSystem(id, n)`) and refuses unknown versions, but the
  composer/archive does not yet stamp a layout version onto stored documents.
  That is the natural Sprint 12.2/12.3 follow-up.
- **Font sizes inside table cells / body paragraphs in `nor.js`** remain inline
  where they are structural to that specific letter; the design system already
  models them (`typography.tableCell`, etc.) so a later sprint can wire them
  without inventing anything.

---

## Files

- `js/docs/design-system/document-design-system.js` — **new**
- `scripts/document-design-system-check.mjs` — **new** (45 checks)
- `js/docs/doc-theme.js` — derives all constants/builders from `operational` v1
- `js/docs/templates/nor.js` — reads layout from `nor` v1
- `js/docs/templates/composer-document.js` — reads page geometry from `composer` v1
- `docs/PHASE_12_SPRINT_12_1_DOCUMENT_DESIGN_SYSTEM.md` — this document
