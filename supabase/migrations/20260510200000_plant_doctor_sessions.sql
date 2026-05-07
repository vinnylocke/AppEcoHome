create table if not exists public.plant_doctor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  action text not null check (action in ('identify', 'diagnose')),
  image_path text,
  results jsonb not null default '{}',
  confirmed_value text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.plant_doctor_sessions enable row level security;

create policy "users_own_doctor_sessions" on public.plant_doctor_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.plant_doctor_sessions to authenticated;
grant select, insert, update, delete on public.plant_doctor_sessions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doctor-sessions', 'doctor-sessions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "doctor_session_images_owner" on storage.objects
  for all
  using (bucket_id = 'doctor-sessions' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'doctor-sessions' and auth.uid()::text = (storage.foldername(name))[1]);
