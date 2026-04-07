drop policy "authenticated_user_access" on "public"."inventory_items";

drop policy "Users can manage their own blueprints" on "public"."task_blueprints";

alter table "public"."doctor_history" drop constraint "doctor_history_inventory_item_id_fkey";

alter table "public"."inventory_items" drop constraint "fk_species_cache";

alter table "public"."task_blueprints" drop constraint "task_blueprints_inventory_item_id_fkey";

alter table "public"."tasks" drop constraint "tasks_inventory_item_id_fkey";


  create table "public"."plant_instances" (
    "id" uuid not null default gen_random_uuid(),
    "home_id" uuid,
    "plant_id" integer,
    "area_id" uuid,
    "quantity" integer default 1,
    "notes" text,
    "planted_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now()
      );


alter table "public"."plant_instances" enable row level security;

alter table "public"."areas" add column "growing_medium" text;

alter table "public"."areas" add column "light_intensity_lux" integer;

alter table "public"."areas" add column "medium_ph" numeric(3,1);

alter table "public"."areas" add column "medium_texture" text;

alter table "public"."areas" add column "nutrient_source" text;

alter table "public"."areas" add column "water_movement" text;

alter table "public"."inventory_items" add column "growth_state" text;

alter table "public"."inventory_items" alter column "area_id" set data type uuid using "area_id"::uuid;

alter table "public"."inventory_items" alter column "location_id" set data type uuid using "location_id"::uuid;

alter table "public"."inventory_items" alter column "plant_id" set data type integer using "plant_id"::integer;

alter table "public"."inventory_items" disable row level security;

alter table "public"."plants" add column "cones" boolean default false;

alter table "public"."plants" add column "cuisine" boolean default false;

alter table "public"."plants" add column "dimensions" jsonb default '{}'::jsonb;

alter table "public"."plants" add column "drought_tolerant" boolean default false;

alter table "public"."plants" add column "edible_leaf" boolean default false;

alter table "public"."plants" add column "flowering_season" text;

alter table "public"."plants" add column "flowers" boolean default false;

alter table "public"."plants" add column "fruits" boolean default false;

alter table "public"."plants" add column "growth_rate" text;

alter table "public"."plants" add column "harvest_season" text;

alter table "public"."plants" add column "home_id" uuid;

alter table "public"."plants" add column "indoor" boolean default false;

alter table "public"."plants" add column "invasive" boolean default false;

alter table "public"."plants" add column "is_archived" boolean default false;

alter table "public"."plants" add column "leaf" boolean default true;

alter table "public"."plants" add column "maintenance" text;

alter table "public"."plants" add column "medicinal" boolean default false;

alter table "public"."plants" add column "origin" jsonb default '[]'::jsonb;

alter table "public"."plants" add column "perenual_id" integer;

alter table "public"."plants" add column "pest_susceptibility" jsonb default '[]'::jsonb;

alter table "public"."plants" add column "propagation" jsonb default '[]'::jsonb;

alter table "public"."plants" add column "pruning_count" jsonb default '{}'::jsonb;

alter table "public"."plants" add column "pruning_month" jsonb default '[]'::jsonb;

alter table "public"."plants" add column "salt_tolerant" boolean default false;

alter table "public"."plants" add column "seeds" boolean default false;

alter table "public"."plants" add column "soil" jsonb default '[]'::jsonb;

alter table "public"."plants" add column "source" text default 'manual'::text;

alter table "public"."plants" add column "thorny" boolean default false;

alter table "public"."plants" add column "tropical" boolean default false;

alter table "public"."plants" add column "watering_max_days" integer;

alter table "public"."plants" add column "watering_min_days" integer;

CREATE UNIQUE INDEX plant_instances_pkey ON public.plant_instances USING btree (id);

alter table "public"."plant_instances" add constraint "plant_instances_pkey" PRIMARY KEY using index "plant_instances_pkey";

alter table "public"."areas" add constraint "check_ph_range" CHECK (((medium_ph >= (0)::numeric) AND (medium_ph <= (14)::numeric))) not valid;

alter table "public"."areas" validate constraint "check_ph_range";

alter table "public"."inventory_items" add constraint "check_growth_state" CHECK (((growth_state = ANY (ARRAY['Germination'::text, 'Seedling'::text, 'Vegetative'::text, 'Budding/Pre-Flowering'::text, 'Flowering/Bloom'::text, 'Fruiting/Pollination'::text, 'Ripening/Maturity'::text, 'Senescence'::text])) OR (growth_state IS NULL))) not valid;

alter table "public"."inventory_items" validate constraint "check_growth_state";

alter table "public"."inventory_items" add constraint "fk_inventory_area" FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_items" validate constraint "fk_inventory_area";

alter table "public"."inventory_items" add constraint "fk_inventory_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_items" validate constraint "fk_inventory_location";

alter table "public"."inventory_items" add constraint "fk_plants" FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_items" validate constraint "fk_plants";

alter table "public"."plant_instances" add constraint "plant_instances_area_id_fkey" FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE not valid;

alter table "public"."plant_instances" validate constraint "plant_instances_area_id_fkey";

alter table "public"."plant_instances" add constraint "plant_instances_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."plant_instances" validate constraint "plant_instances_home_id_fkey";

alter table "public"."plant_instances" add constraint "plant_instances_plant_id_fkey" FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE CASCADE not valid;

alter table "public"."plant_instances" validate constraint "plant_instances_plant_id_fkey";

alter table "public"."plants" add constraint "plants_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."plants" validate constraint "plants_home_id_fkey";

alter table "public"."plants" add constraint "plants_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'api'::text]))) not valid;

alter table "public"."plants" validate constraint "plants_source_check";

grant delete on table "public"."plant_instances" to "anon";

grant insert on table "public"."plant_instances" to "anon";

grant references on table "public"."plant_instances" to "anon";

grant select on table "public"."plant_instances" to "anon";

grant trigger on table "public"."plant_instances" to "anon";

grant truncate on table "public"."plant_instances" to "anon";

grant update on table "public"."plant_instances" to "anon";

grant delete on table "public"."plant_instances" to "authenticated";

grant insert on table "public"."plant_instances" to "authenticated";

grant references on table "public"."plant_instances" to "authenticated";

grant select on table "public"."plant_instances" to "authenticated";

grant trigger on table "public"."plant_instances" to "authenticated";

grant truncate on table "public"."plant_instances" to "authenticated";

grant update on table "public"."plant_instances" to "authenticated";

grant delete on table "public"."plant_instances" to "service_role";

grant insert on table "public"."plant_instances" to "service_role";

grant references on table "public"."plant_instances" to "service_role";

grant select on table "public"."plant_instances" to "service_role";

grant trigger on table "public"."plant_instances" to "service_role";

grant truncate on table "public"."plant_instances" to "service_role";

grant update on table "public"."plant_instances" to "service_role";


  create policy "Enable delete for instances"
  on "public"."plant_instances"
  as permissive
  for delete
  to public
using (true);



  create policy "Public Access"
  on "public"."plant_instances"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "Enable delete for users"
  on "public"."plants"
  as permissive
  for delete
  to public
using (true);



  create policy "Public Access"
  on "public"."plants"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "All Access for users"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'plant-images'::text))
with check ((bucket_id = 'plant-images'::text));



  create policy "Public Access"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'plant-images'::text));



