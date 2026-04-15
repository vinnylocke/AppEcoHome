
  create table "public"."plant_journals" (
    "id" uuid not null default gen_random_uuid(),
    "home_id" uuid,
    "inventory_item_id" uuid,
    "subject" text not null,
    "description" text,
    "image_url" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "task_id" uuid
      );


alter table "public"."plant_journals" enable row level security;

alter table "public"."plant_schedules" add column "is_auto_generated" boolean not null default false;

alter table "public"."plants" alter column "flowering_season" set default '[]'::jsonb;

alter table "public"."plants" alter column "flowering_season" set data type jsonb using "flowering_season"::jsonb;

alter table "public"."plants" alter column "harvest_season" set default '[]'::jsonb;

alter table "public"."plants" alter column "harvest_season" set data type jsonb using "harvest_season"::jsonb;

CREATE INDEX idx_plants_perenual_id ON public.plants USING btree (perenual_id);

CREATE UNIQUE INDEX plant_journals_pkey ON public.plant_journals USING btree (id);

alter table "public"."plant_journals" add constraint "plant_journals_pkey" PRIMARY KEY using index "plant_journals_pkey";

alter table "public"."plant_journals" add constraint "plant_journals_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."plant_journals" validate constraint "plant_journals_home_id_fkey";

alter table "public"."plant_journals" add constraint "plant_journals_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE not valid;

alter table "public"."plant_journals" validate constraint "plant_journals_inventory_item_id_fkey";

alter table "public"."plant_journals" add constraint "plant_journals_task_id_fkey" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL not valid;

alter table "public"."plant_journals" validate constraint "plant_journals_task_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_home_membership(target_home_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.home_members 
    WHERE home_id = target_home_id 
    AND user_id = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_home_bundle(user_id_input uuid, home_name_input text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_home_id UUID;
BEGIN
    -- 1. Create the Home
    INSERT INTO public.homes (name)
    VALUES (home_name_input)
    RETURNING id INTO new_home_id;

    -- 2. Add the creator as the 'owner'
    INSERT INTO public.home_members (home_id, user_id, role)
    VALUES (new_home_id, user_id_input, 'owner');

    -- 3. UPDATE THE PROFILE'S ACTIVE HOME (This was missing!)
    UPDATE public.user_profiles
    SET home_id = new_home_id, onboarded = true
    WHERE uid = user_id_input;

    RETURN new_home_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_home_entirely(home_id_param uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Security check: Ensure the caller is an owner
  IF EXISTS (
    SELECT 1 FROM home_members 
    WHERE home_id = home_id_param AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    DELETE FROM homes WHERE id = home_id_param;
    
    -- Clear anyone's active home who was in that home
    UPDATE user_profiles SET home_id = NULL WHERE home_id = home_id_param;
  ELSE
    RAISE EXCEPTION 'Only owners can delete a home.';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- We are ONLY inserting uid and email now. 
  -- No 'mode', no 'onboarded'.
  INSERT INTO public.user_profiles (uid, email)
  VALUES (new.id, new.email);
  
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_home_member(target_home_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.home_members 
    WHERE home_id = target_home_id AND user_id = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_member_of(h_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.home_members
    WHERE home_id = h_id 
    AND user_id = (SELECT auth.uid())
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.join_home_bundle(target_home_id uuid, target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Add to membership
    INSERT INTO public.home_members (home_id, user_id, role)
    VALUES (target_home_id, target_user_id, 'member')
    ON CONFLICT (home_id, user_id) DO NOTHING; -- Prevent double-joining

    -- Set as active home in profile
    UPDATE public.user_profiles
    SET home_id = target_home_id, onboarded = true
    WHERE uid = target_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_home(home_id_param uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  leaving_user_role text;
  remaining_member_count int;
  next_owner_id uuid;
  fallback_home_id uuid;
BEGIN
  -- 1. Capture the role before we delete the membership
  SELECT role INTO leaving_user_role 
  FROM home_members 
  WHERE home_id = home_id_param AND user_id = auth.uid();

  -- 2. Delete the membership record first
  DELETE FROM home_members 
  WHERE home_id = home_id_param AND user_id = auth.uid();

  -- 3. Check how many people are left now
  SELECT count(*) INTO remaining_member_count 
  FROM home_members 
  WHERE home_id = home_id_param;

  -- 4. DECISION TREE
  IF remaining_member_count = 0 THEN
    -- Nobody is left. Delete the home.
    DELETE FROM homes WHERE id = home_id_param;
  ELSIF leaving_user_role = 'owner' THEN
    -- People are left, but the owner just walked out. 
    -- We MUST promote the next person in line to owner.
    SELECT user_id INTO next_owner_id 
    FROM home_members 
    WHERE home_id = home_id_param 
    ORDER BY created_at ASC LIMIT 1;

    UPDATE home_members SET role = 'owner' WHERE home_id = home_id_param AND user_id = next_owner_id;
  END IF;

  -- 5. SMART SWITCH: Find the next available home for the user's profile
  SELECT home_id INTO fallback_home_id 
  FROM home_members 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  UPDATE user_profiles 
  SET home_id = fallback_home_id 
  WHERE uid = auth.uid();

  RETURN fallback_home_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_home_bundle(target_home_id uuid, target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Remove from membership
    DELETE FROM public.home_members 
    WHERE home_id = target_home_id AND user_id = target_user_id;

    -- Clear active home if it was this one
    UPDATE public.user_profiles
    SET home_id = NULL
    WHERE uid = target_user_id AND home_id = target_home_id;
END;
$function$
;

grant delete on table "public"."plant_journals" to "anon";

grant insert on table "public"."plant_journals" to "anon";

grant references on table "public"."plant_journals" to "anon";

grant select on table "public"."plant_journals" to "anon";

grant trigger on table "public"."plant_journals" to "anon";

grant truncate on table "public"."plant_journals" to "anon";

grant update on table "public"."plant_journals" to "anon";

grant delete on table "public"."plant_journals" to "authenticated";

grant insert on table "public"."plant_journals" to "authenticated";

grant references on table "public"."plant_journals" to "authenticated";

grant select on table "public"."plant_journals" to "authenticated";

grant trigger on table "public"."plant_journals" to "authenticated";

grant truncate on table "public"."plant_journals" to "authenticated";

grant update on table "public"."plant_journals" to "authenticated";

grant delete on table "public"."plant_journals" to "service_role";

grant insert on table "public"."plant_journals" to "service_role";

grant references on table "public"."plant_journals" to "service_role";

grant select on table "public"."plant_journals" to "service_role";

grant trigger on table "public"."plant_journals" to "service_role";

grant truncate on table "public"."plant_journals" to "service_role";

grant update on table "public"."plant_journals" to "service_role";


  create policy "Users can manage journals for their home"
  on "public"."plant_journals"
  as permissive
  for all
  to public
using ((home_id IN ( SELECT user_profiles.home_id
   FROM public.user_profiles
  WHERE (user_profiles.uid = auth.uid())
UNION
 SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));



