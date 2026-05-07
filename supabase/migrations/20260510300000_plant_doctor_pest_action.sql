-- Extend plant_doctor_sessions to support pest identification sessions
alter table public.plant_doctor_sessions
  drop constraint if exists plant_doctor_sessions_action_check;

alter table public.plant_doctor_sessions
  add constraint plant_doctor_sessions_action_check
  check (action in ('identify', 'diagnose', 'pest'));
