# RHO-13 — "Total Tasks" tile navigates to Routines instead of the Calendar

**Jira:** RHO-13 · Bug · Medium.

## Problem
On the dashboard weekly stats, clicking the "Total Tasks" number takes you to the Routines
(`/schedule`) page instead of the calendar, unlike the other task tiles.

## Root cause
One-line wrong route: the "Total Tasks" StatCard uses `onClick={() => navigate("/schedule")}` at
[HomeDashboard.tsx:122-127](../../src/components/HomeDashboard.tsx#L122-L127). Every sibling tile
(Completed, Overdue, Pending, Auto) navigates to `/dashboard?view=calendar&date=…` (lines 133, 143,
149, 155). `/schedule` = BlueprintManager/Routines — matching the report.

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) (Routes table: `/schedule` = BlueprintManager, `?view=calendar` = Calendar)

## Recommended fix
Change [HomeDashboard.tsx:126](../../src/components/HomeDashboard.tsx#L126) to match the siblings:
`onClick={() => navigate(\`/dashboard?view=calendar&date=${new Date().toISOString().split("T")[0]}\`)}`.

## Tests
- E2E: click the Total Tasks tile, assert URL contains `view=calendar`.

## Risks
- None; identical pattern to the neighbouring tiles.
