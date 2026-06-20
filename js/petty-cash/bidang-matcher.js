/* ============================================================
   BIDANG-MATCHER.JS — resolve a free-text unit name to a bidang
   (v1.15.0 — Analytics Expansion Foundation)

   The Petty Cash expense form has no dedicated "Bidang" field. When a
   user picks Unit = "Others" and types a Nama Unit (e.g. "Humas",
   "Sekretariat"), we match that text against the platform's bidang user
   roster (role = 'bidang') and store the resolved { bidangId, bidangName }
   as analytics metadata on the expense. This keeps the form simple, reduces
   typos, and lets Analytics Petty Cash rank Top Bidang accurately.

   Matching strategy: exact (normalized) → fuzzy (Levenshtein ratio ≥
   threshold) → null fallback when nothing is confident enough.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

/** Normalize for comparison: lowercase, strip punctuation, collapse spaces. */
export function normalizeBidang(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[._/\\,;:()\[\]{}'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein edit distance (iterative, O(n·m)). */
function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array(lb + 1);
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

/** Similarity ratio in [0,1] (1 = identical). */
function similarity(a, b) {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Token-prefix coverage: every query token (≥3 chars) is a prefix of a distinct
 * candidate token. Handles abbreviations like "Hub. Internasional" →
 * "Hubungan Internasional". Returns true only for a confident multi-token cover.
 */
function tokenPrefixMatch(q, cand) {
  const qt = q.split(' ').filter(t => t.length >= 3);
  const ct = cand.split(' ').filter(Boolean);
  if (qt.length === 0 || qt.length > ct.length) return false;
  const used = new Array(ct.length).fill(false);
  for (const t of qt) {
    const idx = ct.findIndex((c, i) => !used[i] && c.startsWith(t));
    if (idx === -1) return false;
    used[idx] = true;
  }
  return true;
}

/**
 * Resolve free-text to a bidang from the roster.
 * @param {string} text - the typed Nama Unit
 * @param {Array<{id:string,name:string}>} roster - bidang users
 * @param {{threshold?:number}} [opts] - min fuzzy similarity (default 0.82)
 * @returns {{bidangId:string|null, bidangName:string|null, matchType:'exact'|'fuzzy'|'none', score:number}}
 */
export function matchBidang(text, roster, { threshold = 0.82 } = {}) {
  const q = normalizeBidang(text);
  const list = Array.isArray(roster) ? roster : [];
  if (!q || list.length === 0) {
    return { bidangId: null, bidangName: null, matchType: 'none', score: 0 };
  }
  // 1) Exact (normalized) match wins outright.
  for (const b of list) {
    if (normalizeBidang(b.name) === q) {
      return { bidangId: b.id ?? null, bidangName: b.name, matchType: 'exact', score: 1 };
    }
  }
  // 2) Best fuzzy match above threshold. Also accept clear substring containment
  //    (e.g. "humas pbsi" ⊇ "humas") which Levenshtein ratio under-scores.
  let best = null;
  for (const b of list) {
    const cand = normalizeBidang(b.name);
    if (!cand) continue;
    let score = similarity(q, cand);
    if (q.includes(cand) || cand.includes(q)) {
      score = Math.max(score, 0.9);
    }
    if (tokenPrefixMatch(q, cand)) {
      score = Math.max(score, 0.88);
    }
    if (!best || score > best.score) best = { b, score };
  }
  if (best && best.score >= threshold) {
    return { bidangId: best.b.id ?? null, bidangName: best.b.name, matchType: 'fuzzy', score: best.score };
  }
  return { bidangId: null, bidangName: null, matchType: 'none', score: best ? best.score : 0 };
}

/** Fixed operational units — never carry a derivable bidang on the `unit` field. */
const FIXED_UNITS = new Set(['Engineering', 'Cleaning Service', 'Others']);

/**
 * Resolve an expense's bidang for analytics, HYBRID strategy:
 *
 *   Priority 1 — explicit analytics metadata (bidangName/bidangId) captured at
 *                entry time (new transactions).
 *   Priority 2 — derive from the transaction's text fields (legacy/historic
 *                records that predate the metadata) by matching against the
 *                bidang roster: unitName → customUnit → unit (non-fixed) →
 *                notes → description. First confident match wins.
 *
 * This lets ALL historic transactions enter bidang analytics without a data
 * migration. Reusable engine — used by Analytics Petty Cash, Executive, the
 * PDF export, and future dashboard widgets. NOT to be reimplemented in views.
 *
 * @param {Object} expense
 * @param {Array<{id:string,name:string}>} bidangRoster
 * @param {{threshold?:number}} [opts]
 * @returns {{bidangId:string|null, bidangName:string|null,
 *   matchType:'metadata'|'derived'|'none', source:string|null}}
 */
export function resolveBidang(expense, bidangRoster, opts = {}) {
  if (!expense) return { bidangId: null, bidangName: null, matchType: 'none', source: null };

  // Priority 1 — explicit metadata.
  if (expense.bidangName) {
    return { bidangId: expense.bidangId || null, bidangName: expense.bidangName, matchType: 'metadata', source: 'metadata' };
  }

  // Priority 2 — derive from text fields (structured first, then free text).
  const candidates = [
    ['unitName', expense.unitName],
    ['customUnit', expense.customUnit],
    ['unit', FIXED_UNITS.has(expense.unit) ? '' : expense.unit],
    ['notes', expense.notes],
    ['description', expense.description],
  ];
  for (const [source, text] of candidates) {
    if (!text || !String(text).trim()) continue;
    const m = matchBidang(text, bidangRoster, opts);
    if (m.bidangName) {
      return { bidangId: m.bidangId, bidangName: m.bidangName, matchType: 'derived', source };
    }
  }
  return { bidangId: null, bidangName: null, matchType: 'none', source: null };
}
