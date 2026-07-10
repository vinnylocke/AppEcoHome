# The Garden Brain — where Rhozly goes from "lots of tools" to "smarter than any gardening app"

**Date:** 2026-07-10 · **Ask:** through the two personas, assess what the app can do today and propose an AI-powered game changer that puts Rhozly above every current gardening app. **Strategy document — nothing here is implemented; awaiting a direction decision.**

---

## 1. What Rhozly can do today (verified inventory)

The intelligence layer is already unusually deep for a consumer app — but it's **fragmented into ~10 separate surfaces**:

| Capability | What it does | Persona reach |
|---|---|---|
| Pattern engine (6 detectors, hourly) | postponement habits, neglected plants, fast-draining beds without automation, harvest-ready windows → AI-evaluated → **Insights page** | Mostly Experienced (you must visit the page) |
| `buildUserContext` | identity + climate + areas/lux + 40 planted instances + 7-day tasks + behaviour stats + weather — grounds every AI call | Infrastructure |
| Agent chat (~50 tools) | read everything; create/complete/snooze tasks, blueprints, automations, journals — tiered confirm-risk model | Both, but pull-based (user must ask) |
| Sensors + `compute-soil-profiles` | full time-series soil moisture/temp/EC; **deterministic per-device drydown rate + retention class, weather-segmented** | Experienced only — and today it feeds just ONE pattern |
| `plant_sensor_ranges` | per-plant ideal soil moisture/EC/temp ranges (library + AI backfilled daily) | Barely surfaced |
| Weather rules → alerts, rain auto-complete, **weather task creation (36.0001)** | acting weather layer | Both |
| Yield prediction (on-demand) | history + weather → Gemini estimate + confidence | Experienced, on-demand only |
| Journals + photos + `growth_state` | photo record; growth stage auto-advanced by **season rules** (not by looking at the plant) | Both — but **photos are dead data** (never analysed unless the user runs Plant Doctor) |
| Weekly overview / optimise digest / monthly report | rollups + suggestions | Both, weekly cadence |
| Plant Doctor / Lens | on-demand ID + diagnosis (Pro-model cascade + Pl@ntNet) | Both, reactive |

**Persona grading of today:**
- **Beginner** — excellent *reactive* support (identify, diagnose, care guides, seasonal picks) and now weather→tasks. But the intelligence is scattered: insights live on a page they never visit, the answer to *"is my garden actually okay, and what's the ONE thing I should do?"* doesn't exist in one place, and nothing ever tells them *"your tomato is on track"* (reassurance is as valuable as alarms).
- **Experienced** — strong automation/sensor stack, but the expensive parts are **under-exploited**: soil profiles feed one pattern; sensor ranges are barely compared against reality; schedules stay whatever they set them to even when the sensors prove them wrong; and no prediction is ever scored, so trust in AI suggestions plateaus.

## 2. Where every competitor stops

| App | Core | Ceiling |
|---|---|---|
| Planta | static species schedules + light meter | never learns *your* garden; no sensors, no outcomes |
| PictureThis / Blossom / PlantNet | on-demand ID + diagnosis | reactive single-photo; no memory, no longitudinal view |
| Gardenize | journaling | records, doesn't reason |
| Gardena / Netatmo / Ecowitt apps | irrigation hardware control | no horticultural reasoning; closed to their hardware |
| Seedtime | sowing calendar planning | calendar maths, not observation |
| RHS / content apps | knowledge | generic, not your garden |

**The gap nobody fills:** every app either *knows about plants in general* or *controls hardware* — **no consumer app observes one specific garden across sensors + weather + photos + actions + outcomes, learns it, and closes the loop.** Rhozly is the only app that already owns *all* of those input streams. The moat isn't a feature — it's the data spine we already have.

## 3. The game changer: **the Garden Brain** — "Rhozly learns YOUR garden"

One thesis, three pillars, each individually shippable:

### Pillar 1 — Adaptive care: schedules that learn from the soil (the differentiator)
Nightly, per home, a **deterministic reconciler** joins what we already compute but never connect:
`soil_moisture_profiles` (measured drydown, weather-segmented) × `plant_sensor_ranges` (ideal bands) × actual watering blueprints/automations × weather × completion history →

- *"Raised Bed A dries 2.1× faster than your every-4-days schedule assumes — it hit 22% moisture before 3 of your last 5 waterings. **Change to every 2–3 days?**"* → one-tap applies the blueprint change (existing `update_blueprint` machinery).
- *"Greenhouse soil never dropped below 55% between waterings — you can stretch to every 5 days and save ~40 min/month."*
- Pre-symptomatic stress flags: moisture below the plant's range floor + heat forecast → escalate before wilting (extends the weather-task pipe we just shipped).
- **Every adjustment is verified**: the reconciler re-checks the following weeks and reports back ("since the change, moisture stayed in range 12/14 days"). Accuracy is logged — the claim becomes *provable*.

Deterministic core (cheap, testable like `computeDayStrip`), Gemini only for the one-sentence explanation. No-sensor homes still get a lighter version from completion/postponement/weather patterns; sensor owners get the full loop — which finally makes buying a £30 soil sensor a no-brainer, feeding the moat.

### Pillar 2 — The photo timeline becomes a monitoring system
Journal + Garden Walk photos are analysed **passively in nightly batches** (flash model, 50% batch discount already plumbed via `logAiUsage`; capped/day): growth-stage detection (correcting the season-guessed `growth_state` with *observed* state), growth-rate curves per plant, and early anomaly flags ("leaf yellowing visible in Tuesday's photo — 12 days before you'd typically notice"). Competitors do one-photo on-demand diagnosis; **nobody watches your plants over time.** Beginner gets guardianship ("we spotted something"); Experienced gets phenology data no app has ever given them.

### Pillar 3 — One voice: the **Head Gardener briefing**
All of it — patterns, sensor deltas, photo flags, weather, windows, overdue habits — synthesised into a single ranked morning brief (dashboard card + notification + the same persona in chat), each item with a *reason* and a *one-tap action* through the existing agent-tool confirm-risk model:
- Beginner: *"3 things today: water the greenhouse (32° later), your basil is ready to pot on, and your tomato looks on track 👍"* — including **good news**, which no app ever sends.
- Experienced: *"South Border drydown accelerating (profile confidence 0.8); suggest +1 automation run Thu; yield forecast for Bed A revised to 2.3kg after last week's heat."*
This is where the fragmentation problem dies: the insights page, digest, and patterns become inputs to one authoritative voice.

## 4. Why this wins
1. **Unfair advantage**: the required data spine (sensors + weather + tasks + photos + outcomes + acting tools) already exists — competitors would need years to assemble it.
2. **Provable, not vibes**: predictions and adjustments are scored against reality (`ai_feedback` + accuracy log). "Rhozly's advice measurably works in *your* garden" is a claim no app can copy quickly.
3. **Both personas, one system**: same brain, two voices — guardianship for the Beginner, instrumentation for the Experienced.
4. **Hardware flywheel**: adaptive care makes sensors obviously worth buying; sensors make the brain smarter.
5. **Cost-sane**: deterministic cores + flash/batch AI for prose; Pro only where vision/judgement earns it. All metered by the existing `ai_usage_log`.

## 5. Suggested sequencing (each phase = its own plan doc + approval)
- **Phase 1 — Adaptive care reconciler** (Pillar 1): biggest differentiation, all plumbing exists (`compute-soil-profiles`, `plant_sensor_ranges`, blueprints, update tools). Ship with verification logging from day one.
- **Phase 2 — Head Gardener briefing** (Pillar 3): the synthesis card/notification; folds patterns + Phase-1 outputs into one voice. Benefits every user including sensor-less Sprouts (tier-graded depth).
- **Phase 3 — Photo timeline** (Pillar 2): nightly batch vision; growth curves + anomaly flags feeding the briefing.
- Tier shape (to debate): briefing-lite for all; adaptive care + photo monitoring as the Sage/Evergreen killer features.

## 6. Alternatives considered (and why not first)
- **Community/local benchmarking** ("gardens like yours sowed carrots 2 weeks ago") — real moat but needs user scale we don't have yet; revisit later.
- **Voice-first garden walk companion** — lovely UX, thin differentiation; becomes a natural interface to the brain later.
- **AR plant health overlay** — demo-magic, low daily utility, high cost.

---

**Decision needed:** greenlight the Garden Brain direction and pick the starting pillar (my recommendation: **Phase 1, adaptive care**), or redirect. Next step after a green light: a full implementation plan doc for the chosen phase (architecture, migrations, cost model, tests, tier gating) for approval before any code.
