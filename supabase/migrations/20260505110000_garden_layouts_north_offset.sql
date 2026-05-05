alter table public.garden_layouts
  add column if not exists north_offset_deg integer not null default 0;
