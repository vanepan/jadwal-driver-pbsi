/* ============================================================
   CERTIFICATION-GATE.JS — Certified Retrieval → NOR Generation
   (V2, Phase 6)

   PURPOSE: the ONE explicit, deterministic generation gate (§6). It reads a
   Phase 5.x.7 `nor-retrieval-context@1` result and decides whether — and
   how — the NOR generator may proceed. It is the single place that maps
   the certified-retrieval state onto a generation decision.

   HARD RULES:
     • Deterministic. Same retrieval context ⇒ same outcome (§6, §23).
     • It NEVER inspects a confidence value, a frequency, a document count,
       a recency, or an evidence bag to decide authority (§6, §7, §17, §25).
       Certification is determined by the retrieval contract; the gate only
       reads `certification.status` and the two per-domain statuses.
     • Fail closed. `unavailable` and `conflict` always BLOCK (§9, §10).
     • Phase 6 HYBRID incomplete policy (product decision, §8):
         – Style Guide domain `missing`  → ALLOWED_WITH_FALLBACK
           (wording defaults are low-risk; a visible warning is raised — §37).
         – Visual Template domain `missing` → BLOCKED_INCOMPLETE
           (the official document's physical layout must not be guessed).

   RESPONSIBILITY: evaluateGenerationContext(retrievalContext) →
     { outcome, status, blocked, reasons: string[],
       styleAuthorityUsable, visualAuthorityUsable, styleFallback, visualFallback }

   DEPENDENCIES: ./contracts/generation-context-contract.js
   (GENERATION_GATE_OUTCOME, generationStatusForGate),
   ../retrieval/contracts/nor-retrieval-contract.js
   (RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS). PURE — no I/O,
   no DOM, no Firebase, no secret, no model.
   ============================================================ */

'use strict';

import {
  GENERATION_GATE_OUTCOME, generationStatusForGate, isBlockedGateOutcome,
} from './contracts/generation-context-contract.js';
import {
  RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS, isNorRetrievalContext,
} from '../retrieval/contracts/nor-retrieval-contract.js';

const C = RETRIEVAL_CERTIFICATION_STATUS;
const D = RETRIEVAL_DOMAIN_STATUS;
const G = GENERATION_GATE_OUTCOME;

function domainStatus(node) {
  return node && typeof node === 'object' && typeof node.status === 'string' ? node.status : null;
}

/**
 * @param {import('../retrieval/contracts/nor-retrieval-contract.js').NorRetrievalContext} retrievalContext
 * @returns {{
 *   outcome: string, status: string, blocked: boolean, reasons: string[],
 *   styleAuthorityUsable: boolean, visualAuthorityUsable: boolean,
 *   styleFallback: boolean, visualFallback: boolean
 * }}
 */
export function evaluateGenerationContext(retrievalContext) {
  const reasons = [];

  // A malformed / absent retrieval context is a HARD BLOCK — the generator
  // may never proceed on a context it cannot trust (§6, §10).
  if (!isNorRetrievalContext(retrievalContext)) {
    return decision(G.BLOCKED_INCOMPLETE, [
      'The certified retrieval context is missing or malformed; generation cannot proceed.',
    ], { styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false });
  }

  const cert = retrievalContext.certification || {};
  const certStatus = cert.status;
  const sgStatus = domainStatus(cert.styleGuide);
  const vtStatus = domainStatus(cert.visualTemplate);

  // Carry the retrieval's own explanation through, deterministically.
  for (const r of Array.isArray(cert.reasons) ? cert.reasons : []) reasons.push(String(r));

  /* ── 1. unavailable — a required authoritative subsystem could not be
        queried. No OpenAI, no guessed style, no guessed layout (§10). ── */
  if (certStatus === C.UNAVAILABLE || sgStatus === D.UNAVAILABLE || vtStatus === D.UNAVAILABLE) {
    reasons.push('Certified organizational context was unavailable — a required authority subsystem could not be queried.');
    return decision(G.BLOCKED_UNAVAILABLE, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
    });
  }

  /* ── 2. conflict — multiple incompatible approved rules/templates. The
        generator must NOT pick a side (§9). Block; disclose the conflict. ── */
  if (certStatus === C.CONFLICT || sgStatus === D.CONFLICT || vtStatus === D.CONFLICT) {
    reasons.push('Generation blocked: an organizational convention is currently conflicting. No side was chosen.');
    return decision(G.BLOCKED_CONFLICT, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
    });
  }

  /* ── 3. HYBRID §8 — a missing approved Visual Template BLOCKS a NOR
        generation. The official document's physical layout is never
        guessed; a human must approve a template first. ── */
  if (vtStatus === D.MISSING) {
    reasons.push('Generation blocked: no approved Visual Template exists for this document type. '
      + 'The official layout must be approved by a human before Intelligence generation.');
    return decision(G.BLOCKED_INCOMPLETE, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: true,
    });
  }

  /* ── 4. HYBRID §8 — a missing approved Style Guide is a SAFE degrade:
        generate with an explicit deterministic fallback for wording, and a
        visible review warning (§37). The visual layout is still an approved
        template (vtStatus === resolved here). ── */
  if (sgStatus === D.MISSING) {
    reasons.push('No approved Style Guide rule exists for one or more wording slots; '
      + 'the established deterministic NOR wording was used. This output is not certified for those slots.');
    return decision(G.ALLOWED_WITH_FALLBACK, reasons, {
      styleAuthorityUsable: false, visualAuthorityUsable: true, styleFallback: true, visualFallback: false,
    });
  }

  /* ── 5. both domains resolved ⇒ certified generation. Approved wording +
        approved layout. (A `resolved` Style Guide domain with zero matching
        rules for a slot is still ALLOWED — that slot uses a deterministic
        DEFAULT, not a fallback: nothing approved is overridden.) ── */
  if (sgStatus === D.RESOLVED && vtStatus === D.RESOLVED) {
    if (certStatus !== C.CERTIFIED) {
      // Defensive: the 5.x.7 contract says both-resolved ⇒ certified. If the
      // pieces disagree, fail closed rather than over-claim.
      reasons.push('Retrieval domains resolved but overall certification is not `certified`; generation blocked.');
      return decision(G.BLOCKED_INCOMPLETE, reasons, {
        styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
      });
    }
    reasons.push('Every authoritative component resolved from approved organizational sources without conflict.');
    return decision(G.ALLOWED, reasons, {
      styleAuthorityUsable: true, visualAuthorityUsable: true, styleFallback: false, visualFallback: false,
    });
  }

  /* ── 6. anything left (e.g. an explicitly requested style slot that is
        `missing` while the domain is not) — fail closed. ── */
  reasons.push('The certified retrieval context is incomplete in a way that has no safe deterministic default; generation blocked.');
  return decision(G.BLOCKED_INCOMPLETE, reasons, {
    styleAuthorityUsable: false, visualAuthorityUsable: false, styleFallback: false, visualFallback: false,
  });
}

function decision(outcome, reasons, flags) {
  const deduped = [...new Set(reasons.map(String))];
  return Object.freeze({
    outcome,
    status: generationStatusForGate(outcome),
    blocked: isBlockedGateOutcome(outcome),
    reasons: Object.freeze(deduped),
    styleAuthorityUsable: flags.styleAuthorityUsable === true,
    visualAuthorityUsable: flags.visualAuthorityUsable === true,
    styleFallback: flags.styleFallback === true,
    visualFallback: flags.visualFallback === true,
  });
}
