# UI/UX Audit v2 — January 2026

## Purpose

Score every major surface of Rhozly out of 100 against an extended UX criteria set, evaluated from the perspective of **two user personas**:

- **New Gardener** — never used a gardening app before. Wants to be guided.
- **Expert Gardener** — knows plants but new to Rhozly. Wants to move fast.

Sections scoring **below 95** get an improvement plan inline. After the audit lands, we'll pick which improvements to ship and in what order.

---

## Criteria (10 axes, 10 points each = /100)

| # | Axis | What I evaluate |
|---|---|---|
| 1 | **Navigation & Usability** | Task completion without help, primary controls in thumb reach, ≥48×48 tap targets, minimal-step flows |
| 2 | **Visuals & Layout** | Info hierarchy obvious at a glance, consistent type/icon/spacing, ample whitespace, colour signals interactivity |
| 3 | **Feedback & Errors** | Tap feedback instant, loading states visible, error messages actionable, forms validate in real time |
| 4 | **Accessibility** | Contrast ≥4.5:1, aria/role correctness, keyboard navigable, font-scale tolerant, focus rings visible |
| 5 | **Performance & Utility** | Feels fast, core feature front+centre, no perceptible jank |
| 6 | **New-Gardener Clarity** | No unexplained jargon, clear "what do I do?" signposting, friendly empty states |
| 7 | **Expert-Gardener Efficiency** | Bulk actions, sensible defaults, kbd shortcuts where applicable, low click count for common tasks |
| 8 | **Mobile UX** | Native gestures (pull-to-refresh, swipe), safe-area aware, sticky bottom-CTAs where needed, touch-action correct |
| 9 | **Cross-Platform Consistency** | The same surface feels coherent across phone + desktop; nothing breaks at any common breakpoint |
| 10 | **Content Density** | Right amount of info per screen — not crowded on phone, not anaemic on desktop |

---

## Summary Table

| # | Surface | Score | Below 95? |
|---|---|---:|:---:|
| 1 | First-Run / Auth / Welcome | 72 | ⚠️ |
| 2 | Mobile Landing — Quick Access (`/quick`) | 88 | ⚠️ |
| 3 | Desktop Dashboard (`/dashboard`) | 82 | ⚠️ |
| 4 | The Shed (`/shed`) | 86 | ⚠️ |
| 5 | Plant Edit Modal | 78 | ⚠️ |
| 6 | Planner Dashboard (`/planner`) | 89 | ⚠️ |
| 7 | Plan Staging (inside a plan) | 84 | ⚠️ |
| 8 | Garden Overhaul flow | 90 | ⚠️ |
| 9 | Plant Doctor (`/doctor`) | 80 | ⚠️ |
| 10 | Schedule / Blueprint Manager (`/schedule`) | 82 | ⚠️ |
| 11 | Location Manager (`/management`) | 76 | ⚠️ |
| 12 | Garden Profile / Quiz (`/profile`) | 81 | ⚠️ |
| 13 | Ailment Watchlist (`/shed?tab=watchlist`) | 79 | ⚠️ |
| 14 | Shopping Lists (`/planner?tab=shopping`) | 84 | ⚠️ |
| 15 | Plant Visualiser (`/visualiser`) | 78 | ⚠️ |
| 16 | Light Sensor (`/lightsensor`) | 83 | ⚠️ |
| 17 | Sun Tracker (`/sun-trajectory`) | 86 | ⚠️ |
| 18 | Garden Layout Editor (`/garden-layout`) | 81 | ⚠️ |
| 19 | Guides (`/guides`) | 80 | ⚠️ |
| 20 | Integrations & Automations (`/integrations`) | 84 | ⚠️ |
| 21 | Tools Index (`/tools`) | 76 | ⚠️ |
| 22 | Persistent Navigation | 88 | ⚠️ |
| 23 | Audit Page (`/audit`) | 65 | ⚠️ |
| 24 | Plant Library Admin (`/admin/plant-library`) | 82 | ⚠️ |
| 25 | Plant Library — Public (`/library/*`) | 85 | ⚠️ |

**Every section is below 95.** That's expected — 95+ is a polished-shipped-product bar. This document is the roadmap to get there.

---

# Detailed Section Breakdowns

## 1. First-Run / Auth / Welcome — **72/100**

### Strengths
- Auth screen is clean: email/password, Google sign-in, simple branding.
- Maintenance mode banner works.

### Gaps
- **No welcome modal or product tour** for brand-new users. They land on `/quick` (mobile) or `/dashboard` (desktop) and have no orientation.
- **No "Hi, I'm Rhozly — here's what I do" moment** — the gardener has no idea where to start.
- **Garden Quiz** is dismissable from the dashboard card; many users skip it forever.
- **Release notes modal** sometimes shows to first-time users who have no context for what changed.
- **No persona detection** — we treat experts + beginners identically.

### Improvement plan (target 95+)

1. **Welcome carousel** on first ever login (4 slides):
   - Slide 1: "Welcome to Rhozly 🌿" — one-sentence pitch.
   - Slide 2: "How Rhozly thinks" — quick visual of Location → Area → Plant hierarchy.
   - Slide 3: "Tasks that run themselves" — recurring schedules visual.
   - Slide 4: CTA — "Take the Garden Quiz (2 min)" + "Skip for now".
   - Tracked via `user_profiles.welcomed_at` so it never shows twice.
2. **Suppress release-notes modal** for users with `welcomed_at IS NULL` — they haven't seen v1 yet, so v1.1 changes are noise.
3. **Persona prompt** during the welcome flow: "Are you new to gardening or experienced?" → stored on user_profiles, used to bias future copy (e.g. show jargon tooltips for newcomers, skip them for experts).
4. **Persistent "Getting Started" checklist** on the dashboard for new users until completed: Take Quiz / Add a Location / Add a Plant / Assign to Area / Create First Task.

---

## 2. Mobile Landing — Quick Access (`/quick`) — **88/100**

### Strengths
- Tile-based layout that suits one-handed phone use.
- Personalised landing already shipped (Wave 7 — per-tile accents + welcome line).
- Tap targets generally meet 48dp.

### Gaps
- **Some tiles too generic** — "Garden" tile doesn't explain it leads to The Shed.
- **No "what's next?" suggestion** — could show the most urgent overdue task or a seasonal pick on the landing surface.
- **Cross-platform inconsistency** — desktop users never see /quick, so they miss the curated landing experience.

### Improvement plan
1. **Tile copy pass** — every tile gets a one-line subtitle clarifying destination ("Garden — your plants & areas", "Tasks — what to do today").
2. **Smart prompt row at top** — shows one of: most urgent overdue task / weather alert / seasonal pick / streak congratulation, deciding based on `useHomeDashboardStats`.
3. **Make /quick the desktop landing too**, optionally — or give desktop a `/quick`-equivalent surface so the curated affordance isn't mobile-only.

---

## 3. Desktop Dashboard (`/dashboard`) — **82/100**

### Strengths
- Weather forecast card looks great.
- Locations + Areas surfaced.
- Daily tasks list is clear.
- Assistant card is a nice persistent affordance.

### Gaps
- **Empty-home state is bleak** — 20 stat cards showing 0 isn't useful for new users.
- **No `Getting Started` checklist** for first-time users.
- **Density is overwhelming** for newcomers — weather + tasks + AI + stats all at once.
- **No "next best action"** — what should I do today? Has to be inferred.

### Improvement plan
1. **Empty-home detection** (no plants AND no blueprints) → swap the stat grid for a single 3-tile action panel: "Add a Location" / "Add Plants" / "Set a Watering Reminder".
2. **"Today" header card** with the day's most relevant action: weather warning / overdue tasks / seasonal pick. Personalised, single-take comprehension.
3. **Collapsible "Garden snapshot"** containing the existing stats — visible to experts who want them, collapsed by default for newcomers.
4. **Add the Getting Started checklist component** (shared with mobile from Section 1).

---

## 4. The Shed (`/shed`) — **86/100**

### Strengths
- Search, sort, filter all present.
- Add-plant flow has been polished extensively.
- Plant cards show photo, common name, sci name, source badge.

### Gaps
- **Source badges (Perenual, Verdantly, AI) are unexplained** to new users.
- **Sort / filter chip discovery** is OK but could be more affordant on mobile.
- **No bulk actions** — selecting multiple plants for archive/delete/assign is missing.

### Improvement plan
1. **First-visit popover** explaining the badges: "🌐 Global Database (Perenual/Verdantly), 🤖 Rhozly AI, ✏️ Manual". Dismissable, never returns.
2. **Bulk-select mode** triggered by long-press on a card on mobile, or a "Select" button on desktop. Multi-archive / multi-delete / multi-assign.
3. **Empty-state CTA polish** — "Your Shed is empty — start by searching for a plant or scanning a label" with prominent buttons.

---

## 5. Plant Edit Modal — **78/100**

### Strengths
- Tabs are logical (Care Guide, Automations, Light, Grow Guide, Companions, Instances, Community).
- "At a glance" strip at the top gives instant context.
- Recent fix to Automations tab loading.

### Gaps
- **7 tabs is a lot** — on mobile, the tab strip needs to scroll horizontally and discoverability of later tabs is poor.
- **Inconsistent loading states** across tabs — some have spinners, some have skeletons, some snap into place.
- **Care Guide tab content density** is heavy — dozens of fields presented as a wall of facts.
- **No "what does this mean?" tooltips** for technical fields (hardiness zones, watering benchmarks, pH range).

### Improvement plan
1. **Group tabs into a 2-row strip on mobile** — Care Guide / Automations / Light on top; Grow Guide / Companions / Community / Instances on bottom. Or collapse less-used tabs into a "More" dropdown.
2. **Consistent loading skeletons** across all tabs — matches the surface, never a bare spinner.
3. **Care Guide accordion** — group fields into collapsible sections (Watering, Sunlight, Soil, Hardiness, Toxicity) so the user can dive into what they need.
4. **InfoTooltip component** (already proposed for LocationManager) reused here on every technical field.
5. **Sticky save bar** on mobile (currently the Save button can be off-screen on Care Guide).

---

## 6. Planner Dashboard (`/planner`) — **89/100**

### Strengths
- Recently overhauled — header buttons fixed, plan tile button collision fixed.
- "What's a Plan?" explainer modal exists.
- Plan-card status badges are clear (Draft / In Progress / Completed / Archived).
- Overhaul construction-placeholder added.

### Gaps
- **First-time user lands on an empty grid** — the explainer modal helps but the page itself doesn't onboard.
- **AI Assistant card placement** is OK but it competes with the action buttons.
- **Filter tabs (Active / Completed / Archived) at the top of an empty list** look broken.

### Improvement plan
1. **Empty-state hero** when `plans.length === 0`: large illustration + "Plans group your plant choices, tasks, and notes into garden projects — like 'Spring Veggie Bed 2026'". Two CTAs: "Create a Designed Plan" and "Try Garden Overhaul (Sage+)".
2. **Hide filter tabs** when total plan count is 0.
3. **Move the AssistantCard below the grid** when there are plans — keep it above when grid is empty.

---

## 7. Plan Staging (inside a plan) — **84/100**

### Strengths
- 5-phase progressive disclosure works well.
- Cover image header + back arrow looks great.
- Pre-Start Review is clear.
- Phase-by-phase locking is intuitive.

### Gaps
- **Pre-Start Review's "Regenerate" button is too prominent** for users who just want to start — they tap it accidentally.
- **Phase 1's Area form is dense** — multiple selects, AI suggestion not visually distinct from user-controlled inputs.
- **Phase 2's plant-mapping UX is overwhelming** for plans with 10+ plants — vertical list, lots of dropdowns.
- **No progress percentage** visible to user.

### Improvement plan
1. **Demote "Regenerate" to secondary** — primary green button is "Accept & Start", regenerate becomes a subtle text link below.
2. **Phase 1 redesign** — wizard-within-wizard, one decision at a time (Create or Link? → Pick Location → Confirm Area Name).
3. **Phase 2 — collapsible plant cards** when plant_manifest length > 5. Selected-for-procurement count visible at the top.
4. **Progress bar at top** of staging view: "Step 2 of 5 — 40% complete".

---

## 8. Garden Overhaul flow — **90/100**

### Strengths
- New 4-step wizard with progress indicator.
- Optional Highlight step is well-explained.
- PhotoHighlighter is a delightful UX.
- Result view ties into PlanStaging seamlessly.

### Gaps
- **Cost estimate transparency** is good (£0.X displayed) but the user has no idea why ~$0.16.
- **Highlight step has no quick-start** — user might not know what to mark.
- **Lacks an Example button** showing a "good" annotated photo so newcomers see what's expected.

### Improvement plan
1. **Cost tooltip** — tap the price to see a breakdown (~$0.05 vision + 3 × $0.039 image generation).
2. **Highlight step quick-start** — three example chips above the canvas: "Mark a corner", "Mark the lawn", "Mark a problem area" — tapping each shows a brief tip ("Use the brush to outline this region").
3. **Optional sample-photo overlay** — small example of what a well-highlighted photo looks like, in a `?` icon next to the brush toolbar.

---

## 9. Plant Doctor (`/doctor`) — **80/100**

### Strengths
- Camera + library picker, clean upload UI.
- AI diagnosis card structure works well.
- Recently improved cascade (more accurate identifications).

### Gaps
- **4+ action buttons after diagnosis** with unclear priority order ("Save to Shed" vs "Search Database" vs "Get AI Feedback" vs "Create Treatment Plan").
- **"Select Patient" step revealed too late** — should be earlier, ideally during the photo step.
- **Confidence indicator** for AI diagnosis exists but is small/subtle.
- **No "tip for better results"** before the photo step — users sometimes upload blurry shots.

### Improvement plan
1. **Patient-selection on upload screen** — "Which plant is this? (optional)" alongside the photo input.
2. **Reordered action buttons after diagnosis**:
   - **Primary**: "Save to My Shed" (large green CTA).
   - **Secondary row**: "Create Treatment Plan" / "Add Supplies to Shopping List".
   - **Tertiary text-link**: "Search plant database" / "Ask Rhozly AI" (collapsed under "Other options").
3. **Photo tips** on the upload screen — "Good light, close up, capture the affected area clearly. Avoid shadows."
4. **Enlarged confidence chip** ("82% confident this is *Rosa damascena*") with explanation tooltip.

---

## 10. Schedule / Blueprint Manager (`/schedule`) — **82/100**

### Strengths
- Calendar visual is good.
- Recurring task cards are clear.
- Today's tasks prominently surfaced.

### Gaps
- **"Blueprint" jargon** still appears in places — should be "Task Schedule" everywhere user-facing.
- **Task-type dropdown** has no explanation of what each option does (Watering vs Pruning vs Harvesting vs Maintenance).
- **Recurrence picker** ("Every X days" / "X times a week") is fine but lacks a real-world preview ("Next 3 dates will be …").
- **No way to bulk-pause** all schedules during winter.

### Improvement plan
1. **Find-and-replace "Blueprint" → "Task Schedule"** in every user-facing surface.
2. **Info tooltips** on each task type with a plain-English definition + frequency tip ("Watering — most veggies want every 2-4 days; established shrubs every 7-14 days").
3. **Next-dates preview** under the recurrence picker — live updates as user adjusts frequency.
4. **"Pause for winter"** bulk action — pauses all watering-type schedules for a date range (e.g. Dec 1 → Feb 28 in northern hemisphere).

---

## 11. Location Manager (`/management`) — **76/100**

### Strengths
- Location cards stack cleanly.
- Add-location flow is short.

### Gaps
- **Metrics modal is jargon-heavy** — pH, lux, water movement, growing medium, nutrient source all without explanation.
- **No example values** — "5000 lux" means nothing to a beginner.
- **All metric fields shown at once** — newcomers feel obliged to fill them all.

### Improvement plan
1. **InfoTooltip on every metric field** with plain-English explanation + example value (as designed in the earlier audit).
2. **Advanced Settings accordion** — basic info (name, parent location, type) always visible; metrics behind "Advanced ▼" collapsed by default.
3. **Placeholder hints** in every numeric field — `e.g. 6.5` for pH, `e.g. 5000` for lux.
4. **Visual icon row** at the top of the form indicating which fields are populated — "Sunlight ✓ Soil ✗ pH ✗".

---

## 12. Garden Profile / Quiz (`/profile`) — **81/100**

### Strengths
- Quiz flow is friendly.
- Saves preferences cleanly.

### Gaps
- **Quiz feels skippable** — users blast through without realising the impact on later recommendations.
- **Impact never re-shown** — after taking it, no surface says "we adjusted these recommendations because of your quiz".
- **No quiz progress reminder** — if users abandon halfway, no nudge to come back.

### Improvement plan
1. **Subtitle under "Garden Quiz"** — "Your answers personalise plant recommendations and watering schedules — about 2 minutes".
2. **Post-quiz confirmation** — "Your garden profile is set ✓ — we'll use this to suggest suitable plants and remind you at the right times" with a list of 2-3 personalised tips already.
3. **Confirmation step on Skip / X** — single confirm: "Hide this for now? You can take the quiz from your profile menu later."
4. **Profile dashboard chip** showing quiz completion % when partially done.

---

## 13. Ailment Watchlist (`/shed?tab=watchlist`) — **79/100**

### Strengths
- Tab integration into Shed is clean.
- Filter by pest/disease/invasive works.

### Gaps
- **Three different add modes** (Manual / Search Database / AI) — confusingly different.
- **AI mode buried** despite being best for newcomers.
- **Paywalls appear without explanation** when free-tier users hit AI features.
- **Manual mode's symptom + step builders** are overwhelming.

### Improvement plan
1. **Default to AI tab** when opening the add modal.
2. **Rename tabs**: "Add Manually" / "Search Database" / "Ask Rhozly AI ✦ (Recommended)".
3. **Top-of-modal guide** — "Not sure what's affecting your plant? Describe what you see to Rhozly AI and we'll identify it."
4. **Manual tab accordions** — symptom + step builders collapsed by default.
5. **Inline paywall messaging** — "This needs the Sage plan — upgrade in Account Settings" with link.

---

## 14. Shopping Lists (`/planner?tab=shopping`) — **84/100**

### Strengths
- Multi-list support.
- Add from Plant Doctor / Plant Edit Modal works smoothly.

### Gaps
- **"Add checked plants to Shed" lacks confirmation** — user doesn't see what happened.
- **Plants vs supplies look identical** in lists — no visual distinction.
- **No starter templates** for new users.

### Improvement plan
1. **Confirmation toast** after "Add checked plants to Shed" — "Added X plants to your Shed — find them under Garden > The Shed", with a link.
2. **Type chips** on list items — 🌱 for plants, 📦 for supplies/products, 🧰 for tools.
3. **Quick-start templates** when creating a new list — "Starter Toolkit", "Seasonal Veg Patch", "Blank List" pre-populated.

---

## 15. Plant Visualiser (`/visualiser`) — **78/100**

### Strengths
- AR overlay is a cool feature.
- Sprite picker works.

### Gaps
- **"Set Plant Art" is cryptic** — newcomers don't understand what they're configuring.
- **No preview before committing** — user picks an icon and is dropped into AR without checking.
- **Source filter purpose unclear** — what does filtering "by source" mean?
- **Empty plant state has no direct CTA** to The Shed.

### Improvement plan
1. **Rename "Set Plant Art" → "Choose Plant Icons"** throughout.
2. **Step subtitle** — "Step 2: Pick how each plant looks in the visualiser".
3. **Preview thumbnail** shown after icon selection, before launching AR.
4. **One-liner under source filter** — "Filter by where the plant info came from. Most users can leave this on 'All'."
5. **"Go to The Shed →" CTA** in the empty-plant state.

---

## 16. Light Sensor (`/lightsensor`) — **83/100**

### Strengths
- The phone's light sensor + IPS estimate is a really cool feature.
- Result interpretation ("Bright shade, suitable for…") is great.

### Gaps
- **No instruction on phone orientation** — user holds phone wrong, gets wrong reading.
- **No "save reading to area"** quick action.
- **Calibration concept unexplained** — newcomers see numbers and don't know what's right.

### Improvement plan
1. **Pre-reading instructions** screen — "Hold your phone flat, sensor side up, in the area you want to measure. Stay still for 3 seconds."
2. **"Save to area"** quick-action button right after reading — picks which area to attach this reading to.
3. **Calibration tip** — "Typical readings: Indoor windowsill ~2000 lux, sunny garden ~50000 lux, deep shade ~500 lux."

---

## 17. Sun Tracker (`/sun-trajectory`) — **86/100**

### Strengths
- 3D garden + sun model is genuinely impressive.
- Per-area sun analysis is unique to Rhozly.

### Gaps
- **Heavy compute on first load** — perceived slowness.
- **3D camera controls** non-obvious on mobile.
- **Time-of-year slider** doesn't make seasonal impact obvious enough.

### Improvement plan
1. **Loading state with progress** — "Computing sun trajectories for your garden… (5 seconds)" instead of a bare spinner.
2. **Onboarding hints on first visit** — "Drag to rotate, pinch to zoom, scrub the timeline to see seasons" overlaid for 5 seconds, dismissable.
3. **Seasonal compare mode** — split view of "Summer noon" vs "Winter noon" to make the difference visually shocking and memorable.

---

## 18. Garden Layout Editor (`/garden-layout`) — **81/100**

### Strengths
- Visual editor with shapes for areas and plants.
- Recent improvements to the shape tooling.

### Gaps
- **High learning curve** — drawing shapes, snapping, sizing are all non-obvious.
- **Toolbar density** — lots of icons without labels.
- **No undo/redo affordance** even though the underlying system likely supports it.

### Improvement plan
1. **First-visit tour** — 4-step overlay walking through: "Draw an area → Add plants → Resize → Save".
2. **Labelled toolbar** on desktop (text + icon); icon-only on mobile but with longer-tap-for-tooltip.
3. **Visible Undo / Redo buttons** in the toolbar with Ctrl+Z / Ctrl+Y kbd shortcut hint on hover.
4. **Sample garden** — "Load example garden" button on the empty state, lets users explore an existing layout.

---

## 19. Guides (`/guides`) — **80/100**

### Strengths
- Multiple guide sources (Rhozly Guides + Community).
- Tags + categories.

### Gaps
- **No "Start Here" pinned content** for newcomers.
- **Community tab looks broken on first visit** — empty without explanation.
- **Tag system is confusing** — lots of tags, no hierarchy.

### Improvement plan
1. **Pin a "Getting Started with Rhozly" guide** as always-first in the Rhozly Guides tab.
2. **New user banner** on first Guides visit — "New to gardening apps? Start here →" linking to the pinned guide.
3. **Community tab empty state** — "No community guides yet — be the first to share your garden knowledge!"
4. **Tag groupings** — by season / by skill level / by plant type instead of a flat tag soup.

---

## 20. Integrations & Automations (`/integrations`) — **84/100**

### Strengths
- Recently shipped weather-aware toggle (Weather-aware + skip-if-rained + trigger-if-hot).
- Integration cards are clear.
- Manual run button on each automation.

### Gaps
- **First-time integration flow** is intimidating — credentials, scopes, OAuth.
- **Run history visibility** — last run shown but full history requires digging.
- **No "test connection" affordance** after credentials are saved.

### Improvement plan
1. **Pre-OAuth explainer** — "We need read+write access to your eWeLink devices so we can turn valves on/off on the schedule you set. We never share your credentials." per integration provider.
2. **Run history modal** accessible from each automation card — last 50 runs with status + timestamp.
3. **Test Connection** button on each integration's settings — fires a no-op API call to verify credentials are still valid.

---

## 21. Tools Index (`/tools`) — **76/100**

### Strengths
- Centralised listing of garden tools.

### Gaps
- **No descriptions** — each tool tile shows only an icon + name.
- **Tile order is alphabetical** — not by usefulness or frequency.
- **Hidden under "more" menu on mobile** — discoverability problem for the cool features (Sun Tracker, Light Sensor, Visualiser).

### Improvement plan
1. **One-line description per tile** — "Sun Tracker — see how sunlight moves through your garden across the year".
2. **Reorder by recommended-first**: most useful for new gardeners (Plant Doctor, Sun Tracker, Light Sensor) on top.
3. **Promote 2-3 hero tools** to the dashboard / mobile landing so newcomers discover them earlier.

---

## 22. Persistent Navigation — **88/100**

### Strengths
- Mobile bottom nav with 5 items (Home, Garden, Tools, Planner, Profile) works well.
- Desktop sidebar is clear.
- Recent additions like Plant Doctor floating button are well-placed.

### Gaps
- **Active state indicator** is sometimes subtle (just colour, no underline/dot).
- **Profile menu nesting** is deep — "Account Settings" inside "Profile" inside "More".
- **No keyboard shortcut hints** in the desktop sidebar for power users.

### Improvement plan
1. **Stronger active indicator** — coloured dot + label colour change + slight scale for the active item.
2. **Flatten profile menu** — Account Settings / Garden Profile / Subscription / Help / Logout at the top level.
3. **Keyboard shortcut hints** in desktop sidebar (e.g. `⌘1` Home, `⌘2` Shed) with discoverable kbd panel.

---

## 23. Audit Page (`/audit`) — **65/100**

### Strengths
- Lots of data exposed for admin debugging.
- Per-model cost breakdown shipped recently.

### Gaps
- **Dense admin-only page** with no concession to new admins.
- **Token columns** without explanation ("prompt_tokens" / "candidates_tokens" / "thoughts_tokens" — what's the difference?).
- **Date range default = "Today"** — usually you want the last 30 days for context.
- **Mobile table is unreadable** — too many columns.

### Improvement plan
1. **Column header tooltips** — "Tokens = units of text processed by the AI model" / "Cost = estimated spend for this AI call".
2. **Default date range "Last 30 days"** instead of Today.
3. **Mobile-collapsed columns** — merge prompt + candidates + thoughts into a single "Tokens" total on mobile.
4. **Summary stats row at the top** — total cost today / this week / this month, with per-feature breakdown chips.

---

## 24. Plant Library Admin (`/admin/plant-library`) — **82/100**

### Strengths
- Recently shipped Search Lab with 4 strategies — excellent admin UX.
- Stats strip, batch controls, run history all present.

### Gaps
- **Search Lab is the highlight** — but the run history / batch controls below feel less polished by comparison.
- **Cost reporting** is per-run but no aggregate view for the day/month.
- **No "what's actually in the library?" insights** — composition by family, source, validity status visualised.

### Improvement plan
1. **Library composition chart** — pie/bar of family, source, validity. Helps admin understand what's been seeded.
2. **Daily/weekly/monthly cost rollups** on a strip near the top of the page.
3. **Run history filtering** — by status (success/failed/partial), by date range, by kind (seed/verify/batch).

---

## 25. Plant Library — Public (`/library/*`) — **85/100**

### Strengths
- Search → preview → ensure-catalogue flow is solid.
- Wikipedia thumbnails fill in when sources don't have one.

### Gaps
- **Preview screen is information-light** before the care guide is generated.
- **"From Rhozly's library" badge** when applicable is subtle — users should know they're getting curated data.
- **Companion plants tab** content is sometimes generic.

### Improvement plan
1. **Pre-fetch summary** in the preview while care guide generates — "We're loading detailed care info for *Lavandula angustifolia*… here's what we know so far: hardiness, height, sun preference".
2. **Stronger source badge** — "From Rhozly's Library" pill with hover-to-explain.
3. **Companion plants — specificity** — when the AI doesn't have strong matches, surface "limited data" honestly instead of generic suggestions.

---

# Cross-Cutting Improvements (apply everywhere)

These show up in multiple sections but deserve a single coordinated pass:

## CC1 — Consistent loading states
Currently we have spinners, skeletons, and blank states scattered inconsistently. **Action:** build a shared `<SurfaceLoader />` component used on every major surface. Skeleton matches surface structure (card grid, list, form). Replaces every bare `<Loader2 spin />` instance.

## CC2 — InfoTooltip everywhere
Same component used by Location Manager, Plant Edit Modal, Schedule, Audit. **Action:** ship the shared `<InfoTooltip>` from the earlier plan and replace every "jargon without explanation" instance.

## CC3 — Persona-aware copy
The persona prompt from Section 1 lets us bias copy for newcomers vs experts. **Action:** new gardener gets tooltips by default, expert gets terse copy. Toggle in Account Settings if mis-detected.

## CC4 — Empty-state hero pattern
Every list/grid has its own empty state, all slightly different. **Action:** shared `<EmptyState>` component with consistent illustration + headline + body + two CTAs (primary + tertiary).

## CC5 — Accessibility pass
Tap targets, contrast, focus rings, aria labels. Run through every surface with a checklist:
- Every interactive element has aria-label OR visible text.
- Every focus state has a visible ring (≥2px outline).
- Every text colour pair has ≥4.5:1 contrast (test with browser devtools).
- Every form field has a visible label (not just placeholder).
- Every modal is keyboard-trappable + esc-dismissable.

## CC6 — Dark mode
Not currently supported. Big undertaking. **Action:** defer, but the design tokens (`--rhozly-*` CSS vars) need expansion to support a dark variant. Could be a Wave 8+ project.

---

# Proposed Wave Ordering

Recommend tackling improvements in this order of impact:

| Wave | Theme | Sections affected | Why first/last |
|---|---|---|---|
| **W1** | First-Run + Persona detection + Welcome | 1, 22, 12 | Biggest leverage — everything reads better when newcomers are oriented. |
| **W2** | Cross-cutting components (InfoTooltip, EmptyState, SurfaceLoader) | All | Foundation for every later wave. |
| **W3** | Dashboard + Quick Access polish | 2, 3 | First impression after onboarding. |
| **W4** | Plant Edit Modal + Schedule | 5, 10 | Most-used "deep" surfaces. |
| **W5** | Plan Staging + Overhaul polish | 7, 8 | Recently-shipped flows; tighten before they're load-bearing. |
| **W6** | Tools (Doctor, Visualiser, Light, Sun, Layout) | 9, 15, 16, 17, 18, 21 | Cool features — make them discoverable. |
| **W7** | Watchlist + Locations + Shopping | 11, 13, 14 | Less-frequent surfaces — polish after the core. |
| **W8** | Admin (Audit, Plant Library Admin) | 23, 24 | Last because it's admin-only. |
| **W9** | Accessibility pass | All | After all UI changes — single sweep for tap targets, contrast, kbd nav. |

Targeted improvement: **every surface to 95+** by end of W9.

---

# Open questions for the user

1. Are you happy with the 25 surfaces I broke this into, or are there areas I missed / over-split?
2. Wave ordering — start with W1 (Foundation) or jump into a specific surface that's biting?
3. Some improvements need design decisions (e.g. the persona prompt copy, the welcome carousel slides). Want me to draft those + show you, or skip the design and just ship sensible defaults?
4. Dark mode — yes/no/later? It's expensive enough I'd defer it unless you really want it.
