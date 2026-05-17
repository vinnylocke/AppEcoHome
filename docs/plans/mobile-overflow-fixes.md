# Plan — Mobile Overflow & Tab Bar Fixes

## Problem

Several sections overflow the viewport on narrow phones (375px, 360px), causing the entire page to scroll horizontally or tabs to wrap awkwardly. Specifically: Guides tab bar, Ailment Watchlist add-modal tabs, Blueprint Manager tab bar, and a few other areas.

---

## Root cause analysis

### Definite overflow (page-level horizontal scroll)

**1. GuideList.tsx — line 369**
Tab bar is a plain `flex gap-1` with no overflow container. Three tabs in `uppercase tracking-widest`:
- "RHOZLY GUIDES" (~132px) + "COMMUNITY GUIDES" (~155px) + "APP HELP" (~102px) + gaps = ~397px on a 375px screen → overflows by ~22px; page scrolls right.
- Fix: wrap in `overflow-x-auto` container, add `shrink-0` to each button.

**2. BlueprintManager.tsx — line 374**
Tab bar is `flex gap-1 w-fit` (shrinks to content). On narrow screens the component's outer container has `px-4` padding, but the tab bar itself sits freely. "Task Schedules" with `px-5` = 40px + ~100px text = ~140px; "Optimise" = 40px + ~55px = ~95px; total ~239px — fits on 375px. Low risk but `w-fit` with no overflow guard can bite on 320px phones.
- Fix: change `w-fit` to `overflow-x-auto` wrapper so it scrolls if needed.

### Wrapping badly (visible but broken)

**3. AilmentWatchlist.tsx — AddAilmentModal tabs, line 802**
Tab bar uses `flex flex-wrap gap-1 mx-6`. Three tabs with `flex-1 min-w-[80px] uppercase tracking-widest`:
- Modal width on 375px phone = 375 - 32px overlay padding = 343px.
- Tab bar width = 343px − 48px mx-6 margin = 295px.
- Three buttons at ~96px each + 2×4px gaps = ~296px > 295px → wraps to two rows.
- Result: 2-tab first row + 1-tab second row (or vice versa), looks broken.
- Fix: remove `flex-wrap`, add `overflow-x-auto` on the container, add `shrink-0` on each button.

**4. PlannerDashboard.tsx — Pending/Completed/Archived tabs, line 280**
Container has `max-w-md overflow-x-auto`. Buttons are `flex-1 whitespace-nowrap px-4`. On a 375px phone:
- Available width ≈ 375 − 32px (p-4 page padding) = 343px.
- Three flex-1 tabs at 114px each. "Completed (N)" at text-sm needs ~130px.
- Result: tabs squish below comfortable touch target or overflow internally.
- Fix: reduce button padding to `px-3` on mobile (use `text-xs` instead of `text-sm`), ensure container is `w-full`.

### Modal vertical overflow (content cut off)

**5. OptimiseTab.tsx — Regenerate modal**  
Fixed modal with `max-w-sm` and no `max-h` — on small phones with a tall keyboard up, content can be clipped.
- Fix: add `max-h-[90vh] overflow-y-auto` to the modal box.

---

## Files to change

| File | Line(s) | Change |
|------|---------|--------|
| `src/components/GuideList.tsx` | 369 | Wrap tab bar in `overflow-x-auto`, add `shrink-0` to buttons |
| `src/components/AilmentWatchlist.tsx` | 802 | Replace `flex-wrap` with `overflow-x-auto`, add `shrink-0` to buttons |
| `src/components/BlueprintManager.tsx` | 374 | Replace `w-fit` tab bar with `overflow-x-auto` container |
| `src/components/PlannerDashboard.tsx` | 280–296 | Reduce tab padding/text size on mobile, ensure `w-full` |
| `src/components/OptimiseTab.tsx` | ~544 | Add `max-h-[90vh] overflow-y-auto` to regenerate modal box |

---

## Approach

- **No text is removed** — tab labels stay the same, they just scroll horizontally if they don't fit.
- **`shrink-0`** on tab buttons prevents them from being squished by flex.
- **`overflow-x-auto`** at the container level causes internal scroll without affecting the page.
- All changes are CSS-class-only — no logic changes.
- Run `npx tsc --noEmit` after to confirm no TypeScript regressions.
