-- Sowing bridge — back-link sowings to the task that triggered them.
-- Unique partial index enforces idempotency: completing the same task
-- twice (uncomplete + recomplete) won't create a duplicate sowing row.

alter table public.seed_sowings
  add column if not exists task_id uuid
    references public.tasks(id) on delete set null;

create unique index if not exists seed_sowings_task_id_unique
  on public.seed_sowings(task_id) where task_id is not null;
