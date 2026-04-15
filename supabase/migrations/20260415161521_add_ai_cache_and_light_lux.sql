
  create table "public"."ai_schedule_cache" (
    "id" uuid not null default gen_random_uuid(),
    "plant_id" bigint not null,
    "area_id" uuid not null,
    "schedule_data" jsonb not null,
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."ai_schedule_cache" enable row level security;

CREATE UNIQUE INDEX ai_schedule_cache_pkey ON public.ai_schedule_cache USING btree (id);

CREATE UNIQUE INDEX ai_schedule_cache_plant_id_area_id_key ON public.ai_schedule_cache USING btree (plant_id, area_id);

alter table "public"."ai_schedule_cache" add constraint "ai_schedule_cache_pkey" PRIMARY KEY using index "ai_schedule_cache_pkey";

alter table "public"."ai_schedule_cache" add constraint "ai_schedule_cache_plant_id_area_id_key" UNIQUE using index "ai_schedule_cache_plant_id_area_id_key";

grant delete on table "public"."ai_schedule_cache" to "anon";

grant insert on table "public"."ai_schedule_cache" to "anon";

grant references on table "public"."ai_schedule_cache" to "anon";

grant select on table "public"."ai_schedule_cache" to "anon";

grant trigger on table "public"."ai_schedule_cache" to "anon";

grant truncate on table "public"."ai_schedule_cache" to "anon";

grant update on table "public"."ai_schedule_cache" to "anon";

grant delete on table "public"."ai_schedule_cache" to "authenticated";

grant insert on table "public"."ai_schedule_cache" to "authenticated";

grant references on table "public"."ai_schedule_cache" to "authenticated";

grant select on table "public"."ai_schedule_cache" to "authenticated";

grant trigger on table "public"."ai_schedule_cache" to "authenticated";

grant truncate on table "public"."ai_schedule_cache" to "authenticated";

grant update on table "public"."ai_schedule_cache" to "authenticated";

grant delete on table "public"."ai_schedule_cache" to "service_role";

grant insert on table "public"."ai_schedule_cache" to "service_role";

grant references on table "public"."ai_schedule_cache" to "service_role";

grant select on table "public"."ai_schedule_cache" to "service_role";

grant trigger on table "public"."ai_schedule_cache" to "service_role";

grant truncate on table "public"."ai_schedule_cache" to "service_role";

grant update on table "public"."ai_schedule_cache" to "service_role";


  create policy "Enable all access for authenticated users"
  on "public"."ai_schedule_cache"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



