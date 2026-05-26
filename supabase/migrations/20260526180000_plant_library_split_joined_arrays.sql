-- Backfill: split comma-joined elements in plant_library jsonb arrays.
--
-- The AI seed pipeline occasionally returned single-element arrays
-- containing a comma-joined string (e.g. `["autumn,summer"]`) instead
-- of separate elements (`["autumn", "summer"]`). The seed prompt has
-- been strengthened and the insert path now guards against this via
-- `splitJoinedStringArray`, but existing rows need a one-time heal.
--
-- This migration is idempotent — running it on already-clean data is
-- a no-op. The temporary helper function is dropped after use.

CREATE OR REPLACE FUNCTION public.__split_joined_jsonb_array(input jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(piece ORDER BY ordinality, piece_ord),
    '[]'::jsonb
  )
  FROM (
    SELECT
      elem_ord  AS ordinality,
      piece_ord,
      trim(BOTH FROM piece) AS piece
    FROM jsonb_array_elements_text(input) WITH ORDINALITY AS e(elem, elem_ord),
    LATERAL unnest(string_to_array(elem, ',')) WITH ORDINALITY AS p(piece, piece_ord)
  ) sub
  WHERE piece <> '';
$$;

UPDATE plant_library SET
  scientific_name     = public.__split_joined_jsonb_array(scientific_name),
  sunlight            = public.__split_joined_jsonb_array(sunlight),
  attracts            = public.__split_joined_jsonb_array(attracts),
  origin              = public.__split_joined_jsonb_array(origin),
  flowering_season    = public.__split_joined_jsonb_array(flowering_season),
  harvest_season      = public.__split_joined_jsonb_array(harvest_season),
  pest_susceptibility = public.__split_joined_jsonb_array(pest_susceptibility),
  propagation         = public.__split_joined_jsonb_array(propagation),
  pruning_month       = public.__split_joined_jsonb_array(pruning_month),
  soil                = public.__split_joined_jsonb_array(soil)
WHERE
  -- Pre-filter so we only touch rows where at least one of the target
  -- columns has a comma in any element. Cheap and avoids rewriting 40k+
  -- rows when most are already clean.
  jsonb_path_exists(scientific_name,     '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(sunlight,         '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(attracts,         '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(origin,           '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(flowering_season, '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(harvest_season,   '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(pest_susceptibility, '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(propagation,      '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(pruning_month,    '$[*] ? (@ like_regex ",")')
  OR jsonb_path_exists(soil,             '$[*] ? (@ like_regex ",")');

DROP FUNCTION public.__split_joined_jsonb_array(jsonb);
