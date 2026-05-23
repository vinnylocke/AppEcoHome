-- Plant Library — random-sample RPC for the seeder's avoid list
--
-- PostgREST doesn't expose `ORDER BY random()` via .order(), so the
-- seeder used to walk the table in recency-first order — fine when
-- the library was small, but at thousands of rows it meant the AI
-- only saw the most recent slice and kept re-proposing common
-- plants seeded early.
--
-- This RPC returns a uniformly random sample of `scientific_name_key`
-- + `common_name`, called from the seeder's `backgroundSeed` to
-- build the avoid list. Cheap at our scale (`ORDER BY random()` on
-- a few thousand rows is fast); we'll revisit with TABLESAMPLE if
-- the table grows past ~100k.

CREATE OR REPLACE FUNCTION public.plant_library_random_avoid_sample(sample_size int)
RETURNS TABLE (scientific_name_key text, common_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT scientific_name_key, common_name
  FROM public.plant_library
  WHERE scientific_name_key IS NOT NULL
  ORDER BY random()
  LIMIT sample_size;
$$;

COMMENT ON FUNCTION public.plant_library_random_avoid_sample(int) IS
  'Random sample of plant_library entries for the seeder''s avoid list. Replaces a recency-first ORDER BY which biased toward late-seeded entries.';

GRANT EXECUTE ON FUNCTION public.plant_library_random_avoid_sample(int) TO service_role;
