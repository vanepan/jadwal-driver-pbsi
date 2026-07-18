# Sarpras Intelligence V2 — Phase 10, Sprint 10.8: Pilot GA Readiness

> Scope: determine whether the Review Workspace built in Sprints 10.1-10.7
> is ready to hand to real reviewers, per this sprint's own 8 review
> dimensions — the same 8 Sprint 9.8 used, for direct comparability.
> Method: synthesizes every measured fact from Sprints 10.1-10.7 (each
> independently reproducible via `scripts/composer-foundation-check.mjs`,
> 69/69 passing, and `scripts/review-workspace-render-check.mjs`, 46/46
> passing) — no new measurement invented here, only integrated. Documentation
> only, no new code, matching Sprint 9.8's own precedent exactly.

---

## Go / No-Go Recommendation

**GO — for a scoped, human-supervised pilot of the Review Workspace
itself (Draft → In Review → Needs Revision → Approved → Published, with
PDF/Word export and Archive recording), covering the SAME 3 evidenced NOR
Types Sprint 9.8 cleared (Realisasi Petty Cash, Perjalanan Dinas,
Pengadaan). NO-GO for unsupervised, organization-wide rollout, and NO-GO
for treating an exported PDF/Word file as a final, sendable document
without further manual work.**

Sprint 9.8's own verdict — "A human must review, complete the
recipient/cc block, add the itemized cost/purchase table, and format the
final document by hand, every time" — is **unchanged by Phase 10**, and
said so explicitly inside the new export template itself (a disclaimer
line on every generated PDF/Word file). What changed is that a human now
has a real, working SURFACE to do that reviewing on — which is precisely
the gap Sprint 9.8 named as the single largest one left.

---

## 1. Review — the 8 named dimensions

**Knowledge.** Unchanged by this phase. 150 Approved nor-domain
KnowledgeItems, same as Sprint 9.8 left them — Phase 10 is presentation
and workflow, not knowledge authoring.

**Conversation.** Unchanged by this phase, with one new real link:
`composeApprovedNor()`'s `conversationId` is now persisted alongside the
document (Sprint 10.2) and resolvable from the Explainability tab. Not
independently verified end-to-end against a real multi-turn Conversation's
full history — the automated suite confirms the *plumbing* (the id flows
through correctly), not that a real Conversation's turn-by-turn history
renders usefully for a reviewer.

**Reasoning.** Unchanged in the engine itself (Sprint 9.5's fix stands).
Newly REACHABLE by a human for the first time: Sprint 10.2's
Explainability tab shows the real `citedRuleIds`/confidence/conflicts for
any document, not just the one most recently composed — verified live
against the real pipeline (`north-star-acceptance-check.mjs`: every real
`citedKnowledgeId` a live composition cites resolves to a real, Approved
KnowledgeItem).

**Composition.** Unchanged. Same gaps Sprint 9.8 named (recipient/cc/
sender knowledge missing for Perjalanan Dinas and Pengadaan; no itemized-
table Conversation path) remain exactly as they were — Phase 10 did not
touch composition itself, only what happens to a document AFTER it is
composed.

**Validation.** The acceptance harness grew further this phase:
`composer-foundation-check.mjs` 32→69 checks across Sprints 10.1-10.7 (all
additive, each because a real new behavior needed proving), plus a
SECOND, NEW harness this phase specifically required —
`review-workspace-render-check.mjs`, 11→46 checks — because Node-only
checks cannot see a DOM, a click, or a real CDN network call, and this
phase's whole subject was exactly that surface. `smoke-boot.mjs`,
`archive-ownership-check.mjs`, `conversation-ownership-check.mjs`,
`knowledge-ownership-check.mjs` all re-verified green after every sprint,
not only at the end.

**Evidence.** Unchanged — no new organizational documents were reviewed
this phase (Phase 10 was engineering, not evidence-onboarding, matching
this project's own established rhythm of alternating the two).

**Review. The dimension this entire phase exists to fix — and it is
fixed, within a real, honestly-scoped boundary.** Sprint 9.8: "No real
human-review surface exists for a composed ComposerDocument beyond a
dev-mode section-count viewer." Now: a real Review Workspace
(`ui/review-workspace.js`) showing every section's actual content, who
wrote or edited each one, a real approval/rejection/revision-request
workflow with "No automatic approval" enforced at the DATA layer (not
just hidden behind a button), real reviewer/approver role capabilities,
and real PDF/Word export with archive recording on publish. **What is
still NOT real**: `isDeveloperMode()` gates the Explainability tab, not a
true Reviewer-role check — a platform-wide flag, not
`sic.review.act`/`sic.approve.act` (Sprint 10.5's own capabilities exist
but were never applied to that ONE tab); editing a section is not yet
recorded as organizational Learning (a real, still-open question, not an
oversight — see Sprint 10.3/10.7's own notes); and the single-pilot gate
(`isV2Enabled()` requiring `role:'admin'` AND `username:'evan'`) means
every real capability check this phase built has been exercised only by
constructed test sessions, never by an actual second, non-admin pilot
user.

**Operational Process.** Unchanged — Phase 10 extended the platform, not
the organizational evidence-onboarding process Sprint 9.1-9.3 established.

---

## 2. Measured Metrics

| Metric | Value |
|---|---|
| Node acceptance checks (composer-foundation-check.mjs) | 69/69 (100%), grown from 32 at Sprint 10.1's start — every check added because a real behavior needed proving |
| Real-browser acceptance checks (review-workspace-render-check.mjs, new this phase) | 46/46 (100%), grown from 11 — the only suite in this codebase that drives a real DOM click flow AND real CDN network calls (pdfmake, html-docx-js) for this workspace |
| Full pre-existing regression suite | 7 scripts, all green, unchanged pass counts throughout — zero regressions introduced across 7 sprints |
| Review lifecycle states implemented | 6 of 6 (Draft, In Review, Needs Revision, Approved, Rejected, Published) — all legal transitions checked live |
| Export formats | 2 of 2 named in spec (PDF, Word) — both verified to produce real, correctly-typed, non-trivial Blobs via live CDN loads in this environment |
| "No automatic approval" enforcement | At the store layer (`transitionStatus` itself refuses a blank rationale), not only the UI — verified by direct Node call AND a live browser click with a blank field |
| Role capabilities added | 2 (`sic.review.act`, `sic.approve.act`), mapped to existing `admin`/`bidang` roles — no new role family invented |
| Pilot UX metrics implemented | 5 of 5 pure-aggregation metrics + 1 of 1 new capture point (satisfaction rating) — all verified against real seeded data in the same test run |
| Production risk | **Medium** for the Review Workspace itself, for the same 3 evidenced NOR Types, in a supervised pilot (every workflow, role, and export path is real and tested); **High** for unsupervised use by a genuinely different (non-admin) reviewer role, since that path has never been exercised outside constructed test sessions |

---

## 3. Production Readiness Report — by capability

| Capability | Ready for supervised pilot? | Not ready for broader rollout because |
|---|---|---|
| Draft Preview / Metadata / Version History (10.1) | Yes | RTDB persistence path itself (survives a real refresh) verified only via `smoke-boot.mjs`'s boot check, not a real multi-day session |
| Explainability (10.2) | Yes, Developer Mode only | Gated by a platform-wide flag, not the real `sic.review.act` capability — a genuine gap between what Sprint 10.5 built and where it was applied |
| Document Editor (10.3) | Yes | Edits are not yet recorded as organizational Learning — a real, explicitly deferred question, not a defect |
| Review Workflow (10.4) | Yes | "Published" is a legal state in the contract with no UI path to it except through Sprint 10.6's real Terbitkan action — consistent, not a gap |
| Approval Workflow (10.5) | Yes, for the current single pilot user | Role differentiation (reviewer vs. approver) has never been exercised by a real second user — every proof is a constructed browser session |
| Export & Publishing (10.6) | Yes, for a working draft handed to a reviewer | The exported PDF/Word is explicitly NOT the official PBSI NOR letterhead format — recipient/cc/itemized-table/signatory blocks remain 100% manual, unchanged from Sprint 9.8 |
| Pilot UX Validation (10.7) | Yes, mechanically | Metrics verified on 1-2 documents per check, never at real multi-week pilot volume — statistical usefulness at scale is unknown |

---

## 4. Phase 11 Backlog (priority order, not started)

1. **Apply real `sic.review.act` gating to the Explainability tab** —
   currently `isDeveloperMode()` only, a platform-wide flag that predates
   Sprint 10.5's real capability work; the single most concrete, smallest
   gap this phase leaves behind.
2. **Decide the editing-as-Learning-Correction question** — should a
   Document Editor edit become a recorded organizational Correction (like
   Knowledge Center's "Request Changes" already does), and if so, at every
   edit or only at Approval time comparing AI-composed vs. human-final?
   Deliberately left open by Sprints 10.3 and 10.7, not by oversight.
3. **Obtain a second real pilot user with a non-admin role** — every
   `sic.review.act`/`sic.approve.act` proof in this phase is a constructed
   test session; the single-pilot gate means the real capability
   differentiation has never been exercised by an actual second person.
4. **Verify the real Settings → Power View → Review Workspace click path**
   end to end with real production credentials — the one verification
   every single sprint report in this phase (10.1 through 10.7) names as
   explicitly NOT done in this environment, for the same reason each time
   (no production Firebase credentials available here).
5. **Real Conversation History usefulness** — the Explainability tab's
   plumbing is proven correct (the `conversationId` flows through), but
   whether a real multi-turn Conversation's history renders usefully for a
   reviewer, versus just plumbing that happens to work, is untested.
6. **Recipient/cc/sender Knowledge for Perjalanan Dinas and Pengadaan** —
   unchanged from Sprint 9.8's own backlog item #2; still the real
   blocker between "a working draft" and "a sendable NOR" for both new
   types, regardless of how good the review surface around it becomes.
7. **The itemized-table/repeating-field Conversation gap** — unchanged
   from Sprint 9.8's own backlog item #3, same reasoning.
8. **A real, at-scale pilot run** — Sprint 10.7's metrics are mechanically
   correct but statistically untested; only real, sustained reviewer usage
   answers whether "average review duration" or "most-corrected field"
   says anything organizationally useful.
