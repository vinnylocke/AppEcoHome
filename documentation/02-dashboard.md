# Dashboard

The Dashboard is the home screen of Rhozly — your "what should I be doing right now?" answer. It opens with a personalised greeting, then layers on today's priorities, the week ahead, seasonal suggestions, and your task list. If you only open one screen a day, this is it.

![The Dashboard's default view — weather alert banner, the "Good morning" Daily Brief, and the cards beneath it](/doc-images/02-dashboard-01-overview.webp)

---

## The Four Views

Below the weather alert banner is a strip of four views. They're all part of the Dashboard — switching between them never leaves this screen.

| View | What it shows |
|------|--------------|
| **Dashboard** | The default. Your Daily Brief, today's priorities, the week ahead, seasonal picks, and today's task list |
| **Locations** | Your garden locations as cards, with plant and task counts |
| **Calendar** | A monthly calendar with task dots plus an agenda for any selected date |
| **Weather** | The 7-day forecast, hourly detail, and the Garden Intelligence rule engine |

Tap any view to switch. Your last selected view is remembered for next time.

A small **"Synced X ago"** label in the top-right tells you how fresh the data is. On mobile, pull down anywhere on the page to force a refresh.

---

## Dashboard View

This is the default view when you open Rhozly.

### Daily Brief

The hero card at the top greets you by name and sums up your day at a glance.

![The "Good morning" Daily Brief card with the date, weather icon, one-line summary, and stat chips](/doc-images/02-dashboard-02-daily-brief.webp)

- A **time-of-day greeting** ("Good morning / afternoon / evening")
- Today's **date**
- A **weather icon** reflecting current conditions
- A one-line summary like *"Today: 10 overdue tasks · light rain · 1 weather alert"*
- **Stat chips** you can tap to jump straight to the right place:
  - **Overdue** / **Now** (temperature) chips
  - **Microclimate** — opens your garden layouts
  - **Got a plant question?** — opens the Garden AI chat with today's context already loaded
  - **Plan day** — jumps to today on the Calendar

If a **Weather Alert** is active (e.g. frost risk, high winds, heavy rain), a coloured banner appears above the view switcher showing the alert type, time, and message.

![The weather alert banner at the top of the Dashboard](/doc-images/02-dashboard-03-weather-alert.webp)

### Today Focus, Week Ahead, and Seasonal Picks

Below the Daily Brief, the Dashboard shows three personalised cards:

![The Today Focus and Week Ahead cards on the Dashboard view](/doc-images/02-dashboard-04-focus-week.webp)

**Today Focus** — Rhozly's answer to *"what should I do today?"*. It highlights your priorities for the day, weighted against the weather, your habit-quiz answers, and what's overdue. When there's nothing urgent it simply reassures you: *"All caught up. Nothing urgent today."*

**Week Ahead** — a card previewing the next seven days. Tap **"Plan your Sunday"** to open the full **Weekly Overview** page (see [Weekly Overview](./17-weekly-overview.md)).

**Seasonal Picks ("Sow & grow this week")** — AI-curated suggestions for what to grow right now based on your hemisphere, climate, and quiz answers. Especially helpful when your Shed is still empty. Sage+ users get richer suggestions; the free tier gets the basics.

You'll also find a **Garden Walk** card (a guided five-minute tour of your plants), a **This Week at a Glance** strip with a per-day task breakdown, and a collapsible **Garden Snapshot**.

> First-time users see extra cards here — a **Getting Started checklist**, a **notification opt-in** prompt, and a **Home Profile Quiz** reminder. Each disappears once completed or dismissed.

### Today's Tasks

The lower part of the Dashboard view is your task list for today, drawn from across your whole home.

![The Today's Tasks panel with its Pending / Completed tabs, scope filters, and task cards](/doc-images/02-dashboard-05-todays-tasks.webp)

- **Pending / Completed** tabs with counts
- **Bulk Edit** for acting on several tasks at once
- **Scope filters**: All, Home, Mine, Assigned to me
- Full task interaction — mark complete, postpone, delete, or tap a card to open its detail modal

See [Tasks](./03-tasks.md) for how every task action works.

---

## Locations View

The Locations view shows each of your garden locations as a card.

![The Locations view showing the garden location cards](/doc-images/02-dashboard-06-locations.webp)

### Location Cards

![A single location card showing the name, type, and area / planted / unplanted / task counts](/doc-images/02-dashboard-07-location-card.webp)

| Element | Description |
|---------|-------------|
| **Location name** | The name you gave the location (e.g. "Outside Garden", "Indoor Space") |
| **Type** | Whether it's outdoors or indoors |
| **Areas** | How many areas this location contains |
| **Planted / Unplanted** | Plant counts for the location |
| **Tasks** | Number of tasks due today across this location |

Tap a location card to open the **Location Detail Page**, which breaks down the areas within that location, the plants in each area, and that location's tasks. A **Refresh** control re-syncs the cards on demand.

---

## Calendar View

The Calendar view — labelled **Schedule** — combines a monthly calendar on the left with a daily agenda on the right.

![Calendar view — the month grid on the left and the agenda for a selected date on the right](/doc-images/02-dashboard-08-calendar.webp)

### Monthly Calendar

- Toggle between **Month** and **Week** layouts.
- Navigate with the **← / →** arrows, or tap **Today** to jump back.
- Each day shows coloured **task dots**, one colour per task type:
  - **Blue** — Watering
  - **Green** — Planting
  - **Amber** — Harvesting
  - **Purple** — Maintenance
  - **Lime** — Pruning
  - Any other task type shows in Rhozly's brand green.
  - Days with tasks involving your **favourite plants** show a ✨ sparkle.
- Tap any day to select it — the agenda panel updates to show that date.

### Filters, Export & Harvest Windows

The toolbar above the calendar lets you narrow and export what's shown:

![The Filters panel open with task-type chips and location / area / plan dropdowns](/doc-images/02-dashboard-09-filters.webp)

- **Filters** — check/uncheck task types, or filter by **Location**, **Area**, or **Garden Plan**. A badge shows the active filter count; **Clear All** resets them.
- **Export** — download your schedule.
- **Harvest windows** — highlight expected harvest periods on the grid.

### Agenda Panel

The agenda lists all tasks for the selected date using the standard task card layout:

- **Pending / Completed** tabs with counts
- **Scope filters**: All, Home, Mine, Assigned to me
- **To-Do List** and **Add Task** buttons
- All standard task actions (complete, postpone, delete, bulk edit)

See [Tasks](./03-tasks.md) for full detail on task actions.

---

## Weather View

The Weather view shows the full forecast for your home plus weather-aware gardening advice.

![The Weather view showing the day forecast cards with icons and high / low temperatures](/doc-images/02-dashboard-10-weather.webp)

### Forecast & Hourly Detail

- A row of **day cards** — each with the day, a weather icon, and high/low temperatures (plus rainfall where expected).
- Tap a day to expand its **hourly detail**, with toggleable chart metrics: **Temperature**, **Rain chance**, **Wind speed**, and **Humidity**.

### Garden Intelligence

Below the forecast is the **Garden Intelligence** panel — Rhozly's weather-aware rule engine. Every rule is evaluated for the week and shown with its current status and the threshold that drives it.

![The Garden Intelligence panel — rule cards for Auto-Watering, Frost Risk, Heatwave, High Winds, and Overwatering with their statuses](/doc-images/02-dashboard-11-garden-intelligence.webp)

Rules you may see include:
- **Auto-Watering** — which watering tasks the rain forecast will auto-complete (5mm threshold)
- **Frost Risk** — minimum temperature in the next 48h vs the 2°C threshold
- **Heatwave** — maximum temperature in the next two days vs the threshold
- **High Winds** — a warning to secure vulnerable plants when strong winds are forecast
- **Overwatering Risk** — flags a run of consecutive rainy days

Each card shows whether it's **Clear** or a **Warning**, with a plain-language explanation of the threshold that triggered it.

See [Weather & Garden Intelligence](./10-weather-intelligence.md) for more detail.

---

## Pull to Refresh

On mobile, pull down on the Dashboard to manually refresh all data (locations, tasks, weather).
