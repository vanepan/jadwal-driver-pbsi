/* ============================================================
   TERMINOLOGY-OBSERVER.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: from an ExtractionResult, extract candidate WORDING / TERM
   observations (§11) — recurring organizational terms, preferred phrases,
   opening & closing wording, recipient / subject / attachment / copy
   conventions, formal-tone markers.

   THE HARD RULE (§11): a phrase appearing repeatedly is STILL an
   observation until a human approves it. This observer NEVER converts
   frequency into authority. It records:
       observedValue    = the exact wording (verbatim, traceable)
       occurrenceCount  = how many times it was seen IN THIS DOCUMENT
       lifecycleState   = 'observed'   (always — see candidate-grouping.js
                          for the separate, still-non-authoritative
                          'candidate' step across many documents)

   RESPONSIBILITY: observeTerminology({ documentId, extraction,
   sourceFileId, at }) -> CorpusObservation[].

   DEPENDENCIES: ../contracts/... , ../corpus-observation-record.js.
   Pure — no I/O, no model, no normalisation of the observed wording
   (§12 — raw wording stays recoverable; normalizedValue is null).
   ============================================================ */

'use strict';

import { OBSERVATION_CATEGORY, OBSERVATION_MODALITY, makeCorpusObservation } from '../contracts/corpus-observation-contract.js';
import { EXTRACTION_METHOD } from '../contracts/corpus-provenance-contract.js';
import { observationIdFrom } from '../corpus-observation-record.js';

/** Fixed phrases worth recording verbatim when present, with the category
 *  they evidence. Deterministic — no scoring model. */
const PHRASE_RULES = [
  { re: /Dengan hormat,?/i, category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'phrase_dengan_hormat' },
  { re: /Sehubungan dengan[^.\n]{0,80}/i, category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'phrase_sehubungan_dengan' },
  { re: /bersama ini (?:kami )?(?:sampaikan|laporkan|ajukan)[^.\n]{0,60}/i, category: OBSERVATION_CATEGORY.PREFERRED_PHRASE, key: 'phrase_bersama_ini' },
  { re: /kami mohon(?:kan)?[^.\n]{0,80}/i, category: OBSERVATION_CATEGORY.PREFERRED_PHRASE, key: 'phrase_kami_mohon' },
  { re: /Demikian(?: kami sampaikan| disampaikan)?[^.\n]{0,80}/i, category: OBSERVATION_CATEGORY.CLOSING_PATTERN, key: 'phrase_demikian' },
  { re: /[Aa]tas perhatian(?:nya)?[^.\n]{0,60}(?:terima kasih)?/i, category: OBSERVATION_CATEGORY.CLOSING_PATTERN, key: 'phrase_atas_perhatian' },
  { re: /Kepada Yth\.?/i, category: OBSERVATION_CATEGORY.RECIPIENT_CONVENTION, key: 'phrase_kepada_yth' },
  { re: /Tembusan(?: Yth\.?)?/i, category: OBSERVATION_CATEGORY.COPY_CONVENTION, key: 'phrase_tembusan' },
  { re: /Lampiran\s*:\s*[^\n]{0,60}/i, category: OBSERVATION_CATEGORY.ATTACHMENT_CONVENTION, key: 'phrase_lampiran' },
  { re: /Perihal\s*:\s*[^\n]{0,120}/i, category: OBSERVATION_CATEGORY.SUBJECT_CONVENTION, key: 'phrase_perihal' },
  { re: /Terbilang\s*:\s*[^\n]{0,160}/i, category: OBSERVATION_CATEGORY.PREFERRED_PHRASE, key: 'phrase_terbilang' },
  { re: /sebagai laporan/i, category: OBSERVATION_CATEGORY.COPY_CONVENTION, key: 'phrase_sebagai_laporan' },
];

/** Organizational terms — recorded as ORGANIZATIONAL_TERM observations. */
const ORG_TERMS = [
  'Nota Organisasi', 'Petty Cash', 'Realisasi Petty Cash', 'Bidang Sarana dan Prasarana',
  'Wakil Ketua Umum III', 'Sekretaris Jenderal', 'Bendahara', 'Audit Internal',
  'Plt.', 'Kabid Sarana dan Prasarana', 'Dana Awal', 'Dana Terealisasi', 'Sisa Dana',
];

/** Formal-tone markers — the presence of deferential/formal register. */
const TONE_MARKERS = [
  { re: /\bYth\.?\b/, name: 'honorific_yth' },
  { re: /\bmohon\b/i, name: 'deferential_mohon' },
  { re: /\bkami\b/i, name: 'first_person_plural_kami' },
  { re: /\bdengan hormat\b/i, name: 'salutation_dengan_hormat' },
];

function countOccurrences(haystack, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const matches = haystack.match(g);
  return matches ? matches.length : 0;
}

function prov({ documentId, sourceFileId, method, confidence, at }) {
  return [{
    sourceDocumentId: documentId,
    sourceFileId: sourceFileId || null,
    pageNumber: null,
    region: null,
    extractionMethod: method || EXTRACTION_METHOD.UNKNOWN,
    extractedAt: at,
    confidence: typeof confidence === 'number' ? confidence : 0.6,
  }];
}

/**
 * @param {{ documentId: string, extraction: object, sourceFileId?: string|null, at?: string }} input
 * @returns {import('../contracts/corpus-observation-contract.js').CorpusObservation[]}
 */
export function observeTerminology({ documentId, extraction, sourceFileId = null, at } = {}) {
  const when = at || new Date().toISOString();
  const ex = extraction || {};
  const text = typeof ex.text === 'string' ? ex.text : '';
  const method = ex.method || EXTRACTION_METHOD.UNKNOWN;
  if (!text.trim()) return [];
  const out = [];
  const seen = new Set();

  const emit = ({ category, key, observedValue, occurrenceCount, confidence, observation }) => {
    const id = observationIdFrom(documentId, category, key);
    if (seen.has(id)) return;
    seen.add(id);
    const oc = Number.isInteger(occurrenceCount) && occurrenceCount >= 1 ? occurrenceCount : 1;
    out.push(makeCorpusObservation({
      observationId: id,
      documentId, category, key,
      observedValue: observedValue == null ? null : String(observedValue).trim().slice(0, 300),
      observation: observation || null,
      modality: OBSERVATION_MODALITY.TEXT,
      provenance: prov({ documentId, sourceFileId, method, confidence, at: when }),
      confidence: typeof confidence === 'number' ? confidence : 0.6,
      // occurrenceCount within THIS document — evidence weight, NOT authority (§11)
      occurrenceCount: oc,
      // lifecycleState defaults to 'observed'
      createdAt: when,
      updatedAt: when,
    }));
  };

  // ── fixed phrases ──
  for (const rule of PHRASE_RULES) {
    const m = text.match(rule.re);
    if (!m) continue;
    const count = countOccurrences(text, rule.re);
    emit({ category: rule.category, key: rule.key, observedValue: m[0], occurrenceCount: count, confidence: 0.75 });
  }

  // ── organizational terms ──
  for (const term of ORG_TERMS) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = countOccurrences(text, re);
    if (count > 0) {
      emit({ category: OBSERVATION_CATEGORY.ORGANIZATIONAL_TERM, key: `term_${term.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
        observedValue: term, occurrenceCount: count, confidence: 0.7 });
    }
  }

  // ── formal-tone markers ──
  const tonesFound = TONE_MARKERS.filter((t) => t.re.test(text)).map((t) => t.name);
  if (tonesFound.length) {
    emit({ category: OBSERVATION_CATEGORY.FORMAL_TONE, key: 'formal_register',
      observedValue: tonesFound.join(', '),
      observation: { markers: tonesFound, register: 'formal_deferential' }, confidence: 0.6 });
  }

  return out;
}
