# Usability Sweep — Wave 7

## Goal
Implement all usability improvements identified in the Wave 7 new-user audit (scored against 10 gardening-app-specific criteria). Every section scoring below 90/100 gets improvements. Changes are purely UI/copy — no data model changes.

## Sections & Changes

| Section | Score | Key Changes |
|---------|-------|-------------|
| Navigation/App Shell | 67 | Rename "Garden"→"Plants", "Plan"→"Planner" in sidebar |
| Ailment Watchlist | 65 | Page subtitle, empty state with Doctor link, rename "Perenual"→"Plant Database" tab |
| Plant Visualiser | 65 | Explainer card, rename step 2, rename "Art Ready" |
| Optimise Tab | 68 | Intro card, rename AI button, empty result state, rename history section |
| Blueprint Manager | 70 | Standardise "schedule" text, fix search placeholder, fix delete copy |
| Garden Profile | 71 | Rename "Home Profile"→"Garden Profile", subtitle changes, reset label |
| Audit Page | 72 | Subtitle, rename token columns, empty state |
| Location Manager | 74 | Hierarchy explainer banner, optional labels on advanced metrics |
| The Shed | 76 | Rename "Add"→"Add Plant", source filter rename, subtitle, "instances" copy |
| Planner Dashboard | 76 | "Landscape Planner"→"Garden Planner", "Pending"→"Active" tab |
| Community Guides | 76 | Add subtitle, improve empty state copy |
| Account Menu | 78 | Rename "Home Management"→"Members & Permissions" |
| Guides | 80 | First-visit banner CTA, fix "Learn & Grow"→"Guides Library" |
| Dashboard | 82 | "Auto-completed"→"Done automatically", "Skipped by Rain"→"Skipped (rained)" |
| Plant Doctor | 83 | Subtitle change, "Remedial Plan"→"Treatment Plan" |
| Shopping Lists | 84 | Add subtitle, update empty state |
| Getting Started Checklist | 85 | Fix dismiss button, update Step 4 description |

## Files Modified
- src/App.tsx (nav labels)
- src/components/AilmentWatchlist.tsx
- src/components/PlantVisualiser.tsx
- src/components/SpriteWizardModal.tsx
- src/components/OptimiseTab.tsx
- src/components/BlueprintManager.tsx
- src/components/GardenProfile.tsx
- src/components/AuditPage.tsx
- src/components/LocationManager.tsx
- src/components/TheShed.tsx
- src/components/PlannerDashboard.tsx
- src/components/CommunityGuidesTab.tsx
- src/components/UserProfileDropdown.tsx
- src/components/GuideList.tsx
- src/components/HomeDashboard.tsx
- src/components/PlantDoctor.tsx
- src/components/ShoppingLists.tsx
- src/components/GettingStartedChecklist.tsx

## No new files, no DB changes, no API changes.
