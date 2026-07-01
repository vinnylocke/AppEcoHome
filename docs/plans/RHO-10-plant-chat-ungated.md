# RHO-10 — Plant Chat (FAB) is available for non-AI (Sprout) users

**Jira:** RHO-10 · Bug · Medium · Sprout. **Fix together with [RHO-11](RHO-11-daily-brief-chat-chip-ungated.md)** (same defect, two entry points, one shared chat context).

## Problem
The floating Garden-AI / Plant-Doctor chat button (FAB) is shown and fully usable for a Sprout
(non-AI) user. Plant chat is an AI feature and should be hidden for non-AI tiers.

## Reproduction (confirmed 2026-07-01)
Sprout dashboard: the chat FAB (bottom-right) is present and opens a working "Garden AI" chat panel.

## Root cause
`PlantDoctorChat` is mounted globally with only `homeId` and no gate —
[App.tsx:2008](../../src/App.tsx#L2008). The component takes `{ homeId }` only
([PlantDoctorChat.tsx:256](../../src/components/PlantDoctorChat.tsx#L256)) and always renders the FAB
([:1038-1054](../../src/components/PlantDoctorChat.tsx#L1038-L1054)). No `ai_enabled`/tier check
anywhere, though `profile.ai_enabled` is already in scope in App.tsx.

## App-reference consulted
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md) (Plant Doctor Chat → `ai_enabled`)
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) (Sprout: "No Plant Doctor chat")

## Recommended fix
Gate the mount on the AI flag: at [App.tsx:2007-2009](../../src/App.tsx#L2007-L2009) render only when
`profile?.ai_enabled`. Keyed on `ai_enabled` (the flag), not a `tierFeatures` key, since chat is an
AI-flag feature. Server already re-verifies. **Do RHO-11 in the same task** — the "Got a plant
question?" chip opens this same panel via the shared `usePlantDoctor()` context, so hiding the FAB
alone is insufficient.

## Tests
- E2E (Sprout): assert the chat FAB is absent.

## Risks
- Other entry points that call `setIsOpen(true)` on the shared context must be gated too (RHO-11 is the confirmed dashboard one).
