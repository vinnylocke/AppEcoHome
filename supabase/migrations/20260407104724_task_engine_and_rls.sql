drop policy "Allow public read access on species_cache" on "public"."species_cache";

drop policy "Manage species cache" on "public"."species_cache";

alter table "public"."inventory_items" drop constraint "inventory_items_status_check";

alter table "public"."tasks" drop constraint "tasks_type_check";

drop view if exists "public"."active_species_details";

drop index if exists "public"."species_cache_pkey";


  create table "public"."plant_schedules" (
    "id" uuid not null default gen_random_uuid(),
    "home_id" uuid,
    "plant_id" integer,
    "title" text not null,
    "description" text,
    "task_type" text not null,
    "trigger_event" text not null,
    "start_reference" text not null default 'Trigger Date'::text,
    "start_offset_days" integer not null default 0,
    "end_reference" text,
    "end_offset_days" integer,
    "is_recurring" boolean default true,
    "frequency_days" integer default 7,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."plant_schedules" enable row level security;

alter table "public"."inventory_items" alter column "status" set default 'Unplanted'::text;

alter table "public"."inventory_items" enable row level security;

alter table "public"."species_cache" drop column "care_level";

alter table "public"."species_cache" drop column "common_name";

alter table "public"."species_cache" drop column "created_at";

alter table "public"."species_cache" drop column "cycle";

alter table "public"."species_cache" drop column "description";

alter table "public"."species_cache" drop column "flowering_season";

alter table "public"."species_cache" drop column "fruiting_season";

alter table "public"."species_cache" drop column "growth_rate";

alter table "public"."species_cache" drop column "image_url";

alter table "public"."species_cache" drop column "pruning_month";

alter table "public"."species_cache" drop column "scientific_name";

alter table "public"."species_cache" drop column "sunlight";

alter table "public"."species_cache" drop column "watering_freq";

alter table "public"."species_cache" add column "raw_data" jsonb not null;

alter table "public"."species_cache" add column "updated_at" timestamp with time zone default now();

alter table "public"."species_cache" alter column "id" set data type integer using "id"::integer;

alter table "public"."task_blueprints" drop column "start_month";

alter table "public"."task_blueprints" add column "area_id" uuid;

alter table "public"."task_blueprints" add column "created_at" timestamp with time zone default now();

alter table "public"."task_blueprints" add column "description" text;

alter table "public"."task_blueprints" add column "end_date" date;

alter table "public"."task_blueprints" add column "home_id" uuid;

alter table "public"."task_blueprints" add column "location_id" uuid;

alter table "public"."task_blueprints" add column "start_date" date;

alter table "public"."task_blueprints" add column "title" text not null default 'Untitled Task'::text;

alter table "public"."tasks" add column "area_id" uuid;

alter table "public"."tasks" add column "blueprint_id" uuid;

alter table "public"."tasks" add column "location_id" uuid;

alter table "public"."tasks" alter column "due_date" set data type date using "due_date"::date;

alter table "public"."user_profiles" add column "enable_perenual" boolean default false;

CREATE UNIQUE INDEX plant_schedules_pkey ON public.plant_schedules USING btree (id);

CREATE UNIQUE INDEX unique_blueprint_date ON public.tasks USING btree (blueprint_id, due_date);

CREATE UNIQUE INDEX species_cache_pkey ON public.species_cache USING btree (id);

alter table "public"."plant_schedules" add constraint "plant_schedules_pkey" PRIMARY KEY using index "plant_schedules_pkey";

alter table "public"."plant_schedules" add constraint "plant_schedules_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."plant_schedules" validate constraint "plant_schedules_home_id_fkey";

alter table "public"."plant_schedules" add constraint "plant_schedules_plant_id_fkey" FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE CASCADE not valid;

alter table "public"."plant_schedules" validate constraint "plant_schedules_plant_id_fkey";

alter table "public"."plant_schedules" add constraint "plant_schedules_trigger_event_check" CHECK ((trigger_event = ANY (ARRAY['Added to Area'::text, 'Planted'::text, 'Potted'::text, 'Moved Outside'::text]))) not valid;

alter table "public"."plant_schedules" validate constraint "plant_schedules_trigger_event_check";

alter table "public"."task_blueprints" add constraint "task_blueprints_area_id_fkey" FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL not valid;

alter table "public"."task_blueprints" validate constraint "task_blueprints_area_id_fkey";

alter table "public"."task_blueprints" add constraint "task_blueprints_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."task_blueprints" validate constraint "task_blueprints_home_id_fkey";

alter table "public"."task_blueprints" add constraint "task_blueprints_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE not valid;

alter table "public"."task_blueprints" validate constraint "task_blueprints_inventory_item_id_fkey";

alter table "public"."task_blueprints" add constraint "task_blueprints_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL not valid;

alter table "public"."task_blueprints" validate constraint "task_blueprints_location_id_fkey";

alter table "public"."tasks" add constraint "tasks_area_id_fkey" FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL not valid;

alter table "public"."tasks" validate constraint "tasks_area_id_fkey";

alter table "public"."tasks" add constraint "tasks_blueprint_id_fkey" FOREIGN KEY (blueprint_id) REFERENCES public.task_blueprints(id) ON DELETE CASCADE not valid;

alter table "public"."tasks" validate constraint "tasks_blueprint_id_fkey";

alter table "public"."tasks" add constraint "tasks_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE not valid;

alter table "public"."tasks" validate constraint "tasks_inventory_item_id_fkey";

alter table "public"."tasks" add constraint "tasks_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL not valid;

alter table "public"."tasks" validate constraint "tasks_location_id_fkey";

alter table "public"."tasks" add constraint "unique_blueprint_date" UNIQUE using index "unique_blueprint_date";

alter table "public"."inventory_items" add constraint "inventory_items_status_check" CHECK ((status = ANY (ARRAY['Unplanted'::text, 'Planted'::text]))) not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_status_check";

alter table "public"."tasks" add constraint "tasks_type_check" CHECK ((type = ANY (ARRAY['Planting'::text, 'Watering'::text, 'Harvesting'::text, 'Maintenance'::text, 'Plant'::text, 'Water'::text, 'Harvest'::text]))) not valid;

alter table "public"."tasks" validate constraint "tasks_type_check";

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

grant delete on table "public"."plant_schedules" to "anon";

grant insert on table "public"."plant_schedules" to "anon";

grant references on table "public"."plant_schedules" to "anon";

grant select on table "public"."plant_schedules" to "anon";

grant trigger on table "public"."plant_schedules" to "anon";

grant truncate on table "public"."plant_schedules" to "anon";

grant update on table "public"."plant_schedules" to "anon";

grant delete on table "public"."plant_schedules" to "authenticated";

grant insert on table "public"."plant_schedules" to "authenticated";

grant references on table "public"."plant_schedules" to "authenticated";

grant select on table "public"."plant_schedules" to "authenticated";

grant trigger on table "public"."plant_schedules" to "authenticated";

grant truncate on table "public"."plant_schedules" to "authenticated";

grant update on table "public"."plant_schedules" to "authenticated";

grant delete on table "public"."plant_schedules" to "service_role";

grant insert on table "public"."plant_schedules" to "service_role";

grant references on table "public"."plant_schedules" to "service_role";

grant select on table "public"."plant_schedules" to "service_role";

grant trigger on table "public"."plant_schedules" to "service_role";

grant truncate on table "public"."plant_schedules" to "service_role";

grant update on table "public"."plant_schedules" to "service_role";


  create policy "Users can manage their home's inventory"
  on "public"."inventory_items"
  as permissive
  for all
  to authenticated
using ((home_id IN ( SELECT user_profiles.home_id
   FROM public.user_profiles
  WHERE (user_profiles.uid = auth.uid()))));



  create policy "Users can manage plant schedules"
  on "public"."plant_schedules"
  as permissive
  for all
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Authenticated users can modify cache"
  on "public"."species_cache"
  as permissive
  for update
  to authenticated
using (true);



  create policy "Authenticated users can read cache"
  on "public"."species_cache"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Authenticated users can update cache"
  on "public"."species_cache"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Users can delete their home blueprints"
  on "public"."task_blueprints"
  as permissive
  for delete
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can insert their home blueprints"
  on "public"."task_blueprints"
  as permissive
  for insert
  to public
with check ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can update their home blueprints"
  on "public"."task_blueprints"
  as permissive
  for update
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can view their home blueprints"
  on "public"."task_blueprints"
  as permissive
  for select
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can delete their home tasks"
  on "public"."tasks"
  as permissive
  for delete
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can insert their home tasks"
  on "public"."tasks"
  as permissive
  for insert
  to public
with check ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can update their home tasks"
  on "public"."tasks"
  as permissive
  for update
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



  create policy "Users can view their home tasks"
  on "public"."tasks"
  as permissive
  for select
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));


CREATE TRIGGER run_plant_schedules AFTER INSERT OR UPDATE OF status ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.trigger_plant_schedules();


