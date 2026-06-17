# Tools

The **Tools** hub (sidebar → Tools, or `/tools`) is the gateway to Rhozly's advanced features. It shows a grid of tool cards — tap any to open that feature.

![The Tools hub — tool cards grouped by Plan & Design, Measure & Track, and more](/doc-images/13-tools-01-hub.webp)

---

## Available Tools

| Tool | Icon colour | What it does |
|------|------------|--------------|
| **Plant Lens** | Emerald | Plant identification + disease diagnosis (formerly "Plant Doctor") |
| **Weekly Overview** | Indigo | Sunday-morning recap of the next 7 days — tasks, weather events, sowings, harvests |
| **Garden Layout** | Violet | Design and visualise your garden in 2D and 3D |
| **Plant Visualiser** | Sky blue | Preview plants in your space using your camera |
| **Companion Planting** | Lime | See which plants help (or hinder) each other; auto-suggest planting groupings |
| **Light Sensor** | Amber | Measure light levels for area profiling |
| **Sun Tracker** | Orange | AR view of the sun's path and shadow zones |
| **Guides** | Rose | Step-by-step care guides |

**Plant Lens** is covered fully in [Plant Doctor (Lens)](./08-plant-doctor.md).
**Weekly Overview** has its own page — see [Weekly Overview](./17-weekly-overview.md).
**Guides** is covered fully in [Guides](./12-guides.md).

---

## Plant Visualiser

The **Plant Visualiser** lets you preview how plants will look in your physical garden space using your device camera and AI-generated plant sprites.

Access: Tools → Plant Visualiser (or `/visualiser`).

> 📸 Screenshot: The Plant Visualiser home screen showing a grid of plant options to select from

### Step 1: Select Plants

Browse your plant library and select the plants you want to visualise:
- Search by name (common or scientific)
- Filter by source (All / Manual / API / AI)
- Tap plant cards to select them (selected cards show a tick)
- Select as many as you want

Tap **Continue to Sprites** when you've chosen your plants.

### Step 2: Choose Sprites

> 📸 Screenshot: The Sprite Wizard showing a plant card with sprite source options on the right

For each selected plant you choose how to create its 2D sprite — a cut-out image overlaid on the camera view. There are three ways to get a sprite:

| Option | How it works |
|--------|-------------|
| **Pick from sources** | Search for an image from Unsplash, Perenual, or your plant's existing photos. Rhozly automatically removes the background so the plant is cut out cleanly. |
| **Default template** | Use a built-in silhouette sprite for the plant type — no image needed. |
| **Upload your own** | Take or import a photo from your device. Background removal is applied automatically. |

- Tap **Accept** once you're happy with the sprite for that plant
- Work through each plant in turn

When all sprites are ready, tap **Open Camera View**.

### Step 3: Camera Overlay

> 📸 Screenshot: The live camera view with two plant sprites dragged and positioned in different spots of a garden photo

The camera view shows your live camera feed with plant sprites overlaid.

| Action | How |
|--------|-----|
| **Add a plant** | Tap any plant sprite from the panel on the right |
| **Move a plant** | Drag the sprite to reposition it |
| **Resize** | Pinch/spread to scale the sprite |
| **Remove** | Tap the sprite → tap the × remove button |

### AI Placement Analysis

> 📸 Screenshot: The camera view with the amber sparkle button visible in the top controls, and the analysis sheet sliding up from the bottom

Once you have plants positioned in the camera view, tap the **✦ sparkle button** (amber, top-right) to run an AI analysis of the scene.

Rhozly captures the current camera frame — including the placed sprites and the real environment behind them — and sends it to the AI along with each plant's sunlight and watering requirements. The AI then assesses whether the environment looks suitable for each plant.

Results appear in a panel at the bottom of the screen:

| Result type | What it means |
|-------------|--------------|
| ✅ **Good** | The environment looks suitable for this plant |
| ⚠️ **Warning** | Possible concern — e.g. too much direct sun, or too shady |
| ❌ **Issue** | The environment appears unsuitable for this plant's needs |

A short **summary** of the overall scene is shown above the per-plant results. Any **general notes** (such as plants that are overlapping and may compete for space) appear below.

> AI analysis requires the **AI tier**. The sparkle button shows a lock icon if your plan does not include it.

Dismiss the results panel by tapping **×** — you can re-run the analysis at any time after repositioning your plants.

---

### Saving a Capture

Tap the **📷 Capture** button to save a snapshot of the current view with all sprites in place.

> 📸 Screenshot: The capture preview with a save/discard prompt

The capture is saved to your account's **Capture Gallery**.

### Capture Gallery

Tap the **Gallery** button (top-right, shows a count badge) to browse all your saved captures.

> 📸 Screenshot: The Capture Gallery showing a grid of saved snapshots

Each capture shows the date, location, and which plants were visualised. Tap any capture to view it full-screen. Tap **Delete** to remove it.

---

## Light Sensor

The **Light Sensor** measures the actual light level (in **lux**) at any point in your garden. Use this to populate area data for more accurate plant recommendations.

Access: Tools → Light Sensor (or `/lightsensor`).

> 📸 Screenshot: The Light Sensor screen showing a large lux readout, a light category label, and the area assignment controls at the bottom

### Measuring Light

Hold your device where you want to measure — the sensor reads light in real time.

**Two measuring methods:**
1. **Native Sensor** — uses your device's built-in ambient light sensor (most accurate; available on Android and some iPhones)
2. **Pixel Analysis** — uses the camera to estimate light from image brightness (fallback for devices without a native sensor)

Rhozly automatically uses the native sensor if available, and falls back to pixel analysis otherwise. You can manually switch between methods with the toggle.

### Light Categories

| Lux range | Category | Example |
|-----------|----------|---------|
| < 500 | **Deep Shade** | Under dense tree canopy, north-facing interior |
| 500 – 2,500 | **Low Light** | Shaded corner, bright interior room |
| 2,500 – 10,000 | **Bright Indirect** | Near a window, dappled shade |
| 10,000 – 20,000 | **Partial Sun** | Morning sun, east-facing position |
| > 20,000 | **Direct Sun** | Open south-facing position at midday |

The display colour changes to reflect the category (grey → blue → green → amber → orange).

### Calibration

If readings seem off, use the calibration controls:

> 📸 Screenshot: The calibration panel showing the calibration factor slider (0.5x – 2.0x)

- **Calibration factor** — a multiplier (0.1× to 2.0×) applied to the raw reading. Increase this if readings seem too low; decrease if too high.
- **Exposure compensation** — adjusts camera exposure for pixel analysis mode.

Calibration settings are saved locally to your device.

### Saving to an Area

Once you have a stable reading, save it directly to an area's profile:

> 📸 Screenshot: The save-to-area controls showing Location and Area dropdowns and a Save Reading button

1. Select the **Location** and **Area** from the dropdowns.
2. Tap **Save Reading**.
3. The lux value is saved to that area's `light_intensity_lux` field.
4. A confirmation shows "Saved to [Area name]: X lux".

The saved lux value is then used by Rhozly's AI for plant recommendations and care advice for that area.

---

## Garden Layout Builder

The **Garden Layout Builder** lets you create a top-down 2D map of your garden areas and plan where to place your plants.

Access: Tools → Garden Layout (or `/layout`).

![The Garden Layouts screen — create a layout to start mapping your garden spaces](/doc-images/13-tools-11-garden-layout.webp)

### How to Use It

1. Select an **area** from your locations to start a layout for that space.
2. **Place plants** — drag plant icons from your Shed onto the grid to position them.
3. **Resize and adjust** the grid to match your real area dimensions.
4. Layouts are saved per area and can be revisited at any time.

Use the Layout Builder to plan spacing before planting, check that plants fit your available space, or visualise what a new design will look like before committing to it.

---

## Companion Planting

The **Companion Planting** tool shows you which of your plants help (or hinder) each other when grown together — based on a curated database of pairings.

Access: Tools → Companion Planting (or `/companions`).

> 📸 Screenshot: The Companion Planting tab showing a plant card with "Good with…" and "Avoid…" lists below

### What it does

- **For each plant in your Shed**, Rhozly checks known companion pairings and shows:
  - **Good with** — plants that boost growth, deter pests, or share growing needs
  - **Avoid** — plants that compete, attract shared pests, or stunt each other
- **Filter by area** — to see only pairings between plants you actually grow side by side
- **Add to plan** — tap any suggested companion to start a [Garden Plan](./06-planner.md) that includes the pairing

This is especially helpful for veg patches: tomatoes love basil; brassicas dislike strawberries. Rhozly does the lookup so you don't have to.

---

## Sun Tracker

The **Sun Tracker** is an augmented reality tool that shows you the sun's path across the sky and where shadows will fall in your garden at different times of day.

Access: Tools → Sun Tracker (or `/sun-trajectory`).

> 📸 Screenshot: The Sun Tracker AR view showing the camera feed with a yellow arc overlaid representing the sun's trajectory

### How to Use It

1. Open the Sun Tracker.
2. Point your device camera at the sky or the part of the garden you want to analyse.
3. An **arc** is overlaid showing the sun's path from sunrise to sunset for today.
4. Move the **time slider** to see where the sun will be at different times — and where the shadow zones will fall.

### Use Cases

- Find the **sunniest spot** for sun-loving plants (tomatoes, peppers, most fruits)
- Identify **shaded areas** for shade-tolerant plants (hostas, ferns, some herbs)
- Plan **structure placement** (raised beds, trellises, polytunnels) to avoid self-shading
- Understand **seasonal variation** — the sun's path changes significantly between summer and winter
