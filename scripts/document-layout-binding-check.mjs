/* document-layout-binding-check.mjs — Phase 12, Sprint 12.2
   (Layout binding + version-pinned rendering).

   Proves the two Phase 12 pillars this sprint delivers, purely and
   deterministically:

     · "Composer automatically chooses the appropriate template" — a
       document's domainType resolves to a governed { template, design
       system, version } instead of a hardcoded string.
     · "Layout Versioning" — a NEW document renders with the latest layout;
       an archived document can be STAMPED and re-rendered under the exact
       version it was published with; a stamp pinning a version that no
       longer exists THROWS instead of silently upgrading.

   Also proves the real 'composer-document' template honors an optional
   pinned layoutVersion (unset → today's exact output).

   Run: node scripts/document-layout-binding-check.mjs   (exit 0 = pass) */

import {
  resolveLayout, stampLayout, resolvePinnedDesign, listDomainBindings,
} from '../js/docs/design-system/document-layout-binding.js';
import { getDesignSystem, latestVersion } from '../js/docs/design-system/document-design-system.js';
import '../js/docs/templates/composer-document.js'; // self-registers 'composer-document'
import { getTemplate } from '../js/docs/template-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function threw(fn) { try { fn(); return false; } catch { return true; } }

console.log('\n[1] resolveLayout — governed template + design + latest version');
{
  check('the composed NOR domainType is bound', listDomainBindings().includes('nor'));
  const r = resolveLayout('nor');
  check('resolves to the generic composer-document template', r.templateId === 'composer-document');
  check('resolves to the composer design system', r.designSystemId === 'composer');
  check('resolves to the LATEST composer layout version', r.designVersion === latestVersion('composer'));
  check('the resolved layout is frozen', Object.isFrozen(r));
  check('an unbound domainType THROWS (template choice is governed, never a guess)', threw(() => resolveLayout('totally-unknown')));
}

console.log('\n[2] stampLayout + resolvePinnedDesign — archived docs pin their layout');
{
  const stamp = stampLayout('nor', '2026-07-20T00:00:00.000Z');
  check('a stamp carries template + design + version + pinnedAt', stamp.templateId === 'composer-document' && stamp.designSystemId === 'composer' && stamp.designVersion === 1 && stamp.pinnedAt === '2026-07-20T00:00:00.000Z');
  check('a stamp is frozen (an immutable record on the archived doc)', Object.isFrozen(stamp));
  const design = resolvePinnedDesign(stamp);
  check('resolvePinnedDesign returns the exact pinned design descriptor', design === getDesignSystem('composer', 1));

  // The whole point of Layout Versioning: a doc pinned to a version that no
  // longer exists must fail loudly, never silently inherit a later redesign.
  const staleStamp = { templateId: 'composer-document', designSystemId: 'composer', designVersion: 99, pinnedAt: 'x' };
  check('a stamp pinning a nonexistent version THROWS ("Nothing changes silently")', threw(() => resolvePinnedDesign(staleStamp)));
  check('a malformed stamp throws', threw(() => resolvePinnedDesign({})) && threw(() => resolvePinnedDesign(null)));
}

console.log('\n[3] composer-document template honors an optional pinned layoutVersion');
{
  const template = getTemplate('composer-document');
  const base = { documentId: 'DOC-1', domainType: 'nor', version: 1, statusLabel: 'Disetujui', approvedAt: null, sections: [] };

  const latest = template.build(base);
  check('no layoutVersion → renders with the latest composer layout (today\'s exact margins)', eq(latest.pageMargins, getDesignSystem('composer').page.margins));

  const pinnedV1 = template.build({ ...base, layoutVersion: 1 });
  check('layoutVersion:1 → byte-identical to the unpinned render', eq(pinnedV1.pageMargins, latest.pageMargins) && pinnedV1.pageSize === latest.pageSize);

  check('a document pinned to a nonexistent layout version fails loudly at render', threw(() => template.build({ ...base, layoutVersion: 99 })));
}

console.log('\n[4] End-to-end: the resolved layout feeds the real render unchanged');
{
  const layout = resolveLayout('nor');
  const template = getTemplate(layout.templateId);
  const doc = template.build({
    documentId: 'DOC-2', domainType: 'nor', version: 1, statusLabel: 'Disetujui', approvedAt: null,
    sections: [], layoutVersion: layout.designVersion,
  });
  check('resolve → getTemplate → build produces the composer layout geometry', eq(doc.pageMargins, [48, 37, 48, 48]) && doc.pageSize === 'A4');
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
