-- Global Journal: polymorphic single-target assignment for plant_journals.
-- An entry may be attached to AT MOST ONE of: plant instance / location / area / plan.
-- Zero targets = "unassigned" general garden note.

alter table public.plant_journals
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists area_id     uuid references public.areas(id)     on delete set null,
  add column if not exists plan_id     uuid references public.plans(id)     on delete set null;

-- CHECK constraint: at most one target set.
alter table public.plant_journals
  drop constraint if exists plant_journals_single_target;

alter table public.plant_journals
  add constraint plant_journals_single_target check (
    (case when inventory_item_id is not null then 1 else 0 end)
  + (case when location_id       is not null then 1 else 0 end)
  + (case when area_id           is not null then 1 else 0 end)
  + (case when plan_id           is not null then 1 else 0 end)
    <= 1
  );

-- Idempotency for auto-created task entries: a single task can only produce ONE journal row.
create unique index if not exists plant_journals_task_id_unique
  on public.plant_journals(task_id)
  where task_id is not null;

-- Lookup indexes for the new target FKs + the global feed ordering.
create index if not exists plant_journals_location_id_idx
  on public.plant_journals(location_id) where location_id is not null;
create index if not exists plant_journals_area_id_idx
  on public.plant_journals(area_id) where area_id is not null;
create index if not exists plant_journals_plan_id_idx
  on public.plant_journals(plan_id) where plan_id is not null;
create index if not exists plant_journals_home_created_idx
  on public.plant_journals(home_id, created_at desc);
