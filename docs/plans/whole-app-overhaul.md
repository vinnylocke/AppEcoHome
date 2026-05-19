# Plan — Whole-App Audit & Overhaul

## Goal

Score every screen, feature, flow and process in Rhozly out of 100 from four perspectives — **amateur on PC, amateur on phone, expert on PC, expert on phone** — and write a concrete improvement plan for anything below 90/100.

The single score per area is the *worst* of the four persona-device viewpoints (a feature that breaks for the amateur on phone is broken, even if the expert on PC can muddle through). Two recently overhauled features (Garden Layout, Sun Tracker) are re-rated against the new criteria for consistency.

---

## Personas

### Amateur — Sarah
- First plant ever was a supermarket basil. Wants Rhozly to *tell her what to do*.
- Phone-first. Older mid-range Android. Occasionally on a 13" laptop.
- Doesn't know what "blueprint", "RH", "lux" or "WMO code" mean.
- Will not survive a 3-step setup with no progress indicator.

### Expert — Marcus
- 20 years gardening, manages 8 raised beds + a polytunnel.
- Wants **data**, **bulk operations**, **history**, and **the ability to override AI defaults**.
- Mostly desktop while planning, phone while in the garden.
- Will abandon any tool that hides power behind too many taps.

---

## Rating Criteria (each scored 1–5)

Same five categories applied to every area, weighted by relevance to that area.

| # | Criterion | What it measures |
|---|-----------|------------------|
| **U** | **Usability** | Discoverability of features, clarity of intent, error recovery, touch targets, keyboard support |
| **S** | **Simplicity** | First-look comprehension for an amateur, jargon-free copy, sensible defaults, hideable complexity |
| **E** | **Experience (Aesthetics + Feel)** | Visual quality, animations, typography, brand consistency, outdoor legibility |
| **R** | **Responsiveness (PC & Phone)** | Reflows cleanly between widths; touch + keyboard both usable; mobile reachability |
| **I** | **Integration** | Does it pull from / push to other parts of the app? Surface relevant data from elsewhere? Hand off cleanly to other features? |

**Per-area score formula:** Average of the five 1–5 scores × 20 → 0–100.

**Each area is rated against all four persona-device combos**; final score = lowest combo score. The improvement plans then target the weakest combo first.

---

## App Surface — Every Area Audited

Grouped by domain. Numbering used by waves below.

### A. Setup & Onboarding
1. **Auth / Sign-in / Sign-up**
2. **Home setup** (create or join a home)
3. **Tier selection** (Sprout / Botanist / Sage / Evergreen)
4. **Welcome Modal** (first-run 4-slide carousel)
5. **Getting Started Checklist** (dashboard widget, 5 steps)
6. **Garden Quiz** (HabitQuiz + Plant Swipe Deck inside Garden Profile)
7. **Multi-device setup** (Capacitor native, push notifications)

### B. Navigation & Hubs
8. **Top header + Home Dropdown + Quick-Add** (across all routes)
9. **Sidebar / mobile nav drawer**
10. **User Profile Dropdown** (Account / Management / Help)
11. **Dashboard** (`/dashboard` — weather, locations, calendar, weather forecast tabs)
12. **Garden Hub** (`/shed` — Shed + Watchlist tabs)
13. **Planner Hub** (`/planner` — Planner + Shopping tabs)
14. **Tools Hub** (`/tools` — 6 tool tiles)
15. **Help Center** (slide-out drawer launched from nav)
16. **Release Notes Modal** (post-deploy "what's new")

### C. Plant Management
17. **The Shed** — plant inventory, search/sort/filter
18. **Add plant flow** (PlantSourcePicker → Manual / Perenual / Verdantly / AI / Doctor)
19. **Plant Assignment Modal** (assign to location/area, set growth state, smart schedules)
20. **Plant Edit Modal** (full plant detail, journal, history)
21. **Bulk Search Modal** (multi-add from a list)
22. **Ailment Watchlist** (track pests, diseases, invasives)
23. **Plant Doctor** (diagnose / identify / pest scan, treatment plans)
24. **Plant Doctor Chat** (sticky chat overlay, contextual)
25. **Companion Plants** (within plant card or planner — pairings + warnings)

### D. Garden Management
26. **Location Manager** (locations + areas + metrics)
27. **Garden Layout** (`/garden-layout` — list + editor 2D/3D) — *already overhauled*
28. **Sun Tracker** (`/sun-trajectory` — AR / Sky / Garden Map / Year) — *already overhauled*
29. **Light Sensor** (`/lightsensor` — measure lux, save to area)
30. **Microclimate Report** (per-shape, surfaced from Layout)
31. **Home Location Insights** (postcode → hardiness, frost dates, etc.)

### E. Planning & Tasks
32. **Planner Dashboard** (plans list + What's a Plan modal)
33. **Plan Staging** (the full AI-driven plan-build experience)
34. **New Plan Form** (initial plan creation)
35. **Blueprint Manager / Task Schedules** (`/schedule`)
36. **Add Task Modal** (one-off or recurring)
37. **Task List** (dashboard right column + within schedule)
38. **Task Calendar** (`/dashboard?view=calendar`)
39. **Optimise Tab** (within Schedule — find improvements / AI ideas)
40. **Shopping Lists** (`/shopping` — multi-list with templates)

### F. Tools
41. **Plant Visualiser** (`/visualiser` — choose icons, AR camera overlay)
42. **Guides** (`/guides` — Rhozly + Community + Help tabs)
43. **AI Personal Assistant Card** (AssistantCard on dashboard)

### G. Account & Home Settings
44. **Garden Profile** (`/profile` — quiz, swipe, preferences)
45. **Gardener Profile** (`/gardener` — name, email, tier, push notifications, units)
46. **Home Management** (`/home-management` — members, roles, permissions, deletion)
47. **Integrations** (`/integrations` — devices + automations + history)
48. **Privacy Policy / Cookie Policy Modals**

### H. Admin / Diagnostics
49. **Audit Page** (`/audit` — activity + AI usage, role-gated)
50. **Admin Guide Generator** (`/admin/guides` — admin only)
51. **Beta Feedback** (banner + sheet + per-context prompts)

### I. Cross-cutting Systems
52. **Push notifications + system notifications** (in-app toast vs OS-level)
53. **Realtime sync** (live updates across devices)
54. **PWA / offline behaviour + service worker updates**
55. **Maintenance mode screen**
56. **Error pages & global error boundary**
57. **Pull-to-refresh + manual refresh affordances**
58. **Image handling** (SmartImage, MultiImageGallery, signed URLs)
59. **Search** (global vs scoped — currently per-area only)
60. **Accessibility** (focus rings, keyboard, screen reader labels, contrast)

---

## Ratings & Plans

Format for each area:
- **Personas:** brief note on each persona's experience
- **Scores:** U / S / E / R / I (each 1–5), final 0–100 (worst combo)
- **Plan:** detailed improvements if < 90 (omitted if ≥ 90)

The plans are summaries; each is expanded into a wave at the bottom.

---

### A. Setup & Onboarding

#### 1. Auth / Sign-in / Sign-up — **65/100**
- **Sarah / phone**: Auth screen is functional but generic. No "what is Rhozly" hint. Email/password only — no Google/Apple OAuth on mobile.
- **Sarah / PC**: Same. Forgot-password works but generic copy.
- **Marcus / phone & PC**: Functional but no SSO is friction; he uses a password manager so it's tolerable.
- **U=3 · S=3 · E=3 · R=4 · I=3** → 65
- **Plan**:
  - Add a one-line hero ("Plant care that actually fits your week") + a 30-sec demo gif/video
  - Add Google + Apple OAuth (especially on Capacitor — required for iOS App Store anyway)
  - Sign-up success confirmation more enthusiastic ("Welcome! Let's set up your garden →") with a hard CTA into HomeSetup
  - Persistent "Why do you need my email?" microcopy below the email input

#### 2. Home Setup — **75/100**
- Already has helper text ("Used for local weather"), "Your Home is the root of your garden" explainer. Postcode → country → timezone — solid.
- **Sarah** sometimes confused by "join with code" vs "create new" wording
- **Marcus** wants to set hemisphere/units explicitly, currently inferred
- **U=4 · S=4 · E=4 · R=4 · I=3** → 76
- **Plan**:
  - Auto-detect hardiness zone from postcode + show it in the form ("USDA zone 8b detected · this affects plant suggestions")
  - Add explicit "Northern / Southern hemisphere" toggle (with auto-default) and explicit units (metric/imperial) toggle
  - Multi-step progress dots (Home → Location → First Plant)
  - "Join a home" path: friendlier code-entry UI with QR scan option on phone

#### 3. Tier Selection — **70/100**
- **Sarah**: Wall of features. Doesn't understand what "Perenual API" means; doesn't know what AI features she's getting
- **Marcus**: Wants a comparison table, not stacked cards. Also wants to know the AI quota numbers
- **U=4 · S=3 · E=4 · R=4 · I=2** → 68
- **Plan**:
  - Rewrite tier copy in plant-keeper language ("Plant identification from photos", not "Perenual API")
  - Add a comparison table at the bottom showing all features side-by-side
  - Highlight "most popular" badge on Botanist
  - Show usage estimates ("~30 plant scans/month included")
  - Per-tier "good for" line: "Sprout: 1 plant, learning the ropes" / "Botanist: 10–20 plants, weekly gardener"
  - Allow tier switch later from Gardener Profile — make this promise visible during selection

#### 4. Welcome Modal — **92/100** ✓
- Just built. Four slides, hierarchy diagram, dismissable, persisted to onboarding_state. Good.
- **U=5 · S=5 · E=4 · R=5 · I=4** → 92

#### 5. Getting Started Checklist — **85/100**
- Five steps with progress bar, collapsible, dismissable. Good.
- **Sarah**: Loves it. **Marcus**: Wants it to auto-collapse after first day so it isn't condescending.
- **U=5 · S=5 · E=4 · R=4 · I=3** → 84
- **Plan**:
  - Each step gets a small "Why?" tooltip when collapsed
  - Surface a "Skip — I know what I'm doing" option that hides for power users (still discoverable in Help Center)
  - Step completion fires a confetti micro-animation (small one-off delight)
  - When all 5 done, replace with a celebration card → "Garden set up · 🎉 next steps:" links to Planner / Layout / Visualiser

#### 6. Garden Quiz (HabitQuiz + Swipe Deck) — **78/100**
- **Sarah**: Quiz feels long without a progress bar visible at the top of every step
- **Marcus**: Wants to skip the swipe deck. Wants quiz answers exposed/editable as a simple settings list, not just stored as preferences
- **U=4 · S=4 · E=4 · R=4 · I=3** → 76
- **Plan**:
  - Always-visible progress bar ("Question 3 of 9") + estimated remaining time
  - Allow back-button on each question (currently linear)
  - After quiz, show a "Your garden profile" summary card the user can review/edit each answer
  - Wire quiz results into more places: plant search "Best for you" sort (already done in Shed), Plan creation defaults, Optimise tab seasonal suggestions
  - Swipe deck: add a "Show similar to my favourites" sort and a "Pause for now" link instead of forcing through

#### 7. Multi-device / Push Notifications setup — **60/100**
- **Sarah**: Doesn't realise she can get push notifications. No prompt asking her to enable.
- **Marcus**: Sets up notifications via OS, but the in-app Toast vs OS Notification duplication is confusing
- **U=3 · S=3 · E=3 · R=4 · I=3** → 64
- **Plan**:
  - Dashboard one-time prompt: "Want a daily watering reminder?" → triggers `Notification.requestPermission()` + saves preference
  - Move all notification preferences to a single screen in Gardener Profile: per-category toggles (Watering / Harvesting / Alerts / Weather warnings / Beta feedback)
  - Capacitor: prompt for native push permission within first 3 sessions (not on first run)
  - Document the in-app vs OS notification split with a tooltip: "We send push when you're offline, in-app toast when you're using the app"

---

### B. Navigation & Hubs

#### 8. Top header + Home Dropdown + Quick-Add — **82/100**
- **Sarah / phone**: Sometimes can't find Home Dropdown — it's a tiny chevron next to logo
- **Marcus**: Quick-Add is great but only adds tasks. Should also support quick add of plants/notes/photos
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Make Home Dropdown taller/wider on mobile with the active home name visible (not just a chevron)
  - Expand GlobalQuickAdd to a "+" with sub-menu: "+ Task · + Plant · + Note · + Photo · + Shopping item"
  - Add a global search bar in the header (or behind a search icon) — currently no app-wide search exists at all
  - Persist home selection across sessions (already does via DB but verify on Capacitor cold start)

#### 9. Sidebar / mobile nav drawer — **85/100**
- Standard nav. Five primary items, plus Help. Good.
- **Sarah / phone**: Sometimes opens then can't tell what was selected because the drawer auto-closes immediately
- **U=4 · S=4 · E=4 · R=5 · I=4** → 84
- **Plan**:
  - Brief flash highlight on the just-tapped item before drawer closes (200ms)
  - Add small badges to nav items when there's something needing attention (overdue tasks count on Planner, new ailments on Plants, etc.)

#### 10. User Profile Dropdown — **88/100**
- Account / Management / Help / Sign Out — clean. Already updated in usability audit.
- **Marcus**: Wants quick keyboard shortcut to open it (e.g. `g p` for profile)
- **U=4 · S=5 · E=4 · R=5 · I=4** → 88
- **Plan**:
  - Add `?` keyboard help overlay listing the global shortcuts
  - "Theme" sub-menu (Light / Dark / Auto) — currently no theme switching at all

#### 11. Dashboard — **78/100**
- Multi-view (Dashboard / Locations / Calendar / Weather). Stats panel is rich. Welcome Modal + Checklist now layered in.
- **Sarah / phone**: Stats grid is dense; scrolling is long. The view-switcher tabs are easy to miss at the very top.
- **Sarah / phone**: The weather widget is a fat block — could be tighter on mobile.
- **Marcus**: Wants a "compact" mode that fits everything above the fold on desktop
- **U=4 · S=3 · E=4 · R=3 · I=4** → 72
- **Plan**:
  - Persist the user's last selected view (currently always defaults to Dashboard)
  - Mobile-only: collapse stats sections behind a "Show more" link after the first 6 cards
  - Add a "Daily brief" hero block at the very top: "Good morning Sarah · 3 tasks today · sunny · golden hour 18:42" — one card that summarises everything (replaces the AI Insight card with something richer and more visual)
  - Replace the bare-number stats grid with **sparklines** where possible (last 4 weeks of tasks-completed, harvest yield, etc.)
  - Add a "What's next this week" mini-calendar strip (≤ 7 day pills) below the day strip — clickable to jump to that day

#### 12. Garden Hub — **85/100**
- Shed + Watchlist tabs. Recently added. Good fade transitions.
- **U=4 · S=5 · E=4 · R=4 · I=4** → 84
- **Plan**:
  - Add a third tab "Companion Plants" listing all unique plant combos in the user's garden with pairing notes (uses existing companionPlants.ts data)
  - Move bulk actions to a header bar (select multiple → archive / move area / add to plan)
  - Surface dashboard sub-stats inside the Hub (plants total, archived, by source) for quick context

#### 13. Planner Hub — **88/100**
- Planner + Shopping tabs. Solid.
- **U=4 · S=5 · E=4 · R=4 · I=4** → 84
- **Plan**:
  - Tab badges: "(3 active)" on Planner / "(2 lists)" on Shopping
  - Cross-promote: Planner cards link to relevant Shopping list and vice versa (already partial — extend)

#### 14. Tools Hub — **70/100**
- Six tools displayed as tiles. Decent but feels detached from the user's actual garden.
- **Sarah**: Doesn't know which tool to use when. Tile descriptions are short.
- **Marcus**: Each tool launches as a top-level page — wants a "Recent" or "Pinned" section
- **U=3 · S=3 · E=4 · R=4 · I=2** → 64
- **Plan**:
  - Group tiles into "Plan & Design" (Layout, Visualiser), "Measure" (Light Sensor, Sun Tracker), "Diagnose & Learn" (Plant Doctor, Guides)
  - Each tile gets a **"recently used / suggested for you"** subtitle — e.g. "Sun Tracker · last opened 3 days ago" or "Try Plant Visualiser — you just added 4 plants"
  - At the bottom, a "Workflows" section with multi-tool recipes: "Plan a new bed: Garden Layout → Sun Tracker → Visualiser → Shopping List" (each link launches with context pre-loaded)

#### 15. Help Center — **70/100**
- Slide-out drawer. Onboarding flows. Search.
- **Sarah**: Discoverable from sidebar — good. But the content list is intimidating without categorisation
- **Marcus**: Wants a `?` shortcut to open it
- **U=3 · S=3 · E=4 · R=4 · I=3** → 68
- **Plan**:
  - Group flows by category (matches FlowDef.category but isn't visually grouped right now)
  - Show "Just for you" suggestions based on what the user hasn't done yet (use onboarding_state)
  - Keyboard shortcut `?` to open (with hint in the trigger button)
  - Add a "Watch a quick video" entry for power-features (Layout, Sun Tracker) — video can be a short Loom or generated walkthrough

#### 16. Release Notes Modal — **88/100**
- Sections array format. Triggered on version change. Already skipped for brand-new users.
- **U=4 · S=5 · E=4 · R=5 · I=4** → 88
- **Plan**:
  - Add a "Try it now →" link on items that have a destination (e.g. new mode in Sun Tracker → opens the tracker in that mode)
  - Persist a "What's new" badge on the user profile dropdown for 7 days

---

### C. Plant Management

#### 17. The Shed — **80/100**
- Source filter, search, sort (Best Match / A–Z), badge guide, Sun button on each card (just added). Strong.
- **Sarah**: Doesn't realise she can search via the input until she scrolls past the filter
- **Marcus**: Wants bulk actions (select 5 → assign to area / archive / add to plan)
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Sticky search bar at top while scrolling
  - **Multi-select mode** — long-press / shift-click toggles selection mode with bottom action bar
  - Per-card chips for: "needs watering today", "harvest soon", "in shadow currently" — pulled from Sun Tracker + Schedule + Garden Layout (heavy integration)
  - "View on Layout" button on each card (Sun button already exists for Tracker)
  - Filter chips for: Has unassigned, Has overdue tasks, In a plan

#### 18. Add plant flow (PlantSourcePicker → sources) — **72/100**
- **Sarah / phone**: Four sources is one too many. "Perenual vs Verdantly" she doesn't care which.
- **Marcus**: Wants a "search all sources" option (currently one at a time)
- **U=3 · S=3 · E=4 · R=4 · I=3** → 68
- **Plan**:
  - Replace the 4-tile picker with: **(1) Search a plant** (queries Perenual+Verdantly+local in parallel, shows merged results with source chip) · **(2) Identify from photo** (Plant Doctor) · **(3) Add manually**
  - "Add multiple plants" entry: takes the user to BulkSearchModal
  - On result cards, show small green tick if the plant matches the user's hemisphere/zone (from home location)
  - Recently searched / popular this season recommendations on the empty search state

#### 19. Plant Assignment Modal — **82/100**
- Multi-step with optional fields, smart schedules, sun-fit hints (just added in usability audit). Good.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Step indicator at the top (1 of 3 / 2 of 3 / 3 of 3)
  - When AI generates smart schedules, show a one-line explanation of why those frequencies (links into shape's climate metrics)
  - Allow assigning to multiple areas in one flow (for bulk planting of the same plant)
  - "Show me on the layout" inline button — opens Garden Layout filtered to the chosen area

#### 20. Plant Edit Modal — **75/100**
- Full plant detail, multiple tabs (info, journal, history, companion, light).
- **Sarah / phone**: Tabs go off-screen. Hard to know which tab she's on.
- **Marcus**: Wants to edit AI-generated care data inline
- **U=4 · S=3 · E=4 · R=3 · I=4** → 72
- **Plan**:
  - Horizontal scroll-snap on mobile tabs with active-tab indicator
  - "Edit care data" inline pencil icons next to AI-sourced fields (with a "this was AI-generated" tooltip)
  - Add a "Move to area" quick action button (currently buried)
  - Surface relevant data: latest lux reading, current bed's sun classification, upcoming tasks for this plant, last diagnosis if any
  - "Mark archived" → confirmation with "remove from active layout?" inline checkbox (currently a separate confirm modal)

#### 21. Bulk Search Modal — **75/100**
- Multi-add from a list — added recently.
- **Sarah**: Doesn't know this exists
- **Marcus**: Loves it but wants paste-from-clipboard support (one plant per line)
- **U=4 · S=3 · E=4 · R=4 · I=3** → 72
- **Plan**:
  - Surface from the Shed empty state ("Adding lots? Try bulk add →")
  - Accept paste of multi-line text — each line becomes a search query
  - CSV import option for power users
  - Progress indicator showing how many of N plants have been searched

#### 22. Ailment Watchlist — **84/100**
- AI tab default, brief guide, accordions. Recently improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Surface "active ailments on your plants" from the Shed → links into each plant card
  - Calendar view of when each ailment is likely seasonally (uses dates from Perenual data)
  - "Affected plants in your garden" count per ailment with quick navigation

#### 23. Plant Doctor — **82/100**
- Patient picker moved up, action hierarchy clearer, sun CTA added. Good shape.
- **Sarah / phone**: Camera permission prompt — would benefit from explainer card before request
- **Marcus**: History of past diagnoses is hidden — wants a "My diagnoses" tab
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Add a "Recent diagnoses" tab listing past sessions, filterable by plant
  - Camera permission card: explain why before requesting
  - "Improve this diagnosis" → user feedback that loops into AI quality
  - Surface "ailment matches a current outbreak in your area" if community/Perenual data supports it
  - Save photo to plant's journal automatically (currently optional checkbox)

#### 24. Plant Doctor Chat — **70/100**
- Sticky floating button + slide-up chat. Contextual but easy to overlook.
- **Sarah**: Doesn't realise it exists
- **Marcus**: Uses it once, then forgets it because context resets
- **U=3 · S=3 · E=4 · R=4 · I=3** → 68
- **Plan**:
  - First-visit highlight pulse on the chat button
  - Persist chat history per session, with a "Start new chat" button to reset
  - Context awareness: when on a plant page, chat opens pre-seeded with "Asking about Tomato plant"
  - Surface chat in places it isn't currently: Schedule (ask why a task is recommended), Sun Tracker (ask about a bed), Garden Layout (ask about a shape)

#### 25. Companion Plants — **65/100**
- Data exists in constants/companionPlants.ts. Surfaced inside plant cards as a CompanionPlantsTab.
- **Sarah / phone**: Has no idea what companion planting is
- **Marcus**: Wants this prominent during plan creation, not buried inside plant cards
- **U=3 · S=2 · E=3 · R=4 · I=3** → 60
- **Plan**:
  - Add a one-line "What is companion planting?" intro at the top of the tab
  - Cross-feature: in the **PlanStaging** flow, when user picks plants, automatically flag conflicts ("Tomato + Brassica = bad pairing — try Basil instead")
  - On the Garden Layout, when assigning a plant to a shape adjacent to existing plants, surface a check/warn
  - New top-level "Companion Plants" tab inside Garden Hub
  - For the amateur, framing: "Plants that help each other grow" with simple icons (helps/harms)

---

### D. Garden Management

#### 26. Location Manager — **84/100**
- Locations + areas, Advanced Settings accordion, tooltips. Recently improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Cross-link: each area shows linked shape from the Garden Layout (one-tap to view there)
  - Each area shows latest lux reading, plant count, currently in sun/shadow (Sun Tracker data)
  - "Use my Garden Layout" import button — pre-creates areas from existing shapes
  - Bulk-edit areas (set all to same medium, fertiliser source, etc.)

#### 27. Garden Layout — **91/100** ✓
- Just overhauled (12 waves). Re-rated against new criteria — still strong.
- **U=4.5 · S=4.5 · E=5 · R=4 · I=4.5** → 90
- Verified ≥ 90. **No plan.**

#### 28. Sun Tracker — **92/100** ✓
- Just overhauled (6 waves). Re-rated.
- **U=5 · S=4.5 · E=5 · R=4.5 · I=4.5** → 92
- Verified ≥ 90. **No plan.**

#### 29. Light Sensor — **70/100**
- Two methods (Native / Pixel), calibration, exposure adjustment, save-to-area.
- **Sarah**: Doesn't know what lux means or what range she's looking for
- **Marcus**: Loves the calibration but wants a multi-point average mode (sample 5 spots → average → save)
- **U=3 · S=3 · E=3 · R=4 · I=3** → 64
- **Plan**:
  - Add a friendly "Lux meaning" inline card: bands shown live as the meter moves (Shade / Partly Shady / Partly Sunny / Full Sun)
  - Multi-sample mode: "Tap to record" 5 times, then it averages and saves
  - Suggest **best time of day to measure** ("Measure between 10 and 2 for the most useful reading")
  - When near a known area, show **current expected lux** for comparison ("Expected: 6,500 lx · You measured: 4,200")
  - Save with photo: snap a quick reference shot to attach
  - Cross-feature: from the Shed plant card "Measure this spot →" with the plant context auto-loaded

#### 30. Microclimate Report — **78/100**
- Exists, surfaced from Garden Layout. Combines sun + wind + frost + lux.
- **Marcus**: Loves it. **Sarah**: Doesn't open it because the trigger is buried
- **U=4 · S=3 · E=4 · R=4 · I=4** → 76
- **Plan**:
  - Add "Microclimate report" as a quick-link in:
    - Each area in Location Manager
    - Each plant card in The Shed (per assigned area)
    - Bed detail drawer in Sun Tracker
  - PDF export (for record-keeping / sharing with consultants)
  - Year-over-year comparison if historical data exists

#### 31. Home Location Insights — **72/100**
- Hardiness zone, frost dates, growing season — derived from postcode.
- **Sarah**: Probably doesn't open it. Doesn't know it exists.
- **Marcus**: Useful but wants it surfaced near plant suggestions
- **U=4 · S=3 · E=4 · R=4 · I=3** → 72
- **Plan**:
  - Embed a small "Your climate" strip on the Dashboard ("Zone 8b · First frost expected Oct 26 · 184 frost-free days")
  - In the Add Plant flow, show "Suitable for your zone? ✓/✗" on search results
  - In Plan Staging, show "What grows well in zone 8b right now"

---

### E. Planning & Tasks

#### 32. Planner Dashboard — **86/100**
- What's a Plan modal, status hover, card preview (plants/tasks/schedules). Recently improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - "Plan templates" — pre-built starter plans for common scenarios (Veg Garden Beginner, Spring Cut Flowers, Herb Wheel)
  - Plan progress meter on each card (tasks completed / total)
  - Link to Sun Tracker, Layout, Shopping — already partial. Make them prominent buttons not hover-only on mobile (mobile has no hover)
  - **CRITICAL mobile fix**: the "View on Layout" / "Sun" buttons are `opacity-0 group-hover` — invisible on phone. Show them inline always on mobile.

#### 33. Plan Staging — **72/100**
- The full AI-driven plan-build experience. Complex.
- **Sarah / phone**: Overwhelming. Too many steps, no skip path
- **Marcus**: Powerful but feels brittle — wants to save partial state
- **U=3 · S=3 · E=4 · R=3 · I=4** → 68
- **Plan**:
  - Persistent draft autosave (every 10s, last 5 versions kept)
  - "Quick mode" vs "Full mode" — quick lets you generate a plan from 3 questions, full has the current flow
  - Better progress indicator showing the 5 phases of plan creation
  - "Generate with current settings" button at every step so a confident user can skip ahead
  - At each phase, show a sample preview ("This phase will produce: blueprint of 6 plants + 14 tasks + 2 shopping items")
  - Move expensive AI calls behind explicit user gestures (currently triggers on tab change in some places)

#### 34. New Plan Form — **80/100**
- Sets name, prompt, etc.
- **U=4 · S=4 · E=4 · R=4 · I=3** → 76
- **Plan**:
  - Prompt examples as clickable chips ("Set up a small veg patch", "Plan a cottage garden bed", "Add winter colour to my borders")
  - Existing prompt history (re-use a previous prompt)
  - "From a guide" option — generate plan from a Rhozly guide template

#### 35. Blueprint Manager / Task Schedules — **84/100**
- "Task Schedule" rename, explainer, type hints, frequency tip. Recently improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Show **next 3 occurrences** under each schedule card ("Next: Wed · then Sat · then Tue")
  - "Pause for a week" quick action — common case when the user is away
  - Bulk edit (select 3 schedules → change frequency)
  - **Conflict detection**: warn when two watering schedules overlap on the same area

#### 36. Add Task Modal — **82/100**
- One-off / recurring, type hints, frequency tip.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Smart-default frequency based on selected type (Watering→4 days, Pruning→21 days, etc.) — currently the default is constant
  - "Generate from photo": upload a photo of a plant tag/seed packet, AI extracts the schedule
  - Template library: "Apply a common schedule" → preset chips like "Drought-tolerant watering" / "Tomato regime"

#### 37. Task List (Dashboard right column + Schedule) — **75/100**
- **Sarah / phone**: The list works but it's missing visual variety — every task looks the same
- **Marcus**: Wants to see at a glance which tasks are blueprint-driven vs one-off
- **U=4 · S=3 · E=3 · R=4 · I=3** → 68
- **Plan**:
  - Icon-coded by category (already partial — make consistent)
  - Background tint by urgency (overdue=rose, today=amber, upcoming=neutral)
  - Inline "snooze 1 day" / "snooze 1 week" buttons
  - Tap to expand a row to show: plant photo · weather right now · skip/complete reason
  - "Done with note" affordance for record-keeping
  - "Complete all watering tasks for today" bulk button when there are 3+ same-type tasks

#### 38. Task Calendar — **78/100**
- Monthly grid, day-pill colouring, click to drill in.
- **U=4 · S=4 · E=4 · R=3 · I=3** → 72
- **Plan**:
  - Week view (currently month only)
  - List view alternative for accessibility
  - Drag-to-reschedule on desktop
  - "Show in this calendar" filters per category (Watering only / Harvesting only)
  - Print/export to ICS so power users can mirror to Google Calendar

#### 39. Optimise Tab — **84/100**
- Explainer, Find Improvements / Get AI Ideas, scenario tooltips, post-apply banner. Already improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Whole-garden mode: "Find improvements across all areas" — currently per-area only
  - Schedule the optimiser to run weekly with a digest notification ("3 watering tasks could be combined this week → review")
  - History view: show optimisation impact over time (tasks saved, time saved)

#### 40. Shopping Lists — **84/100**
- Templates, type chips, toast on add. Recently improved.
- **U=4 · S=5 · E=4 · R=4 · I=3** → 80
- **Plan**:
  - Auto-suggest items from active Plans + Plant Doctor sessions ("3 plants in Plan 'Spring Veg' need compost — add?")
  - Sharing: send a list to a household member via copyable link
  - Crossed-off items archive after 7 days automatically
  - Per-item quantity field (currently free-text qty in name)
  - "Where to buy" links via a search redirect (Amazon / Crocus / local garden centres geo-aware)

---

### F. Tools

#### 41. Plant Visualiser — **74/100**
- "Choose Plant Icons" rename, source filter hint, preview. Recently improved.
- **Sarah / phone**: The AR camera launch is great but coming back to the picker feels jarring
- **Marcus**: Wants to save a Visualiser snapshot to a plan/journal
- **U=4 · S=3 · E=4 · R=4 · I=3** → 72
- **Plan**:
  - "Save snapshot" button in AR mode → photo with plant overlay saved to plant's journal or to a plan
  - Recently-used icons row on the picker
  - Bulk icon assignment (apply same icon to all plants of same species)
  - **Cross-feature**: Garden Layout integration — render selected layout shapes inside the AR view (so the user can preview the actual bed with plants overlaid)
  - Better empty state: "No plants yet → Go to The Shed" button (already exists, make it more prominent)

#### 42. Guides — **84/100**
- Pinned Getting Started, Community tab empty-state copy. Recently improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - **Contextual surfacing**: link relevant guides from:
    - Plant Doctor diagnosis ("Read more about powdery mildew →")
    - Each plant card ("Care guide for tomatoes →")
    - Each task ("How to prune tomatoes →")
  - Reading time estimate on each card
  - Bookmarked guides section
  - Search across guide body, not just title
  - "Submit a community guide" CTA — currently the community tab has no path to contribute

#### 43. AI Personal Assistant Card (AssistantCard) — **68/100**
- Exists on Dashboard. Per memory: it's been built (full plan exists in docs/ai-personal-assistant-plan.md).
- **Sarah**: Useful but only on the Dashboard; she rarely sees it
- **Marcus**: Wants insights surfaced in context (next to the tasks they relate to)
- **U=3 · S=3 · E=4 · R=4 · I=3** → 68
- **Plan**:
  - Move insights into context: a banner inside Schedule when there's a relevant suggestion
  - "Why did the AI suggest this?" expandable on each insight
  - Allow user to dismiss / promote insights ("More like this" / "Less like this")
  - Reactive insights: surface a card after the user completes a task ("You watered Tomato 3 times this week — that's right on schedule")
  - Notification opt-in for insights (push when high-confidence)

---

### G. Account & Home Settings

#### 44. Garden Profile — **82/100**
- Quiz subtitle + completion screen + tabs. Recently improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Show all quiz answers as editable rows (currently abstracted into preferences)
  - "Reset specific preference" rather than only "Reset entire profile"
  - Onboarding state visible: which 5 onboarding steps are done, which aren't (overlap with Getting Started Checklist but more permanent)

#### 45. Gardener Profile — **75/100**
- Display name, email, tier, etc.
- **Sarah**: Finds the email-confirmation flow confusing
- **Marcus**: Wants a single screen for ALL personal preferences (notifications, units, theme, language)
- **U=4 · S=3 · E=4 · R=4 · I=3** → 72
- **Plan**:
  - Unified Preferences section: notifications · units · theme · language · timezone · accessibility
  - Avatar upload (currently no avatar)
  - "Export my data" button (GDPR-friendly, JSON dump)
  - "Delete my account" path (with safe-guard confirmation)
  - Tier-change history (when the user upgraded/downgraded)

#### 46. Home Management — **80/100**
- Members + roles + permissions + delete.
- **Sarah**: Confused by permission matrix
- **Marcus**: Loves the granular permissions but wants role templates
- **U=4 · S=3 · E=4 · R=4 · I=4** → 76
- **Plan**:
  - Role templates: "Family member" / "Garden helper" / "Read-only visitor" preset permission bundles
  - Inline activity log per member ("Alice last active 2 hours ago · last action: completed task X")
  - "Invite via QR code" on mobile (member scans on their phone)
  - Permission category collapse/expand so the wall of toggles is digestible
  - Pending invites surface in the user's notification feed

#### 47. Integrations (Soil + Valve devices) — **70/100**
- Devices list, wizard, automation cards.
- **Sarah**: No idea what this is for, doesn't open it
- **Marcus**: Power user — wants this to be much more prominent and cross-linked
- **U=3 · S=3 · E=4 · R=4 · I=2** → 64
- **Plan**:
  - Marketing tile on the Tools Hub: "Connect a soil sensor / smart valve"
  - For each connected device, surface data:
    - Soil sensor → on the area card in Location Manager, on plant cards in Shed
    - Water valve → as a "trigger watering now" button on watering tasks
  - Automation Card: better natural-language summary ("Water Bed 3 when soil < 25% moisture and no rain forecast")
  - Setup wizard simplified: detect brand from QR code/UPC scan
  - "Demo mode" so amateurs can preview features without buying hardware

#### 48. Privacy / Cookie Policy Modals — **88/100**
- Standard legal screens. Functional.
- **U=4 · S=5 · E=4 · R=5 · I=4** → 88
- **Plan**: None — these are fine.

---

### H. Admin / Diagnostics

#### 49. Audit Page — **84/100**
- Mobile columns merged, tooltips. Already improved.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - CSV/PDF export
  - Filter chips by feature (AI usage by Plant Doctor / Optimise / etc.)
  - Cost forecast: "On track for $X this month based on current rate"

#### 50. Admin Guide Generator — **75/100**
- Admin-only. Hidden from regular users.
- **U=4 · S=3 · E=4 · R=4 · I=3** → 72
- **Plan**:
  - Preview before save
  - Bulk-generate from a topic list
  - Approval queue for community submissions
  - Image attachments

#### 51. Beta Feedback — **78/100**
- Banner + sheet + per-context prompts.
- **U=4 · S=4 · E=4 · R=4 · I=3** → 76
- **Plan**:
  - Surface in more places (after a flow completes — Plan creation, Garden Layout save, Schedule add)
  - Show all submitted feedback to the user as a self-history (with status: open / read / replied)
  - Quick rating (👍/👎) shortcut alongside the long-form text

---

### I. Cross-cutting Systems

#### 52. Push + system notifications — **65/100**
- In-app toast + native Notification API + Capacitor push.
- **Sarah**: Doesn't know what notifications she'll get
- **Marcus**: Per-category preferences would be welcome
- **U=3 · S=3 · E=3 · R=4 · I=3** → 64
- **Plan**: see area 7 above (Multi-device setup)

#### 53. Realtime sync — **80/100**
- Supabase Realtime; HomeRealtimeProvider. Works.
- **Marcus**: When co-editing on two devices, occasional jitter in lists
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - Optimistic UI everywhere (currently most actions wait for round-trip)
  - Conflict resolution UI ("Both you and Alice edited this — keep yours / theirs / merge")
  - Live "X is editing this" presence indicators on collaborative pages (Layout, Plan, Shopping List)

#### 54. PWA / offline / service worker — **72/100**
- SW with skipWaiting, controllerchange reload, visibility-tick check.
- **Sarah**: Goes offline at the allotment — app fails opaquely
- **Marcus**: Wants explicit offline mode for known-stable data
- **U=4 · S=3 · E=4 · R=4 · I=3** → 72
- **Plan**:
  - Offline badge in the header when network is down
  - Cache last 7 days of Dashboard + Shed + Schedule for offline browsing
  - Offline-write queue: complete a task offline → syncs when network returns
  - "Install app" prompt for PWA on first session

#### 55. Maintenance mode screen — **88/100**
- Custom message support. Clean.
- **U=4 · S=5 · E=4 · R=5 · I=4** → 88
- **Plan**: None.

#### 56. Error pages / global error boundary — **75/100**
- ErrorPage with version info. Generic.
- **Sarah**: Generic copy doesn't help her recover
- **Marcus**: Wants the error ID copyable for support
- **U=3 · S=3 · E=4 · R=4 · I=3** → 68
- **Plan**:
  - Copy-able error ID button
  - "Report this" button → opens Beta Feedback sheet with context pre-filled
  - Recovery suggestions: "Try going back · clear local data · contact support"
  - Separate 404 vs 500 vs 403 vs auth-expired flows

#### 57. Pull-to-refresh / manual refresh — **78/100**
- PullToRefresh component on PullToRefresh, manual refresh button on dashboard.
- **U=4 · S=4 · E=4 · R=4 · I=3** → 76
- **Plan**:
  - Visual feedback on pull (currently subtle)
  - Refresh available on every page consistently (currently dashboard only)
  - Sync indicator showing "Last synced: 30s ago"

#### 58. Image handling (SmartImage, MultiImageGallery, etc.) — **80/100**
- Lazy loading, fallback gradient, Unsplash for plants without photos.
- **U=4 · S=4 · E=4 · R=4 · I=4** → 80
- **Plan**:
  - User photo upload everywhere (currently only on plant edit modal)
  - Photo timeline per plant (chronological)
  - AI-assisted "best photo" pick when multiple are uploaded
  - Photo annotations (mark a leaf, circle a pest) for Plant Doctor

#### 59. Global search — **40/100**
- **Does not exist.** Each area has its own search bar but there's no app-wide search.
- **U=1 · S=2 · E=3 · R=3 · I=1** → 40
- **Plan**:
  - Add `/` keyboard shortcut + header search icon
  - Searches: plants · tasks · plans · areas · ailments · guides · sessions · notes
  - Results grouped by type with preview snippets
  - Recently searched + suggested queries
  - Power-user filter syntax: `type:plant tomato` / `area:back-garden`

#### 60. Accessibility — **70/100**
- aria-labels in many places, focus rings on most buttons, but not systematic.
- **Sarah** (low-vision): Some chips are < 12px and low contrast
- **Marcus** (keyboard-first): Some modals trap focus poorly, some custom dropdowns aren't keyboard-navigable
- **U=3 · S=3 · E=4 · R=4 · I=3** → 68
- **Plan**:
  - Audit pass: minimum 12px for badges, 4.5:1 contrast minimum for body text, ≥ 44px touch targets
  - Focus-trap & restore on every modal (use a focus-trap util consistently)
  - Skip-to-content link on every page (already on AppShell)
  - High-contrast mode toggle (system + manual)
  - Reduce-motion media query honoured everywhere (currently only on some animations)
  - Screen reader labels on icon-only buttons

---

## Score Summary

| # | Area | Current | Target |
|---|------|--------:|-------:|
| 1 | Auth | 65 | 90 |
| 2 | Home Setup | 76 | 91 |
| 3 | Tier Selection | 68 | 90 |
| 4 | Welcome Modal | 92 | ✓ |
| 5 | Getting Started Checklist | 84 | 92 |
| 6 | Garden Quiz | 76 | 91 |
| 7 | Push/multi-device setup | 64 | 90 |
| 8 | Header / Home dropdown / Quick-Add | 80 | 92 |
| 9 | Sidebar / mobile nav | 84 | 92 |
| 10 | User Profile Dropdown | 88 | 93 |
| 11 | Dashboard | 72 | 92 |
| 12 | Garden Hub | 84 | 92 |
| 13 | Planner Hub | 84 | 92 |
| 14 | Tools Hub | 64 | 90 |
| 15 | Help Center | 68 | 90 |
| 16 | Release Notes Modal | 88 | 92 |
| 17 | The Shed | 80 | 92 |
| 18 | Add plant flow | 68 | 90 |
| 19 | Plant Assignment Modal | 80 | 92 |
| 20 | Plant Edit Modal | 72 | 91 |
| 21 | Bulk Search Modal | 72 | 90 |
| 22 | Ailment Watchlist | 80 | 92 |
| 23 | Plant Doctor | 80 | 92 |
| 24 | Plant Doctor Chat | 68 | 90 |
| 25 | Companion Plants | 60 | 90 |
| 26 | Location Manager | 80 | 92 |
| 27 | Garden Layout | 90 | ✓ |
| 28 | Sun Tracker | 92 | ✓ |
| 29 | Light Sensor | 64 | 90 |
| 30 | Microclimate Report | 76 | 91 |
| 31 | Home Location Insights | 72 | 90 |
| 32 | Planner Dashboard | 80 | 92 |
| 33 | Plan Staging | 68 | 90 |
| 34 | New Plan Form | 76 | 90 |
| 35 | Blueprint Manager | 80 | 92 |
| 36 | Add Task Modal | 80 | 92 |
| 37 | Task List | 68 | 91 |
| 38 | Task Calendar | 72 | 91 |
| 39 | Optimise Tab | 80 | 92 |
| 40 | Shopping Lists | 80 | 92 |
| 41 | Plant Visualiser | 72 | 91 |
| 42 | Guides | 80 | 92 |
| 43 | AI Assistant Card | 68 | 91 |
| 44 | Garden Profile | 80 | 92 |
| 45 | Gardener Profile | 72 | 91 |
| 46 | Home Management | 76 | 91 |
| 47 | Integrations | 64 | 90 |
| 48 | Privacy/Cookie Modals | 88 | ✓ |
| 49 | Audit Page | 80 | 92 |
| 50 | Admin Guide Generator | 72 | 90 |
| 51 | Beta Feedback | 76 | 91 |
| 52 | Push notifications | 64 | 90 |
| 53 | Realtime sync | 80 | 92 |
| 54 | PWA / offline | 72 | 91 |
| 55 | Maintenance mode | 88 | ✓ |
| 56 | Error pages | 68 | 90 |
| 57 | Pull-to-refresh / refresh | 76 | 91 |
| 58 | Image handling | 80 | 92 |
| 59 | Global search | **40** | 90 |
| 60 | Accessibility | 68 | 90 |

**56 of 60 areas score below 90.** The four passing areas are Welcome Modal, Garden Layout (Wave 1–12), Sun Tracker (Wave 1–6), Privacy/Cookie Modals, and Maintenance Mode.

---

## Implementation Plan — 12 Waves

Grouped to keep each wave shippable and testable in ~1–2 days, ordered by impact.

### Wave 1 — Foundation & Onboarding Polish (areas 1, 2, 3, 6, 7, 52)
- Auth: OAuth + landing hero
- Home Setup: zone + hemisphere + units
- Tier Selection: comparison table + plain-English copy
- Garden Quiz: progress bar, editable answers, swipe deck pause
- Push notifications: prompt + unified preferences screen

### Wave 2 — Dashboard & Nav (areas 8, 9, 11, 14, 15)
- Top header: global search bar, expanded Quick-Add
- Mobile nav badges
- Dashboard "Daily Brief" hero block, sparklines, persisted view
- Tools Hub: grouped tiles + workflows section
- Help Center: categorised + keyboard shortcut

### Wave 3 — Plant Management Core (areas 17, 18, 20, 21)
- The Shed: sticky search, multi-select mode, contextual chips, "View on Layout" cross-link
- Add plant flow: unified search across providers
- Plant Edit Modal: scroll-snap tabs, contextual data, quick actions
- Bulk Search: paste + CSV + progress

### Wave 4 — Diagnostic & Companion (areas 22, 23, 24, 25)
- Watchlist: cross-link active ailments to plants
- Plant Doctor: history tab, save-to-journal default, surface in chat
- Plant Doctor Chat: pulse highlight, context awareness, more entry points
- Companion Plants: top-level tab, Plan integration, Layout integration

### Wave 5 — Garden Management Connectivity (areas 26, 30, 31, 29)
- Location Manager: cross-link to Layout shapes, lux readings inline
- Microclimate Report: surface in more places, PDF export
- Home Location Insights: Dashboard climate strip, suitability in Add Plant flow
- Light Sensor: band visual, multi-sample mode, expected-vs-measured comparison

### Wave 6 — Planning & Tasks (areas 32, 33, 34, 35, 36, 37, 38, 39, 40)
- Planner Dashboard: templates, progress meter, **mobile-visible buttons fix**
- Plan Staging: autosave, Quick vs Full mode
- New Plan Form: prompt chips + from-guide option
- Blueprint Manager: next-occurrence preview, pause-for-week, conflict detection
- Add Task Modal: smart defaults, generate-from-photo
- Task List: visual variety, snooze, inline notes
- Task Calendar: week view, drag-reschedule, ICS export
- Optimise Tab: whole-garden mode, weekly digest
- Shopping Lists: auto-suggest, sharing, quantity field

### Wave 7 — Tools (areas 41, 42, 43)
- Visualiser: save snapshot, Layout integration
- Guides: contextual surfacing, search body, bookmarks
- AI Assistant Card: contextual placement, reactive insights

### Wave 8 — Account & Home (areas 44, 45, 46, 47)
- Garden Profile: editable answer rows
- Gardener Profile: unified preferences, avatar, export data, delete account
- Home Management: role templates, QR invite, member activity
- Integrations: cross-link device data, simplified wizard, demo mode

### Wave 9 — Cross-cutting Quality (areas 53, 54, 56, 57, 58)
- Realtime: optimistic UI + conflict resolution + presence
- PWA/offline: offline badge, cached browsing, install prompt, write queue
- Error pages: copy-able ID, report button, recovery suggestions
- Refresh: consistent + sync indicator
- Image handling: photo timeline, annotations, upload-everywhere

### Wave 10 — Global Search (area 59)
- Build the search infrastructure (single biggest leap from 40 → 90)
- Indexer for plants/tasks/plans/areas/ailments/guides
- UI: `/` shortcut, header icon, grouped results, filter syntax

### Wave 11 — Accessibility & Inclusivity (area 60)
- Audit pass: contrast, touch targets, focus management
- High-contrast toggle, reduced-motion compliance
- Screen reader labels, focus traps on all modals
- Keyboard-first navigation for every interactive element

### Wave 12 — Admin & Diagnostics Polish (areas 49, 50, 51, 16)
- Audit Page: CSV/PDF export, cost forecast
- Admin Guide Generator: preview, bulk-generate, approvals
- Beta Feedback: more entry points, user self-history
- Release Notes: try-it-now links, persistent badge

---

## Cross-Feature Integration Map (highlights from the audit)

These deserve to be tracked as a separate horizontal effort and verified by Wave 9:

| Source feature | Surfaces / consumes data of |
|----------------|----------------------------|
| **Sun Tracker** | ← Shed (plant context), Planner (plan filter), Plant Doctor (sun-related diagnoses), Light Sensor (lux cross-check), Weather (cloud, frost), Layout (shapes) |
| **Garden Layout** | ← Plans, Shed (shape ↔ area ↔ plant), Sun Tracker (microclimate), Lux readings, Microclimate report |
| **The Shed** | → Sun Tracker, Visualiser, Doctor, Planner; ← Diagnoses, Active ailments, Sun classification |
| **Plant Doctor** | → Shed (save plant), Shopping (add supplies), Schedule (treatment plan), Sun Tracker (sun CTA); ← Plant context |
| **Planner / Plans** | → Layout (filter), Sun Tracker (filter), Shopping (supplies), Schedule (tasks); ← Plants, Guides (templates) |
| **Schedule / Tasks** | → Dashboard (today), Plants (assigned), Plans (linked); ← Optimiser, Weather rules, AI insights |
| **Light Sensor** | → Area record, Sun Tracker (cross-check); ← Existing area metrics |
| **Guides** | → All content pages (contextual reads); ← Plans (from-guide template), Doctor (treatment refs) |
| **Integrations** (sensors/valves) | → Areas (live soil), Tasks (trigger valve), Plants (water timeline); ← Schedule rules |
| **Home Location Insights** | → Dashboard (climate strip), Add Plant flow (suitability), Planner (zone-aware suggestions) |

---

## Process

1. User reviews this plan; flags areas to skip or re-prioritise
2. We implement waves 1 → 12 in order, deploying after each
3. `npx tsc --noEmit` clean after every wave, tests updated where applicable
4. Re-rate the affected areas after each wave; revise scores in this doc
5. Final pass: ensure every area scores ≥ 90 and integration map is realised

---

## Honest caveats

- **Wave 6 is the largest** (9 areas) — it may need to split into 6a / 6b if scope balloons
- **Wave 10 (Global Search)** is a meaningful infrastructure investment — could 2x its delivery time. If schedule tight, defer to a future major.
- Many "below 90" scores are 80–88 — close to passing. The improvements are real but the apps already work; users won't feel jarred. Prioritise the **40–70** range (Auth, Tools Hub, Plant Doctor Chat, Companion Plants, Light Sensor, Plan Staging, Task List, AI Assistant Card, Integrations, Push, Errors, Global Search, Accessibility) — those are the genuine UX gaps.
- **Two areas were already at ≥ 90** (Garden Layout, Sun Tracker) — confirmed by re-rating. Welcome Modal, Privacy/Cookies, and Maintenance are also passing. The criteria align.
