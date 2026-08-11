# RTDB Authorization Validation Suite — Phase B Coverage Report (v1.30.7.5)

**Type: coverage report only.** This document records what was tested,
how, and with what result. It is explicitly NOT the final Validation /
Risk / Performance / Deployment-Readiness / Go-No-Go / Rollback report —
that remains Phase D's deliverable, once Phase C (Cloud Function tests)
also exists to report on. Nothing in this document should be read as a
deployment recommendation.

**Status: 337 checks, 0 failing, across 14 suites, run against the REAL
Firebase Realtime Database emulator** (`npm run test:rtdb-emulator`), not
structural JSON assertions. Two real, exploitable rules defects were found
and fixed during this program (v1.30.7.2, v1.30.7.4) — both are described
in `js/config.js` `VERSION_HISTORY` and summarized again in §5 below.
Nothing has been deployed.

---

## 1. How to read the per-node table

Every security-relevant RTDB node is scored across six dimensions. A
dimension is:

- **TESTED** — at least one meaningful positive and/or negative assertion
  against the real emulator exercises this dimension for this node.
- **N/A** — this dimension does not apply to this node's rule (e.g. a node
  with no per-record ownership logic has nothing to test under
  "Ownership"), or is proven generically elsewhere in a way that makes a
  per-node repeat redundant (e.g. anonymous vs. a non-privileged
  authenticated role evaluate identically against a pure role-equality
  rule — proven once, structurally, not per node).
- **GAP** — the dimension applies and was NOT tested. Every GAP below is
  named explicitly, not implied by a high pass count elsewhere on the same
  row. A large "Pass" number does not offset a GAP in a different column.

A node's "Pass" count is a real per-node count, not a per-file total —
several files test multiple nodes.

## 2. Per-node authorization matrix

### Public authenticated

| Node | Read | Write | Ownership | Role Branches | Validation/Immutability/Append-only | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `feature_flags` | TESTED | TESTED (universal deny, even admin) | N/A | N/A (single `auth != null` clause) | N/A | TESTED | 4 | 0 |
| `customRoles/$roleId` (+ top-level write) | TESTED | TESTED (admin-only write; adminEquivalent explicitly denied — real asymmetry, §5) | N/A | TESTED (admin/developer/`auth != null && !archived` — all 3 clauses) | TESTED (archived-conditional) | **GAP** — anonymous never tested against the `auth != null && !archived` read branch | 9 | 0 |

### User-owned, uid-scoped

| Node | Read | Write | Ownership | Role Branches | Validation/Immutability/Append-only | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `notifications/$recipientId` | TESTED | TESTED (universal deny, even the recipient/admin) | TESTED (self vs. cross-user) | N/A (uid-compare + admin-family, both covered) | N/A | TESTED | 6 | 0 |
| `push_subscriptions/$userId` | TESTED | TESTED (universal deny) | TESTED | N/A | N/A | TESTED | 5 | 0 |
| `notification_state/$uid` | TESTED | TESTED | TESTED (self vs. cross-user; **admin has zero bypass**, §5) | N/A | N/A | TESTED | 7 | 0 |

### System-owned / Internal (closed to clients)

| Node | Read | Write | Ownership | Role Branches | Validation/Immutability/Append-only | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `events` | TESTED | TESTED (universal deny) | N/A | TESTED (admin/developer/adminEquivalent — all 3) | N/A | N/A (pure role-equality; proven generically in Phase A) | 5 | 0 |
| `telegram_deliveries` | TESTED | TESTED | N/A | TESTED | N/A | N/A | 5 | 0 |
| `notification_deliveries` | TESTED | TESTED | N/A | TESTED | N/A | N/A | 5 | 0 |
| `reminders` | TESTED | TESTED | N/A | TESTED | N/A | N/A | 5 | 0 |
| `backups` | TESTED (denied for admin/developer) | TESTED (denied for adminEquivalent) | N/A | N/A (no rule exists at all) | N/A | N/A | 3 | 0 |
| `reimbursement_counters` | TESTED | TESTED | N/A | N/A | N/A | N/A | 3 | 0 |

### Append-only

| Node | Read | Write | Ownership | Role Branches | Validation/Immutability/Append-only | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `logs` | TESTED | TESTED (first-write-any-role allow; second-write denied even for admin) | N/A | N/A (write has no role branch, `auth != null` only) | TESTED | **GAP** — anonymous never attempted a write here | 3 | 0 |
| `analytics_exports` | TESTED | TESTED | N/A | N/A | TESTED | **GAP** — same as `logs` | 3 | 0 |

### Admin-owned, uniform shape (22 nodes, looped — see `admin-owned-uniform-nodes-check.mjs`)

| Node group | Read | Write | Ownership | Role Branches | Validation | Anonymous Distinction | Pass (each) | Fail |
|---|---|---|---|---|---|---|---|---|
| `pettyCashExpenses`, `pettyCashNors`, `pettyCashCycles`, `pettyCashSettings`, `pettyCashAudit` | TESTED | TESTED | N/A | TESTED (admin/developer/adminEquivalent) | N/A | N/A (generic proof) | 5 | 0 |
| `overtimeUnits`, `overtimeEmployees`, `overtimeRates`, `overtimeRateVersions`, `overtimeHolidays`, `overtimeRecords`, `overtimeDailySummary`, `overtimeMonthlySummary`, `overtimeAudit`, `overtimeBudget`, `overtimeReportHistory`, `overtimeClosing`, `overtimeArchive` | TESTED | TESTED | N/A | TESTED | N/A | N/A | 5 | 0 |
| `v2_sarpras/import_sessions`, `v2_sarpras/import_batches`, `v2_sarpras/file_storage`, `v2_sarpras/composer_documents` | TESTED | TESTED | N/A | TESTED | N/A | N/A | 5 | 0 |

22 nodes × 5 checks = 110, all passing.

### Admin-owned + `.validate` shape-constrained

| Node | Read | Write | Ownership | Role Branches | Validation/Immutability/Append-only | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `gudang/items` | TESTED | TESTED | N/A | TESTED | TESTED (itemType immutability + hasChildren) | N/A | 7 | 0 |
| `gudang/movements` | TESTED | TESTED | N/A | TESTED | TESTED (append-only, even admin + `quantityDelta.isNumber()`) | N/A | 7 | 0 |
| `gudang/assets` | TESTED | TESTED | N/A | TESTED | **GAP** — `.validate` exists (hasChildren + own-id match) but never exercised with an invalid payload, only ever-valid fixtures (deliberate scope trim, see §3) | N/A | 4 | 0 |
| `gudang/assetHistory` | TESTED | TESTED | N/A | TESTED | TESTED (append-only, even admin) | N/A | 6 | 0 |
| `gudang/locations` | TESTED | TESTED | N/A | TESTED | **GAP** — same deliberate trim as `assets` | N/A | 4 | 0 |
| `gudang/departments` | TESTED | TESTED | N/A | TESTED | **GAP** — same deliberate trim | N/A | 4 | 0 |
| `gudang/stockProjection` | TESTED | TESTED | N/A | TESTED | TESTED (`quantity.isNumber()`) | N/A | 6 | 0 |

### Role-owned, broad-read

| Node | Read | Write | Ownership | Role Branches | Validation | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `drivers` | TESTED | TESTED | N/A | N/A (`auth != null` read; admin/adminEquivalent write) | N/A | TESTED (read + write) | 7 | 0 |
| `vehicles` | TESTED | TESTED | N/A | N/A | N/A | TESTED (read + write) | 7 | 0 |

### Admin-owned, mixed sensitivity

| Node | Read | Write | Ownership | Role Branches | Validation | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `settings` (general) | TESTED | TESTED | N/A | TESTED (admin/developer/adminEquivalent) | N/A | N/A (generic proof) | 8 | 0 |
| `settings/operations` (carve-out) | TESTED (proven to widen ONLY this sub-path) | TESTED (unchanged from parent — admin/adminEquivalent only) | N/A | TESTED | N/A | N/A | *(included above)* | 0 |

### Mixed — data-model-aware

| Node | Read | Write | Ownership | Role Branches | Validation | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `users/$username` | TESTED | TESTED (incl. admin cross-user write, distinct from read) | TESTED (self vs. cross-user) | N/A (uid-compare + admin-family) | N/A | N/A (auth-required by construction of the identities tested) | 6 | 0 |
| `userProfiles` | TESTED | TESTED (universal deny, even admin — §5) | N/A | N/A | N/A | TESTED | 3 | 0 |

### Role-owned + ownership-scoped (the hardest class)

| Node | Read | Write | Ownership | Role Branches | Validation/Immutability | Anonymous Distinction | Pass | Fail |
|---|---|---|---|---|---|---|---|---|
| `assignments/$assignmentId` | TESTED | TESTED (own-record, cross-user, immutability ×2 fields, terminal lockout, self-drive claim/taken/foreign, creation gate, admin + adminEquivalent bypass) | **TESTED — the deepest ownership coverage in the suite**, including the fixed requestId-retargeting exploit (§5) | TESTED (driver/bidang/admin/adminEquivalent; viewer representative deny) | TESTED (2 immutability pins) | TESTED | 16 | 0 |
| `driver_requests/$requestId` | TESTED | TESTED (create-as-self, reassignment-deny, cross-user-deny, admin + adminEquivalent bypass) | TESTED (requesterId ownership) | TESTED (bidang/admin/adminEquivalent; driver representative deny) | N/A | TESTED | 9 | 0 |
| `engineering/assignments/$assignmentId` | TESTED (4 literal role clauses, all tested) | TESTED (status-gate, creation-gate, admin/dev bypass, coordinator≡member) | TESTED (status-conditioned) | TESTED | TESTED (`.validate` hasChildren) | N/A — this rule has no `auth != null`-broad or uid-scoped clause | 12 | 0 |
| `engineering/notifications` | TESTED | TESTED | N/A | TESTED (uniform 4-role) | N/A | N/A | 3 | 0 |
| `engineering/workReports` | TESTED | TESTED | N/A | TESTED | N/A | N/A | 3 | 0 |
| `engineering/settings` | TESTED | TESTED (the coordinator/member read-but-not-write **asymmetry**) | N/A | TESTED | N/A | N/A | 3 | 0 |

**Notable, verified fact**: `engineering/assignments`, `engineering/notifications`, `engineering/settings`, and `engineering/workReports` are the ONLY admin-tier nodes in the entire rule tree whose rule text has **no `adminEquivalent` clause at all** (confirmed by reading the rule text, not inferred) — an adminEquivalent Custom Role has no elevated access to any Engineering node, unlike literally every other admin-tier node tested in this suite. Marked N/A rather than GAP for the "adminEquivalent" role branch specifically on these 4 nodes, since the clause does not exist to test.

---

## 3. Deliberate scope trims (not gaps, but worth naming so they aren't mistaken for oversights)

- `gudang/assets`, `gudang/locations`, `gudang/departments`: role-gate pair only, no dedicated `.validate`-violation case, per the original Phase B plan's explicit scoping ("no extra validate nuance beyond hasChildren/own-id-match, already structurally covered by [structural check scripts]"). Still marked **GAP** in the table above rather than N/A, because the dimension genuinely applies (a `.validate` rule exists) — this is a real, small, consciously-accepted gap, not a false one.
- Every "collapse the deny side to one representative identity" decision throughout this suite (documented per-file in each check file's own header/section comments) is intentional per the brief's own anti-goal ("fewer correct tests over many superficial ones") — not re-litigated here.

## 4. Role Coverage Matrix

Every role this platform's login flow (`verifyPin.js`) can mint, plus the two Custom Role claim shapes, plus anonymous — and where each was exercised as a POSITIVE (allowed) identity somewhere in this suite:

| Identity | Exercised as an ALLOWED identity on | Exercised as a DENIED identity on |
|---|---|---|
| `admin` | Every admin-tier node in the tree (22 uniform, 7 gudang, drivers/vehicles, settings, users, customRoles, assignments, driver_requests, engineering/*) | `backups`/`reimbursement_counters` (the one class where even admin is denied) |
| `developer` | Every node whose read clause includes it (system-internal ×4, admin-uniform ×22, gudang ×7, settings, customRoles, engineering ×4) | `backups`/`reimbursement_counters`, `settings.write`, `customRoles.write` |
| `adminEquivalent` (Custom Role w/ `system.admin`) | drivers, vehicles, admin-uniform ×22, gudang ×7, settings.write, assignments, driver_requests | `backups`/`reimbursement_counters`, `customRoles.write` (real asymmetry, §5), `customRoles` archived-read (real asymmetry, §5), every `engineering/*` node (no clause exists at all) |
| Custom Role, no `system.admin` | `customRoles` non-archived read, `settings/operations` | Every admin-tier node tested (drivers/vehicles write, admin-uniform ×22, driver_requests) |
| `bidang` | `driver_requests` (create/update-as-self), `assignments` (self-drive claim) | `drivers`/`vehicles` write, admin-uniform ×22, gudang ×7, `settings`, `driver_requests`/`assignments` cross-user, `engineering/*` |
| `driver` | `assignments` (own record), broad reads (`drivers`, `vehicles`, `driver_requests`, `assignments`) | `assignments` cross-user/immutability/terminal, `driver_requests`, `vehicles`/`drivers` write |
| `viewer` | Broad reads only (`drivers`, `vehicles`, `assignments`, `driver_requests`) | `settings`, `engineering/assignments`, `assignments`/`driver_requests` write |
| `engineering_coordinator` | `engineering/assignments` (non-verified write), `engineering/notifications`/`workReports`/`settings` read, `settings/operations` read | `settings` general read, `engineering/assignments` verified/create, `engineering/settings` write |
| `engineering_member` | `engineering/assignments` (non-verified write, identical to coordinator — §5), `engineering/notifications`/`workReports` | `engineering/assignments` verified |
| Anonymous | *(never an allowed identity anywhere in this rule tree — deny-by-default root)* | Every `auth != null`-shaped or uid-scoped node tested (drivers, vehicles, feature_flags, userProfiles, notifications, push_subscriptions, notification_state, assignments, driver_requests) |
| `'developer'` claim presented directly | *(same as `developer` above — this platform's login flow cannot mint it; see Phase A's static/dynamic split)* | — |

## 5. Notable findings (cross-referenced from `VERSION_HISTORY`, not repeated in full here)

1. **v1.30.7.2 (Phase A)** — `!` applied to a non-boolean `.val()` at 2 sites (`customRoles.archived`, `assignments.driver`) made `database.rules.json` fail to load in the real Firebase rules engine at all. Fixed.
2. **v1.30.7.4 (Phase B)** — `assignments/$assignmentId.write`'s bidang-self-drive branch pinned `driverUsername` immutable but not `requestId`, letting a bidang user retarget a legitimately-claimed self-drive assignment to reference a different bidang's request. Fixed, with a permanent 2-part regression guard.
3. **`customRoles` archived-read has no `adminEquivalent` clause** — an adminEquivalent Custom Role is denied reading an archived role record; only literal `admin`/`developer` bypass the archived check.
4. **`customRoles.write` is admin-only, not adminEquivalent** — an adminEquivalent Custom Role cannot edit the very registry that grants such roles.
5. **`notification_state`, `feature_flags`, and `userProfiles` share a pattern**: each has a state where **even admin has no bypass** — `notification_state` (both read and write, uid-scoped only), `feature_flags` (write, unconditionally `false`), `userProfiles` (write, Cloud-Function-mirror-only). Three independent nodes, one recurring data-model idiom, not three coincidences.
6. **`backups`/`reimbursement_counters` are stricter than every admin-family node** — having no rule at all under the deny-by-default root is a strictly stronger guarantee than "admin/developer/adminEquivalent," since even `developer` (allowed on every other System-owned/Internal node) is denied here.
7. **`engineering/*` nodes have no `adminEquivalent` clause anywhere** — the only admin-tier node family in the tree where this is true. Confirmed by reading the rule text.
8. **`engineering/assignments` treats `engineering_coordinator` and `engineering_member` identically** at the rules layer — a real, documented rule-vs-UI asymmetry, since the client capability matrix (`js/config/role-registry.js`) does distinguish them (e.g. `eng.verify`/`eng.postpone` are coordinator/admin-only). Not a defect — the RTDB rule was never scoped to replicate that finer distinction — but worth knowing before assuming the rule enforces everything the UI implies.
9. **`settings`/`settings.write` is asymmetric on purpose**: `developer` can read general settings but not write them (write is admin/adminEquivalent only).

## 6. Regression status

All of Phase A's 45 checks (`auth-identity-check.mjs`, `role-claim-rules-check.mjs`, `custom-role-archived-rule-check.mjs`) and the `assignments-driver-requests-ownership-check.mjs` file's permanent v1.30.7.4 regression guard remain green alongside every Phase B addition. Full suite: **337 passed, 0 failed**, across 14 registered suites (`suite-registry.mjs`), verified via `suite-registry-meta-check.mjs` that no suite is missing, unregistered, or silently skipped.

## 7. Remaining coverage gaps (carried forward, not blocking)

| Gap | Node(s) | Why not closed now |
|---|---|---|
| Anonymous read on `customRoles` | `customRoles/$roleId` | Low risk (the `auth != null` clause is one of three; anonymous is denied by every other clause too) — worth closing in a future pass, not blocking |
| Anonymous write on append-only nodes | `logs`, `analytics_exports` | Same reasoning — `auth != null` is explicit in the write clause; anonymous denial is highly likely but not yet empirically confirmed here |
| `.validate` boundary case | `gudang/assets`, `gudang/locations`, `gudang/departments` | Deliberate scope trim (§3); the role gate (the higher-risk dimension) is fully tested |

Phase C (Cloud Function tests: Credential Service, backup, counter, profile mirror, notification dispatcher) and Phase D (performance, full business-module regression, final Go/No-Go report) remain separate, not-yet-started future work.
