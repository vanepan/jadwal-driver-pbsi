# Sarpras Intelligence V2 — Phase 10, Sprint 10.5: Approval Workflow

> Scope: real Reviewer/Approver authority, replacing Sprint 10.3/10.4's
> intentional `ACTOR_ID = 'evan'` placeholder. Method: mapped to the
> existing `admin`/`bidang` roles (the locked Phase 10 planning decision —
> no new role family invented), with a real architectural finding made
> and resolved BEFORE writing the identity-resolution code: importing
> `js/auth.js` directly would have broken this workspace's Firebase-free
> guarantee. Verified with real, executed checks: role-gating and real
> session identity both driven through the actual browser DOM, not
> asserted from reading the code.

---

## Headline finding

**The obvious way to read "the current user" — `import { getCurrentUser }
from 'js/auth.js'` — would have silently violated this workspace's own
Firebase-isolation guarantee, and this was caught by reading `js/auth.js`'s
own import list before writing any code, not by a later test failure.**
`auth.js` statically imports `js/firebase.js`, whose own top-level code is
`import { initializeApp } from 'https://www.gstatic.com/firebasejs/...'`
— a real, eager, network-fetching ES module import. Every other Firebase
touch point in `js/v2/` (`composer-document-repository.js`,
`import-session-repository.js`, `file-storage-registry.js`) goes through
great lengths to keep that import LAZY, inside an explicit `init*Sync()`
opt-in, specifically so Node check scripts and credential-free browser
tests never touch it. Importing `auth.js` — even just for its pure
`getCurrentUser()`/`currentRole()` helpers — would have broken that
guarantee for `review-workspace.js` and everything that transitively
imports it. Resolved by reading the SAME `localStorage` session key
directly (one stable, private constant, `'pbsi_current_user'`), never
importing `auth.js` at all.

---

## 1. Real identity, without a new Firebase dependency

`review-workspace.js` gains `currentSessionUser()` — a tiny, local,
read-only `localStorage.getItem('pbsi_current_user')` + `JSON.parse`,
duplicating exactly one private constant from `auth.js#getCurrentUser()`
and nothing else. `currentActorId()` returns the real session's
`username`, falling back to `'evan'` only when no real session exists
(a bare test mount — every real user who can reach this screen in
production already has one, since Sarpras Intelligence's own single-pilot
gate already requires a signed-in `admin` named `evan`). Every
`ACTOR_ID` use site from Sprints 10.3/10.4 (`editSection`'s
`overriddenBy`, `transitionStatus`'s `actorId`) now calls
`currentActorId()` instead.

**Verified this is really reading a live session, not coincidentally
matching the old placeholder**: the browser check's governance scenario
seeds a DIFFERENT username (`'budi'`, not `'evan'`) before mounting, and
asserts Riwayat Keputusan records `oleh budi` — proof the real session
value flows through, not a leftover hardcoded string that happens to
still work.

---

## 2. Real capabilities — role-registry.js

`js/config/role-registry.js#CAPABILITIES` gains `'sic.review.act':
[ADMIN, BIDANG]` and `'sic.approve.act': [ADMIN]` — the same asymmetry
`eng.verify`/`eng.postpone` already establish between Coordinator and
Admin, mapped to the LOCKED Phase 10 planning decision (existing
`admin`/`bidang` roles, no new role family invented, per CLAUDE.md
Principle 7 — "Never invent business rules"). `currentActorRole()` reads
the real session's `role` field (same localStorage read as identity —
one lookup, two facts), and `canReview()`/`canApprove()` wrap
`role-registry.js#can()` against it.

**Hide, don't disable** — the same convention every other role-gated
surface in this app already follows: a user lacking `sic.review.act`
never sees the "Ubah" edit button or the Draft/Needs-Revision governance
buttons at all; lacking `sic.approve.act` specifically hides "Setujui"
(but Minta Revisi/Tolak stay visible to any reviewer). Click handlers
ALSO re-check the capability before acting (defense in depth — a stale
render or a crafted event should not bypass the gate), mirroring the
same "not just the UI, the logic enforces too" posture Sprint 10.4's
rationale requirement already established.

**Noted, not glossed over**: today's single-pilot gate
(`isV2Enabled()` requires `role:'admin'` AND `username:'evan'`) means
every real user who can open Review Workspace at all already satisfies
BOTH capabilities — this sprint's work is the real, forward architecture
for a broader rollout, not something that changes today's actual pilot
UX. The role-gating tests below deliberately construct a hypothetical
`driver` session to prove the mechanism works, since no real non-admin
user can reach this screen yet to prove it against.

---

## 3. Verified

**Full regression, unrelated subsystems untouched** —
`composer-foundation-check.mjs` 56/56 (unchanged — Sprint 10.5 touched no
composer engine code), `north-star-acceptance-check.mjs` 38/38,
`nor-composition-check.mjs` 16/16, `problem-solving-integration-check.mjs`
30/30, `conversation-ownership-check.mjs` 77/77,
`knowledge-ownership-check.mjs` 56/56, `smoke-boot.mjs` PASS.

**Real browser, no login gate** — `review-workspace-render-check.mjs`
extended: 30/30 (was 25/25). Two new things proven live, not asserted
from code:

1. **Real identity flows through** — the governance scenario now seeds a
   distinct `'budi'` session and confirms Riwayat Keputusan attributes
   the real decision to `'budi'`, not the old constant.
2. **Role gating is real, live, "hide not disable"** — two fresh,
   isolated browser sessions on the SAME document: a `driver` session
   sees neither the "Ubah" edit button nor "Ajukan untuk Ditinjau"; an
   `admin` session, on an identically-shaped document, sees both. This is
   the strongest available proof in this environment that a real
   capability check gates real UI, since a live pilot session with a
   non-admin role does not exist to test against directly.

**Not verified, same limitation as every prior Phase 10 sprint**: the
real Settings → Power View → Review Workspace click path with a real
signed-in `bidang`/non-admin user in production — still requires
credentials this environment does not have. The role-gating logic itself
is proven correct; only the real end-to-end pilot experience for a
second role remains unverified until a credentialed session exists.

---

## 4. Phase 10 backlog

Sprint 10.6 (Export & Publishing) is next — the "Terbitkan" (Publish)
button Sprint 10.4 deliberately did not build now has a real actor
identity and real approval authority to gate it with, once export/archive
logic exists to attach it to.
