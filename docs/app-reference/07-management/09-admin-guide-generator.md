# Admin Guide Generator (Guide Studio)

> Admin-only screen that uses AI to draft curated Rhozly guides. Pick topic + difficulty + target audience → Gemini generates a structured guide payload → preview + edit title → publish to the `guides` table.

**Route:** `/admin/guides` (admin only).
**Source files:**
- `src/components/AdminGuideGenerator.tsx`
- `supabase/functions/generate-guide/index.ts`

---

## Quick Summary

Two-column layout:

- **Left** — controls: topic input, difficulty dropdown (Beginner / Intermediate / Advanced), target audience dropdown (Home Gardeners / Allotment Holders / Container Gardeners / etc.), Generate button.
- **Right** — preview: AI-generated guide JSON rendered as a guide card, with inline title editor and Save-to-database button.

Saving inserts the guide JSON into `guides.data` (jsonb) with an array of `labels`. It then appears in the Rhozly Guides tab of `/guides`.

---

## Role 1 — Technical Reference

### Component graph

```
AdminGuideGenerator
├── Left column (controls)
│   ├── Topic input
│   ├── Difficulty dropdown
│   ├── Target audience dropdown
│   └── Generate button
└── Right column (preview)
    ├── Generated guide card
    ├── Inline title editor
    └── Save to database button
```

### Local state

| State | Purpose |
|-------|---------|
| `topic`, `difficulty`, `targetAudience` | Form inputs |
| `isGenerating`, `isSaving` | Action flags |
| `previewData` | The generated guide JSON |
| `previewLabels` | AI-derived label tags |
| `isEditingTitle`, `editedTitle` | Inline title rename |

### Data flow — read paths

None.

### Data flow — write paths

#### Generate
```ts
supabase.functions.invoke("generate-guide", {
  body: { topic, difficulty, target_audience: targetAudience },
});
// Returns: { guide_data: {...}, labels: [...] }
```

#### Save
```ts
supabase.from("guides").insert({
  data: dataToSave,   // includes title, sections, etc.
  labels: previewLabels,
});
```

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `generate-guide` | Gemini call to draft structured guide content + label extraction |

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — admin-only flag (`user_profiles.is_admin`).

### Beta gating

None.

### Permissions

- `is_admin` — required (checked in app routing).
- Insert on `guides` requires admin RLS policy.

### Error states

| State | Result |
|-------|--------|
| No topic | Toast "Please enter a topic" |
| Generate fails | Toast with server message |
| Save fails | Toast with server message |

### Performance

- Single AI call per generate.
- Preview is in-memory; not persisted until Save.

### Linked storage buckets

None — guide bodies live in the row JSON; images referenced by URL.

---

## Role 2 — Expert Gardener's Guide

### Why use this tool (admin only)

This is the content engine for curated Rhozly Guides. Most users will never see it. As an admin, you use it to:

- Generate first-draft articles quickly.
- Maintain editorial control by reviewing + tweaking the AI's draft before publishing.
- Tag with structured labels so they show up under the right filters.

### Every flow on this tool

#### 1. Generate

- Type topic: "How to overwinter dahlias", "Companion planting basics", etc.
- Set difficulty + audience.
- Tap Generate → wait a few seconds.

#### 2. Preview

- Right column shows the generated guide card.
- Title is inline-editable.
- Body sections appear as you'd expect them in `/guides`.

#### 3. Save

- Tap Save → guide inserts into the `guides` table.
- Goes live immediately in Rhozly Guides tab.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Topic | The prompt seed |
| Difficulty | Filter chip in the user-facing list |
| Target audience | Editorial framing (not necessarily a filter today) |
| Labels | Topic tags (auto-extracted) |
| Title (editable) | Editorial control before publish |

### Tier-by-tier experience

Admins only.

### Common mistakes / pitfalls

- **Publishing without reading.** AI drafts can be subtly wrong. Always read end-to-end before saving.
- **Re-running with the same topic.** Generates a new article each time; doesn't update an existing one. Edit `guides` row directly for updates.
- **Forgetting to tweak labels.** Labels drive filter visibility — wrong labels = wrong filter category.

### Recommended workflows

- **Per topic:** generate → read → fix factual errors → save.
- **Batch:** run a dozen topics in one sitting; review individually.
- **Version control:** if an existing guide needs an update, edit the row in Supabase Studio rather than re-generating.

### What to do if something looks wrong

- **AI produces hallucinations:** flag in admin notes; revise before saving.
- **Save fails with RLS:** check `is_admin` flag on your profile.
- **Generated label list missing:** edge function may have fallen back to default labels.

---

## Related reference files

- [Guides List](../05-tools/07-guides-list.md)
- [Community Guide Editor](../05-tools/09-community-guide-editor.md)
- [Guides Data Model (cross-cutting)](../99-cross-cutting/08-data-model-guides.md)
- [AI — Gemini (cross-cutting)](../99-cross-cutting/13-ai-gemini.md)

## Code references for ongoing maintenance

- `src/components/AdminGuideGenerator.tsx`
- `supabase/functions/generate-guide/index.ts` — Gemini call
- `supabase/migrations/*_guides.sql` — schema
