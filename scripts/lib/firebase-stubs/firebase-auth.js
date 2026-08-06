/* No-op stand-in for firebase-auth.js — see README.md in this folder.
   vehicles-store.js's writers never touch auth; these exist only so
   js/firebase.js's top-level import doesn't throw. */
export function getAuth() { return { __fakeAuth: true }; }
export function signInWithCustomToken() { return Promise.reject(new Error('fake-auth: not implemented')); }
export function onAuthStateChanged() { return () => {}; }
export function signOut() { return Promise.resolve(); }
