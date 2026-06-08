# Pl@ntNet Identification

When you ask [Plant Lens](./08-plant-doctor.md) to identify a plant from a photo, Rhozly always runs the photo through **Pl@ntNet first**, then cross-checks with Rhozly AI. This guide explains what Pl@ntNet is, why it leads, and how to read its results.

---

## What Pl@ntNet Is

**Pl@ntNet** is a community-curated plant identification service backed by botanists and millions of contributor photos. Each plant entry has been observed, photographed, and verified by real people, often in the field, often with location metadata.

It's accurate, fast, free, and licensed under **CC-BY-SA** — which means every result tile in Rhozly carries the original contributor's name and a CC-BY-SA badge.

> 📸 Screenshot: A Pl@ntNet identification result tile showing the species name, scientific name, confidence %, contributor credit, and a "CC-BY-SA" badge

---

## Why Pl@ntNet Runs First

Pl@ntNet is the first identification engine Plant Lens consults because:

1. **Accuracy** — community-verified observations beat single-source databases for ambiguous plants
2. **Speed** — it returns in under a second, well ahead of AI
3. **Free for every tier** — no AI credits consumed
4. **Real photos, not stock images** — contributor photos look like what you might see in your own garden

The Rhozly AI tile follows as a **cross-check** — confirming the call when Pl@ntNet is confident, or offering a different read when it isn't.

---

## Reading the Dual-Tile Result

> 📸 Screenshot: The dual-tile result layout — Pl@ntNet on the left with a contributor credit, Rhozly AI on the right with the sparkle icon

| Tile | What it shows |
|------|---------------|
| **Pl@ntNet** | Species name, scientific name, confidence %, contributor credit, CC-BY-SA badge |
| **Also from Rhozly AI** | Scientific name, brief description, the AI's confidence level. Often a "both engines agree" chip if the picks match. |

If the two tiles **agree**, pick the species and move on.

If they **disagree**, read both reasonings — Pl@ntNet might match a regional contributor photo while Rhozly AI cross-checks against broader plant traits. Pick whichever you think describes your plant best.

If **neither feels right**, tap **None of these** — Plant Lens will run a fresh round with more context.

---

## Confidence Levels

Pl@ntNet returns a confidence percentage for each match. Plant Lens groups these into bands:

| Band | What it means |
|------|---------------|
| **Very likely** | >85% — Pl@ntNet is confident; cross-check matches |
| **Likely** | 60–85% — Strong but not certain; check Rhozly AI for confirmation |
| **Possible** | 30–60% — Worth considering, but verify another way |
| **Unlikely** | <30% — Usually filtered out of the result tiles |

A higher confidence isn't always right — close lookalikes can trip community photo matchers. Always sanity-check against the plant's care needs once it's in your Shed.

---

## When Pl@ntNet Doesn't Help

Some scenarios where Pl@ntNet is weaker and Rhozly AI's cross-check matters more:

- **Hybrid cultivars** without a wild equivalent — AI may know the cultivar by name
- **Unusual angles** or extreme close-ups — community photos rarely cover the same shot
- **Seedlings or very young plants** — they look similar across species
- **Indoor houseplants** that aren't typical Pl@ntNet contributor subjects

In all these cases, the AI tile is your safety net.

---

## Crediting the Contributors

Every Pl@ntNet match includes the original contributor's name and a link to their observation. Tap the **CC-BY-SA badge** on any tile to see:

- Contributor name
- Country / region of the observation
- Link to the original on the Pl@ntNet site

If you save the plant to your Shed, the contributor credit travels with it — visible from the plant's hero image and the [/credits page](./19-image-credits.md#the-credits-page).

---

## Common Questions

**Does Pl@ntNet cost anything?** No — free for every Rhozly tier.

**Are my photos uploaded to Pl@ntNet?** Yes, but only the photo bytes needed for identification; no account or location info is sent. Once the result comes back, Pl@ntNet stores the photo for its quality-improvement process under standard Pl@ntNet terms.

**Can I turn Pl@ntNet off?** Not currently — it's a core part of Plant Lens. If you don't want a particular photo run through it, don't tap **Identify**.

**Why does the contributor credit appear twice?** If the same contributor's photo represents the plant in both the species hero and the identification result, both surfaces will carry the badge so the credit is preserved everywhere the image appears.

---

## Related guides

- [Plant Lens](./08-plant-doctor.md) — the main surface that uses Pl@ntNet
- [Image Credits](./19-image-credits.md) — how credit badges work across the app
- [The Shed](./05-the-shed.md) — Pl@ntNet-sourced plants appear here with the source badge
