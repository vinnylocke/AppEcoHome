-- Server-side cache for companion-planting results so we generate once per
-- plant instead of calling Gemini/Verdantly on every Companions tab open.
--
-- Global / species-level (shareable across users, like plant_library). Keyed
-- by (source, cache_key): "verdantly" + verdantly_id, else "ai" +
-- lower(trim(plant_name)). AI rows are permanent; Verdantly rows are refreshed
-- after a TTL (enforced in the edge function). Empty results are never cached.
--
-- Written/read only by the `companion-planting` edge function via the service
-- role (RLS-bypassed), so there are intentionally NO client grants/policies —
-- the browser never queries this table directly.

create table if not exists public.companion_cache (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  cache_key    text not null,
  beneficial   jsonb not null default '[]'::jsonb,
  harmful      jsonb not null default '[]'::jsonb,
  neutral      jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  unique (source, cache_key)
);

alter table public.companion_cache enable row level security;
-- No policies: only the service-role edge function touches this table.
