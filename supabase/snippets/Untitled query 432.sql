-- 1. Drop the old function so Postgres doesn't get confused by the new argument
DROP FUNCTION IF EXISTS create_new_home(text);

-- 2. Create the upgraded function
CREATE OR REPLACE FUNCTION create_new_home(home_name text, postcode text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- 🚨 This is the magic word that bypasses RLS!
SET search_path = public
AS $$
DECLARE
  new_home_id uuid;
BEGIN
  -- A. Insert the new home with BOTH the name and the address (postcode)
  INSERT INTO homes (name, address)
  VALUES (home_name, postcode)
  RETURNING id INTO new_home_id;

  -- B. Automatically add the current user as a member of this new home
  -- (Note: If your table is named differently, like 'memberships', change it here!)
  INSERT INTO home_members (home_id, user_id, role)
  VALUES (new_home_id, auth.uid(), 'member');

  -- C. Return the new ID back to your React app
  RETURN new_home_id;
END;
$$;