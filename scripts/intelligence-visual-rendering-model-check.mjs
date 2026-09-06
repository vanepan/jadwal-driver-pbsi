/* ============================================================
   intelligence-visual-rendering-model-check.mjs — Deterministic Renderer
   Consumption (V2, Phase 6B)

   PURE node test — no browser, no pdfmake, no Firebase, no model.
   Exercises src/intelligence/generation/visual-rendering-model.js in
   isolation: the projection from a Phase 6 VisualBinding into a small,
   renderer-ready NorVisualRenderingModel.

   Fixtures (Phase 6B §41 — the ones meaningful for a PURE projection;
   pagination / multi-page / Intelligence-OFF fixtures belong to the
   renderer-level check, scripts/nor-visual-rendering-check.mjs):
     A  deterministic_fallback source                → fallback model
     B  approved template, standard pdf_points page   → page applied
     C  approved template, normalized region coords   → converted to points
     D  approved template, pdf_points region coords   → Y-flip applied
     E  missing optional typography/spacing            → disclosed, not applied
     F  missing page geometry                          → page unsupported, margin/logo unsupported too
     G  unknown coordinate space                       → unsupported
     H  unsupported region kind (e.g. signature)       → disclosed, not applied
     I  malformed numeric geometry (NaN/Infinity/neg)  → rejected
     J  pixels coordinate space (no declared DPI)       → never converted

   Plus adversarial (§43, the subset relevant to a pure projection):
     forged/garbage `source` (incl. a hypothetical future "conflict")
     executable structuralRules payload (never interpreted — data only)
     absurd/huge dimensions (capped, rejected)
     prototype-pollution-shaped input (`__proto__` keys ignored)

   Run:  node scripts/intelligence-visual-rendering-model-check.mjs
   (exit 0 = pass)
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  RENDERING_MODEL_SCHEMA, RENDER_FIDELITY, resolveRenderingVisualModel,
} from '../src/intelligence/generation/visual-rendering-model.js';
import { VISUAL_BINDING_SOURCE } from '../src/intelligence/generation/contracts/generation-context-contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail += 1; };
const section = (t) => console.log(`\n── ${t} ──`);

const A4_PT = { width: 595.28, height: 841.89, coordinateSpace: 'pdf_points' };

/* ════════════════════════════════════════════════════════════════════ */

section('A — deterministic_fallback source → fallback model, nothing applied');
{
  const m = resolveRenderingVisualModel({ source: 'deterministic_fallback' });
  check(m.schema === RENDERING_MODEL_SCHEMA && Object.isFrozen(m), 'a frozen nor-visual-rendering-model@1');
  check(m.source === VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK && m.fidelity === RENDER_FIDELITY.FALLBACK, 'source/fidelity both fallback');
  check(m.page === null && m.margins === null && m.logo === null, 'nothing is applied');
}
section('A2 — null / malformed input → fallback (never throws)');
{
  check(resolveRenderingVisualModel(null).fidelity === RENDER_FIDELITY.FALLBACK, 'null → fallback');
  check(resolveRenderingVisualModel(undefined).fidelity === RENDER_FIDELITY.FALLBACK, 'undefined → fallback');
  check(resolveRenderingVisualModel('not an object').fidelity === RENDER_FIDELITY.FALLBACK, 'a string → fallback, no throw');
  check(resolveRenderingVisualModel(42).fidelity === RENDER_FIDELITY.FALLBACK, 'a number → fallback, no throw');
  check(resolveRenderingVisualModel([]).fidelity === RENDER_FIDELITY.FALLBACK, 'an array → fallback, no throw');
}

section('B — approved template, standard pdf_points page → page applied, fidelity full');
{
  const m = resolveRenderingVisualModel({ source: 'approved_template', templateId: 'vtpl_1', templateVersion: 3, pageModel: A4_PT, regions: [] });
  check(m.source === VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE, 'source is approved_template');
  check(m.page && m.page.width === 595.28 && m.page.height === 841.89, 'page geometry applied verbatim (already in points)');
  check(m.templateId === 'vtpl_1' && m.templateVersion === 3, 'template id/version carried through');
  check(m.fidelity === RENDER_FIDELITY.FULL, 'no unsupported regions/fields ⇒ full fidelity');
}

section('C — normalized region coordinates → converted to points (top-left, y-down — documented decision)');
{
  const m = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    regions: [{ kind: 'logo', geometry: { x: 0.1, y: 0.05, width: 0.2, height: 0.08, coordinateSpace: 'normalized' } }],
  });
  check(m.logo != null, 'the normalized logo region converts successfully');
  check(Math.abs(m.logo.x - 0.1 * 595.28) < 0.01, `logo.x = x*pageWidth (${m.logo.x})`);
  check(Math.abs(m.logo.y - 0.05 * 841.89) < 0.01, `logo.y = y*pageHeight (${m.logo.y})`);
  check(Math.abs(m.logo.width - 0.2 * 595.28) < 0.01, `logo.width = width*pageWidth (${m.logo.width})`);
}

section('D — pdf_points region coordinates → the documented bottom-left→top-left Y-flip is applied');
{
  // a MARGIN region occupying the exact content area of NOR v1's own
  // [56,40,56,40] margins, expressed in BOTTOM-LEFT pdf_points terms.
  const m = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    regions: [{ kind: 'margin', geometry: { x: 56, y: 40, width: 595.28 - 56 - 56, height: 841.89 - 40 - 40, coordinateSpace: 'pdf_points' } }],
  });
  check(m.margins != null, 'the margin region converts successfully');
  check(m.margins.every((v, i) => Math.abs(v - [56, 40, 56, 40][i]) < 0.01), `margins = [left,top,right,bottom] = [56,40,56,40] (got ${JSON.stringify(m.margins)})`);
}

section('E — missing optional typography/spacing/structuralRules → disclosed, never applied, never interpreted');
{
  const m = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    typography: { fontFamily: 'Times New Roman' },
    spacing: { paragraphSpacing: 12 },
    structuralRules: { multiPage: true },
  });
  const fields = m.unsupportedFields.map((f) => f.field);
  check(fields.includes('typography') && fields.includes('spacing') && fields.includes('structuralRules'), 'all three are disclosed as unsupportedFields (not silently dropped)');
  check(!('typography' in m) && !('spacing' in m) && !('structuralRules' in m), 'none of the three appear as APPLIED top-level fields on the model');
}

section('F — missing page geometry → page unsupported; margin/logo regions also unsupported (no reference frame)');
{
  const m = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: null,
    regions: [{ kind: 'margin', geometry: { x: 10, y: 10, width: 100, height: 100, coordinateSpace: 'pdf_points' } }],
  });
  check(m.page === null, 'no page geometry applied');
  check(m.margins === null, 'no margins applied (nothing to scale/flip against)');
  check(m.unsupportedFields.some((f) => f.field === 'page'), 'page is disclosed as unsupported');
  check(m.unsupportedRegions.some((r) => r.kind === 'margin'), 'the margin region is disclosed as unsupported too');
  check(m.fidelity === RENDER_FIDELITY.FALLBACK, 'nothing applied ⇒ fallback fidelity');
}

section('G — unknown coordinate space → unsupported, never guessed');
{
  const m = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    regions: [{ kind: 'logo', geometry: { x: 1, y: 1, width: 1, height: 1, coordinateSpace: 'unknown' } }],
  });
  check(m.logo === null, 'an unknown-space logo region is never converted');
  check(m.unsupportedRegions.some((r) => r.kind === 'logo'), 'disclosed as unsupported');
}

section('H — unsupported region kind (signature/header/etc.) → disclosed, never repositioned');
{
  const m = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    regions: [
      { kind: 'signature', geometry: { x: 0.1, y: 0.1, width: 0.3, height: 0.1, coordinateSpace: 'normalized' } },
      { kind: 'header', geometry: { x: 0, y: 0.9, width: 1, height: 0.1, coordinateSpace: 'normalized' } },
    ],
  });
  const kinds = m.unsupportedRegions.map((r) => r.kind).sort();
  check(JSON.stringify(kinds) === JSON.stringify(['header', 'signature']), `both unsupported kinds disclosed (got ${JSON.stringify(kinds)})`);
  check(m.fidelity === RENDER_FIDELITY.PARTIAL, 'page applied but 2 unsupported regions ⇒ partial fidelity');
}

section('I — malformed numeric geometry (NaN / Infinity / negative / absurd) → rejected, never fabricated');
{
  const bad = [
    { width: NaN, height: 841.89 }, { width: 595.28, height: Infinity }, { width: -595.28, height: 841.89 },
    { width: 0, height: 841.89 }, { width: 999999999, height: 841.89 },
  ];
  for (const b of bad) {
    const m = resolveRenderingVisualModel({ source: 'approved_template', pageModel: { ...b, coordinateSpace: 'pdf_points' } });
    check(m.page === null, `page geometry ${JSON.stringify(b)} → rejected (page:null)`);
  }
  // a region with a NaN coordinate
  const m2 = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    regions: [{ kind: 'logo', geometry: { x: NaN, y: 0, width: 0.1, height: 0.1, coordinateSpace: 'normalized' } }],
  });
  check(m2.logo === null && m2.unsupportedRegions.some((r) => r.kind === 'logo'), 'a NaN region coordinate is rejected, not silently zeroed');
}

section('J — pixels coordinate space (no declared DPI anywhere in the contract) → never converted');
{
  const m = resolveRenderingVisualModel({ source: 'approved_template', pageModel: { width: 800, height: 1200, coordinateSpace: 'pixels' } });
  check(m.page === null, 'a pixels-space page is never treated as usable points (no DPI to convert with)');
  const m2 = resolveRenderingVisualModel({
    source: 'approved_template', pageModel: A4_PT,
    regions: [{ kind: 'logo', geometry: { x: 40, y: 40, width: 80, height: 40, coordinateSpace: 'pixels' } }],
  });
  check(m2.logo === null, 'a pixels-space region is never converted');
}

section('adversarial (§43) — forged/garbage source, incl. a hypothetical future "conflict"');
{
  for (const source of ['conflict', 'CERTIFIED', 'proposed', '', null, undefined, 123, {}]) {
    const m = resolveRenderingVisualModel({ source, pageModel: A4_PT, regions: [{ kind: 'page', geometry: { x: 0, y: 0, width: 1, height: 1, coordinateSpace: 'normalized' } }] });
    check(m.source === VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK && m.fidelity === RENDER_FIDELITY.FALLBACK, `source=${JSON.stringify(source)} → safe fallback, nothing applied`);
  }
}
section('adversarial — structuralRules is NEVER interpreted or executed');
{
  const hostile = { structuralRules: { multiPage: 'true; require("child_process").execSync("echo pwned")', toString() { throw new Error('should never be called'); } } };
  const m = resolveRenderingVisualModel({ source: 'approved_template', pageModel: A4_PT, ...hostile });
  check(m.unsupportedFields.some((f) => f.field === 'structuralRules'), 'structuralRules is disclosed as unsupported (data only)');
  check(!JSON.stringify(m).includes('execSync') && !JSON.stringify(m).includes('pwned'), 'the hostile payload text never leaks into the resolved model');
}
section('adversarial — prototype-pollution-shaped input has no effect');
{
  const hostile = JSON.parse('{"source":"approved_template","pageModel":{"width":595.28,"height":841.89,"coordinateSpace":"pdf_points"},"__proto__":{"polluted":true},"regions":[{"kind":"logo","geometry":{"x":0.1,"y":0.1,"width":0.1,"height":0.1,"coordinateSpace":"normalized"},"__proto__":{"polluted":true}}]}');
  const m = resolveRenderingVisualModel(hostile);
  check(({}).polluted === undefined, 'Object.prototype was not polluted by resolving a hostile payload');
  check(m.page != null && m.logo != null, 'the legitimate fields still resolve normally alongside the (inert) __proto__ key');
}
section('adversarial — absurd dimensions are capped/rejected, not silently rendered');
{
  const m = resolveRenderingVisualModel({ source: 'approved_template', pageModel: { width: 1e9, height: 1e9, coordinateSpace: 'pdf_points' } });
  check(m.page === null, 'a page far beyond any real paper size is rejected, not applied');
}

section('determinism (§37) — same input twice ⇒ byte-identical, no Date.now()/Math.random() in the module');
{
  const input = { source: 'approved_template', templateId: 't1', templateVersion: 1, pageModel: A4_PT, regions: [{ kind: 'logo', geometry: { x: 0.1, y: 0.1, width: 0.1, height: 0.05, coordinateSpace: 'normalized' } }] };
  const m1 = resolveRenderingVisualModel(input);
  const m2 = resolveRenderingVisualModel(JSON.parse(JSON.stringify(input)));
  check(JSON.stringify(m1) === JSON.stringify(m2), 'running twice on equivalent input is byte-identical');
  const stripped = readFileSync(join(HERE, '..', 'src/intelligence/generation/visual-rendering-model.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check(!/Date\.now\(\)|Math\.random\(\)/.test(stripped), 'the module contains no Date.now() / Math.random() in CODE');
}

section('static — no eval / dynamic Function / network / DOM / pdfmake import (pure projection only)');
{
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = stripComments(readFileSync(join(HERE, '..', 'src/intelligence/generation/visual-rendering-model.js'), 'utf8'));
  check(!/\beval\s*\(/.test(src), 'no eval(');
  check(!/new\s+Function\s*\(/.test(src), 'no dynamic Function(');
  check(!/fetch\s*\(|XMLHttpRequest|require\s*\(\s*['"]https?/.test(src), 'no network call');
  check(!/document\.|window\.|pdfmake|pdfMake/.test(src), 'no DOM / pdfmake reference — a PURE projection, not a renderer');
  check(!/Object\.assign\s*\(|\.\.\.\s*visualBinding\b/.test(src), 'never generically spreads/assigns the untrusted input — every field is read explicitly');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
