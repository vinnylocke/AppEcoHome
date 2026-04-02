drop function if exists "public"."create_new_home"(home_name text);

alter table "public"."areas" drop column "is_outside";

alter table "public"."locations" add column "is_outside" boolean not null default true;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_new_home(home_name text, postcode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_home_id uuid;
BEGIN
  -- A. Insert the new home
  INSERT INTO homes (name, address)
  VALUES (home_name, postcode)
  RETURNING id INTO new_home_id;

  -- B. Automatically add the current user as the OWNER
  INSERT INTO home_members (home_id, user_id, role)
  VALUES (new_home_id, auth.uid(), 'owner');

  -- C. Return the new ID back to your React app
  RETURN new_home_id;
END;
$function$
;


