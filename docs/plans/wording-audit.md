# Wording Audit — App-Wide

## Goal

Audit the entire app's user-facing copy against two personas (new gardener + experienced gardener) and propose targeted renames to fix:

- **Naming collisions** (one word means two different things)
- **Inconsistencies** (one concept named differently in different places)
- **Persona mismatches** (jargon for new gardeners, talking-down for experts)
- **Unclear purpose** (the label doesn't tell you what it does)

## Surfaces sampled

App-reference 00-INDEX (130 docs), plus direct sampling of:

- Top-level navigation (`App.tsx` navLinks + TAB_URL)
- Profile dropdown (`UserProfileDropdown.tsx`)
- Tools Hub (`ToolsHub.tsx`)
- Garden Hub tabs (`GardenHub.tsx`)
- Welcome Modal slides (`WelcomeModal.tsx`)
- AddTaskModal titles + toasts (`AddTaskModal.tsx`)
- BlueprintManager page (`BlueprintManager.tsx`)
- Planner Dashboard (`PlannerDashboard.tsx`)
- Plant Doctor (`PlantDoctor.tsx` + `PlantDoctorChat.tsx`)
- Garden Profile (`GardenProfile.tsx`)
- Home Management permission groups (`HomeManagement.tsx`)
- Tier labels (`UserProfileDropdown.tsx`)
- Ailment Watchlist (`AilmentWatchlist.tsx`)

---

## Findings — Critical

### 1. "Automation" is overloaded across two completely different concepts

The single word **Automation** appears as the user-facing name for two distinct things:

| Surface | Concept | Code table |
|---|---|---|
| AddTaskModal title when `isRecurring=true` ("New Automation", "Edit Automation", "Editing an Automation Rule") | A recurring task template | `task_blueprints` |
| Integrations page Automations tab | A smart-device schedule (turn the valve on at 6am if no rain) | `automations` |
| HomeManagement permissions group "Automations" | The smart-device kind | `automations.manage` |

**Why it hurts both personas**:
- New gardener creates a recurring watering reminder via AddTaskModal — the toast says "Automation saved." They then look for it under Integrations → Automations (because that's what the navigation calls "Automations") and don't find it.
- Experienced gardener with smart valves sees "Automations" in two different places and assumes they're the same feature with two entry points.

**Severity**: critical — this is a real navigation bug masquerading as a copy issue.

### 2. "Task Schedule" vs "Task Manager" vs "Automation" vs "Blueprint" — same concept, four names

The `task_blueprints` table (recurring task templates) is named:

| Where | Label |
|---|---|
| BlueprintManager page header | **Task Schedules** |
| BlueprintManager "delete" confirm | Delete **Task Schedule** |
| BlueprintManager "no items" title | No **Task Schedules** yet |
| BlueprintManager toast (line 851) | **Automation** saved |
| AddTaskModal title (recurring) | New **Automation** / Editing an **Automation** Rule |
| AddTaskModal toast | **Automation** created! / **Automation** updated! |
| UserProfileDropdown link | **Task Manager** |
| GardenerProfile preferences key | `optimiseDigest` |
| Comments in code | Blueprint / Task Schedule used interchangeably |

The user-facing rename "Blueprint → Task Schedule" was a Wave 2 audit improvement, but it didn't reach AddTaskModal (which still says "Automation" in its recurring mode), the dropdown ("Task Manager"), or several toasts ("Automation saved").

### 3. "Plant Doctor" vs "Garden AI" — same surface, two brands; conflicting with a second surface

| Surface | What it points to | Label used |
|---|---|---|
| Standalone `/doctor` page header | Photo-based identify / diagnose flow | **Plant Doctor** |
| Tools Hub tile (also routes to `/doctor`) | Same photo-based flow | **Garden AI** ← wrong |
| Dashboard quick-action ("Plant Doctor" label, also routes to `/doctor`) | Same photo-based flow | **Plant Doctor** |
| Audit Page function labels | Same photo-based flow | **Plant Doctor** |
| Floating sticky chat (`PlantDoctorChat.tsx`, mounted globally) | Conversational AI chat | **Garden AI** |

So **"Garden AI"** is the floating chat overlay's brand — but Tools Hub uses it as a label for the photo-doctor surface, sending the user to the wrong thing. And the photo-doctor is called "Plant Doctor" everywhere else.

### 4. "Plants" (nav) vs "The Shed" (page heading) — same surface, two names

| Where | Label |
|---|---|
| Side nav button | **Plants** |
| Page heading once you click it | **The Shed** |
| `/shed` route | `shed` |
| Permission group | **The Shed** |
| Help-find: dropdown | (not surfaced here) |

A new gardener clicks "Plants" expecting a page about plants. They get "The Shed" and have to mentally translate. Experienced gardener might enjoy the metaphor but still feels the jarring switch.

### 5. "Garden Profile" vs "Account Settings" vs "Gardener Profile" — three names for two surfaces

| Surface | Route | Page heading | Dropdown label |
|---|---|---|---|
| Gardening preferences quiz | `/profile` | **Garden Profile** | "Garden Quiz & Preferences" |
| Account / tier / notifications / achievements / stats | `/gardener` | (sub-tabs only — no top heading) | "Account Settings" |

The dropdown rename to "Garden Quiz & Preferences" (Wave 1) was the right call, but the page heading still says "Garden Profile" — so the user clicks "Garden Quiz & Preferences" and lands on a screen titled "Garden Profile". They wonder if they're in the wrong place.

---

## Findings — Important

### 6. "Watchlist" (nav) vs "Ailment Watchlist" (page subtitle)

The Garden Hub tab says simply "Watchlist". The page subtitle then says "Ailment Watchlist". The full name is what tells the user what it watches; the short name could be anything (favourites? saved plants? wishlist?).

### 7. Tier wording inconsistency

| Place | Phrasing |
|---|---|
| Ailment Watchlist paywall | "This feature needs the **Botanist or Sage plan**." |
| Planner Garden Overhaul gate | "**Sage+ feature**" / "Garden Overhaul is a **Sage+ feature**" |
| Library AI search comment | **Sage+ only** |
| AI Plant scan | "**Sage+** AI extracts the details" |
| UserProfileDropdown for free users | Shows "**Free**" not "**Sprout**" |

Two phrasing patterns ("X or Y plan" vs "Sage+ feature") and a brand inconsistency (free users see "Free" instead of their actual tier name "Sprout").

### 8. "Sprite Wizard" — jargon

The flow lets the user assign icons to their plants for the Visualiser. "Sprite" is a game-dev term — neither persona will recognise it as "the picture of my plant". A new gardener is lost; an experienced gardener might assume it's broken.

### 9. "Task Manager" in dropdown → BlueprintManager surface ("Task Schedules")

The dropdown link is **Task Manager** but the page it opens is titled **Task Schedules**. Manager / Schedule are not synonyms.

### 10. "Plan & Design" / "Plan" / "Plans" — overloaded

| Surface | What "plan" means |
|---|---|
| Tools Hub group label | "Plan & Design" — verb (action of planning) |
| Planner Dashboard | A garden project ("Spring Veg Patch") |
| Subscription tiers | Subscription plan (Sprout/Botanist/Sage) |
| HomeManagement permissions | "Plans" group → garden plans |
| Welcome Modal slide | "Set up a Task Schedule" — no "plan" here |

The word "plan" gets used as a verb, a noun for projects, AND a noun for subscriptions. Subscription tier context is usually clear from surrounding words ("Sage plan", "your plan"), but a new gardener seeing **Plans** in the side nav next to **Planner** AND being on the **Sprout plan** subscription has cognitive overhead.

---

## Findings — Minor

### 11. Nav vs page heading near-misses

| Nav | Page heading | Consistency |
|---|---|---|
| Plants | The Shed | ✗ Mismatch (Finding #4) |
| Planner | Garden Planner | Close — minor inconsistency |
| Journal | Garden Journal | Close — minor inconsistency |
| Tools | Tools | ✓ |
| Integrations | Integrations | ✓ |
| Dashboard | (no heading) | n/a |

### 12. "Optimise" tab label

The Optimise tab on BlueprintManager has good explainer copy on-page, but the tab label alone tells a new gardener nothing. "Find Improvements" or "Time-savers" would be clearer.

### 13. "Garden Overhaul" vs "Garden Plan"

Overhaul is intentional — it's the Sage+ photo-AI-redesign flow. But "Overhaul" sounds drastic. New gardeners might assume it's only for major garden rebuilds (which is partly true) and skip it for "I just want to add a few plants" — which the flow also handles well.

---

## Proposed renames

### Critical (do these first — they fix navigation bugs)

| # | Where | Current | Proposed | Why |
|---|---|---|---|---|
| C1 | AddTaskModal recurring-mode title | "New Automation" / "Edit Automation" / "Editing an Automation Rule" | **"New Task Schedule" / "Edit Task Schedule" / "Editing a Task Schedule"** | Eliminate collision with Integrations Automations. Match BlueprintManager surface name. |
| C2 | AddTaskModal recurring-save toast | "Automation created!" / "Automation updated!" / "Automation saved" | **"Task schedule created" / "Task schedule updated"** | Same |
| C3 | BlueprintManager non-AI save toast (`BlueprintManager.tsx:851`) | "Automation saved" | **"Task schedule saved"** | Same |
| C4 | Tools Hub "Garden AI" tile | "Garden AI" + path `/doctor` | **"Plant Doctor"** | The tile routes to Plant Doctor, not Garden AI (the chat). Garden AI brand reserved for the floating chat. |
| C5 | Tools Hub workflow tip ("Snap a photo with Garden AI") | "Garden AI" | **"Plant Doctor"** | Same |
| C6 | Side nav "Plants" → page heading "The Shed" | Mismatch | **Nav stays "Plants"; page heading renamed to "Plants" with subtitle "Your Shed — every plant in your home"** | Keep the friendly nav term; merge the metaphor into the subtitle so "Shed" survives as flavour but doesn't confuse first-time visits. |
| C7 | GardenProfile page heading | "Garden Profile" | **"Garden Preferences"** | Matches dropdown ("Garden Quiz & Preferences") and removes the second "Profile" surface confusion with /gardener (Account Settings). |
| C8 | UserProfileDropdown "Task Manager" link | "Task Manager" | **"Task Schedules"** | Match the surface name. |

### Important

| # | Where | Current | Proposed | Why |
|---|---|---|---|---|
| I1 | GardenHub Watchlist tab | "Watchlist" | **"Ailment Watchlist"** | Tells the user what it watches. (Mobile drawer may keep short "Watchlist" if space is tight.) |
| I2 | Watchlist paywall text | "Botanist or Sage plan" | **"Sage+ feature"** | Match the convention used everywhere else. |
| I3 | Tier label for free users | "Free" | **"Sprout"** | The free tier IS the Sprout tier — show its brand, not a generic word. |
| I4 | Sprite Wizard component / label | "Sprite Wizard" / "Set Plant Art" | **"Plant Icon Picker"** + step name **"Choose Plant Icons"** | Existing Wave 4 work already renamed the entry point to "Choose Plant Icons"; finish the job inside the wizard. |
| I5 | BlueprintManager "Optimise" tab | "Optimise" | **"Find Improvements"** | Wave 3 audit recommendation that hasn't been applied. |
| I6 | Planner page heading | "Garden Planner" | Either rename page heading to **"Planner"** OR nav to **"Garden Planner"** | Pick one and match. Recommend keeping page heading flavour ("Garden Planner") and renaming nav to match. |
| I7 | Journal page heading | "Garden Journal" | Same choice as I6 for "Journal" | Same logic. Recommend keeping "Garden Journal" everywhere. |

### Minor

| # | Where | Current | Proposed |
|---|---|---|---|
| M1 | Garden Overhaul gate copy | "Sage+ feature" | Keep — terminology aligned. |
| M2 | Overhaul name itself | "Garden Overhaul" | Keep — deliberately positioned as a major-change tool. Adjust copy on the gate ("Redesign a garden bed or your whole space — photo + AI") to broaden perceived scope. |
| M3 | Permission group "Tasks" vs "Automations" (HomeManagement) | Both exist | Keep — these are correctly scoped to their respective tables (`tasks` vs smart-device `automations`). |

---

## Sensible-default decisions

| Decision | Choice |
|---|---|
| British vs American spelling | **British everywhere** — already consistent ("Visualiser", "Optimise", "Personalise"). No change needed. |
| Friendly metaphor (Shed / Nursery / Watchlist / Library / Garden Journal) | **Keep**. Both personas respond well to evocative naming as long as the navigation chip uses the same word. |
| Persona-aware text | The earlier waves added InfoTooltip persona awareness — no further work needed here. This audit is about the **labels** that don't vary by persona. |
| Code-level renames (table names, column names) | **None** — code-level names stay. This audit only touches user-facing strings. |
| Database migrations | **None.** |
| Tests affected | Playwright E2E selectors that match text labels will need updating in the same PR (e.g. any spec using `getByText("Automation saved")` becomes `getByText("Task schedule saved")`). Data-testid selectors are unaffected. |

---

## App-reference files consulted

- [`docs/app-reference/00-INDEX.md`](docs/app-reference/00-INDEX.md) — surface inventory
- [`docs/app-reference/03-garden-hub/01-the-shed.md`](docs/app-reference/03-garden-hub/01-the-shed.md)
- [`docs/app-reference/04-planner/07-blueprint-manager.md`](docs/app-reference/04-planner/07-blueprint-manager.md) — Blueprint / Task Schedule naming history
- [`docs/app-reference/05-tools/01-tools-hub.md`](docs/app-reference/05-tools/01-tools-hub.md)
- [`docs/app-reference/05-tools/02-plant-doctor.md`](docs/app-reference/05-tools/02-plant-doctor.md) + [`03-plant-doctor-chat.md`](docs/app-reference/05-tools/03-plant-doctor-chat.md) — for the Plant Doctor / Garden AI split
- [`docs/app-reference/05-tools/10-garden-profile.md`](docs/app-reference/05-tools/10-garden-profile.md)
- [`docs/app-reference/06-account/09-user-profile-dropdown.md`](docs/app-reference/06-account/09-user-profile-dropdown.md)
- [`docs/app-reference/07-management/06-integrations-automations.md`](docs/app-reference/07-management/06-integrations-automations.md) — Integrations Automation usage
- [`docs/app-reference/08-modals-and-overlays/01-add-task-modal.md`](docs/app-reference/08-modals-and-overlays/01-add-task-modal.md)
- [`docs/app-reference/99-cross-cutting/17-tier-gating.md`](docs/app-reference/99-cross-cutting/17-tier-gating.md)

---

## Files

### Modified (user-facing strings only)

| File | Changes |
|---|---|
| `src/components/AddTaskModal.tsx` | C1, C2 — modal title + toasts swap "Automation" → "Task Schedule" |
| `src/components/BlueprintManager.tsx` | C3, I5 — toast swap + tab label "Optimise" → "Find Improvements" |
| `src/components/ToolsHub.tsx` | C4, C5 — "Garden AI" → "Plant Doctor" on the diagnose tile + workflow tip |
| `src/components/TheShed.tsx` | C6 — page heading "The Shed" → "Plants" + subtitle adjustment |
| `src/components/GardenProfile.tsx` | C7 — page heading "Garden Profile" → "Garden Preferences" |
| `src/components/UserProfileDropdown.tsx` | C8, I3 — "Task Manager" → "Task Schedules"; free-tier label "Free" → "Sprout" |
| `src/components/GardenHub.tsx` | I1 — Watchlist tab label → "Ailment Watchlist" |
| `src/components/AilmentWatchlist.tsx` | I2 — paywall copy "Botanist or Sage plan" → "Sage+ feature" |
| `src/components/SpriteWizardModal.tsx` | I4 — wizard title + step copy → "Plant Icon Picker" / "Choose Plant Icons" |
| `src/App.tsx` | I6, I7 — nav labels "Planner" → "Garden Planner", "Journal" → "Garden Journal" |

### App-reference docs to update

| File | Change |
|---|---|
| `docs/app-reference/04-planner/07-blueprint-manager.md` | Note "Automation" → "Task Schedule" rename completion |
| `docs/app-reference/05-tools/01-tools-hub.md` | Update tile label from "Garden AI" to "Plant Doctor" |
| `docs/app-reference/05-tools/02-plant-doctor.md` | Add clarifying note: Plant Doctor is the photo flow; Garden AI is the floating chat. |
| `docs/app-reference/05-tools/03-plant-doctor-chat.md` | Same clarifying note from the other side. |
| `docs/app-reference/05-tools/10-garden-profile.md` | Page heading rename |
| `docs/app-reference/06-account/09-user-profile-dropdown.md` | Free-tier label change; "Task Manager" → "Task Schedules" |
| `docs/app-reference/03-garden-hub/01-the-shed.md` | Page heading change |
| `docs/app-reference/03-garden-hub/02-watchlist.md` | Tab label change |
| `docs/app-reference/08-modals-and-overlays/01-add-task-modal.md` | Title + toast string update |
| `docs/app-reference/05-tools/06-sprite-wizard.md` | Rename to "Plant Icon Picker" |

### Tests

| File | Change |
|---|---|
| Playwright specs referencing renamed text labels | Update text selectors (data-testid selectors unchanged) |

## Steps (sequenced)

1. **Critical (C1–C8)** — 8 file edits. Eliminates the navigation-bug-class issues first.
2. **Important (I1–I7)** — 6 file edits. Tightens consistency.
3. **Minor (M-) — none in this batch.**
4. App-reference docs updated in lockstep with each rename.
5. Search Playwright specs for any of the changed strings; update text-selector matches.
6. Typecheck + unit tests + deploy.

## Decisions — CONFIRMED

1. **Nav and page headings**: short everywhere. Strip the "Garden" prefix from page headings so nav and header match. Flavour moves into subtitles.
2. **Sprite Wizard**: fold into Visualiser as Step 2 of a linear wizard flow (no separate modal).
3. **Optimise tab**: rename to **Reimagine**.
4. **Free-tier label**: **Sprout (Free)** — keep brand and surface the billing reality together.
5. **Task hierarchy — four-tier vocabulary confirmed**:

   | Tier | Old name | New name |
   |---|---|---|
   | Per-plant AI feature on Plant Assignment | Smart Schedule | **Smart Routines** |
   | Surface (page listing all routines) | Task Schedules / Manager / Blueprints | **Routines** |
   | Rule template (`task_blueprints`) | Blueprint / Task Schedule / Automation | **Routine** |
   | Materialised to-do (`tasks`) | Task | **Task** (unchanged) |
   | Smart-device schedules (Integrations) | Automation | **Automation** (unchanged) |

   Plain-English flow: *"Enable Smart Routines on a plant — Rhozly creates Routines for it — each Routine generates Tasks on the right days."*

---

## Final rename table (consolidated)

### Critical — fixes navigation bugs

| # | File | From | To |
|---|---|---|---|
| C1 | `AddTaskModal.tsx` titles | "New Automation" / "Edit Automation" / "Editing an Automation Rule" | **"New Routine" / "Edit Routine"** |
| C2 | `AddTaskModal.tsx` toasts | "Automation created!" / "Automation updated!" | **"Routine created" / "Routine updated"** |
| C3 | `BlueprintManager.tsx` toast | "Automation saved" | **"Routine saved"** |
| C3a | `BlueprintManager.tsx` page heading | "Task Schedules" | **"Routines"** |
| C3b | `BlueprintManager.tsx` delete confirm + empty state | "Task Schedule" wording | **"Routine"** |
| C4 | `ToolsHub.tsx` diagnose tile | "Garden AI" | **"Plant Doctor"** |
| C5 | `ToolsHub.tsx` workflow tip | "Snap a photo with Garden AI" | **"Snap a photo with Plant Doctor"** |
| C6 | `TheShed.tsx` page heading | "The Shed" | **"Plants"** + subtitle "Your Shed — every plant in your home" |
| C7 | `GardenProfile.tsx` page heading | "Garden Profile" | **"Garden Preferences"** |
| C8 | `UserProfileDropdown.tsx` link | "Task Manager" → /schedule | **"Routines"** → /schedule |
| C9 | `PlantAssignmentModal.tsx` | "Smart Schedule" + "Generate Schedule" | **"Smart Routines"** + **"Generate Smart Routines"** |

### Important — consistency tightening

| # | File | From | To |
|---|---|---|---|
| I1 | `GardenHub.tsx` Watchlist tab | "Watchlist" | **"Ailment Watchlist"** |
| I2 | `AilmentWatchlist.tsx` paywall | "Botanist or Sage plan" | **"Sage+ feature"** |
| I3 | `UserProfileDropdown.tsx` free-tier label | "Free" | **"Sprout (Free)"** |
| I4 | Visualiser launcher | Separate `SpriteWizardModal` | **Fold into Visualiser as Step 2 — "Choose Plant Icons"** |
| I5 | `BlueprintManager.tsx` second tab | "Optimise" | **"Reimagine"** |
| I6 | `PlannerDashboard.tsx` page heading | "Garden Planner" | **"Planner"** + subtitle "Plan a project from idea to harvest" |
| I7 | `GlobalJournal.tsx` page heading | "Garden Journal" | **"Journal"** + subtitle "Every note across your garden" |

## Implementation order

1. **Tier 0/1/2 vocabulary swap** (Smart Routines, Routines page, Routine) — touches 4 files, biggest user-visible impact. Do this first so the rest builds on settled vocabulary.
2. **Nav-vs-heading alignment** — pure copy edits across 4 files (TheShed / PlannerDashboard / GlobalJournal / GardenProfile).
3. **Plant Doctor vs Garden AI** — ToolsHub edits (2 strings).
4. **Sprite Wizard → Visualiser Step 2** — actual refactor, not a pure rename. Worth its own phase.
5. **Smaller polish** (Reimagine, Sprout (Free), Ailment Watchlist, Sage+ phrasing).
6. App-reference docs updated alongside each rename.
7. Playwright text-selector update sweep.
8. Typecheck + tests + deploy.
