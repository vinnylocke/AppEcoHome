-- Auto-update Journal: per-task-category opt-in list on the user profile.
-- Empty array = auto-update off. Modular: new task categories shipped later
-- automatically become valid entries in this list — no schema change needed.

alter table public.user_profiles
  add column if not exists auto_update_journal_categories text[]
    not null default array[]::text[];
