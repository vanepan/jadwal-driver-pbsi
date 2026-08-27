/* No-op stand-in for firebase-auth.js — see README.md in this folder.
   vehicles-store.js's writers never touch auth; these exist only so
   js/firebase.js's top-level import doesn't throw. The export list here
   MUST stay a superset of js/firebase.js's `from '.../firebase-auth.js'`
   named import — Node's ESM loader validates every imported name against
   this module at instantiation time, so a missing one is a hard
   SyntaxError before a single line of test code runs (this is exactly how
   setPersistence/browserLocalPersistence, added to js/firebase.js by the
   login-entry/persistence work, silently broke vehicles-store-check.mjs). */
export function getAuth() { return { __fakeAuth: true }; }
export function signInWithCustomToken() { return Promise.reject(new Error('fake-auth: not implemented')); }
export function onAuthStateChanged() { return () => {}; }
export function signOut() { return Promise.resolve(); }
export function setPersistence() { return Promise.resolve(); }
export const browserLocalPersistence = { type: 'LOCAL' };
export const browserSessionPersistence = { type: 'SESSION' };
export const inMemoryPersistence = { type: 'NONE' };
