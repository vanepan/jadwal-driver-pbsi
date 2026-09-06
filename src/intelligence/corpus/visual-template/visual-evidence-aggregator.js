/* ============================================================
   VISUAL-EVIDENCE-AGGREGATOR.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: the ONE deterministic transformation

     CorpusObservation[] (category 'layout', modality 'visual')
        +  CorpusDocument[]  +  config
        ──▶  VisualEvidenceReport { patterns[], patternConflicts[] }

   It identifies REPEATED visual structures across documents — same page
   size, same margins, same logo placement, same region positions — and
   produces VISUAL PATTERNS. A pattern is an OBSERVED STRUCTURE, NOT an
   official template (§13). Human review creates authority.

   HARD BOUNDARIES:
     • geometry is NEVER fabricated — a document with no page size / no
       positioned regions contributes what it has and no more; a pattern
       with no geometry is `geometryKnown: false` and its pageModel is all
       null / `unknown` (§5, §6, §17)
     • coordinate spaces are NEVER silently converted — a region whose
       space differs from its page's space is not normalised; it is kept
       verbatim and excluded from the fingerprint (§3, §5)
     • frequency alone never makes a pattern a template — the aggregator
       stops at "observed pattern" (§13)
     • pure, deterministic, input-order independent: same observations +
       same config ⇒ byte-identical report

   RESPONSIBILITY: aggregateVisualEvidence({ observations, documents },
   config, { at }).

   DEPENDENCIES: ./contracts/visual-template-contract.js, ./visual-observation.js,
   ./visual-template-config.js, ../temporal/temporal-windows.js
   (resolveTemporalWindows + bucketSourceDate — the Phase 5.x.3 primitives,
   reused). PURE.
   ============================================================ */

'use strict';

import { DEFAULT_VISUAL_TEMPLATE_CONFIG } from './visual-template-config.js';
import { resolveTemporalWindows, bucketSourceDate } from '../temporal/temporal-windows.js';
import { TEMPORAL_CLASSIFICATION, CONVENTION_STATUS } from '../temporal/contracts/temporal-contract.js';
import {
  VISUAL_TEMPLATE_SCOPE, VISUAL_TEMPLATE_DOCUMENT_TYPE, VISUAL_REGION_KIND, VISUAL_PAGE_RECURRENCE,
  COORDINATE_SPACE, makeTemplatePageModel, makeTemplateRegion, makeTemplateTypography,
  makeTemplateSpacing, makeTemplateStructuralRules, __visual_template_internals,
} from './contracts/visual-template-contract.js';
import {
  isVisualLayoutObservation, visualObservationRegionKind, pageGeometryOf, regionOf,
} from './visual-observation.js';

const { fnv1a, slug, strList } = __visual_template_internals;

export const VISUAL_EVIDENCE_REPORT_SCHEMA = 'visual-evidence-report@1';

const REAL_TYPES = Object.freeze([
  VISUAL_TEMPLATE_DOCUMENT_TYPE.NOR, VISUAL_TEMPLATE_DOCUMENT_TYPE.NOTA_ORGANISASI,
  VISUAL_TEMPLATE_DOCUMENT_TYPE.MEMORANDUM, VISUAL_TEMPLATE_DOCUMENT_TYPE.LEGACY,
  VISUAL_TEMPLATE_DOCUMENT_TYPE.UNKNOWN,
]);

function round(v, decimals) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
function mean(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}
function bucketPt(v, tol) {
  return tol > 0 ? Math.round(v / tol) * tol : Math.round(v);
}

/**
 * @param {{ observations?: object[], documents?: object[] }} input
 * @param {object} [config]  a visual-template-config shape
 * @param {{ at?: string }} [opts]
 * @returns {{ schema, generatedAt, temporalConfigured, patterns: object[], patternConflicts: object[], summary: object }}
 */
export function aggregateVisualEvidence(input = {}, config, opts = {}) {
  const cfg = {
    ...DEFAULT_VISUAL_TEMPLATE_CONFIG,
    ...(config || {}),
    geometryTolerance: { ...DEFAULT_VISUAL_TEMPLATE_CONFIG.geometryTolerance, ...((config && config.geometryTolerance) || {}) },
    temporal: { ...DEFAULT_VISUAL_TEMPLATE_CONFIG.temporal, ...((config && config.temporal) || {}) },
  };
  const at = opts.at || new Date().toISOString();
  const tol = cfg.geometryTolerance;
  const decimals = Number.isInteger(tol.pageRelativeDecimals) ? tol.pageRelativeDecimals : 2;
  const ptTol = Number.isFinite(tol.pageSizeTolerancePt) ? tol.pageSizeTolerancePt : 6;
  const minDocs = Number.isInteger(tol.minDocumentsForPattern) && tol.minDocumentsForPattern >= 1 ? tol.minDocumentsForPattern : 2;
  const minRecur = Number.isInteger(tol.minDocumentsForRecurrence) && tol.minDocumentsForRecurrence >= 1 ? tol.minDocumentsForRecurrence : 2;
  const windows = resolveTemporalWindows(cfg);

  /* ── index documents ── */
  const documents = (Array.isArray(input.documents) ? input.documents : []).filter((d) => d && d.documentId);
  const docById = new Map(documents.map((d) => [String(d.documentId), d]));
  const typeOf = (docId) => {
    const d = docById.get(String(docId));
    const t = d && d.documentType;
    return REAL_TYPES.includes(t) ? t : VISUAL_TEMPLATE_DOCUMENT_TYPE.UNKNOWN;
  };
  const dateOf = (docId) => {
    const d = docById.get(String(docId));
    return d && typeof d.sourceDate === 'string' ? d.sourceDate : null;
  };

  /* ── pass 1: per-document layout profile ── */
  const visualObs = (Array.isArray(input.observations) ? input.observations : [])
    .filter((o) => isVisualLayoutObservation(o) && (o.lifecycleState === 'observed' || o.lifecycleState === 'candidate' || o.lifecycleState == null)
      && docById.has(String(o.documentId)));

  /** documentId -> { pages: Map<pageNumber, {w,h,space}>, maxPage, regions: Map<kind, [{nx,ny,nw,nh,space,page}]>, obsIds:Set, rawSpaces:Set } */
  const profiles = new Map();
  const ensure = (docId) => {
    if (!profiles.has(docId)) profiles.set(docId, { pages: new Map(), maxPage: 0, regions: new Map(), obsIds: new Set(), rawSpaces: new Set(), confidence: 0 });
    return profiles.get(docId);
  };

  // 1a — page geometry first (needed to normalise regions)
  for (const o of visualObs) {
    const pg = pageGeometryOf(o);
    if (!pg) continue;
    const p = ensure(String(o.documentId));
    const pageNo = pg.pageNumber || 1;
    p.pages.set(pageNo, { w: pg.width, h: pg.height, space: pg.coordinateSpace });
    p.maxPage = Math.max(p.maxPage, pageNo);
    p.obsIds.add(String(o.observationId || `${o.documentId}:${o.key}:${pageNo}`));
    p.rawSpaces.add(pg.coordinateSpace);
    p.confidence = Math.max(p.confidence, Number.isFinite(o.confidence) ? o.confidence : 0);
  }
  // 1b — regions, normalised against the page they sit on
  for (const o of visualObs) {
    const kind = visualObservationRegionKind(o);
    if (kind === VISUAL_REGION_KIND.PAGE) continue; // page geometry handled above
    const anchored = regionOf(o);
    const p = ensure(String(o.documentId));
    p.obsIds.add(String(o.observationId || `${o.documentId}:${o.key}`));
    p.confidence = Math.max(p.confidence, Number.isFinite(o.confidence) ? o.confidence : 0);
    if (!p.regions.has(kind)) p.regions.set(kind, []);
    if (!anchored) { p.regions.get(kind).push({ nx: null, ny: null, nw: null, nh: null, space: COORDINATE_SPACE.UNKNOWN, page: null }); continue; }
    const g = anchored.region;
    p.rawSpaces.add(g.coordinateSpace);
    const pageNo = anchored.pageNumber || 1;
    const page = p.pages.get(pageNo) || p.pages.get(1) || null;
    // §3 — never normalise across coordinate spaces
    if (!page || !(page.w > 0) || !(page.h > 0) || page.space !== g.coordinateSpace || g.x == null || g.y == null || g.width == null || g.height == null) {
      p.regions.get(kind).push({ nx: null, ny: null, nw: null, nh: null, space: g.coordinateSpace, page: pageNo, raw: g });
      continue;
    }
    p.regions.get(kind).push({
      nx: round(g.x / page.w, decimals), ny: round(g.y / page.h, decimals),
      nw: round(g.width / page.w, decimals), nh: round(g.height / page.h, decimals),
      space: g.coordinateSpace, page: pageNo, raw: g,
    });
  }

  /* ── pass 2: per-document fingerprint ── */
  function repPageSize(profile) {
    const sizes = [...profile.pages.values()].filter((pp) => pp.w > 0 && pp.h > 0);
    if (!sizes.length) return null;
    // modal bucketed size
    const counts = new Map();
    for (const s of sizes) {
      const key = `${bucketPt(s.w, ptTol)}x${bucketPt(s.h, ptTol)}|${s.space}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0][0];
    const [dims, space] = best.split('|');
    const [w, h] = dims.split('x').map(Number);
    // the exact representative size = the mean of pages that fall in the modal bucket
    const inBucket = sizes.filter((s) => bucketPt(s.w, ptTol) === w && bucketPt(s.h, ptTol) === h && s.space === space);
    return { w: mean(inBucket.map((s) => s.w)), h: mean(inBucket.map((s) => s.h)), bw: w, bh: h, space };
  }
  function regionKey(kind, geoms) {
    const known = geoms.filter((g) => g.nx != null);
    if (!known.length) return `${kind}@unknown`;
    const nx = round(mean(known.map((g) => g.nx)), decimals);
    const ny = round(mean(known.map((g) => g.ny)), decimals);
    const nw = round(mean(known.map((g) => g.nw)), decimals);
    const nh = round(mean(known.map((g) => g.nh)), decimals);
    return `${kind}@${nx},${ny},${nw},${nh}`;
  }

  const docFp = new Map(); // documentId -> { fingerprint, repSize, regionKeys: Map<kind,string>, orientation }
  for (const [docId, profile] of profiles) {
    const rep = repPageSize(profile);
    const orientation = rep ? (rep.bw > rep.bh ? 'landscape' : 'portrait') : 'unknown';
    const sizePart = rep ? `size:${rep.bw}x${rep.bh}:${rep.space}` : 'size:unknown';
    const regionKeys = new Map();
    for (const [kind, geoms] of [...profile.regions.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      regionKeys.set(kind, regionKey(kind, geoms));
    }
    const fp = [sizePart, `orient:${orientation}`, ...[...regionKeys.values()].sort()].join('|');
    docFp.set(docId, { fingerprint: fp, rep, regionKeys, orientation });
  }

  /* ── pass 3: group (documentType, fingerprint) → pattern ── */
  const groups = new Map(); // `${type}|${fp}` -> [docId...]
  for (const [docId, { fingerprint }] of docFp) {
    const key = `${typeOf(docId)}|${fingerprint}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(docId);
  }
  // cross-type groups (same fingerprint across >= 2 real types)
  const fpToTypes = new Map();
  for (const [docId, { fingerprint }] of docFp) {
    if (!fpToTypes.has(fingerprint)) fpToTypes.set(fingerprint, new Set());
    fpToTypes.get(fingerprint).add(typeOf(docId));
  }

  function buildPattern(docIds, scopeType, fingerprint) {
    const uniqDocs = [...new Set(docIds)].sort();
    if (uniqDocs.length < minDocs) return null;
    const obsIds = new Set();
    let confidence = 0;
    let maxPageAny = 0;
    const distributionByType = {};
    for (const d of uniqDocs) {
      const p = profiles.get(d);
      for (const id of p.obsIds) obsIds.add(id);
      confidence = Math.max(confidence, p.confidence);
      maxPageAny = Math.max(maxPageAny, p.maxPage);
      distributionByType[typeOf(d)] = (distributionByType[typeOf(d)] || 0) + 1;
    }

    // representative page model — the modal bucketed size across the group
    const reps = uniqDocs.map((d) => docFp.get(d).rep).filter(Boolean);
    let pageModel;
    let geometryKnown = false;
    const coordSpaces = new Set();
    if (reps.length) {
      geometryKnown = true;
      const rc = new Map();
      for (const r of reps) {
        const k = `${r.bw}x${r.bh}:${r.space}`;
        rc.set(k, (rc.get(k) || 0) + 1);
        coordSpaces.add(r.space);
      }
      const bestK = [...rc.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0][0];
      const [dims, space] = bestK.split(':');
      const [bw, bh] = dims.split('x').map(Number);
      const inBest = reps.filter((r) => r.bw === bw && r.bh === bh && r.space === space);
      pageModel = makeTemplatePageModel({
        width: mean(inBest.map((r) => r.w)),
        height: mean(inBest.map((r) => r.h)),
        coordinateSpace: space,
        sourceDocumentIds: uniqDocs,
        sourceObservationIds: [...obsIds].sort(),
      });
    } else {
      pageModel = makeTemplatePageModel({ sourceDocumentIds: uniqDocs, sourceObservationIds: [...obsIds].sort() });
    }

    // aggregate regions per kind
    const kinds = new Set();
    for (const d of uniqDocs) for (const k of profiles.get(d).regions.keys()) kinds.add(k);
    const regions = [];
    for (const kind of [...kinds].sort()) {
      const perDocGeoms = [];
      const pagesSeen = [];
      let regionDocCount = 0;
      let occ = 0;
      let regionConf = 0;
      const regionObsDoc = new Set();
      for (const d of uniqDocs) {
        const geoms = profiles.get(d).regions.get(kind) || [];
        if (!geoms.length) continue;
        regionDocCount += 1;
        occ += geoms.length;
        regionObsDoc.add(d);
        regionConf = Math.max(regionConf, profiles.get(d).confidence);
        for (const g of geoms) {
          if (g.nx != null) perDocGeoms.push(g);
          if (g.page != null) pagesSeen.push({ doc: d, page: g.page, maxPage: profiles.get(d).maxPage });
        }
      }
      const known = perDocGeoms;
      const geometry = known.length ? {
        // stored geometry stays in the ORIGINAL space, page-relative fraction
        // (full mean precision — NOT rounded to the fingerprint grid, §5)
        x: mean(known.map((g) => g.nx)), y: mean(known.map((g) => g.ny)),
        width: mean(known.map((g) => g.nw)), height: mean(known.map((g) => g.nh)),
        coordinateSpace: COORDINATE_SPACE.NORMALIZED,
      } : {};
      regions.push(makeTemplateRegion({
        kind,
        geometry,
        pageRecurrence: inferRecurrence(pagesSeen, minRecur),
        occurrenceCount: occ,
        documentCount: regionDocCount,
        confidence: regionConf,
        sourceObservationIds: [...obsIds].sort(),
        sourceDocumentIds: [...regionObsDoc].sort(),
        note: known.length ? '' : 'region kind observed but with no reproducible geometry (unknown).',
      }));
    }

    // temporal evidence (Phase 5.x.3 primitives)
    const dates = uniqDocs.map((d) => dateOf(d));
    const buckets = dates.map((d) => bucketSourceDate(d, windows));
    const hist = buckets.filter((b) => b === TEMPORAL_CLASSIFICATION.HISTORICAL).length;
    const curr = buckets.filter((b) => b === TEMPORAL_CLASSIFICATION.CURRENT).length;
    const tran = buckets.filter((b) => b === TEMPORAL_CLASSIFICATION.TRANSITIONAL).length;
    const undated = buckets.filter((b) => b === TEMPORAL_CLASSIFICATION.UNKNOWN).length;
    const minC = Number.isInteger(cfg.temporal.minCurrentDocuments) ? cfg.temporal.minCurrentDocuments : 2;
    const minH = Number.isInteger(cfg.temporal.minHistoricalDocuments) ? cfg.temporal.minHistoricalDocuments : 1;
    let conventionEra = TEMPORAL_CLASSIFICATION.UNKNOWN;
    let temporalStatus = CONVENTION_STATUS.INSUFFICIENT_EVIDENCE;
    if (windows.configured && (hist + curr + tran) > 0) {
      if (curr >= minC && hist === 0) { conventionEra = TEMPORAL_CLASSIFICATION.CURRENT; temporalStatus = CONVENTION_STATUS.CURRENT_EVIDENCE; }
      else if (hist >= minH && curr === 0) { conventionEra = TEMPORAL_CLASSIFICATION.HISTORICAL; temporalStatus = CONVENTION_STATUS.HISTORICAL_ONLY; }
      else if (curr > 0 && hist > 0) { conventionEra = TEMPORAL_CLASSIFICATION.TRANSITIONAL; temporalStatus = CONVENTION_STATUS.CONFLICTING; }
      else if (tran > 0) { conventionEra = TEMPORAL_CLASSIFICATION.TRANSITIONAL; temporalStatus = CONVENTION_STATUS.INSUFFICIENT_EVIDENCE; }
    }
    const datedOnly = dates.filter(Boolean).sort();
    const temporalEvidence = {
      temporalStatus, conventionEra,
      oldestSourceDate: datedOnly[0] || null,
      latestSourceDate: datedOnly[datedOnly.length - 1] || null,
      recentDocumentCount: curr, historicalDocumentCount: hist,
      transitionalDocumentCount: tran, undatedDocumentCount: undated,
    };

    const variant = variantLabel(pageModel, regions, fingerprint);
    const patternId = `vpat_${slug(scopeType)}__${fnv1a(fingerprint)}`;

    return Object.freeze({
      patternId,
      fingerprint,
      documentType: scopeType,
      scope: VISUAL_TEMPLATE_SCOPE.ORGANIZATION,
      variant,
      pageModel,
      regions: Object.freeze(regions),
      typography: makeTemplateTypography({}),   // deterministic layout analysis carries no font today (§17)
      spacing: makeTemplateSpacing({}),
      structuralRules: makeTemplateStructuralRules({
        multiPage: maxPageAny >= 2 ? true : (maxPageAny === 1 ? false : null),
      }),
      sourceDocumentIds: uniqDocs,
      sourceObservationIds: [...obsIds].sort(),
      evidence: Object.freeze({
        documentCount: uniqDocs.length,
        observationCount: obsIds.size,
        pageCount: maxPageAny || 0,
        regionKinds: strList(regions.map((r) => r.kind)),
        coordinateSpaces: strList([...coordSpaces]),
        geometryKnown,
        documentTypeDistribution: Object.freeze({ ...distributionByType }),
      }),
      temporalEvidence: Object.freeze(temporalEvidence),
      confidence: Math.max(0, Math.min(1, confidence)),
    });
  }

  const patterns = [];
  for (const [key, docIds] of groups) {
    const [type, fp] = splitKey(key);
    const pat = buildPattern(docIds, type, fp);
    if (pat) patterns.push(pat);
  }
  // cross_type
  for (const [fp, types] of fpToTypes) {
    const real = [...types].filter((t) => REAL_TYPES.includes(t));
    if (real.length < 2) continue;
    const docIds = [...docFp.entries()].filter(([, v]) => v.fingerprint === fp).map(([d]) => d);
    const pat = buildPattern(docIds, VISUAL_TEMPLATE_DOCUMENT_TYPE.CROSS_TYPE, fp);
    if (pat) patterns.push(pat);
  }
  patterns.sort((a, b) => (a.patternId < b.patternId ? -1 : a.patternId > b.patternId ? 1 : 0));

  /* ── conflicts: a (scope, documentType) slot with >= 2 distinct patterns ── */
  const bySlot = new Map();
  for (const p of patterns) {
    const k = `${p.scope}|${p.documentType}`;
    if (!bySlot.has(k)) bySlot.set(k, []);
    bySlot.get(k).push(p);
  }
  const patternConflicts = [];
  for (const [, group] of bySlot) {
    if (group.length < 2) continue;
    patternConflicts.push(Object.freeze({
      scope: group[0].scope,
      documentType: group[0].documentType,
      competingPatternIds: Object.freeze(group.map((p) => p.patternId).sort()),
      sides: Object.freeze([...group].sort((a, b) => (a.patternId < b.patternId ? -1 : 1)).map((p) => Object.freeze({
        patternId: p.patternId, variant: p.variant, fingerprint: p.fingerprint,
        pageModel: p.pageModel, regions: p.regions, evidence: p.evidence, temporalEvidence: p.temporalEvidence,
      }))),
      note: 'Multiple visual layouts are in use for this document type — BOTH are preserved. A human must decide; the Visual Template System never chooses by frequency (§20, §21).',
    }));
  }
  patternConflicts.sort((a, b) => {
    const ka = `${a.scope}|${a.documentType}`;
    const kb = `${b.scope}|${b.documentType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return Object.freeze({
    schema: VISUAL_EVIDENCE_REPORT_SCHEMA,
    generatedAt: at,
    temporalConfigured: windows.configured === true,
    patterns: Object.freeze(patterns),
    patternConflicts: Object.freeze(patternConflicts),
    summary: Object.freeze({
      total: patterns.length,
      geometryKnown: patterns.filter((p) => p.evidence.geometryKnown).length,
      crossType: patterns.filter((p) => p.documentType === VISUAL_TEMPLATE_DOCUMENT_TYPE.CROSS_TYPE).length,
      conflictedSlots: patternConflicts.length,
    }),
  });
}

function splitKey(key) {
  const i = key.indexOf('|');
  return [key.slice(0, i), key.slice(i + 1)];
}

function inferRecurrence(pagesSeen, minRecur) {
  if (!pagesSeen.length) return VISUAL_PAGE_RECURRENCE.UNKNOWN;
  const multiPageDocs = new Map(); // doc -> { pages:Set, maxPage }
  for (const s of pagesSeen) {
    if (!(s.maxPage >= 2)) continue;
    if (!multiPageDocs.has(s.doc)) multiPageDocs.set(s.doc, { pages: new Set(), maxPage: s.maxPage });
    multiPageDocs.get(s.doc).pages.add(s.page);
  }
  if (multiPageDocs.size < minRecur) return VISUAL_PAGE_RECURRENCE.UNKNOWN;
  let everyPage = true;
  let firstOnly = true;
  let lastOnly = true;
  for (const { pages, maxPage } of multiPageDocs.values()) {
    if (pages.size !== maxPage) everyPage = false;
    if (!(pages.size === 1 && pages.has(1))) firstOnly = false;
    if (!(pages.size === 1 && pages.has(maxPage))) lastOnly = false;
  }
  if (everyPage) return VISUAL_PAGE_RECURRENCE.EVERY_PAGE;
  if (firstOnly) return VISUAL_PAGE_RECURRENCE.FIRST_PAGE_ONLY;
  if (lastOnly) return VISUAL_PAGE_RECURRENCE.LAST_PAGE_ONLY;
  return VISUAL_PAGE_RECURRENCE.UNKNOWN;
}

function variantLabel(pageModel, regions, fingerprint) {
  const size = (pageModel && pageModel.width != null && pageModel.height != null)
    ? `${Math.round(pageModel.width)}x${Math.round(pageModel.height)}${pageModel.unit}`
    : 'nosize';
  const orient = (pageModel && pageModel.orientation) || 'unknown';
  const logo = regions.find((r) => r.kind === VISUAL_REGION_KIND.LOGO);
  const logoHint = logo && logo.geometry && logo.geometry.x != null
    ? `logo-${logo.geometry.x < 0.34 ? 'l' : logo.geometry.x > 0.66 ? 'r' : 'c'}`
    : '';
  return [size, orient, logoHint, fnv1a(fingerprint).slice(0, 6)].filter(Boolean).join('-');
}
