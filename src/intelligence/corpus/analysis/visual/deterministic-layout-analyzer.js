/* ============================================================
   DETERMINISTIC-LAYOUT-ANALYZER.JS — Corpus Ingestion & Document
   Analysis (V2, Phase 5.x.2)

   PURPOSE: derive the LAYOUT observations that CAN be established
   deterministically — from real PDF page geometry (/MediaBox) and, when
   an extractor supplied positioned text blocks, from those block regions.
   No model, no rendering, no invented coordinates (§13 — "Where
   deterministic PDF geometry can establish a fact, prefer deterministic
   extraction").

   What it emits today (category 'layout', modality 'visual',
   lifecycleState 'observed'):
     • page_geometry     — page size + orientation, coordinateSpace
                           'pdf_points' (from /MediaBox)
     • page_margins      — only when positioned blocks exist (else NOT
                           emitted — never a fabricated margin)
     • block regions     — one observation per positioned TextBlock that
                           carries a real region

   When the ExtractionResult has NO page geometry and NO positioned
   blocks (e.g. a DOCX, or a PDF whose text could not be read), this
   analyzer emits NOTHING — honestly (§13, §16).

   RESPONSIBILITY: analyzeLayoutDeterministically({ documentId, extraction,
   sourceFileId, at }) -> CorpusObservation[].

   DEPENDENCIES: ../../contracts/... , ../../corpus-observation-record.js.
   Pure.
   ============================================================ */

'use strict';

import { OBSERVATION_CATEGORY, OBSERVATION_MODALITY, makeCorpusObservation } from '../../contracts/corpus-observation-contract.js';
import { EXTRACTION_METHOD, COORDINATE_SPACE } from '../../contracts/corpus-provenance-contract.js';
import { observationIdFrom } from '../../corpus-observation-record.js';

function orientation(w, h) {
  if (!(w > 0) || !(h > 0)) return 'unknown';
  return w > h ? 'landscape' : 'portrait';
}

/** Nearest ISO paper name for a pdf-points size (± a few pt). Advisory. */
function paperName(w, h) {
  const near = (a, b) => Math.abs(a - b) <= 6;
  const dims = [w, h].sort((a, b) => a - b);
  if (near(dims[0], 595) && near(dims[1], 842)) return 'A4';
  if (near(dims[0], 612) && near(dims[1], 792)) return 'Letter';
  if (near(dims[0], 420) && near(dims[1], 595)) return 'A5';
  return null;
}

/**
 * @param {{ documentId: string, extraction: object, sourceFileId?: string|null, at?: string }} input
 * @returns {import('../../contracts/corpus-observation-contract.js').CorpusObservation[]}
 */
export function analyzeLayoutDeterministically({ documentId, extraction, sourceFileId = null, at } = {}) {
  const when = at || new Date().toISOString();
  const ex = extraction || {};
  const pages = Array.isArray(ex.pages) ? ex.pages : [];
  const out = [];

  const emit = ({ key, observedValue, observation, region, pageNumber, confidence }) => {
    out.push(makeCorpusObservation({
      observationId: `${observationIdFrom(documentId, OBSERVATION_CATEGORY.LAYOUT, key)}${pageNumber ? `__p${pageNumber}` : ''}`,
      documentId,
      category: OBSERVATION_CATEGORY.LAYOUT,
      modality: OBSERVATION_MODALITY.VISUAL,
      key,
      observedValue: observedValue == null ? null : String(observedValue).slice(0, 200),
      observation: observation || null,
      provenance: [{
        sourceDocumentId: documentId,
        sourceFileId: sourceFileId || null,
        pageNumber: pageNumber || null,
        region: region || null,
        extractionMethod: EXTRACTION_METHOD.STRUCTURE_PARSE, // deterministic geometry, not a visual model
        extractedAt: when,
        confidence: typeof confidence === 'number' ? confidence : 0.85,
      }],
      confidence: typeof confidence === 'number' ? confidence : 0.85,
      createdAt: when,
      updatedAt: when,
    }));
  };

  for (const p of pages) {
    if (!(p && p.width > 0 && p.height > 0)) continue;
    const space = Object.values(COORDINATE_SPACE).includes(p.coordinateSpace) ? p.coordinateSpace : COORDINATE_SPACE.PDF_POINTS;
    emit({
      key: 'page_geometry',
      observedValue: `${p.width}x${p.height} ${space}`,
      observation: {
        width: p.width, height: p.height, coordinateSpace: space,
        orientation: orientation(p.width, p.height),
        paper: paperName(p.width, p.height),
      },
      pageNumber: p.pageNumber,
      confidence: 0.9,
    });

    const blocksWithRegion = (Array.isArray(p.blocks) ? p.blocks : []).filter((b) => b && b.region
      && b.region.x != null && b.region.y != null && b.region.width != null && b.region.height != null);
    if (blocksWithRegion.length) {
      const minX = Math.min(...blocksWithRegion.map((b) => b.region.x));
      const minY = Math.min(...blocksWithRegion.map((b) => b.region.y));
      const maxX = Math.max(...blocksWithRegion.map((b) => b.region.x + b.region.width));
      const maxY = Math.max(...blocksWithRegion.map((b) => b.region.y + b.region.height));
      emit({
        key: 'content_bounds',
        observedValue: `L${Math.round(minX)} T${Math.round(minY)} R${Math.round(p.width - maxX)} B${Math.round(p.height - maxY)}`,
        observation: {
          leftMargin: Math.round(minX), topMargin: Math.round(minY),
          rightMargin: Math.round(p.width - maxX), bottomMargin: Math.round(p.height - maxY),
          coordinateSpace: space,
        },
        region: { x: minX, y: minY, width: maxX - minX, height: maxY - minY, coordinateSpace: space },
        pageNumber: p.pageNumber,
        confidence: 0.8,
      });
      for (const b of blocksWithRegion) {
        if (b.role === 'unknown') continue;
        emit({
          key: `block_${b.role}`,
          observedValue: String(b.text || '').slice(0, 120) || null,
          observation: { role: b.role, order: b.order },
          region: b.region,
          pageNumber: p.pageNumber,
          confidence: 0.7,
        });
      }
    }
  }

  return out;
}
