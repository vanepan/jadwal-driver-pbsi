// Phase 8.5 verification — pure logic harness.
//
// js/app.js has zero export statements (monolithic bootstrap entrypoint, not
// an importable module) and executes real Firebase reads/writes against
// PRODUCTION on DOMContentLoaded (see [[firebase-prod-in-local-testing]] /
// Phase 8.4's report §6) — so this copies the exact new control flow
// verbatim from setWorkspace()/applyWorkspaceState() (js/app.js:4218-4362)
// rather than importing the real file, same pattern Phase 8.4 used.
//
// What this verifies: the gating logic that decides whether a given
// setWorkspace(name) call gets wrapped in a View Transition, and whether
// .main-content's scroll gets reset — the two behavior changes Phase 8.5
// actually adds. It does NOT verify the real DOM/CSS/visual crossfade itself
// (that needs a real authenticated browser session, out of reach here).

let currentWorkspace = 'dashboard';
let _workspaceEverSet = false;
let motionOff = false;
let viewTransitionSupported = true;

const calls = []; // { name, wrapped, scrollReset }

function fakeStartViewTransition(cb) {
  calls.push({ event: 'transition-start' });
  cb();
  return { finished: Promise.resolve() };
}

function setWorkspace(name) {
  const isWorkspaceChange = name !== currentWorkspace;
  const canViewTransition = _workspaceEverSet
    && isWorkspaceChange
    && viewTransitionSupported
    && !motionOff;

  if (canViewTransition) {
    fakeStartViewTransition(() => applyWorkspaceState(name, isWorkspaceChange));
    return;
  }
  applyWorkspaceState(name, isWorkspaceChange);
}

function applyWorkspaceState(name, isWorkspaceChange) {
  _workspaceEverSet = true;
  currentWorkspace = name;
  const scrollReset = isWorkspaceChange; // mirrors the real `if (isWorkspaceChange) mainContentEl.scrollTop = 0;`
  calls.push({ event: 'apply', name, isWorkspaceChange, scrollReset });
}

function reset() {
  calls.length = 0;
  currentWorkspace = 'dashboard';
  _workspaceEverSet = false;
  motionOff = false;
  viewTransitionSupported = true;
}

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.error(`FAIL: ${label}`); }
  else console.log(`ok: ${label}`);
}

// 1. First-ever call must NEVER transition, even though name !== 'dashboard'
//    (initial value) makes isWorkspaceChange true — guards the "crossfade
//    from the pre-auth loading shell on login" edge case identified in the map.
reset();
setWorkspace('home');
check('first call never transitions', calls.filter(c => c.event === 'transition-start').length === 0);
check('first call still applies + resets scroll', calls[0].event === 'apply' && calls[0].isWorkspaceChange === true && calls[0].scrollReset === true);

// 2. Second call, DIFFERENT name, motion allowed, API supported -> transitions.
reset();
setWorkspace('home');       // arms _workspaceEverSet
calls.length = 0;
setWorkspace('pending');
check('real workspace change transitions', calls[0].event === 'transition-start');
check('transitioned call applies new name', calls.some(c => c.event === 'apply' && c.name === 'pending' && c.scrollReset === true));

// 3. Same-name re-navigation (e.g. Administration sub-section switch) must
//    NOT transition and must NOT reset scroll (map §5b/§7 decision: this
//    session's instruction — "only when the workspace name changes").
reset();
setWorkspace('administration');
calls.length = 0;
setWorkspace('administration');
check('same-name call never transitions', calls.filter(c => c.event === 'transition-start').length === 0);
check('same-name call does not reset scroll', calls[0].scrollReset === false);

// 4. Reduced motion / [data-anim="off"] -> instant, no transition, regardless
//    of it being a real workspace change.
reset();
setWorkspace('home');
motionOff = true;
calls.length = 0;
setWorkspace('pending');
check('reduced motion skips transition', calls.filter(c => c.event === 'transition-start').length === 0);
check('reduced motion still applies + resets scroll (instant end-state)', calls[0].scrollReset === true);

// 5. Unsupported browser (no startViewTransition) -> instant, no transition.
reset();
setWorkspace('home');
viewTransitionSupported = false;
calls.length = 0;
setWorkspace('pending');
check('unsupported browser skips transition', calls.filter(c => c.event === 'transition-start').length === 0);
check('unsupported browser still applies correctly', calls[0].name === 'pending');

// 6. Rapid re-entrant call while "transitioning" (native skip-and-restart is
//    the browser's job per spec, not this code's — just confirm our callback
//    itself doesn't throw or double-apply when called back-to-back).
reset();
setWorkspace('home');
calls.length = 0;
setWorkspace('pending');
setWorkspace('overtime');
check('two rapid real changes both apply, no throw', currentWorkspace === 'overtime');

console.log(failures === 0 ? `\nAll checks passed (${calls.length ? '' : ''}).` : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
