# The Shed — Plant Inventory

The **Shed** is your master plant library. It lives under the **Garden** tab in the sidebar. Every plant in your garden — whether you added it manually, found it through the API search, or had it identified by AI — lives here.

> 📸 Screenshot: The Shed showing a grid of plant cards with thumbnails, names, and source badges

---

## The Shed vs. The Watchlist

The Garden tab has two sub-tabs:

| Tab | What's here |
|-----|-------------|
| **The Shed** | Your plant inventory — all species and instances you're growing |
| **Watchlist** | Tracked ailments (pests, diseases, invasive plants) — see [Ailment Watchlist](./11-ailment-watchlist.md) |

---

## Plant Cards

Each plant species in your shed appears as a card showing:

| Element | Description |
|---------|-------------|
| **Thumbnail** | Photo of the plant (from Perenual API, Unsplash, or an uploaded image) |
| **Common name** | The plant's popular name (e.g. "Basil", "Cherry Tomato") |
| **Scientific name** | Latin name if available |
| **Source badge** | How it was added: Perenual (database), Verdantly (database), Manual, or AI |
| **Instance count** | How many individual plants of this species you have |

---

## Active and Archived Views

Two view tabs at the top of the Shed:

- **Active** — plants currently in your garden (status: Pending, Planted, or Growing)
- **Archived** — plants that have been harvested or manually archived

Tap **Archived** to see past plants and restore them if needed.

---

## Filtering and Searching

> 📸 Screenshot: The Shed filter bar showing source filter pills and the search input

**Search:** Type any part of the plant's common or scientific name.

**Filter by source:**
- **All** — show every plant
- **Manual** — only plants you created by hand
- **API** — plants found via the Perenual plant database
- **Verdantly** — plants sourced from the Verdantly plant database
- **AI** — plants identified by the Plant Doctor camera

**Sort mode:**
- **Alphabetical** — A–Z by common name
- **AI Preference** — plants you've swiped as favourites (set in [Profile](./14-profile-preferences.md)) float to the top

---

## Adding a Plant

There are two ways to add a plant to your Shed:

### Option 1: Search the Plant Database

Tap **Add Plant** (or use the [Global Quick Add](./15-navigation-quick-add.md#global-quick-add) → **Add Plant**), then select **Search Database**.

> 📸 Screenshot: The Bulk Search modal showing the search field and a queue of plants being processed

1. Type the plant name in the search field.
2. Results from the Perenual plant database appear — each card shows the common name, scientific name, and an image.
3. Tap **Add** on any result to add it to your shed.
4. For adding many plants at once, use **Bulk Add** — select multiple results and they join a processing queue. Each item shows its status: Pending → Processing → ✅ Success or ❌ Error.

### Option 2: Manual Entry

Tap **Add Plant** → **Add Manually**.

> 📸 Screenshot: The Manual Plant Creation form with name, scientific name, and source fields

Fill in:
- **Common name** (required)
- **Scientific name** (optional)
- **Image** — upload a photo (optional)
- Any additional notes

Tap **Save** to add the plant.

### Option 3: Via Plant Doctor (AI)

Point your camera at an unknown plant in the [Plant Doctor](./08-plant-doctor.md) — when the AI identifies it, you can add it directly to your Shed from the results.

---

## Viewing Plant Details

Tap any plant card to open its detail view.

> 📸 Screenshot: Plant detail view showing the plant image, name, all instances listed by area, and the care routine card

### What's Shown

- **Plant image** at the top
- **Common and scientific name**
- **Source** (Perenual / Verdantly / Manual / AI)
- **All instances** — each individual plant of this species grouped by area
  - Each instance shows its status (Pending / Planted / Archived) and the area it's in
- **Care routine** — if care data is available from the database, a card shows watering frequency, sunlight needs, and other growing tips
- **Active tasks** linked to this plant

---

## Managing Instances

An **instance** is one individual plant of a species. For example, you might have 4 cherry tomato plants — that's 4 instances of the "Cherry Tomato" species.

### Assigning Instances to Areas

When you add a plant, you can assign it to a specific location and area:

1. Tap **Edit** on the plant card (or from the detail view)
2. In the area picker, select **Location** → **Area**
3. Specify how many instances are in that area
4. Tap **Save**

### Changing an Instance's Area

Open the plant detail → tap the instance → select a new area from the picker.

---

## Editing a Plant

Tap the **Edit** button on a plant card (pencil icon, or three-dot menu → Edit).

> 📸 Screenshot: The Edit Plant modal with fields for name, scientific name, image upload, labels, and care data

Edit any field:
- Name, scientific name
- Upload or change the photo
- Add **labels** (custom tags like "edible", "ornamental", "herb")
- Update care data (watering frequency, sunlight preference)

Tap **Save** to update.

---

## Archiving a Plant

Archive a plant when it is no longer actively growing (e.g. end of season, harvested).

> 📸 Screenshot: The archive confirmation modal listing any active tasks that will be removed

Tap the **Archive** button (or three-dot menu → Archive):
- If the plant has active tasks, Rhozly lists them and confirms you want to proceed.
- Archiving removes the plant from all active task blueprints (so no more reminders are generated).
- Archived plants are still visible under the **Archived** tab and can be restored.

### Restoring an Archived Plant

Go to the **Archived** tab → find the plant → tap **Restore**. It returns to Active status and you can set up care schedules again.

---

## Deleting a Plant

Tap the **Delete** button (or three-dot menu → Delete). This permanently removes the plant and all its instances. Use **Archive** instead if you might want it back later.

---

## Plant Inventory and Tasks

Plants in your Shed are directly connected to your tasks:
- When you create a task, you can link it to specific plant instances.
- When a **Planting** task is completed, the linked plant's status automatically updates to **Planted**.
- When a **Harvesting** task is completed, you are prompted to **archive** the harvested plants.
- If a plant is archived, Rhozly automatically removes it from all future recurring task blueprints.
