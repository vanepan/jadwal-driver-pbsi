/* ============================================================
   VISUAL-OBSERVATION.JS — PBSI Visual Template System (V2, Phase 5.x.6)

   PURPOSE: the small, pure helpers that read a corpus VISUAL observation
   (a CorpusObservation with category 'layout', modality 'visual' — from
   src/intelligence/corpus/analysis/visual/deterministic-layout-analyzer.js
   or the optional visual-analyzer-port.js) and classify it into a
   VISUAL_REGION_KIND for the aggregator (§3, §4, §15).

   This layer does NOT extract geometry — it interprets what the corpus
   already recorded. It NEVER fabricates a coordinate, a page size, or a
   region (§5, §6, §26).

   RESPONSIBILITY: isVisualLayoutObservation(o),
   visualObservationRegionKind(o), pageGeometryOf(o), regionOf(o).

   DEPENDENCIES: ./contracts/visual-template-contract.js. PURE.
   ============================================================ */

'use strict';

import {
  VISUAL_REGION_KIND, isVisualRegionKind, COORDINATE_SPACE, makeTemplateGeometry,
} from './contracts/visual-template-contract.js';

/** The corpus observation category + modality a visual/layout observation
 *  carries (src/intelligence/corpus/contracts/corpus-observation-contract.js). */
const LAYOUT_CATEGORY = 'layout';
const VISUAL_MODALITY = 'visual';

export function isVisualLayoutObservation(o) {
  return !!o && typeof o === 'object'
    && o.category === LAYOUT_CATEGORY
    && o.modality === VISUAL_MODALITY
    && typeof o.documentId === 'string' && o.documentId
    && Array.isArray(o.provenance) && o.provenance.length >= 1;
}

/** A `block_<role>` key → a region kind. The role vocabulary is whatever
 *  the deterministic layout analyzer / an injected visual analyzer emits;
 *  anything unmapped is OTHER (never dropped, never guessed into a
 *  meaningful kind). */
const ROLE_TO_KIND = Object.freeze({
  header: VISUAL_REGION_KIND.HEADER,
  footer: VISUAL_REGION_KIND.FOOTER,
  logo: VISUAL_REGION_KIND.LOGO,
  title: VISUAL_REGION_KIND.TITLE,
  subject: VISUAL_REGION_KIND.SUBJECT,
  perihal: VISUAL_REGION_KIND.SUBJECT,
  recipient: VISUAL_REGION_KIND.RECIPIENT,
  penerima: VISUAL_REGION_KIND.RECIPIENT,
  date: VISUAL_REGION_KIND.DATE,
  tanggal: VISUAL_REGION_KIND.DATE,
  body: VISUAL_REGION_KIND.BODY,
  isi: VISUAL_REGION_KIND.BODY,
  signature: VISUAL_REGION_KIND.SIGNATURE,
  signature_block: VISUAL_REGION_KIND.SIGNATURE,
  ttd: VISUAL_REGION_KIND.SIGNATURE,
  attachment: VISUAL_REGION_KIND.ATTACHMENT,
  lampiran: VISUAL_REGION_KIND.ATTACHMENT,
  page_number: VISUAL_REGION_KIND.PAGE_NUMBER,
  pagenumber: VISUAL_REGION_KIND.PAGE_NUMBER,
  divider: VISUAL_REGION_KIND.DIVIDER,
  metadata: VISUAL_REGION_KIND.DOCUMENT_METADATA,
  document_metadata: VISUAL_REGION_KIND.DOCUMENT_METADATA,
  identity: VISUAL_REGION_KIND.DOCUMENT_METADATA,
  document_identity_block: VISUAL_REGION_KIND.DOCUMENT_METADATA,
});

/**
 * The VISUAL_REGION_KIND a layout observation represents.
 *   page_geometry     → PAGE
 *   content_bounds    → MARGIN
 *   block_<role>      → ROLE_TO_KIND[role] (else OTHER)
 *   observation.kind  → used verbatim if it is already a valid kind (an
 *                       injected visual analyzer may name the region itself)
 * @returns {string} VISUAL_REGION_KIND.*
 */
export function visualObservationRegionKind(o) {
  if (!isVisualLayoutObservation(o)) return VISUAL_REGION_KIND.OTHER;
  const obs = o.observation && typeof o.observation === 'object' ? o.observation : {};
  if (isVisualRegionKind(obs.kind)) return obs.kind;
  const key = String(o.key || '');
  if (key === 'page_geometry') return VISUAL_REGION_KIND.PAGE;
  if (key === 'content_bounds') return VISUAL_REGION_KIND.MARGIN;
  if (key.startsWith('block_')) {
    const role = key.slice('block_'.length).toLowerCase();
    return ROLE_TO_KIND[role] || VISUAL_REGION_KIND.OTHER;
  }
  const role = String(obs.role || '').toLowerCase();
  if (role && ROLE_TO_KIND[role]) return ROLE_TO_KIND[role];
  return VISUAL_REGION_KIND.OTHER;
}

/**
 * The page geometry a `page_geometry` observation carries, or null.
 * @returns {{ pageNumber: number|null, width: number|null, height: number|null, coordinateSpace: string }|null}
 */
export function pageGeometryOf(o) {
  if (!isVisualLayoutObservation(o) || String(o.key || '') !== 'page_geometry') return null;
  const obs = o.observation && typeof o.observation === 'object' ? o.observation : {};
  const w = Number(obs.width);
  const h = Number(obs.height);
  if (!(Number.isFinite(w) && w > 0) || !(Number.isFinite(h) && h > 0)) return null; // §6 — no fabricated size
  const space = Object.values(COORDINATE_SPACE).includes(obs.coordinateSpace) ? obs.coordinateSpace : COORDINATE_SPACE.PDF_POINTS;
  const pn = Number((o.provenance[0] && o.provenance[0].pageNumber) || obs.pageNumber);
  return {
    pageNumber: Number.isInteger(pn) && pn >= 1 ? pn : null,
    width: w,
    height: h,
    coordinateSpace: space,
  };
}

/**
 * The spatial region a layout observation is anchored to — the provenance
 * `region` (a CorpusRegion). null when the observation is not spatially
 * anchored (e.g. bare page_geometry, or an unpositioned block).
 * @returns {{ region: object, pageNumber: number|null }|null}
 */
export function regionOf(o) {
  if (!isVisualLayoutObservation(o)) return null;
  const prov = o.provenance[0] || {};
  const r = prov.region;
  if (!r || typeof r !== 'object') return null;
  if (r.x == null && r.y == null && r.width == null && r.height == null) return null;
  return {
    region: makeTemplateGeometry(r),
    pageNumber: Number.isInteger(Number(prov.pageNumber)) && Number(prov.pageNumber) >= 1 ? Number(prov.pageNumber) : null,
  };
}
