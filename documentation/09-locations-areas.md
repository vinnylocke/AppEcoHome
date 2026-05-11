# Locations & Areas

**Locations** and **Areas** are how you describe the physical structure of your garden in Rhozly. Setting them up properly unlocks accurate task filtering, weather-aware advice, and AI plant recommendations.

Access via **Tools** → **Location Manager** (or directly at `/management`).

> 📸 Screenshot: The Location Manager showing two location cards (one expanded with its areas listed below)

---

## The Hierarchy

```
Home
└── Location (e.g. "Back Garden", "Greenhouse", "Kitchen Windowsill")
    └── Area (e.g. "Raised Bed 1", "South-facing shelf", "Patio pots")
```

| Level | What it represents |
|-------|--------------------|
| **Home** | Your whole property |
| **Location** | A distinct zone or structure (indoors vs. outdoors, a specific building, etc.) |
| **Area** | A specific growing space within a location (a bed, shelf, pot cluster, row) |

---

## Creating a Location

Tap **+ Add Location**.

> 📸 Screenshot: The Add Location form with a name field and an indoors/outdoors toggle

| Field | Description |
|-------|-------------|
| **Name** | What you call this space (e.g. "Front Garden", "Polytunnel") |
| **Outside?** | Toggle — marks whether this is an outdoor location (affects weather advice) |

Tap **Save**.

---

## Editing a Location

Tap the **location name** to edit it inline — type the new name and press Enter (or tap away) to save.

---

## Deleting a Location

Tap the **Delete** (bin icon) button on the location card. A confirmation modal appears.

> ⚠️ Deleting a location also deletes all areas within it. Plants assigned to those areas will lose their location assignment.

---

## Creating an Area

Expand a location (tap the expand toggle) then tap **+ Add Area**.

> 📸 Screenshot: The Add Area form with name, growing medium, pH, and light fields

| Field | Description |
|-------|-------------|
| **Name** | What you call this growing space (e.g. "Bed A", "South Shelf") |
| **Growing medium** | Soil type — Garden Soil, Potting Mix, Sand, Hydroponic, etc. |
| **pH** | Soil pH value (0–14; leave blank if unknown) |
| **Light intensity (lux)** | Average light level in this area — use the [Light Sensor](./13-tools.md#light-sensor) to measure |

Tap **Save**.

---

## Advanced Area Settings

Tap the **Advanced Settings** (or gear icon) on any area to access additional growing parameters used by Rhozly's AI:

> 📸 Screenshot: The Advanced Area Settings modal showing pH slider, lux input, and medium type dropdown

- **pH** — fine-tune the soil acidity value
- **Light intensity** — exact lux value from a sensor reading
- **Growing medium** — more specific soil type selection

These values are used by:
- **Plant Doctor** — to suggest plants compatible with your conditions
- **Garden Intelligence** — to adjust watering recommendations based on drainage
- **AI plan generation** — to tailor plant selections in [Garden Plans](./06-planner.md)

---

## Editing an Area

Tap the **Edit** (pencil icon) button on any area card to open the edit form. All fields can be changed.

---

## Deleting an Area

Tap the **Delete** (bin icon) button on an area card. A confirmation modal appears:

> 📸 Screenshot: Delete area confirmation with the "Also delete all plants in this area?" checkbox

- You are asked whether to also **delete all plants** assigned to this area.
- If you choose to keep the plants, they lose their area assignment but remain in your Shed.

---

## Viewing Locations on the Dashboard

Each of your locations appears as a **Location Card** on the Dashboard Locations view. Tap a card to open the **Location Detail Page**.

> 📸 Screenshot: The Location Detail Page showing areas with plant counts and today's task counts per area

The detail page shows:
- All areas within this location
- Plant count per area
- Today's task count per area
- Tap an area to see its plants and tasks

---

## Assigning Plants and Tasks to Areas

When you add a plant or create a task, you can assign it to a specific location and area. This enables:
- **Filtering** — see only tasks or plants for one area
- **Weather awareness** — outdoor locations get weather-based task advice
- **AI recommendations** — growing condition data helps Rhozly suggest the right plants

---

## Measuring Light for an Area

For the most accurate area setup, use the [Light Sensor tool](./13-tools.md#light-sensor) to measure the actual lux level in each area, then save the reading directly to the area record from within the Light Sensor. This gives Rhozly the data it needs to recommend plants suited to the exact light conditions of each space.
