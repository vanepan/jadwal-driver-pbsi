# V2 — Sarpras Intelligence Phase 6C: NOR Draft → Live PDF Preview

**Status:** implemented, tested, full regression green. **NOT committed, NOT
pushed, NOT deployed.** Feature flag OFF. Phase 6 sub‑flag OFF. OpenAI
calls: 0. External HTTP from the new code: 0. Production mutations: 0. No V1
change (proven — §15). No Petty Cash change. No NOR Registry
numbering/publication change. **No `database.rules.json` change.**
**`functions/index.js` unchanged** — the preview is a new `op` on the
already‑wired `intelligenceNorDraft` callable, not a new function.

> Phase 6B ended at *"no V2 code path renders a NOR to PDF at all"* and
> deliberately did not invent the missing entry point. Phase 6C **is** that
> entry point: a reviewer, looking at a persisted `NorDraftRecord`, gets a
> real in‑app PDF of it — a **review artifact**, never a publication.

---

## 1. Architecture Discovery — the exact V2 → renderer path

### 1.1 The rendering engine (reused, one small additive change)

| Layer | File | Role |
|---|---|---|
| Engine | [js/docs/doc-engine.js](js/docs/doc-engine.js) | `generate(id, vm)` → real pdfmake `Blob`; `generateAndOpen(id, vm, {viewer})` → renders + opens the in‑app viewer |
| Viewer | [js/docs/document-viewer.js](js/docs/document-viewer.js) | the reusable modal PDF viewer (Cetak / Unduh / Bagikan) — the existing in‑app preview surface |
| PDF backend | [js/docs/pdf-exporter.js](js/docs/pdf-exporter.js) | `PdfmakeBackend` (default) — pdfmake 0.2.10, client‑side, `Blob` in/out |
| Template | [js/docs/templates/composer-document.js](js/docs/templates/composer-document.js) | the **generic** letter renderer: `{documentId, domainType, version, statusLabel, approvedAt, sections:[{field,value}]}` → letterhead + meta rows + body paragraphs + a "Rincian" appendix + signature area + disclaimer. Explicitly refuses to fabricate recipient blocks / balance tables. |
| Layout SoT | [document-design-system.js](js/docs/design-system/document-design-system.js) | `getDesignSystem('composer')` → A4, margins `[48,37,48,48]`, logo width `48` |

**Why not `js/docs/templates/nor.js`:** that template is the *Petty Cash
Realisasi* NOR — hard‑coded petty‑cash body prose, a balance recap, a
"terbilang" line, a petty‑cash expense table. A Sarpras Intelligence draft
carries none of that (free‑text `body`, structured procurement `facts`, a
`subject`, a `recipient`). Rendering it through `nor.js` would require
fabricating petty‑cash structure the draft does not have, or a broad
rewrite of a V1 file — both are §42 HARD‑STOP conditions. `composer-document.js`
is the codebase's only generic letter renderer and already accepts exactly
this shape of data.

### 1.2 The V2 → Composer path Phase 6C builds

```
NorDraftRecord  (persisted, /intelligence_nor_drafts/{id} — Phase 4)
      │  intelligenceNorDraft  op:'preview'   (server: auth → authz → owner → freshness re-check)
      ▼
{ draft: NorDraftRecord, previewVisual:{status, templateId, templateVersion, reason} }
      │  js/intelligence-backend-wiring.js#previewIntelligenceNorDraft
      ├── resolveRenderingVisualModel(draft.provenance.visualBinding)   ← Phase 6B, ONLY when previewVisual.status === 'applied'
      ▼
buildIntelligenceNorViewModel(draft, { renderingVisualModel })          ← NEW pure module (src/intelligence/generation/)
      │
      ▼
composer-document `data`  { …, renderingVisualModel?, isPreview:true, disclaimerOverride }
      │  js/intelligence-console.js
      ▼
DocumentEngine.generateAndOpen('composer-document', data, { cache:false, viewer })  ← EXISTING engine, one PDF pipeline
      ▼
real application/pdf Blob → document-viewer.js modal
```

Nothing else in the app touches this path. `composer-document.js`'s only
prior caller (the older `review-workspace.js` pilot) never sets
`renderingVisualModel` / `isPreview` / `disclaimerOverride` ⇒ its output is
byte‑for‑byte unchanged.

---

## 2. V2 ViewModel — `buildIntelligenceNorViewModel(record, opts)`

New pure module:
[src/intelligence/generation/nor-preview-view-model.js](src/intelligence/generation/nor-preview-view-model.js).
Maps a **persisted `NorDraftRecord`** (the `norDraftStore.rehydrate`
shape) — never the console's normalized `state.draft` view — into the
`composer-document` `build()` input.

| NorDraftRecord field | → composer section | Notes |
|---|---|---|
| `date` (`YYYY-MM-DD`) | `{field:'dateline', value:'Jakarta, 6 September 2026'}` | pure Indonesian long‑date; a non‑ISO / invalid date is used verbatim after `"Jakarta, "`; a missing date ⇒ **no dateline** (never a fabricated date) |
| `subject` | `{field:'perihal', …}` | the fixed "Perihal" letterhead row |
| `recipient` + `recipientStatus` | `{field:'recipients', value:[disclosed]}` | **`recipientStatus !== 'known'` ⇒ the text itself carries `" (diusulkan — belum dikonfirmasi)"`** (§6). A confirmed recipient uses the plain canonical name. |
| `body` | one `{field:'pattern:body-N', …}` per `\n\n`‑separated paragraph | `pattern:` routes it through the Composer as *letter body*, not a "Rincian" row; paragraph breaks preserved; an empty body ⇒ the Composer's own "Belum ada isi surat" line |
| `facts.{item,quantity,unit,purpose,budget}` | one `{field:'<Indonesian label>', …}` each | the "Rincian" appendix; a missing fact is simply omitted (§5 — never invented) |
| `jenis` | `domainType: 'NOR — <jenis>'` (else `'NOR'`) | — |
| `version` | `version` | the **saved** version (§17) |
| — | `statusLabel: 'Draf — menunggu peninjauan'` | the draft's real status; **never** "Disetujui"/"Diterbitkan" |
| — | `approvedAt: null` | — |
| `numbering.publishedNumber` / `numbering.suggestedNumber` | **nothing** | **no `norNumber` section is ever emitted** (§13) |
| — | `isPreview: true` | drives the "PRATINJAU — BUKAN DOKUMEN RESMI" marker |
| — | `disclaimerOverride` | a preview‑honest disclaimer (see §12) — replaces the Composer's built‑in "…yang telah disetujui" text, which would be false for a `requires_review` draft |
| `provenance.visualBinding` | **not read by this module** | geometry is applied only via `opts.renderingVisualModel`, which the wiring resolves *only* on a server `applied` verdict — a stored binding never self‑applies |

Signer (§8): **no** signatory section is emitted, so
`composer-document.js`'s own "nothing suggested" path (an empty signature
area) applies. No signer is ever inferred from role or recipient.

Pure: no DOM, no pdfmake, no Firebase, no clock, no import of any `js/`
file, no generic spread of the untrusted record. Frozen, deterministic
output.

### 2.1 `composer-document.js` — the one additive change (§25)

Three optional, default‑absent fields, mirroring exactly the additive
pattern Phase 6B used in `nor.js`:

- `data.renderingVisualModel` — a Phase 6B `nor-visual-rendering-model@1`.
  Consumed for **page size, margins, and logo position only**, each guarded
  by a cheap `Number.isFinite` check (orthogonal defence‑in‑depth against a
  NaN reaching pdfmake's async pipeline — the v1.28.11 hang class). Absent
  or malformed ⇒ the `getDesignSystem('composer')` defaults stand.
- `data.isPreview` — renders a centred "PRATINJAU — BUKAN DOKUMEN RESMI"
  line as the first content node.
- `data.disclaimerOverride` — replaces the footer disclaimer string (PDF
  and Word paths both).

`nor-composition-check.mjs`, `composer-document-structure-check.mjs`,
`document-design-system-check.mjs`, `doc-theme-primitives-check.mjs`,
`document-layout-binding-check.mjs`, `live-document-workspace-check.mjs` all
re‑ran green, unmodified.

---

## 3. Preview lifecycle stage

The preview is available **from the human‑review stage** — i.e. whenever the
NOR draft & review workspace is on screen.

- A `NorDraftRecord` **only ever has `status: 'requires_review'`** (there is
  no `in_review`/`approved`/`published` on the draft contract; those are
  **NOR Registry** states — a separate Phase 5 store the preview never
  touches).
- Because the preview never reads or writes the Registry, it is
  **preview‑only by construction** at every workspace stage. It is not
  gated on Registry lifecycle, and it deliberately does **not** invent a
  new "preview allowed at `approved`" policy (§33) — there is no lifecycle
  transition to authorise.

```
requires_review ──▶ [Pratinjau PDF] ──▶ (human edits / re-saves / re-previews) ──▶ Setujui ──▶ Registry ──▶ Terbitkan
                         ▲ read/render only — never advances any of the arrows
```

---

## 4. Preview endpoint — `intelligenceNorDraft` `op:'preview'`

No new callable, **no `functions/index.js` change**. A fifth `op` on the
Phase 4 callable
([functions/src/intelligence/intelligenceNorDraft.js](functions/src/intelligence/intelligenceNorDraft.js)),
reusing its existing `request.auth.uid` authentication, `canUseIntelligence`
authorization, and owner check verbatim.

```
op:'preview', draftId
  1. authenticate           request.auth.uid            (HttpsError otherwise)
  2. authorize              canUseIntelligence(token)    (HttpsError otherwise)
  3. load                   store.getDraft(db, draftId)  (NOT_FOUND envelope otherwise)
  4. own                    draft.ownerId === auth.uid   (FORBIDDEN envelope, NO bytes, otherwise)
  5. freshness verdict      assessPreviewVisual(db, draft.provenance):
        · no approved-template binding                     → { status:'fallback' }
        · approved-template binding, no generation context → { status:'invalid' }   (inconsistent record — fail closed)
        · verifyGenerationContext OK                        → { status:'applied',  templateId, templateVersion }
        · verifyGenerationContext STALE                     → { status:'stale',    templateId, templateVersion }
        · verifyGenerationContext INVALID                   → { status:'invalid' }
  6. return  { ok:true, data:{ draft: NorDraftRecord, previewVisual } }
```

Step 5 re‑runs the **Phase 6A** point‑lookup verifier
([generationContextVerifier.js](functions/src/intelligence/generationContextVerifier.js))
against the **live** Style Guide / Visual Template records — so the browser
is never told a stored template is still authoritative after a curator has
deprecated or superseded it (§32). It performs **no write of any kind** — no
`createDraft`/`updateDraft`/`set`, no Registry node, no numbering counter,
no lifecycle transition.

The client render stays entirely in the browser (the existing pdfmake
pipeline), so no PDF bytes cross an HTTP/callable boundary and §35's
"arbitrary PDF execution endpoint" surface does not exist.

---

## 5. Preview UI

[js/intelligence-console.js](js/intelligence-console.js), inside the
existing review workspace — same navigation, state, typography, responsive
system, focus‑preserving render discipline; the Human Curation workspace is
untouched.

- A **`[Pratinjau PDF]`** ghost button in the "Draf Nota Dinas" section
  (present at every lifecycle stage — it is read‑only).
- **Disabled while `state.draftDirty`** with the hint *"Simpan draf untuk
  pratinjau versi terbaru."* — the preview always renders the **last‑saved**
  version, never a silent mix of saved + unsaved state (§17). An earlier
  preview outcome line is dropped the moment the draft becomes dirty.
- Click → `previewIntelligenceNorDraft(draftId)` → on success,
  `DocumentEngine.generateAndOpen('composer-document', data, {cache:false, viewer})`
  opens the **in‑app PDF viewer** (no automatic download).
- A one‑line **outcome disclosure** under the button (§11, §31):
  - `applied` → *"Tata letak: PBSI Visual Template v<N> — diterapkan."*
  - `fallback` → *"Tata letak: baku (tidak ada templat visual disetujui…)."*
  - `stale` → an amber warning: *"Konteks tata letak draf ini sudah usang …
    buat ulang draf untuk memakai templat terkini."* — rendered **without**
    the template geometry.
  - `invalid` → an amber warning: *"Konteks tata letak draf ini tidak dapat
    diverifikasi …"* — rendered without the template geometry.
- **Errors are explicit** (§18): a failed preview shows the specific server
  error text and opens **no** document — never a silent fallback, never a
  stale PDF, never an infinite retry.

`mountIntelligenceConsole(host, { controller, previewDraft, openDocument })`
gains two injectable seams (defaulted to the wiring's builder + the real
engine) so the offline harness can exercise the button with no pdfmake / no
Firebase.

---

## 6. Visual Template consumption

Strictly along the Phase 6A/6B chain — **no client‑side retrieval, no
client‑created certified context**:

```
server-authoritative retrieval  (Phase 6A intelligenceNorGeneration, at generation time)
        → verification           (generationContextVerifier — at CREATE and again at PREVIEW)
        → generationContext / visualBinding stored server-derived on the draft (Phase 6A)
        → resolveRenderingVisualModel()  (Phase 6B — PURE geometry projection, approved_template only)
        → composer-document.js           (page size / margins / logo position only; Number.isFinite-guarded)
```

The client calls `resolveRenderingVisualModel` **only** when the server's
`op:'preview'` verdict is `applied`. `stale` / `invalid` / `fallback` ⇒ the
resolved model is `null` and the deterministic Composer layout is used
(§11). Geometry is never fabricated: a template that specifies only
unsupported region kinds resolves to `fidelity:'fallback'` and changes
nothing.

---

## 7. Fallback policy

| Situation | Result |
|---|---|
| Draft was generated with no approved Visual Template | `fallback` — deterministic Composer layout, disclosed |
| Approved template still `approved`, unchanged | `applied` — page size / margins / logo from the template, disclosed with its version |
| Approved template **deprecated / superseded / version moved** since generation | `stale` — deterministic layout **+ a visible "usang" warning telling the reviewer to regenerate** (§32) |
| Binding claims an approved template but no context / a forged context | `invalid` — deterministic layout + a "tidak dapat diverifikasi" warning |
| `op:'preview'` unreachable / malformed reply | `previewIntelligenceNorDraft` returns `{ok:false}` → an explicit render error, **no** document opened (§18) |

Never: guessed geometry, an A4 fabricated from corpus evidence, a
conflicting/proposed/deprecated template consumed, or raw corpus / Writing
Memory read at render time.

---

## 8. Lifecycle isolation — proof preview cannot approve / number / register / publish

- **Server** (`intelligence-nor-draft-check.cjs`): the `op:'preview'` branch
  + `assessPreviewVisual` are statically asserted to contain **no**
  `store.create/updateDraft`, no `.set(`, no Registry / numbering / publish
  token; two live `preview` calls leave `/intelligence_nor_drafts`
  byte‑identical and create **no** `intelligence_nor_registry` /
  numbering‑counter node.
- **`numbering.publishedNumber`** on the previewed record is asserted `null`;
  `buildIntelligenceNorViewModel` never emits a `norNumber` section even
  when a stray `suggestedNumber`/`publishedNumber` is present on the record.
- **Client** (`intelligence-console-ui-check.mjs`): clicking `[Pratinjau
  PDF]` triggers **0** `approveNor` / `publishNor` / `updateDraft` calls and
  the status pill stays "Menunggu review".
- `previewIntelligenceNorDraft` calls **only** `callIntelligenceNorDraft({op:'preview'})`
  — never `callIntelligenceNorRegistry`, never `intelligenceNorGeneration`.

---

## 9. Security

| Concern | Handling |
|---|---|
| Authentication | `request.auth.uid` — the only actor source (§20) |
| Authorization | `canUseIntelligence(auth.token)` — the same effective‑admin gate as every Intelligence callable; a non‑admin → `HttpsError('permission-denied')` (§P) |
| Ownership | `draft.ownerId === auth.uid`, server‑side; a cross‑owner preview → `FORBIDDEN` envelope with **`data === null`** — no document bytes, no metadata (§21) |
| Client‑supplied `ownerId` / `actorId` / official number / publication state / certification / template authority | all ignored — the server reads the draft itself and re‑verifies the stored context (§20, §37.1‑6) |
| Stale / forged context | re‑verified at preview time; `stale`/`invalid` never apply template geometry (§32, §37.8‑9) |
| Malicious `structuralRules` / conflicting template / absurd geometry | inherited from Phase 6B's `resolveRenderingVisualModel` (inert data, never executed; bounded; `deterministic_fallback` on anything not `approved_template`) + `composer-document.js`'s `Number.isFinite` guards (§37.10‑14) |
| Arbitrary filesystem path / external URL / HTML‑as‑renderer‑instructions | impossible — the endpoint takes only a `draftId` (server‑validated as an RTDB‑safe key by `norDraftStore.isSafeDraftId`); the render is deterministic pdfmake over a fixed template; the logo is the existing locally‑embedded `PBSI_LOGO_DATA_URI` (§35, §24) |
| Data leakage in errors | preview errors carry only a short message + code — no secret, token, credential, or another user's draft. `logger.info` is metadata‑only (op, actor, draftId, ok, `previewVisual` status) — never the body (§22) |
| OpenAI / external HTTP | 0 — deterministic render, no model call, no fetch (§23, §24) |

---

## 10. Human edit loop (§17 decision, documented)

**Chosen: disable preview until saved.** The console architecture already
cleanly separates staged edits (DOM + controller) from the saved record;
mixing them into one render would be a new, silently drift‑prone path. So:

```
Draft → Edit → [Pratinjau PDF] DISABLED, hint "Simpan draf…" → Simpan Draf → [Pratinjau PDF] ENABLED → render last-saved v_n → …
```

A successful save rebuilds the workspace for the new version and clears any
previous preview outcome line, so a stale PDF is never presented for a newer
draft version (§19). `DocumentEngine.generate` is called with `cache:false`,
so each preview is a fresh render.

---

## 11. Error handling (§18)

`previewIntelligenceNorDraft` maps a callable throw → `{ok:false, error:{code:'PREVIEW_UNAVAILABLE'}}`,
a non‑ok / malformed reply → `{ok:false, error:{code:'PREVIEW_FAILED'}}`.
The console surfaces the **specific** message in the outcome line
(`--error` styling) and opens no document. No silent old‑PDF, no silent
draft fallback, no retry loop.

---

## 12. Preview vs official (§12)

- The rendered PDF opens with a centred **"PRATINJAU — BUKAN DOKUMEN
  RESMI"** line.
- The footer disclaimer is replaced with: *"PRATINJAU internal Sarpras
  Intelligence dari draf NOR yang MASIH DALAM PENINJAUAN — bukan dokumen
  resmi: belum disetujui, belum bernomor, belum diterbitkan, belum
  ditandatangani. …"* The Composer's default "…yang telah disetujui" string
  is **not** rendered.
- `statusLabel` = "Draf — menunggu peninjauan". No official number, no
  publication timestamp, no Registry identity, no signature — none of those
  fields exist on the reviewed draft.
- The in‑app viewer title reads *"Pratinjau NOR — draf <id>"*.

---

## 13. Audit (§30 decision, documented)

No new audit event type or system. A preview is a **read**; it writes
nothing, so it appends nothing to the record's append‑only `auditTrail`.
The existing **metadata‑only** `logger.info('[intelligence/nor-draft]', …)`
line is the preview audit — it records `op:'preview'`, `actor` (auth.uid),
`draftId`, `ok`, and the `previewVisual` status. It never logs the document
body (statically asserted).

---

## 14. Tests

| Check | Scope | Result |
|---|---|---|
| `node scripts/intelligence-nor-preview-view-model-check.mjs` (**new**, pure) | fixtures **A–M** (minimal · complete procurement · proposed recipient · confirmed recipient · empty signature · long body · multi‑paragraph body · saved human edits · approved model carried byte‑identical · deterministic fallback · unsupported fields · malformed/non‑object model · "conflicting" — builder never reads `record.provenance`); never emits a number; never a signer; dateline edge cases; determinism; defensive inputs; static purity scan | **56/56** |
| `node scripts/nor-preview-render-check.mjs` (**new**, Puppeteer + cdnjs pdfmake 0.2.10) | **A** DocumentDefinition text (marker, honest disclaimer, Perihal, recipient + `(diusulkan…)` disclosure, body, dateline; no "telah disetujui", no "Nomor:", no NOR‑number string); **B** real bytes — valid `%PDF-`/`/MediaBox`/page tree; deterministic‑fallback ⇒ real unchanged composer A4 `/MediaBox`; approved‑template ⇒ `/MediaBox` matches the model **exactly** (byte‑verified); malformed model ⇒ still renders at A4 (no hang); a long body ⇒ **multi‑page** PDF (`/Count ≥ 2`) | **26/26** |
| `node scripts/intelligence-nor-draft-check.cjs` (extended) | `op:'preview'`: unauthenticated / non‑admin → `HttpsError`; **cross‑owner (N) → FORBIDDEN, `data === null` (no bytes)**; unknown draft → `NOT_FOUND`; owner + legacy draft → `{draft, previewVisual:'fallback'}`, `publishedNumber` null; owner + unverifiable binding → `'invalid'` (fail closed, **O**); two previews mutate nothing; static: preview path is `getDraft` + `verifyGenerationContext` only, no write | **all green** |
| `node scripts/intelligence-console-ui-check.mjs` (extended) | the `[Pratinjau PDF]` control at 7 viewports, no overflow; enabled clean / **disabled dirty with "Simpan draf…" hint (P17)**; click → 1 server request with the draftId + 1 in‑app viewer open (no download); composer data `isPreview` + no `norNumber`; `applied` discloses "PBSI Visual Template … diterapkan"; **preview does not approve/publish/mutate** (pill stays "Menunggu review"); `stale` → "usang" warning + no template geometry (**O/§32**); render failure → **specific** error, no document opened (§18) | **150/150** |
| Full `scripts/intelligence-*-check.{mjs,cjs}` sweep (42 checks, incl. Phase 5.x / 6 / 6A / 6B) | re‑run | **42/42 green** |
| `nor-signature-pagination-check` (48), `nor-visual-rendering-check` (36), `nor-composition-check` (24), `composer-document-structure-check` (39), `composer-foundation-check` (76), `doc-theme-primitives-check` (26), `document-design-system-check` (45), `document-template-manager-check` (20), `document-layout-binding-check` (15), `official-nor-archive-check` (11), `nor-center-generate-redirect-check` (14), `document-intelligence-check` (21), `pettycash-intelligence-check` (29), `live-document-workspace-check` (45), `request-/problem-/maintenance-/gudang-intelligence-check` | re‑run | **all green** |

Fixtures **N** (cross‑owner) and **O** (stale/invalid context) live in the
CJS callable check; **P** (unauthorized) is covered in both the CJS check
(non‑admin → `HttpsError`) and by the mount‑safety assertions in the console
UI check.

---

## 15. V1 Safety

- **`js/docs/templates/nor.js`** — not touched by this phase. Its 48‑check
  signature‑pagination suite and 36‑check visual‑rendering suite re‑ran
  green, unmodified.
- **`js/docs/templates/composer-document.js`** — the only shared render
  file changed, and only additively: `data.renderingVisualModel` /
  `data.isPreview` / `data.disclaimerOverride` are all default‑absent. Its
  sole prior caller sets none of them; `nor-composition-check` (24) and
  `composer-document-structure-check` (39) re‑ran green. A structural render
  with no `data.renderingVisualModel` produces the exact
  `getDesignSystem('composer')` geometry as before; a real render's
  `/MediaBox` is the unchanged composer A4 `595.28 × 841.89`.
- **No Petty Cash file** was edited. **No NOR Registry / numbering /
  publication file** was edited. `functions/index.js` and
  `database.rules.json` are **untouched**.
- `intelligenceNorDraft` gains one read‑only `op`; `create` / `get` /
  `update` / `list` behaviour is unchanged (their existing CJS check
  assertions all still pass).

---

## 16. Production State

```
Feature flag:         OFF
Phase 6 sub-flag:      OFF
OpenAI:                0
External HTTP:         0
Production mutations:  0
Deployment:            NOT DEPLOYED
functions/index.js:    UNCHANGED  (preview is a new op on an already-wired callable)
database.rules.json:   UNCHANGED
```

## 17. Git

```
NOT COMMITTED
NOT PUSHED
```

New files: `src/intelligence/generation/nor-preview-view-model.js`,
`scripts/intelligence-nor-preview-view-model-check.mjs`,
`scripts/nor-preview-render-check.mjs`, this doc.
Modified (additive): `functions/src/intelligence/intelligenceNorDraft.js`
(a fifth `op`), `js/docs/templates/composer-document.js` (three optional
fields), `js/intelligence-backend-wiring.js` (the preview builder),
`js/intelligence-console.js` (the button + handler), `src/intelligence/index.js`
(one export), `scripts/intelligence-console-harness.html` +
`scripts/intelligence-console-ui-check.mjs` +
`scripts/intelligence-nor-draft-check.cjs` (test coverage).
Removed: `src/intelligence/service/nor-draft-preview-adapter.js` — an
untracked, unwired spike from an earlier attempt that fed the console's
normalized view (not a `NorDraftRecord`, §3) and never threaded the visual
model (§9‑11); fully superseded by `nor-preview-view-model.js`.

---

## 18. Known Limitations

- **Rendered‑byte text is not asserted.** Production uses an
  embedded‑subset Roboto whose content‑stream glyph ids are not
  regex‑recoverable to Unicode without the font cmap, and no PDF
  text/raster library is available in this environment (the same
  constraint `nor-visual-rendering-check.mjs` documents). Text is verified
  at the DocumentDefinition layer; geometry, structure and page count are
  byte‑verified in the real rendered PDF. A visual QA pass (open a
  generated preview, or run on a machine with `pdftoppm`) is recommended
  before this path is exposed to users.
- **Only page size, margins, and logo position** flow from an approved
  Visual Template (inherited from Phase 6B scope). Header/footer/title/
  signature/typography/spacing/structural‑rule regions are recognised and
  disclosed by the resolver but not geometrically applied — a template that
  specifies only those renders as `fallback`, correctly.
- **No live `applied`/`stale` end‑to‑end** through real Style Guide /
  Visual Template RTDB records — those stores are STAGED (Null backend, not
  deployed). The `op:'preview'` verdict logic is proven against the Phase 6A
  verifier with `fallback` and `invalid` (fail‑closed) verdicts in the CJS
  check, and the `applied` / `stale` **UI** behaviour is proven against
  stubs in the console UI check. A full `applied`→render pass will only be
  exercisable once the authority stores are deployed.
- **The `[Pratinjau PDF]` control is shown at `approved` / `published`
  stages too** (it is a pure read). If a future product decision wants
  preview restricted to `in_review`, gate the button on
  `state.norLifecycle` — no server change needed.

---

## 19. Recommended Next Step

Not another phase automatically. The narrow, safe options, in order:

1. **Deploy nothing yet.** This rides on the still‑undeployed Phase 5.x /
   6 / 6A / 6B stack; it should ship in that same reviewed batch, behind the
   OFF flag, not on its own.
2. When the authority stores are deployed: run one real `applied` and one
   real `stale` preview against live records and capture the rendered PDF
   for visual QA (the one gap in §18).
3. Optionally extend `composer-document.js`'s visual‑template consumption to
   `HEADER` / `FOOTER` regions (the next‑safest kinds — the Composer already
   has dedicated header/footer slots), with the same
   fixture‑and‑real‑render discipline.
