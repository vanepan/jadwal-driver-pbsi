/* Node module-customization-hook loader — see README.md in this folder.
   Redirects the exact gstatic.com Firebase SDK specifiers js/firebase.js
   imports to the local stub files, so js/firebase.js and js/vehicles-store.js
   load completely unmodified while never touching the real network or the
   real production database. Register BEFORE importing anything that
   transitively imports js/firebase.js:

     import { register } from 'node:module';
     register('./lib/firebase-stubs/loader.mjs', import.meta.url);
*/

const GSTATIC_PREFIX = 'https://www.gstatic.com/firebasejs/';
const STUB_MAP = {
  'firebase-app.js': new URL('./firebase-app.js', import.meta.url).href,
  'firebase-database.js': new URL('./firebase-database.js', import.meta.url).href,
  'firebase-auth.js': new URL('./firebase-auth.js', import.meta.url).href,
  'firebase-functions.js': new URL('./firebase-functions.js', import.meta.url).href,
  'firebase-storage.js': new URL('./firebase-storage.js', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(GSTATIC_PREFIX)) {
    const file = specifier.slice(specifier.lastIndexOf('/') + 1);
    const stubUrl = STUB_MAP[file];
    if (stubUrl) return { url: stubUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
