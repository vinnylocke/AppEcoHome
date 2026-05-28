-- Sowing bridge — link tasks (and their blueprints) to seed packets so
-- completing a sowing task can auto-create a Nursery sowing.
-- Nullable FKs; ON DELETE SET NULL keeps the task alive when a packet is
-- removed (the task may still be a useful historical record).

alter table public.tasks
  add column if not exists seed_packet_id uuid
    references public.seed_packets(id) on delete set null;

alter table public.task_blueprints
  add column if not exists seed_packet_id uuid
    references public.seed_packets(id) on delete set null;

create index if not exists tasks_seed_packet_idx
  on public.tasks(seed_packet_id) where seed_packet_id is not null;

create index if not exists task_blueprints_seed_packet_idx
  on public.task_blueprints(seed_packet_id) where seed_packet_id is not null;
