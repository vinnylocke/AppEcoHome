# UX review — action analysis

> Source: the UX review session 2026-06-15 (rookie persona "Mia" + pro persona "Sam"). This document takes every concrete gap, want, or rewording from that review and analyses it on three axes: **difficulty to implement**, **pros of doing it**, **cons / risks**. Each item ends with a recommendation (Ship / Defer / Investigate) and a sketch of what's involved.

## How this document is organised

The 24 items below are grouped into 7 themes. Within each theme they're roughly ranked by impact. The table at the very end is the cross-cutting prioritisation matrix.

---

## Decisions log — 2026-06-15

After reviewing the 4 open questions from the prior pass, the following decisions were taken:

| # | Question | Decision | Affects |
|---|---|---|---|
| Q1 | Should we allow some free AI usage to lower the upgrade-decision barrier? | **Yes — ship a small free Plant Doctor quota.** 5 identifications per rolling 7-day window per user. Identify-only (no diagnosis, no diagnosis chat). Reset is a sliding window, not a calendar week. Estimated cost: ~£0.0008 per identification × 5/wk × heavy-user assumption = pennies per active user per month. | Item 3.1 — moved from "Investigate" to "Ship" |
| Q2 | Build a cross-home dashboard view? | **Defer.** No usage data yet on how many users will operate >1 home. Re-evaluate when home-count distribution is known. | Item 5.2 — confirmed Deferred |
| Q3 | Broaden device support (eWeLink hosted OAuth)? | **Defer the eWeLink-specific work; pivot to a modular open-source integration framework instead.** User has a soil sensor arriving and wants the architecture to be modular so external developers can implement their own adapters against a stable contract. See new item 7.3 below — Phases A–D triggered when the soil sensor arrives; eWeLink hosted OAuth (7.2) waits for hardware to validate against. | Item 7.2 — Deferred. New item 7.3 added. |
| Q4 | Confirm the 4-sprint delivery plan? | **Confirmed.** Sprint 1 = 8 XS items. Sprints 2–4 follow as previously sketched. | Prioritisation matrix below |

These decisions are reflected in the items themselves and in the final prioritisation matrix.

**Difficulty scale:**

| Code | Meaning | Rough cost |
|---|---|---|
| **XS** | < 30 minutes, one file | Cosmetic edits, copy changes, single-component additions |
| **S** | < ½ day, 1–3 files | Single feature addition with no schema work |
| **M** | 1–3 days | New component(s) + a column or two + tests |
| **L** | 1–2 weeks | New flow with multiple surfaces + edge functions + email |
| **XL** | > 2 weeks | Schema design + data migration + multi-surface UI + cross-tier gating decisions |

---

# Theme 1 — Onboarding friction

The single biggest cross-persona finding: **four gated screens between sign-up and first plant** is too many for both a rookie (overwhelmed) and a pro (impatient). Both personas told us so for different reasons.

---

### 1.1 Defer tier selection until first AI use

**The gap.** Today: a brand-new user hits `Auth → Home Setup → Tier Selection → Welcome Modal → Quiz prompt → Dashboard`. Tier Selection forces them to pick Sprout / Botanist / Sage / Evergreen before they've seen anything. Rookies don't know what AI Plant Doctor is, so they can't evaluate Sage's value. Pros want to skim before deciding.

**Difficulty: M.** Touches:
- `App.tsx` post-signup redirect (skip Tier Selection if `subscription_tier IS NULL` → default to Sprout)
- Every AI-tier-gated surface (`PlantDoctor`, `SchedulePage` Optimise AI tab, `YieldPredictor`, `CompanionPlantsTab`, `GardenLayoutEditor` Microclimate Report etc.) needs an inline upgrade prompt
- New shared `<TierUpgradePrompt category="ai_plant_doctor">` component that gracefully maps each gated feature to its tier
- Tier picker still exists but lives at `/gardener?tab=subscription` for explicit upgrade

**Pros:**
- Cuts first-run time from ~3 minutes to ~45 seconds. Most likely single change to lift Mia's first-run score from 6/10 to 8/10.
- Users encounter the upgrade prompt when they're EXCITED about a feature (just took a photo of a sick plant) — much higher conversion than when they're confused on slide 4 of onboarding.
- Aligns with industry norm (Strava, Notion, Spotify all use "freemium first, paywall on intent").

**Cons / risks:**
- Trial / promo logic gets harder — currently "the moment a user signs up" is a clean trial-start event. If tier selection moves later, billing analytics need to handle "intent-triggered" upgrades differently.
- Some users will never hit an AI feature and the tier picker becomes hard to find. We'll need a permanent "Upgrade" link in the user dropdown.
- A/B testing this is hard — onboarding tests are slow because conversion only shows up at week 2+.

**Recommendation: Ship.** Highest single-change ROI of the review. Pair it with #1.2 to land both at once.

---

### 1.2 "I'm experienced" express lane on Welcome Modal

**The gap.** Sam: "I know what Location → Area → Plant means. Why am I being taught this?" Currently the Welcome Modal is a 4-slide carousel that everyone steps through.

**Difficulty: XS.** Single component (`WelcomeModal.tsx`), single boolean field on `user_profiles.preferences.onboarding_persona`. Slide 1 gets a second button "I'm an experienced gardener — skip the tour" alongside "Show me around." Click → mark all checklist items as complete + dismiss the quiz prompt + close the modal.

**Pros:**
- 30-second fix, immediate Sam-shaped win.
- Doesn't penalise rookies — the explainer stays the default.
- The boolean carries downstream — Sam doesn't see "Drag a shape to start" coach marks in the Garden Layout Builder either.

**Cons:**
- Sam can mis-click and lose the explainer if he's curious about it later. Mitigate: "Show the tour" option in user dropdown to re-trigger.
- Adds a "persona" concept we'll need to extend to other onboarding surfaces (otherwise it's just a single shortcut).

**Recommendation: Ship.** Pairs naturally with #1.1.

---

### 1.3 Empty-state nudges (Today's Tasks, Plant Library)

**The gap.** Today's Tasks empty state says "no tasks." Plant Library on a fresh account is blank. Both fail to guide the user to the next obvious step.

**Difficulty: XS.** Edit the empty-state copy + add a single CTA button in each empty state. ~20 lines per surface, ~5 surfaces.

**Pros:**
- Tiny effort, helps every rookie.
- Implicit teaching: the empty state is a tutorial.

**Cons:**
- More surfaces to keep in sync if we change wording later.

**Recommendation: Ship.** Bundle with #1.2 if shipping a single onboarding-pass PR.

---

### 1.4 Garden Quiz re-prompt instead of permanent dismiss

**The gap.** Mia dismissed the quiz once. She never sees it again. Her recommendations are now generic forever.

**Difficulty: S.** Replace the `quiz_dismissed: true` boolean with `quiz_dismissed_until: date`. Default snooze: 14 days. Re-prompt after expiry. Add a "Don't ask again" option for users who genuinely don't want it.

**Pros:**
- Reverses the irreversible mistake of an early dismiss.
- Quiz answers are the foundation for most personalised AI surfaces — losing them is costly.

**Cons:**
- Risk of pestering the genuinely-disinterested user. Mitigation: the explicit "Don't ask again" button.
- Adds a minor cron/job to re-evaluate prompts (or do it lazily on dashboard load).

**Recommendation: Ship.** Low risk, addresses a real long-tail cost.

---

# Theme 2 — Discoverability + findability

Both personas missed power features because they live in nested menus.

---

### 2.1 Garden Walk on the dashboard once plant count ≥ 5

**The gap.** Garden Walk is genuinely great for triage. Sam wouldn't find it unless he opened every Tools entry.

**Difficulty: XS.** Conditional card in `HomeDashboard.tsx` — show when `inventory_items.count >= 5`. Wave-7 hub pattern is already established.

**Pros:**
- One-line condition unlocks an entire feature for the audience that benefits most.
- Self-gating: rookies with 1 plant never see it; pros with 30 plants see it day 2.

**Cons:**
- One more dashboard card on a list that's already long. Risk of cognitive overload.

**Recommendation: Ship.** Trivially cheap.

---

### 2.2 In-place tooltips ("What does this do?")

**The gap.** Mia: Garden Intelligence rules use vocabulary like "Auto-watering rule visible" without explaining what it'll DO. Sam: Optimise scenario badges (Fragmentation, Two-tier Split, Pile-up) need definitions. Both: tier-gated upgrade cards say "Sage+ required" without describing what they'd unlock.

**Difficulty: M.** Single `<InfoTooltip>` component is XS. The work is in placing them: roughly 30 locations across the app. Includes copywriting for each tooltip — each tooltip needs to be ≤ 2 lines.

**Pros:**
- Reduces "what does this do?" Slack messages from new users.
- Builds confidence: the app teaches in context rather than expecting prior knowledge.
- Tier-gated tooltips that describe value rather than just gating could lift conversion.

**Cons:**
- Tooltips are an anti-pattern on mobile (no hover). Need a tap-to-reveal mobile alternative.
- Risk of "tooltip fatigue" if used for things that should be self-evident.
- Copywriting time is real — 30 × ≤2-line definitions ≈ 60 lines × multiple review rounds.

**Recommendation: Ship.** But scope it: deliver an `<InfoTooltip>` component + 5 highest-value placements (Garden Intelligence, Optimise badges, 3 most-clicked tier-gates) as Phase 1. Future phases cover the rest.

---

### 2.3 Cmd+K spotlight discoverability for rookies

**The gap.** The spotlight is excellent but rookies don't know about it. Cmd+K is invisible.

**Difficulty: XS.** Add a "Press ⌘ K to search anywhere" hint at the top of the dashboard for the first 7 days post-signup. Or persistent in the empty-state of Today's Tasks.

**Pros:**
- Free awareness boost for one of the strongest features.
- Once a user uses Cmd+K once, they'll use it forever (well-documented behaviour pattern).

**Cons:**
- Hint clutter on the dashboard.
- Mobile users can't use Cmd+K — need an alternative ("Tap the search icon" with finger-pointing animation).

**Recommendation: Ship.** Phase 1: desktop hint only. Phase 2: mobile equivalent.

---

# Theme 3 — Tier-gating philosophy

Possibly the most contentious item: the AI features that would convert Mia to Sage are entirely locked, so she never tries them.

---

### 3.1 Free-tier limited AI Plant Doctor — IDENTIFY-ONLY (5 / rolling 7 days)

**The gap.** Mia's #1 use case ("what's this plant?") is gated to Sage+. She sees an upgrade card. Conversion from "I've never tried it" to "I'm paying $6/mo for it" is much harder than "wow that ID was right — let me upgrade for unlimited + diagnosis."

**Scope clarification (Decision 2026-06-15):** Free tier gets **identification only**, not diagnosis. Identify = "what plant is this?" Diagnosis (pest / disease / ailment guidance) stays Sage+ paid. This keeps the free experience meaningfully lower-cost AND preserves a clear "upgrade for the full diagnosis" upsell.

**Quota:** 5 identifications per rolling 7-day window per user. Sliding window — every identification's 7-day-old slot drops off as new ones land. No "calendar week reset" UX moment.

**Difficulty: M (reduced from L now that scope is identify-only).** Requires:
- `ai_call_quotas` table — `(user_id, function_name, used_at)` — count rows where `used_at > now() - interval '7 days'`.
- Quota check inside `identify-plant` edge function (before Gemini call). Diagnosis path stays Sage+ gated as today.
- Client UI: "3 of 5 free identifications remaining (resets in 4 days)" badge on the Plant Doctor identify CTA.
- Tier-aware upgrade modal: "You've used your 5 free IDs this week — upgrade to Sage for unlimited identifications + AI diagnosis."
- No cron job needed — sliding window is computed at query time, no reset job.
- New event in `events/registry.ts` for `ai_quota_exceeded`.
- Tier-gating doc update (`17-tier-gating.md`).

**Cost estimate.** Gemini 2.5 Flash identification call ≈ 1500 input tokens (image + prompt) + 200 output tokens. At Flash pricing that's ~£0.0008 per call. At 5/week × 4 weeks = 20 calls/mo per heavy free user = **£0.016 per heavy free user per month**. If free-to-Sage conversion sits at industry-standard 3-5%, the unit economics are dominated by the conversion lift, not the AI cost.

**Pros:**
- Highest-impact conversion lever in the app.
- Strava / Spotify pattern (freemium with quotas) consistently outperforms hard paywalls ~5×.
- Mia's #1 painpoint becomes her #1 reason to upgrade.
- Identify-only carve-out keeps the cost story very clean.

**Cons:**
- Abuse vector: anonymous-looking signups can spam free IDs. Mitigation: existing per-user rate limit on `identify-plant` already covers the worst abuse; can add email-verification gate if needed later.
- Tier-gating split between "identify free" + "diagnose paid" means the Plant Doctor UI needs to clearly communicate which is which.

**Recommendation: Ship.** In a follow-up sprint after Sprint 1 — the work needs a real plan doc of its own. Sprint 1 stays focused on the 8 XS items.

---

### 3.2 AI-Powered Optimise on lower tiers (1/month)

**The gap.** Same shape as #3.1 — the most useful AI feature on `/schedule` is Sage+. A Botanist user with 20 routines would benefit hugely from one monthly AI Optimise sweep.

**Difficulty: M.** Same infrastructure as #3.1 but smaller surface area (single edge function, single feature).

**Pros:**
- Same conversion-driver logic as 3.1, smaller audience but real.
- Sells the Sage tier ("I want this weekly, not monthly").

**Cons:**
- Audience is much smaller than Plant Doctor (Optimise is a power-user feature).
- Better deferred until 3.1 has shipped + economics validated.

**Recommendation: Defer.** Ship after 3.1 if the freemium model validates.

---

# Theme 4 — Bulk operations

Sam arrives with a list. The app currently treats him like a first-timer.

---

### 4.1 CSV / bulk-paste plant import

**The gap.** Sam wants to type or paste 30 plants in one go. Today: search + add one by one. The Nursery already has a bulk-paste pattern (regex + AI parse) — the Shed doesn't.

**Difficulty: M.** Mostly reuse:
- `_shared/parseSeedPackets.ts` parser (regex tier) is a strong base — extend to a `parsePlantList.ts` that handles "Tomato Sungold", "Basil Genovese × 3", scientific names, etc.
- New `BulkAddPlantsModal.tsx` mirroring `BulkPasteSeedPacketsModal.tsx`
- Hook into the existing catalogue clone path (`add-plant-to-library` edge function — already handles AI enrichment per row)
- AI-tier-gated parse path (existing pattern)
- 4-5 new Playwright cases under SHED-* (~150 lines)

**Pros:**
- Removes the single biggest pro-onboarding friction.
- Sam will tell other pros — pros are influencer-shaped.
- Re-uses existing infrastructure.

**Cons:**
- Failure modes are nasty: AI gets 25 of 30 names right and inserts 5 wrong species. Need a review-then-confirm step (the Nursery has this pattern, mirror it).
- "Quantity per plant" (`× 3`) needs new UX — does it create 3 inventory items or 1 with quantity 3?

**Recommendation: Ship.** Targets pro retention which is where revenue lives.

---

### 4.2 One-click watering reminder from plant card

**The gap.** Mia: setting a watering reminder requires opening the full Schedule → New Routine modal with 8 fields. That's the right modal for power users; it's the wrong modal for the first reminder she ever sets.

**Difficulty: S.** New "Quick reminder" button on `PlantEditModal` care tab. Pre-fills:
- Task type = Watering
- Frequency = `plant.watering_min_days ?? 4`
- Linked inventory items = all instances of this plant
- One confirm tap → creates the blueprint
- Toast: "Done — we'll remind you every X days"

**Pros:**
- Lowers task-creation cost from ~8 clicks to 2.
- Mia immediately sees value: she pressed a button and got something useful.
- The full modal stays for power users.

**Cons:**
- Duplicates a path (now there are TWO ways to create a Watering routine — quick + full).
- Might miscalibrate if the plant has multi-instance complexity (some pots dry faster than others).

**Recommendation: Ship.** Trivial scope, high-frequency win.

---

# Theme 5 — Multi-home + collaboration

Two big asks: a way to see across homes, and a way to invite co-gardeners that doesn't require copy-pasting UUIDs.

---

### 5.1 Tokenised email invite for co-gardeners

**The gap.** Adding a co-gardener requires the owner to copy a UUID to clipboard, message it via WhatsApp / SMS, then the invitee pastes it into Join Home flow. Nobody does this.

**Difficulty: L.** Requires:
- New table `home_invite_tokens (token PK, home_id, role, created_by, expires_at, used_at)`.
- New RLS policies (owner can create, anyone with token can read for self-redemption).
- New edge function `create-home-invite` → generates token + emails invitee via Resend.
- New `/join/:token` route → handles signed-out (sign-up prompt) + signed-in (one-click accept).
- Email template (new).
- Owner UI: invite-by-email form on Members tab.

**Pros:**
- Removes the single biggest collaboration friction.
- Family/partner gardens become the easy default.
- Pairs with #5.2 (multi-home view) — both contribute to "Rhozly works for households" positioning.

**Cons:**
- New auth surface = new attack surface. Tokens need careful design (single-use, time-limited, rate-limited).
- Email deliverability is its own engineering problem (Resend is already wired but invite emails go to cold inboxes).
- Edge cases: invitee email matches existing different user, invitee declines, invitee's email is misspelled.

**Recommendation: Ship.** Has to happen for the family-garden positioning to be honest.

---

### 5.2 Cross-home unified dashboard view

**The gap.** Sam has 2 homes. To reconcile tasks across both, he's switching homes constantly.

**Difficulty: L.** Touches:
- New `/all-homes` route OR a new "All Homes" toggle on the existing dashboard.
- Query layer: every existing home-scoped query needs an "across all my homes" variant (typically `IN (...home_ids)` instead of `eq("home_id", ...)`).
- RLS: existing policies already allow this implicitly (`is_home_member(home_id)`) since the user is a member of all their homes.
- UI: tasks/weather/alerts grouped by home in the unified view.
- Performance: cardinality assumption changes (one user could be in 5 homes).

**Pros:**
- Frees pros from constant home-switching.
- Useful for "did I water everything?" anxiety at end-of-day.

**Cons:**
- The UI for "tasks across all my homes" needs grouping headers — it gets messy fast.
- Most users have one home. Building "unified view" for the 5% multi-home users is a non-trivial UX investment.
- Notifications get tricky: do they show home name? Do users tap and land on the right home?

**Recommendation: Defer.** (Decision 2026-06-15) No multi-home usage data yet — the app is pre-launch and nobody is operating >1 home. Re-evaluate once we have a real distribution of home-counts per user. When we do build it, position it as Sage+.

---

# Theme 6 — Smaller wins (XS-S)

These are the "obvious" items that don't need long arguments.

| # | Item | Difficulty | Recommendation |
|---|---|---|---|
| 6.1 | **Bookmark / save on Rhozly guides** — new `user_guide_saves` table + heart icon + filter on guide list | S | Ship |
| 6.2 | **"Add to Shed" vs "Save to Library" wording audit** — one PR replacing inconsistent button labels with a single vocabulary | XS | Ship |
| 6.3 | **Default frequency-days hint per task type** — show "Watering: typically 3-7 days" hint under the frequency input in Routine modal. Defaults already exist in `TASK_TYPE_DEFAULT_FREQUENCY` per the code I've seen; just expose them more visibly | XS | Ship |
| 6.4 | **Yield Predictor "log 3 yields to unlock"** — replace "no data" empty state with a progress bar | XS | Ship |
| 6.5 | **Tier Selection + Welcome Modal desktop layouts** — both currently render mobile-shape on desktop. Add tablet/desktop breakpoints | S | Ship |
| 6.6 | **Stray `due_date` file in repo root** — `git rm due_date` + add to `.gitignore` if it's a real artefact | XS | Ship |
| 6.7 | **"Pause for the winter" before account delete** — add an intermediate option in the delete-account confirm: "Pause my account / Export my data first / Delete everything" | M | Defer (M-shaped work for a 5-user-a-year action) |
| 6.8 | **In-app FAQ / `/help` route** — re-use the Rhozly Guides table with a category filter `category='help'` instead of building a separate system | S | Ship |
| 6.9 | **Free-form drawing in Garden Layout** — currently "Pending E2E." Investigate actual code state before scoping | M | Investigate |

---

# Theme 7 — Mobile-specific friction

---

### 7.1 Bottom thumb-zone awkwardness on phone

**The gap.** The user-profile dropdown is top-right — Sam reaches across the screen 30× a day. Mobile-first design conventions put primary actions in the bottom thumb zone.

**Difficulty: S-M.** Options:
- (S) Mirror the user-dropdown in the QuickAccessHome bottom area on mobile, leaving the existing top-right copy untouched.
- (M) Restructure the mobile header so the user dropdown lives bottom-right via a floating button (matches the QuickAccessHome pattern already shipped).

**Pros:**
- Reduces top-corner reach friction.
- Aligns with the QuickAccessHome design vocabulary.

**Cons:**
- Adds floating UI to an already-busy mobile viewport.
- Desktop users get the existing pattern — inconsistency between phone and desktop.

**Recommendation: Ship the S version.** A second bottom-zone entry point is cheap and reversible.

---

### 7.2 eWeLink setup needs developer credentials on first connect

**The gap.** Setting up an eWeLink valve currently asks for "App ID + App Secret" — most users don't have those because they signed up via the consumer eWeLink app, not the developer console.

**Difficulty: L.** Requires a hosted OAuth flow:
- Rhozly registers as an eWeLink developer (one-time, manual).
- Edge function `integrations-ewelink-hosted-connect` uses our own credentials, hands the user a regular eWeLink login → callback → token storage.
- The current "bring-your-own-credentials" path stays for power users + air-gapped deployments.

**Pros:**
- Removes the eWeLink integration's single biggest setup blocker.
- Makes the integration usable by Mia's persona (she has a Sonoff valve she bought on Amazon).

**Cons:**
- Adds Rhozly's eWeLink credentials as a shared resource — rate limits become "everyone shares one bucket."
- We become responsible for eWeLink's app review approval process.

**Decision (2026-06-15):** Defer pending hardware to test. The eWeLink-specific work waits until we have a way to validate the hosted flow on a real valve. Meanwhile improve dev-credentials path documentation (~30 min). Decision pairs with the larger architectural move below (7.3).

---

### 7.3 Modular open-source integration contract (NEW — 2026-06-15)

**The gap.** Today every device family (eWeLink valve, Ecowitt weather, light sensor) is a hand-coded set of edge functions with no shared contract. As soon as we add the user's incoming soil sensor — and again for the next device, and the one after — the cost of each integration is linear: write a new set of connect / poll / control functions from scratch. No external developer can contribute their own integration without reading the whole codebase.

The user wants a contract that:
- Defines the **device type families** Rhozly understands (valve, soil sensor, light sensor, weather station, etc.) with a stable shape per family.
- Lets a contributor implement an **adapter** — connect/auth + read/write — that conforms to the contract, without touching the rest of the app.
- Stays modular so the soil sensor lands as the second adapter, not the second hand-coded integration.

**Difficulty: XL.** This is real architecture work. Broken down by phase:

| Phase | Scope | Effort |
|---|---|---|
| **Phase A — Document the existing contract** | Audit current `supabase/functions/integrations-ewelink-*` + `integrations-ecowitt-*` + `_shared/integrations/providerTypes.ts`. Extract the actual de-facto contract into `docs/app-reference/99-cross-cutting/INTEGRATION-CONTRACT.md` — what shape a `connect` / `state` / `control` / `poll` function must have. No code changes; just document what's already there. | S (~1 day) |
| **Phase B — Soil-sensor adapter as exemplar** | When the user's soil sensor arrives, build the adapter following the documented contract. Refactor any obvious sharp edges in the contract as we discover them. **The soil sensor is the natural pressure test for the abstraction.** | M (~3 days, depends on sensor's API) |
| **Phase C — Formalise + register-time runtime** | Lift the now-validated contract into TypeScript interfaces in `_shared/integrations/contract.ts`. Add an adapter registry pattern so the app discovers adapters at deploy time. New device types appear in the Integrations UI automatically. | M (~3 days) |
| **Phase D — Contributor-facing docs + examples** | `docs/integrations/CONTRIBUTING.md` with a worked example (the soil sensor adapter itself) + an adapter template. README pointer. PR template asking new adapters to ship: schema migration + edge function + readings shape + UI tile config. | S (~1 day) |
| **Phase E — Open-source extraction (optional)** | Lift `_shared/integrations/` into its own GitHub repo with an MIT licence. Rhozly imports it as a dependency. Anyone can fork or PR. **Defer until 3 working adapters exist.** | L (~1 week, mostly admin) |

**The shape of the contract (proposed):**

Each integration family is a TypeScript interface in `_shared/integrations/contract.ts`. Example for the existing eWeLink valve + the incoming soil sensor:

```ts
// Family: valve
interface ValveAdapter {
  family: "valve";
  provider: string;                        // "ewelink", "shelly", etc.
  connect(input: ConnectInput): Promise<ConnectResult>;
  fetchState(deviceId: string, creds: Creds): Promise<ValveReading>;
  control(deviceId: string, command: "turn_on" | "turn_off", durationSeconds: number, creds: Creds): Promise<void>;
}

// Family: soil_sensor (new — drives the soil sensor work)
interface SoilSensorAdapter {
  family: "soil_sensor";
  provider: string;
  connect(input: ConnectInput): Promise<ConnectResult>;
  fetchReading(deviceId: string, creds: Creds): Promise<SoilReading>;
  // No control surface — soil sensors are read-only.
}

interface SoilReading {
  moisture_pct: number;            // 0-100
  temperature_c: number | null;    // some sensors report soil temp
  conductivity_us_cm: number | null;
  ph: number | null;               // some advanced sensors
  recorded_at: string;             // ISO timestamp
}
```

Once Phase B lands (the soil sensor adapter as a real working example), Phases C-D drop out of it naturally. Phase E is genuinely optional — only useful when the community grows beyond the user's own contributions.

**Pros:**
- The user's soil sensor work directly informs the abstraction — we ship a real second adapter alongside the contract, not a theoretical one.
- Future devices become S-shaped effort, not L-shaped.
- Open-source positioning becomes credible — there's a contract to integrate against, not "read the codebase and figure it out."
- Reusing the same `readings` table + `devices` table means the UI surface (Integrations Hub, automation engine, dead-mans-switch cron) just works for new device types without further changes per device.

**Cons:**
- XL effort spread across 5 phases. Each phase is shippable independently but the total feels intimidating up front.
- Some abstractions discovered in Phase A might not survive Phase B — be willing to refactor the contract once the soil sensor exposes its edges.
- Open-source extraction (Phase E) brings governance overhead (PRs to review, breaking-change discipline, semver). Only worth it if there's actual community demand.

**Decision (2026-06-15):** Phases A + B + C + D move forward when the soil sensor arrives — that's the natural prompt. Phase E (open-source extraction) waits until 3+ working adapters exist. **No immediate action this sprint.** Adds a placeholder app-reference file at [`docs/app-reference/99-cross-cutting/INTEGRATION-CONTRACT.md`](../app-reference/99-cross-cutting/INTEGRATION-CONTRACT.md) when Phase A lands.

---

# Cross-cutting prioritisation matrix

Sorted by recommended ship order. Each row maps to a section above.

| Order | Item | Theme | Difficulty | Impact | Recommendation |
|---|---|---|---|---|---|
| 1 | 1.2 Pro express lane | Onboarding | XS | High | **Ship now** |
| 2 | 1.3 Empty-state nudges | Onboarding | XS | Medium | **Ship now** |
| 3 | 6.6 `due_date` file cleanup | Tidy | XS | Cosmetic | **Ship now** |
| 4 | 6.2 "Add to Shed" wording | Tidy | XS | Medium | **Ship now** |
| 5 | 6.3 Frequency-days hint | Tidy | XS | Medium | **Ship now** |
| 6 | 6.4 Yield Predictor unlock progress | Tidy | XS | Low | **Ship now** |
| 7 | 2.1 Garden Walk dashboard card | Discoverability | XS | Medium | **Ship now** |
| 8 | 2.3 Cmd+K hint | Discoverability | XS | Low | **Ship now** |
| 9 | 4.2 One-click watering reminder | Bulk ops / rookie | S | High | **Ship next sprint** |
| 10 | 1.4 Quiz re-prompt mechanic | Onboarding | S | Medium | **Ship next sprint** |
| 11 | 6.1 Bookmark Rhozly guides | Tidy | S | Medium | **Ship next sprint** |
| 12 | 6.5 Tier Selection desktop layout | Tidy | S | Low | **Ship next sprint** |
| 13 | 6.8 `/help` route | Discoverability | S | Medium | **Ship next sprint** |
| 14 | 7.1 Mobile thumb-zone user dropdown | Mobile | S | Medium | **Ship next sprint** |
| 15 | 1.1 Defer tier selection | Onboarding | M | Very high | **Plan + ship** |
| 16 | 2.2 InfoTooltip + 5 placements | Discoverability | M | Medium-high | **Plan + ship** |
| 17 | 4.1 CSV / bulk plant import | Bulk ops / pro | M | High | **Plan + ship** |
| 18 | 5.1 Tokenised email invite | Collaboration | L | High | **Plan + ship** |
| 19 | 3.1 Free-tier Plant Doctor — identify-only (5/wk) | Tier-gating | M (reduced from L) | Very high | **Ship — Sprint 3+ (post-Sprint 1)** |
| 20 | 6.9 Free-form drawing | Tools | M-? | Medium (Sam-only) | **Investigate first (code state)** |
| 21 | 7.2 eWeLink hosted OAuth | Integrations | L | Medium | **Defer — waits on real valve to test against** |
| 22 | **7.3 Modular open-source integration contract (NEW)** | Integrations / architecture | XL (5 phases) | High (long-term) | **Phases A–D triggered when soil sensor arrives; Phase E optional** |
| 23 | 5.2 Cross-home unified view | Collaboration | L | Unknown (no usage data) | **Defer — re-evaluate after launch** |
| 24 | 3.2 AI Optimise on lower tiers | Tier-gating | M | Medium | **Defer until 3.1 lands** |
| 25 | 6.7 "Pause for the winter" | Account | M | Low | **Defer (rare action, M-shaped work)** |

---

## Suggested sequencing (confirmed 2026-06-15)

**Sprint 1 — onboarding-pass PR (1 day total). ← ACTIVE.** Items 1–8. All XS, all related to "first 10 minutes." Single commit, single deploy. Lifts Mia's first-run rating noticeably with negligible code risk.

**Sprint 2 — rookie-power PR (2-3 days).** Items 9–14. The "small wins" cluster. One commit per item, batched deploys.

**Sprint 3 — tier-gating overhaul + free Plant Doctor (1.5 weeks).** Item 15 (defer tier selection) and item 19 (free identify-only Plant Doctor quota). These pair naturally — defering tier selection only works once "what do I get for free" is settled, and the free quota IS the answer to that. Both touch the same upgrade-prompt surfaces.

**Sprint 4 — tooltips + pro features (1 week).** Items 16, 17, 18. Bulk import lands first (lowest risk, highest pro impact), then InfoTooltip with 5 placements, then the email invite system.

**Discovery sprint (parallel).** Item 20 only — audit `garden-layout-builder` free-form drawing code state. ~0.5 day. Items 21–23 already have decisions.

**Soil sensor arrival → integration framework.** When the user's soil sensor arrives, Phases A–D of item 22 (modular integration contract) start. Sequencing depends on hardware ETA, not this sprint plan.

**Defer pile.** Items 23 (cross-home), 24 (AI Optimise quota), 25 (Pause for winter) — revisit at next quarterly UX review unless metrics shift.
