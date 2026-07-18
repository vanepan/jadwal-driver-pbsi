# Sarpras Intelligence V2 — Phase 10, Sprint 10.6: Export & Publishing

> Scope: PDF, Word, and Archive for an APPROVED ComposerDocument. Method:
> the user explicitly chose to build both PDF and Word this phase
> (overriding the PDF-only recommendation made when Phase 10 was planned)
> — the one sprint flagged as having real technical risk, resolved by
> testing the actual CDN dependency LIVE, in this environment, before
> writing any export code, not assumed from the plan.

---

## Headline finding

**The flagged risk was real enough to test, not just note, and the test
changed the plan.** Phase 10 planning flagged: "no bundler exists in this
app, so any docx library must ship a browser UMD build hostable from a
CDN... confirm a suitable library exists... before committing further."
Rather than assume the `docx` library (which requires building a full
document object model) would work, this sprint tested actual CDN
reachability and library behavior FIRST: both
`cdnjs.cloudflare.com` (pdfmake, already proven) and `unpkg.com`
(html-docx-js, new) returned HTTP 200 in this sandboxed environment, and
loading `html-docx-js` live produced a real, correctly-typed
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`
Blob (4370 bytes) from a plain HTML string — no document-object-model
library needed. This is why `docx-exporter.js` is built on `html-docx-js`
converting HTML (the same kind of string `nor-paper.js` already builds for
the on-screen NOR) rather than `docx`'s object model — a real, tested,
lower-integration-cost choice, not the first option assumed.

---

## 1. templates/composer-document.js — deliberately NOT the official NOR format

A second real finding, made by reading `templates/nor.js` before writing
anything: that template needs `recipients[]`/`cc[]`/a balance-recap
table/a signatory grid — structured fields the V2 Composer's flat
`sections: [{field, value}]` shape does not carry (Sprint 9.8's own
finding: "Recipient/cc block: 100% manual, both new types"). Reusing it
directly was never viable; a NEW, GENUINE, GENERIC template was the only
honest option — one that renders exactly what the Composer has (every
section's real field/value pair, humanized field labels, a plain metadata
header) under a disclaimer stating plainly that recipient/cc/formatting
still need manual completion. This is "the composed draft, exported for a
reviewer to finish by hand," never a fabricated camera-ready artifact.

Reuses `js/docs/doc-theme.js`'s shared design tokens/builders
(`docHeader`/`headerRule`/`docFooter`/`BASE_STYLES`) — the SAME visual
language every other generated document in this app already uses, no new
styling invented. `buildContentModel(data)` is the ONE place "what does an
export contain" is decided; both the pdfmake `build()` and the new
`buildHtml()` (for Word) render that SAME model — one source of truth, two
thin format-specific renderers, never two independently-maintained copies
that could drift apart.

---

## 2. docx-exporter.js — the new CDN dependency

Mirrors `pdf-exporter.js`'s exact lazy-CDN-script-load idiom
(`_loadScript`, cached load promise, global-presence check) —
`https://unpkg.com/html-docx-js/dist/html-docx.js`, exposing
`window.htmlDocx.asBlob(html)`. `exportHtmlToDocx(html)` is the stable,
single-function interface — the same "Blob in/out, backend is an
implementation detail" contract `pdf-exporter.js` already established.

---

## 3. Archive-on-publish — composed in ui/, not a new domain edge

`transitionStatus(documentId, 'published', ...)` stays a pure
`composer-store.js` status change — no archive coupling added to that
module. The actual archive write is composed in `review-workspace.js`'s
"Terbitkan" click handler instead: `archiveDocument(seed)` from the
ALREADY-GENERIC `organizational-memory/services/archive-service.js` (its
own header: "the ONE way a document enters organizational memory," never
domain-specific), mirroring the EXACT pattern `knowledge-center.js`'s own
`kc-gov-reject` handler already uses (calling both `rejectKnowledge()` and
`archiveRejectedKnowledge()` together, composed in the UI layer — the one
layer allowed to see across `document-intelligence/` and
`organizational-memory/`). No new architecture, no new domain edge, the
exact established composition pattern applied to a third case.

`documentNumber` (required by `ArchiveRecord`) uses the real
`norNumber` field from the document's sections when a Conversation
happened to gather one, falling back to the document's own `documentId`
otherwise — never a fabricated number, honest either way.

**Explicitly out of scope, and said so rather than silently skipped**: no
binary file storage exists anywhere in this codebase (confirmed, again,
by reading `archive-record-contract.js`'s own header) — `Terbitkan`
records provenance, the PDF/Word artifact stays a local download, same UX
as V1's existing NOR export. Adding real file storage is a materially
bigger, separate infrastructure decision, not folded into this sprint.

---

## 4. Reasoning-metadata scrubbing — enforced by construction

Spec: "Published document must never contain reasoning metadata."
`buildExportData(doc)` in `review-workspace.js` is the ONE function that
turns a `ComposerDocument` into export input, and it reads only
`doc.sections`/`doc.domainType`/`doc.version`/`doc.status` — there is
literally no parameter through which `getExplainability()`'s
`reasoningTrace` bundle could reach either template. Not a filter step
applied after the fact; the data was never passed in to begin with.

---

## 5. Verified

**Full regression, unrelated subsystems untouched** — all 7 pre-existing
Node suites green and unchanged (`composer-foundation-check.mjs` 56/56,
`north-star-acceptance-check.mjs` 38/38, `nor-composition-check.mjs`
16/16, `problem-solving-integration-check.mjs` 30/30,
`conversation-ownership-check.mjs` 77/77, `knowledge-ownership-check.mjs`
56/56), plus **`archive-ownership-check.mjs` 74/74** — confirming the new
`archiveDocument()` call site from `review-workspace.js` correctly calls
the Archive SERVICE (not the repository directly), respecting "exactly
one caller" for the repository's own writers. `smoke-boot.mjs` PASS.

**Real browser, real CDN network calls, no login gate** —
`review-workspace-render-check.mjs` extended: 38/38 (was 30/30). The
strongest verification in this environment: a document driven all the way
to APPROVED via real clicks, then:

- **"Unduh PDF"** — a real network fetch of pdfmake from its CDN, a real
  `pdfMake.createPdf().getBlob()` call, and — the strongest possible
  proof — `document-viewer.js`'s real modal actually appearing in the DOM
  (`.docv-overlay.open`), titled with the real documentId.
- **"Unduh Word (.docx)"** — a real network fetch of html-docx-js, a real
  `asBlob()` call, completing with no export error and the button
  re-enabling (proving the full async chain resolved, not just that it
  didn't throw synchronously).
- **"Terbitkan"** — the status flips to "Diterbitkan" live, AND a real
  `ArchiveRecord` is independently confirmed via
  `findArchiveRecord(...)` — correctly referencing the real ComposerDocument
  as its source and attributed to the real signed-in actor (`'evan'`),
  not a hardcoded placeholder.

**Not verified, same limitation as every prior Phase 10 sprint**: the
real Settings → Power View → Review Workspace click path with a real
signed-in user in production. Also not verified: whether the exported PDF
or DOCX file, opened in an actual PDF reader / Microsoft Word, renders
acceptably to a human — this environment confirmed the Blob is real,
correctly-typed, and non-trivial in size, but did not (and could not,
without a GUI document viewer) visually inspect the rendered page.

---

## 6. Phase 10 backlog

Sprint 10.7 (Pilot UX Validation) is next — this sprint's own
`archiveDocument()` call, `transitionStatus` calls throughout 10.4-10.6,
and `getRevisionHistory` from 10.1/10.3 are exactly the real data sources
Sprint 10.7's metrics (review duration, manual edits, approval rate,
common corrections) already have real data to aggregate from — no new
engine needed there either, per the original Phase 10 plan.
