/* document-template-manager-check.mjs — Phase 12, Sprint 12.3
   (Runtime-registrable, validated, versioned design systems — the
   Document Template Manager core).

   The Phase 12 "DOCUMENT TEMPLATE MANAGER" requires administrators to add
   new document layouts with "no source code changes," and "LAYOUT
   VERSIONING" requires that archived documents keep rendering with their
   original version while new documents pick up the newest — and that
   "Nothing changes silently."

   This harness proves the sanctioned registration path enforces all of it:

     1. validateDesignSystem() — the minimal renderable+explainable contract.
     2. registerDesignSystemVersion() — append-only, gap-free, id-checked,
        validated; rejects overwrites/gaps/invalid input.
     3. After registering composer v2: NEW documents render with v2, while a
        document pinned to v1 still renders byte-identically to before
        (archived docs are safe).
     4. v1 remains immutable.

   Run: node scripts/document-template-manager-check.mjs   (exit 0 = pass) */

import {
  getDesignSystem, latestVersion, listVersions, listDesignSystems,
  validateDesignSystem, registerDesignSystemVersion,
} from '../js/docs/design-system/document-design-system.js';
import '../js/docs/templates/composer-document.js'; // self-registers the template
import { getTemplate } from '../js/docs/template-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function threw(fn) { try { fn(); return false; } catch { return true; } }

const validV2 = {
  id: 'composer', version: 2,
  label: 'Sarpras Intelligence — Draf Komposisi (v2)',
  provenance: 'Test-registered layout v2 with wider margins (Sprint 12.3 harness).',
  inherits: 'operational',
  page: { size: 'A4', orientation: 'portrait', margins: [40, 40, 40, 40] },
  logo: { width: 52 },
  typography: { body: { fontSize: 9.5 } },
};

console.log('\n[1] validateDesignSystem — minimal renderable + explainable contract');
{
  check('a well-formed descriptor validates', validateDesignSystem(validV2).ok === true);
  check('a non-object is rejected', validateDesignSystem(null).ok === false && validateDesignSystem(42).ok === false);
  check('missing provenance is rejected (every layout must be explainable)',
    validateDesignSystem({ ...validV2, provenance: '' }).errors.some((e) => /provenance/.test(e)));
  check('bad orientation is rejected', validateDesignSystem({ ...validV2, page: { ...validV2.page, orientation: 'sideways' } }).ok === false);
  check('margins that are not 4 numbers are rejected',
    validateDesignSystem({ ...validV2, page: { ...validV2.page, margins: [1, 2, 3] } }).ok === false
    && validateDesignSystem({ ...validV2, page: { ...validV2.page, margins: [1, 2, 3, 'x'] } }).ok === false);
  check('a non-integer version is rejected', validateDesignSystem({ ...validV2, version: 2.5 }).ok === false);
}

console.log('\n[2] registerDesignSystemVersion — append-only, gap-free, validated');
{
  check('registering with a mismatched id throws', threw(() => registerDesignSystemVersion('nor', validV2)));
  check('registering an invalid descriptor throws', threw(() => registerDesignSystemVersion('composer', { ...validV2, provenance: '' })));
  check('registering a gap (v3 before v2) throws — no silent gaps', threw(() => registerDesignSystemVersion('composer', { ...validV2, version: 3 })));

  // The real, valid append.
  const registered = registerDesignSystemVersion('composer', validV2);
  check('a valid v2 registers and returns a frozen descriptor', Object.isFrozen(registered) && registered.version === 2);
  check('latestVersion("composer") is now 2', latestVersion('composer') === 2);
  check('listVersions("composer") is now [1, 2]', eq(listVersions('composer'), [1, 2]));
  check('re-registering v2 throws (never overwrite an existing version)', threw(() => registerDesignSystemVersion('composer', validV2)));

  // A brand-new template id.
  const letterV1 = {
    id: 'letter', version: 1, label: 'Surat Umum', provenance: 'Test-registered brand-new template (Sprint 12.3).',
    page: { size: 'A4', orientation: 'portrait', margins: [56, 56, 56, 56] },
  };
  registerDesignSystemVersion('letter', letterV1);
  check('a brand-new template id registers at v1', latestVersion('letter') === 1 && listDesignSystems().includes('letter'));
}

console.log('\n[3] Archived docs stay on v1; new docs pick up v2 ("Nothing changes silently")');
{
  check('getDesignSystem("composer") now resolves to v2', getDesignSystem('composer').version === 2 && eq(getDesignSystem('composer').page.margins, [40, 40, 40, 40]));
  check('getDesignSystem("composer", 1) still returns the ORIGINAL v1 (archived docs safe)',
    getDesignSystem('composer', 1).version === 1 && eq(getDesignSystem('composer', 1).page.margins, [48, 37, 48, 48]));

  const template = getTemplate('composer-document');
  const base = { documentId: 'DOC-1', domainType: 'nor', version: 1, statusLabel: 'Disetujui', approvedAt: null, sections: [] };
  check('a NEW document (no pin) now renders with v2 margins', eq(template.build(base).pageMargins, [40, 40, 40, 40]));
  check('a document PINNED to v1 still renders byte-identically to before (archived doc)', eq(template.build({ ...base, layoutVersion: 1 }).pageMargins, [48, 37, 48, 48]));
}

console.log('\n[4] v1 immutability holds after registration');
{
  const v1 = getDesignSystem('composer', 1);
  check('v1 descriptor is still deep-frozen', Object.isFrozen(v1) && Object.isFrozen(v1.page.margins));
  check('mutating v1 still throws', threw(() => { v1.page.margins[0] = 0; }));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
