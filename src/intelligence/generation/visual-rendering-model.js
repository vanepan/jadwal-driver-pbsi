/* ============================================================
   VISUAL-RENDERING-MODEL.JS — Deterministic Renderer Consumption
   (V2, Phase 6B)

   PURPOSE: the ONE pure projection from a Phase 6 `VisualBinding` (which
   itself came from an APPROVED Visual Template, verified server-side —
   Phase 6A) into a small, renderer-ready `NorVisualRenderingModel` —
   POINTS, TOP-LEFT origin, y-down: the ONE coordinate convention
   `js/docs/*` (pdfmake) uses throughout this codebase.

     generationContext.visual (VisualBinding)
              │
              ▼
     resolveRenderingVisualModel()      ← THIS module
              │  nor-visual-rendering-model@1
              ▼
     js/docs/templates/nor.js (a FUTURE renderer call site consumes it —
              this module does not itself call pdfmake or import js/)

   HARD RULES (Phase 6B §0, §3-9, §35-37):
     • Consumes ONLY `source === 'approved_template'`. `deterministic_fallback`,
       an unrecognised value (defence in depth against a hypothetical future
       `conflict` literal — §6), or a missing/malformed binding ALL resolve
       to the safe FALLBACK model — the renderer's existing deterministic
       defaults apply, unchanged.
     • NEVER fabricates geometry. A page/region whose coordinates cannot be
       DETERMINISTICALLY converted to points is marked unsupported, never
       guessed at (§7, §18, §19).
     • NEVER executes template data. `structuralRules`/`typography`/
       `spacing` are treated as inert DATA the renderer does not yet
       interpret (§17) — no eval, no dynamic Function, no interpreter.
     • Validates every number: finite, positive where required, and capped
       at a documented sane bound — NaN / Infinity / negative / absurd
       dimensions are rejected, never propagated (§36).
     • Reads ONLY known, explicit fields off `visualBinding` (never a
       generic spread/Object.assign of untrusted data — no prototype-
       pollution surface).
     • Deterministic: same VisualBinding ⇒ byte-identical rendering model
       (§37). No Date.now(), no Math.random(), no network, no model call.

   COORDINATE CONVERSION (Phase 6B §9, §10 — derived, not assumed):
     `pdf_points`  — per contracts/corpus-provenance-contract.js's own
                     documented convention, origin BOTTOM-LEFT (PDF native).
                     pdfmake's JS API (pageSize / pageMargins /
                     absolutePosition — what js/docs/* actually calls) is
                     TOP-LEFT, y-down. The one explicit transform:
                         topY = pageHeightPt - y - height
                     (verified against pdfmake's documented
                     absolutePosition semantics, not assumed).
     `pixels`      — a raster unit with NO declared DPI anywhere in the
                     Phase 5.x.6 contract. Per §9 of the brief ("require a
                     deterministic DPI conversion IF the contract provides
                     one" — it does not), pixels are NEVER converted; a
                     pixel-space region is always `unsupported`.
     `normalized`  — the contract does not pin an origin for this space.
                     This module DEFINES it, explicitly, as TOP-LEFT/y-down
                     (matching `pixels`) — the natural "already-scaled
                     pixels-or-points, divided by page size" reading. It
                     needs the PAGE's own width/height already resolved in
                     POINTS to scale into; without one it is `unsupported`.
     `unknown`     — never rendered.

   RESPONSIBILITY: RENDERING_MODEL_SCHEMA, RENDER_FIDELITY,
   resolveRenderingVisualModel(visualBinding).

   DEPENDENCIES: ./contracts/generation-context-contract.js
   (VISUAL_BINDING_SOURCE), ../corpus/visual-template/contracts/
   visual-template-contract.js (VISUAL_REGION_KIND — reused, not
   redefined), ../corpus/contracts/corpus-provenance-contract.js
   (COORDINATE_SPACE — reused). PURE — no I/O, no DOM, no pdfmake, no
   Firebase, no model.
   ============================================================ */

'use strict';

import { VISUAL_BINDING_SOURCE } from './contracts/generation-context-contract.js';
import { VISUAL_REGION_KIND } from '../corpus/visual-template/contracts/visual-template-contract.js';
import { COORDINATE_SPACE } from '../corpus/contracts/corpus-provenance-contract.js';

export const RENDERING_MODEL_SCHEMA = 'nor-visual-rendering-model@1';

export const RENDER_FIDELITY = Object.freeze({
  FULL: 'full',       // every region/field the template specified was applied
  PARTIAL: 'partial', // some regions/fields applied; others unsupported (disclosed)
  FALLBACK: 'fallback', // nothing from the template could be applied — existing renderer defaults
});

/* ── numeric safety (§36) — reused by every geometry check below ────── */
const MAX_PAGE_PT = 20000;   // ~7m — generously beyond any real paper size
const MAX_REGION_PT = 5000;  // generously beyond any real page dimension

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function positiveWithin(v, max) { return isFiniteNum(v) && v > 0 && v <= max; }
function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Convert one region's already-approved geometry into renderer-ready
 * POINTS, top-left origin. Returns `null` when it cannot be deterministically
 * converted — NEVER a guess (§7, §9, §36).
 * @param {{x:number|null,y:number|null,width:number|null,height:number|null,coordinateSpace:string}|null} geometry
 * @param {number|null} pageWidthPt   already-resolved page width, in points
 * @param {number|null} pageHeightPt  already-resolved page height, in points
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
function convertRegionToPoints(geometry, pageWidthPt, pageHeightPt) {
  if (!geometry || typeof geometry !== 'object') return null;
  const { x, y, width, height, coordinateSpace } = geometry;
  if (!isFiniteNum(x) || !isFiniteNum(y)) return null;
  if (!positiveWithin(width, MAX_REGION_PT) || !positiveWithin(height, MAX_REGION_PT)) return null;

  if (coordinateSpace === COORDINATE_SPACE.PDF_POINTS) {
    if (!positiveWithin(pageHeightPt, MAX_PAGE_PT)) return null; // the flip needs a real page height
    if (Math.abs(x) > MAX_PAGE_PT || Math.abs(y) > MAX_PAGE_PT) return null;
    const topY = pageHeightPt - y - height;
    if (!isFiniteNum(topY)) return null;
    return { x, y: topY, width, height };
  }
  if (coordinateSpace === COORDINATE_SPACE.NORMALIZED) {
    if (!positiveWithin(pageWidthPt, MAX_PAGE_PT) || !positiveWithin(pageHeightPt, MAX_PAGE_PT)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1 || width <= 0 || width > 1 || height <= 0 || height > 1) return null;
    return { x: x * pageWidthPt, y: y * pageHeightPt, width: width * pageWidthPt, height: height * pageHeightPt };
  }
  // 'pixels' (no declared DPI anywhere in the contract — §9) and 'unknown'
  // are never converted.
  return null;
}

/** Resolve the page's own width/height into points. Only `pdf_points` is
 *  directly usable as pdfmake's `pageSize` (§8, §18) — `pixels` has no
 *  declared DPI, `normalized` is meaningless at the whole-page level. */
function resolvePagePoints(pageModel) {
  if (!pageModel || typeof pageModel !== 'object') return null;
  if (pageModel.coordinateSpace !== COORDINATE_SPACE.PDF_POINTS) return null;
  const { width, height } = pageModel;
  if (!positiveWithin(width, MAX_PAGE_PT) || !positiveWithin(height, MAX_PAGE_PT)) return null;
  return { width, height };
}

function findRegion(regions, kind) {
  return (Array.isArray(regions) ? regions : []).find((r) => r && r.kind === kind) || null;
}

/** MARGIN region → pdfmake `pageMargins: [left, top, right, bottom]`. */
function resolveMargins(regions, pageWidthPt, pageHeightPt) {
  const region = findRegion(regions, VISUAL_REGION_KIND.MARGIN);
  if (!region) return { margins: null, unsupported: null };
  const rect = convertRegionToPoints(region.geometry, pageWidthPt, pageHeightPt);
  if (!rect) return { margins: null, unsupported: { kind: 'margin', reason: 'geometry unavailable or an unsupported coordinate space' } };
  const left = rect.x;
  const top = rect.y;
  const right = pageWidthPt - (rect.x + rect.width);
  const bottom = pageHeightPt - (rect.y + rect.height);
  if (![left, top, right, bottom].every((v) => isFiniteNum(v) && v >= 0)) {
    return { margins: null, unsupported: { kind: 'margin', reason: 'the derived margins are invalid (negative or non-finite)' } };
  }
  return { margins: [round2(left), round2(top), round2(right), round2(bottom)], unsupported: null };
}

/** LOGO region → an absolute position + width for the EXISTING trusted
 *  logo asset (js/docs/doc-theme.js#orgLogo). NEVER a new/external image
 *  (§20). */
function resolveLogo(regions, pageWidthPt, pageHeightPt) {
  const region = findRegion(regions, VISUAL_REGION_KIND.LOGO);
  if (!region) return { logo: null, unsupported: null };
  const rect = convertRegionToPoints(region.geometry, pageWidthPt, pageHeightPt);
  if (!rect) return { logo: null, unsupported: { kind: 'logo', reason: 'geometry unavailable or an unsupported coordinate space' } };
  return { logo: { x: round2(rect.x), y: round2(rect.y), width: round2(rect.width) }, unsupported: null };
}

/** The kinds this phase's renderer adapter actually applies (§0, §12).
 *  Everything else is reported `unsupported`, never silently reinterpreted —
 *  header/footer/title/metadata/recipient/subject/date/body/signature/
 *  attachment/pageNumber/divider/other are explicit, documented non-goals
 *  for Phase 6B (see docs/V2_SARPRAS_INTELLIGENCE_PHASE_6B_VISUAL_RENDERER.md). */
const SUPPORTED_REGION_KINDS = Object.freeze(new Set([
  VISUAL_REGION_KIND.PAGE, VISUAL_REGION_KIND.MARGIN, VISUAL_REGION_KIND.LOGO,
]));

function fallbackModel(warning) {
  return Object.freeze({
    schema: RENDERING_MODEL_SCHEMA,
    source: VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK,
    fidelity: RENDER_FIDELITY.FALLBACK,
    templateId: null,
    templateVersion: null,
    page: null,
    margins: null,
    logo: null,
    unsupportedRegions: Object.freeze([]),
    unsupportedFields: Object.freeze([]),
    warnings: Object.freeze(warning ? [warning] : []),
  });
}

/**
 * @param {object|null} visualBinding  the Phase 6 VisualBinding
 *   (generationContext.visual / draft.provenance.visualBinding) — MUST
 *   already be server-verified (Phase 6A); this module does not re-verify
 *   authority, it only projects geometry.
 * @returns {{
 *   schema: string, source: string, fidelity: string,
 *   templateId: string|null, templateVersion: number|null,
 *   page: {width:number,height:number}|null,
 *   margins: number[]|null,
 *   logo: {x:number,y:number,width:number}|null,
 *   unsupportedRegions: Array<{kind:string,reason:string}>,
 *   unsupportedFields: Array<{field:string,reason:string}>,
 *   warnings: string[]
 * }} a frozen `nor-visual-rendering-model@1`
 */
export function resolveRenderingVisualModel(visualBinding) {
  if (!visualBinding || typeof visualBinding !== 'object') {
    return fallbackModel('No visual binding supplied.');
  }
  // §6, §3 — ONLY an APPROVED template's binding is ever consumed. Anything
  // else (deterministic_fallback, or an unrecognised value — defence in
  // depth against a hypothetical future 'conflict' literal) is the same
  // safe fallback, never a guess, never a partial trust.
  if (visualBinding.source !== VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE) {
    return fallbackModel(null);
  }

  const unsupportedRegions = [];
  const unsupportedFields = [];

  const pagePts = resolvePagePoints(visualBinding.pageModel);
  if (!pagePts) unsupportedFields.push({ field: 'page', reason: 'page geometry unavailable or not expressed in pdf_points' });

  const regions = Array.isArray(visualBinding.regions) ? visualBinding.regions : [];
  for (const r of regions) {
    const kind = r && typeof r.kind === 'string' ? r.kind : null;
    if (!kind || !SUPPORTED_REGION_KINDS.has(kind)) {
      unsupportedRegions.push({ kind: kind || 'unknown', reason: 'this region kind is not yet applied by the renderer (Phase 6B scope)' });
    }
  }

  let margins = null;
  let logo = null;
  if (pagePts) {
    const m = resolveMargins(regions, pagePts.width, pagePts.height);
    margins = m.margins;
    if (m.unsupported) unsupportedRegions.push(m.unsupported);
    const l = resolveLogo(regions, pagePts.width, pagePts.height);
    logo = l.logo;
    if (l.unsupported) unsupportedRegions.push(l.unsupported);
  } else {
    if (findRegion(regions, VISUAL_REGION_KIND.MARGIN)) unsupportedRegions.push({ kind: 'margin', reason: 'no usable page geometry to derive margins against' });
    if (findRegion(regions, VISUAL_REGION_KIND.LOGO)) unsupportedRegions.push({ kind: 'logo', reason: 'no usable page geometry to position the logo against' });
  }

  // §15-17 — typography / spacing / structuralRules are retained as DATA
  // (disclosed as unsupported, never interpreted, never executed).
  if (visualBinding.typography && typeof visualBinding.typography === 'object') {
    unsupportedFields.push({ field: 'typography', reason: "a template-level typography override is not yet applied — it would risk the document's existing type hierarchy without visual verification" });
  }
  if (visualBinding.spacing && typeof visualBinding.spacing === 'object') {
    unsupportedFields.push({ field: 'spacing', reason: 'template-level spacing is not yet applied by the renderer' });
  }
  if (visualBinding.structuralRules && typeof visualBinding.structuralRules === 'object') {
    unsupportedFields.push({ field: 'structuralRules', reason: 'structural rules are retained as data only — never interpreted or executed' });
  }

  const appliedSomething = !!pagePts || !!margins || !!logo;
  const fidelity = !appliedSomething
    ? RENDER_FIDELITY.FALLBACK
    : (unsupportedRegions.length === 0 && unsupportedFields.length === 0 ? RENDER_FIDELITY.FULL : RENDER_FIDELITY.PARTIAL);

  return Object.freeze({
    schema: RENDERING_MODEL_SCHEMA,
    source: VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE,
    fidelity,
    templateId: typeof visualBinding.templateId === 'string' ? visualBinding.templateId : null,
    templateVersion: Number.isInteger(visualBinding.templateVersion) ? visualBinding.templateVersion : null,
    page: pagePts ? Object.freeze({ width: pagePts.width, height: pagePts.height }) : null,
    margins: margins ? Object.freeze([...margins]) : null,
    logo: logo ? Object.freeze({ ...logo }) : null,
    unsupportedRegions: Object.freeze(unsupportedRegions.map((x) => Object.freeze({ ...x }))),
    unsupportedFields: Object.freeze(unsupportedFields.map((x) => Object.freeze({ ...x }))),
    warnings: Object.freeze([]),
  });
}
