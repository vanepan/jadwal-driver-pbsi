/* alias-engine-check.mjs — validates the hardened Alias Engine (v1.16.4.10).
   Covers: safe key derivation, custom alias validation, illegal RTDB chars,
   merge, undo merge, confidence score, audit log. Pure (no Firebase/DOM).
   Run: node scripts/alias-engine-check.mjs   (exit 0 = all pass) */
import {
  rtdbSafeKey, decodeSafeKey, hasIllegalKeyChar, normalizeBase,
  normalizeCanonical, validateCustomAlias,
  aliasConfidence, classifyConfidence,
  ALIAS_AUDIT, buildAliasEntry, aliasSaveAction, applyAlias, removeAlias,
} from '../js/analytics/engines/alias-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const RTDB_ILLEGAL = ['.', '#', '$', '/', '[', ']'];
const keyIsSafe = (k) => !RTDB_ILLEGAL.some((c) => String(k).includes(c));

console.log('Phase A — RTDB-safe key derivation:');
// The exact spec example that used to throw.
const ex = 'RS EKA Hospital Cibubur / kontrol';
check('illegal-char name yields a safe key', keyIsSafe(rtdbSafeKey(ex)));
check('every illegal char is encoded away', RTDB_ILLEGAL.every((c) => keyIsSafe(rtdbSafeKey(`a${c}b`))));
check('encoding is reversible (round-trips to normalized base)',
  decodeSafeKey(rtdbSafeKey(ex)) === normalizeBase(ex));
check('deterministic (same input → same key)', rtdbSafeKey(ex) === rtdbSafeKey(ex));
// Backward compatibility: clean names produce the legacy normalized string.
check('clean name is a no-op (backward compatible)', rtdbSafeKey('Pelatnas Cipayung') === 'pelatnas cipayung');
check('clean name with % preserved (legacy key untouched)', rtdbSafeKey('Diskon 50%') === 'diskon 50%');
check('collision resistance: PB/SI ≠ PBSI', rtdbSafeKey('PB/SI') !== rtdbSafeKey('PBSI'));
check('hasIllegalKeyChar detects slash', hasIllegalKeyChar('a/b') === true);
check('hasIllegalKeyChar false for clean', hasIllegalKeyChar('Hotel Santika') === false);

console.log('\nPhase B — custom alias validation + canonical normalization:');
check('empty is invalid', validateCustomAlias('').valid === false);
check('whitespace-only is invalid', validateCustomAlias('   ').valid === false);
check('only dashes/dots is invalid', validateCustomAlias(' - _ . ').valid === false);
check('single char is invalid', validateCustomAlias('a').valid === false);
check('real value is valid', validateCustomAlias('RS Eka Hospital Cibubur').valid === true);
check('casing variants → same canonical (lower)',
  validateCustomAlias('rs eka hospital cibubur').value === 'RS Eka Hospital Cibubur');
check('casing variants → same canonical (upper)',
  validateCustomAlias('RS EKA HOSPITAL CIBUBUR').value === 'RS Eka Hospital Cibubur');
check('acronym RS preserved, EKA title-cased', normalizeCanonical('rs eka') === 'RS Eka');
check('hyphenated tokens title-cased per piece', normalizeCanonical('sudirman-thamrin') === 'Sudirman-Thamrin');

console.log('\nPhase E — confidence model (deterministic, no AI):');
const cNear = aliasConfidence('RS EKA Hospital Cibubur', 'RS Eka Hospital Cibubur');
check('near-identical ≥ 90 (Sangat Yakin)', cNear.score >= 90 && cNear.band === 'sangat-yakin');
const cAbbrev = aliasConfidence('Pelatnas Cipayung', 'PBSI Cipayung');
check('partial/abbrev pair lands 50–89', cAbbrev.score >= 50 && cAbbrev.score < 90);
const cFar = aliasConfidence('Bandara Soekarno Hatta', 'Hotel Santika');
check('unrelated < 50 (Jangan Sarankan)', cFar.score < 50 && cFar.recommend === false);
check('identical → 100', aliasConfidence('Gedung A', 'gedung a').score === 100);
check('classifyConfidence bands', classifyConfidence(95).band === 'sangat-yakin'
  && classifyConfidence(75).band === 'mungkin-sama'
  && classifyConfidence(55).band === 'perlu-review'
  && classifyConfidence(20).band === 'jangan');
check('low band is not recommended', classifyConfidence(20).recommend === false);

console.log('\nPhase C/D — merge, undo merge, audit log (pure map ops):');
const KEY = rtdbSafeKey(ex);
// CREATE
let map = {};
const e1 = buildAliasEntry({ canonical: 'RS Eka Hospital Cibubur', before: null, who: 'evan', now: '2026-06-24T00:00:00Z' });
check('create action is CREATED', aliasSaveAction(null, null) === ALIAS_AUDIT.CREATED);
map = applyAlias(map, KEY, e1);
check('alias stored under safe key', map[KEY] && map[KEY].canonical === 'RS Eka Hospital Cibubur');
// MERGE (source name recorded, non-destructive provenance)
const e2 = buildAliasEntry({ canonical: 'RS Eka Hospital Cibubur', before: null, who: 'evan', sourceName: ex });
check('merge action is MERGED', aliasSaveAction(null, ex) === ALIAS_AUDIT.MERGED);
check('merge records non-destructive source provenance', e2.mergedFrom === ex);
// UPDATE preserves original creation metadata
const e3 = buildAliasEntry({ canonical: 'RS Eka Hospital', before: e1, who: 'lia', now: '2026-06-25T00:00:00Z' });
check('update action is UPDATED', aliasSaveAction(e1, null) === ALIAS_AUDIT.UPDATED);
check('update preserves createdAt/createdBy', e3.createdAt === e1.createdAt && e3.createdBy === 'evan');
check('update stamps updatedBy', e3.updatedBy === 'lia');
// UNDO (remove restores source resolution; map immutability respected)
const after = removeAlias(map, KEY);
check('undo removes mapping (source resolves to itself)', !(KEY in after));
check('removeAlias does not mutate input', KEY in map);
check('audit action codes present', ALIAS_AUDIT.RESTORED === 'alias_restored' && ALIAS_AUDIT.DELETED === 'alias_deleted');

console.log(`\nalias-engine-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
