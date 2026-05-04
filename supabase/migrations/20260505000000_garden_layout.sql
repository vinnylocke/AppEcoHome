create table public.garden_layouts (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references public.homes(id) on delete cascade,
  name        text not null,
  canvas_w_m  numeric(7,2) not null default 30.0,
  canvas_h_m  numeric(7,2) not null default 20.0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.garden_shapes (
  id          uuid primary key default gen_random_uuid(),
  layout_id   uuid not null references public.garden_layouts(id) on delete cascade,
  area_id     uuid references public.areas(id) on delete set null,
  shape_type  text not null,
  label       text,
  color       text not null default '#4ade80',
  x_m         numeric(9,3) not null default 0,
  y_m         numeric(9,3) not null default 0,
  width_m     numeric(9,3),
  height_m    numeric(9,3),
  radius_m    numeric(9,3),
  points      jsonb,
  rotation    numeric(6,2) not null default 0,
  z_index     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.garden_layouts enable row level security;
alter table public.garden_shapes   enable row level security;

create policy "home_members_manage_layouts" on public.garden_layouts
  for all to authenticated
  using  (home_id in (select home_id from public.home_members where user_id = auth.uid()))
  with check (home_id in (select home_id from public.home_members where user_id = auth.uid()));

create policy "home_members_manage_shapes" on public.garden_shapes
  for all to authenticated
  using (layout_id in (
    select id from public.garden_layouts
    where home_id in (select home_id from public.home_members where user_id = auth.uid())
  ))
  with check (layout_id in (
    select id from public.garden_layouts
    where home_id in (select home_id from public.home_members where user_id = auth.uid())
  ));
