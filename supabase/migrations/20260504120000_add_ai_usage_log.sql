create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  home_id uuid references public.homes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  function_name text not null,
  action text,
  model text not null,
  prompt_tokens integer not null default 0,
  candidates_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 8) default 0
);

alter table public.ai_usage_log enable row level security;

create policy "home_members_read_own_ai_usage" on public.ai_usage_log
  for select to authenticated
  using (
    home_id in (
      select home_id from public.home_members where user_id = auth.uid()
    )
  );
