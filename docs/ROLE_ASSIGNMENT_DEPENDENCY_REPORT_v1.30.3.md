# Role Assignment & Dependency — v1.30.3

**Project:** Administration Platform, Phase 4
**Status:** Shipped. Every Relationship/Usage/Status/Summary number is real and computed, but Assigned Users/Assignments/Dependencies/Consumers are all genuinely zero today — no user can be assigned a Custom Role yet (User Management is still a future phase). This phase builds the foundation that phase will plug into.

This is the deliverable requested by the Role Assignment & Dependency brief:
investigate what already exists, then give every role (System or Custom)
relationship metadata, a normalized status, a usage model, and a single
reusable summary — without implementing User Management itself.

---

## 1. Architecture Report

### 1.1 What investigation found (and two corrections to the brief's own assumptions)

Before any code was written, the existing stack was read directly (not
assumed from the brief's paraphrase):

| Concern | What actually exists |
|---|---|
| Permission catalog / Role Model | `js/config/permission-registry.js` (50 permissions), `js/config/role-permissions.js` (`ROLE_PERMISSIONS`, `permissionsForRole()`) — unchanged, DO-NOT-MODIFY |
| Permission Service | `js/permission-service.js` — session-scoped `can()`/`cannot()`/`hasAny()`/`hasAll()`, cached per role. Still not consumed anywhere (foundation-only since v1.30.0) — unchanged |
| Role Registry | `js/config/role-registry.js` — 9 System Roles, `roleLabel()`/`getRole()` — unchanged |
| Custom Role Store | `js/role-management/custom-roles-store.js` — **Realtime Database** (`customRoles` node), **not Firestore** as the brief's phrasing implied |
| Role Editor / Role page | `js/role-management/role-management-center.js` — a single always-visible master-detail screen, **not** a list+drawer pattern |
| Archive flow | `archiveCustomRole()` — soft-delete only, **no pre-archive gating existed before this phase** |
| Dependency/usage tracking | Grepped `usageCount\|assignedUsers\|dependency\|consumers\|roleUsage\|inUseBy` scoped to roles — zero hits. Confirmed green field |
| "Does User Management exist?" | **Only half true.** A full user CRUD + System-Role-assignment panel already exists (`js/admin.js` + `js/users.js`, Konfigurasi → "Manajemen User") — it just can't assign **Custom** Roles yet (a hardcoded 5-option `<select>` in `index.html`). This phase is preparing an extension point for that *existing* surface, not building user management from zero |

### 1.2 The one governing design rule

Everything this phase adds must be **real but zero** — a computed value
that happens to be zero today, never a hardcoded literal standing in for
"we haven't built this yet." Concretely: `role-usage-provider.js`'s
default provider is a real function that returns zeros; `role-archive-
guard.js`'s `allowed: true` is the output of an evaluated comparison
(`assignedUsers > 0`), not a bypassed check. This is what makes the phase
genuinely pluggable rather than a UI mockup.

### 1.3 Investigation-driven conventions adopted

| Concern | House convention found | Applied here |
|---|---|---|
| Status normalization | `js/drivers-store.js#deriveStatus()` — archived flag wins over a stored status field wins over a derived default | `role-status.js#deriveRoleStatus()`, same priority order |
| Derived/cached state | `js/stores/dispatch-intelligence-store.js` — keyed in-memory state, explicitly "DERIVED, not persisted" | `role-summary-model.js`'s two signature-keyed caches |
| Pluggable extension point | `src/workspace/workspace-flags.js`'s `let` + setter swap idiom | `role-usage-provider.js#registerRoleUsageProvider()` |
| Feature gating | Two coexisting patterns: identity-allowlist (`feature-gates.js`) vs. boolean kill-switch (`workspace-flags.js`) — but v1.30.1/v1.30.2 themselves shipped with **neither**, gated only by `isAdmin()` | No new flag added (see §8) |
| Zero-state rendering | `js/widgets/_widget-base.js#empty()` — "the ONE way widgets render 'no data'" | Reused for every zero-value row instead of inventing new markup |
| Directory/module split | `<domain>-store.js` (Firebase) / `<domain>-rules-or-logic.js` (pure) / `<domain>-center.js` (DOM) | Five new pure files in `js/role-management/`, zero new DOM files |

---

## 2. Relationship Model

`js/role-management/role-relationships.js`, pure, expects roles in the
shape `role-management-center.js#getAllRoles()` produces: `{id, label,
type, record}`, where `record` is the raw `customRoles/{id}` node (or
`null` for a System Role).

```
resolveDerivedFrom(role, allRoles)   -> {id, label} | null
findDerivedRoles(role, allRoles)     -> [{id, label}]   (DIRECT children only)
buildRelationshipGraph(allRoles)     -> {forward: Map, reverse: Map, stale: Set}   (one O(n) pass)
buildRoleRelationships(role, graph)  -> {roleId, roleType, derivedFrom, derivedFromStale,
                                          derivedRoles, createdAt, updatedAt, archivedAt, status}
```

**Lineage resolution** prefers the new `clonedFromId` (a stable id) and
falls back to case-insensitive label matching against the older
`clonedFrom` string for records created before this phase. A **claimed but
unresolved** lineage (source renamed or archived) sets `derivedFromStale:
true` rather than silently returning `null` — the staleness the brief's
own investigation flagged (`clonedFrom` is a display label, not an id) is
now observable instead of hidden.

**Direct children only**: for a clone chain A → B → C, `findDerivedRoles(A)`
returns only B, never C. A grandchild's lineage is that child's own
Derived Roles entry, not transitively rolled up — this matches how the
brief's examples describe "Derived Roles" (what was cloned FROM this
role), not a full descendant tree.

System Roles get `createdAt`/`updatedAt`/`archivedAt: null` — they are
code-defined and have no lifecycle timestamps. This is a real `null`, not
a fake date standing in for "unknown."

---

## 3. Dependency Strategy

`js/role-management/role-usage-provider.js` is the actual plug point:

```
registerRoleUsageProvider({ getUsage(roleId) })   // future User Management calls this ONCE at its own boot
resetRoleUsageProvider()                          // restores the default zero provider
getRoleUsage(roleId) -> {assignedUsers, assignments, dependencies, consumers}
```

The default (and today's only) provider always returns zeros. `getRoleUsage()`
normalizes whatever the active provider returns — missing/malformed
fields coerce to `0`/`[]` — and catches a throwing provider, falling back
to zero usage. A broken future provider can never crash Role Management.

`js/role-management/role-archive-guard.js#canArchiveRole(roleId, deps?)`
consults `getRoleUsage()` and blocks when `assignedUsers > 0` or
`dependencies` is non-empty, returning `{allowed, reason, usage}`. Wired
into `role-management-center.js#deleteSelectedRole()` **before** the
native `confirm()` dialog, so a future real block never even prompts.
Today `allowed` is always `true`, so every admin's experience is
unchanged this phase.

**No other Role Management file needs to change** when a future User
Management phase registers a real provider — `role-archive-guard.js` and
`role-summary-model.js`'s `assignedUsers` field both already read through
this single indirection.

---

## 4. Role Lifecycle

```
System Role (code-defined, frozen)
        │  status is always ACTIVE, no archive path exists
        ▼
Custom Role created (Clone, v1.30.2)
        │  clonedFromId + clonedFrom both recorded (v1.30.3, additive)
        ▼
buildRoleRelationships() resolves lineage on every read — never stored
as a derived value, always recomputed from clonedFromId/clonedFrom
        │
        ▼
role-status.js#deriveRoleStatus(): archived:true wins over any stored
status field wins over a derived default (mirrors drivers-store.js)
        │  Delete (v1.30.2) → canArchiveRole() (v1.30.3, NEW gate)
        ▼
   allowed?  ── no (future) ──▶ error shown, confirm() never opens
        │
       yes (today, always)
        ▼
archiveCustomRole(): {archived:true, archivedAt} → status becomes ARCHIVED
```

A System Role never enters the archive branch at all — `role-status.js`
returns `ACTIVE` unconditionally for `type === 'system'` regardless of any
stray flags, matching v1.30.2's existing UI guard (no Delete button is
ever rendered for a System Role).

---

## 5. Summary Model

`js/role-management/role-summary-model.js` is the single reusable model:

```
buildRoleSummary(role, allRoles, grantedSet) -> {
  roleId, name, type, permissionCount, moduleCount,
  createdAt, updatedAt, archivedAt,
  derivedFrom, derivedFromStale, derivedRoles,
  assignedUsers, status
}
buildModuleBreakdown(tree, grantedSet) -> [{module, granted, total}]
invalidateRoleSummaryCache()
```

`grantedSet` is always the caller's **persisted** set
(`role-management-center.js#resolveGrantedSet()`), never the in-progress
edit draft — a Role Summary represents saved truth. `permissionCount` is
`grantedSet.size`; `moduleCount` is the count of modules with at least one
granted permission, computed from `buildModuleBreakdown()` over the
**full** permission tree (a different, role-level concept from
`role-management-logic.js#buildSummary()`'s search-filtered view, which
the four pre-existing stat cards already show — the Detail Panel cross-
references those rather than re-rendering the same numbers).

---

## 6. Performance Report

Two caches, both signature-keyed (not reference-keyed, since
`getAllRoles()` builds fresh objects every call so identity-based
memoization would never hit):

- **Relationship graph** — keyed on a signature of every role's
  `id:clonedFromId:clonedFrom:archived`. Built in one O(n) forward pass +
  one O(n) reverse-index pass per distinct role-list shape, not per role.
- **Role summary** — keyed per-role on `id:type:updatedAt:archived:
  archivedAt:<sorted granted-permission ids>`. Two calls with unchanged
  input return the **same object reference** (proven in
  `role-summary-model-check.mjs`); a real change to either input busts
  only that role's cache entry.

`getPermissionTree()` (`role-management-logic.js`, module-load-memoized
since v1.30.1) is imported and called as-is — never rebuilt by this phase.
`invalidateRoleSummaryCache()` is the one hook, called from
`role-management-center.js`'s existing `registerCustomRolesChangeListener()`
— system roles never change at runtime, so no separate invalidation path
was needed for them.

---

## 7. Testing Summary

**83 new pure-Node cases**, house convention (`scripts/<domain>-check.mjs`,
no framework, `check(name, cond)`), one file per new pure module:
- `role-status-check.mjs` — 14/14 (priority order, safe defaults)
- `role-relationships-check.mjs` — 26/26 (id-priority-over-label, stale
  lineage, direct-children-only across a 3-generation chain, graph/per-role
  parity, System Role nulls)
- `role-usage-provider-check.mjs` — 14/14 (default zero shape, real swap,
  malformed-output coercion, throwing-provider safety, registration
  validation)
- `role-archive-guard-check.mjs` — 10/10 (injected-deps decisions, plus a
  second pass proving the guard is wired to the REAL provider singleton,
  not a stub, by registering/resetting a real one and watching the
  decision change)
- `role-summary-model-check.mjs` — 19/19 (full field shape for a System
  and a Custom Role, caching same/different-reference proof, a regression
  anchor against the live `permissionsForRole('admin').length` rather than
  a hardcoded number)

**3 new assertions added to the existing `custom-roles-check.mjs`**
(now 29/29) for the additive `clonedFromId` field — proves every
pre-v1.30.3 call site (which never passes `sourceRoleId`) still produces
`clonedFromId: null`, unchanged.

**`role-management-detail-dom-check.mjs` — 19/19 (new, Puppeteer)**,
reusing the existing `role-management-harness.html` unchanged. Covers:
panel starts collapsed / toggles open-closed; a genuine zero (Usage
Summary on a role with no usage) renders the real `empty()` helper, never
blank or a literal `"undefined"`; a role cloned via `clonedFromId` shows
its resolved Derived-From label; a System Role's live derived Custom Role
appears under its Derived Roles; the Future Assignment placeholder is
present and explains it awaits User Management; archiving a 0-usage
Custom Role reaches the exact same graceful-rejection path this
sandboxed no-real-Firebase-auth environment already established in the
v1.30.2 DOM check (proving `canArchiveRole()` adds no new blocking step
for the ordinary case — a genuine authenticated round-trip still can't be
verified here, same documented limitation as v1.30.2).

**Full regression, all unchanged and still green**: `role-management-
check.mjs` (38/38), `role-management-dom-check.mjs` (12/12),
`role-management-edit-dom-check.mjs` (23/23), `permission-service-
check.mjs` (56/56), `smoke-boot.mjs` (login modal / app-ready / splash /
zero fatal errors, version.json synced via `sync-version.mjs`).

---

## 8. Regression Summary

`js/config/permission-registry.js`, `js/config/role-permissions.js`,
`js/permission-service.js`, `js/config/role-registry.js`, and
`js/role-management/role-management-logic.js` are byte-for-byte unchanged.
`js/auth.js`, `js/users.js`, `js/admin.js`, and `index.html`'s
`#userFieldRole` select are untouched — no real role assignment exists
after this phase either. Warehouse/Vehicle/Engineering/Driver modules have
no imports in either direction. The only Firebase schema delta is one new
**optional** field (`clonedFromId`) on newly created clones going
forward — every existing `customRoles` record's fields and read paths are
unchanged, and every pre-v1.30.3 call site that omits `sourceRoleId`
produces byte-identical output to before.

**Feature gate decision** (confirmed with the user before implementation):
the Detail Panel ships live with **no new feature flag**, matching how
v1.30.1/v1.30.2 themselves shipped — gated only by the pre-existing
`isAdmin()` check. Every new element renders real-but-zero data (nothing
to leak), and the one behavior-adjacent change (`canArchiveRole()`) is
provably a no-op today.

---

## 9. Future User Management Integration

This phase was explicitly scoped to NOT implement User Management. What
it leaves ready:

- **Register a real usage provider**: call
  `registerRoleUsageProvider({ getUsage(roleId) })`
  (`js/role-management/role-usage-provider.js`) once at User Management's
  own boot, returning real `{assignedUsers, assignments, dependencies,
  consumers}` per role. `role-archive-guard.js` and `role-summary-model.js`
  start reflecting real usage immediately — no other Role Management file
  changes.
- **Extend the existing assignment surface, don't rebuild it**:
  `js/admin.js` + `js/users.js` already have full user CRUD; the actual
  missing piece is teaching `index.html`'s `#userFieldRole` (or its
  replacement) about Custom Roles, and deciding how a user's `role` field
  references one without colliding with the System Role id space (Custom
  Role ids are already namespaced `role_*`, so no collision exists today —
  making that a permanent contract, not an accident, is worth doing
  explicitly, same open item v1.30.2's report already flagged).
- **`permission-service.js`'s cache assumption**: today `can()` caches a
  permission Set per role forever, safe because System Role grants are
  frozen. Once a real user can hold a Custom Role, that role's permissions
  can change at runtime (an admin edits it) — the cache would need either
  a TTL or a subscription-driven invalidation, unlike today's
  frozen-forever System Role sets. Not built now since nothing consumes
  `permission-service.js` yet (still foundation-only since v1.30.0).
- **Lineage backfill (optional, not required)**: old `customRoles` records
  created before v1.30.3 only have the label-based `clonedFrom` — they
  resolve correctly via the fallback in `role-relationships.js`, but stay
  staleness-prone if their source is ever renamed. A one-time backfill
  script to populate `clonedFromId` for existing records was considered
  and deliberately left out of scope — it wasn't asked for, and every
  current record resolves fine today.
