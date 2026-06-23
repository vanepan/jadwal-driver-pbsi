/* ============================================================
   ALIAS-ENGINE.JS — Hardened alias key + normalization + confidence
   (v1.16.4.10 — Alias Engine Hardening)

   Pure, DOM-free, Firebase-free. The single source of truth for:
     • rtdbSafeKey()        RTDB-safe, deterministic, reversible,
                            collision-resistant key derivation.
     • decodeSafeKey()      inverse of rtdbSafeKey (for audit/debug).
     • normalizeCanonical() casing-stable canonical display value.
     • validateCustomAlias()custom-value reliability guard.
     • aliasConfidence()    deterministic 0–100 "are these the same?"
                            score (NO AI / API / LLM) + classification.

   Imported by analytics-engine.js (key derivation) and app.js (save /
   merge / validation / confidence UI), and exercised in isolation by
   scripts/alias-engine-check.mjs. Mirrors the pure-engine pattern of
   workload-engine.js.

   ROOT CAUSE this module fixes: the previous _normDestKey() emitted the
   normalized destination string DIRECTLY as a Firebase RTDB child key.
   RTDB rejects keys containing  .  #  $  /  [  ]  — so saving an alias
   for a name like "RS EKA Hospital Cibubur / kontrol" threw inside
   firebase.set() ("Gagal menyimpan alias"). rtdbSafeKey() encodes those
   characters reversibly so any human-entered name is storable.
   ============================================================ */

'use strict';

/* ── RTDB-illegal characters (Firebase Realtime Database key rules) ── */
const RTDB_ILLEGAL = ['.', '#', '$', '/', '[', ']'];
/** Escape introducer for the reversible encoding. RTDB-legal; rare in names. */
const ESC = '*';
const ILLEGAL_RE = /[.#$/[\]]/;           // detect any illegal char
const ENCODE_RE  = /[*.#$/[\]]/g;         // chars to encode (illegal + ESC)
const DECODE_RE  = /\*([0-9a-f]{2})/g;    // ESC + 2 hex digits

/**
 * Lowercased, whitespace/dash-collapsed normalization base. This is the
 * MATCHING form (used for similarity + as the pre-encoding key base). Kept
 * byte-identical to the historical _normDestKey body so that, for names
 * WITHOUT illegal characters, the derived key is unchanged → every alias
 * stored before this release keeps resolving (backward compatible).
 * @param {string} name
 * @returns {string}
 */
export function normalizeBase(name) {
  return String(name == null ? '' : name)
    .trim()
    .toLowerCase()
    .replace(/[–—‒‐﹘﹣－]/g, '-')   // unify dash variants → '-'
    .replace(/\s*-\s*/g, '-')        // collapse spaced dashes
    .replace(/\s+/g, ' ')            // collapse whitespace
    .replace(/[.,;]+$/g, '')         // strip trailing punctuation
    .trim();
}

/**
 * Derive an RTDB-safe key from a name.
 *
 * Properties:
 *  • RTDB-safe          never emits . # $ / [ ] (or control chars).
 *  • Deterministic      same input → same output, always.
 *  • Reversible         decodeSafeKey() recovers the normalized base.
 *  • Collision-resistant the encoding is injective on the normalized base.
 *  • Backward compatible for any name without an illegal char the output
 *                       equals the legacy normalized string verbatim, so
 *                       pre-existing stored keys are untouched.
 *
 * Strategy: when the normalized base contains no illegal character it is
 * returned unchanged (the overwhelmingly common case — and the only case
 * that could ever have been persisted before this fix). When an illegal
 * character is present (a name that was previously UNSAVEABLE, so no stored
 * key can exist for it) each illegal char AND any literal ESC is replaced
 * with `*` + two-hex-digit code, which is fully reversible.
 *
 * @param {string} name
 * @returns {string}
 */
export function rtdbSafeKey(name) {
  const base = normalizeBase(name);
  if (!ILLEGAL_RE.test(base)) return base; // no-op fast path (preserves legacy keys)
  return base.replace(ENCODE_RE, (ch) => ESC + ch.charCodeAt(0).toString(16).padStart(2, '0'));
}

/**
 * Inverse of rtdbSafeKey() → the normalized base (lowercased). Useful for
 * audit/debug rendering of a stored key. Safe on un-encoded keys (returns
 * them unchanged).
 * @param {string} key
 * @returns {string}
 */
export function decodeSafeKey(key) {
  return String(key == null ? '' : key)
    .replace(DECODE_RE, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** True when a name contains a character RTDB cannot store as a raw key. */
export function hasIllegalKeyChar(name) {
  return RTDB_ILLEGAL.some((c) => String(name == null ? '' : name).includes(c));
}

/* ── Canonical display normalization (Phase B3) ──────────────────────────────
   Different casings of the same name must collapse to ONE canonical display
   value. Title-Cases each word, but preserves known acronyms (RS, PBSI, …) in
   uppercase. Deterministic given ACRONYMS. Example:
     "RS Eka Hospital Cibubur" | "rs eka hospital cibubur" |
     "RS EKA HOSPITAL CIBUBUR"  →  "RS Eka Hospital Cibubur". */
export const ACRONYMS = new Set([
  'RS', 'RSU', 'RSUD', 'PBSI', 'ATK', 'NOR', 'BBM', 'PIC', 'VVIP', 'VIP',
  'PB', 'KONI', 'DKI', 'GBK', 'TMII', 'AC', 'PLN', 'PDAM', 'IT', 'HR',
]);

/**
 * Normalize an arbitrary name to its canonical display form.
 * @param {string} name
 * @returns {string}
 */
export function normalizeCanonical(name) {
  const cleaned = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.split(' ').map((word) => {
    // Preserve hyphenated tokens piece-by-piece (e.g. "sudirman-thamrin").
    return word.split('-').map((piece) => {
      if (!piece) return piece;
      const upper = piece.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      // Tokens with internal digits (e.g. "no5", "lt3") stay lowercased base.
      return piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase();
    }).join('-');
  }).join(' ');
}

/* ── Custom alias validation (Phase B2) ──────────────────────────────────────
   A custom canonical value must be real: non-empty and not merely
   punctuation/whitespace ( -  _  .  space … ). */
const MEANINGLESS_RE = /^[\s\-_.]*$/;

/**
 * Validate a user-typed custom canonical value.
 * @param {string} value
 * @returns {{ valid: boolean, reason: string, value: string }}
 */
export function validateCustomAlias(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return { valid: false, reason: 'Nilai kanonik tidak boleh kosong.', value: '' };
  if (MEANINGLESS_RE.test(raw)) {
    return { valid: false, reason: 'Nilai kanonik tidak boleh hanya tanda baca atau spasi.', value: '' };
  }
  if (raw.length < 2) {
    return { valid: false, reason: 'Nilai kanonik terlalu pendek (minimal 2 karakter).', value: '' };
  }
  return { valid: true, reason: '', value: normalizeCanonical(raw) };
}

/* ── Confidence model (Phase E) ──────────────────────────────────────────────
   Deterministic 0–100 "are these two names the same place/entity?" score.
   NO AI, API, or LLM. Combines four signals:
     • char similarity   normalized Levenshtein over the matching base
     • token overlap     Jaccard over word sets (order-independent)
     • abbreviation hit  one name's token set ⊇ an acronym of the other
     • word normalization both reduce to the same canonical → full marks
   Weighted blend, then clamped & classified. */
const CONF_WEIGHTS = { char: 0.40, token: 0.35, abbrev: 0.25 };

/** Levenshtein-ratio similarity (0..1) — same algorithm as the engine's. */
export function charSimilarity(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const dp = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const curr = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j - 1], dp[j], prev);
      dp[j - 1] = prev;
      prev = curr;
    }
    dp[lb] = prev;
  }
  return 1 - dp[lb] / Math.max(la, lb);
}

/** Word-token set of a normalized name (deduplicated, non-empty). */
function tokenSet(name) {
  return new Set(normalizeBase(name).split(/[\s-]+/).filter(Boolean));
}

/**
 * Token overlap (0..1) — the max of Jaccard and asymmetric containment, so a
 * shared *distinctive* token (e.g. a location like "Cipayung") is credited even
 * when the two names differ in length. Containment alone would over-reward
 * single-token subsets, so Jaccard floors it.
 */
function tokenOverlap(a, b) {
  const sa = tokenSet(a), sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  if (inter === 0) return 0;
  const union = sa.size + sb.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  const containment = inter / Math.min(sa.size, sb.size);
  return Math.max(jaccard, containment);
}

/** Initialism of a name (first letter of each token), e.g. "pb si" → "pbsi". */
function initials(name) {
  return [...tokenSet(name)].map((t) => t.charAt(0)).join('');
}

/**
 * Abbreviation signal (0..1): rewards the case where one name is an
 * abbreviation/initialism of the other, or shares a leading acronym token.
 */
function abbreviationScore(a, b) {
  const sa = tokenSet(a), sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  // One side's single token equals the other side's initialism (e.g. "PBSI"
  // vs "Persatuan Bulu tangkis Seluruh Indonesia").
  const initA = initials(a), initB = initials(b);
  if ((sb.has(initA) && initA.length >= 2) || (sa.has(initB) && initB.length >= 2)) return 1;
  // Shared tokens proportion (asymmetric containment) — partial abbreviation.
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  const minSize = Math.min(sa.size, sb.size);
  return minSize === 0 ? 0 : shared / minSize;
}

/**
 * Compute a deterministic confidence that two names denote the same entity.
 * @param {string} a
 * @param {string} b
 * @returns {{ score:number, char:number, token:number, abbrev:number,
 *             band:string, label:string, recommend:boolean }}
 */
export function aliasConfidence(a, b) {
  // Identical canonical form → certain.
  if (normalizeBase(a) === normalizeBase(b) && normalizeBase(a) !== '') {
    return { score: 100, char: 1, token: 1, abbrev: 1, ...classifyConfidence(100) };
  }
  const char   = charSimilarity(normalizeBase(a), normalizeBase(b));
  const token  = tokenOverlap(a, b);
  const abbrev = abbreviationScore(a, b);
  const blended = char * CONF_WEIGHTS.char + token * CONF_WEIGHTS.token + abbrev * CONF_WEIGHTS.abbrev;
  const score = Math.round(Math.max(0, Math.min(1, blended)) * 100);
  return { score, char, token, abbrev, ...classifyConfidence(score) };
}

/* Confidence bands (Phase E2 / F3). `tone` drives the UI colour. */
export const CONFIDENCE_BANDS = [
  { min: 90, band: 'sangat-yakin', label: 'Sangat Yakin', tone: 'green',  recommend: true },
  { min: 70, band: 'mungkin-sama', label: 'Kemungkinan Sama', tone: 'yellow', recommend: true },
  { min: 50, band: 'perlu-review', label: 'Perlu Review', tone: 'red',    recommend: true },
  { min: 0,  band: 'jangan',       label: 'Jangan Sarankan', tone: 'none', recommend: false },
];

/**
 * Classify a 0–100 score into a confidence band.
 * @param {number} score
 * @returns {{ band:string, label:string, tone:string, recommend:boolean }}
 */
export function classifyConfidence(score) {
  const s = Number(score) || 0;
  const b = CONFIDENCE_BANDS.find((x) => s >= x.min) || CONFIDENCE_BANDS[CONFIDENCE_BANDS.length - 1];
  return { band: b.band, label: b.label, tone: b.tone, recommend: b.recommend };
}

/* ── Audit action codes (Phase C1) ───────────────────────────────────────── */
export const ALIAS_AUDIT = {
  CREATED:  'alias_created',
  UPDATED:  'alias_updated',
  MERGED:   'alias_merged',
  DELETED:  'alias_deleted',
  RESTORED: 'alias_restored',
};

/* ── Pure map operations (Phases C/D) ────────────────────────────────────────
   The Firebase-free core of save / merge / undo, so the mutation + provenance +
   audit-classification logic is unit-testable and shared by app.js (the only
   Firebase concern there is persisting the returned map). */

/**
 * Build a stored alias entry, preserving original creation metadata when
 * updating and recording non-destructive merge provenance.
 * @param {Object} p
 * @param {string} p.canonical
 * @param {Object|null} [p.before]    existing entry being replaced
 * @param {string} [p.who]            actor display name
 * @param {string} [p.now]            ISO timestamp
 * @param {string|null} [p.sourceName] raw source name when this is a merge
 * @param {string} [p.reason]
 * @returns {Object} entry
 */
export function buildAliasEntry({ canonical, before = null, who = '', now = new Date().toISOString(), sourceName = null, reason = '' }) {
  return {
    canonical,
    createdAt: (before && before.createdAt) || now,
    createdBy: (before && before.createdBy) || who,
    updatedAt: now,
    updatedBy: who,
    mergedFrom: sourceName || (before && before.mergedFrom) || null,
    mergedAt: now,
    mergedBy: who,
    ...(reason ? { reason } : {}),
  };
}

/** Classify which audit action a save represents. */
export function aliasSaveAction(before, sourceName) {
  if (before) return ALIAS_AUDIT.UPDATED;
  return sourceName ? ALIAS_AUDIT.MERGED : ALIAS_AUDIT.CREATED;
}

/** Return a NEW alias map with key→entry applied (does not mutate input). */
export function applyAlias(map, key, entry) {
  return { ...(map || {}), [key]: entry };
}

/** Return a NEW alias map with key removed (does not mutate input). */
export function removeAlias(map, key) {
  const next = { ...(map || {}) };
  delete next[key];
  return next;
}
