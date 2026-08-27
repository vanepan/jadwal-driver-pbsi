/* settings-numeric-bounds-check.mjs — Design System Program Phase 11 (Administration)

   P3 cleanup item from the Phase 11 Administration audit: every numeric
   field in the "Konfigurasi Global" / Settings V2 screen
   (renderV2AdminConfig(), js/app.js) validated a LOWER bound only
   (min="1"/min="0" + a "tidak boleh negatif"/"harus lebih dari 0" guard) —
   nothing stopped an accidental extra digit from silently saving an
   absurd value (e.g. a 20,000,000km odometer-jump threshold, which would
   never fire the anomaly flag it exists to raise). Fixed for all 5 fields:
   odometer jump (km), Recovery Buffer (menit), Ambang Batas Perubahan
   Jadwal (menit), Notification Debounce (detik), Retensi Backup (hari).

   Method: static source inspection of js/app.js (zero exports — see
   [[design-system-program]] memory; a live DOM assertion of the actual
   toast text would need to intercept showToast(), which is more moving
   parts than this fix warrants). Confirms both the HTML max= hint and the
   JS-side guard that actually enforces it (the HTML attribute alone does
   not block a script-driven .value write or a submit that bypasses it).

   Run: node scripts/settings-numeric-bounds-check.mjs (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Settings screen — upper-bound numeric validation (P3)\n');

check('cfgOdometerWarn has max="50000" in its markup', /id="cfgOdometerWarn"[^>]*max="50000"/.test(appJs));
check('cfgSaveOps rejects an odometer value above 50000', /newOdom > 50000\) \{\s*\n\s*showToast\('Batas lompatan odometer terlalu besar/.test(appJs));

check('cfgRecoveryBuffer has max="1440" in its markup', /id="cfgRecoveryBuffer"[^>]*max="1440"/.test(appJs));
check('cfgSaveNotif rejects a Recovery Buffer above 1440', /newRecoveryBuffer > 1440\) \{ showToast\('Recovery Buffer terlalu besar/.test(appJs));

check('cfgAssignmentThreshold has max="1440" in its markup', /id="cfgAssignmentThreshold"[^>]*max="1440"/.test(appJs));
check('cfgSaveNotif rejects an Ambang Batas Perubahan Jadwal above 1440', /newThreshold > 1440\) \{ showToast\('Ambang Batas Perubahan Jadwal terlalu besar/.test(appJs));

check('cfgNotifDebounce has max="3600" in its markup', /id="cfgNotifDebounce"[^>]*max="3600"/.test(appJs));
check('cfgSaveNotif rejects a Notification Debounce above 3600', /newDebounceSec > 3600\) \{ showToast\('Notification Debounce terlalu besar/.test(appJs));

check('cfgBackupDays has max="365" in its markup', /id="cfgBackupDays"[^>]*max="365"/.test(appJs));
check('cfgSaveSystem rejects a Retensi Backup above 365', /newDays > 365\) \{\s*\n\s*showToast\('Retensi backup terlalu besar/.test(appJs));

// Regression: the pre-existing lower-bound guards must still be intact —
// this fix is strictly additive, never a replacement of the floor checks.
check('lower-bound guard on odometer is unchanged (regression)', /newOdom < 1\) \{/.test(appJs));
check('lower-bound guard on Recovery Buffer is unchanged (regression)', /newRecoveryBuffer < 0\) \{ showToast\('Recovery Buffer tidak boleh negatif/.test(appJs));
check('lower-bound guard on Retensi Backup is unchanged (regression)', /newDays < 1\) \{/.test(appJs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
