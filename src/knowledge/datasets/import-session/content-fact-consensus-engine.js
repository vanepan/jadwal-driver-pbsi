/* ============================================================
   CONTENT-FACT-CONSENSUS-ENGINE.JS — Evidence-First Ingestion (V2, Part B1)

   PURPOSE: this is the ONE new piece of reasoning the evidence-first
   ingestion architecture adds — a pure, deterministic majority-vote over
   PRIOR real values of a content-fact field within the same domain, used
   only when the document ITSELF could not answer the question (content-
   fact-extraction-engine.js found nothing, and no filename floor applies).
   No AI, no fuzzy matching, no invented number — a plain frequency count
   over real prior facts, same "deterministic count/mean over repository
   data" discipline pattern-discovery-engine.js's own recurring-count
   producers already established (RECURRING_THRESHOLD=2,
   confidence=min(1,count/5)) — this engine reuses that idiom's SPIRIT but
   is deliberately STRICTER (MIN_CONSENSUS_SUPPORT=3,
   MIN_CONSENSUS_AGREEMENT=0.8), because its output is used to WRITE a fact
   with no further human confirmation, not merely to surface a reviewable
   suggestion — a higher bar for a bigger claim.

   WHY ONLY senderOrigin, NEVER documentNumber OR value: a document's own
   number and its own subject line are IRREDUCIBLY per-document facts —
   guessing one from a sibling document's number/subject would be
   fabrication, not inference, no matter how many prior documents agree
   with each other (they cannot agree with THIS document, which nobody has
   read). senderOrigin is different: which organizational unit typically
   originates a given domain's documents is a genuine, evidence-backed
   organizational fact that can recur correctly across many real documents
   — the same reasoning profile-engine.js's own PROFILE_TYPE.SIGNATORY/
   RECIPIENT categories already rely on for other fields. See the caller
   (dataset-import-center.js#processOneFile) for which field this is
   actually wired to.

   WHY THIS DOES NOT READ APPROVED "signatory"/"rule" KNOWLEDGE: investigated
   and deliberately rejected as an evidence source for THIS purpose. Those
   bootstrap facts (knowledge/bootstrap/*.js) describe who SHOULD sign a
   document composed TODAY — a compose-time policy that this codebase's own
   evidence already shows drifts over time (a documented Kabid Sarpras
   transition from one name to another). Trusting it to auto-fill a
   HISTORICAL uploaded document's actual "Dari" line would silently
   mis-fill any document predating the most recent transition — a real
   correctness risk, not a style nuance. The empirical, historically-
   weighted majority vote below is self-correcting instead: a real
   administration change shows up as reduced agreement (two real values
   splitting the vote), which honestly fails MIN_CONSENSUS_AGREEMENT and
   defers to a human, rather than confidently asserting the wrong era's
   answer.

   THE AVAILABILITY RULE (mirrors import-confidence-engine.js's own):
   insufficient evidence is a NEUTRAL, honestly-reported non-result
   (eligible:false), never a punitive or fabricated guess.

   RESPONSIBILITY: computeFieldConsensus(priorValues) — pure. The CALLER
   (dataset-import-center.js, the one layer allowed to read both knowledge/
   Import Sessions and organizational-memory/ ArchiveRecords) gathers the
   real prior values and hands them to this engine as plain strings —
   keeping this file trivially unit-testable with no repository/Firebase
   dependency, same shape as import-confidence-engine.js's own contract.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** Below this many prior documents, "consensus" is indistinguishable from
 *  coincidence — a single occurrence is an event, not yet a pattern (same
 *  phrase pattern-discovery-engine.js's own RECURRING_THRESHOLD comment
 *  uses), and this engine's bar is intentionally higher than that one's
 *  (2) because its result is written with no further human confirmation. */
export const MIN_CONSENSUS_SUPPORT = 3;

/** Below this share of agreement among prior values, the evidence is
 *  genuinely split (e.g. a real organizational transition mid-corpus) and
 *  auto-accepting the majority would be a guess dressed as a fact. */
export const MIN_CONSENSUS_AGREEMENT = 0.8;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {(string|null|undefined)[]} priorValues - real values already recorded on prior documents in the same domain (e.g. ArchiveRecord.senderOrigin) — never fabricated, never sampled/estimated
 * @returns {{
 *   value: string, supportCount: number, totalCount: number, agreement: number,
 *   confidence: number, eligible: boolean, rationale: string,
 * }}
 */
export function computeFieldConsensus(priorValues) {
  const values = (Array.isArray(priorValues) ? priorValues : [])
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  const totalCount = values.length;

  if (totalCount === 0) {
    return {
      value: '', supportCount: 0, totalCount: 0, agreement: 0, confidence: 0, eligible: false,
      rationale: 'Belum ada dokumen sejenis di domain ini yang pernah diarsipkan — tidak ada riwayat untuk dibandingkan.',
    };
  }

  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let bestValue = '';
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { bestValue = v; bestCount = c; }
  }
  const agreement = round2(bestCount / totalCount);
  const eligible = totalCount >= MIN_CONSENSUS_SUPPORT && agreement >= MIN_CONSENSUS_AGREEMENT;

  let rationale;
  if (eligible) {
    rationale = `${bestCount} dari ${totalCount} dokumen sejenis di domain ini sebelumnya memiliki nilai yang sama ("${bestValue}") — cukup konsisten untuk dijadikan bukti otomatis.`;
  } else if (totalCount < MIN_CONSENSUS_SUPPORT) {
    rationale = `Baru ${totalCount} dokumen sejenis di domain ini yang diarsipkan — belum cukup riwayat untuk dijadikan bukti otomatis (minimum ${MIN_CONSENSUS_SUPPORT}).`;
  } else {
    rationale = `Dokumen sejenis di domain ini punya nilai yang beragam untuk bidang ini (kecocokan tertinggi ${Math.round(agreement * 100)}% dari ${totalCount} dokumen, di bawah ambang ${Math.round(MIN_CONSENSUS_AGREEMENT * 100)}%) — tidak cukup meyakinkan untuk diisi otomatis, perlu konfirmasi Anda.`;
  }

  return {
    value: bestValue, supportCount: bestCount, totalCount, agreement,
    confidence: eligible ? agreement : 0, eligible, rationale,
  };
}
