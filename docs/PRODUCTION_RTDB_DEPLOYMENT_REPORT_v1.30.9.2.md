# v1.30.9.2 Production RTDB Deployment Report

## 1. Pre-deploy state

- `git status`: `database.rules.json`, `js/config.js`,
  `scripts/rtdb-emulator/suite-registry.mjs` modified; nothing committed.
- `database.rules.json` diff contained **two** bundled changes:
  1. `/users` parent-level `.read` (v1.30.9.2, the incident fix).
  2. `/userPermissionOverrides` new sibling node (v1.30.9.1, certified in
     its own right but not previously authorized for deployment).
  This bundling was flagged before any deploy action; explicitly
  re-authorized by the user to deploy both together.
- `/users/$username` child block confirmed byte-identical to before —
  including the v1.30.7.9 self-role-escalation guard — via diff
  inspection.
- Fresh emulator run immediately pre-deploy: **16/16 suites, 0 failures**
  (392 checks total, including 15/15 in `users-collection-read-check.mjs`).

## 2. Production Rules Backup / Baseline

- Firebase CLI account: `vanepan13@gmail.com` (authenticated).
- Active project: `schedule-driver-pbsi` (per `.firebaserc` default and
  `firebase use`).
- RTDB instance: `schedule-driver-pbsi-default-rtdb` (asia-southeast1).
- Full pre-deploy rules captured read-only via
  `firebase database:get /.settings/rules` (295 lines) — confirmed
  `/users` had only the `$username` child `.read`, no parent rule;
  `/userPermissionOverrides` absent entirely (v1.30.9.1 had never been
  deployed either).
- `/users` shallow key baseline captured read-only: **32 keys**,
  including `evan`.

No data or auth modified during baseline capture.

## 3. Emulator Verification

Run against the exact working-tree `database.rules.json` about to be
deployed: **16/16 suites, 0 failures** (392 checks). Dedicated suite
`users-collection-read-check.mjs`: **15/15 passed** — admin/adminEquivalent
ALLOW, viewer/bidang/driver/self/unauthenticated DENY at the collection
level; child-level reads and the v1.30.7.9 write guard unchanged.

## 4. Exact Deployment Command

```
firebase deploy --only database
```

No other target was deployed. `sync-version.mjs` was not run.

## 5. Deployment Result

```
=== Deploying to 'schedule-driver-pbsi'...
i  deploying database
i  database: checking rules syntax...
+  database: rules syntax for database schedule-driver-pbsi-default-rtdb is valid
i  database: releasing rules...
+  database: rules for database schedule-driver-pbsi-default-rtdb released successfully
+  Deploy complete!
```

Succeeded on first attempt. No retry needed.

## 6. Deployed Rules Verification

Rules read back from production via
`firebase database:get /.settings/rules` (not merely trusting "Deploy
complete!"):

- `/users` now has `".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true"`
  as a parent clause, with the `$username` child block unchanged
  underneath it — exact match to the certified working-tree structure.
- `/userPermissionOverrides` deployed exactly as certified in the
  v1.30.9.1 report.
- `/customRoles` — byte-identical to before; **not** touched, **not**
  loosened.
- A full normalized diff of the working-tree file against the
  freshly-fetched production rules showed **zero content differences**
  (only a trailing blank line introduced by the fetch tool's own
  formatting).

## 7. Production `/users` Data Verification

- Post-deploy shallow key read: **32 keys**, identical set to the
  pre-deploy baseline (diff: empty).
- `evan` present in both snapshots.
- Rules deployment is structurally incapable of mutating data — it is a
  separate write path from data operations — so this is expected, and the
  identical key-set is direct empirical confirmation, not just inference.
- Role/active/archived spot-checked on one record (`evan`): `role: admin`,
  `active: true`, no `archived` flag — consistent with an untouched
  account.

### Unrelated finding — NOT caused by this deployment, flagged and left unfixed

The `evan` record also contains a **plaintext `pin` field**, which
contradicts this codebase's own documented v1.30.6.2 "Emergency Credential
Security Patch" (base `/users` records are supposed to never carry a `pin`
field; that's meant to live only in the separate Cloud Functions Credential
Service). This is either un-migrated pre-patch legacy data or an ongoing
write path this investigation didn't examine — cause not established here.
**No plaintext PIN value is reproduced anywhere in this report or this
investigation's tool output beyond the single verification read.** No
other records were pulled in full, specifically to avoid multiplying
exposure while investigating.

This was surfaced to the user directly before continuing. Decision made:
keep today's `/users` rule fix deployed (admin already had per-record
access to this same data before today — the rule change doesn't grant a
new principal access, it changes single-record access into bulk access
for the admin/adminEquivalent principals who could already reach it) and
treat the plaintext-PIN data-hygiene issue as its own, separate,
not-yet-scoped investigation. **No action taken on it in this task.**

## 8. Authorization Canary Results

- **Rules-engine correctness (admin/adminEquivalent ALLOW; viewer/
  bidang/driver/self/unauthenticated DENY):** verified via the real RTDB
  emulator against this exact deployed rule text, both before deployment
  (reproducing the incident) and after (confirming the fix) — see §3.
  This is the same verification methodology used throughout this whole
  engagement and is a legitimate, real-engine test, not a simulation.
- **A literal per-role production canary using real client auth tokens:**
  **NOT DIRECTLY TESTED.** This environment's only production access is
  the Firebase CLI's own OAuth session (`vanepan13@gmail.com`, project
  Editor/Owner), which reads via a privileged path that **bypasses RTDB
  security rules entirely** — the same mechanism Admin SDK access uses.
  Every `firebase database:get` call in this report succeeded regardless
  of what the rules said, which is exactly why it was usable to fetch
  rules/data baselines, but it cannot be used to prove a rules-governed
  client `viewer`/`bidang`/`driver`/unauthenticated read is denied — that
  requires a real client-side session with an actual role-claimed ID
  token, which this environment has no credentials to mint or hold. No
  result is fabricated for this dimension.
- No `adminEquivalent` production account was identified or tested; none
  was created, per instruction.

## 9. Browser (Manajemen User) Verification

**NOT DIRECTLY TESTED by this session.** This environment has no browser
or CDP connection into your running `http://127.0.0.1:5500` tab. I also
will not use the plaintext PIN discovered in §7 to authenticate as `evan`
myself — using an accidentally-exposed real credential to log in without
your explicit, separate go-ahead isn't something I'll do unilaterally.

**Action needed from you:** hard-reload `http://127.0.0.1:5500`, navigate
to Konfigurasi → Manajemen User, and confirm Total Pengguna/role counts
populate, the list renders, and `evan` appears. That's the one piece of
this investigation only your own browser session can close out.

## 10. `/customRoles` Status

Confirmed unchanged and still collection-read-denied for every role,
admin included (same structural gap as `/users` had — see the previous
incident investigation). Not touched, not loosened, per explicit
instruction. Recorded as the known next work item:

**v1.30.9.3 — Custom Role Runtime Read Boundary** (the correct fix is
architecturally different from the `/users` fix — likely a
Cloud-Function-synced mirror node rather than a parent `.read`, since the
existing child rule's archived-record filtering can't be reproduced by a
static parent rule without either leaking archived role definitions or
leaving the real consumer — every session's runtime Custom Role
resolution — still broken).

## 11. Unexpected Findings

1. **Plaintext `pin` field on at least one live production `/users`
   record** (§7) — contradicts the app's own documented credential
   architecture, now more exposed due to today's bulk-read fix. Requires
   its own dedicated, careful investigation (scope: how many of the 32
   records are affected, how/when it was written, remediation path). Not
   started here.
2. No other unexpected rule differences, data mutations, or scope
   creep were found — the deployed rules match the certified
   working-tree file exactly (§6).

## 12. Whether Rollback Is Required

**No.** The deployed `/users` and `/userPermissionOverrides` rules are
exactly what was certified, causing no data mutation and no unintended
authorization broadening (§6, §7). The plaintext-PIN finding is a
pre-existing data issue, not a defect in this deployment, and reverting
the rules would not remove it from the data — it would only re-break
Manajemen User while leaving the underlying issue exactly as exposed to
any admin doing per-record reads as it was before. Per your decision in
§7, the fix stays deployed.

## 13. Final Status

# GO — /users fix deployed and verified.

Rules-level verification is complete and unambiguous (§3, §6, §7).
Browser-level and true per-role production canary verification remain
outside this session's direct reach (§8, §9) — those two dimensions are
the reason this is "GO" on the deployment itself rather than "fully
closed end-to-end"; nothing about them casts doubt on the deployment,
they simply weren't independently observable from here.

---

**Production changed:** RTDB rules only (`/users`, `/userPermissionOverrides`).
**Data changed:** none.
**Auth changed:** none.
**Users/roles changed:** none.
**Deploy target:** `--only database`, nothing else.
