drop function if exists "public"."create_new_home"(home_name text, postcode text);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_new_home(
  home_name text,
  postcode text,
  country text DEFAULT NULL,
  timezone text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_home_id uuid;
BEGIN
  INSERT INTO homes (name, address, country, timezone)
  VALUES (home_name, postcode, country, timezone)
  RETURNING id INTO new_home_id;

  INSERT INTO home_members (home_id, user_id, role)
  VALUES (new_home_id, auth.uid(), 'owner');

  RETURN new_home_id;
END;
$function$
;
