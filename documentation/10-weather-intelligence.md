# Weather & Garden Intelligence

Rhozly fetches live weather data and uses it to give you real-time gardening advice. Weather information is visible on the **Dashboard** and has its own dedicated **Weather** view.

---

## Where Weather Appears

| Location | What's shown |
|----------|-------------|
| **Dashboard — Locations view** | Weather widget (current conditions) + alert banner |
| **Dashboard — Weather view** | Full 7-day forecast + Garden Intelligence rules |
| **Dashboard — Calendar view** | Affects task dot colouring and sparkle indicators |
| **Tasks** | Auto-completed watering tasks appear with a "Auto-watered" chip |

---

## Weather Widget

The weather widget sits at the top of the Dashboard Locations view.

> 📸 Screenshot: The weather widget with a gradient background, temperature prominently displayed, and icons for humidity, wind, and description

It shows:
- **Temperature** (°C) — large, prominent
- **Conditions** — text description (e.g. "Heavy Rain", "Partly Cloudy", "Sunny")
- **Humidity** — percentage
- **Wind speed** — km/h
- **Background gradient** — changes colour to reflect the current conditions (blue for rain, orange for clear, grey for overcast)

Tap **"View Full Forecast"** to open the Weather view.

---

## Weather Alerts

If a weather alert is active for any of your outdoor locations (e.g. frost risk, storm, high wind), a **coloured alert banner** appears below the weather widget.

> 📸 Screenshot: A frost alert banner in light blue, showing "Frost Risk — Tonight from 11pm to 6am — Protect sensitive plants"

The banner shows:
- **Alert type** (e.g. Frost Risk, Storm Warning, Heat Advisory)
- **Affected location**
- **Time window** (start and end time)
- **Recommended action**

Alerts are fetched alongside the weather forecast and update automatically. **Alerts expire after 24 hours** (Wave 21.0004) — once the window has fully passed, the banner clears so you're never staring at yesterday's frost warning.

---

## 7-Day Forecast

The full forecast is available in the **Weather** view (Dashboard → Weather tab).

> 📸 Screenshot: The 7-day forecast grid — each day shows an icon, high/low temperatures, condition text, and rain probability

Each day card shows:
- **Day name and date**
- **Weather icon** — visually represents the conditions
- **High / Low temperature** range
- **Condition text** — brief description
- **Rain probability** — percentage chance of precipitation
- **Rain amount** — estimated mm if rain is forecast

---

## Garden Intelligence

The **Garden Intelligence** panel appears below the 7-day forecast. It analyses forecast data against a set of gardening rules and shows you actionable advice.

> 📸 Screenshot: Garden Intelligence panel with three rule cards — one green (good condition), one amber (caution), one red (action required)

### How Rules Work

Rhozly evaluates a set of built-in rules against the current and forecast weather. Each rule has a threshold that triggers it — for example:

| Rule | Threshold |
|------|-----------|
| Skip watering | >5mm of rain forecast in the next 24 hours |
| Frost protection needed | Temperature dropping below 2°C overnight |
| Good pruning conditions | Dry day, wind below 20 km/h, 5°C–25°C |
| Risk of powdery mildew | High humidity (>80%) + warm temperatures |
| Heat stress warning | Temperature above 32°C |
| Wind damage risk | Wind speed above 50 km/h |

### Rule Cards

Each triggered rule appears as a card:

> 📸 Screenshot: A single Garden Intelligence rule card showing the rule title, icon, explanation, and the threshold detail expanded

| Element | Description |
|---------|-------------|
| **Icon** | Visual category indicator (rain drop, thermometer, sun, etc.) |
| **Title** | Short action statement (e.g. "Skip watering today") |
| **Explanation** | Why this rule triggered (e.g. "8mm of rain forecast for tomorrow morning") |
| **Threshold detail** | The exact data value that triggered the rule |
| **Colour** | Green = good news, Amber = caution, Red = action required |

### Rain Rule Breakdown

For watering-related rules, Rhozly shows a **per-task breakdown** — which of your scheduled watering tasks can be skipped today based on rain data:

> 📸 Screenshot: Rain rule expanded showing a list of watering blueprints with green ticks (can skip) or grey (threshold not met)

Each of your watering blueprints is listed alongside whether the forecasted rain is sufficient to replace that watering session.

---

## Weekly Overview — Weather at a Glance

The full week's weather story also lives in the [Weekly Overview](./17-weekly-overview.md) page (under Tools). It rolls every alert, rain event, frost risk, and heatwave into a single Sunday-morning summary, alongside the week's tasks, sowing windows, and harvest opportunities. If you only check Rhozly once a week, that's the page to bookmark.

---

## Golden Hour Notification

If you have notifications enabled, Rhozly sends a **Golden Hour** push when the conditions are about to be perfect for gardening (dry, mild, low wind). Use it as a gentle nudge to get outside before the window closes. Toggle it on or off under **Profile → Notifications**.

---

## Auto-Completed Tasks (Rain Automation)

When the Garden Intelligence determines that rain has provided enough water, it can **automatically complete** relevant watering tasks on your behalf.

Auto-completed tasks appear in your task list with a **"Auto-watered"** chip:

> 📸 Screenshot: A task card with the blue "Auto-watered" chip, showing it was completed by the weather engine

This means you don't need to manually mark watering tasks as done on rainy days — Rhozly handles it.

---

## How Weather Data is Fetched

Rhozly uses **Open-Meteo** (a free, accurate weather API) to fetch forecast data. The fetch is triggered:
- When you open the Dashboard
- When you pull to refresh
- On a background schedule (approximately every 2 hours)

Weather data is cached in your account so it loads instantly even when offline, using the most recent available snapshot.

The weather is fetched for the coordinates of your **outdoor locations**. Make sure your locations are marked as **Outside** in the [Location Manager](./09-locations-areas.md) for weather data to apply to them.
