/* ============================================================
   PARSER-REGISTRY.JS — Intelligent Ingestion (V2, Part A1/A2)

   PURPOSE: the ONE place that names "what version is the current parser"
   for each independent extraction axis this pipeline runs at upload time.
   A session's `factsProvenance`/`extractionSuggestion` stamps whichever
   version(s) actually touched it; Part A2's background re-analysis sweep
   compares that stamp against the numbers here to decide staleness. Pure
   data — no extraction logic lives here (see docx-text-extractor.js /
   content-fact-extraction-engine.js / metadata-inference-engine.js).

   TWO INDEPENDENT AXES, not one version number: `metadata` (domainType/
   datasetType/knowledgeKind classification, filename/folder-token only —
   metadata-inference-engine.js) and `content` (real document TEXT
   extraction + fact derivation — docx-text-extractor.js +
   content-fact-extraction-engine.js). A future metadata-vocabulary update
   should not force every already-processed `.docx` through Mammoth again,
   and a future parser capability should not force a full metadata
   re-classification — hence two counters, not one.

   A session created before this registry existed has no stamp at all on
   either axis — absence IS version 0, honestly poorer than any real
   version, so it is unconditionally re-analysis-eligible the moment a
   real parser ships. No backfill/migration script needed.

   RESPONSIBILITY: CURRENT_METADATA_PARSER_VERSION,
   CURRENT_CONTENT_PARSER_VERSION, PARSER_VERSION_MANIFEST (human-readable
   capability history, for audit/basis text only — never read for control
   flow).

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** No stamp at all (a session that predates this registry) reads as this —
 *  never persisted explicitly, only ever the result of `|| PARSER_VERSION_NONE`. */
export const PARSER_VERSION_NONE = 0;

/** V2, Part A1 — real `.docx` text extraction (Mammoth) + deterministic
 *  regex fact derivation (documentNumber/senderOrigin/value). PDF is not
 *  covered by this axis at any version yet (would need OCR — out of
 *  scope, see docx-text-extractor.js's header). */
export const CURRENT_CONTENT_PARSER_VERSION = 1;

/** V2, Part A1 — filename/folder-token classification
 *  (metadata-inference-engine.js), plus the small filename-derived
 *  documentNumber floor added alongside the content parser in the same
 *  release. Existed before this registry in substance; this is simply the
 *  first version it's ever been NUMBERED. */
export const CURRENT_METADATA_PARSER_VERSION = 1;

/** Human-readable capability history — mirrors the illustrative v1/v2/v3
 *  table this feature's own requirements were specified against. Purely
 *  descriptive (audit/basis text, e.g. "re-analysis found X because parser
 *  vN added Y") — never read for control flow; control flow only ever
 *  compares the two CURRENT_* numbers above against a session's stamp. */
export const PARSER_VERSION_MANIFEST = Object.freeze([
  Object.freeze({
    axis: 'content',
    version: 1,
    addedCapabilities: Object.freeze(['documentNumber', 'senderOrigin', 'value']),
    notes: 'Real .docx text extraction (Mammoth) + deterministic regex/keyword fact extraction. No OCR — PDF still manual.',
  }),
  Object.freeze({
    axis: 'metadata',
    version: 1,
    addedCapabilities: Object.freeze(['domainType', 'datasetType', 'knowledgeKind', 'documentNumber (filename floor)']),
    notes: 'Filename/folder token classification against registered vocabulary, plus a filename-derived documentNumber floor.',
  }),
]);
