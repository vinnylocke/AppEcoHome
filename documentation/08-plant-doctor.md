# Plant Lens (formerly Plant Doctor)

**Plant Lens** is Rhozly's AI-powered camera tool. Access it from the **Tools** tab → **Plant Lens**, or via the sidebar. (Older parts of the app still call this "Plant Doctor" — they're the same feature.)

It can do two things:
1. **Identify** an unknown plant from a photo
2. **Diagnose** a plant problem (disease, pest, nutrient deficiency) from a symptom photo

![The Plant Lens home screen — the Upload → Analyse → Results flow with the photo upload area](/doc-images/08-plant-doctor-01-overview.webp)

---

## The Two Tabs

| Tab | Purpose |
|-----|---------|
| **Analyse** | Take or upload a photo for identification or diagnosis |
| **History** | Browse past Plant Doctor sessions |

---

## Plant Identification

Use this to find out what a plant is when you don't know its name.

> 📸 Screenshot: The identification flow — image upload area on the left, AI results with plant suggestions on the right

### Step 1: Upload a Photo

Tap **Identify Plant** then either:
- **Take Photo** — uses your device camera
- **Upload from Gallery** — select an image from your photos

For best results:
- Take the photo in good natural light
- Include the leaves, ideally with some stem
- Avoid heavy shadows or blur

### Step 2: Review the Dual-Tile Results (Wave 21.0010)

Plant Lens runs your photo through **two identification engines in parallel** and shows the results as a pair of tiles:

| Tile | Source |
|------|--------|
| **Pl@ntNet** | A community-curated identification service (CC-BY-SA licensed). Always runs first because it's fast, accurate, and free for every tier. Each match includes the contributor's name in the credit badge. |
| **Also from Rhozly AI** | Gemini-powered cross-check. Either confirms Pl@ntNet's pick or offers a different read when Pl@ntNet wasn't confident. |

> 📸 Screenshot: The dual-tile identification result — Pl@ntNet tile on the left with a CC-BY-SA badge, Rhozly AI tile on the right with the sparkle badge

When both tiles agree, you'll see a small **"both engines agree"** chip. When they disagree, Rhozly shows the reasoning behind each so you can pick which to trust.

Each suggestion shows:
- **Plant name** (common and scientific)
- **Confidence level** (e.g. "Very likely", "Possible")
- A brief description
- A **credit badge** — tap it for the source's attribution (see [Image Credits](./19-image-credits.md))

### Step 2a: Enlarge the photo

Tap any preview image to open Rhozly's **in-app lightbox** — pinch, zoom, swipe between angles. No system viewer, no leaving the app. Wave 21.0011 + 22.0005 introduced this; it now works on every image surface in the app.

### Step 3: Select the Correct Plant

Tap the suggestion that matches your plant. Rhozly then:
- Looks up the plant in the **Perenual database** for care data (if available)
- Offers to **Add to your Shed** — tap to add it to your plant inventory
- Shows care information: watering needs, sunlight, toxicity, etc.

If none of the suggestions match, tap **None of these** and the AI will explain what it couldn't determine.

### Step 4: Save to Shed (Optional)

If you tap **Add to Shed**, the plant is added to your inventory. You can then assign it to a location and area.

---

## Disease & Pest Diagnosis

Use this when a plant looks unwell — yellowing leaves, spots, holes, wilting, or pest damage.

> 📸 Screenshot: The diagnosis flow showing an uploaded image of a sick plant on the left and the AI diagnosis results on the right

### Step 1: Upload a Symptom Photo

Tap **Diagnose Problem** then upload a photo showing the symptoms clearly. Tips:
- Focus on the affected area (leaves, stems, roots)
- Include multiple symptom photos if possible
- Good lighting is essential

### Step 2: Review the Diagnosis

The AI returns possible causes:

> 📸 Screenshot: Diagnosis results showing a disease name, severity, affected part, and a list of symptoms matching the photo

Each result shows:
- **Condition name** (e.g. "Powdery Mildew", "Aphid Infestation", "Iron Deficiency")
- **Type** — Disease, Pest, or Nutrient deficiency
- **Affected parts** — leaves, roots, stems, fruit
- **Matching symptoms** from the photo
- **Severity estimate**

### Step 3: Apply a Treatment

Tap **Apply Treatment** on the diagnosis you want to act on.

> 📸 Screenshot: The treatment panel showing remedy steps with task type icons, product recommendations, and action buttons

This opens the treatment panel:

| Section | Description |
|---------|-------------|
| **Prevention steps** | What to do to stop the problem spreading |
| **Remedy steps** | Active treatment actions |
| **Products** | Specific products recommended for each step |

For each step you can:
- **Create task** — adds the step as a task or blueprint to your schedule
- **Add to shopping list** — adds recommended products to your shopping list

### Step 4: Link to Affected Plants (Optional)

Tap **Assign to plant** to link the diagnosis to a specific plant in your Shed. This:
- Adds an entry to the [Ailment Watchlist](./11-ailment-watchlist.md) for that plant
- Tracks which plants have been affected by this condition

---

## History Tab

All past Plant Doctor sessions are saved and accessible from the **History** tab.

> 📸 Screenshot: The History tab showing a list of past session cards with date, thumbnail, and detected entity

Each session card shows:
- **Date** of the analysis
- **Thumbnail** of the image used
- **Detected entity** (plant name or disease/pest name)
- **Status** — Pending confirmation or Confirmed

### Session Detail View

Tap any session card to open the full session:

> 📸 Screenshot: A session detail view showing the original image, AI results, treatments applied, and tasks created

- Original image
- All AI suggestions returned
- Which suggestion you selected
- Treatments applied (if any)
- Tasks created from the treatment
- **Confirm** button — marks the session as completed once you've acted on it

---

## Saving Sessions to Your Journal

When you perform an analysis, a **"Save to journal"** checkbox is shown. Leave this ticked (default) to automatically save the session to your History.

If you just want a quick lookup without saving, untick the checkbox before analysing.

---

## Tips for Best Results

| Tip | Why it helps |
|-----|-------------|
| Good lighting | AI vision accuracy drops significantly in poor light |
| Single subject | One plant per photo gives cleaner results |
| Multiple angles | Take 2–3 photos for complex diagnoses |
| Early symptoms | Catch diseases before they spread — earlier diagnosis = better outcomes |
| Clean lens | A smudged camera lens causes blur that confuses the AI |

---

## Privacy Note

Photos uploaded to Plant Doctor are processed by Rhozly's AI and stored in your account's private storage. They are never shared with other users.
