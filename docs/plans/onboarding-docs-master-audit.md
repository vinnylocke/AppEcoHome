# Master plan — Onboarding, in-app docs, walkthroughs & first-run pacing

A discovery + phased-delivery plan for the user's "really big job": make sure every piece of in-app help, every walkthrough, every doc, every onboarding surface is up to date, complete, and arrives at the user in a logical, non-bombarding order.

---

## Discovery — what's already in the app

### 1. First-run onboarding (one-shot moments)

| Surface | File | Status / staleness |
|---------|------|--------------------|
| Welcome modal | [`WelcomeModal.tsx`](../../src/components/WelcomeModal.tsx) | 4-slide carousel; copy mentions "tasks that run themselves", "Location → Area → Plant" hierarchy. **Hasn't been refreshed since Wave 21+22** — no mention of Notes, Voice in Chat, Weekly Overview, image credits, Pl@ntNet, Nursery |
| Getting Started Checklist | [`GettingStartedChecklist.tsx`](../../src/components/GettingStartedChecklist.tsx) | 5 steps (Quiz, Location, Plant, Assign, Schedule). Still accurate. Could grow to 7 steps to also encourage opening the Weekly Overview and adding a Note |
| Notification Opt-In Card | [`NotificationOptInCard.tsx`](../../src/components/NotificationOptInCard.tsx) | Works. Doesn't mention new notification categories (Weekly Overview, Golden Hour, Optimise Digest) added in Wave 21 |
| PWA Install Prompt | [`InstallPwaPrompt.tsx`](../../src/components/InstallPwaPrompt.tsx) | Works |
| Home Setup (name/country/postcode) | [`HomeSetup.tsx`](../../src/components/HomeSetup.tsx) | Works |
| Tier Selection | [`TierSelection.tsx`](../../src/components/TierSelection.tsx) | Works |
| Garden Quiz (HabitQuiz) | [`HabitQuiz.tsx`](../../src/components/HabitQuiz.tsx) | Works |

### 2. Walkthrough engine — Shepherd.js based

- Registry: [`src/onboarding/flowRegistry.ts`](../../src/onboarding/flowRegistry.ts) — **14 flows**.
- Auto-trigger: [`src/onboarding/useAutoTrigger.ts`](../../src/onboarding/useAutoTrigger.ts) — fires the first uncompleted `automatic` flow whose `route` matches the current path, ~800 ms after a route change.
- Help Center: [`HelpCenter.tsx`](../../src/onboarding/HelpCenter.tsx) + [`HelpCenterDrawer.tsx`](../../src/onboarding/HelpCenterDrawer.tsx) — slide-in drawer with two tabs (Guides = flows, Docs = .md files).
- State: `user_profiles.onboarding_state` jsonb per [Onboarding State](../app-reference/99-cross-cutting/30-onboarding-state.md).

#### Existing flows (14)

`global_welcome`, `home_setup_tips`, `dashboard_tour`, `garden_hub_tour`, `weather_insights_tour`, `planner_tour`, `task_schedule_tour`, `tools_hub_tour`, `plant_doctor_tour`, `visualiser_tour`, `add_manual_plant`, `add_location_and_area`, `guides_tour`, `profile_quiz_tour`.

#### Gaps versus Waves 18 → 22 (everything we've shipped since the registry was written)

| Feature | Walkthrough? | Notes |
|---------|--------------|-------|
| Quick Access Home (`/quick`) | ❌ missing | Default landing for mobile; never explained |
| Weekly Overview (`/weekly`) | ❌ missing | Wave 21 — explained nowhere |
| Notes (`/notes`) | ❌ missing | Wave 22.0001 — net-new feature, zero in-app guidance |
| Voice in Chat (mic + read-aloud + auto-read setting) | ❌ missing | Wave 22.0001 — discoverability gap |
| Image credits + `/credits` umbrella | ❌ missing | Wave 22.0002–7 — compliance touchpoint worth explaining |
| Garden AI chat (`PlantDoctorChat`) | ❌ missing | The chat floating bot has no tour; "Talking about" chip from 22.0010 unexplained |
| Pl@ntNet identification | ❌ missing | Wave 19 — Pl@ntNet badge / "Also from Rhozly AI" tile group unexplained |
| Nursery + Sowing Calendar | ❌ missing | Wave 14+ — substantial surface with zero tour |
| Garden Walk (`/walk`) | ❌ missing | Plant-by-plant tour with no walkthrough about itself |
| Seasonal Picks Card | ❌ missing | Now lives on dashboard + `/weekly` |
| Quick Launcher customisation | ❌ missing | Mobile users can pin tiles; never explained |
| `add_manual_plant` flow | ⚠️ stale | References the old "Add Manual Plant" tab inside BulkSearchModal — flow is now library-first via Add-to-Shed routing the user through search |
| `garden_hub_tour` | ⚠️ stale | "Add plants manually, search the Perenual database, or let the AI generate care data" — the actual current flow is Library/Pl@ntNet first, Verdantly second, AI third |
| `plant_doctor_tour` | ⚠️ stale | Mentions "Identify / Diagnose / Pest" buttons but not the Pl@ntNet + Rhozly AI dual-tile output, photo licence badge, or chat handoff |
| `dashboard_tour` | ⚠️ stale | Pre-dates `TodayFocusCard`, `WeekAheadPreview`, `SeasonalPicksCard` on the dashboard |
| `weather_insights_tour` | ⚠️ partial | Doesn't mention Weekly Overview's weather alerts section |
| `tools_hub_tour` | ⚠️ partial | Lists Garden AI, Garden Layout, Plant Visualiser, Light Sensor. Missing Sun Tracker AR, Companions, and renamings |

#### Pacing / bombardment risk

`useAutoTrigger` fires on every route change (with a 800 ms debounce). New user lands on `/dashboard` → `global_welcome` fires → completes → navigates to `/shed` → `garden_hub_tour` fires → `/planner` → `planner_tour` fires → `/schedule` → `task_schedule_tour` fires → `/tools` → `tools_hub_tour` fires. That's **five flows in one session** before the user has done anything. Each is 1–2 minutes. The user has correctly identified this as a bombardment risk.

### 3. In-app documentation

- 15 markdown files in [`documentation/`](../../documentation/), loaded into Help Center's Docs tab via [`src/onboarding/docs.ts`](../../src/onboarding/docs.ts).
- `grep -l "Garden AI"` returns **2 of 15** files. `grep -l "Weekly Overview"` and `"Notes"` and `"Voice"` and `"Pl@ntNet"` and `"image credit"` all return **zero**.
- Every file pre-dates Wave 21 (Weekly Overview), Wave 22.0001 (Voice + Notes), 22.0002–7 (image credits), and the recent Pl@ntNet / agent-chat / Plant Lens renamings.

### 4. Inline tooltips

- [`InfoTooltip.tsx`](../../src/components/InfoTooltip.tsx) is the reusable click-to-reveal pattern (Wave 2 in the original UX audit).
- Currently used across about 12 surfaces (LocationManager, TheShed, AilmentWatchlist, etc.).
- Gaps: voice settings, weekly overview sections, notes editor toolbar buttons, image credit badge itself, Pl@ntNet candidate tiles.

### 5. What's New modal (release notes)

- Powered by `release_notes` table + the WhatsNewModal surface.
- This works well — every deploy we've shipped adds a section.
- It's the **only** place the user currently learns about new features after the welcome modal.

---

## What "good" looks like

A new user signing up today should experience:

1. **First minute** — Welcome modal + sign-in (no walkthroughs trying to fight for attention).
2. **First session** — Pinned Getting Started checklist on the dashboard, one small Welcome Modal at the front, optional Garden Quiz nudge. **No auto-firing tours.**
3. **Days 2–3** — As they tap into a surface for the first time, a single contextual tour fires for that surface (route-based, but throttled to one per day).
4. **Week 1–2** — Deeper feature tours unlock when the user touches related surfaces (e.g. opens the chat for the first time → Garden AI tour; creates a Note → notes tour).
5. **Ongoing** — Help Center drawer is always one tap away with the full catalogue, searchable, plus the up-to-date Docs tab.
6. **After every deploy** — What's New modal explains specifically what changed.

The key change vs today: **pacing is throttled** (max one auto-tour per day), **triggers are signal-based** (used a feature → unlocks its tour), and the **content is current**.

---

## Phased delivery — five sub-waves

I propose splitting this into five waves so each is shippable independently and re-evaluable before the next begins. Suggested order:

### Wave 23.0001 — Pacing engine + bombardment fix (the safest, highest-impact one to ship first)

- Rework `useAutoTrigger` to throttle: max one auto-firing flow per calendar day (persisted via `onboarding_state.last_auto_trigger_at`).
- Add a `prerequisite` field to `FlowDef` — a flow can require another flow to be completed first (so `dashboard_tour` won't fire until the user has completed `global_welcome`).
- Add a `triggerSignal` field — flows can opt into action-based triggers ("user_first_opened_chat", "user_first_created_note") instead of route-based.
- Replace the `global` route catch-all with a one-shot "first session opened" check.
- **Net effect**: zero existing content rewrites, but the user stops being bombarded immediately. New users see at most the welcome flow on day 1, one per day after that.

### Wave 23.0002 — Documentation refresh

Update all 15 `documentation/*.md` files to cover Wave 19 → 22 features. Add **6 new docs**:
- `16-notes.md`
- `17-weekly-overview.md`
- `18-voice-in-chat.md`
- `19-image-credits.md`
- `20-pl-ntnet-identification.md`
- `21-nursery-and-sowing.md`

Refresh the existing 15 to mention current naming (Garden AI vs Plant Doctor, Plant Lens vs identify_vision flow), updated screenshots/copy, etc.

### Wave 23.0003 — Flow registry refresh

For each existing flow:
- Update copy where stale
- Update `attachTo` selectors where surfaces have moved
- Re-record screenshots where the UI has shifted

Add the missing flows (matching the gap table above):
- `quick_access_tour`
- `weekly_overview_tour`
- `notes_tour`
- `voice_chat_tour`
- `image_credits_tour`
- `garden_ai_chat_tour`
- `plantnet_identification_tour`
- `nursery_tour`
- `garden_walk_tour`
- `seasonal_picks_tour`
- `quick_launcher_customise_tour`

Each new flow uses the new `triggerSignal` from Wave 23.0001 so they don't auto-fire on first route visit — they wait for the user to actually use the feature.

### Wave 23.0004 — Inline tooltip pass

Sweep for `InfoTooltip` opportunities on:
- Voice settings (auto-read explanation)
- Weekly Overview section headers
- Notes editor toolbar
- Image credit badge popover
- Pl@ntNet tiles (what CC-BY-SA actually means)
- Garden AI chip / mic button

Goal: a user can hover/tap any non-obvious control and get a one-line explanation without leaving the page.

### Wave 23.0005 — Help Center & onboarding state polish

- Add a "What can I do here?" surface on each main route that shows the relevant docs + flows for that page (replaces the current free-floating drawer).
- Add a Settings page entry to reset onboarding state (today it's manual SQL).
- Add a "Send feedback on this guide" button on each flow (writes to `beta_feedback` table).
- Re-trigger `global_welcome` flow after a major release if the user has been away for 30+ days.

---

## Sub-wave dependencies

```
23.0001 (Pacing engine)
   └── unblocks 23.0003 (so new flows can opt into signal-based triggers)
       └── benefits from 23.0002 (so the new flows can link to the new docs)
           └── 23.0004 (tooltip pass) parallel — independent
               └── 23.0005 (polish) last
```

Ship 23.0001 first as a defensive measure (stops bombardment for users today), then 23.0002 + 23.0003 in any order, then 23.0004 + 23.0005 as polish.

---

## Tier gating

None. All onboarding surfaces are universally available.

## Tests

Per wave. The pacing engine (23.0001) gets a unit test covering the throttle window. The flow registry can be sanity-checked via a snapshot of `flowRegistry.length` per category.

## Risks

| Risk | Mitigation |
|------|------------|
| **Doc rewrites are tedious** | Generate first drafts from the relevant `docs/app-reference/*.md` files (which we maintain religiously) — they're our internal source of truth so they're current. Then trim for user voice |
| **Screenshots in flow steps reference paths that no longer exist** | Audit `/assets/onboarding/*.png` as part of 23.0003; replace dead refs with `null` (Shepherd handles that gracefully) until we re-shoot |
| **Throttle could mask a genuinely critical flow** | Critical flows (Welcome, Home Setup) bypass the throttle — only `trigger: "automatic"` flows that aren't tagged `important: true` are throttled |
| **User wants to re-experience a flow** | Help Center already lets them re-launch; no regression |
| **Migration cost** | Onboarding state column already exists; we just write new keys to it. No DB migration needed for any of the five waves |

---

## Scoping questions

Before drafting per-wave plans I want to lock two design calls:
