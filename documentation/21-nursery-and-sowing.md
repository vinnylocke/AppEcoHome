# Nursery & Sowing

The **Nursery** is where you track everything that hasn't made it into a bed yet — seed packets, active sowings, germinated seedlings, and the plant-out queue. It lives alongside [The Shed](./05-the-shed.md) under the **Garden** tab; flip between them using the Shed / Nursery toggle in the page header.

![The Nursery: summary line (packets · active sowings · sow-by approaching), Scan / Paste a list / Add packets actions, and the seed packet list below](/doc-images/21-nursery-and-sowing-01-overview.webp)

---

## Seed Packets

A **seed packet** represents a packet of seeds you own or are considering. It tracks the species, source, sowing windows, and any active sowings.

### Adding a Seed Packet

There are three ways to add one:

| Method | When to use |
|--------|-------------|
| **Add manually** | Type the plant name, sow-by, and quantity from scratch |
| **Bulk paste** | Paste a multi-line list of plant names — Rhozly resolves each in one go |
| **Scan packet** | Take a photo of the back of a real seed packet; Rhozly extracts the species, sow-by, and any growing instructions with AI |

Tap **+ Add Packets** at the top of the Nursery tab to pick a method.

### Packet Card

Each packet card shows:
- **Species name** (common + scientific)
- **Source** (manual / scanned / paste / Perenual)
- **Sow-by date** if the packet has an expiry
- **Active sowings** indicator if there's a sowing currently in progress

![A seed packet card: species name, scientific name, a sow-by pill with days remaining, vendor and seed count, and a sowing-status tag (e.g. "12 sown · ready to plant out")](/doc-images/21-nursery-and-sowing-02-packet-card.webp)

Tap the card to open the **packet detail** — sowings history, AI growing instructions, and the action buttons (Sow now, Edit, Delete).

---

## Sowing a Packet

When you sow seeds from a packet, tap **Sow now** on the packet detail to log the event.

> 📸 *Screenshot coming with the interactive sowing release — logging screens are rolling out; sowing status shown in the Nursery today is populated during setup.*

| Field | What it means |
|-------|--------------|
| **Date sown** | When you actually sowed — defaults to today |
| **Quantity** | How many seeds went in |
| **Container or area** | Where the sowing lives — seed tray, propagator, area name |
| **Notes** | Optional — soil type, depth, anything you want to remember |

Once saved, the sowing appears as an **active sowing** under the packet and on the Nursery dashboard. Rhozly tracks expected germination dates based on the species and shows status as **Sown → Germinated → Ready to plant out**.

---

## Logging Germination

When sprouts appear, tap **Mark germinated** on the active sowing — Rhozly records the date so it can learn your growing-on rate over time. Optionally add the **germination success rate** (e.g. "7 of 10 sprouted") so future estimates get smarter.

---

## Planting Out

When seedlings are ready for the ground, open the active sowing and tap **Plant out**.

> 📸 *Screenshot coming with the interactive plant-out release.*

The plant-out modal:
1. Lets you pick the **area** they're going into
2. Captures how many you're planting out (may be less than what germinated)
3. Optionally creates **matching inventory items in The Shed** so they're tracked alongside your other plants

After planting out, the sowing is marked complete and the seedlings live their next life in your Shed.

---

## Plant Out Queue

The Nursery tab has a **Plant Out queue** sub-view showing every active sowing that's ready to go into the ground.

> 📸 *Screenshot coming with the interactive plant-out release.*

Useful when you've sown a lot at once and want a single place to work through plant-outs over a weekend.

---

## Sowing Calendar

Switch to the **Calendar** view (inside the Nursery tab) to see a month-by-month view of:

- **Sow-by windows** for every packet (when the packet itself expires)
- **Recommended sow windows** for the species (when conditions are right)
- **Active sowings** showing their expected germination + plant-out dates

The calendar respects your hemisphere — northern users see Northern Hemisphere windows; southern users see Southern.

---

## How Nursery Interacts with The Shed

Nursery and Shed are linked but kept separate so you can track seeds and seedlings without polluting your inventory:

- **Seed packets** never appear in The Shed — they're a Nursery-only concept
- **Active sowings** show up on the Nursery dashboard and Plant Out queue
- **Plant-outs** create matching inventory items in The Shed if you opt in (recommended) — those plants then flow into your usual task schedules

If you skip the "Create matching plants" toggle, the seedlings exist only in the Nursery's history.

---

## Tips

- **Scan your real packets.** The AI extraction handles the small print on most packets — much faster than typing.
- **Log germination honestly.** A 60% rate is normal for some species; Rhozly uses your rates to recommend sow quantities later.
- **Stagger sowings.** Don't sow every packet at once — Rhozly's Sow calendar shows you when to spread things out.
- **Use the Weekly Overview's Sowings section** ([Weekly Overview](./17-weekly-overview.md)) — it surfaces packets whose sow-by windows are coming up this week.

---

## Common Questions

**Are sowings the same as plants?** No — a sowing is the *event* of putting seeds in. The plants that grow from it are tracked in The Shed once you plant them out.

**What if my packet doesn't have a sow-by date?** Leave it blank. Rhozly uses the species growing window for the calendar instead.

**Can I sow into the ground directly?** Yes — set the container/area field to your bed name, then plant-out is just a confirmation rather than a real move.

---

## Related guides

- [The Shed](./05-the-shed.md) — where plant-outs end up
- [Weekly Overview](./17-weekly-overview.md) — sowing rows surface here too
- [Locations & Areas](./09-locations-areas.md) — sowings and plant-outs both target areas
