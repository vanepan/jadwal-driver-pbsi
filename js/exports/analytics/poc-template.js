/* ============================================================
   POC-TEMPLATE.JS (client) — Analytics Export foundation template

   Registers 'analytics-export-poc' with the shared document
   template registry. For the Puppeteer pipeline the client
   template does NOT build HTML — the HTML is built server-side
   from the same report model (IMPLEMENTATION_ARCHITECTURE.md §4:
   the report/ tree is the canonical, server-side renderer). The
   client template's job is only to produce the render envelope
   the PuppeteerBackend ships to the Cloud Function.

   Envelope shape (read by PuppeteerBackend.exportToPdf):
     { __analyticsExport:true, payload:{ templateId, model } }
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';

function build(data) {
  return {
    __analyticsExport: true,
    payload: {
      templateId: 'poc',
      model: data || {},
    },
  };
}

register('analytics-export-poc', {
  build,
  filename: () => `Analytics-Export-POC-${new Date().toISOString().slice(0, 10)}.pdf`,
  meta: { title: 'Analytics Export — A4 Foundation POC', label: 'Analytics Export POC' },
});
