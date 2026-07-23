# Menu / Route Information-Architecture Reorg (Follow-up #6)

**Status:** PLAN — awaiting owner approval. Do not implement until the judgment calls below are answered.
**Date:** 2026-07-23
**Source:** 5-surface parallel IA audit (nav spine, Tools hub, profile dropdown, route table, admin/gating) + architect synthesis.

## Goal

The owner asked for a deep-dive on the whole menu/route IA: *"make sure everything is in a logical place — the tools menu should have appropriate tools, account items under the user profile dropdown, etc."* This plan separates **clear fixes** (unambiguous, just-do-it) from **judgment calls** (owner decisions) and lists the **doc drift** the audit surfaced.

## App-reference files consulted

- `docs/app-reference/09-persistent-ui/01-header.md`, `02-sidebar.md`, `11-bottom-tab-bar.md`
- `docs/app-reference/05-tools/01-tools-hub.md`, `10-garden-profile.md`
- `docs/app-reference/06-account/09-user-profile-dropdown.md`
- `docs/app-reference/07-management/08-audit-log.md` (+ plant-library / ai-calls / content-feedback admin)
- `docs/app-reference/99-cross-cutting/21-routing.md`, `17-tier-gating.md`, `18-beta-gating.md`, `19-rls-patterns.md`
- `docs/app-reference/00-INDEX.md`

## Part A — Clear fixes (implement on approval, no owner decision needed)

| # | Change | Source file(s) | Docs to sync |
|---|--------|----------------|--------------|
| A1 | **Remove "Routines" (`/schedule`) from the profile dropdown's Management section** (`UserProfileDropdown.tsx` ~L203). It's already primary under Planner (PlannerHub "Routines" tab embeds BlueprintManager; `/schedule` is in Planner's nav matchPaths; still linked from TaskModal/TaskList). De-dupes the leak the owner named. | `UserProfileDropdown.tsx` | user-profile-dropdown.md, blueprint-manager ref, e2e Page Object + test-plan |
| A2 | **Move Audit Log into a new "Admin & Oversight" dropdown section**, rendered on `(canViewAudit \|\| isAdmin)`; Audit Log stays gated on `canViewAudit`, the 4 platform-admin items stay on `isAdmin`. (Keeps non-admin owners with `can_view_audit`.) | `UserProfileDropdown.tsx` | user-profile-dropdown.md, 08-audit-log.md |
| A3 | **Add a "Review & Plan Ahead" group to `ToolsHub.tsx`**: move the Garden Reports tile out of "Measure & Track" into it, and **add a Weekly Overview tile** (`/weekly`, testid `tools-hub-weekly-overview`) — `/weekly` is already in the Tools nav matchPaths but has no tile. Gate the Weekly tile behind the same `ai_insights` FeatureGate the dashboard WeekAheadPreview uses. | `ToolsHub.tsx` | 01-tools-hub.md, e2e Page Object + test-plan |
| A4 | **Remove the duplicate desktop overdue badge** from the sidebar Dashboard item (`App.tsx:1390`), leaving the count only on the header Today's-Tasks tray trigger (the surface that opens the tray). Mirrors the shipped mobile "one badge on the surface that answers it" decision. | `src/App.tsx` | 02-sidebar.md |
| A5 | **Rewrite the stale `bottomTabs` comment** (`App.tsx:1412-1414`) — it claims Plant Doctor "gets its own slot" (removed Phase 6b → now the Capture-FAB hero) and that Tools matchPaths "exclude /doctor" (they include it). Comment-only. | `src/App.tsx` | 02-sidebar.md |
| A6 | **Split "Sync now" + "Check for update" into their own "System" section** in the dropdown (they're offline-queue / PWA actions, currently mislabelled under "Help"). Stays in the dropdown — just correctly labelled. | `UserProfileDropdown.tsx` | user-profile-dropdown.md |

## Part B — Judgment calls (owner decides before I touch them)

1. **Integrations placement** — it's hardware pairing (Ecowitt sensors/valves) sitting under "AI & Tools", and *also* promoted as a big "Connect Hardware" CTA inside the Tools hub despite being first-class nav. Options: new "Devices" group / move to "Garden" / rename group to "AI, Tools & Devices" + drop the CTA / just drop the duplicate CTA. **Rec:** new "Devices" group; keep the CTA only if documented as a deliberate first-run exception.
2. **Location Manager (`/management`) discoverability** — only reachable via the account dropdown, yet it owns the only editor for per-area advanced metrics. Options: status quo / add a "Manage locations & areas" link from the home grid overflow / move it out of the dropdown entirely / relabel. **Rec:** add a grid-overflow link, keep the dropdown as secondary (avoids breaking deep-links).
3. **Plant Doctor desktop prominence** — mobile has the Capture-FAB hero; desktop only has a Tools tile + header quick-add. Options: status quo / dedicated sidebar item / standing header action. **Rec:** add a sidebar item only if desktop parity is desired; status quo is defensible.
4. **`/gardener` (Account Settings) vs `/profile` (Garden Preferences)** — confusingly similar. Options: fix labels/docs only / rename to `/account` + `/preferences` with redirects / merge into one tabbed page. **Rec:** fix labels/docs now; rename only if real confusion shows (rename touches many deep-links).
5. **Journal nav group** — sits under "Plan" but the app's own INDEX files it under "Garden Hub", and it's a retrospective diary, not forward planning. Options: move to "Garden" / keep under "Plan" and re-file the INDEX / leave the mismatch. **Rec:** move to "Garden".
6. **`/admin/ai-calls` vs Audit Log "AI Usage" tab** — overlapping `ai_calls` data, two gates (`is_admin` vs `can_view_audit`), no cross-link. Options: merge into Audit Log with an "all homes" toggle / keep both + differentiate copy + cross-link / leave. **Rec:** short-term keep both + disambiguate; consider merge later.

## Part C — Doc drift to fix (mandatory app-reference sync)

1. **`21-routing.md`** — six confirmed drifts: stale `/ailment-library` (now a redirect), missing redirect-table row, `/quick` note (quick-launcher fully deleted 2026-07-23), orphaned `/quick/calendar`, stale quick-add deep-link table (7 rows → live 5, incl. undocumented Diagnose→/doctor), and the mobile bottom-tab reparenting section (rewrite for the Phase 6b Deck).
2. **`06-account/09-user-profile-dropdown.md`** — admin section lists 2 items, code renders 4 (add Plant Library + AI Calls); rename "Task Manager"→"Routines" (+ note its removal); copy drift ("Garden Quiz & Preferences"→"Garden Preferences", "Image credits"→"Credits & sources"); reflect A2/A6 sections.
3. **`00-INDEX.md`** — add missing rows: `07-management/10-plant-library-admin.md`, new `11-ai-calls-admin.md`, new `12-content-feedback-admin.md`; reconcile Journal/Notes filing with the nav decision (judgment call 5).
4. **`09-persistent-ui/02-sidebar.md`** — add `/reports` to Tools matchPaths; delete the false "Plant Doctor has a mobile bottom-tab" pitfall (contradicts its sibling `11-bottom-tab-bar.md`); reflect A4.
5. **`09-persistent-ui/01-header.md`** — refresh the header line-range citation (now ~1497-1575).
6. **`05-tools/01-tools-hub.md`** — fix the stale GROUPS snippet (measure group must include garden-reports; Diagnose tool id is `plant-doctor` not `garden-ai`); add the new "Review & Plan Ahead" group; note `/weekly` matchPaths.
7. **`05-tools/10-garden-profile.md`** — Garden Profile has no Tools tile (entry points are the dropdown + onboarding); move the file to `06-account/` or add a top note; update INDEX.
8. **`07-management/08-audit-log.md`** — header says "Admin / audit.view_all only" but the real gate is `can_view_audit` (independent of `is_admin`); correct the conflation.
9. **Create `07-management/11-ai-calls-admin.md`** from `_template.md` (`/admin/ai-calls`, `AiCallsAdmin.tsx`, is_admin-gated, cross-link to audit log).
10. **Create `07-management/12-content-feedback-admin.md`** from `_template.md` (`/admin/content-feedback`, `ContentFeedbackAdmin.tsx`, is_admin-gated).

## Risks

- **A1** — any Playwright spec/Page Object asserting the dropdown `user-profile-task-manager` testid breaks; update in the same task.
- **A2** — must render on `(canViewAudit || isAdmin)`, each item independently gated, or non-admin owners lose Audit Log. Verify against a `can_view_audit`-but-not-admin account.
- **A3** — a Weekly tile with no gate would route lower tiers to a gated page; mirror the `ai_insights` gate. Decide whether the whole new group gates consistently (Garden Reports' current tile has no gate).
- Every new tile/section/label needs a `data-testid` + Playwright coverage + e2e-test-plan rows; the ToolsHub reshuffle + dropdown changes shift Page Object selectors and group-count assertions.
- Doc debt is large (21-routing.md alone has 6 drifts; two shipped admin surfaces have zero app-reference files) — leaving it violates the sync mandate and keeps misleading future IA work.

## Proposed sequencing

Ship **Part A + Part C** together as one reviewed batch (clear fixes + their mandatory doc sync + the standalone doc-drift fixes), each with tests. Hold **Part B** for a follow-up once the owner answers the 6 judgment calls — several are one-liners (labels/docs), a couple move nav groups.
