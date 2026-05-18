# Plan — Week Overview slash separators + colour legend tooltip

## Changes

### 1. Slash separators between coloured numbers (`src/components/HomeDashboard.tsx`)
Render a `/` divider between each non-zero bucket number. Use a muted colour
(white/40 on today's green card, on-surface/25 on other cards) so it reads as
a separator, not a digit.

### 2. Colour legend on hover / tap
- **State**: `activeDay: string | null` + `leaveTimeout` ref in `StatsPanel`.
- **Desktop (pointer)**: `onMouseEnter` on the day card sets `activeDay`; `onMouseLeave` clears it after a 300ms delay (prevents flicker).
- **Mobile (touch)**: `onClick` on the numbers cluster stops propagation (so the card doesn't navigate) and toggles `activeDay`. Tapping anywhere else on the card still navigates.
- **Display**: a pill row rendered below the week strip (no absolute positioning — avoids being clipped by the `overflow-x-auto` scroll container). Pills show e.g. "2 overdue", "1 completed late", "3 on time", "1 pending" in their respective colours with a tinted background. Disappears when a different day is hovered or tapped.

### 3. `docs/deployment.md` — add explicit git commit step
Insert **Step 1: Commit and push to GitHub** between "Step 0: Release notes" and the current "Step 1: Deploy". Include the two commands: `git add` / `git commit` + `git push origin main`.
