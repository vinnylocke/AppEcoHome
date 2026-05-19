# Plan — Sun Tracker Feature: Deep Audit & Overhaul

## Goal

Take the Sun Tracker feature from its current state (rated below) up to ≥ 90/100 on usability, simplicity, aesthetics, and — crucially — **integration with the rest of the app** and **practical gardening utility**. The current build is astronomically accurate but doesn't help a gardener make a decision.

---

## Files Audited

| File | Lines | Role |
|------|-------|------|
| `src/components/SunTrajectoryAR.tsx` | 1180 | God-file — AR overlay, sky dome fallback, time controls, garden shadow panel, sunset/sunrise bar — all in one component |
| `src/hooks/useSunArc.ts` | 78 | Pure: computes sun arc trajectory for a given lat/lng/date |
| `src/hooks/useSunPosition.ts` | 11 | Pure: returns sun altitude/azimuth at a single moment |
| `src/lib/sunProjection.ts` | 107 | Pure: camera + dome projection math, shadow direction/length helpers |
| `src/lib/sunAnalysis.ts` | 171 | Pure: per-shape sun-hour classification (used by the Garden Layout sun overlay) |

---

## Persona Expectations

The same two personas from the Garden Layout audit, both arriving on the Sun Tracker page fresh:

### Sarah — new amateur gardener
- "I just bought a tomato plant. It says full sun. Which spot in my garden is actually full sun?"
- "When does the sun stop reaching my back beds in winter?"
- "When is golden hour today so I can photograph my roses?"
- "How long until sunrise tomorrow? I want to be ready for transplanting."
- "Where is morning sun vs afternoon sun in my plot? Some plants prefer one over the other."

### Marcus — pro gardener
- "Show me the seasonal arc for this specific bed — winter low, summer high."
- "Heat-map my whole garden by daily sun hours — I want to know my microclimates."
- "Track the shadow from my neighbour's tree as it grows. Will it shade my new asparagus bed in 5 years?"
- "Compare today's arc to summer/winter solstice."
- "Combine sun + frost forecast: where is the first frost risk tonight?"
- "When during the year will Bed 3 receive the most heat? When the least?"

**Almost none of what either persona wants is currently surfaced.** The feature shows where the sun is right now and where it will move today — but doesn't translate that into garden decisions. Waves 3–6 below close that gap.

---

## Rating Criteria (35 criteria, weighted)

Each criterion is scored 1–5. Weighted sum normalised to 100.

### Usability — 7 criteria, weight 1.5× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| U1 | **Mode clarity** | Does the user know which mode they're in (AR / dome / garden map)? Is the switch obvious? |
| U2 | **Permission flow** | Camera + device-orientation prompts are clear and recoverable |
| U3 | **Error recovery** | When camera/GPS fails, does the page still work and tell the user why? |
| U4 | **Feedback** | Live data (sun moving, scrubber updating) feels responsive |
| U5 | **Discoverability** | Hidden features (garden panel, golden hour, shadow arrow) are findable |
| U6 | **Touch targets** | Buttons, scrubber, date picker are ≥44 px on mobile |
| U7 | **Real-world grounding** | The AR overlay actually lines up with the real sun when phone is held up |

### Simplicity — 6 criteria, weight 1.5× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| S1 | **First-look comprehension** | New user opens page → understands what they're looking at within 5 seconds |
| S2 | **Concept count** | How many concepts (azimuth, altitude, golden hour, shadow bearing, AR vs dome…) is the user expected to grok? |
| S3 | **Default suitability** | Defaults to today + now + camera mode = right call for most users? |
| S4 | **Settings depth** | Are advanced controls hidden behind defaults? |
| S5 | **Visual decision aids** | Does the UI help the user decide *where to plant*, not just "where is the sun"? |
| S6 | **Cognitive overload** | One screen with 5+ simultaneous controls — tolerable? |

### Aesthetics — 6 criteria, weight 1.5× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| A1 | **AR overlay quality** | Sun orb, arc, shadow arrow — refined or rough? |
| A2 | **Sky-dome fallback** | When AR isn't available, the dome view looks well-designed |
| A3 | **Garden shadow map** | Top-down map of beds with cast shadows — refined? |
| A4 | **Typography & legibility** | Labels, time, badges — readable in bright sun on a phone screen |
| A5 | **Iconography** | Icons feel intentional and on-brand |
| A6 | **Animations & transitions** | Mode switches, scrubber drags, button presses |

### Mobile-specific — 4 criteria, weight 2× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| M1 | **Outdoor visibility** | UI readable on a sunny day with the phone held outside |
| M2 | **One-handed reach** | Primary actions reachable with one thumb while holding phone aloft |
| M3 | **Battery & perf** | rAF loop + camera + canvas — sustainable for a few minutes outside |
| M4 | **Sensor smoothness** | Compass / tilt readings don't jitter the overlay |

### Desktop / PC — 3 criteria, weight 1× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| P1 | **No-camera fallback** | The dome view is genuinely useful on PC where there's no camera |
| P2 | **Resizing** | Layout reflows from narrow to wide |
| P3 | **Keyboard support** | Arrow-key time scrubbing, etc |

### Integration with rest of app — 9 criteria, weight 2× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| I1 | **Plant sun-fit suggestions** | Pick a plant; see where in the garden it would thrive |
| I2 | **Garden Layout link** | Surface per-bed daily sun hours / classification right here, not just in Microclimate Report |
| I3 | **Shed integration** | "Where should I put this new plant?" from a Shed item → Sun Tracker locator |
| I4 | **Task awareness** | Surface watering, harvesting, photography tasks that depend on sun timing |
| I5 | **Photography golden-hour** | One-tap reminder for golden hour today |
| I6 | **Frost integration** | Combine sun + weather to flag frost-risk beds tonight |
| I7 | **Lux sensor cross-check** | Compare real lux readings vs theoretical sun → detect shading we didn't model |
| I8 | **Planner / Plan integration** | Planning a new bed → see sun pattern at candidate locations |
| I9 | **Calendar / year view** | See sun trajectory across seasons / day length curve / equinox + solstice markers |

### Astronomical & Garden Utility — bespoke for this feature, 5 criteria, weight 2× each

| # | Criterion | What it measures |
|---|-----------|------------------|
| G1 | **Accuracy** | Sun position math (SunCalc) — already excellent |
| G2 | **Time scrubbing** | Drag through the day and see the arc/shadows update |
| G3 | **Date scrubbing** | Pick a future/past date — see how sun changes seasonally |
| G4 | **Day-length context** | "Today is 12h 14m of daylight, 18m shorter than last week" |
| G5 | **Practical analysis** | Outputs a recommendation, not just numbers |

**Weighted total**: 7×1.5 + 6×1.5 + 6×1.5 + 4×2 + 3×1 + 9×2 + 5×2 = 10.5 + 9 + 9 + 8 + 3 + 18 + 10 = **67.5 weighted units**.
Normalised to 100: score = (raw / (67.5 × 5)) × 100 = raw / 3.375.

---

## Current State Rating

| # | Criterion | Score (1–5) | Note |
|---|-----------|------|------|
| U1 | Mode clarity | **3** | AR vs dome happens automatically based on camera. There's a small "Dome view" pill but it's not interactive — user can't force-switch to dome |
| U2 | Permission flow | **3** | Camera prompt is implicit (auto-asked). Orientation prompt is an explicit banner — but iOS 13+ users have to find it |
| U3 | Error recovery | **3** | "Camera unavailable" → falls back to dome. No retry button. No "open in browser settings" help |
| U4 | Feedback | **4** | rAF loop = smooth animation. Scrubber feels live |
| U5 | Discoverability | **2** | Garden Shadow Map is collapsed by default + buried under footer. Golden hour appears only as a badge — easy to miss |
| U6 | Touch targets | **3** | Back button is 36 px (below 44 mark). Date input on Safari is tight. Scrubber is OK |
| U7 | Real-world grounding | **3** | Depends entirely on compass calibration. Without device-orientation grant, AR is dead weight |
| S1 | First-look comprehension | **2** | Brand-new user sees a camera view with a hovering orb and an arc line. Without prior context, why is this useful? |
| S2 | Concept count | **2** | Altitude, azimuth, golden hour, shadow bearing, sky dome, AR mode, time scrubber, garden shadow map — a lot |
| S3 | Defaults | **3** | Today + now is right. Auto-switching to dome on PC is right |
| S4 | Settings depth | **3** | No settings at all. Could be a feature, could be lacking control |
| S5 | Visual decision aids | **1** | The feature does not help the user place plants, choose a bed, or plan a task. It just shows data |
| S6 | Cognitive overload | **3** | AR view + info badges + time scrubber + date picker + collapsible garden panel + footer = a lot in one screen |
| A1 | AR overlay quality | **4** | Sun orb has glow + core, arc line is colour-coded by golden hour, shadow arrow is visible |
| A2 | Sky-dome fallback | **3** | Solid blue gradient + arc + event dots. Functional but plain |
| A3 | Garden shadow map | **3** | Renders the garden in top-down with shadows. Works but lacks interactivity (can't tap a bed) |
| A4 | Typography | **3** | Small `text-[10px]` / `text-[11px]` in many places. On a bright phone outside, hard to read |
| A5 | Iconography | **3** | Standard lucide icons. Nothing custom or branded |
| A6 | Animations | **2** | No transitions on mode switch, scrubber, or garden panel open/close |
| M1 | Outdoor visibility | **2** | Text is mostly white-on-dark-overlay. The video feed itself can be very bright — overlay text often unreadable mid-day |
| M2 | One-handed reach | **3** | Most UI is at bottom (reachable). Date picker is mid-screen — awkward |
| M3 | Battery & perf | **3** | rAF + camera + canvas redraws continuously. Burns battery during longer use |
| M4 | Sensor smoothness | **3** | Uses `useDeviceOrientation` directly. Some users report jitter; not actively smoothed |
| P1 | No-camera fallback | **3** | Dome view exists and is usable. Not bad |
| P2 | Resizing | **3** | ResizeObserver-style canvas resize works |
| P3 | Keyboard support | **1** | No keyboard shortcuts |
| I1 | Plant sun-fit suggestions | **1** | Not connected at all |
| I2 | Garden Layout link | **2** | Garden Shadow Map exists but only shows current shadows — no per-bed sun-hour stats. Linked-area Microclimate Report (Wave 11B) is a separate feature elsewhere |
| I3 | Shed integration | **1** | No way to land on Sun Tracker from a plant in The Shed |
| I4 | Task awareness | **1** | No task surfacing |
| I5 | Photography golden-hour | **2** | Golden Hour badge exists when sun ≤ 6° altitude — useful but limited; no notification, no calendar entry |
| I6 | Frost integration | **1** | Not connected to weather forecast |
| I7 | Lux sensor cross-check | **1** | Not surfaced |
| I8 | Planner integration | **1** | Not surfaced |
| I9 | Calendar / year view | **1** | No seasonal/yearly view |
| G1 | Accuracy | **5** | SunCalc is excellent |
| G2 | Time scrubbing | **4** | Smooth, with event markers |
| G3 | Date scrubbing | **4** | Date input works, arc + dome update |
| G4 | Day-length context | **2** | Sunrise/sunset times are shown but no "x hours of daylight today" or seasonal comparison |
| G5 | Practical analysis | **1** | No recommendations or summarised insights |

### Weighted Total

Usability: (3+3+3+4+2+3+3) × 1.5 = 21 × 1.5 = **31.5**
Simplicity: (2+2+3+3+1+3) × 1.5 = 14 × 1.5 = **21.0**
Aesthetics: (4+3+3+3+3+2) × 1.5 = 18 × 1.5 = **27.0**
Mobile: (2+3+3+3) × 2 = 11 × 2 = **22.0**
PC: (3+3+1) × 1 = 7 × 1 = **7.0**
Integration: (1+2+1+1+2+1+1+1+1) × 2 = 11 × 2 = **22.0**
Garden Utility: (5+4+4+2+1) × 2 = 16 × 2 = **32.0**

**Raw total: 162.5 / 337.5 → Normalised: 48/100**

The astronomy is excellent, the feature works, but the score is low because the data isn't being put to work for the gardener. This is a classic "engineering before product" feature — the math is right, the UX hasn't caught up.

---

## Target

**≥ 90/100** weighted. The single biggest lever is Integration (22 → ~80 — almost zero today). Day-utility (32 → ~45) and Usability (31.5 → ~48) are the next steps. Aesthetics + Mobile fixes round it out.

---

## Overhaul Plan — 6 Waves

Same wave pattern as the Garden Layout overhaul. Each wave independently deployable; re-rate after each before starting the next.

---

### Wave 1 — Information architecture & onboarding (Usability + Simplicity)
*Reset the first impression. Tell users what they're looking at.*

#### 1A. Header rewrite
Today's header says "Sun Tracker" + lat/lng. Change to a two-line header:
- **Title**: "Sun Tracker"
- **Subtitle**: today's day-length + a one-liner ("12 h 14 m of light today · 18 min shorter than last week")

#### 1B. Mode tabs (replace implicit switching)
Add a 3-tab strip in the header: **Live AR** · **Sky View** · **Garden Map**. Currently the user can't choose — the page auto-decides based on camera availability. This explicit tabbed mode:
- Lets PC users skip the AR section entirely
- Surfaces the Garden Map as a top-level mode instead of a buried collapsible panel
- Makes the feature obviously useful for all three use cases

#### 1C. First-visit coach overlay
A dismissable card on first open per session: "Hold your phone up to see where the sun is right now, drag the time slider to scrub forward, or switch to Garden Map to see which beds are in sun." Stored in localStorage.

#### 1D. Permission ergonomics
- "Enable compass" prompt becomes a one-tap call-to-action card with a "Why?" tooltip.
- "Camera unavailable" gets a "Retry" button + plain-English suggestion.

#### 1E. Touch-target sweep
Back button, date input, scrubber thumb — all bumped to 44 px minimum on mobile.

**Wave 1 targets**: U1 → 4, U2 → 4, U5 → 4, U6 → 4, S1 → 4, S2 → 4, S6 → 4.

---

### Wave 2 — Garden Map mode (Integration + Utility)
*The biggest miss today. This is where decisions get made.*

#### 2A. Garden Map becomes a first-class mode
Top-down view of your garden layout (re-using `garden_layouts` + `garden_shapes`) with:
- Live shadow cast for the currently-scrubbed time
- Per-shape **daily sun-hour count** label (e.g. "5.2 h")
- Tap a bed → drawer slides up with: name, plants in the bed, daily sun hours, classification (Full Sun / Partial / Shade), sun fit for current plants
- Heatmap toggle: colour each shape from red (shade) → green (full sun) by daily total sun hours

#### 2B. "Find a spot for…" picker
Top-right of Garden Map mode: a plant picker. Choose a plant from The Shed (or type a name):
- The map highlights all beds whose sun classification matches the plant's `sunlight` preference
- Beds get a ✓ / ⚠ / ✗ overlay matching the existing sun-fit logic from `src/lib/garden/sunFit.ts`
- A summary card at the bottom says e.g. "2 beds are full-sun ideal for tomatoes"

#### 2C. Tree-shadow modelling improvement
Today, shadows are cast from any extruded shape. Improve specifically for `tree-canopy` preset:
- Use the canopy radius (sphere) for shadow shape instead of square footprint
- Account for canopy height (extrude_m) so shadows are proportional

#### 2D. Time-of-day shadow slider on Garden Map
The current time scrubber is in AR mode. In Garden Map mode it should be just as prominent — drag and see the entire garden's shadow pattern sweep through the day.

**Wave 2 targets**: I1 → 5, I2 → 5, S5 → 5, A3 → 5, G5 → 4.

---

### Wave 3 — Year View & seasonal context (Utility)

#### 3A. New "Year View" mode tab
Add a 4th tab. Shows:
- A horizontal year ribbon (Jan → Dec) with day-length curve plotted (`useSunArc.dayLengthHours` evaluated at one date per week)
- Today marker + solstice / equinox markers
- Tap any point on the curve to set that date as `selectedDate` (the AR + Garden Map sync to it)
- Side info card: "Summer solstice in 47 days · longest day 16 h 32 m"

#### 3B. Seasonal compare overlay
Within Year View: a "Compare seasons" toggle that draws today's arc + summer solstice arc + winter solstice arc on the same sky dome — three arcs in different colours. Lets the user see at a glance how the sun moves through the year.

#### 3C. Day-length insight card
On all modes, a small card: "Today: 12 h 14 m daylight (+2 m on yesterday)". Pulled from `useSunArc.dayLengthHours`.

**Wave 3 targets**: G3 → 5, G4 → 5, I9 → 5, U5 → 5.

---

### Wave 4 — Plant + task integration (Integration)

#### 4A. "Open in Sun Tracker" from The Shed
Each plant card in The Shed gets a small sun icon button. Tap → opens Sun Tracker in Garden Map mode with that plant pre-loaded into the "Find a spot for…" picker. Same handoff pattern as the Planner → Garden Layout button we built earlier.

#### 4B. Surface relevant tasks
At the top of Sun Tracker, a small action strip when relevant:
- "🌞 3 watering tasks due in full-sun beds today — show me" → jumps to Garden Map filtered to those beds
- "📸 Golden hour at 18:42 — perfect for photos" → adds an alarm/notification

#### 4C. Plant Doctor sun context
When Plant Doctor diagnoses "leggy" or "yellowing" plants, surface a "Check sun" CTA → opens Sun Tracker centred on the bed that plant lives in.

#### 4D. Planner integration
On the Planner page, each plan card gets a "🌞 Sun" button that opens Sun Tracker filtered to that plan's shapes. (Mirrors the existing "View on Layout" link.)

**Wave 4 targets**: I3 → 5, I4 → 4, I8 → 4.

---

### Wave 5 — Weather + sensor cross-references (Integration)

#### 5A. Frost-risk overlay on Garden Map
Combine the weather forecast (already loaded) with shadow modelling:
- Beds in N-facing / heavy-shade get an additional "tonight: frost risk" chip when forecast min ≤ 3 °C
- Pull from `microclimate.ts` frost-risk classification + per-shape wind exposure

#### 5B. Lux reading cross-check
If a bed has recent lux readings (already fetched in `useShapeLiveState`), show "Measured: 4 200 lx · Expected: 6 800 lx" — telling the user the bed is shadier than the model expects (e.g. a fence we didn't put in the layout, or a new tree).

#### 5C. Cloud-adjusted "effective sun"
The forecast snapshot has hourly cloud cover. Multiply today's sun-hour-per-bed by `(1 − cloud_cover / 100)` to give an "Effective sun today: 3.4 h (vs 5.2 h theoretical)". Honest reflection of real conditions.

**Wave 5 targets**: I6 → 5, I7 → 4, G5 → 5.

---

### Wave 6 — Polish (Aesthetics + Mobile)

#### 6A. Outdoor visibility
- Bump base font from `text-[10px]` to `text-[12px]` for all sun-tracker badges
- Add high-contrast mode auto-detected from screen brightness (or a manual toggle): white text on solid dark backgrounds, no semi-transparent overlays
- Larger sun orb and arc when sunny — easier to see in glare

#### 6B. Sensor smoothing
Wrap `useDeviceOrientation` output in a low-pass filter (running average over last ~5 samples). Smoother arrow movement, no more jitter when phone is held mostly still.

#### 6C. Battery saver
- When `selectedDate` hasn't changed for > 30 s and orientation hasn't moved > 1°, throttle rAF from 60fps to 5fps
- When the page is `document.hidden`, suspend the loop entirely

#### 6D. Animations
- Mode tab change → 200 ms cross-fade
- Garden Map shadow sweep when time scrubber drags → animate the cast shadows interpolating between samples (currently they snap)
- Sun orb glow pulses subtly (1 cycle per 4 s)

#### 6E. Aesthetic palette
- Dome view's sky gradient: replace flat sky-blue with a time-of-day gradient (sunrise = warm pink/orange, noon = vivid blue, sunset = warm orange/red, night = deep navy with stars)
- Sun arc gradient: cool morning blue → warm midday yellow → orange evening, matching the sun's actual colour temperature

#### 6F. Iconography
Custom sun-arc icon for the route tab (currently uses a generic doctor icon — see `App.tsx` line 718).

**Wave 6 targets**: A1 → 5, A2 → 5, A4 → 5, A6 → 5, M1 → 5, M3 → 5, M4 → 4.

---

## Re-rating Target After All Waves

| Criterion | Current | Target |
|-----------|--------:|-------:|
| U1 Mode clarity | 3 | 4 |
| U2 Permission flow | 3 | 4 |
| U3 Error recovery | 3 | 4 |
| U4 Feedback | 4 | 5 |
| U5 Discoverability | 2 | 5 |
| U6 Touch targets | 3 | 4 |
| U7 Real-world grounding | 3 | 4 |
| S1 First-look comprehension | 2 | 4 |
| S2 Concept count | 2 | 4 |
| S3 Defaults | 3 | 4 |
| S4 Settings depth | 3 | 4 |
| S5 Visual decision aids | 1 | 5 |
| S6 Cognitive overload | 3 | 4 |
| A1 AR overlay | 4 | 5 |
| A2 Dome fallback | 3 | 5 |
| A3 Garden shadow map | 3 | 5 |
| A4 Typography | 3 | 5 |
| A5 Iconography | 3 | 4 |
| A6 Animations | 2 | 5 |
| M1 Outdoor visibility | 2 | 5 |
| M2 One-handed reach | 3 | 4 |
| M3 Battery & perf | 3 | 5 |
| M4 Sensor smoothness | 3 | 4 |
| P1 No-camera fallback | 3 | 5 |
| P2 Resizing | 3 | 4 |
| P3 Keyboard | 1 | 3 |
| I1 Plant sun-fit | 1 | 5 |
| I2 Garden Layout link | 2 | 5 |
| I3 Shed integration | 1 | 5 |
| I4 Task awareness | 1 | 4 |
| I5 Golden hour | 2 | 4 |
| I6 Frost integration | 1 | 5 |
| I7 Lux cross-check | 1 | 4 |
| I8 Planner integration | 1 | 4 |
| I9 Year view | 1 | 5 |
| G1 Accuracy | 5 | 5 |
| G2 Time scrubbing | 4 | 5 |
| G3 Date scrubbing | 4 | 5 |
| G4 Day-length context | 2 | 5 |
| G5 Practical analysis | 1 | 5 |

### Projected totals

- Usability: (4+4+4+5+5+4+4) × 1.5 = 30 × 1.5 = **45.0**
- Simplicity: (4+4+4+4+5+4) × 1.5 = 25 × 1.5 = **37.5**
- Aesthetics: (5+5+5+5+4+5) × 1.5 = 29 × 1.5 = **43.5**
- Mobile: (5+4+5+4) × 2 = 18 × 2 = **36.0**
- PC: (5+4+3) × 1 = 12 × 1 = **12.0**
- Integration: (5+5+5+4+4+5+4+4+5) × 2 = 41 × 2 = **82.0**
- Garden utility: (5+5+5+5+5) × 2 = 25 × 2 = **50.0**

**Raw total: 306 / 337.5 → Normalised: 91/100** ✓

---

## New Files

| File | Wave | Purpose |
|------|------|---------|
| `src/components/sun/SunTrackerHeader.tsx` | 1 | Header + day-length subtitle + mode tabs |
| `src/components/sun/SunGardenMap.tsx` | 2 | Top-down garden mode (extracted from existing panel + enriched) |
| `src/components/sun/SunYearView.tsx` | 3 | Year ribbon + seasonal compare |
| `src/components/sun/SunDayInsight.tsx` | 3 | Day-length / season delta card |
| `src/components/sun/PlantSpotPicker.tsx` | 2 | "Find a spot for…" plant picker |
| `src/lib/sun/effectiveSun.ts` | 5 | Cloud-adjusted effective sun calculator |
| `src/lib/sun/orientationFilter.ts` | 6 | Low-pass filter for compass / tilt jitter |

## Critical Files Modified

| File | Waves |
|------|-------|
| `src/components/SunTrajectoryAR.tsx` | 1, 2, 3, 4, 5, 6 — gets broken up significantly |
| `src/components/TheShed.tsx` | 4 — "Open in Sun Tracker" link |
| `src/components/PlannerDashboard.tsx` | 4 — "🌞 Sun" button per plan card |
| `src/components/PlantDoctor.tsx` | 4 — "Check sun" CTA on diagnosis |
| `src/hooks/useDeviceOrientation.ts` | 6 — wrap with smoothing filter |
| `src/App.tsx` | 1, 6 — route tweaks + custom icon |

---

## No DB migrations needed
All changes are client-side. The data sources (`weather_snapshots`, `garden_layouts`, `garden_shapes`, `inventory_items`, `area_lux_readings`) are already there.

---

## Testing
- New libs (`effectiveSun.ts`, `orientationFilter.ts`) get pure unit tests in `tests/unit/lib/`
- E2E spec at `tests/e2e/specs/sun-tracker.spec.ts` extended to cover the three new modes and the plant picker
- Update `docs/e2e-test-plan.md` Section 17 (or wherever Sun Tracker lives) per wave

---

## Process

1. Wave 1 → deploy → re-rate → confirm targets
2. Wave 2 → deploy → re-rate
3. Continue through Waves 3–6
4. `npx tsc --noEmit` clean + 300/300 unit tests passing after every wave
5. Re-rate using the same criteria sheet at the end

---

## Honest caveats

- The atomic AR-mode rAF loop is hand-tuned and works well today. Waves 2–3 don't touch it. Wave 6 adds throttling but doesn't tear up the rendering — that's deliberate.
- "Find a spot for…" (Wave 2B) is the single highest-impact feature in the plan. If you only do one wave, do that one + 2A.
- Wave 5 (frost, lux, cloud-adjusted) is genuinely valuable but takes more engineering than Wave 2/3. If schedule is tight, ship 1–3 first and let real usage tell us whether 4/5 are worth it.
