-- Add dashed styling flag to garden shapes (used for boundaries, tree canopies, etc.)
alter table public.garden_shapes
  add column if not exists dashed boolean not null default false;
