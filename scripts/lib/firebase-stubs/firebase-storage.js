/* No-op stand-in for firebase-storage.js — see README.md in this folder. */
export function getStorage() { return { __fakeStorage: true }; }
export function ref() { return { __fakeStorageRef: true }; }
export function uploadBytes() { return Promise.reject(new Error('fake-storage: not implemented')); }
export function getBytes() { return Promise.reject(new Error('fake-storage: not implemented')); }
export function uploadBytesResumable() { throw new Error('fake-storage: not implemented'); }
export function deleteObject() { return Promise.reject(new Error('fake-storage: not implemented')); }
