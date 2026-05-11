-- Add first_name and last_name to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Update handle_new_user to read names from auth metadata on signup
-- and auto-populate display_name so the UI always has a name to show.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_first  text := trim(new.raw_user_meta_data->>'first_name');
  v_last   text := trim(new.raw_user_meta_data->>'last_name');
  v_display text;
BEGIN
  -- Build a display_name from the signup names when available
  IF v_first IS NOT NULL AND v_first <> '' THEN
    v_display := trim(v_first || ' ' || COALESCE(v_last, ''));
  END IF;

  INSERT INTO public.user_profiles (uid, email, first_name, last_name, display_name)
  VALUES (new.id, new.email, v_first, v_last, v_display);

  RETURN new;
END;
$function$;
