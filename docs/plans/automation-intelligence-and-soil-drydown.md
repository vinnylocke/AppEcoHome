# Automation Intelligence & Soil-Drydown Model — Plan

**Status:** ✅ **Pillars A + B shipped (2026-06-20).**
- **A:** `soil_moisture_profiles` + drydown math (`_shared/soilProfile/drydown.ts`, Deno-tested) +
  `compute-soil-profiles` + daily cron + the **Moisture behaviour** card on Area details → Readings.
- **B:** `automation_suggestions` + the deterministic analyser (`_shared/automationSuggestions/analyse.ts`,
  Deno-tested) + `analyse-automations` + daily cron + the suggestion chip on `AutomationCard`
  (one-tap Apply / Dismiss / Details). **Still to do for B:** the Sage+ AI rewrite of `rationale` →
  `ai_rationale` (the deterministic rationale ships now; the column + UI already prefer `ai_rationale`).

Pillar C (feed the model into plant recommendations + weather advice + a drydown-anomaly pattern) is next.

**App-reference consulted:** [`09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md),
[`26-pattern-engine.md`](../app-reference/99-cross-cutting/26-pattern-engine.md); plus a full code
survey of `evaluate-automations`, `area-sensor-analysis`, the pattern engine, weather snapshots,
cron registration, and the automations UI (see §"Code reality" for file:line).
Related to read/update when building: `07-management/06-integrations-automations.md`,
`07-management/07-integrations-readings.md`, `27-weather.md`, `28-sun-analysis.md`,
`13-ai-gemini.md`, `11-cron-jobs.md`, `10-edge-functions-catalogue.md`,
`03-garden-hub/04-area-details.md`, [`17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md).

---

## 1. The opportunity

We collect a stream of soil-moisture readings and a full audit of every automation run — but we never
ask the obvious questions a thoughtful gardener would:

- *How fast does this bed actually dry out — and does that change with the weather?*
- *Is this watering automation set up sensibly, given what the soil is actually doing?*
- *Given the week's forecast, will it water too much or too little?*
- *Now that I know how this area holds water, what should I plant here?*

Today none of that exists. The plan adds a **soil-moisture behaviour model** (deterministic, cheap,
reusable) and an **automation-tuning layer** on top of it (suggestions, with optional AI explanation),
then **reuses the model across the app** (plant recommendations, weather-aware advice, AI grounding).

## 2. Code reality (what exists vs what's missing)

**Already exists (we build on these):**
- `evaluate-automations` (5-min cron) fires automations and logs **`automation_runs`** with
  `status` (`success` / `skipped_rate_limited` / `deferred_weather` / `failed` / …), `trigger_reason`
  `{ summary, matched }`, `devices_triggered`, `tasks_completed`, and sets `rate_limited_until`
  (`supabase/functions/evaluate-automations/index.ts:154–223`; rate logic `_shared/runLimit.ts`).
- `automations` carries the tuning knobs we'd suggest changing: `trigger_logic` tree,
  `run_limit_count` / `run_limit_window_hours`, `sensor_cooldown_minutes`, `duration_seconds`,
  `weather_mode` / defer cols.
- `device_readings` time-series (`soil_moisture`, `soil_temp`, `soil_ec`, `recorded_at`) +
  `valve_events` (open/close, `automation_run_id`) + `latest_device_readings()` RPC.
- **`area-sensor-analysis` → `area_ai_insights`** already does AI analysis of 30-day sensor
  **min/max/avg** + plant care ranges + in-area automations, and emits `plant_analysis[]` +
  `compatibility` (`supabase/functions/area-sensor-analysis/index.ts:1–474`). **This is the closest
  existing feature and our main reuse/extend point.**
- Pattern engine: `PatternDetector { id, label, detect(userId, homeId, db) }` →
  `user_pattern_hits` → `pattern-evaluate` → `user_insights` → AssistantCard
  (`_shared/patterns/index.ts`, `pattern-scan`, `pattern-evaluate`).
- `weather_snapshots` jsonb holds ~7-day daily + hourly forecast (`_shared/weatherForecast.ts`).
- Cron registration = a migration calling `cron.schedule(name, expr, $$ net.http_post(...) $$)`.
- AI plumbing: `callGeminiCascade` + `logAiUsage` (`_shared/gemini.ts`, `_shared/aiUsage.ts`).
- Automations UI: `AutomationsSection`, `AutomationCard` (+ `AutomationRunHistory`, "Run now"),
  `AutomationBuilderModal`, `AutomationDefaultsCard` — **no suggestion surface yet**.

**Missing (this is the whole feature):**
- ❌ **No drydown-rate / moisture-retention computation anywhere.** Only window min/max/avg exists.
- ❌ No automation-tuning analysis (rate-limited-but-still-dry, over/under-watering, weather-correlated drydown).
- ❌ Plant recommendations don't use real moisture behaviour (only sun / area metrics / averages).

## 3. The three pillars

### Pillar A — Soil-moisture behaviour model (deterministic, the foundation)

A new background job computes, per **device** (and rolled up per **area**), a *moisture behaviour
profile* from `device_readings` + `valve_events` + `weather_snapshots`:

- **Drydown rate** — the slope of moisture decline between waterings/rain (e.g. **%/day**), via linear
  regression over "dry-down segments" (a segment = from a local moisture peak after a watering/rain to
  the next watering/rain). Robust to noise (drop the rewet spikes, require N points).
- **Weather-segmented drydown** — bucket segments by the conditions during them (hot/dry vs cool/wet,
  using the snapshot's temp + rain + optionally the area's sun band from `28-sun-analysis`), so we can
  say "≈4 %/day normally, ≈8 %/day on hot dry weeks."
- **Watering response** — from `valve_events` + the moisture bump that follows: how much one fire of
  `duration_seconds` raises moisture, and how long it lasts before crossing the trigger threshold.
- **Retention class** — derived bucket: *fast-draining / balanced / moisture-retentive* (feeds plant
  recommendations + plain-language copy).

Stored in a new table **`soil_moisture_profiles`** (one row per device, plus an area rollup — or an
`area_id`-keyed view). Refreshed by a new cron (daily, or piggy-backed on a reading-count threshold).
**No AI** — it's math, so it's cheap and can power free surfaces.

### Pillar B — Automation analysis & suggestions

A layer that reads each automation's **config + recent `automation_runs` + the Pillar-A profile** and
emits **actionable suggestions** with a confidence and a one-tap "apply":

Deterministic triggers (examples):
- **Rate-limited but still dry** — `skipped_rate_limited` runs occurred AND moisture still fell below
  threshold in the window → *"raise run limit to N"* or *"extend duration to M"* or *"shorten
  cooldown"*. (This is exactly the user's example.)
- **Over-watering** — moisture rarely approaches the dry threshold / valve fires while already moist →
  *"reduce frequency / duration"*.
- **Weather mismatch** — drydown is strongly weather-segmented but `weather_mode='off'` → *"enable
  weather-aware watering"*; or a wet week ahead → *"you can skip ~X runs this week"*; a hot week ahead
  → *"expect ~Y% more water needed."*
- **Window too narrow** — fires clip against the home automation window → suggest widening.

An **optional AI explanation layer** (Sage+) turns the deterministic finding into warm, plain-language
copy and can bundle multi-factor reasoning — but the *trigger and the proposed value are deterministic*
so suggestions are trustworthy and cheap by default. Suggestions persist in **`automation_suggestions`**
(automation_id, kind, payload `{ current, proposed, rationale, confidence }`, status
`active|applied|dismissed`, expires_at) so they're dedup'd and dismissible, mirroring `user_insights`.

### Pillar C — Reuse across the app

The Pillar-A profile becomes a shared input:
- **`area-sensor-analysis` / "what plants work in this area"** — pass drydown rate + retention class +
  watering response into the prompt and the deterministic `plant_ranges`, so recommendations reflect
  *how the soil actually behaves*, not just a 30-day average. (e.g. "fast-draining, dries ~8%/day in
  heat → favour drought-tolerant / Mediterranean planting, or plan more irrigation").
- **Weather-aware watering advice** — Dashboard / Weekly Overview: "south bed will likely need an extra
  watering midweek (hot spell + fast drydown)."
- **AI grounding** — fold a one-line "soil behaviour" fact into `user_behaviour_summary` / chat context.
- **Pattern engine** — a thin `drydownAnomalyPattern` detector (e.g. "drying 2× faster than usual")
  surfaces on the AssistantCard, reusing the existing pipeline.

## 4. Role 2 — what gardeners actually want from it (beginner vs expert)

This feature has to read completely differently to the two ends of the user base. Both are first-class.

### 🌱 The beginner ("I just want healthy plants")
- **Wants the app to quietly get it right.** Doesn't know what EC, a drydown curve, or a cooldown is —
  and shouldn't have to. The headline they want: *"Your tomato bed dried out faster than your watering
  could keep up — tap to fix it."* One sentence, one button.
- **Plain language + reassurance.** "This area holds water well" / "this one dries out fast in the
  sun." Tell them *why* simply, and what to do — never a wall of numbers.
- **Proactive safety, before damage.** A gentle heads-up when the forecast + drydown mean plants will
  likely suffer ("hot, dry week ahead — your pots will need more water than usual"). Catch the
  rate-limited-but-still-dry case *for* them.
- **One-tap apply, optional auto-pilot.** Let them accept a fix without opening the automation builder.
  Possibly an opt-in "let Rhozly keep my watering tuned automatically" for the truly hands-off.
- **Don't overwhelm.** A small number of high-confidence, high-value nudges — not a dashboard of charts.
- **Plant choice made safe.** When adding plants to an area, *steer* them: "this spot dries fast — these
  thrive here; these will struggle without frequent watering."

### 🧑‍🌾 The expert ("show me the data and let me drive")
- **Wants the numbers + the reasoning.** Drydown in %/day, per area, segmented by weather; watering
  response (mm/%, how long it lasts); the trend over weeks/seasons. The *why* behind every suggestion.
- **Control, not automation.** Suggest, never silently change. Accept / tweak the proposed value /
  reject. Snooze a suggestion type. Per-device and per-area granularity.
- **Comparison + planning.** Compare beds ("the raised bed retains 2× longer than the border"),
  compare growing media, and use retention when **planning what to plant** (drainage-lovers vs
  moisture-lovers) — exactly the cross-app reuse in Pillar C.
- **Trust + transparency.** Show the sample size / confidence; let them see the segments behind the
  average; don't nag with low-confidence guesses. Ideally exportable / inspectable.
- **Seasonality.** Recognise that drydown in July ≠ November; surface season-aware behaviour and
  feed `29-seasonality`.

**Shared by both:** weather-ahead adjustment, "this area dries fast / holds water" feeding plant
choice, and being warned *before* plants suffer rather than after. The difference is the *surface*: the
beginner gets a one-line fix; the expert gets the same fix with the data and the dials. We satisfy both
by computing one deterministic model and rendering it at two levels of detail (a "simple ⇄ details"
toggle on the suggestion + area panels).

## 5. Data model additions

- `soil_moisture_profiles` — per device (+ area rollup): `device_id`/`area_id`, `home_id`,
  `drydown_rate_pct_per_day`, `drydown_by_weather jsonb` (buckets), `watering_response jsonb`,
  `retention_class text`, `sample_segments int`, `confidence`, `based_on_reading_at`, `computed_at`.
  RLS: home members read; service-role writes. Data-API grants per CLAUDE.md.
- `automation_suggestions` — `automation_id`, `home_id`, `kind`, `payload jsonb`
  (`{ current, proposed, rationale, confidence }`), `status`, `created_at`, `expires_at`,
  `dismissed_by?`. RLS: home members read; service writes; owner/permitted updates status.
- (Optional) extend `area_ai_insights.insight` to carry the moisture-behaviour summary.

## 6. Edge functions / cron

- **`compute-soil-profiles`** (new, deterministic) — daily cron + on-demand; reads readings + valves +
  weather, writes `soil_moisture_profiles`. No Gemini.
- **`analyse-automations`** (new) — daily cron + on-demand per automation; deterministic triggers →
  `automation_suggestions`; optional `callGeminiCascade` for the explanation (Sage+), `logAiUsage`.
- Extend **`area-sensor-analysis`** to consume the profile (Pillar C).
- New `drydownAnomalyPattern` detector in `_shared/patterns/`.
- Cron registration via a migration (`cron.schedule` + `net.http_post`), mirroring
  `20260430030000_pattern_scan_cron.sql`.

## 7. UI surfaces

- **`AutomationCard`** — a suggestion chip ("💡 Suggestion: raise run limit to 3") → expands to
  rationale + **Apply** / **Dismiss** / **Details**. (Beginner sees the one-liner; "Details" reveals
  the data for experts.)
- **`AutomationsSection`** — optional roll-up "Suggestions (N)" header panel.
- **Soil readings / Area details** — a "Moisture behaviour" card (drydown rate, retention class,
  weather segmentation) with the simple ⇄ details toggle.
- **Add-plant-to-area** — surface retention/drydown when recommending plants (Pillar C).
- **AssistantCard** — the `drydownAnomalyPattern` insight.

## 8. Tier gating (uses the mechanism we just shipped)

- The **deterministic profile** (Pillar A) is cheap → available wherever Integrations are (today the
  `integrations` FEATURE_GATE is open). It can safely feed free-ish surfaces.
- The **AI explanation layer** (Pillar B's prose, and any Gemini calls) → `ai_enabled` (Sage+),
  server-enforced like all AI.
- Propose a **new modular gate** `automation_insights` in `tierFeatures.ts` (default `ALL`/open for
  now, per the current "ship open, flip later" policy) so the *suggestions surface* can be gated
  independently if you later want it premium.

## 9. Phasing

1. **Pillar A** — `soil_moisture_profiles` + `compute-soil-profiles` cron + the "Moisture behaviour"
   read-only card. Deterministic, no AI. *Delivers value alone and de-risks everything else.*
2. **Pillar B** — `automation_suggestions` + `analyse-automations` (deterministic triggers first) +
   the `AutomationCard` chip with one-tap Apply. AI explanation layer added behind `ai_enabled`.
3. **Pillar C** — wire the profile into `area-sensor-analysis` / plant recommendations + weather advice
   + the `drydownAnomalyPattern` detector + AI grounding.

## 10. Tests & docs

- Vitest: the drydown math (segment detection, regression, weather bucketing, retention classing) —
  pure functions in `src/lib/` or `_shared/` with a Deno test.
- Deno tests for the new detector + the deterministic suggestion triggers.
- E2E: the suggestion chip Apply/Dismiss flow + the moisture card.
- Docs: new `09-` cross-cutting addition (or extend `09-data-model-integrations.md`), update
  `06-integrations-automations.md`, `07-integrations-readings.md`, `04-area-details.md`,
  `10-edge-functions-catalogue.md`, `11-cron-jobs.md`, `26-pattern-engine.md`, `27-weather.md`,
  `17-tier-gating.md` (new gate), and the [feature-access-guide](../feature-access-guide.md).

## 11. Decisions (confirmed 2026-06-20)

- **Apply model → Suggest + one-tap apply.** Rhozly never changes an automation silently. Every
  suggestion shows the proposed change with an **Apply** button (and Dismiss / Details). No auto-tune
  in this build (could be a later opt-in).
- **AI vs math → Math decides, AI explains.** The drydown model, the suggestion *triggers*, and the
  *proposed values* are all deterministic. Gemini is used **only** to phrase the friendly explanation —
  it never invents the numbers. Keeps suggestions trustworthy + cheap.
- **Tier → AI prose = Sage+ now.** The deterministic moisture model (Pillar A) and the suggestions
  themselves (trigger + proposed value + a plain deterministic one-liner) stay **open to all** via a new
  `automation_insights` gate. The **AI-written explanation** requires `ai_enabled` (Sage / Evergreen),
  server-enforced. So Sprout/Botanist still get the fix and a basic reason; Sage+ gets the richer prose.

### Minor points resolved with defaults (flag if you disagree)

- **Suggestion surface** → `AutomationCard` chip first; AssistantCard / home roll-up in Pillar C.
- **Profile granularity** → per-device **plus** an area rollup (so single-sensor areas and
  multi-sensor areas both work).
- **Recompute cadence** → daily cron **plus** an on-demand recompute when an area's analysis is opened
  (cheap; deterministic).
- **Deterministic one-liner for non-AI tiers** → every suggestion ships with a plain templated
  rationale so the feature is useful without `ai_enabled`; the AI layer only upgrades the wording.
