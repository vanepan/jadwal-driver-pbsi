# firebase-stubs/

Test-only in-memory stand-ins for the Firebase modular SDK, used ONLY by
`scripts/vehicles-store-check.mjs` via a Node module-customization-hook
(`scripts/lib/firebase-stubs/loader.mjs`, registered with `node:module`'s
`register()`).

## Why this exists

`js/firebase.js` imports the real SDK directly from
`https://www.gstatic.com/firebasejs/...` at module top level. Node's default
ESM loader cannot resolve `https:` specifiers at all (throws
`ERR_UNSUPPORTED_ESM_URL_SCHEME` before any network I/O happens), so
`js/vehicles-store.js` — which imports `js/firebase.js` — could never be
`import`ed by a plain `node script.mjs` before this. Even if it somehow could
be loaded, `isFirebaseConfigured()` is a hardcoded-true check in this
codebase (see `js/firebase.js`), so every write would attempt to hit the
REAL PRODUCTION Firebase Realtime Database — never acceptable in an
automated test (see the `firebase-prod-in-local-testing` project memory).

The loader intercepts exactly the 5 `gstatic.com` SDK specifiers `firebase.js`
imports and redirects them to the stub files in this folder — `js/firebase.js`
and `js/vehicles-store.js` themselves are loaded completely unmodified; only
the external SDK boundary is faked, entirely in-process, entirely offline.

## Scope

`firebase-database.js` is the only stub with real behavior: a tiny in-memory
tree supporting exactly the `ref/get/set/update/onValue` calls
`js/firebase.js`'s `readNode`/`storeFirebaseData`/`updateFirebaseData`/
`subscribeFirebasePath` make, including Realtime-Database-accurate
ancestor-listener notification (a listener on `vehicles` fires with the
current full value whenever any `vehicles/<id>` child is written) — this is
what actually validates the "unified refresh path" fix. `firebase-app.js`,
`firebase-auth.js`, `firebase-functions.js`, `firebase-storage.js` are
no-op stubs: `js/firebase.js` imports them at module scope but
`vehicles-store.js`'s usage never calls into auth/functions/storage, so they
only need to exist and not throw.

Not a general-purpose Firebase mock — deliberately narrow to what this one
store file needs.
