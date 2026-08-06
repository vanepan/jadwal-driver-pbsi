/* In-memory stand-in for firebase-database.js — see README.md in this folder.
   Implements exactly the surface js/firebase.js calls: getDatabase, ref, get,
   set, update, onValue, runTransaction, goOffline, goOnline. */

let root = {};
let listeners = []; // { path, cb }

function pathParts(p) {
  return String(p || '').split('/').filter(Boolean);
}

function getAt(parts) {
  return parts.reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), root);
}

function setAt(parts, value) {
  if (parts.length === 0) {
    root = value && typeof value === 'object' ? value : {};
    return;
  }
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
}

function updateAt(parts, patch) {
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  const last = parts[parts.length - 1];
  if (typeof node[last] !== 'object' || node[last] === null) node[last] = {};
  Object.assign(node[last], patch || {});
}

function makeSnapshot(val) {
  return {
    exists: () => val !== undefined && val !== null,
    val: () => (val === undefined ? null : val),
  };
}

// Real RTDB fires an ancestor listener with ITS OWN current value whenever any
// descendant path is written. Every listener here just re-reads its own path
// fresh on every write — a faithful match for that semantic given this file's
// only actual usage (one listener on the 'vehicles' root, writes to
// 'vehicles/<id>' children).
//
// Deliberately scheduled as a MACROTASK (setTimeout), not a microtask: a real
// write's returned promise resolves on server ACK, while the realtime
// listener echo is a SEPARATE message that is not guaranteed to arrive before
// the write promise settles — that gap is exactly the race this test suite
// exists to expose. A microtask-only fake would let a writer that never
// updates its local cache appear correct anyway (the echo would always "beat"
// the awaiting caller), masking the exact bug this test needs to catch.
function notifyAll() {
  for (const l of listeners.slice()) {
    const val = getAt(pathParts(l.path));
    setTimeout(() => l.cb(makeSnapshot(val)), 0);
  }
}

export function getDatabase() {
  return { __fakeDb: true };
}

export function ref(_db, path) {
  return { __fakePath: path || '' };
}

export async function get(r) {
  return makeSnapshot(getAt(pathParts(r.__fakePath)));
}

export async function set(r, value) {
  setAt(pathParts(r.__fakePath), value);
  notifyAll();
}

export async function update(r, value) {
  updateAt(pathParts(r.__fakePath), value);
  notifyAll();
}

export function remove(r) {
  return set(r, null);
}

export function onValue(r, callback) {
  const entry = { path: r.__fakePath, cb: callback };
  listeners.push(entry);
  Promise.resolve().then(() => callback(makeSnapshot(getAt(pathParts(r.__fakePath)))));
  return () => { listeners = listeners.filter((l) => l !== entry); };
}

export async function runTransaction(r, updater) {
  const cur = getAt(pathParts(r.__fakePath));
  const next = updater(cur);
  if (next === undefined) return { committed: false, snapshot: makeSnapshot(cur) };
  setAt(pathParts(r.__fakePath), next);
  notifyAll();
  return { committed: true, snapshot: makeSnapshot(next) };
}

export function goOffline() {}
export function goOnline() {}

/* ── Test-only inspection/reset API (not part of the real SDK surface) ──── */
export function __resetFakeDatabase() {
  root = {};
  listeners = [];
}
export function __inspectFakeDatabaseRoot() {
  return root;
}
export function __fakeListenerCount() {
  return listeners.length;
}
