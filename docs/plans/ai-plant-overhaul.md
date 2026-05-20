# AI Plant Overhaul — Design Plan

> Move AI-generated plant care guides from a per-home, 30-day TTL cache to a globally-shared catalogue that any user can reuse, with a 90-day server-side freshness check that compares old vs new and surfaces field-level changes back to the users who've added the plant to their shed.

**Status:** Draft — awaiting user approval before implementation.
**Owner:** TBD
**Scope:** Database schema, edge functions, cron, RLS, client-side caching, realtime, and ~7 UI surfaces.

---

## 1. Goals (from the brief)

1. **Indefinite global cache for AI plants.** When a user adds a plant via the AI source, the species record + care guide are stored once globally and reused by every other user that adds the same plant. The user only sees a plant in their shed if they themselves added it, but the underlying record is shared.
2. **Care-guide reuse on add.** If user A's AI search generated and added "tomato", user B searching for tomato later should get the cached care guide back — no second Gemini call.
3. **Robust search dedup.** When AI search returns candidates, if a matching record already exists in the global catalogue, the picker should clearly route the user to the existing record (no duplicate `plants` rows).
4. **90-day freshness check (not TTL).** A server-side cron periodically re-asks the AI to regenerate the care guide for old records, diffs the result, and only updates the record if something genuinely changed. Records that haven't drifted just have their `last_checked_at` bumped.
5. **In-app "updated" signal.** Users with an updated plant in their shed see a chip on the plant card AND on its instances. Tapping the chip opens the care guide with the changed fields highlighted. Acknowledging the change clears the chip for that user.

---

## 2. Design decisions (locked)

### Initial four (from clarifying questions)

| Question | Decision |
|----------|----------|
| Dedup scope | **AI-only dedup.** Two `plants` rows for "tomato" (one Perenual, one AI) stay as separate sources. We only collapse duplicates within `source = 'ai'`. |
| Stale-check cost | **Server-side, no per-user cost.** The cron runs Gemini via service key. Every AI plant is eligible regardless of whether it's currently in any user's shed (orphan filtering can be added later if cost becomes a concern). |
| Acknowledgement model | **Per-user, per-plant.** Each user has their own "last seen revision" stored on a new join table. User A clearing the chip never affects user B. |
| Diff granularity | **Per-field highlight** for structured fields (sunlight, watering, hardiness, cycle, etc.) with yellow background. Free-text fields (description, maintenance_notes) get a "this section changed" chip but no inline word-diff. |

### Follow-up six (resolves the open questions in old §16)

| Question | Decision |
|----------|----------|
| Editing an AI plant | **Detach-on-edit override flow.** When a user edits an AI plant from the catalogue, a modal warns them: "Editing this plant will stop automatic care-guide updates from Rhozly. You can reset it later to rejoin." On confirm we **fork** — insert a new home-scoped `plants` row with `home_id = user.home_id`, copy the global care_guide_data and apply their edits, repoint all the home's `inventory_items` rows at the fork. Going forward: no auto-updates, no "Updated" chip, search returns the fork for that home. |
| Reset to catalogue | **"Reset to catalogue" button** appears on AI plants with `home_id = your home_id` (i.e. forks). Confirm modal warns "Your edits will be lost, this plant will rejoin automatic updates". On confirm: find the global parent via `forked_from_plant_id`, repoint inventory_items back to the global row, delete the fork row, seed `user_plant_ack` at the current global version so the user only sees future updates. |
| Manual "Refresh now" button | **Keep it, Sage+ only, rate-limited.** Tappable on global AI plants in Plant Edit Modal. Calls Gemini, diffs vs current global row, applies changes if any (just like the cron would), resets `last_freshness_check_at = now()`. Costs against the user's AI quota since it's an opt-in extra. Rate-limited to once per user per plant per week. Hidden for forks (since they're detached). |
| Adding existing catalogue plant — tier gate? | **Stays tier-gated.** Even though adding a pre-cached plant has zero AI cost, the AI tab itself remains Sage / Evergreen only. Keeps consistency + simpler gating logic. |
| "Used by N users" counter | **Skip for now.** Not in initial scope. |
| Schema evolution (new field added later) | **Treat additions as changes.** If `CARE_GUIDE_SCHEMA` grows and the regeneration fills a new field, that counts as a diff → chip shows → field highlights. This means every plant sees one "fields added" update the first time the cron processes it after the schema grows. Acceptable trade-off. |
| Batch size + cadence | **Daily cron, batch size = 25 (configurable).** Stored as an env var (`STALE_CHECK_BATCH_SIZE`) on the edge function so we can bump without code changes. |

---

## 3. Current state

### Data model

- `plants.id` is **integer (auto)**, not uuid.
- `plants.home_id` is **already nullable**. The Perenual provider pattern (`source = 'api'`) inserts rows with `home_id = NULL` and they're globally readable via existing RLS:
  ```sql
  USING (home_id IS NULL OR home_id IN (members))
  ```
  Today's AI source (`'ai'`) instead inserts a row scoped to the calling user's home, so two users adding "tomato" end up with **two separate `plants` rows** — exactly the duplication we want to eliminate.
- `plants.source` constraint allows `'manual' | 'api' | 'ai' | 'verdantly'`.
- AI care guide payload today lives in `plants.data` jsonb (legacy mixed schema) plus scattered top-level columns (sunlight, watering, etc.).

### AI care-guide cache today

- `supabase/functions/plant-doctor/index.ts` action `generate_care_guide` uses a string-keyed cache (`cacheKey("care_guide", cleanName, hemisphere)`) with a **30-day TTL** via `setCached` / `getCached`.
- The cache is NOT linked to the `plants` table — it's a separate AI-response cache.
- After TTL expires, the next request regenerates from scratch with no comparison.
- `purge-stale-species-cache` cron (weekly) clears expired entries.
- This is the layer we're replacing.

### UI today (relevant surfaces)

- [The Shed](../app-reference/03-garden-hub/01-the-shed.md) — grid of plant cards from `useCachedShed(homeId)`.
- [Plant Edit Modal](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — "Care" tab shows care fields, has a "Refresh from provider" button.
- [Instance Edit Modal](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — "Care Guide" tab fetches AI care guide on demand for AI-source plants.
- [Bulk Search Modal](../app-reference/08-modals-and-overlays/04-bulk-search-modal.md) — three-tab provider search (Perenual / Verdantly / AI).
- [Plant Source Picker](../app-reference/08-modals-and-overlays/03-plant-source-picker.md) — multi-plant provider chooser (Plan Staging Phase 2).
- [Plant Search Modal](../app-reference/08-modals-and-overlays/05-plant-search-modal.md) — single-plant search.

---

## 4. Proposed architecture

### High-level diagram

```
AI search ──────► search-plants-ai edge fn
                    │
                    ├── Step 1: Generate candidate list (Gemini, cheap)
                    ├── Step 2: For each candidate, look up in plants by
                    │            (source='ai' AND home_id IS NULL AND
                    │             scientific_name_key = normalised(candidate))
                    │   ├── HIT  → return reusable record + cached care guide
                    │   └── MISS → return as "new" — care guide generated only
                    │              if user picks this candidate
                    └── Return mixed list with `db_hit: boolean`

User picks candidate ─► add-ai-plant edge fn (NEW)
                         │
                         ├── If db_hit: insert inventory_items pointing at existing plant
                         └── If new:    generate_care_guide → insert plants row
                                        with home_id = NULL → insert inventory_items

Stale-check cron (daily) ─► refresh-stale-ai-plants edge fn (NEW)
                              │
                              ├── Find plants where source='ai' AND
                              │   last_freshness_check_at < NOW() - INTERVAL '90 days'
                              ├── Batch (e.g. 50 per run) to spread cost
                              ├── For each: re-call generate_care_guide
                              ├── Diff vs current plants.care_guide_data
                              ├── If changed:
                              │   ├── Insert plant_care_revisions row with diff
                              │   ├── Update care guide fields + bump freshness_version
                              │   └── Set updated_care_fields jsonb (which fields changed)
                              └── Always update last_freshness_check_at

Client app ─► useCachedShed + new useAiPlantFreshness hook
              │
              ├── Realtime subscribes to plants table → refetch on change
              ├── Subscribes to user_plant_ack for current user
              └── Renders "Updated" chip when
                  plants.freshness_version > user_plant_ack.seen_version
```

---

## 5. Database schema changes

### New columns on `plants`

```sql
ALTER TABLE plants
  ADD COLUMN scientific_name_key     text,
  ADD COLUMN care_guide_data         jsonb,
  ADD COLUMN updated_care_fields     jsonb,
  ADD COLUMN freshness_version       int    NOT NULL DEFAULT 1,
  ADD COLUMN last_freshness_check_at timestamptz,
  ADD COLUMN last_care_generated_at  timestamptz,
  ADD COLUMN forked_from_plant_id    integer REFERENCES plants(id) ON DELETE SET NULL,
  ADD COLUMN overridden_fields       jsonb;
```

| Column | Purpose |
|--------|---------|
| `scientific_name_key` | Lowercased, trimmed, whitespace-collapsed first entry of `scientific_name`. Used for dedup lookup. Indexed. |
| `care_guide_data` | Structured AI care guide payload (the schema currently in `CARE_GUIDE_SCHEMA`). Separate from `data` (legacy mixed schema) so the new field is clean. |
| `updated_care_fields` | jsonb array of field names that changed in the most recent freshness check. Cleared when the next check finds no changes. Used by the UI to know which fields to highlight. |
| `freshness_version` | Bumps each time `care_guide_data` changes. Drives the per-user chip. Starts at 1 on insert. |
| `last_freshness_check_at` | When the stale-check cron last evaluated this row. Drives the 90-day filter. NULL on forks (cron skips them). |
| `last_care_generated_at` | When the care guide was originally / most recently generated (vs. just checked). Shown to the user as "Care guide refreshed N days ago". |
| `forked_from_plant_id` | If this row is a home-scoped override, points at the global parent. NULL for global rows or pre-fork legacy plants. Used by the "Reset to catalogue" button to find the parent to repoint to. |
| `overridden_fields` | jsonb array of field names the user explicitly edited when forking. Used in the Plant Edit Modal to show which fields are "your overrides" vs "inherited from catalogue". NULL for global rows. |

### Unique indexes for dedup

```sql
-- Global catalogue: at most one AI row per species (no overrides).
CREATE UNIQUE INDEX plants_ai_global_dedup_idx
  ON plants (scientific_name_key)
  WHERE source = 'ai' AND home_id IS NULL AND scientific_name_key IS NOT NULL;

-- Per-home override: at most one fork per (home, species).
CREATE UNIQUE INDEX plants_ai_home_fork_dedup_idx
  ON plants (home_id, scientific_name_key)
  WHERE source = 'ai' AND home_id IS NOT NULL AND scientific_name_key IS NOT NULL;
```

The global index guarantees the catalogue stays deduped. The per-home index guarantees a home can have at most one fork of a given species (you can't accidentally double-fork the same plant).

### New table: `plant_care_revisions`

```sql
CREATE TABLE plant_care_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id        integer NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  version         int     NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  source          text    NOT NULL CHECK (source IN ('initial', 'stale_check', 'manual_refresh')),
  care_guide_data jsonb   NOT NULL,
  changed_fields  jsonb,                 -- array of field names that changed vs. previous version
  diff_summary    jsonb,                 -- per-field {before, after} for changed structured fields
  triggered_by    uuid REFERENCES auth.users(id),  -- null for cron, set for manual refresh
  UNIQUE (plant_id, version)
);

CREATE INDEX plant_care_revisions_plant_id_idx ON plant_care_revisions(plant_id);
```

The full history of every care guide change for every AI plant. Future-proofs:
- "Show me the old version" UI.
- Rollback if a regeneration goes wrong.
- Analytics on which fields drift most.

### New table: `user_plant_ack`

```sql
CREATE TABLE user_plant_ack (
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id             integer NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  seen_freshness_version int NOT NULL DEFAULT 0,
  acked_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plant_id)
);

CREATE INDEX user_plant_ack_plant_id_idx ON user_plant_ack(plant_id);
```

Per-user "I've seen version N of plant X's care guide". When `plants.freshness_version > user_plant_ack.seen_freshness_version`, the user sees the "Updated" chip. On acknowledge, we upsert the row with `seen_freshness_version = plants.freshness_version`.

A user has an ack row only for plants they've interacted with. Missing row = treated as `seen_freshness_version = 0`. Adding a plant to your shed seeds a row with the current version (so you don't immediately see "Updated" on your fresh add).

### Migration files

1. `2026MMDD000000_ai_plant_overhaul_schema.sql` — add columns + indexes + new tables.
2. `2026MMDD000001_ai_plant_overhaul_rls.sql` — RLS for new tables + tightened policies on AI plants.
3. `2026MMDD000002_ai_plant_overhaul_backfill.sql` — backfill `scientific_name_key`, `last_care_generated_at`, dedupe existing AI rows. See section 13.

---

## 6. Edge function changes

### Modified: `plant-doctor` action `search_plants_text`

After Gemini returns candidate names, perform a two-stage dedup lookup. The home's own fork takes precedence over the global catalogue:

```ts
const candidates = parsedAiResults.matches;  // [{ common_name, scientific_name, ... }]
const keys = candidates
  .map(c => normaliseScientificKey(c.scientific_name?.[0] ?? c.common_name))
  .filter(Boolean);

// Stage 1: home forks for this caller (if homeId provided)
const homeForks = homeId
  ? await supabase.from("plants")
      .select("id, common_name, scientific_name, care_guide_data, freshness_version, last_care_generated_at, scientific_name_key, forked_from_plant_id, overridden_fields")
      .eq("source", "ai")
      .eq("home_id", homeId)
      .in("scientific_name_key", keys)
  : { data: [] };

// Stage 2: global catalogue (for keys not matched by a fork)
const matchedKeys = new Set(homeForks.data?.map(p => p.scientific_name_key) ?? []);
const remainingKeys = keys.filter(k => !matchedKeys.has(k));

const globals = remainingKeys.length
  ? await supabase.from("plants")
      .select("id, common_name, scientific_name, care_guide_data, freshness_version, last_care_generated_at, scientific_name_key")
      .eq("source", "ai")
      .is("home_id", null)
      .in("scientific_name_key", remainingKeys)
  : { data: [] };

const byKey = new Map<string, any>();
homeForks.data?.forEach(p => byKey.set(p.scientific_name_key, { ...p, hit_kind: "home_fork" }));
globals.data?.forEach(p => byKey.set(p.scientific_name_key, { ...p, hit_kind: "global" }));

const enriched = candidates.map(c => {
  const key = normaliseScientificKey(c.scientific_name?.[0] ?? c.common_name);
  const hit = byKey.get(key);
  return {
    ...c,
    db_hit: !!hit,
    db_hit_kind: hit?.hit_kind ?? null,            // "home_fork" | "global" | null
    db_plant_id: hit?.id ?? null,
    care_guide_data: hit?.care_guide_data ?? null,
    last_care_generated_at: hit?.last_care_generated_at ?? null,
    freshness_version: hit?.freshness_version ?? null,
    overridden_fields: hit?.overridden_fields ?? null,
  };
});
```

Returns the existing list shape augmented with `db_hit` + `db_hit_kind` + `db_plant_id` + pre-filled care data. The frontend shows:
- **`home_fork`** → "Your custom version" pill (this home has overridden this plant).
- **`global`** → "In catalogue" pill (someone else already added it).
- **null** → no pill, will trigger generation on pick.

Picking either kind skips the `generate_care_guide` call.

### Modified: `plant-doctor` action `generate_care_guide`

When called for an AI plant that the user is about to add:

1. Check if a global record with this `scientific_name_key` already exists.
   - If yes: return its `care_guide_data` directly. No Gemini call.
2. If no: call Gemini as today, but on success **also** insert into `plants` with `home_id = NULL`, `source = 'ai'`, populate `care_guide_data`, `last_care_generated_at = now()`, `freshness_version = 1`.
3. Insert an initial `plant_care_revisions` row with `source = 'initial'`.
4. Drop the old string-keyed `setCached` call — the canonical store is now `plants.care_guide_data`.

### NEW: `add-ai-plant-to-shed` edge function (or extend existing)

A single canonical "add this AI plant to my shed" entry point that:

1. Resolves the global plant row (dedup-aware).
2. Creates the `inventory_items` row for the caller's home.
3. Upserts `user_plant_ack` for `(auth.uid(), plant_id)` with `seen_freshness_version = plants.freshness_version`.

This avoids race conditions where two clients try to insert the same global plant simultaneously.

> **Implementation note:** depending on existing client structure, this might be a new RPC (`add_ai_plant_to_shed(plant_payload, area_id, ...)`) rather than a new edge function. Either works; an RPC keeps it in Postgres and avoids a network hop.

### NEW: `refresh-stale-ai-plants` edge function

Runs via cron (see section 7). Pseudocode:

```ts
const BATCH_SIZE = Number(Deno.env.get("STALE_CHECK_BATCH_SIZE") ?? 25);

const { data: stale } = await supabase
  .from("plants")
  .select("id, common_name, scientific_name, care_guide_data, freshness_version, last_freshness_check_at")
  .eq("source", "ai")
  .is("home_id", null)                        // global rows only — forks are skipped
  .or(`last_freshness_check_at.is.null,last_freshness_check_at.lt.${ninetyDaysAgo}`)
  .order("last_freshness_check_at", { ascending: true, nullsFirst: true })
  .limit(BATCH_SIZE);

for (const plant of stale ?? []) {
  const { plantData: newData } = await generateCareGuide(plant.common_name);
  const { changed, diff } = diffCareGuide(plant.care_guide_data, newData);

  if (changed) {
    const newVersion = plant.freshness_version + 1;
    await supabase.from("plant_care_revisions").insert({
      plant_id: plant.id,
      version: newVersion,
      source: "stale_check",
      care_guide_data: newData,
      changed_fields: diff.fieldNames,
      diff_summary: diff.perField,
    });
    await supabase.from("plants").update({
      care_guide_data: newData,
      updated_care_fields: diff.fieldNames,
      freshness_version: newVersion,
      last_freshness_check_at: nowIso,
      last_care_generated_at: nowIso,
    }).eq("id", plant.id);
  } else {
    await supabase.from("plants").update({
      last_freshness_check_at: nowIso,
    }).eq("id", plant.id);
  }
}
```

Important details:
- **Forks are skipped.** The `is("home_id", null)` filter means home-scoped overrides are never touched by the cron — they keep whatever care_guide_data the home edited to.
- **Configurable batch size.** Reads `STALE_CHECK_BATCH_SIZE` env var (default 25). Bumping for cost-tuning is a Supabase env change, no code redeploy.
- **No per-user attribution.** AI usage logs (`ai_calls`) for the regeneration use a sentinel `user_id = NULL` and `home_id = NULL` so cost lands against "system" not a user.
- **Idempotent.** If the function crashes mid-batch, the next run picks up the unprocessed plants because `last_freshness_check_at` was only updated on success.
- **Rate-limit aware.** Sleep ~1s between Gemini calls to stay under provider limits.

### NEW: `fork_ai_plant_for_home` RPC

Called when a user saves edits to an AI plant in Plant Edit Modal (after they confirm the "you'll stop getting updates" modal). Pseudocode:

```sql
CREATE OR REPLACE FUNCTION fork_ai_plant_for_home(
  p_plant_id integer,
  p_home_id  uuid,
  p_edits    jsonb,                    -- partial care_guide_data overrides
  p_overridden_fields jsonb            -- array of field names the user changed
)
RETURNS integer                          -- the new fork's plant_id
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  parent plants%ROWTYPE;
  fork_id integer;
BEGIN
  -- Caller must be a member of the home
  IF NOT EXISTS (SELECT 1 FROM home_members WHERE home_id = p_home_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_a_home_member';
  END IF;

  SELECT * INTO parent FROM plants WHERE id = p_plant_id;
  IF NOT FOUND OR parent.source != 'ai' OR parent.home_id IS NOT NULL THEN
    RAISE EXCEPTION 'not_a_global_ai_plant';
  END IF;

  -- Insert the fork
  INSERT INTO plants (
    common_name, scientific_name, source, home_id,
    scientific_name_key, care_guide_data, freshness_version,
    last_care_generated_at, forked_from_plant_id, overridden_fields,
    -- copy other display fields:
    image_url, thumbnail_url, sunlight, watering, cycle,
    hardiness_min, hardiness_max, is_edible, is_toxic_pets, is_toxic_humans,
    description, maintenance_notes
  )
  SELECT
    parent.common_name, parent.scientific_name, 'ai', p_home_id,
    parent.scientific_name_key,
    parent.care_guide_data || p_edits,        -- jsonb merge: edits override
    1,                                          -- new fork starts at version 1
    parent.last_care_generated_at,
    parent.id,
    p_overridden_fields,
    parent.image_url, parent.thumbnail_url, parent.sunlight, parent.watering, parent.cycle,
    parent.hardiness_min, parent.hardiness_max, parent.is_edible, parent.is_toxic_pets, parent.is_toxic_humans,
    parent.description, parent.maintenance_notes
  RETURNING id INTO fork_id;

  -- Repoint this home's inventory rows from the global parent to the fork
  UPDATE inventory_items
    SET plant_id = fork_id
    WHERE home_id = p_home_id AND plant_id = p_plant_id;

  RETURN fork_id;
END;
$$;
```

The `SECURITY DEFINER` lets the function bypass the dedup unique index race conditions atomically.

### NEW: `reset_ai_plant_fork` RPC

Called from the "Reset to catalogue" button. Pseudocode:

```sql
CREATE OR REPLACE FUNCTION reset_ai_plant_fork(p_fork_id integer)
RETURNS integer                                -- the global parent's plant_id
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  fork plants%ROWTYPE;
  parent_id integer;
BEGIN
  SELECT * INTO fork FROM plants WHERE id = p_fork_id;
  IF NOT FOUND OR fork.source != 'ai' OR fork.home_id IS NULL THEN
    RAISE EXCEPTION 'not_a_fork';
  END IF;

  -- Caller must be a member of the fork's home
  IF NOT EXISTS (SELECT 1 FROM home_members WHERE home_id = fork.home_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_a_home_member';
  END IF;

  parent_id := fork.forked_from_plant_id;
  IF parent_id IS NULL THEN
    -- Edge case: forked_from missing (e.g. parent was deleted). Re-find by key.
    SELECT id INTO parent_id FROM plants
      WHERE source = 'ai' AND home_id IS NULL
        AND scientific_name_key = fork.scientific_name_key;
    IF parent_id IS NULL THEN
      RAISE EXCEPTION 'no_global_parent_available';
    END IF;
  END IF;

  -- Repoint inventory back to parent
  UPDATE inventory_items
    SET plant_id = parent_id
    WHERE home_id = fork.home_id AND plant_id = p_fork_id;

  -- Seed acks for every user in the home so no chip appears immediately on rejoin
  INSERT INTO user_plant_ack (user_id, plant_id, seen_freshness_version)
  SELECT hm.user_id, parent_id, (SELECT freshness_version FROM plants WHERE id = parent_id)
  FROM home_members hm
  WHERE hm.home_id = fork.home_id
  ON CONFLICT (user_id, plant_id) DO UPDATE
  SET seen_freshness_version = EXCLUDED.seen_freshness_version;

  DELETE FROM plants WHERE id = p_fork_id;

  RETURN parent_id;
END;
$$;
```

### NEW: `manual_refresh_ai_plant` edge function

Called from the Sage+ "Refresh now" button. Pseudocode:

```ts
// Auth check + tier check (ai_enabled = true)
// Rate-limit check: has this user already refreshed this plant this week?
const lastRefresh = await fetchUserManualRefresh(userId, plantId);
if (lastRefresh && lastRefresh > weekAgo) {
  return { error: "rate_limited", retry_after: ... };
}

// Same logic as the cron, scoped to one plant
const plant = await fetchPlant(plantId);
if (plant.home_id !== null) throw new Error("forks can't be manually refreshed");

const { plantData: newData } = await generateCareGuide(plant.common_name);
const { changed, diff } = diffCareGuide(plant.care_guide_data, newData);

if (changed) {
  // ... same insert into plant_care_revisions + update plants as cron
} else {
  // Just reset last_freshness_check_at
}

await logUserManualRefresh(userId, plantId);
await logAiUsage(...);   // user-attributed (consumes their AI quota)
```

Rate-limit table:

```sql
CREATE TABLE ai_plant_manual_refresh_log (
  user_id    uuid NOT NULL,
  plant_id   integer NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plant_id, refreshed_at)
);
```

Server-side query: "any row with `refreshed_at > now() - interval '7 days'`" → rate-limited.

### NEW: `lib/careGuideDiff.ts` (shared by edge fn + client)

A pure diff function that knows the care guide schema:

```ts
const STRUCTURED_FIELDS = [
  "cycle", "watering", "watering_period",
  "sunlight",   // array
  "hardiness_min", "hardiness_max",
  "care_level", "growth_rate",
  "is_edible", "is_toxic_pets", "is_toxic_humans",
  "harvest_months", "pruning_months", "flowering_months",  // arrays
  "soil_type", "ph_min", "ph_max",
  // ... full schema
] as const;

const FREE_TEXT_FIELDS = ["description", "maintenance_notes", "propagation"] as const;

export function diffCareGuide(oldData, newData) {
  // Per-field structural compare (array/scalar) on STRUCTURED_FIELDS.
  // Whole-field "changed yes/no" on FREE_TEXT_FIELDS (no word-diff).
  // Returns { fieldNames: string[], perField: { [field]: { before, after } } }.
}
```

Lives in `src/lib/careGuideDiff.ts` (client) AND `supabase/functions/_shared/careGuideDiff.ts` (edge). Either duplicate the file or share via the `_shared` pattern.

---

## 7. Cron jobs

### NEW: `refresh-stale-ai-plants` cron

- **Cadence**: daily, off-peak (e.g. 03:00 UTC).
- **Function**: `refresh-stale-ai-plants` (above).
- **Failure handling**: writes a row to `cron_run_logs` (or whatever existing pattern is used); doesn't retry on failure (next day will pick up the unprocessed plants).
- **Monitoring**: Sentry capture on uncaught errors; Audit Log surfaces `ai_calls` so we can watch cost.

### Update: `purge-stale-species-cache` cron

- Still useful for the legacy string-keyed cache (other AI cache categories still use it).
- No longer responsible for care guides (which now live on `plants` and don't expire).

---

## 8. Client-side changes

### 8.1. `useCachedShed` hook

Current: returns `plants` joined with `inventory_items` for the user's home.

New behaviour:
- Joins `user_plant_ack` for `auth.uid()` on every plant row.
- Computes `has_care_update: plants.freshness_version > (user_plant_ack.seen_freshness_version ?? 0)` client-side.
- Subscribes to realtime channel for `plants` table — refetches when any plant in the shed has its `freshness_version` change.

### 8.2. NEW: `useAiPlantFreshness` hook

```ts
function useAiPlantFreshness(plantIds: number[]) {
  // Returns Map<plant_id, {
  //   freshness_version: number,
  //   seen_version: number,
  //   updated_care_fields: string[],
  //   has_update: boolean,
  //   acknowledge: () => Promise<void>,
  // }>
}
```

Used by Plant Edit Modal + Instance Edit Modal + Shed grid. `acknowledge()` upserts `user_plant_ack`.

### 8.3. NEW: `<CareGuideField>` and `<UpdatedChip>` components

```tsx
<UpdatedChip count={3} onClick={openChangedFields} />  // "3 fields updated"

<CareGuideField
  fieldName="watering"
  value={currentValue}
  isChanged={updatedFields.includes("watering")}
  previousValue={diffSummary?.watering?.before}
/>
// Renders the field with a yellow background + small "Updated" pill + tooltip
// showing the previous value.
```

Shared between Plant Edit Modal Care tab and Instance Edit Modal Care Guide tab.

### 8.4. AI search results

Both [Bulk Search Modal](../app-reference/08-modals-and-overlays/04-bulk-search-modal.md) AI tab AND [Plant Source Picker](../app-reference/08-modals-and-overlays/03-plant-source-picker.md) AI tab need to:

- Surface `db_hit` from the edge function as an "Already in catalogue" pill on the card.
- When the user picks a `db_hit` candidate, skip the `generate_care_guide` call and go straight to adding.
- Optionally show "Used by N users" if we add a denormalised counter (see open questions).

### 8.5. The Shed grid

- Plant card gets a small "Updated" badge in the top-right when `has_care_update` is true.
- Hover/tap on the badge → tooltip "Care info refreshed — open to review".

### 8.6. Plant Edit Modal — Care tab

State branches based on the plant's row identity:

**Case A — Global AI plant (`home_id IS NULL`, `forked_from_plant_id IS NULL`):**
- Header pill: "Care guide refreshed N days ago" (`last_care_generated_at`).
- Source chip: "AI · Auto-updating catalogue".
- If `has_update`: yellow callout at the top "Care guide updated — N fields changed since your last view". "Mark as reviewed" button.
- Each `<CareGuideField>` with a changed field renders with the yellow highlight + previous-value tooltip.
- **"Refresh now" button** (Sage+ only, rate-limited): calls `manual_refresh_ai_plant` edge fn. Disabled with tooltip if already refreshed this week.
- **Edit + Save flow:**
  1. User edits one or more care fields → "Save" button enables.
  2. On tap → `<DetachConfirmModal>` opens:
     > **Editing this plant will stop automatic care-guide updates.**
     > Rhozly periodically refreshes AI plant care guides with the latest information. If you edit this plant's care data, your home will keep the values you set and won't receive future updates for it. You can reset it later to rejoin automatic updates (your edits would be lost).
     >
     > [Cancel] [Save my edits]
  3. On confirm → call `fork_ai_plant_for_home` RPC with the edits + the list of fields the user touched.
  4. On success: modal refreshes with the new fork row. Source chip changes to "AI · Custom (your home's edits)".

**Case B — Home fork (`home_id = your home_id`, `source = 'ai'`):**
- Header pill: "Custom care guide · forked on YYYY-MM-DD".
- Source chip: "AI · Custom (your home's edits)".
- Per-field indicator: fields in `overridden_fields` get a small "✎ Overridden" badge next to their label. Other fields show "From catalogue" subtly.
- No "Updated" chip (cron skips forks).
- **No "Refresh now"** (you've opted out of automatic updates).
- **"Reset to catalogue" button** at the bottom:
  1. On tap → `<ResetConfirmModal>` opens:
     > **Reset to the Rhozly AI catalogue?**
     > Your custom edits to this plant's care guide will be lost. The plant will rejoin the auto-updating catalogue and your home will receive future updates again.
     >
     > [Cancel] [Reset and rejoin]
  2. On confirm → call `reset_ai_plant_fork` RPC.
  3. On success: modal refreshes — now showing the global parent (Case A). `user_plant_ack` is seeded at the parent's current `freshness_version` so no chip flashes.

**Case C — Non-AI plant (`source != 'ai'`):** unchanged from today (no chip, no detach modal, normal save path).

### 8.7. Instance Edit Modal — Care Guide tab

- Same chip + highlighting as Plant Edit Modal.
- "Mark as reviewed" syncs across all instances of the same plant for this user (because the ack is per-plant, not per-instance).
- Editing care fields from the instance modal triggers the same detach flow.
- Reset is only available from the parent Plant Edit Modal, not the per-instance view (the fork is plant-level, not instance-level — clearer single entry point).

---

## 9. RLS changes

### `plants` policies — tighten AI updates

Today's update policy lets any authenticated user update any plant with `home_id IS NULL`. That's fine for Perenual rows that the user controls in their home, but **dangerous for our new global AI rows** — we don't want user A's stray UPDATE to overwrite the cache.

New update policy:

```sql
DROP POLICY IF EXISTS "Users can update plants for their homes" ON plants;

-- Users can only update plants for their own home (no longer allows NULL home).
CREATE POLICY "Users can update home plants only"
  ON plants
  FOR UPDATE
  TO authenticated
  USING (
    home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
  );

-- Service role bypasses RLS, so refresh-stale-ai-plants can still update.
```

This may impact existing logic that updates `home_id IS NULL` rows (e.g. for Perenual). We need to audit and verify nothing legitimate breaks. If something does, route it through a service-role RPC.

### `plants` insert policy — leave permissive for AI

Authenticated users can still insert `home_id = NULL` rows (needed for the "first user to add tomato seeds the global catalogue" flow). The dedup unique index prevents abuse; further server-side validation in `add-ai-plant-to-shed` RPC.

### `plant_care_revisions` policies

```sql
ALTER TABLE plant_care_revisions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read revisions (just like plants).
CREATE POLICY "Read all care revisions"
  ON plant_care_revisions
  FOR SELECT
  TO authenticated
  USING (
    -- Same gate as plants: global or in user's home.
    plant_id IN (
      SELECT id FROM plants
       WHERE home_id IS NULL
          OR home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid())
    )
  );

-- Inserts: service role only (cron) + the manual-refresh edge fn.
-- No INSERT/UPDATE/DELETE policies for authenticated → blocked by default.
```

### `user_plant_ack` policies

```sql
ALTER TABLE user_plant_ack ENABLE ROW LEVEL SECURITY;

-- Per-user scoped.
CREATE POLICY "Own ack rows" ON user_plant_ack
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

## 10. Cache invalidation flow (end-to-end walkthrough)

**Scenario:** User A has "Tomato" in their shed. The stale-check cron has just regenerated the care guide and updated 3 fields (watering, sunlight, hardiness_min).

```
1. Cron updates plants row:
   freshness_version: 1 → 2
   updated_care_fields: ["watering", "sunlight", "hardiness_min"]
   last_care_generated_at: now

2. Realtime broadcasts plants UPDATE event to all connected clients.

3. User A's browser receives the event via useCachedShed subscription.
   - useCachedShed refetches plant rows + user_plant_ack join.
   - Tomato now has freshness_version=2, seen_version=1 → has_update=true.
   - The Shed grid re-renders showing a yellow "Updated" badge on the Tomato card.

4. User A taps the Tomato → Plant Edit Modal opens.
   - Care tab header shows: "Care guide updated — 3 fields changed since your last view"
   - watering, sunlight, hardiness_min cells have yellow backgrounds + "Updated" pill
   - Tooltip on each shows the previous value (from diff_summary in latest plant_care_revisions row)

5. User A reads the changes, taps "Mark as reviewed".
   - useAiPlantFreshness.acknowledge() upserts user_plant_ack
     (user_id=A, plant_id=tomato_id, seen_freshness_version=2)
   - useCachedShed receives the update via user_plant_ack realtime channel
   - has_update flips to false everywhere (Shed, Plant Edit, all instances of Tomato)

6. User B logs in. They also have Tomato in their shed but haven't seen v2 yet.
   - Their useCachedShed query sees their own user_plant_ack (seen=1)
   - Their Shed shows "Updated" chip on Tomato — independently of A's ack.
```

---

## 11. Realtime channels

| Channel | Purpose | Subscriber |
|---------|---------|-----------|
| `plants` (existing? confirm) | Catch `freshness_version` bumps | `useCachedShed`, `useAiPlantFreshness` |
| `user_plant_ack` (NEW) | Catch the user's own acks (sync across tabs/devices) | Same hooks |

If `plants` realtime isn't enabled today, add it in the migration (`alter publication supabase_realtime add table plants`).

---

## 12. Migration & rollout plan

Six waves, each independently deployable and rollback-safe.

### Wave 1 — Schema (no behaviour change)
- Migration: add columns to `plants` (incl. `forked_from_plant_id`, `overridden_fields`) + new tables (`plant_care_revisions`, `user_plant_ack`, `ai_plant_manual_refresh_log`) + both unique indexes.
- Migration: tighten RLS on `plants` UPDATE (verify Perenual flows still work — service-role bypass for the cron).
- Migration: enable realtime on `plants` and `user_plant_ack`.
- Add the two RPCs (`fork_ai_plant_for_home`, `reset_ai_plant_fork`) as `SECURITY DEFINER` functions.
- No client code changes yet — existing flows still work because new columns are nullable and old paths are untouched.

### Wave 2 — Edge function logic
- Update `plant-doctor` `generate_care_guide` to read/write `plants.care_guide_data` and insert global rows with `home_id = NULL`.
- Update `plant-doctor` `search_plants_text` to dedup + enrich with `db_hit_kind` (home_fork / global / null).
- Add `manual_refresh_ai_plant` edge function (Sage+, rate-limited).
- Existing 30-day TTL cache continues to work as a transitional fallback.

### Wave 3 — Client UI for hit-detection + reuse  *(shipped)*

Shipped in commit `<wave3-commit>` (date 2026-05-20). Scope delivered:

- `PlantDoctorService.searchPlantsText` / `generateCareGuide` typed via new
  `CatalogueHit` + `CareGuideResponse` interfaces (see [src/services/plantDoctorService.ts](../../src/services/plantDoctorService.ts)).
- `PlantDetails` (in [src/lib/verdantlyUtils.ts](../../src/lib/verdantlyUtils.ts)) gains optional
  `db_plant_id`, `freshness_version`, `from_catalogue` fields.
- `ProviderSearchResult` (same file) gains optional `catalogue_hit` for AI
  search results, populated by `searchAllProviders` in
  [src/lib/plantProvider.ts](../../src/lib/plantProvider.ts).
- **BulkSearchModal** ([src/components/BulkSearchModal.tsx](../../src/components/BulkSearchModal.tsx)) —
  captures the `hits` map from `searchPlantsText` and renders an "In
  catalogue" / "Your custom version" pill on AI matches. The bulk fetcher
  forwards `db_plant_id` into the details cache.
- **PlantSourcePicker** ([src/components/PlantSourcePicker.tsx](../../src/components/PlantSourcePicker.tsx)) —
  per-name search now stores `aiHits` alongside `ai` so the pill renders on
  any AI candidate that matched the catalogue. Care-guide prefetch forwards
  `db_plant_id` too.
- **PlantSearchModal** ([src/components/PlantSearchModal.tsx](../../src/components/PlantSearchModal.tsx)) —
  the single-result rows show the same pill via the new `catalogue_hit`
  field on the merged result. Preview path forwards `db_plant_id` onto
  `previewPlant` (the single-plant add-to-shed branch for AI is still a
  pre-existing gap and is not part of Wave 3).
- **TheShed bulk-add** ([src/components/TheShed.tsx](../../src/components/TheShed.tsx)) — when
  `preloadedDetails.db_plant_id` is present, the home-scoped `plants` row
  inserted for the AI plant now also records `forked_from_plant_id =
  db_plant_id` and `overridden_fields = []`. This marks the row as a
  *shallow fork* (no user edits yet) so Wave 4+ can detect and collapse
  these into pure `inventory_items` references against the global parent.

Not in Wave 3 (kept for Wave 5):
- `useAiPlantFreshness` hook. (Doc'd in §9 as Wave 5 work — needs the
  realtime + freshness UI in Plant Edit / Instance Edit modals to land
  alongside it. Adding the hook alone would create dead code.)

Manual smoke test (deferred to staging — local DB has no second home):
User A adds tomato → User B (different home) searches → sees "In
catalogue" pill → adds → zero Gemini calls fire (verified by absence of
new `ai_calls` row for `action = "generate_care_guide"`).

### Wave 4 — Stale-check cron + revision history  *(shipped)*

Shipped on 2026-05-20. Scope delivered:

- **Edge function** [supabase/functions/refresh-stale-ai-plants/index.ts](../../supabase/functions/refresh-stale-ai-plants/index.ts) — daily cron, batched, system-attributed AI usage. Same `CARE_GUIDE_SCHEMA` (enum-constrained seasons/months) as `manual-refresh-ai-plant`. Per-plant try/catch isolates failures.
- **Shared logic** [supabase/functions/_shared/refreshStaleAiPlants.ts](../../supabase/functions/_shared/refreshStaleAiPlants.ts) — pure-ish function that takes a Gemini caller stub, so it's unit-testable without touching the network.
- **Cron migration** [supabase/migrations/20260621000000_refresh_stale_ai_plants_cron.sql](../../supabase/migrations/20260621000000_refresh_stale_ai_plants_cron.sql) — `pg_cron` schedule at 03:00 UTC, named `refresh-stale-ai-plants-daily`. Verified on local DB.
- **Backfill migration** [supabase/migrations/20260621000100_ai_plant_overhaul_wave4_backfill.sql](../../supabase/migrations/20260621000100_ai_plant_overhaul_wave4_backfill.sql) — seeds `last_care_generated_at` from `created_at` for existing global AI rows.
- **Deno tests** [supabase/tests/refreshStaleAiPlants.test.ts](../../supabase/tests/refreshStaleAiPlants.test.ts) — 5/5 passing: changed path, unchanged path, empty batch, mid-batch crash, batch-size cap.
- **Docs** — [edge-functions-catalogue](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md), [cron-jobs](../app-reference/99-cross-cutting/11-cron-jobs.md), [data-model-plants](../app-reference/99-cross-cutting/03-data-model-plants.md) all updated in this wave.

Behaviour notes recorded for future-self:
- `STALE_CHECK_BATCH_SIZE` env on the edge function — default 25, ramp from 10 on first prod runs.
- AI usage attribution: `{ userId: null, homeId: null }` — system, not any user's quota.
- `cron_run_logs` table doesn't exist in this stack — we log via `log(FN, "complete", summary)` to the function's own logs instead. Sentry capture on uncaught errors.

Deferred to later waves:
- **§13 Pass 2 backfill** (per-home duplicate collapse) — only meaningful once real prod data is seeded.
- **UI chips + per-field highlight** → Wave 5.
- **`useAiPlantFreshness` hook** → Wave 5 (so the hook + its consumers land together).

### Wave 5 — In-app freshness UI (read-only on AI plants)  *(shipped)*

Shipped on 2026-05-20. Scope delivered:

- **`useAiPlantFreshness` hook** [src/hooks/useAiPlantFreshness.ts](../../src/hooks/useAiPlantFreshness.ts) — resolves shallow forks via `forked_from_plant_id` so the chip's source of truth is always the global. Returns per-row `has_update` + an `acknowledge()` that upserts `user_plant_ack` against the global plant id. 7 unit tests (`tests/unit/hooks/useAiPlantFreshness.test.ts`) covering global, shallow fork, deep fork, non-AI, ack semantics, empty input, and missing-parent paths.
- **`<UpdatedChip>`** [src/components/aiPlants/UpdatedChip.tsx](../../src/components/aiPlants/UpdatedChip.tsx) — small yellow pill with click handler. 6 unit tests in `tests/unit/components/UpdatedChip.test.ts`.
- **`<CareUpdateCallout>`** [src/components/aiPlants/CareUpdateCallout.tsx](../../src/components/aiPlants/CareUpdateCallout.tsx) — yellow banner with field chips and "Mark as reviewed" + "View changes" actions. Field labels live in `FIELD_LABELS` here.
- **Shed card chip** in [src/components/TheShed.tsx](../../src/components/TheShed.tsx) — bottom-left of each card. Tapping opens the plant in Plant Edit Modal.
- **Plant Edit Modal Care tab** in [src/components/PlantEditModal.tsx](../../src/components/PlantEditModal.tsx) — callout at top + "Refresh now" button wired to `manual-refresh-ai-plant` edge fn (Sage+). Local 7-day rate-limit cache in `localStorage[rhozly_ai_refresh_<id>]`; edge fn enforces the truth.
- **Instance Edit Modal Care Guide tab** in [src/components/InstanceEditModal.tsx](../../src/components/InstanceEditModal.tsx) — same callout, ack syncs across all instances of the same plant for this user.
- **Seed + Playwright spec** — `supabase/seeds/13_ai_freshness.sql` seeds one global (`1000010`, v=2, `updated_care_fields=["sunlight","watering_min_days"]`) + a per-home shallow fork (`1000011`, substituted per worker by `scripts/seed-test-db.mjs`) + an ack at v=1. `tests/e2e/specs/ai-plant-freshness.spec.ts` exercises chip-visible → callout-visible → mark-reviewed-clears-chip.
- **Docs** — [the-shed](../app-reference/03-garden-hub/01-the-shed.md), [plant-edit-modal](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md), [instance-edit-modal](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md), [realtime](../app-reference/99-cross-cutting/15-realtime.md), [data-model-plants](../app-reference/99-cross-cutting/03-data-model-plants.md), and the deferred-work register in [ai-plant-overhaul-wave5.md](./ai-plant-overhaul-wave5.md).

Behaviour notes recorded:
- Realtime subscription on the globals table is **deferred** — `useHomeRealtime` filters by `home_id`, and globals have `home_id IS NULL`, so it wouldn't fire anyway. Wave 5 ships a fetch-on-mount model. Cross-device ack sync (acknowledging on phone clears chip on desktop instantly) is a Wave 7 enhancement.
- No per-field background highlight inside `ManualPlantCreation` — the callout lists changed fields as chips; we judged that sufficient for Wave 5. Per-field highlighting would require a form refactor that doesn't justify the cost yet.
- Pre-existing seed orchestration bug in `09_cross_home_markers.sql` (expects W2's home to exist mid-W1 pass) blocks fresh local `npm run test:seed` runs. Not caused by Wave 5; Wave 5's seed file works in isolation. Tracked as D7 in Wave 7's cleanup list.

Deferred to later waves (carry forward into Wave 7's register):
- Realtime sub on globals + `user_plant_ack` cross-device sync.
- Per-field background highlight inside the form.
- D2 / D3 / D4 / D6 from Wave 5's plan are unchanged (still owned by Wave 6 / 7).
- **D7 (new):** Seed script orchestration bug — `09_cross_home_markers.sql` references W2's home from W1's pass. Fix by either making it W2-only or running all bootstraps before all other seeds. Likely a 5-line fix in `scripts/seed-test-db.mjs`.

### Wave 6 — Override flow (detach-on-edit + reset)  *(shipped)*

Shipped on 2026-05-20. Scope delivered:

- **New RPC** [supabase/migrations/20260622000000_ai_plant_revert_in_place.sql](../../supabase/migrations/20260622000000_ai_plant_revert_in_place.sql) — `revert_ai_plant_fork_in_place(p_fork_id)`. SECURITY DEFINER with caller-membership check. Restores `care_guide_data` + editable top-level columns from the global parent, clears `overridden_fields`, syncs `freshness_version`, seeds `user_plant_ack`. Verified on local DB.
- **`<SourceChip>`** [src/components/aiPlants/SourceChip.tsx](../../src/components/aiPlants/SourceChip.tsx) — pill rendering "AI · Auto-updating catalogue" vs "AI · Custom (your edits)" based on `overridden_fields` emptiness. 5 unit tests.
- **`<DetachConfirmModal>`** [src/components/aiPlants/DetachConfirmModal.tsx](../../src/components/aiPlants/DetachConfirmModal.tsx) — warning before saving edits to a catalogue-tracking AI plant. Lists changed fields as chips. Cancel auto-focused so accidental Enter doesn't confirm.
- **`<ResetConfirmModal>`** [src/components/aiPlants/ResetConfirmModal.tsx](../../src/components/aiPlants/ResetConfirmModal.tsx) — warning before reset; calls `revert_ai_plant_fork_in_place` on confirm.
- **`diffOverriddenFields` + `mergeOverriddenFields`** [src/lib/aiPlantOverrides.ts](../../src/lib/aiPlantOverrides.ts) — pure helpers. Lowercase strings + sort arrays before comparison so cosmetic differences don't trigger detach. 12 unit tests.
- **PlantEditModal save interception** in [src/components/PlantEditModal.tsx](../../src/components/PlantEditModal.tsx) — `handleSaveWithOverride()` decides: detach-confirm flow / silent merge for custom forks / pass-through for non-AI. Reset button visible only on custom forks. Refresh-now button hidden on custom forks (already gated correctly in Wave 5).
- **Overridden-field summary strip** above the form on custom forks — purple panel listing humanised field names.
- **TheShed `handleUpdatePlant`** — no change needed; `overridden_fields` rides along in the existing `...cleanPayload` pass-through.
- **Seed extension** [supabase/seeds/13_ai_freshness.sql](../../supabase/seeds/13_ai_freshness.sql) — added Lavender (global 1000012 + custom fork 1000013) so the E2E has a pre-customised plant to reset.
- **Playwright spec** [tests/e2e/specs/ai-plant-override.spec.ts](../../tests/e2e/specs/ai-plant-override.spec.ts) — three flows: catalogue-tracking chip, custom-fork chip + Reset button, Reset modal cancel keeps state.

Design reconciliation recorded:
- The original §8.6 Case A / B split assumed pure globals would appear in TheShed. They don't — Wave 3's shallow forks made every catalogue-add a home-scoped row. Wave 6 redefines:
  - **Catalogue-tracking** = `source = 'ai'` AND `overridden_fields` empty/null (includes both pure globals and shallow forks).
  - **Custom fork** = `source = 'ai'` AND `overridden_fields.length > 0`.
- The Wave 1 RPCs `fork_ai_plant_for_home` and `reset_ai_plant_fork` are **not on the active path** in Wave 6. Wave 3 already created the home-scoped row at catalogue-add time, so editing just flips `overridden_fields` on the existing row. Reset uses the new in-place RPC because deletion would make the plant vanish from TheShed pre-D3. Both Wave 1 RPCs are kept for the post-D3 world.

Deferred (carried forward into Wave 7's register):

| # | Item | Status |
|---|------|--------|
| D2 | `PlantSearchModal` single-add AI branch pre-existing broken | Wave 7 |
| D3 | `inventory_items → global plant_id` refactor | Wave 7 decision |
| D4 | §13 Pass 2 backfill (per-home AI duplicate collapse) | Wave 7 |
| D6 | RLS prod smoke test after first deploy | Wave 7 |
| D7 | Seed orchestration bug (`09_cross_home_markers.sql`) | Wave 7 |
| D8 | Realtime sub on global AI plants for cross-device sync | Wave 7 |
| D9 | Per-field background highlight inside `ManualPlantCreation` | Optional polish |
| D10 (new) | Edit-then-save AI flow in Instance Edit Modal Care Guide tab (currently read-only) | Optional polish |

### Wave 7 — Cleanup pass + deferred-work close-out  *(shipped)*

Shipped on 2026-05-20. The deferred-work register accumulated through Waves 1–6 is now closed.

Items closed by this wave:

- **D2** — `PlantSearchModal.handleAddToShed` now has an `isAi` branch matching Wave 3's bulk-add shallow-fork pattern. Duplicate check uses `ilike(common_name)` since AI plants have no stable provider ID. `forked_from_plant_id` set when the catalogue returned a `db_plant_id`.
- **D7** — `scripts/seed-test-db.mjs` rewritten to a **three-pass** orchestration: (1) bootstrap all workers, (2) regular seeds per worker, (3) cross-home isolation markers once. Verified with `supabase db reset --local && node scripts/seed-test-db.mjs --workers 4` against a fresh DB.
- **D9** — `ManualPlantCreation` accepts `highlightedFields?` (yellow + "Updated" badge) and `overriddenFields?` (purple + "Custom" badge) props. Applied to all MultiSelect fields + the Watering Interval block. `PlantEditModal` threads `freshness.updated_care_fields` + `plant.overridden_fields` down. Overridden wins over highlighted when both apply.
- **D10** — Instance Edit Modal Care Guide tab stays read-only by design. Documented in [instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) so future contributors don't re-open the question.

Items consciously deferred out of this feature's scope (graduate to regular product backlog if they ever return):

- **D3** — `inventory_items → global plant_id` refactor. Shallow-fork model works; only worth doing if prod surfaces a data-bloat or query-perf signal.
- **D4** — §13 Pass 2 backfill (per-home duplicate collapse). Needs real prod AI duplicates to exist before it's meaningful. Design plan §13 Pass 2 has the full algorithm if/when it's needed.
- **D6** — RLS prod smoke test. Manual post-deploy checklist (below). Can't be automated pre-deploy.
- **D8** — Realtime sub on globals. Page-load refresh works. Revisit only if multi-device users report stale chip behaviour.

#### Post-deploy smoke-test runbook (D6)

After `npm run deploy` lands the Wave 1–6 migrations on prod:

1. **RLS lockdown.** Sign in as a real user, open the JS console, run:
   ```js
   await supabase.from("plants").update({ care_level: "test" }).eq("id", <GLOBAL_AI_ID>);
   ```
   Expect: empty result / RLS rejection. The Wave 1 policy tightening should prevent user-context updates on AI globals (`source = 'ai' AND home_id IS NULL`).
2. **Stale-check cron firing.** After 03:00 UTC on the day after deploy, query `ai_usage_log` for rows with `function_name = "refresh-stale-ai-plants"`. Expect at least one row per day going forward.
3. **Manual refresh path.** As a Sage+ user, click "Refresh now" on a global AI plant in Plant Edit Modal. Expect a toast + a new row in `plant_care_revisions` if anything changed, and `ai_plant_manual_refresh_log` updated for the rate-limit window.
4. **Detach + reset roundtrip.** Edit a catalogue-tracking plant → confirm detach → verify `overridden_fields` populated. Click Reset → confirm → verify `overridden_fields` cleared + care fields restored from the global parent.

If any of these fail, capture the error + the failing payload, then either revert via Supabase migration rollback or hotfix forward.

#### Post-Wave-7 hotfix — freshly-added AI plant chip + refresh button

Reported during local testing right after Wave 7 shipped:

1. Adding an AI plant immediately showed the yellow "Care guide updated" callout — because `user_plant_ack` was never seeded on add, so `seen_version = 0` and the global's `freshness_version = 1` always triggered `has_update`.
2. Clicking "Refresh now" on the same plant returned `not_a_global_ai_plant` — because for orphan home-scoped AI rows (no `forked_from_plant_id` set), `resolveGlobalId` fell back to `p.id`, and the edge fn correctly rejected the home row.

Two-part fix:

- **`useAiPlantFreshness.resolveGlobalId`** now takes the row's `home_id` into account. Orphan rows (`source='ai'` + `home_id != null` + `forked_from_plant_id IS NULL`) return null — no chip, no refresh button. Callers `TheShed`, `PlantEditModal`, `InstanceEditModal` updated to pass `home_id`.
- **`TheShed.handleProceedToBulkAdd`** and **`PlantSearchModal.handleAddToShed`** now upsert a `user_plant_ack` row at the global's current `freshness_version` immediately after the AI plant insert (whenever `db_plant_id` is known). Mirrors what `fork_ai_plant_for_home` does internally — Wave 3 had skipped this step when it chose to do client-side shallow-fork inserts instead of going through the RPC.

Two new unit tests cover the orphan + true-global resolution paths.

What this doesn't fix: existing orphan rows in users' sheds (e.g. plants added before Wave 2's catalogue-write was deployed locally). They just stop showing the chip + refresh button. To repair them would need a one-shot "relink orphans" pass — left as a backlog item if the count grows.

#### Post-Wave-7 UX refinement — "kill the jargon"

User feedback after the orphan hotfix: "What is this 'linked to catalogue' message? All I wanted was for an AI plant to have its care guide updated if a user hasn't amended any of the fields."

The hotfix's "Not linked to catalogue" hint was implementation language leaking into the UI. The catalogue / fork architecture stays — only the labels and the Refresh button's interaction model change. See [ai-plant-ux-refinement.md](./ai-plant-ux-refinement.md) for the full plan; landed changes:

- **SourceChip labels.** "AI · Auto-updating catalogue" → **"AI"**. "AI · Custom" → **"AI · Edited"**. Tooltip text rewritten to drop "catalogue" / "linked".
- **Reset → Revert.** The button is now labelled "Revert" and ResetConfirmModal's copy is rewritten to talk about "your edits" + "automatic updates" instead of "the catalogue". Component file is still `ResetConfirmModal.tsx` (no rename of the file/testid to keep the existing E2E green).
- **Refresh button always visible for AI plants.** It used to vanish on edited plants and orphan rows. Now:
  - Enabled on unedited, linked rows → existing manual-refresh path.
  - Enabled on unedited, **orphan** rows → triggers an on-demand **self-heal**: call `generate_care_guide` (which finds or generates the global), update the home row's `forked_from_plant_id`, seed `user_plant_ack`, then close so the parent re-fetches. User sees one toast: "Care guide is up to date".
  - Disabled on edited rows. Tooltip + a purple explainer block tell the user *why* and direct them to the Revert button.
- **"You've edited these fields" panel.** The purple summary block that was previously labelled "Your overrides" is now phrased in the user's voice and includes the explanation: "Because you've customised this plant, its care guide no longer auto-updates. Use Revert to rejoin automatic updates (your edits will be lost)."
- **"Catalogue refreshed N days ago" → "Care guide refreshed N days ago"** in `<CareUpdateCallout>`.
- **Toast on Revert.** "{plant} rejoined the catalogue" → "{plant} reverted — auto-updates re-enabled".
- **No data-model changes.** No new migrations, RPCs or edge functions. The catalogue still exists; the architecture is unchanged. Only what users see is different.

#### Post-Wave-7 fix — legacy string cache self-heals into the catalogue

Reported during testing: clicking Refresh Care Guide on an orphan AI plant toasted *"AI service didn't return a catalogue ID. Check the plant-doctor function is deployed."* Console logged `heal_no_db_plant_id_returned`.

Root cause traced via edge function logs: the `generate_care_guide` action hits the **legacy `species_cache` string cache** (step 2 of the pipeline) BEFORE the catalogue write (step 4). Wave 2 left the legacy cache as a transitional fallback. When the cache hits, the function returned the cached `plantData` straight away — never reaching the catalogue write, so the response had no `db_plant_id`. The client's orphan self-heal couldn't link the home row because there was no global plant_id to link to.

Fix in `supabase/functions/plant-doctor/index.ts` step 2: on a legacy cache hit, ALSO write the cached payload to the catalogue (find existing global by `scientific_name_key` first, INSERT on miss) and return its `db_plant_id` in the response. Mirrors the catalogue-write logic that already exists in step 4 for the fresh-generate path. Race-safe via the partial unique index + re-read pattern.

After this fix, the next `generate_care_guide` call from any client for a previously-cached species will populate a global row + the home row's `forked_from_plant_id` will link to it. Orphan rows graduate to shallow forks invisibly to the user.

Also improved while debugging: the client's `Couldn't refresh` toast now surfaces the underlying error message ("Couldn't refresh care guide: \<reason\>") instead of swallowing it, plus dedicated toasts for `heal_no_db_plant_id_returned`, `heal_link_update_failed`, `rate_limited`, `ai_tier_required`. The raw error is `console.error`'d for debugging.

Button labels also expanded for clarity: **"Refresh" → "Refresh Care Guide"**, **"Revert" → "Revert Care Guide"** — users were unclear about scope.

---

## 13. Backfill strategy

### Strategy: promote first-seen to global + diff-based collapse for duplicates

Every existing per-home AI plant is processed in two passes. The first pass promotes the oldest row in each species group to the global catalogue. The second pass decides per duplicate row: collapse (when data is effectively identical) or preserve as a fork (when data has meaningfully diverged).

This means there are no "orphan forks" after the migration — every fork has a known parent, and every home that's editing identically-named-but-actually-different data keeps their values. The Reset button works from day one.

### Pass 1 — Promote first-seen

For every species group (rows with the same `scientific_name_key` and `source = 'ai'`):

1. Pick the **oldest** row (lowest `created_at`) as the canonical global record.
2. UPDATE that row: `home_id = NULL`, populate `care_guide_data` from existing top-level + `data` jsonb fields, set `freshness_version = 1`, `last_care_generated_at = created_at`, `last_freshness_check_at = NULL` so the cron picks it up soon.
3. Insert an initial `plant_care_revisions` row with `source = 'initial'` and `care_guide_data = <the canonical's care guide>`.

If a group has only one row, this is the entire treatment for it.

### Pass 2 — Collapse vs. keep-as-fork (for groups with >1 row)

For every non-canonical row in the group:

1. Compute `care_guide_data` for that row using the same backfill mapping as the canonical.
2. Run `diffCareGuide(canonical.care_guide_data, this.care_guide_data)` (the shared helper from §6).
3. Branch:
   - **If `changed === false` after normalisation** → effectively identical:
     - UPDATE all `inventory_items.plant_id = this.id` → `canonical.id` for the home.
     - DELETE this `plants` row.
     - Insert `user_plant_ack` rows for every user in that home at `seen_freshness_version = 1`.
   - **If `changed === true`** → preserve as a meaningful fork:
     - UPDATE this row: `forked_from_plant_id = canonical.id`, `overridden_fields = <list of fields where diff was found>`, populate `care_guide_data`, `last_care_generated_at = created_at`. Leave `home_id` as the home it belongs to.
     - Insert `user_plant_ack` rows at `seen_freshness_version = 1` for users in that home (note: chip never fires on forks, but this keeps the table consistent).

The diff-based collapse is conservative — when in doubt, keep as a fork to preserve the user's home data. Better to surface "you have an override" honestly than silently overwrite something the user edited.

### Pass 3 — Cross-references

For every collapsed duplicate (rows that were DELETEd), check and repoint:

- `inventory_items.plant_id` (the obvious one) — already handled in Pass 2.
- `task_blueprints.plant_id` if any blueprints reference the species directly (rare — most reference `inventory_item_ids` not plant ids).
- `ailment_links.plant_id` if any exists (verify in current schema before migration).
- Any other FK pointing at the deleted row — audit before migration via:
  ```sql
  SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint
   WHERE confrelid = 'plants'::regclass AND contype = 'f';
  ```

### Backfill safety

- **Destructive** (drops duplicate `plants` rows), so:
  - Run on a `pg_dump` of production locally first, end-to-end. Verify shapes.
  - Run during a maintenance window with the maintenance flag ON (per the [Deployment Pipeline](../app-reference/99-cross-cutting/31-deployment.md)).
  - Take a Supabase point-in-time backup immediately before. Document the restore command in the migration's accompanying notes file.
- **Validation queries** to run before flipping maintenance off:
  - `SELECT count(*) FROM plants WHERE source='ai' AND home_id IS NULL` — should equal the count of distinct `scientific_name_key`s in the original AI set.
  - `SELECT plant_id, count(*) FROM inventory_items GROUP BY plant_id HAVING count(*) > 1` — confirm collapses worked.
  - Sample 20 random AI plants, verify `care_guide_data` is well-formed.
- **Rollback plan**: if anything looks wrong, restore the point-in-time backup. The migration's own SQL is wrapped in a transaction so a partial failure rolls back automatically.

### `user_plant_ack` seeding (final)

After Passes 1–3 complete, for every `(user_id, plant_id)` pair where the user has an `inventory_items` row pointing at any AI plant:

- Insert `user_plant_ack(user_id, plant_id, seen_freshness_version = plant.freshness_version, acked_at = now())`.

Since `freshness_version = 1` for everything after backfill, no chips appear post-migration. The first cron run that finds genuine changes will be the first time users see an "Updated" chip — exactly the experience we want.

---

## 14. Tier gating considerations

Today, the AI source is **Sage / Evergreen only** (gated by `profile.ai_enabled`). The plan preserves this:

- **Reading** the global AI catalogue: any authenticated user (so a Sprout user could in theory see "tomato" exists). In practice, Sprout users don't open the AI tab, so this is moot — but make sure the read RLS allows it.
- **Inserting new AI plants** (i.e. first-to-add-a-species pays the AI cost): Sage / Evergreen only, gated at the edge function level.
- **Adding an existing AI plant from the catalogue** (no AI call needed): could be allowed to any tier since there's no AI cost — **open question, see section 16**.
- **Stale-check cron**: runs centrally, cost lands against "system" user. Not user-gated.
- **Manual force-refresh** (if we keep the button): gated to Sage+ to limit cost.

---

## 15. Edge cases & risks

| Risk | Mitigation |
|------|-----------|
| Race condition: two users add the same species at the same time, both miss the dedup lookup. | The partial unique index throws on the second insert; edge fn catches, refetches, and uses the existing row. |
| Stale-check call to Gemini fails. | Row's `last_freshness_check_at` stays NULL → picked up next run. No silent data corruption. |
| Gemini returns a worse care guide on regeneration. | We can roll back via `plant_care_revisions`. A future "feedback" mechanism could flag bad updates for admin review. |
| `scientific_name` is unreliable (different cultivars, common-name conflicts). | Use the FIRST entry of `scientific_name[]` for the key. Future: allow merging records via admin tooling. Document the limitation. |
| Per-field diff fires on Gemini's stylistic variations (e.g. `"watering": "weekly"` vs `"watering": "Weekly"`). | The diff helper applies canonical normalisation: lowercase strings, sort arrays, trim whitespace, before comparing. Falsy diffs are dropped. |
| Existing UPDATE RLS on `plants` was permissive for `home_id IS NULL`; tightening may break Perenual flows. | Audit every UPDATE call against `plants` before shipping Wave 1's RLS change. If a legitimate flow needs to update a global record, route it through a service-role edge fn. |
| Backfill duplicates: collapsing multiple home-scoped tomato rows into one global row loses any home-specific custom edits (e.g. user manually overrode `watering`). | **Decision needed (open question):** preserve overrides in `plants.data` jsonb under a `user_overrides` key, OR accept the loss and warn during migration. |
| Realtime traffic from `plants` updates could be noisy if many plants update at once (e.g. cron processes 25/day). | Cron updates spread across the batch loop with 1s spacing. Realtime fanout per row is light; clients only refetch what's in their shed. |
| The "Updated" chip clutters the UI if many plants update simultaneously. | Default: show the chip per plant. Future: a single dashboard banner "5 of your plants have updated care info — review" if count > 3. |
| A user removes a plant from their shed then re-adds it — does the ack reset? | Per-plant ack persists across removal (the row stays in `user_plant_ack`). Re-adding picks up at the existing seen_version. Acceptable behaviour. |

---

## 16. Resolved questions

All six initial open questions are now resolved (see §2 "Follow-up six"). No outstanding design questions block implementation.

The override flow surfaces a handful of new edge cases worth flagging up-front:

### New edge cases introduced by the override flow

| Edge case | Resolution |
|-----------|-----------|
| User has a fork. Later, the global parent is somehow deleted (admin action, edge-case migration). | `forked_from_plant_id` is `ON DELETE SET NULL`, so the fork survives but loses its parent link. Reset button shows but is disabled with tooltip: "Catalogue version is unavailable — Reset is paused." A rare admin recovery path can re-link by `scientific_name_key`. Backfill itself never creates this state (every fork has a parent after migration). |
| User edits a global AI plant, fork is created, then they reset. Cron runs and updates the (now global) parent. User sees "Updated" chip. | Working as intended. After reset they're back in the catalogue and receive updates like any other user. |
| Two users in the same home: user A edits the plant (fork created), user B tries to edit. | They're editing the same fork (it's home-scoped). Their save just updates the existing fork row directly — no second detach modal since they're already detached. |
| User has a fork. They search for the same species again via AI. | Search dedup returns the home fork as `db_hit_kind = "home_fork"` → "Your custom version" pill → picking it just re-adds an instance pointing at the existing fork. No new fork is created (per the `(home_id, scientific_name_key)` unique index). |
| User resets a fork. They were the last instance holder in the home. Reset succeeds (no inventory_items left to repoint). | Fork row is still deleted. RPC handles 0-row UPDATE gracefully. |
| Refresh-now finds changes on a global plant. A fork of that plant exists in some home. | Cron / manual-refresh both filter `home_id IS NULL` — forks are unaffected. They keep their care data. The "Updated" chip ONLY shows on non-forked instances. |
| Schema evolution: new field `propagation_difficulty` added. Cron runs on a plant. New field appears in the regen response. | Diff helper sees the field as a "change" (was undefined, now defined). Chip shows, field highlights yellow. Acceptable trade-off — user gets a free update notification for the new field. |

---

## 17. App-reference files consulted

Per the new mandate, listing every reference I read while drafting this plan:

- [Data Model — Plants, Inventory Items, Sources](../app-reference/99-cross-cutting/03-data-model-plants.md)
- [AI — Gemini Calls, Rate Limits, Caching](../app-reference/99-cross-cutting/13-ai-gemini.md)
- [Caching — sessionStorage, localStorage, Supabase, Image Proxy](../app-reference/99-cross-cutting/14-caching.md)
- [RLS — Policy Patterns](../app-reference/99-cross-cutting/19-rls-patterns.md)
- [Plant Providers — Perenual, Verdantly, AI](../app-reference/99-cross-cutting/25-plant-providers.md)
- [Edge Functions — Catalogue](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
- [Cron Jobs — Schedules](../app-reference/99-cross-cutting/11-cron-jobs.md)
- [Realtime — Supabase Channels, Presence](../app-reference/99-cross-cutting/15-realtime.md)
- [The Shed](../app-reference/03-garden-hub/01-the-shed.md)
- [Plant Edit Modal](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md)
- [Instance Edit Modal](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md)
- [Bulk Search Modal](../app-reference/08-modals-and-overlays/04-bulk-search-modal.md)
- [Plant Source Picker](../app-reference/08-modals-and-overlays/03-plant-source-picker.md)
- [Plant Search Modal](../app-reference/08-modals-and-overlays/05-plant-search-modal.md)
- [Manual Plant Creation](../app-reference/08-modals-and-overlays/33-manual-plant-creation.md)

Migration files reviewed:
- `supabase/migrations/20260401072454_remote_schema.sql` (plants table baseline)
- `supabase/migrations/20260415161521_add_ai_cache_and_light_lux.sql` (existing ai_schedule_cache table)
- `supabase/migrations/20260502000000_add_ai_to_plants_source_check.sql` (constraint)
- `supabase/migrations/20260502100000_fix_plants_home_isolation_rls.sql` (RLS — confirms `home_id IS NULL` is already allowed)

Source files reviewed:
- `src/services/plantDoctorService.ts` (current `generateCareGuide` + `searchPlantsText`)
- `supabase/functions/plant-doctor/index.ts` (current cache-then-call pattern)

---

## 18. App-reference files that will need updating

When the work ships, the following must be updated in the same PR:

- [Data Model — Plants](../app-reference/99-cross-cutting/03-data-model-plants.md) — new columns (`scientific_name_key`, `care_guide_data`, `freshness_version`, `last_freshness_check_at`, `last_care_generated_at`, `forked_from_plant_id`, `overridden_fields`, `updated_care_fields`), new tables (`plant_care_revisions`, `user_plant_ack`, `ai_plant_manual_refresh_log`), dedup unique indexes, fork semantics, global vs home-scoped AI source semantics.
- [AI — Gemini](../app-reference/99-cross-cutting/13-ai-gemini.md) — replace the "30-day TTL string cache" description with "global plant catalogue with 90-day freshness check + per-home fork model". Update caching strategy table. Note `manual_refresh_ai_plant` consumes user quota, cron uses service key.
- [Caching](../app-reference/99-cross-cutting/14-caching.md) — update the Supabase-row-caches section: care guides now live on `plants.care_guide_data`, not the string-keyed cache. Note the freshness-version-based invalidation.
- [RLS Patterns](../app-reference/99-cross-cutting/19-rls-patterns.md) — tightened `plants` UPDATE policy (no longer permissive on `home_id IS NULL`), new `user_plant_ack` + `plant_care_revisions` + `ai_plant_manual_refresh_log` policies, and `SECURITY DEFINER` semantics for the two new RPCs.
- [Plant Providers](../app-reference/99-cross-cutting/25-plant-providers.md) — AI source semantics: global catalogue + home forks. `db_hit_kind` in search results. Detach-on-edit flow. Reset-to-catalogue flow.
- [Edge Functions Catalogue](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) — add `refresh-stale-ai-plants` and `manual_refresh_ai_plant`; update `plant-doctor` description (now returns `db_hit_kind`).
- [Cron Jobs](../app-reference/99-cross-cutting/11-cron-jobs.md) — add the daily stale-check cron with the `STALE_CHECK_BATCH_SIZE` env var; note it filters `home_id IS NULL` (forks skipped).
- [Realtime](../app-reference/99-cross-cutting/15-realtime.md) — add `plants` and `user_plant_ack` to the channels-in-active-use table.
- [The Shed](../app-reference/03-garden-hub/01-the-shed.md) — "Updated" badge on cards when `freshness_version > seen_version`.
- [Plant Edit Modal](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — Care tab now has three cases (global / fork / non-AI). Document `<DetachConfirmModal>`, `<ResetConfirmModal>`, "Refresh now" button, per-field highlighting + "Overridden" badges, freshness pill, source chip.
- [Instance Edit Modal](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — Care Guide tab updates: same chip + highlighting; editing triggers detach modal; reset is from Plant Edit Modal only.
- [Bulk Search Modal](../app-reference/08-modals-and-overlays/04-bulk-search-modal.md) — "In catalogue" / "Your custom version" pills on AI tab; skip-regenerate on hit.
- [Plant Source Picker](../app-reference/08-modals-and-overlays/03-plant-source-picker.md) — same pill behaviour for AI candidates.
- [Plant Search Modal](../app-reference/08-modals-and-overlays/05-plant-search-modal.md) — same pill behaviour.
- [Tier Gating](../app-reference/99-cross-cutting/17-tier-gating.md) — new entries: "Add to shed (catalogue hit)" still gated to AI tier (we chose consistency); "Refresh now" button gated Sage+ rate-limited weekly per plant.

### New cross-cutting reference to create

A standalone doc for the global AI catalogue is being created since it spans several existing references and acts as the single canonical place to understand the model end-to-end.

- **NEW**: `docs/app-reference/99-cross-cutting/33-ai-plant-catalogue.md` — full lifecycle of an AI plant:
  - **Birth** — first user adds → Gemini generates → row inserted with `home_id = NULL, source = 'ai', freshness_version = 1`.
  - **Reuse** — subsequent users searching see `db_hit_kind: "global"` → pick → zero AI cost.
  - **Drift** — daily cron, 90-day window, batch-of-25, diff helper, version bump + revision history.
  - **Fork** — user edits, DetachConfirmModal, `fork_ai_plant_for_home` RPC, home-scoped row with `forked_from_plant_id` set.
  - **Reset** — Reset button on fork, ResetConfirmModal, `reset_ai_plant_fork` RPC, inventory repointed, fork deleted, ack seeded.
  - **Manual refresh** — Sage+ "Refresh now" button, rate-limited weekly per user×plant.
  - Both roles (Role 1 technical + Role 2 gardener) per the doc template mandate.

### Cross-link updates to existing docs (must happen in same PR as the new doc)

The new `33-ai-plant-catalogue.md` is referenced from every related doc, and every related doc's "Related reference files" section needs to point back to it:

- [Data Model — Plants](../app-reference/99-cross-cutting/03-data-model-plants.md) → add to Related; in-text mention the catalogue concept supersedes per-home AI rows.
- [AI — Gemini](../app-reference/99-cross-cutting/13-ai-gemini.md) → add to Related; in-text mention the catalogue is the AI-cost-reduction backbone.
- [Caching](../app-reference/99-cross-cutting/14-caching.md) → add to Related; in-text mention `plants.care_guide_data` + `freshness_version` invalidation.
- [Cron Jobs](../app-reference/99-cross-cutting/11-cron-jobs.md) → add to Related; the `refresh-stale-ai-plants` cron entry links to the catalogue doc for full context.
- [Edge Functions Catalogue](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md) → `refresh-stale-ai-plants`, `manual_refresh_ai_plant`, `fork_ai_plant_for_home`, `reset_ai_plant_fork` entries all link to the catalogue doc.
- [Plant Providers](../app-reference/99-cross-cutting/25-plant-providers.md) → add to Related; AI provider section should defer to the catalogue doc for lifecycle.
- [RLS Patterns](../app-reference/99-cross-cutting/19-rls-patterns.md) → add to Related; mention `plants` UPDATE tightening + RPC `SECURITY DEFINER` pattern.
- [Realtime](../app-reference/99-cross-cutting/15-realtime.md) → add to Related; `plants` + `user_plant_ack` channel mentions cite the catalogue doc.
- [Tier Gating](../app-reference/99-cross-cutting/17-tier-gating.md) → add to Related; manual refresh + AI add semantics cite the catalogue.
- [The Shed](../app-reference/03-garden-hub/01-the-shed.md) → add to Related; "Updated" badge mention cites the catalogue.
- [Plant Edit Modal](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) → add to Related; Case A/B/C cite the catalogue doc.
- [Instance Edit Modal](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) → add to Related.
- [Bulk Search Modal](../app-reference/08-modals-and-overlays/04-bulk-search-modal.md) → add to Related.
- [Plant Source Picker](../app-reference/08-modals-and-overlays/03-plant-source-picker.md) → add to Related.
- [Plant Search Modal](../app-reference/08-modals-and-overlays/05-plant-search-modal.md) → add to Related.

### Master index update

[`docs/app-reference/00-INDEX.md`](../app-reference/00-INDEX.md) gets a new row in the Cross-Cutting Concerns section:

```
- [ ] [AI Plant Catalogue — Lifecycle, Forks, Stale Check](./99-cross-cutting/33-ai-plant-catalogue.md)
```

Ticked to `[x]` once the doc lands.

---

## 19. Testing strategy

| Layer | What to add |
|-------|-------------|
| Vitest unit | `tests/unit/lib/careGuideDiff.test.ts` — diff function across structured + free-text fields, normalisation rules. |
| Vitest unit | `tests/unit/hooks/useAiPlantFreshness.test.ts` — version comparison, acknowledge flow. |
| Deno | `supabase/tests/refresh-stale-ai-plants.test.ts` — batch logic, idempotency, dedup unique-violation handling, **fork-skip** behaviour. |
| Deno | `supabase/tests/plant-doctor-dedup.test.ts` — `db_hit` enrichment, home_fork-wins-over-global priority. |
| Deno | `supabase/tests/fork-ai-plant-rpc.test.ts` — happy path + non-member rejection + double-fork rejection (unique constraint). |
| Deno | `supabase/tests/reset-ai-plant-rpc.test.ts` — happy path + ack seeding + orphan-fork (no parent) handling. |
| Deno | `supabase/tests/manual-refresh-ai-plant.test.ts` — rate-limit enforcement + tier gating + diff-and-update flow. |
| Playwright | AI catalogue hit: User A adds tomato → User B searches → sees "In catalogue" → adds → zero AI calls fire. |
| Playwright | Freshness chip: simulate `freshness_version` bump → user sees chip → opens modal → field highlighted → acknowledges → chip gone. |
| Playwright | Detach-on-edit: edit AI plant → confirm modal → fork created → source chip changes → no future updates. |
| Playwright | Reset to catalogue: reset fork → confirm modal → rejoin global → no "Updated" chip flash. |
| Playwright | Manual refresh: Sage user taps Refresh → AI call → if changed, version bumps; rate-limit prevents second tap within 7 days. |
| Seeds | Add a global AI plant in seeds (`02_plants_shed.sql`) with `freshness_version=2` so test users start with the "updated" state. Add a home fork too for the override-flow test. |

---

## 20. Estimated effort

Rough sizing (engineer-days, conservative):

| Wave | Effort |
|------|--------|
| 1. Schema + RLS migrations + RPCs | 1.5 days |
| 2. Edge function rewrites (dedup + global insert + manual refresh fn) | 2 days |
| 3. Client search UI ("In catalogue" / "Custom" pills, skip regenerate on hit) | 1 day |
| 4. Stale-check edge fn + cron + revision history | 2 days |
| 5. Client freshness UI (chip, highlights, ack flow, hooks, "Refresh now" button) | 2 days |
| 6. Override flow (detach modal, fork creation, reset modal, source chips, per-field badges) | 1.5 days |
| 7. Backfill migration (promote first-seen + diff-collapse + FK audit + validation queries) | 2 days |
| 8. Tests (unit, Deno, Playwright) | 1.5 days |
| 9. App-reference doc updates + new `33-ai-plant-catalogue.md` | 1 day |
| **Total** | **~14 days** |

Wave-by-wave deployment de-risks the change. Roll back any individual wave without affecting earlier ones.

---

## Next step

**Awaiting user feedback on:**

1. The design as a whole — anything missing, wrong, or scoped differently than expected?
2. The six open questions in section 16.
3. Whether to proceed wave-by-wave or stage all schema changes together.

Once approved, the first implementation step is Wave 1 (schema migration), applied locally and verified before pushing to remote.
