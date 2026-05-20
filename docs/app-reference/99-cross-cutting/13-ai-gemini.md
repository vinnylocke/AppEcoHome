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
- `plant-doctor` (identify / diagnose / pest)
- `plant-doctor-ai` (chat)
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
- **AI care guides** — cached on `inventory_items` or via `plant_care_guides` (varies).
- **Image search results** — cached briefly per query.
- **Pattern engine outputs** — `user_insights` row persists until dismissed.

### Rate limiting

Per-user soft caps (e.g. 60 calls/min) at the edge function level prevent runaway loops.

### Retries

Idempotent calls retry once on Gemini 5xx. Non-idempotent (image upload then analyse) skip retry to avoid double-billing.

### Structured output

Most calls use Gemini's JSON-mode with a schema (`responseMimeType: "application/json"`, `responseSchema`) for reliable parsing.

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
