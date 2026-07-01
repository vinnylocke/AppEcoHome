# RHO-11 — Daily Brief "Got a plant question?" chip shown for non-AI (Sprout) users

**Jira:** RHO-11 · Bug · Medium · Sprout. **Same defect as [RHO-10](RHO-10-plant-chat-ungated.md) — fix together.**

## Problem
The Dashboard summary (Daily Brief) shows a "Got a plant question?" chip that opens the AI plant
chat, for a Sprout user who has no AI access. It should be hidden for non-AI tiers.

## Reproduction (confirmed 2026-07-01)
Sprout dashboard: the "Got a plant question?" chip is present in the Daily Brief and opens the same
chat panel as the FAB.

## Root cause
The chip is always rendered at
[DailyBriefCard.tsx:266-287](../../src/components/DailyBriefCard.tsx#L266-L287); on click it calls
`setIsOpen(true)` from `usePlantDoctor()` ([:44](../../src/components/DailyBriefCard.tsx#L44)). The
card receives no AI/tier prop ([Props, :7-18](../../src/components/DailyBriefCard.tsx#L7-L18)) and has
no `ai_enabled` check.

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) (Daily Brief flow lists the chip)
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md)

## Recommended fix
Pass `aiEnabled` into `DailyBriefCard` (App.tsx already has `profile.ai_enabled`) and wrap the "Got a
plant question?" button in `{aiEnabled && (…)}`. Do this in the **same task as RHO-10** so the FAB +
chip are gated together and consistently.

## Tests
- E2E (Sprout): assert the "Got a plant question?" chip is absent from the Daily Brief.

## Docs
- Update the Daily Brief app-reference (`05-daily-brief-card.md`) to note the chip is AI-gated.
