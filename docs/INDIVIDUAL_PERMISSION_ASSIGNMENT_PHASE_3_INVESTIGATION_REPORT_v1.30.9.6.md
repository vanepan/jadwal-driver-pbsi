# Individual Permission Assignment — Phase 3 Investigation Report (targeting v1.30.9.6)

**Status: investigation only at time of writing. No code was written when this
investigation was performed. This document formalizes the investigation
report already delivered in-conversation before Phase 3A implementation
began.**

For every conclusion below: **FACT** = directly verified from source,
**INFERENCE** = derived from existing architecture, **OPEN DECISION** =
required a product choice (resolved in the Phase 3A authorization that
followed this report).

---

## 1. Current Architecture

**FACT.** Three layers already exist and are fully wired: the Permission
Registry (`js/config/permission-registry.js`, 50 permissions), the override
storage (`js/permission-management/user-permission-overrides-store.js` +
`-rules.js`, Phase 1, v1.30.9.1), and the runtime resolution
(`individual-permission-provider.js` + `permission-service.js`, Phase 2,
v1.30.9.5). Re-verified by grep: no UI file imports the store or the
provider — nothing has been built on top of Phase 1/2 yet.

## 2. Existing User Management Flow

**FACT**, traced in `js/admin.js` + `index.html`: the entire Edit User UI is
one `<form id="userForm">` with one submit handler
(`handleUserFormSubmit()`) touching only `displayName`/`role`/`active`(/`pin`
on create). `openUserFormModal(username)` populates fields and calls
`renderUserRoleSummaryPanel()`, which recomputes a 4-tile `v2-dq-stats`
summary (Tipe Role / Status Role / Permission / Modul) from the **currently
selected** role in the dropdown via `role-catalog.js#resolveGrantedSet()` +
`role-summary-model.js#buildRoleSummary()`. The existing Reset PIN flow
(v1.30.9.3/9.4) is the direct precedent for "an independent, immediate
action button living inside the same `<form>`, using `type="button"` so it
never triggers the main Save" — `#btnResetPinFromEdit` calls
`callResetUserCredential()` immediately, with its own toast/confirm flow,
never touching `#btnSaveUserForm`.

## 3. Permission Registry Findings

**FACT.** 50 permissions, `{id, title, description, module, category}`, no
`active`/`deprecated` flag. **FACT, flagged per this investigation's own
explicit instruction not to assume `system.admin` is the only dangerous
permission**: `system.users.manage` ("Create, edit, and deactivate user
accounts and role assignments") is granted only to `admin`'s `BASE_GRANTS`
alongside `system.admin`, and has **zero consumers anywhere in the
codebase** (verified by grep) — currently inert, but administrative by
description, and not blocked by the storage/rules layer the way
`system.admin` is.

## 4. Existing Override Storage API

**FACT.** `getUserPermissionOverrides(username)` (one-shot read, fail-closed
to empty `Set` on any denial/error — **never throws, by design**),
`grantUserPermission(username, id)`, `revokeUserPermission(username, id)`
(each an immediate, independent write). Sufficient for the UI as-is — no
bulk API needed, none proposed.

## 5. Existing Runtime Integration

Unchanged, untouched by this phase — the UI is a pure consumer of the
one-shot write API in §4, never the live runtime cache (which is
session-scoped to whoever is logged in, not whoever is being edited).

## 6. Proposed UX / 7. Save-Revoke Model / 8. Security / 9. User-State /
## 10. Mobile UX / 11-12. Files / 13. Test Plan / 14. Open Decisions /
## 15-18. Version, Phases, Risks, Recommendation

Full detail for all of these sections was delivered in the conversation
turn immediately preceding Phase 3A's authorization. Load-bearing findings
carried into the Phase 3A implementation:

- **Immediate save** (§7): the storage API's own shape (independent
  per-action writes, no batching) plus the Reset PIN precedent both point
  to grant/revoke executing immediately, never bundled into
  `#btnSaveUserForm`.
- **`role-summary-model.js#buildRoleSummary()` caching hazard** (§14): its
  cache is keyed by `role.id` alone, globally — feeding a per-user
  effective (base ∪ override) set into it would cross-contaminate the
  cache across different users sharing a role. Any "effective permissions"
  computation for this feature must be a small, separate, local
  calculation, never routed through that shared model.
- **CSS/event-delegation reuse is safe**: Role Management's delegated
  `change`/`click` listeners are bound to its own mount container
  (`root.addEventListener(...)`, not `document`), so visually reusing its
  `.rm-*` component language for a new picker in a different DOM subtree
  cannot cross-trigger its handlers.
- **`system.users.manage` exclusion** was a flagged recommendation here,
  since confirmed as a final product decision in the Phase 3A
  authorization (excluded from the picker, UI-layer only, no storage/rules
  change).

See `docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3A_REPORT_v1.30.9.6.md`
(written after implementation) for what was actually built, including the
one known, reported gap this investigation's §14/§17 anticipated the shape
of: the storage API's fail-closed-never-throws contract means a
Firebase-read **error** cannot currently be distinguished from a
genuinely-empty override set through the existing API alone.
