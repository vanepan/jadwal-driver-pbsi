/* ============================================================
   SOURCE-DATE-EXTRACTOR.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: read the document's OWN issue date from its CONTENT (§2, §7).

   THE RULE (§2): a source date is a DOCUMENT FACT. It is extracted ONLY
   from the document body — never from the filename, the upload time, a
   filesystem timestamp, or a folder name. If the content does not clearly
   state one, the result is `null`.

   PBSI NOR / Memorandum documents carry the date on a "dateline" —
   `<Kota>, <d> <BulanIndonesia> <yyyy>` (e.g. "Jakarta, 18 Mei 2026"),
   usually the line directly under the title and above the reference
   number. That is the strongest signal; a bare Indonesian or ISO date
   elsewhere in the body is a weaker fallback.

   RESPONSIBILITY: extractSourceDate(text) -> { sourceDate, basis,
   confidence, candidates } — sourceDate is an ISO `YYYY-MM-DD` string or
   null.

   DEPENDENCIES: none. Pure.

   NON-GOALS: does not parse a PDF `/CreationDate` (that is adapter
   METADATA, handled — and kept separate — by the pdf extractor). Does not
   guess a date that is not written down.
   ============================================================ */

'use strict';

const MONTHS_ID = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  // common abbreviations seen in real documents
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agt: 8, ags: 8, sep: 9, sept: 9, okt: 10, nov: 11, des: 12,
};

function pad(n) { return String(n).padStart(2, '0'); }

function toIso(d, monthName, y) {
  const mo = MONTHS_ID[String(monthName || '').toLowerCase()];
  const day = Number(d);
  const year = Number(y);
  if (!mo || !(day >= 1 && day <= 31) || !(year >= 1900 && year <= 2200)) return null;
  return `${year}-${pad(mo)}-${pad(day)}`;
}

/**
 * @param {string} text  the extracted document text
 * @returns {{ sourceDate: string|null, basis: string|null, confidence: number, candidates: Array<{iso:string, basis:string, weight:number}> }}
 */
export function extractSourceDate(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s.trim()) return { sourceDate: null, basis: null, confidence: 0, candidates: [] };

  const candidates = [];

  // 1. dateline: "<Kota>, <d> <bulan> <yyyy>" — strongest
  const datelineRe = /(^|\n)\s*([A-Z][A-Za-zÀ-ſ.'-]{2,20})\s*,\s*(\d{1,2})\s+([A-Za-zÀ-ſ]{3,12})\s+(\d{4})/g;
  let m;
  while ((m = datelineRe.exec(s)) !== null) {
    const iso = toIso(m[3], m[4], m[5]);
    if (iso) candidates.push({ iso, basis: `dateline "${m[2].trim()}, ${m[3]} ${m[4]} ${m[5]}"`, weight: 0.9 });
  }

  // 2. any Indonesian long date in the body — weaker
  const longRe = /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/gi;
  while ((m = longRe.exec(s)) !== null) {
    const iso = toIso(m[1], m[2], m[3]);
    if (iso && !candidates.some((c) => c.iso === iso)) candidates.push({ iso, basis: `body date "${m[1]} ${m[2]} ${m[3]}"`, weight: 0.5 });
  }

  // 3. ISO date in the body — weakest (rare in these documents)
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = isoRe.exec(s)) !== null) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    const mo = Number(m[2]); const day = Number(m[3]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31 && !candidates.some((c) => c.iso === iso)) {
      candidates.push({ iso, basis: `ISO date "${iso}"`, weight: 0.35 });
    }
  }

  if (!candidates.length) return { sourceDate: null, basis: null, confidence: 0, candidates: [] };
  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates[0];
  return {
    sourceDate: top.iso,
    basis: top.basis,
    confidence: top.weight,
    candidates: Object.freeze(candidates.map((c) => Object.freeze(c))),
  };
}
