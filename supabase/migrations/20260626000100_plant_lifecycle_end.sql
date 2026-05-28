-- Plant End-of-Life: gentle "lifecycle complete" state on plant instances.
-- Does NOT change inventory_items.status (preserves existing queries / RLS).
-- The presence of ended_at puts the instance into the "ended" view.

alter table public.inventory_items
  add column if not exists ended_at        timestamptz,
  add column if not exists was_natural_end boolean,
  add column if not exists end_summary     text;

-- Filtered index so "ended" lookups stay fast even as the instances table grows.
create index if not exists inventory_items_ended_at_idx
  on public.inventory_items(home_id, ended_at desc)
  where ended_at is not null;
