-- Ordering-bug catch-up migration v2.
--
-- Five earlier migrations referenced tables/views that are created in LATER
-- chronological migrations. On a fresh `supabase db reset` they crashed
-- because their dependency objects did not exist yet:
--
--   • 20260525120000_plant_library_search_extensions.sql
--       → needs `plant_library` (created in 20260624000900_plant_library.sql)
--   • 20260526120000_automations_heat_trigger.sql
--       → needs `automations`    (created in 20260530000000_automations.sql)
--   • 20260526180000_plant_library_split_joined_arrays.sql
--       → needs `plant_library`  (created in 20260624000900_plant_library.sql)
--   • 20260527230000_seed_packets_view_security_invoker.sql
--       → needs the view `seed_packets_with_germination`
--         (created in 20260624000500_nursery.sql)
--   • 20260527230100_plan_overhaul_inputs_annotated_photo.sql
--       → needs `plan_overhaul_inputs`
--         (created in 20260625000000_planner_garden_overhaul.sql)
--
-- All five migration files have been stubbed to no-ops; this catch-up runs
-- after every dependency exists and applies the work idempotently.
--
-- On an existing remote DB where the originals ran successfully in commit
-- order, every operation below is a no-op:
--   • CREATE EXTENSION IF NOT EXISTS
--   • CREATE INDEX IF NOT EXISTS
--   • CREATE OR REPLACE FUNCTION
--   • ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   • The backfill UPDATE filters to comma-joined rows only — 0 matches on
--     databases that already ran the original.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. plant_library search extensions (from 20260525120000)
-- ──────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'plant_library'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'plant_library'
       AND column_name = 'search_text'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS plant_library_search_text_trgm_idx
             ON plant_library USING GIN (search_text gin_trgm_ops)';
  END IF;
END $$;

-- search_plant_library_relevance — exact → prefix → contains → similarity
DO $wrap$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'plant_library'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.search_plant_library_relevance(
        p_query     TEXT,
        p_page_size INT DEFAULT 10,
        p_offset    INT DEFAULT 0
      )
      RETURNS TABLE(
        row_data    plant_library,
        rank        INT,
        similarity_score REAL,
        total_count BIGINT
      )
      LANGUAGE sql
      STABLE
      SECURITY INVOKER
      SET search_path = public
      AS $body$
        WITH q AS (
          SELECT lower(trim(p_query)) AS qtext
        ),
        scored AS (
          SELECT
            pl,
            CASE
              WHEN lower(pl.common_name) = q.qtext                              THEN 0
              WHEN lower(pl.common_name) LIKE q.qtext || '%'                    THEN 1
              WHEN pl.search_text LIKE '%' || q.qtext || '%'                    THEN 2
              ELSE                                                                   3
            END AS rank,
            similarity(pl.search_text, q.qtext) AS similarity_score
          FROM plant_library pl
          CROSS JOIN q
          WHERE
            pl.search_text LIKE '%' || q.qtext || '%'
            OR pl.search_text % q.qtext
        ),
        ordered AS (
          SELECT
            pl AS row_data,
            rank,
            similarity_score,
            COUNT(*) OVER () AS total_count
          FROM scored
          ORDER BY
            rank ASC,
            similarity_score DESC NULLS LAST,
            (pl).common_name ASC
          LIMIT p_page_size
          OFFSET p_offset
        )
        SELECT row_data, rank, similarity_score, total_count FROM ordered;
      $body$;
    $fn$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_plant_library_relevance(TEXT, INT, INT) TO authenticated';
  END IF;
END $wrap$;

-- search_plant_library_fuzzy — trigram similarity ranking only
DO $wrap$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'plant_library'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.search_plant_library_fuzzy(
        p_query          TEXT,
        p_page_size      INT  DEFAULT 10,
        p_offset         INT  DEFAULT 0,
        p_min_similarity REAL DEFAULT 0.1
      )
      RETURNS TABLE(
        row_data    plant_library,
        similarity_score REAL,
        total_count BIGINT
      )
      LANGUAGE sql
      STABLE
      SECURITY INVOKER
      SET search_path = public
      AS $body$
        WITH q AS (
          SELECT lower(trim(p_query)) AS qtext
        ),
        scored AS (
          SELECT
            pl,
            similarity(pl.search_text, q.qtext) AS similarity_score
          FROM plant_library pl
          CROSS JOIN q
          WHERE
            similarity(pl.search_text, q.qtext) >= p_min_similarity
        ),
        ordered AS (
          SELECT
            pl AS row_data,
            similarity_score,
            COUNT(*) OVER () AS total_count
          FROM scored
          ORDER BY
            similarity_score DESC,
            (pl).common_name ASC
          LIMIT p_page_size
          OFFSET p_offset
        )
        SELECT row_data, similarity_score, total_count FROM ordered;
      $body$;
    $fn$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_plant_library_fuzzy(TEXT, INT, INT, REAL) TO authenticated';
  END IF;
END $wrap$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. automations weather-aware heat trigger (from 20260526120000)
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'automations'
  ) THEN
    ALTER TABLE automations
      ADD COLUMN IF NOT EXISTS trigger_if_hot   boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS heat_threshold_c numeric NOT NULL DEFAULT 28;

    COMMENT ON COLUMN automations.trigger_if_hot IS
      'When true, run-automations fires this automation at its scheduled_time on days where the forecast max temp is >= heat_threshold_c, even when no controlling task is due that day. Rain-skip still wins if both conditions are met.';

    COMMENT ON COLUMN automations.heat_threshold_c IS
      'Forecast max temperature (°C) above which trigger_if_hot fires. Compared against weather_snapshots.data->>daily.temperature_2m_max[today_idx].';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. plant_library comma-joined jsonb array backfill (from 20260526180000)
-- ──────────────────────────────────────────────────────────────────────────
--
-- Idempotent: the WHERE clause filters to rows that still contain a comma
-- inside any element of the targeted jsonb arrays. On databases where the
-- original migration ran, that filter matches zero rows. The temporary
-- helper function is dropped immediately after the UPDATE.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'plant_library'
  ) THEN
    CREATE OR REPLACE FUNCTION public.__split_joined_jsonb_array(input jsonb)
    RETURNS jsonb
    LANGUAGE sql
    IMMUTABLE
    AS $body$
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
    $body$;

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
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. seed_packets_with_germination view: security_invoker (from 20260527230000)
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = 'seed_packets_with_germination'
  ) THEN
    ALTER VIEW public.seed_packets_with_germination SET (security_invoker = true);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. plan_overhaul_inputs.annotated_photo_url (from 20260527230100)
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'plan_overhaul_inputs'
  ) THEN
    ALTER TABLE plan_overhaul_inputs
      ADD COLUMN IF NOT EXISTS annotated_photo_url text;

    COMMENT ON COLUMN plan_overhaul_inputs.annotated_photo_url IS
      'Signed URL of the photo with user-drawn highlight strokes baked in. Null when the user did not annotate. When set, this is the image fed to gemini-2.5-flash-image instead of original_photo_url.';
  END IF;
END $$;
