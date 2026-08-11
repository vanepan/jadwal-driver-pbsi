# Individual Permission Assignment — Architecture Audit (v1.30.9)

**Status: AUDIT ONLY. No code written. No files modified except this
report. No production data touched. No deployment.**

Every claim below is labeled **FACT** (verified directly against the
current repository), **INFERENCE** (a reasoned conclusion from facts,
not independently verified), **RECOMMENDATION** (a design choice this
audit proposes, not yet approved), or **OPEN DECISION** (something this
audit deliberately does not resolve on its own).

---

## 1. Executive Summary

**FACT**: No per-user permission override mechanism exists anywhere in
this repository today. A repo-wide search for `permissionOverride`,
`userPermission`, `individualGrant`, `individualPermission`,
`permission-override`, `permissionGrant`, `permissionDeny`,
`effectivePermission`, and related terms returned zero matches. This is
new territory, not a rediscovery of something already built.

**FACT (the most important finding of this audit)**: the "Permission
Foundation" (`permission-registry.js` + `role-permissions.js` +
`permission-service.js`) that Custom Role Assignment (v1.30.8) is built
on is **not the only authorization mechanism in this application — it is
the newest of three that run in parallel, and by far the least-consumed
one.** See §6 for the full breakdown. Concretely: `permission-service.js#can()`
has exactly **one importer in the entire client** (`js/app.js`, for
`canAccessModule()` and its direct navigation cluster). Meanwhile
`js/auth.js#hasPermission()` has 19 call sites, `js/auth.js#isAdmin()`
has 30+ call sites across 7 files, `canEng()` has calls across 5
Engineering UI files, and a rough count finds 33 literal
`.role === '<string>'` comparisons scattered through `js/`. **None of
these older mechanisms can resolve a Custom Role id at all** — they
compare against literal system-role strings only. This means: **a user
holding a Custom Role today already gets `can()`-correct behavior only
for the narrow slice of the app already migrated to
`permission-service.js`, and is silently denied everywhere else in the
app, regardless of what permissions their Custom Role actually grants.**

**INFERENCE**: Individual Permission Assignment, if built as a new layer
that (like Custom Role Assignment before it) only speaks to
`permission-service.js`, will inherit the exact same limitation for the
exact same reason. This is not a reason to abandon the design — it is
the single most important scoping fact this audit surfaces, and it
belongs in the "Gap Analysis" (§6) and "Explicit Non-Goals" (§27)
sections rather than being silently absorbed into the recommendation.

**RECOMMENDATION**: build Individual Permission Assignment as an
additive, optional layer that resolves through the *same* provider
abstraction Custom Roles already use (`runtime-role-provider.js`'s
pattern), store it in a *new*, admin-only-writable RTDB node (never on
`/users`, given the self-escalation history — see §7, §14, §23), keep it
GRANT-only for v1.30.9 (defer DENY — see §10), and treat "migrate the
remaining legacy call sites onto `permission-service.js`" as an
explicitly separate, pre-existing, already-known piece of technical debt
that this feature does not need to solve to ship safely and honestly.

---

## 2. Current Architecture

**FACT**: this application runs **three parallel, independently-evaluated
authorization mechanisms**, not one:

| # | Mechanism | Where | Resolves | Recognizes Custom Roles? |
|---|---|---|---|---|
| 1 | Legacy literal-role checks | `js/auth.js`: `PERMISSIONS`/`hasPermission()`, `isAdmin()`, `isBidang()`, `isDriver()`, `isViewer()`; ~33 scattered `.role === 'x'` comparisons elsewhere | `user.role` against a literal string or a literal-string array | **No** |
| 2 | Capability matrix | `js/config/role-registry.js`: `CAPABILITIES`/`can(capability, roleId)`, consumed via `auth.js#canEng()` | `roleId` against a literal-role-id array (`[ADMIN, COORDINATOR, MEMBER]`) | **No** |
| 3 | Permission Foundation | `js/config/permission-registry.js` + `js/config/role-permissions.js` + `js/permission-service.js#can()`/`listPermissions()`, consumed via `js/app.js#canAccessModule()` | `user.role` → System Role static grant, OR (v1.30.5+) `runtime-role-provider.js` → Custom Role's live permission array | **Yes — the only one of the three that does** |

**FACT**: this fragmentation is not a defect this audit discovered by
accident — it is explicitly, honestly documented in the codebase's own
comments. `js/permission-service.js`'s header: *"v1.30.5 is this file's
first real consumer: js/app.js#canAccessModule() and its dependent
navigation cluster. Other existing role checks (auth.js's
PERMISSIONS/hasPermission, canEng, isAdmin, etc.) are still untouched —
future phases migrate remaining call sites module by module."* That
migration has not happened as of v1.30.8.

**FACT**: RTDB rules (`database.rules.json`) form a **fourth**,
independent authorization surface, evaluated server-side, using
`auth.token.role`/`auth.token.adminEquivalent` claims minted at login by
`verifyPin.js`. This one already fully supports Custom Roles (via
`adminEquivalent`) for the coarse admin/not-admin distinction, but has no
finer-grained per-permission concept at all — a rule can only ask "is
this admin or adminEquivalent," never "does this session hold
`warehouse.item.edit`."

**FACT — full authorization chain, traced end to end**:
```
Login (verifyPin.js)
  → resolveRoleClaims(storedRole)
      VALID_ROLES fast path (6 literal system roles) → role claim verbatim
      OR customRoles/{id} lookup → role claim = Custom Role id,
         + adminEquivalent:true iff permissions include 'system.admin'
  → auth.createCustomToken(username, { role, ...extraClaims })
  → client: signInWithCustomToken(), session cache = { role: <id> }

Client-side authorization (THREE independent paths from here):
  Path 1 (migrated): app.js#canAccessModule(name)
      → permission-service.js#can(MODULE_PERMISSIONS[name])
      → permissionSetFor(user.role)
          role in ROLE_PERMISSIONS (System)?  → static cached Set
          else → runtime-role-provider.js#getRuntimeRole(role)
                 → custom-roles-store.js's live cache
                 → archived/unknown → EMPTY_SET (fail closed)
  Path 2 (legacy, untouched): auth.js#hasPermission()/isAdmin()/isBidang()/
      isDriver()/isViewer(), and ~33 scattered role===literal checks
      → ALWAYS false/deny for any non-literal-system-role value,
        including every Custom Role id, unconditionally
  Path 3 (legacy, untouched): auth.js#canEng() → role-registry.js#can()
      → CAPABILITIES[cap].includes(roleId)
      → ALWAYS false for any Custom Role id, unconditionally

Server-side authorization (independent of all of the above):
  database.rules.json: auth.token.role === '<literal>' OR
    auth.token.adminEquivalent === true — coarse only, no per-permission
    concept exists at the rules layer at all.
```

---

## 3. Current Role Model

**FACT**: a user has **exactly one** `role` value — a single string field
at `/users/{username}.role`. There is no array, no multi-role support,
and no code path anywhere (client, Cloud Functions, or rules) that reads
more than one role per user. Confirmed by reading `js/users.js`
(`createUser`/`updateUser`, both take a single `role` string),
`functions/src/auth/verifyPin.js` (`resolveRoleClaims(storedRole)` takes
one value), and `database.rules.json` (`auth.token.role` is a single
claim).

**FACT**: a "Custom Role" is stored as a first-class record at
`/customRoles/{id}` (`{id, name, permissions: string[], archived,
archivedAt, clonedFrom, clonedFromId, createdAt, updatedAt}`), and a
user's `role` field can hold either a System Role id (one of 6 literal
strings) or a Custom Role's id, verbatim, interchangeably — the field
itself has no type discriminator; `role-catalog.js#resolveRoleInfo()` is
what tells you, after the fact, which kind of id it is.

**Answering §4's explicit questions directly:**
- Can a user have one role only? **FACT: yes, always exactly one** — the
  schema has no other shape.
- Can a user have one Custom Role? **FACT: yes** — a Custom Role id is a
  legal value for the same single `role` field.
- Can a user have multiple Custom Roles? **FACT: no** — there is no
  array anywhere in this schema; "multiple roles per user" would be a
  new data-model capability, not something latent and unused.
- Is Custom Role assignment stored directly on `/users`? **FACT: yes** —
  same field as System Roles, `/users/{username}.role`.
- Is there already a relationship node? **FACT: no separate assignment
  node exists.** `role-relationships.js` models Custom-Role-to-Custom-Role
  lineage (clone ancestry), not user-to-role assignment.
- Is there already a usage provider abstraction? **FACT: yes** —
  `role-usage-provider.js#registerRoleUsageProvider()`/`getRoleUsage()`,
  currently backed by `js/users.js#getRoleUsageFromUsers()` (counts
  `/users` records whose `role` field matches a given role id).
- Is role assignment currently one-dimensional? **FACT: yes** — exactly
  one axis (`role`), no secondary/orthogonal assignment concept exists.

---

## 4. Current Permission Model

**FACT**: `permission-registry.js` defines exactly **50 permissions**
across **11 modules** (System, Driver Operations, Warehouse, Vehicle,
Petty Cash, Overtime, Analytics, Configuration, Executive, Engineering,
Sarpras Intelligence) — confirmed by direct count and cross-checked
against the live production Role Management UI screenshot from this
session, which independently shows "50 Total Permission" / "11 Modul"
for a freshly-viewed role.

**FACT**: `role-permissions.js#ROLE_PERMISSIONS` is a **frozen, computed-
once** map from System Role id → permission id array, built from
`BASE_GRANTS` (admin/bidang/driver/viewer, hand-authored) plus
`grantsFromCapabilities()` (mechanically derived from
`role-registry.js#CAPABILITIES` for `eng.*`/`sic.*` ids). This computed
map is **never mutated at runtime** — it is `Object.freeze()`'d at module
load. A Custom Role's permission array, by contrast, lives in RTDB
(`/customRoles/{id}.permissions`) and is genuinely mutable via the Role
Management UI.

**FACT**: `permission-service.js#permissionSetFor(roleId)` is the one
function that unifies both: System Role ids resolve from the frozen map
(cached in a `Map`); everything else resolves through
`runtime-role-provider.js`. This IS the correct, already-proven pattern
for "a role id that isn't in the static registry" — Individual
Permission Assignment should reuse this shape, not invent a parallel one
(see §8/§12).

---

## 5. Existing Custom Role Architecture

**FACT — file-by-file, already read in full this session:**

| File | Role |
|---|---|
| `role-catalog.js` | `getAllRoles()` (System + active Custom), `resolveRoleInfo(roleId)` (active/archived/unknown), `resolveGrantedSet(role)` |
| `custom-roles-store.js` | Firebase-backed CRUD for `/customRoles`, live local cache, `__seedCustomRolesForTest()` test-only escape hatch |
| `custom-roles-rules.js` | PURE: name normalization/dedup, id slugging, clone-snapshot construction, permission diffing — no Firebase, Node-loadable |
| `runtime-role-provider.js` | The **one and only** thing `permission-service.js` is allowed to import for non-System-Role resolution — `initRuntimeRoleProvider()`/`getRuntimeRole(roleId)` — an explicit dependency-inversion boundary requested by this user's own past review feedback |
| `role-status.js` | `deriveRoleStatus()` — archived flag wins over stored status wins over derived default |
| `role-relationships.js` | Clone lineage (`clonedFromId`/`clonedFrom`) — NOT assignment relationships |
| `role-usage-provider.js` | Pluggable `{getUsage(roleId)}` provider, currently backed by counting `/users` |
| `role-archive-guard.js` | `canArchiveRole()` — blocks archiving a role with `assignedUsers > 0` or `dependencies.length > 0` |
| `role-summary-model.js` | The one reusable Role Summary (name/type/permissionCount/moduleCount/createdAt/updatedAt/derivedFrom/derivedRoles/assignedUsers/status), signature-keyed cache |
| `role-management-center.js` | The DOM/UI layer — Clone/Save/Delete, editable-only-for-Custom-Roles |

**FACT**: Custom Role Assignment activation (v1.30.8, this session)
changed exactly one thing: `js/admin.js#refreshCustomRoleOptions()` no
longer marks Custom Role `<option>`s `disabled`. Every mechanism above
was already fully built and already correctly wired to
`permission-service.js` since v1.30.4-v1.30.6 — v1.30.8 removed the last
UI gate, nothing more.

**FACT**: production currently holds **zero** Custom Roles
(`/customRoles` reads `null`) — confirmed via `firebase database:get
/customRoles` immediately before this audit began.

---

## 6. Gap Analysis

This is the section that most needs the FACT/INFERENCE distinction held
strictly, because it is easy to either overstate or understate the
severity of what §2 found.

**FACT**: Custom Role holders (today, in production, the instant the
first one is created) will correctly gain/lose access through
`canAccessModule()`'s cluster (module-level navigation: Engineering,
Driver Ops, Petty Cash, Overtime, Analytics, Konfigurasi, Role
Management, Gudang, Sarpras Intelligence pilot gate). They will **NOT**
gain/lose anything gated by `hasPermission()` (used by, per this audit's
own grep: `app.js` ×6, `modal.js` ×11, `requests.js` ×2 — this includes
assignment create/edit/delete/assign/start/complete/cancel-style
in-module actions per its own permission vocabulary: `view`, `create`,
`request`, `assign`, `edit`, `delete`, `manage_users`, `start`,
`complete`, `cancel`, `print_reimbursement`, `override_overtime`), by
`isAdmin()`/`isBidang()`/`isDriver()`/`isViewer()` (30+ call sites
across 7 files — this notably includes `js/admin.js#updateAdminButtons()`,
which is what shows/hides the User Management, Petty Cash, Overtime, and
Analytics **entry buttons themselves** — so even a Custom Role holder who
correctly passes `canAccessModule('pettycash')` may never see the button
that would navigate them there, depending on exactly which code path a
given screen uses), or by `canEng()` (Engineering navigation/actions
across 5 files — meaning **no Custom Role, however permissioned, can
ever reach Engineering functionality today**, since `CAPABILITIES`'s
arrays are hardcoded to `[ADMIN, COORDINATOR, MEMBER]` literal ids and
`grantsFromCapabilities()` only feeds INTO `ROLE_PERMISSIONS` for
*System* roles at module-load time — a Custom Role's own `eng.*`
permission entries, even if an admin explicitly checks them in Role
Management's UI, are never consulted by `canEng()` at all).

**INFERENCE**: this is very likely why the deployment session's own
verification of v1.30.8 never surfaced this as a blocking regression —
Custom Role Assignment was verified against `permission-service.js`
directly (correctly, and thoroughly — 649 automated checks), and against
`canAccessModule()`'s own cluster, which is the ONE place Custom Roles
were always designed to work. Nothing in that verification exercised
`hasPermission()`/`isAdmin()`/`canEng()`, because Custom Role Assignment
never claimed to touch them. This audit is the first point where that
boundary is being examined explicitly rather than implicitly accepted.

**RECOMMENDATION**: this gap is **out of scope for v1.30.9** — fixing it
means migrating dozens of pre-existing call sites across the whole
application, a large, separate, already-partially-planned piece of work
("future phases migrate remaining call sites module by module," per
`permission-service.js`'s own header) that has nothing specifically to
do with Individual Permission Assignment. But it **must be named
explicitly** in this report (§27, Explicit Non-Goals) rather than
silently inherited, because building Individual Permission Assignment
without saying this out loud would let a reader reasonably (and
incorrectly) assume that granting someone `driver.schedule.assign` via
an individual override means they can actually assign a driver anywhere
`hasPermission('assign')` gates that action today. **It does not, today,
for the same structural reason a Custom Role with that permission
already can't.**

**FACT**: no other latent "per-user override" primitive exists anywhere
close to this (confirmed §1/§3's search). The domain model genuinely
needs a new concept, not a rediscovery.

---

## 7. Individual Permission Requirements

Restated from the user's own words, verbatim intent preserved: *"Every
registered username/user should be able to have its own customizable
permission set. Custom Roles must remain supported, but Custom Roles
must NOT be the only mechanism for customizing permissions."*

**INFERENCE**: read literally, this asks for a THIRD tier below Custom
Role, not a replacement for it — the proposed model in the brief itself
(`System Role → Custom Role (optional) → Individual Permission Override
(optional) → Effective Permissions`) matches this reading and is
consistent with everything §3/§5 found about how the existing role
model is structured (a single base identity, with Custom Role already
proven as a safe, optional, swappable second layer). This audit adopts
that reading.

---

## 8. Recommended Domain Model

**RECOMMENDATION**, derived directly from what already exists rather
than invented fresh:

```
User (/users/{username})
  ├── role: string                       (existing, unchanged — System Role id OR Custom Role id)
  └── (NEW) individual permission overrides, stored SEPARATELY (§11) —
      never a second field on /users itself

Effective base grant = permissionSetFor(user.role)     (existing, unchanged: permission-service.js)
Effective overrides   = individualGrantsFor(user.username)   (NEW)
Effective permissions = base ∪ overrides                (§9)
```

This is **Model A-shaped** (System Role/Custom Role permissions are
whichever one the user's single `role` field currently points at — they
are not stacked with each other, because the existing schema does not
support holding both a System Role AND a Custom Role simultaneously,
§3 — plus individual grants layered additively on top).

**OPEN DECISION**: the brief's own diagram draws Custom Role as a
distinct tier *below* System Role, implying a user might conceptually
have both a base System Role AND a Custom Role active together. **The
current schema does not support this** — `role` is one field, one value;
a Custom Role today *replaces* the System Role slot, it does not sit
beneath it. Introducing true "System Role + Custom Role, stacked"
would be a materially larger schema change than Individual Permission
Assignment itself and is not something this audit resolves unilaterally.
This report proceeds on the assumption that the existing single-`role`
model is preserved exactly as-is, and Individual Permission Assignment
is the *only* new stacking concept introduced — but this assumption
should be explicitly confirmed before implementation begins.

---

## 9. Recommended Resolution Algorithm

**RECOMMENDATION**: **Model A (additive grants)** for v1.30.9, with DENY
explicitly deferred (§10).

```
effectivePermissions(user) =
  permissionSetFor(user.role)                     // existing, unchanged
  ∪ individualGrantsFor(user.username)             // NEW, additive only
```

Where `individualGrantsFor()` must apply the exact same fail-closed
rules `permissionSetFor()` already does for Custom Roles: a malformed,
missing, or unresolvable override record contributes the **empty set**,
never an error, never a fallback grant.

**Worked example, exactly as the brief's own template requests:**

```
User: role = 'driver'
Driver (System Role) grants: driver.schedule.view, driver.schedule.view.own,
  driver.schedule.start, driver.schedule.complete, driver.reimbursement.print

Custom Role: N/A (this user's role field is the literal 'driver' string,
  not a Custom Role id — see §8's Open Decision; a user cannot hold both
  a System Role AND a Custom Role under the current single-field schema)

Individual grants: pettycash.view

Effective = {driver.schedule.view, driver.schedule.view.own,
  driver.schedule.start, driver.schedule.complete,
  driver.reimbursement.print, pettycash.view}
```

**Second example — a Custom Role holder with an individual grant:**

```
User: role = 'role_koordinator_lapangan' (a Custom Role)
Custom Role 'Koordinator Lapangan' grants: assignment.view (n/a — illustrative,
  actual ids per catalog would be driver.schedule.view, driver.schedule.edit,
  vehicle.view)
Individual grants: pettycash.view

Effective = Custom Role's own permissions ∪ {pettycash.view}
```

**Test matrix against the model, one line per case:**

| Case | Effective result |
|---|---|
| Normal System Role user, no override record exists | Exactly the System Role's static grant — unchanged from today |
| Driver with an override granting one extra permission | System Role grant ∪ override |
| Bidang, Admin — same shape | Same shape |
| Custom Role, no override | Exactly the Custom Role's live permission set — unchanged from today |
| Custom Role WITH `system.admin`, no override | Unchanged from today — `adminEquivalent` minted exactly as it is now (§13: overrides play no part in this) |
| Archived Custom Role | `permissionSetFor()` already returns `EMPTY_SET` for this — an override record, if present, is a separate open question (§15) |
| Unknown Custom Role id | Same `EMPTY_SET` fail-closed behavior, unchanged |
| `adminEquivalent` | Determined **exclusively** by the base role/Custom Role's `system.admin` grant, exactly as today — individual overrides **must never** contribute to this claim (§13, non-negotiable) |
| User with no override record at all | Identical behavior to today, byte-for-byte — this is the backward-compatibility invariant (§17) |
| User with an override record present but empty (`[]`) | Identical to "no override record" — empty ∪ anything = anything |

---

## 10. Grant vs Deny

**RECOMMENDATION: GRANT-only for v1.30.9. Defer DENY.**

Rationale, weighing the two named scenarios explicitly:

- *"Driver gets one additional permission"* — solved completely and
  simply by GRANT-only. This is the model's primary use case per the
  user's own stated requirement ("every user should be able to have
  customized permissions"), and it is the low-risk direction: a grant
  can only ever WIDEN access beyond what a role already allows, never
  narrow it in a way that could be confused with a security control
  being silently bypassed.
- *"Admin grants everything, but the administrator wants to remove one
  dangerous permission"* — this is a DENY use case, and it is
  meaningfully more dangerous to build correctly: a DENY that is itself
  malformed, missing, or resolved in the wrong order relative to grants
  could **fail open** (silently NOT removing a dangerous permission the
  administrator believed was removed) — the worst possible failure mode
  for a security control. **This scenario already has an existing,
  lower-risk solution**: create a Custom Role that is a clone of the
  System Role with the dangerous permission unchecked, and assign that
  instead of the base System Role. That path is already fully built,
  tested, and deployed (v1.30.4-v1.30.8) — it does not need Individual
  Permission Assignment to exist at all.

**RECOMMENDATION**: defer DENY to a later, separately-versioned,
separately-reviewed phase (matching this project's own established
"gate risky/ambiguous authorization changes behind their own review"
discipline) — if and when a concrete case emerges that Custom-Role-
cloning genuinely cannot solve. Do not build GRANT+DENY speculatively
for v1.30.9.

---

## 11. Storage Architecture

**RECOMMENDATION: a new, dedicated node — `/userPermissionOverrides/{username}`.**

Explicitly evaluated against every candidate:

| Candidate | Verdict | Why |
|---|---|---|
| `/users/{username}` (a new field on the existing record) | **REJECTED** | This is the exact node whose self-write branch was just found and fixed for a real privilege-escalation vulnerability (v1.30.7.9, this same session). That fix works by pinning `role`/`active`/`archived` to their persisted value on any non-admin self-write — but a NEW field added later would need the identical pin added explicitly, or it silently inherits the OLD, unprotected self-write behavior (a self-write can freely mutate any field NOT explicitly pinned). Placing brand-new privileged data on a node with this exact, recent, documented history is the single highest-regret choice available. |
| `/userPermissionOverrides/{username}` (NEW, dedicated) | **RECOMMENDED** | A clean node gets a clean, purpose-built rule from day one — admin/adminEquivalent-write, self-or-admin-read (mirroring `/users`' CURRENT, POST-FIX shape) — with no legacy self-write branch to accidentally inherit. Matches this codebase's own established pattern of splitting sensitive concerns into their own node when the combined shape becomes risky (`/users` → `/users` + `/userProfiles`, v1.30.6.10, for exactly this class of reason). |
| `/userPermissions/{username}` | Equivalent to the above, naming only | Slightly ambiguous name (reads like it could mean "this user's EFFECTIVE permissions," a derived/computed concept, rather than "this user's override records," an authoritative one) — `/userPermissionOverrides/` is recommended specifically to keep the name unambiguous about what it authoritatively stores. |
| `/permissions/users/{username}` | **REJECTED as primary, not fundamentally wrong** | Nests user data under a `/permissions` namespace that today holds only code-defined catalogs (no such RTDB node currently exists — `permission-registry.js` is entirely client-code, never written to RTDB). Mixing a static-catalog-shaped namespace with per-user mutable data invites exactly the kind of node-purpose ambiguity the `/users` split was designed to avoid. |

**Evaluated against every dimension the brief asks for, for the
recommended node:**
- **RTDB security**: new node, new rule, `.write`: admin/adminEquivalent
  only (never self) — see §14 for the full rule design.
- **Ownership**: keyed by username, same convention as `/users`/`/userProfiles`.
- **Admin-only mutation**: yes, by construction of the rule (not a UI
  convention alone — see §14's explicit "UI is never the security
  boundary" requirement).
- **Client read requirements**: the record's own subject needs to read
  their own overrides for the User Management UI's Role Summary/
  provenance display (§16) — same `auth.uid === $username` shape
  `/users` already uses for self-read, but (critically) NOT combined
  with unrestricted self-write this time.
- **Runtime lookup**: read through a NEW provider, mirroring
  `runtime-role-provider.js`'s exact shape (§12) — never a direct import
  into `permission-service.js`.
- **Token generation**: recommended NOT to enter Firebase Auth custom
  claims at all (§12, Option B) — no `verifyPin.js` change needed for
  the grant-only, non-admin-affecting case this audit recommends.
- **Performance**: one small record per user who has an override
  (expected: a minority of the 32 current users) — negligible read cost,
  cacheable the same way `custom-roles-store.js` already caches
  `/customRoles` (a live local subscription, not a per-check network
  read).
- **Migration complexity**: none — a brand-new, empty-by-default node
  requires no migration of existing data.
- **Auditability**: write path goes through `logAction()` exactly like
  every other admin mutation already does (§19).
- **Rollback**: deleting a single override record is fully reversible
  and touches no other data — the safest possible rollback shape.
- **Compatibility with the `/users` hardening**: total — this
  recommendation exists specifically *because of* that hardening, not
  despite it.

---

## 12. Runtime Resolution

Full traced chain, per §2's diagram, with the recommended insertion
point marked:

```
Login (verifyPin.js) → token claims: { role, adminEquivalent? }   ← UNCHANGED
Client session cache: { role }                                     ← UNCHANGED
permission-service.js#can(permission):
  base = permissionSetFor(user.role)            ← UNCHANGED (System or Custom Role)
  overrides = getIndividualGrants(user.username) ← NEW insertion point
  return base.has(permission) || overrides.has(permission)
```

**RECOMMENDATION: Option B (runtime resolution, not token claims).**
Evaluated against the brief's own criteria:

| Dimension | Token claims (Option A) | Runtime resolution (Option B) | Hybrid cache (Option C) |
|---|---|---|---|
| Token size | Grows with every permission a user is individually granted — Firebase custom tokens have a documented size ceiling; this is a real, hard constraint for a feature explicitly meant to scale to "every registered user" | Unaffected — token stays exactly as small as it is today | Same as B for the token itself |
| Staleness | An override change requires a full logout/login to take effect (identical to how Custom Role permission EDITS already behave today, per `permission-service.js`'s own doc comment: Custom Role sets are re-read live, NOT re-minted into the token) — actually WORSE for A, since a1 token-embedded grant is frozen until next login even more rigidly than the live-re-read approach B offers | Reflects an override change on the user's NEXT session action once the local cache (subscribed, live) picks up the RTDB write — same responsiveness Custom Role permission edits already have today | Same responsiveness as B, plus an extra layer to keep correct |
| Immediate revocation | Requires forcing a re-login (Cloud Function token revocation) to guarantee — not something this app's architecture does today for ANY claim, including `role` itself | An admin removing an override takes effect on the affected user's very next `can()` check in their CURRENT session, no re-login required — this is materially SAFER for revocation than A | Same as B, if implemented correctly |
| Security | Custom claims are only as trustworthy as the minting Cloud Function — fine, but doesn't reduce complexity elsewhere | Matches the exact, already-proven, already-reviewed pattern Custom Roles use (`runtime-role-provider.js`) — no new trust boundary introduced | Introduces a new caching layer that is itself a new thing to get wrong |
| RTDB reads | None extra (data lives in the token) | One live subscription per session (same shape as `custom-roles-store.js`'s existing subscription — NOT one read per permission check) | Same as B |
| Offline behavior | Works offline (token already carries everything) | Degrades to "no individual overrides" if the subscription hasn't synced yet — same degradation Custom Role resolution already accepts today (documented, accepted behavior, not a new risk) | Same as B |
| Firebase Auth limits | Real, hard token-size ceiling risk at scale ("every user" is explicitly the stated goal) | No limit relevant | No limit relevant |
| Consistency with existing pattern | Would be a NEW, third way of getting a permission fact into the client (token claims), alongside the two that already exist (static registry, live RTDB subscription) | **Reuses the exact pattern already proven correct for Custom Roles** | Reuses B but adds complexity A/B don't need |

**RECOMMENDATION**: build a new `individual-permission-provider.js`,
structurally identical to `runtime-role-provider.js`
(`initIndividualPermissionProvider()`/`getIndividualGrants(username)`),
and have `permission-service.js` import ONLY that provider — never
`/userPermissionOverrides` directly — preserving the exact dependency-
inversion boundary this user's own past review feedback established for
Custom Roles (see the project's own standing review-style precedent:
*"Do not couple Permission Service directly to storage... introduce a
thin provider... document the swap path"*). This is not a new
architectural pattern being invented for this feature — it is the
literal reapplication of an already-approved one.

**Explicitly NOT recommended**: putting individual permissions into
Firebase Auth custom claims. The stated goal ("every registered user")
makes the token-size ceiling a real risk, not a hypothetical one, and
Option B's revocation/staleness properties are strictly better for a
feature whose entire purpose is fine-grained, frequently-adjusted,
per-user tuning — the opposite of what belongs in a token that's only
re-minted at login.

---

## 13. AdminEquivalent Boundary

**This section is resolved, not left open — the audit's own default
expectation is confirmed correct by the architecture, not merely
assumed.**

**FACT**: `adminEquivalent` is minted in exactly one place —
`functions/src/auth/verifyPin.js#resolveRoleClaims()` — and by exactly
one condition: `permissions.includes('system.admin')` on the resolved
Custom Role record read from `/customRoles/{storedRole}`. It is a
Cloud-Function-side, Admin-SDK-read computation over the role the user's
`/users/{username}.role` field points to. It has no knowledge of, and no
code path that could reach, any per-user override data — because
Individual Permission Assignment (per §11/§12) is recommended to live in
a completely separate node this function never reads.

**RECOMMENDATION (hard rule, not a preference): Individual Permission
Assignment MUST NOT be able to grant `system.admin`, and by construction
of §12's design, it structurally cannot** — `resolveRoleClaims()` would
need to be modified to even look at the override node for this to become
possible, and this audit explicitly recommends it never is. This is the
single clearest "do not implement" boundary in the entire report: even
if a UI bug someday allowed an admin to check the `system.admin`
checkbox while editing an individual override, the RUNTIME chain (login
→ token mint) would never see it, and `adminEquivalent` would remain
correctly false. The client-side `permission-service.js#can('system.admin')`
check WOULD see it (since it resolves the override additively) — meaning
a UI-visibility inconsistency is possible in theory, but the
RTDB-rules-authoritative claim (`adminEquivalent`) is not affected. This
inconsistency is exactly why the UI itself should hard-block granting
`system.admin` via an individual override (§14), not merely rely on the
runtime chain never reading it.

**Explicitly answering the brief's questions:**
- Can Individual Permission Assignment grant `system.admin`? **By this
  design: the UI should refuse to offer it, AND the runtime token-mint
  chain never reads override data, so even a UI bypass cannot mint
  `adminEquivalent`.**
- Can it create `adminEquivalent`? **No — structurally cannot, per above.**
- Can a Custom Role grant `system.admin`? **Yes — unchanged, existing,
  already-shipped, already-reviewed behavior.**
- Can an individual override grant `system.admin`? **Recommended: no,
  enforced at the UI layer as a hard block (§14), with the runtime chain
  providing a second, structural line of defense regardless.**
- Should `system.admin` remain exclusively role-derived? **Yes — this
  audit's recommendation makes it so by construction.**
- What happens if a user has a normal System Role plus an individual
  `system.admin` permission (if the UI block were somehow bypassed)?
  **`permission-service.js#can('system.admin')` would return true
  client-side (a UI-trust concern, not a data-access one — no RTDB rule
  keys off `can('system.admin')`, only off `adminEquivalent`/`role`), but
  every RTDB rule and every Cloud Function role check would remain
  correctly non-elevated, because none of them read override data. This
  asymmetry (client UI over-trusts a permission, server enforcement does
  not) is exactly the "platform must never present permissions it does
  not enforce" failure mode this project's own history has explicitly
  named as unacceptable before (Custom Role Assignment's own multi-month
  deferral, per project memory) — which is precisely why the UI-level
  hard block is not optional, it is load-bearing.**

---

## 14. RTDB Security Model

**RECOMMENDATION**, modeled directly on `/users`' now-corrected shape
(v1.30.7.9) rather than its original, since the original was exactly the
mistake this audit must not repeat:

```
"userPermissionOverrides": {
  "$username": {
    ".read": "auth.token.role === 'admin' || auth.token.adminEquivalent === true || auth.uid === $username",
    ".write": "auth.token.role === 'admin' || auth.token.adminEquivalent === true"
  }
}
```

**Deliberately NOT symmetric with `/users`**: note there is **no**
`auth.uid === $username` clause on `.write` at all — unlike `/users`
(where self-write is legitimately needed for profile fields like
Telegram chat ID), there is **no legitimate self-write use case** for a
user's own permission overrides. A user should never be able to write
even a no-op value to their own override record. This is stricter than
`/users` by design, not an oversight — self-write existing on `/users`
at all is *why* v1.30.7.9 was needed in the first place; the cleanest
fix for this new node is to never grant that capability rather than
grant-then-restrict it.

**Explicitly answering the brief's questions:**
- WHO can read individual permissions? Admin, adminEquivalent, or the
  subject themselves (needed so their own User Management self-view, if
  any, or a future self-service "what can I do" screen can render
  correctly).
- WHO can create/update/delete them? **Admin or adminEquivalent only —
  never the subject, never any other role.**
- Should `admin`/`adminEquivalent`/another permission gate this? Per
  this project's own established, universal idiom (every admin-tier node
  in `database.rules.json` uses exactly this literal
  `role==='admin' || adminEquivalent===true` pair, never a finer-grained
  permission id) — this audit recommends the SAME idiom, not a new
  `system.users.manage`-gated variant, for consistency with every other
  node in this file and to avoid a second, subtly-different admin-tier
  pattern existing alongside the first.

**UI vs. RTDB boundary, stated explicitly per the brief's own emphasis**:
the User Management UI should hide/disable the ability for a non-admin
to reach this feature at all — but the RULE above is what actually
enforces it, independent of the UI. This mirrors exactly how `isValidRole()`
(client-side gate) and the RTDB `/users` write rule (server-side
enforcement) are BOTH required today for role assignment (§ Custom Role
Assignment's own report, v1.30.8) — neither alone is sufficient, and
this audit recommends the identical two-layer pattern here.

---

## 15. Custom Role Interaction

**RECOMMENDATION**: effective permissions = Custom Role's live
permission set ∪ individual grants, exactly as §9's Model A states —
no special-casing needed, since "the user's base grant" is already a
single, already-abstracted concept (`permissionSetFor(user.role)`)
whether that role happens to be a System Role or a Custom Role.

**Explicitly answering each named scenario:**
- **Custom Role archived, while a user still holds it + has an
  individual grant**: `permissionSetFor()` already returns `EMPTY_SET`
  for an archived Custom Role (existing, unchanged, fail-closed
  behavior). **OPEN DECISION**: should the individual grant survive on
  top of that empty base (i.e., the user keeps ONLY their individually-
  granted permissions, losing everything the now-archived role granted),
  or should the entire effective set also collapse to empty? This audit
  recommends the FORMER (individual grants are independent of role
  lifecycle, by the additive model's own logic — `EMPTY_SET ∪ overrides
  = overrides`) as the mechanically simplest and most consistent
  reading of Model A, but this is a genuine product decision, not purely
  a technical one, and should be confirmed before implementation.
- **Custom Role deleted**: this app has no hard-delete for Custom Roles
  (`archiveCustomRole()` is a soft-delete only, confirmed in
  `custom-roles-store.js`) — "deleted" in practice means "archived," so
  this collapses into the case above.
- **User changes System Role** (moves off a Custom Role entirely, back
  to e.g. `'viewer'`): the individual grant record is keyed by
  `username`, not by role — it is untouched by a role change, and
  applies identically on top of whatever the new role's base grant is.
  This is a direct, mechanical consequence of §11's storage design (the
  override lives independently of `role`), not something requiring new
  logic.
- **Custom Role renamed**: no effect on permission resolution at all —
  resolution is entirely by permission id, never by role or permission
  NAME.
- **User reassigned** (to a different Custom Role, or back to a System
  Role): same as "changes System Role" above — the override record
  persists across any role change, additively, by construction.

---

## 16. Role Summary Compatibility

**RECOMMENDATION**: extend the existing, reused `buildRoleSummary()`
output — do not create a second summary model. Add exactly one new,
optional field to what's already computed for a USER (as opposed to a
ROLE) context: `individualGrants: string[]`. The existing
`permissionCount`/`moduleCount` fields should, for a user-with-overrides
view specifically, be computed against the EFFECTIVE set (base ∪
overrides), not the base role's set alone — otherwise the summary would
under-report what the user can actually do, repeating exactly the "UI
shows a permission set it doesn't match reality" failure class this
project has explicitly named as unacceptable before.

**Proposed presentation** (data shape only, no UI code):
```
{
  ...existing buildRoleSummary() fields, unchanged...
  baseRoleId: 'driver',
  baseRolePermissionCount: 5,
  individualGrants: ['pettycash.view'],
  effectivePermissionCount: 6,     // base ∪ overrides, deduplicated
}
```

---

## 17. User Management UX

**RECOMMENDATION — provenance is the central UX requirement** (per the
brief's own emphasis: *"Assignment / Admin Role / + Individual Grant"*).
For each permission row in a user's effective permission view, show
exactly one of:
- *(unmarked / plain check)* — granted by the base role (System or
  Custom), inherited, not individually editable from this view (editing
  the ROLE's grant belongs in Role Management, not User Management —
  preserves the existing, correct separation of concerns).
- **"+ Individual"** badge — granted specifically to this user, editable
  and revocable right here.

This directly answers the brief's own worked example
("Assignment — Admin Role + Individual Grant" reads as: the base role
already grants it, AND it's also individually granted — a redundant-but-
harmless state worth surfacing plainly rather than hiding, since it's
exactly the kind of state an admin should be able to see and simplify).

**RECOMMENDATION**: reuse the exact `v2-dq-stat-card` presentation
pattern already used for Role Summary in the user form (confirmed this
session, `js/admin.js#renderUserRoleSummaryPanel()`) — add one more stat
card ("Individual Grants: N") rather than a visually distinct new
component, preserving this project's stated "Apple-like minimal UX,
minimal clicks" standard (§ Performance, brief's own words).

---

## 18. Role Management UX

**RECOMMENDATION**: minimal to no change. Role Management's own Role
Summary is about a ROLE's definition, not a user's effective grant —
Individual Permission Assignment is a User Management concept (§17), not
a Role Management one. The one place Role Management might reasonably
surface anything new: Role Usage could, in principle, distinguish "N
users hold this role as their base" from "N users additionally hold an
individual grant that overlaps this role's own permissions" — but this
is a nice-to-have, not required for a correct v1.30.9, and is explicitly
left as a later enhancement rather than in-scope.

---

## 19. Performance Strategy

**FACT**: production currently has 32 users. **INFERENCE**: even at
significant future growth, the number of users holding a NON-EMPTY
individual override record is very likely to remain a small minority —
this is a targeted, exception-based mechanism by its own stated design
("every user CAN have custom permissions," not "every user WILL").

**RECOMMENDATION**: reuse the exact caching shape `custom-roles-store.js`
and `role-summary-model.js` already use — a single live RTDB subscription
to `/userPermissionOverrides` (not a per-check network read), local
in-memory cache, and a signature-keyed summary cache
(`role-summary-model.js`'s own pattern: cache invalidated by a content
signature, not by reference identity, since role/user objects are
rebuilt fresh on every render pass in this codebase's established
convention). No new caching primitive needs to be invented — the
existing pattern generalizes directly.

---

## 20. Audit Trail Strategy

**FACT**: `js/logs.js#logAction({userId, username, displayName, action,
targetId, metadata})` is the existing, already-reused mechanism for
exactly this kind of event — confirmed already in use for
`user_created`/`user_edited`/`login`/`profile_updated` (via `js/admin.js`)
and generalizable without modification.

**RECOMMENDATION**: add two new `action` values —
`individual_permission_granted` / `individual_permission_revoked` — with
`targetId` = the affected username and `metadata` = `{permission,
grantedBy}` (or `{permission, revokedBy}`), following the exact shape
every other admin-mutation log entry in this codebase already uses. No
new audit infrastructure needs to be built; this is purely a new call
site into an existing, already-battle-tested function.

---

## 21. Migration Strategy

**RECOMMENDATION**: none needed. §11's storage design (a brand-new,
independently-keyed node) means "no override record for user X" and "an
explicit empty override record for user X" are indistinguishable in
effect (§9's test matrix) — there is nothing to backfill, no existing
data to reshape, and no existing user's behavior changes merely because
this feature ships. This is the same "purely additive, safe when absent"
property Custom Role Assignment itself already had (§5).

---

## 22. Backward Compatibility

**RECOMMENDATION, restated as an explicit, testable invariant**: for
every one of the 32 existing production users, before AND after this
feature ships, `effectivePermissions(user)` must return byte-identical
results, because none of them will have an override record at ship
time. This should be the FIRST regression test written for this feature
(mirroring `permission-runtime-invariant-check.mjs`'s own existing role
regarding Role Management vs. runtime enforcement — the identical shape
of "does the new layer ever change behavior for someone who never opted
into it").

---

## 23. Failure Modes

| Failure | Fail-open or fail-closed? | Rationale |
|---|---|---|
| Malformed override record (not an array, wrong shape) | **Closed** — treat as empty | Matches `permissionSetFor()`'s existing precedent for a malformed/absent runtime role |
| Unknown permission id inside an override array | **Closed for that id only** — `can(permission)` for an id not in `permission-registry.js`'s catalog already returns false today (unknown permissions deny by default, existing behavior) | No new logic needed — the existing catalog-driven check already handles this correctly by construction |
| Archived Custom Role + individual grant present | **Open decision, §15** — recommended: individual grants survive independently | Needs product confirmation, not purely technical |
| Deleted Custom Role | Collapses to "archived" (no hard-delete exists) | §15 |
| Stale local cache (subscription hasn't synced yet) | **Closed** — same accepted degradation Custom Role resolution already has | Not a new risk category |
| Missing user record entirely | **Closed** — `can()` already returns false for `!user` | Unchanged existing behavior |
| Missing role | Same as above | Unchanged |
| Missing override record | **This is the normal, expected, majority case** — resolves to empty additive contribution, not a failure at all | §21 |
| Conflicting "grant" entries (duplicate ids) | **Harmless** — a `Set` union is naturally idempotent | No special handling needed |
| Unauthorized mutation attempt | **Closed** — RTDB rule denies (§14), independent of any client-side check | Two-layer enforcement, per the Custom Role Assignment precedent |
| Partial write (network failure mid-write) | RTDB writes are atomic per path — a partial multi-field write cannot leave a torn single-array field; the existing `updateFirebaseData`/`storeFirebaseData` primitives already used throughout this codebase apply unchanged | No new risk introduced beyond what `/customRoles` already accepts |
| Offline client | **Closed** — degrades to last-known-synced state, or empty if never synced | Same as Custom Role resolution today |
| Stale token (role changed mid-session) | **Unchanged, pre-existing, documented** — this is exactly why Custom Role assignment already requires a logout/login to take effect; individual overrides do NOT have this problem (§12) since they resolve live, not via token claim | Individual overrides are actually MORE responsive than role changes, not less |
| Role changed while session remains active | Base grant changes only on next login (existing, documented, unchanged); individual overrides apply immediately regardless | §12 |

---

## 24. Security Threat Model

Explicitly weighed against every named prior incident, per the brief's
own instruction:

1. **`/users` self-role escalation (v1.30.7.9, this session)**: directly
   informs §11/§14 — the new node is deliberately built with NO self-
   write branch at all, stricter than even the corrected `/users` shape,
   specifically so this exact class of defect cannot recur by
   construction, not merely by careful rule-writing.
2. **`assignments` `requestId` retargeting (v1.30.7.4)**: the lesson —
   an immutability/ownership check must pin EVERY field that matters,
   not just the obvious one. Applied here: if a future write path allows
   an admin to update ONE user's override record via a multi-field
   payload, the rule must not accidentally permit smuggling a change to
   a DIFFERENT username's record in the same write — the recommended
   `$username`-keyed node structure (§11) makes this structurally
   impossible the same way `/users/$username` already does (each user's
   data lives at a distinct, separately-ruled path).
3. **`notifyAdminsOfNewRequest` missing requester authorization
   (v1.30.7.7)**: the lesson — never assume "authenticated" implies
   "authorized for this specific target." Applied here: §14's rule
   explicitly requires admin/adminEquivalent for ANY write, never
   "authenticated," closing this exact gap category before it could
   exist.
4. **RTDB root-rule cascade (the whole v1.30.6.x hardening program)**:
   the lesson — an unruled node is NOT safe by omission once the root
   is deny-by-default (confirmed already true in production, v1.30.7.7).
   Applied here: the new node MUST ship with an explicit rule from the
   moment it's introduced — there is no "add the rule later" phase that
   would be safe, since a genuinely unruled node under the current
   (correct) root is simply inaccessible, not permissive — this is
   actually the SAFE default now, a direct benefit of the hardening
   program already being complete.
5. **`database.rules.json` boolean coercion defect (v1.30.7.2)**: the
   lesson — validate any new rule expression against the REAL Firebase
   rules engine (the emulator suite), never assume a hand-written
   expression compiles/means what it looks like. Applies directly to
   whatever exact rule text eventually implements §14 — must be emulator-
   tested before any deploy, not just read-reviewed.
6. **Custom Role runtime vs. legacy role-string authorization mismatch**
   (this audit's own §2/§6 finding): the single most load-bearing lesson
   for THIS feature specifically — do not let Individual Permission
   Assignment's own documentation or UI imply it grants access anywhere
   `hasPermission()`/`isAdmin()`/`canEng()` still gate, because it
   structurally cannot, for the identical reason Custom Roles cannot
   today. This must be stated as plainly in the eventual user-facing
   UI/help text as it is in this report (§27).
7. **`adminEquivalent` vs. literal `admin` distinction**: preserved
   exactly, not touched, not extended — §13 makes this a hard,
   structural guarantee, not a policy that could be weakened by a future
   well-intentioned edit.

---

## 25. Testing Strategy

**RECOMMENDATION**, mirroring the exact test-tier convention this
project has used for every prior phase of this program:

1. **Pure-logic tests** (`scripts/individual-permission-*-check.mjs`,
   plain `node`, no Firebase): the resolution algorithm itself (§9's
   test matrix, verbatim, as executable assertions) — mirrors
   `role-archive-guard-check.mjs`'s "injected-deps, pure decision logic"
   shape.
2. **RTDB emulator tests** (extend `scripts/rtdb-emulator/`, real
   Firebase rules engine): the new node's rule — self-write denied
   (unconditionally, not field-scoped like `/users`), admin/adminEquivalent
   write allowed, self-read allowed, cross-user read denied. Mirrors
   `users-nodes-full-sweep-check.mjs`'s exact shape.
3. **Puppeteer DOM tests**: the User Management provenance UI (§17),
   using the exact `__seedCustomRolesForTest()`/`__seedUsersForTest()`-
   style test-only seed hooks this session's own v1.30.8 work already
   established as this codebase's working pattern for exercising
   Firebase-coupled UI without a real write.
4. **The mandatory backward-compatibility invariant** (§22): a
   dedicated, permanent regression test asserting effective permissions
   for every EXISTING user shape are unchanged when no override record
   exists — this is the single most important test in the whole
   feature, and should be written FIRST, before any new resolution logic,
   exactly mirroring `permission-runtime-invariant-check.mjs`'s own
   "prove the UI and the runtime never silently diverge" role.
5. **A `system.admin`-cannot-be-granted-via-override test**, explicitly
   asserting §13's boundary holds — this is a security invariant, not
   an ordinary feature test, and deserves the same "permanent regression
   guard" treatment this project gives every other security-critical
   assertion (e.g. the `requestId` pin, the `/users` self-write pin).

---

## 26. Implementation Phases

**RECOMMENDATION** (derived from this repo's own versioning convention —
one reviewable, separately-approved diff per phase, matching how v1.30.0
through v1.30.8 were each staged):

- **v1.30.9.1 — Storage + Security Rules.** New
  `/userPermissionOverrides` node + rule (§11/§14), RTDB emulator tests
  first (mirrors this session's own "rules changes get their own review"
  precedent). No client code changes yet.
- **v1.30.9.2 — Runtime Resolution Foundation.** New
  `individual-permission-provider.js` (§12) + `permission-service.js`'s
  additive union (§9), pure-logic + emulator-backed tests, the mandatory
  backward-compatibility invariant (§22/§25) written and passing. Still
  no UI — this can ship fully dark (nothing surfaces it, nothing can
  create an override record yet, so it is provably inert).
- **v1.30.9.3 — User Management UX.** Provenance display (§17),
  grant/revoke UI, the `system.admin` hard-block (§13/§14's UI-layer
  half). This is the first version where the feature is actually usable.
- **v1.30.9.4 — Audit Trail + Role Summary Extension.** `logAction()`
  wiring (§20), the extended summary shape (§16).
- **v1.30.9.5 — Regression + Production Validation.** Full suite re-run
  (mirroring the exact 649-check + 345-check discipline this session's
  v1.30.8 work already established), a Claude-in-Chrome production
  first-use verification pass (§28) once actually deployed.

Each phase gets its own explicit go-ahead before starting, per this
project's own standing default (§ this session's own precedent,
confirmed multiple times: gate infra/security changes behind their own
review even within one approved overall scope).

---

## 27. Open Decisions

Collected here, not resolved by this audit:

1. **§8**: should a user be able to hold a System Role AND a Custom Role
   simultaneously (true two-tier stacking), or does the existing
   single-`role`-field model stay as the permanent ceiling, with only
   Individual Permission Assignment added as the new stacking layer?
2. **§15**: when a user's Custom Role is archived, should their
   individual grants survive independently, or collapse to nothing along
   with the base role?
3. **§10**: is GRANT-only actually sufficient long-term, or will a real
   DENY use case emerge that Custom-Role-cloning genuinely can't solve?
4. **§6/§27 (below)**: should the pre-existing `hasPermission()`/
   `isAdmin()`/`canEng()` migration be scheduled as a FOLLOW-ON piece of
   work once Individual Permission Assignment ships, given that both
   Custom Roles AND individual overrides share the identical limitation?
   This audit does not schedule it, but flags that leaving it
   unscheduled indefinitely means this feature's real-world usefulness
   stays capped at "the `canAccessModule()` cluster only" for as long as
   the gap persists.
5. **§16/§18**: exact visual treatment of provenance badges — this
   audit specifies the DATA shape, not the final pixel-level UX.

---

## 28. Explicit Non-Goals

Stated plainly, so nothing here is silently assumed to be in scope:

- This audit does NOT migrate `hasPermission()`, `isAdmin()`,
  `isBidang()`, `isDriver()`, `isViewer()`, `canEng()`, or any of the ~33
  literal `.role === 'x'` comparisons onto `permission-service.js`. That
  work is real, already-acknowledged (by the codebase's own comments) as
  outstanding, and out of scope for v1.30.9 specifically.
- This audit does NOT propose DENY-list support (§10) for v1.30.9.
- This audit does NOT propose multi-Custom-Role-per-user support (§8's
  Open Decision) — the existing single-`role`-field ceiling is preserved.
- This audit does NOT propose putting individual permissions into
  Firebase Auth custom claims (§12).
- This audit does NOT propose any change to `adminEquivalent` semantics,
  the Credential Service, `verifyPin.js`'s claim-minting logic, or any
  already-deployed RTDB rule for an EXISTING node.
- This audit does NOT write any implementation code, tests, or rules —
  per its own explicit instruction, this is investigation and design
  only.

---

## Final Recommendation

Individual Permission Assignment is **architecturally safe to build** on
top of the existing Permission Foundation, using patterns this codebase
has already proven correct once (Custom Roles' own provider-abstraction,
fail-closed, additive, self-write-never design) rather than inventing
new ones. The design in §8-§14 above is internally consistent, does not
weaken any existing authorization boundary, and does not repeat any of
the seven named historical defects (§24).

**The one finding that must not be lost in translation to an
implementation ticket**: this feature's real-world reach is currently
capped by the SAME pre-existing, partial-migration gap Custom Roles
already live with (§2/§6) — granting someone a permission via an
individual override will correctly affect `canAccessModule()`'s cluster
and nothing else, until the separate, larger legacy-call-site migration
happens. Shipping v1.30.9 honestly means saying that plainly in its own
release notes, not discovering it as a support ticket later.

---

# CLAUDE IN CHROME VERIFICATION PROMPT

**This prompt is for FUTURE USE ONLY — after v1.30.9 has been
implemented, tested, and explicitly deployed to production. Do not run
it now; nothing described in it exists yet. Copy it into Claude in
Chrome once that day comes.**

---

PRODUCTION INDIVIDUAL PERMISSION ASSIGNMENT — FIRST-USE VERIFICATION
======================================================================

This is an OBSERVATION-AND-CONTROLLED-MUTATION verification pass on a
LIVE production system. Do not change production data beyond what these
steps explicitly describe. Do not modify code. Do not open DevTools to
expose credentials, PINs, tokens, or cookies.

PREREQUISITES
--------------
- Confirm v1.30.9 (or whatever version implements Individual Permission
  Assignment) is actually deployed: check the displayed app version
  matches what was intended to ship.
- You need an admin session already available through the normal
  browser (never ask a human to paste a password/PIN into this chat;
  never attempt to discover or bypass credentials).
- You need ONE designated, disposable, non-admin test account — supplied
  by the human operator, never chosen by you. If none is available, stop
  and report "MANUAL GAP: no safe test account available" rather than
  improvising with a real staff account.
- Confirm `/customRoles` state and existing role assignments before
  touching anything, so you can restore exact original state at the end.

SAFETY RULES
-------------
- No changes to any user other than the designated test account.
- No changes to any Custom Role other than one you create explicitly for
  this test, if needed.
- Never grant `system.admin` (or anything that looks like full
  administrator access) via an individual permission override — if the
  UI allows this at all, that is itself a STOP-and-report finding, not
  something to proceed past.
- Every mutation goes through the real UI. Never edit RTDB directly.
- Do not deploy, commit, or modify code at any point.

STEPS
------
1. Open the production URL. Confirm it boots without a stuck loading
   screen and the version matches expectation.
2. Log in as admin. Navigate to User Management, open the designated
   test user's edit/detail view.
3. Record the test user's CURRENT state: base role, any Custom Role,
   and (if the UI already shows it) any existing individual grants —
   there should be none for a genuinely fresh test account.
4. Grant the test user exactly ONE harmless individual permission (pick
   something easy to visually verify, e.g. a view-only permission for a
   module they don't otherwise have access to). Save through the real UI.
5. Reopen the user. Verify the grant persisted and is displayed with
   correct PROVENANCE — it should be visually distinguishable as an
   individual grant, not confused with something inherited from their
   base role or Custom Role.
6. Verify Role Summary / effective permission count reflects the
   addition (base count + 1, or equivalent).
7. Log the test user out, then log back in (a real logout/login cycle —
   do not assume an existing session picks up the change).
8. In the app AS the test user (or by directly checking their available
   navigation if you're still in an admin view showing their effective
   access), verify:
   - The newly granted permission's corresponding module/action is now
     accessible.
   - A permission they were NOT granted (individually or via role)
     remains correctly inaccessible.
9. Test Custom Role interaction, if the test account has (or you assign
   it) a Custom Role: verify effective permissions = Custom Role's own
   grants UNION the individual grant, not one replacing the other.
10. If an archived Custom Role scenario is safely testable (a
    disposable Custom Role you archive as part of this test, not a real
    one): verify what happens to the individual grant per whatever the
    implementation actually decided for the open decision in §15 of the
    architecture audit — report the OBSERVED behavior, don't assume it
    matches any particular expectation.
11. Test removal: revoke the individual grant through the real UI.
    Confirm it disappears from the display. Log out/in again (or, if the
    implementation resolves live per the architecture recommendation,
    confirm it takes effect without even needing a fresh login — this
    itself is worth explicitly noting either way). Confirm the
    permission's module/action is no longer accessible.
12. Attempt (as the non-admin test user, if you have a way to safely
    simulate or verify this without directly exposing their session) to
    confirm they cannot mutate their OWN or anyone else's authorization
    data — this should be structurally impossible per the rules, but
    worth a real check if safely possible; otherwise report as GAP.
13. Take screenshots at: the granted state, the Role Summary/provenance
    view, the post-logout/login runtime access confirmation, and the
    final cleaned-up state.
14. CLEANUP (mandatory): remove the test individual grant if not already
    done in step 11, restore the test user's original role/Custom Role
    exactly as recorded in step 3, archive/remove any disposable Custom
    Role created solely for this test, and confirm no other user or role
    was touched.

STOP CONDITIONS
-----------------
- The UI allows granting `system.admin` (or equivalent) via an
  individual override.
- The test user gains ANY admin-only capability.
- A permission NOT granted (by role or override) is nonetheless
  accessible.
- The individually granted permission persists after being revoked and a
  fresh login.
- Any user or role other than the designated test subject changes.
- Anything suggests underlying code, rules, or Cloud Functions need
  modification.

If any STOP condition triggers: stop immediately, do not attempt a fix,
report exactly what was observed.

FINAL REPORT FORMAT
---------------------
Use PASS / FAIL / GAP / NOT TESTED / NOT APPLICABLE for each of: version
check, login, grant creation, persistence, provenance display, runtime
access (positive case), runtime access (negative case), Custom Role
interaction, archived-role behavior, revocation, self-mutation
prevention, cleanup completeness. Never report PASS for anything only
inferred rather than directly observed in the browser. Explicitly
distinguish "the UI shows this" (visual verification) from "the app
actually enforces this" (functional verification) — these are different
claims and must not be conflated in the report.
