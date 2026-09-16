/* ============================================================
   agenda-identity-colors.js — SS9 R1: person-based visual identity
   colors for Agenda/Calendar/To-Do.

   PURE, no DOM, no Firebase — mirrors js/utils/vehicle-identity.js's
   own shape (stable sort -> index -> fixed rotation) for the unbounded
   "any other staff member" case. Colors are PRESENTATION ONLY: this
   module never reads or writes permissions, roles, or authorization —
   it only ever returns a CSS var() string.

   Known staff (Grace/Evan/Leo) get a fixed, centrally-configured color
   here — this is a presentation preference table, not an authorization
   list; nothing here gates visibility, access, or any permission check
   (see js/agenda/agenda-permissions.js for the real gate, untouched by
   this file). Kabid is a SCOPE (agenda-directory.js's
   resolveParticipantClass() 'kabid' bucket), not a person, so it is
   colored by scope, independent of which specific person currently
   holds that role — deliberately NOT a per-username entry, since the
   set of people classified as Kabid can change over time without this
   file ever needing an edit.

   Any Sarpras staff member not in the known table gets a deterministic
   rotation color instead (same technique buildVehicleShapeMap() already
   established for vehicles) — new staff are never left uncolored, and
   are never assigned the same color as Grace/Evan/Leo/Kabid.
   ============================================================ */

'use strict';

/** username (lowercase) -> the CSS var() this person always resolves to.
 *  Centralized here, in ONE place, per the brief's own requirement — no
 *  other file should duplicate this table. */
const KNOWN_PERSON_VAR = {
  grace: '--id-grace',
  evan: '--id-evan',
  leo: '--id-leo',
};

/** Rotation for any staff member NOT in KNOWN_PERSON_VAR, assigned by
 *  stable sorted position (never by insertion/render order) so the same
 *  person always lands on the same color across renders/sessions. */
const FALLBACK_VARS = ['--id-fb1', '--id-fb2', '--id-fb3'];

function normalizeUsername(username) {
  return String(username == null ? '' : username).trim().toLowerCase();
}

/**
 * Build username -> "var(--id-...)" for every candidate in one stable
 * pass. Call once per render with the full roster
 * (agenda-directory.js#getAgendaCandidates()'s output, which already
 * carries each person's own scope — 'sarpras_shared'|'kabid') and reuse
 * the map for every dot/chip in that render — never re-derive per row.
 * A candidate whose OWN scope is 'kabid' always resolves to --id-kabid,
 * ahead of the known-name table or the rotation — the Kabid scope's
 * color represents the departmental role, not the specific person, so
 * it wins regardless of who currently holds it.
 * @param {Array<{username:string, scope?:string}>} candidates
 * @returns {Record<string,string>}
 */
export function buildAgendaIdentityColorMap(candidates) {
  const map = {};
  const sorted = [...(candidates || [])]
    .filter((c) => c && c.username)
    .sort((a, b) => normalizeUsername(a.username).localeCompare(normalizeUsername(b.username)));
  let fallbackIndex = 0;
  for (const c of sorted) {
    const key = normalizeUsername(c.username);
    if (!key || map[key]) continue;
    if (c.scope === 'kabid') { map[key] = 'var(--id-kabid)'; continue; }
    if (KNOWN_PERSON_VAR[key]) { map[key] = `var(${KNOWN_PERSON_VAR[key]})`; continue; }
    map[key] = `var(${FALLBACK_VARS[fallbackIndex % FALLBACK_VARS.length]})`;
    fallbackIndex++;
  }
  return map;
}

/**
 * Resolve ONE person's identity color.
 * @param {string} username
 * @param {Record<string,string>} [colorMap] from buildAgendaIdentityColorMap();
 *   omit only for a known name looked up before a full roster is available.
 * @param {{isKabid?: boolean}} [opts] isKabid (participant's scope === 'kabid',
 *   from agenda-directory.js#resolveParticipantClass()) always wins — the
 *   Kabid scope's color represents the departmental role, not one person.
 * @returns {string} a CSS var() string, always non-empty (safe fallback
 *   for an unknown/unclassified identity).
 */
export function agendaIdentityColorVar(username, colorMap, opts = {}) {
  if (opts && opts.isKabid) return 'var(--id-kabid)';
  const key = normalizeUsername(username);
  if (KNOWN_PERSON_VAR[key]) return `var(${KNOWN_PERSON_VAR[key]})`;
  if (colorMap && colorMap[key]) return colorMap[key];
  return `var(${FALLBACK_VARS[0]})`;
}
