# AI — Gemini Calls, Rate Limits, Caching

> All AI in Rhozly routes through Google Gemini via Supabase Edge Functions. The browser never calls Gemini directly — security + key isolation. Usage logged to `ai_calls` for the Audit Log + per-user quotas.

---

## Quick Summary

```
Browser ──► Edge Function ──► Gemini API
              │
              ├── _shared/gemini.ts (wrapper)
              ├── inserts ai_calls row (audit)
              └── returns response
```

Models used:
- **Gemini Vision** — image identification, diagnosis, area scan.
- **Gemini Text** — chat, blueprint generation, task suggestion, optimise.

---

## Role 1 — Technical Reference

### Edge functions that call Gemini

(see [Edge Functions Catalogue](./10-edge-functions-catalogue.md) for full list)

Highlights:
- `plant-doctor` (identify / diagnose / pest / **analyse_comprehensive** — combined Gemini call returning structured analysis + `suggested_tasks[]` for one-tap calendar commit / **lookup_frost_dates** — open to all tiers, caches into `home_climate` for 6 months / **plant_when_to_plant** — Sage+ per-plant guidance anchored to cached frost dates)
- `plant-doctor-ai` (chat — schema includes `text`, `suggested_plants`, `suggested_tasks`, `detected_preferences`, and `plan_suggestion?` for the proactive Planner CTA. Caller passes `priorPlanSuggested: boolean` to enforce the once-per-thread rule.)
- `generate-landscape-plan` (blueprint)
- `generate-task-from-photo`
- `scan-area`
- `optimise-area-ai`
- `generate-guide`
- `search-plants-ai`
- `companion-planting`
- `visualiser-analyse`

### `_shared/gemini.ts` (typical)

```ts
async function callGemini({ model, prompt, image?, schema? }) {
  // standardised request with timeout + retry
  // logs to ai_calls
  // returns parsed response
}
```

### `ai_calls` table

```ts
{
  id, created_at,
  user_id, home_id,
  function_name, action,
  model, prompt_tokens, candidates_tokens, total_tokens,
  estimated_cost_usd,
}
```

Surfaces in the [Audit Log](../07-management/08-audit-log.md) + Account Tab's AI Usage Panel.

### Quotas

Per-tier monthly token budgets enforced server-side. When exhausted, edge function returns a 429 with `code: "quota_exceeded"`.

### Caching strategy

- **Provider plant details** — cached in `plants` row (`data` jsonb) to avoid re-fetch.
- **AI care guides (Wave 2+ of AI Plant Overhaul)** — stored in `plants.care_guide_data` (jsonb) on the global AI catalogue row. Replaces the legacy 30-day TTL string-keyed cache. Reads hit the catalogue first (zero AI cost on cache hit); writes happen during `generate_care_guide`. Invalidation is **freshness-version-based**, not TTL: the `refresh-stale-ai-plants` cron (Wave 4) re-checks every 90 days; the `manual-refresh-ai-plant` edge fn re-checks on user request. `freshness_version` bumps when content changes; clients compare against `user_plant_ack.seen_freshness_version` to decide whether to show the "Updated" chip. See [AI Plant Catalogue](./33-ai-plant-catalogue.md) (planned, Wave 9) for the full lifecycle.
- **AI care guides (legacy / transitional)** — also still written to the string-keyed `getCached/setCached` for backward compatibility during the AI Plant Overhaul rollout. Removed once Wave 7 backfill completes.
- **Image search results** — cached briefly per query.
- **Pattern engine outputs** — `user_insights` row persists until dismissed.

### Rate limiting

Per-user soft caps (e.g. 60 calls/min) at the edge function level prevent runaway loops.

### Retries

Idempotent calls retry once on Gemini 5xx. Non-idempotent (image upload then analyse) skip retry to avoid double-billing.

### Structured output

Most calls use Gemini's JSON-mode with a schema (`responseMimeType: "application/json"`, `responseSchema`) for reliable parsing.

**Enum constraints** on array items are honoured strictly — Gemini will only return values from the allowed list or fail the response. Used to lock enumerated values for fields where Gemini otherwise free-styles:

- `CARE_GUIDE_SCHEMA.plantData.flowering_season` and `harvest_season`: enum `["Spring", "Summer", "Autumn", "Winter"]`. Without this constraint, Gemini was returning month names or comma-separated month strings.
- `CARE_GUIDE_SCHEMA.plantData.pruning_month`: enum `["Jan", "Feb", ..., "Dec"]`. Strict abbreviated month names; never full names or seasons.

Used by both `plant-doctor`'s `generate_care_guide` action and the standalone `manual-refresh-ai-plant` edge function. Hemisphere-tuning is applied by the prompt, not the schema (the enum is the same regardless of hemisphere — the choice of WHICH season/month maps to the user's hemisphere comes from the prompt instruction).

### Personalisation context

Edge functions can fetch `user_behaviour_summary` (refreshed weekly) to ground responses in the user's history without re-sending it every call.

---

## Role 2 — Expert Gardener's Guide

### Why all AI goes via edge functions

- Keeps the Gemini API key off the browser.
- Logs every call for cost + audit.
- Enforces tier gating + quotas server-side (can't be bypassed by the client).

### Implications

- AI features feel slightly slower than direct calls (one extra hop) — trade-off for safety.
- Audit Log shows where every AI dollar went.
- If you ever see a "quota exceeded" error, the Account Tab's AI Usage panel tells you what month-to-date you've spent.

---

## Related reference files

- [Edge Functions Catalogue](./10-edge-functions-catalogue.md)
- [Audit Log](../07-management/08-audit-log.md)
- [Tier Gating](./17-tier-gating.md)
- [Account Tab](../06-account/01-account-tab.md) — AI Usage Panel

## Code references for ongoing maintenance

- `supabase/functions/_shared/gemini.ts`
- `supabase/migrations/*_ai_calls.sql`
- Tier limits typically in `_shared/quotas.ts` or env vars
