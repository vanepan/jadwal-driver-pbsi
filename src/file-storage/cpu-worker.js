/* ============================================================
   CPU-WORKER.JS — Runtime Hardening (Phase 7, Part 3)

   PURPOSE: the actual Web Worker script. Runs in its OWN JS realm, with NO
   access to any of this app's in-memory singletons (repositories,
   registries, Pattern Discovery, Profile Overrides) — which is exactly why
   ONLY the two genuinely stateless, CPU-bound operations live here:

     'sha256'     — the real content hash (Web Crypto, available inside a
                    Worker exactly as it is on the main thread)
     'parseJson'  — JSON.parse over already-read text

   Everything else this pipeline does (metadata inference, duplicate
   detection against the file-storage ledger, confidence computation) reads
   live, main-thread-only registries and Pattern Discovery/Profile Override
   state — moving those here would mean duplicating that state into the
   Worker, a real drift risk this milestone's plan deliberately ruled out.
   See worker-runtime.js's header for the full reasoning.

   PROTOCOL: postMessage({id, type, ...payload}) in, postMessage({id, ok,
   result|error}) out. Never throws across the boundary — every failure is a
   real {ok:false, error} message, so the main thread can fall back cleanly.
   ============================================================ */

'use strict';

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'sha256') {
      const buffer = await e.data.file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      self.postMessage({ id, ok: true, result: hex });
    } else if (type === 'parseJson') {
      const parsed = JSON.parse(e.data.text);
      self.postMessage({ id, ok: true, result: parsed });
    } else {
      self.postMessage({ id, ok: false, error: `Unknown worker message type "${type}".` });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
