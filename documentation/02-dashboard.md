# Dashboard

The Dashboard is the home screen of Rhozly. It gives you a live overview of your garden — locations, tasks, and weather — all in one glance.

> 📸 Screenshot: The full Dashboard in Locations view showing the weather widget, location cards, and the right-side task panel on desktop

---

## View Switcher

At the top of the Dashboard are three view options:

| View | What it shows |
|------|--------------|
| **Locations** | Your garden locations as cards, with the weather widget and today's tasks |
| **Calendar** | A monthly calendar with task dots + an agenda for any selected date |
| **Weather** | The full 7-day weather forecast and any active alerts |

Tap any tab to switch between views. Your last selected view is remembered.

---

## Locations View

This is the default view when you open Rhozly.

> 📸 Screenshot: Locations view with the weather widget at top-left and two or three location cards below

### Weather Widget

The weather widget sits at the top of the page and shows a live summary of conditions:

- Current **temperature** (°C)
- **Weather description** (e.g. "Partly Cloudy", "Light Rain")
- **Humidity** percentage
- **Wind speed** (km/h)
- A gradient background that reflects current conditions (blue for rain, orange for sun, etc.)

Tap **"View Full Forecast"** to jump to the Weather view for the 7-day breakdown.

If a **Weather Alert** is active (e.g. frost risk, heavy rain), a coloured banner appears below the widget showing the affected location, start/end times, and the alert message.

> 📸 Screenshot: The weather alert banner below the weather widget

### Location Cards

Each of your garden locations appears as a card:

> 📸 Screenshot: A single location card showing the name, plant count badge, and task count badge

| Element | Description |
|---------|-------------|
| **Location name** | The name you gave the location (e.g. "Back Garden", "Greenhouse") |
| **Plant count** | How many active plants are in this location |
| **Task count badge** | Number of tasks due today across this location |

Tap a location card to open the **Location Detail Page**, which shows:
- A breakdown of areas within that location
- The plants in each area
- Today's tasks filtered to that location

### Right Sidebar (Desktop Only)

On desktop, a panel appears on the right side of the Locations view.

> 📸 Screenshot: The desktop right sidebar showing the AI assistant card and the daily task list

It contains two sections:

**Home Profile Prompt** (shown until dismissed):
- A card prompting you to complete the Habit Quiz
- Tap **Get started** to go to your Profile
- Tap **✕** to dismiss — it won't appear again in this session

**Daily Tasks Panel**:
- All of today's tasks across your entire home
- Has its own **Pending / Completed** tabs
- Full task interaction (mark complete, postpone, delete, open detail modal)
- See [Tasks](./03-tasks.md) for how all task actions work

---

## Calendar View

The Calendar view combines a monthly calendar on the left with a daily agenda on the right.

> 📸 Screenshot: Calendar view showing the month grid on the left and the task agenda for a selected date on the right

### Monthly Calendar

- Navigate months with the **← / →** arrows, or tap the **month name** to jump to today.
- Each day shows coloured **task dots** indicating which types of tasks are due:
  - 🔵 Blue — Watering
  - 🟢 Green — Planting
  - 🟡 Amber — Harvesting
  - 🟣 Purple — Maintenance
  - 🟤 Lime — Pruning
  - Up to 3 dots are shown; if there are more, a "+N" indicator appears
- Days with tasks involving your **favourite plants** (as learned by the AI) show a ✨ sparkle icon.
- Tap any day to select it — the agenda panel updates to show tasks for that date.

### Filters

Tap the **Filter** button to narrow down which tasks appear in both the calendar dots and the agenda:

> 📸 Screenshot: The filter panel open with task type checkboxes and location/area dropdowns

- **Task types** — check/uncheck Watering, Planting, Harvesting, Maintenance, Pruning
- **Location** — select a specific location
- **Area** — select a specific area (only available after choosing a location)
- **Garden Plan** — filter tasks belonging to a specific plan
- Tap **Clear All** to reset all filters

When any filter is active, the Filter button shows a coloured badge with the count of active filters.

### Agenda Panel

The agenda shows all tasks for the selected date using the same task card layout as the main task list. Features include:

- **Pending / Completed** tabs with counts
- **Scope filters**: All, Home, Mine, Assigned to me
- **Add Task** button to create a new task directly for the selected date
- All standard task actions (complete, postpone, delete, bulk edit)

See [Tasks](./03-tasks.md) for full detail on task actions.

---

## Weather View

The Weather view shows the full forecast for your home's locations.

> 📸 Screenshot: The Weather view showing a 7-day forecast grid with icons, high/low temperatures, and condition descriptions

### What's Shown

- **Current conditions** at the top (same data as the weather widget)
- **7-day forecast** — one card per day showing:
  - Day name and date
  - Weather icon (sun, cloud, rain, snow, etc.)
  - High and low temperatures
  - Condition description
  - Rain probability (%)
- **Active weather alerts** listed at the bottom

### Garden Intelligence

Below the forecast you will find the **Garden Intelligence** panel — this is Rhozly's weather-aware rule engine that advises you on gardening actions based on current and forecast conditions.

> 📸 Screenshot: Garden Intelligence panel showing rule cards like "Skip watering today — rain expected"

Examples of rules that may appear:
- "Skip watering today — rain expected tomorrow"
- "Bring frost-sensitive plants inside — temperatures dropping below 2°C tonight"
- "Good day for pruning — dry and mild conditions"

Each rule shows a brief explanation of the threshold that triggered it (e.g. ">5mm rain forecast in the next 24 hours").

See [Weather & Garden Intelligence](./10-weather-intelligence.md) for more detail.

---

## Pull to Refresh

On mobile, pull down on the Dashboard to manually refresh all data (locations, tasks, weather).
