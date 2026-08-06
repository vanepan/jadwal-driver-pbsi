/* No-op stand-in for firebase-functions.js — see README.md in this folder. */
export function getFunctions() { return { __fakeFunctions: true }; }
export function httpsCallable() {
  return () => Promise.reject(new Error('fake-functions: not implemented'));
}
