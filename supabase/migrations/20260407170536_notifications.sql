drop index if exists "public"."species_cache_pkey";


  create table "public"."notifications" (
    "id" uuid not null default gen_random_uuid(),
    "home_id" uuid not null,
    "title" text not null,
    "body" text not null,
    "type" text not null,
    "is_read" boolean not null default false,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "action_data" jsonb
      );


alter table "public"."notifications" enable row level security;

alter table "public"."species_cache" alter column "raw_data" drop default;

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX species_cache_pkey ON public.species_cache USING btree (id);

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."species_cache" add constraint "species_cache_pkey" PRIMARY KEY using index "species_cache_pkey";

alter table "public"."notifications" add constraint "notifications_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_home_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.trigger_plant_schedules()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  schedule RECORD;
  v_base_date DATE;
  v_start_date DATE;
  v_end_date DATE;
  v_season_start TEXT;
  v_season_end TEXT;
  v_year INT;
BEGIN
  -- If this is just an update but the status didn't change, do nothing.
  IF (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  -- The baseline date is when the plant was triggered (e.g., Planted Date)
  v_base_date := COALESCE(NEW.planted_at::date, CURRENT_DATE);

  -- Loop through matching schedules
  FOR schedule IN 
    SELECT * FROM public.plant_schedules 
    WHERE plant_id = NEW.plant_id AND trigger_event = NEW.status
  LOOP
    
    -- 🧮 CALCULATE START DATE
    IF schedule.start_reference LIKE 'Seasonal: %' THEN
      v_season_start := RIGHT(schedule.start_reference, 5); -- gets 'MM-DD'
      v_year := EXTRACT(YEAR FROM v_base_date);
      v_start_date := TO_DATE(v_year::TEXT || '-' || v_season_start, 'YYYY-MM-DD');
      
      -- If the season start already passed this year, push it to next year
      IF v_start_date < v_base_date THEN
         v_start_date := v_start_date + INTERVAL '1 year';
      END IF;
    ELSE
      -- Normal Offset (e.g. 14 days after trigger)
      v_start_date := v_base_date + (COALESCE(schedule.start_offset_days, 0) || ' days')::INTERVAL;
    END IF;

    -- 🧮 CALCULATE END DATE
    IF schedule.end_reference LIKE 'Seasonal: %' THEN
      v_season_end := RIGHT(schedule.end_reference, 5);
      v_year := EXTRACT(YEAR FROM v_start_date);
      v_end_date := TO_DATE(v_year::TEXT || '-' || v_season_end, 'YYYY-MM-DD');
      
      -- Handle Wrap-Around (e.g. Summer in Aus: Dec -> Feb is next year)
      IF v_end_date < v_start_date THEN
         v_end_date := v_end_date + INTERVAL '1 year';
      END IF;
    ELSIF schedule.end_offset_days IS NOT NULL THEN
      v_end_date := v_base_date + (schedule.end_offset_days || ' days')::INTERVAL;
    ELSE
      v_end_date := NULL;
    END IF;

    -- 🚀 INSERT THE CALCULATED BLUEPRINT
    INSERT INTO public.task_blueprints (
      home_id,
      title,
      description,
      task_type,
      location_id,
      area_id,
      inventory_item_id,
      frequency_days,
      is_recurring,
      start_date, -- 👈 The calculated start date!
      end_date    -- 👈 The calculated end date!
    ) VALUES (
      NEW.home_id,
      schedule.title,
      schedule.description,
      schedule.task_type,
      NEW.location_id,
      NEW.area_id,
      NEW.id,
      schedule.frequency_days,
      schedule.is_recurring,
      v_start_date,
      v_end_date
    );
  END LOOP;

  RETURN NEW;
END;
$function$
;

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";


  create policy "Users can update home notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((home_id IN ( SELECT user_profiles.home_id
   FROM public.user_profiles
  WHERE (user_profiles.uid = auth.uid()))));



  create policy "Users can view home notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((home_id IN ( SELECT user_profiles.home_id
   FROM public.user_profiles
  WHERE (user_profiles.uid = auth.uid()))));



